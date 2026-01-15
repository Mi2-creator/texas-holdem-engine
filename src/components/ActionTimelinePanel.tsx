// ============================================================================
// ActionTimelinePanel - 事件时间线面板（纯 UI 组件）
// ============================================================================
//
// 【A 路线】Replay Architecture v1.0 兼容组件
//
// 层级: UI Layer (纯展示)
// 职责: 展示 replay 事件序列，支持点击 seek
// 约束:
//   - 只读 props，不写入任何状态
//   - 不 import src/replay/** 或 src/commands/**
//   - 不调用 EventProcessor
//   - 不构造 ReplayEvent
//   - 仅调用已暴露的 actions.seek(index)
//
// 数据来源（全部只读）:
//   - events: 事件数组（从 main.tsx 传入）
//   - currentIndex: 当前回放索引
//   - onSeek: seek 回调（actions.seek）
//
// ============================================================================

import React from 'react';

// ============================================================================
// 本地类型定义（不依赖 src/replay/events.ts）
// ============================================================================

/**
 * 时间线事件信息（只读，仅描述展示所需字段）
 *
 * 这是一个"形状描述"接口，不是 ReplayEvent 的导入。
 * 组件只读取这些字段用于展示，不构造或修改事件。
 */
interface TimelineEventInfo {
  readonly type: string;
  readonly playerId?: string;
  readonly amount?: number;
  readonly phase?: string;
  readonly street?: string;
  readonly blindType?: string;
  readonly reason?: string;
  readonly handId?: string;
}

/**
 * ActionTimelinePanel Props
 */
interface ActionTimelinePanelProps {
  /** 事件序列（只读，来自 main.tsx） */
  readonly events: ReadonlyArray<TimelineEventInfo>;
  /** 当前回放索引（只读，来自 viewModel.index） */
  readonly currentIndex: number;
  /** Seek 回调（来自 actions.seek） */
  readonly onSeek: (index: number) => void;
  /** 可选：最大显示高度 */
  readonly maxHeight?: number;
}

// ============================================================================
// 纯函数：事件格式化
// ============================================================================

/**
 * 获取事件类型的显示颜色
 * 纯函数：无副作用
 */
function getEventColor(type: string): string {
  switch (type) {
    case 'HAND_START':
      return '#22c55e'; // 绿色 - 开始
    case 'HAND_END':
      return '#ef4444'; // 红色 - 结束
    case 'SHOWDOWN':
      return '#f59e0b'; // 金色 - 摊牌
    case 'POST_BLIND':
      return '#8b5cf6'; // 紫色 - 盲注
    case 'DEAL_HOLE':
    case 'DEAL_COMMUNITY':
      return '#3b82f6'; // 蓝色 - 发牌
    case 'STREET_START':
      return '#06b6d4'; // 青色 - 街道开始
    case 'FOLD':
      return '#6b7280'; // 灰色 - 弃牌
    case 'CHECK':
      return '#9ca3af'; // 浅灰 - 过牌
    case 'CALL':
      return '#10b981'; // 青绿 - 跟注
    case 'BET':
    case 'RAISE':
      return '#f97316'; // 橙色 - 下注/加注
    case 'ALL_IN':
      return '#dc2626'; // 深红 - 全下
    default:
      return '#6b7280';
  }
}

/**
 * 获取事件类型的图标
 * 纯函数：无副作用
 */
function getEventIcon(type: string): string {
  switch (type) {
    case 'HAND_START':
      return '\u25B6'; // ▶
    case 'HAND_END':
      return '\u25A0'; // ■
    case 'SHOWDOWN':
      return '\u2605'; // ★
    case 'POST_BLIND':
      return '\u25CF'; // ●
    case 'DEAL_HOLE':
      return '\u2660'; // ♠
    case 'DEAL_COMMUNITY':
      return '\u2663'; // ♣
    case 'STREET_START':
      return '\u25B7'; // ▷
    case 'FOLD':
      return '\u2717'; // ✗
    case 'CHECK':
      return '\u2713'; // ✓
    case 'CALL':
      return '\u2192'; // →
    case 'BET':
      return '\u25B2'; // ▲
    case 'RAISE':
      return '\u25B2'; // ▲
    case 'ALL_IN':
      return '\u2B24'; // ⬤
    default:
      return '\u25CB'; // ○
  }
}

/**
 * 格式化事件为可读描述
 * 纯函数：无副作用
 */
function formatEventDescription(event: TimelineEventInfo): string {
  switch (event.type) {
    case 'HAND_START':
      return `Hand #${event.handId?.slice(-3) || '???'}`;
    case 'HAND_END':
      return event.reason === 'SHOWDOWN' ? 'Showdown End' : 'All Fold';
    case 'SHOWDOWN':
      return 'Showdown';
    case 'POST_BLIND':
      return `${event.blindType} $${event.amount}`;
    case 'DEAL_HOLE':
      return 'Deal Hole';
    case 'DEAL_COMMUNITY':
      return `Deal ${event.phase}`;
    case 'STREET_START':
      return `${event.street}`;
    case 'FOLD':
      return 'Fold';
    case 'CHECK':
      return 'Check';
    case 'CALL':
      return `Call $${event.amount}`;
    case 'BET':
      return `Bet $${event.amount}`;
    case 'RAISE':
      return `Raise $${event.amount}`;
    case 'ALL_IN':
      return `All-In $${event.amount}`;
    default:
      return event.type;
  }
}

