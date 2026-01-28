/**
 * StateSnapshotManager.ts
 * Phase 24 - Snapshot and diff-based state synchronization
 *
 * Provides:
 * - Authoritative state snapshot creation
 * - Efficient diff generation between versions
 * - Snapshot caching and compression
 * - State integrity verification
 */

import { PlayerId } from '../security/Identity';
import { TableId, HandId } from '../security/AuditLog';
import { ClubId } from '../club/ClubTypes';
import { Street } from '../game/engine/TableState';
import { IntegrityEventId } from '../integrity/IntegrityTypes';
import {
  StateVersion,
  TimelineCursor,
  SnapshotId,
  StateSnapshot,
  StateDiff,
  DiffOperation,
  DiffOperationType,
  SnapshotTableState,
  SnapshotPlayerState,
  SnapshotHandState,
  SnapshotPotState,
  generateSnapshotId,
  createStateVersion,
  createTimelineCursor,
  calculateStateChecksum,
  verifyStateChecksum,
} from './SyncTypes';

// ============================================================================
// Configuration
// ============================================================================

export interface SnapshotManagerConfig {
  readonly maxCachedSnapshots: number;      // Max snapshots to cache
  readonly snapshotInterval: number;         // Create snapshot every N versions
  readonly maxDiffOperations: number;        // Max ops before forcing snapshot
  readonly compressSnapshots: boolean;       // Enable compression
}

export const DEFAULT_SNAPSHOT_CONFIG: SnapshotManagerConfig = {
  maxCachedSnapshots: 100,
  snapshotInterval: 50,
  maxDiffOperations: 200,
  compressSnapshots: false,
};

// ============================================================================
// StateSnapshotManager Implementation
// ============================================================================

export class StateSnapshotManager {
  private readonly snapshots: Map<StateVersion, StateSnapshot>;
  private readonly diffs: Map<StateVersion, StateDiff>;
  private readonly config: SnapshotManagerConfig;
  private currentVersion: StateVersion;
  private currentCursor: TimelineCursor;
  private currentState: StateSnapshot | null;

  constructor(config: SnapshotManagerConfig = DEFAULT_SNAPSHOT_CONFIG) {
    this.snapshots = new Map();
    this.diffs = new Map();
    this.config = config;
    this.currentVersion = createStateVersion(0);
    this.currentCursor = createTimelineCursor(0);
    this.currentState = null;
  }

  // ==========================================================================
  // Snapshot Creation
  // ==========================================================================

  /**
   * Create initial snapshot for a table
   */
  createInitialSnapshot(
    tableId: TableId,
    clubId: ClubId,
    tableName: string,
    blinds: { small: number; big: number },
    maxSeats: number
  ): StateSnapshot {
    const version = createStateVersion(1);
    const cursor = createTimelineCursor(1);

    const table: SnapshotTableState = {
      tableId,
      clubId,
      tableName,
      maxSeats,
      blinds,
      ante: 0,
      isPaused: false,
      pausedBy: null,
    };

    const hand: SnapshotHandState = {
      handId: null,
      isActive: false,
      street: 'preflop',
      communityCards: [],
      dealerSeat: 0,
      smallBlindSeat: 1,
      bigBlindSeat: 2,
      currentActorSeat: null,
      lastAction: null,
      pot: {
        mainPot: 0,
        sidePots: [],
        totalPot: 0,
      },
      minBet: blinds.big,
      minRaise: blinds.big * 2,
    };

    const snapshotData = JSON.stringify({ table, hand, players: [] });
    const checksum = calculateStateChecksum(snapshotData);

    const snapshot: StateSnapshot = {
      snapshotId: generateSnapshotId(),
      version,
      cursor,
      timestamp: Date.now(),
      table,
      players: new Map(),
      hand,
      checksum,
    };

    this.snapshots.set(version, snapshot);
    this.currentVersion = version;
    this.currentCursor = cursor;
    this.currentState = snapshot;

    return snapshot;
  }

