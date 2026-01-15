// ============================================================================
// formatReplayEvent - 事件文本格式化工具
// ============================================================================
//
// 将 ReplayEvent 转换为人类可读的德州扑克描述文本。
// 纯函数，无副作用，只依赖 event 数据。
//
// 扩展方式：
// 1. 在 ReplayEvent union 中添加新事件类型
// 2. 在下方 switch 语句中添加对应的 case
// 3. 返回格式化后的字符串
//
// ============================================================================

import type { ReplayEvent, Card } from '../replay/events';

/**
 * 格式化单张卡牌为简短显示（如 "Ah", "Kd"）
 */
function formatCard(card: Card): string {
  return `${card.rank}${card.suit.toLowerCase()}`;
}

/**
 * 格式化多张卡牌（如 "Ah Kd 7c"）
 */
function formatCards(cards: readonly Card[]): string {
  return cards.map(formatCard).join(' ');
}

/**
 * 根据玩家 ID 获取显示名称
 * 如果有 snapshot 中的玩家信息，使用名称；否则使用 ID
 */
function getPlayerName(
  playerId: string,
  playerNames?: Map<string, string>
): string {
  return playerNames?.get(playerId) ?? playerId;
}

/**
 * 格式化 ReplayEvent 为人类可读文本
 *
 * @param event - 要格式化的事件
 * @param playerNames - 可选的玩家 ID → 名称映射
 * @returns 格式化后的事件描述
 */
export function formatReplayEvent(
  event: ReplayEvent | null | undefined,
  playerNames?: Map<string, string>
): string {
  if (!event) {
    return '';
  }

  const getName = (id: string) => getPlayerName(id, playerNames);

  switch (event.type) {
    case 'HAND_START': {
      const playerList = event.players.map((p) => p.name).join(', ');
      return `Hand #${event.handId} starts. Players: ${playerList}`;
    }

    case 'POST_BLIND': {
      const blindType = event.blindType === 'SB' ? 'small blind' : 'big blind';
      return `${getName(event.playerId)} posts ${blindType} ${event.amount}`;
    }

    case 'DEAL_HOLE': {
      const cards = formatCards(event.cards);
      return `${getName(event.playerId)} is dealt [${cards}]`;
    }

    // 【H-4.1】STREET_START 事件
    case 'STREET_START': {
      const streetNames: Record<string, string> = {
        PREFLOP: 'Preflop',
        FLOP: 'Flop',
        TURN: 'Turn',
        RIVER: 'River',
      };
      return `${streetNames[event.street] || event.street} begins`;
    }

    case 'BET':
      return `${getName(event.playerId)} bets ${event.amount}`;

    case 'CALL':
      return `${getName(event.playerId)} calls ${event.amount}`;

    case 'RAISE':
      return `${getName(event.playerId)} raises to ${event.amount}`;

    case 'CHECK':
      return `${getName(event.playerId)} checks`;

    case 'FOLD':
      return `${getName(event.playerId)} folds`;

    case 'ALL_IN':
      return `${getName(event.playerId)} goes all-in for ${event.amount}`;

    case 'DEAL_COMMUNITY': {
      const cards = formatCards(event.cards);
      const phaseName = event.phase.toLowerCase();
      return `${event.phase} is dealt: ${cards}`;
    }

    case 'SHOWDOWN':
      return 'Showdown';

    case 'HAND_END': {
      if (event.winners.length === 0) {
        return 'Hand ends';
      }
      if (event.winners.length === 1) {
        const w = event.winners[0];
        const handInfo = w.handRank ? ` with ${w.handRank}` : '';
        return `${getName(w.playerId)} wins the pot (${w.amount})${handInfo}`;
      }
      // 多个赢家（分池）
      const winnerDescs = event.winners.map((w) => {
        const handInfo = w.handRank ? ` with ${w.handRank}` : '';
        return `${getName(w.playerId)} wins ${w.amount}${handInfo}`;
      });
      return winnerDescs.join('; ');
    }

    default: {
      // 类型安全：确保处理了所有事件类型
      const _exhaustive: never = event;
      return `Unknown event`;
    }
  }
}

/**
 * 从 snapshot 的 players 数组构建 playerNames Map
 */
export function buildPlayerNamesMap(
  players: readonly { id: string; name: string }[]
): Map<string, string> {
  const map = new Map<string, string>();
  for (const p of players) {
    map.set(p.id, p.name);
  }
  return map;
}
