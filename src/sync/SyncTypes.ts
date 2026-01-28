/**
 * SyncTypes.ts
 * Phase 24 - Client session consistency and authoritative state sync types
 *
 * Defines types for:
 * - Client session management with reconnect/resume
 * - Snapshot and diff-based state synchronization
 * - Timeline cursors for replay-safe state
 * - Authoritative server state
 */

import { PlayerId } from '../security/Identity';
import { TableId, HandId } from '../security/AuditLog';
import { ClubId } from '../club/ClubTypes';
import { Street } from '../game/engine/TableState';
import { SessionId, IntegrityEventId } from '../integrity/IntegrityTypes';

// ============================================================================
// Branded Types
// ============================================================================

export type ClientSessionId = string & { readonly __brand: 'ClientSessionId' };
export type DeviceId = string & { readonly __brand: 'DeviceId' };
export type StateVersion = number & { readonly __brand: 'StateVersion' };
export type TimelineCursor = number & { readonly __brand: 'TimelineCursor' };
export type SyncToken = string & { readonly __brand: 'SyncToken' };
export type SnapshotId = string & { readonly __brand: 'SnapshotId' };

// ============================================================================
// Client Session Types
// ============================================================================

/**
 * Client session status
 */
export type ClientSessionStatus =
  | 'CONNECTING'
  | 'CONNECTED'
  | 'DISCONNECTED'
  | 'RECONNECTING'
  | 'SUSPENDED'
  | 'TERMINATED';

/**
 * Disconnect reason
 */
export type DisconnectReason =
  | 'CLIENT_INITIATED'
  | 'SERVER_INITIATED'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'DUPLICATE_SESSION'
  | 'KICKED'
  | 'TABLE_CLOSED';

/**
 * Client device info
 */
export interface ClientDeviceInfo {
  readonly deviceId: DeviceId;
  readonly deviceType: 'ios' | 'android' | 'web' | 'desktop';
  readonly appVersion: string;
  readonly osVersion?: string;
  readonly screenSize?: { width: number; height: number };
}

/**
 * Client session representing a single client connection
 */
export interface ClientSession {
  readonly sessionId: ClientSessionId;
  readonly playerId: PlayerId;
  readonly deviceInfo: ClientDeviceInfo;
  readonly tableId: TableId;
  readonly clubId: ClubId;

  // Connection state
  readonly status: ClientSessionStatus;
  readonly connectedAt: number;
  readonly lastActiveAt: number;
  readonly disconnectedAt: number | null;
  readonly disconnectReason: DisconnectReason | null;

  // Sync state
  readonly currentVersion: StateVersion;
  readonly timelineCursor: TimelineCursor;
  readonly lastSyncToken: SyncToken | null;
  readonly pendingAcks: readonly StateVersion[];

  // Reconnection
  readonly reconnectAttempts: number;
  readonly maxReconnectAttempts: number;
  readonly canResume: boolean;
}

/**
 * Session resume token for reconnection
 */
export interface SessionResumeToken {
  readonly sessionId: ClientSessionId;
  readonly playerId: PlayerId;
  readonly tableId: TableId;
  readonly lastVersion: StateVersion;
  readonly lastCursor: TimelineCursor;
  readonly issuedAt: number;
  readonly expiresAt: number;
  readonly signature: string;
}

// ============================================================================
// State Snapshot Types
// ============================================================================

/**
 * Player state in snapshot
 */
export interface SnapshotPlayerState {
  readonly playerId: PlayerId;
  readonly seatIndex: number;
  readonly stack: number;
  readonly status: 'active' | 'sitting_out' | 'away' | 'disconnected';
  readonly isInHand: boolean;
  readonly isFolded: boolean;
  readonly isAllIn: boolean;
  readonly currentBet: number;
  readonly totalBetThisHand: number;
  readonly timeBank: number;
  readonly cards?: readonly string[]; // Only visible to owner or at showdown
}

/**
 * Pot state in snapshot
 */
export interface SnapshotPotState {
  readonly mainPot: number;
  readonly sidePots: readonly {
    readonly amount: number;
    readonly eligiblePlayers: readonly PlayerId[];
  }[];
  readonly totalPot: number;
}

/**
 * Hand state in snapshot
 */
export interface SnapshotHandState {
  readonly handId: HandId | null;
  readonly isActive: boolean;
  readonly street: Street;
  readonly communityCards: readonly string[];
  readonly dealerSeat: number;
  readonly smallBlindSeat: number;
  readonly bigBlindSeat: number;
  readonly currentActorSeat: number | null;
  readonly lastAction: {
    readonly playerId: PlayerId;
    readonly action: string;
    readonly amount: number;
  } | null;
  readonly pot: SnapshotPotState;
  readonly minBet: number;
  readonly minRaise: number;
}

/**
 * Table state in snapshot
 */
export interface SnapshotTableState {
  readonly tableId: TableId;
  readonly clubId: ClubId;
  readonly tableName: string;
  readonly maxSeats: number;
  readonly blinds: { small: number; big: number };
  readonly ante: number;
  readonly isPaused: boolean;
  readonly pausedBy: PlayerId | null;
}

/**
 * Complete authoritative state snapshot
 */
export interface StateSnapshot {
  readonly snapshotId: SnapshotId;
  readonly version: StateVersion;
  readonly cursor: TimelineCursor;
  readonly timestamp: number;

  // Table state
  readonly table: SnapshotTableState;
  readonly players: ReadonlyMap<PlayerId, SnapshotPlayerState>;
  readonly hand: SnapshotHandState;

  // Checksum for integrity
  readonly checksum: string;
}

// ============================================================================
// State Diff Types
// ============================================================================

/**
 * Type of state change
 */
