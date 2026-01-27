/**
 * ClubTypes.ts
 * Phase 21 - Club domain model types
 *
 * Defines the core types for club-based poker gameplay
 * following Pokerrrr2-style club management.
 */

import { PlayerId } from '../security/Identity';
import { TableId, HandId } from '../security/AuditLog';

// ============================================================================
// Branded Types
// ============================================================================

export type ClubId = string & { readonly __brand: 'ClubId' };
export type MembershipId = string & { readonly __brand: 'MembershipId' };
export type TableAuthorityId = string & { readonly __brand: 'TableAuthorityId' };
export type AuthorizationId = string & { readonly __brand: 'AuthorizationId' };

// ============================================================================
// Role & Status Enums
// ============================================================================

/**
 * Club member roles with increasing authority
 */
export type ClubRole = 'PLAYER' | 'MANAGER' | 'OWNER';

/**
 * Club membership status
 */
export type MembershipStatus = 'ACTIVE' | 'BANNED' | 'LEFT' | 'PENDING';

/**
 * Table status for authority control
 */
export type TableStatus = 'OPEN' | 'ACTIVE' | 'PAUSED' | 'CLOSED';

// ============================================================================
// Club Entity
// ============================================================================

/**
 * Club configuration for buy-in rules and visibility
 */
export interface ClubConfig {
  readonly configId: string;
  readonly defaultBuyIn: number;
  readonly minBuyIn: number;
  readonly maxBuyIn: number;
  readonly allowRebuy: boolean;
  readonly allowTopUp: boolean;
  readonly maxPlayersPerTable: number;
  readonly minPlayersToStart: number;
  readonly autoStartEnabled: boolean;
  readonly ledgerVisibility: LedgerVisibility;
  readonly createdAt: number;
  readonly updatedAt: number;
}

/**
 * Ledger visibility settings
 */
export interface LedgerVisibility {
  readonly playersCanViewOwnHistory: boolean;
  readonly playersCanViewTableHistory: boolean;
  readonly managersCanViewAllHistory: boolean;
  readonly showRakeInHistory: boolean;
}

/**
 * Reference to a rake policy (from Phase 15)
 */
export interface RakePolicyRef {
  readonly policyId: string;
  readonly policyHash: string;
  readonly appliedAt: number;
}

/**
 * Club entity
 */
export interface Club {
  readonly clubId: ClubId;
  readonly name: string;
  readonly ownerId: PlayerId;
  readonly managerIds: readonly PlayerId[];
  readonly config: ClubConfig;
  readonly rakePolicyRef: RakePolicyRef | null;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly isActive: boolean;
}

// ============================================================================
// Club Member
// ============================================================================

/**
 * Club membership record
 */
export interface ClubMember {
  readonly membershipId: MembershipId;
  readonly clubId: ClubId;
  readonly playerId: PlayerId;
  readonly role: ClubRole;
  readonly status: MembershipStatus;
  readonly joinedAt: number;
  readonly updatedAt: number;
  readonly invitedBy: PlayerId | null;
  readonly bannedBy: PlayerId | null;
  readonly banReason: string | null;
}

// ============================================================================
// Table Authority
// ============================================================================

/**
 * Club table with authority metadata
 */
export interface ClubTable {
  readonly tableId: TableId;
  readonly clubId: ClubId;
  readonly createdBy: PlayerId;
  readonly status: TableStatus;
  readonly currentHandId: HandId | null;
  readonly seatCount: number;
  readonly occupiedSeats: readonly PlayerId[];
  readonly pausedBy: PlayerId | null;
  readonly pausedAt: number | null;
  readonly pauseReason: string | null;
  readonly rakePolicySnapshot: RakePolicyRef | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}

// ============================================================================
// Authorization
// ============================================================================

/**
 * Authorization request for an action
 */
export interface AuthorizationRequest {
  readonly requestId: AuthorizationId;
  readonly callerId: PlayerId;
  readonly clubId: ClubId;
  readonly tableId?: TableId;
  readonly action: AuthorizedAction;
  readonly params: Record<string, unknown>;
  readonly timestamp: number;
}

/**
 * Actions that require authorization
 */
export type AuthorizedAction =
  // Club management
  | 'create_club'
  | 'update_club_config'
  | 'update_rake_policy'
  | 'delete_club'
  // Membership management
  | 'invite_member'
  | 'accept_invitation'
  | 'remove_member'
  | 'ban_member'
  | 'unban_member'
  | 'promote_to_manager'
  | 'demote_from_manager'
  | 'transfer_ownership'
  // Table management
  | 'create_table'
  | 'close_table'
  | 'pause_table'
  | 'resume_table'
  // Player table actions
  | 'join_table'
  | 'leave_table'
  | 'buy_in'
  | 'cash_out'
  | 'rebuy'
  | 'top_up'
  // Manager table actions
  | 'kick_player'
  | 'start_hand'
  | 'force_action';

/**
 * Authorization result
 */
export interface AuthorizationResult {
  readonly authorized: boolean;
  readonly requestId: AuthorizationId;
  readonly action: AuthorizedAction;
  readonly callerId: PlayerId;
  readonly denialReason?: AuthorizationDenialReason;
  readonly denialDetails?: string;
  readonly timestamp: number;
}

