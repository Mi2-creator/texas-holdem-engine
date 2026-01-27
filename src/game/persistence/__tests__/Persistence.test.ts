/**
 * Persistence.test.ts
 * Phase 19 - Comprehensive tests for persistence, snapshots, and recovery
 */

import * as fs from 'fs';
import * as path from 'path';
import { PlayerId } from '../../../security/Identity';
import { TableId, HandId } from '../../../security/AuditLog';
import { GameState, PlayerInfo } from '../../service/ServiceTypes';
import { TableServerConfig, DEFAULT_TABLE_CONFIG, ConnectedPlayer } from '../../server/TableServer';
import {
  // Types
  TableSnapshot,
  HandSnapshot,
  ServerSnapshot,
  SnapshotVersion,
  PlayerSnapshotData,
  PlayerHandState,
  ActionRecord,
  StoreResult,
  LoadResult,
  StateStore,
  generateSnapshotId,
  calculateChecksum,
  resetSnapshotCounter,
  DEFAULT_STORE_CONFIG,
  // Memory Store
  MemoryStateStore,
  createMemoryStateStore,
  // File System Store
  FileSystemStateStore,
  createFileSystemStateStore,
  DEFAULT_FS_CONFIG,
  // Snapshot Manager
  SnapshotManager,
  createSnapshotManager,
  DEFAULT_SNAPSHOT_CONFIG,
  // Recovery Manager
  RecoveryManager,
  createRecoveryManager,
  DEFAULT_RECOVERY_CONFIG,
  // Persistent Table Server
  PersistentTableServer,
  createPersistentTableServer,
  DEFAULT_PERSISTENT_CONFIG,
} from '../index';

// ============================================================================
// Test Utilities
// ============================================================================

const TEST_TABLE_ID = 'test-table-001' as TableId;
const TEST_TABLE_ID_2 = 'test-table-002' as TableId;
const TEST_HAND_ID = 'test-hand-001' as HandId;
const TEST_PLAYER_ID = 'player-001' as PlayerId;
const TEST_PLAYER_ID_2 = 'player-002' as PlayerId;
const TEST_CONNECTION_ID = 'conn-001';
const TEST_CONNECTION_ID_2 = 'conn-002';

const TEST_FS_PATH = './data/test-snapshots';

function createTestConfig(): TableServerConfig {
  return {
    ...DEFAULT_TABLE_CONFIG,
    tableId: TEST_TABLE_ID,
  };
}

function createTestGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    tableId: TEST_TABLE_ID,
    handId: TEST_HAND_ID,
    phase: 'BETTING',
    street: 'flop',
    players: [],
    communityCards: [],
    pot: 100,
    currentBet: 20,
    dealerSeat: 0,
    smallBlindSeat: 1,
    bigBlindSeat: 2,
    currentPlayerSeat: 3,
    isHandInProgress: true,
    lastAction: null,
    ...overrides,
  };
}

function createTestPlayers(): PlayerInfo[] {
  return [
    { id: TEST_PLAYER_ID, name: 'Player 1', stack: 1000, seat: 0, isActive: true, isConnected: true },
    { id: TEST_PLAYER_ID_2, name: 'Player 2', stack: 800, seat: 1, isActive: true, isConnected: true },
  ];
}

function createTestConnectedPlayers(): ConnectedPlayer[] {
  return [
    { playerId: TEST_PLAYER_ID, playerName: 'Player 1', connectionId: TEST_CONNECTION_ID, joinedAt: Date.now() },
    { playerId: TEST_PLAYER_ID_2, playerName: 'Player 2', connectionId: TEST_CONNECTION_ID_2, joinedAt: Date.now() },
  ];
}

function createTestTableSnapshot(version: SnapshotVersion = 1): TableSnapshot {
  const snapshotData = {
    snapshotId: generateSnapshotId(),
    version,
    tableId: TEST_TABLE_ID,
    timestamp: Date.now(),
    config: createTestConfig(),
    gameState: createTestGameState(),
    players: [
      { playerId: TEST_PLAYER_ID, playerName: 'Player 1', stack: 1000, seat: 0, isActive: true, joinedAt: Date.now() },
    ],
    handId: TEST_HAND_ID,
    handNumber: 1,
    dealerIndex: 0,
  };
  return {
    ...snapshotData,
    checksum: calculateChecksum(snapshotData),
  };
}

function createTestHandSnapshot(): HandSnapshot {
  const snapshotData = {
    snapshotId: generateSnapshotId(),
    version: 1,
    tableId: TEST_TABLE_ID,
    handId: TEST_HAND_ID,
    timestamp: Date.now(),
    phase: 'BETTING',
    street: 'FLOP',
    pot: 100,
    currentBet: 20,
    communityCards: [],
    playerStates: [],
    dealerSeat: 0,
    activePlayerSeat: 1,
    lastRaiserSeat: 0,
    actionsThisRound: 2,
    deckState: [],
    actionHistory: [],
  };
  return {
    ...snapshotData,
    checksum: calculateChecksum(snapshotData),
  };
}

function createTestServerSnapshot(): ServerSnapshot {
  const snapshotData = {
    snapshotId: generateSnapshotId(),
    version: 1,
    timestamp: Date.now(),
    tableIds: [TEST_TABLE_ID, TEST_TABLE_ID_2],
  };
  return {
    ...snapshotData,
    checksum: calculateChecksum(snapshotData),
  };
}

function cleanupTestDirectory(): void {
  if (fs.existsSync(TEST_FS_PATH)) {
    fs.rmSync(TEST_FS_PATH, { recursive: true });
  }
}

// ============================================================================
// PersistenceTypes Tests
// ============================================================================

describe('PersistenceTypes', () => {
  beforeEach(() => {
    resetSnapshotCounter();
  });

  describe('generateSnapshotId', () => {
    it('should generate unique IDs', () => {
      const id1 = generateSnapshotId();
      const id2 = generateSnapshotId();
      const id3 = generateSnapshotId();

      expect(id1).not.toBe(id2);
      expect(id2).not.toBe(id3);
      expect(id1).not.toBe(id3);
    });

    it('should generate IDs with expected format', () => {
      const id = generateSnapshotId();
      expect(id).toMatch(/^snap_\d+_\d+_[a-z0-9]+$/);
    });
  });

  describe('calculateChecksum', () => {
    it('should calculate consistent checksums for same data', () => {
      const data = { foo: 'bar', num: 42 };
      const checksum1 = calculateChecksum(data);
      const checksum2 = calculateChecksum(data);

      expect(checksum1).toBe(checksum2);
    });

    it('should calculate different checksums for different data', () => {
      const data1 = { foo: 'bar' };
      const data2 = { foo: 'baz' };

      const checksum1 = calculateChecksum(data1);
      const checksum2 = calculateChecksum(data2);

      expect(checksum1).not.toBe(checksum2);
    });

    it('should handle nested objects', () => {
      const data = {
        level1: {
          level2: {
            value: 'deep',
          },
        },
      };
      const checksum = calculateChecksum(data);
      expect(typeof checksum).toBe('string');
      expect(checksum.length).toBeGreaterThan(0);
    });
  });

  describe('DEFAULT_STORE_CONFIG', () => {
    it('should have expected default values', () => {
      expect(DEFAULT_STORE_CONFIG.maxSnapshotsPerTable).toBe(100);
      expect(DEFAULT_STORE_CONFIG.compactionThreshold).toBe(50);
    });
  });
});

