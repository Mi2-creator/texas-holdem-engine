/**
 * Grey Reconciliation Module
 * Phase A1 - Grey Flow Reconciliation & Periodic Settlement
 *
 * PUBLIC API EXPORTS
 *
 * This module provides read-only reconciliation and settlement views
 * over GreyFlow data. All operations are deterministic and traceable.
 *
 * @external This module operates OUTSIDE the frozen engine.
 * @readonly This module NEVER mutates any state.
 * @deterministic Same inputs always produce same outputs.
 */

// ============================================================================
// TYPES
// ============================================================================

export type {
  ReconciliationPeriodId,
  SettlementSnapshotId,
  DiscrepancyReportId,
  ReconciliationPeriod,
  FlowSummary,
  SettlementTotal,
  Discrepancy,
  ReconciliationResult,
  ReconciliationError,
} from './ReconciliationTypes';

export {
  ReconciliationStatus,
  SettlementBucket,
  PeriodGranularity,
  DiscrepancyType,
  DiscrepancySeverity,
  ReconciliationErrorCode,
  RECONCILIATION_VERSION,
  RECONCILIATION_FORBIDDEN_CONCEPTS,
} from './ReconciliationTypes';

// Type/ID factories
export {
  createReconciliationPeriodId,
  createSettlementSnapshotId,
  createDiscrepancyReportId,
  createReconciliationPeriod,
  createDiscrepancy,
  createReconciliationError,
  reconciliationSuccess,
  reconciliationFailure,
} from './ReconciliationTypes';

// Validation helpers
export {
  isValidInteger,
  isValidPositiveInteger,
  isValidPeriod,
} from './ReconciliationTypes';

// ============================================================================
// RECONCILIATION ENGINE
// ============================================================================

export type {
  PeriodReconciliationResult,
} from './GreyReconciliationEngine';

export {
  reconcilePeriod,
  calculateFlowSummary,
  calculateSettlementTotal,
  calculateSettlementTotalFromFlows,
  detectDiscrepancies,
  calculateReconciliationChecksum,
  verifyReconciliationChecksum,
  compareReconciliationResults,
} from './GreyReconciliationEngine';

// ============================================================================
// SETTLEMENT SNAPSHOTS
// ============================================================================

export type {
  SettlementSnapshot,
  SettlementSnapshotInput,
  SnapshotDifference,
  SnapshotCollection,
} from './SettlementSnapshots';

export {
  SNAPSHOT_GENESIS_HASH,
  createSettlementSnapshot,
  createSnapshotsFromReconciliation,
  verifySnapshotChecksum,
  verifySnapshotChainIntegrity,
  verifySnapshotChain,
  compareSnapshots,
  getSnapshotDifferences,
  createSnapshotCollection,
} from './SettlementSnapshots';

// ============================================================================
// RECONCILIATION VIEWS
// ============================================================================

export type {
  PlatformPeriodSummary,
  ClubPeriodSummary,
  AgentPeriodSummary,
  DiscrepancyReport,
  MultiPeriodSummary,
  FlowTrace,
} from './ReconciliationViews';

export {
  getPlatformPeriodSummary,
  getClubPeriodSummary,
  getAllClubPeriodSummaries,
  getAgentPeriodSummary,
  getAllAgentPeriodSummaries,
  getDiscrepancyReport,
  getMultiPeriodSummary,
  getFlowTrace,
} from './ReconciliationViews';

// ============================================================================
// BOUNDARY GUARDS
// ============================================================================

export {
  MUTATION_BLOCKED,
  BALANCE_CONCEPT_BLOCKED,
  ENGINE_IMPORT_BLOCKED,
  IMPLICIT_TIME_BLOCKED,
  GREY_FLOW_MUTATION_BLOCKED,
  RECONCILIATION_BOUNDARY_GUARD_DOCUMENTATION,
  findForbiddenConcepts,
  assertNoForbiddenConcepts,
  assertInteger,
  assertPositiveInteger,
  assertValidTimestamp,
  assertValidPeriod,
  validateAll,
  assertNoMutationMethods,
} from './ReconciliationBoundaryGuards';

// ============================================================================
// MODULE DOCUMENTATION
// ============================================================================

/**
 * Grey Reconciliation module documentation.
 */
export const GREY_RECONCILIATION_MODULE_INFO = Object.freeze({
  name: 'Grey Flow Reconciliation & Periodic Settlement',
  version: '1.0.0',
  phase: 'A1',

  description: Object.freeze([
    'Deterministic, auditable reconciliation views over GreyFlow data',
    'Suitable for daily / weekly / monthly settlement',
    'Platform profit confirmation',
    'Club / agent payout calculation (reference-only)',
  ]),

  guarantees: Object.freeze([
    'Deterministic - same inputs produce same outputs',
    'Read-only - no mutations to any state',
    'Traceable - all outputs traceable to GreyFlowIds',
    'Integer-only - no floats or decimals',
    'No implicit time - all timestamps explicit',
    'Reproducible - snapshots can be recreated from inputs',
  ]),

  restrictions: Object.freeze([
    'No payment/wallet/crypto concepts',
    'No balance tracking (references only)',
    'No engine imports',
    'No GreyFlow mutations',
    'No system clock access',
    'No async operations',
  ]),

  components: Object.freeze([
    'ReconciliationTypes - Types, enums, error types',
    'GreyReconciliationEngine - Pure function reconciliation',
    'SettlementSnapshots - Immutable, hash-chained snapshots',
    'ReconciliationViews - Read-only aggregation views',
    'ReconciliationBoundaryGuards - Constraint enforcement',
  ]),
});
