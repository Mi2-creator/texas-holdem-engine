/**
 * GreyExecutiveViews.ts
 * Phase A5 - Grey Intelligence & Risk Insight Layer
 *
 * EXECUTIVE SUMMARY VIEWS
 *
 * This module provides read-only executive-level summary views
 * aggregating intelligence data for decision makers.
 *
 * @external This module operates OUTSIDE the frozen engine.
 * @readonly This module NEVER mutates any data.
 * @deterministic Same inputs always produce same outputs.
 */

import { GreyPartyId } from '../grey-runtime';
import { ReconciliationPeriodId } from '../grey-reconciliation';
import {
  HealthScore,
  RiskLevel,
  TrendDirection,
  IntelligenceEntityType,
  AnomalyType,
  AnomalySeverity,
  AnomalyDescriptor,
  TrendAnalysis,
  RiskRanking,
  RiskRankEntry,
  calculateChecksum,
} from './GreyIntelligenceTypes';
import { AnomalyClassificationOutput } from './GreyAnomalyClassifier';
import { MultiMetricTrendOutput } from './GreyTrendAnalysis';
import { RiskDistribution, getRiskDistribution } from './GreyRiskRanking';

// ============================================================================
// EXECUTIVE DASHBOARD VIEW
// ============================================================================

/**
 * Executive dashboard summary.
 */
export interface ExecutiveDashboard {
  readonly periodId: ReconciliationPeriodId;
  readonly timestamp: number;
  /** Overall system health (0-100) */
  readonly systemHealthScore: number;
  /** System risk level */
  readonly systemRiskLevel: RiskLevel;
  /** Total entities monitored */
  readonly totalEntities: number;
  /** Breakdown by entity type */
  readonly entityBreakdown: EntityTypeBreakdown;
  /** Critical items requiring attention */
  readonly criticalItems: readonly CriticalItem[];
  /** Key metrics summary */
  readonly keyMetrics: KeyMetricsSummary;
  /** Trend summary */
  readonly trendSummary: TrendSummary;
  readonly checksum: string;
}

/**
 * Breakdown by entity type.
 */
export interface EntityTypeBreakdown {
  readonly players: EntityTypeSummary;
  readonly tables: EntityTypeSummary;
  readonly clubs: EntityTypeSummary;
  readonly agents: EntityTypeSummary;
}

/**
 * Summary for a single entity type.
 */
export interface EntityTypeSummary {
  readonly totalCount: number;
  readonly averageHealthScore: number;
  readonly highRiskCount: number;
  readonly criticalCount: number;
  readonly anomalyCount: number;
}

/**
 * A critical item requiring attention.
 */
export interface CriticalItem {
  readonly entityId: GreyPartyId;
  readonly entityType: IntelligenceEntityType;
  readonly reason: string;
  readonly severity: AnomalySeverity;
  readonly healthScore: number;
  readonly riskScore: number;
}

/**
 * Key metrics summary.
 */
export interface KeyMetricsSummary {
  /** Average health score across all entities */
  readonly averageHealthScore: number;
  /** Average risk score across all entities */
  readonly averageRiskScore: number;
  /** Total anomalies detected */
  readonly totalAnomalies: number;
  /** Critical anomalies */
  readonly criticalAnomalies: number;
  /** Percentage of entities in good health (>70) */
  readonly healthyEntityPercentage: number;
  /** Percentage of entities with anomalies */
  readonly anomalyEntityPercentage: number;
}

/**
 * Trend summary across all entities.
 */
export interface TrendSummary {
  readonly improvingCount: number;
  readonly stableCount: number;
  readonly deterioratingCount: number;
  readonly volatileCount: number;
  readonly overallTrend: TrendDirection;
}

// ============================================================================
// DASHBOARD GENERATION
// ============================================================================

/**
 * Input for generating executive dashboard.
 */
export interface ExecutiveDashboardInput {
  readonly periodId: ReconciliationPeriodId;
  readonly timestamp: number;
  readonly healthScores: readonly HealthScore[];
  readonly anomalyOutputs: readonly AnomalyClassificationOutput[];
  readonly riskRankings: readonly RiskRanking[];
  readonly trendOutputs: readonly MultiMetricTrendOutput[];
}