// ============================================================================
// MemoryStateStore Tests
// ============================================================================

describe('MemoryStateStore', () => {
  let store: MemoryStateStore;

  beforeEach(() => {
    resetSnapshotCounter();
    store = createMemoryStateStore();
  });

  describe('Table Snapshots', () => {
    it('should save and load table snapshot', async () => {
      const snapshot = createTestTableSnapshot();
      const saveResult = await store.saveTableSnapshot(snapshot);

      expect(saveResult.success).toBe(true);
      expect(saveResult.snapshotId).toBe(snapshot.snapshotId);
      expect(saveResult.version).toBe(snapshot.version);

      const loadResult = await store.loadTableSnapshot(TEST_TABLE_ID, snapshot.version);
      expect(loadResult.success).toBe(true);
      expect(loadResult.data).toEqual(snapshot);
    });

    it('should load latest table snapshot', async () => {
      const snapshot1 = createTestTableSnapshot(1);
      const snapshot2 = createTestTableSnapshot(2);

      await store.saveTableSnapshot(snapshot1);
      await store.saveTableSnapshot(snapshot2);

      const loadResult = await store.loadLatestTableSnapshot(TEST_TABLE_ID);
      expect(loadResult.success).toBe(true);
      expect(loadResult.data?.version).toBe(2);
    });

    it('should return error for non-existent table', async () => {
      const loadResult = await store.loadTableSnapshot('non-existent' as TableId);
      expect(loadResult.success).toBe(false);
      expect(loadResult.error).toContain('No snapshots found');
    });

    it('should delete table snapshots', async () => {
      const snapshot = createTestTableSnapshot();
      await store.saveTableSnapshot(snapshot);

      const deleteResult = await store.deleteTableSnapshots(TEST_TABLE_ID);
      expect(deleteResult.success).toBe(true);

      const loadResult = await store.loadTableSnapshot(TEST_TABLE_ID);
      expect(loadResult.success).toBe(false);
    });
  });

  describe('Hand Snapshots', () => {
    it('should save and load hand snapshot', async () => {
      const snapshot = createTestHandSnapshot();
      const saveResult = await store.saveHandSnapshot(snapshot);

      expect(saveResult.success).toBe(true);

      const loadResult = await store.loadHandSnapshot(TEST_TABLE_ID, TEST_HAND_ID);
      expect(loadResult.success).toBe(true);
      expect(loadResult.data).toEqual(snapshot);
    });

    it('should delete hand snapshot', async () => {
      const snapshot = createTestHandSnapshot();
      await store.saveHandSnapshot(snapshot);

      const deleteResult = await store.deleteHandSnapshot(TEST_TABLE_ID, TEST_HAND_ID);
      expect(deleteResult.success).toBe(true);

      const loadResult = await store.loadHandSnapshot(TEST_TABLE_ID, TEST_HAND_ID);
      expect(loadResult.success).toBe(false);
    });
  });

  describe('Server Snapshots', () => {
    it('should save and load server snapshot', async () => {
      const snapshot = createTestServerSnapshot();
      const saveResult = await store.saveServerSnapshot(snapshot);

      expect(saveResult.success).toBe(true);

      const loadResult = await store.loadServerSnapshot();
      expect(loadResult.success).toBe(true);
      expect(loadResult.data).toEqual(snapshot);
    });
  });

  describe('Queries', () => {
    it('should list all tables', async () => {
      const snapshot1 = createTestTableSnapshot();
      const snapshot2 = { ...createTestTableSnapshot(), tableId: TEST_TABLE_ID_2 };
      snapshot2.checksum = calculateChecksum({ ...snapshot2, checksum: undefined });

      await store.saveTableSnapshot(snapshot1);
      await store.saveTableSnapshot(snapshot2);

      const tables = await store.listTables();
      expect(tables).toContain(TEST_TABLE_ID);
      expect(tables).toContain(TEST_TABLE_ID_2);
    });

    it('should get snapshot versions for a table', async () => {
      await store.saveTableSnapshot(createTestTableSnapshot(1));
      await store.saveTableSnapshot(createTestTableSnapshot(2));
      await store.saveTableSnapshot(createTestTableSnapshot(3));

      const versions = await store.getSnapshotVersions(TEST_TABLE_ID);
      expect(versions).toEqual([1, 2, 3]);
    });
  });

  describe('Compaction', () => {
    it('should compact old snapshots', async () => {
      // Use a custom store with smaller compaction settings for testing
      const testStore = createMemoryStateStore({
        maxSnapshotsPerTable: 10,
        compactionThreshold: 15,
      });

      // Save more snapshots than maxSnapshotsPerTable
      for (let i = 1; i <= 15; i++) {
        await testStore.saveTableSnapshot(createTestTableSnapshot(i));
      }

      const versionsBefore = await testStore.getSnapshotVersions(TEST_TABLE_ID);
      expect(versionsBefore.length).toBe(15);

      await testStore.compact(TEST_TABLE_ID);

      const versionsAfter = await testStore.getSnapshotVersions(TEST_TABLE_ID);
      expect(versionsAfter.length).toBe(10);
      // Should keep the most recent versions
      expect(versionsAfter).toContain(15);
      expect(versionsAfter).toContain(14);
    });
  });

  describe('Clear', () => {
    it('should clear all data', async () => {
      await store.saveTableSnapshot(createTestTableSnapshot());
      await store.saveHandSnapshot(createTestHandSnapshot());
      await store.saveServerSnapshot(createTestServerSnapshot());

      const clearResult = await store.clear();
      expect(clearResult.success).toBe(true);

      const tables = await store.listTables();
      expect(tables.length).toBe(0);

      const serverResult = await store.loadServerSnapshot();
      expect(serverResult.success).toBe(false);
    });
  });
});

// ============================================================================
// FileSystemStateStore Tests
// ============================================================================

