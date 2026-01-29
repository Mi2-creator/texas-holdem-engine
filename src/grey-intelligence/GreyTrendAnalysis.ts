/**
 * GreyTrendAnalysis.ts
 * Phase A5 - Grey Intelligence & Risk Insight Layer
 *
 * TREND ANALYSIS ENGINE
 *
 * This module performs time-window trend detection.
 * It analyzes historical data points to determine:
 * - Trend direction (improving, stable, deteriorating, volatile)
 * - Rate of change
 * - Statistical significance
 *
 * @external This module operates OUTSIDE the frozen engine.
 * @readonly This module NEVER mutates any data.
 * @deterministic Same inputs always produce same outputs.
 */

import { GreyPartyId } from '../grey-runtime';
import { ReconciliationPeriodId } from '../grey-reconciliation';
import {
  TrendAnalysis,
  TrendAnalysisId,
  TrendDataPoint,
  TrendDirection,
  IntelligenceEntityType,
  IntelligenceResult,
  IntelligenceErrorCode,
  createTrendAnalysisId,
  intelligenceSuccess,
  intelligenceFailure,
  createIntelligenceError,
  isValidTimestamp,
  isValidInteger,
  calculateChecksum,
} from './GreyIntelligenceTypes';

// ============================================================================
// TREND ANALYSIS CONSTANTS
// ============================================================================

/**
 * Thresholds for trend analysis.
 * Change rates are in basis points per period.
 */
export const TREND_THRESHOLDS = {
  /** Minimum data points required for trend analysis */
  MIN_DATA_POINTS: 3,

  /** Minimum data points for statistically significant trend */
  MIN_POINTS_FOR_SIGNIFICANCE: 5,

  /** Change rate threshold for "improving" (positive change > 500 bp) */
  IMPROVING_THRESHOLD: 500,

  /** Change rate threshold for "deteriorating" (negative change < -500 bp) */
  DETERIORATING_THRESHOLD: -500,

  /** Volatility threshold (standard deviation > 1500 bp) */
  VOLATILITY_THRESHOLD: 1500,

  /** Maximum allowed gap between data points (3 periods) */
  MAX_PERIOD_GAP: 3,
} as const;

// ============================================================================
// INPUT TYPES
// ============================================================================

/**
 * Input for trend analysis.
 */
export interface TrendAnalysisInput {
  readonly entityId: GreyPartyId;
  readonly entityType: IntelligenceEntityType;
  /** Metric name being analyzed */
  readonly metric: string;
  /** Data points in chronological order */
  readonly dataPoints: readonly TrendDataPoint[];
  /** Analysis timestamp */
  readonly timestamp: number;
}

/**
 * Create a trend data point.
 */
export function createTrendDataPoint(
  timestamp: number,
  value: number,
  periodId: ReconciliationPeriodId
): TrendDataPoint {
  return Object.freeze({ timestamp, value, periodId });
}

// ============================================================================
// STATISTICAL HELPERS
// ============================================================================

/**
 * Calculate mean of values.
 * Uses integer math (returns value in basis points).
 */
function calculateMean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sum = values.reduce((a, b) => a + b, 0);
  return Math.floor((sum * 10000) / values.length) / 10000;
}

/**
 * Calculate standard deviation in basis points.
 */
function calculateStdDevBasisPoints(values: readonly number[], mean: number): number {
  if (values.length < 2) return 0;

  let sumSquaredDiff = 0;
  for (const value of values) {
    const diff = value - mean;
    sumSquaredDiff += diff * diff;
  }

  const variance = sumSquaredDiff / (values.length - 1);
  const stdDev = Math.sqrt(variance);

  // Convert to basis points relative to mean
  if (mean === 0) return 0;
  return Math.floor((stdDev * 10000) / Math.abs(mean));
}

/**
 * Calculate linear regression slope in basis points per period.
 * Uses least squares method with integer math.
 */
