/**
 * TableServer.ts
 * Phase 18 - Hosts a GameService instance for a single table
 *
 * Provides isolation per table with:
 * - GameService integration
 * - Player connection tracking
 * - Event broadcasting to connected players
 * - Auto hand start management
 */

import { PlayerId } from '../../security/Identity';
import { TableId, HandId } from '../../security/AuditLog';
import { GameService, createGameService } from '../service/GameService';
import { GameServiceConfig, GameState, ValidActions, HandResult, PlayerInfo } from '../service/ServiceTypes';
import { GameEvent } from '../engine/GameEvents';
import { PlayerActionType } from '../engine/GameCommands';
import {
  ConnectionId,
  ServerMessage,
  GameEventMessage,
  GameStateMessage,
  HandResultMessage,
  PlayerJoinedMessage,
  PlayerLeftMessage,
  createMessageHeader,
} from './ServerTypes';

// ============================================================================
// Types
// ============================================================================

export interface TableServerConfig {
  readonly tableId: TableId;
  readonly smallBlind: number;
  readonly bigBlind: number;
  readonly minPlayers: number;
  readonly maxPlayers: number;
  readonly autoStartHands: boolean;
  readonly handStartDelayMs: number;
}

export const DEFAULT_TABLE_CONFIG: TableServerConfig = {
  tableId: 'default-table',
  smallBlind: 5,
  bigBlind: 10,
  minPlayers: 2,
  maxPlayers: 9,
  autoStartHands: true,
  handStartDelayMs: 3000,
};

export interface ConnectedPlayer {
  readonly playerId: PlayerId;
  readonly playerName: string;
  readonly connectionId: ConnectionId;
  readonly joinedAt: number;
}

export type MessageSender = (connectionId: ConnectionId, message: ServerMessage) => void;
export type BroadcastSender = (connectionIds: ConnectionId[], message: ServerMessage) => void;

// ============================================================================
// TableServer Class
// ============================================================================

export class TableServer {
  private readonly config: TableServerConfig;
  private readonly gameService: GameService;
  private readonly connectedPlayers: Map<PlayerId, ConnectedPlayer>;
  private readonly connectionToPlayer: Map<ConnectionId, PlayerId>;
  private messageSender: MessageSender | null = null;
  private broadcastSender: BroadcastSender | null = null;
  private handStartTimer: NodeJS.Timeout | null = null;
  private isDestroyed: boolean = false;

  constructor(config: Partial<TableServerConfig> = {}) {
    this.config = { ...DEFAULT_TABLE_CONFIG, ...config };
    this.connectedPlayers = new Map();
    this.connectionToPlayer = new Map();

    // Create GameService with matching config
    const serviceConfig: Partial<GameServiceConfig> = {
      tableId: this.config.tableId,
      smallBlind: this.config.smallBlind,
      bigBlind: this.config.bigBlind,
      minPlayers: this.config.minPlayers,
      maxPlayers: this.config.maxPlayers,
    };
    this.gameService = createGameService(serviceConfig);

    // Subscribe to GameService events
    this.gameService.onEvent((event) => this.handleGameEvent(event));
    this.gameService.onStateChange((state) => this.handleStateChange(state));
    this.gameService.onHandResult((result) => this.handleHandResult(result));
  }

  // ==========================================================================
  // Message Sender Setup
  // ==========================================================================

  /**
   * Set the message sender function for sending to individual connections
   */
  setMessageSender(sender: MessageSender): void {
    this.messageSender = sender;
  }

  /**
   * Set the broadcast sender function for sending to multiple connections
   */
  setBroadcastSender(sender: BroadcastSender): void {
    this.broadcastSender = sender;
  }

  // ==========================================================================
  // Player Management
  // ==========================================================================

  /**
   * Add a player to the table
   */
  addPlayer(
    playerId: PlayerId,
    playerName: string,
    connectionId: ConnectionId,
    buyInAmount: number,
    preferredSeat?: number
  ): { success: boolean; seat?: number; state?: GameState; error?: string } {
    if (this.isDestroyed) {
      return { success: false, error: 'Table is closed' };
    }

    // Check if player already connected
    if (this.connectedPlayers.has(playerId)) {
      return { success: false, error: 'Already at this table' };
    }

    // Join the GameService
    const result = this.gameService.joinTable({
      playerId,
      playerName,
      buyInAmount,
      preferredSeat,
    });

    if (!result.success) {
      return { success: false, error: result.error };
    }

    // Track connection
    const connectedPlayer: ConnectedPlayer = {
      playerId,
      playerName,
      connectionId,
      joinedAt: Date.now(),
    };
    this.connectedPlayers.set(playerId, connectedPlayer);
    this.connectionToPlayer.set(connectionId, playerId);

    // Broadcast player joined to other players
    this.broadcastPlayerJoined(playerId, playerName, result.seat!, connectionId);

    // Check if we should auto-start a hand
    this.scheduleHandStart();

    return {
      success: true,
      seat: result.seat,
      state: this.gameService.getGameState(),
    };
  }

