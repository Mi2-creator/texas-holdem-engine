/**
 * AdminCreditView.ts
 * Phase 29 - Admin Credit (Manual Top-Up) System
 *
 * Read-only queries for admin credit data.
 *
 * CAPABILITIES:
 * - Credits per admin
 * - Credits per player
 * - Credits by reason
 * - Time-range filters
 *
 * HARD CONSTRAINTS:
 * - READ-ONLY (no mutations)
 * - Derived exclusively from ledger entries + metadata
 * - No side effects
 * - Pure functions for all queries
 */

import { PlayerId } from '../security/Identity';
import { LedgerEntry } from '../ledger/LedgerTypes';
import { ValueLedger } from '../ledger/LedgerEntry';

import {
  AdminId,
  AdminCreditReason,
  AdminCreditTimeWindow,
  AdminCreditQueryResult,
  AdminCreditSummary,
  PlayerCreditSummary,
  ReasonCreditSummary,
  ADMIN_CREDIT_REASONS,
  emptyReasonBreakdown,
} from './AdminCreditTypes';

// ============================================================================
// Admin Credit View Implementation
// ============================================================================

/**
 * Read-only view for admin credit queries
 *
 * This view derives all data from ledger entries with:
 * - source = 'TOP_UP'
 * - metadata.source = 'ADMIN_CREDIT'
 *
 * It does not maintain any state of its own.
 *
 * KEY INVARIANTS:
 * - All methods are read-only
 * - All results derived from ledger
 * - No mutations or side effects
 */
export class AdminCreditView {
  private readonly ledger: ValueLedger;

  constructor(ledger: ValueLedger) {
    this.ledger = ledger;
  }

  // ==========================================================================
  // Admin Queries
  // ==========================================================================

  /**
   * Get total credits issued by an admin
   */
  getTotalByAdmin(
    adminId: AdminId,
    timeWindow?: AdminCreditTimeWindow
  ): number {
    const entries = this.getAdminCreditEntries(timeWindow)
      .filter(e => this.getAdminIdFromEntry(e) === adminId);
    return entries.reduce((sum, e) => sum + e.delta, 0);
  }

  /**
   * Get credit count by an admin
   */
  getCountByAdmin(
    adminId: AdminId,
    timeWindow?: AdminCreditTimeWindow
  ): number {
    return this.getAdminCreditEntries(timeWindow)
      .filter(e => this.getAdminIdFromEntry(e) === adminId)
      .length;
  }

