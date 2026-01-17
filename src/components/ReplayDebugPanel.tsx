// ============================================================================
// ReplayDebugPanel - Replay 调试面板 (Developer Tool)
// ============================================================================
//
// 开发者工具面板，用于调试 ReplayPlayer。
// 包含 slider seek（已知不稳定，属于调试功能）。
// 不面向普通用户，仅供开发调试使用。
//
// ============================================================================
// 【H-2 语义封板】LIVE vs DEBUG 行为分层
// ============================================================================
//
// - LIVE 模式（executorMode === 'live'）：
//   → 仅展示当前真实状态
//   → Timeline / Prev / Next 控件被禁用
//   → seek 只能来自 handlePushEvents（事件真实发生）
//
// - DRY 模式（executorMode === 'dry'）：
//   → 允许任意 seek，用于调试和回放
//   → Timeline / Prev / Next 控件正常工作
//
// 该分层确保 LIVE 语义不被 UI 操作污染。
// ============================================================================

import React, { useEffect, useRef } from 'react';
import { ReplayViewModel, PlayerActions } from '../types/replay';
import type { ReplayEvent } from '../replay/events';
import type { ExecutorMode } from '../commands/CommandExecutor';

// ============================================================================
// 【Phase 4】Experience Layer Imports
// ============================================================================
import {
  determineActiveView,
  getViewModeColor,
  isPanelPrimary,
  type ViewModeResult,
} from '../controllers/ViewModeController';
import { ContextBar } from './ContextBar';
import { CollapsiblePanel, PanelGroup } from './CollapsiblePanel';
import { buildDecisionTimeline, type PlayerInfo } from '../models/DecisionTimelineModel';

// ============================================================================
// Panel Components
// ============================================================================
import { StateExplanationPanel } from './StateExplanationPanel';
import { HandNarrativePanel } from './HandNarrativePanel';
import { MinimalErrorBoundary } from './MinimalErrorBoundary';
import { HandAnalyticsPanel } from './HandAnalyticsPanel';
import { DecisionInsightPanel } from './DecisionInsightPanel';
import { DecisionComparisonPanel } from './DecisionComparisonPanel';
import { StrategyAlignmentPanel } from './StrategyAlignmentPanel';
import { HandHistoryExport } from './HandHistoryExport';
import { EventTimelineInspector } from './EventTimelineInspector';
import { SnapshotDiffPanel } from './SnapshotDiffPanel';
import { PhaseProgressIndicator } from './PhaseProgressIndicator';
import { StackDistributionChart } from './StackDistributionChart';
import { ActionStatisticsPanel } from './ActionStatisticsPanel';
import { StreetSummaryPanel } from './StreetSummaryPanel';
import { BettingFlowDiagram } from './BettingFlowDiagram';
import { PotOddsDisplay } from './PotOddsDisplay';
import { CoachHintPanel } from './CoachHintPanel';
import {
  getCoachHints,
  buildCoachHintParams,
  type RecentAction,
} from '../controllers/CoachHintEngine';
import { ReviewPanel } from './ReviewPanel';
import { generateReviewInsight, type ReviewInsight } from '../controllers/ReviewInsightEngine';
import { LearningPanel } from './LearningPanel';
import type { HandHistory } from '../controllers/LearningProfileEngine';

/**
 * 数据源选项
 */
interface DataSourceOption {
  key: string;
  name: string;
}

interface ReplayDebugPanelProps {
  viewModel: ReplayViewModel;
  actions: PlayerActions;
  /** 可选：数据源选项列表 */
  dataSourceOptions?: DataSourceOption[];
  /** 可选：当前选中的数据源 key */
  currentDataSource?: string;
  /** 可选：切换数据源回调 */
  onDataSourceChange?: (sourceKey: string) => void;
  /** 可选：当前事件的文字描述 */
  currentEventDescription?: string;
  /** 可选：当前索引对应的原始事件（用于调试显示） */
  currentEvent?: ReplayEvent;
  /** 【H-2】执行模式：控制 Timeline 是否可操作 */
  executorMode?: ExecutorMode;
  /** 【A 路线扩展】完整事件序列（用于 Inspector 和 Export） */
  events?: readonly ReplayEvent[];
  /** 【A 路线扩展】前一帧快照（用于 Diff Panel） */
  previousSnapshot?: ReplayViewModel['snapshot'];
  /** 【Phase 8】手牌历史（用于学习分析） */
  handHistories?: readonly HandHistory[];
  /** 【Phase 8】手牌完成回调（用于累积学习数据） */
  onHandComplete?: (reviewInsight: ReviewInsight) => void;
  /** 【Phase 8】是否启用学习面板（默认 false） */
  enableLearning?: boolean;
}

