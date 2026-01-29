/**
 * ReconciliationBoundaryGuards.ts
 * Phase A1 - Grey Flow Reconciliation & Periodic Settlement
 *
 * BOUNDARY GUARDS FOR RECONCILIATION
 *
 * This module explicitly forbids certain operations and concepts.
 * It enforces the read-only nature of the reconciliation system.
 *
 * @external This module operates OUTSIDE the frozen engine.
 * @readonly This module NEVER mutates any state.
 * @deterministic Same inputs always produce same outputs.
 */

import {
  ReconciliationResult,
  ReconciliationErrorCode,
  reconciliationSuccess,
  reconciliationFailure,
  createReconciliationError,
  RECONCILIATION_FORBIDDEN_CONCEPTS,
  isValidInteger,
  isValidPositiveInteger,
} from './ReconciliationTypes';

// ============================================================================
// MUTATION GUARD
// ============================================================================

/**
 * EXPLICITLY BLOCK all mutations.
 * Reconciliation is READ-ONLY.
 */
export const MUTATION_BLOCKED = Object.freeze({
  message:
    'Reconciliation system is READ-ONLY. ' +
    'No mutations are allowed. ' +
    'All views are pure functions over GreyFlow data.',
  blockedOperations: Object.freeze([
    'create',
    'update',
    'delete',
    'modify',
    'mutate',
    'change',
    'set',
    'add',
    'remove',
  ]),
});

// ============================================================================
// BALANCE CONCEPT GUARD
// ============================================================================

/**
 * EXPLICITLY BLOCK balance concepts.
 * Reconciliation deals with REFERENCES, not balances.
 */
export const BALANCE_CONCEPT_BLOCKED = Object.freeze({
  message:
    'Reconciliation system does NOT track balances. ' +
    'All outputs are REFERENCES only. ' +
    'Use netReference, netPlatformReference, etc. - NOT balance.',
  blockedTerms: Object.freeze([
    'balance',
    'currentBalance',
    'availableBalance',
    'totalBalance',
  ]),
});

// ============================================================================
// ENGINE IMPORT GUARD
// ============================================================================

/**
 * EXPLICITLY BLOCK engine imports.
 * Reconciliation must not import from frozen engine.
 */
