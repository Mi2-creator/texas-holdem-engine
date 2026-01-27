/**
 * GameLoop.ts
 * Phase 16 - Main game orchestration engine
 *
 * Drives hand progression through all phases:
 * waiting → dealing → betting rounds → showdown → settlement
 *
 * All state transitions are deterministic and event-driven.
 */

import { PlayerId } from '../../security/Identity';
import { TableId, HandId } from '../../security/AuditLog';
import { Card } from './Card';
import { Street } from './TableState';
import { getValidActions } from './BettingRound';
import { resolveShowdown, ShowdownPlayer } from '../../core/game/hand/Showdown';
import {
  PlayerActionType,
} from './GameCommands';
import {
  GameEvent,
  GameEventEmitter,
  createGameEventEmitter,
  createHandStartedEvent,
  createBlindsPostedEvent,
  createHoleCardsDealtEvent,
  createStreetChangedEvent,
  createCommunityCardsDealtEvent,
  createPlayerActedEvent,
  createPlayerToActEvent,
  createBettingRoundCompleteEvent,
  createShowdownStartedEvent,
  createHandRevealedEvent,
  createPotAwardedEvent,
  createHandEndedEvent,
  createErrorEvent,
  resetEventSequence,
} from './GameEvents';
import {
  HandState,
  HandPhase,
  createInitialHandState,
  reducePostBlinds,
  reduceDealHoleCards,
  reducePlayerAction,
  reduceDealCommunity,
  reduceStartShowdown,
  reduceSettlePot,
  reduceEndHand,
  isBettingComplete,
  isAllFolded,
  isAllPlayersAllIn,
  getCurrentPlayerId,
  getValidActionsForCurrentPlayer,
  getPotTotal,
  getActivePlayerIds,
  getSmallBlindPlayerId,
  getBigBlindPlayerId,
  getNextPhase,
} from './GameReducers';
import { getSmallBlindIndex, getBigBlindIndex, getActivePlayers } from './TableState';

// ============================================================================
// Types
// ============================================================================

export interface TableEngineConfig {
  readonly tableId: TableId;
  readonly smallBlind: number;
  readonly bigBlind: number;
}

export interface PlayerConfig {
  readonly id: PlayerId;
  readonly name: string;
  readonly stack: number;
  readonly seat: number;
}

export interface ActionRequest {
  readonly playerId: PlayerId;
  readonly action: PlayerActionType;
  readonly amount?: number;
}

export interface HandResult {
  readonly handId: HandId;
  readonly winnerIds: readonly PlayerId[];
  readonly amounts: ReadonlyMap<PlayerId, number>;
  readonly reason: 'showdown' | 'all-fold' | 'all-in-runout';
  readonly finalStacks: ReadonlyMap<PlayerId, number>;
  readonly events: readonly GameEvent[];
  readonly duration: number;
}

// ============================================================================
// Table Engine
// ============================================================================

/**
 * TableEngine orchestrates complete hand lifecycle
 */
export class TableEngine {
  private config: TableEngineConfig;
  private players: PlayerConfig[];
  private dealerIndex: number;
  private handState: HandState | null;
  private eventEmitter: GameEventEmitter;
  private handIdCounter: number;

  constructor(config: TableEngineConfig) {
    this.config = config;
    this.players = [];
    this.dealerIndex = 0;
    this.handState = null;
    this.eventEmitter = createGameEventEmitter();
    this.handIdCounter = 0;
  }

  // ==========================================================================
  // Player Management
  // ==========================================================================

  /**
   * Add player to table
   */
  addPlayer(player: PlayerConfig): void {
    if (this.handState && this.handState.phase !== 'COMPLETE') {
      throw new Error('Cannot add player during active hand');
    }

    if (this.players.some(p => p.id === player.id)) {
      throw new Error(`Player ${player.id} already at table`);
    }

    if (this.players.some(p => p.seat === player.seat)) {
      throw new Error(`Seat ${player.seat} already taken`);
    }

    this.players.push(player);
  }

