// ============================================================================
// StateExplanationPanel - State Explanation Panel (Read-Only UI)
// ============================================================================
//
// 【A 路线】Replay Architecture Freeze Declaration v1.0 Compliant
//
// 层级: UI Layer (纯展示)
// 职责: 解释当前 snapshot 变化来源，从事件"推导"而非"计算"
//
// 约束:
//   - 只读 props，不写入任何状态
//   - 不 import src/replay/** 或 src/commands/**
//   - 不调用 EventProcessor
//   - 不构造 ReplayEvent
//   - 不使用 React Hooks（纯函数组件）
//   - 不对比 snapshot diff，直接从事件推导解释
//
// 数据来源（全部只读）:
//   - event: 当前事件（从父组件透传，已由 events[index] 取出）
//   - snapshot: 当前快照（用于获取玩家名称映射）
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
//   - H-2 边界安全: 检查 event 存在性后再访问
//   - H-3 无副作用: 使用纯函数进行格式化
//   - H-4 值语义: 不修改任何值
//
// ============================================================================

import React from 'react';

// ============================================================================
// 本地类型定义（不依赖 src/replay/events.ts）
// ============================================================================
//
// 这些是"形状描述"接口，不是 ReplayEvent 的导入。
// 组件只读取这些字段用于展示，不构造或修改事件。
// ============================================================================

/**
 * 卡牌形状描述（只读）
 */
interface CardInfo {
  readonly suit: string;
  readonly rank: string;
}

/**
 * 玩家信息形状描述（只读）
 */
interface PlayerInfo {
  readonly id: string;
  readonly name: string;
  readonly seat: number;
  readonly chips: number;
}

/**
 * 赢家信息形状描述（只读）
 */
interface WinnerInfo {
  readonly playerId: string;
  readonly amount: number;
  readonly handRank?: string;
}

/**
 * 事件形状描述（只读）
 *
 * 覆盖所有可能的事件字段，但不强制要求全部存在。
 * 这是一个联合类型的"形状超集"。
 */
interface EventInfo {
  readonly type: string;
  readonly playerId?: string;
  readonly amount?: number;
  readonly phase?: string;
  readonly street?: string;
  readonly blindType?: string;
  readonly reason?: string;
  readonly handId?: string;
  readonly cards?: readonly CardInfo[];
  readonly players?: readonly PlayerInfo[];
  readonly winners?: readonly WinnerInfo[];
  readonly dealerSeat?: number;
  readonly smallBlind?: number;
  readonly bigBlind?: number;
}

/**
 * 快照玩家信息形状描述（只读）
 */
interface SnapshotPlayerInfo {
  readonly id: string;
  readonly name: string;
}

/**
 * StateExplanationPanel Props
 */
interface StateExplanationPanelProps {
  /** 当前事件（只读，可能为 undefined） */
  readonly event: EventInfo | undefined;
  /** 玩家列表（用于 ID → 名称映射，只读） */
  readonly players: readonly SnapshotPlayerInfo[];
  /** 可选：面板标题 */
  readonly title?: string;
  /** 可选：是否显示事件类型标签 */
  readonly showEventType?: boolean;
  /** 可选：是否紧凑模式 */
  readonly compact?: boolean;
}

// ============================================================================
// 纯函数：事件解释格式化
// ============================================================================
//
// 所有格式化函数都是纯函数：
// - 无副作用
// - 相同输入 → 相同输出
// - 只读取参数，不修改
// ============================================================================

/**
 * 构建玩家名称映射（纯函数）
 */
function buildPlayerNameMap(
  players: readonly SnapshotPlayerInfo[]
): Map<string, string> {
  const map = new Map<string, string>();
  for (const p of players) {
    map.set(p.id, p.name);
  }
  return map;
}

/**
 * 获取玩家显示名称（纯函数）
 */
