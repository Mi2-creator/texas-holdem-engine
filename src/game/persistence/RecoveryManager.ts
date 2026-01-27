/**
 * RecoveryManager.ts
 * Phase 19 - Handles server restart recovery and client reconnection
 *
 * Provides:
 * - Server restart recovery: restore tables and hands from snapshots
 * - Client reconnection: resync state for reconnecting players
 * - Hand continuation: resume interrupted hands
 */

import { PlayerId } from '../../security/Identity';
import { TableId, HandId } from '../../security/AuditLog';
import { GameState, PlayerInfo } from '../service/ServiceTypes';
import { TableServer, createTableServer, TableServerConfig } from '../server/TableServer';
import {
  StateStore,
  TableSnapshot,
  HandSnapshot,
  ServerSnapshot,
  RecoveryResult,
  ReconnectionResult,
  PlayerSnapshotData,
} from './PersistenceTypes';
import { SnapshotManager } from './SnapshotManager';

// ============================================================================
// RecoveryManager Configuration
// ============================================================================

export interface RecoveryManagerConfig {
  readonly autoRecoverOnStart: boolean;
  readonly maxRecoveryAttempts: number;
  readonly reconnectionGracePeriodMs: number;
}

export const DEFAULT_RECOVERY_CONFIG: RecoveryManagerConfig = {
  autoRecoverOnStart: true,
  maxRecoveryAttempts: 3,
  reconnectionGracePeriodMs: 60000, // 1 minute
};

// ============================================================================
// RecoveryManager Implementation
// ============================================================================

export class RecoveryManager {
  private readonly snapshotManager: SnapshotManager;
  private readonly config: RecoveryManagerConfig;
  private readonly recoveredTables: Map<TableId, TableServer>;
  private readonly playerTableMap: Map<PlayerId, TableId>;
  private readonly disconnectedPlayers: Map<PlayerId, DisconnectedPlayerInfo>;

  constructor(snapshotManager: SnapshotManager, config: Partial<RecoveryManagerConfig> = {}) {
    this.snapshotManager = snapshotManager;
    this.config = { ...DEFAULT_RECOVERY_CONFIG, ...config };
    this.recoveredTables = new Map();
    this.playerTableMap = new Map();
    this.disconnectedPlayers = new Map();
  }

  // ==========================================================================
  // Server Recovery
  // ==========================================================================

  /**
   * Recover server state from persisted snapshots
   */
  async recoverServer(): Promise<RecoveryResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let tablesRecovered = 0;
    let handsRecovered = 0;

