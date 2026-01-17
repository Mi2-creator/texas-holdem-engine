/**
 * BettingRound.ts
 * Phase L1 - Betting logic for Texas Hold'em
 *
 * Handles action validation and state updates for betting rounds.
 */

import {
  TableState,
  Player,
  getCallAmount,
  getNextActivePlayerIndex,
  updatePlayer,
  addToPot,
} from './TableState';

// ============================================================================
// Types
// ============================================================================

export type ActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'all-in';

export interface PlayerAction {
  readonly type: ActionType;
  readonly amount?: number; // For bet/raise
}

export interface ValidActions {
  readonly canFold: boolean;
  readonly canCheck: boolean;
  readonly canCall: boolean;
  readonly callAmount: number;
  readonly canBet: boolean;
  readonly minBet: number;
  readonly maxBet: number;
  readonly canRaise: boolean;
  readonly minRaise: number;
  readonly maxRaise: number;
}

export interface ActionResult {
  readonly success: boolean;
  readonly newState: TableState;
  readonly error?: string;
}

// ============================================================================
// Action Validation
// ============================================================================

/**
 * Get valid actions for the current player
 */
export function getValidActions(state: TableState): ValidActions {
  const player = state.players[state.activePlayerIndex];

  if (!player || player.status !== 'active') {
    return {
      canFold: false,
      canCheck: false,
      canCall: false,
      callAmount: 0,
      canBet: false,
      minBet: 0,
      maxBet: 0,
      canRaise: false,
      minRaise: 0,
      maxRaise: 0,
    };
  }

  const callAmount = getCallAmount(state, state.activePlayerIndex);
  const canCheck = callAmount === 0;
  // Can call if there's something to call and we have chips (includes all-in calls)
  const canCall = callAmount > 0 && player.stack > 0;
  const canFold = true;

  // Betting (when no one has bet yet)
  const canBet = state.currentBet === 0 && player.stack > 0;
  const minBet = canBet ? state.bigBlind : 0;
  const maxBet = canBet ? player.stack : 0;

  // Raising (when there's a bet to raise)
  // Must have chips beyond the call amount to raise
  const hasChipsToRaise = player.stack > callAmount;
  const minRaiseAmount = state.minRaise;
  const minRaiseTotal = state.currentBet + minRaiseAmount;
  const maxRaiseTotal = player.stack + player.currentBet;
  // Can only raise if we can afford at least the minimum raise
  const canRaise = state.currentBet > 0 && hasChipsToRaise && maxRaiseTotal >= minRaiseTotal;
  const minRaise = canRaise ? minRaiseTotal : 0;
  const maxRaise = canRaise ? maxRaiseTotal : 0;

  return {
    canFold,
    canCheck,
    canCall,
    callAmount,
    canBet,
    minBet,
    maxBet,
    canRaise,
    minRaise,
    maxRaise,
  };
}

/**
 * Validate an action
 */
export function validateAction(
  state: TableState,
  action: PlayerAction
): { valid: boolean; error?: string } {
  const validActions = getValidActions(state);
  const player = state.players[state.activePlayerIndex];

  if (!player) {
    return { valid: false, error: 'No active player' };
  }

  switch (action.type) {
    case 'fold':
      if (!validActions.canFold) {
        return { valid: false, error: 'Cannot fold' };
      }
      break;

    case 'check':
      if (!validActions.canCheck) {
        return { valid: false, error: 'Cannot check, must call or fold' };
      }
      break;

    case 'call':
      if (!validActions.canCall) {
        return { valid: false, error: 'Cannot call' };
      }
      break;

    case 'bet':
      if (!validActions.canBet) {
        return { valid: false, error: 'Cannot bet, already a bet in play' };
      }
      if (!action.amount || action.amount < validActions.minBet) {
        return { valid: false, error: `Minimum bet is ${validActions.minBet}` };
      }
      if (action.amount > validActions.maxBet) {
        return { valid: false, error: `Maximum bet is ${validActions.maxBet}` };
      }
      break;

    case 'raise':
      if (!validActions.canRaise) {
        return { valid: false, error: 'Cannot raise' };
      }
      if (!action.amount || action.amount < validActions.minRaise) {
        return { valid: false, error: `Minimum raise to ${validActions.minRaise}` };
      }
      if (action.amount > validActions.maxRaise) {
        return { valid: false, error: `Maximum raise to ${validActions.maxRaise}` };
      }
      break;

    case 'all-in':
      if (player.stack <= 0) {
        return { valid: false, error: 'No chips to go all-in' };
      }
      break;

    default:
      return { valid: false, error: 'Unknown action type' };
  }

  return { valid: true };
}

// ============================================================================
// Action Application
// ============================================================================

/**
 * Apply an action and return new state
 */
