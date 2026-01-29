/**
 * GreySimulationScenario.ts
 * Phase A6 - Grey Strategy Simulation & What-If Analysis
 *
 * SIMULATION SCENARIO DEFINITIONS
 *
 * This module defines simulation scenario structures.
 * All types are pure data objects (no logic).
 *
 * @external This module operates OUTSIDE the frozen engine.
 * @readonly This module NEVER mutates any data.
 * @sandbox This module operates in a sandboxed simulation environment.
 * @deterministic Same inputs always produce same outputs.
 */

import { GreyPartyId, GreyPartyType } from '../grey-runtime';
import { ReconciliationPeriodId } from '../grey-reconciliation';
import {
  SimulationScenarioId,
  ScenarioCategory,
  SimulationAdjustment,
  AdjustmentType,
  AttributionPercentageAdjustment,
  HierarchyChangeAdjustment,
  RakeAdjustment,
  ShareSplitAdjustment,
  AddPartyAdjustment,
  RemovePartyAdjustment,
  ChangePartyTypeAdjustment,
  SimulationResult,
  SimulationErrorCode,
  createSimulationScenarioId,
  simulationSuccess,
  simulationFailure,
  createSimulationError,
  isValidTimestamp,
  isValidBasisPoints,
  calculateChecksum,
  MAX_SCENARIOS_PER_BATCH,
  BASIS_POINTS_100_PERCENT,
} from './GreySimulationTypes';

// ============================================================================
// SCENARIO DEFINITION
// ============================================================================

/**
 * A simulation scenario definition.
 * Pure data object describing what adjustments to simulate.
 */
export interface SimulationScenario {
  readonly scenarioId: SimulationScenarioId;
  readonly name: string;
  readonly description: string;
  readonly category: ScenarioCategory;
  readonly createdAt: number;
  /** The period to base the simulation on */
  readonly basePeriodId: ReconciliationPeriodId;
  /** Adjustments to apply in this scenario */
  readonly adjustments: readonly SimulationAdjustment[];
  /** Tags for filtering/grouping */
  readonly tags: readonly string[];
  /** Whether this is a baseline scenario (no changes) */
  readonly isBaseline: boolean;
  /** Checksum for verification */
  readonly checksum: string;
}

/**
 * A batch of scenarios for comparison.
 */
export interface ScenarioBatch {
  readonly batchId: string;
  readonly name: string;
  readonly description: string;
  readonly createdAt: number;
  readonly basePeriodId: ReconciliationPeriodId;
  readonly scenarios: readonly SimulationScenario[];
  readonly checksum: string;
}

// ============================================================================
// SCENARIO BUILDER HELPERS
// ============================================================================

/**
 * Input for creating a scenario.
 */
export interface CreateScenarioInput {
  readonly name: string;
  readonly description: string;
  readonly category: ScenarioCategory;
  readonly basePeriodId: ReconciliationPeriodId;
  readonly adjustments: readonly SimulationAdjustment[];
  readonly tags?: readonly string[];
  readonly timestamp: number;
}

/**
 * Create a simulation scenario.
 */
export function createScenario(input: CreateScenarioInput): SimulationResult<SimulationScenario> {
  // Validate timestamp
  if (!isValidTimestamp(input.timestamp)) {
    return simulationFailure(
      createSimulationError(
        SimulationErrorCode.INVALID_TIMESTAMP,
        `Invalid timestamp: ${input.timestamp}`
      )
    );
  }

  // Validate adjustments
  for (let i = 0; i < input.adjustments.length; i++) {
    const validationResult = validateAdjustment(input.adjustments[i]);
    if (!validationResult.success) {
      return simulationFailure(
        createSimulationError(
          SimulationErrorCode.INVALID_ADJUSTMENT,
          `Invalid adjustment at index ${i}: ${validationResult.error.message}`,
          { index: i, adjustment: input.adjustments[i] }
        )
      );
    }
  }

  // Generate scenario ID
  const scenarioId = createSimulationScenarioId(
    `scn_${input.basePeriodId}_${input.timestamp}_${simpleHashString(input.name)}`
  );

  // Calculate checksum
  const checksumData = {
    name: input.name,
    category: input.category,
    basePeriodId: input.basePeriodId,
    adjustmentCount: input.adjustments.length,
    timestamp: input.timestamp,
  };

  const scenario: SimulationScenario = Object.freeze({
    scenarioId,
    name: input.name,
    description: input.description,
    category: input.category,
    createdAt: input.timestamp,
    basePeriodId: input.basePeriodId,
    adjustments: Object.freeze([...input.adjustments]),
    tags: Object.freeze([...(input.tags || [])]),
    isBaseline: input.adjustments.length === 0,
    checksum: calculateChecksum('scn', checksumData),
  });

  return simulationSuccess(scenario);
}

