/**
 * ClubManager.ts
 * Phase 21 - Club management operations
 *
 * Provides club creation, membership management, and configuration.
 * All operations are auditable and return structured results.
 */

import { PlayerId } from '../security/Identity';
import {
  ClubId,
  MembershipId,
  Club,
  ClubMember,
  ClubConfig,
  ClubRole,
  MembershipStatus,
  RakePolicyRef,
  AuthorityEvent,
  AuthorityEventType,
  DEFAULT_CLUB_CONFIG,
  generateClubId,
  generateMembershipId,
  generateEventId,
} from './ClubTypes';

// ============================================================================
// Operation Results
// ============================================================================

export interface ClubOperationResult<T = void> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: ClubOperationError;
}

export interface ClubOperationError {
  readonly code: ClubErrorCode;
  readonly message: string;
  readonly details?: Record<string, unknown>;
}

export type ClubErrorCode =
  | 'CLUB_NOT_FOUND'
  | 'CLUB_ALREADY_EXISTS'
  | 'MEMBER_NOT_FOUND'
  | 'MEMBER_ALREADY_EXISTS'
  | 'INVALID_ROLE'
  | 'INVALID_STATUS'
  | 'OWNER_CANNOT_LEAVE'
  | 'OWNER_CANNOT_BE_BANNED'
  | 'CANNOT_DEMOTE_OWNER'
  | 'INVALID_CONFIG'
  | 'CLUB_NOT_ACTIVE'
  | 'MEMBER_BANNED'
  | 'MEMBER_NOT_ACTIVE';

// ============================================================================
// ClubManager Implementation
// ============================================================================

export class ClubManager {
  private readonly clubs: Map<ClubId, Club>;
  private readonly members: Map<MembershipId, ClubMember>;
  private readonly membersByClub: Map<ClubId, Set<MembershipId>>;
  private readonly membersByPlayer: Map<PlayerId, Map<ClubId, MembershipId>>;
  private readonly eventLog: AuthorityEvent[];
  private readonly eventListeners: Set<(event: AuthorityEvent) => void>;

  constructor() {
    this.clubs = new Map();
    this.members = new Map();
    this.membersByClub = new Map();
    this.membersByPlayer = new Map();
    this.eventLog = [];
    this.eventListeners = new Set();
  }

  // ==========================================================================
  // Club Operations
  // ==========================================================================

  /**
   * Create a new club
   */
  createClub(
    name: string,
    ownerId: PlayerId,
    config?: Partial<ClubConfig>
  ): ClubOperationResult<Club> {
    const clubId = generateClubId();
    const now = Date.now();

    const clubConfig: ClubConfig = {
      ...DEFAULT_CLUB_CONFIG,
      ...config,
      configId: `config_${clubId}`,
      createdAt: now,
      updatedAt: now,
    };

    // Validate config
    const configError = this.validateConfig(clubConfig);
    if (configError) {
      return { success: false, error: configError };
    }

    const club: Club = {
      clubId,
      name,
      ownerId,
      managerIds: [],
      config: clubConfig,
      rakePolicyRef: null,
      createdAt: now,
      updatedAt: now,
      isActive: true,
    };

    this.clubs.set(clubId, club);
    this.membersByClub.set(clubId, new Set());

    // Auto-add owner as a member
    const memberResult = this.addMemberInternal(clubId, ownerId, 'OWNER', null);
    if (!memberResult.success) {
      // Rollback club creation
      this.clubs.delete(clubId);
      this.membersByClub.delete(clubId);
      return { success: false, error: memberResult.error };
    }

    this.emitEvent('club_created', clubId, ownerId, undefined, { name, config: clubConfig });

    return { success: true, data: club };
  }

  /**
   * Get a club by ID
   */
  getClub(clubId: ClubId): Club | null {
    return this.clubs.get(clubId) ?? null;
  }