function getPlayerName(
  playerId: string | undefined,
  playerNames: Map<string, string>
): string {
  if (!playerId) return 'Unknown';
  return playerNames.get(playerId) ?? playerId;
}

/**
 * 格式化卡牌显示（纯函数）
 */
function formatCard(card: CardInfo): string {
  const suitSymbols: Record<string, string> = {
    S: '\u2660', // ♠
    H: '\u2665', // ♥
    D: '\u2666', // ♦
    C: '\u2663', // ♣
  };
  return `${card.rank}${suitSymbols[card.suit] ?? card.suit}`;
}

/**
 * 格式化多张卡牌（纯函数）
 */
function formatCards(cards: readonly CardInfo[] | undefined): string {
  if (!cards || cards.length === 0) return '';
  return cards.map(formatCard).join(' ');
}

/**
 * 获取事件类型的中文描述（纯函数）
 */
function getEventTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    HAND_START: 'Hand Start',
    POST_BLIND: 'Post Blind',
    DEAL_HOLE: 'Deal Hole Cards',
    STREET_START: 'Street Start',
    BET: 'Bet',
    CALL: 'Call',
    RAISE: 'Raise',
    CHECK: 'Check',
    FOLD: 'Fold',
    ALL_IN: 'All-In',
    DEAL_COMMUNITY: 'Deal Community',
    SHOWDOWN: 'Showdown',
    HAND_END: 'Hand End',
  };
  return labels[type] ?? type;
}

/**
 * 获取事件类型的颜色（纯函数）
 */
function getEventTypeColor(type: string): string {
  const colors: Record<string, string> = {
    HAND_START: '#22c55e',
    HAND_END: '#ef4444',
    SHOWDOWN: '#f59e0b',
    POST_BLIND: '#8b5cf6',
    DEAL_HOLE: '#3b82f6',
    DEAL_COMMUNITY: '#3b82f6',
    STREET_START: '#06b6d4',
    FOLD: '#6b7280',
    CHECK: '#9ca3af',
    CALL: '#10b981',
    BET: '#f97316',
    RAISE: '#f97316',
    ALL_IN: '#dc2626',
  };
  return colors[type] ?? '#6b7280';
}

/**
 * 获取事件类型的图标（纯函数）
 */
function getEventIcon(type: string): string {
  const icons: Record<string, string> = {
    HAND_START: '\u25B6',   // ▶
    HAND_END: '\u25A0',     // ■
    SHOWDOWN: '\u2605',     // ★
    POST_BLIND: '\u25CF',   // ●
    DEAL_HOLE: '\u2660',    // ♠
    DEAL_COMMUNITY: '\u2663', // ♣
    STREET_START: '\u25B7', // ▷
    FOLD: '\u2717',         // ✗
    CHECK: '\u2713',        // ✓
    CALL: '\u2192',         // →
    BET: '\u25B2',          // ▲
    RAISE: '\u25B2',        // ▲
    ALL_IN: '\u2B24',       // ⬤
  };
  return icons[type] ?? '\u25CB'; // ○
}

/**
 * 格式化事件为人类可读的解释文本（纯函数）
 *
 * 这是核心格式化函数，从事件"推导"解释，而非"计算"状态差异。
 *
 * @param event - 要解释的事件（只读）
 * @param playerNames - 玩家 ID → 名称映射
 * @returns 格式化后的解释文本
 */
