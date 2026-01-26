// ============================================================================
// FROZEN - LEGACY CODE - DO NOT MODIFY
// ============================================================================
// This file is part of the training/coaching system that is now deprecated.
// Do NOT extend, refactor, or build upon this code.
//
// Frozen as of: Phase 2 Freeze (Pokerrrr2-style refactor)
// Reason: Training/analysis features are legacy; focus is on core poker table UI
// ============================================================================

// ============================================================================
// HandAnalyticsPanel - Hand Analytics Summary (Read-Only UI)
// ============================================================================
//
// 【Post-Freeze Extension】Replay Architecture Freeze Declaration v1.0 Compliant
//
// 层级: UI Layer (纯展示)
// 职责: 从事件序列派生玩家行动分析、侵略模式、街道节奏
//
// 约束:
//   - 只读 props，无内部状态
//   - 不 import src/replay/** 或 src/commands/**
//   - 不调用 EventProcessor
//   - 不构造 ReplayEvent
//   - 不使用 React Hooks（纯函数组件）
//   - 所有逻辑必须是确定性的，仅从 props 派生
//
// 数据来源（全部只读）:
//   - events: 事件序列
//   - players: 玩家列表
//   - streets: 街道信息
//
// INV 合规性:
//   - INV-1 幂等快照: 不参与快照生成
//   - INV-2 回放确定性: 不参与回放过程
//   - INV-3 只读契约: 所有数据访问均为只读
//   - INV-4 序列单调性: 不修改序列号
//   - INV-5 压缩无损性: 不涉及压缩层
//
// H 合规性:
//   - H-1 安全手牌处理: 不涉及底牌可见性逻辑
//   - H-2 边界安全: 检查事件存在性后再访问
//   - H-3 无副作用: 使用纯函数进行计算
//   - H-4 值语义: 不修改任何值
//
// ============================================================================

import React from 'react';

// ============================================================================
// 本地类型定义（不依赖 src/replay/** 或 src/types/**）
// ============================================================================

/**
 * 事件形状描述（只读）
 */
interface EventInfo {
  readonly type: string;
  readonly playerId?: string;
  readonly amount?: number;
  readonly phase?: string;
  readonly street?: string;
}

/**
 * 玩家信息形状描述（只读）
 */
interface SnapshotPlayerInfo {
  readonly id: string;
  readonly name: string;
}

/**
 * 街道信息形状描述（只读）
 */
interface StreetInfo {
  readonly name: string;
  readonly startIndex?: number;
  readonly endIndex?: number;
}

/**
 * HandAnalyticsPanel Props
 */
interface HandAnalyticsPanelProps {
  readonly events: readonly EventInfo[];
  readonly players: readonly SnapshotPlayerInfo[];
  readonly streets: readonly StreetInfo[];
  readonly title?: string;
  readonly compact?: boolean;
}

// ============================================================================
// 派生类型
// ============================================================================

/**
 * 玩家行动频率
 */
interface ActionFrequency {
  readonly playerId: string;
  readonly playerName: string;
  readonly folds: number;
  readonly calls: number;
  readonly raises: number;
  readonly checks: number;
  readonly bets: number;
  readonly allIns: number;
  readonly total: number;
}

/**
 * 侵略模式
 */
interface AggressionPattern {
  readonly street: string;
  readonly sequence: readonly string[];
  readonly escalationLevel: 'none' | 'mild' | 'moderate' | 'high';
}

/**
 * 街道节奏
 */
interface StreetTempo {
  readonly street: string;
  readonly actionCount: number;
  readonly aggressiveActions: number;
  readonly passiveActions: number;
  readonly tempo: 'slow' | 'moderate' | 'fast' | 'explosive';
}

/**
 * 玩家风格
 */
interface PlayerStyle {
  readonly playerId: string;
  readonly playerName: string;
  readonly style: 'passive' | 'aggressive' | 'reactive' | 'balanced';
  readonly aggressionRatio: number;
  readonly vpip: number;
}

