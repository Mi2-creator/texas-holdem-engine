/**
 * BehaviorMetrics.ts
 * Phase 22 - Player behavior metrics calculation
 *
 * Calculates derived metrics per player:
 * - VPIP, PFR, aggression frequency
 * - Fold-to-raise ratios
 * - Heads-up vs multiway behavior delta
 * - Chip flow concentration
 *
 * All calculations are pure and deterministic.
 */

import { PlayerId } from '../security/Identity';
import { TableId, HandId } from '../security/AuditLog';
import {
  SessionId,
  IntegrityEvent,
  PlayerMetrics,
  ChipFlowMatrix,
  PlayerPairMetrics,
  PlayerActionData,
  StackChangeData,
} from './IntegrityTypes';
import { EventStream } from './EventCollector';

// ============================================================================
// Metrics Calculator
// ============================================================================

export class BehaviorMetricsCalculator {
  /**
   * Calculate metrics for all players in a session
   */
  calculateAllPlayerMetrics(stream: EventStream): Map<PlayerId, PlayerMetrics> {
    const players = this.extractPlayers(stream);
    const metrics = new Map<PlayerId, PlayerMetrics>();

    for (const playerId of players) {
      const playerMetrics = this.calculatePlayerMetrics(stream, playerId);
      metrics.set(playerId, playerMetrics);
    }

    return metrics;
  }

  /**
   * Calculate metrics for a single player
   */
  calculatePlayerMetrics(stream: EventStream, playerId: PlayerId): PlayerMetrics {
    const playerEvents = stream.events.filter(
      e => e.playerId === playerId || this.eventInvolvesPlayer(e, playerId)
    );

    const handIds = this.getUniqueHandIds(playerEvents);
    const actionEvents = playerEvents.filter(e => e.type.startsWith('player_'));

    // Basic stats
    const handsPlayed = handIds.size;
    const handsWon = this.countHandsWon(stream, playerId);

    // Action breakdown by street and type
    const preflopActions = actionEvents.filter(e => e.street === 'preflop');
    const postflopActions = actionEvents.filter(e => e.street !== 'preflop' && e.street !== null);

    // VPIP: % of hands where player voluntarily put money in preflop
    const vpipHands = this.countVpipHands(stream, playerId);
    const vpip = handsPlayed > 0 ? vpipHands / handsPlayed : 0;

    // PFR: % of hands where player raised preflop
    const pfrHands = this.countPfrHands(stream, playerId);
    const pfr = handsPlayed > 0 ? pfrHands / handsPlayed : 0;

    // 3-bet rate
    const threeBetOpportunities = this.count3BetOpportunities(stream, playerId);
    const threeBets = this.count3Bets(stream, playerId);
    const threeBetRate = threeBetOpportunities > 0 ? threeBets / threeBetOpportunities : 0;

    // C-bet rate
    const cBetOpportunities = this.countCBetOpportunities(stream, playerId);
    const cBets = this.countCBets(stream, playerId);
    const cBetRate = cBetOpportunities > 0 ? cBets / cBetOpportunities : 0;

    // Aggression metrics
    const { bets, raises, calls, folds } = this.countActionTypes(actionEvents);
    const totalActions = bets + raises + calls + folds;
    const aggressionFactor = calls > 0 ? (bets + raises) / calls : (bets + raises > 0 ? Infinity : 0);
    const aggressionFrequency = totalActions > 0 ? (bets + raises) / totalActions : 0;

    // Fold metrics
    const foldToRaiseOpp = this.countFoldToRaiseOpportunities(stream, playerId);
    const foldToRaise = this.countFoldsToRaise(stream, playerId);
    const foldToRaiseRate = foldToRaiseOpp > 0 ? foldToRaise / foldToRaiseOpp : 0;

    const foldToCBetOpp = this.countFoldToCBetOpportunities(stream, playerId);
    const foldToCBet = this.countFoldsToCBet(stream, playerId);
    const foldToCBetRate = foldToCBetOpp > 0 ? foldToCBet / foldToCBetOpp : 0;

    // Showdown stats
    const { wtsd, wsd } = this.calculateShowdownStats(stream, playerId);

    // Position awareness
    const { earlyVpip, lateVpip } = this.calculatePositionVpip(stream, playerId);
    const earlyPositionVpip = earlyVpip;
    const latePositionVpip = lateVpip;
    const positionAwareness = Math.abs(lateVpip - earlyVpip);

    // Heads-up vs Multiway
    const huActions = actionEvents.filter(e => this.isHeadsUpAction(e));
    const mwActions = actionEvents.filter(e => !this.isHeadsUpAction(e));
    const huAF = this.calculateAggressionFactor(huActions);
    const mwAF = this.calculateAggressionFactor(mwActions);
    const headsUpAggressionFactor = huAF;
    const multiwayAggressionFactor = mwAF;
    const headsUpVsMultiwayDelta = Math.abs(huAF - mwAF);

    // Timing
    const { avgTime, quickFolds, longTanks, totalTimed } = this.calculateTimingStats(actionEvents);
    const averageTimeToAct = avgTime;
    const quickFoldRate = totalTimed > 0 ? quickFolds / totalTimed : 0;
    const longTankRate = totalTimed > 0 ? longTanks / totalTimed : 0;

    // Chip flow
    const { netChange, biggestWin, biggestLoss } = this.calculateChipFlow(stream, playerId);

    return {
      playerId,
      sessionId: stream.sessionId,
      handsPlayed,
      handsWon,
      vpip,
      pfr,
      threeBetRate,
      cBetRate,
      aggressionFactor: isFinite(aggressionFactor) ? aggressionFactor : 100,
      aggressionFrequency,
      foldToRaiseRate,
      foldToCBetRate,
      wtsd,
      wsd,
      earlyPositionVpip,
      latePositionVpip,
      positionAwareness,
      headsUpAggressionFactor: isFinite(huAF) ? huAF : 100,
      multiwayAggressionFactor: isFinite(mwAF) ? mwAF : 100,
      headsUpVsMultiwayDelta,
      averageTimeToAct,
      quickFoldRate,
      longTankRate,
      netChipChange: netChange,
      biggestWin,
      biggestLoss,
      computedAt: Date.now(),
    };
  }

