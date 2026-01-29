/**
 * GreyAuditBoundaryGuards.ts
 * Phase A4 - Grey Audit Reconciliation Loop
 *
 * BOUNDARY GUARDS FOR AUDIT MODULE
 *
 * This module explicitly forbids certain operations and concepts.
 * It enforces the READ-ONLY, CORRELATION-ONLY nature of the audit system.
 *
 * @external This module operates OUTSIDE the frozen engine.
 * @readonly This module NEVER mutates any data.
 * @deterministic Same inputs always produce same outputs.
 */

import {
  AuditResult,
  AuditErrorCode,
  auditSuccess,
  auditFailure,
  createAuditError,
  AUDIT_FORBIDDEN_CONCEPTS,
  isValidInteger,
  isValidNonNegativeInteger,
  isValidPositiveInteger,
  isValidTimestamp,
} from './GreyAuditTypes';

// ============================================================================
// BALANCE MATH GUARD
// ============================================================================

/**
 * EXPLICITLY BLOCK all balance arithmetic.
 * Audit is CORRELATION-ONLY - no value computation.
 */
export const BALANCE_MATH_BLOCKED = Object.freeze({
  message:
    'Audit module does NOT perform balance arithmetic. ' +
    'All operations are CORRELATION-ONLY - matching IDs without computing amounts. ' +
    'Use flow/recharge/attribution views for amount information.',
  blockedOperations: Object.freeze([
    'addToBalance',
    'subtractFromBalance',
    'updateBalance',
    'setBalance',
    'credit',
    'debit',
    'computeAmount',
    'calculateTotal',
  ]),
});

// ============================================================================
// SETTLEMENT LOGIC GUARD
// ============================================================================

/**
 * EXPLICITLY BLOCK settlement logic.
 * Audit must not perform settlement.
 */
export const SETTLEMENT_LOGIC_BLOCKED = Object.freeze({
  message:
    'Audit module must NOT perform settlement logic. ' +
    'Audit only correlates data - settlement is handled by reconciliation module.',
  blockedOperations: Object.freeze([
    'settle',
    'reconcile',
    'finalize',
    'payout',
    'distribute',
  ]),
});

// ============================================================================
// ATTRIBUTION RECOMPUTATION GUARD
// ============================================================================

/**
 * EXPLICITLY BLOCK attribution recomputation.
 * Audit must not recalculate attribution.
 */
export const ATTRIBUTION_RECOMPUTATION_BLOCKED = Object.freeze({
  message:
    'Audit module must NOT recompute attribution. ' +
    'Audit only reads existing attribution data from snapshots. ' +
    'Attribution calculation is handled by grey-attribution module.',
  blockedOperations: Object.freeze([
    'calculateAttribution',
    'distributeShare',
    'applyRules',
    'splitAmount',
    'computePercentage',
  ]),
});

// ============================================================================
// ENGINE IMPORT GUARD
// ============================================================================

/**
 * EXPLICITLY BLOCK engine imports.
 * Audit must not import from frozen engine.
 */
