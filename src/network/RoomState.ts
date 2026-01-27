/**
 * RoomState.ts
 * Phase 12 - Club/Room/Table/Seat state management
 *
 * Immutable state structures for the authoritative server.
 */

import {
  ClubId,
  RoomId,
  TableId,
  PlayerId,
  HandId,
  RoomConfig,
  RoomSnapshot,
  TableSnapshot,
  SeatSnapshot,
  Card,
} from './Protocol';

// ============================================================================
// Seat State
// ============================================================================

export type SeatStatus = 'empty' | 'active' | 'folded' | 'all-in' | 'sitting-out' | 'disconnected';

export interface Seat {
  readonly seatIndex: number;
  readonly playerId: PlayerId | null;
  readonly playerName: string | null;
  readonly stack: number;
  readonly status: SeatStatus;
  readonly currentBet: number;
  readonly totalBetThisHand: number;
  readonly holeCards: readonly Card[];
  readonly isDealer: boolean;
  readonly timebank: number;
  readonly disconnectedAt: number | null;
}

export function createEmptySeat(seatIndex: number, timebank: number = 30): Seat {
  return {
    seatIndex,
    playerId: null,
    playerName: null,
    stack: 0,
    status: 'empty',
    currentBet: 0,
    totalBetThisHand: 0,
    holeCards: [],
    isDealer: false,
    timebank,
    disconnectedAt: null,
  };
}

export function seatPlayer(
  seat: Seat,
  playerId: PlayerId,
  playerName: string,
  buyIn: number
): Seat {
  return {
    ...seat,
    playerId,
    playerName,
    stack: buyIn,
    status: 'active',
  };
}

export function updateSeat(seat: Seat, updates: Partial<Seat>): Seat {
  return { ...seat, ...updates };
}

export function vacateSeat(seat: Seat): Seat {
  return createEmptySeat(seat.seatIndex, seat.timebank);
}

// ============================================================================
// Table State
// ============================================================================

export type Street = 'waiting' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'complete';

export interface Table {
  readonly tableId: TableId;
  readonly roomId: RoomId;
  readonly seats: readonly Seat[];
  readonly maxSeats: number;

  // Hand state
  readonly handId: HandId | null;
  readonly handNumber: number;
  readonly street: Street;
  readonly communityCards: readonly Card[];
  readonly pot: number;
  readonly currentBet: number;
  readonly minRaise: number;
  readonly dealerSeat: number;
  readonly activePlayerSeat: number;
  readonly lastRaiserSeat: number;
  readonly actionsThisRound: number;

  // Sequence for sync
  readonly sequence: number;
}

export function createTable(
  tableId: TableId,
  roomId: RoomId,
  maxSeats: number,
  defaultTimebank: number = 30
): Table {
  const seats: Seat[] = [];
  for (let i = 0; i < maxSeats; i++) {
    seats.push(createEmptySeat(i, defaultTimebank));
  }

  return {
    tableId,
    roomId,
    seats,
    maxSeats,
    handId: null,
    handNumber: 0,
    street: 'waiting',
    communityCards: [],
    pot: 0,
    currentBet: 0,
    minRaise: 0,
    dealerSeat: 0,
    activePlayerSeat: -1,
    lastRaiserSeat: -1,
    actionsThisRound: 0,
    sequence: 0,
  };
}

export function updateTable(table: Table, updates: Partial<Table>): Table {
  return { ...table, ...updates };
}

export function updateTableSeat(table: Table, seatIndex: number, updates: Partial<Seat>): Table {
  const newSeats = table.seats.map((seat, i) =>
    i === seatIndex ? { ...seat, ...updates } : seat
  );
  return { ...table, seats: newSeats };
}

export function incrementSequence(table: Table): Table {
  return { ...table, sequence: table.sequence + 1 };
}

export function getSeatedPlayers(table: Table): readonly Seat[] {
  return table.seats.filter(s => s.playerId !== null && s.status !== 'empty');
}

export function getActivePlayers(table: Table): readonly Seat[] {
  return table.seats.filter(
    s => s.status === 'active' || s.status === 'all-in'
  );
}

