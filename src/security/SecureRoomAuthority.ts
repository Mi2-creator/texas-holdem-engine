/**
 * SecureRoomAuthority.ts
 * Phase 13 - Security-integrated room authority
 *
 * Wraps RoomAuthority with identity, permission, and anti-cheat validation.
 */

import {
  RoomAuthority,
  AuthorityConfig,
  IntentResult,
  EventCallback,
} from '../network/RoomAuthority';
import {
  ClientIntent,
  ServerEvent,
  PlayerId,
  SessionId,
  RoomId,
  TableId,
} from '../network/Protocol';
import { Room, Table } from '../network/RoomState';
import { SessionManager, getSessionManager } from '../network/ConnectionSession';
import { SyncEngine, getSyncEngine } from '../network/SyncEngine';

import { IdentityRegistry, IdentityValidator, getIdentityRegistry } from './Identity';
import {
  AuthSessionManager,
  SecureSession,
  getAuthSessionManager,
  AuthCredentials,
} from './AuthSession';
import {
  PermissionGuard,
  PermissionContext,
  Permission,
  Role,
  getPermissionGuard,
} from './PermissionGuard';
import {
  AntiCheatValidator,
  ActionContext,
  GameState,
  ActionValidation,
  ViolationType,
  getAntiCheatValidator,
} from './AntiCheatValidator';
import {
  AuditRecorder,
  AuditSeverity,
  getAuditRecorder,
} from './AuditLog';
import { SecurityErrors } from './SecurityErrors';

// ============================================================================
// Types
// ============================================================================

export interface SecureAuthorityConfig extends AuthorityConfig {
  readonly requireAuthentication: boolean;
  readonly enableAntiCheat: boolean;
  readonly enableAuditLog: boolean;
  readonly enablePermissions: boolean;
  readonly actionTimeoutMs: number;
}

export interface SecureIntentResult extends IntentResult {
  readonly securityContext?: {
    readonly playerId: PlayerId;
    readonly sessionId: SessionId;
    readonly role: Role;
  };
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_SECURE_CONFIG: SecureAuthorityConfig = {
  autoStartHand: true,
  autoFoldOnTimeout: true,
  autoCheckOnTimeout: true,
  requireAuthentication: true,
  enableAntiCheat: true,
  enableAuditLog: true,
  enablePermissions: true,
  actionTimeoutMs: 30000,
};

// ============================================================================
// Secure Room Authority
// ============================================================================

export class SecureRoomAuthority {
  private authority: RoomAuthority;
  private config: SecureAuthorityConfig;
  private roomId: RoomId;
  private identityRegistry: IdentityRegistry;
  private identityValidator: IdentityValidator;
  private authManager: AuthSessionManager;
  private permissionGuard: PermissionGuard;
  private antiCheatValidator: AntiCheatValidator;
  private auditRecorder: AuditRecorder;
  private eventCallback?: EventCallback;

  constructor(
    roomId: RoomId,
    sessionManager: SessionManager,
    syncEngine: SyncEngine,
    config: Partial<SecureAuthorityConfig> = {},
    dependencies?: {
      identityRegistry?: IdentityRegistry;
      authManager?: AuthSessionManager;
      permissionGuard?: PermissionGuard;
      antiCheatValidator?: AntiCheatValidator;
      auditRecorder?: AuditRecorder;
    }
  ) {
    this.config = { ...DEFAULT_SECURE_CONFIG, ...config };
    this.roomId = roomId;
    this.authority = new RoomAuthority(sessionManager, syncEngine, {
      autoStartHand: this.config.autoStartHand,
      autoFoldOnTimeout: this.config.autoFoldOnTimeout,
      autoCheckOnTimeout: this.config.autoCheckOnTimeout,
    });

    // Use provided dependencies or singletons
    this.identityRegistry = dependencies?.identityRegistry ?? getIdentityRegistry();
    this.identityValidator = new IdentityValidator(this.identityRegistry);
    this.authManager = dependencies?.authManager ?? getAuthSessionManager();
    this.permissionGuard = dependencies?.permissionGuard ?? getPermissionGuard();
    this.antiCheatValidator = dependencies?.antiCheatValidator ?? getAntiCheatValidator();
    this.auditRecorder = dependencies?.auditRecorder ?? getAuditRecorder();
  }

