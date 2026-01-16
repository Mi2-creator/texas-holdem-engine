// ============================================================================
// DecisionComparisonPanel - Decision Comparison Analysis (Read-Only UI)
// ============================================================================
//
// 【Post-Freeze Extension】Replay Architecture Freeze Declaration v1.0 Compliant
// 【Post-Model Integration】Consumes DecisionTimelineModel for consistency
//
// 层级: UI Layer (纯展示)
// 职责: 对比实际决策与假设替代方案，提供分析性解释
//
// 数据流:
//   events + players → DecisionTimelineModel → DecisionTimeline → Comparison View
//
// 重要约束:
//   - 绝不建议任何行动（纯分析/解释）
//   - 只读 props，无内部状态
//   - 不 import src/replay/** 或 src/commands/**
//   - 不调用 EventProcessor
//   - 不构造 ReplayEvent
//   - 不使用 React Hooks（纯函数组件）
//   - 所有逻辑必须是确定性的，仅从 props 派生
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

import React from 'react';

// ============================================================================
// 从 DecisionTimelineModel 导入共享类型和函数
// ============================================================================

import {
  buildDecisionTimeline,
  buildPlayerNameMap,
  getDecisionAtIndex,
  type EventInfo,
  type PlayerInfo,
  type DecisionPoint,
  type DecisionTimeline,
  type AlternativeAction,
  type AggressionLevel,
  type PressureLevel,
  type ActionClass,
} from '../models/DecisionTimelineModel';

import {
  sortDecisions,
  groupDecisions,
  getDecisionLabel,
  getAggressiveDecisions,
  getPassiveDecisions,
  calculateRiskEscalationCurve,
  getOptimalDecisions,
  getQuestionableDecisions,
  type SortCriteria,
  type GroupedDecisions,
  type DecisionLabel,
  type RiskEscalationCurve,
} from '../models/DecisionTimelineQueries';

// ============================================================================
// 本地类型定义
// ============================================================================

/**
 * 快照玩家信息形状描述（只读）
 */
interface SnapshotPlayerInfo {
  readonly id: string;
  readonly name: string;
  readonly seat?: number;
}

/**
 * DecisionComparisonPanel Props
 */
interface DecisionComparisonPanelProps {
  readonly events: readonly EventInfo[];
  readonly players: readonly SnapshotPlayerInfo[];
  readonly currentIndex: number;
  readonly title?: string;
  readonly compact?: boolean;
}

// ============================================================================
// 本地派生类型（用于显示）
// ============================================================================

/**
 * 未来压力含义（本地扩展）
 */
type FuturePressure = 'minimal' | 'moderate' | 'significant' | 'escalating';

/**
 * 决策选项（用于显示）
 */
interface DecisionOption {
  readonly action: string;
  readonly amount?: number;
  readonly isActual: boolean;
  readonly potCommitment: string;
  readonly aggressionLevel: AggressionLevel;
  readonly riskLevel: PressureLevel;
  readonly futurePressure: FuturePressure;
  readonly reasoning: string;
}

/**
 * 决策上下文（用于显示）
 */
interface DecisionContext {
  readonly playerName: string;
  readonly playerId: string;
  readonly street: string;
  readonly potSize: number;
  readonly amountToCall: number;
  readonly previousActions: readonly string[];
}

// ============================================================================
// 常量
// ============================================================================

const RISK_COLORS: Record<PressureLevel, string> = {
  low: '#22c55e',
  medium: '#f59e0b',
  high: '#ef4444',
  critical: '#dc2626',
};

const AGGRESSION_COLORS: Record<AggressionLevel, string> = {
  passive: '#3b82f6',
  neutral: '#6b7280',
  aggressive: '#ef4444',
  'hyper-aggressive': '#dc2626',
};

const PRESSURE_COLORS: Record<FuturePressure, string> = {
  minimal: '#22c55e',
  moderate: '#3b82f6',
  significant: '#f59e0b',
  escalating: '#ef4444',
};

// ============================================================================
// 纯函数：从 DecisionPoint 派生显示数据
// ============================================================================

/**
 * 从 AlternativeAction 的 futurePressure 字符串解析未来压力级别
 */
function parseFuturePressure(futurePressureStr: string): FuturePressure {
  if (futurePressureStr.includes('N/A')) return 'minimal';
  if (futurePressureStr.includes('High')) return 'escalating';
  if (futurePressureStr.includes('Medium')) return 'significant';
  if (futurePressureStr.includes('Low')) return 'moderate';
  return 'minimal';
}

/**
 * 从 AlternativeAction 生成推理描述
 */
