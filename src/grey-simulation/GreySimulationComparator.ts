/**
 * GreySimulationComparator.ts
 * Phase A6 - Grey Strategy Simulation & What-If Analysis
 *
 * SIMULATION COMPARATOR
 *
 * This module compares real vs simulated outcomes:
 * - Health deltas
 * - Risk score deltas
 * - Concentration changes
 * - Attribution distribution changes
 *
 * @external This module operates OUTSIDE the frozen engine.
 * @readonly This module NEVER mutates any data.
 * @sandbox This module operates in a sandboxed simulation environment.
 * @deterministic Same inputs always produce same outputs.
 */

import { GreyPartyId, GreyPartyType } from '../grey-runtime';
import { ReconciliationPeriodId } from '../grey-reconciliation';
import {
  ComparisonResultId,
  ComparisonResult,
  ComparisonMetric,
  ComparisonSummary,
  EntityComparisonResult,
  ImpactLevel,
  ComparisonDirection,
  SimulationOutput,
  SimulatedEntityOutcome,
  SimulationResult,
  SimulationErrorCode,
  createComparisonResultId,
  simulationSuccess,
  simulationFailure,
  createSimulationError,
  getImpactLevel,
  isValidTimestamp,
  calculateChecksum,
  BASIS_POINTS_100_PERCENT,
} from './GreySimulationTypes';
import { SimulationScenario } from './GreySimulationScenario';
import { SimulationInputSnapshot } from './GreySimulationEngine';

// ============================================================================
// COMPARISON THRESHOLDS
// ============================================================================

/**
 * Thresholds for determining comparison direction.
 */
export const COMPARISON_THRESHOLDS = {
  /** Minimum change to be considered improvement (basis points) */
  IMPROVEMENT_THRESHOLD: 100,
  /** Minimum change to be considered degradation (basis points) */
  DEGRADATION_THRESHOLD: -100,
  /** Significant health change threshold (points) */
  SIGNIFICANT_HEALTH_CHANGE: 5,
  /** Significant concentration change (basis points) */
  SIGNIFICANT_CONCENTRATION_CHANGE: 500,
} as const;

// ============================================================================
// COMPARISON INPUT TYPES
// ============================================================================

/**
 * Input for comparison operation.
 */
export interface ComparisonInput {
  readonly scenario: SimulationScenario;
  readonly simulationOutput: SimulationOutput;
  readonly realSnapshot: SimulationInputSnapshot;
  readonly timestamp: number;
}

/**
 * Input for multi-scenario comparison.
 */
export interface MultiScenarioComparisonInput {
  readonly scenarios: readonly SimulationScenario[];
  readonly simulationOutputs: readonly SimulationOutput[];
  readonly realSnapshot: SimulationInputSnapshot;
  readonly timestamp: number;
}

// ============================================================================
// MAIN COMPARISON FUNCTIONS
// ============================================================================

/**
 * Compare real vs simulated outcomes for a single scenario.
 */
export function compareRealVsSimulated(
  input: ComparisonInput
): SimulationResult<ComparisonResult> {
  // Validate timestamp
  if (!isValidTimestamp(input.timestamp)) {
    return simulationFailure(
      createSimulationError(
        SimulationErrorCode.INVALID_TIMESTAMP,
        `Invalid timestamp: ${input.timestamp}`
      )
    );
  }

  // Validate scenario matches simulation output
  if (input.simulationOutput.scenarioId !== input.scenario.scenarioId) {
    return simulationFailure(
      createSimulationError(
        SimulationErrorCode.INVALID_INPUT,
        'Simulation output does not match scenario'
      )
    );
  }

  // Generate entity-level comparisons
  const entityComparisons = generateEntityComparisons(
    input.simulationOutput.entityOutcomes,
    input.realSnapshot
  );

  // Generate aggregate metrics
  const aggregateMetrics = generateAggregateMetrics(
    input.simulationOutput,
    input.realSnapshot
  );

  // Generate summary
  const summary = generateComparisonSummary(entityComparisons, aggregateMetrics);

  // Generate comparison ID
  const comparisonId = createComparisonResultId(
    `cmp_${input.scenario.scenarioId}_${input.timestamp}`
  );

  // Calculate checksum
  const checksumData = {
    comparisonId,
    scenarioId: input.scenario.scenarioId,
    periodId: input.realSnapshot.periodId,
    timestamp: input.timestamp,
    entityCount: entityComparisons.length,
  };

  const result: ComparisonResult = Object.freeze({
    comparisonId,
    realPeriodId: input.realSnapshot.periodId,
    scenarioId: input.scenario.scenarioId,
    timestamp: input.timestamp,
    entityComparisons: Object.freeze(entityComparisons),
    aggregateMetrics: Object.freeze(aggregateMetrics),
    summary: Object.freeze(summary),
    checksum: calculateChecksum('cmp', checksumData),
  });

  return simulationSuccess(result);
}

