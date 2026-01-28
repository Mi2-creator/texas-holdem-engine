/**
 * RevenueViewTypes.ts
 * Phase 26 - Revenue Attribution Views (read-only)
 *
 * Type definitions for read-only revenue and attribution views.
 * These views derive all data from existing ledger entries.
 *
 * HARD CONSTRAINTS:
 * - Read-only views only - no mutations
 * - All outputs derived from LedgerEntry objects
 * - No inference or invented values
 * - Integer-based numeric outputs
 * - Deterministic and replay-safe
 */

import { PlayerId } from '../../security/Identity';
import { TableId, HandId } from '../../security/AuditLog';
import { ClubId } from '../../club/ClubTypes';
import { StateVersion } from '../../sync/SyncTypes';
import {
  LedgerEntryId,
  LedgerBatchId,
  AgentId,
  AttributionSource,
  HandSettlementCategory,
} from '../LedgerTypes';

// ============================================================================
// Time Window Types
// ============================================================================

/**
 * Time window for aggregation queries
 */
export interface TimeWindow {
  readonly fromTimestamp: number;
  readonly toTimestamp: number;
}

/**
 * Granularity for time-based aggregations
 */
export type TimeGranularity = 'HOUR' | 'DAY' | 'WEEK' | 'MONTH';

/**
 * A time bucket for timeline views
 */
export interface TimeBucket {
  readonly bucketStart: number;
  readonly bucketEnd: number;
  readonly granularity: TimeGranularity;
}

// ============================================================================
// Platform Revenue View Types
// ============================================================================

/**
 * Query parameters for platform revenue view
 */
export interface PlatformRevenueQuery {
  readonly timeWindow?: TimeWindow;
  readonly groupBy?: 'TABLE' | 'CLUB' | 'TIME';
  readonly timeGranularity?: TimeGranularity;
  readonly clubId?: ClubId;
  readonly tableId?: TableId;
}

/**
 * Single platform revenue entry (derived from ledger)
 */
export interface PlatformRevenueEntry {
  readonly entryId: LedgerEntryId;
  readonly timestamp: number;
  readonly source: AttributionSource;
  readonly category?: HandSettlementCategory;
  readonly amount: number;
  readonly tableId?: TableId;
  readonly handId?: HandId;
  readonly clubId?: ClubId;
  readonly stateVersion: StateVersion;
}

/**
 * Platform revenue aggregated by grouping key
 */
export interface PlatformRevenueGroup {
  readonly groupKey: string;  // tableId, clubId, or time bucket
  readonly groupType: 'TABLE' | 'CLUB' | 'TIME';
  readonly totalRevenue: number;
  readonly entryCount: number;
  readonly entries: readonly PlatformRevenueEntry[];
  readonly fromTimestamp: number;
  readonly toTimestamp: number;
}

/**
 * Platform revenue summary
 */
export interface PlatformRevenueSummary {
  readonly platformId: string;
  readonly totalRevenue: number;
  readonly entryCount: number;
  readonly bySource: Readonly<Record<AttributionSource, number>>;
  readonly groups: readonly PlatformRevenueGroup[];
  readonly timeWindow: TimeWindow;
  readonly queryTimestamp: number;
}

// ============================================================================
// Club Revenue View Types
// ============================================================================

/**
 * Query parameters for club revenue view
 */
export interface ClubRevenueQuery {
  readonly clubId: ClubId;
  readonly timeWindow?: TimeWindow;
  readonly groupBy?: 'TABLE' | 'SOURCE' | 'TIME';
  readonly timeGranularity?: TimeGranularity;
  readonly tableId?: TableId;
  readonly source?: AttributionSource;
}

/**
 * Single club revenue entry (derived from ledger)
 */
export interface ClubRevenueEntry {
  readonly entryId: LedgerEntryId;
  readonly timestamp: number;
  readonly source: AttributionSource;
  readonly category?: HandSettlementCategory;
  readonly amount: number;
  readonly tableId?: TableId;
  readonly handId?: HandId;
  readonly stateVersion: StateVersion;
}

/**
 * Club revenue aggregated by grouping key
 */
export interface ClubRevenueGroup {
  readonly groupKey: string;
  readonly groupType: 'TABLE' | 'SOURCE' | 'TIME';
  readonly totalRevenue: number;
  readonly entryCount: number;
  readonly entries: readonly ClubRevenueEntry[];
  readonly fromTimestamp: number;
  readonly toTimestamp: number;
}

/**
 * Club revenue summary (isolated per club - no cross-club data)
 */
export interface ClubRevenueSummary {
  readonly clubId: ClubId;
  readonly totalRevenue: number;
  readonly totalRake: number;
  readonly totalTimeFees: number;
  readonly totalOther: number;
  readonly entryCount: number;
  readonly handCount: number;
  readonly tableIds: readonly TableId[];
  readonly groups: readonly ClubRevenueGroup[];
  readonly timeWindow: TimeWindow;
  readonly queryTimestamp: number;
}

// ============================================================================
// Agent Commission View Types
// ============================================================================

/**
 * Query parameters for agent commission view
 */
export interface AgentCommissionQuery {
  readonly agentId?: AgentId;
  readonly timeWindow?: TimeWindow;
  readonly groupBy?: 'CLUB' | 'TABLE' | 'TIME';
  readonly timeGranularity?: TimeGranularity;
  readonly clubId?: ClubId;
}

/**
 * Single agent commission entry (derived from ledger)
 */
export interface AgentCommissionEntry {
  readonly entryId: LedgerEntryId;
  readonly timestamp: number;
  readonly amount: number;
  readonly clubId?: ClubId;
  readonly tableId?: TableId;
  readonly handId?: HandId;
  readonly stateVersion: StateVersion;
}