// ============================================================================
// 常量
// ============================================================================

const ACTION_TYPES = {
  AGGRESSIVE: ['BET', 'RAISE', 'ALL_IN'],
  PASSIVE: ['CHECK', 'CALL'],
  FOLD: ['FOLD'],
} as const;

const STYLE_COLORS: Record<string, string> = {
  passive: '#3b82f6',
  aggressive: '#ef4444',
  reactive: '#f59e0b',
  balanced: '#22c55e',
};

const TEMPO_COLORS: Record<string, string> = {
  slow: '#6b7280',
  moderate: '#3b82f6',
  fast: '#f59e0b',
  explosive: '#ef4444',
};

const ESCALATION_COLORS: Record<string, string> = {
  none: '#6b7280',
  mild: '#22c55e',
  moderate: '#f59e0b',
  high: '#ef4444',
};

// ============================================================================
// 纯函数：玩家名称映射
// ============================================================================

function buildPlayerNameMap(
  players: readonly SnapshotPlayerInfo[]
): Map<string, string> {
  const map = new Map<string, string>();
  for (const p of players) {
    map.set(p.id, p.name);
  }
  return map;
}

function getPlayerName(
  playerId: string | undefined,
  playerNames: Map<string, string>
): string {
  if (!playerId) return 'Unknown';
  return playerNames.get(playerId) ?? playerId;
}

// ============================================================================
// 纯函数：行动频率计算
// ============================================================================

function calculateActionFrequencies(
  events: readonly EventInfo[],
  playerNames: Map<string, string>
): readonly ActionFrequency[] {
  const frequencies: Map<string, {
    folds: number;
    calls: number;
    raises: number;
    checks: number;
    bets: number;
    allIns: number;
  }> = new Map();

  for (const event of events) {
    if (!event.playerId) continue;

    if (!frequencies.has(event.playerId)) {
      frequencies.set(event.playerId, {
        folds: 0,
        calls: 0,
        raises: 0,
        checks: 0,
        bets: 0,
        allIns: 0,
      });
    }

    const freq = frequencies.get(event.playerId)!;
    switch (event.type) {
      case 'FOLD':
        freq.folds++;
        break;
      case 'CALL':
        freq.calls++;
        break;
      case 'RAISE':
        freq.raises++;
        break;
      case 'CHECK':
        freq.checks++;
        break;
      case 'BET':
        freq.bets++;
        break;
      case 'ALL_IN':
        freq.allIns++;
        break;
    }
  }

  const result: ActionFrequency[] = [];
  for (const [playerId, freq] of frequencies.entries()) {
    const total = freq.folds + freq.calls + freq.raises + freq.checks + freq.bets + freq.allIns;
    result.push({
      playerId,
      playerName: getPlayerName(playerId, playerNames),
      folds: freq.folds,
      calls: freq.calls,
      raises: freq.raises,
      checks: freq.checks,
      bets: freq.bets,
      allIns: freq.allIns,
      total,
    });
  }

  return result;
}

// ============================================================================
// 纯函数：侵略模式检测
// ============================================================================

function detectAggressionPatterns(
  events: readonly EventInfo[]
): readonly AggressionPattern[] {
  const patterns: AggressionPattern[] = [];
  let currentStreet = 'PREFLOP';
  let currentSequence: string[] = [];

  for (const event of events) {
    if (event.type === 'STREET_START' && event.street) {
      if (currentSequence.length > 0) {
        patterns.push({
          street: currentStreet,
          sequence: currentSequence,
          escalationLevel: calculateEscalationLevel(currentSequence),
        });
      }
      currentStreet = event.street.toUpperCase();
      currentSequence = [];
    } else if (event.type === 'DEAL_COMMUNITY' && event.phase) {
      if (currentSequence.length > 0) {
        patterns.push({
          street: currentStreet,
          sequence: currentSequence,
          escalationLevel: calculateEscalationLevel(currentSequence),
        });
      }
      currentStreet = event.phase.toUpperCase();
      currentSequence = [];
    } else if (ACTION_TYPES.AGGRESSIVE.includes(event.type as typeof ACTION_TYPES.AGGRESSIVE[number])) {
      currentSequence.push(event.type);
    }
  }

  if (currentSequence.length > 0) {
    patterns.push({
      street: currentStreet,
      sequence: currentSequence,
      escalationLevel: calculateEscalationLevel(currentSequence),
    });
  }

  return patterns;
}

