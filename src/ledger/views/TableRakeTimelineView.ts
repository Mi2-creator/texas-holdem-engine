/**
 * TableRakeTimelineView.ts
 * Phase 26 - Table Rake Timeline View (read-only)
 *
 * Time-ordered rake attribution per table.
 * Links entries to handId / stateVersion.
 * Supports replay comparison.
 *
 * HARD CONSTRAINTS:
 * - Read-only - no mutations to ledger
 * - Pure functions - no side effects
 * - Deterministic - same input produces identical output
 * - Integer-based - all numeric outputs are integers
 * - Replay-safe - supports comparison for verification
 */

import { TableId, HandId } from '../../security/AuditLog';
import { ClubId } from '../../club/ClubTypes';
import { StateVersion } from '../../sync/SyncTypes';
import {
  LedgerEntry,
  AgentId,
  HandSettlementCategory,
} from '../LedgerTypes';
import { ValueLedger } from '../LedgerEntry';

import {
  TimeWindow,
  TableRakeTimelineQuery,
  RakeTimelineEntry,
  RakeBreakdown,
  TableRakeTimeline,
  TimelineComparisonResult,
  TimelineDifference,
  ViewResult,
  isWithinTimeWindow,
  normalizeTimeWindow,
} from './RevenueViewTypes';

// ============================================================================
// Table Rake Timeline View Implementation
// ============================================================================

/**
 * Read-only view for table rake timeline
 *
 * This view produces a time-ordered sequence of rake entries for a table,
 * linked to handId and stateVersion for replay verification.
 */
export class TableRakeTimelineView {
  private readonly ledger: ValueLedger;

  constructor(ledger: ValueLedger) {
    this.ledger = ledger;
  }

  // ==========================================================================
  // Query Methods
  // ==========================================================================