export function applyAction(
  state: TableState,
  action: PlayerAction
): ActionResult {
  const validation = validateAction(state, action);
  if (!validation.valid) {
    return { success: false, newState: state, error: validation.error };
  }

  const playerIndex = state.activePlayerIndex;
  const player = state.players[playerIndex];
  let newState = state;

  switch (action.type) {
    case 'fold':
      newState = updatePlayer(newState, playerIndex, { status: 'folded' });
      break;

    case 'check':
      // No state change needed
      break;

    case 'call': {
      const callAmount = getCallAmount(state, playerIndex);
      const newStack = player.stack - callAmount;
      newState = updatePlayer(newState, playerIndex, {
        stack: newStack,
        currentBet: player.currentBet + callAmount,
        totalBetThisHand: player.totalBetThisHand + callAmount,
        // Mark as all-in if stack is depleted
        status: newStack === 0 ? 'all-in' : player.status,
      });
      newState = addToPot(newState, callAmount);
      break;
    }

    case 'bet': {
      const betAmount = action.amount!;
      const newStack = player.stack - betAmount;
      newState = updatePlayer(newState, playerIndex, {
        stack: newStack,
        currentBet: betAmount,
        totalBetThisHand: player.totalBetThisHand + betAmount,
        // Mark as all-in if stack is depleted
        status: newStack === 0 ? 'all-in' : player.status,
      });
      newState = addToPot(newState, betAmount);
      newState = {
        ...newState,
        currentBet: betAmount,
        minRaise: betAmount, // Minimum raise is the bet amount
        lastRaiserIndex: playerIndex,
      };
      break;
    }

    case 'raise': {
      const raiseToAmount = action.amount!;
      const additionalAmount = raiseToAmount - player.currentBet;
      const raiseSize = raiseToAmount - state.currentBet;
      const newStack = player.stack - additionalAmount;

      newState = updatePlayer(newState, playerIndex, {
        stack: newStack,
        currentBet: raiseToAmount,
        totalBetThisHand: player.totalBetThisHand + additionalAmount,
        // Mark as all-in if stack is depleted
        status: newStack === 0 ? 'all-in' : player.status,
      });
      newState = addToPot(newState, additionalAmount);
      newState = {
        ...newState,
        currentBet: raiseToAmount,
        minRaise: raiseSize, // Minimum raise is the raise amount
        lastRaiserIndex: playerIndex,
      };
      break;
    }

    case 'all-in': {
      const allInAmount = player.stack;
      const newBet = player.currentBet + allInAmount;

      newState = updatePlayer(newState, playerIndex, {
        stack: 0,
        currentBet: newBet,
        totalBetThisHand: player.totalBetThisHand + allInAmount,
        status: 'all-in',
      });
      newState = addToPot(newState, allInAmount);

      // Update current bet if this is a raise
      if (newBet > state.currentBet) {
        const raiseSize = newBet - state.currentBet;
        newState = {
          ...newState,
          currentBet: newBet,
          minRaise: Math.max(state.minRaise, raiseSize),
          lastRaiserIndex: playerIndex,
        };
      }
      break;
    }
  }

  // Move to next player
  const nextPlayerIndex = getNextActivePlayerIndex(newState, playerIndex);
  newState = {
    ...newState,
    activePlayerIndex: nextPlayerIndex,
    actionsThisRound: state.actionsThisRound + 1,
  };

  return { success: true, newState };
}

// ============================================================================
// Preflop Blind Posting
// ============================================================================

/**
 * Post blinds for a new hand
 */
export function postBlinds(state: TableState): TableState {
  const numPlayers = state.players.length;

  // For heads-up (2 players): dealer is small blind
  // For 3+ players: left of dealer is small blind
  const sbIndex = numPlayers === 2
    ? state.dealerIndex
    : (state.dealerIndex + 1) % numPlayers;

  const bbIndex = (sbIndex + 1) % numPlayers;

  let newState = state;

  // Post small blind
  const sbPlayer = newState.players[sbIndex];
  const sbAmount = Math.min(state.smallBlind, sbPlayer.stack);
  newState = updatePlayer(newState, sbIndex, {
    stack: sbPlayer.stack - sbAmount,
    currentBet: sbAmount,
    totalBetThisHand: sbAmount,
  });
  newState = addToPot(newState, sbAmount);

  // Post big blind
  const bbPlayer = newState.players[bbIndex];
  const bbAmount = Math.min(state.bigBlind, bbPlayer.stack);
  newState = updatePlayer(newState, bbIndex, {
    stack: bbPlayer.stack - bbAmount,
    currentBet: bbAmount,
    totalBetThisHand: bbAmount,
  });
  newState = addToPot(newState, bbAmount);

  // Set current bet to big blind
  newState = {
    ...newState,
    currentBet: state.bigBlind,
    minRaise: state.bigBlind,
    // First to act preflop is left of big blind
    activePlayerIndex: (bbIndex + 1) % numPlayers,
    lastRaiserIndex: bbIndex, // BB is considered the last "raiser"
  };

  return newState;
}