function generateReasoning(
  action: AlternativeAction,
  isActual: boolean
): string {
  const prefix = isActual ? 'The actual choice' : 'This alternative';
  const actionName = action.action;

  switch (actionName) {
    case 'fold':
      return `${prefix} exits the hand, preserving remaining stack. No further commitment required.`;
    case 'check':
      return `${prefix} maintains position without additional investment. Keeps options open for later streets.`;
    case 'call':
      return `${prefix} matches the current bet, staying in the hand with measured commitment.`;
    case 'bet':
      return `${prefix} initiates aggression, building the pot and applying pressure to opponents.`;
    case 'raise':
      return `${prefix} escalates commitment, narrowing ranges and increasing pot equity demands.`;
    case 'all-in':
      return `${prefix} commits maximum resources, creating a polarized decision point for opponents.`;
    default:
      return `${prefix} represents a standard continuation.`;
  }
}

/**
 * 从 AlternativeAction 构建 DecisionOption
 */
function alternativeToDecisionOption(
  alt: AlternativeAction,
  isActual: boolean,
  amount?: number
): DecisionOption {
  return {
    action: alt.action.toUpperCase(),
    amount,
    isActual,
    potCommitment: alt.potCommitment,
    aggressionLevel: alt.aggressionLevel,
    riskLevel: alt.riskLevel,
    futurePressure: parseFuturePressure(alt.futurePressure),
    reasoning: generateReasoning(alt, isActual),
  };
}

/**
 * 从 DecisionPoint 构建显示上下文
 */
function buildDecisionContext(
  decision: DecisionPoint,
  events: readonly EventInfo[],
  currentIndex: number
): DecisionContext {
  // Derive pot size from events up to current index
  let potSize = 0;
  for (let i = 0; i < currentIndex && i < events.length; i++) {
    const e = events[i];
    if (e.amount && ['BET', 'CALL', 'RAISE', 'ALL_IN', 'POST_BLIND'].includes(e.type)) {
      potSize += e.amount;
    }
  }

  // Derive amount to call
  let currentBet = 0;
  const playerBets: Map<string, number> = new Map();
  for (let i = 0; i < currentIndex && i < events.length; i++) {
    const e = events[i];
    if (e.amount && e.playerId && ['BET', 'CALL', 'RAISE', 'ALL_IN', 'POST_BLIND'].includes(e.type)) {
      const prevBet = playerBets.get(e.playerId) ?? 0;
      playerBets.set(e.playerId, prevBet + e.amount);
      if (['BET', 'RAISE', 'ALL_IN'].includes(e.type)) {
        currentBet = Math.max(currentBet, prevBet + e.amount);
      }
    }
  }
  const playerCurrentBet = playerBets.get(decision.playerId) ?? 0;
  const amountToCall = Math.max(0, currentBet - playerCurrentBet);

  // Derive previous actions in current street
  const previousActions: string[] = [];
  let inCurrentStreet = false;
  for (let i = 0; i < currentIndex && i < events.length; i++) {
    const e = events[i];
    if (e.type === 'STREET_START' || e.type === 'DEAL_COMMUNITY') {
      inCurrentStreet = true;
      previousActions.length = 0;
    }
    if (inCurrentStreet && ['FOLD', 'CHECK', 'CALL', 'BET', 'RAISE', 'ALL_IN'].includes(e.type)) {
      previousActions.push(e.type);
    }
  }

  return {
    playerName: decision.playerName,
    playerId: decision.playerId,
    street: decision.street,
    potSize,
    amountToCall,
    previousActions,
  };
}

/**
 * 从 DecisionPoint 构建所有决策选项
 */
function buildDecisionOptions(decision: DecisionPoint): readonly DecisionOption[] {
  const options: DecisionOption[] = [];

  // Add actual decision
  options.push(alternativeToDecisionOption(
    decision.comparison.actualAction,
    true,
    decision.amount
  ));

  // Add alternatives from the comparison context
  for (const alt of decision.comparison.alternatives) {
    options.push(alternativeToDecisionOption(alt, false));
  }

  return options;
}

// ============================================================================
// Sub-components（纯函数组件）
// ============================================================================

interface DecisionRowProps {
  readonly option: DecisionOption;
  readonly compact?: boolean;
}

