/**
 * GameService.ts
 * Phase 17 - High-level service layer for game orchestration
 *
 * Wraps the TableEngine with:
 * - Command validation before execution
 * - Clean API for UI/network consumers
 * - Player management with validation
 * - Event subscription management
 * - Service status tracking
 *
 * All operations are deterministic and validation errors
 * are returned without modifying game state.
 */

import { PlayerId } from '../../security/Identity';
import { TableId, HandId } from '../../security/AuditLog';
import { Card } from '../engine/Card';
import { TableEngine, createTableEngine, PlayerConfig } from '../engine/GameLoop';
import { GameEvent } from '../engine/GameEvents';
import { HandState } from '../engine/GameReducers';
import {
  validateActionRequest,
  validateJoinTableRequest,
  validateRebuyRequest,
  validateLeaveTableRequest,
  validateHandStart,
  getPlayerValidActions,
} from './CommandValidator';
import {
  GameServiceConfig,
  DEFAULT_SERVICE_CONFIG,
  PlayerInfo,
  PlayerState,
  GameState,
  GamePhase,
  ActionRequest,
  ActionResponse,
  ActionSummary,
  ValidActions,
  HandResult,
  WinnerInfo,
  ShowdownPlayerResult,
  SidePotResult,
  JoinTableRequest,
  JoinTableResponse,
  LeaveTableRequest,
  LeaveTableResponse,
  RebuyRequest,
  RebuyResponse,
  GameEventHandler,
  StateChangeHandler,
  HandResultHandler,
  EventSubscription,
  ServiceStatus,
} from './ServiceTypes';

// ============================================================================
// Game Service Implementation
// ============================================================================

/**
 * GameService provides a clean API for game orchestration
 * with full command validation
 */
export class GameService {
  private readonly config: GameServiceConfig;
  private readonly engine: TableEngine;
  private readonly players: Map<PlayerId, PlayerInfo>;
  private readonly eventListeners: Set<GameEventHandler>;
  private readonly stateListeners: Set<StateChangeHandler>;
  private readonly resultListeners: Set<HandResultHandler>;
  private handCount: number;
  private startTime: number;
  private lastAction: ActionSummary | null;

  constructor(config: Partial<GameServiceConfig> = {}) {
    this.config = { ...DEFAULT_SERVICE_CONFIG, ...config };
    this.engine = createTableEngine({
      tableId: this.config.tableId,
      smallBlind: this.config.smallBlind,
      bigBlind: this.config.bigBlind,
    });
    this.players = new Map();
    this.eventListeners = new Set();
    this.stateListeners = new Set();
    this.resultListeners = new Set();
    this.handCount = 0;
    this.startTime = Date.now();
    this.lastAction = null;

    // Forward engine events to listeners
    this.engine.onEvent((event) => {
      this.handleEngineEvent(event);
    });
  }

  // ==========================================================================
  // Player Management
  // ==========================================================================

  /**
   * Join a player to the table
   */
  joinTable(request: JoinTableRequest): JoinTableResponse {
    const existingPlayers = Array.from(this.players.values());
    const validation = validateJoinTableRequest(request, existingPlayers, this.config);

    if (!validation.valid) {
      return {
        success: false,
        error: validation.error?.message,
      };
    }

    // Find available seat
    let seat = request.preferredSeat;
    if (seat === undefined) {
      seat = this.findAvailableSeat();
      if (seat === -1) {
        return {
          success: false,
          error: 'No seats available',
        };
      }
    }

    // Create player info
    const playerInfo: PlayerInfo = {
      id: request.playerId,
      name: request.playerName,
      stack: request.buyInAmount,
      seat,
      isActive: true,
      isConnected: true,
    };

    // Add to our tracking
    this.players.set(request.playerId, playerInfo);

    // Add to engine
    const playerConfig: PlayerConfig = {
      id: request.playerId,
      name: request.playerName,
      stack: request.buyInAmount,
      seat,
    };

    try {
      this.engine.addPlayer(playerConfig);
    } catch (error) {
      // Rollback our tracking
      this.players.delete(request.playerId);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to add player',
      };
    }

    this.notifyStateChange();

