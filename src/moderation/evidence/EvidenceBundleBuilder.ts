/**
 * EvidenceBundleBuilder.ts
 * Phase 23 - Evidence bundle creation and verification
 *
 * Creates immutable, checksum-verified evidence bundles containing:
 * - Raw integrity events
 * - Behavior metrics
 * - Risk signals
 * - Hand outcome
 * - Table/club context
 */

import { PlayerId } from '../../security/Identity';
import { TableId, HandId } from '../../security/AuditLog';
import { ClubId } from '../../club/ClubTypes';
import { Street } from '../../game/engine/TableState';
import {
  IntegrityEvent,
  SessionId,
  PlayerMetrics,
  DetectionSignal,
  CollusionIndicator,
  SoftPlayIndicator,
  RiskLevel,
  HandEventData,
  StackChangeData,
} from '../../integrity/IntegrityTypes';
import { EventStream } from '../../integrity/EventCollector';
import { BehaviorMetricsCalculator } from '../../integrity/BehaviorMetrics';
import { CollusionDetector } from '../../integrity/CollusionDetector';
import { SoftPlayDetector } from '../../integrity/SoftPlayDetector';
import {
  EvidenceBundle,
  EvidenceBundleId,
  HandOutcome,
  TableContext,
  HandReplay,
  Checksum,
  calculateChecksum,
  verifyChecksum,
  generateEvidenceBundleId,
} from '../ModerationTypes';
import { HandReplayEngine } from '../replay/HandReplayEngine';

// ============================================================================
// EvidenceBundleBuilder Implementation
// ============================================================================

export class EvidenceBundleBuilder {
  private readonly metricsCalculator: BehaviorMetricsCalculator;
  private readonly collusionDetector: CollusionDetector;
  private readonly softPlayDetector: SoftPlayDetector;
  private readonly replayEngine: HandReplayEngine;

  constructor() {
    this.metricsCalculator = new BehaviorMetricsCalculator();
    this.collusionDetector = new CollusionDetector();
    this.softPlayDetector = new SoftPlayDetector();
    this.replayEngine = new HandReplayEngine();
  }

  /**
   * Build an evidence bundle for a specific hand
   */
  buildBundle(
    stream: EventStream,
    handId: HandId,
    flagReason: string,
    riskLevel: RiskLevel
  ): EvidenceBundle | null {
    // Get all events for this hand
    const handEvents = stream.events.filter(e => e.handId === handId);
    if (handEvents.length === 0) {
      return null;
    }

    // Reconstruct hand replay
    const replay = this.replayEngine.reconstructHand(stream, handId);
    if (!replay) {
      return null;
    }

    // Extract involved players
    const involvedPlayers = this.extractInvolvedPlayers(handEvents);

    // Calculate metrics for involved players
    const playerMetrics = new Map<PlayerId, PlayerMetrics>();
    for (const playerId of involvedPlayers) {
      const metrics = this.metricsCalculator.calculatePlayerMetrics(stream, playerId);
      playerMetrics.set(playerId, metrics);
    }

    // Run detection analysis
    const allCollusionIndicators = this.collusionDetector.detectCollusionPatterns(stream);
    const allSoftPlayIndicators = this.softPlayDetector.detectSoftPlayPatterns(stream);

    // Filter indicators relevant to this hand's players
    const collusionIndicators = allCollusionIndicators.filter(
      ind => ind.players.some(p => involvedPlayers.includes(p))
    );
    const softPlayIndicators = allSoftPlayIndicators.filter(
      ind => involvedPlayers.includes(ind.player) || involvedPlayers.includes(ind.opponent)
    );

    // Convert to signals
    const collusionSignals = this.collusionDetector.indicatorsToSignals(collusionIndicators);
    const softPlaySignals = this.softPlayDetector.indicatorsToSignals(softPlayIndicators);
    const signals = [...collusionSignals, ...softPlaySignals];

    // Extract hand outcome
    const outcome = this.extractHandOutcome(stream, handId);
    if (!outcome) {
      return null;
    }

    // Build table context
    const tableContext = this.buildTableContext(stream);

    // Generate bundle ID
    const bundleId = generateEvidenceBundleId();

    // Calculate checksum for integrity verification
    const bundleData = JSON.stringify({
      bundleId,
      handId,
      events: handEvents.map(e => e.eventId),
      outcome,
      replayChecksum: replay.checksum,
    });
    const checksum = calculateChecksum(bundleData);

    return {
      bundleId,
      handId,
      createdAt: Date.now(),
      events: handEvents,
      replay,
      playerMetrics,
      signals,
      collusionIndicators,
      softPlayIndicators,
      outcome,
      tableContext,
      involvedPlayers,
      flagReason,
      riskLevel,
      checksum,
      isVerified: true,
    };
  }

  /**
   * Verify the integrity of an evidence bundle
   */
  verifyBundle(bundle: EvidenceBundle): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // Verify main bundle checksum
    const bundleData = JSON.stringify({
      bundleId: bundle.bundleId,
      handId: bundle.handId,
      events: bundle.events.map(e => e.eventId),
      outcome: bundle.outcome,
      replayChecksum: bundle.replay.checksum,
    });

