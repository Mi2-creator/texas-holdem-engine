/**
 * HandRank.ts
 * Phase 11 - Hand ranking utilities
 *
 * Constants and helper functions for hand ranks.
 */

import {
  HandCategory,
  HandRankResult,
  Card,
  Rank,
  HAND_CATEGORY_NAMES,
} from './HandTypes';

// ============================================================================
// Constants
// ============================================================================

export const SUITS = ['clubs', 'diamonds', 'hearts', 'spades'] as const;
export const RANKS: readonly Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

export const RANK_NAMES: Record<Rank, string> = {
  2: '2',
  3: '3',
  4: '4',
  5: '5',
  6: '6',
  7: '7',
  8: '8',
  9: '9',
  10: 'T',
  11: 'J',
  12: 'Q',
  13: 'K',
  14: 'A',
};

export const SUIT_SYMBOLS = {
  clubs: '♣',
  diamonds: '♦',
  hearts: '♥',
  spades: '♠',
} as const;

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a HandRankResult object
 */
export function createHandRankResult(
  category: HandCategory,
  kickers: readonly number[],
  description: string,
  bestFiveCards: readonly Card[]
): HandRankResult {
  return { category, kickers, description, bestFiveCards };
}

// ============================================================================
// Display Helpers
// ============================================================================

/**
 * Get category name from category number
 */
export function getCategoryName(category: HandCategory): string {
  return HAND_CATEGORY_NAMES[category];
}

/**
 * Get rank name for display (singular)
 */
export function getRankName(rank: Rank): string {
  switch (rank) {
    case 14: return 'Ace';
    case 13: return 'King';
    case 12: return 'Queen';
    case 11: return 'Jack';
    case 10: return 'Ten';
    default: return rank.toString();
  }
}

/**
 * Get rank name for display (plural)
 */
export function getRankNamePlural(rank: Rank): string {
  switch (rank) {
    case 14: return 'Aces';
    case 13: return 'Kings';
    case 12: return 'Queens';
    case 11: return 'Jacks';
    case 10: return 'Tens';
    case 6: return 'Sixes';
    default: return rank.toString() + 's';
  }
}

/**
 * Format a card for display (e.g., "A♠", "K♥")
 */
export function formatCard(card: Card): string {
  return `${RANK_NAMES[card.rank]}${SUIT_SYMBOLS[card.suit]}`;
}

/**
 * Format multiple cards for display
 */
export function formatCards(cards: readonly Card[]): string {
  return cards.map(formatCard).join(' ');
}

// ============================================================================
// Rank Value Helpers
// ============================================================================

/**
 * Get numeric value for comparison.
 * Ace can be 1 for A-2-3-4-5 straight, otherwise 14.
 */
export function getRankValue(rank: Rank, aceLow: boolean = false): number {
  if (aceLow && rank === 14) return 1;
  return rank;
}

/**
 * Sort ranks in descending order
 */
export function sortRanksDescending(ranks: Rank[]): Rank[] {
  return [...ranks].sort((a, b) => b - a);
}
