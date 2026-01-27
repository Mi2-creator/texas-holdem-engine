/**
 * Persistence Layer Module Exports
 * Phase 19 - State persistence, snapshots, and recovery
 */

// Types
export {
  // Snapshot Types
  SnapshotVersion,
  SnapshotId,
  TableSnapshot,
  HandSnapshot,
  ServerSnapshot,
  PlayerSnapshotData,
  PlayerHandState,
  ActionRecord,
  // Event Types
  PersistenceEventType,
  PersistenceEvent,
  // Store Types
  SnapshotKey,
  StoreResult,
  LoadResult,
  StateStoreConfig,
  DEFAULT_STORE_CONFIG,
  // Recovery Types
  RecoveryResult,
  ReconnectionResult,
  // Interface
  StateStore,
  // Utilities
  generateSnapshotId,
  calculateChecksum,
  resetSnapshotCounter,
} from './PersistenceTypes';

// Memory Store
export {
  MemoryStateStore,
  createMemoryStateStore,
} from './MemoryStateStore';

// File System Store
export {
  FileSystemStateStore,
  createFileSystemStateStore,
  FileSystemStoreConfig,
  DEFAULT_FS_CONFIG,
} from './FileSystemStateStore';

// Snapshot Manager
export {
  SnapshotManager,
  createSnapshotManager,
  SnapshotManagerConfig,
  DEFAULT_SNAPSHOT_CONFIG,
} from './SnapshotManager';

// Recovery Manager
export {
  RecoveryManager,
  createRecoveryManager,
  RecoveryManagerConfig,
  DEFAULT_RECOVERY_CONFIG,
} from './RecoveryManager';

// Persistent Table Server
export {
  PersistentTableServer,
  createPersistentTableServer,
  PersistentTableServerConfig,
  DEFAULT_PERSISTENT_CONFIG,
} from './PersistentTableServer';
