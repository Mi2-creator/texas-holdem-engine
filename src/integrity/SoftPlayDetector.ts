/**
 * SoftPlayDetector.ts
 * Phase 22 - Soft-play pattern detection
 *
 * Detects intentional soft-play patterns:
 * - Passivity in high-EV spots (not value betting strong hands)
 * - Missing value bets (checking when should bet)
 * - Low pressure heads-up (not extracting value)
 * - Abnormal check frequency with specific opponents
 *
 * All detections are rule-based and deterministic.
 */

import { PlayerId } from '../security/Identity';
import { HandId } from '../security/AuditLog';
import {
  SoftPlayIndicator,
  SoftPlayPattern,
  DetectionSignal,
  SignalSeverity,
  DetectionThresholds,
  DEFAULT_DETECTION_THRESHOLDS,
  PlayerMetrics,
  PlayerPairMetrics,
  IntegrityEvent,
  PlayerActionData,
} from './IntegrityTypes';
import { EventStream } from './EventCollector';
import { BehaviorMetricsCalculator } from './BehaviorMetrics';

// ============================================================================
// SoftPlayDetector Implementation
// ============================================================================

export class SoftPlayDetector {
  private readonly metricsCalculator: BehaviorMetricsCalculator;
  private readonly thresholds: DetectionThresholds;

  constructor(
    thresholds: DetectionThresholds = DEFAULT_DETECTION_THRESHOLDS,
    metricsCalculator?: BehaviorMetricsCalculator
  ) {
    this.thresholds = thresholds;
    this.metricsCalculator = metricsCalculator ?? new BehaviorMetricsCalculator();
  }

  // ==========================================================================
  // Main Detection API
  // ==========================================================================

  /**
   * Run all soft-play detection heuristics on an event stream
   */
  detectSoftPlayPatterns(stream: EventStream): SoftPlayIndicator[] {
    const indicators: SoftPlayIndicator[] = [];

    const handCount = this.countHands(stream);
    if (handCount < this.thresholds.minHandsForAnalysis) {
      return indicators;
    }

    const players = this.extractPlayers(stream);
    const allMetrics = this.metricsCalculator.calculateAllPlayerMetrics(stream);

    // Analyze each player pair for soft-play patterns
    const pairs = this.generatePlayerPairs(players);

    for (const [p1, p2] of pairs) {
      const p1Metrics = allMetrics.get(p1);
      const p2Metrics = allMetrics.get(p2);
      const pairMetrics = this.metricsCalculator.calculatePairMetrics(stream, p1, p2);

      if (!p1Metrics || !p2Metrics) continue;

      // 1. Passive in high-EV spots
      const passiveHighEV = this.detectPassiveHighEV(stream, p1, p2, p1Metrics, pairMetrics);
      if (passiveHighEV) indicators.push(passiveHighEV);

      // 2. Missing value bets
      const missingValue = this.detectMissingValueBets(stream, p1, p2, pairMetrics);
      if (missingValue) indicators.push(missingValue);

      // 3. Low pressure heads-up
      const lowPressure = this.detectLowPressureHeadsUp(p1, p2, p1Metrics, pairMetrics);
      if (lowPressure) indicators.push(lowPressure);

      // 4. Abnormal check frequency
      const abnormalChecks = this.detectAbnormalCheckFrequency(stream, p1, p2, p1Metrics);
      if (abnormalChecks) indicators.push(abnormalChecks);
    }

    return indicators;
  }