function DecisionRow({ option, compact = false }: DecisionRowProps) {
  const riskColor = RISK_COLORS[option.riskLevel];
  const aggressionColor = AGGRESSION_COLORS[option.aggressionLevel];
  const pressureColor = PRESSURE_COLORS[option.futurePressure];

  return (
    <div
      style={{
        marginBottom: compact ? 8 : 12,
        padding: compact ? '8px 10px' : '12px 14px',
        background: option.isActual
          ? 'rgba(34, 197, 94, 0.15)'
          : 'rgba(100, 100, 100, 0.1)',
        border: option.isActual
          ? '1px solid rgba(34, 197, 94, 0.4)'
          : '1px solid rgba(100, 100, 100, 0.2)',
        borderRadius: 6,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: compact ? 8 : 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              padding: '3px 10px',
              background: option.isActual ? '#22c55e' : '#6b7280',
              borderRadius: 4,
              fontSize: compact ? 10 : 11,
              fontWeight: 700,
              color: '#fff',
              textTransform: 'uppercase',
            }}
          >
            {option.action}
          </span>
          {option.amount !== undefined && option.action !== 'FOLD' && option.action !== 'CHECK' && (
            <span
              style={{
                fontSize: compact ? 10 : 11,
                color: '#e0e0e0',
                fontWeight: 600,
              }}
            >
              ${option.amount}
            </span>
          )}
          {option.isActual && (
            <span
              style={{
                padding: '2px 6px',
                background: 'rgba(34, 197, 94, 0.3)',
                borderRadius: 3,
                fontSize: compact ? 8 : 9,
                color: '#22c55e',
                fontWeight: 600,
              }}
            >
              ACTUAL
            </span>
          )}
        </div>
      </div>

      {/* Metrics Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: compact ? 6 : 8,
          marginBottom: compact ? 8 : 10,
        }}
      >
        {/* Pot Commitment */}
        <div
          style={{
            padding: compact ? '4px 6px' : '6px 8px',
            background: 'rgba(0, 0, 0, 0.2)',
            borderRadius: 4,
          }}
        >
          <div
            style={{
              fontSize: compact ? 8 : 9,
              color: '#888',
              textTransform: 'uppercase',
              marginBottom: 2,
            }}
          >
            Pot Commitment
          </div>
          <div
            style={{
              fontSize: compact ? 10 : 11,
              color: '#d0d0d0',
            }}
          >
            {option.potCommitment}
          </div>
        </div>

        {/* Aggression Level */}
        <div
          style={{
            padding: compact ? '4px 6px' : '6px 8px',
            background: 'rgba(0, 0, 0, 0.2)',
            borderRadius: 4,
          }}
        >
          <div
            style={{
              fontSize: compact ? 8 : 9,
              color: '#888',
              textTransform: 'uppercase',
              marginBottom: 2,
            }}
          >
            Aggression
          </div>
          <span
            style={{
              padding: '2px 6px',
              background: `${aggressionColor}20`,
              borderRadius: 3,
              fontSize: compact ? 9 : 10,
              color: aggressionColor,
              fontWeight: 600,
              textTransform: 'uppercase',
            }}
          >
            {option.aggressionLevel}
          </span>
        </div>

        {/* Risk Level */}
        <div
          style={{
            padding: compact ? '4px 6px' : '6px 8px',
            background: 'rgba(0, 0, 0, 0.2)',
            borderRadius: 4,
          }}
        >
          <div
            style={{
              fontSize: compact ? 8 : 9,
              color: '#888',
              textTransform: 'uppercase',
              marginBottom: 2,
            }}
          >
            Risk Level
          </div>
          <span
            style={{
              padding: '2px 6px',
              background: `${riskColor}20`,
              borderRadius: 3,
              fontSize: compact ? 9 : 10,
              color: riskColor,
              fontWeight: 600,
              textTransform: 'uppercase',
            }}
          >
            {option.riskLevel}
          </span>
        </div>

        {/* Future Pressure */}
        <div
          style={{
            padding: compact ? '4px 6px' : '6px 8px',
            background: 'rgba(0, 0, 0, 0.2)',
            borderRadius: 4,
          }}
        >
          <div
            style={{
              fontSize: compact ? 8 : 9,
              color: '#888',
              textTransform: 'uppercase',
              marginBottom: 2,
            }}
          >
            Future Pressure
          </div>
          <span
            style={{
              padding: '2px 6px',
              background: `${pressureColor}20`,
              borderRadius: 3,
              fontSize: compact ? 9 : 10,
              color: pressureColor,
              fontWeight: 600,
              textTransform: 'uppercase',
            }}
          >
            {option.futurePressure}
          </span>
        </div>
      </div>

      {/* Reasoning */}
      <div
        style={{
          fontSize: compact ? 10 : 11,
          color: '#9ca3af',
          lineHeight: 1.5,
          fontStyle: 'italic',
          borderTop: '1px solid rgba(100, 100, 100, 0.2)',
          paddingTop: compact ? 6 : 8,
        }}
      >
        {option.reasoning}
      </div>
    </div>
  );
}

// ============================================================================
// Extended Comparison Sections (Feature Expansion)
// ============================================================================

/**
 * Comparison mode types
 */
type ComparisonMode = 'alternatives' | 'timeline' | 'risk-spectrum' | 'action-breakdown';

interface ComparisonModeSelectorProps {
  readonly currentMode: ComparisonMode;
  readonly onModeChange?: (mode: ComparisonMode) => void;
  readonly compact?: boolean;
}

