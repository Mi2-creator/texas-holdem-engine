/**
 * Sync Module Tests
 * Phase 24 - Comprehensive tests for client session consistency
 *
 * Tests cover:
 * - Client session lifecycle
 * - Reconnect and resume
 * - Snapshot and diff synchronization
 * - Timeline cursor management
 * - Consistency verification
 * - Disconnect recovery scenarios
 */

import {
  ClientSessionManager,
  createClientSessionManager,
  DEFAULT_SESSION_CONFIG,
} from '../ClientSessionManager';
import {
  StateSnapshotManager,
  createStateSnapshotManager,
} from '../StateSnapshotManager';
import {
  TimelineManager,
  createTimelineManager,
} from '../TimelineManager';
import {
  AuthoritativeStateSync,
  createAuthoritativeStateSync,
} from '../AuthoritativeStateSync';
import {
  ClientSession,
  ClientSessionId,
  DeviceId,
  StateVersion,
  TimelineCursor,
  SyncRequest,
  SyncResponse,
  StateSnapshot,
  StateDiff,
  DiffOperation,
  ClientDeviceInfo,
  generateClientSessionId,
  generateDeviceId,
  createStateVersion,
  createTimelineCursor,
  resetSyncCounters,
} from '../SyncTypes';
import { PlayerId } from '../../security/Identity';
import { TableId, HandId } from '../../security/AuditLog';
import { ClubId } from '../../club/ClubTypes';
import { SessionId } from '../../integrity/IntegrityTypes';

// ============================================================================
// Test Helpers
// ============================================================================

const TEST_CLUB_ID = 'club_test' as ClubId;
const TEST_TABLE_ID = 'table_test' as TableId;
const TEST_SESSION_ID = 'session_test' as SessionId;

function createTestPlayer(num: number): PlayerId {
  return `player_${num}` as PlayerId;
}

function createTestDevice(type: 'ios' | 'android' | 'web' = 'ios'): ClientDeviceInfo {
  return {
    deviceId: generateDeviceId(),
    deviceType: type,
    appVersion: '1.0.0',
    osVersion: '15.0',
  };
}

// ============================================================================
// ClientSessionManager Tests
// ============================================================================

