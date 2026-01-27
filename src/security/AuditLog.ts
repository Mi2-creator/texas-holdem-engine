/**
 * AuditLog.ts
 * Phase 13 - Append-only audit logging for security events
 *
 * Provides tamper-evident logging with hash chaining.
 */

import { SecurityErrors } from './SecurityErrors';
import { PlayerId, SessionId } from './Identity';

// ============================================================================
// Types
// ============================================================================

export type AuditLogId = string;
export type TableId = string;
export type HandId = string;

export enum AuditEventType {
  // Authentication events
  AUTH_LOGIN = 'auth_login',
  AUTH_LOGOUT = 'auth_logout',
  AUTH_FAILED = 'auth_failed',
  AUTH_TOKEN_REFRESH = 'auth_token_refresh',
  AUTH_TOKEN_REVOKED = 'auth_token_revoked',

  // Session events
  SESSION_CREATED = 'session_created',
  SESSION_EXPIRED = 'session_expired',
  SESSION_HIJACK_ATTEMPT = 'session_hijack_attempt',

  // Room events
  ROOM_JOINED = 'room_joined',
  ROOM_LEFT = 'room_left',
  SEAT_TAKEN = 'seat_taken',
  SEAT_LEFT = 'seat_left',

  // Game events
  HAND_STARTED = 'hand_started',
  HAND_COMPLETED = 'hand_completed',
  ACTION_PERFORMED = 'action_performed',
  POT_AWARDED = 'pot_awarded',

  // Security events
  PERMISSION_DENIED = 'permission_denied',
  ROLE_ASSIGNED = 'role_assigned',
  ROLE_REVOKED = 'role_revoked',

  // Anti-cheat events
  VIOLATION_DETECTED = 'violation_detected',
  PLAYER_FLAGGED = 'player_flagged',
  PLAYER_UNFLAGGED = 'player_unflagged',

  // Admin events
  ADMIN_ACTION = 'admin_action',
  CONFIG_CHANGED = 'config_changed',
  PLAYER_KICKED = 'player_kicked',
  PLAYER_BANNED = 'player_banned',
}

export enum AuditSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical',
}

export interface AuditEntry {
  readonly id: AuditLogId;
  readonly sequence: number;
  readonly timestamp: number;
  readonly eventType: AuditEventType;
  readonly severity: AuditSeverity;
  readonly playerId?: PlayerId;
  readonly sessionId?: SessionId;
  readonly tableId?: TableId;
  readonly handId?: HandId;
  readonly action?: string;
  readonly details?: Record<string, unknown>;
  readonly previousHash: string;
  readonly hash: string;
}

export interface AuditQuery {
  readonly playerId?: PlayerId;
  readonly sessionId?: SessionId;
  readonly tableId?: TableId;
  readonly handId?: HandId;
  readonly eventTypes?: readonly AuditEventType[];
  readonly severities?: readonly AuditSeverity[];
  readonly fromTimestamp?: number;
  readonly toTimestamp?: number;
  readonly limit?: number;
  readonly offset?: number;
}

export interface AuditLogConfig {
  readonly maxEntries: number;
  readonly enableHashChain: boolean;
  readonly hashAlgorithm: 'simple' | 'sha256';
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: AuditLogConfig = {
  maxEntries: 100000,
  enableHashChain: true,
  hashAlgorithm: 'simple',
};

// ============================================================================
// Audit Logger
// ============================================================================

export class AuditLogger {
  private config: AuditLogConfig;
  private entries: AuditEntry[];
  private sequence: number;
  private lastHash: string;
  private entryIndex: Map<string, Set<number>>; // Index for faster queries

  constructor(config: Partial<AuditLogConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.entries = [];
    this.sequence = 0;
    this.lastHash = 'genesis';
    this.entryIndex = new Map();
  }

  /**
   * Log an audit event
   */
  log(
    eventType: AuditEventType,
    severity: AuditSeverity,
    context?: {
      playerId?: PlayerId;
      sessionId?: SessionId;
      tableId?: TableId;
      handId?: HandId;
      action?: string;
      details?: Record<string, unknown>;
    }
  ): AuditEntry {
    const id = this.generateId();
    const timestamp = Date.now();
    const previousHash = this.lastHash;

    // Create entry without hash first
    const entryData = {
      id,
      sequence: ++this.sequence,
      timestamp,
      eventType,
      severity,
      playerId: context?.playerId,
      sessionId: context?.sessionId,
      tableId: context?.tableId,
      handId: context?.handId,
      action: context?.action,
      details: context?.details,
      previousHash,
    };

    // Calculate hash
    const hash = this.config.enableHashChain
      ? this.calculateHash(entryData)
      : '';

    const entry: AuditEntry = {
      ...entryData,
      hash,
    };

    // Store entry
    this.entries.push(entry);
    this.lastHash = hash;

    // Index entry
    this.indexEntry(entry);

    // Prune if needed
    this.pruneIfNeeded();

    return entry;
  }

