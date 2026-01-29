/**
 * GreyTypes.ts
 * Phase A - Grey Flow Settlement Runtime
 *
 * BRANDED IDS AND ENUMS
 *
 * This module defines all types for the grey flow runtime.
 * All values are INTEGER ONLY - no floats or decimals.
 *
 * @external This module operates OUTSIDE the frozen engine.
 * @readonly Engine state is never mutated.
 */

// ============================================================================
// BRANDED ID TYPES
// ============================================================================

/**
 * Unique identifier for a grey flow session.
 * Sessions group related flows together.
 */
export type GreySessionId = string & { readonly __brand: 'GreySessionId' };

/**
 * Unique identifier for a grey flow record.
 * Must be globally unique for idempotency.
 */
export type GreyFlowId = string & { readonly __brand: 'GreyFlowId' };

/**
 * Unique identifier for a party in the grey flow system.
 */
export type GreyPartyId = string & { readonly __brand: 'GreyPartyId' };

// ============================================================================
// PARTY TYPE ENUM
// ============================================================================

/**
 * Types of parties that can participate in grey flows.
 * Mirrors the engine's attribution parties but decoupled.
 */
export const GreyPartyType = {
  PLAYER: 'PLAYER',
  CLUB: 'CLUB',
  AGENT: 'AGENT',
  PLATFORM: 'PLATFORM',
} as const;

export type GreyPartyType = typeof GreyPartyType[keyof typeof GreyPartyType];

// ============================================================================
// FLOW TYPE ENUM
// ============================================================================

/**
 * Types of grey flow records.
 * These are REFERENCES only - not actual value transfers.
 *
 * BUYIN_REF - Reference to external buy-in
 * CASHOUT_REF - Reference to external cash-out
 * RAKE_REF - Reference to rake attribution
 * ADJUST_REF - Reference to manual adjustment
 */
export const GreyFlowType = {
  /** Reference to external buy-in */
  BUYIN_REF: 'BUYIN_REF',
  /** Reference to external cash-out */
  CASHOUT_REF: 'CASHOUT_REF',
  /** Reference to rake attribution */
  RAKE_REF: 'RAKE_REF',
  /** Reference to manual adjustment */
  ADJUST_REF: 'ADJUST_REF',
} as const;

export type GreyFlowType = typeof GreyFlowType[keyof typeof GreyFlowType];

// ============================================================================
// FLOW STATUS ENUM
// ============================================================================

/**
 * Status of a grey flow record.
 *
 * PENDING - Flow recorded but not yet confirmed
 * CONFIRMED - Flow confirmed and finalized
 * VOID - Flow voided (still recorded, but negated)
 */
export const GreyFlowStatus = {
  /** Flow recorded but not yet confirmed */
  PENDING: 'PENDING',
  /** Flow confirmed and finalized */
  CONFIRMED: 'CONFIRMED',
  /** Flow voided (still recorded, but negated) */
  VOID: 'VOID',
} as const;

export type GreyFlowStatus = typeof GreyFlowStatus[keyof typeof GreyFlowStatus];

// ============================================================================
// FLOW DIRECTION ENUM
// ============================================================================

/**
 * Direction of value flow relative to the party.
 *
 * IN - Value flowing into the party
 * OUT - Value flowing out of the party
 */
export const GreyFlowDirection = {
  /** Value flowing into the party */
  IN: 'IN',
  /** Value flowing out of the party */
  OUT: 'OUT',
} as const;

export type GreyFlowDirection = typeof GreyFlowDirection[keyof typeof GreyFlowDirection];

// ============================================================================
// PARTY STRUCTURE
// ============================================================================

/**
 * Identifies a party in the grey flow system.
 */
export interface GreyParty {
  readonly partyId: GreyPartyId;
  readonly partyType: GreyPartyType;
}

// ============================================================================
// ERROR TYPES
// ============================================================================

/**
 * Error codes for grey flow operations.
 */