export function getActingPlayers(table: Table): readonly Seat[] {
  return table.seats.filter(s => s.status === 'active');
}

export function getSeatByPlayerId(table: Table, playerId: PlayerId): Seat | null {
  return table.seats.find(s => s.playerId === playerId) ?? null;
}

export function getNextActiveSeat(table: Table, fromSeat: number): number {
  const numSeats = table.maxSeats;
  for (let i = 1; i <= numSeats; i++) {
    const seatIndex = (fromSeat + i) % numSeats;
    const seat = table.seats[seatIndex];
    if (seat.status === 'active') {
      return seatIndex;
    }
  }
  return -1;
}

export function canStartHand(table: Table): boolean {
  const activePlayers = getSeatedPlayers(table).filter(
    s => s.status !== 'sitting-out' && s.stack > 0
  );
  return activePlayers.length >= 2;
}

// ============================================================================
// Room State
// ============================================================================

export interface PlayerInRoom {
  readonly playerId: PlayerId;
  readonly playerName: string;
  readonly isSpectator: boolean;
  readonly seatIndex: number | null;
  readonly tableId: TableId | null;
  readonly joinedAt: number;
}

export interface Room {
  readonly roomId: RoomId;
  readonly clubId: ClubId;
  readonly name: string;
  readonly config: RoomConfig;
  readonly tables: readonly Table[];
  readonly players: ReadonlyMap<PlayerId, PlayerInRoom>;
  readonly spectators: ReadonlySet<PlayerId>;
  readonly isOpen: boolean;
  readonly createdAt: number;
}

export function createRoom(
  roomId: RoomId,
  clubId: ClubId,
  name: string,
  config: RoomConfig
): Room {
  const table = createTable(`${roomId}_table_1`, roomId, config.maxSeats);

  return {
    roomId,
    clubId,
    name,
    config,
    tables: [table],
    players: new Map(),
    spectators: new Set(),
    isOpen: true,
    createdAt: Date.now(),
  };
}

export function addPlayerToRoom(
  room: Room,
  playerId: PlayerId,
  playerName: string,
  isSpectator: boolean
): Room {
  const playerInfo: PlayerInRoom = {
    playerId,
    playerName,
    isSpectator,
    seatIndex: null,
    tableId: null,
    joinedAt: Date.now(),
  };

  const newPlayers = new Map(room.players);
  newPlayers.set(playerId, playerInfo);

  const newSpectators = new Set(room.spectators);
  if (isSpectator) {
    newSpectators.add(playerId);
  }

  return {
    ...room,
    players: newPlayers,
    spectators: newSpectators,
  };
}

export function removePlayerFromRoom(room: Room, playerId: PlayerId): Room {
  const newPlayers = new Map(room.players);
  newPlayers.delete(playerId);

  const newSpectators = new Set(room.spectators);
  newSpectators.delete(playerId);

  return {
    ...room,
    players: newPlayers,
    spectators: newSpectators,
  };
}

export function updatePlayerInRoom(
  room: Room,
  playerId: PlayerId,
  updates: Partial<PlayerInRoom>
): Room {
  const player = room.players.get(playerId);
  if (!player) return room;

  const newPlayers = new Map(room.players);
  newPlayers.set(playerId, { ...player, ...updates });

  return { ...room, players: newPlayers };
}

export function updateRoomTable(room: Room, tableId: TableId, updates: Partial<Table>): Room {
  const newTables = room.tables.map(t =>
    t.tableId === tableId ? { ...t, ...updates } : t
  );
  return { ...room, tables: newTables };
}

export function getTableById(room: Room, tableId: TableId): Table | null {
  return room.tables.find(t => t.tableId === tableId) ?? null;
}

// ============================================================================
// Club State
// ============================================================================

export interface Club {
  readonly clubId: ClubId;
  readonly name: string;
  readonly ownerId: PlayerId;
  readonly rooms: ReadonlyMap<RoomId, Room>;
  readonly members: ReadonlySet<PlayerId>;
  readonly bannedPlayers: ReadonlySet<PlayerId>;
  readonly createdAt: number;
}

