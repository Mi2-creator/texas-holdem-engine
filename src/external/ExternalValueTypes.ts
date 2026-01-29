/**
 * ExternalValueTypes.ts
 * Phase 32 - External Settlement Boundary (Interface Only)
 *
 * Neutral, abstract value concepts for external settlement.
 * Types only - no logic, no side effects, no runtime behavior.
 */

// ============================================================================
// Branded Types
// ============================================================================

declare const ExternalValueSourceIdBrand: unique symbol;
declare const ExternalReferenceIdBrand: unique symbol;

/**
 * Branded type for external value source identifier.
 * Opaque identifier for the origin of external value.
 */
export type ExternalValueSourceId = string & { readonly [ExternalValueSourceIdBrand]: never };

/**
 * Branded type for external reference identifier.
 * Opaque identifier for tracking external requests.
 */
export type ExternalReferenceId = string & { readonly [ExternalReferenceIdBrand]: never };

/**
 * Integer-only external value amount.
 * Unit-agnostic - represents abstract value units.
 * No decimals, no currency specification.
 */
export type ExternalValueAmount = number;

// ============================================================================
// Direction & Status Types
// ============================================================================

/**
 * Direction of external value flow.
 * IN = value entering the engine from external source
 * OUT = value leaving the engine to external destination
 */
export type ExternalValueDirection = 'IN' | 'OUT';

/**
 * Status of external value settlement.
 * PENDING = awaiting confirmation
 * CONFIRMED = successfully settled
 * REJECTED = settlement rejected
 */
export type ExternalValueStatus = 'PENDING' | 'CONFIRMED' | 'REJECTED';

// ============================================================================
// Type Guards (compile-time only, no runtime behavior)
// ============================================================================

/**
 * Type assertion for ExternalValueSourceId.
 * Compile-time only - used for type narrowing.
 */
export function isExternalValueSourceId(value: string): value is ExternalValueSourceId {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Type assertion for ExternalReferenceId.
 * Compile-time only - used for type narrowing.
 */
export function isExternalReferenceId(value: string): value is ExternalReferenceId {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Type assertion for ExternalValueAmount.
 * Verifies integer-only constraint.
 */
export function isExternalValueAmount(value: number): value is ExternalValueAmount {
  return Number.isInteger(value);
}

/**
 * Type assertion for ExternalValueDirection.
 */
export function isExternalValueDirection(value: string): value is ExternalValueDirection {
  return value === 'IN' || value === 'OUT';
}

/**
 * Type assertion for ExternalValueStatus.
 */
export function isExternalValueStatus(value: string): value is ExternalValueStatus {
  return value === 'PENDING' || value === 'CONFIRMED' || value === 'REJECTED';
}
