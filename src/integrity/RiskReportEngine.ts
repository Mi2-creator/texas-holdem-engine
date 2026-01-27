/**
 * RiskReportEngine.ts
 * Phase 22 - Risk report generation engine
 *
 * Generates comprehensive integrity reports:
 * - Per-player risk reports
 * - Per-table risk reports
 * - Aggregated signals and indicators
 * - Risk level classification
 *
 * Pure computation, no side effects.
 */

import { PlayerId } from '../security/Identity';
import {
  SessionId,
  PlayerIntegrityReport,
  TableIntegrityReport,
  RiskLevel,
  DetectionSignal,
  CollusionIndicator,
  SoftPlayIndicator,
  AuthorityAbuseIndicator,
  PlayerMetrics,
  ChipFlowMatrix,
  DetectionThresholds,
  DEFAULT_DETECTION_THRESHOLDS,
  generateReportId,
} from './IntegrityTypes';
import { EventStream } from './EventCollector';
import { BehaviorMetricsCalculator } from './BehaviorMetrics';
import { CollusionDetector } from './CollusionDetector';
import { SoftPlayDetector } from './SoftPlayDetector';
import { AuthorityAbuseDetector } from './AuthorityAbuseDetector';

// ============================================================================
// RiskReportEngine Implementation
// ============================================================================

export class RiskReportEngine {
  private readonly metricsCalculator: BehaviorMetricsCalculator;
  private readonly collusionDetector: CollusionDetector;
  private readonly softPlayDetector: SoftPlayDetector;
  private readonly authorityAbuseDetector: AuthorityAbuseDetector;
  private readonly thresholds: DetectionThresholds;

  constructor(thresholds: DetectionThresholds = DEFAULT_DETECTION_THRESHOLDS) {
    this.thresholds = thresholds;
    this.metricsCalculator = new BehaviorMetricsCalculator();
    this.collusionDetector = new CollusionDetector(thresholds, this.metricsCalculator);
    this.softPlayDetector = new SoftPlayDetector(thresholds, this.metricsCalculator);
    this.authorityAbuseDetector = new AuthorityAbuseDetector(thresholds, this.metricsCalculator);
  }

  // ==========================================================================
  // Main Report Generation API
  // ==========================================================================

  /**
   * Generate a comprehensive table integrity report
   */
  generateTableReport(stream: EventStream): TableIntegrityReport {
    // Calculate all metrics
    const allPlayerMetrics = this.metricsCalculator.calculateAllPlayerMetrics(stream);
    const chipFlowMatrix = this.metricsCalculator.calculateChipFlowMatrix(stream);

    // Run all detectors
    const collusionIndicators = this.collusionDetector.detectCollusionPatterns(stream);
    const softPlayIndicators = this.softPlayDetector.detectSoftPlayPatterns(stream);
    const authorityAbuseIndicators = this.authorityAbuseDetector.detectAuthorityAbusePatterns(stream);

    // Generate per-player reports
    const playerReports = new Map<PlayerId, PlayerIntegrityReport>();
    for (const [playerId, metrics] of allPlayerMetrics) {
      const playerReport = this.generatePlayerReport(
        stream,
        playerId,
        metrics,
        collusionIndicators,
        softPlayIndicators
      );
      playerReports.set(playerId, playerReport);
    }

    // Calculate table-level statistics
    const totalHands = this.countHands(stream);
    const totalPlayers = allPlayerMetrics.size;
    const totalChipsExchanged = this.calculateTotalChipsExchanged(chipFlowMatrix);
    const rakeCollected = this.calculateRakeCollected(stream);
    const concentrationIndex = this.calculateConcentrationIndex(chipFlowMatrix);

    // Count authority activity
    const authorityInterventions = stream.events.filter(
      e => e.type === 'manager_intervention' || e.type === 'owner_intervention'
    ).length;
    const pauseEvents = stream.events.filter(e => e.type === 'table_paused').length;
    const kickEvents = stream.events.filter(e => e.type === 'player_kicked').length;
    const configChanges = stream.events.filter(e => e.type === 'config_changed').length;

    // Calculate overall table risk
    const { riskLevel, riskScore, confidence } = this.calculateTableRisk(
      collusionIndicators,
      softPlayIndicators,
      authorityAbuseIndicators,
      playerReports
    );

    return {
      reportId: generateReportId(),
      tableId: stream.tableId,
      clubId: stream.clubId,
      sessionId: stream.sessionId,
      riskLevel,
      riskScore,
      confidence,
      totalHands,
      totalPlayers,
      totalChipsExchanged,
      rakeCollected,
      chipFlowMatrix,
      concentrationIndex,
      playerReports,
      collusionIndicators,
      softPlayIndicators,
      authorityAbuseIndicators,
      authorityInterventions,
      pauseEvents,
      kickEvents,
      configChanges,
      generatedAt: Date.now(),
    };
  }

