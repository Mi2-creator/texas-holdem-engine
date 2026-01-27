/**
 * ModerationTypes.ts
 * Phase 23 - Moderation system domain types
 *
 * Defines types for:
 * - Hand replay states and steps
 * - Evidence bundles with checksums
 * - Moderator case management
 * - Decision logging
 */

import { PlayerId } from '../security/Identity';
import { TableId, HandId } from '../security/AuditLog';
import { ClubId } from '../club/ClubTypes';
import { Street } from '../game/engine/TableState';
import {
  SessionId,
  IntegrityEvent,
  PlayerMetrics,
  DetectionSignal,
  CollusionIndicator,
  SoftPlayIndicator,
  PlayerIntegrityReport,
  RiskLevel,
} from '../integrity/IntegrityTypes';

// ============================================================================
// Branded Types
// ============================================================================

export type CaseId = string & { readonly __brand: 'CaseId' };
export type EvidenceBundleId = string & { readonly __brand: 'EvidenceBundleId' };
export type AnnotationId = string & { readonly __brand: 'AnnotationId' };
export type DecisionId = string & { readonly __brand: 'DecisionId' };
export type ModeratorId = string & { readonly __brand: 'ModeratorId' };
export type Checksum = string & { readonly __brand: 'Checksum' };

// ============================================================================
// Hand Replay Types
// ============================================================================

/**
 * Player state at a specific point in hand replay
 */
export interface ReplayPlayerState {
  readonly playerId: PlayerId;
  readonly stack: number;
  readonly committed: number; // Chips committed to pot this street
  readonly totalCommitted: number; // Total chips committed this hand
  readonly position: number;
  readonly isActive: boolean; // Still in hand
  readonly isFolded: boolean;
  readonly isAllIn: boolean;
  readonly cards?: readonly string[]; // If revealed
}

/**
 * Pot state at a specific point in hand replay
 */
export interface ReplayPotState {
  readonly mainPot: number;
  readonly sidePots: readonly {
    readonly amount: number;
    readonly eligiblePlayers: readonly PlayerId[];
  }[];
  readonly totalPot: number;
}

/**
 * Board state at a specific point in hand replay
 */
export interface ReplayBoardState {
  readonly street: Street;
  readonly communityCards: readonly string[];
}

/**
 * Complete table state at a specific replay step
 */
export interface ReplayState {
  readonly stepIndex: number;
  readonly timestamp: number;
  readonly players: ReadonlyMap<PlayerId, ReplayPlayerState>;
  readonly pot: ReplayPotState;
  readonly board: ReplayBoardState;
  readonly currentActor: PlayerId | null;
  readonly lastAction: ReplayAction | null;
  readonly isComplete: boolean;
}

/**
 * Action that caused a state transition
 */
export interface ReplayAction {
  readonly playerId: PlayerId;
  readonly actionType: 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'all_in' | 'post_blind';
  readonly amount: number;
  readonly street: Street;
  readonly timestamp: number;
  readonly timeToAct: number;
}

/**
 * State diff between two replay steps
 */
export interface ReplayStateDiff {
  readonly fromStep: number;
  readonly toStep: number;
  readonly stackChanges: ReadonlyMap<PlayerId, { before: number; after: number; delta: number }>;
  readonly potChange: { before: number; after: number; delta: number };
  readonly streetChange: { from: Street; to: Street } | null;
  readonly playerStatusChanges: ReadonlyMap<PlayerId, {
    folded?: boolean;
    allIn?: boolean;
  }>;
  readonly newCommunityCards: readonly string[];
}

/**
 * Single step in hand replay
 */
export interface ReplayStep {
  readonly index: number;
  readonly state: ReplayState;
  readonly action: ReplayAction | null; // null for initial state
  readonly diff: ReplayStateDiff | null; // null for initial state
  readonly sourceEvent: IntegrityEvent | null;
}

/**
 * Complete hand replay
 */