/**
 * Compare multiple scenarios against real data.
 */
export function compareMultipleScenarios(
  input: MultiScenarioComparisonInput
): SimulationResult<readonly ComparisonResult[]> {
  if (!isValidTimestamp(input.timestamp)) {
    return simulationFailure(
      createSimulationError(
        SimulationErrorCode.INVALID_TIMESTAMP,
        `Invalid timestamp: ${input.timestamp}`
      )
    );
  }

  if (input.scenarios.length !== input.simulationOutputs.length) {
    return simulationFailure(
      createSimulationError(
        SimulationErrorCode.INVALID_INPUT,
        'Scenarios and outputs count mismatch'
      )
    );
  }

  const results: ComparisonResult[] = [];
  const errors: string[] = [];

  for (let i = 0; i < input.scenarios.length; i++) {
    const result = compareRealVsSimulated({
      scenario: input.scenarios[i],
      simulationOutput: input.simulationOutputs[i],
      realSnapshot: input.realSnapshot,
      timestamp: input.timestamp,
    });

    if (result.success) {
      results.push(result.value);
    } else {
      errors.push(`${input.scenarios[i].scenarioId}: ${result.error.message}`);
    }
  }

  if (results.length === 0 && errors.length > 0) {
    return simulationFailure(
      createSimulationError(
        SimulationErrorCode.SIMULATION_FAILED,
        `All comparisons failed: ${errors.join('; ')}`
      )
    );
  }

  return simulationSuccess(Object.freeze(results));
}

// ============================================================================
// ENTITY COMPARISON GENERATION
// ============================================================================

/**
 * Generate entity-level comparisons.
 */
function generateEntityComparisons(
  outcomes: readonly SimulatedEntityOutcome[],
  realSnapshot: SimulationInputSnapshot
): readonly EntityComparisonResult[] {
  const results: EntityComparisonResult[] = [];

  // Create health score map for quick lookup
  const healthMap = new Map(
    realSnapshot.healthScores.map((h) => [h.entityId, h])
  );

  for (const outcome of outcomes) {
    const healthEntry = healthMap.get(outcome.entityId);

    const metrics: ComparisonMetric[] = [];

    // Amount metric
    const amountMetric = createComparisonMetric(
      'Total Received',
      outcome.originalTotalReceived,
      outcome.simulatedTotalReceived
    );
    metrics.push(amountMetric);

    // Health score metric
    const healthMetric = createComparisonMetric(
      'Health Score',
      outcome.originalHealthScore,
      outcome.simulatedHealthScore
    );
    metrics.push(healthMetric);

    // Risk score metric (inverse of health for simplicity)
    const originalRisk = healthEntry?.riskScore ?? (100 - outcome.originalHealthScore);
    const simulatedRisk = 100 - outcome.simulatedHealthScore;
    const riskMetric = createComparisonMetric(
      'Risk Score',
      originalRisk,
      simulatedRisk
    );
    metrics.push(riskMetric);

    // Determine overall impact and direction
    const overallImpact = determineOverallImpact(metrics);
    const overallDirection = determineOverallDirection(metrics);

    results.push(
      Object.freeze({
        entityId: outcome.entityId,
        entityType: outcome.entityType,
        metrics: Object.freeze(metrics),
        overallImpact,
        overallDirection,
      })
    );
  }

  return Object.freeze(results);
}

