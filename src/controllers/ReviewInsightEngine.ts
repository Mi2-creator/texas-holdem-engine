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
 * ReviewInsightEngine.ts
 * Phase 7.1 - Pure function engine for post-hand review insights
 *
 * Generates structured review data for learning/reflection after HAND_END.
 * This is NOT about telling players what to do - it explains decision STRUCTURE.
 *
 * Key principles:
 * - No scoring or judgments
 * - No "you should have done X"
 * - Focus on pressure sources and decision context
 * - Maximum 3 key decisions to avoid information overload
 */

import type {
  EventInfo,
  PlayerInfo,
  DecisionTimeline,
  DecisionPoint,
  StreetPhase,
  PressureLevel,
  ActionClass,
} from '../models/DecisionTimelineModel';

import {
  buildDecisionTimeline,
  getHeroDecisions,
  calculatePotSize,
} from '../models/DecisionTimelineModel';

// ============================================================================
// Types
// ============================================================================

/**
 * Decision type classification for review context
 * These describe the STRUCTURE of the decision, not its quality
 */
export type DecisionType =
  | 'pressure-response'    // Facing significant pressure
  | 'pot-control'          // Managing pot size
  | 'value-decision'       // Betting/raising for value
  | 'protection-decision'  // Protecting equity
  | 'commitment-threshold' // Stack commitment decision
  | 'bluff-catch'          // Facing potential bluff
  | 'continuation'         // Standard continuation
  | 'exit-decision';       // Fold decision

/**
 * A single reviewed decision point
 */
export interface ReviewDecision {
  readonly index: number;
  readonly street: StreetPhase;
  readonly heroSeat: number;
  readonly potSize: number;
  readonly tension: number; // 0-100 scale
  readonly pressureLevel: PressureLevel;
  readonly decisionType: DecisionType;
  readonly actionTaken: ActionClass;
  readonly context: ReviewContext;
  readonly explanations: readonly string[];
}

/**
 * Context information for a review decision
 */
export interface ReviewContext {
  readonly facingBet: boolean;
  readonly facingRaise: boolean;
  readonly facingAllIn: boolean;
  readonly potOddsRequired: number;
  readonly stackCommitment: string;
  readonly streetPosition: 'early' | 'middle' | 'late';
  readonly aggressionLevel: 'low' | 'moderate' | 'high';
}

/**
 * Pattern summary for the entire hand
 */
export interface PatternSummary {
  readonly overallTension: 'calm' | 'moderate' | 'elevated' | 'high';
  readonly peakStreet: StreetPhase;
  readonly heroDecisionCount: number;
  readonly pressureDecisionCount: number;
  readonly patterns: readonly string[];
}

/**
 * Complete review insight output
 */
export interface ReviewInsight {
  readonly keyDecisions: readonly ReviewDecision[];
  readonly patterns: PatternSummary;
  readonly isAvailable: boolean;
  readonly handEndReason: string;
}

/**
 * Input parameters for review generation
 */
export interface ReviewInsightParams {
  readonly events: readonly EventInfo[];
  readonly players: readonly PlayerInfo[];
  readonly heroSeat: number;
  readonly timeline?: DecisionTimeline;
  readonly handEndReason?: string;
}

// ============================================================================
// Constants
// ============================================================================

const PRESSURE_THRESHOLDS = {
  LOW: 30,
  MEDIUM: 50,
  HIGH: 70,
  CRITICAL: 85,
} as const;

const MAX_KEY_DECISIONS = 3;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if hand has ended
 */
function isHandEnded(events: readonly EventInfo[]): boolean {
  if (!events || events.length === 0) return false;
  return events.some(e => e.type === 'HAND_END' || e.type === 'SHOWDOWN');
}

/**
 * Calculate tension score for a decision point (0-100)
 */
