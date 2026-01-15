// ============================================================================
// SnapshotDiffPanel - Snapshot Difference Display (Read-Only)
// ============================================================================
//
// 【A 路线】Replay Architecture Freeze Declaration v1.0 Compliant
//
// 层级: UI Layer (纯展示)
// 职责: 对比 snapshot[N] 与 snapshot[N-1] 的派生差异
//
// 约束:
//   - 只读 props，无内部状态
//   - 不 import src/replay/** 或 src/commands/**
//   - 不调用 EventProcessor
//   - 不使用 React Hooks
//   - 不修改或缓存 snapshot
//   - 仅展示派生差异（pot、stacks、phase、active players）
//
// 关键设计:
//   - 差异计算为纯函数
//   - 不对比整个 snapshot，仅对比关键字段
//   - 所有差异以"派生"方式展示，不修改原数据
//
// ============================================================================

import React from 'react';

// ============================================================================
// 本地类型定义（不依赖 src/replay/** 或 src/types/replay.ts）
// ============================================================================

interface PlayerSnapshotInfo {
  readonly id: string;
  readonly name: string;
  readonly chips: number;
  readonly bet: number;
  readonly status: string;
  readonly seat: number;
}

interface SnapshotInfo {
  readonly handId: string;
  readonly sequence: number;
  readonly phase: string;
  readonly street?: string;
  readonly potTotal: number;
  readonly players: readonly PlayerSnapshotInfo[];
  readonly currentPlayerId: string;
  readonly isActive: boolean;
  readonly communityCards?: readonly { readonly display: string }[];
}

/**
 * 差异项类型
 */
interface DiffItem {
  readonly field: string;
  readonly label: string;
  readonly oldValue: string | number;
  readonly newValue: string | number;
  readonly changeType: 'increase' | 'decrease' | 'change' | 'same';
}

/**
 * 玩家差异
 */
interface PlayerDiff {
  readonly playerId: string;
  readonly playerName: string;
  readonly chipsDiff: number;
  readonly betDiff: number;
  readonly statusChanged: boolean;
  readonly oldStatus?: string;
  readonly newStatus?: string;
}

/**
 * 完整差异结果
 */
interface SnapshotDiff {
  readonly hasChanges: boolean;
  readonly phaseChanged: boolean;
  readonly oldPhase: string;
  readonly newPhase: string;
  readonly streetChanged: boolean;
  readonly oldStreet: string;
  readonly newStreet: string;
  readonly potDiff: number;
  readonly oldPot: number;
  readonly newPot: number;
  readonly currentPlayerChanged: boolean;
  readonly oldCurrentPlayer: string;
  readonly newCurrentPlayer: string;
  readonly activeStatusChanged: boolean;
  readonly oldIsActive: boolean;
  readonly newIsActive: boolean;
  readonly communityCardsAdded: number;
  readonly playerDiffs: readonly PlayerDiff[];
}

/**
 * SnapshotDiffPanel Props
 */
interface SnapshotDiffPanelProps {
  readonly currentSnapshot: SnapshotInfo | undefined;
  readonly previousSnapshot: SnapshotInfo | undefined;
  readonly title?: string;
  readonly compact?: boolean;
}

// ============================================================================
// 纯函数：差异计算
// ============================================================================

/**
 * 计算两个 snapshot 的差异（纯函数）
 *
 * 仅派生关键字段差异，不修改输入数据。
 */
