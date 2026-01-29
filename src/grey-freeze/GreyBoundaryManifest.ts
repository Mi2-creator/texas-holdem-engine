/**
 * GreyBoundaryManifest.ts
 *
 * Explicit Forbidden Concept List and Boundary Enforcement Helpers
 *
 * This file provides the authoritative list of forbidden concepts
 * in the Grey system, along with helpers for test-level enforcement.
 *
 * IMMUTABLE: This manifest cannot be changed.
 */

// ============================================================================
// FORBIDDEN CONCEPTS
// ============================================================================

/**
 * Forbidden Concepts in the Grey System
 *
 * These string literals represent concepts that MUST NOT appear
 * in any Grey module's public interface, implementation, or output.
 *
 * The presence of any of these concepts indicates a boundary violation.
 */
const FORBIDDEN_CONCEPTS_TUPLE = [
  'payment',
  'wallet',
  'crypto',
  'balance',
  'credit',
  'debit',
  'settlement',
  'transfer',
  'execute',
  'enforce',
  'auto-adjust',
  'auto-block',
] as const;

export type ForbiddenConcept = (typeof FORBIDDEN_CONCEPTS_TUPLE)[number];

export const FORBIDDEN_CONCEPTS: readonly ForbiddenConcept[] = Object.freeze([...FORBIDDEN_CONCEPTS_TUPLE]);

/**
 * Extended forbidden concepts for comprehensive checking.
 *
 * These include variations and related terms.
 */
export const FORBIDDEN_CONCEPTS_EXTENDED = Object.freeze([
  // Core forbidden
  'payment',
  'wallet',
  'crypto',
  'balance',
  'credit',
  'debit',
  'settlement',
  'transfer',
  'execute',
  'enforce',
  'auto-adjust',
  'auto-block',
  // Related terms
  'pay',
  'withdraw',
  'deposit',
  'fund',
  'money',
  'currency',
  'coin',
  'token',
  'blockchain',
  'ledger-write',
  'persist',
  'save',
  'store',
  'mutate',
  'modify',
  'update',
  'delete',
  'create-record',
  'send-funds',
  'receive-funds',
  'transaction-execute',
  'auto-deduct',
  'auto-charge',
  'auto-pay',
  'auto-transfer',
  'force-action',
  'mandatory-action',
] as const) as readonly string[];

// ============================================================================
// FORBIDDEN IMPORT SOURCES
// ============================================================================

/**
 * Forbidden Import Sources
 *
 * Grey modules MUST NOT import from these sources.
 */
export const FORBIDDEN_IMPORTS = Object.freeze([
  // Engine internals
  'engine/core',
  'engine/internals',
  'engine/mutations',
  'engine/state',
  // Financial services
  'payment-service',
  'wallet-service',
  'settlement-service',
  'transfer-service',
  'crypto-service',
  // Database writes
  'database/write',
  'database/mutations',
  'persistence/write',
  // External IO
  'http-client',
  'api-client',
  'websocket',
  'fetch',
] as const) as readonly string[];

/**
 * Forbidden Import Patterns (regex)
 *
 * Patterns that indicate forbidden imports.
 */
