/**
 * GreyRiskRanking.ts
 * Phase A5 - Grey Intelligence & Risk Insight Layer
 *
 * RISK RANKING ENGINE
 *
 * This module ranks entities by their risk scores.
 * Rankings are deterministic and based on health scores and anomalies.
 *
 * @external This module operates OUTSIDE the frozen engine.
 * @readonly This module NEVER mutates any data.
 * @deterministic Same inputs always produce same outputs.
 */

import { GreyPartyId } from '../grey-runtime';
import { ReconciliationPeriodId } from '../grey-reconciliation';
import {
  RiskRanking,
  RiskRankEntry,
  RiskRankingId,
  RiskLevel,
  HealthScore,
  IntelligenceEntityType,
  IntelligenceResult,
  IntelligenceErrorCode,
  AnomalySeverity,
  createRiskRankingId,
  intelligenceSuccess,
  intelligenceFailure,
  createIntelligenceError,
  getRiskLevelFromScore,
  isValidTimestamp,
  calculateChecksum,
  HIGH_RISK_THRESHOLD,
} from './GreyIntelligenceTypes';
import { AnomalyClassificationOutput } from './GreyAnomalyClassifier';

// ============================================================================
// RISK RANKING CONSTANTS
// ============================================================================

/**
 * Weights for risk calculation.
 * All in basis points (10000 = 100%).
 */
export const RISK_WEIGHTS = {
  /** Weight for health score (inverse: lower health = higher risk) */
  HEALTH_SCORE_WEIGHT: 6000,
  /** Weight for anomaly count */
  ANOMALY_WEIGHT: 2500,
  /** Weight for critical anomalies */
  CRITICAL_ANOMALY_WEIGHT: 1500,
} as const;

/**
 * Penalty factors for anomaly severity.
 * Applied per anomaly of that severity.
 */
export const ANOMALY_PENALTIES = {
  CRITICAL: 15,
  ALERT: 8,
  WARNING: 3,
  INFO: 1,
} as const;

// ============================================================================
// INPUT TYPES
// ============================================================================

/**
 * Entity data for risk ranking.
 */
export interface RiskRankingEntityData {
  readonly entityId: GreyPartyId;
  readonly entityType: IntelligenceEntityType;
  readonly healthScore: HealthScore;
  readonly anomalyOutput?: AnomalyClassificationOutput;
}

/**
 * Input for risk ranking generation.
 */
export interface RiskRankingInput {
  readonly entityType: IntelligenceEntityType;
  readonly periodId: ReconciliationPeriodId;
  readonly timestamp: number;
  readonly entities: readonly RiskRankingEntityData[];
}

// ============================================================================
// RISK SCORE CALCULATION
// ============================================================================

/**
 * Calculate risk score for an entity.
 * Higher score = higher risk.
 * Range: 0-100 (0 = no risk, 100 = critical risk)
 *
 * @param data - Entity data
 * @returns Risk score 0-100
 */
function calculateRiskScore(data: RiskRankingEntityData): number {
  // Start with inverted health score
  // Health 100 → Risk 0, Health 0 → Risk 100
  const healthRiskComponent = 100 - data.healthScore.overallScore;

  // Add anomaly penalties
  let anomalyPenalty = 0;
  if (data.anomalyOutput) {
    anomalyPenalty +=
      data.anomalyOutput.criticalCount * ANOMALY_PENALTIES.CRITICAL +
      data.anomalyOutput.alertCount * ANOMALY_PENALTIES.ALERT +
      data.anomalyOutput.warningCount * ANOMALY_PENALTIES.WARNING +
      data.anomalyOutput.infoCount * ANOMALY_PENALTIES.INFO;
  }

  // Cap anomaly penalty at 30 points
  anomalyPenalty = Math.min(30, anomalyPenalty);

  // Weighted combination
  const weightedHealth =
    Math.floor((healthRiskComponent * RISK_WEIGHTS.HEALTH_SCORE_WEIGHT) / 10000);
  const weightedAnomaly = Math.floor((anomalyPenalty * RISK_WEIGHTS.ANOMALY_WEIGHT) / 10000);

  // Critical anomaly bonus (additional weight)
  let criticalBonus = 0;
  if (data.anomalyOutput && data.anomalyOutput.criticalCount > 0) {
    criticalBonus = Math.floor(
      (data.anomalyOutput.criticalCount * 10 * RISK_WEIGHTS.CRITICAL_ANOMALY_WEIGHT) / 10000
    );
  }

  const riskScore = Math.min(100, weightedHealth + weightedAnomaly + criticalBonus);

  return Math.max(0, riskScore);
}