  /**
   * Update club configuration
   */
  updateClubConfig(
    clubId: ClubId,
    updates: Partial<ClubConfig>
  ): ClubOperationResult<Club> {
    const club = this.clubs.get(clubId);
    if (!club) {
      return {
        success: false,
        error: { code: 'CLUB_NOT_FOUND', message: `Club ${clubId} not found` },
      };
    }

    if (!club.isActive) {
      return {
        success: false,
        error: { code: 'CLUB_NOT_ACTIVE', message: 'Club is not active' },
      };
    }

    const now = Date.now();
    const newConfig: ClubConfig = {
      ...club.config,
      ...updates,
      configId: club.config.configId,
      createdAt: club.config.createdAt,
      updatedAt: now,
    };

    const configError = this.validateConfig(newConfig);
    if (configError) {
      return { success: false, error: configError };
    }

    const updatedClub: Club = {
      ...club,
      config: newConfig,
      updatedAt: now,
    };

    this.clubs.set(clubId, updatedClub);
    this.emitEvent('club_config_updated', clubId, club.ownerId, undefined, {
      oldConfig: club.config,
      newConfig,
    });

    return { success: true, data: updatedClub };
  }

  /**
   * Update club rake policy reference
   */
  updateRakePolicy(
    clubId: ClubId,
    rakePolicyRef: RakePolicyRef
  ): ClubOperationResult<Club> {
    const club = this.clubs.get(clubId);
    if (!club) {
      return {
        success: false,
        error: { code: 'CLUB_NOT_FOUND', message: `Club ${clubId} not found` },
      };
    }

    if (!club.isActive) {
      return {
        success: false,
        error: { code: 'CLUB_NOT_ACTIVE', message: 'Club is not active' },
      };
    }

    const now = Date.now();
    const updatedClub: Club = {
      ...club,
      rakePolicyRef,
      updatedAt: now,
    };

    this.clubs.set(clubId, updatedClub);
    this.emitEvent('club_rake_policy_updated', clubId, club.ownerId, undefined, {
      oldPolicy: club.rakePolicyRef,
      newPolicy: rakePolicyRef,
    });

    return { success: true, data: updatedClub };
  }

  /**
   * Deactivate a club
   */
  deactivateClub(clubId: ClubId): ClubOperationResult<Club> {
    const club = this.clubs.get(clubId);
    if (!club) {
      return {
        success: false,
        error: { code: 'CLUB_NOT_FOUND', message: `Club ${clubId} not found` },
      };
    }

    const updatedClub: Club = {
      ...club,
      isActive: false,
      updatedAt: Date.now(),
    };

    this.clubs.set(clubId, updatedClub);
    this.emitEvent('club_deleted', clubId, club.ownerId, undefined, {});

    return { success: true, data: updatedClub };
  }

  // ==========================================================================
  // Membership Operations
  // ==========================================================================

  /**
   * Invite a player to join a club
   */
  inviteMember(
    clubId: ClubId,
    playerId: PlayerId,
    invitedBy: PlayerId
  ): ClubOperationResult<ClubMember> {
    const club = this.clubs.get(clubId);
    if (!club) {
      return {
        success: false,
        error: { code: 'CLUB_NOT_FOUND', message: `Club ${clubId} not found` },
      };
    }

    if (!club.isActive) {
      return {
        success: false,
        error: { code: 'CLUB_NOT_ACTIVE', message: 'Club is not active' },
      };
    }

    // Check if already a member
    const existingMembership = this.getMembershipByPlayer(clubId, playerId);
    if (existingMembership) {
      if (existingMembership.status === 'BANNED') {
        return {
          success: false,
          error: { code: 'MEMBER_BANNED', message: 'Player is banned from this club' },
        };
      }
      if (existingMembership.status === 'ACTIVE') {
        return {
          success: false,
          error: { code: 'MEMBER_ALREADY_EXISTS', message: 'Player is already a member' },
        };
      }
    }

    const result = this.addMemberInternal(clubId, playerId, 'PLAYER', invitedBy, 'PENDING');
    if (result.success && result.data) {
      this.emitEvent('member_invited', clubId, invitedBy, playerId, {});
    }

    return result;
  }

