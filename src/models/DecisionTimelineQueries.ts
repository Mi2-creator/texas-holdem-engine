// ============================================================================
// DecisionTimelineQueries - Advanced Query Helpers & Derived Metrics
// ============================================================================
//
// 【Post-Freeze Feature Expansion】Replay Architecture Freeze Declaration v1.0 Compliant
// 【Read-Only Extension】Consumes DecisionTimelineModel output only
//
// 层级: Query Layer (纯查询)
// 职责: 提供高级查询函数和派生指标，用于面板功能扩展
//
// 重要约束:
//   - 不引入任何回放逻辑或状态变更
//   - 不 import src/replay/** 或 src/commands/**
//   - 不调用 EventProcessor
//   - 不构造 ReplayEvent
//   - 不使用 React 或任何 Hooks
//   - 所有函数必须是纯函数（确定性，无副作用）
//   - 所有返回类型必须是 readonly
//   - 不修改 DecisionTimelineModel.ts
//
// INV 合规性:
//   - INV-1 幂等快照: 不参与快照生成
//   - INV-2 回放确定性: 不参与回放过程
//   - INV-3 只读契约: 所有数据访问均为只读
//   - INV-4 序列单调性: 不修改序列号
//   - INV-5 压缩无损性: 不涉及压缩层
//
// H 合规性:
//   - H-1 安全手牌处理: 不涉及底牌可见性逻辑
//   - H-2 边界安全: 检查事件存在性后再访问
//   - H-3 无副作用: 使用纯函数进行计算
//   - H-4 值语义: 不修改任何值
//
// ============================================================================

import type {
  DecisionTimeline,
  DecisionPoint,
  ActionClass,
  PressureLevel,
  AlignmentLabel,
  ConfidenceLevel,
  AggressionLevel,
  StreetPhase,
} from './DecisionTimelineModel';

// ============================================================================
// SECTION 1: Advanced Query Helpers
// ============================================================================

// ============================================================================
// 1.1 Action-Based Queries
// ============================================================================

/**
 * Get all decisions matching a specific action type
 */
export function getDecisionsByActionType(
  timeline: DecisionTimeline,
  actionType: ActionClass
): DecisionTimeline {
  return timeline.filter(d => d.actionClass === actionType);
}

/**
 * Get all aggressive decisions (bet, raise, all-in)
 */
export function getAggressiveDecisions(timeline: DecisionTimeline): DecisionTimeline {
  const aggressiveActions: readonly ActionClass[] = ['bet', 'raise', 'all-in'];
  return timeline.filter(d => aggressiveActions.includes(d.actionClass));
}

/**
 * Get all passive decisions (check, call, fold)
 */
export function getPassiveDecisions(timeline: DecisionTimeline): DecisionTimeline {
  const passiveActions: readonly ActionClass[] = ['check', 'call', 'fold'];
  return timeline.filter(d => passiveActions.includes(d.actionClass));
}

/**
 * Get all continuation decisions (not folding)
 */
export function getContinuationDecisions(timeline: DecisionTimeline): DecisionTimeline {
  return timeline.filter(d => d.actionClass !== 'fold');
}

/**
 * Get all folding decisions
 */
export function getFoldingDecisions(timeline: DecisionTimeline): DecisionTimeline {
  return timeline.filter(d => d.actionClass === 'fold');
}

/**
 * Get all all-in decisions
 */
export function getAllInDecisions(timeline: DecisionTimeline): DecisionTimeline {
  return timeline.filter(d => d.actionClass === 'all-in');
}

// ============================================================================
// 1.2 Turning Point Detection
// ============================================================================

/**
 * Turning point criteria for detecting pivotal moments
 */
export interface TurningPointCriteria {
  readonly minAmountThreshold?: number;
  readonly includeAllIns?: boolean;
  readonly includeHighRiskDeviations?: boolean;
  readonly includeCriticalPressure?: boolean;
  readonly includeFirstAggression?: boolean;
}

const DEFAULT_TURNING_POINT_CRITERIA: TurningPointCriteria = {
  includeAllIns: true,
  includeHighRiskDeviations: true,
  includeCriticalPressure: true,
  includeFirstAggression: true,
};

/**
 * Detect turning point decisions that significantly altered hand trajectory
 */
export function getTurningPointDecisions(
  timeline: DecisionTimeline,
  criteria: TurningPointCriteria = DEFAULT_TURNING_POINT_CRITERIA
): DecisionTimeline {
  const turningPoints: DecisionPoint[] = [];
  let firstAggressionFound = false;
  const streetFirstAggression = new Map<StreetPhase, boolean>();

  for (const decision of timeline) {
    let isTurningPoint = false;

    // All-in is always a turning point
    if (criteria.includeAllIns && decision.actionClass === 'all-in') {
      isTurningPoint = true;
    }

    // High-risk deviations are turning points
    if (criteria.includeHighRiskDeviations && decision.alignment.alignmentLabel === 'High-risk deviation') {
      isTurningPoint = true;
    }

    // Critical pressure decisions
    if (criteria.includeCriticalPressure && decision.insight.pressureLevel === 'critical') {
      isTurningPoint = true;
    }

    // First aggression in hand or on a street
    if (criteria.includeFirstAggression && ['bet', 'raise'].includes(decision.actionClass)) {
      if (!firstAggressionFound) {
        firstAggressionFound = true;
        isTurningPoint = true;
      }
      if (!streetFirstAggression.get(decision.street)) {
        streetFirstAggression.set(decision.street, true);
        isTurningPoint = true;
      }
    }

    // Large bets relative to threshold
    if (criteria.minAmountThreshold && decision.amount !== undefined) {
      if (decision.amount >= criteria.minAmountThreshold) {
        isTurningPoint = true;
      }
    }

    // Significant narrative flag
    if (decision.narrative.isSignificant) {
      isTurningPoint = true;
    }

    if (isTurningPoint) {
      turningPoints.push(decision);
    }
  }

  return turningPoints;
}

// ============================================================================
// 1.3 Risk-Reward Analysis Queries
// ============================================================================

/**
 * Identify high-risk, low-reward decisions
 * (aggressive action with low confidence and high deviation)
 */
export function getHighRiskLowRewardDecisions(timeline: DecisionTimeline): DecisionTimeline {
  return timeline.filter(d => {
    const isAggressive = ['bet', 'raise', 'all-in'].includes(d.actionClass);
    const isLowConfidence = d.alignment.confidence === 'low';
    const isDeviating = d.alignment.alignmentLabel !== 'Aligned';
    const isHighPressure = d.insight.pressureLevel === 'high' || d.insight.pressureLevel === 'critical';

    return isAggressive && isLowConfidence && isDeviating && isHighPressure;
  });
}

/**
 * Identify optimal decisions (aligned with high confidence)
 */
export function getOptimalDecisions(timeline: DecisionTimeline): DecisionTimeline {
  return timeline.filter(d =>
    d.alignment.alignmentLabel === 'Aligned' && d.alignment.confidence === 'high'
  );
}

/**
 * Identify questionable decisions (deviating with low confidence)
 */
export function getQuestionableDecisions(timeline: DecisionTimeline): DecisionTimeline {
  return timeline.filter(d =>
    d.alignment.alignmentLabel !== 'Aligned' && d.alignment.confidence === 'low'
  );
}

// ============================================================================
// 1.4 Player Pressure Timeline
// ============================================================================

