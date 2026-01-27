/**
 * SettlementEngine.ts
 * Phase 20 - Deterministic pot building and settlement with rake integration
 *
 * Provides:
 * - Deterministic pot building from contributions
 * - Multi-way all-in side pot calculation
 * - Rake calculation and application at settlement time
 * - Financial safety guarantees (no double charges, no loss)
 * - Idempotent settlement operations
 */

import { PlayerId } from '../../security/Identity';
import { TableId, HandId } from '../../security/AuditLog';
import { Street } from '../../game/engine/TableState';
import { EscrowManager } from '../Escrow';
import {
  SidePotCalculator,
  PlayerContributionInfo,
  SidePotResult,
  SidePot,
  determineWinnersPerPot,
} from '../SidePot';
import { EconomyConfig, DEFAULT_ECONOMY_CONFIG } from '../config/EconomyConfig';
import { RakePolicyEvaluator, RakeContext, RakeEvaluation } from '../config/RakePolicy';
import { EconomyErrors } from '../EconomyErrors';
import {
  SettlementRequest,
  SettlementOutcome,
  SidePotOutcome,
  PlayerSettlementState,
  TransactionId,
  generateSettlementId,
  generateIdempotencyKey,
} from './RuntimeTypes';
import { TransactionManager } from './TransactionManager';

// ============================================================================
// Settlement Engine Configuration
// ============================================================================

export interface SettlementEngineConfig {
  readonly enableRake: boolean;
  readonly enableIdempotency: boolean;
  readonly maxSidePots: number;
  readonly oddChipRule: 'first_winner' | 'position_order' | 'random';
}

export const DEFAULT_SETTLEMENT_CONFIG: SettlementEngineConfig = {
  enableRake: true,
  enableIdempotency: true,
  maxSidePots: 20,
  oddChipRule: 'first_winner',
};

// ============================================================================
// Settlement Engine Implementation
// ============================================================================

export class SettlementEngine {
  private readonly escrowManager: EscrowManager;
  private readonly transactionManager: TransactionManager;
  private readonly rakeEvaluator: RakePolicyEvaluator;
  private readonly config: SettlementEngineConfig;
  private readonly processedSettlements: Map<string, SettlementOutcome>;

  constructor(
    escrowManager: EscrowManager,
    transactionManager: TransactionManager,
    economyConfig: EconomyConfig = DEFAULT_ECONOMY_CONFIG,
    config: Partial<SettlementEngineConfig> = {}
  ) {
    this.escrowManager = escrowManager;
    this.transactionManager = transactionManager;
    this.rakeEvaluator = new RakePolicyEvaluator(economyConfig);
    this.config = { ...DEFAULT_SETTLEMENT_CONFIG, ...config };
    this.processedSettlements = new Map();
  }

  // ==========================================================================
  // Settlement
  // ==========================================================================

