/**
 * AuthorizationEngine.ts
 * Phase 21 - Pure, testable authorization logic
 *
 * Validates permissions for all club and table operations.
 * This engine is:
 * - Pure (no side effects)
 * - Testable (deterministic results)
 * - Side-effect free (reads state, doesn't modify)
 *
 * Returns structured results, never throws.
 */

import { PlayerId } from '../security/Identity';
import { TableId } from '../security/AuditLog';
import {
  ClubId,
  Club,
  ClubMember,
  ClubTable,
  ClubRole,
  AuthorizedAction,
  AuthorizationRequest,
  AuthorizationResult,
  AuthorizationDenialReason,
  generateAuthorizationId,
  hasRoleAuthority,
  ROLE_HIERARCHY,
} from './ClubTypes';

// ============================================================================
// Authorization Context
// ============================================================================

/**
 * Snapshot of state needed for authorization decisions
 */
export interface AuthorizationContext {
  readonly club: Club | null;
  readonly callerMembership: ClubMember | null;
  readonly targetMembership?: ClubMember | null;
  readonly table?: ClubTable | null;
  readonly callerBalance?: number;
}

/**
 * Parameters for specific actions
 */
export interface ActionParams {
  readonly targetPlayerId?: PlayerId;
  readonly tableId?: TableId;
  readonly buyInAmount?: number;
  readonly topUpAmount?: number;
}

// ============================================================================
// Action Requirements
// ============================================================================

/**
 * Defines the minimum role required for each action
 */
const ACTION_ROLE_REQUIREMENTS: Record<AuthorizedAction, ClubRole> = {
  // Club management - Owner only
  create_club: 'OWNER',
  update_club_config: 'OWNER',
  update_rake_policy: 'OWNER',
  delete_club: 'OWNER',
  transfer_ownership: 'OWNER',

  // Membership management - Manager+
  invite_member: 'MANAGER',
  remove_member: 'MANAGER',
  ban_member: 'MANAGER',
  unban_member: 'MANAGER',

  // Membership management - Owner only
  promote_to_manager: 'OWNER',
  demote_from_manager: 'OWNER',

  // Self-actions - Player
  accept_invitation: 'PLAYER',

  // Table management - Manager+
  create_table: 'MANAGER',
  close_table: 'MANAGER',
  pause_table: 'MANAGER',
  resume_table: 'MANAGER',
  kick_player: 'MANAGER',
  start_hand: 'MANAGER',
  force_action: 'MANAGER',

  // Player table actions - Player
  join_table: 'PLAYER',
  leave_table: 'PLAYER',
  buy_in: 'PLAYER',
  cash_out: 'PLAYER',
  rebuy: 'PLAYER',
  top_up: 'PLAYER',
};

// ============================================================================
// AuthorizationEngine Implementation
// ============================================================================

