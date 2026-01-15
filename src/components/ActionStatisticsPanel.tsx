// ============================================================================
// ActionStatisticsPanel - Action Frequency Analysis (Read-Only)
// ============================================================================
//
// 【Post-Freeze Extension】Replay Architecture Freeze Declaration v1.0 Compliant
//
// 层级: UI Layer (纯展示)
// 职责: 分析并展示玩家行动频率统计（fold%, call%, raise%等）
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

interface EventInfo {
  readonly type: string;
  readonly playerId?: string;
  readonly amount?: number;
}

interface PlayerInfo {
  readonly id: string;
  readonly name: string;
}

interface ActionStatisticsPanelProps {
  readonly events: readonly EventInfo[];
  readonly players: readonly PlayerInfo[];
  readonly selectedPlayerId?: string;
  readonly title?: string;
  readonly compact?: boolean;
}

/**
 * 行动统计结果
 */
interface ActionStats {
  readonly playerId: string;
  readonly playerName: string;
  readonly totalActions: number;
  readonly folds: number;
  readonly checks: number;
  readonly calls: number;
  readonly bets: number;
  readonly raises: number;
  readonly allIns: number;
  readonly foldRate: number;
  readonly aggressionRate: number;
  readonly vpip: number; // Voluntarily Put $ In Pot
}

/**
 * 全局行动分布
 */
interface GlobalActionDistribution {
  readonly totalActions: number;
  readonly folds: number;
  readonly checks: number;
  readonly calls: number;
  readonly bets: number;
  readonly raises: number;
  readonly allIns: number;
}

// ============================================================================
// 常量定义
// ============================================================================

const ACTION_TYPES = ['FOLD', 'CHECK', 'CALL', 'BET', 'RAISE', 'ALL_IN'] as const;

const ACTION_COLORS: Record<string, string> = {
  FOLD: '#ef4444',
  CHECK: '#6b7280',
  CALL: '#3b82f6',
  BET: '#f97316',
  RAISE: '#22c55e',
  ALL_IN: '#f59e0b',
};

const ACTION_LABELS: Record<string, string> = {
  FOLD: 'Fold',
  CHECK: 'Check',
  CALL: 'Call',
  BET: 'Bet',
  RAISE: 'Raise',
  ALL_IN: 'All-In',
};

// ============================================================================
// 纯函数：统计计算
// ============================================================================

/**
 * 计算玩家行动统计（纯函数）
 */
function calculatePlayerStats(
  events: readonly EventInfo[],
  playerId: string,
  playerName: string
): ActionStats {
  let folds = 0;
  let checks = 0;
  let calls = 0;
  let bets = 0;
  let raises = 0;
  let allIns = 0;

  for (const event of events) {
    if (event.playerId !== playerId) continue;

    switch (event.type) {
      case 'FOLD':
        folds++;
        break;
      case 'CHECK':
        checks++;
        break;
      case 'CALL':
        calls++;
        break;
      case 'BET':
        bets++;
        break;
      case 'RAISE':
        raises++;
        break;
      case 'ALL_IN':
        allIns++;
        break;
    }
  }

  const totalActions = folds + checks + calls + bets + raises + allIns;
  const aggressiveActions = bets + raises + allIns;
  const voluntaryActions = calls + bets + raises + allIns; // Excludes checks/folds

  return {
    playerId,
    playerName,
    totalActions,
    folds,
    checks,
    calls,
    bets,
    raises,
    allIns,
    foldRate: totalActions > 0 ? (folds / totalActions) * 100 : 0,
    aggressionRate: totalActions > 0 ? (aggressiveActions / totalActions) * 100 : 0,
    vpip: totalActions > 0 ? (voluntaryActions / totalActions) * 100 : 0,
  };
}

/**
 * 计算全局行动分布（纯函数）
 */
function calculateGlobalDistribution(
  events: readonly EventInfo[]
): GlobalActionDistribution {
  let folds = 0;
  let checks = 0;
  let calls = 0;
  let bets = 0;
  let raises = 0;
  let allIns = 0;

  for (const event of events) {
    switch (event.type) {
      case 'FOLD':
        folds++;
        break;
      case 'CHECK':
        checks++;
        break;
      case 'CALL':
        calls++;
        break;
      case 'BET':
        bets++;
        break;
      case 'RAISE':
        raises++;
        break;
      case 'ALL_IN':
        allIns++;
        break;
    }
  }

  return {
    totalActions: folds + checks + calls + bets + raises + allIns,
    folds,
    checks,
    calls,
    bets,
    raises,
    allIns,
  };
}

