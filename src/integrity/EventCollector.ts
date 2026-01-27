/**
 * EventCollector.ts
 * Phase 22 - Integrity event stream collector
 *
 * Captures all game events in an immutable, timestamped stream
 * for later analysis. This collector is non-invasive and has
 * no side effects on the game state.
 */

import { PlayerId } from '../security/Identity';
import { TableId, HandId } from '../security/AuditLog';
import { ClubId } from '../club/ClubTypes';
import { Street } from '../game/engine/TableState';
import {
  IntegrityEvent,
  IntegrityEventId,
  IntegrityEventType,
  IntegrityEventData,
  SessionId,
  PlayerActionData,
  HandEventData,
  StackChangeData,
  TableEventData,
  AuthorityEventData,
  generateIntegrityEventId,
  generateSessionId,
} from './IntegrityTypes';

// ============================================================================
// Event Stream
// ============================================================================

/**
 * Immutable event stream for a session
 */
export interface EventStream {
  readonly sessionId: SessionId;
  readonly clubId: ClubId;
  readonly tableId: TableId;
  readonly events: readonly IntegrityEvent[];
  readonly startedAt: number;
  readonly endedAt: number | null;
}

// ============================================================================
// EventCollector Implementation
// ============================================================================

export class EventCollector {
  private readonly streams: Map<SessionId, IntegrityEvent[]>;
  private readonly activeSession: Map<TableId, SessionId>;
  private readonly sessionMetadata: Map<SessionId, { clubId: ClubId; tableId: TableId; startedAt: number }>;

  constructor() {
    this.streams = new Map();
    this.activeSession = new Map();
    this.sessionMetadata = new Map();
  }

  // ==========================================================================
  // Session Management
  // ==========================================================================

  /**
   * Start a new integrity monitoring session for a table
   */
  startSession(clubId: ClubId, tableId: TableId): SessionId {
    const sessionId = generateSessionId();
    const now = Date.now();

    this.streams.set(sessionId, []);
    this.activeSession.set(tableId, sessionId);
    this.sessionMetadata.set(sessionId, { clubId, tableId, startedAt: now });

    return sessionId;
  }

  /**
   * End a session
   */
  endSession(tableId: TableId): EventStream | null {
    const sessionId = this.activeSession.get(tableId);
    if (!sessionId) {
      return null;
    }

    const events = this.streams.get(sessionId);
    const metadata = this.sessionMetadata.get(sessionId);
    if (!events || !metadata) {
      return null;
    }

    this.activeSession.delete(tableId);

    return {
      sessionId,
      clubId: metadata.clubId,
      tableId: metadata.tableId,
      events: [...events], // Return immutable copy
      startedAt: metadata.startedAt,
      endedAt: Date.now(),
    };
  }

  /**
   * Get the active session for a table
   */
  getActiveSession(tableId: TableId): SessionId | null {
    return this.activeSession.get(tableId) ?? null;
  }

  /**
   * Get event stream for a session
   */
  getEventStream(sessionId: SessionId): EventStream | null {
    const events = this.streams.get(sessionId);
    const metadata = this.sessionMetadata.get(sessionId);
    if (!events || !metadata) {
      return null;
    }

    return {
      sessionId,
      clubId: metadata.clubId,
      tableId: metadata.tableId,
      events: [...events],
      startedAt: metadata.startedAt,
      endedAt: this.activeSession.get(metadata.tableId) === sessionId ? null : Date.now(),
    };
  }

  // ==========================================================================
  // Event Recording
  // ==========================================================================

  /**
   * Record a player action
   */
  recordPlayerAction(
    tableId: TableId,
    handId: HandId,
    playerId: PlayerId,
    actionData: PlayerActionData,
    street: Street
  ): IntegrityEvent | null {
    return this.recordEvent(tableId, handId, playerId, `player_${actionData.actionType}` as IntegrityEventType, actionData, street);
  }