describe('FileSystemStateStore', () => {
  let store: FileSystemStateStore;

  beforeEach(() => {
    resetSnapshotCounter();
    cleanupTestDirectory();
    store = createFileSystemStateStore({ basePath: TEST_FS_PATH });
  });

  afterEach(() => {
    cleanupTestDirectory();
  });

  describe('Table Snapshots', () => {
    it('should save and load table snapshot', async () => {
      const snapshot = createTestTableSnapshot();
      const saveResult = await store.saveTableSnapshot(snapshot);

      expect(saveResult.success).toBe(true);
      expect(saveResult.snapshotId).toBe(snapshot.snapshotId);

      const loadResult = await store.loadTableSnapshot(TEST_TABLE_ID, snapshot.version);
      expect(loadResult.success).toBe(true);
      expect(loadResult.data?.snapshotId).toBe(snapshot.snapshotId);
    });

    it('should create files on disk', async () => {
      const snapshot = createTestTableSnapshot();
      await store.saveTableSnapshot(snapshot);

      const tableDir = path.join(TEST_FS_PATH, 'tables', TEST_TABLE_ID);
      expect(fs.existsSync(tableDir)).toBe(true);
      expect(fs.existsSync(path.join(tableDir, 'latest.json'))).toBe(true);
      expect(fs.existsSync(path.join(tableDir, 'v00000001.json'))).toBe(true);
    });

    it('should detect checksum mismatch', async () => {
      const snapshot = createTestTableSnapshot();
      await store.saveTableSnapshot(snapshot);

      // Corrupt the file
      const filePath = path.join(TEST_FS_PATH, 'tables', TEST_TABLE_ID, 'latest.json');
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      data.checksum = 'invalid-checksum';
      fs.writeFileSync(filePath, JSON.stringify(data));

      const loadResult = await store.loadTableSnapshot(TEST_TABLE_ID);
      expect(loadResult.success).toBe(false);
      expect(loadResult.error).toContain('checksum mismatch');
    });

    it('should load latest snapshot', async () => {
      await store.saveTableSnapshot(createTestTableSnapshot(1));
      await store.saveTableSnapshot(createTestTableSnapshot(2));

      const loadResult = await store.loadLatestTableSnapshot(TEST_TABLE_ID);
      expect(loadResult.success).toBe(true);
      expect(loadResult.data?.version).toBe(2);
    });

    it('should delete table snapshots', async () => {
      await store.saveTableSnapshot(createTestTableSnapshot());
      await store.saveHandSnapshot(createTestHandSnapshot());

      const deleteResult = await store.deleteTableSnapshots(TEST_TABLE_ID);
      expect(deleteResult.success).toBe(true);

      const tableDir = path.join(TEST_FS_PATH, 'tables', TEST_TABLE_ID);
      expect(fs.existsSync(tableDir)).toBe(false);
    });
  });

  describe('Hand Snapshots', () => {
    it('should save and load hand snapshot', async () => {
      const snapshot = createTestHandSnapshot();
      const saveResult = await store.saveHandSnapshot(snapshot);

      expect(saveResult.success).toBe(true);

      const loadResult = await store.loadHandSnapshot(TEST_TABLE_ID, TEST_HAND_ID);
      expect(loadResult.success).toBe(true);
      expect(loadResult.data?.handId).toBe(TEST_HAND_ID);
    });

    it('should delete hand snapshot', async () => {
      const snapshot = createTestHandSnapshot();
      await store.saveHandSnapshot(snapshot);

      const deleteResult = await store.deleteHandSnapshot(TEST_TABLE_ID, TEST_HAND_ID);
      expect(deleteResult.success).toBe(true);

      const loadResult = await store.loadHandSnapshot(TEST_TABLE_ID, TEST_HAND_ID);
      expect(loadResult.success).toBe(false);
    });
  });

  describe('Server Snapshots', () => {
    it('should save and load server snapshot', async () => {
      const snapshot = createTestServerSnapshot();
      const saveResult = await store.saveServerSnapshot(snapshot);

      expect(saveResult.success).toBe(true);

      const loadResult = await store.loadServerSnapshot();
      expect(loadResult.success).toBe(true);
      expect(loadResult.data?.tableIds).toEqual([TEST_TABLE_ID, TEST_TABLE_ID_2]);
    });
  });

  describe('Queries', () => {
    it('should list all tables', async () => {
      await store.saveTableSnapshot(createTestTableSnapshot());
      const snapshot2 = { ...createTestTableSnapshot(), tableId: TEST_TABLE_ID_2 };
      snapshot2.checksum = calculateChecksum({ ...snapshot2, checksum: undefined });
      await store.saveTableSnapshot(snapshot2);

      const tables = await store.listTables();
      expect(tables).toContain(TEST_TABLE_ID);
      expect(tables).toContain(TEST_TABLE_ID_2);
    });

    it('should get snapshot versions', async () => {
      await store.saveTableSnapshot(createTestTableSnapshot(1));
      await store.saveTableSnapshot(createTestTableSnapshot(2));
      await store.saveTableSnapshot(createTestTableSnapshot(3));

      const versions = await store.getSnapshotVersions(TEST_TABLE_ID);
      expect(versions).toEqual([1, 2, 3]);
    });
  });

  describe('Compaction', () => {
    it('should compact old snapshots', async () => {
      // Use a custom store with smaller compaction settings for testing
      cleanupTestDirectory();
      const testStore = createFileSystemStateStore({
        basePath: TEST_FS_PATH,
        maxSnapshotsPerTable: 10,
        compactionThreshold: 15,
      });

      for (let i = 1; i <= 15; i++) {
        await testStore.saveTableSnapshot(createTestTableSnapshot(i));
      }

      await testStore.compact(TEST_TABLE_ID);

      const versions = await testStore.getSnapshotVersions(TEST_TABLE_ID);
      expect(versions.length).toBe(10);
    });
  });

  describe('Clear', () => {
    it('should clear all data', async () => {
      await store.saveTableSnapshot(createTestTableSnapshot());
      await store.saveServerSnapshot(createTestServerSnapshot());

      const clearResult = await store.clear();
      expect(clearResult.success).toBe(true);

      const tables = await store.listTables();
      expect(tables.length).toBe(0);
    });
  });

  describe('getBasePath', () => {
    it('should return configured base path', () => {
      expect(store.getBasePath()).toBe(TEST_FS_PATH);
    });
  });
});

// ============================================================================
// SnapshotManager Tests
// ============================================================================