    return {
      success: true,
      seat,
    };
  }

  /**
   * Remove a player from the table
   */
  leaveTable(request: LeaveTableRequest): LeaveTableResponse {
    const player = this.players.get(request.playerId);
    const handState = this.engine.getHandState();
    const isHandInProgress = handState !== null && handState.phase !== 'COMPLETE';
    const isPlayerInHand = handState?.tableState.players.some(
      p => p.id === request.playerId && (p.status === 'active' || p.status === 'all-in')
    ) ?? false;

    const validation = validateLeaveTableRequest(
      request.playerId,
      player,
      isHandInProgress,
      isPlayerInHand
    );

    if (!validation.valid) {
      return {
        success: false,
        error: validation.error?.message,
      };
    }

    const cashOutAmount = player!.stack;

    // Remove from our tracking
    this.players.delete(request.playerId);

    // Remove from engine
    try {
      this.engine.removePlayer(request.playerId);
    } catch (error) {
      // Add back to our tracking
      this.players.set(request.playerId, player!);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to remove player',
      };
    }

    this.notifyStateChange();

    return {
      success: true,
      cashOutAmount: request.cashOut ? cashOutAmount : undefined,
    };
  }

  /**
   * Process a rebuy request
   */
  rebuy(request: RebuyRequest): RebuyResponse {
    const player = this.players.get(request.playerId);
    const handState = this.engine.getHandState();
    const isHandInProgress = handState !== null && handState.phase !== 'COMPLETE';

    const validation = validateRebuyRequest(request, player, isHandInProgress, this.config);

    if (!validation.valid) {
      return {
        success: false,
        error: validation.error?.message,
      };
    }

    // Update player stack
    const newStack = player!.stack + request.amount;
    const updatedPlayer: PlayerInfo = {
      ...player!,
      stack: newStack,
    };

    this.players.set(request.playerId, updatedPlayer);

    // Update engine
    try {
      this.engine.updatePlayerStack(request.playerId, newStack);
    } catch (error) {
      // Rollback
      this.players.set(request.playerId, player!);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update stack',
      };
    }

    this.notifyStateChange();

    return {
      success: true,
      newStack,
    };
  }

  /**
   * Get player info
   */
  getPlayer(playerId: PlayerId): PlayerInfo | undefined {
    return this.players.get(playerId);
  }

  /**
   * Get all players
   */
  getPlayers(): readonly PlayerInfo[] {
    return Array.from(this.players.values());
  }

  /**
   * Get player count
   */
  getPlayerCount(): number {
    return this.players.size;
  }

  // ==========================================================================
  // Hand Management
  // ==========================================================================

  /**
   * Start a new hand
   */
  startHand(): { success: boolean; handId?: HandId; error?: string } {
    const players = Array.from(this.players.values());
    const validation = validateHandStart(players, this.config);

    if (!validation.valid) {
      return {
        success: false,
        error: validation.error?.message,
      };
    }

    try {
      const handId = this.engine.startHand();
      this.handCount++;
      this.lastAction = null;
      this.notifyStateChange();
      return { success: true, handId };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to start hand',
      };
    }
  }

  /**
   * Process a player action
   */
  processAction(request: ActionRequest): ActionResponse {
    const handState = this.engine.getHandState();
    const validation = validateActionRequest(request, handState, this.config);

    if (!validation.valid) {
      return {
        success: false,
        error: validation.error,
      };
    }

    try {
      const success = this.engine.processAction({
        playerId: request.playerId,
        action: request.action,
        amount: request.amount,
      });

      if (!success) {
        return {
          success: false,
          error: {
            code: 'INVALID_ACTION',
            message: 'Action was rejected by the engine',
          },
        };
      }

      // Record last action
      this.lastAction = {
        playerId: request.playerId,
        action: request.action,
        amount: request.amount ?? 0,
        timestamp: Date.now(),
      };

      // Update player stacks from engine state
      this.syncPlayerStacks();

      const newState = this.getGameState();
      const events = this.engine.getEventHistory();

      this.notifyStateChange();

      return {
        success: true,
        newState,
        events,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }

  /**
   * Get valid actions for a player
   */
  getValidActions(playerId: PlayerId): ValidActions | null {
    const handState = this.engine.getHandState();
    return getPlayerValidActions(playerId, handState);
  }

  /**
   * Check if a hand is in progress
   */
  isHandInProgress(): boolean {
    const handState = this.engine.getHandState();
    return handState !== null && handState.phase !== 'COMPLETE';
  }

  /**
   * Check if hand is complete
   */
  isHandComplete(): boolean {
    return this.engine.isHandComplete();
  }

  // ==========================================================================
  // State Queries
  // ==========================================================================

  /**
   * Get current game state
   */
  getGameState(): GameState {
    const handState = this.engine.getHandState();
    const enginePlayers = this.engine.getPlayers();

    if (!handState) {
      // No active hand
      return {
        tableId: this.config.tableId,
        handId: null,
        phase: this.players.size >= this.config.minPlayers ? 'WAITING_FOR_PLAYERS' : 'IDLE',
        street: 'waiting',
        pot: 0,
        currentBet: 0,
        communityCards: [],
        players: this.buildPlayerStates(null),
        dealerSeat: -1,
        smallBlindSeat: -1,
        bigBlindSeat: -1,
        currentPlayerSeat: null,
        lastAction: this.lastAction,
        isHandInProgress: false,
      };
    }

    const tableState = handState.tableState;
    const dealerPlayer = tableState.players.find(p => p.isDealer);
    const dealerSeat = dealerPlayer?.seat ?? -1;

    // Calculate blind seats
    const numPlayers = tableState.players.length;
    let smallBlindSeat = -1;
    let bigBlindSeat = -1;

    if (numPlayers === 2) {
      smallBlindSeat = dealerSeat;
      const otherPlayer = tableState.players.find(p => !p.isDealer);
      bigBlindSeat = otherPlayer?.seat ?? -1;
    } else if (numPlayers > 2) {
      // Find SB and BB positions
      const dealerIndex = tableState.players.findIndex(p => p.isDealer);
      const sbIndex = (dealerIndex + 1) % numPlayers;
      const bbIndex = (dealerIndex + 2) % numPlayers;
      smallBlindSeat = tableState.players[sbIndex]?.seat ?? -1;
      bigBlindSeat = tableState.players[bbIndex]?.seat ?? -1;
    }

    const currentPlayer = tableState.players[tableState.activePlayerIndex];
    const currentPlayerSeat = currentPlayer?.seat ?? null;

    return {
      tableId: this.config.tableId,
      handId: handState.handId,
      phase: this.mapPhase(handState.phase),
      street: tableState.street,
      pot: tableState.pot,
      currentBet: tableState.currentBet,
      communityCards: tableState.communityCards,
      players: this.buildPlayerStates(handState),
      dealerSeat,
      smallBlindSeat,
      bigBlindSeat,
      currentPlayerSeat,
      lastAction: this.lastAction,
      isHandInProgress: handState.phase !== 'COMPLETE',
    };
  }

  /**
   * Get current hand ID
   */
  getCurrentHandId(): HandId | null {
    const handState = this.engine.getHandState();
    return handState?.handId ?? null;
  }

  /**
   * Get current pot size
   */
  getPot(): number {
    return this.engine.getPot();
  }

  /**
   * Get community cards
   */
  getCommunityCards(): readonly Card[] {
    return this.engine.getCommunityCards();
  }

  /**
   * Get current player to act
   */
  getCurrentPlayer(): PlayerId | null {
    return this.engine.getCurrentPlayer();
  }

  /**
   * Get hand result (only after hand completes)
   */
  getHandResult(): HandResult | null {
    const engineResult = this.engine.getHandResult();
    if (!engineResult) return null;

    // Build winner info
    const winners: WinnerInfo[] = [];
    for (const winnerId of engineResult.winnerIds) {
      const player = this.players.get(winnerId);
      const amount = engineResult.amounts.get(winnerId) ?? 0;
      winners.push({
        playerId: winnerId,
        playerName: player?.name ?? 'Unknown',
        amount,
        handDescription: '', // Would need showdown info
      });
    }

    return {
      handId: engineResult.handId,
      winners,
      totalPot: this.engine.getPot(),
      rake: 0, // Would integrate with economy layer
      sidePots: [],
      showdownResults: [],
      endReason: engineResult.reason,
      duration: engineResult.duration,
      finalStacks: engineResult.finalStacks,
    };
  }

  // ==========================================================================
  // Event Subscriptions
  // ==========================================================================

  /**
   * Subscribe to game events
   */
  onEvent(handler: GameEventHandler): EventSubscription {
    this.eventListeners.add(handler);
    return {
      unsubscribe: () => {
        this.eventListeners.delete(handler);
      },
    };
  }

  /**
   * Subscribe to state changes
   */
  onStateChange(handler: StateChangeHandler): EventSubscription {
    this.stateListeners.add(handler);
    return {
      unsubscribe: () => {
        this.stateListeners.delete(handler);
      },
    };
  }

  /**
   * Subscribe to hand results
   */
  onHandResult(handler: HandResultHandler): EventSubscription {
    this.resultListeners.add(handler);
    return {
      unsubscribe: () => {
        this.resultListeners.delete(handler);
      },
    };
  }

  // ==========================================================================
  // Service Status
  // ==========================================================================

  /**
   * Get service status
   */
  getStatus(): ServiceStatus {
    return {
      isRunning: true,
      tableId: this.config.tableId,
      playerCount: this.players.size,
      handCount: this.handCount,
      currentHandId: this.getCurrentHandId(),
      uptime: Date.now() - this.startTime,
    };
  }

  /**
   * Get service configuration
   */
  getConfig(): GameServiceConfig {
    return { ...this.config };
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  /**
   * Find an available seat
   */
  private findAvailableSeat(): number {
    const takenSeats = new Set(Array.from(this.players.values()).map(p => p.seat));
    for (let seat = 0; seat < this.config.maxPlayers; seat++) {
      if (!takenSeats.has(seat)) {
        return seat;
      }
    }
    return -1;
  }

  /**
   * Map engine phase to service phase
   */
  private mapPhase(phase: string): GamePhase {
    const phaseMap: Record<string, GamePhase> = {
      WAITING: 'WAITING_FOR_PLAYERS',
      BLINDS: 'BLINDS',
      DEALING: 'DEALING',
      PREFLOP: 'BETTING',
      FLOP: 'BETTING',
      TURN: 'BETTING',
      RIVER: 'BETTING',
      SHOWDOWN: 'SHOWDOWN',
      SETTLEMENT: 'SETTLEMENT',
      COMPLETE: 'HAND_COMPLETE',
    };
    return phaseMap[phase] ?? 'IDLE';
  }

  /**
   * Build player states from hand state
   */
  private buildPlayerStates(handState: HandState | null): readonly PlayerState[] {
    if (!handState) {
      // No active hand - return basic player info
      return Array.from(this.players.values()).map(p => ({
        id: p.id,
        name: p.name,
        stack: p.stack,
        seat: p.seat,
        status: p.isActive ? 'active' : 'sitting-out',
        currentBet: 0,
        totalBetThisHand: 0,
        holeCards: [],
        isDealer: false,
      }));
    }

    return handState.tableState.players.map(p => ({
      id: p.id,
      name: p.name,
      stack: p.stack,
      seat: p.seat,
      status: p.status,
      currentBet: p.currentBet,
      totalBetThisHand: p.totalBetThisHand,
      holeCards: p.holeCards,
      isDealer: p.isDealer,
    }));
  }

  /**
   * Sync player stacks from engine state
   */
  private syncPlayerStacks(): void {
    const handState = this.engine.getHandState();
    if (!handState) return;

    for (const enginePlayer of handState.tableState.players) {
      const playerInfo = this.players.get(enginePlayer.id);
      if (playerInfo && playerInfo.stack !== enginePlayer.stack) {
        this.players.set(enginePlayer.id, {
          ...playerInfo,
          stack: enginePlayer.stack,
        });
      }
    }
  }

  /**
   * Handle engine event
   */
  private handleEngineEvent(event: GameEvent): void {
    // Forward to listeners
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch (error) {
        console.error('Event listener error:', error);
      }
    }

    // Check for hand end
    if (event.type === 'HAND_ENDED') {
      const result = this.getHandResult();
      if (result) {
        for (const listener of this.resultListeners) {
          try {
            listener(result);
          } catch (error) {
            console.error('Result listener error:', error);
          }
        }
      }
    }
  }

  /**
   * Notify state change listeners
   */
  private notifyStateChange(): void {
    const state = this.getGameState();
    for (const listener of this.stateListeners) {
      try {
        listener(state);
      } catch (error) {
        console.error('State listener error:', error);
      }
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new GameService instance
 */
export function createGameService(config?: Partial<GameServiceConfig>): GameService {
  return new GameService(config);
}