  /**
   * Generate a player-specific integrity report
   */
  generatePlayerReport(
    stream: EventStream,
    playerId: PlayerId,
    metrics?: PlayerMetrics,
    collusionIndicators?: readonly CollusionIndicator[],
    softPlayIndicators?: readonly SoftPlayIndicator[]
  ): PlayerIntegrityReport {
    // Calculate metrics if not provided
    const playerMetrics = metrics ?? this.metricsCalculator.calculatePlayerMetrics(stream, playerId);

    // Get or calculate indicators
    const allCollusion = collusionIndicators ?? this.collusionDetector.detectCollusionPatterns(stream);
    const allSoftPlay = softPlayIndicators ?? this.softPlayDetector.detectSoftPlayPatterns(stream);

    // Filter indicators involving this player
    const playerCollusion = allCollusion.filter(
      ind => ind.players.includes(playerId)
    );
    const playerSoftPlay = allSoftPlay.filter(
      ind => ind.player === playerId || ind.opponent === playerId
    );

    // Convert to signals
    const collusionSignals = this.collusionDetector.indicatorsToSignals(playerCollusion);
    const softPlaySignals = this.softPlayDetector.indicatorsToSignals(playerSoftPlay);
    const allSignals = [...collusionSignals, ...softPlaySignals];

    // Find suspicious associations
    const suspiciousAssociations = this.findSuspiciousAssociations(
      playerId,
      playerCollusion,
      playerSoftPlay
    );

    // Calculate player risk
    const { riskLevel, riskScore, confidence } = this.calculatePlayerRisk(
      playerCollusion,
      playerSoftPlay,
      allSignals
    );

    return {
      reportId: generateReportId(),
      playerId,
      sessionId: stream.sessionId,
      clubId: stream.clubId,
      tableId: stream.tableId,
      riskLevel,
      riskScore,
      confidence,
      metrics: playerMetrics,
      signals: allSignals,
      collusionIndicators: playerCollusion,
      softPlayIndicators: playerSoftPlay,
      suspiciousAssociations,
      generatedAt: Date.now(),
    };
  }

  /**
   * Generate a quick risk summary without full reports
   */
  generateQuickSummary(stream: EventStream): {
    tableRiskLevel: RiskLevel;
    playerRiskLevels: Map<PlayerId, RiskLevel>;
    topConcerns: string[];
  } {
    const collusionIndicators = this.collusionDetector.detectCollusionPatterns(stream);
    const softPlayIndicators = this.softPlayDetector.detectSoftPlayPatterns(stream);
    const authorityAbuseIndicators = this.authorityAbuseDetector.detectAuthorityAbusePatterns(stream);

    // Calculate table risk
    const { riskLevel: tableRiskLevel } = this.calculateTableRiskFromIndicators(
      collusionIndicators,
      softPlayIndicators,
      authorityAbuseIndicators
    );

    // Calculate per-player risk levels
    const playerRiskLevels = new Map<PlayerId, RiskLevel>();
    const players = this.extractPlayers(stream);

    for (const playerId of players) {
      const playerCollusion = collusionIndicators.filter(
        ind => ind.players.includes(playerId)
      );
      const playerSoftPlay = softPlayIndicators.filter(
        ind => ind.player === playerId || ind.opponent === playerId
      );

      const { riskLevel } = this.calculatePlayerRisk(
        playerCollusion,
        playerSoftPlay,
        []
      );
      playerRiskLevels.set(playerId, riskLevel);
    }

    // Identify top concerns
    const topConcerns: string[] = [];

    // High-strength indicators
    const highStrengthIndicators = [
      ...collusionIndicators.filter(i => i.strength >= 0.7),
      ...softPlayIndicators.filter(i => i.strength >= 0.7),
      ...authorityAbuseIndicators.filter(i => i.strength >= 0.7),
    ];

    for (const indicator of highStrengthIndicators.slice(0, 5)) {
      topConcerns.push((indicator as any).description);
    }

    return {
      tableRiskLevel,
      playerRiskLevels,
      topConcerns,
    };
  }