/**
 * Pressure timeline entry for a single decision
 */
export interface PressureTimelineEntry {
  readonly index: number;
  readonly playerName: string;
  readonly street: StreetPhase;
  readonly pressureLevel: PressureLevel;
  readonly pressureScore: number; // 0-4 numeric scale
  readonly actionClass: ActionClass;
  readonly isHeroDecision: boolean;
}

/**
 * Convert pressure level to numeric score
 */
function pressureLevelToScore(level: PressureLevel): number {
  switch (level) {
    case 'low': return 1;
    case 'medium': return 2;
    case 'high': return 3;
    case 'critical': return 4;
    default: return 0;
  }
}

/**
 * Build pressure timeline for a specific player or all players
 */
export function getPlayerPressureTimeline(
  timeline: DecisionTimeline,
  playerId?: string
): readonly PressureTimelineEntry[] {
  const filtered = playerId
    ? timeline.filter(d => d.playerId === playerId)
    : timeline;

  return filtered.map(d => ({
    index: d.index,
    playerName: d.playerName,
    street: d.street,
    pressureLevel: d.insight.pressureLevel,
    pressureScore: pressureLevelToScore(d.insight.pressureLevel),
    actionClass: d.actionClass,
    isHeroDecision: d.isHeroDecision,
  }));
}

// ============================================================================
// 1.5 Hero vs Field Comparison
// ============================================================================

/**
 * Hero vs Field comparison statistics
 */
export interface HeroVsFieldComparison {
  readonly heroStats: PlayerStatistics;
  readonly fieldStats: PlayerStatistics;
  readonly heroAdvantages: readonly string[];
  readonly heroDisadvantages: readonly string[];
  readonly comparisonSummary: string;
}

/**
 * Player statistics aggregate
 */
export interface PlayerStatistics {
  readonly totalDecisions: number;
  readonly aggressionRate: number; // 0-1
  readonly foldRate: number; // 0-1
  readonly alignmentRate: number; // 0-1
  readonly averagePressure: number; // 0-4
  readonly highRiskDeviations: number;
  readonly optimalDecisions: number;
}

/**
 * Calculate statistics for a set of decisions
 */
function calculatePlayerStatistics(decisions: DecisionTimeline): PlayerStatistics {
  if (decisions.length === 0) {
    return {
      totalDecisions: 0,
      aggressionRate: 0,
      foldRate: 0,
      alignmentRate: 0,
      averagePressure: 0,
      highRiskDeviations: 0,
      optimalDecisions: 0,
    };
  }

  let aggressiveCount = 0;
  let foldCount = 0;
  let alignedCount = 0;
  let pressureSum = 0;
  let highRiskCount = 0;
  let optimalCount = 0;

  for (const d of decisions) {
    if (['bet', 'raise', 'all-in'].includes(d.actionClass)) {
      aggressiveCount++;
    }
    if (d.actionClass === 'fold') {
      foldCount++;
    }
    if (d.alignment.alignmentLabel === 'Aligned') {
      alignedCount++;
    }
    if (d.alignment.alignmentLabel === 'High-risk deviation') {
      highRiskCount++;
    }
    if (d.alignment.alignmentLabel === 'Aligned' && d.alignment.confidence === 'high') {
      optimalCount++;
    }
    pressureSum += pressureLevelToScore(d.insight.pressureLevel);
  }

  return {
    totalDecisions: decisions.length,
    aggressionRate: aggressiveCount / decisions.length,
    foldRate: foldCount / decisions.length,
    alignmentRate: alignedCount / decisions.length,
    averagePressure: pressureSum / decisions.length,
    highRiskDeviations: highRiskCount,
    optimalDecisions: optimalCount,
  };
}

/**
 * Compare hero decisions against field (all other players)
 */
export function getHeroVsFieldComparison(timeline: DecisionTimeline): HeroVsFieldComparison {
  const heroDecisions = timeline.filter(d => d.isHeroDecision);
  const fieldDecisions = timeline.filter(d => !d.isHeroDecision);

  const heroStats = calculatePlayerStatistics(heroDecisions);
  const fieldStats = calculatePlayerStatistics(fieldDecisions);

  const advantages: string[] = [];
  const disadvantages: string[] = [];

  // Compare aggression
  if (heroStats.aggressionRate > fieldStats.aggressionRate + 0.1) {
    advantages.push('More aggressive than field');
  } else if (heroStats.aggressionRate < fieldStats.aggressionRate - 0.1) {
    disadvantages.push('Less aggressive than field');
  }

  // Compare alignment
  if (heroStats.alignmentRate > fieldStats.alignmentRate + 0.1) {
    advantages.push('Better strategic alignment');
  } else if (heroStats.alignmentRate < fieldStats.alignmentRate - 0.1) {
    disadvantages.push('More strategic deviations');
  }

  // Compare fold rate
  if (heroStats.foldRate < fieldStats.foldRate - 0.1) {
    advantages.push('Tighter hand selection');
  } else if (heroStats.foldRate > fieldStats.foldRate + 0.1) {
    disadvantages.push('Folding too frequently');
  }

  // Compare high-risk decisions
  if (heroStats.highRiskDeviations < fieldStats.highRiskDeviations) {
    advantages.push('Fewer high-risk deviations');
  } else if (heroStats.highRiskDeviations > fieldStats.highRiskDeviations) {
    disadvantages.push('More high-risk plays');
  }

  // Compare optimal decisions
  if (heroStats.optimalDecisions > fieldStats.optimalDecisions) {
    advantages.push('More optimal decision-making');
  }

  // Generate summary
  let comparisonSummary: string;
  if (advantages.length > disadvantages.length) {
    comparisonSummary = `Hero demonstrates superior play with ${advantages.length} advantages over the field. Key strengths: ${advantages.slice(0, 2).join(', ')}.`;
  } else if (disadvantages.length > advantages.length) {
    comparisonSummary = `Hero shows areas for improvement with ${disadvantages.length} relative weaknesses. Focus areas: ${disadvantages.slice(0, 2).join(', ')}.`;
  } else {
    comparisonSummary = 'Hero performance is comparable to field average with balanced strengths and weaknesses.';
  }

  return {
    heroStats,
    fieldStats,
    heroAdvantages: advantages,
    heroDisadvantages: disadvantages,
    comparisonSummary,
  };
}

// ============================================================================
// SECTION 2: Derived Metrics (Pure, Deterministic)
// ============================================================================

// ============================================================================
// 2.1 Volatility Score
// ============================================================================

/**
 * Volatility metrics for a timeline
 */
export interface VolatilityMetrics {
  readonly volatilityScore: number; // 0-100
  readonly volatilityLabel: 'stable' | 'moderate' | 'volatile' | 'chaotic';
  readonly volatilityDescription: string;
  readonly actionSwings: number;
  readonly pressureSwings: number;
  readonly maxConsecutiveAggression: number;
  readonly maxConsecutivePassive: number;
}

/**
 * Calculate volatility score and metrics for a timeline
 *
 * Volatility measures how much the action style varies throughout the hand.
 * High volatility indicates frequent shifts between aggressive and passive play.
 */
