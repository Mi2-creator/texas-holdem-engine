// ============================================================================
// TimelineScrubber - Read-Only Timeline Navigation (Pure UI)
// ============================================================================
//
// 【UX Consolidation Phase】Replay Architecture Freeze Declaration v1.0 Compliant
//
// 层级: UI Layer (纯展示 + 交互回调)
// 职责: 显示决策时间线，允许用户选择索引，无内部状态
//
// 约束:
//   - 只读 props，无内部状态
//   - 不 import src/replay/** 或 src/commands/**
//   - 不调用 EventProcessor
//   - 不构造 ReplayEvent
//   - 不使用 React Hooks（纯函数组件）
//   - 交互通过 callback props 传递给父组件
//   - 不执行任何派生计算（所有数据来自 props）
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
//   - H-2 边界安全: 检查 props 存在性后再访问
//   - H-3 无副作用: 纯函数渲染 + 回调传递
//   - H-4 值语义: 不修改任何值
//
// ============================================================================

import React from 'react';

import type {
  DecisionTimeline,
  DecisionPoint,
  StreetPhase,
  ActionClass,
} from '../models/DecisionTimelineModel';

// ============================================================================
// Types
// ============================================================================

/**
 * TimelineScrubber Props
 */
interface TimelineScrubberProps {
  /** Full decision timeline (readonly) */
  readonly timeline: DecisionTimeline;
  /** Currently selected index */
  readonly currentIndex: number;
  /** Callback when index selection changes */
  readonly onIndexSelect: (index: number) => void;
  /** Optional: compact mode */
  readonly compact?: boolean;
  /** Optional: show street labels */
  readonly showStreetLabels?: boolean;
  /** Optional: show action types */
  readonly showActionTypes?: boolean;
  /** Optional: highlight hero decisions */
  readonly highlightHero?: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const STREET_COLORS: Record<StreetPhase, string> = {
  PREFLOP: '#3b82f6',
  FLOP: '#06b6d4',
  TURN: '#f59e0b',
  RIVER: '#ef4444',
};

const ACTION_COLORS: Record<ActionClass, string> = {
  fold: '#6b7280',
  check: '#3b82f6',
  call: '#06b6d4',
  bet: '#f59e0b',
  raise: '#ef4444',
  'all-in': '#f43f5e',
  'post-blind': '#8b5cf6',
};

// ============================================================================
// Pure Helper Functions
// ============================================================================

/**
 * Get color for a decision point (pure function)
 */
function getDecisionColor(decision: DecisionPoint): string {
  return ACTION_COLORS[decision.actionClass] ?? '#888';
}

/**
 * Get street color (pure function)
 */
function getStreetColor(street: StreetPhase): string {
  return STREET_COLORS[street] ?? '#888';
}

/**
 * Format decision for tooltip (pure function)
 */
function formatDecisionTooltip(decision: DecisionPoint): string {
  const action = decision.actionClass.toUpperCase();
  const amount = decision.amount ? ` $${decision.amount}` : '';
  return `${decision.playerName}: ${action}${amount} (${decision.street})`;
}

// ============================================================================
// Sub-Components (Pure Functions)
// ============================================================================

interface DecisionMarkerProps {
  readonly decision: DecisionPoint;
  readonly isSelected: boolean;
  readonly isHero: boolean;
  readonly highlightHero: boolean;
  readonly onSelect: () => void;
  readonly compact?: boolean;
  readonly showAction?: boolean;
}

function DecisionMarker({
  decision,
  isSelected,
  isHero,
  highlightHero,
  onSelect,
  compact = false,
  showAction = false,
}: DecisionMarkerProps) {
  const color = getDecisionColor(decision);
  const size = compact ? 16 : 20;
  const heroRing = highlightHero && isHero;

  return (
    <div
      onClick={onSelect}
      title={formatDecisionTooltip(decision)}
      style={{
        position: 'relative',
        width: size,
        height: size,
        borderRadius: '50%',
        background: isSelected ? color : `${color}40`,
        border: `2px solid ${isSelected ? '#fff' : color}`,
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        transform: isSelected ? 'scale(1.2)' : 'scale(1)',
        boxShadow: isSelected ? `0 0 8px ${color}` : 'none',
      }}
    >
      {/* Hero indicator ring */}
      {heroRing && (
        <div
          style={{
            position: 'absolute',
            top: -4,
            left: -4,
            right: -4,
            bottom: -4,
            borderRadius: '50%',
            border: '2px solid #f472b6',
            opacity: 0.7,
          }}
        />
      )}

      {/* Action label (optional) */}
      {showAction && !compact && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            marginTop: 4,
            fontSize: 8,
            color: color,
            whiteSpace: 'nowrap',
            fontWeight: 600,
            textTransform: 'uppercase',
          }}
        >
          {decision.actionClass.charAt(0)}
        </div>
      )}
    </div>
  );
}