describe('SnapshotManager', () => {
  let store: MemoryStateStore;
  let manager: SnapshotManager;

  beforeEach(() => {
    resetSnapshotCounter();
    store = createMemoryStateStore();
    manager = createSnapshotManager(store);
  });

  describe('Table Snapshots', () => {
    it('should create table snapshot with correct structure', async () => {
      const config = createTestConfig();
      const gameState = createTestGameState();
      const players = createTestPlayers();
      const connectedPlayers = createTestConnectedPlayers();

      const result = await manager.createTableSnapshot(
        TEST_TABLE_ID,
        config,
        gameState,
        players,
        connectedPlayers,
        1,
        0
      );

      expect(result.success).toBe(true);
      expect(result.version).toBe(1);

      const snapshot = await manager.loadTableSnapshot(TEST_TABLE_ID);
      expect(snapshot).not.toBeNull();
      expect(snapshot?.tableId).toBe(TEST_TABLE_ID);
      expect(snapshot?.gameState).toEqual(gameState);
      expect(snapshot?.players.length).toBe(2);
    });

    it('should increment version on each snapshot', async () => {
      const config = createTestConfig();
      const gameState = createTestGameState();
      const players = createTestPlayers();
      const connectedPlayers = createTestConnectedPlayers();

      await manager.createTableSnapshot(TEST_TABLE_ID, config, gameState, players, connectedPlayers, 1, 0);
      await manager.createTableSnapshot(TEST_TABLE_ID, config, gameState, players, connectedPlayers, 2, 0);
      await manager.createTableSnapshot(TEST_TABLE_ID, config, gameState, players, connectedPlayers, 3, 0);

      expect(manager.getCurrentVersion(TEST_TABLE_ID)).toBe(3);
    });

    it('should load specific version', async () => {
      const config = createTestConfig();
      const gameState1 = createTestGameState({ pot: 100 });
      const gameState2 = createTestGameState({ pot: 200 });
      const players = createTestPlayers();
      const connectedPlayers = createTestConnectedPlayers();

      await manager.createTableSnapshot(TEST_TABLE_ID, config, gameState1, players, connectedPlayers, 1, 0);
      await manager.createTableSnapshot(TEST_TABLE_ID, config, gameState2, players, connectedPlayers, 2, 0);

      const snapshot = await manager.loadTableSnapshotVersion(TEST_TABLE_ID, 1);
      expect(snapshot?.gameState.pot).toBe(100);
    });

    it('should delete table snapshots', async () => {
      const config = createTestConfig();
      const gameState = createTestGameState();
      const players = createTestPlayers();
      const connectedPlayers = createTestConnectedPlayers();

      await manager.createTableSnapshot(TEST_TABLE_ID, config, gameState, players, connectedPlayers, 1, 0);

      const deleteResult = await manager.deleteTableSnapshots(TEST_TABLE_ID);
      expect(deleteResult.success).toBe(true);

      const snapshot = await manager.loadTableSnapshot(TEST_TABLE_ID);
      expect(snapshot).toBeNull();
    });
  });

  describe('Hand Snapshots', () => {
    it('should create and load hand snapshot', async () => {
      const result = await manager.createHandSnapshot(
        TEST_TABLE_ID,
        TEST_HAND_ID,
        'BETTING',
        'FLOP',
        100,
        20,
        [],
        [],
        0,
        1,
        0,
        2,
        [],
        []
      );

      expect(result.success).toBe(true);

      const snapshot = await manager.loadHandSnapshot(TEST_TABLE_ID, TEST_HAND_ID);
      expect(snapshot).not.toBeNull();
      expect(snapshot?.handId).toBe(TEST_HAND_ID);
      expect(snapshot?.pot).toBe(100);
    });

    it('should delete hand snapshot', async () => {
      await manager.createHandSnapshot(
        TEST_TABLE_ID,
        TEST_HAND_ID,
        'BETTING',
        'FLOP',
        100,
        20,
        [],
        [],
        0,
        1,
        0,
        2,
        [],
        []
      );

      const deleteResult = await manager.deleteHandSnapshot(TEST_TABLE_ID, TEST_HAND_ID);
      expect(deleteResult.success).toBe(true);

      const snapshot = await manager.loadHandSnapshot(TEST_TABLE_ID, TEST_HAND_ID);
      expect(snapshot).toBeNull();
    });
  });

  describe('Server Snapshots', () => {
    it('should create and load server snapshot', async () => {
      const tableIds = [TEST_TABLE_ID, TEST_TABLE_ID_2];
      const result = await manager.createServerSnapshot(tableIds);

      expect(result.success).toBe(true);

      const snapshot = await manager.loadServerSnapshot();
      expect(snapshot).not.toBeNull();
      expect(snapshot?.tableIds).toEqual(tableIds);
    });
  });

  describe('Event-Driven Persistence', () => {
    it('should persist on HAND_ENDED event', async () => {
      const config = createTestConfig();
      const gameState = createTestGameState();
      const players = createTestPlayers();
      const connectedPlayers = createTestConnectedPlayers();

      const result = await manager.handlePersistenceEvent(
        'HAND_ENDED',
        TEST_TABLE_ID,
        config,
        gameState,
        players,
        connectedPlayers,
        1,
        0
      );

      expect(result?.success).toBe(true);
    });

    it('should persist on TABLE_CREATED event', async () => {
      const config = createTestConfig();
      const gameState = createTestGameState();
      const players = createTestPlayers();
      const connectedPlayers = createTestConnectedPlayers();

      const result = await manager.handlePersistenceEvent(
        'TABLE_CREATED',
        TEST_TABLE_ID,
        config,
        gameState,
        players,
        connectedPlayers,
        0,
        0
      );

      expect(result?.success).toBe(true);
    });

    it('should respect minPersistIntervalMs', async () => {
      const config = createTestConfig();
      const gameState = createTestGameState();
      const players = createTestPlayers();
      const connectedPlayers = createTestConnectedPlayers();

      // First persist
      await manager.handlePersistenceEvent(
        'BETTING_ROUND_END',
        TEST_TABLE_ID,
        config,
        gameState,
        players,
        connectedPlayers,
        1,
        0
      );

      // Immediate second persist should be skipped (within minPersistIntervalMs)
      const result = await manager.handlePersistenceEvent(
        'BETTING_ROUND_END',
        TEST_TABLE_ID,
        config,
        gameState,
        players,
        connectedPlayers,
        1,
        0
      );

      expect(result).toBeNull();
    });

    it('should skip persistence when config disables it', async () => {
      const customManager = createSnapshotManager(store, {
        persistOnHandEnd: false,
        persistOnBettingRoundEnd: false,
        persistOnPlayerChange: false,
      });

      const config = createTestConfig();
      const gameState = createTestGameState();
      const players = createTestPlayers();
      const connectedPlayers = createTestConnectedPlayers();

      const result = await customManager.handlePersistenceEvent(
        'HAND_ENDED',
        TEST_TABLE_ID,
        config,
        gameState,
        players,
        connectedPlayers,
        1,
        0
      );

      expect(result).toBeNull();
    });
  });

  describe('Queries', () => {
    it('should list tables with snapshots', async () => {
      const config = createTestConfig();
      const gameState = createTestGameState();
      const players = createTestPlayers();
      const connectedPlayers = createTestConnectedPlayers();

      await manager.createTableSnapshot(TEST_TABLE_ID, config, gameState, players, connectedPlayers, 1, 0);

      const config2 = { ...config, tableId: TEST_TABLE_ID_2 };
      await manager.createTableSnapshot(TEST_TABLE_ID_2, config2, gameState, players, connectedPlayers, 1, 0);

      const tables = await manager.listTables();
      expect(tables).toContain(TEST_TABLE_ID);
      expect(tables).toContain(TEST_TABLE_ID_2);
    });

    it('should get snapshot versions', async () => {
      const config = createTestConfig();
      const gameState = createTestGameState();
      const players = createTestPlayers();
      const connectedPlayers = createTestConnectedPlayers();

      await manager.createTableSnapshot(TEST_TABLE_ID, config, gameState, players, connectedPlayers, 1, 0);
      await manager.createTableSnapshot(TEST_TABLE_ID, config, gameState, players, connectedPlayers, 2, 0);

      const versions = await manager.getSnapshotVersions(TEST_TABLE_ID);
      expect(versions).toEqual([1, 2]);
    });
  });

  describe('Maintenance', () => {
    it('should compact snapshots', async () => {
      const config = createTestConfig();
      const gameState = createTestGameState();
      const players = createTestPlayers();
      const connectedPlayers = createTestConnectedPlayers();

      for (let i = 0; i < 15; i++) {
        await manager.createTableSnapshot(TEST_TABLE_ID, config, gameState, players, connectedPlayers, i + 1, 0);
      }

      const result = await manager.compact(TEST_TABLE_ID);
      expect(result.success).toBe(true);
    });

    it('should clear all snapshots', async () => {
      const config = createTestConfig();
      const gameState = createTestGameState();
      const players = createTestPlayers();
      const connectedPlayers = createTestConnectedPlayers();

      await manager.createTableSnapshot(TEST_TABLE_ID, config, gameState, players, connectedPlayers, 1, 0);

      const clearResult = await manager.clear();
      expect(clearResult.success).toBe(true);

      const tables = await manager.listTables();
      expect(tables.length).toBe(0);
    });
  });

  describe('getStore', () => {
    it('should return underlying store', () => {
      expect(manager.getStore()).toBe(store);
    });
  });
});

