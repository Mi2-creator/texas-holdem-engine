/**
 * GameReducers.ts
 * Phase 16 - Pure state transition functions
 *
 * All reducers are pure functions that take state + command → new state.
 * No side effects, deterministic, and suitable for replay.
 */

import { PlayerId } from '../../security/Identity';
import { TableId, HandId } from '../../security/AuditLog';
import {
  TableState,
  Player,
  Street,
  PlayerStatus,
  createPlayer,
  createTableState,
  updatePlayer,
  advanceStreet,
  addCommunityCards,
  addToPot,
  setWinners,
  resetForNewHand,
  getActivePlayers,
  getActingPlayers,
  getSmallBlindIndex,
  getBigBlindIndex,
  getNextActivePlayerIndex,
  getCallAmount,
  isBettingRoundComplete,
  isOnlyOnePlayerRemaining,
} from './TableState';
import { Card, parseCard } from './Card';
import { Deck, createShuffledDeck, dealCards } from './Deck';
import {
  GameCommand,
  PlayerActionType,
} from './GameCommands';
import {
  applyAction,
  postBlinds,
  getValidActions,
  PlayerAction,
} from './BettingRound';

// ============================================================================
// Hand State (Extended TableState for active hand)
// ============================================================================

export interface HandState {
  readonly tableState: TableState;
  readonly handId: HandId;
  readonly tableId: TableId;
  readonly deck: Deck;
  readonly phase: HandPhase;
  readonly startTime: number;
  readonly lastActionTime: number;
  readonly actionHistory: readonly ActionRecord[];
}

export type HandPhase =
  | 'WAITING'
  | 'BLINDS'
  | 'DEALING'
  | 'PREFLOP'
  | 'FLOP'
  | 'TURN'
  | 'RIVER'
  | 'SHOWDOWN'
  | 'SETTLEMENT'
  | 'COMPLETE';

export interface ActionRecord {
  readonly playerId: PlayerId;
  readonly action: string;
  readonly amount: number;
  readonly street: Street;
  readonly timestamp: number;
}

// ============================================================================
// Reducer Result Type
// ============================================================================

export interface ReducerResult {
  readonly success: boolean;
  readonly state: HandState;
  readonly error?: string;
}

// ============================================================================
// State Factory
// ============================================================================

export function createInitialHandState(
  tableId: TableId,
  handId: HandId,
  players: readonly { id: string; name: string; stack: number; seat: number }[],
  smallBlind: number,
  bigBlind: number,
  dealerIndex: number
): HandState {
  const tablePlayers: Player[] = players.map((p, index) => ({
    id: p.id,
    name: p.name,
    stack: p.stack,
    holeCards: [],
    status: 'active' as PlayerStatus,
    currentBet: 0,
    totalBetThisHand: 0,
    isDealer: index === dealerIndex,
    seat: p.seat,
  }));

  const tableState: TableState = {
    players: tablePlayers,
    dealerIndex,
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
    handNumber: 1,
    winners: [],
    winningHandDescription: '',
  };

  return {
    tableState,
    handId,
    tableId,
    deck: createShuffledDeck(),
    phase: 'WAITING',
    startTime: Date.now(),
    lastActionTime: Date.now(),
    actionHistory: [],
  };
}

// ============================================================================
// Core Reducers
// ============================================================================

/**
 * Post blinds and transition to dealing phase
 */
export function reducePostBlinds(state: HandState): ReducerResult {
  if (state.phase !== 'WAITING') {
    return {
      success: false,
      state,
      error: `Cannot post blinds in phase ${state.phase}`,
    };
  }

  // Use existing postBlinds function
  const newTableState = postBlinds(state.tableState);

  return {
    success: true,
    state: {
      ...state,
      tableState: {
        ...newTableState,
        street: 'preflop',
      },
      phase: 'BLINDS',
      lastActionTime: Date.now(),
    },
  };
}

/**
 * Deal hole cards to all players
 */
export function reduceDealHoleCards(state: HandState): ReducerResult {
  if (state.phase !== 'BLINDS') {
    return {
      success: false,
      state,
      error: `Cannot deal hole cards in phase ${state.phase}`,
    };
  }

  let deck = state.deck;
  const newPlayers: Player[] = [];

  for (const player of state.tableState.players) {
    if (player.status === 'active' || player.status === 'all-in') {
      const [cards, newDeck] = dealCards(deck, 2);
      deck = newDeck;
      newPlayers.push({
        ...player,
        holeCards: cards,
      });
    } else {
      newPlayers.push(player);
    }
  }

  return {
    success: true,
    state: {
      ...state,
      tableState: {
        ...state.tableState,
        players: newPlayers,
      },
      deck,
      phase: 'PREFLOP',
      lastActionTime: Date.now(),
    },
  };
}

