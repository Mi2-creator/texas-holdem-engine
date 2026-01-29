/**
 * ImportReference.ts
 * Phase 35 - External Adapter Simulation & Boundary Proof (Read-Only)
 *
 * Import reference definitions for external adapter system.
 * References are validated but NEVER change ledger or economy.
 *
 * Properties:
 * - Accepts only ExternalValueRefId, source, timestamp
 * - Validates against registry and idempotency
 * - Checksum consistency verification
 * - MUST NOT change ledger or economy
 */

import {
  SimulationReferenceId,
  SimulationSequenceId,
  ValidationResult,
  calculateSimulationChecksum,
  generateSimulationReferenceId,
} from './AdapterTypes';

// ============================================================================
// Reference Source Types
// ============================================================================

/**
 * Source classification for imported references.
 */
export type ImportReferenceSource =
  | 'EXTERNAL_SYSTEM'
  | 'MANUAL_RECONCILIATION'
  | 'AUDIT_ADJUSTMENT'
  | 'LEGACY_MIGRATION';

// ============================================================================
// Import Reference Types
// ============================================================================

/**
 * Input for creating an import reference.
 */
export interface ImportReferenceInput {
  readonly externalRefId: string;
  readonly source: ImportReferenceSource;
  readonly timestamp: number;
  readonly amount: number;
  readonly direction: 'IN' | 'OUT';
  readonly description?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Validated import reference.
 * Immutable after creation.
 */
export interface ImportReference {
  readonly referenceId: SimulationReferenceId;
  readonly sequence: SimulationSequenceId;
  readonly externalRefId: string;
  readonly source: ImportReferenceSource;
  readonly timestamp: number;
  readonly amount: number;
  readonly direction: 'IN' | 'OUT';
  readonly description: string;
  readonly checksum: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate import reference input.
 * Returns structured result - never throws.
 */
export function validateImportReferenceInput(input: ImportReferenceInput): ValidationResult {
  const errors: string[] = [];

  // Validate externalRefId
  if (!input.externalRefId || typeof input.externalRefId !== 'string' || input.externalRefId.length === 0) {
    errors.push('External reference ID must be a non-empty string');
  }

  // Validate source
  const validSources: ImportReferenceSource[] = [
    'EXTERNAL_SYSTEM',
    'MANUAL_RECONCILIATION',
    'AUDIT_ADJUSTMENT',
    'LEGACY_MIGRATION',
  ];
  if (!validSources.includes(input.source)) {
    errors.push(`Source must be one of: ${validSources.join(', ')}`);
  }

  // Validate timestamp
  if (!Number.isInteger(input.timestamp) || input.timestamp < 0) {
    errors.push('Timestamp must be a non-negative integer');
  }

  // Validate amount
  if (!Number.isInteger(input.amount)) {
    errors.push('Amount must be an integer');
  }

  if (input.amount < 0) {
    errors.push('Amount must be non-negative');
  }

  // Validate direction
  if (input.direction !== 'IN' && input.direction !== 'OUT') {
    errors.push('Direction must be IN or OUT');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Check for idempotency violation.
 * Returns true if reference already exists with different data.
 */
export function checkIdempotencyViolation(
  existingReference: ImportReference | null,
  newInput: ImportReferenceInput
): ValidationResult {
  if (!existingReference) {
    return { valid: true, errors: [] };
  }

  const errors: string[] = [];

  // Same external ref ID but different data = violation
  if (existingReference.source !== newInput.source) {
    errors.push(`Idempotency violation: source mismatch (existing: ${existingReference.source}, new: ${newInput.source})`);
  }

  if (existingReference.amount !== newInput.amount) {
    errors.push(`Idempotency violation: amount mismatch (existing: ${existingReference.amount}, new: ${newInput.amount})`);
  }

  if (existingReference.direction !== newInput.direction) {
    errors.push(`Idempotency violation: direction mismatch (existing: ${existingReference.direction}, new: ${newInput.direction})`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Verify reference checksum integrity.
 */
export function verifyReferenceChecksum(reference: ImportReference): boolean {
  const dataForChecksum = {
    externalRefId: reference.externalRefId,
    source: reference.source,
    timestamp: reference.timestamp,
    amount: reference.amount,
    direction: reference.direction,
    sequence: reference.sequence,
  };

  return calculateSimulationChecksum(dataForChecksum) === reference.checksum;
}

// ============================================================================
// Reference Builder
// ============================================================================

/**
 * Build an import reference from validated input.
 * Pure function - deterministic output.
 *
 * @param input - Validated input
 * @param sequence - Sequence number for ordering
 * @returns Frozen import reference
 */
export function buildImportReference(
  input: ImportReferenceInput,
  sequence: number
): ImportReference {
  const dataForChecksum = {
    externalRefId: input.externalRefId,
    source: input.source,
    timestamp: input.timestamp,
    amount: input.amount,
    direction: input.direction,
    sequence,
  };

  const reference: ImportReference = {
    referenceId: generateSimulationReferenceId(sequence),
    sequence: sequence as SimulationSequenceId,
    externalRefId: input.externalRefId,
    source: input.source,
    timestamp: input.timestamp,
    amount: input.amount,
    direction: input.direction,
    description: input.description ?? '',
    checksum: calculateSimulationChecksum(dataForChecksum),
    metadata: Object.freeze(input.metadata ?? {}),
  };

  return Object.freeze(reference);
}

// ============================================================================
// Reference Statistics
// ============================================================================

/**
 * Calculate statistics from a collection of references.
 * Pure function - no side effects.
 */
export interface ReferenceStatistics {
  readonly totalCount: number;
  readonly inboundCount: number;
  readonly outboundCount: number;
  readonly totalInAmount: number;
  readonly totalOutAmount: number;
  readonly netAmount: number;
  readonly bySource: Readonly<Record<ImportReferenceSource, number>>;
}

/**
 * Calculate reference statistics.
 */
export function calculateReferenceStatistics(references: readonly ImportReference[]): ReferenceStatistics {
  let inboundCount = 0;
  let outboundCount = 0;
  let totalInAmount = 0;
  let totalOutAmount = 0;
  const bySource: Record<ImportReferenceSource, number> = {
    EXTERNAL_SYSTEM: 0,
    MANUAL_RECONCILIATION: 0,
    AUDIT_ADJUSTMENT: 0,
    LEGACY_MIGRATION: 0,
  };

  for (const ref of references) {
    bySource[ref.source]++;

    if (ref.direction === 'IN') {
      inboundCount++;
      totalInAmount += ref.amount;
    } else {
      outboundCount++;
      totalOutAmount += ref.amount;
    }
  }

  return Object.freeze({
    totalCount: references.length,
    inboundCount,
    outboundCount,
    totalInAmount,
    totalOutAmount,
    netAmount: totalInAmount - totalOutAmount,
    bySource: Object.freeze(bySource),
  });
}
