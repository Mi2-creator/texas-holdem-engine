/**
 * Deck.ts
 * Phase L1 - Standard 52-card deck with shuffle and deal
 *
 * Uses Fisher-Yates shuffle for uniform randomness.
 * Immutable operations return new deck state.
 */

import { Card, Suit, Rank, SUITS, RANKS, createCard } from './Card';

// ============================================================================
// Types
// ============================================================================

export interface Deck {
  readonly cards: readonly Card[];
  readonly dealt: number; // Number of cards dealt from top
}

// ============================================================================
// Functions
// ============================================================================

/**
 * Create a fresh 52-card deck (unshuffled)
 */
export function createDeck(): Deck {
  const cards: Card[] = [];

  for (const suit of SUITS) {
    for (const rank of RANKS) {
      cards.push(createCard(suit, rank));
    }
  }

  return { cards, dealt: 0 };
}

/**
 * Shuffle the deck using Fisher-Yates algorithm
 * Returns a new shuffled deck
 */
export function shuffleDeck(deck: Deck): Deck {
  const cards = [...deck.cards];

  // Fisher-Yates shuffle
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }

  return { cards, dealt: 0 };
}

/**
 * Deal n cards from the top of the deck
 * Returns [dealt cards, new deck state]
 */
export function dealCards(deck: Deck, count: number): [Card[], Deck] {
  const remaining = deck.cards.length - deck.dealt;

  if (count > remaining) {
    throw new Error(`Cannot deal ${count} cards, only ${remaining} remaining`);
  }

  const dealtCards = deck.cards.slice(deck.dealt, deck.dealt + count);
  const newDeck: Deck = {
    cards: deck.cards,
    dealt: deck.dealt + count,
  };

  return [dealtCards as Card[], newDeck];
}

/**
 * Get remaining card count
 */
export function remainingCards(deck: Deck): number {
  return deck.cards.length - deck.dealt;
}

/**
 * Reset deck to fresh state (keeps same cards, resets dealt counter)
 */
export function resetDeck(deck: Deck): Deck {
  return { cards: deck.cards, dealt: 0 };
}

/**
 * Create and shuffle a new deck
 */
export function createShuffledDeck(): Deck {
  return shuffleDeck(createDeck());
}
