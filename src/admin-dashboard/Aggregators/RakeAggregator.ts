/**
 * RakeAggregator.ts
 * Phase 30 - Admin & Club Financial Dashboard (Read-Only)
 *
 * Aggregates ledger entries to produce platform-level rake summaries.
 *
 * AGGREGATES:
 * - Total platform rake revenue
 * - Total rake collected (all parties)
 * - Breakdown by club
 * - Breakdown by source (hand settlement, time fee, etc.)
 * - Unique player and club counts
 *
 * HARD CONSTRAINTS:
 * - Pure functions only
 * - No side effects
 * - No external system access
 * - Deterministic results
 * - Revenue = rake ONLY (credits are NOT revenue)
 */

import { PlayerId } from '../../security/Identity';
import { ClubId } from '../../club/ClubTypes';
import { AttributionSource } from '../../ledger/LedgerTypes';
import {
  PlatformFinanceSummary,
  ClubRakeSummary,
  DashboardTimeRange,
  AggregationEntry,
  emptyPlatformFinanceSummary,
  isInTimeRange,
} from '../types';

// ============================================================================
// Aggregation Context
// ============================================================================

/**
 * Internal tracking for club rake
 */
interface ClubRakeContext {
  totalRake: number;
  platformShare: number;
  clubShare: number;
  handsPlayed: Set<string>;
}

/**
 * Internal tracking for platform aggregation
 */
interface PlatformAggregationContext {
  totalRakeRevenue: number;
  totalRakeCollected: number;
  totalCreditsIssued: number;
  clubs: Map<ClubId, ClubRakeContext>;
  players: Set<PlayerId>;
  handsPlayed: Set<string>;
  totalPotVolume: number;
  bySource: Record<AttributionSource, number>;
}

/**
 * Create empty platform aggregation context
 */
function createPlatformContext(): PlatformAggregationContext {
  return {
    totalRakeRevenue: 0,
    totalRakeCollected: 0,
    totalCreditsIssued: 0,
    clubs: new Map(),
    players: new Set(),
    handsPlayed: new Set(),
    totalPotVolume: 0,
    bySource: {
      HAND_SETTLEMENT: 0,
      TIME_FEE: 0,
      TOURNAMENT_PAYOUT: 0,
      REBUY: 0,
      ADJUSTMENT: 0,
      BONUS: 0,
      TOP_UP: 0,
    },
  };
}

/**
 * Create empty club rake context
 */
function createClubRakeContext(): ClubRakeContext {
  return {
    totalRake: 0,
    platformShare: 0,
    clubShare: 0,
    handsPlayed: new Set(),
  };
}

// ============================================================================
// Entry Classification
// ============================================================================

/**
 * Check if entry is platform rake revenue
 */
function isPlatformRakeRevenue(entry: AggregationEntry): boolean {
  return entry.partyType === 'PLATFORM' && entry.delta > 0 && entry.source === 'HAND_SETTLEMENT';
}

/**
 * Check if entry is club rake share
 */
function isClubRakeShare(entry: AggregationEntry): boolean {
  return entry.partyType === 'CLUB' && entry.delta > 0 && entry.source === 'HAND_SETTLEMENT';
}

/**
 * Check if entry is a credit (NOT revenue)
 */
function isCredit(entry: AggregationEntry): boolean {
  return entry.source === 'TOP_UP' || entry.source === 'BONUS';
}

// ============================================================================
// Platform Aggregation
// ============================================================================

/**
 * Aggregate all entries for platform-level summary
 *
 * Pure function: given entries, produces a platform summary.
 * Does NOT access any external systems.
 *
 * KEY INVARIANT: Revenue = Rake ONLY
 * Credits are tracked but NOT counted as revenue.
 */
