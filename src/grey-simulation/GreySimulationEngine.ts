/**
 * GreySimulationEngine.ts
 * Phase A6 - Grey Strategy Simulation & What-If Analysis
 *
 * SIMULATION ENGINE
 *
 * This module applies scenario overlays to existing READ-ONLY snapshots.
 * It produces simulated outputs only and NEVER writes back anything.
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
  SimulationRunId,
  SimulationStatus,
  SimulationOutput,
  SimulatedAttributionEntry,
  SimulatedHierarchyNode,
  SimulatedEntityOutcome,
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
  createSimulationRunId,
  simulationSuccess,
  simulationFailure,
  createSimulationError,
  isValidTimestamp,
  isValidBasisPoints,
  calculateChecksum,
  MAX_SIMULATION_DEPTH,
  BASIS_POINTS_100_PERCENT,
} from './GreySimulationTypes';
import { SimulationScenario, ScenarioBatch } from './GreySimulationScenario';

// ============================================================================
// INPUT SNAPSHOT TYPES
// ============================================================================

/**
 * Attribution snapshot entry (read-only input).
 */
export interface AttributionSnapshotEntry {
  readonly partyId: GreyPartyId;
  readonly partyType: GreyPartyType;
  /** Attribution percentage in basis points */
  readonly attributionBasisPoints: number;
  /** Actual amount (integer units) */
  readonly amount: number;
}

/**
 * Hierarchy snapshot node (read-only input).
 */
export interface HierarchySnapshotNode {
  readonly partyId: GreyPartyId;
  readonly partyType: GreyPartyType;
  readonly parentId: GreyPartyId | null;
  readonly children: readonly GreyPartyId[];
}

/**
 * Health snapshot entry (read-only input).
 */
export interface HealthSnapshotEntry {
  readonly entityId: GreyPartyId;
  readonly entityType: GreyPartyType;
  readonly healthScore: number;
  readonly riskScore: number;
}

/**
 * Complete snapshot for simulation input (read-only).
 */
export interface SimulationInputSnapshot {
  readonly periodId: ReconciliationPeriodId;
  readonly timestamp: number;
  /** Attribution entries */
  readonly attributions: readonly AttributionSnapshotEntry[];
  /** Hierarchy structure */
  readonly hierarchy: readonly HierarchySnapshotNode[];
  /** Health/risk scores */
  readonly healthScores: readonly HealthSnapshotEntry[];
  /** Total flow amount (integer units) */
  readonly totalFlowAmount: number;
}

/**
 * Simulation execution input.
 */
export interface SimulationExecutionInput {
  readonly scenario: SimulationScenario;
  readonly snapshot: SimulationInputSnapshot;
  readonly timestamp: number;
}

// ============================================================================
// INTERNAL MUTABLE STATE (for simulation only)
// ============================================================================

/**
 * Internal mutable attribution state for simulation.
 * This NEVER leaves the simulation sandbox.
 */
interface MutableAttributionState {
  partyId: GreyPartyId;
  partyType: GreyPartyType;
  attributionBasisPoints: number;
  amount: number;
}

/**
 * Internal mutable hierarchy state for simulation.
 * This NEVER leaves the simulation sandbox.
 */
interface MutableHierarchyState {
  partyId: GreyPartyId;
  partyType: GreyPartyType;
  parentId: GreyPartyId | null;
  children: GreyPartyId[];
  depth: number;
  throughputBasisPoints: number;
}

// ============================================================================
// SIMULATION ENGINE
// ============================================================================

/**
 * Execute a simulation for a single scenario.
 *
 * @param input - Simulation execution input
 * @returns Result with simulation output
 */