/**
 * Generate executive dashboard from intelligence data.
 */
export function generateExecutiveDashboard(
  input: ExecutiveDashboardInput
): ExecutiveDashboard {
  // Group data by entity type
  const playerScores = input.healthScores.filter(
    (s) => s.entityType === IntelligenceEntityType.PLAYER
  );
  const tableScores = input.healthScores.filter(
    (s) => s.entityType === IntelligenceEntityType.TABLE
  );
  const clubScores = input.healthScores.filter(
    (s) => s.entityType === IntelligenceEntityType.CLUB
  );
  const agentScores = input.healthScores.filter(
    (s) => s.entityType === IntelligenceEntityType.AGENT
  );

  // Calculate entity breakdown
  const entityBreakdown: EntityTypeBreakdown = {
    players: calculateEntityTypeSummary(playerScores, input.anomalyOutputs),
    tables: calculateEntityTypeSummary(tableScores, input.anomalyOutputs),
    clubs: calculateEntityTypeSummary(clubScores, input.anomalyOutputs),
    agents: calculateEntityTypeSummary(agentScores, input.anomalyOutputs),
  };

  // Calculate system health (weighted average)
  const systemHealthScore = calculateSystemHealth(entityBreakdown);
  const systemRiskLevel = getSystemRiskLevel(systemHealthScore);

  // Get critical items
  const criticalItems = extractCriticalItems(
    input.healthScores,
    input.anomalyOutputs,
    input.riskRankings
  );

  // Calculate key metrics
  const keyMetrics = calculateKeyMetrics(input.healthScores, input.anomalyOutputs);

  // Calculate trend summary
  const trendSummary = calculateTrendSummary(input.trendOutputs);

  const checksumData = {
    periodId: input.periodId,
    timestamp: input.timestamp,
    systemHealthScore,
    totalEntities: input.healthScores.length,
    criticalItemCount: criticalItems.length,
  };

  return Object.freeze({
    periodId: input.periodId,
    timestamp: input.timestamp,
    systemHealthScore,
    systemRiskLevel,
    totalEntities: input.healthScores.length,
    entityBreakdown: Object.freeze(entityBreakdown),
    criticalItems: Object.freeze(criticalItems),
    keyMetrics: Object.freeze(keyMetrics),
    trendSummary: Object.freeze(trendSummary),
    checksum: calculateChecksum('ed', checksumData),
  });
}

/**
 * Calculate summary for an entity type.
 */
function calculateEntityTypeSummary(
  scores: readonly HealthScore[],
  anomalyOutputs: readonly AnomalyClassificationOutput[]
): EntityTypeSummary {
  if (scores.length === 0) {
    return Object.freeze({
      totalCount: 0,
      averageHealthScore: 0,
      highRiskCount: 0,
      criticalCount: 0,
      anomalyCount: 0,
    });
  }

  const totalScore = scores.reduce((sum, s) => sum + s.overallScore, 0);
  const averageHealthScore = Math.floor(totalScore / scores.length);

  const highRiskCount = scores.filter(
    (s) => s.riskLevel === RiskLevel.HIGH || s.riskLevel === RiskLevel.CRITICAL
  ).length;

  const criticalCount = scores.filter((s) => s.riskLevel === RiskLevel.CRITICAL).length;

  // Count anomalies for these entities
  const entityIds = new Set(scores.map((s) => s.entityId));
  const relevantAnomalies = anomalyOutputs.filter((a) => entityIds.has(a.entityId));
  const anomalyCount = relevantAnomalies.reduce((sum, a) => sum + a.totalAnomalies, 0);

  return Object.freeze({
    totalCount: scores.length,
    averageHealthScore,
    highRiskCount,
    criticalCount,
    anomalyCount,
  });
}

/**
 * Calculate system-wide health score.
 */