export interface HandReplay {
  readonly handId: HandId;
  readonly tableId: TableId;
  readonly clubId: ClubId;
  readonly sessionId: SessionId;
  readonly steps: readonly ReplayStep[];
  readonly initialState: ReplayState;
  readonly finalState: ReplayState;
  readonly winners: readonly PlayerId[];
  readonly totalPotAwarded: number;
  readonly duration: number; // milliseconds
  readonly checksum: Checksum; // For determinism verification
}

// ============================================================================
// Evidence Bundle Types
// ============================================================================

/**
 * Hand outcome summary
 */
export interface HandOutcome {
  readonly handId: HandId;
  readonly winners: readonly PlayerId[];
  readonly potSize: number;
  readonly finalStreet: Street;
  readonly showdownReached: boolean;
  readonly rake: number;
  readonly chipMovements: ReadonlyMap<PlayerId, number>; // net change
}

/**
 * Table context at time of hand
 */
export interface TableContext {
  readonly tableId: TableId;
  readonly clubId: ClubId;
  readonly sessionId: SessionId;
  readonly tableName?: string;
  readonly blinds: { small: number; big: number };
  readonly playerCount: number;
  readonly handsPlayedInSession: number;
  readonly sessionStartTime: number;
}

/**
 * Evidence bundle for a flagged hand
 */
export interface EvidenceBundle {
  readonly bundleId: EvidenceBundleId;
  readonly handId: HandId;
  readonly createdAt: number;

  // Raw data
  readonly events: readonly IntegrityEvent[];
  readonly replay: HandReplay;

  // Analysis results
  readonly playerMetrics: ReadonlyMap<PlayerId, PlayerMetrics>;
  readonly signals: readonly DetectionSignal[];
  readonly collusionIndicators: readonly CollusionIndicator[];
  readonly softPlayIndicators: readonly SoftPlayIndicator[];

  // Context
  readonly outcome: HandOutcome;
  readonly tableContext: TableContext;
  readonly involvedPlayers: readonly PlayerId[];
  readonly flagReason: string;
  readonly riskLevel: RiskLevel;

  // Integrity verification
  readonly checksum: Checksum;
  readonly isVerified: boolean;
}

// ============================================================================
// Moderation Case Types
// ============================================================================

/**
 * Case status
 */
export type CaseStatus =
  | 'PENDING_REVIEW'
  | 'UNDER_INVESTIGATION'
  | 'AWAITING_DECISION'
  | 'RESOLVED'
  | 'DISMISSED'
  | 'ESCALATED';

/**
 * Resolution recommendation
 */
export type ResolutionType =
  | 'NO_ACTION'
  | 'WARNING'
  | 'TEMPORARY_SUSPENSION'
  | 'PERMANENT_BAN'
  | 'CHIP_REVERSAL'
  | 'ESCALATE_TO_ADMIN';

/**
 * Case annotation by moderator
 */
export interface CaseAnnotation {
  readonly annotationId: AnnotationId;
  readonly caseId: CaseId;
  readonly moderatorId: ModeratorId;
  readonly timestamp: number;
  readonly content: string;
  readonly category: 'OBSERVATION' | 'QUESTION' | 'FINDING' | 'RECOMMENDATION';
  readonly referencedPlayers?: readonly PlayerId[];
  readonly referencedSteps?: readonly number[]; // Replay step indices
}

/**
 * Resolution recommendation
 */
export interface ResolutionRecommendation {
  readonly caseId: CaseId;
  readonly moderatorId: ModeratorId;
  readonly timestamp: number;
  readonly resolution: ResolutionType;
  readonly targetPlayers: readonly PlayerId[];
  readonly rationale: string;
  readonly confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  readonly suggestedFollowUp?: string;
}

/**
 * Moderation case
 */
export interface ModerationCase {
  readonly caseId: CaseId;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly status: CaseStatus;

  // Evidence
  readonly evidenceBundle: EvidenceBundle;
  readonly relatedCases?: readonly CaseId[];