  /**
   * Log authentication event
   */
  logAuth(
    type: 'login' | 'logout' | 'failed' | 'refresh' | 'revoked',
    playerId: PlayerId,
    sessionId?: SessionId,
    details?: Record<string, unknown>
  ): AuditEntry {
    const eventTypeMap = {
      login: AuditEventType.AUTH_LOGIN,
      logout: AuditEventType.AUTH_LOGOUT,
      failed: AuditEventType.AUTH_FAILED,
      refresh: AuditEventType.AUTH_TOKEN_REFRESH,
      revoked: AuditEventType.AUTH_TOKEN_REVOKED,
    };

    const severityMap = {
      login: AuditSeverity.INFO,
      logout: AuditSeverity.INFO,
      failed: AuditSeverity.WARNING,
      refresh: AuditSeverity.INFO,
      revoked: AuditSeverity.INFO,
    };

    return this.log(eventTypeMap[type], severityMap[type], {
      playerId,
      sessionId,
      details,
    });
  }

  /**
   * Log game action
   */
  logAction(
    playerId: PlayerId,
    tableId: TableId,
    handId: HandId,
    action: string,
    details?: Record<string, unknown>
  ): AuditEntry {
    return this.log(AuditEventType.ACTION_PERFORMED, AuditSeverity.INFO, {
      playerId,
      tableId,
      handId,
      action,
      details,
    });
  }

  /**
   * Log security violation
   */
  logViolation(
    playerId: PlayerId,
    violationType: string,
    severity: AuditSeverity,
    details?: Record<string, unknown>
  ): AuditEntry {
    return this.log(AuditEventType.VIOLATION_DETECTED, severity, {
      playerId,
      action: violationType,
      details,
    });
  }

  /**
   * Log permission denial
   */
  logPermissionDenied(
    playerId: PlayerId,
    action: string,
    reason?: string
  ): AuditEntry {
    return this.log(AuditEventType.PERMISSION_DENIED, AuditSeverity.WARNING, {
      playerId,
      action,
      details: reason ? { reason } : undefined,
    });
  }

  /**
   * Log admin action
   */
  logAdminAction(
    adminId: PlayerId,
    action: string,
    targetPlayerId?: PlayerId,
    details?: Record<string, unknown>
  ): AuditEntry {
    return this.log(AuditEventType.ADMIN_ACTION, AuditSeverity.INFO, {
      playerId: adminId,
      action,
      details: {
        ...details,
        targetPlayerId,
      },
    });
  }

  /**
   * Query audit entries
   */
  query(params: AuditQuery): readonly AuditEntry[] {
    let results = this.entries;

    // Apply filters
    if (params.playerId) {
      const indices = this.entryIndex.get(`player:${params.playerId}`);
      if (indices) {
        results = results.filter((_, i) => indices.has(i));
      } else {
        return [];
      }
    }

    if (params.sessionId) {
      results = results.filter(e => e.sessionId === params.sessionId);
    }

    if (params.tableId) {
      results = results.filter(e => e.tableId === params.tableId);
    }

    if (params.handId) {
      results = results.filter(e => e.handId === params.handId);
    }

    if (params.eventTypes && params.eventTypes.length > 0) {
      const types = new Set(params.eventTypes);
      results = results.filter(e => types.has(e.eventType));
    }

    if (params.severities && params.severities.length > 0) {
      const severities = new Set(params.severities);
      results = results.filter(e => severities.has(e.severity));
    }

    if (params.fromTimestamp) {
      results = results.filter(e => e.timestamp >= params.fromTimestamp!);
    }

    if (params.toTimestamp) {
      results = results.filter(e => e.timestamp <= params.toTimestamp!);
    }

    // Apply pagination
    if (params.offset) {
      results = results.slice(params.offset);
    }

    if (params.limit) {
      results = results.slice(0, params.limit);
    }

    return results;
  }

  /**
   * Get entries for a specific hand
   */
  getHandLog(tableId: TableId, handId: HandId): readonly AuditEntry[] {
    return this.query({ tableId, handId });
  }

  /**
   * Get entries for a specific player
   */
  getPlayerLog(
    playerId: PlayerId,
    options?: {
      limit?: number;
      fromTimestamp?: number;
    }
  ): readonly AuditEntry[] {
    return this.query({
      playerId,
      limit: options?.limit,
      fromTimestamp: options?.fromTimestamp,
    });
  }

