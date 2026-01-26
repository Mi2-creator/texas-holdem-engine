/**
 * ============================================================================
 * FROZEN - LEGACY CODE - DO NOT MODIFY
 * ============================================================================
 * This file is part of the training/coaching system that is now deprecated.
 * Do NOT extend, refactor, or build upon this code.
 *
 * Frozen as of: Phase 1 Freeze (Pokerrrr2-style refactor)
 * Reason: Training/analysis features are legacy; focus is on core poker table UI
 * ============================================================================
 */

/**
 * playerLanguage.ts
 * Phase 9.3 - Player Language Adapter
 *
 * Maps Phase 6-8 insights to player-friendly, neutral, descriptive text.
 * This is a pure mapping layer - no logic changes, no AI, no scoring.
 *
 * Key principles:
 * - Describe what happened (what), not quality (good/bad)
 * - Focus on pressure, tempo, structure
 * - No "should have", no scoring, no judgments
 * - No EV, win rates, or numerical conclusions
 * - All inputs null-safe
 */

import type { CoachHint } from '../controllers/CoachHintEngine';
import type {
  ReviewInsight,
  ReviewDecision,
  PatternSummary,
  DecisionType,
} from '../controllers/ReviewInsightEngine';
import type {
  TendencyObservation,
  LearningProfile,
  SessionSummary,
} from '../controllers/LearningProfileEngine';
import type { PressureLevel, ActionClass, StreetPhase } from '../models/DecisionTimelineModel';

// ============================================================================
// Types
// ============================================================================

export interface PlayerText {
  readonly primary: string;
  readonly secondary?: string;
}

// ============================================================================
// Street Name Mapping (Player-Friendly)
// ============================================================================

const STREET_NAMES: Record<string, string> = {
  PREFLOP: 'pre-flop',
  FLOP: 'the flop',
  TURN: 'the turn',
  RIVER: 'the river',
  SHOWDOWN: 'showdown',
};

function getStreetName(street: StreetPhase | string | undefined): string {
  if (!street) return 'this street';
  const normalized = String(street).toUpperCase();
  return STREET_NAMES[normalized] ?? 'this street';
}

// ============================================================================
// Action Name Mapping (Player-Friendly)
// ============================================================================

const ACTION_NAMES: Record<string, string> = {
  fold: 'folded',
  check: 'checked',
  call: 'called',
  bet: 'bet',
  raise: 'raised',
  'all-in': 'went all-in',
};

function getActionName(action: ActionClass | string | undefined): string {
  if (!action) return 'acted';
  const normalized = String(action).toLowerCase();
  return ACTION_NAMES[normalized] ?? 'acted';
}

// ============================================================================
// Pressure Level Mapping (Neutral Language)
// ============================================================================

const PRESSURE_DESCRIPTIONS: Record<string, string> = {
  critical: 'very high pressure',
  high: 'high pressure',
  medium: 'moderate pressure',
  low: 'low pressure',
};

function getPressureDescription(level: PressureLevel | string | undefined): string {
  if (!level) return 'standard pressure';
  const normalized = String(level).toLowerCase();
  return PRESSURE_DESCRIPTIONS[normalized] ?? 'standard pressure';
}

// ============================================================================
// Decision Type Mapping (Descriptive, Not Judgmental)
// ============================================================================

const DECISION_TYPE_DESCRIPTIONS: Record<DecisionType, string> = {
  'pressure-response': 'Facing significant pressure',
  'pot-control': 'Managing the pot size',
  'value-decision': 'Building the pot',
  'protection-decision': 'Protecting position',
  'commitment-threshold': 'Stack commitment point',
  'bluff-catch': 'Facing potential bluff',
  'continuation': 'Standard continuation',
  'exit-decision': 'Exit point',
};

function getDecisionTypeDescription(type: DecisionType | undefined): string {
  if (!type) return 'Decision point';
  return DECISION_TYPE_DESCRIPTIONS[type] ?? 'Decision point';
}

// ============================================================================
// Tension Level Mapping (Neutral)
// ============================================================================

const TENSION_DESCRIPTIONS: Record<string, string> = {
  calm: 'a calm pace',
  moderate: 'a moderate pace',
  elevated: 'an elevated pace',
  high: 'a fast pace',
};

function getTensionDescription(tension: string | undefined): string {
  if (!tension) return 'standard pace';
  return TENSION_DESCRIPTIONS[tension] ?? 'standard pace';
}

// ============================================================================
// Coach Hint Mapping
// ============================================================================

/**
 * Maps a CoachHint to player-friendly text.
 * Coach hints are already player-friendly, so minimal transformation needed.
 */
export function mapCoachHintToPlayerText(hint: CoachHint | null | undefined): PlayerText | null {
  if (!hint) return null;
  if (!hint.text) return null;

  // Coach hints are already in player-friendly language
  // Just return as-is with no modification
  return {
    primary: hint.text,
  };
}

