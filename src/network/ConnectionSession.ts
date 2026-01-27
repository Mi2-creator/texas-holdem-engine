/**
 * ConnectionSession.ts
 * Phase 12 - Connection management with heartbeat and timeout
 *
 * Handles session lifecycle, reconnection, and player presence.
 */

import {
  PlayerId,
  SessionId,
  RoomId,
  TableId,
  MessageHeader,
  HeartbeatAckEvent,
  PlayerDisconnectedEvent,
  PlayerReconnectedEvent,
  createMessageHeader,
  createMessageId,
  TableContext,
} from './Protocol';
import { Errors, ConnectionError, RejectCode } from './NetworkErrors';

// ============================================================================
// Types
// ============================================================================

export type SessionStatus = 'connected' | 'disconnected' | 'reconnecting' | 'expired';

export interface Session {
  readonly sessionId: SessionId;
  readonly playerId: PlayerId;
  readonly playerName: string;
  readonly status: SessionStatus;
  readonly currentRoomId: RoomId | null;
  readonly currentTableId: TableId | null;
  readonly seatIndex: number | null;
  readonly connectedAt: number;
  readonly lastHeartbeat: number;
  readonly lastActivity: number;
  readonly disconnectedAt: number | null;
  readonly latencyMs: number;
  readonly missedHeartbeats: number;
}

export interface SessionConfig {
  readonly heartbeatIntervalMs: number;
  readonly heartbeatTimeoutMs: number;
  readonly maxMissedHeartbeats: number;
  readonly disconnectGraceMs: number;
  readonly sessionTimeoutMs: number;
}

export interface DisconnectEvent {
  readonly playerId: PlayerId;
  readonly sessionId: SessionId;
  readonly roomId: RoomId | null;
  readonly tableId: TableId | null;
  readonly seatIndex: number | null;
  readonly timestamp: number;
}

export interface ReconnectEvent {
  readonly playerId: PlayerId;
  readonly sessionId: SessionId;
  readonly newSessionId: SessionId;
  readonly roomId: RoomId | null;
  readonly tableId: TableId | null;
  readonly seatIndex: number | null;
  readonly timestamp: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: SessionConfig = {
  heartbeatIntervalMs: 5000,      // 5 seconds
  heartbeatTimeoutMs: 15000,      // 15 seconds
  maxMissedHeartbeats: 3,         // Disconnect after 3 missed
  disconnectGraceMs: 30000,       // 30 seconds to reconnect
  sessionTimeoutMs: 3600000,      // 1 hour session timeout
};

// ============================================================================
// SessionManager Class
// ============================================================================

export class SessionManager {
  private sessions: Map<SessionId, Session>;
  private playerSessions: Map<PlayerId, SessionId>;
  private config: SessionConfig;
  private globalSequence: number;
  private onDisconnect?: (event: DisconnectEvent) => void;
  private onReconnect?: (event: ReconnectEvent) => void;
  private onExpire?: (sessionId: SessionId, playerId: PlayerId) => void;

  constructor(config: Partial<SessionConfig> = {}) {
    this.sessions = new Map();
    this.playerSessions = new Map();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.globalSequence = 0;
  }

  /**
   * Set disconnect callback
   */
  setOnDisconnect(callback: (event: DisconnectEvent) => void): void {
    this.onDisconnect = callback;
  }

  /**
   * Set reconnect callback
   */
  setOnReconnect(callback: (event: ReconnectEvent) => void): void {
    this.onReconnect = callback;
  }

  /**
   * Set session expire callback
   */
  setOnExpire(callback: (sessionId: SessionId, playerId: PlayerId) => void): void {
    this.onExpire = callback;
  }

