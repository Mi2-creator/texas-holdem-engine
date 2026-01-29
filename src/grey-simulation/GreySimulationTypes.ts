/**
 * GreySimulationTypes.ts
 * Phase A6 - Grey Strategy Simulation & What-If Analysis
 *
 * CORE TYPES AND ENUMS
 *
 * This module defines types for the simulation/what-if analysis layer.
 * All operations are READ-ONLY, SANDBOXED, and DETERMINISTIC.
 *
 * @external This module operates OUTSIDE the frozen engine.
 * @readonly This module NEVER mutates any data.
 * @sandbox This module operates in a sandboxed simulation environment.
 * @deterministic Same inputs always produce same outputs.
 */

import { GreyPartyId, GreyPartyType } from '../grey-runtime';
import { ReconciliationPeriodId } from '../grey-reconciliation';

// ============================================================================
// VERSION AND CONSTANTS
// ============================================================================

/**
 * Simulation module version.
 */
export const SIMULATION_VERSION = '1.0.0' as const;

/**
 * Maximum number of scenarios in a batch simulation.
 */
export const MAX_SCENARIOS_PER_BATCH = 100 as const;

/**
 * Maximum simulation depth (nested hierarchy levels).
 */
export const MAX_SIMULATION_DEPTH = 10 as const;

/**
 * Basis points constant (100% = 10000 bp).
 */
export const BASIS_POINTS_100_PERCENT = 10000 as const;

/**
 * Forbidden concepts in simulation module.
 */
export const SIMULATION_FORBIDDEN_CONCEPTS = Object.freeze([
  'payment',
  'wallet',
  'crypto',
  'blockchain',
  'usdt',
  'transfer',
  'deposit',
  'withdraw',
  'balance',
  'credit',
  'debit',
  'transaction',
  'settle',
  'payout',
  'persist',
  'save',
  'store',
  'write',
  'update',
  'delete',
  'insert',
]) as readonly string[];

// ============================================================================
// BRANDED ID TYPES
// ============================================================================

/**
 * Unique identifier for a simulation scenario.
 */
export type SimulationScenarioId = string & { readonly __brand: 'SimulationScenarioId' };

/**
 * Unique identifier for a simulation run.
 */
export type SimulationRunId = string & { readonly __brand: 'SimulationRunId' };

/**
 * Unique identifier for a comparison result.
 */
export type ComparisonResultId = string & { readonly __brand: 'ComparisonResultId' };

/**
 * Create a SimulationScenarioId.
 */
export function createSimulationScenarioId(id: string): SimulationScenarioId {
  return id as SimulationScenarioId;
}

/**
 * Create a SimulationRunId.
 */
export function createSimulationRunId(id: string): SimulationRunId {
  return id as SimulationRunId;
}

/**
 * Create a ComparisonResultId.
 */
export function createComparisonResultId(id: string): ComparisonResultId {
  return id as ComparisonResultId;
}

// ============================================================================
// SCENARIO PARAMETER TYPES
// ============================================================================

/**
 * Types of adjustments that can be simulated.
 */
export const AdjustmentType = {
  /** Modify attribution percentage for a party */
  ATTRIBUTION_PERCENTAGE: 'ATTRIBUTION_PERCENTAGE',
  /** Change agent hierarchy structure */
  HIERARCHY_CHANGE: 'HIERARCHY_CHANGE',
  /** Adjust rake percentage */
  RAKE_ADJUSTMENT: 'RAKE_ADJUSTMENT',
  /** Modify share split ratios */
  SHARE_SPLIT: 'SHARE_SPLIT',
  /** Add new party to hierarchy */
  ADD_PARTY: 'ADD_PARTY',
  /** Remove party from hierarchy */
  REMOVE_PARTY: 'REMOVE_PARTY',
  /** Change party type */
  CHANGE_PARTY_TYPE: 'CHANGE_PARTY_TYPE',
} as const;

export type AdjustmentType = (typeof AdjustmentType)[keyof typeof AdjustmentType];

/**
 * Scenario category for classification.
 */
export const ScenarioCategory = {
  /** Optimization scenarios */
  OPTIMIZATION: 'OPTIMIZATION',
  /** Risk reduction scenarios */
  RISK_REDUCTION: 'RISK_REDUCTION',
  /** Structural change scenarios */
  STRUCTURAL: 'STRUCTURAL',
  /** What-if exploration */
  EXPLORATION: 'EXPLORATION',
  /** Stress testing */
  STRESS_TEST: 'STRESS_TEST',
} as const;

