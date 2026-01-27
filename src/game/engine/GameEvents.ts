/**
 * GameEvents.ts
 * Phase 16 - Event types emitted during game state transitions
 *
 * Events are immutable records of state changes.
 * Used for replay, audit, and UI synchronization.
 */

import { PlayerId } from '../../security/Identity';
import { TableId, HandId } from '../../security/AuditLog';
import { Street } from './TableState';
import { Card } from './Card';

// ============================================================================
// Event Types
// ============================================================================

export type GameEventType =
  | 'HAND_STARTED'
  | 'BLINDS_POSTED'
  | 'HOLE_CARDS_DEALT'
  | 'STREET_CHANGED'
  | 'COMMUNITY_CARDS_DEALT'
  | 'PLAYER_ACTED'
  | 'PLAYER_TO_ACT'
  | 'BETTING_ROUND_COMPLETE'
  | 'SHOWDOWN_STARTED'
  | 'HAND_REVEALED'
  | 'POT_AWARDED'
  | 'HAND_ENDED'
  | 'ERROR';

// ============================================================================
// Base Event Interface
// ============================================================================

export interface BaseGameEvent {
  readonly type: GameEventType;
  readonly timestamp: number;
  readonly eventId: string;
  readonly handId: HandId;
  readonly tableId: TableId;
  readonly sequence: number;
}

// ============================================================================
// Specific Events
// ============================================================================

/**
 * Hand has started
 */
export interface HandStartedEvent extends BaseGameEvent {
  readonly type: 'HAND_STARTED';
  readonly handNumber: number;
  readonly dealerSeat: number;
  readonly smallBlindSeat: number;
  readonly bigBlindSeat: number;
  readonly playerIds: readonly PlayerId[];
  readonly playerStacks: ReadonlyMap<PlayerId, number>;
}

/**
 * Blinds have been posted
 */
export interface BlindsPostedEvent extends BaseGameEvent {
  readonly type: 'BLINDS_POSTED';
  readonly smallBlind: {
    readonly playerId: PlayerId;
    readonly amount: number;
  };
  readonly bigBlind: {
    readonly playerId: PlayerId;
    readonly amount: number;
  };
  readonly potTotal: number;
}

/**
 * Hole cards dealt to players
 */
export interface HoleCardsDealtEvent extends BaseGameEvent {
  readonly type: 'HOLE_CARDS_DEALT';
  readonly playerCards: ReadonlyMap<PlayerId, readonly Card[]>;
}

/**
 * Street has changed
 */
export interface StreetChangedEvent extends BaseGameEvent {
  readonly type: 'STREET_CHANGED';
  readonly fromStreet: Street;
  readonly toStreet: Street;
  readonly potTotal: number;
}

/**
 * Community cards dealt
 */
export interface CommunityCardsDealtEvent extends BaseGameEvent {
  readonly type: 'COMMUNITY_CARDS_DEALT';
  readonly street: Street;
  readonly cards: readonly Card[];
  readonly allCommunityCards: readonly Card[];
}

/**
 * Player has acted
 */
export interface PlayerActedEvent extends BaseGameEvent {
  readonly type: 'PLAYER_ACTED';
  readonly playerId: PlayerId;
  readonly action: string;
  readonly amount: number;
  readonly playerStack: number;
  readonly potTotal: number;
  readonly isAllIn: boolean;
}

/**
 * Next player to act
 */
export interface PlayerToActEvent extends BaseGameEvent {
  readonly type: 'PLAYER_TO_ACT';
  readonly playerId: PlayerId;
  readonly validActions: readonly string[];
  readonly amountToCall: number;
  readonly minBet: number;
  readonly minRaise: number;
}

/**
 * Betting round complete
 */
export interface BettingRoundCompleteEvent extends BaseGameEvent {
  readonly type: 'BETTING_ROUND_COMPLETE';
  readonly street: Street;
  readonly potTotal: number;
  readonly activePlayerCount: number;
}

/**
 * Showdown has started
 */
export interface ShowdownStartedEvent extends BaseGameEvent {
  readonly type: 'SHOWDOWN_STARTED';
  readonly playerCount: number;
  readonly potTotal: number;
}

/**
 * Player's hand revealed
 */
export interface HandRevealedEvent extends BaseGameEvent {
  readonly type: 'HAND_REVEALED';
  readonly playerId: PlayerId;
  readonly holeCards: readonly Card[];
  readonly handRank: string;
  readonly handDescription: string;
}

/**
 * Pot awarded to winner(s)
 */
