/**
 * ClubRevenueView.ts
 * Phase 26 - Club Revenue Attribution View (read-only)
 *
 * Aggregates CLUB-attributed ledger entries.
 * Supports per-club, per-table, per-period views.
 * No cross-club aggregation leakage.
 *
 * HARD CONSTRAINTS:
 * - Read-only - no mutations to ledger
 * - Pure functions - no side effects
 * - Deterministic - same input produces identical output
 * - Integer-based - all numeric outputs are integers
 * - Club-isolated - no cross-club data exposure
 */

import { TableId, HandId } from '../../security/AuditLog';
import { ClubId } from '../../club/ClubTypes';
import {
  LedgerEntry,
  AttributionSource,
  HandSettlementCategory,
} from '../LedgerTypes';
import { ValueLedger } from '../LedgerEntry';

import {
  TimeWindow,
  TimeGranularity,
  ClubRevenueQuery,
  ClubRevenueEntry,
  ClubRevenueGroup,
  ClubRevenueSummary,
  ViewResult,
  calculateTimeBucket,
  isWithinTimeWindow,
  normalizeTimeWindow,
} from './RevenueViewTypes';

// ============================================================================
// Club Revenue View Implementation
// ============================================================================

/**
 * Read-only view for club revenue attribution
 *
 * This view consumes LedgerEntry objects and produces aggregated
 * club revenue data. It never modifies the ledger.
 *
 * IMPORTANT: This view is club-isolated - it only returns data
 * for the specified club, never exposing other clubs' data.
 */
export class ClubRevenueView {
  private readonly ledger: ValueLedger;

  constructor(ledger: ValueLedger) {
    this.ledger = ledger;
  }

  // ==========================================================================
  // Query Methods
  // ==========================================================================

  /**
   * Get club revenue summary
   */
  getSummary(query: ClubRevenueQuery): ViewResult<ClubRevenueSummary> {
    const queryTimestamp = Date.now();
    const timeWindow = normalizeTimeWindow(query.timeWindow);

    try {
      const entries = this.getClubEntries(
        query.clubId,
        timeWindow,
        query.tableId,
        query.source
      );

      const groups = this.groupEntries(
        entries,
        query.groupBy,
        query.timeGranularity
      );

      // Calculate revenue by type
      const { totalRake, totalTimeFees, totalOther } = this.categorizeRevenue(entries);

      // Get unique hand IDs and table IDs
      const handIds = new Set<HandId>();
      const tableIds = new Set<TableId>();

      for (const entry of entries) {
        if (entry.handId) {
          handIds.add(entry.handId);
        }
        if (entry.tableId) {
          tableIds.add(entry.tableId);
        }
      }

      const summary: ClubRevenueSummary = {
        clubId: query.clubId,
        totalRevenue: entries.reduce((sum, e) => sum + e.amount, 0),
        totalRake,
        totalTimeFees,
        totalOther,
        entryCount: entries.length,
        handCount: handIds.size,
        tableIds: Array.from(tableIds).sort(),
        groups,
        timeWindow,
        queryTimestamp,
      };

      return {
        success: true,
        data: summary,
        queryTimestamp,
        entriesScanned: this.ledger.getStatistics().entryCount,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        queryTimestamp,
        entriesScanned: 0,
      };
    }
  }

  /**
   * Get club entries within filters
   */
  getEntries(query: ClubRevenueQuery): ViewResult<readonly ClubRevenueEntry[]> {
    const queryTimestamp = Date.now();
    const timeWindow = normalizeTimeWindow(query.timeWindow);

    try {
      const entries = this.getClubEntries(
        query.clubId,
        timeWindow,
        query.tableId,
        query.source
      );

      return {
        success: true,
        data: entries,
        queryTimestamp,
        entriesScanned: this.ledger.getStatistics().entryCount,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        queryTimestamp,
        entriesScanned: 0,
      };
    }
  }