function calculateEscalationLevel(
  sequence: readonly string[]
): 'none' | 'mild' | 'moderate' | 'high' {
  if (sequence.length === 0) return 'none';

  const hasAllIn = sequence.includes('ALL_IN');
  const raiseCount = sequence.filter(a => a === 'RAISE').length;
  const betCount = sequence.filter(a => a === 'BET').length;

  if (hasAllIn && raiseCount >= 1) return 'high';
  if (hasAllIn || raiseCount >= 2) return 'moderate';
  if (raiseCount >= 1 || betCount >= 2) return 'mild';
  return 'none';
}

// ============================================================================
// 纯函数：街道节奏计算
// ============================================================================

function calculateStreetTempo(
  events: readonly EventInfo[]
): readonly StreetTempo[] {
  const tempos: Map<string, { aggressive: number; passive: number }> = new Map();
  let currentStreet = 'PREFLOP';

  for (const event of events) {
    if (event.type === 'STREET_START' && event.street) {
      currentStreet = event.street.toUpperCase();
    } else if (event.type === 'DEAL_COMMUNITY' && event.phase) {
      currentStreet = event.phase.toUpperCase();
    }

    if (!tempos.has(currentStreet)) {
      tempos.set(currentStreet, { aggressive: 0, passive: 0 });
    }

    const tempo = tempos.get(currentStreet)!;
    if (ACTION_TYPES.AGGRESSIVE.includes(event.type as typeof ACTION_TYPES.AGGRESSIVE[number])) {
      tempo.aggressive++;
    } else if (ACTION_TYPES.PASSIVE.includes(event.type as typeof ACTION_TYPES.PASSIVE[number])) {
      tempo.passive++;
    }
  }

  const result: StreetTempo[] = [];
  for (const [street, counts] of tempos.entries()) {
    const total = counts.aggressive + counts.passive;
    if (total === 0) continue;

    const aggressionRatio = counts.aggressive / total;
    let tempo: StreetTempo['tempo'];

    if (total <= 2) {
      tempo = 'slow';
    } else if (aggressionRatio >= 0.6) {
      tempo = 'explosive';
    } else if (aggressionRatio >= 0.4) {
      tempo = 'fast';
    } else if (total >= 4) {
      tempo = 'moderate';
    } else {
      tempo = 'slow';
    }

    result.push({
      street,
      actionCount: total,
      aggressiveActions: counts.aggressive,
      passiveActions: counts.passive,
      tempo,
    });
  }

  return result;
}

// ============================================================================
// 纯函数：玩家风格分析
// ============================================================================

function analyzePlayerStyles(
  frequencies: readonly ActionFrequency[]
): readonly PlayerStyle[] {
  const styles: PlayerStyle[] = [];

  for (const freq of frequencies) {
    const aggressiveActions = freq.bets + freq.raises + freq.allIns;
    const passiveActions = freq.calls + freq.checks;
    const voluntaryActions = freq.total - freq.folds;

    const aggressionRatio = voluntaryActions > 0
      ? aggressiveActions / voluntaryActions
      : 0;

    const vpip = freq.total > 0
      ? (freq.total - freq.folds - freq.checks) / freq.total
      : 0;

    let style: PlayerStyle['style'];
    if (aggressionRatio >= 0.5 && vpip >= 0.5) {
      style = 'aggressive';
    } else if (aggressionRatio < 0.3 && vpip >= 0.4) {
      style = 'passive';
    } else if (freq.raises > freq.bets && freq.calls >= freq.raises) {
      style = 'reactive';
    } else {
      style = 'balanced';
    }

    styles.push({
      playerId: freq.playerId,
      playerName: freq.playerName,
      style,
      aggressionRatio: Math.round(aggressionRatio * 100) / 100,
      vpip: Math.round(vpip * 100) / 100,
    });
  }

  return styles;
}