function ComparisonModeSelector({
  currentMode,
  compact = false,
}: ComparisonModeSelectorProps) {
  const modes: { id: ComparisonMode; label: string }[] = [
    { id: 'alternatives', label: 'Alternatives' },
    { id: 'timeline', label: 'Timeline' },
    { id: 'risk-spectrum', label: 'Risk Spectrum' },
    { id: 'action-breakdown', label: 'Actions' },
  ];

  return (
    <div
      style={{
        display: 'flex',
        gap: 4,
        padding: compact ? '4px 8px' : '6px 10px',
        background: 'rgba(0, 0, 0, 0.1)',
        borderRadius: 4,
        marginBottom: compact ? 8 : 12,
      }}
    >
      {modes.map(mode => (
        <span
          key={mode.id}
          style={{
            padding: compact ? '2px 6px' : '3px 8px',
            background:
              currentMode === mode.id
                ? 'rgba(6, 182, 212, 0.3)'
                : 'rgba(100, 100, 100, 0.2)',
            borderRadius: 3,
            fontSize: compact ? 8 : 9,
            color: currentMode === mode.id ? '#22d3ee' : '#888',
            fontWeight: currentMode === mode.id ? 700 : 400,
            textTransform: 'uppercase',
          }}
        >
          {mode.label}
        </span>
      ))}
    </div>
  );
}

interface TimelineComparisonViewProps {
  readonly timeline: DecisionTimeline;
  readonly currentIndex: number;
  readonly compact?: boolean;
}

function TimelineComparisonView({
  timeline,
  currentIndex,
  compact = false,
}: TimelineComparisonViewProps) {
  const relevantDecisions = timeline.filter(d => d.index <= currentIndex);

  if (relevantDecisions.length === 0) {
    return (
      <div style={{ fontSize: compact ? 10 : 11, color: '#666', fontStyle: 'italic' }}>
        No decisions to display in timeline
      </div>
    );
  }

  return (
    <div style={{ marginBottom: compact ? 12 : 16 }}>
      <div
        style={{
          fontSize: compact ? 9 : 10,
          color: '#22d3ee',
          fontWeight: 700,
          textTransform: 'uppercase',
          marginBottom: compact ? 6 : 8,
        }}
      >
        Decision Timeline ({relevantDecisions.length})
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: compact ? 4 : 6,
        }}
      >
        {relevantDecisions.slice(-8).map((decision, idx) => {
          const label = getDecisionLabel(decision);
          const isCurrentDecision = decision.index === currentIndex;

          return (
            <div
              key={idx}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: compact ? '4px 8px' : '6px 10px',
                background: isCurrentDecision
                  ? 'rgba(6, 182, 212, 0.2)'
                  : 'rgba(100, 100, 100, 0.1)',
                borderLeft: isCurrentDecision
                  ? '3px solid #22d3ee'
                  : '3px solid rgba(100, 100, 100, 0.3)',
                borderRadius: '0 4px 4px 0',
              }}
            >
              <span
                style={{
                  fontSize: compact ? 8 : 9,
                  color: '#666',
                  minWidth: 50,
                }}
              >
                {decision.street}
              </span>
              <span
                style={{
                  fontSize: compact ? 10 : 11,
                  fontWeight: 600,
                  color: decision.isHeroDecision ? '#f472b6' : '#d0d0d0',
                  minWidth: 80,
                }}
              >
                {decision.playerName.slice(0, 8)}
              </span>
              <span
                style={{
                  padding: '2px 6px',
                  background: `${label.colorHint}20`,
                  borderRadius: 3,
                  fontSize: compact ? 8 : 9,
                  color: label.colorHint,
                  fontWeight: 700,
                }}
              >
                {label.shortLabel}
              </span>
              {decision.amount !== undefined && (
                <span style={{ fontSize: compact ? 9 : 10, color: '#aaa' }}>
                  ${decision.amount}
                </span>
              )}
              <span
                style={{
                  marginLeft: 'auto',
                  fontSize: compact ? 8 : 9,
                  color:
                    decision.alignment.alignmentLabel === 'Aligned'
                      ? '#22c55e'
                      : decision.alignment.alignmentLabel === 'High-risk deviation'
                      ? '#ef4444'
                      : '#f59e0b',
                }}
              >
                {decision.alignment.alignmentLabel}
              </span>
            </div>
          );
        })}
      </div>
      {relevantDecisions.length > 8 && (
        <div
          style={{
            fontSize: compact ? 9 : 10,
            color: '#666',
            fontStyle: 'italic',
            marginTop: compact ? 4 : 6,
            textAlign: 'center',
          }}
        >
          Showing last 8 of {relevantDecisions.length} decisions
        </div>
      )}
    </div>
  );
}

interface RiskSpectrumViewProps {
  readonly timeline: DecisionTimeline;
  readonly currentIndex: number;
  readonly compact?: boolean;
}