/**
 * ReplayDebugPanel - 调试用 Replay 控制面板
 *
 * 使用示例：
 * ```tsx
 * function App() {
 *   const { viewModel, actions, loadReplay } = useReplayPlayer();
 *
 *   useEffect(() => {
 *     const hand = createMockBackendHand();
 *     const replay = BackendReplayAdapter.toReplay(hand);
 *     loadReplay(replay);
 *   }, [loadReplay]);
 *
 *   return <ReplayDebugPanel viewModel={viewModel} actions={actions} />;
 * }
 * ```
 */
export function ReplayDebugPanel({
  viewModel,
  actions,
  dataSourceOptions,
  currentDataSource,
  onDataSourceChange,
  currentEventDescription,
  currentEvent,
  executorMode = 'dry',
  events,
  previousSnapshot,
  handHistories,
  onHandComplete,
  enableLearning = false,
}: ReplayDebugPanelProps) {
  // 【H-2 语义】：LIVE 模式禁用 UI seek，只能通过 handlePushEvents 改变 index
  const isLiveMode = executorMode === 'live';
  const canSeekFromUI = !isLiveMode;

  // 【H-2】：Timeline seek 仅在 DRY 模式下生效
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canSeekFromUI) return; // LIVE 模式：忽略 UI seek
    actions.seek(Number(e.target.value));
  };

  // 【H-2】：Prev/Next 仅在 DRY 模式下生效
  const handleStepBackward = () => {
    if (!canSeekFromUI) return;
    actions.stepBackward();
  };

  const handleStepForward = () => {
    if (!canSeekFromUI) return;
    actions.stepForward();
  };

  const handleTogglePlayPause = () => {
    if (!canSeekFromUI) return;
    actions.togglePlayPause();
  };

  const handleDataSourceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onDataSourceChange?.(e.target.value);
  };

  // ========================================
  // 【Phase 4】View Mode Calculation
  // ========================================
  const safeEvents = Array.isArray(events) ? events : [];
  const safePlayers = Array.isArray(viewModel.snapshot.players) ? viewModel.snapshot.players : [];

  // Build player info for timeline
  const playerInfos: PlayerInfo[] = safePlayers.map(p => ({
    id: p?.id ?? '',
    name: p?.name ?? 'Unknown',
    seat: p?.seat,
  }));

  // Build decision timeline for view mode determination
  const timeline = buildDecisionTimeline(safeEvents, playerInfos, 0);

  // Get current event
  const currentEventForView = safeEvents[viewModel.index] ?? null;

  // Determine active view mode
  const viewModeResult: ViewModeResult = determineActiveView(
    currentEventForView,
    safeEvents,
    timeline,
    viewModel.index,
    0, // heroSeat - default to seat 0
    playerInfos
  );

  const { mode: viewMode, panelVisibility, contextBar, highlightDecision } = viewModeResult;

  // ========================================
  // 【Phase 6】Coach Hint Calculation
  // ========================================
  const recentActions: RecentAction[] = timeline
    .slice(Math.max(0, viewModel.index - 5), viewModel.index + 1)
    .map(dp => ({
      actionClass: dp.actionClass,
      playerId: dp.playerId,
      isHero: dp.isHeroDecision,
      amount: dp.amount,
    }));

  const coachHintParams = buildCoachHintParams(
    contextBar,
    viewMode,
    recentActions,
    undefined // potGrowthRate - can be calculated if needed
  );

  const coachHints = getCoachHints(coachHintParams);

  // ========================================
  // 【Phase 7】Review Insight Calculation
  // ========================================
  const reviewInsight = generateReviewInsight({
    events: safeEvents,
    players: playerInfos,
    heroSeat: 0,
    timeline,
    handEndReason: viewModel.snapshot.handEndReason,
  });

  // ========================================
  // 【Phase 8】Hand Complete Callback
  // ========================================
  const hasCalledOnHandComplete = useRef(false);
  const currentHandId = viewModel.snapshot.handId;

  useEffect(() => {
    // Reset flag when hand changes
    hasCalledOnHandComplete.current = false;
  }, [currentHandId]);

  useEffect(() => {
    // Call onHandComplete when review becomes available (hand ended)
    if (
      onHandComplete &&
      reviewInsight.isAvailable &&
      !hasCalledOnHandComplete.current
    ) {
      hasCalledOnHandComplete.current = true;
      onHandComplete(reviewInsight);
    }
  }, [onHandComplete, reviewInsight]);

  // Panel theme colors
  const panelColors = {
    narrative: '#a78bfa',
    comparison: '#06b6d4',
    insight: '#22c55e',
    alignment: '#f472b6',
  };

  return (
    <div
      style={{
        padding: 16,
        fontFamily: 'monospace',
        fontSize: 12,
        background: '#1a1a1a',
        color: '#888',
        borderRadius: 8,
        border: '1px solid #333',
        marginTop: 16,
      }}
    >
      {/* Developer Tool 标识 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
          paddingBottom: 8,
          borderBottom: '1px solid #333',
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 'bold', color: '#666' }}>
          DEBUG PANEL
        </span>
        <span
          style={{
            fontSize: 9,
            padding: '2px 6px',
            background: '#333',
            color: '#666',
            borderRadius: 3,
            textTransform: 'uppercase',
          }}
        >
          Developer Only
        </span>
      </div>

      {/* ================================================================ */}
      {/* 【Phase 4】Context Bar - 上下文信息栏 */}
      {/* ================================================================ */}
      {safeEvents.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <ContextBar
            data={contextBar}
            viewMode={viewMode}
            compact={true}
          />
        </div>
      )}

      {/* 数据源切换 */}
      {dataSourceOptions && dataSourceOptions.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <label style={{ marginRight: 8, color: '#666' }}>Source:</label>
          <select
            value={currentDataSource}
            onChange={handleDataSourceChange}
            style={{
              padding: '3px 6px',
              fontSize: 11,
              background: '#2a2a2a',
              color: '#aaa',
              border: '1px solid #444',
              borderRadius: 3,
            }}
          >
            {dataSourceOptions.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* 当前事件描述 */}
      {currentEventDescription && (
        <div
          style={{
            marginBottom: 12,
            padding: '6px 10px',
            background: '#252525',
            borderLeft: '2px solid #555',
            fontSize: 11,
            color: '#aaa',
          }}
        >
          {currentEventDescription}
        </div>
      )}

      {/* 状态展示 */}
      <div style={{ marginBottom: 12, fontSize: 11 }}>
        <div>Phase: <span style={{ color: '#aaa' }}>{viewModel.phase || '(none)'}</span></div>
        <div>Index: <span style={{ color: '#aaa' }}>{viewModel.index}</span> / {viewModel.count}</div>
        <div>Progress: <span style={{ color: '#aaa' }}>{(viewModel.progress * 100).toFixed(1)}%</span></div>
        <div>Playing: <span style={{ color: '#aaa' }}>{viewModel.playing ? 'Yes' : 'No'}</span></div>
      </div>

      {/* 【H-2】控制按钮 - LIVE 模式禁用 */}
      <div style={{ marginBottom: 12 }}>
        {isLiveMode && (
          <div style={{
            fontSize: 9,
            color: '#f59e0b',
            marginBottom: 6,
            padding: '4px 8px',
            background: 'rgba(245, 158, 11, 0.1)',
            borderRadius: 3,
            textAlign: 'center',
          }}>
            ⚠ LIVE MODE: Timeline controls disabled (state driven by Actions)
          </div>
        )}
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={handleStepBackward}
            disabled={!viewModel.canPrev || isLiveMode}
            style={{
              padding: '4px 10px',
              fontSize: 10,
              background: (viewModel.canPrev && canSeekFromUI) ? '#333' : '#222',
              color: (viewModel.canPrev && canSeekFromUI) ? '#aaa' : '#555',
              border: '1px solid #444',
              borderRadius: 3,
              cursor: (viewModel.canPrev && canSeekFromUI) ? 'pointer' : 'not-allowed',
              opacity: isLiveMode ? 0.4 : 1,
            }}
          >
            Prev
          </button>
          <button
            onClick={handleTogglePlayPause}
            disabled={isLiveMode}
            style={{
              padding: '4px 12px',
              fontSize: 10,
              background: canSeekFromUI ? '#333' : '#222',
              color: canSeekFromUI ? '#aaa' : '#555',
              border: '1px solid #444',
              borderRadius: 3,
              cursor: canSeekFromUI ? 'pointer' : 'not-allowed',
              opacity: isLiveMode ? 0.4 : 1,
            }}
          >
            {viewModel.playing ? 'Pause' : 'Play'}
          </button>
          <button
            onClick={handleStepForward}
            disabled={!viewModel.canNext || isLiveMode}
            style={{
              padding: '4px 10px',
              fontSize: 10,
              background: (viewModel.canNext && canSeekFromUI) ? '#333' : '#222',
              color: (viewModel.canNext && canSeekFromUI) ? '#aaa' : '#555',
              border: '1px solid #444',
              borderRadius: 3,
              cursor: (viewModel.canNext && canSeekFromUI) ? 'pointer' : 'not-allowed',
              opacity: isLiveMode ? 0.4 : 1,
            }}
          >
            Next
          </button>
        </div>
      </div>

      {/* 【H-2】Timeline slider - LIVE 模式禁用 */}
      <div style={{ marginBottom: 12, opacity: isLiveMode ? 0.4 : 1 }}>
        <div style={{ fontSize: 9, color: '#555', marginBottom: 4 }}>
          Timeline {isLiveMode ? '(disabled in LIVE mode)' : '(seek)'}
        </div>
        <input
          type="range"
          min={0}
          max={Math.max(0, viewModel.count - 1)}
          value={viewModel.index}
          onChange={handleSeek}
          style={{ width: '100%', opacity: 0.6 }}
          disabled={viewModel.count === 0 || isLiveMode}
        />
      </div>

      {/* ================================================================ */}
      {/* Last Applied Event - 当前事件详情 */}
      {/* ================================================================ */}
      <div style={{ fontSize: 10, color: '#555', borderTop: '1px solid #333', paddingTop: 8, marginBottom: 12 }}>
        <div style={{ marginBottom: 6, color: '#4a9eff', fontWeight: 'bold' }}>
          LAST APPLIED EVENT [index={viewModel.index}]
        </div>
        {currentEvent ? (
          <pre style={{
            margin: 0,
            padding: 8,
            background: '#0d1117',
            borderRadius: 4,
            fontSize: 10,
            color: '#8b949e',
            overflow: 'auto',
            maxHeight: 120,
          }}>
{formatEventForDebug(currentEvent)}
          </pre>
        ) : (
          <div style={{ color: '#555', fontStyle: 'italic' }}>No event data</div>
        )}
      </div>

      {/* ================================================================ */}
      {/* Debug Snapshot - 完整游戏状态快照 */}
      {/* ================================================================ */}
      <div style={{ fontSize: 10, color: '#555', borderTop: '1px solid #333', paddingTop: 8 }}>
        <div style={{ marginBottom: 6, color: '#3fb950', fontWeight: 'bold' }}>
          DEBUG SNAPSHOT
        </div>
        <pre style={{
          margin: 0,
          padding: 8,
          background: '#0d1117',
          borderRadius: 4,
          fontSize: 10,
          color: '#8b949e',
          overflow: 'auto',
          maxHeight: 300,
        }}>
{formatSnapshotForDebug(viewModel)}
        </pre>
      </div>

      {/* ================================================================ */}
      {/* 【A 路线扩展】State Explanation Panel */}
      {/* ================================================================ */}
      {events && events.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <StateExplanationPanel
            event={events[viewModel.index]}
            players={viewModel.snapshot.players}
            title="State Explanation"
            compact={true}
          />
        </div>
      )}

      {/* ================================================================ */}
      {/* 【Phase 4】Primary View Area - 主视图区域 */}
      {/* 根据 ViewMode 自动切换主要分析面板 */}
      {/* ================================================================ */}
      {safeEvents.length > 0 && (
        <div
          style={{
            marginTop: 16,
            padding: 12,
            background: `${getViewModeColor(viewMode)}08`,
            border: `1px solid ${getViewModeColor(viewMode)}20`,
            borderRadius: 8,
          }}
        >
          {/* Primary View Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 12,
              paddingBottom: 8,
              borderBottom: `1px solid ${getViewModeColor(viewMode)}15`,
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: getViewModeColor(viewMode),
              }}
            />
            <span
              style={{
                fontSize: 10,
                color: getViewModeColor(viewMode),
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              {viewMode === 'narrative-default' && 'Story Mode'}
              {viewMode === 'narrative-dramatic' && 'Climax Mode'}
              {viewMode === 'comparison-focus' && 'Decision Mode'}
              {viewMode === 'insight-expanded' && 'Analysis Mode'}
            </span>
            {highlightDecision && (
              <span
                style={{
                  marginLeft: 'auto',
                  padding: '2px 8px',
                  background: 'rgba(6, 182, 212, 0.2)',
                  border: '1px solid rgba(6, 182, 212, 0.4)',
                  borderRadius: 4,
                  fontSize: 9,
                  fontWeight: 700,
                  color: '#06b6d4',
                  textTransform: 'uppercase',
                }}
              >
                Key Moment
              </span>
            )}
          </div>

          {/* Narrative Panel - Primary when narrative modes */}
          <CollapsiblePanel
            title="Hand Narrative"
            visibility={panelVisibility.narrative}
            themeColor={panelColors.narrative}
            compact={true}
            highlight={isPanelPrimary('narrative', panelVisibility) && highlightDecision}
          >
            <MinimalErrorBoundary panelName="Hand Narrative" compact={true}>
              <HandNarrativePanel
                events={safeEvents}
                currentIndex={viewModel.index}
                players={viewModel.snapshot.players}
                title="Hand Narrative"
                compact={true}
              />
            </MinimalErrorBoundary>
          </CollapsiblePanel>

          {/* Comparison Panel - Primary when hero decision */}
          <CollapsiblePanel
            title="Decision Comparison"
            visibility={panelVisibility.comparison}
            themeColor={panelColors.comparison}
            compact={true}
            highlight={isPanelPrimary('comparison', panelVisibility) && highlightDecision}
          >
            <MinimalErrorBoundary panelName="Decision Comparison" compact={true}>
              <DecisionComparisonPanel
                events={safeEvents}
                players={viewModel.snapshot.players}
                currentIndex={viewModel.index}
                title="Decision Comparison"
                compact={true}
              />
            </MinimalErrorBoundary>
          </CollapsiblePanel>

          {/* Insight Panel - Primary when hand ends */}
          <CollapsiblePanel
            title="Decision Insights"
            visibility={panelVisibility.insight}
            themeColor={panelColors.insight}
            compact={true}
            highlight={isPanelPrimary('insight', panelVisibility)}
          >
            <MinimalErrorBoundary panelName="Decision Insights" compact={true}>
              <DecisionInsightPanel
                events={safeEvents}
                players={viewModel.snapshot.players}
                currentIndex={viewModel.index}
                title="Decision Insights"
                compact={true}
              />
            </MinimalErrorBoundary>
          </CollapsiblePanel>

          {/* Alignment Panel - Primary when hand ends (with insight) */}
          <CollapsiblePanel
            title="Strategy Alignment"
            visibility={panelVisibility.alignment}
            themeColor={panelColors.alignment}
            compact={true}
            highlight={isPanelPrimary('alignment', panelVisibility)}
          >
            <MinimalErrorBoundary panelName="Strategy Alignment" compact={true}>
              <StrategyAlignmentPanel
                events={safeEvents}
                players={viewModel.snapshot.players}
                currentIndex={viewModel.index}
                heroSeat={0}
                title="Strategy Alignment"
                compact={true}
              />
            </MinimalErrorBoundary>
          </CollapsiblePanel>

          {/* ================================================================ */}
          {/* 【Phase 6】Coach Hint Panel - 教练提示面板 */}
          {/* 低干扰、可折叠的策略提示 */}
          {/* ================================================================ */}
          {coachHints.length > 0 && (
            <CoachHintPanel hints={coachHints} />
          )}

          {/* ================================================================ */}
          {/* 【Phase 7】Review Panel - 事后复盘学习面板 */}
          {/* 仅在 HAND_END / SHOWDOWN 后可见 */}
          {/* ================================================================ */}
          {reviewInsight.isAvailable && (
            <ReviewPanel insight={reviewInsight} compact={true} />
          )}

          {/* ================================================================ */}
          {/* 【Phase 8】Learning Panel - 跨手牌学习面板 */}
          {/* 仅在 enableLearning=true 且 handHistories >= 2 时可见 */}
          {/* ================================================================ */}
          {enableLearning && handHistories && handHistories.length >= 2 && (
            <LearningPanel
              handHistories={handHistories}
              heroSeat={0}
              compact={true}
            />
          )}
        </div>
      )}

      {/* ================================================================ */}
      {/* 【Phase 4】Secondary Panels Group - 辅助面板组 */}
      {/* ================================================================ */}
      {safeEvents.length > 0 && (
        <PanelGroup title="Additional Analysis" compact={true}>
          {/* Hand Analytics */}
          <CollapsiblePanel
            title="Hand Analytics"
            visibility="collapsed"
            themeColor="#f59e0b"
            compact={true}
          >
            <HandAnalyticsPanel
              events={safeEvents}
              players={viewModel.snapshot.players}
              streets={[]}
              title="Hand Analytics"
              compact={true}
            />
          </CollapsiblePanel>
        </PanelGroup>
      )}

      {/* ================================================================ */}
      {/* 【A 路线扩展】Snapshot Diff Panel */}
      {/* ================================================================ */}
      {previousSnapshot && (
        <div style={{ marginTop: 12 }}>
          <SnapshotDiffPanel
            currentSnapshot={viewModel.snapshot}
            previousSnapshot={previousSnapshot}
            title="State Changes"
            compact={true}
          />
        </div>
      )}

      {/* ================================================================ */}
      {/* 【A 路线扩展】Event Timeline Inspector */}
      {/* ================================================================ */}
      {events && events.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <EventTimelineInspector
            events={events}
            currentIndex={viewModel.index}
            players={viewModel.snapshot.players}
            onSeek={canSeekFromUI ? actions.seek : undefined}
            title="Event Inspector"
            maxHeight={200}
            compact={true}
            showGroupHeaders={true}
          />
        </div>
      )}

      {/* ================================================================ */}
      {/* 【A 路线扩展】Hand History Export */}
      {/* ================================================================ */}
      {events && events.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <HandHistoryExport
            events={events}
            snapshot={viewModel.snapshot}
            viewMode="full"
            title="Hand History Export"
          />
        </div>
      )}

      {/* ================================================================ */}
      {/* 【Post-Freeze】Phase Progress Indicator */}
      {/* ================================================================ */}
      <div style={{ marginTop: 12 }}>
        <PhaseProgressIndicator
          currentPhase={viewModel.phase}
          currentStreet={viewModel.snapshot.street}
          isHandActive={viewModel.snapshot.isActive}
          compact={true}
        />
      </div>

      {/* ================================================================ */}
      {/* 【Post-Freeze】Stack Distribution Chart */}
      {/* ================================================================ */}
      <div style={{ marginTop: 12 }}>
        <StackDistributionChart
          players={viewModel.snapshot.players}
          currentPlayerId={viewModel.snapshot.currentPlayerId}
          title="Stack Distribution"
          compact={true}
          showPercentages={true}
        />
      </div>

      {/* ================================================================ */}
      {/* 【Post-Freeze】Pot Odds Display */}
      {/* ================================================================ */}
      {viewModel.snapshot.amountToCall > 0 && (
        <div style={{ marginTop: 12 }}>
          <PotOddsDisplay
            potTotal={viewModel.snapshot.potTotal}
            amountToCall={viewModel.snapshot.amountToCall}
            title="Pot Odds"
            compact={true}
          />
        </div>
      )}

      {/* ================================================================ */}
      {/* 【Post-Freeze】Action Statistics Panel */}
      {/* ================================================================ */}
      {events && events.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <ActionStatisticsPanel
            events={events}
            players={viewModel.snapshot.players}
            title="Action Statistics"
            compact={true}
          />
        </div>
      )}

      {/* ================================================================ */}
      {/* 【Post-Freeze】Street Summary Panel */}
      {/* ================================================================ */}
      {events && events.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <StreetSummaryPanel
            events={events}
            players={viewModel.snapshot.players}
            title="Street Summary"
            compact={true}
          />
        </div>
      )}

      {/* ================================================================ */}
      {/* 【Post-Freeze】Betting Flow Diagram */}
      {/* ================================================================ */}
      {events && events.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <BettingFlowDiagram
            events={events}
            players={viewModel.snapshot.players}
            potTotal={viewModel.snapshot.potTotal}
            title="Betting Flow"
            compact={true}
          />
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Debug Formatting Helpers (纯展示用，不引入任何状态)
// ============================================================================

/**
 * 格式化事件用于调试显示
 */
function formatEventForDebug(event: ReplayEvent): string {
  const lines: string[] = [];
  lines.push(`type: "${event.type}"`);

  // 根据事件类型提取关键字段
  switch (event.type) {
    case 'HAND_START':
      lines.push(`handId: "${event.handId}"`);
      lines.push(`dealerSeat: ${event.dealerSeat}`);
      lines.push(`blinds: ${event.smallBlind}/${event.bigBlind}`);
      lines.push(`players: [${event.players.map(p => p.id).join(', ')}]`);
      break;
    case 'POST_BLIND':
      lines.push(`playerId: "${event.playerId}"`);
      lines.push(`amount: ${event.amount}`);
      lines.push(`blindType: "${event.blindType}"`);
      break;
    case 'DEAL_HOLE':
      lines.push(`playerId: "${event.playerId}"`);
      lines.push(`cards: [${event.cards.map(c => `${c.rank}${c.suit}`).join(', ')}]`);
      break;
    case 'BET':
    case 'CALL':
    case 'RAISE':
    case 'ALL_IN':
      lines.push(`playerId: "${event.playerId}"`);
      lines.push(`amount: ${event.amount}`);
      break;
    case 'CHECK':
    case 'FOLD':
      lines.push(`playerId: "${event.playerId}"`);
      break;
    case 'DEAL_COMMUNITY':
      lines.push(`phase: "${event.phase}"`);
      lines.push(`cards: [${event.cards.map(c => `${c.rank}${c.suit}`).join(', ')}]`);
      break;
    // 【H-4.1】STREET_START 调试显示
    case 'STREET_START':
      lines.push(`street: "${event.street}"`);
      break;
    case 'SHOWDOWN':
      // No additional fields
      break;
    case 'HAND_END':
      if (event.reason) {
        lines.push(`reason: "${event.reason}"`);
      }
      lines.push(`winners: [`);
      event.winners.forEach(w => {
        lines.push(`  { playerId: "${w.playerId}", amount: ${w.amount}${w.handRank ? `, rank: "${w.handRank}"` : ''} }`);
      });
      lines.push(`]`);
      break;
  }

  return lines.join('\n');
}

/**
 * 格式化快照用于调试显示
 */
function formatSnapshotForDebug(vm: ReplayViewModel): string {
  const s = vm.snapshot;
  const lines: string[] = [];

  // 基础信息
  lines.push(`=== State ===`);
  lines.push(`phase: "${s.phase || '(none)'}"`);
  const streetValue = s.street || '(none)';
  lines.push(`street: "${streetValue}"`);
  lines.push(`index: ${vm.index} / ${vm.count} (${(vm.progress * 100).toFixed(1)}%)`);
  lines.push(`isActive: ${s.isActive}`);
  lines.push(`isHandOver: ${s.isHandOver}`);
  if (s.handEndReason) {
    lines.push(`handEndReason: "${s.handEndReason}"`);
  }
  lines.push(`currentPlayerId: "${s.currentPlayerId || '(none)'}"`);
  lines.push(`currentSeat: ${s.currentSeat}`);
  lines.push(``);

  // Pot 信息
  lines.push(`=== Pot ===`);
  lines.push(`potTotal: ${s.potTotal}`);
  lines.push(`amountToCall: ${s.amountToCall}`);
  lines.push(``);

  // 公共牌
  lines.push(`=== Community Cards ===`);
  if (s.communityCards.length === 0) {
    lines.push(`(none)`);
  } else {
    lines.push(`[${s.communityCards.map(c => c.display).join(' ')}]`);
  }
  lines.push(``);

  // 玩家列表
  lines.push(`=== Players ===`);
  s.players.forEach(p => {
    const markers: string[] = [];
    if (p.isDealer) markers.push('D');
    if (p.isSmallBlind) markers.push('SB');
    if (p.isBigBlind) markers.push('BB');
    if (p.isCurrent) markers.push('*CURRENT*');

    const statusColor = p.status === 'Active' ? '' : ` [${p.status}]`;
    const markerStr = markers.length > 0 ? ` (${markers.join(',')})` : '';

    lines.push(`  seat${p.seat}: ${p.id}${markerStr}${statusColor}`);
    lines.push(`         chips=${p.chips}, bet=${p.bet}`);
    if (p.holeCards.length > 0) {
      lines.push(`         cards=[${p.holeCards.map(c => c.display).join(' ')}]`);
    }
  });

  return lines.join('\n');
}
