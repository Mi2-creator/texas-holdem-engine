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
// FocusedDecisionView - Consolidated Decision Analysis (Read-Only UI)
// ============================================================================
//
// 【UX Consolidation Phase】Replay Architecture Freeze Declaration v1.0 Compliant
//
// 层级: UI Layer (纯展示)
// 职责: 整合单个决策点的所有分析视角（叙事、洞察、比较、对齐）
//
// 数据流:
//   DecisionPoint (via getDecisionAtIndex) → Consolidated View
//
// 约束:
//   - 只读 props，无内部状态
//   - 不 import src/replay/** 或 src/commands/**
//   - 不调用 EventProcessor
//   - 不构造 ReplayEvent
//   - 不使用 React Hooks（纯函数组件）
//   - 所有数据必须来自 props 中的 DecisionPoint
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
//   - H-2 边界安全: 检查 decision 存在性后再访问
//   - H-3 无副作用: 纯函数渲染
//   - H-4 值语义: 不修改任何值
//
// ============================================================================

import React from 'react';

import type {
  DecisionPoint,
  ActionClass,
  StreetPhase,
  AlignmentLabel,
  ConfidenceLevel,
} from '../models/DecisionTimelineModel';

// ============================================================================
// Types
// ============================================================================

/**
 * FocusedDecisionView Props
 */
interface FocusedDecisionViewProps {
  /** The decision point to display (from getDecisionAtIndex) */
  readonly decision: DecisionPoint | null;
  /** Optional: compact mode */
  readonly compact?: boolean;
  /** Optional: which sections to show */
  readonly showSections?: {
    readonly narrative?: boolean;
    readonly insight?: boolean;
    readonly comparison?: boolean;
    readonly alignment?: boolean;
  };
}

// ============================================================================
// Constants
// ============================================================================

const ACTION_COLORS: Record<ActionClass, string> = {
  fold: '#6b7280',
  check: '#3b82f6',
  call: '#06b6d4',
  bet: '#f59e0b',
  raise: '#ef4444',
  'all-in': '#f43f5e',
  'post-blind': '#8b5cf6',
};

const STREET_COLORS: Record<StreetPhase, string> = {
  PREFLOP: '#3b82f6',
  FLOP: '#06b6d4',
  TURN: '#f59e0b',
  RIVER: '#ef4444',
};

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

const PRESSURE_COLORS: Record<string, string> = {
  low: '#22c55e',
  medium: '#f59e0b',
  high: '#ef4444',
};

// ============================================================================
// Sub-Components (Pure Functions)
// ============================================================================

interface SectionHeaderProps {
  readonly title: string;
  readonly color: string;
  readonly icon: string;
  readonly compact?: boolean;
}

function SectionHeader({ title, color, icon, compact = false }: SectionHeaderProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        marginBottom: compact ? 8 : 10,
        paddingBottom: compact ? 6 : 8,
        borderBottom: `1px solid ${color}30`,
      }}
    >
      <span style={{ fontSize: compact ? 12 : 14, color }}>{icon}</span>
      <span
        style={{
          fontSize: compact ? 10 : 11,
          fontWeight: 700,
          color,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
        }}
      >
        {title}
      </span>
    </div>
  );
}

interface NarrativeSectionProps {
  readonly decision: DecisionPoint;
  readonly compact?: boolean;
}