/**
 * Agent commission aggregated by grouping key
 */
export interface AgentCommissionGroup {
  readonly groupKey: string;
  readonly groupType: 'CLUB' | 'TABLE' | 'TIME';
  readonly totalCommission: number;
  readonly entryCount: number;
  readonly entries: readonly AgentCommissionEntry[];
  readonly fromTimestamp: number;
  readonly toTimestamp: number;
}

/**
 * Agent commission summary (direct attribution only, no recursive math)
 */
export interface AgentCommissionSummary {
  readonly agentId: AgentId;
  readonly totalCommission: number;
  readonly entryCount: number;
  readonly clubIds: readonly ClubId[];
  readonly groups: readonly AgentCommissionGroup[];
  readonly timeWindow: TimeWindow;
  readonly queryTimestamp: number;
}

/**
 * Multi-agent rollup (aggregates all agents, direct values only)
 */
export interface AgentCommissionRollup {
  readonly agents: readonly AgentCommissionSummary[];
  readonly totalCommission: number;
  readonly agentCount: number;
  readonly timeWindow: TimeWindow;
  readonly queryTimestamp: number;
}

// ============================================================================
// Table Rake Timeline View Types
// ============================================================================

/**
 * Query parameters for table rake timeline
 */
export interface TableRakeTimelineQuery {
  readonly tableId: TableId;
  readonly timeWindow?: TimeWindow;
  readonly includeBreakdown?: boolean;
  readonly limit?: number;
  readonly offset?: number;
}

/**
 * Single rake entry in the timeline
 */
export interface RakeTimelineEntry {
  readonly entryId: LedgerEntryId;
  readonly timestamp: number;
  readonly handId?: HandId;
  readonly stateVersion: StateVersion;
  readonly rakeAmount: number;
  readonly breakdown?: RakeBreakdown;
}

/**
 * Breakdown of rake distribution for a single hand
 */
export interface RakeBreakdown {
  readonly clubShare: number;
  readonly agentShare: number;
  readonly platformShare: number;
  readonly agentId?: AgentId;
}

/**
 * Table rake timeline result
 */
export interface TableRakeTimeline {
  readonly tableId: TableId;
  readonly clubId: ClubId;
  readonly entries: readonly RakeTimelineEntry[];
  readonly totalRake: number;
  readonly handCount: number;
  readonly timeWindow: TimeWindow;
  readonly queryTimestamp: number;
}

/**
 * Comparison result for replay verification
 */
export interface TimelineComparisonResult {
  readonly matches: boolean;
  readonly entryCount: number;
  readonly matchingEntries: number;
  readonly firstDifferenceAt?: number;
  readonly differences: readonly TimelineDifference[];
}

/**
 * Single difference in timeline comparison
 */
export interface TimelineDifference {
  readonly index: number;
  readonly field: string;
  readonly expected: unknown;
  readonly actual: unknown;
}

// ============================================================================
// View Result Types
// ============================================================================

/**
 * Generic view result wrapper
 */
export interface ViewResult<T> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: string;
  readonly queryTimestamp: number;
  readonly entriesScanned: number;
}

/**
 * Pagination info for large result sets
 */
export interface PaginationInfo {
  readonly offset: number;
  readonly limit: number;
  readonly totalCount: number;
  readonly hasMore: boolean;
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Time bucket calculation result
 */
export interface TimeBucketResult {
  readonly bucket: TimeBucket;
  readonly bucketKey: string;
}

/**
 * Calculate time bucket for a timestamp
 */
export function calculateTimeBucket(
  timestamp: number,
  granularity: TimeGranularity
): TimeBucketResult {
  const date = new Date(timestamp);
  let bucketStart: Date;
  let bucketEnd: Date;
  let bucketKey: string;

  switch (granularity) {
    case 'HOUR':
      bucketStart = new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours());
      bucketEnd = new Date(bucketStart.getTime() + 60 * 60 * 1000);
      bucketKey = bucketStart.toISOString().slice(0, 13);
      break;

    case 'DAY':
      bucketStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      bucketEnd = new Date(bucketStart.getTime() + 24 * 60 * 60 * 1000);
      bucketKey = bucketStart.toISOString().slice(0, 10);
      break;

    case 'WEEK':
      const dayOfWeek = date.getDay();
      const startOfWeek = new Date(date.getFullYear(), date.getMonth(), date.getDate() - dayOfWeek);
      bucketStart = startOfWeek;
      bucketEnd = new Date(startOfWeek.getTime() + 7 * 24 * 60 * 60 * 1000);
      bucketKey = `W${bucketStart.toISOString().slice(0, 10)}`;
      break;

    case 'MONTH':
      bucketStart = new Date(date.getFullYear(), date.getMonth(), 1);
      bucketEnd = new Date(date.getFullYear(), date.getMonth() + 1, 1);
      bucketKey = bucketStart.toISOString().slice(0, 7);
      break;
  }

  return {
    bucket: {
      bucketStart: bucketStart.getTime(),
      bucketEnd: bucketEnd.getTime(),
      granularity,
    },
    bucketKey,
  };
}

/**
 * Check if timestamp is within time window
 */
export function isWithinTimeWindow(
  timestamp: number,
  window: TimeWindow | undefined
): boolean {
  if (!window) {
    return true;
  }
  return timestamp >= window.fromTimestamp && timestamp <= window.toTimestamp;
}

/**
 * Create default time window (all time)
 */
export function createDefaultTimeWindow(): TimeWindow {
  return {
    fromTimestamp: 0,
    toTimestamp: Number.MAX_SAFE_INTEGER,
  };
}

/**
 * Normalize time window (handle undefined)
 */
export function normalizeTimeWindow(window?: TimeWindow): TimeWindow {
  return window ?? createDefaultTimeWindow();
}
