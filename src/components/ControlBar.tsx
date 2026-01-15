// ============================================================================
// ControlBar - 播放控制栏
// ============================================================================
//
// 纯函数组件，不持有任何状态。
// 所有数据来自 ReplayViewModel，所有操作调用 PlayerActions。
//
// ============================================================================

import React from 'react';
import { ReplayViewModel, PlayerActions } from '../types/replay';

interface ControlBarProps {
  vm: ReplayViewModel;
  actions: PlayerActions;
}

/**
 * ControlBar 播放控制栏
 *
 * - 播放/暂停按钮
 * - 前进/后退按钮
 * - 进度显示
 */
export function ControlBar({ vm, actions }: ControlBarProps): React.ReactElement {
  return (
    <div className="control-bar">
      {/* 后退按钮 */}
      <button
        onClick={actions.stepBackward}
        disabled={!vm.canPrev}
        title="Previous (←)"
      >
        ⏮ Prev
      </button>

      {/* 播放/暂停按钮 */}
      <button
        onClick={actions.togglePlayPause}
        title="Play/Pause (Space)"
      >
        {vm.playing ? '⏸ Pause' : '▶ Play'}
      </button>

      {/* 前进按钮 */}
      <button
        onClick={actions.stepForward}
        disabled={!vm.canNext}
        title="Next (→)"
      >
        Next ⏭
      </button>

      {/* 进度显示 */}
      <span className="progress-label">
        {vm.count > 0
          ? `${vm.index + 1} / ${vm.count}`
          : 'No data'}
      </span>
    </div>
  );
}

/**
 * ProgressBar 进度条
 */
interface ProgressBarProps {
  vm: ReplayViewModel;
  actions: PlayerActions;
}

export function ProgressBar({ vm, actions }: ProgressBarProps): React.ReactElement {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    const index = Math.round(value * (vm.count - 1));
    actions.seek(index);
  };

  return (
    <div className="progress-bar">
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={vm.progress}
        onChange={handleChange}
        disabled={vm.count === 0}
      />
      <span className="progress-percentage">
        {Math.round(vm.progress * 100)}%
      </span>
    </div>
  );
}

/**
 * PhaseBar 阶段导航栏
 */
interface PhaseBarProps {
  vm: ReplayViewModel;
  actions: PlayerActions;
}

export function PhaseBar({ vm, actions }: PhaseBarProps): React.ReactElement {
  const phases = ['Preflop', 'Flop', 'Turn', 'River', 'Showdown'];

  return (
    <div className="phase-bar">
      {phases.map((phase) => (
        <button
          key={phase}
          onClick={() => actions.seekToPhase(phase)}
          className={vm.phase === phase ? 'active' : ''}
          disabled={vm.count === 0}
        >
          {phase}
        </button>
      ))}
    </div>
  );
}
