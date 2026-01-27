/**
 * NetworkErrors.ts
 * Phase 12 - Explicit rejection reasons for multiplayer networking
 *
 * All network-related errors with deterministic rejection codes.
 */

// ============================================================================
// Error Codes
// ============================================================================

export enum RejectCode {
  // Connection errors (1xx)
  NOT_CONNECTED = 100,
  SESSION_EXPIRED = 101,
  INVALID_SESSION = 102,
  CONNECTION_TIMEOUT = 103,
  HEARTBEAT_MISSED = 104,

  // Authentication errors (2xx)
  NOT_AUTHENTICATED = 200,
  INVALID_CREDENTIALS = 201,
  BANNED_FROM_CLUB = 202,
  BANNED_FROM_ROOM = 203,

  // Room errors (3xx)
  ROOM_NOT_FOUND = 300,
  ROOM_FULL = 301,
  ROOM_CLOSED = 302,
  ALREADY_IN_ROOM = 303,
  NOT_IN_ROOM = 304,
  INSUFFICIENT_BUYIN = 305,
  EXCEEDS_MAX_BUYIN = 306,

  // Seat errors (4xx)
  SEAT_NOT_FOUND = 400,
  SEAT_TAKEN = 401,
  SEAT_RESERVED = 402,
  NOT_SEATED = 403,
  ALREADY_SEATED = 404,
  CANNOT_CHANGE_SEAT = 405,

  // Action errors (5xx)
  NOT_YOUR_TURN = 500,
  INVALID_ACTION = 501,
  ILLEGAL_ACTION = 502,
  INSUFFICIENT_CHIPS = 503,
  BET_TOO_SMALL = 504,
  BET_TOO_LARGE = 505,
  ACTION_TIMEOUT = 506,
  HAND_NOT_ACTIVE = 507,

  // Sync errors (6xx)
  SEQUENCE_MISMATCH = 600,
  STALE_INTENT = 601,
  DESYNC_DETECTED = 602,
  SNAPSHOT_NOT_FOUND = 603,
  INVALID_HAND_ID = 604,
  INVALID_TABLE_ID = 605,

  // General errors (9xx)
  UNKNOWN_ERROR = 900,
  SERVER_ERROR = 901,
  MAINTENANCE_MODE = 902,
  RATE_LIMITED = 903,
}

// ============================================================================
// Error Classes
// ============================================================================

/**
 * Base network error
 */
export class NetworkError extends Error {
  readonly code: RejectCode;
  readonly details?: Record<string, unknown>;

  constructor(code: RejectCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'NetworkError';
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, NetworkError.prototype);
  }
}

/**
 * Connection-related errors
 */
export class ConnectionError extends NetworkError {
  constructor(code: RejectCode, message: string, details?: Record<string, unknown>) {
    super(code, message, details);
    this.name = 'ConnectionError';
    Object.setPrototypeOf(this, ConnectionError.prototype);
  }
}

/**
 * Room-related errors
 */
export class RoomError extends NetworkError {
  constructor(code: RejectCode, message: string, details?: Record<string, unknown>) {
    super(code, message, details);
    this.name = 'RoomError';
    Object.setPrototypeOf(this, RoomError.prototype);
  }
}

/**
 * Seat-related errors
 */
export class SeatError extends NetworkError {
  constructor(code: RejectCode, message: string, details?: Record<string, unknown>) {
    super(code, message, details);
    this.name = 'SeatError';
    Object.setPrototypeOf(this, SeatError.prototype);
  }
}

/**
 * Action-related errors
 */
export class ActionError extends NetworkError {
  constructor(code: RejectCode, message: string, details?: Record<string, unknown>) {
    super(code, message, details);
    this.name = 'ActionError';
    Object.setPrototypeOf(this, ActionError.prototype);
  }
}

/**
 * Sync-related errors
 */
