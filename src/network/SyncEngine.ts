/**
 * SyncEngine.ts
 * Phase 12 - State synchronization with snapshots and diffs
 *
 * Handles snapshot storage, diff generation, and replay protection.
 */

import {
  TableId,
  PlayerId,
  MessageHeader,
  TableContext,
  DiffOperation,
  SnapshotEvent,
  DiffEvent,
  createMessageHeader,
  TableSnapshot,
  RoomSnapshot,
} from './Protocol';
import {
  Table,
  Room,
  generateTableSnapshot,
  generateRoomSnapshot,
} from './RoomState';
import { Errors, SyncError } from './NetworkErrors';

// ============================================================================
// Types
// ============================================================================

export interface StoredSnapshot {
  readonly sequence: number;
  readonly timestamp: number;
  readonly snapshot: TableSnapshot;
}

export interface SyncState {
  readonly tableId: TableId;
  readonly currentSequence: number;
  readonly snapshots: ReadonlyMap<number, StoredSnapshot>;
  readonly maxStoredSnapshots: number;
}

export interface SyncResult {
  readonly type: 'snapshot' | 'diff';
  readonly event: SnapshotEvent | DiffEvent;
}

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_MAX_SNAPSHOTS = 100;
const SNAPSHOT_INTERVAL = 10; // Create full snapshot every N sequences

// ============================================================================
// SyncEngine Class
// ============================================================================

export class SyncEngine {
  private syncStates: Map<TableId, SyncState>;
  private globalSequence: number;

  constructor() {
    this.syncStates = new Map();
    this.globalSequence = 0;
  }

  /**
   * Initialize sync state for a table
   */
  initTable(tableId: TableId, maxSnapshots: number = DEFAULT_MAX_SNAPSHOTS): void {
    this.syncStates.set(tableId, {
      tableId,
      currentSequence: 0,
      snapshots: new Map(),
      maxStoredSnapshots: maxSnapshots,
    });
  }

  /**
   * Remove sync state for a table
   */
  removeTable(tableId: TableId): void {
    this.syncStates.delete(tableId);
  }

  /**
   * Get current sequence for a table
   */
  getSequence(tableId: TableId): number {
    const state = this.syncStates.get(tableId);
    return state?.currentSequence ?? 0;
  }

  /**
   * Increment sequence and potentially store snapshot
   */
  incrementSequence(
    tableId: TableId,
    table: Table,
    viewerId: PlayerId | null
  ): number {
    let state = this.syncStates.get(tableId);
    if (!state) {
      this.initTable(tableId);
      state = this.syncStates.get(tableId)!;
    }

    const newSequence = state.currentSequence + 1;

    // Store snapshot at intervals
    if (newSequence % SNAPSHOT_INTERVAL === 0) {
      this.storeSnapshot(tableId, table, viewerId, newSequence);
    }

    // Update state
    this.syncStates.set(tableId, {
      ...state,
      currentSequence: newSequence,
    });

    return newSequence;
  }

  /**
   * Store a snapshot at a specific sequence
   */
  storeSnapshot(
    tableId: TableId,
    table: Table,
    viewerId: PlayerId | null,
    sequence: number
  ): void {
    let state = this.syncStates.get(tableId);
    if (!state) {
      this.initTable(tableId);
      state = this.syncStates.get(tableId)!;
    }

    const snapshot = generateTableSnapshot(table, viewerId);
    const stored: StoredSnapshot = {
      sequence,
      timestamp: Date.now(),
      snapshot,
    };

    const newSnapshots = new Map(state.snapshots);
    newSnapshots.set(sequence, stored);

    // Prune old snapshots
    if (newSnapshots.size > state.maxStoredSnapshots) {
      const sequences = Array.from(newSnapshots.keys()).sort((a, b) => a - b);
      const toRemove = sequences.slice(0, sequences.length - state.maxStoredSnapshots);
      for (const seq of toRemove) {
        newSnapshots.delete(seq);
      }
    }

    // Update currentSequence if this snapshot is newer
    const newCurrentSequence = Math.max(state.currentSequence, sequence);

    this.syncStates.set(tableId, {
      ...state,
      currentSequence: newCurrentSequence,
      snapshots: newSnapshots,
    });
  }