function computeSnapshotDiff(
  current: SnapshotInfo | undefined,
  previous: SnapshotInfo | undefined
): SnapshotDiff {
  // 默认无差异结果
  const noDiff: SnapshotDiff = {
    hasChanges: false,
    phaseChanged: false,
    oldPhase: '',
    newPhase: '',
    streetChanged: false,
    oldStreet: '',
    newStreet: '',
    potDiff: 0,
    oldPot: 0,
    newPot: 0,
    currentPlayerChanged: false,
    oldCurrentPlayer: '',
    newCurrentPlayer: '',
    activeStatusChanged: false,
    oldIsActive: false,
    newIsActive: false,
    communityCardsAdded: 0,
    playerDiffs: [],
  };

  if (!current) return noDiff;

  // 如果没有前一个 snapshot，显示当前状态
  if (!previous) {
    return {
      ...noDiff,
      hasChanges: true,
      newPhase: current.phase,
      newStreet: current.street ?? '',
      newPot: current.potTotal,
      newCurrentPlayer: current.currentPlayerId,
      newIsActive: current.isActive,
      communityCardsAdded: current.communityCards?.length ?? 0,
    };
  }

  // 计算各字段差异
  const phaseChanged = current.phase !== previous.phase;
  const streetChanged = (current.street ?? '') !== (previous.street ?? '');
  const potDiff = current.potTotal - previous.potTotal;
  const currentPlayerChanged = current.currentPlayerId !== previous.currentPlayerId;
  const activeStatusChanged = current.isActive !== previous.isActive;
  const communityCardsAdded =
    (current.communityCards?.length ?? 0) - (previous.communityCards?.length ?? 0);

  // 计算玩家差异
  const playerDiffs: PlayerDiff[] = [];
  const prevPlayerMap = new Map(previous.players.map((p) => [p.id, p]));

  for (const player of current.players) {
    const prevPlayer = prevPlayerMap.get(player.id);
    if (prevPlayer) {
      const chipsDiff = player.chips - prevPlayer.chips;
      const betDiff = player.bet - prevPlayer.bet;
      const statusChanged = player.status !== prevPlayer.status;

      if (chipsDiff !== 0 || betDiff !== 0 || statusChanged) {
        playerDiffs.push({
          playerId: player.id,
          playerName: player.name,
          chipsDiff,
          betDiff,
          statusChanged,
          oldStatus: statusChanged ? prevPlayer.status : undefined,
          newStatus: statusChanged ? player.status : undefined,
        });
      }
    }
  }

  const hasChanges =
    phaseChanged ||
    streetChanged ||
    potDiff !== 0 ||
    currentPlayerChanged ||
    activeStatusChanged ||
    communityCardsAdded > 0 ||
    playerDiffs.length > 0;

  return {
    hasChanges,
    phaseChanged,
    oldPhase: previous.phase,
    newPhase: current.phase,
    streetChanged,
    oldStreet: previous.street ?? '',
    newStreet: current.street ?? '',
    potDiff,
    oldPot: previous.potTotal,
    newPot: current.potTotal,
    currentPlayerChanged,
    oldCurrentPlayer: previous.currentPlayerId,
    newCurrentPlayer: current.currentPlayerId,
    activeStatusChanged,
    oldIsActive: previous.isActive,
    newIsActive: current.isActive,
    communityCardsAdded,
    playerDiffs,
  };
}

/**
 * 格式化数值变化（纯函数）
 */
function formatChange(value: number): string {
  if (value > 0) return `+${value}`;
  if (value < 0) return `${value}`;
  return '0';
}

/**
 * 获取变化颜色（纯函数）
 */
function getChangeColor(value: number, isChips: boolean = false): string {
  if (value > 0) return isChips ? '#ef4444' : '#22c55e'; // chips 增加是绿色，pot 增加也是绿色
  if (value < 0) return isChips ? '#22c55e' : '#ef4444'; // chips 减少是红色
  return '#6b7280';
}

// ============================================================================
// Sub-components (纯函数组件)
// ============================================================================

interface DiffRowProps {
  readonly label: string;
  readonly oldValue: string;
  readonly newValue: string;
  readonly highlight?: boolean;
  readonly compact?: boolean;
}

function DiffRow({ label, oldValue, newValue, highlight = false, compact = false }: DiffRowProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: compact ? '3px 0' : '4px 0',
        borderBottom: '1px solid rgba(100, 100, 100, 0.1)',
      }}
    >
      <span
        style={{
          width: compact ? 70 : 90,
          fontSize: compact ? 9 : 10,
          color: '#888',
          fontWeight: 500,
        }}
      >
        {label}
      </span>
      <span
        style={{
          flex: 1,
          fontSize: compact ? 9 : 10,
          color: '#666',
          textDecoration: 'line-through',
          opacity: 0.7,
        }}
      >
        {oldValue || '—'}
      </span>
      <span style={{ margin: '0 8px', color: '#555' }}>{'\u2192'}</span>
      <span
        style={{
          flex: 1,
          fontSize: compact ? 9 : 10,
          color: highlight ? '#4ade80' : '#e0e0e0',
          fontWeight: highlight ? 600 : 400,
        }}
      >
        {newValue || '—'}
      </span>
    </div>
  );
}

interface PlayerDiffRowProps {
  readonly diff: PlayerDiff;
  readonly compact?: boolean;
}

function PlayerDiffRow({ diff, compact = false }: PlayerDiffRowProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: compact ? 6 : 8,
        padding: compact ? '3px 6px' : '4px 8px',
        background: 'rgba(100, 100, 100, 0.1)',
        borderRadius: 4,
        marginBottom: 4,
      }}
    >
      {/* 玩家名 */}
      <span
        style={{
          minWidth: compact ? 50 : 60,
          fontSize: compact ? 9 : 10,
          color: '#aaa',
          fontWeight: 600,
        }}
      >
        {diff.playerName}
      </span>

      {/* 筹码变化 */}
      {diff.chipsDiff !== 0 && (
        <span
          style={{
            fontSize: compact ? 9 : 10,
            color: getChangeColor(diff.chipsDiff, true),
            fontWeight: 600,
          }}
        >
          Chips: {formatChange(diff.chipsDiff)}
        </span>
      )}

      {/* 下注变化 */}
      {diff.betDiff !== 0 && (
        <span
          style={{
            fontSize: compact ? 9 : 10,
            color: diff.betDiff > 0 ? '#f97316' : '#6b7280',
          }}
        >
          Bet: {formatChange(diff.betDiff)}
        </span>
      )}

      {/* 状态变化 */}
      {diff.statusChanged && (
        <span
          style={{
            fontSize: compact ? 8 : 9,
            padding: '1px 4px',
            background: diff.newStatus === 'Folded' ? '#ef4444' : '#f59e0b',
            color: '#fff',
            borderRadius: 2,
          }}
        >
          {diff.oldStatus} → {diff.newStatus}
        </span>
      )}
    </div>
  );
}