export class AuthorizationEngine {
  /**
   * Authorize an action
   *
   * This is the main entry point for all authorization checks.
   * It's a pure function that returns a result, never throws.
   */
  authorize(
    context: AuthorizationContext,
    action: AuthorizedAction,
    callerId: PlayerId,
    clubId: ClubId,
    params: ActionParams = {}
  ): AuthorizationResult {
    const requestId = generateAuthorizationId();
    const timestamp = Date.now();

    // Base result for denials
    const deny = (
      reason: AuthorizationDenialReason,
      details?: string
    ): AuthorizationResult => ({
      authorized: false,
      requestId,
      action,
      callerId,
      denialReason: reason,
      denialDetails: details,
      timestamp,
    });

    // Success result
    const allow = (): AuthorizationResult => ({
      authorized: true,
      requestId,
      action,
      callerId,
      timestamp,
    });

    // Check club exists and is active (except for create_club)
    if (action !== 'create_club') {
      if (!context.club) {
        return deny('NOT_CLUB_MEMBER', 'Club not found');
      }

      if (!context.club.isActive) {
        return deny('CLUB_NOT_ACTIVE', 'Club is not active');
      }
    }

    // Check membership (except for create_club and accept_invitation)
    if (action !== 'create_club') {
      if (!context.callerMembership) {
        return deny('NOT_CLUB_MEMBER', 'Caller is not a club member');
      }

      // Check membership status
      if (context.callerMembership.status === 'BANNED') {
        return deny('MEMBER_BANNED', 'Caller is banned from this club');
      }

      if (context.callerMembership.status === 'LEFT') {
        return deny('MEMBER_LEFT', 'Caller has left this club');
      }

      // For non-accept actions, must be active
      if (action !== 'accept_invitation' && context.callerMembership.status !== 'ACTIVE') {
        return deny('NOT_CLUB_MEMBER', 'Membership is not active');
      }
    }

    // Check role requirement
    const requiredRole = ACTION_ROLE_REQUIREMENTS[action];
    if (action !== 'create_club' && context.callerMembership) {
      if (!hasRoleAuthority(context.callerMembership.role, requiredRole)) {
        return deny(
          'INSUFFICIENT_ROLE',
          `Action ${action} requires ${requiredRole} role, caller has ${context.callerMembership.role}`
        );
      }
    }

    // Action-specific checks
    switch (action) {
      case 'create_club':
        // Anyone can create a club (becomes owner)
        return allow();

      case 'update_club_config':
      case 'update_rake_policy':
      case 'delete_club':
        // Owner-only actions already checked by role
        return allow();

      case 'invite_member':
      case 'remove_member':
        return this.checkMembershipAction(context, action, params, deny, allow);

      case 'ban_member':
        return this.checkBanAction(context, params, deny, allow);

      case 'unban_member':
        return this.checkUnbanAction(context, params, deny, allow);

      case 'promote_to_manager':
        return this.checkPromoteAction(context, params, deny, allow);

      case 'demote_from_manager':
        return this.checkDemoteAction(context, params, deny, allow);

      case 'transfer_ownership':
        return this.checkTransferOwnershipAction(context, params, deny, allow);

      case 'accept_invitation':
        // Already checked membership status
        return allow();

      case 'create_table':
        return allow();

      case 'close_table':
      case 'pause_table':
      case 'resume_table':
        return this.checkTableManagementAction(context, action, deny, allow);

      case 'kick_player':
        return this.checkKickAction(context, params, deny, allow);

      case 'start_hand':
        return this.checkStartHandAction(context, deny, allow);

      case 'force_action':
        return this.checkForceActionAction(context, deny, allow);

      case 'join_table':
        return this.checkJoinTableAction(context, callerId, deny, allow);

      case 'leave_table':
        return this.checkLeaveTableAction(context, callerId, deny, allow);

      case 'buy_in':
        return this.checkBuyInAction(context, params, deny, allow);

      case 'cash_out':
        return this.checkCashOutAction(context, callerId, deny, allow);

      case 'rebuy':
        return this.checkRebuyAction(context, params, deny, allow);

      case 'top_up':
        return this.checkTopUpAction(context, params, deny, allow);

      default:
        return deny('INSUFFICIENT_ROLE', `Unknown action: ${action}`);
    }
  }

  // ==========================================================================
  // Action-Specific Checks
  // ==========================================================================

  private checkMembershipAction(
    context: AuthorizationContext,
    action: AuthorizedAction,
    params: ActionParams,
    deny: (reason: AuthorizationDenialReason, details?: string) => AuthorizationResult,
    allow: () => AuthorizationResult
  ): AuthorizationResult {
    if (!params.targetPlayerId) {
      return deny('INVALID_TARGET', 'Target player ID required');
    }

    // Cannot target self for remove
    if (action === 'remove_member' && params.targetPlayerId === context.callerMembership?.playerId) {
      return deny('SELF_ACTION_NOT_ALLOWED', 'Cannot remove yourself');
    }

    // Check target exists for remove
    if (action === 'remove_member' && !context.targetMembership) {
      return deny('INVALID_TARGET', 'Target is not a member');
    }

    // Cannot remove owner
    if (action === 'remove_member' && context.targetMembership?.role === 'OWNER') {
      return deny('CANNOT_KICK_OWNER', 'Cannot remove owner');
    }

    // Managers cannot remove other managers (only owner can)
    if (
      action === 'remove_member' &&
      context.targetMembership?.role === 'MANAGER' &&
      context.callerMembership?.role === 'MANAGER'
    ) {
      return deny('CANNOT_KICK_MANAGER', 'Managers cannot remove other managers');
    }

    return allow();
  }