/**
 * 获取事件涉及的玩家名（简写）
 * 纯函数：无副作用
 */
function getPlayerLabel(event: TimelineEventInfo): string | null {
  if (!event.playerId) return null;
  // 取玩家 ID 的首字母大写
  return event.playerId.charAt(0).toUpperCase();
}

// ============================================================================
// TimelineItem 子组件（纯展示）
// ============================================================================

interface TimelineItemProps {
  readonly event: TimelineEventInfo;
  readonly index: number;
  readonly isActive: boolean;
  readonly onClick: () => void;
}

function TimelineItem({ event, index, isActive, onClick }: TimelineItemProps) {
  const color = getEventColor(event.type);
  const icon = getEventIcon(event.type);
  const description = formatEventDescription(event);
  const playerLabel = getPlayerLabel(event);

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 10px',
        cursor: 'pointer',
        background: isActive
          ? 'rgba(74, 222, 128, 0.15)'
          : 'transparent',
        borderLeft: isActive
          ? '3px solid #4ade80'
          : '3px solid transparent',
        borderRadius: '0 4px 4px 0',
        transition: 'all 0.15s ease',
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          e.currentTarget.style.background = 'transparent';
        }
      }}
    >
      {/* 序号 */}
      <span
        style={{
          width: 20,
          fontSize: 9,
          color: isActive ? '#4ade80' : '#666',
          textAlign: 'right',
          fontFamily: 'monospace',
        }}
      >
        {index}
      </span>

      {/* 图标 */}
      <span
        style={{
          width: 16,
          textAlign: 'center',
          fontSize: 12,
          color: color,
        }}
      >
        {icon}
      </span>

      {/* 玩家标签（如有） */}
      {playerLabel && (
        <span
          style={{
            width: 18,
            height: 18,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 10,
            fontWeight: 700,
            color: '#fff',
            background: color,
            borderRadius: '50%',
          }}
        >
          {playerLabel}
        </span>
      )}

      {/* 事件描述 */}
      <span
        style={{
          flex: 1,
          fontSize: 11,
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
            fontSize: 8,
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

// ============================================================================
// ActionTimelinePanel 主组件
// ============================================================================

/**
 * ActionTimelinePanel - 事件时间线面板
 *
 * 【架构合规性声明】
 * - 纯 UI 组件，只读 props，无内部状态修改
 * - 不 import src/replay/** 或 src/commands/**
 * - 不调用 EventProcessor
 * - 不构造或修改 ReplayEvent
 * - 仅调用 onSeek(index)，这是 actions.seek 的透传
 * - 符合 Replay Architecture Freeze Declaration v1.0
 */
export function ActionTimelinePanel({
  events,
  currentIndex,
  onSeek,
  maxHeight = 300,
}: ActionTimelinePanelProps) {
  // ========================================
  // 无效状态：不渲染
  // ========================================
  if (events.length === 0) {
    return (
      <div
        style={{
          padding: '12px',
          background: 'rgba(100, 100, 100, 0.1)',
          border: '1px solid rgba(100, 100, 100, 0.3)',
          borderRadius: 6,
          fontSize: 11,
          color: '#666',
          textAlign: 'center',
        }}
      >
        No events to display
      </div>
    );
  }

  // ========================================
  // 纯展示渲染
  // ========================================
  return (
    <div
      style={{
        background: 'rgba(59, 130, 246, 0.08)',
        border: '1px solid rgba(59, 130, 246, 0.25)',
        borderRadius: 6,
        overflow: 'hidden',
      }}
    >
      {/* 标题栏 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px 12px',
          borderBottom: '1px solid rgba(59, 130, 246, 0.2)',
          background: 'rgba(59, 130, 246, 0.05)',
        }}
      >
        <span
          style={{
            fontSize: 9,
            color: '#60a5fa',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            fontWeight: 600,
          }}
        >
          Event Timeline
        </span>
        <span
          style={{
            fontSize: 10,
            color: '#93c5fd',
          }}
        >
          {currentIndex + 1} / {events.length}
        </span>
      </div>

      {/* 事件列表（可滚动） */}
      <div
        style={{
          maxHeight: maxHeight,
          overflowY: 'auto',
          overflowX: 'hidden',
        }}
      >
        {events.map((event, index) => (
          <TimelineItem
            key={index}
            event={event}
            index={index}
            isActive={index === currentIndex}
            onClick={() => onSeek(index)}
          />
        ))}
      </div>

      {/* 底部提示 */}
      <div
        style={{
          padding: '6px 12px',
          borderTop: '1px solid rgba(59, 130, 246, 0.2)',
          fontSize: 9,
          color: '#6b8cba',
          textAlign: 'center',
          fontStyle: 'italic',
        }}
      >
        Click event to seek
      </div>
    </div>
  );
}
