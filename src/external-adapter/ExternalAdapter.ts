/**
 * ExternalAdapter.ts
 * Phase 35 - External Adapter Simulation & Boundary Proof (Read-Only)
 *
 * External adapter interface definition.
 *
 * Properties:
 * - No async IO, no promises
 * - Pure functions only
 * - Adapter MUST NOT access engine internals directly
 * - All operations return structured results, never throw
 */

import {
  SimulationAdapterId,
  ExternalExportResult,
  ExternalReferenceResult,
} from './AdapterTypes';
import { ExportPayload } from './ExportPayload';
import { ImportReferenceInput } from './ImportReference';

// ============================================================================
// External Adapter Interface
// ============================================================================

/**
 * External adapter interface.
 *
 * This interface defines the contract for external system adapters.
 * Adapters:
 * - Receive export payloads (read-only)
 * - Submit reference imports (validated, inert)
 * - CANNOT access engine internals
 * - CANNOT mutate engine state
 *
 * All methods are synchronous and pure.
 */
export interface ExternalAdapter {
  /**
   * Adapter identifier.
   */
  readonly adapterId: SimulationAdapterId;

  /**
   * Adapter name for display/logging.
   */
  readonly name: string;

  /**
   * Whether adapter is currently enabled.
   */
  readonly enabled: boolean;

  /**
   * Export a payload to the external system.
   *
   * @param payload - The export payload (read-only snapshot)
   * @returns Structured result, never throws
   */
  export(payload: ExportPayload): ExternalExportResult;

  /**
   * Import a reference from the external system.
   *
   * @param reference - The reference input to import
   * @returns Structured result, never throws
   */
  import(reference: ImportReferenceInput): ExternalReferenceResult;

  /**
   * Get count of received exports.
   */
  getExportCount(): number;

  /**
   * Get count of submitted references.
   */
  getReferenceCount(): number;

  /**
   * Enable the adapter.
   */
  enable(): void;

  /**
   * Disable the adapter.
   */
  disable(): void;

  /**
   * Reset adapter state (for testing).
   */
  reset(): void;
}

// ============================================================================
// Adapter Capabilities
// ============================================================================

/**
 * Adapter capability flags.
 */
export interface AdapterCapabilities {
  readonly canExport: boolean;
  readonly canImport: boolean;
  readonly supportsChecksum: boolean;
  readonly supportsIdempotency: boolean;
}

/**
 * Default capabilities for standard adapters.
 */
export const DEFAULT_ADAPTER_CAPABILITIES: AdapterCapabilities = Object.freeze({
  canExport: true,
  canImport: true,
  supportsChecksum: true,
  supportsIdempotency: true,
});

// ============================================================================
// Adapter Status
// ============================================================================

/**
 * Adapter status information.
 */
export interface AdapterStatus {
  readonly adapterId: SimulationAdapterId;
  readonly name: string;
  readonly enabled: boolean;
  readonly exportCount: number;
  readonly referenceCount: number;
  readonly lastExportSequence: number | null;
  readonly lastReferenceSequence: number | null;
}

/**
 * Get adapter status.
 */
export function getAdapterStatus(adapter: ExternalAdapter): AdapterStatus {
  return Object.freeze({
    adapterId: adapter.adapterId,
    name: adapter.name,
    enabled: adapter.enabled,
    exportCount: adapter.getExportCount(),
    referenceCount: adapter.getReferenceCount(),
    lastExportSequence: null, // To be implemented by concrete adapters
    lastReferenceSequence: null,
  });
}

// ============================================================================
// No-Op Adapter
// ============================================================================

/**
 * No-operation adapter for disabled/null scenarios.
 * All operations succeed but do nothing.
 */
export class NoOpExternalAdapter implements ExternalAdapter {
  readonly adapterId: SimulationAdapterId;
  readonly name: string = 'No-Op Adapter';
  enabled: boolean = false;

  constructor(adapterId?: string) {
    this.adapterId = `sim-adapter-${adapterId ?? 'noop'}` as SimulationAdapterId;
  }

  export(_payload: ExportPayload): ExternalExportResult {
    return {
      success: true,
      status: 'ACCEPTED',
    };
  }

  import(_reference: ImportReferenceInput): ExternalReferenceResult {
    return {
      success: true,
      status: 'ACCEPTED',
    };
  }

  getExportCount(): number {
    return 0;
  }

  getReferenceCount(): number {
    return 0;
  }

  enable(): void {
    this.enabled = true;
  }

  disable(): void {
    this.enabled = false;
  }

  reset(): void {
    this.enabled = false;
  }
}

/**
 * Create a no-op adapter instance.
 */
export function createNoOpExternalAdapter(adapterId?: string): NoOpExternalAdapter {
  return new NoOpExternalAdapter(adapterId);
}