export interface PotAwardedEvent extends BaseGameEvent {
  readonly type: 'POT_AWARDED';
  readonly winnerIds: readonly PlayerId[];
  readonly amounts: ReadonlyMap<PlayerId, number>;
  readonly totalPot: number;
  readonly isSplitPot: boolean;
  readonly winningHandDescription: string;
}

/**
 * Hand has ended
 */
export interface HandEndedEvent extends BaseGameEvent {
  readonly type: 'HAND_ENDED';
  readonly reason: 'showdown' | 'all-fold' | 'all-in-runout';
  readonly winnerIds: readonly PlayerId[];
  readonly finalStacks: ReadonlyMap<PlayerId, number>;
  readonly handDuration: number;
}

/**
 * Error event
 */
export interface ErrorEvent extends BaseGameEvent {
  readonly type: 'ERROR';
  readonly errorCode: string;
  readonly errorMessage: string;
  readonly context?: Record<string, unknown>;
}

// ============================================================================
// Event Union Type
// ============================================================================

export type GameEvent =
  | HandStartedEvent
  | BlindsPostedEvent
  | HoleCardsDealtEvent
  | StreetChangedEvent
  | CommunityCardsDealtEvent
  | PlayerActedEvent
  | PlayerToActEvent
  | BettingRoundCompleteEvent
  | ShowdownStartedEvent
  | HandRevealedEvent
  | PotAwardedEvent
  | HandEndedEvent
  | ErrorEvent;

// ============================================================================
// Event Factories
// ============================================================================

let eventCounter = 0;
let sequenceCounter = 0;

function generateEventId(): string {
  return `evt_${Date.now()}_${++eventCounter}`;
}

function nextSequence(): number {
  return ++sequenceCounter;
}

export function resetEventSequence(): void {
  sequenceCounter = 0;
}

export function createHandStartedEvent(
  handId: HandId,
  tableId: TableId,
  handNumber: number,
  dealerSeat: number,
  smallBlindSeat: number,
  bigBlindSeat: number,
  playerIds: readonly PlayerId[],
  playerStacks: ReadonlyMap<PlayerId, number>
): HandStartedEvent {
  return {
    type: 'HAND_STARTED',
    timestamp: Date.now(),
    eventId: generateEventId(),
    handId,
    tableId,
    sequence: nextSequence(),
    handNumber,
    dealerSeat,
    smallBlindSeat,
    bigBlindSeat,
    playerIds,
    playerStacks,
  };
}

export function createBlindsPostedEvent(
  handId: HandId,
  tableId: TableId,
  smallBlind: { playerId: PlayerId; amount: number },
  bigBlind: { playerId: PlayerId; amount: number },
  potTotal: number
): BlindsPostedEvent {
  return {
    type: 'BLINDS_POSTED',
    timestamp: Date.now(),
    eventId: generateEventId(),
    handId,
    tableId,
    sequence: nextSequence(),
    smallBlind,
    bigBlind,
    potTotal,
  };
}

export function createHoleCardsDealtEvent(
  handId: HandId,
  tableId: TableId,
  playerCards: ReadonlyMap<PlayerId, readonly Card[]>
): HoleCardsDealtEvent {
  return {
    type: 'HOLE_CARDS_DEALT',
    timestamp: Date.now(),
    eventId: generateEventId(),
    handId,
    tableId,
    sequence: nextSequence(),
    playerCards,
  };
}

export function createStreetChangedEvent(
  handId: HandId,
  tableId: TableId,
  fromStreet: Street,
  toStreet: Street,
  potTotal: number
): StreetChangedEvent {
  return {
    type: 'STREET_CHANGED',
    timestamp: Date.now(),
    eventId: generateEventId(),
    handId,
    tableId,
    sequence: nextSequence(),
    fromStreet,
    toStreet,
    potTotal,
  };
}

export function createCommunityCardsDealtEvent(
  handId: HandId,
  tableId: TableId,
  street: Street,
  cards: readonly Card[],
  allCommunityCards: readonly Card[]
): CommunityCardsDealtEvent {
  return {
    type: 'COMMUNITY_CARDS_DEALT',
    timestamp: Date.now(),
    eventId: generateEventId(),
    handId,
    tableId,
    sequence: nextSequence(),
    street,
    cards,
    allCommunityCards,
  };
}