interface StreetSectionProps {
  readonly street: StreetPhase;
  readonly decisions: readonly DecisionPoint[];
  readonly currentIndex: number;
  readonly onIndexSelect: (index: number) => void;
  readonly compact?: boolean;
  readonly showLabel?: boolean;
  readonly highlightHero?: boolean;
}

function StreetSection({
  street,
  decisions,
  currentIndex,
  onIndexSelect,
  compact = false,
  showLabel = true,
  highlightHero = false,
}: StreetSectionProps) {
  const color = getStreetColor(street);

  if (decisions.length === 0) return null;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: compact ? 4 : 6,
      }}
    >
      {/* Street Label */}
      {showLabel && (
        <div
          style={{
            fontSize: compact ? 8 : 9,
            fontWeight: 700,
            color: color,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          {street}
        </div>
      )}

      {/* Decision Markers */}
      <div
        style={{
          display: 'flex',
          gap: compact ? 4 : 6,
          padding: compact ? '4px 8px' : '6px 10px',
          background: `${color}10`,
          borderRadius: 6,
          border: `1px solid ${color}30`,
        }}
      >
        {decisions.map(decision => (
          <DecisionMarker
            key={decision.index}
            decision={decision}
            isSelected={decision.index === currentIndex}
            isHero={decision.isHeroDecision}
            highlightHero={highlightHero}
            onSelect={() => onIndexSelect(decision.index)}
            compact={compact}
          />
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// TimelineScrubber - Main Component
// ============================================================================

export function TimelineScrubber({
  timeline,
  currentIndex,
  onIndexSelect,
  compact = false,
  showStreetLabels = true,
  showActionTypes = false,
  highlightHero = true,
}: TimelineScrubberProps) {
  // ========================================
  // 边界检查：无决策时显示空状态
  // ========================================
  if (timeline.length === 0) {
    return (
      <div
        style={{
          padding: compact ? '8px 12px' : '12px 16px',
          background: 'rgba(100, 100, 100, 0.1)',
          border: '1px solid rgba(100, 100, 100, 0.2)',
          borderRadius: 8,
          fontSize: compact ? 10 : 11,
          color: '#666',
          textAlign: 'center',
        }}
      >
        No decisions to display
      </div>
    );
  }

  // ========================================
  // Group decisions by street (read-only grouping)
  // ========================================
  const streetOrder: StreetPhase[] = ['PREFLOP', 'FLOP', 'TURN', 'RIVER'];
  const decisionsByStreet: Record<StreetPhase, DecisionPoint[]> = {
    PREFLOP: [],
    FLOP: [],
    TURN: [],
    RIVER: [],
  };

  for (const decision of timeline) {
    decisionsByStreet[decision.street].push(decision);
  }

  // ========================================
  // 纯展示渲染
  // ========================================
  return (
    <div
      style={{
        background: 'rgba(0, 0, 0, 0.2)',
        border: '1px solid rgba(100, 100, 100, 0.2)',
        borderRadius: 8,
        padding: compact ? '8px 10px' : '12px 16px',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: compact ? 8 : 12,
        }}
      >
        <span
          style={{
            fontSize: compact ? 9 : 10,
            color: '#888',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          Decision Timeline
        </span>
        <span
          style={{
            fontSize: compact ? 9 : 10,
            color: '#d0d0d0',
          }}
        >
          {currentIndex + 1} / {timeline.length}
        </span>
      </div>

      {/* Street Sections */}
      <div
        style={{
          display: 'flex',
          gap: compact ? 8 : 12,
          justifyContent: 'center',
          flexWrap: 'wrap',
        }}
      >
        {streetOrder.map(street => (
          <StreetSection
            key={street}
            street={street}
            decisions={decisionsByStreet[street]}
            currentIndex={currentIndex}
            onIndexSelect={onIndexSelect}
            compact={compact}
            showLabel={showStreetLabels}
            highlightHero={highlightHero}
          />
        ))}
      </div>

      {/* Progress Bar */}
      <div
        style={{
          marginTop: compact ? 8 : 12,
          height: compact ? 4 : 6,
          background: 'rgba(100, 100, 100, 0.2)',
          borderRadius: 3,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${((currentIndex + 1) / timeline.length) * 100}%`,
            height: '100%',
            background: 'linear-gradient(90deg, #3b82f6, #06b6d4, #f59e0b, #ef4444)',
            transition: 'width 0.2s ease',
          }}
        />
      </div>

      {/* Navigation Hint */}
      {highlightHero && (
        <div
          style={{
            marginTop: compact ? 6 : 8,
            fontSize: compact ? 8 : 9,
            color: '#666',
            textAlign: 'center',
          }}
        >
          <span style={{ color: '#f472b6' }}>●</span> Hero decisions
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Linear Timeline View (Alternative Layout)
// ============================================================================

interface LinearTimelineProps {
  readonly timeline: DecisionTimeline;
  readonly currentIndex: number;
  readonly onIndexSelect: (index: number) => void;
  readonly compact?: boolean;
}

/**
 * Linear (horizontal) timeline view
 */
export function LinearTimeline({
  timeline,
  currentIndex,
  onIndexSelect,
  compact = false,
}: LinearTimelineProps) {
  if (timeline.length === 0) {
    return (
      <div
        style={{
          padding: compact ? '6px 10px' : '8px 12px',
          background: 'rgba(100, 100, 100, 0.1)',
          borderRadius: 6,
          fontSize: compact ? 10 : 11,
          color: '#666',
          textAlign: 'center',
        }}
      >
        No timeline data
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        padding: compact ? '6px 8px' : '8px 12px',
        background: 'rgba(0, 0, 0, 0.2)',
        borderRadius: 6,
        overflowX: 'auto',
      }}
    >
      {timeline.map((decision, idx) => {
        const isSelected = idx === currentIndex;
        const color = getDecisionColor(decision);

        return (
          <React.Fragment key={idx}>
            {/* Connector line */}
            {idx > 0 && (
              <div
                style={{
                  width: compact ? 8 : 12,
                  height: 2,
                  background:
                    idx <= currentIndex
                      ? 'linear-gradient(90deg, #3b82f6, #06b6d4)'
                      : 'rgba(100, 100, 100, 0.3)',
                }}
              />
            )}

            {/* Decision dot */}
            <div
              onClick={() => onIndexSelect(idx)}
              title={formatDecisionTooltip(decision)}
              style={{
                width: compact ? 10 : 14,
                height: compact ? 10 : 14,
                borderRadius: '50%',
                background: isSelected ? color : `${color}60`,
                border: `2px solid ${isSelected ? '#fff' : 'transparent'}`,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                transform: isSelected ? 'scale(1.3)' : 'scale(1)',
                flexShrink: 0,
              }}
            />
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ============================================================================
// Index Stepper (Previous/Next Navigation)
// ============================================================================

interface IndexStepperProps {
  readonly currentIndex: number;
  readonly maxIndex: number;
  readonly onIndexSelect: (index: number) => void;
  readonly compact?: boolean;
}

/**
 * Simple prev/next stepper for index navigation
 */
export function IndexStepper({
  currentIndex,
  maxIndex,
  onIndexSelect,
  compact = false,
}: IndexStepperProps) {
  const canPrev = currentIndex > 0;
  const canNext = currentIndex < maxIndex;

  const buttonStyle = (enabled: boolean): React.CSSProperties => ({
    padding: compact ? '4px 8px' : '6px 12px',
    background: enabled ? 'rgba(59, 130, 246, 0.2)' : 'rgba(100, 100, 100, 0.1)',
    border: '1px solid',
    borderColor: enabled ? 'rgba(59, 130, 246, 0.4)' : 'rgba(100, 100, 100, 0.2)',
    borderRadius: 4,
    cursor: enabled ? 'pointer' : 'not-allowed',
    fontSize: compact ? 10 : 12,
    color: enabled ? '#3b82f6' : '#666',
    fontWeight: 600,
    opacity: enabled ? 1 : 0.5,
    transition: 'all 0.15s ease',
  });

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: compact ? 6 : 8,
      }}
    >
      <div
        style={buttonStyle(canPrev)}
        onClick={() => canPrev && onIndexSelect(currentIndex - 1)}
      >
        ← Prev
      </div>

      <div
        style={{
          padding: compact ? '4px 10px' : '6px 14px',
          background: 'rgba(0, 0, 0, 0.3)',
          borderRadius: 4,
          fontSize: compact ? 11 : 13,
          color: '#d0d0d0',
          fontWeight: 700,
          minWidth: compact ? 50 : 60,
          textAlign: 'center',
        }}
      >
        {currentIndex + 1} / {maxIndex + 1}
      </div>

      <div
        style={buttonStyle(canNext)}
        onClick={() => canNext && onIndexSelect(currentIndex + 1)}
      >
        Next →
      </div>
    </div>
  );
}

// ============================================================================
// Exports
// ============================================================================

export type { TimelineScrubberProps, LinearTimelineProps, IndexStepperProps };
export { STREET_COLORS, ACTION_COLORS, getDecisionColor, getStreetColor };
