/**
 * ClubLedgerAggregator.ts
 * Phase 30 - Admin & Club Financial Dashboard (Read-Only)
 *
 * Aggregates ledger entries to produce club finance summaries.
 *
 * AGGREGATES:
 * - Player activity metrics
 * - Total credits issued
 * - Total rake generated
 * - Rake splits (club share vs platform share)
 * - Breakdown by table
 * - Credits by reason
 *
 * HARD CONSTRAINTS:
 * - Pure functions only
 * - No side effects
 * - No external system access
 * - Deterministic results
 */

import { PlayerId } from '../../security/Identity';
import { TableId } from '../../security/AuditLog';
import { ClubId } from '../../club/ClubTypes';
import { AdminCreditReason } from '../../admin-credit/AdminCreditTypes';
import {
  ClubFinanceSummary,
  ClubTableSummary,
  DashboardTimeRange,
  AggregationEntry,
  emptyClubFinanceSummary,
  isInTimeRange,
} from '../types';

// ============================================================================
// Aggregation Context
// ============================================================================

/**
 * Internal tracking for table aggregation
 */
interface TableAggregationContext {
  handsPlayed: Set<string>;
  totalRake: number;
  totalPotVolume: number;
  players: Set<PlayerId>;
}

/**
 * Internal tracking for club aggregation
 */
interface ClubAggregationContext {
  players: Set<PlayerId>;
  totalCredits: number;
  totalRake: number;
  clubRakeShare: number;
  platformRakeShare: number;
  agentCommissions: number;
  handsPlayed: Set<string>;
  totalPotVolume: number;
  tables: Map<TableId, TableAggregationContext>;
  creditsByReason: Record<AdminCreditReason, number>;
}

/**
 * Create empty club aggregation context
 */
function createClubContext(): ClubAggregationContext {
  return {
    players: new Set(),
    totalCredits: 0,
    totalRake: 0,
    clubRakeShare: 0,
    platformRakeShare: 0,
    agentCommissions: 0,
    handsPlayed: new Set(),
    totalPotVolume: 0,
    tables: new Map(),
    creditsByReason: {
      OFFLINE_BUYIN: 0,
      PROMOTION: 0,
      TESTING: 0,
      CORRECTION: 0,
    },
  };
}

/**
 * Create empty table aggregation context
 */
function createTableContext(): TableAggregationContext {
  return {
    handsPlayed: new Set(),
    totalRake: 0,
    totalPotVolume: 0,
    players: new Set(),
  };
}

// ============================================================================
// Entry Classification
// ============================================================================

/**
 * Check if entry is a credit (top-up or bonus)
 */
function isCredit(entry: AggregationEntry): boolean {
  return entry.source === 'TOP_UP' || entry.source === 'BONUS';
}

/**
 * Check if entry is club rake share
 */
function isClubRake(entry: AggregationEntry): boolean {
  return entry.partyType === 'CLUB' && entry.delta > 0 && entry.source === 'HAND_SETTLEMENT';
}

/**
 * Check if entry is platform rake share
 */
function isPlatformRake(entry: AggregationEntry): boolean {
  return entry.partyType === 'PLATFORM' && entry.delta > 0 && entry.source === 'HAND_SETTLEMENT';
}

/**
 * Check if entry is agent commission
 */
function isAgentCommission(entry: AggregationEntry): boolean {
  return entry.partyType === 'AGENT' && entry.delta > 0;
}

/**
 * Extract credit reason from metadata if available
 */
function extractCreditReason(entry: AggregationEntry): AdminCreditReason | null {
  if (!entry.metadata) return null;
  const reason = entry.metadata['reason'] as string | undefined;
  if (reason && ['OFFLINE_BUYIN', 'PROMOTION', 'TESTING', 'CORRECTION'].includes(reason)) {
    return reason as AdminCreditReason;
  }
  return null;
}

// ============================================================================
// Single Club Aggregation
// ============================================================================

/**
 * Aggregate entries for a single club
 *
 * Pure function: given entries, produces a summary.
 * Does NOT access any external systems.
 */
