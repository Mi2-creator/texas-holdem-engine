/**
 * AuthoritativeStateSync.ts
 * Phase 24 - Authoritative state synchronization service
 *
 * Provides:
 * - Server-authoritative state management
 * - Sync protocol handling (request/response)
 * - Consistency verification
 * - Reconnection state recovery
 */

import { PlayerId } from '../security/Identity';
import { TableId, HandId } from '../security/AuditLog';
import { ClubId } from '../club/ClubTypes';
import { SessionId, IntegrityEventId } from '../integrity/IntegrityTypes';
import {
  ClientSessionId,
  StateVersion,
  TimelineCursor,
  SyncToken,
  SyncRequest,
  SyncResponse,
  StateAck,
  StateSnapshot,
  StateDiff,
  DiffOperation,
  ConsistencyCheckResult,
  ReconnectRequest,
  ReconnectResponse,
  ClientDeviceInfo,
  generateSyncToken,
  createStateVersion,
  createTimelineCursor,
} from './SyncTypes';
import { ClientSessionManager, SessionManagerConfig, DEFAULT_SESSION_CONFIG } from './ClientSessionManager';
import { StateSnapshotManager, SnapshotManagerConfig, DEFAULT_SNAPSHOT_CONFIG } from './StateSnapshotManager';
import { TimelineManager, TimelineConfig, DEFAULT_TIMELINE_CONFIG } from './TimelineManager';

// ============================================================================
// Configuration
// ============================================================================

export interface SyncServiceConfig {
  readonly sessionConfig: SessionManagerConfig;
  readonly snapshotConfig: SnapshotManagerConfig;
  readonly timelineConfig: TimelineConfig;
  readonly maxDiffsInResponse: number;      // Max diffs to send in one response
  readonly forceSnapshotThreshold: number;  // Gap size to force full snapshot
}

export const DEFAULT_SYNC_CONFIG: SyncServiceConfig = {
  sessionConfig: DEFAULT_SESSION_CONFIG,
  snapshotConfig: DEFAULT_SNAPSHOT_CONFIG,
  timelineConfig: DEFAULT_TIMELINE_CONFIG,
  maxDiffsInResponse: 100,
  forceSnapshotThreshold: 200,
};

// ============================================================================
// AuthoritativeStateSync Implementation
// ============================================================================

export class AuthoritativeStateSync {
  private readonly sessionManager: ClientSessionManager;
  private readonly snapshotManager: StateSnapshotManager;
  private readonly timelineManager: TimelineManager;
  private readonly config: SyncServiceConfig;
  private readonly tableSyncTokens: Map<TableId, SyncToken>;

  constructor(config: SyncServiceConfig = DEFAULT_SYNC_CONFIG) {
    this.config = config;
    this.sessionManager = new ClientSessionManager(config.sessionConfig);
    this.snapshotManager = new StateSnapshotManager(config.snapshotConfig);
    this.timelineManager = new TimelineManager(config.timelineConfig);
    this.tableSyncTokens = new Map();
  }

  // ==========================================================================
  // Table Initialization
  // ==========================================================================

  /**
   * Initialize state sync for a table
   */
  initializeTable(
    tableId: TableId,
    clubId: ClubId,
    tableName: string,
    blinds: { small: number; big: number },
    maxSeats: number,
    sessionId: SessionId
  ): StateSnapshot {
    // Create initial snapshot
    const snapshot = this.snapshotManager.createInitialSnapshot(
      tableId,
      clubId,
      tableName,
      blinds,
      maxSeats
    );

    // Create timeline
    this.timelineManager.createTimeline(tableId, sessionId);

    // Create sync token
    const syncToken = generateSyncToken();
    this.tableSyncTokens.set(tableId, syncToken);

    return snapshot;
  }

  // ==========================================================================
  // Client Connection
  // ==========================================================================