/**
 * Simple string hash for ID generation.
 */
function simpleHashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Create a baseline scenario (no changes).
 */
export function createBaselineScenario(
  basePeriodId: ReconciliationPeriodId,
  timestamp: number
): SimulationResult<SimulationScenario> {
  return createScenario({
    name: 'Baseline',
    description: 'Current state with no changes',
    category: ScenarioCategory.EXPLORATION,
    basePeriodId,
    adjustments: [],
    tags: ['baseline'],
    timestamp,
  });
}

/**
 * Create a scenario batch.
 */
export function createScenarioBatch(
  name: string,
  description: string,
  basePeriodId: ReconciliationPeriodId,
  scenarios: readonly SimulationScenario[],
  timestamp: number
): SimulationResult<ScenarioBatch> {
  if (!isValidTimestamp(timestamp)) {
    return simulationFailure(
      createSimulationError(
        SimulationErrorCode.INVALID_TIMESTAMP,
        `Invalid timestamp: ${timestamp}`
      )
    );
  }

  if (scenarios.length === 0) {
    return simulationFailure(
      createSimulationError(
        SimulationErrorCode.INVALID_INPUT,
        'Batch must contain at least one scenario'
      )
    );
  }

  if (scenarios.length > MAX_SCENARIOS_PER_BATCH) {
    return simulationFailure(
      createSimulationError(
        SimulationErrorCode.INVALID_INPUT,
        `Batch cannot contain more than ${MAX_SCENARIOS_PER_BATCH} scenarios`
      )
    );
  }

  // Validate all scenarios use the same base period
  for (const scenario of scenarios) {
    if (scenario.basePeriodId !== basePeriodId) {
      return simulationFailure(
        createSimulationError(
          SimulationErrorCode.INVALID_INPUT,
          `Scenario ${scenario.scenarioId} has different base period`,
          { expected: basePeriodId, actual: scenario.basePeriodId }
        )
      );
    }
  }

  const batchId = `batch_${basePeriodId}_${timestamp}`;
  const checksumData = {
    name,
    basePeriodId,
    scenarioCount: scenarios.length,
    timestamp,
  };

  const batch: ScenarioBatch = Object.freeze({
    batchId,
    name,
    description,
    createdAt: timestamp,
    basePeriodId,
    scenarios: Object.freeze([...scenarios]),
    checksum: calculateChecksum('batch', checksumData),
  });

  return simulationSuccess(batch);
}

// ============================================================================
// ADJUSTMENT BUILDERS
// ============================================================================

/**
 * Create an attribution percentage adjustment.
 */
export function createAttributionPercentageAdjustment(
  partyId: GreyPartyId,
  originalPercentageBasisPoints: number,
  newPercentageBasisPoints: number,
  description?: string
): AttributionPercentageAdjustment {
  return Object.freeze({
    adjustmentType: AdjustmentType.ATTRIBUTION_PERCENTAGE,
    partyId,
    originalPercentageBasisPoints,
    newPercentageBasisPoints,
    description: description || `Change attribution from ${originalPercentageBasisPoints}bp to ${newPercentageBasisPoints}bp`,
  });
}

/**
 * Create a hierarchy change adjustment.
 */
