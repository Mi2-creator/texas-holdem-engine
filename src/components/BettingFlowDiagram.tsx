// ============================================================================
// BettingFlowDiagram - Visual Betting Flow (Read-Only)
// ============================================================================
//
// 【Post-Freeze Extension】Replay Architecture Freeze Declaration v1.0 Compliant
//
// 层级: UI Layer (纯展示)
// 职责: 可视化整手牌的投注流向，展示筹码流动
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
  readonly phase?: string;
  readonly street?: string;
}

interface PlayerInfo {
  readonly id: string;
  readonly name: string;
}

interface BettingFlowDiagramProps {
  readonly events: readonly EventInfo[];
  readonly players: readonly PlayerInfo[];
  readonly potTotal: number;
  readonly title?: string;
  readonly compact?: boolean;
}

/**
 * 玩家投注汇总
 */
interface PlayerBettingSummary {
  readonly playerId: string;
  readonly playerName: string;
  readonly totalInvested: number;
  readonly contributions: readonly BettingContribution[];
}

/**
 * 投注贡献
 */
interface BettingContribution {
  readonly street: string;
  readonly amount: number;
  readonly actionType: string;
}

// ============================================================================
// 常量定义
// ============================================================================

const BETTING_ACTIONS = ['POST_BLIND', 'BET', 'CALL', 'RAISE', 'ALL_IN'] as const;