  /**
   * Handle new client connection
   */
  connectClient(
    playerId: PlayerId,
    tableId: TableId,
    clubId: ClubId,
    deviceInfo: ClientDeviceInfo
  ): {
    session: import('./SyncTypes').ClientSession;
    initialSync: SyncResponse;
    terminatedSessions: ClientSessionId[];
  } {
    // Create session
    const { session, existingTerminated } = this.sessionManager.createSession(
      playerId,
      tableId,
      clubId,
      deviceInfo
    );

    // Initialize client cursor
    this.timelineManager.initializeClientCursor(session.sessionId, tableId);

    // Generate initial sync response with full snapshot
    const snapshot = this.snapshotManager.getCurrentSnapshot();
    const syncToken = generateSyncToken();

    const initialSync: SyncResponse = {
      syncToken,
      serverVersion: this.snapshotManager.getCurrentVersion(),
      serverCursor: this.snapshotManager.getCurrentCursor(),
      timestamp: Date.now(),
      syncType: 'FULL_SNAPSHOT',
      snapshot,
      diffs: null,
      hasGap: false,
      gapRange: null,
    };

    // Update session with sync state
    this.sessionManager.updateSessionSync(
      session.sessionId,
      initialSync.serverVersion,
      initialSync.serverCursor,
      syncToken
    );

    return {
      session,
      initialSync,
      terminatedSessions: existingTerminated,
    };
  }

  /**
   * Handle client disconnection
   */
  disconnectClient(
    sessionId: ClientSessionId,
    reason: import('./SyncTypes').DisconnectReason
  ): { resumeToken: import('./SyncTypes').SessionResumeToken } | null {
    const result = this.sessionManager.disconnectSession(sessionId, reason);
    if (!result) return null;

    // Keep client cursor for potential reconnect
    // (Will be cleaned up if session expires)

    return { resumeToken: result.resumeToken };
  }

  /**
   * Handle client reconnection
   */
  reconnectClient(request: ReconnectRequest): ReconnectResponse {
    const result = this.sessionManager.reconnectSession(request);

    if (!result.success) {
      return result;
    }

    // Get the session
    const session = this.sessionManager.getSession(result.newSessionId!);
    if (!session) {
      return {
        ...result,
        success: false,
        error: 'Session not found after reconnect',
      };
    }

    // Generate sync response
    const syncResponse = this.handleSyncRequest({
      sessionId: session.sessionId,
      currentVersion: request.lastKnownVersion,
      currentCursor: request.lastKnownCursor,
      lastSyncToken: null,
    });

    // Calculate actual missed events based on server version
    const serverVersion = this.snapshotManager.getCurrentVersion();
    const missedEvents = Number(serverVersion) - Number(request.lastKnownVersion);

    return {
      ...result,
      syncResponse,
      missedEvents,
    };
  }

  // ==========================================================================
  // State Updates
  // ==========================================================================

  /**
   * Apply state change (server-authoritative)
   */
  applyStateChange(
    tableId: TableId,
    operations: readonly DiffOperation[],
    eventType: string,
    eventId?: IntegrityEventId,
    playerId?: PlayerId,
    handId?: HandId
  ): {
    snapshot: StateSnapshot;
    diff: StateDiff;
    affectedClients: ClientSessionId[];
  } {
    // Apply change to snapshot manager
    const { snapshot, diff } = this.snapshotManager.applyChange(operations, eventId);

    // Append to timeline
    this.timelineManager.appendEntry(
      tableId,
      eventType,
      diff,
      eventId,
      playerId,
      handId
    );

    // Update sync token
    const syncToken = generateSyncToken();
    this.tableSyncTokens.set(tableId, syncToken);

    // Get affected clients (all connected clients on this table)
    const sessions = this.sessionManager.getConnectedTableSessions(tableId);
    const affectedClients = sessions.map(s => s.sessionId);

    // Add pending acks for all clients
    for (const sessionId of affectedClients) {
      this.sessionManager.addPendingAck(sessionId, diff.toVersion);
    }

    return {
      snapshot,
      diff,
      affectedClients,
    };
  }