  /**
   * Set event callback for broadcasting
   */
  setEventCallback(callback: EventCallback): void {
    this.eventCallback = callback;
    this.authority.setEventCallback(callback);
  }

  /**
   * Authenticate and create session
   */
  async authenticate(
    credentials: AuthCredentials,
    playerName: string,
    deviceInfo?: {
      userAgent?: string;
      ipAddress?: string;
      deviceId?: string;
    }
  ): Promise<SecureSession> {
    // Extract player ID from token (simple format: player_<id>)
    const match = credentials.token.match(/^player_(.+)$/);
    const playerId = match ? match[1] : `player_${Date.now()}`;

    // Ensure identity exists
    let identity = this.identityRegistry.getIdentity(playerId);
    if (!identity) {
      identity = this.identityRegistry.registerIdentity(playerId, playerName, {
        deviceFingerprint: deviceInfo?.deviceId,
      });
    }

    // Authenticate
    const session = await this.authManager.authenticate(credentials, deviceInfo);

    // Log authentication
    if (this.config.enableAuditLog) {
      this.auditRecorder.playerLogin(session.playerId, session.sessionId, deviceInfo?.ipAddress);
    }

    // Assign default role
    this.permissionGuard.assignRole(session.playerId, Role.PLAYER);

    return session;
  }

  /**
   * Get player ID from session
   */
  getPlayerIdFromSession(sessionId: SessionId): PlayerId | null {
    const session = this.authManager.getSession(sessionId);
    return session?.playerId ?? null;
  }

  /**
   * Process client intent with security validation
   */
  async processIntent(
    intent: ClientIntent,
  ): Promise<SecureIntentResult> {
    const sessionId = intent.sessionId;

    // Get player ID from session
    const playerId = this.getPlayerIdFromSession(sessionId);
    if (!playerId && this.config.requireAuthentication) {
      throw SecurityErrors.invalidSession(sessionId);
    }

    const effectivePlayerId = playerId ?? `unknown_${sessionId}`;

    // Get player role for context
    const permissionContext = this.createPermissionContext(intent, effectivePlayerId);
    const role = this.permissionGuard.getRole(permissionContext);

    // Check permissions based on intent type
    if (this.config.enablePermissions) {
      this.validateIntentPermissions(intent, permissionContext);
    }

    // Perform anti-cheat validation for action intents
    if (this.config.enableAntiCheat && intent.type === 'player-action') {
      this.validateActionAntiCheat(intent, sessionId, effectivePlayerId);
    }

    // Process the intent through the underlying authority
    const result = this.authority.processIntent(intent);

    // Log the action
    if (this.config.enableAuditLog && result.success) {
      this.logIntent(intent, permissionContext, effectivePlayerId);
    }

    return {
      ...result,
      securityContext: {
        playerId: effectivePlayerId,
        sessionId,
        role,
      },
    };
  }

  /**
   * Validate permissions for an intent
   */
  private validateIntentPermissions(
    intent: ClientIntent,
    context: PermissionContext
  ): void {
    const permissionMap: Record<string, Permission> = {
      'join-room': Permission.JOIN_ROOM,
      'leave-room': Permission.LEAVE_ROOM,
      'take-seat': Permission.TAKE_SEAT,
      'leave-seat': Permission.LEAVE_SEAT,
      'buy-in': Permission.BUY_IN,
      'stand-up': Permission.STAND_UP,
      'sit-back': Permission.SIT_BACK,
      'player-action': Permission.PERFORM_ACTION,
      'request-sync': Permission.VIEW_TABLE,
      'heartbeat': Permission.VIEW_ROOM,
    };

    const requiredPermission = permissionMap[intent.type];
    if (requiredPermission) {
      this.permissionGuard.requirePermission(context, requiredPermission);
    }

    // Additional checks for spectators
    if (this.permissionGuard.isSpectator(context)) {
      const spectatorRestricted = [
        'take-seat',
        'buy-in',
        'player-action',
        'stand-up',
        'sit-back',
      ];
      if (spectatorRestricted.includes(intent.type)) {
        throw SecurityErrors.spectatorRestricted(intent.type);
      }
    }
  }

