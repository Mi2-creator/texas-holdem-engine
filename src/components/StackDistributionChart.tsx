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
// StackDistributionChart - Player Stack Visualization (Read-Only)
// ============================================================================
//
// 【Post-Freeze Extension】Replay Architecture Freeze Declaration v1.0 Compliant
//
// 层级: UI Layer (纯展示)
// 职责: 可视化玩家筹码分布，展示相对筹码量
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

interface PlayerStackInfo {
  readonly id: string;
  readonly name: string;
  readonly chips: number;
  readonly status: string;
  readonly isCurrentPlayer?: boolean;
}

interface StackDistributionChartProps {
  readonly players: readonly PlayerStackInfo[];
  readonly currentPlayerId?: string;
  readonly title?: string;
  readonly compact?: boolean;
  readonly showPercentages?: boolean;
}

// ============================================================================
// 纯函数：派生计算
// ============================================================================

/**
 * 计算总筹码（纯函数）
 */
function calculateTotalChips(players: readonly PlayerStackInfo[]): number {
  let total = 0;
  for (const player of players) {
    total += player.chips;
  }
  return total;
}

/**
 * 计算筹码百分比（纯函数）
 */
function calculateChipPercentage(chips: number, total: number): number {
  if (total === 0) return 0;
  return (chips / total) * 100;
}

/**
 * 获取最大筹码数（纯函数）
 */
function getMaxChips(players: readonly PlayerStackInfo[]): number {
  let max = 0;
  for (const player of players) {
    if (player.chips > max) {
      max = player.chips;
    }
  }
  return max;
}

/**
 * 获取玩家状态颜色（纯函数）
 */
function getStatusColor(status: string): string {
  switch (status.toLowerCase()) {
    case 'active':
      return '#22c55e';
    case 'folded':
      return '#ef4444';
    case 'allin':
    case 'all-in':
      return '#f59e0b';
    case 'waiting':
      return '#6b7280';
    default:
      return '#3b82f6';
  }
}

/**
 * 获取筹码条颜色（纯函数）
 */
function getBarColor(index: number, isCurrentPlayer: boolean): string {
  if (isCurrentPlayer) {
    return '#4ade80';
  }

  const colors = [
    '#3b82f6', // blue
    '#8b5cf6', // purple
    '#06b6d4', // cyan
    '#f97316', // orange
    '#ec4899', // pink
    '#14b8a6', // teal
  ];

  return colors[index % colors.length];
}

/**
 * 格式化筹码数（纯函数）
 */
function formatChips(chips: number): string {
  if (chips >= 1000000) {
    return `${(chips / 1000000).toFixed(1)}M`;
  }
  if (chips >= 1000) {
    return `${(chips / 1000).toFixed(1)}K`;
  }
  return chips.toString();
}

/**
 * 排序玩家（按筹码降序，纯函数）
 */
function sortPlayersByChips(
  players: readonly PlayerStackInfo[]
): readonly PlayerStackInfo[] {
  // 创建新数组进行排序，不修改原数组
  return [...players].sort((a, b) => b.chips - a.chips);
}

// ============================================================================
// Sub-components（纯函数组件）
// ============================================================================

interface StackBarProps {
  readonly player: PlayerStackInfo;
  readonly index: number;
  readonly maxChips: number;
  readonly totalChips: number;
  readonly isCurrentPlayer: boolean;
  readonly compact?: boolean;
  readonly showPercentage?: boolean;
}

