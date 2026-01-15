// ============================================================================
// useReplayPlayer - React Hook for Replay Playback
// ============================================================================
//
// 提供 React 组件使用的 Replay 播放控制 hook。
// 包装 ReplayPlayer 类，提供响应式状态和操作接口。
//
// ============================================================================

import { useState, useCallback, useRef, useEffect } from 'react';
import { Replay, emptyReplay } from './types';
import { ReplayPlayer } from './ReplayPlayer';
import { ReplayViewModel, PlayerActions, emptyViewModel } from '../types/replay';

/**
 * useReplayPlayer hook 返回值
 */
export interface UseReplayPlayerResult {
  /** 当前视图模型（只读） */
  viewModel: ReplayViewModel;
  /** 播放器操作 */
  actions: PlayerActions;
  /** 加载新的 Replay 数据 */
  loadReplay: (replay: Replay) => void;
}

/**
 * useReplayPlayer - Replay 播放控制 hook
 *
 * @param initialReplay - 初始 Replay 数据（可选）
 * @param autoPlayInterval - 自动播放间隔（毫秒），默认 1000ms
 * @returns UseReplayPlayerResult
 *
 * 使用示例：
 * ```tsx
 * const { viewModel, actions } = useReplayPlayer(replay);
 *
 * return (
 *   <div>
 *     <SnapshotView snapshot={viewModel.snapshot} />
 *     <ControlBar
 *       viewModel={viewModel}
 *       onTogglePlay={actions.togglePlayPause}
 *       onNext={actions.stepForward}
 *       onPrev={actions.stepBackward}
 *     />
 *   </div>
 * );
 * ```
 */
export function useReplayPlayer(
  initialReplay: Replay = emptyReplay(),
  autoPlayInterval: number = 1000
): UseReplayPlayerResult {
  // 使用 ref 持有 ReplayPlayer 实例，避免每次渲染重建
  const playerRef = useRef<ReplayPlayer>(new ReplayPlayer(initialReplay));

  // ViewModel 状态
  const [viewModel, setViewModel] = useState<ReplayViewModel>(() =>
    playerRef.current.toViewModel()
  );

  // 更新 ViewModel 的辅助函数
  const updateViewModel = useCallback(() => {
    setViewModel(playerRef.current.toViewModel());
  }, []);

  // ========================================
  // 播放控制操作
  // ========================================

  const play = useCallback(() => {
    playerRef.current.play();
    updateViewModel();
  }, [updateViewModel]);

  const pause = useCallback(() => {
    playerRef.current.pause();
    updateViewModel();
  }, [updateViewModel]);

  const togglePlayPause = useCallback(() => {
    playerRef.current.togglePlayPause();
    updateViewModel();
  }, [updateViewModel]);

  // ========================================
  // 导航操作
  // ========================================

  const stepForward = useCallback(() => {
    playerRef.current.stepForward();
    updateViewModel();
  }, [updateViewModel]);

  const stepBackward = useCallback(() => {
    playerRef.current.stepBackward();
    updateViewModel();
  }, [updateViewModel]);

  const seek = useCallback(
    (index: number) => {
      // 拖动 timeline 时暂停播放
      playerRef.current.pause();
      playerRef.current.seek(index);
      updateViewModel();
    },
    [updateViewModel]
  );

  const seekToPhase = useCallback(
    (phase: string) => {
      // 跳转阶段时暂停播放（与 seek 行为一致）
      playerRef.current.pause();
      playerRef.current.seekToPhase(phase);
      updateViewModel();
    },
    [updateViewModel]
  );

  const seekToStart = useCallback(() => {
    playerRef.current.seekToStart();
    updateViewModel();
  }, [updateViewModel]);

  const seekToEnd = useCallback(() => {
    playerRef.current.seekToEnd();
    updateViewModel();
  }, [updateViewModel]);

  // ========================================
  // 加载新 Replay
  // ========================================

  const loadReplay = useCallback(
    (replay: Replay) => {
      playerRef.current = new ReplayPlayer(replay);
      updateViewModel();
    },
    [updateViewModel]
  );

  // ========================================
  // 自动播放定时器
  // ========================================

  useEffect(() => {
    if (!viewModel.playing) {
      return;
    }

    const timer = setInterval(() => {
      playerRef.current.stepForward();
      updateViewModel();
    }, autoPlayInterval);

    return () => clearInterval(timer);
  }, [viewModel.playing, autoPlayInterval, updateViewModel]);

  // ========================================
  // 组装返回值
  // ========================================

  const actions: PlayerActions = {
    play,
    pause,
    togglePlayPause,
    stepForward,
    stepBackward,
    seek,
    seekToPhase,
    seekToStart,
    seekToEnd,
  };

  return {
    viewModel,
    actions,
    loadReplay,
  };
}
