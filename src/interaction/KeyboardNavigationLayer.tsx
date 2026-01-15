// ============================================================================
// KeyboardNavigationLayer - Stateless Keyboard Event Handling
// ============================================================================
//
// 【Product Polish Phase】Replay Architecture Freeze Declaration v1.0 Compliant
//
// 层级: Interaction Layer (事件委托)
// 职责: 提供键盘导航支持，通过事件委托和回调实现，无内部状态
//
// 约束:
//   - 不使用 React Hooks（通过 props 和回调实现）
//   - 不 import src/replay/** 或 src/commands/**
//   - 不调用 EventProcessor
//   - 不构造 ReplayEvent
//   - 不修改任何外部状态（仅通过回调通知）
//   - 所有交互通过 callback props 传递
//
// 键盘映射:
//   - ArrowLeft / ArrowRight: 上一个 / 下一个决策索引
//   - ArrowUp / ArrowDown: 循环切换面板
//   - Enter: 切换聚焦决策视图
//   - Escape: 关闭聚焦视图
//   - Home / End: 跳转到第一个 / 最后一个决策
//   - 1-4: 直接选择面板
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
//   - H-2 边界安全: 检查索引边界后再回调
//   - H-3 无副作用: 纯事件处理 + 回调传递
//   - H-4 值语义: 不修改任何值
//
// ============================================================================

import React from 'react';

import type { PanelType } from '../components/PanelNavigator';

// ============================================================================
// Types
// ============================================================================

/**
 * Keyboard navigation action types
 */
type NavigationAction =
  | 'prev-decision'
  | 'next-decision'
  | 'first-decision'
  | 'last-decision'
  | 'prev-panel'
  | 'next-panel'
  | 'select-panel-1'
  | 'select-panel-2'
  | 'select-panel-3'
  | 'select-panel-4'
  | 'toggle-focus'
  | 'close-focus'
  | 'toggle-density';

/**
 * Key mapping entry
 */
interface KeyMapping {
  readonly key: string;
  readonly action: NavigationAction;
  readonly description: string;
  readonly modifiers?: {
    readonly ctrl?: boolean;
    readonly shift?: boolean;
    readonly alt?: boolean;
  };
}

/**
 * Keyboard navigation callbacks
 */
interface KeyboardCallbacks {
  readonly onIndexChange?: (newIndex: number) => void;
  readonly onPanelChange?: (newPanel: PanelType) => void;
  readonly onToggleFocus?: () => void;
  readonly onCloseFocus?: () => void;
  readonly onToggleDensity?: () => void;
}

/**
 * Keyboard navigation state (passed as props, not stored)
 */
interface KeyboardNavigationState {
  readonly currentIndex: number;
  readonly maxIndex: number;
  readonly currentPanel: PanelType;
  readonly isFocusMode: boolean;
}

/**
 * KeyboardNavigationLayer Props
 */