  /**
   * Convert soft-play indicators to detection signals
   */
  indicatorsToSignals(indicators: readonly SoftPlayIndicator[]): DetectionSignal[] {
    return indicators.map(indicator => ({
      signalId: `softplay_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      category: 'SOFT_PLAY',
      severity: this.strengthToSeverity(indicator.strength),
      description: indicator.description,
      explanation: this.generateExplanation(indicator),
      confidence: Math.min(indicator.strength, 1),
      involvedPlayers: [indicator.player, indicator.opponent],
      relevantHands: [...indicator.handIds],
      evidenceMetrics: {
        strength: indicator.strength,
        occurrences: indicator.occurrences,
      },
      timestamp: Date.now(),
    }));
  }

  // ==========================================================================
  // Detection Heuristics
  // ==========================================================================

  /**
   * Detect passive play in high expected value spots
   *
   * A player who wins pots but rarely bets/raises in those winning hands
   * against a specific opponent may be soft-playing
   */
  private detectPassiveHighEV(
    stream: EventStream,
    player: PlayerId,
    opponent: PlayerId,
    playerMetrics: PlayerMetrics,
    pairMetrics: PlayerPairMetrics
  ): SoftPlayIndicator | null {
    // Need sufficient sample
    if (pairMetrics.handsPlayedTogether < 10) {
      return null;
    }

    // Find hands where player won against opponent
    const winsAgainstOpponent = this.getWinsAgainst(stream, player, opponent);
    if (winsAgainstOpponent.length < 3) {
      return null;
    }

    // Count aggressive actions in those winning hands
    let totalAggressiveActions = 0;
    let totalActions = 0;

    for (const handId of winsAgainstOpponent) {
      const actions = stream.events.filter(
        e => e.handId === handId && e.playerId === player && e.type.startsWith('player_')
      );

      for (const action of actions) {
        totalActions++;
        if (
          action.type === 'player_bet' ||
          action.type === 'player_raise' ||
          action.type === 'player_all_in'
        ) {
          totalAggressiveActions++;
        }
      }
    }

    // Compare to overall aggression frequency
    const winningAggressionFreq = totalActions > 0 ? totalAggressiveActions / totalActions : 0;
    const overallAggressionFreq = playerMetrics.aggressionFrequency;

    // If player is significantly less aggressive when winning against this opponent
    const aggressionDelta = overallAggressionFreq - winningAggressionFreq;

    if (aggressionDelta < this.thresholds.passivityThreshold) {
      return null;
    }

    const strength = Math.min(aggressionDelta / (1 - this.thresholds.passivityThreshold), 1);

    return {
      pattern: 'PASSIVE_HIGH_EV',
      player,
      opponent,
      strength,
      occurrences: winsAgainstOpponent.length,
      handIds: winsAgainstOpponent,
      description: `${player} shows ${(winningAggressionFreq * 100).toFixed(1)}% aggression in winning hands vs ${opponent} (overall: ${(overallAggressionFreq * 100).toFixed(1)}%)`,
    };
  }

  /**
   * Detect missing value bets
   *
   * A player who checks/calls when pot odds suggest betting
   * specifically against certain opponents
   */
  private detectMissingValueBets(
    stream: EventStream,
    player: PlayerId,
    opponent: PlayerId,
    pairMetrics: PlayerPairMetrics
  ): SoftPlayIndicator | null {
    if (pairMetrics.handsPlayedTogether < 10) {
      return null;
    }

    // Find river actions where player won
    const riverWins = this.getRiverWinsAgainst(stream, player, opponent);
    if (riverWins.length < 3) {
      return null;
    }

    // Count river checks before winning showdown
    let riverChecksBeforeWin = 0;
    let riverBetsBeforeWin = 0;

    for (const handId of riverWins) {
      const riverActions = stream.events.filter(
        e => e.handId === handId && e.playerId === player && e.street === 'river'
      );

      for (const action of riverActions) {
        if (action.type === 'player_check') {
          riverChecksBeforeWin++;
        } else if (action.type === 'player_bet' || action.type === 'player_raise') {
          riverBetsBeforeWin++;
        }
      }
    }

    const totalRiverActions = riverChecksBeforeWin + riverBetsBeforeWin;
    if (totalRiverActions < 3) {
      return null;
    }

    const checkRate = riverChecksBeforeWin / totalRiverActions;

    // High check rate on river before winning = missing value
    if (checkRate < this.thresholds.missingValueBetThreshold) {
      return null;
    }

    const strength = Math.min(
      (checkRate - this.thresholds.missingValueBetThreshold) /
        (1 - this.thresholds.missingValueBetThreshold),
      1
    );

    return {
      pattern: 'MISSING_VALUE_BET',
      player,
      opponent,
      strength,
      occurrences: riverChecksBeforeWin,
      handIds: riverWins,
      description: `${player} checked river ${riverChecksBeforeWin}/${totalRiverActions} times before winning showdown vs ${opponent}`,
    };
  }

  /**
   * Detect low pressure in heads-up situations
   */
  private detectLowPressureHeadsUp(
    player: PlayerId,
    opponent: PlayerId,
    playerMetrics: PlayerMetrics,
    pairMetrics: PlayerPairMetrics
  ): SoftPlayIndicator | null {
    if (pairMetrics.headsUpConfrontations < 5) {
      return null;
    }

    // Compare heads-up aggression vs this opponent to general heads-up aggression
    const raisesVsOpponent = player === pairMetrics.player1
      ? pairMetrics.p1RaisesVsP2
      : pairMetrics.p2RaisesVsP1;

    const raisesPerConfrontation = raisesVsOpponent / pairMetrics.headsUpConfrontations;
    const expectedRaisesPerHand = 0.3; // Expected ~30% raise frequency heads-up

    if (raisesPerConfrontation >= expectedRaisesPerHand * 0.5) {
      return null;
    }

    const strength = Math.min(
      (expectedRaisesPerHand - raisesPerConfrontation) / expectedRaisesPerHand,
      1
    );

    if (strength < 0.3) {
      return null;
    }

    return {
      pattern: 'LOW_PRESSURE_HEADS_UP',
      player,
      opponent,
      strength,
      occurrences: pairMetrics.headsUpConfrontations,
      handIds: [],
      description: `${player} raises only ${(raisesPerConfrontation * 100).toFixed(1)}% in heads-up vs ${opponent} (expected ~${(expectedRaisesPerHand * 100).toFixed(1)}%)`,
    };
  }

  /**
   * Detect abnormal check frequency against specific opponent
   */
  private detectAbnormalCheckFrequency(
    stream: EventStream,
    player: PlayerId,
    opponent: PlayerId,
    playerMetrics: PlayerMetrics
  ): SoftPlayIndicator | null {
    // Get all player actions
    const allActions = stream.events.filter(
      e => e.playerId === player && e.type.startsWith('player_')
    );

    if (allActions.length < 20) {
      return null;
    }

    // Calculate overall check rate
    const overallChecks = allActions.filter(e => e.type === 'player_check').length;
    const overallCheckRate = overallChecks / allActions.length;

    // Get hands with opponent and calculate check rate
    const handsWithOpponent = this.getHandsWithOpponent(stream, player, opponent);
    if (handsWithOpponent.size < 5) {
      return null;
    }

    const actionsVsOpponent = allActions.filter(
      e => e.handId && handsWithOpponent.has(e.handId)
    );

    if (actionsVsOpponent.length < 10) {
      return null;
    }

    const checksVsOpponent = actionsVsOpponent.filter(e => e.type === 'player_check').length;
    const checkRateVsOpponent = checksVsOpponent / actionsVsOpponent.length;

    // If significantly higher check rate vs this opponent
    const checkRateDelta = checkRateVsOpponent - overallCheckRate;

    if (checkRateDelta < 0.2) {
      return null;
    }

    const strength = Math.min(checkRateDelta / 0.5, 1);

    return {
      pattern: 'ABNORMAL_CHECK_FREQUENCY',
      player,
      opponent,
      strength,
      occurrences: checksVsOpponent,
      handIds: Array.from(handsWithOpponent),
      description: `${player} checks ${(checkRateVsOpponent * 100).toFixed(1)}% vs ${opponent} (overall: ${(overallCheckRate * 100).toFixed(1)}%)`,
    };
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  private getWinsAgainst(
    stream: EventStream,
    player: PlayerId,
    opponent: PlayerId
  ): HandId[] {
    const wins: HandId[] = [];

    const potAwards = stream.events.filter(
      e => e.type === 'pot_awarded' && (e.data as any).playerId === player
    );

    for (const award of potAwards) {
      const data = award.data as any;
      if (data.fromPlayers?.includes(opponent)) {
        if (award.handId) {
          wins.push(award.handId);
        }
      }
    }

    return wins;
  }

  private getRiverWinsAgainst(
    stream: EventStream,
    player: PlayerId,
    opponent: PlayerId
  ): HandId[] {
    // Find hands that went to showdown
    const showdownHands = stream.events.filter(
      e => e.type === 'hand_completed' && (e.data as any).finalStreet === 'river'
    );

    const riverWins: HandId[] = [];

    for (const completion of showdownHands) {
      const data = completion.data as any;
      if (!data.winners?.includes(player)) continue;

      const handId = completion.handId;
      if (!handId) continue;

      // Check if opponent was in the hand at showdown
      const opponentInHand = stream.events.some(
        e => e.handId === handId && e.playerId === opponent && e.street === 'river'
      );

      if (opponentInHand) {
        riverWins.push(handId);
      }
    }

    return riverWins;
  }

  private getHandsWithOpponent(
    stream: EventStream,
    player: PlayerId,
    opponent: PlayerId
  ): Set<HandId> {
    const hands = new Set<HandId>();

    const handStarts = stream.events.filter(e => e.type === 'hand_started');

    for (const start of handStarts) {
      const data = start.data as any;
      if (data.players?.includes(player) && data.players?.includes(opponent)) {
        if (start.handId) {
          hands.add(start.handId);
        }
      }
    }

    return hands;
  }

  private countHands(stream: EventStream): number {
    return stream.events.filter(e => e.type === 'hand_started').length;
  }

  private extractPlayers(stream: EventStream): Set<PlayerId> {
    const players = new Set<PlayerId>();
    for (const event of stream.events) {
      if (event.playerId && event.playerId !== ('rake' as PlayerId)) {
        players.add(event.playerId);
      }
      if (event.type === 'hand_started') {
        const data = event.data as any;
        if (data.players) {
          for (const p of data.players) {
            if (p !== 'rake') players.add(p);
          }
        }
      }
    }
    return players;
  }

  private generatePlayerPairs(players: Set<PlayerId>): Array<[PlayerId, PlayerId]> {
    const pairs: Array<[PlayerId, PlayerId]> = [];
    const playerArray = Array.from(players);

    for (let i = 0; i < playerArray.length; i++) {
      for (let j = i + 1; j < playerArray.length; j++) {
        pairs.push([playerArray[i], playerArray[j]]);
        pairs.push([playerArray[j], playerArray[i]]); // Both directions for soft-play
      }
    }

    return pairs;
  }

  private strengthToSeverity(strength: number): SignalSeverity {
    if (strength >= 0.8) return 'CRITICAL';
    if (strength >= 0.6) return 'HIGH';
    if (strength >= 0.4) return 'MEDIUM';
    return 'LOW';
  }

  private generateExplanation(indicator: SoftPlayIndicator): string {
    switch (indicator.pattern) {
      case 'PASSIVE_HIGH_EV':
        return `The player shows unusually passive play in hands they end up winning against a specific opponent. This could indicate intentional restraint to avoid extracting value.`;

      case 'MISSING_VALUE_BET':
        return `The player frequently checks on the river before winning at showdown against a specific opponent, missing clear opportunities to extract value.`;

      case 'LOW_PRESSURE_HEADS_UP':
        return `The player applies significantly less pressure in heads-up situations against a specific opponent compared to normal play patterns.`;

      case 'ABNORMAL_CHECK_FREQUENCY':
        return `The player checks at a noticeably higher rate against a specific opponent compared to their overall check frequency.`;

      default:
        return indicator.description;
    }
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createSoftPlayDetector(
  thresholds?: DetectionThresholds
): SoftPlayDetector {
  return new SoftPlayDetector(thresholds);
}