export function calculateVolatilityMetrics(timeline: DecisionTimeline): VolatilityMetrics {
  if (timeline.length < 2) {
    return {
      volatilityScore: 0,
      volatilityLabel: 'stable',
      volatilityDescription: 'Insufficient data for volatility analysis',
      actionSwings: 0,
      pressureSwings: 0,
      maxConsecutiveAggression: 0,
      maxConsecutivePassive: 0,
    };
  }

  let actionSwings = 0;
  let pressureSwings = 0;
  let currentAggressionStreak = 0;
  let currentPassiveStreak = 0;
  let maxAggressionStreak = 0;
  let maxPassiveStreak = 0;

  const isAggressive = (action: ActionClass): boolean =>
    ['bet', 'raise', 'all-in'].includes(action);

  for (let i = 0; i < timeline.length; i++) {
    const current = timeline[i];
    const prev = i > 0 ? timeline[i - 1] : null;

    // Track action swings (aggressive <-> passive)
    if (prev) {
      const wasAggressive = isAggressive(prev.actionClass);
      const nowAggressive = isAggressive(current.actionClass);
      if (wasAggressive !== nowAggressive) {
        actionSwings++;
      }

      // Track pressure swings (2+ level change)
      const prevScore = pressureLevelToScore(prev.insight.pressureLevel);
      const currentScore = pressureLevelToScore(current.insight.pressureLevel);
      if (Math.abs(currentScore - prevScore) >= 2) {
        pressureSwings++;
      }
    }

    // Track consecutive streaks
    if (isAggressive(current.actionClass)) {
      currentAggressionStreak++;
      currentPassiveStreak = 0;
      maxAggressionStreak = Math.max(maxAggressionStreak, currentAggressionStreak);
    } else {
      currentPassiveStreak++;
      currentAggressionStreak = 0;
      maxPassiveStreak = Math.max(maxPassiveStreak, currentPassiveStreak);
    }
  }

  // Calculate volatility score (0-100)
  const swingRate = (actionSwings + pressureSwings) / (timeline.length - 1);
  const volatilityScore = Math.min(100, Math.round(swingRate * 100 + (actionSwings * 10)));

  // Determine label
  let volatilityLabel: VolatilityMetrics['volatilityLabel'];
  let volatilityDescription: string;

  if (volatilityScore < 20) {
    volatilityLabel = 'stable';
    volatilityDescription = 'Consistent play style throughout the hand with minimal variance.';
  } else if (volatilityScore < 45) {
    volatilityLabel = 'moderate';
    volatilityDescription = 'Some variation in play style but generally predictable patterns.';
  } else if (volatilityScore < 70) {
    volatilityLabel = 'volatile';
    volatilityDescription = 'Significant swings between aggressive and passive play. Difficult to predict.';
  } else {
    volatilityLabel = 'chaotic';
    volatilityDescription = 'Extremely unpredictable action with frequent dramatic shifts.';
  }

  return {
    volatilityScore,
    volatilityLabel,
    volatilityDescription,
    actionSwings,
    pressureSwings,
    maxConsecutiveAggression: maxAggressionStreak,
    maxConsecutivePassive: maxPassiveStreak,
  };
}

// ============================================================================
// 2.2 Risk Escalation Curve
// ============================================================================

/**
 * Single point on the risk escalation curve
 */
export interface RiskEscalationPoint {
  readonly index: number;
  readonly cumulativeRisk: number; // 0-100
  readonly instantaneousRisk: number; // 0-100
  readonly street: StreetPhase;
  readonly playerName: string;
  readonly escalationDelta: number; // change from previous point
}

/**
 * Risk escalation curve metrics
 */
export interface RiskEscalationCurve {
  readonly points: readonly RiskEscalationPoint[];
  readonly peakRisk: number;
  readonly peakIndex: number;
  readonly finalRisk: number;
  readonly escalationPattern: 'gradual' | 'sudden' | 'de-escalating' | 'stable';
  readonly escalationDescription: string;
}

/**
 * Calculate risk score for a single decision
 */
function calculateDecisionRisk(decision: DecisionPoint): number {
  let risk = 0;

  // Action type risk
  switch (decision.actionClass) {
    case 'all-in': risk += 40; break;
    case 'raise': risk += 25; break;
    case 'bet': risk += 20; break;
    case 'call': risk += 10; break;
    case 'check': risk += 5; break;
    case 'fold': risk += 0; break;
    default: risk += 5;
  }

  // Pressure level risk
  switch (decision.insight.pressureLevel) {
    case 'critical': risk += 30; break;
    case 'high': risk += 20; break;
    case 'medium': risk += 10; break;
    case 'low': risk += 5; break;
  }

  // Alignment risk
  switch (decision.alignment.alignmentLabel) {
    case 'High-risk deviation': risk += 25; break;
    case 'Deviates': risk += 10; break;
    case 'Aligned': risk += 0; break;
  }

  // Confidence modifier (lower confidence = higher risk)
  switch (decision.alignment.confidence) {
    case 'low': risk += 10; break;
    case 'medium': risk += 5; break;
    case 'high': risk += 0; break;
  }

  return Math.min(100, risk);
}

/**
 * Calculate the risk escalation curve for a timeline
 *
 * Tracks how risk accumulates throughout the hand, identifying
 * sudden spikes and overall escalation patterns.
 */
export function calculateRiskEscalationCurve(timeline: DecisionTimeline): RiskEscalationCurve {
  if (timeline.length === 0) {
    return {
      points: [],
      peakRisk: 0,
      peakIndex: -1,
      finalRisk: 0,
      escalationPattern: 'stable',
      escalationDescription: 'No decisions to analyze.',
    };
  }

  const points: RiskEscalationPoint[] = [];
  let cumulativeRisk = 0;
  let peakRisk = 0;
  let peakIndex = 0;
  let suddenSpikes = 0;
  let gradualIncreases = 0;
  let decreases = 0;

  for (let i = 0; i < timeline.length; i++) {
    const decision = timeline[i];
    const instantaneousRisk = calculateDecisionRisk(decision);

    // Weighted cumulative (recent decisions weighted more)
    const weight = 0.3 + (0.7 * (i / timeline.length));
    cumulativeRisk = cumulativeRisk * 0.8 + instantaneousRisk * weight;
    cumulativeRisk = Math.min(100, cumulativeRisk);

    const prevPoint = points[points.length - 1];
    const escalationDelta = prevPoint ? cumulativeRisk - prevPoint.cumulativeRisk : cumulativeRisk;

    // Track escalation patterns
    if (escalationDelta > 15) {
      suddenSpikes++;
    } else if (escalationDelta > 5) {
      gradualIncreases++;
    } else if (escalationDelta < -5) {
      decreases++;
    }

    // Track peak
    if (cumulativeRisk > peakRisk) {
      peakRisk = cumulativeRisk;
      peakIndex = decision.index;
    }

    points.push({
      index: decision.index,
      cumulativeRisk: Math.round(cumulativeRisk),
      instantaneousRisk,
      street: decision.street,
      playerName: decision.playerName,
      escalationDelta: Math.round(escalationDelta),
    });
  }

  // Determine pattern
  let escalationPattern: RiskEscalationCurve['escalationPattern'];
  let escalationDescription: string;

  if (suddenSpikes >= 2) {
    escalationPattern = 'sudden';
    escalationDescription = `Risk escalated suddenly with ${suddenSpikes} significant spikes. Peak risk reached ${Math.round(peakRisk)}%.`;
  } else if (decreases > gradualIncreases) {
    escalationPattern = 'de-escalating';
    escalationDescription = `Risk de-escalated throughout the hand, starting high and settling to ${Math.round(cumulativeRisk)}%.`;
  } else if (gradualIncreases > 2) {
    escalationPattern = 'gradual';
    escalationDescription = `Risk built gradually over ${gradualIncreases} incremental increases to ${Math.round(cumulativeRisk)}%.`;
  } else {
    escalationPattern = 'stable';
    escalationDescription = `Risk remained relatively stable throughout at approximately ${Math.round(cumulativeRisk)}%.`;
  }

  return {
    points,
    peakRisk: Math.round(peakRisk),
    peakIndex,
    finalRisk: Math.round(cumulativeRisk),
    escalationPattern,
    escalationDescription,
  };
}

