/**
 * GreyIntelligenceBoundaryGuards.ts
 * Phase A5 - Grey Intelligence & Risk Insight Layer
 *
 * BOUNDARY GUARDS FOR INTELLIGENCE MODULE
 *
 * This module explicitly forbids certain operations and concepts.
 * It enforces the READ-ONLY, ANALYSIS-ONLY nature of the intelligence system.
 *
 * @external This module operates OUTSIDE the frozen engine.
 * @readonly This module NEVER mutates any data.
 * @deterministic Same inputs always produce same outputs.
 */

import {
  IntelligenceResult,
  IntelligenceErrorCode,
  intelligenceSuccess,
  intelligenceFailure,
  createIntelligenceError,
  INTELLIGENCE_FORBIDDEN_CONCEPTS,
  isValidInteger,
  isValidNonNegativeInteger,
  isValidPositiveInteger,
  isValidTimestamp,
  isValidScore,
} from './GreyIntelligenceTypes';

// ============================================================================
// ENFORCEMENT GUARD
// ============================================================================

/**
 * EXPLICITLY BLOCK all enforcement actions.
 * Intelligence module is ANALYSIS-ONLY - no enforcement.
 */
export const ENFORCEMENT_BLOCKED = Object.freeze({
  message:
    'Intelligence module does NOT perform enforcement actions. ' +
    'All operations are ANALYSIS-ONLY - detection and classification only. ' +
    'Enforcement must be handled by separate systems with human approval.',
  blockedOperations: Object.freeze([
    'suspend',
    'ban',
    'restrict',
    'block',
    'penalize',
    'freeze',
    'lock',
    'disable',
    'revoke',
    'limit',
  ]),
});

// ============================================================================
// ACTION GUARD
// ============================================================================

/**
 * EXPLICITLY BLOCK automated actions.
 * Intelligence module must not take automated actions.
 */
export const AUTOMATED_ACTIONS_BLOCKED = Object.freeze({
  message:
    'Intelligence module must NOT take automated actions. ' +
    'All insights are for human review only. ' +
    'Any actions must be triggered by humans through separate systems.',
  blockedOperations: Object.freeze([
    'sendAlert',
    'triggerAction',
    'executeRule',
    'applyPolicy',
    'automate',
  ]),
});

// ============================================================================
// MUTATION GUARD
// ============================================================================

/**
 * EXPLICITLY BLOCK all mutations.
 * Intelligence module is READ-ONLY.
 */
export const MUTATION_BLOCKED = Object.freeze({
  message:
    'Intelligence module must NOT mutate any data. ' +
    'Intelligence is strictly READ-ONLY - it analyzes existing data without modification.',
  blockedOperations: Object.freeze([
    'updateScore',
    'modifyHealth',
    'changeRisk',
    'setAnomaly',
    'clearAnomaly',
    'adjustRanking',
  ]),
});

// ============================================================================
// ENGINE IMPORT GUARD
// ============================================================================

/**
 * EXPLICITLY BLOCK engine imports.
 * Intelligence must not import from frozen engine.
 */
