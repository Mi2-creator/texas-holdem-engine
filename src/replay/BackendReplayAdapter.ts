// ============================================================================
// BackendReplayAdapter - 后端数据转换适配器
// ============================================================================
//
// 将 Go 后端导出的 hand JSON 转换为 Replay 所需的 snapshots 数组。
//
// 转换规则：
// - 每个 action 产生一个 snapshot
// - snapshot.phase 对应德州阶段：Preflop / Flop / Turn / River / Showdown
// - 后端 street 映射：preflop→Preflop, flop→Flop, turn→Turn, river→River
// - showdown 单独处理
//
// ============================================================================

import { GameSnapshot, CardSnapshot, PlayerSnapshot, PotSnapshot } from '../types/replay';
import { Replay, createReplay } from './types';
import { Phase, PhaseType } from './Phase';

// ============================================================================
// 后端数据类型定义
// ============================================================================

/**
 * 后端卡牌格式
 */
export interface BackendCard {
  suit: string;    // "S" | "H" | "D" | "C"
  rank: string;    // "2"-"9" | "T" | "J" | "Q" | "K" | "A"
}

/**
 * 后端玩家格式
 */
export interface BackendPlayer {
  id: string;
  name: string;
  seat: number;
  chips: number;
  holeCards?: BackendCard[];
  status: string;  // "active" | "folded" | "allin" | "out"
}

/**
 * 后端动作格式
 */
export interface BackendAction {
  playerId: string;
  type: string;    // "fold" | "check" | "call" | "bet" | "raise" | "allin"
  amount?: number;
  street: string;  // "preflop" | "flop" | "turn" | "river"
}

/**
 * 后端底池格式
 */
export interface BackendPot {
  amount: number;
  eligiblePlayerIds: string[];
  type: string;    // "main" | "side"
}

/**
 * 后端一手牌完整数据
 */
export interface BackendHand {
  handId: string;
  players: BackendPlayer[];
  dealerSeat: number;
  smallBlindSeat: number;
  bigBlindSeat: number;
  smallBlind: number;
  bigBlind: number;
  board: BackendCard[];           // 公共牌（最多5张）
  actions: BackendAction[];       // 所有动作序列
  pots: BackendPot[];             // 底池
  winners?: Array<{
    playerId: string;
    amount: number;
    handRank?: string;
  }>;
}

// ============================================================================
// 转换辅助函数
// ============================================================================

/**
 * 后端 street 映射到 Phase
 */
function streetToPhase(street: string): PhaseType {
  switch (street.toLowerCase()) {
    case 'preflop':
      return Phase.Preflop;
    case 'flop':
      return Phase.Flop;
    case 'turn':
      return Phase.Turn;
    case 'river':
      return Phase.River;
    default:
      return Phase.Preflop;
  }
}

/**
 * 转换卡牌格式
 */
function convertCard(card: BackendCard): CardSnapshot {
  const suitMap: Record<string, string> = {
    S: 'Spades',
    H: 'Hearts',
    D: 'Diamonds',
    C: 'Clubs',
  };

  const suitSymbol: Record<string, string> = {
    S: '♠',
    H: '♥',
    D: '♦',
    C: '♣',
  };

  const suit = suitMap[card.suit.toUpperCase()] || card.suit;
  const suitCode = card.suit.toUpperCase();
  const rankCode = card.rank.toUpperCase();
  const display = `${rankCode}${suitSymbol[suitCode] || suitCode}`;

  return {
    suit,
    rank: card.rank,
    display,
    suitCode,
    rankCode,
  };
}

/**
 * 转换玩家状态格式
 */
function convertPlayerStatus(status: string): string {
  switch (status.toLowerCase()) {
    case 'active':
      return 'Active';
    case 'folded':
      return 'Folded';
    case 'allin':
      return 'AllIn';
    case 'out':
      return 'Out';
    default:
      return 'Active';
  }
}

/**
 * 获取指定 street 应显示的公共牌数量
 */
function getBoardCountForStreet(street: string): number {
  switch (street.toLowerCase()) {
    case 'preflop':
      return 0;
    case 'flop':
      return 3;
    case 'turn':
      return 4;
    case 'river':
      return 5;
    default:
      return 0;
  }
}

// ============================================================================
// BackendReplayAdapter
// ============================================================================

/**
 * BackendReplayAdapter - 后端数据转换适配器
 *
 * 将后端 hand JSON 转换为 Replay snapshots。
 * 每个 action 产生一个 snapshot，反映该动作执行后的游戏状态。
 */
export class BackendReplayAdapter {
  /**
   * 将后端 hand 数据转换为 Replay
   */
  static toReplay(hand: BackendHand): Replay {
    const snapshots = this.toSnapshots(hand);
    return createReplay(hand.handId, snapshots);
  }

