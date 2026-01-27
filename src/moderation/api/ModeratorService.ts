/**
 * ModeratorService.ts
 * Phase 23 - Moderator API for case investigation
 *
 * Provides read-only operations for moderation:
 * - listFlaggedHands()
 * - getHandReplay(handId)
 * - getEvidenceBundle(handId)
 * - annotateCase()
 * - recommendResolution()
 *
 * No side effects on game state.
 */

import { PlayerId } from '../../security/Identity';
import { TableId, HandId } from '../../security/AuditLog';
import { ClubId } from '../../club/ClubTypes';
import {
  IntegrityEvent,
  SessionId,
  RiskLevel,
  DetectionSignal,
} from '../../integrity/IntegrityTypes';
import { EventStream } from '../../integrity/EventCollector';
import { RiskReportEngine } from '../../integrity/RiskReportEngine';
import {
  CaseId,
  EvidenceBundleId,
  ModeratorId,
  ModerationCase,
  CaseStatus,
  CaseAnnotation,
  ResolutionRecommendation,
  ResolutionType,
  FlaggedHandsFilter,
  FlaggedHandSummary,
  HandReplay,
  EvidenceBundle,
  generateCaseId,
  generateAnnotationId,
} from '../ModerationTypes';
import { HandReplayEngine } from '../replay/HandReplayEngine';
import { EvidenceBundleBuilder } from '../evidence/EvidenceBundleBuilder';
import { DecisionLogger } from './DecisionLogger';

// ============================================================================
// ModeratorService Implementation
// ============================================================================

export class ModeratorService {
  private readonly cases: Map<CaseId, ModerationCase>;
  private readonly handToCaseMap: Map<HandId, CaseId>;
  private readonly replayEngine: HandReplayEngine;
  private readonly evidenceBuilder: EvidenceBundleBuilder;
  private readonly riskReportEngine: RiskReportEngine;
  private readonly decisionLogger: DecisionLogger;

  constructor(decisionLogger?: DecisionLogger) {
    this.cases = new Map();
    this.handToCaseMap = new Map();
    this.replayEngine = new HandReplayEngine();
    this.evidenceBuilder = new EvidenceBundleBuilder();
    this.riskReportEngine = new RiskReportEngine();
    this.decisionLogger = decisionLogger ?? new DecisionLogger();
  }

  // ==========================================================================
  // Case Management
  // ==========================================================================

  /**
   * Create a moderation case for a flagged hand
   */
  createCase(
    stream: EventStream,
    handId: HandId,
    flagReason: string,
    riskLevel: RiskLevel
  ): ModerationCase | null {
    // Check if case already exists
    if (this.handToCaseMap.has(handId)) {
      return this.cases.get(this.handToCaseMap.get(handId)!) ?? null;
    }

    // Build evidence bundle
    const evidenceBundle = this.evidenceBuilder.buildBundle(
      stream,
      handId,
      flagReason,
      riskLevel
    );

    if (!evidenceBundle) {
      return null;
    }

    // Create case
    const caseId = generateCaseId();
    const now = Date.now();

    const moderationCase: ModerationCase = {
      caseId,
      createdAt: now,
      updatedAt: now,
      status: 'PENDING_REVIEW',
      evidenceBundle,
      assignedModerator: null,
      annotations: [],
      recommendation: null,
      resolvedAt: null,
      resolvedBy: null,
      finalDecision: null,
      decisionRationale: null,
    };

    this.cases.set(caseId, moderationCase);
    this.handToCaseMap.set(handId, caseId);

    // Log case creation
    this.decisionLogger.logAction(
      'system' as ModeratorId,
      'CASE_CREATED',
      caseId,
      { handId, flagReason, riskLevel }
    );

    return moderationCase;
  }

  /**
   * Get a case by ID
   */
  getCase(caseId: CaseId): ModerationCase | null {
    return this.cases.get(caseId) ?? null;
  }

  /**
   * Get a case by hand ID
   */
  getCaseByHandId(handId: HandId): ModerationCase | null {
    const caseId = this.handToCaseMap.get(handId);
    return caseId ? this.cases.get(caseId) ?? null : null;
  }

  // ==========================================================================
  // Query API
  // ==========================================================================

