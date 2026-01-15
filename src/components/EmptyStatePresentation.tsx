// ============================================================================
// EmptyStatePresentation - Edge Case UI Handling (Pure Presentation)
// ============================================================================
//
// 【UX Consolidation Phase】Replay Architecture Freeze Declaration v1.0 Compliant
//
// 层级: UI Layer (纯展示)
// 职责: 处理空状态、单决策、Hero-only 等边缘情况的展示
//
// 约束:
//   - 只读 props，无内部状态
//   - 不 import src/replay/** 或 src/commands/**
//   - 不调用 EventProcessor
//   - 不构造 ReplayEvent
//   - 不使用 React Hooks（纯函数组件）
//   - 纯展示，无回退逻辑
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
//   - H-2 边界安全: 专为边界情况设计
//   - H-3 无副作用: 纯函数渲染
//   - H-4 值语义: 不修改任何值
//
// ============================================================================

import React from 'react';

// ============================================================================
// Types
// ============================================================================

/**
 * Empty state types
 */
type EmptyStateType =
  | 'no-events'
  | 'no-decisions'
  | 'single-decision'
  | 'hero-only'
  | 'no-hero-decisions'
  | 'loading'
  | 'error'
  | 'no-data';

/**
 * Empty state configuration
 */
interface EmptyStateConfig {
  readonly type: EmptyStateType;
  readonly title: string;
  readonly message: string;
  readonly icon: string;
  readonly color: string;
  readonly suggestion?: string;
}

// ============================================================================
// Constants
// ============================================================================

const EMPTY_STATE_CONFIGS: Record<EmptyStateType, EmptyStateConfig> = {
  'no-events': {
    type: 'no-events',
    title: 'No Events',
    message: 'No hand events are available for analysis.',
    icon: '\u2205', // ∅
    color: '#6b7280',
    suggestion: 'Load a hand history to begin analysis.',
  },
  'no-decisions': {
    type: 'no-decisions',
    title: 'No Decisions Yet',
    message: 'No player decisions have been recorded.',
    icon: '\u23F3', // ⏳
    color: '#f59e0b',
    suggestion: 'Decisions appear after preflop action begins.',
  },
  'single-decision': {
    type: 'single-decision',
    title: 'Single Decision',
    message: 'Only one decision point is available.',
    icon: '\u2460', // ①
    color: '#3b82f6',
    suggestion: 'Comparison features require multiple decisions.',
  },
  'hero-only': {
    type: 'hero-only',
    title: 'Hero Only',
    message: 'Only hero decisions are present in this hand.',
    icon: '\u2605', // ★
    color: '#f472b6',
    suggestion: 'Field comparison requires opponent actions.',
  },
  'no-hero-decisions': {
    type: 'no-hero-decisions',
    title: 'No Hero Decisions',
    message: 'The hero has not made any decisions in this hand.',
    icon: '\u2606', // ☆
    color: '#8b5cf6',
    suggestion: 'Hero analysis requires hero action.',
  },
  loading: {
    type: 'loading',
    title: 'Loading',
    message: 'Preparing analysis data...',
    icon: '\u27F3', // ⟳
    color: '#06b6d4',
  },
  error: {
    type: 'error',
    title: 'Analysis Error',
    message: 'Unable to analyze the current data.',
    icon: '\u26A0', // ⚠
    color: '#ef4444',
    suggestion: 'Check the data integrity and try again.',
  },
  'no-data': {
    type: 'no-data',
    title: 'No Data',
    message: 'No data available for this view.',
    icon: '\u2300', // ⌀
    color: '#6b7280',
  },
};

// ============================================================================
// Base Empty State Component
// ============================================================================

interface EmptyStateProps {
  readonly type: EmptyStateType;
  readonly customTitle?: string;
  readonly customMessage?: string;
  readonly compact?: boolean;
  readonly showSuggestion?: boolean;
}

/**
 * Generic empty state presentation
 */