export type ScenarioCategory = (typeof ScenarioCategory)[keyof typeof ScenarioCategory];

/**
 * Simulation status.
 */
export const SimulationStatus = {
  /** Simulation is pending */
  PENDING: 'PENDING',
  /** Simulation is running */
  RUNNING: 'RUNNING',
  /** Simulation completed successfully */
  COMPLETED: 'COMPLETED',
  /** Simulation failed */
  FAILED: 'FAILED',
} as const;

export type SimulationStatus = (typeof SimulationStatus)[keyof typeof SimulationStatus];

// ============================================================================
// ADJUSTMENT DEFINITIONS
// ============================================================================

/**
 * Base adjustment interface.
 */
export interface BaseAdjustment {
  readonly adjustmentType: AdjustmentType;
  readonly description: string;
}

/**
 * Attribution percentage adjustment.
 */
export interface AttributionPercentageAdjustment extends BaseAdjustment {
  readonly adjustmentType: typeof AdjustmentType.ATTRIBUTION_PERCENTAGE;
  readonly partyId: GreyPartyId;
  /** New percentage in basis points (0-10000) */
  readonly newPercentageBasisPoints: number;
  /** Original percentage in basis points (for reference) */
  readonly originalPercentageBasisPoints: number;
}

/**
 * Hierarchy change adjustment.
 */
export interface HierarchyChangeAdjustment extends BaseAdjustment {
  readonly adjustmentType: typeof AdjustmentType.HIERARCHY_CHANGE;
  readonly partyId: GreyPartyId;
  /** New parent party ID (null = top level) */
  readonly newParentId: GreyPartyId | null;
  /** Original parent party ID */
  readonly originalParentId: GreyPartyId | null;
}

/**
 * Rake adjustment.
 */
export interface RakeAdjustment extends BaseAdjustment {
  readonly adjustmentType: typeof AdjustmentType.RAKE_ADJUSTMENT;
  /** Entity to which rake applies */
  readonly entityId: GreyPartyId;
  /** New rake percentage in basis points */
  readonly newRakeBasisPoints: number;
  /** Original rake percentage in basis points */
  readonly originalRakeBasisPoints: number;
}

/**
 * Share split adjustment.
 */
export interface ShareSplitAdjustment extends BaseAdjustment {
  readonly adjustmentType: typeof AdjustmentType.SHARE_SPLIT;
  /** Party receiving the split */
  readonly partyId: GreyPartyId;
  /** New split percentage in basis points */
  readonly newSplitBasisPoints: number;
  /** Original split percentage in basis points */
  readonly originalSplitBasisPoints: number;
}

/**
 * Add party adjustment.
 */
export interface AddPartyAdjustment extends BaseAdjustment {
  readonly adjustmentType: typeof AdjustmentType.ADD_PARTY;
  /** New party ID to add */
  readonly newPartyId: GreyPartyId;
  /** Party type */
  readonly partyType: GreyPartyType;
  /** Parent party ID (null = top level) */
  readonly parentId: GreyPartyId | null;
  /** Attribution share in basis points */
  readonly attributionBasisPoints: number;
}

/**
 * Remove party adjustment.
 */
export interface RemovePartyAdjustment extends BaseAdjustment {
  readonly adjustmentType: typeof AdjustmentType.REMOVE_PARTY;
  /** Party ID to remove */
  readonly partyId: GreyPartyId;
  /** How to redistribute the removed party's share */
  readonly redistributeTo: GreyPartyId | 'PROPORTIONAL';
}

/**
 * Change party type adjustment.
 */
export interface ChangePartyTypeAdjustment extends BaseAdjustment {
  readonly adjustmentType: typeof AdjustmentType.CHANGE_PARTY_TYPE;
  readonly partyId: GreyPartyId;
  readonly newPartyType: GreyPartyType;
  readonly originalPartyType: GreyPartyType;
}

/**
 * Union type for all adjustments.
 */
export type SimulationAdjustment =
  | AttributionPercentageAdjustment
  | HierarchyChangeAdjustment
  | RakeAdjustment
  | ShareSplitAdjustment
  | AddPartyAdjustment
  | RemovePartyAdjustment
  | ChangePartyTypeAdjustment;

// ============================================================================
// SIMULATION INPUT/OUTPUT TYPES
// ============================================================================

/**
 * Simulated attribution entry.
 */
