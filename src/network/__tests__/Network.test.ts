/**
 * Network.test.ts
 * Phase 12 - Comprehensive tests for multiplayer networking
 */

import {
  // Errors
  RejectCode,
  NetworkError,
  Errors,
  toRejectionResponse,
  // Protocol
  createMessageHeader,
  createMessageId,
  createTableContext,
  isClientIntent,
  isServerEvent,
  ClientIntent,
  ServerEvent,
  PlayerAction,
  // Room State
  createEmptySeat,
  seatPlayer,
  createTable,
  updateTable,
  updateTableSeat,
  getSeatedPlayers,
  getActivePlayers,
  getSeatByPlayerId,
  getNextActiveSeat,
  canStartHand,
  createRoom,
  addPlayerToRoom,
  removePlayerFromRoom,
  getTableById,
  isSeatEmpty,
  isPlayerSeated,
  isHandInProgress,
  isPlayerTurn,
  generateTableSnapshot,
  generateRoomSnapshot,
  // Sync
  SyncEngine,
  resetSyncEngine,
  // Session
  SessionManager,
  resetSessionManager,
  // Authority
  RoomAuthority,
  createRoomAuthority,
} from '../index';

// ============================================================================
// NetworkErrors Tests
// ============================================================================

describe('NetworkErrors', () => {
  describe('Error Factory', () => {
    it('should create room not found error', () => {
      const error = Errors.roomNotFound('room-123');
      expect(error.code).toBe(RejectCode.ROOM_NOT_FOUND);
      expect(error.message).toContain('room-123');
    });

    it('should create seat taken error with details', () => {
      const error = Errors.seatTaken(2, 'player-456');
      expect(error.code).toBe(RejectCode.SEAT_TAKEN);
      expect(error.details?.occupantId).toBe('player-456');
    });

    it('should create not your turn error', () => {
      const error = Errors.notYourTurn('current-player');
      expect(error.code).toBe(RejectCode.NOT_YOUR_TURN);
      expect(error.details?.currentPlayerId).toBe('current-player');
    });

    it('should create sequence mismatch error', () => {
      const error = Errors.sequenceMismatch(10, 5);
      expect(error.code).toBe(RejectCode.SEQUENCE_MISMATCH);
      expect(error.message).toContain('10');
      expect(error.message).toContain('5');
    });
  });

  describe('toRejectionResponse', () => {
    it('should convert error to response', () => {
      const error = Errors.insufficientChips(100, 50);
      const response = toRejectionResponse(error);
      expect(response.code).toBe(RejectCode.INSUFFICIENT_CHIPS);
      expect(response.message).toBe(error.message);
    });
  });
});

// ============================================================================
// Protocol Tests
// ============================================================================

describe('Protocol', () => {
  describe('Message Creation', () => {
    it('should create unique message IDs', () => {
      const id1 = createMessageId();
      const id2 = createMessageId();
      expect(id1).not.toBe(id2);
    });

    it('should create message header with sequence', () => {
      const header = createMessageHeader(42);
      expect(header.sequence).toBe(42);
      expect(header.timestamp).toBeLessThanOrEqual(Date.now());
      expect(header.messageId).toBeTruthy();
    });

    it('should create table context', () => {
      const context = createTableContext('table-1', 'hand-1', 10);
      expect(context.tableId).toBe('table-1');
      expect(context.handId).toBe('hand-1');
      expect(context.sequence).toBe(10);
    });
  });

  describe('Type Guards', () => {
    it('should identify client intent', () => {
      const intent: ClientIntent = {
        type: 'heartbeat',
        header: createMessageHeader(1),
        sessionId: 'session-1',
        clientTime: Date.now(),
      };
      expect(isClientIntent(intent)).toBe(true);
      expect(isClientIntent({})).toBe(false);
    });

    it('should identify server event', () => {
      const event: ServerEvent = {
        type: 'ack',
        header: createMessageHeader(1),
        intentMessageId: 'msg-1',
      };
      expect(isServerEvent(event)).toBe(true);
      expect(isServerEvent(null)).toBe(false);
    });
  });
});

// ============================================================================
// RoomState Tests
// ============================================================================