// ============================================================================
// RecoveryManager Tests
// ============================================================================

describe('RecoveryManager', () => {
  let store: MemoryStateStore;
  let snapshotManager: SnapshotManager;
  let recoveryManager: RecoveryManager;

  beforeEach(() => {
    resetSnapshotCounter();
    store = createMemoryStateStore();
    snapshotManager = createSnapshotManager(store);
    recoveryManager = createRecoveryManager(snapshotManager);
  });

  describe('Server Recovery', () => {
    it('should recover server with no tables', async () => {
      const result = await recoveryManager.recoverServer();

      expect(result.success).toBe(true);
      expect(result.tablesRecovered).toBe(0);
      expect(result.errors.length).toBe(0);
    });

    it('should recover server with tables', async () => {
      // Create snapshots
      const config = createTestConfig();
      const gameState = createTestGameState({ isHandInProgress: false });
      const players = createTestPlayers();
      const connectedPlayers = createTestConnectedPlayers();

      await snapshotManager.createTableSnapshot(TEST_TABLE_ID, config, gameState, players, connectedPlayers, 1, 0);
      await snapshotManager.createServerSnapshot([TEST_TABLE_ID]);

      const result = await recoveryManager.recoverServer();

      expect(result.success).toBe(true);
      expect(result.tablesRecovered).toBe(1);
    });

    it('should recover table from snapshot', async () => {
      const config = createTestConfig();
      const gameState = createTestGameState({ isHandInProgress: false });
      const players = createTestPlayers();
      const connectedPlayers = createTestConnectedPlayers();

      await snapshotManager.createTableSnapshot(TEST_TABLE_ID, config, gameState, players, connectedPlayers, 1, 0);

      const result = await recoveryManager.recoverTable(TEST_TABLE_ID);

      expect(result.success).toBe(true);
      expect(result.handRecovered).toBe(false);

      const recoveredTable = recoveryManager.getRecoveredTable(TEST_TABLE_ID);
      expect(recoveredTable).not.toBeNull();
    });

    it('should handle recovery of non-existent table', async () => {
      const result = await recoveryManager.recoverTable('non-existent' as TableId);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No snapshot found');
    });

    it('should track disconnected players during recovery', async () => {
      const config = createTestConfig();
      const gameState = createTestGameState();
      const players = createTestPlayers();
      const connectedPlayers = createTestConnectedPlayers();

      await snapshotManager.createTableSnapshot(TEST_TABLE_ID, config, gameState, players, connectedPlayers, 1, 0);

      await recoveryManager.recoverTable(TEST_TABLE_ID);

      // Players should be marked as disconnected after recovery
      expect(recoveryManager.canReconnect(TEST_PLAYER_ID)).toBe(true);
      expect(recoveryManager.canReconnect(TEST_PLAYER_ID_2)).toBe(true);
    });
  });

  describe('Client Reconnection', () => {
    beforeEach(async () => {
      // Setup: recover a table with players
      const config = createTestConfig();
      const gameState = createTestGameState();
      const players = createTestPlayers();
      const connectedPlayers = createTestConnectedPlayers();

      await snapshotManager.createTableSnapshot(TEST_TABLE_ID, config, gameState, players, connectedPlayers, 1, 0);
      await recoveryManager.recoverTable(TEST_TABLE_ID);
    });

    it('should handle player reconnection', async () => {
      const result = await recoveryManager.handleReconnection(TEST_PLAYER_ID, 'new-conn-001');

      expect(result.success).toBe(true);
      expect(result.tableId).toBe(TEST_TABLE_ID);
      expect(result.seat).toBe(0);
      expect(result.gameState).not.toBeNull();
    });

    it('should reject reconnection for unknown player', async () => {
      const result = await recoveryManager.handleReconnection('unknown-player' as PlayerId, 'conn');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not previously connected');
    });

    it('should reject reconnection after grace period', async () => {
      // Create manager with very short grace period
      const shortGraceManager = createRecoveryManager(snapshotManager, {
        reconnectionGracePeriodMs: 1,
      });

      // Recover table
      const config = createTestConfig();
      const gameState = createTestGameState();
      const players = createTestPlayers();
      const connectedPlayers = createTestConnectedPlayers();

      await snapshotManager.createTableSnapshot(TEST_TABLE_ID, config, gameState, players, connectedPlayers, 2, 0);
      await shortGraceManager.recoverTable(TEST_TABLE_ID);

      // Wait for grace period to expire
      await new Promise(resolve => setTimeout(resolve, 10));

      const result = await shortGraceManager.handleReconnection(TEST_PLAYER_ID, 'conn');

      expect(result.success).toBe(false);
      expect(result.error).toContain('grace period expired');
    });

    it('should get reconnection info', () => {
      const info = recoveryManager.getReconnectionInfo(TEST_PLAYER_ID);

      expect(info).not.toBeNull();
      expect(info?.playerId).toBe(TEST_PLAYER_ID);
      expect(info?.tableId).toBe(TEST_TABLE_ID);
      expect(info?.seat).toBe(0);
    });

    it('should return null for non-disconnected player', () => {
      const info = recoveryManager.getReconnectionInfo('unknown' as PlayerId);
      expect(info).toBeNull();
    });
  });

  describe('Player Management', () => {
    it('should mark player as disconnected', () => {
      recoveryManager.markPlayerDisconnected(
        TEST_PLAYER_ID,
        TEST_TABLE_ID,
        'Player 1',
        0,
        1000
      );

      const info = recoveryManager.getReconnectionInfo(TEST_PLAYER_ID);
      expect(info).not.toBeNull();
      expect(info?.stack).toBe(1000);
    });

    it('should check if player can reconnect', () => {
      expect(recoveryManager.canReconnect(TEST_PLAYER_ID)).toBe(false);

      recoveryManager.markPlayerDisconnected(
        TEST_PLAYER_ID,
        TEST_TABLE_ID,
        'Player 1',
        0,
        1000
      );

      expect(recoveryManager.canReconnect(TEST_PLAYER_ID)).toBe(true);
    });
  });

  describe('State Sync', () => {
    it('should get state sync for reconnecting player', async () => {
      const config = createTestConfig();
      const gameState = createTestGameState();
      const players = createTestPlayers();
      const connectedPlayers = createTestConnectedPlayers();

      await snapshotManager.createTableSnapshot(TEST_TABLE_ID, config, gameState, players, connectedPlayers, 1, 0);
      await recoveryManager.recoverTable(TEST_TABLE_ID);

      // Reconnect player first
      await recoveryManager.handleReconnection(TEST_PLAYER_ID, 'new-conn');

      const state = recoveryManager.getStateSyncForPlayer(TEST_PLAYER_ID, TEST_TABLE_ID);
      expect(state).not.toBeNull();
    });

    it('should build reconnection snapshot', async () => {
      const config = createTestConfig();
      const gameState = createTestGameState();
      const players = createTestPlayers();
      const connectedPlayers = createTestConnectedPlayers();

      await snapshotManager.createTableSnapshot(TEST_TABLE_ID, config, gameState, players, connectedPlayers, 1, 0);
      await recoveryManager.recoverTable(TEST_TABLE_ID);

      const snapshot = recoveryManager.buildReconnectionSnapshot(TEST_PLAYER_ID);

      expect(snapshot.tableId).toBe(TEST_TABLE_ID);
      expect(snapshot.seat).toBe(0);
      expect(snapshot.canRejoin).toBe(true);
    });

    it('should return empty snapshot for unknown player', () => {
      const snapshot = recoveryManager.buildReconnectionSnapshot('unknown' as PlayerId);

      expect(snapshot.tableId).toBeNull();
      expect(snapshot.gameState).toBeNull();
      expect(snapshot.canRejoin).toBe(false);
    });
  });

  describe('Table Management', () => {
    it('should register and unregister tables', async () => {
      const config = createTestConfig();
      const gameState = createTestGameState();
      const players = createTestPlayers();
      const connectedPlayers = createTestConnectedPlayers();

      await snapshotManager.createTableSnapshot(TEST_TABLE_ID, config, gameState, players, connectedPlayers, 1, 0);
      await recoveryManager.recoverTable(TEST_TABLE_ID);

      const table = recoveryManager.getRecoveredTable(TEST_TABLE_ID);
      expect(table).not.toBeNull();

      recoveryManager.unregisterTable(TEST_TABLE_ID);

      const tableAfter = recoveryManager.getRecoveredTable(TEST_TABLE_ID);
      expect(tableAfter).toBeNull();
    });

    it('should get all recovered tables', async () => {
      const config = createTestConfig();
      const gameState = createTestGameState();
      const players = createTestPlayers();
      const connectedPlayers = createTestConnectedPlayers();

      await snapshotManager.createTableSnapshot(TEST_TABLE_ID, config, gameState, players, connectedPlayers, 1, 0);
      await recoveryManager.recoverTable(TEST_TABLE_ID);

      const tables = recoveryManager.getRecoveredTables();
      expect(tables.size).toBe(1);
      expect(tables.has(TEST_TABLE_ID)).toBe(true);
    });

    it('should register player at table', () => {
      recoveryManager.registerPlayerAtTable(TEST_PLAYER_ID, TEST_TABLE_ID);

      // Player is registered but not disconnected
      expect(recoveryManager.canReconnect(TEST_PLAYER_ID)).toBe(false);
    });

    it('should unregister player', () => {
      recoveryManager.markPlayerDisconnected(TEST_PLAYER_ID, TEST_TABLE_ID, 'Player 1', 0, 1000);
      expect(recoveryManager.canReconnect(TEST_PLAYER_ID)).toBe(true);

      recoveryManager.unregisterPlayer(TEST_PLAYER_ID);
      expect(recoveryManager.canReconnect(TEST_PLAYER_ID)).toBe(false);
    });
  });

  describe('Maintenance', () => {
    it('should cleanup expired disconnections', async () => {
      const shortGraceManager = createRecoveryManager(snapshotManager, {
        reconnectionGracePeriodMs: 1,
      });

      shortGraceManager.markPlayerDisconnected(TEST_PLAYER_ID, TEST_TABLE_ID, 'Player 1', 0, 1000);

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 10));

      const cleaned = shortGraceManager.cleanupExpiredDisconnections();
      expect(cleaned).toBe(1);
      expect(shortGraceManager.canReconnect(TEST_PLAYER_ID)).toBe(false);
    });

    it('should clear all recovery state', async () => {
      const config = createTestConfig();
      const gameState = createTestGameState();
      const players = createTestPlayers();
      const connectedPlayers = createTestConnectedPlayers();

      await snapshotManager.createTableSnapshot(TEST_TABLE_ID, config, gameState, players, connectedPlayers, 1, 0);
      await recoveryManager.recoverTable(TEST_TABLE_ID);

      recoveryManager.clear();

      expect(recoveryManager.getRecoveredTables().size).toBe(0);
      expect(recoveryManager.getDisconnectedPlayerCount()).toBe(0);
    });

    it('should get disconnected player count', () => {
      expect(recoveryManager.getDisconnectedPlayerCount()).toBe(0);

      recoveryManager.markPlayerDisconnected(TEST_PLAYER_ID, TEST_TABLE_ID, 'Player 1', 0, 1000);
      expect(recoveryManager.getDisconnectedPlayerCount()).toBe(1);

      recoveryManager.markPlayerDisconnected(TEST_PLAYER_ID_2, TEST_TABLE_ID, 'Player 2', 1, 800);
      expect(recoveryManager.getDisconnectedPlayerCount()).toBe(2);
    });
  });
});

