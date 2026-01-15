// ============================================================================
// SnapshotView 单元测试
// ============================================================================
//
// 测试策略：
// - 测试三种状态分支：Empty / NoData / Exists
// - 验证 Snapshot 数据正确渲染
// - 验证条件渲染逻辑
//
// ============================================================================

import React from 'react';
import { render, screen } from '@testing-library/react';
import { SnapshotView } from '../components/SnapshotView';
import { ReplayViewModel, GameSnapshot, emptySnapshot } from '../types/replay';

// ============================================================================
// Mock 工具函数
// ============================================================================

function createMockSnapshot(overrides: Partial<GameSnapshot> = {}): GameSnapshot {
  return {
    handId: 'h001',
    sequence: 0,
    tick: 0,
    phase: 'Preflop',
    street: 'PREFLOP',
    roundCount: 1,
    isActive: true,
    isHandOver: false, // 【H-4.3】
    handEndReason: '', // 【H-4.3】
    dealerSeat: 0,
    smallBlindSeat: 1,
    bigBlindSeat: 2,
    smallBlind: 5,
    bigBlind: 10,
    communityCards: [],
    potTotal: 100,
    pots: [{ amount: 100, playerIds: ['p1', 'p2'], type: 'main' }],
    players: [
      {
        id: 'p1',
        name: 'Alice',
        seat: 0,
        chips: 500,
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
    ],
    currentPlayerId: 'p1',
    currentSeat: 0,
    validActions: ['Fold', 'Call', 'Raise'],
    amountToCall: 10,
    minRaise: 20,
    ...overrides,
  };
}

function createMockViewModel(overrides: Partial<ReplayViewModel> = {}): ReplayViewModel {
  return {
    playing: false,
    phase: 'Preflop',
    progress: 0,
    index: 0,
    count: 5,
    canNext: true,
    canPrev: false,
    isAtStart: true,
    isAtEnd: false,
    snapshot: createMockSnapshot(),
    ...overrides,
  };
}

// ============================================================================
// Empty 状态测试（count === 0）
// ============================================================================

describe('SnapshotView - Empty state', () => {
  test('renders empty state when count is 0', () => {
    const vm = createMockViewModel({
      count: 0,
      snapshot: emptySnapshot(),
    });

    render(<SnapshotView vm={vm} />);

    expect(screen.getByText('No Replay Data')).toBeInTheDocument();
    expect(screen.getByText('Please load a hand record to begin replay.')).toBeInTheDocument();
  });

  test('shows empty icon', () => {
    const vm = createMockViewModel({
      count: 0,
      snapshot: emptySnapshot(),
    });

    render(<SnapshotView vm={vm} />);

    expect(screen.getByText('📭')).toBeInTheDocument();
  });
});

// ============================================================================
// NoData 状态测试（snapshot.handId 为空）
// ============================================================================

describe('SnapshotView - NoData state', () => {
  test('renders error state when handId is empty but count > 0', () => {
    const vm = createMockViewModel({
      count: 5,
      snapshot: { ...emptySnapshot(), handId: '' },
    });

    render(<SnapshotView vm={vm} />);

    expect(screen.getByText('Invalid State')).toBeInTheDocument();
    expect(screen.getByText('Snapshot data is missing. Please restart replay.')).toBeInTheDocument();
  });

  test('shows warning icon', () => {
    const vm = createMockViewModel({
      count: 5,
      snapshot: { ...emptySnapshot(), handId: '' },
    });

    render(<SnapshotView vm={vm} />);

    expect(screen.getByText('⚠️')).toBeInTheDocument();
  });
});

// ============================================================================
// Exists 状态测试（正常显示）
// ============================================================================

describe('SnapshotView - Exists state', () => {
  test('renders hand ID', () => {
    const vm = createMockViewModel({
      snapshot: createMockSnapshot({ handId: 'h123' }),
    });

    render(<SnapshotView vm={vm} />);

    expect(screen.getByText('Hand #h123')).toBeInTheDocument();
  });

  test('renders phase', () => {
    const vm = createMockViewModel({
      snapshot: createMockSnapshot({ phase: 'Flop' }),
    });

    render(<SnapshotView vm={vm} />);

    expect(screen.getByText('Flop')).toBeInTheDocument();
  });

  test('renders pot total', () => {
    const vm = createMockViewModel({
      snapshot: createMockSnapshot({ potTotal: 250 }),
    });

    render(<SnapshotView vm={vm} />);

    expect(screen.getByText('Pot: 250')).toBeInTheDocument();
  });

  test('renders player names', () => {
    const vm = createMockViewModel();

    render(<SnapshotView vm={vm} />);

    expect(screen.getByText(/Alice/)).toBeInTheDocument();
    expect(screen.getByText(/Bob/)).toBeInTheDocument();
  });

  test('renders player chips', () => {
    const vm = createMockViewModel();

    render(<SnapshotView vm={vm} />);

    expect(screen.getByText('500 chips')).toBeInTheDocument();
    expect(screen.getByText('490 chips')).toBeInTheDocument();
  });

  test('renders dealer marker', () => {
    const vm = createMockViewModel();

    render(<SnapshotView vm={vm} />);

    expect(screen.getByText(/\(D\)/)).toBeInTheDocument();
  });

  test('renders small blind marker', () => {
    const vm = createMockViewModel();

    render(<SnapshotView vm={vm} />);

    expect(screen.getByText(/\(SB\)/)).toBeInTheDocument();
  });
});

// ============================================================================
// 公共牌测试
// ============================================================================

describe('SnapshotView - Community Cards', () => {
  test('shows placeholder when no community cards (Preflop)', () => {
    const vm = createMockViewModel({
      snapshot: createMockSnapshot({
        phase: 'Preflop',
        communityCards: [],
      }),
    });

    render(<SnapshotView vm={vm} />);

    expect(screen.getByText('Waiting for flop...')).toBeInTheDocument();
  });

  test('renders community cards when present', () => {
    const vm = createMockViewModel({
      snapshot: createMockSnapshot({
        phase: 'Flop',
        communityCards: [
          { suit: 'Hearts', rank: 'A', display: 'A♥', suitCode: 'H', rankCode: 'A' },
          { suit: 'Diamonds', rank: '7', display: '7♦', suitCode: 'D', rankCode: '7' },
          { suit: 'Clubs', rank: '2', display: '2♣', suitCode: 'C', rankCode: '2' },
        ],
      }),
    });

    render(<SnapshotView vm={vm} />);

    expect(screen.getByText('A♥')).toBeInTheDocument();
    expect(screen.getByText('7♦')).toBeInTheDocument();
    expect(screen.getByText('2♣')).toBeInTheDocument();
  });
});

// ============================================================================
// 底牌显示测试
// ============================================================================

describe('SnapshotView - Hole Cards', () => {
  test('hides hole cards during Preflop', () => {
    const vm = createMockViewModel({
      snapshot: createMockSnapshot({ phase: 'Preflop' }),
    });

    render(<SnapshotView vm={vm} />);

    // 应显示隐藏符号
    const hiddenCards = screen.getAllByText('🂠 🂠');
    expect(hiddenCards.length).toBeGreaterThan(0);
  });

  test('shows hole cards during Showdown', () => {
    const vm = createMockViewModel({
      snapshot: createMockSnapshot({ phase: 'Showdown' }),
    });

    render(<SnapshotView vm={vm} />);

    // 应显示实际牌面
    expect(screen.getByText('A♠')).toBeInTheDocument();
    expect(screen.getByText('K♠')).toBeInTheDocument();
    expect(screen.getByText('Q♥')).toBeInTheDocument();
    expect(screen.getByText('J♥')).toBeInTheDocument();
  });
});

// ============================================================================
// 玩家状态测试
// ============================================================================

describe('SnapshotView - Player Status', () => {
  test('shows FOLDED label for folded player', () => {
    const vm = createMockViewModel({
      snapshot: createMockSnapshot({
        players: [
          {
            id: 'p1',
            name: 'Alice',
            seat: 0,
            chips: 500,
            bet: 0,
            status: 'Folded',
            holeCards: [],
            totalContribution: 10,
            isDealer: false,
            isSmallBlind: false,
            isBigBlind: false,
            isCurrent: false,
          },
        ],
      }),
    });

    render(<SnapshotView vm={vm} />);

    expect(screen.getByText('FOLDED')).toBeInTheDocument();
  });

  test('shows ALL IN label for all-in player', () => {
    const vm = createMockViewModel({
      snapshot: createMockSnapshot({
        players: [
          {
            id: 'p1',
            name: 'Alice',
            seat: 0,
            chips: 0,
            bet: 500,
            status: 'AllIn',
            holeCards: [
              { suit: 'Spades', rank: 'A', display: 'A♠', suitCode: 'S', rankCode: 'A' },
              { suit: 'Spades', rank: 'K', display: 'K♠', suitCode: 'S', rankCode: 'K' },
            ],
            totalContribution: 500,
            isDealer: false,
            isSmallBlind: false,
            isBigBlind: false,
            isCurrent: false,
          },
        ],
      }),
    });

    render(<SnapshotView vm={vm} />);

    expect(screen.getByText('ALL IN')).toBeInTheDocument();
  });

  test('shows action indicator for current player', () => {
    const vm = createMockViewModel({
      snapshot: createMockSnapshot({
        currentPlayerId: 'p1',
        players: [
          {
            id: 'p1',
            name: 'Alice',
            seat: 0,
            chips: 500,
            bet: 10,
            status: 'Active',
            holeCards: [],
            totalContribution: 10,
            isDealer: false,
            isSmallBlind: false,
            isBigBlind: false,
            isCurrent: true,
          },
        ],
      }),
    });

    render(<SnapshotView vm={vm} />);

    expect(screen.getByText('⬅ Acting')).toBeInTheDocument();
  });
});

// ============================================================================
// 只读验证
// ============================================================================

describe('SnapshotView - Read-only behavior', () => {
  test('does not modify vm', () => {
    const vm = createMockViewModel();
    const originalSnapshot = { ...vm.snapshot };

    render(<SnapshotView vm={vm} />);

    // vm.snapshot 应保持不变
    expect(vm.snapshot.handId).toBe(originalSnapshot.handId);
    expect(vm.snapshot.phase).toBe(originalSnapshot.phase);
    expect(vm.snapshot.potTotal).toBe(originalSnapshot.potTotal);
  });
});