  /**
   * Get snapshot at or before a sequence
   */
  getSnapshotAtOrBefore(tableId: TableId, sequence: number): StoredSnapshot | null {
    const state = this.syncStates.get(tableId);
    if (!state) return null;

    const sequences = Array.from(state.snapshots.keys())
      .filter(s => s <= sequence)
      .sort((a, b) => b - a);

    if (sequences.length === 0) return null;
    return state.snapshots.get(sequences[0]) ?? null;
  }

  /**
   * Validate incoming sequence
   */
  validateSequence(tableId: TableId, incomingSequence: number): void {
    const currentSeq = this.getSequence(tableId);

    if (incomingSequence < currentSeq) {
      throw Errors.staleIntent(incomingSequence, currentSeq);
    }

    if (incomingSequence > currentSeq + 1) {
      throw Errors.sequenceMismatch(currentSeq + 1, incomingSequence);
    }
  }

  /**
   * Generate sync response for a client
   * Returns full snapshot or diff depending on client state
   */
  generateSyncResponse(
    room: Room,
    tableId: TableId,
    playerId: PlayerId,
    clientSequence: number | undefined
  ): SyncResult {
    const table = room.tables.find(t => t.tableId === tableId);
    if (!table) {
      throw Errors.invalidTableId(tableId);
    }

    const currentSeq = this.getSequence(tableId);
    const header = createMessageHeader(++this.globalSequence);
    const tableContext: TableContext = {
      tableId,
      handId: table.handId,
      sequence: currentSeq,
    };

    // If no client sequence or too far behind, send full snapshot
    if (clientSequence === undefined || currentSeq - clientSequence > SNAPSHOT_INTERVAL) {
      const roomSnapshot = generateRoomSnapshot(room, playerId);
      const event: SnapshotEvent = {
        type: 'snapshot',
        header,
        tableContext,
        snapshot: roomSnapshot,
        forPlayerId: playerId,
      };
      return { type: 'snapshot', event };
    }

    // Try to send diff
    const baseSnapshot = this.getSnapshotAtOrBefore(tableId, clientSequence);
    if (!baseSnapshot) {
      // No base snapshot, send full snapshot
      const roomSnapshot = generateRoomSnapshot(room, playerId);
      const event: SnapshotEvent = {
        type: 'snapshot',
        header,
        tableContext,
        snapshot: roomSnapshot,
        forPlayerId: playerId,
      };
      return { type: 'snapshot', event };
    }

    // Generate diff
    const currentSnapshot = generateTableSnapshot(table, playerId);
    const operations = this.generateDiff(baseSnapshot.snapshot, currentSnapshot);

    const event: DiffEvent = {
      type: 'diff',
      header,
      tableContext,
      baseSequence: baseSnapshot.sequence,
      operations,
    };
    return { type: 'diff', event };
  }

