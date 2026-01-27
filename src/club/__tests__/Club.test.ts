/**
 * Club.test.ts
 * Phase 21 - Comprehensive tests for Club & Table Authority Layer
 *
 * Tests cover:
 * - Role-based access control
 * - Malicious attempts (player calling admin actions)
 * - Mid-hand permission violations
 * - Rake tampering attempts
 * - Economy boundary enforcement
 */

import { PlayerId } from '../../security/Identity';
import { TableId, HandId } from '../../security/AuditLog';
import {
  ClubId,
  Club,
  ClubMember,
  ClubRole,
  AuthorizationResult,
  resetClubCounters,
} from '../ClubTypes';
import {
  ClubManager,
  resetClubManager,
} from '../ClubManager';
import {
  AuthorizationEngine,
  AuthorizationContext,
  resetAuthorizationEngine,
} from '../AuthorizationEngine';
import {
  TableAuthority,
  createTableAuthority,
} from '../TableAuthority';
import {
  ProtectedEconomyAccess,
  BoundaryInvariantChecker,
  RakePolicyGuard,
  createProtectedEconomyAccess,
  createRakePolicyGuard,
} from '../EconomyBoundary';
import {
  EconomyRuntime,
  createEconomyRuntime,
  resetRuntimeCounters,
} from '../../economy/runtime';
import {
  resetBalanceManager,
} from '../../economy/Balance';
import {
  resetEscrowManager,
} from '../../economy/Escrow';
import {
  resetPotManager,
} from '../../economy/Pot';
import {
  resetLedgerManager,
} from '../../economy/Ledger';

// ============================================================================
// Test Utilities
// ============================================================================

const OWNER_ID = 'owner-001' as PlayerId;
const MANAGER_ID = 'manager-001' as PlayerId;
const PLAYER_1 = 'player-001' as PlayerId;
const PLAYER_2 = 'player-002' as PlayerId;
const PLAYER_3 = 'player-003' as PlayerId;
const MALICIOUS_PLAYER = 'hacker-001' as PlayerId;

function createTestSetup() {
  resetClubCounters();
  resetRuntimeCounters();

  const clubManager = resetClubManager();
  const authEngine = resetAuthorizationEngine();
  const economyRuntime = createEconomyRuntime({
    balanceManager: resetBalanceManager(),
    escrowManager: resetEscrowManager(),
    potManager: resetPotManager(),
    ledgerManager: resetLedgerManager(),
  });

  const tableAuthority = createTableAuthority({
    clubManager,
    authEngine,
    economyRuntime,
  });

  return { clubManager, authEngine, economyRuntime, tableAuthority };
}

function setupClubWithMembers(clubManager: ClubManager): ClubId {
  // Create club
  const result = clubManager.createClub('Test Club', OWNER_ID);
  const clubId = result.data!.clubId;

  // Add manager
  clubManager.addMember(clubId, MANAGER_ID, OWNER_ID);
  clubManager.promoteToManager(clubId, MANAGER_ID, OWNER_ID);

  // Add players
  clubManager.addMember(clubId, PLAYER_1, OWNER_ID);
  clubManager.addMember(clubId, PLAYER_2, OWNER_ID);

  return clubId;
}

function setupPlayerBalances(economyRuntime: EconomyRuntime) {
  economyRuntime.initializePlayer(OWNER_ID, 10000);
  economyRuntime.initializePlayer(MANAGER_ID, 10000);
  economyRuntime.initializePlayer(PLAYER_1, 10000);
  economyRuntime.initializePlayer(PLAYER_2, 10000);
  economyRuntime.initializePlayer(PLAYER_3, 10000);
}

// ============================================================================
// ClubManager Tests
// ============================================================================