function calculateSlopeBasisPoints(points: readonly TrendDataPoint[]): number {
  if (points.length < 2) return 0;

  const n = points.length;

  // Use indices as x values (0, 1, 2, ...)
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;

  for (let i = 0; i < n; i++) {
    const x = i;
    const y = points[i].value;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  }

  const denominator = n * sumXX - sumX * sumX;
  if (denominator === 0) return 0;

  // Slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX)
  const slope = (n * sumXY - sumX * sumY) / denominator;

  // Convert to basis points relative to first value
  const firstValue = points[0].value;
  if (firstValue === 0) return 0;

  return Math.floor((slope * 10000) / Math.abs(firstValue));
}

/**
 * Determine if trend is statistically significant.
 * Uses simple criteria based on data count and consistency.
 */
function isTrendSignificant(
  points: readonly TrendDataPoint[],
  slopeBasisPoints: number,
  stdDevBasisPoints: number
): boolean {
  // Need minimum data points
  if (points.length < TREND_THRESHOLDS.MIN_POINTS_FOR_SIGNIFICANCE) {
    return false;
  }

  // If slope is very small, not significant
  if (Math.abs(slopeBasisPoints) < 100) {
    return false;
  }

  // If standard deviation is much larger than slope, not significant
  // (too noisy to determine trend)
  if (stdDevBasisPoints > Math.abs(slopeBasisPoints) * 3) {
    return false;
  }

  return true;
}

/**
 * Determine trend direction from slope and volatility.
 */
function determineTrendDirection(
  slopeBasisPoints: number,
  stdDevBasisPoints: number
): TrendDirection {
  // High volatility = volatile
  if (stdDevBasisPoints > TREND_THRESHOLDS.VOLATILITY_THRESHOLD) {
    return TrendDirection.VOLATILE;
  }

  // Strong positive slope = improving
  if (slopeBasisPoints > TREND_THRESHOLDS.IMPROVING_THRESHOLD) {
    return TrendDirection.IMPROVING;
  }

  // Strong negative slope = deteriorating
  if (slopeBasisPoints < TREND_THRESHOLDS.DETERIORATING_THRESHOLD) {
    return TrendDirection.DETERIORATING;
  }

  // Otherwise = stable
  return TrendDirection.STABLE;
}

// ============================================================================
// MAIN ANALYSIS FUNCTION
// ============================================================================

/**
 * Analyze trend for an entity's metric.
 *
 * @param input - Trend analysis input
 * @returns Result with trend analysis
 */
export function analyzeTrend(input: TrendAnalysisInput): IntelligenceResult<TrendAnalysis> {
  // Validate timestamp
  if (!isValidTimestamp(input.timestamp)) {
    return intelligenceFailure(
      createIntelligenceError(
        IntelligenceErrorCode.INVALID_TIMESTAMP,
        `Invalid timestamp: ${input.timestamp}`
      )
    );
  }

  // Validate minimum data points
  if (input.dataPoints.length < TREND_THRESHOLDS.MIN_DATA_POINTS) {
    return intelligenceFailure(
      createIntelligenceError(
        IntelligenceErrorCode.INSUFFICIENT_DATA,
        `Need at least ${TREND_THRESHOLDS.MIN_DATA_POINTS} data points, got ${input.dataPoints.length}`
      )
    );
  }

  // Validate data points are sorted by timestamp
  for (let i = 1; i < input.dataPoints.length; i++) {
    if (input.dataPoints[i].timestamp <= input.dataPoints[i - 1].timestamp) {
      return intelligenceFailure(
        createIntelligenceError(
          IntelligenceErrorCode.INVALID_INPUT,
          'Data points must be sorted in chronological order'
        )
      );
    }
  }

  // Validate all values are integers
  for (const point of input.dataPoints) {
    if (!isValidInteger(point.value)) {
      return intelligenceFailure(
        createIntelligenceError(
          IntelligenceErrorCode.INVALID_INPUT,
          `Invalid value at timestamp ${point.timestamp}: ${point.value}`
        )
      );
    }
  }

  // Calculate statistics
  const values = input.dataPoints.map((p) => p.value);
  const mean = calculateMean(values);
  const stdDevBasisPoints = calculateStdDevBasisPoints(values, mean);
  const slopeBasisPoints = calculateSlopeBasisPoints(input.dataPoints);

  // Determine direction and significance
  const direction = determineTrendDirection(slopeBasisPoints, stdDevBasisPoints);
  const isSignificant = isTrendSignificant(input.dataPoints, slopeBasisPoints, stdDevBasisPoints);

  // Generate analysis ID
  const analysisId = createTrendAnalysisId(
    `ta_${input.entityId}_${input.metric}_${input.timestamp}`
  );

  // Calculate checksum
  const checksumData = {
    entityId: input.entityId,
    entityType: input.entityType,
    metric: input.metric,
    direction,
    changeRateBasisPoints: slopeBasisPoints,
    isSignificant,
    dataPointCount: input.dataPoints.length,
    timestamp: input.timestamp,
  };

  const analysis: TrendAnalysis = Object.freeze({
    analysisId,
    entityId: input.entityId,
    entityType: input.entityType,
    metric: input.metric,
    direction,
    dataPoints: Object.freeze([...input.dataPoints]),
    changeRateBasisPoints: slopeBasisPoints,
    isSignificant,
    timestamp: input.timestamp,
    checksum: calculateChecksum('ta', checksumData),
  });

  return intelligenceSuccess(analysis);
}