function RiskSpectrumView({
  timeline,
  currentIndex,
  compact = false,
}: RiskSpectrumViewProps) {
  const relevantDecisions = timeline.filter(d => d.index <= currentIndex);
  const riskCurve = calculateRiskEscalationCurve(relevantDecisions);

  // Group decisions by risk level
  const riskGroups = {
    low: relevantDecisions.filter(d => d.comparison.actualAction.riskLevel === 'low'),
    medium: relevantDecisions.filter(d => d.comparison.actualAction.riskLevel === 'medium'),
    high: relevantDecisions.filter(d => d.comparison.actualAction.riskLevel === 'high'),
    critical: relevantDecisions.filter(d => d.comparison.actualAction.riskLevel === 'critical'),
  };

  return (
    <div style={{ marginBottom: compact ? 12 : 16 }}>
      <div
        style={{
          fontSize: compact ? 9 : 10,
          color: '#dc2626',
          fontWeight: 700,
          textTransform: 'uppercase',
          marginBottom: compact ? 6 : 8,
        }}
      >
        Risk Spectrum Analysis
      </div>

      {/* Risk Distribution Bar */}
      <div
        style={{
          display: 'flex',
          height: compact ? 20 : 24,
          borderRadius: 4,
          overflow: 'hidden',
          marginBottom: compact ? 8 : 12,
        }}
      >
        {riskGroups.low.length > 0 && (
          <div
            style={{
              flex: riskGroups.low.length,
              background: '#22c55e',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: compact ? 8 : 9,
              color: '#fff',
              fontWeight: 600,
            }}
          >
            LOW ({riskGroups.low.length})
          </div>
        )}
        {riskGroups.medium.length > 0 && (
          <div
            style={{
              flex: riskGroups.medium.length,
              background: '#f59e0b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: compact ? 8 : 9,
              color: '#fff',
              fontWeight: 600,
            }}
          >
            MED ({riskGroups.medium.length})
          </div>
        )}
        {riskGroups.high.length > 0 && (
          <div
            style={{
              flex: riskGroups.high.length,
              background: '#ef4444',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: compact ? 8 : 9,
              color: '#fff',
              fontWeight: 600,
            }}
          >
            HIGH ({riskGroups.high.length})
          </div>
        )}
        {riskGroups.critical.length > 0 && (
          <div
            style={{
              flex: riskGroups.critical.length,
              background: '#dc2626',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: compact ? 8 : 9,
              color: '#fff',
              fontWeight: 600,
            }}
          >
            CRIT ({riskGroups.critical.length})
          </div>
        )}
      </div>

      {/* Risk Curve Metrics */}
      <div style={{ display: 'flex', gap: compact ? 8 : 12 }}>
        <div
          style={{
            flex: 1,
            padding: compact ? '6px 8px' : '8px 12px',
            background: 'rgba(220, 38, 38, 0.1)',
            borderRadius: 4,
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: compact ? 7 : 8, color: '#888', textTransform: 'uppercase' }}>
            Peak Risk
          </div>
          <div style={{ fontSize: compact ? 14 : 16, color: '#ef4444', fontWeight: 700 }}>
            {riskCurve.peakRisk}%
          </div>
        </div>
        <div
          style={{
            flex: 1,
            padding: compact ? '6px 8px' : '8px 12px',
            background: 'rgba(100, 100, 100, 0.1)',
            borderRadius: 4,
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: compact ? 7 : 8, color: '#888', textTransform: 'uppercase' }}>
            Final Risk
          </div>
          <div style={{ fontSize: compact ? 14 : 16, color: '#d0d0d0', fontWeight: 700 }}>
            {riskCurve.finalRisk}%
          </div>
        </div>
        <div
          style={{
            flex: 1,
            padding: compact ? '6px 8px' : '8px 12px',
            background: 'rgba(100, 100, 100, 0.1)',
            borderRadius: 4,
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: compact ? 7 : 8, color: '#888', textTransform: 'uppercase' }}>
            Pattern
          </div>
          <div
            style={{
              fontSize: compact ? 10 : 11,
              color:
                riskCurve.escalationPattern === 'sudden'
                  ? '#ef4444'
                  : riskCurve.escalationPattern === 'de-escalating'
                  ? '#22c55e'
                  : '#f59e0b',
              fontWeight: 600,
              textTransform: 'uppercase',
            }}
          >
            {riskCurve.escalationPattern}
          </div>
        </div>
      </div>

      {/* Risk Description */}
      <div
        style={{
          marginTop: compact ? 8 : 10,
          fontSize: compact ? 10 : 11,
          color: '#9ca3af',
          fontStyle: 'italic',
          lineHeight: 1.5,
        }}
      >
        {riskCurve.escalationDescription}
      </div>
    </div>
  );
}

interface ActionBreakdownViewProps {
  readonly timeline: DecisionTimeline;
  readonly currentIndex: number;
  readonly compact?: boolean;
}