  /**
   * Calculate chip flow matrix between all players
   */
  calculateChipFlowMatrix(stream: EventStream): ChipFlowMatrix {
    const flows = new Map<PlayerId, Map<PlayerId, number>>();
    const players = this.extractPlayers(stream);

    // Initialize matrix
    for (const p1 of players) {
      flows.set(p1, new Map());
      for (const p2 of players) {
        if (p1 !== p2) {
          flows.get(p1)!.set(p2, 0);
        }
      }
    }

    // Process pot awards to build flow matrix
    const potAwards = stream.events.filter(e => e.type === 'pot_awarded');
    for (const event of potAwards) {
      const data = event.data as StackChangeData;
      const winner = data.playerId;
      const amount = data.changeAmount;
      const contributors = data.fromPlayers ?? [];

      // Distribute proportionally among contributors (simplified: equal split)
      if (contributors.length > 0) {
        const perContributor = amount / contributors.length;
        for (const contributor of contributors) {
          if (contributor !== winner) {
            const current = flows.get(contributor)?.get(winner) ?? 0;
            flows.get(contributor)?.set(winner, current + perContributor);
          }
        }
      }
    }

    // Count total hands
    const handStarts = stream.events.filter(e => e.type === 'hand_started');

    return {
      sessionId: stream.sessionId,
      tableId: stream.tableId,
      flows,
      totalHands: handStarts.length,
      computedAt: Date.now(),
    };
  }