export function createHierarchyChangeAdjustment(
  partyId: GreyPartyId,
  originalParentId: GreyPartyId | null,
  newParentId: GreyPartyId | null,
  description?: string
): HierarchyChangeAdjustment {
  return Object.freeze({
    adjustmentType: AdjustmentType.HIERARCHY_CHANGE,
    partyId,
    originalParentId,
    newParentId,
    description: description || `Change parent from ${originalParentId || 'none'} to ${newParentId || 'none'}`,
  });
}

/**
 * Create a rake adjustment.
 */
export function createRakeAdjustment(
  entityId: GreyPartyId,
  originalRakeBasisPoints: number,
  newRakeBasisPoints: number,
  description?: string
): RakeAdjustment {
  return Object.freeze({
    adjustmentType: AdjustmentType.RAKE_ADJUSTMENT,
    entityId,
    originalRakeBasisPoints,
    newRakeBasisPoints,
    description: description || `Change rake from ${originalRakeBasisPoints}bp to ${newRakeBasisPoints}bp`,
  });
}

/**
 * Create a share split adjustment.
 */
export function createShareSplitAdjustment(
  partyId: GreyPartyId,
  originalSplitBasisPoints: number,
  newSplitBasisPoints: number,
  description?: string
): ShareSplitAdjustment {
  return Object.freeze({
    adjustmentType: AdjustmentType.SHARE_SPLIT,
    partyId,
    originalSplitBasisPoints,
    newSplitBasisPoints,
    description: description || `Change split from ${originalSplitBasisPoints}bp to ${newSplitBasisPoints}bp`,
  });
}

/**
 * Create an add party adjustment.
 */
export function createAddPartyAdjustment(
  newPartyId: GreyPartyId,
  partyType: GreyPartyType,
  parentId: GreyPartyId | null,
  attributionBasisPoints: number,
  description?: string
): AddPartyAdjustment {
  return Object.freeze({
    adjustmentType: AdjustmentType.ADD_PARTY,
    newPartyId,
    partyType,
    parentId,
    attributionBasisPoints,
    description: description || `Add new ${partyType} party with ${attributionBasisPoints}bp attribution`,
  });
}

/**
 * Create a remove party adjustment.
 */
export function createRemovePartyAdjustment(
  partyId: GreyPartyId,
  redistributeTo: GreyPartyId | 'PROPORTIONAL',
  description?: string
): RemovePartyAdjustment {
  return Object.freeze({
    adjustmentType: AdjustmentType.REMOVE_PARTY,
    partyId,
    redistributeTo,
    description: description || `Remove party, redistribute to ${redistributeTo}`,
  });
}

/**
 * Create a change party type adjustment.
 */
export function createChangePartyTypeAdjustment(
  partyId: GreyPartyId,
  originalPartyType: GreyPartyType,
  newPartyType: GreyPartyType,
  description?: string
): ChangePartyTypeAdjustment {
  return Object.freeze({
    adjustmentType: AdjustmentType.CHANGE_PARTY_TYPE,
    partyId,
    originalPartyType,
    newPartyType,
    description: description || `Change type from ${originalPartyType} to ${newPartyType}`,
  });
}

// ============================================================================
// ADJUSTMENT VALIDATION
// ============================================================================

/**
 * Validate a single adjustment.
 */