function calculateSystemHealth(breakdown: EntityTypeBreakdown): number {
  const weights = {
    players: 25,
    tables: 25,
    clubs: 30,
    agents: 20,
  };

  let weightedSum = 0;
  let totalWeight = 0;

  for (const [key, weight] of Object.entries(weights)) {
    const summary = breakdown[key as keyof EntityTypeBreakdown];
    if (summary.totalCount > 0) {
      weightedSum += summary.averageHealthScore * weight;
      totalWeight += weight;
    }
  }

  if (totalWeight === 0) return 50; // Neutral if no data

  return Math.floor(weightedSum / totalWeight);
}

/**
 * Get system risk level from health score.
 */
function getSystemRiskLevel(healthScore: number): RiskLevel {
  if (healthScore < 20) return RiskLevel.CRITICAL;
  if (healthScore < 40) return RiskLevel.HIGH;
  if (healthScore < 70) return RiskLevel.MEDIUM;
  return RiskLevel.LOW;
}

/**
 * Extract critical items requiring attention.
 */
function extractCriticalItems(
  healthScores: readonly HealthScore[],
  anomalyOutputs: readonly AnomalyClassificationOutput[],
  riskRankings: readonly RiskRanking[]
): readonly CriticalItem[] {
  const items: CriticalItem[] = [];

  // Create lookup maps
  const healthMap = new Map(healthScores.map((s) => [s.entityId, s]));
  const anomalyMap = new Map(anomalyOutputs.map((a) => [a.entityId, a]));

  // Find entities with critical anomalies
  for (const anomalyOutput of anomalyOutputs) {
    if (anomalyOutput.criticalCount > 0) {
      const health = healthMap.get(anomalyOutput.entityId);
      if (health) {
        items.push({
          entityId: anomalyOutput.entityId,
          entityType: anomalyOutput.entityType,
          reason: `${anomalyOutput.criticalCount} critical anomalies detected`,
          severity: AnomalySeverity.CRITICAL,
          healthScore: health.overallScore,
          riskScore: 100 - health.overallScore + anomalyOutput.criticalCount * 10,
        });
      }
    }
  }

  // Find entities with critical health
  for (const health of healthScores) {
    if (health.riskLevel === RiskLevel.CRITICAL) {
      // Check if already added via anomaly
      if (!items.some((i) => i.entityId === health.entityId)) {
        items.push({
          entityId: health.entityId,
          entityType: health.entityType,
          reason: `Critical health score: ${health.overallScore}`,
          severity: AnomalySeverity.CRITICAL,
          healthScore: health.overallScore,
          riskScore: 100 - health.overallScore,
        });
      }
    }
  }

  // Sort by risk score (highest first)
  items.sort((a, b) => b.riskScore - a.riskScore);

  // Return top 10 critical items
  return Object.freeze(items.slice(0, 10));
}

/**
 * Calculate key metrics.
 */
function calculateKeyMetrics(
  healthScores: readonly HealthScore[],
  anomalyOutputs: readonly AnomalyClassificationOutput[]
): KeyMetricsSummary {
  if (healthScores.length === 0) {
    return Object.freeze({
      averageHealthScore: 0,
      averageRiskScore: 0,
      totalAnomalies: 0,
      criticalAnomalies: 0,
      healthyEntityPercentage: 0,
      anomalyEntityPercentage: 0,
    });
  }

  const totalHealth = healthScores.reduce((sum, s) => sum + s.overallScore, 0);
  const averageHealthScore = Math.floor(totalHealth / healthScores.length);
  const averageRiskScore = 100 - averageHealthScore;

  const totalAnomalies = anomalyOutputs.reduce((sum, a) => sum + a.totalAnomalies, 0);
  const criticalAnomalies = anomalyOutputs.reduce((sum, a) => sum + a.criticalCount, 0);

  const healthyCount = healthScores.filter((s) => s.overallScore >= 70).length;
  const healthyEntityPercentage = Math.floor((healthyCount * 10000) / healthScores.length);

  const entitiesWithAnomalies = anomalyOutputs.filter((a) => a.totalAnomalies > 0).length;
  const anomalyEntityPercentage = Math.floor(
    (entitiesWithAnomalies * 10000) / healthScores.length
  );

  return Object.freeze({
    averageHealthScore,
    averageRiskScore,
    totalAnomalies,
    criticalAnomalies,
    healthyEntityPercentage,
    anomalyEntityPercentage,
  });
}

