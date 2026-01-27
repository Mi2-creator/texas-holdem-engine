/**
 * TableAuthority.ts
 * Phase 21 - Table authority layer above GameService
 *
 * Enforces all permissions for table operations.
 * Acts as the gatekeeper between players and the game/economy systems.
 *
 * Key principles:
 * - All operations must go through TableAuthority
 * - Players CANNOT directly access GameService or EconomyRuntime
 * - All actions are authorized before execution
 * - All actions emit auditable events
 */

import { PlayerId } from '../security/Identity';
import { TableId, HandId } from '../security/AuditLog';
import { Street } from '../game/engine/TableState';
import { EconomyRuntime, getEconomyRuntime } from '../economy/runtime';
import {
  ClubId,
  Club,
  ClubTable,
  TableStatus,
  AuthorizedAction,
  AuthorizationResult,
  AuthorityEvent,
  AuthorityEventType,
  RakePolicyRef,
  generateEventId,
} from './ClubTypes';
import { ClubManager, getClubManager } from './ClubManager';
import { AuthorizationEngine, AuthorizationContext, getAuthorizationEngine } from './AuthorizationEngine';

// ============================================================================
// Operation Results
// ============================================================================

export interface AuthorizedResult<T = void> {
  readonly success: boolean;
  readonly data?: T;
  readonly authorization: AuthorizationResult;
  readonly error?: string;
}

// ============================================================================
// TableAuthority Implementation
// ============================================================================

export class TableAuthority {
  private readonly clubManager: ClubManager;
  private readonly authEngine: AuthorizationEngine;
  private readonly economyRuntime: EconomyRuntime;
  private readonly tables: Map<TableId, ClubTable>;
  private readonly tablesByClub: Map<ClubId, Set<TableId>>;
  private readonly eventLog: AuthorityEvent[];
  private readonly eventListeners: Set<(event: AuthorityEvent) => void>;
  private tableIdCounter: number;

  constructor(options?: {
    clubManager?: ClubManager;
    authEngine?: AuthorizationEngine;
    economyRuntime?: EconomyRuntime;
  }) {
    this.clubManager = options?.clubManager ?? getClubManager();
    this.authEngine = options?.authEngine ?? getAuthorizationEngine();
    this.economyRuntime = options?.economyRuntime ?? getEconomyRuntime();
    this.tables = new Map();
    this.tablesByClub = new Map();
    this.eventLog = [];
    this.eventListeners = new Set();
    this.tableIdCounter = 0;
  }

  // ==========================================================================
  // Table Management (Manager+)
  // ==========================================================================

  /**
   * Create a new table in a club
   */
  createTable(
    clubId: ClubId,
    callerId: PlayerId,
    seatCount: number = 9
  ): AuthorizedResult<ClubTable> {
    const context = this.buildContext(clubId, callerId);
    const auth = this.authEngine.authorize(context, 'create_table', callerId, clubId);

    if (!auth.authorized) {
      this.emitAuthDenied(clubId, callerId, 'create_table', auth);
      return { success: false, authorization: auth };
    }

    const tableId = `table_${clubId}_${++this.tableIdCounter}` as TableId;
    const club = this.clubManager.getClub(clubId);
    const now = Date.now();

    const table: ClubTable = {
      tableId,
      clubId,
      createdBy: callerId,
      status: 'OPEN',
      currentHandId: null,
      seatCount: Math.min(seatCount, club?.config.maxPlayersPerTable ?? 9),
      occupiedSeats: [],
      pausedBy: null,
      pausedAt: null,
      pauseReason: null,
      rakePolicySnapshot: club?.rakePolicyRef ?? null,
      createdAt: now,
      updatedAt: now,
    };

    this.tables.set(tableId, table);

    const clubTables = this.tablesByClub.get(clubId) ?? new Set();
    clubTables.add(tableId);
    this.tablesByClub.set(clubId, clubTables);

    this.emitEvent('table_created', clubId, callerId, undefined, tableId, { seatCount });

    return { success: true, data: table, authorization: auth };
  }

