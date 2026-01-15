// ============================================================================
// Hand Service 使用示例
// ============================================================================
//
// 演示如何使用 fetchHand + BackendReplayAdapter + loadReplay 完整流程
//
// ============================================================================

import { fetchHand } from './handService';
import { BackendReplayAdapter } from '../replay/BackendReplayAdapter';
import { Replay } from '../replay/types';

/**
 * 示例 1: 基本用法 - 获取并转换 hand 数据
 */
export async function loadHandAsReplay(handId: string): Promise<Replay> {
  // 1. 获取后端 hand JSON
  const hand = await fetchHand(handId);

  // 2. 转换为 Replay
  const replay = BackendReplayAdapter.toReplay(hand);

  return replay;
}

/**
 * 示例 2: 在 React 组件中使用
 *
 * ```tsx
 * function ReplayPage({ handId }: { handId: string }) {
 *   const { viewModel, actions, loadReplay } = useReplayPlayer();
 *
 *   useEffect(() => {
 *     loadHandById(handId, loadReplay);
 *   }, [handId, loadReplay]);
 *
 *   return <PokerTable viewModel={viewModel} actions={actions} />;
 * }
 * ```
 */
export async function loadHandById(
  handId: string,
  loadReplay: (replay: Replay) => void
): Promise<void> {
  try {
    const hand = await fetchHand(handId);
    const replay = BackendReplayAdapter.toReplay(hand);
    loadReplay(replay);
  } catch (error) {
    console.error('Failed to load hand:', error);
  }
}

/**
 * 示例 3: 替换 mock fetch 为真实 API 调用
 *
 * 当后端 API 准备好后，修改 handService.ts 中的 fetchHand：
 *
 * ```ts
 * export async function fetchHand(handId: string): Promise<BackendHand> {
 *   const response = await fetch(`/api/hands/${handId}`);
 *   if (!response.ok) {
 *     throw new Error(`Failed to fetch hand: ${response.statusText}`);
 *   }
 *   return response.json();
 * }
 * ```
 */
