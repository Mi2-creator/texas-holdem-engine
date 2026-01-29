/**
 * EngineExportAdapter.ts
 * Phase 34 - External Runtime Adapter Boundary (Engine-Safe)
 *
 * Produces canonical export objects from engine views.
 * NEVER mutates engine state.
 *
 * Consumes:
 * - LedgerView (read-only)
 * - RevenueViews (read-only)
 * - ExternalValueView (read-only)
 *
 * All exports are:
 * - Deterministic snapshots
 * - Versioned
 * - Checksummed
 * - Read-only (frozen)
 */

import {
  ExportId,
  ExportPayload,
  LedgerSnapshotPayload,
  RevenueSummaryPayload,
  ExternalValueSummaryPayload,
  FullEngineExportPayload,
  ExportResult,
  calculateExportChecksum,
} from './ExternalAdapterTypes';

// ============================================================================
// View Interfaces (Minimal, Read-Only)
// ============================================================================

/**
 * Minimal ledger view interface for exports.
 * Only the methods needed for export - no mutation.
 */
export interface LedgerViewForExport {
  getEntryCount(): number;
  getBatchCount(): number;
  getTotalCredits(): number;
  getTotalDebits(): number;
  getLastSequence(): number;
  getLastEntryId(): string | null;
}

/**
 * Minimal revenue view interface for exports.
 * Only the methods needed for export - no mutation.
 */
export interface RevenueViewForExport {
  getTotalPlatformRevenue(): number;
  getTotalClubRevenue(): number;
  getTotalAgentCommission(): number;
  getHandCount(): number;
  getTableCount(): number;
  getClubCount(): number;
}

/**
 * Minimal external value view interface for exports.
 * Only the methods needed for export - no mutation.
 */
export interface ExternalValueViewForExport {
  getTotalReferences(): number;
  getTotalInAmount(): number;
  getTotalOutAmount(): number;
  getNetAmount(): number;
  getLinkedCount(): number;
  getUnlinkedCount(): number;
}

// ============================================================================
// Export Adapter Class
// ============================================================================

/**
 * Engine export adapter.
 *
 * Produces canonical export objects from engine views.
 * All operations are read-only - NEVER mutates engine state.
 *
 * Properties:
 * - Deterministic: same views produce same exports
 * - Versioned: all exports include version number
 * - Checksummed: all exports include integrity checksum
 * - Frozen: all exports are immutable
 */
export class EngineExportAdapter {
  private readonly version: number = 1;
  private exportSequence: number = 0;

  /**
   * Generate a unique export ID.
   * Deterministic based on sequence number.
   */
  private generateExportId(): ExportId {
    this.exportSequence++;
    return `export-${this.exportSequence}` as ExportId;
  }

  /**
   * Create a ledger snapshot export.
   *
   * @param view - Ledger view (read-only)
   * @param timestamp - Export timestamp (must be injected)
   * @returns Export result with payload
   */
  createLedgerSnapshot(
    view: LedgerViewForExport,
    timestamp: number
  ): ExportResult {
    try {
      const data = {
        entryCount: view.getEntryCount(),
        batchCount: view.getBatchCount(),
        totalCredits: view.getTotalCredits(),
        totalDebits: view.getTotalDebits(),
        lastSequence: view.getLastSequence(),
        lastEntryId: view.getLastEntryId() ?? '',
      };

      const payload: LedgerSnapshotPayload = Object.freeze({
        type: 'LEDGER_SNAPSHOT',
        exportId: this.generateExportId(),
        version: this.version,
        createdAt: timestamp,
        checksum: calculateExportChecksum(data),
        ...data,
      });

      return {
        success: true,
        exportId: payload.exportId,
        payload,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to create ledger snapshot: ${error}`,
      };
    }
  }

  /**
   * Create a revenue summary export.
   *
   * @param view - Revenue view (read-only)
   * @param timestamp - Export timestamp (must be injected)
   * @returns Export result with payload
   */
  createRevenueSummary(
    view: RevenueViewForExport,
    timestamp: number
  ): ExportResult {
    try {
      const data = {
        totalPlatformRevenue: view.getTotalPlatformRevenue(),
        totalClubRevenue: view.getTotalClubRevenue(),
        totalAgentCommission: view.getTotalAgentCommission(),
        handCount: view.getHandCount(),
        tableCount: view.getTableCount(),
        clubCount: view.getClubCount(),
      };

      const payload: RevenueSummaryPayload = Object.freeze({
        type: 'REVENUE_SUMMARY',
        exportId: this.generateExportId(),
        version: this.version,
        createdAt: timestamp,
        checksum: calculateExportChecksum(data),
        ...data,
      });

      return {
        success: true,
        exportId: payload.exportId,
        payload,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to create revenue summary: ${error}`,
      };
    }
  }

