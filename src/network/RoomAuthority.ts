/**
 * RoomAuthority.ts
 * Phase 12 - Server-side intent validation and state management
 *
 * Single source of truth for game state. Validates all client intents.
 */

import {
  PlayerId,
  RoomId,
  TableId,
  SessionId,
  HandId,
  MessageHeader,
  TableContext,
  ClientIntent,
  ServerEvent,
  PlayerAction,
  AckEvent,
  RejectEvent,
  RoomJoinedEvent,
  RoomLeftEvent,
  PlayerJoinedEvent,
  PlayerLeftEvent,
  SeatTakenEvent,
  SeatVacatedEvent,
  PlayerSatOutEvent,
  PlayerSatBackEvent,
  HandStartedEvent,
  ActionPerformedEvent,
  StreetChangedEvent,
  PotUpdatedEvent,
  HandEndedEvent,
  PlayerDisconnectedEvent,
  PlayerTimedOutEvent,
  createMessageHeader,
  createMessageId,
  Card,
} from './Protocol';
import {
  Room,
  Table,
  Seat,
  Club,
  createRoom,
  createTable,
  addPlayerToRoom,
  removePlayerFromRoom,
  updatePlayerInRoom,
  updateRoomTable,
  updateTable,
  updateTableSeat,
  incrementSequence,
  getTableById,
  getSeatByPlayerId,
  getSeatedPlayers,
  getActivePlayers,
  getActingPlayers,
  getNextActiveSeat,
  canStartHand,
  isSeatEmpty,
  isPlayerSeated,
  isHandInProgress,
  isPlayerTurn,
  isValidSeatIndex,
  seatPlayer,
  vacateSeat,
  Street,
} from './RoomState';
import {
  Errors,
  NetworkError,
  RejectCode,
  toRejectionResponse,
} from './NetworkErrors';
import { SessionManager, Session } from './ConnectionSession';
import { SyncEngine } from './SyncEngine';

// ============================================================================
// Types
// ============================================================================

export interface AuthorityConfig {
  readonly autoStartHand: boolean;
  readonly autoFoldOnTimeout: boolean;
  readonly autoCheckOnTimeout: boolean;
}

export interface IntentResult {
  readonly success: boolean;
  readonly events: readonly ServerEvent[];
  readonly error?: NetworkError;
}

export type EventCallback = (event: ServerEvent, targets: PlayerId[]) => void;

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: AuthorityConfig = {
  autoStartHand: true,
  autoFoldOnTimeout: true,
  autoCheckOnTimeout: true,
};

// ============================================================================
// RoomAuthority Class
// ============================================================================

export class RoomAuthority {
  private rooms: Map<RoomId, Room>;
  private sessionManager: SessionManager;
  private syncEngine: SyncEngine;
  private config: AuthorityConfig;
  private globalSequence: number;
  private onEvent?: EventCallback;

  constructor(
    sessionManager: SessionManager,
    syncEngine: SyncEngine,
    config: Partial<AuthorityConfig> = {}
  ) {
    this.rooms = new Map();
    this.sessionManager = sessionManager;
    this.syncEngine = syncEngine;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.globalSequence = 0;
  }

  /**
   * Set event callback for broadcasting
   */
  setEventCallback(callback: EventCallback): void {
    this.onEvent = callback;
  }

  /**
   * Create a new room
   */
  createRoom(
    roomId: RoomId,
    clubId: string,
    name: string,
    config: {
      smallBlind: number;
      bigBlind: number;
      minBuyIn: number;
      maxBuyIn: number;
      maxSeats: number;
      actionTimeoutSeconds: number;
      disconnectGraceSeconds: number;
    }
  ): Room {
    const room = createRoom(roomId, clubId, name, config);
    this.rooms.set(roomId, room);

    // Initialize sync for tables
    for (const table of room.tables) {
      this.syncEngine.initTable(table.tableId);
    }

    return room;
  }

  /**
   * Get room by ID
   */
  getRoom(roomId: RoomId): Room | null {
    return this.rooms.get(roomId) ?? null;
  }

  /**
   * Process a client intent
   */
  processIntent(intent: ClientIntent): IntentResult {
    try {
      // Validate session
      const session = this.sessionManager.validateSession(intent.sessionId);

      switch (intent.type) {
        case 'join-room':
          return this.handleJoinRoom(session, intent.roomId, intent.asSpectator ?? false);

        case 'leave-room':
          return this.handleLeaveRoom(session, intent.roomId);

        case 'take-seat':
          return this.handleTakeSeat(
            session,
            intent.tableContext,
            intent.seatIndex,
            intent.buyInAmount
          );

        case 'leave-seat':
          return this.handleLeaveSeat(session, intent.tableContext);

        case 'stand-up':
          return this.handleStandUp(session, intent.tableContext);

        case 'sit-back':
          return this.handleSitBack(session, intent.tableContext);

        case 'player-action':
          return this.handlePlayerAction(session, intent.tableContext, intent.action);

        case 'heartbeat':
          const ackEvent = this.sessionManager.processHeartbeat(
            intent.sessionId,
            intent.clientTime
          );
          return { success: true, events: [ackEvent] };

        case 'request-sync':
          return this.handleRequestSync(session, intent.tableContext, intent.fromSequence);

        default:
          throw Errors.invalidAction((intent as ClientIntent).type);
      }
    } catch (error) {
      if (error instanceof NetworkError) {
        const rejectEvent = this.createRejectEvent(
          intent.header.messageId,
          error
        );
        return { success: false, events: [rejectEvent], error };
      }
      throw error;
    }
  }