function calculateTension(decision: DecisionPoint, events: readonly EventInfo[]): number {
  let tension = 0;

  // Pressure level contribution
  switch (decision.insight.pressureLevel) {
    case 'critical': tension += 40; break;
    case 'high': tension += 30; break;
    case 'medium': tension += 15; break;
    case 'low': tension += 5; break;
  }

  // Street progression contribution (later = more tension)
  switch (decision.street) {
    case 'RIVER': tension += 25; break;
    case 'TURN': tension += 20; break;
    case 'FLOP': tension += 10; break;
    case 'PREFLOP': tension += 5; break;
  }

  // Significant action contribution
  if (decision.narrative.isSignificant) {
    tension += 15;
  }

  // Aggression environment contribution
  const aggressiveActions = ['bet', 'raise', 'all-in'];
  if (aggressiveActions.includes(decision.actionClass)) {
    tension += 10;
  }

  // Pot size relative to typical game
  const potSize = calculatePotSize(events, decision.index);
  if (potSize > 100) tension += 5;
  if (potSize > 300) tension += 10;

  return Math.min(100, tension);
}

/**
 * Determine decision type based on context
 */
function classifyDecisionType(
  decision: DecisionPoint,
  events: readonly EventInfo[]
): DecisionType {
  const { actionClass, insight, comparison } = decision;

  // Check what hero is facing
  const facingAggression = insight.pressureLevel === 'high' || insight.pressureLevel === 'critical';

  // Exit decision
  if (actionClass === 'fold') {
    return 'exit-decision';
  }

  // All-in or facing all-in
  if (actionClass === 'all-in') {
    return 'commitment-threshold';
  }

  // Facing significant pressure
  if (facingAggression && (actionClass === 'call' || actionClass === 'raise')) {
    if (comparison.actualAction.riskLevel === 'critical') {
      return 'commitment-threshold';
    }
    if (actionClass === 'call') {
      return 'bluff-catch';
    }
    return 'pressure-response';
  }

  // Aggressive actions
  if (actionClass === 'bet' || actionClass === 'raise') {
    if (insight.pressureLevel === 'low') {
      return 'value-decision';
    }
    return 'protection-decision';
  }

  // Check/call in low pressure
  if (actionClass === 'check' || actionClass === 'call') {
    return 'pot-control';
  }

  return 'continuation';
}

/**
 * Build review context for a decision
 */
function buildReviewContext(
  decision: DecisionPoint,
  events: readonly EventInfo[]
): ReviewContext {
  const { insight, comparison, index } = decision;

  // Analyze recent events for facing bet/raise/all-in
  let facingBet = false;
  let facingRaise = false;
  let facingAllIn = false;

  for (let i = Math.max(0, index - 3); i < index; i++) {
    const e = events[i];
    if (e?.type === 'BET') facingBet = true;
    if (e?.type === 'RAISE') facingRaise = true;
    if (e?.type === 'ALL_IN') facingAllIn = true;
  }

  // Calculate pot odds from comparison context
  const potOddsRequired = comparison.actualAction.riskLevel === 'critical' ? 0.4 :
    comparison.actualAction.riskLevel === 'high' ? 0.3 :
    comparison.actualAction.riskLevel === 'medium' ? 0.2 : 0.1;

  // Determine street position
  const streetPosition: 'early' | 'middle' | 'late' =
    decision.street === 'PREFLOP' || decision.street === 'FLOP' ? 'early' :
    decision.street === 'TURN' ? 'middle' : 'late';

  // Determine aggression level
  const aggressionLevel: 'low' | 'moderate' | 'high' =
    insight.pressureLevel === 'critical' || insight.pressureLevel === 'high' ? 'high' :
    insight.pressureLevel === 'medium' ? 'moderate' : 'low';

  return {
    facingBet,
    facingRaise,
    facingAllIn,
    potOddsRequired,
    stackCommitment: comparison.actualAction.potCommitment,
    streetPosition,
    aggressionLevel,
  };
}

/**
 * Generate explanations for why this is a key decision
 * These are STRUCTURAL explanations, not judgments
 */