  /**
   * Record hand started
   */
  recordHandStarted(
    tableId: TableId,
    handId: HandId,
    players: readonly PlayerId[],
    positions: ReadonlyMap<PlayerId, number>,
    stacks: ReadonlyMap<PlayerId, number>,
    blinds: { small: number; big: number }
  ): IntegrityEvent | null {
    const data: HandEventData = {
      players,
      positions,
      stacks,
      blinds,
    };
    return this.recordEvent(tableId, handId, null, 'hand_started', data, 'preflop');
  }

  /**
   * Record hand completed
   */
  recordHandCompleted(
    tableId: TableId,
    handId: HandId,
    winners: readonly PlayerId[],
    potSize: number,
    finalStreet: Street
  ): IntegrityEvent | null {
    const data: HandEventData = {
      players: winners,
      positions: new Map(),
      stacks: new Map(),
      winners,
      potSize,
      finalStreet,
    };
    return this.recordEvent(tableId, handId, null, 'hand_completed', data, finalStreet);
  }

  /**
   * Record street change
   */
  recordStreetChange(
    tableId: TableId,
    handId: HandId,
    street: Street,
    potSize: number
  ): IntegrityEvent | null {
    const data: HandEventData = {
      players: [],
      positions: new Map(),
      stacks: new Map(),
      potSize,
    };
    return this.recordEvent(tableId, handId, null, 'street_changed', data, street);
  }

  /**
   * Record stack change (pot win/loss)
   */
  recordStackChange(
    tableId: TableId,
    handId: HandId | null,
    playerId: PlayerId,
    previousStack: number,
    newStack: number,
    reason: 'pot_win' | 'pot_loss' | 'rake' | 'buy_in' | 'cash_out',
    fromPlayers?: readonly PlayerId[]
  ): IntegrityEvent | null {
    const data: StackChangeData = {
      playerId,
      previousStack,
      newStack,
      changeAmount: newStack - previousStack,
      reason,
      fromPlayers,
    };
    return this.recordEvent(tableId, handId, playerId, 'stack_change', data, null);
  }

  /**
   * Record pot awarded
   */
  recordPotAwarded(
    tableId: TableId,
    handId: HandId,
    playerId: PlayerId,
    amount: number,
    contributors: readonly PlayerId[]
  ): IntegrityEvent | null {
    const data: StackChangeData = {
      playerId,
      previousStack: 0,
      newStack: amount,
      changeAmount: amount,
      reason: 'pot_win',
      fromPlayers: contributors,
    };
    return this.recordEvent(tableId, handId, playerId, 'pot_awarded', data, null);
  }

  /**
   * Record rake collected
   */
  recordRakeCollected(
    tableId: TableId,
    handId: HandId,
    amount: number
  ): IntegrityEvent | null {
    const data: StackChangeData = {
      playerId: 'rake' as PlayerId,
      previousStack: 0,
      newStack: amount,
      changeAmount: amount,
      reason: 'rake',
    };
    return this.recordEvent(tableId, handId, null, 'rake_collected', data, null);
  }

  /**
   * Record table paused
   */
  recordTablePaused(
    tableId: TableId,
    initiator: PlayerId,
    reason: string | undefined,
    handInProgress: boolean,
    potSize: number
  ): IntegrityEvent | null {
    const data: TableEventData = {
      initiator,
      reason,
    };
    // Also record as authority event if hand in progress
    if (handInProgress) {
      this.recordAuthorityIntervention(tableId, initiator, 'manager', 'pause_table', handInProgress, potSize);
    }
    return this.recordEvent(tableId, null, initiator, 'table_paused', data, null);
  }

  /**
   * Record table resumed
   */
  recordTableResumed(
    tableId: TableId,
    initiator: PlayerId
  ): IntegrityEvent | null {
    const data: TableEventData = {
      initiator,
    };
    return this.recordEvent(tableId, null, initiator, 'table_resumed', data, null);
  }

  /**
   * Record player kicked
   */
  recordPlayerKicked(
    tableId: TableId,
    initiator: PlayerId,
    targetPlayer: PlayerId,
    reason: string | undefined
  ): IntegrityEvent | null {
    const data: TableEventData = {
      initiator,
      targetPlayer,
      reason,
    };
    return this.recordEvent(tableId, null, targetPlayer, 'player_kicked', data, null);
  }

