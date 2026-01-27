/**
 * Showdown.ts
 * Phase 11 - Showdown resolution
 *
 * Handles showdown flow:
 * - Determines winner(s)
 * - Awards pot
 * - Supports split pot (50/50 for heads-up)
 * - Emits showdown events
 */

import {
  Card,
  HandRankResult,
  ShowdownHand,
  ShowdownPlayerResult,
  ShowdownResult,
  ShowdownError,
} from './HandTypes';
import { evaluateHand, compareHandRanks } from './HandEvaluator';
import { determineWinners, HandForComparison } from './HandCompare';

// ============================================================================
// Types
// ============================================================================

/**
 * Player state for showdown input
 */
export interface ShowdownPlayer {
  readonly id: string;
  readonly name: string;
  readonly holeCards: readonly Card[];
  readonly folded: boolean;
}

/**
 * Showdown configuration
 */
export interface ShowdownConfig {
  readonly players: readonly ShowdownPlayer[];
  readonly communityCards: readonly Card[];
  readonly potSize: number;
}

// ============================================================================
// Showdown Events
// ============================================================================

/**
 * Event emitted when showdown starts
 */
export interface ShowdownStartedEvent {
  readonly type: 'showdown-started';
  readonly playerCount: number;
  readonly potSize: number;
}

/**
 * Event emitted when a hand is evaluated
 */
export interface HandEvaluatedEvent {
  readonly type: 'hand-evaluated';
  readonly playerId: string;
  readonly playerName: string;
  readonly holeCards: readonly Card[];
  readonly handRank: HandRankResult;
}

/**
 * Event emitted when pot is awarded
 */
export interface PotAwardedEvent {
  readonly type: 'pot-awarded';
  readonly winnerIds: readonly string[];
  readonly winnerNames: readonly string[];
  readonly potAmount: number;
  readonly amountPerWinner: number;
  readonly isSplitPot: boolean;
  readonly winningHandDescription: string;
}

/**
 * Event emitted when hand is complete
 */
export interface HandCompletedEvent {
  readonly type: 'hand-completed';
  readonly result: ShowdownResult;
}

export type ShowdownEvent =
  | ShowdownStartedEvent
  | HandEvaluatedEvent
  | PotAwardedEvent
  | HandCompletedEvent;

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate showdown configuration
 * Throws synchronously on illegal state
 */
function validateShowdownConfig(config: ShowdownConfig): void {
  const { players, communityCards, potSize } = config;

  // Must have at least one player
  if (players.length === 0) {
    throw new ShowdownError('No players for showdown');
  }

  // Must have exactly 5 community cards for showdown
  if (communityCards.length !== 5) {
    throw new ShowdownError(
      `Showdown requires 5 community cards, got ${communityCards.length}`
    );
  }

  // Pot must be positive
  if (potSize <= 0) {
    throw new ShowdownError(`Pot size must be positive, got ${potSize}`);
  }

  // All non-folded players must have exactly 2 hole cards
  for (const player of players) {
    if (!player.folded && player.holeCards.length !== 2) {
      throw new ShowdownError(
        `Player ${player.name} must have 2 hole cards, got ${player.holeCards.length}`
      );
    }
  }

  // At least one player must not be folded
  const activePlayers = players.filter(p => !p.folded);
  if (activePlayers.length === 0) {
    throw new ShowdownError('All players have folded');
  }
}

// ============================================================================
// Main Showdown Logic
// ============================================================================

/**
 * Resolve showdown and determine winner(s)
 *
 * @param config Showdown configuration
 * @returns ShowdownResult with all player results and winners
 * @throws ShowdownError on illegal state
 */
