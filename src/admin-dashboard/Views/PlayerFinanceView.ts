/**
 * PlayerFinanceView.ts
 * Phase 30 - Admin & Club Financial Dashboard (Read-Only)
 *
 * Read-only view for player finance data.
 *
 * PROVIDES:
 * - Player finance summaries
 * - Ranking queries
 * - Club-filtered views
 *
 * HARD CONSTRAINTS:
 * - Read-only (no writes)
 * - No side effects
 * - Pure aggregation from ledger
 */

import { PlayerId } from '../../security/Identity';
import { ClubId } from '../../club/ClubTypes';
import {
  PlayerFinanceSummary,
  DashboardTimeRange,
  AggregationEntry,
  DashboardQueryResult,
} from '../types';
import {
  aggregatePlayerEntries,
  aggregateAllPlayers,
  aggregatePlayersInClub,
  getTopPlayersByNetPosition,
  getBottomPlayersByNetPosition,
  getTopPlayersByHandsPlayed,
  getTopPlayersByVolume,
} from '../Aggregators';

// ============================================================================
// Player Finance View
// ============================================================================

/**
 * Read-only view for player finance data
 *
 * This class provides query interfaces for player finance summaries.
 * All data is derived from ledger entries - no stored state.
 */
export class PlayerFinanceView {
  private readonly getEntries: () => readonly AggregationEntry[];

  constructor(entryProvider: () => readonly AggregationEntry[]) {
    this.getEntries = entryProvider;
  }

  // ==========================================================================
  // Single Player Queries
  // ==========================================================================

  /**
   * Get finance summary for a single player
   */
  getPlayerSummary(
    playerId: PlayerId,
    timeRange: DashboardTimeRange
  ): DashboardQueryResult<PlayerFinanceSummary> {
    try {
      const entries = this.getEntries();
      const summary = aggregatePlayerEntries(playerId, entries, timeRange);
      return { success: true, data: summary };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get finance summary for a player in a specific club
   */
  getPlayerSummaryInClub(
    playerId: PlayerId,
    clubId: ClubId,
    timeRange: DashboardTimeRange
  ): DashboardQueryResult<PlayerFinanceSummary> {
    try {
      const entries = this.getEntries().filter(e => e.clubId === clubId);
      const summary = aggregatePlayerEntries(playerId, entries, timeRange);
      return { success: true, data: summary };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ==========================================================================
  // Multi-Player Queries
  // ==========================================================================

  /**
   * Get all player summaries
   */
  getAllPlayerSummaries(
    timeRange: DashboardTimeRange
  ): DashboardQueryResult<Map<PlayerId, PlayerFinanceSummary>> {
    try {
      const entries = this.getEntries();
      const summaries = aggregateAllPlayers(entries, timeRange);
      return { success: true, data: summaries };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get player summaries for a specific club
   */
  getClubPlayerSummaries(
    clubId: ClubId,
    timeRange: DashboardTimeRange
  ): DashboardQueryResult<Map<PlayerId, PlayerFinanceSummary>> {
    try {
      const entries = this.getEntries();
      const summaries = aggregatePlayersInClub(clubId, entries, timeRange);
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
   * Get top players by net position (biggest winners)
   */
  getTopWinners(
    timeRange: DashboardTimeRange,
    limit: number = 10
  ): DashboardQueryResult<PlayerFinanceSummary[]> {
    try {
      const entries = this.getEntries();
      const topPlayers = getTopPlayersByNetPosition(entries, timeRange, limit);
      return { success: true, data: topPlayers };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get bottom players by net position (biggest losers)
   */
  getTopLosers(
    timeRange: DashboardTimeRange,
    limit: number = 10
  ): DashboardQueryResult<PlayerFinanceSummary[]> {
    try {
      const entries = this.getEntries();
      const bottomPlayers = getBottomPlayersByNetPosition(entries, timeRange, limit);
      return { success: true, data: bottomPlayers };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get most active players by hands played
   */
  getMostActivePlayers(
    timeRange: DashboardTimeRange,
    limit: number = 10
  ): DashboardQueryResult<PlayerFinanceSummary[]> {
    try {
      const entries = this.getEntries();
      const activePlayers = getTopPlayersByHandsPlayed(entries, timeRange, limit);
      return { success: true, data: activePlayers };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get highest volume players (chips in + chips out)
   */
  getHighestVolumePlayers(
    timeRange: DashboardTimeRange,
    limit: number = 10
  ): DashboardQueryResult<PlayerFinanceSummary[]> {
    try {
      const entries = this.getEntries();
      const volumePlayers = getTopPlayersByVolume(entries, timeRange, limit);
      return { success: true, data: volumePlayers };
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
   * Get player count in time range
   */
  getPlayerCount(timeRange: DashboardTimeRange): number {
    const entries = this.getEntries();
    const summaries = aggregateAllPlayers(entries, timeRange);
    return summaries.size;
  }

  /**
   * Get total chips in play (sum of all player net positions)
   */
  getTotalChipsInPlay(timeRange: DashboardTimeRange): number {
    const entries = this.getEntries();
    const summaries = aggregateAllPlayers(entries, timeRange);
    let total = 0;
    for (const summary of summaries.values()) {
      total += summary.netPosition;
    }
    return total;
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a player finance view
 */
export function createPlayerFinanceView(
  entryProvider: () => readonly AggregationEntry[]
): PlayerFinanceView {
  return new PlayerFinanceView(entryProvider);
}
