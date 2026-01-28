/**
 * TopUpIntent.ts
 * Phase 28 - External Top-Up Integration Boundary (Blueprint)
 *
 * Defines the immutable TopUpIntent type - the input structure for
 * recording external top-ups.
 *
 * An intent represents an EXTERNAL FACT: a validated request to
 * increase a player's chip count.
 *
 * HARD CONSTRAINTS:
 * - Intent is immutable after creation
 * - intentId is the idempotency key
 * - amount must be positive integer chips
 * - Targets PLAYER only (never club/agent/platform)
 *
 * EXPLICITLY FORBIDDEN FIELDS:
 * - currency, currencyCode, currencyType
 * - wallet, walletId, walletAddress
 * - paymentId, paymentStatus, paymentMethod
 * - txHash, transactionId, blockHash
 * - address, accountNumber, cardNumber
 */

import { PlayerId } from '../security/Identity';
import { TableId } from '../security/AuditLog';
import { ClubId } from '../club/ClubTypes';
import { TopUpIntentId, TOP_UP_SOURCE, TopUpSource } from './TopUpTypes';

// ============================================================================
// Top-Up Intent Type
// ============================================================================

/**
 * Immutable top-up intent
 *
 * Represents an external request to add chips to a player's account.
 * The intent is the bridge between external systems and the ledger.
 *
 * INVARIANTS:
 * - All fields are readonly (immutable after creation)
 * - intentId is globally unique and serves as idempotency key
 * - amount is a positive integer (chips, not currency)
 * - source is always EXTERNAL_TOPUP
 * - playerId is required (top-ups target players only)
 */
export interface TopUpIntent {
  /**
   * Unique identifier for this intent (idempotency key)
   * Duplicate intents with same ID must be rejected
   */
  readonly intentId: TopUpIntentId;

  /**
   * Target player receiving the chips
   * Top-ups can ONLY credit players (never club/agent/platform)
   */
  readonly playerId: PlayerId;

  /**
   * Club context where the top-up applies
   * This is for organizational grouping only, not revenue
   */
  readonly clubId: ClubId;

  /**
   * Optional table context
   * If provided, the top-up is associated with this specific table
   */
  readonly tableId?: TableId;

  /**
   * Amount of chips to add (positive integer only)
   * This is NOT currency - it's a unit-agnostic chip count
   */
  readonly amount: number;

  /**
   * Source marker (always EXTERNAL_TOPUP)
   * This ensures top-ups are never confused with revenue
   */
  readonly source: TopUpSource;

  /**
   * Timestamp when the intent was created
   */
  readonly requestedAt: number;

  /**
   * Optional metadata (string key-value pairs only)
   * For external correlation, never for business logic
   *
   * FORBIDDEN KEYS (will cause validation failure):
   * - currency, wallet, payment, account, transaction
   * - Any key containing these forbidden concept words
   */
  readonly metadata?: Readonly<Record<string, string>>;
}

// ============================================================================
// Intent Creation
// ============================================================================

/**
 * Input for creating a top-up intent
 */
export interface TopUpIntentInput {
  readonly intentId: TopUpIntentId;
  readonly playerId: PlayerId;
  readonly clubId: ClubId;
  readonly tableId?: TableId;
  readonly amount: number;
  readonly metadata?: Readonly<Record<string, string>>;
}

/**
 * Create a top-up intent from input
 *
 * This is a pure function that creates an immutable intent.
 * It does NOT validate - validation is done by TopUpBoundary.
 */
export function createTopUpIntent(input: TopUpIntentInput): TopUpIntent {
  return {
    intentId: input.intentId,
    playerId: input.playerId,
    clubId: input.clubId,
    tableId: input.tableId,
    amount: input.amount,
    source: TOP_UP_SOURCE,
    requestedAt: Date.now(),
    metadata: input.metadata,
  };
}

/**
 * Create a top-up intent with specific timestamp (for testing/replay)
 */
export function createTopUpIntentWithTimestamp(
  input: TopUpIntentInput,
  requestedAt: number
): TopUpIntent {
  return {
    intentId: input.intentId,
    playerId: input.playerId,
    clubId: input.clubId,
    tableId: input.tableId,
    amount: input.amount,
    source: TOP_UP_SOURCE,
    requestedAt,
    metadata: input.metadata,
  };
}

// ============================================================================
// Intent Utilities
// ============================================================================

/**
 * Check if an intent has metadata
 */
export function hasMetadata(intent: TopUpIntent): boolean {
  return intent.metadata !== undefined && Object.keys(intent.metadata).length > 0;
}

/**
 * Get metadata value (type-safe)
 */
export function getMetadataValue(
  intent: TopUpIntent,
  key: string
): string | undefined {
  return intent.metadata?.[key];
}

/**
 * Create a deterministic string representation of an intent
 * Used for logging and debugging (never for checksum)
 */
export function intentToString(intent: TopUpIntent): string {
  return `TopUpIntent[${intent.intentId}]: ${intent.amount} chips to ${intent.playerId} @ ${intent.clubId}`;
}