  /**
   * Accept a club invitation
   */
  acceptInvitation(
    clubId: ClubId,
    playerId: PlayerId
  ): ClubOperationResult<ClubMember> {
    const membership = this.getMembershipByPlayer(clubId, playerId);
    if (!membership) {
      return {
        success: false,
        error: { code: 'MEMBER_NOT_FOUND', message: 'No invitation found' },
      };
    }

    if (membership.status !== 'PENDING') {
      return {
        success: false,
        error: { code: 'INVALID_STATUS', message: 'Invitation already processed' },
      };
    }

    const updated = this.updateMemberStatus(membership.membershipId, 'ACTIVE');
    if (updated.success && updated.data) {
      this.emitEvent('member_joined', clubId, playerId, undefined, {});
    }

    return updated;
  }

  /**
   * Add a member directly (for owner/manager invites that auto-accept)
   */
  addMember(
    clubId: ClubId,
    playerId: PlayerId,
    addedBy: PlayerId
  ): ClubOperationResult<ClubMember> {
    const club = this.clubs.get(clubId);
    if (!club) {
      return {
        success: false,
        error: { code: 'CLUB_NOT_FOUND', message: `Club ${clubId} not found` },
      };
    }

    if (!club.isActive) {
      return {
        success: false,
        error: { code: 'CLUB_NOT_ACTIVE', message: 'Club is not active' },
      };
    }

    // Check if already a member
    const existingMembership = this.getMembershipByPlayer(clubId, playerId);
    if (existingMembership) {
      if (existingMembership.status === 'BANNED') {
        return {
          success: false,
          error: { code: 'MEMBER_BANNED', message: 'Player is banned from this club' },
        };
      }
      if (existingMembership.status === 'ACTIVE' || existingMembership.status === 'PENDING') {
        return {
          success: false,
          error: { code: 'MEMBER_ALREADY_EXISTS', message: 'Player is already a member' },
        };
      }
    }

    const result = this.addMemberInternal(clubId, playerId, 'PLAYER', addedBy, 'ACTIVE');
    if (result.success && result.data) {
      this.emitEvent('member_joined', clubId, playerId, undefined, { addedBy });
    }

    return result;
  }

  /**
   * Remove a member from a club
   */
  removeMember(
    clubId: ClubId,
    playerId: PlayerId,
    removedBy: PlayerId
  ): ClubOperationResult {
    const club = this.clubs.get(clubId);
    if (!club) {
      return {
        success: false,
        error: { code: 'CLUB_NOT_FOUND', message: `Club ${clubId} not found` },
      };
    }

    const membership = this.getMembershipByPlayer(clubId, playerId);
    if (!membership) {
      return {
        success: false,
        error: { code: 'MEMBER_NOT_FOUND', message: 'Player is not a member' },
      };
    }

    // Owner cannot be removed
    if (membership.role === 'OWNER') {
      return {
        success: false,
        error: { code: 'OWNER_CANNOT_LEAVE', message: 'Owner cannot be removed' },
      };
    }

    const result = this.updateMemberStatus(membership.membershipId, 'LEFT');
    if (result.success) {
      this.emitEvent('member_left', clubId, removedBy, playerId, {});

      // If they were a manager, remove from managers list
      if (membership.role === 'MANAGER') {
        this.removeManagerRole(clubId, playerId);
      }
    }

    return { success: result.success, error: result.error };
  }

  /**
   * Ban a member from a club
   */
  banMember(
    clubId: ClubId,
    playerId: PlayerId,
    bannedBy: PlayerId,
    reason: string
  ): ClubOperationResult<ClubMember> {
    const club = this.clubs.get(clubId);
    if (!club) {
      return {
        success: false,
        error: { code: 'CLUB_NOT_FOUND', message: `Club ${clubId} not found` },
      };
    }

    const membership = this.getMembershipByPlayer(clubId, playerId);
    if (!membership) {
      return {
        success: false,
        error: { code: 'MEMBER_NOT_FOUND', message: 'Player is not a member' },
      };
    }

    // Owner cannot be banned
    if (membership.role === 'OWNER') {
      return {
        success: false,
        error: { code: 'OWNER_CANNOT_BE_BANNED', message: 'Owner cannot be banned' },
      };
    }

    const now = Date.now();
    const updated: ClubMember = {
      ...membership,
      status: 'BANNED',
      bannedBy,
      banReason: reason,
      updatedAt: now,
    };

    this.members.set(membership.membershipId, updated);

    // If they were a manager, remove from managers list
    if (membership.role === 'MANAGER') {
      this.removeManagerRole(clubId, playerId);
    }

    this.emitEvent('member_banned', clubId, bannedBy, playerId, { reason });

    return { success: true, data: updated };
  }

