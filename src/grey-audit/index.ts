/**
 * Grey Audit Reconciliation Loop Module
 * Phase A4 - Grey / Recharge / Attribution Reconciliation
 *
 * PUBLIC API EXPORTS
 *
 * This module provides a deterministic, replay-safe audit layer that:
 * - Correlates GreyFlowIds with GreyRechargeIds (if any) and Attribution outputs
 * - Produces reconciliation verdicts WITHOUT modifying any data
 *
 * @external This module operates OUTSIDE the frozen engine.
 * @readonly This module NEVER mutates any data.
 * @deterministic Same inputs always produce same outputs.
 */

// ============================================================================
// TYPES
// ============================================================================

export type {
  GreyAuditSessionId,
  GreyAuditRowId,
  AttributionBreakdownRef,
  GreyAuditRow,
  GreyAuditSummary,
  GreyAuditSessionInput,
  AuditError,
  AuditResult,
} from './GreyAuditTypes';

export {
  GreyAuditStatus,
  AuditFlag,
  AuditErrorCode,
  AUDIT_VERSION,
  AUDIT_GENESIS_HASH,
  AUDIT_FORBIDDEN_CONCEPTS,
} from './GreyAuditTypes';

// Type/ID factories
export {
  createGreyAuditSessionId,
  createGreyAuditRowId,
  createAuditError,
  auditSuccess,
  auditFailure,
} from './GreyAuditTypes';

// Validation helpers
export {
  isValidInteger,
  isValidNonNegativeInteger,
  isValidPositiveInteger,
  isValidTimestamp,
} from './GreyAuditTypes';

// ============================================================================
// AUDIT ENGINE
// ============================================================================

export type {
  AuditFlowData,
  AuditRechargeData,
  AuditAttributionData,
  AuditInput,
  AuditOutput,
} from './GreyAuditEngine';

export {
  runAudit,
  createAuditFlowData,
  createAuditRechargeData,
  createAuditAttributionData,
  verifyAuditReproducibility,
} from './GreyAuditEngine';

// ============================================================================
// AUDIT VIEWS
// ============================================================================

export type {
  AuditSummaryByPeriod,
  AuditSummaryByParty,
  AuditException,
  AuditExceptionList,
  AuditStatusBreakdown,
  AuditFlagBreakdown,
  FlowCorrelationTrace,
} from './GreyAuditViews';

export {
  getAuditSummaryByPeriod,
  getAuditSummaryByParty,
  getAllClubAuditSummaries,
  getAllAgentAuditSummaries,
  getAuditExceptionList,
  getAuditStatusBreakdown,
  getAuditFlagBreakdown,
  getFlowCorrelationTrace,
  getAllCorrelationTraces,
} from './GreyAuditViews';

// ============================================================================
// BOUNDARY GUARDS
// ============================================================================

export {
  BALANCE_MATH_BLOCKED,
  SETTLEMENT_LOGIC_BLOCKED,
  ATTRIBUTION_RECOMPUTATION_BLOCKED,
  ENGINE_IMPORT_BLOCKED,
  IMPLICIT_TIME_BLOCKED,
  MUTATION_BLOCKED,
  GREYFLOW_MUTATION_BLOCKED,
  RECHARGE_MUTATION_BLOCKED,
  ATTRIBUTION_MUTATION_BLOCKED,
  AUDIT_BOUNDARY_GUARD_DOCUMENTATION,
  findForbiddenConcepts,
  assertNoForbiddenConcepts,
  assertInteger,
  assertNonNegativeInteger,
  assertPositiveInteger,
  assertValidTimestamp,
  validateAll,
  assertCorrelationOnly,
} from './GreyAuditBoundaryGuards';

// ============================================================================
// MODULE DOCUMENTATION
// ============================================================================

/**
 * Grey Audit module documentation.
 */
export const GREY_AUDIT_MODULE_INFO = Object.freeze({
  name: 'Grey Audit Reconciliation Loop',
  version: '1.0.0',
  phase: 'A4',

  description: Object.freeze([
    'Deterministic, replay-safe audit layer',
    'Correlates GreyFlowIds with GreyRechargeIds and Attribution outputs',
    'Produces reconciliation verdicts without modifying data',
    'Pure correlation only - no value computation',
  ]),

  guarantees: Object.freeze([
    'Deterministic - same inputs produce same outputs',
    'Read-only - no mutations to any state',
    'Replay-safe - can be replayed with same inputs to verify',
    'Traceable - all correlations traceable to source IDs',
    'Integer-only - no floats or decimals',
    'No implicit time - all timestamps explicit',
    'Engine-safe - no engine imports or modifications',
  ]),

  restrictions: Object.freeze([
    'No payment/wallet/crypto/balance terminology',
    'No balance arithmetic (correlation only)',
    'No engine imports',
    'No GreyFlow mutations',
    'No Recharge mutations',
    'No Attribution mutations',
    'No settlement logic',
    'No attribution recomputation',
    'No system clock access',
    'No async operations',
    'No IO operations',
  ]),

  components: Object.freeze([
    'GreyAuditTypes - Types, enums, error types',
    'GreyAuditEngine - Pure function correlation engine',
    'GreyAuditViews - Read-only aggregation views',
    'GreyAuditBoundaryGuards - Constraint enforcement',
  ]),
});
