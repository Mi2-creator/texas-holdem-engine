// ============================================================================
// EventTimelineInspector - Advanced Event Timeline Inspector (Read-Only)
// ============================================================================
//
// 【A 路线】Replay Architecture Freeze Declaration v1.0 Compliant
//
// 层级: UI Layer (纯展示)
// 职责: 可视化事件序列，高亮当前索引，显示派生语义标签
//
// 约束:
//   - 只读 props，无内部状态
//   - 不 import src/replay/** 或 src/commands/**
//   - 不调用 EventProcessor
//   - 不使用 React Hooks
//   - 纯函数组件，仅通过 props + 纯函数派生 UI
//
// 特性:
//   - 事件分组（按街道）
//   - 语义标签（Street Start, Action, Showdown, Hand End）
//   - 当前索引高亮
//   - 可选 seek 回调
//
// ============================================================================

import React from 'react';

// ============================================================================
// 本地类型定义（不依赖 src/replay/events.ts）
// ============================================================================

interface EventInfo {
  readonly type: string;
  readonly playerId?: string;
  readonly amount?: number;
  readonly phase?: string;
  readonly street?: string;
  readonly blindType?: string;
  readonly reason?: string;
  readonly handId?: string;
}

interface PlayerNameInfo {
  readonly id: string;
  readonly name: string;
}

/**
 * 语义分类
 */
type SemanticCategory =
  | 'lifecycle'    // HAND_START, HAND_END
  | 'street'       // STREET_START
  | 'deal'         // DEAL_HOLE, DEAL_COMMUNITY
  | 'blind'        // POST_BLIND
  | 'action'       // BET, CALL, RAISE, CHECK, FOLD, ALL_IN
  | 'showdown'     // SHOWDOWN
  | 'unknown';

/**
 * EventTimelineInspector Props
 */
interface EventTimelineInspectorProps {
  readonly events: readonly EventInfo[];
  readonly currentIndex: number;
  readonly players?: readonly PlayerNameInfo[];
  readonly onSeek?: (index: number) => void;
  readonly title?: string;
  readonly maxHeight?: number;
  readonly compact?: boolean;
  readonly showGroupHeaders?: boolean;
}

// ============================================================================
// 纯函数：语义分析
// ============================================================================

/**
 * 获取事件的语义分类（纯函数）
 */
function getSemanticCategory(type: string): SemanticCategory {
  switch (type) {
    case 'HAND_START':
    case 'HAND_END':
      return 'lifecycle';
    case 'STREET_START':
      return 'street';
    case 'DEAL_HOLE':
    case 'DEAL_COMMUNITY':
      return 'deal';
    case 'POST_BLIND':
      return 'blind';
    case 'BET':
    case 'CALL':
    case 'RAISE':
    case 'CHECK':
    case 'FOLD':
    case 'ALL_IN':
      return 'action';
    case 'SHOWDOWN':
      return 'showdown';
    default:
      return 'unknown';
  }
}

/**
 * 获取语义分类的颜色（纯函数）
 */
function getCategoryColor(category: SemanticCategory): string {
  const colors: Record<SemanticCategory, string> = {
    lifecycle: '#22c55e',
    street: '#06b6d4',
    deal: '#3b82f6',
    blind: '#8b5cf6',
    action: '#f97316',
    showdown: '#f59e0b',
    unknown: '#6b7280',
  };
  return colors[category];
}

/**
 * 获取语义分类的标签（纯函数）
 */
function getCategoryLabel(category: SemanticCategory): string {
  const labels: Record<SemanticCategory, string> = {
    lifecycle: 'LIFECYCLE',
    street: 'STREET',
    deal: 'DEAL',
    blind: 'BLIND',
    action: 'ACTION',
    showdown: 'SHOWDOWN',
    unknown: 'OTHER',
  };
  return labels[category];
}

/**
 * 获取事件图标（纯函数）
 */
function getEventIcon(type: string): string {
  const icons: Record<string, string> = {
    HAND_START: '\u25B6',     // ▶
    HAND_END: '\u25A0',       // ■
    STREET_START: '\u25B7',   // ▷
    DEAL_HOLE: '\u2660',      // ♠
    DEAL_COMMUNITY: '\u2663', // ♣
    POST_BLIND: '\u25CF',     // ●
    BET: '\u25B2',            // ▲
    CALL: '\u2192',           // →
    RAISE: '\u21D1',          // ⇑
    CHECK: '\u2713',          // ✓
    FOLD: '\u2717',           // ✗
    ALL_IN: '\u2B24',         // ⬤
    SHOWDOWN: '\u2605',       // ★
  };
  return icons[type] ?? '\u25CB'; // ○
}

/**
 * 格式化事件描述（纯函数）
 */