function NarrativeSection({ decision, compact = false }: NarrativeSectionProps) {
  const narrative = decision.narrative;

  return (
    <div
      style={{
        marginBottom: compact ? 12 : 16,
        padding: compact ? '10px 12px' : '12px 16px',
        background: 'rgba(167, 139, 250, 0.08)',
        border: '1px solid rgba(167, 139, 250, 0.2)',
        borderRadius: 8,
      }}
    >
      <SectionHeader
        title="Narrative"
        color="#a78bfa"
        icon="✎"
        compact={compact}
      />

      {/* Main Sentence */}
      <div
        style={{
          fontSize: compact ? 12 : 14,
          color: '#e0e0e0',
          lineHeight: 1.6,
          marginBottom: compact ? 8 : 10,
        }}
      >
        {narrative.sentence}
      </div>

      {/* Context Tags */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        <span
          style={{
            padding: '2px 8px',
            background: 'rgba(167, 139, 250, 0.15)',
            borderRadius: 4,
            fontSize: compact ? 9 : 10,
            color: '#a78bfa',
          }}
        >
          {narrative.positionContext}
        </span>
        <span
          style={{
            padding: '2px 8px',
            background: 'rgba(167, 139, 250, 0.15)',
            borderRadius: 4,
            fontSize: compact ? 9 : 10,
            color: '#a78bfa',
          }}
        >
          {narrative.actionMeaning}
        </span>
      </div>
    </div>
  );
}

interface InsightSectionProps {
  readonly decision: DecisionPoint;
  readonly compact?: boolean;
}

function InsightSection({ decision, compact = false }: InsightSectionProps) {
  const insight = decision.insight;
  const pressureColor = PRESSURE_COLORS[insight.pressureLevel] ?? '#888';

  return (
    <div
      style={{
        marginBottom: compact ? 12 : 16,
        padding: compact ? '10px 12px' : '12px 16px',
        background: 'rgba(59, 130, 246, 0.08)',
        border: '1px solid rgba(59, 130, 246, 0.2)',
        borderRadius: 8,
      }}
    >
      <SectionHeader
        title="Insights"
        color="#3b82f6"
        icon="ℹ"
        compact={compact}
      />

      {/* Key Metrics */}
      <div
        style={{
          display: 'flex',
          gap: compact ? 8 : 10,
          marginBottom: compact ? 10 : 12,
        }}
      >
        {/* Risk/Reward */}
        <div
          style={{
            flex: 1,
            padding: compact ? '6px 8px' : '8px 10px',
            background: 'rgba(59, 130, 246, 0.1)',
            borderRadius: 6,
          }}
        >
          <div style={{ fontSize: compact ? 8 : 9, color: '#888', textTransform: 'uppercase' }}>
            Risk / Reward
          </div>
          <div style={{ fontSize: compact ? 14 : 16, fontWeight: 700, color: '#3b82f6' }}>
            {insight.riskRewardRatio.toFixed(2)}
          </div>
        </div>

        {/* Commitment */}
        <div
          style={{
            flex: 1,
            padding: compact ? '6px 8px' : '8px 10px',
            background: 'rgba(59, 130, 246, 0.1)',
            borderRadius: 6,
          }}
        >
          <div style={{ fontSize: compact ? 8 : 9, color: '#888', textTransform: 'uppercase' }}>
            Commitment
          </div>
          <div style={{ fontSize: compact ? 14 : 16, fontWeight: 700, color: '#3b82f6' }}>
            {insight.commitmentLevel}%
          </div>
        </div>

        {/* Pressure */}
        <div
          style={{
            flex: 1,
            padding: compact ? '6px 8px' : '8px 10px',
            background: `${pressureColor}15`,
            borderRadius: 6,
          }}
        >
          <div style={{ fontSize: compact ? 8 : 9, color: '#888', textTransform: 'uppercase' }}>
            Pressure
          </div>
          <div
            style={{
              fontSize: compact ? 12 : 14,
              fontWeight: 700,
              color: pressureColor,
              textTransform: 'uppercase',
            }}
          >
            {insight.pressureLevel}
          </div>
        </div>
      </div>

      {/* Summary */}
      <div
        style={{
          fontSize: compact ? 10 : 11,
          color: '#9ca3af',
          lineHeight: 1.5,
        }}
      >
        {insight.summary}
      </div>
    </div>
  );
}

interface ComparisonSectionProps {
  readonly decision: DecisionPoint;
  readonly compact?: boolean;
}

function ComparisonSection({ decision, compact = false }: ComparisonSectionProps) {
  const alternatives = decision.alternatives;
  const chosenAction = decision.actionClass;

  return (
    <div
      style={{
        marginBottom: compact ? 12 : 16,
        padding: compact ? '10px 12px' : '12px 16px',
        background: 'rgba(6, 182, 212, 0.08)',
        border: '1px solid rgba(6, 182, 212, 0.2)',
        borderRadius: 8,
      }}
    >
      <SectionHeader
        title="Comparison"
        color="#06b6d4"
        icon="↔"
        compact={compact}
      />

      {/* Chosen Action */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: compact ? 10 : 12,
          padding: compact ? '6px 10px' : '8px 12px',
          background: 'rgba(6, 182, 212, 0.15)',
          borderRadius: 6,
        }}
      >
        <span style={{ fontSize: compact ? 9 : 10, color: '#888' }}>Chosen:</span>
        <span
          style={{
            padding: '3px 10px',
            background: ACTION_COLORS[chosenAction],
            borderRadius: 4,
            fontSize: compact ? 10 : 11,
            fontWeight: 700,
            color: '#fff',
            textTransform: 'uppercase',
          }}
        >
          {chosenAction}
        </span>
        {decision.amount !== undefined && chosenAction !== 'fold' && chosenAction !== 'check' && (
          <span style={{ fontSize: compact ? 10 : 11, color: '#d0d0d0', fontWeight: 600 }}>
            ${decision.amount}
          </span>
        )}
      </div>

      {/* Alternatives */}
      <div
        style={{
          fontSize: compact ? 9 : 10,
          color: '#888',
          textTransform: 'uppercase',
          marginBottom: compact ? 6 : 8,
        }}
      >
        Alternatives Considered
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 4 : 6 }}>
        {alternatives.slice(0, 3).map((alt, idx) => {
          const altColor = ACTION_COLORS[alt.action] ?? '#888';
          return (
            <div
              key={idx}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: compact ? '4px 8px' : '6px 10px',
                background: `${altColor}10`,
                borderLeft: `3px solid ${altColor}`,
                borderRadius: '0 4px 4px 0',
              }}
            >
              <span
                style={{
                  padding: '2px 6px',
                  background: `${altColor}20`,
                  borderRadius: 3,
                  fontSize: compact ? 9 : 10,
                  fontWeight: 600,
                  color: altColor,
                  textTransform: 'uppercase',
                }}
              >
                {alt.action}
              </span>
              <span style={{ fontSize: compact ? 9 : 10, color: '#9ca3af', flex: 1 }}>
                {alt.reasoning}
              </span>
              <span
                style={{
                  fontSize: compact ? 9 : 10,
                  color: alt.evDelta >= 0 ? '#22c55e' : '#ef4444',
                  fontWeight: 600,
                }}
              >
                EV: {alt.evDelta >= 0 ? '+' : ''}{alt.evDelta.toFixed(1)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface AlignmentSectionProps {
  readonly decision: DecisionPoint;
  readonly compact?: boolean;
}

function AlignmentSection({ decision, compact = false }: AlignmentSectionProps) {
  const alignment = decision.alignment;
  const strategy = alignment.strategyExpectation;
  const alignmentColor = ALIGNMENT_COLORS[alignment.alignmentLabel];
  const confidenceColor = CONFIDENCE_COLORS[alignment.confidence];

  return (
    <div
      style={{
        marginBottom: compact ? 12 : 16,
        padding: compact ? '10px 12px' : '12px 16px',
        background: 'rgba(244, 114, 182, 0.08)',
        border: '1px solid rgba(244, 114, 182, 0.2)',
        borderRadius: 8,
      }}
    >
      <SectionHeader
        title="Strategy Alignment"
        color="#f472b6"
        icon="✓"
        compact={compact}
      />

      {/* Alignment Status */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: compact ? 8 : 12,
          marginBottom: compact ? 10 : 12,
        }}
      >
        <span
          style={{
            padding: '4px 12px',
            background: `${alignmentColor}20`,
            border: `1px solid ${alignmentColor}40`,
            borderRadius: 6,
            fontSize: compact ? 11 : 12,
            fontWeight: 700,
            color: alignmentColor,
          }}
        >
          {alignment.alignmentLabel}
        </span>
        <span
          style={{
            padding: '4px 10px',
            background: `${confidenceColor}15`,
            borderRadius: 4,
            fontSize: compact ? 9 : 10,
            color: confidenceColor,
            textTransform: 'uppercase',
          }}
        >
          {alignment.confidence} confidence
        </span>
      </div>

      {/* Expected vs Actual */}
      <div
        style={{
          display: 'flex',
          gap: compact ? 8 : 12,
          marginBottom: compact ? 10 : 12,
        }}
      >
        <div
          style={{
            flex: 1,
            padding: compact ? '8px' : '10px',
            background: 'rgba(167, 139, 250, 0.1)',
            borderRadius: 6,
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: compact ? 8 : 9, color: '#888', textTransform: 'uppercase', marginBottom: 4 }}>
            Expected
          </div>
          <div
            style={{
              fontSize: compact ? 11 : 12,
              fontWeight: 700,
              color: '#a78bfa',
              textTransform: 'uppercase',
            }}
          >
            {strategy.expectedAction}
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            fontSize: compact ? 16 : 20,
            color: decision.actionClass === strategy.expectedAction ? '#22c55e' : '#ef4444',
          }}
        >
          {decision.actionClass === strategy.expectedAction ? '=' : '≠'}
        </div>
        <div
          style={{
            flex: 1,
            padding: compact ? '8px' : '10px',
            background:
              decision.actionClass === strategy.expectedAction
                ? 'rgba(34, 197, 94, 0.1)'
                : 'rgba(239, 68, 68, 0.1)',
            borderRadius: 6,
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: compact ? 8 : 9, color: '#888', textTransform: 'uppercase', marginBottom: 4 }}>
            Actual
          </div>
          <div
            style={{
              fontSize: compact ? 11 : 12,
              fontWeight: 700,
              color: decision.actionClass === strategy.expectedAction ? '#22c55e' : '#ef4444',
              textTransform: 'uppercase',
            }}
          >
            {decision.actionClass}
          </div>
        </div>
      </div>

      {/* Strategy Metrics */}
      <div
        style={{
          display: 'flex',
          gap: compact ? 6 : 8,
          marginBottom: compact ? 10 : 12,
        }}
      >
        <div
          style={{
            flex: 1,
            padding: compact ? '4px 6px' : '6px 8px',
            background: 'rgba(100, 100, 100, 0.1)',
            borderRadius: 4,
          }}
        >
          <div style={{ fontSize: compact ? 7 : 8, color: '#888', textTransform: 'uppercase' }}>
            Pot Odds
          </div>
          <div style={{ fontSize: compact ? 10 : 11, color: '#d0d0d0', fontWeight: 600 }}>
            {(strategy.potOdds * 100).toFixed(0)}%
          </div>
        </div>
        <div
          style={{
            flex: 1,
            padding: compact ? '4px 6px' : '6px 8px',
            background: 'rgba(100, 100, 100, 0.1)',
            borderRadius: 4,
          }}
        >
          <div style={{ fontSize: compact ? 7 : 8, color: '#888', textTransform: 'uppercase' }}>
            SPR
          </div>
          <div style={{ fontSize: compact ? 10 : 11, color: '#d0d0d0', fontWeight: 600 }}>
            {strategy.stackToPotRatio.toFixed(1)}
          </div>
        </div>
        <div
          style={{
            flex: 1,
            padding: compact ? '4px 6px' : '6px 8px',
            background: 'rgba(100, 100, 100, 0.1)',
            borderRadius: 4,
          }}
        >
          <div style={{ fontSize: compact ? 7 : 8, color: '#888', textTransform: 'uppercase' }}>
            Density
          </div>
          <div style={{ fontSize: compact ? 10 : 11, color: '#d0d0d0', fontWeight: 600 }}>
            {(strategy.actionDensity * 100).toFixed(0)}%
          </div>
        </div>
      </div>

      {/* Explanation */}
      <div
        style={{
          padding: compact ? '6px 8px' : '8px 10px',
          background: `${alignmentColor}10`,
          borderLeft: `3px solid ${alignmentColor}`,
          borderRadius: '0 4px 4px 0',
          fontSize: compact ? 10 : 11,
          color: '#9ca3af',
          lineHeight: 1.5,
        }}
      >
        {alignment.explanation}
      </div>
    </div>
  );
}

