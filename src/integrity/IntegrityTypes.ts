/**
 * IntegrityTypes.ts
 * Phase 22 - Game integrity and anti-abuse analysis types
 *
 * Defines types for:
 * - Integrity event stream (immutable, timestamped)
 * - Behavior metrics (VPIP, PFR, aggression, etc.)
 * - Detection signals and risk scores
 * - Reports for external moderation tools
 */

import { PlayerId } from '../security/Identity';
import { TableId, HandId } from '../security/AuditLog';
import { ClubId } from '../club/ClubTypes';
import { Street } from '../game/engine/TableState';

// ============================================================================
// Branded Types
// ============================================================================

export type IntegrityEventId = string & { readonly __brand: 'IntegrityEventId' };
export type SessionId = string & { readonly __brand: 'SessionId' };
export type ReportId = string & { readonly __brand: 'ReportId' };

// ============================================================================
// Integrity Event Types
// ============================================================================

/**
 * All integrity event types
 */
export type IntegrityEventType =
  // Player actions
  | 'player_action'
  | 'player_fold'
  | 'player_check'
  | 'player_call'
  | 'player_bet'
  | 'player_raise'
  | 'player_all_in'
  // Hand events
  | 'hand_started'
  | 'hand_completed'
  | 'street_changed'
  | 'showdown'
  // Stack events
  | 'stack_change'
  | 'pot_awarded'
  | 'rake_collected'
  // Table events
  | 'table_paused'
  | 'table_resumed'
  | 'player_kicked'
  | 'config_changed'
  // Authority events
  | 'manager_intervention'
  | 'owner_intervention';

/**
 * Base integrity event (immutable, timestamped)
 */
export interface IntegrityEvent {
  readonly eventId: IntegrityEventId;
  readonly type: IntegrityEventType;
  readonly timestamp: number;
  readonly clubId: ClubId;
  readonly tableId: TableId;
  readonly handId: HandId | null;
  readonly playerId: PlayerId | null;
  readonly street: Street | null;
  readonly data: IntegrityEventData;
}

/**
 * Event-specific data
 */
export type IntegrityEventData =
  | PlayerActionData
  | HandEventData
  | StackChangeData
  | TableEventData
  | AuthorityEventData;

export interface PlayerActionData {
  readonly actionType: 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'all_in';
  readonly amount: number;
  readonly potSize: number;
  readonly stackBefore: number;
  readonly stackAfter: number;
  readonly position: number;
  readonly playersInHand: number;
  readonly facingBet: number;
  readonly isHeadsUp: boolean;
  readonly timeToAct: number; // milliseconds
}

export interface HandEventData {
  readonly players: readonly PlayerId[];
  readonly positions: ReadonlyMap<PlayerId, number>;
  readonly stacks: ReadonlyMap<PlayerId, number>;
  readonly blinds?: { small: number; big: number };
  readonly winners?: readonly PlayerId[];
  readonly potSize?: number;
  readonly finalStreet?: Street;
}

export interface StackChangeData {
  readonly playerId: PlayerId;
  readonly previousStack: number;
  readonly newStack: number;
  readonly changeAmount: number;
  readonly reason: 'pot_win' | 'pot_loss' | 'rake' | 'buy_in' | 'cash_out';
  readonly fromPlayers?: readonly PlayerId[]; // Who contributed to this win
}

export interface TableEventData {
  readonly reason?: string;
  readonly initiator: PlayerId;
  readonly targetPlayer?: PlayerId;
  readonly configChanges?: Record<string, unknown>;
}

export interface AuthorityEventData {
  readonly role: 'manager' | 'owner';
  readonly action: string;
  readonly targetPlayer?: PlayerId;
  readonly handInProgress: boolean;
  readonly potSize?: number;
}

// ============================================================================
// Behavior Metrics
// ============================================================================

/**
 * Player behavior metrics over a session
 */
export interface PlayerMetrics {
  readonly playerId: PlayerId;
  readonly sessionId: SessionId;
  readonly handsPlayed: number;
  readonly handsWon: number;

  // Voluntary action metrics
  readonly vpip: number; // Voluntarily Put $ In Pot (0-1)
  readonly pfr: number; // Pre-Flop Raise (0-1)
  readonly threeBetRate: number; // 3-bet frequency (0-1)
  readonly cBetRate: number; // Continuation bet rate (0-1)

  // Aggression metrics
  readonly aggressionFactor: number; // (bets + raises) / calls
  readonly aggressionFrequency: number; // (bets + raises) / total actions

  // Fold metrics
  readonly foldToRaiseRate: number; // Fold when facing raise (0-1)
  readonly foldToCBetRate: number; // Fold to continuation bet (0-1)
  readonly wtsd: number; // Went To ShowDown (0-1)
  readonly wsd: number; // Won $ at ShowDown (0-1)