function generateExplanations(
  decision: DecisionPoint,
  decisionType: DecisionType,
  context: ReviewContext,
  tension: number
): readonly string[] {
  const explanations: string[] = [];

  // Street context
  if (decision.street === 'RIVER') {
    explanations.push('River decisions finalize pot commitment.');
  } else if (decision.street === 'TURN') {
    explanations.push('Turn decisions often define hand trajectory.');
  }

  // Decision type explanations
  switch (decisionType) {
    case 'pressure-response':
      explanations.push('This decision responded to significant betting pressure.');
      break;
    case 'pot-control':
      explanations.push('This decision managed pot size for future streets.');
      break;
    case 'commitment-threshold':
      explanations.push('This decision involved major stack commitment.');
      break;
    case 'bluff-catch':
      explanations.push('This decision navigated a potential bluff scenario.');
      break;
    case 'value-decision':
      explanations.push('This decision extracted value from a strong position.');
      break;
    case 'protection-decision':
      explanations.push('This decision protected equity against draws.');
      break;
    case 'exit-decision':
      explanations.push('This decision chose to exit the hand.');
      break;
  }

  // Context-based explanations
  if (context.facingAllIn) {
    explanations.push('All-in pressure created a binary decision point.');
  } else if (context.facingRaise) {
    explanations.push('The raise increased decision complexity.');
  }

  if (tension >= PRESSURE_THRESHOLDS.HIGH) {
    explanations.push('High tension environment amplified decision weight.');
  }

  return explanations.slice(0, 3); // Max 3 explanations per decision
}

/**
 * Score a decision for "key decision" ranking
 * Higher score = more important for review
 */
function scoreDecisionImportance(
  decision: DecisionPoint,
  tension: number,
  context: ReviewContext
): number {
  let score = 0;

  // Hero decision is important
  if (decision.isHeroDecision) score += 50;

  // Tension contribution
  score += tension * 0.3;

  // Significant narrative
  if (decision.narrative.isSignificant) score += 20;

  // Facing aggression
  if (context.facingAllIn) score += 30;
  if (context.facingRaise) score += 15;
  if (context.facingBet) score += 10;

  // Later streets more important
  if (decision.street === 'RIVER') score += 15;
  if (decision.street === 'TURN') score += 10;

  // High pressure level
  if (decision.insight.pressureLevel === 'critical') score += 25;
  if (decision.insight.pressureLevel === 'high') score += 15;

  return score;
}

/**
 * Select key decisions from timeline
 */
function selectKeyDecisions(
  heroDecisions: DecisionTimeline,
  events: readonly EventInfo[],
  heroSeat: number
): readonly ReviewDecision[] {
  if (heroDecisions.length === 0) return [];

  // Calculate importance scores for all hero decisions
  const scoredDecisions = heroDecisions.map(decision => {
    const tension = calculateTension(decision, events);
    const context = buildReviewContext(decision, events);
    const decisionType = classifyDecisionType(decision, events);
    const score = scoreDecisionImportance(decision, tension, context);

    return { decision, tension, context, decisionType, score };
  });

  // Sort by importance score (highest first)
  scoredDecisions.sort((a, b) => b.score - a.score);

  // Take top N decisions
  const topDecisions = scoredDecisions.slice(0, MAX_KEY_DECISIONS);

  // Sort by timeline order for presentation
  topDecisions.sort((a, b) => a.decision.index - b.decision.index);

  // Build ReviewDecision objects
  return topDecisions.map(({ decision, tension, context, decisionType }) => ({
    index: decision.index,
    street: decision.street,
    heroSeat,
    potSize: calculatePotSize(events, decision.index),
    tension,
    pressureLevel: decision.insight.pressureLevel,
    decisionType,
    actionTaken: decision.actionClass,
    context,
    explanations: generateExplanations(decision, decisionType, context, tension),
  }));
}

/**
 * Generate pattern summary for the hand
 */