// ============================================================================
// FocusedDecisionView - Main Component
// ============================================================================

export function FocusedDecisionView({
  decision,
  compact = false,
  showSections = {
    narrative: true,
    insight: true,
    comparison: true,
    alignment: true,
  },
}: FocusedDecisionViewProps) {
  // ========================================
  // 边界检查：无决策时显示空状态
  // ========================================
  if (!decision) {
    return (
      <div
        style={{
          padding: compact ? '20px' : '30px',
          background: 'rgba(100, 100, 100, 0.1)',
          border: '1px solid rgba(100, 100, 100, 0.2)',
          borderRadius: 8,
          textAlign: 'center',
        }}
      >
        <div
          style={{
            fontSize: compact ? 14 : 16,
            color: '#888',
            marginBottom: 8,
          }}
        >
          No Decision Selected
        </div>
        <div
          style={{
            fontSize: compact ? 10 : 11,
            color: '#666',
          }}
        >
          Select a decision point from the timeline to view details
        </div>
      </div>
    );
  }

  // ========================================
  // 从 DecisionPoint 提取显示数据
  // ========================================
  const actionColor = ACTION_COLORS[decision.actionClass] ?? '#888';
  const streetColor = STREET_COLORS[decision.street] ?? '#888';

  // ========================================
  // 纯展示渲染
  // ========================================
  return (
    <div
      style={{
        background: 'rgba(0, 0, 0, 0.2)',
        border: '1px solid rgba(100, 100, 100, 0.2)',
        borderRadius: 10,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: compact ? '10px 14px' : '14px 18px',
          background: `${actionColor}15`,
          borderBottom: `1px solid ${actionColor}30`,
        }}
      >
        {/* Player & Action */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              fontSize: compact ? 12 : 14,
              fontWeight: 700,
              color: decision.isHeroDecision ? '#f472b6' : '#d0d0d0',
            }}
          >
            {decision.playerName}
            {decision.isHeroDecision && (
              <span
                style={{
                  marginLeft: 6,
                  padding: '2px 6px',
                  background: 'rgba(244, 114, 182, 0.2)',
                  borderRadius: 3,
                  fontSize: compact ? 8 : 9,
                  color: '#f472b6',
                }}
              >
                HERO
              </span>
            )}
          </span>
          <span
            style={{
              padding: '4px 12px',
              background: actionColor,
              borderRadius: 5,
              fontSize: compact ? 11 : 12,
              fontWeight: 700,
              color: '#fff',
              textTransform: 'uppercase',
            }}
          >
            {decision.actionClass}
          </span>
          {decision.amount !== undefined &&
            decision.actionClass !== 'fold' &&
            decision.actionClass !== 'check' && (
              <span
                style={{
                  fontSize: compact ? 12 : 14,
                  fontWeight: 700,
                  color: '#e0e0e0',
                }}
              >
                ${decision.amount}
              </span>
            )}
        </div>

        {/* Context */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              padding: '3px 8px',
              background: `${streetColor}20`,
              borderRadius: 4,
              fontSize: compact ? 9 : 10,
              fontWeight: 600,
              color: streetColor,
            }}
          >
            {decision.street}
          </span>
          <span
            style={{
              fontSize: compact ? 10 : 11,
              color: '#888',
            }}
          >
            Decision #{decision.index + 1}
          </span>
        </div>
      </div>

      {/* Content Sections */}
      <div style={{ padding: compact ? '12px 14px' : '16px 18px' }}>
        {showSections.narrative && <NarrativeSection decision={decision} compact={compact} />}
        {showSections.insight && <InsightSection decision={decision} compact={compact} />}
        {showSections.comparison && <ComparisonSection decision={decision} compact={compact} />}
        {showSections.alignment && <AlignmentSection decision={decision} compact={compact} />}
      </div>

      {/* Footer */}
      <div
        style={{
          padding: compact ? '8px 14px' : '10px 18px',
          background: 'rgba(0, 0, 0, 0.15)',
          borderTop: '1px solid rgba(100, 100, 100, 0.15)',
          fontSize: compact ? 8 : 9,
          color: '#666',
          textAlign: 'center',
        }}
      >
        Focused Decision View • All data derived from DecisionTimelineModel
      </div>
    </div>
  );
}

