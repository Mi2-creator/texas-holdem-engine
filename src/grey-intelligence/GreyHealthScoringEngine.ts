/**
 * GreyHealthScoringEngine.ts
 * Phase A5 - Grey Intelligence & Risk Insight Layer
 *
 * HEALTH SCORING ENGINE
 *
 * This module computes deterministic health scores (0-100) for entities.
 * Scores are derived from:
 * - Orphan/partial rates
 * - Flow concentration
 * - Attribution imbalance
 * - Recharge-to-flow mismatch
 *
 * @external This module operates OUTSIDE the frozen engine.
 * @readonly This module NEVER mutates any data.
 * @deterministic Same inputs always produce same outputs.
 */

import { GreyFlowId, GreyPartyId, GreyPartyType } from '../grey-runtime';
import { ReconciliationPeriodId } from '../grey-reconciliation';
import {
  HealthScore,
  HealthScoreId,
  HealthScoreComponents,
  IntelligenceEntityType,
  RiskLevel,
  IntelligenceResult,
  IntelligenceErrorCode,
  createHealthScoreId,
  intelligenceSuccess,
  intelligenceFailure,
  createIntelligenceError,
  getRiskLevelFromScore,
  isValidTimestamp,
  isValidScore,
  calculateChecksum,
  MAX_HEALTH_SCORE,
  MIN_HEALTH_SCORE,
} from './GreyIntelligenceTypes';

// ============================================================================
// INPUT TYPES
// ============================================================================

/**
 * Flow data summary for health scoring.
 */
export interface FlowHealthData {
  readonly entityId: GreyPartyId;
  readonly entityType: IntelligenceEntityType;
  readonly periodId: ReconciliationPeriodId;
  /** Total flow count */
  readonly totalFlows: number;
  /** Number of matched flows */
  readonly matchedFlows: number;
  /** Number of partial matches */
  readonly partialFlows: number;
  /** Number of orphan flows */
  readonly orphanFlows: number;
  /** Number of missing flows */
  readonly missingFlows: number;
  /** Map of counterparty ID -> flow count */
  readonly flowsByCounterparty: ReadonlyMap<string, number>;
  /** Number of unique counterparties */
  readonly uniqueCounterparties: number;
}

/**
 * Attribution data summary for health scoring.
 */
export interface AttributionHealthData {
  readonly entityId: GreyPartyId;
  readonly entityType: IntelligenceEntityType;
  readonly periodId: ReconciliationPeriodId;
  /** Total attribution entries */
  readonly totalEntries: number;
  /** Entries with zero attribution */
  readonly zeroAttributionEntries: number;
  /** Distribution by party type (basis points) */
  readonly distributionByPartyType: ReadonlyMap<string, number>;
  /** Highest single party percentage (basis points) */
  readonly maxSinglePartyBasisPoints: number;
}

/**
 * Recharge alignment data for health scoring.
 */
export interface RechargeHealthData {
  readonly entityId: GreyPartyId;
  readonly entityType: IntelligenceEntityType;
  readonly periodId: ReconciliationPeriodId;
  /** Total recharge records */
  readonly totalRecharges: number;
  /** Recharges with linked flows */
  readonly linkedRecharges: number;
  /** Recharges without linked flows */
  readonly unlinkedRecharges: number;
  /** Total flow-linked amounts (integer) */
  readonly linkedAmountTotal: number;
  /** Total recharge amounts (integer) */
  readonly rechargeAmountTotal: number;
}

/**
 * Combined health input data.
 */
export interface HealthScoringInput {
  readonly entityId: GreyPartyId;
  readonly entityType: IntelligenceEntityType;
  readonly periodId: ReconciliationPeriodId;
  readonly timestamp: number;
  readonly flowData: FlowHealthData;
  readonly attributionData: AttributionHealthData;
  readonly rechargeData: RechargeHealthData;
}

// ============================================================================
// SCORING WEIGHTS
// ============================================================================

/**
 * Weights for each component (must sum to 10000 basis points = 100%).
 */
export const SCORING_WEIGHTS = {
  /** Weight for correlation score */
  CORRELATION: 3000,
  /** Weight for distribution score */
  DISTRIBUTION: 2500,
  /** Weight for attribution score */
  ATTRIBUTION: 2500,
  /** Weight for alignment score */
  ALIGNMENT: 2000,
} as const;

// ============================================================================
// CORRELATION SCORE CALCULATION
// ============================================================================

/**
 * Calculate correlation score based on orphan/partial rates.
 * Perfect score = no orphans, no partials.
 * Score degrades based on percentage of problematic flows.
 *
 * @param flowData - Flow health data
 * @returns Score 0-100
 */