  // ==========================================================================
  // Sync Protocol
  // ==========================================================================

  /**
   * Handle sync request from client
   */
  handleSyncRequest(request: SyncRequest): SyncResponse {
    const session = this.sessionManager.getSession(request.sessionId);
    if (!session) {
      throw new Error('Invalid session');
    }

    const serverVersion = this.snapshotManager.getCurrentVersion();
    const serverCursor = this.snapshotManager.getCurrentCursor();
    const syncToken = generateSyncToken();

    // Check if client is up to date
    if (request.currentVersion === serverVersion) {
      return {
        syncToken,
        serverVersion,
        serverCursor,
        timestamp: Date.now(),
        syncType: 'NO_CHANGE',
        snapshot: null,
        diffs: null,
        hasGap: false,
        gapRange: null,
      };
    }

    // Detect gap
    const gap = this.timelineManager.detectGap(session.tableId, request.currentCursor);

    // Determine sync type
    const versionGap = Number(serverVersion) - Number(request.currentVersion);
    const forceFullSnapshot =
      Number(request.currentVersion) === 0 ||  // Version 0 means no state, need full snapshot
      versionGap > this.config.forceSnapshotThreshold ||
      gap.isCritical ||
      !this.timelineManager.canIncrementalSync(session.tableId, request.currentCursor);

    if (forceFullSnapshot) {
      // Send full snapshot
      const snapshot = this.snapshotManager.getCurrentSnapshot();
      return {
        syncToken,
        serverVersion,
        serverCursor,
        timestamp: Date.now(),
        syncType: 'FULL_SNAPSHOT',
        snapshot,
        diffs: null,
        hasGap: gap.hasGap,
        gapRange: gap.hasGap ? {
          from: request.currentVersion,
          to: serverVersion,
        } : null,
      };
    }

    // Send incremental diffs
    const entries = this.timelineManager.getEntriesSinceCursor(
      session.tableId,
      request.currentCursor
    );

    const diffs = entries
      .slice(0, this.config.maxDiffsInResponse)
      .map(e => e.diff);

    return {
      syncToken,
      serverVersion,
      serverCursor,
      timestamp: Date.now(),
      syncType: 'INCREMENTAL',
      snapshot: null,
      diffs,
      hasGap: diffs.length < entries.length,
      gapRange: diffs.length < entries.length ? {
        from: diffs[diffs.length - 1]?.toVersion ?? request.currentVersion,
        to: serverVersion,
      } : null,
    };
  }

  /**
   * Handle state acknowledgment from client
   */
  handleStateAck(ack: StateAck): void {
    this.sessionManager.acknowledgeVersion(ack.sessionId, ack.acknowledgedVersion);
    this.timelineManager.updateClientCursor(ack.sessionId, ack.acknowledgedCursor);
  }

  // ==========================================================================
  // Consistency Checks
  // ==========================================================================

  /**
   * Check consistency for a client
   */
  checkClientConsistency(sessionId: ClientSessionId): ConsistencyCheckResult {
    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      return {
        isConsistent: false,
        clientVersion: createStateVersion(0),
        serverVersion: this.snapshotManager.getCurrentVersion(),
        clientCursor: createTimelineCursor(0),
        serverCursor: this.snapshotManager.getCurrentCursor(),
        versionDrift: 0,
        cursorDrift: 0,
        lastSyncAge: 0,
        errors: ['Session not found'],
      };
    }

    const serverVersion = this.snapshotManager.getCurrentVersion();
    const serverCursor = this.snapshotManager.getCurrentCursor();

    const versionDrift = Number(serverVersion) - Number(session.currentVersion);
    const cursorDrift = Number(serverCursor) - Number(session.timelineCursor);
    const lastSyncAge = Date.now() - session.lastActiveAt;

    const errors: string[] = [];

    // Check for excessive drift
    if (versionDrift > this.config.forceSnapshotThreshold) {
      errors.push(`Version drift (${versionDrift}) exceeds threshold`);
    }

