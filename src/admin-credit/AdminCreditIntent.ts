/**
 * AdminCreditIntent.ts
 * Phase 29 - Admin Credit (Manual Top-Up) System
 *
 * Immutable structure representing an admin-initiated credit request.
 * This file defines ONLY the intent structure - no business logic.
 *
 * An AdminCreditIntent is the input to the AdminCreditService,
 * which converts it to a TopUpIntent for processing through
 * the Phase 28 TopUpBoundary.
 *
 * INVARIANTS:
 * - All fields are readonly (immutable after creation)
 * - intentId is globally unique and serves as idempotency key
 * - amount is a positive integer (chips, not currency)
 * - note is required for audit trail
 * - adminId identifies the responsible admin
 */

import { PlayerId } from '../security/Identity';
import { TableId } from '../security/AuditLog';
import { ClubId } from '../club/ClubTypes';
import {
  AdminId,
  AdminCreditIntentId,
  AdminCreditReason,
} from './AdminCreditTypes';

// ============================================================================
// Admin Credit Intent Type
// ============================================================================

/**
 * Immutable admin credit intent
 *
 * Represents an admin's request to credit a player's chip balance.
 * This is NOT a payment - it's a privileged chip addition for
 * off-system cash handling, testing, promotions, or corrections.
 *
 * AUDIT REQUIREMENTS:
 * - adminId: Who initiated this credit
 * - reason: Why this credit was issued
 * - note: Human-readable justification (required)
 * - createdAt: When the intent was created
 */
export interface AdminCreditIntent {
  /**
   * Unique identifier for this intent (idempotency key)
   */
  readonly intentId: AdminCreditIntentId;

  /**
   * Admin user who initiated this credit
   */
  readonly adminId: AdminId;

  /**
   * Target player receiving the chips
   */
  readonly playerId: PlayerId;

  /**
   * Club context where the credit applies
   */
  readonly clubId: ClubId;

  /**
   * Optional table context
   */
  readonly tableId?: TableId;

  /**
   * Amount of chips to credit (positive integer only)
   */
  readonly amount: number;

  /**
   * Reason for this credit (from predefined enum)
   */
  readonly reason: AdminCreditReason;

  /**
   * Human-readable note (required for audit trail)
   * Should explain WHY this credit is being issued
   */
  readonly note: string;

  /**
   * Timestamp when the intent was created
   */
  readonly createdAt: number;
}

// ============================================================================
// Intent Creation
// ============================================================================

/**
 * Input for creating an admin credit intent
 */
export interface AdminCreditIntentInput {
  readonly intentId: AdminCreditIntentId;
  readonly adminId: AdminId;
  readonly playerId: PlayerId;
  readonly clubId: ClubId;
  readonly tableId?: TableId;
  readonly amount: number;
  readonly reason: AdminCreditReason;
  readonly note: string;
}

/**
 * Create an admin credit intent from input
 *
 * This is a pure function that creates an immutable intent.
 * It does NOT validate - validation is done by AdminCreditPolicy.
 */
export function createAdminCreditIntent(
  input: AdminCreditIntentInput
): AdminCreditIntent {
  return {
    intentId: input.intentId,
    adminId: input.adminId,
    playerId: input.playerId,
    clubId: input.clubId,
    tableId: input.tableId,
    amount: input.amount,
    reason: input.reason,
    note: input.note,
    createdAt: Date.now(),
  };
}

/**
 * Create an admin credit intent with specific timestamp (for testing/replay)
 */
export function createAdminCreditIntentWithTimestamp(
  input: AdminCreditIntentInput,
  createdAt: number
): AdminCreditIntent {
  return {
    intentId: input.intentId,
    adminId: input.adminId,
    playerId: input.playerId,
    clubId: input.clubId,
    tableId: input.tableId,
    amount: input.amount,
    reason: input.reason,
    note: input.note,
    createdAt,
  };
}

// ============================================================================
// Intent Utilities
// ============================================================================

/**
 * Create a deterministic string representation of an intent
 * Used for logging and debugging (never for checksum)
 */
export function adminCreditIntentToString(intent: AdminCreditIntent): string {
  return `AdminCredit[${intent.intentId}]: ${intent.amount} chips to ${intent.playerId} by ${intent.adminId} (${intent.reason})`;
}

/**
 * Check if an intent has a table context
 */
export function hasTableContext(intent: AdminCreditIntent): boolean {
  return intent.tableId !== undefined;
}