  // ============================================================================
  // Intent Handlers
  // ============================================================================

  private handleJoinRoom(
    session: Session,
    roomId: RoomId,
    asSpectator: boolean
  ): IntentResult {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw Errors.roomNotFound(roomId);
    }
    if (!room.isOpen) {
      throw Errors.roomClosed(roomId);
    }
    if (session.currentRoomId === roomId) {
      throw Errors.alreadyInRoom(roomId);
    }

    // Update room state
    const updatedRoom = addPlayerToRoom(
      room,
      session.playerId,
      session.playerName,
      asSpectator
    );
    this.rooms.set(roomId, updatedRoom);

    // Update session
    this.sessionManager.updateSession(session.sessionId, {
      currentRoomId: roomId,
      currentTableId: updatedRoom.tables[0].tableId,
    });

    const events: ServerEvent[] = [];

    // Room joined event for the joining player
    events.push({
      type: 'room-joined',
      header: this.createHeader(),
      roomId,
      playerId: session.playerId,
      isSpectator: asSpectator,
    });

    // Player joined event for all other players in room
    events.push({
      type: 'player-joined',
      header: this.createHeader(),
      playerId: session.playerId,
      playerName: session.playerName,
      isSpectator: asSpectator,
    });

    this.broadcastToRoom(roomId, events[1], [session.playerId]);