/**
 * Create a comparison metric.
 */
function createComparisonMetric(
  metricName: string,
  realValue: number,
  simulatedValue: number
): ComparisonMetric {
  const deltaValue = simulatedValue - realValue;
  const deltaBasisPoints =
    realValue !== 0
      ? Math.floor((deltaValue * BASIS_POINTS_100_PERCENT) / Math.abs(realValue))
      : simulatedValue !== 0
      ? BASIS_POINTS_100_PERCENT
      : 0;

  const impactLevel = getImpactLevel(deltaBasisPoints);
  const direction = getComparisonDirection(deltaBasisPoints, metricName);

  return Object.freeze({
    metricName,
    realValue,
    simulatedValue,
    deltaValue,
    deltaBasisPoints,
    impactLevel,
    direction,
  });
}

/**
 * Get comparison direction for a metric.
 */
function getComparisonDirection(
  deltaBasisPoints: number,
  metricName: string
): ComparisonDirection {
  // For risk score, lower is better
  const isLowerBetter = metricName.toLowerCase().includes('risk');

  if (deltaBasisPoints > COMPARISON_THRESHOLDS.IMPROVEMENT_THRESHOLD) {
    return isLowerBetter ? ComparisonDirection.DEGRADATION : ComparisonDirection.IMPROVEMENT;
  }

  if (deltaBasisPoints < COMPARISON_THRESHOLDS.DEGRADATION_THRESHOLD) {
    return isLowerBetter ? ComparisonDirection.IMPROVEMENT : ComparisonDirection.DEGRADATION;
  }

  return ComparisonDirection.NEUTRAL;
}

/**
 * Determine overall impact from metrics.
 */
function determineOverallImpact(metrics: readonly ComparisonMetric[]): ImpactLevel {
  // Use the highest impact level among all metrics
  const impactOrder: Record<ImpactLevel, number> = {
    [ImpactLevel.MINIMAL]: 0,
    [ImpactLevel.LOW]: 1,
    [ImpactLevel.MODERATE]: 2,
    [ImpactLevel.HIGH]: 3,
    [ImpactLevel.SEVERE]: 4,
  };

  let maxImpact: ImpactLevel = ImpactLevel.MINIMAL;
  for (const metric of metrics) {
    if (impactOrder[metric.impactLevel] > impactOrder[maxImpact]) {
      maxImpact = metric.impactLevel;
    }
  }

  return maxImpact;
}

/**
 * Determine overall direction from metrics.
 */
function determineOverallDirection(
  metrics: readonly ComparisonMetric[]
): ComparisonDirection {
  let improvements = 0;
  let degradations = 0;

  for (const metric of metrics) {
    if (metric.direction === ComparisonDirection.IMPROVEMENT) {
      improvements++;
    } else if (metric.direction === ComparisonDirection.DEGRADATION) {
      degradations++;
    }
  }

  if (improvements > degradations) {
    return ComparisonDirection.IMPROVEMENT;
  }
  if (degradations > improvements) {
    return ComparisonDirection.DEGRADATION;
  }
  return ComparisonDirection.NEUTRAL;
}

// ============================================================================
// AGGREGATE METRICS GENERATION
// ============================================================================

/**
 * Generate aggregate metrics for the entire simulation.
 */
