/**
 * ExportPayload.ts
 * Phase 35 - External Adapter Simulation & Boundary Proof (Read-Only)
 *
 * Export payload definitions derived ONLY from read-only views.
 * Explicitly EXCLUDES: balances, payments, wallets, crypto, transfers.
 *
 * Properties:
 * - Deterministic IDs
 * - Checksums for integrity
 * - Version markers for compatibility
 * - Pure derivation from views (no side effects)
 */

import {
  SimulationExportId,
  SimulationSequenceId,
  calculateSimulationChecksum,
  generateSimulationExportId,
} from './AdapterTypes';

// ============================================================================
// Export Payload Type
// ============================================================================

/**
 * Export payload type discriminator.
 */
export type ExportPayloadType =
  | 'LEDGER_VIEW_EXPORT'
  | 'REVENUE_VIEW_EXPORT'
  | 'EXTERNAL_VALUE_EXPORT'
  | 'COMBINED_EXPORT';

// ============================================================================
// Version Constants
// ============================================================================

/**
 * Current export payload version.
 */
export const EXPORT_PAYLOAD_VERSION = 1;

// ============================================================================
// Base Payload Type
// ============================================================================

/**
 * Base export payload with common fields.
 */
interface BaseExportPayload {
  readonly exportId: SimulationExportId;
  readonly sequence: SimulationSequenceId;
  readonly version: number;
  readonly timestamp: number;
  readonly checksum: string;
}

// ============================================================================
// Ledger View Export
// ============================================================================

/**
 * Ledger statistics (derived from view, read-only).
 * Contains ONLY traceable ledger metrics.
 */
export interface LedgerStatistics {
  readonly entryCount: number;
  readonly batchCount: number;
  readonly totalCredits: number;
  readonly totalDebits: number;
  readonly lastSequence: number;
  readonly netFlow: number;
}

/**
 * Ledger view export payload.
 */
export interface LedgerViewExportPayload extends BaseExportPayload {
  readonly type: 'LEDGER_VIEW_EXPORT';
  readonly statistics: LedgerStatistics;
}

// ============================================================================
// Revenue View Export
// ============================================================================

/**
 * Revenue statistics (derived from view, read-only).
 * Revenue = rake only. All numbers traceable to ledger entries.
 */
export interface RevenueStatistics {
  readonly totalRakeCollected: number;
  readonly handCount: number;
  readonly tableCount: number;
  readonly clubCount: number;
  readonly averageRakePerHand: number;
}

/**
 * Revenue view export payload.
 */
export interface RevenueViewExportPayload extends BaseExportPayload {
  readonly type: 'REVENUE_VIEW_EXPORT';
  readonly statistics: RevenueStatistics;
}

// ============================================================================
// External Value View Export
// ============================================================================

/**
 * External value statistics (derived from view, read-only).
 * References only - no actual value movement.
 */
export interface ExternalValueStatistics {
  readonly totalReferences: number;
  readonly inboundReferences: number;
  readonly outboundReferences: number;
  readonly linkedReferences: number;
  readonly unlinkedReferences: number;
  readonly totalInAmount: number;
  readonly totalOutAmount: number;
  readonly netAmount: number;
}

/**
 * External value view export payload.
 */
export interface ExternalValueExportPayload extends BaseExportPayload {
  readonly type: 'EXTERNAL_VALUE_EXPORT';
  readonly statistics: ExternalValueStatistics;
}

// ============================================================================
// Combined Export
// ============================================================================

/**
 * Combined export payload (all views).
 */
export interface CombinedExportPayload extends BaseExportPayload {
  readonly type: 'COMBINED_EXPORT';
  readonly ledger: LedgerStatistics;
  readonly revenue: RevenueStatistics;
  readonly externalValue: ExternalValueStatistics;
}

// ============================================================================
// Union Type
// ============================================================================

/**
 * Union of all export payload types.
 */
export type ExportPayload =
  | LedgerViewExportPayload
  | RevenueViewExportPayload
  | ExternalValueExportPayload
  | CombinedExportPayload;

