/**
 * Card.ts
 * Phase L1 - Card representation for Texas Hold'em
 *
 * Immutable card type with suit and rank.
 */

// ============================================================================
// Types
// ============================================================================

export type Suit = 'clubs' | 'diamonds' | 'hearts' | 'spades';

export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;
// 11 = Jack, 12 = Queen, 13 = King, 14 = Ace

export interface Card {
  readonly suit: Suit;
  readonly rank: Rank;
}

// ============================================================================
// Constants
// ============================================================================

export const SUITS: readonly Suit[] = ['clubs', 'diamonds', 'hearts', 'spades'];

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

export const SUIT_SYMBOLS: Record<Suit, string> = {
  clubs: '♣',
  diamonds: '♦',
  hearts: '♥',
  spades: '♠',
};

// ============================================================================
// Functions
// ============================================================================

/**
 * Create a card
 */
export function createCard(suit: Suit, rank: Rank): Card {
  return { suit, rank };
}

/**
 * Format card for display (e.g., "A♠", "K♥")
 */
export function formatCard(card: Card): string {
  return `${RANK_NAMES[card.rank]}${SUIT_SYMBOLS[card.suit]}`;
}

/**
 * Compare two cards by rank (for sorting)
 * Returns negative if a < b, positive if a > b, 0 if equal
 */
export function compareByRank(a: Card, b: Card): number {
  return a.rank - b.rank;
}

/**
 * Check if two cards are equal
 */
export function cardsEqual(a: Card, b: Card): boolean {
  return a.suit === b.suit && a.rank === b.rank;
}

/**
 * Parse card from string notation (e.g., "As", "Kh", "2c")
 */
export function parseCard(notation: string): Card | null {
  if (notation.length < 2) return null;

  const rankChar = notation.slice(0, -1).toUpperCase();
  const suitChar = notation.slice(-1).toLowerCase();

  // Parse rank
  let rank: Rank;
  switch (rankChar) {
    case 'A': rank = 14; break;
    case 'K': rank = 13; break;
    case 'Q': rank = 12; break;
    case 'J': rank = 11; break;
    case 'T': case '10': rank = 10; break;
    default:
      const num = parseInt(rankChar, 10);
      if (num >= 2 && num <= 9) {
        rank = num as Rank;
      } else {
        return null;
      }
  }

  // Parse suit
  let suit: Suit;
  switch (suitChar) {
    case 'c': suit = 'clubs'; break;
    case 'd': suit = 'diamonds'; break;
    case 'h': suit = 'hearts'; break;
    case 's': suit = 'spades'; break;
    default: return null;
  }

  return createCard(suit, rank);
}
