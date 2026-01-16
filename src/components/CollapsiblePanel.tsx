// ============================================================================
// CollapsiblePanel - Collapsible Panel Wrapper
// ============================================================================
//
// 【Phase 4】Experience Implementation - Collapsible Panel Component
//
// 层级: UI Layer (纯展示)
// 职责: 包裹分析面板，提供展开/折叠能力
//
// 设计原则:
//   - 纯函数组件
//   - 不管理自身折叠状态（由父组件通过 visibility prop 控制）
//   - 支持平滑过渡动画
//
// ============================================================================

import React from 'react';

// ============================================================================
// Type Definitions
// ============================================================================

type PanelVisibilityState = 'primary' | 'collapsed' | 'hidden';

interface CollapsiblePanelProps {
  /** 子组件（分析面板） */
  readonly children: React.ReactNode;
  /** 面板标题 */
  readonly title: string;
  /** 显示状态 */
  readonly visibility: PanelVisibilityState;
  /** 面板颜色主题 */
  readonly themeColor?: string;
  /** 是否紧凑模式 */
  readonly compact?: boolean;
  /** 点击标题时的回调（用于手动切换） */
  readonly onToggle?: () => void;
  /** 是否高亮显示 */
  readonly highlight?: boolean;
}

// ============================================================================
// Main Component
// ============================================================================

export function CollapsiblePanel({
  children,
  title,
  visibility,
  themeColor = '#888',
  compact = false,
  onToggle,
  highlight = false,
}: CollapsiblePanelProps) {
  // Hidden panels don't render at all
  if (visibility === 'hidden') {
    return null;
  }

  const isCollapsed = visibility === 'collapsed';
  const isPrimary = visibility === 'primary';

  return (
    <div
      style={{
        background: highlight
          ? `${themeColor}10`
          : isPrimary
          ? 'transparent'
          : 'rgba(100, 100, 100, 0.05)',
        border: highlight
          ? `2px solid ${themeColor}40`
          : isPrimary
          ? 'none'
          : '1px solid rgba(100, 100, 100, 0.1)',
        borderRadius: 8,
        overflow: 'hidden',
        transition: 'all 0.3s ease',
        marginBottom: compact ? 8 : 12,
      }}
    >
      {/* Collapsed Header (only shown when collapsed) */}
      {isCollapsed && (
        <div
          onClick={onToggle}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: compact ? '8px 12px' : '10px 14px',
            cursor: onToggle ? 'pointer' : 'default',
            transition: 'background 0.2s ease',
          }}
          onMouseEnter={(e) => {
            if (onToggle) {
              e.currentTarget.style.background = 'rgba(100, 100, 100, 0.1)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: compact ? 6 : 8,
            }}
          >
            {/* Expand icon */}
            <span
              style={{
                fontSize: compact ? 10 : 12,
                color: themeColor,
                transition: 'transform 0.3s ease',
              }}
            >
              ▸
            </span>
            <span
              style={{
                fontSize: compact ? 10 : 11,
                color: themeColor,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              {title}
            </span>
          </div>
          <span
            style={{
              fontSize: compact ? 8 : 9,
              color: '#666',
              fontStyle: 'italic',
            }}
          >
            Click to expand
          </span>
        </div>
      )}

      {/* Primary View Header (subtle, optional) */}
      {isPrimary && highlight && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: compact ? 6 : 8,
            padding: compact ? '6px 12px' : '8px 14px',
            borderBottom: `1px solid ${themeColor}20`,
            background: `${themeColor}08`,
          }}
        >
          <span
            style={{
              width: compact ? 6 : 8,
              height: compact ? 6 : 8,
              borderRadius: '50%',
              background: themeColor,
              animation: 'pulse 1.5s ease-in-out infinite',
            }}
          />
          <span
            style={{
              fontSize: compact ? 9 : 10,
              color: themeColor,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            {title} - Active
          </span>
        </div>
      )}

      {/* Content Area */}
      <div
        style={{
          maxHeight: isCollapsed ? 0 : 2000,
          opacity: isCollapsed ? 0 : 1,
          overflow: 'hidden',
          transition: 'max-height 0.4s ease, opacity 0.3s ease',
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ============================================================================
// Panel Group Component
// ============================================================================

interface PanelGroupProps {
  readonly children: React.ReactNode;
  readonly title?: string;
  readonly compact?: boolean;
}

export function PanelGroup({
  children,
  title,
  compact = false,
}: PanelGroupProps) {
  return (
    <div
      style={{
        marginTop: compact ? 12 : 16,
      }}
    >
      {title && (
        <div
          style={{
            fontSize: compact ? 8 : 9,
            color: '#666',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: compact ? 6 : 8,
            paddingLeft: 2,
          }}
        >
          {title}
        </div>
      )}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: compact ? 4 : 6,
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ============================================================================
// Export
// ============================================================================

export type { CollapsiblePanelProps, PanelVisibilityState };
