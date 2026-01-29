/**
 * ExternalValueView.ts
 * Phase 33 - External Value Reference Mapping (Read-Only)
 *
 * Read-only aggregation views for external value references.
 * Used for reconciliation and reporting ONLY.
 * Deterministic outputs - same input produces same output.
 */

import {
  ExternalValueSource,
  ExternalValueDirection,
  ExternalValueAmount,
} from './ExternalValueTypes';
import { ExternalValueReference } from './ExternalValueReference';
import { ExternalValueRegistry } from './ExternalValueRegistry';

// ============================================================================
// Aggregation Types
// ============================================================================

/**
 * Aggregation by source.
 */
export interface ExternalValueBySourceEntry {
  readonly source: ExternalValueSource;
  readonly totalAmount: ExternalValueAmount;
  readonly count: number;
  readonly inAmount: ExternalValueAmount;
  readonly outAmount: ExternalValueAmount;
}

/**
 * Aggregation by direction.
 */
export interface ExternalValueByDirectionEntry {
  readonly direction: ExternalValueDirection;
  readonly totalAmount: ExternalValueAmount;
  readonly count: number;
}

/**
 * Aggregation by linked ledger entry.
 */
export interface ExternalValueByLedgerEntry {
  readonly linkedLedgerEntryId: string;
  readonly totalAmount: ExternalValueAmount;
  readonly count: number;
  readonly sources: readonly ExternalValueSource[];
}

/**
 * Summary of all external values.
 */
export interface ExternalValueSummary {
  readonly totalReferences: number;
  readonly totalInAmount: ExternalValueAmount;
  readonly totalOutAmount: ExternalValueAmount;
  readonly netAmount: ExternalValueAmount;
  readonly bySource: readonly ExternalValueBySourceEntry[];
  readonly byDirection: readonly ExternalValueByDirectionEntry[];
  readonly linkedCount: number;
  readonly unlinkedCount: number;
}

// ============================================================================
// View Class
// ============================================================================

/**
 * Read-only view for external value aggregation.
 *
 * Properties:
 * - Read-only: does not modify registry
 * - Deterministic: same input produces same output
 * - No side effects: pure computation only
 */
export class ExternalValueView {
  private readonly registry: ExternalValueRegistry;

  constructor(registry: ExternalValueRegistry) {
    this.registry = registry;
  }

  /**
   * Get aggregation grouped by source.
   * Deterministic output in alphabetical source order.
   */
  groupBySource(): readonly ExternalValueBySourceEntry[] {
    const refs = this.registry.getAll();
    const sourceMap = new Map<ExternalValueSource, {
      totalAmount: number;
      count: number;
      inAmount: number;
      outAmount: number;
    }>();

    for (const ref of refs) {
      const existing = sourceMap.get(ref.source) ?? {
        totalAmount: 0,
        count: 0,
        inAmount: 0,
        outAmount: 0,
      };

      existing.totalAmount += ref.amount;
      existing.count += 1;

      if (ref.direction === 'IN') {
        existing.inAmount += ref.amount;
      } else {
        existing.outAmount += ref.amount;
      }

      sourceMap.set(ref.source, existing);
    }

    // Sort by source alphabetically for determinism
    const sources = Array.from(sourceMap.keys()).sort();

    return sources.map(source => {
      const data = sourceMap.get(source)!;
      return Object.freeze({
        source,
        totalAmount: data.totalAmount,
        count: data.count,
        inAmount: data.inAmount,
        outAmount: data.outAmount,
      });
    });
  }

  /**
   * Get aggregation grouped by direction.
   * Deterministic output: IN before OUT.
   */
  groupByDirection(): readonly ExternalValueByDirectionEntry[] {
    const refs = this.registry.getAll();
    const directionMap = new Map<ExternalValueDirection, {
      totalAmount: number;
      count: number;
    }>();

    for (const ref of refs) {
      const existing = directionMap.get(ref.direction) ?? {
        totalAmount: 0,
        count: 0,
      };

      existing.totalAmount += ref.amount;
      existing.count += 1;

      directionMap.set(ref.direction, existing);
    }

    // Deterministic order: IN, OUT
    const directions: ExternalValueDirection[] = ['IN', 'OUT'];

    return directions
      .filter(dir => directionMap.has(dir))
      .map(direction => {
        const data = directionMap.get(direction)!;
        return Object.freeze({
          direction,
          totalAmount: data.totalAmount,
          count: data.count,
        });
      });
  }