/**
 * Determine contributing factors for risk.
 */
function determineRiskFactors(data: RiskRankingEntityData): readonly string[] {
  const factors: string[] = [];

  // Health-based factors
  const components = data.healthScore.components;

  if (components.correlationScore < 50) {
    factors.push('Low correlation score');
  }
  if (components.distributionScore < 50) {
    factors.push('Concentrated flow distribution');
  }
  if (components.attributionScore < 50) {
    factors.push('Attribution imbalance');
  }
  if (components.alignmentScore < 50) {
    factors.push('Recharge-flow misalignment');
  }

  // Anomaly-based factors
  if (data.anomalyOutput) {
    if (data.anomalyOutput.criticalCount > 0) {
      factors.push(`${data.anomalyOutput.criticalCount} critical anomalies`);
    }
    if (data.anomalyOutput.alertCount > 0) {
      factors.push(`${data.anomalyOutput.alertCount} alerts`);
    }
  }

  // Limit to top 5 factors
  return Object.freeze(factors.slice(0, 5));
}

// ============================================================================
// MAIN RANKING FUNCTION
// ============================================================================

/**
 * Generate risk ranking for a set of entities.
 *
 * @param input - Risk ranking input
 * @returns Result with risk ranking
 */
export function generateRiskRanking(
  input: RiskRankingInput
): IntelligenceResult<RiskRanking> {
  // Validate timestamp
  if (!isValidTimestamp(input.timestamp)) {
    return intelligenceFailure(
      createIntelligenceError(
        IntelligenceErrorCode.INVALID_TIMESTAMP,
        `Invalid timestamp: ${input.timestamp}`
      )
    );
  }

  // Validate entities are of correct type
  for (const entity of input.entities) {
    if (entity.entityType !== input.entityType) {
      return intelligenceFailure(
        createIntelligenceError(
          IntelligenceErrorCode.INVALID_INPUT,
          `Entity ${entity.entityId} has type ${entity.entityType}, expected ${input.entityType}`
        )
      );
    }
  }

  // Calculate risk scores for all entities
  const scoredEntities: Array<{
    data: RiskRankingEntityData;
    riskScore: number;
    factors: readonly string[];
  }> = [];

  for (const entity of input.entities) {
    const riskScore = calculateRiskScore(entity);
    const factors = determineRiskFactors(entity);
    scoredEntities.push({ data: entity, riskScore, factors });
  }

  // Sort by risk score (highest first), then by entity ID for stability
  scoredEntities.sort((a, b) => {
    const scoreDiff = b.riskScore - a.riskScore;
    if (scoreDiff !== 0) return scoreDiff;
    return a.data.entityId.localeCompare(b.data.entityId);
  });

  // Create rank entries
  const entries: RiskRankEntry[] = [];
  let highRiskCount = 0;

  for (let i = 0; i < scoredEntities.length; i++) {
    const { data, riskScore, factors } = scoredEntities[i];
    const riskLevel = getRiskLevelFromScore(100 - riskScore); // Convert back to health-like scale

    if (riskScore >= 100 - HIGH_RISK_THRESHOLD) {
      highRiskCount++;
    }

    const entry: RiskRankEntry = Object.freeze({
      rank: i + 1,
      entityId: data.entityId,
      entityType: data.entityType,
      riskScore,
      riskLevel,
      factors,
    });

    entries.push(entry);
  }

  // Generate ranking ID
  const rankingId = createRiskRankingId(
    `rr_${input.entityType}_${input.periodId}_${input.timestamp}`
  );

  // Calculate checksum
  const checksumData = {
    rankingId,
    entityType: input.entityType,
    periodId: input.periodId,
    timestamp: input.timestamp,
    totalEntities: entries.length,
    highRiskCount,
    topRiskScore: entries.length > 0 ? entries[0].riskScore : 0,
  };

  const ranking: RiskRanking = Object.freeze({
    rankingId,
    entityType: input.entityType,
    periodId: input.periodId,
    timestamp: input.timestamp,
    entries: Object.freeze(entries),
    totalEntities: entries.length,
    highRiskCount,
    checksum: calculateChecksum('rr', checksumData),
  });

  return intelligenceSuccess(ranking);
}

