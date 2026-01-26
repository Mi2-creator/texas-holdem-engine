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
// StackRanking - 筹码排名组件（纯 UI 组件）
// ============================================================================
//
// 【I-3.3b】架构扩展性验证组件
//
// 层级: UI Layer (纯展示)
// 职责: 从 snapshot 派生筹码排名并展示
// 约束:
//   - 只读 props，不写入任何状态
//   - 所有排名计算为纯函数
//   - 不参与操作合法性判断
//   - 纯信息展示（informational UI）
//
// 数据来源（全部只读）:
//   - players: snapshot.players
//   - selectedPlayerId: UI state
//
// ============================================================================

import React from 'react';

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 玩家信息（只读子集）
 */
interface PlayerInfo {
  readonly id: string;
  readonly name: string;
  readonly chips: number;
  readonly status: string;
}

/**
 * StackRanking Props
 *
 * 所有 props 为只读，组件不修改任何外部状态
 */
interface StackRankingProps {
  /** 玩家列表（来自 snapshot.players，只读） */
  readonly players: ReadonlyArray<PlayerInfo>;
  /** 当前选中玩家 ID（来自 UI state） */
  readonly selectedPlayerId: string;
}

/**
 * 排名后的玩家信息
 */
interface RankedPlayer {
  readonly id: string;
  readonly name: string;
  readonly chips: number;
  readonly status: string;
  readonly rank: number;
  readonly percentage: number; // 相对于最大筹码的百分比
  readonly isSelected: boolean;
}

// ============================================================================
// 纯函数：排名计算
// ============================================================================

/**
 * 计算玩家筹码排名
 * 纯函数：无副作用
 *
 * @param players - 玩家列表（只读）
 * @param selectedPlayerId - 选中玩家 ID
 * @returns 排名后的玩家列表
 */
function calculateRankings(
  players: ReadonlyArray<PlayerInfo>,
  selectedPlayerId: string
): RankedPlayer[] {
  // 过滤掉已出局的玩家
  const activePlayers = players.filter((p) => p.status !== 'Out');

  if (activePlayers.length === 0) {
    return [];
  }

  // 按筹码降序排列
  const sorted = [...activePlayers].sort((a, b) => b.chips - a.chips);

  // 找出最大筹码（用于计算百分比）
  const maxChips = sorted[0]?.chips || 1;

  // 分配排名
  return sorted.map((player, index) => ({
    id: player.id,
    name: player.name,
    chips: player.chips,
    status: player.status,
    rank: index + 1,
    percentage: maxChips > 0 ? (player.chips / maxChips) * 100 : 0,
    isSelected: player.id === selectedPlayerId,
  }));
}

/**
 * 获取排名后缀
 * 纯函数：无副作用
 */
function getRankSuffix(rank: number): string {
  if (rank === 1) return 'st';
  if (rank === 2) return 'nd';
  if (rank === 3) return 'rd';
  return 'th';
}

/**
 * 获取排名颜色
 * 纯函数：无副作用
 */
function getRankColor(rank: number): string {
  switch (rank) {
    case 1:
      return '#ffd700'; // 金色
    case 2:
      return '#c0c0c0'; // 银色
    case 3:
      return '#cd7f32'; // 铜色
    default:
      return '#6b7280'; // 灰色
  }
}

/**
 * 获取筹码条颜色
 * 纯函数：无副作用
 */
function getBarColor(rank: number, isSelected: boolean): string {
  if (isSelected) {
    return '#4ade80'; // 绿色高亮
  }
  switch (rank) {
    case 1:
      return '#f59e0b'; // 金色
    case 2:
      return '#94a3b8'; // 银灰
    case 3:
      return '#d97706'; // 铜色
    default:
      return '#4b5563'; // 深灰
  }
}

/**
 * 格式化筹码数字
 * 纯函数：无副作用
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

// ============================================================================
// RankingRow 子组件（纯展示）
// ============================================================================

interface RankingRowProps {
  readonly player: RankedPlayer;
}

function RankingRow({ player }: RankingRowProps) {
  const rankColor = getRankColor(player.rank);
  const barColor = getBarColor(player.rank, player.isSelected);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '4px 0',
        opacity: player.status === 'Folded' ? 0.5 : 1,
      }}
    >
      {/* 排名 */}
      <div
        style={{
          width: 24,
          textAlign: 'center',
          fontSize: 11,
          fontWeight: 700,
          color: rankColor,
        }}
      >
        {player.rank}
        <span style={{ fontSize: 8 }}>{getRankSuffix(player.rank)}</span>
      </div>

      {/* 名字 */}
      <div
        style={{
          width: 60,
          fontSize: 11,
          color: player.isSelected ? '#4ade80' : '#ccc',
          fontWeight: player.isSelected ? 700 : 400,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {player.isSelected ? 'You' : player.name}
      </div>

      {/* 筹码条 */}
      <div
        style={{
          flex: 1,
          height: 12,
          background: 'rgba(0,0,0,0.3)',
          borderRadius: 3,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${player.percentage}%`,
            height: '100%',
            background: barColor,
            borderRadius: 3,
            transition: 'width 0.3s ease',
          }}
        />
      </div>

      {/* 筹码数 */}
      <div
        style={{
          width: 50,
          textAlign: 'right',
          fontSize: 11,
          fontWeight: 600,
          color: player.isSelected ? '#4ade80' : '#aaa',
        }}
      >
        ${formatChips(player.chips)}
      </div>
    </div>
  );
}

// ============================================================================
// StackRanking 主组件
// ============================================================================

/**
 * StackRanking - 筹码排名组件
 *
 * 【I-3.3b 验证点】
 * - 纯 UI 组件，只读 props，无内部状态
 * - 所有排名计算为纯函数
 * - 不调用任何 Command / Executor / EventProcessor
 * - 不产生任何 ReplayEvent
 * - 不影响游戏流程
 */
export function StackRanking({
  players,
  selectedPlayerId,
}: StackRankingProps) {
  // ========================================
  // 纯函数计算（无副作用）
  // ========================================
  const rankings = calculateRankings(players, selectedPlayerId);

  // 无效状态：不渲染
  if (rankings.length === 0) {
    return null;
  }

  // 找到选中玩家的排名
  const selectedRanking = rankings.find((r) => r.isSelected);

  // ========================================
  // 纯展示渲染（无交互）
  // ========================================
  return (
    <div
      style={{
        padding: '8px 12px',
        background: 'rgba(251, 191, 36, 0.1)',
        border: '1px solid rgba(251, 191, 36, 0.3)',
        borderRadius: 6,
        fontSize: 11,
      }}
    >
      {/* 标题行 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 8,
          paddingBottom: 6,
          borderBottom: '1px solid rgba(251, 191, 36, 0.2)',
        }}
      >
        <span
          style={{
            fontSize: 9,
            color: '#fbbf24',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          Stack Ranking
        </span>
        {selectedRanking && (
          <span
            style={{
              fontSize: 10,
              color: '#4ade80',
              fontWeight: 600,
            }}
          >
            You: {selectedRanking.rank}
            {getRankSuffix(selectedRanking.rank)} of {rankings.length}
          </span>
        )}
      </div>

      {/* 排名列表 */}
      <div>
        {rankings.map((player) => (
          <RankingRow key={player.id} player={player} />
        ))}
      </div>
    </div>
  );
}