/**
 * Process a player action
 */
export function reducePlayerAction(
  state: HandState,
  playerId: PlayerId,
  actionType: PlayerActionType,
  amount?: number
): ReducerResult {
  const validPhases: HandPhase[] = ['PREFLOP', 'FLOP', 'TURN', 'RIVER'];
  if (!validPhases.includes(state.phase)) {
    return {
      success: false,
      state,
      error: `Cannot perform action in phase ${state.phase}`,
    };
  }

  // Verify it's this player's turn
  const currentPlayer = state.tableState.players[state.tableState.activePlayerIndex];
  if (!currentPlayer || currentPlayer.id !== playerId) {
    return {
      success: false,
      state,
      error: `Not ${playerId}'s turn to act`,
    };
  }

  // Convert to PlayerAction
  const action: PlayerAction = {
    type: actionType,
    amount,
  };

  // Apply action using existing BettingRound logic
  const result = applyAction(state.tableState, action);

  if (!result.success) {
    return {
      success: false,
      state,
      error: result.error,
    };
  }

  // Determine amount for action record
  let recordedAmount = 0;
  if (actionType === 'bet' || actionType === 'raise') {
    recordedAmount = amount ?? 0;
  } else if (actionType === 'call') {
    recordedAmount = getCallAmount(state.tableState, state.tableState.activePlayerIndex);
  } else if (actionType === 'all-in') {
    recordedAmount = currentPlayer.stack;
  }

  const actionRecord: ActionRecord = {
    playerId,
    action: actionType,
    amount: recordedAmount,
    street: state.tableState.street,
    timestamp: Date.now(),
  };

  return {
    success: true,
    state: {
      ...state,
      tableState: result.newState,
      lastActionTime: Date.now(),
      actionHistory: [...state.actionHistory, actionRecord],
    },
  };
}

/**
 * Deal community cards (flop, turn, or river)
 */
export function reduceDealCommunity(
  state: HandState,
  street: 'flop' | 'turn' | 'river'
): ReducerResult {
  const expectedPhase: Record<string, HandPhase> = {
    flop: 'PREFLOP',
    turn: 'FLOP',
    river: 'TURN',
  };

  if (state.phase !== expectedPhase[street]) {
    return {
      success: false,
      state,
      error: `Cannot deal ${street} in phase ${state.phase}`,
    };
  }

  const cardCount = street === 'flop' ? 3 : 1;
  const [cards, newDeck] = dealCards(state.deck, cardCount);

  const newTableState = addCommunityCards(state.tableState, cards);

  // Reset betting for new street
  const resetPlayers = newTableState.players.map(p => ({
    ...p,
    currentBet: 0,
  }));

  // First to act is left of dealer
  const firstToAct = getNextActivePlayerIndex(
    { ...newTableState, players: resetPlayers },
    newTableState.dealerIndex
  );

  const phaseMap: Record<string, HandPhase> = {
    flop: 'FLOP',
    turn: 'TURN',
    river: 'RIVER',
  };

  const streetMap: Record<string, Street> = {
    flop: 'flop',
    turn: 'turn',
    river: 'river',
  };

  return {
    success: true,
    state: {
      ...state,
      tableState: {
        ...newTableState,
        players: resetPlayers,
        street: streetMap[street],
        currentBet: 0,
        activePlayerIndex: firstToAct,
        lastRaiserIndex: -1,
        actionsThisRound: 0,
      },
      deck: newDeck,
      phase: phaseMap[street],
      lastActionTime: Date.now(),
    },
  };
}

/**
 * Transition to showdown phase
 */
export function reduceStartShowdown(state: HandState): ReducerResult {
  if (state.phase !== 'RIVER') {
    return {
      success: false,
      state,
      error: `Cannot start showdown in phase ${state.phase}`,
    };
  }

  return {
    success: true,
    state: {
      ...state,
      tableState: {
        ...state.tableState,
        street: 'showdown',
      },
      phase: 'SHOWDOWN',
      lastActionTime: Date.now(),
    },
  };
}

/**
 * Award pot to winner(s) and complete hand
 */
