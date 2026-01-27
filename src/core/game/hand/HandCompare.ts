/**
 * HandCompare.ts
 * Phase 11 - Hand comparison and tie-breaking
 *
 * Compares hands and determines winners.
 * Supports exact tie detection for split pots.
 */

import {
  Card,
  HandRankResult,
  ComparisonResult,
  HandEvaluationError,
} from './HandTypes';
import { evaluateHand, compareHandRanks } from './HandEvaluator';

// ============================================================================
// Types
// ============================================================================

/**
 * Input for hand comparison
 */
export interface HandForComparison {
  readonly playerId: string;
  readonly cards: readonly Card[];
}

/**
 * Winner determination result
 */
export interface WinnerResult {
  /** Indices of winning hands */
  readonly winnerIndices: readonly number[];
  /** Player IDs of winners */
  readonly winnerIds: readonly string[];
  /** Best hand rank */
  readonly bestHandRank: HandRankResult;
  /** Whether it's a tie (multiple winners) */
  readonly isTie: boolean;
}

// ============================================================================
// Core Comparison Functions
// ============================================================================

/**
 * Compare two hands (each can be 5-7 cards)
 *
 * @returns -1 if a loses, 0 if tie, 1 if a wins
 */
export function compareHands(a: readonly Card[], b: readonly Card[]): ComparisonResult {
  const rankA = evaluateHand(a);
  const rankB = evaluateHand(b);
  const result = compareHandRanks(rankA, rankB);

  if (result < 0) return -1;
  if (result > 0) return 1;
  return 0;
}

/**
 * Compare two pre-evaluated hand ranks
 *
 * @returns -1 if a loses, 0 if tie, 1 if a wins
 */
export function compareEvaluatedHands(
  a: HandRankResult,
  b: HandRankResult
): ComparisonResult {
  const result = compareHandRanks(a, b);

  if (result < 0) return -1;
  if (result > 0) return 1;
  return 0;
}

// ============================================================================
// Winner Determination
// ============================================================================

/**
 * Determine winner(s) from multiple hands
 *
 * @param hands Array of hands with player IDs
 * @returns WinnerResult with winning indices, IDs, and best hand
 * @throws HandEvaluationError if no hands provided
 */
export function determineWinners(hands: readonly HandForComparison[]): WinnerResult {
  if (hands.length === 0) {
    throw new HandEvaluationError('No hands to compare');
  }

  if (hands.length === 1) {
    const rank = evaluateHand(hands[0].cards);
    return {
      winnerIndices: [0],
      winnerIds: [hands[0].playerId],
      bestHandRank: rank,
      isTie: false,
    };
  }

  // Evaluate all hands
  const evaluatedHands = hands.map((h, i) => ({
    index: i,
    playerId: h.playerId,
    rank: evaluateHand(h.cards),
  }));

  // Find best hand
  let bestRank = evaluatedHands[0].rank;
  let winners = [evaluatedHands[0]];

  for (let i = 1; i < evaluatedHands.length; i++) {
    const comparison = compareHandRanks(evaluatedHands[i].rank, bestRank);
    if (comparison > 0) {
      // New best
      bestRank = evaluatedHands[i].rank;
      winners = [evaluatedHands[i]];
    } else if (comparison === 0) {
      // Tie
      winners.push(evaluatedHands[i]);
    }
  }

  return {
    winnerIndices: winners.map(w => w.index),
    winnerIds: winners.map(w => w.playerId),
    bestHandRank: bestRank,
    isTie: winners.length > 1,
  };
}

/**
 * Determine winners from card arrays only (no player IDs)
 *
 * @param hands Array of card arrays
 * @returns Array of winning indices
 */
export function determineWinnerIndices(hands: readonly (readonly Card[])[]): number[] {
  if (hands.length === 0) return [];
  if (hands.length === 1) return [0];

  const ranks = hands.map(h => evaluateHand(h));
  let bestRank = ranks[0];
  let winners = [0];

  for (let i = 1; i < ranks.length; i++) {
    const comparison = compareHandRanks(ranks[i], bestRank);
    if (comparison > 0) {
      bestRank = ranks[i];
      winners = [i];
    } else if (comparison === 0) {
      winners.push(i);
    }
  }

  return winners;
}

// ============================================================================
// Kicker Comparison
// ============================================================================

/**
 * Check if two hands are exactly equal (same category and all kickers)
 */
export function areHandsEqual(a: HandRankResult, b: HandRankResult): boolean {
  if (a.category !== b.category) return false;

  const maxKickers = Math.max(a.kickers.length, b.kickers.length);
  for (let i = 0; i < maxKickers; i++) {
    const aKicker = a.kickers[i] ?? 0;
    const bKicker = b.kickers[i] ?? 0;
    if (aKicker !== bKicker) return false;
  }

  return true;
}

/**
 * Get the deciding kicker index in a comparison
 * Returns -1 if hands are equal or differ by category
 */
export function getDecidingKickerIndex(
  a: HandRankResult,
  b: HandRankResult
): number {
  if (a.category !== b.category) return -1;

  const maxKickers = Math.max(a.kickers.length, b.kickers.length);
  for (let i = 0; i < maxKickers; i++) {
    const aKicker = a.kickers[i] ?? 0;
    const bKicker = b.kickers[i] ?? 0;
    if (aKicker !== bKicker) return i;
  }

  return -1; // Hands are equal
}
