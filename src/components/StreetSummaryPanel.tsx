// ============================================================================
// StreetSummaryPanel - Per-Street Action Summary (Read-Only)
// ============================================================================
//
// 【Post-Freeze Extension】Replay Architecture Freeze Declaration v1.0 Compliant
//
// 层级: UI Layer (纯展示)
// 职责: 按街道分组总结行动，显示每街的 pot 增量和关键行动
//
// 约束:
//   - 只读 props，无内部状态
//   - 不 import src/replay/** 或 src/commands/**
//   - 不调用 EventProcessor
//   - 不使用 React Hooks（纯函数组件）
//   - 不修改或缓存任何输入数据
//
// ============================================================================

import React from 'react';

// ============================================================================
// 本地类型定义（不依赖 src/replay/** 或 src/types/**）
// ============================================================================

interface EventInfo {
  readonly type: string;
  readonly playerId?: string;
  readonly amount?: number;
  readonly phase?: string;
  readonly street?: string;
}

interface PlayerInfo {
  readonly id: string;
  readonly name: string;
}

interface StreetSummaryPanelProps {
  readonly events: readonly EventInfo[];
  readonly players: readonly PlayerInfo[];
  readonly title?: string;
  readonly compact?: boolean;
}

/**
 * 街道摘要
 */
interface StreetSummary {
  readonly street: string;
  readonly actionCount: number;
  readonly potContribution: number;
  readonly actions: readonly ActionSummary[];
  readonly folds: number;
  readonly allIns: number;
}

/**
 * 行动摘要
 */
interface ActionSummary {
  readonly playerId: string;
  readonly playerName: string;
  readonly actionType: string;
  readonly amount?: number;
}

// ============================================================================
// 常量定义
// ============================================================================

const STREET_ORDER = ['PREFLOP', 'FLOP', 'TURN', 'RIVER', 'SHOWDOWN'] as const;

const STREET_COLORS: Record<string, string> = {
  PREFLOP: '#8b5cf6',
  FLOP: '#3b82f6',
  TURN: '#06b6d4',
  RIVER: '#22c55e',
  SHOWDOWN: '#f59e0b',
};

const STREET_ICONS: Record<string, string> = {
  PREFLOP: '\u2660', // ♠
  FLOP: '\u2665',    // ♥
  TURN: '\u2666',    // ♦
  RIVER: '\u2663',   // ♣
  SHOWDOWN: '\u2605', // ★
};

const ACTION_ICONS: Record<string, string> = {
  FOLD: '\u2717',     // ✗
  CHECK: '\u2713',    // ✓
  CALL: '\u2192',     // →
  BET: '\u25B2',      // ▲
  RAISE: '\u21D1',    // ⇑
  ALL_IN: '\u2B24',   // ⬤
  POST_BLIND: '\u25CF', // ●
};

// ============================================================================
// 纯函数：派生计算
// ============================================================================

/**
 * 构建玩家名称映射（纯函数）
 */
function buildPlayerNameMap(players: readonly PlayerInfo[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const p of players) {
    map.set(p.id, p.name);
  }
  return map;
}

/**
 * 判断事件是否是行动类型（纯函数）
 */
function isActionEvent(type: string): boolean {
  return [
    'FOLD', 'CHECK', 'CALL', 'BET', 'RAISE', 'ALL_IN', 'POST_BLIND'
  ].includes(type);
}

/**
 * 计算每街摘要（纯函数）
 */
function calculateStreetSummaries(
  events: readonly EventInfo[],
  playerNames: Map<string, string>
): readonly StreetSummary[] {
  const summaries: Map<string, {
    actions: ActionSummary[];
    potContribution: number;
    folds: number;
    allIns: number;
  }> = new Map();

  // 初始化所有街道
  for (const street of STREET_ORDER) {
    summaries.set(street, { actions: [], potContribution: 0, folds: 0, allIns: 0 });
  }

  let currentStreet = 'PREFLOP';

  for (const event of events) {
    // 更新当前街道
    if (event.type === 'STREET_START' && event.street) {
      currentStreet = event.street.toUpperCase();
    } else if (event.type === 'DEAL_COMMUNITY' && event.phase) {
      currentStreet = event.phase.toUpperCase();
    } else if (event.type === 'SHOWDOWN') {
      currentStreet = 'SHOWDOWN';
    }

    // 处理行动事件
    if (isActionEvent(event.type) && event.playerId) {
      const summary = summaries.get(currentStreet);
      if (summary) {
        summary.actions.push({
          playerId: event.playerId,
          playerName: playerNames.get(event.playerId) ?? event.playerId,
          actionType: event.type,
          amount: event.amount,
        });

        if (event.amount && event.amount > 0) {
          summary.potContribution += event.amount;
        }

        if (event.type === 'FOLD') {
          summary.folds++;
        } else if (event.type === 'ALL_IN') {
          summary.allIns++;
        }
      }
    }
  }

  // 转换为数组，只保留有行动的街道
  const result: StreetSummary[] = [];
  for (const street of STREET_ORDER) {
    const data = summaries.get(street);
    if (data && data.actions.length > 0) {
      result.push({
        street,
        actionCount: data.actions.length,
        potContribution: data.potContribution,
        actions: data.actions,
        folds: data.folds,
        allIns: data.allIns,
      });
    }
  }

  return result;
}

/**
 * 格式化金额（纯函数）
 */
function formatAmount(amount: number | undefined): string {
  if (amount === undefined || amount === 0) return '';
  return `$${amount}`;
}

