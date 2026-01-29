/**
 * MockExternalAdapter.ts
 * Phase 35 - External Adapter Simulation & Boundary Proof (Read-Only)
 *
 * Deterministic simulation of an external system.
 *
 * Properties:
 * - Stores received exports (append-only)
 * - Stores issued references (append-only)
 * - No mutations, no randomness
 * - Fully deterministic behavior
 */

import {
  SimulationAdapterId,
  SimulationExportId,
  SimulationReferenceId,
  SimulationSequenceId,
  ExternalExportResult,
  ExternalReferenceResult,
  generateSimulationAdapterId,
} from './AdapterTypes';
import {
  ExportPayload,
  validateExportPayload,
} from './ExportPayload';
import {
  ImportReferenceInput,
  ImportReference,
  validateImportReferenceInput,
  checkIdempotencyViolation,
  buildImportReference,
} from './ImportReference';
import { ExternalAdapter, AdapterCapabilities, DEFAULT_ADAPTER_CAPABILITIES } from './ExternalAdapter';

// ============================================================================
// Mock Adapter Configuration
// ============================================================================

/**
 * Configuration for mock adapter behavior.
 */
export interface MockAdapterConfig {
  readonly validateChecksums: boolean;
  readonly enforceIdempotency: boolean;
  readonly maxExports: number;
  readonly maxReferences: number;
}

/**
 * Default mock adapter configuration.
 */
export const DEFAULT_MOCK_CONFIG: MockAdapterConfig = Object.freeze({
  validateChecksums: true,
  enforceIdempotency: true,
  maxExports: 10000,
  maxReferences: 10000,
});

// ============================================================================
// Mock External Adapter
// ============================================================================

/**
 * Mock external adapter for simulation and testing.
 *
 * This adapter:
 * - Stores all received exports (append-only)
 * - Stores all issued references (append-only)
 * - Validates all inputs
 * - Enforces idempotency
 * - Is fully deterministic
 * - Has no side effects beyond its internal state
 */
export class MockExternalAdapter implements ExternalAdapter {
  readonly adapterId: SimulationAdapterId;
  readonly name: string;
  readonly capabilities: AdapterCapabilities;

  private _enabled: boolean = false;
  private config: MockAdapterConfig;
  private exports: ExportPayload[] = [];
  private exportIds: Set<string> = new Set();
  private references: ImportReference[] = [];
  private referencesByExternalId: Map<string, ImportReference> = new Map();
  private exportSequence: number = 0;
  private referenceSequence: number = 0;

  constructor(
    name: string,
    config: Partial<MockAdapterConfig> = {},
    adapterId?: string
  ) {
    this.adapterId = generateSimulationAdapterId(adapterId ?? name.toLowerCase().replace(/\s+/g, '-'));
    this.name = name;
    this.config = { ...DEFAULT_MOCK_CONFIG, ...config };
    this.capabilities = DEFAULT_ADAPTER_CAPABILITIES;
  }

  get enabled(): boolean {
    return this._enabled;
  }

  /**
   * Export a payload to the mock external system.
   * Stores the payload and returns a result.
   */
  export(payload: ExportPayload): ExternalExportResult {
    // Check if enabled
    if (!this._enabled) {
      return {
        success: false,
        status: 'REJECTED',
        error: 'Adapter is disabled',
      };
    }

    // Check max exports
    if (this.exports.length >= this.config.maxExports) {
      return {
        success: false,
        status: 'REJECTED',
        error: `Maximum exports (${this.config.maxExports}) reached`,
      };
    }

    // Check for duplicate (idempotency)
    if (this.exportIds.has(payload.exportId)) {
      return {
        success: true,
        status: 'DUPLICATE',
        exportId: payload.exportId,
        sequence: payload.sequence,
        checksum: payload.checksum,
      };
    }

    // Validate checksum if configured
    if (this.config.validateChecksums) {
      if (!validateExportPayload(payload)) {
        return {
          success: false,
          status: 'REJECTED',
          error: 'Checksum validation failed',
        };
      }
    }

    // Accept the export
    this.exports.push(payload);
    this.exportIds.add(payload.exportId);
    this.exportSequence++;

    return {
      success: true,
      status: 'ACCEPTED',
      exportId: payload.exportId,
      sequence: this.exportSequence as SimulationSequenceId,
      checksum: payload.checksum,
    };
  }

