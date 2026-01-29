/**
 * Grey Attribution Module
 * Phase A2 - Grey Flow Multi-Level Attribution
 *
 * PUBLIC API EXPORTS
 *
 * This module provides deterministic, multi-level revenue attribution
 * over reconciled GreyFlow data. All operations are read-only.
 *
 * @external This module operates OUTSIDE the frozen engine.
 * @readonly This module NEVER mutates any state.
 * @deterministic Same inputs always produce same outputs.
 */

// ============================================================================
// TYPES
// ============================================================================

export type {
  AttributionSnapshotId,
  AttributionRuleSetId,
  AgentHierarchyId,
  AttributionEntryId,
  AttributionRule,
  AttributionRuleSet,
  AgentHierarchyNode,
  AgentHierarchy,
  AttributionEntry,
  FlowAttributionResult,
  PeriodAttributionResult,
  AttributionError,
  AttributionResult,
} from './AttributionTypes';

export {
  AttributionPartyType,
  AttributionErrorCode,
  BASIS_POINTS_100_PERCENT,
  MAX_HIERARCHY_DEPTH,
  MAX_RULES_PER_SET,
  ATTRIBUTION_VERSION,
  ATTRIBUTION_FORBIDDEN_CONCEPTS,
} from './AttributionTypes';

// Type/ID factories
export {
  createAttributionSnapshotId,
  createAttributionRuleSetId,
  createAgentHierarchyId,
  createAttributionEntryId,
  createAttributionRule,
  createAgentHierarchyNode,
  createAttributionEntry,
  createAttributionError,
  attributionSuccess,
  attributionFailure,
} from './AttributionTypes';

// Validation helpers
export {
  isValidInteger,
  isValidNonNegativeInteger,
  isValidPositiveInteger,
  isValidBasisPoints,
  basisPointsToPercentString,
  calculateAttributedAmount,
} from './AttributionTypes';

// ============================================================================
// AGENT HIERARCHY RESOLVER
// ============================================================================

export type {
  ResolvedParentChain,
  AgentAttributionShare,
} from './AgentHierarchyResolver';

export {
  validateHierarchyIsDAG,
  validateHierarchyLevels,
  validateHierarchy,
  createAgentHierarchy,
  resolveParentChain,
  resolveAllParentChains,
  getAgentsAtLevel,
  getDirectChildren,
  getAllDescendants,
  getTopLevelAgents,
  calculateAgentChainShares,
  calculateHierarchyChecksum,
  verifyHierarchyChecksum,
} from './AgentHierarchyResolver';

// ============================================================================
// ATTRIBUTION RULE ENGINE
// ============================================================================

export type {
  PeriodAttributionInput,
} from './AttributionRuleEngine';

export {
  validateRuleSetTotal,
  createAttributionRuleSet,
  attributeFlow,
  attributeToAgentHierarchy,
  attributePeriod,
  calculateAttributionChecksum,
  verifyAttributionChecksum,
  summarizeEntriesByParty,
  summarizeEntriesByPartyType,
  getEntriesForParty,
  getEntriesForPartyType,
  verifyAttributionConservation,
  verifyPeriodConservation,
  compareAttributionResults,
} from './AttributionRuleEngine';

// ============================================================================
// ATTRIBUTION SNAPSHOTS
// ============================================================================

export type {
  PartyTypeSummary,
  PartySummary,
  AttributionSnapshot,
  AttributionSnapshotInput,
  SnapshotDifference,
  SnapshotCollection,
} from './AttributionSnapshots';

export {
  ATTRIBUTION_SNAPSHOT_GENESIS_HASH,
  calculateSnapshotChecksum,
  createAttributionSnapshot,
  createSnapshotFromAttribution,
  verifySnapshotChecksum,
  verifySnapshotChain,
  compareSnapshots,
  snapshotsAreEquivalent,
  createSnapshotCollection,
  appendToCollection,
} from './AttributionSnapshots';

// ============================================================================
// ATTRIBUTION VIEWS
// ============================================================================

export type {
  PlatformAttributionSummary,
  ClubAttributionSummary,
  AgentAttributionSummary,
  FlowAttributionBreakdown,
  PartyTypeBreakdown,
  AgentHierarchyAttributionView,
  MultiPeriodAttributionSummary,
} from './AttributionViews';

export {
  getPlatformAttributionSummary,
  getClubAttributionSummary,
  getAllClubAttributionSummaries,
  getAgentAttributionSummary,
  getAllAgentAttributionSummaries,
  getFlowAttributionBreakdown,
  getAllFlowBreakdowns,
  getAgentHierarchyAttributionView,
  getAllAgentHierarchyViews,
  getMultiPeriodSummary,
} from './AttributionViews';

// ============================================================================
// BOUNDARY GUARDS
// ============================================================================

export {
  MUTATION_BLOCKED,
  BALANCE_CONCEPT_BLOCKED,
  ENGINE_IMPORT_BLOCKED,
  RECURSIVE_ATTRIBUTION_BLOCKED,
  IMPLICIT_TIME_BLOCKED,
  GREY_DATA_MUTATION_BLOCKED,
  ATTRIBUTION_BOUNDARY_GUARD_DOCUMENTATION,
  findForbiddenConcepts,
  assertNoForbiddenConcepts,
  assertInteger,
  assertPositiveInteger,
  assertValidBasisPoints,
  validateAll,
  assertNoCyclesInChain,
  assertAmountConservation,
  assertBasisPointsSumTo100,
} from './AttributionBoundaryGuards';

// ============================================================================
// MODULE DOCUMENTATION
// ============================================================================

/**
 * Grey Attribution module documentation.
 */
export const GREY_ATTRIBUTION_MODULE_INFO = Object.freeze({
  name: 'Grey Flow Multi-Level Attribution',
  version: '1.0.0',
  phase: 'A2',

  description: Object.freeze([
    'Deterministic, auditable attribution over reconciled GreyFlow data',
    'Platform, club, and multi-level agent attribution',
    'Percentage-based rules using basis points (integer-safe)',
    'Immutable, hash-chained attribution snapshots',
  ]),

  guarantees: Object.freeze([
    'Deterministic - same inputs produce same outputs',
    'Read-only - no mutations to any state',
    'Traceable - all outputs traceable to GreyFlowIds',
    'Integer-only - no floats or decimals',
    'No implicit time - all timestamps explicit',
    'Reproducible - snapshots can be recreated from inputs',
    'Conservation - attributed amounts sum to original',
    'No cycles - agent hierarchy is always a DAG',
  ]),

  restrictions: Object.freeze([
    'No payment/wallet/crypto concepts',
    'No balance tracking (attribution shares only)',
    'No engine imports',
    'No GreyFlow mutations',
    'No Reconciliation mutations',
    'No system clock access',
    'No recursive attribution',
  ]),

  components: Object.freeze([
    'AttributionTypes - Types, enums, error types',
    'AgentHierarchyResolver - DAG validation and resolution',
    'AttributionRuleEngine - Pure function attribution',
    'AttributionSnapshots - Immutable, hash-chained snapshots',
    'AttributionViews - Read-only aggregation views',
    'AttributionBoundaryGuards - Constraint enforcement',
  ]),
});
