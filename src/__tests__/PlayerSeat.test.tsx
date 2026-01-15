// ============================================================================
// PlayerSeat 单元测试
// ============================================================================
//
// 测试策略：
// - 使用 mock PlayerSnapshot 注入不同状态
// - 验证 UI 渲染结果
// - 验证底牌可见性逻辑
//
// ============================================================================

import React from 'react';
import { render, screen } from '@testing-library/react';
import { PlayerSeat } from '../components/table/PlayerSeat';
import { PlayerSnapshot } from '../types/replay';

// ============================================================================
// Mock 工具函数
// ============================================================================

function createMockPlayer(overrides: Partial<PlayerSnapshot> = {}): PlayerSnapshot {
  return {
    id: 'player1',
    name: 'TestPlayer',
    seat: 0,
    chips: 500,
    bet: 0,
    status: 'Active',
    holeCards: [
      { suit: 'Spades', rank: 'A', display: 'A♠', suitCode: 'S', rankCode: 'A' },
      { suit: 'Spades', rank: 'K', display: 'K♠', suitCode: 'S', rankCode: 'K' },
    ],
    totalContribution: 0,
    isDealer: false,
    isSmallBlind: false,
    isBigBlind: false,
    isCurrent: false,
    ...overrides,
  };
}

// ============================================================================
// 基础渲染测试
// ============================================================================