  /**
   * Import a reference from the mock external system.
   * Validates, stores, and returns a result.
   */
  import(input: ImportReferenceInput): ExternalReferenceResult {
    // Check if enabled
    if (!this._enabled) {
      return {
        success: false,
        status: 'REJECTED',
        error: 'Adapter is disabled',
      };
    }

    // Check max references
    if (this.references.length >= this.config.maxReferences) {
      return {
        success: false,
        status: 'REJECTED',
        error: `Maximum references (${this.config.maxReferences}) reached`,
      };
    }

    // Validate input
    const validation = validateImportReferenceInput(input);
    if (!validation.valid) {
      return {
        success: false,
        status: 'INVALID',
        error: 'Validation failed',
        validationErrors: validation.errors,
      };
    }

    // Check idempotency
    if (this.config.enforceIdempotency) {
      const existingRef = this.referencesByExternalId.get(input.externalRefId);
      if (existingRef) {
        const idempotencyCheck = checkIdempotencyViolation(existingRef, input);
        if (!idempotencyCheck.valid) {
          return {
            success: false,
            status: 'DUPLICATE',
            error: 'Idempotency violation',
            validationErrors: idempotencyCheck.errors,
          };
        }
        // Same reference, return success (idempotent)
        return {
          success: true,
          status: 'DUPLICATE',
          referenceId: existingRef.referenceId,
          sequence: existingRef.sequence,
        };
      }
    }

    // Build and store reference
    this.referenceSequence++;
    const reference = buildImportReference(input, this.referenceSequence);
    this.references.push(reference);
    this.referencesByExternalId.set(input.externalRefId, reference);

    return {
      success: true,
      status: 'ACCEPTED',
      referenceId: reference.referenceId,
      sequence: reference.sequence,
    };
  }

  getExportCount(): number {
    return this.exports.length;
  }

  getReferenceCount(): number {
    return this.references.length;
  }

  enable(): void {
    this._enabled = true;
  }

  disable(): void {
    this._enabled = false;
  }

  reset(): void {
    this._enabled = false;
    this.exports = [];
    this.exportIds.clear();
    this.references = [];
    this.referencesByExternalId.clear();
    this.exportSequence = 0;
    this.referenceSequence = 0;
  }

  // ==========================================================================
  // Mock-Specific Methods (for testing/inspection)
  // ==========================================================================

  /**
   * Get all received exports (read-only).
   */
  getExports(): readonly ExportPayload[] {
    return [...this.exports];
  }

  /**
   * Get all issued references (read-only).
   */
  getReferences(): readonly ImportReference[] {
    return [...this.references];
  }

  /**
   * Get export by ID.
   */
  getExportById(exportId: SimulationExportId): ExportPayload | null {
    return this.exports.find(e => e.exportId === exportId) ?? null;
  }

  /**
   * Get reference by ID.
   */
  getReferenceById(referenceId: SimulationReferenceId): ImportReference | null {
    return this.references.find(r => r.referenceId === referenceId) ?? null;
  }

  /**
   * Get reference by external ID.
   */
  getReferenceByExternalId(externalRefId: string): ImportReference | null {
    return this.referencesByExternalId.get(externalRefId) ?? null;
  }

  /**
   * Get current export sequence.
   */
  getExportSequence(): number {
    return this.exportSequence;
  }

  /**
   * Get current reference sequence.
   */
  getReferenceSequence(): number {
    return this.referenceSequence;
  }

  /**
   * Check if export exists.
   */
  hasExport(exportId: SimulationExportId): boolean {
    return this.exportIds.has(exportId);
  }

  /**
   * Check if reference exists.
   */
  hasReference(externalRefId: string): boolean {
    return this.referencesByExternalId.has(externalRefId);
  }

  /**
   * Get adapter statistics.
   */
  getStatistics(): MockAdapterStatistics {
    return Object.freeze({
      exportCount: this.exports.length,
      referenceCount: this.references.length,
      exportSequence: this.exportSequence,
      referenceSequence: this.referenceSequence,
      enabled: this._enabled,
    });
  }

  /**
   * Export adapter state for replay verification.
   */
  exportState(): MockAdapterState {
    return Object.freeze({
      adapterId: this.adapterId,
      name: this.name,
      exports: Object.freeze([...this.exports]),
      references: Object.freeze([...this.references]),
      exportSequence: this.exportSequence,
      referenceSequence: this.referenceSequence,
    });
  }
}

// ============================================================================
// Statistics & State Types
// ============================================================================

/**
 * Mock adapter statistics.
 */
export interface MockAdapterStatistics {
  readonly exportCount: number;
  readonly referenceCount: number;
  readonly exportSequence: number;
  readonly referenceSequence: number;
  readonly enabled: boolean;
}

/**
 * Mock adapter state for replay.
 */
export interface MockAdapterState {
  readonly adapterId: SimulationAdapterId;
  readonly name: string;
  readonly exports: readonly ExportPayload[];
  readonly references: readonly ImportReference[];
  readonly exportSequence: number;
  readonly referenceSequence: number;
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a mock external adapter.
 */
export function createMockExternalAdapter(
  name: string,
  config?: Partial<MockAdapterConfig>,
  adapterId?: string
): MockExternalAdapter {
  return new MockExternalAdapter(name, config, adapterId);
}
