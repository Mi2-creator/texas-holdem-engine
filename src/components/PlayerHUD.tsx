// ============================================================================
// PlayerHUD - 玩家视角 HUD (Player View)
// ============================================================================
//
// 【H-5】UI 只读语义：
// - 仅透传 snapshot，不缓存、不派生、不 useEffect 推断状态
// - 不引入 replay index 逻辑
// - 所有状态展示直接来自 viewModel.snapshot
//
// UI 分层结构：
// 1. Snapshot 层 - 来自 snapshot 的静态数据
// 2. Action 层 - 当前行动状态（来自 currentPlayerId / isActive）
// 3. Narrative 层 - 事件文字描述（来自 formatReplayEvent）
//
// ============================================================================

import React from 'react';
import { ReplayViewModel, PlayerActions, CardSnapshot } from '../types/replay';
import { ActionPanel } from './ActionPanel';
import { CommandExecutor } from '../commands/CommandExecutor';
import { PositionIndicator } from './PositionIndicator';
import { StackRanking } from './StackRanking';
import { ActionTimelinePanel } from './ActionTimelinePanel';
import { StateExplanationPanel } from './StateExplanationPanel';
import { SnapshotDiffPanel } from './SnapshotDiffPanel';
import { PhaseProgressIndicator } from './PhaseProgressIndicator';
import { PotOddsDisplay } from './PotOddsDisplay';
import { StreetSummaryPanel } from './StreetSummaryPanel';

// CSS Keyframes for turn status animations
const HUD_ANIMATION_STYLES = `
@keyframes yourTurnPulse {
  0%, 100% { box-shadow: 0 0 20px rgba(34, 197, 94, 0.3); }
  50% { box-shadow: 0 0 32px rgba(34, 197, 94, 0.5); }
}
@keyframes bannerFadeIn {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: translateY(0); }
}
`;

/**
 * 时间线事件信息（本地类型，不依赖 src/replay/events.ts）
 *
 * 这是一个"形状描述"接口，用于 ActionTimelinePanel 的数据透传。
 * 定义在 PlayerHUD 中以避免从 replay 层导入类型。
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
 * 【H-5】PlayerHUD Props
 *
 * UI 只读语义：
 * - viewModel: 唯一数据来源，包含 snapshot
 * - 不接收任何用于状态推断的 props
 * - executor 仅用于 ActionPanel 透传
 * - events 仅用于 ActionTimelinePanel 透传（A 路线扩展）
 */
interface PlayerHUDProps {
  /** 视图模型（唯一数据来源） */
  viewModel: ReplayViewModel;
  /** 播放器操作 */
  actions: PlayerActions;
  /** 当前事件描述（Narrative 层） */
  currentEventDescription?: string;
  /** 当前选中的玩家 ID */
  selectedPlayerId: string;
  /** 玩家列表（用于选择器） */
  playerOptions: Array<{ id: string; name: string }>;
  /** 玩家选择回调 */
  onPlayerSelect: (playerId: string) => void;
  /** 命令执行器（透传给 ActionPanel） */
  executor?: CommandExecutor;
  /** 事件序列（透传给 ActionTimelinePanel，只读） */
  events?: ReadonlyArray<TimelineEventInfo>;
  /** 【A 路线扩展】前一帧快照（用于 SnapshotDiffPanel） */
  previousSnapshot?: ReplayViewModel['snapshot'];
}

// ============================================================================
// Sub-components
// ============================================================================

/**
 * 单张卡牌显示 - Premium card styling
 */
function HUDCard({ card, size = 'large' }: { card: CardSnapshot; size?: 'large' | 'small' }) {
  const isRed = card.suitCode === 'H' || card.suitCode === 'D';
  const isLarge = size === 'large';

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: isLarge ? 56 : 36,
        height: isLarge ? 76 : 48,
        margin: '0 3px',
        border: '1px solid rgba(0,0,0,0.15)',
        borderRadius: isLarge ? 8 : 5,
        background: 'linear-gradient(180deg, #ffffff 0%, #f5f5f5 100%)',
        color: isRed ? '#dc2626' : '#1a1a1a',
        fontWeight: 700,
        fontSize: isLarge ? 24 : 15,
        fontFamily: "'Georgia', serif",
        boxShadow: '0 4px 16px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.9)',
        letterSpacing: '-1px',
      }}
    >
      {card.display}
    </span>
  );
}

/**
 * 空卡牌占位（未发牌时）
 */
