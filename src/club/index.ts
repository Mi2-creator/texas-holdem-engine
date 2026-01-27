/**
 * Club Module
 * Phase 21 - Club & Table Authority Layer
 *
 * This module provides:
 * - Club domain model (Club, ClubMember, ClubConfig)
 * - Club management operations (ClubManager)
 * - Authorization engine for role-based access control
 * - Table authority layer enforcing all permissions
 * - Economy boundary enforcement
 *
 * Key principles:
 * - All operations go through TableAuthority
 * - Players cannot directly access GameService or EconomyRuntime
 * - All actions are authorized and auditable
 * - Rake policies are immutable during active hands
 */

// ============================================================================
// Types
// ============================================================================

export {
  // Branded types
  ClubId,
  MembershipId,
  TableAuthorityId,
  AuthorizationId,
  // Role & status
  ClubRole,
  MembershipStatus,
  TableStatus,
  // Entities
  Club,
  ClubMember,
  ClubConfig,
  ClubTable,
  LedgerVisibility,
  RakePolicyRef,
  // Authorization
  AuthorizedAction,
  AuthorizationRequest,
  AuthorizationResult,
  AuthorizationDenialReason,
  // Events
  AuthorityEvent,
  AuthorityEventType,
  // Defaults
  DEFAULT_CLUB_CONFIG,
  DEFAULT_LEDGER_VISIBILITY,
  // Utilities
  ROLE_HIERARCHY,
  hasRoleAuthority,
  generateClubId,
  generateMembershipId,
  generateTableAuthorityId,
  generateAuthorizationId,
  generateEventId,
  resetClubCounters,
} from './ClubTypes';

// ============================================================================
// Club Management
// ============================================================================

export {
  ClubManager,
  ClubOperationResult,
  ClubOperationError,
  ClubErrorCode,
  getClubManager,
  resetClubManager,
} from './ClubManager';

// ============================================================================
// Authorization Engine
// ============================================================================

export {
  AuthorizationEngine,
  AuthorizationContext,
  ActionParams,
  getAuthorizationEngine,
  resetAuthorizationEngine,
} from './AuthorizationEngine';

// ============================================================================
// Table Authority
// ============================================================================

export {
  TableAuthority,
  AuthorizedResult,
  getTableAuthority,
  resetTableAuthority,
  createTableAuthority,
} from './TableAuthority';

// ============================================================================
// Economy Boundary
// ============================================================================

export {
  ProtectedEconomyAccess,
  BoundaryInvariantChecker,
  RakePolicyGuard,
  BoundaryViolation,
  BoundaryViolationType,
  BoundaryCheckResult,
  createProtectedEconomyAccess,
  createRakePolicyGuard,
} from './EconomyBoundary';
