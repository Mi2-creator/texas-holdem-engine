/**
 * PermissionGuard.ts
 * Phase 13 - Role-based permissions and action guards
 *
 * Enforces access control for rooms, tables, and actions.
 */

import { SecurityErrors, PermissionError } from './SecurityErrors';
import { PlayerId, SessionId } from './Identity';

// ============================================================================
// Types
// ============================================================================

export type RoomId = string;
export type TableId = string;
export type ClubId = string;

export enum Role {
  GUEST = 'guest',
  PLAYER = 'player',
  SPECTATOR = 'spectator',
  VIP = 'vip',
  MODERATOR = 'moderator',
  ADMIN = 'admin',
  OWNER = 'owner',
}

export enum Permission {
  // Room permissions
  VIEW_ROOM = 'view_room',
  JOIN_ROOM = 'join_room',
  LEAVE_ROOM = 'leave_room',
  CREATE_ROOM = 'create_room',
  CLOSE_ROOM = 'close_room',
  CONFIGURE_ROOM = 'configure_room',

  // Table permissions
  VIEW_TABLE = 'view_table',
  TAKE_SEAT = 'take_seat',
  LEAVE_SEAT = 'leave_seat',
  RESERVE_SEAT = 'reserve_seat',

  // Game permissions
  PERFORM_ACTION = 'perform_action',
  BUY_IN = 'buy_in',
  STAND_UP = 'stand_up',
  SIT_BACK = 'sit_back',
  REQUEST_TIME_BANK = 'request_time_bank',

  // Chat permissions
  SEND_MESSAGE = 'send_message',
  USE_EMOJI = 'use_emoji',
  MUTE_PLAYER = 'mute_player',

  // Admin permissions
  KICK_PLAYER = 'kick_player',
  BAN_PLAYER = 'ban_player',
  MODIFY_STACK = 'modify_stack',
  FORCE_ACTION = 'force_action',
  VIEW_ALL_CARDS = 'view_all_cards',
  VIEW_AUDIT_LOG = 'view_audit_log',
}

export interface RolePermissions {
  readonly role: Role;
  readonly permissions: ReadonlySet<Permission>;
  readonly inheritsFrom?: Role;
}

export interface PlayerRoleAssignment {
  readonly playerId: PlayerId;
  readonly clubId?: ClubId;
  readonly roomId?: RoomId;
  readonly tableId?: TableId;
  readonly role: Role;
  readonly assignedAt: number;
  readonly assignedBy?: PlayerId;
  readonly expiresAt?: number;
}

export interface PermissionContext {
  readonly playerId: PlayerId;
  readonly sessionId?: SessionId;
  readonly clubId?: ClubId;
  readonly roomId?: RoomId;
  readonly tableId?: TableId;
  readonly seatIndex?: number;
  readonly targetPlayerId?: PlayerId;
}

export interface PermissionCheckResult {
  readonly allowed: boolean;
  readonly permission: Permission;
  readonly role: Role;
  readonly reason?: string;
}

// ============================================================================
// Default Role Permissions
// ============================================================================

