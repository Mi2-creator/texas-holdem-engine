/**
 * AuthorityAbuseDetector.ts
 * Phase 22 - Authority abuse pattern detection
 *
 * Detects suspicious authority behavior:
 * - Suspicious pause timing (pausing when losing)
 * - Config changes after personal losses
 * - Selective kicks of winning players
 * - Intervention correlation with outcomes
 *
 * All detections are rule-based and deterministic.
 */

import { PlayerId } from '../security/Identity';
import { HandId } from '../security/AuditLog';
import {
  AuthorityAbuseIndicator,
  AuthorityAbusePattern,
  DetectionSignal,
  SignalSeverity,
  DetectionThresholds,
  DEFAULT_DETECTION_THRESHOLDS,
  IntegrityEvent,
  AuthorityEventData,
  TableEventData,
  StackChangeData,
} from './IntegrityTypes';
import { EventStream } from './EventCollector';
import { BehaviorMetricsCalculator } from './BehaviorMetrics';

// ============================================================================
// AuthorityAbuseDetector Implementation
// ============================================================================

export class AuthorityAbuseDetector {
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
   * Run all authority abuse detection heuristics on an event stream
   */
  detectAuthorityAbusePatterns(stream: EventStream): AuthorityAbuseIndicator[] {
    const indicators: AuthorityAbuseIndicator[] = [];

    // Get all authority events
    const managerEvents = stream.events.filter(e => e.type === 'manager_intervention');
    const ownerEvents = stream.events.filter(e => e.type === 'owner_intervention');
    const pauseEvents = stream.events.filter(e => e.type === 'table_paused');
    const kickEvents = stream.events.filter(e => e.type === 'player_kicked');
    const configEvents = stream.events.filter(e => e.type === 'config_changed');

    // Skip if no authority activity
    if (
      managerEvents.length === 0 &&
      ownerEvents.length === 0 &&
      pauseEvents.length === 0 &&
      kickEvents.length === 0 &&
      configEvents.length === 0
    ) {
      return indicators;
    }

    // Get unique authorities
    const authorities = this.extractAuthorities(stream);

    for (const authority of authorities) {
      const role = this.getAuthorityRole(stream, authority);

      // 1. Suspicious pause timing
      const pauseTiming = this.detectSuspiciousPauseTiming(
        stream,
        authority,
        role,
        pauseEvents
      );
      if (pauseTiming) indicators.push(pauseTiming);

      // 2. Config changes after losses
      const configAfterLoss = this.detectConfigChangeAfterLoss(
        stream,
        authority,
        role,
        configEvents
      );
      if (configAfterLoss) indicators.push(configAfterLoss);

      // 3. Selective kicks
      const selectiveKicks = this.detectSelectiveKicks(
        stream,
        authority,
        role,
        kickEvents
      );
      if (selectiveKicks) indicators.push(selectiveKicks);

      // 4. Intervention correlation
      const correlation = this.detectInterventionCorrelation(
        stream,
        authority,
        role
      );
      if (correlation) indicators.push(correlation);
    }

    return indicators;
  }