// ============================================================================
// Compact Decision Card (For List Views)
// ============================================================================

interface DecisionCardProps {
  readonly decision: DecisionPoint;
  readonly isSelected?: boolean;
  readonly onSelect?: () => void;
  readonly compact?: boolean;
}

/**
 * Compact card view of a single decision
 */
export function DecisionCard({
  decision,
  isSelected = false,
  onSelect,
  compact = false,
}: DecisionCardProps) {
  const actionColor = ACTION_COLORS[decision.actionClass] ?? '#888';

  return (
    <div
      onClick={onSelect}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: compact ? '8px 10px' : '10px 14px',
        background: isSelected ? `${actionColor}15` : 'rgba(100, 100, 100, 0.08)',
        border: `1px solid ${isSelected ? `${actionColor}40` : 'rgba(100, 100, 100, 0.15)'}`,
        borderRadius: 6,
        cursor: onSelect ? 'pointer' : 'default',
        transition: 'all 0.15s ease',
      }}
    >
      {/* Index */}
      <span
        style={{
          fontSize: compact ? 10 : 11,
          color: '#888',
          minWidth: 24,
        }}
      >
        #{decision.index + 1}
      </span>

      {/* Player */}
      <span
        style={{
          fontSize: compact ? 10 : 11,
          fontWeight: 600,
          color: decision.isHeroDecision ? '#f472b6' : '#d0d0d0',
          minWidth: 60,
        }}
      >
        {decision.playerName}
      </span>

      {/* Action */}
      <span
        style={{
          padding: '2px 8px',
          background: `${actionColor}30`,
          borderRadius: 4,
          fontSize: compact ? 9 : 10,
          fontWeight: 700,
          color: actionColor,
          textTransform: 'uppercase',
        }}
      >
        {decision.actionClass}
      </span>

      {/* Amount */}
      {decision.amount !== undefined &&
        decision.actionClass !== 'fold' &&
        decision.actionClass !== 'check' && (
          <span
            style={{
              fontSize: compact ? 10 : 11,
              color: '#d0d0d0',
              fontWeight: 600,
            }}
          >
            ${decision.amount}
          </span>
        )}

      {/* Street */}
      <span
        style={{
          marginLeft: 'auto',
          fontSize: compact ? 9 : 10,
          color: STREET_COLORS[decision.street] ?? '#888',
        }}
      >
        {decision.street}
      </span>
    </div>
  );
}

// ============================================================================
// Exports
// ============================================================================

export type { FocusedDecisionViewProps, DecisionCardProps };