export function executeSimulation(
  input: SimulationExecutionInput
): SimulationResult<SimulationOutput> {
  // Validate timestamp
  if (!isValidTimestamp(input.timestamp)) {
    return simulationFailure(
      createSimulationError(
        SimulationErrorCode.INVALID_TIMESTAMP,
        `Invalid timestamp: ${input.timestamp}`
      )
    );
  }

  // Validate snapshot period matches scenario
  if (input.snapshot.periodId !== input.scenario.basePeriodId) {
    return simulationFailure(
      createSimulationError(
        SimulationErrorCode.INVALID_INPUT,
        'Snapshot period does not match scenario base period',
        { snapshotPeriod: input.snapshot.periodId, scenarioPeriod: input.scenario.basePeriodId }
      )
    );
  }

  try {
    // Create mutable copies for simulation (these never leave the sandbox)
    const attributionState = createMutableAttributionState(input.snapshot.attributions);
    const hierarchyState = createMutableHierarchyState(input.snapshot.hierarchy);

    // Apply adjustments in order
    for (const adjustment of input.scenario.adjustments) {
      const result = applyAdjustment(adjustment, attributionState, hierarchyState);
      if (!result.success) {
        return simulationFailure(result.error);
      }
    }

    // Recalculate hierarchy depths and throughput
    recalculateHierarchyMetrics(hierarchyState);

    // Recalculate amounts based on new attribution percentages
    recalculateAmounts(attributionState, input.snapshot.totalFlowAmount);

    // Generate simulated outputs (frozen/immutable)
    const simulatedAttributions = freezeAttributionState(attributionState);
    const simulatedHierarchy = freezeHierarchyState(hierarchyState);

    // Calculate entity outcomes
    const entityOutcomes = calculateEntityOutcomes(
      simulatedAttributions,
      input.snapshot.attributions,
      input.snapshot.healthScores
    );

    // Calculate total simulated flow
    const totalSimulatedFlow = simulatedAttributions.reduce(
      (sum, attr) => sum + attr.simulatedAmount,
      0
    );

    // Generate run ID
    const runId = createSimulationRunId(
      `run_${input.scenario.scenarioId}_${input.timestamp}`
    );

    // Calculate checksum
    const checksumData = {
      runId,
      scenarioId: input.scenario.scenarioId,
      periodId: input.snapshot.periodId,
      timestamp: input.timestamp,
      attributionCount: simulatedAttributions.length,
      totalSimulatedFlow,
    };

    const output: SimulationOutput = Object.freeze({
      runId,
      scenarioId: input.scenario.scenarioId,
      periodId: input.snapshot.periodId,
      timestamp: input.timestamp,
      status: SimulationStatus.COMPLETED,
      simulatedAttributions,
      simulatedHierarchy,
      entityOutcomes,
      totalSimulatedFlow,
      checksum: calculateChecksum('simout', checksumData),
    });

    return simulationSuccess(output);
  } catch (error) {
    return simulationFailure(
      createSimulationError(
        SimulationErrorCode.SIMULATION_FAILED,
        `Simulation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    );
  }
}

/**
 * Execute simulations for a batch of scenarios.
 */
export function executeSimulationBatch(
  batch: ScenarioBatch,
  snapshot: SimulationInputSnapshot,
  timestamp: number
): SimulationResult<readonly SimulationOutput[]> {
  if (!isValidTimestamp(timestamp)) {
    return simulationFailure(
      createSimulationError(
        SimulationErrorCode.INVALID_TIMESTAMP,
        `Invalid timestamp: ${timestamp}`
      )
    );
  }

  const outputs: SimulationOutput[] = [];
  const errors: string[] = [];

  for (const scenario of batch.scenarios) {
    const result = executeSimulation({
      scenario,
      snapshot,
      timestamp,
    });

    if (result.success) {
      outputs.push(result.value);
    } else {
      errors.push(`${scenario.scenarioId}: ${result.error.message}`);
    }
  }

  if (outputs.length === 0 && errors.length > 0) {
    return simulationFailure(
      createSimulationError(
        SimulationErrorCode.SIMULATION_FAILED,
        `All simulations failed: ${errors.join('; ')}`
      )
    );
  }

  return simulationSuccess(Object.freeze(outputs));
}

// ============================================================================
// INTERNAL HELPERS - MUTABLE STATE CREATION
// ============================================================================

/**
 * Create mutable attribution state from snapshot.
 */
function createMutableAttributionState(
  attributions: readonly AttributionSnapshotEntry[]
): Map<GreyPartyId, MutableAttributionState> {
  const state = new Map<GreyPartyId, MutableAttributionState>();

  for (const attr of attributions) {
    state.set(attr.partyId, {
      partyId: attr.partyId,
      partyType: attr.partyType,
      attributionBasisPoints: attr.attributionBasisPoints,
      amount: attr.amount,
    });
  }

  return state;
}

/**
 * Create mutable hierarchy state from snapshot.
 */
function createMutableHierarchyState(
  hierarchy: readonly HierarchySnapshotNode[]
): Map<GreyPartyId, MutableHierarchyState> {
  const state = new Map<GreyPartyId, MutableHierarchyState>();

  for (const node of hierarchy) {
    state.set(node.partyId, {
      partyId: node.partyId,
      partyType: node.partyType,
      parentId: node.parentId,
      children: [...node.children],
      depth: 0,
      throughputBasisPoints: 0,
    });
  }

  return state;
}

// ============================================================================
// INTERNAL HELPERS - ADJUSTMENT APPLICATION
// ============================================================================

/**
 * Apply a single adjustment to the simulation state.
 */
function applyAdjustment(
  adjustment: SimulationAdjustment,
  attributionState: Map<GreyPartyId, MutableAttributionState>,
  hierarchyState: Map<GreyPartyId, MutableHierarchyState>
): SimulationResult<void> {
  switch (adjustment.adjustmentType) {
    case AdjustmentType.ATTRIBUTION_PERCENTAGE:
      return applyAttributionPercentageAdjustment(
        adjustment as AttributionPercentageAdjustment,
        attributionState
      );

    case AdjustmentType.HIERARCHY_CHANGE:
      return applyHierarchyChangeAdjustment(
        adjustment as HierarchyChangeAdjustment,
        hierarchyState
      );

    case AdjustmentType.RAKE_ADJUSTMENT:
      return applyRakeAdjustment(
        adjustment as RakeAdjustment,
        attributionState
      );

    case AdjustmentType.SHARE_SPLIT:
      return applyShareSplitAdjustment(
        adjustment as ShareSplitAdjustment,
        attributionState
      );

    case AdjustmentType.ADD_PARTY:
      return applyAddPartyAdjustment(
        adjustment as AddPartyAdjustment,
        attributionState,
        hierarchyState
      );

    case AdjustmentType.REMOVE_PARTY:
      return applyRemovePartyAdjustment(
        adjustment as RemovePartyAdjustment,
        attributionState,
        hierarchyState
      );

    case AdjustmentType.CHANGE_PARTY_TYPE:
      return applyChangePartyTypeAdjustment(
        adjustment as ChangePartyTypeAdjustment,
        attributionState,
        hierarchyState
      );

    default:
      return simulationFailure(
        createSimulationError(
          SimulationErrorCode.INVALID_ADJUSTMENT,
          `Unknown adjustment type: ${(adjustment as SimulationAdjustment).adjustmentType}`
        )
      );
  }
}

/**
 * Apply attribution percentage adjustment.
 */
function applyAttributionPercentageAdjustment(
  adjustment: AttributionPercentageAdjustment,
  state: Map<GreyPartyId, MutableAttributionState>
): SimulationResult<void> {
  const entry = state.get(adjustment.partyId);
  if (!entry) {
    return simulationFailure(
      createSimulationError(
        SimulationErrorCode.ENTITY_NOT_FOUND,
        `Party not found: ${adjustment.partyId}`
      )
    );
  }

  entry.attributionBasisPoints = adjustment.newPercentageBasisPoints;
  return simulationSuccess(undefined);
}

/**
 * Apply hierarchy change adjustment.
 */
function applyHierarchyChangeAdjustment(
  adjustment: HierarchyChangeAdjustment,
  state: Map<GreyPartyId, MutableHierarchyState>
): SimulationResult<void> {
  const node = state.get(adjustment.partyId);
  if (!node) {
    return simulationFailure(
      createSimulationError(
        SimulationErrorCode.ENTITY_NOT_FOUND,
        `Party not found: ${adjustment.partyId}`
      )
    );
  }

  // Remove from old parent's children
  if (node.parentId) {
    const oldParent = state.get(node.parentId);
    if (oldParent) {
      const idx = oldParent.children.indexOf(adjustment.partyId);
      if (idx >= 0) {
        oldParent.children.splice(idx, 1);
      }
    }
  }

  // Add to new parent's children
  if (adjustment.newParentId) {
    const newParent = state.get(adjustment.newParentId);
    if (!newParent) {
      return simulationFailure(
        createSimulationError(
          SimulationErrorCode.ENTITY_NOT_FOUND,
          `New parent not found: ${adjustment.newParentId}`
        )
      );
    }

    // Check for cycle
    if (wouldCreateCycle(state, adjustment.partyId, adjustment.newParentId)) {
      return simulationFailure(
        createSimulationError(
          SimulationErrorCode.HIERARCHY_CYCLE,
          `Hierarchy change would create a cycle`
        )
      );
    }

    newParent.children.push(adjustment.partyId);
  }

  node.parentId = adjustment.newParentId;
  return simulationSuccess(undefined);
}

/**
 * Check if adding a parent relationship would create a cycle.
 */
function wouldCreateCycle(
  state: Map<GreyPartyId, MutableHierarchyState>,
  childId: GreyPartyId,
  newParentId: GreyPartyId
): boolean {
  let current: GreyPartyId | null = newParentId;
  const visited = new Set<GreyPartyId>();

  while (current) {
    if (current === childId) {
      return true;
    }
    if (visited.has(current)) {
      return true; // Already a cycle
    }
    visited.add(current);

    const node = state.get(current);
    current = node?.parentId ?? null;
  }

  return false;
}

/**
 * Apply rake adjustment.
 * Rake adjustments affect attribution by reducing the party's share.
 */
function applyRakeAdjustment(
  adjustment: RakeAdjustment,
  state: Map<GreyPartyId, MutableAttributionState>
): SimulationResult<void> {
  const entry = state.get(adjustment.entityId);
  if (!entry) {
    return simulationFailure(
      createSimulationError(
        SimulationErrorCode.ENTITY_NOT_FOUND,
        `Entity not found: ${adjustment.entityId}`
      )
    );
  }

  // Calculate the difference and apply to attribution
  const rakeDelta = adjustment.newRakeBasisPoints - adjustment.originalRakeBasisPoints;
  const newAttribution = Math.max(0, entry.attributionBasisPoints - rakeDelta);

  if (newAttribution > BASIS_POINTS_100_PERCENT) {
    return simulationFailure(
      createSimulationError(
        SimulationErrorCode.PERCENTAGE_OVERFLOW,
        `Rake adjustment would cause percentage overflow`
      )
    );
  }

  entry.attributionBasisPoints = newAttribution;
  return simulationSuccess(undefined);
}

/**
 * Apply share split adjustment.
 */
function applyShareSplitAdjustment(
  adjustment: ShareSplitAdjustment,
  state: Map<GreyPartyId, MutableAttributionState>
): SimulationResult<void> {
  const entry = state.get(adjustment.partyId);
  if (!entry) {
    return simulationFailure(
      createSimulationError(
        SimulationErrorCode.ENTITY_NOT_FOUND,
        `Party not found: ${adjustment.partyId}`
      )
    );
  }

  entry.attributionBasisPoints = adjustment.newSplitBasisPoints;
  return simulationSuccess(undefined);
}

/**
 * Apply add party adjustment.
 */
function applyAddPartyAdjustment(
  adjustment: AddPartyAdjustment,
  attributionState: Map<GreyPartyId, MutableAttributionState>,
  hierarchyState: Map<GreyPartyId, MutableHierarchyState>
): SimulationResult<void> {
  // Check if party already exists
  if (attributionState.has(adjustment.newPartyId)) {
    return simulationFailure(
      createSimulationError(
        SimulationErrorCode.INVALID_ADJUSTMENT,
        `Party already exists: ${adjustment.newPartyId}`
      )
    );
  }

  // Add to attribution state
  attributionState.set(adjustment.newPartyId, {
    partyId: adjustment.newPartyId,
    partyType: adjustment.partyType,
    attributionBasisPoints: adjustment.attributionBasisPoints,
    amount: 0,
  });

  // Add to hierarchy state
  hierarchyState.set(adjustment.newPartyId, {
    partyId: adjustment.newPartyId,
    partyType: adjustment.partyType,
    parentId: adjustment.parentId,
    children: [],
    depth: 0,
    throughputBasisPoints: 0,
  });

  // Add to parent's children if applicable
  if (adjustment.parentId) {
    const parent = hierarchyState.get(adjustment.parentId);
    if (parent) {
      parent.children.push(adjustment.newPartyId);
    }
  }

  return simulationSuccess(undefined);
}

/**
 * Apply remove party adjustment.
 */
function applyRemovePartyAdjustment(
  adjustment: RemovePartyAdjustment,
  attributionState: Map<GreyPartyId, MutableAttributionState>,
  hierarchyState: Map<GreyPartyId, MutableHierarchyState>
): SimulationResult<void> {
  const removedAttr = attributionState.get(adjustment.partyId);
  const removedNode = hierarchyState.get(adjustment.partyId);

  if (!removedAttr || !removedNode) {
    return simulationFailure(
      createSimulationError(
        SimulationErrorCode.ENTITY_NOT_FOUND,
        `Party not found: ${adjustment.partyId}`
      )
    );
  }

  // Redistribute attribution
  const removedBp = removedAttr.attributionBasisPoints;

  if (adjustment.redistributeTo === 'PROPORTIONAL') {
    // Distribute proportionally among remaining parties
    const remainingParties = [...attributionState.values()].filter(
      (p) => p.partyId !== adjustment.partyId
    );
    const totalRemainingBp = remainingParties.reduce(
      (sum, p) => sum + p.attributionBasisPoints,
      0
    );

    if (totalRemainingBp > 0) {
      for (const party of remainingParties) {
        const share = Math.floor(
          (party.attributionBasisPoints * removedBp) / totalRemainingBp
        );
        party.attributionBasisPoints += share;
      }
    }
  } else {
    // Redistribute to specific party
    const targetParty = attributionState.get(adjustment.redistributeTo);
    if (!targetParty) {
      return simulationFailure(
        createSimulationError(
          SimulationErrorCode.ENTITY_NOT_FOUND,
          `Redistribution target not found: ${adjustment.redistributeTo}`
        )
      );
    }
    targetParty.attributionBasisPoints += removedBp;
  }

  // Re-parent children to removed node's parent
  for (const childId of removedNode.children) {
    const child = hierarchyState.get(childId);
    if (child) {
      child.parentId = removedNode.parentId;
    }
  }

  // Add children to grandparent
  if (removedNode.parentId) {
    const parent = hierarchyState.get(removedNode.parentId);
    if (parent) {
      const idx = parent.children.indexOf(adjustment.partyId);
      if (idx >= 0) {
        parent.children.splice(idx, 1, ...removedNode.children);
      }
    }
  }

  // Remove from state
  attributionState.delete(adjustment.partyId);
  hierarchyState.delete(adjustment.partyId);

  return simulationSuccess(undefined);
}

/**
 * Apply change party type adjustment.
 */
function applyChangePartyTypeAdjustment(
  adjustment: ChangePartyTypeAdjustment,
  attributionState: Map<GreyPartyId, MutableAttributionState>,
  hierarchyState: Map<GreyPartyId, MutableHierarchyState>
): SimulationResult<void> {
  const attrEntry = attributionState.get(adjustment.partyId);
  const hierEntry = hierarchyState.get(adjustment.partyId);

  if (!attrEntry || !hierEntry) {
    return simulationFailure(
      createSimulationError(
        SimulationErrorCode.ENTITY_NOT_FOUND,
        `Party not found: ${adjustment.partyId}`
      )
    );
  }

  attrEntry.partyType = adjustment.newPartyType;
  hierEntry.partyType = adjustment.newPartyType;

  return simulationSuccess(undefined);
}

// ============================================================================
// INTERNAL HELPERS - RECALCULATION
// ============================================================================

/**
 * Recalculate hierarchy depths and throughput.
 */
function recalculateHierarchyMetrics(
  state: Map<GreyPartyId, MutableHierarchyState>
): void {
  // Find root nodes (no parent)
  const rootIds: GreyPartyId[] = [];
  for (const [id, node] of state) {
    if (!node.parentId) {
      rootIds.push(id);
      node.depth = 0;
    }
  }

  // BFS to calculate depths
  const queue = [...rootIds];
  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const current = state.get(currentId)!;

    for (const childId of current.children) {
      const child = state.get(childId);
      if (child) {
        child.depth = current.depth + 1;

        if (child.depth > MAX_SIMULATION_DEPTH) {
          // Truncate at max depth
          continue;
        }

        queue.push(childId);
      }
    }
  }

  // Calculate throughput (sum of all descendant attributions)
  // This is a simplification - in reality would need full attribution data
  for (const [, node] of state) {
    node.throughputBasisPoints = calculateThroughput(state, node.partyId);
  }
}

/**
 * Calculate throughput for a node (including all descendants).
 */
function calculateThroughput(
  state: Map<GreyPartyId, MutableHierarchyState>,
  nodeId: GreyPartyId
): number {
  const node = state.get(nodeId);
  if (!node) return 0;

  let throughput = 0;
  for (const childId of node.children) {
    throughput += calculateThroughput(state, childId);
  }

  return throughput;
}

/**
 * Recalculate amounts based on new attribution percentages.
 */
function recalculateAmounts(
  state: Map<GreyPartyId, MutableAttributionState>,
  totalFlow: number
): void {
  // Normalize percentages to ensure they sum to 10000 bp
  let totalBp = 0;
  for (const [, entry] of state) {
    totalBp += entry.attributionBasisPoints;
  }

  // Calculate amounts
  for (const [, entry] of state) {
    if (totalBp > 0) {
      entry.amount = Math.floor((entry.attributionBasisPoints * totalFlow) / totalBp);
    } else {
      entry.amount = 0;
    }
  }
}

// ============================================================================
// INTERNAL HELPERS - FREEZE STATE
// ============================================================================

/**
 * Freeze attribution state into immutable output.
 */
function freezeAttributionState(
  state: Map<GreyPartyId, MutableAttributionState>
): readonly SimulatedAttributionEntry[] {
  const entries: SimulatedAttributionEntry[] = [];

  for (const [, entry] of state) {
    entries.push(
      Object.freeze({
        partyId: entry.partyId,
        partyType: entry.partyType,
        attributionBasisPoints: entry.attributionBasisPoints,
        simulatedAmount: entry.amount,
      })
    );
  }

  return Object.freeze(entries);
}

/**
 * Freeze hierarchy state into immutable output.
 */
function freezeHierarchyState(
  state: Map<GreyPartyId, MutableHierarchyState>
): readonly SimulatedHierarchyNode[] {
  const nodes: SimulatedHierarchyNode[] = [];

  for (const [, node] of state) {
    nodes.push(
      Object.freeze({
        partyId: node.partyId,
        partyType: node.partyType,
        parentId: node.parentId,
        children: Object.freeze([...node.children]),
        depth: node.depth,
        throughputBasisPoints: node.throughputBasisPoints,
      })
    );
  }

  return Object.freeze(nodes);
}

/**
 * Calculate entity outcomes comparing simulated vs original.
 */
function calculateEntityOutcomes(
  simulated: readonly SimulatedAttributionEntry[],
  original: readonly AttributionSnapshotEntry[],
  healthScores: readonly HealthSnapshotEntry[]
): readonly SimulatedEntityOutcome[] {
  const outcomes: SimulatedEntityOutcome[] = [];

  // Create maps for quick lookup
  const originalMap = new Map(original.map((e) => [e.partyId, e]));
  const healthMap = new Map(healthScores.map((e) => [e.entityId, e]));

  for (const simEntry of simulated) {
    const origEntry = originalMap.get(simEntry.partyId);
    const healthEntry = healthMap.get(simEntry.partyId);

    const originalAmount = origEntry?.amount ?? 0;
    const originalHealth = healthEntry?.healthScore ?? 50;

    const deltaAmount = simEntry.simulatedAmount - originalAmount;
    const deltaBasisPoints =
      originalAmount > 0
        ? Math.floor((deltaAmount * BASIS_POINTS_100_PERCENT) / originalAmount)
        : simEntry.simulatedAmount > 0
        ? BASIS_POINTS_100_PERCENT
        : 0;

    // Simulate health change based on amount change
    // This is a simplified model - real health would need full recalculation
    const healthDelta = Math.floor(deltaBasisPoints / 200); // 5% amount change = 2.5 health point change
    const simulatedHealth = Math.max(0, Math.min(100, originalHealth + healthDelta));

    outcomes.push(
      Object.freeze({
        entityId: simEntry.partyId,
        entityType: simEntry.partyType,
        simulatedTotalReceived: simEntry.simulatedAmount,
        originalTotalReceived: originalAmount,
        deltaAmount,
        deltaBasisPoints,
        simulatedHealthScore: simulatedHealth,
        originalHealthScore: originalHealth,
      })
    );
  }

  return Object.freeze(outcomes);
}

// ============================================================================
// VERIFICATION HELPERS
// ============================================================================

/**
 * Verify simulation output integrity.
 */
export function verifySimulationOutput(
  output: SimulationOutput
): SimulationResult<boolean> {
  // Verify checksum
  const checksumData = {
    runId: output.runId,
    scenarioId: output.scenarioId,
    periodId: output.periodId,
    timestamp: output.timestamp,
    attributionCount: output.simulatedAttributions.length,
    totalSimulatedFlow: output.totalSimulatedFlow,
  };

  const expectedChecksum = calculateChecksum('simout', checksumData);

  if (output.checksum !== expectedChecksum) {
    return simulationFailure(
      createSimulationError(
        SimulationErrorCode.CHECKSUM_MISMATCH,
        `Checksum mismatch: expected ${expectedChecksum}, got ${output.checksum}`
      )
    );
  }

  // Verify totals
  const calculatedTotal = output.simulatedAttributions.reduce(
    (sum, attr) => sum + attr.simulatedAmount,
    0
  );

  if (calculatedTotal !== output.totalSimulatedFlow) {
    return simulationFailure(
      createSimulationError(
        SimulationErrorCode.SIMULATION_FAILED,
        'Total flow mismatch'
      )
    );
  }

  return simulationSuccess(true);
}

/**
 * Verify simulation reproducibility.
 */
export function verifySimulationReproducibility(
  input: SimulationExecutionInput,
  previousOutput: SimulationOutput
): SimulationResult<boolean> {
  const result = executeSimulation(input);

  if (!result.success) {
    return simulationFailure(result.error);
  }

  // Compare checksums
  if (result.value.checksum !== previousOutput.checksum) {
    return simulationFailure(
      createSimulationError(
        SimulationErrorCode.CHECKSUM_MISMATCH,
        'Simulation is not reproducible - checksums differ'
      )
    );
  }

  return simulationSuccess(true);
}