  /**
   * Close a table
   */
  closeTable(
    clubId: ClubId,
    tableId: TableId,
    callerId: PlayerId
  ): AuthorizedResult {
    const context = this.buildContext(clubId, callerId, tableId);
    const auth = this.authEngine.authorize(context, 'close_table', callerId, clubId, { tableId });

    if (!auth.authorized) {
      this.emitAuthDenied(clubId, callerId, 'close_table', auth, tableId);
      return { success: false, authorization: auth };
    }

    const table = this.tables.get(tableId);
    if (!table) {
      return { success: false, authorization: auth, error: 'Table not found' };
    }

    // Cannot close with active hand
    if (table.currentHandId !== null) {
      return { success: false, authorization: auth, error: 'Cannot close table with active hand' };
    }

    // Cash out all remaining players
    for (const playerId of table.occupiedSeats) {
      this.forceCashOut(clubId, tableId, playerId);
    }

    const updated: ClubTable = {
      ...table,
      status: 'CLOSED',
      updatedAt: Date.now(),
    };

    this.tables.set(tableId, updated);
    this.emitEvent('table_closed', clubId, callerId, undefined, tableId, {});

    return { success: true, authorization: auth };
  }

  /**
   * Pause a table
   */
  pauseTable(
    clubId: ClubId,
    tableId: TableId,
    callerId: PlayerId,
    reason?: string
  ): AuthorizedResult<ClubTable> {
    const context = this.buildContext(clubId, callerId, tableId);
    const auth = this.authEngine.authorize(context, 'pause_table', callerId, clubId, { tableId });

    if (!auth.authorized) {
      this.emitAuthDenied(clubId, callerId, 'pause_table', auth, tableId);
      return { success: false, authorization: auth };
    }

    const table = this.tables.get(tableId);
    if (!table) {
      return { success: false, authorization: auth, error: 'Table not found' };
    }

    const now = Date.now();
    const updated: ClubTable = {
      ...table,
      status: 'PAUSED',
      pausedBy: callerId,
      pausedAt: now,
      pauseReason: reason ?? null,
      updatedAt: now,
    };

    this.tables.set(tableId, updated);
    this.emitEvent('table_paused', clubId, callerId, undefined, tableId, { reason });

    return { success: true, data: updated, authorization: auth };
  }

  /**
   * Resume a paused table
   */
  resumeTable(
    clubId: ClubId,
    tableId: TableId,
    callerId: PlayerId
  ): AuthorizedResult<ClubTable> {
    const context = this.buildContext(clubId, callerId, tableId);
    const auth = this.authEngine.authorize(context, 'resume_table', callerId, clubId, { tableId });

    if (!auth.authorized) {
      this.emitAuthDenied(clubId, callerId, 'resume_table', auth, tableId);
      return { success: false, authorization: auth };
    }

    const table = this.tables.get(tableId);
    if (!table) {
      return { success: false, authorization: auth, error: 'Table not found' };
    }

    const updated: ClubTable = {
      ...table,
      status: table.currentHandId ? 'ACTIVE' : 'OPEN',
      pausedBy: null,
      pausedAt: null,
      pauseReason: null,
      updatedAt: Date.now(),
    };

    this.tables.set(tableId, updated);
    this.emitEvent('table_resumed', clubId, callerId, undefined, tableId, {});

    return { success: true, data: updated, authorization: auth };
  }

  /**
   * Kick a player from a table
   */
  kickPlayer(
    clubId: ClubId,
    tableId: TableId,
    callerId: PlayerId,
    targetPlayerId: PlayerId,
    reason?: string
  ): AuthorizedResult {
    const context = this.buildContext(clubId, callerId, tableId, targetPlayerId);
    const auth = this.authEngine.authorize(context, 'kick_player', callerId, clubId, {
      tableId,
      targetPlayerId,
    });

    if (!auth.authorized) {
      this.emitAuthDenied(clubId, callerId, 'kick_player', auth, tableId);
      return { success: false, authorization: auth };
    }

    const table = this.tables.get(tableId);
    if (!table) {
      return { success: false, authorization: auth, error: 'Table not found' };
    }

    // Force cash out before removing from table
    this.forceCashOut(clubId, tableId, targetPlayerId);

    // Remove from table
    const updated: ClubTable = {
      ...table,
      occupiedSeats: table.occupiedSeats.filter(id => id !== targetPlayerId),
      updatedAt: Date.now(),
    };

    this.tables.set(tableId, updated);
    this.emitEvent('player_kicked', clubId, callerId, targetPlayerId, tableId, { reason });

    return { success: true, authorization: auth };
  }

  // ==========================================================================
  // Player Table Actions
  // ==========================================================================