  /**
   * Settle a hand - calculate side pots, apply rake, distribute winnings
   */
  settleHand(request: SettlementRequest): SettlementOutcome {
    const {
      handId,
      tableId,
      playerStates,
      winnerRankings,
      finalStreet,
      flopSeen,
      isUncontested,
      playersInHand,
      playersAtShowdown,
    } = request;

    // Check idempotency
    if (this.config.enableIdempotency) {
      const idempotencyKey = generateIdempotencyKey(handId, tableId);
      const existingOutcome = this.processedSettlements.get(idempotencyKey);
      if (existingOutcome) {
        return existingOutcome;
      }
    }

    // Build contribution info for side pot calculation
    const contributions = this.buildContributions(playerStates);

    // Calculate side pots
    const sidePotResult = SidePotCalculator.calculate(handId, contributions);

    // Validate pot total matches contributions
    const totalContributions = playerStates.reduce((sum, p) => sum + p.totalBet, 0);
    if (sidePotResult.totalAmount !== totalContributions) {
      throw EconomyErrors.chipConservation(
        handId,
        totalContributions,
        sidePotResult.totalAmount,
        0
      );
    }

    // Determine winners for each pot
    const winnersByPot = determineWinnersPerPot(sidePotResult, winnerRankings);

    // Calculate rake
    const rakeContext = this.buildRakeContext(
      sidePotResult.totalAmount,
      finalStreet,
      flopSeen,
      isUncontested,
      playersInHand,
      playersAtShowdown,
      handId,
      tableId
    );

    const rakeEvaluation = this.config.enableRake
      ? this.rakeEvaluator.evaluate(rakeContext)
      : this.createZeroRakeEvaluation(sidePotResult.totalAmount);

    // Calculate payouts with rake deduction
    const { playerPayouts, sidePotOutcomes } = this.calculatePayouts(
      sidePotResult,
      winnersByPot,
      rakeEvaluation.rakeAmount
    );

    // Execute settlement transaction
    const transactionResult = this.executeSettlementTransaction(
      handId,
      tableId,
      playerPayouts,
      rakeEvaluation.rakeAmount
    );

    if (!transactionResult.success) {
      throw new Error(`Settlement transaction failed: ${transactionResult.error}`);
    }

    // Calculate final stacks
    const finalStacks = this.calculateFinalStacks(tableId, playerStates);

    // Build outcome
    const settlementId = generateSettlementId(handId);
    const outcome: SettlementOutcome = {
      settlementId,
      handId,
      tableId,
      totalPot: sidePotResult.totalAmount,
      potAfterRake: rakeEvaluation.potAfterRake,
      rakeCollected: rakeEvaluation.rakeAmount,
      rakeEvaluation,
      playerPayouts,
      sidePots: sidePotOutcomes,
      finalStacks,
      timestamp: Date.now(),
      transactionId: transactionResult.transactionId,
    };

    // Store for idempotency
    if (this.config.enableIdempotency) {
      const idempotencyKey = generateIdempotencyKey(handId, tableId);
      this.processedSettlements.set(idempotencyKey, outcome);
    }

    // Verify chip conservation
    this.verifyChipConservation(outcome, playerStates);

    return outcome;
  }

  /**
   * Settle an uncontested pot (everyone folded to one player)
   */
  settleUncontested(
    handId: HandId,
    tableId: TableId,
    winnerId: PlayerId,
    potTotal: number,
    finalStreet: Street,
    flopSeen: boolean
  ): SettlementOutcome {
    // Check idempotency
    if (this.config.enableIdempotency) {
      const idempotencyKey = generateIdempotencyKey(handId, tableId);
      const existingOutcome = this.processedSettlements.get(idempotencyKey);
      if (existingOutcome) {
        return existingOutcome;
      }
    }

    // Calculate rake for uncontested pot
    const rakeContext = this.buildRakeContext(
      potTotal,
      finalStreet,
      flopSeen,
      true, // isUncontested
      1,    // playersInHand
      0,    // playersAtShowdown
      handId,
      tableId
    );

    const rakeEvaluation = this.config.enableRake
      ? this.rakeEvaluator.evaluate(rakeContext)
      : this.createZeroRakeEvaluation(potTotal);

    const winnerPayout = potTotal - rakeEvaluation.rakeAmount;

    // Execute settlement transaction
    const transactionResult = this.executeSettlementTransaction(
      handId,
      tableId,
      new Map([[winnerId, winnerPayout]]),
      rakeEvaluation.rakeAmount
    );

    if (!transactionResult.success) {
      throw new Error(`Settlement transaction failed: ${transactionResult.error}`);
    }

    // Build outcome
    const settlementId = generateSettlementId(handId);
    const outcome: SettlementOutcome = {
      settlementId,
      handId,
      tableId,
      totalPot: potTotal,
      potAfterRake: rakeEvaluation.potAfterRake,
      rakeCollected: rakeEvaluation.rakeAmount,
      rakeEvaluation,
      playerPayouts: new Map([[winnerId, winnerPayout]]),
      sidePots: [{
        potId: `${handId}_pot_0`,
        amount: potTotal,
        eligiblePlayers: [winnerId],
        winners: [winnerId],
        amountPerWinner: winnerPayout,
        remainder: 0,
      }],
      finalStacks: new Map([[winnerId, this.escrowManager.getStack(tableId, winnerId)]]),
      timestamp: Date.now(),
      transactionId: transactionResult.transactionId,
    };

    // Store for idempotency
    if (this.config.enableIdempotency) {
      const idempotencyKey = generateIdempotencyKey(handId, tableId);
      this.processedSettlements.set(idempotencyKey, outcome);
    }

    return outcome;
  }