describe('ClientSessionManager', () => {
  let manager: ClientSessionManager;

  beforeEach(() => {
    resetSyncCounters();
    manager = createClientSessionManager();
  });

  afterEach(() => {
    manager.clear();
  });

  describe('Session Lifecycle', () => {
    it('should create a new session', () => {
      const playerId = createTestPlayer(1);
      const device = createTestDevice();

      const { session, existingTerminated } = manager.createSession(
        playerId,
        TEST_TABLE_ID,
        TEST_CLUB_ID,
        device
      );

      expect(session.sessionId).toBeDefined();
      expect(session.playerId).toBe(playerId);
      expect(session.status).toBe('CONNECTED');
      expect(existingTerminated).toHaveLength(0);
    });

    it('should get session by ID', () => {
      const playerId = createTestPlayer(1);
      const device = createTestDevice();

      const { session } = manager.createSession(playerId, TEST_TABLE_ID, TEST_CLUB_ID, device);
      const retrieved = manager.getSession(session.sessionId);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.sessionId).toBe(session.sessionId);
    });

    it('should get all sessions for a player', () => {
      const playerId = createTestPlayer(1);
      const device1 = createTestDevice('ios');
      const device2 = createTestDevice('android');

      manager.createSession(playerId, TEST_TABLE_ID, TEST_CLUB_ID, device1);
      manager.createSession(playerId, TEST_TABLE_ID, TEST_CLUB_ID, device2);

      const sessions = manager.getPlayerSessions(playerId);
      expect(sessions).toHaveLength(2);
    });

    it('should terminate excess sessions when over limit', () => {
      const playerId = createTestPlayer(1);
      const config = { ...DEFAULT_SESSION_CONFIG, maxSessionsPerPlayer: 2 };
      const limitedManager = createClientSessionManager(config);

      // Create 3 sessions
      limitedManager.createSession(playerId, TEST_TABLE_ID, TEST_CLUB_ID, createTestDevice('ios'));
      limitedManager.createSession(playerId, TEST_TABLE_ID, TEST_CLUB_ID, createTestDevice('android'));
      const { existingTerminated } = limitedManager.createSession(
        playerId, TEST_TABLE_ID, TEST_CLUB_ID, createTestDevice('web')
      );

      expect(existingTerminated).toHaveLength(1);
      expect(limitedManager.getPlayerSessions(playerId).filter(s => s.status === 'CONNECTED')).toHaveLength(2);
    });
  });

  describe('Session State Updates', () => {
    it('should update sync state', () => {
      const playerId = createTestPlayer(1);
      const { session } = manager.createSession(playerId, TEST_TABLE_ID, TEST_CLUB_ID, createTestDevice());

      const updated = manager.updateSessionSync(
        session.sessionId,
        createStateVersion(5),
        createTimelineCursor(5),
        'sync_token' as any
      );

      expect(updated).not.toBeNull();
      expect(updated!.currentVersion).toBe(5);
      expect(updated!.timelineCursor).toBe(5);
    });

    it('should record heartbeat', () => {
      const playerId = createTestPlayer(1);
      const { session } = manager.createSession(playerId, TEST_TABLE_ID, TEST_CLUB_ID, createTestDevice());

      const initialActive = session.lastActiveAt;

      // recordHeartbeat updates lastActiveAt to current time
      const updated = manager.recordHeartbeat(session.sessionId);

      expect(updated).not.toBeNull();
      expect(updated!.lastActiveAt).toBeGreaterThanOrEqual(initialActive);
    });

    it('should acknowledge version', () => {
      const playerId = createTestPlayer(1);
      const { session } = manager.createSession(playerId, TEST_TABLE_ID, TEST_CLUB_ID, createTestDevice());

      manager.addPendingAck(session.sessionId, createStateVersion(1));
      manager.addPendingAck(session.sessionId, createStateVersion(2));
      manager.addPendingAck(session.sessionId, createStateVersion(3));

      const updated = manager.acknowledgeVersion(session.sessionId, createStateVersion(2));

      expect(updated).not.toBeNull();
      expect(updated!.pendingAcks).toEqual([createStateVersion(3)]);
    });
  });

  describe('Disconnect and Reconnect', () => {
    it('should disconnect session and generate resume token', () => {
      const playerId = createTestPlayer(1);
      const { session } = manager.createSession(playerId, TEST_TABLE_ID, TEST_CLUB_ID, createTestDevice());

      const result = manager.disconnectSession(session.sessionId, 'NETWORK_ERROR');

      expect(result).not.toBeNull();
      expect(result!.session.status).toBe('DISCONNECTED');
      expect(result!.resumeToken).toBeDefined();
      expect(result!.resumeToken.sessionId).toBe(session.sessionId);
    });

    it('should reconnect session with valid resume token', () => {
      const playerId = createTestPlayer(1);
      const device = createTestDevice();
      const { session } = manager.createSession(playerId, TEST_TABLE_ID, TEST_CLUB_ID, device);

      const disconnectResult = manager.disconnectSession(session.sessionId, 'NETWORK_ERROR');
      expect(disconnectResult).not.toBeNull();

      const reconnectResult = manager.reconnectSession({
        resumeToken: disconnectResult!.resumeToken,
        deviceInfo: device,
        lastKnownVersion: createStateVersion(0),
        lastKnownCursor: createTimelineCursor(0),
      });

      expect(reconnectResult.success).toBe(true);
      expect(reconnectResult.newSessionId).toBe(session.sessionId);
    });

    it('should reject reconnection with expired token', async () => {
      // Create a manager with very short resume token TTL (10ms)
      const shortTtlManager = new ClientSessionManager({
        ...DEFAULT_SESSION_CONFIG,
        resumeTokenTtlMs: 10, // 10ms TTL
      });

      const playerId = createTestPlayer(1);
      const device = createTestDevice();
      const { session } = shortTtlManager.createSession(playerId, TEST_TABLE_ID, TEST_CLUB_ID, device);

      const disconnectResult = shortTtlManager.disconnectSession(session.sessionId, 'NETWORK_ERROR');
      expect(disconnectResult).not.toBeNull();

      // Wait for token to expire (more than 10ms)
      await new Promise(resolve => setTimeout(resolve, 20));

      const reconnectResult = shortTtlManager.reconnectSession({
        resumeToken: disconnectResult!.resumeToken,
        deviceInfo: device,
        lastKnownVersion: createStateVersion(0),
        lastKnownCursor: createTimelineCursor(0),
      });

      expect(reconnectResult.success).toBe(false);
      expect(reconnectResult.error).toContain('expired');
    });

    it('should not allow resume for kicked sessions', () => {
      const playerId = createTestPlayer(1);
      const device = createTestDevice();
      const { session } = manager.createSession(playerId, TEST_TABLE_ID, TEST_CLUB_ID, device);

      const disconnectResult = manager.disconnectSession(session.sessionId, 'KICKED');

      expect(disconnectResult).not.toBeNull();
      expect(disconnectResult!.session.canResume).toBe(false);
    });

    it('should terminate session permanently', () => {
      const playerId = createTestPlayer(1);
      const { session } = manager.createSession(playerId, TEST_TABLE_ID, TEST_CLUB_ID, createTestDevice());

      const terminated = manager.terminateSession(session.sessionId, 'TABLE_CLOSED');

      expect(terminated).not.toBeNull();
      expect(terminated!.status).toBe('TERMINATED');
      expect(terminated!.canResume).toBe(false);
    });
  });

  describe('Statistics', () => {
    it('should calculate session statistics', () => {
      const player1 = createTestPlayer(1);
      const player2 = createTestPlayer(2);

      manager.createSession(player1, TEST_TABLE_ID, TEST_CLUB_ID, createTestDevice());
      manager.createSession(player2, TEST_TABLE_ID, TEST_CLUB_ID, createTestDevice());

      const stats = manager.getStatistics();

      expect(stats.totalSessions).toBe(2);
      expect(stats.connected).toBe(2);
      expect(stats.byTable.get(TEST_TABLE_ID)).toBe(2);
    });
  });
});