  private checkBanAction(
    context: AuthorizationContext,
    params: ActionParams,
    deny: (reason: AuthorizationDenialReason, details?: string) => AuthorizationResult,
    allow: () => AuthorizationResult
  ): AuthorizationResult {
    if (!params.targetPlayerId) {
      return deny('INVALID_TARGET', 'Target player ID required');
    }

    // Cannot ban self
    if (params.targetPlayerId === context.callerMembership?.playerId) {
      return deny('SELF_ACTION_NOT_ALLOWED', 'Cannot ban yourself');
    }

    // Cannot ban owner
    if (context.targetMembership?.role === 'OWNER') {
      return deny('CANNOT_KICK_OWNER', 'Cannot ban owner');
    }

    // Managers cannot ban other managers
    if (
      context.targetMembership?.role === 'MANAGER' &&
      context.callerMembership?.role === 'MANAGER'
    ) {
      return deny('CANNOT_KICK_MANAGER', 'Managers cannot ban other managers');
    }

    return allow();
  }

  private checkUnbanAction(
    context: AuthorizationContext,
    params: ActionParams,
    deny: (reason: AuthorizationDenialReason, details?: string) => AuthorizationResult,
    allow: () => AuthorizationResult
  ): AuthorizationResult {
    if (!params.targetPlayerId) {
      return deny('INVALID_TARGET', 'Target player ID required');
    }

    if (!context.targetMembership) {
      return deny('INVALID_TARGET', 'Target is not a member');
    }

    if (context.targetMembership.status !== 'BANNED') {
      return deny('INVALID_TARGET', 'Target is not banned');
    }

    return allow();
  }

  private checkPromoteAction(
    context: AuthorizationContext,
    params: ActionParams,
    deny: (reason: AuthorizationDenialReason, details?: string) => AuthorizationResult,
    allow: () => AuthorizationResult
  ): AuthorizationResult {
    if (!params.targetPlayerId) {
      return deny('INVALID_TARGET', 'Target player ID required');
    }

    // Cannot promote self
    if (params.targetPlayerId === context.callerMembership?.playerId) {
      return deny('SELF_ACTION_NOT_ALLOWED', 'Cannot promote yourself');
    }

    if (!context.targetMembership) {
      return deny('INVALID_TARGET', 'Target is not a member');
    }

    if (context.targetMembership.status !== 'ACTIVE') {
      return deny('INVALID_TARGET', 'Target must be an active member');
    }

    if (context.targetMembership.role !== 'PLAYER') {
      return deny('INVALID_TARGET', 'Can only promote players');
    }

    return allow();
  }

  private checkDemoteAction(
    context: AuthorizationContext,
    params: ActionParams,
    deny: (reason: AuthorizationDenialReason, details?: string) => AuthorizationResult,
    allow: () => AuthorizationResult
  ): AuthorizationResult {
    if (!params.targetPlayerId) {
      return deny('INVALID_TARGET', 'Target player ID required');
    }

    // Cannot demote self
    if (params.targetPlayerId === context.callerMembership?.playerId) {
      return deny('SELF_ACTION_NOT_ALLOWED', 'Cannot demote yourself');
    }

    if (!context.targetMembership) {
      return deny('INVALID_TARGET', 'Target is not a member');
    }

    if (context.targetMembership.role === 'OWNER') {
      return deny('CANNOT_DEMOTE_OWNER', 'Cannot demote owner');
    }

    if (context.targetMembership.role !== 'MANAGER') {
      return deny('INVALID_TARGET', 'Target is not a manager');
    }

    return allow();
  }

  private checkTransferOwnershipAction(
    context: AuthorizationContext,
    params: ActionParams,
    deny: (reason: AuthorizationDenialReason, details?: string) => AuthorizationResult,
    allow: () => AuthorizationResult
  ): AuthorizationResult {
    if (!params.targetPlayerId) {
      return deny('INVALID_TARGET', 'Target player ID required');
    }

    // Cannot transfer to self
    if (params.targetPlayerId === context.callerMembership?.playerId) {
      return deny('SELF_ACTION_NOT_ALLOWED', 'Cannot transfer to yourself');
    }

    if (!context.targetMembership) {
      return deny('INVALID_TARGET', 'Target is not a member');
    }

    if (context.targetMembership.status !== 'ACTIVE') {
      return deny('INVALID_TARGET', 'Target must be an active member');
    }

    return allow();
  }