describe('ClubManager', () => {
  let clubManager: ClubManager;

  beforeEach(() => {
    resetClubCounters();
    clubManager = resetClubManager();
  });

  describe('Club Creation', () => {
    it('should create a club with owner', () => {
      const result = clubManager.createClub('My Club', OWNER_ID);

      expect(result.success).toBe(true);
      expect(result.data?.name).toBe('My Club');
      expect(result.data?.ownerId).toBe(OWNER_ID);
      expect(result.data?.isActive).toBe(true);
    });

    it('should auto-add owner as OWNER member', () => {
      const result = clubManager.createClub('My Club', OWNER_ID);
      const member = clubManager.getMember(result.data!.clubId, OWNER_ID);

      expect(member).not.toBeNull();
      expect(member?.role).toBe('OWNER');
      expect(member?.status).toBe('ACTIVE');
    });

    it('should validate config', () => {
      const result = clubManager.createClub('My Club', OWNER_ID, {
        minBuyIn: 1000,
        maxBuyIn: 100, // Invalid: max < min
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INVALID_CONFIG');
    });
  });

  describe('Membership Management', () => {
    let clubId: ClubId;

    beforeEach(() => {
      const result = clubManager.createClub('My Club', OWNER_ID);
      clubId = result.data!.clubId;
    });

    it('should add members', () => {
      const result = clubManager.addMember(clubId, PLAYER_1, OWNER_ID);

      expect(result.success).toBe(true);
      expect(result.data?.playerId).toBe(PLAYER_1);
      expect(result.data?.role).toBe('PLAYER');
    });

    it('should not add duplicate members', () => {
      clubManager.addMember(clubId, PLAYER_1, OWNER_ID);
      const result = clubManager.addMember(clubId, PLAYER_1, OWNER_ID);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('MEMBER_ALREADY_EXISTS');
    });

    it('should promote player to manager', () => {
      clubManager.addMember(clubId, PLAYER_1, OWNER_ID);
      const result = clubManager.promoteToManager(clubId, PLAYER_1, OWNER_ID);

      expect(result.success).toBe(true);
      expect(result.data?.role).toBe('MANAGER');

      const club = clubManager.getClub(clubId);
      expect(club?.managerIds).toContain(PLAYER_1);
    });

    it('should demote manager to player', () => {
      clubManager.addMember(clubId, PLAYER_1, OWNER_ID);
      clubManager.promoteToManager(clubId, PLAYER_1, OWNER_ID);
      const result = clubManager.demoteFromManager(clubId, PLAYER_1, OWNER_ID);

      expect(result.success).toBe(true);
      expect(result.data?.role).toBe('PLAYER');

      const club = clubManager.getClub(clubId);
      expect(club?.managerIds).not.toContain(PLAYER_1);
    });

    it('should not demote owner', () => {
      const result = clubManager.demoteFromManager(clubId, OWNER_ID, OWNER_ID);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('CANNOT_DEMOTE_OWNER');
    });

    it('should ban member', () => {
      clubManager.addMember(clubId, PLAYER_1, OWNER_ID);
      const result = clubManager.banMember(clubId, PLAYER_1, OWNER_ID, 'Cheating');

      expect(result.success).toBe(true);
      expect(result.data?.status).toBe('BANNED');
      expect(result.data?.banReason).toBe('Cheating');
    });

    it('should not ban owner', () => {
      const result = clubManager.banMember(clubId, OWNER_ID, OWNER_ID, 'Test');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('OWNER_CANNOT_BE_BANNED');
    });

    it('should transfer ownership', () => {
      clubManager.addMember(clubId, PLAYER_1, OWNER_ID);
      const result = clubManager.transferOwnership(clubId, PLAYER_1, OWNER_ID);

      expect(result.success).toBe(true);
      expect(result.data?.ownerId).toBe(PLAYER_1);

      const oldOwner = clubManager.getMember(clubId, OWNER_ID);
      expect(oldOwner?.role).toBe('MANAGER');

      const newOwner = clubManager.getMember(clubId, PLAYER_1);
      expect(newOwner?.role).toBe('OWNER');
    });
  });

  describe('Event Emission', () => {
    it('should emit events for club operations', () => {
      const events: string[] = [];
      clubManager.onEvent(e => events.push(e.type));

      const result = clubManager.createClub('My Club', OWNER_ID);
      clubManager.addMember(result.data!.clubId, PLAYER_1, OWNER_ID);

      expect(events).toContain('club_created');
      expect(events).toContain('member_joined');
    });
  });
});

// ============================================================================
// AuthorizationEngine Tests
// ============================================================================

describe('AuthorizationEngine', () => {
  let clubManager: ClubManager;
  let authEngine: AuthorizationEngine;
  let clubId: ClubId;

  beforeEach(() => {
    resetClubCounters();
    clubManager = resetClubManager();
    authEngine = resetAuthorizationEngine();
    clubId = setupClubWithMembers(clubManager);
  });

  describe('Role-Based Access Control', () => {
    it('should allow owner to update config', () => {
      const context = buildContext(clubManager, clubId, OWNER_ID);
      const result = authEngine.authorize(context, 'update_club_config', OWNER_ID, clubId);

      expect(result.authorized).toBe(true);
    });

    it('should deny manager from updating config', () => {
      const context = buildContext(clubManager, clubId, MANAGER_ID);
      const result = authEngine.authorize(context, 'update_club_config', MANAGER_ID, clubId);

      expect(result.authorized).toBe(false);
      expect(result.denialReason).toBe('INSUFFICIENT_ROLE');
    });

    it('should deny player from updating config', () => {
      const context = buildContext(clubManager, clubId, PLAYER_1);
      const result = authEngine.authorize(context, 'update_club_config', PLAYER_1, clubId);

      expect(result.authorized).toBe(false);
      expect(result.denialReason).toBe('INSUFFICIENT_ROLE');
    });

    it('should allow manager to create table', () => {
      const context = buildContext(clubManager, clubId, MANAGER_ID);
      const result = authEngine.authorize(context, 'create_table', MANAGER_ID, clubId);

      expect(result.authorized).toBe(true);
    });

    it('should deny player from creating table', () => {
      const context = buildContext(clubManager, clubId, PLAYER_1);
      const result = authEngine.authorize(context, 'create_table', PLAYER_1, clubId);

      expect(result.authorized).toBe(false);
      expect(result.denialReason).toBe('INSUFFICIENT_ROLE');
    });

    it('should allow player to join table', () => {
      const context = buildContext(clubManager, clubId, PLAYER_1, 'table-001' as TableId);
      const result = authEngine.authorize(context, 'join_table', PLAYER_1, clubId);

      expect(result.authorized).toBe(true);
    });
  });

  describe('Malicious Attempts', () => {
    it('should deny non-member from any action', () => {
      const context = buildContext(clubManager, clubId, MALICIOUS_PLAYER);
      const result = authEngine.authorize(context, 'join_table', MALICIOUS_PLAYER, clubId);

      expect(result.authorized).toBe(false);
      expect(result.denialReason).toBe('NOT_CLUB_MEMBER');
    });

    it('should deny banned member from any action', () => {
      clubManager.addMember(clubId, MALICIOUS_PLAYER, OWNER_ID);
      clubManager.banMember(clubId, MALICIOUS_PLAYER, OWNER_ID, 'Cheating');

      const context = buildContext(clubManager, clubId, MALICIOUS_PLAYER);
      const result = authEngine.authorize(context, 'join_table', MALICIOUS_PLAYER, clubId);

      expect(result.authorized).toBe(false);
      expect(result.denialReason).toBe('MEMBER_BANNED');
    });

    it('should deny player trying to kick others', () => {
      const context = buildContext(clubManager, clubId, PLAYER_1, 'table-001' as TableId, PLAYER_2);
      const result = authEngine.authorize(context, 'kick_player', PLAYER_1, clubId, {
        targetPlayerId: PLAYER_2,
      });

      expect(result.authorized).toBe(false);
      expect(result.denialReason).toBe('INSUFFICIENT_ROLE');
    });

    it('should deny player trying to promote others', () => {
      const context = buildContext(clubManager, clubId, PLAYER_1, undefined, PLAYER_2);
      const result = authEngine.authorize(context, 'promote_to_manager', PLAYER_1, clubId, {
        targetPlayerId: PLAYER_2,
      });

      expect(result.authorized).toBe(false);
      expect(result.denialReason).toBe('INSUFFICIENT_ROLE');
    });

    it('should deny manager from kicking other managers', () => {
      clubManager.addMember(clubId, PLAYER_3, OWNER_ID);
      clubManager.promoteToManager(clubId, PLAYER_3, OWNER_ID);

      // MANAGER_ID trying to kick PLAYER_3 (also a manager)
      const context = buildContext(clubManager, clubId, MANAGER_ID, 'table-001' as TableId, PLAYER_3);
      // Add PLAYER_3 to occupied seats for the test
      const contextWithTable: AuthorizationContext = {
        ...context,
        table: {
          tableId: 'table-001' as TableId,
          clubId,
          createdBy: MANAGER_ID,
          status: 'OPEN',
          currentHandId: null,
          seatCount: 9,
          occupiedSeats: [PLAYER_3],
          pausedBy: null,
          pausedAt: null,
          pauseReason: null,
          rakePolicySnapshot: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      };

      const result = authEngine.authorize(contextWithTable, 'kick_player', MANAGER_ID, clubId, {
        targetPlayerId: PLAYER_3,
      });

      expect(result.authorized).toBe(false);
      expect(result.denialReason).toBe('CANNOT_KICK_MANAGER');
    });
  });

  describe('Mid-Hand Permission Violations', () => {
    it('should deny leaving table during hand', () => {
      const context: AuthorizationContext = {
        club: clubManager.getClub(clubId),
        callerMembership: clubManager.getMember(clubId, PLAYER_1),
        table: {
          tableId: 'table-001' as TableId,
          clubId,
          createdBy: MANAGER_ID,
          status: 'ACTIVE',
          currentHandId: 'hand-001' as HandId,
          seatCount: 9,
          occupiedSeats: [PLAYER_1, PLAYER_2],
          pausedBy: null,
          pausedAt: null,
          pauseReason: null,
          rakePolicySnapshot: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      };

      const result = authEngine.authorize(context, 'leave_table', PLAYER_1, clubId);

      expect(result.authorized).toBe(false);
      expect(result.denialReason).toBe('HAND_IN_PROGRESS');
    });

    it('should deny cash out during hand', () => {
      const context: AuthorizationContext = {
        club: clubManager.getClub(clubId),
        callerMembership: clubManager.getMember(clubId, PLAYER_1),
        table: {
          tableId: 'table-001' as TableId,
          clubId,
          createdBy: MANAGER_ID,
          status: 'ACTIVE',
          currentHandId: 'hand-001' as HandId,
          seatCount: 9,
          occupiedSeats: [PLAYER_1, PLAYER_2],
          pausedBy: null,
          pausedAt: null,
          pauseReason: null,
          rakePolicySnapshot: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      };

      const result = authEngine.authorize(context, 'cash_out', PLAYER_1, clubId);

      expect(result.authorized).toBe(false);
      expect(result.denialReason).toBe('HAND_IN_PROGRESS');
    });

    it('should deny starting hand when already in progress', () => {
      const context: AuthorizationContext = {
        club: clubManager.getClub(clubId),
        callerMembership: clubManager.getMember(clubId, MANAGER_ID),
        table: {
          tableId: 'table-001' as TableId,
          clubId,
          createdBy: MANAGER_ID,
          status: 'ACTIVE',
          currentHandId: 'hand-001' as HandId,
          seatCount: 9,
          occupiedSeats: [PLAYER_1, PLAYER_2],
          pausedBy: null,
          pausedAt: null,
          pauseReason: null,
          rakePolicySnapshot: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      };

      const result = authEngine.authorize(context, 'start_hand', MANAGER_ID, clubId);

      expect(result.authorized).toBe(false);
      expect(result.denialReason).toBe('HAND_IN_PROGRESS');
    });

    it('should deny rebuy during hand', () => {
      const context: AuthorizationContext = {
        club: clubManager.getClub(clubId),
        callerMembership: clubManager.getMember(clubId, PLAYER_1),
        table: {
          tableId: 'table-001' as TableId,
          clubId,
          createdBy: MANAGER_ID,
          status: 'ACTIVE',
          currentHandId: 'hand-001' as HandId,
          seatCount: 9,
          occupiedSeats: [PLAYER_1, PLAYER_2],
          pausedBy: null,
          pausedAt: null,
          pauseReason: null,
          rakePolicySnapshot: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        callerBalance: 10000,
      };

      const result = authEngine.authorize(context, 'rebuy', PLAYER_1, clubId);

      expect(result.authorized).toBe(false);
      expect(result.denialReason).toBe('HAND_IN_PROGRESS');
    });
  });

  describe('Buy-In Validation', () => {
    it('should deny buy-in below minimum', () => {
      const context: AuthorizationContext = {
        club: clubManager.getClub(clubId),
        callerMembership: clubManager.getMember(clubId, PLAYER_1),
        table: {
          tableId: 'table-001' as TableId,
          clubId,
          createdBy: MANAGER_ID,
          status: 'OPEN',
          currentHandId: null,
          seatCount: 9,
          occupiedSeats: [PLAYER_1],
          pausedBy: null,
          pausedAt: null,
          pauseReason: null,
          rakePolicySnapshot: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        callerBalance: 10000,
      };

      const result = authEngine.authorize(context, 'buy_in', PLAYER_1, clubId, {
        buyInAmount: 10, // Below minimum of 100
      });

      expect(result.authorized).toBe(false);
      expect(result.denialReason).toBe('BUY_IN_BELOW_MINIMUM');
    });

    it('should deny buy-in above maximum', () => {
      const context: AuthorizationContext = {
        club: clubManager.getClub(clubId),
        callerMembership: clubManager.getMember(clubId, PLAYER_1),
        table: {
          tableId: 'table-001' as TableId,
          clubId,
          createdBy: MANAGER_ID,
          status: 'OPEN',
          currentHandId: null,
          seatCount: 9,
          occupiedSeats: [PLAYER_1],
          pausedBy: null,
          pausedAt: null,
          pauseReason: null,
          rakePolicySnapshot: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        callerBalance: 100000,
      };

      const result = authEngine.authorize(context, 'buy_in', PLAYER_1, clubId, {
        buyInAmount: 50000, // Above maximum of 10000
      });

      expect(result.authorized).toBe(false);
      expect(result.denialReason).toBe('BUY_IN_ABOVE_MAXIMUM');
    });

    it('should deny buy-in with insufficient balance', () => {
      const context: AuthorizationContext = {
        club: clubManager.getClub(clubId),
        callerMembership: clubManager.getMember(clubId, PLAYER_1),
        table: {
          tableId: 'table-001' as TableId,
          clubId,
          createdBy: MANAGER_ID,
          status: 'OPEN',
          currentHandId: null,
          seatCount: 9,
          occupiedSeats: [PLAYER_1],
          pausedBy: null,
          pausedAt: null,
          pauseReason: null,
          rakePolicySnapshot: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        callerBalance: 50, // Less than buy-in amount
      };

      const result = authEngine.authorize(context, 'buy_in', PLAYER_1, clubId, {
        buyInAmount: 1000,
      });

      expect(result.authorized).toBe(false);
      expect(result.denialReason).toBe('INSUFFICIENT_BALANCE');
    });
  });
});

// ============================================================================
// TableAuthority Integration Tests
// ============================================================================

describe('TableAuthority Integration', () => {
  let setup: ReturnType<typeof createTestSetup>;
  let clubId: ClubId;

  beforeEach(() => {
    setup = createTestSetup();
    setupPlayerBalances(setup.economyRuntime);
    clubId = setupClubWithMembers(setup.clubManager);
  });

  describe('Table Lifecycle', () => {
    it('should create table as manager', () => {
      const result = setup.tableAuthority.createTable(clubId, MANAGER_ID);

      expect(result.success).toBe(true);
      expect(result.data?.status).toBe('OPEN');
      expect(result.data?.createdBy).toBe(MANAGER_ID);
    });

    it('should deny player from creating table', () => {
      const result = setup.tableAuthority.createTable(clubId, PLAYER_1);

      expect(result.success).toBe(false);
      expect(result.authorization.denialReason).toBe('INSUFFICIENT_ROLE');
    });

    it('should pause and resume table', () => {
      const createResult = setup.tableAuthority.createTable(clubId, MANAGER_ID);
      const tableId = createResult.data!.tableId;

      const pauseResult = setup.tableAuthority.pauseTable(clubId, tableId, MANAGER_ID, 'Break time');
      expect(pauseResult.success).toBe(true);
      expect(pauseResult.data?.status).toBe('PAUSED');
      expect(pauseResult.data?.pauseReason).toBe('Break time');

      const resumeResult = setup.tableAuthority.resumeTable(clubId, tableId, MANAGER_ID);
      expect(resumeResult.success).toBe(true);
      expect(resumeResult.data?.status).toBe('OPEN');
    });
  });

  describe('Player Table Actions', () => {
    let tableId: TableId;

    beforeEach(() => {
      const result = setup.tableAuthority.createTable(clubId, MANAGER_ID);
      tableId = result.data!.tableId;
    });

    it('should allow player to join table', () => {
      const result = setup.tableAuthority.joinTable(clubId, tableId, PLAYER_1);

      expect(result.success).toBe(true);
      expect(result.data?.occupiedSeats).toContain(PLAYER_1);
    });

    it('should allow player to buy in', () => {
      setup.tableAuthority.joinTable(clubId, tableId, PLAYER_1);
      const result = setup.tableAuthority.buyIn(clubId, tableId, PLAYER_1, 1000);

      expect(result.success).toBe(true);
      expect(result.data?.stack).toBe(1000);
    });

    it('should allow player to cash out', () => {
      setup.tableAuthority.joinTable(clubId, tableId, PLAYER_1);
      setup.tableAuthority.buyIn(clubId, tableId, PLAYER_1, 1000);

      const result = setup.tableAuthority.cashOut(clubId, tableId, PLAYER_1);

      expect(result.success).toBe(true);
      expect(result.data?.amount).toBe(1000);
    });

    it('should allow player to leave table', () => {
      setup.tableAuthority.joinTable(clubId, tableId, PLAYER_1);

      const result = setup.tableAuthority.leaveTable(clubId, tableId, PLAYER_1);

      expect(result.success).toBe(true);
      const table = setup.tableAuthority.getTable(tableId);
      expect(table?.occupiedSeats).not.toContain(PLAYER_1);
    });
  });

  describe('Manager Actions', () => {
    let tableId: TableId;

    beforeEach(() => {
      const result = setup.tableAuthority.createTable(clubId, MANAGER_ID);
      tableId = result.data!.tableId;
      setup.tableAuthority.joinTable(clubId, tableId, PLAYER_1);
      setup.tableAuthority.joinTable(clubId, tableId, PLAYER_2);
      setup.tableAuthority.buyIn(clubId, tableId, PLAYER_1, 1000);
      setup.tableAuthority.buyIn(clubId, tableId, PLAYER_2, 1000);
    });

    it('should allow manager to kick player', () => {
      const result = setup.tableAuthority.kickPlayer(clubId, tableId, MANAGER_ID, PLAYER_1);

      expect(result.success).toBe(true);
      const table = setup.tableAuthority.getTable(tableId);
      expect(table?.occupiedSeats).not.toContain(PLAYER_1);
    });

    it('should allow manager to start hand', () => {
      const result = setup.tableAuthority.startHand(clubId, tableId, MANAGER_ID);

      expect(result.success).toBe(true);
      expect(result.data?.handId).toBeDefined();

      const table = setup.tableAuthority.getTable(tableId);
      expect(table?.status).toBe('ACTIVE');
      expect(table?.currentHandId).toBe(result.data?.handId);
    });

    it('should deny player from kicking others', () => {
      const result = setup.tableAuthority.kickPlayer(clubId, tableId, PLAYER_1, PLAYER_2);

      expect(result.success).toBe(false);
      expect(result.authorization.denialReason).toBe('INSUFFICIENT_ROLE');
    });

    it('should deny player from starting hand', () => {
      const result = setup.tableAuthority.startHand(clubId, tableId, PLAYER_1);

      expect(result.success).toBe(false);
      expect(result.authorization.denialReason).toBe('INSUFFICIENT_ROLE');
    });
  });

  describe('Event Emission', () => {
    it('should emit events for table operations', () => {
      const events: string[] = [];
      setup.tableAuthority.onEvent(e => events.push(e.type));

      const createResult = setup.tableAuthority.createTable(clubId, MANAGER_ID);
      const tableId = createResult.data!.tableId;

      setup.tableAuthority.joinTable(clubId, tableId, PLAYER_1);
      setup.tableAuthority.buyIn(clubId, tableId, PLAYER_1, 1000);

      expect(events).toContain('table_created');
      expect(events).toContain('player_joined_table');
      expect(events).toContain('player_bought_in');
    });

    it('should emit authorization_denied for failed attempts', () => {
      const events: string[] = [];
      setup.tableAuthority.onEvent(e => events.push(e.type));

      setup.tableAuthority.createTable(clubId, PLAYER_1); // Should fail

      expect(events).toContain('authorization_denied');
    });
  });
});

// ============================================================================
// Economy Boundary Tests
// ============================================================================

describe('Economy Boundary Enforcement', () => {
  let setup: ReturnType<typeof createTestSetup>;
  let clubId: ClubId;
  let protectedAccess: ProtectedEconomyAccess;

  beforeEach(() => {
    setup = createTestSetup();
    setupPlayerBalances(setup.economyRuntime);
    clubId = setupClubWithMembers(setup.clubManager);
    protectedAccess = createProtectedEconomyAccess(
      setup.economyRuntime,
      setup.tableAuthority
    );
  });

  describe('Unauthorized Operations', () => {
    it('should record violation for unauthorized buy-in', () => {
      const fakeAuth: AuthorizationResult = {
        authorized: false,
        requestId: 'fake' as any,
        action: 'buy_in',
        callerId: PLAYER_1,
        denialReason: 'INSUFFICIENT_BALANCE',
        timestamp: Date.now(),
      };

      const result = protectedAccess.authorizedBuyIn(
        clubId,
        'table-001' as TableId,
        PLAYER_1,
        1000,
        fakeAuth
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unauthorized');

      const violations = protectedAccess.getViolations();
      expect(violations.length).toBe(1);
      expect(violations[0].violationType).toBe('UNAUTHORIZED_BUY_IN');
    });

    it('should record violation for wrong authorization type', () => {
      const wrongAuth: AuthorizationResult = {
        authorized: true,
        requestId: 'fake' as any,
        action: 'join_table', // Wrong action type
        callerId: PLAYER_1,
        timestamp: Date.now(),
      };

      const result = protectedAccess.authorizedBuyIn(
        clubId,
        'table-001' as TableId,
        PLAYER_1,
        1000,
        wrongAuth
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid authorization type');

      const violations = protectedAccess.getViolations();
      expect(violations.length).toBe(1);
    });
  });
});

// ============================================================================
// Rake Policy Guard Tests
// ============================================================================

describe('RakePolicyGuard', () => {
  let guard: RakePolicyGuard;

  beforeEach(() => {
    guard = createRakePolicyGuard();
  });

  it('should allow changes when no hand in progress', () => {
    const tableId = 'table-001' as TableId;

    expect(guard.canChange(tableId)).toBe(true);
  });

  it('should deny changes during hand', () => {
    const tableId = 'table-001' as TableId;
    const policy = { policyId: 'policy-1', policyHash: 'abc123', appliedAt: Date.now() };

    guard.snapshotForHand(tableId, policy);

    expect(guard.canChange(tableId)).toBe(false);
  });

  it('should allow changes after hand ends', () => {
    const tableId = 'table-001' as TableId;
    const policy = { policyId: 'policy-1', policyHash: 'abc123', appliedAt: Date.now() };

    guard.snapshotForHand(tableId, policy);
    expect(guard.canChange(tableId)).toBe(false);

    guard.clearSnapshot(tableId);
    expect(guard.canChange(tableId)).toBe(true);
  });

  it('should verify policy unchanged during hand', () => {
    const tableId = 'table-001' as TableId;
    const policy = { policyId: 'policy-1', policyHash: 'abc123', appliedAt: Date.now() };

    guard.snapshotForHand(tableId, policy);

    // Same policy - valid
    expect(guard.verifyUnchanged(tableId, policy)).toBe(true);

    // Different policy - invalid
    const changedPolicy = { policyId: 'policy-2', policyHash: 'def456', appliedAt: Date.now() };
    expect(guard.verifyUnchanged(tableId, changedPolicy)).toBe(false);
  });
});

// ============================================================================
// Boundary Invariant Tests
// ============================================================================

describe('BoundaryInvariantChecker', () => {
  it('should detect rake policy change during hand', () => {
    const table = {
      tableId: 'table-001' as TableId,
      clubId: 'club-001' as ClubId,
      createdBy: MANAGER_ID,
      status: 'ACTIVE' as const,
      currentHandId: 'hand-001' as HandId,
      seatCount: 9,
      occupiedSeats: [PLAYER_1, PLAYER_2],
      pausedBy: null,
      pausedAt: null,
      pauseReason: null,
      rakePolicySnapshot: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const result = BoundaryInvariantChecker.checkRakePolicyImmutableDuringHand(
      table,
      true // Attempted change
    );

    expect(result.valid).toBe(false);
    expect(result.violations.length).toBe(1);
    expect(result.violations[0].violationType).toBe('RAKE_POLICY_CHANGE_DURING_HAND');
  });

  it('should allow rake policy change when no hand', () => {
    const table = {
      tableId: 'table-001' as TableId,
      clubId: 'club-001' as ClubId,
      createdBy: MANAGER_ID,
      status: 'OPEN' as const,
      currentHandId: null,
      seatCount: 9,
      occupiedSeats: [PLAYER_1, PLAYER_2],
      pausedBy: null,
      pausedAt: null,
      pauseReason: null,
      rakePolicySnapshot: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const result = BoundaryInvariantChecker.checkRakePolicyImmutableDuringHand(
      table,
      true // Attempted change
    );

    expect(result.valid).toBe(true);
    expect(result.violations.length).toBe(0);
  });

  it('should detect unauthorized settlement', () => {
    const result = BoundaryInvariantChecker.checkAuthorizedSettlement(
      'hand-001' as HandId,
      'table-001' as TableId,
      null // No authorization
    );

    expect(result.valid).toBe(false);
    expect(result.violations.length).toBe(1);
    expect(result.violations[0].violationType).toBe('UNAUTHORIZED_SETTLEMENT');
  });
});

// ============================================================================
// Helper Functions
// ============================================================================

function buildContext(
  clubManager: ClubManager,
  clubId: ClubId,
  callerId: PlayerId,
  tableId?: TableId,
  targetPlayerId?: PlayerId
): AuthorizationContext {
  return {
    club: clubManager.getClub(clubId),
    callerMembership: clubManager.getMember(clubId, callerId),
    targetMembership: targetPlayerId ? clubManager.getMember(clubId, targetPlayerId) : null,
    table: tableId ? {
      tableId,
      clubId,
      createdBy: MANAGER_ID,
      status: 'OPEN',
      currentHandId: null,
      seatCount: 9,
      occupiedSeats: [],
      pausedBy: null,
      pausedAt: null,
      pauseReason: null,
      rakePolicySnapshot: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } : null,
  };
}
