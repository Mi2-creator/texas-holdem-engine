/**
 * AgentCommissionReport.ts
 * Phase 27 - Agent Commission Reporting (read-only)
 *
 * Generates agent commission reports from AgentCommissionView.
 * Direct attribution only - no recursive commission math.
 *
 * HARD CONSTRAINTS:
 * - Read-only - consumes view data only
 * - Pure functions - no side effects
 * - Deterministic - stable ordering required
 * - Integer-only numeric outputs
 * - Direct attribution only - no recursive calculations
 */

import { ClubId } from '../../club/ClubTypes';
import {
  AgentCommissionView,
  TimeGranularity,
  calculateTimeBucket,
  AgentCommissionEntry,
} from '../../ledger/views';
import { AgentId } from '../../ledger/LedgerTypes';

import {
  ReportResult,
  ReportTimeWindow,
  AgentCommissionReportQuery,
  AgentCommissionReportData,
  AgentCommissionSummary,
  AgentCommissionPeriod,
  AgentCommissionByClub,
  createReportMetadata,
} from './ReportTypes';

// ============================================================================
// Agent Commission Report Generator
// ============================================================================

/**
 * Generates agent commission reports from view data
 *
 * This class consumes AgentCommissionView outputs only.
 * It never modifies any ledger state.
 *
 * IMPORTANT: This report only includes direct attribution.
 * No recursive commission calculations are performed.
 */
export class AgentCommissionReport {
  private readonly view: AgentCommissionView;

  constructor(view: AgentCommissionView) {
    this.view = view;
  }

  // ==========================================================================
  // Report Generation
  // ==========================================================================

  /**
   * Generate agent commission report
   *
   * If agentId is provided, generates report for single agent.
   * Otherwise, generates rollup of all agents.
   */
  generate(query: AgentCommissionReportQuery): ReportResult<AgentCommissionReportData> {
    const metadata = createReportMetadata('AGENT_COMMISSION', query.timeWindow);

    try {
      if (query.agentId) {
        // Single agent report
        return this.generateSingleAgentReport(query, metadata);
      } else {
        // All agents rollup
        return this.generateRollupReport(query, metadata);
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        metadata,
      };
    }
  }

  /**
   * Get quick total commission for an agent
   */
  getTotalCommission(agentId: AgentId, timeWindow: ReportTimeWindow): number {
    return this.view.getTotalCommission(agentId, {
      fromTimestamp: timeWindow.fromTimestamp,
      toTimestamp: timeWindow.toTimestamp,
    });
  }

  /**
   * Get commission by club for an agent
   */
  getCommissionByClub(
    agentId: AgentId,
    timeWindow: ReportTimeWindow
  ): ReadonlyMap<ClubId, number> {
    return this.view.getCommissionByClub(agentId, {
      fromTimestamp: timeWindow.fromTimestamp,
      toTimestamp: timeWindow.toTimestamp,
    });
  }

  /**
   * Get list of all agents with commission
   */
  getAgentIds(timeWindow: ReportTimeWindow): readonly AgentId[] {
    return this.view.getAgentIds({
      fromTimestamp: timeWindow.fromTimestamp,
      toTimestamp: timeWindow.toTimestamp,
    });
  }

  // ==========================================================================
  // Internal Methods
  // ==========================================================================