  /**
   * Unban a member
   */
  unbanMember(
    clubId: ClubId,
    playerId: PlayerId,
    unbannedBy: PlayerId
  ): ClubOperationResult<ClubMember> {
    const membership = this.getMembershipByPlayer(clubId, playerId);
    if (!membership) {
      return {
        success: false,
        error: { code: 'MEMBER_NOT_FOUND', message: 'Player is not a member' },
      };
    }

    if (membership.status !== 'BANNED') {
      return {
        success: false,
        error: { code: 'INVALID_STATUS', message: 'Player is not banned' },
      };
    }

    const now = Date.now();
    const updated: ClubMember = {
      ...membership,
      status: 'ACTIVE',
      bannedBy: null,
      banReason: null,
      updatedAt: now,
    };

    this.members.set(membership.membershipId, updated);
    this.emitEvent('member_unbanned', clubId, unbannedBy, playerId, {});

    return { success: true, data: updated };
  }

  /**
   * Promote a member to manager
   */
  promoteToManager(
    clubId: ClubId,
    playerId: PlayerId,
    promotedBy: PlayerId
  ): ClubOperationResult<ClubMember> {
    const club = this.clubs.get(clubId);
    if (!club) {
      return {
        success: false,
        error: { code: 'CLUB_NOT_FOUND', message: `Club ${clubId} not found` },
      };
    }

    const membership = this.getMembershipByPlayer(clubId, playerId);
    if (!membership) {
      return {
        success: false,
        error: { code: 'MEMBER_NOT_FOUND', message: 'Player is not a member' },
      };
    }

    if (membership.status !== 'ACTIVE') {
      return {
        success: false,
        error: { code: 'MEMBER_NOT_ACTIVE', message: 'Member must be active' },
      };
    }

    if (membership.role !== 'PLAYER') {
      return {
        success: false,
        error: { code: 'INVALID_ROLE', message: 'Can only promote players' },
      };
    }

    const now = Date.now();
    const updated: ClubMember = {
      ...membership,
      role: 'MANAGER',
      updatedAt: now,
    };

    this.members.set(membership.membershipId, updated);

    // Add to managers list
    const updatedClub: Club = {
      ...club,
      managerIds: [...club.managerIds, playerId],
      updatedAt: now,
    };
    this.clubs.set(clubId, updatedClub);

    this.emitEvent('member_promoted', clubId, promotedBy, playerId, { newRole: 'MANAGER' });

    return { success: true, data: updated };
  }

  /**
   * Demote a manager to player
   */
  demoteFromManager(
    clubId: ClubId,
    playerId: PlayerId,
    demotedBy: PlayerId
  ): ClubOperationResult<ClubMember> {
    const membership = this.getMembershipByPlayer(clubId, playerId);
    if (!membership) {
      return {
        success: false,
        error: { code: 'MEMBER_NOT_FOUND', message: 'Player is not a member' },
      };
    }

    if (membership.role === 'OWNER') {
      return {
        success: false,
        error: { code: 'CANNOT_DEMOTE_OWNER', message: 'Cannot demote owner' },
      };
    }

    if (membership.role !== 'MANAGER') {
      return {
        success: false,
        error: { code: 'INVALID_ROLE', message: 'Player is not a manager' },
      };
    }

    const now = Date.now();
    const updated: ClubMember = {
      ...membership,
      role: 'PLAYER',
      updatedAt: now,
    };

    this.members.set(membership.membershipId, updated);
    this.removeManagerRole(clubId, playerId);

    this.emitEvent('member_demoted', clubId, demotedBy, playerId, { newRole: 'PLAYER' });

    return { success: true, data: updated };
  }