  /**
   * Get rake timeline for a table
   */
  getTimeline(query: TableRakeTimelineQuery): ViewResult<TableRakeTimeline> {
    const queryTimestamp = Date.now();
    const timeWindow = normalizeTimeWindow(query.timeWindow);

    try {
      const { entries, clubId } = this.getRakeEntries(
        query.tableId,
        timeWindow,
        query.includeBreakdown ?? false,
        query.limit,
        query.offset
      );

      // Get unique hand IDs
      const handIds = new Set<HandId>();
      for (const entry of entries) {
        if (entry.handId) {
          handIds.add(entry.handId);
        }
      }

      const timeline: TableRakeTimeline = {
        tableId: query.tableId,
        clubId: clubId ?? ('' as ClubId),
        entries,
        totalRake: entries.reduce((sum, e) => sum + e.rakeAmount, 0),
        handCount: handIds.size,
        timeWindow,
        queryTimestamp,
      };

      return {
        success: true,
        data: timeline,
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
   * Get rake entries for a specific hand
   */
  getHandRake(tableId: TableId, handId: HandId): ViewResult<RakeTimelineEntry | undefined> {
    const queryTimestamp = Date.now();

    try {
      const allEntries = this.ledger.getAllEntries();
      const handEntries: LedgerEntry[] = [];

      for (const entry of allEntries) {
        if (
          entry.tableId === tableId &&
          entry.handId === handId &&
          this.isRakeEntry(entry)
        ) {
          handEntries.push(entry);
        }
      }

      if (handEntries.length === 0) {
        return {
          success: true,
          data: undefined,
          queryTimestamp,
          entriesScanned: this.ledger.getStatistics().entryCount,
        };
      }

      const rakeEntry = this.buildRakeEntry(handEntries, true);

      return {
        success: true,
        data: rakeEntry,
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
   * Get total rake for a table
   */
  getTotalRake(tableId: TableId, timeWindow?: TimeWindow): number {
    const { entries } = this.getRakeEntries(
      tableId,
      normalizeTimeWindow(timeWindow),
      false,
      undefined,
      undefined
    );

    return entries.reduce((sum, e) => sum + e.rakeAmount, 0);
  }

  /**
   * Get rake by hand for a table
   */
  getRakeByHand(
    tableId: TableId,
    timeWindow?: TimeWindow
  ): ReadonlyMap<HandId, number> {
    const { entries } = this.getRakeEntries(
      tableId,
      normalizeTimeWindow(timeWindow),
      false,
      undefined,
      undefined
    );

    const byHand = new Map<HandId, number>();

    for (const entry of entries) {
      if (entry.handId) {
        const current = byHand.get(entry.handId) ?? 0;
        byHand.set(entry.handId, current + entry.rakeAmount);
      }
    }

    return byHand;
  }

  /**
   * Compare two timelines for replay verification
   */
  compareTimelines(
    timeline1: TableRakeTimeline,
    timeline2: TableRakeTimeline
  ): TimelineComparisonResult {
    const differences: TimelineDifference[] = [];

    // Check basic properties
    if (timeline1.tableId !== timeline2.tableId) {
      differences.push({
        index: -1,
        field: 'tableId',
        expected: timeline1.tableId,
        actual: timeline2.tableId,
      });
    }

    if (timeline1.entries.length !== timeline2.entries.length) {
      differences.push({
        index: -1,
        field: 'entryCount',
        expected: timeline1.entries.length,
        actual: timeline2.entries.length,
      });
    }

    // Compare entries
    const minLength = Math.min(timeline1.entries.length, timeline2.entries.length);
    let matchingEntries = 0;
    let firstDifferenceAt: number | undefined;

    for (let i = 0; i < minLength; i++) {
      const entry1 = timeline1.entries[i];
      const entry2 = timeline2.entries[i];

      const entryDiffs = this.compareEntries(entry1, entry2, i);

      if (entryDiffs.length > 0) {
        if (firstDifferenceAt === undefined) {
          firstDifferenceAt = i;
        }
        differences.push(...entryDiffs);
      } else {
        matchingEntries++;
      }
    }

    return {
      matches: differences.length === 0,
      entryCount: timeline1.entries.length,
      matchingEntries,
      firstDifferenceAt,
      differences,
    };
  }

  /**
   * Verify timeline matches ledger data (replay verification)
   */
  verifyTimeline(timeline: TableRakeTimeline): TimelineComparisonResult {
    const currentResult = this.getTimeline({
      tableId: timeline.tableId,
      timeWindow: timeline.timeWindow,
      includeBreakdown: true,
    });

    if (!currentResult.success || !currentResult.data) {
      return {
        matches: false,
        entryCount: timeline.entries.length,
        matchingEntries: 0,
        differences: [{
          index: -1,
          field: 'data',
          expected: 'valid timeline',
          actual: 'query failed',
        }],
      };
    }

    return this.compareTimelines(timeline, currentResult.data);
  }

  // ==========================================================================
  // Internal Methods
  // ==========================================================================

  /**
   * Get all rake entries for a table
   */
  private getRakeEntries(
    tableId: TableId,
    timeWindow: TimeWindow,
    includeBreakdown: boolean,
    limit?: number,
    offset?: number
  ): { entries: readonly RakeTimelineEntry[]; clubId?: ClubId } {
    const allEntries = this.ledger.getAllEntries();

    // Group entries by hand
    const entriesByHand = new Map<HandId, LedgerEntry[]>();
    let clubId: ClubId | undefined;

    for (const entry of allEntries) {
      // Filter: must be for this table
      if (entry.tableId !== tableId) {
        continue;
      }

      // Filter: must be within time window
      if (!isWithinTimeWindow(entry.timestamp, timeWindow)) {
        continue;
      }

      // Filter: must be a rake-related entry
      if (!this.isRakeEntry(entry)) {
        continue;
      }

      // Track club ID
      if (entry.clubId && !clubId) {
        clubId = entry.clubId;
      }

      const handId = entry.handId;
      if (!handId) continue;

      const handEntries = entriesByHand.get(handId) ?? [];
      handEntries.push(entry);
      entriesByHand.set(handId, handEntries);
    }

    // Build rake timeline entries
    const result: RakeTimelineEntry[] = [];

    for (const [handId, handEntries] of entriesByHand.entries()) {
      const rakeEntry = this.buildRakeEntry(handEntries, includeBreakdown);
      result.push(rakeEntry);
    }

    // Sort by timestamp, then by handId for deterministic ordering
    result.sort((a, b) => {
      if (a.timestamp !== b.timestamp) {
        return a.timestamp - b.timestamp;
      }
      return (a.handId ?? '').localeCompare(b.handId ?? '');
    });

    // Apply pagination
    const startIndex = offset ?? 0;
    const endIndex = limit ? startIndex + limit : result.length;
    const paginatedResult = result.slice(startIndex, endIndex);

    return { entries: paginatedResult, clubId };
  }

  /**
   * Build a rake timeline entry from hand entries
   */
  private buildRakeEntry(
    handEntries: readonly LedgerEntry[],
    includeBreakdown: boolean
  ): RakeTimelineEntry {
    // Find the main rake entry (RAKE category)
    let totalRake = 0;
    let timestamp = 0;
    let handId: HandId | undefined;
    let stateVersion: StateVersion | undefined;
    let entryId = handEntries[0]?.entryId ?? ('' as any);

    // Breakdown components
    let clubShare = 0;
    let agentShare = 0;
    let platformShare = 0;
    let agentId: AgentId | undefined;

    for (const entry of handEntries) {
      // Track metadata from first entry
      if (!timestamp || entry.timestamp < timestamp) {
        timestamp = entry.timestamp;
        handId = entry.handId;
        stateVersion = entry.stateVersion;
        entryId = entry.entryId;
      }

      // Accumulate based on category
      switch (entry.category) {
        case 'RAKE':
          totalRake += entry.delta;
          break;
        case 'RAKE_SHARE_CLUB':
          clubShare += entry.delta;
          break;
        case 'RAKE_SHARE_AGENT':
          agentShare += entry.delta;
          if (entry.affectedParty.agentId) {
            agentId = entry.affectedParty.agentId;
          }
          break;
        case 'RAKE_SHARE_PLATFORM':
          platformShare += entry.delta;
          break;
      }
    }

    // If we have breakdown entries but no RAKE entry, use breakdown sum
    if (totalRake === 0 && (clubShare > 0 || platformShare > 0)) {
      totalRake = clubShare + agentShare + platformShare;
    }

    const result: RakeTimelineEntry = {
      entryId,
      timestamp,
      handId,
      stateVersion: stateVersion!,
      rakeAmount: totalRake,
    };

    if (includeBreakdown && (clubShare > 0 || agentShare > 0 || platformShare > 0)) {
      return {
        ...result,
        breakdown: {
          clubShare,
          agentShare,
          platformShare,
          agentId,
        },
      };
    }

    return result;
  }

  /**
   * Check if entry is a rake-related entry
   */
  private isRakeEntry(entry: LedgerEntry): boolean {
    if (entry.source !== 'HAND_SETTLEMENT') {
      return false;
    }

    const rakeCategories: HandSettlementCategory[] = [
      'RAKE',
      'RAKE_SHARE_CLUB',
      'RAKE_SHARE_AGENT',
      'RAKE_SHARE_PLATFORM',
    ];

    return entry.category !== undefined && rakeCategories.includes(entry.category);
  }

  /**
   * Compare two timeline entries
   */
  private compareEntries(
    entry1: RakeTimelineEntry,
    entry2: RakeTimelineEntry,
    index: number
  ): TimelineDifference[] {
    const differences: TimelineDifference[] = [];

    if (entry1.handId !== entry2.handId) {
      differences.push({
        index,
        field: 'handId',
        expected: entry1.handId,
        actual: entry2.handId,
      });
    }

    if (entry1.rakeAmount !== entry2.rakeAmount) {
      differences.push({
        index,
        field: 'rakeAmount',
        expected: entry1.rakeAmount,
        actual: entry2.rakeAmount,
      });
    }

    if (entry1.stateVersion !== entry2.stateVersion) {
      differences.push({
        index,
        field: 'stateVersion',
        expected: entry1.stateVersion,
        actual: entry2.stateVersion,
      });
    }

    // Compare breakdowns if both have them
    if (entry1.breakdown && entry2.breakdown) {
      if (entry1.breakdown.clubShare !== entry2.breakdown.clubShare) {
        differences.push({
          index,
          field: 'breakdown.clubShare',
          expected: entry1.breakdown.clubShare,
          actual: entry2.breakdown.clubShare,
        });
      }

      if (entry1.breakdown.agentShare !== entry2.breakdown.agentShare) {
        differences.push({
          index,
          field: 'breakdown.agentShare',
          expected: entry1.breakdown.agentShare,
          actual: entry2.breakdown.agentShare,
        });
      }

      if (entry1.breakdown.platformShare !== entry2.breakdown.platformShare) {
        differences.push({
          index,
          field: 'breakdown.platformShare',
          expected: entry1.breakdown.platformShare,
          actual: entry2.breakdown.platformShare,
        });
      }
    } else if (entry1.breakdown !== entry2.breakdown) {
      differences.push({
        index,
        field: 'breakdown',
        expected: entry1.breakdown ? 'present' : 'absent',
        actual: entry2.breakdown ? 'present' : 'absent',
      });
    }

    return differences;
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createTableRakeTimelineView(ledger: ValueLedger): TableRakeTimelineView {
  return new TableRakeTimelineView(ledger);
}