  /**
   * Remove player from table
   */
  removePlayer(playerId: PlayerId): void {
    if (this.handState && this.handState.phase !== 'COMPLETE') {
      throw new Error('Cannot remove player during active hand');
    }

    this.players = this.players.filter(p => p.id !== playerId);
  }

  /**
   * Update player stack
   */
  updatePlayerStack(playerId: PlayerId, stack: number): void {
    const player = this.players.find(p => p.id === playerId);
    if (!player) {
      throw new Error(`Player ${playerId} not found`);
    }
    // Create new player config with updated stack
    this.players = this.players.map(p =>
      p.id === playerId ? { ...p, stack } : p
    );
  }

  /**
   * Get player count
   */
  getPlayerCount(): number {
    return this.players.length;
  }

  /**
   * Get players at table
   */
  getPlayers(): readonly PlayerConfig[] {
    return [...this.players];
  }

  // ==========================================================================
  // Event Management
  // ==========================================================================

  /**
   * Subscribe to events
   */
  onEvent(listener: (event: GameEvent) => void): () => void {
    return this.eventEmitter.on(listener);
  }

  /**
   * Get event history
   */
  getEventHistory(): readonly GameEvent[] {
    return this.eventEmitter.getHistory();
  }

  // ==========================================================================
  // Hand Lifecycle
  // ==========================================================================

  /**
   * Start a new hand
   */
  startHand(): HandId {
    if (this.players.length < 2) {
      throw new Error('Need at least 2 players to start hand');
    }

    // Generate hand ID
    const handId = `hand_${this.config.tableId}_${++this.handIdCounter}_${Date.now()}`;

    // Reset event sequence
    resetEventSequence();
    this.eventEmitter.clear();

    // Create initial state
    this.handState = createInitialHandState(
      this.config.tableId,
      handId,
      this.players,
      this.config.smallBlind,
      this.config.bigBlind,
      this.dealerIndex
    );

    // Emit hand started event
    const playerStacks = new Map<PlayerId, number>();
    for (const p of this.players) {
      playerStacks.set(p.id, p.stack);
    }

    const sbIndex = getSmallBlindIndex(this.handState.tableState);
    const bbIndex = getBigBlindIndex(this.handState.tableState);

    this.eventEmitter.emit(createHandStartedEvent(
      handId,
      this.config.tableId,
      this.handState.tableState.handNumber,
      this.dealerIndex,
      sbIndex,
      bbIndex,
      this.players.map(p => p.id),
      playerStacks
    ));

    // Post blinds
    this.postBlinds();

    // Deal hole cards
    this.dealHoleCards();

    // Emit player to act
    this.emitPlayerToAct();

    return handId;
  }

  /**
   * Post blinds
   */
  private postBlinds(): void {
    if (!this.handState) return;

    const sbPlayerId = getSmallBlindPlayerId(this.handState);
    const bbPlayerId = getBigBlindPlayerId(this.handState);

    const result = reducePostBlinds(this.handState);
    if (!result.success) {
      this.emitError('BLINDS_ERROR', result.error ?? 'Failed to post blinds');
      return;
    }

    this.handState = result.state;

    // Emit blinds posted event
    this.eventEmitter.emit(createBlindsPostedEvent(
      this.handState.handId,
      this.handState.tableId,
      { playerId: sbPlayerId, amount: this.config.smallBlind },
      { playerId: bbPlayerId, amount: this.config.bigBlind },
      getPotTotal(this.handState)
    ));
  }

  /**
   * Deal hole cards
   */
  private dealHoleCards(): void {
    if (!this.handState) return;

    const result = reduceDealHoleCards(this.handState);
    if (!result.success) {
      this.emitError('DEAL_ERROR', result.error ?? 'Failed to deal hole cards');
      return;
    }

    this.handState = result.state;

    // Build player cards map
    const playerCards = new Map<PlayerId, readonly Card[]>();
    for (const player of this.handState.tableState.players) {
      if (player.holeCards.length > 0) {
        playerCards.set(player.id, player.holeCards);
      }
    }

    // Emit hole cards dealt event
    this.eventEmitter.emit(createHoleCardsDealtEvent(
      this.handState.handId,
      this.handState.tableId,
      playerCards
    ));
  }

