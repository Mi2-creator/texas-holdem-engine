/**
 * Server Layer Module Exports
 * Phase 18 - WebSocket server for game hosting
 */

// WebSocket Server
export { WebSocketGameServer, createWebSocketServer, WebSocketLike, ServerStats } from './WebSocketServer';

// Table Server
export {
  TableServer,
  createTableServer,
  TableServerConfig,
  DEFAULT_TABLE_CONFIG,
  ConnectedPlayer,
  MessageSender,
  BroadcastSender,
} from './TableServer';

// Server Types
export {
  // Identifiers
  ConnectionId,
  MessageId,
  SessionToken,
  // Message Header
  MessageHeader,
  // Client Messages
  ClientMessageType,
  ClientMessage,
  AuthenticateMessage,
  JoinTableMessage,
  LeaveTableMessage,
  PlayerActionMessage,
  RequestStateMessage,
  RequestValidActionsMessage,
  RebuyMessage,
  PingMessage,
  // Server Messages
  ServerMessageType,
  ServerMessage,
  AuthenticatedMessage,
  ErrorMessage,
  TableJoinedMessage,
  TableLeftMessage,
  PlayerJoinedMessage,
  PlayerLeftMessage,
  ActionResultMessage,
  GameStateMessage,
  ValidActionsMessage,
  GameEventMessage,
  HandResultMessage,
  RebuyResultMessage,
  PongMessage,
  // Error Codes
  ErrorCode,
  // Connection
  ConnectionState,
  ClientConnection,
  // Config
  WebSocketServerConfig,
  DEFAULT_SERVER_CONFIG,
  // Utilities
  createMessageId,
  createMessageHeader,
  createSessionToken,
  resetSequence,
  isClientMessage,
  isServerMessage,
  serializeMessage,
  deserializeMessage,
} from './ServerTypes';