// ============================================================================
// View Input Interfaces
// ============================================================================

/**
 * Minimal ledger view interface for export.
 */
export interface LedgerViewInput {
  getEntryCount(): number;
  getBatchCount(): number;
  getTotalCredits(): number;
  getTotalDebits(): number;
  getLastSequence(): number;
}

/**
 * Minimal revenue view interface for export.
 */
export interface RevenueViewInput {
  getTotalRakeCollected(): number;
  getHandCount(): number;
  getTableCount(): number;
  getClubCount(): number;
}

/**
 * Minimal external value view interface for export.
 */
export interface ExternalValueViewInput {
  getTotalReferences(): number;
  getInboundCount(): number;
  getOutboundCount(): number;
  getLinkedCount(): number;
  getUnlinkedCount(): number;
  getTotalInAmount(): number;
  getTotalOutAmount(): number;
}

// ============================================================================
// Payload Builders (Pure Functions)
// ============================================================================

/**
 * Build ledger view export payload.
 * Pure function - deterministic output.
 */
export function buildLedgerExportPayload(
  view: LedgerViewInput,
  sequence: number,
  timestamp: number
): LedgerViewExportPayload {
  const statistics: LedgerStatistics = {
    entryCount: view.getEntryCount(),
    batchCount: view.getBatchCount(),
    totalCredits: view.getTotalCredits(),
    totalDebits: view.getTotalDebits(),
    lastSequence: view.getLastSequence(),
    netFlow: view.getTotalCredits() - view.getTotalDebits(),
  };

  const exportId = generateSimulationExportId(sequence);
  const dataForChecksum = { type: 'LEDGER_VIEW_EXPORT', statistics, sequence, timestamp };

  return Object.freeze({
    type: 'LEDGER_VIEW_EXPORT',
    exportId,
    sequence: sequence as SimulationSequenceId,
    version: EXPORT_PAYLOAD_VERSION,
    timestamp,
    checksum: calculateSimulationChecksum(dataForChecksum),
    statistics: Object.freeze(statistics),
  });
}

/**
 * Build revenue view export payload.
 * Pure function - deterministic output.
 */
export function buildRevenueExportPayload(
  view: RevenueViewInput,
  sequence: number,
  timestamp: number
): RevenueViewExportPayload {
  const handCount = view.getHandCount();
  const totalRake = view.getTotalRakeCollected();

  const statistics: RevenueStatistics = {
    totalRakeCollected: totalRake,
    handCount,
    tableCount: view.getTableCount(),
    clubCount: view.getClubCount(),
    averageRakePerHand: handCount > 0 ? Math.floor(totalRake / handCount) : 0,
  };

  const exportId = generateSimulationExportId(sequence);
  const dataForChecksum = { type: 'REVENUE_VIEW_EXPORT', statistics, sequence, timestamp };

  return Object.freeze({
    type: 'REVENUE_VIEW_EXPORT',
    exportId,
    sequence: sequence as SimulationSequenceId,
    version: EXPORT_PAYLOAD_VERSION,
    timestamp,
    checksum: calculateSimulationChecksum(dataForChecksum),
    statistics: Object.freeze(statistics),
  });
}

/**
 * Build external value view export payload.
 * Pure function - deterministic output.
 */
export function buildExternalValueExportPayload(
  view: ExternalValueViewInput,
  sequence: number,
  timestamp: number
): ExternalValueExportPayload {
  const totalIn = view.getTotalInAmount();
  const totalOut = view.getTotalOutAmount();

  const statistics: ExternalValueStatistics = {
    totalReferences: view.getTotalReferences(),
    inboundReferences: view.getInboundCount(),
    outboundReferences: view.getOutboundCount(),
    linkedReferences: view.getLinkedCount(),
    unlinkedReferences: view.getUnlinkedCount(),
    totalInAmount: totalIn,
    totalOutAmount: totalOut,
    netAmount: totalIn - totalOut,
  };

  const exportId = generateSimulationExportId(sequence);
  const dataForChecksum = { type: 'EXTERNAL_VALUE_EXPORT', statistics, sequence, timestamp };

  return Object.freeze({
    type: 'EXTERNAL_VALUE_EXPORT',
    exportId,
    sequence: sequence as SimulationSequenceId,
    version: EXPORT_PAYLOAD_VERSION,
    timestamp,
    checksum: calculateSimulationChecksum(dataForChecksum),
    statistics: Object.freeze(statistics),
  });
}

