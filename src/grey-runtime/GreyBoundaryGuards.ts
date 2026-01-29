/**
 * GreyBoundaryGuards.ts
 * Phase A - Grey Flow Settlement Runtime
 *
 * BOUNDARY GUARDS
 *
 * This module explicitly blocks forbidden concepts and operations.
 * It enforces the constraints of the grey flow runtime.
 *
 * @external This module operates OUTSIDE the frozen engine.
 * @readonly Engine state is never mutated.
 * @deterministic Same inputs always produce same outputs.
 */

import {
  GreyResult,
  GreyError,
  GreyErrorCode,
  greySuccess,
  greyFailure,
  createGreyError,
  FORBIDDEN_CONCEPTS,
  isValidInteger,
  isValidNonNegativeInteger,
  isValidPositiveInteger,
  isValidTimestamp,
} from './GreyTypes';

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

  for (const forbidden of FORBIDDEN_CONCEPTS) {
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
): GreyResult<void> {
  const found = findForbiddenConcepts(text);

  if (found.length > 0) {
    return greyFailure(
      createGreyError(
        GreyErrorCode.INVALID_FLOW_TYPE,
        `Field '${fieldName}' contains forbidden concepts: ${found.join(', ')}`,
        { fieldName, forbiddenConcepts: found }
      )
    );
  }

  return greySuccess(undefined);
}

// ============================================================================
// INTEGER VALUE GUARDS
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
): GreyResult<number> {
  if (!isValidInteger(value)) {
    return greyFailure(
      createGreyError(
        GreyErrorCode.NON_INTEGER_AMOUNT,
        `Field '${fieldName}' must be an integer, got: ${value}`,
        { fieldName, value }
      )
    );
  }

  return greySuccess(value);
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
): GreyResult<number> {
  if (!isValidNonNegativeInteger(value)) {
    if (!isValidInteger(value)) {
      return greyFailure(
        createGreyError(
          GreyErrorCode.NON_INTEGER_AMOUNT,
          `Field '${fieldName}' must be an integer, got: ${value}`,
          { fieldName, value }
        )
      );
    }
    return greyFailure(
      createGreyError(
        GreyErrorCode.NEGATIVE_AMOUNT,
        `Field '${fieldName}' must be non-negative, got: ${value}`,
        { fieldName, value }
      )
    );
  }

  return greySuccess(value);
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
): GreyResult<number> {
  if (!isValidPositiveInteger(value)) {
    if (!isValidInteger(value)) {
      return greyFailure(
        createGreyError(
          GreyErrorCode.NON_INTEGER_AMOUNT,
          `Field '${fieldName}' must be an integer, got: ${value}`,
          { fieldName, value }
        )
      );
    }
    return greyFailure(
      createGreyError(
        GreyErrorCode.NEGATIVE_AMOUNT,
        `Field '${fieldName}' must be positive, got: ${value}`,
        { fieldName, value }
      )
    );
  }

  return greySuccess(value);
}

/**
 * Assert value is a valid timestamp.
 *
 * @param timestamp - Timestamp to check
 * @param fieldName - Name of the field being checked
 * @returns Result indicating success or failure
 */
export function assertValidTimestamp(
  timestamp: number,
  fieldName: string
): GreyResult<number> {
  if (!isValidTimestamp(timestamp)) {
    return greyFailure(
      createGreyError(
        GreyErrorCode.INVALID_TIMESTAMP,
        `Field '${fieldName}' must be a valid timestamp (positive integer), got: ${timestamp}`,
        { fieldName, timestamp }
      )
    );
  }

  return greySuccess(timestamp);
}

// ============================================================================
// BALANCE CONCEPT GUARD
// ============================================================================

/**
 * EXPLICITLY BLOCK balance-related operations.
 * Grey flows are REFERENCES, not balances.
 *
 * This guard exists to make it clear that the grey flow system
 * does NOT track balances. It only records flow references.
 */
export const BALANCE_CONCEPT_BLOCKED = Object.freeze({
  message:
    'Grey flow system does NOT track balances. ' +
    'Flows are REFERENCES only. ' +
    'Use netFlowReference for aggregation, NOT balance.',
  blockedOperations: Object.freeze([
    'getBalance',
    'setBalance',
    'updateBalance',
    'addToBalance',
    'subtractFromBalance',
    'checkBalance',
  ]),
});

/**
 * Assert that a field name does not suggest balance tracking.
 *
 * @param fieldName - Name to check
 * @returns Result indicating success or failure
 */
export function assertNotBalanceField(fieldName: string): GreyResult<void> {
  const lower = fieldName.toLowerCase();

  if (lower.includes('balance')) {
    return greyFailure(
      createGreyError(
        GreyErrorCode.INVALID_FLOW_TYPE,
        `Field name '${fieldName}' suggests balance tracking. ` +
          'Grey flows are REFERENCES only, not balances.',
        { fieldName }
      )
    );
  }

  return greySuccess(undefined);
}

