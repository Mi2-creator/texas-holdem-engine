// ============================================================================
// PhaseProgressIndicator - Visual Hand Phase Progress (Read-Only)
// ============================================================================
//
// 【Post-Freeze Extension】Replay Architecture Freeze Declaration v1.0 Compliant
//
// 层级: UI Layer (纯展示)
// 职责: 可视化当前手牌进度（Preflop → Flop → Turn → River → Showdown）
//
// 约束:
//   - 只读 props，无内部状态
//   - 不 import src/replay/** 或 src/commands/**
//   - 不调用 EventProcessor
//   - 不使用 React Hooks（纯函数组件）
//   - 不修改或缓存任何输入数据
//
// ============================================================================

import React from 'react';

// ============================================================================
// 本地类型定义（不依赖 src/replay/** 或 src/types/**）
// ============================================================================

interface PhaseInfo {
  readonly phase: string;
  readonly street?: string;
  readonly isActive: boolean;
}

interface PhaseProgressIndicatorProps {
  readonly currentPhase: string;
  readonly currentStreet?: string;
  readonly isHandActive: boolean;
  readonly compact?: boolean;
}

// ============================================================================
// 常量定义（纯值）
// ============================================================================

const PHASES = ['PREFLOP', 'FLOP', 'TURN', 'RIVER', 'SHOWDOWN'] as const;

const PHASE_LABELS: Record<string, string> = {
  PREFLOP: 'Pre',
  FLOP: 'Flop',
  TURN: 'Turn',
  RIVER: 'River',
  SHOWDOWN: 'Show',
};

const PHASE_COLORS: Record<string, string> = {
  PREFLOP: '#8b5cf6',
  FLOP: '#3b82f6',
  TURN: '#06b6d4',
  RIVER: '#22c55e',
  SHOWDOWN: '#f59e0b',
};

// ============================================================================
// 纯函数：派生计算
// ============================================================================

/**
 * 获取阶段索引（纯函数）
 */
function getPhaseIndex(phase: string, street?: string): number {
  // 优先使用 street（如果有）
  const normalizedPhase = (street ?? phase).toUpperCase();

  const index = PHASES.indexOf(normalizedPhase as typeof PHASES[number]);
  return index >= 0 ? index : -1;
}

/**
 * 计算进度百分比（纯函数）
 */
function calculateProgress(currentIndex: number): number {
  if (currentIndex < 0) return 0;
  return ((currentIndex + 1) / PHASES.length) * 100;
}

/**
 * 判断阶段状态（纯函数）
 */
function getPhaseStatus(
  phaseIndex: number,
  currentIndex: number
): 'completed' | 'current' | 'pending' {
  if (phaseIndex < currentIndex) return 'completed';
  if (phaseIndex === currentIndex) return 'current';
  return 'pending';
}

// ============================================================================
// Sub-components（纯函数组件）
// ============================================================================

interface PhaseNodeProps {
  readonly phase: string;
  readonly index: number;
  readonly status: 'completed' | 'current' | 'pending';
  readonly compact?: boolean;
}

function PhaseNode({ phase, index, status, compact = false }: PhaseNodeProps) {
  const color = PHASE_COLORS[phase] ?? '#6b7280';
  const label = PHASE_LABELS[phase] ?? phase;

  const nodeSize = compact ? 20 : 28;
  const fontSize = compact ? 7 : 9;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: compact ? 2 : 4,
      }}
    >
      {/* 节点圆圈 */}
      <div
        style={{
          width: nodeSize,
          height: nodeSize,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: compact ? 10 : 12,
          fontWeight: 700,
          transition: 'all 0.2s ease',
          ...(status === 'completed'
            ? {
                background: color,
                color: '#fff',
                boxShadow: `0 0 8px ${color}40`,
              }
            : status === 'current'
            ? {
                background: `${color}30`,
                border: `2px solid ${color}`,
                color: color,
                boxShadow: `0 0 12px ${color}60`,
                animation: 'pulse 1.5s infinite',
              }
            : {
                background: 'rgba(100, 100, 100, 0.2)',
                border: '2px solid rgba(100, 100, 100, 0.3)',
                color: '#555',
              }),
        }}
      >
        {status === 'completed' ? '\u2713' : index + 1}
      </div>

      {/* 标签 */}
      <span
        style={{
          fontSize: fontSize,
          fontWeight: status === 'current' ? 700 : 500,
          color: status === 'pending' ? '#555' : color,
          textTransform: 'uppercase',
          letterSpacing: '0.3px',
        }}
      >
        {label}
      </span>
    </div>
  );
}