function formatEventExplanation(
  event: EventInfo,
  playerNames: Map<string, string>
): string {
  const getName = (id: string | undefined) => getPlayerName(id, playerNames);

  switch (event.type) {
    // ================================================================
    // 手牌生命周期事件
    // ================================================================
    case 'HAND_START': {
      const playerList = event.players?.map((p) => p.name).join(', ') ?? '';
      const blinds = event.smallBlind && event.bigBlind
        ? ` Blinds: ${event.smallBlind}/${event.bigBlind}`
        : '';
      return `A new hand begins.${blinds}${playerList ? ` Players: ${playerList}` : ''}`;
    }

    case 'HAND_END': {
      if (!event.winners || event.winners.length === 0) {
        return 'The hand has ended.';
      }
      if (event.winners.length === 1) {
        const w = event.winners[0];
        const handInfo = w.handRank ? ` with ${w.handRank}` : '';
        const reason = event.reason === 'ALL_FOLD' ? ' (all others folded)' : '';
        return `${getName(w.playerId)} wins $${w.amount}${handInfo}${reason}.`;
      }
      // 多个赢家（分池）
      const winnerDescs = event.winners.map((w) => {
        const handInfo = w.handRank ? ` with ${w.handRank}` : '';
        return `${getName(w.playerId)} wins $${w.amount}${handInfo}`;
      });
      return `Split pot: ${winnerDescs.join('; ')}.`;
    }

    // ================================================================
    // 盲注事件
    // ================================================================
    case 'POST_BLIND': {
      const blindType = event.blindType === 'SB' ? 'small blind' : 'big blind';
      return `${getName(event.playerId)} posts the ${blindType} of $${event.amount}.`;
    }

    // ================================================================
    // 发牌事件
    // ================================================================
    case 'DEAL_HOLE': {
      const cards = formatCards(event.cards);
      return `${getName(event.playerId)} receives hole cards${cards ? `: [${cards}]` : '.'}`;
    }

    case 'DEAL_COMMUNITY': {
      const cards = formatCards(event.cards);
      const phaseName = event.phase ?? 'community cards';
      return `The ${phaseName} is dealt: ${cards || '(cards hidden)'}.`;
    }

    // ================================================================
    // 街道事件
    // ================================================================
    case 'STREET_START': {
      const streetNames: Record<string, string> = {
        PREFLOP: 'Preflop',
        FLOP: 'Flop',
        TURN: 'Turn',
        RIVER: 'River',
      };
      const streetName = streetNames[event.street ?? ''] ?? event.street;
      return `The ${streetName} betting round begins.`;
    }

    // ================================================================
    // 下注动作事件
    // ================================================================
    case 'BET':
      return `${getName(event.playerId)} bets $${event.amount}.`;

    case 'CALL':
      return `${getName(event.playerId)} calls $${event.amount}.`;

    case 'RAISE':
      return `${getName(event.playerId)} raises to $${event.amount}.`;

    case 'CHECK':
      return `${getName(event.playerId)} checks.`;

    case 'FOLD':
      return `${getName(event.playerId)} folds their hand.`;

    case 'ALL_IN':
      return `${getName(event.playerId)} goes all-in for $${event.amount}!`;

    // ================================================================
    // 摊牌事件
    // ================================================================
    case 'SHOWDOWN':
      return 'Players reveal their hands for showdown.';

    // ================================================================
    // 未知事件（fallback）
    // ================================================================
    default:
      return `Event: ${event.type}`;
  }
}

/**
 * 生成状态变化的额外说明（纯函数）
 *
 * 提供关于此事件对游戏状态影响的简短说明。
 */
function getStateChangeHint(event: EventInfo): string | null {
  switch (event.type) {
    case 'HAND_START':
      return 'Chips are collected for blinds, cards will be dealt.';
    case 'POST_BLIND':
      return event.blindType === 'BB'
        ? 'Blinds are complete. Hole cards will be dealt next.'
        : null;
    case 'DEAL_HOLE':
      return 'Each player now has their private cards.';
    case 'DEAL_COMMUNITY':
      if (event.phase === 'Flop') {
        return 'Three community cards are now visible.';
      } else if (event.phase === 'Turn') {
        return 'Four community cards are now visible.';
      } else if (event.phase === 'River') {
        return 'All five community cards are now visible.';
      }
      return null;
    case 'FOLD':
      return 'This player is out of the hand.';
    case 'ALL_IN':
      return 'This player has committed all their chips.';
    case 'SHOWDOWN':
      return 'Winner will be determined by hand strength.';
    case 'HAND_END':
      return 'The pot has been awarded. A new hand can begin.';
    default:
      return null;
  }
}

