/**
 * CommandValidator.ts
 * Phase 17 - Command validation for the GameService layer
 *
 * Validates all commands before they reach the game engine.
 * Provides detailed error messages for invalid commands.
 * All validation is deterministic and stateless.
 */

import { PlayerId } from '../../security/Identity';
import { PlayerActionType } from '../engine/GameCommands';
import { HandState } from '../engine/GameReducers';
import { getValidActions } from '../engine/BettingRound';
import {
  ActionRequest,
  ActionError,
  ActionErrorCode,
  ValidActions,
  GameServiceConfig,
  JoinTableRequest,
  RebuyRequest,
  PlayerInfo,
} from './ServiceTypes';

// ============================================================================
// Validation Result Types
// ============================================================================

export interface ValidationResult {
  readonly valid: boolean;
  readonly error?: ActionError;
}

// ============================================================================
// Action Validation
// ============================================================================

/**
 * Validate a player action request
 */
export function validateActionRequest(
  request: ActionRequest,
  handState: HandState | null,
  config: GameServiceConfig
): ValidationResult {
  // Check if hand is in progress
  if (!handState) {
    return createError('HAND_NOT_IN_PROGRESS', 'No hand is currently in progress');
  }

  // Check valid phases for actions
  const validPhases = ['PREFLOP', 'FLOP', 'TURN', 'RIVER'];
  if (!validPhases.includes(handState.phase)) {
    return createError(
      'HAND_NOT_IN_PROGRESS',
      `Cannot act during ${handState.phase} phase`
    );
  }

  // Find the player
  const player = handState.tableState.players.find(p => p.id === request.playerId);
  if (!player) {
    return createError('PLAYER_NOT_FOUND', `Player ${request.playerId} not found`);
  }

  // Check if player is active
  if (player.status !== 'active') {
    return createError(
      'PLAYER_NOT_ACTIVE',
      `Player ${request.playerId} is ${player.status}`
    );
  }

  // Check if it's this player's turn
  const currentPlayer = handState.tableState.players[handState.tableState.activePlayerIndex];
  if (!currentPlayer || currentPlayer.id !== request.playerId) {
    return createError(
      'NOT_YOUR_TURN',
      `It is not ${request.playerId}'s turn to act`
    );
  }

  // Get valid actions
  const validActions = getValidActions(handState.tableState);

  // Validate the specific action
  return validateSpecificAction(request, validActions, player.stack);
}

/**
 * Validate a specific action against valid actions
 */
function validateSpecificAction(
  request: ActionRequest,
  validActions: ReturnType<typeof getValidActions>,
  playerStack: number
): ValidationResult {
  switch (request.action) {
    case 'fold':
      if (!validActions.canFold) {
        return createError('INVALID_ACTION', 'Cannot fold at this time');
      }
      return { valid: true };

    case 'check':
      if (!validActions.canCheck) {
        return createError(
          'INVALID_ACTION',
          'Cannot check, must call or fold'
        );
      }
      return { valid: true };

    case 'call':
      if (!validActions.canCall) {
        return createError('INVALID_ACTION', 'Cannot call at this time');
      }
      return { valid: true };

    case 'bet':
      if (!validActions.canBet) {
        return createError(
          'INVALID_ACTION',
          'Cannot bet, there is already a bet in play'
        );
      }
      return validateBetAmount(request.amount, validActions.minBet, validActions.maxBet);

    case 'raise':
      if (!validActions.canRaise) {
        return createError('INVALID_ACTION', 'Cannot raise at this time');
      }
      return validateRaiseAmount(request.amount, validActions.minRaise, validActions.maxRaise);

    case 'all-in':
      if (playerStack <= 0) {
        return createError('INSUFFICIENT_CHIPS', 'No chips to go all-in');
      }
      return { valid: true };

    default:
      return createError('INVALID_ACTION', `Unknown action: ${request.action}`);
  }
}

/**
 * Validate bet amount
 */
function validateBetAmount(
  amount: number | undefined,
  minBet: number,
  maxBet: number
): ValidationResult {
  if (amount === undefined) {
    return createError('INVALID_AMOUNT', 'Bet requires an amount');
  }

  if (amount < minBet) {
    return createError(
      'INVALID_AMOUNT',
      `Bet must be at least ${minBet}`,
      { minBet, providedAmount: amount }
    );
  }

  if (amount > maxBet) {
    return createError(
      'INVALID_AMOUNT',
      `Bet cannot exceed ${maxBet}`,
      { maxBet, providedAmount: amount }
    );
  }

  if (!Number.isInteger(amount)) {
    return createError('INVALID_AMOUNT', 'Bet amount must be a whole number');
  }

  return { valid: true };
}

/**
 * Validate raise amount
 */
function validateRaiseAmount(
  amount: number | undefined,
  minRaise: number,
  maxRaise: number
): ValidationResult {
  if (amount === undefined) {
    return createError('INVALID_AMOUNT', 'Raise requires an amount');
  }

  if (amount < minRaise) {
    return createError(
      'INVALID_AMOUNT',
      `Raise must be at least ${minRaise}`,
      { minRaise, providedAmount: amount }
    );
  }

  if (amount > maxRaise) {
    return createError(
      'INVALID_AMOUNT',
      `Raise cannot exceed ${maxRaise}`,
      { maxRaise, providedAmount: amount }
    );
  }

  if (!Number.isInteger(amount)) {
    return createError('INVALID_AMOUNT', 'Raise amount must be a whole number');
  }

  return { valid: true };
}

// ============================================================================
// Table Management Validation
// ============================================================================

/**
 * Validate join table request
 */