  /**
   * Create an external value summary export.
   *
   * @param view - External value view (read-only)
   * @param timestamp - Export timestamp (must be injected)
   * @returns Export result with payload
   */
  createExternalValueSummary(
    view: ExternalValueViewForExport,
    timestamp: number
  ): ExportResult {
    try {
      const data = {
        totalReferences: view.getTotalReferences(),
        totalInAmount: view.getTotalInAmount(),
        totalOutAmount: view.getTotalOutAmount(),
        netAmount: view.getNetAmount(),
        linkedCount: view.getLinkedCount(),
        unlinkedCount: view.getUnlinkedCount(),
      };

      const payload: ExternalValueSummaryPayload = Object.freeze({
        type: 'EXTERNAL_VALUE_SUMMARY',
        exportId: this.generateExportId(),
        version: this.version,
        createdAt: timestamp,
        checksum: calculateExportChecksum(data),
        ...data,
      });

      return {
        success: true,
        exportId: payload.exportId,
        payload,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to create external value summary: ${error}`,
      };
    }
  }

  /**
   * Create a full engine export combining all views.
   *
   * @param ledgerView - Ledger view (read-only)
   * @param revenueView - Revenue view (read-only)
   * @param externalValueView - External value view (read-only)
   * @param timestamp - Export timestamp (must be injected)
   * @returns Export result with full payload
   */
  createFullExport(
    ledgerView: LedgerViewForExport,
    revenueView: RevenueViewForExport,
    externalValueView: ExternalValueViewForExport,
    timestamp: number
  ): ExportResult {
    try {
      // Create individual exports
      const ledgerResult = this.createLedgerSnapshot(ledgerView, timestamp);
      if (!ledgerResult.success || !ledgerResult.payload) {
        return ledgerResult;
      }

      const revenueResult = this.createRevenueSummary(revenueView, timestamp);
      if (!revenueResult.success || !revenueResult.payload) {
        return revenueResult;
      }

      const externalResult = this.createExternalValueSummary(externalValueView, timestamp);
      if (!externalResult.success || !externalResult.payload) {
        return externalResult;
      }

      const ledger = ledgerResult.payload as LedgerSnapshotPayload;
      const revenue = revenueResult.payload as RevenueSummaryPayload;
      const externalValue = externalResult.payload as ExternalValueSummaryPayload;

      const combinedData = {
        ledgerChecksum: ledger.checksum,
        revenueChecksum: revenue.checksum,
        externalValueChecksum: externalValue.checksum,
      };

      const payload: FullEngineExportPayload = Object.freeze({
        type: 'FULL_ENGINE_EXPORT',
        exportId: this.generateExportId(),
        version: this.version,
        createdAt: timestamp,
        checksum: calculateExportChecksum(combinedData),
        ledger,
        revenue,
        externalValue,
      });

      return {
        success: true,
        exportId: payload.exportId,
        payload,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to create full export: ${error}`,
      };
    }
  }

  /**
   * Get current export sequence (for testing/verification).
   */
  getExportSequence(): number {
    return this.exportSequence;
  }

  /**
   * Reset export sequence (for testing only).
   */
  resetSequence(): void {
    this.exportSequence = 0;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new engine export adapter.
 */
export function createEngineExportAdapter(): EngineExportAdapter {
  return new EngineExportAdapter();
}

// ============================================================================
// View Adapter Utilities
// ============================================================================

/**
 * Create a ledger view adapter from an object with the required methods.
 * This allows adapting any object that has the required interface.
 */
export function adaptLedgerView(source: {
  getEntryCount?: () => number;
  getBatchCount?: () => number;
  getTotalCredits?: () => number;
  getTotalDebits?: () => number;
  getLastSequence?: () => number;
  getLastEntryId?: () => string | null;
}): LedgerViewForExport {
  return {
    getEntryCount: source.getEntryCount ?? (() => 0),
    getBatchCount: source.getBatchCount ?? (() => 0),
    getTotalCredits: source.getTotalCredits ?? (() => 0),
    getTotalDebits: source.getTotalDebits ?? (() => 0),
    getLastSequence: source.getLastSequence ?? (() => 0),
    getLastEntryId: source.getLastEntryId ?? (() => null),
  };
}

/**
 * Create a revenue view adapter from an object with the required methods.
 */
export function adaptRevenueView(source: {
  getTotalPlatformRevenue?: () => number;
  getTotalClubRevenue?: () => number;
  getTotalAgentCommission?: () => number;
  getHandCount?: () => number;
  getTableCount?: () => number;
  getClubCount?: () => number;
}): RevenueViewForExport {
  return {
    getTotalPlatformRevenue: source.getTotalPlatformRevenue ?? (() => 0),
    getTotalClubRevenue: source.getTotalClubRevenue ?? (() => 0),
    getTotalAgentCommission: source.getTotalAgentCommission ?? (() => 0),
    getHandCount: source.getHandCount ?? (() => 0),
    getTableCount: source.getTableCount ?? (() => 0),
    getClubCount: source.getClubCount ?? (() => 0),
  };
}

/**
 * Create an external value view adapter from an object with the required methods.
 */
export function adaptExternalValueView(source: {
  getTotalReferences?: () => number;
  getTotalInAmount?: () => number;
  getTotalOutAmount?: () => number;
  getNetAmount?: () => number;
  getLinkedCount?: () => number;
  getUnlinkedCount?: () => number;
}): ExternalValueViewForExport {
  return {
    getTotalReferences: source.getTotalReferences ?? (() => 0),
    getTotalInAmount: source.getTotalInAmount ?? (() => 0),
    getTotalOutAmount: source.getTotalOutAmount ?? (() => 0),
    getNetAmount: source.getNetAmount ?? (() => 0),
    getLinkedCount: source.getLinkedCount ?? (() => 0),
    getUnlinkedCount: source.getUnlinkedCount ?? (() => 0),
  };
}
