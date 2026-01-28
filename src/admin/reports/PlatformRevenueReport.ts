/**
 * PlatformRevenueReport.ts
 * Phase 27 - Platform Revenue Reporting (read-only)
 *
 * Generates platform-wide revenue reports from PlatformRevenueView.
 * Time-windowed totals with optional club/table breakdown.
 *
 * HARD CONSTRAINTS:
 * - Read-only - consumes view data only
 * - Pure functions - no side effects
 * - Deterministic - stable ordering required
 * - Integer-only numeric outputs
 */

import { TableId } from '../../security/AuditLog';
import { ClubId } from '../../club/ClubTypes';
import {
  PlatformRevenueView,
  TimeGranularity,
  calculateTimeBucket,
} from '../../ledger/views';
import { AttributionSource } from '../../ledger/LedgerTypes';

import {
  ReportResult,
  ReportTimeWindow,
  PlatformRevenueReportQuery,
  PlatformRevenueReportData,
  PlatformRevenuePeriod,
  PlatformRevenueByClub,
  PlatformRevenueByTable,
  createReportMetadata,
} from './ReportTypes';

// ============================================================================
// Platform Revenue Report Generator
// ============================================================================

/**
 * Generates platform revenue reports from view data
 *
 * This class consumes PlatformRevenueView outputs only.
 * It never modifies any ledger state.
 */
export class PlatformRevenueReport {
  private readonly view: PlatformRevenueView;

  constructor(view: PlatformRevenueView) {
    this.view = view;
  }

  // ==========================================================================
  // Report Generation
  // ==========================================================================

  /**
   * Generate platform revenue report
   */
  generate(query: PlatformRevenueReportQuery): ReportResult<PlatformRevenueReportData> {
    const metadata = createReportMetadata('PLATFORM_REVENUE', query.timeWindow);

    try {
      // Get summary from view
      const viewResult = this.view.getSummary({
        timeWindow: {
          fromTimestamp: query.timeWindow.fromTimestamp,
          toTimestamp: query.timeWindow.toTimestamp,
        },
        clubId: query.clubId,
      });

      if (!viewResult.success || !viewResult.data) {
        return {
          success: false,
          error: viewResult.error ?? 'Failed to get view data',
          metadata,
        };
      }

      const viewData = viewResult.data;

      // Get entries for period breakdown
      const entriesResult = this.view.getEntries({
        timeWindow: {
          fromTimestamp: query.timeWindow.fromTimestamp,
          toTimestamp: query.timeWindow.toTimestamp,
        },
        clubId: query.clubId,
      });

      if (!entriesResult.success || !entriesResult.data) {
        return {
          success: false,
          error: entriesResult.error ?? 'Failed to get entries',
          metadata,
        };
      }

      const entries = entriesResult.data;

      // Build period breakdown
      const periodBreakdown = this.buildPeriodBreakdown(
        entries,
        query.granularity ?? 'DAY'
      );

      // Build club breakdown if requested
      let clubBreakdown: PlatformRevenueByClub[] | undefined;
      if (query.includeClubBreakdown) {
        clubBreakdown = this.buildClubBreakdown(entries);
      }

      // Build table breakdown if requested
      let tableBreakdown: PlatformRevenueByTable[] | undefined;
      if (query.includeTableBreakdown) {
        tableBreakdown = this.buildTableBreakdown(entries);
      }

      const reportData: PlatformRevenueReportData = {
        platformId: viewData.platformId,
        totalRevenue: viewData.totalRevenue,
        totalEntries: viewData.entryCount,
        periodBreakdown,
        clubBreakdown,
        tableBreakdown,
        bySource: viewData.bySource,
      };

      return {
        success: true,
        data: reportData,
        metadata,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        metadata,
      };
    }
  }

  /**
   * Get quick total revenue for a time window
   */
  getTotalRevenue(timeWindow: ReportTimeWindow): number {
    return this.view.getTotalRevenue({
      fromTimestamp: timeWindow.fromTimestamp,
      toTimestamp: timeWindow.toTimestamp,
    });
  }

  /**
   * Get revenue by club (map)
   */
  getRevenueByClub(timeWindow: ReportTimeWindow): ReadonlyMap<ClubId, number> {
    return this.view.getRevenueByClub({
      fromTimestamp: timeWindow.fromTimestamp,
      toTimestamp: timeWindow.toTimestamp,
    });
  }

