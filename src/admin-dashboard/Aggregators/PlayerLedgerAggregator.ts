/**
 * PlayerLedgerAggregator.ts
 * Phase 30 - Admin & Club Financial Dashboard (Read-Only)
 *
 * Aggregates ledger entries to produce player finance summaries.
 *
 * AGGREGATES:
 * - Total chips in (winnings + credits)
 * - Total chips out (losses + rake contribution)
 * - Net position
 * - Credits vs winnings split
 * - Breakdown by club
 *
 * HARD CONSTRAINTS:
 * - Pure functions only
 * - No side effects
 * - No external system access
 * - Deterministic results
 */

import { PlayerId } from '../../security/Identity';
import { ClubId } from '../../club/ClubTypes';
import {
  PlayerFinanceSummary,
  DashboardTimeRange,
  AggregationEntry,
  emptyPlayerFinanceSummary,
  isInTimeRange,
} from '../types';
import { AttributionPartyType } from '../../ledger/LedgerTypes';

// ============================================================================
// Aggregation Context
// ============================================================================

/**
 * Internal tracking for player aggregation
 */
interface PlayerAggregationContext {
  totalChipsIn: number;
  chipsFromWinnings: number;
  chipsFromCredits: number;
  totalChipsOut: number;
  chipsToLosses: number;
  chipsToRake: number;
  handsPlayed: Set<string>;
  tablesPlayed: Set<string>;
  byClub: Map<ClubId, number>;
}

/**
 * Create empty aggregation context
 */
function createContext(): PlayerAggregationContext {
  return {
    totalChipsIn: 0,
    chipsFromWinnings: 0,
    chipsFromCredits: 0,
    totalChipsOut: 0,
    chipsToLosses: 0,
    chipsToRake: 0,
    handsPlayed: new Set(),
    tablesPlayed: new Set(),
    byClub: new Map(),
  };
}

// ============================================================================
// Entry Classification
// ============================================================================

/**
 * Check if entry represents chips coming in to player
 */
function isChipsIn(entry: AggregationEntry): boolean {
  return entry.delta > 0 && entry.partyType === 'PLAYER';
}

/**
 * Check if entry represents chips going out from player
 */
function isChipsOut(entry: AggregationEntry): boolean {
  return entry.delta < 0 && entry.partyType === 'PLAYER';
}

/**
 * Check if entry is a winning (from hand settlement)
 */
function isWinning(entry: AggregationEntry): boolean {
  return entry.source === 'HAND_SETTLEMENT' && entry.delta > 0;
}

/**
 * Check if entry is a credit (from top-up or admin credit)
 */
function isCredit(entry: AggregationEntry): boolean {
  return (entry.source === 'TOP_UP' || entry.source === 'BONUS') && entry.delta > 0;
}

/**
 * Check if entry is a loss (from hand settlement)
 */
function isLoss(entry: AggregationEntry): boolean {
  return entry.source === 'HAND_SETTLEMENT' && entry.delta < 0;
}

// ============================================================================
// Single Player Aggregation
// ============================================================================

/**
 * Aggregate entries for a single player
 *
 * Pure function: given entries, produces a summary.
 * Does NOT access any external systems.
 */
export function aggregatePlayerEntries(
  playerId: PlayerId,
  entries: readonly AggregationEntry[],
  timeRange: DashboardTimeRange
): PlayerFinanceSummary {
  const context = createContext();

  // Filter and process entries for this player within time range
  for (const entry of entries) {
    // Skip if not for this player
    if (entry.playerId !== playerId) continue;

    // Skip if outside time range
    if (!isInTimeRange(entry.timestamp, timeRange)) continue;

    // Track hands and tables
    if (entry.handId) {
      context.handsPlayed.add(entry.handId);
    }
    if (entry.tableId) {
      context.tablesPlayed.add(entry.tableId);
    }

    // Aggregate chips in
    if (isChipsIn(entry)) {
      context.totalChipsIn += entry.delta;

      if (isWinning(entry)) {
        context.chipsFromWinnings += entry.delta;
      } else if (isCredit(entry)) {
        context.chipsFromCredits += entry.delta;
      }
    }

    // Aggregate chips out
    if (isChipsOut(entry)) {
      const amount = Math.abs(entry.delta);
      context.totalChipsOut += amount;

      if (isLoss(entry)) {
        context.chipsToLosses += amount;
      }
    }

    // Track by club
    if (entry.clubId) {
      const current = context.byClub.get(entry.clubId) ?? 0;
      context.byClub.set(entry.clubId, current + entry.delta);
    }
  }

  // Calculate rake contribution (indirect, via pot)
  // Rake is tracked separately on PLATFORM entries, but we can estimate
  // player contribution based on losses that went to rake
  context.chipsToRake = 0; // Will be calculated from rake entries if needed

  return {
    playerId,
    timeRange,
    totalChipsIn: context.totalChipsIn,
    chipsFromWinnings: context.chipsFromWinnings,
    chipsFromCredits: context.chipsFromCredits,
    totalChipsOut: context.totalChipsOut,
    chipsToLosses: context.chipsToLosses,
    chipsToRake: context.chipsToRake,
    netPosition: context.totalChipsIn - context.totalChipsOut,
    handsPlayed: context.handsPlayed.size,
    tablesPlayed: context.tablesPlayed.size,
    byClub: context.byClub,
  };
}

