// ============================================================================
// useEventReplayPlayer - 事件驱动的 React Hook
// ============================================================================
//
// 接收 ReplayEvent[] 作为输入，提供与 useReplayPlayer 兼容的接口。
// viewModel 结构保持不变，确保 UI 组件无需修改。
//
// ============================================================================

import { useState, useCallback, useRef, useEffect } from 'react';
import type { ReplayEvent } from './events';
import { EventReplayPlayer } from './EventReplayPlayer';
import type { ReplayViewModel, PlayerActions } from '../types/replay';
import { emptyViewModel } from '../types/replay';

/**
 * useEventReplayPlayer hook 返回值
 */
export interface UseEventReplayPlayerResult {
  /** 当前视图模型（只读） */
  viewModel: ReplayViewModel;
  /** 播放器操作 */
  actions: PlayerActions;
  /** 加载新的事件序列 */
  loadEvents: (events: readonly ReplayEvent[]) => void;
}

/**
 * useEventReplayPlayer - 事件驱动的回放控制 hook
 *
 * @param initialEvents - 初始事件序列（可选）
 * @param autoPlayInterval - 自动播放间隔（毫秒），默认 1000ms
 */
export function useEventReplayPlayer(
  initialEvents: readonly ReplayEvent[] = [],
  autoPlayInterval: number = 1000
): UseEventReplayPlayerResult {
  // 使用 ref 持有 EventReplayPlayer 实例
  const playerRef = useRef<EventReplayPlayer>(new EventReplayPlayer(initialEvents));

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
      playerRef.current.pause();
      playerRef.current.seek(index);
      updateViewModel();
    },
    [updateViewModel]
  );

  const seekToPhase = useCallback(
    (phase: string) => {
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
  // 加载新事件序列
  // ========================================

  const loadEvents = useCallback(
    (events: readonly ReplayEvent[]) => {
      playerRef.current = new EventReplayPlayer(events);
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
      // CRITICAL: Check playerRef.current.playing before advancing.
      // This prevents race condition where interval fires after pause()
      // but before React cleans up the interval via effect cleanup.
      const player = playerRef.current;
      if (!player.isPlaying()) {
        return;
      }
      player.stepForward();
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
    loadEvents,
  };
}