// ============================================================================
// 纯函数：格式化百分比
// ============================================================================

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

// ============================================================================
// Sub-components（纯函数组件）
// ============================================================================

interface ActionFrequencyRowProps {
  readonly frequency: ActionFrequency;
  readonly compact?: boolean;
}

function ActionFrequencyRow({ frequency, compact = false }: ActionFrequencyRowProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: compact ? 8 : 12,
        marginBottom: compact ? 6 : 8,
        padding: compact ? '4px 8px' : '6px 10px',
        background: 'rgba(100, 100, 100, 0.1)',
        borderRadius: 4,
      }}
    >
      <span
        style={{
          minWidth: compact ? 60 : 80,
          fontSize: compact ? 10 : 11,
          fontWeight: 600,
          color: '#e0e0e0',
        }}
      >
        {frequency.playerName.slice(0, 8)}
      </span>
      <div
        style={{
          display: 'flex',
          gap: compact ? 6 : 10,
          fontSize: compact ? 9 : 10,
        }}
      >
        <span style={{ color: '#ef4444' }}>F:{frequency.folds}</span>
        <span style={{ color: '#3b82f6' }}>C:{frequency.calls}</span>
        <span style={{ color: '#22c55e' }}>R:{frequency.raises}</span>
        <span style={{ color: '#6b7280' }}>X:{frequency.checks}</span>
        <span style={{ color: '#f59e0b' }}>B:{frequency.bets}</span>
        {frequency.allIns > 0 && (
          <span style={{ color: '#dc2626', fontWeight: 700 }}>AI:{frequency.allIns}</span>
        )}
      </div>
    </div>
  );
}

interface AggressionPatternRowProps {
  readonly pattern: AggressionPattern;
  readonly compact?: boolean;
}

function AggressionPatternRow({ pattern, compact = false }: AggressionPatternRowProps) {
  const color = ESCALATION_COLORS[pattern.escalationLevel];

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: compact ? 8 : 12,
        marginBottom: compact ? 6 : 8,
      }}
    >
      <span
        style={{
          minWidth: compact ? 50 : 60,
          fontSize: compact ? 9 : 10,
          fontWeight: 700,
          color: '#888',
          textTransform: 'uppercase',
        }}
      >
        {pattern.street}
      </span>
      <div
        style={{
          display: 'flex',
          gap: 4,
          flexWrap: 'wrap',
        }}
      >
        {pattern.sequence.length === 0 ? (
          <span style={{ fontSize: compact ? 9 : 10, color: '#555', fontStyle: 'italic' }}>
            No aggressive actions
          </span>
        ) : (
          pattern.sequence.map((action, idx) => (
            <span
              key={idx}
              style={{
                padding: '2px 6px',
                background: action === 'ALL_IN' ? '#dc262620' : action === 'RAISE' ? '#22c55e20' : '#f5970b20',
                borderRadius: 3,
                fontSize: compact ? 8 : 9,
                color: action === 'ALL_IN' ? '#dc2626' : action === 'RAISE' ? '#22c55e' : '#f59e0b',
                fontWeight: 600,
              }}
            >
              {action}
            </span>
          ))
        )}
      </div>
      <span
        style={{
          marginLeft: 'auto',
          padding: '2px 6px',
          background: `${color}20`,
          borderRadius: 3,
          fontSize: compact ? 8 : 9,
          color: color,
          fontWeight: 600,
          textTransform: 'uppercase',
        }}
      >
        {pattern.escalationLevel}
      </span>
    </div>
  );
}

interface StreetTempoRowProps {
  readonly tempo: StreetTempo;
  readonly compact?: boolean;
}