/**
 * Calculate trend summary.
 */
function calculateTrendSummary(
  trendOutputs: readonly MultiMetricTrendOutput[]
): TrendSummary {
  let improvingCount = 0;
  let stableCount = 0;
  let deterioratingCount = 0;
  let volatileCount = 0;

  for (const output of trendOutputs) {
    switch (output.overallDirection) {
      case TrendDirection.IMPROVING:
        improvingCount++;
        break;
      case TrendDirection.STABLE:
        stableCount++;
        break;
      case TrendDirection.DETERIORATING:
        deterioratingCount++;
        break;
      case TrendDirection.VOLATILE:
        volatileCount++;
        break;
    }
  }

  // Determine overall trend
  let overallTrend: TrendDirection;
  if (deterioratingCount > improvingCount && deterioratingCount > stableCount) {
    overallTrend = TrendDirection.DETERIORATING;
  } else if (improvingCount > deterioratingCount && improvingCount > stableCount) {
    overallTrend = TrendDirection.IMPROVING;
  } else if (volatileCount > stableCount) {
    overallTrend = TrendDirection.VOLATILE;
  } else {
    overallTrend = TrendDirection.STABLE;
  }

  return Object.freeze({
    improvingCount,
    stableCount,
    deterioratingCount,
    volatileCount,
    overallTrend,
  });
}

// ============================================================================
// ENTITY DETAIL VIEW
// ============================================================================

/**
 * Detailed view for a single entity.
 */
export interface EntityDetailView {
  readonly entityId: GreyPartyId;
  readonly entityType: IntelligenceEntityType;
  readonly periodId: ReconciliationPeriodId;
  readonly timestamp: number;
  readonly healthScore: HealthScore;
  readonly anomalies: readonly AnomalyDescriptor[];
  readonly rank: number | null;
  readonly totalInRanking: number;
  readonly riskPercentile: number;
  readonly trends: readonly TrendAnalysis[];
  readonly overallAssessment: string;
  readonly checksum: string;
}

/**
 * Generate detailed view for a single entity.
 */
export function generateEntityDetailView(
  entityId: GreyPartyId,
  healthScore: HealthScore,
  anomalyOutput: AnomalyClassificationOutput | null,
  riskRanking: RiskRanking | null,
  trendOutput: MultiMetricTrendOutput | null
): EntityDetailView | null {
  if (!healthScore) return null;

  // Get rank info
  let rank: number | null = null;
  let totalInRanking = 0;
  let riskPercentile = 0;

  if (riskRanking) {
    const entry = riskRanking.entries.find((e: RiskRankEntry) => e.entityId === entityId);
    if (entry) {
      rank = entry.rank;
      totalInRanking = riskRanking.totalEntities;
      // Percentile: higher rank = worse percentile
      riskPercentile = Math.floor((entry.rank * 10000) / totalInRanking);
    }
  }

  // Get anomalies
  const anomalies = anomalyOutput ? anomalyOutput.anomalies : [];

  // Get trends
  const trends = trendOutput ? trendOutput.trends : [];

  // Generate assessment
  const overallAssessment = generateAssessment(
    healthScore,
    anomalyOutput,
    trendOutput
  );

  const checksumData = {
    entityId,
    healthScore: healthScore.overallScore,
    anomalyCount: anomalies.length,
    rank,
  };

  return Object.freeze({
    entityId,
    entityType: healthScore.entityType,
    periodId: healthScore.periodId,
    timestamp: healthScore.timestamp,
    healthScore,
    anomalies: Object.freeze([...anomalies]),
    rank,
    totalInRanking,
    riskPercentile,
    trends: Object.freeze([...trends]),
    overallAssessment,
    checksum: calculateChecksum('edv', checksumData),
  });
}

/**
 * Generate assessment text.
 */