  // ==========================================================================
  // Side Pot Calculation
  // ==========================================================================

  /**
   * Preview side pots without executing settlement
   */
  previewSidePots(playerStates: readonly PlayerSettlementState[]): SidePotResult {
    const contributions = this.buildContributions(playerStates);
    return SidePotCalculator.calculate('preview', contributions);
  }

  /**
   * Build contribution info from player states
   */
  private buildContributions(
    playerStates: readonly PlayerSettlementState[]
  ): PlayerContributionInfo[] {
    return playerStates.map(p => ({
      playerId: p.playerId,
      totalContribution: p.totalBet,
      isAllIn: p.isAllIn,
      isFolded: p.isFolded,
    }));
  }

  // ==========================================================================
  // Rake Calculation
  // ==========================================================================

  /**
   * Preview rake without settling
   */
  previewRake(
    potSize: number,
    finalStreet: Street,
    flopSeen: boolean,
    isUncontested: boolean,
    playersInHand: number,
    playersAtShowdown: number
  ): RakeEvaluation {
    const context = this.buildRakeContext(
      potSize,
      finalStreet,
      flopSeen,
      isUncontested,
      playersInHand,
      playersAtShowdown
    );
    return this.rakeEvaluator.evaluate(context);
  }

  /**
   * Build rake context
   */
  private buildRakeContext(
    potSize: number,
    finalStreet: Street,
    flopSeen: boolean,
    isUncontested: boolean,
    playersInHand: number,
    playersAtShowdown: number,
    handId?: string,
    tableId?: string
  ): RakeContext {
    return {
      potSize,
      finalStreet,
      flopSeen,
      isUncontested,
      playersInHand,
      playersAtShowdown,
      handId,
      tableId,
    };
  }

  /**
   * Create zero rake evaluation
   */
  private createZeroRakeEvaluation(potSize: number): RakeEvaluation {
    return {
      rakeAmount: 0,
      potAfterRake: potSize,
      percentageApplied: 0,
      capApplied: false,
      waived: true,
      waivedReason: 'Rake disabled',
      policyUsed: 'zero',
      configHash: '',
    };
  }

  // ==========================================================================
  // Payout Calculation
  // ==========================================================================

  /**
   * Calculate payouts for all players across all pots
   */
  private calculatePayouts(
    sidePotResult: SidePotResult,
    winnersByPot: ReadonlyMap<string, readonly PlayerId[]>,
    rakeAmount: number
  ): {
    playerPayouts: Map<PlayerId, number>;
    sidePotOutcomes: SidePotOutcome[];
  } {
    const playerPayouts = new Map<PlayerId, number>();
    const sidePotOutcomes: SidePotOutcome[] = [];

    // Calculate total pot for rake distribution
    const totalPot = sidePotResult.totalAmount;
    const potAfterRake = totalPot - rakeAmount;

    // Distribute rake proportionally across pots
    let remainingRake = rakeAmount;
    let processedPotTotal = 0;

    for (let i = 0; i < sidePotResult.pots.length; i++) {
      const pot = sidePotResult.pots[i];
      const winners = winnersByPot.get(pot.sidePotId);

      if (!winners || winners.length === 0) {
        // If no winners, pot goes to eligible player with best position
        // This shouldn't happen in normal gameplay
        continue;
      }

      // Calculate rake for this pot proportionally
      const isLastPot = i === sidePotResult.pots.length - 1;
      let potRake: number;

      if (isLastPot) {
        // Last pot gets remaining rake to avoid rounding issues
        potRake = remainingRake;
      } else {
        // Proportional rake
        potRake = Math.floor((pot.amount / totalPot) * rakeAmount);
      }

      remainingRake -= potRake;
      const potAfterPotRake = pot.amount - potRake;

      // Split pot among winners
      const amountPerWinner = Math.floor(potAfterPotRake / winners.length);
      const remainder = potAfterPotRake - (amountPerWinner * winners.length);

      // Distribute to winners
      for (let j = 0; j < winners.length; j++) {
        const winnerId = winners[j];
        const currentPayout = playerPayouts.get(winnerId) ?? 0;
        let winnerPayout = amountPerWinner;

        // First winner gets remainder (odd chip rule)
        if (j === 0 && this.config.oddChipRule === 'first_winner') {
          winnerPayout += remainder;
        }

        playerPayouts.set(winnerId, currentPayout + winnerPayout);
      }

      sidePotOutcomes.push({
        potId: pot.sidePotId,
        amount: pot.amount,
        eligiblePlayers: [...pot.eligiblePlayers],
        winners: [...winners],
        amountPerWinner,
        remainder,
      });

      processedPotTotal += pot.amount;
    }

    return { playerPayouts, sidePotOutcomes };
  }