describe('RoomState', () => {
  describe('Seat Management', () => {
    it('should create empty seat', () => {
      const seat = createEmptySeat(0);
      expect(seat.seatIndex).toBe(0);
      expect(seat.playerId).toBeNull();
      expect(seat.status).toBe('empty');
    });

    it('should seat player', () => {
      const seat = createEmptySeat(0);
      const seated = seatPlayer(seat, 'player-1', 'Alice', 1000);
      expect(seated.playerId).toBe('player-1');
      expect(seated.playerName).toBe('Alice');
      expect(seated.stack).toBe(1000);
      expect(seated.status).toBe('active');
    });
  });

  describe('Table Management', () => {
    it('should create table with empty seats', () => {
      const table = createTable('table-1', 'room-1', 6);
      expect(table.tableId).toBe('table-1');
      expect(table.maxSeats).toBe(6);
      expect(table.seats).toHaveLength(6);
      expect(table.seats.every(s => s.status === 'empty')).toBe(true);
    });

    it('should update table seat', () => {
      const table = createTable('table-1', 'room-1', 6);
      const updated = updateTableSeat(table, 0, {
        playerId: 'player-1',
        playerName: 'Alice',
        stack: 1000,
        status: 'active',
      });
      expect(updated.seats[0].playerId).toBe('player-1');
      expect(updated.seats[1].playerId).toBeNull();
    });

    it('should get seated players', () => {
      let table = createTable('table-1', 'room-1', 6);
      table = updateTableSeat(table, 0, {
        playerId: 'player-1',
        status: 'active',
      });
      table = updateTableSeat(table, 2, {
        playerId: 'player-2',
        status: 'active',
      });
      const seated = getSeatedPlayers(table);
      expect(seated).toHaveLength(2);
    });

    it('should get next active seat', () => {
      let table = createTable('table-1', 'room-1', 6);
      table = updateTableSeat(table, 0, { playerId: 'p1', status: 'active' });
      table = updateTableSeat(table, 2, { playerId: 'p2', status: 'active' });
      table = updateTableSeat(table, 4, { playerId: 'p3', status: 'active' });

      expect(getNextActiveSeat(table, 0)).toBe(2);
      expect(getNextActiveSeat(table, 2)).toBe(4);
      expect(getNextActiveSeat(table, 4)).toBe(0);
    });

    it('should check if can start hand', () => {
      let table = createTable('table-1', 'room-1', 6);
      expect(canStartHand(table)).toBe(false);

      table = updateTableSeat(table, 0, {
        playerId: 'p1',
        status: 'active',
        stack: 1000,
      });
      expect(canStartHand(table)).toBe(false);

      table = updateTableSeat(table, 1, {
        playerId: 'p2',
        status: 'active',
        stack: 1000,
      });
      expect(canStartHand(table)).toBe(true);
    });
  });

  describe('Room Management', () => {
    it('should create room with table', () => {
      const room = createRoom('room-1', 'club-1', 'Test Room', {
        smallBlind: 5,
        bigBlind: 10,
        minBuyIn: 100,
        maxBuyIn: 1000,
        maxSeats: 6,
        actionTimeoutSeconds: 30,
        disconnectGraceSeconds: 60,
      });
      expect(room.roomId).toBe('room-1');
      expect(room.tables).toHaveLength(1);
      expect(room.isOpen).toBe(true);
    });

    it('should add player to room', () => {
      const room = createRoom('room-1', 'club-1', 'Test Room', {
        smallBlind: 5,
        bigBlind: 10,
        minBuyIn: 100,
        maxBuyIn: 1000,
        maxSeats: 6,
        actionTimeoutSeconds: 30,
        disconnectGraceSeconds: 60,
      });
      const updated = addPlayerToRoom(room, 'player-1', 'Alice', false);
      expect(updated.players.has('player-1')).toBe(true);
    });

    it('should remove player from room', () => {
      let room = createRoom('room-1', 'club-1', 'Test Room', {
        smallBlind: 5,
        bigBlind: 10,
        minBuyIn: 100,
        maxBuyIn: 1000,
        maxSeats: 6,
        actionTimeoutSeconds: 30,
        disconnectGraceSeconds: 60,
      });
      room = addPlayerToRoom(room, 'player-1', 'Alice', false);
      room = removePlayerFromRoom(room, 'player-1');
      expect(room.players.has('player-1')).toBe(false);
    });
  });

  describe('Snapshot Generation', () => {
    it('should generate table snapshot', () => {
      let table = createTable('table-1', 'room-1', 6);
      table = updateTableSeat(table, 0, {
        playerId: 'player-1',
        playerName: 'Alice',
        stack: 1000,
        status: 'active',
        holeCards: [{ rank: 14, suit: 'spades' }, { rank: 13, suit: 'spades' }],
      });

      // Viewer is the player
      const snapshot = generateTableSnapshot(table, 'player-1');
      expect(snapshot.tableId).toBe('table-1');
      expect(snapshot.seats[0].holeCards).not.toBeNull();

      // Viewer is different player
      const otherSnapshot = generateTableSnapshot(table, 'player-2');
      expect(otherSnapshot.seats[0].holeCards).toBeNull();
    });
  });
});