  /**
   * Validate action intent with anti-cheat
   */
  private validateActionAntiCheat(
    intent: ClientIntent & { type: 'player-action' },
    sessionId: SessionId,
    playerId: PlayerId
  ): void {
    const room = this.authority.getRoom(this.roomId);
    if (!room) return;

    const tableId = intent.tableContext.tableId;
    const table = room.tables.find(t => t.tableId === tableId);
    if (!table) return;

    // Build game state for validation
    const gameState = this.buildGameState(table, playerId);

    // Find seat for player
    const seat = table.seats.find(s => s.playerId === playerId);
    const seatIndex = seat?.seatIndex ?? -1;

    // Build action context
    const actionContext: ActionContext = {
      playerId,
      sessionId,
      tableId: table.tableId,
      handId: table.handId ?? undefined,
      seatIndex,
      timestamp: Date.now(),
      sequence: intent.tableContext.sequence,
    };

    // Build action validation
    const actionValidation: ActionValidation = {
      actionType: intent.action.type,
      amount: intent.action.amount,
      allIn: intent.action.type === 'all-in',
    };

    // Validate and record violations
    const result = this.antiCheatValidator.validateAction(actionContext, gameState, actionValidation);

    if (!result.valid) {
      // Log violations
      for (const violation of result.violations) {
        if (this.config.enableAuditLog) {
          this.auditRecorder.securityViolation(
            playerId,
            violation.type,
            violation.severity,
            violation.context
          );
        }
      }

      // Check for critical violations
      const critical = result.violations.find(v => v.severity === 'critical');
      if (critical) {
        switch (critical.type) {
          case ViolationType.TURN_SPOOFING:
            throw SecurityErrors.turnSpoofing(playerId, gameState.currentTurnPlayerId ?? 'unknown');
          case ViolationType.SEQUENCE_REPLAY:
            throw SecurityErrors.sequenceReplay(actionContext.sequence ?? 0, 0);
          default:
            throw SecurityErrors.suspiciousActivity(playerId, critical.message);
        }
      }
    }
  }

  /**
   * Build game state from table
   */
  private buildGameState(table: Table, playerId: PlayerId): GameState {
    const playerStacks = new Map<PlayerId, number>();
    const playerBets = new Map<PlayerId, number>();

    for (const seat of table.seats) {
      if (seat.playerId) {
        playerStacks.set(seat.playerId, seat.stack);
        playerBets.set(seat.playerId, seat.currentBet);
      }
    }

    const activeSeat = table.seats.find(s => s.seatIndex === table.activePlayerSeat);

    return {
      tableId: table.tableId,
      handId: table.handId ?? undefined,
      currentTurnPlayerId: activeSeat?.playerId ?? null,
      currentTurnSeatIndex: table.activePlayerSeat,
      pot: table.pot,
      currentBet: table.currentBet,
      minRaise: table.minRaise,
      playerStacks,
      playerBets,
      street: table.street,
      turnStartedAt: Date.now() - 10000, // Approximate - no exact timestamp in Table
      turnTimeoutMs: this.config.actionTimeoutMs,
    };
  }

  /**
   * Create permission context from intent
   */
  private createPermissionContext(
    intent: ClientIntent,
    playerId: PlayerId
  ): PermissionContext {
    const room = this.authority.getRoom(this.roomId);
    const tableContext = 'tableContext' in intent ? intent.tableContext : undefined;

    return {
      playerId,
      sessionId: intent.sessionId,
      roomId: room?.roomId ?? this.roomId,
      tableId: tableContext?.tableId,
    };
  }

