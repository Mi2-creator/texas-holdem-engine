/**
 * ClubRevenueReport.ts
 * Phase 27 - Club Revenue Reporting (read-only)
 *
 * Generates per-club revenue reports from ClubRevenueView.
 * Table-level drilldown with rake vs time fee separation.
 *
 * HARD CONSTRAINTS:
 * - Read-only - consumes view data only
 * - Pure functions - no side effects
 * - Deterministic - stable ordering required
 * - Integer-only numeric outputs
 * - Club-isolated - no cross-club data
 */

import { TableId, HandId } from '../../security/AuditLog';
import { ClubId } from '../../club/ClubTypes';
import {
  ClubRevenueView,
  TimeGranularity,
  calculateTimeBucket,
  ClubRevenueEntry,
} from '../../ledger/views';

import {
  ReportResult,
  ReportTimeWindow,
  ClubRevenueReportQuery,
  ClubRevenueReportData,
  ClubRevenuePeriod,
  ClubRevenueByTable,
  createReportMetadata,
} from './ReportTypes';

// ============================================================================
// Club Revenue Report Generator
// ============================================================================

/**
 * Generates club revenue reports from view data
 *
 * This class consumes ClubRevenueView outputs only.
 * It never modifies any ledger state.
 */
export class ClubRevenueReport {
  private readonly view: ClubRevenueView;

  constructor(view: ClubRevenueView) {
    this.view = view;
  }

  // ==========================================================================
  // Report Generation
  // ==========================================================================