export const GreyErrorCode = {
  /** Flow ID already exists */
  DUPLICATE_FLOW_ID: 'DUPLICATE_FLOW_ID',
  /** Negative amount provided */
  NEGATIVE_AMOUNT: 'NEGATIVE_AMOUNT',
  /** Non-integer amount provided */
  NON_INTEGER_AMOUNT: 'NON_INTEGER_AMOUNT',
  /** Invalid flow type for operation */
  INVALID_FLOW_TYPE: 'INVALID_FLOW_TYPE',
  /** Invalid party type for flow type */
  INVALID_PARTY_TYPE: 'INVALID_PARTY_TYPE',
  /** Invalid flow direction for type */
  INVALID_DIRECTION: 'INVALID_DIRECTION',
  /** Session not found */
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  /** Flow not found */
  FLOW_NOT_FOUND: 'FLOW_NOT_FOUND',
  /** Invalid status transition */
  INVALID_STATUS_TRANSITION: 'INVALID_STATUS_TRANSITION',
  /** Missing required field */
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  /** Invalid timestamp (must be positive integer) */
  INVALID_TIMESTAMP: 'INVALID_TIMESTAMP',
} as const;

export type GreyErrorCode = typeof GreyErrorCode[keyof typeof GreyErrorCode];

/**
 * Structured error object for grey flow operations.
 * Operations return errors instead of throwing.
 */
export interface GreyError {
  readonly code: GreyErrorCode;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

// ============================================================================
// RESULT TYPES
// ============================================================================

/**
 * Result of a grey flow operation.
 * Success contains the result, failure contains the error.
 */
export type GreyResult<T> =
  | { readonly success: true; readonly value: T }
  | { readonly success: false; readonly error: GreyError };

/**
 * Create a success result.
 */
export function greySuccess<T>(value: T): GreyResult<T> {
  return { success: true, value };
}

/**
 * Create a failure result.
 */
export function greyFailure<T>(error: GreyError): GreyResult<T> {
  return { success: false, error };
}

/**
 * Create a grey error object.
 */
export function createGreyError(
  code: GreyErrorCode,
  message: string,
  details?: Record<string, unknown>
): GreyError {
  return Object.freeze({
    code,
    message,
    details: details ? Object.freeze({ ...details }) : undefined,
  });
}

// ============================================================================
// ID FACTORIES
// ============================================================================

/**
 * Create a grey session ID.
 */
export function createGreySessionId(id: string): GreySessionId {
  return id as GreySessionId;
}

/**
 * Create a grey flow ID.
 */
export function createGreyFlowId(id: string): GreyFlowId {
  return id as GreyFlowId;
}

/**
 * Create a grey party ID.
 */
export function createGreyPartyId(id: string): GreyPartyId {
  return id as GreyPartyId;
}

/**
 * Create a grey party.
 */
export function createGreyParty(
  partyId: GreyPartyId,
  partyType: GreyPartyType
): GreyParty {
  return Object.freeze({ partyId, partyType });
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
 * Check if a timestamp is valid (positive integer).
 */
export function isValidTimestamp(timestamp: number): boolean {
  return Number.isInteger(timestamp) && timestamp > 0;
}

// ============================================================================
// TIME GRANULARITY (for views)
// ============================================================================

/**
 * Time granularity for bucketed summaries.
 */
export const GreyTimeGranularity = {
  MINUTE: 'MINUTE',
  HOUR: 'HOUR',
  DAY: 'DAY',
} as const;

export type GreyTimeGranularity = typeof GreyTimeGranularity[keyof typeof GreyTimeGranularity];

/**
 * Time window for queries.
 */
export interface GreyTimeWindow {
  readonly startTimestamp: number;
  readonly endTimestamp: number;
}

/**
 * Create a time window.
 */
export function createGreyTimeWindow(
  startTimestamp: number,
  endTimestamp: number
): GreyTimeWindow {
  return Object.freeze({ startTimestamp, endTimestamp });
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Module version for grey runtime.
 */
export const GREY_RUNTIME_VERSION = '1.0.0' as const;

/**
 * Maximum flow amount (safety limit).
 * Uses MAX_SAFE_INTEGER to ensure integer math safety.
 */
export const MAX_FLOW_AMOUNT = Number.MAX_SAFE_INTEGER;

/**
 * Forbidden concepts - these strings must NEVER appear in flow descriptions.
 */
export const FORBIDDEN_CONCEPTS = Object.freeze([
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