export const FORBIDDEN_IMPORT_PATTERNS = Object.freeze([
  /from\s+['"].*engine\/(?!types).*['"]/,
  /from\s+['"].*payment.*['"]/,
  /from\s+['"].*wallet.*['"]/,
  /from\s+['"].*settlement.*['"]/,
  /from\s+['"].*transfer.*['"]/,
  /from\s+['"].*crypto(?!-js).*['"]/,
  /from\s+['"].*database\/write.*['"]/,
  /from\s+['"].*persistence\/write.*['"]/,
  /import\s+.*\bfetch\b/,
  /import\s+.*\baxios\b/,
  /import\s+.*\bWebSocket\b/,
] as const) as readonly RegExp[];

// ============================================================================
// FORBIDDEN FUNCTION PATTERNS
// ============================================================================

/**
 * Forbidden Function Name Patterns
 *
 * Function names that indicate mutation or execution.
 */
export const FORBIDDEN_FUNCTION_PATTERNS = Object.freeze([
  /^execute[A-Z]/,
  /^perform[A-Z]/,
  /^process[A-Z]/,
  /^save[A-Z]/,
  /^store[A-Z]/,
  /^persist[A-Z]/,
  /^write[A-Z]/,
  /^update[A-Z]/,
  /^delete[A-Z]/,
  /^remove[A-Z]/,
  /^create[A-Z].*Record/,
  /^transfer[A-Z]/,
  /^send[A-Z]/,
  /^pay[A-Z]/,
  /^charge[A-Z]/,
  /^deduct[A-Z]/,
  /^enforce[A-Z]/,
  /^autoAdjust/,
  /^autoBlock/,
] as const) as readonly RegExp[];

// ============================================================================
// BOUNDARY CHECK RESULTS
// ============================================================================

/**
 * Result of a boundary check operation.
 */
export interface BoundaryCheckResult {
  readonly passed: boolean;
  readonly violations: readonly BoundaryViolation[];
}

/**
 * A single boundary violation.
 */
export interface BoundaryViolation {
  readonly type: 'FORBIDDEN_CONCEPT' | 'FORBIDDEN_IMPORT' | 'FORBIDDEN_FUNCTION' | 'MUTATION_DETECTED';
  readonly location: string;
  readonly detail: string;
}

// ============================================================================
// BOUNDARY CHECK HELPERS
// ============================================================================

/**
 * Check if text contains any forbidden concepts.
 *
 * @param text - The text to check
 * @param useExtended - Whether to use extended concept list
 * @returns BoundaryCheckResult indicating pass/fail and violations
 */
export function checkForForbiddenConcepts(
  text: string,
  useExtended: boolean = false
): BoundaryCheckResult {
  const concepts = useExtended ? FORBIDDEN_CONCEPTS_EXTENDED : FORBIDDEN_CONCEPTS;
  const violations: BoundaryViolation[] = [];
  const textLower = text.toLowerCase();

  for (const concept of concepts) {
    if (textLower.includes(concept.toLowerCase())) {
      violations.push({
        type: 'FORBIDDEN_CONCEPT',
        location: findConceptLocation(text, concept),
        detail: `Forbidden concept "${concept}" found`,
      });
    }
  }

  return {
    passed: violations.length === 0,
    violations,
  };
}

/**
 * Check if code contains forbidden imports.
 *
 * @param code - The source code to check
 * @returns BoundaryCheckResult indicating pass/fail and violations
 */
export function checkForForbiddenImports(code: string): BoundaryCheckResult {
  const violations: BoundaryViolation[] = [];

  // Check literal imports
  for (const forbidden of FORBIDDEN_IMPORTS) {
    if (code.includes(forbidden)) {
      violations.push({
        type: 'FORBIDDEN_IMPORT',
        location: findImportLocation(code, forbidden),
        detail: `Forbidden import "${forbidden}" found`,
      });
    }
  }

  // Check import patterns
  for (const pattern of FORBIDDEN_IMPORT_PATTERNS) {
    const match = code.match(pattern);
    if (match) {
      violations.push({
        type: 'FORBIDDEN_IMPORT',
        location: match[0],
        detail: `Forbidden import pattern matched: ${pattern.source}`,
      });
    }
  }

  return {
    passed: violations.length === 0,
    violations,
  };
}

/**
 * Check if code contains forbidden function patterns.
 *
 * @param functionNames - Array of function names to check
 * @returns BoundaryCheckResult indicating pass/fail and violations
 */
export function checkForForbiddenFunctions(
  functionNames: readonly string[]
): BoundaryCheckResult {
  const violations: BoundaryViolation[] = [];

  for (const name of functionNames) {
    for (const pattern of FORBIDDEN_FUNCTION_PATTERNS) {
      if (pattern.test(name)) {
        violations.push({
          type: 'FORBIDDEN_FUNCTION',
          location: name,
          detail: `Forbidden function pattern "${pattern.source}" matched by "${name}"`,
        });
      }
    }
  }

  return {
    passed: violations.length === 0,
    violations,
  };
}

/**
 * Check if an object appears to be mutable.
 *
 * @param obj - The object to check
 * @param path - Current path for error reporting
 * @returns BoundaryCheckResult indicating pass/fail and violations
 */
export function checkForMutability(
  obj: unknown,
  path: string = 'root'
): BoundaryCheckResult {
  const violations: BoundaryViolation[] = [];

  function check(value: unknown, currentPath: string): void {
    if (value === null || value === undefined) {
      return;
    }

    if (typeof value === 'object') {
      if (!Object.isFrozen(value)) {
        violations.push({
          type: 'MUTATION_DETECTED',
          location: currentPath,
          detail: `Object at "${currentPath}" is not frozen`,
        });
      }

      if (Array.isArray(value)) {
        value.forEach((item, index) => {
          check(item, `${currentPath}[${index}]`);
        });
      } else {
        for (const [key, val] of Object.entries(value)) {
          check(val, `${currentPath}.${key}`);
        }
      }
    }
  }

  check(obj, path);

  return {
    passed: violations.length === 0,
    violations,
  };
}

/**
 * Run comprehensive boundary check on code.
 *
 * @param code - Source code to check
 * @param functionNames - Exported function names
 * @returns Combined BoundaryCheckResult
 */
export function runComprehensiveBoundaryCheck(
  code: string,
  functionNames: readonly string[]
): BoundaryCheckResult {
  const conceptCheck = checkForForbiddenConcepts(code, true);
  const importCheck = checkForForbiddenImports(code);
  const functionCheck = checkForForbiddenFunctions(functionNames);

  const allViolations = [
    ...conceptCheck.violations,
    ...importCheck.violations,
    ...functionCheck.violations,
  ];

  return {
    passed: allViolations.length === 0,
    violations: allViolations,
  };
}

// ============================================================================
// ASSERTION HELPERS (for tests)
// ============================================================================

/**
 * Assert that text contains no forbidden concepts.
 *
 * @param text - The text to check
 * @param label - Label for error messages
 * @throws Error if forbidden concepts are found
 */
export function assertNoForbiddenConcepts(text: string, label: string = 'text'): void {
  const result = checkForForbiddenConcepts(text, true);
  if (!result.passed) {
    const details = result.violations.map(v => v.detail).join(', ');
    throw new Error(`Forbidden concepts in ${label}: ${details}`);
  }
}

/**
 * Assert that code contains no forbidden imports.
 *
 * @param code - The code to check
 * @param label - Label for error messages
 * @throws Error if forbidden imports are found
 */
export function assertNoForbiddenImports(code: string, label: string = 'code'): void {
  const result = checkForForbiddenImports(code);
  if (!result.passed) {
    const details = result.violations.map(v => v.detail).join(', ');
    throw new Error(`Forbidden imports in ${label}: ${details}`);
  }
}

/**
 * Assert that functions have no forbidden patterns.
 *
 * @param functionNames - Function names to check
 * @param label - Label for error messages
 * @throws Error if forbidden function patterns are found
 */
export function assertNoForbiddenFunctions(
  functionNames: readonly string[],
  label: string = 'module'
): void {
  const result = checkForForbiddenFunctions(functionNames);
  if (!result.passed) {
    const details = result.violations.map(v => v.detail).join(', ');
    throw new Error(`Forbidden functions in ${label}: ${details}`);
  }
}

/**
 * Assert that an object is fully frozen.
 *
 * @param obj - The object to check
 * @param label - Label for error messages
 * @throws Error if object is not fully frozen
 */
export function assertFullyFrozen(obj: unknown, label: string = 'object'): void {
  const result = checkForMutability(obj);
  if (!result.passed) {
    const details = result.violations.map(v => v.detail).join(', ');
    throw new Error(`Mutable object detected in ${label}: ${details}`);
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function findConceptLocation(text: string, concept: string): string {
  const index = text.toLowerCase().indexOf(concept.toLowerCase());
  if (index === -1) return concept;

  const start = Math.max(0, index - 20);
  const end = Math.min(text.length, index + concept.length + 20);
  return `...${text.slice(start, end)}...`;
}

function findImportLocation(code: string, importStr: string): string {
  const lines = code.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(importStr)) {
      return `Line ${i + 1}: ${lines[i].trim()}`;
    }
  }
  return importStr;
}

// ============================================================================
// MANIFEST SUMMARY
// ============================================================================

/**
 * Complete boundary manifest.
 *
 * Authoritative reference for all Grey system boundaries.
 */
export const GREY_BOUNDARY_MANIFEST = Object.freeze({
  forbiddenConcepts: FORBIDDEN_CONCEPTS,
  forbiddenConceptsExtended: FORBIDDEN_CONCEPTS_EXTENDED,
  forbiddenImports: FORBIDDEN_IMPORTS,
  forbiddenImportPatterns: FORBIDDEN_IMPORT_PATTERNS.map(p => p.source),
  forbiddenFunctionPatterns: FORBIDDEN_FUNCTION_PATTERNS.map(p => p.source),
  manifestVersion: '1.0.0',
  manifestFinal: true,
}) as {
  readonly forbiddenConcepts: typeof FORBIDDEN_CONCEPTS;
  readonly forbiddenConceptsExtended: typeof FORBIDDEN_CONCEPTS_EXTENDED;
  readonly forbiddenImports: typeof FORBIDDEN_IMPORTS;
  readonly forbiddenImportPatterns: readonly string[];
  readonly forbiddenFunctionPatterns: readonly string[];
  readonly manifestVersion: string;
  readonly manifestFinal: true;
};

/**
 * Get the complete boundary manifest.
 *
 * @returns The frozen boundary manifest
 */
export function getBoundaryManifest(): typeof GREY_BOUNDARY_MANIFEST {
  return GREY_BOUNDARY_MANIFEST;
}