// ============================================================================
// 2.3 Commitment Momentum
// ============================================================================

/**
 * Commitment momentum metrics
 */
export interface CommitmentMomentum {
  readonly momentumScore: number; // -100 to +100
  readonly momentumDirection: 'accelerating' | 'decelerating' | 'neutral';
  readonly momentumDescription: string;
  readonly commitmentTrend: readonly number[]; // per-decision commitment deltas
  readonly averageCommitmentDelta: number;
  readonly peakMomentum: number;
  readonly momentumShifts: number;
}

/**
 * Calculate commitment level for a decision
 */
function calculateCommitmentLevel(decision: DecisionPoint): number {
  let commitment = 0;

  switch (decision.actionClass) {
    case 'all-in': commitment = 100; break;
    case 'raise': commitment = 70; break;
    case 'bet': commitment = 50; break;
    case 'call': commitment = 30; break;
    case 'check': commitment = 10; break;
    case 'fold': commitment = 0; break;
    default: commitment = 20;
  }

  // Adjust for amount if available
  if (decision.amount !== undefined && decision.amount > 0) {
    // Normalize amount contribution
    const amountContribution = Math.min(30, decision.amount / 10);
    commitment = Math.min(100, commitment + amountContribution);
  }

  return commitment;
}

/**
 * Calculate commitment momentum for a timeline
 *
 * Measures how pot commitment is accelerating or decelerating.
 * Positive momentum means increasing commitment; negative means retreating.
 */
export function calculateCommitmentMomentum(timeline: DecisionTimeline): CommitmentMomentum {
  if (timeline.length < 2) {
    return {
      momentumScore: 0,
      momentumDirection: 'neutral',
      momentumDescription: 'Insufficient data for momentum analysis.',
      commitmentTrend: [],
      averageCommitmentDelta: 0,
      peakMomentum: 0,
      momentumShifts: 0,
    };
  }

  const commitmentTrend: number[] = [];
  let momentumSum = 0;
  let peakMomentum = 0;
  let momentumShifts = 0;
  let prevDelta = 0;

  for (let i = 0; i < timeline.length; i++) {
    const current = timeline[i];
    const prev = i > 0 ? timeline[i - 1] : null;

    const currentCommitment = calculateCommitmentLevel(current);
    const prevCommitment = prev ? calculateCommitmentLevel(prev) : 0;
    const delta = currentCommitment - prevCommitment;

    commitmentTrend.push(delta);
    momentumSum += delta;

    // Track peak
    if (Math.abs(delta) > Math.abs(peakMomentum)) {
      peakMomentum = delta;
    }

    // Track direction changes
    if (i > 0 && (prevDelta > 5 && delta < -5) || (prevDelta < -5 && delta > 5)) {
      momentumShifts++;
    }
    prevDelta = delta;
  }

  const averageCommitmentDelta = momentumSum / timeline.length;

  // Calculate final momentum score
  const recentWeight = 0.6;
  const recentDecisions = commitmentTrend.slice(-Math.ceil(timeline.length / 2));
  const recentAvg = recentDecisions.length > 0
    ? recentDecisions.reduce((a, b) => a + b, 0) / recentDecisions.length
    : 0;
  const momentumScore = Math.round(averageCommitmentDelta * (1 - recentWeight) + recentAvg * recentWeight);

  // Determine direction
  let momentumDirection: CommitmentMomentum['momentumDirection'];
  let momentumDescription: string;

  if (momentumScore > 10) {
    momentumDirection = 'accelerating';
    momentumDescription = `Commitment is accelerating at +${momentumScore}. Players are increasingly invested in the pot.`;
  } else if (momentumScore < -10) {
    momentumDirection = 'decelerating';
    momentumDescription = `Commitment is decelerating at ${momentumScore}. Players are retreating from the pot.`;
  } else {
    momentumDirection = 'neutral';
    momentumDescription = 'Commitment momentum is neutral. Neither accelerating nor decelerating significantly.';
  }

  return {
    momentumScore,
    momentumDirection,
    momentumDescription,
    commitmentTrend,
    averageCommitmentDelta: Math.round(averageCommitmentDelta * 100) / 100,
    peakMomentum,
    momentumShifts,
  };
}

// ============================================================================
// 2.4 Decision Confidence Delta
// ============================================================================

/**
 * Confidence delta metrics
 */
export interface ConfidenceDeltaMetrics {
  readonly averageConfidence: number; // 0-100
  readonly confidenceProgression: readonly number[];
  readonly confidenceTrend: 'improving' | 'declining' | 'stable';
  readonly lowConfidenceDecisions: number;
  readonly highConfidenceDecisions: number;
  readonly confidenceDescription: string;
}

/**
 * Convert confidence level to numeric score
 */
function confidenceLevelToScore(level: ConfidenceLevel): number {
  switch (level) {
    case 'high': return 100;
    case 'medium': return 60;
    case 'low': return 30;
    default: return 50;
  }
}

/**
 * Calculate confidence delta metrics for a timeline
 *
 * Tracks how decision confidence evolves throughout the hand.
 */
export function calculateConfidenceDeltaMetrics(timeline: DecisionTimeline): ConfidenceDeltaMetrics {
  if (timeline.length === 0) {
    return {
      averageConfidence: 0,
      confidenceProgression: [],
      confidenceTrend: 'stable',
      lowConfidenceDecisions: 0,
      highConfidenceDecisions: 0,
      confidenceDescription: 'No decisions to analyze.',
    };
  }

  const confidenceProgression: number[] = [];
  let confidenceSum = 0;
  let lowCount = 0;
  let highCount = 0;

  for (const decision of timeline) {
    const score = confidenceLevelToScore(decision.alignment.confidence);
    confidenceProgression.push(score);
    confidenceSum += score;

    if (decision.alignment.confidence === 'low') lowCount++;
    if (decision.alignment.confidence === 'high') highCount++;
  }

  const averageConfidence = Math.round(confidenceSum / timeline.length);

  // Determine trend
  let confidenceTrend: ConfidenceDeltaMetrics['confidenceTrend'];
  const firstHalf = confidenceProgression.slice(0, Math.ceil(timeline.length / 2));
  const secondHalf = confidenceProgression.slice(Math.ceil(timeline.length / 2));

  const firstHalfAvg = firstHalf.length > 0 ? firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length : 0;
  const secondHalfAvg = secondHalf.length > 0 ? secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length : 0;

  if (secondHalfAvg > firstHalfAvg + 10) {
    confidenceTrend = 'improving';
  } else if (secondHalfAvg < firstHalfAvg - 10) {
    confidenceTrend = 'declining';
  } else {
    confidenceTrend = 'stable';
  }

  // Generate description
  let confidenceDescription: string;
  switch (confidenceTrend) {
    case 'improving':
      confidenceDescription = `Confidence improved from ${Math.round(firstHalfAvg)}% to ${Math.round(secondHalfAvg)}% as the hand progressed.`;
      break;
    case 'declining':
      confidenceDescription = `Confidence declined from ${Math.round(firstHalfAvg)}% to ${Math.round(secondHalfAvg)}% as complexity increased.`;
      break;
    default:
      confidenceDescription = `Confidence remained stable around ${averageConfidence}% throughout the hand.`;
  }

  return {
    averageConfidence,
    confidenceProgression,
    confidenceTrend,
    lowConfidenceDecisions: lowCount,
    highConfidenceDecisions: highCount,
    confidenceDescription,
  };
}

