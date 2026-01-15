// ============================================================================
// EventProcessor - 事件处理器
// ============================================================================
//
// 从 ReplayEvent[] 计算出 GameSnapshot。
// 通过逐个应用事件，从初始状态推导出任意时刻的游戏状态。
//
// ============================================================================

import type {
  ReplayEvent,
  Card,
  PlayerInfo,
  Phase,
  Street,
} from './events';
import { cardDisplay, suitName } from './events';
import type { GameSnapshot, PlayerSnapshot, CardSnapshot } from '../types/replay';
import { emptySnapshot } from '../types/replay';

// ============================================================================
// 内部状态类型
// ============================================================================

interface PlayerState {
  id: string;
  name: string;
  seat: number;
  chips: number;
  bet: number;
  status: 'Active' | 'Folded' | 'AllIn' | 'Out';
  holeCards: Card[];
  totalContribution: number;
}

interface GameState {
  handId: string;
  players: Map<string, PlayerState>;
  dealerSeat: number;
  smallBlindSeat: number;
  bigBlindSeat: number;
  smallBlind: number;
  bigBlind: number;
  communityCards: Card[];
  potTotal: number;
  phase: Phase | '';
  /**
   * 【H-4.2】语义街道
   * - 由 STREET_START 事件显式设置
   * - 或由 DEAL_COMMUNITY 隐式推断（向后兼容）
   */
  street: Street | '';
  currentPlayerId: string;
  currentBet: number;
  /** 下注是否进行中（玩家能否行动） */
  isActive: boolean;
  /**
   * 【H-4.3】手牌是否已结束
   * - 由 HAND_END 事件设置
   * - 区别于 isActive：SHOWDOWN 时 isActive=false 但 isHandOver=false
   */
  isHandOver: boolean;
  /**
   * 【H-4.3】手牌结束原因
   * - SHOWDOWN: 摊牌结束
   * - ALL_FOLD: 其他玩家全部弃牌
   * - '': 手牌尚未结束
   */
  handEndReason: string;
  winners: Array<{ playerId: string; amount: number; handRank?: string }>;
}

// ============================================================================
// EventProcessor
// ============================================================================

/**
 * EventProcessor - 事件处理器
 *
 * 从事件序列计算游戏状态快照。
 */
export class EventProcessor {
  /**
   * 处理事件序列到指定索引，返回该时刻的 GameSnapshot
   */
  static process(events: readonly ReplayEvent[], toIndex: number): GameSnapshot {
    if (events.length === 0 || toIndex < 0) {
      return emptySnapshot();
    }

    const state = this.createInitialState();
    const endIndex = Math.min(toIndex, events.length - 1);

    for (let i = 0; i <= endIndex; i++) {
      this.applyEvent(state, events[i]);
    }

    return this.toSnapshot(state, endIndex);
  }

  /**
   * 创建初始游戏状态
   */
  private static createInitialState(): GameState {
    return {
      handId: '',
      players: new Map(),
      dealerSeat: -1,
      smallBlindSeat: -1,
      bigBlindSeat: -1,
      smallBlind: 0,
      bigBlind: 0,
      communityCards: [],
      potTotal: 0,
      phase: '',
      street: '',
      currentPlayerId: '',
      currentBet: 0,
      isActive: false,
      isHandOver: false,
      handEndReason: '',
      winners: [],
    };
  }

  /**
   * Find the next active (non-folded, non-all-in) player after the given player ID.
   * Returns empty string if no active player found.
   */
  private static getNextActivePlayer(state: GameState, afterPlayerId: string): string {
    const players = Array.from(state.players.values()).sort((a, b) => a.seat - b.seat);
    if (players.length === 0) return '';

    // Find the index of the player who just acted
    const currentIndex = players.findIndex((p) => p.id === afterPlayerId);
    if (currentIndex === -1) return '';

    // Look for the next active player (wrapping around)
    const numPlayers = players.length;
    for (let i = 1; i <= numPlayers; i++) {
      const nextIndex = (currentIndex + i) % numPlayers;
      const nextPlayer = players[nextIndex];
      if (nextPlayer.status === 'Active') {
        return nextPlayer.id;
      }
    }

    return '';
  }

  /**
   * Advance the current player to the next active player after an action.
   */
  private static advanceCurrentPlayer(state: GameState, actingPlayerId: string): void {
    state.currentPlayerId = this.getNextActivePlayer(state, actingPlayerId);
  }

  /**
   * Find the first active player after a given seat.
   * Used to determine starting player for a betting round.
   */
  private static getFirstActivePlayerAfterSeat(state: GameState, afterSeat: number): string {
    const players = Array.from(state.players.values()).sort((a, b) => a.seat - b.seat);
    if (players.length === 0) return '';

    const numPlayers = players.length;
    // Find the first player with seat > afterSeat, or wrap around
    for (let i = 0; i < numPlayers; i++) {
      const player = players[i];
      if (player.seat > afterSeat && player.status === 'Active') {
        return player.id;
      }
    }
    // Wrap around: check from beginning
    for (let i = 0; i < numPlayers; i++) {
      const player = players[i];
      if (player.status === 'Active') {
        return player.id;
      }
    }
    return '';
  }

