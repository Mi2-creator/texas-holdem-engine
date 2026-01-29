/**
 * GreyIntelligenceTypes.ts
 * Phase A5 - Grey Intelligence & Risk Insight Layer
 *
 * CORE TYPES AND ENUMS
 *
 * This module defines types for the intelligence/risk insight layer.
 * All operations are READ-ONLY and deterministic.
 *
 * @external This module operates OUTSIDE the frozen engine.
 * @readonly This module NEVER mutates any data.
 * @deterministic Same inputs always produce same outputs.
 */

import { GreyFlowId, GreyPartyId } from '../grey-runtime';
import { ReconciliationPeriodId } from '../grey-reconciliation';

// ============================================================================
// VERSION AND CONSTANTS
// ============================================================================

/**
 * Intelligence module version.
 */
export const INTELLIGENCE_VERSION = '1.0.0' as const;

/**
 * Maximum health score (perfect health).
 */
export const MAX_HEALTH_SCORE = 100 as const;

/**
 * Minimum health score (critical).
 */
export const MIN_HEALTH_SCORE = 0 as const;

/**
 * Threshold for high risk (below this is high risk).
 */
export const HIGH_RISK_THRESHOLD = 40 as const;

/**
 * Threshold for medium risk (below this, above HIGH_RISK is medium).
 */
export const MEDIUM_RISK_THRESHOLD = 70 as const;

/**
 * Forbidden concepts in intelligence module.
 */
export const INTELLIGENCE_FORBIDDEN_CONCEPTS = Object.freeze([
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
]) as readonly string[];

// ============================================================================
// BRANDED ID TYPES
// ============================================================================

/**
 * Unique identifier for a health score record.
 */
export type HealthScoreId = string & { readonly __brand: 'HealthScoreId' };

/**
 * Unique identifier for an anomaly record.
 */
export type AnomalyId = string & { readonly __brand: 'AnomalyId' };

/**
 * Unique identifier for a trend analysis.
 */
export type TrendAnalysisId = string & { readonly __brand: 'TrendAnalysisId' };

/**
 * Unique identifier for a risk ranking.
 */
export type RiskRankingId = string & { readonly __brand: 'RiskRankingId' };

/**
 * Create a HealthScoreId.
 */
export function createHealthScoreId(id: string): HealthScoreId {
  return id as HealthScoreId;
}

/**
 * Create an AnomalyId.
 */
export function createAnomalyId(id: string): AnomalyId {
  return id as AnomalyId;
}

/**
 * Create a TrendAnalysisId.
 */
export function createTrendAnalysisId(id: string): TrendAnalysisId {
  return id as TrendAnalysisId;
}

/**
 * Create a RiskRankingId.
 */
export function createRiskRankingId(id: string): RiskRankingId {
  return id as RiskRankingId;
}

// ============================================================================
// ENTITY TYPE
// ============================================================================

/**
 * Types of entities that can be scored/analyzed.
 */
export const IntelligenceEntityType = {
  PLAYER: 'PLAYER',
  TABLE: 'TABLE',
  CLUB: 'CLUB',
  AGENT: 'AGENT',
} as const;

export type IntelligenceEntityType = (typeof IntelligenceEntityType)[keyof typeof IntelligenceEntityType];

// ============================================================================
// RISK LEVEL
// ============================================================================

/**
 * Risk level classification.
 */
export const RiskLevel = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
} as const;

export type RiskLevel = (typeof RiskLevel)[keyof typeof RiskLevel];

/**
 * Determine risk level from health score.
 */
export function getRiskLevelFromScore(score: number): RiskLevel {
  if (score < 20) return RiskLevel.CRITICAL;
  if (score < HIGH_RISK_THRESHOLD) return RiskLevel.HIGH;
  if (score < MEDIUM_RISK_THRESHOLD) return RiskLevel.MEDIUM;
  return RiskLevel.LOW;
}

// ============================================================================
// ANOMALY TYPE
// ============================================================================

/**
 * Types of anomalies that can be detected.
 */
export const AnomalyType = {
  /** High concentration of flows to/from single entity */
  FLOW_CONCENTRATION: 'FLOW_CONCENTRATION',
  /** Attribution skewed heavily toward one party type */
  ATTRIBUTION_SKEW: 'ATTRIBUTION_SKEW',
  /** Agent taking higher than expected share */
  AGENT_OVER_EXTRACTION: 'AGENT_OVER_EXTRACTION',
  /** Mismatch between recharge references and flows */
  RECHARGE_MISMATCH: 'RECHARGE_MISMATCH',
  /** Pattern suggesting value cycling (wash) */
  TABLE_WASH_PATTERN: 'TABLE_WASH_PATTERN',
  /** Unusual orphan rate */
  HIGH_ORPHAN_RATE: 'HIGH_ORPHAN_RATE',
  /** Missing attribution for confirmed flows */
  ATTRIBUTION_GAP: 'ATTRIBUTION_GAP',
  /** Sudden volume change */
  VOLUME_SPIKE: 'VOLUME_SPIKE',
} as const;

export type AnomalyType = (typeof AnomalyType)[keyof typeof AnomalyType];

// ============================================================================
// TREND DIRECTION
// ============================================================================

/**
 * Direction of a trend.
 */
export const TrendDirection = {
  IMPROVING: 'IMPROVING',
  STABLE: 'STABLE',
  DETERIORATING: 'DETERIORATING',
  VOLATILE: 'VOLATILE',
} as const;

export type TrendDirection = (typeof TrendDirection)[keyof typeof TrendDirection];

// ============================================================================
// HEALTH SCORE TYPES
// ============================================================================