function generateAssessment(
  healthScore: HealthScore,
  anomalyOutput: AnomalyClassificationOutput | null,
  trendOutput: MultiMetricTrendOutput | null
): string {
  const parts: string[] = [];

  // Health assessment
  if (healthScore.overallScore >= 80) {
    parts.push('Entity is in good health');
  } else if (healthScore.overallScore >= 60) {
    parts.push('Entity health is moderate');
  } else if (healthScore.overallScore >= 40) {
    parts.push('Entity health needs attention');
  } else {
    parts.push('Entity health is critical');
  }

  // Anomaly assessment
  if (anomalyOutput) {
    if (anomalyOutput.criticalCount > 0) {
      parts.push(`with ${anomalyOutput.criticalCount} critical anomalies`);
    } else if (anomalyOutput.alertCount > 0) {
      parts.push(`with ${anomalyOutput.alertCount} alerts`);
    } else if (anomalyOutput.totalAnomalies === 0) {
      parts.push('with no anomalies detected');
    }
  }

  // Trend assessment
  if (trendOutput) {
    switch (trendOutput.overallDirection) {
      case TrendDirection.IMPROVING:
        parts.push('and trends are improving');
        break;
      case TrendDirection.DETERIORATING:
        parts.push('and trends are deteriorating');
        break;
      case TrendDirection.VOLATILE:
        parts.push('with volatile metrics');
        break;
      case TrendDirection.STABLE:
        parts.push('with stable metrics');
        break;
    }
  }

  return parts.join(' ');
}

// ============================================================================
// ANOMALY SUMMARY VIEW
// ============================================================================

/**
 * Anomaly summary across all entities.
 */
export interface AnomalySummaryView {
  readonly periodId: ReconciliationPeriodId;
  readonly timestamp: number;
  readonly totalAnomalies: number;
  readonly byType: ReadonlyMap<AnomalyType, number>;
  readonly bySeverity: ReadonlyMap<AnomalySeverity, number>;
  readonly byEntityType: ReadonlyMap<IntelligenceEntityType, number>;
  readonly topAnomalies: readonly AnomalyDescriptor[];
  readonly entitiesAffected: number;
  readonly checksum: string;
}

/**
 * Generate anomaly summary view.
 */
export function generateAnomalySummaryView(
  periodId: ReconciliationPeriodId,
  timestamp: number,
  anomalyOutputs: readonly AnomalyClassificationOutput[]
): AnomalySummaryView {
  const byType = new Map<AnomalyType, number>();
  const bySeverity = new Map<AnomalySeverity, number>();
  const byEntityType = new Map<IntelligenceEntityType, number>();
  const allAnomalies: AnomalyDescriptor[] = [];
  const affectedEntities = new Set<GreyPartyId>();

  for (const output of anomalyOutputs) {
    if (output.totalAnomalies > 0) {
      affectedEntities.add(output.entityId);

      // Count by entity type
      byEntityType.set(
        output.entityType,
        (byEntityType.get(output.entityType) || 0) + output.totalAnomalies
      );

      for (const anomaly of output.anomalies) {
        allAnomalies.push(anomaly);

        // Count by type
        byType.set(anomaly.anomalyType, (byType.get(anomaly.anomalyType) || 0) + 1);

        // Count by severity
        bySeverity.set(anomaly.severity, (bySeverity.get(anomaly.severity) || 0) + 1);
      }
    }
  }

  // Sort and get top anomalies
  allAnomalies.sort((a: AnomalyDescriptor, b: AnomalyDescriptor) => {
    const severityOrder: Record<AnomalySeverity, number> = {
      [AnomalySeverity.CRITICAL]: 0,
      [AnomalySeverity.ALERT]: 1,
      [AnomalySeverity.WARNING]: 2,
      [AnomalySeverity.INFO]: 3,
    };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });

  const topAnomalies = allAnomalies.slice(0, 20);

  const checksumData = {
    periodId,
    timestamp,
    totalAnomalies: allAnomalies.length,
    entitiesAffected: affectedEntities.size,
  };

  return Object.freeze({
    periodId,
    timestamp,
    totalAnomalies: allAnomalies.length,
    byType: Object.freeze(byType),
    bySeverity: Object.freeze(bySeverity),
    byEntityType: Object.freeze(byEntityType),
    topAnomalies: Object.freeze(topAnomalies),
    entitiesAffected: affectedEntities.size,
    checksum: calculateChecksum('asv', checksumData),
  });
}

