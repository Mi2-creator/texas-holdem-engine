/**
 * Security Module Tests
 * Phase 13 - Identity, Authentication & Anti-Cheat Trust Layer
 */

import { describe, test, expect, beforeEach } from '@jest/globals';

import {
  // Security errors
  SecurityRejectCode,
  SecurityErrors,
  IdentityError,
  AuthenticationError,
  PermissionError,
  AntiCheatError,

  // Identity
  IdentityRegistry,
  IdentityValidator,
  resetIdentityRegistry,

  // Authentication
  SimpleTokenProvider,
  JWTLikeProvider,
  AuthSessionManager,
  resetAuthSessionManager,

  // Permissions
  PermissionGuard,
  Role,
  Permission,
  resetPermissionGuard,

  // Anti-cheat
  AntiCheatValidator,
  ViolationType,
  resetAntiCheatValidator,

  // Audit
  AuditLogger,
  AuditEventType,
  AuditSeverity,
  resetAuditLogger,
} from '../index';

// ============================================================================
// Identity Tests
// ============================================================================

describe('IdentityRegistry', () => {
  let registry: IdentityRegistry;

  beforeEach(() => {
    registry = resetIdentityRegistry();
  });

  test('should register new identity', () => {
    const identity = registry.registerIdentity('player1', 'Alice');

    expect(identity.playerId).toBe('player1');
    expect(identity.displayName).toBe('Alice');
    expect(identity.createdAt).toBeGreaterThan(0);
  });

  test('should reject duplicate player ID', () => {
    registry.registerIdentity('player1', 'Alice');

    expect(() => registry.registerIdentity('player1', 'Bob')).toThrow(IdentityError);
  });

  test('should get identity by player ID', () => {
    registry.registerIdentity('player1', 'Alice');

    const identity = registry.getIdentity('player1');
    expect(identity?.displayName).toBe('Alice');
  });

  test('should return null for unknown player', () => {
    const identity = registry.getIdentity('unknown');
    expect(identity).toBeNull();
  });

  test('should update identity', () => {
    registry.registerIdentity('player1', 'Alice');

    const updated = registry.updateIdentity('player1', { displayName: 'Alice Smith' });
    expect(updated.displayName).toBe('Alice Smith');
  });

  test('should bind session to identity', () => {
    registry.registerIdentity('player1', 'Alice');

    const binding = registry.bindSession('player1', 'session1', {
      ipAddress: '127.0.0.1',
    });

    expect(binding.playerId).toBe('player1');
    expect(binding.sessionId).toBe('session1');
    expect(binding.ipAddress).toBe('127.0.0.1');
  });

  test('should verify session ownership', () => {
    registry.registerIdentity('player1', 'Alice');
    registry.bindSession('player1', 'session1');

    const result = registry.verifySessionOwnership('session1', 'player1');
    expect(result.valid).toBe(true);

    const wrongResult = registry.verifySessionOwnership('session1', 'player2');
    expect(wrongResult.valid).toBe(false);
  });

  test('should unbind session', () => {
    registry.registerIdentity('player1', 'Alice');
    registry.bindSession('player1', 'session1');
    registry.unbindSession('session1');

    const binding = registry.getBinding('session1');
    expect(binding).toBeNull();
  });
});

describe('IdentityValidator', () => {
  let registry: IdentityRegistry;
  let validator: IdentityValidator;

  beforeEach(() => {
    registry = resetIdentityRegistry();
    validator = new IdentityValidator(registry);
  });

  test('should validate session for player', () => {
    registry.registerIdentity('player1', 'Alice');
    registry.bindSession('player1', 'session1');

    expect(() => validator.validateSessionForPlayer('session1', 'player1')).not.toThrow();
  });

  test('should throw on session mismatch', () => {
    registry.registerIdentity('player1', 'Alice');
    registry.bindSession('player1', 'session1');

    expect(() => validator.validateSessionForPlayer('session1', 'player2')).toThrow();
  });

  test('should get player ID from session', () => {
    registry.registerIdentity('player1', 'Alice');
    registry.bindSession('player1', 'session1');

    const playerId = validator.getPlayerIdFromSession('session1');
    expect(playerId).toBe('player1');
  });
});