  /**
   * 应用单个事件到状态
   */
  private static applyEvent(state: GameState, event: ReplayEvent): void {
    switch (event.type) {
      case 'HAND_START':
        state.handId = event.handId;
        state.dealerSeat = event.dealerSeat;
        state.smallBlindSeat = event.smallBlindSeat;
        state.bigBlindSeat = event.bigBlindSeat;
        state.smallBlind = event.smallBlind;
        state.bigBlind = event.bigBlind;
        state.phase = 'Preflop';
        state.street = 'PREFLOP'; // 【H-4.2】初始街道
        state.isActive = true;
        state.isHandOver = false; // 【H-4.3】手牌开始，重置结束状态
        state.handEndReason = '';
        state.communityCards = [];
        state.potTotal = 0;
        state.currentBet = 0;
        state.winners = [];

        // 初始化玩家
        for (const p of event.players) {
          state.players.set(p.id, {
            id: p.id,
            name: p.name,
            seat: p.seat,
            chips: p.chips,
            bet: 0,
            status: 'Active',
            holeCards: [],
            totalContribution: 0,
          });
        }

        // Set initial current player to small blind (who posts first)
        state.currentPlayerId = this.getFirstActivePlayerAfterSeat(state, state.dealerSeat);
        break;

      case 'POST_BLIND': {
        const player = state.players.get(event.playerId);
        if (player) {
          player.chips -= event.amount;
          player.bet = event.amount;
          player.totalContribution += event.amount;
          state.potTotal += event.amount;
          if (event.amount > state.currentBet) {
            state.currentBet = event.amount;
          }
          this.advanceCurrentPlayer(state, event.playerId);
        }
        break;
      }

      case 'DEAL_HOLE': {
        const player = state.players.get(event.playerId);
        if (player) {
          player.holeCards = [...event.cards];
        }
        break;
      }

      // ================================================================
      // 【H-4.1 + H-4.2】STREET_START - 显式街道开始
      // ================================================================
      // 【H-4.1 语义】：标记事件，不改变筹码、下注、玩家状态
      // 【H-4.2 语义】：设置当前语义街道（street）
      //
      // street vs phase 分层：
      // - street: 由 STREET_START 显式设置（语义层）
      // - phase: 由 DEAL_COMMUNITY 设置（向后兼容层）
      //
      // 这样既保证了 street 的显式语义，又不破坏依赖 phase 的既有代码。
      // ================================================================
      case 'STREET_START': {
        // 【H-4.2】设置语义街道
        state.street = event.street;
        break;
      }

      case 'BET': {
        const player = state.players.get(event.playerId);
        if (player) {
          const additional = event.amount - player.bet;
          player.chips -= additional;
          player.bet = event.amount;
          player.totalContribution += additional;
          state.potTotal += additional;
          state.currentBet = event.amount;
          this.advanceCurrentPlayer(state, event.playerId);
        }
        break;
      }

      case 'CALL': {
        const player = state.players.get(event.playerId);
        if (player) {
          const additional = event.amount - player.bet;
          player.chips -= additional;
          player.bet = event.amount;
          player.totalContribution += additional;
          state.potTotal += additional;
          this.advanceCurrentPlayer(state, event.playerId);
        }
        break;
      }

      case 'RAISE': {
        const player = state.players.get(event.playerId);
        if (player) {
          const additional = event.amount - player.bet;
          player.chips -= additional;
          player.bet = event.amount;
          player.totalContribution += additional;
          state.potTotal += additional;
          state.currentBet = event.amount;
          this.advanceCurrentPlayer(state, event.playerId);
        }
        break;
      }

      case 'CHECK':
        // Check doesn't change chip amounts, but advances the current player
        this.advanceCurrentPlayer(state, event.playerId);
        break;

      case 'FOLD': {
        const player = state.players.get(event.playerId);
        if (player) {
          player.status = 'Folded';
          this.advanceCurrentPlayer(state, event.playerId);
        }
        break;
      }

      case 'ALL_IN': {
        const player = state.players.get(event.playerId);
        if (player) {
          const additional = event.amount - player.bet;
          player.chips -= additional;
          player.bet = event.amount;
          player.totalContribution += additional;
          player.status = 'AllIn';
          state.potTotal += additional;
          if (event.amount > state.currentBet) {
            state.currentBet = event.amount;
          }
          this.advanceCurrentPlayer(state, event.playerId);
        }
        break;
      }

      case 'DEAL_COMMUNITY':
        state.phase = event.phase;
        state.communityCards = [...state.communityCards, ...event.cards];

        // ================================================================
        // 【H-4.2】向后兼容：从 DEAL_COMMUNITY 推断 street
        // ================================================================
        // 如果 street 尚未被 STREET_START 设置，则从公共牌数量推断：
        // - 3张公共牌 → FLOP
        // - 4张公共牌 → TURN
        // - 5张公共牌 → RIVER
        //
        // 这确保没有 STREET_START 的旧事件序列也能正确推断 street。
        // ================================================================
        if (state.communityCards.length === 3) {
          if (state.street === 'PREFLOP') {
            state.street = 'FLOP';
          }
        } else if (state.communityCards.length === 4) {
          if (state.street === 'FLOP') {
            state.street = 'TURN';
          }
        } else if (state.communityCards.length === 5) {
          if (state.street === 'TURN') {
            state.street = 'RIVER';
          }
        }

        // 新一轮下注，重置玩家当前下注
        state.players.forEach((p) => {
          p.bet = 0;
        });
        state.currentBet = 0;
        // Reset current player to first active player after dealer for post-flop rounds
        state.currentPlayerId = this.getFirstActivePlayerAfterSeat(state, state.dealerSeat);
        break;

      case 'SHOWDOWN':
        state.phase = 'Showdown';
        state.isActive = false;
        state.currentPlayerId = ''; // No active player during showdown
        break;

      // ================================================================
      // 【H-4.3】HAND_END - 手牌结束语义
      // ================================================================
      // 语义边界：
      // - HAND_END 标记手牌正式结束，有赢家结算
      // - isHandOver = true：手牌已结束
      // - handEndReason：结束原因（SHOWDOWN | ALL_FOLD）
      //
      // 与 SHOWDOWN 的区别：
      // - SHOWDOWN：标记摊牌阶段开始，但手牌尚未结束
      // - HAND_END：标记手牌正式结束，分发奖金
      // ================================================================
      case 'HAND_END':
        state.isActive = false;
        state.isHandOver = true; // 【H-4.3】手牌正式结束
        state.handEndReason = event.reason || ''; // 【H-4.3】结束原因
        state.currentPlayerId = ''; // No active player after hand ends
        state.winners = [...event.winners];
        // 发放奖金
        for (const winner of event.winners) {
          const player = state.players.get(winner.playerId);
          if (player) {
            player.chips += winner.amount;
          }
        }
        break;
    }
  }