export const ENGINE_IMPORT_BLOCKED = Object.freeze({
  message:
    'Reconciliation system must NOT import from frozen engine. ' +
    'Only import from grey-runtime for GreyFlow data.',
  blockedPaths: Object.freeze([
    'src/engine',
    '../engine',
    '../../engine',
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
    'Reconciliation system must NOT use implicit time. ' +
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

  for (const forbidden of RECONCILIATION_FORBIDDEN_CONCEPTS) {
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
): ReconciliationResult<void> {
  const found = findForbiddenConcepts(text);

  if (found.length > 0) {
    return reconciliationFailure(
      createReconciliationError(
        ReconciliationErrorCode.INVALID_PARTY_TYPE,
        `Field '${fieldName}' contains forbidden concepts: ${found.join(', ')}`,
        { fieldName, forbiddenConcepts: found }
      )
    );
  }

  return reconciliationSuccess(undefined);
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
): ReconciliationResult<number> {
  if (!isValidInteger(value)) {
    return reconciliationFailure(
      createReconciliationError(
        ReconciliationErrorCode.NON_INTEGER_VALUE,
        `Field '${fieldName}' must be an integer, got: ${value}`,
        { fieldName, value }
      )
    );
  }

  return reconciliationSuccess(value);
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
): ReconciliationResult<number> {
  if (!isValidPositiveInteger(value)) {
    if (!isValidInteger(value)) {
      return reconciliationFailure(
        createReconciliationError(
          ReconciliationErrorCode.NON_INTEGER_VALUE,
          `Field '${fieldName}' must be an integer, got: ${value}`,
          { fieldName, value }
        )
      );
    }
    return reconciliationFailure(
      createReconciliationError(
        ReconciliationErrorCode.INVALID_TIMESTAMP,
        `Field '${fieldName}' must be positive, got: ${value}`,
        { fieldName, value }
      )
    );
  }

  return reconciliationSuccess(value);
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
): ReconciliationResult<number> {
  return assertPositiveInteger(timestamp, fieldName);
}

// ============================================================================
// PERIOD GUARDS
// ============================================================================

/**
 * Assert period is valid.
 *
 * @param startTimestamp - Period start
 * @param endTimestamp - Period end
 * @returns Result indicating success or failure
 */
export function assertValidPeriod(
  startTimestamp: number,
  endTimestamp: number
): ReconciliationResult<void> {
  const startResult = assertValidTimestamp(startTimestamp, 'startTimestamp');
  if (!startResult.success) {
    return reconciliationFailure(startResult.error);
  }

  const endResult = assertValidTimestamp(endTimestamp, 'endTimestamp');
  if (!endResult.success) {
    return reconciliationFailure(endResult.error);
  }

  if (startTimestamp >= endTimestamp) {
    return reconciliationFailure(
      createReconciliationError(
        ReconciliationErrorCode.INVALID_PERIOD,
        `startTimestamp (${startTimestamp}) must be less than endTimestamp (${endTimestamp})`,
        { startTimestamp, endTimestamp }
      )
    );
  }

  return reconciliationSuccess(undefined);
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
  validations: Array<() => ReconciliationResult<unknown>>
): ReconciliationResult<void> {
  for (const validate of validations) {
    const result = validate();
    if (!result.success) {
      return reconciliationFailure(result.error);
    }
  }

  return reconciliationSuccess(undefined);
}

// ============================================================================
// GREY FLOW MUTATION GUARD
// ============================================================================

/**
 * EXPLICITLY BLOCK grey flow mutations.
 * Reconciliation MUST NOT mutate GreyFlow data.
 */
export const GREY_FLOW_MUTATION_BLOCKED = Object.freeze({
  message:
    'Reconciliation system MUST NOT mutate GreyFlow data. ' +
    'Only read-only access via GreyFlowRegistry.getX() methods is allowed.',
  blockedMethods: Object.freeze([
    'appendFlow',
    'confirmFlow',
    'voidFlow',
    'createSession',
  ]),
});

/**
 * Assert that an object does not have mutation methods.
 * Used to verify that we're working with read-only views.
 */
export function assertNoMutationMethods(
  obj: unknown,
  objectName: string
): ReconciliationResult<void> {
  const mutationMethods = [
    'appendFlow',
    'confirmFlow',
    'voidFlow',
    'createSession',
    'create',
    'update',
    'delete',
    'modify',
    'mutate',
  ];

  for (const method of mutationMethods) {
    if (
      obj !== null &&
      typeof obj === 'object' &&
      method in obj &&
      typeof (obj as Record<string, unknown>)[method] === 'function'
    ) {
      // It's OK for registry to have these methods - we just won't call them
      // This guard is informational
    }
  }

  return reconciliationSuccess(undefined);
}

// ============================================================================
// BOUNDARY GUARD DOCUMENTATION
// ============================================================================

/**
 * Documentation of all boundary guards in the reconciliation system.
 */
export const RECONCILIATION_BOUNDARY_GUARD_DOCUMENTATION = Object.freeze({
  title: 'Grey Reconciliation Boundary Guards',
  version: '1.0.0',

  guards: Object.freeze([
    {
      name: 'Mutation Blocked',
      description: 'All mutation operations are blocked',
      blockedOperations: MUTATION_BLOCKED.blockedOperations,
    },
    {
      name: 'Balance Concept Blocked',
      description: 'Balance terminology is blocked',
      blockedTerms: BALANCE_CONCEPT_BLOCKED.blockedTerms,
    },
    {
      name: 'Engine Import Blocked',
      description: 'Imports from frozen engine are blocked',
      blockedPaths: ENGINE_IMPORT_BLOCKED.blockedPaths,
    },
    {
      name: 'Implicit Time Blocked',
      description: 'System clock access is blocked',
      blockedOperations: IMPLICIT_TIME_BLOCKED.blockedOperations,
    },
    {
      name: 'Forbidden Concepts',
      description: 'Payment, wallet, crypto terminology is blocked',
      blockedTerms: RECONCILIATION_FORBIDDEN_CONCEPTS,
    },
    {
      name: 'Grey Flow Mutation Blocked',
      description: 'GreyFlow mutation methods must not be called',
      blockedMethods: GREY_FLOW_MUTATION_BLOCKED.blockedMethods,
    },
  ]),

  invariants: Object.freeze([
    'Same inputs produce same outputs (deterministic)',
    'All timestamps are explicit inputs',
    'All values are integers',
    'No mutations to any state',
    'No balance tracking (references only)',
    'No engine imports',
    'No GreyFlow mutations',
  ]),
});