// ============================================================================
// SyncEngine Tests
// ============================================================================

describe('SyncEngine', () => {
  let syncEngine: SyncEngine;

  beforeEach(() => {
    syncEngine = resetSyncEngine();
  });

  it('should initialize table', () => {
    syncEngine.initTable('table-1');
    expect(syncEngine.getSequence('table-1')).toBe(0);
  });

  it('should increment sequence', () => {
    syncEngine.initTable('table-1');
    const table = createTable('table-1', 'room-1', 6);

    const seq1 = syncEngine.incrementSequence('table-1', table, null);
    expect(seq1).toBe(1);

    const seq2 = syncEngine.incrementSequence('table-1', table, null);
    expect(seq2).toBe(2);
  });

  it('should validate sequence', () => {
    syncEngine.initTable('table-1');
    const table = createTable('table-1', 'room-1', 6);
    syncEngine.incrementSequence('table-1', table, null);

    // Valid sequence
    expect(() => syncEngine.validateSequence('table-1', 1)).not.toThrow();

    // Stale sequence
    expect(() => syncEngine.validateSequence('table-1', 0)).toThrow();
  });

  it('should store and retrieve snapshots', () => {
    syncEngine.initTable('table-1');
    const table = createTable('table-1', 'room-1', 6);

    syncEngine.storeSnapshot('table-1', table, null, 10);

    const retrieved = syncEngine.getSnapshotAtOrBefore('table-1', 10);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.sequence).toBe(10);
  });

  it('should generate diff between snapshots', () => {
    const base = generateTableSnapshot(createTable('table-1', 'room-1', 6), null);
    let table = createTable('table-1', 'room-1', 6);
    table = updateTable(table, { pot: 100, currentBet: 10 });
    const current = generateTableSnapshot(table, null);

    const diff = syncEngine.generateDiff(base, current);
    expect(diff.some(op => op.path === '/pot')).toBe(true);
    expect(diff.some(op => op.path === '/currentBet')).toBe(true);
  });
});

// ============================================================================
// SessionManager Tests
// ============================================================================