function generateAggregateMetrics(
  simulationOutput: SimulationOutput,
  realSnapshot: SimulationInputSnapshot
): readonly ComparisonMetric[] {
  const metrics: ComparisonMetric[] = [];

  // Total flow metric
  const totalFlowMetric = createComparisonMetric(
    'Total Flow',
    realSnapshot.totalFlowAmount,
    simulationOutput.totalSimulatedFlow
  );
  metrics.push(totalFlowMetric);

  // Average health metric
  const realAvgHealth = calculateAverageHealth(realSnapshot.healthScores);
  const simAvgHealth = calculateAverageSimulatedHealth(simulationOutput.entityOutcomes);
  const avgHealthMetric = createComparisonMetric(
    'Average Health',
    realAvgHealth,
    simAvgHealth
  );
  metrics.push(avgHealthMetric);

  // Concentration metric (HHI-based)
  const realConcentration = calculateConcentration(
    realSnapshot.attributions.map((a) => a.attributionBasisPoints)
  );
  const simConcentration = calculateConcentration(
    simulationOutput.simulatedAttributions.map((a) => a.attributionBasisPoints)
  );
  const concentrationMetric = createComparisonMetric(
    'Concentration (HHI)',
    realConcentration,
    simConcentration
  );
  metrics.push(concentrationMetric);

  // Entity count metric
  const entityCountMetric = createComparisonMetric(
    'Entity Count',
    realSnapshot.attributions.length,
    simulationOutput.simulatedAttributions.length
  );
  metrics.push(entityCountMetric);

  // Hierarchy depth metric
  const realMaxDepth = calculateMaxDepth(realSnapshot.hierarchy);
  const simMaxDepth = calculateMaxDepth(simulationOutput.simulatedHierarchy);
  const depthMetric = createComparisonMetric(
    'Max Hierarchy Depth',
    realMaxDepth,
    simMaxDepth
  );
  metrics.push(depthMetric);

  return Object.freeze(metrics);
}

/**
 * Calculate average health score.
 */
function calculateAverageHealth(
  healthScores: readonly { healthScore: number }[]
): number {
  if (healthScores.length === 0) return 0;
  const total = healthScores.reduce((sum, h) => sum + h.healthScore, 0);
  return Math.floor(total / healthScores.length);
}

/**
 * Calculate average simulated health score.
 */
function calculateAverageSimulatedHealth(
  outcomes: readonly SimulatedEntityOutcome[]
): number {
  if (outcomes.length === 0) return 0;
  const total = outcomes.reduce((sum, o) => sum + o.simulatedHealthScore, 0);
  return Math.floor(total / outcomes.length);
}

/**
 * Calculate concentration (HHI-like index).
 */
function calculateConcentration(basisPointsArray: readonly number[]): number {
  if (basisPointsArray.length === 0) return 0;

  const total = basisPointsArray.reduce((sum, bp) => sum + bp, 0);
  if (total === 0) return 0;

  let sumSquares = 0;
  for (const bp of basisPointsArray) {
    const share = Math.floor((bp * 10000) / total);
    sumSquares += Math.floor((share * share) / 10000);
  }

  return sumSquares;
}

/**
 * Calculate maximum hierarchy depth.
 */
function calculateMaxDepth(
  hierarchy: readonly { depth?: number; parentId?: unknown }[]
): number {
  if (hierarchy.length === 0) return 0;

  // If nodes have depth property, use it
  let hasDepth = false;
  let maxDepth = 0;
  for (const node of hierarchy) {
    if (typeof (node as { depth?: number }).depth === 'number') {
      hasDepth = true;
      const depth = (node as { depth: number }).depth;
      if (depth > maxDepth) {
        maxDepth = depth;
      }
    }
  }

  if (hasDepth) {
    return maxDepth;
  }

  // Otherwise calculate from parent relationships
  const nodeMap = new Map<unknown, { parentId?: unknown }>();
  for (const node of hierarchy) {
    const id = (node as { partyId?: unknown; nodeId?: unknown }).partyId ||
               (node as { partyId?: unknown; nodeId?: unknown }).nodeId;
    if (id !== undefined) {
      nodeMap.set(id, node);
    }
  }

  function getDepth(nodeId: unknown, visited: Set<unknown>): number {
    if (nodeId === null || nodeId === undefined) return 0;
    if (visited.has(nodeId)) return 0; // Prevent cycles
    visited.add(nodeId);

    const node = nodeMap.get(nodeId);
    if (!node) return 0;
    if (!node.parentId) return 0;

    return 1 + getDepth(node.parentId, visited);
  }

  maxDepth = 0;
  for (const node of hierarchy) {
    const id = (node as { partyId?: unknown; nodeId?: unknown }).partyId ||
               (node as { partyId?: unknown; nodeId?: unknown }).nodeId;
    if (id !== undefined) {
      const depth = getDepth(id, new Set());
      if (depth > maxDepth) {
        maxDepth = depth;
      }
    }
  }

  return maxDepth;
}