export function validateJoinTableRequest(
  request: JoinTableRequest,
  existingPlayers: readonly PlayerInfo[],
  config: GameServiceConfig
): ValidationResult {
  // Check if player already at table
  if (existingPlayers.some(p => p.id === request.playerId)) {
    return createError(
      'INVALID_ACTION',
      `Player ${request.playerId} is already at the table`
    );
  }

  // Check if table is full
  if (existingPlayers.length >= config.maxPlayers) {
    return createError(
      'INVALID_ACTION',
      `Table is full (max ${config.maxPlayers} players)`
    );
  }

  // Check buy-in amount
  if (request.buyInAmount < config.bigBlind * 10) {
    return createError(
      'INVALID_AMOUNT',
      `Buy-in must be at least ${config.bigBlind * 10} (10 big blinds)`,
      { minBuyIn: config.bigBlind * 10, providedAmount: request.buyInAmount }
    );
  }

  if (request.buyInAmount > config.bigBlind * 200) {
    return createError(
      'INVALID_AMOUNT',
      `Buy-in cannot exceed ${config.bigBlind * 200} (200 big blinds)`,
      { maxBuyIn: config.bigBlind * 200, providedAmount: request.buyInAmount }
    );
  }

  // Check preferred seat if specified
  if (request.preferredSeat !== undefined) {
    if (request.preferredSeat < 0 || request.preferredSeat >= config.maxPlayers) {
      return createError(
        'INVALID_ACTION',
        `Invalid seat number: ${request.preferredSeat}`
      );
    }

    if (existingPlayers.some(p => p.seat === request.preferredSeat)) {
      return createError(
        'INVALID_ACTION',
        `Seat ${request.preferredSeat} is already taken`
      );
    }
  }

  // Validate player name
  if (!request.playerName || request.playerName.trim().length === 0) {
    return createError('INVALID_ACTION', 'Player name is required');
  }

  if (request.playerName.length > 20) {
    return createError('INVALID_ACTION', 'Player name cannot exceed 20 characters');
  }

  return { valid: true };
}

/**
 * Validate rebuy request
 */
export function validateRebuyRequest(
  request: RebuyRequest,
  player: PlayerInfo | undefined,
  isHandInProgress: boolean,
  config: GameServiceConfig
): ValidationResult {
  // Check if player exists
  if (!player) {
    return createError('PLAYER_NOT_FOUND', `Player ${request.playerId} not found`);
  }

  // Check if hand is in progress
  if (isHandInProgress) {
    return createError(
      'INVALID_ACTION',
      'Cannot rebuy during an active hand'
    );
  }

  // Check rebuy amount
  if (request.amount < config.bigBlind * 10) {
    return createError(
      'INVALID_AMOUNT',
      `Rebuy must be at least ${config.bigBlind * 10}`,
      { minRebuy: config.bigBlind * 10, providedAmount: request.amount }
    );
  }

  // Check total stack after rebuy
  const newStack = player.stack + request.amount;
  if (newStack > config.bigBlind * 200) {
    return createError(
      'INVALID_AMOUNT',
      `Stack cannot exceed ${config.bigBlind * 200} after rebuy`,
      { maxStack: config.bigBlind * 200, resultingStack: newStack }
    );
  }

  return { valid: true };
}

/**
 * Validate leave table request
 */
export function validateLeaveTableRequest(
  playerId: PlayerId,
  player: PlayerInfo | undefined,
  isHandInProgress: boolean,
  isPlayerInHand: boolean
): ValidationResult {
  // Check if player exists
  if (!player) {
    return createError('PLAYER_NOT_FOUND', `Player ${playerId} not found`);
  }

  // Check if player is in active hand
  if (isHandInProgress && isPlayerInHand) {
    return createError(
      'INVALID_ACTION',
      'Cannot leave table during an active hand you are participating in'
    );
  }

  return { valid: true };
}

// ============================================================================
// Hand Start Validation
// ============================================================================

/**
 * Validate conditions for starting a new hand
 */
export function validateHandStart(
  players: readonly PlayerInfo[],
  config: GameServiceConfig
): ValidationResult {
  // Count active players with sufficient chips
  const activePlayers = players.filter(
    p => p.isActive && p.stack >= config.bigBlind
  );

  if (activePlayers.length < config.minPlayers) {
    return createError(
      'INVALID_ACTION',
      `Need at least ${config.minPlayers} players with chips to start hand`,
      { activePlayers: activePlayers.length, required: config.minPlayers }
    );
  }

  return { valid: true };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create an error result
 */
function createError(
  code: ActionErrorCode,
  message: string,
  details?: Record<string, unknown>
): ValidationResult {
  return {
    valid: false,
    error: {
      code,
      message,
      details,
    },
  };
}

/**
 * Get valid actions for a player in current state
 */
export function getPlayerValidActions(
  playerId: PlayerId,
  handState: HandState | null
): ValidActions | null {
  if (!handState) return null;

  const player = handState.tableState.players.find(p => p.id === playerId);
  if (!player) return null;

  const currentPlayer = handState.tableState.players[handState.tableState.activePlayerIndex];
  if (!currentPlayer || currentPlayer.id !== playerId) return null;

  const va = getValidActions(handState.tableState);

  return {
    canFold: va.canFold,
    canCheck: va.canCheck,
    canCall: va.canCall,
    callAmount: va.callAmount,
    canBet: va.canBet,
    minBet: va.minBet,
    maxBet: va.maxBet,
    canRaise: va.canRaise,
    minRaise: va.minRaise,
    maxRaise: va.maxRaise,
    canAllIn: player.stack > 0,
    allInAmount: player.stack,
  };
}