export function reduceSettlePot(
  state: HandState,
  winnerIds: readonly PlayerId[],
  amounts: ReadonlyMap<PlayerId, number>,
  handDescription: string
): ReducerResult {
  if (state.phase !== 'SHOWDOWN' && state.phase !== 'PREFLOP' && state.phase !== 'FLOP' && state.phase !== 'TURN' && state.phase !== 'RIVER') {
    return {
      success: false,
      state,
      error: `Cannot settle pot in phase ${state.phase}`,
    };
  }

  // Update player stacks
  const newPlayers = state.tableState.players.map(p => {
    const winAmount = amounts.get(p.id) ?? 0;
    return {
      ...p,
      stack: p.stack + winAmount,
    };
  });

  // Get winner indices
  const winnerIndices = winnerIds
    .map(id => state.tableState.players.findIndex(p => p.id === id))
    .filter(idx => idx >= 0);

  return {
    success: true,
    state: {
      ...state,
      tableState: {
        ...state.tableState,
        players: newPlayers,
        winners: winnerIndices,
        winningHandDescription: handDescription,
        street: 'complete',
      },
      phase: 'SETTLEMENT',
      lastActionTime: Date.now(),
    },
  };
}

/**
 * End hand and mark complete
 */
export function reduceEndHand(
  state: HandState,
  reason: 'showdown' | 'all-fold' | 'all-in-runout'
): ReducerResult {
  return {
    success: true,
    state: {
      ...state,
      tableState: {
        ...state.tableState,
        street: 'complete',
      },
      phase: 'COMPLETE',
      lastActionTime: Date.now(),
    },
  };
}

// ============================================================================
// Query Functions
// ============================================================================

/**
 * Check if betting round is complete
 */
export function isBettingComplete(state: HandState): boolean {
  return isBettingRoundComplete(state.tableState);
}

/**
 * Check if only one player remains (all others folded)
 */
export function isAllFolded(state: HandState): boolean {
  return isOnlyOnePlayerRemaining(state.tableState);
}

/**
 * Check if all remaining players are all-in
 */
export function isAllPlayersAllIn(state: HandState): boolean {
  const activePlayers = getActivePlayers(state.tableState);
  const actingPlayers = getActingPlayers(state.tableState);

  // If there are active players but none can act, they're all-in
  return activePlayers.length > 1 && actingPlayers.length === 0;
}

/**
 * Get current player to act
 */
export function getCurrentPlayerId(state: HandState): PlayerId | null {
  const player = state.tableState.players[state.tableState.activePlayerIndex];
  return player?.id ?? null;
}

/**
 * Get valid actions for current player
 */
export function getValidActionsForCurrentPlayer(state: HandState): {
  canFold: boolean;
  canCheck: boolean;
  canCall: boolean;
  callAmount: number;
  canBet: boolean;
  minBet: number;
  maxBet: number;
  canRaise: boolean;
  minRaise: number;
  maxRaise: number;
} {
  return getValidActions(state.tableState);
}

/**
 * Get pot total
 */
export function getPotTotal(state: HandState): number {
  return state.tableState.pot;
}

/**
 * Get active players (not folded)
 */
export function getActivePlayerIds(state: HandState): readonly PlayerId[] {
  return getActivePlayers(state.tableState).map(p => p.id);
}

/**
 * Get players eligible for pot (contributed and not folded)
 */
export function getEligiblePlayers(state: HandState): readonly Player[] {
  return state.tableState.players.filter(
    p => (p.status === 'active' || p.status === 'all-in') && p.totalBetThisHand > 0
  );
}

/**
 * Get small blind player ID
 */
export function getSmallBlindPlayerId(state: HandState): PlayerId {
  const sbIndex = getSmallBlindIndex(state.tableState);
  return state.tableState.players[sbIndex].id;
}

/**
 * Get big blind player ID
 */
export function getBigBlindPlayerId(state: HandState): PlayerId {
  const bbIndex = getBigBlindIndex(state.tableState);
  return state.tableState.players[bbIndex].id;
}

/**
 * Determine next phase after betting round
 */
export function getNextPhase(state: HandState): HandPhase {
  if (isAllFolded(state)) {
    return 'SETTLEMENT';
  }

  if (isAllPlayersAllIn(state)) {
    // Run out remaining community cards
    switch (state.phase) {
      case 'PREFLOP': return 'FLOP';
      case 'FLOP': return 'TURN';
      case 'TURN': return 'RIVER';
      case 'RIVER': return 'SHOWDOWN';
      default: return 'SETTLEMENT';
    }
  }

  switch (state.phase) {
    case 'PREFLOP': return 'FLOP';
    case 'FLOP': return 'TURN';
    case 'TURN': return 'RIVER';
    case 'RIVER': return 'SHOWDOWN';
    default: return 'SETTLEMENT';
  }
}
