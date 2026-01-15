// ============================================================================
// ControlBar 单元测试
// ============================================================================
//
// 测试策略：
// - 使用 mock ViewModel 注入不同状态
// - 验证 UI 渲染结果
// - 验证事件处理调用正确的 action
//
// ============================================================================

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ControlBar, ProgressBar, PhaseBar } from '../components/ControlBar';
import { ReplayViewModel, PlayerActions, emptySnapshot } from '../types/replay';

// ============================================================================
// Mock 工具函数
// ============================================================================

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
    snapshot: emptySnapshot(),
    ...overrides,
  };
}

function createMockActions(): PlayerActions {
  return {
    play: jest.fn(),
    pause: jest.fn(),
    togglePlayPause: jest.fn(),
    stepForward: jest.fn(),
    stepBackward: jest.fn(),
    seek: jest.fn(),
    seekToPhase: jest.fn(),
    seekToStart: jest.fn(),
    seekToEnd: jest.fn(),
  };
}

// ============================================================================
// ControlBar 测试
// ============================================================================

describe('ControlBar', () => {
  test('renders play button when paused', () => {
    const vm = createMockViewModel({ playing: false });
    const actions = createMockActions();

    render(<ControlBar vm={vm} actions={actions} />);

    expect(screen.getByText('▶ Play')).toBeInTheDocument();
  });

  test('renders pause button when playing', () => {
    const vm = createMockViewModel({ playing: true });
    const actions = createMockActions();

    render(<ControlBar vm={vm} actions={actions} />);

    expect(screen.getByText('⏸ Pause')).toBeInTheDocument();
  });

  test('calls togglePlayPause when play/pause button clicked', () => {
    const vm = createMockViewModel();
    const actions = createMockActions();

    render(<ControlBar vm={vm} actions={actions} />);

    fireEvent.click(screen.getByText('▶ Play'));

    expect(actions.togglePlayPause).toHaveBeenCalledTimes(1);
  });

  test('prev button disabled when canPrev is false', () => {
    const vm = createMockViewModel({ canPrev: false });
    const actions = createMockActions();

    render(<ControlBar vm={vm} actions={actions} />);

    const prevButton = screen.getByText('⏮ Prev');
    expect(prevButton).toBeDisabled();
  });

  test('prev button enabled when canPrev is true', () => {
    const vm = createMockViewModel({ canPrev: true });
    const actions = createMockActions();

    render(<ControlBar vm={vm} actions={actions} />);

    const prevButton = screen.getByText('⏮ Prev');
    expect(prevButton).not.toBeDisabled();
  });

  test('next button disabled when canNext is false', () => {
    const vm = createMockViewModel({ canNext: false });
    const actions = createMockActions();

    render(<ControlBar vm={vm} actions={actions} />);

    const nextButton = screen.getByText('Next ⏭');
    expect(nextButton).toBeDisabled();
  });

  test('next button enabled when canNext is true', () => {
    const vm = createMockViewModel({ canNext: true });
    const actions = createMockActions();

    render(<ControlBar vm={vm} actions={actions} />);

    const nextButton = screen.getByText('Next ⏭');
    expect(nextButton).not.toBeDisabled();
  });

  test('calls stepForward when next button clicked', () => {
    const vm = createMockViewModel({ canNext: true });
    const actions = createMockActions();

    render(<ControlBar vm={vm} actions={actions} />);

    fireEvent.click(screen.getByText('Next ⏭'));

    expect(actions.stepForward).toHaveBeenCalledTimes(1);
  });

  test('calls stepBackward when prev button clicked', () => {
    const vm = createMockViewModel({ canPrev: true });
    const actions = createMockActions();

    render(<ControlBar vm={vm} actions={actions} />);

    fireEvent.click(screen.getByText('⏮ Prev'));

    expect(actions.stepBackward).toHaveBeenCalledTimes(1);
  });

  test('shows progress label with index/count', () => {
    const vm = createMockViewModel({ index: 2, count: 10 });
    const actions = createMockActions();

    render(<ControlBar vm={vm} actions={actions} />);

    expect(screen.getByText('3 / 10')).toBeInTheDocument();
  });

  test('shows "No data" when count is 0', () => {
    const vm = createMockViewModel({ count: 0 });
    const actions = createMockActions();

    render(<ControlBar vm={vm} actions={actions} />);

    expect(screen.getByText('No data')).toBeInTheDocument();
  });
});

// ============================================================================
// PhaseBar 测试
// ============================================================================

describe('PhaseBar', () => {
  test('renders all phase buttons', () => {
    const vm = createMockViewModel();
    const actions = createMockActions();

    render(<PhaseBar vm={vm} actions={actions} />);

    expect(screen.getByText('Preflop')).toBeInTheDocument();
    expect(screen.getByText('Flop')).toBeInTheDocument();
    expect(screen.getByText('Turn')).toBeInTheDocument();
    expect(screen.getByText('River')).toBeInTheDocument();
    expect(screen.getByText('Showdown')).toBeInTheDocument();
  });

  test('current phase button has active class', () => {
    const vm = createMockViewModel({ phase: 'Flop' });
    const actions = createMockActions();

    render(<PhaseBar vm={vm} actions={actions} />);

    const flopButton = screen.getByText('Flop');
    expect(flopButton).toHaveClass('active');

    const preflopButton = screen.getByText('Preflop');
    expect(preflopButton).not.toHaveClass('active');
  });

  test('calls seekToPhase when phase button clicked', () => {
    const vm = createMockViewModel();
    const actions = createMockActions();

    render(<PhaseBar vm={vm} actions={actions} />);

    fireEvent.click(screen.getByText('Turn'));

    expect(actions.seekToPhase).toHaveBeenCalledWith('Turn');
  });

  test('phase buttons disabled when count is 0', () => {
    const vm = createMockViewModel({ count: 0 });
    const actions = createMockActions();

    render(<PhaseBar vm={vm} actions={actions} />);

    const buttons = screen.getAllByRole('button');
    buttons.forEach((button) => {
      expect(button).toBeDisabled();
    });
  });
});

// ============================================================================
// ViewModel 只读验证
// ============================================================================

describe('ViewModel read-only behavior', () => {
  test('ControlBar does not modify vm', () => {
    const vm = createMockViewModel();
    const originalVm = { ...vm };
    const actions = createMockActions();

    render(<ControlBar vm={vm} actions={actions} />);

    // 执行操作
    fireEvent.click(screen.getByText('▶ Play'));
    fireEvent.click(screen.getByText('Next ⏭'));

    // vm 应保持不变
    expect(vm.playing).toBe(originalVm.playing);
    expect(vm.index).toBe(originalVm.index);
    expect(vm.canNext).toBe(originalVm.canNext);
  });

  test('actions are called but vm is not mutated', () => {
    const vm = createMockViewModel({ playing: false, index: 0 });
    const actions = createMockActions();

    render(<ControlBar vm={vm} actions={actions} />);

    // 点击播放
    fireEvent.click(screen.getByText('▶ Play'));

    // action 被调用
    expect(actions.togglePlayPause).toHaveBeenCalled();

    // 但 vm 不变（UI 不负责修改 vm）
    expect(vm.playing).toBe(false);
  });
});