export function EmptyState({
  type,
  customTitle,
  customMessage,
  compact = false,
  showSuggestion = true,
}: EmptyStateProps) {
  const config = EMPTY_STATE_CONFIGS[type];

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: compact ? '20px' : '40px',
        background: `${config.color}08`,
        border: `1px solid ${config.color}20`,
        borderRadius: 10,
        textAlign: 'center',
      }}
    >
      {/* Icon */}
      <div
        style={{
          fontSize: compact ? 28 : 40,
          color: config.color,
          marginBottom: compact ? 10 : 16,
          opacity: 0.8,
        }}
      >
        {config.icon}
      </div>

      {/* Title */}
      <div
        style={{
          fontSize: compact ? 14 : 18,
          fontWeight: 700,
          color: config.color,
          marginBottom: compact ? 6 : 10,
        }}
      >
        {customTitle ?? config.title}
      </div>

      {/* Message */}
      <div
        style={{
          fontSize: compact ? 11 : 13,
          color: '#9ca3af',
          maxWidth: 300,
          lineHeight: 1.5,
          marginBottom: showSuggestion && config.suggestion ? (compact ? 10 : 16) : 0,
        }}
      >
        {customMessage ?? config.message}
      </div>

      {/* Suggestion */}
      {showSuggestion && config.suggestion && (
        <div
          style={{
            fontSize: compact ? 10 : 11,
            color: '#666',
            fontStyle: 'italic',
            padding: compact ? '6px 12px' : '8px 16px',
            background: 'rgba(100, 100, 100, 0.1)',
            borderRadius: 6,
          }}
        >
          {config.suggestion}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Specific Empty State Components
// ============================================================================

interface NoEventsStateProps {
  readonly compact?: boolean;
}

/**
 * State when no events are available
 */
export function NoEventsState({ compact = false }: NoEventsStateProps) {
  return <EmptyState type="no-events" compact={compact} />;
}

interface NoDecisionsStateProps {
  readonly compact?: boolean;
  readonly eventCount?: number;
}

/**
 * State when no decisions have been made yet
 */
export function NoDecisionsState({ compact = false, eventCount }: NoDecisionsStateProps) {
  const customMessage =
    eventCount !== undefined && eventCount > 0
      ? `${eventCount} events processed, but no player decisions yet.`
      : undefined;

  return <EmptyState type="no-decisions" compact={compact} customMessage={customMessage} />;
}

interface SingleDecisionStateProps {
  readonly compact?: boolean;
  readonly playerName?: string;
}

/**
 * State when only one decision exists
 */
export function SingleDecisionState({ compact = false, playerName }: SingleDecisionStateProps) {
  const customMessage = playerName
    ? `Only ${playerName}'s decision is available for analysis.`
    : undefined;

  return <EmptyState type="single-decision" compact={compact} customMessage={customMessage} />;
}

interface HeroOnlyStateProps {
  readonly compact?: boolean;
  readonly heroDecisionCount?: number;
}

/**
 * State when only hero decisions exist
 */
export function HeroOnlyState({ compact = false, heroDecisionCount }: HeroOnlyStateProps) {
  const customMessage =
    heroDecisionCount !== undefined
      ? `Hero has made ${heroDecisionCount} decision${heroDecisionCount !== 1 ? 's' : ''}, but no opponent actions recorded.`
      : undefined;

  return <EmptyState type="hero-only" compact={compact} customMessage={customMessage} />;
}

interface NoHeroDecisionsStateProps {
  readonly compact?: boolean;
  readonly totalDecisions?: number;
}

/**
 * State when hero has no decisions
 */
export function NoHeroDecisionsState({
  compact = false,
  totalDecisions,
}: NoHeroDecisionsStateProps) {
  const customMessage =
    totalDecisions !== undefined && totalDecisions > 0
      ? `${totalDecisions} decisions recorded, but none from hero.`
      : undefined;

  return <EmptyState type="no-hero-decisions" compact={compact} customMessage={customMessage} />;
}

// ============================================================================
// Inline Empty States (For Embedding in Panels)
// ============================================================================

interface InlineEmptyStateProps {
  readonly message: string;
  readonly compact?: boolean;
}

/**
 * Minimal inline empty state for embedding
 */
export function InlineEmptyState({ message, compact = false }: InlineEmptyStateProps) {
  return (
    <div
      style={{
        padding: compact ? '8px 12px' : '12px 16px',
        background: 'rgba(100, 100, 100, 0.1)',
        borderRadius: 6,
        fontSize: compact ? 10 : 11,
        color: '#888',
        textAlign: 'center',
        fontStyle: 'italic',
      }}
    >
      {message}
    </div>
  );
}

interface SectionEmptyStateProps {
  readonly title: string;
  readonly message: string;
  readonly color?: string;
  readonly compact?: boolean;
}

/**
 * Empty state for a specific section within a panel
 */
export function SectionEmptyState({
  title,
  message,
  color = '#6b7280',
  compact = false,
}: SectionEmptyStateProps) {
  return (
    <div
      style={{
        padding: compact ? '10px 12px' : '14px 16px',
        background: `${color}08`,
        border: `1px dashed ${color}30`,
        borderRadius: 6,
      }}
    >
      <div
        style={{
          fontSize: compact ? 10 : 11,
          fontWeight: 600,
          color: color,
          marginBottom: compact ? 4 : 6,
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontSize: compact ? 10 : 11,
          color: '#888',
        }}
      >
        {message}
      </div>
    </div>
  );
}

// ============================================================================
// Contextual Empty States
// ============================================================================

interface NoComparisonDataStateProps {
  readonly compact?: boolean;
}

/**
 * Empty state for comparison panel
 */
export function NoComparisonDataState({ compact = false }: NoComparisonDataStateProps) {
  return (
    <SectionEmptyState
      title="No Comparison Available"
      message="Need at least two decisions to compare alternatives."
      color="#06b6d4"
      compact={compact}
    />
  );
}

interface NoAlignmentDataStateProps {
  readonly compact?: boolean;
}

/**
 * Empty state for alignment panel
 */
export function NoAlignmentDataState({ compact = false }: NoAlignmentDataStateProps) {
  return (
    <SectionEmptyState
      title="No Alignment Data"
      message="Select a hero decision to view alignment analysis."
      color="#f472b6"
      compact={compact}
    />
  );
}

interface NoNarrativeDataStateProps {
  readonly compact?: boolean;
}

/**
 * Empty state for narrative panel
 */
export function NoNarrativeDataState({ compact = false }: NoNarrativeDataStateProps) {
  return (
    <SectionEmptyState
      title="No Narrative"
      message="Narrative will appear as the hand progresses."
      color="#a78bfa"
      compact={compact}
    />
  );
}

interface NoInsightDataStateProps {
  readonly compact?: boolean;
}

/**
 * Empty state for insight panel
 */
export function NoInsightDataState({ compact = false }: NoInsightDataStateProps) {
  return (
    <SectionEmptyState
      title="No Insights"
      message="Select a decision point to view detailed insights."
      color="#3b82f6"
      compact={compact}
    />
  );
}

// ============================================================================
// Edge Case Handler Component
// ============================================================================

interface EdgeCaseHandlerProps {
  readonly eventCount: number;
  readonly decisionCount: number;
  readonly heroDecisionCount: number;
  readonly currentIndex: number | null;
  readonly compact?: boolean;
  readonly children: React.ReactNode;
}

/**
 * Wrapper component that shows appropriate empty state based on data
 */
export function EdgeCaseHandler({
  eventCount,
  decisionCount,
  heroDecisionCount,
  currentIndex,
  compact = false,
  children,
}: EdgeCaseHandlerProps) {
  // No events at all
  if (eventCount === 0) {
    return <NoEventsState compact={compact} />;
  }

  // No decisions yet
  if (decisionCount === 0) {
    return <NoDecisionsState compact={compact} eventCount={eventCount} />;
  }

  // Single decision only
  if (decisionCount === 1) {
    return <SingleDecisionState compact={compact} />;
  }

  // No hero decisions
  if (heroDecisionCount === 0) {
    return <NoHeroDecisionsState compact={compact} totalDecisions={decisionCount} />;
  }

  // Hero only (no field decisions)
  if (heroDecisionCount === decisionCount) {
    return <HeroOnlyState compact={compact} heroDecisionCount={heroDecisionCount} />;
  }

  // Normal case - render children
  return <>{children}</>;
}

// ============================================================================
// Loading & Transition States
// ============================================================================

interface LoadingStateProps {
  readonly message?: string;
  readonly compact?: boolean;
}

/**
 * Loading state indicator
 */
export function LoadingState({ message = 'Loading...', compact = false }: LoadingStateProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: compact ? '20px' : '40px',
        background: 'rgba(6, 182, 212, 0.08)',
        border: '1px solid rgba(6, 182, 212, 0.2)',
        borderRadius: 10,
      }}
    >
      <div
        style={{
          fontSize: compact ? 24 : 32,
          color: '#06b6d4',
          marginBottom: compact ? 8 : 12,
          animation: 'spin 1s linear infinite',
        }}
      >
        ⟳
      </div>
      <div
        style={{
          fontSize: compact ? 11 : 13,
          color: '#9ca3af',
        }}
      >
        {message}
      </div>
    </div>
  );
}

interface TransitionStateProps {
  readonly from: string;
  readonly to: string;
  readonly compact?: boolean;
}

/**
 * Transition state between views
 */
export function TransitionState({ from, to, compact = false }: TransitionStateProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: compact ? '12px' : '20px',
        background: 'rgba(100, 100, 100, 0.1)',
        borderRadius: 8,
        fontSize: compact ? 10 : 11,
        color: '#888',
      }}
    >
      <span style={{ color: '#666' }}>{from}</span>
      <span style={{ color: '#3b82f6' }}>→</span>
      <span style={{ color: '#3b82f6' }}>{to}</span>
    </div>
  );
}

// ============================================================================
// Exports
// ============================================================================

export type { EmptyStateType, EmptyStateConfig, EmptyStateProps };
export { EMPTY_STATE_CONFIGS };