interface KeyboardNavigationLayerProps {
  readonly state: KeyboardNavigationState;
  readonly callbacks: KeyboardCallbacks;
  readonly enabled?: boolean;
  readonly children: React.ReactNode;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Panel order for cycling
 */
const PANEL_ORDER: readonly PanelType[] = [
  'narrative',
  'insight',
  'comparison',
  'alignment',
] as const;

/**
 * Default key mappings
 */
const DEFAULT_KEY_MAPPINGS: readonly KeyMapping[] = [
  // Decision Navigation
  { key: 'ArrowLeft', action: 'prev-decision', description: 'Previous decision' },
  { key: 'ArrowRight', action: 'next-decision', description: 'Next decision' },
  { key: 'Home', action: 'first-decision', description: 'First decision' },
  { key: 'End', action: 'last-decision', description: 'Last decision' },

  // Panel Navigation
  { key: 'ArrowUp', action: 'prev-panel', description: 'Previous panel' },
  { key: 'ArrowDown', action: 'next-panel', description: 'Next panel' },
  { key: '1', action: 'select-panel-1', description: 'Narrative panel' },
  { key: '2', action: 'select-panel-2', description: 'Insight panel' },
  { key: '3', action: 'select-panel-3', description: 'Comparison panel' },
  { key: '4', action: 'select-panel-4', description: 'Alignment panel' },

  // Focus Mode
  { key: 'Enter', action: 'toggle-focus', description: 'Toggle focus view' },
  { key: 'Escape', action: 'close-focus', description: 'Close focus view' },

  // Density Toggle
  { key: 'd', action: 'toggle-density', description: 'Toggle compact mode' },
] as const;

// ============================================================================
// Pure Helper Functions
// ============================================================================

/**
 * Get action from key event (pure function)
 */
function getActionFromKeyEvent(
  event: React.KeyboardEvent,
  mappings: readonly KeyMapping[] = DEFAULT_KEY_MAPPINGS
): NavigationAction | null {
  for (const mapping of mappings) {
    if (mapping.key !== event.key) continue;

    // Check modifiers if specified
    if (mapping.modifiers) {
      if (mapping.modifiers.ctrl && !event.ctrlKey) continue;
      if (mapping.modifiers.shift && !event.shiftKey) continue;
      if (mapping.modifiers.alt && !event.altKey) continue;
    }

    return mapping.action;
  }

  return null;
}

/**
 * Get next panel in cycle (pure function)
 */
function getNextPanel(currentPanel: PanelType, direction: 1 | -1): PanelType {
  const currentIdx = PANEL_ORDER.indexOf(currentPanel);
  const nextIdx = (currentIdx + direction + PANEL_ORDER.length) % PANEL_ORDER.length;
  return PANEL_ORDER[nextIdx];
}

/**
 * Get panel by number key (pure function)
 */
function getPanelByNumber(num: 1 | 2 | 3 | 4): PanelType {
  return PANEL_ORDER[num - 1];
}

/**
 * Clamp index to valid range (pure function)
 */
function clampIndex(index: number, maxIndex: number): number {
  if (index < 0) return 0;
  if (index > maxIndex) return maxIndex;
  return index;
}

/**
 * Process navigation action (pure function)
 * Returns the callback to invoke, if any
 */
function processAction(
  action: NavigationAction,
  state: KeyboardNavigationState,
  callbacks: KeyboardCallbacks
): void {
  switch (action) {
    case 'prev-decision':
      if (callbacks.onIndexChange && state.currentIndex > 0) {
        callbacks.onIndexChange(state.currentIndex - 1);
      }
      break;

    case 'next-decision':
      if (callbacks.onIndexChange && state.currentIndex < state.maxIndex) {
        callbacks.onIndexChange(state.currentIndex + 1);
      }
      break;

    case 'first-decision':
      if (callbacks.onIndexChange && state.currentIndex !== 0) {
        callbacks.onIndexChange(0);
      }
      break;

    case 'last-decision':
      if (callbacks.onIndexChange && state.currentIndex !== state.maxIndex) {
        callbacks.onIndexChange(state.maxIndex);
      }
      break;

    case 'prev-panel':
      if (callbacks.onPanelChange) {
        callbacks.onPanelChange(getNextPanel(state.currentPanel, -1));
      }
      break;

    case 'next-panel':
      if (callbacks.onPanelChange) {
        callbacks.onPanelChange(getNextPanel(state.currentPanel, 1));
      }
      break;

    case 'select-panel-1':
      if (callbacks.onPanelChange) {
        callbacks.onPanelChange(getPanelByNumber(1));
      }
      break;

    case 'select-panel-2':
      if (callbacks.onPanelChange) {
        callbacks.onPanelChange(getPanelByNumber(2));
      }
      break;

    case 'select-panel-3':
      if (callbacks.onPanelChange) {
        callbacks.onPanelChange(getPanelByNumber(3));
      }
      break;

    case 'select-panel-4':
      if (callbacks.onPanelChange) {
        callbacks.onPanelChange(getPanelByNumber(4));
      }
      break;

    case 'toggle-focus':
      if (callbacks.onToggleFocus) {
        callbacks.onToggleFocus();
      }
      break;

    case 'close-focus':
      if (callbacks.onCloseFocus && state.isFocusMode) {
        callbacks.onCloseFocus();
      }
      break;

    case 'toggle-density':
      if (callbacks.onToggleDensity) {
        callbacks.onToggleDensity();
      }
      break;
  }
}

// ============================================================================
// KeyboardNavigationLayer - Main Component
// ============================================================================

/**
 * Keyboard navigation wrapper component
 * Handles keyboard events via onKeyDown delegation
 */
export function KeyboardNavigationLayer({
  state,
  callbacks,
  enabled = true,
  children,
}: KeyboardNavigationLayerProps) {
  /**
   * Handle key down event (pure event handler)
   */
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (!enabled) return;

    // Ignore if target is an input element
    const target = event.target as HTMLElement;
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable
    ) {
      return;
    }

    const action = getActionFromKeyEvent(event);
    if (action) {
      event.preventDefault();
      processAction(action, state, callbacks);
    }
  };

  return (
    <div
      onKeyDown={handleKeyDown}
      tabIndex={0}
      style={{
        outline: 'none',
        width: '100%',
        height: '100%',
      }}
    >
      {children}
    </div>
  );
}

// ============================================================================
// Keyboard Help Display Component
// ============================================================================

interface KeyboardHelpProps {
  readonly compact?: boolean;
  readonly showAll?: boolean;
}

/**
 * Display keyboard shortcuts help
 */
