/**
 * PersistentTableServer.ts
 * Phase 19 - TableServer with automatic state persistence
 *
 * Extends TableServer functionality with:
 * - Automatic persistence on meaningful transitions
 * - State recovery on restart
 * - Reconnection support for disconnected players
 */

import { PlayerId } from '../../security/Identity';
import { TableId, HandId } from '../../security/AuditLog';
import { GameState, PlayerInfo } from '../service/ServiceTypes';
import {
  TableServer,
  createTableServer,
  TableServerConfig,
  DEFAULT_TABLE_CONFIG,
  ConnectedPlayer,
} from '../server/TableServer';
import { GameEvent } from '../engine/GameEvents';
import { PlayerActionType } from '../engine/GameCommands';
import {
  ConnectionId,
  ServerMessage,
} from '../server/ServerTypes';
import { SnapshotManager } from './SnapshotManager';
import { RecoveryManager } from './RecoveryManager';
import { PersistenceEventType, TableSnapshot } from './PersistenceTypes';

// ============================================================================
// PersistentTableServer Configuration
// ============================================================================

export interface PersistentTableServerConfig extends TableServerConfig {
  readonly enablePersistence: boolean;
}

export const DEFAULT_PERSISTENT_CONFIG: PersistentTableServerConfig = {
  ...DEFAULT_TABLE_CONFIG,
  enablePersistence: true,
};

// ============================================================================
// PersistentTableServer Implementation
// ============================================================================

export class PersistentTableServer {
  private readonly tableServer: TableServer;
  private readonly snapshotManager: SnapshotManager;
  private readonly recoveryManager: RecoveryManager;
  private readonly config: PersistentTableServerConfig;
  private handNumber: number = 0;
  private dealerIndex: number = 0;
  private lastPhase: string = '';
  private lastStreet: string = '';

  constructor(
    snapshotManager: SnapshotManager,
    recoveryManager: RecoveryManager,
    config: Partial<PersistentTableServerConfig> = {}
  ) {
    this.config = { ...DEFAULT_PERSISTENT_CONFIG, ...config };
    this.snapshotManager = snapshotManager;
    this.recoveryManager = recoveryManager;

    // Create underlying table server
    this.tableServer = createTableServer(this.config);

    // Register with recovery manager
    this.recoveryManager.registerTable(this.config.tableId, this.tableServer);

    // Persist table creation
    if (this.config.enablePersistence) {
      this.persistEvent('TABLE_CREATED');
    }
  }

  // ==========================================================================
  // Static Recovery
  // ==========================================================================

  /**
   * Recover a table from a snapshot
   */
  static async recoverFromSnapshot(
    snapshot: TableSnapshot,
    snapshotManager: SnapshotManager,
    recoveryManager: RecoveryManager
  ): Promise<PersistentTableServer> {
    const server = new PersistentTableServer(snapshotManager, recoveryManager, {
      ...snapshot.config,
      enablePersistence: true,
    });

    server.handNumber = snapshot.handNumber;
    server.dealerIndex = snapshot.dealerIndex;

    // Players will rejoin through reconnection mechanism
    // Their state is tracked in the recovery manager

    return server;
  }

  // ==========================================================================
  // Message Sender Setup (delegated to TableServer)
  // ==========================================================================

  setMessageSender(sender: (connectionId: ConnectionId, message: ServerMessage) => void): void {
    this.tableServer.setMessageSender(sender);
  }

  setBroadcastSender(sender: (connectionIds: ConnectionId[], message: ServerMessage) => void): void {
    this.tableServer.setBroadcastSender(sender);
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
    const result = this.tableServer.addPlayer(playerId, playerName, connectionId, buyInAmount, preferredSeat);

    if (result.success && this.config.enablePersistence) {
      // Register player with recovery manager
      this.recoveryManager.registerPlayerAtTable(playerId, this.config.tableId);

      // Persist player join
      this.persistEvent('PLAYER_JOINED');
    }

    return result;
  }