// ============================================================================
// 2.5 Strategic Coherence Score
// ============================================================================

/**
 * Strategic coherence metrics
 */
export interface StrategicCoherenceMetrics {
  readonly coherenceScore: number; // 0-100
  readonly coherenceLabel: 'highly coherent' | 'coherent' | 'mixed' | 'incoherent';
  readonly coherenceDescription: string;
  readonly alignmentConsistency: number; // 0-100
  readonly styleConsistency: number; // 0-100
  readonly pressureResponseConsistency: number; // 0-100
  readonly strategicProfile: 'LAG' | 'TAG' | 'LAP' | 'TAP' | 'mixed';
}

/**
 * Calculate strategic coherence for a timeline
 *
 * Measures how consistently a player maintains a coherent strategic approach.
 * High coherence suggests a clear game plan; low coherence suggests erratic play.
 */
export function calculateStrategicCoherence(
  timeline: DecisionTimeline,
  heroOnly: boolean = true
): StrategicCoherenceMetrics {
  const decisions = heroOnly
    ? timeline.filter(d => d.isHeroDecision)
    : timeline;

  if (decisions.length < 2) {
    return {
      coherenceScore: 50,
      coherenceLabel: 'mixed',
      coherenceDescription: 'Insufficient decisions for coherence analysis.',
      alignmentConsistency: 50,
      styleConsistency: 50,
      pressureResponseConsistency: 50,
      strategicProfile: 'mixed',
    };
  }

  // 1. Alignment consistency: how often decisions align with strategy
  let alignedCount = 0;
  for (const d of decisions) {
    if (d.alignment.alignmentLabel === 'Aligned') alignedCount++;
  }
  const alignmentConsistency = Math.round((alignedCount / decisions.length) * 100);

  // 2. Style consistency: how stable is the aggression level
  const aggressionLevels: AggressionLevel[] = decisions.map(d => d.comparison.actualAction.aggressionLevel);
  const dominantStyle = getMostFrequent(aggressionLevels);
  let styleMatches = 0;
  for (const level of aggressionLevels) {
    if (level === dominantStyle) styleMatches++;
  }
  const styleConsistency = Math.round((styleMatches / aggressionLevels.length) * 100);

  // 3. Pressure response consistency: similar actions under similar pressure
  const pressureResponses = new Map<PressureLevel, ActionClass[]>();
  for (const d of decisions) {
    const pressure = d.insight.pressureLevel;
    const existing = pressureResponses.get(pressure) ?? [];
    existing.push(d.actionClass);
    pressureResponses.set(pressure, existing);
  }

  let pressureConsistencySum = 0;
  let pressureGroupCount = 0;
  for (const [, actions] of pressureResponses) {
    if (actions.length >= 2) {
      const dominant = getMostFrequent(actions);
      let matches = 0;
      for (const a of actions) {
        if (a === dominant) matches++;
      }
      pressureConsistencySum += (matches / actions.length) * 100;
      pressureGroupCount++;
    }
  }
  const pressureResponseConsistency = pressureGroupCount > 0
    ? Math.round(pressureConsistencySum / pressureGroupCount)
    : 50;

  // Calculate overall coherence score
  const coherenceScore = Math.round(
    alignmentConsistency * 0.4 +
    styleConsistency * 0.35 +
    pressureResponseConsistency * 0.25
  );

  // Determine label
  let coherenceLabel: StrategicCoherenceMetrics['coherenceLabel'];
  if (coherenceScore >= 80) {
    coherenceLabel = 'highly coherent';
  } else if (coherenceScore >= 60) {
    coherenceLabel = 'coherent';
  } else if (coherenceScore >= 40) {
    coherenceLabel = 'mixed';
  } else {
    coherenceLabel = 'incoherent';
  }

  // Determine strategic profile
  let isAggressive = false;
  let isTight = false;
  const aggressiveActions = getAggressiveDecisions(decisions);
  const foldActions = getFoldingDecisions(decisions);

  if (decisions.length > 0) {
    isAggressive = aggressiveActions.length / decisions.length > 0.4;
    isTight = foldActions.length / decisions.length > 0.3;
  }

  let strategicProfile: StrategicCoherenceMetrics['strategicProfile'];
  if (isAggressive && !isTight) {
    strategicProfile = 'LAG'; // Loose Aggressive
  } else if (isAggressive && isTight) {
    strategicProfile = 'TAG'; // Tight Aggressive
  } else if (!isAggressive && !isTight) {
    strategicProfile = 'LAP'; // Loose Passive
  } else if (!isAggressive && isTight) {
    strategicProfile = 'TAP'; // Tight Passive
  } else {
    strategicProfile = 'mixed';
  }

  // Generate description
  const coherenceDescription = `${coherenceLabel.charAt(0).toUpperCase() + coherenceLabel.slice(1)} play with ${coherenceScore}% coherence. ` +
    `Alignment: ${alignmentConsistency}%, Style: ${styleConsistency}%, Pressure Response: ${pressureResponseConsistency}%. ` +
    `Profile: ${strategicProfile}.`;

  return {
    coherenceScore,
    coherenceLabel,
    coherenceDescription,
    alignmentConsistency,
    styleConsistency,
    pressureResponseConsistency,
    strategicProfile,
  };
}

// ============================================================================
// SECTION 3: Presentation Helpers (Sorting, Grouping, Labeling)
// ============================================================================

// ============================================================================
// 3.1 Sorting Functions
// ============================================================================

/**
 * Sort criteria for decisions
 */
export type SortCriteria =
  | 'index'
  | 'pressure'
  | 'risk'
  | 'confidence'
  | 'amount'
  | 'player'
  | 'street'
  | 'action';

/**
 * Sort direction
 */
export type SortDirection = 'asc' | 'desc';

/**
 * Sort decisions by specified criteria
 */
export function sortDecisions(
  timeline: DecisionTimeline,
  criteria: SortCriteria,
  direction: SortDirection = 'asc'
): DecisionTimeline {
  const multiplier = direction === 'asc' ? 1 : -1;

  const sorted = [...timeline].sort((a, b) => {
    let comparison = 0;

    switch (criteria) {
      case 'index':
        comparison = a.index - b.index;
        break;
      case 'pressure':
        comparison = pressureLevelToScore(a.insight.pressureLevel) - pressureLevelToScore(b.insight.pressureLevel);
        break;
      case 'risk':
        comparison = calculateDecisionRisk(a) - calculateDecisionRisk(b);
        break;
      case 'confidence':
        comparison = confidenceLevelToScore(a.alignment.confidence) - confidenceLevelToScore(b.alignment.confidence);
        break;
      case 'amount':
        comparison = (a.amount ?? 0) - (b.amount ?? 0);
        break;
      case 'player':
        comparison = a.playerName.localeCompare(b.playerName);
        break;
      case 'street':
        const streetOrder: Record<StreetPhase, number> = { 'PREFLOP': 0, 'FLOP': 1, 'TURN': 2, 'RIVER': 3, 'UNKNOWN': 4 };
        comparison = streetOrder[a.street] - streetOrder[b.street];
        break;
      case 'action':
        comparison = a.actionClass.localeCompare(b.actionClass);
        break;
    }

    return comparison * multiplier;
  });

  return sorted;
}

