// ============================================================================
// PanelTransitions - CSS-Only Panel Transitions & Visual Continuity
// ============================================================================
//
// 【Product Polish Phase】Replay Architecture Freeze Declaration v1.0 Compliant
//
// 层级: Presentation Layer (纯 CSS 动画)
// 职责: 提供面板切换的视觉连续性，仅通过 CSS 实现，无动画库
//
// 约束:
//   - 不使用 React Hooks
//   - 不使用动画库（仅 CSS transitions/keyframes）
//   - 不 import src/replay/** 或 src/commands/**
//   - 不调用 EventProcessor
//   - 不构造 ReplayEvent
//   - 所有动画通过 CSS-in-JS 内联样式实现
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
//   - H-2 边界安全: 纯展示组件
//   - H-3 无副作用: 纯 CSS 渲染
//   - H-4 值语义: 不修改任何值
//
// ============================================================================

import React from 'react';

import type { PanelType } from '../components/PanelNavigator';

// ============================================================================
// Types
// ============================================================================

/**
 * Transition direction
 */
type TransitionDirection = 'left' | 'right' | 'up' | 'down' | 'fade';

/**
 * Transition timing
 */
type TransitionTiming = 'fast' | 'normal' | 'slow';

/**
 * Panel position for spatial transitions
 */
interface PanelPosition {
  readonly x: number;
  readonly y: number;
}

/**
 * PanelTransitionContainer Props
 */
