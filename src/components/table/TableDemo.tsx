// ============================================================================
// TableDemo - 牌桌 Demo 页面
// ============================================================================
//
// 组合所有牌桌组件，演示完整的德州扑克牌桌 UI。
//
// 架构说明：
// - TableDemo 是唯一持有状态的组件（仅用于触发重渲染）
// - 所有子组件都是纯函数，不持有状态
// - vm 从 mockPlayer 构造，子组件只读取 vm
// - actions 封装对 mockPlayer 的调用
//
// ============================================================================

import React, { useState, useCallback, useMemo } from 'react';
import {
  ReplayViewModel,
  PlayerActions,
  GameSnapshot,
  emptyViewModel,
} from '../../types/replay';
import { Header } from './Header';
import { Table } from './Table';
import { Controls } from './Controls';

// ============================================================================
// Mock Data（完整的多阶段牌局）
// ============================================================================

const mockSnapshots: GameSnapshot[] = [
  // Preflop - 初始状态
  {
    handId: 'demo-001',
    sequence: 0,
    tick: 0,
    phase: 'Preflop',
    street: 'PREFLOP',
    roundCount: 1,
    isActive: true,
    isHandOver: false,
    handEndReason: '',
    dealerSeat: 0,
    smallBlindSeat: 1,
    bigBlindSeat: 2,
    smallBlind: 5,
    bigBlind: 10,
    communityCards: [],
    potTotal: 15,
    pots: [{ amount: 15, playerIds: ['alice', 'bob', 'charlie'], type: 'main' }],
    players: [
      {
        id: 'alice',
        name: 'Alice',
        seat: 0,
        chips: 500,
        bet: 0,
        status: 'Active',
        holeCards: [
          { suit: 'Spades', rank: 'A', display: 'A♠', suitCode: 'S', rankCode: 'A' },
          { suit: 'Spades', rank: 'K', display: 'K♠', suitCode: 'S', rankCode: 'K' },
        ],
        totalContribution: 0,
        isDealer: true,
        isSmallBlind: false,
        isBigBlind: false,
        isCurrent: false,
      },
      {
        id: 'bob',
        name: 'Bob',
        seat: 1,
        chips: 495,
        bet: 5,
        status: 'Active',
        holeCards: [
          { suit: 'Hearts', rank: 'Q', display: 'Q♥', suitCode: 'H', rankCode: 'Q' },
          { suit: 'Hearts', rank: 'J', display: 'J♥', suitCode: 'H', rankCode: 'J' },
        ],
        totalContribution: 5,
        isDealer: false,
        isSmallBlind: true,
        isBigBlind: false,
        isCurrent: false,
      },
      {
        id: 'charlie',
        name: 'Charlie',
        seat: 2,
        chips: 490,
        bet: 10,
        status: 'Active',
        holeCards: [
          { suit: 'Diamonds', rank: 'T', display: 'T♦', suitCode: 'D', rankCode: 'T' },
          { suit: 'Clubs', rank: '9', display: '9♣', suitCode: 'C', rankCode: '9' },
        ],
        totalContribution: 10,
        isDealer: false,
        isSmallBlind: false,
        isBigBlind: true,
        isCurrent: true,
      },
    ],
    currentPlayerId: 'charlie',
    currentSeat: 2,
    validActions: ['Fold', 'Call', 'Raise'],
    amountToCall: 10,
    minRaise: 20,
  },
  // Preflop - Charlie calls
  {
    handId: 'demo-001',
    sequence: 1,
    tick: 1,
    phase: 'Preflop',
    street: 'PREFLOP',
    roundCount: 1,
    isActive: true,
    isHandOver: false,
    handEndReason: '',
    dealerSeat: 0,
    smallBlindSeat: 1,
    bigBlindSeat: 2,
    smallBlind: 5,
    bigBlind: 10,
    communityCards: [],
    potTotal: 30,
    pots: [{ amount: 30, playerIds: ['alice', 'bob', 'charlie'], type: 'main' }],
    players: [
      {
        id: 'alice',
        name: 'Alice',
        seat: 0,
        chips: 490,
        bet: 10,
        status: 'Active',
        holeCards: [
          { suit: 'Spades', rank: 'A', display: 'A♠', suitCode: 'S', rankCode: 'A' },
          { suit: 'Spades', rank: 'K', display: 'K♠', suitCode: 'S', rankCode: 'K' },
        ],
        totalContribution: 10,
        isDealer: true,
        isSmallBlind: false,
        isBigBlind: false,
        isCurrent: true,
      },
      {
        id: 'bob',
        name: 'Bob',
        seat: 1,
        chips: 490,
        bet: 10,
        status: 'Active',
        holeCards: [
          { suit: 'Hearts', rank: 'Q', display: 'Q♥', suitCode: 'H', rankCode: 'Q' },
          { suit: 'Hearts', rank: 'J', display: 'J♥', suitCode: 'H', rankCode: 'J' },
        ],
        totalContribution: 10,
        isDealer: false,
        isSmallBlind: true,
        isBigBlind: false,
        isCurrent: false,
      },
      {
        id: 'charlie',
        name: 'Charlie',
        seat: 2,
        chips: 490,
        bet: 10,
        status: 'Active',
        holeCards: [
          { suit: 'Diamonds', rank: 'T', display: 'T♦', suitCode: 'D', rankCode: 'T' },
          { suit: 'Clubs', rank: '9', display: '9♣', suitCode: 'C', rankCode: '9' },
        ],
        totalContribution: 10,
        isDealer: false,
        isSmallBlind: false,
        isBigBlind: true,
        isCurrent: false,
      },
    ],
    currentPlayerId: 'alice',
    currentSeat: 0,
    validActions: ['Fold', 'Check', 'Raise'],
    amountToCall: 0,
    minRaise: 20,
  },
  // Flop
  {
    handId: 'demo-001',
    sequence: 2,
    tick: 2,
    phase: 'Flop',
    street: 'FLOP',
    roundCount: 1,
    isActive: true,
    isHandOver: false,
    handEndReason: '',
    dealerSeat: 0,
    smallBlindSeat: 1,
    bigBlindSeat: 2,
    smallBlind: 5,
    bigBlind: 10,
    communityCards: [
      { suit: 'Hearts', rank: 'A', display: 'A♥', suitCode: 'H', rankCode: 'A' },
      { suit: 'Diamonds', rank: '7', display: '7♦', suitCode: 'D', rankCode: '7' },
      { suit: 'Clubs', rank: '2', display: '2♣', suitCode: 'C', rankCode: '2' },
    ],
    potTotal: 30,
    pots: [{ amount: 30, playerIds: ['alice', 'bob', 'charlie'], type: 'main' }],
    players: [
      {
        id: 'alice',
        name: 'Alice',
        seat: 0,
        chips: 490,
        bet: 0,
        status: 'Active',
        holeCards: [
          { suit: 'Spades', rank: 'A', display: 'A♠', suitCode: 'S', rankCode: 'A' },
          { suit: 'Spades', rank: 'K', display: 'K♠', suitCode: 'S', rankCode: 'K' },
        ],
        totalContribution: 10,
        isDealer: true,
        isSmallBlind: false,
        isBigBlind: false,
        isCurrent: false,
      },
      {
        id: 'bob',
        name: 'Bob',
        seat: 1,
        chips: 490,
        bet: 0,
        status: 'Active',
        holeCards: [
          { suit: 'Hearts', rank: 'Q', display: 'Q♥', suitCode: 'H', rankCode: 'Q' },
          { suit: 'Hearts', rank: 'J', display: 'J♥', suitCode: 'H', rankCode: 'J' },
        ],
        totalContribution: 10,
        isDealer: false,
        isSmallBlind: true,
        isBigBlind: false,
        isCurrent: true,
      },
      {
        id: 'charlie',
        name: 'Charlie',
        seat: 2,
        chips: 490,
        bet: 0,
        status: 'Active',
        holeCards: [
          { suit: 'Diamonds', rank: 'T', display: 'T♦', suitCode: 'D', rankCode: 'T' },
          { suit: 'Clubs', rank: '9', display: '9♣', suitCode: 'C', rankCode: '9' },
        ],
        totalContribution: 10,
        isDealer: false,
        isSmallBlind: false,
        isBigBlind: true,
        isCurrent: false,
      },
    ],
    currentPlayerId: 'bob',
    currentSeat: 1,
    validActions: ['Fold', 'Check', 'Bet'],
    amountToCall: 0,
    minRaise: 10,
  },
  // Turn
  {
    handId: 'demo-001',
    sequence: 3,
    tick: 3,
    phase: 'Turn',
    street: 'TURN',
    roundCount: 1,
    isActive: true,
    isHandOver: false,
    handEndReason: '',
    dealerSeat: 0,
    smallBlindSeat: 1,
    bigBlindSeat: 2,
    smallBlind: 5,
    bigBlind: 10,
    communityCards: [
      { suit: 'Hearts', rank: 'A', display: 'A♥', suitCode: 'H', rankCode: 'A' },
      { suit: 'Diamonds', rank: '7', display: '7♦', suitCode: 'D', rankCode: '7' },
      { suit: 'Clubs', rank: '2', display: '2♣', suitCode: 'C', rankCode: '2' },
      { suit: 'Spades', rank: '5', display: '5♠', suitCode: 'S', rankCode: '5' },
    ],
    potTotal: 30,
    pots: [{ amount: 30, playerIds: ['alice', 'bob', 'charlie'], type: 'main' }],
    players: [
      {
        id: 'alice',
        name: 'Alice',
        seat: 0,
        chips: 490,
        bet: 0,
        status: 'Active',
        holeCards: [
          { suit: 'Spades', rank: 'A', display: 'A♠', suitCode: 'S', rankCode: 'A' },
          { suit: 'Spades', rank: 'K', display: 'K♠', suitCode: 'S', rankCode: 'K' },
        ],
        totalContribution: 10,
        isDealer: true,
        isSmallBlind: false,
        isBigBlind: false,
        isCurrent: false,
      },
      {
        id: 'bob',
        name: 'Bob',
        seat: 1,
        chips: 490,
        bet: 0,
        status: 'Active',
        holeCards: [
          { suit: 'Hearts', rank: 'Q', display: 'Q♥', suitCode: 'H', rankCode: 'Q' },
          { suit: 'Hearts', rank: 'J', display: 'J♥', suitCode: 'H', rankCode: 'J' },
        ],
        totalContribution: 10,
        isDealer: false,
        isSmallBlind: true,
        isBigBlind: false,
        isCurrent: true,
      },
      {
        id: 'charlie',
        name: 'Charlie',
        seat: 2,
        chips: 490,
        bet: 0,
        status: 'Folded',
        holeCards: [],
        totalContribution: 10,
        isDealer: false,
        isSmallBlind: false,
        isBigBlind: true,
        isCurrent: false,
      },
    ],
    currentPlayerId: 'bob',
    currentSeat: 1,
    validActions: ['Fold', 'Check', 'Bet'],
    amountToCall: 0,
    minRaise: 10,
  },
  // River
  {
    handId: 'demo-001',
    sequence: 4,
    tick: 4,
    phase: 'River',
    street: 'RIVER',
    roundCount: 1,
    isActive: true,
    isHandOver: false,
    handEndReason: '',
    dealerSeat: 0,
    smallBlindSeat: 1,
    bigBlindSeat: 2,
    smallBlind: 5,
    bigBlind: 10,
    communityCards: [
      { suit: 'Hearts', rank: 'A', display: 'A♥', suitCode: 'H', rankCode: 'A' },
      { suit: 'Diamonds', rank: '7', display: '7♦', suitCode: 'D', rankCode: '7' },
      { suit: 'Clubs', rank: '2', display: '2♣', suitCode: 'C', rankCode: '2' },
      { suit: 'Spades', rank: '5', display: '5♠', suitCode: 'S', rankCode: '5' },
      { suit: 'Hearts', rank: '3', display: '3♥', suitCode: 'H', rankCode: '3' },
    ],
    potTotal: 30,
    pots: [{ amount: 30, playerIds: ['alice', 'bob'], type: 'main' }],
    players: [
      {
        id: 'alice',
        name: 'Alice',
        seat: 0,
        chips: 490,
        bet: 0,
        status: 'Active',
        holeCards: [
          { suit: 'Spades', rank: 'A', display: 'A♠', suitCode: 'S', rankCode: 'A' },
          { suit: 'Spades', rank: 'K', display: 'K♠', suitCode: 'S', rankCode: 'K' },
        ],
        totalContribution: 10,
        isDealer: true,
        isSmallBlind: false,
        isBigBlind: false,
        isCurrent: false,
      },
      {
        id: 'bob',
        name: 'Bob',
        seat: 1,
        chips: 490,
        bet: 0,
        status: 'Active',
        holeCards: [
          { suit: 'Hearts', rank: 'Q', display: 'Q♥', suitCode: 'H', rankCode: 'Q' },
          { suit: 'Hearts', rank: 'J', display: 'J♥', suitCode: 'H', rankCode: 'J' },
        ],
        totalContribution: 10,
        isDealer: false,
        isSmallBlind: true,
        isBigBlind: false,
        isCurrent: true,
      },
      {
        id: 'charlie',
        name: 'Charlie',
        seat: 2,
        chips: 490,
        bet: 0,
        status: 'Folded',
        holeCards: [],
        totalContribution: 10,
        isDealer: false,
        isSmallBlind: false,
        isBigBlind: true,
        isCurrent: false,
      },
    ],
    currentPlayerId: 'bob',
    currentSeat: 1,
    validActions: ['Fold', 'Check', 'Bet'],
    amountToCall: 0,
    minRaise: 10,
  },
  // Showdown
  {
    handId: 'demo-001',
    sequence: 5,
    tick: 5,
    phase: 'Showdown',
    street: 'RIVER',
    roundCount: 1,
    isActive: false,
    isHandOver: true,
    handEndReason: 'SHOWDOWN',
    dealerSeat: 0,
    smallBlindSeat: 1,
    bigBlindSeat: 2,
    smallBlind: 5,
    bigBlind: 10,
    communityCards: [
      { suit: 'Hearts', rank: 'A', display: 'A♥', suitCode: 'H', rankCode: 'A' },
      { suit: 'Diamonds', rank: '7', display: '7♦', suitCode: 'D', rankCode: '7' },
      { suit: 'Clubs', rank: '2', display: '2♣', suitCode: 'C', rankCode: '2' },
      { suit: 'Spades', rank: '5', display: '5♠', suitCode: 'S', rankCode: '5' },
      { suit: 'Hearts', rank: '3', display: '3♥', suitCode: 'H', rankCode: '3' },
    ],
    potTotal: 30,
    pots: [{ amount: 30, playerIds: ['alice', 'bob'], type: 'main' }],
    players: [
      {
        id: 'alice',
        name: 'Alice',
        seat: 0,
        chips: 520,
        bet: 0,
        status: 'Active',
        holeCards: [
          { suit: 'Spades', rank: 'A', display: 'A♠', suitCode: 'S', rankCode: 'A' },
          { suit: 'Spades', rank: 'K', display: 'K♠', suitCode: 'S', rankCode: 'K' },
        ],
        totalContribution: 10,
        isDealer: true,
        isSmallBlind: false,
        isBigBlind: false,
        isCurrent: false,
      },
      {
        id: 'bob',
        name: 'Bob',
        seat: 1,
        chips: 490,
        bet: 0,
        status: 'Active',
        holeCards: [
          { suit: 'Hearts', rank: 'Q', display: 'Q♥', suitCode: 'H', rankCode: 'Q' },
          { suit: 'Hearts', rank: 'J', display: 'J♥', suitCode: 'H', rankCode: 'J' },
        ],
        totalContribution: 10,
        isDealer: false,
        isSmallBlind: true,
        isBigBlind: false,
        isCurrent: false,
      },
      {
        id: 'charlie',
        name: 'Charlie',
        seat: 2,
        chips: 490,
        bet: 0,
        status: 'Folded',
        holeCards: [],
        totalContribution: 10,
        isDealer: false,
        isSmallBlind: false,
        isBigBlind: true,
        isCurrent: false,
      },
    ],
    currentPlayerId: '',
    currentSeat: -1,
    validActions: [],
    amountToCall: 0,
    minRaise: 0,
  },
];