function generatePatternSummary(
  heroDecisions: DecisionTimeline,
  allDecisions: DecisionTimeline,
  events: readonly EventInfo[]
): PatternSummary {
  const patterns: string[] = [];

  // Calculate overall tension
  let totalTension = 0;
  let maxTension = 0;
  let peakStreet: StreetPhase = 'PREFLOP';

  for (const decision of heroDecisions) {
    const tension = calculateTension(decision, events);
    totalTension += tension;
    if (tension > maxTension) {
      maxTension = tension;
      peakStreet = decision.street;
    }
  }

  const avgTension = heroDecisions.length > 0 ? totalTension / heroDecisions.length : 0;

  const overallTension: 'calm' | 'moderate' | 'elevated' | 'high' =
    avgTension >= PRESSURE_THRESHOLDS.HIGH ? 'high' :
    avgTension >= PRESSURE_THRESHOLDS.MEDIUM ? 'elevated' :
    avgTension >= PRESSURE_THRESHOLDS.LOW ? 'moderate' : 'calm';

  // Count pressure decisions
  const pressureDecisionCount = heroDecisions.filter(d =>
    d.insight.pressureLevel === 'high' || d.insight.pressureLevel === 'critical'
  ).length;

  // Detect patterns
  // Pattern: Aggression peaked early
  const earlyAggression = allDecisions.filter(d =>
    (d.street === 'PREFLOP' || d.street === 'FLOP') &&
    ['bet', 'raise', 'all-in'].includes(d.actionClass)
  ).length;

  const lateAggression = allDecisions.filter(d =>
    (d.street === 'TURN' || d.street === 'RIVER') &&
    ['bet', 'raise', 'all-in'].includes(d.actionClass)
  ).length;

  if (earlyAggression > lateAggression + 2) {
    patterns.push('Aggression peaked early in the hand.');
  } else if (lateAggression > earlyAggression + 2) {
    patterns.push('Pressure escalated on later streets.');
  }

  // Pattern: Hero faced multiple pressure decisions
  if (pressureDecisionCount >= 2) {
    patterns.push('Hero faced multiple pressure decisions.');
  }

  // Pattern: High commitment scenario
  const allInDecisions = heroDecisions.filter(d => d.actionClass === 'all-in');
  if (allInDecisions.length > 0) {
    patterns.push('Hand reached full commitment threshold.');
  }

  // Pattern: Defensive posture
  const foldCount = heroDecisions.filter(d => d.actionClass === 'fold').length;
  const callCount = heroDecisions.filter(d => d.actionClass === 'call' || d.actionClass === 'check').length;
  const aggressiveCount = heroDecisions.filter(d =>
    ['bet', 'raise', 'all-in'].includes(d.actionClass)
  ).length;

  if (callCount > aggressiveCount && heroDecisions.length >= 2) {
    patterns.push('Hero maintained defensive posture.');
  } else if (aggressiveCount > callCount && heroDecisions.length >= 2) {
    patterns.push('Hero drove the action aggressively.');
  }

  // Pattern: Quick exit
  if (foldCount > 0 && heroDecisions.length <= 2) {
    patterns.push('Hero exited the hand early.');
  }

  // Ensure at least one pattern
  if (patterns.length === 0) {
    patterns.push('Standard hand progression observed.');
  }

  return {
    overallTension,
    peakStreet,
    heroDecisionCount: heroDecisions.length,
    pressureDecisionCount,
    patterns: patterns.slice(0, 4), // Max 4 patterns
  };
}

// ============================================================================
// Main Engine Function
// ============================================================================

/**
 * Generate review insights for a completed hand
 *
 * @param params - Input parameters including events, players, and hero seat
 * @returns Review insight data structure
 */
