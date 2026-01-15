// ============================================================================
// SeatsLayout - 座位布局组件
// ============================================================================
//
// 纯展示组件，将玩家按椭圆形布局排列。
// 不持有任何状态。
//
// ============================================================================

import React from 'react';
import { GameSnapshot, PlayerSnapshot } from '../../types/replay';
import { PlayerSeat, EmptySeat, SeatPosition } from './PlayerSeat';

interface SeatsLayoutProps {
  snapshot: GameSnapshot;
}

/**
 * 座位位置映射
 * 按椭圆形布局：Seat 0 在底部（Hero 位置）
 */
const SEAT_POSITIONS: SeatPosition[] = [
  'bottom',       // Seat 0 - Hero
  'bottom-left',  // Seat 1
  'left',         // Seat 2
  'top-left',     // Seat 3
  'top',          // Seat 4
  'top-right',    // Seat 5
  'right',        // Seat 6
  'bottom-right', // Seat 7
];

/**
 * SeatsLayout 座位布局
 */
export function SeatsLayout({ snapshot }: SeatsLayoutProps): React.ReactElement {
  const { players, currentPlayerId, phase } = snapshot;

  // 创建座位映射 (seat -> player)
  const seatMap = new Map<number, PlayerSnapshot>();
  players.forEach((player) => {
    seatMap.set(player.seat, player);
  });

  // 渲染所有座位
  return (
    <div className="seats-layout">
      {SEAT_POSITIONS.map((position, seatIndex) => {
        const player = seatMap.get(seatIndex);

        if (!player) {
          return (
            <EmptySeat key={seatIndex} position={position} />
          );
        }

        return (
          <PlayerSeat
            key={player.id}
            player={player}
            isCurrentActor={player.id === currentPlayerId}
            phase={phase}
            position={position}
          />
        );
      })}
    </div>
  );
}
