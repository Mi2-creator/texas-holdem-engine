/**
 * SecurityErrors.ts
 * Phase 13 - Security error codes and error classes
 *
 * Defines rejection codes and typed errors for security violations.
 */

// ============================================================================
// Security Rejection Codes
// ============================================================================

export enum SecurityRejectCode {
  // Identity errors (1000-1099)
  INVALID_PLAYER_ID = 1000,
  PLAYER_ID_MISMATCH = 1001,
  PLAYER_NOT_FOUND = 1002,
  DUPLICATE_PLAYER_ID = 1003,

  // Session errors (1100-1199)
  INVALID_SESSION = 1100,
  SESSION_EXPIRED = 1101,
  SESSION_MISMATCH = 1102,
  SESSION_HIJACK_DETECTED = 1103,
  SESSION_ALREADY_EXISTS = 1104,

  // Authentication errors (1200-1299)
  AUTHENTICATION_REQUIRED = 1200,
  AUTHENTICATION_FAILED = 1201,
  INVALID_TOKEN = 1202,
  TOKEN_EXPIRED = 1203,
  INVALID_SIGNATURE = 1204,
  PROVIDER_ERROR = 1205,

  // Permission errors (1300-1399)
  PERMISSION_DENIED = 1300,
  INSUFFICIENT_ROLE = 1301,
  ACTION_NOT_ALLOWED = 1302,
  SPECTATOR_RESTRICTED = 1303,
  OWNER_ONLY = 1304,
  ADMIN_ONLY = 1305,

  // Anti-cheat errors (1400-1499)
  TURN_SPOOFING = 1400,
  TIMING_VIOLATION = 1401,
  SEQUENCE_REPLAY = 1402,
  STACK_MANIPULATION = 1403,
  BET_MANIPULATION = 1404,
  CARD_MANIPULATION = 1405,
  RATE_LIMIT_EXCEEDED = 1406,
  SUSPICIOUS_ACTIVITY = 1407,

  // Audit errors (1500-1599)
  AUDIT_FAILURE = 1500,
  INTEGRITY_VIOLATION = 1501,
}

// ============================================================================
// Base Security Error
// ============================================================================

export class SecurityError extends Error {
  readonly code: SecurityRejectCode;
  readonly timestamp: number;
  readonly context?: Record<string, unknown>;

  constructor(
    code: SecurityRejectCode,
    message: string,
    context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'SecurityError';
    this.code = code;
    this.timestamp = Date.now();
    this.context = context;
  }
}

// ============================================================================
// Specific Error Classes
// ============================================================================

export class IdentityError extends SecurityError {
  constructor(
    code: SecurityRejectCode,
    message: string,
    context?: Record<string, unknown>
  ) {
    super(code, message, context);
    this.name = 'IdentityError';
  }
}

export class AuthenticationError extends SecurityError {
  constructor(
    code: SecurityRejectCode,
    message: string,
    context?: Record<string, unknown>
  ) {
    super(code, message, context);
    this.name = 'AuthenticationError';
  }
}

export class PermissionError extends SecurityError {
  constructor(
    code: SecurityRejectCode,
    message: string,
    context?: Record<string, unknown>
  ) {
    super(code, message, context);
    this.name = 'PermissionError';
  }
}

export class AntiCheatError extends SecurityError {
  readonly severity: 'warning' | 'violation' | 'critical';

  constructor(
    code: SecurityRejectCode,
    message: string,
    severity: 'warning' | 'violation' | 'critical' = 'violation',
    context?: Record<string, unknown>
  ) {
    super(code, message, context);
    this.name = 'AntiCheatError';
    this.severity = severity;
  }
}

export class AuditError extends SecurityError {
  constructor(
    code: SecurityRejectCode,
    message: string,
    context?: Record<string, unknown>
  ) {
    super(code, message, context);
    this.name = 'AuditError';
  }
}

// ============================================================================
// Error Factory
// ============================================================================