  /**
   * Remove a player from the table
   */
  removePlayer(
    playerId: PlayerId,
    cashOut: boolean
  ): { success: boolean; cashOutAmount?: number; error?: string } {
    if (this.isDestroyed) {
      return { success: false, error: 'Table is closed' };
    }

    const connectedPlayer = this.connectedPlayers.get(playerId);
    if (!connectedPlayer) {
      return { success: false, error: 'Not at this table' };
    }

    // Leave the GameService
    const result = this.gameService.leaveTable({
      playerId,
      cashOut,
    });

    if (!result.success) {
      return { success: false, error: result.error };
    }

    // Remove from tracking
    this.connectionToPlayer.delete(connectedPlayer.connectionId);
    this.connectedPlayers.delete(playerId);

    // Broadcast player left to remaining players
    this.broadcastPlayerLeft(playerId, connectedPlayer.connectionId);

    return {
      success: true,
      cashOutAmount: result.cashOutAmount,
    };
  }

  /**
   * Handle player disconnection
   */
  handleDisconnection(connectionId: ConnectionId): void {
    const playerId = this.connectionToPlayer.get(connectionId);
    if (!playerId) return;

    // For now, just remove the player
    // In a production system, you'd implement reconnection grace period
    this.removePlayer(playerId, false);
  }

  /**
   * Process a rebuy request
   */
  processRebuy(
    playerId: PlayerId,
    amount: number
  ): { success: boolean; newStack?: number; error?: string } {
    if (this.isDestroyed) {
      return { success: false, error: 'Table is closed' };
    }

    if (!this.connectedPlayers.has(playerId)) {
      return { success: false, error: 'Not at this table' };
    }

    return this.gameService.rebuy({ playerId, amount });
  }

  // ==========================================================================
  // Action Processing
  // ==========================================================================

  /**
   * Process a player action
   */
  processAction(
    playerId: PlayerId,
    action: PlayerActionType,
    amount?: number
  ): { success: boolean; errorCode?: string; errorMessage?: string } {
    if (this.isDestroyed) {
      return { success: false, errorCode: 'TABLE_CLOSED', errorMessage: 'Table is closed' };
    }

    if (!this.connectedPlayers.has(playerId)) {
      return { success: false, errorCode: 'NOT_AT_TABLE', errorMessage: 'Not at this table' };
    }

    const result = this.gameService.processAction({
      playerId,
      action,
      amount,
    });

    if (!result.success) {
      return {
        success: false,
        errorCode: result.error?.code,
        errorMessage: result.error?.message,
      };
    }

    // Check if hand completed and schedule next hand
    if (this.gameService.isHandComplete()) {
      this.scheduleHandStart();
    }

    return { success: true };
  }

  // ==========================================================================
  // State Queries
  // ==========================================================================

  /**
   * Get current game state
   */
  getGameState(): GameState {
    return this.gameService.getGameState();
  }

  /**
   * Get valid actions for a player
   */
  getValidActions(playerId: PlayerId): ValidActions | null {
    if (!this.connectedPlayers.has(playerId)) {
      return null;
    }
    return this.gameService.getValidActions(playerId);
  }

  /**
   * Get player info
   */
  getPlayer(playerId: PlayerId): PlayerInfo | undefined {
    return this.gameService.getPlayer(playerId);
  }

  /**
   * Get all players at table
   */
  getPlayers(): readonly PlayerInfo[] {
    return this.gameService.getPlayers();
  }

  /**
   * Get player count
   */
  getPlayerCount(): number {
    return this.connectedPlayers.size;
  }

  /**
   * Get connected player IDs
   */
  getConnectedPlayerIds(): readonly PlayerId[] {
    return Array.from(this.connectedPlayers.keys());
  }

  /**
   * Get connection ID for a player
   */
  getConnectionId(playerId: PlayerId): ConnectionId | null {
    return this.connectedPlayers.get(playerId)?.connectionId ?? null;
  }

  /**
   * Check if hand is in progress
   */
  isHandInProgress(): boolean {
    return this.gameService.isHandInProgress();
  }

  /**
   * Get table ID
   */
  getTableId(): TableId {
    return this.config.tableId;
  }

  /**
   * Get table config
   */
  getConfig(): TableServerConfig {
    return { ...this.config };
  }

  // ==========================================================================
  // Hand Management
  // ==========================================================================

  /**
   * Start a new hand manually
   */
  startHand(): { success: boolean; handId?: HandId; error?: string } {
    if (this.isDestroyed) {
      return { success: false, error: 'Table is closed' };
    }

    return this.gameService.startHand();
  }