  // ==========================================================================
  // Transaction Execution
  // ==========================================================================

  /**
   * Execute the settlement transaction
   */
  private executeSettlementTransaction(
    handId: HandId,
    tableId: TableId,
    playerPayouts: Map<PlayerId, number>,
    rakeAmount: number
  ): { success: boolean; transactionId: TransactionId; error?: string } {
    const transaction = this.transactionManager
      .beginTransaction(handId, tableId)
      .withIdempotencyKey(generateIdempotencyKey(handId, tableId));

    // Award pots to winners
    for (const [playerId, amount] of playerPayouts) {
      if (amount > 0) {
        transaction.awardPot(tableId, playerId, amount);
      }
    }

    // Collect rake
    if (rakeAmount > 0) {
      transaction.collectRake(tableId, rakeAmount, handId);
    }

    return transaction.commit();
  }

  // ==========================================================================
  // Final Stack Calculation
  // ==========================================================================

  /**
   * Calculate final stacks after settlement
   */
  private calculateFinalStacks(
    tableId: TableId,
    playerStates: readonly PlayerSettlementState[]
  ): Map<PlayerId, number> {
    const finalStacks = new Map<PlayerId, number>();

    for (const player of playerStates) {
      const stack = this.escrowManager.getStack(tableId, player.playerId);
      finalStacks.set(player.playerId, stack);
    }

    return finalStacks;
  }

  // ==========================================================================
  // Verification
  // ==========================================================================

  /**
   * Verify chip conservation after settlement
   */
  private verifyChipConservation(
    outcome: SettlementOutcome,
    playerStates: readonly PlayerSettlementState[]
  ): void {
    const totalContributions = playerStates.reduce((sum, p) => sum + p.totalBet, 0);
    const totalPayouts = Array.from(outcome.playerPayouts.values()).reduce(
      (sum, amount) => sum + amount,
      0
    );
    const expectedPayouts = totalContributions - outcome.rakeCollected;

    if (totalPayouts !== expectedPayouts) {
      throw EconomyErrors.chipConservation(
        outcome.handId,
        totalContributions,
        totalPayouts,
        outcome.rakeCollected
      );
    }
  }

  /**
   * Check if a settlement has been processed
   */
  isSettlementProcessed(handId: HandId, tableId: TableId): boolean {
    const key = generateIdempotencyKey(handId, tableId);
    return this.processedSettlements.has(key);
  }

  /**
   * Get a processed settlement
   */
  getSettlement(handId: HandId, tableId: TableId): SettlementOutcome | null {
    const key = generateIdempotencyKey(handId, tableId);
    return this.processedSettlements.get(key) ?? null;
  }

  // ==========================================================================
  // Maintenance
  // ==========================================================================

  /**
   * Clear old settlement records
   */
  clearOldSettlements(maxAgeMs: number): number {
    const cutoff = Date.now() - maxAgeMs;
    let cleared = 0;

    for (const [key, outcome] of this.processedSettlements) {
      if (outcome.timestamp < cutoff) {
        this.processedSettlements.delete(key);
        cleared++;
      }
    }

    return cleared;
  }

  /**
   * Clear all state (for testing)
   */
  clear(): void {
    this.processedSettlements.clear();
  }

  /**
   * Get rake evaluator (for configuration queries)
   */
  getRakeEvaluator(): RakePolicyEvaluator {
    return this.rakeEvaluator;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createSettlementEngine(
  escrowManager: EscrowManager,
  transactionManager: TransactionManager,
  economyConfig?: EconomyConfig,
  config?: Partial<SettlementEngineConfig>
): SettlementEngine {
  return new SettlementEngine(
    escrowManager,
    transactionManager,
    economyConfig,
    config
  );
}
