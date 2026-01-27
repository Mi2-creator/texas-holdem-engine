/**
 * GameController.ts
 * Orchestrates a complete Texas Hold'em hand
 *
 * ARCHITECTURE (L9.5):
 * - Single source of truth: this.state (TableState)
 * - All state mutations go through this controller
 * - Callbacks (onAction, onThinking, onHistory) are notification-only
 * - UI receives read-only state snapshots
 *
 * Responsibilities:
 * 1. Initialize hand (shuffle, deal, post blinds)
 * 2. Run betting rounds (preflop → flop → turn → river)
 * 3. Handle showdown and winner determination
 * 4. Award pot and return hand summary
 *
 * FUTURE HOOKS (L9.5):
 * - Replay: Feed saved HandHistory events to reconstruct hand
 * - Persistence: Save getHandHistory() after each hand
 * - Multiplayer: Sync state via events instead of callbacks
 *
 * Does NOT handle UI - pure game logic orchestration.
 */

import { Card, formatCard } from '../engine/Card';
import { Deck, createShuffledDeck, dealCards } from '../engine/Deck';
import { HandRank } from '../engine/HandRank';
import { evaluateHand, determineWinners } from '../engine/HandEvaluator';
import {
  resolveShowdown,
  resolveShowdownWithEvents,
  ShowdownPlayer,
  ShowdownConfig,
  ShowdownEvent as CoreShowdownEvent,
  ShowdownResult,
  isShowdownNeeded,
  HandRankResult,
} from '../../core/game/hand';
import {
  TableState,
  Player,
  Street,
  createPlayer,
  createTableState,
  updatePlayer,
  advanceStreet,
  addCommunityCards,
  getActivePlayers,
  getActingPlayers,
  getCurrentPlayer,
  getNextActivePlayerIndex,
  getSmallBlindIndex,
  getBigBlindIndex,
  isBettingRoundComplete,
  isOnlyOnePlayerRemaining,
  setWinners,
} from '../engine/TableState';
import {
  PlayerAction,
  applyAction,
  postBlinds,
} from '../engine/BettingRound';
import { makeAIDecision, AIConfig } from './SimpleAI';
import { AI_PROFILES, AIProfileType } from './AIProfiles';
import {
  HandHistoryEvent,
  HandStartEvent,
  BlindsPostedEvent,
  CardsDealtEvent,
  PlayerActionEvent,
  CommunityCardsEvent,
  ShowdownEvent,
  HandResultEvent,
  ShowdownStartedHistoryEvent,
  HandEvaluatedHistoryEvent,
  PotAwardedHistoryEvent,
  HandCompletedHistoryEvent,
} from './HandHistory';

// ============================================================================
// Types
// ============================================================================

export interface AIPlayerConfig {
  readonly name: string;
  readonly profile: AIProfileType;
}

export interface GameConfig {
  readonly smallBlind: number;
  readonly bigBlind: number;
  readonly startingStack: number;
  readonly heroName: string;
  /** @deprecated Use aiPlayers instead for multi-player games */
  readonly aiName?: string;
  /** @deprecated Use aiPlayers instead for multi-player games */
  readonly aiStyle?: 'passive' | 'neutral' | 'aggressive';
  /** AI opponents configuration (for 3+ player games) */
  readonly aiPlayers?: readonly AIPlayerConfig[];
  /** Delay range for AI actions in ms [min, max]. Default: [400, 800] */
  readonly aiActionDelay?: readonly [number, number];
}

export interface PlayerHandResult {
  readonly playerId: string;
  readonly playerName: string;
  readonly holeCards: readonly Card[];
  readonly handRank?: HandRank;
  readonly folded: boolean;
}

export interface HandResult {
  readonly handNumber: number;
  readonly winners: readonly string[]; // Player IDs
  readonly winnerNames: readonly string[];
  readonly winningHandDescription: string;
  readonly potSize: number;
  readonly board: readonly Card[];
  readonly players: readonly PlayerHandResult[];
  readonly endedByFold: boolean;
  readonly finalStreet: Street;
}

export interface ActionEvent {
  readonly street: Street;
  readonly playerIndex: number;
  readonly playerName: string;
  readonly action: PlayerAction;
  readonly potAfter: number;
}

export type ActionCallback = (event: ActionEvent) => void;
export type DecisionCallback = (state: TableState, playerIndex: number) => Promise<PlayerAction>;
/** Called when a player starts "thinking" (before their action) */
export type ThinkingCallback = (playerIndex: number, isThinking: boolean) => void;
/** Called when a hand history event occurs */
export type HistoryCallback = (event: HandHistoryEvent) => void;