  /**
   * Get total club revenue for a time window
   */
  getTotalRevenue(clubId: ClubId, timeWindow?: TimeWindow): number {
    const entries = this.getClubEntries(
      clubId,
      normalizeTimeWindow(timeWindow),
      undefined,
      undefined
    );
    return entries.reduce((sum, e) => sum + e.amount, 0);
  }

  /**
   * Get club revenue by table (for a specific club only)
   */
  getRevenueByTable(
    clubId: ClubId,
    timeWindow?: TimeWindow
  ): ReadonlyMap<TableId, number> {
    const entries = this.getClubEntries(
      clubId,
      normalizeTimeWindow(timeWindow),
      undefined,
      undefined
    );

    const byTable = new Map<TableId, number>();

    for (const entry of entries) {
      if (entry.tableId) {
        const current = byTable.get(entry.tableId) ?? 0;
        byTable.set(entry.tableId, current + entry.amount);
      }
    }

    return byTable;
  }

  /**
   * Get club revenue by source type
   */
  getRevenueBySource(
    clubId: ClubId,
    timeWindow?: TimeWindow
  ): ReadonlyMap<AttributionSource, number> {
    const entries = this.getClubEntries(
      clubId,
      normalizeTimeWindow(timeWindow),
      undefined,
      undefined
    );

    const bySource = new Map<AttributionSource, number>();

    for (const entry of entries) {
      const current = bySource.get(entry.source) ?? 0;
      bySource.set(entry.source, current + entry.amount);
    }

    return bySource;
  }

  /**
   * Get club revenue timeline
   */
  getTimeline(
    clubId: ClubId,
    granularity: TimeGranularity,
    timeWindow?: TimeWindow
  ): ReadonlyMap<string, number> {
    const entries = this.getClubEntries(
      clubId,
      normalizeTimeWindow(timeWindow),
      undefined,
      undefined
    );

    const timeline = new Map<string, number>();

    for (const entry of entries) {
      const { bucketKey } = calculateTimeBucket(entry.timestamp, granularity);
      const current = timeline.get(bucketKey) ?? 0;
      timeline.set(bucketKey, current + entry.amount);
    }

    return timeline;
  }

  /**
   * Get rake-only revenue (excludes time fees, adjustments, etc.)
   */
  getRakeRevenue(clubId: ClubId, timeWindow?: TimeWindow): number {
    const entries = this.getClubEntries(
      clubId,
      normalizeTimeWindow(timeWindow),
      undefined,
      'HAND_SETTLEMENT'
    );

    let total = 0;
    for (const entry of entries) {
      if (this.isRakeCategory(entry.category)) {
        total += entry.amount;
      }
    }

    return total;
  }

  /**
   * Get time fee revenue
   */
  getTimeFeeRevenue(clubId: ClubId, timeWindow?: TimeWindow): number {
    const entries = this.getClubEntries(
      clubId,
      normalizeTimeWindow(timeWindow),
      undefined,
      'TIME_FEE'
    );

    return entries.reduce((sum, e) => sum + e.amount, 0);
  }

  // ==========================================================================
  // Internal Methods
  // ==========================================================================

  /**
   * Get all club-attributed entries within filters
   * NOTE: Only returns entries for the specified club - no cross-club data
   */
  private getClubEntries(
    clubId: ClubId,
    timeWindow: TimeWindow,
    tableId?: TableId,
    source?: AttributionSource
  ): readonly ClubRevenueEntry[] {
    const allEntries = this.ledger.getAllEntries();
    const result: ClubRevenueEntry[] = [];

    for (const entry of allEntries) {
      // Filter: must be CLUB party type
      if (entry.affectedParty.partyType !== 'CLUB') {
        continue;
      }

      // Filter: must match the specific club ID
      if (entry.affectedParty.clubId !== clubId) {
        continue;
      }

      // Filter: must be within time window
      if (!isWithinTimeWindow(entry.timestamp, timeWindow)) {
        continue;
      }

      // Filter: table if specified
      if (tableId && entry.tableId !== tableId) {
        continue;
      }

      // Filter: source if specified
      if (source && entry.source !== source) {
        continue;
      }

      result.push(this.toRevenueEntry(entry));
    }

    // Sort by timestamp for deterministic ordering
    result.sort((a, b) => a.timestamp - b.timestamp || a.entryId.localeCompare(b.entryId));

    return result;
  }