  // Investigation
  readonly assignedModerator: ModeratorId | null;
  readonly annotations: readonly CaseAnnotation[];
  readonly recommendation: ResolutionRecommendation | null;

  // Resolution
  readonly resolvedAt: number | null;
  readonly resolvedBy: ModeratorId | null;
  readonly finalDecision: ResolutionType | null;
  readonly decisionRationale: string | null;
}

// ============================================================================
// Decision Logging Types
// ============================================================================

/**
 * Moderator action types
 */
export type ModeratorActionType =
  | 'CASE_CREATED'
  | 'CASE_ASSIGNED'
  | 'CASE_VIEWED'
  | 'REPLAY_VIEWED'
  | 'ANNOTATION_ADDED'
  | 'RECOMMENDATION_MADE'
  | 'DECISION_MADE'
  | 'CASE_ESCALATED'
  | 'CASE_DISMISSED'
  | 'CASE_REOPENED';

/**
 * Decision log entry (append-only)
 */
export interface DecisionLogEntry {
  readonly entryId: DecisionId;
  readonly timestamp: number;
  readonly moderatorId: ModeratorId;
  readonly actionType: ModeratorActionType;
  readonly caseId: CaseId;
  readonly details: Record<string, unknown>;
  readonly previousEntryHash: string | null; // Chain for tamper detection
  readonly entryHash: string;
}

/**
 * Decision log for audit trail
 */
export interface DecisionLog {
  readonly entries: readonly DecisionLogEntry[];
  readonly lastEntryHash: string | null;
  readonly entryCount: number;
}

// ============================================================================
// Query Types
// ============================================================================

/**
 * Filter for listing flagged hands
 */
export interface FlaggedHandsFilter {
  readonly clubId?: ClubId;
  readonly tableId?: TableId;
  readonly playerId?: PlayerId;
  readonly riskLevel?: RiskLevel;
  readonly status?: CaseStatus;
  readonly fromTime?: number;
  readonly toTime?: number;
  readonly limit?: number;
  readonly offset?: number;
}

/**
 * Flagged hand summary
 */
export interface FlaggedHandSummary {
  readonly handId: HandId;
  readonly caseId: CaseId;
  readonly clubId: ClubId;
  readonly tableId: TableId;
  readonly timestamp: number;
  readonly riskLevel: RiskLevel;
  readonly status: CaseStatus;
  readonly involvedPlayers: readonly PlayerId[];
  readonly primarySignal: string;
  readonly potSize: number;
}

// ============================================================================
// ID Generation
// ============================================================================

let caseIdCounter = 0;
let bundleIdCounter = 0;
let annotationIdCounter = 0;
let decisionIdCounter = 0;

export function generateCaseId(): CaseId {
  return `case_${Date.now()}_${++caseIdCounter}` as CaseId;
}

export function generateEvidenceBundleId(): EvidenceBundleId {
  return `evidence_${Date.now()}_${++bundleIdCounter}` as EvidenceBundleId;
}

export function generateAnnotationId(): AnnotationId {
  return `annotation_${Date.now()}_${++annotationIdCounter}` as AnnotationId;
}

export function generateDecisionId(): DecisionId {
  return `decision_${Date.now()}_${++decisionIdCounter}` as DecisionId;
}

export function resetModerationCounters(): void {
  caseIdCounter = 0;
  bundleIdCounter = 0;
  annotationIdCounter = 0;
  decisionIdCounter = 0;
}

// ============================================================================
// Checksum Utilities
// ============================================================================

/**
 * Calculate checksum for replay determinism verification
 */
export function calculateChecksum(data: string): Checksum {
  // Simple hash for determinism verification
  // In production, use crypto.createHash('sha256')
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return `checksum_${Math.abs(hash).toString(16)}` as Checksum;
}

/**
 * Verify checksum matches data
 */
export function verifyChecksum(data: string, checksum: Checksum): boolean {
  return calculateChecksum(data) === checksum;
}