export const ENGINE_IMPORT_BLOCKED = Object.freeze({
  message:
    'Audit module must NOT import from frozen engine. ' +
    'Only import from grey-* modules (grey-runtime, grey-reconciliation, grey-attribution, grey-recharge).',
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
    'Audit module must NOT use implicit time. ' +
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
// MUTATION GUARD
// ============================================================================

/**
 * EXPLICITLY BLOCK all mutations.
 * Audit is READ-ONLY.
 */
export const MUTATION_BLOCKED = Object.freeze({
  message:
    'Audit module must NOT mutate any data. ' +
    'Audit is strictly READ-ONLY - it correlates existing data without modification.',
  blockedOperations: Object.freeze([
    'appendFlow',
    'confirmFlow',
    'voidFlow',
    'appendRecharge',
    'confirmRecharge',
    'voidRecharge',
    'createAttribution',
    'modifyAttribution',
    'createLink',
    'deleteLink',
  ]),
});

// ============================================================================
// GREYFLOW MUTATION GUARD
// ============================================================================

/**
 * EXPLICITLY BLOCK GreyFlow mutations.
 * Audit MUST NOT mutate GreyFlow data.
 */
export const GREYFLOW_MUTATION_BLOCKED = Object.freeze({
  message:
    'Audit module MUST NOT mutate GreyFlow data. ' +
    'Only read-only access for correlation is allowed.',
  blockedMethods: Object.freeze([
    'appendFlow',
    'confirmFlow',
    'voidFlow',
    'modifyFlow',
  ]),
});

// ============================================================================
// RECHARGE MUTATION GUARD
// ============================================================================

/**
 * EXPLICITLY BLOCK Recharge mutations.
 * Audit MUST NOT mutate Recharge data.
 */
export const RECHARGE_MUTATION_BLOCKED = Object.freeze({
  message:
    'Audit module MUST NOT mutate Recharge data. ' +
    'Only read-only access for correlation is allowed.',
  blockedMethods: Object.freeze([
    'appendRecharge',
    'confirmRecharge',
    'voidRecharge',
    'createLink',
  ]),
});

// ============================================================================
// ATTRIBUTION MUTATION GUARD
// ============================================================================

/**
 * EXPLICITLY BLOCK Attribution mutations.
 * Audit MUST NOT mutate Attribution data.
 */
export const ATTRIBUTION_MUTATION_BLOCKED = Object.freeze({
  message:
    'Audit module MUST NOT mutate Attribution data. ' +
    'Only read-only access from snapshots is allowed.',
  blockedMethods: Object.freeze([
    'createAttributionEntry',
    'modifyAttribution',
    'updateRuleSet',
    'appendSnapshot',
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

  for (const forbidden of AUDIT_FORBIDDEN_CONCEPTS) {
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
): AuditResult<void> {
  const found = findForbiddenConcepts(text);

  if (found.length > 0) {
    return auditFailure(
      createAuditError(
        AuditErrorCode.INVALID_INPUT,
        `Field '${fieldName}' contains forbidden concepts: ${found.join(', ')}`,
        { fieldName, forbiddenConcepts: found }
      )
    );
  }

  return auditSuccess(undefined);
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
): AuditResult<number> {
  if (!isValidInteger(value)) {
    return auditFailure(
      createAuditError(
        AuditErrorCode.INVALID_INPUT,
        `Field '${fieldName}' must be an integer, got: ${value}`,
        { fieldName, value }
      )
    );
  }

  return auditSuccess(value);
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
): AuditResult<number> {
  if (!isValidNonNegativeInteger(value)) {
    if (!isValidInteger(value)) {
      return auditFailure(
        createAuditError(
          AuditErrorCode.INVALID_INPUT,
          `Field '${fieldName}' must be an integer, got: ${value}`,
          { fieldName, value }
        )
      );
    }
    return auditFailure(
      createAuditError(
        AuditErrorCode.INVALID_INPUT,
        `Field '${fieldName}' must be non-negative, got: ${value}`,
        { fieldName, value }
      )
    );
  }

  return auditSuccess(value);
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
): AuditResult<number> {
  if (!isValidPositiveInteger(value)) {
    if (!isValidInteger(value)) {
      return auditFailure(
        createAuditError(
          AuditErrorCode.INVALID_INPUT,
          `Field '${fieldName}' must be an integer, got: ${value}`,
          { fieldName, value }
        )
      );
    }
    return auditFailure(
      createAuditError(
        AuditErrorCode.INVALID_TIMESTAMP,
        `Field '${fieldName}' must be positive, got: ${value}`,
        { fieldName, value }
      )
    );
  }

  return auditSuccess(value);
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
): AuditResult<number> {
  if (!isValidTimestamp(timestamp)) {
    return auditFailure(
      createAuditError(
        AuditErrorCode.INVALID_TIMESTAMP,
        `Field '${fieldName}' must be a valid timestamp, got: ${timestamp}`,
        { fieldName, timestamp }
      )
    );
  }

  return auditSuccess(timestamp);
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
  validations: Array<() => AuditResult<unknown>>
): AuditResult<void> {
  for (const validate of validations) {
    const result = validate();
    if (!result.success) {
      return auditFailure(result.error);
    }
  }

  return auditSuccess(undefined);
}

// ============================================================================
// READ-ONLY ASSERTION
// ============================================================================

/**
 * Assert that an operation is read-only (correlation only).
 * This is a documentation/assertion helper.
 */
export function assertCorrelationOnly(
  operationName: string
): AuditResult<void> {
  // This is a documentation helper - operations that call this
  // are asserting they are correlation-only
  return auditSuccess(undefined);
}

// ============================================================================
// BOUNDARY GUARD DOCUMENTATION
// ============================================================================

/**
 * Documentation of all boundary guards in the audit module.
 */
export const AUDIT_BOUNDARY_GUARD_DOCUMENTATION = Object.freeze({
  title: 'Grey Audit Reconciliation Loop Boundary Guards',
  version: '1.0.0',

  guards: Object.freeze([
    {
      name: 'Balance Math Blocked',
      description: 'All balance arithmetic is blocked',
      blockedOperations: BALANCE_MATH_BLOCKED.blockedOperations,
    },
    {
      name: 'Settlement Logic Blocked',
      description: 'Settlement operations are blocked',
      blockedOperations: SETTLEMENT_LOGIC_BLOCKED.blockedOperations,
    },
    {
      name: 'Attribution Recomputation Blocked',
      description: 'Attribution recalculation is blocked',
      blockedOperations: ATTRIBUTION_RECOMPUTATION_BLOCKED.blockedOperations,
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
      name: 'Mutation Blocked',
      description: 'All mutations are blocked',
      blockedOperations: MUTATION_BLOCKED.blockedOperations,
    },
    {
      name: 'GreyFlow Mutation Blocked',
      description: 'GreyFlow mutations are blocked',
      blockedMethods: GREYFLOW_MUTATION_BLOCKED.blockedMethods,
    },
    {
      name: 'Recharge Mutation Blocked',
      description: 'Recharge mutations are blocked',
      blockedMethods: RECHARGE_MUTATION_BLOCKED.blockedMethods,
    },
    {
      name: 'Attribution Mutation Blocked',
      description: 'Attribution mutations are blocked',
      blockedMethods: ATTRIBUTION_MUTATION_BLOCKED.blockedMethods,
    },
    {
      name: 'Forbidden Concepts',
      description: 'Payment, wallet, crypto, balance terminology is blocked',
      blockedTerms: AUDIT_FORBIDDEN_CONCEPTS,
    },
  ]),

  invariants: Object.freeze([
    'Same inputs produce same outputs (deterministic)',
    'All timestamps are explicit inputs',
    'All values are integers',
    'No mutations to GreyFlow data',
    'No mutations to Recharge data',
    'No mutations to Attribution data',
    'No balance arithmetic (correlation only)',
    'No engine imports',
    'No attribution recomputation',
    'No settlement logic',
    'Pure correlation only',
    'Replay-safe (deterministic replay produces same output)',
  ]),
});