  /**
   * Log intent to audit log
   */
  private logIntent(
    intent: ClientIntent,
    context: PermissionContext,
    playerId: PlayerId
  ): void {
    switch (intent.type) {
      case 'join-room':
        this.auditRecorder.roomJoined(playerId, context.roomId ?? '', context.tableId);
        break;

      case 'take-seat':
        if (context.tableId) {
          this.auditRecorder.seatTaken(playerId, context.tableId, intent.seatIndex);
        }
        break;

      case 'player-action':
        if (context.tableId) {
          this.auditRecorder.gameAction(
            playerId,
            context.tableId,
            intent.tableContext.handId ?? '',
            intent.action.type,
            intent.action.amount
          );
        }
        break;
    }
  }

  /**
   * Create a room
   */
  createRoom(
    name: string,
    clubId: string,
    config: {
      smallBlind: number;
      bigBlind: number;
      minBuyIn: number;
      maxBuyIn: number;
      maxSeats: number;
      actionTimeoutSeconds?: number;
      disconnectGraceSeconds?: number;
    }
  ): Room {
    return this.authority.createRoom(this.roomId, clubId, name, {
      ...config,
      actionTimeoutSeconds: config.actionTimeoutSeconds ?? Math.floor(this.config.actionTimeoutMs / 1000),
      disconnectGraceSeconds: config.disconnectGraceSeconds ?? 60,
    });
  }

  /**
   * Get current room state
   */
  getRoom(): Room | null {
    return this.authority.getRoom(this.roomId);
  }

  /**
   * Assign role to player in room
   */
  assignRole(
    playerId: PlayerId,
    role: Role,
    scope?: { tableId?: TableId }
  ): void {
    this.permissionGuard.assignRole(playerId, role, {
      roomId: this.roomId,
      ...scope,
    });
  }

  /**
   * Check if player is suspicious
   */
  isSuspicious(playerId: PlayerId): boolean {
    return this.antiCheatValidator.isSuspicious(playerId);
  }

  /**
   * Get player violation count
   */
  getViolationCount(playerId: PlayerId): number {
    return this.antiCheatValidator.getViolationCount(playerId);
  }

  /**
   * Kick player (admin action)
   */
  async kickPlayer(
    adminId: PlayerId,
    targetPlayerId: PlayerId,
    reason?: string
  ): Promise<void> {
    // Verify admin permissions
    const adminContext: PermissionContext = {
      playerId: adminId,
      roomId: this.roomId,
    };

    this.permissionGuard.requirePermission(adminContext, Permission.KICK_PLAYER);

    // Log the kick
    if (this.config.enableAuditLog) {
      this.auditRecorder.playerKicked(adminId, targetPlayerId, reason);
    }
  }

  /**
   * Ban player (admin action)
   */
  async banPlayer(
    adminId: PlayerId,
    targetPlayerId: PlayerId,
    reason?: string,
    durationMs?: number
  ): Promise<void> {
    // Verify admin permissions
    const adminContext: PermissionContext = {
      playerId: adminId,
      roomId: this.roomId,
    };

    this.permissionGuard.requirePermission(adminContext, Permission.BAN_PLAYER);

    // Log the ban
    if (this.config.enableAuditLog) {
      this.auditRecorder.playerBanned(adminId, targetPlayerId, reason, durationMs);
    }
  }

  /**
   * Get configuration
   */
  getConfig(): SecureAuthorityConfig {
    return this.config;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createSecureRoomAuthority(
  roomId: RoomId,
  config?: Partial<SecureAuthorityConfig>
): SecureRoomAuthority {
  return new SecureRoomAuthority(
    roomId,
    getSessionManager(),
    getSyncEngine(),
    config
  );
}
