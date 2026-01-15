// ============================================================================
// Texas Hold'em Replay Event Model
// ============================================================================
//
// 定义德州扑克回放事件的完整类型系统。
// 事件驱动模型：通过逐个应用事件，从初始状态计算出任意时刻的游戏状态。
//
// ============================================================================

// ============================================================================
// 基础类型
// ============================================================================

/**
 * 花色
 */
export type Suit = 'S' | 'H' | 'D' | 'C';

/**
 * 点数
 */
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A';

/**
 * 卡牌
 */
export interface Card {
  readonly suit: Suit;
  readonly rank: Rank;
}

/**
 * 玩家初始信息
 */
export interface PlayerInfo {
  readonly id: string;
  readonly name: string;
  readonly seat: number;
  readonly chips: number;
}

/**
 * 游戏阶段
 */
export type Phase = 'Preflop' | 'Flop' | 'Turn' | 'River' | 'Showdown';

/**
 * 【H-4.1】Street 类型（显式街道标识）
 */
export type Street = 'PREFLOP' | 'FLOP' | 'TURN' | 'RIVER';

/**
 * 【H-4.1】Hand 结束原因
 */
export type HandEndReason = 'SHOWDOWN' | 'ALL_FOLD';

// ============================================================================
// 事件类型定义
// ============================================================================

/**
 * HAND_START - 一手牌开始
 */
export interface HandStartEvent {
  readonly type: 'HAND_START';
  readonly handId: string;
  readonly players: readonly PlayerInfo[];
  readonly dealerSeat: number;
  readonly smallBlindSeat: number;
  readonly bigBlindSeat: number;
  readonly smallBlind: number;
  readonly bigBlind: number;
}

/**
 * POST_BLIND - 发盲注
 */
export interface PostBlindEvent {
  readonly type: 'POST_BLIND';
  readonly playerId: string;
  readonly amount: number;
  readonly blindType: 'SB' | 'BB';
}

/**
 * DEAL_HOLE - 发手牌
 */
export interface DealHoleEvent {
  readonly type: 'DEAL_HOLE';
  readonly playerId: string;
  readonly cards: readonly [Card, Card];
}

// ============================================================================
// 【H-4.1】Hand 生命周期事件
// ============================================================================

/**
 * STREET_START - 街道开始
 *
 * 【H-4.1 语义】：显式标记一个街道的开始
 * - Street 的推进必须通过此事件
 * - 不依赖隐式判断
 */
export interface StreetStartEvent {
  readonly type: 'STREET_START';
  readonly street: Street;
}

/**
 * BET - 下注
 */
export interface BetEvent {
  readonly type: 'BET';
  readonly playerId: string;
  readonly amount: number;
}

/**
 * CALL - 跟注
 */
export interface CallEvent {
  readonly type: 'CALL';
  readonly playerId: string;
  readonly amount: number;
}

/**
 * RAISE - 加注
 */
export interface RaiseEvent {
  readonly type: 'RAISE';
  readonly playerId: string;
  readonly amount: number; // 加注后的总下注额
}

/**
 * CHECK - 过牌
 */
export interface CheckEvent {
  readonly type: 'CHECK';
  readonly playerId: string;
}

/**
 * FOLD - 弃牌
 */
export interface FoldEvent {
  readonly type: 'FOLD';
  readonly playerId: string;
}

/**
 * ALL_IN - 全押
 */
export interface AllInEvent {
  readonly type: 'ALL_IN';
  readonly playerId: string;
  readonly amount: number;
}

/**
 * DEAL_COMMUNITY - 发公共牌
 */
export interface DealCommunityEvent {
  readonly type: 'DEAL_COMMUNITY';
  readonly phase: 'Flop' | 'Turn' | 'River';
  readonly cards: readonly Card[];
}

/**
 * SHOWDOWN - 摊牌
 */
export interface ShowdownEvent {
  readonly type: 'SHOWDOWN';
}

/**
 * HAND_END - 一手牌结束
 *
 * 【H-4.1 语义】：显式标记手牌结束原因
 * - reason 为可选字段，保持向后兼容
 * - SHOWDOWN: 摊牌结束
 * - ALL_FOLD: 其他玩家全部弃牌
 */
export interface HandEndEvent {
  readonly type: 'HAND_END';
  readonly reason?: HandEndReason;
  readonly winners: readonly {
    readonly playerId: string;
    readonly amount: number;
    readonly handRank?: string;
  }[];
}

// ============================================================================
// 事件联合类型
// ============================================================================

/**
 * ReplayEvent - 所有回放事件的联合类型
 *
 * 【H-4.1】增加 StreetStartEvent 支持显式街道生命周期
 */
export type ReplayEvent =
  | HandStartEvent
  | PostBlindEvent
  | DealHoleEvent
  | StreetStartEvent
  | BetEvent
  | CallEvent
  | RaiseEvent
  | CheckEvent
  | FoldEvent
  | AllInEvent
  | DealCommunityEvent
  | ShowdownEvent
  | HandEndEvent;

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 创建卡牌显示文本
 */
export function cardDisplay(card: Card): string {
  const suitSymbols: Record<Suit, string> = {
    S: '♠',
    H: '♥',
    D: '♦',
    C: '♣',
  };
  return `${card.rank}${suitSymbols[card.suit]}`;
}

/**
 * 创建卡牌的完整花色名
 */
export function suitName(suit: Suit): string {
  const names: Record<Suit, string> = {
    S: 'Spades',
    H: 'Hearts',
    D: 'Diamonds',
    C: 'Clubs',
  };
  return names[suit];
}
