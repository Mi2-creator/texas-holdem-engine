/**
 * HandHistory.ts
 * Phase L9 - Hand history tracking for action log
 *
 * Records all events during a hand for display in the action log.
 * Read-only with respect to game logic.
 *
 * ARCHITECTURE NOTE (L9.5):
 * - This format is stable and versionable for future persistence/replay
 * - All events are immutable and ordered by timestamp
 * - Future hooks: serialize for save, deserialize for replay
 */

import { Card, formatCard } from '../engine/Card';
import { Street } from '../engine/TableState';
import { PlayerAction } from '../engine/BettingRound';

// ============================================================================
// Version (for future persistence/replay compatibility)
// ============================================================================

/** Current hand history format version. Increment on breaking changes. */
export const HAND_HISTORY_VERSION = 1;

// ============================================================================
// Event Types
// ============================================================================

export type HandHistoryEventType =
  | 'hand-start'
  | 'blinds-posted'
  | 'cards-dealt'
  | 'player-action'
  | 'community-cards'
  | 'showdown'
  | 'hand-result';

interface BaseHistoryEvent {
  readonly type: HandHistoryEventType;
  readonly timestamp: number;
}

export interface HandStartEvent extends BaseHistoryEvent {
  readonly type: 'hand-start';
  readonly handNumber: number;
  readonly dealerName: string;
}

export interface BlindsPostedEvent extends BaseHistoryEvent {
  readonly type: 'blinds-posted';
  readonly smallBlind: { playerName: string; amount: number };
  readonly bigBlind: { playerName: string; amount: number };
}

export interface CardsDealtEvent extends BaseHistoryEvent {
  readonly type: 'cards-dealt';
  readonly playerCount: number;
}

export interface PlayerActionEvent extends BaseHistoryEvent {
  readonly type: 'player-action';
  readonly street: Street;
  readonly playerName: string;
  readonly action: PlayerAction;
  readonly potAfter: number;
}

export interface CommunityCardsEvent extends BaseHistoryEvent {
  readonly type: 'community-cards';
  readonly street: 'flop' | 'turn' | 'river';
  readonly cards: readonly Card[];
  readonly allCommunityCards: readonly Card[];
}

export interface ShowdownEvent extends BaseHistoryEvent {
  readonly type: 'showdown';
  readonly players: readonly {
    readonly name: string;
    readonly holeCards: readonly Card[];
    readonly handDescription: string;
    readonly folded: boolean;
  }[];
}

export interface HandResultEvent extends BaseHistoryEvent {
  readonly type: 'hand-result';
  readonly winnerNames: readonly string[];
  readonly potAmount: number;
  readonly winningHand: string;
  readonly endedByFold: boolean;
}

export type HandHistoryEvent =
  | HandStartEvent
  | BlindsPostedEvent
  | CardsDealtEvent
  | PlayerActionEvent
  | CommunityCardsEvent
  | ShowdownEvent
  | HandResultEvent;

// ============================================================================
// Hand History Container
// ============================================================================

/**
 * Complete hand history for persistence/replay.
 *
 * FUTURE HOOKS (L9.5):
 * - Persistence: JSON.stringify(handHistory) for localStorage/backend save
 * - Replay: Parse and step through events[] to reconstruct hand
 * - Website: Export as hand history format (PokerStars-compatible)
 * - Multiplayer: Sync events across clients
 */
export interface HandHistory {
  /** Format version for compatibility checking */
  readonly version: number;
  readonly handNumber: number;
  readonly events: readonly HandHistoryEvent[];
}

/**
 * Create a hand history container from events
 */
export function createHandHistory(
  handNumber: number,
  events: readonly HandHistoryEvent[]
): HandHistory {
  return {
    version: HAND_HISTORY_VERSION,
    handNumber,
    events,
  };
}

// ============================================================================
// Formatting Functions
// ============================================================================

/**
 * Format a single card for display
 */
function formatCardForLog(card: Card): string {
  return formatCard(card);
}

/**
 * Format multiple cards for display
 */
function formatCardsForLog(cards: readonly Card[]): string {
  return cards.map(formatCardForLog).join(' ');
}

/**
 * Format a player action for display
 */
function formatActionForLog(action: PlayerAction): string {
  switch (action.type) {
    case 'fold': return 'folds';
    case 'check': return 'checks';
    case 'call': return 'calls';
    case 'bet': return `bets $${action.amount}`;
    case 'raise': return `raises to $${action.amount}`;
    case 'all-in': return 'goes ALL-IN';
    default: return action.type;
  }
}

/**
 * Format a hand history event as a log entry string
 */
export function formatHistoryEvent(event: HandHistoryEvent): string {
  switch (event.type) {
    case 'hand-start':
      return `--- Hand #${event.handNumber} ---`;

    case 'blinds-posted':
      return `Blinds: ${event.smallBlind.playerName} posts SB $${event.smallBlind.amount}, ${event.bigBlind.playerName} posts BB $${event.bigBlind.amount}`;

    case 'cards-dealt':
      return `Dealing hole cards to ${event.playerCount} players`;

    case 'player-action':
      return `${event.street.toUpperCase()}: ${event.playerName} ${formatActionForLog(event.action)} (Pot: $${event.potAfter})`;

    case 'community-cards':
      const streetLabel = event.street.charAt(0).toUpperCase() + event.street.slice(1);
      return `*** ${streetLabel} *** [${formatCardsForLog(event.cards)}]`;

    case 'showdown':
      const showdownLines = event.players
        .filter(p => !p.folded)
        .map(p => `${p.name} shows [${formatCardsForLog(p.holeCards)}] - ${p.handDescription}`)
        .join(' | ');
      return `Showdown: ${showdownLines}`;

    case 'hand-result':
      if (event.endedByFold) {
        return `*** ${event.winnerNames[0]} wins $${event.potAmount} (opponent folded) ***`;
      }
      return `*** ${event.winnerNames.join(', ')} wins $${event.potAmount} with ${event.winningHand} ***`;

    default:
      return '';
  }
}

/**
 * Get the visual style type for an event (for UI styling)
 */
export type EventStyleType = 'header' | 'info' | 'action' | 'cards' | 'result';

export function getEventStyleType(event: HandHistoryEvent): EventStyleType {
  switch (event.type) {
    case 'hand-start':
      return 'header';
    case 'blinds-posted':
    case 'cards-dealt':
      return 'info';
    case 'player-action':
      return 'action';
    case 'community-cards':
    case 'showdown':
      return 'cards';
    case 'hand-result':
      return 'result';
    default:
      return 'info';
  }
}
