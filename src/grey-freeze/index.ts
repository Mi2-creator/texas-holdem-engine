/**
 * Grey System Final Freeze & Boundary Declaration
 *
 * IMMUTABLE MODULE
 *
 * This module declares, enforces, and proves that the entire Grey system
 * is FINAL, READ-ONLY, ANALYSIS-ONLY, and MUST NOT evolve further.
 *
 * Core guarantees:
 * - READ-ONLY: No data modification
 * - ANALYSIS-ONLY: All outputs are insights, not commands
 * - DETERMINISTIC: Same inputs produce same outputs
 * - FROZEN: No future development permitted
 */

// ============================================================================
// VERSION
// ============================================================================

export {
  GREY_SYSTEM_VERSION,
  GREY_SYSTEM_FROZEN,
  GREY_VERSION_METADATA,
  isGreySystemFrozen,
  getGreySystemVersion,
  getGreyVersionMetadata,
} from './GreySystemVersion';

export type {
  GreySystemVersionType,
  GreySystemFrozenType,
  GreyVersionMetadataType,
} from './GreySystemVersion';

// ============================================================================
// DECLARATION
// ============================================================================

export {
  GREY_SYSTEM_IDENTITY,
  GREY_SYSTEM_IS,
  GREY_SYSTEM_IS_DESCRIPTIONS,
  GREY_SYSTEM_IS_NOT,
  GREY_SYSTEM_IS_NOT_DESCRIPTIONS,
  GREY_FREEZE_DECLARATION,
  isGreyCapability,
  isGreyForbidden,
  getPositiveDeclarations,
  getNegativeDeclarations,
  getSystemIdentity,
  getFreezeDeclaration,
} from './GreyFreezeDeclaration';

// ============================================================================
// BOUNDARY MANIFEST
// ============================================================================

export {
  FORBIDDEN_CONCEPTS,
  FORBIDDEN_CONCEPTS_EXTENDED,
  FORBIDDEN_IMPORTS,
  FORBIDDEN_IMPORT_PATTERNS,
  FORBIDDEN_FUNCTION_PATTERNS,
  GREY_BOUNDARY_MANIFEST,
  checkForForbiddenConcepts,
  checkForForbiddenImports,
  checkForForbiddenFunctions,
  checkForMutability,
  runComprehensiveBoundaryCheck,
  assertNoForbiddenConcepts,
  assertNoForbiddenImports,
  assertNoForbiddenFunctions,
  assertFullyFrozen,
  getBoundaryManifest,
} from './GreyBoundaryManifest';

export type {
  ForbiddenConcept,
  BoundaryCheckResult,
  BoundaryViolation,
} from './GreyBoundaryManifest';