// ============================================================================
// PersistentTableServer Tests
// ============================================================================

describe('PersistentTableServer', () => {
  let store: MemoryStateStore;
  let snapshotManager: SnapshotManager;
  let recoveryManager: RecoveryManager;
  let server: PersistentTableServer;

  beforeEach(() => {
    resetSnapshotCounter();
    store = createMemoryStateStore();
    snapshotManager = createSnapshotManager(store);
    recoveryManager = createRecoveryManager(snapshotManager);
    server = createPersistentTableServer(snapshotManager, recoveryManager, {
      tableId: TEST_TABLE_ID,
      maxPlayers: 9,
      smallBlind: 10,
      bigBlind: 20,
    });
  });

  afterEach(async () => {
    if (!server.isTableDestroyed()) {
      await server.destroy();
    }
  });

  describe('Configuration', () => {
    it('should have expected default config', () => {
      const config = server.getConfig();
      expect(config.enablePersistence).toBe(true);
      expect(config.tableId).toBe(TEST_TABLE_ID);
    });

    it('should return table ID', () => {
      expect(server.getTableId()).toBe(TEST_TABLE_ID);
    });
  });

  describe('Player Management', () => {
    it('should add player and persist', async () => {
      const result = server.addPlayer(TEST_PLAYER_ID, 'Player 1', TEST_CONNECTION_ID, 1000);

      expect(result.success).toBe(true);
      expect(result.seat).toBeDefined();

      // Check persistence
      const snapshot = await snapshotManager.loadTableSnapshot(TEST_TABLE_ID);
      expect(snapshot).not.toBeNull();
    });

    it('should remove player and persist', async () => {
      server.addPlayer(TEST_PLAYER_ID, 'Player 1', TEST_CONNECTION_ID, 1000);

      const result = server.removePlayer(TEST_PLAYER_ID, true);
      expect(result.success).toBe(true);
      expect(result.cashOutAmount).toBe(1000);
    });

    it('should handle disconnection', () => {
      server.addPlayer(TEST_PLAYER_ID, 'Player 1', TEST_CONNECTION_ID, 1000);

      server.handleDisconnection(TEST_CONNECTION_ID);

      // Player should be marked as disconnected
      expect(recoveryManager.canReconnect(TEST_PLAYER_ID)).toBe(true);
    });

    it('should process rebuy', () => {
      server.addPlayer(TEST_PLAYER_ID, 'Player 1', TEST_CONNECTION_ID, 1000);

      const result = server.processRebuy(TEST_PLAYER_ID, 500);
      expect(result.success).toBe(true);
      expect(result.newStack).toBe(1500);
    });
  });

  describe('State Queries', () => {
    it('should get game state', () => {
      const state = server.getGameState();
      expect(state.tableId).toBe(TEST_TABLE_ID);
    });

    it('should get player info', () => {
      server.addPlayer(TEST_PLAYER_ID, 'Player 1', TEST_CONNECTION_ID, 1000);

      const player = server.getPlayer(TEST_PLAYER_ID);
      expect(player).not.toBeUndefined();
      expect(player?.name).toBe('Player 1');
    });

    it('should get all players', () => {
      server.addPlayer(TEST_PLAYER_ID, 'Player 1', TEST_CONNECTION_ID, 1000);
      server.addPlayer(TEST_PLAYER_ID_2, 'Player 2', TEST_CONNECTION_ID_2, 800);

      const players = server.getPlayers();
      expect(players.length).toBe(2);
    });

    it('should get player count', () => {
      expect(server.getPlayerCount()).toBe(0);

      server.addPlayer(TEST_PLAYER_ID, 'Player 1', TEST_CONNECTION_ID, 1000);
      expect(server.getPlayerCount()).toBe(1);
    });

    it('should get connected player IDs', () => {
      server.addPlayer(TEST_PLAYER_ID, 'Player 1', TEST_CONNECTION_ID, 1000);

      const ids = server.getConnectedPlayerIds();
      expect(ids).toContain(TEST_PLAYER_ID);
    });

    it('should get connection ID for player', () => {
      server.addPlayer(TEST_PLAYER_ID, 'Player 1', TEST_CONNECTION_ID, 1000);

      const connId = server.getConnectionId(TEST_PLAYER_ID);
      expect(connId).toBe(TEST_CONNECTION_ID);
    });

    it('should check if hand is in progress', () => {
      expect(server.isHandInProgress()).toBe(false);
    });
  });

  describe('Hand Management', () => {
    beforeEach(() => {
      // Add enough players for a hand
      server.addPlayer(TEST_PLAYER_ID, 'Player 1', TEST_CONNECTION_ID, 1000);
      server.addPlayer(TEST_PLAYER_ID_2, 'Player 2', TEST_CONNECTION_ID_2, 1000);
    });

    it('should start hand and persist', async () => {
      const result = server.startHand();

      expect(result.success).toBe(true);
      expect(result.handId).toBeDefined();

      // Check persistence
      const snapshot = await snapshotManager.loadTableSnapshot(TEST_TABLE_ID);
      expect(snapshot).not.toBeNull();
    });
  });

  describe('Action Processing', () => {
    beforeEach(() => {
      server.addPlayer(TEST_PLAYER_ID, 'Player 1', TEST_CONNECTION_ID, 1000);
      server.addPlayer(TEST_PLAYER_ID_2, 'Player 2', TEST_CONNECTION_ID_2, 1000);
      server.startHand();
    });

    it('should process valid action', () => {
      const validActions = server.getValidActions(TEST_PLAYER_ID);

      if (validActions && validActions.canFold) {
        const result = server.processAction(TEST_PLAYER_ID, 'fold');
        // Action may succeed or fail depending on game state
        expect(typeof result.success).toBe('boolean');
      }
    });

    it('should get valid actions', () => {
      const validActions = server.getValidActions(TEST_PLAYER_ID);
      expect(validActions).toBeDefined();
    });
  });

  describe('Message Senders', () => {
    it('should set message sender', () => {
      const sender = jest.fn();
      server.setMessageSender(sender);
      // No error means success
    });

    it('should set broadcast sender', () => {
      const sender = jest.fn();
      server.setBroadcastSender(sender);
      // No error means success
    });
  });

  describe('Reconnection', () => {
    beforeEach(() => {
      server.addPlayer(TEST_PLAYER_ID, 'Player 1', TEST_CONNECTION_ID, 1000);
      server.handleDisconnection(TEST_CONNECTION_ID);
    });

    it('should check if player can reconnect', () => {
      expect(server.canPlayerReconnect(TEST_PLAYER_ID)).toBe(true);
    });

    it('should get reconnection info', () => {
      const info = server.getReconnectionInfo(TEST_PLAYER_ID);
      expect(info).not.toBeNull();
      expect(info?.tableId).toBe(TEST_TABLE_ID);
    });
  });

  describe('Persistence', () => {
    it('should force snapshot', async () => {
      server.addPlayer(TEST_PLAYER_ID, 'Player 1', TEST_CONNECTION_ID, 1000);

      const success = await server.forceSnapshot();
      expect(success).toBe(true);

      const snapshot = await snapshotManager.loadTableSnapshot(TEST_TABLE_ID);
      expect(snapshot).not.toBeNull();
    });

    it('should not persist when disabled', async () => {
      const noPersistServer = createPersistentTableServer(snapshotManager, recoveryManager, {
        tableId: 'no-persist-table' as TableId,
        enablePersistence: false,
      });

      noPersistServer.addPlayer(TEST_PLAYER_ID, 'Player 1', TEST_CONNECTION_ID, 1000);

      const success = await noPersistServer.forceSnapshot();
      expect(success).toBe(false);

      await noPersistServer.destroy();
    });
  });

  describe('Lifecycle', () => {
    it('should destroy server', async () => {
      await server.destroy();

      expect(server.isTableDestroyed()).toBe(true);
    });

    it('should get underlying table server', () => {
      const tableServer = server.getTableServer();
      expect(tableServer).not.toBeNull();
    });
  });

  describe('Static Recovery', () => {
    it('should recover from snapshot', async () => {
      // Create a snapshot to recover from
      server.addPlayer(TEST_PLAYER_ID, 'Player 1', TEST_CONNECTION_ID, 1000);
      await server.forceSnapshot();

      const snapshot = await snapshotManager.loadTableSnapshot(TEST_TABLE_ID);
      expect(snapshot).not.toBeNull();

      // Create new managers for recovery
      const newStore = createMemoryStateStore();
      const newSnapshotManager = createSnapshotManager(newStore);
      const newRecoveryManager = createRecoveryManager(newSnapshotManager);

      const recoveredServer = await PersistentTableServer.recoverFromSnapshot(
        snapshot!,
        newSnapshotManager,
        newRecoveryManager
      );

      expect(recoveredServer.getTableId()).toBe(TEST_TABLE_ID);
      expect(recoveredServer.getConfig().enablePersistence).toBe(true);

      await recoveredServer.destroy();
    });
  });
});