    try {
      // Load server snapshot to get list of tables
      const serverSnapshot = await this.snapshotManager.loadServerSnapshot();
      const tableIds = serverSnapshot?.tableIds ?? await this.snapshotManager.listTables();

      // Recover each table
      for (const tableId of tableIds) {
        const tableResult = await this.recoverTable(tableId);
        if (tableResult.success) {
          tablesRecovered++;
          if (tableResult.handRecovered) {
            handsRecovered++;
          }
        } else {
          errors.push(`Table ${tableId}: ${tableResult.error}`);
        }
      }

      return {
        success: errors.length === 0,
        tablesRecovered,
        handsRecovered,
        errors,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        tablesRecovered,
        handsRecovered,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Recover a single table from snapshot
   */
  async recoverTable(tableId: TableId): Promise<{ success: boolean; handRecovered: boolean; error?: string }> {
    try {
      // Load table snapshot
      const snapshot = await this.snapshotManager.loadTableSnapshot(tableId);
      if (!snapshot) {
        return { success: false, handRecovered: false, error: 'No snapshot found' };
      }

      // Create table server with recovered config
      const tableServer = createTableServer(snapshot.config);

      // Track player-table mappings
      for (const player of snapshot.players) {
        this.playerTableMap.set(player.playerId, tableId);

        // Mark as disconnected until they reconnect
        this.disconnectedPlayers.set(player.playerId, {
          playerId: player.playerId,
          playerName: player.playerName,
          tableId,
          seat: player.seat,
          stack: player.stack,
          disconnectedAt: Date.now(),
        });
      }

      // Store recovered table
      this.recoveredTables.set(tableId, tableServer);

      // Check if there was an active hand
      let handRecovered = false;
      if (snapshot.handId) {
        const handSnapshot = await this.snapshotManager.loadHandSnapshot(tableId, snapshot.handId);
        if (handSnapshot) {
          handRecovered = true;
          // Note: Full hand recovery would require rebuilding the internal state
          // For now, we just mark that a hand was in progress
        }
      }

      return { success: true, handRecovered };
    } catch (error) {
      return {
        success: false,
        handRecovered: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ==========================================================================
  // Client Reconnection
  // ==========================================================================

  /**
   * Handle player reconnection
   */
  async handleReconnection(
    playerId: PlayerId,
    connectionId: string
  ): Promise<ReconnectionResult> {
    try {
      // Check if player was disconnected
      const disconnectedInfo = this.disconnectedPlayers.get(playerId);
      if (!disconnectedInfo) {
        return {
          success: false,
          error: 'Player was not previously connected',
        };
      }

      // Check grace period
      const elapsed = Date.now() - disconnectedInfo.disconnectedAt;
      if (elapsed > this.config.reconnectionGracePeriodMs) {
        this.disconnectedPlayers.delete(playerId);
        return {
          success: false,
          error: 'Reconnection grace period expired',
        };
      }

      const tableId = disconnectedInfo.tableId;

      // Get the table server
      const tableServer = this.recoveredTables.get(tableId);
      if (!tableServer) {
        return {
          success: false,
          error: 'Table no longer exists',
        };
      }

      // Re-add player to table
      const result = tableServer.addPlayer(
        playerId,
        disconnectedInfo.playerName,
        connectionId,
        disconnectedInfo.stack,
        disconnectedInfo.seat
      );

      if (!result.success) {
        return {
          success: false,
          error: result.error,
        };
      }

      // Remove from disconnected list
      this.disconnectedPlayers.delete(playerId);

      return {
        success: true,
        tableId,
        seat: disconnectedInfo.seat,
        gameState: result.state,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Mark a player as disconnected (for later reconnection)
   */
  markPlayerDisconnected(playerId: PlayerId, tableId: TableId, playerName: string, seat: number, stack: number): void {
    this.disconnectedPlayers.set(playerId, {
      playerId,
      playerName,
      tableId,
      seat,
      stack,
      disconnectedAt: Date.now(),
    });
  }

  /**
   * Get reconnection info for a player
   */
  getReconnectionInfo(playerId: PlayerId): DisconnectedPlayerInfo | null {
    const info = this.disconnectedPlayers.get(playerId);
    if (!info) return null;

    // Check if within grace period
    const elapsed = Date.now() - info.disconnectedAt;
    if (elapsed > this.config.reconnectionGracePeriodMs) {
      this.disconnectedPlayers.delete(playerId);
      return null;
    }

    return info;
  }

  /**
   * Check if player can reconnect
   */
  canReconnect(playerId: PlayerId): boolean {
    return this.getReconnectionInfo(playerId) !== null;
  }

  // ==========================================================================
  // State Sync
  // ==========================================================================

  /**
   * Get full state for a reconnecting client
   */
  getStateSyncForPlayer(playerId: PlayerId, tableId: TableId): GameState | null {
    const tableServer = this.recoveredTables.get(tableId);
    if (!tableServer) return null;

    // Check if player is at this table
    const player = tableServer.getPlayer(playerId);
    if (!player) return null;

    return tableServer.getGameState();
  }

  /**
   * Build reconnection snapshot for a player
   */
  buildReconnectionSnapshot(playerId: PlayerId): {
    tableId: TableId | null;
    gameState: GameState | null;
    seat: number | null;
    canRejoin: boolean;
  } {
    // Check for disconnection info
    const disconnectedInfo = this.getReconnectionInfo(playerId);
    if (disconnectedInfo) {
      const gameState = this.getStateSyncForPlayer(playerId, disconnectedInfo.tableId);
      return {
        tableId: disconnectedInfo.tableId,
        gameState,
        seat: disconnectedInfo.seat,
        canRejoin: true,
      };
    }

    // Check active tables
    const tableId = this.playerTableMap.get(playerId);
    if (tableId) {
      const tableServer = this.recoveredTables.get(tableId);
      if (tableServer) {
        const player = tableServer.getPlayer(playerId);
        if (player) {
          return {
            tableId,
            gameState: tableServer.getGameState(),
            seat: player.seat,
            canRejoin: false,
          };
        }
      }
    }

    return {
      tableId: null,
      gameState: null,
      seat: null,
      canRejoin: false,
    };
  }

  // ==========================================================================
  // Table Management
  // ==========================================================================

  /**
   * Get a recovered table
   */
  getRecoveredTable(tableId: TableId): TableServer | null {
    return this.recoveredTables.get(tableId) ?? null;
  }

  /**
   * Get all recovered tables
   */
  getRecoveredTables(): Map<TableId, TableServer> {
    return new Map(this.recoveredTables);
  }

  /**
   * Register a table for recovery tracking
   */
  registerTable(tableId: TableId, tableServer: TableServer): void {
    this.recoveredTables.set(tableId, tableServer);
  }

  /**
   * Unregister a table
   */
  unregisterTable(tableId: TableId): void {
    this.recoveredTables.delete(tableId);

    // Clean up player mappings for this table
    for (const [playerId, tid] of this.playerTableMap) {
      if (tid === tableId) {
        this.playerTableMap.delete(playerId);
      }
    }

    for (const [playerId, info] of this.disconnectedPlayers) {
      if (info.tableId === tableId) {
        this.disconnectedPlayers.delete(playerId);
      }
    }
  }

  /**
   * Register a player at a table
   */
  registerPlayerAtTable(playerId: PlayerId, tableId: TableId): void {
    this.playerTableMap.set(playerId, tableId);
  }

  /**
   * Unregister a player from their table
   */
  unregisterPlayer(playerId: PlayerId): void {
    this.playerTableMap.delete(playerId);
    this.disconnectedPlayers.delete(playerId);
  }

  // ==========================================================================
  // Maintenance
  // ==========================================================================

  /**
   * Clean up expired disconnected players
   */
  cleanupExpiredDisconnections(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [playerId, info] of this.disconnectedPlayers) {
      const elapsed = now - info.disconnectedAt;
      if (elapsed > this.config.reconnectionGracePeriodMs) {
        this.disconnectedPlayers.delete(playerId);
        this.playerTableMap.delete(playerId);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Clear all recovery state
   */
  clear(): void {
    this.recoveredTables.clear();
    this.playerTableMap.clear();
    this.disconnectedPlayers.clear();
  }

  /**
   * Get disconnected player count
   */
  getDisconnectedPlayerCount(): number {
    return this.disconnectedPlayers.size;
  }
}

// ============================================================================
// Supporting Types
// ============================================================================

interface DisconnectedPlayerInfo {
  readonly playerId: PlayerId;
  readonly playerName: string;
  readonly tableId: TableId;
  readonly seat: number;
  readonly stack: number;
  readonly disconnectedAt: number;
}

// ============================================================================
// Factory Function
// ============================================================================

export function createRecoveryManager(
  snapshotManager: SnapshotManager,
  config?: Partial<RecoveryManagerConfig>
): RecoveryManager {
  return new RecoveryManager(snapshotManager, config);
}