// ============================================================================
// ENGINE MUTATION GUARD
// ============================================================================

/**
 * EXPLICITLY BLOCK engine mutation.
 * The engine is FROZEN and must not be modified.
 */
export const ENGINE_MUTATION_BLOCKED = Object.freeze({
  message:
    'Engine is FROZEN. Grey runtime MUST NOT modify engine state. ' +
    'Grey flows are external references only.',
  blockedOperations: Object.freeze([
    'modifyEngine',
    'updateEngine',
    'mutateEngine',
    'writeToEngine',
    'changeEngineState',
  ]),
});

// ============================================================================
// FLOAT/DECIMAL GUARD
// ============================================================================

/**
 * EXPLICITLY BLOCK float/decimal values.
 * All values must be integers.
 */
export const FLOAT_DECIMAL_BLOCKED = Object.freeze({
  message:
    'Grey flow system uses INTEGERS ONLY. ' +
    'No floats or decimals are allowed.',
  examples: Object.freeze([
    'BLOCKED: 100.5',
    'BLOCKED: 0.01',
    'ALLOWED: 100',
    'ALLOWED: 1',
  ]),
});

/**
 * Assert value is not a float (must be integer).
 *
 * @param value - Value to check
 * @param fieldName - Name of the field being checked
 * @returns Result indicating success or failure
 */
export function assertNotFloat(
  value: number,
  fieldName: string
): GreyResult<number> {
  if (!Number.isInteger(value)) {
    return greyFailure(
      createGreyError(
        GreyErrorCode.NON_INTEGER_AMOUNT,
        `Field '${fieldName}' must be an integer, got float: ${value}`,
        { fieldName, value }
      )
    );
  }

  return greySuccess(value);
}

// ============================================================================
// ASYNC/SIDE EFFECT GUARD
// ============================================================================

/**
 * EXPLICITLY BLOCK async operations.
 * Grey runtime is synchronous and deterministic.
 */
export const ASYNC_BLOCKED = Object.freeze({
  message:
    'Grey flow system is SYNCHRONOUS and DETERMINISTIC. ' +
    'No async operations, promises, or side effects allowed.',
  blockedPatterns: Object.freeze([
    'async function',
    'Promise',
    'setTimeout',
    'setInterval',
    'fetch',
    'XMLHttpRequest',
  ]),
});

// ============================================================================
// CLOCK GUARD
// ============================================================================

/**
 * EXPLICITLY BLOCK clock access.
 * Timestamps must be injected, not read from system clock.
 */
export const CLOCK_ACCESS_BLOCKED = Object.freeze({
  message:
    'Grey flow system does NOT access system clock. ' +
    'All timestamps must be INJECTED via injectedTimestamp parameter.',
  blockedOperations: Object.freeze([
    'Date.now()',
    'new Date()',
    'performance.now()',
    'process.hrtime()',
  ]),
});

// ============================================================================
// VALIDATION BATCH HELPER
// ============================================================================

/**
 * Validate multiple fields at once.
 * Returns first error encountered or success.
 *
 * @param validations - Array of validation functions to run
 * @returns First error or success
 */
export function validateAll(
  validations: Array<() => GreyResult<unknown>>
): GreyResult<void> {
  for (const validate of validations) {
    const result = validate();
    if (!result.success) {
      return greyFailure(result.error);
    }
  }

  return greySuccess(undefined);
}

// ============================================================================
// BOUNDARY GUARD DOCUMENTATION
// ============================================================================

/**
 * Documentation of all boundary guards in the grey flow system.
 */
export const BOUNDARY_GUARD_DOCUMENTATION = Object.freeze({
  title: 'Grey Flow Boundary Guards',
  version: '1.0.0',

  guards: Object.freeze([
    {
      name: 'Forbidden Concepts',
      description: 'Blocks payment, wallet, crypto terminology',
      blockedTerms: FORBIDDEN_CONCEPTS,
    },
    {
      name: 'Integer Only',
      description: 'All numeric values must be integers',
      blockedTypes: ['float', 'decimal', 'fraction'],
    },
    {
      name: 'No Balances',
      description: 'Grey flows are references, not balances',
      blockedConcepts: ['balance tracking', 'balance updates'],
    },
    {
      name: 'Engine Frozen',
      description: 'Engine state cannot be modified',
      blockedOperations: ['engine mutation', 'state modification'],
    },
    {
      name: 'No Clocks',
      description: 'Timestamps must be injected',
      blockedAccess: ['system clock', 'Date.now()'],
    },
    {
      name: 'No Async',
      description: 'All operations are synchronous',
      blockedPatterns: ['Promise', 'async/await', 'callbacks'],
    },
  ]),

  invariants: Object.freeze([
    'Same inputs produce same outputs (deterministic)',
    'Duplicate flow IDs are rejected (idempotent)',
    'Records cannot be modified after creation (immutable)',
    'Records can only be added, not removed (append-only)',
    'All amounts are non-negative integers',
    'All timestamps are positive integers',
  ]),
});