// ============================================================================
// BATCH ANALYSIS
// ============================================================================

/**
 * Analyze trends for multiple inputs.
 */
export function analyzeTrendBatch(
  inputs: readonly TrendAnalysisInput[]
): IntelligenceResult<readonly TrendAnalysis[]> {
  const analyses: TrendAnalysis[] = [];
  const errors: string[] = [];

  for (const input of inputs) {
    const result = analyzeTrend(input);
    if (result.success) {
      analyses.push(result.value);
    } else {
      errors.push(`${input.entityId}/${input.metric}: ${result.error.message}`);
    }
  }

  if (analyses.length === 0 && errors.length > 0) {
    return intelligenceFailure(
      createIntelligenceError(
        IntelligenceErrorCode.INVALID_INPUT,
        `All trend analysis failed: ${errors.join('; ')}`
      )
    );
  }

  return intelligenceSuccess(Object.freeze(analyses));
}

// ============================================================================
// MULTI-METRIC ANALYSIS
// ============================================================================

/**
 * Input for multi-metric trend analysis.
 */
export interface MultiMetricTrendInput {
  readonly entityId: GreyPartyId;
  readonly entityType: IntelligenceEntityType;
  readonly timestamp: number;
  /** Map of metric name to data points */
  readonly metricData: ReadonlyMap<string, readonly TrendDataPoint[]>;
}

/**
 * Output from multi-metric trend analysis.
 */
export interface MultiMetricTrendOutput {
  readonly entityId: GreyPartyId;
  readonly entityType: IntelligenceEntityType;
  readonly timestamp: number;
  readonly trends: readonly TrendAnalysis[];
  readonly overallDirection: TrendDirection;
  readonly deterioratingMetrics: readonly string[];
  readonly improvingMetrics: readonly string[];
  readonly checksum: string;
}

/**
 * Analyze trends for multiple metrics of an entity.
 */
