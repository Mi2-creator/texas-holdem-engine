/**
 * ReportTypes.ts
 * Phase 27 - Admin Revenue Reporting (read-only)
 *
 * Type definitions for admin/operator reporting APIs.
 * All reports are strictly read-only, deterministic, and pure.
 *
 * HARD CONSTRAINTS:
 * - No mutations or side effects
 * - All outputs derived from view data
 * - Integer-only numeric outputs
 * - Stable ordering required
 * - Missing data returns empty structures, never throw
 */

import { TableId, HandId } from '../../security/AuditLog';
import { ClubId } from '../../club/ClubTypes';
import { StateVersion } from '../../sync/SyncTypes';
import {
  AgentId,
  AttributionSource,
} from '../../ledger/LedgerTypes';
import { TimeGranularity } from '../../ledger/views';

// ============================================================================
// Common Report Types
// ============================================================================

/**
 * Time window for reports
 */
export interface ReportTimeWindow {
  readonly fromTimestamp: number;
  readonly toTimestamp: number;
}

/**
 * Report metadata (included in all reports)
 */
export interface ReportMetadata {
  readonly reportType: ReportType;
  readonly generatedAt: number;
  readonly timeWindow: ReportTimeWindow;
  readonly dataVersion: string;
}

/**
 * Available report types
 */
export type ReportType =
  | 'PLATFORM_REVENUE'
  | 'CLUB_REVENUE'
  | 'AGENT_COMMISSION'
  | 'TABLE_SESSION';

/**
 * Generic report result wrapper
 */
export interface ReportResult<T> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: string;
  readonly metadata: ReportMetadata;
}

// ============================================================================
// Platform Revenue Report Types
// ============================================================================

/**
 * Query parameters for platform revenue report
 */
export interface PlatformRevenueReportQuery {
  readonly timeWindow: ReportTimeWindow;
  readonly granularity?: TimeGranularity;
  readonly includeClubBreakdown?: boolean;
  readonly includeTableBreakdown?: boolean;
  readonly clubId?: ClubId;
}

/**
 * Time period bucket in platform revenue report
 */
export interface PlatformRevenuePeriod {
  readonly periodKey: string;
  readonly periodStart: number;
  readonly periodEnd: number;
  readonly totalRevenue: number;
  readonly entryCount: number;
}

/**
 * Club breakdown in platform revenue report
 */
export interface PlatformRevenueByClub {
  readonly clubId: ClubId;
  readonly totalRevenue: number;
  readonly entryCount: number;
  readonly tableCount: number;
}

/**
 * Table breakdown in platform revenue report
 */
export interface PlatformRevenueByTable {
  readonly tableId: TableId;
  readonly clubId: ClubId;
  readonly totalRevenue: number;
  readonly entryCount: number;
  readonly handCount: number;
}

/**
 * Platform revenue report data
 */
export interface PlatformRevenueReportData {
  readonly platformId: string;
  readonly totalRevenue: number;
  readonly totalEntries: number;
  readonly periodBreakdown: readonly PlatformRevenuePeriod[];
  readonly clubBreakdown?: readonly PlatformRevenueByClub[];
  readonly tableBreakdown?: readonly PlatformRevenueByTable[];
  readonly bySource: Readonly<Record<AttributionSource, number>>;
}

// ============================================================================
// Club Revenue Report Types
// ============================================================================

/**
 * Query parameters for club revenue report
 */
export interface ClubRevenueReportQuery {
  readonly clubId: ClubId;
  readonly timeWindow: ReportTimeWindow;
  readonly granularity?: TimeGranularity;
  readonly includeTableBreakdown?: boolean;
}

/**
 * Time period bucket in club revenue report
 */
export interface ClubRevenuePeriod {
  readonly periodKey: string;
  readonly periodStart: number;
  readonly periodEnd: number;
  readonly totalRevenue: number;
  readonly rakeRevenue: number;
  readonly timeFeeRevenue: number;
  readonly otherRevenue: number;
}

/**
 * Table breakdown in club revenue report
 */
export interface ClubRevenueByTable {
  readonly tableId: TableId;
  readonly totalRevenue: number;
  readonly rakeRevenue: number;
  readonly timeFeeRevenue: number;
  readonly handCount: number;
}

/**
 * Club revenue report data
 */
export interface ClubRevenueReportData {
  readonly clubId: ClubId;
  readonly totalRevenue: number;
  readonly totalRake: number;
  readonly totalTimeFees: number;
  readonly totalOther: number;
  readonly totalEntries: number;
  readonly handCount: number;
  readonly tableCount: number;
  readonly periodBreakdown: readonly ClubRevenuePeriod[];
  readonly tableBreakdown?: readonly ClubRevenueByTable[];
}

// ============================================================================
// Agent Commission Report Types
// ============================================================================

/**
 * Query parameters for agent commission report
 */