interface PanelTransitionContainerProps {
  readonly currentPanel: PanelType;
  readonly previousPanel?: PanelType;
  readonly transitionEnabled?: boolean;
  readonly timing?: TransitionTiming;
  readonly children: React.ReactNode;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Panel spatial positions (for directional transitions)
 */
const PANEL_POSITIONS: Record<PanelType, PanelPosition> = {
  narrative: { x: 0, y: 0 },
  insight: { x: 1, y: 0 },
  comparison: { x: 0, y: 1 },
  alignment: { x: 1, y: 1 },
};

/**
 * Panel colors for visual distinction
 */
const PANEL_COLORS: Record<PanelType, string> = {
  narrative: '#a78bfa',
  insight: '#3b82f6',
  comparison: '#06b6d4',
  alignment: '#f472b6',
};

/**
 * Transition durations in milliseconds
 */
const TRANSITION_DURATIONS: Record<TransitionTiming, number> = {
  fast: 150,
  normal: 250,
  slow: 400,
};

// ============================================================================
// Pure Helper Functions
// ============================================================================

/**
 * Calculate transition direction between panels (pure function)
 */
function calculateTransitionDirection(
  from: PanelType,
  to: PanelType
): TransitionDirection {
  const fromPos = PANEL_POSITIONS[from];
  const toPos = PANEL_POSITIONS[to];

  const dx = toPos.x - fromPos.x;
  const dy = toPos.y - fromPos.y;

  if (dx > 0) return 'left';
  if (dx < 0) return 'right';
  if (dy > 0) return 'up';
  if (dy < 0) return 'down';

  return 'fade';
}

/**
 * Get transition CSS properties (pure function)
 */
function getTransitionStyles(
  direction: TransitionDirection,
  timing: TransitionTiming,
  isEntering: boolean
): React.CSSProperties {
  const duration = TRANSITION_DURATIONS[timing];
  const distance = 20;

  const baseTransition = `opacity ${duration}ms ease, transform ${duration}ms ease`;

  if (isEntering) {
    // Entering styles (start position)
    switch (direction) {
      case 'left':
        return {
          transform: `translateX(${distance}px)`,
          opacity: 0,
          transition: baseTransition,
        };
      case 'right':
        return {
          transform: `translateX(-${distance}px)`,
          opacity: 0,
          transition: baseTransition,
        };
      case 'up':
        return {
          transform: `translateY(${distance}px)`,
          opacity: 0,
          transition: baseTransition,
        };
      case 'down':
        return {
          transform: `translateY(-${distance}px)`,
          opacity: 0,
          transition: baseTransition,
        };
      case 'fade':
      default:
        return {
          opacity: 0,
          transition: baseTransition,
        };
    }
  } else {
    // Final position (visible)
    return {
      transform: 'translateX(0) translateY(0)',
      opacity: 1,
      transition: baseTransition,
    };
  }
}

/**
 * Get panel accent bar styles (pure function)
 */
function getPanelAccentStyles(panel: PanelType): React.CSSProperties {
  const color = PANEL_COLORS[panel];
  return {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    background: `linear-gradient(90deg, ${color}, ${color}80)`,
    transition: 'background 250ms ease',
  };
}

// ============================================================================
// Transition Container Components
// ============================================================================

/**
 * Main panel transition container
 */
export function PanelTransitionContainer({
  currentPanel,
  previousPanel,
  transitionEnabled = true,
  timing = 'normal',
  children,
}: PanelTransitionContainerProps) {
  const direction = previousPanel
    ? calculateTransitionDirection(previousPanel, currentPanel)
    : 'fade';

  const containerStyle: React.CSSProperties = {
    position: 'relative',
    width: '100%',
    minHeight: 200,
    overflow: 'hidden',
  };

  const contentStyle: React.CSSProperties = transitionEnabled
    ? getTransitionStyles(direction, timing, false)
    : {};

  return (
    <div style={containerStyle}>
      {/* Panel Accent Bar */}
      <div style={getPanelAccentStyles(currentPanel)} />

      {/* Content with transition */}
      <div style={{ ...contentStyle, paddingTop: 4 }}>{children}</div>
    </div>
  );
}

// ============================================================================
// Fade Transition Wrapper
// ============================================================================

interface FadeTransitionProps {
  readonly visible: boolean;
  readonly timing?: TransitionTiming;
  readonly children: React.ReactNode;
}

/**
 * Simple fade transition wrapper
 */
export function FadeTransition({
  visible,
  timing = 'normal',
  children,
}: FadeTransitionProps) {
  const duration = TRANSITION_DURATIONS[timing];

  return (
    <div
      style={{
        opacity: visible ? 1 : 0,
        transition: `opacity ${duration}ms ease`,
        pointerEvents: visible ? 'auto' : 'none',
      }}
    >
      {children}
    </div>
  );
}

// ============================================================================
// Slide Transition Wrapper
// ============================================================================

interface SlideTransitionProps {
  readonly visible: boolean;
  readonly direction?: 'left' | 'right' | 'up' | 'down';
  readonly timing?: TransitionTiming;
  readonly distance?: number;
  readonly children: React.ReactNode;
}

/**
 * Slide transition wrapper
 */
export function SlideTransition({
  visible,
  direction = 'up',
  timing = 'normal',
  distance = 20,
  children,
}: SlideTransitionProps) {
  const duration = TRANSITION_DURATIONS[timing];

  const getTransform = () => {
    if (visible) return 'translate(0, 0)';

    switch (direction) {
      case 'left':
        return `translateX(${distance}px)`;
      case 'right':
        return `translateX(-${distance}px)`;
      case 'up':
        return `translateY(${distance}px)`;
      case 'down':
        return `translateY(-${distance}px)`;
    }
  };

  return (
    <div
      style={{
        opacity: visible ? 1 : 0,
        transform: getTransform(),
        transition: `opacity ${duration}ms ease, transform ${duration}ms ease`,
        pointerEvents: visible ? 'auto' : 'none',
      }}
    >
      {children}
    </div>
  );
}

// ============================================================================
// Scale Transition Wrapper
// ============================================================================

interface ScaleTransitionProps {
  readonly visible: boolean;
  readonly timing?: TransitionTiming;
  readonly scale?: number;
  readonly children: React.ReactNode;
}

/**
 * Scale transition wrapper (useful for focus mode)
 */
export function ScaleTransition({
  visible,
  timing = 'normal',
  scale = 0.95,
  children,
}: ScaleTransitionProps) {
  const duration = TRANSITION_DURATIONS[timing];

  return (
    <div
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'scale(1)' : `scale(${scale})`,
        transition: `opacity ${duration}ms ease, transform ${duration}ms ease`,
        pointerEvents: visible ? 'auto' : 'none',
      }}
    >
      {children}
    </div>
  );
}

// ============================================================================
// Panel Indicator Animation
// ============================================================================

interface PanelIndicatorProps {
  readonly panels: readonly PanelType[];
  readonly currentPanel: PanelType;
  readonly onSelect?: (panel: PanelType) => void;
  readonly compact?: boolean;
}

/**
 * Animated panel indicator dots
 */