    if (cursorDrift > this.config.timelineConfig.gapThreshold) {
      errors.push(`Cursor drift (${cursorDrift}) exceeds threshold`);
    }

    // Check for pending acks
    if (session.pendingAcks.length > 10) {
      errors.push(`Too many pending acknowledgments (${session.pendingAcks.length})`);
    }

    // Check sync age
    if (lastSyncAge > this.config.sessionConfig.heartbeatTimeoutMs) {
      errors.push(`Last sync too old (${lastSyncAge}ms)`);
    }

    return {
      isConsistent: errors.length === 0 && versionDrift === 0,
      clientVersion: session.currentVersion,
      serverVersion,
      clientCursor: session.timelineCursor,
      serverCursor,
      versionDrift,
      cursorDrift,
      lastSyncAge,
      errors,
    };
  }

  /**
   * Check consistency for all clients on a table
   */
  checkTableConsistency(tableId: TableId): Map<ClientSessionId, ConsistencyCheckResult> {
    const results = new Map<ClientSessionId, ConsistencyCheckResult>();
    const sessions = this.sessionManager.getTableSessions(tableId);

    for (const session of sessions) {
      results.set(session.sessionId, this.checkClientConsistency(session.sessionId));
    }

    return results;
  }

  /**
   * Force resync for a client
   */
  forceResync(sessionId: ClientSessionId): SyncResponse | null {
    const session = this.sessionManager.getSession(sessionId);
    if (!session) return null;

    // Reset client state to require full snapshot
    return this.handleSyncRequest({
      sessionId,
      currentVersion: createStateVersion(0),
      currentCursor: createTimelineCursor(0),
      lastSyncToken: null,
    });
  }

  // ==========================================================================
  // Heartbeat and Maintenance
  // ==========================================================================

  /**
   * Process heartbeat from client
   */
  processHeartbeat(sessionId: ClientSessionId): boolean {
    const session = this.sessionManager.recordHeartbeat(sessionId);
    return session !== null;
  }

  /**
   * Run maintenance tasks
   */
  runMaintenance(): {
    staleClients: ClientSessionId[];
    expiredSessions: ClientSessionId[];
  } {
    const staleClients = this.sessionManager.checkHeartbeatTimeouts();
    const expiredSessions = this.sessionManager.cleanupExpiredSessions();

    // Clean up cursors for expired sessions
    for (const sessionId of expiredSessions) {
      this.timelineManager.removeClientCursor(sessionId);
    }

    return {
      staleClients,
      expiredSessions,
    };
  }

  // ==========================================================================
  // Accessors
  // ==========================================================================

  /**
   * Get session manager
   */
  getSessionManager(): ClientSessionManager {
    return this.sessionManager;
  }

  /**
   * Get snapshot manager
   */
  getSnapshotManager(): StateSnapshotManager {
    return this.snapshotManager;
  }

  /**
   * Get timeline manager
   */
  getTimelineManager(): TimelineManager {
    return this.timelineManager;
  }

  /**
   * Get current state snapshot
   */
  getCurrentSnapshot(): StateSnapshot | null {
    return this.snapshotManager.getCurrentSnapshot();
  }

  /**
   * Get service statistics
   */
  getStatistics(): {
    sessions: ReturnType<ClientSessionManager['getStatistics']>;
    currentVersion: StateVersion;
    currentCursor: TimelineCursor;
  } {
    return {
      sessions: this.sessionManager.getStatistics(),
      currentVersion: this.snapshotManager.getCurrentVersion(),
      currentCursor: this.snapshotManager.getCurrentCursor(),
    };
  }

  /**
   * Clear all state (for testing)
   */
  clear(): void {
    this.sessionManager.clear();
    this.snapshotManager.clear();
    this.timelineManager.clear();
    this.tableSyncTokens.clear();
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createAuthoritativeStateSync(
  config?: SyncServiceConfig
): AuthoritativeStateSync {
  return new AuthoritativeStateSync(config);
}
