/**
 * HandEvaluator.ts
 * Phase 11 - Hand evaluation for Texas Hold'em
 *
 * Evaluates the best 5-card hand from up to 7 cards.
 * Uses brute-force combination approach for correctness.
 * Supports all 10 standard poker hand rankings.
 */

import {
  Card,
  Rank,
  Suit,
  HandCategory,
  HandRankResult,
  HandEvaluationError,
} from './HandTypes';
import {
  createHandRankResult,
  getRankName,
  getRankNamePlural,
} from './HandRank';

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Generate all k-combinations of an array
 */
function combinations<T>(arr: readonly T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length < k) return [];

  const result: T[][] = [];
  const first = arr[0];
  const rest = arr.slice(1);

  // Combinations including first element
  for (const combo of combinations(rest, k - 1)) {
    result.push([first, ...combo]);
  }

  // Combinations not including first element
  for (const combo of combinations(rest, k)) {
    result.push(combo);
  }

  return result;
}

/**
 * Count occurrences of each rank
 */
function countRanks(cards: readonly Card[]): Map<Rank, number> {
  const counts = new Map<Rank, number>();
  for (const card of cards) {
    counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
  }
  return counts;
}

/**
 * Count occurrences of each suit
 */
function countSuits(cards: readonly Card[]): Map<Suit, number> {
  const counts = new Map<Suit, number>();
  for (const card of cards) {
    counts.set(card.suit, (counts.get(card.suit) ?? 0) + 1);
  }
  return counts;
}

/**
 * Check if cards form a flush (all same suit)
 */
function isFlush(cards: readonly Card[]): boolean {
  if (cards.length === 0) return false;
  const suit = cards[0].suit;
  return cards.every(c => c.suit === suit);
}

/**
 * Check if cards form a straight and return high card
 * Returns null if not a straight
 * Handles A-2-3-4-5 (wheel) as rank 5 high
 */
function getStraightHighCard(cards: readonly Card[]): Rank | null {
  const rankSet = new Set(cards.map(c => c.rank));
  const ranks = Array.from(rankSet).sort((a, b) => a - b);

  if (ranks.length !== 5) return null;

  // Check normal straight
  if (ranks[4] - ranks[0] === 4) {
    return ranks[4];
  }

  // Check wheel (A-2-3-4-5)
  if (ranks[0] === 2 && ranks[1] === 3 && ranks[2] === 4 && ranks[3] === 5 && ranks[4] === 14) {
    return 5 as Rank; // 5-high straight
  }

  return null;
}

/**
 * Get sorted rank groups (by count desc, then rank desc)
 */
function getRankGroups(cards: readonly Card[]): Array<[Rank, number]> {
  const rankCounts = countRanks(cards);
  return Array.from(rankCounts.entries())
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1]; // By count desc
      return b[0] - a[0]; // By rank desc
    });
}

// ============================================================================
// 5-Card Hand Evaluation
// ============================================================================

/**
 * Evaluate a single 5-card hand
 */