// ============================================================================
// StateSnapshotManager Tests
// ============================================================================

describe('StateSnapshotManager', () => {
  let manager: StateSnapshotManager;

  beforeEach(() => {
    resetSyncCounters();
    manager = createStateSnapshotManager();
  });

  afterEach(() => {
    manager.clear();
  });

  describe('Snapshot Creation', () => {
    it('should create initial snapshot', () => {
      const snapshot = manager.createInitialSnapshot(
        TEST_TABLE_ID,
        TEST_CLUB_ID,
        'Test Table',
        { small: 5, big: 10 },
        9
      );

      expect(snapshot.snapshotId).toBeDefined();
      expect(snapshot.version).toBe(1);
      expect(snapshot.table.tableId).toBe(TEST_TABLE_ID);
      expect(snapshot.checksum).toBeDefined();
    });

    it('should get current snapshot', () => {
      manager.createInitialSnapshot(
        TEST_TABLE_ID,
        TEST_CLUB_ID,
        'Test Table',
        { small: 5, big: 10 },
        9
      );

      const current = manager.getCurrentSnapshot();

      expect(current).not.toBeNull();
      expect(current!.version).toBe(1);
    });

    it('should track current version', () => {
      manager.createInitialSnapshot(
        TEST_TABLE_ID,
        TEST_CLUB_ID,
        'Test Table',
        { small: 5, big: 10 },
        9
      );

      expect(manager.getCurrentVersion()).toBe(1);
      expect(manager.getCurrentCursor()).toBe(1);
    });
  });

  describe('State Changes', () => {
    it('should apply changes and generate diff', () => {
      manager.createInitialSnapshot(
        TEST_TABLE_ID,
        TEST_CLUB_ID,
        'Test Table',
        { small: 5, big: 10 },
        9
      );

      const operations: DiffOperation[] = [
        {
          path: ['table', 'isPaused'],
          operation: 'SET',
          value: true,
        },
      ];

      const { snapshot, diff } = manager.applyChange(operations);

      expect(snapshot.version).toBe(2);
      expect(diff.fromVersion).toBe(1);
      expect(diff.toVersion).toBe(2);
      expect(diff.operations).toHaveLength(1);
    });

    it('should increment version on each change', () => {
      manager.createInitialSnapshot(
        TEST_TABLE_ID,
        TEST_CLUB_ID,
        'Test Table',
        { small: 5, big: 10 },
        9
      );

      manager.applyChange([{ path: ['table', 'isPaused'], operation: 'SET', value: true }]);
      manager.applyChange([{ path: ['table', 'isPaused'], operation: 'SET', value: false }]);
      manager.applyChange([{ path: ['table', 'ante'], operation: 'SET', value: 1 }]);

      expect(manager.getCurrentVersion()).toBe(4);
    });
  });

  describe('Diff Generation', () => {
    it('should get diff range', () => {
      manager.createInitialSnapshot(
        TEST_TABLE_ID,
        TEST_CLUB_ID,
        'Test Table',
        { small: 5, big: 10 },
        9
      );

      manager.applyChange([{ path: ['table', 'isPaused'], operation: 'SET', value: true }]);
      manager.applyChange([{ path: ['table', 'isPaused'], operation: 'SET', value: false }]);
      manager.applyChange([{ path: ['table', 'ante'], operation: 'SET', value: 1 }]);

      const diffs = manager.getDiffRange(createStateVersion(1), createStateVersion(4));

      expect(diffs).toHaveLength(3);
    });
  });

  describe('Verification', () => {
    it('should verify valid snapshot', () => {
      const snapshot = manager.createInitialSnapshot(
        TEST_TABLE_ID,
        TEST_CLUB_ID,
        'Test Table',
        { small: 5, big: 10 },
        9
      );

      const isValid = manager.verifySnapshot(snapshot);
      expect(isValid).toBe(true);
    });

    it('should verify valid diff', () => {
      manager.createInitialSnapshot(
        TEST_TABLE_ID,
        TEST_CLUB_ID,
        'Test Table',
        { small: 5, big: 10 },
        9
      );

      const { diff } = manager.applyChange([
        { path: ['table', 'isPaused'], operation: 'SET', value: true },
      ]);

      const isValid = manager.verifyDiff(diff);
      expect(isValid).toBe(true);
    });
  });
});