  /**
   * Process player action
   */
  processAction(request: ActionRequest): boolean {
    if (!this.handState) {
      throw new Error('No active hand');
    }

    if (this.handState.phase === 'COMPLETE') {
      throw new Error('Hand is complete');
    }

    const currentPlayerId = getCurrentPlayerId(this.handState);
    if (currentPlayerId !== request.playerId) {
      throw new Error(`Not ${request.playerId}'s turn`);
    }

    const playerBefore = this.handState.tableState.players[this.handState.tableState.activePlayerIndex];
    const potBefore = getPotTotal(this.handState);

    const result = reducePlayerAction(
      this.handState,
      request.playerId,
      request.action,
      request.amount
    );

    if (!result.success) {
      this.emitError('ACTION_ERROR', result.error ?? 'Invalid action');
      return false;
    }

    this.handState = result.state;

    // Get updated player info
    const playerAfter = this.handState.tableState.players.find(p => p.id === request.playerId);
    const potAfter = getPotTotal(this.handState);

    // Calculate amount
    let actionAmount = 0;
    if (request.action === 'bet' || request.action === 'raise') {
      actionAmount = request.amount ?? 0;
    } else if (request.action === 'call') {
      actionAmount = potAfter - potBefore;
    } else if (request.action === 'all-in') {
      actionAmount = playerBefore.stack;
    }

    // Emit player acted event
    this.eventEmitter.emit(createPlayerActedEvent(
      this.handState.handId,
      this.handState.tableId,
      request.playerId,
      request.action,
      actionAmount,
      playerAfter?.stack ?? 0,
      potAfter,
      playerAfter?.status === 'all-in'
    ));

    // Check hand state after action
    this.checkHandState();

    return true;
  }

  /**
   * Check hand state and advance if needed
   */
  private checkHandState(): void {
    if (!this.handState) return;

    // Check if all players folded
    if (isAllFolded(this.handState)) {
      this.handleAllFold();
      return;
    }

    // Check if betting round is complete
    // Additional check: ensure all active players have matched the current bet
    const bettingComplete = this.isBettingRoundComplete();

    if (bettingComplete) {
      this.eventEmitter.emit(createBettingRoundCompleteEvent(
        this.handState.handId,
        this.handState.tableId,
        this.handState.tableState.street,
        getPotTotal(this.handState),
        getActivePlayerIds(this.handState).length
      ));

      // Check if all remaining players are all-in
      if (isAllPlayersAllIn(this.handState)) {
        this.handleAllInRunout();
        return;
      }

      // Advance to next phase
      this.advancePhase();
    } else {
      // Emit player to act
      this.emitPlayerToAct();
    }
  }

  /**
   * Enhanced betting round complete check
   * Fixes edge case where isBettingComplete returns true prematurely
   */
  private isBettingRoundComplete(): boolean {
    if (!this.handState) return false;

    const state = this.handState.tableState;

    // Get players who can still act (active, not all-in, not folded)
    const actingPlayers = state.players.filter(p => p.status === 'active');

    // Get all players still in hand (active or all-in)
    const activePlayers = state.players.filter(
      p => p.status === 'active' || p.status === 'all-in'
    );

    // If only one player remains, round is complete
    if (activePlayers.length <= 1) return true;

    // If no one can act (everyone is all-in), round is complete
    if (actingPlayers.length === 0) return true;

    // Check if all active players have matched the current bet
    for (const player of actingPlayers) {
      if (player.currentBet < state.currentBet && player.stack > 0) {
        return false;
      }
    }

    // All players must have acted at least once this round
    if (state.actionsThisRound < actingPlayers.length) return false;

    return true;
  }

