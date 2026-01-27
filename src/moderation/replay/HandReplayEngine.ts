/**
 * HandReplayEngine.ts
 * Phase 23 - Hand replay reconstruction from event streams
 *
 * Provides:
 * - Full hand reconstruction from integrity events
 * - Step-by-step action playback
 * - Stack, pot, and state diffs per step
 * - Guaranteed replay determinism via checksums
 */

import { PlayerId } from '../../security/Identity';
import { TableId, HandId } from '../../security/AuditLog';
import { ClubId } from '../../club/ClubTypes';
import { Street } from '../../game/engine/TableState';
import {
  IntegrityEvent,
  SessionId,
  PlayerActionData,
  HandEventData,
  StackChangeData,
} from '../../integrity/IntegrityTypes';
import { EventStream } from '../../integrity/EventCollector';
import {
  HandReplay,
  ReplayStep,
  ReplayState,
  ReplayAction,
  ReplayStateDiff,
  ReplayPlayerState,
  ReplayPotState,
  ReplayBoardState,
  Checksum,
  calculateChecksum,
} from '../ModerationTypes';

// ============================================================================
// HandReplayEngine Implementation
// ============================================================================

export class HandReplayEngine {
  /**
   * Reconstruct a complete hand replay from event stream
   */
  reconstructHand(stream: EventStream, handId: HandId): HandReplay | null {
    // Get all events for this hand
    const handEvents = stream.events.filter(e => e.handId === handId);
    if (handEvents.length === 0) {
      return null;
    }

    // Sort events by timestamp
    const sortedEvents = [...handEvents].sort((a, b) => a.timestamp - b.timestamp);

    // Find hand start event
    const startEvent = sortedEvents.find(e => e.type === 'hand_started');
    if (!startEvent) {
      return null;
    }

    // Extract initial state from hand start event
    const startData = startEvent.data as HandEventData;
    const initialState = this.createInitialState(startEvent, startData);

    // Build replay steps
    const steps: ReplayStep[] = [];
    let currentState = initialState;

    // Add initial state as step 0
    steps.push({
      index: 0,
      state: currentState,
      action: null,
      diff: null,
      sourceEvent: startEvent,
    });

    // Process each action event
    let stepIndex = 1;
    for (const event of sortedEvents) {
      if (event.type === 'hand_started') continue;
      if (event.type === 'hand_completed') {
        // Mark hand complete
        currentState = {
          ...currentState,
          isComplete: true,
        };
        continue;
      }

      // Process action events
      if (event.type.startsWith('player_')) {
        const { nextState, action, diff } = this.processActionEvent(
          currentState,
          event,
          stepIndex
        );

        steps.push({
          index: stepIndex,
          state: nextState,
          action,
          diff,
          sourceEvent: event,
        });

        currentState = nextState;
        stepIndex++;
      }

      // Process street changes
      if (event.type === 'street_changed') {
        const { nextState, diff } = this.processStreetChange(
          currentState,
          event,
          stepIndex
        );

        steps.push({
          index: stepIndex,
          state: nextState,
          action: null,
          diff,
          sourceEvent: event,
        });

        currentState = nextState;
        stepIndex++;
      }

      // Process pot awards
      if (event.type === 'pot_awarded') {
        const { nextState, diff } = this.processPotAward(
          currentState,
          event,
          stepIndex
        );

        steps.push({
          index: stepIndex,
          state: nextState,
          action: null,
          diff,
          sourceEvent: event,
        });

        currentState = nextState;
        stepIndex++;
      }
    }

    // Find hand completion for winners
    const completionEvent = sortedEvents.find(e => e.type === 'hand_completed');
    const completionData = completionEvent?.data as HandEventData | undefined;
    const winners = completionData?.winners ?? [];
    const totalPotAwarded = completionData?.potSize ?? 0;

    // Calculate duration
    const firstTimestamp = sortedEvents[0].timestamp;
    const lastTimestamp = sortedEvents[sortedEvents.length - 1].timestamp;
    const duration = lastTimestamp - firstTimestamp;

    // Calculate checksum for determinism verification
    const replayData = JSON.stringify({
      handId,
      steps: steps.map(s => ({
        index: s.index,
        action: s.action,
        stateHash: this.hashState(s.state),
      })),
    });
    const checksum = calculateChecksum(replayData);

    return {
      handId,
      tableId: stream.tableId,
      clubId: stream.clubId,
      sessionId: stream.sessionId,
      steps,
      initialState,
      finalState: currentState,
      winners: winners as PlayerId[],
      totalPotAwarded,
      duration,
      checksum,
    };
  }

  /**
   * Get a specific step from a replay
   */
  getStep(replay: HandReplay, stepIndex: number): ReplayStep | null {
    if (stepIndex < 0 || stepIndex >= replay.steps.length) {
      return null;
    }
    return replay.steps[stepIndex];
  }

