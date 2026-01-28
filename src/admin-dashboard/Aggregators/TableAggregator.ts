/**
 * TableAggregator.ts
 * Phase 30 - Admin & Club Financial Dashboard (Read-Only)
 *
 * Aggregates ledger entries to produce table-level finance summaries.
 *
 * AGGREGATES:
 * - Hands played
 * - Pot volume
 * - Rake collected
 * - Player participation
 * - Recent hand history
 *
 * HARD CONSTRAINTS:
 * - Pure functions only
 * - No side effects
 * - No external system access
 * - Deterministic results
 */

import { PlayerId } from '../../security/Identity';
import { TableId, HandId } from '../../security/AuditLog';
import { ClubId } from '../../club/ClubTypes';
import {
  TableFinanceSummary,
  HandSummary,
  DashboardTimeRange,
  AggregationEntry,
  emptyTableFinanceSummary,
  isInTimeRange,
  integerAverage,
} from '../types';

// ============================================================================
// Aggregation Context
// ============================================================================

/**
 * Internal tracking for hand aggregation
 */
interface HandAggregationContext {
  handId: HandId;
  timestamp: number;
  potSize: number;
  rake: number;
  players: Set<PlayerId>;
}

/**
 * Internal tracking for table aggregation
 */
interface TableAggregationContext {
  hands: Map<HandId, HandAggregationContext>;
  totalPotVolume: number;
  totalRake: number;
  players: Set<PlayerId>;
}

/**
 * Create empty table aggregation context
 */
function createTableContext(): TableAggregationContext {
  return {
    hands: new Map(),
    totalPotVolume: 0,
    totalRake: 0,
    players: new Set(),
  };
}

/**
 * Create empty hand aggregation context
 */
function createHandContext(handId: HandId, timestamp: number): HandAggregationContext {
  return {
    handId,
    timestamp,
    potSize: 0,
    rake: 0,
    players: new Set(),
  };
}

// ============================================================================
// Entry Classification
// ============================================================================

/**
 * Check if entry contributes to pot (player loss in hand settlement)
 */
function isPotContribution(entry: AggregationEntry): boolean {
  return entry.source === 'HAND_SETTLEMENT' &&
         entry.partyType === 'PLAYER' &&
         entry.delta < 0;
}

/**
 * Check if entry is rake (platform or club share)
 */
function isRake(entry: AggregationEntry): boolean {
  return entry.source === 'HAND_SETTLEMENT' &&
         (entry.partyType === 'PLATFORM' || entry.partyType === 'CLUB') &&
         entry.delta > 0;
}

// ============================================================================
// Single Table Aggregation
// ============================================================================

/**
 * Aggregate entries for a single table
 *
 * Pure function: given entries, produces a summary.
 * Does NOT access any external systems.
 */
export function aggregateTableEntries(
  tableId: TableId,
  clubId: ClubId,
  entries: readonly AggregationEntry[],
  timeRange: DashboardTimeRange,
  recentHandsLimit: number = 20
): TableFinanceSummary {
  const context = createTableContext();

  // Filter and process entries for this table within time range
  for (const entry of entries) {
    // Skip if not for this table
    if (entry.tableId !== tableId) continue;

    // Skip if outside time range
    if (!isInTimeRange(entry.timestamp, timeRange)) continue;

    // Track players
    if (entry.playerId) {
      context.players.add(entry.playerId);
    }

    // Track hands
    if (entry.handId) {
      let handCtx = context.hands.get(entry.handId);
      if (!handCtx) {
        handCtx = createHandContext(entry.handId, entry.timestamp);
        context.hands.set(entry.handId, handCtx);
      }

      // Track players in hand
      if (entry.playerId) {
        handCtx.players.add(entry.playerId);
      }

      // Track pot contribution
      if (isPotContribution(entry)) {
        const amount = Math.abs(entry.delta);
        handCtx.potSize += amount;
        context.totalPotVolume += amount;
      }

      // Track rake
      if (isRake(entry)) {
        handCtx.rake += entry.delta;
        context.totalRake += entry.delta;
      }
    }
  }

  // Build hand summaries (sorted by timestamp, most recent first)
  const handSummaries: HandSummary[] = Array.from(context.hands.values())
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, recentHandsLimit)
    .map(handCtx => ({
      handId: handCtx.handId,
      timestamp: handCtx.timestamp,
      potSize: handCtx.potSize,
      rake: handCtx.rake,
      playerCount: handCtx.players.size,
    }));

  const handsPlayed = context.hands.size;

  return {
    tableId,
    clubId,
    timeRange,
    handsPlayed,
    totalPotVolume: context.totalPotVolume,
    averagePotSize: integerAverage(context.totalPotVolume, handsPlayed),
    totalRake: context.totalRake,
    averageRakePerHand: integerAverage(context.totalRake, handsPlayed),
    uniquePlayers: context.players.size,
    playerIds: Array.from(context.players),
    recentHands: handSummaries,
  };
}

// ============================================================================
// Multi-Table Aggregation
// ============================================================================

/**
 * Aggregate entries for all tables
 *
 * Pure function: given entries, produces summaries for all tables found.
 * Requires a mapping of tableId to clubId for proper club attribution.
 */
export function aggregateAllTables(
  entries: readonly AggregationEntry[],
  timeRange: DashboardTimeRange,
  tableToClub: ReadonlyMap<TableId, ClubId>,
  recentHandsLimit: number = 20
): Map<TableId, TableFinanceSummary> {
  // Collect unique table IDs
  const tableIds = new Set<TableId>();
  for (const entry of entries) {
    if (entry.tableId && isInTimeRange(entry.timestamp, timeRange)) {
      tableIds.add(entry.tableId);
    }
  }

  // Aggregate for each table
  const results = new Map<TableId, TableFinanceSummary>();
  for (const tableId of tableIds) {
    const clubId = tableToClub.get(tableId) ?? ('' as ClubId);
    results.set(
      tableId,
      aggregateTableEntries(tableId, clubId, entries, timeRange, recentHandsLimit)
    );
  }

  return results;
}

