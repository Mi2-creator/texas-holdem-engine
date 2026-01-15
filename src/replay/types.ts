// ============================================================================
// Replay Data Structures
// ============================================================================
//
// 最小 Replay 数据结构，只包含 UI 渲染所需字段。
// Replay 是只读、可顺序播放的事件序列。
//
// ============================================================================

import { GameSnapshot } from '../types/replay';

/**
 * ReplayEvent - 回放事件
 *
 * 每个事件对应一个游戏状态快照。
 * UI 只需要 snapshot，不需要知道事件类型或其他业务信息。
 */
export interface ReplayEvent {
  readonly snapshot: GameSnapshot;
}

/**
 * Replay - 回放数据
 *
 * 包含一系列 ReplayEvent，可顺序播放。
 * Replay 是不可变的，一旦创建就不会修改。
 */
export interface Replay {
  readonly handId: string;
  readonly events: readonly ReplayEvent[];
}

/**
 * 创建空的 Replay
 */
export function emptyReplay(): Replay {
  return {
    handId: '',
    events: [],
  };
}

/**
 * 从 GameSnapshot 数组创建 Replay
 */
export function createReplay(handId: string, snapshots: readonly GameSnapshot[]): Replay {
  return {
    handId,
    events: snapshots.map((snapshot) => ({ snapshot })),
  };
}
