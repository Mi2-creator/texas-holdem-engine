/**
 * Sync Module
 * Phase 24 - Client session consistency and authoritative state sync
 *
 * This module provides multi-client support with:
 * - Client session management with reconnect/resume
 * - Snapshot and diff-based state synchronization
 * - Timeline cursors for replay-safe state
 * - Authoritative server state and consistency verification
 *
 * Key design principles:
 * - Server is always authoritative
 * - Deterministic state synchronization
 * - Efficient incremental updates
 * - Replay-compatible event streams
 */

// Types
export {
  // Branded types
  ClientSessionId,
  DeviceId,
  StateVersion,
  TimelineCursor,
  SyncToken,
  SnapshotId,

  // Session types
  ClientSessionStatus,
  DisconnectReason,
  ClientDeviceInfo,
  ClientSession,
  SessionResumeToken,

  // Snapshot types
  SnapshotPlayerState,
  SnapshotPotState,
  SnapshotHandState,
  SnapshotTableState,
  StateSnapshot,

  // Diff types
  DiffOperationType,
  DiffOperation,
  StateDiff,

  // Sync protocol types
  SyncRequest,
  SyncResponse,
  StateAck,

  // Timeline types
  TimelineEntry,
  Timeline,

  // Reconnection types
  ReconnectRequest,
  ReconnectResponse,

  // Consistency types
  ConsistencyCheckResult,

  // ID generators
  generateClientSessionId,
  generateDeviceId,
  generateSnapshotId,
  generateSyncToken,
  createStateVersion,
  createTimelineCursor,
  resetSyncCounters,

  // Checksum utilities
  calculateStateChecksum,
  verifyStateChecksum,
} from './SyncTypes';

// Client Session Manager
export {
  ClientSessionManager,
  createClientSessionManager,
  SessionManagerConfig,
  DEFAULT_SESSION_CONFIG,
} from './ClientSessionManager';

// State Snapshot Manager
export {
  StateSnapshotManager,
  createStateSnapshotManager,
  SnapshotManagerConfig,
  DEFAULT_SNAPSHOT_CONFIG,
} from './StateSnapshotManager';

// Timeline Manager
export {
  TimelineManager,
  createTimelineManager,
  TimelineConfig,
  DEFAULT_TIMELINE_CONFIG,
} from './TimelineManager';

// Authoritative State Sync
export {
  AuthoritativeStateSync,
  createAuthoritativeStateSync,
  SyncServiceConfig,
  DEFAULT_SYNC_CONFIG,
} from './AuthoritativeStateSync';