// ============================================================================
// Mock Player
// ============================================================================

interface MockPlayerState {
  index: number;
  playing: boolean;
}

function createMockPlayer(snapshots: GameSnapshot[]) {
  const state: MockPlayerState = {
    index: 0,
    playing: false,
  };

  return {
    getState: () => state,

    play: () => {
      state.playing = true;
    },
    pause: () => {
      state.playing = false;
    },
    togglePlayPause: () => {
      state.playing = !state.playing;
    },
    stepForward: () => {
      if (state.index < snapshots.length - 1) {
        state.index++;
      } else {
        state.playing = false;
      }
    },
    stepBackward: () => {
      if (state.index > 0) {
        state.index--;
      }
    },
    seek: (index: number) => {
      if (index >= 0 && index < snapshots.length) {
        state.index = index;
      }
    },
    seekToPhase: (phase: string) => {
      const idx = snapshots.findIndex((s) => s.phase === phase);
      if (idx >= 0) {
        state.index = idx;
      }
    },
    seekToStart: () => {
      state.index = 0;
    },
    seekToEnd: () => {
      state.index = snapshots.length - 1;
      state.playing = false;
    },

    toViewModel: (): ReplayViewModel => {
      const count = snapshots.length;
      if (count === 0) {
        return emptyViewModel();
      }
      const snap = snapshots[state.index];
      return {
        playing: state.playing,
        phase: snap.phase,
        progress: count <= 1 ? 1 : state.index / (count - 1),
        index: state.index,
        count: count,
        canNext: state.index < count - 1,
        canPrev: state.index > 0,
        isAtStart: state.index === 0,
        isAtEnd: state.index >= count - 1,
        snapshot: snap,
      };
    },
  };
}

