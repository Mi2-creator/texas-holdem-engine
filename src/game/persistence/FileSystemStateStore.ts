/**
 * FileSystemStateStore.ts
 * Phase 19 - Filesystem-based implementation of StateStore
 *
 * Provides persistent storage using the filesystem.
 * Survives process restarts.
 */

import * as fs from 'fs';
import * as path from 'path';
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
  calculateChecksum,
} from './PersistenceTypes';

// ============================================================================
// FileSystemStateStore Configuration
// ============================================================================

export interface FileSystemStoreConfig extends StateStoreConfig {
  readonly basePath: string;
  readonly prettyPrint: boolean;
}

export const DEFAULT_FS_CONFIG: FileSystemStoreConfig = {
  ...DEFAULT_STORE_CONFIG,
  basePath: './data/snapshots',
  prettyPrint: false,
};

// ============================================================================
// FileSystemStateStore Implementation
// ============================================================================

export class FileSystemStateStore implements StateStore {
  private readonly config: FileSystemStoreConfig;
  private readonly tablesPath: string;
  private readonly handsPath: string;
  private readonly serverPath: string;

  constructor(config: Partial<FileSystemStoreConfig> = {}) {
    this.config = { ...DEFAULT_FS_CONFIG, ...config };
    this.tablesPath = path.join(this.config.basePath, 'tables');
    this.handsPath = path.join(this.config.basePath, 'hands');
    this.serverPath = path.join(this.config.basePath, 'server');

    // Ensure directories exist
    this.ensureDirectories();
  }

