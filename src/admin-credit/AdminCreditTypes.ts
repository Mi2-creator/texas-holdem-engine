/**
 * AdminCreditTypes.ts
 * Phase 29 - Admin Credit (Manual Top-Up) System
 *
 * Type definitions for admin-initiated player credits.
 * Admin Credit is a PRIVILEGED PRODUCER of TopUpIntent.
 *
 * USE CASES:
 * - Cash-in handled off-system
 * - Testing / staging
 * - Grey-operation deployment
 * - Customer support adjustments
 *
 * HARD CONSTRAINTS:
 * - NOT a payment system
 * - NOT automated
 * - NOT exposed to players
 * - NO rake or revenue attribution
 * - All credits go through TopUpBoundary
 *
 * EXPLICITLY FORBIDDEN:
 * - Currency, exchange rates
 * - Payment references, tx hashes
 * - Wallet addresses
 * - Automated triggers
 */

import { PlayerId } from '../security/Identity';
import { TableId } from '../security/AuditLog';
import { ClubId } from '../club/ClubTypes';

// ============================================================================
// Branded Types for Type Safety
// ============================================================================

/**
 * Unique identifier for an admin user
 */
export type AdminId = string & { readonly __brand: 'AdminId' };

/**
 * Unique identifier for an admin credit intent (idempotency key)
 */
export type AdminCreditIntentId = string & { readonly __brand: 'AdminCreditIntentId' };

// ============================================================================
// ID Generation
// ============================================================================

let adminCreditCounter = 0;

export function generateAdminCreditIntentId(): AdminCreditIntentId {
  return `admcredit_${Date.now()}_${++adminCreditCounter}` as AdminCreditIntentId;
}

export function resetAdminCreditCounters(): void {
  adminCreditCounter = 0;
}

// ============================================================================
// Admin Credit Reason Enum
// ============================================================================

/**
 * Valid reasons for admin-initiated credits
 *
 * OFFLINE_BUYIN - Off-system chip addition
 * PROMOTION - Promotional credit (not bonus - no revenue impact)
 * TESTING - Test/staging environment credits
 * CORRECTION - Customer support adjustments
 */
export type AdminCreditReason =
  | 'OFFLINE_BUYIN'
  | 'PROMOTION'
  | 'TESTING'
  | 'CORRECTION';

/**
 * All valid admin credit reasons
 */
export const ADMIN_CREDIT_REASONS: readonly AdminCreditReason[] = [
  'OFFLINE_BUYIN',
  'PROMOTION',
  'TESTING',
  'CORRECTION',
] as const;

/**
 * Check if a value is a valid admin credit reason
 */
export function isValidAdminCreditReason(value: unknown): value is AdminCreditReason {
  return typeof value === 'string' && ADMIN_CREDIT_REASONS.includes(value as AdminCreditReason);
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Error codes for admin credit validation failures
 */
export type AdminCreditErrorCode =
  | 'INVALID_INTENT_ID'
  | 'INVALID_ADMIN_ID'
  | 'INVALID_PLAYER_ID'
  | 'INVALID_CLUB_ID'
  | 'INVALID_AMOUNT'
  | 'NON_INTEGER_AMOUNT'
  | 'NON_POSITIVE_AMOUNT'
  | 'INVALID_REASON'
  | 'MISSING_NOTE'
  | 'NOTE_TOO_SHORT'
  | 'DUPLICATE_INTENT'
  | 'FORBIDDEN_TARGET'
  | 'FORBIDDEN_TIMING'
  | 'TOPUP_BOUNDARY_REJECTED';

/**
 * Admin credit validation error
 */
export interface AdminCreditError {
  readonly code: AdminCreditErrorCode;
  readonly message: string;
  readonly field?: string;
  readonly value?: unknown;
}

// ============================================================================
// Result Types
// ============================================================================

/**
 * Result of admin credit policy validation
 */
export interface AdminCreditValidationResult {
  readonly isValid: boolean;
  readonly errors: readonly AdminCreditError[];
}

/**
 * Result of admin credit execution
 */
export interface AdminCreditResult {
  readonly success: boolean;
  readonly intentId?: AdminCreditIntentId;
  readonly entrySequence?: number;
  readonly error?: string;
  readonly isDuplicate?: boolean;
}

/**
 * Result of admin credit query
 */
export interface AdminCreditQueryResult<T> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: string;
}

// ============================================================================
// Query Types
// ============================================================================

/**
 * Time window for queries
 */
export interface AdminCreditTimeWindow {
  readonly fromTimestamp: number;
  readonly toTimestamp: number;
}

// ============================================================================
// Summary Types
// ============================================================================

/**
 * Summary of credits issued by an admin
 */
export interface AdminCreditSummary {
  readonly adminId: AdminId;
  readonly totalAmount: number;
  readonly creditCount: number;
  readonly byReason: Readonly<Record<AdminCreditReason, number>>;
}

/**
 * Summary of credits received by a player
 */
export interface PlayerCreditSummary {
  readonly playerId: PlayerId;
  readonly totalAmount: number;
  readonly creditCount: number;
  readonly byReason: Readonly<Record<AdminCreditReason, number>>;
}

/**
 * Summary of credits by reason
 */
export interface ReasonCreditSummary {
  readonly reason: AdminCreditReason;
  readonly totalAmount: number;
  readonly creditCount: number;
  readonly uniqueAdmins: number;
  readonly uniquePlayers: number;
}

// ============================================================================
// Factory Helpers
// ============================================================================

/**
 * Create a successful validation result
 */
export function validAdminCreditResult(): AdminCreditValidationResult {
  return { isValid: true, errors: [] };
}

/**
 * Create a failed validation result
 */
export function invalidAdminCreditResult(
  errors: readonly AdminCreditError[]
): AdminCreditValidationResult {
  return { isValid: false, errors };
}

/**
 * Create an admin credit error
 */
export function createAdminCreditError(
  code: AdminCreditErrorCode,
  message: string,
  field?: string,
  value?: unknown
): AdminCreditError {
  return { code, message, field, value };
}

/**
 * Create a successful credit result
 */
export function successAdminCreditResult(
  intentId: AdminCreditIntentId,
  entrySequence: number
): AdminCreditResult {
  return { success: true, intentId, entrySequence };
}

/**
 * Create a failed credit result
 */
export function failAdminCreditResult(error: string): AdminCreditResult {
  return { success: false, error };
}

/**
 * Create a duplicate credit result
 */
export function duplicateAdminCreditResult(intentId: AdminCreditIntentId): AdminCreditResult {
  return { success: false, isDuplicate: true, intentId, error: 'Duplicate intent' };
}

/**
 * Create empty reason breakdown
 */
export function emptyReasonBreakdown(): Record<AdminCreditReason, number> {
  return {
    OFFLINE_BUYIN: 0,
    PROMOTION: 0,
    TESTING: 0,
    CORRECTION: 0,
  };
}