const DEFAULT_ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  [Role.GUEST]: new Set([
    Permission.VIEW_ROOM,
    Permission.VIEW_TABLE,
  ]),

  [Role.SPECTATOR]: new Set([
    Permission.VIEW_ROOM,
    Permission.JOIN_ROOM,
    Permission.LEAVE_ROOM,
    Permission.VIEW_TABLE,
    Permission.USE_EMOJI,
  ]),

  [Role.PLAYER]: new Set([
    Permission.VIEW_ROOM,
    Permission.JOIN_ROOM,
    Permission.LEAVE_ROOM,
    Permission.VIEW_TABLE,
    Permission.TAKE_SEAT,
    Permission.LEAVE_SEAT,
    Permission.PERFORM_ACTION,
    Permission.BUY_IN,
    Permission.STAND_UP,
    Permission.SIT_BACK,
    Permission.REQUEST_TIME_BANK,
    Permission.SEND_MESSAGE,
    Permission.USE_EMOJI,
  ]),

  [Role.VIP]: new Set([
    Permission.VIEW_ROOM,
    Permission.JOIN_ROOM,
    Permission.LEAVE_ROOM,
    Permission.VIEW_TABLE,
    Permission.TAKE_SEAT,
    Permission.LEAVE_SEAT,
    Permission.RESERVE_SEAT,
    Permission.PERFORM_ACTION,
    Permission.BUY_IN,
    Permission.STAND_UP,
    Permission.SIT_BACK,
    Permission.REQUEST_TIME_BANK,
    Permission.SEND_MESSAGE,
    Permission.USE_EMOJI,
  ]),

  [Role.MODERATOR]: new Set([
    Permission.VIEW_ROOM,
    Permission.JOIN_ROOM,
    Permission.LEAVE_ROOM,
    Permission.VIEW_TABLE,
    Permission.TAKE_SEAT,
    Permission.LEAVE_SEAT,
    Permission.RESERVE_SEAT,
    Permission.PERFORM_ACTION,
    Permission.BUY_IN,
    Permission.STAND_UP,
    Permission.SIT_BACK,
    Permission.REQUEST_TIME_BANK,
    Permission.SEND_MESSAGE,
    Permission.USE_EMOJI,
    Permission.MUTE_PLAYER,
    Permission.KICK_PLAYER,
  ]),

  [Role.ADMIN]: new Set([
    Permission.VIEW_ROOM,
    Permission.JOIN_ROOM,
    Permission.LEAVE_ROOM,
    Permission.CREATE_ROOM,
    Permission.CLOSE_ROOM,
    Permission.CONFIGURE_ROOM,
    Permission.VIEW_TABLE,
    Permission.TAKE_SEAT,
    Permission.LEAVE_SEAT,
    Permission.RESERVE_SEAT,
    Permission.PERFORM_ACTION,
    Permission.BUY_IN,
    Permission.STAND_UP,
    Permission.SIT_BACK,
    Permission.REQUEST_TIME_BANK,
    Permission.SEND_MESSAGE,
    Permission.USE_EMOJI,
    Permission.MUTE_PLAYER,
    Permission.KICK_PLAYER,
    Permission.BAN_PLAYER,
    Permission.MODIFY_STACK,
    Permission.FORCE_ACTION,
    Permission.VIEW_AUDIT_LOG,
  ]),

  [Role.OWNER]: new Set([
    Permission.VIEW_ROOM,
    Permission.JOIN_ROOM,
    Permission.LEAVE_ROOM,
    Permission.CREATE_ROOM,
    Permission.CLOSE_ROOM,
    Permission.CONFIGURE_ROOM,
    Permission.VIEW_TABLE,
    Permission.TAKE_SEAT,
    Permission.LEAVE_SEAT,
    Permission.RESERVE_SEAT,
    Permission.PERFORM_ACTION,
    Permission.BUY_IN,
    Permission.STAND_UP,
    Permission.SIT_BACK,
    Permission.REQUEST_TIME_BANK,
    Permission.SEND_MESSAGE,
    Permission.USE_EMOJI,
    Permission.MUTE_PLAYER,
    Permission.KICK_PLAYER,
    Permission.BAN_PLAYER,
    Permission.MODIFY_STACK,
    Permission.FORCE_ACTION,
    Permission.VIEW_ALL_CARDS,
    Permission.VIEW_AUDIT_LOG,
  ]),
};

// ============================================================================
// Permission Guard
// ============================================================================

export class PermissionGuard {
  private rolePermissions: Map<Role, Set<Permission>>;
  private playerRoles: Map<string, PlayerRoleAssignment>;
  private defaultRole: Role;

  constructor(defaultRole: Role = Role.GUEST) {
    this.rolePermissions = new Map();
    this.playerRoles = new Map();
    this.defaultRole = defaultRole;

    // Initialize with default permissions
    for (const [role, permissions] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
      this.rolePermissions.set(role as Role, new Set(permissions));
    }
  }

  /**
   * Assign role to player
   */
  assignRole(
    playerId: PlayerId,
    role: Role,
    scope?: {
      clubId?: ClubId;
      roomId?: RoomId;
      tableId?: TableId;
    },
    options?: {
      assignedBy?: PlayerId;
      expiresAt?: number;
    }
  ): PlayerRoleAssignment {
    const key = this.createRoleKey(playerId, scope);

    const assignment: PlayerRoleAssignment = {
      playerId,
      clubId: scope?.clubId,
      roomId: scope?.roomId,
      tableId: scope?.tableId,
      role,
      assignedAt: Date.now(),
      assignedBy: options?.assignedBy,
      expiresAt: options?.expiresAt,
    };

    this.playerRoles.set(key, assignment);
    return assignment;
  }