export function createClub(
  clubId: ClubId,
  name: string,
  ownerId: PlayerId
): Club {
  const members = new Set<PlayerId>();
  members.add(ownerId);

  return {
    clubId,
    name,
    ownerId,
    rooms: new Map(),
    members,
    bannedPlayers: new Set(),
    createdAt: Date.now(),
  };
}

export function addRoomToClub(club: Club, room: Room): Club {
  const newRooms = new Map(club.rooms);
  newRooms.set(room.roomId, room);
  return { ...club, rooms: newRooms };
}

export function updateClubRoom(club: Club, roomId: RoomId, room: Room): Club {
  const newRooms = new Map(club.rooms);
  newRooms.set(roomId, room);
  return { ...club, rooms: newRooms };
}

export function getRoomById(club: Club, roomId: RoomId): Room | null {
  return club.rooms.get(roomId) ?? null;
}

// ============================================================================
// Snapshot Generation
// ============================================================================

export function generateSeatSnapshot(
  seat: Seat,
  viewerId: PlayerId | null,
  isShowdown: boolean
): SeatSnapshot {
  // Only reveal hole cards to seat owner or during showdown
  const canSeeCards = seat.playerId === viewerId || isShowdown;

  return {
    seatIndex: seat.seatIndex,
    playerId: seat.playerId,
    playerName: seat.playerName,
    stack: seat.stack,
    status: seat.status,
    currentBet: seat.currentBet,
    holeCards: canSeeCards && seat.holeCards.length > 0 ? seat.holeCards : null,
    isDealer: seat.isDealer,
    isTurn: false, // Set by table snapshot
    timebank: seat.timebank,
  };
}

export function generateTableSnapshot(
  table: Table,
  viewerId: PlayerId | null
): TableSnapshot {
  const isShowdown = table.street === 'showdown' || table.street === 'complete';

  const seats = table.seats.map(seat => {
    const snapshot = generateSeatSnapshot(seat, viewerId, isShowdown);
    return {
      ...snapshot,
      isTurn: seat.seatIndex === table.activePlayerSeat,
    };
  });

  return {
    tableId: table.tableId,
    handId: table.handId,
    sequence: table.sequence,
    handNumber: table.handNumber,
    street: table.street,
    communityCards: table.communityCards,
    pot: table.pot,
    currentBet: table.currentBet,
    minRaise: table.minRaise,
    dealerSeat: table.dealerSeat,
    activePlayerSeat: table.activePlayerSeat,
    seats,
    spectatorCount: 0, // Set by room snapshot
  };
}

export function generateRoomSnapshot(
  room: Room,
  viewerId: PlayerId
): RoomSnapshot {
  const tables = room.tables.map(table => {
    const snapshot = generateTableSnapshot(table, viewerId);
    return {
      ...snapshot,
      spectatorCount: room.spectators.size,
    };
  });

  return {
    roomId: room.roomId,
    clubId: room.clubId,
    name: room.name,
    config: room.config,
    tables,
    spectators: Array.from(room.spectators),
  };
}

// ============================================================================
// State Validation
// ============================================================================

export function isValidSeatIndex(table: Table, seatIndex: number): boolean {
  return seatIndex >= 0 && seatIndex < table.maxSeats;
}

export function isSeatEmpty(table: Table, seatIndex: number): boolean {
  const seat = table.seats[seatIndex];
  return seat?.status === 'empty' && seat?.playerId === null;
}

export function isPlayerSeated(table: Table, playerId: PlayerId): boolean {
  return table.seats.some(s => s.playerId === playerId);
}

export function isHandInProgress(table: Table): boolean {
  return table.handId !== null && table.street !== 'waiting' && table.street !== 'complete';
}

export function isPlayerTurn(table: Table, playerId: PlayerId): boolean {
  const seat = getSeatByPlayerId(table, playerId);
  return seat !== null && seat.seatIndex === table.activePlayerSeat;
}
