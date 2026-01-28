/**
 * TopUpView.ts
 * Phase 28 - External Top-Up Integration Boundary (Blueprint)
 *
 * Read-only queries for top-up data.
 *
 * CAPABILITIES:
 * - Total top-ups per player
 * - Time-windowed top-ups
 * - Per-club / per-table summaries
 *
 * HARD CONSTRAINTS:
 * - READ-ONLY (no mutations)
 * - Derives exclusively from ledger entries
 * - No side effects
 * - Pure functions for all queries
 */

import { PlayerId } from '../security/Identity';
import { TableId } from '../security/AuditLog';
import { ClubId } from '../club/ClubTypes';
import { LedgerEntry } from '../ledger/LedgerTypes';
import { ValueLedger } from '../ledger/LedgerEntry';

import {
  TopUpQueryResult,
  TopUpTimeWindow,
  PlayerTopUpSummary,
  ClubTopUpSummary,
  TableTopUpSummary,
} from './TopUpTypes';

// ============================================================================
// Top-Up View Implementation
// ============================================================================

/**
 * Read-only view for top-up queries
 *
 * This view derives all data from ledger entries with source = 'TOP_UP'.
 * It does not maintain any state of its own.
 *
 * KEY INVARIANTS:
 * - All methods are read-only
 * - All results derived from ledger
 * - No mutations or side effects
 */
export class TopUpView {
  private readonly ledger: ValueLedger;

  constructor(ledger: ValueLedger) {
    this.ledger = ledger;
  }

  // ==========================================================================
  // Player Queries
  // ==========================================================================

  /**
   * Get total top-ups for a player
   */
  getTotalForPlayer(
    playerId: PlayerId,
    timeWindow?: TopUpTimeWindow
  ): number {
    const entries = this.getPlayerTopUpEntries(playerId, timeWindow);
    return entries.reduce((sum, entry) => sum + entry.delta, 0);
  }

  /**
   * Get top-up count for a player
   */
  getCountForPlayer(
    playerId: PlayerId,
    timeWindow?: TopUpTimeWindow
  ): number {
    return this.getPlayerTopUpEntries(playerId, timeWindow).length;
  }