  /**
   * Transfer club ownership
   */
  transferOwnership(
    clubId: ClubId,
    newOwnerId: PlayerId,
    currentOwnerId: PlayerId
  ): ClubOperationResult<Club> {
    const club = this.clubs.get(clubId);
    if (!club) {
      return {
        success: false,
        error: { code: 'CLUB_NOT_FOUND', message: `Club ${clubId} not found` },
      };
    }

    const newOwnerMembership = this.getMembershipByPlayer(clubId, newOwnerId);
    if (!newOwnerMembership || newOwnerMembership.status !== 'ACTIVE') {
      return {
        success: false,
        error: { code: 'MEMBER_NOT_FOUND', message: 'New owner must be an active member' },
      };
    }

    const currentOwnerMembership = this.getMembershipByPlayer(clubId, currentOwnerId);
    if (!currentOwnerMembership) {
      return {
        success: false,
        error: { code: 'MEMBER_NOT_FOUND', message: 'Current owner not found' },
      };
    }

    const now = Date.now();

    // Demote current owner to manager
    const demotedOwner: ClubMember = {
      ...currentOwnerMembership,
      role: 'MANAGER',
      updatedAt: now,
    };
    this.members.set(currentOwnerMembership.membershipId, demotedOwner);

    // Promote new owner
    const promotedOwner: ClubMember = {
      ...newOwnerMembership,
      role: 'OWNER',
      updatedAt: now,
    };
    this.members.set(newOwnerMembership.membershipId, promotedOwner);

    // Update club
    const updatedClub: Club = {
      ...club,
      ownerId: newOwnerId,
      managerIds: [
        ...club.managerIds.filter(id => id !== newOwnerId),
        currentOwnerId,
      ],
      updatedAt: now,
    };
    this.clubs.set(clubId, updatedClub);

    this.emitEvent('ownership_transferred', clubId, currentOwnerId, newOwnerId, {});

    return { success: true, data: updatedClub };
  }

  // ==========================================================================
  // Query Operations
  // ==========================================================================

  /**
   * Get a member by player ID in a club
   */
  getMember(clubId: ClubId, playerId: PlayerId): ClubMember | null {
    return this.getMembershipByPlayer(clubId, playerId);
  }

  /**
   * Get all members of a club
   */
  getClubMembers(clubId: ClubId): readonly ClubMember[] {
    const membershipIds = this.membersByClub.get(clubId);
    if (!membershipIds) {
      return [];
    }

    return Array.from(membershipIds)
      .map(id => this.members.get(id))
      .filter((m): m is ClubMember => m !== undefined);
  }

  /**
   * Get active members of a club
   */
  getActiveMembers(clubId: ClubId): readonly ClubMember[] {
    return this.getClubMembers(clubId).filter(m => m.status === 'ACTIVE');
  }

  /**
   * Get all clubs a player belongs to
   */
  getPlayerClubs(playerId: PlayerId): readonly Club[] {
    const clubMap = this.membersByPlayer.get(playerId);
    if (!clubMap) {
      return [];
    }

    return Array.from(clubMap.keys())
      .map(clubId => this.clubs.get(clubId))
      .filter((c): c is Club => c !== undefined);
  }

  /**
   * Check if a player is a member of a club
   */
  isMember(clubId: ClubId, playerId: PlayerId): boolean {
    const membership = this.getMembershipByPlayer(clubId, playerId);
    return membership !== null && membership.status === 'ACTIVE';
  }

  /**
   * Get player's role in a club
   */
  getPlayerRole(clubId: ClubId, playerId: PlayerId): ClubRole | null {
    const membership = this.getMembershipByPlayer(clubId, playerId);
    if (!membership || membership.status !== 'ACTIVE') {
      return null;
    }
    return membership.role;
  }

  /**
   * Get event log
   */
  getEventLog(): readonly AuthorityEvent[] {
    return [...this.eventLog];
  }

  /**
   * Get events for a specific club
   */
  getClubEvents(clubId: ClubId): readonly AuthorityEvent[] {
    return this.eventLog.filter(e => e.clubId === clubId);
  }

  // ==========================================================================
  // Event System
  // ==========================================================================