// ============================================================================
// 3.2 Grouping Functions
// ============================================================================

/**
 * Group criteria for decisions
 */
export type GroupCriteria = 'street' | 'player' | 'action' | 'pressure' | 'alignment';

/**
 * Grouped decision set
 */
export interface GroupedDecisions {
  readonly groupKey: string;
  readonly groupLabel: string;
  readonly decisions: DecisionTimeline;
  readonly count: number;
}

/**
 * Group decisions by specified criteria
 */
export function groupDecisions(
  timeline: DecisionTimeline,
  criteria: GroupCriteria
): readonly GroupedDecisions[] {
  const groups = new Map<string, DecisionPoint[]>();

  for (const decision of timeline) {
    let key: string;

    switch (criteria) {
      case 'street':
        key = decision.street;
        break;
      case 'player':
        key = decision.playerId;
        break;
      case 'action':
        key = decision.actionClass;
        break;
      case 'pressure':
        key = decision.insight.pressureLevel;
        break;
      case 'alignment':
        key = decision.alignment.alignmentLabel;
        break;
      default:
        key = 'unknown';
    }

    const existing = groups.get(key) ?? [];
    existing.push(decision);
    groups.set(key, existing);
  }

  const result: GroupedDecisions[] = [];
  for (const [key, decisions] of groups) {
    let label: string;

    switch (criteria) {
      case 'street':
        label = key.charAt(0) + key.slice(1).toLowerCase();
        break;
      case 'player':
        label = decisions[0]?.playerName ?? key;
        break;
      case 'action':
        label = key.charAt(0).toUpperCase() + key.slice(1);
        break;
      case 'pressure':
        label = key.charAt(0).toUpperCase() + key.slice(1) + ' Pressure';
        break;
      case 'alignment':
        label = key;
        break;
      default:
        label = key;
    }

    result.push({
      groupKey: key,
      groupLabel: label,
      decisions,
      count: decisions.length,
    });
  }

  return result;
}

// ============================================================================
// 3.3 Labeling Functions
// ============================================================================

/**
 * Decision label with styling hints
 */
export interface DecisionLabel {
  readonly shortLabel: string;
  readonly fullLabel: string;
  readonly colorHint: string; // CSS color or semantic name
  readonly iconHint: string; // Emoji or icon name
  readonly priority: 'low' | 'normal' | 'high' | 'critical';
}

/**
 * Generate display label for a decision
 */
export function getDecisionLabel(decision: DecisionPoint): DecisionLabel {
  let shortLabel: string;
  let fullLabel: string;
  let colorHint: string;
  let iconHint: string;
  let priority: DecisionLabel['priority'];

  // Action-based labeling
  switch (decision.actionClass) {
    case 'all-in':
      shortLabel = 'ALL-IN';
      fullLabel = `${decision.playerName} goes all-in!`;
      colorHint = '#ef4444';
      iconHint = '🔥';
      priority = 'critical';
      break;
    case 'raise':
      shortLabel = 'RAISE';
      fullLabel = `${decision.playerName} raises${decision.amount ? ` to $${decision.amount}` : ''}`;
      colorHint = '#f59e0b';
      iconHint = '⬆️';
      priority = 'high';
      break;
    case 'bet':
      shortLabel = 'BET';
      fullLabel = `${decision.playerName} bets${decision.amount ? ` $${decision.amount}` : ''}`;
      colorHint = '#f59e0b';
      iconHint = '💰';
      priority = 'high';
      break;
    case 'call':
      shortLabel = 'CALL';
      fullLabel = `${decision.playerName} calls${decision.amount ? ` $${decision.amount}` : ''}`;
      colorHint = '#22c55e';
      iconHint = '✅';
      priority = 'normal';
      break;
    case 'check':
      shortLabel = 'CHECK';
      fullLabel = `${decision.playerName} checks`;
      colorHint = '#6b7280';
      iconHint = '✋';
      priority = 'low';
      break;
    case 'fold':
      shortLabel = 'FOLD';
      fullLabel = `${decision.playerName} folds`;
      colorHint = '#9ca3af';
      iconHint = '🏳️';
      priority = 'low';
      break;
    default:
      shortLabel = decision.actionClass.toUpperCase();
      fullLabel = `${decision.playerName} acts`;
      colorHint = '#6b7280';
      iconHint = '❓';
      priority = 'normal';
  }

  // Upgrade priority for deviations
  if (decision.alignment.alignmentLabel === 'High-risk deviation' && priority !== 'critical') {
    priority = 'high';
    colorHint = '#dc2626';
    iconHint = '⚠️';
  }

  return {
    shortLabel,
    fullLabel,
    colorHint,
    iconHint,
    priority,
  };
}

/**
 * Generate summary label for a group of decisions
 */
export function getGroupSummaryLabel(group: GroupedDecisions): string {
  const heroCount = group.decisions.filter(d => d.isHeroDecision).length;
  const significantCount = group.decisions.filter(d => d.narrative.isSignificant).length;

  if (heroCount > 0) {
    return `${group.groupLabel} (${group.count} decisions, ${heroCount} hero)`;
  } else if (significantCount > 0) {
    return `${group.groupLabel} (${group.count} decisions, ${significantCount} significant)`;
  }
  return `${group.groupLabel} (${group.count} decisions)`;
}

// ============================================================================
// 3.4 Section Collapsing Helpers
// ============================================================================

/**
 * Collapsible section definition
 */
export interface CollapsibleSection<T> {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly data: T;
  readonly isExpandedByDefault: boolean;
  readonly isEmpty: boolean;
  readonly itemCount: number;
}

/**
 * Create collapsible sections from grouped decisions
 */
export function createCollapsibleSections(
  groups: readonly GroupedDecisions[]
): readonly CollapsibleSection<DecisionTimeline>[] {
  return groups.map((group, idx) => ({
    id: `section-${group.groupKey}-${idx}`,
    title: group.groupLabel,
    subtitle: `${group.count} decision${group.count !== 1 ? 's' : ''}`,
    data: group.decisions,
    isExpandedByDefault: group.count <= 5 || group.decisions.some(d => d.isHeroDecision),
    isEmpty: group.count === 0,
    itemCount: group.count,
  }));
}

/**
 * Create street-based collapsible sections
 */