  /**
   * Get full summary for a player
   */
  getPlayerSummary(
    playerId: PlayerId,
    timeWindow?: TopUpTimeWindow
  ): TopUpQueryResult<PlayerTopUpSummary> {
    try {
      const entries = this.getPlayerTopUpEntries(playerId, timeWindow);

      if (entries.length === 0) {
        return {
          success: true,
          data: {
            playerId,
            totalAmount: 0,
            topUpCount: 0,
            firstTopUpAt: null,
            lastTopUpAt: null,
          },
        };
      }

      // Entries are in sequence order, so first/last timestamps
      const sortedByTime = [...entries].sort((a, b) => a.timestamp - b.timestamp);
      const firstTopUpAt = sortedByTime[0].timestamp;
      const lastTopUpAt = sortedByTime[sortedByTime.length - 1].timestamp;

      return {
        success: true,
        data: {
          playerId,
          totalAmount: entries.reduce((sum, e) => sum + e.delta, 0),
          topUpCount: entries.length,
          firstTopUpAt,
          lastTopUpAt,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Query failed',
      };
    }
  }

  /**
   * Get all player IDs who have received top-ups
   */
  getAllPlayerIds(timeWindow?: TopUpTimeWindow): PlayerId[] {
    const entries = this.getAllTopUpEntries(timeWindow);
    const playerIds = new Set<PlayerId>();

    for (const entry of entries) {
      if (entry.affectedParty.playerId) {
        playerIds.add(entry.affectedParty.playerId);
      }
    }

    return Array.from(playerIds);
  }

  // ==========================================================================
  // Club Queries
  // ==========================================================================

  /**
   * Get total top-ups for a club
   */
  getTotalForClub(
    clubId: ClubId,
    timeWindow?: TopUpTimeWindow
  ): number {
    const entries = this.getClubTopUpEntries(clubId, timeWindow);
    return entries.reduce((sum, entry) => sum + entry.delta, 0);
  }

  /**
   * Get full summary for a club
   */
  getClubSummary(
    clubId: ClubId,
    timeWindow?: TopUpTimeWindow
  ): TopUpQueryResult<ClubTopUpSummary> {
    try {
      const entries = this.getClubTopUpEntries(clubId, timeWindow);

      // Count unique players
      const playerIds = new Set<string>();
      for (const entry of entries) {
        if (entry.affectedParty.playerId) {
          playerIds.add(entry.affectedParty.playerId);
        }
      }

      return {
        success: true,
        data: {
          clubId,
          totalAmount: entries.reduce((sum, e) => sum + e.delta, 0),
          topUpCount: entries.length,
          uniquePlayers: playerIds.size,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Query failed',
      };
    }
  }

  /**
   * Get all club IDs with top-ups
   */
  getAllClubIds(timeWindow?: TopUpTimeWindow): ClubId[] {
    const entries = this.getAllTopUpEntries(timeWindow);
    const clubIds = new Set<ClubId>();

    for (const entry of entries) {
      if (entry.clubId) {
        clubIds.add(entry.clubId);
      }
    }

    return Array.from(clubIds);
  }

  // ==========================================================================
  // Table Queries
  // ==========================================================================

  /**
   * Get total top-ups for a table
   */
  getTotalForTable(
    tableId: TableId,
    timeWindow?: TopUpTimeWindow
  ): number {
    const entries = this.getTableTopUpEntries(tableId, timeWindow);
    return entries.reduce((sum, entry) => sum + entry.delta, 0);
  }

  /**
   * Get full summary for a table
   */
  getTableSummary(
    tableId: TableId,
    timeWindow?: TopUpTimeWindow
  ): TopUpQueryResult<TableTopUpSummary> {
    try {
      const entries = this.getTableTopUpEntries(tableId, timeWindow);

      if (entries.length === 0) {
        return {
          success: true,
          data: {
            tableId,
            clubId: '' as ClubId,
            totalAmount: 0,
            topUpCount: 0,
          },
        };
      }

      // Get clubId from first entry
      const clubId = entries[0].clubId ?? ('' as ClubId);

      return {
        success: true,
        data: {
          tableId,
          clubId,
          totalAmount: entries.reduce((sum, e) => sum + e.delta, 0),
          topUpCount: entries.length,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Query failed',
      };
    }
  }

  // ==========================================================================
  // Aggregate Queries
  // ==========================================================================

  /**
   * Get total top-ups across all players
   */
  getTotalTopUps(timeWindow?: TopUpTimeWindow): number {
    const entries = this.getAllTopUpEntries(timeWindow);
    return entries.reduce((sum, entry) => sum + entry.delta, 0);
  }

  /**
   * Get total top-up count
   */
  getTotalCount(timeWindow?: TopUpTimeWindow): number {
    return this.getAllTopUpEntries(timeWindow).length;
  }

  /**
   * Get top-ups grouped by player
   */
  getTopUpsByPlayer(
    timeWindow?: TopUpTimeWindow
  ): ReadonlyMap<PlayerId, number> {
    const entries = this.getAllTopUpEntries(timeWindow);
    const byPlayer = new Map<PlayerId, number>();

    for (const entry of entries) {
      if (entry.affectedParty.playerId) {
        const playerId = entry.affectedParty.playerId;
        const current = byPlayer.get(playerId) ?? 0;
        byPlayer.set(playerId, current + entry.delta);
      }
    }

    return byPlayer;
  }

  /**
   * Get top-ups grouped by club
   */
  getTopUpsByClub(
    timeWindow?: TopUpTimeWindow
  ): ReadonlyMap<ClubId, number> {
    const entries = this.getAllTopUpEntries(timeWindow);
    const byClub = new Map<ClubId, number>();

    for (const entry of entries) {
      if (entry.clubId) {
        const current = byClub.get(entry.clubId) ?? 0;
        byClub.set(entry.clubId, current + entry.delta);
      }
    }

    return byClub;
  }

  // ==========================================================================
  // Internal Entry Access
  // ==========================================================================

  /**
   * Get all top-up entries
   */
  private getAllTopUpEntries(timeWindow?: TopUpTimeWindow): readonly LedgerEntry[] {
    return this.ledger.getAllEntries().filter(entry => {
      if (entry.source !== 'TOP_UP') {
        return false;
      }

      if (timeWindow) {
        return entry.timestamp >= timeWindow.fromTimestamp &&
               entry.timestamp <= timeWindow.toTimestamp;
      }

      return true;
    });
  }

  /**
   * Get top-up entries for a player
   */
  private getPlayerTopUpEntries(
    playerId: PlayerId,
    timeWindow?: TopUpTimeWindow
  ): readonly LedgerEntry[] {
    return this.getAllTopUpEntries(timeWindow).filter(entry =>
      entry.affectedParty.partyType === 'PLAYER' &&
      entry.affectedParty.playerId === playerId
    );
  }

  /**
   * Get top-up entries for a club
   */
  private getClubTopUpEntries(
    clubId: ClubId,
    timeWindow?: TopUpTimeWindow
  ): readonly LedgerEntry[] {
    return this.getAllTopUpEntries(timeWindow).filter(entry =>
      entry.clubId === clubId
    );
  }

  /**
   * Get top-up entries for a table
   */
  private getTableTopUpEntries(
    tableId: TableId,
    timeWindow?: TopUpTimeWindow
  ): readonly LedgerEntry[] {
    return this.getAllTopUpEntries(timeWindow).filter(entry =>
      entry.tableId === tableId
    );
  }

  // ==========================================================================
  // Statistics
  // ==========================================================================

  /**
   * Get view statistics
   */
  getStatistics(): {
    totalTopUps: number;
    totalAmount: number;
    uniquePlayers: number;
    uniqueClubs: number;
  } {
    const entries = this.getAllTopUpEntries();
    const playerIds = new Set<string>();
    const clubIds = new Set<string>();
    let totalAmount = 0;

    for (const entry of entries) {
      totalAmount += entry.delta;
      if (entry.affectedParty.playerId) {
        playerIds.add(entry.affectedParty.playerId);
      }
      if (entry.clubId) {
        clubIds.add(entry.clubId);
      }
    }

    return {
      totalTopUps: entries.length,
      totalAmount,
      uniquePlayers: playerIds.size,
      uniqueClubs: clubIds.size,
    };
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createTopUpView(ledger: ValueLedger): TopUpView {
  return new TopUpView(ledger);
}