export function createPlayerActedEvent(
  handId: HandId,
  tableId: TableId,
  playerId: PlayerId,
  action: string,
  amount: number,
  playerStack: number,
  potTotal: number,
  isAllIn: boolean
): PlayerActedEvent {
  return {
    type: 'PLAYER_ACTED',
    timestamp: Date.now(),
    eventId: generateEventId(),
    handId,
    tableId,
    sequence: nextSequence(),
    playerId,
    action,
    amount,
    playerStack,
    potTotal,
    isAllIn,
  };
}

export function createPlayerToActEvent(
  handId: HandId,
  tableId: TableId,
  playerId: PlayerId,
  validActions: readonly string[],
  amountToCall: number,
  minBet: number,
  minRaise: number
): PlayerToActEvent {
  return {
    type: 'PLAYER_TO_ACT',
    timestamp: Date.now(),
    eventId: generateEventId(),
    handId,
    tableId,
    sequence: nextSequence(),
    playerId,
    validActions,
    amountToCall,
    minBet,
    minRaise,
  };
}

export function createBettingRoundCompleteEvent(
  handId: HandId,
  tableId: TableId,
  street: Street,
  potTotal: number,
  activePlayerCount: number
): BettingRoundCompleteEvent {
  return {
    type: 'BETTING_ROUND_COMPLETE',
    timestamp: Date.now(),
    eventId: generateEventId(),
    handId,
    tableId,
    sequence: nextSequence(),
    street,
    potTotal,
    activePlayerCount,
  };
}

export function createShowdownStartedEvent(
  handId: HandId,
  tableId: TableId,
  playerCount: number,
  potTotal: number
): ShowdownStartedEvent {
  return {
    type: 'SHOWDOWN_STARTED',
    timestamp: Date.now(),
    eventId: generateEventId(),
    handId,
    tableId,
    sequence: nextSequence(),
    playerCount,
    potTotal,
  };
}

export function createHandRevealedEvent(
  handId: HandId,
  tableId: TableId,
  playerId: PlayerId,
  holeCards: readonly Card[],
  handRank: string,
  handDescription: string
): HandRevealedEvent {
  return {
    type: 'HAND_REVEALED',
    timestamp: Date.now(),
    eventId: generateEventId(),
    handId,
    tableId,
    sequence: nextSequence(),
    playerId,
    holeCards,
    handRank,
    handDescription,
  };
}

export function createPotAwardedEvent(
  handId: HandId,
  tableId: TableId,
  winnerIds: readonly PlayerId[],
  amounts: ReadonlyMap<PlayerId, number>,
  totalPot: number,
  isSplitPot: boolean,
  winningHandDescription: string
): PotAwardedEvent {
  return {
    type: 'POT_AWARDED',
    timestamp: Date.now(),
    eventId: generateEventId(),
    handId,
    tableId,
    sequence: nextSequence(),
    winnerIds,
    amounts,
    totalPot,
    isSplitPot,
    winningHandDescription,
  };
}

export function createHandEndedEvent(
  handId: HandId,
  tableId: TableId,
  reason: 'showdown' | 'all-fold' | 'all-in-runout',
  winnerIds: readonly PlayerId[],
  finalStacks: ReadonlyMap<PlayerId, number>,
  handDuration: number
): HandEndedEvent {
  return {
    type: 'HAND_ENDED',
    timestamp: Date.now(),
    eventId: generateEventId(),
    handId,
    tableId,
    sequence: nextSequence(),
    reason,
    winnerIds,
    finalStacks,
    handDuration,
  };
}

export function createErrorEvent(
  handId: HandId,
  tableId: TableId,
  errorCode: string,
  errorMessage: string,
  context?: Record<string, unknown>
): ErrorEvent {
  return {
    type: 'ERROR',
    timestamp: Date.now(),
    eventId: generateEventId(),
    handId,
    tableId,
    sequence: nextSequence(),
    errorCode,
    errorMessage,
    context,
  };
}

// ============================================================================
// Event Listener Types
// ============================================================================

export type GameEventListener = (event: GameEvent) => void;

export interface GameEventEmitter {
  on(listener: GameEventListener): () => void;
  emit(event: GameEvent): void;
  getHistory(): readonly GameEvent[];
  clear(): void;
}

/**
 * Simple event emitter implementation
 */
export function createGameEventEmitter(): GameEventEmitter {
  const listeners: Set<GameEventListener> = new Set();
  const history: GameEvent[] = [];

  return {
    on(listener: GameEventListener): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    emit(event: GameEvent): void {
      history.push(event);
      for (const listener of listeners) {
        listener(event);
      }
    },

    getHistory(): readonly GameEvent[] {
      return [...history];
    },

    clear(): void {
      history.length = 0;
    },
  };
}