// ============================================================================
// Default Config
// ============================================================================

const DEFAULT_CONFIG: GameConfig = {
  smallBlind: 5,
  bigBlind: 10,
  startingStack: 1000,
  heroName: 'Hero',
  // Default: 2 AI opponents for 3-player game
  aiPlayers: [
    { name: 'Alice', profile: 'tag' },
    { name: 'Bob', profile: 'calling-station' },
  ],
};

// ============================================================================
// GameController Class
// ============================================================================

export class GameController {
  private config: GameConfig;
  private state: TableState;
  private deck: Deck;
  private actionLog: ActionEvent[];
  private handHistory: HandHistoryEvent[];
  private heroDecisionCallback: DecisionCallback | null;
  private onAction: ActionCallback | null;
  private onThinking: ThinkingCallback | null;
  private onHistory: HistoryCallback | null;
  /** Maps player ID to their AI profile type */
  private aiProfileMap: Map<string, AIProfileType>;

  constructor(config: Partial<GameConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.deck = createShuffledDeck();
    this.actionLog = [];
    this.handHistory = [];
    this.heroDecisionCallback = null;
    this.onAction = null;
    this.onThinking = null;
    this.onHistory = null;
    this.aiProfileMap = new Map();

    // Create players
    const players: Player[] = [];

    // Hero is always seat 0
    const hero = createPlayer('hero', this.config.heroName, this.config.startingStack, 0);
    players.push(hero);

    // Add AI players
    const aiPlayers = this.config.aiPlayers ?? [
      // Fallback for legacy 2-player config
      { name: this.config.aiName ?? 'Villain', profile: 'tag' as AIProfileType }
    ];

    aiPlayers.forEach((aiConfig, index) => {
      const playerId = `ai-${index + 1}`;
      const seat = index + 1;
      const aiPlayer = createPlayer(playerId, aiConfig.name, this.config.startingStack, seat);
      players.push(aiPlayer);
      this.aiProfileMap.set(playerId, aiConfig.profile);
    });

    this.state = createTableState(
      players,
      this.config.smallBlind,
      this.config.bigBlind
    );
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Get current game state (read-only)
   */
  getState(): TableState {
    return this.state;
  }

  /**
   * Set callback for hero decisions
   */
  setHeroDecisionCallback(callback: DecisionCallback): void {
    this.heroDecisionCallback = callback;
  }

  /**
   * Set callback for action events
   */
  setActionCallback(callback: ActionCallback): void {
    this.onAction = callback;
  }

  /**
   * Set callback for player thinking state (AI deliberation)
   */
  setThinkingCallback(callback: ThinkingCallback): void {
    this.onThinking = callback;
  }

  /**
   * Set callback for hand history events
   */
  setHistoryCallback(callback: HistoryCallback): void {
    this.onHistory = callback;
  }

  /**
   * Add a history event and notify callback
   */
  private addHistoryEvent(event: HandHistoryEvent): void {
    this.handHistory.push(event);
    if (this.onHistory) {
      this.onHistory(event);
    }
  }

  /**
   * Play a complete hand and return the result
   */
  async playHand(): Promise<HandResult> {
    // Reset for new hand
    this.startNewHand();

    // Log hand start
    const dealer = this.state.players[this.state.dealerIndex];
    this.addHistoryEvent({
      type: 'hand-start',
      timestamp: Date.now(),
      handNumber: this.state.handNumber + 1,
      dealerName: dealer.name,
    });

    // Deal hole cards
    this.dealHoleCards();

    // Log cards dealt
    const activeCount = this.state.players.filter(p => p.status !== 'out').length;
    this.addHistoryEvent({
      type: 'cards-dealt',
      timestamp: Date.now(),
      playerCount: activeCount,
    });

    // Post blinds
    this.state = postBlinds(this.state);

    // Log blinds
    const sbIndex = getSmallBlindIndex(this.state);
    const bbIndex = getBigBlindIndex(this.state);
    this.addHistoryEvent({
      type: 'blinds-posted',
      timestamp: Date.now(),
      smallBlind: {
        playerName: this.state.players[sbIndex].name,
        amount: this.config.smallBlind,
      },
      bigBlind: {
        playerName: this.state.players[bbIndex].name,
        amount: this.config.bigBlind,
      },
    });

    // Move to preflop
    this.state = advanceStreet(this.state);

    // Run betting rounds
    await this.runBettingRound(); // Preflop

    if (!this.isHandOver()) {
      this.dealFlop();
      this.logCommunityCards('flop', this.state.communityCards.slice(0, 3));
      this.state = advanceStreet(this.state);
      await this.runBettingRound();
    }

    if (!this.isHandOver()) {
      this.dealTurn();
      this.logCommunityCards('turn', this.state.communityCards.slice(3, 4));
      this.state = advanceStreet(this.state);
      await this.runBettingRound();
    }

    if (!this.isHandOver()) {
      this.dealRiver();
      this.logCommunityCards('river', this.state.communityCards.slice(4, 5));
      this.state = advanceStreet(this.state);
      await this.runBettingRound();
    }

    // Showdown or single winner
    return this.resolveHand();
  }

  /**
   * Log community cards event
   */
  private logCommunityCards(street: 'flop' | 'turn' | 'river', newCards: readonly Card[]): void {
    this.addHistoryEvent({
      type: 'community-cards',
      timestamp: Date.now(),
      street,
      cards: newCards,
      allCommunityCards: this.state.communityCards,
    });
  }

  /**
   * Play hand synchronously (for testing / AI vs AI)
   *
   * NOTE (L9.5): This method does NOT log HandHistory events.
   * Use playHand() for full history tracking. This is intentional
   * to keep sync testing fast and simple.
   */
  playHandSync(): HandResult {
    // Reset for new hand
    this.startNewHand();

    // Deal hole cards
    this.dealHoleCards();

    // Post blinds
    this.state = postBlinds(this.state);

    // Move to preflop
    this.state = advanceStreet(this.state);

    // Run betting rounds
    this.runBettingRoundSync(); // Preflop

    if (!this.isHandOver()) {
      this.dealFlop();
      this.state = advanceStreet(this.state);
      this.runBettingRoundSync();
    }

    if (!this.isHandOver()) {
      this.dealTurn();
      this.state = advanceStreet(this.state);
      this.runBettingRoundSync();
    }

    if (!this.isHandOver()) {
      this.dealRiver();
      this.state = advanceStreet(this.state);
      this.runBettingRoundSync();
    }

    // Showdown or single winner
    return this.resolveHand();
  }

  // ============================================================================
  // Hand Initialization
  // ============================================================================

  private startNewHand(): void {
    // Create fresh shuffled deck
    this.deck = createShuffledDeck();
    this.actionLog = [];
    this.handHistory = [];

    // Reset players for new hand
    const newPlayers = this.state.players.map((p, i) => ({
      ...p,
      holeCards: [] as readonly Card[],
      status: p.stack > 0 ? 'active' as const : 'out' as const,
      currentBet: 0,
      totalBetThisHand: 0,
      isDealer: i === this.state.dealerIndex,
    }));

    this.state = {
      ...this.state,
      players: newPlayers,
      street: 'waiting',
      communityCards: [],
      pot: 0,
      currentBet: 0,
      activePlayerIndex: 0,
      minRaise: this.config.bigBlind,
      lastRaiserIndex: -1,
      actionsThisRound: 0,
      winners: [],
      winningHandDescription: '',
    };
  }

  private dealHoleCards(): void {
    for (let i = 0; i < this.state.players.length; i++) {
      if (this.state.players[i].status !== 'out') {
        const [cards, newDeck] = dealCards(this.deck, 2);
        this.deck = newDeck;
        this.state = updatePlayer(this.state, i, { holeCards: cards });
      }
    }
  }

  private dealFlop(): void {
    // Burn one card
    const [, deckAfterBurn] = dealCards(this.deck, 1);
    this.deck = deckAfterBurn;

    // Deal 3 community cards
    const [flopCards, deckAfterFlop] = dealCards(this.deck, 3);
    this.deck = deckAfterFlop;
    this.state = addCommunityCards(this.state, flopCards);
  }

  private dealTurn(): void {
    // Burn one card
    const [, deckAfterBurn] = dealCards(this.deck, 1);
    this.deck = deckAfterBurn;

    // Deal 1 community card
    const [turnCard, deckAfterTurn] = dealCards(this.deck, 1);
    this.deck = deckAfterTurn;
    this.state = addCommunityCards(this.state, turnCard);
  }

  private dealRiver(): void {
    // Burn one card
    const [, deckAfterBurn] = dealCards(this.deck, 1);
    this.deck = deckAfterBurn;

    // Deal 1 community card
    const [riverCard, deckAfterRiver] = dealCards(this.deck, 1);
    this.deck = deckAfterRiver;
    this.state = addCommunityCards(this.state, riverCard);
  }

  // ============================================================================
  // Betting Round Management
  // ============================================================================

  /**
   * Get a random delay within the configured AI action delay range
   */
  private getAIDelay(): number {
    const [min, max] = this.config.aiActionDelay ?? [400, 800];
    return min + Math.random() * (max - min);
  }

  /**
   * Wait for specified milliseconds
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async runBettingRound(): Promise<void> {
    while (!isBettingRoundComplete(this.state) && !this.isHandOver()) {
      const currentPlayer = getCurrentPlayer(this.state);
      if (!currentPlayer) break;

      const playerIndex = this.state.activePlayerIndex;
      let action: PlayerAction;

      if (currentPlayer.id === 'hero' && this.heroDecisionCallback) {
        // Wait for hero decision (no thinking indicator for human)
        action = await this.heroDecisionCallback(this.state, playerIndex);
      } else {
        // AI decision with thinking delay
        // Notify UI that AI is thinking
        if (this.onThinking) {
          this.onThinking(playerIndex, true);
        }

        // Simulate thinking time
        await this.delay(this.getAIDelay());

        // Get the AI decision
        action = this.getAIDecision();

        // Notify UI that AI finished thinking
        if (this.onThinking) {
          this.onThinking(playerIndex, false);
        }
      }

      this.applyPlayerAction(playerIndex, action);
    }
  }

  private runBettingRoundSync(): void {
    while (!isBettingRoundComplete(this.state) && !this.isHandOver()) {
      const currentPlayer = getCurrentPlayer(this.state);
      if (!currentPlayer) break;

      const playerIndex = this.state.activePlayerIndex;

      // For sync mode, both players use AI logic
      const action = this.getAIDecision();
      this.applyPlayerAction(playerIndex, action);
    }
  }

  private getAIDecision(): PlayerAction {
    const currentPlayer = getCurrentPlayer(this.state);
    if (!currentPlayer) {
      return { type: 'fold' };
    }

    // Get the AI profile for this player
    const profileType = this.aiProfileMap.get(currentPlayer.id);
    if (!profileType) {
      // Fallback to TAG if profile not found
      return makeAIDecision(this.state, AI_PROFILES['tag']);
    }

    const profile = AI_PROFILES[profileType];
    return makeAIDecision(this.state, profile);
  }

  private applyPlayerAction(playerIndex: number, action: PlayerAction): void {
    const player = this.state.players[playerIndex];
    const street = this.state.street;

    const result = applyAction(this.state, action);

    if (result.success) {
      this.state = result.newState;

      // Log the action (legacy)
      const event: ActionEvent = {
        street,
        playerIndex,
        playerName: player.name,
        action,
        potAfter: this.state.pot,
      };
      this.actionLog.push(event);

      // Notify callback
      if (this.onAction) {
        this.onAction(event);
      }

      // Add to hand history
      this.addHistoryEvent({
        type: 'player-action',
        timestamp: Date.now(),
        street,
        playerName: player.name,
        action,
        potAfter: this.state.pot,
      });
    }
  }

  // ============================================================================
  // Hand Resolution
  // ============================================================================

  private isHandOver(): boolean {
    return isOnlyOnePlayerRemaining(this.state);
  }

  private resolveHand(): HandResult {
    const activePlayers = getActivePlayers(this.state);
    const endedByFold = activePlayers.length === 1;

    let winnerIndices: number[];
    let winningDescription: string;
    let showdownResult: ShowdownResult | null = null;

    if (endedByFold) {
      // Winner by fold
      const winner = activePlayers[0];
      winnerIndices = [this.state.players.findIndex(p => p.id === winner.id)];
      winningDescription = 'Opponent folded';
    } else {
      // Showdown - use new showdown system
      const showdownPlayers: ShowdownPlayer[] = this.state.players.map(p => ({
        id: p.id,
        name: p.name,
        holeCards: p.holeCards,
        folded: p.status === 'folded',
      }));

      const showdownConfig: ShowdownConfig = {
        players: showdownPlayers,
        communityCards: this.state.communityCards,
        potSize: this.state.pot,
      };

      // Resolve showdown with event emission
      showdownResult = resolveShowdownWithEvents(showdownConfig, (event: CoreShowdownEvent) => {
        this.handleShowdownEvent(event);
      });

      winnerIndices = showdownResult.winnerIds.map(id =>
        this.state.players.findIndex(p => p.id === id)
      );
      winningDescription = showdownResult.winningHandDescription;
    }

    // Award pot to winner(s)
    const potPerWinner = Math.floor(this.state.pot / winnerIndices.length);
    for (const winnerIndex of winnerIndices) {
      const winner = this.state.players[winnerIndex];
      this.state = updatePlayer(this.state, winnerIndex, {
        stack: winner.stack + potPerWinner,
      });
    }

    // Set winners in state
    this.state = setWinners(this.state, winnerIndices, winningDescription);

    // Build result
    const winnerIds = winnerIndices.map(i => this.state.players[i].id);
    const winnerNames = winnerIndices.map(i => this.state.players[i].name);

    const playerResults: PlayerHandResult[] = this.state.players.map(p => {
      const folded = p.status === 'folded';
      let handRank: HandRank | undefined;

      if (!folded && this.state.communityCards.length === 5) {
        const allCards = [...p.holeCards, ...this.state.communityCards];
        handRank = evaluateHand(allCards);
      }

      return {
        playerId: p.id,
        playerName: p.name,
        holeCards: p.holeCards,
        handRank,
        folded,
      };
    });

    // Log legacy showdown event if applicable (for backwards compatibility)
    if (!endedByFold && this.state.communityCards.length === 5) {
      this.addHistoryEvent({
        type: 'showdown',
        timestamp: Date.now(),
        players: playerResults.map(pr => ({
          name: pr.playerName,
          holeCards: pr.holeCards,
          handDescription: pr.handRank?.description ?? 'Unknown',
          folded: pr.folded,
        })),
      });
    }

    // Log hand result (legacy event)
    this.addHistoryEvent({
      type: 'hand-result',
      timestamp: Date.now(),
      winnerNames,
      potAmount: this.state.pot,
      winningHand: winningDescription,
      endedByFold,
    });

    // Log hand completed (new Phase 11 event)
    this.addHistoryEvent({
      type: 'hand-completed',
      timestamp: Date.now(),
      winnerIds,
      winnerNames,
      potAwarded: this.state.pot,
      isSplitPot: showdownResult?.isSplitPot ?? false,
      winningHandDescription: winningDescription,
      endedByFold,
    });

    return {
      handNumber: this.state.handNumber,
      winners: winnerIds,
      winnerNames,
      winningHandDescription: winningDescription,
      potSize: this.state.pot,
      board: this.state.communityCards,
      players: playerResults,
      endedByFold,
      finalStreet: this.state.street,
    };
  }

  /**
   * Handle showdown events from the showdown resolver
   */
  private handleShowdownEvent(event: CoreShowdownEvent): void {
    switch (event.type) {
      case 'showdown-started':
        this.addHistoryEvent({
          type: 'showdown-started',
          timestamp: Date.now(),
          playerCount: event.playerCount,
          potSize: event.potSize,
        });
        break;

      case 'hand-evaluated':
        this.addHistoryEvent({
          type: 'hand-evaluated',
          timestamp: Date.now(),
          playerId: event.playerId,
          playerName: event.playerName,
          holeCards: event.holeCards,
          handRank: event.handRank,
        });
        break;

      case 'pot-awarded':
        this.addHistoryEvent({
          type: 'pot-awarded',
          timestamp: Date.now(),
          winnerIds: event.winnerIds,
          winnerNames: event.winnerNames,
          potAmount: event.potAmount,
          amountPerWinner: event.amountPerWinner,
          isSplitPot: event.isSplitPot,
          winningHandDescription: event.winningHandDescription,
        });
        break;

      case 'hand-completed':
        // This is emitted by resolveShowdownWithEvents but we emit our own
        // hand-completed event with more context, so we skip this one
        break;
    }
  }

  // ============================================================================
  // State Management for Multi-Hand Sessions
  // ============================================================================

  /**
   * Rotate dealer and prepare for next hand
   */
  rotateDealer(): void {
    const newDealerIndex = (this.state.dealerIndex + 1) % this.state.players.length;

    const newPlayers = this.state.players.map((p, i) => ({
      ...p,
      isDealer: i === newDealerIndex,
    }));

    this.state = {
      ...this.state,
      players: newPlayers,
      dealerIndex: newDealerIndex,
      handNumber: this.state.handNumber + 1,
    };
  }

  /**
   * Check if game can continue (at least 2 players have chips)
   */
  canContinue(): boolean {
    const playersWithChips = this.state.players.filter(p => p.stack > 0);
    return playersWithChips.length >= 2;
  }

  /**
   * Get action log for current hand
   */
  getActionLog(): readonly ActionEvent[] {
    return this.actionLog;
  }

  /**
   * Get full hand history for current hand
   *
   * FUTURE HOOK (L9.5): Use for persistence/replay
   * - Save: JSON.stringify(createHandHistory(handNumber, getHandHistory()))
   * - Replay: Parse and step through events to reconstruct
   */
  getHandHistory(): readonly HandHistoryEvent[] {
    return this.handHistory;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new game controller with default config
 */
export function createGameController(config?: Partial<GameConfig>): GameController {
  return new GameController(config);
}
