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
// HandNarrativePanel - Hand Narrative Summary (Read-Only UI)
// ============================================================================
//
// 【Post-Freeze Extension】Replay Architecture Freeze Declaration v1.0 Compliant
// 【Post-Model Integration】Consumes DecisionTimelineModel for consistency
//
// 层级: UI Layer (纯展示)
// 职责: 生成手牌的叙事性总结，以散文形式讲述手牌故事
//
// 数据流:
//   events + players → DecisionTimelineModel → DecisionTimeline → Prose Narrative
//
// 约束:
//   - 只读 props，无内部状态
//   - 不 import src/replay/** 或 src/commands/**
//   - 不调用 EventProcessor
//   - 不构造 ReplayEvent
//   - 不使用 React Hooks（纯函数组件）
//   - 不对比 snapshot diff，直接从事件推导叙事
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
//   - H-3 无副作用: 使用纯函数进行格式化
//   - H-4 值语义: 不修改任何值
//
// ============================================================================

import React from 'react';

// ============================================================================
// 从 DecisionTimelineModel 导入共享类型和函数
// ============================================================================

import {
  buildDecisionTimeline,
  buildPlayerNameMap,
  getPlayerName,
  type EventInfo,
  type PlayerInfo,
  type DecisionTimeline,
  type DecisionPoint,
  type StreetPhase,
} from '../models/DecisionTimelineModel';

import {
  calculateVolatilityMetrics,
  calculateRiskEscalationCurve,
  getTurningPointDecisions,
  getAggressiveDecisions,
  detectBettingPattern,
  analyzeByStreet,
  generateHandAnalysisReport,
  type VolatilityMetrics,
  type RiskEscalationPoint,
  type BettingPattern,
  type StreetAnalysis,
  type HandAnalysisReport,
} from '../models/DecisionTimelineQueries';

// ============================================================================
// 本地类型定义（仅用于叙事特有的结构）
// ============================================================================

/**
 * 卡牌形状描述（只读）- 用于公共牌展示
 */
interface CardInfo {
  readonly suit: string;
  readonly rank: string;
}

/**
 * 赢家信息形状描述（只读）
 */
interface WinnerInfo {
  readonly playerId: string;
  readonly amount: number;
  readonly handRank?: string;
}

/**
 * 扩展事件信息（包含卡牌等叙事特有字段）
 */
interface NarrativeEventInfo extends EventInfo {
  readonly cards?: readonly CardInfo[];
  readonly players?: readonly { id: string; name: string; seat: number }[];
  readonly winners?: readonly WinnerInfo[];
  readonly dealerSeat?: number;
  readonly smallBlind?: number;
  readonly bigBlind?: number;
  readonly reason?: string;
  readonly handId?: string;
}

/**
 * 快照玩家信息形状描述（只读）
 */
interface SnapshotPlayerInfo {
  readonly id: string;
  readonly name: string;
  readonly seat?: number;
}

/**
 * HandNarrativePanel Props
 */
interface HandNarrativePanelProps {
  /** 事件序列（只读） */
  readonly events: readonly NarrativeEventInfo[];
  /** 当前索引（决定叙述范围） */
  readonly currentIndex: number;
  /** 玩家列表（用于 ID → 名称映射，只读） */
  readonly players: readonly SnapshotPlayerInfo[];
  /** 可选：面板标题 */
  readonly title?: string;
  /** 可选：是否紧凑模式 */
  readonly compact?: boolean;
  /** 可选：最大显示段落数 */
  readonly maxParagraphs?: number;
}

// ============================================================================
// 叙事段落类型（本地定义，用于手牌级别叙事）
// ============================================================================

/**
 * 叙事段落
 */
interface NarrativeParagraph {
  readonly type: 'opening' | 'blinds' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'conclusion';
  readonly text: string;
  readonly highlight?: boolean;
}

// ============================================================================
// 常量
// ============================================================================

/**
 * 街道名称映射
 */
const STREET_NAMES: Record<string, string> = {
  PREFLOP: 'preflop',
  FLOP: 'the flop',
  TURN: 'the turn',
  RIVER: 'the river',
};

// ============================================================================
// 纯函数：卡牌格式化（本地保留，叙事特有）
// ============================================================================

/**
 * 格式化卡牌显示（纯函数）
 */
function formatCard(card: CardInfo): string {
  const suitSymbols: Record<string, string> = {
    S: '\u2660', // ♠
    H: '\u2665', // ♥
    D: '\u2666', // ♦
    C: '\u2663', // ♣
  };
  return `${card.rank}${suitSymbols[card.suit] ?? card.suit}`;
}

/**
 * 格式化多张卡牌（纯函数）
 */
function formatCards(cards: readonly CardInfo[] | undefined): string {
  if (!cards || cards.length === 0) return '';
  return cards.map(formatCard).join(' ');
}

/**
 * 获取特定街道的公共牌（纯函数）
 */
