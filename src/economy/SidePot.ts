/**
 * SidePot.ts
 * Phase 14 - Side pot calculation for all-in scenarios
 *
 * Calculates side pots when players are all-in with different stack sizes.
 *
 * Algorithm:
 * 1. Sort players by total contribution (ascending)
 * 2. Create pots by peeling off layers of contributions
 * 3. Each pot contains eligible players who contributed at least that much
 *
 * Example:
 * Player A: 100 (all-in)
 * Player B: 200 (all-in)
 * Player C: 300 (active)
 *
 * Results in:
 * - Main pot: 300 (100 * 3) - A, B, C eligible
 * - Side pot 1: 200 ((200-100) * 2) - B, C eligible
 * - Side pot 2: 100 (300-200) - C only (returned or single winner)
 */

import { PlayerId } from '../security/Identity';
import { HandId } from '../security/AuditLog';
import { EconomyErrors } from './EconomyErrors';

// ============================================================================
// Types
// ============================================================================

export type SidePotId = string;

export interface PlayerContributionInfo {
  readonly playerId: PlayerId;
  readonly totalContribution: number;
  readonly isAllIn: boolean;
  readonly isFolded: boolean;
}

export interface SidePot {
  readonly sidePotId: SidePotId;
  readonly amount: number;
  readonly eligiblePlayers: readonly PlayerId[];
  readonly contributionLevel: number;  // The contribution threshold for this pot
}

export interface SidePotResult {
  readonly handId: HandId;
  readonly pots: readonly SidePot[];
  readonly totalAmount: number;
  readonly contributionBreakdown: ReadonlyMap<PlayerId, readonly SidePotContribution[]>;
}

export interface SidePotContribution {
  readonly sidePotId: SidePotId;
  readonly amount: number;
}

export interface PotAward {
  readonly sidePotId: SidePotId;
  readonly winnerIds: readonly PlayerId[];
  readonly amountPerWinner: number;
  readonly remainder: number;  // Odd chips that can't be split evenly
}

export interface SettlementResult {
  readonly handId: HandId;
  readonly awards: readonly PotAward[];
  readonly totalAwarded: number;
  readonly playerPayouts: ReadonlyMap<PlayerId, number>;
}

// ============================================================================
// Side Pot Calculator
// ============================================================================

export class SidePotCalculator {
  /**
   * Calculate side pots from player contributions
   */
  static calculate(
    handId: HandId,
    contributions: readonly PlayerContributionInfo[]
  ): SidePotResult {
    // Filter out players with zero contribution
    const validContributions = contributions.filter(c => c.totalContribution > 0);

    if (validContributions.length === 0) {
      return {
        handId,
        pots: [],
        totalAmount: 0,
        contributionBreakdown: new Map(),
      };
    }

    // Sort by contribution (ascending)
    const sorted = [...validContributions].sort(
      (a, b) => a.totalContribution - b.totalContribution
    );

    // Find unique contribution levels
    const levels = [...new Set(sorted.map(c => c.totalContribution))].sort((a, b) => a - b);

    const pots: SidePot[] = [];
    const contributionBreakdown = new Map<PlayerId, SidePotContribution[]>();

    // Initialize breakdown for all players
    for (const c of validContributions) {
      contributionBreakdown.set(c.playerId, []);
    }

    let previousLevel = 0;

    for (let i = 0; i < levels.length; i++) {
      const level = levels[i];
      const levelDiff = level - previousLevel;

      // Players who contributed at least this much and haven't folded
      const eligiblePlayers = sorted
        .filter(c => c.totalContribution >= level && !c.isFolded)
        .map(c => c.playerId);

      // Players who contributed to this pot level (haven't folded or have)
      const contributingPlayers = sorted.filter(c => c.totalContribution >= level);

      // Calculate pot amount: levelDiff * number of contributing players
      const potAmount = levelDiff * contributingPlayers.length;

      if (potAmount > 0) {
        const sidePotId = `${handId}_pot_${i}`;

        pots.push({
          sidePotId,
          amount: potAmount,
          eligiblePlayers,
          contributionLevel: level,
        });

        // Record each player's contribution to this pot
        for (const player of contributingPlayers) {
          const breakdown = contributionBreakdown.get(player.playerId)!;
          breakdown.push({
            sidePotId,
            amount: levelDiff,
          });
        }
      }

      previousLevel = level;
    }

    const totalAmount = pots.reduce((sum, p) => sum + p.amount, 0);

    return {
      handId,
      pots,
      totalAmount,
      contributionBreakdown,
    };
  }