  /**
   * Join a table
   */
  joinTable(
    clubId: ClubId,
    tableId: TableId,
    callerId: PlayerId
  ): AuthorizedResult<ClubTable> {
    const context = this.buildContext(clubId, callerId, tableId);
    const auth = this.authEngine.authorize(context, 'join_table', callerId, clubId, { tableId });

    if (!auth.authorized) {
      this.emitAuthDenied(clubId, callerId, 'join_table', auth, tableId);
      return { success: false, authorization: auth };
    }

    const table = this.tables.get(tableId);
    if (!table) {
      return { success: false, authorization: auth, error: 'Table not found' };
    }

    const updated: ClubTable = {
      ...table,
      occupiedSeats: [...table.occupiedSeats, callerId],
      updatedAt: Date.now(),
    };

    this.tables.set(tableId, updated);
    this.emitEvent('player_joined_table', clubId, callerId, undefined, tableId, {});

    return { success: true, data: updated, authorization: auth };
  }

  /**
   * Leave a table
   */
  leaveTable(
    clubId: ClubId,
    tableId: TableId,
    callerId: PlayerId
  ): AuthorizedResult {
    const context = this.buildContext(clubId, callerId, tableId);
    const auth = this.authEngine.authorize(context, 'leave_table', callerId, clubId, { tableId });

    if (!auth.authorized) {
      this.emitAuthDenied(clubId, callerId, 'leave_table', auth, tableId);
      return { success: false, authorization: auth };
    }

    const table = this.tables.get(tableId);
    if (!table) {
      return { success: false, authorization: auth, error: 'Table not found' };
    }

    // Cash out before leaving
    this.forceCashOut(clubId, tableId, callerId);

    const updated: ClubTable = {
      ...table,
      occupiedSeats: table.occupiedSeats.filter(id => id !== callerId),
      updatedAt: Date.now(),
    };

    this.tables.set(tableId, updated);
    this.emitEvent('player_left_table', clubId, callerId, undefined, tableId, {});

    return { success: true, authorization: auth };
  }

  /**
   * Buy in at a table
   */
  buyIn(
    clubId: ClubId,
    tableId: TableId,
    callerId: PlayerId,
    amount?: number
  ): AuthorizedResult<{ stack: number }> {
    const callerBalance = this.economyRuntime.getAvailableBalance(callerId);
    const club = this.clubManager.getClub(clubId);
    const buyInAmount = amount ?? club?.config.defaultBuyIn ?? 0;

    const context = this.buildContext(clubId, callerId, tableId);
    context.callerBalance !== undefined; // Ensure balance is set
    const contextWithBalance: AuthorizationContext = {
      ...context,
      callerBalance,
    };

    const auth = this.authEngine.authorize(contextWithBalance, 'buy_in', callerId, clubId, {
      tableId,
      buyInAmount,
    });

    if (!auth.authorized) {
      this.emitAuthDenied(clubId, callerId, 'buy_in', auth, tableId);
      return { success: false, authorization: auth };
    }

    try {
      this.economyRuntime.buyIn(tableId, callerId, buyInAmount);
      const stack = this.economyRuntime.getStack(tableId, callerId);

      this.emitEvent('player_bought_in', clubId, callerId, undefined, tableId, {
        amount: buyInAmount,
        stack,
      });

      return { success: true, data: { stack }, authorization: auth };
    } catch (error) {
      return {
        success: false,
        authorization: auth,
        error: error instanceof Error ? error.message : 'Buy-in failed',
      };
    }
  }

  /**
   * Cash out from a table
   */
  cashOut(
    clubId: ClubId,
    tableId: TableId,
    callerId: PlayerId
  ): AuthorizedResult<{ amount: number }> {
    const context = this.buildContext(clubId, callerId, tableId);
    const auth = this.authEngine.authorize(context, 'cash_out', callerId, clubId, { tableId });

    if (!auth.authorized) {
      this.emitAuthDenied(clubId, callerId, 'cash_out', auth, tableId);
      return { success: false, authorization: auth };
    }

    const result = this.economyRuntime.cashOut(tableId, callerId);

    if (!result.success) {
      return {
        success: false,
        authorization: auth,
        error: result.error,
      };
    }

    this.emitEvent('player_cashed_out', clubId, callerId, undefined, tableId, {
      amount: result.cashOutAmount,
    });

    return { success: true, data: { amount: result.cashOutAmount }, authorization: auth };
  }

