/**
 * ServerTypes.ts
 * Phase 18 - WebSocket server message types and protocols
 *
 * Defines all message formats for WebSocket communication between
 * clients and the game server.
 */

import { PlayerId } from '../../security/Identity';
import { TableId, HandId } from '../../security/AuditLog';
import { PlayerActionType } from '../engine/GameCommands';
import { GameEvent } from '../engine/GameEvents';
import { GameState, ValidActions, HandResult, PlayerInfo } from '../service/ServiceTypes';

// ============================================================================
// Core Identifiers
// ============================================================================

export type ConnectionId = string;
export type MessageId = string;
export type SessionToken = string;

// ============================================================================
// Message Header
// ============================================================================

export interface MessageHeader {
  readonly messageId: MessageId;
  readonly timestamp: number;
  readonly sequence: number;
}

// ============================================================================
// Client → Server Messages
// ============================================================================

export type ClientMessageType =
  | 'authenticate'
  | 'join-table'
  | 'leave-table'
  | 'player-action'
  | 'request-state'
  | 'request-valid-actions'
  | 'rebuy'
  | 'ping';

interface BaseClientMessage {
  readonly type: ClientMessageType;
  readonly header: MessageHeader;
}

export interface AuthenticateMessage extends BaseClientMessage {
  readonly type: 'authenticate';
  readonly playerId: PlayerId;
  readonly playerName: string;
  readonly token?: SessionToken;
}

export interface JoinTableMessage extends BaseClientMessage {
  readonly type: 'join-table';
  readonly tableId: TableId;
  readonly buyInAmount: number;
  readonly preferredSeat?: number;
}

export interface LeaveTableMessage extends BaseClientMessage {
  readonly type: 'leave-table';
  readonly tableId: TableId;
  readonly cashOut: boolean;
}

export interface PlayerActionMessage extends BaseClientMessage {
  readonly type: 'player-action';
  readonly tableId: TableId;
  readonly action: PlayerActionType;
  readonly amount?: number;
}

export interface RequestStateMessage extends BaseClientMessage {
  readonly type: 'request-state';
  readonly tableId: TableId;
}

export interface RequestValidActionsMessage extends BaseClientMessage {
  readonly type: 'request-valid-actions';
  readonly tableId: TableId;
}

export interface RebuyMessage extends BaseClientMessage {
  readonly type: 'rebuy';
  readonly tableId: TableId;
  readonly amount: number;
}

export interface PingMessage extends BaseClientMessage {
  readonly type: 'ping';
  readonly clientTime: number;
}

export type ClientMessage =
  | AuthenticateMessage
  | JoinTableMessage
  | LeaveTableMessage
  | PlayerActionMessage
  | RequestStateMessage
  | RequestValidActionsMessage
  | RebuyMessage
  | PingMessage;

// ============================================================================
// Server → Client Messages
// ============================================================================

export type ServerMessageType =
  | 'authenticated'
  | 'error'
  | 'table-joined'
  | 'table-left'
  | 'player-joined'
  | 'player-left'
  | 'action-result'
  | 'game-state'
  | 'valid-actions'
  | 'game-event'
  | 'hand-result'
  | 'rebuy-result'
  | 'pong';

interface BaseServerMessage {
  readonly type: ServerMessageType;
  readonly header: MessageHeader;
  readonly requestId?: MessageId; // References the client message this responds to
}

export interface AuthenticatedMessage extends BaseServerMessage {
  readonly type: 'authenticated';
  readonly playerId: PlayerId;
  readonly sessionToken: SessionToken;
}

export interface ErrorMessage extends BaseServerMessage {
  readonly type: 'error';
  readonly code: ErrorCode;
  readonly message: string;
  readonly details?: Record<string, unknown>;
}

export interface TableJoinedMessage extends BaseServerMessage {
  readonly type: 'table-joined';
  readonly tableId: TableId;
  readonly seat: number;
  readonly state: GameState;
}

export interface TableLeftMessage extends BaseServerMessage {
  readonly type: 'table-left';
  readonly tableId: TableId;
  readonly cashOutAmount?: number;
}

export interface PlayerJoinedMessage extends BaseServerMessage {
  readonly type: 'player-joined';
  readonly tableId: TableId;
  readonly player: PlayerInfo;
}

export interface PlayerLeftMessage extends BaseServerMessage {
  readonly type: 'player-left';
  readonly tableId: TableId;
  readonly playerId: PlayerId;
}