export function resolveShowdown(config: ShowdownConfig): ShowdownResult {
  // Validate synchronously - throws on error
  validateShowdownConfig(config);

  const { players, communityCards, potSize } = config;

  // Get active (non-folded) players
  const activePlayers = players.filter(p => !p.folded);

  // If only one player remaining (everyone else folded), they win
  if (activePlayers.length === 1) {
    const winner = activePlayers[0];
    const playerResults: ShowdownPlayerResult[] = players.map(p => ({
      playerId: p.id,
      playerName: p.name,
      holeCards: p.holeCards,
      handRank: p.folded ? null : evaluateHand([...p.holeCards, ...communityCards]),
      folded: p.folded,
      isWinner: p.id === winner.id,
      amountWon: p.id === winner.id ? potSize : 0,
    }));

    return {
      players: playerResults,
      winnerIds: [winner.id],
      winningHandDescription: 'Opponent folded',
      potAwarded: potSize,
      isSplitPot: false,
    };
  }

  // Evaluate all active hands
  const hands: HandForComparison[] = activePlayers.map(p => ({
    playerId: p.id,
    cards: [...p.holeCards, ...communityCards],
  }));

  // Determine winners
  const { winnerIds, bestHandRank, isTie } = determineWinners(hands);

  // Calculate pot distribution
  const amountPerWinner = Math.floor(potSize / winnerIds.length);

  // Build player results
  const playerResults: ShowdownPlayerResult[] = players.map(p => {
    const isWinner = winnerIds.includes(p.id);
    return {
      playerId: p.id,
      playerName: p.name,
      holeCards: p.holeCards,
      handRank: p.folded ? null : evaluateHand([...p.holeCards, ...communityCards]),
      folded: p.folded,
      isWinner,
      amountWon: isWinner ? amountPerWinner : 0,
    };
  });

  return {
    players: playerResults,
    winnerIds,
    winningHandDescription: bestHandRank.description,
    potAwarded: potSize,
    isSplitPot: isTie,
  };
}

/**
 * Resolve showdown with event emission
 *
 * @param config Showdown configuration
 * @param onEvent Callback for each showdown event
 * @returns ShowdownResult
 */
export function resolveShowdownWithEvents(
  config: ShowdownConfig,
  onEvent: (event: ShowdownEvent) => void
): ShowdownResult {
  // Validate synchronously
  validateShowdownConfig(config);

  const { players, communityCards, potSize } = config;
  const activePlayers = players.filter(p => !p.folded);

  // Emit ShowdownStarted
  onEvent({
    type: 'showdown-started',
    playerCount: activePlayers.length,
    potSize,
  });

  // Evaluate and emit HandEvaluated for each active player
  const evaluatedHands: Map<string, HandRankResult> = new Map();
  for (const player of activePlayers) {
    const handRank = evaluateHand([...player.holeCards, ...communityCards]);
    evaluatedHands.set(player.id, handRank);

    onEvent({
      type: 'hand-evaluated',
      playerId: player.id,
      playerName: player.name,
      holeCards: player.holeCards,
      handRank,
    });
  }

  // Determine winners
  const result = resolveShowdown(config);

  // Get winner names
  const winnerNames = result.winnerIds.map(id => {
    const player = players.find(p => p.id === id);
    return player?.name ?? 'Unknown';
  });

  // Emit PotAwarded
  onEvent({
    type: 'pot-awarded',
    winnerIds: result.winnerIds,
    winnerNames,
    potAmount: potSize,
    amountPerWinner: Math.floor(potSize / result.winnerIds.length),
    isSplitPot: result.isSplitPot,
    winningHandDescription: result.winningHandDescription,
  });

  // Emit HandCompleted
  onEvent({
    type: 'hand-completed',
    result,
  });

  return result;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if showdown is needed (more than one active player)
 */
export function isShowdownNeeded(players: readonly ShowdownPlayer[]): boolean {
  const activePlayers = players.filter(p => !p.folded);
  return activePlayers.length > 1;
}

/**
 * Get active players for showdown
 */
export function getShowdownPlayers(
  players: readonly ShowdownPlayer[]
): readonly ShowdownPlayer[] {
  return players.filter(p => !p.folded);
}

/**
 * Calculate pot split for n winners
 */
export function calculatePotSplit(
  potSize: number,
  numWinners: number
): { amountPerWinner: number; remainder: number } {
  if (numWinners <= 0) {
    throw new ShowdownError('Must have at least one winner');
  }
  const amountPerWinner = Math.floor(potSize / numWinners);
  const remainder = potSize - amountPerWinner * numWinners;
  return { amountPerWinner, remainder };
}
