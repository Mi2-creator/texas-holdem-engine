/**
 * AdminCreditAggregator.ts
 * Phase 30 - Admin & Club Financial Dashboard (Read-Only)
 *
 * Aggregates admin credit entries for dashboard visibility.
 *
 * AGGREGATES:
 * - Credits by admin
 * - Credits by player
 * - Credits by reason
 * - Credits by club
 * - Time-based trends
 *
 * HARD CONSTRAINTS:
 * - Pure functions only
 * - No side effects
 * - No external system access
 * - Deterministic results
 * - Admin credits are NOT revenue
 */

import { PlayerId } from '../../security/Identity';
import { ClubId } from '../../club/ClubTypes';
import {
  AdminId,
  AdminCreditReason,
  AdminCreditSummary,
  PlayerCreditSummary,
  ReasonCreditSummary,
  emptyReasonBreakdown,
} from '../../admin-credit/AdminCreditTypes';
import {
  DashboardTimeRange,
  AggregationEntry,
  isInTimeRange,
} from '../types';

// ============================================================================
// Summary Types for Dashboard
// ============================================================================

/**
 * Overall admin credit summary for dashboard
 */
export interface AdminCreditDashboardSummary {
  readonly timeRange: DashboardTimeRange;
  readonly totalCreditsIssued: number;
  readonly creditCount: number;
  readonly uniqueAdmins: number;
  readonly uniquePlayers: number;
  readonly uniqueClubs: number;
  readonly byReason: Readonly<Record<AdminCreditReason, number>>;
  readonly byAdmin: ReadonlyMap<AdminId, AdminCreditSummary>;
  readonly byPlayer: ReadonlyMap<PlayerId, PlayerCreditSummary>;
  readonly byClub: ReadonlyMap<ClubId, number>;
}

// ============================================================================
// Aggregation Context
// ============================================================================

/**
 * Internal tracking for admin credit aggregation
 */
interface AdminCreditContext {
  totalCreditsIssued: number;
  creditCount: number;
  admins: Map<AdminId, {
    totalAmount: number;
    creditCount: number;
    byReason: Record<AdminCreditReason, number>;
  }>;
  players: Map<PlayerId, {
    totalAmount: number;
    creditCount: number;
    byReason: Record<AdminCreditReason, number>;
  }>;
  clubs: Map<ClubId, number>;
  byReason: Record<AdminCreditReason, number>;
}

/**
 * Create empty admin credit context
 */
function createContext(): AdminCreditContext {
  return {
    totalCreditsIssued: 0,
    creditCount: 0,
    admins: new Map(),
    players: new Map(),
    clubs: new Map(),
    byReason: emptyReasonBreakdown(),
  };
}

// ============================================================================
// Entry Classification
// ============================================================================

/**
 * Check if entry is an admin credit
 */
function isAdminCredit(entry: AggregationEntry): boolean {
  return (entry.source === 'TOP_UP' || entry.source === 'BONUS') &&
         entry.partyType === 'PLAYER' &&
         entry.delta > 0;
}

/**
 * Extract admin ID from metadata
 */
function extractAdminId(entry: AggregationEntry): AdminId | null {
  if (!entry.metadata) return null;
  const adminId = entry.metadata['adminId'] as string | undefined;
  return adminId ? (adminId as AdminId) : null;
}

/**
 * Extract credit reason from metadata
 */
function extractReason(entry: AggregationEntry): AdminCreditReason | null {
  if (!entry.metadata) return null;
  const reason = entry.metadata['reason'] as string | undefined;
  if (reason && ['OFFLINE_BUYIN', 'PROMOTION', 'TESTING', 'CORRECTION'].includes(reason)) {
    return reason as AdminCreditReason;
  }
  return null;
}

// ============================================================================
// Admin Credit Aggregation
// ============================================================================

/**
 * Aggregate admin credit entries
 *
 * Pure function: given entries, produces admin credit summary.
 * Does NOT access any external systems.
 */
