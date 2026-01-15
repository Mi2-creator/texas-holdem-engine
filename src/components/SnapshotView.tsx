// ============================================================================
// SnapshotView - 游戏快照视图
// ============================================================================
//
// 纯函数组件，不持有任何状态。
// 根据 Snapshot 状态渲染不同的 UI：Empty / NoData / Exists。
//
// ============================================================================

import React from 'react';
import { ReplayViewModel, GameSnapshot, CardSnapshot, PlayerSnapshot } from '../types/replay';

interface SnapshotViewProps {
  vm: ReplayViewModel;
}

/**
 * SnapshotView 游戏快照视图
 *
 * 三种状态：
 * 1. Empty: count === 0（无任何数据）
 * 2. NoData: snapshot.handId 为空（异常状态）
 * 3. Exists: 正常显示快照
 */
export function SnapshotView({ vm }: SnapshotViewProps): React.ReactElement {
  const snap = vm.snapshot;

  // ========================================
  // 状态 1: Empty（无任何数据）
  // ========================================
  if (vm.count === 0) {
    return (
      <div className="snapshot-view state-empty">
        <div className="empty-state">
          <span className="icon">📭</span>
          <h3>No Replay Data</h3>
          <p>Please load a hand record to begin replay.</p>
        </div>
      </div>
    );
  }

  // ========================================
  // 状态 2: NoData（Snapshot 异常）
  // ========================================
  if (!snap.handId) {
    return (
      <div className="snapshot-view state-error">
        <div className="empty-state">
          <span className="icon">⚠️</span>
          <h3>Invalid State</h3>
          <p>Snapshot data is missing. Please restart replay.</p>
        </div>
      </div>
    );
  }

  // ========================================
  // 状态 3: Exists（正常显示）
  // ========================================
  return (
    <div className="snapshot-view state-normal">
      {/* 头部信息 */}
      <Header snap={snap} />

      {/* 底池显示 */}
      <PotDisplay snap={snap} />

      {/* 公共牌 */}
      <CommunityCards cards={snap.communityCards} phase={snap.phase} />

      {/* 玩家座位 */}
      <PlayerSeats snap={snap} />
    </div>
  );
}

// ============================================================================
// 子组件
// ============================================================================

/**
 * Header 头部信息
 */
function Header({ snap }: { snap: GameSnapshot }): React.ReactElement {
  return (
    <div className="snapshot-header">
      <span className="hand-id">Hand #{snap.handId}</span>
      <span className="phase">{snap.phase}</span>
      <span className="sequence">Seq: {snap.sequence}</span>
    </div>
  );
}

/**
 * PotDisplay 底池显示
 */
function PotDisplay({ snap }: { snap: GameSnapshot }): React.ReactElement {
  return (
    <div className="pot-display">
      <span className="pot-total">Pot: {snap.potTotal}</span>
      {snap.pots.length > 1 && (
        <span className="pot-details">
          ({snap.pots.map((p, i) => `${p.type}: ${p.amount}`).join(', ')})
        </span>
      )}
    </div>
  );
}

/**
 * CommunityCards 公共牌
 */
interface CommunityCardsProps {
  cards: CardSnapshot[];
  phase: string;
}

function CommunityCards({ cards, phase }: CommunityCardsProps): React.ReactElement {
  // Preflop 无公共牌
  if (cards.length === 0) {
    return (
      <div className="community-cards empty">
        <span className="placeholder">
          {phase === 'Preflop' ? 'Waiting for flop...' : 'No community cards'}
        </span>
      </div>
    );
  }

  return (
    <div className="community-cards">
      {cards.map((card, i) => (
        <Card key={i} card={card} />
      ))}
      {/* 剩余位置占位 */}
      {cards.length < 5 && (
        <span className="remaining">
          {Array(5 - cards.length)
            .fill('🂠')
            .join(' ')}
        </span>
      )}
    </div>
  );
}

/**
 * Card 单张卡牌
 */
function Card({ card }: { card: CardSnapshot }): React.ReactElement {
  const suitClass = `suit-${card.suitCode.toLowerCase()}`;
  return <span className={`card ${suitClass}`}>{card.display}</span>;
}

/**
 * PlayerSeats 玩家座位
 */
function PlayerSeats({ snap }: { snap: GameSnapshot }): React.ReactElement {
  const showHoleCards = snap.phase === 'Showdown' || snap.phase === 'Complete';

  return (
    <div className="player-seats">
      {snap.players.map((player) => (
        <PlayerSeat
          key={player.id}
          player={player}
          isCurrentActor={player.id === snap.currentPlayerId}
          showHoleCards={showHoleCards}
        />
      ))}
    </div>
  );
}

/**
 * PlayerSeat 单个玩家座位
 */
interface PlayerSeatProps {
  player: PlayerSnapshot;
  isCurrentActor: boolean;
  showHoleCards: boolean;
}

function PlayerSeat({
  player,
  isCurrentActor,
  showHoleCards,
}: PlayerSeatProps): React.ReactElement {
  const statusClass = `status-${player.status.toLowerCase()}`;
  const currentClass = isCurrentActor ? 'current-actor' : '';

  return (
    <div className={`player-seat ${statusClass} ${currentClass}`}>
      {/* 玩家信息 */}
      <div className="player-info">
        <span className="player-name">
          {player.name}
          {player.isDealer && ' (D)'}
          {player.isSmallBlind && ' (SB)'}
          {player.isBigBlind && ' (BB)'}
        </span>
        <span className="player-chips">{player.chips} chips</span>
      </div>

      {/* 底牌 */}
      <div className="hole-cards">
        <HoleCards
          cards={player.holeCards}
          showCards={showHoleCards}
          status={player.status}
        />
      </div>

      {/* 当前下注 */}
      {player.bet > 0 && <div className="player-bet">Bet: {player.bet}</div>}

      {/* 状态标签 */}
      {player.status === 'Folded' && <div className="status-label folded">FOLDED</div>}
      {player.status === 'AllIn' && <div className="status-label allin">ALL IN</div>}

      {/* 当前行动指示 */}
      {isCurrentActor && <div className="action-indicator">⬅ Acting</div>}
    </div>
  );
}

/**
 * HoleCards 底牌显示
 */
interface HoleCardsProps {
  cards: CardSnapshot[];
  showCards: boolean;
  status: string;
}

function HoleCards({ cards, showCards, status }: HoleCardsProps): React.ReactElement {
  // 已弃牌：显示空
  if (status === 'Folded') {
    return <span className="cards-folded">--</span>;
  }

  // 无底牌
  if (!cards || cards.length === 0) {
    return <span className="cards-none">🂠 🂠</span>;
  }

  // 显示底牌
  if (showCards) {
    return (
      <>
        {cards.map((card, i) => (
          <Card key={i} card={card} />
        ))}
      </>
    );
  }

  // 隐藏底牌
  return <span className="cards-hidden">🂠 🂠</span>;
}