  // ==========================================================================
  // Internal Methods
  // ==========================================================================

  /**
   * Build period breakdown from entries
   */
  private buildPeriodBreakdown(
    entries: readonly { timestamp: number; amount: number }[],
    granularity: TimeGranularity
  ): PlatformRevenuePeriod[] {
    const buckets = new Map<string, {
      periodStart: number;
      periodEnd: number;
      totalRevenue: number;
      entryCount: number;
    }>();

    for (const entry of entries) {
      const { bucketKey, bucket } = calculateTimeBucket(entry.timestamp, granularity);

      const existing = buckets.get(bucketKey) ?? {
        periodStart: bucket.bucketStart,
        periodEnd: bucket.bucketEnd,
        totalRevenue: 0,
        entryCount: 0,
      };

      existing.totalRevenue += entry.amount;
      existing.entryCount += 1;

      buckets.set(bucketKey, existing);
    }

    // Convert to array and sort deterministically
    const result: PlatformRevenuePeriod[] = [];

    for (const [periodKey, data] of buckets.entries()) {
      result.push({
        periodKey,
        periodStart: data.periodStart,
        periodEnd: data.periodEnd,
        totalRevenue: data.totalRevenue,
        entryCount: data.entryCount,
      });
    }

    // Sort by period key for deterministic ordering
    result.sort((a, b) => a.periodKey.localeCompare(b.periodKey));

    return result;
  }

  /**
   * Build club breakdown from entries
   */
  private buildClubBreakdown(
    entries: readonly { clubId?: ClubId; tableId?: TableId; amount: number }[]
  ): PlatformRevenueByClub[] {
    const clubs = new Map<ClubId, {
      totalRevenue: number;
      entryCount: number;
      tables: Set<TableId>;
    }>();

    for (const entry of entries) {
      if (!entry.clubId) continue;

      const existing = clubs.get(entry.clubId) ?? {
        totalRevenue: 0,
        entryCount: 0,
        tables: new Set<TableId>(),
      };

      existing.totalRevenue += entry.amount;
      existing.entryCount += 1;

      if (entry.tableId) {
        existing.tables.add(entry.tableId);
      }

      clubs.set(entry.clubId, existing);
    }

    // Convert to array and sort deterministically
    const result: PlatformRevenueByClub[] = [];

    for (const [clubId, data] of clubs.entries()) {
      result.push({
        clubId,
        totalRevenue: data.totalRevenue,
        entryCount: data.entryCount,
        tableCount: data.tables.size,
      });
    }

    // Sort by club ID for deterministic ordering
    result.sort((a, b) => a.clubId.localeCompare(b.clubId));

    return result;
  }

  /**
   * Build table breakdown from entries
   */
  private buildTableBreakdown(
    entries: readonly { tableId?: TableId; clubId?: ClubId; handId?: string; amount: number }[]
  ): PlatformRevenueByTable[] {
    const tables = new Map<TableId, {
      clubId: ClubId;
      totalRevenue: number;
      entryCount: number;
      hands: Set<string>;
    }>();

    for (const entry of entries) {
      if (!entry.tableId) continue;

      const existing = tables.get(entry.tableId) ?? {
        clubId: entry.clubId ?? ('' as ClubId),
        totalRevenue: 0,
        entryCount: 0,
        hands: new Set<string>(),
      };

      existing.totalRevenue += entry.amount;
      existing.entryCount += 1;

      if (entry.handId) {
        existing.hands.add(entry.handId);
      }

      // Update clubId if we didn't have it
      if (!existing.clubId && entry.clubId) {
        existing.clubId = entry.clubId;
      }

      tables.set(entry.tableId, existing);
    }

    // Convert to array and sort deterministically
    const result: PlatformRevenueByTable[] = [];

    for (const [tableId, data] of tables.entries()) {
      result.push({
        tableId,
        clubId: data.clubId,
        totalRevenue: data.totalRevenue,
        entryCount: data.entryCount,
        handCount: data.hands.size,
      });
    }

    // Sort by table ID for deterministic ordering
    result.sort((a, b) => a.tableId.localeCompare(b.tableId));

    return result;
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createPlatformRevenueReport(
  view: PlatformRevenueView
): PlatformRevenueReport {
  return new PlatformRevenueReport(view);
}