export function createStreetSections(timeline: DecisionTimeline): readonly CollapsibleSection<DecisionTimeline>[] {
  const streetOrder: StreetPhase[] = ['PREFLOP', 'FLOP', 'TURN', 'RIVER'];
  const sections: CollapsibleSection<DecisionTimeline>[] = [];

  for (const street of streetOrder) {
    const decisions = timeline.filter(d => d.street === street);
    if (decisions.length > 0) {
      const heroCount = decisions.filter(d => d.isHeroDecision).length;
      sections.push({
        id: `street-${street.toLowerCase()}`,
        title: street.charAt(0) + street.slice(1).toLowerCase(),
        subtitle: heroCount > 0
          ? `${decisions.length} decisions (${heroCount} hero)`
          : `${decisions.length} decisions`,
        data: decisions,
        isExpandedByDefault: heroCount > 0,
        isEmpty: false,
        itemCount: decisions.length,
      });
    }
  }

  return sections;
}

// ============================================================================
// SECTION 4: Advanced Analysis Queries
// ============================================================================

// ============================================================================
// 4.1 Pattern Detection
// ============================================================================

/**
 * Betting pattern
 */
export interface BettingPattern {
  readonly patternType: 'value-heavy' | 'bluff-heavy' | 'balanced' | 'polarized' | 'merged';
  readonly patternDescription: string;
  readonly confidence: ConfidenceLevel;
  readonly supportingEvidence: readonly string[];
}

/**
 * Detect betting pattern from decisions
 */
export function detectBettingPattern(timeline: DecisionTimeline): BettingPattern {
  const aggressiveDecisions = getAggressiveDecisions(timeline);
  const totalDecisions = timeline.length;

  if (totalDecisions < 3) {
    return {
      patternType: 'balanced',
      patternDescription: 'Insufficient data for pattern detection.',
      confidence: 'low',
      supportingEvidence: ['Sample size too small'],
    };
  }

  const aggressionRate = aggressiveDecisions.length / totalDecisions;
  const allInCount = getAllInDecisions(timeline).length;
  const checkCount = getDecisionsByActionType(timeline, 'check').length;
  const evidence: string[] = [];

  let patternType: BettingPattern['patternType'];
  let patternDescription: string;
  let confidence: ConfidenceLevel = 'medium';

  // Analyze polarization (lots of checks/folds mixed with big bets/all-ins)
  const extremeActions = allInCount + checkCount;
  const isPolarized = extremeActions / totalDecisions > 0.5;

  if (isPolarized) {
    patternType = 'polarized';
    patternDescription = 'Range appears polarized with mostly extreme actions (checks/all-ins) and few middle-ground plays.';
    evidence.push(`${allInCount} all-in decisions`, `${checkCount} checks`);
    confidence = 'high';
  } else if (aggressionRate > 0.6) {
    patternType = 'value-heavy';
    patternDescription = 'Aggressive pattern suggests value-heavy approach with frequent bets and raises.';
    evidence.push(`${Math.round(aggressionRate * 100)}% aggression rate`);
    confidence = 'high';
  } else if (aggressionRate < 0.25) {
    patternType = 'bluff-heavy';
    patternDescription = 'Passive pattern with rare aggression may indicate bluff-heavy spots when aggression occurs.';
    evidence.push(`Only ${Math.round(aggressionRate * 100)}% aggression`);
    confidence = 'medium';
  } else {
    // Check for merged ranges (similar sizing across different spots)
    const raiseCount = getDecisionsByActionType(timeline, 'raise').length;
    const betCount = getDecisionsByActionType(timeline, 'bet').length;
    const isMerged = raiseCount > 0 && betCount > 0 && Math.abs(raiseCount - betCount) <= 1;

    if (isMerged) {
      patternType = 'merged';
      patternDescription = 'Mixed aggression suggests merged range with both value and bluffs at similar frequencies.';
      evidence.push(`${raiseCount} raises`, `${betCount} bets`);
    } else {
      patternType = 'balanced';
      patternDescription = 'Balanced approach with varied action selection.';
      evidence.push('No dominant pattern detected');
      confidence = 'low';
    }
  }

  return {
    patternType,
    patternDescription,
    confidence,
    supportingEvidence: evidence,
  };
}

// ============================================================================
// 4.2 Leak Detection
// ============================================================================

/**
 * Potential leak identified in play
 */
export interface PotentialLeak {
  readonly leakType: string;
  readonly severity: 'minor' | 'moderate' | 'major';
  readonly description: string;
  readonly frequency: number; // 0-100
  readonly affectedDecisions: DecisionTimeline;
  readonly suggestion: string;
}

/**
 * Detect potential leaks in hero's play
 */
export function detectPotentialLeaks(timeline: DecisionTimeline): readonly PotentialLeak[] {
  const heroDecisions = timeline.filter(d => d.isHeroDecision);
  const leaks: PotentialLeak[] = [];

  if (heroDecisions.length < 3) {
    return leaks;
  }

  // Leak 1: Over-folding under pressure
  const highPressureFolds = heroDecisions.filter(d =>
    d.actionClass === 'fold' &&
    (d.insight.pressureLevel === 'high' || d.insight.pressureLevel === 'critical')
  );
  if (highPressureFolds.length >= 2) {
    const foldRate = highPressureFolds.length / heroDecisions.filter(
      d => d.insight.pressureLevel === 'high' || d.insight.pressureLevel === 'critical'
    ).length;
    if (foldRate > 0.6) {
      leaks.push({
        leakType: 'Over-folding under pressure',
        severity: 'moderate',
        description: `Folding ${Math.round(foldRate * 100)}% of the time in high-pressure spots.`,
        frequency: Math.round(foldRate * 100),
        affectedDecisions: highPressureFolds,
        suggestion: 'Consider defending wider in high-pressure spots, especially with favorable pot odds.',
      });
    }
  }

  // Leak 2: Passive with strong pressure indicators
  const passiveHighPressure = heroDecisions.filter(d =>
    ['check', 'call'].includes(d.actionClass) &&
    d.insight.pressureLevel === 'low' &&
    d.alignment.alignmentLabel === 'Deviates' &&
    d.alignment.strategyExpectation.expectedAction === 'bet'
  );
  if (passiveHighPressure.length >= 2) {
    leaks.push({
      leakType: 'Missing value bets',
      severity: 'moderate',
      description: 'Checking or calling when betting for value was expected.',
      frequency: Math.round((passiveHighPressure.length / heroDecisions.length) * 100),
      affectedDecisions: passiveHighPressure,
      suggestion: 'Look for value betting opportunities in low-pressure spots.',
    });
  }

  // Leak 3: Inconsistent sizing (detected via high variance in amounts)
  const amountDecisions = heroDecisions.filter(d => d.amount !== undefined && d.amount > 0);
  if (amountDecisions.length >= 3) {
    const amounts = amountDecisions.map(d => d.amount!);
    const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const variance = amounts.reduce((sum, a) => sum + Math.pow(a - mean, 2), 0) / amounts.length;
    const cv = Math.sqrt(variance) / mean; // Coefficient of variation

    if (cv > 1.5) {
      leaks.push({
        leakType: 'Inconsistent bet sizing',
        severity: 'minor',
        description: `High variance in bet sizes (CV: ${cv.toFixed(2)}). This may be exploitable.`,
        frequency: Math.round(cv * 30),
        affectedDecisions: amountDecisions,
        suggestion: 'Consider using more consistent bet sizing to avoid giving away hand strength.',
      });
    }
  }

  // Leak 4: High-risk deviations
  const highRiskDeviations = heroDecisions.filter(d =>
    d.alignment.alignmentLabel === 'High-risk deviation'
  );
  if (highRiskDeviations.length >= 2) {
    leaks.push({
      leakType: 'Frequent high-risk deviations',
      severity: 'major',
      description: `${highRiskDeviations.length} high-risk deviations from baseline strategy.`,
      frequency: Math.round((highRiskDeviations.length / heroDecisions.length) * 100),
      affectedDecisions: highRiskDeviations,
      suggestion: 'Review these spots to understand if deviations are exploitative or speculative.',
    });
  }

  return leaks;
}