  /**
   * Advance to next phase
   */
  private advancePhase(): void {
    if (!this.handState) return;

    const nextPhase = getNextPhase(this.handState);
    const currentStreet = this.handState.tableState.street;

    switch (nextPhase) {
      case 'FLOP':
        this.dealCommunity('flop');
        break;
      case 'TURN':
        this.dealCommunity('turn');
        break;
      case 'RIVER':
        this.dealCommunity('river');
        break;
      case 'SHOWDOWN':
        this.startShowdown();
        break;
      case 'SETTLEMENT':
        this.settlePot();
        break;
    }
  }

  /**
   * Deal community cards
   */
  private dealCommunity(street: 'flop' | 'turn' | 'river'): void {
    if (!this.handState) return;

    const prevStreet = this.handState.tableState.street;

    const result = reduceDealCommunity(this.handState, street);
    if (!result.success) {
      this.emitError('DEAL_ERROR', result.error ?? `Failed to deal ${street}`);
      return;
    }

    this.handState = result.state;

    // Get the new cards dealt
    const allCommunity = this.handState.tableState.communityCards;
    const newCards = street === 'flop'
      ? allCommunity.slice(0, 3)
      : allCommunity.slice(-1);

    // Emit street changed event
    this.eventEmitter.emit(createStreetChangedEvent(
      this.handState.handId,
      this.handState.tableId,
      prevStreet,
      this.handState.tableState.street,
      getPotTotal(this.handState)
    ));

    // Emit community cards dealt event
    this.eventEmitter.emit(createCommunityCardsDealtEvent(
      this.handState.handId,
      this.handState.tableId,
      this.handState.tableState.street,
      newCards,
      allCommunity
    ));

    // Emit player to act
    this.emitPlayerToAct();
  }

  /**
   * Handle all players folded
   */
  private handleAllFold(): void {
    if (!this.handState) return;

    // Find the remaining player
    const activePlayers = getActivePlayers(this.handState.tableState);
    if (activePlayers.length !== 1) return;

    const winner = activePlayers[0];
    const potAmount = getPotTotal(this.handState);

    // Award pot
    const amounts = new Map<PlayerId, number>();
    amounts.set(winner.id, potAmount);

    const settleResult = reduceSettlePot(
      this.handState,
      [winner.id],
      amounts,
      'Opponent folded'
    );

    if (settleResult.success) {
      this.handState = settleResult.state;
    }

    // Emit pot awarded
    this.eventEmitter.emit(createPotAwardedEvent(
      this.handState.handId,
      this.handState.tableId,
      [winner.id],
      amounts,
      potAmount,
      false,
      'Opponent folded'
    ));

    // End hand
    this.endHand('all-fold', [winner.id], amounts);
  }

  /**
   * Handle all-in runout (deal remaining community and go to showdown)
   */
  private handleAllInRunout(): void {
    if (!this.handState) return;

    // Deal remaining community cards
    while (this.handState.tableState.communityCards.length < 5) {
      const currentCount = this.handState.tableState.communityCards.length;
      if (currentCount === 0) {
        this.dealCommunityForRunout('flop');
      } else if (currentCount === 3) {
        this.dealCommunityForRunout('turn');
      } else if (currentCount === 4) {
        this.dealCommunityForRunout('river');
      } else {
        break;
      }
    }

    // Go to showdown
    this.startShowdown();
  }

  /**
   * Deal community for all-in runout (no betting)
   */
  private dealCommunityForRunout(street: 'flop' | 'turn' | 'river'): void {
    if (!this.handState) return;

    // Manually update phase to allow dealing
    const phaseMap: Record<string, HandPhase> = {
      flop: 'PREFLOP',
      turn: 'FLOP',
      river: 'TURN',
    };

    this.handState = {
      ...this.handState,
      phase: phaseMap[street],
    };

    const prevStreet = this.handState.tableState.street;
    const result = reduceDealCommunity(this.handState, street);

    if (result.success) {
      this.handState = result.state;

      const allCommunity = this.handState.tableState.communityCards;
      const newCards = street === 'flop'
        ? allCommunity.slice(0, 3)
        : allCommunity.slice(-1);

      this.eventEmitter.emit(createStreetChangedEvent(
        this.handState.handId,
        this.handState.tableId,
        prevStreet,
        this.handState.tableState.street,
        getPotTotal(this.handState)
      ));

      this.eventEmitter.emit(createCommunityCardsDealtEvent(
        this.handState.handId,
        this.handState.tableId,
        this.handState.tableState.street,
        newCards,
        allCommunity
      ));
    }
  }