  /**
   * Create snapshot from current state
   */
  createSnapshot(
    table: SnapshotTableState,
    players: ReadonlyMap<PlayerId, SnapshotPlayerState>,
    hand: SnapshotHandState
  ): StateSnapshot {
    const version = createStateVersion(Number(this.currentVersion) + 1);
    const cursor = createTimelineCursor(Number(this.currentCursor) + 1);

    const snapshotData = JSON.stringify({
      table,
      hand,
      players: Array.from(players.entries()),
    });
    const checksum = calculateStateChecksum(snapshotData);

    const snapshot: StateSnapshot = {
      snapshotId: generateSnapshotId(),
      version,
      cursor,
      timestamp: Date.now(),
      table,
      players,
      hand,
      checksum,
    };

    this.snapshots.set(version, snapshot);
    this.currentVersion = version;
    this.currentCursor = cursor;
    this.currentState = snapshot;

    // Cleanup old snapshots
    this.cleanupOldSnapshots();

    return snapshot;
  }

  /**
   * Get current snapshot
   */
  getCurrentSnapshot(): StateSnapshot | null {
    return this.currentState;
  }

  /**
   * Get snapshot by version
   */
  getSnapshot(version: StateVersion): StateSnapshot | null {
    return this.snapshots.get(version) ?? null;
  }

  /**
   * Get current version
   */
  getCurrentVersion(): StateVersion {
    return this.currentVersion;
  }

  /**
   * Get current cursor
   */
  getCurrentCursor(): TimelineCursor {
    return this.currentCursor;
  }

  // ==========================================================================
  // Diff Generation
  // ==========================================================================

  /**
   * Apply a state change and generate diff
   */
  applyChange(
    operations: readonly DiffOperation[],
    eventId?: IntegrityEventId
  ): { snapshot: StateSnapshot; diff: StateDiff } {
    if (!this.currentState) {
      throw new Error('No current state to apply change to');
    }

    const fromVersion = this.currentVersion;
    const fromCursor = this.currentCursor;
    const toVersion = createStateVersion(Number(fromVersion) + 1);
    const toCursor = createTimelineCursor(Number(fromCursor) + 1);

    // Apply operations to current state
    const newState = this.applyOperations(this.currentState, operations);

    // Create diff
    const diffData = JSON.stringify({
      fromVersion,
      toVersion,
      operations,
    });
    const checksum = calculateStateChecksum(diffData);

    const diff: StateDiff = {
      fromVersion,
      toVersion,
      fromCursor,
      toCursor,
      timestamp: Date.now(),
      operations,
      eventId: eventId ?? null,
      checksum,
    };

    this.diffs.set(toVersion, diff);

    // Update current state
    const snapshot = this.createSnapshotFromState(newState, toVersion, toCursor);
    this.currentState = snapshot;
    this.currentVersion = toVersion;
    this.currentCursor = toCursor;

    // Periodically create full snapshot
    if (Number(toVersion) % this.config.snapshotInterval === 0) {
      this.snapshots.set(toVersion, snapshot);
    }

    return { snapshot, diff };
  }

  /**
   * Generate diff between two versions
   */
  generateDiff(
    fromVersion: StateVersion,
    toVersion: StateVersion
  ): StateDiff | null {
    // If we have the diff cached, return it
    if (Number(toVersion) === Number(fromVersion) + 1) {
      return this.diffs.get(toVersion) ?? null;
    }

    // Otherwise, compute diff from snapshots
    const fromSnapshot = this.getClosestSnapshot(fromVersion);
    const toSnapshot = this.snapshots.get(toVersion) ?? this.currentState;

    if (!fromSnapshot || !toSnapshot) {
      return null;
    }

    const operations = this.computeSnapshotDiff(fromSnapshot, toSnapshot);
    const fromCursor = fromSnapshot.cursor;
    const toCursor = toSnapshot.cursor;

    const diffData = JSON.stringify({
      fromVersion,
      toVersion,
      operations,
    });
    const checksum = calculateStateChecksum(diffData);

    return {
      fromVersion,
      toVersion,
      fromCursor,
      toCursor,
      timestamp: Date.now(),
      operations,
      eventId: null,
      checksum,
    };
  }

  /**
   * Get diffs between two versions (inclusive range)
   */
  getDiffRange(
    fromVersion: StateVersion,
    toVersion: StateVersion
  ): readonly StateDiff[] {
    const diffs: StateDiff[] = [];

    for (let v = Number(fromVersion) + 1; v <= Number(toVersion); v++) {
      const diff = this.diffs.get(createStateVersion(v));
      if (diff) {
        diffs.push(diff);
      }
    }

    return diffs;
  }