const STREET_COLORS: Record<string, string> = {
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
 * 构建玩家名称映射（纯函数）
 */
function buildPlayerNameMap(players: readonly PlayerInfo[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const p of players) {
    map.set(p.id, p.name);
  }
  return map;
}

/**
 * 计算玩家投注汇总（纯函数）
 */
function calculateBettingSummaries(
  events: readonly EventInfo[],
  players: readonly PlayerInfo[],
  playerNames: Map<string, string>
): readonly PlayerBettingSummary[] {
  // 初始化每个玩家的贡献追踪
  const playerContributions = new Map<string, BettingContribution[]>();
  for (const p of players) {
    playerContributions.set(p.id, []);
  }

  let currentStreet = 'PREFLOP';

  // 遍历事件
  for (const event of events) {
    // 更新街道
    if (event.type === 'STREET_START' && event.street) {
      currentStreet = event.street.toUpperCase();
    } else if (event.type === 'DEAL_COMMUNITY' && event.phase) {
      currentStreet = event.phase.toUpperCase();
    }

    // 处理投注行动
    if (
      BETTING_ACTIONS.includes(event.type as typeof BETTING_ACTIONS[number]) &&
      event.playerId &&
      event.amount &&
      event.amount > 0
    ) {
      const contributions = playerContributions.get(event.playerId);
      if (contributions) {
        contributions.push({
          street: currentStreet,
          amount: event.amount,
          actionType: event.type,
        });
      }
    }
  }

  // 构建汇总结果
  const summaries: PlayerBettingSummary[] = [];

  for (const player of players) {
    const contributions = playerContributions.get(player.id) ?? [];
    let totalInvested = 0;
    for (const c of contributions) {
      totalInvested += c.amount;
    }

    if (totalInvested > 0 || contributions.length > 0) {
      summaries.push({
        playerId: player.id,
        playerName: playerNames.get(player.id) ?? player.id,
        totalInvested,
        contributions,
      });
    }
  }

  // 按投资额排序
  return summaries.sort((a, b) => b.totalInvested - a.totalInvested);
}

/**
 * 计算街道投注分布（纯函数）
 */
function calculateStreetDistribution(
  summaries: readonly PlayerBettingSummary[]
): Map<string, number> {
  const distribution = new Map<string, number>();

  for (const summary of summaries) {
    for (const contribution of summary.contributions) {
      const current = distribution.get(contribution.street) ?? 0;
      distribution.set(contribution.street, current + contribution.amount);
    }
  }

  return distribution;
}

/**
 * 格式化金额（纯函数）
 */
function formatAmount(amount: number): string {
  if (amount >= 1000) {
    return `$${(amount / 1000).toFixed(1)}K`;
  }
  return `$${amount}`;
}

/**
 * 计算百分比（纯函数）
 */
function calculatePercentage(amount: number, total: number): number {
  if (total === 0) return 0;
  return (amount / total) * 100;
}

// ============================================================================
// Sub-components（纯函数组件）
// ============================================================================

interface FlowBarProps {
  readonly label: string;
  readonly amount: number;
  readonly total: number;
  readonly color: string;
  readonly compact?: boolean;
}

function FlowBar({ label, amount, total, color, compact = false }: FlowBarProps) {
  const percentage = calculatePercentage(amount, total);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: compact ? 6 : 8,
        marginBottom: compact ? 4 : 6,
      }}
    >
      <span
        style={{
          minWidth: compact ? 45 : 55,
          fontSize: compact ? 8 : 9,
          color: color,
          fontWeight: 600,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </span>

      <div
        style={{
          flex: 1,
          height: compact ? 12 : 16,
          background: 'rgba(100, 100, 100, 0.15)',
          borderRadius: 4,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <div
          style={{
            width: `${percentage}%`,
            height: '100%',
            background: `linear-gradient(90deg, ${color}, ${color}cc)`,
            borderRadius: 4,
            transition: 'width 0.3s ease',
            minWidth: amount > 0 ? 2 : 0,
          }}
        />

        {percentage > 20 && (
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
            {formatAmount(amount)}
          </span>
        )}
      </div>

      {percentage <= 20 && (
        <span
          style={{
            minWidth: compact ? 35 : 45,
            fontSize: compact ? 9 : 10,
            color: '#aaa',
            textAlign: 'right',
          }}
        >
          {formatAmount(amount)}
        </span>
      )}

      <span
        style={{
          minWidth: compact ? 30 : 38,
          fontSize: compact ? 8 : 9,
          color: '#666',
          textAlign: 'right',
        }}
      >
        {percentage.toFixed(1)}%
      </span>
    </div>
  );
}

interface PlayerFlowRowProps {
  readonly summary: PlayerBettingSummary;
  readonly potTotal: number;
  readonly maxInvested: number;
  readonly compact?: boolean;
}

function PlayerFlowRow({
  summary,
  potTotal,
  maxInvested,
  compact = false,
}: PlayerFlowRowProps) {
  const barWidth = maxInvested > 0 ? (summary.totalInvested / maxInvested) * 100 : 0;
  const potPercentage = calculatePercentage(summary.totalInvested, potTotal);

  return (
    <div
      style={{
        padding: compact ? '6px 8px' : '8px 10px',
        background: 'rgba(100, 100, 100, 0.05)',
        borderRadius: 6,
        marginBottom: compact ? 4 : 6,
      }}
    >
      {/* 玩家名和总投资 */}
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
            color: '#e0e0e0',
            fontWeight: 600,
          }}
        >
          {summary.playerName}
        </span>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: compact ? 6 : 8,
          }}
        >
          <span
            style={{
              fontSize: compact ? 10 : 11,
              color: '#ffd700',
              fontWeight: 700,
            }}
          >
            {formatAmount(summary.totalInvested)}
          </span>
          <span
            style={{
              fontSize: compact ? 8 : 9,
              color: '#888',
            }}
          >
            ({potPercentage.toFixed(1)}% of pot)
          </span>
        </div>
      </div>

      {/* 投资条 */}
      <div
        style={{
          height: compact ? 6 : 8,
          background: 'rgba(100, 100, 100, 0.2)',
          borderRadius: 3,
          overflow: 'hidden',
          marginBottom: compact ? 4 : 6,
        }}
      >
        <div
          style={{
            width: `${barWidth}%`,
            height: '100%',
            background: 'linear-gradient(90deg, #ffd700, #f59e0b)',
            borderRadius: 3,
            transition: 'width 0.3s ease',
          }}
        />
      </div>

      {/* 街道细分 */}
      <div
        style={{
          display: 'flex',
          gap: compact ? 4 : 6,
          flexWrap: 'wrap',
        }}
      >
        {summary.contributions.map((contribution, index) => (
          <span
            key={index}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 2,
              padding: compact ? '1px 4px' : '2px 5px',
              background: `${STREET_COLORS[contribution.street] ?? '#888'}20`,
              border: `1px solid ${STREET_COLORS[contribution.street] ?? '#888'}40`,
              borderRadius: 3,
              fontSize: compact ? 7 : 8,
              color: STREET_COLORS[contribution.street] ?? '#888',
            }}
          >
            <span style={{ fontWeight: 600 }}>{contribution.street.slice(0, 3)}</span>
            <span>{formatAmount(contribution.amount)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// BettingFlowDiagram - Main Component
// ============================================================================

export function BettingFlowDiagram({
  events,
  players,
  potTotal,
  title = 'Betting Flow',
  compact = false,
}: BettingFlowDiagramProps) {
  // 纯函数计算
  const playerNames = buildPlayerNameMap(players);
  const summaries = calculateBettingSummaries(events, players, playerNames);
  const streetDistribution = calculateStreetDistribution(summaries);

  // 计算最大投资额
  let maxInvested = 0;
  for (const s of summaries) {
    if (s.totalInvested > maxInvested) {
      maxInvested = s.totalInvested;
    }
  }

  // 空状态
  if (summaries.length === 0 || potTotal === 0) {
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
          No betting activity
        </span>
      </div>
    );
  }

  return (
    <div
      style={{
        background: 'rgba(255, 215, 0, 0.08)',
        border: '1px solid rgba(255, 215, 0, 0.2)',
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
          borderBottom: '1px solid rgba(255, 215, 0, 0.15)',
          background: 'rgba(255, 215, 0, 0.05)',
        }}
      >
        <span
          style={{
            fontSize: compact ? 9 : 10,
            color: '#fcd34d',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            fontWeight: 600,
          }}
        >
          {title}
        </span>
        <span
          style={{
            fontSize: compact ? 11 : 12,
            color: '#ffd700',
            fontWeight: 700,
          }}
        >
          Pot: {formatAmount(potTotal)}
        </span>
      </div>

      {/* 街道分布 */}
      <div
        style={{
          padding: compact ? '8px 10px' : '10px 12px',
          borderBottom: '1px solid rgba(255, 215, 0, 0.1)',
        }}
      >
        <div
          style={{
            fontSize: compact ? 8 : 9,
            color: '#888',
            marginBottom: compact ? 6 : 8,
            textTransform: 'uppercase',
          }}
        >
          By Street
        </div>

        {['PREFLOP', 'FLOP', 'TURN', 'RIVER'].map((street) => {
          const amount = streetDistribution.get(street) ?? 0;
          if (amount === 0) return null;

          return (
            <FlowBar
              key={street}
              label={street.slice(0, 4)}
              amount={amount}
              total={potTotal}
              color={STREET_COLORS[street]}
              compact={compact}
            />
          );
        })}
      </div>

      {/* 玩家投资 */}
      <div style={{ padding: compact ? '8px 10px' : '10px 12px' }}>
        <div
          style={{
            fontSize: compact ? 8 : 9,
            color: '#888',
            marginBottom: compact ? 6 : 8,
            textTransform: 'uppercase',
          }}
        >
          By Player
        </div>

        {summaries.map((summary) => (
          <PlayerFlowRow
            key={summary.playerId}
            summary={summary}
            potTotal={potTotal}
            maxInvested={maxInvested}
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
  calculateBettingSummaries,
  calculateStreetDistribution,
  formatAmount,
  calculatePercentage,
  BETTING_ACTIONS,
  STREET_COLORS,
};

export type {
  EventInfo,
  PlayerInfo,
  PlayerBettingSummary,
  BettingContribution,
  BettingFlowDiagramProps,
};