// ============================================================================
// COMPARATIVE VIEW
// ============================================================================

/**
 * Period-over-period comparison.
 */
export interface PeriodComparisonView {
  readonly currentPeriodId: ReconciliationPeriodId;
  readonly previousPeriodId: ReconciliationPeriodId;
  readonly timestamp: number;
  readonly healthScoreChange: number;
  readonly anomalyCountChange: number;
  readonly highRiskCountChange: number;
  readonly newHighRiskEntities: readonly GreyPartyId[];
  readonly recoveredEntities: readonly GreyPartyId[];
  readonly assessment: string;
  readonly checksum: string;
}

/**
 * Generate period comparison view.
 */
export function generatePeriodComparisonView(
  currentPeriodId: ReconciliationPeriodId,
  previousPeriodId: ReconciliationPeriodId,
  timestamp: number,
  currentHealthScores: readonly HealthScore[],
  previousHealthScores: readonly HealthScore[],
  currentAnomalies: readonly AnomalyClassificationOutput[],
  previousAnomalies: readonly AnomalyClassificationOutput[]
): PeriodComparisonView {
  // Calculate averages
  const currentAvgHealth =
    currentHealthScores.length > 0
      ? Math.floor(
          currentHealthScores.reduce((s, h) => s + h.overallScore, 0) /
            currentHealthScores.length
        )
      : 0;

  const previousAvgHealth =
    previousHealthScores.length > 0
      ? Math.floor(
          previousHealthScores.reduce((s, h) => s + h.overallScore, 0) /
            previousHealthScores.length
        )
      : 0;

  const healthScoreChange = currentAvgHealth - previousAvgHealth;

  // Count anomalies
  const currentAnomalyCount = currentAnomalies.reduce(
    (s, a) => s + a.totalAnomalies,
    0
  );
  const previousAnomalyCount = previousAnomalies.reduce(
    (s, a) => s + a.totalAnomalies,
    0
  );
  const anomalyCountChange = currentAnomalyCount - previousAnomalyCount;

  // High risk entities
  const currentHighRisk = new Set(
    currentHealthScores
      .filter(
        (h) => h.riskLevel === RiskLevel.HIGH || h.riskLevel === RiskLevel.CRITICAL
      )
      .map((h) => h.entityId)
  );

  const previousHighRisk = new Set(
    previousHealthScores
      .filter(
        (h) => h.riskLevel === RiskLevel.HIGH || h.riskLevel === RiskLevel.CRITICAL
      )
      .map((h) => h.entityId)
  );

  const highRiskCountChange = currentHighRisk.size - previousHighRisk.size;

  const newHighRiskEntities: GreyPartyId[] = [];
  const recoveredEntities: GreyPartyId[] = [];

  for (const id of currentHighRisk) {
    if (!previousHighRisk.has(id)) {
      newHighRiskEntities.push(id);
    }
  }

  for (const id of previousHighRisk) {
    if (!currentHighRisk.has(id)) {
      recoveredEntities.push(id);
    }
  }

  // Generate assessment
  let assessment: string;
  if (healthScoreChange > 5 && anomalyCountChange < 0) {
    assessment = 'System health improved significantly';
  } else if (healthScoreChange < -5 || anomalyCountChange > 5) {
    assessment = 'System health declined - attention needed';
  } else if (newHighRiskEntities.length > recoveredEntities.length) {
    assessment = 'More entities entering high risk state';
  } else if (recoveredEntities.length > newHighRiskEntities.length) {
    assessment = 'Risk levels improving - entities recovering';
  } else {
    assessment = 'System health relatively stable';
  }

  const checksumData = {
    currentPeriodId,
    previousPeriodId,
    timestamp,
    healthScoreChange,
    anomalyCountChange,
  };

  return Object.freeze({
    currentPeriodId,
    previousPeriodId,
    timestamp,
    healthScoreChange,
    anomalyCountChange,
    highRiskCountChange,
    newHighRiskEntities: Object.freeze(newHighRiskEntities),
    recoveredEntities: Object.freeze(recoveredEntities),
    assessment,
    checksum: calculateChecksum('pcv', checksumData),
  });
}