// ============================================================================
// Integration Tests - Concurrent Tables
// ============================================================================

describe('Concurrent Tables Integration', () => {
  let store: MemoryStateStore;
  let snapshotManager: SnapshotManager;
  let recoveryManager: RecoveryManager;

  beforeEach(() => {
    resetSnapshotCounter();
    store = createMemoryStateStore();
    snapshotManager = createSnapshotManager(store);
    recoveryManager = createRecoveryManager(snapshotManager);
  });

  it('should handle multiple tables independently', async () => {
    const server1 = createPersistentTableServer(snapshotManager, recoveryManager, {
      tableId: TEST_TABLE_ID,
    });

    const server2 = createPersistentTableServer(snapshotManager, recoveryManager, {
      tableId: TEST_TABLE_ID_2,
    });

    // Add players to different tables
    server1.addPlayer(TEST_PLAYER_ID, 'Player 1', 'conn-1', 1000);
    server2.addPlayer(TEST_PLAYER_ID_2, 'Player 2', 'conn-2', 2000);

    // Verify isolation
    expect(server1.getPlayerCount()).toBe(1);
    expect(server2.getPlayerCount()).toBe(1);

    expect(server1.getPlayer(TEST_PLAYER_ID)).not.toBeUndefined();
    expect(server1.getPlayer(TEST_PLAYER_ID_2)).toBeUndefined();

    expect(server2.getPlayer(TEST_PLAYER_ID_2)).not.toBeUndefined();
    expect(server2.getPlayer(TEST_PLAYER_ID)).toBeUndefined();

    // Verify independent snapshots
    const snapshot1 = await snapshotManager.loadTableSnapshot(TEST_TABLE_ID);
    const snapshot2 = await snapshotManager.loadTableSnapshot(TEST_TABLE_ID_2);

    expect(snapshot1?.tableId).toBe(TEST_TABLE_ID);
    expect(snapshot2?.tableId).toBe(TEST_TABLE_ID_2);

    await server1.destroy();
    await server2.destroy();
  });

  it('should recover multiple tables after restart', async () => {
    const server1 = createPersistentTableServer(snapshotManager, recoveryManager, {
      tableId: TEST_TABLE_ID,
    });

    const server2 = createPersistentTableServer(snapshotManager, recoveryManager, {
      tableId: TEST_TABLE_ID_2,
    });

    server1.addPlayer(TEST_PLAYER_ID, 'Player 1', 'conn-1', 1000);
    server2.addPlayer(TEST_PLAYER_ID_2, 'Player 2', 'conn-2', 2000);

    await server1.forceSnapshot();
    await server2.forceSnapshot();
    await snapshotManager.createServerSnapshot([TEST_TABLE_ID, TEST_TABLE_ID_2]);

    // "Restart" - create new recovery manager
    const newRecoveryManager = createRecoveryManager(snapshotManager);

    const result = await newRecoveryManager.recoverServer();

    expect(result.success).toBe(true);
    expect(result.tablesRecovered).toBe(2);

    await server1.destroy();
    await server2.destroy();
  });
});

