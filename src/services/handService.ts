// ============================================================================
// Hand Service - 获取后端 hand 数据
// ============================================================================
//
// 提供 fetchHand(handId) 接口，用于获取后端 hand JSON 数据。
// 当前使用 mock 实现，可替换为真实 API 调用。
//
// ============================================================================

import { BackendHand, createMockBackendHand } from '../replay/BackendReplayAdapter';

/**
 * Mock hand 数据存储
 * 真实场景中这些数据来自后端 API
 */
const mockHandStore: Record<string, BackendHand> = {
  'mock-001': createMockBackendHand(),
};

/**
 * 获取 hand 数据
 *
 * @param handId - hand 的唯一标识
 * @returns Promise<BackendHand> - 后端 hand 数据
 * @throws Error - 如果 hand 不存在
 *
 * 使用示例：
 * ```ts
 * const hand = await fetchHand('hand-123');
 * const replay = BackendReplayAdapter.toReplay(hand);
 * loadReplay(replay);
 * ```
 */
export async function fetchHand(handId: string): Promise<BackendHand> {
  // 模拟网络延迟
  await new Promise((resolve) => setTimeout(resolve, 100));

  // 查找 mock 数据
  const hand = mockHandStore[handId];
  if (!hand) {
    throw new Error(`Hand not found: ${handId}`);
  }

  return hand;
}

/**
 * 注册 mock hand 数据（用于测试）
 */
export function registerMockHand(hand: BackendHand): void {
  mockHandStore[hand.handId] = hand;
}
