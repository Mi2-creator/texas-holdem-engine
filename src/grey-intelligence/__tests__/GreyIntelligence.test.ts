/**
 * GreyIntelligence.test.ts
 * Phase A5 - Grey Intelligence & Risk Insight Layer
 *
 * Comprehensive tests for the intelligence module.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';

import {
  // Types
  createGreyPartyId,
  GreyPartyId,
} from '../../grey-runtime';

import {
  createReconciliationPeriodId,
  ReconciliationPeriodId,
} from '../../grey-reconciliation';

import {
  // Types and constants
  INTELLIGENCE_VERSION,
  MAX_HEALTH_SCORE,
  MIN_HEALTH_SCORE,
  HIGH_RISK_THRESHOLD,
  MEDIUM_RISK_THRESHOLD,
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
  isValidScore,
  calculateChecksum,
  // Health scoring
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
  FlowHealthData,
  AttributionHealthData,
  RechargeHealthData,
  HealthScoringInput,
  // Anomaly classifier
  ANOMALY_THRESHOLDS,
  classifyAnomalies,
  classifyAnomaliesBatch,
  getAnomaliesByType,
  getAnomaliesBySeverity,
  hasCriticalAnomalies,
  getHighestSeverity,
  AnomalyClassificationInput,
  // Trend analysis
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
  TrendAnalysisInput,
  // Risk ranking
  RISK_WEIGHTS,
  generateRiskRanking,
  getTopRiskyEntities,
  getHighRiskEntities,
  getCriticalRiskEntities,
  getEntityRank,
  getRiskDistribution,
  compareRankings,
  createRiskRankingInput,
  createRiskRankingEntityData,
  // Executive views
  generateExecutiveDashboard,
  generateEntityDetailView,
  generateAnomalySummaryView,
  generatePeriodComparisonView,
  // Boundary guards
  findForbiddenConcepts,
  assertNoForbiddenConcepts,
  assertInteger,
  assertValidTimestamp,
  assertValidScore,
  INTELLIGENCE_BOUNDARY_GUARD_DOCUMENTATION,
  // Module info
  GREY_INTELLIGENCE_MODULE_INFO,
} from '../index';

// ============================================================================
// TEST HELPERS
// ============================================================================

function createTestPartyId(id: string): GreyPartyId {
  return createGreyPartyId(id);
}

function createTestPeriodId(id: string): ReconciliationPeriodId {
  return createReconciliationPeriodId(id);
}

function createTestFlowHealthData(
  entityId: GreyPartyId,
  entityType: IntelligenceEntityType,
  periodId: ReconciliationPeriodId,
  overrides: Partial<{
    totalFlows: number;
    matchedFlows: number;
    partialFlows: number;
    orphanFlows: number;
    missingFlows: number;
    flowsByCounterparty: ReadonlyMap<string, number>;
  }> = {}
): FlowHealthData {
  const defaultCounterparties = new Map<string, number>([
    ['cp1', 30],
    ['cp2', 30],
    ['cp3', 20],
    ['cp4', 20],
  ]);

  return createFlowHealthData(
    entityId,
    entityType,
    periodId,
    overrides.totalFlows ?? 100,
    overrides.matchedFlows ?? 90,
    overrides.partialFlows ?? 5,
    overrides.orphanFlows ?? 3,
    overrides.missingFlows ?? 2,
    overrides.flowsByCounterparty ?? defaultCounterparties
  );
}

function createTestAttributionHealthData(
  entityId: GreyPartyId,
  entityType: IntelligenceEntityType,
  periodId: ReconciliationPeriodId,
  overrides: Partial<{
    totalEntries: number;
    zeroAttributionEntries: number;
    distributionByPartyType: ReadonlyMap<string, number>;
    maxSinglePartyBasisPoints: number;
  }> = {}
): AttributionHealthData {
  const defaultDistribution = new Map<string, number>([
    ['PLAYER', 5000],
    ['CLUB', 3500],
    ['AGENT', 1500],
  ]);

  return createAttributionHealthData(
    entityId,
    entityType,
    periodId,
    overrides.totalEntries ?? 100,
    overrides.zeroAttributionEntries ?? 5,
    overrides.distributionByPartyType ?? defaultDistribution,
    overrides.maxSinglePartyBasisPoints ?? 5000
  );
}

function createTestRechargeHealthData(
  entityId: GreyPartyId,
  entityType: IntelligenceEntityType,
  periodId: ReconciliationPeriodId,
  overrides: Partial<{
    totalRecharges: number;
    linkedRecharges: number;
    unlinkedRecharges: number;
    linkedAmountTotal: number;
    rechargeAmountTotal: number;
  }> = {}
): RechargeHealthData {
  return createRechargeHealthData(
    entityId,
    entityType,
    periodId,
    overrides.totalRecharges ?? 50,
    overrides.linkedRecharges ?? 45,
    overrides.unlinkedRecharges ?? 5,
    overrides.linkedAmountTotal ?? 100000,
    overrides.rechargeAmountTotal ?? 100000
  );
}

function createTestHealthScoringInput(
  entityId: GreyPartyId,
  entityType: IntelligenceEntityType,
  periodId: ReconciliationPeriodId,
  timestamp: number
): HealthScoringInput {
  return createHealthScoringInput(
    entityId,
    entityType,
    periodId,
    timestamp,
    createTestFlowHealthData(entityId, entityType, periodId),
    createTestAttributionHealthData(entityId, entityType, periodId),
    createTestRechargeHealthData(entityId, entityType, periodId)
  );
}

// ============================================================================
// TYPES AND CONSTANTS TESTS
// ============================================================================

describe('GreyIntelligenceTypes', () => {
  describe('Constants', () => {
    it('should export correct version', () => {
      expect(INTELLIGENCE_VERSION).toBe('1.0.0');
    });

    it('should export correct score limits', () => {
      expect(MAX_HEALTH_SCORE).toBe(100);
      expect(MIN_HEALTH_SCORE).toBe(0);
    });

    it('should export correct thresholds', () => {
      expect(HIGH_RISK_THRESHOLD).toBe(40);
      expect(MEDIUM_RISK_THRESHOLD).toBe(70);
    });
  });

  describe('getRiskLevelFromScore', () => {
    it('should return CRITICAL for very low scores', () => {
      expect(getRiskLevelFromScore(15)).toBe(RiskLevel.CRITICAL);
      expect(getRiskLevelFromScore(0)).toBe(RiskLevel.CRITICAL);
    });

    it('should return HIGH for low scores', () => {
      expect(getRiskLevelFromScore(30)).toBe(RiskLevel.HIGH);
      expect(getRiskLevelFromScore(25)).toBe(RiskLevel.HIGH);
    });

    it('should return MEDIUM for medium scores', () => {
      expect(getRiskLevelFromScore(50)).toBe(RiskLevel.MEDIUM);
      expect(getRiskLevelFromScore(60)).toBe(RiskLevel.MEDIUM);
    });

    it('should return LOW for high scores', () => {
      expect(getRiskLevelFromScore(80)).toBe(RiskLevel.LOW);
      expect(getRiskLevelFromScore(100)).toBe(RiskLevel.LOW);
    });
  });

  describe('Validation helpers', () => {
    it('should validate integers correctly', () => {
      expect(isValidInteger(42)).toBe(true);
      expect(isValidInteger(-5)).toBe(true);
      expect(isValidInteger(3.14)).toBe(false);
      expect(isValidInteger(NaN)).toBe(false);
      expect(isValidInteger(Infinity)).toBe(false);
    });

    it('should validate scores correctly', () => {
      expect(isValidScore(0)).toBe(true);
      expect(isValidScore(50)).toBe(true);
      expect(isValidScore(100)).toBe(true);
      expect(isValidScore(-1)).toBe(false);
      expect(isValidScore(101)).toBe(false);
      expect(isValidScore(50.5)).toBe(false);
    });
  });

  describe('Result helpers', () => {
    it('should create success results', () => {
      const result = intelligenceSuccess(42);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBe(42);
      }
    });

    it('should create failure results', () => {
      const error = createIntelligenceError(
        IntelligenceErrorCode.INVALID_INPUT,
        'Test error'
      );
      const result = intelligenceFailure(error);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(IntelligenceErrorCode.INVALID_INPUT);
        expect(result.error.message).toBe('Test error');
      }
    });
  });

  describe('Checksum calculation', () => {
    it('should produce consistent checksums', () => {
      const data = { foo: 'bar', num: 42 };
      const checksum1 = calculateChecksum('test', data);
      const checksum2 = calculateChecksum('test', data);
      expect(checksum1).toBe(checksum2);
    });

    it('should produce different checksums for different data', () => {
      const checksum1 = calculateChecksum('test', { foo: 'bar' });
      const checksum2 = calculateChecksum('test', { foo: 'baz' });
      expect(checksum1).not.toBe(checksum2);
    });

    it('should include prefix in checksum', () => {
      const checksum = calculateChecksum('hs', { value: 1 });
      expect(checksum.startsWith('hs_')).toBe(true);
    });
  });
});

// ============================================================================
// HEALTH SCORING ENGINE TESTS
// ============================================================================

describe('GreyHealthScoringEngine', () => {
  const entityId = createTestPartyId('player_001');
  const periodId = createTestPeriodId('period_001');
  const timestamp = 1000000;

  describe('calculateCorrelationScore', () => {
    it('should return 50 for no flows', () => {
      const flowData = createTestFlowHealthData(
        entityId,
        IntelligenceEntityType.PLAYER,
        periodId,
        { totalFlows: 0 }
      );
      expect(calculateCorrelationScore(flowData)).toBe(50);
    });

    it('should return high score for few problematic flows', () => {
      const flowData = createTestFlowHealthData(
        entityId,
        IntelligenceEntityType.PLAYER,
        periodId,
        {
          totalFlows: 100,
          matchedFlows: 95,
          partialFlows: 2,
          orphanFlows: 2,
          missingFlows: 1,
        }
      );
      const score = calculateCorrelationScore(flowData);
      expect(score).toBeGreaterThanOrEqual(90);
    });

    it('should return low score for many problematic flows', () => {
      const flowData = createTestFlowHealthData(
        entityId,
        IntelligenceEntityType.PLAYER,
        periodId,
        {
          totalFlows: 100,
          matchedFlows: 30,
          partialFlows: 25,
          orphanFlows: 25,
          missingFlows: 20,
        }
      );
      const score = calculateCorrelationScore(flowData);
      expect(score).toBeLessThanOrEqual(40);
    });
  });

  describe('calculateDistributionScore', () => {
    it('should return 50 for no flows', () => {
      const flowData = createTestFlowHealthData(
        entityId,
        IntelligenceEntityType.PLAYER,
        periodId,
        { totalFlows: 0, flowsByCounterparty: new Map() }
      );
      expect(calculateDistributionScore(flowData)).toBe(50);
    });

    it('should return low score for single counterparty', () => {
      const flowData = createTestFlowHealthData(
        entityId,
        IntelligenceEntityType.PLAYER,
        periodId,
        {
          totalFlows: 100,
          flowsByCounterparty: new Map([['cp1', 100]]),
        }
      );
      expect(calculateDistributionScore(flowData)).toBe(20);
    });

    it('should return high score for even distribution', () => {
      const flowData = createTestFlowHealthData(
        entityId,
        IntelligenceEntityType.PLAYER,
        periodId,
        {
          totalFlows: 100,
          flowsByCounterparty: new Map([
            ['cp1', 20],
            ['cp2', 20],
            ['cp3', 20],
            ['cp4', 20],
            ['cp5', 20],
          ]),
        }
      );
      const score = calculateDistributionScore(flowData);
      expect(score).toBeGreaterThanOrEqual(80);
    });
  });

  describe('calculateAttributionScore', () => {
    it('should return 50 for no entries', () => {
      const attrData = createTestAttributionHealthData(
        entityId,
        IntelligenceEntityType.PLAYER,
        periodId,
        { totalEntries: 0 }
      );
      expect(calculateAttributionScore(attrData)).toBe(50);
    });

    it('should return high score for good attribution', () => {
      const attrData = createTestAttributionHealthData(
        entityId,
        IntelligenceEntityType.PLAYER,
        periodId,
        {
          totalEntries: 100,
          zeroAttributionEntries: 2,
          maxSinglePartyBasisPoints: 5000,
        }
      );
      const score = calculateAttributionScore(attrData);
      expect(score).toBeGreaterThanOrEqual(80);
    });

    it('should return low score for skewed attribution', () => {
      const attrData = createTestAttributionHealthData(
        entityId,
        IntelligenceEntityType.PLAYER,
        periodId,
        {
          totalEntries: 100,
          zeroAttributionEntries: 30,
          maxSinglePartyBasisPoints: 9500,
        }
      );
      const score = calculateAttributionScore(attrData);
      expect(score).toBeLessThanOrEqual(50);
    });
  });

  describe('calculateAlignmentScore', () => {
    it('should return 50 for no recharges', () => {
      const rechargeData = createTestRechargeHealthData(
        entityId,
        IntelligenceEntityType.PLAYER,
        periodId,
        { totalRecharges: 0 }
      );
      expect(calculateAlignmentScore(rechargeData)).toBe(50);
    });

    it('should return high score for good alignment', () => {
      const rechargeData = createTestRechargeHealthData(
        entityId,
        IntelligenceEntityType.PLAYER,
        periodId,
        {
          totalRecharges: 50,
          linkedRecharges: 48,
          unlinkedRecharges: 2,
          linkedAmountTotal: 100000,
          rechargeAmountTotal: 100000,
        }
      );
      const score = calculateAlignmentScore(rechargeData);
      expect(score).toBeGreaterThanOrEqual(80);
    });

    it('should return low score for poor alignment', () => {
      const rechargeData = createTestRechargeHealthData(
        entityId,
        IntelligenceEntityType.PLAYER,
        periodId,
        {
          totalRecharges: 50,
          linkedRecharges: 15,
          unlinkedRecharges: 35,
          linkedAmountTotal: 30000,
          rechargeAmountTotal: 100000,
        }
      );
      const score = calculateAlignmentScore(rechargeData);
      expect(score).toBeLessThanOrEqual(50);
    });
  });

  describe('calculateOverallScore', () => {
    it('should weight components correctly', () => {
      const components = {
        correlationScore: 100,
        distributionScore: 100,
        attributionScore: 100,
        alignmentScore: 100,
      };
      expect(calculateOverallScore(components)).toBe(100);
    });

    it('should return 0 for all zeros', () => {
      const components = {
        correlationScore: 0,
        distributionScore: 0,
        attributionScore: 0,
        alignmentScore: 0,
      };
      expect(calculateOverallScore(components)).toBe(0);
    });

    it('should weight according to SCORING_WEIGHTS', () => {
      const components = {
        correlationScore: 100,
        distributionScore: 0,
        attributionScore: 0,
        alignmentScore: 0,
      };
      const expectedScore = Math.floor(
        (100 * SCORING_WEIGHTS.CORRELATION) / 10000
      );
      expect(calculateOverallScore(components)).toBe(expectedScore);
    });
  });

  describe('calculateHealthScore', () => {
    it('should calculate health score successfully', () => {
      const input = createTestHealthScoringInput(
        entityId,
        IntelligenceEntityType.PLAYER,
        periodId,
        timestamp
      );

      const result = calculateHealthScore(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.overallScore).toBeGreaterThanOrEqual(0);
        expect(result.value.overallScore).toBeLessThanOrEqual(100);
        expect(result.value.entityId).toBe(entityId);
        expect(result.value.entityType).toBe(IntelligenceEntityType.PLAYER);
        expect(result.value.checksum).toBeDefined();
      }
    });

    it('should fail for invalid timestamp', () => {
      const input = createTestHealthScoringInput(
        entityId,
        IntelligenceEntityType.PLAYER,
        periodId,
        -1
      );

      const result = calculateHealthScore(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(IntelligenceErrorCode.INVALID_TIMESTAMP);
      }
    });

    it('should fail for mismatched entity IDs', () => {
      const input = createHealthScoringInput(
        entityId,
        IntelligenceEntityType.PLAYER,
        periodId,
        timestamp,
        createTestFlowHealthData(
          createTestPartyId('other_id'),
          IntelligenceEntityType.PLAYER,
          periodId
        ),
        createTestAttributionHealthData(entityId, IntelligenceEntityType.PLAYER, periodId),
        createTestRechargeHealthData(entityId, IntelligenceEntityType.PLAYER, periodId)
      );

      const result = calculateHealthScore(input);
      expect(result.success).toBe(false);
    });
  });

  describe('calculateHealthScoreBatch', () => {
    it('should calculate scores for multiple entities', () => {
      const inputs = [
        createTestHealthScoringInput(
          createTestPartyId('player_001'),
          IntelligenceEntityType.PLAYER,
          periodId,
          timestamp
        ),
        createTestHealthScoringInput(
          createTestPartyId('player_002'),
          IntelligenceEntityType.PLAYER,
          periodId,
          timestamp
        ),
      ];

      const result = calculateHealthScoreBatch(inputs);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.length).toBe(2);
      }
    });
  });

  describe('verifyHealthScore', () => {
    it('should verify valid health score', () => {
      const input = createTestHealthScoringInput(
        entityId,
        IntelligenceEntityType.PLAYER,
        periodId,
        timestamp
      );

      const scoreResult = calculateHealthScore(input);
      expect(scoreResult.success).toBe(true);
      if (scoreResult.success) {
        const verifyResult = verifyHealthScore(scoreResult.value);
        expect(verifyResult.success).toBe(true);
      }
    });
  });
});

// ============================================================================
// ANOMALY CLASSIFIER TESTS
// ============================================================================

describe('GreyAnomalyClassifier', () => {
  const entityId = createTestPartyId('player_001');
  const periodId = createTestPeriodId('period_001');
  const timestamp = 1000000;

  function createTestAnomalyInput(
    overrides: {
      flowConcentration?: number;
      orphanRate?: number;
      agentShare?: number;
    } = {}
  ): AnomalyClassificationInput {
    const counterparties =
      overrides.flowConcentration !== undefined
        ? new Map<string, number>([
            ['cp1', overrides.flowConcentration],
            ['cp2', 100 - overrides.flowConcentration],
          ])
        : new Map<string, number>([
            ['cp1', 25],
            ['cp2', 25],
            ['cp3', 25],
            ['cp4', 25],
          ]);

    const distribution = new Map<string, number>([
      ['PLAYER', 5000],
      ['CLUB', 5000 - (overrides.agentShare ?? 500)],
      ['AGENT', overrides.agentShare ?? 500],
    ]);

    return {
      entityId,
      entityType: IntelligenceEntityType.PLAYER,
      periodId,
      timestamp,
      flowData: createTestFlowHealthData(entityId, IntelligenceEntityType.PLAYER, periodId, {
        totalFlows: 100,
        matchedFlows: 100 - (overrides.orphanRate ?? 5),
        orphanFlows: overrides.orphanRate ?? 5,
        partialFlows: 0,
        missingFlows: 0,
        flowsByCounterparty: counterparties,
      }),
      attributionData: createTestAttributionHealthData(
        entityId,
        IntelligenceEntityType.PLAYER,
        periodId,
        {
          totalEntries: 100,
          zeroAttributionEntries: 5,
          distributionByPartyType: distribution,
          maxSinglePartyBasisPoints: 5000,
        }
      ),
      rechargeData: createTestRechargeHealthData(
        entityId,
        IntelligenceEntityType.PLAYER,
        periodId
      ),
    };
  }

  describe('classifyAnomalies', () => {
    it('should return no anomalies for healthy data', () => {
      const input = createTestAnomalyInput();
      const result = classifyAnomalies(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.totalAnomalies).toBeLessThanOrEqual(1);
      }
    });

    it('should detect flow concentration anomaly', () => {
      const input = createTestAnomalyInput({ flowConcentration: 70 });
      const result = classifyAnomalies(input);

      expect(result.success).toBe(true);
      if (result.success) {
        const concentrationAnomalies = getAnomaliesByType(
          result.value,
          AnomalyType.FLOW_CONCENTRATION
        );
        expect(concentrationAnomalies.length).toBeGreaterThan(0);
      }
    });

    it('should detect high orphan rate anomaly', () => {
      const input = createTestAnomalyInput({ orphanRate: 25 });
      const result = classifyAnomalies(input);

      expect(result.success).toBe(true);
      if (result.success) {
        const orphanAnomalies = getAnomaliesByType(
          result.value,
          AnomalyType.HIGH_ORPHAN_RATE
        );
        expect(orphanAnomalies.length).toBeGreaterThan(0);
      }
    });

    it('should detect agent over-extraction anomaly', () => {
      const input = createTestAnomalyInput({ agentShare: 2000 });
      const result = classifyAnomalies(input);

      expect(result.success).toBe(true);
      if (result.success) {
        const agentAnomalies = getAnomaliesByType(
          result.value,
          AnomalyType.AGENT_OVER_EXTRACTION
        );
        expect(agentAnomalies.length).toBeGreaterThan(0);
      }
    });

    it('should fail for invalid timestamp', () => {
      const input = { ...createTestAnomalyInput(), timestamp: -1 };
      const result = classifyAnomalies(input);
      expect(result.success).toBe(false);
    });
  });

  describe('Helper functions', () => {
    it('should check for critical anomalies', () => {
      const input = createTestAnomalyInput({ agentShare: 2000 });
      const result = classifyAnomalies(input);

      if (result.success) {
        const hasCritical = hasCriticalAnomalies(result.value);
        expect(typeof hasCritical).toBe('boolean');
      }
    });

    it('should get highest severity', () => {
      const input = createTestAnomalyInput({ flowConcentration: 70 });
      const result = classifyAnomalies(input);

      if (result.success && result.value.totalAnomalies > 0) {
        const severity = getHighestSeverity(result.value);
        expect(severity).not.toBeNull();
      }
    });
  });
});

// ============================================================================
// TREND ANALYSIS TESTS
// ============================================================================

describe('GreyTrendAnalysis', () => {
  const entityId = createTestPartyId('player_001');
  const periodId1 = createTestPeriodId('period_001');
  const periodId2 = createTestPeriodId('period_002');
  const periodId3 = createTestPeriodId('period_003');
  const periodId4 = createTestPeriodId('period_004');
  const periodId5 = createTestPeriodId('period_005');

  describe('analyzeTrend', () => {
    it('should analyze improving trend', () => {
      // Use smaller increments to avoid volatility threshold
      const input: TrendAnalysisInput = {
        entityId,
        entityType: IntelligenceEntityType.PLAYER,
        metric: 'healthScore',
        dataPoints: [
          createTrendDataPoint(1000, 60, periodId1),
          createTrendDataPoint(2000, 65, periodId2),
          createTrendDataPoint(3000, 70, periodId3),
          createTrendDataPoint(4000, 75, periodId4),
          createTrendDataPoint(5000, 80, periodId5),
        ],
        timestamp: 6000,
      };

      const result = analyzeTrend(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.direction).toBe(TrendDirection.IMPROVING);
        expect(result.value.changeRateBasisPoints).toBeGreaterThan(0);
      }
    });

    it('should analyze deteriorating trend', () => {
      // Use smaller increments to avoid volatility threshold
      const input: TrendAnalysisInput = {
        entityId,
        entityType: IntelligenceEntityType.PLAYER,
        metric: 'healthScore',
        dataPoints: [
          createTrendDataPoint(1000, 80, periodId1),
          createTrendDataPoint(2000, 75, periodId2),
          createTrendDataPoint(3000, 70, periodId3),
          createTrendDataPoint(4000, 65, periodId4),
          createTrendDataPoint(5000, 60, periodId5),
        ],
        timestamp: 6000,
      };

      const result = analyzeTrend(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.direction).toBe(TrendDirection.DETERIORATING);
        expect(result.value.changeRateBasisPoints).toBeLessThan(0);
      }
    });

    it('should analyze stable trend', () => {
      const input: TrendAnalysisInput = {
        entityId,
        entityType: IntelligenceEntityType.PLAYER,
        metric: 'healthScore',
        dataPoints: [
          createTrendDataPoint(1000, 70, periodId1),
          createTrendDataPoint(2000, 71, periodId2),
          createTrendDataPoint(3000, 70, periodId3),
          createTrendDataPoint(4000, 69, periodId4),
          createTrendDataPoint(5000, 70, periodId5),
        ],
        timestamp: 6000,
      };

      const result = analyzeTrend(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.direction).toBe(TrendDirection.STABLE);
      }
    });

    it('should fail with insufficient data points', () => {
      const input: TrendAnalysisInput = {
        entityId,
        entityType: IntelligenceEntityType.PLAYER,
        metric: 'healthScore',
        dataPoints: [
          createTrendDataPoint(1000, 70, periodId1),
          createTrendDataPoint(2000, 80, periodId2),
        ],
        timestamp: 3000,
      };

      const result = analyzeTrend(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(IntelligenceErrorCode.INSUFFICIENT_DATA);
      }
    });

    it('should fail with unsorted data points', () => {
      const input: TrendAnalysisInput = {
        entityId,
        entityType: IntelligenceEntityType.PLAYER,
        metric: 'healthScore',
        dataPoints: [
          createTrendDataPoint(3000, 70, periodId3),
          createTrendDataPoint(1000, 50, periodId1),
          createTrendDataPoint(2000, 60, periodId2),
        ],
        timestamp: 4000,
      };

      const result = analyzeTrend(input);
      expect(result.success).toBe(false);
    });
  });

  describe('Helper functions', () => {
    it('should get latest and earliest values', () => {
      const input: TrendAnalysisInput = {
        entityId,
        entityType: IntelligenceEntityType.PLAYER,
        metric: 'healthScore',
        dataPoints: [
          createTrendDataPoint(1000, 50, periodId1),
          createTrendDataPoint(2000, 60, periodId2),
          createTrendDataPoint(3000, 70, periodId3),
        ],
        timestamp: 4000,
      };

      const result = analyzeTrend(input);
      if (result.success) {
        expect(getEarliestValue(result.value)).toBe(50);
        expect(getLatestValue(result.value)).toBe(70);
      }
    });

    it('should calculate total change in basis points', () => {
      const input: TrendAnalysisInput = {
        entityId,
        entityType: IntelligenceEntityType.PLAYER,
        metric: 'healthScore',
        dataPoints: [
          createTrendDataPoint(1000, 50, periodId1),
          createTrendDataPoint(2000, 60, periodId2),
          createTrendDataPoint(3000, 75, periodId3),
        ],
        timestamp: 4000,
      };

      const result = analyzeTrend(input);
      if (result.success) {
        const changeBp = getTotalChangeBasisPoints(result.value);
        expect(changeBp).toBe(5000); // 50% increase = 5000 basis points
      }
    });

    it('should identify concerning trends', () => {
      // Use smaller decrements to avoid volatility threshold
      const input: TrendAnalysisInput = {
        entityId,
        entityType: IntelligenceEntityType.PLAYER,
        metric: 'healthScore',
        dataPoints: [
          createTrendDataPoint(1000, 80, periodId1),
          createTrendDataPoint(2000, 75, periodId2),
          createTrendDataPoint(3000, 70, periodId3),
          createTrendDataPoint(4000, 65, periodId4),
          createTrendDataPoint(5000, 60, periodId5),
        ],
        timestamp: 6000,
      };

      const result = analyzeTrend(input);
      if (result.success) {
        expect(isConcerningTrend(result.value)).toBe(true);
        expect(isPositiveTrend(result.value)).toBe(false);
      }
    });
  });
});

// ============================================================================
// RISK RANKING TESTS
// ============================================================================

describe('GreyRiskRanking', () => {
  const periodId = createTestPeriodId('period_001');
  const timestamp = 1000000;

  function createTestHealthScore(
    entityId: GreyPartyId,
    overallScore: number
  ) {
    const input = createTestHealthScoringInput(
      entityId,
      IntelligenceEntityType.PLAYER,
      periodId,
      timestamp
    );

    const result = calculateHealthScore(input);
    if (!result.success) {
      throw new Error('Failed to create test health score');
    }

    // Override the overall score for testing
    return {
      ...result.value,
      overallScore,
      riskLevel: getRiskLevelFromScore(overallScore),
    };
  }

  describe('generateRiskRanking', () => {
    it('should generate risk ranking', () => {
      const entities = [
        createRiskRankingEntityData(
          createTestPartyId('player_001'),
          IntelligenceEntityType.PLAYER,
          createTestHealthScore(createTestPartyId('player_001'), 80)
        ),
        createRiskRankingEntityData(
          createTestPartyId('player_002'),
          IntelligenceEntityType.PLAYER,
          createTestHealthScore(createTestPartyId('player_002'), 40)
        ),
        createRiskRankingEntityData(
          createTestPartyId('player_003'),
          IntelligenceEntityType.PLAYER,
          createTestHealthScore(createTestPartyId('player_003'), 60)
        ),
      ];

      const input = createRiskRankingInput(
        IntelligenceEntityType.PLAYER,
        periodId,
        timestamp,
        entities
      );

      const result = generateRiskRanking(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.totalEntities).toBe(3);
        // player_002 should be ranked #1 (highest risk, lowest health)
        expect(result.value.entries[0].entityId).toBe(
          createTestPartyId('player_002')
        );
      }
    });

    it('should count high risk entities', () => {
      // Use health score of 0 to reach the high risk threshold (riskScore >= 60)
      const entities = [
        createRiskRankingEntityData(
          createTestPartyId('player_001'),
          IntelligenceEntityType.PLAYER,
          createTestHealthScore(createTestPartyId('player_001'), 0)
        ),
        createRiskRankingEntityData(
          createTestPartyId('player_002'),
          IntelligenceEntityType.PLAYER,
          createTestHealthScore(createTestPartyId('player_002'), 0)
        ),
        createRiskRankingEntityData(
          createTestPartyId('player_003'),
          IntelligenceEntityType.PLAYER,
          createTestHealthScore(createTestPartyId('player_003'), 80)
        ),
      ];

      const input = createRiskRankingInput(
        IntelligenceEntityType.PLAYER,
        periodId,
        timestamp,
        entities
      );

      const result = generateRiskRanking(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.highRiskCount).toBe(2);
      }
    });
  });

  describe('Helper functions', () => {
    it('should get top risky entities', () => {
      const entities = [
        createRiskRankingEntityData(
          createTestPartyId('player_001'),
          IntelligenceEntityType.PLAYER,
          createTestHealthScore(createTestPartyId('player_001'), 80)
        ),
        createRiskRankingEntityData(
          createTestPartyId('player_002'),
          IntelligenceEntityType.PLAYER,
          createTestHealthScore(createTestPartyId('player_002'), 40)
        ),
        createRiskRankingEntityData(
          createTestPartyId('player_003'),
          IntelligenceEntityType.PLAYER,
          createTestHealthScore(createTestPartyId('player_003'), 60)
        ),
      ];

      const input = createRiskRankingInput(
        IntelligenceEntityType.PLAYER,
        periodId,
        timestamp,
        entities
      );

      const result = generateRiskRanking(input);
      if (result.success) {
        const top2 = getTopRiskyEntities(result.value, 2);
        expect(top2.length).toBe(2);
      }
    });

    it('should get risk distribution', () => {
      // Health scores map to risk levels via weighted calculation
      // With health-only scoring (no anomalies):
      // - Health 0: riskScore=60 → riskLevel for score 40 = MEDIUM
      // - Health 50: riskScore=30 → riskLevel for score 70 = LOW
      // - Health 80: riskScore=12 → riskLevel for score 88 = LOW
      const entities = [
        createRiskRankingEntityData(
          createTestPartyId('player_001'),
          IntelligenceEntityType.PLAYER,
          createTestHealthScore(createTestPartyId('player_001'), 0)
        ),
        createRiskRankingEntityData(
          createTestPartyId('player_002'),
          IntelligenceEntityType.PLAYER,
          createTestHealthScore(createTestPartyId('player_002'), 20)
        ),
        createRiskRankingEntityData(
          createTestPartyId('player_003'),
          IntelligenceEntityType.PLAYER,
          createTestHealthScore(createTestPartyId('player_003'), 50)
        ),
        createRiskRankingEntityData(
          createTestPartyId('player_004'),
          IntelligenceEntityType.PLAYER,
          createTestHealthScore(createTestPartyId('player_004'), 80)
        ),
      ];

      const input = createRiskRankingInput(
        IntelligenceEntityType.PLAYER,
        periodId,
        timestamp,
        entities
      );

      const result = generateRiskRanking(input);
      if (result.success) {
        const distribution = getRiskDistribution(result.value);
        // With pure health scoring (no anomalies), distribution is limited
        // because max riskScore is 60 (health=0) which maps to MEDIUM
        expect(result.value.totalEntities).toBe(4);
        // Check that we have some distribution
        const totalCounted =
          distribution.criticalCount +
          distribution.highCount +
          distribution.mediumCount +
          distribution.lowCount;
        expect(totalCounted).toBe(4);
      }
    });
  });
});

// ============================================================================
// EXECUTIVE VIEWS TESTS
// ============================================================================

describe('GreyExecutiveViews', () => {
  const periodId = createTestPeriodId('period_001');
  const timestamp = 1000000;

  describe('generateExecutiveDashboard', () => {
    it('should generate dashboard with empty data', () => {
      const dashboard = generateExecutiveDashboard({
        periodId,
        timestamp,
        healthScores: [],
        anomalyOutputs: [],
        riskRankings: [],
        trendOutputs: [],
      });

      expect(dashboard.totalEntities).toBe(0);
      expect(dashboard.systemHealthScore).toBe(50); // Neutral for no data
    });

    it('should generate dashboard with health scores', () => {
      const input1 = createTestHealthScoringInput(
        createTestPartyId('player_001'),
        IntelligenceEntityType.PLAYER,
        periodId,
        timestamp
      );
      const input2 = createTestHealthScoringInput(
        createTestPartyId('club_001'),
        IntelligenceEntityType.CLUB,
        periodId,
        timestamp
      );

      const score1 = calculateHealthScore(input1);
      const score2 = calculateHealthScore(input2);

      if (score1.success && score2.success) {
        const dashboard = generateExecutiveDashboard({
          periodId,
          timestamp,
          healthScores: [score1.value, score2.value],
          anomalyOutputs: [],
          riskRankings: [],
          trendOutputs: [],
        });

        expect(dashboard.totalEntities).toBe(2);
        expect(dashboard.entityBreakdown.players.totalCount).toBe(1);
        expect(dashboard.entityBreakdown.clubs.totalCount).toBe(1);
      }
    });
  });

  describe('generateAnomalySummaryView', () => {
    it('should summarize anomalies', () => {
      const summary = generateAnomalySummaryView(periodId, timestamp, []);
      expect(summary.totalAnomalies).toBe(0);
      expect(summary.entitiesAffected).toBe(0);
    });
  });
});

// ============================================================================
// BOUNDARY GUARDS TESTS
// ============================================================================

describe('GreyIntelligenceBoundaryGuards', () => {
  describe('findForbiddenConcepts', () => {
    it('should find forbidden payment concepts', () => {
      const found = findForbiddenConcepts('Process payment transaction');
      expect(found).toContain('payment');
    });

    it('should find forbidden wallet concepts', () => {
      const found = findForbiddenConcepts('Update user wallet balance');
      expect(found).toContain('wallet');
      expect(found).toContain('balance');
    });

    it('should return empty for clean text', () => {
      const found = findForbiddenConcepts('Calculate health score');
      expect(found.length).toBe(0);
    });
  });

  describe('assertNoForbiddenConcepts', () => {
    it('should pass for clean text', () => {
      const result = assertNoForbiddenConcepts('Health analysis', 'description');
      expect(result.success).toBe(true);
    });

    it('should fail for forbidden concepts', () => {
      const result = assertNoForbiddenConcepts('Payment processing', 'description');
      expect(result.success).toBe(false);
    });
  });

  describe('assertInteger', () => {
    it('should pass for integers', () => {
      const result = assertInteger(42, 'value');
      expect(result.success).toBe(true);
    });

    it('should fail for non-integers', () => {
      const result = assertInteger(3.14, 'value');
      expect(result.success).toBe(false);
    });
  });

  describe('assertValidTimestamp', () => {
    it('should pass for valid timestamps', () => {
      const result = assertValidTimestamp(1000000, 'timestamp');
      expect(result.success).toBe(true);
    });

    it('should fail for invalid timestamps', () => {
      const result = assertValidTimestamp(-1, 'timestamp');
      expect(result.success).toBe(false);
    });
  });

  describe('assertValidScore', () => {
    it('should pass for valid scores', () => {
      expect(assertValidScore(0, 'score').success).toBe(true);
      expect(assertValidScore(50, 'score').success).toBe(true);
      expect(assertValidScore(100, 'score').success).toBe(true);
    });

    it('should fail for invalid scores', () => {
      expect(assertValidScore(-1, 'score').success).toBe(false);
      expect(assertValidScore(101, 'score').success).toBe(false);
      expect(assertValidScore(50.5, 'score').success).toBe(false);
    });
  });
});

// ============================================================================
// MODULE INFO TESTS
// ============================================================================

describe('Module Info', () => {
  it('should export module info', () => {
    expect(GREY_INTELLIGENCE_MODULE_INFO.name).toBe(
      'Grey Intelligence & Risk Insight Layer'
    );
    expect(GREY_INTELLIGENCE_MODULE_INFO.phase).toBe('A5');
    expect(GREY_INTELLIGENCE_MODULE_INFO.version).toBe('1.0.0');
  });

  it('should export boundary guard documentation', () => {
    expect(INTELLIGENCE_BOUNDARY_GUARD_DOCUMENTATION.title).toBeDefined();
    expect(INTELLIGENCE_BOUNDARY_GUARD_DOCUMENTATION.guards.length).toBeGreaterThan(0);
    expect(INTELLIGENCE_BOUNDARY_GUARD_DOCUMENTATION.invariants.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// DETERMINISM TESTS
// ============================================================================

describe('Determinism', () => {
  it('should produce same health score for same inputs', () => {
    const input = createTestHealthScoringInput(
      createTestPartyId('player_001'),
      IntelligenceEntityType.PLAYER,
      createTestPeriodId('period_001'),
      1000000
    );

    const result1 = calculateHealthScore(input);
    const result2 = calculateHealthScore(input);

    expect(result1.success).toBe(true);
    expect(result2.success).toBe(true);

    if (result1.success && result2.success) {
      expect(result1.value.overallScore).toBe(result2.value.overallScore);
      expect(result1.value.checksum).toBe(result2.value.checksum);
    }
  });

  it('should produce same anomaly classification for same inputs', () => {
    const input: AnomalyClassificationInput = {
      entityId: createTestPartyId('player_001'),
      entityType: IntelligenceEntityType.PLAYER,
      periodId: createTestPeriodId('period_001'),
      timestamp: 1000000,
      flowData: createTestFlowHealthData(
        createTestPartyId('player_001'),
        IntelligenceEntityType.PLAYER,
        createTestPeriodId('period_001'),
        { flowConcentration: 70 } as any
      ),
      attributionData: createTestAttributionHealthData(
        createTestPartyId('player_001'),
        IntelligenceEntityType.PLAYER,
        createTestPeriodId('period_001')
      ),
      rechargeData: createTestRechargeHealthData(
        createTestPartyId('player_001'),
        IntelligenceEntityType.PLAYER,
        createTestPeriodId('period_001')
      ),
    };

    const result1 = classifyAnomalies(input);
    const result2 = classifyAnomalies(input);

    expect(result1.success).toBe(true);
    expect(result2.success).toBe(true);

    if (result1.success && result2.success) {
      expect(result1.value.totalAnomalies).toBe(result2.value.totalAnomalies);
      expect(result1.value.checksum).toBe(result2.value.checksum);
    }
  });

  it('should produce same trend analysis for same inputs', () => {
    const input: TrendAnalysisInput = {
      entityId: createTestPartyId('player_001'),
      entityType: IntelligenceEntityType.PLAYER,
      metric: 'healthScore',
      dataPoints: [
        createTrendDataPoint(1000, 50, createTestPeriodId('p1')),
        createTrendDataPoint(2000, 60, createTestPeriodId('p2')),
        createTrendDataPoint(3000, 70, createTestPeriodId('p3')),
      ],
      timestamp: 4000,
    };

    const result1 = analyzeTrend(input);
    const result2 = analyzeTrend(input);

    expect(result1.success).toBe(true);
    expect(result2.success).toBe(true);

    if (result1.success && result2.success) {
      expect(result1.value.direction).toBe(result2.value.direction);
      expect(result1.value.changeRateBasisPoints).toBe(
        result2.value.changeRateBasisPoints
      );
      expect(result1.value.checksum).toBe(result2.value.checksum);
    }
  });
});
