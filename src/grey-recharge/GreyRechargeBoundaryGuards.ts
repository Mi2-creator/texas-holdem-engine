/**
 * GreyRechargeBoundaryGuards.ts
 * Phase A3 - Grey Recharge Reference Mapping
 *
 * BOUNDARY GUARDS FOR RECHARGE REFERENCE MAPPING
 *
 * This module explicitly forbids certain operations and concepts.
 * It enforces the REFERENCE-ONLY nature of the recharge system.
 *
 * @external This module operates OUTSIDE the frozen engine.
 * @readonly This module NEVER mutates GreyFlow or Attribution data.
 * @reference This module creates REFERENCES only, no value movement.
 * @deterministic Same inputs always produce same outputs.
 */

import {
  RechargeResult,
  RechargeErrorCode,
  rechargeSuccess,
  rechargeFailure,
  createRechargeError,
  RECHARGE_FORBIDDEN_CONCEPTS,
  isValidInteger,
  isValidNonNegativeInteger,
  isValidPositiveInteger,
  isValidTimestamp,
} from './GreyRechargeTypes';

// ============================================================================
// BALANCE MATH GUARD
// ============================================================================

/**
 * EXPLICITLY BLOCK all balance arithmetic.
 * Recharge is REFERENCE-ONLY.
 */
export const BALANCE_MATH_BLOCKED = Object.freeze({
  message:
    'Recharge reference system does NOT perform balance arithmetic. ' +
    'All outputs are REFERENCES only. ' +
    'Use referenceAmount, linkedReferenceTotal - NOT balance.',
  blockedOperations: Object.freeze([
    'addToBalance',
    'subtractFromBalance',
    'updateBalance',
    'setBalance',
    'credit',
    'debit',
  ]),
});

// ============================================================================
// ENGINE IMPORT GUARD
// ============================================================================

/**
 * EXPLICITLY BLOCK engine imports.
 * Recharge must not import from frozen engine.
 */
export const ENGINE_IMPORT_BLOCKED = Object.freeze({
  message:
    'Recharge reference system must NOT import from frozen engine. ' +
    'Only import from grey-runtime (for types) and grey-reconciliation.',
  blockedPaths: Object.freeze([
    'src/engine',
    '../engine',
    '../../engine',
  ]),
});

// ============================================================================
// ATTRIBUTION LOGIC GUARD
// ============================================================================

/**
 * EXPLICITLY BLOCK attribution logic.
 * Recharge must not perform attribution.
 */
export const ATTRIBUTION_LOGIC_BLOCKED = Object.freeze({
  message:
    'Recharge reference system must NOT perform attribution logic. ' +
    'Attribution is handled by grey-attribution module only.',
  blockedOperations: Object.freeze([
    'calculateAttribution',
    'distributeShare',
    'applyRules',
    'splitAmount',
  ]),
});

// ============================================================================
// SETTLEMENT LOGIC GUARD
// ============================================================================

/**
 * EXPLICITLY BLOCK settlement logic.
 * Recharge must not perform settlement.
 */
export const SETTLEMENT_LOGIC_BLOCKED = Object.freeze({
  message:
    'Recharge reference system must NOT perform settlement logic. ' +
    'Settlement is handled by grey-reconciliation module only.',
  blockedOperations: Object.freeze([
    'settle',
    'reconcile',
    'finalize',
    'payout',
  ]),
});

// ============================================================================
// GREYFLOW MUTATION GUARD
// ============================================================================

/**
 * EXPLICITLY BLOCK GreyFlow mutations.
 * Recharge MUST NOT mutate GreyFlow data.
 */
export const GREYFLOW_MUTATION_BLOCKED = Object.freeze({
  message:
    'Recharge reference system MUST NOT mutate GreyFlow data. ' +
    'Only read-only access for linking is allowed.',
  blockedMethods: Object.freeze([
    'appendFlow',
    'confirmFlow',
    'voidFlow',
    'modifyFlow',
  ]),
});

// ============================================================================
// ATTRIBUTION MUTATION GUARD
// ============================================================================

/**
 * EXPLICITLY BLOCK Attribution mutations.
 * Recharge MUST NOT mutate Attribution data.
 */
export const ATTRIBUTION_MUTATION_BLOCKED = Object.freeze({
  message:
    'Recharge reference system MUST NOT mutate Attribution data. ' +
    'Recharge is attribution-neutral.',
  blockedMethods: Object.freeze([
    'createAttributionEntry',
    'modifyAttribution',
    'updateRuleSet',
  ]),
});