  /**
   * 将后端 hand 数据转换为 snapshots 数组
   */
  static toSnapshots(hand: BackendHand): GameSnapshot[] {
    const snapshots: GameSnapshot[] = [];

    // 初始化玩家状态追踪
    const playerStates = new Map<string, {
      chips: number;
      bet: number;
      status: string;
      totalContribution: number;
    }>();

    hand.players.forEach((p) => {
      playerStates.set(p.id, {
        chips: p.chips,
        bet: 0,
        status: p.status,
        totalContribution: 0,
      });
    });

    // 追踪当前 street 和底池
    let currentStreet = 'preflop';
    let potTotal = hand.smallBlind + hand.bigBlind;
    let sequence = 0;

    // 处理盲注初始状态
    const sbPlayer = hand.players.find((p) => p.seat === hand.smallBlindSeat);
    const bbPlayer = hand.players.find((p) => p.seat === hand.bigBlindSeat);

    if (sbPlayer) {
      const state = playerStates.get(sbPlayer.id)!;
      state.chips -= hand.smallBlind;
      state.bet = hand.smallBlind;
      state.totalContribution = hand.smallBlind;
    }

    if (bbPlayer) {
      const state = playerStates.get(bbPlayer.id)!;
      state.chips -= hand.bigBlind;
      state.bet = hand.bigBlind;
      state.totalContribution = hand.bigBlind;
    }

    // 生成初始 snapshot（发牌后、动作前）
    snapshots.push(
      this.createSnapshot(hand, playerStates, currentStreet, potTotal, sequence++, '', -1)
    );

    // 处理每个动作
    for (const action of hand.actions) {
      // 检查是否切换了 street
      if (action.street !== currentStreet) {
        currentStreet = action.street;
        // 切换 street 时重置所有玩家的当前下注
        playerStates.forEach((state) => {
          state.bet = 0;
        });
      }

      // 更新玩家状态
      const playerState = playerStates.get(action.playerId);
      if (playerState) {
        switch (action.type.toLowerCase()) {
          case 'fold':
            playerState.status = 'folded';
            break;
          case 'check':
            // check 不改变筹码
            break;
          case 'call':
          case 'bet':
          case 'raise':
          case 'allin':
            if (action.amount !== undefined) {
              const additionalBet = action.amount - playerState.bet;
              playerState.chips -= additionalBet;
              playerState.bet = action.amount;
              playerState.totalContribution += additionalBet;
              potTotal += additionalBet;
            }
            if (action.type.toLowerCase() === 'allin') {
              playerState.status = 'allin';
            }
            break;
        }
      }

      // 找到当前行动玩家的座位
      const currentPlayer = hand.players.find((p) => p.id === action.playerId);
      const currentSeat = currentPlayer?.seat ?? -1;

      // 生成动作后的 snapshot
      snapshots.push(
        this.createSnapshot(
          hand,
          playerStates,
          currentStreet,
          potTotal,
          sequence++,
          action.playerId,
          currentSeat
        )
      );
    }

    // 如果有赢家，添加 Showdown snapshot
    if (hand.winners && hand.winners.length > 0) {
      // 更新赢家筹码
      hand.winners.forEach((winner) => {
        const state = playerStates.get(winner.playerId);
        if (state) {
          state.chips += winner.amount;
        }
      });

      snapshots.push(
        this.createSnapshot(hand, playerStates, 'showdown', potTotal, sequence++, '', -1)
      );
    }

    return snapshots;
  }

