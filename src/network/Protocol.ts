/**
 * Protocol.ts
 * Phase 12 - Message types for client-server communication
 *
 * Defines all message formats for authoritative multiplayer networking.
 */

import { RejectCode } from './NetworkErrors';

// ============================================================================
// Core Identifiers
// ============================================================================

export type ClubId = string;
export type RoomId = string;
export type TableId = string;
export type PlayerId = string;
export type SessionId = string;
export type HandId = string;
export type MessageId = string;

// ============================================================================
// Sequence & Timing
// ============================================================================

export interface MessageHeader {
  readonly messageId: MessageId;
  readonly timestamp: number;
  readonly sequence: number;
}

export interface TableContext {
  readonly tableId: TableId;
  readonly handId: HandId | null;
  readonly sequence: number;
}

// ============================================================================
// Player Action Types
// ============================================================================

export type ActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'all-in';

export interface PlayerAction {
  readonly type: ActionType;
  readonly amount?: number;
}

// ============================================================================
// Client Intent Messages
// ============================================================================

export type ClientIntentType =
  | 'join-room'
  | 'leave-room'
  | 'take-seat'
  | 'leave-seat'
  | 'buy-in'
  | 'stand-up'
  | 'sit-back'
  | 'player-action'
  | 'request-sync'
  | 'heartbeat';

interface BaseClientIntent {
  readonly type: ClientIntentType;
  readonly header: MessageHeader;
  readonly sessionId: SessionId;
}

export interface JoinRoomIntent extends BaseClientIntent {
  readonly type: 'join-room';
  readonly roomId: RoomId;
  readonly asSpectator?: boolean;
}

export interface LeaveRoomIntent extends BaseClientIntent {
  readonly type: 'leave-room';
  readonly roomId: RoomId;
}

export interface TakeSeatIntent extends BaseClientIntent {
  readonly type: 'take-seat';
  readonly tableContext: TableContext;
  readonly seatIndex: number;
  readonly buyInAmount: number;
}

export interface LeaveSeatIntent extends BaseClientIntent {
  readonly type: 'leave-seat';
  readonly tableContext: TableContext;
}

export interface BuyInIntent extends BaseClientIntent {
  readonly type: 'buy-in';
  readonly tableContext: TableContext;
  readonly amount: number;
}

export interface StandUpIntent extends BaseClientIntent {
  readonly type: 'stand-up';
  readonly tableContext: TableContext;
}

export interface SitBackIntent extends BaseClientIntent {
  readonly type: 'sit-back';
  readonly tableContext: TableContext;
}

export interface PlayerActionIntent extends BaseClientIntent {
  readonly type: 'player-action';
  readonly tableContext: TableContext;
  readonly action: PlayerAction;
}

export interface RequestSyncIntent extends BaseClientIntent {
  readonly type: 'request-sync';
  readonly tableContext: TableContext;
  readonly fromSequence?: number;
}

export interface HeartbeatIntent extends BaseClientIntent {
  readonly type: 'heartbeat';
  readonly clientTime: number;
}

export type ClientIntent =
  | JoinRoomIntent
  | LeaveRoomIntent
  | TakeSeatIntent
  | LeaveSeatIntent
  | BuyInIntent
  | StandUpIntent
  | SitBackIntent
  | PlayerActionIntent
  | RequestSyncIntent
  | HeartbeatIntent;

// ============================================================================
// Server Event Messages
// ============================================================================

export type ServerEventType =
  | 'ack'
  | 'reject'
  | 'room-joined'
  | 'room-left'
  | 'player-joined'
  | 'player-left'
  | 'seat-taken'
  | 'seat-vacated'
  | 'player-sat-out'
  | 'player-sat-back'
  | 'hand-started'
  | 'action-performed'
  | 'street-changed'
  | 'pot-updated'
  | 'showdown'
  | 'hand-ended'
  | 'snapshot'
  | 'diff'
  | 'heartbeat-ack'
  | 'player-disconnected'
  | 'player-reconnected'
  | 'player-timeout-warning'
  | 'player-timed-out';

interface BaseServerEvent {
  readonly type: ServerEventType;
  readonly header: MessageHeader;
  readonly tableContext?: TableContext;
}

// ============================================================================
// Acknowledgment & Rejection
// ============================================================================

export interface AckEvent extends BaseServerEvent {
  readonly type: 'ack';
  readonly intentMessageId: MessageId;
}

export interface RejectEvent extends BaseServerEvent {
  readonly type: 'reject';
  readonly intentMessageId: MessageId;
  readonly code: RejectCode;
  readonly reason: string;
  readonly details?: Record<string, unknown>;
}