// ============================================================================
// IMPLICIT TIME GUARD
// ============================================================================

/**
 * EXPLICITLY BLOCK implicit time usage.
 * All timestamps must be explicit inputs.
 */
export const IMPLICIT_TIME_BLOCKED = Object.freeze({
  message:
    'Recharge reference system must NOT use implicit time. ' +
    'All timestamps must be explicitly provided as inputs. ' +
    'No Date.now(), no new Date(), no system clock access.',
  blockedOperations: Object.freeze([
    'Date.now()',
    'new Date()',
    'performance.now()',
    'process.hrtime()',
  ]),
});

// ============================================================================
// FORBIDDEN CONCEPT GUARDS
// ============================================================================

/**
 * Check if text contains forbidden concepts.
 *
 * @param text - Text to check
 * @returns Array of found forbidden concepts
 */
export function findForbiddenConcepts(text: string): readonly string[] {
  const lower = text.toLowerCase();
  const found: string[] = [];

  for (const forbidden of RECHARGE_FORBIDDEN_CONCEPTS) {
    if (lower.includes(forbidden)) {
      found.push(forbidden);
    }
  }

  return Object.freeze(found);
}

/**
 * Assert text contains no forbidden concepts.
 *
 * @param text - Text to check
 * @param fieldName - Name of the field being checked
 * @returns Result indicating success or failure
 */
export function assertNoForbiddenConcepts(
  text: string,
  fieldName: string
): RechargeResult<void> {
  const found = findForbiddenConcepts(text);

  if (found.length > 0) {
    return rechargeFailure(
      createRechargeError(
        RechargeErrorCode.NON_INTEGER_VALUE, // Using closest error code
        `Field '${fieldName}' contains forbidden concepts: ${found.join(', ')}`,
        { fieldName, forbiddenConcepts: found }
      )
    );
  }

  return rechargeSuccess(undefined);
}

// ============================================================================
// INTEGER GUARDS
// ============================================================================

/**
 * Assert value is an integer.
 *
 * @param value - Value to check
 * @param fieldName - Name of the field being checked
 * @returns Result indicating success or failure
 */
export function assertInteger(
  value: number,
  fieldName: string
): RechargeResult<number> {
  if (!isValidInteger(value)) {
    return rechargeFailure(
      createRechargeError(
        RechargeErrorCode.NON_INTEGER_VALUE,
        `Field '${fieldName}' must be an integer, got: ${value}`,
        { fieldName, value }
      )
    );
  }

  return rechargeSuccess(value);
}

/**
 * Assert value is a non-negative integer.
 *
 * @param value - Value to check
 * @param fieldName - Name of the field being checked
 * @returns Result indicating success or failure
 */
export function assertNonNegativeInteger(
  value: number,
  fieldName: string
): RechargeResult<number> {
  if (!isValidNonNegativeInteger(value)) {
    if (!isValidInteger(value)) {
      return rechargeFailure(
        createRechargeError(
          RechargeErrorCode.NON_INTEGER_VALUE,
          `Field '${fieldName}' must be an integer, got: ${value}`,
          { fieldName, value }
        )
      );
    }
    return rechargeFailure(
      createRechargeError(
        RechargeErrorCode.INVALID_REFERENCE_AMOUNT,
        `Field '${fieldName}' must be non-negative, got: ${value}`,
        { fieldName, value }
      )
    );
  }

  return rechargeSuccess(value);
}

/**
 * Assert value is a positive integer.
 *
 * @param value - Value to check
 * @param fieldName - Name of the field being checked
 * @returns Result indicating success or failure
 */
export function assertPositiveInteger(
  value: number,
  fieldName: string
): RechargeResult<number> {
  if (!isValidPositiveInteger(value)) {
    if (!isValidInteger(value)) {
      return rechargeFailure(
        createRechargeError(
          RechargeErrorCode.NON_INTEGER_VALUE,
          `Field '${fieldName}' must be an integer, got: ${value}`,
          { fieldName, value }
        )
      );
    }
    return rechargeFailure(
      createRechargeError(
        RechargeErrorCode.INVALID_TIMESTAMP,
        `Field '${fieldName}' must be positive, got: ${value}`,
        { fieldName, value }
      )
    );
  }

  return rechargeSuccess(value);
}