function EmptyCard({ size = 'large' }: { size?: 'large' | 'small' }) {
  const isLarge = size === 'large';

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: isLarge ? 56 : 36,
        height: isLarge ? 76 : 48,
        margin: '0 3px',
        border: '2px dashed rgba(255,255,255,0.15)',
        borderRadius: isLarge ? 8 : 5,
        background: 'rgba(0,0,0,0.2)',
        color: 'rgba(255,255,255,0.25)',
        fontWeight: 700,
        fontSize: isLarge ? 24 : 15,
      }}
    >
      ?
    </span>
  );
}

/**
 * 状态标签 - Enhanced badge styling
 */
function StatusBadge({ status }: { status: string }) {
  const isAllIn = status === 'AllIn';

  return (
    <span
      style={{
        display: 'inline-block',
        padding: '4px 12px',
        background: isAllIn
          ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
          : 'rgba(100,100,100,0.6)',
        color: isAllIn ? '#fff' : '#999',
        borderRadius: 5,
        fontSize: 11,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        boxShadow: isAllIn ? '0 2px 8px rgba(239, 68, 68, 0.3)' : 'none',
      }}
    >
      {status}
    </span>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function PlayerHUD({
  viewModel,
  actions,
  currentEventDescription,
  selectedPlayerId,
  playerOptions,
  onPlayerSelect,
  executor,
  events,
  previousSnapshot,
}: PlayerHUDProps) {
  const { snapshot } = viewModel;
  const selectedPlayer = snapshot.players.find((p) => p.id === selectedPlayerId);

  // 从 viewModel 获取当前行动玩家（Action 层数据）
  const currentActorId = snapshot.currentPlayerId;
  const currentActor = snapshot.players.find((p) => p.id === currentActorId);
  const isMyTurn = selectedPlayerId === currentActorId && snapshot.isActive;

  const handlePlayerChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onPlayerSelect(e.target.value);
  };

  return (
    <div
      style={{
        background: 'linear-gradient(180deg, #1e3a1e 0%, #122812 100%)',
        borderRadius: 16,
        padding: 24,
        color: '#fff',
        maxWidth: 480,
        margin: '0 auto',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      {/* Inject CSS keyframes for animations */}
      <style>{HUD_ANIMATION_STYLES}</style>

      {/* ================================================================ */}
      {/* TURN STATUS BANNER - 行动状态横幅 */}
      {/* ================================================================ */}
      {snapshot.isActive && (
        <div
          style={{
            marginBottom: 16,
            padding: '12px 16px',
            borderRadius: 8,
            textAlign: 'center',
            fontWeight: 'bold',
            fontSize: 16,
            // Transitions for smooth style changes when isMyTurn toggles
            transition: 'background 0.3s ease, border-color 0.3s ease, color 0.3s ease, box-shadow 0.3s ease',
            // Keyframe animation for initial appearance + pulse when active
            animation: isMyTurn
              ? 'bannerFadeIn 0.25s ease-out, yourTurnPulse 1.5s ease-in-out infinite'
              : 'bannerFadeIn 0.25s ease-out',
            // Style based on turn state
            background: isMyTurn
              ? 'linear-gradient(135deg, #166534 0%, #14532d 100%)'
              : 'rgba(0,0,0,0.3)',
            border: isMyTurn ? '2px solid #22c55e' : '2px solid #555',
            color: isMyTurn ? '#4ade80' : '#888',
            boxShadow: isMyTurn ? '0 0 20px rgba(34, 197, 94, 0.3)' : 'none',
          }}
        >
          {isMyTurn ? (
            <>▶ YOUR TURN – Choose an action</>
          ) : (
            <>⏳ Waiting for {currentActor?.name ?? '...'}...</>
          )}
        </div>
      )}

      {/* ================================================================ */}
      {/* 玩家选择器 */}
      {/* ================================================================ */}
      <div style={{ marginBottom: 20, textAlign: 'center' }}>
        <label style={{ marginRight: 8, fontSize: 14, color: '#aaa' }}>
          Watching as:
        </label>
        <select
          value={selectedPlayerId}
          onChange={handlePlayerChange}
          style={{
            padding: '6px 12px',
            fontSize: 14,
            borderRadius: 4,
            border: '1px solid #555',
            background: '#2a2a2a',
            color: '#fff',
            cursor: 'pointer',
          }}
        >
          {playerOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {/* ================================================================ */}
      {/* 【Post-Freeze】Phase Progress Indicator */}
      {/* ================================================================ */}
      <div style={{ marginBottom: 16 }}>
        <PhaseProgressIndicator
          currentPhase={viewModel.phase}
          currentStreet={snapshot.street}
          isHandActive={snapshot.isActive}
          compact={false}
        />
      </div>

      {/* ================================================================ */}
      {/* ACTION 层 - Phase 和当前行动玩家 */}
      {/* ================================================================ */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
          padding: '10px 16px',
          background: 'rgba(0,0,0,0.3)',
          borderRadius: 8,
        }}
      >
        {/* Phase */}
        <div>
          <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', marginBottom: 2 }}>
            Phase
          </div>
          <div style={{ fontSize: 18, fontWeight: 'bold', color: '#ffd700' }}>
            {viewModel.phase || 'Waiting'}
          </div>
        </div>

        {/* 当前行动玩家指示 */}
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', marginBottom: 2 }}>
            Action On
          </div>
          {currentActor && snapshot.isActive ? (
            <div
              style={{
                fontSize: 16,
                fontWeight: 'bold',
                color: isMyTurn ? '#4ade80' : '#fff',
              }}
            >
              {isMyTurn ? 'YOU' : currentActor.name}
            </div>
          ) : (
            <div style={{ fontSize: 16, color: '#666' }}>—</div>
          )}
        </div>
      </div>

      {/* ================================================================ */}
      {/* 【I-3.3a】Position Indicator - 只读派生组件 */}
      {/* ================================================================ */}
      {/* 【I-3.3b】Stack Ranking - 只读派生组件 */}
      {/* 两个组件并排显示 */}
      {/* ================================================================ */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <PositionIndicator
            dealerSeat={snapshot.dealerSeat}
            smallBlindSeat={snapshot.smallBlindSeat}
            bigBlindSeat={snapshot.bigBlindSeat}
            players={snapshot.players}
            selectedPlayerId={selectedPlayerId}
          />
        </div>
        <div style={{ flex: 1 }}>
          <StackRanking
            players={snapshot.players}
            selectedPlayerId={selectedPlayerId}
          />
        </div>
      </div>

      {/* ================================================================ */}
      {/* SNAPSHOT 层 - Pot 和公共牌 */}
      {/* ================================================================ */}
      <div
        style={{
          marginBottom: 16,
          padding: '12px 16px',
          background: 'rgba(0,0,0,0.2)',
          borderRadius: 8,
        }}
      >
        {/* Pot */}
        <div style={{ textAlign: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 12, color: '#888', textTransform: 'uppercase' }}>Pot</span>
          <div style={{ fontSize: 24, fontWeight: 'bold', color: '#ffd700' }}>
            ${snapshot.potTotal}
          </div>
        </div>

        {/* 公共牌 */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 6, textTransform: 'uppercase' }}>
            Community Cards
          </div>
          <div style={{ minHeight: 36 }}>
            {snapshot.communityCards.length > 0 ? (
              snapshot.communityCards.map((card, i) => (
                <HUDCard key={i} card={card} size="small" />
              ))
            ) : (
              <span style={{ color: '#555', fontSize: 13 }}>—</span>
            )}
          </div>
        </div>
      </div>

      {/* ================================================================ */}
      {/* SNAPSHOT 层 - 玩家手牌和筹码 */}
      {/* ================================================================ */}
      <div
        style={{
          marginBottom: 16,
          padding: '16px',
          background: isMyTurn ? 'rgba(74, 222, 128, 0.1)' : 'rgba(0,0,0,0.2)',
          border: isMyTurn ? '2px solid #4ade80' : '2px solid transparent',
          borderRadius: 8,
          textAlign: 'center',
          transition: 'all 0.3s ease',
        }}
      >
        <div style={{ fontSize: 11, color: '#888', marginBottom: 8, textTransform: 'uppercase' }}>
          Your Hand
        </div>

        {/* 手牌 */}
        <div style={{ marginBottom: 12 }}>
          {selectedPlayer && selectedPlayer.holeCards.length > 0 ? (
            selectedPlayer.holeCards.map((card, i) => (
              <HUDCard key={i} card={card} size="large" />
            ))
          ) : (
            <>
              <EmptyCard size="large" />
              <EmptyCard size="large" />
            </>
          )}
        </div>

        {/* 筹码和状态 */}
        {selectedPlayer && (
          <div style={{ fontSize: 14 }}>
            <span style={{ color: '#888' }}>Chips: </span>
            <span style={{ color: '#4a90d9', fontWeight: 'bold', fontSize: 16 }}>
              ${selectedPlayer.chips}
            </span>

            {selectedPlayer.bet > 0 && (
              <>
                <span style={{ color: '#555', margin: '0 8px' }}>|</span>
                <span style={{ color: '#888' }}>Bet: </span>
                <span style={{ color: '#ffd700', fontWeight: 'bold' }}>
                  ${selectedPlayer.bet}
                </span>
              </>
            )}

            {selectedPlayer.status !== 'Active' && (
              <div style={{ marginTop: 10 }}>
                <StatusBadge status={selectedPlayer.status} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* ================================================================ */}
      {/* ACTION PANEL - 【H-5】仅透传 snapshot，不派生状态 */}
      {/* ================================================================ */}
      <div style={{ marginBottom: 16 }}>
        <ActionPanel
          snapshot={snapshot}
          selectedPlayerId={selectedPlayerId}
          executor={executor}
        />
      </div>

      {/* ================================================================ */}
      {/* 【Post-Freeze】Pot Odds Display - 当需要 call 时显示 */}
      {/* ================================================================ */}
      {snapshot.amountToCall > 0 && selectedPlayerId === snapshot.currentPlayerId && (
        <div style={{ marginBottom: 16 }}>
          <PotOddsDisplay
            potTotal={snapshot.potTotal}
            amountToCall={snapshot.amountToCall}
            playerStack={selectedPlayer?.chips}
            title="Pot Odds"
            compact={false}
          />
        </div>
      )}

      {/* ================================================================ */}
      {/* NARRATIVE 层 - State Explanation Panel (只读派生) */}
      {/* ================================================================ */}
      {/* 【A 路线】StateExplanationPanel - 从事件推导解释 */}
      {/* 替代旧的简单文本显示，提供更丰富的状态解释 */}
      {/* ================================================================ */}
      {events && events.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <StateExplanationPanel
            event={events[viewModel.index]}
            players={snapshot.players}
            title="What Just Happened"
            showEventType={true}
            compact={false}
          />
        </div>
      )}

      {/* ================================================================ */}
      {/* 【A 路线扩展】SnapshotDiffPanel - 状态变化对比（只读） */}
      {/* ================================================================ */}
      {previousSnapshot && (
        <div style={{ marginBottom: 16 }}>
          <SnapshotDiffPanel
            currentSnapshot={snapshot}
            previousSnapshot={previousSnapshot}
            title="State Changes"
            compact={false}
          />
        </div>
      )}

      {/* ================================================================ */}
      {/* 【Post-Freeze】Street Summary Panel - 每街行动摘要 */}
      {/* ================================================================ */}
      {events && events.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <StreetSummaryPanel
            events={events}
            players={snapshot.players}
            title="Street Summary"
            compact={false}
          />
        </div>
      )}

      {/* ================================================================ */}
      {/* 【A 路线】ActionTimelinePanel - 事件时间线（只读） */}
      {/* ================================================================ */}
      {events && events.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <ActionTimelinePanel
            events={events}
            currentIndex={viewModel.index}
            onSeek={actions.seek}
            maxHeight={200}
          />
        </div>
      )}

      {/* ================================================================ */}
      {/* 控制按钮 - 只有 Prev / Play / Next（无 slider） */}
      {/* ================================================================ */}
      <div>
        {/* 进度指示（只读，不可交互） */}
        <div style={{ textAlign: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 13, color: '#888' }}>
            Step {viewModel.index + 1} of {viewModel.count}
          </span>
        </div>

        {/* 控制按钮 */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 10 }}>
          <button
            onClick={actions.stepBackward}
            disabled={!viewModel.canPrev}
            style={{
              padding: '10px 24px',
              border: 'none',
              borderRadius: 6,
              background: viewModel.canPrev ? '#555' : '#333',
              color: viewModel.canPrev ? '#fff' : '#666',
              cursor: viewModel.canPrev ? 'pointer' : 'not-allowed',
              fontSize: 14,
              fontWeight: 500,
              transition: 'background 0.2s',
            }}
          >
            ← Prev
          </button>

          <button
            onClick={actions.togglePlayPause}
            style={{
              padding: '10px 32px',
              border: 'none',
              borderRadius: 6,
              background: viewModel.playing ? '#dc2626' : '#4a90d9',
              color: '#fff',
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 'bold',
              transition: 'background 0.2s',
            }}
          >
            {viewModel.playing ? 'Pause' : 'Play'}
          </button>

          <button
            onClick={actions.stepForward}
            disabled={!viewModel.canNext}
            style={{
              padding: '10px 24px',
              border: 'none',
              borderRadius: 6,
              background: viewModel.canNext ? '#555' : '#333',
              color: viewModel.canNext ? '#fff' : '#666',
              cursor: viewModel.canNext ? 'pointer' : 'not-allowed',
              fontSize: 14,
              fontWeight: 500,
              transition: 'background 0.2s',
            }}
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}
