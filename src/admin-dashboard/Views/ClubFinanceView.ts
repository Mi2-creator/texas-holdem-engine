/**
 * ClubFinanceView.ts
 * Phase 30 - Admin & Club Financial Dashboard (Read-Only)
 *
 * Read-only view for club finance data.
 *
 * PROVIDES:
 * - Club finance summaries
 * - Ranking queries
 * - Table breakdowns
 *
 * HARD CONSTRAINTS:
 * - Read-only (no writes)
 * - No side effects
 * - Pure aggregation from ledger
 */

import { ClubId } from '../../club/ClubTypes';
import { TableId } from '../../security/AuditLog';
import {
  ClubFinanceSummary,
  ClubTableSummary,
  DashboardTimeRange,
  AggregationEntry,
  DashboardQueryResult,
} from '../types';
import {
  aggregateClubEntries,
  aggregateAllClubs,
  getTopClubsByRake,
  getTopClubsByPlayerCount,
  getTopClubsByHandsPlayed,
  getTopClubsByPotVolume,
} from '../Aggregators';

// ============================================================================
// Club Finance View
// ============================================================================

/**
 * Read-only view for club finance data
 *
 * This class provides query interfaces for club finance summaries.
 * All data is derived from ledger entries - no stored state.
 */
export class ClubFinanceView {
  private readonly getEntries: () => readonly AggregationEntry[];

  constructor(entryProvider: () => readonly AggregationEntry[]) {
    this.getEntries = entryProvider;
  }

  // ==========================================================================
  // Single Club Queries
  // ==========================================================================

  /**
   * Get finance summary for a single club
   */
  getClubSummary(
    clubId: ClubId,
    timeRange: DashboardTimeRange
  ): DashboardQueryResult<ClubFinanceSummary> {
    try {
      const entries = this.getEntries();
      const summary = aggregateClubEntries(clubId, entries, timeRange);
      return { success: true, data: summary };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get table breakdown for a club
   */
  getClubTableBreakdown(
    clubId: ClubId,
    timeRange: DashboardTimeRange
  ): DashboardQueryResult<ReadonlyMap<TableId, ClubTableSummary>> {
    try {
      const entries = this.getEntries();
      const summary = aggregateClubEntries(clubId, entries, timeRange);
      return { success: true, data: summary.byTable };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ==========================================================================
  // Multi-Club Queries
  // ==========================================================================

  /**
   * Get all club summaries
   */
  getAllClubSummaries(
    timeRange: DashboardTimeRange
  ): DashboardQueryResult<Map<ClubId, ClubFinanceSummary>> {
    try {
      const entries = this.getEntries();
      const summaries = aggregateAllClubs(entries, timeRange);
      return { success: true, data: summaries };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ==========================================================================
  // Ranking Queries
  // ==========================================================================

  /**
   * Get top clubs by rake generated
   */
  getTopClubsByRake(
    timeRange: DashboardTimeRange,
    limit: number = 10
  ): DashboardQueryResult<ClubFinanceSummary[]> {
    try {
      const entries = this.getEntries();
      const topClubs = getTopClubsByRake(entries, timeRange, limit);
      return { success: true, data: topClubs };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get top clubs by player count
   */
  getTopClubsByPlayerCount(
    timeRange: DashboardTimeRange,
    limit: number = 10
  ): DashboardQueryResult<ClubFinanceSummary[]> {
    try {
      const entries = this.getEntries();
      const topClubs = getTopClubsByPlayerCount(entries, timeRange, limit);
      return { success: true, data: topClubs };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get top clubs by hands played
   */
  getTopClubsByHandsPlayed(
    timeRange: DashboardTimeRange,
    limit: number = 10
  ): DashboardQueryResult<ClubFinanceSummary[]> {
    try {
      const entries = this.getEntries();
      const topClubs = getTopClubsByHandsPlayed(entries, timeRange, limit);
      return { success: true, data: topClubs };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get top clubs by pot volume
   */
  getTopClubsByPotVolume(
    timeRange: DashboardTimeRange,
    limit: number = 10
  ): DashboardQueryResult<ClubFinanceSummary[]> {
    try {
      const entries = this.getEntries();
      const topClubs = getTopClubsByPotVolume(entries, timeRange, limit);
      return { success: true, data: topClubs };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ==========================================================================
  // Statistics
  // ==========================================================================

  /**
   * Get club count in time range
   */
  getClubCount(timeRange: DashboardTimeRange): number {
    const entries = this.getEntries();
    const summaries = aggregateAllClubs(entries, timeRange);
    return summaries.size;
  }

  /**
   * Get total rake across all clubs
   */
  getTotalRake(timeRange: DashboardTimeRange): number {
    const entries = this.getEntries();
    const summaries = aggregateAllClubs(entries, timeRange);
    let total = 0;
    for (const summary of summaries.values()) {
      total += summary.totalRake;
    }
    return total;
  }

  /**
   * Get total pot volume across all clubs
   */
  getTotalPotVolume(timeRange: DashboardTimeRange): number {
    const entries = this.getEntries();
    const summaries = aggregateAllClubs(entries, timeRange);
    let total = 0;
    for (const summary of summaries.values()) {
      total += summary.totalPotVolume;
    }
    return total;
  }

  /**
   * Get total hands played across all clubs
   */
  getTotalHandsPlayed(timeRange: DashboardTimeRange): number {
    const entries = this.getEntries();
    const summaries = aggregateAllClubs(entries, timeRange);
    let total = 0;
    for (const summary of summaries.values()) {
      total += summary.handsPlayed;
    }
    return total;
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a club finance view
 */
export function createClubFinanceView(
  entryProvider: () => readonly AggregationEntry[]
): ClubFinanceView {
  return new ClubFinanceView(entryProvider);
}