  /**
   * 创建单个 snapshot
   */
  private static createSnapshot(
    hand: BackendHand,
    playerStates: Map<string, {
      chips: number;
      bet: number;
      status: string;
      totalContribution: number;
    }>,
    street: string,
    potTotal: number,
    sequence: number,
    currentPlayerId: string,
    currentSeat: number
  ): GameSnapshot {
    const phase = street === 'showdown' ? Phase.Showdown : streetToPhase(street);
    const boardCount = street === 'showdown' ? 5 : getBoardCountForStreet(street);
    const communityCards = hand.board.slice(0, boardCount).map(convertCard);

    const players: PlayerSnapshot[] = hand.players.map((p) => {
      const state = playerStates.get(p.id)!;
      return {
        id: p.id,
        name: p.name,
        seat: p.seat,
        chips: state.chips,
        bet: state.bet,
        status: convertPlayerStatus(state.status),
        holeCards: p.holeCards?.map(convertCard) ?? [],
        totalContribution: state.totalContribution,
        isDealer: p.seat === hand.dealerSeat,
        isSmallBlind: p.seat === hand.smallBlindSeat,
        isBigBlind: p.seat === hand.bigBlindSeat,
        isCurrent: p.id === currentPlayerId,
      };
    });

    const pots: PotSnapshot[] = hand.pots.map((pot) => ({
      amount: pot.amount,
      playerIds: pot.eligiblePlayerIds,
      type: pot.type,
    }));

    // 如果后端没有提供 pots，创建一个主池
    if (pots.length === 0) {
      pots.push({
        amount: potTotal,
        playerIds: hand.players.filter((p) => playerStates.get(p.id)?.status !== 'folded').map((p) => p.id),
        type: 'main',
      });
    }

    // 计算 validActions（简化版：基于当前玩家状态）
    const validActions: string[] = [];
    if (currentPlayerId && street !== 'showdown') {
      const currentPlayerState = playerStates.get(currentPlayerId);
      if (currentPlayerState && currentPlayerState.status === 'active') {
        validActions.push('Fold');
        // 简化：假设总是可以 check/call/raise
        validActions.push('Check', 'Call', 'Raise');
      }
    }

    return {
      handId: hand.handId,
      sequence,
      tick: sequence,
      phase,
      roundCount: 1,
      isActive: street !== 'showdown',
      dealerSeat: hand.dealerSeat,
      smallBlindSeat: hand.smallBlindSeat,
      bigBlindSeat: hand.bigBlindSeat,
      smallBlind: hand.smallBlind,
      bigBlind: hand.bigBlind,
      communityCards,
      potTotal,
      pots,
      players,
      currentPlayerId,
      currentSeat,
      validActions,
      amountToCall: 0, // 简化：需要更复杂逻辑计算
      minRaise: hand.bigBlind, // 简化：使用大盲作为最小加注
    };
  }
}

// ============================================================================
// 示例：Mock 后端数据
// ============================================================================

/**
 * 创建一个最小的 mock 后端 hand 数据
 *
 * 场景：3人局，preflop 到 showdown
 * - Alice (seat 0, dealer): A♠ K♠
 * - Bob (seat 1, SB): Q♥ J♥
 * - Charlie (seat 2, BB): T♦ 9♣
 *
 * 动作序列：
 * 1. Preflop: Alice raise 20, Bob call, Charlie fold
 * 2. Flop: Bob check, Alice bet 30, Bob call
 * 3. Turn: Bob check, Alice check
 * 4. River: Bob check, Alice bet 50, Bob fold
 * 5. Showdown: Alice wins
 */
export function createMockBackendHand(): BackendHand {
  return {
    handId: 'mock-001',
    players: [
      {
        id: 'alice',
        name: 'Alice',
        seat: 0,
        chips: 500,
        holeCards: [
          { suit: 'S', rank: 'A' },
          { suit: 'S', rank: 'K' },
        ],
        status: 'active',
      },
      {
        id: 'bob',
        name: 'Bob',
        seat: 1,
        chips: 500,
        holeCards: [
          { suit: 'H', rank: 'Q' },
          { suit: 'H', rank: 'J' },
        ],
        status: 'active',
      },
      {
        id: 'charlie',
        name: 'Charlie',
        seat: 2,
        chips: 500,
        holeCards: [
          { suit: 'D', rank: 'T' },
          { suit: 'C', rank: '9' },
        ],
        status: 'active',
      },
    ],
    dealerSeat: 0,
    smallBlindSeat: 1,
    bigBlindSeat: 2,
    smallBlind: 5,
    bigBlind: 10,
    board: [
      { suit: 'H', rank: 'A' },  // Flop 1
      { suit: 'D', rank: '7' },  // Flop 2
      { suit: 'C', rank: '2' },  // Flop 3
      { suit: 'S', rank: '5' },  // Turn
      { suit: 'H', rank: '3' },  // River
    ],
    actions: [
      // Preflop
      { playerId: 'alice', type: 'raise', amount: 20, street: 'preflop' },
      { playerId: 'bob', type: 'call', amount: 20, street: 'preflop' },
      { playerId: 'charlie', type: 'fold', street: 'preflop' },
      // Flop
      { playerId: 'bob', type: 'check', street: 'flop' },
      { playerId: 'alice', type: 'bet', amount: 30, street: 'flop' },
      { playerId: 'bob', type: 'call', amount: 30, street: 'flop' },
      // Turn
      { playerId: 'bob', type: 'check', street: 'turn' },
      { playerId: 'alice', type: 'check', street: 'turn' },
      // River
      { playerId: 'bob', type: 'check', street: 'river' },
      { playerId: 'alice', type: 'bet', amount: 50, street: 'river' },
      { playerId: 'bob', type: 'fold', street: 'river' },
    ],
    pots: [],
    winners: [
      { playerId: 'alice', amount: 115, handRank: 'Pair of Aces' },
    ],
  };
}
