/**
 * GreyAuditTypes.ts
 * Phase A4 - Grey Audit Reconciliation Loop
 *
 * READ-ONLY AUDIT TYPES AND ENUMS
 *
 * This module defines types for auditing correlations between:
 * - GreyFlowIds
 * - GreyRechargeIds (optional)
 * - Attribution outputs
 *
 * @external This module operates OUTSIDE the frozen engine.
 * @readonly This module NEVER mutates any data.
 * @deterministic Same inputs always produce same outputs.
 */

import { GreyFlowId, GreyPartyId } from '../grey-runtime';
import { ReconciliationPeriodId } from '../grey-reconciliation';
import { AttributionPartyType } from '../grey-attribution';
import { GreyRechargeId } from '../grey-recharge';

// ============================================================================
// VERSION AND CONSTANTS
// ============================================================================

/**
 * Audit module version.
 */
export const AUDIT_VERSION = '1.0.0' as const;

/**
 * Genesis hash for audit session chain.
 */
export const AUDIT_GENESIS_HASH = '00000000' as const;

/**
 * Forbidden concepts in audit module.
 * Audit is CORRELATION-ONLY - no value manipulation.
 */
export const AUDIT_FORBIDDEN_CONCEPTS = Object.freeze([
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
 * Unique identifier for an audit session.
 * Format: 'audit_<timestamp>_<random>'
 */
export type GreyAuditSessionId = string & { readonly __brand: 'GreyAuditSessionId' };

/**
 * Unique identifier for an audit row.
 * Format: 'arow_<session>_<sequence>'
 */
export type GreyAuditRowId = string & { readonly __brand: 'GreyAuditRowId' };

/**
 * Create a GreyAuditSessionId.
 */
export function createGreyAuditSessionId(
  timestamp: number,
  random: string
): GreyAuditSessionId {
  return `audit_${timestamp}_${random}` as GreyAuditSessionId;
}

/**
 * Create a GreyAuditRowId.
 */
export function createGreyAuditRowId(
  sessionId: GreyAuditSessionId,
  sequence: number
): GreyAuditRowId {
  return `arow_${sessionId}_${sequence}` as GreyAuditRowId;
}

// ============================================================================
// AUDIT STATUS
// ============================================================================

/**
 * Status of an audit correlation.
 */
export const GreyAuditStatus = {
  /** Flow fully matches with recharge and attribution */
  MATCHED: 'MATCHED',
  /** Flow has partial matches (e.g., attribution but no recharge) */
  PARTIAL: 'PARTIAL',
  /** Expected data is missing */
  MISSING: 'MISSING',
  /** Orphan data with no correlation */
  ORPHAN: 'ORPHAN',
} as const;

export type GreyAuditStatus = (typeof GreyAuditStatus)[keyof typeof GreyAuditStatus];

// ============================================================================
// AUDIT FLAG TYPES
// ============================================================================

/**
 * Specific flags for audit findings.
 */
export const AuditFlag = {
  /** Flow exists without recharge link */
  FLOW_NO_RECHARGE: 'FLOW_NO_RECHARGE',
  /** Recharge exists without flow link */
  RECHARGE_NO_FLOW: 'RECHARGE_NO_FLOW',
  /** Flow exists without attribution */
  FLOW_NO_ATTRIBUTION: 'FLOW_NO_ATTRIBUTION',
  /** Attribution exists without corresponding flow */
  ATTRIBUTION_NO_FLOW: 'ATTRIBUTION_NO_FLOW',
  /** Party mismatch between flow and attribution */
  PARTY_MISMATCH: 'PARTY_MISMATCH',
  /** Recharge status not confirmed */
  RECHARGE_NOT_CONFIRMED: 'RECHARGE_NOT_CONFIRMED',
  /** Flow status not confirmed */
  FLOW_NOT_CONFIRMED: 'FLOW_NOT_CONFIRMED',
  /** Multiple attributions for single flow */
  MULTIPLE_ATTRIBUTIONS: 'MULTIPLE_ATTRIBUTIONS',
  /** Checksum verification failed */
  CHECKSUM_FAILED: 'CHECKSUM_FAILED',
} as const;

export type AuditFlag = (typeof AuditFlag)[keyof typeof AuditFlag];

// ============================================================================
// ATTRIBUTION BREAKDOWN REFERENCE
// ============================================================================

/**
 * Reference to attribution breakdown for a flow.
 * Contains party IDs only - no amounts (read from attribution module).
 */
export interface AttributionBreakdownRef {
  /** Source flow ID */
  readonly sourceFlowId: GreyFlowId;
  /** Party IDs that received attribution */
  readonly partyIds: readonly GreyPartyId[];
  /** Party types for each party */
  readonly partyTypes: readonly AttributionPartyType[];
  /** Whether attribution was found */
  readonly hasAttribution: boolean;
}

// ============================================================================
// AUDIT ROW
// ============================================================================

/**
 * A single row in the audit report.
 * Correlates a flow with its recharge (if any) and attribution.
 */
export interface GreyAuditRow {
  /** Unique row ID */
  readonly rowId: GreyAuditRowId;
  /** Session this row belongs to */
  readonly sessionId: GreyAuditSessionId;
  /** Sequence number within session */
  readonly sequence: number;
  /** The flow ID being audited */
  readonly greyFlowId: GreyFlowId;
  /** Optional linked recharge ID */
  readonly rechargeId: GreyRechargeId | null;
  /** Attribution breakdown reference */
  readonly attributionBreakdown: AttributionBreakdownRef;
  /** Overall audit status */
  readonly auditStatus: GreyAuditStatus;
  /** Specific flags for this row */
  readonly flags: readonly AuditFlag[];
  /** Row checksum */
  readonly checksum: string;
}

// ============================================================================
// AUDIT SUMMARY
// ============================================================================

/**
 * Summary of an audit session.
 */
export interface GreyAuditSummary {
  /** Audit session ID */
  readonly sessionId: GreyAuditSessionId;
  /** Period being audited */
  readonly periodId: ReconciliationPeriodId;
  /** Timestamp when audit was performed */
  readonly auditTimestamp: number;
  /** Total rows in audit */
  readonly totalRows: number;
  /** Count by status */
  readonly countByStatus: Readonly<Record<GreyAuditStatus, number>>;
  /** Count by flag */
  readonly countByFlag: Readonly<Record<AuditFlag, number>>;
  /** Count of flows audited */
  readonly flowCount: number;
  /** Count of recharges found */
  readonly rechargeCount: number;
  /** Count of flows with attribution */
  readonly attributedFlowCount: number;
  /** Whether audit passed (no MISSING or ORPHAN) */
  readonly passed: boolean;
  /** Summary checksum */
  readonly checksum: string;
}

// ============================================================================
// AUDIT SESSION INPUT
// ============================================================================

/**
 * Input for creating an audit session.
 */
export interface GreyAuditSessionInput {
  /** Session ID */
  readonly sessionId: GreyAuditSessionId;
  /** Period to audit */
  readonly periodId: ReconciliationPeriodId;
  /** Timestamp for this audit */
  readonly auditTimestamp: number;
}

// ============================================================================
// RESULT TYPES
// ============================================================================

/**
 * Audit error codes.
 */
export const AuditErrorCode = {
  /** Invalid timestamp */
  INVALID_TIMESTAMP: 'INVALID_TIMESTAMP',
  /** Invalid session ID */
  INVALID_SESSION_ID: 'INVALID_SESSION_ID',
  /** Invalid period */
  INVALID_PERIOD: 'INVALID_PERIOD',
  /** Duplicate session ID */
  DUPLICATE_SESSION: 'DUPLICATE_SESSION',
  /** Session not found */
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  /** Checksum mismatch */
  CHECKSUM_MISMATCH: 'CHECKSUM_MISMATCH',
  /** Invalid input */
  INVALID_INPUT: 'INVALID_INPUT',
} as const;

export type AuditErrorCode = (typeof AuditErrorCode)[keyof typeof AuditErrorCode];

/**
 * Audit error.
 */
export interface AuditError {
  readonly code: AuditErrorCode;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

/**
 * Result type for audit operations.
 */
export type AuditResult<T> =
  | { readonly success: true; readonly value: T }
  | { readonly success: false; readonly error: AuditError };

/**
 * Create a success result.
 */
export function auditSuccess<T>(value: T): AuditResult<T> {
  return { success: true, value };
}

/**
 * Create a failure result.
 */
export function auditFailure<T>(error: AuditError): AuditResult<T> {
  return { success: false, error };
}

/**
 * Create an audit error.
 */
export function createAuditError(
  code: AuditErrorCode,
  message: string,
  details?: Record<string, unknown>
): AuditError {
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