// ============================================================================
// BATCH RANKING
// ============================================================================

/**
 * Generate risk rankings for multiple entity types.
 */
export function generateRiskRankingBatch(
  inputs: readonly RiskRankingInput[]
): IntelligenceResult<readonly RiskRanking[]> {
  const rankings: RiskRanking[] = [];
  const errors: string[] = [];

  for (const input of inputs) {
    const result = generateRiskRanking(input);
    if (result.success) {
      rankings.push(result.value);
    } else {
      errors.push(`${input.entityType}: ${result.error.message}`);
    }
  }

  if (rankings.length === 0 && errors.length > 0) {
    return intelligenceFailure(
      createIntelligenceError(
        IntelligenceErrorCode.INVALID_INPUT,
        `All ranking generation failed: ${errors.join('; ')}`
      )
    );
  }

  return intelligenceSuccess(Object.freeze(rankings));
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get top N risky entities from ranking.
 */
export function getTopRiskyEntities(
  ranking: RiskRanking,
  count: number
): readonly RiskRankEntry[] {
  return Object.freeze(ranking.entries.slice(0, Math.min(count, ranking.entries.length)));
}

/**
 * Get all high-risk entities from ranking.
 */
export function getHighRiskEntities(ranking: RiskRanking): readonly RiskRankEntry[] {
  return Object.freeze(
    ranking.entries.filter(
      (e) => e.riskLevel === RiskLevel.HIGH || e.riskLevel === RiskLevel.CRITICAL
    )
  );
}

/**
 * Get all critical-risk entities from ranking.
 */
export function getCriticalRiskEntities(ranking: RiskRanking): readonly RiskRankEntry[] {
  return Object.freeze(ranking.entries.filter((e) => e.riskLevel === RiskLevel.CRITICAL));
}

/**
 * Get entity by ID from ranking.
 */
export function getEntityRank(
  ranking: RiskRanking,
  entityId: GreyPartyId
): RiskRankEntry | null {
  return ranking.entries.find((e) => e.entityId === entityId) || null;
}

/**
 * Get entities within a risk score range.
 */
export function getEntitiesInRiskRange(
  ranking: RiskRanking,
  minScore: number,
  maxScore: number
): readonly RiskRankEntry[] {
  return Object.freeze(
    ranking.entries.filter((e) => e.riskScore >= minScore && e.riskScore <= maxScore)
  );
}

/**
 * Calculate risk distribution summary.
 */
export interface RiskDistribution {
  readonly criticalCount: number;
  readonly highCount: number;
  readonly mediumCount: number;
  readonly lowCount: number;
  readonly criticalPercentage: number;
  readonly highPercentage: number;
  readonly mediumPercentage: number;
  readonly lowPercentage: number;
}

export function getRiskDistribution(ranking: RiskRanking): RiskDistribution {
  let criticalCount = 0;
  let highCount = 0;
  let mediumCount = 0;
  let lowCount = 0;

  for (const entry of ranking.entries) {
    switch (entry.riskLevel) {
      case RiskLevel.CRITICAL:
        criticalCount++;
        break;
      case RiskLevel.HIGH:
        highCount++;
        break;
      case RiskLevel.MEDIUM:
        mediumCount++;
        break;
      case RiskLevel.LOW:
        lowCount++;
        break;
    }
  }

  const total = ranking.totalEntities || 1;

  return Object.freeze({
    criticalCount,
    highCount,
    mediumCount,
    lowCount,
    criticalPercentage: Math.floor((criticalCount * 10000) / total),
    highPercentage: Math.floor((highCount * 10000) / total),
    mediumPercentage: Math.floor((mediumCount * 10000) / total),
    lowPercentage: Math.floor((lowCount * 10000) / total),
  });
}

/**
 * Compare two rankings to find changes.
 */
export interface RankingComparison {
  readonly newHighRisk: readonly GreyPartyId[];
  readonly noLongerHighRisk: readonly GreyPartyId[];
  readonly significantChanges: readonly {
    entityId: GreyPartyId;
    previousRank: number;
    currentRank: number;
    rankChange: number;
  }[];
}

export function compareRankings(
  previous: RiskRanking,
  current: RiskRanking
): RankingComparison {
  const previousHighRisk = new Set(
    previous.entries
      .filter((e) => e.riskLevel === RiskLevel.HIGH || e.riskLevel === RiskLevel.CRITICAL)
      .map((e) => e.entityId)
  );

  const currentHighRisk = new Set(
    current.entries
      .filter((e) => e.riskLevel === RiskLevel.HIGH || e.riskLevel === RiskLevel.CRITICAL)
      .map((e) => e.entityId)
  );

  const newHighRisk: GreyPartyId[] = [];
  const noLongerHighRisk: GreyPartyId[] = [];

  for (const id of currentHighRisk) {
    if (!previousHighRisk.has(id)) {
      newHighRisk.push(id);
    }
  }

  for (const id of previousHighRisk) {
    if (!currentHighRisk.has(id)) {
      noLongerHighRisk.push(id);
    }
  }

  // Find significant rank changes (moved more than 5 positions)
  const significantChanges: Array<{
    entityId: GreyPartyId;
    previousRank: number;
    currentRank: number;
    rankChange: number;
  }> = [];

  const previousRankMap = new Map(previous.entries.map((e) => [e.entityId, e.rank]));

  for (const entry of current.entries) {
    const previousRank = previousRankMap.get(entry.entityId);
    if (previousRank !== undefined) {
      const rankChange = previousRank - entry.rank; // Positive = moved up in risk
      if (Math.abs(rankChange) >= 5) {
        significantChanges.push({
          entityId: entry.entityId,
          previousRank,
          currentRank: entry.rank,
          rankChange,
        });
      }
    }
  }

  // Sort by absolute change magnitude
  significantChanges.sort((a, b) => Math.abs(b.rankChange) - Math.abs(a.rankChange));

  return Object.freeze({
    newHighRisk: Object.freeze(newHighRisk),
    noLongerHighRisk: Object.freeze(noLongerHighRisk),
    significantChanges: Object.freeze(significantChanges),
  });
}

/**
 * Create risk ranking input helper.
 */
export function createRiskRankingInput(
  entityType: IntelligenceEntityType,
  periodId: ReconciliationPeriodId,
  timestamp: number,
  entities: readonly RiskRankingEntityData[]
): RiskRankingInput {
  return Object.freeze({
    entityType,
    periodId,
    timestamp,
    entities: Object.freeze([...entities]),
  });
}

/**
 * Create risk ranking entity data helper.
 */
export function createRiskRankingEntityData(
  entityId: GreyPartyId,
  entityType: IntelligenceEntityType,
  healthScore: HealthScore,
  anomalyOutput?: AnomalyClassificationOutput
): RiskRankingEntityData {
  return Object.freeze({
    entityId,
    entityType,
    healthScore,
    anomalyOutput,
  });
}
