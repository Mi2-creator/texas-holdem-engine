/**
 * Grey Intelligence & Risk Insight Layer Module
 * Phase A5 - Grey Intelligence & Risk Insight Layer
 *
 * PUBLIC API EXPORTS
 *
 * This module provides a deterministic, replay-safe intelligence layer that:
 * - Computes health scores for entities (Players, Tables, Clubs, Agents)
 * - Classifies anomalies without enforcement
 * - Analyzes trends over time windows
 * - Ranks entities by risk
 * - Provides executive summary views
 *
 * @external This module operates OUTSIDE the frozen engine.
 * @readonly This module NEVER mutates any data.
 * @deterministic Same inputs always produce same outputs.
 */

// ============================================================================
// TYPES
// ============================================================================

export type {
  HealthScoreId,
  AnomalyId,
  TrendAnalysisId,
  RiskRankingId,
  HealthScoreComponents,
  HealthScore,
  AnomalyDescriptor,
  TrendDataPoint,
  TrendAnalysis,
  RiskRankEntry,
  RiskRanking,
  IntelligenceError,
  IntelligenceResult,
} from './GreyIntelligenceTypes';

export {
  INTELLIGENCE_VERSION,
  MAX_HEALTH_SCORE,
  MIN_HEALTH_SCORE,
  HIGH_RISK_THRESHOLD,
  MEDIUM_RISK_THRESHOLD,
  INTELLIGENCE_FORBIDDEN_CONCEPTS,
  IntelligenceEntityType,
  RiskLevel,
  AnomalyType,
  TrendDirection,
  AnomalySeverity,
  IntelligenceErrorCode,
  createHealthScoreId,
  createAnomalyId,
  createTrendAnalysisId,
  createRiskRankingId,
  getRiskLevelFromScore,
  intelligenceSuccess,
  intelligenceFailure,
  createIntelligenceError,
  isValidInteger,
  isValidNonNegativeInteger,
  isValidPositiveInteger,
  isValidTimestamp,
  isValidScore,
  serializeForChecksum,
  simpleHash,
  calculateChecksum,
} from './GreyIntelligenceTypes';

// ============================================================================
// HEALTH SCORING ENGINE
// ============================================================================

export type {
  FlowHealthData,
  AttributionHealthData,
  RechargeHealthData,
  HealthScoringInput,
} from './GreyHealthScoringEngine';

export {
  SCORING_WEIGHTS,
  calculateCorrelationScore,
  calculateDistributionScore,
  calculateAttributionScore,
  calculateAlignmentScore,
  calculateOverallScore,
  calculateHealthScore,
  calculateHealthScoreBatch,
  createFlowHealthData,
  createAttributionHealthData,
  createRechargeHealthData,
  createHealthScoringInput,
  verifyHealthScore,
} from './GreyHealthScoringEngine';

// ============================================================================
// ANOMALY CLASSIFIER
// ============================================================================

export type {
  AnomalyClassificationInput,
  AnomalyClassificationOutput,
} from './GreyAnomalyClassifier';

export {
  ANOMALY_THRESHOLDS,
  classifyAnomalies,
  classifyAnomaliesBatch,
  getAnomaliesByType,
  getAnomaliesBySeverity,
  hasCriticalAnomalies,
  getHighestSeverity,
} from './GreyAnomalyClassifier';

// ============================================================================
// TREND ANALYSIS
// ============================================================================

export type {
  TrendAnalysisInput,
  MultiMetricTrendInput,
  MultiMetricTrendOutput,
} from './GreyTrendAnalysis';

export {
  TREND_THRESHOLDS,
  createTrendDataPoint,
  analyzeTrend,
  analyzeTrendBatch,
  analyzeMultiMetricTrends,
  getLatestValue,
  getEarliestValue,
  getTotalChangeBasisPoints,
  isConcerningTrend,
  isPositiveTrend,
  getTrendSummary,
  createTrendAnalysisInput,
} from './GreyTrendAnalysis';