interface ConnectorLineProps {
  readonly status: 'completed' | 'pending';
  readonly color: string;
  readonly compact?: boolean;
}

function ConnectorLine({ status, color, compact = false }: ConnectorLineProps) {
  return (
    <div
      style={{
        flex: 1,
        height: compact ? 2 : 3,
        margin: `0 ${compact ? 4 : 6}px`,
        marginBottom: compact ? 14 : 18, // Align with nodes
        borderRadius: 2,
        background:
          status === 'completed'
            ? `linear-gradient(90deg, ${color}, ${color})`
            : 'rgba(100, 100, 100, 0.2)',
        transition: 'background 0.3s ease',
      }}
    />
  );
}

// ============================================================================
// PhaseProgressIndicator - Main Component
// ============================================================================

export function PhaseProgressIndicator({
  currentPhase,
  currentStreet,
  isHandActive,
  compact = false,
}: PhaseProgressIndicatorProps) {
  // 纯函数计算
  const currentIndex = getPhaseIndex(currentPhase, currentStreet);
  const progress = calculateProgress(currentIndex);

  // 非活跃状态
  if (!isHandActive) {
    return (
      <div
        style={{
          padding: compact ? '8px 12px' : '12px 16px',
          background: 'rgba(100, 100, 100, 0.1)',
          border: '1px solid rgba(100, 100, 100, 0.2)',
          borderRadius: 8,
          textAlign: 'center',
        }}
      >
        <span
          style={{
            fontSize: compact ? 10 : 11,
            color: '#666',
          }}
        >
          No active hand
        </span>
      </div>
    );
  }

  return (
    <div
      style={{
        background: 'rgba(139, 92, 246, 0.08)',
        border: '1px solid rgba(139, 92, 246, 0.2)',
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
          borderBottom: '1px solid rgba(139, 92, 246, 0.15)',
          background: 'rgba(139, 92, 246, 0.05)',
        }}
      >
        <span
          style={{
            fontSize: compact ? 9 : 10,
            color: '#a78bfa',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            fontWeight: 600,
          }}
        >
          Hand Progress
        </span>
        <span
          style={{
            fontSize: compact ? 9 : 10,
            color: '#c4b5fd',
          }}
        >
          {Math.round(progress)}%
        </span>
      </div>

      {/* 进度条 */}
      <div
        style={{
          height: compact ? 3 : 4,
          background: 'rgba(100, 100, 100, 0.2)',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${progress}%`,
            background: 'linear-gradient(90deg, #8b5cf6, #3b82f6, #06b6d4, #22c55e)',
            transition: 'width 0.3s ease',
          }}
        />
      </div>

      {/* 阶段节点 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          padding: compact ? '10px 8px 8px' : '14px 12px 10px',
        }}
      >
        {PHASES.map((phase, index) => {
          const status = getPhaseStatus(index, currentIndex);
          const color = PHASE_COLORS[phase];

          return (
            <React.Fragment key={phase}>
              <PhaseNode
                phase={phase}
                index={index}
                status={status}
                compact={compact}
              />
              {index < PHASES.length - 1 && (
                <ConnectorLine
                  status={index < currentIndex ? 'completed' : 'pending'}
                  color={color}
                  compact={compact}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// 导出
// ============================================================================

export { getPhaseIndex, calculateProgress, getPhaseStatus, PHASES, PHASE_LABELS, PHASE_COLORS };
export type { PhaseProgressIndicatorProps };
