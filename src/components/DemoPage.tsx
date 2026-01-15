// ============================================================================
// DemoPage - 最小可运行 UI Demo
// ============================================================================
//
// 组合所有组件，演示 ReplayViewModel → UI 的单向数据流。
//
// 架构说明：
// - DemoPage 使用 useReplayPlayer hook 管理所有播放状态
// - 所有子组件都是纯函数，不持有状态
// - viewModel 来自 useReplayPlayer，子组件只读取
// - actions 来自 useReplayPlayer，子组件只调用
//
// ============================================================================

import React from 'react';
import { GameSnapshot } from '../types/replay';
import { ControlBar, ProgressBar, PhaseBar } from './ControlBar';
import { SnapshotView } from './SnapshotView';
import { createReplay, useReplayPlayer } from '../replay';

// ============================================================================
// Demo Data（演示用数据）
// ============================================================================

const demoSnapshots: GameSnapshot[] = [
  {
    handId: 'h001',
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
    pots: [{ amount: 15, playerIds: ['p1', 'p2', 'p3'], type: 'main' }],
    players: [
      {
        id: 'p1',
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
        id: 'p2',
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
        id: 'p3',
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
    currentPlayerId: 'p3',
    currentSeat: 2,
    validActions: ['Fold', 'Call', 'Raise'],
    amountToCall: 10,
    minRaise: 20,
  },
  {
    handId: 'h001',
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
    pots: [{ amount: 30, playerIds: ['p1', 'p2', 'p3'], type: 'main' }],
    players: [
      {
        id: 'p1',
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
        id: 'p2',
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
        id: 'p3',
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
    currentPlayerId: 'p1',
    currentSeat: 0,
    validActions: ['Fold', 'Check', 'Raise'],
    amountToCall: 0,
    minRaise: 20,
  },
  {
    handId: 'h001',
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
    pots: [{ amount: 30, playerIds: ['p1', 'p2', 'p3'], type: 'main' }],
    players: [
      {
        id: 'p1',
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
        id: 'p2',
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
        id: 'p3',
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
    currentPlayerId: 'p2',
    currentSeat: 1,
    validActions: ['Fold', 'Check', 'Bet'],
    amountToCall: 0,
    minRaise: 10,
  },
  {
    handId: 'h001',
    sequence: 3,
    tick: 3,
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
    pots: [{ amount: 30, playerIds: ['p1', 'p2', 'p3'], type: 'main' }],
    players: [
      {
        id: 'p1',
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
        id: 'p2',
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
        id: 'p3',
        name: 'Charlie',
        seat: 2,
        chips: 490,
        bet: 0,
        status: 'Folded',
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
    currentPlayerId: '',
    currentSeat: -1,
    validActions: [],
    amountToCall: 0,
    minRaise: 0,
  },
];

// ============================================================================
// Demo Replay（从演示数据创建 Replay）
// ============================================================================

const demoReplay = createReplay('h001', demoSnapshots);

// ============================================================================
// DemoPage 组件
// ============================================================================

export function DemoPage(): React.ReactElement {
  // 使用 useReplayPlayer hook 管理所有播放状态
  const { viewModel, actions } = useReplayPlayer(demoReplay);

  // 渲染（所有子组件都是纯函数，只读取 viewModel）
  return (
    <div className="demo-page">
      <h1>Replay Demo</h1>

      {/* 控制栏 */}
      <ControlBar vm={viewModel} actions={actions} />

      {/* 进度条 */}
      <ProgressBar vm={viewModel} actions={actions} />

      {/* 阶段栏 */}
      <PhaseBar vm={viewModel} actions={actions} />

      {/* 快照视图 */}
      <SnapshotView vm={viewModel} />

      {/* 调试信息 */}
      <div className="debug-info">
        <pre>{JSON.stringify(viewModel, null, 2)}</pre>
      </div>
    </div>
  );
}

// ============================================================================
// 导出 EmptyDemo（无数据示例）
// ============================================================================

export function EmptyDemo(): React.ReactElement {
  // 使用 useReplayPlayer hook（无初始数据）
  const { viewModel, actions } = useReplayPlayer();

  return (
    <div className="demo-page empty-demo">
      <h1>Empty Demo (No Data)</h1>
      <ControlBar vm={viewModel} actions={actions} />
      <SnapshotView vm={viewModel} />
    </div>
  );
}
