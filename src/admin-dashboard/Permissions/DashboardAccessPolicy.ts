/**
 * DashboardAccessPolicy.ts
 * Phase 30 - Admin & Club Financial Dashboard (Read-Only)
 *
 * Access control for dashboard views.
 *
 * ROLES:
 * - PLATFORM_ADMIN: Full access to all data
 * - CLUB_OWNER: Full access to owned clubs
 * - CLUB_MANAGER: Limited access to assigned tables
 * - PLAYER: Own data only
 *
 * HARD CONSTRAINTS:
 * - Read-only permissions only
 * - No write capabilities
 * - Hierarchical access model
 */

import { PlayerId } from '../../security/Identity';
import { TableId } from '../../security/AuditLog';
import { ClubId } from '../../club/ClubTypes';
import { DashboardRole, DashboardAccessScope } from '../types';

// ============================================================================
// Access Check Results
// ============================================================================

/**
 * Result of an access check
 */
export interface AccessCheckResult {
  readonly allowed: boolean;
  readonly reason?: string;
}

/**
 * Create allowed result
 */
function allowed(): AccessCheckResult {
  return { allowed: true };
}

/**
 * Create denied result
 */
function denied(reason: string): AccessCheckResult {
  return { allowed: false, reason };
}

// ============================================================================
// Dashboard Access Policy
// ============================================================================

/**
 * Access control policy for dashboard views
 *
 * This class implements role-based access control for dashboard queries.
 * All access is read-only - there are no write permissions.
 */
export class DashboardAccessPolicy {
  private readonly platformAdmins: Set<string>;
  private readonly clubOwners: Map<string, Set<ClubId>>;
  private readonly clubManagers: Map<string, { clubs: Set<ClubId>; tables: Set<TableId> }>;
  private readonly players: Set<PlayerId>;

  constructor() {
    this.platformAdmins = new Set();
    this.clubOwners = new Map();
    this.clubManagers = new Map();
    this.players = new Set();
  }

  // ==========================================================================
  // Registration
  // ==========================================================================

  /**
   * Register a platform admin
   */
  registerPlatformAdmin(userId: string): void {
    this.platformAdmins.add(userId);
  }

  /**
   * Unregister a platform admin
   */
  unregisterPlatformAdmin(userId: string): void {
    this.platformAdmins.delete(userId);
  }

  /**
   * Register a club owner
   */
  registerClubOwner(userId: string, clubId: ClubId): void {
    let clubs = this.clubOwners.get(userId);
    if (!clubs) {
      clubs = new Set();
      this.clubOwners.set(userId, clubs);
    }
    clubs.add(clubId);
  }

  /**
   * Unregister a club owner
   */
  unregisterClubOwner(userId: string, clubId: ClubId): void {
    const clubs = this.clubOwners.get(userId);
    if (clubs) {
      clubs.delete(clubId);
      if (clubs.size === 0) {
        this.clubOwners.delete(userId);
      }
    }
  }

  /**
   * Register a club manager
   */
  registerClubManager(userId: string, clubId: ClubId, tableIds?: readonly TableId[]): void {
    let data = this.clubManagers.get(userId);
    if (!data) {
      data = { clubs: new Set(), tables: new Set() };
      this.clubManagers.set(userId, data);
    }
    data.clubs.add(clubId);
    if (tableIds) {
      for (const tableId of tableIds) {
        data.tables.add(tableId);
      }
    }
  }

  /**
   * Unregister a club manager
   */
  unregisterClubManager(userId: string, clubId: ClubId): void {
    const data = this.clubManagers.get(userId);
    if (data) {
      data.clubs.delete(clubId);
      if (data.clubs.size === 0) {
        this.clubManagers.delete(userId);
      }
    }
  }

  /**
   * Register a player
   */
  registerPlayer(playerId: PlayerId): void {
    this.players.add(playerId);
  }

  /**
   * Unregister a player
   */
  unregisterPlayer(playerId: PlayerId): void {
    this.players.delete(playerId);
  }

  // ==========================================================================
  // Role Queries
  // ==========================================================================

  /**
   * Get user's role
   */
  getUserRole(userId: string): DashboardRole | null {
    if (this.platformAdmins.has(userId)) {
      return 'PLATFORM_ADMIN';
    }
    if (this.clubOwners.has(userId)) {
      return 'CLUB_OWNER';
    }
    if (this.clubManagers.has(userId)) {
      return 'CLUB_MANAGER';
    }
    if (this.players.has(userId as PlayerId)) {
      return 'PLAYER';
    }
    return null;
  }

  /**
   * Get user's access scope
   */
  getAccessScope(userId: string): DashboardAccessScope | null {
    const role = this.getUserRole(userId);
    if (!role) return null;

    switch (role) {
      case 'PLATFORM_ADMIN':
        return { role, userId };

      case 'CLUB_OWNER': {
        const clubs = this.clubOwners.get(userId);
        return {
          role,
          userId,
          clubIds: clubs ? Array.from(clubs) : [],
        };
      }

      case 'CLUB_MANAGER': {
        const data = this.clubManagers.get(userId);
        return {
          role,
          userId,
          clubIds: data ? Array.from(data.clubs) : [],
          tableIds: data ? Array.from(data.tables) : [],
        };
      }

      case 'PLAYER':
        return { role, userId };
    }
  }