export function aggregateClubEntries(
  clubId: ClubId,
  entries: readonly AggregationEntry[],
  timeRange: DashboardTimeRange
): ClubFinanceSummary {
  const context = createClubContext();

  // Filter and process entries for this club within time range
  for (const entry of entries) {
    // Skip if not for this club
    if (entry.clubId !== clubId) continue;

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

    // Track by table
    if (entry.tableId) {
      let tableCtx = context.tables.get(entry.tableId);
      if (!tableCtx) {
        tableCtx = createTableContext();
        context.tables.set(entry.tableId, tableCtx);
      }
      if (entry.handId) {
        tableCtx.handsPlayed.add(entry.handId);
      }
      if (entry.playerId) {
        tableCtx.players.add(entry.playerId);
      }
    }

    // Aggregate credits
    if (isCredit(entry) && entry.partyType === 'PLAYER' && entry.delta > 0) {
      context.totalCredits += entry.delta;

      // Track by reason
      const reason = extractCreditReason(entry);
      if (reason) {
        context.creditsByReason[reason] += entry.delta;
      }
    }

    // Aggregate rake (club share)
    if (isClubRake(entry)) {
      context.clubRakeShare += entry.delta;
      context.totalRake += entry.delta;

      // Track table rake
      if (entry.tableId) {
        const tableCtx = context.tables.get(entry.tableId);
        if (tableCtx) {
          tableCtx.totalRake += entry.delta;
        }
      }
    }

    // Track platform rake share (for this club)
    if (isPlatformRake(entry)) {
      context.platformRakeShare += entry.delta;
      context.totalRake += entry.delta;
    }

    // Track agent commissions
    if (isAgentCommission(entry)) {
      context.agentCommissions += entry.delta;
    }

    // Track pot volume (from hand settlement player losses)
    if (entry.source === 'HAND_SETTLEMENT' && entry.partyType === 'PLAYER' && entry.delta < 0) {
      const amount = Math.abs(entry.delta);
      context.totalPotVolume += amount;

      if (entry.tableId) {
        const tableCtx = context.tables.get(entry.tableId);
        if (tableCtx) {
          tableCtx.totalPotVolume += amount;
        }
      }
    }
  }

  // Build table summaries
  const byTable = new Map<TableId, ClubTableSummary>();
  for (const [tableId, tableCtx] of context.tables) {
    byTable.set(tableId, {
      tableId,
      handsPlayed: tableCtx.handsPlayed.size,
      totalRake: tableCtx.totalRake,
      totalPotVolume: tableCtx.totalPotVolume,
      playerCount: tableCtx.players.size,
    });
  }

  return {
    clubId,
    timeRange,
    playerCount: context.players.size,
    totalCredits: context.totalCredits,
    totalRake: context.totalRake,
    clubRakeShare: context.clubRakeShare,
    platformRakeShare: context.platformRakeShare,
    agentCommissions: context.agentCommissions,
    handsPlayed: context.handsPlayed.size,
    totalPotVolume: context.totalPotVolume,
    activeTables: context.tables.size,
    byTable,
    creditsByReason: context.creditsByReason,
  };
}

// ============================================================================
// Multi-Club Aggregation
// ============================================================================

/**
 * Aggregate entries for all clubs
 *
 * Pure function: given entries, produces summaries for all clubs found.
 */
export function aggregateAllClubs(
  entries: readonly AggregationEntry[],
  timeRange: DashboardTimeRange
): Map<ClubId, ClubFinanceSummary> {
  // Collect unique club IDs
  const clubIds = new Set<ClubId>();
  for (const entry of entries) {
    if (entry.clubId && isInTimeRange(entry.timestamp, timeRange)) {
      clubIds.add(entry.clubId);
    }
  }

  // Aggregate for each club
  const results = new Map<ClubId, ClubFinanceSummary>();
  for (const clubId of clubIds) {
    results.set(clubId, aggregateClubEntries(clubId, entries, timeRange));
  }

  return results;
}

// ============================================================================
// Ranking Functions
// ============================================================================

/**
 * Get top N clubs by rake generated
 */
export function getTopClubsByRake(
  entries: readonly AggregationEntry[],
  timeRange: DashboardTimeRange,
  limit: number
): ClubFinanceSummary[] {
  const all = aggregateAllClubs(entries, timeRange);
  return Array.from(all.values())
    .sort((a, b) => b.totalRake - a.totalRake)
    .slice(0, limit);
}

/**
 * Get top N clubs by player count
 */
export function getTopClubsByPlayerCount(
  entries: readonly AggregationEntry[],
  timeRange: DashboardTimeRange,
  limit: number
): ClubFinanceSummary[] {
  const all = aggregateAllClubs(entries, timeRange);
  return Array.from(all.values())
    .sort((a, b) => b.playerCount - a.playerCount)
    .slice(0, limit);
}

/**
 * Get top N clubs by hands played
 */
export function getTopClubsByHandsPlayed(
  entries: readonly AggregationEntry[],
  timeRange: DashboardTimeRange,
  limit: number
): ClubFinanceSummary[] {
  const all = aggregateAllClubs(entries, timeRange);
  return Array.from(all.values())
    .sort((a, b) => b.handsPlayed - a.handsPlayed)
    .slice(0, limit);
}

/**
 * Get top N clubs by pot volume
 */
export function getTopClubsByPotVolume(
  entries: readonly AggregationEntry[],
  timeRange: DashboardTimeRange,
  limit: number
): ClubFinanceSummary[] {
  const all = aggregateAllClubs(entries, timeRange);
  return Array.from(all.values())
    .sort((a, b) => b.totalPotVolume - a.totalPotVolume)
    .slice(0, limit);
}
