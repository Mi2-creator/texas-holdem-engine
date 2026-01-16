// ============================================================================
// MinimalErrorBoundary - 极简错误边界组件
// ============================================================================
//
// 【稳定化阶段】防白屏 Error Boundary
//
// 职责: 捕获子组件渲染错误，渲染静态 fallback，防止整个应用白屏
//
// 约束:
//   - 不使用 React Hooks（使用 class 组件实现 Error Boundary）
//   - 不依赖任何外部数据
//   - fallback 是完全静态的 UI
//   - 保留 console.error 用于调试
//
// ============================================================================

import React from 'react';

/**
 * Error Boundary Props
 */
interface MinimalErrorBoundaryProps {
  /** 子组件 */
  readonly children: React.ReactNode;
  /** 可选：面板名称，用于错误提示 */
  readonly panelName?: string;
  /** 可选：紧凑模式 */
  readonly compact?: boolean;
}

/**
 * Error Boundary State
 */
interface MinimalErrorBoundaryState {
  readonly hasError: boolean;
  readonly errorMessage: string;
}

/**
 * 极简 Error Boundary
 * 使用 class 组件实现（React Error Boundary 必须使用 class 组件）
 */
export class MinimalErrorBoundary extends React.Component<
  MinimalErrorBoundaryProps,
  MinimalErrorBoundaryState
> {
  constructor(props: MinimalErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: '',
    };
  }

  /**
   * 静态方法：从错误中派生状态
   */
  static getDerivedStateFromError(error: Error): MinimalErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message ?? 'Unknown error',
    };
  }

  /**
   * 捕获错误并记录到 console
   */
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // 保留 console.error 用于调试
    console.error('[MinimalErrorBoundary] Caught error:', error);
    console.error('[MinimalErrorBoundary] Error info:', errorInfo);
  }

  /**
   * 渲染
   */
  render(): React.ReactNode {
    const { hasError, errorMessage } = this.state;
    const { children, panelName = 'Panel', compact = false } = this.props;

    if (hasError) {
      // 静态 fallback UI - 不依赖任何数据
      return (
        <div
          style={{
            padding: compact ? '8px 12px' : '12px 16px',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 8,
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontSize: compact ? 10 : 12,
              color: '#ef4444',
              fontWeight: 600,
              marginBottom: compact ? 4 : 6,
            }}
          >
            {panelName} Error
          </div>
          <div
            style={{
              fontSize: compact ? 9 : 11,
              color: '#9ca3af',
            }}
          >
            Unable to render this section
          </div>
          {/* 仅在开发环境显示错误消息 */}
          {process.env.NODE_ENV === 'development' && errorMessage && (
            <div
              style={{
                marginTop: compact ? 6 : 8,
                padding: '4px 8px',
                background: 'rgba(100, 100, 100, 0.2)',
                borderRadius: 4,
                fontSize: compact ? 8 : 9,
                color: '#888',
                fontFamily: 'monospace',
                wordBreak: 'break-word',
              }}
            >
              {errorMessage}
            </div>
          )}
        </div>
      );
    }

    return children;
  }
}

// 默认导出
export default MinimalErrorBoundary;