function formatEventDescription(
  event: EventInfo,
  playerNames: Map<string, string>
): string {
  const getName = (id: string | undefined) =>
    id ? (playerNames.get(id) ?? id) : 'Unknown';

  switch (event.type) {
    case 'HAND_START':
      return `Hand #${event.handId?.slice(-6) ?? '???'} begins`;
    case 'HAND_END':
      return event.reason === 'ALL_FOLD' ? 'All fold - Hand ends' : 'Showdown - Hand ends';
    case 'STREET_START':
      return `${event.street ?? 'Street'} begins`;
    case 'DEAL_HOLE':
      return `Deal to ${getName(event.playerId)}`;
    case 'DEAL_COMMUNITY':
      return `${event.phase ?? 'Community'} dealt`;
    case 'POST_BLIND':
      return `${getName(event.playerId)} posts ${event.blindType === 'SB' ? 'SB' : 'BB'} $${event.amount}`;
    case 'BET':
      return `${getName(event.playerId)} bets $${event.amount}`;
    case 'CALL':
      return `${getName(event.playerId)} calls $${event.amount}`;
    case 'RAISE':
      return `${getName(event.playerId)} raises to $${event.amount}`;
    case 'CHECK':
      return `${getName(event.playerId)} checks`;
    case 'FOLD':
      return `${getName(event.playerId)} folds`;
    case 'ALL_IN':
      return `${getName(event.playerId)} ALL-IN $${event.amount}`;
    case 'SHOWDOWN':
      return 'Showdown';
    default:
      return event.type;
  }
}

/**
 * 构建玩家名称映射（纯函数）
 */
function buildPlayerNameMap(players: readonly PlayerNameInfo[] | undefined): Map<string, string> {
  const map = new Map<string, string>();
  if (players) {
    for (const p of players) {
      map.set(p.id, p.name);
    }
  }
  return map;
}

/**
 * 派生街道分组信息（纯函数）
 */
function deriveStreetGroups(events: readonly EventInfo[]): Map<number, string> {
  const groups = new Map<number, string>();
  let currentStreet = '';

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (event.type === 'STREET_START' && event.street) {
      currentStreet = event.street;
    } else if (event.type === 'DEAL_COMMUNITY' && event.phase) {
      currentStreet = event.phase.toUpperCase();
    }

    // 标记街道开始
    if (event.type === 'STREET_START' || event.type === 'HAND_START') {
      groups.set(i, event.type === 'HAND_START' ? 'HAND START' : (event.street ?? 'STREET'));
    }
  }

  return groups;
}

// ============================================================================
// Sub-components (纯函数组件)
// ============================================================================

interface TimelineItemProps {
  readonly event: EventInfo;
  readonly index: number;
  readonly isActive: boolean;
  readonly playerNames: Map<string, string>;
  readonly onClick?: () => void;
  readonly compact?: boolean;
}

function TimelineItem({
  event,
  index,
  isActive,
  playerNames,
  onClick,
  compact = false,
}: TimelineItemProps) {
  const category = getSemanticCategory(event.type);
  const color = getCategoryColor(category);
  const icon = getEventIcon(event.type);
  const description = formatEventDescription(event, playerNames);
  const label = getCategoryLabel(category);

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: compact ? 6 : 8,
        padding: compact ? '4px 8px' : '6px 10px',
        cursor: onClick ? 'pointer' : 'default',
        background: isActive ? 'rgba(74, 222, 128, 0.15)' : 'transparent',
        borderLeft: isActive ? '3px solid #4ade80' : '3px solid transparent',
        borderRadius: '0 4px 4px 0',
        transition: 'all 0.15s ease',
      }}
    >
      {/* 索引 */}
      <span
        style={{
          minWidth: compact ? 18 : 24,
          fontSize: compact ? 8 : 9,
          color: isActive ? '#4ade80' : '#555',
          textAlign: 'right',
          fontFamily: 'monospace',
        }}
      >
        {index}
      </span>

      {/* 图标 */}
      <span
        style={{
          width: compact ? 14 : 18,
          textAlign: 'center',
          fontSize: compact ? 10 : 12,
          color: color,
        }}
      >
        {icon}
      </span>

      {/* 语义标签 */}
      {!compact && (
        <span
          style={{
            padding: '1px 4px',
            fontSize: 7,
            fontWeight: 700,
            color: color,
            background: `${color}20`,
            borderRadius: 2,
            textTransform: 'uppercase',
            letterSpacing: '0.3px',
          }}
        >
          {label}
        </span>
      )}

      {/* 描述 */}
      <span
        style={{
          flex: 1,
          fontSize: compact ? 10 : 11,
          color: isActive ? '#fff' : '#aaa',
          fontWeight: isActive ? 600 : 400,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {description}
      </span>

      {/* 活跃指示 */}
      {isActive && (
        <span
          style={{
            fontSize: compact ? 7 : 8,
            color: '#4ade80',
            fontWeight: 700,
            textTransform: 'uppercase',
          }}
        >
          NOW
        </span>
      )}
    </div>
  );
}