  /**
   * Create a new session for a player
   */
  createSession(playerId: PlayerId, playerName: string): Session {
    // Check for existing session
    const existingSessionId = this.playerSessions.get(playerId);
    if (existingSessionId) {
      const existingSession = this.sessions.get(existingSessionId);
      if (existingSession && existingSession.status === 'connected') {
        throw Errors.alreadyInRoom(existingSession.currentRoomId ?? 'unknown');
      }
    }

    const sessionId = `session_${playerId}_${Date.now()}_${createMessageId()}`;
    const now = Date.now();

    const session: Session = {
      sessionId,
      playerId,
      playerName,
      status: 'connected',
      currentRoomId: null,
      currentTableId: null,
      seatIndex: null,
      connectedAt: now,
      lastHeartbeat: now,
      lastActivity: now,
      disconnectedAt: null,
      latencyMs: 0,
      missedHeartbeats: 0,
    };

    this.sessions.set(sessionId, session);
    this.playerSessions.set(playerId, sessionId);

    return session;
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: SessionId): Session | null {
    return this.sessions.get(sessionId) ?? null;
  }

  /**
   * Get session by player ID
   */
  getSessionByPlayer(playerId: PlayerId): Session | null {
    const sessionId = this.playerSessions.get(playerId);
    if (!sessionId) return null;
    return this.sessions.get(sessionId) ?? null;
  }

  /**
   * Validate session is active
   */
  validateSession(sessionId: SessionId): Session {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw Errors.invalidSession(sessionId);
    }
    if (session.status === 'expired') {
      throw Errors.sessionExpired();
    }
    return session;
  }

  /**
   * Update session state
   */
  updateSession(sessionId: SessionId, updates: Partial<Session>): Session {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw Errors.invalidSession(sessionId);
    }