// ============================================================================
// 4.3 Street-by-Street Analysis
// ============================================================================

/**
 * Street analysis summary
 */
export interface StreetAnalysis {
  readonly street: StreetPhase;
  readonly decisionCount: number;
  readonly heroDecisionCount: number;
  readonly aggressionRate: number;
  readonly averagePressure: number;
  readonly alignmentRate: number;
  readonly keyMoments: readonly string[];
  readonly streetSummary: string;
}

/**
 * Analyze each street separately
 */
export function analyzeByStreet(timeline: DecisionTimeline): readonly StreetAnalysis[] {
  const streets: StreetPhase[] = ['PREFLOP', 'FLOP', 'TURN', 'RIVER'];
  const analyses: StreetAnalysis[] = [];

  for (const street of streets) {
    const streetDecisions = timeline.filter(d => d.street === street);
    if (streetDecisions.length === 0) continue;

    const heroDecisions = streetDecisions.filter(d => d.isHeroDecision);
    const aggressive = getAggressiveDecisions(streetDecisions);
    const aligned = streetDecisions.filter(d => d.alignment.alignmentLabel === 'Aligned');

    // Calculate metrics
    const aggressionRate = streetDecisions.length > 0
      ? aggressive.length / streetDecisions.length
      : 0;
    const alignmentRate = streetDecisions.length > 0
      ? aligned.length / streetDecisions.length
      : 0;
    const averagePressure = streetDecisions.reduce(
      (sum, d) => sum + pressureLevelToScore(d.insight.pressureLevel), 0
    ) / streetDecisions.length;

    // Identify key moments
    const keyMoments: string[] = [];
    const allIns = streetDecisions.filter(d => d.actionClass === 'all-in');
    const highRisk = streetDecisions.filter(d => d.alignment.alignmentLabel === 'High-risk deviation');

    if (allIns.length > 0) {
      keyMoments.push(`${allIns.length} all-in${allIns.length > 1 ? 's' : ''}`);
    }
    if (highRisk.length > 0) {
      keyMoments.push(`${highRisk.length} high-risk deviation${highRisk.length > 1 ? 's' : ''}`);
    }
    if (heroDecisions.length > 0) {
      keyMoments.push(`${heroDecisions.length} hero decision${heroDecisions.length > 1 ? 's' : ''}`);
    }

    // Generate summary
    let streetSummary: string;
    if (aggressionRate > 0.5) {
      streetSummary = `Aggressive action on the ${street.toLowerCase()} with ${Math.round(aggressionRate * 100)}% aggression rate.`;
    } else if (aggressionRate < 0.2) {
      streetSummary = `Passive play on the ${street.toLowerCase()} with limited betting action.`;
    } else {
      streetSummary = `Mixed action on the ${street.toLowerCase()} with balanced aggression.`;
    }

    analyses.push({
      street,
      decisionCount: streetDecisions.length,
      heroDecisionCount: heroDecisions.length,
      aggressionRate: Math.round(aggressionRate * 100) / 100,
      averagePressure: Math.round(averagePressure * 100) / 100,
      alignmentRate: Math.round(alignmentRate * 100) / 100,
      keyMoments,
      streetSummary,
    });
  }

  return analyses;
}

// ============================================================================
// SECTION 5: Utility Functions
// ============================================================================

/**
 * Get most frequent element in array
 */
function getMostFrequent<T>(arr: readonly T[]): T {
  const counts = new Map<T, number>();
  for (const item of arr) {
    counts.set(item, (counts.get(item) ?? 0) + 1);
  }

  let maxCount = 0;
  let maxItem = arr[0];
  for (const [item, count] of counts) {
    if (count > maxCount) {
      maxCount = count;
      maxItem = item;
    }
  }
  return maxItem;
}

/**
 * Generate complete hand analysis report
 */
export interface HandAnalysisReport {
  readonly volatility: VolatilityMetrics;
  readonly riskEscalation: RiskEscalationCurve;
  readonly momentum: CommitmentMomentum;
  readonly confidenceDelta: ConfidenceDeltaMetrics;
  readonly coherence: StrategicCoherenceMetrics;
  readonly heroVsField: HeroVsFieldComparison;
  readonly bettingPattern: BettingPattern;
  readonly leaks: readonly PotentialLeak[];
  readonly streetAnalyses: readonly StreetAnalysis[];
  readonly turningPoints: DecisionTimeline;
  readonly overallSummary: string;
}

/**
 * Generate complete hand analysis report
 */
export function generateHandAnalysisReport(timeline: DecisionTimeline): HandAnalysisReport {
  const volatility = calculateVolatilityMetrics(timeline);
  const riskEscalation = calculateRiskEscalationCurve(timeline);
  const momentum = calculateCommitmentMomentum(timeline);
  const confidenceDelta = calculateConfidenceDeltaMetrics(timeline);
  const coherence = calculateStrategicCoherence(timeline);
  const heroVsField = getHeroVsFieldComparison(timeline);
  const bettingPattern = detectBettingPattern(timeline);
  const leaks = detectPotentialLeaks(timeline);
  const streetAnalyses = analyzeByStreet(timeline);
  const turningPoints = getTurningPointDecisions(timeline);

  // Generate overall summary
  const summaryParts: string[] = [];

  summaryParts.push(`Hand featured ${timeline.length} decisions across ${streetAnalyses.length} streets.`);

  if (volatility.volatilityLabel !== 'stable') {
    summaryParts.push(`Action was ${volatility.volatilityLabel} with ${volatility.actionSwings} swings.`);
  }

  if (turningPoints.length > 0) {
    summaryParts.push(`${turningPoints.length} turning point${turningPoints.length > 1 ? 's' : ''} identified.`);
  }

  if (leaks.length > 0) {
    const majorLeaks = leaks.filter(l => l.severity === 'major');
    if (majorLeaks.length > 0) {
      summaryParts.push(`${majorLeaks.length} major leak${majorLeaks.length > 1 ? 's' : ''} detected.`);
    }
  }

  summaryParts.push(`Hero coherence: ${coherence.coherenceLabel} (${coherence.coherenceScore}%).`);

  const overallSummary = summaryParts.join(' ');

  return {
    volatility,
    riskEscalation,
    momentum,
    confidenceDelta,
    coherence,
    heroVsField,
    bettingPattern,
    leaks,
    streetAnalyses,
    turningPoints,
    overallSummary,
  };
}

// ============================================================================
// Export Type Summary
// ============================================================================

export type {
  TurningPointCriteria,
  PressureTimelineEntry,
  HeroVsFieldComparison,
  PlayerStatistics,
  VolatilityMetrics,
  RiskEscalationPoint,
  RiskEscalationCurve,
  CommitmentMomentum,
  ConfidenceDeltaMetrics,
  StrategicCoherenceMetrics,
  GroupedDecisions,
  DecisionLabel,
  CollapsibleSection,
  BettingPattern,
  PotentialLeak,
  StreetAnalysis,
  HandAnalysisReport,
};