  /**
   * Convert ledger entry to club revenue entry
   */
  private toRevenueEntry(entry: LedgerEntry): ClubRevenueEntry {
    return {
      entryId: entry.entryId,
      timestamp: entry.timestamp,
      source: entry.source,
      category: entry.category,
      amount: entry.delta,
      tableId: entry.tableId,
      handId: entry.handId,
      stateVersion: entry.stateVersion,
    };
  }

  /**
   * Group entries by specified grouping
   */
  private groupEntries(
    entries: readonly ClubRevenueEntry[],
    groupBy?: 'TABLE' | 'SOURCE' | 'TIME',
    timeGranularity?: TimeGranularity
  ): readonly ClubRevenueGroup[] {
    if (!groupBy) {
      return [];
    }

    const groups = new Map<string, {
      entries: ClubRevenueEntry[];
      totalRevenue: number;
      fromTimestamp: number;
      toTimestamp: number;
    }>();

    for (const entry of entries) {
      let groupKey: string;

      switch (groupBy) {
        case 'TABLE':
          groupKey = entry.tableId ?? 'unknown';
          break;
        case 'SOURCE':
          groupKey = entry.source;
          break;
        case 'TIME':
          const granularity = timeGranularity ?? 'DAY';
          groupKey = calculateTimeBucket(entry.timestamp, granularity).bucketKey;
          break;
      }

      const group = groups.get(groupKey) ?? {
        entries: [],
        totalRevenue: 0,
        fromTimestamp: entry.timestamp,
        toTimestamp: entry.timestamp,
      };

      group.entries.push(entry);
      group.totalRevenue += entry.amount;
      group.fromTimestamp = Math.min(group.fromTimestamp, entry.timestamp);
      group.toTimestamp = Math.max(group.toTimestamp, entry.timestamp);

      groups.set(groupKey, group);
    }

    const result: ClubRevenueGroup[] = [];

    for (const [groupKey, group] of groups.entries()) {
      result.push({
        groupKey,
        groupType: groupBy,
        totalRevenue: group.totalRevenue,
        entryCount: group.entries.length,
        entries: group.entries,
        fromTimestamp: group.fromTimestamp,
        toTimestamp: group.toTimestamp,
      });
    }

    // Sort groups deterministically
    result.sort((a, b) => a.groupKey.localeCompare(b.groupKey));

    return result;
  }

  /**
   * Categorize revenue by type
   */
  private categorizeRevenue(entries: readonly ClubRevenueEntry[]): {
    totalRake: number;
    totalTimeFees: number;
    totalOther: number;
  } {
    let totalRake = 0;
    let totalTimeFees = 0;
    let totalOther = 0;

    for (const entry of entries) {
      if (entry.source === 'TIME_FEE') {
        totalTimeFees += entry.amount;
      } else if (entry.source === 'HAND_SETTLEMENT' && this.isRakeCategory(entry.category)) {
        totalRake += entry.amount;
      } else {
        totalOther += entry.amount;
      }
    }

    return { totalRake, totalTimeFees, totalOther };
  }

  /**
   * Check if category is a rake category
   */
  private isRakeCategory(category?: HandSettlementCategory): boolean {
    return category === 'RAKE' || category === 'RAKE_SHARE_CLUB';
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createClubRevenueView(ledger: ValueLedger): ClubRevenueView {
  return new ClubRevenueView(ledger);
}