// ============================================================================
// TimelineManager Tests
// ============================================================================

describe('TimelineManager', () => {
  let manager: TimelineManager;

  beforeEach(() => {
    resetSyncCounters();
    manager = createTimelineManager();
  });

  afterEach(() => {
    manager.clear();
  });

  describe('Timeline Management', () => {
    it('should create timeline', () => {
      const timeline = manager.createTimeline(TEST_TABLE_ID, TEST_SESSION_ID);

      expect(timeline.tableId).toBe(TEST_TABLE_ID);
      expect(timeline.currentCursor).toBe(0);
      expect(timeline.entries).toHaveLength(0);
    });

    it('should get timeline', () => {
      manager.createTimeline(TEST_TABLE_ID, TEST_SESSION_ID);
      const timeline = manager.getTimeline(TEST_TABLE_ID);

      expect(timeline).not.toBeNull();
    });

    it('should append entry', () => {
      manager.createTimeline(TEST_TABLE_ID, TEST_SESSION_ID);

      const diff: StateDiff = {
        fromVersion: createStateVersion(0),
        toVersion: createStateVersion(1),
        fromCursor: createTimelineCursor(0),
        toCursor: createTimelineCursor(1),
        timestamp: Date.now(),
        operations: [],
        eventId: null,
        checksum: 'test',
      };

      const entry = manager.appendEntry(TEST_TABLE_ID, 'player_action', diff);

      expect(entry).not.toBeNull();
      expect(entry!.cursor).toBe(1);
      expect(manager.getCurrentCursor(TEST_TABLE_ID)).toBe(1);
    });
  });

  describe('Client Cursor Management', () => {
    it('should initialize client cursor', () => {
      manager.createTimeline(TEST_TABLE_ID, TEST_SESSION_ID);
      const sessionId = generateClientSessionId();

      const cursor = manager.initializeClientCursor(sessionId, TEST_TABLE_ID);

      expect(cursor).toBe(0);
      expect(manager.getClientCursor(sessionId)).toBe(0);
    });

    it('should update client cursor', () => {
      manager.createTimeline(TEST_TABLE_ID, TEST_SESSION_ID);
      const sessionId = generateClientSessionId();
      manager.initializeClientCursor(sessionId, TEST_TABLE_ID);

      manager.updateClientCursor(sessionId, createTimelineCursor(5));

      expect(manager.getClientCursor(sessionId)).toBe(5);
    });

    it('should remove client cursor', () => {
      manager.createTimeline(TEST_TABLE_ID, TEST_SESSION_ID);
      const sessionId = generateClientSessionId();
      manager.initializeClientCursor(sessionId, TEST_TABLE_ID);

      manager.removeClientCursor(sessionId);

      expect(manager.getClientCursor(sessionId)).toBeNull();
    });
  });

  describe('Gap Detection', () => {
    it('should detect gap between client and server', () => {
      manager.createTimeline(TEST_TABLE_ID, TEST_SESSION_ID);

      // Append several entries
      for (let i = 0; i < 5; i++) {
        manager.appendEntry(TEST_TABLE_ID, 'action', {
          fromVersion: createStateVersion(i),
          toVersion: createStateVersion(i + 1),
          fromCursor: createTimelineCursor(i),
          toCursor: createTimelineCursor(i + 1),
          timestamp: Date.now(),
          operations: [],
          eventId: null,
          checksum: 'test',
        });
      }

      const gap = manager.detectGap(TEST_TABLE_ID, createTimelineCursor(2));

      expect(gap.hasGap).toBe(true);
      expect(gap.gapSize).toBe(3);
      expect(gap.missedEntries).toHaveLength(3);
    });

    it('should check if incremental sync is possible', () => {
      manager.createTimeline(TEST_TABLE_ID, TEST_SESSION_ID);

      // Append entry
      manager.appendEntry(TEST_TABLE_ID, 'action', {
        fromVersion: createStateVersion(0),
        toVersion: createStateVersion(1),
        fromCursor: createTimelineCursor(0),
        toCursor: createTimelineCursor(1),
        timestamp: Date.now(),
        operations: [],
        eventId: null,
        checksum: 'test',
      });

      expect(manager.canIncrementalSync(TEST_TABLE_ID, createTimelineCursor(0))).toBe(true);
    });
  });

  describe('Entry Queries', () => {
    it('should get entries since cursor', () => {
      manager.createTimeline(TEST_TABLE_ID, TEST_SESSION_ID);

      for (let i = 0; i < 5; i++) {
        manager.appendEntry(TEST_TABLE_ID, 'action', {
          fromVersion: createStateVersion(i),
          toVersion: createStateVersion(i + 1),
          fromCursor: createTimelineCursor(i),
          toCursor: createTimelineCursor(i + 1),
          timestamp: Date.now(),
          operations: [],
          eventId: null,
          checksum: 'test',
        });
      }

      const entries = manager.getEntriesSinceCursor(TEST_TABLE_ID, createTimelineCursor(2));

      expect(entries).toHaveLength(3);
    });

    it('should get entries in range', () => {
      manager.createTimeline(TEST_TABLE_ID, TEST_SESSION_ID);

      for (let i = 0; i < 10; i++) {
        manager.appendEntry(TEST_TABLE_ID, 'action', {
          fromVersion: createStateVersion(i),
          toVersion: createStateVersion(i + 1),
          fromCursor: createTimelineCursor(i),
          toCursor: createTimelineCursor(i + 1),
          timestamp: Date.now(),
          operations: [],
          eventId: null,
          checksum: 'test',
        });
      }

      const entries = manager.getEntriesInRange(
        TEST_TABLE_ID,
        createTimelineCursor(2),
        createTimelineCursor(5)
      );

      expect(entries).toHaveLength(3);
    });
  });

  describe('Replay Support', () => {
    it('should validate entry sequence', () => {
      manager.createTimeline(TEST_TABLE_ID, TEST_SESSION_ID);

      for (let i = 0; i < 5; i++) {
        manager.appendEntry(TEST_TABLE_ID, 'action', {
          fromVersion: createStateVersion(i),
          toVersion: createStateVersion(i + 1),
          fromCursor: createTimelineCursor(i),
          toCursor: createTimelineCursor(i + 1),
          timestamp: Date.now(),
          operations: [],
          eventId: null,
          checksum: 'test',
        });
      }

      const entries = manager.getEntriesSinceCursor(TEST_TABLE_ID, createTimelineCursor(0));
      const result = manager.validateEntrySequence(entries);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should export timeline with checksum', () => {
      manager.createTimeline(TEST_TABLE_ID, TEST_SESSION_ID);

      manager.appendEntry(TEST_TABLE_ID, 'action', {
        fromVersion: createStateVersion(0),
        toVersion: createStateVersion(1),
        fromCursor: createTimelineCursor(0),
        toCursor: createTimelineCursor(1),
        timestamp: Date.now(),
        operations: [],
        eventId: null,
        checksum: 'test',
      });

      const exported = manager.exportTimeline(TEST_TABLE_ID);

      expect(exported).not.toBeNull();
      expect(exported!.checksum).toBeDefined();
    });
  });
});