  // ==========================================================================
  // Risk Calculation
  // ==========================================================================

  private calculateTableRisk(
    collusionIndicators: readonly CollusionIndicator[],
    softPlayIndicators: readonly SoftPlayIndicator[],
    authorityAbuseIndicators: readonly AuthorityAbuseIndicator[],
    playerReports: Map<PlayerId, PlayerIntegrityReport>
  ): { riskLevel: RiskLevel; riskScore: number; confidence: number } {
    // Base risk from indicators
    const baseRisk = this.calculateTableRiskFromIndicators(
      collusionIndicators,
      softPlayIndicators,
      authorityAbuseIndicators
    );

    // Adjust based on player reports
    let playerRiskSum = 0;
    let highRiskPlayers = 0;

    for (const [, report] of playerReports) {
      playerRiskSum += report.riskScore;
      if (report.riskLevel === 'HIGH_RISK' || report.riskLevel === 'CRITICAL') {
        highRiskPlayers++;
      }
    }

    const avgPlayerRisk = playerReports.size > 0 ? playerRiskSum / playerReports.size : 0;

    // Combined score
    const combinedScore = Math.min(
      baseRisk.riskScore * 0.6 + avgPlayerRisk * 0.4,
      100
    );

    // Boost if multiple high-risk players
    const boostedScore = highRiskPlayers >= 2
      ? Math.min(combinedScore + 15, 100)
      : combinedScore;

    return {
      riskLevel: this.scoreToRiskLevel(boostedScore),
      riskScore: Math.round(boostedScore),
      confidence: baseRisk.confidence,
    };
  }

  private calculateTableRiskFromIndicators(
    collusionIndicators: readonly CollusionIndicator[],
    softPlayIndicators: readonly SoftPlayIndicator[],
    authorityAbuseIndicators: readonly AuthorityAbuseIndicator[]
  ): { riskLevel: RiskLevel; riskScore: number; confidence: number } {
    let score = 0;
    let totalWeight = 0;

    // Weight collusion indicators heavily
    for (const indicator of collusionIndicators) {
      const weight = 30;
      score += indicator.strength * weight;
      totalWeight += weight;
    }

    // Soft-play indicators
    for (const indicator of softPlayIndicators) {
      const weight = 20;
      score += indicator.strength * weight;
      totalWeight += weight;
    }

    // Authority abuse indicators
    for (const indicator of authorityAbuseIndicators) {
      const weight = 25;
      score += indicator.strength * weight;
      totalWeight += weight;
    }

    // Normalize score to 0-100
    const normalizedScore = totalWeight > 0
      ? Math.min((score / totalWeight) * 100, 100)
      : 0;

    // Confidence based on sample size
    const totalIndicators = collusionIndicators.length + softPlayIndicators.length + authorityAbuseIndicators.length;
    const confidence = totalIndicators > 0
      ? Math.min(0.5 + totalIndicators * 0.1, 0.95)
      : 0.3;

    return {
      riskLevel: this.scoreToRiskLevel(normalizedScore),
      riskScore: Math.round(normalizedScore),
      confidence,
    };
  }