// ============================================================================
// Authentication Tests
// ============================================================================

describe('SimpleTokenProvider', () => {
  let provider: SimpleTokenProvider;

  beforeEach(() => {
    provider = new SimpleTokenProvider();
  });

  test('should authenticate with valid token', async () => {
    const result = await provider.authenticate({
      providerId: 'simple',
      token: 'player_alice123',
    });

    expect(result.success).toBe(true);
    expect(result.playerId).toBe('alice123');
    expect(result.token).toBeDefined();
  });

  test('should reject invalid token format', async () => {
    const result = await provider.authenticate({
      providerId: 'simple',
      token: 'invalid_format',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid token format');
  });

  test('should validate issued token', async () => {
    const authResult = await provider.authenticate({
      providerId: 'simple',
      token: 'player_alice123',
    });

    const validateResult = await provider.validateToken(authResult.token!.tokenId);
    expect(validateResult.success).toBe(true);
    expect(validateResult.playerId).toBe('alice123');
  });

  test('should revoke token', async () => {
    const authResult = await provider.authenticate({
      providerId: 'simple',
      token: 'player_alice123',
    });

    await provider.revokeToken(authResult.token!.tokenId);

    const validateResult = await provider.validateToken(authResult.token!.tokenId);
    expect(validateResult.success).toBe(false);
  });
});

describe('JWTLikeProvider', () => {
  let provider: JWTLikeProvider;

  beforeEach(() => {
    provider = new JWTLikeProvider('secret-key', 3600000);
  });

  test('should authenticate with valid token', async () => {
    const inputToken = btoa('alice123:' + Date.now());
    const result = await provider.authenticate({
      providerId: 'jwt',
      token: inputToken,
    });

    expect(result.success).toBe(true);
    expect(result.playerId).toBe('alice123');
    expect(result.token?.refreshToken).toBeDefined();
  });

  test('should validate signed token', async () => {
    const inputToken = btoa('alice123:' + Date.now());
    const authResult = await provider.authenticate({
      providerId: 'jwt',
      token: inputToken,
    });

    const validateResult = await provider.validateToken(authResult.token!.tokenId);
    expect(validateResult.success).toBe(true);
  });

  test('should refresh token', async () => {
    const inputToken = btoa('alice123:' + Date.now());
    const authResult = await provider.authenticate({
      providerId: 'jwt',
      token: inputToken,
    });

    const refreshResult = await provider.refreshToken(authResult.token!.refreshToken!);
    expect(refreshResult.success).toBe(true);
    expect(refreshResult.playerId).toBe('alice123');
  });

  test('should reject revoked token', async () => {
    const inputToken = btoa('alice123:' + Date.now());
    const authResult = await provider.authenticate({
      providerId: 'jwt',
      token: inputToken,
    });

    await provider.revokeToken(authResult.token!.tokenId);

    const validateResult = await provider.validateToken(authResult.token!.tokenId);
    expect(validateResult.success).toBe(false);
    expect(validateResult.error).toBe('Token has been revoked');
  });
});

describe('AuthSessionManager', () => {
  let registry: IdentityRegistry;
  let manager: AuthSessionManager;

  beforeEach(() => {
    registry = resetIdentityRegistry();
    manager = new AuthSessionManager(registry);
    manager.registerProvider(new SimpleTokenProvider());

    // Pre-register identity
    registry.registerIdentity('alice123', 'Alice');
  });

  test('should create session on authentication', async () => {
    const session = await manager.authenticate({
      providerId: 'simple',
      token: 'player_alice123',
    });

    expect(session.playerId).toBe('alice123');
    expect(session.sessionId).toBeDefined();
    expect(session.token).toBeDefined();
  });

  test('should validate existing session', async () => {
    const session = await manager.authenticate({
      providerId: 'simple',
      token: 'player_alice123',
    });

    const validated = await manager.validateSession(session.sessionId);
    expect(validated.playerId).toBe('alice123');
  });

  test('should invalidate session', async () => {
    const session = await manager.authenticate({
      providerId: 'simple',
      token: 'player_alice123',
    });

    await manager.invalidateSession(session.sessionId);

    await expect(manager.validateSession(session.sessionId)).rejects.toThrow();
  });

  test('should replace existing session on new auth', async () => {
    const session1 = await manager.authenticate({
      providerId: 'simple',
      token: 'player_alice123',
    });

    const session2 = await manager.authenticate({
      providerId: 'simple',
      token: 'player_alice123',
    });

    expect(session2.sessionId).not.toBe(session1.sessionId);

    // Old session should be invalidated
    await expect(manager.validateSession(session1.sessionId)).rejects.toThrow();
  });
});

// ============================================================================
// Permission Tests
// ============================================================================

describe('PermissionGuard', () => {
  let guard: PermissionGuard;

  beforeEach(() => {
    guard = resetPermissionGuard();
  });

  test('should return default role for unknown player', () => {
    const role = guard.getRole({ playerId: 'unknown' });
    expect(role).toBe(Role.GUEST);
  });

  test('should assign and retrieve role', () => {
    guard.assignRole('player1', Role.PLAYER);

    const role = guard.getRole({ playerId: 'player1' });
    expect(role).toBe(Role.PLAYER);
  });

  test('should check permission for role', () => {
    guard.assignRole('player1', Role.PLAYER);

    const hasPermission = guard.hasPermission(
      { playerId: 'player1' },
      Permission.PERFORM_ACTION
    );
    expect(hasPermission).toBe(true);

    const noPermission = guard.hasPermission(
      { playerId: 'player1' },
      Permission.KICK_PLAYER
    );
    expect(noPermission).toBe(false);
  });

  test('should require permission', () => {
    guard.assignRole('player1', Role.PLAYER);

    expect(() =>
      guard.requirePermission({ playerId: 'player1' }, Permission.PERFORM_ACTION)
    ).not.toThrow();

    expect(() =>
      guard.requirePermission({ playerId: 'player1' }, Permission.KICK_PLAYER)
    ).toThrow(PermissionError);
  });

  test('should check spectator status', () => {
    guard.assignRole('player1', Role.SPECTATOR);
    guard.assignRole('player2', Role.PLAYER);

    expect(guard.isSpectator({ playerId: 'player1' })).toBe(true);
    expect(guard.isSpectator({ playerId: 'player2' })).toBe(false);
  });

  test('should restrict spectator actions', () => {
    guard.assignRole('player1', Role.SPECTATOR);

    expect(() =>
      guard.requireNotSpectator({ playerId: 'player1' }, 'bet')
    ).toThrow(PermissionError);
  });

  test('should support scoped roles', () => {
    guard.assignRole('player1', Role.PLAYER);
    guard.assignRole('player1', Role.ADMIN, { roomId: 'room1' });

    // Global context - player role
    expect(guard.isAdmin({ playerId: 'player1' })).toBe(false);

    // Room context - admin role
    expect(guard.isAdmin({ playerId: 'player1', roomId: 'room1' })).toBe(true);
  });

  test('should handle role expiration', () => {
    const expiredTime = Date.now() - 1000;
    guard.assignRole('player1', Role.VIP, {}, { expiresAt: expiredTime });

    // Should fall back to default role
    const role = guard.getRole({ playerId: 'player1' });
    expect(role).toBe(Role.GUEST);
  });
});

// ============================================================================
// Anti-Cheat Tests
// ============================================================================

describe('AntiCheatValidator', () => {
  let validator: AntiCheatValidator;

  const createGameState = (overrides: Partial<{
    currentTurnPlayerId: string | null;
    currentTurnSeatIndex: number | null;
    turnStartedAt: number;
    turnTimeoutMs: number;
    pot: number;
    currentBet: number;
    minRaise: number;
    playerStacks: Map<string, number>;
    playerBets: Map<string, number>;
  }> = {}) => ({
    tableId: 'table1',
    handId: 'hand1',
    currentTurnPlayerId: 'player1',
    currentTurnSeatIndex: 0,
    pot: 100,
    currentBet: 20,
    minRaise: 20,
    playerStacks: new Map([['player1', 1000], ['player2', 1000]]),
    playerBets: new Map([['player1', 10], ['player2', 20]]),
    street: 'flop',
    turnStartedAt: Date.now() - 5000,
    turnTimeoutMs: 30000,
    ...overrides,
  });

  const createActionContext = (overrides: Partial<{
    playerId: string;
    sessionId: string;
    seatIndex: number;
    timestamp: number;
    sequence: number;
  }> = {}) => ({
    playerId: 'player1',
    sessionId: 'session1',
    tableId: 'table1',
    handId: 'hand1',
    seatIndex: 0,
    timestamp: Date.now(),
    ...overrides,
  });

  beforeEach(() => {
    validator = resetAntiCheatValidator();
  });

  test('should pass valid action', () => {
    const gameState = createGameState();
    const context = createActionContext();

    const result = validator.validateAction(context, gameState, {
      actionType: 'call',
      amount: 10,
    });

    expect(result.valid).toBe(true);
    expect(result.violations.length).toBe(0);
  });

  test('should detect turn spoofing - wrong player', () => {
    const gameState = createGameState({ currentTurnPlayerId: 'player2' });
    const context = createActionContext({ playerId: 'player1' });

    const result = validator.validateAction(context, gameState, {
      actionType: 'call',
    });

    expect(result.valid).toBe(false);
    expect(result.violations.some(v => v.type === ViolationType.TURN_SPOOFING)).toBe(true);
  });

  test('should detect turn spoofing - wrong seat', () => {
    const gameState = createGameState({ currentTurnSeatIndex: 1 });
    const context = createActionContext({ seatIndex: 0 });

    const result = validator.validateAction(context, gameState, {
      actionType: 'call',
    });

    expect(result.valid).toBe(false);
    expect(result.violations.some(v => v.type === ViolationType.TURN_SPOOFING)).toBe(true);
  });

  test('should detect timing violation - after timeout', () => {
    const gameState = createGameState({
      turnStartedAt: Date.now() - 60000,
      turnTimeoutMs: 30000,
    });
    const context = createActionContext();

    const result = validator.validateAction(context, gameState, {
      actionType: 'call',
    });

    expect(result.violations.some(v => v.type === ViolationType.TIMING_VIOLATION)).toBe(true);
  });

  test('should detect sequence replay', () => {
    const gameState = createGameState();
    const context1 = createActionContext({ sequence: 5 });
    const context2 = createActionContext({ sequence: 5 });

    validator.validateAction(context1, gameState, { actionType: 'check' });
    const result = validator.validateAction(context2, gameState, { actionType: 'check' });

    expect(result.valid).toBe(false);
    expect(result.violations.some(v => v.type === ViolationType.SEQUENCE_REPLAY)).toBe(true);
  });

  test('should detect bet exceeding stack', () => {
    const gameState = createGameState({
      playerStacks: new Map([['player1', 100]]),
    });
    const context = createActionContext();

    const result = validator.validateAction(context, gameState, {
      actionType: 'raise',
      amount: 500,
    });

    expect(result.violations.some(v => v.type === ViolationType.BET_MANIPULATION)).toBe(true);
  });

  test('should detect bet below minimum', () => {
    const gameState = createGameState({
      currentBet: 20,
      minRaise: 20,
      playerStacks: new Map([['player1', 1000]]),
    });
    const context = createActionContext();

    const result = validator.validateAction(context, gameState, {
      actionType: 'raise',
      amount: 25, // Below min (20 + 20 = 40)
    });

    expect(result.violations.some(v => v.type === ViolationType.BET_MANIPULATION)).toBe(true);
  });

  test('should detect rate limit exceeded', () => {
    validator = resetAntiCheatValidator({
      rateLimitConfig: { maxActionsPerWindow: 3, windowMs: 1000 },
    });

    const gameState = createGameState();
    const now = Date.now();

    // Send 4 actions rapidly
    for (let i = 0; i < 4; i++) {
      const context = createActionContext({ timestamp: now + i, sequence: i });
      const result = validator.validateAction(context, gameState, { actionType: 'check' });

      if (i === 3) {
        expect(result.violations.some(v => v.type === ViolationType.RATE_LIMIT_EXCEEDED)).toBe(true);
      }
    }
  });

  test('should track suspicious players', () => {
    const gameState = createGameState();

    // Generate multiple violations
    for (let i = 0; i < 5; i++) {
      const context = createActionContext({
        sequence: 1, // Same sequence = replay
        timestamp: Date.now() + i,
      });
      validator.validateAction(context, gameState, { actionType: 'check' });
    }

    expect(validator.isSuspicious('player1')).toBe(true);
    expect(validator.getSuspiciousPlayers()).toContain('player1');
  });

  test('should clear violations for player', () => {
    const gameState = createGameState({ currentTurnPlayerId: 'player2' });
    const context = createActionContext();

    validator.validateAction(context, gameState, { actionType: 'check' });

    expect(validator.getViolationCount('player1')).toBeGreaterThan(0);

    validator.clearViolations('player1');

    expect(validator.getViolationCount('player1')).toBe(0);
    expect(validator.isSuspicious('player1')).toBe(false);
  });
});

// ============================================================================
// Audit Log Tests
// ============================================================================

describe('AuditLogger', () => {
  let logger: AuditLogger;

  beforeEach(() => {
    logger = resetAuditLogger();
  });

  test('should log events', () => {
    const entry = logger.log(AuditEventType.AUTH_LOGIN, AuditSeverity.INFO, {
      playerId: 'player1',
    });

    expect(entry.eventType).toBe(AuditEventType.AUTH_LOGIN);
    expect(entry.severity).toBe(AuditSeverity.INFO);
    expect(entry.playerId).toBe('player1');
    expect(entry.sequence).toBe(1);
  });

  test('should chain hashes', () => {
    const entry1 = logger.log(AuditEventType.AUTH_LOGIN, AuditSeverity.INFO);
    const entry2 = logger.log(AuditEventType.ROOM_JOINED, AuditSeverity.INFO);

    expect(entry2.previousHash).toBe(entry1.hash);
  });

  test('should query by player ID', () => {
    logger.log(AuditEventType.AUTH_LOGIN, AuditSeverity.INFO, { playerId: 'player1' });
    logger.log(AuditEventType.ROOM_JOINED, AuditSeverity.INFO, { playerId: 'player1' });
    logger.log(AuditEventType.AUTH_LOGIN, AuditSeverity.INFO, { playerId: 'player2' });

    const results = logger.query({ playerId: 'player1' });
    expect(results.length).toBe(2);
  });

  test('should query by event type', () => {
    logger.log(AuditEventType.AUTH_LOGIN, AuditSeverity.INFO);
    logger.log(AuditEventType.AUTH_LOGOUT, AuditSeverity.INFO);
    logger.log(AuditEventType.AUTH_LOGIN, AuditSeverity.INFO);

    const results = logger.query({ eventTypes: [AuditEventType.AUTH_LOGIN] });
    expect(results.length).toBe(2);
  });

  test('should query by severity', () => {
    logger.log(AuditEventType.AUTH_LOGIN, AuditSeverity.INFO);
    logger.log(AuditEventType.AUTH_FAILED, AuditSeverity.WARNING);
    logger.log(AuditEventType.VIOLATION_DETECTED, AuditSeverity.CRITICAL);

    const results = logger.query({
      severities: [AuditSeverity.WARNING, AuditSeverity.CRITICAL],
    });
    expect(results.length).toBe(2);
  });

  test('should query by timestamp range', () => {
    const start = Date.now();
    logger.log(AuditEventType.AUTH_LOGIN, AuditSeverity.INFO);

    const middle = Date.now() + 100;

    logger.log(AuditEventType.ROOM_JOINED, AuditSeverity.INFO);

    const results = logger.query({
      fromTimestamp: start,
      toTimestamp: middle,
    });

    // At least one entry should be in range
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  test('should verify hash chain integrity', () => {
    logger.log(AuditEventType.AUTH_LOGIN, AuditSeverity.INFO);
    logger.log(AuditEventType.ROOM_JOINED, AuditSeverity.INFO);
    logger.log(AuditEventType.ACTION_PERFORMED, AuditSeverity.INFO);

    const result = logger.verifyIntegrity();
    expect(result.valid).toBe(true);
  });

  test('should log authentication events', () => {
    logger.logAuth('login', 'player1', 'session1', { ipAddress: '127.0.0.1' });
    logger.logAuth('failed', 'player2', undefined, { reason: 'Invalid password' });

    const entries = logger.query({ playerId: 'player1' });
    expect(entries[0].eventType).toBe(AuditEventType.AUTH_LOGIN);

    const securityEvents = logger.getSecurityLog();
    expect(securityEvents.some(e => e.eventType === AuditEventType.AUTH_FAILED)).toBe(true);
  });

  test('should log game actions', () => {
    logger.logAction('player1', 'table1', 'hand1', 'raise', { amount: 100 });

    const entries = logger.getHandLog('table1', 'hand1');
    expect(entries.length).toBe(1);
    expect(entries[0].action).toBe('raise');
  });

  test('should log violations', () => {
    logger.logViolation('player1', 'turn_spoofing', AuditSeverity.CRITICAL, {
      expected: 'player2',
    });

    const securityEvents = logger.getSecurityLog();
    expect(securityEvents.length).toBe(1);
    expect(securityEvents[0].severity).toBe(AuditSeverity.CRITICAL);
  });

  test('should export and import entries', () => {
    logger.log(AuditEventType.AUTH_LOGIN, AuditSeverity.INFO, { playerId: 'player1' });
    logger.log(AuditEventType.ROOM_JOINED, AuditSeverity.INFO, { playerId: 'player1' });

    const exported = logger.export();
    expect(exported.length).toBe(2);

    const newLogger = new AuditLogger();
    newLogger.import(exported);

    expect(newLogger.getEntryCount()).toBe(2);
  });

  test('should prune old entries when exceeding max', () => {
    const smallLogger = new AuditLogger({ maxEntries: 5 });

    for (let i = 0; i < 10; i++) {
      smallLogger.log(AuditEventType.ACTION_PERFORMED, AuditSeverity.INFO);
    }

    expect(smallLogger.getEntryCount()).toBe(5);
  });
});

// ============================================================================
// Security Error Tests
// ============================================================================

describe('SecurityErrors', () => {
  test('should create identity errors', () => {
    const error = SecurityErrors.playerNotFound('player1');
    expect(error).toBeInstanceOf(IdentityError);
    expect(error.code).toBe(SecurityRejectCode.PLAYER_NOT_FOUND);
    expect(error.context?.playerId).toBe('player1');
  });

  test('should create authentication errors', () => {
    const error = SecurityErrors.tokenExpired();
    expect(error).toBeInstanceOf(AuthenticationError);
    expect(error.code).toBe(SecurityRejectCode.TOKEN_EXPIRED);
  });

  test('should create permission errors', () => {
    const error = SecurityErrors.spectatorRestricted('bet');
    expect(error).toBeInstanceOf(PermissionError);
    expect(error.code).toBe(SecurityRejectCode.SPECTATOR_RESTRICTED);
    expect(error.context?.action).toBe('bet');
  });

  test('should create anti-cheat errors with severity', () => {
    const error = SecurityErrors.turnSpoofing('player1', 'player2');
    expect(error).toBeInstanceOf(AntiCheatError);
    expect(error.code).toBe(SecurityRejectCode.TURN_SPOOFING);
    expect(error.severity).toBe('critical');
  });

  test('should include timestamp', () => {
    const before = Date.now();
    const error = SecurityErrors.authenticationRequired();
    const after = Date.now();

    expect(error.timestamp).toBeGreaterThanOrEqual(before);
    expect(error.timestamp).toBeLessThanOrEqual(after);
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('Security Integration', () => {
  let registry: IdentityRegistry;
  let authManager: AuthSessionManager;
  let permissionGuard: PermissionGuard;
  let antiCheatValidator: AntiCheatValidator;
  let auditLogger: AuditLogger;

  beforeEach(() => {
    registry = resetIdentityRegistry();
    authManager = resetAuthSessionManager();
    permissionGuard = resetPermissionGuard();
    antiCheatValidator = resetAntiCheatValidator();
    auditLogger = resetAuditLogger();

    // Register providers
    authManager.registerProvider(new SimpleTokenProvider());
  });

  test('should authenticate and grant permissions', async () => {
    // Register identity
    registry.registerIdentity('alice', 'Alice');

    // Authenticate
    const session = await authManager.authenticate({
      providerId: 'simple',
      token: 'player_alice',
    });

    // Assign role
    permissionGuard.assignRole(session.playerId, Role.PLAYER);

    // Check permissions
    const context = {
      playerId: session.playerId,
      sessionId: session.sessionId,
    };

    expect(permissionGuard.hasPermission(context, Permission.PERFORM_ACTION)).toBe(true);
    expect(permissionGuard.hasPermission(context, Permission.KICK_PLAYER)).toBe(false);
  });

  test('should validate action and log audit', () => {
    const gameState = {
      tableId: 'table1',
      handId: 'hand1',
      currentTurnPlayerId: 'alice',
      currentTurnSeatIndex: 0,
      pot: 100,
      currentBet: 20,
      minRaise: 20,
      playerStacks: new Map([['alice', 1000]]),
      playerBets: new Map([['alice', 10]]),
      street: 'flop',
      turnStartedAt: Date.now() - 5000,
      turnTimeoutMs: 30000,
    };

    const context = {
      playerId: 'alice',
      sessionId: 'session1',
      tableId: 'table1',
      handId: 'hand1',
      seatIndex: 0,
      timestamp: Date.now(),
    };

    // Validate action
    const result = antiCheatValidator.validateAction(context, gameState, {
      actionType: 'raise',
      amount: 50,
    });

    expect(result.valid).toBe(true);

    // Log action
    auditLogger.logAction('alice', 'table1', 'hand1', 'raise', { amount: 50 });

    // Verify audit log
    const entries = auditLogger.getHandLog('table1', 'hand1');
    expect(entries.length).toBe(1);
    expect(entries[0].action).toBe('raise');
  });

  test('should detect and log violations', () => {
    const gameState = {
      tableId: 'table1',
      handId: 'hand1',
      currentTurnPlayerId: 'bob', // Not alice's turn
      currentTurnSeatIndex: 1,
      pot: 100,
      currentBet: 20,
      minRaise: 20,
      playerStacks: new Map([['alice', 1000], ['bob', 1000]]),
      playerBets: new Map([['alice', 10], ['bob', 20]]),
      street: 'flop',
      turnStartedAt: Date.now() - 5000,
      turnTimeoutMs: 30000,
    };

    const context = {
      playerId: 'alice',
      sessionId: 'session1',
      tableId: 'table1',
      handId: 'hand1',
      seatIndex: 0,
      timestamp: Date.now(),
    };

    // Attempt action on wrong turn
    const result = antiCheatValidator.validateAction(context, gameState, {
      actionType: 'call',
    });

    expect(result.valid).toBe(false);
    expect(result.violations.some(v => v.type === ViolationType.TURN_SPOOFING)).toBe(true);

    // Log the violation
    auditLogger.logViolation('alice', 'turn_spoofing', AuditSeverity.CRITICAL, {
      attemptedAction: 'call',
      actualTurn: 'bob',
    });

    // Verify it's in security log
    const securityLog = auditLogger.getSecurityLog();
    expect(securityLog.length).toBe(1);
  });

  test('should enforce spectator restrictions', () => {
    // Assign spectator role
    permissionGuard.assignRole('spectator1', Role.SPECTATOR);

    const context = { playerId: 'spectator1' };

    // Spectator can view
    expect(permissionGuard.hasPermission(context, Permission.VIEW_TABLE)).toBe(true);

    // Spectator cannot act
    expect(permissionGuard.hasPermission(context, Permission.PERFORM_ACTION)).toBe(false);
    expect(permissionGuard.hasPermission(context, Permission.TAKE_SEAT)).toBe(false);

    // Should throw on restricted action
    expect(() =>
      permissionGuard.requireNotSpectator(context, 'bet')
    ).toThrow(PermissionError);
  });
});