  /**
   * Get state at a specific step
   */
  getStateAtStep(replay: HandReplay, stepIndex: number): ReplayState | null {
    const step = this.getStep(replay, stepIndex);
    return step?.state ?? null;
  }

  /**
   * Get diff between two steps
   */
  getDiffBetweenSteps(
    replay: HandReplay,
    fromStep: number,
    toStep: number
  ): ReplayStateDiff | null {
    const from = this.getStateAtStep(replay, fromStep);
    const to = this.getStateAtStep(replay, toStep);

    if (!from || !to) {
      return null;
    }

    return this.calculateDiff(from, to, fromStep, toStep);
  }

  /**
   * Verify replay determinism by recalculating checksum
   */
  verifyReplayDeterminism(replay: HandReplay): boolean {
    const replayData = JSON.stringify({
      handId: replay.handId,
      steps: replay.steps.map(s => ({
        index: s.index,
        action: s.action,
        stateHash: this.hashState(s.state),
      })),
    });
    const calculatedChecksum = calculateChecksum(replayData);
    return calculatedChecksum === replay.checksum;
  }

  /**
   * Get all actions in replay
   */
  getActions(replay: HandReplay): readonly ReplayAction[] {
    return replay.steps
      .filter(s => s.action !== null)
      .map(s => s.action!);
  }

  /**
   * Get actions by player
   */
  getPlayerActions(replay: HandReplay, playerId: PlayerId): readonly ReplayAction[] {
    return this.getActions(replay).filter(a => a.playerId === playerId);
  }

  /**
   * Get actions by street
   */
  getStreetActions(replay: HandReplay, street: Street): readonly ReplayAction[] {
    return this.getActions(replay).filter(a => a.street === street);
  }

  // ==========================================================================
  // State Construction Helpers
  // ==========================================================================

  private createInitialState(
    startEvent: IntegrityEvent,
    startData: HandEventData
  ): ReplayState {
    const players = new Map<PlayerId, ReplayPlayerState>();

    for (const playerId of startData.players) {
      const position = startData.positions.get(playerId) ?? 0;
      const stack = startData.stacks.get(playerId) ?? 0;

      players.set(playerId, {
        playerId,
        stack,
        committed: 0,
        totalCommitted: 0,
        position,
        isActive: true,
        isFolded: false,
        isAllIn: false,
      });
    }

    return {
      stepIndex: 0,
      timestamp: startEvent.timestamp,
      players,
      pot: {
        mainPot: 0,
        sidePots: [],
        totalPot: 0,
      },
      board: {
        street: 'preflop',
        communityCards: [],
      },
      currentActor: null,
      lastAction: null,
      isComplete: false,
    };
  }

  private processActionEvent(
    currentState: ReplayState,
    event: IntegrityEvent,
    stepIndex: number
  ): { nextState: ReplayState; action: ReplayAction; diff: ReplayStateDiff } {
    const actionData = event.data as PlayerActionData;
    const playerId = event.playerId!;

    // Create action
    const action: ReplayAction = {
      playerId,
      actionType: actionData.actionType,
      amount: actionData.amount,
      street: event.street ?? 'preflop',
      timestamp: event.timestamp,
      timeToAct: actionData.timeToAct,
    };

    // Update player state
    const newPlayers = new Map(currentState.players);
    const playerState = newPlayers.get(playerId);

    if (playerState) {
      const newStack = actionData.stackAfter;
      const committed = actionData.amount;

      newPlayers.set(playerId, {
        ...playerState,
        stack: newStack,
        committed: playerState.committed + committed,
        totalCommitted: playerState.totalCommitted + committed,
        isFolded: actionData.actionType === 'fold',
        isAllIn: actionData.actionType === 'all_in',
        isActive: actionData.actionType !== 'fold',
      });
    }

    // Update pot
    const newPot: ReplayPotState = {
      ...currentState.pot,
      mainPot: actionData.potSize,
      totalPot: actionData.potSize,
    };

    // Create new state
    const nextState: ReplayState = {
      stepIndex,
      timestamp: event.timestamp,
      players: newPlayers,
      pot: newPot,
      board: currentState.board,
      currentActor: playerId,
      lastAction: action,
      isComplete: false,
    };

    // Calculate diff
    const diff = this.calculateDiff(currentState, nextState, stepIndex - 1, stepIndex);

    return { nextState, action, diff };
  }

