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
 * LearningProfileEngine.ts
 * Phase 8.1 - Pure function engine for learning profile derivation
 *
 * Derives learning insights from multiple hands' review data.
 * All observations are descriptive, not judgmental.
 *
 * Key principles:
 * - No scoring or "good/bad" labels
 * - Observations describe patterns, not quality
 * - All data derived from ReviewInsight (Phase 7)
 */

import type {
  ReviewInsight,
  ReviewDecision,
  DecisionType,
  PatternSummary,
} from './ReviewInsightEngine';

import type { PressureLevel, ActionClass, StreetPhase } from '../models/DecisionTimelineModel';

// ============================================================================
// Types
// ============================================================================

/**
 * A single hand's history for learning analysis
 */
export interface HandHistory {
  readonly handId: string;
  readonly reviewInsight: ReviewInsight;
  readonly timestamp: number;
}

/**
 * Input parameters for learning profile generation
 */
export interface LearningProfileParams {
  readonly handHistories: readonly HandHistory[];
  readonly heroSeat: number;
}

/**
 * Observed tendency in decision-making
 */
export interface TendencyObservation {
  readonly id: string;
  readonly category: TendencyCategory;
  readonly title: string;
  readonly description: string;
  readonly observations: readonly string[];
  readonly sampleSize: number;
  readonly confidence: 'low' | 'medium' | 'high';
}

export type TendencyCategory =
  | 'pressure-response'
  | 'street-behavior'
  | 'action-preference'
  | 'commitment-pattern';

/**
 * Pressure response profile
 */
export interface PressureProfile {
  readonly highPressureResponses: readonly PressureResponseStat[];
  readonly averageTensionFaced: number;
  readonly pressureDecisionRate: number; // % of decisions that were high-pressure
}

export interface PressureResponseStat {
  readonly pressureLevel: PressureLevel;
  readonly actionDistribution: Record<ActionClass, number>;
  readonly totalDecisions: number;
}

/**
 * Progress indicator for learning
 */
export interface ProgressIndicator {
  readonly id: string;
  readonly label: string;
  readonly value: number; // 0-100
  readonly description: string;
}

/**
 * Session-level summary
 */
export interface SessionSummary {
  readonly handsPlayed: number;
  readonly totalDecisions: number;
  readonly keyDecisionsReviewed: number;
  readonly dominantTendency: string;
  readonly sessionInsight: string;
}

/**
 * Complete learning profile output
 */
