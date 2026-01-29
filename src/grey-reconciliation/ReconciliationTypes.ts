/**
 * ReconciliationTypes.ts
 * Phase A1 - Grey Flow Reconciliation & Periodic Settlement
 *
 * TYPES AND ENUMS FOR RECONCILIATION
 *
 * This module defines all types for the reconciliation system.
 * All values are INTEGER ONLY - no floats or decimals.
 *
 * @external This module operates OUTSIDE the frozen engine.
 * @readonly This module NEVER mutates any state.
 * @deterministic Same inputs always produce same outputs.
 */

import {
  GreyFlowId,
  GreySessionId,
  GreyPartyId,
  GreyPartyType,
  GreyFlowType,
  GreyFlowStatus,
} from '../grey-runtime';

// ============================================================================
// BRANDED ID TYPES
// ============================================================================

/**
 * Unique identifier for a reconciliation period.
 */
export type ReconciliationPeriodId = string & { readonly __brand: 'ReconciliationPeriodId' };

/**
 * Unique identifier for a settlement snapshot.
 */
export type SettlementSnapshotId = string & { readonly __brand: 'SettlementSnapshotId' };

/**
 * Unique identifier for a discrepancy report.
 */
export type DiscrepancyReportId = string & { readonly __brand: 'DiscrepancyReportId' };

// ============================================================================
// ID FACTORIES
// ============================================================================

/**
 * Create a reconciliation period ID.
 */
export function createReconciliationPeriodId(id: string): ReconciliationPeriodId {
  return id as ReconciliationPeriodId;
}

/**
 * Create a settlement snapshot ID.
 */
export function createSettlementSnapshotId(id: string): SettlementSnapshotId {
  return id as SettlementSnapshotId;
}

/**
 * Create a discrepancy report ID.
 */
export function createDiscrepancyReportId(id: string): DiscrepancyReportId {
  return id as DiscrepancyReportId;
}

// ============================================================================
// RECONCILIATION PERIOD
// ============================================================================

/**
 * A reconciliation period defined by start and end timestamps.
 * Timestamps must be explicitly provided (no clock access).
 */
export interface ReconciliationPeriod {
  readonly periodId: ReconciliationPeriodId;
  readonly startTimestamp: number;
  readonly endTimestamp: number;
  readonly label?: string;
}

/**
 * Create a reconciliation period.
 * Validates that timestamps are positive integers and start < end.
 */
export function createReconciliationPeriod(
  periodId: ReconciliationPeriodId,
  startTimestamp: number,
  endTimestamp: number,
  label?: string
): ReconciliationResult<ReconciliationPeriod> {
  if (!Number.isInteger(startTimestamp) || startTimestamp <= 0) {
    return reconciliationFailure(
      createReconciliationError(
        ReconciliationErrorCode.INVALID_TIMESTAMP,
        `startTimestamp must be a positive integer, got: ${startTimestamp}`,
        { startTimestamp }
      )
    );
  }

  if (!Number.isInteger(endTimestamp) || endTimestamp <= 0) {
    return reconciliationFailure(
      createReconciliationError(
        ReconciliationErrorCode.INVALID_TIMESTAMP,
        `endTimestamp must be a positive integer, got: ${endTimestamp}`,
        { endTimestamp }
      )
    );
  }

  if (startTimestamp >= endTimestamp) {
    return reconciliationFailure(
      createReconciliationError(
        ReconciliationErrorCode.INVALID_PERIOD,
        `startTimestamp must be less than endTimestamp`,
        { startTimestamp, endTimestamp }
      )
    );
  }

  return reconciliationSuccess(
    Object.freeze({
      periodId,
      startTimestamp,
      endTimestamp,
      label,
    })
  );
}

// ============================================================================
// RECONCILIATION STATUS
// ============================================================================

/**
 * Status of a reconciliation result.
 *
 * BALANCED - All flows reconcile correctly
 * IMBALANCED - Discrepancies detected
 * INCOMPLETE - Missing data or pending flows
 */