function getCardsForStreet(street: string, allCards: readonly CardInfo[]): readonly CardInfo[] {
  switch (street) {
    case 'FLOP':
      return allCards.slice(0, Math.min(3, allCards.length));
    case 'TURN':
      return allCards.length > 3 ? [allCards[3]] : [];
    case 'RIVER':
      return allCards.length > 4 ? [allCards[4]] : [];
    default:
      return [];
  }
}

// ============================================================================
// 纯函数：从 DecisionTimeline 构建叙事
// ============================================================================

/**
 * 从 DecisionPoint 提取叙事描述
 * 使用 DecisionTimelineModel 的 narrative context
 * 防御性：确保 decision 和 narrative 存在
 */
function getDecisionNarrative(decision: DecisionPoint | null | undefined): string {
  if (!decision) return '';
  const narrative = decision.narrative;
  if (!narrative) return '';
  return typeof narrative.sentence === 'string' ? narrative.sentence : '';
}

/**
 * 按街道分组决策点
 * 防御性：确保 timeline 是有效数组
 */
function groupDecisionsByStreet(
  timeline: DecisionTimeline
): Map<StreetPhase, readonly DecisionPoint[]> {
  const groups = new Map<StreetPhase, DecisionPoint[]>();

  // 防御性检查
  if (!Array.isArray(timeline)) return groups;

  for (const decision of timeline) {
    // 防御性检查每个 decision
    if (!decision || typeof decision.street !== 'string') continue;

    const street = decision.street;
    if (!groups.has(street)) {
      groups.set(street, []);
    }
    groups.get(street)?.push(decision);
  }

  return groups;
}

/**
 * 生成手牌叙事（纯函数）
 * 使用 DecisionTimeline 作为决策数据源
 * 防御性：确保所有输入参数有效
 */