  private processStreetChange(
    currentState: ReplayState,
    event: IntegrityEvent,
    stepIndex: number
  ): { nextState: ReplayState; diff: ReplayStateDiff } {
    const newStreet = event.street ?? currentState.board.street;
    const eventData = event.data as HandEventData;

    // Reset committed amounts for new street
    const newPlayers = new Map<PlayerId, ReplayPlayerState>();
    for (const [playerId, playerState] of currentState.players) {
      newPlayers.set(playerId, {
        ...playerState,
        committed: 0,
      });
    }

    // Add community cards based on street
    let newCommunityCards = [...currentState.board.communityCards];
    // In a real implementation, cards would come from the event
    // For now, we just track the street change

    const newBoard: ReplayBoardState = {
      street: newStreet,
      communityCards: newCommunityCards,
    };

    const newPot: ReplayPotState = {
      ...currentState.pot,
      mainPot: eventData.potSize ?? currentState.pot.mainPot,
      totalPot: eventData.potSize ?? currentState.pot.totalPot,
    };

    const nextState: ReplayState = {
      stepIndex,
      timestamp: event.timestamp,
      players: newPlayers,
      pot: newPot,
      board: newBoard,
      currentActor: null,
      lastAction: null,
      isComplete: false,
    };

    const diff = this.calculateDiff(currentState, nextState, stepIndex - 1, stepIndex);

    return { nextState, diff };
  }

  private processPotAward(
    currentState: ReplayState,
    event: IntegrityEvent,
    stepIndex: number
  ): { nextState: ReplayState; diff: ReplayStateDiff } {
    const awardData = event.data as StackChangeData;
    const winnerId = awardData.playerId;

    // Update winner's stack
    const newPlayers = new Map(currentState.players);
    const winnerState = newPlayers.get(winnerId);

    if (winnerState) {
      newPlayers.set(winnerId, {
        ...winnerState,
        stack: winnerState.stack + awardData.changeAmount,
      });
    }

    // Clear pot
    const newPot: ReplayPotState = {
      mainPot: 0,
      sidePots: [],
      totalPot: 0,
    };

    const nextState: ReplayState = {
      stepIndex,
      timestamp: event.timestamp,
      players: newPlayers,
      pot: newPot,
      board: currentState.board,
      currentActor: null,
      lastAction: null,
      isComplete: true,
    };

    const diff = this.calculateDiff(currentState, nextState, stepIndex - 1, stepIndex);

    return { nextState, diff };
  }

  // ==========================================================================
  // Diff Calculation
  // ==========================================================================

  private calculateDiff(
    from: ReplayState,
    to: ReplayState,
    fromStep: number,
    toStep: number
  ): ReplayStateDiff {
    // Calculate stack changes
    const stackChanges = new Map<PlayerId, { before: number; after: number; delta: number }>();
    for (const [playerId, toPlayer] of to.players) {
      const fromPlayer = from.players.get(playerId);
      if (fromPlayer) {
        const delta = toPlayer.stack - fromPlayer.stack;
        if (delta !== 0 || toPlayer.committed !== fromPlayer.committed) {
          stackChanges.set(playerId, {
            before: fromPlayer.stack,
            after: toPlayer.stack,
            delta,
          });
        }
      }
    }

    // Calculate pot change
    const potChange = {
      before: from.pot.totalPot,
      after: to.pot.totalPot,
      delta: to.pot.totalPot - from.pot.totalPot,
    };

    // Detect street change
    const streetChange = from.board.street !== to.board.street
      ? { from: from.board.street, to: to.board.street }
      : null;

    // Detect player status changes
    const playerStatusChanges = new Map<PlayerId, { folded?: boolean; allIn?: boolean }>();
    for (const [playerId, toPlayer] of to.players) {
      const fromPlayer = from.players.get(playerId);
      if (fromPlayer) {
        const changes: { folded?: boolean; allIn?: boolean } = {};
        if (toPlayer.isFolded !== fromPlayer.isFolded) {
          changes.folded = toPlayer.isFolded;
        }
        if (toPlayer.isAllIn !== fromPlayer.isAllIn) {
          changes.allIn = toPlayer.isAllIn;
        }
        if (Object.keys(changes).length > 0) {
          playerStatusChanges.set(playerId, changes);
        }
      }
    }

    // Detect new community cards
    const newCommunityCards = to.board.communityCards.slice(
      from.board.communityCards.length
    );

    return {
      fromStep,
      toStep,
      stackChanges,
      potChange,
      streetChange,
      playerStatusChanges,
      newCommunityCards,
    };
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  private hashState(state: ReplayState): string {
    // Create a deterministic hash of state for checksum
    const stateData = {
      stepIndex: state.stepIndex,
      pot: state.pot.totalPot,
      street: state.board.street,
      players: Array.from(state.players.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([id, p]) => ({
          id,
          stack: p.stack,
          folded: p.isFolded,
          allIn: p.isAllIn,
        })),
    };
    return calculateChecksum(JSON.stringify(stateData));
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createHandReplayEngine(): HandReplayEngine {
  return new HandReplayEngine();
}