    return { success: true, events };
  }

  private handleLeaveRoom(session: Session, roomId: RoomId): IntentResult {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw Errors.roomNotFound(roomId);
    }
    if (session.currentRoomId !== roomId) {
      throw Errors.notInRoom();
    }

    // If seated, must leave seat first
    if (session.seatIndex !== null) {
      const table = getTableById(room, session.currentTableId!);
      if (table && isHandInProgress(table)) {
        throw Errors.cannotChangeSeat();
      }
      // Auto leave seat
      this.doLeaveSeat(room, session);
    }

    // Update room state
    const updatedRoom = removePlayerFromRoom(room, session.playerId);
    this.rooms.set(roomId, updatedRoom);

    // Update session
    this.sessionManager.updateSession(session.sessionId, {
      currentRoomId: null,
      currentTableId: null,
      seatIndex: null,
    });

    const events: ServerEvent[] = [];

    events.push({
      type: 'room-left',
      header: this.createHeader(),
      roomId,
      playerId: session.playerId,
    });

    events.push({
      type: 'player-left',
      header: this.createHeader(),
      playerId: session.playerId,
    });

    this.broadcastToRoom(roomId, events[1], [session.playerId]);

    return { success: true, events };
  }

  private handleTakeSeat(
    session: Session,
    tableContext: TableContext,
    seatIndex: number,
    buyInAmount: number
  ): IntentResult {
    const room = this.rooms.get(session.currentRoomId!);
    if (!room) {
      throw Errors.notInRoom();
    }

    const table = getTableById(room, tableContext.tableId);
    if (!table) {
      throw Errors.invalidTableId(tableContext.tableId);
    }

    // Validate seat
    if (!isValidSeatIndex(table, seatIndex)) {
      throw Errors.seatNotFound(seatIndex);
    }
    if (!isSeatEmpty(table, seatIndex)) {
      const occupant = table.seats[seatIndex].playerId;
      throw Errors.seatTaken(seatIndex, occupant ?? 'unknown');
    }
    if (isPlayerSeated(table, session.playerId)) {
      throw Errors.alreadySeated(session.seatIndex ?? -1);
    }

    // Validate buy-in
    if (buyInAmount < room.config.minBuyIn) {
      throw Errors.insufficientBuyin(room.config.minBuyIn, buyInAmount);
    }
    if (buyInAmount > room.config.maxBuyIn) {
      throw Errors.exceedsMaxBuyin(room.config.maxBuyIn, buyInAmount);
    }

    // Validate sequence
    this.syncEngine.validateSequence(table.tableId, tableContext.sequence);

    // Update table
    let updatedTable = updateTableSeat(table, seatIndex, {
      playerId: session.playerId,
      playerName: session.playerName,
      stack: buyInAmount,
      status: 'active',
    });
    updatedTable = incrementSequence(updatedTable);

    // Update room
    const updatedRoom = updateRoomTable(room, table.tableId, updatedTable);
    this.rooms.set(room.roomId, updatedRoom);

    // Update player in room
    const roomWithPlayer = updatePlayerInRoom(updatedRoom, session.playerId, {
      seatIndex,
      tableId: table.tableId,
      isSpectator: false,
    });
    this.rooms.set(room.roomId, roomWithPlayer);

    // Update session
    this.sessionManager.updateSession(session.sessionId, {
      seatIndex,
      currentTableId: table.tableId,
    });

    // Store snapshot
    this.syncEngine.storeSnapshot(
      table.tableId,
      updatedTable,
      null,
      updatedTable.sequence
    );

    const events: ServerEvent[] = [];
    const newTableContext: TableContext = {
      tableId: table.tableId,
      handId: table.handId,
      sequence: updatedTable.sequence,
    };

    events.push({
      type: 'seat-taken',
      header: this.createHeader(),
      tableContext: newTableContext,
      seatIndex,
      playerId: session.playerId,
      playerName: session.playerName,
      stack: buyInAmount,
    });

    this.broadcastToRoom(room.roomId, events[0]);

    // Auto-start hand if enabled
    if (this.config.autoStartHand && canStartHand(updatedTable) && !isHandInProgress(updatedTable)) {
      const handEvents = this.startNewHand(room.roomId, table.tableId);
      events.push(...handEvents);
    }

    return { success: true, events };
  }

  private handleLeaveSeat(session: Session, tableContext: TableContext): IntentResult {
    const room = this.rooms.get(session.currentRoomId!);
    if (!room) {
      throw Errors.notInRoom();
    }

    const table = getTableById(room, tableContext.tableId);
    if (!table) {
      throw Errors.invalidTableId(tableContext.tableId);
    }

    if (session.seatIndex === null) {
      throw Errors.notSeated();
    }

    if (isHandInProgress(table)) {
      throw Errors.cannotChangeSeat();
    }

    this.syncEngine.validateSequence(table.tableId, tableContext.sequence);

    const events = this.doLeaveSeat(room, session);
    return { success: true, events };
  }

  private doLeaveSeat(room: Room, session: Session): ServerEvent[] {
    const table = getTableById(room, session.currentTableId!)!;
    const seatIndex = session.seatIndex!;

    // Update table
    let updatedTable = updateTableSeat(table, seatIndex, {
      playerId: null,
      playerName: null,
      stack: 0,
      status: 'empty',
      holeCards: [],
      currentBet: 0,
      totalBetThisHand: 0,
    });
    updatedTable = incrementSequence(updatedTable);

    // Update room
    const updatedRoom = updateRoomTable(room, table.tableId, updatedTable);
    this.rooms.set(room.roomId, updatedRoom);

    // Update player in room
    const roomWithPlayer = updatePlayerInRoom(updatedRoom, session.playerId, {
      seatIndex: null,
      isSpectator: true,
    });
    this.rooms.set(room.roomId, roomWithPlayer);

    // Update session
    this.sessionManager.updateSession(session.sessionId, {
      seatIndex: null,
    });

    this.syncEngine.storeSnapshot(
      table.tableId,
      updatedTable,
      null,
      updatedTable.sequence
    );

    const events: ServerEvent[] = [];
    const tableContext: TableContext = {
      tableId: table.tableId,
      handId: table.handId,
      sequence: updatedTable.sequence,
    };

    events.push({
      type: 'seat-vacated',
      header: this.createHeader(),
      tableContext,
      seatIndex,
      playerId: session.playerId,
    });

    this.broadcastToRoom(room.roomId, events[0]);

    return events;
  }

  private handleStandUp(session: Session, tableContext: TableContext): IntentResult {
    const room = this.rooms.get(session.currentRoomId!);
    if (!room) {
      throw Errors.notInRoom();
    }

    const table = getTableById(room, tableContext.tableId);
    if (!table) {
      throw Errors.invalidTableId(tableContext.tableId);
    }

    if (session.seatIndex === null) {
      throw Errors.notSeated();
    }

    this.syncEngine.validateSequence(table.tableId, tableContext.sequence);

    // Update seat status to sitting-out
    let updatedTable = updateTableSeat(table, session.seatIndex, {
      status: 'sitting-out',
    });
    updatedTable = incrementSequence(updatedTable);

    const updatedRoom = updateRoomTable(room, table.tableId, updatedTable);
    this.rooms.set(room.roomId, updatedRoom);

    this.syncEngine.storeSnapshot(
      table.tableId,
      updatedTable,
      null,
      updatedTable.sequence
    );

    const events: ServerEvent[] = [];
    const newTableContext: TableContext = {
      tableId: table.tableId,
      handId: table.handId,
      sequence: updatedTable.sequence,
    };

    events.push({
      type: 'player-sat-out',
      header: this.createHeader(),
      tableContext: newTableContext,
      playerId: session.playerId,
      seatIndex: session.seatIndex,
    });

    this.broadcastToRoom(room.roomId, events[0]);

    return { success: true, events };
  }

  private handleSitBack(session: Session, tableContext: TableContext): IntentResult {
    const room = this.rooms.get(session.currentRoomId!);
    if (!room) {
      throw Errors.notInRoom();
    }

    const table = getTableById(room, tableContext.tableId);
    if (!table) {
      throw Errors.invalidTableId(tableContext.tableId);
    }

    if (session.seatIndex === null) {
      throw Errors.notSeated();
    }

    const seat = table.seats[session.seatIndex];
    if (seat.status !== 'sitting-out') {
      throw Errors.invalidAction('sit-back');
    }

    this.syncEngine.validateSequence(table.tableId, tableContext.sequence);

    // Update seat status back to active
    let updatedTable = updateTableSeat(table, session.seatIndex, {
      status: 'active',
    });
    updatedTable = incrementSequence(updatedTable);

    const updatedRoom = updateRoomTable(room, table.tableId, updatedTable);
    this.rooms.set(room.roomId, updatedRoom);

    this.syncEngine.storeSnapshot(
      table.tableId,
      updatedTable,
      null,
      updatedTable.sequence
    );

    const events: ServerEvent[] = [];
    const newTableContext: TableContext = {
      tableId: table.tableId,
      handId: table.handId,
      sequence: updatedTable.sequence,
    };

    events.push({
      type: 'player-sat-back',
      header: this.createHeader(),
      tableContext: newTableContext,
      playerId: session.playerId,
      seatIndex: session.seatIndex,
    });

    this.broadcastToRoom(room.roomId, events[0]);

    // Auto-start hand if enabled
    if (this.config.autoStartHand && canStartHand(updatedTable) && !isHandInProgress(updatedTable)) {
      const handEvents = this.startNewHand(room.roomId, table.tableId);
      events.push(...handEvents);
    }

    return { success: true, events };
  }

  private handlePlayerAction(
    session: Session,
    tableContext: TableContext,
    action: PlayerAction
  ): IntentResult {
    const room = this.rooms.get(session.currentRoomId!);
    if (!room) {
      throw Errors.notInRoom();
    }

    const table = getTableById(room, tableContext.tableId);
    if (!table) {
      throw Errors.invalidTableId(tableContext.tableId);
    }

    // Validate hand ID
    if (tableContext.handId !== table.handId) {
      throw Errors.invalidHandId(tableContext.handId ?? 'null');
    }

    // Validate it's player's turn
    if (!isPlayerTurn(table, session.playerId)) {
      const activeSeat = table.seats[table.activePlayerSeat];
      throw Errors.notYourTurn(activeSeat?.playerId ?? 'unknown');
    }

    // Validate hand is active
    if (!isHandInProgress(table)) {
      throw Errors.handNotActive();
    }

    // Validate sequence
    this.syncEngine.validateSequence(table.tableId, tableContext.sequence);

    // Validate and apply action
    const events = this.applyAction(room, table, session, action);

    return { success: true, events };
  }

  private handleRequestSync(
    session: Session,
    tableContext: TableContext,
    fromSequence?: number
  ): IntentResult {
    const room = this.rooms.get(session.currentRoomId!);
    if (!room) {
      throw Errors.notInRoom();
    }

    const syncResult = this.syncEngine.generateSyncResponse(
      room,
      tableContext.tableId,
      session.playerId,
      fromSequence
    );

    return { success: true, events: [syncResult.event] };
  }

  // ============================================================================
  // Game Logic
  // ============================================================================

  /**
   * Start a new hand
   */
  startNewHand(roomId: RoomId, tableId: TableId): ServerEvent[] {
    const room = this.rooms.get(roomId);
    if (!room) return [];

    const table = getTableById(room, tableId);
    if (!table || !canStartHand(table)) return [];

    const handId = `hand_${tableId}_${Date.now()}`;
    const handNumber = table.handNumber + 1;

    // Rotate dealer
    const seatedPlayers = getSeatedPlayers(table).filter(
      s => s.status !== 'sitting-out' && s.stack > 0
    );
    const dealerSeat = this.getNextDealer(table, seatedPlayers);
    const sbSeat = this.getSmallBlindSeat(table, dealerSeat, seatedPlayers);
    const bbSeat = this.getBigBlindSeat(table, sbSeat, seatedPlayers);

    // Deal hole cards (simplified - just mark as dealt)
    const holeCards = this.dealHoleCards();

    // Reset for new hand
    let updatedTable: Table = {
      ...table,
      handId,
      handNumber,
      street: 'preflop',
      communityCards: [],
      pot: 0,
      currentBet: room.config.bigBlind,
      minRaise: room.config.bigBlind,
      dealerSeat,
      activePlayerSeat: this.getFirstToAct(table, bbSeat, seatedPlayers),
      lastRaiserSeat: bbSeat,
      actionsThisRound: 0,
    };

    // Update seats
    let cardIndex = 0;
    updatedTable = {
      ...updatedTable,
      seats: updatedTable.seats.map((seat, i) => {
        if (seat.status === 'sitting-out' || seat.playerId === null || seat.stack === 0) {
          return { ...seat, currentBet: 0, totalBetThisHand: 0, holeCards: [], isDealer: false };
        }

        let newSeat: Seat = {
          ...seat,
          status: 'active',
          currentBet: 0,
          totalBetThisHand: 0,
          holeCards: holeCards[cardIndex++] || [],
          isDealer: i === dealerSeat,
        };

        // Post blinds
        if (i === sbSeat) {
          const sbAmount = Math.min(room.config.smallBlind, seat.stack);
          newSeat = {
            ...newSeat,
            stack: seat.stack - sbAmount,
            currentBet: sbAmount,
            totalBetThisHand: sbAmount,
          };
          updatedTable = { ...updatedTable, pot: updatedTable.pot + sbAmount };
        } else if (i === bbSeat) {
          const bbAmount = Math.min(room.config.bigBlind, seat.stack);
          newSeat = {
            ...newSeat,
            stack: seat.stack - bbAmount,
            currentBet: bbAmount,
            totalBetThisHand: bbAmount,
          };
          updatedTable = { ...updatedTable, pot: updatedTable.pot + bbAmount };
        }

        return newSeat;
      }),
    };

    updatedTable = incrementSequence(updatedTable);

    const updatedRoom = updateRoomTable(room, tableId, updatedTable);
    this.rooms.set(roomId, updatedRoom);

    this.syncEngine.storeSnapshot(tableId, updatedTable, null, updatedTable.sequence);

    const events: ServerEvent[] = [];
    const tableContext: TableContext = {
      tableId,
      handId,
      sequence: updatedTable.sequence,
    };

    const activePlayers = getSeatedPlayers(updatedTable)
      .filter(s => s.status === 'active' || s.status === 'all-in')
      .map(s => ({
        playerId: s.playerId!,
        seatIndex: s.seatIndex,
        stack: s.stack,
      }));

    events.push({
      type: 'hand-started',
      header: this.createHeader(),
      tableContext,
      handNumber,
      dealerSeat,
      smallBlindSeat: sbSeat,
      bigBlindSeat: bbSeat,
      players: activePlayers,
    });

    this.broadcastToRoom(roomId, events[0]);

    return events;
  }

  /**
   * Apply a player action
   */
  private applyAction(
    room: Room,
    table: Table,
    session: Session,
    action: PlayerAction
  ): ServerEvent[] {
    const seat = getSeatByPlayerId(table, session.playerId)!;
    const seatIndex = seat.seatIndex;

    // Validate action
    this.validateAction(table, seat, action);

    let updatedTable = table;
    let newStack = seat.stack;
    let betAmount = 0;

    switch (action.type) {
      case 'fold':
        updatedTable = updateTableSeat(updatedTable, seatIndex, {
          status: 'folded',
        });
        break;

      case 'check':
        // No state change
        break;

      case 'call': {
        const callAmount = Math.min(table.currentBet - seat.currentBet, seat.stack);
        newStack = seat.stack - callAmount;
        betAmount = callAmount;
        updatedTable = updateTableSeat(updatedTable, seatIndex, {
          stack: newStack,
          currentBet: seat.currentBet + callAmount,
          totalBetThisHand: seat.totalBetThisHand + callAmount,
          status: newStack === 0 ? 'all-in' : 'active',
        });
        updatedTable = updateTable(updatedTable, {
          pot: updatedTable.pot + callAmount,
        });
        break;
      }

      case 'bet': {
        const betSize = action.amount!;
        newStack = seat.stack - betSize;
        betAmount = betSize;
        updatedTable = updateTableSeat(updatedTable, seatIndex, {
          stack: newStack,
          currentBet: betSize,
          totalBetThisHand: seat.totalBetThisHand + betSize,
          status: newStack === 0 ? 'all-in' : 'active',
        });
        updatedTable = updateTable(updatedTable, {
          pot: updatedTable.pot + betSize,
          currentBet: betSize,
          minRaise: betSize,
          lastRaiserSeat: seatIndex,
        });
        break;
      }

      case 'raise': {
        const raiseToAmount = action.amount!;
        const raiseAmount = raiseToAmount - seat.currentBet;
        newStack = seat.stack - raiseAmount;
        betAmount = raiseAmount;
        const raiseSize = raiseToAmount - table.currentBet;
        updatedTable = updateTableSeat(updatedTable, seatIndex, {
          stack: newStack,
          currentBet: raiseToAmount,
          totalBetThisHand: seat.totalBetThisHand + raiseAmount,
          status: newStack === 0 ? 'all-in' : 'active',
        });
        updatedTable = updateTable(updatedTable, {
          pot: updatedTable.pot + raiseAmount,
          currentBet: raiseToAmount,
          minRaise: raiseSize,
          lastRaiserSeat: seatIndex,
        });
        break;
      }

      case 'all-in': {
        const allInAmount = seat.stack;
        const newBet = seat.currentBet + allInAmount;
        newStack = 0;
        betAmount = allInAmount;
        updatedTable = updateTableSeat(updatedTable, seatIndex, {
          stack: 0,
          currentBet: newBet,
          totalBetThisHand: seat.totalBetThisHand + allInAmount,
          status: 'all-in',
        });
        updatedTable = updateTable(updatedTable, {
          pot: updatedTable.pot + allInAmount,
        });
        if (newBet > table.currentBet) {
          const raiseSize = newBet - table.currentBet;
          updatedTable = updateTable(updatedTable, {
            currentBet: newBet,
            minRaise: Math.max(table.minRaise, raiseSize),
            lastRaiserSeat: seatIndex,
          });
        }
        break;
      }
    }

    // Increment action count
    updatedTable = updateTable(updatedTable, {
      actionsThisRound: updatedTable.actionsThisRound + 1,
    });

    // Move to next player
    const nextSeat = getNextActiveSeat(updatedTable, seatIndex);
    updatedTable = updateTable(updatedTable, { activePlayerSeat: nextSeat });

    updatedTable = incrementSequence(updatedTable);

    const updatedRoom = updateRoomTable(room, table.tableId, updatedTable);
    this.rooms.set(room.roomId, updatedRoom);

    this.syncEngine.storeSnapshot(table.tableId, updatedTable, null, updatedTable.sequence);

    const events: ServerEvent[] = [];
    const tableContext: TableContext = {
      tableId: table.tableId,
      handId: table.handId,
      sequence: updatedTable.sequence,
    };

    events.push({
      type: 'action-performed',
      header: this.createHeader(),
      tableContext,
      playerId: session.playerId,
      seatIndex,
      action,
      newStack,
      potTotal: updatedTable.pot,
    });

    this.broadcastToRoom(room.roomId, events[0]);

    // Check if betting round is complete
    const moreEvents = this.checkBettingRoundComplete(room.roomId, updatedTable);
    events.push(...moreEvents);

    return events;
  }

  /**
   * Validate an action is legal
   */
  private validateAction(table: Table, seat: Seat, action: PlayerAction): void {
    const callAmount = table.currentBet - seat.currentBet;

    switch (action.type) {
      case 'fold':
        // Always valid
        break;

      case 'check':
        if (callAmount > 0) {
          throw Errors.illegalAction('check', 'Must call, raise, or fold');
        }
        break;

      case 'call':
        if (callAmount === 0) {
          throw Errors.illegalAction('call', 'Nothing to call');
        }
        break;

      case 'bet':
        if (table.currentBet > 0) {
          throw Errors.illegalAction('bet', 'Must raise instead');
        }
        if (!action.amount || action.amount < table.minRaise) {
          throw Errors.betTooSmall(table.minRaise, action.amount ?? 0);
        }
        if (action.amount > seat.stack) {
          throw Errors.insufficientChips(action.amount, seat.stack);
        }
        break;

      case 'raise':
        if (table.currentBet === 0) {
          throw Errors.illegalAction('raise', 'Must bet instead');
        }
        const minRaiseTotal = table.currentBet + table.minRaise;
        if (!action.amount || action.amount < minRaiseTotal) {
          throw Errors.betTooSmall(minRaiseTotal, action.amount ?? 0);
        }
        const raiseAmount = action.amount - seat.currentBet;
        if (raiseAmount > seat.stack) {
          throw Errors.insufficientChips(raiseAmount, seat.stack);
        }
        break;

      case 'all-in':
        if (seat.stack === 0) {
          throw Errors.insufficientChips(1, 0);
        }
        break;
    }
  }

  /**
   * Check if betting round is complete and advance street if needed
   */
  private checkBettingRoundComplete(roomId: RoomId, table: Table): ServerEvent[] {
    const events: ServerEvent[] = [];
    const activePlayers = getActivePlayers(table);
    const actingPlayers = getActingPlayers(table);

    // Check for all folded
    if (activePlayers.length === 1) {
      const winnerEvents = this.endHand(roomId, table, 'all-folded');
      events.push(...winnerEvents);
      return events;
    }

    // Check if betting is complete
    const allMatched = actingPlayers.every(
      s => s.currentBet === table.currentBet || s.stack === 0
    );

    if (actingPlayers.length <= 1 || (allMatched && table.actionsThisRound >= actingPlayers.length)) {
      // Advance to next street
      const streetEvents = this.advanceStreet(roomId, table);
      events.push(...streetEvents);
    }

    return events;
  }

  /**
   * Advance to the next street
   */
  private advanceStreet(roomId: RoomId, table: Table): ServerEvent[] {
    const events: ServerEvent[] = [];
    const room = this.rooms.get(roomId)!;
    const currentTable = getTableById(room, table.tableId)!;

    const streetOrder: Street[] = ['preflop', 'flop', 'turn', 'river', 'showdown'];
    const currentIndex = streetOrder.indexOf(currentTable.street as Street);
    const nextStreet = streetOrder[currentIndex + 1];

    if (!nextStreet || nextStreet === 'showdown') {
      // Go to showdown
      const showdownEvents = this.endHand(roomId, currentTable, 'showdown');
      events.push(...showdownEvents);
      return events;
    }

    // Deal community cards
    let newCommunityCards = [...currentTable.communityCards];
    if (nextStreet === 'flop') {
      newCommunityCards = this.dealCommunityCards(3);
    } else if (nextStreet === 'turn' || nextStreet === 'river') {
      newCommunityCards = [...newCommunityCards, ...this.dealCommunityCards(1)];
    }

    // Reset for new street
    let updatedTable: Table = {
      ...currentTable,
      street: nextStreet,
      communityCards: newCommunityCards,
      currentBet: 0,
      actionsThisRound: 0,
      lastRaiserSeat: -1,
      seats: currentTable.seats.map(s => ({
        ...s,
        currentBet: 0,
      })),
    };

    // First to act is left of dealer
    const firstToAct = getNextActiveSeat(updatedTable, currentTable.dealerSeat);
    updatedTable = updateTable(updatedTable, { activePlayerSeat: firstToAct });
    updatedTable = incrementSequence(updatedTable);

    const updatedRoom = updateRoomTable(room, table.tableId, updatedTable);
    this.rooms.set(roomId, updatedRoom);

    this.syncEngine.storeSnapshot(table.tableId, updatedTable, null, updatedTable.sequence);

    const tableContext: TableContext = {
      tableId: table.tableId,
      handId: table.handId,
      sequence: updatedTable.sequence,
    };

    const cardsToSend = nextStreet === 'flop'
      ? newCommunityCards
      : newCommunityCards.slice(-1);

    events.push({
      type: 'street-changed',
      header: this.createHeader(),
      tableContext,
      street: nextStreet as 'preflop' | 'flop' | 'turn' | 'river' | 'showdown',
      communityCards: cardsToSend.map(c => `${c.rank}${c.suit[0]}`),
    });

    this.broadcastToRoom(roomId, events[0]);

    // Check if all players are all-in (run it out)
    if (getActingPlayers(updatedTable).length <= 1) {
      const moreEvents = this.advanceStreet(roomId, updatedTable);
      events.push(...moreEvents);
    }

    return events;
  }

  /**
   * End the hand and determine winner
   */
  private endHand(
    roomId: RoomId,
    table: Table,
    reason: 'showdown' | 'all-folded' | 'all-in-runout'
  ): ServerEvent[] {
    const events: ServerEvent[] = [];
    const room = this.rooms.get(roomId)!;
    const activePlayers = getActivePlayers(table);

    let winners: { playerId: PlayerId; amount: number; handDescription?: string }[] = [];

    if (reason === 'all-folded') {
      const winner = activePlayers[0];
      winners = [{
        playerId: winner.playerId!,
        amount: table.pot,
      }];
    } else {
      // Simplified showdown - for now just split between active players
      const share = Math.floor(table.pot / activePlayers.length);
      winners = activePlayers.map(p => ({
        playerId: p.playerId!,
        amount: share,
        handDescription: 'Best Hand',
      }));
    }

    // Award pot
    let updatedTable = table;
    for (const winner of winners) {
      const seat = getSeatByPlayerId(updatedTable, winner.playerId);
      if (seat) {
        updatedTable = updateTableSeat(updatedTable, seat.seatIndex, {
          stack: seat.stack + winner.amount,
        });
      }
    }

    // Reset hand state
    updatedTable = updateTable(updatedTable, {
      handId: null,
      street: 'complete',
      pot: 0,
      currentBet: 0,
      activePlayerSeat: -1,
    });

    updatedTable = incrementSequence(updatedTable);

    const updatedRoom = updateRoomTable(room, table.tableId, updatedTable);
    this.rooms.set(roomId, updatedRoom);

    this.syncEngine.storeSnapshot(table.tableId, updatedTable, null, updatedTable.sequence);

    const tableContext: TableContext = {
      tableId: table.tableId,
      handId: table.handId,
      sequence: updatedTable.sequence,
    };

    events.push({
      type: 'hand-ended',
      header: this.createHeader(),
      tableContext,
      winners,
      endReason: reason,
    });

    this.broadcastToRoom(roomId, events[0]);

    // Auto-start next hand
    if (this.config.autoStartHand) {
      setTimeout(() => {
        const currentRoom = this.rooms.get(roomId);
        if (currentRoom) {
          const currentTable = getTableById(currentRoom, table.tableId);
          if (currentTable && canStartHand(currentTable) && !isHandInProgress(currentTable)) {
            this.startNewHand(roomId, table.tableId);
          }
        }
      }, 2000);
    }

    return events;
  }

  // ============================================================================
  // Disconnect Handling
  // ============================================================================

  /**
   * Handle player disconnect
   */
  handleDisconnect(playerId: PlayerId, seatIndex: number | null, tableId: TableId | null): ServerEvent[] {
    const events: ServerEvent[] = [];

    if (tableId && seatIndex !== null) {
      // Find room containing this table
      for (const room of this.rooms.values()) {
        const table = getTableById(room, tableId);
        if (table) {
          // Mark seat as disconnected
          let updatedTable = updateTableSeat(table, seatIndex, {
            status: 'disconnected',
            disconnectedAt: Date.now(),
          });

          // If it's their turn, start timeout
          if (table.activePlayerSeat === seatIndex && isHandInProgress(table)) {
            // Auto-fold or check will be handled by timeout
          }

          updatedTable = incrementSequence(updatedTable);
          const updatedRoom = updateRoomTable(room, tableId, updatedTable);
          this.rooms.set(room.roomId, updatedRoom);

          events.push({
            type: 'player-disconnected',
            header: this.createHeader(),
            playerId,
            seatIndex,
            graceSecondsRemaining: room.config.disconnectGraceSeconds,
          });

          this.broadcastToRoom(room.roomId, events[0]);
          break;
        }
      }
    }

    return events;
  }

  /**
   * Handle player reconnect
   */
  handleReconnect(playerId: PlayerId, tableId: TableId | null, seatIndex: number | null): ServerEvent[] {
    const events: ServerEvent[] = [];

    if (tableId && seatIndex !== null) {
      for (const room of this.rooms.values()) {
        const table = getTableById(room, tableId);
        if (table) {
          const seat = table.seats[seatIndex];
          if (seat && seat.playerId === playerId && seat.status === 'disconnected') {
            // Restore seat status
            const previousStatus = isHandInProgress(table) ? 'active' : 'active';
            let updatedTable = updateTableSeat(table, seatIndex, {
              status: previousStatus,
              disconnectedAt: null,
            });

            updatedTable = incrementSequence(updatedTable);
            const updatedRoom = updateRoomTable(room, tableId, updatedTable);
            this.rooms.set(room.roomId, updatedRoom);

            events.push({
              type: 'player-reconnected',
              header: this.createHeader(),
              playerId,
              seatIndex,
            });

            this.broadcastToRoom(room.roomId, events[0]);
          }
          break;
        }
      }
    }

    return events;
  }

  /**
   * Handle action timeout
   */
  handleActionTimeout(tableId: TableId, playerId: PlayerId): ServerEvent[] {
    for (const room of this.rooms.values()) {
      const table = getTableById(room, tableId);
      if (table && isHandInProgress(table)) {
        const seat = getSeatByPlayerId(table, playerId);
        if (seat && seat.seatIndex === table.activePlayerSeat) {
          // Determine auto action
          const canCheck = table.currentBet === seat.currentBet;
          const autoAction: PlayerAction = this.config.autoCheckOnTimeout && canCheck
            ? { type: 'check' }
            : { type: 'fold' };

          // Get session
          const session = this.sessionManager.getSessionByPlayer(playerId);
          if (session) {
            return this.applyAction(room, table, session, autoAction);
          }
        }
      }
    }
    return [];
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private createHeader(): MessageHeader {
    return createMessageHeader(++this.globalSequence);
  }

  private createRejectEvent(intentMessageId: string, error: NetworkError): RejectEvent {
    return {
      type: 'reject',
      header: this.createHeader(),
      intentMessageId,
      code: error.code,
      reason: error.message,
      details: error.details,
    };
  }

  private broadcastToRoom(roomId: RoomId, event: ServerEvent, exclude: PlayerId[] = []): void {
    if (!this.onEvent) return;

    const room = this.rooms.get(roomId);
    if (!room) return;

    const targets = Array.from(room.players.keys()).filter(id => !exclude.includes(id));
    this.onEvent(event, targets);
  }

  private getNextDealer(table: Table, players: readonly Seat[]): number {
    if (players.length === 0) return 0;
    const currentDealer = table.dealerSeat;
    for (let i = 1; i <= table.maxSeats; i++) {
      const nextSeat = (currentDealer + i) % table.maxSeats;
      if (players.some(p => p.seatIndex === nextSeat)) {
        return nextSeat;
      }
    }
    return players[0].seatIndex;
  }

  private getSmallBlindSeat(table: Table, dealerSeat: number, players: readonly Seat[]): number {
    if (players.length === 2) {
      return dealerSeat;
    }
    for (let i = 1; i <= table.maxSeats; i++) {
      const nextSeat = (dealerSeat + i) % table.maxSeats;
      if (players.some(p => p.seatIndex === nextSeat)) {
        return nextSeat;
      }
    }
    return players[0].seatIndex;
  }

  private getBigBlindSeat(table: Table, sbSeat: number, players: readonly Seat[]): number {
    for (let i = 1; i <= table.maxSeats; i++) {
      const nextSeat = (sbSeat + i) % table.maxSeats;
      if (players.some(p => p.seatIndex === nextSeat)) {
        return nextSeat;
      }
    }
    return players[0].seatIndex;
  }

  private getFirstToAct(table: Table, bbSeat: number, players: readonly Seat[]): number {
    for (let i = 1; i <= table.maxSeats; i++) {
      const nextSeat = (bbSeat + i) % table.maxSeats;
      if (players.some(p => p.seatIndex === nextSeat)) {
        return nextSeat;
      }
    }
    return players[0].seatIndex;
  }

  private dealHoleCards(): Card[][] {
    // Simplified - generate random cards
    const cards: Card[][] = [];
    const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
    for (let i = 0; i < 10; i++) {
      cards.push([
        { rank: Math.floor(Math.random() * 13) + 2, suit: suits[Math.floor(Math.random() * 4)] },
        { rank: Math.floor(Math.random() * 13) + 2, suit: suits[Math.floor(Math.random() * 4)] },
      ]);
    }
    return cards;
  }

  private dealCommunityCards(count: number): Card[] {
    const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
    const cards: Card[] = [];
    for (let i = 0; i < count; i++) {
      cards.push({
        rank: Math.floor(Math.random() * 13) + 2,
        suit: suits[Math.floor(Math.random() * 4)],
      });
    }
    return cards;
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createRoomAuthority(
  sessionManager: SessionManager,
  syncEngine: SyncEngine,
  config?: Partial<AuthorityConfig>
): RoomAuthority {
  return new RoomAuthority(sessionManager, syncEngine, config);
}
