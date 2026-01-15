// ============================================================================
// PanelNavigator - Stateless Panel Navigation (Read-Only UI)
// ============================================================================
//
// 【UX Consolidation Phase】Replay Architecture Freeze Declaration v1.0 Compliant
//
// 层级: UI Layer (纯展示 + 交互回调)
// 职责: 提供面板切换导航，无内部状态
//
// 约束:
//   - 只读 props，无内部状态
//   - 不 import src/replay/** 或 src/commands/**
//   - 不调用 EventProcessor
//   - 不构造 ReplayEvent
//   - 不使用 React Hooks（纯函数组件）
//   - 交互通过 callback props 传递给父组件
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

// ============================================================================
// Types
// ============================================================================

/**
 * Available panel types for navigation
 */
type PanelType = 'narrative' | 'insight' | 'comparison' | 'alignment';

/**
 * Panel metadata for display
 */
interface PanelMeta {
  readonly id: PanelType;
  readonly label: string;
  readonly shortLabel: string;
  readonly description: string;
  readonly icon: string;
  readonly color: string;
}

/**
 * PanelNavigator Props
 */
interface PanelNavigatorProps {
  /** Currently selected panel */
  readonly selectedPanel: PanelType;
  /** Callback when panel selection changes */
  readonly onSelect: (panel: PanelType) => void;
  /** Optional: compact mode */
  readonly compact?: boolean;
  /** Optional: show descriptions */
  readonly showDescriptions?: boolean;
  /** Optional: horizontal or vertical layout */
  readonly layout?: 'horizontal' | 'vertical';
  /** Optional: disabled panels */
  readonly disabledPanels?: readonly PanelType[];
}

// ============================================================================
// Constants
// ============================================================================

const PANEL_METADATA: readonly PanelMeta[] = [
  {
    id: 'narrative',
    label: 'Hand Narrative',
    shortLabel: 'Narrative',
    description: 'Story-form recap of the hand',
    icon: '\u270E', // ✎
    color: '#a78bfa',
  },
  {
    id: 'insight',
    label: 'Decision Insights',
    shortLabel: 'Insights',
    description: 'Deep analysis of decision points',
    icon: '\u2139', // ℹ
    color: '#3b82f6',
  },
  {
    id: 'comparison',
    label: 'Decision Comparison',
    shortLabel: 'Compare',
    description: 'Compare choices and alternatives',
    icon: '\u2194', // ↔
    color: '#06b6d4',
  },
  {
    id: 'alignment',
    label: 'Strategy Alignment',
    shortLabel: 'Alignment',
    description: 'GTO and strategy analysis',
    icon: '\u2713', // ✓
    color: '#f472b6',
  },
] as const;

// ============================================================================
// Pure Helper Functions
// ============================================================================

/**
 * Get panel metadata by ID (pure function)
 */
function getPanelMeta(panelId: PanelType): PanelMeta {
  const meta = PANEL_METADATA.find(p => p.id === panelId);
  return meta ?? PANEL_METADATA[0];
}

/**
 * Check if panel is disabled (pure function)
 */
function isPanelDisabled(
  panelId: PanelType,
  disabledPanels: readonly PanelType[] | undefined
): boolean {
  if (!disabledPanels) return false;
  return disabledPanels.includes(panelId);
}

// ============================================================================
// Sub-Components (Pure Functions)
// ============================================================================

interface PanelTabProps {
  readonly meta: PanelMeta;
  readonly isSelected: boolean;
  readonly isDisabled: boolean;
  readonly onSelect: () => void;
  readonly compact?: boolean;
  readonly showDescription?: boolean;
}

function PanelTab({
  meta,
  isSelected,
  isDisabled,
  onSelect,
  compact = false,
  showDescription = false,
}: PanelTabProps) {
  const baseStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: compact ? 6 : 8,
    padding: compact ? '8px 12px' : '10px 16px',
    borderRadius: 6,
    cursor: isDisabled ? 'not-allowed' : 'pointer',
    transition: 'all 0.15s ease',
    border: '1px solid transparent',
    background: isSelected
      ? `${meta.color}20`
      : isDisabled
      ? 'rgba(100, 100, 100, 0.05)'
      : 'rgba(100, 100, 100, 0.1)',
    borderColor: isSelected ? `${meta.color}40` : 'transparent',
    opacity: isDisabled ? 0.5 : 1,
  };

  const handleClick = () => {
    if (!isDisabled) {
      onSelect();
    }
  };

  return (
    <div style={baseStyle} onClick={handleClick}>
      {/* Icon */}
      <span
        style={{
          fontSize: compact ? 14 : 16,
          color: isSelected ? meta.color : '#888',
        }}
      >
        {meta.icon}
      </span>

      {/* Label & Description */}
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontSize: compact ? 11 : 12,
            fontWeight: isSelected ? 700 : 500,
            color: isSelected ? meta.color : '#d0d0d0',
          }}
        >
          {compact ? meta.shortLabel : meta.label}
        </div>
        {showDescription && !compact && (
          <div
            style={{
              fontSize: 10,
              color: '#888',
              marginTop: 2,
            }}
          >
            {meta.description}
          </div>
        )}
      </div>

      {/* Selection Indicator */}
      {isSelected && (
        <div
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: meta.color,
          }}
        />
      )}
    </div>
  );
}

