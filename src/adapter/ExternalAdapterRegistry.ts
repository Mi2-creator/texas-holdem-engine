/**
 * ExternalAdapterRegistry.ts
 * Phase 34 - External Runtime Adapter Boundary (Engine-Safe)
 *
 * Registry for managing a single external adapter instance.
 *
 * Enforces:
 * - Single registration only
 * - Explicit enable/disable
 * - No-op when disabled
 *
 * The registry does NOT modify engine state.
 */

import {
  AdapterId,
  AdapterStatus,
  AdapterRegistration,
  AdapterRegistrationResult,
  ExportPayload,
  ExternalReference,
  ExternalReferenceValidationResult,
  ReferenceSubmissionResult,
} from './ExternalAdapterTypes';
import { ExternalAdapterPort, NoOpAdapter, createNoOpAdapter } from './ExternalAdapterPort';

// ============================================================================
// Registry Class
// ============================================================================

/**
 * External adapter registry.
 *
 * Manages a single adapter instance with:
 * - Single registration enforcement
 * - Enable/disable control
 * - No-op fallback when disabled
 *
 * INVARIANTS:
 * - Cannot modify engine state
 * - Zero side effects when disabled
 * - Deterministic behavior
 */
export class ExternalAdapterRegistry {
  private adapter: ExternalAdapterPort | null = null;
  private registration: AdapterRegistration | null = null;
  private readonly noOpAdapter: NoOpAdapter;
  private referenceCount: number = 0;
  private exportCount: number = 0;

  constructor() {
    this.noOpAdapter = createNoOpAdapter('registry-noop');
  }

  /**
   * Register an external adapter.
   * Only one adapter can be registered at a time.
   *
   * @param adapter - The adapter to register
   * @param timestamp - Registration timestamp (must be injected)
   * @returns Registration result
   */
  register(adapter: ExternalAdapterPort, timestamp: number): AdapterRegistrationResult {
    // Check for duplicate registration
    if (this.adapter !== null) {
      return {
        success: false,
        error: `Adapter already registered with ID '${this.registration?.adapterId}'`,
      };
    }

    // Validate adapter ID
    if (!adapter.adapterId || adapter.adapterId.length === 0) {
      return {
        success: false,
        error: 'Adapter must have a non-empty adapterId',
      };
    }

    // Register adapter
    this.adapter = adapter;
    this.registration = Object.freeze({
      adapterId: adapter.adapterId,
      registeredAt: timestamp,
      status: 'REGISTERED' as AdapterStatus,
      lastActivityAt: timestamp,
      exportCount: 0,
      referenceCount: 0,
    });

    return {
      success: true,
      adapterId: adapter.adapterId,
    };
  }

  /**
   * Unregister the current adapter.
   *
   * @returns true if adapter was unregistered, false if none was registered
   */
  unregister(): boolean {
    if (!this.adapter) {
      return false;
    }

    // Notify adapter of unregistration
    if (this.adapter.onUnregister) {
      this.adapter.onUnregister();
    }

    this.adapter = null;
    this.registration = null;
    this.exportCount = 0;
    this.referenceCount = 0;

    return true;
  }

  /**
   * Enable the registered adapter.
   *
   * @param timestamp - Enable timestamp (must be injected)
   * @returns true if enabled, false if no adapter registered
   */
  enable(timestamp: number): boolean {
    if (!this.adapter || !this.registration) {
      return false;
    }

    if (this.registration.status === 'ENABLED') {
      return true; // Already enabled
    }

    this.registration = Object.freeze({
      ...this.registration,
      status: 'ENABLED' as AdapterStatus,
      lastActivityAt: timestamp,
    });

    return true;
  }

  /**
   * Disable the registered adapter.
   * When disabled, all operations become no-ops.
   *
   * @param timestamp - Disable timestamp (must be injected)
   * @returns true if disabled, false if no adapter registered
   */
  disable(timestamp: number): boolean {
    if (!this.adapter || !this.registration) {
      return false;
    }

    if (this.registration.status === 'DISABLED') {
      return true; // Already disabled
    }

    // Notify adapter of disable
    if (this.adapter.onDisable) {
      this.adapter.onDisable();
    }

    this.registration = Object.freeze({
      ...this.registration,
      status: 'DISABLED' as AdapterStatus,
      lastActivityAt: timestamp,
    });

    return true;
  }

  /**
   * Check if adapter is registered and enabled.
   */
  isEnabled(): boolean {
    return this.registration?.status === 'ENABLED';
  }

  /**
   * Check if an adapter is registered.
   */
  isRegistered(): boolean {
    return this.adapter !== null;
  }

  /**
   * Get current adapter status.
   */
  getStatus(): AdapterStatus {
    return this.registration?.status ?? 'UNREGISTERED';
  }

  /**
   * Get registration info.
   */
  getRegistration(): AdapterRegistration | null {
    if (!this.registration) {
      return null;
    }

    // Return updated registration with current counts
    return Object.freeze({
      ...this.registration,
      exportCount: this.exportCount,
      referenceCount: this.referenceCount,
    });
  }

  /**
   * Get the active adapter.
   * Returns no-op adapter if disabled or not registered.
   */
  getAdapter(): ExternalAdapterPort {
    if (!this.adapter || this.registration?.status !== 'ENABLED') {
      return this.noOpAdapter;
    }
    return this.adapter;
  }

  /**
   * Notify adapter of engine export.
   * No-op if adapter is disabled or not registered.
   *
   * @param payload - Export payload
   * @param timestamp - Operation timestamp (must be injected)
   */
  notifyExport(payload: ExportPayload, timestamp: number): void {
    if (!this.isEnabled()) {
      return; // No-op when disabled
    }

    this.exportCount++;
    this.updateLastActivity(timestamp);
    this.adapter!.notifyEngineExport(payload);
  }

  /**
   * Submit external reference for validation.
   * No-op if adapter is disabled or not registered.
   *
   * @param reference - External reference
   * @param timestamp - Operation timestamp (must be injected)
   * @returns Submission result
   */
  submitReference(reference: ExternalReference, timestamp: number): ReferenceSubmissionResult {
    if (!this.isEnabled()) {
      return {
        success: false,
        error: 'Adapter is not enabled',
        validation: { valid: false, errors: ['Adapter is not enabled'] },
      };
    }

    const validation = this.adapter!.submitExternalReference(reference);

    if (validation.valid) {
      this.referenceCount++;
      this.updateLastActivity(timestamp);
    }

    return {
      success: validation.valid,
      refId: validation.valid ? reference.refId : undefined,
      validation,
    };
  }

  /**
   * Get export count.
   */
  getExportCount(): number {
    return this.exportCount;
  }

  /**
   * Get reference count.
   */
  getReferenceCount(): number {
    return this.referenceCount;
  }

  /**
   * Reset registry (for testing only).
   */
  reset(): void {
    if (this.adapter?.onUnregister) {
      this.adapter.onUnregister();
    }
    this.adapter = null;
    this.registration = null;
    this.exportCount = 0;
    this.referenceCount = 0;
  }

  /**
   * Update last activity timestamp.
   */
  private updateLastActivity(timestamp: number): void {
    if (this.registration) {
      this.registration = Object.freeze({
        ...this.registration,
        lastActivityAt: timestamp,
      });
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new external adapter registry.
 */
export function createExternalAdapterRegistry(): ExternalAdapterRegistry {
  return new ExternalAdapterRegistry();
}