  // ==========================================================================
  // State Application
  // ==========================================================================

  /**
   * Apply operations to a snapshot
   */
  private applyOperations(
    snapshot: StateSnapshot,
    operations: readonly DiffOperation[]
  ): {
    table: SnapshotTableState;
    players: Map<PlayerId, SnapshotPlayerState>;
    hand: SnapshotHandState;
  } {
    // Deep clone state
    const table = { ...snapshot.table };
    const players = new Map(snapshot.players);
    const hand = { ...snapshot.hand, pot: { ...snapshot.hand.pot } };

    for (const op of operations) {
      this.applyOperation({ table, players, hand }, op);
    }

    return { table, players, hand };
  }

  /**
   * Apply a single operation
   */
  private applyOperation(
    state: {
      table: SnapshotTableState;
      players: Map<PlayerId, SnapshotPlayerState>;
      hand: SnapshotHandState;
    },
    op: DiffOperation
  ): void {
    const [root, ...rest] = op.path;

    switch (root) {
      case 'table':
        this.applyToObject(state.table as any, rest, op);
        break;
      case 'players':
        this.applyToPlayers(state.players, rest, op);
        break;
      case 'hand':
        this.applyToObject(state.hand as any, rest, op);
        break;
    }
  }

  private applyToObject(obj: Record<string, unknown>, path: string[], op: DiffOperation): void {
    if (path.length === 0) return;

    const [key, ...rest] = path;

    if (rest.length === 0) {
      switch (op.operation) {
        case 'SET':
          obj[key] = op.value;
          break;
        case 'DELETE':
          delete obj[key];
          break;
        case 'INCREMENT':
          obj[key] = (obj[key] as number) + (op.value as number);
          break;
        case 'DECREMENT':
          obj[key] = (obj[key] as number) - (op.value as number);
          break;
      }
    } else {
      this.applyToObject(obj[key] as Record<string, unknown>, rest, op);
    }
  }

  private applyToPlayers(
    players: Map<PlayerId, SnapshotPlayerState>,
    path: string[],
    op: DiffOperation
  ): void {
    if (path.length === 0) return;

    const [playerId, ...rest] = path;

    if (rest.length === 0) {
      switch (op.operation) {
        case 'SET':
          players.set(playerId as PlayerId, op.value as SnapshotPlayerState);
          break;
        case 'DELETE':
          players.delete(playerId as PlayerId);
          break;
      }
    } else {
      const player = players.get(playerId as PlayerId);
      if (player) {
        const updated = { ...player };
        this.applyToObject(updated as any, rest, op);
        players.set(playerId as PlayerId, updated);
      }
    }
  }

  // ==========================================================================
  // Snapshot Utilities
  // ==========================================================================

  private createSnapshotFromState(
    state: {
      table: SnapshotTableState;
      players: Map<PlayerId, SnapshotPlayerState>;
      hand: SnapshotHandState;
    },
    version: StateVersion,
    cursor: TimelineCursor
  ): StateSnapshot {
    const snapshotData = JSON.stringify({
      table: state.table,
      hand: state.hand,
      players: Array.from(state.players.entries()),
    });
    const checksum = calculateStateChecksum(snapshotData);

    return {
      snapshotId: generateSnapshotId(),
      version,
      cursor,
      timestamp: Date.now(),
      table: state.table,
      players: state.players,
      hand: state.hand,
      checksum,
    };
  }

  private getClosestSnapshot(version: StateVersion): StateSnapshot | null {
    // Find the closest snapshot at or before this version
    let closest: StateSnapshot | null = null;
    let closestVersion = 0;

    for (const [v, snapshot] of this.snapshots) {
      if (Number(v) <= Number(version) && Number(v) > closestVersion) {
        closest = snapshot;
        closestVersion = Number(v);
      }
    }

    return closest;
  }

