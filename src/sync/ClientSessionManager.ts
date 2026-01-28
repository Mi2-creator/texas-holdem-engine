/**
 * ClientSessionManager.ts
 * Phase 24 - Client session management with reconnect/resume support
 *
 * Manages client sessions including:
 * - Session lifecycle (connect, disconnect, reconnect)
 * - Resume token generation and validation
 * - Multi-device handling
 * - Session timeout and cleanup
 */

import { PlayerId } from '../security/Identity';
import { TableId } from '../security/AuditLog';
import { ClubId } from '../club/ClubTypes';
import {
  ClientSessionId,
  DeviceId,
  StateVersion,
  TimelineCursor,
  SyncToken,
  ClientSession,
  ClientSessionStatus,
  DisconnectReason,
  ClientDeviceInfo,
  SessionResumeToken,
  ReconnectRequest,
  ReconnectResponse,
  generateClientSessionId,
  createStateVersion,
  createTimelineCursor,
  calculateStateChecksum,
} from './SyncTypes';

// ============================================================================
// Configuration
// ============================================================================

export interface SessionManagerConfig {
  readonly sessionTimeoutMs: number;        // Time before session expires
  readonly reconnectWindowMs: number;       // Window for reconnection
  readonly maxReconnectAttempts: number;    // Max reconnect tries
  readonly resumeTokenTtlMs: number;        // Resume token validity
  readonly maxSessionsPerPlayer: number;    // Max concurrent sessions per player
  readonly heartbeatIntervalMs: number;     // Expected heartbeat interval
  readonly heartbeatTimeoutMs: number;      // Time before marking disconnected
}

export const DEFAULT_SESSION_CONFIG: SessionManagerConfig = {
  sessionTimeoutMs: 30 * 60 * 1000,      // 30 minutes
  reconnectWindowMs: 5 * 60 * 1000,       // 5 minutes
  maxReconnectAttempts: 10,
  resumeTokenTtlMs: 10 * 60 * 1000,       // 10 minutes
  maxSessionsPerPlayer: 2,                 // Allow 2 devices
  heartbeatIntervalMs: 10 * 1000,          // 10 seconds
  heartbeatTimeoutMs: 30 * 1000,           // 30 seconds
};

// ============================================================================
// ClientSessionManager Implementation
// ============================================================================

export class ClientSessionManager {
  private readonly sessions: Map<ClientSessionId, ClientSession>;
  private readonly playerSessions: Map<PlayerId, Set<ClientSessionId>>;
  private readonly tableSessions: Map<TableId, Set<ClientSessionId>>;
  private readonly resumeTokens: Map<ClientSessionId, SessionResumeToken>;
  private readonly config: SessionManagerConfig;

  constructor(config: SessionManagerConfig = DEFAULT_SESSION_CONFIG) {
    this.sessions = new Map();
    this.playerSessions = new Map();
    this.tableSessions = new Map();
    this.resumeTokens = new Map();
    this.config = config;
  }

  // ==========================================================================
  // Session Lifecycle
  // ==========================================================================