// ============================================================================
// StateExplanationPanel - Main Component
// ============================================================================
//
// 【架构合规性声明】
// - 纯 UI 组件，只读 props，无内部状态
// - 不 import src/replay/** 或 src/commands/**
// - 不调用 EventProcessor
// - 不构造或修改 ReplayEvent
// - 符合 Replay Architecture Freeze Declaration v1.0
// ============================================================================

export function StateExplanationPanel({
  event,
  players,
  title = 'State Explanation',
  showEventType = true,
  compact = false,
}: StateExplanationPanelProps) {
  // ========================================
  // 边界检查：无事件时显示空状态
  // ========================================
  if (!event) {
    return (
      <div
        style={{
          padding: compact ? '8px 12px' : '12px 16px',
          background: 'rgba(100, 100, 100, 0.1)',
          border: '1px solid rgba(100, 100, 100, 0.2)',
          borderRadius: 8,
          fontSize: compact ? 11 : 13,
          color: '#666',
          textAlign: 'center',
        }}
      >
        No event to explain
      </div>
    );
  }

  // ========================================
  // 纯函数计算：构建玩家名称映射
  // ========================================
  const playerNames = buildPlayerNameMap(players);

  // ========================================
  // 纯函数计算：格式化解释文本
  // ========================================
  const explanation = formatEventExplanation(event, playerNames);
  const stateChangeHint = getStateChangeHint(event);
  const eventColor = getEventTypeColor(event.type);
  const eventIcon = getEventIcon(event.type);
  const eventLabel = getEventTypeLabel(event.type);

  // ========================================
  // 纯展示渲染
  // ========================================
  return (
    <div
      style={{
        background: 'rgba(74, 144, 217, 0.08)',
        border: '1px solid rgba(74, 144, 217, 0.2)',
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
          borderBottom: '1px solid rgba(74, 144, 217, 0.15)',
          background: 'rgba(74, 144, 217, 0.05)',
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

        {/* 事件类型标签 */}
        {showEventType && (
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 8px',
              background: `${eventColor}20`,
              borderRadius: 4,
              fontSize: compact ? 9 : 10,
              fontWeight: 600,
              color: eventColor,
            }}
          >
            <span>{eventIcon}</span>
            <span>{eventLabel}</span>
          </span>
        )}
      </div>

      {/* 解释内容 */}
      <div style={{ padding: compact ? '10px 12px' : '14px 16px' }}>
        {/* 主解释文本 */}
        <div
          style={{
            fontSize: compact ? 13 : 15,
            lineHeight: 1.5,
            color: '#e0e0e0',
            fontWeight: 500,
          }}
        >
          {explanation}
        </div>

        {/* 状态变化提示（如有） */}
        {stateChangeHint && (
          <div
            style={{
              marginTop: compact ? 8 : 10,
              padding: compact ? '6px 10px' : '8px 12px',
              background: 'rgba(100, 100, 100, 0.15)',
              borderRadius: 4,
              fontSize: compact ? 10 : 11,
              color: '#9ca3af',
              fontStyle: 'italic',
            }}
          >
            <span style={{ marginRight: 6, opacity: 0.7 }}>
              {'\u2139'}
            </span>
            {stateChangeHint}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// 导出辅助函数（供测试或其他组件使用）
// ============================================================================
//
// 这些都是纯函数，无副作用，可安全导出。
// ============================================================================

export {
  formatEventExplanation,
  getStateChangeHint,
  getEventTypeLabel,
  getEventTypeColor,
  getEventIcon,
  buildPlayerNameMap,
};

// 导出类型供外部使用
export type { EventInfo, StateExplanationPanelProps };
