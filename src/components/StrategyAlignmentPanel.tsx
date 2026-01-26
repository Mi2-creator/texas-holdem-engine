// ============================================================================
// FROZEN - LEGACY CODE - DO NOT MODIFY
// ============================================================================
// This file is part of the training/coaching system that is now deprecated.
// Do NOT extend, refactor, or build upon this code.
//
// Frozen as of: Phase 2 Freeze (Pokerrrr2-style refactor)
// Reason: Training/analysis features are legacy; focus is on core poker table UI
// ============================================================================

// ============================================================================
// StrategyAlignmentPanel - Strategy Alignment Analysis (Read-Only UI)
// ============================================================================
//
// 【Post-Freeze Extension】Replay Architecture Freeze Declaration v1.0 Compliant
// 【Post-Model Integration】Consumes DecisionTimelineModel for consistency
//
// 层级: UI Layer (纯展示)
// 职责: 对比玩家实际决策与抽象策略基线（GTO/启发式/均衡代理）
//
// 数据流:
//   events + players → DecisionTimelineModel → DecisionTimeline → Alignment View
//
// 重要约束:
//   - 不引入任何回放逻辑或状态变更
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
  getDecisionAtIndex,
  type EventInfo,
  type PlayerInfo,
  type DecisionPoint,
  type DecisionTimeline,
  type AlignmentLabel,
  type ConfidenceLevel,
  type ActionClass,
} from '../models/DecisionTimelineModel';

