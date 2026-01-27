/**
 * Economy Module
 * Phase 14 - Production-grade poker economy system
 *
 * This module provides:
 * - Chip and balance management
 * - Table escrow for chips in play
 * - Pot management and side pot calculation
 * - Configurable rake system
 * - Append-only immutable ledger for auditability
 */

// ============================================================================
// Errors
// ============================================================================

export {
  EconomyError,
  EconomyErrorCode,
  InsufficientBalanceError,
  NegativeBalanceError,
  BalanceNotFoundError,
  InvalidAmountError,
  EscrowNotFoundError,
  EscrowInsufficientError,
  PotAlreadySettledError,
  DuplicateSettlementError,
  LedgerIntegrityError,
  ChipConservationError,
  InvalidRakeConfigError,
  EconomyErrors,
} from './EconomyErrors';

// ============================================================================
// Balance
// ============================================================================

export {
  PlayerBalance,
  BalanceSnapshot,
  BalanceTransfer,
  BalanceId,
  TransactionId,
  BalanceManager,
  getBalanceManager,
  resetBalanceManager,
} from './Balance';

// ============================================================================
// Escrow
// ============================================================================

export {
  TableEscrow,
  EscrowSnapshot,
  BuyInResult,
  CashOutResult,
  EscrowManager,
  getEscrowManager,
  resetEscrowManager,
} from './Escrow';

// ============================================================================
// Pot
// ============================================================================

export {
  PotId,
  PlayerContribution,
  StreetContributions,
  PotState,
  PotContributionResult,
  PotSummary,
  PotBuilder,
  PotManager,
  getPotManager,
  resetPotManager,
} from './Pot';

// ============================================================================
// Side Pot
// ============================================================================

export {
  SidePotId,
  PlayerContributionInfo,
  SidePot,
  SidePotResult,
  SidePotContribution,
  PotAward,
  SettlementResult,
  SidePotCalculator,
  determineWinnersPerPot,
  buildContributionInfo,
} from './SidePot';

// ============================================================================
// Rake
// ============================================================================

export {
  RakeId,
  RakeConfig,
  RakeResult,
  RakeSummary,
  HandRakeContext,
  DEFAULT_RAKE_CONFIG,
  RakeCalculator,
  buildHandRakeContext,
  calculateSimpleRake,
  getRakeCalculator,
  resetRakeCalculator,
} from './RakeCalculator';

// ============================================================================
// Ledger
// ============================================================================

export {
  LedgerEntryId,
  SettlementId,
  LedgerEntryType,
  LedgerEntry,
  LedgerQuery,
  LedgerSummary,
  HandLedgerSummary,
  SettlementRecord,
  LedgerConfig,
  LedgerManager,
  getLedgerManager,
  resetLedgerManager,
} from './Ledger';

// ============================================================================
// Integration Helpers
// ============================================================================

import { PlayerId } from '../security/Identity';
import { TableId, HandId } from '../security/AuditLog';
import { Street } from '../game/engine/TableState';
import { BalanceManager, getBalanceManager } from './Balance';
import { EscrowManager, getEscrowManager } from './Escrow';
import { PotManager, getPotManager } from './Pot';
import {
  SidePotCalculator,
  PlayerContributionInfo,
  determineWinnersPerPot,
} from './SidePot';
import {
  RakeCalculator,
  getRakeCalculator,
  buildHandRakeContext,
} from './RakeCalculator';
import { LedgerManager, getLedgerManager, LedgerEntryType } from './Ledger';
import { EconomyErrors } from './EconomyErrors';

/**
 * Economy Engine - High-level integration layer
 *
 * Coordinates all economy components for seamless hand settlement.
 */
export class EconomyEngine {
  private balanceManager: BalanceManager;
  private escrowManager: EscrowManager;
  private potManager: PotManager;
  private rakeCalculator: RakeCalculator;
  private ledgerManager: LedgerManager;

  constructor(options?: {
    balanceManager?: BalanceManager;
    escrowManager?: EscrowManager;
    potManager?: PotManager;
    rakeCalculator?: RakeCalculator;
    ledgerManager?: LedgerManager;
  }) {
    this.balanceManager = options?.balanceManager ?? getBalanceManager();
    this.escrowManager = options?.escrowManager ?? getEscrowManager();
    this.potManager = options?.potManager ?? getPotManager();
    this.rakeCalculator = options?.rakeCalculator ?? getRakeCalculator();
    this.ledgerManager = options?.ledgerManager ?? getLedgerManager();
  }