  private checkTableManagementAction(
    context: AuthorizationContext,
    action: AuthorizedAction,
    deny: (reason: AuthorizationDenialReason, details?: string) => AuthorizationResult,
    allow: () => AuthorizationResult
  ): AuthorizationResult {
    if (!context.table) {
      return deny('TABLE_NOT_FOUND', 'Table not found');
    }

    if (context.table.status === 'CLOSED') {
      return deny('TABLE_CLOSED', 'Table is already closed');
    }

    if (action === 'pause_table' && context.table.status === 'PAUSED') {
      return deny('TABLE_PAUSED', 'Table is already paused');
    }

    if (action === 'resume_table' && context.table.status !== 'PAUSED') {
      return deny('TABLE_NOT_FOUND', 'Table is not paused');
    }

    return allow();
  }

  private checkKickAction(
    context: AuthorizationContext,
    params: ActionParams,
    deny: (reason: AuthorizationDenialReason, details?: string) => AuthorizationResult,
    allow: () => AuthorizationResult
  ): AuthorizationResult {
    if (!context.table) {
      return deny('TABLE_NOT_FOUND', 'Table not found');
    }

    if (!params.targetPlayerId) {
      return deny('INVALID_TARGET', 'Target player ID required');
    }

    // Cannot kick self
    if (params.targetPlayerId === context.callerMembership?.playerId) {
      return deny('SELF_ACTION_NOT_ALLOWED', 'Cannot kick yourself');
    }

    // Check target is at table
    if (!context.table.occupiedSeats.includes(params.targetPlayerId)) {
      return deny('PLAYER_NOT_AT_TABLE', 'Target player is not at this table');
    }

    // Cannot kick owner
    if (context.targetMembership?.role === 'OWNER') {
      return deny('CANNOT_KICK_OWNER', 'Cannot kick owner');
    }

    // Managers cannot kick other managers
    if (
      context.targetMembership?.role === 'MANAGER' &&
      context.callerMembership?.role === 'MANAGER'
    ) {
      return deny('CANNOT_KICK_MANAGER', 'Managers cannot kick other managers');
    }

    return allow();
  }

  private checkStartHandAction(
    context: AuthorizationContext,
    deny: (reason: AuthorizationDenialReason, details?: string) => AuthorizationResult,
    allow: () => AuthorizationResult
  ): AuthorizationResult {
    if (!context.table) {
      return deny('TABLE_NOT_FOUND', 'Table not found');
    }

    if (context.table.status === 'CLOSED') {
      return deny('TABLE_CLOSED', 'Table is closed');
    }

    if (context.table.status === 'PAUSED') {
      return deny('TABLE_PAUSED', 'Table is paused');
    }

    if (context.table.currentHandId !== null) {
      return deny('HAND_IN_PROGRESS', 'A hand is already in progress');
    }

    if (context.table.occupiedSeats.length < (context.club?.config.minPlayersToStart ?? 2)) {
      return deny('TABLE_NOT_FOUND', 'Not enough players to start');
    }

    return allow();
  }

  private checkForceActionAction(
    context: AuthorizationContext,
    deny: (reason: AuthorizationDenialReason, details?: string) => AuthorizationResult,
    allow: () => AuthorizationResult
  ): AuthorizationResult {
    if (!context.table) {
      return deny('TABLE_NOT_FOUND', 'Table not found');
    }

    if (context.table.currentHandId === null) {
      return deny('NO_HAND_IN_PROGRESS', 'No hand in progress');
    }

    return allow();
  }

  private checkJoinTableAction(
    context: AuthorizationContext,
    callerId: PlayerId,
    deny: (reason: AuthorizationDenialReason, details?: string) => AuthorizationResult,
    allow: () => AuthorizationResult
  ): AuthorizationResult {
    if (!context.table) {
      return deny('TABLE_NOT_FOUND', 'Table not found');
    }

    if (context.table.status === 'CLOSED') {
      return deny('TABLE_CLOSED', 'Table is closed');
    }

    if (context.table.occupiedSeats.includes(callerId)) {
      return deny('PLAYER_ALREADY_AT_TABLE', 'Already at this table');
    }

    const maxPlayers = context.club?.config.maxPlayersPerTable ?? 9;
    if (context.table.occupiedSeats.length >= maxPlayers) {
      return deny('TABLE_FULL', 'Table is full');
    }

    return allow();
  }