  // ==========================================================================
  // Platform Access Checks
  // ==========================================================================

  /**
   * Check if user can view platform-level data
   */
  canViewPlatform(userId: string): AccessCheckResult {
    if (this.platformAdmins.has(userId)) {
      return allowed();
    }
    return denied('Only platform admins can view platform-level data');
  }

  /**
   * Check if user can view all clubs
   */
  canViewAllClubs(userId: string): AccessCheckResult {
    if (this.platformAdmins.has(userId)) {
      return allowed();
    }
    return denied('Only platform admins can view all clubs');
  }

  // ==========================================================================
  // Club Access Checks
  // ==========================================================================

  /**
   * Check if user can view a specific club
   */
  canViewClub(userId: string, clubId: ClubId): AccessCheckResult {
    // Platform admin can view all
    if (this.platformAdmins.has(userId)) {
      return allowed();
    }

    // Club owner can view their clubs
    const ownedClubs = this.clubOwners.get(userId);
    if (ownedClubs?.has(clubId)) {
      return allowed();
    }

    // Club manager can view assigned clubs
    const managerData = this.clubManagers.get(userId);
    if (managerData?.clubs.has(clubId)) {
      return allowed();
    }

    return denied(`User does not have access to club ${clubId}`);
  }

  /**
   * Get clubs a user can view
   */
  getViewableClubs(userId: string): ClubId[] {
    // Platform admin can view all - return empty (means no filter)
    if (this.platformAdmins.has(userId)) {
      return [];
    }

    const clubs = new Set<ClubId>();

    // Add owned clubs
    const ownedClubs = this.clubOwners.get(userId);
    if (ownedClubs) {
      for (const clubId of ownedClubs) {
        clubs.add(clubId);
      }
    }

    // Add managed clubs
    const managerData = this.clubManagers.get(userId);
    if (managerData) {
      for (const clubId of managerData.clubs) {
        clubs.add(clubId);
      }
    }

    return Array.from(clubs);
  }

  // ==========================================================================
  // Table Access Checks
  // ==========================================================================

  /**
   * Check if user can view a specific table
   */
  canViewTable(userId: string, tableId: TableId, clubId: ClubId): AccessCheckResult {
    // Platform admin can view all
    if (this.platformAdmins.has(userId)) {
      return allowed();
    }

    // Club owner can view all tables in their clubs
    const ownedClubs = this.clubOwners.get(userId);
    if (ownedClubs?.has(clubId)) {
      return allowed();
    }

    // Club manager can view assigned tables
    const managerData = this.clubManagers.get(userId);
    if (managerData?.clubs.has(clubId)) {
      // If no table restriction, can view all tables in club
      if (managerData.tables.size === 0) {
        return allowed();
      }
      // Otherwise, check table restriction
      if (managerData.tables.has(tableId)) {
        return allowed();
      }
      return denied(`Manager does not have access to table ${tableId}`);
    }

    return denied(`User does not have access to table ${tableId}`);
  }

  // ==========================================================================
  // Player Access Checks
  // ==========================================================================

  /**
   * Check if user can view a specific player's data
   */
  canViewPlayer(userId: string, targetPlayerId: PlayerId): AccessCheckResult {
    // Platform admin can view all
    if (this.platformAdmins.has(userId)) {
      return allowed();
    }

    // Players can view their own data
    if (userId === targetPlayerId && this.players.has(targetPlayerId)) {
      return allowed();
    }

    // Club owners can view players in their clubs
    // (This would need player-club mapping in real implementation)
    const ownedClubs = this.clubOwners.get(userId);
    if (ownedClubs && ownedClubs.size > 0) {
      // In real implementation, check if player is in owned clubs
      return allowed();
    }

    return denied(`User cannot view player ${targetPlayerId}`);
  }

  /**
   * Check if user can view all players
   */
  canViewAllPlayers(userId: string): AccessCheckResult {
    if (this.platformAdmins.has(userId)) {
      return allowed();
    }
    return denied('Only platform admins can view all players');
  }

  // ==========================================================================
  // Admin Credit Access Checks
  // ==========================================================================

  /**
   * Check if user can view admin credit data
   */
  canViewAdminCredits(userId: string): AccessCheckResult {
    if (this.platformAdmins.has(userId)) {
      return allowed();
    }
    return denied('Only platform admins can view admin credit data');
  }

  // ==========================================================================
  // Statistics
  // ==========================================================================

  /**
   * Get policy statistics
   */
  getStatistics(): {
    platformAdminCount: number;
    clubOwnerCount: number;
    clubManagerCount: number;
    playerCount: number;
  } {
    return {
      platformAdminCount: this.platformAdmins.size,
      clubOwnerCount: this.clubOwners.size,
      clubManagerCount: this.clubManagers.size,
      playerCount: this.players.size,
    };
  }

  /**
   * Clear all registrations (for testing)
   */
  clear(): void {
    this.platformAdmins.clear();
    this.clubOwners.clear();
    this.clubManagers.clear();
    this.players.clear();
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a dashboard access policy
 */
export function createDashboardAccessPolicy(): DashboardAccessPolicy {
  return new DashboardAccessPolicy();
}
