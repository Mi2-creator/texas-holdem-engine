// ============================================================================
// PotOddsDisplay - Pot Odds Calculator (Read-Only)
// ============================================================================
//
// 【Post-Freeze Extension】Replay Architecture Freeze Declaration v1.0 Compliant
//
// 层级: UI Layer (纯展示)
// 职责: 计算并显示当前 pot odds 和 call 成本比率
//
// 约束:
//   - 只读 props，无内部状态
//   - 不 import src/replay/** 或 src/commands/**
//   - 不调用 EventProcessor
//   - 不使用 React Hooks（纯函数组件）
//   - 不修改或缓存任何输入数据
//
// 注意: 这是教育性展示，仅用于显示 pot odds 概念，不作为实际决策依据
//
// ============================================================================

import React from 'react';

// ============================================================================
// 本地类型定义（不依赖 src/replay/** 或 src/types/**）
// ============================================================================

interface PotOddsDisplayProps {
  readonly potTotal: number;
  readonly amountToCall: number;
  readonly playerStack?: number;
  readonly title?: string;
  readonly compact?: boolean;
}

/**
 * Pot Odds 计算结果
 */
interface PotOddsResult {
  readonly potOddsRatio: string;      // e.g., "3:1"
  readonly potOddsPercent: number;    // e.g., 25
  readonly breakEvenEquity: number;   // 需要的最低胜率
  readonly impliedOdds?: string;      // 隐含赔率（如果可计算）
  readonly stackToPotRatio?: number;  // SPR
  readonly isValidCall: boolean;      // 是否有有效 call
}

// ============================================================================
// 纯函数：Pot Odds 计算
// ============================================================================

/**
 * 计算 Pot Odds（纯函数）
 *
 * Pot Odds = Pot : Call Amount
 * 例如：pot = 100, call = 25 → 4:1 odds (或 20% 需求胜率)
 */
function calculatePotOdds(
  potTotal: number,
  amountToCall: number,
  playerStack?: number
): PotOddsResult {
  // 无需 call 或无效情况
  if (amountToCall <= 0 || potTotal < 0) {
    return {
      potOddsRatio: '—',
      potOddsPercent: 0,
      breakEvenEquity: 0,
      isValidCall: false,
    };
  }

  // 计算 pot odds ratio
  // Total pot after call = potTotal + amountToCall
  // 获胜时赢得 = potTotal
  // 输掉时失去 = amountToCall
  const ratio = potTotal / amountToCall;
  const potOddsRatio = formatRatio(ratio);

  // Pot odds 百分比 = call / (pot + call) * 100
  const totalPotAfterCall = potTotal + amountToCall;
  const potOddsPercent = (amountToCall / totalPotAfterCall) * 100;

  // 盈亏平衡所需胜率
  const breakEvenEquity = potOddsPercent;

  // SPR (Stack to Pot Ratio)
  const stackToPotRatio = playerStack !== undefined && potTotal > 0
    ? playerStack / potTotal
    : undefined;

  // 隐含赔率（简化：假设剩余筹码可能进入 pot）
  let impliedOdds: string | undefined;
  if (playerStack !== undefined && playerStack > amountToCall) {
    const remainingStack = playerStack - amountToCall;
    const impliedPot = potTotal + remainingStack;
    const impliedRatio = impliedPot / amountToCall;
    impliedOdds = formatRatio(impliedRatio);
  }

  return {
    potOddsRatio,
    potOddsPercent,
    breakEvenEquity,
    impliedOdds,
    stackToPotRatio,
    isValidCall: true,
  };
}

/**
 * 格式化比率（纯函数）
 */
function formatRatio(ratio: number): string {
  if (ratio >= 10) {
    return `${Math.round(ratio)}:1`;
  }
  if (ratio >= 1) {
    return `${ratio.toFixed(1)}:1`;
  }
  // ratio < 1，翻转表示
  const inverse = 1 / ratio;
  return `1:${inverse.toFixed(1)}`;
}

/**
 * 获取 odds 等级描述（纯函数）
 */