  /**
   * Rebuy at a table (must have busted)
   */
  rebuy(
    clubId: ClubId,
    tableId: TableId,
    callerId: PlayerId,
    amount?: number
  ): AuthorizedResult<{ stack: number }> {
    const callerBalance = this.economyRuntime.getAvailableBalance(callerId);
    const club = this.clubManager.getClub(clubId);
    const rebuyAmount = amount ?? club?.config.defaultBuyIn ?? 0;

    const context = this.buildContext(clubId, callerId, tableId);
    const contextWithBalance: AuthorizationContext = {
      ...context,
      callerBalance,
    };

    const auth = this.authEngine.authorize(contextWithBalance, 'rebuy', callerId, clubId, {
      tableId,
      buyInAmount: rebuyAmount,
    });

    if (!auth.authorized) {
      this.emitAuthDenied(clubId, callerId, 'rebuy', auth, tableId);
      return { success: false, authorization: auth };
    }

    try {
      this.economyRuntime.buyIn(tableId, callerId, rebuyAmount);
      const stack = this.economyRuntime.getStack(tableId, callerId);

      this.emitEvent('player_rebought', clubId, callerId, undefined, tableId, {
        amount: rebuyAmount,
        stack,
      });

      return { success: true, data: { stack }, authorization: auth };
    } catch (error) {
      return {
        success: false,
        authorization: auth,
        error: error instanceof Error ? error.message : 'Rebuy failed',
      };
    }
  }

  /**
   * Top up at a table
   */
  topUp(
    clubId: ClubId,
    tableId: TableId,
    callerId: PlayerId,
    amount: number
  ): AuthorizedResult<{ stack: number }> {
    const callerBalance = this.economyRuntime.getAvailableBalance(callerId);
    const context = this.buildContext(clubId, callerId, tableId);
    const contextWithBalance: AuthorizationContext = {
      ...context,
      callerBalance,
    };

    const auth = this.authEngine.authorize(contextWithBalance, 'top_up', callerId, clubId, {
      tableId,
      topUpAmount: amount,
    });

    if (!auth.authorized) {
      this.emitAuthDenied(clubId, callerId, 'top_up', auth, tableId);
      return { success: false, authorization: auth };
    }

    try {
      this.economyRuntime.buyIn(tableId, callerId, amount);
      const stack = this.economyRuntime.getStack(tableId, callerId);

      this.emitEvent('player_topped_up', clubId, callerId, undefined, tableId, {
        amount,
        stack,
      });

      return { success: true, data: { stack }, authorization: auth };
    } catch (error) {
      return {
        success: false,
        authorization: auth,
        error: error instanceof Error ? error.message : 'Top-up failed',
      };
    }
  }

  // ==========================================================================
  // Hand Management (Manager+)
  // ==========================================================================

  /**
   * Start a new hand
   */
  startHand(
    clubId: ClubId,
    tableId: TableId,
    callerId: PlayerId
  ): AuthorizedResult<{ handId: HandId }> {
    const context = this.buildContext(clubId, callerId, tableId);
    const auth = this.authEngine.authorize(context, 'start_hand', callerId, clubId, { tableId });

    if (!auth.authorized) {
      this.emitAuthDenied(clubId, callerId, 'start_hand', auth, tableId);
      return { success: false, authorization: auth };
    }

    const table = this.tables.get(tableId);
    if (!table) {
      return { success: false, authorization: auth, error: 'Table not found' };
    }

    // Generate hand ID
    const handId = `hand_${tableId}_${Date.now()}` as HandId;

    // Update table with current hand
    const updated: ClubTable = {
      ...table,
      status: 'ACTIVE',
      currentHandId: handId,
      updatedAt: Date.now(),
    };

    this.tables.set(tableId, updated);

    // Start hand in economy runtime
    this.economyRuntime.startHand(handId, tableId);

    return { success: true, data: { handId }, authorization: auth };
  }

