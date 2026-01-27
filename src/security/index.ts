/**
 * Security Module
 * Phase 13 - Identity, Authentication & Anti-Cheat Trust Layer
 *
 * Provides security infrastructure for multiplayer poker.
 */

// Security errors
export {
  SecurityRejectCode,
  SecurityError,
  IdentityError,
  AuthenticationError,
  PermissionError,
  AntiCheatError,
  AuditError,
  SecurityErrors,
  SecurityRejection,
  toSecurityRejection,
} from './SecurityErrors';

// Identity management
export {
  PlayerId,
  SessionId,
  DeviceId,
  PlayerIdentity,
  IdentityBinding,
  IdentityVerificationResult,
  IdentityRegistry,
  IdentityValidator,
  getIdentityRegistry,
  resetIdentityRegistry,
} from './Identity';

// Authentication
export {
  AuthProviderId,
  TokenId,
  AuthToken,
  AuthCredentials,
  AuthResult,
  AuthProviderConfig,
  AuthProvider,
  SimpleTokenProvider,
  JWTLikeProvider,
  SecureSession,
  AuthSessionManager,
  getAuthSessionManager,
  resetAuthSessionManager,
} from './AuthSession';

// Permissions
export {
  RoomId,
  TableId,
  ClubId,
  Role,
  Permission,
  RolePermissions,
  PlayerRoleAssignment,
  PermissionContext,
  PermissionCheckResult,
  PermissionGuard,
  ActionGuardConfig,
  createActionGuard,
  getPermissionGuard,
  resetPermissionGuard,
} from './PermissionGuard';

// Anti-cheat
export {
  TableId as AntiCheatTableId,
  HandId,
  ActionContext,
  GameState,
  ActionValidation,
  ValidationResult,
  Violation,
  ViolationType,
  RateLimitConfig,
  AntiCheatConfig,
  AntiCheatValidator,
  requireValidAction,
  getAntiCheatValidator,
  resetAntiCheatValidator,
} from './AntiCheatValidator';

// Audit logging
export {
  AuditLogId,
  AuditEventType,
  AuditSeverity,
  AuditEntry,
  AuditQuery,
  AuditLogConfig,
  AuditLogger,
  AuditRecorder,
  getAuditLogger,
  resetAuditLogger,
  getAuditRecorder,
  resetAuditRecorder,
} from './AuditLog';

// Secure room authority (network integration)
export {
  SecureAuthorityConfig,
  SecureIntentResult,
  SecureRoomAuthority,
  createSecureRoomAuthority,
} from './SecureRoomAuthority';