/**
 * Aggregate entries for tables in a specific club
 */
export function aggregateTablesInClub(
  clubId: ClubId,
  entries: readonly AggregationEntry[],
  timeRange: DashboardTimeRange,
  recentHandsLimit: number = 20
): Map<TableId, TableFinanceSummary> {
  // Filter to entries in this club
  const clubEntries = entries.filter(e => e.clubId === clubId);

  // Collect unique table IDs from club entries
  const tableIds = new Set<TableId>();
  for (const entry of clubEntries) {
    if (entry.tableId && isInTimeRange(entry.timestamp, timeRange)) {
      tableIds.add(entry.tableId);
    }
  }

  // Aggregate for each table
  const results = new Map<TableId, TableFinanceSummary>();
  for (const tableId of tableIds) {
    results.set(
      tableId,
      aggregateTableEntries(tableId, clubId, clubEntries, timeRange, recentHandsLimit)
    );
  }

  return results;
}

// ============================================================================
// Ranking Functions
// ============================================================================

/**
 * Get top N tables by rake generated
 */
export function getTopTablesByRake(
  entries: readonly AggregationEntry[],
  timeRange: DashboardTimeRange,
  tableToClub: ReadonlyMap<TableId, ClubId>,
  limit: number
): TableFinanceSummary[] {
  const all = aggregateAllTables(entries, timeRange, tableToClub);
  return Array.from(all.values())
    .sort((a, b) => b.totalRake - a.totalRake)
    .slice(0, limit);
}

/**
 * Get top N tables by hands played
 */
export function getTopTablesByHandsPlayed(
  entries: readonly AggregationEntry[],
  timeRange: DashboardTimeRange,
  tableToClub: ReadonlyMap<TableId, ClubId>,
  limit: number
): TableFinanceSummary[] {
  const all = aggregateAllTables(entries, timeRange, tableToClub);
  return Array.from(all.values())
    .sort((a, b) => b.handsPlayed - a.handsPlayed)
    .slice(0, limit);
}

/**
 * Get top N tables by player count
 */
export function getTopTablesByPlayerCount(
  entries: readonly AggregationEntry[],
  timeRange: DashboardTimeRange,
  tableToClub: ReadonlyMap<TableId, ClubId>,
  limit: number
): TableFinanceSummary[] {
  const all = aggregateAllTables(entries, timeRange, tableToClub);
  return Array.from(all.values())
    .sort((a, b) => b.uniquePlayers - a.uniquePlayers)
    .slice(0, limit);
}

/**
 * Get top N tables by pot volume
 */
export function getTopTablesByPotVolume(
  entries: readonly AggregationEntry[],
  timeRange: DashboardTimeRange,
  tableToClub: ReadonlyMap<TableId, ClubId>,
  limit: number
): TableFinanceSummary[] {
  const all = aggregateAllTables(entries, timeRange, tableToClub);
  return Array.from(all.values())
    .sort((a, b) => b.totalPotVolume - a.totalPotVolume)
    .slice(0, limit);
}

// ============================================================================
// Hand Analysis
// ============================================================================

/**
 * Get the largest pots in a time range
 */
export function getLargestPots(
  entries: readonly AggregationEntry[],
  timeRange: DashboardTimeRange,
  limit: number
): HandSummary[] {
  const hands = new Map<HandId, HandAggregationContext>();

  for (const entry of entries) {
    if (!isInTimeRange(entry.timestamp, timeRange)) continue;
    if (!entry.handId) continue;

    let handCtx = hands.get(entry.handId);
    if (!handCtx) {
      handCtx = createHandContext(entry.handId, entry.timestamp);
      hands.set(entry.handId, handCtx);
    }

    if (entry.playerId) {
      handCtx.players.add(entry.playerId);
    }

    if (isPotContribution(entry)) {
      handCtx.potSize += Math.abs(entry.delta);
    }

    if (isRake(entry)) {
      handCtx.rake += entry.delta;
    }
  }

  return Array.from(hands.values())
    .sort((a, b) => b.potSize - a.potSize)
    .slice(0, limit)
    .map(h => ({
      handId: h.handId,
      timestamp: h.timestamp,
      potSize: h.potSize,
      rake: h.rake,
      playerCount: h.players.size,
    }));
}

/**
 * Get the highest rake hands in a time range
 */
export function getHighestRakeHands(
  entries: readonly AggregationEntry[],
  timeRange: DashboardTimeRange,
  limit: number
): HandSummary[] {
  const hands = new Map<HandId, HandAggregationContext>();

  for (const entry of entries) {
    if (!isInTimeRange(entry.timestamp, timeRange)) continue;
    if (!entry.handId) continue;

    let handCtx = hands.get(entry.handId);
    if (!handCtx) {
      handCtx = createHandContext(entry.handId, entry.timestamp);
      hands.set(entry.handId, handCtx);
    }

    if (entry.playerId) {
      handCtx.players.add(entry.playerId);
    }

    if (isPotContribution(entry)) {
      handCtx.potSize += Math.abs(entry.delta);
    }

    if (isRake(entry)) {
      handCtx.rake += entry.delta;
    }
  }

  return Array.from(hands.values())
    .sort((a, b) => b.rake - a.rake)
    .slice(0, limit)
    .map(h => ({
      handId: h.handId,
      timestamp: h.timestamp,
      potSize: h.potSize,
      rake: h.rake,
      playerCount: h.players.size,
    }));
}