  /**
   * Remove role from player
   */
  removeRole(
    playerId: PlayerId,
    scope?: {
      clubId?: ClubId;
      roomId?: RoomId;
      tableId?: TableId;
    }
  ): void {
    const key = this.createRoleKey(playerId, scope);
    this.playerRoles.delete(key);
  }

  /**
   * Get player's role in a context
   */
  getRole(context: PermissionContext): Role {
    // Check most specific scope first
    if (context.tableId) {
      const tableRole = this.playerRoles.get(
        this.createRoleKey(context.playerId, { tableId: context.tableId })
      );
      if (tableRole && this.isRoleValid(tableRole)) {
        return tableRole.role;
      }
    }

    if (context.roomId) {
      const roomRole = this.playerRoles.get(
        this.createRoleKey(context.playerId, { roomId: context.roomId })
      );
      if (roomRole && this.isRoleValid(roomRole)) {
        return roomRole.role;
      }
    }

    if (context.clubId) {
      const clubRole = this.playerRoles.get(
        this.createRoleKey(context.playerId, { clubId: context.clubId })
      );
      if (clubRole && this.isRoleValid(clubRole)) {
        return clubRole.role;
      }
    }

    // Check global role
    const globalRole = this.playerRoles.get(this.createRoleKey(context.playerId, {}));
    if (globalRole && this.isRoleValid(globalRole)) {
      return globalRole.role;
    }

    return this.defaultRole;
  }

  /**
   * Check if player has permission
   */
  hasPermission(context: PermissionContext, permission: Permission): boolean {
    const role = this.getRole(context);
    const permissions = this.rolePermissions.get(role);
    return permissions?.has(permission) ?? false;
  }

  /**
   * Check permission and return detailed result
   */
  checkPermission(
    context: PermissionContext,
    permission: Permission
  ): PermissionCheckResult {
    const role = this.getRole(context);
    const allowed = this.hasPermission(context, permission);

    return {
      allowed,
      permission,
      role,
      reason: allowed ? undefined : `Role ${role} does not have ${permission} permission`,
    };
  }

  /**
   * Require permission (throws if denied)
   */
  requirePermission(context: PermissionContext, permission: Permission): void {
    const result = this.checkPermission(context, permission);
    if (!result.allowed) {
      throw SecurityErrors.permissionDenied(permission, result.reason);
    }
  }

  /**
   * Require specific role or higher
   */
  requireRole(context: PermissionContext, requiredRole: Role): void {
    const actualRole = this.getRole(context);
    const roleHierarchy = this.getRoleHierarchy();

    const requiredLevel = roleHierarchy.indexOf(requiredRole);
    const actualLevel = roleHierarchy.indexOf(actualRole);

    if (actualLevel < requiredLevel) {
      throw SecurityErrors.insufficientRole(requiredRole, actualRole);
    }
  }

  /**
   * Check if player is seated (has player role or higher)
   */
  isSeatedPlayer(context: PermissionContext): boolean {
    const role = this.getRole(context);
    return role !== Role.GUEST && role !== Role.SPECTATOR;
  }

  /**
   * Check if player is spectator
   */
  isSpectator(context: PermissionContext): boolean {
    return this.getRole(context) === Role.SPECTATOR;
  }

  /**
   * Check if player is admin or owner
   */
  isAdmin(context: PermissionContext): boolean {
    const role = this.getRole(context);
    return role === Role.ADMIN || role === Role.OWNER;
  }

  /**
   * Check if player is owner
   */
  isOwner(context: PermissionContext): boolean {
    return this.getRole(context) === Role.OWNER;
  }

  /**
   * Require player to NOT be a spectator
   */
  requireNotSpectator(context: PermissionContext, action: string): void {
    if (this.isSpectator(context)) {
      throw SecurityErrors.spectatorRestricted(action);
    }
  }