// ============================================================================
// RISK RANKING
// ============================================================================

export type {
  RiskRankingEntityData,
  RiskRankingInput,
  RiskDistribution,
  RankingComparison,
} from './GreyRiskRanking';

export {
  RISK_WEIGHTS,
  ANOMALY_PENALTIES,
  generateRiskRanking,
  generateRiskRankingBatch,
  getTopRiskyEntities,
  getHighRiskEntities,
  getCriticalRiskEntities,
  getEntityRank,
  getEntitiesInRiskRange,
  getRiskDistribution,
  compareRankings,
  createRiskRankingInput,
  createRiskRankingEntityData,
} from './GreyRiskRanking';

// ============================================================================
// EXECUTIVE VIEWS
// ============================================================================

export type {
  ExecutiveDashboard,
  EntityTypeBreakdown,
  EntityTypeSummary,
  CriticalItem,
  KeyMetricsSummary,
  TrendSummary,
  ExecutiveDashboardInput,
  EntityDetailView,
  AnomalySummaryView,
  PeriodComparisonView,
} from './GreyExecutiveViews';

export {
  generateExecutiveDashboard,
  generateEntityDetailView,
  generateAnomalySummaryView,
  generatePeriodComparisonView,
} from './GreyExecutiveViews';

// ============================================================================
// BOUNDARY GUARDS
// ============================================================================

export {
  ENFORCEMENT_BLOCKED,
  AUTOMATED_ACTIONS_BLOCKED,
  MUTATION_BLOCKED,
  ENGINE_IMPORT_BLOCKED,
  IMPLICIT_TIME_BLOCKED,
  EXTERNAL_COMMUNICATION_BLOCKED,
  STORAGE_ACCESS_BLOCKED,
  findForbiddenConcepts,
  assertNoForbiddenConcepts,
  assertInteger,
  assertNonNegativeInteger,
  assertPositiveInteger,
  assertValidTimestamp,
  assertValidScore,
  validateAll,
  assertAnalysisOnly,
  assertNoEnforcement,
  INTELLIGENCE_BOUNDARY_GUARD_DOCUMENTATION,
} from './GreyIntelligenceBoundaryGuards';

// ============================================================================
// MODULE DOCUMENTATION
// ============================================================================

/**
 * Grey Intelligence module documentation.
 */
export const GREY_INTELLIGENCE_MODULE_INFO = Object.freeze({
  name: 'Grey Intelligence & Risk Insight Layer',
  version: '1.0.0',
  phase: 'A5',

  description: Object.freeze([
    'Deterministic, replay-safe intelligence layer',
    'Computes health scores for entities',
    'Classifies anomalies without enforcement',
    'Analyzes trends over time windows',
    'Ranks entities by risk level',
    'Provides executive summary views',
  ]),

  guarantees: Object.freeze([
    'Deterministic - same inputs produce same outputs',
    'Read-only - no mutations to any state',
    'Replay-safe - can be replayed with same inputs to verify',
    'Analysis-only - no enforcement or automated actions',
    'Integer-only - no floats or decimals',
    'No implicit time - all timestamps explicit',
    'Engine-safe - no engine imports or modifications',
  ]),

  restrictions: Object.freeze([
    'No payment/wallet/crypto/balance terminology',
    'No enforcement actions',
    'No automated actions',
    'No engine imports',
    'No mutations to any data',
    'No external communication',
    'No direct storage access',
    'No system clock access',
    'No async operations',
    'No IO operations',
  ]),

  components: Object.freeze([
    'GreyIntelligenceTypes - Core types, enums, utilities',
    'GreyHealthScoringEngine - Health score calculation',
    'GreyAnomalyClassifier - Anomaly detection and classification',
    'GreyTrendAnalysis - Time-window trend detection',
    'GreyRiskRanking - Risk-based entity ranking',
    'GreyExecutiveViews - Executive summary views',
    'GreyIntelligenceBoundaryGuards - Constraint enforcement',
  ]),
});
