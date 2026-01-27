/**
 * MemoryStateStore.ts
 * Phase 19 - In-memory implementation of StateStore
 *
 * Provides fast, non-persistent storage for testing and development.
 * All data is lost on process restart.
 */

import { TableId, HandId } from '../../security/AuditLog';
import {
  StateStore,
  StateStoreConfig,
  DEFAULT_STORE_CONFIG,
  TableSnapshot,
  HandSnapshot,
  ServerSnapshot,
  SnapshotVersion,
  StoreResult,
  LoadResult,
} from './PersistenceTypes';

// ============================================================================
// MemoryStateStore Implementation
// ============================================================================

export class MemoryStateStore implements StateStore {
  private readonly config: StateStoreConfig;
  private readonly tableSnapshots: Map<TableId, Map<SnapshotVersion, TableSnapshot>>;
  private readonly handSnapshots: Map<string, HandSnapshot>; // key: tableId:handId
  private serverSnapshot: ServerSnapshot | null;
  private readonly versionCounters: Map<TableId, SnapshotVersion>;

  constructor(config: Partial<StateStoreConfig> = {}) {
    this.config = { ...DEFAULT_STORE_CONFIG, ...config };
    this.tableSnapshots = new Map();
    this.handSnapshots = new Map();
    this.serverSnapshot = null;
    this.versionCounters = new Map();
  }

  // ==========================================================================
  // Table Snapshots
  // ==========================================================================