export interface SimulatedAttributionEntry {
  readonly partyId: GreyPartyId;
  readonly partyType: GreyPartyType;
  /** Simulated attribution in basis points */
  readonly attributionBasisPoints: number;
  /** Simulated amount (integer units) */
  readonly simulatedAmount: number;
}

/**
 * Simulated hierarchy node.
 */
export interface SimulatedHierarchyNode {
  readonly partyId: GreyPartyId;
  readonly partyType: GreyPartyType;
  readonly parentId: GreyPartyId | null;
  readonly children: readonly GreyPartyId[];
  readonly depth: number;
  /** Total attribution flowing through this node (basis points) */
  readonly throughputBasisPoints: number;
}

/**
 * Simulated outcome for an entity.
 */
export interface SimulatedEntityOutcome {
  readonly entityId: GreyPartyId;
  readonly entityType: GreyPartyType;
  /** Simulated total received (integer units) */
  readonly simulatedTotalReceived: number;
  /** Original total received (for comparison) */
  readonly originalTotalReceived: number;
  /** Delta amount */
  readonly deltaAmount: number;
  /** Delta percentage in basis points */
  readonly deltaBasisPoints: number;
  /** Simulated health score (0-100) */
  readonly simulatedHealthScore: number;
  /** Original health score */
  readonly originalHealthScore: number;
}

/**
 * Full simulation output.
 */
export interface SimulationOutput {
  readonly runId: SimulationRunId;
  readonly scenarioId: SimulationScenarioId;
  readonly periodId: ReconciliationPeriodId;
  readonly timestamp: number;
  readonly status: SimulationStatus;
  /** Simulated attribution entries */
  readonly simulatedAttributions: readonly SimulatedAttributionEntry[];
  /** Simulated hierarchy */
  readonly simulatedHierarchy: readonly SimulatedHierarchyNode[];
  /** Outcomes per entity */
  readonly entityOutcomes: readonly SimulatedEntityOutcome[];
  /** Total simulated flow (integer units) */
  readonly totalSimulatedFlow: number;
  /** Checksum for verification */
  readonly checksum: string;
}

// ============================================================================
// COMPARISON TYPES
// ============================================================================

/**
 * Impact level classification.
 */
export const ImpactLevel = {
  /** Minimal impact (<5% change) */
  MINIMAL: 'MINIMAL',
  /** Low impact (5-15% change) */
  LOW: 'LOW',
  /** Moderate impact (15-30% change) */
  MODERATE: 'MODERATE',
  /** High impact (30-50% change) */
  HIGH: 'HIGH',
  /** Severe impact (>50% change) */
  SEVERE: 'SEVERE',
} as const;

export type ImpactLevel = (typeof ImpactLevel)[keyof typeof ImpactLevel];

/**
 * Get impact level from basis point change.
 */
export function getImpactLevel(deltaBasisPoints: number): ImpactLevel {
  const absChange = Math.abs(deltaBasisPoints);
  if (absChange < 500) return ImpactLevel.MINIMAL;
  if (absChange < 1500) return ImpactLevel.LOW;
  if (absChange < 3000) return ImpactLevel.MODERATE;
  if (absChange < 5000) return ImpactLevel.HIGH;
  return ImpactLevel.SEVERE;
}

/**
 * Comparison direction.
 */
export const ComparisonDirection = {
  /** Simulated is better than real */
  IMPROVEMENT: 'IMPROVEMENT',
  /** No significant change */
  NEUTRAL: 'NEUTRAL',
  /** Simulated is worse than real */
  DEGRADATION: 'DEGRADATION',
} as const;

export type ComparisonDirection = (typeof ComparisonDirection)[keyof typeof ComparisonDirection];

/**
 * Comparison metric.
 */
export interface ComparisonMetric {
  readonly metricName: string;
  readonly realValue: number;
  readonly simulatedValue: number;
  readonly deltaValue: number;
  readonly deltaBasisPoints: number;
  readonly impactLevel: ImpactLevel;
  readonly direction: ComparisonDirection;
}

/**
 * Entity-level comparison result.
 */
export interface EntityComparisonResult {
  readonly entityId: GreyPartyId;
  readonly entityType: GreyPartyType;
  readonly metrics: readonly ComparisonMetric[];
  readonly overallImpact: ImpactLevel;
  readonly overallDirection: ComparisonDirection;
}

/**
 * Full comparison result.
 */