export function generateReviewInsight(
  params: ReviewInsightParams | null | undefined
): ReviewInsight {
  // Defensive: null/undefined input
  if (!params) {
    return {
      keyDecisions: [],
      patterns: {
        overallTension: 'calm',
        peakStreet: 'PREFLOP',
        heroDecisionCount: 0,
        pressureDecisionCount: 0,
        patterns: [],
      },
      isAvailable: false,
      handEndReason: '',
    };
  }

  const { events, players, heroSeat, timeline: providedTimeline, handEndReason } = params;

  // Defensive: validate required fields
  if (!events || !Array.isArray(events) || events.length === 0) {
    return {
      keyDecisions: [],
      patterns: {
        overallTension: 'calm',
        peakStreet: 'PREFLOP',
        heroDecisionCount: 0,
        pressureDecisionCount: 0,
        patterns: [],
      },
      isAvailable: false,
      handEndReason: '',
    };
  }

  // Check if hand has ended
  if (!isHandEnded(events)) {
    return {
      keyDecisions: [],
      patterns: {
        overallTension: 'calm',
        peakStreet: 'PREFLOP',
        heroDecisionCount: 0,
        pressureDecisionCount: 0,
        patterns: [],
      },
      isAvailable: false,
      handEndReason: '',
    };
  }

  // Build or use provided timeline
  const timeline = providedTimeline ?? buildDecisionTimeline(events, players ?? [], heroSeat);

  // Get hero decisions
  const heroDecisions = getHeroDecisions(timeline);

  // Select key decisions
  const keyDecisions = selectKeyDecisions(heroDecisions, events, heroSeat);

  // Generate pattern summary
  const patterns = generatePatternSummary(heroDecisions, timeline, events);

  // Determine hand end reason
  const endEvent = events.find(e => e.type === 'HAND_END');
  const finalReason = handEndReason ?? (endEvent as { reason?: string } | undefined)?.reason ?? 'Unknown';

  return {
    keyDecisions,
    patterns,
    isAvailable: true,
    handEndReason: finalReason,
  };
}

// ============================================================================
// Helper Exports for UI
// ============================================================================

/**
 * Get display label for decision type
 */
export function getDecisionTypeLabel(type: DecisionType): string {
  switch (type) {
    case 'pressure-response': return 'Pressure Response';
    case 'pot-control': return 'Pot Control';
    case 'value-decision': return 'Value Decision';
    case 'protection-decision': return 'Protection';
    case 'commitment-threshold': return 'Commitment Threshold';
    case 'bluff-catch': return 'Bluff Catch';
    case 'continuation': return 'Continuation';
    case 'exit-decision': return 'Exit Decision';
    default: return 'Decision';
  }
}

/**
 * Get color for decision type
 */
export function getDecisionTypeColor(type: DecisionType): string {
  switch (type) {
    case 'pressure-response': return '#f59e0b';
    case 'commitment-threshold': return '#ef4444';
    case 'bluff-catch': return '#8b5cf6';
    case 'value-decision': return '#22c55e';
    case 'protection-decision': return '#06b6d4';
    case 'pot-control': return '#6b7280';
    case 'exit-decision': return '#9ca3af';
    case 'continuation': return '#64748b';
    default: return '#6b7280';
  }
}

/**
 * Get tension label
 */
export function getTensionLabel(tension: number): string {
  if (tension >= PRESSURE_THRESHOLDS.CRITICAL) return 'Critical';
  if (tension >= PRESSURE_THRESHOLDS.HIGH) return 'High';
  if (tension >= PRESSURE_THRESHOLDS.MEDIUM) return 'Elevated';
  if (tension >= PRESSURE_THRESHOLDS.LOW) return 'Moderate';
  return 'Calm';
}

/**
 * Build summary text for review bar
 */
export function buildReviewBarSummary(insight: ReviewInsight): string {
  if (!insight.isAvailable) return '';

  const parts: string[] = [];

  if (insight.keyDecisions.length > 0) {
    parts.push(`${insight.keyDecisions.length} key decision${insight.keyDecisions.length > 1 ? 's' : ''}`);
  }

  if (insight.patterns.overallTension !== 'calm') {
    parts.push(`${insight.patterns.overallTension} pressure`);
  }

  return parts.join(' \u00B7 '); // Middle dot separator
}