function evaluateFiveCards(cards: readonly Card[]): HandRankResult {
  if (cards.length !== 5) {
    throw new HandEvaluationError(`Must have exactly 5 cards, got ${cards.length}`);
  }

  const flush = isFlush(cards);
  const straightHigh = getStraightHighCard(cards);
  const groups = getRankGroups(cards);

  const counts = groups.map(g => g[1]);
  const ranks = groups.map(g => g[0]);

  // Royal Flush (A-K-Q-J-T of same suit)
  if (flush && straightHigh === 14) {
    return createHandRankResult(10, [14], 'Royal Flush', [...cards]);
  }

  // Straight Flush
  if (flush && straightHigh !== null) {
    return createHandRankResult(
      9,
      [straightHigh],
      `Straight Flush, ${getRankName(straightHigh)} high`,
      [...cards]
    );
  }

  // Four of a Kind
  if (counts[0] === 4) {
    return createHandRankResult(
      8,
      [ranks[0], ranks[1]],
      `Four of a Kind, ${getRankNamePlural(ranks[0])}`,
      [...cards]
    );
  }

  // Full House
  if (counts[0] === 3 && counts[1] === 2) {
    return createHandRankResult(
      7,
      [ranks[0], ranks[1]],
      `Full House, ${getRankNamePlural(ranks[0])} full of ${getRankNamePlural(ranks[1])}`,
      [...cards]
    );
  }

  // Flush
  if (flush) {
    const sortedRanks = [...cards].map(c => c.rank).sort((a, b) => b - a);
    return createHandRankResult(
      6,
      sortedRanks,
      `Flush, ${getRankName(sortedRanks[0] as Rank)} high`,
      [...cards]
    );
  }

  // Straight
  if (straightHigh !== null) {
    return createHandRankResult(
      5,
      [straightHigh],
      `Straight, ${getRankName(straightHigh)} high`,
      [...cards]
    );
  }

  // Three of a Kind
  if (counts[0] === 3) {
    return createHandRankResult(
      4,
      [ranks[0], ranks[1], ranks[2]],
      `Three of a Kind, ${getRankNamePlural(ranks[0])}`,
      [...cards]
    );
  }

  // Two Pair
  if (counts[0] === 2 && counts[1] === 2) {
    const highPair = Math.max(ranks[0], ranks[1]) as Rank;
    const lowPair = Math.min(ranks[0], ranks[1]) as Rank;
    return createHandRankResult(
      3,
      [highPair, lowPair, ranks[2]],
      `Two Pair, ${getRankNamePlural(highPair)} and ${getRankNamePlural(lowPair)}`,
      [...cards]
    );
  }

  // One Pair
  if (counts[0] === 2) {
    return createHandRankResult(
      2,
      [ranks[0], ranks[1], ranks[2], ranks[3]],
      `Pair of ${getRankNamePlural(ranks[0])}`,
      [...cards]
    );
  }

  // High Card
  return createHandRankResult(
    1,
    ranks,
    `High Card, ${getRankName(ranks[0])}`,
    [...cards]
  );
}

// ============================================================================
// Main API
// ============================================================================

/**
 * Evaluate the best 5-card hand from up to 7 cards
 *
 * @param cards Array of 5-7 cards
 * @returns HandRankResult with category, kickers, description, and best 5 cards
 * @throws HandEvaluationError if less than 5 cards provided
 */
export function evaluateHand(cards: readonly Card[]): HandRankResult {
  if (cards.length < 5) {
    throw new HandEvaluationError(`Need at least 5 cards, got ${cards.length}`);
  }

  if (cards.length === 5) {
    return evaluateFiveCards(cards);
  }

  // Generate all 5-card combinations and find the best
  const allCombos = combinations(cards, 5);
  let bestRank: HandRankResult | null = null;

  for (const combo of allCombos) {
    const rank = evaluateFiveCards(combo);
    if (bestRank === null || compareHandRanks(rank, bestRank) > 0) {
      bestRank = rank;
    }
  }

  return bestRank!;
}

/**
 * Compare two hand ranks
 * Returns: negative if a < b, positive if a > b, 0 if equal
 */
export function compareHandRanks(a: HandRankResult, b: HandRankResult): number {
  // Compare category first
  if (a.category !== b.category) {
    return a.category - b.category;
  }

  // Compare kickers
  const maxKickers = Math.max(a.kickers.length, b.kickers.length);
  for (let i = 0; i < maxKickers; i++) {
    const aKicker = a.kickers[i] ?? 0;
    const bKicker = b.kickers[i] ?? 0;
    if (aKicker !== bKicker) {
      return aKicker - bKicker;
    }
  }

  // Hands are equal
  return 0;
}

/**
 * Evaluate hand from hole cards and community cards
 *
 * @param holeCards Player's 2 hole cards
 * @param communityCards 3-5 community cards
 * @returns HandRankResult
 * @throws HandEvaluationError if insufficient cards
 */
export function evaluateHandWithCommunity(
  holeCards: readonly Card[],
  communityCards: readonly Card[]
): HandRankResult {
  if (holeCards.length !== 2) {
    throw new HandEvaluationError(`Must have exactly 2 hole cards, got ${holeCards.length}`);
  }
  if (communityCards.length < 3) {
    throw new HandEvaluationError(`Must have at least 3 community cards, got ${communityCards.length}`);
  }

  const allCards = [...holeCards, ...communityCards];
  return evaluateHand(allCards);
}
