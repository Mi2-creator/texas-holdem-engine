/**
 * PersistenceTypes.ts
 * Phase 19 - Types for state persistence and recovery
 *
 * Defines all types for persisting game state, snapshots, and recovery.
 */

import { PlayerId } from '../../security/Identity';
import { TableId, HandId } from '../../security/AuditLog';
import { GameState, PlayerInfo, GameServiceConfig } from '../service/ServiceTypes';
import { TableServerConfig, ConnectedPlayer } from '../server/TableServer';
import { Card } from '../engine/Card';

// ============================================================================
// Snapshot Types
// ============================================================================

export type SnapshotVersion = number;
export type SnapshotId = string;

/**
 * Complete table snapshot for persistence
 */
export interface TableSnapshot {
  readonly snapshotId: SnapshotId;
  readonly version: SnapshotVersion;
  readonly tableId: TableId;
  readonly timestamp: number;
  readonly config: TableServerConfig;
  readonly gameState: GameState;
  readonly players: readonly PlayerSnapshotData[];
  readonly handId: HandId | null;
  readonly handNumber: number;
  readonly dealerIndex: number;
  readonly checksum: string;
}

/**
 * Player data for snapshot
 */
export interface PlayerSnapshotData {
  readonly playerId: PlayerId;
  readonly playerName: string;
  readonly stack: number;
  readonly seat: number;
  readonly isActive: boolean;
  readonly joinedAt: number;
}

/**
 * Hand state for persistence (during active hand)
 */
export interface HandSnapshot {
  readonly snapshotId: SnapshotId;
  readonly version: SnapshotVersion;
  readonly tableId: TableId;
  readonly handId: HandId;
  readonly timestamp: number;
  readonly phase: string;
  readonly street: string;
  readonly pot: number;
  readonly currentBet: number;
  readonly communityCards: readonly Card[];
  readonly playerStates: readonly PlayerHandState[];
  readonly dealerSeat: number;
  readonly activePlayerSeat: number | null;
  readonly lastRaiserSeat: number;
  readonly actionsThisRound: number;
  readonly deckState: readonly Card[];
  readonly actionHistory: readonly ActionRecord[];
  readonly checksum: string;
}

/**
 * Player state within a hand
 */
export interface PlayerHandState {
  readonly playerId: PlayerId;
  readonly seat: number;
  readonly stack: number;
  readonly status: string;
  readonly currentBet: number;
  readonly totalBetThisHand: number;
  readonly holeCards: readonly Card[];
  readonly isDealer: boolean;
}

/**
 * Action record for replay
 */
export interface ActionRecord {
  readonly playerId: PlayerId;
  readonly action: string;
  readonly amount: number;
  readonly timestamp: number;
}

// ============================================================================
// Persistence Event Types
// ============================================================================

export type PersistenceEventType =
  | 'HAND_STARTED'
  | 'BETTING_ROUND_END'
  | 'HAND_ENDED'
  | 'PLAYER_JOINED'
  | 'PLAYER_LEFT'
  | 'TABLE_CREATED'
  | 'TABLE_DESTROYED';

export interface PersistenceEvent {
  readonly type: PersistenceEventType;
  readonly tableId: TableId;
  readonly timestamp: number;
  readonly data?: Record<string, unknown>;
}

// ============================================================================
// Store Types
// ============================================================================

/**
 * Key for storing snapshots
 */
export interface SnapshotKey {
  readonly tableId: TableId;
  readonly version?: SnapshotVersion;
}

/**
 * Result of a store operation
 */
export interface StoreResult {
  readonly success: boolean;
  readonly error?: string;
  readonly snapshotId?: SnapshotId;
  readonly version?: SnapshotVersion;
}

/**
 * Result of a load operation
 */
export interface LoadResult<T> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: string;
}

/**
 * Store configuration
 */
export interface StateStoreConfig {
  readonly maxSnapshotsPerTable: number;
  readonly compactionThreshold: number;
  readonly enableCompression: boolean;
}

export const DEFAULT_STORE_CONFIG: StateStoreConfig = {
  maxSnapshotsPerTable: 100,
  compactionThreshold: 50,
  enableCompression: false,
};

// ============================================================================
// Recovery Types
// ============================================================================

/**
 * Server state for recovery
 */
export interface ServerSnapshot {
  readonly snapshotId: SnapshotId;
  readonly version: SnapshotVersion;
  readonly timestamp: number;
  readonly tableIds: readonly TableId[];
  readonly checksum: string;
}

/**
 * Recovery result
 */
export interface RecoveryResult {
  readonly success: boolean;
  readonly tablesRecovered: number;
  readonly handsRecovered: number;
  readonly errors: readonly string[];
  readonly duration: number;
}

/**
 * Reconnection result
 */
export interface ReconnectionResult {
  readonly success: boolean;
  readonly tableId?: TableId;
  readonly seat?: number;
  readonly gameState?: GameState;
  readonly error?: string;
}

// ============================================================================
// StateStore Interface
// ============================================================================

/**
 * Abstract interface for state persistence
 */
export interface StateStore {
  // Table snapshots
  saveTableSnapshot(snapshot: TableSnapshot): Promise<StoreResult>;
  loadTableSnapshot(tableId: TableId, version?: SnapshotVersion): Promise<LoadResult<TableSnapshot>>;
  loadLatestTableSnapshot(tableId: TableId): Promise<LoadResult<TableSnapshot>>;
  deleteTableSnapshots(tableId: TableId): Promise<StoreResult>;

  // Hand snapshots (for active hands)
  saveHandSnapshot(snapshot: HandSnapshot): Promise<StoreResult>;
  loadHandSnapshot(tableId: TableId, handId: HandId): Promise<LoadResult<HandSnapshot>>;
  deleteHandSnapshot(tableId: TableId, handId: HandId): Promise<StoreResult>;

  // Server state
  saveServerSnapshot(snapshot: ServerSnapshot): Promise<StoreResult>;
  loadServerSnapshot(): Promise<LoadResult<ServerSnapshot>>;

  // Queries
  listTables(): Promise<TableId[]>;
  getSnapshotVersions(tableId: TableId): Promise<SnapshotVersion[]>;

  // Maintenance
  compact(tableId: TableId): Promise<StoreResult>;
  clear(): Promise<StoreResult>;
}

// ============================================================================
// Utility Functions
// ============================================================================

let snapshotCounter = 0;

export function generateSnapshotId(): SnapshotId {
  return `snap_${Date.now()}_${++snapshotCounter}_${Math.random().toString(36).substring(2, 8)}`;
}

export function calculateChecksum(data: unknown): string {
  const str = JSON.stringify(data);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

export function resetSnapshotCounter(): void {
  snapshotCounter = 0;
}