export class SyncError extends NetworkError {
  constructor(code: RejectCode, message: string, details?: Record<string, unknown>) {
    super(code, message, details);
    this.name = 'SyncError';
    Object.setPrototypeOf(this, SyncError.prototype);
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

export const Errors = {
  // Connection
  notConnected: () =>
    new ConnectionError(RejectCode.NOT_CONNECTED, 'Not connected to server'),
  sessionExpired: () =>
    new ConnectionError(RejectCode.SESSION_EXPIRED, 'Session has expired'),
  invalidSession: (sessionId: string) =>
    new ConnectionError(RejectCode.INVALID_SESSION, `Invalid session: ${sessionId}`),
  connectionTimeout: () =>
    new ConnectionError(RejectCode.CONNECTION_TIMEOUT, 'Connection timed out'),
  heartbeatMissed: (missedCount: number) =>
    new ConnectionError(RejectCode.HEARTBEAT_MISSED, `Missed ${missedCount} heartbeats`),

  // Room
  roomNotFound: (roomId: string) =>
    new RoomError(RejectCode.ROOM_NOT_FOUND, `Room not found: ${roomId}`),
  roomFull: (roomId: string) =>
    new RoomError(RejectCode.ROOM_FULL, `Room is full: ${roomId}`),
  roomClosed: (roomId: string) =>
    new RoomError(RejectCode.ROOM_CLOSED, `Room is closed: ${roomId}`),
  alreadyInRoom: (roomId: string) =>
    new RoomError(RejectCode.ALREADY_IN_ROOM, `Already in room: ${roomId}`),
  notInRoom: () =>
    new RoomError(RejectCode.NOT_IN_ROOM, 'Not in any room'),
  insufficientBuyin: (required: number, provided: number) =>
    new RoomError(RejectCode.INSUFFICIENT_BUYIN, `Insufficient buy-in: need ${required}, got ${provided}`),
  exceedsMaxBuyin: (max: number, provided: number) =>
    new RoomError(RejectCode.EXCEEDS_MAX_BUYIN, `Exceeds max buy-in: max ${max}, got ${provided}`),

  // Seat
  seatNotFound: (seatIndex: number) =>
    new SeatError(RejectCode.SEAT_NOT_FOUND, `Seat not found: ${seatIndex}`),
  seatTaken: (seatIndex: number, occupantId: string) =>
    new SeatError(RejectCode.SEAT_TAKEN, `Seat ${seatIndex} is taken`, { occupantId }),
  seatReserved: (seatIndex: number) =>
    new SeatError(RejectCode.SEAT_RESERVED, `Seat ${seatIndex} is reserved`),
  notSeated: () =>
    new SeatError(RejectCode.NOT_SEATED, 'Not seated at table'),
  alreadySeated: (seatIndex: number) =>
    new SeatError(RejectCode.ALREADY_SEATED, `Already seated at seat ${seatIndex}`),
  cannotChangeSeat: () =>
    new SeatError(RejectCode.CANNOT_CHANGE_SEAT, 'Cannot change seat during active hand'),

  // Action
  notYourTurn: (currentPlayerId: string) =>
    new ActionError(RejectCode.NOT_YOUR_TURN, 'Not your turn', { currentPlayerId }),
  invalidAction: (action: string) =>
    new ActionError(RejectCode.INVALID_ACTION, `Invalid action: ${action}`),
  illegalAction: (action: string, reason: string) =>
    new ActionError(RejectCode.ILLEGAL_ACTION, `Illegal action: ${action} - ${reason}`),
  insufficientChips: (required: number, available: number) =>
    new ActionError(RejectCode.INSUFFICIENT_CHIPS, `Insufficient chips: need ${required}, have ${available}`),
  betTooSmall: (min: number, provided: number) =>
    new ActionError(RejectCode.BET_TOO_SMALL, `Bet too small: min ${min}, got ${provided}`),
  betTooLarge: (max: number, provided: number) =>
    new ActionError(RejectCode.BET_TOO_LARGE, `Bet too large: max ${max}, got ${provided}`),
  actionTimeout: () =>
    new ActionError(RejectCode.ACTION_TIMEOUT, 'Action timed out'),
  handNotActive: () =>
    new ActionError(RejectCode.HAND_NOT_ACTIVE, 'No active hand'),

  // Sync
  sequenceMismatch: (expected: number, received: number) =>
    new SyncError(RejectCode.SEQUENCE_MISMATCH, `Sequence mismatch: expected ${expected}, got ${received}`),
  staleIntent: (intentSeq: number, currentSeq: number) =>
    new SyncError(RejectCode.STALE_INTENT, `Stale intent: seq ${intentSeq} < current ${currentSeq}`),
  desyncDetected: (details: string) =>
    new SyncError(RejectCode.DESYNC_DETECTED, `Desync detected: ${details}`),
  snapshotNotFound: (seq: number) =>
    new SyncError(RejectCode.SNAPSHOT_NOT_FOUND, `Snapshot not found for seq ${seq}`),
  invalidHandId: (handId: string) =>
    new SyncError(RejectCode.INVALID_HAND_ID, `Invalid hand ID: ${handId}`),
  invalidTableId: (tableId: string) =>
    new SyncError(RejectCode.INVALID_TABLE_ID, `Invalid table ID: ${tableId}`),
};

// ============================================================================
// Rejection Response Helper
// ============================================================================

export interface RejectionResponse {
  readonly code: RejectCode;
  readonly message: string;
  readonly details?: Record<string, unknown>;
}

export function toRejectionResponse(error: NetworkError): RejectionResponse {
  return {
    code: error.code,
    message: error.message,
    details: error.details,
  };
}
