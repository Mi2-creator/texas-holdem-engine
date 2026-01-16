// ============================================================================
// ViewModeController - Analysis Rhythm & View Switching Logic
// ============================================================================
//
// 【Phase 4】Experience Implementation - Core Controller
//
// 层级: Controller Layer (纯逻辑)
// 职责: 根据事件类型、时间线状态、Hero 位置决定当前应显示的主视图
//
// 设计原则 (from Phase 3):
//   - 纯函数，无副作用
//   - 不引入新状态
//   - 基于事件驱动自动切换
//   - 支持手动覆盖
//
// 信息金字塔:
//   - Level 1 (Narrative): 基础理解，默认可见
//   - Level 2 (Comparison): 决策辅助，关键时刻
//   - Level 3 (Insight/Alignment): 深度分析，按需展开
//
// ============================================================================

import type {
  EventInfo,
  DecisionTimeline,
  DecisionPoint,
} from '../models/DecisionTimelineModel';

import {
  calculateVolatilityMetrics,
  calculateRiskEscalationCurve,
} from '../models/DecisionTimelineQueries';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * View Mode - 决定当前主视图
 */
export type ViewMode =
  | 'narrative-default'    // 默认叙事模式 - 场景设定、常规行动
  | 'narrative-dramatic'   // 戏剧化叙事模式 - 高压力时刻
  | 'comparison-focus'     // 决策对比模式 - Hero 决策点
  | 'insight-expanded';    // 洞察展开模式 - 手牌结束、反思学习

/**
 * Panel Visibility State - 各面板的显示状态
 */
export interface PanelVisibility {
  readonly narrative: 'primary' | 'collapsed' | 'hidden';
  readonly comparison: 'primary' | 'collapsed' | 'hidden';
  readonly insight: 'primary' | 'collapsed' | 'hidden';
  readonly alignment: 'primary' | 'collapsed' | 'hidden';
}

/**
 * Context Bar Data - 上下文信息栏数据
 */
export interface ContextBarData {
  readonly tension: number;          // 0-100 紧张度
  readonly tensionLabel: string;     // 紧张度标签
  readonly phase: string;            // 当前阶段
  readonly potSize: number;          // 底池大小
  readonly isHighPressure: boolean;  // 是否高压力时刻
  readonly isHeroTurn: boolean;      // 是否 Hero 决策回合
}

/**
 * View Mode Result - 完整的视图模式结果
 */
