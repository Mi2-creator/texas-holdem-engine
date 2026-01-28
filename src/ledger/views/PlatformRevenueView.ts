/**
 * PlatformRevenueView.ts
 * Phase 26 - Platform Revenue Attribution View (read-only)
 *
 * Aggregates PLATFORM-attributed ledger entries.
 * Supports grouping by time window, table, club.
 * Computes totals, counts, and timelines.
 *
 * HARD CONSTRAINTS:
 * - Read-only - no mutations to ledger
 * - Pure functions - no side effects
 * - Deterministic - same input produces identical output
 * - Integer-based - all numeric outputs are integers
 */

import { TableId, HandId } from '../../security/AuditLog';
import { ClubId } from '../../club/ClubTypes';
import {
  LedgerEntry,
  AttributionSource,
} from '../LedgerTypes';
import { ValueLedger } from '../LedgerEntry';

import {
  TimeWindow,
  TimeGranularity,
  PlatformRevenueQuery,
  PlatformRevenueEntry,
  PlatformRevenueGroup,
  PlatformRevenueSummary,
  ViewResult,
  calculateTimeBucket,
  isWithinTimeWindow,
  normalizeTimeWindow,
} from './RevenueViewTypes';

// ============================================================================
// Platform Revenue View Implementation
// ============================================================================

/**
 * Read-only view for platform revenue attribution
 *
 * This view consumes LedgerEntry objects and produces aggregated
 * platform revenue data. It never modifies the ledger.
 */
export class PlatformRevenueView {
  private readonly ledger: ValueLedger;
  private readonly platformId: string;

  constructor(ledger: ValueLedger, platformId: string = 'platform') {
    this.ledger = ledger;
    this.platformId = platformId;
  }

  // ==========================================================================
  // Query Methods
  // ==========================================================================

  /**
   * Get platform revenue summary
   */
  getSummary(query: PlatformRevenueQuery = {}): ViewResult<PlatformRevenueSummary> {
    const queryTimestamp = Date.now();
    const timeWindow = normalizeTimeWindow(query.timeWindow);

    try {
      const entries = this.getPlatformEntries(timeWindow, query.clubId, query.tableId);
      const groups = this.groupEntries(entries, query.groupBy, query.timeGranularity);
      const bySource = this.aggregateBySource(entries);

      const summary: PlatformRevenueSummary = {
        platformId: this.platformId,
        totalRevenue: entries.reduce((sum, e) => sum + e.amount, 0),
        entryCount: entries.length,
        bySource,
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
   * Get platform entries within time window
   */
  getEntries(query: PlatformRevenueQuery = {}): ViewResult<readonly PlatformRevenueEntry[]> {
    const queryTimestamp = Date.now();
    const timeWindow = normalizeTimeWindow(query.timeWindow);

    try {
      const entries = this.getPlatformEntries(timeWindow, query.clubId, query.tableId);

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
   * Get total platform revenue for a time window
   */
  getTotalRevenue(timeWindow?: TimeWindow): number {
    const entries = this.getPlatformEntries(
      normalizeTimeWindow(timeWindow),
      undefined,
      undefined
    );
    return entries.reduce((sum, e) => sum + e.amount, 0);
  }

  /**
   * Get platform revenue grouped by club
   */
  getRevenueByClub(timeWindow?: TimeWindow): ReadonlyMap<ClubId, number> {
    const entries = this.getPlatformEntries(
      normalizeTimeWindow(timeWindow),
      undefined,
      undefined
    );

    const byClub = new Map<ClubId, number>();

    for (const entry of entries) {
      if (entry.clubId) {
        const current = byClub.get(entry.clubId) ?? 0;
        byClub.set(entry.clubId, current + entry.amount);
      }
    }

    return byClub;
  }

  /**
   * Get platform revenue grouped by table
   */
  getRevenueByTable(timeWindow?: TimeWindow): ReadonlyMap<TableId, number> {
    const entries = this.getPlatformEntries(
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
   * Get platform revenue timeline
   */
  getTimeline(
    granularity: TimeGranularity,
    timeWindow?: TimeWindow
  ): ReadonlyMap<string, number> {
    const entries = this.getPlatformEntries(
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

  // ==========================================================================
  // Internal Methods
  // ==========================================================================

  /**
   * Get all platform-attributed entries within filters
   */
  private getPlatformEntries(
    timeWindow: TimeWindow,
    clubId?: ClubId,
    tableId?: TableId
  ): readonly PlatformRevenueEntry[] {
    const allEntries = this.ledger.getAllEntries();
    const result: PlatformRevenueEntry[] = [];

    for (const entry of allEntries) {
      // Filter: must be PLATFORM party type
      if (entry.affectedParty.partyType !== 'PLATFORM') {
        continue;
      }

      // Filter: must be within time window
      if (!isWithinTimeWindow(entry.timestamp, timeWindow)) {
        continue;
      }

      // Filter: club if specified
      if (clubId && entry.clubId !== clubId) {
        continue;
      }

      // Filter: table if specified
      if (tableId && entry.tableId !== tableId) {
        continue;
      }

      result.push(this.toRevenueEntry(entry));
    }

    // Sort by timestamp for deterministic ordering
    result.sort((a, b) => a.timestamp - b.timestamp || a.entryId.localeCompare(b.entryId));

    return result;
  }

  /**
   * Convert ledger entry to platform revenue entry
   */
  private toRevenueEntry(entry: LedgerEntry): PlatformRevenueEntry {
    return {
      entryId: entry.entryId,
      timestamp: entry.timestamp,
      source: entry.source,
      category: entry.category,
      amount: entry.delta,
      tableId: entry.tableId,
      handId: entry.handId,
      clubId: entry.clubId,
      stateVersion: entry.stateVersion,
    };
  }

  /**
   * Group entries by specified grouping
   */
  private groupEntries(
    entries: readonly PlatformRevenueEntry[],
    groupBy?: 'TABLE' | 'CLUB' | 'TIME',
    timeGranularity?: TimeGranularity
  ): readonly PlatformRevenueGroup[] {
    if (!groupBy) {
      return [];
    }

    const groups = new Map<string, {
      entries: PlatformRevenueEntry[];
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
        case 'CLUB':
          groupKey = entry.clubId ?? 'unknown';
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

    const result: PlatformRevenueGroup[] = [];

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
   * Aggregate entries by source
   */
  private aggregateBySource(
    entries: readonly PlatformRevenueEntry[]
  ): Readonly<Record<AttributionSource, number>> {
    const bySource: Record<AttributionSource, number> = {
      HAND_SETTLEMENT: 0,
      TIME_FEE: 0,
      TOURNAMENT_PAYOUT: 0,
      REBUY: 0,
      ADJUSTMENT: 0,
      BONUS: 0,
      TOP_UP: 0,
    };

    for (const entry of entries) {
      bySource[entry.source] += entry.amount;
    }

    return bySource;
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createPlatformRevenueView(
  ledger: ValueLedger,
  platformId?: string
): PlatformRevenueView {
  return new PlatformRevenueView(ledger, platformId);
}
