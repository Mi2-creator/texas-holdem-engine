/**
 * GameCommands.ts
 * Phase 16 - Command types for game actions
 *
 * Commands represent player intents that trigger state transitions.
 * All commands are immutable and validated before execution.
 */

import { PlayerId } from '../../security/Identity';
import { TableId, HandId } from '../../security/AuditLog';

// ============================================================================
// Command Types
// ============================================================================

export type CommandType =
  | 'START_HAND'
  | 'POST_BLIND'
  | 'DEAL_HOLE_CARDS'
  | 'DEAL_COMMUNITY'
  | 'PLAYER_ACTION'
  | 'ADVANCE_STREET'
  | 'SHOWDOWN'
  | 'SETTLE_POT'
  | 'END_HAND';

// ============================================================================
// Base Command Interface
// ============================================================================

export interface BaseCommand {
  readonly type: CommandType;
  readonly timestamp: number;
  readonly commandId: string;
}

// ============================================================================
// Specific Commands
// ============================================================================

/**
 * Start a new hand
 */
export interface StartHandCommand extends BaseCommand {
  readonly type: 'START_HAND';
  readonly tableId: TableId;
  readonly handId: HandId;
  readonly dealerSeat: number;
}

/**
 * Post blinds (SB or BB)
 */
export interface PostBlindCommand extends BaseCommand {
  readonly type: 'POST_BLIND';
  readonly playerId: PlayerId;
  readonly blindType: 'small' | 'big';
  readonly amount: number;
}

/**
 * Deal hole cards to players
 */
export interface DealHoleCardsCommand extends BaseCommand {
  readonly type: 'DEAL_HOLE_CARDS';
  readonly cards: ReadonlyMap<PlayerId, readonly [string, string]>; // Card notation
}

/**
 * Deal community cards
 */
export interface DealCommunityCommand extends BaseCommand {
  readonly type: 'DEAL_COMMUNITY';
  readonly cards: readonly string[]; // Card notation
  readonly street: 'flop' | 'turn' | 'river';
}

/**
 * Player action during betting
 */
export interface PlayerActionCommand extends BaseCommand {
  readonly type: 'PLAYER_ACTION';
  readonly playerId: PlayerId;
  readonly action: PlayerActionType;
  readonly amount?: number;
}

export type PlayerActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'all-in';

/**
 * Advance to next street
 */
export interface AdvanceStreetCommand extends BaseCommand {
  readonly type: 'ADVANCE_STREET';
  readonly fromStreet: string;
  readonly toStreet: string;
}

/**
 * Trigger showdown
 */
export interface ShowdownCommand extends BaseCommand {
  readonly type: 'SHOWDOWN';
}

/**
 * Settle pot and award chips
 */
export interface SettlePotCommand extends BaseCommand {
  readonly type: 'SETTLE_POT';
  readonly winnerIds: readonly PlayerId[];
  readonly amounts: ReadonlyMap<PlayerId, number>;
  readonly handDescription: string;
}

/**
 * End hand and cleanup
 */
export interface EndHandCommand extends BaseCommand {
  readonly type: 'END_HAND';
  readonly reason: HandEndReason;
}

export type HandEndReason = 'showdown' | 'all-fold' | 'all-in-runout';

// ============================================================================
// Command Union Type
// ============================================================================

export type GameCommand =
  | StartHandCommand
  | PostBlindCommand
  | DealHoleCardsCommand
  | DealCommunityCommand
  | PlayerActionCommand
  | AdvanceStreetCommand
  | ShowdownCommand
  | SettlePotCommand
  | EndHandCommand;

// ============================================================================
// Command Factories
// ============================================================================

let commandCounter = 0;

function generateCommandId(): string {
  return `cmd_${Date.now()}_${++commandCounter}`;
}

export function createStartHandCommand(
  tableId: TableId,
  handId: HandId,
  dealerSeat: number
): StartHandCommand {
  return {
    type: 'START_HAND',
    timestamp: Date.now(),
    commandId: generateCommandId(),
    tableId,
    handId,
    dealerSeat,
  };
}

