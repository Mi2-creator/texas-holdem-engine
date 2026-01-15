// ============================================================================
// ReplayPlayer - 回放播放器
// ============================================================================
//
// 接收 Replay 数据，维护当前播放位置。
// 提供 stepForward / stepBackward 等导航方法。
// 每次状态变更后生成新的 ReplayViewModel（值语义）。
//
// ============================================================================

import { Replay, emptyReplay } from './types';
import { ReplayViewModel, emptyViewModel, emptySnapshot } from '../types/replay';
import { PhaseType } from './Phase';

/**
 * ReplayPlayer - 回放播放器
 *
 * 职责：
 * - 持有 Replay 数据（只读）
 * - 维护当前播放索引
 * - 维护播放状态（playing）
 * - 生成 ReplayViewModel
 */
export class ReplayPlayer {
  private readonly replay: Replay;
  private index: number;
  private playing: boolean;

  constructor(replay: Replay = emptyReplay()) {
    this.replay = replay;
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

  // ========================================
  // 导航控制
  // ========================================

  stepForward(): void {
    if (this.index < this.replay.events.length - 1) {
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
    if (index >= 0 && index < this.replay.events.length) {
      this.index = index;
    }
  }

  /**
   * 跳转到指定阶段的第一个事件
   * 如果找不到该阶段，保持当前位置不变
   */
  seekToPhase(phase: string): void {
    const idx = this.findPhaseIndex(phase);
    if (idx >= 0) {
      this.index = idx;
    }
  }

  // ========================================
  // 阶段查询
  // ========================================

  /**
   * 获取指定索引处的阶段
   * 返回空字符串表示索引无效或无阶段信息
   */
  getPhaseAt(index: number): string {
    if (index < 0 || index >= this.replay.events.length) {
      return '';
    }
    return this.replay.events[index]?.snapshot.phase ?? '';
  }

  /**
   * 获取当前阶段
   */
  getCurrentPhase(): string {
    return this.getPhaseAt(this.index);
  }

  /**
   * 查找指定阶段的第一个事件索引
   * 返回 -1 表示未找到
   */
  findPhaseIndex(phase: string): number {
    return this.replay.events.findIndex((e) => e.snapshot.phase === phase);
  }

  /**
   * 获取所有阶段及其起始索引
   * 返回按出现顺序排列的 [phase, startIndex] 对
   */
  getPhaseRanges(): Array<{ phase: PhaseType; startIndex: number; endIndex: number }> {
    const ranges: Array<{ phase: PhaseType; startIndex: number; endIndex: number }> = [];
    let currentPhase = '';
    let startIndex = 0;

    this.replay.events.forEach((event, index) => {
      const phase = event.snapshot.phase;
      if (phase !== currentPhase) {
        if (currentPhase && ranges.length > 0) {
          ranges[ranges.length - 1].endIndex = index - 1;
        }
        if (phase) {
          ranges.push({
            phase: phase as PhaseType,
            startIndex: index,
            endIndex: this.replay.events.length - 1,
          });
        }
        currentPhase = phase;
        startIndex = index;
      }
    });

    return ranges;
  }

  seekToStart(): void {
    this.index = 0;
  }

  seekToEnd(): void {
    this.index = Math.max(0, this.replay.events.length - 1);
    this.playing = false;
  }

  // ========================================
  // ViewModel 生成
  // ========================================

  /**
   * 生成新的 ReplayViewModel（值语义）
   *
   * 每次调用都返回新对象，UI 可以安全地比较引用。
   */
  toViewModel(): ReplayViewModel {
    const count = this.replay.events.length;

    if (count === 0) {
      return emptyViewModel();
    }

    const event = this.replay.events[this.index];
    const snapshot = event?.snapshot ?? emptySnapshot();

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