  /**
   * Get aggregation grouped by linked ledger entry.
   * Only includes references with linkedLedgerEntryId.
   * Deterministic output sorted by ledger entry ID.
   */
  groupByLinkedLedger(): readonly ExternalValueByLedgerEntry[] {
    const refs = this.registry.getAll();
    const ledgerMap = new Map<string, {
      totalAmount: number;
      count: number;
      sources: Set<ExternalValueSource>;
    }>();

    for (const ref of refs) {
      if (!ref.linkedLedgerEntryId) continue;

      const existing = ledgerMap.get(ref.linkedLedgerEntryId) ?? {
        totalAmount: 0,
        count: 0,
        sources: new Set<ExternalValueSource>(),
      };

      existing.totalAmount += ref.amount;
      existing.count += 1;
      existing.sources.add(ref.source);

      ledgerMap.set(ref.linkedLedgerEntryId, existing);
    }

    // Sort by ledger entry ID for determinism
    const ledgerIds = Array.from(ledgerMap.keys()).sort();

    return ledgerIds.map(linkedLedgerEntryId => {
      const data = ledgerMap.get(linkedLedgerEntryId)!;
      return Object.freeze({
        linkedLedgerEntryId,
        totalAmount: data.totalAmount,
        count: data.count,
        sources: Object.freeze(Array.from(data.sources).sort()),
      });
    });
  }

  /**
   * Get complete summary of external values.
   * Deterministic output.
   */
  getSummary(): ExternalValueSummary {
    const refs = this.registry.getAll();

    let totalInAmount = 0;
    let totalOutAmount = 0;
    let linkedCount = 0;
    let unlinkedCount = 0;

    for (const ref of refs) {
      if (ref.direction === 'IN') {
        totalInAmount += ref.amount;
      } else {
        totalOutAmount += ref.amount;
      }

      if (ref.linkedLedgerEntryId) {
        linkedCount += 1;
      } else {
        unlinkedCount += 1;
      }
    }

    return Object.freeze({
      totalReferences: refs.length,
      totalInAmount,
      totalOutAmount,
      netAmount: totalInAmount - totalOutAmount,
      bySource: this.groupBySource(),
      byDirection: this.groupByDirection(),
      linkedCount,
      unlinkedCount,
    });
  }

  /**
   * Get references for a specific source.
   * Returns in registry insertion order.
   */
  getBySource(source: ExternalValueSource): readonly ExternalValueReference[] {
    return this.registry.query({ source }).references;
  }

  /**
   * Get references for a specific direction.
   * Returns in registry insertion order.
   */
  getByDirection(direction: ExternalValueDirection): readonly ExternalValueReference[] {
    return this.registry.query({ direction }).references;
  }

  /**
   * Get references linked to a specific ledger entry.
   * Returns in registry insertion order.
   */
  getByLinkedLedger(linkedLedgerEntryId: string): readonly ExternalValueReference[] {
    return this.registry.query({ linkedLedgerEntryId }).references;
  }

  /**
   * Get unlinked references (no linkedLedgerEntryId).
   * Returns in registry insertion order.
   */
  getUnlinked(): readonly ExternalValueReference[] {
    return this.registry.getAll().filter(ref => !ref.linkedLedgerEntryId);
  }

  /**
   * Verify determinism: same registry produces same output.
   * Used for replay verification.
   */
  computeChecksum(): string {
    const summary = this.getSummary();
    const data = JSON.stringify({
      total: summary.totalReferences,
      in: summary.totalInAmount,
      out: summary.totalOutAmount,
      net: summary.netAmount,
      linked: summary.linkedCount,
      unlinked: summary.unlinkedCount,
    });

    // Simple hash for checksum
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a read-only view for a registry.
 */
export function createExternalValueView(registry: ExternalValueRegistry): ExternalValueView {
  return new ExternalValueView(registry);
}
