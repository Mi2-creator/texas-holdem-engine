/**
 * GreyRechargeTypes.ts
 * Phase A3 - Grey Recharge Reference Mapping
 *
 * TYPES AND ENUMS FOR RECHARGE REFERENCE MAPPING
 *
 * This module defines types for mapping external recharge events
 * to GreyFlowIds. All operations are REFERENCE-ONLY.
 *
 * All values are INTEGER ONLY - no floats or decimals.
 *
 * @external This module operates OUTSIDE the frozen engine.
 * @readonly This module NEVER mutates GreyFlow or Attribution data.
 * @reference This module creates REFERENCES only, no value movement.
 * @deterministic Same inputs always produce same outputs.
 */

import { GreyFlowId, GreyPartyId } from '../grey-runtime';
import { ReconciliationPeriodId } from '../grey-reconciliation';

// ============================================================================
// BRANDED ID TYPES
// ============================================================================

/**
 * Unique identifier for a recharge reference record.
 */
export type GreyRechargeId = string & { readonly __brand: 'GreyRechargeId' };

/**
 * Unique identifier for a recharge reference link.
 */
export type RechargeLinkId = string & { readonly __brand: 'RechargeLinkId' };

/**
 * External reference ID (from external system).
 */
export type ExternalReferenceId = string & { readonly __brand: 'ExternalReferenceId' };

// ============================================================================
// ID FACTORIES
// ============================================================================

/**
 * Create a grey recharge ID.
 */
export function createGreyRechargeId(id: string): GreyRechargeId {
  return id as GreyRechargeId;
}

/**
 * Create a recharge link ID.
 */
export function createRechargeLinkId(id: string): RechargeLinkId {
  return id as RechargeLinkId;
}

/**
 * Create an external reference ID.
 */
export function createExternalReferenceId(id: string): ExternalReferenceId {
  return id as ExternalReferenceId;
}

// ============================================================================
// RECHARGE SOURCE ENUM
// ============================================================================

/**
 * Source of a recharge reference.
 *
 * EXTERNAL - Reference from external system
 * MANUAL - Manual reference entry (admin)
 * FUTURE - Placeholder for future integrations
 */
export const GreyRechargeSource = {
  /** Reference from external system */
  EXTERNAL: 'EXTERNAL',
  /** Manual reference entry (admin) */
  MANUAL: 'MANUAL',
  /** Placeholder for future integrations */
  FUTURE: 'FUTURE',
} as const;

export type GreyRechargeSource = typeof GreyRechargeSource[keyof typeof GreyRechargeSource];

// ============================================================================
// RECHARGE STATUS ENUM
// ============================================================================

/**
 * Status of a recharge reference.
 *
 * DECLARED - Reference declared but not confirmed
 * CONFIRMED - Reference confirmed and finalized
 * VOIDED - Reference voided (marked invalid)
 */
export const GreyRechargeStatus = {
  /** Reference declared but not confirmed */
  DECLARED: 'DECLARED',
  /** Reference confirmed and finalized */
  CONFIRMED: 'CONFIRMED',
  /** Reference voided (marked invalid) */
  VOIDED: 'VOIDED',
} as const;

export type GreyRechargeStatus = typeof GreyRechargeStatus[keyof typeof GreyRechargeStatus];

// ============================================================================
// RECHARGE RECORD
// ============================================================================

/**
 * Input for creating a recharge record.
 */