// ============================================================================
// Room Events
// ============================================================================

export interface RoomJoinedEvent extends BaseServerEvent {
  readonly type: 'room-joined';
  readonly roomId: RoomId;
  readonly playerId: PlayerId;
  readonly isSpectator: boolean;
}

export interface RoomLeftEvent extends BaseServerEvent {
  readonly type: 'room-left';
  readonly roomId: RoomId;
  readonly playerId: PlayerId;
}

export interface PlayerJoinedEvent extends BaseServerEvent {
  readonly type: 'player-joined';
  readonly playerId: PlayerId;
  readonly playerName: string;
  readonly isSpectator: boolean;
}

export interface PlayerLeftEvent extends BaseServerEvent {
  readonly type: 'player-left';
  readonly playerId: PlayerId;
}

// ============================================================================
// Seat Events
// ============================================================================

export interface SeatTakenEvent extends BaseServerEvent {
  readonly type: 'seat-taken';
  readonly tableContext: TableContext;
  readonly seatIndex: number;
  readonly playerId: PlayerId;
  readonly playerName: string;
  readonly stack: number;
}

export interface SeatVacatedEvent extends BaseServerEvent {
  readonly type: 'seat-vacated';
  readonly tableContext: TableContext;
  readonly seatIndex: number;
  readonly playerId: PlayerId;
}

export interface PlayerSatOutEvent extends BaseServerEvent {
  readonly type: 'player-sat-out';
  readonly tableContext: TableContext;
  readonly playerId: PlayerId;
  readonly seatIndex: number;
}

export interface PlayerSatBackEvent extends BaseServerEvent {
  readonly type: 'player-sat-back';
  readonly tableContext: TableContext;
  readonly playerId: PlayerId;
  readonly seatIndex: number;
}

// ============================================================================
// Hand Events
// ============================================================================

export interface HandStartedEvent extends BaseServerEvent {
  readonly type: 'hand-started';
  readonly tableContext: TableContext;
  readonly handNumber: number;
  readonly dealerSeat: number;
  readonly smallBlindSeat: number;
  readonly bigBlindSeat: number;
  readonly players: readonly {
    readonly playerId: PlayerId;
    readonly seatIndex: number;
    readonly stack: number;
  }[];
}

export interface ActionPerformedEvent extends BaseServerEvent {
  readonly type: 'action-performed';
  readonly tableContext: TableContext;
  readonly playerId: PlayerId;
  readonly seatIndex: number;
  readonly action: PlayerAction;
  readonly newStack: number;
  readonly potTotal: number;
}

export interface StreetChangedEvent extends BaseServerEvent {
  readonly type: 'street-changed';
  readonly tableContext: TableContext;
  readonly street: 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';
  readonly communityCards: readonly string[];
}

export interface PotUpdatedEvent extends BaseServerEvent {
  readonly type: 'pot-updated';
  readonly tableContext: TableContext;
  readonly potTotal: number;
  readonly sidePots?: readonly { amount: number; eligiblePlayers: PlayerId[] }[];
}

export interface ShowdownEventMsg extends BaseServerEvent {
  readonly type: 'showdown';
  readonly tableContext: TableContext;
  readonly reveals: readonly {
    readonly playerId: PlayerId;
    readonly holeCards: readonly string[];
    readonly handDescription: string;
  }[];
}

export interface HandEndedEvent extends BaseServerEvent {
  readonly type: 'hand-ended';
  readonly tableContext: TableContext;
  readonly winners: readonly {
    readonly playerId: PlayerId;
    readonly amount: number;
    readonly handDescription?: string;
  }[];
  readonly endReason: 'showdown' | 'all-folded' | 'all-in-runout';
}

// ============================================================================
// Sync Events
// ============================================================================

export interface Card {
  readonly rank: number;
  readonly suit: string;
}

export interface SeatSnapshot {
  readonly seatIndex: number;
  readonly playerId: PlayerId | null;
  readonly playerName: string | null;
  readonly stack: number;
  readonly status: 'empty' | 'active' | 'folded' | 'all-in' | 'sitting-out' | 'disconnected';
  readonly currentBet: number;
  readonly holeCards: readonly Card[] | null; // Only visible to seat owner or at showdown
  readonly isDealer: boolean;
  readonly isTurn: boolean;
  readonly timebank: number;
}

export interface TableSnapshot {
  readonly tableId: TableId;
  readonly handId: HandId | null;
  readonly sequence: number;
  readonly handNumber: number;
  readonly street: 'waiting' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'complete';
  readonly communityCards: readonly Card[];
  readonly pot: number;
  readonly currentBet: number;
  readonly minRaise: number;
  readonly dealerSeat: number;
  readonly activePlayerSeat: number;
  readonly seats: readonly SeatSnapshot[];
  readonly spectatorCount: number;
}