// ============================================================================
// AuthoritativeStateSync Tests
// ============================================================================

describe('AuthoritativeStateSync', () => {
  let sync: AuthoritativeStateSync;

  beforeEach(() => {
    resetSyncCounters();
    sync = createAuthoritativeStateSync();
  });

  afterEach(() => {
    sync.clear();
  });

  describe('Table Initialization', () => {
    it('should initialize table', () => {
      const snapshot = sync.initializeTable(
        TEST_TABLE_ID,
        TEST_CLUB_ID,
        'Test Table',
        { small: 5, big: 10 },
        9,
        TEST_SESSION_ID
      );

      expect(snapshot.table.tableId).toBe(TEST_TABLE_ID);
      expect(snapshot.version).toBe(1);
    });
  });

  describe('Client Connection', () => {
    it('should connect client', () => {
      sync.initializeTable(
        TEST_TABLE_ID,
        TEST_CLUB_ID,
        'Test Table',
        { small: 5, big: 10 },
        9,
        TEST_SESSION_ID
      );

      const playerId = createTestPlayer(1);
      const result = sync.connectClient(
        playerId,
        TEST_TABLE_ID,
        TEST_CLUB_ID,
        createTestDevice()
      );

      expect(result.session.playerId).toBe(playerId);
      expect(result.session.status).toBe('CONNECTED');
      expect(result.initialSync.syncType).toBe('FULL_SNAPSHOT');
      expect(result.initialSync.snapshot).not.toBeNull();
    });

    it('should disconnect client and get resume token', () => {
      sync.initializeTable(
        TEST_TABLE_ID,
        TEST_CLUB_ID,
        'Test Table',
        { small: 5, big: 10 },
        9,
        TEST_SESSION_ID
      );

      const playerId = createTestPlayer(1);
      const { session } = sync.connectClient(
        playerId,
        TEST_TABLE_ID,
        TEST_CLUB_ID,
        createTestDevice()
      );

      const result = sync.disconnectClient(session.sessionId, 'NETWORK_ERROR');

      expect(result).not.toBeNull();
      expect(result!.resumeToken.sessionId).toBe(session.sessionId);
    });

    it('should reconnect client', () => {
      sync.initializeTable(
        TEST_TABLE_ID,
        TEST_CLUB_ID,
        'Test Table',
        { small: 5, big: 10 },
        9,
        TEST_SESSION_ID
      );

      const playerId = createTestPlayer(1);
      const device = createTestDevice();
      const { session } = sync.connectClient(playerId, TEST_TABLE_ID, TEST_CLUB_ID, device);

      const disconnectResult = sync.disconnectClient(session.sessionId, 'NETWORK_ERROR');
      expect(disconnectResult).not.toBeNull();

      const reconnectResult = sync.reconnectClient({
        resumeToken: disconnectResult!.resumeToken,
        deviceInfo: device,
        lastKnownVersion: createStateVersion(1),
        lastKnownCursor: createTimelineCursor(1),
      });

      expect(reconnectResult.success).toBe(true);
    });
  });

  describe('State Updates', () => {
    it('should apply state change', () => {
      sync.initializeTable(
        TEST_TABLE_ID,
        TEST_CLUB_ID,
        'Test Table',
        { small: 5, big: 10 },
        9,
        TEST_SESSION_ID
      );

      const playerId = createTestPlayer(1);
      sync.connectClient(playerId, TEST_TABLE_ID, TEST_CLUB_ID, createTestDevice());

      const operations: DiffOperation[] = [
        { path: ['table', 'isPaused'], operation: 'SET', value: true },
      ];

      const result = sync.applyStateChange(
        TEST_TABLE_ID,
        operations,
        'table_paused',
        undefined,
        playerId
      );

      expect(result.snapshot.version).toBe(2);
      expect(result.diff.operations).toHaveLength(1);
      expect(result.affectedClients).toHaveLength(1);
    });
  });

  describe('Sync Protocol', () => {
    it('should handle sync request with no change', () => {
      sync.initializeTable(
        TEST_TABLE_ID,
        TEST_CLUB_ID,
        'Test Table',
        { small: 5, big: 10 },
        9,
        TEST_SESSION_ID
      );

      const playerId = createTestPlayer(1);
      const { session } = sync.connectClient(
        playerId,
        TEST_TABLE_ID,
        TEST_CLUB_ID,
        createTestDevice()
      );

      const response = sync.handleSyncRequest({
        sessionId: session.sessionId,
        currentVersion: createStateVersion(1),
        currentCursor: createTimelineCursor(1),
        lastSyncToken: null,
      });

      expect(response.syncType).toBe('NO_CHANGE');
    });

    it('should handle sync request with incremental update', () => {
      sync.initializeTable(
        TEST_TABLE_ID,
        TEST_CLUB_ID,
        'Test Table',
        { small: 5, big: 10 },
        9,
        TEST_SESSION_ID
      );

      const playerId = createTestPlayer(1);
      const { session } = sync.connectClient(
        playerId,
        TEST_TABLE_ID,
        TEST_CLUB_ID,
        createTestDevice()
      );

      // Apply some changes
      sync.applyStateChange(
        TEST_TABLE_ID,
        [{ path: ['table', 'isPaused'], operation: 'SET', value: true }],
        'action'
      );

      // Client has version 1 and cursor 0 (before the change was applied)
      // They should receive incremental diffs to get to version 2, cursor 1
      const response = sync.handleSyncRequest({
        sessionId: session.sessionId,
        currentVersion: createStateVersion(1),
        currentCursor: createTimelineCursor(0),
        lastSyncToken: null,
      });

      expect(response.syncType).toBe('INCREMENTAL');
      expect(response.diffs).not.toBeNull();
      expect(response.diffs!.length).toBeGreaterThan(0);
    });

    it('should handle state acknowledgment', () => {
      sync.initializeTable(
        TEST_TABLE_ID,
        TEST_CLUB_ID,
        'Test Table',
        { small: 5, big: 10 },
        9,
        TEST_SESSION_ID
      );

      const playerId = createTestPlayer(1);
      const { session } = sync.connectClient(
        playerId,
        TEST_TABLE_ID,
        TEST_CLUB_ID,
        createTestDevice()
      );

      sync.handleStateAck({
        sessionId: session.sessionId,
        acknowledgedVersion: createStateVersion(1),
        acknowledgedCursor: createTimelineCursor(1),
        receivedAt: Date.now(),
      });

      const updatedSession = sync.getSessionManager().getSession(session.sessionId);
      expect(updatedSession).not.toBeNull();
    });
  });

  describe('Consistency Checks', () => {
    it('should check client consistency', () => {
      sync.initializeTable(
        TEST_TABLE_ID,
        TEST_CLUB_ID,
        'Test Table',
        { small: 5, big: 10 },
        9,
        TEST_SESSION_ID
      );

      const playerId = createTestPlayer(1);
      const { session } = sync.connectClient(
        playerId,
        TEST_TABLE_ID,
        TEST_CLUB_ID,
        createTestDevice()
      );

      const result = sync.checkClientConsistency(session.sessionId);

      expect(result.isConsistent).toBe(true);
      expect(result.versionDrift).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect version drift', () => {
      sync.initializeTable(
        TEST_TABLE_ID,
        TEST_CLUB_ID,
        'Test Table',
        { small: 5, big: 10 },
        9,
        TEST_SESSION_ID
      );

      const playerId = createTestPlayer(1);
      const { session } = sync.connectClient(
        playerId,
        TEST_TABLE_ID,
        TEST_CLUB_ID,
        createTestDevice()
      );

      // Apply changes without client syncing
      for (let i = 0; i < 5; i++) {
        sync.applyStateChange(
          TEST_TABLE_ID,
          [{ path: ['table', 'ante'], operation: 'SET', value: i }],
          'action'
        );
      }

      const result = sync.checkClientConsistency(session.sessionId);

      expect(result.isConsistent).toBe(false);
      expect(result.versionDrift).toBe(5);
    });

    it('should force resync', () => {
      sync.initializeTable(
        TEST_TABLE_ID,
        TEST_CLUB_ID,
        'Test Table',
        { small: 5, big: 10 },
        9,
        TEST_SESSION_ID
      );

      const playerId = createTestPlayer(1);
      const { session } = sync.connectClient(
        playerId,
        TEST_TABLE_ID,
        TEST_CLUB_ID,
        createTestDevice()
      );

      const response = sync.forceResync(session.sessionId);

      expect(response).not.toBeNull();
      expect(response!.syncType).toBe('FULL_SNAPSHOT');
    });
  });

  describe('Heartbeat and Maintenance', () => {
    it('should process heartbeat', () => {
      sync.initializeTable(
        TEST_TABLE_ID,
        TEST_CLUB_ID,
        'Test Table',
        { small: 5, big: 10 },
        9,
        TEST_SESSION_ID
      );

      const playerId = createTestPlayer(1);
      const { session } = sync.connectClient(
        playerId,
        TEST_TABLE_ID,
        TEST_CLUB_ID,
        createTestDevice()
      );

      const result = sync.processHeartbeat(session.sessionId);

      expect(result).toBe(true);
    });

    it('should run maintenance', () => {
      sync.initializeTable(
        TEST_TABLE_ID,
        TEST_CLUB_ID,
        'Test Table',
        { small: 5, big: 10 },
        9,
        TEST_SESSION_ID
      );

      const result = sync.runMaintenance();

      expect(result.staleClients).toBeDefined();
      expect(result.expiredSessions).toBeDefined();
    });
  });

  describe('Statistics', () => {
    it('should get service statistics', () => {
      sync.initializeTable(
        TEST_TABLE_ID,
        TEST_CLUB_ID,
        'Test Table',
        { small: 5, big: 10 },
        9,
        TEST_SESSION_ID
      );

      const playerId = createTestPlayer(1);
      sync.connectClient(playerId, TEST_TABLE_ID, TEST_CLUB_ID, createTestDevice());

      const stats = sync.getStatistics();

      expect(stats.sessions.totalSessions).toBe(1);
      expect(stats.currentVersion).toBe(1);
    });
  });
});

