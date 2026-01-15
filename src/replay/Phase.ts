// ============================================================================
// Phase - 德州扑克阶段枚举
// ============================================================================
//
// 定义德州扑克的五个标准阶段。
// 提供类型安全的常量和辅助函数。
//
// ============================================================================

/**
 * Phase - 德州扑克阶段
 *
 * 德州扑克一手牌的五个阶段：
 * - Preflop: 翻牌前（发手牌后，发公共牌前）
 * - Flop: 翻牌（发3张公共牌）
 * - Turn: 转牌（发第4张公共牌）
 * - River: 河牌（发第5张公共牌）
 * - Showdown: 摊牌（比较牌力，决定赢家）
 */
export const Phase = {
  Preflop: 'Preflop',
  Flop: 'Flop',
  Turn: 'Turn',
  River: 'River',
  Showdown: 'Showdown',
} as const;

/**
 * Phase 类型（联合类型）
 */
export type PhaseType = (typeof Phase)[keyof typeof Phase];

/**
 * 所有阶段的有序列表
 */
export const PHASE_ORDER: readonly PhaseType[] = [
  Phase.Preflop,
  Phase.Flop,
  Phase.Turn,
  Phase.River,
  Phase.Showdown,
];

/**
 * 检查字符串是否为有效的 Phase
 */
export function isValidPhase(phase: string): phase is PhaseType {
  return PHASE_ORDER.includes(phase as PhaseType);
}

/**
 * 获取阶段的索引（用于比较阶段先后）
 * 返回 -1 表示无效阶段
 */
export function getPhaseIndex(phase: string): number {
  return PHASE_ORDER.indexOf(phase as PhaseType);
}

/**
 * 比较两个阶段的先后
 * 返回负数表示 a 在 b 之前，0 表示相同，正数表示 a 在 b 之后
 */
export function comparePhases(a: string, b: string): number {
  return getPhaseIndex(a) - getPhaseIndex(b);
}