  /**
   * Get full summary for an admin
   */
  getAdminSummary(
    adminId: AdminId,
    timeWindow?: AdminCreditTimeWindow
  ): AdminCreditQueryResult<AdminCreditSummary> {
    try {
      const entries = this.getAdminCreditEntries(timeWindow)
        .filter(e => this.getAdminIdFromEntry(e) === adminId);

      const byReason = emptyReasonBreakdown();
      let totalAmount = 0;

      for (const entry of entries) {
        totalAmount += entry.delta;
        const reason = this.getReasonFromEntry(entry);
        if (reason && ADMIN_CREDIT_REASONS.includes(reason)) {
          byReason[reason] += entry.delta;
        }
      }

      return {
        success: true,
        data: {
          adminId,
          totalAmount,
          creditCount: entries.length,
          byReason,
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
   * Get all admin IDs who have issued credits
   */
  getAllAdminIds(timeWindow?: AdminCreditTimeWindow): AdminId[] {
    const entries = this.getAdminCreditEntries(timeWindow);
    const adminIds = new Set<AdminId>();

    for (const entry of entries) {
      const adminId = this.getAdminIdFromEntry(entry);
      if (adminId) {
        adminIds.add(adminId);
      }
    }

    return Array.from(adminIds);
  }

  // ==========================================================================
  // Player Queries
  // ==========================================================================

  /**
   * Get total credits received by a player
   */
  getTotalByPlayer(
    playerId: PlayerId,
    timeWindow?: AdminCreditTimeWindow
  ): number {
    const entries = this.getAdminCreditEntries(timeWindow)
      .filter(e => e.affectedParty.playerId === playerId);
    return entries.reduce((sum, e) => sum + e.delta, 0);
  }

  /**
   * Get credit count for a player
   */
  getCountByPlayer(
    playerId: PlayerId,
    timeWindow?: AdminCreditTimeWindow
  ): number {
    return this.getAdminCreditEntries(timeWindow)
      .filter(e => e.affectedParty.playerId === playerId)
      .length;
  }

  /**
   * Get full summary for a player
   */
  getPlayerSummary(
    playerId: PlayerId,
    timeWindow?: AdminCreditTimeWindow
  ): AdminCreditQueryResult<PlayerCreditSummary> {
    try {
      const entries = this.getAdminCreditEntries(timeWindow)
        .filter(e => e.affectedParty.playerId === playerId);

      const byReason = emptyReasonBreakdown();
      let totalAmount = 0;

      for (const entry of entries) {
        totalAmount += entry.delta;
        const reason = this.getReasonFromEntry(entry);
        if (reason && ADMIN_CREDIT_REASONS.includes(reason)) {
          byReason[reason] += entry.delta;
        }
      }

      return {
        success: true,
        data: {
          playerId,
          totalAmount,
          creditCount: entries.length,
          byReason,
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
   * Get all player IDs who have received admin credits
   */
  getAllPlayerIds(timeWindow?: AdminCreditTimeWindow): PlayerId[] {
    const entries = this.getAdminCreditEntries(timeWindow);
    const playerIds = new Set<PlayerId>();

    for (const entry of entries) {
      if (entry.affectedParty.playerId) {
        playerIds.add(entry.affectedParty.playerId);
      }
    }

    return Array.from(playerIds);
  }

  // ==========================================================================
  // Reason Queries
  // ==========================================================================

  /**
   * Get total credits by reason
   */
  getTotalByReason(
    reason: AdminCreditReason,
    timeWindow?: AdminCreditTimeWindow
  ): number {
    const entries = this.getAdminCreditEntries(timeWindow)
      .filter(e => this.getReasonFromEntry(e) === reason);
    return entries.reduce((sum, e) => sum + e.delta, 0);
  }

  /**
   * Get summary by reason
   */
  getReasonSummary(
    reason: AdminCreditReason,
    timeWindow?: AdminCreditTimeWindow
  ): AdminCreditQueryResult<ReasonCreditSummary> {
    try {
      const entries = this.getAdminCreditEntries(timeWindow)
        .filter(e => this.getReasonFromEntry(e) === reason);

      const adminIds = new Set<string>();
      const playerIds = new Set<string>();
      let totalAmount = 0;

      for (const entry of entries) {
        totalAmount += entry.delta;
        const adminId = this.getAdminIdFromEntry(entry);
        if (adminId) {
          adminIds.add(adminId);
        }
        if (entry.affectedParty.playerId) {
          playerIds.add(entry.affectedParty.playerId);
        }
      }

      return {
        success: true,
        data: {
          reason,
          totalAmount,
          creditCount: entries.length,
          uniqueAdmins: adminIds.size,
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
   * Get breakdown by all reasons
   */
  getBreakdownByReason(
    timeWindow?: AdminCreditTimeWindow
  ): Record<AdminCreditReason, number> {
    const breakdown = emptyReasonBreakdown();
    const entries = this.getAdminCreditEntries(timeWindow);

    for (const entry of entries) {
      const reason = this.getReasonFromEntry(entry);
      if (reason && ADMIN_CREDIT_REASONS.includes(reason)) {
        breakdown[reason] += entry.delta;
      }
    }

    return breakdown;
  }

  // ==========================================================================
  // Aggregate Queries
  // ==========================================================================

  /**
   * Get total admin credits
   */
  getTotalCredits(timeWindow?: AdminCreditTimeWindow): number {
    const entries = this.getAdminCreditEntries(timeWindow);
    return entries.reduce((sum, e) => sum + e.delta, 0);
  }

  /**
   * Get total credit count
   */
  getTotalCount(timeWindow?: AdminCreditTimeWindow): number {
    return this.getAdminCreditEntries(timeWindow).length;
  }

  /**
   * Get credits grouped by admin
   */
  getCreditsByAdmin(
    timeWindow?: AdminCreditTimeWindow
  ): ReadonlyMap<AdminId, number> {
    const entries = this.getAdminCreditEntries(timeWindow);
    const byAdmin = new Map<AdminId, number>();

    for (const entry of entries) {
      const adminId = this.getAdminIdFromEntry(entry);
      if (adminId) {
        const current = byAdmin.get(adminId) ?? 0;
        byAdmin.set(adminId, current + entry.delta);
      }
    }

    return byAdmin;
  }

  /**
   * Get credits grouped by player
   */
  getCreditsByPlayer(
    timeWindow?: AdminCreditTimeWindow
  ): ReadonlyMap<PlayerId, number> {
    const entries = this.getAdminCreditEntries(timeWindow);
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

  // ==========================================================================
  // Internal Entry Access
  // ==========================================================================

  /**
   * Get all admin credit entries from ledger
   *
   * Admin credits are identified by:
   * - source = 'TOP_UP'
   * - metadata.source = 'ADMIN_CREDIT'
   */
  private getAdminCreditEntries(
    timeWindow?: AdminCreditTimeWindow
  ): readonly LedgerEntry[] {
    return this.ledger.getAllEntries().filter(entry => {
      // Must be a TOP_UP entry
      if (entry.source !== 'TOP_UP') {
        return false;
      }

      // Must have ADMIN_CREDIT source in metadata
      if (entry.metadata?.source !== 'ADMIN_CREDIT') {
        return false;
      }

      // Apply time window filter if provided
      if (timeWindow) {
        return entry.timestamp >= timeWindow.fromTimestamp &&
               entry.timestamp <= timeWindow.toTimestamp;
      }

      return true;
    });
  }

  /**
   * Extract adminId from entry metadata
   */
  private getAdminIdFromEntry(entry: LedgerEntry): AdminId | undefined {
    const adminId = entry.metadata?.adminId;
    return typeof adminId === 'string' ? (adminId as AdminId) : undefined;
  }

  /**
   * Extract reason from entry metadata
   */
  private getReasonFromEntry(entry: LedgerEntry): AdminCreditReason | undefined {
    const reason = entry.metadata?.reason;
    return ADMIN_CREDIT_REASONS.includes(reason as AdminCreditReason)
      ? (reason as AdminCreditReason)
      : undefined;
  }

  // ==========================================================================
  // Statistics
  // ==========================================================================

  /**
   * Get view statistics
   */
  getStatistics(): {
    totalCredits: number;
    totalAmount: number;
    uniqueAdmins: number;
    uniquePlayers: number;
    byReason: Record<AdminCreditReason, number>;
  } {
    const entries = this.getAdminCreditEntries();
    const adminIds = new Set<string>();
    const playerIds = new Set<string>();
    const byReason = emptyReasonBreakdown();
    let totalAmount = 0;

    for (const entry of entries) {
      totalAmount += entry.delta;

      const adminId = this.getAdminIdFromEntry(entry);
      if (adminId) {
        adminIds.add(adminId);
      }

      if (entry.affectedParty.playerId) {
        playerIds.add(entry.affectedParty.playerId);
      }

      const reason = this.getReasonFromEntry(entry);
      if (reason && ADMIN_CREDIT_REASONS.includes(reason)) {
        byReason[reason] += entry.delta;
      }
    }

    return {
      totalCredits: entries.length,
      totalAmount,
      uniqueAdmins: adminIds.size,
      uniquePlayers: playerIds.size,
      byReason,
    };
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createAdminCreditView(ledger: ValueLedger): AdminCreditView {
  return new AdminCreditView(ledger);
}