  /**
   * Initialize player for play
   */
  initializePlayer(playerId: PlayerId, initialBalance: number): void {
    if (!this.balanceManager.hasBalance(playerId)) {
      this.balanceManager.createBalance(playerId, initialBalance);
    }
    this.ledgerManager.setInitialBalance(playerId, initialBalance);
  }

  /**
   * Player buys into a table
   */
  buyIn(tableId: TableId, playerId: PlayerId, amount: number): void {
    const result = this.escrowManager.buyIn(tableId, playerId, amount);
    const balance = this.balanceManager.getBalance(playerId);

    this.ledgerManager.recordBuyIn(
      playerId,
      amount,
      tableId,
      balance.available
    );
  }

  /**
   * Player cashes out from table
   */
  cashOut(tableId: TableId, playerId: PlayerId, amount?: number): number {
    const result = this.escrowManager.cashOut(tableId, playerId, amount);
    const balance = this.balanceManager.getBalance(playerId);

    this.ledgerManager.recordCashOut(
      playerId,
      result.amountCashedOut,
      tableId,
      balance.available
    );

    return result.amountCashedOut;
  }

  /**
   * Start a new hand
   */
  startHand(handId: HandId, tableId: TableId): void {
    this.potManager.createPot(handId, tableId);
  }

  /**
   * Post blinds for a hand
   */
  postBlinds(
    handId: HandId,
    tableId: TableId,
    blinds: readonly { playerId: PlayerId; amount: number; type: 'small' | 'big' }[]
  ): void {
    const pot = this.potManager.requirePot(handId);

    for (const blind of blinds) {
      // Commit and move to pot
      this.escrowManager.commitChips(tableId, blind.playerId, blind.amount);
      this.escrowManager.moveToPot(tableId, blind.playerId, blind.amount);

      // Record in pot
      pot.postBlind(blind.playerId, blind.amount);

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
   * Record a player action (bet/call/raise)
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

    // Commit and move to pot
    this.escrowManager.commitChips(tableId, playerId, amount);
    this.escrowManager.moveToPot(tableId, playerId, amount);

    // Record in pot
    pot.recordBet(playerId, amount, street);

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
   * Mark player as folded
   */
  playerFolded(handId: HandId, playerId: PlayerId): void {
    const pot = this.potManager.getPot(handId);
    pot?.playerFolded(playerId);
  }

  /**
   * Settle a hand and award pot
   */
  settleHand(params: {
    handId: HandId;
    tableId: TableId;
    playerStates: readonly {
      playerId: PlayerId;
      totalBet: number;
      isAllIn: boolean;
      isFolded: boolean;
    }[];
    winnersByRank: ReadonlyMap<PlayerId, number>;  // Lower = better
    finalStreet: Street;
    playersInHand: number;
    playersAtShowdown: number;
  }): {
    settlementId: string;
    playerPayouts: Map<PlayerId, number>;
    rakeCollected: number;
    totalPot: number;
  } {
    const { handId, tableId, playerStates, winnersByRank, finalStreet, playersInHand, playersAtShowdown } = params;

    const pot = this.potManager.requirePot(handId);
    const potTotal = pot.getTotal();

    // Build contribution info
    const contributions: PlayerContributionInfo[] = playerStates.map(p => ({
      playerId: p.playerId,
      totalContribution: p.totalBet,
      isAllIn: p.isAllIn,
      isFolded: p.isFolded,
    }));

    // Calculate side pots
    const sidePotResult = SidePotCalculator.calculate(handId, contributions);

    // Determine winners per pot
    const winnersByPot = determineWinnersPerPot(sidePotResult, winnersByRank);

    // Calculate rake
    const rakeContext = buildHandRakeContext({
      handId,
      tableId,
      potSize: potTotal,
      finalStreet,
      playersInHand,
      playersAtShowdown,
    });

    const rakeResult = this.rakeCalculator.calculateRake(rakeContext);
    const rakeAmount = rakeResult.rakeAmount;
    const potAfterRake = potTotal - rakeAmount;

    // Calculate payouts with rake deducted proportionally
    const rawSettlement = SidePotCalculator.settle(sidePotResult, winnersByPot);
    const playerPayouts = new Map<PlayerId, number>();

    // Adjust for rake (deduct proportionally from winnings)
    const totalAwards = rawSettlement.totalAwarded;

    if (totalAwards > 0) {
      // First pass: calculate proportional payouts (floored)
      let totalDistributed = 0;
      let firstWinner: PlayerId | null = null;

      for (const [playerId, rawPayout] of rawSettlement.playerPayouts) {
        const adjustedPayout = Math.floor((rawPayout * potAfterRake) / totalAwards);
        playerPayouts.set(playerId, adjustedPayout);
        totalDistributed += adjustedPayout;
        if (firstWinner === null && adjustedPayout > 0) {
          firstWinner = playerId;
        }
      }

      // Second pass: distribute any remainder to first winner (odd chips)
      const remainder = potAfterRake - totalDistributed;
      if (remainder > 0 && firstWinner) {
        playerPayouts.set(firstWinner, (playerPayouts.get(firstWinner) ?? 0) + remainder);
      }
    }

    // Award chips to winners
    const entryIds: string[] = [];
    for (const [playerId, payout] of playerPayouts) {
      if (payout > 0) {
        this.escrowManager.awardPot(tableId, playerId, payout);

        const escrow = this.escrowManager.getEscrow(tableId, playerId);
        const entry = this.ledgerManager.recordPotWin(
          playerId,
          payout,
          handId,
          tableId,
          escrow?.stack ?? 0,
          rawSettlement.awards.length > 1 || (rawSettlement.awards[0]?.winnerIds.length ?? 0) > 1
        );
        entryIds.push(entry.entryId);
      }
    }

    // Record rake
    if (rakeAmount > 0) {
      const rakeEntry = this.ledgerManager.recordRake(
        'rake_account',
        rakeAmount,
        handId,
        tableId
      );
      entryIds.push(rakeEntry.entryId);
    }

    // Generate settlement ID
    const settlementId = `settle_${handId}_${Date.now()}`;

    // Check for duplicate settlement
    if (this.ledgerManager.isSettlementProcessed(handId, settlementId)) {
      throw EconomyErrors.duplicateSettlement(handId, settlementId);
    }

    // Calculate total chips for conservation check
    const chipsBefore = potTotal;
    const chipsAfter = Array.from(playerPayouts.values()).reduce((a, b) => a + b, 0);

    // Record settlement
    this.ledgerManager.recordSettlement(
      settlementId,
      handId,
      tableId,
      potTotal,
      rakeAmount,
      chipsBefore,
      chipsAfter + rakeAmount,
      entryIds
    );

    // Verify chip conservation
    const conservation = this.ledgerManager.verifyHandConservation(handId);
    if (!conservation.valid) {
      throw EconomyErrors.chipConservation(
        handId,
        chipsBefore,
        chipsAfter,
        rakeAmount
      );
    }

    // Mark pot as settled
    pot.markSettled();

    return {
      settlementId,
      playerPayouts,
      rakeCollected: rakeAmount,
      totalPot: potTotal,
    };
  }

  /**
   * Get player's current table stack
   */
  getPlayerStack(tableId: TableId, playerId: PlayerId): number {
    return this.escrowManager.getStack(tableId, playerId);
  }

  /**
   * Get pot total for a hand
   */
  getPotTotal(handId: HandId): number {
    return this.potManager.getPotTotal(handId);
  }

  /**
   * Verify ledger integrity
   */
  verifyIntegrity(): { valid: boolean; details?: string } {
    const result = this.ledgerManager.verifyIntegrity();
    if (!result.valid) {
      return {
        valid: false,
        details: `Integrity broken at sequence ${result.brokenAt}`,
      };
    }
    return { valid: true };
  }

  /**
   * Get managers for direct access
   */
  getManagers(): {
    balance: BalanceManager;
    escrow: EscrowManager;
    pot: PotManager;
    rake: RakeCalculator;
    ledger: LedgerManager;
  } {
    return {
      balance: this.balanceManager,
      escrow: this.escrowManager,
      pot: this.potManager,
      rake: this.rakeCalculator,
      ledger: this.ledgerManager,
    };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let economyEngineInstance: EconomyEngine | null = null;

export function getEconomyEngine(): EconomyEngine {
  if (!economyEngineInstance) {
    economyEngineInstance = new EconomyEngine();
  }
  return economyEngineInstance;
}

export function resetEconomyEngine(): EconomyEngine {
  economyEngineInstance = new EconomyEngine();
  return economyEngineInstance;
}

// ============================================================================
// Configurable Economy (Phase 15)
// ============================================================================

export * from './config';

// ============================================================================
// Economy Runtime (Phase 20)
// ============================================================================

export * from './runtime';
