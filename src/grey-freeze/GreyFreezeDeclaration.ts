/**
 * GreyFreezeDeclaration.ts
 *
 * Central Declaration of Grey System Boundaries
 *
 * This file formally declares what the Grey system IS and IS NOT.
 * These declarations are immutable and serve as the authoritative
 * reference for the system's operational boundaries.
 *
 * IMMUTABLE: These declarations cannot be changed.
 */

import { GREY_SYSTEM_VERSION, GREY_SYSTEM_FROZEN } from './GreySystemVersion';

// ============================================================================
// SYSTEM IDENTITY DECLARATION
// ============================================================================

/**
 * Grey System Identity
 *
 * Formal declaration of the system's nature and purpose.
 */
export const GREY_SYSTEM_IDENTITY = Object.freeze({
  name: 'Grey Analysis System',
  version: GREY_SYSTEM_VERSION,
  frozen: GREY_SYSTEM_FROZEN,
  purpose: 'Read-only analysis of attribution, hierarchy, and rake structures',
  nature: 'ANALYTICAL',
}) as {
  readonly name: string;
  readonly version: string;
  readonly frozen: true;
  readonly purpose: string;
  readonly nature: 'ANALYTICAL';
};

// ============================================================================
// WHAT THE GREY SYSTEM IS
// ============================================================================

/**
 * Positive Declarations - What the Grey System IS
 *
 * These are the only capabilities the Grey system provides.
 */
export const GREY_SYSTEM_IS = Object.freeze({
  READ_ONLY: true,
  ANALYSIS_ONLY: true,
  NON_EXECUTING: true,
  NON_SETTLING: true,
  DETERMINISTIC: true,
  INTEGER_ARITHMETIC: true,
  PURE_FUNCTIONS: true,
  SNAPSHOT_BASED: true,
  AUDIT_TRAIL_ONLY: true,
  SIMULATION_SANDBOXED: true,
} as const) as {
  readonly READ_ONLY: true;
  readonly ANALYSIS_ONLY: true;
  readonly NON_EXECUTING: true;
  readonly NON_SETTLING: true;
  readonly DETERMINISTIC: true;
  readonly INTEGER_ARITHMETIC: true;
  readonly PURE_FUNCTIONS: true;
  readonly SNAPSHOT_BASED: true;
  readonly AUDIT_TRAIL_ONLY: true;
  readonly SIMULATION_SANDBOXED: true;
};

/**
 * Human-readable descriptions of what the Grey system IS.
 */
export const GREY_SYSTEM_IS_DESCRIPTIONS = Object.freeze({
  READ_ONLY: 'All operations read existing data without modification',
  ANALYSIS_ONLY: 'All outputs are analytical insights, not actionable commands',
  NON_EXECUTING: 'The system does not execute any financial operations',
  NON_SETTLING: 'The system does not settle any transactions',
  DETERMINISTIC: 'Same inputs always produce identical outputs',
  INTEGER_ARITHMETIC: 'All calculations use integer-only math (basis points)',
  PURE_FUNCTIONS: 'All functions have no side effects',
  SNAPSHOT_BASED: 'All analysis operates on immutable snapshots',
  AUDIT_TRAIL_ONLY: 'Audit entries are read-only records, not actionable items',
  SIMULATION_SANDBOXED: 'All simulations run in isolated sandbox with no real effects',
} as const) as {
  readonly [K in keyof typeof GREY_SYSTEM_IS]: string;
};

// ============================================================================
// WHAT THE GREY SYSTEM IS NOT
// ============================================================================

/**
 * Negative Declarations - What the Grey System IS NOT
 *
 * These capabilities are explicitly FORBIDDEN in the Grey system.
 * Any attempt to add these capabilities violates the system boundaries.
 */
export const GREY_SYSTEM_IS_NOT = Object.freeze({
  HAS_BALANCES: false,
  HAS_CREDITS: false,
  HAS_DEBITS: false,
  HAS_PAYMENTS: false,
  HAS_WALLETS: false,
  HAS_CRYPTO: false,
  HAS_TRANSFERS: false,
  HAS_AUTOMATIC_ACTIONS: false,
  HAS_ENFORCEMENT: false,
  HAS_MUTATION: false,
  HAS_PERSISTENCE: false,
  HAS_EXTERNAL_IO: false,
  HAS_ASYNC_OPERATIONS: false,
  HAS_RUNTIME_HOOKS: false,
  HAS_CLOCK_DEPENDENCY: false,
  HAS_ENGINE_IMPORTS: false,
  HAS_EVOLUTION_PATH: false,
} as const) as {
  readonly HAS_BALANCES: false;
  readonly HAS_CREDITS: false;
  readonly HAS_DEBITS: false;
  readonly HAS_PAYMENTS: false;
  readonly HAS_WALLETS: false;
  readonly HAS_CRYPTO: false;
  readonly HAS_TRANSFERS: false;
  readonly HAS_AUTOMATIC_ACTIONS: false;
  readonly HAS_ENFORCEMENT: false;
  readonly HAS_MUTATION: false;
  readonly HAS_PERSISTENCE: false;
  readonly HAS_EXTERNAL_IO: false;
  readonly HAS_ASYNC_OPERATIONS: false;
  readonly HAS_RUNTIME_HOOKS: false;
  readonly HAS_CLOCK_DEPENDENCY: false;
  readonly HAS_ENGINE_IMPORTS: false;
  readonly HAS_EVOLUTION_PATH: false;
};