// ============================================================================
// Review Decision Mapping
// ============================================================================

/**
 * Maps a single ReviewDecision to player-friendly text.
 * Focuses on what happened, not quality judgment.
 */
export function mapDecisionToPlayerText(
  decision: ReviewDecision | null | undefined
): PlayerText | null {
  if (!decision) return null;

  const street = getStreetName(decision.street);
  const action = getActionName(decision.actionTaken);
  const pressure = getPressureDescription(decision.pressureLevel);
  const typeDesc = getDecisionTypeDescription(decision.decisionType);

  // Build primary text: what happened
  const primary = `On ${street}, you ${action} under ${pressure}.`;

  // Build secondary text: structural context
  const secondary = typeDesc;

  return { primary, secondary };
}

/**
 * Maps multiple ReviewDecisions to a summary text.
 */
export function mapDecisionsToSummaryText(
  decisions: readonly ReviewDecision[] | null | undefined
): PlayerText | null {
  if (!decisions || decisions.length === 0) return null;

  const count = decisions.length;
  const highPressureCount = decisions.filter(
    d => d.pressureLevel === 'high' || d.pressureLevel === 'critical'
  ).length;

  if (count === 1) {
    return {
      primary: `One key decision point this hand.`,
      secondary: highPressureCount > 0 ? 'Under pressure.' : undefined,
    };
  }

  const primary = `${count} key decision points this hand.`;
  const secondary = highPressureCount > 0
    ? `${highPressureCount} under high pressure.`
    : undefined;

  return { primary, secondary };
}

// ============================================================================
// Pattern Summary Mapping
// ============================================================================

/**
 * Maps PatternSummary to player-friendly text.
 * Describes tempo and structure, not quality.
 */
export function mapPatternToPlayerText(
  patterns: PatternSummary | null | undefined
): PlayerText | null {
  if (!patterns) return null;

  const tension = getTensionDescription(patterns.overallTension);
  const peakStreet = getStreetName(patterns.peakStreet);
  const decisionCount = patterns.heroDecisionCount ?? 0;

  // Build primary text: hand structure
  const primary = `This hand moved at ${tension}.`;

  // Build secondary text: peak moment
  let secondary: string | undefined;
  if (patterns.peakStreet && decisionCount > 0) {
    secondary = `Peak intensity on ${peakStreet}. ${decisionCount} decision${decisionCount > 1 ? 's' : ''} made.`;
  }

  return { primary, secondary };
}

/**
 * Maps pattern observations to player-friendly list.
 * Filters out any judgmental language.
 */
export function mapPatternObservationsToPlayerText(
  observations: readonly string[] | null | undefined
): readonly string[] {
  if (!observations || observations.length === 0) return [];

  // Filter out judgmental words and return clean observations
  const judgmentalWords = ['should', 'better', 'worse', 'correct', 'incorrect', 'mistake', 'error', 'optimal'];

  return observations
    .filter(obs => {
      const lowerObs = obs.toLowerCase();
      return !judgmentalWords.some(word => lowerObs.includes(word));
    })
    .slice(0, 3); // Max 3 observations
}

// ============================================================================
// Review Insight Mapping
// ============================================================================

/**
 * Maps complete ReviewInsight to player-friendly text.
 */
export function mapReviewInsightToPlayerText(
  insight: ReviewInsight | null | undefined
): PlayerText | null {
  if (!insight) return null;
  if (!insight.isAvailable) return null;

  const decisionsText = mapDecisionsToSummaryText(insight.keyDecisions);
  const patternText = mapPatternToPlayerText(insight.patterns);

  // Combine into unified text
  if (decisionsText && patternText) {
    return {
      primary: patternText.primary,
      secondary: decisionsText.primary,
    };
  }

  return decisionsText ?? patternText;
}

// ============================================================================
// Tendency Observation Mapping
// ============================================================================

/**
 * Maps TendencyObservation to player-friendly text.
 * Describes patterns without judgment.
 */
export function mapTendencyToPlayerText(
  tendency: TendencyObservation | null | undefined
): PlayerText | null {
  if (!tendency) return null;
  if (!tendency.title) return null;

  // Use existing title and description which are already descriptive
  return {
    primary: tendency.title,
    secondary: tendency.description || undefined,
  };
}

/**
 * Maps tendency observations to filtered player-friendly list.
 */
export function mapTendencyObservationsToPlayerText(
  observations: readonly string[] | null | undefined
): readonly string[] {
  if (!observations || observations.length === 0) return [];

  // Same filtering as pattern observations
  const judgmentalWords = ['should', 'better', 'worse', 'correct', 'incorrect', 'mistake', 'error', 'optimal', 'good', 'bad'];

  return observations
    .filter(obs => {
      const lowerObs = obs.toLowerCase();
      return !judgmentalWords.some(word => lowerObs.includes(word));
    })
    .slice(0, 3);
}

// ============================================================================
// Session Summary Mapping
// ============================================================================

