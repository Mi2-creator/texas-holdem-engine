/**
 * Grey Recharge Reference Mapping Module
 * Phase A3 - Grey Recharge / Credit Mapping
 *
 * PUBLIC API EXPORTS
 *
 * This module provides deterministic, append-only reference mapping
 * for external recharge/credit events. All operations are REFERENCE-ONLY.
 *
 * @external This module operates OUTSIDE the frozen engine.
 * @readonly This module NEVER mutates GreyFlow or Attribution data.
 * @reference This module creates REFERENCES only, no value movement.
 * @deterministic Same inputs always produce same outputs.
 */

// ============================================================================
// TYPES
// ============================================================================

export type {
  GreyRechargeId,
  RechargeLinkId,
  ExternalReferenceId,
  GreyRechargeRecordInput,
  GreyRechargeRecord,
  RechargeLink,
  RechargeError,
  RechargeResult,
} from './GreyRechargeTypes';

export {
  GreyRechargeSource,
  GreyRechargeStatus,
  RechargeErrorCode,
  RECHARGE_VERSION,
  RECHARGE_GENESIS_HASH,
  RECHARGE_FORBIDDEN_CONCEPTS,
} from './GreyRechargeTypes';

// Type/ID factories
export {
  createGreyRechargeId,
  createRechargeLinkId,
  createExternalReferenceId,
  createRechargeError,
  rechargeSuccess,
  rechargeFailure,
} from './GreyRechargeTypes';

// Validation helpers
export {
  isValidInteger,
  isValidNonNegativeInteger,
  isValidPositiveInteger,
  isValidTimestamp,
} from './GreyRechargeTypes';

// ============================================================================
// RECHARGE REGISTRY
// ============================================================================

export type {
  AppendRechargeResult,
  ConfirmRechargeResult,
  VoidRechargeResult,
  RechargeRegistryIntegrity,
} from './GreyRechargeRegistry';

export {
  GreyRechargeRegistry,
  createGreyRechargeRegistry,
  createGreyRechargeRecord,
  transitionRechargeStatus,
} from './GreyRechargeRegistry';

// ============================================================================
// RECHARGE REFERENCES
// ============================================================================

export type {
  RechargeLinkInput,
  AppendLinkResult,
  RechargeToFlowTrace,
  FlowToRechargeTrace,
} from './GreyRechargeReference';

export {
  RechargeLinkRegistry,
  createRechargeLinkRegistry,
  createRechargeLink,
  createRechargeLinkUnchecked,
  verifyLinkChecksum,
  verifyLinkedFlowsExist,
  verifyLinkAmountConsistency,
  traceRechargeToFlows,
  traceFlowToRecharges,
} from './GreyRechargeReference';

// ============================================================================
// RECHARGE VIEWS
// ============================================================================

export type {
  RechargePeriodSummary,
  RechargePartySummary,
  RechargeTraceView,
  RechargeSourceSummary,
  LinkCoverageSummary,
} from './GreyRechargeViews';

export {
  getRechargePeriodSummary,
  getRechargePartySummary,
  getAllPartySummaries,
  getRechargeTraceView,
  getAllRechargeTraceViews,
  getRechargeSourceSummary,
  getAllSourceSummaries,
  getLinkCoverageSummary,
} from './GreyRechargeViews';

// ============================================================================
// BOUNDARY GUARDS
// ============================================================================

export {
  BALANCE_MATH_BLOCKED,
  ENGINE_IMPORT_BLOCKED,
  ATTRIBUTION_LOGIC_BLOCKED,
  SETTLEMENT_LOGIC_BLOCKED,
  GREYFLOW_MUTATION_BLOCKED,
  ATTRIBUTION_MUTATION_BLOCKED,
  IMPLICIT_TIME_BLOCKED,
  RECHARGE_BOUNDARY_GUARD_DOCUMENTATION,
  findForbiddenConcepts,
  assertNoForbiddenConcepts,
  assertInteger,
  assertNonNegativeInteger,
  assertPositiveInteger,
  assertValidTimestamp,
  validateAll,
  assertReferenceConsistency,
} from './GreyRechargeBoundaryGuards';

// ============================================================================
// MODULE DOCUMENTATION
// ============================================================================

/**
 * Grey Recharge Reference Mapping module documentation.
 */
export const GREY_RECHARGE_MODULE_INFO = Object.freeze({
  name: 'Grey Recharge Reference Mapping',
  version: '1.0.0',
  phase: 'A3',

  description: Object.freeze([
    'Deterministic, append-only reference mapping for external recharge events',
    'Links external references to GreyFlowIds without modifying GreyFlow',
    'Allows later reconciliation and auditing',
    'Future-proof for real recharge systems without enabling them',
  ]),

  guarantees: Object.freeze([
    'Deterministic - same inputs produce same outputs',
    'Reference-only - no actual value movement',
    'Append-only - records can only be added, never modified',
    'Idempotent - duplicate IDs are rejected',
    'Traceable - all references traceable to GreyFlowIds',
    'Integer-only - no floats or decimals',
    'No implicit time - all timestamps explicit',
    'Engine-safe - no engine imports or modifications',
  ]),

  restrictions: Object.freeze([
    'No payment/wallet/crypto/balance/credit/debit terminology',
    'No balance arithmetic (reference amounts only)',
    'No engine imports',
    'No GreyFlow mutations',
    'No Attribution mutations',
    'No settlement logic',
    'No attribution logic',
    'No system clock access',
    'No async operations',
    'No IO operations',
  ]),

  components: Object.freeze([
    'GreyRechargeTypes - Types, enums, error types',
    'GreyRechargeRegistry - Append-only recharge reference registry',
    'GreyRechargeReference - Immutable links to GreyFlowIds',
    'GreyRechargeViews - Read-only aggregation views',
    'GreyRechargeBoundaryGuards - Constraint enforcement',
  ]),
});
