/**
 * AdapterRegistry.ts
 * Phase 35 - External Adapter Simulation & Boundary Proof (Read-Only)
 *
 * Append-only registry of exports and references.
 *
 * Properties:
 * - Enforces idempotency
 * - Enforces ordering
 * - Replay safe
 * - No mutations of external state
 */

import {
  SimulationAdapterId,
  SimulationExportId,
  SimulationReferenceId,
  SimulationSequenceId,
  AdapterAuditEntry,
  ExternalExportResult,
  ExternalReferenceResult,
  calculateSimulationChecksum,
} from './AdapterTypes';
import { ExportPayload } from './ExportPayload';
import { ImportReference, ImportReferenceInput } from './ImportReference';
import { ExternalAdapter, createNoOpExternalAdapter } from './ExternalAdapter';

// ============================================================================
// Registry Types
// ============================================================================

/**
 * Registry entry for an export.
 */
export interface ExportRegistryEntry {
  readonly sequence: SimulationSequenceId;
  readonly timestamp: number;
  readonly adapterId: SimulationAdapterId;
  readonly exportId: SimulationExportId;
  readonly payloadType: ExportPayload['type'];
  readonly checksum: string;
  readonly success: boolean;
  readonly error?: string;
}

/**
 * Registry entry for a reference.
 */
export interface ReferenceRegistryEntry {
  readonly sequence: SimulationSequenceId;
  readonly timestamp: number;
  readonly adapterId: SimulationAdapterId;
  readonly referenceId?: SimulationReferenceId;
  readonly externalRefId: string;
  readonly success: boolean;
  readonly error?: string;
}

/**
 * Registry statistics.
 */
export interface RegistryStatistics {
  readonly totalExports: number;
  readonly successfulExports: number;
  readonly failedExports: number;
  readonly duplicateExports: number;
  readonly totalReferences: number;
  readonly successfulReferences: number;
  readonly failedReferences: number;
  readonly duplicateReferences: number;
  readonly registeredAdapters: number;
  readonly enabledAdapters: number;
}

// ============================================================================
// Adapter Registry
// ============================================================================

/**
 * Adapter registry for managing external adapters and their operations.
 *
 * Properties:
 * - Append-only logging of all operations
 * - Idempotency enforcement
 * - Ordering guarantees
 * - Replay safe (deterministic)
 */
export class AdapterRegistry {
  private adapters: Map<SimulationAdapterId, ExternalAdapter> = new Map();
  private exportLog: ExportRegistryEntry[] = [];
  private referenceLog: ReferenceRegistryEntry[] = [];
  private auditLog: AdapterAuditEntry[] = [];
  private exportIdSet: Set<string> = new Set();
  private externalRefIdSet: Set<string> = new Set();
  private globalSequence: number = 0;

  private readonly noOpAdapter: ExternalAdapter;

  constructor() {
    this.noOpAdapter = createNoOpExternalAdapter('registry-noop');
  }

  // ==========================================================================
  // Adapter Management
  // ==========================================================================

  /**
   * Register an adapter.
   */
  registerAdapter(adapter: ExternalAdapter): boolean {
    if (this.adapters.has(adapter.adapterId)) {
      return false; // Already registered
    }
    this.adapters.set(adapter.adapterId, adapter);
    return true;
  }

  /**
   * Unregister an adapter.
   */
  unregisterAdapter(adapterId: SimulationAdapterId): boolean {
    return this.adapters.delete(adapterId);
  }

  /**
   * Get an adapter by ID.
   */
  getAdapter(adapterId: SimulationAdapterId): ExternalAdapter | null {
    return this.adapters.get(adapterId) ?? null;
  }

  /**
   * Get all registered adapters.
   */
  getAdapters(): readonly ExternalAdapter[] {
    return Array.from(this.adapters.values());
  }

  /**
   * Check if adapter is registered.
   */
  hasAdapter(adapterId: SimulationAdapterId): boolean {
    return this.adapters.has(adapterId);
  }

  // ==========================================================================
  // Export Operations
  // ==========================================================================