  /**
   * Create a new client session
   */
  createSession(
    playerId: PlayerId,
    tableId: TableId,
    clubId: ClubId,
    deviceInfo: ClientDeviceInfo
  ): { session: ClientSession; existingTerminated: ClientSessionId[] } {
    const sessionId = generateClientSessionId();
    const now = Date.now();

    // Check for existing sessions from this player
    const existingSessionIds = this.playerSessions.get(playerId) ?? new Set();
    const existingTerminated: ClientSessionId[] = [];

    // Terminate excess sessions if over limit
    if (existingSessionIds.size >= this.config.maxSessionsPerPlayer) {
      const sortedSessions = Array.from(existingSessionIds)
        .map(id => this.sessions.get(id))
        .filter((s): s is ClientSession => s !== undefined)
        .sort((a, b) => a.lastActiveAt - b.lastActiveAt);

      // Terminate oldest sessions
      const toTerminate = sortedSessions.slice(0, sortedSessions.length - this.config.maxSessionsPerPlayer + 1);
      for (const session of toTerminate) {
        this.terminateSession(session.sessionId, 'DUPLICATE_SESSION');
        existingTerminated.push(session.sessionId);
      }
    }

    // Create new session
    const session: ClientSession = {
      sessionId,
      playerId,
      deviceInfo,
      tableId,
      clubId,
      status: 'CONNECTED',
      connectedAt: now,
      lastActiveAt: now,
      disconnectedAt: null,
      disconnectReason: null,
      currentVersion: createStateVersion(0),
      timelineCursor: createTimelineCursor(0),
      lastSyncToken: null,
      pendingAcks: [],
      reconnectAttempts: 0,
      maxReconnectAttempts: this.config.maxReconnectAttempts,
      canResume: true,
    };

    this.sessions.set(sessionId, session);

    // Track player sessions
    if (!this.playerSessions.has(playerId)) {
      this.playerSessions.set(playerId, new Set());
    }
    this.playerSessions.get(playerId)!.add(sessionId);

    // Track table sessions
    if (!this.tableSessions.has(tableId)) {
      this.tableSessions.set(tableId, new Set());
    }
    this.tableSessions.get(tableId)!.add(sessionId);

    return { session, existingTerminated };
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: ClientSessionId): ClientSession | null {
    return this.sessions.get(sessionId) ?? null;
  }

  /**
   * Get all sessions for a player
   */
  getPlayerSessions(playerId: PlayerId): readonly ClientSession[] {
    const sessionIds = this.playerSessions.get(playerId);
    if (!sessionIds) return [];

    return Array.from(sessionIds)
      .map(id => this.sessions.get(id))
      .filter((s): s is ClientSession => s !== undefined);
  }

  /**
   * Get all sessions for a table
   */
  getTableSessions(tableId: TableId): readonly ClientSession[] {
    const sessionIds = this.tableSessions.get(tableId);
    if (!sessionIds) return [];

    return Array.from(sessionIds)
      .map(id => this.sessions.get(id))
      .filter((s): s is ClientSession => s !== undefined);
  }

  /**
   * Get connected sessions for a table
   */
  getConnectedTableSessions(tableId: TableId): readonly ClientSession[] {
    return this.getTableSessions(tableId).filter(
      s => s.status === 'CONNECTED' || s.status === 'RECONNECTING'
    );
  }

  // ==========================================================================
  // Session State Updates
  // ==========================================================================

  /**
   * Update session with new sync state
   */
  updateSessionSync(
    sessionId: ClientSessionId,
    version: StateVersion,
    cursor: TimelineCursor,
    syncToken: SyncToken
  ): ClientSession | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const updated: ClientSession = {
      ...session,
      currentVersion: version,
      timelineCursor: cursor,
      lastSyncToken: syncToken,
      lastActiveAt: Date.now(),
    };

