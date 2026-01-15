// ============================================================================
// EventReplayPlayer - 事件驱动的回放播放器
// ============================================================================
//
// 接收 ReplayEvent[] 作为输入，通过逐步应用事件计算游戏状态。
// 提供与 ReplayPlayer 兼容的接口。
//
// ============================================================================

import type { ReplayEvent } from './events';
import { EventProcessor } from './EventProcessor';
import type { ReplayViewModel } from '../types/replay';
import { emptyViewModel, emptySnapshot } from '../types/replay';

/**
 * EventReplayPlayer - 事件驱动的回放播放器
 */
export class EventReplayPlayer {
  private readonly events: readonly ReplayEvent[];
  private index: number;
  private playing: boolean;

  constructor(events: readonly ReplayEvent[] = []) {
    this.events = events;
    this.index = 0;
    this.playing = false;
  }

  // ========================================
  // 播放控制
  // ========================================

  play(): void {
    this.playing = true;
  }

  pause(): void {
    this.playing = false;
  }

  togglePlayPause(): void {
    this.playing = !this.playing;
  }

  /**
   * Check if currently playing (for race condition prevention)
   */
  isPlaying(): boolean {
    return this.playing;
  }

  // ========================================
  // 导航控制
  // ========================================

  stepForward(): void {
    if (this.index < this.events.length - 1) {
      this.index++;
    } else {
      this.playing = false;
    }
  }

  stepBackward(): void {
    if (this.index > 0) {
      this.index--;
    }
  }

  seek(index: number): void {
    if (index >= 0 && index < this.events.length) {
      this.index = index;
    }
  }

  seekToStart(): void {
    this.index = 0;
  }

  seekToEnd(): void {
    this.index = Math.max(0, this.events.length - 1);
    this.playing = false;
  }

  /**
   * 跳转到指定阶段的第一个事件
   */
  seekToPhase(phase: string): void {
    // 查找 DEAL_COMMUNITY 事件或根据当前状态判断阶段
    for (let i = 0; i < this.events.length; i++) {
      const snapshot = EventProcessor.process(this.events, i);
      if (snapshot.phase === phase) {
        this.index = i;
        return;
      }
    }
  }

  // ========================================
  // ViewModel 生成
  // ========================================

  /**
   * 生成 ReplayViewModel
   *
   * 核心逻辑：从 0 到 currentIndex 逐步应用事件，计算出当前状态
   */
  toViewModel(): ReplayViewModel {
    const count = this.events.length;

    if (count === 0) {
      return emptyViewModel();
    }

    // 通过 EventProcessor 计算当前快照
    const snapshot = EventProcessor.process(this.events, this.index);

    return {
      playing: this.playing,
      phase: snapshot.phase,
      progress: count <= 1 ? 1 : this.index / (count - 1),
      index: this.index,
      count: count,
      canNext: this.index < count - 1,
      canPrev: this.index > 0,
      isAtStart: this.index === 0,
      isAtEnd: this.index >= count - 1,
      snapshot: snapshot,
    };
  }
}