// ============================================================================
// Disconnect Recovery Scenario Tests
// ============================================================================

describe('Disconnect Recovery Scenarios', () => {
  let sync: AuthoritativeStateSync;

  beforeEach(() => {
    resetSyncCounters();
    sync = createAuthoritativeStateSync();
  });

  afterEach(() => {
    sync.clear();
  });

  it('should recover from brief network disconnect', () => {
    // Setup
    sync.initializeTable(TEST_TABLE_ID, TEST_CLUB_ID, 'Test', { small: 5, big: 10 }, 9, TEST_SESSION_ID);
    const player = createTestPlayer(1);
    const device = createTestDevice();
    const { session } = sync.connectClient(player, TEST_TABLE_ID, TEST_CLUB_ID, device);

    // Disconnect
    const disconnect = sync.disconnectClient(session.sessionId, 'NETWORK_ERROR');
    expect(disconnect).not.toBeNull();

    // Some state changes happen while disconnected
    sync.applyStateChange(TEST_TABLE_ID, [{ path: ['table', 'isPaused'], operation: 'SET', value: true }], 'action');
    sync.applyStateChange(TEST_TABLE_ID, [{ path: ['table', 'isPaused'], operation: 'SET', value: false }], 'action');

    // Reconnect
    const reconnect = sync.reconnectClient({
      resumeToken: disconnect!.resumeToken,
      deviceInfo: device,
      lastKnownVersion: createStateVersion(1),
      lastKnownCursor: createTimelineCursor(1),
    });

    expect(reconnect.success).toBe(true);
    expect(reconnect.missedEvents).toBe(2);
  });

  it('should handle concurrent multi-device access', () => {
    sync.initializeTable(TEST_TABLE_ID, TEST_CLUB_ID, 'Test', { small: 5, big: 10 }, 9, TEST_SESSION_ID);
    const player = createTestPlayer(1);

    // Connect from iOS
    const { session: iosSession } = sync.connectClient(
      player,
      TEST_TABLE_ID,
      TEST_CLUB_ID,
      createTestDevice('ios')
    );

    // Connect from Android
    const { session: androidSession } = sync.connectClient(
      player,
      TEST_TABLE_ID,
      TEST_CLUB_ID,
      createTestDevice('android')
    );

    // Both should be connected
    const sessions = sync.getSessionManager().getPlayerSessions(player);
    const connectedSessions = sessions.filter(s => s.status === 'CONNECTED');

    expect(connectedSessions).toHaveLength(2);
  });

  it('should broadcast state change to all clients', () => {
    sync.initializeTable(TEST_TABLE_ID, TEST_CLUB_ID, 'Test', { small: 5, big: 10 }, 9, TEST_SESSION_ID);

    const player1 = createTestPlayer(1);
    const player2 = createTestPlayer(2);

    sync.connectClient(player1, TEST_TABLE_ID, TEST_CLUB_ID, createTestDevice());
    sync.connectClient(player2, TEST_TABLE_ID, TEST_CLUB_ID, createTestDevice());

    const { affectedClients } = sync.applyStateChange(
      TEST_TABLE_ID,
      [{ path: ['table', 'isPaused'], operation: 'SET', value: true }],
      'action'
    );

    expect(affectedClients).toHaveLength(2);
  });

  it('should handle long disconnect requiring full resync', () => {
    const config = {
      ...require('../AuthoritativeStateSync').DEFAULT_SYNC_CONFIG,
      forceSnapshotThreshold: 5,
    };
    const customSync = createAuthoritativeStateSync(config);

    customSync.initializeTable(TEST_TABLE_ID, TEST_CLUB_ID, 'Test', { small: 5, big: 10 }, 9, TEST_SESSION_ID);
    const player = createTestPlayer(1);
    const device = createTestDevice();
    const { session } = customSync.connectClient(player, TEST_TABLE_ID, TEST_CLUB_ID, device);

    // Many state changes
    for (let i = 0; i < 10; i++) {
      customSync.applyStateChange(
        TEST_TABLE_ID,
        [{ path: ['table', 'ante'], operation: 'SET', value: i }],
        'action'
      );
    }

    // Request sync from old version
    const response = customSync.handleSyncRequest({
      sessionId: session.sessionId,
      currentVersion: createStateVersion(1),
      currentCursor: createTimelineCursor(1),
      lastSyncToken: null,
    });

    expect(response.syncType).toBe('FULL_SNAPSHOT');
    expect(response.snapshot).not.toBeNull();

    customSync.clear();
  });
});