/**
 * Assert timestamp is valid.
 *
 * @param timestamp - Timestamp to check
 * @param fieldName - Name of the field being checked
 * @returns Result indicating success or failure
 */
export function assertValidTimestamp(
  timestamp: number,
  fieldName: string
): RechargeResult<number> {
  if (!isValidTimestamp(timestamp)) {
    return rechargeFailure(
      createRechargeError(
        RechargeErrorCode.INVALID_TIMESTAMP,
        `Field '${fieldName}' must be a valid timestamp, got: ${timestamp}`,
        { fieldName, timestamp }
      )
    );
  }

  return rechargeSuccess(timestamp);
}

// ============================================================================
// VALIDATION BATCH HELPER
// ============================================================================

/**
 * Validate multiple conditions at once.
 * Returns first error encountered or success.
 *
 * @param validations - Array of validation functions to run
 * @returns First error or success
 */
export function validateAll(
  validations: Array<() => RechargeResult<unknown>>
): RechargeResult<void> {
  for (const validate of validations) {
    const result = validate();
    if (!result.success) {
      return rechargeFailure(result.error);
    }
  }

  return rechargeSuccess(undefined);
}

// ============================================================================
// REFERENCE CONSISTENCY GUARD
// ============================================================================

/**
 * Assert that a reference amount matches expected value.
 * For validation only - no arithmetic side effects.
 *
 * @param actual - Actual amount
 * @param expected - Expected amount
 * @param context - Context for error message
 * @returns Result indicating success or failure
 */
export function assertReferenceConsistency(
  actual: number,
  expected: number,
  context: string
): RechargeResult<void> {
  if (actual !== expected) {
    return rechargeFailure(
      createRechargeError(
        RechargeErrorCode.CHECKSUM_MISMATCH,
        `Reference amount mismatch in ${context}: expected ${expected}, got ${actual}`,
        { context, expected, actual }
      )
    );
  }

  return rechargeSuccess(undefined);
}

// ============================================================================
// BOUNDARY GUARD DOCUMENTATION
// ============================================================================

/**
 * Documentation of all boundary guards in the recharge system.
 */
export const RECHARGE_BOUNDARY_GUARD_DOCUMENTATION = Object.freeze({
  title: 'Grey Recharge Reference Mapping Boundary Guards',
  version: '1.0.0',

  guards: Object.freeze([
    {
      name: 'Balance Math Blocked',
      description: 'All balance arithmetic is blocked',
      blockedOperations: BALANCE_MATH_BLOCKED.blockedOperations,
    },
    {
      name: 'Engine Import Blocked',
      description: 'Imports from frozen engine are blocked',
      blockedPaths: ENGINE_IMPORT_BLOCKED.blockedPaths,
    },
    {
      name: 'Attribution Logic Blocked',
      description: 'Attribution logic is blocked',
      blockedOperations: ATTRIBUTION_LOGIC_BLOCKED.blockedOperations,
    },
    {
      name: 'Settlement Logic Blocked',
      description: 'Settlement logic is blocked',
      blockedOperations: SETTLEMENT_LOGIC_BLOCKED.blockedOperations,
    },
    {
      name: 'GreyFlow Mutation Blocked',
      description: 'GreyFlow mutations are blocked',
      blockedMethods: GREYFLOW_MUTATION_BLOCKED.blockedMethods,
    },
    {
      name: 'Attribution Mutation Blocked',
      description: 'Attribution mutations are blocked',
      blockedMethods: ATTRIBUTION_MUTATION_BLOCKED.blockedMethods,
    },
    {
      name: 'Implicit Time Blocked',
      description: 'System clock access is blocked',
      blockedOperations: IMPLICIT_TIME_BLOCKED.blockedOperations,
    },
    {
      name: 'Forbidden Concepts',
      description: 'Payment, wallet, crypto, balance terminology is blocked',
      blockedTerms: RECHARGE_FORBIDDEN_CONCEPTS,
    },
  ]),

  invariants: Object.freeze([
    'Same inputs produce same outputs (deterministic)',
    'All timestamps are explicit inputs',
    'All values are integers',
    'No mutations to GreyFlow data',
    'No mutations to Attribution data',
    'No balance arithmetic (reference only)',
    'No engine imports',
    'No attribution logic',
    'No settlement logic',
    'Append-only registry',
    'Idempotent operations',
  ]),
});