  /**
   * Schedule auto hand start
   */
  private scheduleHandStart(): void {
    if (!this.config.autoStartHands) return;
    if (this.handStartTimer) return;
    if (this.gameService.isHandInProgress()) return;

    // Check if we have enough players
    const players = this.gameService.getPlayers();
    const activePlayers = players.filter(p => p.isActive && p.stack >= this.config.bigBlind);
    if (activePlayers.length < this.config.minPlayers) return;

    this.handStartTimer = setTimeout(() => {
      this.handStartTimer = null;
      if (!this.isDestroyed && !this.gameService.isHandInProgress()) {
        this.gameService.startHand();
      }
    }, this.config.handStartDelayMs);
  }

  /**
   * Cancel scheduled hand start
   */
  cancelScheduledHandStart(): void {
    if (this.handStartTimer) {
      clearTimeout(this.handStartTimer);
      this.handStartTimer = null;
    }
  }

  // ==========================================================================
  // Event Handling
  // ==========================================================================

  /**
   * Handle game event from GameService
   */
  private handleGameEvent(event: GameEvent): void {
    // Broadcast to all connected players
    const connectionIds = this.getAllConnectionIds();
    if (connectionIds.length === 0) return;

    const message: GameEventMessage = {
      type: 'game-event',
      header: createMessageHeader(),
      tableId: this.config.tableId,
      event,
    };

    this.broadcast(connectionIds, message);
  }

  /**
   * Handle state change from GameService
   */
  private handleStateChange(state: GameState): void {
    // Broadcast updated state to all connected players
    const connectionIds = this.getAllConnectionIds();
    if (connectionIds.length === 0) return;

    const message: GameStateMessage = {
      type: 'game-state',
      header: createMessageHeader(),
      tableId: this.config.tableId,
      state,
    };

    this.broadcast(connectionIds, message);
  }

  /**
   * Handle hand result from GameService
   */
  private handleHandResult(result: HandResult): void {
    const connectionIds = this.getAllConnectionIds();
    if (connectionIds.length === 0) return;

    const message: HandResultMessage = {
      type: 'hand-result',
      header: createMessageHeader(),
      tableId: this.config.tableId,
      result,
    };

    this.broadcast(connectionIds, message);
  }

  /**
   * Broadcast player joined event
   */
  private broadcastPlayerJoined(
    playerId: PlayerId,
    playerName: string,
    seat: number,
    excludeConnectionId: ConnectionId
  ): void {
    const player = this.gameService.getPlayer(playerId);
    if (!player) return;

    const connectionIds = this.getAllConnectionIds().filter(id => id !== excludeConnectionId);
    if (connectionIds.length === 0) return;

    const message: PlayerJoinedMessage = {
      type: 'player-joined',
      header: createMessageHeader(),
      tableId: this.config.tableId,
      player,
    };

    this.broadcast(connectionIds, message);
  }

  /**
   * Broadcast player left event
   */
  private broadcastPlayerLeft(playerId: PlayerId, excludeConnectionId: ConnectionId): void {
    const connectionIds = this.getAllConnectionIds().filter(id => id !== excludeConnectionId);
    if (connectionIds.length === 0) return;

    const message: PlayerLeftMessage = {
      type: 'player-left',
      header: createMessageHeader(),
      tableId: this.config.tableId,
      playerId,
    };

    this.broadcast(connectionIds, message);
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  /**
   * Get all connection IDs
   */
  private getAllConnectionIds(): ConnectionId[] {
    return Array.from(this.connectedPlayers.values()).map(p => p.connectionId);
  }

  /**
   * Send message to a single connection
   */
  private send(connectionId: ConnectionId, message: ServerMessage): void {
    if (this.messageSender) {
      this.messageSender(connectionId, message);
    }
  }

  /**
   * Broadcast message to multiple connections
   */
  private broadcast(connectionIds: ConnectionId[], message: ServerMessage): void {
    if (this.broadcastSender) {
      this.broadcastSender(connectionIds, message);
    } else if (this.messageSender) {
      // Fallback to individual sends
      for (const connectionId of connectionIds) {
        this.messageSender(connectionId, message);
      }
    }
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  /**
   * Destroy the table server
   */
  destroy(): void {
    this.isDestroyed = true;
    this.cancelScheduledHandStart();
    this.connectedPlayers.clear();
    this.connectionToPlayer.clear();
    this.messageSender = null;
    this.broadcastSender = null;
  }

  /**
   * Check if table is destroyed
   */
  isTableDestroyed(): boolean {
    return this.isDestroyed;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createTableServer(config?: Partial<TableServerConfig>): TableServer {
  return new TableServer(config);
}
