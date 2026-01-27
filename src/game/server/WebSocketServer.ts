/**
 * WebSocketServer.ts
 * Phase 18 - WebSocket server for managing connections and routing messages
 *
 * Provides:
 * - Connection management
 * - Authentication handling
 * - Message routing to table servers
 * - Multiple concurrent player support
 */

import { PlayerId } from '../../security/Identity';
import { TableId } from '../../security/AuditLog';
import { TableServer, createTableServer, TableServerConfig } from './TableServer';
import {
  ConnectionId,
  SessionToken,
  ClientConnection,
  ConnectionState,
  ClientMessage,
  ServerMessage,
  WebSocketServerConfig,
  DEFAULT_SERVER_CONFIG,
  createMessageHeader,
  createMessageId,
  createSessionToken,
  deserializeMessage,
  serializeMessage,
  ErrorCode,
  AuthenticatedMessage,
  ErrorMessage,
  TableJoinedMessage,
  TableLeftMessage,
  ActionResultMessage,
  GameStateMessage,
  ValidActionsMessage,
  RebuyResultMessage,
  PongMessage,
} from './ServerTypes';

// ============================================================================
// Types
// ============================================================================

export interface WebSocketLike {
  send(data: string): void;
  close(): void;
  onmessage?: ((event: { data: string }) => void) | null;
  onclose?: (() => void) | null;
  onerror?: ((error: unknown) => void) | null;
}

export interface ServerStats {
  readonly totalConnections: number;
  readonly authenticatedConnections: number;
  readonly totalTables: number;
  readonly totalPlayersAtTables: number;
  readonly uptime: number;
}

type ConnectionHandler = (connectionId: ConnectionId, ws: WebSocketLike) => void;
type DisconnectionHandler = (connectionId: ConnectionId) => void;

// ============================================================================
// WebSocketGameServer Class
// ============================================================================

export class WebSocketGameServer {
  private readonly config: WebSocketServerConfig;
  private readonly connections: Map<ConnectionId, ClientConnection>;
  private readonly sockets: Map<ConnectionId, WebSocketLike>;
  private readonly tables: Map<TableId, TableServer>;
  private readonly sessionTokens: Map<SessionToken, PlayerId>;
  private readonly playerConnections: Map<PlayerId, ConnectionId>;
  private startTime: number;
  private connectionCounter: number;

  constructor(config: Partial<WebSocketServerConfig> = {}) {
    this.config = { ...DEFAULT_SERVER_CONFIG, ...config };
    this.connections = new Map();
    this.sockets = new Map();
    this.tables = new Map();
    this.sessionTokens = new Map();
    this.playerConnections = new Map();
    this.startTime = Date.now();
    this.connectionCounter = 0;
  }

  // ==========================================================================
  // Connection Management
  // ==========================================================================

  /**
   * Handle new WebSocket connection
   */
  handleConnection(ws: WebSocketLike): ConnectionId {
    if (this.connections.size >= this.config.maxConnections) {
      ws.close();
      throw new Error('Server at maximum capacity');
    }

    const connectionId = this.generateConnectionId();
    const connection: ClientConnection = {
      connectionId,
      playerId: null,
      playerName: null,
      state: 'connected',
      currentTableId: null,
      connectedAt: Date.now(),
      lastActivity: Date.now(),
      sessionToken: null,
    };

    this.connections.set(connectionId, connection);
    this.sockets.set(connectionId, ws);

    // Set up message handler
    ws.onmessage = (event) => {
      this.handleMessage(connectionId, event.data);
    };

    ws.onclose = () => {
      this.handleDisconnection(connectionId);
    };

    ws.onerror = () => {
      this.handleDisconnection(connectionId);
    };

    return connectionId;
  }

  /**
   * Handle WebSocket disconnection
   */
  handleDisconnection(connectionId: ConnectionId): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    // Remove from table if at one
    if (connection.currentTableId && connection.playerId) {
      const table = this.tables.get(connection.currentTableId);
      if (table) {
        table.handleDisconnection(connectionId);
      }
    }

    // Clean up player tracking
    if (connection.playerId) {
      this.playerConnections.delete(connection.playerId);
    }

    // Clean up session token
    if (connection.sessionToken) {
      this.sessionTokens.delete(connection.sessionToken);
    }