  /**
   * Export payload through an adapter.
   * Logs the operation and enforces idempotency.
   */
  export(
    adapterId: SimulationAdapterId,
    payload: ExportPayload,
    timestamp: number
  ): ExternalExportResult {
    const adapter = this.adapters.get(adapterId);

    // Check adapter exists and is enabled
    if (!adapter) {
      return this.logExportFailure(adapterId, payload, timestamp, 'Adapter not found');
    }

    if (!adapter.enabled) {
      return this.logExportFailure(adapterId, payload, timestamp, 'Adapter is disabled');
    }

    // Check idempotency (at registry level)
    if (this.exportIdSet.has(payload.exportId)) {
      // Still log the duplicate operation for audit trail
      this.globalSequence++;
      const entry: ExportRegistryEntry = {
        sequence: this.globalSequence as SimulationSequenceId,
        timestamp,
        adapterId,
        exportId: payload.exportId,
        payloadType: payload.type,
        checksum: payload.checksum,
        success: true,
        error: undefined,
      };
      this.exportLog.push(entry);

      this.auditLog.push({
        sequence: this.globalSequence as SimulationSequenceId,
        timestamp,
        operationType: 'EXPORT',
        adapterId,
        operationId: payload.exportId,
        checksum: payload.checksum,
        success: true,
        errorMessage: undefined,
      });

      return {
        success: true,
        status: 'DUPLICATE',
        exportId: payload.exportId,
        sequence: this.globalSequence as SimulationSequenceId,
        checksum: payload.checksum,
      };
    }

    // Perform export through adapter
    const result = adapter.export(payload);

    // Log the operation
    this.globalSequence++;
    const entry: ExportRegistryEntry = {
      sequence: this.globalSequence as SimulationSequenceId,
      timestamp,
      adapterId,
      exportId: payload.exportId,
      payloadType: payload.type,
      checksum: payload.checksum,
      success: result.success,
      error: result.error,
    };

    this.exportLog.push(entry);

    if (result.success) {
      this.exportIdSet.add(payload.exportId);
    }

    // Add to audit log
    this.auditLog.push({
      sequence: this.globalSequence as SimulationSequenceId,
      timestamp,
      operationType: 'EXPORT',
      adapterId,
      operationId: payload.exportId,
      checksum: payload.checksum,
      success: result.success,
      errorMessage: result.error,
    });

    return {
      ...result,
      sequence: this.globalSequence as SimulationSequenceId,
    };
  }

  /**
   * Log export failure.
   */
  private logExportFailure(
    adapterId: SimulationAdapterId,
    payload: ExportPayload,
    timestamp: number,
    error: string
  ): ExternalExportResult {
    this.globalSequence++;
    const entry: ExportRegistryEntry = {
      sequence: this.globalSequence as SimulationSequenceId,
      timestamp,
      adapterId,
      exportId: payload.exportId,
      payloadType: payload.type,
      checksum: payload.checksum,
      success: false,
      error,
    };

    this.exportLog.push(entry);

    this.auditLog.push({
      sequence: this.globalSequence as SimulationSequenceId,
      timestamp,
      operationType: 'EXPORT',
      adapterId,
      operationId: payload.exportId,
      checksum: payload.checksum,
      success: false,
      errorMessage: error,
    });

    return {
      success: false,
      status: 'REJECTED',
      error,
    };
  }

  // ==========================================================================
  // Import Operations
  // ==========================================================================

  /**
   * Import reference through an adapter.
   * Logs the operation and enforces idempotency.
   */
  import(
    adapterId: SimulationAdapterId,
    reference: ImportReferenceInput,
    timestamp: number
  ): ExternalReferenceResult {
    const adapter = this.adapters.get(adapterId);

    // Check adapter exists and is enabled
    if (!adapter) {
      return this.logReferenceFailure(adapterId, reference, timestamp, 'Adapter not found');
    }

    if (!adapter.enabled) {
      return this.logReferenceFailure(adapterId, reference, timestamp, 'Adapter is disabled');
    }

    // Check idempotency (at registry level)
    if (this.externalRefIdSet.has(reference.externalRefId)) {
      const existingEntry = this.referenceLog.find(
        r => r.externalRefId === reference.externalRefId && r.success
      );

      // Still log the duplicate operation for audit trail
      this.globalSequence++;
      const entry: ReferenceRegistryEntry = {
        sequence: this.globalSequence as SimulationSequenceId,
        timestamp,
        adapterId,
        referenceId: existingEntry?.referenceId,
        externalRefId: reference.externalRefId,
        success: true,
        error: undefined,
      };
      this.referenceLog.push(entry);

      this.auditLog.push({
        sequence: this.globalSequence as SimulationSequenceId,
        timestamp,
        operationType: 'IMPORT',
        adapterId,
        operationId: existingEntry?.referenceId ?? (`dup-${this.globalSequence}` as SimulationReferenceId),
        checksum: calculateSimulationChecksum(reference),
        success: true,
        errorMessage: undefined,
      });

      return {
        success: true,
        status: 'DUPLICATE',
        referenceId: existingEntry?.referenceId,
        sequence: this.globalSequence as SimulationSequenceId,
      };
    }

    // Perform import through adapter
    const result = adapter.import(reference);

    // Log the operation
    this.globalSequence++;
    const entry: ReferenceRegistryEntry = {
      sequence: this.globalSequence as SimulationSequenceId,
      timestamp,
      adapterId,
      referenceId: result.referenceId,
      externalRefId: reference.externalRefId,
      success: result.success,
      error: result.error,
    };

    this.referenceLog.push(entry);

    if (result.success && result.status === 'ACCEPTED') {
      this.externalRefIdSet.add(reference.externalRefId);
    }

    // Add to audit log
    this.auditLog.push({
      sequence: this.globalSequence as SimulationSequenceId,
      timestamp,
      operationType: 'IMPORT',
      adapterId,
      operationId: result.referenceId ?? (`failed-${this.globalSequence}` as SimulationReferenceId),
      checksum: calculateSimulationChecksum(reference),
      success: result.success,
      errorMessage: result.error,
    });

    return {
      ...result,
      sequence: this.globalSequence as SimulationSequenceId,
    };
  }