describe('PlayerSeat - Basic Rendering', () => {
  test('renders player name', () => {
    const player = createMockPlayer({ name: 'Alice' });

    render(
      <PlayerSeat
        player={player}
        isCurrentActor={false}
        phase="Preflop"
        position="bottom"
      />
    );

    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  test('renders player chips', () => {
    const player = createMockPlayer({ chips: 1500 });

    render(
      <PlayerSeat
        player={player}
        isCurrentActor={false}
        phase="Preflop"
        position="bottom"
      />
    );

    expect(screen.getByText('1500')).toBeInTheDocument();
  });

  test('renders bet amount when bet > 0', () => {
    const player = createMockPlayer({ bet: 50 });

    render(
      <PlayerSeat
        player={player}
        isCurrentActor={false}
        phase="Preflop"
        position="bottom"
      />
    );

    expect(screen.getByText('50')).toBeInTheDocument();
  });

  test('does not render bet when bet is 0', () => {
    const player = createMockPlayer({ bet: 0 });

    render(
      <PlayerSeat
        player={player}
        isCurrentActor={false}
        phase="Preflop"
        position="bottom"
      />
    );

    // 不应该有 bet 相关的元素
    expect(screen.queryByText('Bet:')).not.toBeInTheDocument();
  });
});

// ============================================================================
// 位置标记测试
// ============================================================================

describe('PlayerSeat - Position Badges', () => {
  test('renders dealer badge when isDealer', () => {
    const player = createMockPlayer({ isDealer: true });

    render(
      <PlayerSeat
        player={player}
        isCurrentActor={false}
        phase="Preflop"
        position="bottom"
      />
    );

    expect(screen.getByText('D')).toBeInTheDocument();
  });

  test('renders SB badge when isSmallBlind', () => {
    const player = createMockPlayer({ isSmallBlind: true });

    render(
      <PlayerSeat
        player={player}
        isCurrentActor={false}
        phase="Preflop"
        position="bottom"
      />
    );

    expect(screen.getByText('SB')).toBeInTheDocument();
  });

  test('renders BB badge when isBigBlind', () => {
    const player = createMockPlayer({ isBigBlind: true });

    render(
      <PlayerSeat
        player={player}
        isCurrentActor={false}
        phase="Preflop"
        position="bottom"
      />
    );

    expect(screen.getByText('BB')).toBeInTheDocument();
  });
});

// ============================================================================
// 状态标签测试
// ============================================================================

describe('PlayerSeat - Status Badges', () => {
  test('renders FOLD badge when status is Folded', () => {
    const player = createMockPlayer({ status: 'Folded' });

    render(
      <PlayerSeat
        player={player}
        isCurrentActor={false}
        phase="Preflop"
        position="bottom"
      />
    );

    expect(screen.getByText('FOLD')).toBeInTheDocument();
  });

  test('renders ALL IN badge when status is AllIn', () => {
    const player = createMockPlayer({ status: 'AllIn' });

    render(
      <PlayerSeat
        player={player}
        isCurrentActor={false}
        phase="Preflop"
        position="bottom"
      />
    );

    expect(screen.getByText('ALL IN')).toBeInTheDocument();
  });

  test('does not render status badge when Active', () => {
    const player = createMockPlayer({ status: 'Active' });

    render(
      <PlayerSeat
        player={player}
        isCurrentActor={false}
        phase="Preflop"
        position="bottom"
      />
    );

    expect(screen.queryByText('FOLD')).not.toBeInTheDocument();
    expect(screen.queryByText('ALL IN')).not.toBeInTheDocument();
  });
});

// ============================================================================
// 当前行动者测试
// ============================================================================

describe('PlayerSeat - Current Actor', () => {
  test('renders action indicator when isCurrentActor', () => {
    const player = createMockPlayer();

    render(
      <PlayerSeat
        player={player}
        isCurrentActor={true}
        phase="Preflop"
        position="bottom"
      />
    );

    expect(screen.getByText('▶')).toBeInTheDocument();
  });

  test('does not render action indicator when not current actor', () => {
    const player = createMockPlayer();

    render(
      <PlayerSeat
        player={player}
        isCurrentActor={false}
        phase="Preflop"
        position="bottom"
      />
    );

    expect(screen.queryByText('▶')).not.toBeInTheDocument();
  });
});

// ============================================================================
// 底牌可见性测试
// ============================================================================

describe('PlayerSeat - Hole Cards Visibility', () => {
  test('hides hole cards during Preflop', () => {
    const player = createMockPlayer({
      holeCards: [
        { suit: 'Spades', rank: 'A', display: 'A♠', suitCode: 'S', rankCode: 'A' },
        { suit: 'Spades', rank: 'K', display: 'K♠', suitCode: 'S', rankCode: 'K' },
      ],
    });

    render(
      <PlayerSeat
        player={player}
        isCurrentActor={false}
        phase="Preflop"
        position="bottom"
      />
    );

    // 不应显示 A♠ 或 K♠
    expect(screen.queryByText('A♠')).not.toBeInTheDocument();
    expect(screen.queryByText('K♠')).not.toBeInTheDocument();
    // 应显示背面
    expect(screen.getAllByText('🂠').length).toBe(2);
  });

  test('shows hole cards during Showdown', () => {
    const player = createMockPlayer({
      holeCards: [
        { suit: 'Spades', rank: 'A', display: 'A♠', suitCode: 'S', rankCode: 'A' },
        { suit: 'Spades', rank: 'K', display: 'K♠', suitCode: 'S', rankCode: 'K' },
      ],
    });

    render(
      <PlayerSeat
        player={player}
        isCurrentActor={false}
        phase="Showdown"
        position="bottom"
      />
    );

    expect(screen.getByText('A♠')).toBeInTheDocument();
    expect(screen.getByText('K♠')).toBeInTheDocument();
  });

  test('does not show hole cards for folded player even in Showdown', () => {
    const player = createMockPlayer({
      status: 'Folded',
      holeCards: [],
    });

    render(
      <PlayerSeat
        player={player}
        isCurrentActor={false}
        phase="Showdown"
        position="bottom"
      />
    );

    // 弃牌玩家显示 "—"
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});

// ============================================================================
// 只读验证
// ============================================================================

describe('PlayerSeat - Read-only behavior', () => {
  test('does not modify player object', () => {
    const player = createMockPlayer({ chips: 500, bet: 50 });
    const originalChips = player.chips;
    const originalBet = player.bet;

    render(
      <PlayerSeat
        player={player}
        isCurrentActor={true}
        phase="Flop"
        position="bottom"
      />
    );

    // 验证 player 未被修改
    expect(player.chips).toBe(originalChips);
    expect(player.bet).toBe(originalBet);
  });
});