function ActionBreakdownView({
  timeline,
  currentIndex,
  compact = false,
}: ActionBreakdownViewProps) {
  const relevantDecisions = timeline.filter(d => d.index <= currentIndex);
  const aggressive = getAggressiveDecisions(relevantDecisions);
  const passive = getPassiveDecisions(relevantDecisions);
  const optimal = getOptimalDecisions(relevantDecisions);
  const questionable = getQuestionableDecisions(relevantDecisions);

  // Count by action type
  const actionCounts: Record<string, number> = {};
  for (const d of relevantDecisions) {
    const action = d.actionClass;
    actionCounts[action] = (actionCounts[action] ?? 0) + 1;
  }

  const actionEntries = Object.entries(actionCounts).sort((a, b) => b[1] - a[1]);

  return (
    <div style={{ marginBottom: compact ? 12 : 16 }}>
      <div
        style={{
          fontSize: compact ? 9 : 10,
          color: '#3b82f6',
          fontWeight: 700,
          textTransform: 'uppercase',
          marginBottom: compact ? 6 : 8,
        }}
      >
        Action Breakdown
      </div>

      {/* Action Distribution */}
      <div style={{ display: 'flex', gap: compact ? 6 : 8, flexWrap: 'wrap', marginBottom: compact ? 10 : 14 }}>
        {actionEntries.map(([action, count]) => {
          const colors: Record<string, string> = {
            fold: '#6b7280',
            check: '#3b82f6',
            call: '#22c55e',
            bet: '#f59e0b',
            raise: '#ef4444',
            'all-in': '#dc2626',
            'post-blind': '#9ca3af',
          };
          const color = colors[action] ?? '#888';

          return (
            <div
              key={action}
              style={{
                padding: compact ? '6px 10px' : '8px 14px',
                background: `${color}15`,
                border: `1px solid ${color}40`,
                borderRadius: 4,
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  fontSize: compact ? 8 : 9,
                  color: color,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  marginBottom: 2,
                }}
              >
                {action}
              </div>
              <div style={{ fontSize: compact ? 14 : 16, color: '#e0e0e0', fontWeight: 700 }}>
                {count}
              </div>
            </div>
          );
        })}
      </div>

      {/* Aggression vs Passive Summary */}
      <div style={{ display: 'flex', gap: compact ? 8 : 12, marginBottom: compact ? 10 : 14 }}>
        <div
          style={{
            flex: 1,
            padding: compact ? '8px' : '10px',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            borderRadius: 4,
          }}
        >
          <div
            style={{
              fontSize: compact ? 8 : 9,
              color: '#ef4444',
              fontWeight: 700,
              textTransform: 'uppercase',
              marginBottom: compact ? 4 : 6,
            }}
          >
            Aggressive Actions
          </div>
          <div style={{ fontSize: compact ? 16 : 18, color: '#ef4444', fontWeight: 700 }}>
            {aggressive.length}
          </div>
          <div style={{ fontSize: compact ? 9 : 10, color: '#9ca3af' }}>
            {relevantDecisions.length > 0
              ? `${Math.round((aggressive.length / relevantDecisions.length) * 100)}% of total`
              : '0%'}
          </div>
        </div>
        <div
          style={{
            flex: 1,
            padding: compact ? '8px' : '10px',
            background: 'rgba(59, 130, 246, 0.1)',
            border: '1px solid rgba(59, 130, 246, 0.2)',
            borderRadius: 4,
          }}
        >
          <div
            style={{
              fontSize: compact ? 8 : 9,
              color: '#3b82f6',
              fontWeight: 700,
              textTransform: 'uppercase',
              marginBottom: compact ? 4 : 6,
            }}
          >
            Passive Actions
          </div>
          <div style={{ fontSize: compact ? 16 : 18, color: '#3b82f6', fontWeight: 700 }}>
            {passive.length}
          </div>
          <div style={{ fontSize: compact ? 9 : 10, color: '#9ca3af' }}>
            {relevantDecisions.length > 0
              ? `${Math.round((passive.length / relevantDecisions.length) * 100)}% of total`
              : '0%'}
          </div>
        </div>
      </div>

      {/* Quality Summary */}
      <div style={{ display: 'flex', gap: compact ? 8 : 12 }}>
        <div
          style={{
            flex: 1,
            padding: compact ? '6px 8px' : '8px 10px',
            background: 'rgba(34, 197, 94, 0.1)',
            borderRadius: 4,
          }}
        >
          <div style={{ fontSize: compact ? 7 : 8, color: '#888', textTransform: 'uppercase' }}>
            Optimal Decisions
          </div>
          <div style={{ fontSize: compact ? 12 : 14, color: '#22c55e', fontWeight: 600 }}>
            {optimal.length}
          </div>
        </div>
        <div
          style={{
            flex: 1,
            padding: compact ? '6px 8px' : '8px 10px',
            background: 'rgba(239, 68, 68, 0.1)',
            borderRadius: 4,
          }}
        >
          <div style={{ fontSize: compact ? 7 : 8, color: '#888', textTransform: 'uppercase' }}>
            Questionable
          </div>
          <div style={{ fontSize: compact ? 12 : 14, color: '#ef4444', fontWeight: 600 }}>
            {questionable.length}
          </div>
        </div>
      </div>
    </div>
  );
}

interface AlternativeRankingViewProps {
  readonly decision: DecisionPoint;
  readonly options: readonly DecisionOption[];
  readonly compact?: boolean;
}