export interface ComparisonResult {
  readonly comparisonId: ComparisonResultId;
  readonly realPeriodId: ReconciliationPeriodId;
  readonly scenarioId: SimulationScenarioId;
  readonly timestamp: number;
  /** Per-entity comparisons */
  readonly entityComparisons: readonly EntityComparisonResult[];
  /** Aggregate metrics */
  readonly aggregateMetrics: readonly ComparisonMetric[];
  /** Summary */
  readonly summary: ComparisonSummary;
  readonly checksum: string;
}

/**
 * Comparison summary.
 */
export interface ComparisonSummary {
  readonly totalEntitiesAffected: number;
  readonly entitiesImproved: number;
  readonly entitiesDegraded: number;
  readonly entitiesNeutral: number;
  readonly averageHealthDelta: number;
  readonly averageRiskDelta: number;
  readonly recommendation: string;
}

// ============================================================================
// RESULT TYPES
// ============================================================================

/**
 * Simulation error codes.
 */
export const SimulationErrorCode = {
  INVALID_TIMESTAMP: 'INVALID_TIMESTAMP',
  INVALID_INPUT: 'INVALID_INPUT',
  INVALID_SCENARIO: 'INVALID_SCENARIO',
  INVALID_ADJUSTMENT: 'INVALID_ADJUSTMENT',
  HIERARCHY_CYCLE: 'HIERARCHY_CYCLE',
  PERCENTAGE_OVERFLOW: 'PERCENTAGE_OVERFLOW',
  ENTITY_NOT_FOUND: 'ENTITY_NOT_FOUND',
  MAX_DEPTH_EXCEEDED: 'MAX_DEPTH_EXCEEDED',
  CHECKSUM_MISMATCH: 'CHECKSUM_MISMATCH',
  SIMULATION_FAILED: 'SIMULATION_FAILED',
} as const;

export type SimulationErrorCode = (typeof SimulationErrorCode)[keyof typeof SimulationErrorCode];

/**
 * Simulation error.
 */
export interface SimulationError {
  readonly code: SimulationErrorCode;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

/**
 * Result type for simulation operations.
 */
export type SimulationResult<T> =
  | { readonly success: true; readonly value: T }
  | { readonly success: false; readonly error: SimulationError };

/**
 * Create a success result.
 */
export function simulationSuccess<T>(value: T): SimulationResult<T> {
  return { success: true, value };
}

/**
 * Create a failure result.
 */
export function simulationFailure<T>(error: SimulationError): SimulationResult<T> {
  return { success: false, error };
}

/**
 * Create a simulation error.
 */
export function createSimulationError(
  code: SimulationErrorCode,
  message: string,
  details?: Record<string, unknown>
): SimulationError {
  return Object.freeze({
    code,
    message,
    details: details ? Object.freeze({ ...details }) : undefined,
  });
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Check if value is a valid integer.
 */
export function isValidInteger(value: number): boolean {
  return Number.isInteger(value) && Number.isFinite(value);
}

/**
 * Check if value is a valid non-negative integer.
 */
export function isValidNonNegativeInteger(value: number): boolean {
  return isValidInteger(value) && value >= 0;
}

/**
 * Check if value is a valid positive integer.
 */
export function isValidPositiveInteger(value: number): boolean {
  return isValidInteger(value) && value > 0;
}

/**
 * Check if timestamp is valid.
 */
export function isValidTimestamp(timestamp: number): boolean {
  return isValidPositiveInteger(timestamp);
}

/**
 * Check if basis points value is valid (0-10000).
 */
export function isValidBasisPoints(bp: number): boolean {
  return isValidNonNegativeInteger(bp) && bp <= BASIS_POINTS_100_PERCENT;
}

// ============================================================================
// CHECKSUM UTILITIES
// ============================================================================

/**
 * Serialize data for checksum.
 */
export function serializeForChecksum(data: unknown): string {
  if (data === null || data === undefined) {
    return 'null';
  }

  if (typeof data === 'string') {
    return `"${data}"`;
  }

  if (typeof data === 'number' || typeof data === 'boolean') {
    return String(data);
  }

  if (Array.isArray(data)) {
    const items = data.map(serializeForChecksum);
    return `[${items.join(',')}]`;
  }

  if (typeof data === 'object') {
    const keys = Object.keys(data).sort();
    const pairs = keys.map(
      (key) => `"${key}":${serializeForChecksum((data as Record<string, unknown>)[key])}`
    );
    return `{${pairs.join(',')}}`;
  }

  return String(data);
}

/**
 * Simple hash function.
 */
export function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Calculate checksum with prefix.
 */
export function calculateChecksum(prefix: string, data: unknown): string {
  return `${prefix}_${simpleHash(serializeForChecksum(data))}`;
}