export type DiffOperationType =
  | 'SET'      // Set a value
  | 'DELETE'   // Remove a value
  | 'INCREMENT'// Increment a numeric value
  | 'DECREMENT'// Decrement a numeric value
  | 'APPEND'   // Append to array
  | 'REMOVE';  // Remove from array

/**
 * Single diff operation
 */
export interface DiffOperation {
  readonly path: readonly string[]; // JSON path to the changed value
  readonly operation: DiffOperationType;
  readonly value?: unknown;
  readonly previousValue?: unknown;
}

/**
 * State diff between two versions
 */
export interface StateDiff {
  readonly fromVersion: StateVersion;
  readonly toVersion: StateVersion;
  readonly fromCursor: TimelineCursor;
  readonly toCursor: TimelineCursor;
  readonly timestamp: number;
  readonly operations: readonly DiffOperation[];
  readonly eventId: IntegrityEventId | null; // Source event if applicable
  readonly checksum: string;
}

// ============================================================================
// Sync Protocol Types
// ============================================================================

/**
 * Sync request from client
 */
export interface SyncRequest {
  readonly sessionId: ClientSessionId;
  readonly currentVersion: StateVersion;
  readonly currentCursor: TimelineCursor;
  readonly lastSyncToken: SyncToken | null;
  readonly requestedRange?: {
    readonly fromVersion: StateVersion;
    readonly toVersion: StateVersion;
  };
}

/**
 * Sync response from server
 */
export interface SyncResponse {
  readonly syncToken: SyncToken;
  readonly serverVersion: StateVersion;
  readonly serverCursor: TimelineCursor;
  readonly timestamp: number;

  // Either full snapshot or diffs
  readonly syncType: 'FULL_SNAPSHOT' | 'INCREMENTAL' | 'NO_CHANGE';
  readonly snapshot: StateSnapshot | null;
  readonly diffs: readonly StateDiff[] | null;

  // Gap information
  readonly hasGap: boolean;
  readonly gapRange: { from: StateVersion; to: StateVersion } | null;
}

/**
 * State acknowledgment from client
 */
export interface StateAck {
  readonly sessionId: ClientSessionId;
  readonly acknowledgedVersion: StateVersion;
  readonly acknowledgedCursor: TimelineCursor;
  readonly receivedAt: number;
}

// ============================================================================
// Timeline Types
// ============================================================================

/**
 * Timeline entry representing a single state change
 */
export interface TimelineEntry {
  readonly cursor: TimelineCursor;
  readonly version: StateVersion;
  readonly timestamp: number;
  readonly eventType: string;
  readonly eventId: IntegrityEventId | null;
  readonly playerId: PlayerId | null;
  readonly handId: HandId | null;
  readonly diff: StateDiff;
}

/**
 * Timeline representing the complete history of state changes
 */
export interface Timeline {
  readonly tableId: TableId;
  readonly sessionId: SessionId;
  readonly entries: readonly TimelineEntry[];
  readonly currentCursor: TimelineCursor;
  readonly currentVersion: StateVersion;
  readonly startedAt: number;
}

// ============================================================================
// Reconnection Types
// ============================================================================

/**
 * Reconnection request
 */
export interface ReconnectRequest {
  readonly resumeToken: SessionResumeToken;
  readonly deviceInfo: ClientDeviceInfo;
  readonly lastKnownVersion: StateVersion;
  readonly lastKnownCursor: TimelineCursor;
}

/**
 * Reconnection response
 */
export interface ReconnectResponse {
  readonly success: boolean;
  readonly error?: string;
  readonly newSessionId?: ClientSessionId;
  readonly syncResponse?: SyncResponse;
  readonly missedEvents?: number;
  readonly requiresFullSync: boolean;
}

// ============================================================================
// Consistency Types
// ============================================================================

/**
 * Consistency check result
 */
export interface ConsistencyCheckResult {
  readonly isConsistent: boolean;
  readonly clientVersion: StateVersion;
  readonly serverVersion: StateVersion;
  readonly clientCursor: TimelineCursor;
  readonly serverCursor: TimelineCursor;
  readonly versionDrift: number;
  readonly cursorDrift: number;
  readonly lastSyncAge: number;
  readonly errors: readonly string[];
}

// ============================================================================
// ID Generation
// ============================================================================

let sessionIdCounter = 0;
let snapshotIdCounter = 0;
let syncTokenCounter = 0;

export function generateClientSessionId(): ClientSessionId {
  return `csess_${Date.now()}_${++sessionIdCounter}` as ClientSessionId;
}

export function generateDeviceId(): DeviceId {
  return `device_${Date.now()}_${Math.random().toString(36).slice(2)}` as DeviceId;
}

export function generateSnapshotId(): SnapshotId {
  return `snap_${Date.now()}_${++snapshotIdCounter}` as SnapshotId;
}

export function generateSyncToken(): SyncToken {
  return `sync_${Date.now()}_${++syncTokenCounter}_${Math.random().toString(36).slice(2)}` as SyncToken;
}

export function createStateVersion(version: number): StateVersion {
  return version as StateVersion;
}

export function createTimelineCursor(cursor: number): TimelineCursor {
  return cursor as TimelineCursor;
}

export function resetSyncCounters(): void {
  sessionIdCounter = 0;
  snapshotIdCounter = 0;
  syncTokenCounter = 0;
}

// ============================================================================
// Checksum Utilities
// ============================================================================

/**
 * Calculate checksum for state integrity
 */
export function calculateStateChecksum(data: string): string {
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `state_${Math.abs(hash).toString(16)}`;
}

/**
 * Verify state checksum
 */
export function verifyStateChecksum(data: string, checksum: string): boolean {
  return calculateStateChecksum(data) === checksum;
}