/**
 * 计算所有玩家统计（纯函数）
 */
function calculateAllPlayerStats(
  events: readonly EventInfo[],
  players: readonly PlayerInfo[]
): readonly ActionStats[] {
  const stats: ActionStats[] = [];

  for (const player of players) {
    stats.push(calculatePlayerStats(events, player.id, player.name));
  }

  // 按总行动数排序
  return stats.sort((a, b) => b.totalActions - a.totalActions);
}

/**
 * 格式化百分比（纯函数）
 */
function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

// ============================================================================
// Sub-components（纯函数组件）
// ============================================================================

interface ActionBarProps {
  readonly actionType: string;
  readonly count: number;
  readonly total: number;
  readonly compact?: boolean;
}

function ActionBar({ actionType, count, total, compact = false }: ActionBarProps) {
  const percentage = total > 0 ? (count / total) * 100 : 0;
  const color = ACTION_COLORS[actionType] ?? '#6b7280';
  const label = ACTION_LABELS[actionType] ?? actionType;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: compact ? 4 : 6,
        padding: compact ? '2px 0' : '3px 0',
      }}
    >
      <span
        style={{
          minWidth: compact ? 35 : 45,
          fontSize: compact ? 8 : 9,
          color: color,
          fontWeight: 600,
        }}
      >
        {label}
      </span>

      <div
        style={{
          flex: 1,
          height: compact ? 10 : 12,
          background: 'rgba(100, 100, 100, 0.15)',
          borderRadius: 2,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${percentage}%`,
            height: '100%',
            background: color,
            transition: 'width 0.3s ease',
            minWidth: count > 0 ? 2 : 0,
          }}
        />
      </div>

      <span
        style={{
          minWidth: compact ? 20 : 24,
          fontSize: compact ? 8 : 9,
          color: '#aaa',
          textAlign: 'right',
        }}
      >
        {count}
      </span>

      <span
        style={{
          minWidth: compact ? 28 : 35,
          fontSize: compact ? 8 : 9,
          color: '#666',
          textAlign: 'right',
        }}
      >
        {formatPercent(percentage)}
      </span>
    </div>
  );
}

interface PlayerStatsRowProps {
  readonly stats: ActionStats;
  readonly isSelected: boolean;
  readonly compact?: boolean;
}

function PlayerStatsRow({ stats, isSelected, compact = false }: PlayerStatsRowProps) {
  return (
    <div
      style={{
        padding: compact ? '6px 8px' : '8px 10px',
        background: isSelected ? 'rgba(74, 222, 128, 0.1)' : 'transparent',
        borderLeft: isSelected ? '3px solid #4ade80' : '3px solid transparent',
        borderRadius: '0 4px 4px 0',
        marginBottom: 4,
      }}
    >
      {/* 玩家名和总行动数 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: compact ? 4 : 6,
        }}
      >
        <span
          style={{
            fontSize: compact ? 10 : 11,
            color: isSelected ? '#4ade80' : '#e0e0e0',
            fontWeight: 600,
          }}
        >
          {stats.playerName}
        </span>
        <span
          style={{
            fontSize: compact ? 8 : 9,
            color: '#888',
          }}
        >
          {stats.totalActions} actions
        </span>
      </div>

      {/* 关键指标 */}
      <div
        style={{
          display: 'flex',
          gap: compact ? 8 : 12,
          marginBottom: compact ? 4 : 6,
          fontSize: compact ? 8 : 9,
        }}
      >
        <span style={{ color: '#ef4444' }}>
          Fold: <strong>{formatPercent(stats.foldRate)}</strong>
        </span>
        <span style={{ color: '#22c55e' }}>
          Aggr: <strong>{formatPercent(stats.aggressionRate)}</strong>
        </span>
        <span style={{ color: '#3b82f6' }}>
          VPIP: <strong>{formatPercent(stats.vpip)}</strong>
        </span>
      </div>

      {/* 行动明细 */}
      <div
        style={{
          display: 'flex',
          gap: compact ? 6 : 8,
          flexWrap: 'wrap',
          fontSize: compact ? 7 : 8,
          color: '#666',
        }}
      >
        {stats.folds > 0 && (
          <span>
            <span style={{ color: ACTION_COLORS.FOLD }}>F</span>:{stats.folds}
          </span>
        )}
        {stats.checks > 0 && (
          <span>
            <span style={{ color: ACTION_COLORS.CHECK }}>X</span>:{stats.checks}
          </span>
        )}
        {stats.calls > 0 && (
          <span>
            <span style={{ color: ACTION_COLORS.CALL }}>C</span>:{stats.calls}
          </span>
        )}
        {stats.bets > 0 && (
          <span>
            <span style={{ color: ACTION_COLORS.BET }}>B</span>:{stats.bets}
          </span>
        )}
        {stats.raises > 0 && (
          <span>
            <span style={{ color: ACTION_COLORS.RAISE }}>R</span>:{stats.raises}
          </span>
        )}
        {stats.allIns > 0 && (
          <span>
            <span style={{ color: ACTION_COLORS.ALL_IN }}>A</span>:{stats.allIns}
          </span>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// ActionStatisticsPanel - Main Component
// ============================================================================

export function ActionStatisticsPanel({
  events,
  players,
  selectedPlayerId,
  title = 'Action Statistics',
  compact = false,
}: ActionStatisticsPanelProps) {
  // 纯函数计算
  const globalDist = calculateGlobalDistribution(events);
  const allStats = calculateAllPlayerStats(events, players);

  // 空状态
  if (globalDist.totalActions === 0) {
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
          No actions recorded
        </span>
      </div>
    );
  }

  return (
    <div
      style={{
        background: 'rgba(249, 115, 22, 0.08)',
        border: '1px solid rgba(249, 115, 22, 0.2)',
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
          borderBottom: '1px solid rgba(249, 115, 22, 0.15)',
          background: 'rgba(249, 115, 22, 0.05)',
        }}
      >
        <span
          style={{
            fontSize: compact ? 9 : 10,
            color: '#fb923c',
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
            color: '#fdba74',
          }}
        >
          {globalDist.totalActions} total
        </span>
      </div>

      {/* 全局分布 */}
      <div
        style={{
          padding: compact ? '8px 10px' : '10px 12px',
          borderBottom: '1px solid rgba(249, 115, 22, 0.1)',
        }}
      >
        <div
          style={{
            fontSize: compact ? 8 : 9,
            color: '#888',
            marginBottom: compact ? 4 : 6,
            textTransform: 'uppercase',
          }}
        >
          Global Distribution
        </div>

        {ACTION_TYPES.map((actionType) => {
          const count =
            actionType === 'FOLD'
              ? globalDist.folds
              : actionType === 'CHECK'
              ? globalDist.checks
              : actionType === 'CALL'
              ? globalDist.calls
              : actionType === 'BET'
              ? globalDist.bets
              : actionType === 'RAISE'
              ? globalDist.raises
              : globalDist.allIns;

          return (
            <ActionBar
              key={actionType}
              actionType={actionType}
              count={count}
              total={globalDist.totalActions}
              compact={compact}
            />
          );
        })}
      </div>

      {/* 玩家统计 */}
      <div style={{ padding: compact ? '8px 10px' : '10px 12px' }}>
        <div
          style={{
            fontSize: compact ? 8 : 9,
            color: '#888',
            marginBottom: compact ? 6 : 8,
            textTransform: 'uppercase',
          }}
        >
          Per Player
        </div>

        {allStats.map((stats) => (
          <PlayerStatsRow
            key={stats.playerId}
            stats={stats}
            isSelected={stats.playerId === selectedPlayerId}
            compact={compact}
          />
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// 导出
// ============================================================================

export {
  calculatePlayerStats,
  calculateGlobalDistribution,
  calculateAllPlayerStats,
  formatPercent,
  ACTION_TYPES,
  ACTION_COLORS,
  ACTION_LABELS,
};

export type {
  EventInfo,
  PlayerInfo,
  ActionStats,
  GlobalActionDistribution,
  ActionStatisticsPanelProps,
};
