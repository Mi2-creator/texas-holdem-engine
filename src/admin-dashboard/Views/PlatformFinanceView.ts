/**
 * PlatformFinanceView.ts
 * Phase 30 - Admin & Club Financial Dashboard (Read-Only)
 *
 * Read-only view for platform-level finance data.
 *
 * PROVIDES:
 * - Platform-wide revenue summary
 * - Rake breakdown by club
 * - Time series aggregation
 * - Admin credit visibility
 *
 * HARD CONSTRAINTS:
 * - Read-only (no writes)
 * - No side effects
 * - Pure aggregation from ledger
 * - Revenue = Rake ONLY
 */

import { ClubId } from '../../club/ClubTypes';
import {
  PlatformFinanceSummary,
  ClubRakeSummary,
  DashboardTimeRange,
  AggregationEntry,
  DashboardQueryResult,
} from '../types';
import {
  aggregatePlatformEntries,
  calculateRakeRate,
  calculateAverageRakePerHand,
  calculatePlatformSharePercentage,
  calculateAveragePotSize,
  aggregateByHour,
  aggregateByDay,
  AdminCreditDashboardSummary,
  aggregateAdminCredits,
} from '../Aggregators';

// ============================================================================
// Platform Finance View
// ============================================================================

/**
 * Read-only view for platform-level finance data
 *
 * This class provides query interfaces for platform revenue and metrics.
 * All data is derived from ledger entries - no stored state.
 *
 * KEY INVARIANT: Revenue = Rake ONLY
 * Admin credits are tracked but NOT counted as revenue.
 */
export class PlatformFinanceView {
  private readonly getEntries: () => readonly AggregationEntry[];

  constructor(entryProvider: () => readonly AggregationEntry[]) {
    this.getEntries = entryProvider;
  }

  // ==========================================================================
  // Platform Summary
  // ==========================================================================

  /**
   * Get platform-wide finance summary
   */
  getPlatformSummary(
    timeRange: DashboardTimeRange
  ): DashboardQueryResult<PlatformFinanceSummary> {
    try {
      const entries = this.getEntries();
      const summary = aggregatePlatformEntries(entries, timeRange);
      return { success: true, data: summary };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get club rake breakdown
   */
  getClubRakeBreakdown(
    timeRange: DashboardTimeRange
  ): DashboardQueryResult<ReadonlyMap<ClubId, ClubRakeSummary>> {
    try {
      const entries = this.getEntries();
      const summary = aggregatePlatformEntries(entries, timeRange);
      return { success: true, data: summary.byClub };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ==========================================================================
  // Derived Metrics
  // ==========================================================================

  /**
   * Get rake rate (rake / pot volume)
   */
  getRakeRate(timeRange: DashboardTimeRange): DashboardQueryResult<number> {
    try {
      const entries = this.getEntries();
      const summary = aggregatePlatformEntries(entries, timeRange);
      return { success: true, data: calculateRakeRate(summary) };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get average rake per hand
   */
  getAverageRakePerHand(timeRange: DashboardTimeRange): DashboardQueryResult<number> {
    try {
      const entries = this.getEntries();
      const summary = aggregatePlatformEntries(entries, timeRange);
      return { success: true, data: calculateAverageRakePerHand(summary) };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get platform's share percentage of total rake
   */
  getPlatformSharePercentage(timeRange: DashboardTimeRange): DashboardQueryResult<number> {
    try {
      const entries = this.getEntries();
      const summary = aggregatePlatformEntries(entries, timeRange);
      return { success: true, data: calculatePlatformSharePercentage(summary) };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get average pot size
   */
  getAveragePotSize(timeRange: DashboardTimeRange): DashboardQueryResult<number> {
    try {
      const entries = this.getEntries();
      const summary = aggregatePlatformEntries(entries, timeRange);
      return { success: true, data: calculateAveragePotSize(summary) };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ==========================================================================
  // Time Series
  // ==========================================================================

  /**
   * Get hourly breakdown for time series visualization
   */
  getHourlySummaries(
    timeRange: DashboardTimeRange
  ): DashboardQueryResult<Map<number, PlatformFinanceSummary>> {
    try {
      const entries = this.getEntries();
      const hourlyData = aggregateByHour(entries, timeRange);
      return { success: true, data: hourlyData };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get daily breakdown for time series visualization
   */
  getDailySummaries(
    timeRange: DashboardTimeRange
  ): DashboardQueryResult<Map<number, PlatformFinanceSummary>> {
    try {
      const entries = this.getEntries();
      const dailyData = aggregateByDay(entries, timeRange);
      return { success: true, data: dailyData };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ==========================================================================
  // Admin Credit Visibility
  // ==========================================================================

  /**
   * Get admin credit summary (NOT revenue)
   */
  getAdminCreditSummary(
    timeRange: DashboardTimeRange
  ): DashboardQueryResult<AdminCreditDashboardSummary> {
    try {
      const entries = this.getEntries();
      const summary = aggregateAdminCredits(entries, timeRange);
      return { success: true, data: summary };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ==========================================================================
  // Quick Stats
  // ==========================================================================

  /**
   * Get total platform rake revenue
   */
  getTotalRakeRevenue(timeRange: DashboardTimeRange): number {
    const entries = this.getEntries();
    const summary = aggregatePlatformEntries(entries, timeRange);
    return summary.totalRakeRevenue;
  }

  /**
   * Get total rake collected (platform + club shares)
   */
  getTotalRakeCollected(timeRange: DashboardTimeRange): number {
    const entries = this.getEntries();
    const summary = aggregatePlatformEntries(entries, timeRange);
    return summary.totalRakeCollected;
  }

  /**
   * Get total admin credits issued (NOT revenue)
   */
  getTotalCreditsIssued(timeRange: DashboardTimeRange): number {
    const entries = this.getEntries();
    const summary = aggregatePlatformEntries(entries, timeRange);
    return summary.totalCreditsIssued;
  }

  /**
   * Get active club count
   */
  getActiveClubCount(timeRange: DashboardTimeRange): number {
    const entries = this.getEntries();
    const summary = aggregatePlatformEntries(entries, timeRange);
    return summary.activeClubs;
  }

  /**
   * Get unique player count
   */
  getUniquePlayerCount(timeRange: DashboardTimeRange): number {
    const entries = this.getEntries();
    const summary = aggregatePlatformEntries(entries, timeRange);
    return summary.uniquePlayers;
  }

  /**
   * Get total hands played
   */
  getTotalHandsPlayed(timeRange: DashboardTimeRange): number {
    const entries = this.getEntries();
    const summary = aggregatePlatformEntries(entries, timeRange);
    return summary.handsPlayed;
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a platform finance view
 */
export function createPlatformFinanceView(
  entryProvider: () => readonly AggregationEntry[]
): PlatformFinanceView {
  return new PlatformFinanceView(entryProvider);
}