// ============================================================================
// SUMMARY GENERATION
// ============================================================================

/**
 * Generate comparison summary.
 */
function generateComparisonSummary(
  entityComparisons: readonly EntityComparisonResult[],
  aggregateMetrics: readonly ComparisonMetric[]
): ComparisonSummary {
  let entitiesImproved = 0;
  let entitiesDegraded = 0;
  let entitiesNeutral = 0;

  for (const comparison of entityComparisons) {
    switch (comparison.overallDirection) {
      case ComparisonDirection.IMPROVEMENT:
        entitiesImproved++;
        break;
      case ComparisonDirection.DEGRADATION:
        entitiesDegraded++;
        break;
      default:
        entitiesNeutral++;
    }
  }

  // Calculate health and risk deltas
  const healthMetric = aggregateMetrics.find((m) => m.metricName === 'Average Health');
  const averageHealthDelta = healthMetric?.deltaValue ?? 0;
  const averageRiskDelta = -averageHealthDelta; // Simplified inverse

  // Generate recommendation
  const recommendation = generateRecommendation(
    entitiesImproved,
    entitiesDegraded,
    averageHealthDelta,
    aggregateMetrics
  );

  return Object.freeze({
    totalEntitiesAffected: entityComparisons.length,
    entitiesImproved,
    entitiesDegraded,
    entitiesNeutral,
    averageHealthDelta,
    averageRiskDelta,
    recommendation,
  });
}

/**
 * Generate recommendation text.
 */
function generateRecommendation(
  improved: number,
  degraded: number,
  healthDelta: number,
  metrics: readonly ComparisonMetric[]
): string {
  const concentrationMetric = metrics.find(
    (m) => m.metricName === 'Concentration (HHI)'
  );

  const parts: string[] = [];

  // Health assessment
  if (healthDelta > COMPARISON_THRESHOLDS.SIGNIFICANT_HEALTH_CHANGE) {
    parts.push('Scenario improves overall system health');
  } else if (healthDelta < -COMPARISON_THRESHOLDS.SIGNIFICANT_HEALTH_CHANGE) {
    parts.push('Scenario degrades overall system health');
  } else {
    parts.push('Scenario has minimal impact on system health');
  }

  // Entity impact
  if (improved > degraded * 2) {
    parts.push('with significantly more entities benefiting');
  } else if (degraded > improved * 2) {
    parts.push('with significantly more entities negatively affected');
  } else if (improved > degraded) {
    parts.push('with more entities benefiting than harmed');
  } else if (degraded > improved) {
    parts.push('with more entities harmed than benefiting');
  }

  // Concentration assessment
  if (concentrationMetric) {
    if (
      concentrationMetric.deltaBasisPoints <
      -COMPARISON_THRESHOLDS.SIGNIFICANT_CONCENTRATION_CHANGE
    ) {
      parts.push('and reduces concentration risk');
    } else if (
      concentrationMetric.deltaBasisPoints >
      COMPARISON_THRESHOLDS.SIGNIFICANT_CONCENTRATION_CHANGE
    ) {
      parts.push('but increases concentration risk');
    }
  }

  return parts.join(', ') + '.';
}

// ============================================================================
// RANKING FUNCTIONS
// ============================================================================

/**
 * Rank scenarios by improvement potential.
 */
export interface ScenarioRanking {
  readonly scenarioId: string;
  readonly scenarioName: string;
  readonly overallScore: number;
  readonly healthImprovement: number;
  readonly entitiesImproved: number;
  readonly entitiesDegraded: number;
  readonly rank: number;
}

/**
 * Rank multiple scenarios by their improvement potential.
 */
