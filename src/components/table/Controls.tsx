// ============================================================================
// Controls - 控制栏组件
// ============================================================================
//
// 纯展示组件，提供播放控制和进度显示。
// 不持有任何状态，所有操作通过 actions 回调。
//
// ============================================================================

import React from 'react';
import { ReplayViewModel, PlayerActions } from '../../types/replay';

interface ControlsProps {
  vm: ReplayViewModel;
  actions: PlayerActions;
}

/**
 * Controls 控制栏
 */
export function Controls({ vm, actions }: ControlsProps): React.ReactElement {
  return (
    <div className="controls">
      {/* 播放控制按钮 */}
      <PlaybackButtons vm={vm} actions={actions} />

      {/* 进度条 */}
      <ProgressSlider vm={vm} actions={actions} />

      {/* 阶段导航 */}
      <PhaseNavigation vm={vm} actions={actions} />

      {/* 状态栏 */}
      <StatusInfo vm={vm} />
    </div>
  );
}

/**
 * PlaybackButtons 播放控制按钮
 */
function PlaybackButtons({
  vm,
  actions,
}: {
  vm: ReplayViewModel;
  actions: PlayerActions;
}): React.ReactElement {
  return (
    <div className="playback-buttons">
      {/* 跳到开始 */}
      <button
        className="control-btn btn-start"
        onClick={actions.seekToStart}
        disabled={vm.isAtStart}
        title="Go to start"
      >
        ⏮
      </button>

      {/* 上一步 */}
      <button
        className="control-btn btn-prev"
        onClick={actions.stepBackward}
        disabled={!vm.canPrev}
        title="Previous step"
      >
        ◀
      </button>

      {/* 播放/暂停 */}
      <button
        className="control-btn btn-play-pause"
        onClick={actions.togglePlayPause}
        title={vm.playing ? 'Pause' : 'Play'}
      >
        {vm.playing ? '⏸' : '▶'}
      </button>

      {/* 下一步 */}
      <button
        className="control-btn btn-next"
        onClick={actions.stepForward}
        disabled={!vm.canNext}
        title="Next step"
      >
        ▶
      </button>

      {/* 跳到结束 */}
      <button
        className="control-btn btn-end"
        onClick={actions.seekToEnd}
        disabled={vm.isAtEnd}
        title="Go to end"
      >
        ⏭
      </button>
    </div>
  );
}

/**
 * ProgressSlider 进度滑块
 */
function ProgressSlider({
  vm,
  actions,
}: {
  vm: ReplayViewModel;
  actions: PlayerActions;
}): React.ReactElement {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    const maxIndex = vm.count - 1;
    const index = Math.round(value * maxIndex);
    actions.seek(index);
  };

  const isDisabled = vm.count === 0;

  return (
    <div className="progress-slider">
      <input
        type="range"
        className="slider"
        min="0"
        max="1"
        step="0.001"
        value={vm.progress}
        onChange={handleChange}
        disabled={isDisabled}
      />
      <div className="progress-labels">
        <span className="progress-current">{vm.index + 1}</span>
        <span className="progress-separator">/</span>
        <span className="progress-total">{vm.count}</span>
      </div>
    </div>
  );
}

/**
 * PhaseNavigation 阶段导航
 */
function PhaseNavigation({
  vm,
  actions,
}: {
  vm: ReplayViewModel;
  actions: PlayerActions;
}): React.ReactElement {
  const phases = ['Preflop', 'Flop', 'Turn', 'River', 'Showdown'];
  const isDisabled = vm.count === 0;

  return (
    <div className="phase-navigation">
      {phases.map((phase) => (
        <button
          key={phase}
          className={`phase-btn ${vm.phase === phase ? 'active' : ''}`}
          onClick={() => actions.seekToPhase(phase)}
          disabled={isDisabled}
        >
          {phase}
        </button>
      ))}
    </div>
  );
}

/**
 * StatusInfo 状态信息
 */
function StatusInfo({ vm }: { vm: ReplayViewModel }): React.ReactElement {
  const progressPercent = Math.round(vm.progress * 100);

  return (
    <div className="status-info">
      <span className="status-phase">{vm.phase || 'No data'}</span>
      <span className="status-progress">{progressPercent}%</span>
      <span className="status-state">{vm.playing ? '▶ Playing' : '⏸ Paused'}</span>
    </div>
  );
}