// ============================================================================
// SnapshotDiffPanel - Main Component
// ============================================================================

export function SnapshotDiffPanel({
  currentSnapshot,
  previousSnapshot,
  title = 'State Changes',
  compact = false,
}: SnapshotDiffPanelProps) {
  // 纯函数计算差异
  const diff = computeSnapshotDiff(currentSnapshot, previousSnapshot);

  // 无变化状态
  if (!diff.hasChanges) {
    return (
      <div
        style={{
          padding: compact ? '8px 12px' : '12px 16px',
          background: 'rgba(100, 100, 100, 0.1)',
          border: '1px solid rgba(100, 100, 100, 0.2)',
          borderRadius: 8,
          fontSize: compact ? 10 : 11,
          color: '#666',
          textAlign: 'center',
        }}
      >
        No state changes detected
      </div>
    );
  }

  return (
    <div
      style={{
        background: 'rgba(249, 115, 22, 0.08)',
        border: '1px solid rgba(249, 115, 22, 0.2)',
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
          borderBottom: '1px solid rgba(249, 115, 22, 0.15)',
          background: 'rgba(249, 115, 22, 0.05)',
        }}
      >
        <span
          style={{
            fontSize: compact ? 9 : 10,
            color: '#fb923c',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            fontWeight: 600,
          }}
        >
          {title}
        </span>
        <span
          style={{
            fontSize: compact ? 8 : 9,
            color: '#fdba74',
          }}
        >
          Seq: {previousSnapshot?.sequence ?? '?'} → {currentSnapshot?.sequence ?? '?'}
        </span>
      </div>

      {/* 差异内容 */}
      <div style={{ padding: compact ? '8px 10px' : '10px 12px' }}>
        {/* 阶段/街道变化 */}
        {diff.phaseChanged && (
          <DiffRow
            label="Phase"
            oldValue={diff.oldPhase}
            newValue={diff.newPhase}
            highlight={true}
            compact={compact}
          />
        )}

        {diff.streetChanged && (
          <DiffRow
            label="Street"
            oldValue={diff.oldStreet}
            newValue={diff.newStreet}
            highlight={true}
            compact={compact}
          />
        )}

        {/* Pot 变化 */}
        {diff.potDiff !== 0 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: compact ? '3px 0' : '4px 0',
              borderBottom: '1px solid rgba(100, 100, 100, 0.1)',
            }}
          >
            <span
              style={{
                width: compact ? 70 : 90,
                fontSize: compact ? 9 : 10,
                color: '#888',
                fontWeight: 500,
              }}
            >
              Pot
            </span>
            <span
              style={{
                fontSize: compact ? 10 : 11,
                color: '#ffd700',
                fontWeight: 600,
              }}
            >
              ${diff.oldPot} → ${diff.newPot}
            </span>
            <span
              style={{
                marginLeft: 8,
                fontSize: compact ? 9 : 10,
                color: '#22c55e',
                fontWeight: 600,
              }}
            >
              ({formatChange(diff.potDiff)})
            </span>
          </div>
        )}

        {/* 当前玩家变化 */}
        {diff.currentPlayerChanged && (
          <DiffRow
            label="Action On"
            oldValue={diff.oldCurrentPlayer || '—'}
            newValue={diff.newCurrentPlayer || '—'}
            compact={compact}
          />
        )}

        {/* 活跃状态变化 */}
        {diff.activeStatusChanged && (
          <DiffRow
            label="Active"
            oldValue={diff.oldIsActive ? 'Yes' : 'No'}
            newValue={diff.newIsActive ? 'Yes' : 'No'}
            highlight={true}
            compact={compact}
          />
        )}

        {/* 公共牌增加 */}
        {diff.communityCardsAdded > 0 && (
          <div
            style={{
              padding: compact ? '4px 0' : '6px 0',
              fontSize: compact ? 9 : 10,
              color: '#3b82f6',
              fontWeight: 500,
            }}
          >
            {'\u2663'} +{diff.communityCardsAdded} community card(s) dealt
          </div>
        )}

        {/* 玩家差异 */}
        {diff.playerDiffs.length > 0 && (
          <div style={{ marginTop: compact ? 6 : 8 }}>
            <div
              style={{
                fontSize: compact ? 8 : 9,
                color: '#888',
                marginBottom: 4,
                textTransform: 'uppercase',
              }}
            >
              Player Changes:
            </div>
            {diff.playerDiffs.map((pd) => (
              <PlayerDiffRow key={pd.playerId} diff={pd} compact={compact} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// 导出
// ============================================================================

export { computeSnapshotDiff, formatChange, getChangeColor };

export type { SnapshotInfo, SnapshotDiff, PlayerDiff, SnapshotDiffPanelProps };