  private computeSnapshotDiff(
    from: StateSnapshot,
    to: StateSnapshot
  ): readonly DiffOperation[] {
    const operations: DiffOperation[] = [];

    // Compare table state
    this.compareObjects(from.table, to.table, ['table'], operations);

    // Compare hand state
    this.compareObjects(from.hand, to.hand, ['hand'], operations);

    // Compare players
    const fromPlayerIds = new Set(from.players.keys());
    const toPlayerIds = new Set(to.players.keys());

    // Added players
    for (const playerId of toPlayerIds) {
      if (!fromPlayerIds.has(playerId)) {
        operations.push({
          path: ['players', playerId],
          operation: 'SET',
          value: to.players.get(playerId),
        });
      }
    }

    // Removed players
    for (const playerId of fromPlayerIds) {
      if (!toPlayerIds.has(playerId)) {
        operations.push({
          path: ['players', playerId],
          operation: 'DELETE',
          previousValue: from.players.get(playerId),
        });
      }
    }

    // Changed players
    for (const playerId of fromPlayerIds) {
      if (toPlayerIds.has(playerId)) {
        const fromPlayer = from.players.get(playerId)!;
        const toPlayer = to.players.get(playerId)!;
        this.compareObjects(fromPlayer, toPlayer, ['players', playerId], operations);
      }
    }

    return operations;
  }

  private compareObjects(
    from: unknown,
    to: unknown,
    path: string[],
    operations: DiffOperation[]
  ): void {
    if (from === to) return;

    if (typeof from !== 'object' || typeof to !== 'object' || from === null || to === null) {
      if (from !== to) {
        operations.push({
          path,
          operation: 'SET',
          value: to,
          previousValue: from,
        });
      }
      return;
    }

    const fromObj = from as Record<string, unknown>;
    const toObj = to as Record<string, unknown>;
    const allKeys = new Set([...Object.keys(fromObj), ...Object.keys(toObj)]);

    for (const key of allKeys) {
      const fromVal = fromObj[key];
      const toVal = toObj[key];

      if (!(key in toObj)) {
        operations.push({
          path: [...path, key],
          operation: 'DELETE',
          previousValue: fromVal,
        });
      } else if (!(key in fromObj)) {
        operations.push({
          path: [...path, key],
          operation: 'SET',
          value: toVal,
        });
      } else if (fromVal !== toVal) {
        if (typeof fromVal === 'object' && typeof toVal === 'object') {
          this.compareObjects(fromVal, toVal, [...path, key], operations);
        } else {
          operations.push({
            path: [...path, key],
            operation: 'SET',
            value: toVal,
            previousValue: fromVal,
          });
        }
      }
    }
  }

  private cleanupOldSnapshots(): void {
    if (this.snapshots.size <= this.config.maxCachedSnapshots) {
      return;
    }

    // Keep snapshots at regular intervals
    const versions = Array.from(this.snapshots.keys())
      .sort((a, b) => Number(a) - Number(b));

    const toRemove = versions.slice(0, versions.length - this.config.maxCachedSnapshots);

    for (const version of toRemove) {
      // Keep snapshots at interval boundaries
      if (Number(version) % (this.config.snapshotInterval * 2) !== 0) {
        this.snapshots.delete(version);
      }
    }
  }

  // ==========================================================================
  // Verification
  // ==========================================================================

  /**
   * Verify snapshot integrity
   */
  verifySnapshot(snapshot: StateSnapshot): boolean {
    const snapshotData = JSON.stringify({
      table: snapshot.table,
      hand: snapshot.hand,
      players: Array.from(snapshot.players.entries()),
    });

    return verifyStateChecksum(snapshotData, snapshot.checksum);
  }

  /**
   * Verify diff integrity
   */
  verifyDiff(diff: StateDiff): boolean {
    const diffData = JSON.stringify({
      fromVersion: diff.fromVersion,
      toVersion: diff.toVersion,
      operations: diff.operations,
    });

    return verifyStateChecksum(diffData, diff.checksum);
  }

  /**
   * Clear all state (for testing)
   */
  clear(): void {
    this.snapshots.clear();
    this.diffs.clear();
    this.currentVersion = createStateVersion(0);
    this.currentCursor = createTimelineCursor(0);
    this.currentState = null;
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createStateSnapshotManager(
  config?: SnapshotManagerConfig
): StateSnapshotManager {
  return new StateSnapshotManager(config);
}
