/**
 * AdapterTypes.ts
 * Phase 35 - External Adapter Simulation & Boundary Proof (Read-Only)
 *
 * Type definitions for the external adapter simulation system.
 * All types are deterministic, versioned, and replay-safe.
 *
 * CONSTRAINTS:
 * - No payments, wallets, crypto, transfers, deposits, withdrawals
 * - No async IO, no promises
 * - All operations pure and deterministic
 */

// ============================================================================
// Branded Types
// ============================================================================

declare const SimulationAdapterIdBrand: unique symbol;
declare const SimulationExportIdBrand: unique symbol;
declare const SimulationReferenceIdBrand: unique symbol;
declare const SimulationSequenceIdBrand: unique symbol;

/**
 * Branded type for simulation adapter identifier.
 */
export type SimulationAdapterId = string & { readonly [SimulationAdapterIdBrand]: never };

/**
 * Branded type for simulation export identifier.
 */
export type SimulationExportId = string & { readonly [SimulationExportIdBrand]: never };

/**
 * Branded type for simulation reference identifier.
 */
export type SimulationReferenceId = string & { readonly [SimulationReferenceIdBrand]: never };

/**
 * Branded type for sequence identifier (ordering).
 */
export type SimulationSequenceId = number & { readonly [SimulationSequenceIdBrand]: never };

// ============================================================================
// Type Guards
// ============================================================================

export function isSimulationAdapterId(value: string): value is SimulationAdapterId {
  return typeof value === 'string' && value.length > 0 && value.startsWith('sim-adapter-');
}

export function isSimulationExportId(value: string): value is SimulationExportId {
  return typeof value === 'string' && value.length > 0 && value.startsWith('sim-export-');
}

export function isSimulationReferenceId(value: string): value is SimulationReferenceId {
  return typeof value === 'string' && value.length > 0 && value.startsWith('sim-ref-');
}

export function isSimulationSequenceId(value: number): value is SimulationSequenceId {
  return Number.isInteger(value) && value >= 0;
}

// ============================================================================
// ID Generation (Deterministic)
// ============================================================================

/**
 * Generate deterministic adapter ID from seed.
 */
export function generateSimulationAdapterId(seed: string): SimulationAdapterId {
  return `sim-adapter-${seed}` as SimulationAdapterId;
}

/**
 * Generate deterministic export ID from sequence.
 */
export function generateSimulationExportId(sequence: number): SimulationExportId {
  return `sim-export-${sequence}` as SimulationExportId;
}

/**
 * Generate deterministic reference ID from sequence.
 */
export function generateSimulationReferenceId(sequence: number): SimulationReferenceId {
  return `sim-ref-${sequence}` as SimulationReferenceId;
}

// ============================================================================
// Status & Result Types
// ============================================================================

/**
 * Export operation status.
 */
export type ExportStatus = 'ACCEPTED' | 'REJECTED' | 'DUPLICATE';

/**
 * Reference operation status.
 */
export type ReferenceStatus = 'ACCEPTED' | 'REJECTED' | 'DUPLICATE' | 'INVALID';

/**
 * Adapter operation type for audit trail.
 */
export type AdapterOperationType = 'EXPORT' | 'IMPORT';

// ============================================================================
// Result Types (Structured Errors, Never Throw)
// ============================================================================

/**
 * Result of export operation.
 */
export interface ExternalExportResult {
  readonly success: boolean;
  readonly status: ExportStatus;
  readonly exportId?: SimulationExportId;
  readonly sequence?: SimulationSequenceId;
  readonly checksum?: string;
  readonly error?: string;
}

/**
 * Result of reference import operation.
 */
export interface ExternalReferenceResult {
  readonly success: boolean;
  readonly status: ReferenceStatus;
  readonly referenceId?: SimulationReferenceId;
  readonly sequence?: SimulationSequenceId;
  readonly error?: string;
  readonly validationErrors?: readonly string[];
}

// ============================================================================
// Audit Entry Types
// ============================================================================

/**
 * Audit entry for adapter operations.
 * Append-only, immutable record.
 */
export interface AdapterAuditEntry {
  readonly sequence: SimulationSequenceId;
  readonly timestamp: number;
  readonly operationType: AdapterOperationType;
  readonly adapterId: SimulationAdapterId;
  readonly operationId: SimulationExportId | SimulationReferenceId;
  readonly checksum: string;
  readonly success: boolean;
  readonly errorMessage?: string;
}

// ============================================================================
// Checksum Utilities
// ============================================================================

/**
 * Calculate deterministic checksum for any data.
 * Pure function - same input always produces same output.
 */
export function calculateSimulationChecksum(data: unknown): string {
  // Use a replacer function that sorts keys at all levels
  const sortedStr = JSON.stringify(data, (_, value) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return Object.keys(value).sort().reduce((sorted: Record<string, unknown>, key) => {
        sorted[key] = value[key];
        return sorted;
      }, {});
    }
    return value;
  });

  let hash = 0;
  for (let i = 0; i < sortedStr.length; i++) {
    const char = sortedStr.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `sim-${Math.abs(hash).toString(16).padStart(8, '0')}`;
}

/**
 * Verify checksum matches data.
 */
export function verifySimulationChecksum(data: unknown, expectedChecksum: string): boolean {
  return calculateSimulationChecksum(data) === expectedChecksum;
}

// ============================================================================
// Validation Types
// ============================================================================

/**
 * Validation result structure.
 */
export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

/**
 * Combine multiple validation results.
 */
export function combineValidationResults(results: readonly ValidationResult[]): ValidationResult {
  const allErrors: string[] = [];
  let allValid = true;

  for (const result of results) {
    if (!result.valid) {
      allValid = false;
      allErrors.push(...result.errors);
    }
  }

  return { valid: allValid, errors: allErrors };
}
