/**
 * HandEvaluator.ts
 * Phase L1 - Hand evaluation for Texas Hold'em
 *
 * Evaluates the best 5-card hand from up to 7 cards.
 * Uses brute-force combination approach for correctness.
 */

import { Card, Rank, RANK_NAMES } from './Card';
import { HandRank, HandCategory, createHandRank, compareHandRanks } from './HandRank';

// ============================================================================
// Helper Functions
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
 * Get rank name for description
 */
function getRankName(rank: Rank): string {
  switch (rank) {
    case 14: return 'Ace';
    case 13: return 'King';
    case 12: return 'Queen';
    case 11: return 'Jack';
    default: return rank.toString();
  }
}

/**
 * Get plural rank name
 */
function getRankNamePlural(rank: Rank): string {
  switch (rank) {
    case 6: return 'Sixes';
    default: return getRankName(rank) + 's';
  }
}

// ============================================================================
// 5-Card Hand Evaluation
// ============================================================================

/**
 * Evaluate a single 5-card hand
 */
function evaluateFiveCards(cards: readonly Card[]): HandRank {
  if (cards.length !== 5) {
    throw new Error('Must have exactly 5 cards');
  }

  const flush = isFlush(cards);
  const straightHigh = getStraightHighCard(cards);
  const rankCounts = countRanks(cards);

  // Get sorted rank groups (by count desc, then rank desc)
  const groups = Array.from(rankCounts.entries())
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1]; // By count desc
      return b[0] - a[0]; // By rank desc
    });

  const counts = groups.map(g => g[1]);
  const ranks = groups.map(g => g[0]);

  // Royal Flush
  if (flush && straightHigh === 14) {
    return createHandRank(10, [14], 'Royal Flush');
  }

  // Straight Flush
  if (flush && straightHigh !== null) {
    return createHandRank(9, [straightHigh], `Straight Flush, ${getRankName(straightHigh)} high`);
  }

  // Four of a Kind
  if (counts[0] === 4) {
    return createHandRank(8, [ranks[0], ranks[1]], `Four of a Kind, ${getRankNamePlural(ranks[0])}`);
  }

  // Full House
  if (counts[0] === 3 && counts[1] === 2) {
    return createHandRank(7, [ranks[0], ranks[1]], `Full House, ${getRankNamePlural(ranks[0])} full of ${getRankNamePlural(ranks[1])}`);
  }

  // Flush
  if (flush) {
    const sortedRanks = [...cards].map(c => c.rank).sort((a, b) => b - a);
    return createHandRank(6, sortedRanks, `Flush, ${getRankName(sortedRanks[0])} high`);
  }

  // Straight
  if (straightHigh !== null) {
    return createHandRank(5, [straightHigh], `Straight, ${getRankName(straightHigh)} high`);
  }

  // Three of a Kind
  if (counts[0] === 3) {
    return createHandRank(4, [ranks[0], ranks[1], ranks[2]], `Three of a Kind, ${getRankNamePlural(ranks[0])}`);
  }

  // Two Pair
  if (counts[0] === 2 && counts[1] === 2) {
    const highPair = (ranks[0] > ranks[1] ? ranks[0] : ranks[1]) as Rank;
    const lowPair = (ranks[0] < ranks[1] ? ranks[0] : ranks[1]) as Rank;
    return createHandRank(3, [highPair, lowPair, ranks[2]], `Two Pair, ${getRankNamePlural(highPair)} and ${getRankNamePlural(lowPair)}`);
  }

  // One Pair
  if (counts[0] === 2) {
    return createHandRank(2, [ranks[0], ranks[1], ranks[2], ranks[3]], `Pair of ${getRankNamePlural(ranks[0])}`);
  }

  // High Card
  return createHandRank(1, ranks, `High Card, ${getRankName(ranks[0])}`);
}

// ============================================================================
// Main API
// ============================================================================

/**
 * Evaluate the best 5-card hand from up to 7 cards
 */
export function evaluateHand(cards: readonly Card[]): HandRank {
  if (cards.length < 5) {
    throw new Error(`Need at least 5 cards, got ${cards.length}`);
  }

  if (cards.length === 5) {
    return evaluateFiveCards(cards);
  }

  // Generate all 5-card combinations and find the best
  const allCombos = combinations(cards, 5);
  let bestRank: HandRank | null = null;

  for (const combo of allCombos) {
    const rank = evaluateFiveCards(combo);
    if (bestRank === null || compareHandRanks(rank, bestRank) > 0) {
      bestRank = rank;
    }
  }

  return bestRank!;
}

/**
 * Compare two hands (each can be 5-7 cards)
 * Returns: negative if a loses, positive if a wins, 0 if tie
 */
export function compareHands(a: readonly Card[], b: readonly Card[]): number {
  const rankA = evaluateHand(a);
  const rankB = evaluateHand(b);
  return compareHandRanks(rankA, rankB);
}

/**
 * Determine winner(s) from multiple hands
 * Returns indices of winning hands (can be multiple for ties)
 */
export function determineWinners(hands: readonly (readonly Card[])[]): number[] {
  if (hands.length === 0) return [];
  if (hands.length === 1) return [0];

  const ranks = hands.map(h => evaluateHand(h));
  let bestRank = ranks[0];
  let winners = [0];

  for (let i = 1; i < ranks.length; i++) {
    const comparison = compareHandRanks(ranks[i], bestRank);
    if (comparison > 0) {
      // New best
      bestRank = ranks[i];
      winners = [i];
    } else if (comparison === 0) {
      // Tie
      winners.push(i);
    }
  }

  return winners;
}