  /**
   * 将内部状态转换为 GameSnapshot
   */
  private static toSnapshot(state: GameState, sequence: number): GameSnapshot {
    // Use tracked currentPlayerId from state
    const currentPlayerId = state.currentPlayerId;
    const currentPlayer = currentPlayerId ? state.players.get(currentPlayerId) : undefined;
    const currentSeat = currentPlayer?.seat ?? -1;

    // 转换玩家列表
    const players: PlayerSnapshot[] = Array.from(state.players.values())
      .sort((a, b) => a.seat - b.seat)
      .map((p) => ({
        id: p.id,
        name: p.name,
        seat: p.seat,
        chips: p.chips,
        bet: p.bet,
        status: p.status,
        holeCards: p.holeCards.map(this.cardToSnapshot),
        totalContribution: p.totalContribution,
        isDealer: p.seat === state.dealerSeat,
        isSmallBlind: p.seat === state.smallBlindSeat,
        isBigBlind: p.seat === state.bigBlindSeat,
        isCurrent: p.id === currentPlayerId,
      }));

    // 转换公共牌
    const communityCards = state.communityCards.map(this.cardToSnapshot);

    return {
      handId: state.handId,
      sequence,
      tick: sequence,
      phase: state.phase,
      street: state.street, // 【H-4.2】语义街道
      roundCount: 1,
      isActive: state.isActive,
      isHandOver: state.isHandOver, // 【H-4.3】手牌是否结束
      handEndReason: state.handEndReason, // 【H-4.3】结束原因
      dealerSeat: state.dealerSeat,
      smallBlindSeat: state.smallBlindSeat,
      bigBlindSeat: state.bigBlindSeat,
      smallBlind: state.smallBlind,
      bigBlind: state.bigBlind,
      communityCards,
      potTotal: state.potTotal,
      pots: [
        {
          amount: state.potTotal,
          playerIds: players.filter((p) => p.status !== 'Folded').map((p) => p.id),
          type: 'main',
        },
      ],
      players,
      currentPlayerId,
      currentSeat,
      validActions: state.isActive ? ['Fold', 'Check', 'Call', 'Raise'] : [],
      amountToCall: state.currentBet,
      minRaise: state.bigBlind,
    };
  }

  /**
   * 将 Card 转换为 CardSnapshot
   */
  private static cardToSnapshot(card: Card): CardSnapshot {
    return {
      suit: suitName(card.suit),
      rank: card.rank,
      display: cardDisplay(card),
      suitCode: card.suit,
      rankCode: card.rank,
    };
  }
}