  private checkLeaveTableAction(
    context: AuthorizationContext,
    callerId: PlayerId,
    deny: (reason: AuthorizationDenialReason, details?: string) => AuthorizationResult,
    allow: () => AuthorizationResult
  ): AuthorizationResult {
    if (!context.table) {
      return deny('TABLE_NOT_FOUND', 'Table not found');
    }

    if (!context.table.occupiedSeats.includes(callerId)) {
      return deny('PLAYER_NOT_AT_TABLE', 'Not at this table');
    }

    // Cannot leave during a hand
    if (context.table.currentHandId !== null) {
      return deny('HAND_IN_PROGRESS', 'Cannot leave during a hand');
    }

    return allow();
  }

  private checkBuyInAction(
    context: AuthorizationContext,
    params: ActionParams,
    deny: (reason: AuthorizationDenialReason, details?: string) => AuthorizationResult,
    allow: () => AuthorizationResult
  ): AuthorizationResult {
    if (!context.table) {
      return deny('TABLE_NOT_FOUND', 'Table not found');
    }

    const amount = params.buyInAmount ?? context.club?.config.defaultBuyIn ?? 0;
    const minBuyIn = context.club?.config.minBuyIn ?? 0;
    const maxBuyIn = context.club?.config.maxBuyIn ?? Infinity;

    if (amount < minBuyIn) {
      return deny('BUY_IN_BELOW_MINIMUM', `Buy-in ${amount} below minimum ${minBuyIn}`);
    }

    if (amount > maxBuyIn) {
      return deny('BUY_IN_ABOVE_MAXIMUM', `Buy-in ${amount} above maximum ${maxBuyIn}`);
    }

    if (context.callerBalance !== undefined && context.callerBalance < amount) {
      return deny('INSUFFICIENT_BALANCE', `Insufficient balance: ${context.callerBalance} < ${amount}`);
    }

    return allow();
  }

  private checkCashOutAction(
    context: AuthorizationContext,
    callerId: PlayerId,
    deny: (reason: AuthorizationDenialReason, details?: string) => AuthorizationResult,
    allow: () => AuthorizationResult
  ): AuthorizationResult {
    if (!context.table) {
      return deny('TABLE_NOT_FOUND', 'Table not found');
    }

    if (!context.table.occupiedSeats.includes(callerId)) {
      return deny('PLAYER_NOT_AT_TABLE', 'Not at this table');
    }

    // Cannot cash out during a hand
    if (context.table.currentHandId !== null) {
      return deny('HAND_IN_PROGRESS', 'Cannot cash out during a hand');
    }

    return allow();
  }

  private checkRebuyAction(
    context: AuthorizationContext,
    params: ActionParams,
    deny: (reason: AuthorizationDenialReason, details?: string) => AuthorizationResult,
    allow: () => AuthorizationResult
  ): AuthorizationResult {
    if (!context.table) {
      return deny('TABLE_NOT_FOUND', 'Table not found');
    }

    if (!context.club?.config.allowRebuy) {
      return deny('REBUY_NOT_ALLOWED', 'Rebuy is not allowed at this club');
    }

    // Cannot rebuy during a hand
    if (context.table.currentHandId !== null) {
      return deny('HAND_IN_PROGRESS', 'Cannot rebuy during a hand');
    }

    return this.checkBuyInAction(context, params, deny, allow);
  }

  private checkTopUpAction(
    context: AuthorizationContext,
    params: ActionParams,
    deny: (reason: AuthorizationDenialReason, details?: string) => AuthorizationResult,
    allow: () => AuthorizationResult
  ): AuthorizationResult {
    if (!context.table) {
      return deny('TABLE_NOT_FOUND', 'Table not found');
    }

    if (!context.club?.config.allowTopUp) {
      return deny('TOP_UP_NOT_ALLOWED', 'Top-up is not allowed at this club');
    }

    const amount = params.topUpAmount ?? 0;
    if (amount <= 0) {
      return deny('BUY_IN_BELOW_MINIMUM', 'Top-up amount must be positive');
    }

    if (context.callerBalance !== undefined && context.callerBalance < amount) {
      return deny('INSUFFICIENT_BALANCE', `Insufficient balance: ${context.callerBalance} < ${amount}`);
    }

    return allow();
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let authorizationEngineInstance: AuthorizationEngine | null = null;

export function getAuthorizationEngine(): AuthorizationEngine {
  if (!authorizationEngineInstance) {
    authorizationEngineInstance = new AuthorizationEngine();
  }
  return authorizationEngineInstance;
}

export function resetAuthorizationEngine(): AuthorizationEngine {
  authorizationEngineInstance = new AuthorizationEngine();
  return authorizationEngineInstance;
}