    if (!verifyChecksum(bundleData, bundle.checksum)) {
      errors.push('Bundle checksum verification failed - data may have been tampered');
    }

    // Verify replay determinism
    if (!this.replayEngine.verifyReplayDeterminism(bundle.replay)) {
      errors.push('Replay checksum verification failed - replay may have been modified');
    }

    // Verify event count matches
    const handEvents = bundle.events.filter(e => e.handId === bundle.handId);
    if (handEvents.length !== bundle.events.length) {
      errors.push('Event set contains events from other hands');
    }

    // Verify all involved players are in metrics
    for (const playerId of bundle.involvedPlayers) {
      if (!bundle.playerMetrics.has(playerId)) {
        errors.push(`Missing metrics for player ${playerId}`);
      }
    }

    // Verify outcome matches events
    const completionEvent = bundle.events.find(e => e.type === 'hand_completed');
    if (completionEvent) {
      const completionData = completionEvent.data as HandEventData;
      if (completionData.potSize !== bundle.outcome.potSize) {
        errors.push('Outcome pot size does not match hand completion event');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Create a tamper-evident hash chain of multiple bundles
   */
  createBundleChain(bundles: readonly EvidenceBundle[]): {
    chainHash: string;
    bundleHashes: ReadonlyMap<EvidenceBundleId, string>;
  } {
    const bundleHashes = new Map<EvidenceBundleId, string>();
    let chainHash = '';

    for (const bundle of bundles) {
      const bundleHash = calculateChecksum(
        chainHash + bundle.checksum
      );
      bundleHashes.set(bundle.bundleId, bundleHash);
      chainHash = bundleHash;
    }

    return {
      chainHash,
      bundleHashes,
    };
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  private extractInvolvedPlayers(handEvents: readonly IntegrityEvent[]): PlayerId[] {
    const players = new Set<PlayerId>();

    for (const event of handEvents) {
      if (event.playerId && event.playerId !== ('rake' as PlayerId)) {
        players.add(event.playerId);
      }

      if (event.type === 'hand_started') {
        const data = event.data as HandEventData;
        for (const p of data.players) {
          if (p !== ('rake' as unknown)) {
            players.add(p);
          }
        }
      }

      if (event.type === 'pot_awarded') {
        const data = event.data as StackChangeData;
        players.add(data.playerId);
        if (data.fromPlayers) {
          for (const p of data.fromPlayers) {
            players.add(p);
          }
        }
      }
    }

    return Array.from(players);
  }

  private extractHandOutcome(
    stream: EventStream,
    handId: HandId
  ): HandOutcome | null {
    const handEvents = stream.events.filter(e => e.handId === handId);

    // Find completion event
    const completionEvent = handEvents.find(e => e.type === 'hand_completed');
    if (!completionEvent) {
      return null;
    }

    const completionData = completionEvent.data as HandEventData;

    // Find pot awards
    const potAwards = handEvents.filter(e => e.type === 'pot_awarded');
    const winners = potAwards.map(e => (e.data as StackChangeData).playerId);
    const potSize = completionData.potSize ?? 0;

    // Calculate chip movements
    const chipMovements = new Map<PlayerId, number>();
    for (const event of handEvents) {
      if (event.type === 'pot_awarded') {
        const data = event.data as StackChangeData;
        chipMovements.set(
          data.playerId,
          (chipMovements.get(data.playerId) ?? 0) + data.changeAmount
        );
      }
    }

    // Find rake
    const rakeEvent = handEvents.find(e => e.type === 'rake_collected');
    const rake = rakeEvent ? (rakeEvent.data as StackChangeData).changeAmount : 0;

    // Determine if showdown was reached
    const showdownReached = completionData.finalStreet === 'river';

    return {
      handId,
      winners: [...new Set(winners)],
      potSize,
      finalStreet: completionData.finalStreet ?? 'preflop',
      showdownReached,
      rake,
      chipMovements,
    };
  }

  private buildTableContext(stream: EventStream): TableContext {
    const handStarts = stream.events.filter(e => e.type === 'hand_started');
    const firstHand = handStarts[0];
    const firstHandData = firstHand?.data as HandEventData | undefined;

    // Get unique players across all hands
    const allPlayers = new Set<PlayerId>();
    for (const start of handStarts) {
      const data = start.data as HandEventData;
      for (const p of data.players) {
        allPlayers.add(p);
      }
    }

    return {
      tableId: stream.tableId,
      clubId: stream.clubId,
      sessionId: stream.sessionId,
      blinds: firstHandData?.blinds ?? { small: 0, big: 0 },
      playerCount: allPlayers.size,
      handsPlayedInSession: handStarts.length,
      sessionStartTime: stream.startedAt,
    };
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createEvidenceBundleBuilder(): EvidenceBundleBuilder {
  return new EvidenceBundleBuilder();
}