export function validateAdjustment(
  adjustment: SimulationAdjustment
): SimulationResult<void> {
  switch (adjustment.adjustmentType) {
    case AdjustmentType.ATTRIBUTION_PERCENTAGE: {
      const adj = adjustment as AttributionPercentageAdjustment;
      if (!isValidBasisPoints(adj.originalPercentageBasisPoints)) {
        return simulationFailure(
          createSimulationError(
            SimulationErrorCode.INVALID_ADJUSTMENT,
            `Invalid original percentage: ${adj.originalPercentageBasisPoints}`
          )
        );
      }
      if (!isValidBasisPoints(adj.newPercentageBasisPoints)) {
        return simulationFailure(
          createSimulationError(
            SimulationErrorCode.INVALID_ADJUSTMENT,
            `Invalid new percentage: ${adj.newPercentageBasisPoints}`
          )
        );
      }
      break;
    }

    case AdjustmentType.RAKE_ADJUSTMENT: {
      const adj = adjustment as RakeAdjustment;
      if (!isValidBasisPoints(adj.originalRakeBasisPoints)) {
        return simulationFailure(
          createSimulationError(
            SimulationErrorCode.INVALID_ADJUSTMENT,
            `Invalid original rake: ${adj.originalRakeBasisPoints}`
          )
        );
      }
      if (!isValidBasisPoints(adj.newRakeBasisPoints)) {
        return simulationFailure(
          createSimulationError(
            SimulationErrorCode.INVALID_ADJUSTMENT,
            `Invalid new rake: ${adj.newRakeBasisPoints}`
          )
        );
      }
      break;
    }

    case AdjustmentType.SHARE_SPLIT: {
      const adj = adjustment as ShareSplitAdjustment;
      if (!isValidBasisPoints(adj.originalSplitBasisPoints)) {
        return simulationFailure(
          createSimulationError(
            SimulationErrorCode.INVALID_ADJUSTMENT,
            `Invalid original split: ${adj.originalSplitBasisPoints}`
          )
        );
      }
      if (!isValidBasisPoints(adj.newSplitBasisPoints)) {
        return simulationFailure(
          createSimulationError(
            SimulationErrorCode.INVALID_ADJUSTMENT,
            `Invalid new split: ${adj.newSplitBasisPoints}`
          )
        );
      }
      break;
    }

    case AdjustmentType.ADD_PARTY: {
      const adj = adjustment as AddPartyAdjustment;
      if (!isValidBasisPoints(adj.attributionBasisPoints)) {
        return simulationFailure(
          createSimulationError(
            SimulationErrorCode.INVALID_ADJUSTMENT,
            `Invalid attribution: ${adj.attributionBasisPoints}`
          )
        );
      }
      break;
    }

    case AdjustmentType.HIERARCHY_CHANGE:
    case AdjustmentType.REMOVE_PARTY:
    case AdjustmentType.CHANGE_PARTY_TYPE:
      // These adjustments have no numeric fields to validate
      break;

    default:
      return simulationFailure(
        createSimulationError(
          SimulationErrorCode.INVALID_ADJUSTMENT,
          `Unknown adjustment type: ${(adjustment as SimulationAdjustment).adjustmentType}`
        )
      );
  }

  return simulationSuccess(undefined);
}

/**
 * Check if scenario contains a specific adjustment type.
 */
export function hasAdjustmentType(
  scenario: SimulationScenario,
  adjustmentType: AdjustmentType
): boolean {
  return scenario.adjustments.some((adj) => adj.adjustmentType === adjustmentType);
}

/**
 * Get all adjustments of a specific type from a scenario.
 */
export function getAdjustmentsByType<T extends SimulationAdjustment>(
  scenario: SimulationScenario,
  adjustmentType: AdjustmentType
): readonly T[] {
  return Object.freeze(
    scenario.adjustments.filter((adj) => adj.adjustmentType === adjustmentType) as T[]
  );
}

/**
 * Get all parties affected by a scenario.
 */
