/**
 * TableState.ts
 * Phase L1 - Game state management for Texas Hold'em
 *
 * Immutable state representation for a poker table.
 * All state transitions return new state objects.
 */

import { Card } from './Card';

// ============================================================================
// Types
// ============================================================================

export type Street = 'waiting' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'complete';

export type PlayerStatus = 'active' | 'folded' | 'all-in' | 'out';

export interface Player {
  readonly id: string;
  readonly name: string;
  readonly stack: number;
  readonly holeCards: readonly Card[];
  readonly status: PlayerStatus;
  readonly currentBet: number; // Bet in current betting round
  readonly totalBetThisHand: number; // Total bet across all streets
  readonly isDealer: boolean;
  readonly seat: number;
}

export interface TableState {
  /** All players at the table */
  readonly players: readonly Player[];
  /** Dealer button position (player index) */
  readonly dealerIndex: number;
  /** Current street */
  readonly street: Street;
  /** Community cards */
  readonly communityCards: readonly Card[];
  /** Current pot total */
  readonly pot: number;
  /** Current bet amount to call */
  readonly currentBet: number;
  /** Index of player whose turn it is */
  readonly activePlayerIndex: number;
  /** Small blind amount */
  readonly smallBlind: number;
  /** Big blind amount */
  readonly bigBlind: number;
  /** Minimum raise amount */
  readonly minRaise: number;
  /** Last raiser index (for round completion check) */
  readonly lastRaiserIndex: number;
  /** Number of players who have acted this round */
  readonly actionsThisRound: number;
  /** Hand number */
  readonly handNumber: number;
  /** Winner indices (set after showdown) */
  readonly winners: readonly number[];
  /** Winning hand description */
  readonly winningHandDescription: string;
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create initial player
 */
export function createPlayer(
  id: string,
  name: string,
  stack: number,
  seat: number
): Player {
  return {
    id,
    name,
    stack,
    holeCards: [],
    status: 'active',
    currentBet: 0,
    totalBetThisHand: 0,
    isDealer: false,
    seat,
  };
}

/**
 * Create initial table state
 */
export function createTableState(
  players: readonly Player[],
  smallBlind: number,
  bigBlind: number
): TableState {
  return {
    players,
    dealerIndex: 0,
    street: 'waiting',
    communityCards: [],
    pot: 0,
    currentBet: 0,
    activePlayerIndex: 0,
    smallBlind,
    bigBlind,
    minRaise: bigBlind,
    lastRaiserIndex: -1,
    actionsThisRound: 0,
    handNumber: 0,
    winners: [],
    winningHandDescription: '',
  };
}

// ============================================================================
// State Query Functions
// ============================================================================

/**
 * Get active players (not folded, not out)
 */
export function getActivePlayers(state: TableState): readonly Player[] {
  return state.players.filter(p => p.status === 'active' || p.status === 'all-in');
}

/**
 * Get players who can still act (active, not all-in)
 */
export function getActingPlayers(state: TableState): readonly Player[] {
  return state.players.filter(p => p.status === 'active');
}

/**
 * Get current active player
 */
export function getCurrentPlayer(state: TableState): Player | null {
  if (state.activePlayerIndex < 0 || state.activePlayerIndex >= state.players.length) {
    return null;
  }
  return state.players[state.activePlayerIndex];
}

/**
 * Get small blind position
 * Heads-up: dealer is SB
 * 3+ players: left of dealer is SB
 */
export function getSmallBlindIndex(state: TableState): number {
  const numPlayers = state.players.length;
  return numPlayers === 2
    ? state.dealerIndex
    : (state.dealerIndex + 1) % numPlayers;
}

/**
 * Get big blind position (left of small blind)
 */
export function getBigBlindIndex(state: TableState): number {
  const sbIndex = getSmallBlindIndex(state);
  return (sbIndex + 1) % state.players.length;
}

/**
 * Get amount needed to call for a player
 */
export function getCallAmount(state: TableState, playerIndex: number): number {
  const player = state.players[playerIndex];
  if (!player) return 0;
  return Math.min(state.currentBet - player.currentBet, player.stack);
}

/**
 * Check if all active players have matched the current bet
 */
export function allPlayersMatched(state: TableState): boolean {
  const activePlayers = getActingPlayers(state);

  for (const player of activePlayers) {
    if (player.currentBet < state.currentBet && player.stack > 0) {
      return false;
    }
  }

  return true;
}

/**
 * Check if betting round is complete
 */
export function isBettingRoundComplete(state: TableState): boolean {
  const actingPlayers = getActingPlayers(state);

  // Only one player left = round complete
  if (actingPlayers.length <= 1) return true;

  // All active players must have acted at least once
  // and all bets must be matched
  if (state.actionsThisRound < actingPlayers.length) return false;

  return allPlayersMatched(state);
}

/**
 * Check if only one player remains (others folded)
 */
export function isOnlyOnePlayerRemaining(state: TableState): boolean {
  const activePlayers = getActivePlayers(state);
  return activePlayers.length === 1;
}

/**
 * Get next active player index (for turn rotation)
 */
export function getNextActivePlayerIndex(state: TableState, fromIndex: number): number {
  const numPlayers = state.players.length;

  for (let i = 1; i <= numPlayers; i++) {
    const nextIndex = (fromIndex + i) % numPlayers;
    const player = state.players[nextIndex];
    if (player.status === 'active') {
      return nextIndex;
    }
  }

  return -1; // No active players
}

// ============================================================================
// State Update Functions
// ============================================================================

/**
 * Update a single player in the state
 */
export function updatePlayer(
  state: TableState,
  playerIndex: number,
  updates: Partial<Player>
): TableState {
  const newPlayers = state.players.map((p, i) =>
    i === playerIndex ? { ...p, ...updates } : p
  );
  return { ...state, players: newPlayers };
}

/**
 * Move to next street
 */
export function advanceStreet(state: TableState): TableState {
  const streetOrder: Street[] = ['waiting', 'preflop', 'flop', 'turn', 'river', 'showdown', 'complete'];
  const currentIndex = streetOrder.indexOf(state.street);

  if (currentIndex === -1 || currentIndex >= streetOrder.length - 1) {
    return state;
  }

  const nextStreet = streetOrder[currentIndex + 1];

  // Reset betting round state for new street
  const newPlayers = state.players.map(p => ({
    ...p,
    currentBet: 0,
  }));

  // First to act is left of dealer (or first active player)
  const firstToAct = getNextActivePlayerIndex(
    { ...state, players: newPlayers },
    state.dealerIndex
  );

  return {
    ...state,
    players: newPlayers,
    street: nextStreet,
    currentBet: 0,
    minRaise: state.bigBlind,
    activePlayerIndex: firstToAct,
    lastRaiserIndex: -1,
    actionsThisRound: 0,
  };
}

/**
 * Add community cards
 */
export function addCommunityCards(state: TableState, cards: readonly Card[]): TableState {
  return {
    ...state,
    communityCards: [...state.communityCards, ...cards],
  };
}

/**
 * Add to pot
 */
export function addToPot(state: TableState, amount: number): TableState {
  return {
    ...state,
    pot: state.pot + amount,
  };
}

/**
 * Set winners
 */
export function setWinners(
  state: TableState,
  winners: readonly number[],
  description: string
): TableState {
  return {
    ...state,
    winners,
    winningHandDescription: description,
    street: 'complete',
  };
}

/**
 * Reset table for new hand
 */
export function resetForNewHand(state: TableState): TableState {
  const newDealerIndex = (state.dealerIndex + 1) % state.players.length;

  const newPlayers = state.players.map((p, i) => ({
    ...p,
    holeCards: [],
    status: p.stack > 0 ? 'active' as PlayerStatus : 'out' as PlayerStatus,
    currentBet: 0,
    totalBetThisHand: 0,
    isDealer: i === newDealerIndex,
  }));

  return {
    ...state,
    players: newPlayers,
    dealerIndex: newDealerIndex,
    street: 'waiting',
    communityCards: [],
    pot: 0,
    currentBet: 0,
    activePlayerIndex: 0,
    minRaise: state.bigBlind,
    lastRaiserIndex: -1,
    actionsThisRound: 0,
    handNumber: state.handNumber + 1,
    winners: [],
    winningHandDescription: '',
  };
}