export function aggregateAdminCredits(
  entries: readonly AggregationEntry[],
  timeRange: DashboardTimeRange
): AdminCreditDashboardSummary {
  const context = createContext();

  // Process all entries within time range
  for (const entry of entries) {
    // Skip if outside time range
    if (!isInTimeRange(entry.timestamp, timeRange)) continue;

    // Skip if not an admin credit
    if (!isAdminCredit(entry)) continue;

    const amount = entry.delta;
    const adminId = extractAdminId(entry);
    const reason = extractReason(entry);

    // Update totals
    context.totalCreditsIssued += amount;
    context.creditCount++;

    // Track by admin
    if (adminId) {
      let adminData = context.admins.get(adminId);
      if (!adminData) {
        adminData = {
          totalAmount: 0,
          creditCount: 0,
          byReason: emptyReasonBreakdown(),
        };
        context.admins.set(adminId, adminData);
      }
      adminData.totalAmount += amount;
      adminData.creditCount++;
      if (reason) {
        adminData.byReason[reason] += amount;
      }
    }

    // Track by player
    if (entry.playerId) {
      let playerData = context.players.get(entry.playerId);
      if (!playerData) {
        playerData = {
          totalAmount: 0,
          creditCount: 0,
          byReason: emptyReasonBreakdown(),
        };
        context.players.set(entry.playerId, playerData);
      }
      playerData.totalAmount += amount;
      playerData.creditCount++;
      if (reason) {
        playerData.byReason[reason] += amount;
      }
    }

    // Track by club
    if (entry.clubId) {
      const current = context.clubs.get(entry.clubId) ?? 0;
      context.clubs.set(entry.clubId, current + amount);
    }

    // Track by reason
    if (reason) {
      context.byReason[reason] += amount;
    }
  }

  // Build admin summaries
  const byAdmin = new Map<AdminId, AdminCreditSummary>();
  for (const [adminId, data] of context.admins) {
    byAdmin.set(adminId, {
      adminId,
      totalAmount: data.totalAmount,
      creditCount: data.creditCount,
      byReason: data.byReason,
    });
  }

  // Build player summaries
  const byPlayer = new Map<PlayerId, PlayerCreditSummary>();
  for (const [playerId, data] of context.players) {
    byPlayer.set(playerId, {
      playerId,
      totalAmount: data.totalAmount,
      creditCount: data.creditCount,
      byReason: data.byReason,
    });
  }

  return {
    timeRange,
    totalCreditsIssued: context.totalCreditsIssued,
    creditCount: context.creditCount,
    uniqueAdmins: context.admins.size,
    uniquePlayers: context.players.size,
    uniqueClubs: context.clubs.size,
    byReason: context.byReason,
    byAdmin,
    byPlayer,
    byClub: context.clubs,
  };
}

// ============================================================================
// Filtered Aggregation
// ============================================================================

/**
 * Aggregate credits for a specific admin
 */
export function aggregateByAdmin(
  adminId: AdminId,
  entries: readonly AggregationEntry[],
  timeRange: DashboardTimeRange
): AdminCreditSummary {
  const summary = aggregateAdminCredits(entries, timeRange);
  return summary.byAdmin.get(adminId) ?? {
    adminId,
    totalAmount: 0,
    creditCount: 0,
    byReason: emptyReasonBreakdown(),
  };
}

/**
 * Aggregate credits for a specific player
 */
export function aggregateByPlayer(
  playerId: PlayerId,
  entries: readonly AggregationEntry[],
  timeRange: DashboardTimeRange
): PlayerCreditSummary {
  const summary = aggregateAdminCredits(entries, timeRange);
  return summary.byPlayer.get(playerId) ?? {
    playerId,
    totalAmount: 0,
    creditCount: 0,
    byReason: emptyReasonBreakdown(),
  };
}

/**
 * Aggregate credits for a specific club
 */
export function aggregateByClub(
  clubId: ClubId,
  entries: readonly AggregationEntry[],
  timeRange: DashboardTimeRange
): number {
  const summary = aggregateAdminCredits(entries, timeRange);
  return summary.byClub.get(clubId) ?? 0;
}

// ============================================================================
// Reason-Based Analysis
// ============================================================================

/**
 * Get summary for a specific reason
 */
export function aggregateByReason(
  reason: AdminCreditReason,
  entries: readonly AggregationEntry[],
  timeRange: DashboardTimeRange
): ReasonCreditSummary {
  const admins = new Set<AdminId>();
  const players = new Set<PlayerId>();
  let totalAmount = 0;
  let creditCount = 0;

  for (const entry of entries) {
    // Skip if outside time range
    if (!isInTimeRange(entry.timestamp, timeRange)) continue;

    // Skip if not an admin credit
    if (!isAdminCredit(entry)) continue;

    // Skip if not matching reason
    const entryReason = extractReason(entry);
    if (entryReason !== reason) continue;

    totalAmount += entry.delta;
    creditCount++;

    const adminId = extractAdminId(entry);
    if (adminId) {
      admins.add(adminId);
    }
    if (entry.playerId) {
      players.add(entry.playerId);
    }
  }

  return {
    reason,
    totalAmount,
    creditCount,
    uniqueAdmins: admins.size,
    uniquePlayers: players.size,
  };
}

// ============================================================================
// Ranking Functions
// ============================================================================

/**
 * Get top N players by credits received
 */
export function getTopPlayersByCredits(
  entries: readonly AggregationEntry[],
  timeRange: DashboardTimeRange,
  limit: number
): PlayerCreditSummary[] {
  const summary = aggregateAdminCredits(entries, timeRange);
  return Array.from(summary.byPlayer.values())
    .sort((a, b) => b.totalAmount - a.totalAmount)
    .slice(0, limit);
}

/**
 * Get top N admins by credits issued
 */
export function getTopAdminsByCredits(
  entries: readonly AggregationEntry[],
  timeRange: DashboardTimeRange,
  limit: number
): AdminCreditSummary[] {
  const summary = aggregateAdminCredits(entries, timeRange);
  return Array.from(summary.byAdmin.values())
    .sort((a, b) => b.totalAmount - a.totalAmount)
    .slice(0, limit);
}