export const ENGINE_IMPORT_BLOCKED = Object.freeze({
  message:
    'Intelligence module must NOT import from frozen engine. ' +
    'Only import from grey-* modules (grey-runtime, grey-reconciliation, grey-attribution, grey-recharge, grey-audit).',
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
    'Intelligence module must NOT use implicit time. ' +
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
// EXTERNAL COMMUNICATION GUARD
// ============================================================================

/**
 * EXPLICITLY BLOCK external communication.
 * Intelligence module must not communicate externally.
 */
export const EXTERNAL_COMMUNICATION_BLOCKED = Object.freeze({
  message:
    'Intelligence module must NOT communicate externally. ' +
    'No network calls, no notifications, no external APIs.',
  blockedOperations: Object.freeze([
    'fetch',
    'httpRequest',
    'sendNotification',
    'emit',
    'publish',
    'webhook',
  ]),
});

// ============================================================================
// STORAGE GUARD
// ============================================================================

/**
 * EXPLICITLY BLOCK direct storage access.
 * Intelligence module must not access storage directly.
 */
export const STORAGE_ACCESS_BLOCKED = Object.freeze({
  message:
    'Intelligence module must NOT access storage directly. ' +
    'Data must be provided as inputs to pure functions.',
  blockedOperations: Object.freeze([
    'readFromDb',
    'writeToDb',
    'localStorage',
    'sessionStorage',
    'indexedDB',
    'fileSystem',
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

  for (const forbidden of INTELLIGENCE_FORBIDDEN_CONCEPTS) {
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
): IntelligenceResult<void> {
  const found = findForbiddenConcepts(text);

  if (found.length > 0) {
    return intelligenceFailure(
      createIntelligenceError(
        IntelligenceErrorCode.INVALID_INPUT,
        `Field '${fieldName}' contains forbidden concepts: ${found.join(', ')}`,
        { fieldName, forbiddenConcepts: found }
      )
    );
  }

  return intelligenceSuccess(undefined);
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
): IntelligenceResult<number> {
  if (!isValidInteger(value)) {
    return intelligenceFailure(
      createIntelligenceError(
        IntelligenceErrorCode.INVALID_INPUT,
        `Field '${fieldName}' must be an integer, got: ${value}`,
        { fieldName, value }
      )
    );
  }

  return intelligenceSuccess(value);
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
): IntelligenceResult<number> {
  if (!isValidNonNegativeInteger(value)) {
    if (!isValidInteger(value)) {
      return intelligenceFailure(
        createIntelligenceError(
          IntelligenceErrorCode.INVALID_INPUT,
          `Field '${fieldName}' must be an integer, got: ${value}`,
          { fieldName, value }
        )
      );
    }
    return intelligenceFailure(
      createIntelligenceError(
        IntelligenceErrorCode.INVALID_INPUT,
        `Field '${fieldName}' must be non-negative, got: ${value}`,
        { fieldName, value }
      )
    );
  }

  return intelligenceSuccess(value);
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
): IntelligenceResult<number> {
  if (!isValidPositiveInteger(value)) {
    if (!isValidInteger(value)) {
      return intelligenceFailure(
        createIntelligenceError(
          IntelligenceErrorCode.INVALID_INPUT,
          `Field '${fieldName}' must be an integer, got: ${value}`,
          { fieldName, value }
        )
      );
    }
    return intelligenceFailure(
      createIntelligenceError(
        IntelligenceErrorCode.INVALID_TIMESTAMP,
        `Field '${fieldName}' must be positive, got: ${value}`,
        { fieldName, value }
      )
    );
  }

  return intelligenceSuccess(value);
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
): IntelligenceResult<number> {
  if (!isValidTimestamp(timestamp)) {
    return intelligenceFailure(
      createIntelligenceError(
        IntelligenceErrorCode.INVALID_TIMESTAMP,
        `Field '${fieldName}' must be a valid timestamp, got: ${timestamp}`,
        { fieldName, timestamp }
      )
    );
  }

  return intelligenceSuccess(timestamp);
}

/**
 * Assert score is valid (0-100).
 *
 * @param score - Score to check
 * @param fieldName - Name of the field being checked
 * @returns Result indicating success or failure
 */
export function assertValidScore(
  score: number,
  fieldName: string
): IntelligenceResult<number> {
  if (!isValidScore(score)) {
    return intelligenceFailure(
      createIntelligenceError(
        IntelligenceErrorCode.INVALID_SCORE,
        `Field '${fieldName}' must be a valid score (0-100), got: ${score}`,
        { fieldName, score }
      )
    );
  }

  return intelligenceSuccess(score);
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
  validations: Array<() => IntelligenceResult<unknown>>
): IntelligenceResult<void> {
  for (const validate of validations) {
    const result = validate();
    if (!result.success) {
      return intelligenceFailure(result.error);
    }
  }

  return intelligenceSuccess(undefined);
}

// ============================================================================
// READ-ONLY ASSERTION
// ============================================================================

/**
 * Assert that an operation is read-only (analysis only).
 * This is a documentation/assertion helper.
 */
export function assertAnalysisOnly(
  operationName: string
): IntelligenceResult<void> {
  // This is a documentation helper - operations that call this
  // are asserting they are analysis-only
  return intelligenceSuccess(undefined);
}

/**
 * Assert that an operation does not enforce anything.
 * This is a documentation/assertion helper.
 */
export function assertNoEnforcement(
  operationName: string
): IntelligenceResult<void> {
  // This is a documentation helper - operations that call this
  // are asserting they do not enforce anything
  return intelligenceSuccess(undefined);
}

// ============================================================================
// BOUNDARY GUARD DOCUMENTATION
// ============================================================================

/**
 * Documentation of all boundary guards in the intelligence module.
 */
export const INTELLIGENCE_BOUNDARY_GUARD_DOCUMENTATION = Object.freeze({
  title: 'Grey Intelligence & Risk Insight Layer Boundary Guards',
  version: '1.0.0',

  guards: Object.freeze([
    {
      name: 'Enforcement Blocked',
      description: 'All enforcement actions are blocked',
      blockedOperations: ENFORCEMENT_BLOCKED.blockedOperations,
    },
    {
      name: 'Automated Actions Blocked',
      description: 'Automated actions are blocked',
      blockedOperations: AUTOMATED_ACTIONS_BLOCKED.blockedOperations,
    },
    {
      name: 'Mutation Blocked',
      description: 'All mutations are blocked',
      blockedOperations: MUTATION_BLOCKED.blockedOperations,
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
      name: 'External Communication Blocked',
      description: 'External communication is blocked',
      blockedOperations: EXTERNAL_COMMUNICATION_BLOCKED.blockedOperations,
    },
    {
      name: 'Storage Access Blocked',
      description: 'Direct storage access is blocked',
      blockedOperations: STORAGE_ACCESS_BLOCKED.blockedOperations,
    },
    {
      name: 'Forbidden Concepts',
      description: 'Payment, wallet, crypto, balance terminology is blocked',
      blockedTerms: INTELLIGENCE_FORBIDDEN_CONCEPTS,
    },
  ]),

  invariants: Object.freeze([
    'Same inputs produce same outputs (deterministic)',
    'All timestamps are explicit inputs',
    'All values are integers',
    'No mutations to any data',
    'No enforcement actions',
    'No automated actions',
    'No external communication',
    'No direct storage access',
    'No engine imports',
    'Analysis and classification only',
    'All insights for human review',
    'Replay-safe (deterministic replay produces same output)',
  ]),

  purpose: Object.freeze([
    'Health scoring: Quantify entity health (0-100)',
    'Anomaly detection: Classify unusual patterns',
    'Trend analysis: Detect direction and significance',
    'Risk ranking: Order entities by risk',
    'Executive views: Aggregate for decision makers',
  ]),

  nonPurpose: Object.freeze([
    'NOT for enforcement or punishment',
    'NOT for automated actions',
    'NOT for data modification',
    'NOT for external communication',
    'NOT for direct storage access',
  ]),
});