// ============================================================================
// Multi-Player Aggregation
// ============================================================================

/**
 * Aggregate entries for multiple players
 *
 * Pure function: given entries, produces summaries for all players found.
 */
export function aggregateAllPlayers(
  entries: readonly AggregationEntry[],
  timeRange: DashboardTimeRange
): Map<PlayerId, PlayerFinanceSummary> {
  // Collect unique player IDs
  const playerIds = new Set<PlayerId>();
  for (const entry of entries) {
    if (entry.playerId && isInTimeRange(entry.timestamp, timeRange)) {
      playerIds.add(entry.playerId);
    }
  }

  // Aggregate for each player
  const results = new Map<PlayerId, PlayerFinanceSummary>();
  for (const playerId of playerIds) {
    results.set(playerId, aggregatePlayerEntries(playerId, entries, timeRange));
  }

  return results;
}

// ============================================================================
// Filtered Aggregation
// ============================================================================

/**
 * Aggregate entries for players in a specific club
 */
export function aggregatePlayersInClub(
  clubId: ClubId,
  entries: readonly AggregationEntry[],
  timeRange: DashboardTimeRange
): Map<PlayerId, PlayerFinanceSummary> {
  // Filter to entries in this club
  const clubEntries = entries.filter(e => e.clubId === clubId);

  // Collect unique player IDs from club entries
  const playerIds = new Set<PlayerId>();
  for (const entry of clubEntries) {
    if (entry.playerId && isInTimeRange(entry.timestamp, timeRange)) {
      playerIds.add(entry.playerId);
    }
  }

  // Aggregate for each player (using club entries only)
  const results = new Map<PlayerId, PlayerFinanceSummary>();
  for (const playerId of playerIds) {
    results.set(playerId, aggregatePlayerEntries(playerId, clubEntries, timeRange));
  }

  return results;
}

// ============================================================================
// Ranking Functions
// ============================================================================

/**
 * Get top N players by net position
 */
export function getTopPlayersByNetPosition(
  entries: readonly AggregationEntry[],
  timeRange: DashboardTimeRange,
  limit: number
): PlayerFinanceSummary[] {
  const all = aggregateAllPlayers(entries, timeRange);
  return Array.from(all.values())
    .sort((a, b) => b.netPosition - a.netPosition)
    .slice(0, limit);
}

/**
 * Get bottom N players by net position
 */
export function getBottomPlayersByNetPosition(
  entries: readonly AggregationEntry[],
  timeRange: DashboardTimeRange,
  limit: number
): PlayerFinanceSummary[] {
  const all = aggregateAllPlayers(entries, timeRange);
  return Array.from(all.values())
    .sort((a, b) => a.netPosition - b.netPosition)
    .slice(0, limit);
}

/**
 * Get top N players by hands played
 */
export function getTopPlayersByHandsPlayed(
  entries: readonly AggregationEntry[],
  timeRange: DashboardTimeRange,
  limit: number
): PlayerFinanceSummary[] {
  const all = aggregateAllPlayers(entries, timeRange);
  return Array.from(all.values())
    .sort((a, b) => b.handsPlayed - a.handsPlayed)
    .slice(0, limit);
}

/**
 * Get top N players by total volume (chips in + chips out)
 */
export function getTopPlayersByVolume(
  entries: readonly AggregationEntry[],
  timeRange: DashboardTimeRange,
  limit: number
): PlayerFinanceSummary[] {
  const all = aggregateAllPlayers(entries, timeRange);
  return Array.from(all.values())
    .sort((a, b) => (b.totalChipsIn + b.totalChipsOut) - (a.totalChipsIn + a.totalChipsOut))
    .slice(0, limit);
}