export function calculateCorrelationScore(flowData: FlowHealthData): number {
  if (flowData.totalFlows === 0) {
    // No flows = neutral score (50)
    return 50;
  }

  const problematicFlows = flowData.orphanFlows + flowData.partialFlows + flowData.missingFlows;
  const problematicRate = Math.floor((problematicFlows * 10000) / flowData.totalFlows);

  // Score = 100 - problematic percentage
  // problematicRate is in basis points, convert to percentage
  const problematicPercentage = Math.floor(problematicRate / 100);
  const score = Math.max(MIN_HEALTH_SCORE, MAX_HEALTH_SCORE - problematicPercentage);

  return score;
}

// ============================================================================
// DISTRIBUTION SCORE CALCULATION
// ============================================================================

/**
 * Calculate distribution score based on flow concentration.
 * Perfect score = evenly distributed flows across many counterparties.
 * Score degrades when flows concentrate to few counterparties.
 *
 * Uses Herfindahl-Hirschman Index (HHI) concept.
 *
 * @param flowData - Flow health data
 * @returns Score 0-100
 */
export function calculateDistributionScore(flowData: FlowHealthData): number {
  if (flowData.totalFlows === 0 || flowData.uniqueCounterparties === 0) {
    // No flows = neutral score
    return 50;
  }

  if (flowData.uniqueCounterparties === 1) {
    // Single counterparty = concentrated (low score)
    return 20;
  }

  // Calculate concentration using HHI-like approach
  // HHI = sum of squared market shares
  let sumSquaredShares = 0;

  for (const [, count] of flowData.flowsByCounterparty) {
    // Share in basis points
    const shareBasisPoints = Math.floor((count * 10000) / flowData.totalFlows);
    // Square and accumulate (divide by 10000 to keep in basis points)
    sumSquaredShares += Math.floor((shareBasisPoints * shareBasisPoints) / 10000);
  }

  // HHI ranges from 10000/n (perfect distribution) to 10000 (monopoly)
  // Minimum possible HHI for n counterparties = 10000/n
  const minPossibleHHI = Math.floor(10000 / flowData.uniqueCounterparties);
  const maxHHI = 10000;

  // Normalize: 0 = monopoly (HHI = 10000), 100 = perfect distribution (HHI = min)
  if (sumSquaredShares >= maxHHI) {
    return MIN_HEALTH_SCORE;
  }

  if (sumSquaredShares <= minPossibleHHI) {
    return MAX_HEALTH_SCORE;
  }

  // Linear interpolation between min and max
  const range = maxHHI - minPossibleHHI;
  const position = sumSquaredShares - minPossibleHHI;
  const score = Math.floor(((range - position) * 100) / range);

  return Math.max(MIN_HEALTH_SCORE, Math.min(MAX_HEALTH_SCORE, score));
}

// ============================================================================
// ATTRIBUTION SCORE CALCULATION
// ============================================================================

/**
 * Calculate attribution score based on balance and completeness.
 * Perfect score = all entries have attribution, well-distributed.
 * Score degrades with zero attributions or extreme concentration.
 *
 * @param attributionData - Attribution health data
 * @returns Score 0-100
 */
export function calculateAttributionScore(attributionData: AttributionHealthData): number {
  if (attributionData.totalEntries === 0) {
    // No entries = neutral score
    return 50;
  }

  // Component 1: Completeness (entries with attribution vs total)
  const zeroRate = Math.floor(
    (attributionData.zeroAttributionEntries * 10000) / attributionData.totalEntries
  );
  const completenessScore = Math.max(0, 100 - Math.floor(zeroRate / 100));

  // Component 2: Balance (max single party should not dominate)
  // If one party gets > 70% (7000 basis points), score degrades
  let balanceScore = 100;
  if (attributionData.maxSinglePartyBasisPoints > 9000) {
    // > 90% to one party = very unbalanced
    balanceScore = 20;
  } else if (attributionData.maxSinglePartyBasisPoints > 8000) {
    balanceScore = 40;
  } else if (attributionData.maxSinglePartyBasisPoints > 7000) {
    balanceScore = 60;
  } else if (attributionData.maxSinglePartyBasisPoints > 6000) {
    balanceScore = 80;
  }

  // Weighted average (60% completeness, 40% balance)
  const score = Math.floor((completenessScore * 60 + balanceScore * 40) / 100);

  return Math.max(MIN_HEALTH_SCORE, Math.min(MAX_HEALTH_SCORE, score));
}

// ============================================================================
// ALIGNMENT SCORE CALCULATION
// ============================================================================

/**
 * Calculate alignment score based on recharge-to-flow matching.
 * Perfect score = all recharges linked, amounts match.
 * Score degrades with unlinked recharges or amount mismatches.
 *
 * @param rechargeData - Recharge health data
 * @returns Score 0-100
 */
