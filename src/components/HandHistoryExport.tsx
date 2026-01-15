// ============================================================================
// HandHistoryExport - Hand History Text Export (Read-Only Pure Functions)
// ============================================================================
//
// 【A 路线】Replay Architecture Freeze Declaration v1.0 Compliant
//
// 层级: UI Layer (纯导出逻辑)
// 职责: 将事件序列转换为 PokerStars 风格的手牌历史文本
//
// 约束:
//   - 只读输入，纯函数输出
//   - 不 import src/replay/** 或 src/commands/**
//   - 不调用 EventProcessor
//   - 不使用 React Hooks
//   - 不修改任何输入数据
//
// 支持视角模式:
//   - full: 显示所有玩家手牌
//   - observer: Showdown 前隐藏所有手牌
//   - player(id): 只显示指定玩家手牌
//
// ============================================================================

import React from 'react';

// ============================================================================
// 本地类型定义（不依赖 src/replay/events.ts）
// ============================================================================

interface CardInfo {
  readonly suit: string;
  readonly rank: string;
}

interface PlayerInfo {
  readonly id: string;
  readonly name: string;
  readonly seat: number;
  readonly chips: number;
}

interface WinnerInfo {
  readonly playerId: string;
  readonly amount: number;
  readonly handRank?: string;
}

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
  readonly smallBlindSeat?: number;
  readonly bigBlindSeat?: number;
}

interface SnapshotPlayerInfo {
  readonly id: string;
  readonly name: string;
  readonly seat: number;
  readonly chips: number;
  readonly holeCards?: readonly { readonly display: string }[];
}

interface SnapshotInfo {
  readonly handId: string;
  readonly dealerSeat: number;
  readonly smallBlind: number;
  readonly bigBlind: number;
  readonly players: readonly SnapshotPlayerInfo[];
  readonly communityCards?: readonly { readonly display: string }[];
  readonly potTotal: number;
}

/**
 * 视角模式类型
 */
type ViewMode = 'full' | 'observer' | { type: 'player'; playerId: string };

/**
 * HandHistoryExport Props
 */
interface HandHistoryExportProps {
  readonly events: readonly EventInfo[];
  readonly snapshot: SnapshotInfo;
  readonly viewMode?: ViewMode;
  readonly title?: string;
}

// ============================================================================
// 纯函数：手牌历史格式化
// ============================================================================

/**
 * 格式化卡牌为简短显示（纯函数）
 */
function formatCard(card: CardInfo): string {
  const suitMap: Record<string, string> = { S: 's', H: 'h', D: 'd', C: 'c' };
  return `${card.rank}${suitMap[card.suit] ?? card.suit.toLowerCase()}`;
}

/**
 * 格式化多张卡牌（纯函数）
 */
function formatCards(cards: readonly CardInfo[] | undefined): string {
  if (!cards || cards.length === 0) return '';
  return cards.map(formatCard).join(' ');
}

/**
 * 构建玩家名称映射（纯函数）
 */
function buildPlayerNameMap(
  players: readonly PlayerInfo[] | readonly SnapshotPlayerInfo[]
): Map<string, string> {
  const map = new Map<string, string>();
  for (const p of players) {
    map.set(p.id, p.name);
  }
  return map;
}

/**
 * 获取玩家名称（纯函数）
 */
function getPlayerName(
  playerId: string | undefined,
  playerNames: Map<string, string>
): string {
  if (!playerId) return 'Unknown';
  return playerNames.get(playerId) ?? playerId;
}

/**
 * 判断是否应该显示手牌（纯函数）
 */
function shouldShowHoleCards(
  playerId: string,
  viewMode: ViewMode,
  isShowdown: boolean
): boolean {
  if (viewMode === 'full') return true;
  if (viewMode === 'observer') return isShowdown;
  if (typeof viewMode === 'object' && viewMode.type === 'player') {
    return viewMode.playerId === playerId || isShowdown;
  }
  return false;
}

/**
 * 生成手牌历史文本（纯函数）
 *
 * 这是核心导出函数，将事件序列转换为 PokerStars 风格的文本。
 */
