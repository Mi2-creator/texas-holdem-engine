/**
 * GameController.ts
 * Phase L2 - Orchestrates a complete Texas Hold'em hand
 *
 * Responsibilities:
 * 1. Initialize hand (shuffle, deal, post blinds)
 * 2. Run betting rounds (preflop → flop → turn → river)
 * 3. Handle showdown and winner determination
 * 4. Award pot and return hand summary
 *
 * Does NOT handle UI - pure game logic orchestration.
 */

import { Card, formatCard } from '../engine/Card';
import { Deck, createShuffledDeck, dealCards } from '../engine/Deck';
import { HandRank } from '../engine/HandRank';
import { evaluateHand, determineWinners } from '../engine/HandEvaluator';
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
  isBettingRoundComplete,
  isOnlyOnePlayerRemaining,
  setWinners,
} from '../engine/TableState';
import {
  PlayerAction,
  applyAction,
  postBlinds,
} from '../engine/BettingRound';
import { makeAIDecision, AIConfig, AI_STYLES } from './SimpleAI';

// ============================================================================
// Types
// ============================================================================

export interface GameConfig {
  readonly smallBlind: number;
  readonly bigBlind: number;
  readonly startingStack: number;
  readonly heroName: string;
  readonly aiName: string;
  readonly aiStyle: 'passive' | 'neutral' | 'aggressive';
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

// ============================================================================
// Default Config
// ============================================================================

const DEFAULT_CONFIG: GameConfig = {
  smallBlind: 5,
  bigBlind: 10,
  startingStack: 1000,
  heroName: 'Hero',
  aiName: 'Villain',
  aiStyle: 'neutral',
};

// ============================================================================
// GameController Class
// ============================================================================

export class GameController {
  private config: GameConfig;
  private state: TableState;
  private deck: Deck;
  private actionLog: ActionEvent[];
  private heroDecisionCallback: DecisionCallback | null;
  private onAction: ActionCallback | null;

  constructor(config: Partial<GameConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.deck = createShuffledDeck();
    this.actionLog = [];
    this.heroDecisionCallback = null;
    this.onAction = null;

    // Create initial players
    const hero = createPlayer('hero', this.config.heroName, this.config.startingStack, 0);
    const ai = createPlayer('ai', this.config.aiName, this.config.startingStack, 1);

    this.state = createTableState(
      [hero, ai],
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
   * Play a complete hand and return the result
   */
  async playHand(): Promise<HandResult> {
    // Reset for new hand
    this.startNewHand();

    // Deal hole cards
    this.dealHoleCards();

    // Post blinds
    this.state = postBlinds(this.state);

    // Move to preflop
    this.state = advanceStreet(this.state);

    // Run betting rounds
    await this.runBettingRound(); // Preflop

    if (!this.isHandOver()) {
      this.dealFlop();
      this.state = advanceStreet(this.state);
      await this.runBettingRound();
    }

    if (!this.isHandOver()) {
      this.dealTurn();
      this.state = advanceStreet(this.state);
      await this.runBettingRound();
    }

    if (!this.isHandOver()) {
      this.dealRiver();
      this.state = advanceStreet(this.state);
      await this.runBettingRound();
    }

    // Showdown or single winner
    return this.resolveHand();
  }

  /**
   * Play hand synchronously (for testing / AI vs AI)
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

  private async runBettingRound(): Promise<void> {
    while (!isBettingRoundComplete(this.state) && !this.isHandOver()) {
      const currentPlayer = getCurrentPlayer(this.state);
      if (!currentPlayer) break;

      const playerIndex = this.state.activePlayerIndex;
      let action: PlayerAction;

      if (currentPlayer.id === 'hero' && this.heroDecisionCallback) {
        // Wait for hero decision
        action = await this.heroDecisionCallback(this.state, playerIndex);
      } else {
        // AI decision
        action = this.getAIDecision();
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
    const aiConfig = AI_STYLES[this.config.aiStyle];
    return makeAIDecision(this.state, aiConfig);
  }

  private applyPlayerAction(playerIndex: number, action: PlayerAction): void {
    const player = this.state.players[playerIndex];
    const street = this.state.street;

    const result = applyAction(this.state, action);

    if (result.success) {
      this.state = result.newState;

      // Log the action
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

    if (endedByFold) {
      // Winner by fold
      const winner = activePlayers[0];
      winnerIndices = [this.state.players.findIndex(p => p.id === winner.id)];
      winningDescription = 'Opponent folded';
    } else {
      // Showdown
      const hands = activePlayers.map(p => {
        const allCards = [...p.holeCards, ...this.state.communityCards];
        return allCards;
      });

      const relativeWinners = determineWinners(hands);
      winnerIndices = relativeWinners.map(i => {
        const winner = activePlayers[i];
        return this.state.players.findIndex(p => p.id === winner.id);
      });

      // Get winning hand description
      const winnerCards = [...activePlayers[relativeWinners[0]].holeCards, ...this.state.communityCards];
      const winnerRank = evaluateHand(winnerCards);
      winningDescription = winnerRank.description;
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
   * Check if game can continue (both players have chips)
   */
  canContinue(): boolean {
    return this.state.players.every(p => p.stack > 0);
  }

  /**
   * Get action log for current hand
   */
  getActionLog(): readonly ActionEvent[] {
    return this.actionLog;
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