  /**
   * Remove a player from the table
   */
  removePlayer(
    playerId: PlayerId,
    cashOut: boolean
  ): { success: boolean; cashOutAmount?: number; error?: string } {
    // Get player info before removal
    const player = this.tableServer.getPlayer(playerId);

    const result = this.tableServer.removePlayer(playerId, cashOut);

    if (result.success && this.config.enablePersistence) {
      // Unregister player from recovery manager
      this.recoveryManager.unregisterPlayer(playerId);

      // Persist player leave
      this.persistEvent('PLAYER_LEFT');
    }

    return result;
  }

  /**
   * Handle player disconnection
   */
  handleDisconnection(connectionId: ConnectionId): void {
    // Get player info before handling disconnection
    const state = this.tableServer.getGameState();
    const connectedPlayers = this.tableServer.getConnectedPlayerIds();
    const playerId = connectedPlayers.find(id =>
      this.tableServer.getConnectionId(id) === connectionId
    );

    if (playerId) {
      const player = this.tableServer.getPlayer(playerId);
      if (player) {
        // Mark player as disconnected for potential reconnection
        this.recoveryManager.markPlayerDisconnected(
          playerId,
          this.config.tableId,
          player.name,
          player.seat,
          player.stack
        );
      }
    }

    this.tableServer.handleDisconnection(connectionId);
  }

  /**
   * Process a rebuy request
   */
  processRebuy(
    playerId: PlayerId,
    amount: number
  ): { success: boolean; newStack?: number; error?: string } {
    const result = this.tableServer.processRebuy(playerId, amount);

    if (result.success && this.config.enablePersistence) {
      // Persist rebuy (as player change)
      this.persistEvent('PLAYER_JOINED'); // Reuse player change event
    }

    return result;
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
    const stateBefore = this.tableServer.getGameState();
    const result = this.tableServer.processAction(playerId, action, amount);

    if (result.success && this.config.enablePersistence) {
      const stateAfter = this.tableServer.getGameState();

      // Check for meaningful transitions
      this.checkAndPersistTransitions(stateBefore, stateAfter);
    }

    return result;
  }

  /**
   * Check for state transitions that should trigger persistence
   */
  private checkAndPersistTransitions(before: GameState, after: GameState): void {
    // Hand ended
    if (before.isHandInProgress && !after.isHandInProgress) {
      this.handNumber++;
      this.persistEvent('HAND_ENDED');

      // Clean up hand snapshot
      if (before.handId) {
        this.snapshotManager.deleteHandSnapshot(this.config.tableId, before.handId);
      }
      return;
    }

    // Street changed (betting round ended)
    if (before.street !== after.street) {
      this.lastStreet = after.street;
      this.persistEvent('BETTING_ROUND_END');
      return;
    }

    // Phase changed
    if (before.phase !== after.phase) {
      this.lastPhase = after.phase;
    }
  }

  // ==========================================================================
  // Hand Management
  // ==========================================================================

  /**
   * Start a new hand
   */
  startHand(): { success: boolean; handId?: HandId; error?: string } {
    const result = this.tableServer.startHand();

    if (result.success && this.config.enablePersistence) {
      this.dealerIndex = (this.dealerIndex + 1) % Math.max(1, this.tableServer.getPlayerCount());
      this.persistEvent('HAND_STARTED');
    }

    return result;
  }

  // ==========================================================================
  // State Queries (delegated to TableServer)
  // ==========================================================================

  getGameState(): GameState {
    return this.tableServer.getGameState();
  }

  getValidActions(playerId: PlayerId) {
    return this.tableServer.getValidActions(playerId);
  }

  getPlayer(playerId: PlayerId): PlayerInfo | undefined {
    return this.tableServer.getPlayer(playerId);
  }

  getPlayers(): readonly PlayerInfo[] {
    return this.tableServer.getPlayers();
  }