function generateHandHistory(
  events: readonly EventInfo[],
  snapshot: SnapshotInfo,
  viewMode: ViewMode = 'full'
): string {
  const lines: string[] = [];
  let playerNames = new Map<string, string>();
  let dealerSeat = snapshot.dealerSeat;
  let smallBlind = snapshot.smallBlind;
  let bigBlind = snapshot.bigBlind;
  let handId = snapshot.handId;
  let isShowdown = false;
  let currentPhase = '';

  // 从事件中提取玩家信息
  const handStartEvent = events.find((e) => e.type === 'HAND_START');
  if (handStartEvent?.players) {
    playerNames = buildPlayerNameMap(handStartEvent.players);
    if (handStartEvent.dealerSeat !== undefined) dealerSeat = handStartEvent.dealerSeat;
    if (handStartEvent.smallBlind !== undefined) smallBlind = handStartEvent.smallBlind;
    if (handStartEvent.bigBlind !== undefined) bigBlind = handStartEvent.bigBlind;
    if (handStartEvent.handId) handId = handStartEvent.handId;
  } else {
    playerNames = buildPlayerNameMap(snapshot.players);
  }

  // 检查是否有 showdown
  isShowdown = events.some((e) => e.type === 'SHOWDOWN' || e.type === 'HAND_END');

  // 标题
  lines.push(`PokerStars Hand #${handId}: Hold'em No Limit (${smallBlind}/${bigBlind})`);
  lines.push(`Table 'Replay' 6-max Seat #${dealerSeat + 1} is the button`);

  // 座位信息
  const playerList = handStartEvent?.players ?? snapshot.players;
  for (const p of playerList) {
    lines.push(`Seat ${p.seat + 1}: ${p.name} (${p.chips} in chips)`);
  }

  // 处理事件
  const holeCardsDealt = new Map<string, string>();

  for (const event of events) {
    switch (event.type) {
      case 'POST_BLIND': {
        const name = getPlayerName(event.playerId, playerNames);
        const blindType = event.blindType === 'SB' ? 'small blind' : 'big blind';
        lines.push(`${name}: posts ${blindType} ${event.amount}`);
        break;
      }

      case 'DEAL_HOLE': {
        if (event.playerId && event.cards) {
          const cards = formatCards(event.cards);
          holeCardsDealt.set(event.playerId, cards);
        }
        break;
      }

      case 'STREET_START': {
        if (event.street === 'PREFLOP' && holeCardsDealt.size > 0) {
          lines.push('*** HOLE CARDS ***');
          // 显示手牌（根据视角模式）
          for (const [pid, cards] of holeCardsDealt) {
            if (shouldShowHoleCards(pid, viewMode, isShowdown)) {
              const name = getPlayerName(pid, playerNames);
              lines.push(`Dealt to ${name} [${cards}]`);
            }
          }
        }
        break;
      }

      case 'DEAL_COMMUNITY': {
        const cards = formatCards(event.cards);
        if (event.phase === 'Flop') {
          currentPhase = 'Flop';
          lines.push(`*** FLOP *** [${cards}]`);
        } else if (event.phase === 'Turn') {
          currentPhase = 'Turn';
          lines.push(`*** TURN *** [${cards}]`);
        } else if (event.phase === 'River') {
          currentPhase = 'River';
          lines.push(`*** RIVER *** [${cards}]`);
        }
        break;
      }

      case 'BET': {
        const name = getPlayerName(event.playerId, playerNames);
        lines.push(`${name}: bets ${event.amount}`);
        break;
      }

      case 'CALL': {
        const name = getPlayerName(event.playerId, playerNames);
        lines.push(`${name}: calls ${event.amount}`);
        break;
      }

      case 'RAISE': {
        const name = getPlayerName(event.playerId, playerNames);
        lines.push(`${name}: raises to ${event.amount}`);
        break;
      }

      case 'CHECK': {
        const name = getPlayerName(event.playerId, playerNames);
        lines.push(`${name}: checks`);
        break;
      }

      case 'FOLD': {
        const name = getPlayerName(event.playerId, playerNames);
        lines.push(`${name}: folds`);
        break;
      }

      case 'ALL_IN': {
        const name = getPlayerName(event.playerId, playerNames);
        lines.push(`${name}: bets ${event.amount} and is all-in`);
        break;
      }

      case 'SHOWDOWN': {
        lines.push('*** SHOWDOWN ***');
        // 显示所有玩家的手牌
        if (viewMode === 'full' || viewMode === 'observer') {
          for (const [pid, cards] of holeCardsDealt) {
            const name = getPlayerName(pid, playerNames);
            lines.push(`${name}: shows [${cards}]`);
          }
        }
        break;
      }

      case 'HAND_END': {
        lines.push('*** SUMMARY ***');
        lines.push(`Total pot ${snapshot.potTotal} | Rake 0`);
        if (event.winners && event.winners.length > 0) {
          for (const w of event.winners) {
            const name = getPlayerName(w.playerId, playerNames);
            const handInfo = w.handRank ? ` with ${w.handRank}` : '';
            lines.push(`${name} collected ${w.amount} from pot${handInfo}`);
          }
        }
        break;
      }
    }
  }

  // 添加生成标记
  lines.push('');
  lines.push('Generated by Texas Hold\'em Replay System');

  return lines.join('\n');
}

