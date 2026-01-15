// ============================================================================
// CommunityArea 单元测试
// ============================================================================
//
// 测试策略：
// - 使用 mock GameSnapshot 注入不同阶段
// - 验证公共牌渲染逻辑
// - 验证底池显示
//
// ============================================================================

import React from 'react';
import { render, screen } from '@testing-library/react';
import { CommunityArea } from '../components/table/CommunityArea';
import { GameSnapshot, emptySnapshot } from '../types/replay';

// ============================================================================
// Mock 工具函数
// ============================================================================

function createMockSnapshot(overrides: Partial<GameSnapshot> = {}): GameSnapshot {
  return {
    ...emptySnapshot(),
    handId: 'test-001',
    phase: 'Preflop',
    potTotal: 100,
    pots: [{ amount: 100, playerIds: ['p1', 'p2'], type: 'main' }],
    ...overrides,
  };
}

// ============================================================================
// 底池显示测试
// ============================================================================

describe('CommunityArea - Pot Display', () => {
  test('renders pot total', () => {
    const snapshot = createMockSnapshot({ potTotal: 250 });

    render(<CommunityArea snapshot={snapshot} />);

    expect(screen.getByText('250')).toBeInTheDocument();
    expect(screen.getByText('Pot')).toBeInTheDocument();
  });

  test('renders zero pot', () => {
    const snapshot = createMockSnapshot({ potTotal: 0 });

    render(<CommunityArea snapshot={snapshot} />);

    expect(screen.getByText('0')).toBeInTheDocument();
  });
});

// ============================================================================
// 公共牌渲染测试
// ============================================================================

describe('CommunityArea - Community Cards', () => {
  test('shows waiting message during Preflop', () => {
    const snapshot = createMockSnapshot({
      phase: 'Preflop',
      communityCards: [],
    });

    render(<CommunityArea snapshot={snapshot} />);

    expect(screen.getByText('Waiting for flop...')).toBeInTheDocument();
  });

  test('renders 3 cards during Flop', () => {
    const snapshot = createMockSnapshot({
      phase: 'Flop',
      communityCards: [
        { suit: 'Hearts', rank: 'A', display: 'A♥', suitCode: 'H', rankCode: 'A' },
        { suit: 'Diamonds', rank: '7', display: '7♦', suitCode: 'D', rankCode: '7' },
        { suit: 'Clubs', rank: '2', display: '2♣', suitCode: 'C', rankCode: '2' },
      ],
    });

    render(<CommunityArea snapshot={snapshot} />);

    expect(screen.getByText('A♥')).toBeInTheDocument();
    expect(screen.getByText('7♦')).toBeInTheDocument();
    expect(screen.getByText('2♣')).toBeInTheDocument();
  });

  test('renders 4 cards during Turn', () => {
    const snapshot = createMockSnapshot({
      phase: 'Turn',
      communityCards: [
        { suit: 'Hearts', rank: 'A', display: 'A♥', suitCode: 'H', rankCode: 'A' },
        { suit: 'Diamonds', rank: '7', display: '7♦', suitCode: 'D', rankCode: '7' },
        { suit: 'Clubs', rank: '2', display: '2♣', suitCode: 'C', rankCode: '2' },
        { suit: 'Spades', rank: '5', display: '5♠', suitCode: 'S', rankCode: '5' },
      ],
    });

    render(<CommunityArea snapshot={snapshot} />);

    expect(screen.getByText('A♥')).toBeInTheDocument();
    expect(screen.getByText('7♦')).toBeInTheDocument();
    expect(screen.getByText('2♣')).toBeInTheDocument();
    expect(screen.getByText('5♠')).toBeInTheDocument();
  });

  test('renders 5 cards during River', () => {
    const snapshot = createMockSnapshot({
      phase: 'River',
      communityCards: [
        { suit: 'Hearts', rank: 'A', display: 'A♥', suitCode: 'H', rankCode: 'A' },
        { suit: 'Diamonds', rank: '7', display: '7♦', suitCode: 'D', rankCode: '7' },
        { suit: 'Clubs', rank: '2', display: '2♣', suitCode: 'C', rankCode: '2' },
        { suit: 'Spades', rank: '5', display: '5♠', suitCode: 'S', rankCode: '5' },
        { suit: 'Hearts', rank: '3', display: '3♥', suitCode: 'H', rankCode: '3' },
      ],
    });

    render(<CommunityArea snapshot={snapshot} />);

    expect(screen.getByText('A♥')).toBeInTheDocument();
    expect(screen.getByText('7♦')).toBeInTheDocument();
    expect(screen.getByText('2♣')).toBeInTheDocument();
    expect(screen.getByText('5♠')).toBeInTheDocument();
    expect(screen.getByText('3♥')).toBeInTheDocument();
  });

  test('renders 5 cards during Showdown', () => {
    const snapshot = createMockSnapshot({
      phase: 'Showdown',
      communityCards: [
        { suit: 'Hearts', rank: 'A', display: 'A♥', suitCode: 'H', rankCode: 'A' },
        { suit: 'Diamonds', rank: '7', display: '7♦', suitCode: 'D', rankCode: '7' },
        { suit: 'Clubs', rank: '2', display: '2♣', suitCode: 'C', rankCode: '2' },
        { suit: 'Spades', rank: '5', display: '5♠', suitCode: 'S', rankCode: '5' },
        { suit: 'Hearts', rank: '3', display: '3♥', suitCode: 'H', rankCode: '3' },
      ],
    });

    render(<CommunityArea snapshot={snapshot} />);

    expect(screen.getByText('A♥')).toBeInTheDocument();
    expect(screen.getByText('7♦')).toBeInTheDocument();
    expect(screen.getByText('2♣')).toBeInTheDocument();
    expect(screen.getByText('5♠')).toBeInTheDocument();
    expect(screen.getByText('3♥')).toBeInTheDocument();
  });
});

// ============================================================================
// 只读验证
// ============================================================================

describe('CommunityArea - Read-only behavior', () => {
  test('does not modify snapshot', () => {
    const snapshot = createMockSnapshot({ potTotal: 100 });
    const originalPot = snapshot.potTotal;

    render(<CommunityArea snapshot={snapshot} />);

    expect(snapshot.potTotal).toBe(originalPot);
  });
});