export interface RoomSnapshot {
  readonly roomId: RoomId;
  readonly clubId: ClubId;
  readonly name: string;
  readonly config: RoomConfig;
  readonly tables: readonly TableSnapshot[];
  readonly spectators: readonly PlayerId[];
}

export interface RoomConfig {
  readonly smallBlind: number;
  readonly bigBlind: number;
  readonly minBuyIn: number;
  readonly maxBuyIn: number;
  readonly maxSeats: number;
  readonly actionTimeoutSeconds: number;
  readonly disconnectGraceSeconds: number;
}

export interface SnapshotEvent extends BaseServerEvent {
  readonly type: 'snapshot';
  readonly snapshot: RoomSnapshot;
  readonly forPlayerId: PlayerId;
}

export interface DiffOperation {
  readonly op: 'add' | 'remove' | 'replace';
  readonly path: string;
  readonly value?: unknown;
}

export interface DiffEvent extends BaseServerEvent {
  readonly type: 'diff';
  readonly tableContext: TableContext;
  readonly baseSequence: number;
  readonly operations: readonly DiffOperation[];
}

// ============================================================================
// Connection Events
// ============================================================================

export interface HeartbeatAckEvent extends BaseServerEvent {
  readonly type: 'heartbeat-ack';
  readonly serverTime: number;
  readonly clientTime: number;
  readonly latencyMs: number;
}

export interface PlayerDisconnectedEvent extends BaseServerEvent {
  readonly type: 'player-disconnected';
  readonly playerId: PlayerId;
  readonly seatIndex?: number;
  readonly graceSecondsRemaining: number;
}

export interface PlayerReconnectedEvent extends BaseServerEvent {
  readonly type: 'player-reconnected';
  readonly playerId: PlayerId;
  readonly seatIndex?: number;
}

export interface PlayerTimeoutWarningEvent extends BaseServerEvent {
  readonly type: 'player-timeout-warning';
  readonly tableContext: TableContext;
  readonly playerId: PlayerId;
  readonly secondsRemaining: number;
}

export interface PlayerTimedOutEvent extends BaseServerEvent {
  readonly type: 'player-timed-out';
  readonly tableContext: TableContext;
  readonly playerId: PlayerId;
  readonly autoAction: PlayerAction;
}

// ============================================================================
// Union Types
// ============================================================================

export type ServerEvent =
  | AckEvent
  | RejectEvent
  | RoomJoinedEvent
  | RoomLeftEvent
  | PlayerJoinedEvent
  | PlayerLeftEvent
  | SeatTakenEvent
  | SeatVacatedEvent
  | PlayerSatOutEvent
  | PlayerSatBackEvent
  | HandStartedEvent
  | ActionPerformedEvent
  | StreetChangedEvent
  | PotUpdatedEvent
  | ShowdownEventMsg
  | HandEndedEvent
  | SnapshotEvent
  | DiffEvent
  | HeartbeatAckEvent
  | PlayerDisconnectedEvent
  | PlayerReconnectedEvent
  | PlayerTimeoutWarningEvent
  | PlayerTimedOutEvent;

// ============================================================================
// Factory Functions
// ============================================================================

let messageCounter = 0;

export function createMessageId(): MessageId {
  return `msg_${Date.now()}_${++messageCounter}`;
}

export function createMessageHeader(sequence: number): MessageHeader {
  return {
    messageId: createMessageId(),
    timestamp: Date.now(),
    sequence,
  };
}

export function createTableContext(
  tableId: TableId,
  handId: HandId | null,
  sequence: number
): TableContext {
  return { tableId, handId, sequence };
}

// ============================================================================
// Type Guards
// ============================================================================

export function isClientIntent(msg: unknown): msg is ClientIntent {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    'type' in msg &&
    'header' in msg &&
    'sessionId' in msg
  );
}

export function isServerEvent(msg: unknown): msg is ServerEvent {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    'type' in msg &&
    'header' in msg
  );
}

export function isActionIntent(intent: ClientIntent): intent is PlayerActionIntent {
  return intent.type === 'player-action';
}

export function isAck(event: ServerEvent): event is AckEvent {
  return event.type === 'ack';
}

export function isReject(event: ServerEvent): event is RejectEvent {
  return event.type === 'reject';
}

export function isSnapshot(event: ServerEvent): event is SnapshotEvent {
  return event.type === 'snapshot';
}

export function isDiff(event: ServerEvent): event is DiffEvent {
  return event.type === 'diff';
}