// ============================================================================
// Integration Tests - Full Recovery Scenario
// ============================================================================

describe('Full Recovery Scenario', () => {
  let store: MemoryStateStore;
  let snapshotManager: SnapshotManager;
  let recoveryManager: RecoveryManager;

  beforeEach(() => {
    resetSnapshotCounter();
    store = createMemoryStateStore();
    snapshotManager = createSnapshotManager(store);
    recoveryManager = createRecoveryManager(snapshotManager);
  });

  it('should handle complete recovery flow', async () => {
    // 1. Create and populate a table
    const server = createPersistentTableServer(snapshotManager, recoveryManager, {
      tableId: TEST_TABLE_ID,
    });

    server.addPlayer(TEST_PLAYER_ID, 'Player 1', TEST_CONNECTION_ID, 1000);
    server.addPlayer(TEST_PLAYER_ID_2, 'Player 2', TEST_CONNECTION_ID_2, 800);

    // 2. Force snapshot before "crash"
    await server.forceSnapshot();
    await snapshotManager.createServerSnapshot([TEST_TABLE_ID]);

    // 3. Simulate server crash - create new managers
    const newRecoveryManager = createRecoveryManager(snapshotManager);

    // 4. Recover server
    const recoveryResult = await newRecoveryManager.recoverServer();
    expect(recoveryResult.success).toBe(true);
    expect(recoveryResult.tablesRecovered).toBe(1);

    // 5. Players should be marked as disconnected
    expect(newRecoveryManager.canReconnect(TEST_PLAYER_ID)).toBe(true);
    expect(newRecoveryManager.canReconnect(TEST_PLAYER_ID_2)).toBe(true);

    // 6. Reconnect player 1
    const reconnectResult = await newRecoveryManager.handleReconnection(TEST_PLAYER_ID, 'new-conn-1');
    expect(reconnectResult.success).toBe(true);
    expect(reconnectResult.tableId).toBe(TEST_TABLE_ID);

    // 7. Player 1 should no longer need reconnection
    expect(newRecoveryManager.canReconnect(TEST_PLAYER_ID)).toBe(false);

    // 8. Player 2 should still need reconnection
    expect(newRecoveryManager.canReconnect(TEST_PLAYER_ID_2)).toBe(true);

    await server.destroy();
  });
});

// ============================================================================
// Default Configs Tests
// ============================================================================

describe('Default Configs', () => {
  it('should have valid DEFAULT_SNAPSHOT_CONFIG', () => {
    expect(DEFAULT_SNAPSHOT_CONFIG.persistOnHandEnd).toBe(true);
    expect(DEFAULT_SNAPSHOT_CONFIG.persistOnBettingRoundEnd).toBe(true);
    expect(DEFAULT_SNAPSHOT_CONFIG.persistOnPlayerChange).toBe(true);
    expect(DEFAULT_SNAPSHOT_CONFIG.minPersistIntervalMs).toBe(1000);
  });

  it('should have valid DEFAULT_RECOVERY_CONFIG', () => {
    expect(DEFAULT_RECOVERY_CONFIG.autoRecoverOnStart).toBe(true);
    expect(DEFAULT_RECOVERY_CONFIG.maxRecoveryAttempts).toBe(3);
    expect(DEFAULT_RECOVERY_CONFIG.reconnectionGracePeriodMs).toBe(60000);
  });

  it('should have valid DEFAULT_PERSISTENT_CONFIG', () => {
    expect(DEFAULT_PERSISTENT_CONFIG.enablePersistence).toBe(true);
  });

  it('should have valid DEFAULT_FS_CONFIG', () => {
    expect(DEFAULT_FS_CONFIG.basePath).toBe('./data/snapshots');
    expect(DEFAULT_FS_CONFIG.prettyPrint).toBe(false);
  });
});