  /**
   * List flagged hands with optional filters
   */
  listFlaggedHands(filter?: FlaggedHandsFilter): FlaggedHandSummary[] {
    const summaries: FlaggedHandSummary[] = [];

    for (const [, moderationCase] of this.cases) {
      const bundle = moderationCase.evidenceBundle;

      // Apply filters
      if (filter?.clubId && bundle.tableContext.clubId !== filter.clubId) continue;
      if (filter?.tableId && bundle.tableContext.tableId !== filter.tableId) continue;
      if (filter?.riskLevel && bundle.riskLevel !== filter.riskLevel) continue;
      if (filter?.status && moderationCase.status !== filter.status) continue;
      if (filter?.fromTime && bundle.createdAt < filter.fromTime) continue;
      if (filter?.toTime && bundle.createdAt > filter.toTime) continue;

      if (filter?.playerId) {
        if (!bundle.involvedPlayers.includes(filter.playerId)) continue;
      }

      // Get primary signal
      const primarySignal = bundle.signals.length > 0
        ? bundle.signals[0].description
        : bundle.flagReason;

      summaries.push({
        handId: bundle.handId,
        caseId: moderationCase.caseId,
        clubId: bundle.tableContext.clubId,
        tableId: bundle.tableContext.tableId,
        timestamp: bundle.createdAt,
        riskLevel: bundle.riskLevel,
        status: moderationCase.status,
        involvedPlayers: bundle.involvedPlayers,
        primarySignal,
        potSize: bundle.outcome.potSize,
      });
    }

    // Sort by timestamp (most recent first)
    summaries.sort((a, b) => b.timestamp - a.timestamp);

    // Apply pagination
    const offset = filter?.offset ?? 0;
    const limit = filter?.limit ?? 100;

    return summaries.slice(offset, offset + limit);
  }

  /**
   * Get hand replay for investigation
   */
  getHandReplay(caseId: CaseId, moderatorId: ModeratorId): HandReplay | null {
    const moderationCase = this.cases.get(caseId);
    if (!moderationCase) {
      return null;
    }

    // Log replay view
    this.decisionLogger.logAction(
      moderatorId,
      'REPLAY_VIEWED',
      caseId,
      { handId: moderationCase.evidenceBundle.handId }
    );

    return moderationCase.evidenceBundle.replay;
  }

  /**
   * Get evidence bundle for investigation
   */
  getEvidenceBundle(caseId: CaseId, moderatorId: ModeratorId): EvidenceBundle | null {
    const moderationCase = this.cases.get(caseId);
    if (!moderationCase) {
      return null;
    }

    // Log case view
    this.decisionLogger.logAction(
      moderatorId,
      'CASE_VIEWED',
      caseId,
      { bundleId: moderationCase.evidenceBundle.bundleId }
    );

    return moderationCase.evidenceBundle;
  }

  // ==========================================================================
  // Case Investigation
  // ==========================================================================

  /**
   * Assign a moderator to a case
   */
  assignCase(
    caseId: CaseId,
    moderatorId: ModeratorId,
    assignedBy: ModeratorId
  ): ModerationCase | null {
    const moderationCase = this.cases.get(caseId);
    if (!moderationCase) {
      return null;
    }

    const updatedCase: ModerationCase = {
      ...moderationCase,
      assignedModerator: moderatorId,
      status: 'UNDER_INVESTIGATION',
      updatedAt: Date.now(),
    };

    this.cases.set(caseId, updatedCase);

    // Log assignment
    this.decisionLogger.logAction(
      assignedBy,
      'CASE_ASSIGNED',
      caseId,
      { assignedTo: moderatorId }
    );

    return updatedCase;
  }

  /**
   * Add an annotation to a case
   */
  annotateCase(
    caseId: CaseId,
    moderatorId: ModeratorId,
    content: string,
    category: CaseAnnotation['category'],
    referencedPlayers?: readonly PlayerId[],
    referencedSteps?: readonly number[]
  ): CaseAnnotation | null {
    const moderationCase = this.cases.get(caseId);
    if (!moderationCase) {
      return null;
    }

    const annotation: CaseAnnotation = {
      annotationId: generateAnnotationId(),
      caseId,
      moderatorId,
      timestamp: Date.now(),
      content,
      category,
      referencedPlayers,
      referencedSteps,
    };

    const updatedCase: ModerationCase = {
      ...moderationCase,
      annotations: [...moderationCase.annotations, annotation],
      updatedAt: Date.now(),
    };

    this.cases.set(caseId, updatedCase);

    // Log annotation
    this.decisionLogger.logAction(
      moderatorId,
      'ANNOTATION_ADDED',
      caseId,
      { annotationId: annotation.annotationId, category }
    );

    return annotation;
  }

  /**
   * Submit a resolution recommendation
   */
  recommendResolution(
    caseId: CaseId,
    moderatorId: ModeratorId,
    resolution: ResolutionType,
    targetPlayers: readonly PlayerId[],
    rationale: string,
    confidence: ResolutionRecommendation['confidence'],
    suggestedFollowUp?: string
  ): ResolutionRecommendation | null {
    const moderationCase = this.cases.get(caseId);
    if (!moderationCase) {
      return null;
    }

    const recommendation: ResolutionRecommendation = {
      caseId,
      moderatorId,
      timestamp: Date.now(),
      resolution,
      targetPlayers: [...targetPlayers],
      rationale,
      confidence,
      suggestedFollowUp,
    };

    const updatedCase: ModerationCase = {
      ...moderationCase,
      recommendation,
      status: 'AWAITING_DECISION',
      updatedAt: Date.now(),
    };

    this.cases.set(caseId, updatedCase);

    // Log recommendation
    this.decisionLogger.logAction(
      moderatorId,
      'RECOMMENDATION_MADE',
      caseId,
      { resolution, targetPlayers, confidence }
    );

    return recommendation;
  }

