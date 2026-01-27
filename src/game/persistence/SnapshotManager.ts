/**
 * SnapshotManager.ts
 * Phase 19 - Creates and manages versioned snapshots
 *
 * Handles:
 * - Creating deterministic snapshots from game state
 * - Version management
 * - Automatic persistence on meaningful transitions
 */

import { PlayerId } from '../../security/Identity';
import { TableId, HandId } from '../../security/AuditLog';
import { GameState, PlayerInfo } from '../service/ServiceTypes';
import { TableServerConfig, ConnectedPlayer } from '../server/TableServer';
import { Card } from '../engine/Card';
import {
  StateStore,
  TableSnapshot,
  HandSnapshot,
  ServerSnapshot,
  SnapshotVersion,
  PlayerSnapshotData,
  PlayerHandState,
  ActionRecord,
  PersistenceEventType,
  StoreResult,
  generateSnapshotId,
  calculateChecksum,
} from './PersistenceTypes';

// ============================================================================
// SnapshotManager Configuration
// ============================================================================

export interface SnapshotManagerConfig {
  readonly persistOnHandEnd: boolean;
  readonly persistOnBettingRoundEnd: boolean;
  readonly persistOnPlayerChange: boolean;
  readonly minPersistIntervalMs: number;
}

export const DEFAULT_SNAPSHOT_CONFIG: SnapshotManagerConfig = {
  persistOnHandEnd: true,
  persistOnBettingRoundEnd: true,
  persistOnPlayerChange: true,
  minPersistIntervalMs: 1000,
};

// ============================================================================
// SnapshotManager Implementation
// ============================================================================

export class SnapshotManager {
  private readonly store: StateStore;
  private readonly config: SnapshotManagerConfig;
  private readonly versionCounters: Map<TableId, SnapshotVersion>;
  private readonly lastPersistTime: Map<TableId, number>;
  private serverVersion: SnapshotVersion;

  constructor(store: StateStore, config: Partial<SnapshotManagerConfig> = {}) {
    this.store = store;
    this.config = { ...DEFAULT_SNAPSHOT_CONFIG, ...config };
    this.versionCounters = new Map();
    this.lastPersistTime = new Map();
    this.serverVersion = 0;
  }

  // ==========================================================================
  // Table Snapshots
  // ==========================================================================

  /**
   * Create and save a table snapshot
   */
  async createTableSnapshot(
    tableId: TableId,
    config: TableServerConfig,
    gameState: GameState,
    players: readonly PlayerInfo[],
    connectedPlayers: readonly ConnectedPlayer[],
    handNumber: number,
    dealerIndex: number
  ): Promise<StoreResult> {
    const version = this.getNextVersion(tableId);
    const timestamp = Date.now();

    // Build player snapshot data
    const playerSnapshots: PlayerSnapshotData[] = players.map(p => {
      const connected = connectedPlayers.find(cp => cp.playerId === p.id);
      return {
        playerId: p.id,
        playerName: p.name,
        stack: p.stack,
        seat: p.seat,
        isActive: p.isActive,
        joinedAt: connected?.joinedAt ?? timestamp,
      };
    });

    // Create snapshot without checksum first
    const snapshotData = {
      snapshotId: generateSnapshotId(),
      version,
      tableId,
      timestamp,
      config,
      gameState,
      players: playerSnapshots,
      handId: gameState.handId,
      handNumber,
      dealerIndex,
    };

    // Calculate checksum
    const checksum = calculateChecksum(snapshotData);

    const snapshot: TableSnapshot = {
      ...snapshotData,
      checksum,
    };

    const result = await this.store.saveTableSnapshot(snapshot);

    if (result.success) {
      this.versionCounters.set(tableId, version);
      this.lastPersistTime.set(tableId, timestamp);
    }

    return result;
  }

  /**
   * Load the latest table snapshot
   */
  async loadTableSnapshot(tableId: TableId): Promise<TableSnapshot | null> {
    const result = await this.store.loadLatestTableSnapshot(tableId);
    return result.success ? result.data! : null;
  }

  /**
   * Load a specific version of a table snapshot
   */
  async loadTableSnapshotVersion(tableId: TableId, version: SnapshotVersion): Promise<TableSnapshot | null> {
    const result = await this.store.loadTableSnapshot(tableId, version);
    return result.success ? result.data! : null;
  }

  /**
   * Delete all snapshots for a table
   */
  async deleteTableSnapshots(tableId: TableId): Promise<StoreResult> {
    const result = await this.store.deleteTableSnapshots(tableId);
    if (result.success) {
      this.versionCounters.delete(tableId);
      this.lastPersistTime.delete(tableId);
    }
    return result;
  }

  // ==========================================================================
  // Hand Snapshots
  // ==========================================================================

