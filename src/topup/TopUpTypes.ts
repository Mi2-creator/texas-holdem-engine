/**
 * TopUpTypes.ts
 * Phase 28 - External Top-Up Integration Boundary (Blueprint)
 *
 * Type definitions for the external top-up integration boundary.
 * A "top-up" is an EXTERNAL FACT that records a validated, idempotent
 * increase in PLAYER chips.
 *
 * HARD CONSTRAINTS:
 * - Top-ups are NOT revenue, NOT rake, NOT bonus, NOT settlement
 * - Top-ups target PLAYERS only (never club/agent/platform)
 * - All values are integer-based chips
 * - No mutation of existing ledger logic
 *
 * FORBIDDEN CONCEPTS (must never appear):
 * - Currency, wallet, payment, deposit, withdrawal
 * - Blockchain, crypto, USDT, token
 * - External account references
 */

import { PlayerId } from '../security/Identity';
import { TableId } from '../security/AuditLog';
import { ClubId } from '../club/ClubTypes';

// ============================================================================
// Branded Types for Type Safety
// ============================================================================

/**
 * Unique identifier for a top-up intent (idempotency key)
 */
export type TopUpIntentId = string & { readonly __brand: 'TopUpIntentId' };

// ============================================================================
// ID Generation
// ============================================================================

let intentCounter = 0;

export function generateTopUpIntentId(): TopUpIntentId {
  return `topup_${Date.now()}_${++intentCounter}` as TopUpIntentId;
}

export function resetTopUpCounters(): void {
  intentCounter = 0;
}

// ============================================================================
// Source Type
// ============================================================================

/**
 * Source marker for top-up entries
 *
 * TOP_UP is the ONLY valid source for this boundary.
 * It indicates an external chip addition that is:
 * - Not revenue (does not credit club/agent/platform)
 * - Not rake (not derived from hand settlement)
 * - Not bonus (not promotional)
 */
export const TOP_UP_SOURCE = 'EXTERNAL_TOPUP' as const;
export type TopUpSource = typeof TOP_UP_SOURCE;

// ============================================================================
// Result Types (never throw)
// ============================================================================

/**
 * Validation error detail
 */
export interface TopUpValidationError {
  readonly code: TopUpErrorCode;
  readonly message: string;
  readonly field?: string;
  readonly value?: unknown;
}

/**
 * Error codes for top-up validation failures
 */
export type TopUpErrorCode =
  | 'INVALID_INTENT_ID'
  | 'INVALID_PLAYER_ID'
  | 'INVALID_CLUB_ID'
  | 'INVALID_AMOUNT'
  | 'NON_INTEGER_AMOUNT'
  | 'NON_POSITIVE_AMOUNT'
  | 'DUPLICATE_INTENT'
  | 'FORBIDDEN_TARGET'
  | 'FORBIDDEN_TIMING'
  | 'FORBIDDEN_METADATA'
  | 'MISSING_REQUIRED_FIELD';

/**
 * Result of a top-up validation
 */
export interface TopUpValidationResult {
  readonly isValid: boolean;
  readonly errors: readonly TopUpValidationError[];
}

/**
 * Result of a top-up recording
 */
export interface TopUpRecordResult {
  readonly success: boolean;
  readonly intentId?: TopUpIntentId;
  readonly entrySequence?: number;
  readonly error?: string;
  readonly isDuplicate?: boolean;
}

/**
 * Result of a top-up query
 */
export interface TopUpQueryResult<T> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: string;
}

// ============================================================================
// Time Window (for queries)
// ============================================================================

export interface TopUpTimeWindow {
  readonly fromTimestamp: number;
  readonly toTimestamp: number;
}

// ============================================================================
// Aggregation Types
// ============================================================================

/**
 * Summary of top-ups for a player
 */
export interface PlayerTopUpSummary {
  readonly playerId: PlayerId;
  readonly totalAmount: number;
  readonly topUpCount: number;
  readonly firstTopUpAt: number | null;
  readonly lastTopUpAt: number | null;
}

/**
 * Summary of top-ups for a club
 */
export interface ClubTopUpSummary {
  readonly clubId: ClubId;
  readonly totalAmount: number;
  readonly topUpCount: number;
  readonly uniquePlayers: number;
}

/**
 * Summary of top-ups for a table
 */
export interface TableTopUpSummary {
  readonly tableId: TableId;
  readonly clubId: ClubId;
  readonly totalAmount: number;
  readonly topUpCount: number;
}

// ============================================================================
// Factory Helpers
// ============================================================================

/**
 * Create a successful validation result
 */
export function validResult(): TopUpValidationResult {
  return { isValid: true, errors: [] };
}

/**
 * Create a failed validation result with errors
 */
export function invalidResult(
  errors: readonly TopUpValidationError[]
): TopUpValidationResult {
  return { isValid: false, errors };
}

/**
 * Create a validation error
 */
export function createValidationError(
  code: TopUpErrorCode,
  message: string,
  field?: string,
  value?: unknown
): TopUpValidationError {
  return { code, message, field, value };
}

/**
 * Create a successful record result
 */
export function successResult(
  intentId: TopUpIntentId,
  entrySequence: number
): TopUpRecordResult {
  return { success: true, intentId, entrySequence };
}

/**
 * Create a failed record result
 */
export function failResult(error: string): TopUpRecordResult {
  return { success: false, error };
}

/**
 * Create a duplicate record result
 */
export function duplicateResult(intentId: TopUpIntentId): TopUpRecordResult {
  return { success: false, isDuplicate: true, intentId, error: 'Duplicate intent' };
}