export interface AgentCommissionReportQuery {
  readonly timeWindow: ReportTimeWindow;
  readonly agentId?: AgentId;
  readonly granularity?: TimeGranularity;
  readonly includeClubBreakdown?: boolean;
}

/**
 * Time period bucket in agent commission report
 */
export interface AgentCommissionPeriod {
  readonly periodKey: string;
  readonly periodStart: number;
  readonly periodEnd: number;
  readonly totalCommission: number;
  readonly entryCount: number;
}

/**
 * Club breakdown in agent commission report
 */
export interface AgentCommissionByClub {
  readonly clubId: ClubId;
  readonly totalCommission: number;
  readonly entryCount: number;
}

/**
 * Single agent summary in report
 */
export interface AgentCommissionSummary {
  readonly agentId: AgentId;
  readonly totalCommission: number;
  readonly entryCount: number;
  readonly clubCount: number;
  readonly periodBreakdown: readonly AgentCommissionPeriod[];
  readonly clubBreakdown?: readonly AgentCommissionByClub[];
}

/**
 * Agent commission report data
 */
export interface AgentCommissionReportData {
  readonly totalCommission: number;
  readonly totalEntries: number;
  readonly agentCount: number;
  readonly agents: readonly AgentCommissionSummary[];
}

// ============================================================================
// Table Session Report Types
// ============================================================================

/**
 * Query parameters for table session report
 */
export interface TableSessionReportQuery {
  readonly tableId: TableId;
  readonly timeWindow: ReportTimeWindow;
  readonly includeHandDetails?: boolean;
  readonly limit?: number;
  readonly offset?: number;
}

/**
 * Hand-level rake detail
 */
export interface HandRakeDetail {
  readonly handId: HandId;
  readonly timestamp: number;
  readonly stateVersion: StateVersion;
  readonly rakeAmount: number;
  readonly clubShare: number;
  readonly agentShare: number;
  readonly platformShare: number;
  readonly agentId?: AgentId;
}

/**
 * Table session summary
 */
export interface TableSessionSummary {
  readonly tableId: TableId;
  readonly clubId: ClubId;
  readonly totalRake: number;
  readonly handCount: number;
  readonly avgRakePerHand: number;
  readonly firstHandAt: number;
  readonly lastHandAt: number;
}

/**
 * Table session report data
 */
export interface TableSessionReportData {
  readonly summary: TableSessionSummary;
  readonly hands?: readonly HandRakeDetail[];
  readonly pagination?: ReportPagination;
}

/**
 * Pagination info for reports
 */
export interface ReportPagination {
  readonly offset: number;
  readonly limit: number;
  readonly totalCount: number;
  readonly hasMore: boolean;
}

// ============================================================================
// Export Types
// ============================================================================

/**
 * Export format
 */
export type ExportFormat = 'JSON' | 'CSV';

/**
 * Export options
 */
export interface ExportOptions {
  readonly format: ExportFormat;
  readonly includeMetadata?: boolean;
  readonly prettyPrint?: boolean;
  readonly csvDelimiter?: string;
}

/**
 * Export result
 */
export interface ExportResult {
  readonly success: boolean;
  readonly content?: string;
  readonly error?: string;
  readonly format: ExportFormat;
  readonly byteSize: number;
  readonly exportedAt: number;
}

/**
 * CSV column definition for schema
 */
export interface CsvColumnDef {
  readonly name: string;
  readonly type: 'string' | 'number' | 'timestamp';
  readonly description: string;
}

/**
 * CSV schema for a report type
 */
export interface CsvSchema {
  readonly reportType: ReportType;
  readonly columns: readonly CsvColumnDef[];
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create report metadata
 */
export function createReportMetadata(
  reportType: ReportType,
  timeWindow: ReportTimeWindow
): ReportMetadata {
  return {
    reportType,
    generatedAt: Date.now(),
    timeWindow,
    dataVersion: '1.0.0',
  };
}

/**
 * Create default time window (last 24 hours)
 */
export function createDefaultReportTimeWindow(): ReportTimeWindow {
  const now = Date.now();
  return {
    fromTimestamp: now - 24 * 60 * 60 * 1000,
    toTimestamp: now,
  };
}

/**
 * Create time window for a specific range
 */
export function createReportTimeWindow(
  fromTimestamp: number,
  toTimestamp: number
): ReportTimeWindow {
  return { fromTimestamp, toTimestamp };
}

/**
 * Validate time window
 */
export function isValidTimeWindow(window: ReportTimeWindow): boolean {
  return (
    window.fromTimestamp >= 0 &&
    window.toTimestamp >= window.fromTimestamp &&
    Number.isInteger(window.fromTimestamp) &&
    Number.isInteger(window.toTimestamp)
  );
}

/**
 * Calculate integer average (rounds down)
 */
export function integerAverage(total: number, count: number): number {
  if (count === 0) return 0;
  return Math.floor(total / count);
}