export const ReconciliationStatus = {
  /** All flows reconcile correctly */
  BALANCED: 'BALANCED',
  /** Discrepancies detected */
  IMBALANCED: 'IMBALANCED',
  /** Missing data or pending flows */
  INCOMPLETE: 'INCOMPLETE',
} as const;

export type ReconciliationStatus = typeof ReconciliationStatus[keyof typeof ReconciliationStatus];

// ============================================================================
// SETTLEMENT BUCKET
// ============================================================================

/**
 * Settlement bucket for grouping flows.
 */
export const SettlementBucket = {
  PLATFORM: 'PLATFORM',
  CLUB: 'CLUB',
  AGENT: 'AGENT',
} as const;

export type SettlementBucket = typeof SettlementBucket[keyof typeof SettlementBucket];

// ============================================================================
// PERIOD GRANULARITY
// ============================================================================

/**
 * Common period granularity for settlement.
 */
export const PeriodGranularity = {
  DAILY: 'DAILY',
  WEEKLY: 'WEEKLY',
  MONTHLY: 'MONTHLY',
  CUSTOM: 'CUSTOM',
} as const;

export type PeriodGranularity = typeof PeriodGranularity[keyof typeof PeriodGranularity];

// ============================================================================
// DISCREPANCY TYPES
// ============================================================================

/**
 * Types of discrepancies that can be detected.
 */
export const DiscrepancyType = {
  /** Sum mismatch between expected and actual */
  SUM_MISMATCH: 'SUM_MISMATCH',
  /** Missing expected flow */
  MISSING_FLOW: 'MISSING_FLOW',
  /** Unexpected flow found */
  UNEXPECTED_FLOW: 'UNEXPECTED_FLOW',
  /** Status inconsistency */
  STATUS_INCONSISTENCY: 'STATUS_INCONSISTENCY',
  /** Duplicate reference detected */
  DUPLICATE_REFERENCE: 'DUPLICATE_REFERENCE',
  /** Non-integer value detected */
  NON_INTEGER_VALUE: 'NON_INTEGER_VALUE',
} as const;

export type DiscrepancyType = typeof DiscrepancyType[keyof typeof DiscrepancyType];

/**
 * Severity of a discrepancy.
 */
export const DiscrepancySeverity = {
  /** Informational only */
  INFO: 'INFO',
  /** Warning - may need attention */
  WARNING: 'WARNING',
  /** Error - requires investigation */
  ERROR: 'ERROR',
  /** Critical - immediate action required */
  CRITICAL: 'CRITICAL',
} as const;

export type DiscrepancySeverity = typeof DiscrepancySeverity[keyof typeof DiscrepancySeverity];

/**
 * A single discrepancy item.
 */
export interface Discrepancy {
  readonly type: DiscrepancyType;
  readonly severity: DiscrepancySeverity;
  readonly message: string;
  readonly affectedFlowIds: readonly GreyFlowId[];
  readonly expectedValue?: number;
  readonly actualValue?: number;
  readonly details?: Readonly<Record<string, unknown>>;
}

/**
 * Create a discrepancy.
 */
export function createDiscrepancy(
  type: DiscrepancyType,
  severity: DiscrepancySeverity,
  message: string,
  affectedFlowIds: readonly GreyFlowId[],
  expectedValue?: number,
  actualValue?: number,
  details?: Record<string, unknown>
): Discrepancy {
  return Object.freeze({
    type,
    severity,
    message,
    affectedFlowIds: Object.freeze([...affectedFlowIds]),
    expectedValue,
    actualValue,
    details: details ? Object.freeze({ ...details }) : undefined,
  });
}

// ============================================================================
// FLOW SUMMARY (Per Party Per Period)
// ============================================================================

/**
 * Summary of flows for a party within a period.
 * All values are integers.
 */
export interface FlowSummary {
  readonly partyId: GreyPartyId;
  readonly partyType: GreyPartyType;
  readonly periodId: ReconciliationPeriodId;

  /** Total value flowing IN */
  readonly totalIn: number;
  /** Total value flowing OUT */
  readonly totalOut: number;
  /** Net reference (IN - OUT) - NOT A BALANCE */
  readonly netReference: number;