/**
 * Component scores that contribute to overall health.
 */
export interface HealthScoreComponents {
  /** Score based on orphan/partial rates (0-100) */
  readonly correlationScore: number;
  /** Score based on flow distribution (0-100) */
  readonly distributionScore: number;
  /** Score based on attribution balance (0-100) */
  readonly attributionScore: number;
  /** Score based on recharge-flow alignment (0-100) */
  readonly alignmentScore: number;
}

/**
 * Health score for an entity.
 */
export interface HealthScore {
  readonly scoreId: HealthScoreId;
  readonly entityId: GreyPartyId;
  readonly entityType: IntelligenceEntityType;
  readonly periodId: ReconciliationPeriodId;
  readonly timestamp: number;
  /** Overall health score (0-100) */
  readonly overallScore: number;
  /** Component breakdown */
  readonly components: HealthScoreComponents;
  /** Derived risk level */
  readonly riskLevel: RiskLevel;
  /** Checksum for verification */
  readonly checksum: string;
}

// ============================================================================
// ANOMALY TYPES
// ============================================================================

/**
 * Severity of an anomaly.
 */
export const AnomalySeverity = {
  INFO: 'INFO',
  WARNING: 'WARNING',
  ALERT: 'ALERT',
  CRITICAL: 'CRITICAL',
} as const;

export type AnomalySeverity = (typeof AnomalySeverity)[keyof typeof AnomalySeverity];

/**
 * An anomaly descriptor.
 */
export interface AnomalyDescriptor {
  readonly anomalyId: AnomalyId;
  readonly anomalyType: AnomalyType;
  readonly severity: AnomalySeverity;
  readonly entityId: GreyPartyId;
  readonly entityType: IntelligenceEntityType;
  readonly periodId: ReconciliationPeriodId;
  readonly timestamp: number;
  /** Human-readable description */
  readonly description: string;
  /** Related flow/recharge IDs for tracing */
  readonly relatedIds: readonly string[];
  /** Confidence score (0-100) */
  readonly confidence: number;
  /** Checksum */
  readonly checksum: string;
}

// ============================================================================
// TREND TYPES
// ============================================================================

/**
 * A data point in a trend series.
 */
export interface TrendDataPoint {
  readonly timestamp: number;
  readonly value: number;
  readonly periodId: ReconciliationPeriodId;
}

/**
 * Trend analysis result.
 */
export interface TrendAnalysis {
  readonly analysisId: TrendAnalysisId;
  readonly entityId: GreyPartyId;
  readonly entityType: IntelligenceEntityType;
  readonly metric: string;
  readonly direction: TrendDirection;
  /** Data points in chronological order */
  readonly dataPoints: readonly TrendDataPoint[];
  /** Rate of change (per period, in basis points) */
  readonly changeRateBasisPoints: number;
  /** Is the trend statistically significant? */
  readonly isSignificant: boolean;
  /** Analysis timestamp */
  readonly timestamp: number;
  readonly checksum: string;
}

// ============================================================================
// RISK RANKING TYPES
// ============================================================================

/**
 * A single entry in a risk ranking.
 */
export interface RiskRankEntry {
  readonly rank: number;
  readonly entityId: GreyPartyId;
  readonly entityType: IntelligenceEntityType;
  readonly riskScore: number;
  readonly riskLevel: RiskLevel;
  /** Primary contributing factors */
  readonly factors: readonly string[];
}

/**
 * Complete risk ranking for a set of entities.
 */
export interface RiskRanking {
  readonly rankingId: RiskRankingId;
  readonly entityType: IntelligenceEntityType;
  readonly periodId: ReconciliationPeriodId;
  readonly timestamp: number;
  readonly entries: readonly RiskRankEntry[];
  readonly totalEntities: number;
  readonly highRiskCount: number;
  readonly checksum: string;
}

// ============================================================================
// RESULT TYPES
// ============================================================================

/**
 * Intelligence error codes.
 */
export const IntelligenceErrorCode = {
  INVALID_TIMESTAMP: 'INVALID_TIMESTAMP',
  INVALID_INPUT: 'INVALID_INPUT',
  INVALID_SCORE: 'INVALID_SCORE',
  INSUFFICIENT_DATA: 'INSUFFICIENT_DATA',
  ENTITY_NOT_FOUND: 'ENTITY_NOT_FOUND',
  CHECKSUM_MISMATCH: 'CHECKSUM_MISMATCH',
} as const;

export type IntelligenceErrorCode = (typeof IntelligenceErrorCode)[keyof typeof IntelligenceErrorCode];

/**
 * Intelligence error.
 */
export interface IntelligenceError {
  readonly code: IntelligenceErrorCode;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

/**
 * Result type for intelligence operations.
 */
export type IntelligenceResult<T> =
  | { readonly success: true; readonly value: T }
  | { readonly success: false; readonly error: IntelligenceError };

/**
 * Create a success result.
 */
export function intelligenceSuccess<T>(value: T): IntelligenceResult<T> {
  return { success: true, value };
}

/**
 * Create a failure result.
 */
export function intelligenceFailure<T>(error: IntelligenceError): IntelligenceResult<T> {
  return { success: false, error };
}

/**
 * Create an intelligence error.
 */
export function createIntelligenceError(
  code: IntelligenceErrorCode,
  message: string,
  details?: Record<string, unknown>
): IntelligenceError {
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
 * Check if score is valid (0-100).
 */
export function isValidScore(score: number): boolean {
  return isValidInteger(score) && score >= MIN_HEALTH_SCORE && score <= MAX_HEALTH_SCORE;
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