/**
 * 获取行动颜色（纯函数）
 */
function getActionColor(actionType: string): string {
  const colors: Record<string, string> = {
    FOLD: '#ef4444',
    CHECK: '#6b7280',
    CALL: '#3b82f6',
    BET: '#f97316',
    RAISE: '#22c55e',
    ALL_IN: '#f59e0b',
    POST_BLIND: '#8b5cf6',
  };
  return colors[actionType] ?? '#888';
}

// ============================================================================
// Sub-components（纯函数组件）
// ============================================================================

interface ActionChipProps {
  readonly action: ActionSummary;
  readonly compact?: boolean;
}

function ActionChip({ action, compact = false }: ActionChipProps) {
  const color = getActionColor(action.actionType);
  const icon = ACTION_ICONS[action.actionType] ?? '\u25CB';

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        padding: compact ? '2px 5px' : '2px 6px',
        background: `${color}20`,
        border: `1px solid ${color}40`,
        borderRadius: 4,
        fontSize: compact ? 8 : 9,
        color: color,
        fontWeight: 500,
      }}
    >
      <span style={{ fontSize: compact ? 9 : 10 }}>{icon}</span>
      <span>{action.playerName.slice(0, 6)}</span>
      {action.amount && action.amount > 0 && (
        <span style={{ fontWeight: 700 }}>{formatAmount(action.amount)}</span>
      )}
    </span>
  );
}

interface StreetRowProps {
  readonly summary: StreetSummary;
  readonly compact?: boolean;
}

function StreetRow({ summary, compact = false }: StreetRowProps) {
  const color = STREET_COLORS[summary.street] ?? '#888';
  const icon = STREET_ICONS[summary.street] ?? '\u25CB';

  return (
    <div
      style={{
        marginBottom: compact ? 8 : 12,
      }}
    >
      {/* 街道头部 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: compact ? 6 : 8,
          marginBottom: compact ? 4 : 6,
          paddingBottom: compact ? 4 : 6,
          borderBottom: `1px solid ${color}30`,
        }}
      >
        {/* 街道图标和名称 */}
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            minWidth: compact ? 60 : 80,
          }}
        >
          <span style={{ fontSize: compact ? 12 : 14, color }}>{icon}</span>
          <span
            style={{
              fontSize: compact ? 10 : 11,
              fontWeight: 700,
              color,
              textTransform: 'uppercase',
            }}
          >
            {summary.street}
          </span>
        </span>

        {/* 统计指标 */}
        <div
          style={{
            display: 'flex',
            gap: compact ? 8 : 12,
            fontSize: compact ? 8 : 9,
            color: '#888',
          }}
        >
          <span>
            Actions: <strong style={{ color: '#e0e0e0' }}>{summary.actionCount}</strong>
          </span>
          {summary.potContribution > 0 && (
            <span>
              Pot+: <strong style={{ color: '#ffd700' }}>${summary.potContribution}</strong>
            </span>
          )}
          {summary.folds > 0 && (
            <span>
              Folds: <strong style={{ color: '#ef4444' }}>{summary.folds}</strong>
            </span>
          )}
          {summary.allIns > 0 && (
            <span>
              All-In: <strong style={{ color: '#f59e0b' }}>{summary.allIns}</strong>
            </span>
          )}
        </div>
      </div>

      {/* 行动列表 */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: compact ? 4 : 6,
        }}
      >
        {summary.actions.map((action, index) => (
          <ActionChip key={index} action={action} compact={compact} />
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// StreetSummaryPanel - Main Component
// ============================================================================

export function StreetSummaryPanel({
  events,
  players,
  title = 'Street Summary',
  compact = false,
}: StreetSummaryPanelProps) {
  // 纯函数计算
  const playerNames = buildPlayerNameMap(players);
  const streetSummaries = calculateStreetSummaries(events, playerNames);

  // 计算总计
  let totalActions = 0;
  let totalPot = 0;
  for (const summary of streetSummaries) {
    totalActions += summary.actionCount;
    totalPot += summary.potContribution;
  }

  // 空状态
  if (streetSummaries.length === 0) {
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
          No street actions recorded
        </span>
      </div>
    );
  }

  return (
    <div
      style={{
        background: 'rgba(34, 197, 94, 0.08)',
        border: '1px solid rgba(34, 197, 94, 0.2)',
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
          borderBottom: '1px solid rgba(34, 197, 94, 0.15)',
          background: 'rgba(34, 197, 94, 0.05)',
        }}
      >
        <span
          style={{
            fontSize: compact ? 9 : 10,
            color: '#4ade80',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            fontWeight: 600,
          }}
        >
          {title}
        </span>
        <div
          style={{
            display: 'flex',
            gap: compact ? 8 : 12,
            fontSize: compact ? 9 : 10,
            color: '#86efac',
          }}
        >
          <span>{streetSummaries.length} streets</span>
          <span>{totalActions} actions</span>
          <span>${totalPot} in pot</span>
        </div>
      </div>

      {/* 街道列表 */}
      <div style={{ padding: compact ? '10px' : '12px' }}>
        {streetSummaries.map((summary) => (
          <StreetRow key={summary.street} summary={summary} compact={compact} />
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// 导出
// ============================================================================

export {
  calculateStreetSummaries,
  isActionEvent,
  formatAmount,
  getActionColor,
  STREET_ORDER,
  STREET_COLORS,
  STREET_ICONS,
};

export type {
  EventInfo,
  PlayerInfo,
  StreetSummary,
  ActionSummary,
  StreetSummaryPanelProps,
};
