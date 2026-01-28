/**
 * Ops Module
 * Phase 31 - Production Observability, Audit & Deterministic Ops (READ-ONLY)
 *
 * This module provides production-grade observability and audit capabilities:
 * - Full system introspection
 * - Deterministic replay verification
 * - Zero state mutation
 *
 * ARCHITECTURAL GUARANTEES:
 * - Ops layer depends ONLY on: ledger/views, integrity, moderation, persistence (read-only)
 * - Ops layer may NEVER be depended on by engine/runtime
 * - All numbers traceable to ledger entries
 * - Dashboard is observational, not authoritative
 *
 * ABSOLUTE CONSTRAINTS:
 * - READ-ONLY ONLY (no writes to engine, economy, ledger, sync)
 * - No payment / wallet / crypto / transfer terminology
 * - No timers that affect game flow
 * - No background mutation jobs
 * - All outputs must be derivable from existing data
 * - Deterministic: same input → same output
 * - No side effects, no caching with mutation
 */

// ============================================================================
// Types
// ============================================================================

export {
  // Branded types
  OpsSnapshotId,
  VerificationId,
  generateOpsSnapshotId,
  generateVerificationId,
  resetOpsCounters,

  // Scope and severity
  OpsScope,
  OpsScopedEntity,
  OpsSeverity,
  OpsIssue,

  // Time range
  OpsTimeRange,
  createLastMinutesRange,
  createLastHoursRange,
  isInOpsTimeRange,

  // Cursor and pagination
  DeterministicCursor,
  createCursor,
  PaginatedResult,

  // Verification
  VerificationStatus,
  FieldDiff,
  ReplayVerificationResult,
  createMatchResult,
  createMismatchResult,
  createErrorResult,

  // Health
  HealthStatus,
  ComponentHealth,
  deriveOverallHealth,

  // Audit
  AuditSummary,
  emptyAuditSummary,

  // Invariants
  InvariantCheck,
  InvariantStatus,
  createInvariantStatus,

  // Sync metrics
  SyncLagMetrics,
  createSyncLagMetrics,

  // Query results
  OpsQueryResult,
  successOpsResult,
  failOpsResult,
} from './OpsTypes';

// ============================================================================
// Health Snapshot
// ============================================================================

export {
  // Types
  TableHealthInfo,
  SessionHealthInfo,
  SettlementHealthInfo,
  HealthSnapshot,
  HealthSnapshotDiff,

  // Input types
  TableStateInput,
  SessionStateInput,
  SettlementStateInput,
  HealthSnapshotInput,

  // Functions
  generateHealthSnapshot,
  emptyHealthSnapshotInput,
  createHealthySnapshot,
  diffHealthSnapshots,
} from './HealthSnapshot';

// ============================================================================
// Replay Verifier
// ============================================================================

export {
  // Types
  RecordedAction,
  RecordedHandData,
  ReplayedHandResult,
  BatchVerificationSummary,

  // Hash functions
  computeLedgerHash,
  computeIntegrityChecksum,

  // Verification functions
  verifyHandReplay,
  replayHand,
  verifyRecordedHand,
  verifyHandBatch,
  verifyHandsInRange,

  // View
  ReplayVerificationView,
  createReplayVerificationView,
} from './ReplayVerifier';

// ============================================================================
// Ledger Audit View
// ============================================================================

export {
  // Types
  PlatformAttributionTotals,
  ClubIsolationCheckResult,
  ClubIsolationViolation,
  AgentCommissionConsistencyResult,
  AttributionRollup,

  // View
  LedgerAuditView,
  createLedgerAuditView,
} from './LedgerAuditView';

// ============================================================================
// Integrity Status View
// ============================================================================

export {
  // Summary types
  LedgerInvariantSummary,
  IntegritySignalSummary,
  ModerationFlagSummary,
  IntegrityStatusSnapshot,

  // Input types
  LedgerInvariantInput,
  IntegritySignalInput,
  DetectionSignal,
  ModerationCaseInput,
  ModerationCaseSummary,
  IntegrityStatusInput,

  // Functions
  generateIntegrityStatus,

  // View
  IntegrityStatusView,
  createIntegrityStatusView,
  emptyIntegrityStatusInput,
} from './IntegrityStatusView';

// ============================================================================
// Ops Dashboard View
// ============================================================================

export {
  // Types
  RevenueSnapshot,
  VerificationSnapshot,
  OpsDashboardSnapshot,
  OpsDashboardQuickStats,
  OpsDashboardInput,

  // Functions
  generateOpsDashboard,

  // View
  OpsDashboardView,
  createOpsDashboardView,
  emptyOpsDashboardInput,
} from './OpsDashboardView';