// ============================================================================
// Consistency Edge Cases
// ============================================================================

describe('Consistency Edge Cases', () => {
  let sync: AuthoritativeStateSync;

  beforeEach(() => {
    resetSyncCounters();
    sync = createAuthoritativeStateSync();
  });

  afterEach(() => {
    sync.clear();
  });

  it('should handle rapid state changes', () => {
    sync.initializeTable(TEST_TABLE_ID, TEST_CLUB_ID, 'Test', { small: 5, big: 10 }, 9, TEST_SESSION_ID);
    const player = createTestPlayer(1);
    const { session } = sync.connectClient(player, TEST_TABLE_ID, TEST_CLUB_ID, createTestDevice());

    // Rapid changes
    for (let i = 0; i < 50; i++) {
      sync.applyStateChange(
        TEST_TABLE_ID,
        [{ path: ['table', 'ante'], operation: 'SET', value: i }],
        'rapid_action'
      );
    }

    const consistency = sync.checkClientConsistency(session.sessionId);

    // Client should be behind but system should be stable
    expect(consistency.versionDrift).toBe(50);
    expect(sync.getSnapshotManager().getCurrentVersion()).toBe(51);
  });

  it('should maintain timeline integrity after many operations', () => {
    sync.initializeTable(TEST_TABLE_ID, TEST_CLUB_ID, 'Test', { small: 5, big: 10 }, 9, TEST_SESSION_ID);

    for (let i = 0; i < 100; i++) {
      sync.applyStateChange(
        TEST_TABLE_ID,
        [{ path: ['table', 'ante'], operation: 'SET', value: i }],
        'action'
      );
    }

    const timeline = sync.getTimelineManager().getTimeline(TEST_TABLE_ID);
    const validation = sync.getTimelineManager().validateEntrySequence(timeline!.entries);

    expect(validation.isValid).toBe(true);
  });

  it('should handle session not found gracefully', () => {
    sync.initializeTable(TEST_TABLE_ID, TEST_CLUB_ID, 'Test', { small: 5, big: 10 }, 9, TEST_SESSION_ID);

    const fakeSessionId = 'fake_session' as ClientSessionId;
    const consistency = sync.checkClientConsistency(fakeSessionId);

    expect(consistency.isConsistent).toBe(false);
    expect(consistency.errors).toContain('Session not found');
  });
});