export function PanelIndicator({
  panels,
  currentPanel,
  onSelect,
  compact = false,
}: PanelIndicatorProps) {
  return (
    <div
      style={{
        display: 'flex',
        gap: compact ? 6 : 8,
        justifyContent: 'center',
        padding: compact ? '6px' : '8px',
      }}
    >
      {panels.map(panel => {
        const isActive = panel === currentPanel;
        const color = PANEL_COLORS[panel];

        return (
          <div
            key={panel}
            onClick={() => onSelect?.(panel)}
            style={{
              width: isActive ? (compact ? 20 : 24) : (compact ? 8 : 10),
              height: compact ? 8 : 10,
              borderRadius: compact ? 4 : 5,
              background: isActive ? color : `${color}40`,
              cursor: onSelect ? 'pointer' : 'default',
              transition: 'all 250ms ease',
            }}
            title={panel}
          />
        );
      })}
    </div>
  );
}

// ============================================================================
// Progress Bar Animation
// ============================================================================

interface ProgressBarProps {
  readonly progress: number; // 0-100
  readonly color?: string;
  readonly height?: number;
  readonly animated?: boolean;
}

/**
 * Animated progress bar
 */
export function ProgressBar({
  progress,
  color = '#3b82f6',
  height = 4,
  animated = true,
}: ProgressBarProps) {
  const clampedProgress = Math.max(0, Math.min(100, progress));

  return (
    <div
      style={{
        width: '100%',
        height,
        background: 'rgba(100, 100, 100, 0.2)',
        borderRadius: height / 2,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          width: `${clampedProgress}%`,
          height: '100%',
          background: animated
            ? `linear-gradient(90deg, ${color}80, ${color})`
            : color,
          borderRadius: height / 2,
          transition: animated ? 'width 300ms ease' : 'none',
        }}
      />
    </div>
  );
}

// ============================================================================
// Highlight Pulse Animation
// ============================================================================

interface HighlightPulseProps {
  readonly active: boolean;
  readonly color?: string;
  readonly children: React.ReactNode;
}

/**
 * Subtle pulse highlight for important elements
 */
export function HighlightPulse({
  active,
  color = '#3b82f6',
  children,
}: HighlightPulseProps) {
  return (
    <div
      style={{
        position: 'relative',
        display: 'inline-block',
      }}
    >
      {children}
      {active && (
        <div
          style={{
            position: 'absolute',
            top: -2,
            left: -2,
            right: -2,
            bottom: -2,
            borderRadius: 6,
            border: `2px solid ${color}`,
            opacity: 0.5,
            animation: 'pulse 2s ease-in-out infinite',
          }}
        />
      )}
    </div>
  );
}

// ============================================================================
// Focus Mode Overlay
// ============================================================================

interface FocusModeOverlayProps {
  readonly visible: boolean;
  readonly onClose?: () => void;
  readonly children: React.ReactNode;
}

/**
 * Focus mode overlay with backdrop
 */
export function FocusModeOverlay({
  visible,
  onClose,
  children,
}: FocusModeOverlayProps) {
  if (!visible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        opacity: visible ? 1 : 0,
        transition: 'opacity 250ms ease',
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: '90vw',
          maxHeight: '90vh',
          overflow: 'auto',
          transform: visible ? 'scale(1)' : 'scale(0.95)',
          transition: 'transform 250ms ease',
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ============================================================================
// CSS Keyframes (injected as style tag would be, described here)
// ============================================================================

/**
 * CSS Keyframes definitions (for reference/documentation)
 * In a real app, these would be in a CSS file or injected via styled-components
 *
 * @keyframes pulse {
 *   0%, 100% { opacity: 0.5; transform: scale(1); }
 *   50% { opacity: 0.8; transform: scale(1.02); }
 * }
 *
 * @keyframes fadeIn {
 *   from { opacity: 0; }
 *   to { opacity: 1; }
 * }
 *
 * @keyframes slideInUp {
 *   from { opacity: 0; transform: translateY(20px); }
 *   to { opacity: 1; transform: translateY(0); }
 * }
 */

// ============================================================================
// Exports
// ============================================================================

export type {
  TransitionDirection,
  TransitionTiming,
  PanelPosition,
  PanelTransitionContainerProps,
};

export {
  PANEL_POSITIONS,
  PANEL_COLORS,
  TRANSITION_DURATIONS,
  calculateTransitionDirection,
  getTransitionStyles,
  getPanelAccentStyles,
};