// ============================================================================
// TableDemo 组件
// ============================================================================

export function TableDemo(): React.ReactElement {
  // 唯一的状态：触发重渲染的计数器
  const [, setRenderTrigger] = useState(0);

  // 创建 mock player
  const mockPlayer = useMemo(() => createMockPlayer(mockSnapshots), []);

  // 触发重渲染
  const triggerRender = useCallback(() => {
    setRenderTrigger((prev) => prev + 1);
  }, []);

  // 构造 actions
  const actions: PlayerActions = useMemo(
    () => ({
      play: () => {
        mockPlayer.play();
        triggerRender();
      },
      pause: () => {
        mockPlayer.pause();
        triggerRender();
      },
      togglePlayPause: () => {
        mockPlayer.togglePlayPause();
        triggerRender();
      },
      stepForward: () => {
        mockPlayer.stepForward();
        triggerRender();
      },
      stepBackward: () => {
        mockPlayer.stepBackward();
        triggerRender();
      },
      seek: (index: number) => {
        mockPlayer.seek(index);
        triggerRender();
      },
      seekToPhase: (phase: string) => {
        mockPlayer.seekToPhase(phase);
        triggerRender();
      },
      seekToStart: () => {
        mockPlayer.seekToStart();
        triggerRender();
      },
      seekToEnd: () => {
        mockPlayer.seekToEnd();
        triggerRender();
      },
    }),
    [mockPlayer, triggerRender]
  );

  // 从 player 构造 ViewModel
  const vm = mockPlayer.toViewModel();

  return (
    <div className="table-demo">
      {/* 顶部信息 */}
      <Header snapshot={vm.snapshot} />

      {/* 牌桌 */}
      <Table snapshot={vm.snapshot} />

      {/* 控制栏 */}
      <Controls vm={vm} actions={actions} />
    </div>
  );
}

// ============================================================================
// 导出
// ============================================================================

export { mockSnapshots };
