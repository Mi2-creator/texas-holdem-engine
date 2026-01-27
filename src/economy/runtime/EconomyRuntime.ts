/**
 * EconomyRuntime.ts
 * Phase 20 - Main integration layer for economy operations
 *
 * Provides:
 * - Clean integration with GameService without polluting pure reducers
 * - Atomic financial operations with rollback support
 * - Deterministic settlement with rake integration
 * - Financial safety guarantees
 * - Persistence and idempotent recovery
 */

import { PlayerId } from '../../security/Identity';
import { TableId, HandId } from '../../security/AuditLog';
import { Street } from '../../game/engine/TableState';
import { BalanceManager, PlayerBalance, getBalanceManager, resetBalanceManager } from '../Balance';
import { EscrowManager, TableEscrow, getEscrowManager, resetEscrowManager } from '../Escrow';
import { PotManager, PotBuilder, getPotManager, resetPotManager } from '../Pot';
import { LedgerManager, LedgerEntryType, getLedgerManager, resetLedgerManager } from '../Ledger';
import { EconomyConfig, DEFAULT_ECONOMY_CONFIG } from '../config/EconomyConfig';
import { RakeEvaluation } from '../config/RakePolicy';
import { EconomyErrors } from '../EconomyErrors';
import {
  EconomyRuntimeConfig,
  DEFAULT_RUNTIME_CONFIG,
  SettlementRequest,
  SettlementOutcome,
  PlayerSettlementState,
  EconomySnapshot,
  EconomyRecoveryResult,
  InvariantResult,
  EconomyEvent,
  EconomyEventType,
  generateIdempotencyKey,
} from './RuntimeTypes';
import { TransactionManager, TransactionBuilder, createTransactionManager } from './TransactionManager';
import { SettlementEngine, createSettlementEngine } from './SettlementEngine';
import { EconomyPersistence, createEconomyPersistence } from './EconomyPersistence';

// ============================================================================
// EconomyRuntime Configuration
// ============================================================================

export interface EconomyRuntimeOptions {
  readonly config?: Partial<EconomyRuntimeConfig>;
  readonly economyConfig?: EconomyConfig;
  readonly balanceManager?: BalanceManager;
  readonly escrowManager?: EscrowManager;
  readonly potManager?: PotManager;
  readonly ledgerManager?: LedgerManager;
}

// ============================================================================
// EconomyRuntime Implementation
// ============================================================================

export class EconomyRuntime {
  private readonly config: EconomyRuntimeConfig;
  private readonly economyConfig: EconomyConfig;
  private readonly balanceManager: BalanceManager;
  private readonly escrowManager: EscrowManager;
  private readonly potManager: PotManager;
  private readonly ledgerManager: LedgerManager;
  private readonly transactionManager: TransactionManager;
  private readonly settlementEngine: SettlementEngine;
  private readonly persistence: EconomyPersistence;
  private readonly eventHandlers: ((event: EconomyEvent) => void)[];
  private readonly activeHands: Map<HandId, HandRuntimeState>;

  constructor(options: EconomyRuntimeOptions = {}) {
    this.config = { ...DEFAULT_RUNTIME_CONFIG, ...options.config };
    this.economyConfig = options.economyConfig ?? DEFAULT_ECONOMY_CONFIG;

    // Initialize managers
    this.balanceManager = options.balanceManager ?? getBalanceManager();
    this.escrowManager = options.escrowManager ?? getEscrowManager();
    this.potManager = options.potManager ?? getPotManager();
    this.ledgerManager = options.ledgerManager ?? getLedgerManager();

    // Create transaction manager
    this.transactionManager = createTransactionManager(
      this.balanceManager,
      this.escrowManager,
      this.config
    );

    // Create settlement engine
    this.settlementEngine = createSettlementEngine(
      this.escrowManager,
      this.transactionManager,
      this.economyConfig
    );

    // Create persistence
    this.persistence = createEconomyPersistence(
      this.balanceManager,
      this.escrowManager,
      this.ledgerManager
    );

    this.eventHandlers = [];
    this.activeHands = new Map();
  }

  // ==========================================================================
  // Player Management
  // ==========================================================================

  /**
   * Initialize a player with starting balance
   */
  initializePlayer(playerId: PlayerId, initialBalance: number): PlayerBalance {
    if (this.balanceManager.hasBalance(playerId)) {
      return this.balanceManager.getBalance(playerId);
    }

    const balance = this.balanceManager.createBalance(playerId, initialBalance);
    this.ledgerManager.setInitialBalance(playerId, initialBalance);

    return balance;
  }

  /**
   * Get player balance
   */
  getPlayerBalance(playerId: PlayerId): PlayerBalance | null {
    return this.balanceManager.getBalanceOrNull(playerId);
  }