import {
  calculateStrategicCoherence,
  getHeroVsFieldComparison,
  getOptimalDecisions,
  getQuestionableDecisions,
  getTurningPointDecisions,
  detectPotentialLeaks,
  type StrategicCoherenceMetrics,
  type HeroVsFieldComparison,
  type PotentialLeak,
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
 * StrategyAlignmentPanel Props
 */
interface StrategyAlignmentPanelProps {
  readonly events: readonly EventInfo[];
  readonly players: readonly SnapshotPlayerInfo[];
  readonly currentIndex: number;
  readonly heroSeat: number;
  readonly title?: string;
  readonly compact?: boolean;
}

// ============================================================================
// 常量
// ============================================================================

const ALIGNMENT_COLORS: Record<AlignmentLabel, string> = {
  'Aligned': '#22c55e',
  'Deviates': '#f59e0b',
  'High-risk deviation': '#ef4444',
};

const CONFIDENCE_COLORS: Record<ConfidenceLevel, string> = {
  low: '#6b7280',
  medium: '#f59e0b',
  high: '#22c55e',
};

// ============================================================================
// Sub-components（纯函数组件）
// ============================================================================

interface MetricBoxProps {
  readonly label: string;
  readonly value: string;
  readonly compact?: boolean;
}

function MetricBox({ label, value, compact = false }: MetricBoxProps) {
  return (
    <div
      style={{
        padding: compact ? '4px 6px' : '6px 8px',
        background: 'rgba(0, 0, 0, 0.2)',
        borderRadius: 4,
        flex: 1,
      }}
    >
      <div
        style={{
          fontSize: compact ? 7 : 8,
          color: '#666',
          textTransform: 'uppercase',
          marginBottom: 2,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: compact ? 10 : 11,
          color: '#d0d0d0',
          fontWeight: 600,
        }}
      >
        {value}
      </div>
    </div>
  );
}

// ============================================================================
// Extended Alignment Diagnostics (Feature Expansion)
// ============================================================================

const COHERENCE_COLORS: Record<string, string> = {
  'highly coherent': '#22c55e',
  coherent: '#3b82f6',
  mixed: '#f59e0b',
  incoherent: '#ef4444',
};

const PROFILE_DESCRIPTIONS: Record<string, string> = {
  LAG: 'Loose Aggressive',
  TAG: 'Tight Aggressive',
  LAP: 'Loose Passive',
  TAP: 'Tight Passive',
  mixed: 'Mixed Style',
};

interface AlignmentHistoryViewProps {
  readonly timeline: DecisionTimeline;
  readonly heroSeat: number;
  readonly compact?: boolean;
}

function AlignmentHistoryView({
  timeline,
  heroSeat,
  compact = false,
}: AlignmentHistoryViewProps) {
  const heroDecisions = timeline.filter(d => d.isHeroDecision);

  if (heroDecisions.length === 0) {
    return (
      <div
        style={{
          fontSize: compact ? 10 : 11,
          color: '#666',
          fontStyle: 'italic',
          padding: compact ? '6px 8px' : '8px 10px',
          background: 'rgba(100, 100, 100, 0.1)',
          borderRadius: 4,
        }}
      >
        No hero decisions yet
      </div>
    );
  }

  // Count alignment labels
  const counts: Record<AlignmentLabel, number> = {
    'Aligned': 0,
    'Deviates': 0,
    'High-risk deviation': 0,
  };

  for (const d of heroDecisions) {
    counts[d.alignment.alignmentLabel]++;
  }

  return (
    <div style={{ marginBottom: compact ? 12 : 16 }}>
      <div
        style={{
          fontSize: compact ? 9 : 10,
          color: '#f472b6',
          fontWeight: 700,
          textTransform: 'uppercase',
          marginBottom: compact ? 6 : 8,
        }}
      >
        Hero Alignment History ({heroDecisions.length} decisions)
      </div>

      {/* Alignment Distribution */}
      <div
        style={{
          display: 'flex',
          height: compact ? 20 : 24,
          borderRadius: 4,
          overflow: 'hidden',
          marginBottom: compact ? 8 : 12,
        }}
      >
        {counts['Aligned'] > 0 && (
          <div
            style={{
              flex: counts['Aligned'],
              background: '#22c55e',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: compact ? 8 : 9,
              color: '#fff',
              fontWeight: 600,
            }}
          >
            ALIGNED ({counts['Aligned']})
          </div>
        )}
        {counts['Deviates'] > 0 && (
          <div
            style={{
              flex: counts['Deviates'],
              background: '#f59e0b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: compact ? 8 : 9,
              color: '#fff',
              fontWeight: 600,
            }}
          >
            DEVIATES ({counts['Deviates']})
          </div>
        )}
        {counts['High-risk deviation'] > 0 && (
          <div
            style={{
              flex: counts['High-risk deviation'],
              background: '#ef4444',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: compact ? 8 : 9,
              color: '#fff',
              fontWeight: 600,
            }}
          >
            HIGH-RISK ({counts['High-risk deviation']})
          </div>
        )}
      </div>

      {/* Recent Decisions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 4 : 6 }}>
        {heroDecisions.slice(-5).map((d, idx) => {
          const alignmentColor = ALIGNMENT_COLORS[d.alignment.alignmentLabel];
          const confidenceColor = CONFIDENCE_COLORS[d.alignment.confidence];

          return (
            <div
              key={idx}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: compact ? '4px 8px' : '6px 10px',
                background: 'rgba(236, 72, 153, 0.08)',
                borderLeft: `3px solid ${alignmentColor}`,
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
                {d.street}
              </span>
              <span
                style={{
                  padding: '2px 6px',
                  background: 'rgba(236, 72, 153, 0.2)',
                  borderRadius: 3,
                  fontSize: compact ? 8 : 9,
                  color: '#f472b6',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                }}
              >
                {d.actionClass}
              </span>
              <span
                style={{
                  padding: '1px 4px',
                  background: `${alignmentColor}20`,
                  borderRadius: 2,
                  fontSize: compact ? 7 : 8,
                  color: alignmentColor,
                  fontWeight: 600,
                }}
              >
                {d.alignment.alignmentLabel}
              </span>
              <span
                style={{
                  marginLeft: 'auto',
                  fontSize: compact ? 8 : 9,
                  color: confidenceColor,
                }}
              >
                {d.alignment.confidence}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface StrategicProfileViewProps {
  readonly coherence: StrategicCoherenceMetrics;
  readonly compact?: boolean;
}

function StrategicProfileView({
  coherence,
  compact = false,
}: StrategicProfileViewProps) {
  const color = COHERENCE_COLORS[coherence.coherenceLabel];

  return (
    <div style={{ marginBottom: compact ? 12 : 16 }}>
      <div
        style={{
          fontSize: compact ? 9 : 10,
          color: '#10b981',
          fontWeight: 700,
          textTransform: 'uppercase',
          marginBottom: compact ? 6 : 8,
        }}
      >
        Strategic Profile
      </div>

      <div
        style={{
          display: 'flex',
          gap: compact ? 8 : 12,
          marginBottom: compact ? 8 : 10,
        }}
      >
        {/* Profile Badge */}
        <div
          style={{
            padding: compact ? '10px 14px' : '12px 18px',
            background: `${color}15`,
            border: `2px solid ${color}`,
            borderRadius: 8,
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontSize: compact ? 16 : 20,
              fontWeight: 700,
              color: color,
              marginBottom: 2,
            }}
          >
            {coherence.strategicProfile}
          </div>
          <div
            style={{
              fontSize: compact ? 8 : 9,
              color: '#888',
            }}
          >
            {PROFILE_DESCRIPTIONS[coherence.strategicProfile]}
          </div>
        </div>

        {/* Coherence Score */}
        <div
          style={{
            flex: 1,
            padding: compact ? '8px' : '10px',
            background: 'rgba(16, 185, 129, 0.1)',
            borderRadius: 6,
          }}
        >
          <div
            style={{
              fontSize: compact ? 7 : 8,
              color: '#888',
              textTransform: 'uppercase',
              marginBottom: 4,
            }}
          >
            Coherence Score
          </div>
          <div
            style={{
              fontSize: compact ? 20 : 24,
              fontWeight: 700,
              color: color,
            }}
          >
            {coherence.coherenceScore}%
          </div>
          <div
            style={{
              fontSize: compact ? 9 : 10,
              color: '#9ca3af',
              marginTop: 2,
            }}
          >
            {coherence.coherenceLabel}
          </div>
        </div>
      </div>

      {/* Consistency Breakdown */}
      <div style={{ display: 'flex', gap: compact ? 6 : 8 }}>
        <div
          style={{
            flex: 1,
            padding: compact ? '6px 8px' : '8px 10px',
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
            padding: compact ? '6px 8px' : '8px 10px',
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
            padding: compact ? '6px 8px' : '8px 10px',
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

      {/* Description */}
      <div
        style={{
          marginTop: compact ? 8 : 10,
          fontSize: compact ? 10 : 11,
          color: '#9ca3af',
          fontStyle: 'italic',
          lineHeight: 1.5,
        }}
      >
        {coherence.coherenceDescription}
      </div>
    </div>
  );
}

interface DecisionQualityViewProps {
  readonly timeline: DecisionTimeline;
  readonly compact?: boolean;
}

function DecisionQualityView({
  timeline,
  compact = false,
}: DecisionQualityViewProps) {
  const heroDecisions = timeline.filter(d => d.isHeroDecision);
  const optimal = getOptimalDecisions(heroDecisions);
  const questionable = getQuestionableDecisions(heroDecisions);
  const turningPoints = getTurningPointDecisions(heroDecisions);
  const leaks = detectPotentialLeaks(timeline);

  const qualityScore = heroDecisions.length > 0
    ? Math.round(((optimal.length - questionable.length * 2) / heroDecisions.length) * 100 + 50)
    : 50;
  const clampedScore = Math.max(0, Math.min(100, qualityScore));

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
        Decision Quality Analysis
      </div>

      {/* Quality Score */}
      <div
        style={{
          display: 'flex',
          gap: compact ? 8 : 12,
          marginBottom: compact ? 10 : 14,
        }}
      >
        <div
          style={{
            flex: 1,
            padding: compact ? '8px 12px' : '10px 14px',
            background:
              clampedScore >= 70
                ? 'rgba(34, 197, 94, 0.1)'
                : clampedScore >= 40
                ? 'rgba(245, 158, 11, 0.1)'
                : 'rgba(239, 68, 68, 0.1)',
            borderRadius: 6,
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontSize: compact ? 7 : 8,
              color: '#888',
              textTransform: 'uppercase',
              marginBottom: 2,
            }}
          >
            Quality Score
          </div>
          <div
            style={{
              fontSize: compact ? 22 : 28,
              fontWeight: 700,
              color:
                clampedScore >= 70
                  ? '#22c55e'
                  : clampedScore >= 40
                  ? '#f59e0b'
                  : '#ef4444',
            }}
          >
            {clampedScore}
          </div>
        </div>
        <div
          style={{
            flex: 1,
            padding: compact ? '8px 12px' : '10px 14px',
            background: 'rgba(34, 197, 94, 0.1)',
            borderRadius: 6,
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontSize: compact ? 7 : 8,
              color: '#888',
              textTransform: 'uppercase',
              marginBottom: 2,
            }}
          >
            Optimal
          </div>
          <div
            style={{
              fontSize: compact ? 22 : 28,
              fontWeight: 700,
              color: '#22c55e',
            }}
          >
            {optimal.length}
          </div>
        </div>
        <div
          style={{
            flex: 1,
            padding: compact ? '8px 12px' : '10px 14px',
            background: 'rgba(239, 68, 68, 0.1)',
            borderRadius: 6,
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontSize: compact ? 7 : 8,
              color: '#888',
              textTransform: 'uppercase',
              marginBottom: 2,
            }}
          >
            Questionable
          </div>
          <div
            style={{
              fontSize: compact ? 22 : 28,
              fontWeight: 700,
              color: '#ef4444',
            }}
          >
            {questionable.length}
          </div>
        </div>
      </div>

      {/* Turning Points */}
      {turningPoints.length > 0 && (
        <div style={{ marginBottom: compact ? 8 : 10 }}>
          <div
            style={{
              fontSize: compact ? 8 : 9,
              color: '#888',
              marginBottom: compact ? 4 : 6,
            }}
          >
            Hero Turning Points: {turningPoints.length}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {turningPoints.slice(0, 4).map((tp, idx) => (
              <span
                key={idx}
                style={{
                  padding: '2px 6px',
                  background: 'rgba(244, 63, 94, 0.15)',
                  borderRadius: 3,
                  fontSize: compact ? 8 : 9,
                  color: '#f43f5e',
                }}
              >
                {tp.street}: {tp.actionClass}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Leaks Summary */}
      {leaks.length > 0 && (
        <div
          style={{
            padding: compact ? '6px 8px' : '8px 10px',
            background: 'rgba(239, 68, 68, 0.1)',
            borderLeft: '3px solid #ef4444',
            borderRadius: '0 4px 4px 0',
          }}
        >
          <div
            style={{
              fontSize: compact ? 8 : 9,
              color: '#ef4444',
              fontWeight: 600,
              marginBottom: 2,
            }}
          >
            {leaks.length} Potential Leak{leaks.length > 1 ? 's' : ''} Detected
          </div>
          <div
            style={{
              fontSize: compact ? 9 : 10,
              color: '#9ca3af',
            }}
          >
            {leaks.slice(0, 2).map(l => l.leakType).join(', ')}
            {leaks.length > 2 && '...'}
          </div>
        </div>
      )}

      {leaks.length === 0 && (
        <div
          style={{
            padding: compact ? '6px 8px' : '8px 10px',
            background: 'rgba(34, 197, 94, 0.1)',
            borderLeft: '3px solid #22c55e',
            borderRadius: '0 4px 4px 0',
            fontSize: compact ? 9 : 10,
            color: '#22c55e',
          }}
        >
          No significant leaks detected
        </div>
      )}
    </div>
  );
}

interface ExpectationVsRealityViewProps {
  readonly decision: DecisionPoint;
  readonly compact?: boolean;
}

function ExpectationVsRealityView({
  decision,
  compact = false,
}: ExpectationVsRealityViewProps) {
  const strategy = decision.alignment.strategyExpectation;
  const alignment = decision.alignment;
  const actual = decision.actionClass;
  const expected = strategy.expectedAction;
  const matched = actual === expected;

  return (
    <div style={{ marginBottom: compact ? 12 : 16 }}>
      <div
        style={{
          fontSize: compact ? 9 : 10,
          color: '#fbbf24',
          fontWeight: 700,
          textTransform: 'uppercase',
          marginBottom: compact ? 6 : 8,
        }}
      >
        Expectation vs Reality
      </div>

      <div
        style={{
          display: 'flex',
          gap: compact ? 8 : 12,
          marginBottom: compact ? 8 : 10,
        }}
      >
        {/* Expected */}
        <div
          style={{
            flex: 1,
            padding: compact ? '10px' : '12px',
            background: 'rgba(167, 139, 250, 0.1)',
            border: '1px solid rgba(167, 139, 250, 0.3)',
            borderRadius: 6,
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontSize: compact ? 8 : 9,
              color: '#a78bfa',
              textTransform: 'uppercase',
              marginBottom: compact ? 4 : 6,
            }}
          >
            Strategy Expected
          </div>
          <div
            style={{
              padding: '4px 12px',
              background: 'rgba(167, 139, 250, 0.2)',
              borderRadius: 4,
              fontSize: compact ? 12 : 14,
              fontWeight: 700,
              color: '#a78bfa',
              textTransform: 'uppercase',
              display: 'inline-block',
            }}
          >
            {expected}
          </div>
        </div>

        {/* Match Indicator */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            fontSize: compact ? 18 : 24,
            color: matched ? '#22c55e' : '#ef4444',
          }}
        >
          {matched ? '=' : '≠'}
        </div>

        {/* Actual */}
        <div
          style={{
            flex: 1,
            padding: compact ? '10px' : '12px',
            background: matched
              ? 'rgba(34, 197, 94, 0.1)'
              : 'rgba(239, 68, 68, 0.1)',
            border: `1px solid ${matched ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
            borderRadius: 6,
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontSize: compact ? 8 : 9,
              color: matched ? '#22c55e' : '#ef4444',
              textTransform: 'uppercase',
              marginBottom: compact ? 4 : 6,
            }}
          >
            Actual Choice
          </div>
          <div
            style={{
              padding: '4px 12px',
              background: matched
                ? 'rgba(34, 197, 94, 0.2)'
                : 'rgba(239, 68, 68, 0.2)',
              borderRadius: 4,
              fontSize: compact ? 12 : 14,
              fontWeight: 700,
              color: matched ? '#22c55e' : '#ef4444',
              textTransform: 'uppercase',
              display: 'inline-block',
            }}
          >
            {actual}
          </div>
        </div>
      </div>

      {/* Verdict */}
      <div
        style={{
          padding: compact ? '8px 10px' : '10px 12px',
          background: `${ALIGNMENT_COLORS[alignment.alignmentLabel]}15`,
          borderLeft: `3px solid ${ALIGNMENT_COLORS[alignment.alignmentLabel]}`,
          borderRadius: '0 4px 4px 0',
        }}
      >
        <div
          style={{
            fontSize: compact ? 9 : 10,
            color: ALIGNMENT_COLORS[alignment.alignmentLabel],
            fontWeight: 700,
            marginBottom: 4,
          }}
        >
          {alignment.alignmentLabel}
        </div>
        <div
          style={{
            fontSize: compact ? 10 : 11,
            color: '#9ca3af',
            lineHeight: 1.5,
          }}
        >
          {matched
            ? 'The chosen action aligns with equilibrium-based strategy expectations.'
            : `The ${actual} differs from the expected ${expected}. This may represent an exploitative adjustment or deviation from baseline strategy.`}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// StrategyAlignmentPanel - Main Component
// ============================================================================

export function StrategyAlignmentPanel({
  events,
  players,
  currentIndex,
  heroSeat,
  title = 'Strategy Alignment',
  compact = false,
}: StrategyAlignmentPanelProps) {
  // ========================================
  // 【防御入口】统一防御层 - 防止 undefined/null 访问
  // ========================================
  const safeEvents = Array.isArray(events) ? events : [];
  const safePlayers = Array.isArray(players) ? players : [];
  const safeCurrentIndex = typeof currentIndex === 'number' && currentIndex >= 0 ? currentIndex : 0;
  const safeHeroSeat = typeof heroSeat === 'number' && heroSeat >= 0 ? heroSeat : 0;

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
        No event data for strategy analysis
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

  const timeline = buildDecisionTimeline(safeEvents, playerInfos, safeHeroSeat);
  const decision = getDecisionAtIndex(timeline, safeCurrentIndex);

  // ========================================
  // 无决策点或非 Hero 决策时显示提示
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

  // Check if this is a hero decision
  if (!decision.isHeroDecision) {
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
        Current event is not a hero decision point (seat {safeHeroSeat})
      </div>
    );
  }

  // ========================================
  // 从 DecisionPoint.alignment 提取数据
  // ========================================
  const alignment = decision.alignment;
  const strategy = alignment.strategyExpectation;

  const alignmentColor = ALIGNMENT_COLORS[alignment.alignmentLabel];
  const confidenceColor = CONFIDENCE_COLORS[alignment.confidence];

  // ========================================
  // 纯展示渲染
  // ========================================
  return (
    <div
      style={{
        background: 'rgba(236, 72, 153, 0.08)',
        border: '1px solid rgba(236, 72, 153, 0.2)',
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
          borderBottom: '1px solid rgba(236, 72, 153, 0.15)',
          background: 'rgba(236, 72, 153, 0.05)',
        }}
      >
        <span
          style={{
            fontSize: compact ? 9 : 10,
            color: '#f472b6',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            fontWeight: 600,
          }}
        >
          {title}
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          <span
            style={{
              padding: '2px 6px',
              background: `${alignmentColor}20`,
              borderRadius: 3,
              fontSize: compact ? 8 : 9,
              color: alignmentColor,
              fontWeight: 700,
            }}
          >
            {alignment.alignmentLabel}
          </span>
          <span
            style={{
              padding: '2px 6px',
              background: `${confidenceColor}20`,
              borderRadius: 3,
              fontSize: compact ? 8 : 9,
              color: confidenceColor,
              fontWeight: 600,
              textTransform: 'uppercase',
            }}
          >
            {alignment.confidence}
          </span>
        </div>
      </div>

      <div style={{ padding: compact ? '10px 12px' : '14px 16px' }}>
        {/* Hero Action Summary */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: compact ? 10 : 14,
            padding: compact ? '8px 10px' : '10px 12px',
            background: 'rgba(236, 72, 153, 0.1)',
            borderRadius: 6,
          }}
        >
          <span
            style={{
              fontSize: compact ? 10 : 11,
              color: '#d0d0d0',
            }}
          >
            <strong style={{ color: '#f472b6' }}>{decision.playerName}</strong> chose
          </span>
          <span
            style={{
              padding: '3px 10px',
              background: '#f472b6',
              borderRadius: 4,
              fontSize: compact ? 10 : 11,
              fontWeight: 700,
              color: '#fff',
              textTransform: 'uppercase',
            }}
          >
            {decision.actionClass}
          </span>
          {decision.amount !== undefined && decision.actionClass !== 'fold' && decision.actionClass !== 'check' && (
            <span
              style={{
                fontSize: compact ? 10 : 11,
                color: '#e0e0e0',
                fontWeight: 600,
              }}
            >
              ${decision.amount}
            </span>
          )}
          <span
            style={{
              marginLeft: 'auto',
              fontSize: compact ? 9 : 10,
              color: '#888',
            }}
          >
            Expected: <strong style={{ color: '#a78bfa' }}>{strategy.expectedAction}</strong>
          </span>
        </div>

        {/* Strategy Metrics */}
        <div
          style={{
            display: 'flex',
            gap: compact ? 6 : 8,
            marginBottom: compact ? 10 : 14,
          }}
        >
          <MetricBox
            label="Pot Odds"
            value={`${(strategy.potOdds * 100).toFixed(0)}%`}
            compact={compact}
          />
          <MetricBox
            label="SPR"
            value={strategy.stackToPotRatio.toFixed(1)}
            compact={compact}
          />
          <MetricBox
            label="Action Density"
            value={`${(strategy.actionDensity * 100).toFixed(0)}%`}
            compact={compact}
          />
        </div>

        {/* Explanation */}
        <div
          style={{
            padding: compact ? '8px 10px' : '10px 12px',
            background: 'rgba(0, 0, 0, 0.15)',
            borderRadius: 6,
            borderLeft: `3px solid ${alignmentColor}`,
            marginBottom: compact ? 10 : 14,
          }}
        >
          <div
            style={{
              fontSize: compact ? 10 : 11,
              color: '#d0d0d0',
              lineHeight: 1.6,
            }}
          >
            {alignment.explanation}
          </div>
        </div>

        {/* Deviation Factors */}
        {alignment.deviationFactors.length > 0 && (
          <div>
            <div
              style={{
                fontSize: compact ? 8 : 9,
                color: '#888',
                textTransform: 'uppercase',
                marginBottom: compact ? 4 : 6,
              }}
            >
              Analysis Factors
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {alignment.deviationFactors.map((factor, idx) => (
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
                  {factor}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Strategy Reasoning */}
        <div
          style={{
            marginTop: compact ? 10 : 14,
            paddingTop: compact ? 8 : 10,
            borderTop: '1px solid rgba(236, 72, 153, 0.1)',
          }}
        >
          <div
            style={{
              fontSize: compact ? 8 : 9,
              color: '#888',
              textTransform: 'uppercase',
              marginBottom: compact ? 4 : 6,
            }}
          >
            Baseline Strategy Rationale
          </div>
          <div
            style={{
              fontSize: compact ? 9 : 10,
              color: '#9ca3af',
              lineHeight: 1.5,
              fontStyle: 'italic',
            }}
          >
            {strategy.reasoning}
          </div>
        </div>

        {/* ================================================================ */}
        {/* Extended Alignment Diagnostics (Feature Expansion Phase)        */}
        {/* ================================================================ */}

        {/* Expectation vs Reality */}
        <div
          style={{
            marginTop: compact ? 14 : 18,
            paddingTop: compact ? 12 : 16,
            borderTop: '1px solid rgba(236, 72, 153, 0.15)',
          }}
        >
          <ExpectationVsRealityView decision={decision} compact={compact} />
        </div>

        {/* Strategic Profile & Coherence */}
        {(() => {
          const coherence = calculateStrategicCoherence(timeline);
          return coherence.totalDecisions > 0 ? (
            <StrategicProfileView coherence={coherence} compact={compact} />
          ) : null;
        })()}

        {/* Decision Quality Analysis */}
        <DecisionQualityView timeline={timeline} compact={compact} />

        {/* Hero Alignment History */}
        <AlignmentHistoryView
          timeline={timeline}
          heroSeat={safeHeroSeat}
          compact={compact}
        />

        {/* Hero vs Field Comparison */}
        {(() => {
          const comparison = getHeroVsFieldComparison(timeline);
          if (comparison.heroDecisions === 0 || comparison.fieldDecisions === 0) {
            return null;
          }
          return (
            <div style={{ marginBottom: compact ? 12 : 16 }}>
              <div
                style={{
                  fontSize: compact ? 9 : 10,
                  color: '#60a5fa',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  marginBottom: compact ? 6 : 8,
                }}
              >
                Hero vs Field Summary
              </div>
              <div style={{ display: 'flex', gap: compact ? 6 : 8 }}>
                <div
                  style={{
                    flex: 1,
                    padding: compact ? '6px 8px' : '8px 10px',
                    background: 'rgba(96, 165, 250, 0.1)',
                    borderRadius: 4,
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: compact ? 7 : 8, color: '#888', textTransform: 'uppercase' }}>
                    Aggression
                  </div>
                  <div style={{ fontSize: compact ? 12 : 14, color: '#60a5fa', fontWeight: 600 }}>
                    {comparison.heroAggressionRate}% vs {comparison.fieldAggressionRate}%
                  </div>
                </div>
                <div
                  style={{
                    flex: 1,
                    padding: compact ? '6px 8px' : '8px 10px',
                    background: 'rgba(96, 165, 250, 0.1)',
                    borderRadius: 4,
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: compact ? 7 : 8, color: '#888', textTransform: 'uppercase' }}>
                    Alignment Rate
                  </div>
                  <div style={{ fontSize: compact ? 12 : 14, color: '#60a5fa', fontWeight: 600 }}>
                    {comparison.heroAlignmentRate}% vs {comparison.fieldAlignmentRate}%
                  </div>
                </div>
              </div>
              <div
                style={{
                  marginTop: compact ? 6 : 8,
                  fontSize: compact ? 9 : 10,
                  color: '#9ca3af',
                  fontStyle: 'italic',
                }}
              >
                {comparison.comparisonSummary}
              </div>
            </div>
          );
        })()}
      </div>

      {/* Footer */}
      <div
        style={{
          padding: compact ? '6px 10px' : '8px 12px',
          borderTop: '1px solid rgba(236, 72, 153, 0.1)',
          background: 'rgba(236, 72, 153, 0.03)',
          fontSize: compact ? 7 : 8,
          color: '#666',
          textAlign: 'center',
          fontStyle: 'italic',
        }}
      >
        Heuristic-based equilibrium proxy. For educational analysis only.
      </div>
    </div>
  );
}

// ============================================================================
// 导出类型供外部使用
// ============================================================================

export type {
  SnapshotPlayerInfo,
  StrategyAlignmentPanelProps,
};