  /**
   * Start showdown
   */
  private startShowdown(): void {
    if (!this.handState) return;

    const activePlayers = getActivePlayers(this.handState.tableState);
    const potTotal = getPotTotal(this.handState);

    // Update phase
    const result = reduceStartShowdown({
      ...this.handState,
      phase: 'RIVER', // Ensure we're in RIVER phase
    });

    if (result.success) {
      this.handState = result.state;
    }

    // Emit showdown started
    this.eventEmitter.emit(createShowdownStartedEvent(
      this.handState.handId,
      this.handState.tableId,
      activePlayers.length,
      potTotal
    ));

    // Build showdown players
    const showdownPlayers: ShowdownPlayer[] = this.handState.tableState.players.map(p => ({
      id: p.id,
      name: p.name,
      holeCards: p.holeCards,
      folded: p.status === 'folded',
    }));

    // Resolve showdown
    const showdownResult = resolveShowdown({
      players: showdownPlayers,
      communityCards: this.handState.tableState.communityCards,
      potSize: potTotal,
    });

    // Emit hand revealed events
    for (const playerResult of showdownResult.players) {
      if (!playerResult.folded && playerResult.handRank) {
        this.eventEmitter.emit(createHandRevealedEvent(
          this.handState.handId,
          this.handState.tableId,
          playerResult.playerId,
          playerResult.holeCards,
          String(playerResult.handRank.category),
          playerResult.handRank.description
        ));
      }
    }

    // Calculate amounts
    const amounts = new Map<PlayerId, number>();
    for (const playerResult of showdownResult.players) {
      if (playerResult.amountWon > 0) {
        amounts.set(playerResult.playerId, playerResult.amountWon);
      }
    }

    // Emit pot awarded
    this.eventEmitter.emit(createPotAwardedEvent(
      this.handState.handId,
      this.handState.tableId,
      showdownResult.winnerIds,
      amounts,
      potTotal,
      showdownResult.isSplitPot,
      showdownResult.winningHandDescription
    ));

    // Settle pot
    const settleResult = reduceSettlePot(
      this.handState,
      showdownResult.winnerIds,
      amounts,
      showdownResult.winningHandDescription
    );

    if (settleResult.success) {
      this.handState = settleResult.state;
    }

    // End hand
    this.endHand('showdown', showdownResult.winnerIds, amounts);
  }

  /**
   * Settle pot (for all-fold case)
   */
  private settlePot(): void {
    // This is called when someone wins without showdown
    this.handleAllFold();
  }

  /**
   * End hand
   */
  private endHand(
    reason: 'showdown' | 'all-fold' | 'all-in-runout',
    winnerIds: readonly PlayerId[],
    amounts: ReadonlyMap<PlayerId, number>
  ): void {
    if (!this.handState) return;

    const result = reduceEndHand(this.handState, reason);
    if (result.success) {
      this.handState = result.state;
    }

    // Build final stacks
    const finalStacks = new Map<PlayerId, number>();
    for (const player of this.handState.tableState.players) {
      finalStacks.set(player.id, player.stack);
    }

    // Update player configs with new stacks
    for (const [playerId, stack] of finalStacks) {
      const playerIndex = this.players.findIndex(p => p.id === playerId);
      if (playerIndex >= 0) {
        this.players[playerIndex] = { ...this.players[playerIndex], stack };
      }
    }

    // Emit hand ended
    this.eventEmitter.emit(createHandEndedEvent(
      this.handState.handId,
      this.handState.tableId,
      reason,
      winnerIds,
      finalStacks,
      Date.now() - this.handState.startTime
    ));

    // Advance dealer
    this.dealerIndex = (this.dealerIndex + 1) % this.players.length;
  }