export function calculateAlignmentScore(rechargeData: RechargeHealthData): number {
  if (rechargeData.totalRecharges === 0) {
    // No recharges = neutral score
    return 50;
  }

  // Component 1: Link rate (linked vs total recharges)
  const linkRate = Math.floor(
    (rechargeData.linkedRecharges * 10000) / rechargeData.totalRecharges
  );
  const linkScore = Math.floor(linkRate / 100);

  // Component 2: Amount alignment (if there are linked items)
  let amountScore = 100;
  if (rechargeData.linkedAmountTotal > 0 && rechargeData.rechargeAmountTotal > 0) {
    // Calculate variance between linked amounts and recharge amounts
    // Perfect alignment = amounts match
    const ratio = Math.floor(
      (rechargeData.linkedAmountTotal * 10000) / rechargeData.rechargeAmountTotal
    );

    // Ratio should be close to 10000 (100%)
    // Calculate deviation from 100%
    const deviation = Math.abs(ratio - 10000);

    // Every 100 basis points deviation = -1 point
    amountScore = Math.max(0, 100 - Math.floor(deviation / 100));
  }

  // Weighted average (70% link rate, 30% amount alignment)
  const score = Math.floor((linkScore * 70 + amountScore * 30) / 100);

  return Math.max(MIN_HEALTH_SCORE, Math.min(MAX_HEALTH_SCORE, score));
}

// ============================================================================
// OVERALL SCORE CALCULATION
// ============================================================================

/**
 * Calculate weighted overall score from components.
 *
 * @param components - Component scores
 * @returns Overall score 0-100
 */
export function calculateOverallScore(components: HealthScoreComponents): number {
  const weightedSum =
    components.correlationScore * SCORING_WEIGHTS.CORRELATION +
    components.distributionScore * SCORING_WEIGHTS.DISTRIBUTION +
    components.attributionScore * SCORING_WEIGHTS.ATTRIBUTION +
    components.alignmentScore * SCORING_WEIGHTS.ALIGNMENT;

  // Divide by total weight (10000) to get final score
  const score = Math.floor(weightedSum / 10000);

  return Math.max(MIN_HEALTH_SCORE, Math.min(MAX_HEALTH_SCORE, score));
}

// ============================================================================
// MAIN SCORING FUNCTION
// ============================================================================

/**
 * Calculate health score for an entity.
 *
 * @param input - Health scoring input data
 * @returns Result with health score or error
 */
export function calculateHealthScore(input: HealthScoringInput): IntelligenceResult<HealthScore> {
  // Validate timestamp
  if (!isValidTimestamp(input.timestamp)) {
    return intelligenceFailure(
      createIntelligenceError(
        IntelligenceErrorCode.INVALID_TIMESTAMP,
        `Invalid timestamp: ${input.timestamp}`
      )
    );
  }

  // Validate entity IDs match
  if (
    input.entityId !== input.flowData.entityId ||
    input.entityId !== input.attributionData.entityId ||
    input.entityId !== input.rechargeData.entityId
  ) {
    return intelligenceFailure(
      createIntelligenceError(
        IntelligenceErrorCode.INVALID_INPUT,
        'Entity IDs do not match across data inputs'
      )
    );
  }

  // Calculate component scores
  const correlationScore = calculateCorrelationScore(input.flowData);
  const distributionScore = calculateDistributionScore(input.flowData);
  const attributionScore = calculateAttributionScore(input.attributionData);
  const alignmentScore = calculateAlignmentScore(input.rechargeData);

  const components: HealthScoreComponents = Object.freeze({
    correlationScore,
    distributionScore,
    attributionScore,
    alignmentScore,
  });

  // Calculate overall score
  const overallScore = calculateOverallScore(components);

  // Determine risk level
  const riskLevel = getRiskLevelFromScore(overallScore);

  // Generate score ID
  const scoreId = createHealthScoreId(
    `hs_${input.entityId}_${input.periodId}_${input.timestamp}`
  );

  // Calculate checksum
  const checksumData = {
    entityId: input.entityId,
    entityType: input.entityType,
    periodId: input.periodId,
    timestamp: input.timestamp,
    overallScore,
    components,
    riskLevel,
  };
  const checksum = calculateChecksum('hs', checksumData);

  const healthScore: HealthScore = Object.freeze({
    scoreId,
    entityId: input.entityId,
    entityType: input.entityType,
    periodId: input.periodId,
    timestamp: input.timestamp,
    overallScore,
    components,
    riskLevel,
    checksum,
  });

  return intelligenceSuccess(healthScore);
}

// ============================================================================
// BATCH SCORING
// ============================================================================

/**
 * Calculate health scores for multiple entities.
 *
 * @param inputs - Array of health scoring inputs
 * @returns Result with array of health scores (only successful ones)
 */