  // Position awareness
  readonly earlyPositionVpip: number;
  readonly latePositionVpip: number;
  readonly positionAwareness: number; // Difference in play by position

  // Heads-up vs Multiway
  readonly headsUpAggressionFactor: number;
  readonly multiwayAggressionFactor: number;
  readonly headsUpVsMultiwayDelta: number;

  // Timing
  readonly averageTimeToAct: number;
  readonly quickFoldRate: number; // Folds in < 1 second
  readonly longTankRate: number; // Actions taking > 10 seconds

  // Chip flow
  readonly netChipChange: number;
  readonly biggestWin: number;
  readonly biggestLoss: number;

  readonly computedAt: number;
}

/**
 * Chip flow between players (who wins from whom)
 */
export interface ChipFlowMatrix {
  readonly sessionId: SessionId;
  readonly tableId: TableId;
  readonly flows: ReadonlyMap<PlayerId, ReadonlyMap<PlayerId, number>>;
  readonly totalHands: number;
  readonly computedAt: number;
}

/**
 * Interaction metrics between two players
 */
export interface PlayerPairMetrics {
  readonly player1: PlayerId;
  readonly player2: PlayerId;
  readonly sessionId: SessionId;

  // Confrontation stats
  readonly handsPlayedTogether: number;
  readonly headsUpConfrontations: number;

  // Chip flow
  readonly netFlowP1toP2: number; // Positive = P1 lost to P2

  // Aggression asymmetry
  readonly p1RaisesVsP2: number;
  readonly p2RaisesVsP1: number;
  readonly aggressionAsymmetry: number; // |p1 raises - p2 raises| / total

  // Fold patterns
  readonly p1FoldsToP2: number;
  readonly p2FoldsToP1: number;
  readonly foldAsymmetry: number;

  // Showdown frequency
  readonly showdownsAgainstEachOther: number;
  readonly showdownRate: number;

  readonly computedAt: number;
}

// ============================================================================
// Detection Signals
// ============================================================================

/**
 * Signal severity levels
 */
export type SignalSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/**
 * Signal categories
 */
export type SignalCategory =
  | 'COLLUSION'
  | 'SOFT_PLAY'
  | 'CHIP_DUMPING'
  | 'AUTHORITY_ABUSE'
  | 'TIMING_ANOMALY'
  | 'STATISTICAL_ANOMALY';

/**
 * A detected suspicious signal
 */
export interface DetectionSignal {
  readonly signalId: string;
  readonly category: SignalCategory;
  readonly severity: SignalSeverity;
  readonly description: string;
  readonly explanation: string; // Human-readable explanation
  readonly confidence: number; // 0-1
  readonly involvedPlayers: readonly PlayerId[];
  readonly relevantHands: readonly HandId[];
  readonly evidenceMetrics: Record<string, number>;
  readonly timestamp: number;
}

// ============================================================================
// Collusion Indicators
// ============================================================================

/**
 * Specific collusion pattern types
 */
export type CollusionPattern =
  | 'CHIP_TRANSFER_CONCENTRATION'
  | 'ASYMMETRIC_AGGRESSION'
  | 'ABNORMAL_FOLD_PATTERN'
  | 'COORDINATED_BETTING'
  | 'SOFT_PLAY_HEADS_UP'
  | 'UNNATURAL_CHECKDOWN';

/**
 * Collusion indicator with supporting evidence
 */
export interface CollusionIndicator {
  readonly pattern: CollusionPattern;
  readonly players: readonly PlayerId[];
  readonly strength: number; // 0-1
  readonly occurrences: number;
  readonly expectedOccurrences: number; // What we'd expect by chance
  readonly zScore: number; // Statistical deviation
  readonly handIds: readonly HandId[];
  readonly description: string;
}

// ============================================================================
// Soft-Play Indicators
// ============================================================================

/**
 * Soft-play pattern types
 */
export type SoftPlayPattern =
  | 'PASSIVE_HIGH_EV'
  | 'MISSING_VALUE_BET'
  | 'LOW_PRESSURE_HEADS_UP'
  | 'ABNORMAL_CHECK_FREQUENCY';

/**
 * Soft-play indicator
 */
export interface SoftPlayIndicator {
  readonly pattern: SoftPlayPattern;
  readonly player: PlayerId;
  readonly opponent: PlayerId;
  readonly strength: number;
  readonly occurrences: number;
  readonly handIds: readonly HandId[];
  readonly description: string;
}

// ============================================================================
// Authority Abuse Indicators
// ============================================================================

/**
 * Authority abuse pattern types
 */
export type AuthorityAbusePattern =
  | 'SUSPICIOUS_PAUSE_TIMING'
  | 'CONFIG_CHANGE_AFTER_LOSS'
  | 'SELECTIVE_KICK'
  | 'INTERVENTION_CORRELATION';

