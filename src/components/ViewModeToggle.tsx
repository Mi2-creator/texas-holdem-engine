// ============================================================================
// ViewModeToggle - 视图模式切换组件
// ============================================================================
//
// 纯展示组件，用于切换 Player View 和 Debug View。
//
// ============================================================================

import React from 'react';

export type ViewMode = 'player' | 'debug';

interface ViewModeToggleProps {
  /** 当前视图模式 */
  mode: ViewMode;
  /** 模式切换回调 */
  onModeChange: (mode: ViewMode) => void;
}

/**
 * ViewModeToggle - 视图模式切换按钮
 */
export function ViewModeToggle({ mode, onModeChange }: ViewModeToggleProps) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 0,
        borderRadius: 6,
        overflow: 'hidden',
        border: '1px solid #ccc',
        width: 'fit-content',
      }}
    >
      <button
        onClick={() => onModeChange('player')}
        style={{
          padding: '8px 16px',
          border: 'none',
          background: mode === 'player' ? '#4a90d9' : '#f5f5f5',
          color: mode === 'player' ? '#fff' : '#333',
          fontWeight: mode === 'player' ? 'bold' : 'normal',
          cursor: 'pointer',
          fontSize: 13,
          transition: 'background 0.2s, color 0.2s',
        }}
      >
        Player View
      </button>
      <button
        onClick={() => onModeChange('debug')}
        style={{
          padding: '8px 16px',
          border: 'none',
          borderLeft: '1px solid #ccc',
          background: mode === 'debug' ? '#4a90d9' : '#f5f5f5',
          color: mode === 'debug' ? '#fff' : '#333',
          fontWeight: mode === 'debug' ? 'bold' : 'normal',
          cursor: 'pointer',
          fontSize: 13,
          transition: 'background 0.2s, color 0.2s',
        }}
      >
        Debug View
      </button>
    </div>
  );
}
