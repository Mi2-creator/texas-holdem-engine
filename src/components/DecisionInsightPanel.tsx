// ============================================================================
// DecisionInsightPanel - Strategic Insight Summary (Read-Only UI)
// ============================================================================
//
// 【Post-Freeze Extension】Replay Architecture Freeze Declaration v1.0 Compliant
// 【Post-Model Integration】Consumes DecisionTimelineModel for consistency
//
// 层级: UI Layer (纯展示)
// 职责: 从事件序列派生高层次策略洞察，用于教育/分析目的
//
// 数据流:
//   events + players → DecisionTimelineModel → DecisionTimeline → Hand-level Insights
//
// 重要约束:
//   - 绝不建议任何行动（不输出"你应该下注/弃牌/跟注"）
//   - 只提供观察性解释，不影响决策逻辑
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
  getPlayerName,
  type EventInfo,
  type PlayerInfo,
  type DecisionTimeline,
  type DecisionPoint,
  type PressureLevel,
  type StreetPhase,
} from '../models/DecisionTimelineModel';

import {
  calculateVolatilityMetrics,
  calculateRiskEscalationCurve,
  calculateCommitmentMomentum,
  calculateConfidenceDeltaMetrics,
  calculateStrategicCoherence,
  getHeroVsFieldComparison,
  detectBettingPattern,
  detectPotentialLeaks,
  analyzeByStreet,
  getTurningPointDecisions,
  type VolatilityMetrics,
  type RiskEscalationCurve,
  type CommitmentMomentum,
  type ConfidenceDeltaMetrics,
  type StrategicCoherenceMetrics,
  type HeroVsFieldComparison,
  type BettingPattern,
  type PotentialLeak,
  type StreetAnalysis,
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
 * DecisionInsightPanel Props
 */
interface DecisionInsightPanelProps {
  readonly events: readonly EventInfo[];
  readonly players: readonly SnapshotPlayerInfo[];
  readonly currentIndex: number;
  readonly title?: string;
  readonly compact?: boolean;
}

// ============================================================================
// 派生类型（手牌级别聚合）
// ============================================================================

/**
 * 压力概览（手牌级别）
 */
interface PressureOverview {
  readonly level: 'low' | 'moderate' | 'high' | 'extreme';
  readonly description: string;
  readonly factors: readonly string[];
}

/**
 * 玩家倾向（聚合）
 */
interface PlayerTendency {
  readonly playerId: string;
  readonly playerName: string;
  readonly tightness: 'tight' | 'neutral' | 'loose';
  readonly aggression: 'passive' | 'neutral' | 'aggressive';
  readonly description: string;
}

/**
 * 极化信号（街道级别）
 */
interface PolarizationSignal {
  readonly street: string;
  readonly signal: 'weak' | 'moderate' | 'strong';
  readonly description: string;
}

/**
 * 风险承诺平衡（阶段级别）
 */
interface RiskCommitmentBalance {
  readonly phase: string;
  readonly riskLevel: 'conservative' | 'balanced' | 'committed' | 'overcommitted';
  readonly description: string;
}

/**
 * 洞察项
 */
interface InsightItem {
  readonly type: 'observation' | 'pattern' | 'tendency' | 'signal';
  readonly text: string;
  readonly confidence: 'low' | 'medium' | 'high';
}

// ============================================================================
// 常量
// ============================================================================

const PRESSURE_COLORS: Record<string, string> = {
  low: '#22c55e',
  moderate: '#f59e0b',
  high: '#ef4444',
  extreme: '#dc2626',
};

const TENDENCY_COLORS: Record<string, string> = {
  tight: '#3b82f6',
  neutral: '#6b7280',
  loose: '#f59e0b',
  passive: '#22c55e',
  aggressive: '#ef4444',
};

const SIGNAL_COLORS: Record<string, string> = {
  weak: '#6b7280',
  moderate: '#f59e0b',
  strong: '#ef4444',
};

const RISK_COLORS: Record<string, string> = {
  conservative: '#22c55e',
  balanced: '#3b82f6',
  committed: '#f59e0b',
  overcommitted: '#ef4444',
};

const CONFIDENCE_OPACITY: Record<string, number> = {
  low: 0.6,
  medium: 0.8,
  high: 1.0,
};

// ============================================================================
// 纯函数：从 DecisionTimeline 派生压力概览
// ============================================================================

/**
 * 从 DecisionTimeline 聚合压力概览
 */
function derivePressureOverview(
  timeline: DecisionTimeline,
  currentIndex: number
): PressureOverview {
  const relevantDecisions = timeline.filter(d => d.index <= currentIndex);

  if (relevantDecisions.length === 0) {
    return {
      level: 'low',
      description: 'The hand is proceeding with typical pressure dynamics.',
      factors: ['Standard betting patterns observed'],
    };
  }

  // Aggregate pressure levels from decision points
  const pressureCounts: Record<PressureLevel, number> = {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  };

  let allInCount = 0;
  let raiseCount = 0;
  let reraiseSequence = 0;
  let lastWasRaise = false;

  for (const decision of relevantDecisions) {
    pressureCounts[decision.insight.pressureLevel]++;

    if (decision.actionClass === 'all-in') {
      allInCount++;
      lastWasRaise = false;
    } else if (decision.actionClass === 'raise') {
      raiseCount++;
      if (lastWasRaise) {
        reraiseSequence++;
      }
      lastWasRaise = true;
    } else {
      lastWasRaise = false;
    }
  }

  const factors: string[] = [];
  let level: PressureOverview['level'] = 'low';
  let description = '';

  // Derive hand-level pressure from aggregated decision insights
  if (allInCount >= 2 || pressureCounts.critical >= 2) {
    level = 'extreme';
    factors.push('Multiple all-in commitments detected');
    description = 'This situation indicates maximum commitment from multiple players.';
  } else if (allInCount >= 1 || pressureCounts.high >= 2 || reraiseSequence >= 2) {
    level = 'high';
    if (allInCount >= 1) factors.push('All-in commitment present');
    if (pressureCounts.high >= 2) factors.push('Multiple high-pressure decision points');
    if (reraiseSequence >= 2) factors.push('Extended re-raise sequence observed');
    description = 'The pot dynamics reflect significant escalation and narrowing ranges.';
  } else if (raiseCount >= 3 || pressureCounts.medium >= 3 || reraiseSequence >= 1) {
    level = 'moderate';
    if (raiseCount >= 3) factors.push('Multiple raises throughout the hand');
    if (reraiseSequence >= 1) factors.push('Re-raise action detected');
    description = 'Rising commitment suggests strengthening convictions.';
  } else {
    level = 'low';
    factors.push('Standard betting patterns observed');
    description = 'The hand has proceeded with typical pressure dynamics.';
  }

  return { level, description, factors };
}

// ============================================================================
// 纯函数：从 DecisionTimeline 派生玩家倾向
// ============================================================================

/**
 * 从 DecisionTimeline 聚合玩家倾向
 */
function derivePlayerTendencies(
  timeline: DecisionTimeline,
  currentIndex: number,
  playerNames: Map<string, string>
): readonly PlayerTendency[] {
  const relevantDecisions = timeline.filter(d => d.index <= currentIndex);

  // Group decisions by player
  const playerDecisions: Map<string, DecisionPoint[]> = new Map();

  for (const decision of relevantDecisions) {
    if (!playerDecisions.has(decision.playerId)) {
      playerDecisions.set(decision.playerId, []);
    }
    playerDecisions.get(decision.playerId)?.push(decision);
  }

  const tendencies: PlayerTendency[] = [];

  for (const [playerId, decisions] of playerDecisions.entries()) {
    if (decisions.length === 0) continue;

    // Count action types
    let vpipActions = 0;
    let aggressiveActions = 0;
    let passiveActions = 0;
    let folds = 0;

    for (const d of decisions) {
      switch (d.actionClass) {
        case 'bet':
        case 'raise':
        case 'all-in':
          aggressiveActions++;
          vpipActions++;
          break;
        case 'call':
          passiveActions++;
          vpipActions++;
          break;
        case 'check':
          passiveActions++;
          break;
        case 'fold':
          folds++;
          break;
      }
    }

    const totalOpportunities = decisions.length;
    const vpipRatio = vpipActions / totalOpportunities;
    const voluntaryActions = aggressiveActions + passiveActions;
    const aggressionRatio = voluntaryActions > 0
      ? aggressiveActions / voluntaryActions
      : 0;

    let tightness: PlayerTendency['tightness'];
    if (vpipRatio >= 0.6) {
      tightness = 'loose';
    } else if (vpipRatio <= 0.3) {
      tightness = 'tight';
    } else {
      tightness = 'neutral';
    }

    let aggression: PlayerTendency['aggression'];
    if (aggressionRatio >= 0.5) {
      aggression = 'aggressive';
    } else if (aggressionRatio <= 0.25) {
      aggression = 'passive';
    } else {
      aggression = 'neutral';
    }

    let description = '';
    if (tightness === 'tight' && aggression === 'aggressive') {
      description = 'This player shows selective but forceful engagement.';
    } else if (tightness === 'loose' && aggression === 'aggressive') {
      description = 'This player demonstrates wide involvement with pressure.';
    } else if (tightness === 'tight' && aggression === 'passive') {
      description = 'This player exhibits cautious, reserved patterns.';
    } else if (tightness === 'loose' && aggression === 'passive') {
      description = 'This player shows frequent but non-confrontational participation.';
    } else {
      description = 'This player displays balanced tendencies.';
    }

    tendencies.push({
      playerId,
      playerName: getPlayerName(playerId, playerNames),
      tightness,
      aggression,
      description,
    });
  }

  return tendencies;
}

// ============================================================================
// 纯函数：从 DecisionTimeline 派生极化信号
// ============================================================================

/**
 * 从 DecisionTimeline 聚合街道级别的极化信号
 */
function derivePolarizationSignals(
  timeline: DecisionTimeline,
  currentIndex: number
): readonly PolarizationSignal[] {
  const relevantDecisions = timeline.filter(d => d.index <= currentIndex);

  // Group by street
  const streetDecisions: Map<StreetPhase, DecisionPoint[]> = new Map();

  for (const decision of relevantDecisions) {
    if (!streetDecisions.has(decision.street)) {
      streetDecisions.set(decision.street, []);
    }
    streetDecisions.get(decision.street)?.push(decision);
  }

  const signals: PolarizationSignal[] = [];

  const streetOrder: StreetPhase[] = ['PREFLOP', 'FLOP', 'TURN', 'RIVER'];

  for (const street of streetOrder) {
    const decisions = streetDecisions.get(street);
    if (!decisions || decisions.length === 0) continue;

    // Count polarization indicators
    let strongPolarization = 0;
    let moderatePolarization = 0;

    for (const d of decisions) {
      const indicator = d.insight.polarizationIndicator;
      if (indicator.includes('Highly polarized')) {
        strongPolarization++;
      } else if (indicator.includes('Moderately polarized')) {
        moderatePolarization++;
      }
    }

    let signal: PolarizationSignal['signal'];
    let description: string;

    if (strongPolarization >= 1) {
      signal = 'strong';
      description = 'The pot growth reflects polarized ranges with value-heavy or bluff-heavy compositions.';
    } else if (moderatePolarization >= 1) {
      signal = 'moderate';
      description = 'Betting patterns suggest some range narrowing and commitment building.';
    } else {
      signal = 'weak';
      description = 'Actions indicate wider, less defined ranges.';
    }

    signals.push({ street, signal, description });
  }

  return signals;
}

// ============================================================================
// 纯函数：从 DecisionTimeline 派生风险承诺平衡
// ============================================================================

/**
 * 从 DecisionTimeline 聚合阶段级别的风险承诺平衡
 */
function deriveRiskCommitmentBalance(
  timeline: DecisionTimeline,
  currentIndex: number
): readonly RiskCommitmentBalance[] {
  const relevantDecisions = timeline.filter(d => d.index <= currentIndex);

  // Group by street (phase)
  const phaseDecisions: Map<StreetPhase, DecisionPoint[]> = new Map();

  for (const decision of relevantDecisions) {
    if (!phaseDecisions.has(decision.street)) {
      phaseDecisions.set(decision.street, []);
    }
    phaseDecisions.get(decision.street)?.push(decision);
  }

  const balances: RiskCommitmentBalance[] = [];

  const streetOrder: StreetPhase[] = ['PREFLOP', 'FLOP', 'TURN', 'RIVER'];

  for (const phase of streetOrder) {
    const decisions = phaseDecisions.get(phase);
    if (!decisions || decisions.length === 0) continue;

    // Analyze risk commitment from decision insights
    let committedCount = 0;
    let conservativeCount = 0;
    let totalInvested = 0;
    let foldCount = 0;
    let continueCount = 0;

    for (const d of decisions) {
      const balance = d.insight.riskCommitmentBalance;
      if (balance.includes('committed') || balance.includes('commitment')) {
        committedCount++;
      }
      if (balance.includes('Deep-stacked') || balance.includes('maneuvering')) {
        conservativeCount++;
      }

      if (d.actionClass === 'fold') {
        foldCount++;
      } else {
        continueCount++;
        if (d.amount) totalInvested += d.amount;
      }
    }

    const avgInvestment = continueCount > 0 ? totalInvested / continueCount : 0;
    const continueRatio = decisions.length > 0 ? continueCount / decisions.length : 0;

    let riskLevel: RiskCommitmentBalance['riskLevel'];
    let description: string;

    if (continueRatio >= 0.9 && avgInvestment >= 100) {
      riskLevel = 'overcommitted';
      description = 'High continuation with significant investment suggests deep commitment.';
    } else if (committedCount >= 2 || (continueRatio >= 0.7 && avgInvestment >= 50)) {
      riskLevel = 'committed';
      description = 'Players are showing meaningful commitment to the pot.';
    } else if (continueRatio >= 0.5 || conservativeCount < committedCount) {
      riskLevel = 'balanced';
      description = 'Risk and continuation are in typical equilibrium.';
    } else {
      riskLevel = 'conservative';
      description = 'Players are exercising caution with selective continuation.';
    }

    balances.push({ phase, riskLevel, description });
  }

  return balances;
}

// ============================================================================
// 纯函数：综合洞察生成
// ============================================================================

function generateInsights(
  pressure: PressureOverview,
  tendencies: readonly PlayerTendency[],
  signals: readonly PolarizationSignal[],
  balances: readonly RiskCommitmentBalance[]
): readonly InsightItem[] {
  const insights: InsightItem[] = [];

  // Pressure-based insights
  if (pressure.level === 'extreme') {
    insights.push({
      type: 'observation',
      text: 'This hand has reached maximum escalation with stack commitments.',
      confidence: 'high',
    });
  } else if (pressure.level === 'high') {
    insights.push({
      type: 'observation',
      text: 'Significant pressure dynamics indicate narrowing ranges.',
      confidence: 'high',
    });
  }

  // Tendency-based insights
  const aggressivePlayers = tendencies.filter(t => t.aggression === 'aggressive');
  const passivePlayers = tendencies.filter(t => t.aggression === 'passive');

  if (aggressivePlayers.length >= 2) {
    insights.push({
      type: 'pattern',
      text: 'Multiple aggressive players create elevated volatility.',
      confidence: 'medium',
    });
  }

  if (passivePlayers.length === tendencies.length && tendencies.length > 0) {
    insights.push({
      type: 'tendency',
      text: 'All players show passive tendencies, suggesting cautious play.',
      confidence: 'medium',
    });
  }

  // Polarization-based insights
  const strongSignals = signals.filter(s => s.signal === 'strong');
  if (strongSignals.length >= 1) {
    insights.push({
      type: 'signal',
      text: 'Strong polarization signals suggest value-heavy or bluff-heavy ranges.',
      confidence: 'medium',
    });
  }

  // Balance-based insights
  const overcommitted = balances.filter(b => b.riskLevel === 'overcommitted');
  if (overcommitted.length >= 1) {
    insights.push({
      type: 'observation',
      text: 'Commitment levels indicate players have invested significantly.',
      confidence: 'high',
    });
  }

  // Add general insight if none generated
  if (insights.length === 0) {
    insights.push({
      type: 'observation',
      text: 'The hand is proceeding with standard dynamics.',
      confidence: 'low',
    });
  }

  return insights;
}

// ============================================================================
// Sub-components（纯函数组件）
// ============================================================================

interface PressureSectionProps {
  readonly pressure: PressureOverview;
  readonly compact?: boolean;
}

function PressureSection({ pressure, compact = false }: PressureSectionProps) {
  const color = PRESSURE_COLORS[pressure.level];

  return (
    <div style={{ marginBottom: compact ? 12 : 16 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: compact ? 6 : 8,
        }}
      >
        <span
          style={{
            fontSize: compact ? 9 : 10,
            color: '#ef4444',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          Strategic Pressure Overview
        </span>
        <span
          style={{
            padding: '2px 8px',
            background: `${color}20`,
            borderRadius: 4,
            fontSize: compact ? 9 : 10,
            color: color,
            fontWeight: 700,
            textTransform: 'uppercase',
          }}
        >
          {pressure.level}
        </span>
      </div>
      <div
        style={{
          fontSize: compact ? 11 : 12,
          color: '#d0d0d0',
          lineHeight: 1.5,
          marginBottom: compact ? 6 : 8,
        }}
      >
        {pressure.description}
      </div>
      {pressure.factors.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {pressure.factors.map((factor, idx) => (
            <span
              key={idx}
              style={{
                padding: '2px 6px',
                background: 'rgba(100, 100, 100, 0.2)',
                borderRadius: 3,
                fontSize: compact ? 9 : 10,
                color: '#aaa',
              }}
            >
              {factor}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

interface TendenciesSectionProps {
  readonly tendencies: readonly PlayerTendency[];
  readonly compact?: boolean;
}

function TendenciesSection({ tendencies, compact = false }: TendenciesSectionProps) {
  if (tendencies.length === 0) {
    return (
      <div style={{ marginBottom: compact ? 12 : 16 }}>
        <div
          style={{
            fontSize: compact ? 9 : 10,
            color: '#3b82f6',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: compact ? 6 : 8,
          }}
        >
          Player Tendencies
        </div>
        <div style={{ fontSize: compact ? 10 : 11, color: '#666', fontStyle: 'italic' }}>
          No player tendencies detected yet
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: compact ? 12 : 16 }}>
      <div
        style={{
          fontSize: compact ? 9 : 10,
          color: '#3b82f6',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          marginBottom: compact ? 6 : 8,
        }}
      >
        Player Tendencies
      </div>
      {tendencies.map((tendency) => (
        <div
          key={tendency.playerId}
          style={{
            marginBottom: compact ? 6 : 8,
            padding: compact ? '6px 8px' : '8px 10px',
            background: 'rgba(100, 100, 100, 0.1)',
            borderRadius: 4,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span
              style={{
                fontSize: compact ? 10 : 11,
                fontWeight: 600,
                color: '#e0e0e0',
              }}
            >
              {tendency.playerName.slice(0, 10)}
            </span>
            <span
              style={{
                padding: '1px 6px',
                background: `${TENDENCY_COLORS[tendency.tightness]}20`,
                borderRadius: 3,
                fontSize: compact ? 8 : 9,
                color: TENDENCY_COLORS[tendency.tightness],
                fontWeight: 600,
              }}
            >
              {tendency.tightness}
            </span>
            <span
              style={{
                padding: '1px 6px',
                background: `${TENDENCY_COLORS[tendency.aggression]}20`,
                borderRadius: 3,
                fontSize: compact ? 8 : 9,
                color: TENDENCY_COLORS[tendency.aggression],
                fontWeight: 600,
              }}
            >
              {tendency.aggression}
            </span>
          </div>
          <div
            style={{
              fontSize: compact ? 10 : 11,
              color: '#9ca3af',
              fontStyle: 'italic',
            }}
          >
            {tendency.description}
          </div>
        </div>
      ))}
    </div>
  );
}

interface PolarizationSectionProps {
  readonly signals: readonly PolarizationSignal[];
  readonly compact?: boolean;
}

function PolarizationSection({ signals, compact = false }: PolarizationSectionProps) {
  if (signals.length === 0) {
    return (
      <div style={{ marginBottom: compact ? 12 : 16 }}>
        <div
          style={{
            fontSize: compact ? 9 : 10,
            color: '#f59e0b',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: compact ? 6 : 8,
          }}
        >
          Range Polarization Signals
        </div>
        <div style={{ fontSize: compact ? 10 : 11, color: '#666', fontStyle: 'italic' }}>
          No polarization signals detected yet
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: compact ? 12 : 16 }}>
      <div
        style={{
          fontSize: compact ? 9 : 10,
          color: '#f59e0b',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          marginBottom: compact ? 6 : 8,
        }}
      >
        Range Polarization Signals
      </div>
      {signals.map((signal, idx) => (
        <div
          key={idx}
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8,
            marginBottom: compact ? 6 : 8,
          }}
        >
          <span
            style={{
              minWidth: compact ? 50 : 60,
              fontSize: compact ? 9 : 10,
              fontWeight: 700,
              color: '#888',
              textTransform: 'uppercase',
            }}
          >
            {signal.street}
          </span>
          <span
            style={{
              padding: '2px 6px',
              background: `${SIGNAL_COLORS[signal.signal]}20`,
              borderRadius: 3,
              fontSize: compact ? 8 : 9,
              color: SIGNAL_COLORS[signal.signal],
              fontWeight: 600,
              textTransform: 'uppercase',
            }}
          >
            {signal.signal}
          </span>
          <span
            style={{
              flex: 1,
              fontSize: compact ? 10 : 11,
              color: '#9ca3af',
            }}
          >
            {signal.description}
          </span>
        </div>
      ))}
    </div>
  );
}

interface RiskBalanceSectionProps {
  readonly balances: readonly RiskCommitmentBalance[];
  readonly compact?: boolean;
}

function RiskBalanceSection({ balances, compact = false }: RiskBalanceSectionProps) {
  if (balances.length === 0) {
    return (
      <div style={{ marginBottom: compact ? 12 : 16 }}>
        <div
          style={{
            fontSize: compact ? 9 : 10,
            color: '#22c55e',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: compact ? 6 : 8,
          }}
        >
          Risk vs Commitment Balance
        </div>
        <div style={{ fontSize: compact ? 10 : 11, color: '#666', fontStyle: 'italic' }}>
          No balance data available yet
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: compact ? 12 : 16 }}>
      <div
        style={{
          fontSize: compact ? 9 : 10,
          color: '#22c55e',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          marginBottom: compact ? 6 : 8,
        }}
      >
        Risk vs Commitment Balance
      </div>
      {balances.map((balance, idx) => (
        <div
          key={idx}
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8,
            marginBottom: compact ? 6 : 8,
          }}
        >
          <span
            style={{
              minWidth: compact ? 50 : 60,
              fontSize: compact ? 9 : 10,
              fontWeight: 700,
              color: '#888',
              textTransform: 'uppercase',
            }}
          >
            {balance.phase}
          </span>
          <span
            style={{
              padding: '2px 6px',
              background: `${RISK_COLORS[balance.riskLevel]}20`,
              borderRadius: 3,
              fontSize: compact ? 8 : 9,
              color: RISK_COLORS[balance.riskLevel],
              fontWeight: 600,
              textTransform: 'uppercase',
            }}
          >
            {balance.riskLevel}
          </span>
          <span
            style={{
              flex: 1,
              fontSize: compact ? 10 : 11,
              color: '#9ca3af',
            }}
          >
            {balance.description}
          </span>
        </div>
      ))}
    </div>
  );
}

interface InsightsSectionProps {
  readonly insights: readonly InsightItem[];
  readonly compact?: boolean;
}

function InsightsSection({ insights, compact = false }: InsightsSectionProps) {
  return (
    <div>
      <div
        style={{
          fontSize: compact ? 9 : 10,
          color: '#a78bfa',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          marginBottom: compact ? 6 : 8,
        }}
      >
        Key Observations
      </div>
      {insights.map((insight, idx) => (
        <div
          key={idx}
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8,
            marginBottom: compact ? 6 : 8,
            padding: compact ? '6px 8px' : '8px 10px',
            background: 'rgba(167, 139, 250, 0.1)',
            borderLeft: '2px solid rgba(167, 139, 250, 0.5)',
            borderRadius: '0 4px 4px 0',
            opacity: CONFIDENCE_OPACITY[insight.confidence],
          }}
        >
          <span
            style={{
              fontSize: compact ? 10 : 11,
              color: '#d0d0d0',
              lineHeight: 1.5,
            }}
          >
            {insight.text}
          </span>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// Extended Insight Sections (Feature Expansion)
// ============================================================================

const VOLATILITY_COLORS: Record<string, string> = {
  stable: '#22c55e',
  moderate: '#f59e0b',
  volatile: '#ef4444',
  chaotic: '#dc2626',
};

const MOMENTUM_COLORS: Record<string, string> = {
  accelerating: '#ef4444',
  decelerating: '#22c55e',
  neutral: '#6b7280',
};

const COHERENCE_COLORS: Record<string, string> = {
  'highly coherent': '#22c55e',
  coherent: '#3b82f6',
  mixed: '#f59e0b',
  incoherent: '#ef4444',
};

const LEAK_SEVERITY_COLORS: Record<string, string> = {
  minor: '#f59e0b',
  moderate: '#ef4444',
  major: '#dc2626',
};

interface VolatilitySectionProps {
  readonly volatility: VolatilityMetrics;
  readonly compact?: boolean;
}

function VolatilitySection({ volatility, compact = false }: VolatilitySectionProps) {
  const color = VOLATILITY_COLORS[volatility.volatilityLabel];

  return (
    <div style={{ marginBottom: compact ? 12 : 16 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: compact ? 6 : 8,
        }}
      >
        <span
          style={{
            fontSize: compact ? 9 : 10,
            color: '#f97316',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          Hand Volatility Analysis
        </span>
        <span
          style={{
            padding: '2px 8px',
            background: `${color}20`,
            borderRadius: 4,
            fontSize: compact ? 9 : 10,
            color: color,
            fontWeight: 700,
            textTransform: 'uppercase',
          }}
        >
          {volatility.volatilityLabel}
        </span>
        <span
          style={{
            marginLeft: 'auto',
            fontSize: compact ? 9 : 10,
            color: color,
            fontWeight: 600,
          }}
        >
          {volatility.volatilityScore}%
        </span>
      </div>
      <div
        style={{
          fontSize: compact ? 11 : 12,
          color: '#d0d0d0',
          lineHeight: 1.5,
          marginBottom: compact ? 6 : 8,
        }}
      >
        {volatility.volatilityDescription}
      </div>
      <div style={{ display: 'flex', gap: compact ? 8 : 12, flexWrap: 'wrap' }}>
        <div
          style={{
            padding: compact ? '4px 8px' : '6px 10px',
            background: 'rgba(100, 100, 100, 0.15)',
            borderRadius: 4,
          }}
        >
          <div style={{ fontSize: compact ? 7 : 8, color: '#888', textTransform: 'uppercase' }}>
            Action Swings
          </div>
          <div style={{ fontSize: compact ? 11 : 12, color: '#e0e0e0', fontWeight: 600 }}>
            {volatility.actionSwings}
          </div>
        </div>
        <div
          style={{
            padding: compact ? '4px 8px' : '6px 10px',
            background: 'rgba(100, 100, 100, 0.15)',
            borderRadius: 4,
          }}
        >
          <div style={{ fontSize: compact ? 7 : 8, color: '#888', textTransform: 'uppercase' }}>
            Pressure Swings
          </div>
          <div style={{ fontSize: compact ? 11 : 12, color: '#e0e0e0', fontWeight: 600 }}>
            {volatility.pressureSwings}
          </div>
        </div>
        <div
          style={{
            padding: compact ? '4px 8px' : '6px 10px',
            background: 'rgba(100, 100, 100, 0.15)',
            borderRadius: 4,
          }}
        >
          <div style={{ fontSize: compact ? 7 : 8, color: '#888', textTransform: 'uppercase' }}>
            Max Aggro Streak
          </div>
          <div style={{ fontSize: compact ? 11 : 12, color: '#ef4444', fontWeight: 600 }}>
            {volatility.maxConsecutiveAggression}
          </div>
        </div>
        <div
          style={{
            padding: compact ? '4px 8px' : '6px 10px',
            background: 'rgba(100, 100, 100, 0.15)',
            borderRadius: 4,
          }}
        >
          <div style={{ fontSize: compact ? 7 : 8, color: '#888', textTransform: 'uppercase' }}>
            Max Passive Streak
          </div>
          <div style={{ fontSize: compact ? 11 : 12, color: '#22c55e', fontWeight: 600 }}>
            {volatility.maxConsecutivePassive}
          </div>
        </div>
      </div>
    </div>
  );
}

interface RiskEscalationSectionProps {
  readonly riskCurve: RiskEscalationCurve;
  readonly compact?: boolean;
}

function RiskEscalationSection({ riskCurve, compact = false }: RiskEscalationSectionProps) {
  const patternColors: Record<string, string> = {
    gradual: '#f59e0b',
    sudden: '#ef4444',
    'de-escalating': '#22c55e',
    stable: '#6b7280',
  };
  const color = patternColors[riskCurve.escalationPattern];

  return (
    <div style={{ marginBottom: compact ? 12 : 16 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: compact ? 6 : 8,
        }}
      >
        <span
          style={{
            fontSize: compact ? 9 : 10,
            color: '#dc2626',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          Risk Escalation Curve
        </span>
        <span
          style={{
            padding: '2px 8px',
            background: `${color}20`,
            borderRadius: 4,
            fontSize: compact ? 9 : 10,
            color: color,
            fontWeight: 700,
            textTransform: 'uppercase',
          }}
        >
          {riskCurve.escalationPattern}
        </span>
      </div>
      <div
        style={{
          fontSize: compact ? 11 : 12,
          color: '#d0d0d0',
          lineHeight: 1.5,
          marginBottom: compact ? 6 : 8,
        }}
      >
        {riskCurve.escalationDescription}
      </div>
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
      </div>
      {/* Risk Curve Visualization */}
      {riskCurve.points.length > 0 && (
        <div
          style={{
            marginTop: compact ? 8 : 12,
            padding: compact ? '6px 8px' : '8px 12px',
            background: 'rgba(0, 0, 0, 0.2)',
            borderRadius: 4,
          }}
        >
          <div
            style={{
              fontSize: compact ? 7 : 8,
              color: '#888',
              textTransform: 'uppercase',
              marginBottom: compact ? 4 : 6,
            }}
          >
            Risk Progression
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              height: compact ? 30 : 40,
              gap: 2,
            }}
          >
            {riskCurve.points.slice(-10).map((point, idx) => (
              <div
                key={idx}
                style={{
                  flex: 1,
                  height: `${point.cumulativeRisk}%`,
                  background:
                    point.cumulativeRisk >= 70
                      ? '#ef4444'
                      : point.cumulativeRisk >= 40
                      ? '#f59e0b'
                      : '#22c55e',
                  borderRadius: '2px 2px 0 0',
                  minHeight: 2,
                }}
                title={`Risk: ${point.cumulativeRisk}% (${point.street})`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface MomentumSectionProps {
  readonly momentum: CommitmentMomentum;
  readonly compact?: boolean;
}

function MomentumSection({ momentum, compact = false }: MomentumSectionProps) {
  const color = MOMENTUM_COLORS[momentum.momentumDirection];

  return (
    <div style={{ marginBottom: compact ? 12 : 16 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: compact ? 6 : 8,
        }}
      >
        <span
          style={{
            fontSize: compact ? 9 : 10,
            color: '#8b5cf6',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          Commitment Momentum
        </span>
        <span
          style={{
            padding: '2px 8px',
            background: `${color}20`,
            borderRadius: 4,
            fontSize: compact ? 9 : 10,
            color: color,
            fontWeight: 700,
            textTransform: 'uppercase',
          }}
        >
          {momentum.momentumDirection}
        </span>
        <span
          style={{
            marginLeft: 'auto',
            fontSize: compact ? 10 : 11,
            color: momentum.momentumScore >= 0 ? '#ef4444' : '#22c55e',
            fontWeight: 600,
          }}
        >
          {momentum.momentumScore >= 0 ? '+' : ''}
          {momentum.momentumScore}
        </span>
      </div>
      <div
        style={{
          fontSize: compact ? 11 : 12,
          color: '#d0d0d0',
          lineHeight: 1.5,
          marginBottom: compact ? 6 : 8,
        }}
      >
        {momentum.momentumDescription}
      </div>
      <div style={{ display: 'flex', gap: compact ? 8 : 12 }}>
        <div
          style={{
            padding: compact ? '4px 8px' : '6px 10px',
            background: 'rgba(100, 100, 100, 0.15)',
            borderRadius: 4,
          }}
        >
          <div style={{ fontSize: compact ? 7 : 8, color: '#888', textTransform: 'uppercase' }}>
            Avg Delta
          </div>
          <div style={{ fontSize: compact ? 11 : 12, color: '#e0e0e0', fontWeight: 600 }}>
            {momentum.averageCommitmentDelta > 0 ? '+' : ''}
            {momentum.averageCommitmentDelta}
          </div>
        </div>
        <div
          style={{
            padding: compact ? '4px 8px' : '6px 10px',
            background: 'rgba(100, 100, 100, 0.15)',
            borderRadius: 4,
          }}
        >
          <div style={{ fontSize: compact ? 7 : 8, color: '#888', textTransform: 'uppercase' }}>
            Peak Momentum
          </div>
          <div style={{ fontSize: compact ? 11 : 12, color: '#ef4444', fontWeight: 600 }}>
            {momentum.peakMomentum > 0 ? '+' : ''}
            {momentum.peakMomentum}
          </div>
        </div>
        <div
          style={{
            padding: compact ? '4px 8px' : '6px 10px',
            background: 'rgba(100, 100, 100, 0.15)',
            borderRadius: 4,
          }}
        >
          <div style={{ fontSize: compact ? 7 : 8, color: '#888', textTransform: 'uppercase' }}>
            Shifts
          </div>
          <div style={{ fontSize: compact ? 11 : 12, color: '#e0e0e0', fontWeight: 600 }}>
            {momentum.momentumShifts}
          </div>
        </div>
      </div>
    </div>
  );
}

interface ConfidenceDeltaSectionProps {
  readonly confidenceDelta: ConfidenceDeltaMetrics;
  readonly compact?: boolean;
}

function ConfidenceDeltaSection({ confidenceDelta, compact = false }: ConfidenceDeltaSectionProps) {
  const trendColors: Record<string, string> = {
    improving: '#22c55e',
    declining: '#ef4444',
    stable: '#6b7280',
  };
  const color = trendColors[confidenceDelta.confidenceTrend];

  return (
    <div style={{ marginBottom: compact ? 12 : 16 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: compact ? 6 : 8,
        }}
      >
        <span
          style={{
            fontSize: compact ? 9 : 10,
            color: '#06b6d4',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          Decision Confidence Delta
        </span>
        <span
          style={{
            padding: '2px 8px',
            background: `${color}20`,
            borderRadius: 4,
            fontSize: compact ? 9 : 10,
            color: color,
            fontWeight: 700,
            textTransform: 'uppercase',
          }}
        >
          {confidenceDelta.confidenceTrend}
        </span>
      </div>
      <div
        style={{
          fontSize: compact ? 11 : 12,
          color: '#d0d0d0',
          lineHeight: 1.5,
          marginBottom: compact ? 6 : 8,
        }}
      >
        {confidenceDelta.confidenceDescription}
      </div>
      <div style={{ display: 'flex', gap: compact ? 8 : 12 }}>
        <div
          style={{
            flex: 1,
            padding: compact ? '6px 8px' : '8px 12px',
            background: 'rgba(6, 182, 212, 0.1)',
            borderRadius: 4,
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: compact ? 7 : 8, color: '#888', textTransform: 'uppercase' }}>
            Avg Confidence
          </div>
          <div style={{ fontSize: compact ? 14 : 16, color: '#06b6d4', fontWeight: 700 }}>
            {confidenceDelta.averageConfidence}%
          </div>
        </div>
        <div
          style={{
            padding: compact ? '6px 8px' : '8px 12px',
            background: 'rgba(34, 197, 94, 0.1)',
            borderRadius: 4,
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: compact ? 7 : 8, color: '#888', textTransform: 'uppercase' }}>
            High Conf
          </div>
          <div style={{ fontSize: compact ? 14 : 16, color: '#22c55e', fontWeight: 700 }}>
            {confidenceDelta.highConfidenceDecisions}
          </div>
        </div>
        <div
          style={{
            padding: compact ? '6px 8px' : '8px 12px',
            background: 'rgba(239, 68, 68, 0.1)',
            borderRadius: 4,
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: compact ? 7 : 8, color: '#888', textTransform: 'uppercase' }}>
            Low Conf
          </div>
          <div style={{ fontSize: compact ? 14 : 16, color: '#ef4444', fontWeight: 700 }}>
            {confidenceDelta.lowConfidenceDecisions}
          </div>
        </div>
      </div>
    </div>
  );
}

interface CoherenceSectionProps {
  readonly coherence: StrategicCoherenceMetrics;
  readonly compact?: boolean;
}

function CoherenceSection({ coherence, compact = false }: CoherenceSectionProps) {
  const color = COHERENCE_COLORS[coherence.coherenceLabel];

  const profileDescriptions: Record<string, string> = {
    LAG: 'Loose Aggressive',
    TAG: 'Tight Aggressive',
    LAP: 'Loose Passive',
    TAP: 'Tight Passive',
    mixed: 'Mixed Style',
  };

  return (
    <div style={{ marginBottom: compact ? 12 : 16 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: compact ? 6 : 8,
        }}
      >
        <span
          style={{
            fontSize: compact ? 9 : 10,
            color: '#10b981',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          Strategic Coherence
        </span>
        <span
          style={{
            padding: '2px 8px',
            background: `${color}20`,
            borderRadius: 4,
            fontSize: compact ? 9 : 10,
            color: color,
            fontWeight: 700,
            textTransform: 'uppercase',
          }}
        >
          {coherence.coherenceLabel}
        </span>
        <span
          style={{
            marginLeft: 'auto',
            padding: '2px 6px',
            background: 'rgba(100, 100, 100, 0.2)',
            borderRadius: 3,
            fontSize: compact ? 8 : 9,
            color: '#d0d0d0',
            fontWeight: 600,
          }}
        >
          {coherence.strategicProfile} - {profileDescriptions[coherence.strategicProfile]}
        </span>
      </div>
      <div
        style={{
          fontSize: compact ? 11 : 12,
          color: '#d0d0d0',
          lineHeight: 1.5,
          marginBottom: compact ? 6 : 8,
        }}
      >
        {coherence.coherenceDescription}
      </div>
      <div style={{ display: 'flex', gap: compact ? 6 : 8 }}>
        <div
          style={{
            flex: 1,
            padding: compact ? '6px 8px' : '8px 12px',
            background: 'rgba(16, 185, 129, 0.1)',
            borderRadius: 4,
          }}
        >
          <div style={{ fontSize: compact ? 7 : 8, color: '#888', textTransform: 'uppercase' }}>
            Coherence Score
          </div>
          <div style={{ fontSize: compact ? 14 : 16, color: color, fontWeight: 700 }}>
            {coherence.coherenceScore}%
          </div>
        </div>
        <div
          style={{
            flex: 1,
            padding: compact ? '6px 8px' : '8px 12px',
            background: 'rgba(100, 100, 100, 0.1)',
            borderRadius: 4,
          }}
        >
          <div style={{ fontSize: compact ? 7 : 8, color: '#888', textTransform: 'uppercase' }}>
            Alignment
          </div>
          <div style={{ fontSize: compact ? 12 : 14, color: '#d0d0d0', fontWeight: 600 }}>
            {coherence.alignmentConsistency}%
          </div>
        </div>
        <div
          style={{
            flex: 1,
            padding: compact ? '6px 8px' : '8px 12px',
            background: 'rgba(100, 100, 100, 0.1)',
            borderRadius: 4,
          }}
        >
          <div style={{ fontSize: compact ? 7 : 8, color: '#888', textTransform: 'uppercase' }}>
            Style
          </div>
          <div style={{ fontSize: compact ? 12 : 14, color: '#d0d0d0', fontWeight: 600 }}>
            {coherence.styleConsistency}%
          </div>
        </div>
        <div
          style={{
            flex: 1,
            padding: compact ? '6px 8px' : '8px 12px',
            background: 'rgba(100, 100, 100, 0.1)',
            borderRadius: 4,
          }}
        >
          <div style={{ fontSize: compact ? 7 : 8, color: '#888', textTransform: 'uppercase' }}>
            Pressure Resp
          </div>
          <div style={{ fontSize: compact ? 12 : 14, color: '#d0d0d0', fontWeight: 600 }}>
            {coherence.pressureResponseConsistency}%
          </div>
        </div>
      </div>
    </div>
  );
}

interface HeroVsFieldSectionProps {
  readonly comparison: HeroVsFieldComparison;
  readonly compact?: boolean;
}

function HeroVsFieldSection({ comparison, compact = false }: HeroVsFieldSectionProps) {
  return (
    <div style={{ marginBottom: compact ? 12 : 16 }}>
      <div
        style={{
          fontSize: compact ? 9 : 10,
          color: '#f472b6',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          marginBottom: compact ? 6 : 8,
        }}
      >
        Hero vs Field Comparison
      </div>
      <div
        style={{
          fontSize: compact ? 11 : 12,
          color: '#d0d0d0',
          lineHeight: 1.5,
          marginBottom: compact ? 8 : 10,
          padding: compact ? '6px 8px' : '8px 12px',
          background: 'rgba(244, 114, 182, 0.1)',
          borderRadius: 4,
        }}
      >
        {comparison.comparisonSummary}
      </div>
      <div style={{ display: 'flex', gap: compact ? 8 : 12, marginBottom: compact ? 8 : 10 }}>
        {/* Hero Stats */}
        <div
          style={{
            flex: 1,
            padding: compact ? '8px' : '10px',
            background: 'rgba(244, 114, 182, 0.08)',
            border: '1px solid rgba(244, 114, 182, 0.2)',
            borderRadius: 4,
          }}
        >
          <div
            style={{
              fontSize: compact ? 8 : 9,
              color: '#f472b6',
              fontWeight: 700,
              textTransform: 'uppercase',
              marginBottom: compact ? 6 : 8,
            }}
          >
            Hero Stats
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
            <div style={{ fontSize: compact ? 9 : 10, color: '#888' }}>Decisions:</div>
            <div style={{ fontSize: compact ? 9 : 10, color: '#e0e0e0' }}>
              {comparison.heroStats.totalDecisions}
            </div>
            <div style={{ fontSize: compact ? 9 : 10, color: '#888' }}>Aggression:</div>
            <div style={{ fontSize: compact ? 9 : 10, color: '#e0e0e0' }}>
              {Math.round(comparison.heroStats.aggressionRate * 100)}%
            </div>
            <div style={{ fontSize: compact ? 9 : 10, color: '#888' }}>Alignment:</div>
            <div style={{ fontSize: compact ? 9 : 10, color: '#e0e0e0' }}>
              {Math.round(comparison.heroStats.alignmentRate * 100)}%
            </div>
            <div style={{ fontSize: compact ? 9 : 10, color: '#888' }}>Optimal:</div>
            <div style={{ fontSize: compact ? 9 : 10, color: '#22c55e' }}>
              {comparison.heroStats.optimalDecisions}
            </div>
          </div>
        </div>
        {/* Field Stats */}
        <div
          style={{
            flex: 1,
            padding: compact ? '8px' : '10px',
            background: 'rgba(100, 100, 100, 0.08)',
            border: '1px solid rgba(100, 100, 100, 0.2)',
            borderRadius: 4,
          }}
        >
          <div
            style={{
              fontSize: compact ? 8 : 9,
              color: '#888',
              fontWeight: 700,
              textTransform: 'uppercase',
              marginBottom: compact ? 6 : 8,
            }}
          >
            Field Stats
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
            <div style={{ fontSize: compact ? 9 : 10, color: '#666' }}>Decisions:</div>
            <div style={{ fontSize: compact ? 9 : 10, color: '#aaa' }}>
              {comparison.fieldStats.totalDecisions}
            </div>
            <div style={{ fontSize: compact ? 9 : 10, color: '#666' }}>Aggression:</div>
            <div style={{ fontSize: compact ? 9 : 10, color: '#aaa' }}>
              {Math.round(comparison.fieldStats.aggressionRate * 100)}%
            </div>
            <div style={{ fontSize: compact ? 9 : 10, color: '#666' }}>Alignment:</div>
            <div style={{ fontSize: compact ? 9 : 10, color: '#aaa' }}>
              {Math.round(comparison.fieldStats.alignmentRate * 100)}%
            </div>
            <div style={{ fontSize: compact ? 9 : 10, color: '#666' }}>Optimal:</div>
            <div style={{ fontSize: compact ? 9 : 10, color: '#aaa' }}>
              {comparison.fieldStats.optimalDecisions}
            </div>
          </div>
        </div>
      </div>
      {/* Advantages/Disadvantages */}
      <div style={{ display: 'flex', gap: compact ? 8 : 12 }}>
        {comparison.heroAdvantages.length > 0 && (
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: compact ? 8 : 9,
                color: '#22c55e',
                fontWeight: 600,
                textTransform: 'uppercase',
                marginBottom: 4,
              }}
            >
              Advantages
            </div>
            {comparison.heroAdvantages.map((adv, idx) => (
              <div
                key={idx}
                style={{
                  fontSize: compact ? 9 : 10,
                  color: '#9ca3af',
                  marginBottom: 2,
                }}
              >
                + {adv}
              </div>
            ))}
          </div>
        )}
        {comparison.heroDisadvantages.length > 0 && (
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: compact ? 8 : 9,
                color: '#ef4444',
                fontWeight: 600,
                textTransform: 'uppercase',
                marginBottom: 4,
              }}
            >
              Areas to Improve
            </div>
            {comparison.heroDisadvantages.map((dis, idx) => (
              <div
                key={idx}
                style={{
                  fontSize: compact ? 9 : 10,
                  color: '#9ca3af',
                  marginBottom: 2,
                }}
              >
                - {dis}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface BettingPatternSectionProps {
  readonly pattern: BettingPattern;
  readonly compact?: boolean;
}

function BettingPatternSection({ pattern, compact = false }: BettingPatternSectionProps) {
  const patternColors: Record<string, string> = {
    'value-heavy': '#22c55e',
    'bluff-heavy': '#ef4444',
    balanced: '#3b82f6',
    polarized: '#f59e0b',
    merged: '#8b5cf6',
  };
  const color = patternColors[pattern.patternType];

  return (
    <div style={{ marginBottom: compact ? 12 : 16 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: compact ? 6 : 8,
        }}
      >
        <span
          style={{
            fontSize: compact ? 9 : 10,
            color: '#fbbf24',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          Detected Betting Pattern
        </span>
        <span
          style={{
            padding: '2px 8px',
            background: `${color}20`,
            borderRadius: 4,
            fontSize: compact ? 9 : 10,
            color: color,
            fontWeight: 700,
            textTransform: 'uppercase',
          }}
        >
          {pattern.patternType}
        </span>
        <span
          style={{
            marginLeft: 'auto',
            fontSize: compact ? 8 : 9,
            color: '#888',
            textTransform: 'uppercase',
          }}
        >
          {pattern.confidence} confidence
        </span>
      </div>
      <div
        style={{
          fontSize: compact ? 11 : 12,
          color: '#d0d0d0',
          lineHeight: 1.5,
          marginBottom: compact ? 6 : 8,
        }}
      >
        {pattern.patternDescription}
      </div>
      {pattern.supportingEvidence.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {pattern.supportingEvidence.map((evidence, idx) => (
            <span
              key={idx}
              style={{
                padding: '2px 6px',
                background: 'rgba(100, 100, 100, 0.2)',
                borderRadius: 3,
                fontSize: compact ? 8 : 9,
                color: '#aaa',
              }}
            >
              {evidence}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

interface LeaksSectionProps {
  readonly leaks: readonly PotentialLeak[];
  readonly compact?: boolean;
}

function LeaksSection({ leaks, compact = false }: LeaksSectionProps) {
  if (leaks.length === 0) {
    return (
      <div style={{ marginBottom: compact ? 12 : 16 }}>
        <div
          style={{
            fontSize: compact ? 9 : 10,
            color: '#94a3b8',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: compact ? 6 : 8,
          }}
        >
          Potential Leaks Analysis
        </div>
        <div
          style={{
            fontSize: compact ? 10 : 11,
            color: '#22c55e',
            fontStyle: 'italic',
            padding: compact ? '6px 8px' : '8px 12px',
            background: 'rgba(34, 197, 94, 0.1)',
            borderRadius: 4,
          }}
        >
          No significant leaks detected in this hand
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: compact ? 12 : 16 }}>
      <div
        style={{
          fontSize: compact ? 9 : 10,
          color: '#94a3b8',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          marginBottom: compact ? 6 : 8,
        }}
      >
        Potential Leaks Analysis ({leaks.length} identified)
      </div>
      {leaks.map((leak, idx) => {
        const severityColor = LEAK_SEVERITY_COLORS[leak.severity];
        return (
          <div
            key={idx}
            style={{
              marginBottom: compact ? 8 : 10,
              padding: compact ? '8px 10px' : '10px 12px',
              background: `${severityColor}10`,
              borderLeft: `3px solid ${severityColor}`,
              borderRadius: '0 4px 4px 0',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span
                style={{
                  fontSize: compact ? 10 : 11,
                  fontWeight: 700,
                  color: severityColor,
                }}
              >
                {leak.leakType}
              </span>
              <span
                style={{
                  padding: '1px 4px',
                  background: `${severityColor}20`,
                  borderRadius: 2,
                  fontSize: compact ? 7 : 8,
                  color: severityColor,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                }}
              >
                {leak.severity}
              </span>
              <span
                style={{
                  marginLeft: 'auto',
                  fontSize: compact ? 8 : 9,
                  color: '#888',
                }}
              >
                {leak.frequency}% frequency
              </span>
            </div>
            <div
              style={{
                fontSize: compact ? 10 : 11,
                color: '#9ca3af',
                marginBottom: 6,
              }}
            >
              {leak.description}
            </div>
            <div
              style={{
                fontSize: compact ? 9 : 10,
                color: '#6b7280',
                fontStyle: 'italic',
                paddingTop: 4,
                borderTop: '1px solid rgba(100, 100, 100, 0.2)',
              }}
            >
              Suggestion: {leak.suggestion}
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface StreetAnalysisSectionProps {
  readonly analyses: readonly StreetAnalysis[];
  readonly compact?: boolean;
}

function StreetAnalysisSection({ analyses, compact = false }: StreetAnalysisSectionProps) {
  if (analyses.length === 0) return null;

  return (
    <div style={{ marginBottom: compact ? 12 : 16 }}>
      <div
        style={{
          fontSize: compact ? 9 : 10,
          color: '#64748b',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          marginBottom: compact ? 6 : 8,
        }}
      >
        Street-by-Street Analysis
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 6 : 8 }}>
        {analyses.map((analysis, idx) => (
          <div
            key={idx}
            style={{
              padding: compact ? '6px 10px' : '8px 12px',
              background: 'rgba(100, 116, 139, 0.1)',
              borderRadius: 4,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span
                style={{
                  fontSize: compact ? 10 : 11,
                  fontWeight: 700,
                  color: '#e0e0e0',
                  minWidth: 60,
                }}
              >
                {analysis.street}
              </span>
              <span
                style={{
                  fontSize: compact ? 8 : 9,
                  color: '#888',
                }}
              >
                {analysis.decisionCount} decisions
                {analysis.heroDecisionCount > 0 && ` (${analysis.heroDecisionCount} hero)`}
              </span>
              <span
                style={{
                  marginLeft: 'auto',
                  fontSize: compact ? 8 : 9,
                  color:
                    analysis.aggressionRate > 0.5
                      ? '#ef4444'
                      : analysis.aggressionRate < 0.2
                      ? '#22c55e'
                      : '#f59e0b',
                }}
              >
                {Math.round(analysis.aggressionRate * 100)}% aggression
              </span>
            </div>
            <div
              style={{
                fontSize: compact ? 10 : 11,
                color: '#9ca3af',
                marginBottom: analysis.keyMoments.length > 0 ? 4 : 0,
              }}
            >
              {analysis.streetSummary}
            </div>
            {analysis.keyMoments.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {analysis.keyMoments.map((moment, mIdx) => (
                  <span
                    key={mIdx}
                    style={{
                      padding: '1px 4px',
                      background: 'rgba(100, 100, 100, 0.2)',
                      borderRadius: 2,
                      fontSize: compact ? 7 : 8,
                      color: '#888',
                    }}
                  >
                    {moment}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

interface TurningPointsSectionProps {
  readonly turningPoints: DecisionTimeline;
  readonly compact?: boolean;
}

function TurningPointsSection({ turningPoints, compact = false }: TurningPointsSectionProps) {
  if (turningPoints.length === 0) return null;

  return (
    <div style={{ marginBottom: compact ? 12 : 16 }}>
      <div
        style={{
          fontSize: compact ? 9 : 10,
          color: '#f43f5e',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          marginBottom: compact ? 6 : 8,
        }}
      >
        Turning Points ({turningPoints.length})
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 4 : 6 }}>
        {turningPoints.slice(0, 5).map((tp, idx) => (
          <div
            key={idx}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: compact ? '4px 8px' : '6px 10px',
              background: tp.isHeroDecision
                ? 'rgba(244, 63, 94, 0.15)'
                : 'rgba(244, 63, 94, 0.08)',
              borderLeft: tp.isHeroDecision
                ? '3px solid #f43f5e'
                : '3px solid rgba(244, 63, 94, 0.4)',
              borderRadius: '0 4px 4px 0',
            }}
          >
            <span
              style={{
                fontSize: compact ? 8 : 9,
                color: '#888',
                minWidth: 50,
              }}
            >
              {tp.street}
            </span>
            <span
              style={{
                fontSize: compact ? 10 : 11,
                fontWeight: 600,
                color: tp.isHeroDecision ? '#f472b6' : '#e0e0e0',
              }}
            >
              {tp.playerName}
            </span>
            <span
              style={{
                padding: '1px 6px',
                background:
                  tp.actionClass === 'all-in'
                    ? 'rgba(239, 68, 68, 0.2)'
                    : tp.actionClass === 'raise'
                    ? 'rgba(245, 158, 11, 0.2)'
                    : 'rgba(100, 100, 100, 0.2)',
                borderRadius: 3,
                fontSize: compact ? 8 : 9,
                color:
                  tp.actionClass === 'all-in'
                    ? '#ef4444'
                    : tp.actionClass === 'raise'
                    ? '#f59e0b'
                    : '#aaa',
                fontWeight: 600,
                textTransform: 'uppercase',
              }}
            >
              {tp.actionClass}
            </span>
            {tp.amount !== undefined && (
              <span
                style={{
                  fontSize: compact ? 9 : 10,
                  color: '#d0d0d0',
                }}
              >
                ${tp.amount}
              </span>
            )}
            <span
              style={{
                marginLeft: 'auto',
                fontSize: compact ? 8 : 9,
                color: '#666',
              }}
            >
              {tp.narrative.shortDescription}
            </span>
          </div>
        ))}
        {turningPoints.length > 5 && (
          <div
            style={{
              fontSize: compact ? 9 : 10,
              color: '#666',
              fontStyle: 'italic',
              textAlign: 'center',
            }}
          >
            +{turningPoints.length - 5} more turning points
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// DecisionInsightPanel - Main Component
// ============================================================================

export function DecisionInsightPanel({
  events,
  players,
  currentIndex,
  title = 'Decision Insights',
  compact = false,
}: DecisionInsightPanelProps) {
  // ========================================
  // 边界检查：无事件时显示空状态
  // ========================================
  if (events.length === 0) {
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
        No hand data available for insights
      </div>
    );
  }

  // ========================================
  // 从 DecisionTimelineModel 构建数据
  // ========================================
  const playerInfos: PlayerInfo[] = players.map(p => ({
    id: p.id,
    name: p.name,
    seat: p.seat,
  }));

  const playerNames = buildPlayerNameMap(playerInfos);
  const timeline = buildDecisionTimeline(events, playerInfos, 0);

  // ========================================
  // 从 DecisionTimeline 派生聚合洞察
  // ========================================
  const pressureOverview = derivePressureOverview(timeline, currentIndex);
  const playerTendencies = derivePlayerTendencies(timeline, currentIndex, playerNames);
  const polarizationSignals = derivePolarizationSignals(timeline, currentIndex);
  const riskBalances = deriveRiskCommitmentBalance(timeline, currentIndex);
  const keyInsights = generateInsights(
    pressureOverview,
    playerTendencies,
    polarizationSignals,
    riskBalances
  );

  // ========================================
  // 从 DecisionTimelineQueries 派生扩展指标
  // ========================================
  const relevantTimeline = timeline.filter(d => d.index <= currentIndex);
  const volatilityMetrics = calculateVolatilityMetrics(relevantTimeline);
  const riskEscalation = calculateRiskEscalationCurve(relevantTimeline);
  const commitmentMomentum = calculateCommitmentMomentum(relevantTimeline);
  const confidenceDelta = calculateConfidenceDeltaMetrics(relevantTimeline);
  const strategicCoherence = calculateStrategicCoherence(relevantTimeline);
  const heroVsField = getHeroVsFieldComparison(relevantTimeline);
  const bettingPattern = detectBettingPattern(relevantTimeline);
  const potentialLeaks = detectPotentialLeaks(relevantTimeline);
  const streetAnalyses = analyzeByStreet(relevantTimeline);
  const turningPoints = getTurningPointDecisions(relevantTimeline);

  // ========================================
  // 纯展示渲染
  // ========================================
  return (
    <div
      style={{
        background: 'rgba(167, 139, 250, 0.08)',
        border: '1px solid rgba(167, 139, 250, 0.2)',
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
          borderBottom: '1px solid rgba(167, 139, 250, 0.15)',
          background: 'rgba(167, 139, 250, 0.05)',
        }}
      >
        <span
          style={{
            fontSize: compact ? 9 : 10,
            color: '#a78bfa',
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
            color: '#7c3aed',
            padding: '2px 6px',
            background: 'rgba(167, 139, 250, 0.15)',
            borderRadius: 3,
          }}
        >
          Observational Only
        </span>
      </div>

      <div style={{ padding: compact ? '10px 12px' : '14px 16px' }}>
        {/* Original Insight Sections */}
        <PressureSection pressure={pressureOverview} compact={compact} />
        <TendenciesSection tendencies={playerTendencies} compact={compact} />
        <PolarizationSection signals={polarizationSignals} compact={compact} />
        <RiskBalanceSection balances={riskBalances} compact={compact} />
        <InsightsSection insights={keyInsights} compact={compact} />

        {/* Extended Insight Sections (Feature Expansion) */}
        {relevantTimeline.length >= 2 && (
          <>
            <div
              style={{
                margin: compact ? '12px 0' : '16px 0',
                borderTop: '1px solid rgba(167, 139, 250, 0.15)',
                paddingTop: compact ? 12 : 16,
              }}
            >
              <div
                style={{
                  fontSize: compact ? 8 : 9,
                  color: '#a78bfa',
                  textTransform: 'uppercase',
                  letterSpacing: '1px',
                  marginBottom: compact ? 10 : 14,
                  fontWeight: 600,
                }}
              >
                Advanced Analytics
              </div>
              <VolatilitySection volatility={volatilityMetrics} compact={compact} />
              <RiskEscalationSection riskCurve={riskEscalation} compact={compact} />
              <MomentumSection momentum={commitmentMomentum} compact={compact} />
              <ConfidenceDeltaSection confidenceDelta={confidenceDelta} compact={compact} />
              <CoherenceSection coherence={strategicCoherence} compact={compact} />
            </div>

            <div
              style={{
                margin: compact ? '12px 0' : '16px 0',
                borderTop: '1px solid rgba(167, 139, 250, 0.15)',
                paddingTop: compact ? 12 : 16,
              }}
            >
              <div
                style={{
                  fontSize: compact ? 8 : 9,
                  color: '#a78bfa',
                  textTransform: 'uppercase',
                  letterSpacing: '1px',
                  marginBottom: compact ? 10 : 14,
                  fontWeight: 600,
                }}
              >
                Pattern & Comparative Analysis
              </div>
              <HeroVsFieldSection comparison={heroVsField} compact={compact} />
              <BettingPatternSection pattern={bettingPattern} compact={compact} />
              <LeaksSection leaks={potentialLeaks} compact={compact} />
            </div>

            <div
              style={{
                margin: compact ? '12px 0' : '16px 0',
                borderTop: '1px solid rgba(167, 139, 250, 0.15)',
                paddingTop: compact ? 12 : 16,
              }}
            >
              <div
                style={{
                  fontSize: compact ? 8 : 9,
                  color: '#a78bfa',
                  textTransform: 'uppercase',
                  letterSpacing: '1px',
                  marginBottom: compact ? 10 : 14,
                  fontWeight: 600,
                }}
              >
                Timeline Analysis
              </div>
              <StreetAnalysisSection analyses={streetAnalyses} compact={compact} />
              <TurningPointsSection turningPoints={turningPoints} compact={compact} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// 导出辅助函数（供测试或其他组件使用）
// ============================================================================

export {
  derivePressureOverview,
  derivePlayerTendencies,
  derivePolarizationSignals,
  deriveRiskCommitmentBalance,
  generateInsights,
};

// 导出类型供外部使用
export type {
  SnapshotPlayerInfo,
  PressureOverview,
  PlayerTendency,
  PolarizationSignal,
  RiskCommitmentBalance,
  InsightItem,
  DecisionInsightPanelProps,
};
