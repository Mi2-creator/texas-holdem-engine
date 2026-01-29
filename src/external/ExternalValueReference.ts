/**
 * ExternalValueReference.ts
 * Phase 33 - External Value Reference Mapping (Read-Only)
 *
 * Immutable reference to external value for reconciliation and audit.
 * Descriptive only - no value movement, no balance changes.
 */

import {
  ExternalValueRefId,
  ExternalValueSource,
  ExternalValueDirection,
  ExternalValueAmount,
} from './ExternalValueTypes';

// ============================================================================
// Reference Type
// ============================================================================

/**
 * Immutable external value reference.
 * Represents a reference to value from an external source.
 *
 * This is DESCRIPTIVE ONLY:
 * - Does not cause value movement
 * - Does not modify balances
 * - Used for reconciliation and audit
 */
export interface ExternalValueReference {
  /**
   * Unique identifier for this reference.
   */
  readonly id: ExternalValueRefId;

  /**
   * Source classification of the external value.
   */
  readonly source: ExternalValueSource;

  /**
   * Direction of value flow (descriptive only).
   * IN = value entering from external source
   * OUT = value leaving to external destination
   */
  readonly direction: ExternalValueDirection;

  /**
   * Integer amount of abstract value units.
   * Must be non-negative.
   */
  readonly amount: ExternalValueAmount;

  /**
   * Optional link to ledger entry for attribution.
   * Used for reconciliation - does NOT create ledger entries.
   */
  readonly linkedLedgerEntryId?: string;

  /**
   * Timestamp when reference was created.
   * Must be injected - not derived from system clock.
   */
  readonly createdAt: number;

  /**
   * Optional description for audit purposes.
   */
  readonly description?: string;

  /**
   * Optional opaque metadata.
   */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

// ============================================================================
// Validation Result Types
// ============================================================================

/**
 * Validation result for external value reference creation.
 * Structured result - never throws.
 */
export interface ExternalValueReferenceValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

// ============================================================================
// Reference Input Type
// ============================================================================

/**
 * Input for creating an external value reference.
 * All required fields must be provided.
 */
export interface ExternalValueReferenceInput {
  readonly id: ExternalValueRefId;
  readonly source: ExternalValueSource;
  readonly direction: ExternalValueDirection;
  readonly amount: ExternalValueAmount;
  readonly createdAt: number;
  readonly linkedLedgerEntryId?: string;
  readonly description?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

// ============================================================================
// Validation Function
// ============================================================================

/**
 * Validate external value reference input.
 * Returns structured result - never throws.
 *
 * Validates:
 * - Amount is integer
 * - Amount is non-negative
 * - ID is non-empty
 * - Source is valid
 * - Direction is valid
 * - CreatedAt is non-negative
 */
export function validateExternalValueReferenceInput(
  input: ExternalValueReferenceInput
): ExternalValueReferenceValidationResult {
  const errors: string[] = [];

  // Validate ID
  if (!input.id || typeof input.id !== 'string' || input.id.length === 0) {
    errors.push('ID must be a non-empty string');
  }

  // Validate amount is integer
  if (!Number.isInteger(input.amount)) {
    errors.push('Amount must be an integer');
  }

  // Validate amount is non-negative
  if (input.amount < 0) {
    errors.push('Amount must be non-negative');
  }

  // Validate source
  const validSources = ['MANUAL', 'CLUB_CREDIT', 'PROMO', 'LEGACY', 'ADJUSTMENT'];
  if (!validSources.includes(input.source)) {
    errors.push(`Source must be one of: ${validSources.join(', ')}`);
  }

  // Validate direction
  if (input.direction !== 'IN' && input.direction !== 'OUT') {
    errors.push('Direction must be IN or OUT');
  }

  // Validate createdAt
  if (!Number.isInteger(input.createdAt) || input.createdAt < 0) {
    errors.push('CreatedAt must be a non-negative integer');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// Reference Creation
// ============================================================================

/**
 * Create an immutable external value reference.
 * Returns null if validation fails.
 *
 * @param input - Reference input data
 * @returns Frozen reference or null if invalid
 */
export function createExternalValueReference(
  input: ExternalValueReferenceInput
): ExternalValueReference | null {
  const validation = validateExternalValueReferenceInput(input);
  if (!validation.valid) {
    return null;
  }

  const reference: ExternalValueReference = {
    id: input.id,
    source: input.source,
    direction: input.direction,
    amount: input.amount,
    createdAt: input.createdAt,
    linkedLedgerEntryId: input.linkedLedgerEntryId,
    description: input.description,
    metadata: input.metadata ? Object.freeze({ ...input.metadata }) : undefined,
  };

  return Object.freeze(reference);
}