export interface ActionResultMessage extends BaseServerMessage {
  readonly type: 'action-result';
  readonly tableId: TableId;
  readonly success: boolean;
  readonly errorCode?: string;
  readonly errorMessage?: string;
}

export interface GameStateMessage extends BaseServerMessage {
  readonly type: 'game-state';
  readonly tableId: TableId;
  readonly state: GameState;
}

export interface ValidActionsMessage extends BaseServerMessage {
  readonly type: 'valid-actions';
  readonly tableId: TableId;
  readonly actions: ValidActions | null;
}

export interface GameEventMessage extends BaseServerMessage {
  readonly type: 'game-event';
  readonly tableId: TableId;
  readonly event: GameEvent;
}

export interface HandResultMessage extends BaseServerMessage {
  readonly type: 'hand-result';
  readonly tableId: TableId;
  readonly result: HandResult;
}

export interface RebuyResultMessage extends BaseServerMessage {
  readonly type: 'rebuy-result';
  readonly tableId: TableId;
  readonly success: boolean;
  readonly newStack?: number;
  readonly errorMessage?: string;
}

export interface PongMessage extends BaseServerMessage {
  readonly type: 'pong';
  readonly clientTime: number;
  readonly serverTime: number;
  readonly latencyMs: number;
}

export type ServerMessage =
  | AuthenticatedMessage
  | ErrorMessage
  | TableJoinedMessage
  | TableLeftMessage
  | PlayerJoinedMessage
  | PlayerLeftMessage
  | ActionResultMessage
  | GameStateMessage
  | ValidActionsMessage
  | GameEventMessage
  | HandResultMessage
  | RebuyResultMessage
  | PongMessage;

// ============================================================================
// Error Codes
// ============================================================================

export type ErrorCode =
  | 'NOT_AUTHENTICATED'
  | 'ALREADY_AUTHENTICATED'
  | 'INVALID_MESSAGE'
  | 'TABLE_NOT_FOUND'
  | 'NOT_AT_TABLE'
  | 'ALREADY_AT_TABLE'
  | 'TABLE_FULL'
  | 'INSUFFICIENT_FUNDS'
  | 'INVALID_ACTION'
  | 'NOT_YOUR_TURN'
  | 'HAND_NOT_IN_PROGRESS'
  | 'INTERNAL_ERROR';

// ============================================================================
// Connection State
// ============================================================================

export type ConnectionState = 'connected' | 'authenticated' | 'disconnected';

export interface ClientConnection {
  readonly connectionId: ConnectionId;
  readonly playerId: PlayerId | null;
  readonly playerName: string | null;
  readonly state: ConnectionState;
  readonly currentTableId: TableId | null;
  readonly connectedAt: number;
  readonly lastActivity: number;
  readonly sessionToken: SessionToken | null;
}

// ============================================================================
// Server Configuration
// ============================================================================

export interface WebSocketServerConfig {
  readonly maxConnections: number;
  readonly maxTablesPerServer: number;
  readonly connectionTimeoutMs: number;
  readonly pingIntervalMs: number;
  readonly authTimeoutMs: number;
}

export const DEFAULT_SERVER_CONFIG: WebSocketServerConfig = {
  maxConnections: 1000,
  maxTablesPerServer: 100,
  connectionTimeoutMs: 30000,
  pingIntervalMs: 10000,
  authTimeoutMs: 10000,
};

// ============================================================================
// Factory Functions
// ============================================================================

let messageCounter = 0;
let sequenceCounter = 0;

export function createMessageId(): MessageId {
  return `msg_${Date.now()}_${++messageCounter}`;
}

export function createMessageHeader(): MessageHeader {
  return {
    messageId: createMessageId(),
    timestamp: Date.now(),
    sequence: ++sequenceCounter,
  };
}

export function createSessionToken(playerId: PlayerId): SessionToken {
  return `session_${playerId}_${Date.now()}_${Math.random().toString(36).substring(2)}`;
}

export function resetSequence(): void {
  sequenceCounter = 0;
  messageCounter = 0;
}

// ============================================================================
// Type Guards
// ============================================================================

export function isClientMessage(msg: unknown): msg is ClientMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    'type' in msg &&
    'header' in msg
  );
}

export function isServerMessage(msg: unknown): msg is ServerMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    'type' in msg &&
    'header' in msg
  );
}

// ============================================================================
// Message Serialization
// ============================================================================

export function serializeMessage(msg: ServerMessage): string {
  return JSON.stringify(msg);
}

export function deserializeMessage(data: string): ClientMessage | null {
  try {
    const parsed = JSON.parse(data);
    if (isClientMessage(parsed)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}