function generateNarrative(
  events: readonly NarrativeEventInfo[],
  currentIndex: number,
  playerNames: Map<string, string>,
  timeline: DecisionTimeline
): readonly NarrativeParagraph[] {
  const paragraphs: NarrativeParagraph[] = [];

  // 防御性检查：确保 events 是有效数组
  if (!Array.isArray(events) || events.length === 0) {
    return paragraphs;
  }

  const safeIndex = typeof currentIndex === 'number' && currentIndex >= 0 ? currentIndex : 0;
  const relevantEvents = events.slice(0, safeIndex + 1);

  if (relevantEvents.length === 0) {
    return paragraphs;
  }

  // Track non-decision state for narrative building
  let handStarted = false;
  let blindsPosted = false;
  let communityCards: CardInfo[] = [];
  let handEnded = false;
  let winnersInfo: WinnerInfo[] = [];
  let handEndReason: string | undefined;
  let allInPlayers: string[] = [];

  // Process events for non-decision narrative elements
  for (const event of relevantEvents) {
    // 防御性检查：确保 event 存在且有 type
    if (!event || typeof event.type !== 'string') continue;

    switch (event.type) {
      case 'HAND_START':
        handStarted = true;
        break;

      case 'POST_BLIND':
        blindsPosted = true;
        break;

      case 'DEAL_COMMUNITY':
        if (Array.isArray(event.cards)) {
          communityCards = [...communityCards, ...event.cards];
        }
        break;

      case 'ALL_IN':
        if (event.playerId) {
          allInPlayers.push(getPlayerName(event.playerId, playerNames));
        }
        break;

      case 'HAND_END':
        handEnded = true;
        if (Array.isArray(event.winners)) {
          winnersInfo = [...event.winners];
        }
        if (typeof event.reason === 'string') {
          handEndReason = event.reason;
        }
        break;
    }
  }

  // Generate opening paragraph
  if (handStarted) {
    const handStartEvent = relevantEvents.find(e => e.type === 'HAND_START');
    if (handStartEvent) {
      const playerCount = handStartEvent.players?.length ?? 0;
      const blindsText = handStartEvent.smallBlind && handStartEvent.bigBlind
        ? ` with blinds at $${handStartEvent.smallBlind}/$${handStartEvent.bigBlind}`
        : '';
      paragraphs.push({
        type: 'opening',
        text: `A new hand begins with ${playerCount} players at the table${blindsText}.`,
      });
    }
  }

  // Generate blinds paragraph
  if (blindsPosted) {
    const blindEvents = relevantEvents.filter(e => e.type === 'POST_BLIND');
    if (blindEvents.length > 0) {
      const blindActions = blindEvents.map(e => {
        const playerName = getPlayerName(e.playerId, playerNames);
        const blindType = e.blindType === 'SB' ? 'small blind' : 'big blind';
        return `${playerName} posts the ${blindType} ($${e.amount})`;
      });
      paragraphs.push({
        type: 'blinds',
        text: blindActions.join(' and ') + '.',
      });
    }
  }

  // Generate street paragraphs using DecisionTimeline
  // 防御性检查：确保 timeline 是有效数组
  const safeTimeline = Array.isArray(timeline) ? timeline : [];
  const decisionsByStreet = groupDecisionsByStreet(safeTimeline);
  const streetOrder: StreetPhase[] = ['PREFLOP', 'FLOP', 'TURN', 'RIVER'];

  for (const street of streetOrder) {
    const decisions = decisionsByStreet.get(street);
    if (!decisions || decisions.length === 0) continue;

    // Filter decisions within current index range
    const relevantDecisions = decisions.filter(d => d && typeof d.index === 'number' && d.index <= safeIndex);
    if (relevantDecisions.length === 0) continue;

    // Get action sentences from DecisionTimeline narrative context
    // 防御性：过滤空字符串
    const actions = relevantDecisions
      .filter(d => d?.actionClass !== 'post-blind') // Blinds handled separately
      .map(d => {
        const narrative = getDecisionNarrative(d);
        // 防御性：确保 narrative 是字符串
        return typeof narrative === 'string' ? narrative.replace(/\.$/, '') : '';
      })
      .filter(a => a.length > 0); // 过滤空字符串

    if (actions.length === 0) continue;

    const streetName = STREET_NAMES[street] ?? street.toLowerCase();
    let streetText = '';

    // Add community cards for flop/turn/river
    if (street === 'FLOP' || street === 'TURN' || street === 'RIVER') {
      const cardsForStreet = getCardsForStreet(street, communityCards);
      if (cardsForStreet.length > 0) {
        streetText = `${streetName.charAt(0).toUpperCase() + streetName.slice(1)} comes ${formatCards(cardsForStreet)}. `;
      }
    }

    // Build prose from action sentences
    // 防御性：安全访问字符串
    const safeCharAt = (s: string | undefined, fallback: string = ''): string => {
      if (!s || s.length === 0) return fallback;
      return s.charAt(0).toLowerCase() + s.slice(1);
    };

    if (actions.length === 1) {
      streetText += `On ${streetName}, ${safeCharAt(actions[0])}.`;
    } else if (actions.length === 2) {
      streetText += `On ${streetName}, ${safeCharAt(actions[0])}, then ${safeCharAt(actions[1])}.`;
    } else {
      // actions.length >= 3，安全访问最后一个元素
      const lastAction = actions[actions.length - 1] ?? '';
      const otherActions = actions.slice(0, -1).map(a => safeCharAt(a)).join(', ');
      streetText += `On ${streetName}, ${otherActions}, and finally ${safeCharAt(lastAction)}.`;
    }

    paragraphs.push({
      type: street.toLowerCase() as NarrativeParagraph['type'],
      text: streetText,
    });
  }

  // Generate conclusion paragraph if hand ended
  if (handEnded && winnersInfo.length > 0) {
    let conclusionText = '';
    if (winnersInfo.length === 1) {
      const winner = winnersInfo[0];
      // 防御性检查 winner 对象
      if (winner) {
        const winnerName = getPlayerName(winner.playerId ?? '', playerNames);
        const winnerAmount = typeof winner.amount === 'number' ? winner.amount : 0;
        const handInfo = typeof winner.handRank === 'string' ? ` with ${winner.handRank}` : '';
        if (handEndReason === 'ALL_FOLD') {
          conclusionText = `${winnerName} takes the pot of $${winnerAmount} as all opponents have folded.`;
        } else {
          conclusionText = `${winnerName} wins the pot of $${winnerAmount}${handInfo}.`;
        }
      }
    } else {
      const winnerDescs = winnersInfo
        .filter(w => w != null) // 防御性过滤
        .map(w => {
          const name = getPlayerName(w.playerId ?? '', playerNames);
          const amount = typeof w.amount === 'number' ? w.amount : 0;
          const handInfo = typeof w.handRank === 'string' ? ` (${w.handRank})` : '';
          return `${name} wins $${amount}${handInfo}`;
        });
      if (winnerDescs.length > 0) {
        conclusionText = `The pot is split: ${winnerDescs.join('; ')}.`;
      }
    }
    if (conclusionText) {
      paragraphs.push({
        type: 'conclusion',
        text: conclusionText,
        highlight: true,
      });
    }
  }

  // Add drama elements for all-in
  if (allInPlayers.length > 0 && !handEnded) {
    const allInText = allInPlayers.length === 1
      ? `${allInPlayers[0]} has gone all-in!`
      : `${allInPlayers.join(' and ')} have gone all-in!`;
    const insertIndex = paragraphs.findIndex(p => p.type === 'conclusion');
    if (insertIndex >= 0) {
      paragraphs.splice(insertIndex, 0, {
        type: 'showdown',
        text: allInText,
        highlight: true,
      });
    }
  }

  return paragraphs;
}

// ============================================================================
// 纯函数：UI 格式化
// ============================================================================

/**
 * 获取段落类型颜色（纯函数）
 */