/**
 * Maps SessionSummary to player-friendly text.
 */
export function mapSessionSummaryToPlayerText(
  summary: SessionSummary | null | undefined
): PlayerText | null {
  if (!summary) return null;
  if (summary.handsPlayed === 0) return null;

  const hands = summary.handsPlayed;
  const decisions = summary.totalDecisions ?? 0;

  const primary = `${hands} hand${hands > 1 ? 's' : ''} tracked this session.`;
  const secondary = decisions > 0
    ? `${decisions} decision${decisions > 1 ? 's' : ''} reviewed.`
    : undefined;

  return { primary, secondary };
}

// ============================================================================
// Learning Profile Mapping
// ============================================================================

/**
 * Maps LearningProfile to player-friendly summary text.
 */
export function mapLearningProfileToPlayerText(
  profile: LearningProfile | null | undefined
): PlayerText | null {
  if (!profile) return null;
  if (!profile.isAvailable) return null;

  return mapSessionSummaryToPlayerText(profile.sessionSummary);
}

// ============================================================================
// Hand End Reason Mapping
// ============================================================================

const HAND_END_DESCRIPTIONS: Record<string, string> = {
  fold: 'Hand ended by fold.',
  showdown: 'Hand went to showdown.',
  all_fold: 'All opponents folded.',
  timeout: 'Hand ended by timeout.',
};

/**
 * Maps hand end reason to player-friendly text.
 */
export function mapHandEndReasonToPlayerText(
  reason: string | null | undefined
): string | null {
  if (!reason) return null;

  const normalized = String(reason).toLowerCase().replace(/-/g, '_');
  return HAND_END_DESCRIPTIONS[normalized] ?? `Hand completed.`;
}

// ============================================================================
// Utility: Check if text contains judgmental language
// ============================================================================

const JUDGMENTAL_PATTERNS = [
  /should/i,
  /better/i,
  /worse/i,
  /correct/i,
  /incorrect/i,
  /mistake/i,
  /error/i,
  /optimal/i,
  /good(?:\s+play)?/i,
  /bad(?:\s+play)?/i,
  /right(?:\s+play)?/i,
  /wrong(?:\s+play)?/i,
];

/**
 * Checks if text contains judgmental language.
 * Can be used to filter out non-compliant text.
 */
export function containsJudgmentalLanguage(text: string | null | undefined): boolean {
  if (!text) return false;
  return JUDGMENTAL_PATTERNS.some(pattern => pattern.test(text));
}

/**
 * Sanitizes text by removing judgmental phrases.
 * Returns null if the entire text becomes meaningless after sanitization.
 */
export function sanitizePlayerText(text: string | null | undefined): string | null {
  if (!text) return null;
  if (!containsJudgmentalLanguage(text)) return text;

  // If text contains judgmental language, return null
  // Better to show nothing than judgmental text
  return null;
}

// ============================================================================
// Main Adapter Function
// ============================================================================

export type InsightType = 'coach-hint' | 'review-decision' | 'pattern' | 'tendency' | 'session';

export interface MappedInsight {
  readonly type: InsightType;
  readonly text: PlayerText;
}

/**
 * Main adapter function that maps any insight type to player text.
 * Returns null if input is invalid or would produce judgmental output.
 */
export function mapInsightToPlayerText(
  input: CoachHint | ReviewDecision | PatternSummary | TendencyObservation | SessionSummary | null | undefined,
  type: InsightType
): PlayerText | null {
  if (!input) return null;

  let result: PlayerText | null = null;

  switch (type) {
    case 'coach-hint':
      result = mapCoachHintToPlayerText(input as CoachHint);
      break;
    case 'review-decision':
      result = mapDecisionToPlayerText(input as ReviewDecision);
      break;
    case 'pattern':
      result = mapPatternToPlayerText(input as PatternSummary);
      break;
    case 'tendency':
      result = mapTendencyToPlayerText(input as TendencyObservation);
      break;
    case 'session':
      result = mapSessionSummaryToPlayerText(input as SessionSummary);
      break;
    default:
      return null;
  }

  // Final safety check: ensure no judgmental language leaked through
  if (result) {
    if (containsJudgmentalLanguage(result.primary)) return null;
    if (result.secondary && containsJudgmentalLanguage(result.secondary)) {
      return { primary: result.primary };
    }
  }

  return result;
}

export default {
  mapInsightToPlayerText,
  mapCoachHintToPlayerText,
  mapDecisionToPlayerText,
  mapDecisionsToSummaryText,
  mapPatternToPlayerText,
  mapPatternObservationsToPlayerText,
  mapReviewInsightToPlayerText,
  mapTendencyToPlayerText,
  mapTendencyObservationsToPlayerText,
  mapSessionSummaryToPlayerText,
  mapLearningProfileToPlayerText,
  mapHandEndReasonToPlayerText,
  containsJudgmentalLanguage,
  sanitizePlayerText,
};