// ============================================================================
// PanelNavigator - Main Component
// ============================================================================

export function PanelNavigator({
  selectedPanel,
  onSelect,
  compact = false,
  showDescriptions = false,
  layout = 'horizontal',
  disabledPanels,
}: PanelNavigatorProps) {
  const isVertical = layout === 'vertical';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: isVertical ? 'column' : 'row',
        gap: compact ? 4 : 8,
        padding: compact ? '4px' : '6px',
        background: 'rgba(0, 0, 0, 0.2)',
        borderRadius: 8,
        ...(isVertical ? {} : { flexWrap: 'wrap' }),
      }}
    >
      {PANEL_METADATA.map(meta => (
        <PanelTab
          key={meta.id}
          meta={meta}
          isSelected={selectedPanel === meta.id}
          isDisabled={isPanelDisabled(meta.id, disabledPanels)}
          onSelect={() => onSelect(meta.id)}
          compact={compact}
          showDescription={showDescriptions}
        />
      ))}
    </div>
  );
}

// ============================================================================
// Additional Navigation Components
// ============================================================================

interface PanelBreadcrumbProps {
  readonly currentPanel: PanelType;
  readonly compact?: boolean;
}

/**
 * Simple breadcrumb showing current panel location
 */
export function PanelBreadcrumb({
  currentPanel,
  compact = false,
}: PanelBreadcrumbProps) {
  const meta = getPanelMeta(currentPanel);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        fontSize: compact ? 10 : 11,
        color: '#888',
      }}
    >
      <span>Analysis</span>
      <span style={{ color: '#555' }}>/</span>
      <span style={{ color: meta.color, fontWeight: 600 }}>
        {meta.shortLabel}
      </span>
    </div>
  );
}

interface PanelHeaderProps {
  readonly currentPanel: PanelType;
  readonly decisionCount: number;
  readonly currentIndex: number;
  readonly compact?: boolean;
}

/**
 * Panel header with context information
 */
export function PanelHeader({
  currentPanel,
  decisionCount,
  currentIndex,
  compact = false,
}: PanelHeaderProps) {
  const meta = getPanelMeta(currentPanel);

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: compact ? '8px 12px' : '10px 16px',
        background: `${meta.color}10`,
        borderBottom: `1px solid ${meta.color}30`,
        borderRadius: '8px 8px 0 0',
      }}
    >
      {/* Title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: compact ? 14 : 16, color: meta.color }}>
          {meta.icon}
        </span>
        <span
          style={{
            fontSize: compact ? 12 : 14,
            fontWeight: 700,
            color: meta.color,
          }}
        >
          {meta.label}
        </span>
      </div>

      {/* Context Info */}
      <div
        style={{
          display: 'flex',
          gap: compact ? 8 : 12,
          fontSize: compact ? 9 : 10,
          color: '#888',
        }}
      >
        <span>
          Decision{' '}
          <strong style={{ color: '#d0d0d0' }}>
            {currentIndex + 1}
          </strong>{' '}
          of {decisionCount}
        </span>
      </div>
    </div>
  );
}

// ============================================================================
// Quick Panel Switcher (Minimal)
// ============================================================================

interface QuickPanelSwitcherProps {
  readonly selectedPanel: PanelType;
  readonly onSelect: (panel: PanelType) => void;
}

/**
 * Minimal icon-only panel switcher for compact layouts
 */
export function QuickPanelSwitcher({
  selectedPanel,
  onSelect,
}: QuickPanelSwitcherProps) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 2,
        padding: 2,
        background: 'rgba(0, 0, 0, 0.3)',
        borderRadius: 6,
      }}
    >
      {PANEL_METADATA.map(meta => {
        const isSelected = selectedPanel === meta.id;
        return (
          <div
            key={meta.id}
            onClick={() => onSelect(meta.id)}
            style={{
              width: 28,
              height: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 4,
              cursor: 'pointer',
              background: isSelected ? `${meta.color}30` : 'transparent',
              color: isSelected ? meta.color : '#666',
              fontSize: 14,
              transition: 'all 0.15s ease',
            }}
            title={meta.label}
          >
            {meta.icon}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// Exports
// ============================================================================

export type { PanelType, PanelMeta, PanelNavigatorProps };
export { PANEL_METADATA, getPanelMeta };
