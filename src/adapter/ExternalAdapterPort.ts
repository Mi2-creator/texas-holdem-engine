/**
 * ExternalAdapterPort.ts
 * Phase 34 - External Runtime Adapter Boundary (Engine-Safe)
 *
 * Interface-only definition for external adapters.
 * NO implementation of transport, network, storage, or anything else.
 *
 * This is the ONLY allowed interface for external system integration.
 *
 * Properties:
 * - Synchronous signatures only (no async/promises)
 * - Read-only data flows
 * - No engine state mutation
 * - No callbacks that can modify state
 */

import {
  AdapterId,
  ExportPayload,
  ExternalReference,
  ExternalReferenceValidationResult,
} from './ExternalAdapterTypes';

// ============================================================================
// Port Interface
// ============================================================================

/**
 * External adapter port interface.
 *
 * This is the boundary through which external systems may:
 * - Receive read-only engine exports
 * - Submit external references for validation (inert)
 *
 * STRICT INVARIANTS:
 * - Cannot mutate engine state
 * - Cannot call engine internals
 * - All data flows are ONE-WAY
 * - All exports are deterministic snapshots
 *
 * NO concrete implementation exists in this module.
 * Implementation is provided by external systems.
 */
export interface ExternalAdapterPort {
  /**
   * Adapter identifier.
   */
  readonly adapterId: AdapterId;

  /**
   * Notify adapter of an engine export.
   * This is a ONE-WAY notification - adapter cannot modify engine.
   *
   * @param payload - The export payload to notify
   * @returns void - no return value to prevent mutation
   */
  notifyEngineExport(payload: ExportPayload): void;

  /**
   * Submit an external reference for validation.
   * The reference is validated and stored INERT - it does NOT
   * modify any engine state.
   *
   * @param reference - The external reference to submit
   * @returns Validation result (inert, no side effects)
   */
  submitExternalReference(reference: ExternalReference): ExternalReferenceValidationResult;

  /**
   * Called when adapter is being disabled.
   * Allows cleanup without affecting engine state.
   */
  onDisable?(): void;

  /**
   * Called when adapter is being unregistered.
   * Allows final cleanup without affecting engine state.
   */
  onUnregister?(): void;
}

// ============================================================================
// No-Op Adapter (for testing and default behavior)
// ============================================================================

/**
 * No-operation adapter implementation.
 * Used when no external adapter is registered or when disabled.
 *
 * This adapter:
 * - Accepts all calls
 * - Does nothing with the data
 * - Returns valid results
 * - Has zero side effects
 */
export class NoOpAdapter implements ExternalAdapterPort {
  readonly adapterId: AdapterId;

  constructor(adapterId: AdapterId) {
    this.adapterId = adapterId;
  }

  notifyEngineExport(_payload: ExportPayload): void {
    // No-op: intentionally empty
  }

  submitExternalReference(reference: ExternalReference): ExternalReferenceValidationResult {
    // Validate and return - no side effects
    return {
      valid: true,
      errors: [],
      reference,
    };
  }

  onDisable(): void {
    // No-op: intentionally empty
  }

  onUnregister(): void {
    // No-op: intentionally empty
  }
}

/**
 * Create a no-op adapter instance.
 */
export function createNoOpAdapter(adapterId?: string): NoOpAdapter {
  const id = (adapterId ?? `noop-${Date.now()}`) as AdapterId;
  return new NoOpAdapter(id);
}