interface GroupHeaderProps {
  readonly label: string;
}

function GroupHeader({ label }: GroupHeaderProps) {
  return (
    <div
      style={{
        padding: '4px 10px',
        fontSize: 8,
        fontWeight: 700,
        color: '#06b6d4',
        background: 'rgba(6, 182, 212, 0.1)',
        borderLeft: '2px solid #06b6d4',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
      }}
    >
      {label}
    </div>
  );
}

// ============================================================================
// EventTimelineInspector - Main Component
// ============================================================================

export function EventTimelineInspector({
  events,
  currentIndex,
  players,
  onSeek,
  title = 'Event Timeline Inspector',
  maxHeight = 350,
  compact = false,
  showGroupHeaders = true,
}: EventTimelineInspectorProps) {
  // 纯函数计算
  const playerNames = buildPlayerNameMap(players);
  const streetGroups = showGroupHeaders ? deriveStreetGroups(events) : new Map();

  // 空状态
  if (events.length === 0) {
    return (
      <div
        style={{
          padding: '12px',
          background: 'rgba(100, 100, 100, 0.1)',
          border: '1px solid rgba(100, 100, 100, 0.2)',
          borderRadius: 8,
          fontSize: 11,
          color: '#666',
          textAlign: 'center',
        }}
      >
        No events to inspect
      </div>
    );
  }

  return (
    <div
      style={{
        background: 'rgba(6, 182, 212, 0.08)',
        border: '1px solid rgba(6, 182, 212, 0.2)',
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
          borderBottom: '1px solid rgba(6, 182, 212, 0.15)',
          background: 'rgba(6, 182, 212, 0.05)',
        }}
      >
        <span
          style={{
            fontSize: compact ? 9 : 10,
            color: '#22d3ee',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            fontWeight: 600,
          }}
        >
          {title}
        </span>
        <span
          style={{
            fontSize: compact ? 9 : 10,
            color: '#67e8f9',
          }}
        >
          {currentIndex + 1} / {events.length}
        </span>
      </div>

      {/* 统计栏 */}
      <div
        style={{
          display: 'flex',
          gap: 12,
          padding: compact ? '4px 10px' : '6px 12px',
          borderBottom: '1px solid rgba(6, 182, 212, 0.1)',
          fontSize: compact ? 8 : 9,
          color: '#888',
        }}
      >
        <span>
          Actions:{' '}
          <strong style={{ color: '#f97316' }}>
            {events.filter((e) => getSemanticCategory(e.type) === 'action').length}
          </strong>
        </span>
        <span>
          Deals:{' '}
          <strong style={{ color: '#3b82f6' }}>
            {events.filter((e) => getSemanticCategory(e.type) === 'deal').length}
          </strong>
        </span>
        <span>
          Streets:{' '}
          <strong style={{ color: '#06b6d4' }}>
            {events.filter((e) => e.type === 'STREET_START').length}
          </strong>
        </span>
      </div>

      {/* 事件列表 */}
      <div
        style={{
          maxHeight: maxHeight,
          overflowY: 'auto',
          overflowX: 'hidden',
        }}
      >
        {events.map((event, index) => (
          <React.Fragment key={index}>
            {/* 分组标题 */}
            {showGroupHeaders && streetGroups.has(index) && (
              <GroupHeader label={streetGroups.get(index)!} />
            )}

            {/* 事件项 */}
            <TimelineItem
              event={event}
              index={index}
              isActive={index === currentIndex}
              playerNames={playerNames}
              onClick={onSeek ? () => onSeek(index) : undefined}
              compact={compact}
            />
          </React.Fragment>
        ))}
      </div>

      {/* 底部提示 */}
      <div
        style={{
          padding: compact ? '4px 10px' : '6px 12px',
          borderTop: '1px solid rgba(6, 182, 212, 0.1)',
          fontSize: compact ? 8 : 9,
          color: '#5eadb8',
          textAlign: 'center',
          fontStyle: 'italic',
        }}
      >
        {onSeek ? 'Click event to seek' : 'Read-only timeline'}
      </div>
    </div>
  );
}

// ============================================================================
// 导出
// ============================================================================

export {
  getSemanticCategory,
  getCategoryColor,
  getCategoryLabel,
  getEventIcon,
  formatEventDescription,
  deriveStreetGroups,
};

export type { EventInfo, SemanticCategory, EventTimelineInspectorProps };
