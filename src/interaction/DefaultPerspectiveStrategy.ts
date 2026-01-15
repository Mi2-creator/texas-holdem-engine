// ============================================================================
// DefaultPerspectiveStrategy - Pure Panel Selection Logic
// ============================================================================
//
// 【Product Polish Phase】Replay Architecture Freeze Declaration v1.0 Compliant
//
// 层级: Logic Layer (纯函数)
// 职责: 根据决策点属性确定默认显示面板，用于初始渲染或决策变更
//
// 约束:
//   - 纯函数，无副作用
//   - 不使用 React Hooks
//   - 不 import src/replay/** 或 src/commands/**
//   - 不调用 EventProcessor
//   - 不构造 ReplayEvent
//   - 所有逻辑基于输入 DecisionPoint 属性
//
// INV 合规性:
//   - INV-1 幂等快照: 不参与快照生成
//   - INV-2 回放确定性: 纯函数保证确定性
//   - INV-3 只读契约: 所有数据访问均为只读
//   - INV-4 序列单调性: 不修改序列号
//   - INV-5 压缩无损性: 不涉及压缩层
//
// H 合规性:
//   - H-1 安全手牌处理: 不涉及底牌可见性逻辑
//   - H-2 边界安全: 检查 decision 存在性
//   - H-3 无副作用: 纯函数
//   - H-4 值语义: 不修改任何值
//
// ============================================================================

import type { DecisionPoint, AlignmentLabel, ActionClass } from '../models/DecisionTimelineModel';
import type { PanelType } from '../components/PanelNavigator';

// ============================================================================
// Types
// ============================================================================

/**
 * Perspective selection criteria
 */
interface PerspectiveSelectionCriteria {
  readonly isHeroDecision: boolean;
  readonly alignmentLabel: AlignmentLabel;
  readonly actionClass: ActionClass;
  readonly pressureLevel: 'low' | 'medium' | 'high';
  readonly hasMultipleAlternatives: boolean;
  readonly commitmentLevel: number;
  readonly isTurningPoint: boolean;
}

/**
 * Perspective selection result
 */
interface PerspectiveSelectionResult {
  readonly panel: PanelType;
  readonly reason: string;
  readonly confidence: 'high' | 'medium' | 'low';
}

/**
 * User preference hints (passed from UI)
 */
interface UserPreferenceHints {
  readonly preferredPanel?: PanelType;
  readonly lastViewedPanel?: PanelType;
  readonly isFirstView?: boolean;
}

// ============================================================================
// Pure Functions
// ============================================================================

/**
 * Extract selection criteria from a DecisionPoint (pure function)
 */
function extractSelectionCriteria(decision: DecisionPoint): PerspectiveSelectionCriteria {
  const alternativesCount = decision.alternatives.length;

  // Determine if this is a turning point based on impact and alignment
  const isTurningPoint =
    decision.alignment.alignmentLabel === 'High-risk deviation' ||
    decision.actionClass === 'all-in' ||
    (decision.insight.commitmentLevel > 50 && decision.actionClass !== 'fold');

  return {
    isHeroDecision: decision.isHeroDecision,
    alignmentLabel: decision.alignment.alignmentLabel,
    actionClass: decision.actionClass,
    pressureLevel: decision.insight.pressureLevel,
    hasMultipleAlternatives: alternativesCount > 1,
    commitmentLevel: decision.insight.commitmentLevel,
    isTurningPoint,
  };
}

/**
 * Choose default panel based on decision characteristics (pure function)
 *
 * Selection priority:
 * 1. High-risk deviations → Alignment (explain the deviation)
 * 2. Hero turning points → Insight (deep analysis needed)
 * 3. Multiple strong alternatives → Comparison (show trade-offs)
 * 4. Hero decisions generally → Alignment (strategy feedback)
 * 5. Standard opponent actions → Narrative (follow the story)
 */
function chooseDefaultPanel(
  decision: DecisionPoint | null,
  hints?: UserPreferenceHints
): PerspectiveSelectionResult {
  // Handle null decision
  if (!decision) {
    return {
      panel: hints?.lastViewedPanel ?? 'narrative',
      reason: 'No decision selected, showing narrative',
      confidence: 'low',
    };
  }

  // Respect explicit user preference
  if (hints?.preferredPanel) {
    return {
      panel: hints.preferredPanel,
      reason: 'User preferred panel',
      confidence: 'high',
    };
  }

  const criteria = extractSelectionCriteria(decision);

  // Rule 1: High-risk deviations always show Alignment
  if (criteria.alignmentLabel === 'High-risk deviation') {
    return {
      panel: 'alignment',
      reason: 'High-risk deviation requires alignment explanation',
      confidence: 'high',
    };
  }

  // Rule 2: Hero turning points show Insight
  if (criteria.isHeroDecision && criteria.isTurningPoint) {
    return {
      panel: 'insight',
      reason: 'Hero turning point benefits from deep analysis',
      confidence: 'high',
    };
  }

  // Rule 3: All-in decisions show Comparison (see alternatives)
  if (criteria.actionClass === 'all-in' && criteria.hasMultipleAlternatives) {
    return {
      panel: 'comparison',
      reason: 'All-in with alternatives - show trade-offs',
      confidence: 'high',
    };
  }

  // Rule 4: Deviating hero decisions show Alignment
  if (criteria.isHeroDecision && criteria.alignmentLabel === 'Deviates') {
    return {
      panel: 'alignment',
      reason: 'Hero deviation - explain strategy difference',
      confidence: 'medium',
    };
  }

  // Rule 5: High commitment hero decisions show Insight
  if (criteria.isHeroDecision && criteria.commitmentLevel > 40) {
    return {
      panel: 'insight',
      reason: 'High commitment decision - show risk analysis',
      confidence: 'medium',
    };
  }

  // Rule 6: Hero decisions with alternatives show Comparison
  if (criteria.isHeroDecision && criteria.hasMultipleAlternatives) {
    return {
      panel: 'comparison',
      reason: 'Hero decision with alternatives to consider',
      confidence: 'medium',
    };
  }

  // Rule 7: Aligned hero decisions show Alignment (confirm good play)
  if (criteria.isHeroDecision && criteria.alignmentLabel === 'Aligned') {
    return {
      panel: 'alignment',
      reason: 'Aligned hero play - confirm strategy',
      confidence: 'medium',
    };
  }

  // Rule 8: High pressure situations show Insight
  if (criteria.pressureLevel === 'high') {
    return {
      panel: 'insight',
      reason: 'High pressure decision point',
      confidence: 'medium',
    };
  }

  // Default: Narrative for general flow
  return {
    panel: hints?.lastViewedPanel ?? 'narrative',
    reason: 'Default narrative view for hand progression',
    confidence: 'low',
  };
}