function getOddsGrade(breakEvenEquity: number): {
  label: string;
  color: string;
  description: string;
} {
  if (breakEvenEquity <= 15) {
    return {
      label: 'Excellent',
      color: '#22c55e',
      description: 'Very favorable odds',
    };
  }
  if (breakEvenEquity <= 25) {
    return {
      label: 'Good',
      color: '#4ade80',
      description: 'Favorable odds',
    };
  }
  if (breakEvenEquity <= 33) {
    return {
      label: 'Fair',
      color: '#f59e0b',
      description: 'Moderate odds',
    };
  }
  if (breakEvenEquity <= 40) {
    return {
      label: 'Marginal',
      color: '#f97316',
      description: 'Borderline call',
    };
  }
  return {
    label: 'Poor',
    color: '#ef4444',
    description: 'Unfavorable odds',
  };
}

/**
 * 格式化金额（纯函数）
 */
function formatAmount(amount: number): string {
  if (amount >= 1000) {
    return `$${(amount / 1000).toFixed(1)}K`;
  }
  return `$${amount}`;
}

// ============================================================================
// Sub-components（纯函数组件）
// ============================================================================

interface OddsMeterProps {
  readonly percentage: number;
  readonly compact?: boolean;
}

function OddsMeter({ percentage, compact = false }: OddsMeterProps) {
  const grade = getOddsGrade(percentage);

  // 指针位置（0% 在左，100% 在右）
  const pointerPosition = Math.min(Math.max(percentage, 0), 100);

  return (
    <div style={{ marginBottom: compact ? 8 : 12 }}>
      {/* 标签 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: compact ? 4 : 6,
          fontSize: compact ? 8 : 9,
          color: '#888',
        }}
      >
        <span>0%</span>
        <span style={{ color: grade.color, fontWeight: 600 }}>
          {percentage.toFixed(1)}% equity needed
        </span>
        <span>100%</span>
      </div>

      {/* 渐变条 */}
      <div
        style={{
          height: compact ? 12 : 16,
          borderRadius: 4,
          background: 'linear-gradient(90deg, #22c55e 0%, #4ade80 20%, #f59e0b 40%, #f97316 60%, #ef4444 80%)',
          position: 'relative',
          boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)',
        }}
      >
        {/* 指针 */}
        <div
          style={{
            position: 'absolute',
            left: `${pointerPosition}%`,
            top: -4,
            transform: 'translateX(-50%)',
            width: 0,
            height: 0,
            borderLeft: `${compact ? 5 : 6}px solid transparent`,
            borderRight: `${compact ? 5 : 6}px solid transparent`,
            borderTop: `${compact ? 6 : 8}px solid #fff`,
            filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: `${pointerPosition}%`,
            bottom: -4,
            transform: 'translateX(-50%)',
            width: 0,
            height: 0,
            borderLeft: `${compact ? 5 : 6}px solid transparent`,
            borderRight: `${compact ? 5 : 6}px solid transparent`,
            borderBottom: `${compact ? 6 : 8}px solid #fff`,
            filter: 'drop-shadow(0 -1px 2px rgba(0,0,0,0.3))',
          }}
        />
      </div>
    </div>
  );
}

interface StatRowProps {
  readonly label: string;
  readonly value: string;
  readonly subValue?: string;
  readonly color?: string;
  readonly compact?: boolean;
}