  /** Count by flow type */
  readonly countByType: Readonly<Record<GreyFlowType, number>>;
  /** Count by status */
  readonly countByStatus: Readonly<Record<GreyFlowStatus, number>>;

  /** All flow IDs included in this summary */
  readonly flowIds: readonly GreyFlowId[];

  /** Total record count */
  readonly recordCount: number;
}

// ============================================================================
// SETTLEMENT TOTALS
// ============================================================================

/**
 * Settlement totals for a bucket within a period.
 */
export interface SettlementTotal {
  readonly bucket: SettlementBucket;
  readonly periodId: ReconciliationPeriodId;

  /** Total rake-like flow (RAKE_REF IN) */
  readonly totalRakeIn: number;
  /** Total adjustments IN */
  readonly totalAdjustIn: number;
  /** Total adjustments OUT */
  readonly totalAdjustOut: number;
  /** Net settlement reference */
  readonly netSettlement: number;

  /** Number of parties included */
  readonly partyCount: number;
  /** Number of flows included */
  readonly flowCount: number;
}

// ============================================================================
// ERROR TYPES
// ============================================================================

/**
 * Error codes for reconciliation operations.
 */
export const ReconciliationErrorCode = {
  /** Invalid timestamp provided */
  INVALID_TIMESTAMP: 'INVALID_TIMESTAMP',
  /** Invalid period (start >= end) */
  INVALID_PERIOD: 'INVALID_PERIOD',
  /** No data found for period */
  NO_DATA_FOR_PERIOD: 'NO_DATA_FOR_PERIOD',
  /** Invalid party type */
  INVALID_PARTY_TYPE: 'INVALID_PARTY_TYPE',
  /** Non-integer value encountered */
  NON_INTEGER_VALUE: 'NON_INTEGER_VALUE',
  /** Snapshot not found */
  SNAPSHOT_NOT_FOUND: 'SNAPSHOT_NOT_FOUND',
  /** Checksum mismatch */
  CHECKSUM_MISMATCH: 'CHECKSUM_MISMATCH',
} as const;

export type ReconciliationErrorCode = typeof ReconciliationErrorCode[keyof typeof ReconciliationErrorCode];

/**
 * Structured error for reconciliation operations.
 */
export interface ReconciliationError {
  readonly code: ReconciliationErrorCode;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

/**
 * Create a reconciliation error.
 */
export function createReconciliationError(
  code: ReconciliationErrorCode,
  message: string,
  details?: Record<string, unknown>
): ReconciliationError {
  return Object.freeze({
    code,
    message,
    details: details ? Object.freeze({ ...details }) : undefined,
  });
}

// ============================================================================
// RESULT TYPES
// ============================================================================

/**
 * Result of a reconciliation operation.
 */
export type ReconciliationResult<T> =
  | { readonly success: true; readonly value: T }
  | { readonly success: false; readonly error: ReconciliationError };

/**
 * Create a success result.
 */
export function reconciliationSuccess<T>(value: T): ReconciliationResult<T> {
  return { success: true, value };
}

/**
 * Create a failure result.
 */
export function reconciliationFailure<T>(error: ReconciliationError): ReconciliationResult<T> {
  return { success: false, error };
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Check if a value is a valid integer.
 */
export function isValidInteger(value: number): boolean {
  return Number.isInteger(value);
}

/**
 * Check if a value is a valid positive integer.
 */
export function isValidPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

/**
 * Check if a period is valid.
 */
export function isValidPeriod(period: ReconciliationPeriod): boolean {
  return (
    isValidPositiveInteger(period.startTimestamp) &&
    isValidPositiveInteger(period.endTimestamp) &&
    period.startTimestamp < period.endTimestamp
  );
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Module version for reconciliation.
 */
export const RECONCILIATION_VERSION = '1.0.0' as const;

/**
 * Forbidden concepts - these must NEVER appear.
 */
export const RECONCILIATION_FORBIDDEN_CONCEPTS = Object.freeze([
  'payment',
  'wallet',
  'crypto',
  'blockchain',
  'usdt',
  'transfer',
  'deposit',
  'withdraw',
  'balance',
]) as readonly string[];