  /**
   * Get security events
   */
  getSecurityLog(
    options?: {
      limit?: number;
      fromTimestamp?: number;
    }
  ): readonly AuditEntry[] {
    return this.query({
      eventTypes: [
        AuditEventType.AUTH_FAILED,
        AuditEventType.SESSION_HIJACK_ATTEMPT,
        AuditEventType.PERMISSION_DENIED,
        AuditEventType.VIOLATION_DETECTED,
        AuditEventType.PLAYER_FLAGGED,
      ],
      severities: [AuditSeverity.WARNING, AuditSeverity.ERROR, AuditSeverity.CRITICAL],
      limit: options?.limit,
      fromTimestamp: options?.fromTimestamp,
    });
  }

  /**
   * Verify hash chain integrity
   */
  verifyIntegrity(fromSequence?: number, toSequence?: number): {
    valid: boolean;
    brokenAt?: number;
    expected?: string;
    actual?: string;
  } {
    if (!this.config.enableHashChain) {
      return { valid: true };
    }

    const start = fromSequence ?? 1;
    const end = toSequence ?? this.sequence;

    let previousHash = 'genesis';
    for (const entry of this.entries) {
      if (entry.sequence < start) {
        previousHash = entry.hash;
        continue;
      }
      if (entry.sequence > end) break;

      if (entry.previousHash !== previousHash) {
        return {
          valid: false,
          brokenAt: entry.sequence,
          expected: previousHash,
          actual: entry.previousHash,
        };
      }

      // Verify entry hash
      const expectedHash = this.calculateHash({
        id: entry.id,
        sequence: entry.sequence,
        timestamp: entry.timestamp,
        eventType: entry.eventType,
        severity: entry.severity,
        playerId: entry.playerId,
        sessionId: entry.sessionId,
        tableId: entry.tableId,
        handId: entry.handId,
        action: entry.action,
        details: entry.details,
        previousHash: entry.previousHash,
      });

      if (entry.hash !== expectedHash) {
        return {
          valid: false,
          brokenAt: entry.sequence,
          expected: expectedHash,
          actual: entry.hash,
        };
      }

      previousHash = entry.hash;
    }

    return { valid: true };
  }

  /**
   * Get entry count
   */
  getEntryCount(): number {
    return this.entries.length;
  }

  /**
   * Get current sequence
   */
  getCurrentSequence(): number {
    return this.sequence;
  }

  /**
   * Get entry by sequence
   */
  getEntryBySequence(sequence: number): AuditEntry | null {
    return this.entries.find(e => e.sequence === sequence) ?? null;
  }

  /**
   * Export entries (for external storage)
   */
  export(fromSequence?: number, toSequence?: number): readonly AuditEntry[] {
    const start = fromSequence ?? 1;
    const end = toSequence ?? this.sequence;
    return this.entries.filter(e => e.sequence >= start && e.sequence <= end);
  }

  /**
   * Import entries (from external storage)
   */
  import(entries: readonly AuditEntry[]): void {
    for (const entry of entries) {
      if (entry.sequence > this.sequence) {
        this.entries.push(entry);
        this.sequence = entry.sequence;
        this.lastHash = entry.hash;
        this.indexEntry(entry);
      }
    }
  }

  /**
   * Clear all entries (for testing)
   */
  clear(): void {
    this.entries = [];
    this.sequence = 0;
    this.lastHash = 'genesis';
    this.entryIndex.clear();
  }

  /**
   * Index an entry for faster queries
   */
  private indexEntry(entry: AuditEntry): void {
    const index = this.entries.length - 1;

    if (entry.playerId) {
      const key = `player:${entry.playerId}`;
      let indices = this.entryIndex.get(key);
      if (!indices) {
        indices = new Set();
        this.entryIndex.set(key, indices);
      }
      indices.add(index);
    }

    if (entry.tableId) {
      const key = `table:${entry.tableId}`;
      let indices = this.entryIndex.get(key);
      if (!indices) {
        indices = new Set();
        this.entryIndex.set(key, indices);
      }
      indices.add(index);
    }
  }

  /**
   * Prune old entries if exceeding max
   */
  private pruneIfNeeded(): void {
    if (this.entries.length > this.config.maxEntries) {
      const toRemove = this.entries.length - this.config.maxEntries;
      this.entries.splice(0, toRemove);
      // Rebuild index
      this.rebuildIndex();
    }
  }

