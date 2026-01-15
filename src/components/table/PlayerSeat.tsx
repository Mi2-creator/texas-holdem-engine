// ============================================================================
// PlayerSeat - 玩家座位组件
// ============================================================================
//
// 纯展示组件，根据 PlayerSnapshot 渲染单个玩家座位。
// 不持有任何状态，底牌可见性由 phase 决定。
//
// ============================================================================

import React from 'react';
import { PlayerSnapshot } from '../../types/replay';
import { Card } from './Card';

interface PlayerSeatProps {
  player: PlayerSnapshot;
  isCurrentActor: boolean;
  phase: string;
  position: SeatPosition;
}

/**
 * 座位位置类型
 */
export type SeatPosition =
  | 'bottom'      // Seat 0 (Hero)
  | 'bottom-left' // Seat 1
  | 'left'        // Seat 2
  | 'top-left'    // Seat 3
  | 'top'         // Seat 4
  | 'top-right'   // Seat 5
  | 'right'       // Seat 6
  | 'bottom-right'; // Seat 7

/**
 * PlayerSeat 玩家座位
 */
export function PlayerSeat({
  player,
  isCurrentActor,
  phase,
  position,
}: PlayerSeatProps): React.ReactElement {
  const statusClass = `status-${player.status.toLowerCase()}`;
  const currentClass = isCurrentActor ? 'current-actor' : '';
  const positionClass = `seat-${position}`;

  // 决定是否显示底牌
  const showHoleCards = shouldShowHoleCards(phase, player.status);

  return (
    <div className={`player-seat ${statusClass} ${currentClass} ${positionClass}`}>
      {/* 当前行动指示器 */}
      {isCurrentActor && (
        <div className="action-indicator">
          <span className="indicator-arrow">▶</span>
        </div>
      )}

      {/* 位置标记 (D/SB/BB) */}
      <PositionBadge player={player} />

      {/* 玩家信息 */}
      <div className="player-info">
        <span className="player-name">{player.name}</span>
        <span className="player-chips">{player.chips}</span>
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
      {player.bet > 0 && (
        <div className="player-bet">
          <span className="bet-amount">{player.bet}</span>
        </div>
      )}

      {/* 状态标签 */}
      <StatusBadge status={player.status} />
    </div>
  );
}

/**
 * PositionBadge 位置标记
 */
function PositionBadge({ player }: { player: PlayerSnapshot }): React.ReactElement | null {
  if (player.isDealer) {
    return <span className="position-badge dealer">D</span>;
  }
  if (player.isSmallBlind) {
    return <span className="position-badge small-blind">SB</span>;
  }
  if (player.isBigBlind) {
    return <span className="position-badge big-blind">BB</span>;
  }
  return null;
}

/**
 * HoleCards 底牌显示
 */
interface HoleCardsProps {
  cards: import('../../types/replay').CardSnapshot[];
  showCards: boolean;
  status: string;
}

function HoleCards({ cards, showCards, status }: HoleCardsProps): React.ReactElement {
  // 已弃牌：不显示
  if (status === 'Folded') {
    return <span className="cards-folded">—</span>;
  }

  // 无底牌数据
  if (!cards || cards.length === 0) {
    return (
      <>
        <Card faceDown size="small" />
        <Card faceDown size="small" />
      </>
    );
  }

  // 显示底牌
  if (showCards) {
    return (
      <>
        {cards.map((card, i) => (
          <Card key={i} card={card} size="small" />
        ))}
      </>
    );
  }

  // 隐藏底牌（背面）
  return (
    <>
      <Card faceDown size="small" />
      <Card faceDown size="small" />
    </>
  );
}

/**
 * StatusBadge 状态标签
 */
function StatusBadge({ status }: { status: string }): React.ReactElement | null {
  switch (status) {
    case 'Folded':
      return <span className="status-badge folded">FOLD</span>;
    case 'AllIn':
      return <span className="status-badge allin">ALL IN</span>;
    default:
      return null;
  }
}

/**
 * 决定是否显示底牌
 */
function shouldShowHoleCards(phase: string, status: string): boolean {
  // 已弃牌不显示
  if (status === 'Folded') {
    return false;
  }
  // Showdown 或 Complete 阶段显示所有底牌
  return phase === 'Showdown' || phase === 'Complete';
}

/**
 * 空座位占位符
 */
export function EmptySeat({ position }: { position: SeatPosition }): React.ReactElement {
  return (
    <div className={`player-seat empty seat-${position}`}>
      <span className="empty-label">Empty</span>
    </div>
  );
}