  async saveTableSnapshot(snapshot: TableSnapshot): Promise<StoreResult> {
    try {
      const tableId = snapshot.tableId;

      // Get or create version map for this table
      let versions = this.tableSnapshots.get(tableId);
      if (!versions) {
        versions = new Map();
        this.tableSnapshots.set(tableId, versions);
      }

      // Store snapshot
      versions.set(snapshot.version, snapshot);

      // Update version counter
      const currentVersion = this.versionCounters.get(tableId) ?? 0;
      if (snapshot.version > currentVersion) {
        this.versionCounters.set(tableId, snapshot.version);
      }

      // Check if compaction is needed
      if (versions.size > this.config.compactionThreshold) {
        await this.compact(tableId);
      }

      return {
        success: true,
        snapshotId: snapshot.snapshotId,
        version: snapshot.version,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async loadTableSnapshot(tableId: TableId, version?: SnapshotVersion): Promise<LoadResult<TableSnapshot>> {
    try {
      const versions = this.tableSnapshots.get(tableId);
      if (!versions || versions.size === 0) {
        return {
          success: false,
          error: `No snapshots found for table ${tableId}`,
        };
      }

      if (version !== undefined) {
        const snapshot = versions.get(version);
        if (!snapshot) {
          return {
            success: false,
            error: `Version ${version} not found for table ${tableId}`,
          };
        }
        return { success: true, data: snapshot };
      }

      // Return latest version
      return this.loadLatestTableSnapshot(tableId);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async loadLatestTableSnapshot(tableId: TableId): Promise<LoadResult<TableSnapshot>> {
    try {
      const versions = this.tableSnapshots.get(tableId);
      if (!versions || versions.size === 0) {
        return {
          success: false,
          error: `No snapshots found for table ${tableId}`,
        };
      }

      // Find highest version
      let latestVersion = -1;
      let latestSnapshot: TableSnapshot | null = null;

      for (const [version, snapshot] of versions) {
        if (version > latestVersion) {
          latestVersion = version;
          latestSnapshot = snapshot;
        }
      }

      if (!latestSnapshot) {
        return {
          success: false,
          error: `No snapshots found for table ${tableId}`,
        };
      }

      return { success: true, data: latestSnapshot };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async deleteTableSnapshots(tableId: TableId): Promise<StoreResult> {
    try {
      this.tableSnapshots.delete(tableId);
      this.versionCounters.delete(tableId);

      // Also delete any hand snapshots for this table
      const keysToDelete: string[] = [];
      for (const key of this.handSnapshots.keys()) {
        if (key.startsWith(`${tableId}:`)) {
          keysToDelete.push(key);
        }
      }
      for (const key of keysToDelete) {
        this.handSnapshots.delete(key);
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ==========================================================================
  // Hand Snapshots
  // ==========================================================================

  async saveHandSnapshot(snapshot: HandSnapshot): Promise<StoreResult> {
    try {
      const key = `${snapshot.tableId}:${snapshot.handId}`;
      this.handSnapshots.set(key, snapshot);

      return {
        success: true,
        snapshotId: snapshot.snapshotId,
        version: snapshot.version,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async loadHandSnapshot(tableId: TableId, handId: HandId): Promise<LoadResult<HandSnapshot>> {
    try {
      const key = `${tableId}:${handId}`;
      const snapshot = this.handSnapshots.get(key);

      if (!snapshot) {
        return {
          success: false,
          error: `Hand snapshot not found: ${key}`,
        };
      }

      return { success: true, data: snapshot };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async deleteHandSnapshot(tableId: TableId, handId: HandId): Promise<StoreResult> {
    try {
      const key = `${tableId}:${handId}`;
      this.handSnapshots.delete(key);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ==========================================================================
  // Server Snapshot
  // ==========================================================================

  async saveServerSnapshot(snapshot: ServerSnapshot): Promise<StoreResult> {
    try {
      this.serverSnapshot = snapshot;
      return {
        success: true,
        snapshotId: snapshot.snapshotId,
        version: snapshot.version,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async loadServerSnapshot(): Promise<LoadResult<ServerSnapshot>> {
    try {
      if (!this.serverSnapshot) {
        return {
          success: false,
          error: 'No server snapshot found',
        };
      }

      return { success: true, data: this.serverSnapshot };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ==========================================================================
  // Queries
  // ==========================================================================

  async listTables(): Promise<TableId[]> {
    return Array.from(this.tableSnapshots.keys());
  }

  async getSnapshotVersions(tableId: TableId): Promise<SnapshotVersion[]> {
    const versions = this.tableSnapshots.get(tableId);
    if (!versions) return [];
    return Array.from(versions.keys()).sort((a, b) => a - b);
  }

  // ==========================================================================
  // Maintenance
  // ==========================================================================

  async compact(tableId: TableId): Promise<StoreResult> {
    try {
      const versions = this.tableSnapshots.get(tableId);
      if (!versions) {
        return { success: true };
      }

      // Keep only the most recent snapshots up to maxSnapshotsPerTable
      if (versions.size > this.config.maxSnapshotsPerTable) {
        const sortedVersions = Array.from(versions.keys()).sort((a, b) => b - a);
        const versionsToKeep = sortedVersions.slice(0, this.config.maxSnapshotsPerTable);
        const versionsToDelete = sortedVersions.slice(this.config.maxSnapshotsPerTable);

        for (const version of versionsToDelete) {
          versions.delete(version);
        }
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async clear(): Promise<StoreResult> {
    try {
      this.tableSnapshots.clear();
      this.handSnapshots.clear();
      this.serverSnapshot = null;
      this.versionCounters.clear();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ==========================================================================
  // Helper Methods (for testing)
  // ==========================================================================

  getNextVersion(tableId: TableId): SnapshotVersion {
    const current = this.versionCounters.get(tableId) ?? 0;
    return current + 1;
  }

  getSnapshotCount(tableId: TableId): number {
    return this.tableSnapshots.get(tableId)?.size ?? 0;
  }

  getHandSnapshotCount(): number {
    return this.handSnapshots.size;
  }

  hasServerSnapshot(): boolean {
    return this.serverSnapshot !== null;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createMemoryStateStore(config?: Partial<StateStoreConfig>): MemoryStateStore {
  return new MemoryStateStore(config);
}