    // Remove connection
    this.connections.delete(connectionId);
    this.sockets.delete(connectionId);
  }

  /**
   * Handle incoming message
   */
  handleMessage(connectionId: ConnectionId, data: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    // Update last activity
    this.updateConnection(connectionId, { lastActivity: Date.now() });

    // Parse message
    const message = deserializeMessage(data);
    if (!message) {
      this.sendError(connectionId, 'INVALID_MESSAGE', 'Invalid message format');
      return;
    }

    // Route message
    this.routeMessage(connectionId, connection, message);
  }

  // ==========================================================================
  // Message Routing
  // ==========================================================================

  /**
   * Route message to appropriate handler
   */
  private routeMessage(
    connectionId: ConnectionId,
    connection: ClientConnection,
    message: ClientMessage
  ): void {
    const requestId = message.header.messageId;

    switch (message.type) {
      case 'authenticate':
        this.handleAuthenticate(connectionId, connection, message);
        break;

      case 'ping':
        this.handlePing(connectionId, message);
        break;

      case 'join-table':
        this.handleJoinTable(connectionId, connection, message);
        break;

      case 'leave-table':
        this.handleLeaveTable(connectionId, connection, message);
        break;

      case 'player-action':
        this.handlePlayerAction(connectionId, connection, message);
        break;

      case 'request-state':
        this.handleRequestState(connectionId, connection, message);
        break;

      case 'request-valid-actions':
        this.handleRequestValidActions(connectionId, connection, message);
        break;

      case 'rebuy':
        this.handleRebuy(connectionId, connection, message);
        break;

      default:
        // Handle unknown message types
        this.sendError(connectionId, 'INVALID_MESSAGE', 'Unknown message type', requestId);
    }
  }

  // ==========================================================================
  // Message Handlers
  // ==========================================================================

  /**
   * Handle authentication
   */
  private handleAuthenticate(
    connectionId: ConnectionId,
    connection: ClientConnection,
    message: ClientMessage & { type: 'authenticate' }
  ): void {
    if (connection.state === 'authenticated') {
      this.sendError(connectionId, 'ALREADY_AUTHENTICATED', 'Already authenticated', message.header.messageId);
      return;
    }

    // Check if player already connected elsewhere
    const existingConnectionId = this.playerConnections.get(message.playerId);
    if (existingConnectionId && existingConnectionId !== connectionId) {
      // Close existing WebSocket and clean up
      const existingWs = this.sockets.get(existingConnectionId);
      if (existingWs) {
        try {
          existingWs.close();
        } catch {
          // Ignore close errors
        }
      }
      this.handleDisconnection(existingConnectionId);
    }

    // Create session token
    const sessionToken = createSessionToken(message.playerId);
    this.sessionTokens.set(sessionToken, message.playerId);
    this.playerConnections.set(message.playerId, connectionId);

    // Update connection
    this.updateConnection(connectionId, {
      playerId: message.playerId,
      playerName: message.playerName,
      state: 'authenticated',
      sessionToken,
    });

    // Send response
    const response: AuthenticatedMessage = {
      type: 'authenticated',
      header: createMessageHeader(),
      requestId: message.header.messageId,
      playerId: message.playerId,
      sessionToken,
    };
    this.send(connectionId, response);
  }

  /**
   * Handle ping
   */
  private handlePing(
    connectionId: ConnectionId,
    message: ClientMessage & { type: 'ping' }
  ): void {
    const serverTime = Date.now();
    const response: PongMessage = {
      type: 'pong',
      header: createMessageHeader(),
      requestId: message.header.messageId,
      clientTime: message.clientTime,
      serverTime,
      latencyMs: serverTime - message.clientTime,
    };
    this.send(connectionId, response);
  }

  /**
   * Handle join table
   */
  private handleJoinTable(
    connectionId: ConnectionId,
    connection: ClientConnection,
    message: ClientMessage & { type: 'join-table' }
  ): void {
    if (!this.requireAuth(connectionId, connection, message.header.messageId)) return;

    // Check if already at a table
    if (connection.currentTableId) {
      this.sendError(connectionId, 'ALREADY_AT_TABLE', 'Already at a table', message.header.messageId);
      return;
    }

    // Get or create table
    let table = this.tables.get(message.tableId);
    if (!table) {
      // Create new table
      if (this.tables.size >= this.config.maxTablesPerServer) {
        this.sendError(connectionId, 'INTERNAL_ERROR', 'Server at table capacity', message.header.messageId);
        return;
      }
      table = this.createTable(message.tableId);
    }

    // Join table
    const result = table.addPlayer(
      connection.playerId!,
      connection.playerName!,
      connectionId,
      message.buyInAmount,
      message.preferredSeat
    );

    if (!result.success) {
      this.sendError(connectionId, 'INVALID_ACTION', result.error ?? 'Failed to join table', message.header.messageId);
      return;
    }

    // Update connection
    this.updateConnection(connectionId, { currentTableId: message.tableId });

    // Send response
    const response: TableJoinedMessage = {
      type: 'table-joined',
      header: createMessageHeader(),
      requestId: message.header.messageId,
      tableId: message.tableId,
      seat: result.seat!,
      state: result.state!,
    };
    this.send(connectionId, response);
  }

  /**
   * Handle leave table
   */
  private handleLeaveTable(
    connectionId: ConnectionId,
    connection: ClientConnection,
    message: ClientMessage & { type: 'leave-table' }
  ): void {
    if (!this.requireAuth(connectionId, connection, message.header.messageId)) return;
    if (!this.requireAtTable(connectionId, connection, message.tableId, message.header.messageId)) return;

    const table = this.tables.get(message.tableId);
    if (!table) {
      this.sendError(connectionId, 'TABLE_NOT_FOUND', 'Table not found', message.header.messageId);
      return;
    }

    const result = table.removePlayer(connection.playerId!, message.cashOut);

    if (!result.success) {
      this.sendError(connectionId, 'INVALID_ACTION', result.error ?? 'Failed to leave table', message.header.messageId);
      return;
    }

    // Update connection
    this.updateConnection(connectionId, { currentTableId: null });

    // Send response
    const response: TableLeftMessage = {
      type: 'table-left',
      header: createMessageHeader(),
      requestId: message.header.messageId,
      tableId: message.tableId,
      cashOutAmount: result.cashOutAmount,
    };
    this.send(connectionId, response);

    // Clean up empty tables
    if (table.getPlayerCount() === 0) {
      this.destroyTable(message.tableId);
    }
  }

  /**
   * Handle player action
   */
  private handlePlayerAction(
    connectionId: ConnectionId,
    connection: ClientConnection,
    message: ClientMessage & { type: 'player-action' }
  ): void {
    if (!this.requireAuth(connectionId, connection, message.header.messageId)) return;
    if (!this.requireAtTable(connectionId, connection, message.tableId, message.header.messageId)) return;

    const table = this.tables.get(message.tableId);
    if (!table) {
      this.sendError(connectionId, 'TABLE_NOT_FOUND', 'Table not found', message.header.messageId);
      return;
    }

    const result = table.processAction(connection.playerId!, message.action, message.amount);

    const response: ActionResultMessage = {
      type: 'action-result',
      header: createMessageHeader(),
      requestId: message.header.messageId,
      tableId: message.tableId,
      success: result.success,
      errorCode: result.errorCode,
      errorMessage: result.errorMessage,
    };
    this.send(connectionId, response);
  }

  /**
   * Handle request state
   */
  private handleRequestState(
    connectionId: ConnectionId,
    connection: ClientConnection,
    message: ClientMessage & { type: 'request-state' }
  ): void {
    if (!this.requireAuth(connectionId, connection, message.header.messageId)) return;
    if (!this.requireAtTable(connectionId, connection, message.tableId, message.header.messageId)) return;

    const table = this.tables.get(message.tableId);
    if (!table) {
      this.sendError(connectionId, 'TABLE_NOT_FOUND', 'Table not found', message.header.messageId);
      return;
    }

    const response: GameStateMessage = {
      type: 'game-state',
      header: createMessageHeader(),
      requestId: message.header.messageId,
      tableId: message.tableId,
      state: table.getGameState(),
    };
    this.send(connectionId, response);
  }

  /**
   * Handle request valid actions
   */
  private handleRequestValidActions(
    connectionId: ConnectionId,
    connection: ClientConnection,
    message: ClientMessage & { type: 'request-valid-actions' }
  ): void {
    if (!this.requireAuth(connectionId, connection, message.header.messageId)) return;
    if (!this.requireAtTable(connectionId, connection, message.tableId, message.header.messageId)) return;

    const table = this.tables.get(message.tableId);
    if (!table) {
      this.sendError(connectionId, 'TABLE_NOT_FOUND', 'Table not found', message.header.messageId);
      return;
    }

    const response: ValidActionsMessage = {
      type: 'valid-actions',
      header: createMessageHeader(),
      requestId: message.header.messageId,
      tableId: message.tableId,
      actions: table.getValidActions(connection.playerId!),
    };
    this.send(connectionId, response);
  }

  /**
   * Handle rebuy
   */
  private handleRebuy(
    connectionId: ConnectionId,
    connection: ClientConnection,
    message: ClientMessage & { type: 'rebuy' }
  ): void {
    if (!this.requireAuth(connectionId, connection, message.header.messageId)) return;
    if (!this.requireAtTable(connectionId, connection, message.tableId, message.header.messageId)) return;

    const table = this.tables.get(message.tableId);
    if (!table) {
      this.sendError(connectionId, 'TABLE_NOT_FOUND', 'Table not found', message.header.messageId);
      return;
    }

    const result = table.processRebuy(connection.playerId!, message.amount);

    const response: RebuyResultMessage = {
      type: 'rebuy-result',
      header: createMessageHeader(),
      requestId: message.header.messageId,
      tableId: message.tableId,
      success: result.success,
      newStack: result.newStack,
      errorMessage: result.error,
    };
    this.send(connectionId, response);
  }

  // ==========================================================================
  // Table Management
  // ==========================================================================

  /**
   * Create a new table
   */
  createTable(tableId: TableId, config?: Partial<TableServerConfig>): TableServer {
    if (this.tables.has(tableId)) {
      throw new Error(`Table ${tableId} already exists`);
    }

    const table = createTableServer({
      tableId,
      ...config,
    });

    // Set up message senders
    table.setMessageSender((connId, message) => {
      this.send(connId, message);
    });

    table.setBroadcastSender((connIds, message) => {
      for (const connId of connIds) {
        this.send(connId, message);
      }
    });

    this.tables.set(tableId, table);
    return table;
  }

  /**
   * Get a table
   */
  getTable(tableId: TableId): TableServer | undefined {
    return this.tables.get(tableId);
  }

  /**
   * Destroy a table
   */
  destroyTable(tableId: TableId): void {
    const table = this.tables.get(tableId);
    if (table) {
      table.destroy();
      this.tables.delete(tableId);
    }
  }

  /**
   * Get all table IDs
   */
  getTableIds(): TableId[] {
    return Array.from(this.tables.keys());
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  /**
   * Generate connection ID
   */
  private generateConnectionId(): ConnectionId {
    return `conn_${++this.connectionCounter}_${Date.now()}`;
  }

  /**
   * Update connection state
   */
  private updateConnection(connectionId: ConnectionId, updates: Partial<ClientConnection>): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      this.connections.set(connectionId, { ...connection, ...updates } as ClientConnection);
    }
  }

  /**
   * Require authentication
   */
  private requireAuth(connectionId: ConnectionId, connection: ClientConnection, requestId?: string): boolean {
    if (connection.state !== 'authenticated') {
      this.sendError(connectionId, 'NOT_AUTHENTICATED', 'Must authenticate first', requestId);
      return false;
    }
    return true;
  }

  /**
   * Require being at a specific table
   */
  private requireAtTable(
    connectionId: ConnectionId,
    connection: ClientConnection,
    tableId: TableId,
    requestId?: string
  ): boolean {
    if (connection.currentTableId !== tableId) {
      this.sendError(connectionId, 'NOT_AT_TABLE', 'Not at this table', requestId);
      return false;
    }
    return true;
  }

  /**
   * Send message to connection
   */
  private send(connectionId: ConnectionId, message: ServerMessage): void {
    const ws = this.sockets.get(connectionId);
    if (ws) {
      try {
        ws.send(serializeMessage(message));
      } catch {
        // Connection may be closed
        this.handleDisconnection(connectionId);
      }
    }
  }

  /**
   * Send error message
   */
  private sendError(
    connectionId: ConnectionId,
    code: ErrorCode,
    message: string,
    requestId?: string
  ): void {
    const errorMsg: ErrorMessage = {
      type: 'error',
      header: createMessageHeader(),
      requestId,
      code,
      message,
    };
    this.send(connectionId, errorMsg);
  }

  // ==========================================================================
  // Stats & Status
  // ==========================================================================

  /**
   * Get server statistics
   */
  getStats(): ServerStats {
    let totalPlayersAtTables = 0;
    for (const table of this.tables.values()) {
      totalPlayersAtTables += table.getPlayerCount();
    }

    return {
      totalConnections: this.connections.size,
      authenticatedConnections: Array.from(this.connections.values()).filter(c => c.state === 'authenticated').length,
      totalTables: this.tables.size,
      totalPlayersAtTables,
      uptime: Date.now() - this.startTime,
    };
  }

  /**
   * Get connection by ID
   */
  getConnection(connectionId: ConnectionId): ClientConnection | undefined {
    return this.connections.get(connectionId);
  }

  /**
   * Get connection by player ID
   */
  getConnectionByPlayer(playerId: PlayerId): ClientConnection | undefined {
    const connectionId = this.playerConnections.get(playerId);
    if (!connectionId) return undefined;
    return this.connections.get(connectionId);
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  /**
   * Shutdown the server
   */
  shutdown(): void {
    // Close all connections
    for (const [connectionId, ws] of this.sockets) {
      try {
        ws.close();
      } catch {
        // Ignore errors during shutdown
      }
    }

    // Destroy all tables
    for (const tableId of this.tables.keys()) {
      this.destroyTable(tableId);
    }

    // Clear all state
    this.connections.clear();
    this.sockets.clear();
    this.sessionTokens.clear();
    this.playerConnections.clear();
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createWebSocketServer(config?: Partial<WebSocketServerConfig>): WebSocketGameServer {
  return new WebSocketGameServer(config);
}
