/**
 * ServiceTypes.ts
 * Phase 17 - Type definitions for the GameService layer
 *
 * Provides clean, typed interfaces for external consumers
 * (UI, network, testing) to interact with the game engine.
 */

import { PlayerId } from '../../security/Identity';
import { TableId, HandId } from '../../security/AuditLog';
import { Street } from '../engine/TableState';
import { Card } from '../engine/Card';
import { GameEvent } from '../engine/GameEvents';
import { PlayerActionType } from '../engine/GameCommands';

// ============================================================================
// Service Configuration
// ============================================================================

export interface GameServiceConfig {
  readonly tableId: TableId;
  readonly smallBlind: number;
  readonly bigBlind: number;
  readonly minPlayers: number;
  readonly maxPlayers: number;
  readonly actionTimeoutMs: number;
  readonly autoPostBlinds: boolean;
}

export const DEFAULT_SERVICE_CONFIG: GameServiceConfig = {
  tableId: 'default-table',
  smallBlind: 5,
  bigBlind: 10,
  minPlayers: 2,
  maxPlayers: 9,
  actionTimeoutMs: 30000,
  autoPostBlinds: true,
};

// ============================================================================
// Player Types
// ============================================================================

export interface PlayerInfo {
  readonly id: PlayerId;
  readonly name: string;
  readonly stack: number;
  readonly seat: number;
  readonly isActive: boolean;
  readonly isConnected: boolean;
}

export interface PlayerState {
  readonly id: PlayerId;
  readonly name: string;
  readonly stack: number;
  readonly seat: number;
  readonly status: 'active' | 'folded' | 'all-in' | 'out' | 'sitting-out';
  readonly currentBet: number;
  readonly totalBetThisHand: number;
  readonly holeCards: readonly Card[];
  readonly isDealer: boolean;
}

// ============================================================================
// Game State Types
// ============================================================================

export interface GameState {
  readonly tableId: TableId;
  readonly handId: HandId | null;
  readonly phase: GamePhase;
  readonly street: Street;
  readonly pot: number;
  readonly currentBet: number;
  readonly communityCards: readonly Card[];
  readonly players: readonly PlayerState[];
  readonly dealerSeat: number;
  readonly smallBlindSeat: number;
  readonly bigBlindSeat: number;
  readonly currentPlayerSeat: number | null;
  readonly lastAction: ActionSummary | null;
  readonly isHandInProgress: boolean;
}

export type GamePhase =
  | 'IDLE'
  | 'WAITING_FOR_PLAYERS'
  | 'STARTING'
  | 'BLINDS'
  | 'DEALING'
  | 'BETTING'
  | 'SHOWDOWN'
  | 'SETTLEMENT'
  | 'HAND_COMPLETE';

export interface ActionSummary {
  readonly playerId: PlayerId;
  readonly action: PlayerActionType;
  readonly amount: number;
  readonly timestamp: number;
}

// ============================================================================
// Action Request/Response Types
// ============================================================================

export interface ActionRequest {
  readonly playerId: PlayerId;
  readonly action: PlayerActionType;
  readonly amount?: number;
  readonly timestamp?: number;
}

export interface ActionResponse {
  readonly success: boolean;
  readonly error?: ActionError;
  readonly newState?: GameState;
  readonly events?: readonly GameEvent[];
}

export interface ActionError {
  readonly code: ActionErrorCode;
  readonly message: string;
  readonly details?: Record<string, unknown>;
}

export type ActionErrorCode =
  | 'NOT_YOUR_TURN'
  | 'INVALID_ACTION'
  | 'INSUFFICIENT_CHIPS'
  | 'INVALID_AMOUNT'
  | 'HAND_NOT_IN_PROGRESS'
  | 'PLAYER_NOT_FOUND'
  | 'PLAYER_NOT_ACTIVE'
  | 'ACTION_TIMEOUT'
  | 'INTERNAL_ERROR';

// ============================================================================
// Valid Actions Types
// ============================================================================

export interface ValidActions {
  readonly canFold: boolean;
  readonly canCheck: boolean;
  readonly canCall: boolean;
  readonly callAmount: number;
  readonly canBet: boolean;
  readonly minBet: number;
  readonly maxBet: number;
  readonly canRaise: boolean;
  readonly minRaise: number;
  readonly maxRaise: number;
  readonly canAllIn: boolean;
  readonly allInAmount: number;
}

// ============================================================================
// Hand Result Types
// ============================================================================

export interface HandResult {
  readonly handId: HandId;
  readonly winners: readonly WinnerInfo[];
  readonly totalPot: number;
  readonly rake: number;
  readonly sidePots: readonly SidePotResult[];
  readonly showdownResults: readonly ShowdownPlayerResult[];
  readonly endReason: HandEndReason;
  readonly duration: number;
  readonly finalStacks: ReadonlyMap<PlayerId, number>;
}

export type HandEndReason = 'showdown' | 'all-fold' | 'all-in-runout';

export interface WinnerInfo {
  readonly playerId: PlayerId;
  readonly playerName: string;
  readonly amount: number;
  readonly handDescription: string;
}

export interface SidePotResult {
  readonly potId: string;
  readonly amount: number;
  readonly winnerIds: readonly PlayerId[];
  readonly eligiblePlayerIds: readonly PlayerId[];
}

export interface ShowdownPlayerResult {
  readonly playerId: PlayerId;
  readonly playerName: string;
  readonly holeCards: readonly Card[];
  readonly handRank: number;
  readonly handDescription: string;
  readonly isWinner: boolean;
  readonly amountWon: number;
}

// ============================================================================
// Table Management Types
// ============================================================================

export interface JoinTableRequest {
  readonly playerId: PlayerId;
  readonly playerName: string;
  readonly buyInAmount: number;
  readonly preferredSeat?: number;
}

export interface JoinTableResponse {
  readonly success: boolean;
  readonly seat?: number;
  readonly error?: string;
}

export interface LeaveTableRequest {
  readonly playerId: PlayerId;
  readonly cashOut: boolean;
}

export interface LeaveTableResponse {
  readonly success: boolean;
  readonly cashOutAmount?: number;
  readonly error?: string;
}

export interface RebuyRequest {
  readonly playerId: PlayerId;
  readonly amount: number;
}

export interface RebuyResponse {
  readonly success: boolean;
  readonly newStack?: number;
  readonly error?: string;
}

// ============================================================================
// Event Subscription Types
// ============================================================================

export type GameEventHandler = (event: GameEvent) => void;
export type StateChangeHandler = (state: GameState) => void;
export type HandResultHandler = (result: HandResult) => void;

export interface EventSubscription {
  readonly unsubscribe: () => void;
}

// ============================================================================
// Service Status Types
// ============================================================================

export interface ServiceStatus {
  readonly isRunning: boolean;
  readonly tableId: TableId;
  readonly playerCount: number;
  readonly handCount: number;
  readonly currentHandId: HandId | null;
  readonly uptime: number;
}