    this.sessions.set(sessionId, updated);
    return updated;
  }

  /**
   * Record heartbeat from client
   */
  recordHeartbeat(sessionId: ClientSessionId): ClientSession | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const updated: ClientSession = {
      ...session,
      lastActiveAt: Date.now(),
    };

    this.sessions.set(sessionId, updated);
    return updated;
  }

  /**
   * Add pending acknowledgment
   */
  addPendingAck(sessionId: ClientSessionId, version: StateVersion): ClientSession | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const updated: ClientSession = {
      ...session,
      pendingAcks: [...session.pendingAcks, version],
    };

    this.sessions.set(sessionId, updated);
    return updated;
  }

  /**
   * Acknowledge received version
   */
  acknowledgeVersion(
    sessionId: ClientSessionId,
    version: StateVersion
  ): ClientSession | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const updated: ClientSession = {
      ...session,
      pendingAcks: session.pendingAcks.filter(v => v > version),
      currentVersion: version > session.currentVersion ? version : session.currentVersion,
      lastActiveAt: Date.now(),
    };

    this.sessions.set(sessionId, updated);
    return updated;
  }

  // ==========================================================================
  // Disconnect / Reconnect
  // ==========================================================================

  /**
   * Mark session as disconnected
   */
  disconnectSession(
    sessionId: ClientSessionId,
    reason: DisconnectReason
  ): { session: ClientSession; resumeToken: SessionResumeToken } | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const now = Date.now();

    // Generate resume token
    const resumeToken = this.generateResumeToken(session);
    this.resumeTokens.set(sessionId, resumeToken);

    const updated: ClientSession = {
      ...session,
      status: 'DISCONNECTED',
      disconnectedAt: now,
      disconnectReason: reason,
      canResume: this.canSessionResume(session, reason),
    };

    this.sessions.set(sessionId, updated);
    return { session: updated, resumeToken };
  }

  /**
   * Attempt to reconnect a session
   */
  reconnectSession(request: ReconnectRequest): ReconnectResponse {
    const { resumeToken, deviceInfo, lastKnownVersion, lastKnownCursor } = request;

    // Validate resume token
    const storedToken = this.resumeTokens.get(resumeToken.sessionId);
    if (!storedToken) {
      return {
        success: false,
        error: 'Invalid or expired resume token',
        requiresFullSync: true,
      };
    }

    // Check token expiry
    if (Date.now() > storedToken.expiresAt) {
      this.resumeTokens.delete(resumeToken.sessionId);
      return {
        success: false,
        error: 'Resume token has expired',
        requiresFullSync: true,
      };
    }

    // Verify signature
    if (storedToken.signature !== resumeToken.signature) {
      return {
        success: false,
        error: 'Invalid resume token signature',
        requiresFullSync: true,
      };
    }

    const session = this.sessions.get(resumeToken.sessionId);
    if (!session) {
      return {
        success: false,
        error: 'Session no longer exists',
        requiresFullSync: true,
      };
    }

    // Check if session can be resumed
    if (!session.canResume) {
      return {
        success: false,
        error: 'Session cannot be resumed',
        requiresFullSync: true,
      };
    }

    // Check reconnect attempts
    if (session.reconnectAttempts >= session.maxReconnectAttempts) {
      return {
        success: false,
        error: 'Maximum reconnect attempts exceeded',
        requiresFullSync: true,
      };
    }

    const now = Date.now();

    // Update session
    const updated: ClientSession = {
      ...session,
      status: 'CONNECTED',
      deviceInfo,
      lastActiveAt: now,
      disconnectedAt: null,
      disconnectReason: null,
      reconnectAttempts: session.reconnectAttempts + 1,
    };

    this.sessions.set(resumeToken.sessionId, updated);

    // Clean up resume token
    this.resumeTokens.delete(resumeToken.sessionId);

    // Calculate version drift
    const versionDrift = Number(session.currentVersion) - Number(lastKnownVersion);
    const requiresFullSync = versionDrift > 100; // Arbitrary threshold

    return {
      success: true,
      newSessionId: resumeToken.sessionId,
      missedEvents: versionDrift,
      requiresFullSync,
    };
  }

  /**
   * Terminate session permanently
   */
  terminateSession(
    sessionId: ClientSessionId,
    reason: DisconnectReason
  ): ClientSession | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const now = Date.now();

    const updated: ClientSession = {
      ...session,
      status: 'TERMINATED',
      disconnectedAt: session.disconnectedAt ?? now,
      disconnectReason: reason,
      canResume: false,
    };

    this.sessions.set(sessionId, updated);

    // Remove from tracking
    this.playerSessions.get(session.playerId)?.delete(sessionId);
    this.tableSessions.get(session.tableId)?.delete(sessionId);
    this.resumeTokens.delete(sessionId);

    return updated;
  }

  // ==========================================================================
  // Resume Token Management
  // ==========================================================================

  /**
   * Generate a resume token for a session
   */
  private generateResumeToken(session: ClientSession): SessionResumeToken {
    const now = Date.now();

    const tokenData = JSON.stringify({
      sessionId: session.sessionId,
      playerId: session.playerId,
      tableId: session.tableId,
      version: session.currentVersion,
      cursor: session.timelineCursor,
      issuedAt: now,
    });

    const signature = calculateStateChecksum(tokenData);

    return {
      sessionId: session.sessionId,
      playerId: session.playerId,
      tableId: session.tableId,
      lastVersion: session.currentVersion,
      lastCursor: session.timelineCursor,
      issuedAt: now,
      expiresAt: now + this.config.resumeTokenTtlMs,
      signature,
    };
  }

  /**
   * Check if session can be resumed
   */
  private canSessionResume(session: ClientSession, reason: DisconnectReason): boolean {
    // Some disconnect reasons don't allow resume
    const nonResumableReasons: DisconnectReason[] = [
      'KICKED',
      'TABLE_CLOSED',
      'DUPLICATE_SESSION',
    ];

    return !nonResumableReasons.includes(reason);
  }

  // ==========================================================================
  // Cleanup and Maintenance
  // ==========================================================================

  /**
   * Check for stale sessions based on heartbeat timeout
   */
  checkHeartbeatTimeouts(): ClientSessionId[] {
    const now = Date.now();
    const stale: ClientSessionId[] = [];

    for (const [sessionId, session] of this.sessions) {
      if (session.status === 'CONNECTED') {
        const timeSinceActive = now - session.lastActiveAt;
        if (timeSinceActive > this.config.heartbeatTimeoutMs) {
          this.disconnectSession(sessionId, 'TIMEOUT');
          stale.push(sessionId);
        }
      }
    }

    return stale;
  }

  /**
   * Clean up expired sessions
   */
  cleanupExpiredSessions(): ClientSessionId[] {
    const now = Date.now();
    const expired: ClientSessionId[] = [];

    for (const [sessionId, session] of this.sessions) {
      if (session.status === 'DISCONNECTED' || session.status === 'SUSPENDED') {
        const disconnectAge = now - (session.disconnectedAt ?? 0);
        if (disconnectAge > this.config.reconnectWindowMs) {
          this.terminateSession(sessionId, session.disconnectReason ?? 'TIMEOUT');
          expired.push(sessionId);
        }
      } else if (session.status === 'TERMINATED') {
        // Remove terminated sessions after session timeout
        const terminateAge = now - (session.disconnectedAt ?? session.connectedAt);
        if (terminateAge > this.config.sessionTimeoutMs) {
          this.sessions.delete(sessionId);
          expired.push(sessionId);
        }
      }
    }

    // Clean up expired resume tokens
    for (const [sessionId, token] of this.resumeTokens) {
      if (now > token.expiresAt) {
        this.resumeTokens.delete(sessionId);
      }
    }

    return expired;
  }

  /**
   * Get session statistics
   */
  getStatistics(): {
    totalSessions: number;
    connected: number;
    disconnected: number;
    terminated: number;
    byTable: Map<TableId, number>;
    byPlayer: Map<PlayerId, number>;
  } {
    let connected = 0;
    let disconnected = 0;
    let terminated = 0;
    const byTable = new Map<TableId, number>();
    const byPlayer = new Map<PlayerId, number>();

    for (const session of this.sessions.values()) {
      switch (session.status) {
        case 'CONNECTED':
        case 'RECONNECTING':
          connected++;
          break;
        case 'DISCONNECTED':
        case 'SUSPENDED':
          disconnected++;
          break;
        case 'TERMINATED':
          terminated++;
          break;
      }

      byTable.set(session.tableId, (byTable.get(session.tableId) ?? 0) + 1);
      byPlayer.set(session.playerId, (byPlayer.get(session.playerId) ?? 0) + 1);
    }

    return {
      totalSessions: this.sessions.size,
      connected,
      disconnected,
      terminated,
      byTable,
      byPlayer,
    };
  }

  /**
   * Clear all sessions (for testing)
   */
  clear(): void {
    this.sessions.clear();
    this.playerSessions.clear();
    this.tableSessions.clear();
    this.resumeTokens.clear();
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createClientSessionManager(
  config?: SessionManagerConfig
): ClientSessionManager {
  return new ClientSessionManager(config);
}