  /**
   * Get player's available balance
   */
  getAvailableBalance(playerId: PlayerId): number {
    const balance = this.balanceManager.getBalanceOrNull(playerId);
    return balance?.available ?? 0;
  }

  /**
   * Credit chips to player (e.g., deposit, bonus)
   */
  creditPlayer(playerId: PlayerId, amount: number, reason: string): PlayerBalance {
    const balance = this.balanceManager.credit(playerId, amount);

    this.ledgerManager.record({
      type: LedgerEntryType.DEPOSIT,
      playerId,
      amount,
      reason,
      balanceAfter: balance.available,
    });

    return balance;
  }

  /**
   * Debit chips from player (e.g., withdrawal)
   */
  debitPlayer(playerId: PlayerId, amount: number, reason: string): PlayerBalance {
    const balance = this.balanceManager.debit(playerId, amount);

    this.ledgerManager.record({
      type: LedgerEntryType.WITHDRAWAL,
      playerId,
      amount: -amount,
      reason,
      balanceAfter: balance.available,
    });

    return balance;
  }

  // ==========================================================================
  // Table Operations
  // ==========================================================================

  /**
   * Player buys into a table
   */
  buyIn(tableId: TableId, playerId: PlayerId, amount: number): {
    success: boolean;
    stack: number;
    error?: string;
  } {
    try {
      // Verify player can afford buy-in
      if (!this.balanceManager.canAfford(playerId, amount)) {
        return {
          success: false,
          stack: 0,
          error: 'Insufficient balance for buy-in',
        };
      }

      // Execute buy-in transaction
      const transaction = this.transactionManager.beginTransaction(undefined, tableId);
      transaction.buyIn(tableId, playerId, amount);
      const result = transaction.commit();

      if (!result.success) {
        return {
          success: false,
          stack: 0,
          error: result.error,
        };
      }

      const stack = this.escrowManager.getStack(tableId, playerId);

      // Record in ledger
      const balance = this.balanceManager.getBalance(playerId);
      this.ledgerManager.recordBuyIn(playerId, amount, tableId, balance.available);

      return { success: true, stack };
    } catch (error) {
      return {
        success: false,
        stack: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Player cashes out from a table
   */
  cashOut(tableId: TableId, playerId: PlayerId, amount?: number): {
    success: boolean;
    cashOutAmount: number;
    error?: string;
  } {
    try {
      const escrow = this.escrowManager.getEscrow(tableId, playerId);
      if (!escrow) {
        return {
          success: false,
          cashOutAmount: 0,
          error: 'No escrow found for player at table',
        };
      }

      // Cannot cash out committed chips
      if (escrow.committed > 0) {
        return {
          success: false,
          cashOutAmount: 0,
          error: 'Cannot cash out while chips are committed to pot',
        };
      }

      const cashOutAmount = amount ?? escrow.stack;

      // Execute cash-out transaction
      const transaction = this.transactionManager.beginTransaction(undefined, tableId);
      transaction.cashOut(tableId, playerId, cashOutAmount);
      const result = transaction.commit();

      if (!result.success) {
        return {
          success: false,
          cashOutAmount: 0,
          error: result.error,
        };
      }

      // Record in ledger
      const balance = this.balanceManager.getBalance(playerId);
      this.ledgerManager.recordCashOut(playerId, cashOutAmount, tableId, balance.available);

      return { success: true, cashOutAmount };
    } catch (error) {
      return {
        success: false,
        cashOutAmount: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get player's stack at a table
   */
  getStack(tableId: TableId, playerId: PlayerId): number {
    return this.escrowManager.getStack(tableId, playerId);
  }

  // ==========================================================================
  // Hand Operations
  // ==========================================================================

  /**
   * Start a new hand
   */
  startHand(handId: HandId, tableId: TableId): void {
    // Create pot for this hand
    this.potManager.createPot(handId, tableId);

    // Track hand state
    this.activeHands.set(handId, {
      handId,
      tableId,
      contributions: new Map(),
      isSettled: false,
    });

    this.emitEvent('settlement_started', { handId, tableId });
  }

  /**
   * Post blinds
   */
  postBlinds(
    handId: HandId,
    tableId: TableId,
    blinds: readonly { playerId: PlayerId; amount: number; type: 'small' | 'big' }[]
  ): void {
    const pot = this.potManager.requirePot(handId);
    const handState = this.activeHands.get(handId);

    for (const blind of blinds) {
      // Commit chips from escrow
      this.escrowManager.commitChips(tableId, blind.playerId, blind.amount);
      this.escrowManager.moveToPot(tableId, blind.playerId, blind.amount);

      // Record in pot
      pot.postBlind(blind.playerId, blind.amount);

      // Track contribution
      if (handState) {
        const current = handState.contributions.get(blind.playerId) ?? 0;
        handState.contributions.set(blind.playerId, current + blind.amount);
      }

      // Record in ledger
      const escrow = this.escrowManager.getEscrow(tableId, blind.playerId);
      this.ledgerManager.recordBlind(
        blind.playerId,
        blind.amount,
        blind.type,
        handId,
        tableId,
        escrow?.stack ?? 0
      );
    }
  }

  /**
   * Record a betting action
   */
  recordAction(
    handId: HandId,
    tableId: TableId,
    playerId: PlayerId,
    actionType: 'bet' | 'call' | 'raise' | 'all-in',
    amount: number,
    street: Street
  ): void {
    const pot = this.potManager.requirePot(handId);
    const handState = this.activeHands.get(handId);

    // Commit chips from escrow
    this.escrowManager.commitChips(tableId, playerId, amount);
    this.escrowManager.moveToPot(tableId, playerId, amount);

    // Record in pot
    pot.recordBet(playerId, amount, street);

    // Track contribution
    if (handState) {
      const current = handState.contributions.get(playerId) ?? 0;
      handState.contributions.set(playerId, current + amount);
    }

    // Record in ledger
    const escrow = this.escrowManager.getEscrow(tableId, playerId);
    const ledgerType = actionType === 'call' ? LedgerEntryType.CALL :
                       actionType === 'raise' ? LedgerEntryType.RAISE :
                       actionType === 'all-in' ? LedgerEntryType.ALL_IN :
                       LedgerEntryType.BET;

    this.ledgerManager.record({
      type: ledgerType,
      playerId,
      amount: -amount,
      reason: `${actionType} on ${street}`,
      handId,
      tableId,
      balanceAfter: escrow?.stack ?? 0,
      metadata: { street, actionType },
    });
  }

  /**
   * Mark a player as folded
   */
  playerFolded(handId: HandId, playerId: PlayerId): void {
    const pot = this.potManager.getPot(handId);
    pot?.playerFolded(playerId);
  }

  // ==========================================================================
  // Settlement
  // ==========================================================================

  /**
   * Settle a hand
   */
  settleHand(request: SettlementRequest): SettlementOutcome {
    const { handId, tableId } = request;

    // Check if already settled (idempotency)
    if (this.settlementEngine.isSettlementProcessed(handId, tableId)) {
      const existing = this.settlementEngine.getSettlement(handId, tableId);
      if (existing) {
        return existing;
      }
    }

    // Perform settlement
    const outcome = this.settlementEngine.settleHand(request);

    // Record in ledger
    for (const [playerId, payout] of outcome.playerPayouts) {
      if (payout > 0) {
        const escrow = this.escrowManager.getEscrow(tableId, playerId);
        const isSplit = outcome.playerPayouts.size > 1 ||
                       outcome.sidePots.some(sp => sp.winners.length > 1);

        this.ledgerManager.recordPotWin(
          playerId,
          payout,
          handId,
          tableId,
          escrow?.stack ?? 0,
          isSplit
        );
      }
    }

    // Record rake
    if (outcome.rakeCollected > 0) {
      this.ledgerManager.recordRake(
        'rake_account',
        outcome.rakeCollected,
        handId,
        tableId
      );
    }

    // Record settlement
    this.persistence.recordSettlement(
      outcome.settlementId,
      handId,
      tableId,
      outcome.totalPot,
      outcome.rakeCollected,
      outcome.playerPayouts
    );

    // Mark hand as settled
    const handState = this.activeHands.get(handId);
    if (handState) {
      handState.isSettled = true;
    }

    // Verify invariants
    if (this.config.enableInvariantChecks) {
      const invariants = this.persistence.verifyInvariants();
      for (const result of invariants) {
        if (!result.valid) {
          this.persistence.recordViolation(result, { handId, tableId });
        }
      }
    }

    this.emitEvent('settlement_completed', {
      handId,
      tableId,
      totalPot: outcome.totalPot,
      rakeCollected: outcome.rakeCollected,
    });

    return outcome;
  }

  /**
   * Settle an uncontested pot
   */
  settleUncontested(
    handId: HandId,
    tableId: TableId,
    winnerId: PlayerId,
    potTotal: number,
    finalStreet: Street,
    flopSeen: boolean
  ): SettlementOutcome {
    const outcome = this.settlementEngine.settleUncontested(
      handId,
      tableId,
      winnerId,
      potTotal,
      finalStreet,
      flopSeen
    );

    this.emitEvent('settlement_completed', {
      handId,
      tableId,
      totalPot: outcome.totalPot,
      rakeCollected: outcome.rakeCollected,
    });

    return outcome;
  }

  /**
   * Preview settlement without executing
   */
  previewSettlement(request: SettlementRequest): {
    sidePots: readonly { amount: number; eligiblePlayers: readonly PlayerId[] }[];
    rake: RakeEvaluation;
    estimatedPayouts: Map<PlayerId, number>;
  } {
    const playerStates = request.playerStates;
    const sidePotResult = this.settlementEngine.previewSidePots(playerStates);

    const rakeEvaluation = this.settlementEngine.previewRake(
      sidePotResult.totalAmount,
      request.finalStreet,
      request.flopSeen,
      request.isUncontested,
      request.playersInHand,
      request.playersAtShowdown
    );

    return {
      sidePots: sidePotResult.pots.map(p => ({
        amount: p.amount,
        eligiblePlayers: [...p.eligiblePlayers],
      })),
      rake: rakeEvaluation,
      estimatedPayouts: new Map(), // Would need winner rankings to calculate
    };
  }

  // ==========================================================================
  // Persistence & Recovery
  // ==========================================================================

  /**
   * Create a snapshot of current economy state
   */
  createSnapshot(): EconomySnapshot {
    return this.persistence.createSnapshot();
  }

  /**
   * Recover from a snapshot
   */
  recoverFromSnapshot(snapshot: EconomySnapshot): EconomyRecoveryResult {
    this.emitEvent('recovery_started', { snapshotId: snapshot.snapshotId });

    const result = this.persistence.recoverFromSnapshot(snapshot);

    this.emitEvent('recovery_completed', {
      success: result.success,
      balancesRecovered: result.balancesRecovered,
      escrowsRecovered: result.escrowsRecovered,
    });

    return result;
  }

  /**
   * Get the latest snapshot
   */
  getLatestSnapshot(): EconomySnapshot | null {
    return this.persistence.getLatestSnapshot();
  }

  // ==========================================================================
  // Invariant Verification
  // ==========================================================================

  /**
   * Verify all financial invariants
   */
  verifyInvariants(): readonly InvariantResult[] {
    return this.persistence.verifyInvariants();
  }

  /**
   * Check if settlement was already processed (idempotency)
   */
  isSettlementProcessed(handId: HandId, tableId: TableId): boolean {
    return this.persistence.isSettlementProcessed(handId, tableId);
  }

  // ==========================================================================
  // Event System
  // ==========================================================================

  /**
   * Register event handler
   */
  onEvent(handler: (event: EconomyEvent) => void): () => void {
    this.eventHandlers.push(handler);
    return () => {
      const index = this.eventHandlers.indexOf(handler);
      if (index >= 0) {
        this.eventHandlers.splice(index, 1);
      }
    };
  }

  /**
   * Emit an event
   */
  private emitEvent(type: EconomyEventType, data: Record<string, unknown>): void {
    const event: EconomyEvent = {
      type,
      timestamp: Date.now(),
      data,
    };

    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (error) {
        console.error('Economy event handler error:', error);
      }
    }
  }

  // ==========================================================================
  // Utilities
  // ==========================================================================

  /**
   * Get pot total for a hand
   */
  getPotTotal(handId: HandId): number {
    return this.potManager.getPotTotal(handId);
  }

  /**
   * Get managers (for testing)
   */
  getManagers(): {
    balance: BalanceManager;
    escrow: EscrowManager;
    pot: PotManager;
    ledger: LedgerManager;
    transaction: TransactionManager;
    settlement: SettlementEngine;
    persistence: EconomyPersistence;
  } {
    return {
      balance: this.balanceManager,
      escrow: this.escrowManager,
      pot: this.potManager,
      ledger: this.ledgerManager,
      transaction: this.transactionManager,
      settlement: this.settlementEngine,
      persistence: this.persistence,
    };
  }

  /**
   * Get configuration
   */
  getConfig(): EconomyRuntimeConfig {
    return { ...this.config };
  }

  /**
   * Clear all state (for testing)
   */
  clear(): void {
    this.balanceManager.clear();
    this.escrowManager.clear();
    this.potManager.clear();
    this.ledgerManager.clear();
    this.transactionManager.clear();
    this.settlementEngine.clear();
    this.persistence.clear();
    this.activeHands.clear();
  }
}

// ============================================================================
// Hand Runtime State
// ============================================================================

interface HandRuntimeState {
  readonly handId: HandId;
  readonly tableId: TableId;
  readonly contributions: Map<PlayerId, number>;
  isSettled: boolean;
}

// ============================================================================
// Factory Functions
// ============================================================================

export function createEconomyRuntime(options?: EconomyRuntimeOptions): EconomyRuntime {
  return new EconomyRuntime(options);
}

// ============================================================================
// Singleton Instance
// ============================================================================

let runtimeInstance: EconomyRuntime | null = null;

export function getEconomyRuntime(): EconomyRuntime {
  if (!runtimeInstance) {
    runtimeInstance = createEconomyRuntime();
  }
  return runtimeInstance;
}

export function resetEconomyRuntime(options?: EconomyRuntimeOptions): EconomyRuntime {
  runtimeInstance = createEconomyRuntime(options);
  return runtimeInstance;
}
