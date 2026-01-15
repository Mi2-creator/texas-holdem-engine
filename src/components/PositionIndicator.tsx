// ============================================================================
// PositionIndicator - 位置指示器（纯 UI 组件）
// ============================================================================
//
// 【I-3.3a】架构扩展性验证组件
//
// 层级: UI Layer (纯展示)
// 职责: 从 snapshot 派生玩家位置并展示
// 约束:
//   - 只读 props，不写入任何状态
//   - 所有位置计算为纯函数
//   - 不参与操作合法性判断
//   - 纯信息展示（informational UI）
//
// 数据来源（全部只读）:
//   - dealerSeat, smallBlindSeat, bigBlindSeat: snapshot 字段
//   - players: snapshot.players
//   - selectedPlayerId: UI state
//
// ============================================================================

import React from 'react';

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 标准位置名称
 */
type PositionName =
  | 'BTN'    // Button (Dealer)
  | 'SB'     // Small Blind
  | 'BB'     // Big Blind
  | 'UTG'    // Under The Gun
  | 'UTG+1'  // UTG + 1
  | 'UTG+2'  // UTG + 2
  | 'MP'     // Middle Position
  | 'HJ'     // Hijack
  | 'CO';    // Cutoff

/**
 * 玩家信息（只读子集）
 */
interface PlayerInfo {
  readonly id: string;
  readonly name: string;
  readonly seat: number;
  readonly status: string;
}

/**
 * PositionIndicator Props
 *
 * 所有 props 为只读，组件不修改任何外部状态
 */
interface PositionIndicatorProps {
  /** 庄家座位（来自 snapshot.dealerSeat） */
  readonly dealerSeat: number;
  /** 小盲座位（来自 snapshot.smallBlindSeat） */
  readonly smallBlindSeat: number;
  /** 大盲座位（来自 snapshot.bigBlindSeat） */
  readonly bigBlindSeat: number;
  /** 玩家列表（来自 snapshot.players，只读） */
  readonly players: ReadonlyArray<PlayerInfo>;
  /** 当前选中玩家 ID（来自 UI state） */
  readonly selectedPlayerId: string;
}

// ============================================================================
// 纯函数：位置计算
// ============================================================================

/**
 * 获取活跃玩家座位（已排序）
 * 纯函数：无副作用
 */
function getActiveSeats(players: ReadonlyArray<PlayerInfo>): number[] {
  return players
    .filter((p) => p.status !== 'Out')
    .map((p) => p.seat)
    .sort((a, b) => a - b);
}

/**
 * 计算从 fromSeat 到 toSeat 的行动距离（顺时针）
 * 纯函数：无副作用
 *
 * @param fromSeat - 起始座位
 * @param toSeat - 目标座位
 * @param activeSeats - 活跃座位列表（已排序）
 * @returns 行动距离（0 = 同一座位）
 */
function getSeatDistance(
  fromSeat: number,
  toSeat: number,
  activeSeats: readonly number[]
): number {
  if (activeSeats.length === 0) return 0;
  if (fromSeat === toSeat) return 0;

  const fromIndex = activeSeats.indexOf(fromSeat);
  const toIndex = activeSeats.indexOf(toSeat);

  if (fromIndex === -1 || toIndex === -1) return 0;

  const n = activeSeats.length;
  // 顺时针距离
  return (toIndex - fromIndex + n) % n;
}

/**
 * 计算玩家位置名称
 * 纯函数：输入 → 输出，无副作用
 *
 * @param playerSeat - 目标玩家座位
 * @param dealerSeat - 庄家座位
 * @param smallBlindSeat - 小盲座位
 * @param bigBlindSeat - 大盲座位
 * @param activeSeats - 活跃玩家座位列表（已排序）
 * @returns 位置名称
 */
function calculatePosition(
  playerSeat: number,
  dealerSeat: number,
  smallBlindSeat: number,
  bigBlindSeat: number,
  activeSeats: readonly number[]
): PositionName {
  const numPlayers = activeSeats.length;

  // 特殊位置：直接匹配
  if (playerSeat === dealerSeat) return 'BTN';
  if (playerSeat === smallBlindSeat) return 'SB';
  if (playerSeat === bigBlindSeat) return 'BB';

  // 小桌（3人及以下）：只有 BTN/SB/BB
  if (numPlayers <= 3) {
    return 'BTN'; // fallback，理论上不会到这里
  }

  // 计算距离
  const distFromBB = getSeatDistance(bigBlindSeat, playerSeat, activeSeats);
  const distToBTN = getSeatDistance(playerSeat, dealerSeat, activeSeats);

  // 4人桌：BTN, SB, BB, UTG
  if (numPlayers === 4) {
    if (distFromBB === 1) return 'UTG';
    return 'UTG';
  }

  // 5人桌：BTN, SB, BB, UTG, CO
  if (numPlayers === 5) {
    if (distFromBB === 1) return 'UTG';
    if (distToBTN === 1) return 'CO';
    return 'MP';
  }

  // 6人桌：BTN, SB, BB, UTG, MP/HJ, CO
  if (numPlayers === 6) {
    if (distFromBB === 1) return 'UTG';
    if (distToBTN === 1) return 'CO';
    if (distToBTN === 2) return 'HJ';
    return 'MP';
  }

  // 7+人桌：完整位置体系
  // BTN, SB, BB, UTG, UTG+1, [UTG+2], [MP], HJ, CO

  // CO: BTN 前一位
  if (distToBTN === 1) return 'CO';

  // HJ: BTN 前两位
  if (distToBTN === 2) return 'HJ';

  // UTG: BB 后第一位
  if (distFromBB === 1) return 'UTG';

  // UTG+1: BB 后第二位（7+人桌）
  if (distFromBB === 2 && numPlayers >= 7) return 'UTG+1';

  // UTG+2: BB 后第三位（9+人桌）
  if (distFromBB === 3 && numPlayers >= 9) return 'UTG+2';

  // 其余为 MP
  return 'MP';
}