export function getAffectedParties(scenario: SimulationScenario): readonly GreyPartyId[] {
  const parties = new Set<GreyPartyId>();

  for (const adjustment of scenario.adjustments) {
    switch (adjustment.adjustmentType) {
      case AdjustmentType.ATTRIBUTION_PERCENTAGE:
        parties.add((adjustment as AttributionPercentageAdjustment).partyId);
        break;
      case AdjustmentType.HIERARCHY_CHANGE: {
        const adj = adjustment as HierarchyChangeAdjustment;
        parties.add(adj.partyId);
        if (adj.originalParentId) parties.add(adj.originalParentId);
        if (adj.newParentId) parties.add(adj.newParentId);
        break;
      }
      case AdjustmentType.RAKE_ADJUSTMENT:
        parties.add((adjustment as RakeAdjustment).entityId);
        break;
      case AdjustmentType.SHARE_SPLIT:
        parties.add((adjustment as ShareSplitAdjustment).partyId);
        break;
      case AdjustmentType.ADD_PARTY: {
        const adj = adjustment as AddPartyAdjustment;
        parties.add(adj.newPartyId);
        if (adj.parentId) parties.add(adj.parentId);
        break;
      }
      case AdjustmentType.REMOVE_PARTY: {
        const adj = adjustment as RemovePartyAdjustment;
        parties.add(adj.partyId);
        if (adj.redistributeTo !== 'PROPORTIONAL') {
          parties.add(adj.redistributeTo);
        }
        break;
      }
      case AdjustmentType.CHANGE_PARTY_TYPE:
        parties.add((adjustment as ChangePartyTypeAdjustment).partyId);
        break;
    }
  }

  return Object.freeze([...parties]);
}

// ============================================================================
// SCENARIO TEMPLATES
// ============================================================================

/**
 * Template for common scenario patterns.
 */
export interface ScenarioTemplate {
  readonly templateId: string;
  readonly name: string;
  readonly description: string;
  readonly category: ScenarioCategory;
  readonly defaultTags: readonly string[];
  /** Function to generate adjustments from parameters */
  readonly parameterDescriptions: readonly string[];
}

/**
 * Built-in scenario templates.
 */
export const SCENARIO_TEMPLATES = {
  /** Reduce agent rake by X% */
  REDUCE_AGENT_RAKE: Object.freeze({
    templateId: 'reduce_agent_rake',
    name: 'Reduce Agent Rake',
    description: 'Simulate the effect of reducing agent rake percentages',
    category: ScenarioCategory.OPTIMIZATION,
    defaultTags: ['rake', 'agent', 'optimization'],
    parameterDescriptions: ['agentId', 'reductionBasisPoints'],
  } as ScenarioTemplate),

  /** Flatten hierarchy by removing one level */
  FLATTEN_HIERARCHY: Object.freeze({
    templateId: 'flatten_hierarchy',
    name: 'Flatten Hierarchy',
    description: 'Simulate removing an intermediate hierarchy level',
    category: ScenarioCategory.STRUCTURAL,
    defaultTags: ['hierarchy', 'structure'],
    parameterDescriptions: ['levelToRemove'],
  } as ScenarioTemplate),

  /** Redistribute attribution evenly */
  EQUAL_ATTRIBUTION: Object.freeze({
    templateId: 'equal_attribution',
    name: 'Equal Attribution',
    description: 'Simulate equal attribution distribution among parties',
    category: ScenarioCategory.EXPLORATION,
    defaultTags: ['attribution', 'distribution'],
    parameterDescriptions: ['partyIds'],
  } as ScenarioTemplate),

  /** Stress test with doubled rake */
  DOUBLE_RAKE_STRESS: Object.freeze({
    templateId: 'double_rake_stress',
    name: 'Double Rake Stress Test',
    description: 'Simulate the impact of doubling all rake percentages',
    category: ScenarioCategory.STRESS_TEST,
    defaultTags: ['rake', 'stress', 'test'],
    parameterDescriptions: [],
  } as ScenarioTemplate),

  /** Add new sub-agent */
  ADD_SUB_AGENT: Object.freeze({
    templateId: 'add_sub_agent',
    name: 'Add Sub-Agent',
    description: 'Simulate adding a new sub-agent to the hierarchy',
    category: ScenarioCategory.STRUCTURAL,
    defaultTags: ['agent', 'hierarchy', 'add'],
    parameterDescriptions: ['parentAgentId', 'newAgentId', 'attributionBasisPoints'],
  } as ScenarioTemplate),
} as const;

/**
 * Get all available scenario templates.
 */
export function getScenarioTemplates(): readonly ScenarioTemplate[] {
  return Object.freeze(Object.values(SCENARIO_TEMPLATES));
}