function StreetTempoRow({ tempo, compact = false }: StreetTempoRowProps) {
  const color = TEMPO_COLORS[tempo.tempo];

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: compact ? 8 : 12,
        marginBottom: compact ? 6 : 8,
      }}
    >
      <span
        style={{
          minWidth: compact ? 50 : 60,
          fontSize: compact ? 9 : 10,
          fontWeight: 700,
          color: '#888',
          textTransform: 'uppercase',
        }}
      >
        {tempo.street}
      </span>
      <div
        style={{
          flex: 1,
          display: 'flex',
          gap: compact ? 8 : 12,
          fontSize: compact ? 9 : 10,
          color: '#aaa',
        }}
      >
        <span>Actions: <strong style={{ color: '#e0e0e0' }}>{tempo.actionCount}</strong></span>
        <span>Agg: <strong style={{ color: '#ef4444' }}>{tempo.aggressiveActions}</strong></span>
        <span>Pass: <strong style={{ color: '#3b82f6' }}>{tempo.passiveActions}</strong></span>
      </div>
      <span
        style={{
          padding: '2px 8px',
          background: `${color}20`,
          borderRadius: 3,
          fontSize: compact ? 9 : 10,
          color: color,
          fontWeight: 700,
          textTransform: 'uppercase',
        }}
      >
        {tempo.tempo}
      </span>
    </div>
  );
}

interface PlayerStyleRowProps {
  readonly style: PlayerStyle;
  readonly compact?: boolean;
}

function PlayerStyleRow({ style, compact = false }: PlayerStyleRowProps) {
  const color = STYLE_COLORS[style.style];

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: compact ? 8 : 12,
        marginBottom: compact ? 6 : 8,
        padding: compact ? '4px 8px' : '6px 10px',
        background: 'rgba(100, 100, 100, 0.1)',
        borderRadius: 4,
      }}
    >
      <span
        style={{
          minWidth: compact ? 60 : 80,
          fontSize: compact ? 10 : 11,
          fontWeight: 600,
          color: '#e0e0e0',
        }}
      >
        {style.playerName.slice(0, 8)}
      </span>
      <span
        style={{
          padding: '2px 8px',
          background: `${color}20`,
          border: `1px solid ${color}40`,
          borderRadius: 4,
          fontSize: compact ? 9 : 10,
          color: color,
          fontWeight: 700,
          textTransform: 'uppercase',
        }}
      >
        {style.style}
      </span>
      <div
        style={{
          display: 'flex',
          gap: compact ? 8 : 12,
          fontSize: compact ? 9 : 10,
          color: '#888',
          marginLeft: 'auto',
        }}
      >
        <span>AF: <strong style={{ color: '#e0e0e0' }}>{formatPercent(style.aggressionRatio)}</strong></span>
        <span>VPIP: <strong style={{ color: '#e0e0e0' }}>{formatPercent(style.vpip)}</strong></span>
      </div>
    </div>
  );
}

// ============================================================================
// HandAnalyticsPanel - Main Component
// ============================================================================

