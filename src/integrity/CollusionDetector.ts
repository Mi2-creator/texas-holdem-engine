/**
 * CollusionDetector.ts
 * Phase 22 - Collusion pattern detection
 *
 * Detects suspicious collusion patterns:
 * - Repeated chip transfers between same players
 * - Asymmetric aggression (A never raises B)
 * - Abnormal fold patterns in shared pots
 * - Unnatural multiway checkdowns
 * - Coordinated betting
 *
 * All detections are rule-based and deterministic.
 * No ML, no automated punishment - just signals.
 */

import { PlayerId } from '../security/Identity';
import { HandId } from '../security/AuditLog';
import {
  CollusionIndicator,
  CollusionPattern,
  DetectionSignal,
  SignalSeverity,
  DetectionThresholds,
  DEFAULT_DETECTION_THRESHOLDS,
  ChipFlowMatrix,
  PlayerPairMetrics,
} from './IntegrityTypes';
import { EventStream } from './EventCollector';
import { BehaviorMetricsCalculator } from './BehaviorMetrics';

// ============================================================================
// Statistical Helpers
// ============================================================================

/**
 * Calculate z-score for a value against expected distribution
 */
function calculateZScore(observed: number, expected: number, stdDev: number): number {
  if (stdDev === 0) {
    return observed === expected ? 0 : Infinity;
  }
  return (observed - expected) / stdDev;
}

/**
 * Calculate standard deviation for a set of values
 */
function standardDeviation(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / values.length);
}

// ============================================================================
// CollusionDetector Implementation
// ============================================================================

export class CollusionDetector {
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
   * Run all collusion detection heuristics on an event stream
   */
  detectCollusionPatterns(stream: EventStream): CollusionIndicator[] {
    const indicators: CollusionIndicator[] = [];

    // Need minimum hands for meaningful analysis
    const handCount = this.countHands(stream);
    if (handCount < this.thresholds.minHandsForAnalysis) {
      return indicators;
    }

    // Calculate chip flow matrix
    const chipFlowMatrix = this.metricsCalculator.calculateChipFlowMatrix(stream);

    // Get all player pairs
    const players = this.extractPlayers(stream);
    const pairs = this.generatePlayerPairs(players);

    // Run each detection heuristic
    for (const [p1, p2] of pairs) {
      const pairMetrics = this.metricsCalculator.calculatePairMetrics(stream, p1, p2);

      // 1. Chip transfer concentration
      const chipTransfer = this.detectChipTransferConcentration(chipFlowMatrix, p1, p2, players);
      if (chipTransfer) indicators.push(chipTransfer);

      // 2. Asymmetric aggression
      const asymAggression = this.detectAsymmetricAggression(pairMetrics, stream);
      if (asymAggression) indicators.push(asymAggression);

      // 3. Abnormal fold patterns
      const foldPattern = this.detectAbnormalFoldPattern(pairMetrics, stream);
      if (foldPattern) indicators.push(foldPattern);

      // 4. Soft play heads-up
      const softPlay = this.detectSoftPlayHeadsUp(pairMetrics, stream);
      if (softPlay) indicators.push(softPlay);
    }

    // 5. Coordinated betting (requires analysis of action sequences)
    const coordinated = this.detectCoordinatedBetting(stream, players);
    indicators.push(...coordinated);

    // 6. Unnatural checkdowns
    const checkdowns = this.detectUnnaturalCheckdowns(stream, players);
    indicators.push(...checkdowns);

    return indicators;
  }