/**
 * 复制文本到剪贴板（纯函数包装）
 */
function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    return navigator.clipboard.writeText(text).then(() => true).catch(() => false);
  }
  return Promise.resolve(false);
}

// ============================================================================
// HandHistoryExport Component (纯展示)
// ============================================================================

export function HandHistoryExport({
  events,
  snapshot,
  viewMode = 'full',
  title = 'Hand History',
}: HandHistoryExportProps) {
  // 纯函数计算：生成手牌历史
  const historyText = generateHandHistory(events, snapshot, viewMode);

  // 复制处理（使用事件处理器，非 hook）
  const handleCopy = () => {
    copyToClipboard(historyText);
  };

  // 下载处理
  const handleDownload = () => {
    const blob = new Blob([historyText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hand_${snapshot.handId || 'export'}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      style={{
        background: 'rgba(34, 197, 94, 0.08)',
        border: '1px solid rgba(34, 197, 94, 0.2)',
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
          padding: '8px 12px',
          borderBottom: '1px solid rgba(34, 197, 94, 0.15)',
          background: 'rgba(34, 197, 94, 0.05)',
        }}
      >
        <span
          style={{
            fontSize: 10,
            color: '#4ade80',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            fontWeight: 600,
          }}
        >
          {title}
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={handleCopy}
            style={{
              padding: '4px 10px',
              fontSize: 10,
              background: 'rgba(34, 197, 94, 0.2)',
              border: '1px solid rgba(34, 197, 94, 0.3)',
              borderRadius: 4,
              color: '#4ade80',
              cursor: 'pointer',
            }}
          >
            Copy
          </button>
          <button
            onClick={handleDownload}
            style={{
              padding: '4px 10px',
              fontSize: 10,
              background: 'rgba(34, 197, 94, 0.2)',
              border: '1px solid rgba(34, 197, 94, 0.3)',
              borderRadius: 4,
              color: '#4ade80',
              cursor: 'pointer',
            }}
          >
            Download
          </button>
        </div>
      </div>

      {/* 内容区域 */}
      <div
        style={{
          padding: '12px',
          maxHeight: 300,
          overflowY: 'auto',
        }}
      >
        <pre
          style={{
            margin: 0,
            fontSize: 11,
            fontFamily: 'Monaco, Consolas, monospace',
            color: '#d1d5db',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            lineHeight: 1.5,
          }}
        >
          {historyText}
        </pre>
      </div>

      {/* 视角模式指示 */}
      <div
        style={{
          padding: '6px 12px',
          borderTop: '1px solid rgba(34, 197, 94, 0.15)',
          fontSize: 9,
          color: '#6b7280',
          textAlign: 'center',
        }}
      >
        View Mode:{' '}
        {viewMode === 'full'
          ? 'Full (all cards visible)'
          : viewMode === 'observer'
          ? 'Observer (cards hidden until showdown)'
          : `Player: ${(viewMode as { type: 'player'; playerId: string }).playerId}`}
      </div>
    </div>
  );
}

// ============================================================================
// 导出纯函数供外部使用
// ============================================================================

export {
  generateHandHistory,
  formatCard,
  formatCards,
  shouldShowHoleCards,
};

export type { ViewMode, EventInfo, SnapshotInfo, HandHistoryExportProps };