  /**
   * Settle pots and determine payouts
   *
   * @param sidePotResult The calculated side pots
   * @param winnersByPot Map of pot ID to winner IDs for that pot
   *                     (determined by showdown, comparing only eligible players)
   */
  static settle(
    sidePotResult: SidePotResult,
    winnersByPot: ReadonlyMap<SidePotId, readonly PlayerId[]>
  ): SettlementResult {
    const awards: PotAward[] = [];
    const playerPayouts = new Map<PlayerId, number>();

    for (const pot of sidePotResult.pots) {
      const winners = winnersByPot.get(pot.sidePotId);

      if (!winners || winners.length === 0) {
        // No winner specified - shouldn't happen in valid settlement
        throw EconomyErrors.invalidOperation(
          'settle',
          `No winners specified for pot ${pot.sidePotId}`
        );
      }

      // Verify all winners are eligible
      for (const winnerId of winners) {
        if (!pot.eligiblePlayers.includes(winnerId)) {
          throw EconomyErrors.invalidOperation(
            'settle',
            `Player ${winnerId} is not eligible for pot ${pot.sidePotId}`
          );
        }
      }

      // Calculate payout per winner
      const amountPerWinner = Math.floor(pot.amount / winners.length);
      const remainder = pot.amount - (amountPerWinner * winners.length);

      awards.push({
        sidePotId: pot.sidePotId,
        winnerIds: winners,
        amountPerWinner,
        remainder,
      });

      // Update player payouts
      for (const winnerId of winners) {
        const current = playerPayouts.get(winnerId) ?? 0;
        playerPayouts.set(winnerId, current + amountPerWinner);
      }

      // Award remainder to first winner (standard poker rule)
      if (remainder > 0 && winners.length > 0) {
        const firstWinner = winners[0];
        const current = playerPayouts.get(firstWinner) ?? 0;
        playerPayouts.set(firstWinner, current + remainder);
      }
    }

    const totalAwarded = Array.from(playerPayouts.values()).reduce(
      (sum, amount) => sum + amount,
      0
    );

    return {
      handId: sidePotResult.handId,
      awards,
      totalAwarded,
      playerPayouts,
    };
  }

  /**
   * Simple single-pot calculation (no all-ins)
   */
  static calculateSimple(
    handId: HandId,
    totalPot: number,
    eligiblePlayers: readonly PlayerId[]
  ): SidePotResult {
    if (eligiblePlayers.length === 0) {
      return {
        handId,
        pots: [],
        totalAmount: 0,
        contributionBreakdown: new Map(),
      };
    }

    const sidePotId = `${handId}_pot_0`;

    return {
      handId,
      pots: [{
        sidePotId,
        amount: totalPot,
        eligiblePlayers,
        contributionLevel: 0,
      }],
      totalAmount: totalPot,
      contributionBreakdown: new Map(),
    };
  }

  /**
   * Split pot evenly among winners with remainder to first winner
   */
  static splitPot(
    amount: number,
    winnerIds: readonly PlayerId[]
  ): Map<PlayerId, number> {
    if (winnerIds.length === 0) {
      return new Map();
    }

    const payouts = new Map<PlayerId, number>();
    const amountPerWinner = Math.floor(amount / winnerIds.length);
    const remainder = amount - (amountPerWinner * winnerIds.length);

    for (const winnerId of winnerIds) {
      payouts.set(winnerId, amountPerWinner);
    }

    // Award remainder to first winner
    if (remainder > 0) {
      const firstWinner = winnerIds[0];
      payouts.set(firstWinner, (payouts.get(firstWinner) ?? 0) + remainder);
    }

    return payouts;
  }

  /**
   * Verify pot amounts match total contributions
   */
  static verifyConservation(
    contributions: readonly PlayerContributionInfo[],
    sidePotResult: SidePotResult
  ): boolean {
    const totalContributions = contributions.reduce(
      (sum, c) => sum + c.totalContribution,
      0
    );
    return totalContributions === sidePotResult.totalAmount;
  }
}

// ============================================================================
// Helper functions for showdown integration
// ============================================================================

/**
 * Determine winners for each side pot based on hand rankings
 */
export function determineWinnersPerPot(
  sidePotResult: SidePotResult,
  playerRankings: ReadonlyMap<PlayerId, number>  // Lower rank = better hand
): Map<SidePotId, readonly PlayerId[]> {
  const winnersByPot = new Map<SidePotId, readonly PlayerId[]>();

  for (const pot of sidePotResult.pots) {
    // Find best rank among eligible players
    let bestRank = Infinity;
    for (const playerId of pot.eligiblePlayers) {
      const rank = playerRankings.get(playerId);
      if (rank !== undefined && rank < bestRank) {
        bestRank = rank;
      }
    }

    // Find all players with best rank
    const winners: PlayerId[] = [];
    for (const playerId of pot.eligiblePlayers) {
      const rank = playerRankings.get(playerId);
      if (rank === bestRank) {
        winners.push(playerId);
      }
    }

    winnersByPot.set(pot.sidePotId, winners);
  }

  return winnersByPot;
}

/**
 * Build contribution info from game state
 */
export function buildContributionInfo(
  playerStates: readonly {
    playerId: PlayerId;
    totalBet: number;
    isAllIn: boolean;
    isFolded: boolean;
  }[]
): PlayerContributionInfo[] {
  return playerStates.map(p => ({
    playerId: p.playerId,
    totalContribution: p.totalBet,
    isAllIn: p.isAllIn,
    isFolded: p.isFolded,
  }));
}