function AlternativeRankingView({
  decision,
  options,
  compact = false,
}: AlternativeRankingViewProps) {
  // Rank alternatives by a composite score
  const rankedOptions = [...options].sort((a, b) => {
    // Score: lower risk + higher aggression (if aligned) = better
    const riskScores: Record<PressureLevel, number> = {
      low: 4,
      medium: 3,
      high: 2,
      critical: 1,
    };
    const aScore = riskScores[a.riskLevel] + (a.isActual ? 2 : 0);
    const bScore = riskScores[b.riskLevel] + (b.isActual ? 2 : 0);
    return bScore - aScore;
  });

  return (
    <div style={{ marginBottom: compact ? 12 : 16 }}>
      <div
        style={{
          fontSize: compact ? 9 : 10,
          color: '#a78bfa',
          fontWeight: 700,
          textTransform: 'uppercase',
          marginBottom: compact ? 6 : 8,
        }}
      >
        Alternative Ranking (by Risk/Reward)
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 4 : 6 }}>
        {rankedOptions.map((option, idx) => {
          const riskColor = RISK_COLORS[option.riskLevel];
          const aggroColor = AGGRESSION_COLORS[option.aggressionLevel];

          return (
            <div
              key={idx}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: compact ? '6px 10px' : '8px 12px',
                background: option.isActual
                  ? 'rgba(34, 197, 94, 0.15)'
                  : 'rgba(100, 100, 100, 0.1)',
                border: option.isActual
                  ? '1px solid rgba(34, 197, 94, 0.3)'
                  : '1px solid transparent',
                borderRadius: 4,
              }}
            >
              <span
                style={{
                  fontSize: compact ? 10 : 12,
                  color: '#888',
                  fontWeight: 700,
                  width: 20,
                }}
              >
                #{idx + 1}
              </span>
              <span
                style={{
                  padding: '2px 8px',
                  background: option.isActual ? '#22c55e' : '#6b7280',
                  borderRadius: 3,
                  fontSize: compact ? 9 : 10,
                  color: '#fff',
                  fontWeight: 700,
                }}
              >
                {option.action}
              </span>
              {option.isActual && (
                <span
                  style={{
                    fontSize: compact ? 7 : 8,
                    color: '#22c55e',
                    fontWeight: 600,
                  }}
                >
                  CHOSEN
                </span>
              )}
              <span
                style={{
                  marginLeft: 'auto',
                  display: 'flex',
                  gap: 4,
                }}
              >
                <span
                  style={{
                    padding: '1px 4px',
                    background: `${riskColor}20`,
                    borderRadius: 2,
                    fontSize: compact ? 7 : 8,
                    color: riskColor,
                    fontWeight: 600,
                  }}
                >
                  {option.riskLevel.toUpperCase()}
                </span>
                <span
                  style={{
                    padding: '1px 4px',
                    background: `${aggroColor}20`,
                    borderRadius: 2,
                    fontSize: compact ? 7 : 8,
                    color: aggroColor,
                    fontWeight: 600,
                  }}
                >
                  {option.aggressionLevel.toUpperCase()}
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// DecisionComparisonPanel - Main Component
// ============================================================================

export function DecisionComparisonPanel({
  events,
  players,
  currentIndex,
  title = 'Decision Comparison',
  compact = false,
}: DecisionComparisonPanelProps) {
  // ========================================
  // 【防御入口】统一防御层 - 防止 undefined/null 访问
  // ========================================
  const safeEvents = Array.isArray(events) ? events : [];
  const safePlayers = Array.isArray(players) ? players : [];
  const safeCurrentIndex = typeof currentIndex === 'number' && currentIndex >= 0 ? currentIndex : 0;

  // ========================================
  // 边界检查：无事件时显示空状态
  // ========================================
  if (safeEvents.length === 0) {
    return (
      <div
        style={{
          padding: compact ? '8px 12px' : '12px 16px',
          background: 'rgba(100, 100, 100, 0.1)',
          border: '1px solid rgba(100, 100, 100, 0.2)',
          borderRadius: 8,
          fontSize: compact ? 11 : 13,
          color: '#666',
          textAlign: 'center',
        }}
      >
        No event data for comparison
      </div>
    );
  }

  // ========================================
  // 从 DecisionTimelineModel 构建数据
  // ========================================
  const playerInfos: PlayerInfo[] = safePlayers.map(p => ({
    id: p?.id ?? '',
    name: p?.name ?? 'Unknown',
    seat: p?.seat,
  }));

  const timeline = buildDecisionTimeline(safeEvents, playerInfos, 0);
  const decision = getDecisionAtIndex(timeline, safeCurrentIndex);

  // ========================================
  // 无决策点时显示提示
  // ========================================
  if (!decision) {
    return (
      <div
        style={{
          padding: compact ? '8px 12px' : '12px 16px',
          background: 'rgba(100, 100, 100, 0.1)',
          border: '1px solid rgba(100, 100, 100, 0.2)',
          borderRadius: 8,
          fontSize: compact ? 11 : 13,
          color: '#666',
          textAlign: 'center',
        }}
      >
        Current event is not a player decision point
      </div>
    );
  }

  // ========================================
  // 从 DecisionPoint 派生显示数据
  // ========================================
  const decisionOptions = buildDecisionOptions(decision);
  const context = buildDecisionContext(decision, safeEvents, safeCurrentIndex);

  // ========================================
  // 纯展示渲染
  // ========================================
  return (
    <div
      style={{
        background: 'rgba(6, 182, 212, 0.08)',
        border: '1px solid rgba(6, 182, 212, 0.2)',
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      {/* 标题栏 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: compact ? '6px 10px' : '8px 12px',
          borderBottom: '1px solid rgba(6, 182, 212, 0.15)',
          background: 'rgba(6, 182, 212, 0.05)',
        }}
      >
        <span
          style={{
            fontSize: compact ? 9 : 10,
            color: '#22d3ee',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            fontWeight: 600,
          }}
        >
          {title}
        </span>
        <span
          style={{
            fontSize: compact ? 8 : 9,
            color: '#06b6d4',
            padding: '2px 6px',
            background: 'rgba(6, 182, 212, 0.15)',
            borderRadius: 3,
          }}
        >
          {context.street} | Pot: ${context.potSize}
        </span>
      </div>

      {/* Context Header */}
      <div
        style={{
          padding: compact ? '8px 10px' : '10px 12px',
          borderBottom: '1px solid rgba(6, 182, 212, 0.1)',
          background: 'rgba(6, 182, 212, 0.03)',
        }}
      >
        <div
          style={{
            fontSize: compact ? 10 : 11,
            color: '#d0d0d0',
          }}
        >
          <strong style={{ color: '#22d3ee' }}>{context.playerName}</strong>
          {context.amountToCall > 0
            ? ` faces ${context.amountToCall} to call`
            : ' has option to act'}
          {context.previousActions.length > 0 && (
            <span style={{ color: '#888' }}>
              {' '}| Prior actions: {context.previousActions.join(' → ')}
            </span>
          )}
        </div>
      </div>

      {/* Decision Options */}
      <div style={{ padding: compact ? '10px' : '12px' }}>
        {/* Comparison Mode Indicator (read-only display of current mode) */}
        <ComparisonModeSelector currentMode="alternatives" compact={compact} />

        <div
          style={{
            fontSize: compact ? 9 : 10,
            color: '#888',
            marginBottom: compact ? 8 : 10,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          Actual vs Alternatives
        </div>
        {decisionOptions.map((option, idx) => (
          <DecisionRow key={idx} option={option} compact={compact} />
        ))}

        {/* Alternative Ranking View */}
        <AlternativeRankingView decision={decision} options={decisionOptions} compact={compact} />

        {/* Comparison Summary from Model */}
        <div
          style={{
            marginTop: compact ? 8 : 12,
            padding: compact ? '8px 10px' : '10px 12px',
            background: 'rgba(6, 182, 212, 0.1)',
            borderRadius: 4,
            fontSize: compact ? 10 : 11,
            color: '#22d3ee',
            fontStyle: 'italic',
          }}
        >
          {decision.comparison.comparisonSummary}
        </div>

        {/* Extended Comparison Views (Feature Expansion) */}
        <div
          style={{
            marginTop: compact ? 12 : 16,
            paddingTop: compact ? 12 : 16,
            borderTop: '1px solid rgba(6, 182, 212, 0.15)',
          }}
        >
          <div
            style={{
              fontSize: compact ? 8 : 9,
              color: '#06b6d4',
              textTransform: 'uppercase',
              letterSpacing: '1px',
              marginBottom: compact ? 10 : 14,
              fontWeight: 600,
            }}
          >
            Extended Comparison Views
          </div>
          <TimelineComparisonView timeline={timeline} currentIndex={safeCurrentIndex} compact={compact} />
          <RiskSpectrumView timeline={timeline} currentIndex={safeCurrentIndex} compact={compact} />
          <ActionBreakdownView timeline={timeline} currentIndex={safeCurrentIndex} compact={compact} />
        </div>
      </div>

      {/* Footer Note */}
      <div
        style={{
          padding: compact ? '6px 10px' : '8px 12px',
          borderTop: '1px solid rgba(6, 182, 212, 0.1)',
          background: 'rgba(6, 182, 212, 0.03)',
          fontSize: compact ? 8 : 9,
          color: '#666',
          textAlign: 'center',
          fontStyle: 'italic',
        }}
      >
        Analysis is observational only. Alternatives are hypothetical for comparison.
      </div>
    </div>
  );
}

// ============================================================================
// 导出辅助函数（供测试或其他组件使用）
// ============================================================================

export {
  buildDecisionContext,
  buildDecisionOptions,
  alternativeToDecisionOption,
  parseFuturePressure,
  generateReasoning,
};

// 导出类型供外部使用
export type {
  SnapshotPlayerInfo,
  DecisionOption,
  DecisionContext,
  FuturePressure,
  DecisionComparisonPanelProps,
};