  getPlayerCount(): number {
    return this.tableServer.getPlayerCount();
  }

  getConnectedPlayerIds(): readonly PlayerId[] {
    return this.tableServer.getConnectedPlayerIds();
  }

  getConnectionId(playerId: PlayerId): ConnectionId | null {
    return this.tableServer.getConnectionId(playerId);
  }

  isHandInProgress(): boolean {
    return this.tableServer.isHandInProgress();
  }

  getTableId(): TableId {
    return this.config.tableId;
  }

  getConfig(): PersistentTableServerConfig {
    return { ...this.config };
  }

  // ==========================================================================
  // Persistence
  // ==========================================================================

  /**
   * Persist current state for an event
   */
  private async persistEvent(eventType: PersistenceEventType): Promise<void> {
    if (!this.config.enablePersistence) return;

    try {
      const gameState = this.tableServer.getGameState();
      const players = this.tableServer.getPlayers();
      const connectedPlayerIds = this.tableServer.getConnectedPlayerIds();

      // Build connected player info
      const connectedPlayers: ConnectedPlayer[] = connectedPlayerIds.map(id => ({
        playerId: id,
        playerName: players.find(p => p.id === id)?.name ?? '',
        connectionId: this.tableServer.getConnectionId(id) ?? '',
        joinedAt: Date.now(),
      }));

      await this.snapshotManager.handlePersistenceEvent(
        eventType,
        this.config.tableId,
        this.config,
        gameState,
        players,
        connectedPlayers,
        this.handNumber,
        this.dealerIndex
      );
    } catch (error) {
      console.error('Failed to persist state:', error);
    }
  }

  /**
   * Force a snapshot (for manual persistence)
   */
  async forceSnapshot(): Promise<boolean> {
    if (!this.config.enablePersistence) return false;

    try {
      const gameState = this.tableServer.getGameState();
      const players = this.tableServer.getPlayers();
      const connectedPlayerIds = this.tableServer.getConnectedPlayerIds();

      const connectedPlayers: ConnectedPlayer[] = connectedPlayerIds.map(id => ({
        playerId: id,
        playerName: players.find(p => p.id === id)?.name ?? '',
        connectionId: this.tableServer.getConnectionId(id) ?? '',
        joinedAt: Date.now(),
      }));

      const result = await this.snapshotManager.createTableSnapshot(
        this.config.tableId,
        this.config,
        gameState,
        players,
        connectedPlayers,
        this.handNumber,
        this.dealerIndex
      );

      return result.success;
    } catch {
      return false;
    }
  }

  // ==========================================================================
  // Reconnection
  // ==========================================================================

  /**
   * Check if a player can reconnect to this table
   */
  canPlayerReconnect(playerId: PlayerId): boolean {
    return this.recoveryManager.canReconnect(playerId);
  }

  /**
   * Get reconnection info for a player
   */
  getReconnectionInfo(playerId: PlayerId) {
    return this.recoveryManager.getReconnectionInfo(playerId);
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  /**
   * Destroy the table server
   */
  async destroy(): Promise<void> {
    if (this.config.enablePersistence) {
      // Final snapshot before destruction
      await this.forceSnapshot();
      this.persistEvent('TABLE_DESTROYED');
    }

    // Unregister from recovery manager
    this.recoveryManager.unregisterTable(this.config.tableId);

    this.tableServer.destroy();
  }

  isTableDestroyed(): boolean {
    return this.tableServer.isTableDestroyed();
  }

  /**
   * Get underlying table server (for testing)
   */
  getTableServer(): TableServer {
    return this.tableServer;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createPersistentTableServer(
  snapshotManager: SnapshotManager,
  recoveryManager: RecoveryManager,
  config?: Partial<PersistentTableServerConfig>
): PersistentTableServer {
  return new PersistentTableServer(snapshotManager, recoveryManager, config);
}