export function HandAnalyticsPanel({
  events,
  players,
  streets,
  title = 'Hand Analytics',
  compact = false,
}: HandAnalyticsPanelProps) {
  // ========================================
  // 边界检查：无事件时显示空状态
  // ========================================
  if (events.length === 0) {
    return (
      <div
        style={{
          padding: compact ? '8px 12px' : '12px 16px',
          background: 'rgba(100, 100, 100, 0.1)',
          border: '1px solid rgba(100, 100, 100, 0.2)',
          borderRadius: 8,
          fontSize: compact ? 11 : 13,
          color: '#666',
          textAlign: 'center',
        }}
      >
        No hand data to analyze
      </div>
    );
  }

  // ========================================
  // 纯函数计算：所有分析数据
  // ========================================
  const playerNames = buildPlayerNameMap(players);
  const actionFrequencies = calculateActionFrequencies(events, playerNames);
  const aggressionPatterns = detectAggressionPatterns(events);
  const streetTempos = calculateStreetTempo(events);
  const playerStyles = analyzePlayerStyles(actionFrequencies);

  // ========================================
  // 纯展示渲染
  // ========================================
  return (
    <div
      style={{
        background: 'rgba(59, 130, 246, 0.08)',
        border: '1px solid rgba(59, 130, 246, 0.2)',
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
          borderBottom: '1px solid rgba(59, 130, 246, 0.15)',
          background: 'rgba(59, 130, 246, 0.05)',
        }}
      >
        <span
          style={{
            fontSize: compact ? 9 : 10,
            color: '#60a5fa',
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
            color: '#3b82f6',
            padding: '2px 6px',
            background: 'rgba(59, 130, 246, 0.15)',
            borderRadius: 3,
          }}
        >
          {playerStyles.length} players
        </span>
      </div>

      <div style={{ padding: compact ? '10px 12px' : '14px 16px' }}>
        {/* Section: Action Frequencies */}
        <div style={{ marginBottom: compact ? 14 : 18 }}>
          <div
            style={{
              fontSize: compact ? 9 : 10,
              color: '#60a5fa',
              fontWeight: 700,
              marginBottom: compact ? 6 : 8,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            Action Frequencies
          </div>
          {actionFrequencies.length === 0 ? (
            <div style={{ fontSize: compact ? 10 : 11, color: '#666', fontStyle: 'italic' }}>
              No actions recorded
            </div>
          ) : (
            actionFrequencies.map((freq) => (
              <ActionFrequencyRow key={freq.playerId} frequency={freq} compact={compact} />
            ))
          )}
        </div>

        {/* Section: Aggression Patterns */}
        <div style={{ marginBottom: compact ? 14 : 18 }}>
          <div
            style={{
              fontSize: compact ? 9 : 10,
              color: '#f59e0b',
              fontWeight: 700,
              marginBottom: compact ? 6 : 8,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            Aggression Patterns
          </div>
          {aggressionPatterns.length === 0 ? (
            <div style={{ fontSize: compact ? 10 : 11, color: '#666', fontStyle: 'italic' }}>
              No aggression patterns detected
            </div>
          ) : (
            aggressionPatterns.map((pattern, idx) => (
              <AggressionPatternRow key={idx} pattern={pattern} compact={compact} />
            ))
          )}
        </div>

        {/* Section: Street Tempo */}
        <div style={{ marginBottom: compact ? 14 : 18 }}>
          <div
            style={{
              fontSize: compact ? 9 : 10,
              color: '#22c55e',
              fontWeight: 700,
              marginBottom: compact ? 6 : 8,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            Street Tempo
          </div>
          {streetTempos.length === 0 ? (
            <div style={{ fontSize: compact ? 10 : 11, color: '#666', fontStyle: 'italic' }}>
              No street tempo data
            </div>
          ) : (
            streetTempos.map((tempo, idx) => (
              <StreetTempoRow key={idx} tempo={tempo} compact={compact} />
            ))
          )}
        </div>

        {/* Section: Player Style Summary */}
        <div>
          <div
            style={{
              fontSize: compact ? 9 : 10,
              color: '#a78bfa',
              fontWeight: 700,
              marginBottom: compact ? 6 : 8,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            Player Style Summary
          </div>
          {playerStyles.length === 0 ? (
            <div style={{ fontSize: compact ? 10 : 11, color: '#666', fontStyle: 'italic' }}>
              No player styles analyzed
            </div>
          ) : (
            playerStyles.map((style) => (
              <PlayerStyleRow key={style.playerId} style={style} compact={compact} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 导出辅助函数（供测试或其他组件使用）
// ============================================================================

export {
  calculateActionFrequencies,
  detectAggressionPatterns,
  calculateStreetTempo,
  analyzePlayerStyles,
  calculateEscalationLevel,
  buildPlayerNameMap,
  formatPercent,
};

// 导出类型供外部使用
export type {
  EventInfo,
  SnapshotPlayerInfo,
  StreetInfo,
  ActionFrequency,
  AggressionPattern,
  StreetTempo,
  PlayerStyle,
  HandAnalyticsPanelProps,
};