  /**
   * Rebuild entry index after pruning
   */
  private rebuildIndex(): void {
    this.entryIndex.clear();
    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i];
      if (entry.playerId) {
        const key = `player:${entry.playerId}`;
        let indices = this.entryIndex.get(key);
        if (!indices) {
          indices = new Set();
          this.entryIndex.set(key, indices);
        }
        indices.add(i);
      }
      if (entry.tableId) {
        const key = `table:${entry.tableId}`;
        let indices = this.entryIndex.get(key);
        if (!indices) {
          indices = new Set();
          this.entryIndex.set(key, indices);
        }
        indices.add(i);
      }
    }
  }

  /**
   * Calculate hash for an entry
   */
  private calculateHash(data: Omit<AuditEntry, 'hash'>): string {
    const str = JSON.stringify(data);
    return this.simpleHash(str);
  }

  /**
   * Simple hash function (for demo - use crypto.subtle in production)
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
  }

  /**
   * Generate unique ID
   */
  private generateId(): AuditLogId {
    return `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// ============================================================================
// Audit Log Recorder (High-level interface)
// ============================================================================

export class AuditRecorder {
  private logger: AuditLogger;

  constructor(logger?: AuditLogger) {
    this.logger = logger ?? getAuditLogger();
  }

  /**
   * Record player login
   */
  playerLogin(playerId: PlayerId, sessionId: SessionId, ipAddress?: string): void {
    this.logger.logAuth('login', playerId, sessionId, { ipAddress });
  }

  /**
   * Record player logout
   */
  playerLogout(playerId: PlayerId, sessionId: SessionId): void {
    this.logger.logAuth('logout', playerId, sessionId);
  }

  /**
   * Record failed login attempt
   */
  loginFailed(playerId: PlayerId, reason: string, ipAddress?: string): void {
    this.logger.logAuth('failed', playerId, undefined, { reason, ipAddress });
  }

  /**
   * Record room join
   */
  roomJoined(playerId: PlayerId, roomId: string, tableId?: TableId): void {
    this.logger.log(AuditEventType.ROOM_JOINED, AuditSeverity.INFO, {
      playerId,
      tableId,
      details: { roomId },
    });
  }

  /**
   * Record seat taken
   */
  seatTaken(playerId: PlayerId, tableId: TableId, seatIndex: number): void {
    this.logger.log(AuditEventType.SEAT_TAKEN, AuditSeverity.INFO, {
      playerId,
      tableId,
      details: { seatIndex },
    });
  }

  /**
   * Record hand started
   */
  handStarted(tableId: TableId, handId: HandId, playerIds: readonly PlayerId[]): void {
    this.logger.log(AuditEventType.HAND_STARTED, AuditSeverity.INFO, {
      tableId,
      handId,
      details: { playerIds },
    });
  }

  /**
   * Record game action
   */
  gameAction(
    playerId: PlayerId,
    tableId: TableId,
    handId: HandId,
    action: string,
    amount?: number
  ): void {
    this.logger.logAction(playerId, tableId, handId, action, { amount });
  }

  /**
   * Record pot award
   */
  potAwarded(
    tableId: TableId,
    handId: HandId,
    winnerId: PlayerId,
    amount: number,
    handRank?: string
  ): void {
    this.logger.log(AuditEventType.POT_AWARDED, AuditSeverity.INFO, {
      playerId: winnerId,
      tableId,
      handId,
      details: { amount, handRank },
    });
  }

  /**
   * Record security violation
   */
  securityViolation(
    playerId: PlayerId,
    violationType: string,
    severity: 'warning' | 'violation' | 'critical',
    details?: Record<string, unknown>
  ): void {
    const severityMap = {
      warning: AuditSeverity.WARNING,
      violation: AuditSeverity.ERROR,
      critical: AuditSeverity.CRITICAL,
    };
    this.logger.logViolation(playerId, violationType, severityMap[severity], details);
  }

  /**
   * Record admin kick
   */
  playerKicked(adminId: PlayerId, targetId: PlayerId, reason?: string): void {
    this.logger.log(AuditEventType.PLAYER_KICKED, AuditSeverity.WARNING, {
      playerId: adminId,
      action: 'kick',
      details: { targetId, reason },
    });
  }

  /**
   * Record admin ban
   */
  playerBanned(adminId: PlayerId, targetId: PlayerId, reason?: string, duration?: number): void {
    this.logger.log(AuditEventType.PLAYER_BANNED, AuditSeverity.WARNING, {
      playerId: adminId,
      action: 'ban',
      details: { targetId, reason, duration },
    });
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let auditLoggerInstance: AuditLogger | null = null;

export function getAuditLogger(): AuditLogger {
  if (!auditLoggerInstance) {
    auditLoggerInstance = new AuditLogger();
  }
  return auditLoggerInstance;
}

export function resetAuditLogger(config?: Partial<AuditLogConfig>): AuditLogger {
  auditLoggerInstance = new AuditLogger(config);
  return auditLoggerInstance;
}

let auditRecorderInstance: AuditRecorder | null = null;

export function getAuditRecorder(): AuditRecorder {
  if (!auditRecorderInstance) {
    auditRecorderInstance = new AuditRecorder();
  }
  return auditRecorderInstance;
}

export function resetAuditRecorder(): AuditRecorder {
  auditRecorderInstance = new AuditRecorder(getAuditLogger());
  return auditRecorderInstance;
}