function getParagraphColor(type: NarrativeParagraph['type']): string {
  const colors: Record<NarrativeParagraph['type'], string> = {
    opening: '#22c55e',
    blinds: '#8b5cf6',
    preflop: '#3b82f6',
    flop: '#06b6d4',
    turn: '#f59e0b',
    river: '#ef4444',
    showdown: '#f97316',
    conclusion: '#ffd700',
  };
  return colors[type] ?? '#888';
}

/**
 * 获取段落类型标签（纯函数）
 */
function getParagraphLabel(type: NarrativeParagraph['type']): string {
  const labels: Record<NarrativeParagraph['type'], string> = {
    opening: 'START',
    blinds: 'BLINDS',
    preflop: 'PREFLOP',
    flop: 'FLOP',
    turn: 'TURN',
    river: 'RIVER',
    showdown: 'ACTION',
    conclusion: 'RESULT',
  };
  return labels[type] ?? type.toUpperCase();
}

// ============================================================================
// Extended Narrative Components (Feature Expansion Phase)
// ============================================================================

/**
 * Story arc type for dramatic tension tracking
 */
type StoryArc = 'rising' | 'climax' | 'falling' | 'resolution' | 'flat';

/**
 * Calculate story arc from volatility and escalation data
 */
function calculateStoryArc(
  volatility: VolatilityMetrics,
  escalation: readonly RiskEscalationPoint[],
  handEnded: boolean
): StoryArc {
  if (handEnded) return 'resolution';
  if (!escalation || escalation.length === 0) return 'flat';

  const lastPoint = escalation[escalation.length - 1];
  const midPoint = escalation[Math.floor(escalation.length / 2)];

  // Defensive: ensure points exist before accessing properties
  if (!lastPoint || !midPoint) return 'flat';

  // Defensive: ensure cumulativeRisk exists
  const lastRisk = typeof lastPoint.cumulativeRisk === 'number' ? lastPoint.cumulativeRisk : 0;
  const midRisk = typeof midPoint.cumulativeRisk === 'number' ? midPoint.cumulativeRisk : 0;

  if (lastRisk > 70) return 'climax';
  if (lastRisk > midRisk) return 'rising';
  if (lastRisk < midRisk) return 'falling';

  // Defensive: check volatility exists
  const volScore = typeof volatility?.volatilityScore === 'number' ? volatility.volatilityScore : 0;
  return volScore > 50 ? 'rising' : 'flat';
}

/**
 * Get dramatic descriptor for story arc
 */
function getArcDescriptor(arc: StoryArc): string {
  const descriptors: Record<StoryArc, string> = {
    rising: 'Tension Building',
    climax: 'Peak Moment',
    falling: 'Winding Down',
    resolution: 'Concluded',
    flat: 'Developing',
  };
  return descriptors[arc];
}

/**
 * Get color for story arc
 */
function getArcColor(arc: StoryArc): string {
  const colors: Record<StoryArc, string> = {
    rising: '#f59e0b',
    climax: '#ef4444',
    falling: '#3b82f6',
    resolution: '#22c55e',
    flat: '#6b7280',
  };
  return colors[arc];
}

interface DramaticArcViewProps {
  readonly volatility: VolatilityMetrics;
  readonly escalation: readonly RiskEscalationPoint[];
  readonly handEnded: boolean;
  readonly compact?: boolean;
}

function DramaticArcView({
  volatility,
  escalation,
  handEnded,
  compact = false,
}: DramaticArcViewProps) {
  const arc = calculateStoryArc(volatility, escalation, handEnded);
  const arcColor = getArcColor(arc);
  const arcDesc = getArcDescriptor(arc);

  // Defensive: extract with fallbacks
  const volatilityScore = typeof volatility?.volatilityScore === 'number' ? volatility.volatilityScore : 0;
  const volatilityLabel = typeof volatility?.volatilityLabel === 'string' ? volatility.volatilityLabel : 'stable';
  const tensionPercent = Math.min(100, Math.max(0, volatilityScore));

  return (
    <div
      style={{
        marginBottom: compact ? 12 : 16,
        padding: compact ? '8px 10px' : '10px 14px',
        background: `${arcColor}10`,
        border: `1px solid ${arcColor}30`,
        borderRadius: 6,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: compact ? 6 : 8,
        }}
      >
        <div
          style={{
            fontSize: compact ? 9 : 10,
            color: arcColor,
            fontWeight: 700,
            textTransform: 'uppercase',
          }}
        >
          Story Arc
        </div>
        <div
          style={{
            padding: '2px 8px',
            background: `${arcColor}20`,
            borderRadius: 4,
            fontSize: compact ? 10 : 11,
            fontWeight: 600,
            color: arcColor,
          }}
        >
          {arcDesc}
        </div>
      </div>

      {/* Tension meter */}
      <div
        style={{
          height: compact ? 6 : 8,
          background: 'rgba(100, 100, 100, 0.2)',
          borderRadius: 4,
          overflow: 'hidden',
          marginBottom: compact ? 6 : 8,
        }}
      >
        <div
          style={{
            width: `${tensionPercent}%`,
            height: '100%',
            background: `linear-gradient(90deg, #22c55e, ${arcColor})`,
            transition: 'width 0.3s ease',
          }}
        />
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: compact ? 8 : 9,
          color: '#888',
        }}
      >
        <span>Tension: {tensionPercent}%</span>
        <span>State: {volatilityLabel}</span>
      </div>
    </div>
  );
}