  // ==========================================================================
  // Case Resolution
  // ==========================================================================

  /**
   * Make final decision on a case
   */
  makeDecision(
    caseId: CaseId,
    moderatorId: ModeratorId,
    decision: ResolutionType,
    rationale: string
  ): ModerationCase | null {
    const moderationCase = this.cases.get(caseId);
    if (!moderationCase) {
      return null;
    }

    const now = Date.now();
    const status: CaseStatus = decision === 'NO_ACTION' ? 'DISMISSED' : 'RESOLVED';

    const updatedCase: ModerationCase = {
      ...moderationCase,
      status,
      resolvedAt: now,
      resolvedBy: moderatorId,
      finalDecision: decision,
      decisionRationale: rationale,
      updatedAt: now,
    };

    this.cases.set(caseId, updatedCase);

    // Log decision
    this.decisionLogger.logAction(
      moderatorId,
      'DECISION_MADE',
      caseId,
      { decision, rationale }
    );

    return updatedCase;
  }

  /**
   * Escalate a case
   */
  escalateCase(
    caseId: CaseId,
    moderatorId: ModeratorId,
    reason: string
  ): ModerationCase | null {
    const moderationCase = this.cases.get(caseId);
    if (!moderationCase) {
      return null;
    }

    const updatedCase: ModerationCase = {
      ...moderationCase,
      status: 'ESCALATED',
      updatedAt: Date.now(),
    };

    this.cases.set(caseId, updatedCase);

    // Log escalation
    this.decisionLogger.logAction(
      moderatorId,
      'CASE_ESCALATED',
      caseId,
      { reason }
    );

    return updatedCase;
  }

  /**
   * Dismiss a case
   */
  dismissCase(
    caseId: CaseId,
    moderatorId: ModeratorId,
    reason: string
  ): ModerationCase | null {
    const moderationCase = this.cases.get(caseId);
    if (!moderationCase) {
      return null;
    }

    const now = Date.now();

    const updatedCase: ModerationCase = {
      ...moderationCase,
      status: 'DISMISSED',
      resolvedAt: now,
      resolvedBy: moderatorId,
      finalDecision: 'NO_ACTION',
      decisionRationale: reason,
      updatedAt: now,
    };

    this.cases.set(caseId, updatedCase);

    // Log dismissal
    this.decisionLogger.logAction(
      moderatorId,
      'CASE_DISMISSED',
      caseId,
      { reason }
    );

    return updatedCase;
  }

  /**
   * Reopen a case
   */
  reopenCase(
    caseId: CaseId,
    moderatorId: ModeratorId,
    reason: string
  ): ModerationCase | null {
    const moderationCase = this.cases.get(caseId);
    if (!moderationCase) {
      return null;
    }

    const updatedCase: ModerationCase = {
      ...moderationCase,
      status: 'UNDER_INVESTIGATION',
      resolvedAt: null,
      resolvedBy: null,
      finalDecision: null,
      decisionRationale: null,
      updatedAt: Date.now(),
    };

    this.cases.set(caseId, updatedCase);

    // Log reopening
    this.decisionLogger.logAction(
      moderatorId,
      'CASE_REOPENED',
      caseId,
      { reason }
    );

    return updatedCase;
  }

  // ==========================================================================
  // Statistics
  // ==========================================================================

  /**
   * Get moderation statistics
   */
  getStatistics(): {
    totalCases: number;
    byStatus: Map<CaseStatus, number>;
    byRiskLevel: Map<RiskLevel, number>;
    averageResolutionTime: number;
  } {
    const byStatus = new Map<CaseStatus, number>();
    const byRiskLevel = new Map<RiskLevel, number>();
    let totalResolutionTime = 0;
    let resolvedCount = 0;

    for (const [, moderationCase] of this.cases) {
      // Count by status
      byStatus.set(
        moderationCase.status,
        (byStatus.get(moderationCase.status) ?? 0) + 1
      );

      // Count by risk level
      const riskLevel = moderationCase.evidenceBundle.riskLevel;
      byRiskLevel.set(
        riskLevel,
        (byRiskLevel.get(riskLevel) ?? 0) + 1
      );

      // Calculate resolution time
      if (moderationCase.resolvedAt) {
        totalResolutionTime += moderationCase.resolvedAt - moderationCase.createdAt;
        resolvedCount++;
      }
    }

    return {
      totalCases: this.cases.size,
      byStatus,
      byRiskLevel,
      averageResolutionTime: resolvedCount > 0 ? totalResolutionTime / resolvedCount : 0,
    };
  }

  /**
   * Get decision log
   */
  getDecisionLog(): DecisionLogger {
    return this.decisionLogger;
  }

  /**
   * Clear all cases (for testing)
   */
  clear(): void {
    this.cases.clear();
    this.handToCaseMap.clear();
    this.decisionLogger.clear();
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createModeratorService(
  decisionLogger?: DecisionLogger
): ModeratorService {
  return new ModeratorService(decisionLogger);
}