export function KeyboardHelp({ compact = false, showAll = false }: KeyboardHelpProps) {
  const displayMappings = showAll
    ? DEFAULT_KEY_MAPPINGS
    : DEFAULT_KEY_MAPPINGS.slice(0, 6);

  return (
    <div
      style={{
        padding: compact ? '8px 10px' : '12px 16px',
        background: 'rgba(0, 0, 0, 0.3)',
        borderRadius: 8,
        border: '1px solid rgba(100, 100, 100, 0.2)',
      }}
    >
      <div
        style={{
          fontSize: compact ? 9 : 10,
          color: '#888',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          marginBottom: compact ? 6 : 10,
        }}
      >
        Keyboard Shortcuts
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'auto 1fr',
          gap: compact ? '4px 12px' : '6px 16px',
        }}
      >
        {displayMappings.map((mapping, idx) => (
          <React.Fragment key={idx}>
            <kbd
              style={{
                padding: compact ? '2px 6px' : '3px 8px',
                background: 'rgba(100, 100, 100, 0.2)',
                borderRadius: 4,
                border: '1px solid rgba(100, 100, 100, 0.3)',
                fontSize: compact ? 9 : 10,
                fontFamily: 'monospace',
                color: '#d0d0d0',
              }}
            >
              {mapping.key}
            </kbd>
            <span
              style={{
                fontSize: compact ? 10 : 11,
                color: '#9ca3af',
              }}
            >
              {mapping.description}
            </span>
          </React.Fragment>
        ))}
      </div>

      {!showAll && DEFAULT_KEY_MAPPINGS.length > 6 && (
        <div
          style={{
            marginTop: compact ? 6 : 8,
            fontSize: compact ? 8 : 9,
            color: '#666',
            fontStyle: 'italic',
          }}
        >
          +{DEFAULT_KEY_MAPPINGS.length - 6} more shortcuts
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Inline Keyboard Hint Component
// ============================================================================

interface KeyboardHintProps {
  readonly keys: readonly string[];
  readonly action: string;
  readonly compact?: boolean;
}

/**
 * Inline keyboard hint for specific actions
 */
export function KeyboardHint({ keys, action, compact = false }: KeyboardHintProps) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: compact ? 9 : 10,
        color: '#666',
      }}
    >
      {keys.map((key, idx) => (
        <React.Fragment key={idx}>
          {idx > 0 && <span>/</span>}
          <kbd
            style={{
              padding: '1px 4px',
              background: 'rgba(100, 100, 100, 0.2)',
              borderRadius: 3,
              fontSize: compact ? 8 : 9,
              fontFamily: 'monospace',
              color: '#888',
            }}
          >
            {key}
          </kbd>
        </React.Fragment>
      ))}
      <span style={{ marginLeft: 2 }}>{action}</span>
    </div>
  );
}

// ============================================================================
// Navigation Status Bar Component
// ============================================================================

interface NavigationStatusBarProps {
  readonly state: KeyboardNavigationState;
  readonly compact?: boolean;
}

/**
 * Status bar showing current navigation state
 */
export function NavigationStatusBar({
  state,
  compact = false,
}: NavigationStatusBarProps) {
  const panelLabels: Record<PanelType, string> = {
    narrative: 'Narrative',
    insight: 'Insight',
    comparison: 'Comparison',
    alignment: 'Alignment',
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: compact ? '4px 8px' : '6px 12px',
        background: 'rgba(0, 0, 0, 0.2)',
        borderRadius: 6,
        fontSize: compact ? 9 : 10,
        color: '#888',
      }}
    >
      {/* Decision Position */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span>Decision</span>
        <span
          style={{
            padding: '2px 8px',
            background: 'rgba(59, 130, 246, 0.2)',
            borderRadius: 4,
            color: '#3b82f6',
            fontWeight: 600,
          }}
        >
          {state.currentIndex + 1} / {state.maxIndex + 1}
        </span>
        <KeyboardHint keys={['←', '→']} action="navigate" compact={compact} />
      </div>

      {/* Current Panel */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span>Panel</span>
        <span
          style={{
            padding: '2px 8px',
            background: 'rgba(167, 139, 250, 0.2)',
            borderRadius: 4,
            color: '#a78bfa',
            fontWeight: 600,
          }}
        >
          {panelLabels[state.currentPanel]}
        </span>
        <KeyboardHint keys={['↑', '↓']} action="switch" compact={compact} />
      </div>

      {/* Focus Mode Indicator */}
      {state.isFocusMode && (
        <div
          style={{
            padding: '2px 8px',
            background: 'rgba(34, 197, 94, 0.2)',
            borderRadius: 4,
            color: '#22c55e',
            fontWeight: 600,
          }}
        >
          FOCUS MODE
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Exports
// ============================================================================

export type {
  NavigationAction,
  KeyMapping,
  KeyboardCallbacks,
  KeyboardNavigationState,
  KeyboardNavigationLayerProps,
};

export {
  DEFAULT_KEY_MAPPINGS,
  PANEL_ORDER,
  getActionFromKeyEvent,
  getNextPanel,
  getPanelByNumber,
  clampIndex,
  processAction,
};