export function rankScenariosByImprovement(
  comparisons: readonly ComparisonResult[],
  scenarios: readonly SimulationScenario[]
): readonly ScenarioRanking[] {
  const rankings: ScenarioRanking[] = [];

  // Create scenario map
  const scenarioMap = new Map(
    scenarios.map((s) => [s.scenarioId, s])
  );

  for (const comparison of comparisons) {
    const scenario = scenarioMap.get(comparison.scenarioId);
    if (!scenario) continue;

    // Calculate overall score
    // Higher is better: health improvement + (improved - degraded) / total
    const healthImprovement = comparison.summary.averageHealthDelta;
    const entityScore =
      comparison.summary.totalEntitiesAffected > 0
        ? Math.floor(
            ((comparison.summary.entitiesImproved - comparison.summary.entitiesDegraded) *
              100) /
              comparison.summary.totalEntitiesAffected
          )
        : 0;

    const overallScore = healthImprovement * 2 + entityScore;

    rankings.push({
      scenarioId: comparison.scenarioId,
      scenarioName: scenario.name,
      overallScore,
      healthImprovement,
      entitiesImproved: comparison.summary.entitiesImproved,
      entitiesDegraded: comparison.summary.entitiesDegraded,
      rank: 0, // Will be filled in after sorting
    });
  }

  // Sort by overall score (descending)
  rankings.sort((a, b) => b.overallScore - a.overallScore);

  // Assign ranks
  const rankedResults: ScenarioRanking[] = rankings.map((r, index) =>
    Object.freeze({
      ...r,
      rank: index + 1,
    })
  );

  return Object.freeze(rankedResults);
}

/**
 * Get the best scenario from a comparison.
 */
export function getBestScenario(
  comparisons: readonly ComparisonResult[],
  scenarios: readonly SimulationScenario[]
): ScenarioRanking | null {
  const rankings = rankScenariosByImprovement(comparisons, scenarios);
  return rankings.length > 0 ? rankings[0] : null;
}

/**
 * Get the worst scenario from a comparison.
 */
export function getWorstScenario(
  comparisons: readonly ComparisonResult[],
  scenarios: readonly SimulationScenario[]
): ScenarioRanking | null {
  const rankings = rankScenariosByImprovement(comparisons, scenarios);
  return rankings.length > 0 ? rankings[rankings.length - 1] : null;
}

// ============================================================================
// STABILITY ANALYSIS
// ============================================================================

/**
 * Structural stability indicator.
 */
export interface StabilityIndicator {
  readonly name: string;
  readonly currentValue: number;
  readonly simulatedValue: number;
  readonly changePercentage: number;
  readonly isStable: boolean;
  readonly concern: string | null;
}

/**
 * Analyze structural stability of a scenario.
 */
export function analyzeStructuralStability(
  comparison: ComparisonResult
): readonly StabilityIndicator[] {
  const indicators: StabilityIndicator[] = [];

  for (const metric of comparison.aggregateMetrics) {
    const changePercentage = Math.floor(metric.deltaBasisPoints / 100);
    const isStable = Math.abs(changePercentage) < 20; // <20% change is stable

    let concern: string | null = null;
    if (!isStable) {
      if (metric.metricName.includes('Concentration') && changePercentage > 0) {
        concern = 'Increased concentration may create single points of failure';
      } else if (metric.metricName.includes('Depth') && changePercentage > 0) {
        concern = 'Deeper hierarchy may slow attribution flow';
      } else if (metric.metricName.includes('Entity Count') && changePercentage < 0) {
        concern = 'Reduced entity count may concentrate risk';
      }
    }

    indicators.push(
      Object.freeze({
        name: metric.metricName,
        currentValue: metric.realValue,
        simulatedValue: metric.simulatedValue,
        changePercentage,
        isStable,
        concern,
      })
    );
  }

  return Object.freeze(indicators);
}

/**
 * Check if scenario is structurally safe.
 */
export function isStructurallySafe(
  comparison: ComparisonResult
): boolean {
  const indicators = analyzeStructuralStability(comparison);
  return indicators.every((i) => i.isStable || i.concern === null);
}
