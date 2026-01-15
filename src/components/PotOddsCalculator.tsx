// ============================================================================
// PotOddsCalculator - 底池赔率计算器（纯 UI 组件）
// ============================================================================
//
// 【I-3.2】架构扩展性验证组件
//
// 层级: UI Layer (纯展示)
// 职责: 从 snapshot 派生 Pot Odds 并展示
// 约束:
//   - 只读 snapshot，不写入任何状态
//   - 不参与操作合法性判断
//   - 不影响 ActionPanel 可操作性
//   - 纯信息展示（informational UI）
//
// 数据来源（全部只读）:
//   - potTotal: 底池总额
//   - amountToCall: 需要跟注的金额
//
// Pot Odds 公式:
//   potOdds = amountToCall / (potTotal + amountToCall)
//   含义: 至少需要 X% 胜率才值得跟注
//
// ============================================================================

import React from 'react';

// ============================================================================
// Props 接口
// ============================================================================

interface PotOddsCalculatorProps {
  /** 底池总额（只读，来自 snapshot.potTotal） */
  potTotal: number;
  /** 需要跟注的金额（只读，来自 snapshot.amountToCall） */
  amountToCall: number;
}

// ============================================================================
// 纯函数：计算 Pot Odds
// ============================================================================

/**
 * 计算 Pot Odds（底池赔率）
 *
 * 纯函数：无副作用，无状态依赖
 *
 * @param pot - 当前底池总额
 * @param call - 需要跟注的金额
 * @returns Pot Odds 比例 (0-1)
 */
function calculatePotOdds(pot: number, call: number): number {
  if (call <= 0 || pot < 0) return 0;
  return call / (pot + call);
}

/**
 * 计算 Pot Odds 比率（用于显示 "X:1"）
 *
 * @param pot - 当前底池总额
 * @param call - 需要跟注的金额
 * @returns 比率字符串，如 "4:1"
 */
function calculateOddsRatio(pot: number, call: number): string {
  if (call <= 0) return '-';
  const ratio = pot / call;
  return `${ratio.toFixed(1)}:1`;
}

// ============================================================================
// PotOddsCalculator 组件
// ============================================================================

/**
 * PotOddsCalculator - 底池赔率显示组件
 *
 * 【I-3.2 验证点】
 * - 纯 UI 组件，只读 props，无内部状态
 * - 不调用任何 Command / Executor / EventProcessor
 * - 不产生任何 ReplayEvent
 * - 不影响游戏流程
 */
export function PotOddsCalculator({
  potTotal,
  amountToCall,
}: PotOddsCalculatorProps) {
  // ========================================
  // 条件渲染：无需跟注时不显示
  // ========================================
  if (amountToCall <= 0) {
    return null;
  }

  // ========================================
  // 纯函数计算（无副作用）
  // ========================================
  const potOdds = calculatePotOdds(potTotal, amountToCall);
  const percentage = (potOdds * 100).toFixed(1);
  const ratio = calculateOddsRatio(potTotal, amountToCall);

  // ========================================
  // 纯展示渲染
  // ========================================
  return (
    <div
      style={{
        padding: '8px 12px',
        background: 'rgba(74, 144, 217, 0.1)',
        border: '1px solid rgba(74, 144, 217, 0.3)',
        borderRadius: 6,
        fontSize: 11,
        color: '#8bb8e8',
      }}
    >
      {/* 标题行 */}
      <div
        style={{
          fontSize: 9,
          color: '#6a9fd4',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          marginBottom: 4,
        }}
      >
        Pot Odds
      </div>

      {/* 主要信息 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {/* 百分比显示 */}
        <div>
          <span style={{ fontSize: 16, fontWeight: 700, color: '#4a90d9' }}>
            {percentage}%
          </span>
          <span style={{ marginLeft: 6, color: '#6a9fd4', fontSize: 10 }}>
            ({ratio})
          </span>
        </div>

        {/* 金额详情 */}
        <div style={{ textAlign: 'right', fontSize: 10, color: '#7aa8d8' }}>
          <div>Call ${amountToCall} into ${potTotal + amountToCall}</div>
        </div>
      </div>

      {/* 解释文案 */}
      <div
        style={{
          marginTop: 6,
          paddingTop: 6,
          borderTop: '1px solid rgba(74, 144, 217, 0.2)',
          fontSize: 9,
          color: '#5a8ac4',
          fontStyle: 'italic',
        }}
      >
        Need {percentage}%+ equity to call profitably
      </div>
    </div>
  );
}