/**
 * Reasons for authorization denial
 */
export type AuthorizationDenialReason =
  | 'NOT_CLUB_MEMBER'
  | 'INSUFFICIENT_ROLE'
  | 'MEMBER_BANNED'
  | 'MEMBER_LEFT'
  | 'TABLE_NOT_FOUND'
  | 'TABLE_CLOSED'
  | 'TABLE_PAUSED'
  | 'HAND_IN_PROGRESS'
  | 'NO_HAND_IN_PROGRESS'
  | 'PLAYER_NOT_AT_TABLE'
  | 'PLAYER_ALREADY_AT_TABLE'
  | 'TABLE_FULL'
  | 'INSUFFICIENT_BALANCE'
  | 'BUY_IN_BELOW_MINIMUM'
  | 'BUY_IN_ABOVE_MAXIMUM'
  | 'REBUY_NOT_ALLOWED'
  | 'TOP_UP_NOT_ALLOWED'
  | 'RAKE_POLICY_LOCKED'
  | 'CANNOT_KICK_OWNER'
  | 'CANNOT_KICK_MANAGER'
  | 'CANNOT_DEMOTE_OWNER'
  | 'SELF_ACTION_NOT_ALLOWED'
  | 'INVALID_TARGET'
  | 'CLUB_NOT_ACTIVE';

// ============================================================================
// Authority Events
// ============================================================================

/**
 * Authority event types
 */
export type AuthorityEventType =
  // Club events
  | 'club_created'
  | 'club_config_updated'
  | 'club_rake_policy_updated'
  | 'club_deleted'
  // Membership events
  | 'member_invited'
  | 'member_joined'
  | 'member_left'
  | 'member_banned'
  | 'member_unbanned'
  | 'member_promoted'
  | 'member_demoted'
  | 'ownership_transferred'
  // Table events
  | 'table_created'
  | 'table_closed'
  | 'table_paused'
  | 'table_resumed'
  // Player events
  | 'player_joined_table'
  | 'player_left_table'
  | 'player_kicked'
  | 'player_bought_in'
  | 'player_cashed_out'
  | 'player_rebought'
  | 'player_topped_up'
  // Authorization events
  | 'authorization_denied';

/**
 * Authority event
 */
export interface AuthorityEvent {
  readonly eventId: string;
  readonly type: AuthorityEventType;
  readonly clubId: ClubId;
  readonly tableId?: TableId;
  readonly actorId: PlayerId;
  readonly targetId?: PlayerId;
  readonly data: Record<string, unknown>;
  readonly timestamp: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_CLUB_CONFIG: ClubConfig = {
  configId: 'default',
  defaultBuyIn: 1000,
  minBuyIn: 100,
  maxBuyIn: 10000,
  allowRebuy: true,
  allowTopUp: true,
  maxPlayersPerTable: 9,
  minPlayersToStart: 2,
  autoStartEnabled: false,
  ledgerVisibility: {
    playersCanViewOwnHistory: true,
    playersCanViewTableHistory: false,
    managersCanViewAllHistory: true,
    showRakeInHistory: false,
  },
  createdAt: 0,
  updatedAt: 0,
};

export const DEFAULT_LEDGER_VISIBILITY: LedgerVisibility = {
  playersCanViewOwnHistory: true,
  playersCanViewTableHistory: false,
  managersCanViewAllHistory: true,
  showRakeInHistory: false,
};

// ============================================================================
// Role Hierarchy
// ============================================================================

/**
 * Role hierarchy for permission checks
 * Higher number = more authority
 */
export const ROLE_HIERARCHY: Record<ClubRole, number> = {
  PLAYER: 1,
  MANAGER: 2,
  OWNER: 3,
};

/**
 * Check if a role has at least the required authority
 */
export function hasRoleAuthority(
  callerRole: ClubRole,
  requiredRole: ClubRole
): boolean {
  return ROLE_HIERARCHY[callerRole] >= ROLE_HIERARCHY[requiredRole];
}

// ============================================================================
// ID Generation
// ============================================================================

let clubIdCounter = 0;
let membershipIdCounter = 0;
let tableAuthorityIdCounter = 0;
let authorizationIdCounter = 0;
let eventIdCounter = 0;

export function generateClubId(): ClubId {
  return `club_${Date.now()}_${++clubIdCounter}` as ClubId;
}

export function generateMembershipId(): MembershipId {
  return `member_${Date.now()}_${++membershipIdCounter}` as MembershipId;
}

export function generateTableAuthorityId(): TableAuthorityId {
  return `table_auth_${Date.now()}_${++tableAuthorityIdCounter}` as TableAuthorityId;
}

export function generateAuthorizationId(): AuthorizationId {
  return `auth_${Date.now()}_${++authorizationIdCounter}` as AuthorizationId;
}

export function generateEventId(): string {
  return `evt_${Date.now()}_${++eventIdCounter}`;
}

export function resetClubCounters(): void {
  clubIdCounter = 0;
  membershipIdCounter = 0;
  tableAuthorityIdCounter = 0;
  authorizationIdCounter = 0;
  eventIdCounter = 0;
}