  /**
   * Generate diff operations between two snapshots
   */
  generateDiff(
    base: TableSnapshot,
    current: TableSnapshot
  ): DiffOperation[] {
    const operations: DiffOperation[] = [];

    // Compare simple fields
    if (base.handId !== current.handId) {
      operations.push({ op: 'replace', path: '/handId', value: current.handId });
    }
    if (base.handNumber !== current.handNumber) {
      operations.push({ op: 'replace', path: '/handNumber', value: current.handNumber });
    }
    if (base.street !== current.street) {
      operations.push({ op: 'replace', path: '/street', value: current.street });
    }
    if (base.pot !== current.pot) {
      operations.push({ op: 'replace', path: '/pot', value: current.pot });
    }
    if (base.currentBet !== current.currentBet) {
      operations.push({ op: 'replace', path: '/currentBet', value: current.currentBet });
    }
    if (base.minRaise !== current.minRaise) {
      operations.push({ op: 'replace', path: '/minRaise', value: current.minRaise });
    }
    if (base.dealerSeat !== current.dealerSeat) {
      operations.push({ op: 'replace', path: '/dealerSeat', value: current.dealerSeat });
    }
    if (base.activePlayerSeat !== current.activePlayerSeat) {
      operations.push({ op: 'replace', path: '/activePlayerSeat', value: current.activePlayerSeat });
    }

    // Compare community cards
    if (JSON.stringify(base.communityCards) !== JSON.stringify(current.communityCards)) {
      operations.push({ op: 'replace', path: '/communityCards', value: current.communityCards });
    }

    // Compare seats
    for (let i = 0; i < current.seats.length; i++) {
      const baseSeat = base.seats[i];
      const currentSeat = current.seats[i];

      if (!baseSeat) {
        operations.push({ op: 'add', path: `/seats/${i}`, value: currentSeat });
        continue;
      }

      // Compare seat fields
      if (baseSeat.playerId !== currentSeat.playerId) {
        operations.push({ op: 'replace', path: `/seats/${i}/playerId`, value: currentSeat.playerId });
      }
      if (baseSeat.playerName !== currentSeat.playerName) {
        operations.push({ op: 'replace', path: `/seats/${i}/playerName`, value: currentSeat.playerName });
      }
      if (baseSeat.stack !== currentSeat.stack) {
        operations.push({ op: 'replace', path: `/seats/${i}/stack`, value: currentSeat.stack });
      }
      if (baseSeat.status !== currentSeat.status) {
        operations.push({ op: 'replace', path: `/seats/${i}/status`, value: currentSeat.status });
      }
      if (baseSeat.currentBet !== currentSeat.currentBet) {
        operations.push({ op: 'replace', path: `/seats/${i}/currentBet`, value: currentSeat.currentBet });
      }
      if (baseSeat.isDealer !== currentSeat.isDealer) {
        operations.push({ op: 'replace', path: `/seats/${i}/isDealer`, value: currentSeat.isDealer });
      }
      if (baseSeat.isTurn !== currentSeat.isTurn) {
        operations.push({ op: 'replace', path: `/seats/${i}/isTurn`, value: currentSeat.isTurn });
      }
      if (JSON.stringify(baseSeat.holeCards) !== JSON.stringify(currentSeat.holeCards)) {
        operations.push({ op: 'replace', path: `/seats/${i}/holeCards`, value: currentSeat.holeCards });
      }
    }

    return operations;
  }

  /**
   * Apply diff operations to a snapshot (for client-side)
   */
  applyDiff(
    base: TableSnapshot,
    operations: readonly DiffOperation[]
  ): TableSnapshot {
    // Create mutable copy
    const result: Record<string, unknown> = JSON.parse(JSON.stringify(base));

    for (const op of operations) {
      const pathParts = op.path.split('/').filter(p => p !== '');
      let target: Record<string, unknown> = result;

      // Navigate to parent
      for (let i = 0; i < pathParts.length - 1; i++) {
        const key = pathParts[i];
        if (Array.isArray(target[key])) {
          target = (target[key] as unknown[])[parseInt(key, 10)] as Record<string, unknown>;
        } else {
          target = target[key] as Record<string, unknown>;
        }
      }

      const finalKey = pathParts[pathParts.length - 1];

      switch (op.op) {
        case 'add':
        case 'replace':
          if (Array.isArray(target)) {
            target[parseInt(finalKey, 10)] = op.value;
          } else {
            target[finalKey] = op.value;
          }
          break;
        case 'remove':
          if (Array.isArray(target)) {
            target.splice(parseInt(finalKey, 10), 1);
          } else {
            delete target[finalKey];
          }
          break;
      }
    }

    return result as unknown as TableSnapshot;
  }

  /**
   * Check if client is too far behind for diff sync
   */
  needsFullSync(tableId: TableId, clientSequence: number): boolean {
    const currentSeq = this.getSequence(tableId);
    return currentSeq - clientSequence > SNAPSHOT_INTERVAL;
  }

  /**
   * Reset sync state for a table (e.g., on new hand)
   */
  resetTable(tableId: TableId): void {
    const state = this.syncStates.get(tableId);
    if (state) {
      this.syncStates.set(tableId, {
        ...state,
        snapshots: new Map(),
      });
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let syncEngineInstance: SyncEngine | null = null;

export function getSyncEngine(): SyncEngine {
  if (!syncEngineInstance) {
    syncEngineInstance = new SyncEngine();
  }
  return syncEngineInstance;
}

export function resetSyncEngine(): SyncEngine {
  syncEngineInstance = new SyncEngine();
  return syncEngineInstance;
}