function StatRow({ label, value, subValue, color = '#e0e0e0', compact = false }: StatRowProps) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: compact ? '4px 0' : '6px 0',
        borderBottom: '1px solid rgba(100, 100, 100, 0.1)',
      }}
    >
      <span
        style={{
          fontSize: compact ? 9 : 10,
          color: '#888',
        }}
      >
        {label}
      </span>
      <div style={{ textAlign: 'right' }}>
        <span
          style={{
            fontSize: compact ? 11 : 12,
            color: color,
            fontWeight: 700,
          }}
        >
          {value}
        </span>
        {subValue && (
          <span
            style={{
              marginLeft: 6,
              fontSize: compact ? 8 : 9,
              color: '#666',
            }}
          >
            ({subValue})
          </span>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// PotOddsDisplay - Main Component
// ============================================================================

export function PotOddsDisplay({
  potTotal,
  amountToCall,
  playerStack,
  title = 'Pot Odds',
  compact = false,
}: PotOddsDisplayProps) {
  // 纯函数计算
  const odds = calculatePotOdds(potTotal, amountToCall, playerStack);
  const grade = getOddsGrade(odds.breakEvenEquity);

  // 无有效 call 状态
  if (!odds.isValidCall) {
    return (
      <div
        style={{
          padding: compact ? '8px 12px' : '12px 16px',
          background: 'rgba(100, 100, 100, 0.1)',
          border: '1px solid rgba(100, 100, 100, 0.2)',
          borderRadius: 8,
          textAlign: 'center',
        }}
      >
        <span
          style={{
            fontSize: compact ? 10 : 11,
            color: '#666',
          }}
        >
          No call required
        </span>
      </div>
    );
  }

  return (
    <div
      style={{
        background: 'rgba(168, 85, 247, 0.08)',
        border: '1px solid rgba(168, 85, 247, 0.2)',
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      {/* 标题栏 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: compact ? '6px 10px' : '8px 12px',
          borderBottom: '1px solid rgba(168, 85, 247, 0.15)',
          background: 'rgba(168, 85, 247, 0.05)',
        }}
      >
        <span
          style={{
            fontSize: compact ? 9 : 10,
            color: '#c084fc',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            fontWeight: 600,
          }}
        >
          {title}
        </span>
        <span
          style={{
            padding: compact ? '2px 6px' : '3px 8px',
            fontSize: compact ? 8 : 9,
            fontWeight: 700,
            color: grade.color,
            background: `${grade.color}20`,
            borderRadius: 4,
          }}
        >
          {grade.label}
        </span>
      </div>

      {/* Odds Meter */}
      <div style={{ padding: compact ? '10px 10px 6px' : '12px 12px 8px' }}>
        <OddsMeter percentage={odds.breakEvenEquity} compact={compact} />
      </div>

      {/* 统计数据 */}
      <div style={{ padding: compact ? '0 10px 10px' : '0 12px 12px' }}>
        <StatRow
          label="Pot"
          value={formatAmount(potTotal)}
          compact={compact}
        />
        <StatRow
          label="To Call"
          value={formatAmount(amountToCall)}
          compact={compact}
        />
        <StatRow
          label="Pot Odds"
          value={odds.potOddsRatio}
          subValue={`${odds.potOddsPercent.toFixed(1)}%`}
          color="#ffd700"
          compact={compact}
        />
        <StatRow
          label="Break-Even"
          value={`${odds.breakEvenEquity.toFixed(1)}%`}
          subValue="win rate needed"
          color={grade.color}
          compact={compact}
        />
        {odds.impliedOdds && (
          <StatRow
            label="Implied Odds"
            value={odds.impliedOdds}
            subValue="max potential"
            color="#06b6d4"
            compact={compact}
          />
        )}
        {odds.stackToPotRatio !== undefined && (
          <StatRow
            label="SPR"
            value={odds.stackToPotRatio.toFixed(2)}
            subValue="stack/pot"
            color="#8b5cf6"
            compact={compact}
          />
        )}
      </div>

      {/* 底部说明 */}
      <div
        style={{
          padding: compact ? '6px 10px' : '8px 12px',
          borderTop: '1px solid rgba(168, 85, 247, 0.1)',
          fontSize: compact ? 7 : 8,
          color: '#888',
          fontStyle: 'italic',
          textAlign: 'center',
        }}
      >
        {grade.description}. Educational display only.
      </div>
    </div>
  );
}

// ============================================================================
// 导出
// ============================================================================

export {
  calculatePotOdds,
  formatRatio,
  getOddsGrade,
  formatAmount,
};

export type { PotOddsDisplayProps, PotOddsResult };