export interface ViewModeResult {
  readonly mode: ViewMode;
  readonly panelVisibility: PanelVisibility;
  readonly contextBar: ContextBarData;
  readonly shouldDelayLeaks: boolean;      // 是否延迟显示 Leak 分析
  readonly shouldDelayPattern: boolean;    // 是否延迟显示 Pattern 分析
  readonly highlightDecision: boolean;     // 是否高亮当前决策
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Decision event types
 */
const DECISION_EVENT_TYPES = new Set([
  'FOLD',
  'CHECK',
  'CALL',
  'BET',
  'RAISE',
  'ALL_IN',
]);

/**
 * High pressure action types
 */
const HIGH_PRESSURE_ACTIONS = new Set([
  'ALL_IN',
  'RAISE',
]);

/**
 * Phase display names
 */
const PHASE_NAMES: Record<string, string> = {
  PREFLOP: 'Preflop',
  FLOP: 'Flop',
  TURN: 'Turn',
  RIVER: 'River',
  SHOWDOWN: 'Showdown',
};

// ============================================================================
// Pure Helper Functions
// ============================================================================

/**
 * 判断事件是否为决策事件
 */
function isDecisionEvent(event: EventInfo | null | undefined): boolean {
  if (!event || typeof event.type !== 'string') return false;
  return DECISION_EVENT_TYPES.has(event.type);
}

/**
 * 判断事件是否为 Hero 的决策
 */
function isHeroDecision(
  event: EventInfo | null | undefined,
  heroSeat: number,
  players: readonly { id: string; seat?: number }[]
): boolean {
  if (!event || !isDecisionEvent(event)) return false;

  // Find hero player ID by seat
  const heroPlayer = players.find(p => p.seat === heroSeat);
  if (!heroPlayer) return false;

  return event.playerId === heroPlayer.id;
}

/**
 * 判断是否为高压力时刻
 */
function isHighPressureMoment(
  timeline: DecisionTimeline,
  currentIndex: number
): boolean {
  // Defensive: ensure timeline is valid
  if (!Array.isArray(timeline) || timeline.length === 0) return false;

  // Filter decisions up to current index
  const relevantDecisions = timeline.filter(d =>
    d && typeof d.index === 'number' && d.index <= currentIndex
  );

  if (relevantDecisions.length === 0) return false;

  // Check volatility
  const volatility = calculateVolatilityMetrics(relevantDecisions);
  if (volatility.volatilityScore > 60) return true;

  // Check risk escalation
  const riskCurve = calculateRiskEscalationCurve(relevantDecisions);
  if (riskCurve.peakRisk > 70) return true;

  // Check for recent high pressure actions
  const recentDecisions = relevantDecisions.slice(-3);
  const hasHighPressure = recentDecisions.some(d =>
    d && HIGH_PRESSURE_ACTIONS.has(d.actionClass?.toUpperCase() ?? '')
  );

  return hasHighPressure;
}

/**
 * 判断手牌是否结束
 */
function isHandEnded(
  events: readonly EventInfo[],
  currentIndex: number
): boolean {
  if (!Array.isArray(events)) return false;

  for (let i = 0; i <= currentIndex && i < events.length; i++) {
    const event = events[i];
    if (event?.type === 'HAND_END' || event?.type === 'SHOWDOWN') {
      return true;
    }
  }
  return false;
}

/**
 * 获取当前阶段
 */
function getCurrentPhase(
  events: readonly EventInfo[],
  currentIndex: number
): string {
  if (!Array.isArray(events)) return 'PREFLOP';

  let currentPhase = 'PREFLOP';

  for (let i = 0; i <= currentIndex && i < events.length; i++) {
    const event = events[i];
    if (!event) continue;

    if (event.type === 'STREET_START' && typeof event.street === 'string') {
      currentPhase = event.street;
    } else if (event.type === 'DEAL_COMMUNITY') {
      // Infer phase from card count
      const cardCount = Array.isArray(event.cards) ? event.cards.length : 0;
      if (cardCount === 3) currentPhase = 'FLOP';
      else if (cardCount === 1 && currentPhase === 'FLOP') currentPhase = 'TURN';
      else if (cardCount === 1 && currentPhase === 'TURN') currentPhase = 'RIVER';
    } else if (event.type === 'SHOWDOWN') {
      currentPhase = 'SHOWDOWN';
    }
  }

  return currentPhase;
}

/**
 * 计算当前底池大小
 */
function calculatePotSize(
  events: readonly EventInfo[],
  currentIndex: number
): number {
  if (!Array.isArray(events)) return 0;

  let potSize = 0;
  const contributingTypes = new Set(['BET', 'CALL', 'RAISE', 'ALL_IN', 'POST_BLIND']);

  for (let i = 0; i <= currentIndex && i < events.length; i++) {
    const event = events[i];
    if (event && contributingTypes.has(event.type) && typeof event.amount === 'number') {
      potSize += event.amount;
    }
  }

  return potSize;
}

/**
 * 计算紧张度 (0-100)
 */
function calculateTension(
  timeline: DecisionTimeline,
  currentIndex: number,
  handEnded: boolean
): { tension: number; label: string } {
  if (handEnded) {
    return { tension: 0, label: 'Resolved' };
  }

  if (!Array.isArray(timeline) || timeline.length === 0) {
    return { tension: 10, label: 'Calm' };
  }

  const relevantDecisions = timeline.filter(d =>
    d && typeof d.index === 'number' && d.index <= currentIndex
  );

  if (relevantDecisions.length === 0) {
    return { tension: 10, label: 'Calm' };
  }

  // Use volatility as base for tension
  const volatility = calculateVolatilityMetrics(relevantDecisions);
  const riskCurve = calculateRiskEscalationCurve(relevantDecisions);

  // Combine volatility and current risk
  const baseTension = volatility.volatilityScore;
  const riskBonus = riskCurve.finalRisk * 0.3;

  // Check for all-in situations
  const hasAllIn = relevantDecisions.some(d => d?.actionClass === 'all-in');
  const allInBonus = hasAllIn ? 20 : 0;

  const tension = Math.min(100, Math.round(baseTension + riskBonus + allInBonus));

  // Determine label
  let label: string;
  if (tension >= 80) label = 'Critical';
  else if (tension >= 60) label = 'High';
  else if (tension >= 40) label = 'Elevated';
  else if (tension >= 20) label = 'Moderate';
  else label = 'Calm';

  return { tension, label };
}

// ============================================================================
// Panel Visibility Mapping
// ============================================================================

/**
 * 根据 ViewMode 确定各面板的显示状态
 */
function getPanelVisibility(mode: ViewMode): PanelVisibility {
  switch (mode) {
    case 'narrative-default':
      return {
        narrative: 'primary',
        comparison: 'collapsed',
        insight: 'collapsed',
        alignment: 'hidden',
      };

    case 'narrative-dramatic':
      return {
        narrative: 'primary',
        comparison: 'collapsed',
        insight: 'collapsed',
        alignment: 'hidden',
      };

    case 'comparison-focus':
      return {
        narrative: 'collapsed',
        comparison: 'primary',
        insight: 'collapsed',
        alignment: 'collapsed',
      };

    case 'insight-expanded':
      return {
        narrative: 'collapsed',
        comparison: 'collapsed',
        insight: 'primary',
        alignment: 'primary',
      };

    default:
      return {
        narrative: 'primary',
        comparison: 'collapsed',
        insight: 'collapsed',
        alignment: 'hidden',
      };
  }
}

// ============================================================================
// Main Controller Function
// ============================================================================

/**
 * 确定当前的视图模式
 *
 * 纯函数：根据当前事件、时间线、Hero 位置计算应显示的视图模式
 *
 * 决策逻辑 (from Phase 3):
 *   1. HAND_END / SHOWDOWN → insight-expanded
 *   2. Hero Decision Point → comparison-focus
 *   3. High Pressure Moment → narrative-dramatic
 *   4. Default → narrative-default
 */
export function determineActiveView(
  currentEvent: EventInfo | null | undefined,
  events: readonly EventInfo[],
  timeline: DecisionTimeline,
  currentIndex: number,
  heroSeat: number,
  players: readonly { id: string; seat?: number }[]
): ViewModeResult {
  // Defensive: ensure inputs are valid
  const safeEvents = Array.isArray(events) ? events : [];
  const safeTimeline = Array.isArray(timeline) ? timeline : [];
  const safeCurrentIndex = typeof currentIndex === 'number' && currentIndex >= 0 ? currentIndex : 0;
  const safeHeroSeat = typeof heroSeat === 'number' ? heroSeat : 0;
  const safePlayers = Array.isArray(players) ? players : [];

  // Calculate context data
  const handEnded = isHandEnded(safeEvents, safeCurrentIndex);
  const phase = getCurrentPhase(safeEvents, safeCurrentIndex);
  const potSize = calculatePotSize(safeEvents, safeCurrentIndex);
  const { tension, label: tensionLabel } = calculateTension(safeTimeline, safeCurrentIndex, handEnded);
  const highPressure = isHighPressureMoment(safeTimeline, safeCurrentIndex);
  const heroTurn = isHeroDecision(currentEvent, safeHeroSeat, safePlayers);

  // Determine view mode using decision tree from Phase 3
  let mode: ViewMode;

  // Rule 1: Hand ended → Insight expanded (reflection mode)
  if (handEnded) {
    mode = 'insight-expanded';
  }
  // Rule 2: Hero decision point → Comparison focus
  else if (heroTurn) {
    mode = 'comparison-focus';
  }
  // Rule 3: High pressure moment → Dramatic narrative
  else if (highPressure || tension >= 70) {
    mode = 'narrative-dramatic';
  }
  // Rule 4: Default → Standard narrative
  else {
    mode = 'narrative-default';
  }

  // Build result
  const result: ViewModeResult = {
    mode,
    panelVisibility: getPanelVisibility(mode),
    contextBar: {
      tension,
      tensionLabel,
      phase: PHASE_NAMES[phase] ?? phase,
      potSize,
      isHighPressure: highPressure,
      isHeroTurn: heroTurn,
    },
    // Information delay rules from Phase 3
    shouldDelayLeaks: !handEnded,
    shouldDelayPattern: !handEnded,
    highlightDecision: heroTurn || (currentEvent?.type === 'ALL_IN'),
  };

  return result;
}

// ============================================================================
// Utility Functions for UI
// ============================================================================

/**
 * 获取 ViewMode 的显示标签
 */
export function getViewModeLabel(mode: ViewMode): string {
  const labels: Record<ViewMode, string> = {
    'narrative-default': 'Story',
    'narrative-dramatic': 'Climax',
    'comparison-focus': 'Decision',
    'insight-expanded': 'Analysis',
  };
  return labels[mode] ?? 'Story';
}

/**
 * 获取 ViewMode 的主题颜色
 */
export function getViewModeColor(mode: ViewMode): string {
  const colors: Record<ViewMode, string> = {
    'narrative-default': '#a78bfa',    // Purple - Story
    'narrative-dramatic': '#f97316',   // Orange - Climax
    'comparison-focus': '#06b6d4',     // Cyan - Decision
    'insight-expanded': '#22c55e',     // Green - Analysis
  };
  return colors[mode] ?? '#a78bfa';
}

/**
 * 获取紧张度的颜色
 */
export function getTensionColor(tension: number): string {
  if (tension >= 80) return '#ef4444';  // Red - Critical
  if (tension >= 60) return '#f97316';  // Orange - High
  if (tension >= 40) return '#f59e0b';  // Amber - Elevated
  if (tension >= 20) return '#3b82f6';  // Blue - Moderate
  return '#22c55e';                      // Green - Calm
}

/**
 * 判断面板是否应该在当前模式下可见
 */
export function isPanelVisible(
  panelName: 'narrative' | 'comparison' | 'insight' | 'alignment',
  visibility: PanelVisibility
): boolean {
  return visibility[panelName] !== 'hidden';
}

/**
 * 判断面板是否为主视图
 */
export function isPanelPrimary(
  panelName: 'narrative' | 'comparison' | 'insight' | 'alignment',
  visibility: PanelVisibility
): boolean {
  return visibility[panelName] === 'primary';
}