  /**
   * Create and save a hand snapshot (for active hands)
   */
  async createHandSnapshot(
    tableId: TableId,
    handId: HandId,
    phase: string,
    street: string,
    pot: number,
    currentBet: number,
    communityCards: readonly Card[],
    playerStates: readonly PlayerHandState[],
    dealerSeat: number,
    activePlayerSeat: number | null,
    lastRaiserSeat: number,
    actionsThisRound: number,
    deckState: readonly Card[],
    actionHistory: readonly ActionRecord[]
  ): Promise<StoreResult> {
    const version = this.getNextVersion(tableId);
    const timestamp = Date.now();

    const snapshotData = {
      snapshotId: generateSnapshotId(),
      version,
      tableId,
      handId,
      timestamp,
      phase,
      street,
      pot,
      currentBet,
      communityCards,
      playerStates,
      dealerSeat,
      activePlayerSeat,
      lastRaiserSeat,
      actionsThisRound,
      deckState,
      actionHistory,
    };

    const checksum = calculateChecksum(snapshotData);

    const snapshot: HandSnapshot = {
      ...snapshotData,
      checksum,
    };

    return this.store.saveHandSnapshot(snapshot);
  }

  /**
   * Load a hand snapshot
   */
  async loadHandSnapshot(tableId: TableId, handId: HandId): Promise<HandSnapshot | null> {
    const result = await this.store.loadHandSnapshot(tableId, handId);
    return result.success ? result.data! : null;
  }

  /**
   * Delete a hand snapshot
   */
  async deleteHandSnapshot(tableId: TableId, handId: HandId): Promise<StoreResult> {
    return this.store.deleteHandSnapshot(tableId, handId);
  }

  // ==========================================================================
  // Server Snapshots
  // ==========================================================================

  /**
   * Create and save a server snapshot
   */
  async createServerSnapshot(tableIds: readonly TableId[]): Promise<StoreResult> {
    const version = ++this.serverVersion;
    const timestamp = Date.now();

    const snapshotData = {
      snapshotId: generateSnapshotId(),
      version,
      timestamp,
      tableIds,
    };

    const checksum = calculateChecksum(snapshotData);

    const snapshot: ServerSnapshot = {
      ...snapshotData,
      checksum,
    };

    return this.store.saveServerSnapshot(snapshot);
  }

  /**
   * Load the server snapshot
   */
  async loadServerSnapshot(): Promise<ServerSnapshot | null> {
    const result = await this.store.loadServerSnapshot();
    return result.success ? result.data! : null;
  }

  // ==========================================================================
  // Event-Driven Persistence
  // ==========================================================================

  /**
   * Handle persistence event and save if appropriate
   */
  async handlePersistenceEvent(
    eventType: PersistenceEventType,
    tableId: TableId,
    config: TableServerConfig,
    gameState: GameState,
    players: readonly PlayerInfo[],
    connectedPlayers: readonly ConnectedPlayer[],
    handNumber: number,
    dealerIndex: number
  ): Promise<StoreResult | null> {
    // Check if we should persist based on event type
    if (!this.shouldPersist(eventType, tableId)) {
      return null;
    }

    return this.createTableSnapshot(
      tableId,
      config,
      gameState,
      players,
      connectedPlayers,
      handNumber,
      dealerIndex
    );
  }

  /**
   * Determine if we should persist based on event type and timing
   */
  private shouldPersist(eventType: PersistenceEventType, tableId: TableId): boolean {
    // Check event type configuration
    switch (eventType) {
      case 'HAND_ENDED':
        if (!this.config.persistOnHandEnd) return false;
        break;
      case 'BETTING_ROUND_END':
        if (!this.config.persistOnBettingRoundEnd) return false;
        break;
      case 'PLAYER_JOINED':
      case 'PLAYER_LEFT':
        if (!this.config.persistOnPlayerChange) return false;
        break;
      case 'TABLE_CREATED':
      case 'TABLE_DESTROYED':
        return true; // Always persist these
    }

    // Check minimum persist interval
    const lastPersist = this.lastPersistTime.get(tableId) ?? 0;
    const now = Date.now();
    if (now - lastPersist < this.config.minPersistIntervalMs) {
      return false;
    }

    return true;
  }

  // ==========================================================================
  // Queries
  // ==========================================================================

  /**
   * List all tables with snapshots
   */
  async listTables(): Promise<TableId[]> {
    return this.store.listTables();
  }

  /**
   * Get all snapshot versions for a table
   */
  async getSnapshotVersions(tableId: TableId): Promise<SnapshotVersion[]> {
    return this.store.getSnapshotVersions(tableId);
  }

  /**
   * Get the current version for a table
   */
  getCurrentVersion(tableId: TableId): SnapshotVersion {
    return this.versionCounters.get(tableId) ?? 0;
  }

  // ==========================================================================
  // Maintenance
  // ==========================================================================

  /**
   * Compact snapshots for a table
   */
  async compact(tableId: TableId): Promise<StoreResult> {
    return this.store.compact(tableId);
  }

  /**
   * Clear all snapshots
   */
  async clear(): Promise<StoreResult> {
    this.versionCounters.clear();
    this.lastPersistTime.clear();
    this.serverVersion = 0;
    return this.store.clear();
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  private getNextVersion(tableId: TableId): SnapshotVersion {
    const current = this.versionCounters.get(tableId) ?? 0;
    return current + 1;
  }

  /**
   * Get the underlying store (for testing)
   */
  getStore(): StateStore {
    return this.store;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createSnapshotManager(
  store: StateStore,
  config?: Partial<SnapshotManagerConfig>
): SnapshotManager {
  return new SnapshotManager(store, config);
}