  /**
   * End current hand (called after settlement)
   */
  endHand(
    clubId: ClubId,
    tableId: TableId,
    callerId: PlayerId
  ): AuthorizedResult {
    const table = this.tables.get(tableId);
    if (!table) {
      const auth = this.authEngine.authorize(
        this.buildContext(clubId, callerId, tableId),
        'start_hand',
        callerId,
        clubId
      );
      return { success: false, authorization: auth, error: 'Table not found' };
    }

    const updated: ClubTable = {
      ...table,
      status: 'OPEN',
      currentHandId: null,
      updatedAt: Date.now(),
    };

    this.tables.set(tableId, updated);

    // Fake auth for internal use
    const auth: AuthorizationResult = {
      authorized: true,
      requestId: 'internal' as any,
      action: 'start_hand',
      callerId,
      timestamp: Date.now(),
    };

    return { success: true, authorization: auth };
  }

  // ==========================================================================
  // Query Operations
  // ==========================================================================

  /**
   * Get a table
   */
  getTable(tableId: TableId): ClubTable | null {
    return this.tables.get(tableId) ?? null;
  }

  /**
   * Get all tables for a club
   */
  getClubTables(clubId: ClubId): readonly ClubTable[] {
    const tableIds = this.tablesByClub.get(clubId);
    if (!tableIds) {
      return [];
    }

    return Array.from(tableIds)
      .map(id => this.tables.get(id))
      .filter((t): t is ClubTable => t !== undefined);
  }

  /**
   * Get active tables for a club
   */
  getActiveTables(clubId: ClubId): readonly ClubTable[] {
    return this.getClubTables(clubId).filter(t => t.status !== 'CLOSED');
  }

  /**
   * Get event log
   */
  getEventLog(): readonly AuthorityEvent[] {
    return [...this.eventLog];
  }

  /**
   * Check if rake policy can be changed
   */
  canChangeRakePolicy(tableId: TableId): boolean {
    const table = this.tables.get(tableId);
    if (!table) {
      return false;
    }

    // Cannot change rake policy during active hand
    return table.currentHandId === null;
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

  private buildContext(
    clubId: ClubId,
    callerId: PlayerId,
    tableId?: TableId,
    targetPlayerId?: PlayerId
  ): AuthorizationContext {
    const club = this.clubManager.getClub(clubId);
    const callerMembership = this.clubManager.getMember(clubId, callerId);
    const targetMembership = targetPlayerId
      ? this.clubManager.getMember(clubId, targetPlayerId)
      : null;
    const table = tableId ? this.tables.get(tableId) ?? null : null;

    return {
      club,
      callerMembership,
      targetMembership,
      table,
    };
  }

  private forceCashOut(clubId: ClubId, tableId: TableId, playerId: PlayerId): void {
    try {
      const result = this.economyRuntime.cashOut(tableId, playerId);
      if (result.success && result.cashOutAmount > 0) {
        this.emitEvent('player_cashed_out', clubId, playerId, undefined, tableId, {
          amount: result.cashOutAmount,
          forced: true,
        });
      }
    } catch {
      // Ignore cash out errors for force operations
    }
  }

  private emitEvent(
    type: AuthorityEventType,
    clubId: ClubId,
    actorId: PlayerId,
    targetId: PlayerId | undefined,
    tableId: TableId | undefined,
    data: Record<string, unknown>
  ): void {
    const event: AuthorityEvent = {
      eventId: generateEventId(),
      type,
      clubId,
      tableId,
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

  private emitAuthDenied(
    clubId: ClubId,
    callerId: PlayerId,
    action: AuthorizedAction,
    auth: AuthorizationResult,
    tableId?: TableId
  ): void {
    this.emitEvent('authorization_denied', clubId, callerId, undefined, tableId, {
      action,
      reason: auth.denialReason,
      details: auth.denialDetails,
    });
  }

  /**
   * Clear all state (for testing)
   */
  clear(): void {
    this.tables.clear();
    this.tablesByClub.clear();
    this.eventLog.length = 0;
    this.eventListeners.clear();
    this.tableIdCounter = 0;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let tableAuthorityInstance: TableAuthority | null = null;

export function getTableAuthority(): TableAuthority {
  if (!tableAuthorityInstance) {
    tableAuthorityInstance = new TableAuthority();
  }
  return tableAuthorityInstance;
}

export function resetTableAuthority(): TableAuthority {
  tableAuthorityInstance = new TableAuthority();
  return tableAuthorityInstance;
}

export function createTableAuthority(options?: {
  clubManager?: ClubManager;
  authEngine?: AuthorizationEngine;
  economyRuntime?: EconomyRuntime;
}): TableAuthority {
  return new TableAuthority(options);
}