/**
 * Choose panel for a sequence of decisions (pure function)
 * Useful for determining best starting panel for a hand
 */
function chooseDefaultPanelForHand(
  decisions: readonly DecisionPoint[],
  heroSeat: number
): PerspectiveSelectionResult {
  if (decisions.length === 0) {
    return {
      panel: 'narrative',
      reason: 'No decisions - showing narrative',
      confidence: 'low',
    };
  }

  // Find most significant decision
  const heroDecisions = decisions.filter(d => d.isHeroDecision);

  // If hero has decisions, prioritize the most significant one
  if (heroDecisions.length > 0) {
    // Look for turning points first
    const turningPoint = heroDecisions.find(d =>
      d.alignment.alignmentLabel === 'High-risk deviation' ||
      d.actionClass === 'all-in'
    );

    if (turningPoint) {
      return chooseDefaultPanel(turningPoint);
    }

    // Otherwise use the last hero decision
    const lastHeroDecision = heroDecisions[heroDecisions.length - 1];
    return chooseDefaultPanel(lastHeroDecision);
  }

  // No hero decisions - show narrative
  return {
    panel: 'narrative',
    reason: 'No hero decisions in hand',
    confidence: 'medium',
  };
}

/**
 * Determine if panel should change on decision change (pure function)
 */
function shouldChangePanelOnDecisionChange(
  previousDecision: DecisionPoint | null,
  newDecision: DecisionPoint | null,
  currentPanel: PanelType,
  autoSwitch: boolean
): boolean {
  // Never auto-switch if disabled
  if (!autoSwitch) return false;

  // Always evaluate new decision if previous was null
  if (!previousDecision && newDecision) return true;

  // Don't change if new decision is null
  if (!newDecision) return false;

  // Change if crossing hero/opponent boundary
  if (previousDecision && previousDecision.isHeroDecision !== newDecision.isHeroDecision) {
    return true;
  }

  // Change if new decision has high-risk deviation
  if (newDecision.alignment.alignmentLabel === 'High-risk deviation') {
    return currentPanel !== 'alignment';
  }

  // Keep current panel for incremental navigation
  return false;
}

/**
 * Get panel recommendation score for a decision (pure function)
 * Returns scores for each panel type
 */
function getPanelScores(
  decision: DecisionPoint
): Record<PanelType, number> {
  const criteria = extractSelectionCriteria(decision);

  let narrativeScore = 50; // Base score
  let insightScore = 50;
  let comparisonScore = 50;
  let alignmentScore = 50;

  // Hero decisions boost insight and alignment
  if (criteria.isHeroDecision) {
    insightScore += 20;
    alignmentScore += 25;
  }

  // Deviations boost alignment
  if (criteria.alignmentLabel === 'Deviates') {
    alignmentScore += 15;
  }
  if (criteria.alignmentLabel === 'High-risk deviation') {
    alignmentScore += 30;
  }

  // Multiple alternatives boost comparison
  if (criteria.hasMultipleAlternatives) {
    comparisonScore += 20;
  }

  // All-in boosts comparison and insight
  if (criteria.actionClass === 'all-in') {
    comparisonScore += 15;
    insightScore += 15;
  }

  // High commitment boosts insight
  if (criteria.commitmentLevel > 50) {
    insightScore += 15;
  }

  // High pressure boosts insight
  if (criteria.pressureLevel === 'high') {
    insightScore += 10;
  }

  // Turning points boost insight
  if (criteria.isTurningPoint) {
    insightScore += 20;
  }

  return {
    narrative: narrativeScore,
    insight: insightScore,
    comparison: comparisonScore,
    alignment: alignmentScore,
  };
}

/**
 * Format panel recommendation as human-readable text (pure function)
 */
function formatPanelRecommendation(result: PerspectiveSelectionResult): string {
  const panelNames: Record<PanelType, string> = {
    narrative: 'Hand Narrative',
    insight: 'Decision Insights',
    comparison: 'Decision Comparison',
    alignment: 'Strategy Alignment',
  };

  return `${panelNames[result.panel]}: ${result.reason}`;
}

// ============================================================================
// Exports
// ============================================================================

export type {
  PerspectiveSelectionCriteria,
  PerspectiveSelectionResult,
  UserPreferenceHints,
};

export {
  extractSelectionCriteria,
  chooseDefaultPanel,
  chooseDefaultPanelForHand,
  shouldChangePanelOnDecisionChange,
  getPanelScores,
  formatPanelRecommendation,
};