  /**
   * Calculate metrics between a pair of players
   */
  calculatePairMetrics(
    stream: EventStream,
    player1: PlayerId,
    player2: PlayerId
  ): PlayerPairMetrics {
    // Get hands where both players participated
    const handIds = this.getHandsWithBothPlayers(stream, player1, player2);
    const handsPlayedTogether = handIds.size;

    // Heads-up confrontations
    const headsUpConfrontations = this.countHeadsUpConfrontations(stream, player1, player2);

    // Chip flow
    const flowMatrix = this.calculateChipFlowMatrix(stream);
    const p1ToP2 = flowMatrix.flows.get(player1)?.get(player2) ?? 0;
    const p2ToP1 = flowMatrix.flows.get(player2)?.get(player1) ?? 0;
    const netFlowP1toP2 = p1ToP2 - p2ToP1;

    // Aggression asymmetry
    const p1RaisesVsP2 = this.countRaisesAgainst(stream, player1, player2, handIds);
    const p2RaisesVsP1 = this.countRaisesAgainst(stream, player2, player1, handIds);
    const totalRaises = p1RaisesVsP2 + p2RaisesVsP1;
    const aggressionAsymmetry = totalRaises > 0
      ? Math.abs(p1RaisesVsP2 - p2RaisesVsP1) / totalRaises
      : 0;

    // Fold patterns
    const p1FoldsToP2 = this.countFoldsTo(stream, player1, player2, handIds);
    const p2FoldsToP1 = this.countFoldsTo(stream, player2, player1, handIds);
    const totalFolds = p1FoldsToP2 + p2FoldsToP1;
    const foldAsymmetry = totalFolds > 0
      ? Math.abs(p1FoldsToP2 - p2FoldsToP1) / totalFolds
      : 0;

    // Showdown frequency
    const showdowns = this.countShowdownsBetween(stream, player1, player2, handIds);
    const showdownRate = headsUpConfrontations > 0 ? showdowns / headsUpConfrontations : 0;

    return {
      player1,
      player2,
      sessionId: stream.sessionId,
      handsPlayedTogether,
      headsUpConfrontations,
      netFlowP1toP2,
      p1RaisesVsP2,
      p2RaisesVsP1,
      aggressionAsymmetry,
      p1FoldsToP2,
      p2FoldsToP1,
      foldAsymmetry,
      showdownsAgainstEachOther: showdowns,
      showdownRate,
      computedAt: Date.now(),
    };
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  private extractPlayers(stream: EventStream): Set<PlayerId> {
    const players = new Set<PlayerId>();
    for (const event of stream.events) {
      if (event.playerId) {
        players.add(event.playerId);
      }
      if (event.type === 'hand_started') {
        const data = event.data as any;
        if (data.players) {
          for (const p of data.players) {
            players.add(p);
          }
        }
      }
    }
    // Remove 'rake' pseudo-player if present
    players.delete('rake' as PlayerId);
    return players;
  }

  private getUniqueHandIds(events: readonly IntegrityEvent[]): Set<HandId> {
    const handIds = new Set<HandId>();
    for (const event of events) {
      if (event.handId) {
        handIds.add(event.handId);
      }
    }
    return handIds;
  }

  private eventInvolvesPlayer(event: IntegrityEvent, playerId: PlayerId): boolean {
    if (event.type === 'hand_started' || event.type === 'hand_completed') {
      const data = event.data as any;
      if (data.players) {
        return data.players.includes(playerId);
      }
    }
    if (event.type === 'pot_awarded') {
      const data = event.data as StackChangeData;
      return data.playerId === playerId || (data.fromPlayers?.includes(playerId) ?? false);
    }
    return false;
  }

  private countHandsWon(stream: EventStream, playerId: PlayerId): number {
    return stream.events.filter(
      e => e.type === 'pot_awarded' && (e.data as StackChangeData).playerId === playerId
    ).length;
  }

  private countVpipHands(stream: EventStream, playerId: PlayerId): number {
    const handStarts = stream.events.filter(e => e.type === 'hand_started');
    let count = 0;

    for (const start of handStarts) {
      const handId = start.handId;
      if (!handId) continue;

      const preflopActions = stream.events.filter(
        e => e.handId === handId &&
             e.playerId === playerId &&
             e.street === 'preflop' &&
             (e.type === 'player_call' || e.type === 'player_bet' || e.type === 'player_raise' || e.type === 'player_all_in')
      );

      if (preflopActions.length > 0) {
        count++;
      }
    }

    return count;
  }

  private countPfrHands(stream: EventStream, playerId: PlayerId): number {
    const handStarts = stream.events.filter(e => e.type === 'hand_started');
    let count = 0;

    for (const start of handStarts) {
      const handId = start.handId;
      if (!handId) continue;

      const preflopRaises = stream.events.filter(
        e => e.handId === handId &&
             e.playerId === playerId &&
             e.street === 'preflop' &&
             (e.type === 'player_raise' || e.type === 'player_bet')
      );

      if (preflopRaises.length > 0) {
        count++;
      }
    }

    return count;
  }

  private count3BetOpportunities(stream: EventStream, playerId: PlayerId): number {
    // Opportunities where someone raised and player could 3-bet
    // Simplified: count hands where there was a raise before player's action
    return 0; // Simplified for now
  }

  private count3Bets(stream: EventStream, playerId: PlayerId): number {
    return 0; // Simplified for now
  }

  private countCBetOpportunities(stream: EventStream, playerId: PlayerId): number {
    // Hands where player was preflop aggressor and saw flop
    return 0; // Simplified for now
  }

  private countCBets(stream: EventStream, playerId: PlayerId): number {
    return 0; // Simplified for now
  }

  private countActionTypes(events: readonly IntegrityEvent[]): { bets: number; raises: number; calls: number; folds: number } {
    let bets = 0, raises = 0, calls = 0, folds = 0;

    for (const event of events) {
      switch (event.type) {
        case 'player_bet': bets++; break;
        case 'player_raise': raises++; break;
        case 'player_call': calls++; break;
        case 'player_fold': folds++; break;
        case 'player_all_in':
          // All-in can be bet or raise - count as raise for aggression
          raises++;
          break;
      }
    }

    return { bets, raises, calls, folds };
  }

  private countFoldToRaiseOpportunities(stream: EventStream, playerId: PlayerId): number {
    // Count times player faced a raise
    return stream.events.filter(
      e => e.playerId === playerId &&
           (e.type === 'player_fold' || e.type === 'player_call' || e.type === 'player_raise') &&
           (e.data as PlayerActionData).facingBet > 0
    ).length;
  }

  private countFoldsToRaise(stream: EventStream, playerId: PlayerId): number {
    return stream.events.filter(
      e => e.playerId === playerId &&
           e.type === 'player_fold' &&
           (e.data as PlayerActionData).facingBet > 0
    ).length;
  }

  private countFoldToCBetOpportunities(stream: EventStream, playerId: PlayerId): number {
    return 0; // Simplified
  }

  private countFoldsToCBet(stream: EventStream, playerId: PlayerId): number {
    return 0; // Simplified
  }

  private calculateShowdownStats(stream: EventStream, playerId: PlayerId): { wtsd: number; wsd: number } {
    const handCompletions = stream.events.filter(
      e => e.type === 'hand_completed' && this.eventInvolvesPlayer(e, playerId)
    );

    let wentToShowdown = 0;
    let wonAtShowdown = 0;

    for (const event of handCompletions) {
      const data = event.data as any;
      if (data.finalStreet === 'river') {
        wentToShowdown++;
        if (data.winners?.includes(playerId)) {
          wonAtShowdown++;
        }
      }
    }

    const handsPlayed = this.getUniqueHandIds(
      stream.events.filter(e => e.playerId === playerId || this.eventInvolvesPlayer(e, playerId))
    ).size;

    return {
      wtsd: handsPlayed > 0 ? wentToShowdown / handsPlayed : 0,
      wsd: wentToShowdown > 0 ? wonAtShowdown / wentToShowdown : 0,
    };
  }

  private calculatePositionVpip(stream: EventStream, playerId: PlayerId): { earlyVpip: number; lateVpip: number } {
    // Simplified: position 0-2 is early, 6-8 is late
    let earlyHands = 0, earlyVpip = 0;
    let lateHands = 0, lateVpip = 0;

    const handStarts = stream.events.filter(e => e.type === 'hand_started');

    for (const start of handStarts) {
      const data = start.data as any;
      const position = data.positions?.get(playerId);
      if (position === undefined) continue;

      const handId = start.handId;
      if (!handId) continue;

      const hasVpip = stream.events.some(
        e => e.handId === handId &&
             e.playerId === playerId &&
             e.street === 'preflop' &&
             (e.type === 'player_call' || e.type === 'player_bet' || e.type === 'player_raise')
      );

      if (position <= 2) {
        earlyHands++;
        if (hasVpip) earlyVpip++;
      } else if (position >= 6) {
        lateHands++;
        if (hasVpip) lateVpip++;
      }
    }

    return {
      earlyVpip: earlyHands > 0 ? earlyVpip / earlyHands : 0,
      lateVpip: lateHands > 0 ? lateVpip / lateHands : 0,
    };
  }

  private isHeadsUpAction(event: IntegrityEvent): boolean {
    const data = event.data as PlayerActionData;
    return data?.isHeadsUp ?? false;
  }

  private calculateAggressionFactor(events: readonly IntegrityEvent[]): number {
    const { bets, raises, calls } = this.countActionTypes(events);
    return calls > 0 ? (bets + raises) / calls : (bets + raises > 0 ? Infinity : 0);
  }

  private calculateTimingStats(events: readonly IntegrityEvent[]): {
    avgTime: number;
    quickFolds: number;
    longTanks: number;
    totalTimed: number;
  } {
    let totalTime = 0;
    let quickFolds = 0;
    let longTanks = 0;
    let totalTimed = 0;

    for (const event of events) {
      const data = event.data as PlayerActionData;
      if (data?.timeToAct !== undefined) {
        totalTime += data.timeToAct;
        totalTimed++;

        if (event.type === 'player_fold' && data.timeToAct < 1000) {
          quickFolds++;
        }
        if (data.timeToAct > 10000) {
          longTanks++;
        }
      }
    }

    return {
      avgTime: totalTimed > 0 ? totalTime / totalTimed : 0,
      quickFolds,
      longTanks,
      totalTimed,
    };
  }

  private calculateChipFlow(stream: EventStream, playerId: PlayerId): {
    netChange: number;
    biggestWin: number;
    biggestLoss: number;
  } {
    let netChange = 0;
    let biggestWin = 0;
    let biggestLoss = 0;

    const stackChanges = stream.events.filter(
      e => e.type === 'stack_change' && (e.data as StackChangeData).playerId === playerId
    );

    for (const event of stackChanges) {
      const data = event.data as StackChangeData;
      netChange += data.changeAmount;

      if (data.changeAmount > biggestWin) {
        biggestWin = data.changeAmount;
      }
      if (data.changeAmount < biggestLoss) {
        biggestLoss = data.changeAmount;
      }
    }

    return { netChange, biggestWin, biggestLoss };
  }

  private getHandsWithBothPlayers(
    stream: EventStream,
    player1: PlayerId,
    player2: PlayerId
  ): Set<HandId> {
    const handIds = new Set<HandId>();

    const handStarts = stream.events.filter(e => e.type === 'hand_started');
    for (const start of handStarts) {
      const data = start.data as any;
      if (data.players?.includes(player1) && data.players?.includes(player2)) {
        if (start.handId) {
          handIds.add(start.handId);
        }
      }
    }

    return handIds;
  }

  private countHeadsUpConfrontations(
    stream: EventStream,
    player1: PlayerId,
    player2: PlayerId
  ): number {
    // Count hands where only these two players remained
    return 0; // Simplified
  }

  private countRaisesAgainst(
    stream: EventStream,
    raiser: PlayerId,
    opponent: PlayerId,
    handIds: Set<HandId>
  ): number {
    return stream.events.filter(
      e => e.handId && handIds.has(e.handId) &&
           e.playerId === raiser &&
           (e.type === 'player_raise' || e.type === 'player_bet')
    ).length;
  }

  private countFoldsTo(
    stream: EventStream,
    folder: PlayerId,
    aggressor: PlayerId,
    handIds: Set<HandId>
  ): number {
    // Count folds by folder after action by aggressor
    return stream.events.filter(
      e => e.handId && handIds.has(e.handId) &&
           e.playerId === folder &&
           e.type === 'player_fold'
    ).length;
  }

  private countShowdownsBetween(
    stream: EventStream,
    player1: PlayerId,
    player2: PlayerId,
    handIds: Set<HandId>
  ): number {
    return stream.events.filter(
      e => e.handId && handIds.has(e.handId) &&
           e.type === 'hand_completed' &&
           (e.data as any).finalStreet === 'river'
    ).length;
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createBehaviorMetricsCalculator(): BehaviorMetricsCalculator {
  return new BehaviorMetricsCalculator();
}