  /**
   * Emit player to act event
   */
  private emitPlayerToAct(): void {
    if (!this.handState) return;

    const playerId = getCurrentPlayerId(this.handState);
    if (!playerId) return;

    const validActions = getValidActionsForCurrentPlayer(this.handState);
    const actions: string[] = [];

    if (validActions.canFold) actions.push('fold');
    if (validActions.canCheck) actions.push('check');
    if (validActions.canCall) actions.push('call');
    if (validActions.canBet) actions.push('bet');
    if (validActions.canRaise) actions.push('raise');
    actions.push('all-in'); // Always can go all-in if has chips

    this.eventEmitter.emit(createPlayerToActEvent(
      this.handState.handId,
      this.handState.tableId,
      playerId,
      actions,
      validActions.callAmount,
      validActions.minBet,
      validActions.minRaise
    ));
  }

  /**
   * Emit error event
   */
  private emitError(code: string, message: string): void {
    if (!this.handState) return;

    this.eventEmitter.emit(createErrorEvent(
      this.handState.handId,
      this.handState.tableId,
      code,
      message
    ));
  }

  // ==========================================================================
  // Query Methods
  // ==========================================================================

  /**
   * Get current hand state
   */
  getHandState(): HandState | null {
    return this.handState;
  }

  /**
   * Get current phase
   */
  getCurrentPhase(): HandPhase | null {
    return this.handState?.phase ?? null;
  }

  /**
   * Get current player to act
   */
  getCurrentPlayer(): PlayerId | null {
    if (!this.handState) return null;
    return getCurrentPlayerId(this.handState);
  }

  /**
   * Get valid actions for current player
   */
  getValidActions(): {
    canFold: boolean;
    canCheck: boolean;
    canCall: boolean;
    callAmount: number;
    canBet: boolean;
    minBet: number;
    maxBet: number;
    canRaise: boolean;
    minRaise: number;
    maxRaise: number;
  } | null {
    if (!this.handState) return null;
    return getValidActionsForCurrentPlayer(this.handState);
  }

  /**
   * Get pot total
   */
  getPot(): number {
    if (!this.handState) return 0;
    return getPotTotal(this.handState);
  }

  /**
   * Get community cards
   */
  getCommunityCards(): readonly Card[] {
    if (!this.handState) return [];
    return this.handState.tableState.communityCards;
  }

  /**
   * Check if hand is complete
   */
  isHandComplete(): boolean {
    return this.handState?.phase === 'COMPLETE';
  }

  /**
   * Get hand result (only available after hand is complete)
   */
  getHandResult(): HandResult | null {
    if (!this.handState || this.handState.phase !== 'COMPLETE') {
      return null;
    }

    const finalStacks = new Map<PlayerId, number>();
    for (const player of this.handState.tableState.players) {
      finalStacks.set(player.id, player.stack);
    }

    const winnerIds = this.handState.tableState.winners.map(
      idx => this.handState!.tableState.players[idx].id
    );

    // Calculate amounts from action history and final state
    const amounts = new Map<PlayerId, number>();
    for (const winnerId of winnerIds) {
      const player = this.handState.tableState.players.find(p => p.id === winnerId);
      if (player) {
        amounts.set(winnerId, this.handState.tableState.pot / winnerIds.length);
      }
    }

    return {
      handId: this.handState.handId,
      winnerIds,
      amounts,
      reason: 'showdown', // Simplified - could track actual reason
      finalStacks,
      events: this.eventEmitter.getHistory(),
      duration: Date.now() - this.handState.startTime,
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createTableEngine(config: TableEngineConfig): TableEngine {
  return new TableEngine(config);
}