/**
 * Authority abuse indicator
 */
export interface AuthorityAbuseIndicator {
  readonly pattern: AuthorityAbusePattern;
  readonly authority: PlayerId;
  readonly role: 'manager' | 'owner';
  readonly strength: number;
  readonly occurrences: number;
  readonly correlatedOutcomes: number;
  readonly description: string;
}

// ============================================================================
// Risk Reports
// ============================================================================

/**
 * Risk level classifications
 */
export type RiskLevel = 'CLEAN' | 'LOW_RISK' | 'MODERATE_RISK' | 'HIGH_RISK' | 'CRITICAL';

/**
 * Player integrity report
 */
export interface PlayerIntegrityReport {
  readonly reportId: ReportId;
  readonly playerId: PlayerId;
  readonly sessionId: SessionId;
  readonly clubId: ClubId;
  readonly tableId: TableId;

  // Overall assessment
  readonly riskLevel: RiskLevel;
  readonly riskScore: number; // 0-100
  readonly confidence: number; // 0-1

  // Metrics summary
  readonly metrics: PlayerMetrics;

  // Detected signals
  readonly signals: readonly DetectionSignal[];
  readonly collusionIndicators: readonly CollusionIndicator[];
  readonly softPlayIndicators: readonly SoftPlayIndicator[];

  // Related players of concern
  readonly suspiciousAssociations: readonly {
    player: PlayerId;
    reason: string;
    strength: number;
  }[];

  readonly generatedAt: number;
}

/**
 * Table integrity report
 */
export interface TableIntegrityReport {
  readonly reportId: ReportId;
  readonly tableId: TableId;
  readonly clubId: ClubId;
  readonly sessionId: SessionId;

  // Overall assessment
  readonly riskLevel: RiskLevel;
  readonly riskScore: number;
  readonly confidence: number;

  // Table statistics
  readonly totalHands: number;
  readonly totalPlayers: number;
  readonly totalChipsExchanged: number;
  readonly rakeCollected: number;

  // Chip flow analysis
  readonly chipFlowMatrix: ChipFlowMatrix;
  readonly concentrationIndex: number; // How concentrated chip flow is

  // Per-player reports
  readonly playerReports: ReadonlyMap<PlayerId, PlayerIntegrityReport>;

  // Detected patterns
  readonly collusionIndicators: readonly CollusionIndicator[];
  readonly softPlayIndicators: readonly SoftPlayIndicator[];
  readonly authorityAbuseIndicators: readonly AuthorityAbuseIndicator[];

  // Authority activity
  readonly authorityInterventions: number;
  readonly pauseEvents: number;
  readonly kickEvents: number;
  readonly configChanges: number;

  readonly generatedAt: number;
}

// ============================================================================
// Thresholds and Configuration
// ============================================================================

/**
 * Detection thresholds (configurable)
 */
export interface DetectionThresholds {
  // Collusion thresholds
  readonly chipTransferConcentration: number; // > this triggers signal
  readonly aggressionAsymmetry: number;
  readonly foldAsymmetry: number;
  readonly minHandsForAnalysis: number;

  // Soft-play thresholds
  readonly passivityThreshold: number;
  readonly missingValueBetThreshold: number;

  // Authority abuse thresholds
  readonly pauseCorrelationThreshold: number;
  readonly configChangeCorrelationThreshold: number;

  // Statistical thresholds
  readonly zScoreThreshold: number; // Standard deviations for significance
  readonly confidenceThreshold: number;
}

export const DEFAULT_DETECTION_THRESHOLDS: DetectionThresholds = {
  chipTransferConcentration: 0.7,
  aggressionAsymmetry: 0.6,
  foldAsymmetry: 0.7,
  minHandsForAnalysis: 20,

  passivityThreshold: 0.3,
  missingValueBetThreshold: 0.5,

  pauseCorrelationThreshold: 0.6,
  configChangeCorrelationThreshold: 0.7,

  zScoreThreshold: 2.0,
  confidenceThreshold: 0.7,
};

// ============================================================================
// ID Generation
// ============================================================================

let eventIdCounter = 0;
let sessionIdCounter = 0;
let reportIdCounter = 0;

export function generateIntegrityEventId(): IntegrityEventId {
  return `int_evt_${Date.now()}_${++eventIdCounter}` as IntegrityEventId;
}

export function generateSessionId(): SessionId {
  return `session_${Date.now()}_${++sessionIdCounter}` as SessionId;
}

export function generateReportId(): ReportId {
  return `report_${Date.now()}_${++reportIdCounter}` as ReportId;
}

export function resetIntegrityCounters(): void {
  eventIdCounter = 0;
  sessionIdCounter = 0;
  reportIdCounter = 0;
}
