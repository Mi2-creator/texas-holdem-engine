/**
 * HandTypes.ts
 * Phase 11 - Type definitions for hand evaluation
 *
 * Core types for Texas Hold'em hand evaluation system.
 * All types are immutable and used across the hand evaluation module.
 */

// ============================================================================
// Card Types (re-exported for convenience)
// ============================================================================

export type Suit = 'clubs' | 'diamonds' | 'hearts' | 'spades';

export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;
// 11 = Jack, 12 = Queen, 13 = King, 14 = Ace

export interface Card {
  readonly suit: Suit;
  readonly rank: Rank;
}

// ============================================================================
// Hand Category
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
 * Hand category names for display
 */
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
// Hand Evaluation Result
// ============================================================================

/**
 * Complete hand evaluation result
 */
export interface HandRankResult {
  /** Hand category (1-10) */
  readonly category: HandCategory;
  /** Kicker values for tie-breaking (highest first) */
  readonly kickers: readonly number[];
  /** Human-readable description */
  readonly description: string;
  /** The 5 cards that make up the best hand */
  readonly bestFiveCards: readonly Card[];
}

// ============================================================================
// Showdown Types
// ============================================================================

/**
 * Player hand information for showdown
 */
export interface ShowdownHand {
  readonly playerId: string;
  readonly playerName: string;
  readonly holeCards: readonly Card[];
  readonly handRank: HandRankResult;
}

/**
 * Showdown result for a single player
 */
export interface ShowdownPlayerResult {
  readonly playerId: string;
  readonly playerName: string;
  readonly holeCards: readonly Card[];
  readonly handRank: HandRankResult | null; // null if folded
  readonly folded: boolean;
  readonly isWinner: boolean;
  readonly amountWon: number;
}

/**
 * Complete showdown resolution result
 */
export interface ShowdownResult {
  /** All participating players and their results */
  readonly players: readonly ShowdownPlayerResult[];
  /** Winning player IDs (can be multiple for split pot) */
  readonly winnerIds: readonly string[];
  /** Winning hand description */
  readonly winningHandDescription: string;
  /** Total pot awarded */
  readonly potAwarded: number;
  /** Whether pot was split */
  readonly isSplitPot: boolean;
}

// ============================================================================
// Comparison Types
// ============================================================================

/**
 * Result of comparing two hands
 * -1: first hand loses
 *  0: tie
 *  1: first hand wins
 */
export type ComparisonResult = -1 | 0 | 1;

// ============================================================================
// Error Types
// ============================================================================

/**
 * Error thrown when hand evaluation encounters illegal state
 */
export class HandEvaluationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HandEvaluationError';
    Object.setPrototypeOf(this, HandEvaluationError.prototype);
  }
}

/**
 * Error thrown when showdown encounters illegal state
 */
export class ShowdownError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ShowdownError';
    Object.setPrototypeOf(this, ShowdownError.prototype);
  }
}