describe('SessionManager', () => {
  let sessionManager: SessionManager;

  beforeEach(() => {
    sessionManager = resetSessionManager({
      heartbeatIntervalMs: 100,
      heartbeatTimeoutMs: 300,
      maxMissedHeartbeats: 3,
      disconnectGraceMs: 500,
      sessionTimeoutMs: 10000,
    });
  });

  it('should create session', () => {
    const session = sessionManager.createSession('player-1', 'Alice');
    expect(session.playerId).toBe('player-1');
    expect(session.playerName).toBe('Alice');
    expect(session.status).toBe('connected');
  });

  it('should get session by ID', () => {
    const created = sessionManager.createSession('player-1', 'Alice');
    const retrieved = sessionManager.getSession(created.sessionId);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.playerId).toBe('player-1');
  });

  it('should get session by player ID', () => {
    sessionManager.createSession('player-1', 'Alice');
    const session = sessionManager.getSessionByPlayer('player-1');
    expect(session).not.toBeNull();
    expect(session!.playerId).toBe('player-1');
  });

  it('should process heartbeat', () => {
    const session = sessionManager.createSession('player-1', 'Alice');
    const clientTime = Date.now();
    const ack = sessionManager.processHeartbeat(session.sessionId, clientTime);

    expect(ack.type).toBe('heartbeat-ack');
    expect(ack.clientTime).toBe(clientTime);
    expect(ack.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('should disconnect session', () => {
    const session = sessionManager.createSession('player-1', 'Alice');
    sessionManager.disconnectSession(session.sessionId);

    const updated = sessionManager.getSession(session.sessionId);
    expect(updated!.status).toBe('disconnected');
  });

  it('should reconnect player within grace period', () => {
    const original = sessionManager.createSession('player-1', 'Alice');
    sessionManager.updateSession(original.sessionId, {
      currentRoomId: 'room-1',
      seatIndex: 0,
    });
    sessionManager.disconnectSession(original.sessionId);

    const reconnected = sessionManager.reconnectPlayer('player-1', 'Alice');
    expect(reconnected.status).toBe('connected');
    expect(reconnected.currentRoomId).toBe('room-1');
    expect(reconnected.seatIndex).toBe(0);
  });

  it('should expire session after grace period', async () => {
    const session = sessionManager.createSession('player-1', 'Alice');
    sessionManager.disconnectSession(session.sessionId);

    // Wait for grace period
    await new Promise(resolve => setTimeout(resolve, 600));

    const { expired } = sessionManager.checkTimeouts();
    expect(expired).toContain(session.sessionId);
  });
});

// ============================================================================
// RoomAuthority Tests
// ============================================================================

describe('RoomAuthority', () => {
  let authority: RoomAuthority;
  let sessionManager: SessionManager;
  let syncEngine: SyncEngine;

  beforeEach(() => {
    sessionManager = resetSessionManager();
    syncEngine = resetSyncEngine();
    authority = createRoomAuthority(sessionManager, syncEngine, {
      autoStartHand: false,
    });

    // Create a room
    authority.createRoom('room-1', 'club-1', 'Test Room', {
      smallBlind: 5,
      bigBlind: 10,
      minBuyIn: 100,
      maxBuyIn: 1000,
      maxSeats: 6,
      actionTimeoutSeconds: 30,
      disconnectGraceSeconds: 60,
    });
  });

  describe('Join/Leave Room', () => {
    it('should allow player to join room', () => {
      const session = sessionManager.createSession('player-1', 'Alice');
      const result = authority.processIntent({
        type: 'join-room',
        header: createMessageHeader(1),
        sessionId: session.sessionId,
        roomId: 'room-1',
      });

      expect(result.success).toBe(true);
      expect(result.events.some(e => e.type === 'room-joined')).toBe(true);
    });

    it('should reject joining non-existent room', () => {
      const session = sessionManager.createSession('player-1', 'Alice');
      const result = authority.processIntent({
        type: 'join-room',
        header: createMessageHeader(1),
        sessionId: session.sessionId,
        roomId: 'non-existent',
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(RejectCode.ROOM_NOT_FOUND);
    });

    it('should allow player to leave room', () => {
      const session = sessionManager.createSession('player-1', 'Alice');
      authority.processIntent({
        type: 'join-room',
        header: createMessageHeader(1),
        sessionId: session.sessionId,
        roomId: 'room-1',
      });

      const result = authority.processIntent({
        type: 'leave-room',
        header: createMessageHeader(2),
        sessionId: session.sessionId,
        roomId: 'room-1',
      });

      expect(result.success).toBe(true);
      expect(result.events.some(e => e.type === 'room-left')).toBe(true);
    });
  });

  describe('Seat Management', () => {
    it('should allow player to take seat', () => {
      const session = sessionManager.createSession('player-1', 'Alice');
      authority.processIntent({
        type: 'join-room',
        header: createMessageHeader(1),
        sessionId: session.sessionId,
        roomId: 'room-1',
      });

      const room = authority.getRoom('room-1')!;
      const tableId = room.tables[0].tableId;

      const result = authority.processIntent({
        type: 'take-seat',
        header: createMessageHeader(2),
        sessionId: session.sessionId,
        tableContext: createTableContext(tableId, null, 0),
        seatIndex: 0,
        buyInAmount: 500,
      });

      expect(result.success).toBe(true);
      expect(result.events.some(e => e.type === 'seat-taken')).toBe(true);
    });

    it('should reject taking occupied seat', () => {
      const session1 = sessionManager.createSession('player-1', 'Alice');
      const session2 = sessionManager.createSession('player-2', 'Bob');

      authority.processIntent({
        type: 'join-room',
        header: createMessageHeader(1),
        sessionId: session1.sessionId,
        roomId: 'room-1',
      });
      authority.processIntent({
        type: 'join-room',
        header: createMessageHeader(2),
        sessionId: session2.sessionId,
        roomId: 'room-1',
      });

      const room = authority.getRoom('room-1')!;
      const tableId = room.tables[0].tableId;

      // Player 1 takes seat
      authority.processIntent({
        type: 'take-seat',
        header: createMessageHeader(3),
        sessionId: session1.sessionId,
        tableContext: createTableContext(tableId, null, 0),
        seatIndex: 0,
        buyInAmount: 500,
      });

      // Player 2 tries same seat
      const result = authority.processIntent({
        type: 'take-seat',
        header: createMessageHeader(4),
        sessionId: session2.sessionId,
        tableContext: createTableContext(tableId, null, 1),
        seatIndex: 0,
        buyInAmount: 500,
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(RejectCode.SEAT_TAKEN);
    });

    it('should reject insufficient buy-in', () => {
      const session = sessionManager.createSession('player-1', 'Alice');
      authority.processIntent({
        type: 'join-room',
        header: createMessageHeader(1),
        sessionId: session.sessionId,
        roomId: 'room-1',
      });

      const room = authority.getRoom('room-1')!;
      const tableId = room.tables[0].tableId;

      const result = authority.processIntent({
        type: 'take-seat',
        header: createMessageHeader(2),
        sessionId: session.sessionId,
        tableContext: createTableContext(tableId, null, 0),
        seatIndex: 0,
        buyInAmount: 50, // Below minimum
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(RejectCode.INSUFFICIENT_BUYIN);
    });
  });

  describe('Hand Start', () => {
    it('should start hand with two players', () => {
      const session1 = sessionManager.createSession('player-1', 'Alice');
      const session2 = sessionManager.createSession('player-2', 'Bob');

      authority.processIntent({
        type: 'join-room',
        header: createMessageHeader(1),
        sessionId: session1.sessionId,
        roomId: 'room-1',
      });
      authority.processIntent({
        type: 'join-room',
        header: createMessageHeader(2),
        sessionId: session2.sessionId,
        roomId: 'room-1',
      });

      const room = authority.getRoom('room-1')!;
      const tableId = room.tables[0].tableId;

      authority.processIntent({
        type: 'take-seat',
        header: createMessageHeader(3),
        sessionId: session1.sessionId,
        tableContext: createTableContext(tableId, null, 0),
        seatIndex: 0,
        buyInAmount: 500,
      });

      authority.processIntent({
        type: 'take-seat',
        header: createMessageHeader(4),
        sessionId: session2.sessionId,
        tableContext: createTableContext(tableId, null, 1),
        seatIndex: 1,
        buyInAmount: 500,
      });

      const events = authority.startNewHand('room-1', tableId);
      expect(events.some(e => e.type === 'hand-started')).toBe(true);

      const updatedRoom = authority.getRoom('room-1')!;
      const table = getTableById(updatedRoom, tableId)!;
      expect(isHandInProgress(table)).toBe(true);
    });
  });

  describe('Player Actions', () => {
    let tableId: string;
    let handId: string;
    let session1: ReturnType<typeof sessionManager.createSession>;
    let session2: ReturnType<typeof sessionManager.createSession>;

    beforeEach(() => {
      session1 = sessionManager.createSession('player-1', 'Alice');
      session2 = sessionManager.createSession('player-2', 'Bob');

      authority.processIntent({
        type: 'join-room',
        header: createMessageHeader(1),
        sessionId: session1.sessionId,
        roomId: 'room-1',
      });
      authority.processIntent({
        type: 'join-room',
        header: createMessageHeader(2),
        sessionId: session2.sessionId,
        roomId: 'room-1',
      });

      const room = authority.getRoom('room-1')!;
      tableId = room.tables[0].tableId;

      authority.processIntent({
        type: 'take-seat',
        header: createMessageHeader(3),
        sessionId: session1.sessionId,
        tableContext: createTableContext(tableId, null, 0),
        seatIndex: 0,
        buyInAmount: 500,
      });

      authority.processIntent({
        type: 'take-seat',
        header: createMessageHeader(4),
        sessionId: session2.sessionId,
        tableContext: createTableContext(tableId, null, 1),
        seatIndex: 1,
        buyInAmount: 500,
      });

      authority.startNewHand('room-1', tableId);
      const updatedRoom = authority.getRoom('room-1')!;
      const table = getTableById(updatedRoom, tableId)!;
      handId = table.handId!;
    });

    it('should accept valid fold action', () => {
      // Re-fetch room state after hand started
      const room = authority.getRoom('room-1')!;
      const table = getTableById(room, tableId)!;
      // Update handId from current state
      const currentHandId = table.handId!;
      const activeSession = table.activePlayerSeat === 0 ? session1 : session2;

      const result = authority.processIntent({
        type: 'player-action',
        header: createMessageHeader(10),
        sessionId: activeSession.sessionId,
        tableContext: createTableContext(tableId, currentHandId, table.sequence),
        action: { type: 'fold' },
      });

      expect(result.success).toBe(true);
      expect(result.events.some(e => e.type === 'action-performed')).toBe(true);
    });

    it('should reject action from wrong player', () => {
      const room = authority.getRoom('room-1')!;
      const table = getTableById(room, tableId)!;
      const inactiveSession = table.activePlayerSeat === 0 ? session2 : session1;

      const result = authority.processIntent({
        type: 'player-action',
        header: createMessageHeader(10),
        sessionId: inactiveSession.sessionId,
        tableContext: createTableContext(tableId, handId, table.sequence),
        action: { type: 'fold' },
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(RejectCode.NOT_YOUR_TURN);
    });

    it('should reject action with wrong hand ID', () => {
      const room = authority.getRoom('room-1')!;
      const table = getTableById(room, tableId)!;
      const activeSession = table.activePlayerSeat === 0 ? session1 : session2;

      const result = authority.processIntent({
        type: 'player-action',
        header: createMessageHeader(10),
        sessionId: activeSession.sessionId,
        tableContext: createTableContext(tableId, 'wrong-hand-id', table.sequence),
        action: { type: 'fold' },
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(RejectCode.INVALID_HAND_ID);
    });
  });

  describe('Sync Requests', () => {
    it('should return snapshot for sync request', () => {
      const session = sessionManager.createSession('player-1', 'Alice');
      authority.processIntent({
        type: 'join-room',
        header: createMessageHeader(1),
        sessionId: session.sessionId,
        roomId: 'room-1',
      });

      const room = authority.getRoom('room-1')!;
      const tableId = room.tables[0].tableId;

      const result = authority.processIntent({
        type: 'request-sync',
        header: createMessageHeader(2),
        sessionId: session.sessionId,
        tableContext: createTableContext(tableId, null, 0),
      });

      expect(result.success).toBe(true);
      expect(result.events.some(e => e.type === 'snapshot')).toBe(true);
    });
  });

  describe('Disconnect Handling', () => {
    it('should handle player disconnect', () => {
      const session = sessionManager.createSession('player-1', 'Alice');
      authority.processIntent({
        type: 'join-room',
        header: createMessageHeader(1),
        sessionId: session.sessionId,
        roomId: 'room-1',
      });

      const room = authority.getRoom('room-1')!;
      const tableId = room.tables[0].tableId;

      authority.processIntent({
        type: 'take-seat',
        header: createMessageHeader(2),
        sessionId: session.sessionId,
        tableContext: createTableContext(tableId, null, 0),
        seatIndex: 0,
        buyInAmount: 500,
      });

      const events = authority.handleDisconnect('player-1', 0, tableId);
      expect(events.some(e => e.type === 'player-disconnected')).toBe(true);
    });

    it('should handle player reconnect', () => {
      const session = sessionManager.createSession('player-1', 'Alice');
      authority.processIntent({
        type: 'join-room',
        header: createMessageHeader(1),
        sessionId: session.sessionId,
        roomId: 'room-1',
      });

      const room = authority.getRoom('room-1')!;
      const tableId = room.tables[0].tableId;

      authority.processIntent({
        type: 'take-seat',
        header: createMessageHeader(2),
        sessionId: session.sessionId,
        tableContext: createTableContext(tableId, null, 0),
        seatIndex: 0,
        buyInAmount: 500,
      });

      authority.handleDisconnect('player-1', 0, tableId);
      const events = authority.handleReconnect('player-1', tableId, 0);
      expect(events.some(e => e.type === 'player-reconnected')).toBe(true);
    });
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('Integration', () => {
  it('should handle complete join-seat-play flow', () => {
    const sessionManager = resetSessionManager();
    const syncEngine = resetSyncEngine();
    const authority = createRoomAuthority(sessionManager, syncEngine, {
      autoStartHand: false,
    });

    // Create room
    authority.createRoom('room-1', 'club-1', 'Test Room', {
      smallBlind: 5,
      bigBlind: 10,
      minBuyIn: 100,
      maxBuyIn: 1000,
      maxSeats: 6,
      actionTimeoutSeconds: 30,
      disconnectGraceSeconds: 60,
    });

    // Create sessions
    const alice = sessionManager.createSession('alice', 'Alice');
    const bob = sessionManager.createSession('bob', 'Bob');

    // Both join room
    authority.processIntent({
      type: 'join-room',
      header: createMessageHeader(1),
      sessionId: alice.sessionId,
      roomId: 'room-1',
    });
    authority.processIntent({
      type: 'join-room',
      header: createMessageHeader(2),
      sessionId: bob.sessionId,
      roomId: 'room-1',
    });

    const room = authority.getRoom('room-1')!;
    const tableId = room.tables[0].tableId;

    // Both take seats
    authority.processIntent({
      type: 'take-seat',
      header: createMessageHeader(3),
      sessionId: alice.sessionId,
      tableContext: createTableContext(tableId, null, 0),
      seatIndex: 0,
      buyInAmount: 500,
    });
    authority.processIntent({
      type: 'take-seat',
      header: createMessageHeader(4),
      sessionId: bob.sessionId,
      tableContext: createTableContext(tableId, null, 1),
      seatIndex: 1,
      buyInAmount: 500,
    });

    // Start hand
    const startEvents = authority.startNewHand('room-1', tableId);
    expect(startEvents.length).toBeGreaterThan(0);

    // Get current state
    let currentRoom = authority.getRoom('room-1')!;
    let table = getTableById(currentRoom, tableId)!;
    const handId = table.handId!;

    // Determine who acts first
    const firstActorSession = table.activePlayerSeat === 0 ? alice : bob;
    const secondActorSession = table.activePlayerSeat === 0 ? bob : alice;

    // First player calls
    const callResult = authority.processIntent({
      type: 'player-action',
      header: createMessageHeader(10),
      sessionId: firstActorSession.sessionId,
      tableContext: createTableContext(tableId, handId, table.sequence),
      action: { type: 'call' },
    });
    expect(callResult.success).toBe(true);

    // Update table state
    currentRoom = authority.getRoom('room-1')!;
    table = getTableById(currentRoom, tableId)!;

    // Second player checks
    const checkResult = authority.processIntent({
      type: 'player-action',
      header: createMessageHeader(11),
      sessionId: secondActorSession.sessionId,
      tableContext: createTableContext(tableId, handId, table.sequence),
      action: { type: 'check' },
    });
    expect(checkResult.success).toBe(true);

    // Verify street advanced
    currentRoom = authority.getRoom('room-1')!;
    table = getTableById(currentRoom, tableId)!;
    expect(table.street === 'flop' || table.communityCards.length > 0).toBe(true);
  });
});