  /**
   * Convert collusion indicators to detection signals
   */
  indicatorsToSignals(indicators: readonly CollusionIndicator[]): DetectionSignal[] {
    return indicators.map(indicator => ({
      signalId: `collusion_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      category: 'COLLUSION',
      severity: this.strengthToSeverity(indicator.strength),
      description: indicator.description,
      explanation: this.generateExplanation(indicator),
      confidence: Math.min(indicator.strength, 1),
      involvedPlayers: [...indicator.players],
      relevantHands: [...indicator.handIds],
      evidenceMetrics: {
        strength: indicator.strength,
        occurrences: indicator.occurrences,
        expectedOccurrences: indicator.expectedOccurrences,
        zScore: indicator.zScore,
      },
      timestamp: Date.now(),
    }));
  }

  // ==========================================================================
  // Detection Heuristics
  // ==========================================================================

  /**
   * Detect concentrated chip transfers between two players
   */
  private detectChipTransferConcentration(
    matrix: ChipFlowMatrix,
    player1: PlayerId,
    player2: PlayerId,
    allPlayers: Set<PlayerId>
  ): CollusionIndicator | null {
    // Calculate total chips transferred from player1 to anyone
    const p1Flows = matrix.flows.get(player1);
    if (!p1Flows) return null;

    let totalOutFromP1 = 0;
    for (const [, amount] of p1Flows) {
      totalOutFromP1 += amount;
    }

    if (totalOutFromP1 === 0) return null;

    // Calculate concentration to player2
    const toP2 = p1Flows.get(player2) ?? 0;
    const concentration = toP2 / totalOutFromP1;

    // Expected concentration would be 1/(n-1) if evenly distributed
    const otherPlayers = allPlayers.size - 1;
    const expectedConcentration = otherPlayers > 0 ? 1 / otherPlayers : 0;

    // Only flag if above threshold
    if (concentration <= this.thresholds.chipTransferConcentration) {
      return null;
    }

    // Calculate z-score assuming equal distribution baseline
    const stdDev = expectedConcentration * 0.5; // Rough estimate
    const zScore = calculateZScore(concentration, expectedConcentration, stdDev);

    // Strength based on how far above threshold
    const strength = Math.min(
      (concentration - this.thresholds.chipTransferConcentration) /
        (1 - this.thresholds.chipTransferConcentration),
      1
    );

    return {
      pattern: 'CHIP_TRANSFER_CONCENTRATION',
      players: [player1, player2],
      strength,
      occurrences: 1,
      expectedOccurrences: 0,
      zScore,
      handIds: [],
      description: `${(concentration * 100).toFixed(1)}% of ${player1}'s losses went to ${player2} (expected ~${(expectedConcentration * 100).toFixed(1)}%)`,
    };
  }

  /**
   * Detect asymmetric aggression between players
   */
  private detectAsymmetricAggression(
    pairMetrics: PlayerPairMetrics,
    stream: EventStream
  ): CollusionIndicator | null {
    // Need enough hands together to judge
    if (pairMetrics.handsPlayedTogether < 10) {
      return null;
    }

    const { p1RaisesVsP2, p2RaisesVsP1, aggressionAsymmetry } = pairMetrics;
    const totalRaises = p1RaisesVsP2 + p2RaisesVsP1;

    // Need meaningful number of raises
    if (totalRaises < 5) {
      return null;
    }

    // Check if asymmetry exceeds threshold
    if (aggressionAsymmetry <= this.thresholds.aggressionAsymmetry) {
      return null;
    }

    // Determine who never raises whom
    const passive = p1RaisesVsP2 < p2RaisesVsP1 ? pairMetrics.player1 : pairMetrics.player2;
    const aggressor = passive === pairMetrics.player1 ? pairMetrics.player2 : pairMetrics.player1;

    // Expected: 50/50 split
    const expected = totalRaises / 2;
    const observed = Math.min(p1RaisesVsP2, p2RaisesVsP1);
    const stdDev = Math.sqrt(totalRaises * 0.5 * 0.5); // binomial std dev
    const zScore = calculateZScore(observed, expected, stdDev);

    const strength = Math.min(
      (aggressionAsymmetry - this.thresholds.aggressionAsymmetry) /
        (1 - this.thresholds.aggressionAsymmetry),
      1
    );

    return {
      pattern: 'ASYMMETRIC_AGGRESSION',
      players: [pairMetrics.player1, pairMetrics.player2],
      strength,
      occurrences: totalRaises,
      expectedOccurrences: expected,
      zScore: Math.abs(zScore),
      handIds: [],
      description: `${passive} rarely raises against ${aggressor}: ${Math.min(p1RaisesVsP2, p2RaisesVsP1)}/${totalRaises} raises (${(aggressionAsymmetry * 100).toFixed(1)}% asymmetry)`,
    };
  }

  /**
   * Detect abnormal fold patterns between players
   */
  private detectAbnormalFoldPattern(
    pairMetrics: PlayerPairMetrics,
    stream: EventStream
  ): CollusionIndicator | null {
    if (pairMetrics.handsPlayedTogether < 10) {
      return null;
    }

    const { p1FoldsToP2, p2FoldsToP1, foldAsymmetry } = pairMetrics;
    const totalFolds = p1FoldsToP2 + p2FoldsToP1;

    if (totalFolds < 5) {
      return null;
    }

    if (foldAsymmetry <= this.thresholds.foldAsymmetry) {
      return null;
    }

    // Determine who always folds
    const folder = p1FoldsToP2 > p2FoldsToP1 ? pairMetrics.player1 : pairMetrics.player2;
    const winner = folder === pairMetrics.player1 ? pairMetrics.player2 : pairMetrics.player1;

    const expected = totalFolds / 2;
    const observed = Math.max(p1FoldsToP2, p2FoldsToP1);
    const stdDev = Math.sqrt(totalFolds * 0.5 * 0.5);
    const zScore = calculateZScore(observed, expected, stdDev);

    const strength = Math.min(
      (foldAsymmetry - this.thresholds.foldAsymmetry) / (1 - this.thresholds.foldAsymmetry),
      1
    );

    return {
      pattern: 'ABNORMAL_FOLD_PATTERN',
      players: [pairMetrics.player1, pairMetrics.player2],
      strength,
      occurrences: Math.max(p1FoldsToP2, p2FoldsToP1),
      expectedOccurrences: expected,
      zScore: Math.abs(zScore),
      handIds: [],
      description: `${folder} folds to ${winner} ${Math.max(p1FoldsToP2, p2FoldsToP1)}/${totalFolds} times (${(foldAsymmetry * 100).toFixed(1)}% asymmetry)`,
    };
  }

  /**
   * Detect soft play in heads-up situations
   */
  private detectSoftPlayHeadsUp(
    pairMetrics: PlayerPairMetrics,
    stream: EventStream
  ): CollusionIndicator | null {
    // Check if showdown rate is abnormally high
    if (pairMetrics.headsUpConfrontations < 5) {
      return null;
    }

    // Very low showdown rate with specific player could indicate soft play
    // But also high showdown rate with no aggression
    const { showdownRate, aggressionAsymmetry, headsUpConfrontations } = pairMetrics;

    // If neither player shows aggression heads-up, it's suspicious
    // This is detected by low total raises despite many confrontations
    const totalRaises = pairMetrics.p1RaisesVsP2 + pairMetrics.p2RaisesVsP1;
    const raisesPerConfrontation = totalRaises / headsUpConfrontations;

    // Normal players raise at least once every 3-4 heads-up confrontations
    const expectedRaisesPerHand = 0.25;
    if (raisesPerConfrontation >= expectedRaisesPerHand) {
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
      pattern: 'SOFT_PLAY_HEADS_UP',
      players: [pairMetrics.player1, pairMetrics.player2],
      strength,
      occurrences: headsUpConfrontations,
      expectedOccurrences: headsUpConfrontations,
      zScore: 0, // Not applicable for this pattern
      handIds: [],
      description: `Very low aggression between ${pairMetrics.player1} and ${pairMetrics.player2} in ${headsUpConfrontations} heads-up spots (${(raisesPerConfrontation * 100).toFixed(1)}% raise rate vs expected ${(expectedRaisesPerHand * 100).toFixed(1)}%)`,
    };
  }

  /**
   * Detect coordinated betting patterns
   */
  private detectCoordinatedBetting(
    stream: EventStream,
    players: Set<PlayerId>
  ): CollusionIndicator[] {
    const indicators: CollusionIndicator[] = [];

    // Look for hands where multiple players show coordinated behavior
    const handStarts = stream.events.filter(e => e.type === 'hand_started');

    for (const start of handStarts) {
      const handId = start.handId;
      if (!handId) continue;

      const handEvents = stream.events.filter(e => e.handId === handId);
      const coordination = this.analyzeCoordinationInHand(handEvents, players);

      if (coordination) {
        indicators.push(coordination);
      }
    }

    // Aggregate similar patterns
    return this.aggregateCoordinationIndicators(indicators);
  }

  /**
   * Detect unnatural multiway checkdowns
   */
  private detectUnnaturalCheckdowns(
    stream: EventStream,
    players: Set<PlayerId>
  ): CollusionIndicator[] {
    const indicators: CollusionIndicator[] = [];

    // Find hands that went to showdown with minimal betting
    const handCompletions = stream.events.filter(
      e => e.type === 'hand_completed' && (e.data as any).finalStreet === 'river'
    );

    for (const completion of handCompletions) {
      const handId = completion.handId;
      if (!handId) continue;

      const handEvents = stream.events.filter(e => e.handId === handId);
      const checkdown = this.analyzeCheckdownPattern(handEvents);

      if (checkdown) {
        indicators.push(checkdown);
      }
    }

    // Aggregate patterns between same player groups
    return this.aggregateCheckdownIndicators(indicators);
  }

  // ==========================================================================
  // Analysis Helpers
  // ==========================================================================

  private analyzeCoordinationInHand(
    handEvents: readonly import('./IntegrityTypes').IntegrityEvent[],
    players: Set<PlayerId>
  ): CollusionIndicator | null {
    // Look for patterns like:
    // - Multiple players checking behind when pot is large
    // - Bet/fold/raise pattern that isolates a specific player

    const actions = handEvents.filter(e => e.type.startsWith('player_'));
    if (actions.length < 4) return null;

    // Check for whipsaw pattern: A bets, B raises, C folds, A folds
    // This dumps chips to B while squeezing C
    const bettor = actions.find(e => e.type === 'player_bet' || e.type === 'player_raise');
    if (!bettor) return null;

    // Simplified: just return null for now
    // Full implementation would track action sequences
    return null;
  }

  private analyzeCheckdownPattern(
    handEvents: readonly import('./IntegrityTypes').IntegrityEvent[]
  ): CollusionIndicator | null {
    // Count aggressive actions (bets/raises) vs passive (checks/calls)
    const aggressive = handEvents.filter(
      e => e.type === 'player_bet' || e.type === 'player_raise'
    ).length;

    const passive = handEvents.filter(
      e => e.type === 'player_check' || e.type === 'player_call'
    ).length;

    // If hand went to showdown with very few bets, it's suspicious
    const postflopActions = handEvents.filter(
      e => e.type.startsWith('player_') && e.street !== 'preflop'
    );

    if (postflopActions.length < 6) return null;

    const postflopAggressive = postflopActions.filter(
      e => e.type === 'player_bet' || e.type === 'player_raise'
    ).length;

    // Very passive postflop play (< 1 bet per street average)
    if (postflopAggressive >= 3) return null;

    // Get involved players
    const involvedPlayers = new Set<PlayerId>();
    for (const event of handEvents) {
      if (event.playerId) {
        involvedPlayers.add(event.playerId);
      }
    }

    if (involvedPlayers.size < 3) return null;

    const handId = handEvents[0]?.handId;

    return {
      pattern: 'UNNATURAL_CHECKDOWN',
      players: Array.from(involvedPlayers),
      strength: 0.5,
      occurrences: 1,
      expectedOccurrences: 0,
      zScore: 0,
      handIds: handId ? [handId] : [],
      description: `Multiway pot checked down to showdown with only ${postflopAggressive} postflop bets`,
    };
  }

  private aggregateCoordinationIndicators(
    indicators: CollusionIndicator[]
  ): CollusionIndicator[] {
    // Group by player pairs and aggregate
    const grouped = new Map<string, CollusionIndicator[]>();

    for (const ind of indicators) {
      const key = [...ind.players].sort().join('|');
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(ind);
    }

    // Only keep patterns that occur multiple times
    const aggregated: CollusionIndicator[] = [];
    for (const [, group] of grouped) {
      if (group.length >= 3) {
        const first = group[0];
        aggregated.push({
          ...first,
          occurrences: group.length,
          strength: Math.min(0.3 + group.length * 0.1, 1),
          handIds: group.flatMap(g => g.handIds),
          description: `${first.pattern} detected ${group.length} times`,
        });
      }
    }

    return aggregated;
  }

  private aggregateCheckdownIndicators(
    indicators: CollusionIndicator[]
  ): CollusionIndicator[] {
    // Group by involved players (sorted)
    const grouped = new Map<string, CollusionIndicator[]>();

    for (const ind of indicators) {
      const key = [...ind.players].sort().join('|');
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(ind);
    }

    // Only keep if pattern repeats with same players
    const aggregated: CollusionIndicator[] = [];
    for (const [, group] of grouped) {
      if (group.length >= 3) {
        const first = group[0];
        aggregated.push({
          ...first,
          occurrences: group.length,
          strength: Math.min(0.3 + group.length * 0.1, 1),
          handIds: group.flatMap(g => g.handIds),
          description: `Unnatural checkdowns ${group.length} times between players: ${first.players.join(', ')}`,
        });
      }
    }

    return aggregated;
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

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

  private generateExplanation(indicator: CollusionIndicator): string {
    switch (indicator.pattern) {
      case 'CHIP_TRANSFER_CONCENTRATION':
        return `An unusually high percentage of chips lost by one player went to a specific other player. This could indicate intentional chip dumping or coordinated play.`;

      case 'ASYMMETRIC_AGGRESSION':
        return `One player shows dramatically different aggression toward a specific opponent compared to others. This asymmetry suggests possible soft-play or signaling.`;

      case 'ABNORMAL_FOLD_PATTERN':
        return `One player folds to a specific opponent at a much higher rate than to others. This could indicate a pre-arranged strategy to transfer chips.`;

      case 'COORDINATED_BETTING':
        return `Multiple players show betting patterns that appear coordinated to squeeze out or target specific opponents.`;

      case 'SOFT_PLAY_HEADS_UP':
        return `Two players show unusually passive play against each other in heads-up situations, avoiding normal value betting.`;

      case 'UNNATURAL_CHECKDOWN':
        return `A multiway pot was checked down to showdown with minimal betting, which is statistically unusual and could indicate coordination.`;

      default:
        return indicator.description;
    }
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createCollusionDetector(
  thresholds?: DetectionThresholds
): CollusionDetector {
  return new CollusionDetector(thresholds);
}