export interface LearningProfile {
  readonly tendencies: readonly TendencyObservation[];
  readonly pressureProfile: PressureProfile;
  readonly progressIndicators: readonly ProgressIndicator[];
  readonly sessionSummary: SessionSummary;
  readonly isAvailable: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const MIN_HANDS_FOR_PROFILE = 2;
const MIN_DECISIONS_FOR_TENDENCY = 3;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Collect all key decisions from hand histories
 */
function collectAllDecisions(
  handHistories: readonly HandHistory[]
): readonly ReviewDecision[] {
  const decisions: ReviewDecision[] = [];

  for (const hand of handHistories) {
    if (hand.reviewInsight?.keyDecisions) {
      decisions.push(...hand.reviewInsight.keyDecisions);
    }
  }

  return decisions;
}

/**
 * Group decisions by a key extractor
 */
function groupDecisions<K extends string>(
  decisions: readonly ReviewDecision[],
  keyExtractor: (d: ReviewDecision) => K
): Map<K, ReviewDecision[]> {
  const groups = new Map<K, ReviewDecision[]>();

  for (const decision of decisions) {
    const key = keyExtractor(decision);
    const group = groups.get(key) ?? [];
    group.push(decision);
    groups.set(key, group);
  }

  return groups;
}

/**
 * Count action distribution
 */
function countActions(
  decisions: readonly ReviewDecision[]
): Record<ActionClass, number> {
  const counts: Record<ActionClass, number> = {
    'fold': 0,
    'check': 0,
    'call': 0,
    'bet': 0,
    'raise': 0,
    'all-in': 0,
    'post-blind': 0,
    'unknown': 0,
  };

  for (const decision of decisions) {
    if (decision.actionTaken in counts) {
      counts[decision.actionTaken]++;
    }
  }

  return counts;
}

/**
 * Get dominant action from distribution
 */
function getDominantAction(counts: Record<ActionClass, number>): ActionClass {
  let maxCount = 0;
  let dominant: ActionClass = 'unknown';

  for (const [action, count] of Object.entries(counts)) {
    if (count > maxCount) {
      maxCount = count;
      dominant = action as ActionClass;
    }
  }

  return dominant;
}

/**
 * Calculate confidence based on sample size
 */
function calculateConfidence(sampleSize: number): 'low' | 'medium' | 'high' {
  if (sampleSize >= 10) return 'high';
  if (sampleSize >= 5) return 'medium';
  return 'low';
}

// ============================================================================
// Tendency Derivation Functions
// ============================================================================

/**
 * Derive pressure response tendency
 */
function derivePressureResponseTendency(
  decisions: readonly ReviewDecision[]
): TendencyObservation | null {
  const highPressureDecisions = decisions.filter(
    d => d.pressureLevel === 'high' || d.pressureLevel === 'critical'
  );

  if (highPressureDecisions.length < MIN_DECISIONS_FOR_TENDENCY) {
    return null;
  }

  const actionCounts = countActions(highPressureDecisions);
  const dominant = getDominantAction(actionCounts);
  const total = highPressureDecisions.length;

  const observations: string[] = [];

  // Build observation statements
  const passiveCount = actionCounts.call + actionCounts.check + actionCounts.fold;
  const aggressiveCount = actionCounts.bet + actionCounts.raise + actionCounts['all-in'];

  if (passiveCount > aggressiveCount) {
    const passiveRate = Math.round((passiveCount / total) * 100);
    observations.push(`Chose passive actions ${passiveRate}% of the time under pressure`);
  } else if (aggressiveCount > passiveCount) {
    const aggressiveRate = Math.round((aggressiveCount / total) * 100);
    observations.push(`Chose aggressive actions ${aggressiveRate}% of the time under pressure`);
  } else {
    observations.push('Mixed approach under pressure');
  }

  if (actionCounts.fold > 0) {
    const foldRate = Math.round((actionCounts.fold / total) * 100);
    observations.push(`Folded in ${foldRate}% of high-pressure spots`);
  }

  if (actionCounts['all-in'] > 0) {
    observations.push(`Committed all-in ${actionCounts['all-in']} time(s) under pressure`);
  }

  // Determine description
  let description: string;
  if (dominant === 'fold') {
    description = 'Tends to exit when facing significant pressure';
  } else if (dominant === 'call') {
    description = 'Tends to call and see outcomes under pressure';
  } else if (['bet', 'raise', 'all-in'].includes(dominant)) {
    description = 'Tends to apply counter-pressure when facing aggression';
  } else {
    description = 'Variable responses to pressure situations';
  }

  return {
    id: 'pressure-response',
    category: 'pressure-response',
    title: 'Pressure Response',
    description,
    observations,
    sampleSize: total,
    confidence: calculateConfidence(total),
  };
}

/**
 * Derive street behavior tendency
 */
function deriveStreetBehaviorTendency(
  decisions: readonly ReviewDecision[]
): TendencyObservation | null {
  const byStreet = groupDecisions(decisions, d => d.street);

  // Need data from multiple streets
  if (byStreet.size < 2) {
    return null;
  }

  const observations: string[] = [];
  let mostActiveStreet: StreetPhase = 'PREFLOP';
  let maxDecisions = 0;

  for (const [street, streetDecisions] of byStreet) {
    if (streetDecisions.length > maxDecisions) {
      maxDecisions = streetDecisions.length;
      mostActiveStreet = street;
    }
  }

  observations.push(`Most key decisions occurred on the ${mostActiveStreet.toLowerCase()}`);

  // Check late street activity
  const lateStreetDecisions = [
    ...(byStreet.get('TURN') ?? []),
    ...(byStreet.get('RIVER') ?? []),
  ];

  const earlyStreetDecisions = [
    ...(byStreet.get('PREFLOP') ?? []),
    ...(byStreet.get('FLOP') ?? []),
  ];

  if (lateStreetDecisions.length > earlyStreetDecisions.length) {
    observations.push('More key moments on later streets');
  } else if (earlyStreetDecisions.length > lateStreetDecisions.length * 2) {
    observations.push('Action concentrated on early streets');
  }

  const totalDecisions = decisions.length;
  if (totalDecisions < MIN_DECISIONS_FOR_TENDENCY) {
    return null;
  }

  return {
    id: 'street-behavior',
    category: 'street-behavior',
    title: 'Street Activity',
    description: `Key decisions concentrated on ${mostActiveStreet.toLowerCase()}`,
    observations,
    sampleSize: totalDecisions,
    confidence: calculateConfidence(totalDecisions),
  };
}

/**
 * Derive action preference tendency
 */
function deriveActionPreferenceTendency(
  decisions: readonly ReviewDecision[]
): TendencyObservation | null {
  if (decisions.length < MIN_DECISIONS_FOR_TENDENCY) {
    return null;
  }

  const actionCounts = countActions(decisions);
  const total = decisions.length;

  const observations: string[] = [];

  // Calculate rates
  const callRate = Math.round((actionCounts.call / total) * 100);
  const foldRate = Math.round((actionCounts.fold / total) * 100);
  const raiseRate = Math.round(((actionCounts.raise + actionCounts.bet) / total) * 100);

  if (callRate > 40) {
    observations.push(`Called in ${callRate}% of key decisions`);
  }
  if (foldRate > 30) {
    observations.push(`Folded in ${foldRate}% of key decisions`);
  }
  if (raiseRate > 30) {
    observations.push(`Bet/raised in ${raiseRate}% of key decisions`);
  }

  // Determine overall style
  const passiveActions = actionCounts.call + actionCounts.check;
  const aggressiveActions = actionCounts.bet + actionCounts.raise + actionCounts['all-in'];

  let description: string;
  if (aggressiveActions > passiveActions * 1.5) {
    description = 'Leans toward aggressive lines in key spots';
  } else if (passiveActions > aggressiveActions * 1.5) {
    description = 'Leans toward passive lines in key spots';
  } else {
    description = 'Balanced between passive and aggressive lines';
  }

  if (observations.length === 0) {
    observations.push('Action distribution is relatively balanced');
  }

  return {
    id: 'action-preference',
    category: 'action-preference',
    title: 'Action Preference',
    description,
    observations,
    sampleSize: total,
    confidence: calculateConfidence(total),
  };
}

/**
 * Derive commitment pattern tendency
 */
function deriveCommitmentPatternTendency(
  decisions: readonly ReviewDecision[]
): TendencyObservation | null {
  const commitmentDecisions = decisions.filter(
    d => d.decisionType === 'commitment-threshold' || d.actionTaken === 'all-in'
  );

  if (commitmentDecisions.length < 2) {
    return null;
  }

  const observations: string[] = [];
  const total = commitmentDecisions.length;

  // Count streets where commitment happened
  const byStreet = groupDecisions(commitmentDecisions, d => d.street);

  for (const [street, streetDecisions] of byStreet) {
    if (streetDecisions.length > 0) {
      observations.push(`${streetDecisions.length} commitment decision(s) on ${street.toLowerCase()}`);
    }
  }

  // Check tension levels at commitment
  const highTensionCommits = commitmentDecisions.filter(d => d.tension >= 70).length;
  if (highTensionCommits > 0) {
    const rate = Math.round((highTensionCommits / total) * 100);
    observations.push(`${rate}% of commitments were in high-tension spots`);
  }

  return {
    id: 'commitment-pattern',
    category: 'commitment-pattern',
    title: 'Commitment Pattern',
    description: `Reached commitment threshold ${total} time(s)`,
    observations,
    sampleSize: total,
    confidence: calculateConfidence(total),
  };
}

// ============================================================================
// Profile Building Functions
// ============================================================================

/**
 * Build pressure profile from decisions
 */
function buildPressureProfile(
  decisions: readonly ReviewDecision[]
): PressureProfile {
  const byPressure = groupDecisions(decisions, d => d.pressureLevel);

  const highPressureResponses: PressureResponseStat[] = [];

  for (const level of ['critical', 'high', 'medium', 'low'] as PressureLevel[]) {
    const levelDecisions = byPressure.get(level) ?? [];
    if (levelDecisions.length > 0) {
      highPressureResponses.push({
        pressureLevel: level,
        actionDistribution: countActions(levelDecisions),
        totalDecisions: levelDecisions.length,
      });
    }
  }

  // Calculate average tension
  const totalTension = decisions.reduce((sum, d) => sum + d.tension, 0);
  const averageTensionFaced = decisions.length > 0 ? totalTension / decisions.length : 0;

  // Calculate pressure decision rate
  const highPressureCount = decisions.filter(
    d => d.pressureLevel === 'high' || d.pressureLevel === 'critical'
  ).length;
  const pressureDecisionRate = decisions.length > 0
    ? (highPressureCount / decisions.length) * 100
    : 0;

  return {
    highPressureResponses,
    averageTensionFaced,
    pressureDecisionRate,
  };
}

/**
 * Build progress indicators
 */
function buildProgressIndicators(
  handHistories: readonly HandHistory[],
  decisions: readonly ReviewDecision[]
): readonly ProgressIndicator[] {
  const indicators: ProgressIndicator[] = [];

  // 1. Review Coverage - how many hands were reviewed
  const handsWithReview = handHistories.filter(h => h.reviewInsight?.isAvailable).length;
  const reviewCoverage = handHistories.length > 0
    ? Math.round((handsWithReview / handHistories.length) * 100)
    : 0;

  indicators.push({
    id: 'review-coverage',
    label: 'Hands Reviewed',
    value: reviewCoverage,
    description: `${handsWithReview} of ${handHistories.length} hands reviewed`,
  });

  // 2. Decision Density - key decisions per hand
  const avgDecisionsPerHand = handHistories.length > 0
    ? decisions.length / handHistories.length
    : 0;
  const densityScore = Math.min(100, Math.round(avgDecisionsPerHand * 33)); // 3+ decisions per hand = 100%

  indicators.push({
    id: 'decision-density',
    label: 'Decision Density',
    value: densityScore,
    description: `${avgDecisionsPerHand.toFixed(1)} key decisions per hand`,
  });

  // 3. Pressure Exposure - how much pressure was faced
  const avgTension = decisions.length > 0
    ? decisions.reduce((sum, d) => sum + d.tension, 0) / decisions.length
    : 0;

  indicators.push({
    id: 'pressure-exposure',
    label: 'Pressure Exposure',
    value: Math.round(avgTension),
    description: `Average tension: ${Math.round(avgTension)}%`,
  });

  return indicators;
}

/**
 * Build session summary
 */
function buildSessionSummary(
  handHistories: readonly HandHistory[],
  decisions: readonly ReviewDecision[],
  tendencies: readonly TendencyObservation[]
): SessionSummary {
  const handsPlayed = handHistories.length;
  const totalDecisions = decisions.length;
  const keyDecisionsReviewed = decisions.length;

  // Determine dominant tendency
  let dominantTendency = 'No clear tendency yet';
  if (tendencies.length > 0) {
    const highestConfidence = tendencies.reduce((best, t) => {
      const confidenceOrder = { high: 3, medium: 2, low: 1 };
      return confidenceOrder[t.confidence] > confidenceOrder[best.confidence] ? t : best;
    });
    dominantTendency = highestConfidence.title;
  }

  // Generate session insight
  let sessionInsight: string;
  if (handsPlayed < 3) {
    sessionInsight = 'Early session. Play more hands to see tendencies.';
  } else if (decisions.length < 5) {
    sessionInsight = 'Not many big decisions yet. Play more hands.';
  } else {
    const pressureCount = decisions.filter(
      d => d.pressureLevel === 'high' || d.pressureLevel === 'critical'
    ).length;

    if (pressureCount > decisions.length * 0.5) {
      sessionInsight = 'Session featured many high-pressure decisions.';
    } else {
      sessionInsight = 'Session had a mix of decision types and pressure levels.';
    }
  }

  return {
    handsPlayed,
    totalDecisions,
    keyDecisionsReviewed,
    dominantTendency,
    sessionInsight,
  };
}

// ============================================================================
// Main Engine Function
// ============================================================================

/**
 * Build learning profile from hand histories
 *
 * @param params - Input parameters including hand histories and hero seat
 * @returns Complete learning profile
 */
export function buildLearningProfile(
  params: LearningProfileParams | null | undefined
): LearningProfile {
  // Defensive: null/undefined input
  if (!params) {
    return createEmptyProfile();
  }

  const { handHistories } = params;

  // Defensive: validate hand histories
  if (!handHistories || !Array.isArray(handHistories)) {
    return createEmptyProfile();
  }

  // Check minimum hands requirement
  if (handHistories.length < MIN_HANDS_FOR_PROFILE) {
    return createEmptyProfile();
  }

  // Collect all decisions
  const allDecisions = collectAllDecisions(handHistories);

  // Derive tendencies
  const tendencies: TendencyObservation[] = [];

  const pressureResponse = derivePressureResponseTendency(allDecisions);
  if (pressureResponse) tendencies.push(pressureResponse);

  const streetBehavior = deriveStreetBehaviorTendency(allDecisions);
  if (streetBehavior) tendencies.push(streetBehavior);

  const actionPreference = deriveActionPreferenceTendency(allDecisions);
  if (actionPreference) tendencies.push(actionPreference);

  const commitmentPattern = deriveCommitmentPatternTendency(allDecisions);
  if (commitmentPattern) tendencies.push(commitmentPattern);

  // Build other profile components
  const pressureProfile = buildPressureProfile(allDecisions);
  const progressIndicators = buildProgressIndicators(handHistories, allDecisions);
  const sessionSummary = buildSessionSummary(handHistories, allDecisions, tendencies);

  return {
    tendencies,
    pressureProfile,
    progressIndicators,
    sessionSummary,
    isAvailable: true,
  };
}

/**
 * Create empty profile for insufficient data
 */
function createEmptyProfile(): LearningProfile {
  return {
    tendencies: [],
    pressureProfile: {
      highPressureResponses: [],
      averageTensionFaced: 0,
      pressureDecisionRate: 0,
    },
    progressIndicators: [],
    sessionSummary: {
      handsPlayed: 0,
      totalDecisions: 0,
      keyDecisionsReviewed: 0,
      dominantTendency: 'Need more hands',
      sessionInsight: 'Play more hands to see your tendencies.',
    },
    isAvailable: false,
  };
}

// ============================================================================
// Helper Exports for UI
// ============================================================================

/**
 * Get color for tendency category
 */
export function getTendencyCategoryColor(category: TendencyCategory): string {
  switch (category) {
    case 'pressure-response': return '#f59e0b';
    case 'street-behavior': return '#8b5cf6';
    case 'action-preference': return '#06b6d4';
    case 'commitment-pattern': return '#ef4444';
    default: return '#6b7280';
  }
}

/**
 * Get icon for tendency category
 */
export function getTendencyCategoryIcon(category: TendencyCategory): string {
  switch (category) {
    case 'pressure-response': return '\u26A0'; // Warning
    case 'street-behavior': return '\u2192';   // Arrow
    case 'action-preference': return '\u2665'; // Heart
    case 'commitment-pattern': return '\u25CF'; // Filled circle
    default: return '\u2022';
  }
}

/**
 * Get confidence label
 */
export function getConfidenceLabel(confidence: 'low' | 'medium' | 'high'): string {
  switch (confidence) {
    case 'high': return 'Clear tendency';
    case 'medium': return 'Starting to see a tendency';
    case 'low': return 'Just a few hands so far';
    default: return '';
  }
}