export const SecurityErrors = {
  // Identity errors
  invalidPlayerId: (playerId: string) =>
    new IdentityError(
      SecurityRejectCode.INVALID_PLAYER_ID,
      `Invalid player ID: ${playerId}`,
      { playerId }
    ),

  playerIdMismatch: (expected: string, received: string) =>
    new IdentityError(
      SecurityRejectCode.PLAYER_ID_MISMATCH,
      `Player ID mismatch: expected ${expected}, got ${received}`,
      { expected, received }
    ),

  playerNotFound: (playerId: string) =>
    new IdentityError(
      SecurityRejectCode.PLAYER_NOT_FOUND,
      `Player not found: ${playerId}`,
      { playerId }
    ),

  duplicatePlayerId: (playerId: string) =>
    new IdentityError(
      SecurityRejectCode.DUPLICATE_PLAYER_ID,
      `Duplicate player ID: ${playerId}`,
      { playerId }
    ),

  // Session errors
  invalidSession: (sessionId: string) =>
    new IdentityError(
      SecurityRejectCode.INVALID_SESSION,
      `Invalid session: ${sessionId}`,
      { sessionId }
    ),

  sessionExpired: (sessionId: string) =>
    new IdentityError(
      SecurityRejectCode.SESSION_EXPIRED,
      `Session expired: ${sessionId}`,
      { sessionId }
    ),

  sessionMismatch: (expected: string, received: string) =>
    new IdentityError(
      SecurityRejectCode.SESSION_MISMATCH,
      `Session mismatch: expected ${expected}, got ${received}`,
      { expected, received }
    ),

  sessionHijackDetected: (sessionId: string, reason: string) =>
    new IdentityError(
      SecurityRejectCode.SESSION_HIJACK_DETECTED,
      `Session hijack detected: ${reason}`,
      { sessionId, reason }
    ),

  sessionAlreadyExists: (playerId: string) =>
    new IdentityError(
      SecurityRejectCode.SESSION_ALREADY_EXISTS,
      `Session already exists for player: ${playerId}`,
      { playerId }
    ),

  // Authentication errors
  authenticationRequired: () =>
    new AuthenticationError(
      SecurityRejectCode.AUTHENTICATION_REQUIRED,
      'Authentication required'
    ),

  authenticationFailed: (reason: string) =>
    new AuthenticationError(
      SecurityRejectCode.AUTHENTICATION_FAILED,
      `Authentication failed: ${reason}`,
      { reason }
    ),

  invalidToken: (reason?: string) =>
    new AuthenticationError(
      SecurityRejectCode.INVALID_TOKEN,
      `Invalid token${reason ? `: ${reason}` : ''}`,
      { reason }
    ),

  tokenExpired: () =>
    new AuthenticationError(
      SecurityRejectCode.TOKEN_EXPIRED,
      'Token has expired'
    ),

  invalidSignature: () =>
    new AuthenticationError(
      SecurityRejectCode.INVALID_SIGNATURE,
      'Invalid signature'
    ),

  providerError: (provider: string, error: string) =>
    new AuthenticationError(
      SecurityRejectCode.PROVIDER_ERROR,
      `Auth provider error (${provider}): ${error}`,
      { provider, error }
    ),

  // Permission errors
  permissionDenied: (action: string, reason?: string) =>
    new PermissionError(
      SecurityRejectCode.PERMISSION_DENIED,
      `Permission denied for action: ${action}${reason ? ` (${reason})` : ''}`,
      { action, reason }
    ),

  insufficientRole: (required: string, actual: string) =>
    new PermissionError(
      SecurityRejectCode.INSUFFICIENT_ROLE,
      `Insufficient role: required ${required}, have ${actual}`,
      { required, actual }
    ),

  actionNotAllowed: (action: string, state: string) =>
    new PermissionError(
      SecurityRejectCode.ACTION_NOT_ALLOWED,
      `Action ${action} not allowed in state: ${state}`,
      { action, state }
    ),

  spectatorRestricted: (action: string) =>
    new PermissionError(
      SecurityRejectCode.SPECTATOR_RESTRICTED,
      `Spectators cannot perform action: ${action}`,
      { action }
    ),

  ownerOnly: (action: string) =>
    new PermissionError(
      SecurityRejectCode.OWNER_ONLY,
      `Action ${action} is restricted to owners only`,
      { action }
    ),

  adminOnly: (action: string) =>
    new PermissionError(
      SecurityRejectCode.ADMIN_ONLY,
      `Action ${action} is restricted to admins only`,
      { action }
    ),

  // Anti-cheat errors
  turnSpoofing: (playerId: string, actualTurnPlayerId: string) =>
    new AntiCheatError(
      SecurityRejectCode.TURN_SPOOFING,
      `Turn spoofing detected: ${playerId} acted during ${actualTurnPlayerId}'s turn`,
      'critical',
      { playerId, actualTurnPlayerId }
    ),

  timingViolation: (playerId: string, elapsed: number, allowed: number) =>
    new AntiCheatError(
      SecurityRejectCode.TIMING_VIOLATION,
      `Timing violation: action after ${elapsed}ms (allowed: ${allowed}ms)`,
      'warning',
      { playerId, elapsed, allowed }
    ),

  sequenceReplay: (sequence: number, lastSeen: number) =>
    new AntiCheatError(
      SecurityRejectCode.SEQUENCE_REPLAY,
      `Sequence replay detected: ${sequence} already processed (last: ${lastSeen})`,
      'critical',
      { sequence, lastSeen }
    ),

  stackManipulation: (playerId: string, claimed: number, actual: number) =>
    new AntiCheatError(
      SecurityRejectCode.STACK_MANIPULATION,
      `Stack manipulation detected: claimed ${claimed}, actual ${actual}`,
      'critical',
      { playerId, claimed, actual }
    ),

  betManipulation: (playerId: string, claimed: number, valid: { min: number; max: number }) =>
    new AntiCheatError(
      SecurityRejectCode.BET_MANIPULATION,
      `Bet manipulation detected: ${claimed} not in valid range [${valid.min}, ${valid.max}]`,
      'violation',
      { playerId, claimed, valid }
    ),

  cardManipulation: (playerId: string, reason: string) =>
    new AntiCheatError(
      SecurityRejectCode.CARD_MANIPULATION,
      `Card manipulation detected: ${reason}`,
      'critical',
      { playerId, reason }
    ),

  rateLimitExceeded: (playerId: string, limit: number, window: number) =>
    new AntiCheatError(
      SecurityRejectCode.RATE_LIMIT_EXCEEDED,
      `Rate limit exceeded: ${limit} actions per ${window}ms`,
      'warning',
      { playerId, limit, window }
    ),

  suspiciousActivity: (playerId: string, reason: string) =>
    new AntiCheatError(
      SecurityRejectCode.SUSPICIOUS_ACTIVITY,
      `Suspicious activity detected: ${reason}`,
      'violation',
      { playerId, reason }
    ),

  // Audit errors
  auditFailure: (reason: string) =>
    new AuditError(
      SecurityRejectCode.AUDIT_FAILURE,
      `Audit logging failed: ${reason}`,
      { reason }
    ),

  integrityViolation: (expected: string, actual: string) =>
    new AuditError(
      SecurityRejectCode.INTEGRITY_VIOLATION,
      `Integrity violation: hash mismatch`,
      { expected, actual }
    ),
};

// ============================================================================
// Security Rejection Response
// ============================================================================

export interface SecurityRejection {
  readonly code: SecurityRejectCode;
  readonly message: string;
  readonly timestamp: number;
  readonly context?: Record<string, unknown>;
}

export function toSecurityRejection(error: SecurityError): SecurityRejection {
  return {
    code: error.code,
    message: error.message,
    timestamp: error.timestamp,
    context: error.context,
  };
}