export function analyzeMultiMetricTrends(
  input: MultiMetricTrendInput
): IntelligenceResult<MultiMetricTrendOutput> {
  if (!isValidTimestamp(input.timestamp)) {
    return intelligenceFailure(
      createIntelligenceError(
        IntelligenceErrorCode.INVALID_TIMESTAMP,
        `Invalid timestamp: ${input.timestamp}`
      )
    );
  }

  const trends: TrendAnalysis[] = [];
  const deterioratingMetrics: string[] = [];
  const improvingMetrics: string[] = [];

  for (const [metric, dataPoints] of input.metricData) {
    const trendInput: TrendAnalysisInput = {
      entityId: input.entityId,
      entityType: input.entityType,
      metric,
      dataPoints,
      timestamp: input.timestamp,
    };

    const result = analyzeTrend(trendInput);
    if (result.success) {
      trends.push(result.value);

      if (result.value.isSignificant) {
        if (result.value.direction === TrendDirection.DETERIORATING) {
          deterioratingMetrics.push(metric);
        } else if (result.value.direction === TrendDirection.IMPROVING) {
          improvingMetrics.push(metric);
        }
      }
    }
  }

  if (trends.length === 0) {
    return intelligenceFailure(
      createIntelligenceError(
        IntelligenceErrorCode.INSUFFICIENT_DATA,
        'No metrics could be analyzed'
      )
    );
  }

  // Determine overall direction
  let overallDirection: TrendDirection;
  if (deterioratingMetrics.length > improvingMetrics.length) {
    overallDirection = TrendDirection.DETERIORATING;
  } else if (improvingMetrics.length > deterioratingMetrics.length) {
    overallDirection = TrendDirection.IMPROVING;
  } else if (trends.some((t) => t.direction === TrendDirection.VOLATILE)) {
    overallDirection = TrendDirection.VOLATILE;
  } else {
    overallDirection = TrendDirection.STABLE;
  }

  const checksumData = {
    entityId: input.entityId,
    entityType: input.entityType,
    timestamp: input.timestamp,
    trendCount: trends.length,
    overallDirection,
  };

  const output: MultiMetricTrendOutput = Object.freeze({
    entityId: input.entityId,
    entityType: input.entityType,
    timestamp: input.timestamp,
    trends: Object.freeze(trends),
    overallDirection,
    deterioratingMetrics: Object.freeze(deterioratingMetrics),
    improvingMetrics: Object.freeze(improvingMetrics),
    checksum: calculateChecksum('mmt', checksumData),
  });

  return intelligenceSuccess(output);
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get the latest value from a trend analysis.
 */
export function getLatestValue(analysis: TrendAnalysis): number | null {
  if (analysis.dataPoints.length === 0) return null;
  return analysis.dataPoints[analysis.dataPoints.length - 1].value;
}

/**
 * Get the earliest value from a trend analysis.
 */
export function getEarliestValue(analysis: TrendAnalysis): number | null {
  if (analysis.dataPoints.length === 0) return null;
  return analysis.dataPoints[0].value;
}

/**
 * Get the total change (latest - earliest) in basis points.
 */
export function getTotalChangeBasisPoints(analysis: TrendAnalysis): number {
  const earliest = getEarliestValue(analysis);
  const latest = getLatestValue(analysis);

  if (earliest === null || latest === null || earliest === 0) return 0;

  return Math.floor(((latest - earliest) * 10000) / Math.abs(earliest));
}

/**
 * Check if a trend is concerning (deteriorating with significance).
 */
export function isConcerningTrend(analysis: TrendAnalysis): boolean {
  return analysis.isSignificant && analysis.direction === TrendDirection.DETERIORATING;
}

/**
 * Check if a trend is positive (improving with significance).
 */
export function isPositiveTrend(analysis: TrendAnalysis): boolean {
  return analysis.isSignificant && analysis.direction === TrendDirection.IMPROVING;
}

/**
 * Get trend summary description.
 */
export function getTrendSummary(analysis: TrendAnalysis): string {
  const changePercent = (analysis.changeRateBasisPoints / 100).toFixed(1);
  const significance = analysis.isSignificant ? 'significant' : 'not significant';

  return (
    `${analysis.metric}: ${analysis.direction} (${changePercent}% per period, ${significance})`
  );
}

/**
 * Create trend analysis input helper.
 */
export function createTrendAnalysisInput(
  entityId: GreyPartyId,
  entityType: IntelligenceEntityType,
  metric: string,
  dataPoints: readonly TrendDataPoint[],
  timestamp: number
): TrendAnalysisInput {
  return Object.freeze({
    entityId,
    entityType,
    metric,
    dataPoints: Object.freeze([...dataPoints]),
    timestamp,
  });
}