  /**
   * Subscribe to events
   */
  onEvent(listener: (event: AuthorityEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  // ==========================================================================
  // Internal Helpers
  // ==========================================================================

  private addMemberInternal(
    clubId: ClubId,
    playerId: PlayerId,
    role: ClubRole,
    invitedBy: PlayerId | null,
    status: MembershipStatus = 'ACTIVE'
  ): ClubOperationResult<ClubMember> {
    const membershipId = generateMembershipId();
    const now = Date.now();

    const member: ClubMember = {
      membershipId,
      clubId,
      playerId,
      role,
      status,
      joinedAt: now,
      updatedAt: now,
      invitedBy,
      bannedBy: null,
      banReason: null,
    };

    this.members.set(membershipId, member);

    // Update club membership index
    const clubMembers = this.membersByClub.get(clubId) ?? new Set();
    clubMembers.add(membershipId);
    this.membersByClub.set(clubId, clubMembers);

    // Update player membership index
    const playerClubs = this.membersByPlayer.get(playerId) ?? new Map();
    playerClubs.set(clubId, membershipId);
    this.membersByPlayer.set(playerId, playerClubs);

    return { success: true, data: member };
  }

  private getMembershipByPlayer(clubId: ClubId, playerId: PlayerId): ClubMember | null {
    const playerClubs = this.membersByPlayer.get(playerId);
    if (!playerClubs) {
      return null;
    }

    const membershipId = playerClubs.get(clubId);
    if (!membershipId) {
      return null;
    }

    return this.members.get(membershipId) ?? null;
  }

  private updateMemberStatus(
    membershipId: MembershipId,
    status: MembershipStatus
  ): ClubOperationResult<ClubMember> {
    const membership = this.members.get(membershipId);
    if (!membership) {
      return {
        success: false,
        error: { code: 'MEMBER_NOT_FOUND', message: 'Membership not found' },
      };
    }

    const updated: ClubMember = {
      ...membership,
      status,
      updatedAt: Date.now(),
    };

    this.members.set(membershipId, updated);

    return { success: true, data: updated };
  }

  private removeManagerRole(clubId: ClubId, playerId: PlayerId): void {
    const club = this.clubs.get(clubId);
    if (club) {
      const updatedClub: Club = {
        ...club,
        managerIds: club.managerIds.filter(id => id !== playerId),
        updatedAt: Date.now(),
      };
      this.clubs.set(clubId, updatedClub);
    }
  }

  private validateConfig(config: ClubConfig): ClubOperationError | null {
    if (config.minBuyIn < 0) {
      return {
        code: 'INVALID_CONFIG',
        message: 'Minimum buy-in cannot be negative',
      };
    }

    if (config.maxBuyIn < config.minBuyIn) {
      return {
        code: 'INVALID_CONFIG',
        message: 'Maximum buy-in must be >= minimum buy-in',
      };
    }

    if (config.defaultBuyIn < config.minBuyIn || config.defaultBuyIn > config.maxBuyIn) {
      return {
        code: 'INVALID_CONFIG',
        message: 'Default buy-in must be within min/max range',
      };
    }

    if (config.maxPlayersPerTable < 2 || config.maxPlayersPerTable > 10) {
      return {
        code: 'INVALID_CONFIG',
        message: 'Max players per table must be between 2 and 10',
      };
    }

    if (config.minPlayersToStart < 2 || config.minPlayersToStart > config.maxPlayersPerTable) {
      return {
        code: 'INVALID_CONFIG',
        message: 'Min players to start must be between 2 and max players',
      };
    }

    return null;
  }

  private emitEvent(
    type: AuthorityEventType,
    clubId: ClubId,
    actorId: PlayerId,
    targetId: PlayerId | undefined,
    data: Record<string, unknown>
  ): void {
    const event: AuthorityEvent = {
      eventId: generateEventId(),
      type,
      clubId,
      actorId,
      targetId,
      data,
      timestamp: Date.now(),
    };

    this.eventLog.push(event);

    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch {
        // Ignore listener errors
      }
    }
  }

  /**
   * Clear all state (for testing)
   */
  clear(): void {
    this.clubs.clear();
    this.members.clear();
    this.membersByClub.clear();
    this.membersByPlayer.clear();
    this.eventLog.length = 0;
    this.eventListeners.clear();
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let clubManagerInstance: ClubManager | null = null;

export function getClubManager(): ClubManager {
  if (!clubManagerInstance) {
    clubManagerInstance = new ClubManager();
  }
  return clubManagerInstance;
}

export function resetClubManager(): ClubManager {
  clubManagerInstance = new ClubManager();
  return clubManagerInstance;
}