  /**
   * Convert authority abuse indicators to detection signals
   */
  indicatorsToSignals(indicators: readonly AuthorityAbuseIndicator[]): DetectionSignal[] {
    return indicators.map(indicator => ({
      signalId: `authabuse_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      category: 'AUTHORITY_ABUSE',
      severity: this.strengthToSeverity(indicator.strength),
      description: indicator.description,
      explanation: this.generateExplanation(indicator),
      confidence: Math.min(indicator.strength, 1),
      involvedPlayers: [indicator.authority],
      relevantHands: [],
      evidenceMetrics: {
        strength: indicator.strength,
        occurrences: indicator.occurrences,
        correlatedOutcomes: indicator.correlatedOutcomes,
      },
      timestamp: Date.now(),
    }));
  }

  // ==========================================================================
  // Detection Heuristics
  // ==========================================================================

  /**
   * Detect suspicious pause timing
   *
   * Authority pausing the game when they are losing / in a bad spot
   */
  private detectSuspiciousPauseTiming(
    stream: EventStream,
    authority: PlayerId,
    role: 'manager' | 'owner',
    pauseEvents: readonly IntegrityEvent[]
  ): AuthorityAbuseIndicator | null {
    // Get pauses initiated by this authority
    const authorityPauses = pauseEvents.filter(
      e => (e.data as TableEventData).initiator === authority
    );

    if (authorityPauses.length < 2) {
      return null;
    }

    // Check how many pauses occurred during hands where authority was losing
    let pausesWhileLosing = 0;
    let totalPausesInHands = 0;

    for (const pause of authorityPauses) {
      // Find the most recent hand event before this pause
      const priorHandEvents = stream.events.filter(
        e => e.timestamp < pause.timestamp && e.handId !== null
      );

      if (priorHandEvents.length === 0) continue;

      // Check if there's an active hand (hand_started but no hand_completed)
      const lastHandStart = [...stream.events]
        .filter(e => e.type === 'hand_started' && e.timestamp < pause.timestamp)
        .sort((a, b) => b.timestamp - a.timestamp)[0];

      if (!lastHandStart) continue;

      const handCompleted = stream.events.some(
        e => e.type === 'hand_completed' &&
             e.handId === lastHandStart.handId &&
             e.timestamp < pause.timestamp
      );

      if (handCompleted) continue; // Not during an active hand

      totalPausesInHands++;

      // Was authority in a losing position?
      // Check if authority had already committed chips to pot
      const authorityActions = stream.events.filter(
        e => e.handId === lastHandStart.handId &&
             e.playerId === authority &&
             e.timestamp < pause.timestamp &&
             (e.type === 'player_call' || e.type === 'player_bet' || e.type === 'player_raise')
      );

      if (authorityActions.length > 0) {
        // They had money in the pot - check if facing a bet
        const lastAction = [...stream.events]
          .filter(
            e => e.handId === lastHandStart.handId &&
                 e.timestamp < pause.timestamp &&
                 e.type.startsWith('player_')
          )
          .sort((a, b) => b.timestamp - a.timestamp)[0];

        if (lastAction && lastAction.playerId !== authority) {
          // Last action wasn't theirs - they paused facing action
          pausesWhileLosing++;
        }
      }
    }

    if (totalPausesInHands < 2) {
      return null;
    }

    const suspiciousRate = pausesWhileLosing / totalPausesInHands;

    if (suspiciousRate < this.thresholds.pauseCorrelationThreshold) {
      return null;
    }

    const strength = Math.min(
      (suspiciousRate - this.thresholds.pauseCorrelationThreshold) /
        (1 - this.thresholds.pauseCorrelationThreshold),
      1
    );

    return {
      pattern: 'SUSPICIOUS_PAUSE_TIMING',
      authority,
      role,
      strength,
      occurrences: totalPausesInHands,
      correlatedOutcomes: pausesWhileLosing,
      description: `${authority} paused ${pausesWhileLosing}/${totalPausesInHands} times while facing unfavorable situations`,
    };
  }

  /**
   * Detect config changes after personal losses
   */
  private detectConfigChangeAfterLoss(
    stream: EventStream,
    authority: PlayerId,
    role: 'manager' | 'owner',
    configEvents: readonly IntegrityEvent[]
  ): AuthorityAbuseIndicator | null {
    // Get config changes by this authority
    const authorityConfigs = configEvents.filter(
      e => (e.data as TableEventData).initiator === authority
    );

    if (authorityConfigs.length < 2) {
      return null;
    }

    // Check how many config changes followed a loss
    let configsAfterLoss = 0;
    const timeWindow = 60000; // 1 minute window

    for (const config of authorityConfigs) {
      // Check for losses within the time window before config change
      const recentLosses = stream.events.filter(
        e => e.type === 'pot_awarded' &&
             e.timestamp > config.timestamp - timeWindow &&
             e.timestamp < config.timestamp &&
             (e.data as StackChangeData).fromPlayers?.includes(authority)
      );

      if (recentLosses.length > 0) {
        configsAfterLoss++;
      }
    }

    if (authorityConfigs.length < 2) {
      return null;
    }

    const correlationRate = configsAfterLoss / authorityConfigs.length;

    if (correlationRate < this.thresholds.configChangeCorrelationThreshold) {
      return null;
    }

    const strength = Math.min(
      (correlationRate - this.thresholds.configChangeCorrelationThreshold) /
        (1 - this.thresholds.configChangeCorrelationThreshold),
      1
    );

    return {
      pattern: 'CONFIG_CHANGE_AFTER_LOSS',
      authority,
      role,
      strength,
      occurrences: authorityConfigs.length,
      correlatedOutcomes: configsAfterLoss,
      description: `${authority} changed config ${configsAfterLoss}/${authorityConfigs.length} times shortly after personal losses`,
    };
  }

  /**
   * Detect selective kicks targeting winning players
   */
  private detectSelectiveKicks(
    stream: EventStream,
    authority: PlayerId,
    role: 'manager' | 'owner',
    kickEvents: readonly IntegrityEvent[]
  ): AuthorityAbuseIndicator | null {
    // Get kicks initiated by this authority
    const authorityKicks = kickEvents.filter(
      e => (e.data as TableEventData).initiator === authority
    );

    if (authorityKicks.length < 2) {
      return null;
    }

    // Check if kicked players were typically winning against the authority
    let kicksOfWinners = 0;
    const chipFlowMatrix = this.metricsCalculator.calculateChipFlowMatrix(stream);

    for (const kick of authorityKicks) {
      const data = kick.data as TableEventData;
      const targetPlayer = data.targetPlayer;

      if (!targetPlayer) continue;

      // Check net chip flow from authority to this player
      const authorityToTarget = chipFlowMatrix.flows.get(authority)?.get(targetPlayer) ?? 0;
      const targetToAuthority = chipFlowMatrix.flows.get(targetPlayer)?.get(authority) ?? 0;

      // If authority has lost chips to this player
      if (authorityToTarget > targetToAuthority) {
        kicksOfWinners++;
      }
    }

    if (authorityKicks.length < 2) {
      return null;
    }

    const selectiveRate = kicksOfWinners / authorityKicks.length;

    if (selectiveRate < 0.6) {
      return null;
    }

    const strength = Math.min((selectiveRate - 0.6) / 0.4, 1);

    return {
      pattern: 'SELECTIVE_KICK',
      authority,
      role,
      strength,
      occurrences: authorityKicks.length,
      correlatedOutcomes: kicksOfWinners,
      description: `${authority} kicked ${kicksOfWinners}/${authorityKicks.length} players who had won chips from them`,
    };
  }

  /**
   * Detect overall correlation between authority interventions and personal outcomes
   */
  private detectInterventionCorrelation(
    stream: EventStream,
    authority: PlayerId,
    role: 'manager' | 'owner'
  ): AuthorityAbuseIndicator | null {
    // Get all interventions (pauses, kicks, config changes) by this authority
    const interventions = stream.events.filter(
      e => (e.type === 'table_paused' ||
            e.type === 'player_kicked' ||
            e.type === 'config_changed' ||
            e.type === 'manager_intervention' ||
            e.type === 'owner_intervention') &&
           this.getInitiator(e) === authority
    );

    if (interventions.length < 3) {
      return null;
    }

    // Calculate authority's win rate before and after interventions
    const handsBefore: Set<HandId> = new Set();
    const handsAfter: Set<HandId> = new Set();

    for (const intervention of interventions) {
      // Hands in the hour before intervention
      const priorHands = stream.events.filter(
        e => e.type === 'hand_started' &&
             e.timestamp > intervention.timestamp - 3600000 &&
             e.timestamp < intervention.timestamp
      );
      for (const h of priorHands) {
        if (h.handId) handsBefore.add(h.handId);
      }

      // Hands in the hour after intervention
      const followingHands = stream.events.filter(
        e => e.type === 'hand_started' &&
             e.timestamp > intervention.timestamp &&
             e.timestamp < intervention.timestamp + 3600000
      );
      for (const h of followingHands) {
        if (h.handId) handsAfter.add(h.handId);
      }
    }

    // Calculate win rates
    const winsBefore = this.countWinsInHands(stream, authority, handsBefore);
    const winsAfter = this.countWinsInHands(stream, authority, handsAfter);

    const winRateBefore = handsBefore.size > 0 ? winsBefore / handsBefore.size : 0;
    const winRateAfter = handsAfter.size > 0 ? winsAfter / handsAfter.size : 0;

    // Significant improvement after interventions is suspicious
    const improvement = winRateAfter - winRateBefore;

    if (improvement < 0.15) {
      return null;
    }

    const strength = Math.min(improvement / 0.3, 1);

    return {
      pattern: 'INTERVENTION_CORRELATION',
      authority,
      role,
      strength,
      occurrences: interventions.length,
      correlatedOutcomes: Math.round(improvement * 100),
      description: `${authority}'s win rate improved by ${(improvement * 100).toFixed(1)}% after ${interventions.length} interventions`,
    };
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  private extractAuthorities(stream: EventStream): Set<PlayerId> {
    const authorities = new Set<PlayerId>();

    // From explicit authority events
    const authorityEvents = stream.events.filter(
      e => e.type === 'manager_intervention' || e.type === 'owner_intervention'
    );
    for (const event of authorityEvents) {
      if (event.playerId) {
        authorities.add(event.playerId);
      }
    }

    // From pause events
    const pauseEvents = stream.events.filter(e => e.type === 'table_paused');
    for (const event of pauseEvents) {
      const data = event.data as TableEventData;
      if (data.initiator) {
        authorities.add(data.initiator);
      }
    }

    // From kick events
    const kickEvents = stream.events.filter(e => e.type === 'player_kicked');
    for (const event of kickEvents) {
      const data = event.data as TableEventData;
      if (data.initiator) {
        authorities.add(data.initiator);
      }
    }

    // From config events
    const configEvents = stream.events.filter(e => e.type === 'config_changed');
    for (const event of configEvents) {
      const data = event.data as TableEventData;
      if (data.initiator) {
        authorities.add(data.initiator);
      }
    }

    return authorities;
  }

  private getAuthorityRole(stream: EventStream, authority: PlayerId): 'manager' | 'owner' {
    // Check if there's an owner intervention from this authority
    const ownerIntervention = stream.events.find(
      e => e.type === 'owner_intervention' && e.playerId === authority
    );

    return ownerIntervention ? 'owner' : 'manager';
  }

  private getInitiator(event: IntegrityEvent): PlayerId | null {
    if (event.type === 'manager_intervention' || event.type === 'owner_intervention') {
      return event.playerId;
    }

    const data = event.data as TableEventData;
    return data.initiator ?? null;
  }

  private countWinsInHands(
    stream: EventStream,
    player: PlayerId,
    handIds: Set<HandId>
  ): number {
    return stream.events.filter(
      e => e.type === 'pot_awarded' &&
           e.handId &&
           handIds.has(e.handId) &&
           (e.data as StackChangeData).playerId === player
    ).length;
  }

  private strengthToSeverity(strength: number): SignalSeverity {
    if (strength >= 0.8) return 'CRITICAL';
    if (strength >= 0.6) return 'HIGH';
    if (strength >= 0.4) return 'MEDIUM';
    return 'LOW';
  }

  private generateExplanation(indicator: AuthorityAbuseIndicator): string {
    switch (indicator.pattern) {
      case 'SUSPICIOUS_PAUSE_TIMING':
        return `The authority frequently pauses the game when they are in unfavorable positions during hands. This could indicate abuse of pause functionality to avoid losses or to disrupt opponents.`;

      case 'CONFIG_CHANGE_AFTER_LOSS':
        return `The authority changes game configuration shortly after personal losses at a higher rate than expected. This could indicate retaliatory or manipulative config changes.`;

      case 'SELECTIVE_KICK':
        return `The authority kicks players who have won chips from them at a disproportionately high rate. This could indicate retaliatory behavior or abuse of kick authority.`;

      case 'INTERVENTION_CORRELATION':
        return `The authority's personal win rate improves significantly after their interventions. This correlation suggests potential abuse of authority for personal gain.`;

      default:
        return indicator.description;
    }
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createAuthorityAbuseDetector(
  thresholds?: DetectionThresholds
): AuthorityAbuseDetector {
  return new AuthorityAbuseDetector(thresholds);
}