/**
 * 获取位置的显示颜色
 * 纯函数：无副作用
 */
function getPositionColor(position: PositionName): string {
  switch (position) {
    case 'BTN':
      return '#f59e0b'; // 金色 - 最有利位置
    case 'CO':
      return '#22c55e'; // 绿色 - 有利位置
    case 'HJ':
      return '#3b82f6'; // 蓝色 - 中等位置
    case 'MP':
      return '#6b7280'; // 灰色 - 中等位置
    case 'UTG':
    case 'UTG+1':
    case 'UTG+2':
      return '#ef4444'; // 红色 - 不利位置
    case 'SB':
    case 'BB':
      return '#8b5cf6'; // 紫色 - 盲注位置
    default:
      return '#6b7280';
  }
}

/**
 * 获取位置的战略提示
 * 纯函数：无副作用
 */
function getPositionHint(position: PositionName): string {
  switch (position) {
    case 'BTN':
      return 'Best position - act last post-flop';
    case 'CO':
      return 'Strong position - wide range ok';
    case 'HJ':
      return 'Good position - moderate range';
    case 'MP':
      return 'Middle position - tighter range';
    case 'UTG':
    case 'UTG+1':
    case 'UTG+2':
      return 'Early position - play tight';
    case 'SB':
      return 'Blind position - worst post-flop';
    case 'BB':
      return 'Blind position - defend wisely';
    default:
      return '';
  }
}

// ============================================================================
// PositionBadge 子组件（纯展示）
// ============================================================================

interface PositionBadgeProps {
  readonly position: PositionName;
  readonly color: string;
}

function PositionBadge({ position, color }: PositionBadgeProps) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '3px 8px',
        background: color,
        color: '#fff',
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.5px',
        textShadow: '0 1px 2px rgba(0,0,0,0.3)',
      }}
    >
      {position}
    </span>
  );
}

// ============================================================================
// PositionIndicator 主组件
// ============================================================================

/**
 * PositionIndicator - 位置指示器组件
 *
 * 【I-3.3a 验证点】
 * - 纯 UI 组件，只读 props，无内部状态
 * - 所有位置计算为纯函数
 * - 不调用任何 Command / Executor / EventProcessor
 * - 不产生任何 ReplayEvent
 * - 不影响游戏流程
 */
export function PositionIndicator({
  dealerSeat,
  smallBlindSeat,
  bigBlindSeat,
  players,
  selectedPlayerId,
}: PositionIndicatorProps) {
  // ========================================
  // 纯函数计算（无副作用）
  // ========================================
  const activeSeats = getActiveSeats(players);
  const selectedPlayer = players.find((p) => p.id === selectedPlayerId);

  // 无效状态：不渲染
  if (!selectedPlayer || activeSeats.length < 2) {
    return null;
  }

  // 计算位置
  const position = calculatePosition(
    selectedPlayer.seat,
    dealerSeat,
    smallBlindSeat,
    bigBlindSeat,
    activeSeats
  );

  const positionColor = getPositionColor(position);
  const positionHint = getPositionHint(position);

  // ========================================
  // 纯展示渲染（无交互）
  // ========================================
  return (
    <div
      style={{
        padding: '8px 12px',
        background: 'rgba(139, 92, 246, 0.1)',
        border: '1px solid rgba(139, 92, 246, 0.3)',
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
          marginBottom: 6,
        }}
      >
        <span
          style={{
            fontSize: 9,
            color: '#a78bfa',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          Position
        </span>
        <PositionBadge position={position} color={positionColor} />
      </div>

      {/* 座位信息 */}
      <div
        style={{
          fontSize: 12,
          color: '#c4b5fd',
          marginBottom: 4,
        }}
      >
        Seat {selectedPlayer.seat} of {activeSeats.length} players
      </div>

      {/* 战略提示 */}
      <div
        style={{
          fontSize: 9,
          color: '#8b7fc7',
          fontStyle: 'italic',
          paddingTop: 4,
          borderTop: '1px solid rgba(139, 92, 246, 0.2)',
        }}
      >
        {positionHint}
      </div>
    </div>
  );
}
