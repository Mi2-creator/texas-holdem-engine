/**
 * Invariants Module
 * Phase 25.1 - Ledger Invariants & External Boundary Guards
 *
 * This module provides:
 * 1. Ledger Invariant Guard - Validation layer for ledger invariants
 * 2. External Value Boundary - Guards against external value concepts
 *
 * Key invariants enforced:
 * I1. NON_NEGATIVE_BALANCE - No party can have negative balance
 * I2. SYSTEM_CONSERVATION - Deltas must sum to zero for closed systems
 * I3. DETERMINISTIC_REPLAY - Same inputs produce identical outputs
 * I4. APPEND_ONLY_INTEGRITY - Hash chain must be valid
 * I5. ATTRIBUTION_IMMUTABILITY - Entries cannot be modified
 *
 * Design principles:
 * - All checks are read-only (no state mutation)
 * - Fail fast with structured errors (never throw)
 * - Pure/deterministic operations
 * - Clear separation from external value systems
 */

// Violation Types
export {
  InvariantType,
  ViolationSeverity,
  NonNegativeBalanceContext,
  SystemConservationContext,
  DeterministicReplayContext,
  AppendOnlyIntegrityContext,
  AttributionImmutabilityContext,
  ViolationContext,
  SourceRef,
  InvariantViolation,
  InvariantCheckResult,
  FullInvariantCheckResult,

  // Factory functions
  resetViolationCounter,
  createNonNegativeBalanceViolation,
  createSystemConservationViolation,
  createDeterministicReplayViolation,
  createAppendOnlyIntegrityViolation,
  createAttributionImmutabilityViolation,
  createHandSourceRef,
  createBatchSourceRef,
  createEntrySourceRef,
  createPlayerSourceRef,

  // Helper functions
  isCriticalViolation,
  filterViolationsByInvariant,
  filterViolationsBySeverity,
} from './InvariantViolation';

// Invariant Specifications
export {
  InvariantSpec,
  NON_NEGATIVE_BALANCE,
  SYSTEM_CONSERVATION,
  DETERMINISTIC_REPLAY,
  APPEND_ONLY_INTEGRITY,
  ATTRIBUTION_IMMUTABILITY,
  INVARIANT_SPECS,
  getAllInvariants,
  getInvariantsByCategory,
  getOperationInvariants,
  getFullScanInvariants,
  getCriticalInvariants,
  InvariantCheckConfig,
  DEFAULT_INVARIANT_CONFIG,
  STRICT_INVARIANT_CONFIG,
  PERFORMANCE_INVARIANT_CONFIG,
} from './LedgerInvariants';

// Invariant Checker
export {
  InvariantChecker,
  createInvariantChecker,
} from './InvariantChecker';

// External Value Boundary
export {
  BoundaryViolationType,
  BoundaryViolation,
  BoundaryValidationResult,
  ExternalValueBoundary,
  createExternalValueBoundary,
  defaultBoundary,
  validateAtBoundary,
  validateSettlementAtBoundary,
} from './ExternalValueBoundary';
