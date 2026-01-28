/**
 * TableFinanceView.ts
 * Phase 30 - Admin & Club Financial Dashboard (Read-Only)
 *
 * Read-only view for table-level finance data.
 *
 * PROVIDES:
 * - Table finance summaries
 * - Hand history
 * - Ranking queries
 *
 * HARD CONSTRAINTS:
 * - Read-only (no writes)
 * - No side effects
 * - Pure aggregation from ledger
 */

import { TableId } from '../../security/AuditLog';
import { ClubId } from '../../club/ClubTypes';
import {
  TableFinanceSummary,
  HandSummary,
  DashboardTimeRange,
  AggregationEntry,
  DashboardQueryResult,
} from '../types';
import {
  aggregateTableEntries,
  aggregateAllTables,
  aggregateTablesInClub,
  getTopTablesByRake,
  getTopTablesByHandsPlayed,
  getTopTablesByPlayerCount,
  getTopTablesByPotVolume,
  getLargestPots,
  getHighestRakeHands,
} from '../Aggregators';

// ============================================================================
// Table Finance View
// ============================================================================

/**
 * Read-only view for table-level finance data
 *
 * This class provides query interfaces for table finance summaries.
 * All data is derived from ledger entries - no stored state.
 */
export class TableFinanceView {
  private readonly getEntries: () => readonly AggregationEntry[];
  private readonly tableToClub: Map<TableId, ClubId>;

  constructor(
    entryProvider: () => readonly AggregationEntry[],
    tableToClub: Map<TableId, ClubId> = new Map()
  ) {
    this.getEntries = entryProvider;
    this.tableToClub = tableToClub;
  }

  // ==========================================================================
  // Table Mapping
  // ==========================================================================

  /**
   * Register a table's club
   */
  registerTable(tableId: TableId, clubId: ClubId): void {
    this.tableToClub.set(tableId, clubId);
  }

  /**
   * Get a table's club
   */
  getTableClub(tableId: TableId): ClubId | undefined {
    return this.tableToClub.get(tableId);
  }

  // ==========================================================================
  // Single Table Queries
  // ==========================================================================

  /**
   * Get finance summary for a single table
   */
  getTableSummary(
    tableId: TableId,
    timeRange: DashboardTimeRange,
    recentHandsLimit: number = 20
  ): DashboardQueryResult<TableFinanceSummary> {
    try {
      const entries = this.getEntries();
      const clubId = this.tableToClub.get(tableId) ?? ('' as ClubId);
      const summary = aggregateTableEntries(
        tableId,
        clubId,
        entries,
        timeRange,
        recentHandsLimit
      );
      return { success: true, data: summary };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get recent hands for a table
   */
  getRecentHands(
    tableId: TableId,
    timeRange: DashboardTimeRange,
    limit: number = 20
  ): DashboardQueryResult<readonly HandSummary[]> {
    try {
      const result = this.getTableSummary(tableId, timeRange, limit);
      if (!result.success || !result.data) {
        return { success: false, error: result.error };
      }
      return { success: true, data: result.data.recentHands };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ==========================================================================
  // Multi-Table Queries
  // ==========================================================================

  /**
   * Get all table summaries
   */
  getAllTableSummaries(
    timeRange: DashboardTimeRange,
    recentHandsLimit: number = 20
  ): DashboardQueryResult<Map<TableId, TableFinanceSummary>> {
    try {
      const entries = this.getEntries();
      const summaries = aggregateAllTables(
        entries,
        timeRange,
        this.tableToClub,
        recentHandsLimit
      );
      return { success: true, data: summaries };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get table summaries for a specific club
   */
  getClubTableSummaries(
    clubId: ClubId,
    timeRange: DashboardTimeRange,
    recentHandsLimit: number = 20
  ): DashboardQueryResult<Map<TableId, TableFinanceSummary>> {
    try {
      const entries = this.getEntries();
      const summaries = aggregateTablesInClub(
        clubId,
        entries,
        timeRange,
        recentHandsLimit
      );
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
   * Get top tables by rake
   */
  getTopTablesByRake(
    timeRange: DashboardTimeRange,
    limit: number = 10
  ): DashboardQueryResult<TableFinanceSummary[]> {
    try {
      const entries = this.getEntries();
      const topTables = getTopTablesByRake(entries, timeRange, this.tableToClub, limit);
      return { success: true, data: topTables };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get top tables by hands played
   */
  getTopTablesByHandsPlayed(
    timeRange: DashboardTimeRange,
    limit: number = 10
  ): DashboardQueryResult<TableFinanceSummary[]> {
    try {
      const entries = this.getEntries();
      const topTables = getTopTablesByHandsPlayed(entries, timeRange, this.tableToClub, limit);
      return { success: true, data: topTables };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get top tables by player count
   */
  getTopTablesByPlayerCount(
    timeRange: DashboardTimeRange,
    limit: number = 10
  ): DashboardQueryResult<TableFinanceSummary[]> {
    try {
      const entries = this.getEntries();
      const topTables = getTopTablesByPlayerCount(entries, timeRange, this.tableToClub, limit);
      return { success: true, data: topTables };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get top tables by pot volume
   */
  getTopTablesByPotVolume(
    timeRange: DashboardTimeRange,
    limit: number = 10
  ): DashboardQueryResult<TableFinanceSummary[]> {
    try {
      const entries = this.getEntries();
      const topTables = getTopTablesByPotVolume(entries, timeRange, this.tableToClub, limit);
      return { success: true, data: topTables };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ==========================================================================
  // Hand Analysis
  // ==========================================================================

  /**
   * Get largest pots across all tables
   */
  getLargestPots(
    timeRange: DashboardTimeRange,
    limit: number = 10
  ): DashboardQueryResult<HandSummary[]> {
    try {
      const entries = this.getEntries();
      const hands = getLargestPots(entries, timeRange, limit);
      return { success: true, data: hands };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get highest rake hands across all tables
   */
  getHighestRakeHands(
    timeRange: DashboardTimeRange,
    limit: number = 10
  ): DashboardQueryResult<HandSummary[]> {
    try {
      const entries = this.getEntries();
      const hands = getHighestRakeHands(entries, timeRange, limit);
      return { success: true, data: hands };
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
   * Get active table count
   */
  getActiveTableCount(timeRange: DashboardTimeRange): number {
    const entries = this.getEntries();
    const summaries = aggregateAllTables(entries, timeRange, this.tableToClub);
    return summaries.size;
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a table finance view
 */
export function createTableFinanceView(
  entryProvider: () => readonly AggregationEntry[],
  tableToClub?: Map<TableId, ClubId>
): TableFinanceView {
  return new TableFinanceView(entryProvider, tableToClub);
}
