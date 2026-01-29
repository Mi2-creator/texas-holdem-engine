/**
 * ExternalValueRegistry.ts
 * Phase 33 - External Value Reference Mapping (Read-Only)
 *
 * Append-only registry for external value references.
 * Read-only, deterministic, no side effects on other systems.
 */

import { ExternalValueRefId } from './ExternalValueTypes';
import {
  ExternalValueReference,
  ExternalValueReferenceInput,
  ExternalValueReferenceValidationResult,
  validateExternalValueReferenceInput,
  createExternalValueReference,
} from './ExternalValueReference';

// ============================================================================
// Registry Result Types
// ============================================================================

/**
 * Result of registry append operation.
 * Structured result - never throws.
 */
export interface ExternalValueRegistryAppendResult {
  readonly success: boolean;
  readonly reference?: ExternalValueReference;
  readonly error?: string;
  readonly validationErrors?: readonly string[];
}

/**
 * Result of registry query operation.
 */
export interface ExternalValueRegistryQueryResult {
  readonly references: readonly ExternalValueReference[];
  readonly totalCount: number;
}

// ============================================================================
// Query Parameters
// ============================================================================

/**
 * Query parameters for filtering references.
 */
export interface ExternalValueRegistryQuery {
  readonly source?: ExternalValueReference['source'];
  readonly direction?: ExternalValueReference['direction'];
  readonly linkedLedgerEntryId?: string;
  readonly fromCreatedAt?: number;
  readonly toCreatedAt?: number;
  readonly limit?: number;
  readonly offset?: number;
}

// ============================================================================
// Registry Class
// ============================================================================

/**
 * Append-only registry for external value references.
 *
 * Properties:
 * - Append-only: references cannot be modified or deleted
 * - Idempotent: duplicate IDs are rejected
 * - Deterministic: same inputs produce same outputs
 * - No side effects: does not modify ledger or other systems
 */
export class ExternalValueRegistry {
  private readonly references: Map<ExternalValueRefId, ExternalValueReference>;
  private readonly insertionOrder: ExternalValueRefId[];

  constructor() {
    this.references = new Map();
    this.insertionOrder = [];
  }

  /**
   * Append a new reference to the registry.
   * Returns structured result - never throws.
   *
   * Validates:
   * - Input validity (amount, source, direction)
   * - Idempotency (no duplicate IDs)
   */
  append(input: ExternalValueReferenceInput): ExternalValueRegistryAppendResult {
    // Validate input
    const validation = validateExternalValueReferenceInput(input);
    if (!validation.valid) {
      return {
        success: false,
        error: 'Validation failed',
        validationErrors: validation.errors,
      };
    }

    // Check for duplicate ID (idempotency)
    if (this.references.has(input.id)) {
      return {
        success: false,
        error: `Reference with ID '${input.id}' already exists`,
      };
    }

    // Create the reference
    const reference = createExternalValueReference(input);
    if (!reference) {
      return {
        success: false,
        error: 'Failed to create reference',
      };
    }

    // Store in registry
    this.references.set(input.id, reference);
    this.insertionOrder.push(input.id);

    return {
      success: true,
      reference,
    };
  }

  /**
   * Get a reference by ID.
   * Returns null if not found.
   */
  get(id: ExternalValueRefId): ExternalValueReference | null {
    return this.references.get(id) ?? null;
  }

  /**
   * Check if a reference exists.
   */
  has(id: ExternalValueRefId): boolean {
    return this.references.has(id);
  }

  /**
   * Query references with optional filters.
   * Returns deterministic results in insertion order.
   */
  query(params: ExternalValueRegistryQuery = {}): ExternalValueRegistryQueryResult {
    let results: ExternalValueReference[] = [];

    // Get all references in insertion order
    for (const id of this.insertionOrder) {
      const ref = this.references.get(id);
      if (ref) {
        results.push(ref);
      }
    }

    // Apply filters
    if (params.source !== undefined) {
      results = results.filter(r => r.source === params.source);
    }

    if (params.direction !== undefined) {
      results = results.filter(r => r.direction === params.direction);
    }

    if (params.linkedLedgerEntryId !== undefined) {
      results = results.filter(r => r.linkedLedgerEntryId === params.linkedLedgerEntryId);
    }

    if (params.fromCreatedAt !== undefined) {
      results = results.filter(r => r.createdAt >= params.fromCreatedAt!);
    }

    if (params.toCreatedAt !== undefined) {
      results = results.filter(r => r.createdAt <= params.toCreatedAt!);
    }

    const totalCount = results.length;

    // Apply pagination
    if (params.offset !== undefined && params.offset > 0) {
      results = results.slice(params.offset);
    }

    if (params.limit !== undefined && params.limit > 0) {
      results = results.slice(0, params.limit);
    }

    return {
      references: results,
      totalCount,
    };
  }

  /**
   * Get all references in insertion order.
   */
  getAll(): readonly ExternalValueReference[] {
    return this.insertionOrder
      .map(id => this.references.get(id))
      .filter((ref): ref is ExternalValueReference => ref !== undefined);
  }

  /**
   * Get total count of references.
   */
  count(): number {
    return this.references.size;
  }

  /**
   * Export all references for replay/verification.
   * Returns a frozen array of frozen references.
   */
  export(): readonly ExternalValueReference[] {
    return Object.freeze(this.getAll().map(ref => Object.freeze({ ...ref })));
  }

  /**
   * Create a new registry from exported data.
   * Used for deterministic replay.
   */
  static fromExport(data: readonly ExternalValueReferenceInput[]): ExternalValueRegistry {
    const registry = new ExternalValueRegistry();

    for (const input of data) {
      registry.append(input);
    }

    return registry;
  }

  /**
   * Clear all references (for testing only).
   */
  clear(): void {
    this.references.clear();
    this.insertionOrder.length = 0;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new external value registry.
 */
export function createExternalValueRegistry(): ExternalValueRegistry {
  return new ExternalValueRegistry();
}