    const updated: Session = { ...session, ...updates };
    this.sessions.set(sessionId, updated);
    return updated;
  }

  /**
   * Process heartbeat from client
   */
  processHeartbeat(
    sessionId: SessionId,
    clientTime: number
  ): HeartbeatAckEvent {
    const session = this.validateSession(sessionId);
    const serverTime = Date.now();
    const latencyMs = Math.max(0, serverTime - clientTime);

    this.updateSession(sessionId, {
      lastHeartbeat: serverTime,
      lastActivity: serverTime,
      latencyMs,
      missedHeartbeats: 0,
      status: session.status === 'disconnected' ? 'connected' : session.status,
    });

    return {
      type: 'heartbeat-ack',
      header: createMessageHeader(++this.globalSequence),
      serverTime,
      clientTime,
      latencyMs,
    };
  }

  /**
   * Mark session as disconnected
   */
  disconnectSession(sessionId: SessionId, reason?: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const now = Date.now();
    this.updateSession(sessionId, {
      status: 'disconnected',
      disconnectedAt: now,
    });

    if (this.onDisconnect) {
      this.onDisconnect({
        playerId: session.playerId,
        sessionId,
        roomId: session.currentRoomId,
        tableId: session.currentTableId,
        seatIndex: session.seatIndex,
        timestamp: now,
      });
    }
  }

  /**
   * Attempt to reconnect a player
   */
  reconnectPlayer(playerId: PlayerId, playerName: string): Session {
    const existingSessionId = this.playerSessions.get(playerId);

    if (existingSessionId) {
      const existingSession = this.sessions.get(existingSessionId);

      if (existingSession) {
        // Check if within grace period
        if (
          existingSession.status === 'disconnected' &&
          existingSession.disconnectedAt &&
          Date.now() - existingSession.disconnectedAt < this.config.disconnectGraceMs
        ) {
          // Reconnect to existing session
          const now = Date.now();
          const reconnected = this.updateSession(existingSessionId, {
            status: 'connected',
            lastHeartbeat: now,
            lastActivity: now,
            disconnectedAt: null,
            missedHeartbeats: 0,
          });

          if (this.onReconnect) {
            this.onReconnect({
              playerId,
              sessionId: existingSessionId,
              newSessionId: existingSessionId,
              roomId: reconnected.currentRoomId,
              tableId: reconnected.currentTableId,
              seatIndex: reconnected.seatIndex,
              timestamp: now,
            });
          }

          return reconnected;
        }

        // Session expired, clean up old session
        this.expireSession(existingSessionId);
      }
    }

    // Create new session
    return this.createSession(playerId, playerName);
  }

  /**
   * Expire a session
   */
  expireSession(sessionId: SessionId): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    this.updateSession(sessionId, { status: 'expired' });
    this.playerSessions.delete(session.playerId);

    if (this.onExpire) {
      this.onExpire(sessionId, session.playerId);
    }
  }

  /**
   * Remove session completely
   */
  removeSession(sessionId: SessionId): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      this.playerSessions.delete(session.playerId);
    }
    this.sessions.delete(sessionId);
  }

  /**
   * Check all sessions for timeouts (call periodically)
   */
  checkTimeouts(): {
    disconnected: SessionId[];
    expired: SessionId[];
  } {
    const now = Date.now();
    const disconnected: SessionId[] = [];
    const expired: SessionId[] = [];

    for (const [sessionId, session] of this.sessions) {
      if (session.status === 'expired') continue;

      // Check for missed heartbeats
      const timeSinceHeartbeat = now - session.lastHeartbeat;
      if (timeSinceHeartbeat > this.config.heartbeatTimeoutMs) {
        const missedHeartbeats = Math.floor(
          timeSinceHeartbeat / this.config.heartbeatIntervalMs
        );

        if (missedHeartbeats >= this.config.maxMissedHeartbeats) {
          if (session.status === 'connected') {
            this.disconnectSession(sessionId);
            disconnected.push(sessionId);
          }
        } else {
          this.updateSession(sessionId, { missedHeartbeats });
        }
      }

      // Check for disconnect grace period expiration
      if (
        session.status === 'disconnected' &&
        session.disconnectedAt &&
        now - session.disconnectedAt > this.config.disconnectGraceMs
      ) {
        this.expireSession(sessionId);
        expired.push(sessionId);
      }

      // Check for session timeout
      if (now - session.connectedAt > this.config.sessionTimeoutMs) {
        this.expireSession(sessionId);
        expired.push(sessionId);
      }
    }

    return { disconnected, expired };
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): readonly Session[] {
    return Array.from(this.sessions.values()).filter(
      s => s.status === 'connected' || s.status === 'reconnecting'
    );
  }

  /**
   * Get sessions in a room
   */
  getSessionsInRoom(roomId: RoomId): readonly Session[] {
    return Array.from(this.sessions.values()).filter(
      s => s.currentRoomId === roomId && s.status !== 'expired'
    );
  }

  /**
   * Get disconnected sessions that are within grace period
   */
  getDisconnectedSessions(): readonly Session[] {
    const now = Date.now();
    return Array.from(this.sessions.values()).filter(
      s =>
        s.status === 'disconnected' &&
        s.disconnectedAt &&
        now - s.disconnectedAt < this.config.disconnectGraceMs
    );
  }

  /**
   * Calculate remaining grace time for a disconnected session
   */
  getRemainingGraceTime(sessionId: SessionId): number {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== 'disconnected' || !session.disconnectedAt) {
      return 0;
    }
    const elapsed = Date.now() - session.disconnectedAt;
    return Math.max(0, this.config.disconnectGraceMs - elapsed);
  }

  /**
   * Get configuration
   */
  getConfig(): SessionConfig {
    return this.config;
  }

  /**
   * Clear all sessions (for testing)
   */
  clear(): void {
    this.sessions.clear();
    this.playerSessions.clear();
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let sessionManagerInstance: SessionManager | null = null;

export function getSessionManager(config?: Partial<SessionConfig>): SessionManager {
  if (!sessionManagerInstance) {
    sessionManagerInstance = new SessionManager(config);
  }
  return sessionManagerInstance;
}

export function resetSessionManager(config?: Partial<SessionConfig>): SessionManager {
  sessionManagerInstance = new SessionManager(config);
  return sessionManagerInstance;
}