function StackBar({
  player,
  index,
  maxChips,
  totalChips,
  isCurrentPlayer,
  compact = false,
  showPercentage = true,
}: StackBarProps) {
  const barWidth = maxChips > 0 ? (player.chips / maxChips) * 100 : 0;
  const percentage = calculateChipPercentage(player.chips, totalChips);
  const barColor = getBarColor(index, isCurrentPlayer);
  const statusColor = getStatusColor(player.status);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: compact ? 6 : 10,
        padding: compact ? '4px 0' : '6px 0',
      }}
    >
      {/* 玩家名 */}
      <div
        style={{
          minWidth: compact ? 50 : 70,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        {/* 当前玩家指示 */}
        {isCurrentPlayer && (
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: '#4ade80',
              boxShadow: '0 0 6px #4ade80',
            }}
          />
        )}
        <span
          style={{
            fontSize: compact ? 9 : 10,
            color: isCurrentPlayer ? '#4ade80' : '#aaa',
            fontWeight: isCurrentPlayer ? 700 : 500,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {player.name}
        </span>
      </div>

      {/* 筹码条容器 */}
      <div
        style={{
          flex: 1,
          height: compact ? 14 : 18,
          background: 'rgba(100, 100, 100, 0.15)',
          borderRadius: compact ? 3 : 4,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* 筹码条 */}
        <div
          style={{
            width: `${barWidth}%`,
            height: '100%',
            background: `linear-gradient(90deg, ${barColor}, ${barColor}cc)`,
            borderRadius: compact ? 3 : 4,
            transition: 'width 0.3s ease',
            minWidth: player.chips > 0 ? 2 : 0,
          }}
        />

        {/* 筹码数值（条内） */}
        {barWidth > 30 && (
          <span
            style={{
              position: 'absolute',
              left: 6,
              top: '50%',
              transform: 'translateY(-50%)',
              fontSize: compact ? 8 : 9,
              fontWeight: 700,
              color: '#fff',
              textShadow: '0 1px 2px rgba(0,0,0,0.5)',
            }}
          >
            ${formatChips(player.chips)}
          </span>
        )}
      </div>

      {/* 筹码数值（条外，当条太短时） */}
      {barWidth <= 30 && (
        <span
          style={{
            minWidth: compact ? 40 : 50,
            fontSize: compact ? 9 : 10,
            color: '#aaa',
            textAlign: 'right',
          }}
        >
          ${formatChips(player.chips)}
        </span>
      )}

      {/* 百分比 */}
      {showPercentage && (
        <span
          style={{
            minWidth: compact ? 32 : 40,
            fontSize: compact ? 8 : 9,
            color: '#666',
            textAlign: 'right',
          }}
        >
          {percentage.toFixed(1)}%
        </span>
      )}

      {/* 状态指示 */}
      <span
        style={{
          padding: compact ? '1px 4px' : '2px 6px',
          fontSize: compact ? 7 : 8,
          fontWeight: 600,
          color: statusColor,
          background: `${statusColor}20`,
          borderRadius: 3,
          textTransform: 'uppercase',
        }}
      >
        {player.status === 'Active' ? 'ACT' : player.status.slice(0, 3).toUpperCase()}
      </span>
    </div>
  );
}

// ============================================================================
// StackDistributionChart - Main Component
// ============================================================================

export function StackDistributionChart({
  players,
  currentPlayerId,
  title = 'Stack Distribution',
  compact = false,
  showPercentages = true,
}: StackDistributionChartProps) {
  // 纯函数计算
  const sortedPlayers = sortPlayersByChips(players);
  const totalChips = calculateTotalChips(players);
  const maxChips = getMaxChips(players);

  // 空状态
  if (players.length === 0) {
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
          No players
        </span>
      </div>
    );
  }

  return (
    <div
      style={{
        background: 'rgba(59, 130, 246, 0.08)',
        border: '1px solid rgba(59, 130, 246, 0.2)',
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
          borderBottom: '1px solid rgba(59, 130, 246, 0.15)',
          background: 'rgba(59, 130, 246, 0.05)',
        }}
      >
        <span
          style={{
            fontSize: compact ? 9 : 10,
            color: '#60a5fa',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            fontWeight: 600,
          }}
        >
          {title}
        </span>
        <span
          style={{
            fontSize: compact ? 9 : 10,
            color: '#93c5fd',
          }}
        >
          Total: ${formatChips(totalChips)}
        </span>
      </div>

      {/* 筹码条列表 */}
      <div style={{ padding: compact ? '6px 10px' : '8px 12px' }}>
        {sortedPlayers.map((player, index) => (
          <StackBar
            key={player.id}
            player={player}
            index={index}
            maxChips={maxChips}
            totalChips={totalChips}
            isCurrentPlayer={player.id === currentPlayerId}
            compact={compact}
            showPercentage={showPercentages}
          />
        ))}
      </div>

      {/* 底部统计 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-around',
          padding: compact ? '6px 10px' : '8px 12px',
          borderTop: '1px solid rgba(59, 130, 246, 0.1)',
          fontSize: compact ? 8 : 9,
          color: '#666',
        }}
      >
        <span>
          Players:{' '}
          <strong style={{ color: '#60a5fa' }}>{players.length}</strong>
        </span>
        <span>
          Active:{' '}
          <strong style={{ color: '#22c55e' }}>
            {players.filter((p) => p.status.toLowerCase() === 'active').length}
          </strong>
        </span>
        <span>
          Leader:{' '}
          <strong style={{ color: '#f59e0b' }}>
            {sortedPlayers[0]?.name ?? '—'}
          </strong>
        </span>
      </div>
    </div>
  );
}

// ============================================================================
// 导出
// ============================================================================

export {
  calculateTotalChips,
  calculateChipPercentage,
  getMaxChips,
  getStatusColor,
  formatChips,
  sortPlayersByChips,
};

export type { PlayerStackInfo, StackDistributionChartProps };