/**
 * Human-readable descriptions of what the Grey system IS NOT.
 */
export const GREY_SYSTEM_IS_NOT_DESCRIPTIONS = Object.freeze({
  HAS_BALANCES: 'No balance tracking or management',
  HAS_CREDITS: 'No credit operations or accounting',
  HAS_DEBITS: 'No debit operations or accounting',
  HAS_PAYMENTS: 'No payment processing or initiation',
  HAS_WALLETS: 'No wallet management or access',
  HAS_CRYPTO: 'No cryptocurrency operations',
  HAS_TRANSFERS: 'No fund transfers or movement',
  HAS_AUTOMATIC_ACTIONS: 'No auto-adjustments or auto-blocks',
  HAS_ENFORCEMENT: 'No rule enforcement or penalties',
  HAS_MUTATION: 'No data modification whatsoever',
  HAS_PERSISTENCE: 'No data storage or saving',
  HAS_EXTERNAL_IO: 'No external API calls or network requests',
  HAS_ASYNC_OPERATIONS: 'No asynchronous operations',
  HAS_RUNTIME_HOOKS: 'No runtime event hooks or callbacks',
  HAS_CLOCK_DEPENDENCY: 'No dependency on system clock for logic',
  HAS_ENGINE_IMPORTS: 'No imports from game engine internals',
  HAS_EVOLUTION_PATH: 'No planned or permitted future development',
} as const) as {
  readonly [K in keyof typeof GREY_SYSTEM_IS_NOT]: string;
};

// ============================================================================
// DECLARATION VERIFICATION
// ============================================================================

/**
 * Verify a capability is declared as present.
 *
 * @param capability - The capability to check
 * @returns true if the capability is declared as present
 */
export function isGreyCapability(
  capability: keyof typeof GREY_SYSTEM_IS
): true {
  return GREY_SYSTEM_IS[capability];
}

/**
 * Verify a forbidden feature is declared as absent.
 *
 * @param feature - The feature to check
 * @returns false (the feature is not present)
 */
export function isGreyForbidden(
  feature: keyof typeof GREY_SYSTEM_IS_NOT
): false {
  return GREY_SYSTEM_IS_NOT[feature];
}

/**
 * Get all positive declarations.
 *
 * @returns Frozen object of all positive declarations
 */
export function getPositiveDeclarations(): typeof GREY_SYSTEM_IS {
  return GREY_SYSTEM_IS;
}

/**
 * Get all negative declarations.
 *
 * @returns Frozen object of all negative declarations
 */
export function getNegativeDeclarations(): typeof GREY_SYSTEM_IS_NOT {
  return GREY_SYSTEM_IS_NOT;
}

/**
 * Get the complete system identity.
 *
 * @returns Frozen system identity object
 */
export function getSystemIdentity(): typeof GREY_SYSTEM_IDENTITY {
  return GREY_SYSTEM_IDENTITY;
}

// ============================================================================
// DECLARATION SUMMARY
// ============================================================================

/**
 * Complete freeze declaration summary.
 *
 * This is the authoritative, immutable declaration of the Grey system's
 * boundaries and constraints.
 */
export const GREY_FREEZE_DECLARATION = Object.freeze({
  identity: GREY_SYSTEM_IDENTITY,
  is: GREY_SYSTEM_IS,
  isDescriptions: GREY_SYSTEM_IS_DESCRIPTIONS,
  isNot: GREY_SYSTEM_IS_NOT,
  isNotDescriptions: GREY_SYSTEM_IS_NOT_DESCRIPTIONS,
  declaredAt: '2025-01-29T00:00:00.000Z',
  declarationFinal: true,
}) as {
  readonly identity: typeof GREY_SYSTEM_IDENTITY;
  readonly is: typeof GREY_SYSTEM_IS;
  readonly isDescriptions: typeof GREY_SYSTEM_IS_DESCRIPTIONS;
  readonly isNot: typeof GREY_SYSTEM_IS_NOT;
  readonly isNotDescriptions: typeof GREY_SYSTEM_IS_NOT_DESCRIPTIONS;
  readonly declaredAt: string;
  readonly declarationFinal: true;
};

/**
 * Get the complete freeze declaration.
 *
 * @returns The complete, frozen declaration
 */
export function getFreezeDeclaration(): typeof GREY_FREEZE_DECLARATION {
  return GREY_FREEZE_DECLARATION;
}