  /**
   * Record config changed
   */
  recordConfigChanged(
    tableId: TableId,
    initiator: PlayerId,
    changes: Record<string, unknown>
  ): IntegrityEvent | null {
    const data: TableEventData = {
      initiator,
      configChanges: changes,
    };
    return this.recordEvent(tableId, null, initiator, 'config_changed', data, null);
  }

  /**
   * Record authority intervention
   */
  recordAuthorityIntervention(
    tableId: TableId,
    authority: PlayerId,
    role: 'manager' | 'owner',
    action: string,
    handInProgress: boolean,
    potSize?: number,
    targetPlayer?: PlayerId
  ): IntegrityEvent | null {
    const data: AuthorityEventData = {
      role,
      action,
      targetPlayer,
      handInProgress,
      potSize,
    };
    const eventType = role === 'owner' ? 'owner_intervention' : 'manager_intervention';
    return this.recordEvent(tableId, null, authority, eventType, data, null);
  }

  // ==========================================================================
  // Query Operations
  // ==========================================================================

  /**
   * Get all events for a hand
   */
  getHandEvents(sessionId: SessionId, handId: HandId): readonly IntegrityEvent[] {
    const events = this.streams.get(sessionId);
    if (!events) {
      return [];
    }
    return events.filter(e => e.handId === handId);
  }

  /**
   * Get all events for a player
   */
  getPlayerEvents(sessionId: SessionId, playerId: PlayerId): readonly IntegrityEvent[] {
    const events = this.streams.get(sessionId);
    if (!events) {
      return [];
    }
    return events.filter(e => e.playerId === playerId);
  }

  /**
   * Get events by type
   */
  getEventsByType(sessionId: SessionId, type: IntegrityEventType): readonly IntegrityEvent[] {
    const events = this.streams.get(sessionId);
    if (!events) {
      return [];
    }
    return events.filter(e => e.type === type);
  }

  /**
   * Get events in time range
   */
  getEventsInRange(sessionId: SessionId, startTime: number, endTime: number): readonly IntegrityEvent[] {
    const events = this.streams.get(sessionId);
    if (!events) {
      return [];
    }
    return events.filter(e => e.timestamp >= startTime && e.timestamp <= endTime);
  }

  /**
   * Count events by type
   */
  countEventsByType(sessionId: SessionId): Map<IntegrityEventType, number> {
    const events = this.streams.get(sessionId);
    const counts = new Map<IntegrityEventType, number>();
    if (!events) {
      return counts;
    }

    for (const event of events) {
      counts.set(event.type, (counts.get(event.type) ?? 0) + 1);
    }
    return counts;
  }

  // ==========================================================================
  // Internal
  // ==========================================================================

  private recordEvent(
    tableId: TableId,
    handId: HandId | null,
    playerId: PlayerId | null,
    type: IntegrityEventType,
    data: IntegrityEventData,
    street: Street | null
  ): IntegrityEvent | null {
    const sessionId = this.activeSession.get(tableId);
    if (!sessionId) {
      return null;
    }

    const metadata = this.sessionMetadata.get(sessionId);
    if (!metadata) {
      return null;
    }

    const event: IntegrityEvent = {
      eventId: generateIntegrityEventId(),
      type,
      timestamp: Date.now(),
      clubId: metadata.clubId,
      tableId,
      handId,
      playerId,
      street,
      data,
    };

    const events = this.streams.get(sessionId);
    if (events) {
      events.push(event);
    }

    return event;
  }

  /**
   * Clear all state (for testing)
   */
  clear(): void {
    this.streams.clear();
    this.activeSession.clear();
    this.sessionMetadata.clear();
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let eventCollectorInstance: EventCollector | null = null;

export function getEventCollector(): EventCollector {
  if (!eventCollectorInstance) {
    eventCollectorInstance = new EventCollector();
  }
  return eventCollectorInstance;
}

export function resetEventCollector(): EventCollector {
  eventCollectorInstance = new EventCollector();
  return eventCollectorInstance;
}