  /**
   * Generate report for a single agent
   */
  private generateSingleAgentReport(
    query: AgentCommissionReportQuery,
    metadata: ReturnType<typeof createReportMetadata>
  ): ReportResult<AgentCommissionReportData> {
    const agentId = query.agentId!;

    // Get summary from view
    const viewResult = this.view.getSummary({
      agentId,
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
      agentId,
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

    // Build club breakdown if requested
    let clubBreakdown: AgentCommissionByClub[] | undefined;
    if (query.includeClubBreakdown) {
      clubBreakdown = this.buildClubBreakdown(entries);
    }

    const agentSummary: AgentCommissionSummary = {
      agentId,
      totalCommission: viewData.totalCommission,
      entryCount: viewData.entryCount,
      clubCount: viewData.clubIds.length,
      periodBreakdown,
      clubBreakdown,
    };

    const reportData: AgentCommissionReportData = {
      totalCommission: viewData.totalCommission,
      totalEntries: viewData.entryCount,
      agentCount: 1,
      agents: [agentSummary],
    };

    return {
      success: true,
      data: reportData,
      metadata,
    };
  }

  /**
   * Generate rollup report for all agents
   */
  private generateRollupReport(
    query: AgentCommissionReportQuery,
    metadata: ReturnType<typeof createReportMetadata>
  ): ReportResult<AgentCommissionReportData> {
    // Get rollup from view
    const rollupResult = this.view.getRollup({
      fromTimestamp: query.timeWindow.fromTimestamp,
      toTimestamp: query.timeWindow.toTimestamp,
    });

    if (!rollupResult.success || !rollupResult.data) {
      return {
        success: false,
        error: rollupResult.error ?? 'Failed to get rollup data',
        metadata,
      };
    }

    const rollupData = rollupResult.data;

    // Build agent summaries with period breakdowns
    const agents: AgentCommissionSummary[] = [];

    for (const agentSummary of rollupData.agents) {
      // Get entries for this agent for period breakdown
      const entriesResult = this.view.getEntries({
        agentId: agentSummary.agentId,
        timeWindow: {
          fromTimestamp: query.timeWindow.fromTimestamp,
          toTimestamp: query.timeWindow.toTimestamp,
        },
      });

      const entries = entriesResult.success && entriesResult.data ? entriesResult.data : [];

      // Build period breakdown
      const periodBreakdown = this.buildPeriodBreakdown(
        entries,
        query.granularity ?? 'DAY'
      );

      // Build club breakdown if requested
      let clubBreakdown: AgentCommissionByClub[] | undefined;
      if (query.includeClubBreakdown) {
        clubBreakdown = this.buildClubBreakdown(entries);
      }

      agents.push({
        agentId: agentSummary.agentId,
        totalCommission: agentSummary.totalCommission,
        entryCount: agentSummary.entryCount,
        clubCount: agentSummary.clubIds.length,
        periodBreakdown,
        clubBreakdown,
      });
    }

    // Sort agents deterministically
    agents.sort((a, b) => a.agentId.localeCompare(b.agentId));

    const reportData: AgentCommissionReportData = {
      totalCommission: rollupData.totalCommission,
      totalEntries: agents.reduce((sum, a) => sum + a.entryCount, 0),
      agentCount: rollupData.agentCount,
      agents,
    };

    return {
      success: true,
      data: reportData,
      metadata,
    };
  }

  /**
   * Build period breakdown from entries
   */
  private buildPeriodBreakdown(
    entries: readonly AgentCommissionEntry[],
    granularity: TimeGranularity
  ): AgentCommissionPeriod[] {
    const buckets = new Map<string, {
      periodStart: number;
      periodEnd: number;
      totalCommission: number;
      entryCount: number;
    }>();

    for (const entry of entries) {
      const { bucketKey, bucket } = calculateTimeBucket(entry.timestamp, granularity);

      const existing = buckets.get(bucketKey) ?? {
        periodStart: bucket.bucketStart,
        periodEnd: bucket.bucketEnd,
        totalCommission: 0,
        entryCount: 0,
      };

      existing.totalCommission += entry.amount;
      existing.entryCount += 1;

      buckets.set(bucketKey, existing);
    }

    // Convert to array and sort deterministically
    const result: AgentCommissionPeriod[] = [];

    for (const [periodKey, data] of buckets.entries()) {
      result.push({
        periodKey,
        periodStart: data.periodStart,
        periodEnd: data.periodEnd,
        totalCommission: data.totalCommission,
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
    entries: readonly AgentCommissionEntry[]
  ): AgentCommissionByClub[] {
    const clubs = new Map<ClubId, {
      totalCommission: number;
      entryCount: number;
    }>();

    for (const entry of entries) {
      if (!entry.clubId) continue;

      const existing = clubs.get(entry.clubId) ?? {
        totalCommission: 0,
        entryCount: 0,
      };

      existing.totalCommission += entry.amount;
      existing.entryCount += 1;

      clubs.set(entry.clubId, existing);
    }

    // Convert to array and sort deterministically
    const result: AgentCommissionByClub[] = [];

    for (const [clubId, data] of clubs.entries()) {
      result.push({
        clubId,
        totalCommission: data.totalCommission,
        entryCount: data.entryCount,
      });
    }

    // Sort by club ID for deterministic ordering
    result.sort((a, b) => a.clubId.localeCompare(b.clubId));

    return result;
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createAgentCommissionReport(
  view: AgentCommissionView
): AgentCommissionReport {
  return new AgentCommissionReport(view);
}