export function createPostBlindCommand(
  playerId: PlayerId,
  blindType: 'small' | 'big',
  amount: number
): PostBlindCommand {
  return {
    type: 'POST_BLIND',
    timestamp: Date.now(),
    commandId: generateCommandId(),
    playerId,
    blindType,
    amount,
  };
}

export function createDealHoleCardsCommand(
  cards: ReadonlyMap<PlayerId, readonly [string, string]>
): DealHoleCardsCommand {
  return {
    type: 'DEAL_HOLE_CARDS',
    timestamp: Date.now(),
    commandId: generateCommandId(),
    cards,
  };
}

export function createDealCommunityCommand(
  cards: readonly string[],
  street: 'flop' | 'turn' | 'river'
): DealCommunityCommand {
  return {
    type: 'DEAL_COMMUNITY',
    timestamp: Date.now(),
    commandId: generateCommandId(),
    cards,
    street,
  };
}

export function createPlayerActionCommand(
  playerId: PlayerId,
  action: PlayerActionType,
  amount?: number
): PlayerActionCommand {
  return {
    type: 'PLAYER_ACTION',
    timestamp: Date.now(),
    commandId: generateCommandId(),
    playerId,
    action,
    amount,
  };
}

export function createAdvanceStreetCommand(
  fromStreet: string,
  toStreet: string
): AdvanceStreetCommand {
  return {
    type: 'ADVANCE_STREET',
    timestamp: Date.now(),
    commandId: generateCommandId(),
    fromStreet,
    toStreet,
  };
}

export function createShowdownCommand(): ShowdownCommand {
  return {
    type: 'SHOWDOWN',
    timestamp: Date.now(),
    commandId: generateCommandId(),
  };
}

export function createSettlePotCommand(
  winnerIds: readonly PlayerId[],
  amounts: ReadonlyMap<PlayerId, number>,
  handDescription: string
): SettlePotCommand {
  return {
    type: 'SETTLE_POT',
    timestamp: Date.now(),
    commandId: generateCommandId(),
    winnerIds,
    amounts,
    handDescription,
  };
}

export function createEndHandCommand(reason: HandEndReason): EndHandCommand {
  return {
    type: 'END_HAND',
    timestamp: Date.now(),
    commandId: generateCommandId(),
    reason,
  };
}

// ============================================================================
// Command Validation
// ============================================================================

export interface CommandValidationResult {
  readonly valid: boolean;
  readonly error?: string;
}

export function validateCommand(command: GameCommand): CommandValidationResult {
  if (!command.type) {
    return { valid: false, error: 'Command must have a type' };
  }

  if (!command.timestamp || command.timestamp <= 0) {
    return { valid: false, error: 'Command must have a valid timestamp' };
  }

  if (!command.commandId) {
    return { valid: false, error: 'Command must have a commandId' };
  }

  switch (command.type) {
    case 'START_HAND':
      if (!command.tableId || !command.handId) {
        return { valid: false, error: 'START_HAND requires tableId and handId' };
      }
      break;

    case 'POST_BLIND':
      if (!command.playerId || !command.blindType || command.amount <= 0) {
        return { valid: false, error: 'POST_BLIND requires playerId, blindType, and positive amount' };
      }
      break;

    case 'DEAL_HOLE_CARDS':
      if (!command.cards || command.cards.size === 0) {
        return { valid: false, error: 'DEAL_HOLE_CARDS requires cards' };
      }
      break;

    case 'DEAL_COMMUNITY':
      if (!command.cards || command.cards.length === 0 || !command.street) {
        return { valid: false, error: 'DEAL_COMMUNITY requires cards and street' };
      }
      break;

    case 'PLAYER_ACTION':
      if (!command.playerId || !command.action) {
        return { valid: false, error: 'PLAYER_ACTION requires playerId and action' };
      }
      if ((command.action === 'bet' || command.action === 'raise') && !command.amount) {
        return { valid: false, error: 'bet/raise actions require amount' };
      }
      break;

    case 'SETTLE_POT':
      if (!command.winnerIds || command.winnerIds.length === 0) {
        return { valid: false, error: 'SETTLE_POT requires at least one winner' };
      }
      break;

    case 'END_HAND':
      if (!command.reason) {
        return { valid: false, error: 'END_HAND requires a reason' };
      }
      break;
  }

  return { valid: true };
}
