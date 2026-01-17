/**
 * HandRank.ts
 * Phase L1 - Hand ranking types for Texas Hold'em
 *
 * Defines the 10 standard poker hand rankings.
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Hand category (1 = worst, 10 = best)
 */
export type HandCategory =
  | 1  // High Card
  | 2  // One Pair
  | 3  // Two Pair
  | 4  // Three of a Kind
  | 5  // Straight
  | 6  // Flush
  | 7  // Full House
  | 8  // Four of a Kind
  | 9  // Straight Flush
  | 10; // Royal Flush

/**
 * Complete hand evaluation result
 */
export interface HandRank {
  /** Hand category (1-10) */
  readonly category: HandCategory;
  /** Kicker values for tie-breaking (highest first) */
  readonly kickers: readonly number[];
  /** Human-readable description */
  readonly description: string;
}

// ============================================================================
// Constants
// ============================================================================

export const HAND_CATEGORY_NAMES: Record<HandCategory, string> = {
  1: 'High Card',
  2: 'One Pair',
  3: 'Two Pair',
  4: 'Three of a Kind',
  5: 'Straight',
  6: 'Flush',
  7: 'Full House',
  8: 'Four of a Kind',
  9: 'Straight Flush',
  10: 'Royal Flush',
};

// ============================================================================
// Functions
// ============================================================================

/**
 * Compare two hand ranks
 * Returns: negative if a < b, positive if a > b, 0 if equal
 */
export function compareHandRanks(a: HandRank, b: HandRank): number {
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
 * Create a HandRank object
 */
export function createHandRank(
  category: HandCategory,
  kickers: readonly number[],
  description: string
): HandRank {
  return { category, kickers, description };
}

/**
 * Get category name
 */
export function getCategoryName(category: HandCategory): string {
  return HAND_CATEGORY_NAMES[category];
}