export interface GreyRechargeRecordInput {
  readonly rechargeId: GreyRechargeId;
  readonly source: GreyRechargeSource;
  readonly partyId: GreyPartyId;
  /** Reference amount (integer only, non-negative) */
  readonly referenceAmount: number;
  /** External reference ID from source system */
  readonly externalReferenceId?: ExternalReferenceId;
  /** Injected timestamp (no clock access) */
  readonly declaredTimestamp: number;
  /** Optional description */
  readonly description?: string;
  /** Optional metadata */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Immutable recharge reference record.
 * Records external recharge events for reference purposes only.
 */
export interface GreyRechargeRecord {
  readonly rechargeId: GreyRechargeId;
  readonly source: GreyRechargeSource;
  readonly status: GreyRechargeStatus;
  readonly partyId: GreyPartyId;
  /** Reference amount (integer only, non-negative) */
  readonly referenceAmount: number;
  /** External reference ID from source system */
  readonly externalReferenceId?: ExternalReferenceId;
  /** Sequence number in registry */
  readonly sequence: number;
  /** Timestamp when declared */
  readonly declaredTimestamp: number;
  /** Timestamp when confirmed (if confirmed) */
  readonly confirmedTimestamp?: number;
  /** Timestamp when voided (if voided) */
  readonly voidedTimestamp?: number;
  /** Optional description */
  readonly description?: string;
  /** Optional metadata */
  readonly metadata?: Readonly<Record<string, unknown>>;
  /** Hash-chained checksum */
  readonly checksum: string;
  /** Previous record checksum (hash chain) */
  readonly previousChecksum: string;
}

// ============================================================================
// RECHARGE LINK (Reference to GreyFlow)
// ============================================================================

/**
 * A link between a recharge reference and GreyFlow IDs.
 * This is a REFERENCE ONLY - no value movement.
 */
export interface RechargeLink {
  readonly linkId: RechargeLinkId;
  readonly rechargeId: GreyRechargeId;
  /** Linked GreyFlow IDs (reference only) */
  readonly linkedFlowIds: readonly GreyFlowId[];
  /** Total reference amount from linked flows */
  readonly linkedReferenceTotal: number;
  /** Link creation timestamp (explicit) */
  readonly linkedTimestamp: number;
  /** Checksum for verification */
  readonly checksum: string;
}

// ============================================================================
// ERROR TYPES
// ============================================================================

/**
 * Error codes for recharge operations.
 */
export const RechargeErrorCode = {
  /** Recharge ID already exists */
  DUPLICATE_RECHARGE_ID: 'DUPLICATE_RECHARGE_ID',
  /** Recharge not found */
  RECHARGE_NOT_FOUND: 'RECHARGE_NOT_FOUND',
  /** Invalid status transition */
  INVALID_STATUS_TRANSITION: 'INVALID_STATUS_TRANSITION',
  /** Invalid reference amount */
  INVALID_REFERENCE_AMOUNT: 'INVALID_REFERENCE_AMOUNT',
  /** Non-integer value */
  NON_INTEGER_VALUE: 'NON_INTEGER_VALUE',
  /** Invalid timestamp */
  INVALID_TIMESTAMP: 'INVALID_TIMESTAMP',
  /** Link ID already exists */
  DUPLICATE_LINK_ID: 'DUPLICATE_LINK_ID',
  /** Link not found */
  LINK_NOT_FOUND: 'LINK_NOT_FOUND',
  /** Flow ID not found */
  FLOW_NOT_FOUND: 'FLOW_NOT_FOUND',
  /** Checksum mismatch */
  CHECKSUM_MISMATCH: 'CHECKSUM_MISMATCH',
  /** Invalid period */
  INVALID_PERIOD: 'INVALID_PERIOD',
} as const;

export type RechargeErrorCode = typeof RechargeErrorCode[keyof typeof RechargeErrorCode];

/**
 * Structured error for recharge operations.
 */
export interface RechargeError {
  readonly code: RechargeErrorCode;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

/**
 * Create a recharge error.
 */
export function createRechargeError(
  code: RechargeErrorCode,
  message: string,
  details?: Record<string, unknown>
): RechargeError {
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
 * Result of a recharge operation.
 */
export type RechargeResult<T> =
  | { readonly success: true; readonly value: T }
  | { readonly success: false; readonly error: RechargeError };

/**
 * Create a success result.
 */
export function rechargeSuccess<T>(value: T): RechargeResult<T> {
  return { success: true, value };
}

/**
 * Create a failure result.
 */
export function rechargeFailure<T>(error: RechargeError): RechargeResult<T> {
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
 * Check if a value is a valid non-negative integer.
 */
export function isValidNonNegativeInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

/**
 * Check if a value is a valid positive integer.
 */
export function isValidPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

/**
 * Check if a timestamp is valid.
 */
export function isValidTimestamp(timestamp: number): boolean {
  return Number.isInteger(timestamp) && timestamp > 0;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Module version for recharge reference mapping.
 */
export const RECHARGE_VERSION = '1.0.0' as const;

/**
 * Genesis hash for first record in chain.
 */
export const RECHARGE_GENESIS_HASH = '00000000' as const;

/**
 * Forbidden concepts - these must NEVER appear.
 * Recharge is REFERENCE-ONLY - no actual value movement.
 */
export const RECHARGE_FORBIDDEN_CONCEPTS = Object.freeze([
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
]) as readonly string[];
