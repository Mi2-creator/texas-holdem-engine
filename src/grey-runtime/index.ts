/**
 * Grey Flow Settlement Runtime
 * Phase A - Engine-External Value Flow Tracking
 *
 * PUBLIC API EXPORTS
 *
 * This module provides the complete public API for the grey flow runtime.
 * All operations are:
 * - Deterministic (same inputs => same outputs)
 * - Idempotent (duplicate operations rejected safely)
 * - Append-only (records can only be added)
 * - Integer-only (no floats or decimals)
 *
 * @external This module operates OUTSIDE the frozen engine.
 * @readonly Engine state is never mutated.
 */

// ============================================================================
// TYPES
// ============================================================================

export type {
  GreySessionId,
  GreyFlowId,
  GreyPartyId,
  GreyParty,
  GreyError,
  GreyResult,
  GreyTimeWindow,
} from './GreyTypes';

export {
  GreyPartyType,
  GreyFlowType,
  GreyFlowStatus,
  GreyFlowDirection,
  GreyTimeGranularity,
  GreyErrorCode,
  GREY_RUNTIME_VERSION,
  MAX_FLOW_AMOUNT,
  FORBIDDEN_CONCEPTS,
} from './GreyTypes';

// Type/ID factories
export {
  createGreySessionId,
  createGreyFlowId,
  createGreyPartyId,
  createGreyParty,
  createGreyTimeWindow,
  greySuccess,
  greyFailure,
  createGreyError,
} from './GreyTypes';

// Validation helpers
export {
  isValidInteger,
  isValidNonNegativeInteger,
  isValidPositiveInteger,
  isValidTimestamp,
} from './GreyTypes';

// ============================================================================
// FLOW RECORDS
// ============================================================================

export type {
  LinkedLedgerEntryId,
  GreyFlowRecordInput,
  GreyFlowRecord,
} from './GreyFlowRecord';

export {
  createLinkedLedgerEntryId,
  createGreyFlowRecord,
  transitionFlowStatus,
  calculateGreyChecksum,
  verifyFlowRecordChecksum,
  verifyChainIntegrity,
  GENESIS_HASH,
} from './GreyFlowRecord';

// ============================================================================
// REGISTRY
// ============================================================================

export type {
  GreySession,
  AppendFlowResult,
  ConfirmFlowResult,
  VoidFlowResult,
  RegistryIntegrityResult,
} from './GreyFlowRegistry';

export {
  GreyFlowRegistry,
  createGreyFlowRegistry,
  getGreyFlowRegistry,
  resetGreyFlowRegistry,
} from './GreyFlowRegistry';

// ============================================================================
// VIEWS
// ============================================================================

export type {
  PlatformFlowSummary,
  ClubFlowSummary,
  AgentFlowSummary,
  PlayerNetFlowSummary,
  TimeBucketFlowSummary,
  TimeBucketedFlowResult,
  GlobalFlowSummary,
} from './GreyFlowViews';

export {
  getPlatformFlowSummary,
  getClubFlowSummary,
  getAllClubFlowSummaries,
  getAgentFlowSummary,
  getAllAgentFlowSummaries,
  getPlayerNetFlowSummary,
  getAllPlayerNetFlowSummaries,
  getTimeBucketedFlowSummary,
  getGlobalFlowSummary,
} from './GreyFlowViews';

// ============================================================================
// BOUNDARY GUARDS
// ============================================================================

export {
  findForbiddenConcepts,
  assertNoForbiddenConcepts,
  assertInteger,
  assertNonNegativeInteger,
  assertPositiveInteger,
  assertValidTimestamp,
  assertNotBalanceField,
  assertNotFloat,
  validateAll,
  BALANCE_CONCEPT_BLOCKED,
  ENGINE_MUTATION_BLOCKED,
  FLOAT_DECIMAL_BLOCKED,
  ASYNC_BLOCKED,
  CLOCK_ACCESS_BLOCKED,
  BOUNDARY_GUARD_DOCUMENTATION,
} from './GreyBoundaryGuards';

// ============================================================================
// MODULE DOCUMENTATION
// ============================================================================

/**
 * Grey Flow Runtime module documentation.
 */
export const GREY_RUNTIME_MODULE_INFO = Object.freeze({
  name: 'Grey Flow Settlement Runtime',
  version: '1.0.0',
  phase: 'A',

  description: Object.freeze([
    'Records off-engine value movements as ABSTRACT REFERENCES',
    'Attributes platform profit via FLOW, not balance mutation',
    'Runs independently of any recharge system',
    'Can be connected to recharge without refactor',
  ]),

  guarantees: Object.freeze([
    'Deterministic - same inputs produce same outputs',
    'Idempotent - duplicate operations rejected safely',
    'Append-only - records can only be added',
    'Integer-only - no floats or decimals',
    'No side effects - engine state never mutated',
  ]),

  restrictions: Object.freeze([
    'No payment/wallet/crypto concepts',
    'No balance tracking (flows are references only)',
    'No engine mutation',
    'No system clock access',
    'No async operations',
  ]),

  components: Object.freeze([
    'GreyTypes - Branded IDs, enums, error types',
    'GreyFlowRecord - Immutable, hash-chained records',
    'GreyFlowRegistry - Append-only registry',
    'GreyFlowViews - Read-only aggregations',
    'GreyBoundaryGuards - Constraint enforcement',
  ]),
});
