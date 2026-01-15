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
  type BettingPatternResult,
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
 */
function getDecisionNarrative(decision: DecisionPoint): string {
  return decision.narrative.sentence;
}

/**
 * 按街道分组决策点
 */
function groupDecisionsByStreet(
  timeline: DecisionTimeline
): Map<StreetPhase, readonly DecisionPoint[]> {
  const groups = new Map<StreetPhase, DecisionPoint[]>();

  for (const decision of timeline) {
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
 */
function generateNarrative(
  events: readonly NarrativeEventInfo[],
  currentIndex: number,
  playerNames: Map<string, string>,
  timeline: DecisionTimeline
): readonly NarrativeParagraph[] {
  const paragraphs: NarrativeParagraph[] = [];
  const relevantEvents = events.slice(0, currentIndex + 1);

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
    switch (event.type) {
      case 'HAND_START':
        handStarted = true;
        break;

      case 'POST_BLIND':
        blindsPosted = true;
        break;

      case 'DEAL_COMMUNITY':
        if (event.cards) {
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
        if (event.winners) {
          winnersInfo = [...event.winners];
        }
        if (event.reason) {
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
  const decisionsByStreet = groupDecisionsByStreet(timeline);
  const streetOrder: StreetPhase[] = ['PREFLOP', 'FLOP', 'TURN', 'RIVER'];

  for (const street of streetOrder) {
    const decisions = decisionsByStreet.get(street);
    if (!decisions || decisions.length === 0) continue;

    // Filter decisions within current index range
    const relevantDecisions = decisions.filter(d => d.index <= currentIndex);
    if (relevantDecisions.length === 0) continue;

    // Get action sentences from DecisionTimeline narrative context
    const actions = relevantDecisions
      .filter(d => d.actionClass !== 'post-blind') // Blinds handled separately
      .map(d => getDecisionNarrative(d).replace(/\.$/, '')); // Remove trailing period

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
    if (actions.length === 1) {
      streetText += `On ${streetName}, ${actions[0].charAt(0).toLowerCase() + actions[0].slice(1)}.`;
    } else if (actions.length === 2) {
      streetText += `On ${streetName}, ${actions[0].charAt(0).toLowerCase() + actions[0].slice(1)}, then ${actions[1].charAt(0).toLowerCase() + actions[1].slice(1)}.`;
    } else {
      const lastAction = actions[actions.length - 1];
      const otherActions = actions.slice(0, -1).map(a => a.charAt(0).toLowerCase() + a.slice(1)).join(', ');
      streetText += `On ${streetName}, ${otherActions}, and finally ${lastAction.charAt(0).toLowerCase() + lastAction.slice(1)}.`;
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
      const winnerName = getPlayerName(winner.playerId, playerNames);
      const handInfo = winner.handRank ? ` with ${winner.handRank}` : '';
      if (handEndReason === 'ALL_FOLD') {
        conclusionText = `${winnerName} takes the pot of $${winner.amount} as all opponents have folded.`;
      } else {
        conclusionText = `${winnerName} wins the pot of $${winner.amount}${handInfo}.`;
      }
    } else {
      const winnerDescs = winnersInfo.map(w => {
        const name = getPlayerName(w.playerId, playerNames);
        const handInfo = w.handRank ? ` (${w.handRank})` : '';
        return `${name} wins $${w.amount}${handInfo}`;
      });
      conclusionText = `The pot is split: ${winnerDescs.join('; ')}.`;
    }
    paragraphs.push({
      type: 'conclusion',
      text: conclusionText,
      highlight: true,
    });
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
  if (escalation.length === 0) return 'flat';

  const lastPoint = escalation[escalation.length - 1];
  const midPoint = escalation[Math.floor(escalation.length / 2)];

  if (lastPoint.cumulativeRisk > 70) return 'climax';
  if (lastPoint.cumulativeRisk > midPoint.cumulativeRisk) return 'rising';
  if (lastPoint.cumulativeRisk < midPoint.cumulativeRisk) return 'falling';

  return volatility.volatilityScore > 50 ? 'rising' : 'flat';
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
            width: `${volatility.volatilityScore}%`,
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
        <span>Tension: {volatility.volatilityScore}%</span>
        <span>Peak Decision: {volatility.peakDecisionIndex + 1}</span>
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
  const keyMoments = [
    ...turningPoints.map(tp => ({ ...tp, momentType: 'turning' as const })),
    ...aggressive.slice(0, 3).map(a => ({ ...a, momentType: 'aggressive' as const })),
  ].sort((a, b) => a.index - b.index);

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
                <strong style={{ color: '#f472b6' }}>{moment.playerName}</strong>{' '}
                {moment.actionClass}
                {moment.amount ? ` $${moment.amount}` : ''}
              </span>
              <span
                style={{
                  marginLeft: 'auto',
                  fontSize: compact ? 8 : 9,
                  color: '#888',
                }}
              >
                {moment.street}
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
  if (streetAnalyses.length === 0) return null;

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
        {streetAnalyses.map((analysis, idx) => {
          const streetColors: Record<string, string> = {
            PREFLOP: '#3b82f6',
            FLOP: '#06b6d4',
            TURN: '#f59e0b',
            RIVER: '#ef4444',
          };
          const color = streetColors[analysis.street] ?? '#888';

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
                {analysis.street}
              </span>
              <span
                style={{
                  fontSize: compact ? 9 : 10,
                  color: '#9ca3af',
                }}
              >
                {analysis.decisionCount} actions
              </span>
              <span
                style={{
                  fontSize: compact ? 9 : 10,
                  color: analysis.aggressiveCount > analysis.passiveCount ? '#f59e0b' : '#3b82f6',
                }}
              >
                {analysis.aggressiveCount}A / {analysis.passiveCount}P
              </span>
              <span
                style={{
                  marginLeft: 'auto',
                  fontSize: compact ? 8 : 9,
                  color: analysis.potGrowth > 50 ? '#f59e0b' : '#888',
                }}
              >
                Pot +{analysis.potGrowth}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface PatternNarrativeViewProps {
  readonly pattern: BettingPatternResult | null;
  readonly compact?: boolean;
}

function PatternNarrativeView({
  pattern,
  compact = false,
}: PatternNarrativeViewProps) {
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

  const patternColors: Record<string, string> = {
    'value-heavy': '#22c55e',
    'bluff-heavy': '#ef4444',
    'balanced': '#3b82f6',
    'passive': '#6b7280',
    'unknown': '#888',
  };
  const color = patternColors[pattern.pattern];

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
            {pattern.pattern.replace('-', ' ')}
          </span>
          <span
            style={{
              fontSize: compact ? 9 : 10,
              color: '#888',
            }}
          >
            Confidence: {pattern.confidence}%
          </span>
        </div>

        <div
          style={{
            fontSize: compact ? 10 : 11,
            color: '#d0d0d0',
            lineHeight: 1.5,
          }}
        >
          {pattern.description}
        </div>

        {/* Pattern indicators */}
        <div
          style={{
            display: 'flex',
            gap: compact ? 6 : 8,
            marginTop: compact ? 8 : 10,
          }}
        >
          {pattern.indicators.slice(0, 3).map((indicator, idx) => (
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
              {indicator}
            </span>
          ))}
        </div>
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

      {/* Overview */}
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
          "{report.overview}"
        </div>
      </div>

      {/* Key Insights */}
      {report.keyInsights.length > 0 && (
        <div style={{ marginBottom: compact ? 8 : 10 }}>
          <div
            style={{
              fontSize: compact ? 8 : 9,
              color: '#888',
              textTransform: 'uppercase',
              marginBottom: compact ? 4 : 6,
            }}
          >
            Key Insights
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {report.keyInsights.slice(0, 4).map((insight, idx) => (
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
                <span style={{ color: '#22c55e' }}>•</span>
                <span>{insight}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recommendations */}
      {report.recommendations.length > 0 && (
        <div>
          <div
            style={{
              fontSize: compact ? 8 : 9,
              color: '#888',
              textTransform: 'uppercase',
              marginBottom: compact ? 4 : 6,
            }}
          >
            Recommendations
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {report.recommendations.slice(0, 3).map((rec, idx) => (
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
                <span style={{ color: '#f59e0b' }}>→</span>
                <span>{rec}</span>
              </div>
            ))}
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
        No hand data to narrate
      </div>
    );
  }

  // ========================================
  // 从 DecisionTimelineModel 构建数据
  // ========================================
  const playerInfos: PlayerInfo[] = players.map(p => ({
    id: p.id,
    name: p.name,
    seat: p.seat,
  }));

  const playerNames = buildPlayerNameMap(playerInfos);
  const timeline = buildDecisionTimeline(events, playerInfos, 0);

  // ========================================
  // 纯函数计算：生成叙事段落
  // ========================================
  const paragraphs = generateNarrative(events, currentIndex, playerNames, timeline);
  const displayParagraphs = paragraphs.slice(-maxParagraphs);

  // ========================================
  // Extended Analytics (Feature Expansion)
  // ========================================
  const volatility = calculateVolatilityMetrics(timeline);
  const escalation = calculateRiskEscalationCurve(timeline);
  const turningPoints = getTurningPointDecisions(timeline);
  const aggressive = getAggressiveDecisions(timeline);
  const pattern = detectBettingPattern(timeline);
  const streetAnalyses = analyzeByStreet(timeline);
  const report = generateHandAnalysisReport(timeline);
  const handEnded = events.some(e => e.type === 'HAND_END' && events.indexOf(e) <= currentIndex);

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
        {timeline.length > 0 && (
          <div
            style={{
              marginTop: compact ? 14 : 18,
              paddingTop: compact ? 12 : 16,
              borderTop: '1px solid rgba(139, 92, 246, 0.15)',
            }}
          >
            <DramaticArcView
              volatility={volatility}
              escalation={escalation}
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
        {handEnded && report.totalDecisions > 0 && (
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
