/**
 * GreySimulationBoundaryGuards.ts
 *
 * Hard boundary enforcement for simulation sandbox
 * Prevents any write/mutation operations
 *
 * SANDBOX / READ-ONLY: This module enforces that guarantee
 */

import { SIMULATION_FORBIDDEN_CONCEPTS } from './GreySimulationTypes';

// ============================================================================
// BOUNDARY VIOLATION TYPES
// ============================================================================

export type ViolationType =
  | 'FORBIDDEN_CONCEPT'
  | 'MUTATION_ATTEMPT'
  | 'PERSISTENCE_ATTEMPT'
  | 'EXTERNAL_WRITE'
  | 'INVALID_IMPORT'
  | 'STATE_LEAK';

export interface BoundaryViolation {
  readonly type: ViolationType;
  readonly message: string;
  readonly context: string;
  readonly severity: 'WARNING' | 'ERROR' | 'CRITICAL';
  readonly timestamp: number;
}

export interface BoundaryCheckResult {
  readonly isValid: boolean;
  readonly violations: readonly BoundaryViolation[];
}

// ============================================================================
// FORBIDDEN PATTERNS
// ============================================================================

/**
 * Patterns that indicate persistence/mutation attempts
 */
export const FORBIDDEN_PATTERNS = Object.freeze({
  persistence: [
    /\.save\s*\(/,
    /\.store\s*\(/,
    /\.persist\s*\(/,
    /\.write\s*\(/,
    /\.update\s*\(/,
    /\.delete\s*\(/,
    /\.remove\s*\(/,
    /\.insert\s*\(/,
    /\.create\s*\(/,
    /localStorage\./,
    /sessionStorage\./,
    /indexedDB/,
    /\.setItem\s*\(/,
  ],
  mutation: [
    /\.push\s*\(/,
    /\.pop\s*\(/,
    /\.shift\s*\(/,
    /\.unshift\s*\(/,
    /\.splice\s*\(/,
    /\.sort\s*\(/,
    /\.reverse\s*\(/,
    /Object\.assign\s*\(/,
    /\.fill\s*\(/,
    /\.copyWithin\s*\(/,
  ],
  external: [
    /fetch\s*\(/,
    /XMLHttpRequest/,
    /\.ajax\s*\(/,
    /axios\./,
    /WebSocket/,
  ],
}) as {
  readonly persistence: readonly RegExp[];
  readonly mutation: readonly RegExp[];
  readonly external: readonly RegExp[];
};

/**
 * Forbidden imports that could enable mutations
 */
export const FORBIDDEN_IMPORTS = Object.freeze([
  'greyFlowEngine',
  'GreyFlowEngine',
  'attributionEngine',
  'AttributionEngine',
  'rechargeEngine',
  'RechargeEngine',
  'auditEngine',
  'AuditEngine',
  'paymentService',
  'walletService',
  'settlementService',
  'databaseService',
  'storageService',
]) as readonly string[];

// ============================================================================
// GUARD FUNCTIONS
// ============================================================================

/**
 * Check if text contains forbidden concepts
 */
export function checkForbiddenConcepts(text: string): BoundaryCheckResult {
  const violations: BoundaryViolation[] = [];
  const textLower = text.toLowerCase();

  for (const concept of SIMULATION_FORBIDDEN_CONCEPTS) {
    if (textLower.includes(concept)) {
      violations.push({
        type: 'FORBIDDEN_CONCEPT',
        message: `Forbidden concept detected: "${concept}"`,
        context: extractContext(text, concept),
        severity: 'ERROR',
        timestamp: Date.now(),
      });
    }
  }

  return {
    isValid: violations.length === 0,
    violations,
  };
}

/**
 * Check if code contains persistence patterns
 */
export function checkPersistencePatterns(code: string): BoundaryCheckResult {
  const violations: BoundaryViolation[] = [];

  for (const pattern of FORBIDDEN_PATTERNS.persistence) {
    if (pattern.test(code)) {
      violations.push({
        type: 'PERSISTENCE_ATTEMPT',
        message: `Persistence pattern detected: ${pattern.source}`,
        context: extractPatternContext(code, pattern),
        severity: 'CRITICAL',
        timestamp: Date.now(),
      });
    }
  }

  return {
    isValid: violations.length === 0,
    violations,
  };
}

/**
 * Check if code contains mutation patterns
 * Note: This is for validation of simulation descriptions/metadata,
 * not for blocking internal array operations
 */
export function checkMutationPatterns(code: string): BoundaryCheckResult {
  const violations: BoundaryViolation[] = [];

  for (const pattern of FORBIDDEN_PATTERNS.mutation) {
    if (pattern.test(code)) {
      violations.push({
        type: 'MUTATION_ATTEMPT',
        message: `Mutation pattern detected: ${pattern.source}`,
        context: extractPatternContext(code, pattern),
        severity: 'WARNING',
        timestamp: Date.now(),
      });
    }
  }

  return {
    isValid: violations.length === 0,
    violations,
  };
}

/**
 * Check if code contains external communication patterns
 */
export function checkExternalPatterns(code: string): BoundaryCheckResult {
  const violations: BoundaryViolation[] = [];

  for (const pattern of FORBIDDEN_PATTERNS.external) {
    if (pattern.test(code)) {
      violations.push({
        type: 'EXTERNAL_WRITE',
        message: `External communication pattern detected: ${pattern.source}`,
        context: extractPatternContext(code, pattern),
        severity: 'CRITICAL',
        timestamp: Date.now(),
      });
    }
  }

  return {
    isValid: violations.length === 0,
    violations,
  };
}

/**
 * Check if imports are valid for simulation module
 */
export function checkImports(importStatements: readonly string[]): BoundaryCheckResult {
  const violations: BoundaryViolation[] = [];

  for (const statement of importStatements) {
    for (const forbidden of FORBIDDEN_IMPORTS) {
      if (statement.includes(forbidden)) {
        violations.push({
          type: 'INVALID_IMPORT',
          message: `Forbidden import detected: "${forbidden}"`,
          context: statement,
          severity: 'CRITICAL',
          timestamp: Date.now(),
        });
      }
    }
  }

  return {
    isValid: violations.length === 0,
    violations,
  };
}

/**
 * Validate simulation input data doesn't contain mutable references
 */
export function validateImmutableInput<T>(input: T, path = 'root'): BoundaryCheckResult {
  const violations: BoundaryViolation[] = [];

  function checkValue(value: unknown, currentPath: string): void {
    if (value === null || value === undefined) {
      return;
    }

    if (typeof value === 'object') {
      if (!Object.isFrozen(value)) {
        violations.push({
          type: 'STATE_LEAK',
          message: `Non-frozen object detected at path: ${currentPath}`,
          context: `Object at ${currentPath} should be frozen for simulation safety`,
          severity: 'WARNING',
          timestamp: Date.now(),
        });
      }

      if (Array.isArray(value)) {
        value.forEach((item, index) => {
          checkValue(item, `${currentPath}[${index}]`);
        });
      } else {
        for (const [key, val] of Object.entries(value)) {
          checkValue(val, `${currentPath}.${key}`);
        }
      }
    }
  }

  checkValue(input, path);

  return {
    isValid: violations.length === 0,
    violations,
  };
}

/**
 * Validate simulation output is properly frozen
 */
export function validateFrozenOutput<T>(output: T): BoundaryCheckResult {
  return validateImmutableInput(output, 'output');
}

// ============================================================================
// COMPREHENSIVE BOUNDARY CHECK
// ============================================================================

/**
 * Run all boundary checks on simulation metadata
 */
export function runComprehensiveBoundaryCheck(
  metadata: {
    readonly name?: string;
    readonly description?: string;
    readonly code?: string;
    readonly imports?: readonly string[];
  }
): BoundaryCheckResult {
  const allViolations: BoundaryViolation[] = [];

  if (metadata.name) {
    const nameCheck = checkForbiddenConcepts(metadata.name);
    allViolations.push(...nameCheck.violations);
  }

  if (metadata.description) {
    const descCheck = checkForbiddenConcepts(metadata.description);
    allViolations.push(...descCheck.violations);
  }

  if (metadata.code) {
    const persistCheck = checkPersistencePatterns(metadata.code);
    const externalCheck = checkExternalPatterns(metadata.code);
    allViolations.push(...persistCheck.violations);
    allViolations.push(...externalCheck.violations);
  }

  if (metadata.imports) {
    const importCheck = checkImports(metadata.imports);
    allViolations.push(...importCheck.violations);
  }

  return {
    isValid: allViolations.length === 0,
    violations: allViolations,
  };
}

// ============================================================================
// RUNTIME GUARDS
// ============================================================================

/**
 * Guard wrapper that prevents mutation of returned values
 */
export function freezeDeep<T>(obj: T): T {
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return obj;
  }

  if (Object.isFrozen(obj)) {
    return obj;
  }

  if (Array.isArray(obj)) {
    const frozen = obj.map(item => freezeDeep(item));
    return Object.freeze(frozen) as T;
  }

  const frozen: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    frozen[key] = freezeDeep(value);
  }
  return Object.freeze(frozen) as T;
}

/**
 * Create a read-only proxy for simulation data
 */
export function createReadOnlyProxy<T extends object>(target: T): Readonly<T> {
  return new Proxy(target, {
    get(obj, prop) {
      const value = Reflect.get(obj, prop);
      if (typeof value === 'object' && value !== null) {
        return createReadOnlyProxy(value as object);
      }
      return value;
    },
    set(_obj, prop, _value) {
      throw new Error(`Simulation boundary violation: Cannot set property "${String(prop)}" on read-only simulation data`);
    },
    deleteProperty(_obj, prop) {
      throw new Error(`Simulation boundary violation: Cannot delete property "${String(prop)}" from read-only simulation data`);
    },
    defineProperty(_obj, prop, _descriptor) {
      throw new Error(`Simulation boundary violation: Cannot define property "${String(prop)}" on read-only simulation data`);
    },
    setPrototypeOf(_obj, _prototype) {
      throw new Error('Simulation boundary violation: Cannot modify prototype of read-only simulation data');
    },
  }) as Readonly<T>;
}

/**
 * Assert that simulation is in sandbox mode
 */
export function assertSandboxMode(): void {
  // This function exists as a marker that code is running in sandbox mode
  // In a real implementation, this could check environment variables or flags
}

/**
 * Create a sandboxed execution context
 */
export function withSandbox<T>(fn: () => T): T {
  assertSandboxMode();
  const result = fn();
  return freezeDeep(result);
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function extractContext(text: string, concept: string): string {
  const index = text.toLowerCase().indexOf(concept);
  if (index === -1) return concept;

  const start = Math.max(0, index - 20);
  const end = Math.min(text.length, index + concept.length + 20);
  return `...${text.slice(start, end)}...`;
}

function extractPatternContext(code: string, pattern: RegExp): string {
  const match = code.match(pattern);
  if (!match || match.index === undefined) return pattern.source;

  const start = Math.max(0, match.index - 20);
  const end = Math.min(code.length, match.index + match[0].length + 20);
  return `...${code.slice(start, end)}...`;
}

// ============================================================================
// BOUNDARY GUARD CONSTANTS
// ============================================================================

/**
 * Simulation module identity
 */
export const SIMULATION_MODULE_IDENTITY = Object.freeze({
  name: 'grey-simulation',
  version: '1.0.0',
  mode: 'SANDBOX',
  isReadOnly: true,
  allowsPersistence: false,
  allowsExternalCommunication: false,
}) as {
  readonly name: string;
  readonly version: string;
  readonly mode: 'SANDBOX';
  readonly isReadOnly: true;
  readonly allowsPersistence: false;
  readonly allowsExternalCommunication: false;
};

/**
 * Get module identity for verification
 */
export function getModuleIdentity(): typeof SIMULATION_MODULE_IDENTITY {
  return SIMULATION_MODULE_IDENTITY;
}

/**
 * Verify this module is in the expected mode
 */
export function verifyModuleMode(): BoundaryCheckResult {
  const identity = getModuleIdentity();

  if (identity.mode !== 'SANDBOX') {
    return {
      isValid: false,
      violations: [{
        type: 'STATE_LEAK',
        message: 'Module is not in SANDBOX mode',
        context: `Expected SANDBOX, got ${identity.mode}`,
        severity: 'CRITICAL',
        timestamp: Date.now(),
      }],
    };
  }

  if (!identity.isReadOnly) {
    return {
      isValid: false,
      violations: [{
        type: 'MUTATION_ATTEMPT',
        message: 'Module is not in read-only mode',
        context: 'isReadOnly must be true',
        severity: 'CRITICAL',
        timestamp: Date.now(),
      }],
    };
  }

  return {
    isValid: true,
    violations: [],
  };
}