/**
 * Build combined export payload.
 * Pure function - deterministic output.
 */
export function buildCombinedExportPayload(
  ledgerView: LedgerViewInput,
  revenueView: RevenueViewInput,
  externalValueView: ExternalValueViewInput,
  sequence: number,
  timestamp: number
): CombinedExportPayload {
  const ledger: LedgerStatistics = {
    entryCount: ledgerView.getEntryCount(),
    batchCount: ledgerView.getBatchCount(),
    totalCredits: ledgerView.getTotalCredits(),
    totalDebits: ledgerView.getTotalDebits(),
    lastSequence: ledgerView.getLastSequence(),
    netFlow: ledgerView.getTotalCredits() - ledgerView.getTotalDebits(),
  };

  const handCount = revenueView.getHandCount();
  const totalRake = revenueView.getTotalRakeCollected();
  const revenue: RevenueStatistics = {
    totalRakeCollected: totalRake,
    handCount,
    tableCount: revenueView.getTableCount(),
    clubCount: revenueView.getClubCount(),
    averageRakePerHand: handCount > 0 ? Math.floor(totalRake / handCount) : 0,
  };

  const totalIn = externalValueView.getTotalInAmount();
  const totalOut = externalValueView.getTotalOutAmount();
  const externalValue: ExternalValueStatistics = {
    totalReferences: externalValueView.getTotalReferences(),
    inboundReferences: externalValueView.getInboundCount(),
    outboundReferences: externalValueView.getOutboundCount(),
    linkedReferences: externalValueView.getLinkedCount(),
    unlinkedReferences: externalValueView.getUnlinkedCount(),
    totalInAmount: totalIn,
    totalOutAmount: totalOut,
    netAmount: totalIn - totalOut,
  };

  const exportId = generateSimulationExportId(sequence);
  const dataForChecksum = { type: 'COMBINED_EXPORT', ledger, revenue, externalValue, sequence, timestamp };

  return Object.freeze({
    type: 'COMBINED_EXPORT',
    exportId,
    sequence: sequence as SimulationSequenceId,
    version: EXPORT_PAYLOAD_VERSION,
    timestamp,
    checksum: calculateSimulationChecksum(dataForChecksum),
    ledger: Object.freeze(ledger),
    revenue: Object.freeze(revenue),
    externalValue: Object.freeze(externalValue),
  });
}

// ============================================================================
// Payload Validation
// ============================================================================

/**
 * Validate export payload integrity.
 */
export function validateExportPayload(payload: ExportPayload): boolean {
  // Reconstruct checksum data based on type
  let dataForChecksum: unknown;

  switch (payload.type) {
    case 'LEDGER_VIEW_EXPORT':
      dataForChecksum = {
        type: payload.type,
        statistics: payload.statistics,
        sequence: payload.sequence,
        timestamp: payload.timestamp,
      };
      break;
    case 'REVENUE_VIEW_EXPORT':
      dataForChecksum = {
        type: payload.type,
        statistics: payload.statistics,
        sequence: payload.sequence,
        timestamp: payload.timestamp,
      };
      break;
    case 'EXTERNAL_VALUE_EXPORT':
      dataForChecksum = {
        type: payload.type,
        statistics: payload.statistics,
        sequence: payload.sequence,
        timestamp: payload.timestamp,
      };
      break;
    case 'COMBINED_EXPORT':
      dataForChecksum = {
        type: payload.type,
        ledger: payload.ledger,
        revenue: payload.revenue,
        externalValue: payload.externalValue,
        sequence: payload.sequence,
        timestamp: payload.timestamp,
      };
      break;
  }

  return calculateSimulationChecksum(dataForChecksum) === payload.checksum;
}