export function calculateHealthScoreBatch(
  inputs: readonly HealthScoringInput[]
): IntelligenceResult<readonly HealthScore[]> {
  const scores: HealthScore[] = [];
  const errors: string[] = [];

  for (const input of inputs) {
    const result = calculateHealthScore(input);
    if (result.success) {
      scores.push(result.value);
    } else {
      errors.push(`${input.entityId}: ${result.error.message}`);
    }
  }

  if (scores.length === 0 && errors.length > 0) {
    return intelligenceFailure(
      createIntelligenceError(
        IntelligenceErrorCode.INVALID_INPUT,
        `All scoring failed: ${errors.join('; ')}`
      )
    );
  }

  return intelligenceSuccess(Object.freeze(scores));
}

// ============================================================================
// HELPER FACTORIES
// ============================================================================

/**
 * Create flow health data from raw counts.
 */
export function createFlowHealthData(
  entityId: GreyPartyId,
  entityType: IntelligenceEntityType,
  periodId: ReconciliationPeriodId,
  totalFlows: number,
  matchedFlows: number,
  partialFlows: number,
  orphanFlows: number,
  missingFlows: number,
  flowsByCounterparty: ReadonlyMap<string, number>
): FlowHealthData {
  return Object.freeze({
    entityId,
    entityType,
    periodId,
    totalFlows,
    matchedFlows,
    partialFlows,
    orphanFlows,
    missingFlows,
    flowsByCounterparty,
    uniqueCounterparties: flowsByCounterparty.size,
  });
}

/**
 * Create attribution health data from raw values.
 */
export function createAttributionHealthData(
  entityId: GreyPartyId,
  entityType: IntelligenceEntityType,
  periodId: ReconciliationPeriodId,
  totalEntries: number,
  zeroAttributionEntries: number,
  distributionByPartyType: ReadonlyMap<string, number>,
  maxSinglePartyBasisPoints: number
): AttributionHealthData {
  return Object.freeze({
    entityId,
    entityType,
    periodId,
    totalEntries,
    zeroAttributionEntries,
    distributionByPartyType,
    maxSinglePartyBasisPoints,
  });
}

/**
 * Create recharge health data from raw values.
 */
export function createRechargeHealthData(
  entityId: GreyPartyId,
  entityType: IntelligenceEntityType,
  periodId: ReconciliationPeriodId,
  totalRecharges: number,
  linkedRecharges: number,
  unlinkedRecharges: number,
  linkedAmountTotal: number,
  rechargeAmountTotal: number
): RechargeHealthData {
  return Object.freeze({
    entityId,
    entityType,
    periodId,
    totalRecharges,
    linkedRecharges,
    unlinkedRecharges,
    linkedAmountTotal,
    rechargeAmountTotal,
  });
}

/**
 * Create health scoring input.
 */
export function createHealthScoringInput(
  entityId: GreyPartyId,
  entityType: IntelligenceEntityType,
  periodId: ReconciliationPeriodId,
  timestamp: number,
  flowData: FlowHealthData,
  attributionData: AttributionHealthData,
  rechargeData: RechargeHealthData
): HealthScoringInput {
  return Object.freeze({
    entityId,
    entityType,
    periodId,
    timestamp,
    flowData,
    attributionData,
    rechargeData,
  });
}

// ============================================================================
// SCORE VERIFICATION
// ============================================================================

/**
 * Verify that a health score is valid and checksum matches.
 *
 * @param score - Health score to verify
 * @returns Result indicating if score is valid
 */
export function verifyHealthScore(score: HealthScore): IntelligenceResult<boolean> {
  // Verify overall score is valid
  if (!isValidScore(score.overallScore)) {
    return intelligenceFailure(
      createIntelligenceError(
        IntelligenceErrorCode.INVALID_SCORE,
        `Invalid overall score: ${score.overallScore}`
      )
    );
  }

  // Verify component scores
  for (const [key, value] of Object.entries(score.components)) {
    if (!isValidScore(value)) {
      return intelligenceFailure(
        createIntelligenceError(
          IntelligenceErrorCode.INVALID_SCORE,
          `Invalid ${key}: ${value}`
        )
      );
    }
  }

  // Verify checksum
  const checksumData = {
    entityId: score.entityId,
    entityType: score.entityType,
    periodId: score.periodId,
    timestamp: score.timestamp,
    overallScore: score.overallScore,
    components: score.components,
    riskLevel: score.riskLevel,
  };
  const expectedChecksum = calculateChecksum('hs', checksumData);

  if (score.checksum !== expectedChecksum) {
    return intelligenceFailure(
      createIntelligenceError(
        IntelligenceErrorCode.CHECKSUM_MISMATCH,
        `Checksum mismatch: expected ${expectedChecksum}, got ${score.checksum}`
      )
    );
  }

  return intelligenceSuccess(true);
}