  private ensureDirectories(): void {
    const dirs = [this.tablesPath, this.handsPath, this.serverPath];
    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  // ==========================================================================
  // Table Snapshots
  // ==========================================================================

  async saveTableSnapshot(snapshot: TableSnapshot): Promise<StoreResult> {
    try {
      const tableDir = path.join(this.tablesPath, snapshot.tableId);
      if (!fs.existsSync(tableDir)) {
        fs.mkdirSync(tableDir, { recursive: true });
      }

      const fileName = `v${snapshot.version.toString().padStart(8, '0')}.json`;
      const filePath = path.join(tableDir, fileName);

      const data = this.config.prettyPrint
        ? JSON.stringify(snapshot, null, 2)
        : JSON.stringify(snapshot);

      fs.writeFileSync(filePath, data, 'utf-8');

      // Also save as 'latest.json' for quick access
      const latestPath = path.join(tableDir, 'latest.json');
      fs.writeFileSync(latestPath, data, 'utf-8');

      // Check if compaction is needed
      const versions = await this.getSnapshotVersions(snapshot.tableId);
      if (versions.length > this.config.compactionThreshold) {
        await this.compact(snapshot.tableId);
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
      const tableDir = path.join(this.tablesPath, tableId);

      if (!fs.existsSync(tableDir)) {
        return {
          success: false,
          error: `No snapshots found for table ${tableId}`,
        };
      }

      let filePath: string;
      if (version !== undefined) {
        const fileName = `v${version.toString().padStart(8, '0')}.json`;
        filePath = path.join(tableDir, fileName);
      } else {
        filePath = path.join(tableDir, 'latest.json');
      }

      if (!fs.existsSync(filePath)) {
        return {
          success: false,
          error: version !== undefined
            ? `Version ${version} not found for table ${tableId}`
            : `No snapshots found for table ${tableId}`,
        };
      }

      const data = fs.readFileSync(filePath, 'utf-8');
      const snapshot: TableSnapshot = JSON.parse(data);

      // Verify checksum
      const { checksum, ...snapshotWithoutChecksum } = snapshot;
      const calculatedChecksum = calculateChecksum(snapshotWithoutChecksum);
      if (calculatedChecksum !== checksum) {
        return {
          success: false,
          error: 'Snapshot checksum mismatch - data may be corrupted',
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

  async loadLatestTableSnapshot(tableId: TableId): Promise<LoadResult<TableSnapshot>> {
    return this.loadTableSnapshot(tableId);
  }

  async deleteTableSnapshots(tableId: TableId): Promise<StoreResult> {
    try {
      const tableDir = path.join(this.tablesPath, tableId);

      if (fs.existsSync(tableDir)) {
        fs.rmSync(tableDir, { recursive: true });
      }

      // Also delete hand snapshots for this table
      const handsDir = path.join(this.handsPath, tableId);
      if (fs.existsSync(handsDir)) {
        fs.rmSync(handsDir, { recursive: true });
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
      const handDir = path.join(this.handsPath, snapshot.tableId);
      if (!fs.existsSync(handDir)) {
        fs.mkdirSync(handDir, { recursive: true });
      }

      const fileName = `${snapshot.handId}.json`;
      const filePath = path.join(handDir, fileName);

      const data = this.config.prettyPrint
        ? JSON.stringify(snapshot, null, 2)
        : JSON.stringify(snapshot);

      fs.writeFileSync(filePath, data, 'utf-8');

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
      const fileName = `${handId}.json`;
      const filePath = path.join(this.handsPath, tableId, fileName);

      if (!fs.existsSync(filePath)) {
        return {
          success: false,
          error: `Hand snapshot not found: ${tableId}/${handId}`,
        };
      }

      const data = fs.readFileSync(filePath, 'utf-8');
      const snapshot: HandSnapshot = JSON.parse(data);

      // Verify checksum
      const { checksum, ...snapshotWithoutChecksum } = snapshot;
      const calculatedChecksum = calculateChecksum(snapshotWithoutChecksum);
      if (calculatedChecksum !== checksum) {
        return {
          success: false,
          error: 'Hand snapshot checksum mismatch - data may be corrupted',
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
      const fileName = `${handId}.json`;
      const filePath = path.join(this.handsPath, tableId, fileName);

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
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
  // Server Snapshot
  // ==========================================================================

  async saveServerSnapshot(snapshot: ServerSnapshot): Promise<StoreResult> {
    try {
      const filePath = path.join(this.serverPath, 'server.json');

      const data = this.config.prettyPrint
        ? JSON.stringify(snapshot, null, 2)
        : JSON.stringify(snapshot);

      fs.writeFileSync(filePath, data, 'utf-8');

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
      const filePath = path.join(this.serverPath, 'server.json');

      if (!fs.existsSync(filePath)) {
        return {
          success: false,
          error: 'No server snapshot found',
        };
      }

      const data = fs.readFileSync(filePath, 'utf-8');
      const snapshot: ServerSnapshot = JSON.parse(data);

      // Verify checksum
      const { checksum, ...snapshotWithoutChecksum } = snapshot;
      const calculatedChecksum = calculateChecksum(snapshotWithoutChecksum);
      if (calculatedChecksum !== checksum) {
        return {
          success: false,
          error: 'Server snapshot checksum mismatch - data may be corrupted',
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

  // ==========================================================================
  // Queries
  // ==========================================================================

  async listTables(): Promise<TableId[]> {
    try {
      if (!fs.existsSync(this.tablesPath)) {
        return [];
      }

      const entries = fs.readdirSync(this.tablesPath, { withFileTypes: true });
      return entries
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name);
    } catch {
      return [];
    }
  }

  async getSnapshotVersions(tableId: TableId): Promise<SnapshotVersion[]> {
    try {
      const tableDir = path.join(this.tablesPath, tableId);

      if (!fs.existsSync(tableDir)) {
        return [];
      }

      const files = fs.readdirSync(tableDir);
      const versions: SnapshotVersion[] = [];

      for (const file of files) {
        const match = file.match(/^v(\d+)\.json$/);
        if (match) {
          versions.push(parseInt(match[1], 10));
        }
      }

      return versions.sort((a, b) => a - b);
    } catch {
      return [];
    }
  }

  // ==========================================================================
  // Maintenance
  // ==========================================================================

  async compact(tableId: TableId): Promise<StoreResult> {
    try {
      const tableDir = path.join(this.tablesPath, tableId);

      if (!fs.existsSync(tableDir)) {
        return { success: true };
      }

      const versions = await this.getSnapshotVersions(tableId);

      if (versions.length > this.config.maxSnapshotsPerTable) {
        // Keep only the most recent versions
        const versionsToDelete = versions.slice(0, versions.length - this.config.maxSnapshotsPerTable);

        for (const version of versionsToDelete) {
          const fileName = `v${version.toString().padStart(8, '0')}.json`;
          const filePath = path.join(tableDir, fileName);

          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
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
      if (fs.existsSync(this.config.basePath)) {
        fs.rmSync(this.config.basePath, { recursive: true });
      }
      this.ensureDirectories();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  getBasePath(): string {
    return this.config.basePath;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createFileSystemStateStore(config?: Partial<FileSystemStoreConfig>): FileSystemStateStore {
  return new FileSystemStateStore(config);
}