  /**
   * Generate club revenue report
   */
  generate(query: ClubRevenueReportQuery): ReportResult<ClubRevenueReportData> {
    const metadata = createReportMetadata('CLUB_REVENUE', query.timeWindow);

    try {
      // Get summary from view
      const viewResult = this.view.getSummary({
        clubId: query.clubId,
        timeWindow: {
          fromTimestamp: query.timeWindow.fromTimestamp,
          toTimestamp: query.timeWindow.toTimestamp,
        },
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
        clubId: query.clubId,
        timeWindow: {
          fromTimestamp: query.timeWindow.fromTimestamp,
          toTimestamp: query.timeWindow.toTimestamp,
        },
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

      // Build table breakdown if requested
      let tableBreakdown: ClubRevenueByTable[] | undefined;
      if (query.includeTableBreakdown) {
        tableBreakdown = this.buildTableBreakdown(entries);
      }

      const reportData: ClubRevenueReportData = {
        clubId: query.clubId,
        totalRevenue: viewData.totalRevenue,
        totalRake: viewData.totalRake,
        totalTimeFees: viewData.totalTimeFees,
        totalOther: viewData.totalOther,
        totalEntries: viewData.entryCount,
        handCount: viewData.handCount,
        tableCount: viewData.tableIds.length,
        periodBreakdown,
        tableBreakdown,
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
   * Get quick total revenue for a club
   */
  getTotalRevenue(clubId: ClubId, timeWindow: ReportTimeWindow): number {
    return this.view.getTotalRevenue(clubId, {
      fromTimestamp: timeWindow.fromTimestamp,
      toTimestamp: timeWindow.toTimestamp,
    });
  }

  /**
   * Get rake vs time fee breakdown
   */
  getRevenueBreakdown(
    clubId: ClubId,
    timeWindow: ReportTimeWindow
  ): { rake: number; timeFees: number; other: number } {
    const rake = this.view.getRakeRevenue(clubId, {
      fromTimestamp: timeWindow.fromTimestamp,
      toTimestamp: timeWindow.toTimestamp,
    });

    const timeFees = this.view.getTimeFeeRevenue(clubId, {
      fromTimestamp: timeWindow.fromTimestamp,
      toTimestamp: timeWindow.toTimestamp,
    });

    const total = this.view.getTotalRevenue(clubId, {
      fromTimestamp: timeWindow.fromTimestamp,
      toTimestamp: timeWindow.toTimestamp,
    });

    return {
      rake,
      timeFees,
      other: total - rake - timeFees,
    };
  }

  // ==========================================================================
  // Internal Methods
  // ==========================================================================

  /**
   * Build period breakdown from entries
   */
  private buildPeriodBreakdown(
    entries: readonly ClubRevenueEntry[],
    granularity: TimeGranularity
  ): ClubRevenuePeriod[] {
    const buckets = new Map<string, {
      periodStart: number;
      periodEnd: number;
      totalRevenue: number;
      rakeRevenue: number;
      timeFeeRevenue: number;
      otherRevenue: number;
    }>();

    for (const entry of entries) {
      const { bucketKey, bucket } = calculateTimeBucket(entry.timestamp, granularity);

      const existing = buckets.get(bucketKey) ?? {
        periodStart: bucket.bucketStart,
        periodEnd: bucket.bucketEnd,
        totalRevenue: 0,
        rakeRevenue: 0,
        timeFeeRevenue: 0,
        otherRevenue: 0,
      };

      existing.totalRevenue += entry.amount;

      // Categorize by source
      if (entry.source === 'TIME_FEE') {
        existing.timeFeeRevenue += entry.amount;
      } else if (entry.source === 'HAND_SETTLEMENT' && this.isRakeCategory(entry.category)) {
        existing.rakeRevenue += entry.amount;
      } else {
        existing.otherRevenue += entry.amount;
      }

      buckets.set(bucketKey, existing);
    }

    // Convert to array and sort deterministically
    const result: ClubRevenuePeriod[] = [];

    for (const [periodKey, data] of buckets.entries()) {
      result.push({
        periodKey,
        periodStart: data.periodStart,
        periodEnd: data.periodEnd,
        totalRevenue: data.totalRevenue,
        rakeRevenue: data.rakeRevenue,
        timeFeeRevenue: data.timeFeeRevenue,
        otherRevenue: data.otherRevenue,
      });
    }

    // Sort by period key for deterministic ordering
    result.sort((a, b) => a.periodKey.localeCompare(b.periodKey));

    return result;
  }

  /**
   * Build table breakdown from entries
   */
  private buildTableBreakdown(
    entries: readonly ClubRevenueEntry[]
  ): ClubRevenueByTable[] {
    const tables = new Map<TableId, {
      totalRevenue: number;
      rakeRevenue: number;
      timeFeeRevenue: number;
      hands: Set<string>;
    }>();

    for (const entry of entries) {
      if (!entry.tableId) continue;

      const existing = tables.get(entry.tableId) ?? {
        totalRevenue: 0,
        rakeRevenue: 0,
        timeFeeRevenue: 0,
        hands: new Set<string>(),
      };

      existing.totalRevenue += entry.amount;

      // Categorize by source
      if (entry.source === 'TIME_FEE') {
        existing.timeFeeRevenue += entry.amount;
      } else if (entry.source === 'HAND_SETTLEMENT' && this.isRakeCategory(entry.category)) {
        existing.rakeRevenue += entry.amount;
      }

      if (entry.handId) {
        existing.hands.add(entry.handId);
      }

      tables.set(entry.tableId, existing);
    }

    // Convert to array and sort deterministically
    const result: ClubRevenueByTable[] = [];

    for (const [tableId, data] of tables.entries()) {
      result.push({
        tableId,
        totalRevenue: data.totalRevenue,
        rakeRevenue: data.rakeRevenue,
        timeFeeRevenue: data.timeFeeRevenue,
        handCount: data.hands.size,
      });
    }

    // Sort by table ID for deterministic ordering
    result.sort((a, b) => a.tableId.localeCompare(b.tableId));

    return result;
  }

  /**
   * Check if category is a rake category
   */
  private isRakeCategory(category?: string): boolean {
    return category === 'RAKE' || category === 'RAKE_SHARE_CLUB';
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createClubRevenueReport(
  view: ClubRevenueView
): ClubRevenueReport {
  return new ClubRevenueReport(view);
}