  /**
   * Require admin role
   */
  requireAdmin(context: PermissionContext, action: string): void {
    if (!this.isAdmin(context)) {
      throw SecurityErrors.adminOnly(action);
    }
  }

  /**
   * Require owner role
   */
  requireOwner(context: PermissionContext, action: string): void {
    if (!this.isOwner(context)) {
      throw SecurityErrors.ownerOnly(action);
    }
  }

  /**
   * Get all permissions for a role
   */
  getPermissionsForRole(role: Role): ReadonlySet<Permission> {
    return this.rolePermissions.get(role) ?? new Set();
  }

  /**
   * Add permission to a role
   */
  addPermissionToRole(role: Role, permission: Permission): void {
    const permissions = this.rolePermissions.get(role) ?? new Set();
    permissions.add(permission);
    this.rolePermissions.set(role, permissions);
  }

  /**
   * Remove permission from a role
   */
  removePermissionFromRole(role: Role, permission: Permission): void {
    const permissions = this.rolePermissions.get(role);
    if (permissions) {
      permissions.delete(permission);
    }
  }

  /**
   * Get all role assignments for a player
   */
  getPlayerRoles(playerId: PlayerId): readonly PlayerRoleAssignment[] {
    const assignments: PlayerRoleAssignment[] = [];
    for (const assignment of this.playerRoles.values()) {
      if (assignment.playerId === playerId && this.isRoleValid(assignment)) {
        assignments.push(assignment);
      }
    }
    return assignments;
  }

  /**
   * Clear all role assignments (for testing)
   */
  clear(): void {
    this.playerRoles.clear();
  }

  /**
   * Get role hierarchy (lowest to highest)
   */
  private getRoleHierarchy(): Role[] {
    return [
      Role.GUEST,
      Role.SPECTATOR,
      Role.PLAYER,
      Role.VIP,
      Role.MODERATOR,
      Role.ADMIN,
      Role.OWNER,
    ];
  }

  private createRoleKey(
    playerId: PlayerId,
    scope?: {
      clubId?: ClubId;
      roomId?: RoomId;
      tableId?: TableId;
    }
  ): string {
    const parts = [playerId];
    if (scope?.clubId) parts.push(`club:${scope.clubId}`);
    if (scope?.roomId) parts.push(`room:${scope.roomId}`);
    if (scope?.tableId) parts.push(`table:${scope.tableId}`);
    return parts.join('|');
  }

  private isRoleValid(assignment: PlayerRoleAssignment): boolean {
    if (assignment.expiresAt && Date.now() > assignment.expiresAt) {
      return false;
    }
    return true;
  }
}

// ============================================================================
// Action Guard Decorators
// ============================================================================

export interface ActionGuardConfig {
  permission: Permission;
  requireSeated?: boolean;
  requireTurn?: boolean;
  adminOnly?: boolean;
  ownerOnly?: boolean;
}

export function createActionGuard(
  guard: PermissionGuard,
  config: ActionGuardConfig
): (context: PermissionContext, isTurn?: boolean) => void {
  return (context: PermissionContext, isTurn?: boolean) => {
    // Check base permission
    guard.requirePermission(context, config.permission);

    // Check seated requirement
    if (config.requireSeated) {
      guard.requireNotSpectator(context, config.permission);
    }

    // Check turn requirement
    if (config.requireTurn && !isTurn) {
      throw SecurityErrors.permissionDenied(config.permission, 'Not your turn');
    }

    // Check admin requirement
    if (config.adminOnly) {
      guard.requireAdmin(context, config.permission);
    }

    // Check owner requirement
    if (config.ownerOnly) {
      guard.requireOwner(context, config.permission);
    }
  };
}

// ============================================================================
// Singleton Instance
// ============================================================================

let permissionGuardInstance: PermissionGuard | null = null;

export function getPermissionGuard(): PermissionGuard {
  if (!permissionGuardInstance) {
    permissionGuardInstance = new PermissionGuard(Role.GUEST);
  }
  return permissionGuardInstance;
}

export function resetPermissionGuard(): PermissionGuard {
  permissionGuardInstance = new PermissionGuard(Role.GUEST);
  return permissionGuardInstance;
}