  private calculatePlayerRisk(
    collusionIndicators: readonly CollusionIndicator[],
    softPlayIndicators: readonly SoftPlayIndicator[],
    signals: readonly DetectionSignal[]
  ): { riskLevel: RiskLevel; riskScore: number; confidence: number } {
    let score = 0;

    // Score from collusion indicators
    for (const indicator of collusionIndicators) {
      score += indicator.strength * 40;
    }

    // Score from soft-play indicators
    for (const indicator of softPlayIndicators) {
      score += indicator.strength * 30;
    }

    // Score from high-severity signals
    for (const signal of signals) {
      switch (signal.severity) {
        case 'CRITICAL': score += 20; break;
        case 'HIGH': score += 15; break;
        case 'MEDIUM': score += 10; break;
        case 'LOW': score += 5; break;
      }
    }

    // Normalize
    const normalizedScore = Math.min(score, 100);

    // Confidence based on evidence
    const totalEvidence = collusionIndicators.length + softPlayIndicators.length + signals.length;
    const confidence = totalEvidence > 0
      ? Math.min(0.4 + totalEvidence * 0.1, 0.9)
      : 0.2;

    return {
      riskLevel: this.scoreToRiskLevel(normalizedScore),
      riskScore: Math.round(normalizedScore),
      confidence,
    };
  }

  private scoreToRiskLevel(score: number): RiskLevel {
    if (score >= 80) return 'CRITICAL';
    if (score >= 60) return 'HIGH_RISK';
    if (score >= 40) return 'MODERATE_RISK';
    if (score >= 20) return 'LOW_RISK';
    return 'CLEAN';
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  private countHands(stream: EventStream): number {
    return stream.events.filter(e => e.type === 'hand_started').length;
  }

  private calculateTotalChipsExchanged(matrix: ChipFlowMatrix): number {
    let total = 0;
    for (const [, targets] of matrix.flows) {
      for (const [, amount] of targets) {
        total += amount;
      }
    }
    return total;
  }

  private calculateRakeCollected(stream: EventStream): number {
    let total = 0;
    const rakeEvents = stream.events.filter(e => e.type === 'rake_collected');
    for (const event of rakeEvents) {
      total += (event.data as any).changeAmount ?? 0;
    }
    return total;
  }

  private calculateConcentrationIndex(matrix: ChipFlowMatrix): number {
    // Herfindahl-Hirschman-like index for chip flow concentration
    // Higher = more concentrated (potentially suspicious)

    const playerFlows = new Map<PlayerId, number>();

    // Sum total chips lost by each player
    for (const [player, targets] of matrix.flows) {
      let totalLost = 0;
      for (const [, amount] of targets) {
        totalLost += amount;
      }
      playerFlows.set(player, totalLost);
    }

    const totalFlow = Array.from(playerFlows.values()).reduce((a, b) => a + b, 0);
    if (totalFlow === 0) return 0;

    // Calculate HHI
    let hhi = 0;
    for (const [, flow] of playerFlows) {
      const share = flow / totalFlow;
      hhi += share * share;
    }

    return hhi;
  }

  private findSuspiciousAssociations(
    playerId: PlayerId,
    collusionIndicators: readonly CollusionIndicator[],
    softPlayIndicators: readonly SoftPlayIndicator[]
  ): { player: PlayerId; reason: string; strength: number }[] {
    const associations: { player: PlayerId; reason: string; strength: number }[] = [];
    const seen = new Set<PlayerId>();

    // From collusion indicators
    for (const indicator of collusionIndicators) {
      for (const otherPlayer of indicator.players) {
        if (otherPlayer !== playerId && !seen.has(otherPlayer)) {
          seen.add(otherPlayer);
          associations.push({
            player: otherPlayer,
            reason: `${indicator.pattern}: ${indicator.description}`,
            strength: indicator.strength,
          });
        }
      }
    }

    // From soft-play indicators
    for (const indicator of softPlayIndicators) {
      const otherPlayer = indicator.player === playerId ? indicator.opponent : indicator.player;
      if (!seen.has(otherPlayer)) {
        seen.add(otherPlayer);
        associations.push({
          player: otherPlayer,
          reason: `${indicator.pattern}: ${indicator.description}`,
          strength: indicator.strength,
        });
      }
    }

    // Sort by strength
    return associations.sort((a, b) => b.strength - a.strength);
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
}

// ============================================================================
// Factory
// ============================================================================

export function createRiskReportEngine(
  thresholds?: DetectionThresholds
): RiskReportEngine {
  return new RiskReportEngine(thresholds);
}