interface KeyMomentsViewProps {
  readonly turningPoints: readonly DecisionPoint[];
  readonly aggressive: readonly DecisionPoint[];
  readonly compact?: boolean;
}

function KeyMomentsView({
  turningPoints,
  aggressive,
  compact = false,
}: KeyMomentsViewProps) {
  // 防御性检查：确保输入是有效数组
  const safeTurningPoints = Array.isArray(turningPoints) ? turningPoints : [];
  const safeAggressive = Array.isArray(aggressive) ? aggressive : [];

  const keyMoments = [
    ...safeTurningPoints.filter(tp => tp != null).map(tp => ({ ...tp, momentType: 'turning' as const })),
    ...safeAggressive.slice(0, 3).filter(a => a != null).map(a => ({ ...a, momentType: 'aggressive' as const })),
  ].sort((a, b) => {
    // 防御性排序：确保 index 是数字
    const aIndex = typeof a.index === 'number' ? a.index : 0;
    const bIndex = typeof b.index === 'number' ? b.index : 0;
    return aIndex - bIndex;
  });

  if (keyMoments.length === 0) {
    return (
      <div
        style={{
          padding: compact ? '8px 10px' : '10px 12px',
          background: 'rgba(100, 100, 100, 0.1)',
          borderRadius: 6,
          fontSize: compact ? 10 : 11,
          color: '#666',
          fontStyle: 'italic',
          marginBottom: compact ? 12 : 16,
        }}
      >
        No key moments identified yet
      </div>
    );
  }

  return (
    <div style={{ marginBottom: compact ? 12 : 16 }}>
      <div
        style={{
          fontSize: compact ? 9 : 10,
          color: '#f97316',
          fontWeight: 700,
          textTransform: 'uppercase',
          marginBottom: compact ? 6 : 8,
        }}
      >
        Key Moments ({keyMoments.length})
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 6 : 8 }}>
        {keyMoments.slice(0, 5).map((moment, idx) => {
          const isTurning = moment.momentType === 'turning';
          const color = isTurning ? '#f43f5e' : '#f59e0b';

          return (
            <div
              key={idx}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: compact ? '6px 8px' : '8px 10px',
                background: `${color}10`,
                borderLeft: `3px solid ${color}`,
                borderRadius: '0 4px 4px 0',
              }}
            >
              <span
                style={{
                  padding: '2px 6px',
                  background: `${color}20`,
                  borderRadius: 3,
                  fontSize: compact ? 7 : 8,
                  fontWeight: 700,
                  color: color,
                  textTransform: 'uppercase',
                }}
              >
                {isTurning ? 'PIVOT' : 'PUSH'}
              </span>
              <span
                style={{
                  fontSize: compact ? 9 : 10,
                  color: '#d0d0d0',
                }}
              >
                <strong style={{ color: '#f472b6' }}>
                  {typeof moment.playerName === 'string' ? moment.playerName : 'Unknown'}
                </strong>{' '}
                {typeof moment.actionClass === 'string' ? moment.actionClass : 'action'}
                {typeof moment.amount === 'number' && moment.amount > 0 ? ` $${moment.amount}` : ''}
              </span>
              <span
                style={{
                  marginLeft: 'auto',
                  fontSize: compact ? 8 : 9,
                  color: '#888',
                }}
              >
                {typeof moment.street === 'string' ? moment.street : ''}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface StreetSummaryViewProps {
  readonly streetAnalyses: readonly StreetAnalysis[];
  readonly compact?: boolean;
}

function StreetSummaryView({
  streetAnalyses,
  compact = false,
}: StreetSummaryViewProps) {
  // 防御性检查：确保输入是有效数组
  const safeStreetAnalyses = Array.isArray(streetAnalyses) ? streetAnalyses : [];
  if (safeStreetAnalyses.length === 0) return null;

  return (
    <div style={{ marginBottom: compact ? 12 : 16 }}>
      <div
        style={{
          fontSize: compact ? 9 : 10,
          color: '#06b6d4',
          fontWeight: 700,
          textTransform: 'uppercase',
          marginBottom: compact ? 6 : 8,
        }}
      >
        Street-by-Street Summary
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 4 : 6 }}>
        {safeStreetAnalyses.map((analysis, idx) => {
          // 防御性检查：确保 analysis 存在
          if (!analysis) return null;

          const streetColors: Record<string, string> = {
            PREFLOP: '#3b82f6',
            FLOP: '#06b6d4',
            TURN: '#f59e0b',
            RIVER: '#ef4444',
          };
          const streetValue = typeof analysis.street === 'string' ? analysis.street : '';
          const color = streetColors[streetValue] ?? '#888';

          // Defensive: extract fields with fallbacks
          const decisionCount = typeof analysis.decisionCount === 'number' ? analysis.decisionCount : 0;
          const aggressionRate = typeof analysis.aggressionRate === 'number' ? analysis.aggressionRate : 0;
          const alignmentRate = typeof analysis.alignmentRate === 'number' ? analysis.alignmentRate : 0;

          return (
            <div
              key={idx}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: compact ? 8 : 10,
                padding: compact ? '6px 8px' : '8px 10px',
                background: `${color}08`,
                borderRadius: 4,
              }}
            >
              <span
                style={{
                  minWidth: compact ? 50 : 60,
                  fontSize: compact ? 9 : 10,
                  fontWeight: 700,
                  color: color,
                  textTransform: 'uppercase',
                }}
              >
                {streetValue || 'UNKNOWN'}
              </span>
              <span
                style={{
                  fontSize: compact ? 9 : 10,
                  color: '#9ca3af',
                }}
              >
                {decisionCount} actions
              </span>
              <span
                style={{
                  fontSize: compact ? 9 : 10,
                  color: aggressionRate > 50 ? '#f59e0b' : '#3b82f6',
                }}
              >
                Aggr: {Math.round(aggressionRate)}%
              </span>
              <span
                style={{
                  marginLeft: 'auto',
                  fontSize: compact ? 8 : 9,
                  color: alignmentRate > 70 ? '#22c55e' : '#888',
                }}
              >
                Align: {Math.round(alignmentRate)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface PatternNarrativeViewProps {
  readonly pattern: BettingPattern | null;
  readonly compact?: boolean;
}

function PatternNarrativeView({
  pattern,
  compact = false,
}: PatternNarrativeViewProps) {
  // Defensive: pattern is null or undefined
  if (!pattern) {
    return (
      <div
        style={{
          padding: compact ? '8px 10px' : '10px 12px',
          background: 'rgba(100, 100, 100, 0.1)',
          borderRadius: 6,
          fontSize: compact ? 10 : 11,
          color: '#666',
          fontStyle: 'italic',
          marginBottom: compact ? 12 : 16,
        }}
      >
        Not enough data to identify betting patterns
      </div>
    );
  }

  // Defensive: extract fields with fallbacks (BettingPattern uses patternType, patternDescription, supportingEvidence)
  const patternName = typeof pattern.patternType === 'string' ? pattern.patternType : 'balanced';
  const confidenceLevel = typeof pattern.confidence === 'string' ? pattern.confidence : 'low';
  const description = typeof pattern.patternDescription === 'string' ? pattern.patternDescription : 'Pattern analysis unavailable';
  const indicators = Array.isArray(pattern.supportingEvidence) ? pattern.supportingEvidence : [];

  const patternColors: Record<string, string> = {
    'value-heavy': '#22c55e',
    'bluff-heavy': '#ef4444',
    'balanced': '#3b82f6',
    'polarized': '#f59e0b',
    'merged': '#a78bfa',
    'passive': '#6b7280',
    'unknown': '#888',
  };
  const color = patternColors[patternName] || '#888';

  // Confidence display (string to readable format)
  const confidenceDisplay = confidenceLevel.charAt(0).toUpperCase() + confidenceLevel.slice(1);

  // Defensive: format pattern name safely
  const displayPatternName = patternName.replace(/-/g, ' ');

  return (
    <div style={{ marginBottom: compact ? 12 : 16 }}>
      <div
        style={{
          fontSize: compact ? 9 : 10,
          color: '#a78bfa',
          fontWeight: 700,
          textTransform: 'uppercase',
          marginBottom: compact ? 6 : 8,
        }}
      >
        Betting Pattern Analysis
      </div>

      <div
        style={{
          padding: compact ? '10px 12px' : '12px 14px',
          background: `${color}10`,
          border: `1px solid ${color}30`,
          borderRadius: 6,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: compact ? 6 : 8,
          }}
        >
          <span
            style={{
              padding: '3px 10px',
              background: `${color}20`,
              borderRadius: 4,
              fontSize: compact ? 10 : 12,
              fontWeight: 700,
              color: color,
              textTransform: 'uppercase',
            }}
          >
            {displayPatternName}
          </span>
          <span
            style={{
              fontSize: compact ? 9 : 10,
              color: '#888',
            }}
          >
            Confidence: {confidenceDisplay}
          </span>
        </div>

        <div
          style={{
            fontSize: compact ? 10 : 11,
            color: '#d0d0d0',
            lineHeight: 1.5,
          }}
        >
          {description}
        </div>

        {/* Pattern indicators */}
        {indicators.length > 0 && (
          <div
            style={{
              display: 'flex',
              gap: compact ? 6 : 8,
              marginTop: compact ? 8 : 10,
            }}
          >
            {indicators.slice(0, 3).map((indicator, idx) => (
              <span
                key={idx}
                style={{
                  padding: '2px 6px',
                  background: 'rgba(100, 100, 100, 0.2)',
                  borderRadius: 3,
                  fontSize: compact ? 8 : 9,
                  color: '#aaa',
                }}
              >
                {typeof indicator === 'string' ? indicator : String(indicator)}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface HandReportSummaryViewProps {
  readonly report: HandAnalysisReport;
  readonly compact?: boolean;
}

function HandReportSummaryView({
  report,
  compact = false,
}: HandReportSummaryViewProps) {
  // Defensive: extract fields with fallbacks
  const overallSummary = typeof report.overallSummary === 'string' ? report.overallSummary : 'No summary available';
  const leaks = Array.isArray(report.leaks) ? report.leaks : [];
  const turningPoints = Array.isArray(report.turningPoints) ? report.turningPoints : [];

  return (
    <div style={{ marginBottom: compact ? 12 : 16 }}>
      <div
        style={{
          fontSize: compact ? 9 : 10,
          color: '#22c55e',
          fontWeight: 700,
          textTransform: 'uppercase',
          marginBottom: compact ? 6 : 8,
        }}
      >
        Hand Analysis Summary
      </div>

      {/* Overall Summary */}
      <div
        style={{
          padding: compact ? '10px 12px' : '12px 14px',
          background: 'rgba(34, 197, 94, 0.08)',
          border: '1px solid rgba(34, 197, 94, 0.2)',
          borderRadius: 6,
          marginBottom: compact ? 8 : 10,
        }}
      >
        <div
          style={{
            fontSize: compact ? 11 : 13,
            color: '#d0d0d0',
            lineHeight: 1.6,
            fontStyle: 'italic',
          }}
        >
          "{overallSummary}"
        </div>
      </div>

      {/* Potential Leaks */}
      {leaks.length > 0 && (
        <div style={{ marginBottom: compact ? 8 : 10 }}>
          <div
            style={{
              fontSize: compact ? 8 : 9,
              color: '#888',
              textTransform: 'uppercase',
              marginBottom: compact ? 4 : 6,
            }}
          >
            Potential Leaks Identified
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {leaks.slice(0, 4).map((leak, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 6,
                  fontSize: compact ? 10 : 11,
                  color: '#9ca3af',
                }}
              >
                <span style={{ color: '#f59e0b' }}>•</span>
                <span>{typeof leak.description === 'string' ? leak.description : 'Unknown leak'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Turning Points */}
      {turningPoints.length > 0 && (
        <div>
          <div
            style={{
              fontSize: compact ? 8 : 9,
              color: '#888',
              textTransform: 'uppercase',
              marginBottom: compact ? 4 : 6,
            }}
          >
            Key Turning Points
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {turningPoints.slice(0, 3).map((point, idx) => {
              // 防御性检查：确保 point 存在且有必要属性
              if (!point) return null;
              const streetValue = typeof point.street === 'string' ? point.street : '';
              const actionValue = typeof point.actionClass === 'string' ? point.actionClass : 'action';
              const playerValue = typeof point.playerName === 'string' ? point.playerName : 'Unknown';

              return (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 6,
                    fontSize: compact ? 10 : 11,
                    color: '#9ca3af',
                  }}
                >
                  <span style={{ color: '#22c55e' }}>→</span>
                  <span>{streetValue}: {actionValue} by {playerValue}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// HandNarrativePanel - Main Component
// ============================================================================

export function HandNarrativePanel({
  events,
  currentIndex,
  players,
  title = 'Hand Narrative',
  compact = false,
  maxParagraphs = 10,
}: HandNarrativePanelProps) {
  // ========================================
  // 防御性检查：确保 events 和 players 是有效数组
  // ========================================
  const safeEvents = Array.isArray(events) ? events : [];
  const safePlayers = Array.isArray(players) ? players : [];
  const safeCurrentIndex = typeof currentIndex === 'number' && currentIndex >= 0 ? currentIndex : 0;

  // ========================================
  // 边界检查：无事件时显示空状态
  // ========================================
  if (safeEvents.length === 0) {
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
        No hand data to narrate
      </div>
    );
  }

  // ========================================
  // 从 DecisionTimelineModel 构建数据
  // ========================================
  const playerInfos: PlayerInfo[] = safePlayers.map(p => ({
    id: p?.id ?? '',
    name: p?.name ?? 'Unknown',
    seat: p?.seat,
  }));

  const playerNames = buildPlayerNameMap(playerInfos);
  const timeline = buildDecisionTimeline(safeEvents, playerInfos, 0);
  const safeTimeline = Array.isArray(timeline) ? timeline : [];

  // ========================================
  // 纯函数计算：生成叙事段落
  // ========================================
  const paragraphs = generateNarrative(safeEvents, safeCurrentIndex, playerNames, safeTimeline);
  const displayParagraphs = paragraphs.slice(-maxParagraphs);

  // ========================================
  // Extended Analytics (Feature Expansion)
  // 所有分析函数对空数组都有防御处理，但这里仍用 safeTimeline 以确保一致性
  // ========================================
  const volatility = calculateVolatilityMetrics(safeTimeline);
  const escalation = calculateRiskEscalationCurve(safeTimeline);
  const turningPoints = getTurningPointDecisions(safeTimeline);
  const aggressive = getAggressiveDecisions(safeTimeline);
  const pattern = detectBettingPattern(safeTimeline);
  const streetAnalyses = analyzeByStreet(safeTimeline);
  const report = generateHandAnalysisReport(safeTimeline);

  // 防御性检查 handEnded
  const handEnded = safeEvents.some((e, idx) =>
    e?.type === 'HAND_END' && idx <= safeCurrentIndex
  );

  // 空叙事状态
  if (displayParagraphs.length === 0) {
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
        Hand is starting...
      </div>
    );
  }

  // ========================================
  // 纯展示渲染
  // ========================================
  return (
    <div
      style={{
        background: 'rgba(139, 92, 246, 0.08)',
        border: '1px solid rgba(139, 92, 246, 0.2)',
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
          borderBottom: '1px solid rgba(139, 92, 246, 0.15)',
          background: 'rgba(139, 92, 246, 0.05)',
        }}
      >
        <span
          style={{
            fontSize: compact ? 9 : 10,
            color: '#a78bfa',
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
            color: '#7c3aed',
            padding: '2px 6px',
            background: 'rgba(139, 92, 246, 0.15)',
            borderRadius: 3,
          }}
        >
          {displayParagraphs.length} segments
        </span>
      </div>

      {/* 叙事内容 */}
      <div style={{ padding: compact ? '10px 12px' : '14px 16px' }}>
        {displayParagraphs.map((paragraph, index) => {
          const color = getParagraphColor(paragraph.type);
          const label = getParagraphLabel(paragraph.type);

          return (
            <div
              key={index}
              style={{
                marginBottom: index < displayParagraphs.length - 1 ? (compact ? 10 : 14) : 0,
                paddingLeft: compact ? 10 : 14,
                borderLeft: `2px solid ${color}`,
              }}
            >
              {/* 段落类型标签 */}
              <span
                style={{
                  display: 'inline-block',
                  marginBottom: compact ? 4 : 6,
                  padding: '1px 6px',
                  background: `${color}20`,
                  borderRadius: 3,
                  fontSize: compact ? 8 : 9,
                  fontWeight: 700,
                  color: color,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                {label}
              </span>

              {/* 叙事文本 */}
              <div
                style={{
                  fontSize: compact ? 11 : 13,
                  lineHeight: 1.6,
                  color: paragraph.highlight ? '#f0f0f0' : '#d0d0d0',
                  fontWeight: paragraph.highlight ? 600 : 400,
                  fontStyle: paragraph.type === 'conclusion' ? 'normal' : 'normal',
                }}
              >
                {paragraph.text}
              </div>
            </div>
          );
        })}

        {/* ================================================================ */}
        {/* Extended Narrative Features (Feature Expansion Phase)           */}
        {/* ================================================================ */}

        {/* Dramatic Arc */}
        {safeTimeline.length > 0 && (
          <div
            style={{
              marginTop: compact ? 14 : 18,
              paddingTop: compact ? 12 : 16,
              borderTop: '1px solid rgba(139, 92, 246, 0.15)',
            }}
          >
            <DramaticArcView
              volatility={volatility}
              escalation={escalation.points}
              handEnded={handEnded}
              compact={compact}
            />
          </div>
        )}

        {/* Key Moments */}
        <KeyMomentsView
          turningPoints={turningPoints}
          aggressive={aggressive}
          compact={compact}
        />

        {/* Street-by-Street Summary */}
        <StreetSummaryView streetAnalyses={streetAnalyses} compact={compact} />

        {/* Betting Pattern Analysis */}
        <PatternNarrativeView pattern={pattern} compact={compact} />

        {/* Hand Analysis Report (shown when hand ends) */}
        {handEnded && report && report.overallSummary && (
          <div
            style={{
              marginTop: compact ? 14 : 18,
              paddingTop: compact ? 12 : 16,
              borderTop: '1px solid rgba(34, 197, 94, 0.2)',
            }}
          >
            <HandReportSummaryView report={report} compact={compact} />
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// 导出辅助函数（供测试或其他组件使用）
// ============================================================================

export {
  generateNarrative,
  getParagraphColor,
  getParagraphLabel,
  groupDecisionsByStreet,
};

// 导出类型供外部使用
export type {
  NarrativeEventInfo,
  NarrativeParagraph,
  HandNarrativePanelProps,
};