  /**
   * Log reference failure.
   */
  private logReferenceFailure(
    adapterId: SimulationAdapterId,
    reference: ImportReferenceInput,
    timestamp: number,
    error: string
  ): ExternalReferenceResult {
    this.globalSequence++;
    const entry: ReferenceRegistryEntry = {
      sequence: this.globalSequence as SimulationSequenceId,
      timestamp,
      adapterId,
      externalRefId: reference.externalRefId,
      success: false,
      error,
    };

    this.referenceLog.push(entry);

    this.auditLog.push({
      sequence: this.globalSequence as SimulationSequenceId,
      timestamp,
      operationType: 'IMPORT',
      adapterId,
      operationId: `failed-${this.globalSequence}` as SimulationReferenceId,
      checksum: calculateSimulationChecksum(reference),
      success: false,
      errorMessage: error,
    });

    return {
      success: false,
      status: 'REJECTED',
      error,
    };
  }

  // ==========================================================================
  // Query Methods
  // ==========================================================================

  /**
   * Get export log (read-only).
   */
  getExportLog(): readonly ExportRegistryEntry[] {
    return [...this.exportLog];
  }

  /**
   * Get reference log (read-only).
   */
  getReferenceLog(): readonly ReferenceRegistryEntry[] {
    return [...this.referenceLog];
  }

  /**
   * Get audit log (read-only).
   */
  getAuditLog(): readonly AdapterAuditEntry[] {
    return [...this.auditLog];
  }

  /**
   * Get registry statistics.
   */
  getStatistics(): RegistryStatistics {
    const successfulExports = this.exportLog.filter(e => e.success).length;
    const duplicateExports = this.exportLog.filter(e => e.success).length - this.exportIdSet.size;
    const successfulRefs = this.referenceLog.filter(r => r.success).length;
    const duplicateRefs = this.referenceLog.filter(r => r.success).length - this.externalRefIdSet.size;

    return Object.freeze({
      totalExports: this.exportLog.length,
      successfulExports,
      failedExports: this.exportLog.length - successfulExports,
      duplicateExports: Math.max(0, duplicateExports),
      totalReferences: this.referenceLog.length,
      successfulReferences: successfulRefs,
      failedReferences: this.referenceLog.length - successfulRefs,
      duplicateReferences: Math.max(0, duplicateRefs),
      registeredAdapters: this.adapters.size,
      enabledAdapters: Array.from(this.adapters.values()).filter(a => a.enabled).length,
    });
  }

  /**
   * Get global sequence number.
   */
  getGlobalSequence(): number {
    return this.globalSequence;
  }

  /**
   * Check if export exists.
   */
  hasExport(exportId: SimulationExportId): boolean {
    return this.exportIdSet.has(exportId);
  }

  /**
   * Check if reference exists.
   */
  hasReference(externalRefId: string): boolean {
    return this.externalRefIdSet.has(externalRefId);
  }

  // ==========================================================================
  // Reset (for testing)
  // ==========================================================================

  /**
   * Reset registry state.
   */
  reset(): void {
    this.adapters.clear();
    this.exportLog = [];
    this.referenceLog = [];
    this.auditLog = [];
    this.exportIdSet.clear();
    this.externalRefIdSet.clear();
    this.globalSequence = 0;
  }

  // ==========================================================================
  // State Export (for replay verification)
  // ==========================================================================

  /**
   * Export registry state for replay verification.
   */
  exportState(): RegistryState {
    return Object.freeze({
      exportLog: Object.freeze([...this.exportLog]),
      referenceLog: Object.freeze([...this.referenceLog]),
      auditLog: Object.freeze([...this.auditLog]),
      globalSequence: this.globalSequence,
      adapterIds: Object.freeze(Array.from(this.adapters.keys())),
    });
  }
}

/**
 * Registry state for replay.
 */
export interface RegistryState {
  readonly exportLog: readonly ExportRegistryEntry[];
  readonly referenceLog: readonly ReferenceRegistryEntry[];
  readonly auditLog: readonly AdapterAuditEntry[];
  readonly globalSequence: number;
  readonly adapterIds: readonly SimulationAdapterId[];
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create an adapter registry.
 */
export function createAdapterRegistry(): AdapterRegistry {
  return new AdapterRegistry();
}
