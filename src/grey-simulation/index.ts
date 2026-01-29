/**
 * Grey Strategy Simulation & What-If Analysis
 *
 * SANDBOX / READ-ONLY Module
 *
 * This module provides deterministic, sandboxed simulations of alternative
 * attribution/hierarchy/rake structures WITHOUT touching real GreyFlow,
 * Attribution, Recharge, or Audit data.
 *
 * Core guarantees:
 * - READ-ONLY: No data is modified or persisted
 * - SANDBOX: All operations are isolated
 * - DETERMINISTIC: Same inputs produce same outputs
 */

// ============================================================================
// TYPES
// ============================================================================

export type {
  SimulationScenarioId,
  SimulationRunId,
  ComparisonResultId,
  AttributionPercentageAdjustment,
  HierarchyChangeAdjustment,
  RakeAdjustment,
  ShareSplitAdjustment,
  AddPartyAdjustment,
  RemovePartyAdjustment,
  ChangePartyTypeAdjustment,
  SimulationAdjustment,
  SimulatedAttributionEntry,
  SimulatedHierarchyNode,
  SimulatedEntityOutcome,
  SimulationOutput,
  ComparisonMetric,
  EntityComparisonResult,
  ComparisonResult,
  ComparisonSummary,
  SimulationError,
  SimulationResult,
} from './GreySimulationTypes';

export {
  // Constants
  SIMULATION_VERSION,
  MAX_SCENARIOS_PER_BATCH,
  MAX_SIMULATION_DEPTH,
  BASIS_POINTS_100_PERCENT,
  SIMULATION_FORBIDDEN_CONCEPTS,
  // Enums (as values)
  AdjustmentType,
  ScenarioCategory,
  SimulationStatus,
  ImpactLevel,
  ComparisonDirection,
  SimulationErrorCode,
  // ID creators
  createSimulationScenarioId,
  createSimulationRunId,
  createComparisonResultId,
  // Validation helpers
  isValidInteger,
  isValidNonNegativeInteger,
  isValidPositiveInteger,
  isValidTimestamp,
  isValidBasisPoints,
  // Result helpers
  simulationSuccess,
  simulationFailure,
  createSimulationError,
  // Impact helpers
  getImpactLevel,
  // Checksum utilities
  serializeForChecksum,
  simpleHash,
  calculateChecksum,
} from './GreySimulationTypes';

// ============================================================================
// SCENARIO
// ============================================================================

export type {
  SimulationScenario,
  ScenarioBatch,
  ScenarioTemplate,
  CreateScenarioInput,
} from './GreySimulationScenario';

export {
  createScenario,
  createBaselineScenario,
  createScenarioBatch,
  createAttributionPercentageAdjustment,
  createHierarchyChangeAdjustment,
  createRakeAdjustment,
  createShareSplitAdjustment,
  createAddPartyAdjustment,
  createRemovePartyAdjustment,
  createChangePartyTypeAdjustment,
  validateAdjustment,
  hasAdjustmentType,
  getAdjustmentsByType,
  getAffectedParties,
  getScenarioTemplates,
  SCENARIO_TEMPLATES,
} from './GreySimulationScenario';

// ============================================================================
// ENGINE
// ============================================================================

export type {
  AttributionSnapshotEntry,
  HierarchySnapshotNode,
  HealthSnapshotEntry,
  SimulationInputSnapshot,
  SimulationExecutionInput,
} from './GreySimulationEngine';

export {
  executeSimulation,
  executeSimulationBatch,
  verifySimulationOutput,
  verifySimulationReproducibility,
} from './GreySimulationEngine';

// ============================================================================
// COMPARATOR
// ============================================================================

export type {
  ComparisonInput,
  MultiScenarioComparisonInput,
  ScenarioRanking,
  StabilityIndicator,
} from './GreySimulationComparator';

export {
  COMPARISON_THRESHOLDS,
} from './GreySimulationComparator';

export {
  compareRealVsSimulated,
  compareMultipleScenarios,
  rankScenariosByImprovement,
  getBestScenario,
  getWorstScenario,
  analyzeStructuralStability,
  isStructurallySafe,
} from './GreySimulationComparator';

// ============================================================================
// VIEWS
// ============================================================================

export type {
  SimulationInsightView,
  KeyFinding,
  ImpactSummary,
  RecommendationView,
  StructuralStabilityView,
  StabilityConcern,
  WhatIfSummary,
  ScenarioComparisonDashboard,
  ScenarioInsightSummary,
  CategoryBreakdown,
} from './GreySimulationViews';

export {
  generateInsightView,
  generateWhatIfSummary,
  generateStandardWhatIfs,
  generateComparisonDashboard,
  formatInsightViewForDisplay,
  formatDashboardForDisplay,
} from './GreySimulationViews';

// ============================================================================
// BOUNDARY GUARDS
// ============================================================================

export type {
  ViolationType,
  BoundaryViolation,
  BoundaryCheckResult,
} from './GreySimulationBoundaryGuards';

export {
  FORBIDDEN_PATTERNS,
  FORBIDDEN_IMPORTS,
  checkForbiddenConcepts,
  checkPersistencePatterns,
  checkMutationPatterns,
  checkExternalPatterns,
  checkImports,
  validateImmutableInput,
  validateFrozenOutput,
  runComprehensiveBoundaryCheck,
  freezeDeep,
  createReadOnlyProxy,
  assertSandboxMode,
  withSandbox,
  SIMULATION_MODULE_IDENTITY,
  getModuleIdentity,
  verifyModuleMode,
} from './GreySimulationBoundaryGuards';
