/**
 * TableSessionReport.ts
 * Phase 27 - Table Session Reporting (read-only)
 *
 * Generates per-table session reports from TableRakeTimelineView.
 * Links to handId and stateVersion for replay verification.
 *
 * HARD CONSTRAINTS:
 * - Read-only - consumes view data only
 * - Pure functions - no side effects
 * - Deterministic - stable ordering required
 * - Integer-only numeric outputs
 */

import { TableId, HandId } from '../../security/AuditLog';
import { ClubId } from '../../club/ClubTypes';
import { StateVersion } from '../../sync/SyncTypes';
import {
  TableRakeTimelineView,
  RakeTimelineEntry,
  TableRakeTimeline,
  TimelineComparisonResult,
} from '../../ledger/views';
import { AgentId } from '../../ledger/LedgerTypes';

import {
  ReportResult,
  ReportTimeWindow,
  TableSessionReportQuery,
  TableSessionReportData,
  TableSessionSummary,
  HandRakeDetail,
  ReportPagination,
  createReportMetadata,
  integerAverage,
} from './ReportTypes';

// ============================================================================
// Table Session Report Generator
// ============================================================================

/**
 * Generates table session reports from view data
 *
 * This class consumes TableRakeTimelineView outputs only.
 * It never modifies any ledger state.
 */
export class TableSessionReport {
  private readonly view: TableRakeTimelineView;

  constructor(view: TableRakeTimelineView) {
    this.view = view;
  }

  // ==========================================================================
  // Report Generation
  // ==========================================================================

  /**
   * Generate table session report
   */
  generate(query: TableSessionReportQuery): ReportResult<TableSessionReportData> {
    const metadata = createReportMetadata('TABLE_SESSION', query.timeWindow);

    try {
      // Get timeline from view
      const timelineResult = this.view.getTimeline({
        tableId: query.tableId,
        timeWindow: {
          fromTimestamp: query.timeWindow.fromTimestamp,
          toTimestamp: query.timeWindow.toTimestamp,
        },
        includeBreakdown: query.includeHandDetails ?? false,
        limit: query.limit,
        offset: query.offset,
      });

      if (!timelineResult.success || !timelineResult.data) {
        return {
          success: false,
          error: timelineResult.error ?? 'Failed to get timeline data',
          metadata,
        };
      }

      const timeline = timelineResult.data;

      // Build summary
      const summary = this.buildSummary(timeline);

      // Build hand details if requested
      let hands: HandRakeDetail[] | undefined;
      if (query.includeHandDetails) {
        hands = this.buildHandDetails(timeline.entries);
      }

      // Build pagination info
      let pagination: ReportPagination | undefined;
      if (query.limit !== undefined) {
        // Get total count without pagination
        const fullTimelineResult = this.view.getTimeline({
          tableId: query.tableId,
          timeWindow: {
            fromTimestamp: query.timeWindow.fromTimestamp,
            toTimestamp: query.timeWindow.toTimestamp,
          },
        });

        const totalCount = fullTimelineResult.success && fullTimelineResult.data
          ? fullTimelineResult.data.entries.length
          : timeline.entries.length;

        pagination = {
          offset: query.offset ?? 0,
          limit: query.limit,
          totalCount,
          hasMore: (query.offset ?? 0) + timeline.entries.length < totalCount,
        };
      }

      const reportData: TableSessionReportData = {
        summary,
        hands,
        pagination,
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
   * Get quick summary for a table
   */
  getSummary(tableId: TableId, timeWindow: ReportTimeWindow): TableSessionSummary | undefined {
    const timelineResult = this.view.getTimeline({
      tableId,
      timeWindow: {
        fromTimestamp: timeWindow.fromTimestamp,
        toTimestamp: timeWindow.toTimestamp,
      },
    });

    if (!timelineResult.success || !timelineResult.data) {
      return undefined;
    }

    return this.buildSummary(timelineResult.data);
  }

  /**
   * Get total rake for a table
   */
  getTotalRake(tableId: TableId, timeWindow: ReportTimeWindow): number {
    return this.view.getTotalRake(tableId, {
      fromTimestamp: timeWindow.fromTimestamp,
      toTimestamp: timeWindow.toTimestamp,
    });
  }

  /**
   * Get rake by hand map
   */
  getRakeByHand(tableId: TableId, timeWindow: ReportTimeWindow): ReadonlyMap<HandId, number> {
    return this.view.getRakeByHand(tableId, {
      fromTimestamp: timeWindow.fromTimestamp,
      toTimestamp: timeWindow.toTimestamp,
    });
  }

  /**
   * Verify report data against current ledger state (replay verification)
   */
  verifyReport(
    reportData: TableSessionReportData,
    tableId: TableId
  ): TimelineComparisonResult {
    // Build a timeline from report data
    const reportTimeline: TableRakeTimeline = {
      tableId,
      clubId: reportData.summary.clubId,
      entries: reportData.hands?.map(h => ({
        entryId: '' as any,  // Not used in comparison
        timestamp: h.timestamp,
        handId: h.handId,
        stateVersion: h.stateVersion,
        rakeAmount: h.rakeAmount,
        breakdown: {
          clubShare: h.clubShare,
          agentShare: h.agentShare,
          platformShare: h.platformShare,
          agentId: h.agentId,
        },
      })) ?? [],
      totalRake: reportData.summary.totalRake,
      handCount: reportData.summary.handCount,
      timeWindow: {
        fromTimestamp: reportData.summary.firstHandAt,
        toTimestamp: reportData.summary.lastHandAt,
      },
      queryTimestamp: Date.now(),
    };

    return this.view.verifyTimeline(reportTimeline);
  }

  // ==========================================================================
  // Internal Methods
  // ==========================================================================

  /**
   * Build session summary from timeline
   */
  private buildSummary(timeline: TableRakeTimeline): TableSessionSummary {
    let firstHandAt = 0;
    let lastHandAt = 0;

    if (timeline.entries.length > 0) {
      firstHandAt = timeline.entries[0].timestamp;
      lastHandAt = timeline.entries[timeline.entries.length - 1].timestamp;
    }

    return {
      tableId: timeline.tableId,
      clubId: timeline.clubId,
      totalRake: timeline.totalRake,
      handCount: timeline.handCount,
      avgRakePerHand: integerAverage(timeline.totalRake, timeline.handCount),
      firstHandAt,
      lastHandAt,
    };
  }

  /**
   * Build hand details from timeline entries
   */
  private buildHandDetails(entries: readonly RakeTimelineEntry[]): HandRakeDetail[] {
    const hands: HandRakeDetail[] = [];

    for (const entry of entries) {
      if (!entry.handId) continue;

      hands.push({
        handId: entry.handId,
        timestamp: entry.timestamp,
        stateVersion: entry.stateVersion,
        rakeAmount: entry.rakeAmount,
        clubShare: entry.breakdown?.clubShare ?? 0,
        agentShare: entry.breakdown?.agentShare ?? 0,
        platformShare: entry.breakdown?.platformShare ?? 0,
        agentId: entry.breakdown?.agentId,
      });
    }

    // Already sorted by timestamp from view
    return hands;
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createTableSessionReport(
  view: TableRakeTimelineView
): TableSessionReport {
  return new TableSessionReport(view);
}