export function aggregatePlatformEntries(
  entries: readonly AggregationEntry[],
  timeRange: DashboardTimeRange
): PlatformFinanceSummary {
  const context = createPlatformContext();

  // Process all entries within time range
  for (const entry of entries) {
    // Skip if outside time range
    if (!isInTimeRange(entry.timestamp, timeRange)) continue;

    // Track players
    if (entry.playerId) {
      context.players.add(entry.playerId);
    }

    // Track hands
    if (entry.handId) {
      context.handsPlayed.add(entry.handId);
    }

    // Track by source (only positive entries for source breakdown)
    if (entry.delta > 0) {
      context.bySource[entry.source] += entry.delta;
    }

    // Aggregate platform rake revenue
    if (isPlatformRakeRevenue(entry)) {
      context.totalRakeRevenue += entry.delta;
      context.totalRakeCollected += entry.delta;

      // Track by club
      if (entry.clubId) {
        let clubCtx = context.clubs.get(entry.clubId);
        if (!clubCtx) {
          clubCtx = createClubRakeContext();
          context.clubs.set(entry.clubId, clubCtx);
        }
        clubCtx.platformShare += entry.delta;
        clubCtx.totalRake += entry.delta;
        if (entry.handId) {
          clubCtx.handsPlayed.add(entry.handId);
        }
      }
    }

    // Track club rake share (for total rake collected)
    if (isClubRakeShare(entry)) {
      context.totalRakeCollected += entry.delta;

      // Track by club
      if (entry.clubId) {
        let clubCtx = context.clubs.get(entry.clubId);
        if (!clubCtx) {
          clubCtx = createClubRakeContext();
          context.clubs.set(entry.clubId, clubCtx);
        }
        clubCtx.clubShare += entry.delta;
        clubCtx.totalRake += entry.delta;
        if (entry.handId) {
          clubCtx.handsPlayed.add(entry.handId);
        }
      }
    }

    // Track credits issued (NOT revenue)
    if (isCredit(entry) && entry.partyType === 'PLAYER' && entry.delta > 0) {
      context.totalCreditsIssued += entry.delta;
    }

    // Track pot volume (from hand settlement player losses)
    if (entry.source === 'HAND_SETTLEMENT' && entry.partyType === 'PLAYER' && entry.delta < 0) {
      context.totalPotVolume += Math.abs(entry.delta);
    }
  }

  // Build club rake summaries
  const byClub = new Map<ClubId, ClubRakeSummary>();
  for (const [clubId, clubCtx] of context.clubs) {
    byClub.set(clubId, {
      clubId,
      totalRake: clubCtx.totalRake,
      platformShare: clubCtx.platformShare,
      clubShare: clubCtx.clubShare,
      handsPlayed: clubCtx.handsPlayed.size,
    });
  }

  return {
    timeRange,
    totalRakeRevenue: context.totalRakeRevenue,
    totalRakeCollected: context.totalRakeCollected,
    totalCreditsIssued: context.totalCreditsIssued,
    activeClubs: context.clubs.size,
    uniquePlayers: context.players.size,
    handsPlayed: context.handsPlayed.size,
    totalPotVolume: context.totalPotVolume,
    byClub,
    bySource: context.bySource,
  };
}

// ============================================================================
// Derived Metrics
// ============================================================================

/**
 * Calculate rake rate (rake / pot volume)
 */
export function calculateRakeRate(summary: PlatformFinanceSummary): number {
  if (summary.totalPotVolume === 0) return 0;
  return summary.totalRakeCollected / summary.totalPotVolume;
}

/**
 * Calculate average rake per hand
 */
export function calculateAverageRakePerHand(summary: PlatformFinanceSummary): number {
  if (summary.handsPlayed === 0) return 0;
  return Math.floor(summary.totalRakeCollected / summary.handsPlayed);
}

/**
 * Calculate platform's share percentage
 */
export function calculatePlatformSharePercentage(summary: PlatformFinanceSummary): number {
  if (summary.totalRakeCollected === 0) return 0;
  return summary.totalRakeRevenue / summary.totalRakeCollected;
}

/**
 * Calculate average pot size
 */
export function calculateAveragePotSize(summary: PlatformFinanceSummary): number {
  if (summary.handsPlayed === 0) return 0;
  return Math.floor(summary.totalPotVolume / summary.handsPlayed);
}

// ============================================================================
// Time Series Aggregation
// ============================================================================

/**
 * Aggregate by hour for time series visualization
 */
export function aggregateByHour(
  entries: readonly AggregationEntry[],
  timeRange: DashboardTimeRange
): Map<number, PlatformFinanceSummary> {
  const hourMs = 60 * 60 * 1000;
  const results = new Map<number, PlatformFinanceSummary>();

  // Get all unique hours in range
  const hourBuckets = new Set<number>();
  for (const entry of entries) {
    if (isInTimeRange(entry.timestamp, timeRange)) {
      const hourBucket = Math.floor(entry.timestamp / hourMs) * hourMs;
      hourBuckets.add(hourBucket);
    }
  }

  // Aggregate for each hour
  for (const hourBucket of hourBuckets) {
    const hourRange: DashboardTimeRange = {
      fromTimestamp: hourBucket,
      toTimestamp: hourBucket + hourMs - 1,
    };
    results.set(hourBucket, aggregatePlatformEntries(entries, hourRange));
  }

  return results;
}

/**
 * Aggregate by day for time series visualization
 */
export function aggregateByDay(
  entries: readonly AggregationEntry[],
  timeRange: DashboardTimeRange
): Map<number, PlatformFinanceSummary> {
  const dayMs = 24 * 60 * 60 * 1000;
  const results = new Map<number, PlatformFinanceSummary>();

  // Get all unique days in range
  const dayBuckets = new Set<number>();
  for (const entry of entries) {
    if (isInTimeRange(entry.timestamp, timeRange)) {
      const dayBucket = Math.floor(entry.timestamp / dayMs) * dayMs;
      dayBuckets.add(dayBucket);
    }
  }

  // Aggregate for each day
  for (const dayBucket of dayBuckets) {
    const dayRange: DashboardTimeRange = {
      fromTimestamp: dayBucket,
      toTimestamp: dayBucket + dayMs - 1,
    };
    results.set(dayBucket, aggregatePlatformEntries(entries, dayRange));
  }

  return results;
}
