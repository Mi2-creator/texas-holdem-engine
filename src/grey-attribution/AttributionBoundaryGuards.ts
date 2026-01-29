/**
 * AttributionBoundaryGuards.ts
 * Phase A2 - Grey Flow Multi-Level Attribution
 *
 * BOUNDARY GUARDS FOR ATTRIBUTION
 *
 * This module explicitly forbids certain operations and concepts.
 * It enforces the read-only nature of the attribution system.
 *
 * @external This module operates OUTSIDE the frozen engine.
 * @readonly This module NEVER mutates any state.
 * @deterministic Same inputs always produce same outputs.
 */

import {
  AttributionResult,
  AttributionErrorCode,
  attributionSuccess,
  attributionFailure,
  createAttributionError,
  ATTRIBUTION_FORBIDDEN_CONCEPTS,
  isValidInteger,
  isValidPositiveInteger,
  isValidBasisPoints,
  BASIS_POINTS_100_PERCENT,
} from './AttributionTypes';

// ============================================================================
// MUTATION GUARD
// ============================================================================

/**
 * EXPLICITLY BLOCK all mutations.
 * Attribution is READ-ONLY.
 */
export const MUTATION_BLOCKED = Object.freeze({
  message:
    'Attribution system is READ-ONLY. ' +
    'No mutations are allowed. ' +
    'All views are pure functions over reconciliation data.',
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
 * Attribution deals with SHARES, not balances.
 */
export const BALANCE_CONCEPT_BLOCKED = Object.freeze({
  message:
    'Attribution system does NOT track balances. ' +
    'All outputs are ATTRIBUTION SHARES only. ' +
    'Use totalAttributed, shareAmount, etc. - NOT balance.',
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
 * Attribution must not import from frozen engine.
 */
export const ENGINE_IMPORT_BLOCKED = Object.freeze({
  message:
    'Attribution system must NOT import from frozen engine. ' +
    'Only import from grey-runtime and grey-reconciliation.',
  blockedPaths: Object.freeze([
    'src/engine',
    '../engine',
    '../../engine',
  ]),
});

// ============================================================================
// RECURSIVE ATTRIBUTION GUARD
// ============================================================================

/**
 * EXPLICITLY BLOCK recursive attribution.
 * Attribution must be flat with explicit hierarchy traversal.
 */
export const RECURSIVE_ATTRIBUTION_BLOCKED = Object.freeze({
  message:
    'Attribution system must NOT use recursive functions for attribution. ' +
    'Use explicit hierarchy traversal with DAG validation.',
  blockedPatterns: Object.freeze([
    'recursiveAttribution',
    'attributeRecursively',
    'self-referencing rules',
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
    'Attribution system must NOT use implicit time. ' +
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
// GREY FLOW MUTATION GUARD
// ============================================================================

/**
 * EXPLICITLY BLOCK grey flow mutations.
 * Attribution MUST NOT mutate GreyFlow or Reconciliation data.
 */
export const GREY_DATA_MUTATION_BLOCKED = Object.freeze({
  message:
    'Attribution system MUST NOT mutate GreyFlow or Reconciliation data. ' +
    'Only read-only access is allowed.',
  blockedMethods: Object.freeze([
    'appendFlow',
    'confirmFlow',
    'voidFlow',
    'createSession',
    'modifyReconciliation',
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

  for (const forbidden of ATTRIBUTION_FORBIDDEN_CONCEPTS) {
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
): AttributionResult<void> {
  const found = findForbiddenConcepts(text);

  if (found.length > 0) {
    return attributionFailure(
      createAttributionError(
        AttributionErrorCode.INVALID_PARTY_TYPE,
        `Field '${fieldName}' contains forbidden concepts: ${found.join(', ')}`,
        { fieldName, forbiddenConcepts: found }
      )
    );
  }

  return attributionSuccess(undefined);
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
): AttributionResult<number> {
  if (!isValidInteger(value)) {
    return attributionFailure(
      createAttributionError(
        AttributionErrorCode.NON_INTEGER_VALUE,
        `Field '${fieldName}' must be an integer, got: ${value}`,
        { fieldName, value }
      )
    );
  }

  return attributionSuccess(value);
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
): AttributionResult<number> {
  if (!isValidPositiveInteger(value)) {
    if (!isValidInteger(value)) {
      return attributionFailure(
        createAttributionError(
          AttributionErrorCode.NON_INTEGER_VALUE,
          `Field '${fieldName}' must be an integer, got: ${value}`,
          { fieldName, value }
        )
      );
    }
    return attributionFailure(
      createAttributionError(
        AttributionErrorCode.INVALID_PERIOD,
        `Field '${fieldName}' must be positive, got: ${value}`,
        { fieldName, value }
      )
    );
  }

  return attributionSuccess(value);
}

/**
 * Assert value is valid basis points (0-10000).
 *
 * @param value - Value to check
 * @param fieldName - Name of the field being checked
 * @returns Result indicating success or failure
 */
export function assertValidBasisPoints(
  value: number,
  fieldName: string
): AttributionResult<number> {
  if (!isValidBasisPoints(value)) {
    if (!isValidInteger(value)) {
      return attributionFailure(
        createAttributionError(
          AttributionErrorCode.NON_INTEGER_VALUE,
          `Field '${fieldName}' must be an integer, got: ${value}`,
          { fieldName, value }
        )
      );
    }
    return attributionFailure(
      createAttributionError(
        AttributionErrorCode.INVALID_BASIS_POINTS,
        `Field '${fieldName}' must be 0-${BASIS_POINTS_100_PERCENT}, got: ${value}`,
        { fieldName, value, min: 0, max: BASIS_POINTS_100_PERCENT }
      )
    );
  }

  return attributionSuccess(value);
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
  validations: Array<() => AttributionResult<unknown>>
): AttributionResult<void> {
  for (const validate of validations) {
    const result = validate();
    if (!result.success) {
      return attributionFailure(result.error);
    }
  }

  return attributionSuccess(undefined);
}

// ============================================================================
// HIERARCHY GUARDS
// ============================================================================

/**
 * Assert no cycles in parent chain.
 * Used as additional runtime check.
 *
 * @param parentMap - Map of child -> parent
 * @param startId - ID to start checking from
 * @param maxDepth - Maximum depth to traverse
 * @returns Result indicating success or failure
 */
export function assertNoCyclesInChain(
  parentMap: ReadonlyMap<string, string | null>,
  startId: string,
  maxDepth: number
): AttributionResult<void> {
  const visited = new Set<string>();
  let currentId: string | null = startId;
  let depth = 0;

  while (currentId !== null && depth < maxDepth) {
    if (visited.has(currentId)) {
      return attributionFailure(
        createAttributionError(
          AttributionErrorCode.HIERARCHY_CYCLE_DETECTED,
          `Cycle detected in hierarchy chain at: ${currentId}`,
          { startId, cycleAt: currentId, depth }
        )
      );
    }

    visited.add(currentId);
    currentId = parentMap.get(currentId) ?? null;
    depth++;
  }

  if (depth >= maxDepth) {
    return attributionFailure(
      createAttributionError(
        AttributionErrorCode.INVALID_HIERARCHY_LEVEL,
        `Hierarchy chain exceeds maximum depth: ${maxDepth}`,
        { startId, maxDepth }
      )
    );
  }

  return attributionSuccess(undefined);
}

// ============================================================================
// CONSERVATION GUARD
// ============================================================================

/**
 * Assert that attributed amounts sum to original.
 *
 * @param originalAmount - Original amount
 * @param attributedAmounts - Array of attributed amounts
 * @param tolerance - Allowed tolerance (default 0)
 * @returns Result indicating success or failure
 */
export function assertAmountConservation(
  originalAmount: number,
  attributedAmounts: readonly number[],
  tolerance: number = 0
): AttributionResult<void> {
  let sum = 0;
  for (const amount of attributedAmounts) {
    if (!isValidInteger(amount)) {
      return attributionFailure(
        createAttributionError(
          AttributionErrorCode.NON_INTEGER_VALUE,
          `Attributed amount must be integer, got: ${amount}`,
          { amount }
        )
      );
    }
    sum += amount;
  }

  const difference = Math.abs(sum - originalAmount);
  if (difference > tolerance) {
    return attributionFailure(
      createAttributionError(
        AttributionErrorCode.AMOUNT_MISMATCH,
        `Attribution does not conserve amount: original=${originalAmount}, sum=${sum}, difference=${difference}`,
        { originalAmount, sum, difference, tolerance }
      )
    );
  }

  return attributionSuccess(undefined);
}

// ============================================================================
// RULE SET GUARDS
// ============================================================================

/**
 * Assert that basis points sum to exactly 100%.
 *
 * @param basisPointsArray - Array of basis point values
 * @returns Result indicating success or failure
 */
export function assertBasisPointsSumTo100(
  basisPointsArray: readonly number[]
): AttributionResult<void> {
  let sum = 0;
  for (const bp of basisPointsArray) {
    if (!isValidBasisPoints(bp)) {
      return attributionFailure(
        createAttributionError(
          AttributionErrorCode.INVALID_BASIS_POINTS,
          `Invalid basis points value: ${bp}`,
          { basisPoints: bp }
        )
      );
    }
    sum += bp;
  }

  if (sum !== BASIS_POINTS_100_PERCENT) {
    return attributionFailure(
      createAttributionError(
        AttributionErrorCode.INVALID_RULE_SET_TOTAL,
        `Basis points must sum to ${BASIS_POINTS_100_PERCENT}, got: ${sum}`,
        { sum, expected: BASIS_POINTS_100_PERCENT }
      )
    );
  }

  return attributionSuccess(undefined);
}

// ============================================================================
// BOUNDARY GUARD DOCUMENTATION
// ============================================================================

/**
 * Documentation of all boundary guards in the attribution system.
 */
export const ATTRIBUTION_BOUNDARY_GUARD_DOCUMENTATION = Object.freeze({
  title: 'Grey Attribution Boundary Guards',
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
      name: 'Recursive Attribution Blocked',
      description: 'Recursive attribution patterns are blocked',
      blockedPatterns: RECURSIVE_ATTRIBUTION_BLOCKED.blockedPatterns,
    },
    {
      name: 'Implicit Time Blocked',
      description: 'System clock access is blocked',
      blockedOperations: IMPLICIT_TIME_BLOCKED.blockedOperations,
    },
    {
      name: 'Forbidden Concepts',
      description: 'Payment, wallet, crypto terminology is blocked',
      blockedTerms: ATTRIBUTION_FORBIDDEN_CONCEPTS,
    },
    {
      name: 'Grey Data Mutation Blocked',
      description: 'GreyFlow and Reconciliation mutations are blocked',
      blockedMethods: GREY_DATA_MUTATION_BLOCKED.blockedMethods,
    },
  ]),

  invariants: Object.freeze([
    'Same inputs produce same outputs (deterministic)',
    'All timestamps are explicit inputs',
    'All values are integers',
    'No mutations to any state',
    'No balance tracking (attribution shares only)',
    'No engine imports',
    'No GreyFlow or Reconciliation mutations',
    'No recursive attribution',
    'Basis points sum to exactly 10000 (100%)',
    'Attributed amounts sum to original (conservation)',
    'No cycles in agent hierarchy',
  ]),
});
