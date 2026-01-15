// ============================================================================
// PokerTable - 德州扑克牌桌展示组件
// ============================================================================
//
// 纯展示组件，只读取 viewModel 数据，不包含任何业务逻辑。
// 使用 CSS transition 实现动画效果。
//
// ============================================================================

import React, { useEffect, useState, useRef } from 'react';
import { ReplayViewModel, PlayerSnapshot, CardSnapshot } from '../types/replay';

// CSS Keyframes for current player animations
const ANIMATION_STYLES = `
@keyframes seatPulseGlow {
  0%, 100% { box-shadow: 0 0 24px rgba(74, 222, 128, 0.4), 0 6px 20px rgba(0,0,0,0.5); }
  50% { box-shadow: 0 0 36px rgba(74, 222, 128, 0.6), 0 6px 20px rgba(0,0,0,0.5); }
}
@keyframes actingLabelFadeIn {
  from { opacity: 0; transform: translateX(-50%) translateY(-6px); }
  to { opacity: 1; transform: translateX(-50%) translateY(0); }
}
`;

interface PokerTableProps {
  viewModel: ReplayViewModel;
}

// 9 个座位的位置（椭圆形排列）
const SEAT_POSITIONS: Array<{ top: string; left: string }> = [
  { top: '80%', left: '50%' },   // 0: 底部中间
  { top: '70%', left: '15%' },   // 1: 左下
  { top: '40%', left: '5%' },    // 2: 左中
  { top: '10%', left: '15%' },   // 3: 左上
  { top: '0%', left: '50%' },    // 4: 顶部中间
  { top: '10%', left: '85%' },   // 5: 右上
  { top: '40%', left: '95%' },   // 6: 右中
  { top: '70%', left: '85%' },   // 7: 右下
  { top: '80%', left: '70%' },   // 8: 底部右
];

// Bet chip 位置偏移（相对于座位）
const BET_OFFSETS: Array<{ top: number; left: number }> = [
  { top: -50, left: 0 },    // 0: 底部中间 → 向上
  { top: -30, left: 40 },   // 1: 左下 → 右上
  { top: 0, left: 60 },     // 2: 左中 → 向右
  { top: 30, left: 40 },    // 3: 左上 → 右下
  { top: 50, left: 0 },     // 4: 顶部中间 → 向下
  { top: 30, left: -40 },   // 5: 右上 → 左下
  { top: 0, left: -60 },    // 6: 右中 → 向左
  { top: -30, left: -40 },  // 7: 右下 → 左上
  { top: -50, left: -30 },  // 8: 底部右 → 左上
];

interface CommunityCardProps {
  card: CardSnapshot;
  index: number;
  isNew: boolean;
}

function CommunityCard({ card, index, isNew }: CommunityCardProps) {
  const [visible, setVisible] = useState(!isNew);
  const isRed = card.suitCode === 'H' || card.suitCode === 'D';

  useEffect(() => {
    if (isNew) {
      // 延迟触发 fade-in
      const timer = setTimeout(() => setVisible(true), 50);
      return () => clearTimeout(timer);
    }
  }, [isNew]);

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 48,
        height: 64,
        margin: '0 3px',
        border: '1px solid rgba(0,0,0,0.2)',
        borderRadius: 6,
        background: 'linear-gradient(180deg, #ffffff 0%, #f5f5f5 100%)',
        color: isRed ? '#dc2626' : '#1a1a1a',
        fontWeight: 700,
        fontSize: 20,
        fontFamily: "'Georgia', serif",
        boxShadow: '0 4px 12px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.8)',
        opacity: visible ? 1 : 0,
        transform: visible ? 'scale(1) translateY(0)' : 'scale(0.8) translateY(-10px)',
        transition: 'opacity 0.3s ease, transform 0.3s ease',
        letterSpacing: '-1px',
      }}
    >
      {card.display}
    </span>
  );
}

function HoleCard({ card }: { card: CardSnapshot }) {
  const isRed = card.suitCode === 'H' || card.suitCode === 'D';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 28,
        height: 38,
        margin: '0 1px',
        border: '1px solid rgba(0,0,0,0.15)',
        borderRadius: 4,
        background: 'linear-gradient(180deg, #ffffff 0%, #f8f8f8 100%)',
        color: isRed ? '#dc2626' : '#1a1a1a',
        fontWeight: 700,
        fontSize: 12,
        fontFamily: "'Georgia', serif",
        boxShadow: '0 2px 6px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.9)',
        letterSpacing: '-0.5px',
      }}
    >
      {card.display}
    </span>
  );
}

interface BetChipProps {
  amount: number;
  offset: { top: number; left: number };
}

// Chip color tiers based on amount
function getChipStyle(amount: number): { bg: string; border: string; text: string } {
  if (amount >= 100) {
    // High - Black/Purple
    return {
      bg: 'linear-gradient(135deg, #2d2d2d 0%, #1a1a1a 100%)',
      border: '#4a4a4a',
      text: '#ffd700',
    };
  } else if (amount >= 25) {
    // Medium - Green
    return {
      bg: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
      border: '#15803d',
      text: '#fff',
    };
  } else {
    // Low - Red
    return {
      bg: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
      border: '#b91c1c',
      text: '#fff',
    };
  }
}

// Visual polish constants for BetChip
// These values ensure chips don't dominate the visual hierarchy over community cards
const BET_CHIP_BASE_SCALE = 0.92;      // Slightly smaller to reduce visual weight
const BET_CHIP_OPACITY = 0.92;          // Subtle de-emphasis without losing readability
const BET_CHIP_TRANSLATE_Y = -4;        // Slight upward nudge to stay "on felt" visually

function BetChip({ amount, offset }: BetChipProps) {
  const [scale, setScale] = useState(1);
  const chipStyle = getChipStyle(amount);

  useEffect(() => {
    // 金额变化时触发 scale 动画
    setScale(1.3);
    const timer = setTimeout(() => setScale(1), 150);
    return () => clearTimeout(timer);
  }, [amount]);

  // Final scale combines base reduction with animation
  const finalScale = BET_CHIP_BASE_SCALE * scale;

  return (
    <div
      style={{
        position: 'absolute',
        top: offset.top,
        left: offset.left,
        transform: `translate(-50%, -50%) scale(${finalScale}) translateY(${BET_CHIP_TRANSLATE_Y}px)`,
        transition: 'transform 0.15s ease',
        background: chipStyle.bg,
        border: `3px solid ${chipStyle.border}`,
        borderRadius: '50%',
        width: 38,
        height: 38,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 11,
        fontWeight: 700,
        color: chipStyle.text,
        boxShadow: '0 3px 8px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.2)',
        fontFamily: "'Arial', sans-serif",
        opacity: BET_CHIP_OPACITY,
      }}
    >
      {amount}
    </div>
  );
}

interface PlayerSeatProps {
  player: PlayerSnapshot | null;
  position: { top: string; left: string };
  betOffset: { top: number; left: number };
  isHandActive: boolean;
}

function PlayerSeat({ player, position, betOffset, isHandActive }: PlayerSeatProps) {
  const isEmpty = !player;
  const isCurrent = player?.isCurrent ?? false;
  const shouldAnimate = isCurrent && isHandActive;
  const isFolded = player?.status === 'Folded';
  const isAllIn = player?.status === 'AllIn';

  // Background based on state
  const seatBackground = isEmpty
    ? 'linear-gradient(180deg, #3d3d3d 0%, #2a2a2a 100%)'
    : isCurrent
    ? 'linear-gradient(180deg, #1e4620 0%, #153318 100%)'
    : isFolded
    ? 'linear-gradient(180deg, #333333 0%, #262626 100%)'
    : 'linear-gradient(180deg, #404040 0%, #333333 100%)';

  return (
    <div
      style={{
        position: 'absolute',
        top: position.top,
        left: position.left,
        transform: `translate(-50%, -50%) scale(${isCurrent ? 1.06 : 1})`,
        transition: 'transform 0.25s ease-out, border-color 0.3s ease, box-shadow 0.3s ease',
        width: 115,
        padding: '10px 8px',
        background: seatBackground,
        border: isCurrent
          ? '2px solid #4ade80'
          : '1px solid rgba(255,255,255,0.1)',
        borderRadius: 12,
        color: '#fff',
        textAlign: 'center',
        boxShadow: isCurrent
          ? '0 0 24px rgba(74, 222, 128, 0.4), 0 6px 20px rgba(0,0,0,0.5)'
          : '0 4px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)',
        opacity: isFolded ? 0.55 : 1,
        animation: shouldAnimate ? 'seatPulseGlow 1.5s ease-in-out infinite' : 'none',
      }}
    >
      {/* ACTING 标签 - Tier 1: Most prominent */}
      {isCurrent && (
        <div
          style={{
            position: 'absolute',
            top: -10,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
            color: '#1a1a1a',
            fontSize: 9,
            fontWeight: 800,
            padding: '3px 10px',
            borderRadius: 4,
            whiteSpace: 'nowrap',
            boxShadow: '0 2px 8px rgba(251, 191, 36, 0.4)',
            animation: 'actingLabelFadeIn 0.2s ease-out',
            letterSpacing: '0.5px',
            textTransform: 'uppercase',
          }}
        >
          ▶ Acting
        </div>
      )}

      {isEmpty ? (
        <div style={{ color: '#555', padding: 12, fontSize: 11 }}>Empty</div>
      ) : (
        <>
          {/* Tier 2: Player name */}
          <div
            style={{
              fontWeight: 600,
              fontSize: 13,
              marginBottom: 2,
              color: isCurrent ? '#fff' : '#e5e5e5',
              letterSpacing: '0.3px',
            }}
          >
            {player.name}
          </div>

          {/* Role badges */}
          <div style={{ fontSize: 9, marginBottom: 6, minHeight: 14 }}>
            {player.isDealer && (
              <span
                style={{
                  display: 'inline-block',
                  background: '#fbbf24',
                  color: '#1a1a1a',
                  padding: '1px 5px',
                  borderRadius: 3,
                  fontWeight: 700,
                  marginRight: 3,
                }}
              >
                D
              </span>
            )}
            {player.isSmallBlind && (
              <span style={{ color: '#93c5fd', fontWeight: 600 }}>SB </span>
            )}
            {player.isBigBlind && (
              <span style={{ color: '#fca5a5', fontWeight: 600 }}>BB</span>
            )}
          </div>

          {/* Tier 2: Chips */}
          <div
            style={{
              color: isCurrent ? '#86efac' : '#a3a3a3',
              fontSize: 14,
              fontWeight: 700,
              fontFamily: "'Arial', sans-serif",
            }}
          >
            ${player.chips.toLocaleString()}
          </div>

          {/* Tier 3: Status label */}
          {!isFolded && !isAllIn ? null : (
            <div
              style={{
                marginTop: 4,
                display: 'inline-block',
                padding: '2px 8px',
                borderRadius: 4,
                fontSize: 9,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                background: isAllIn ? 'rgba(239, 68, 68, 0.9)' : 'rgba(100,100,100,0.6)',
                color: isAllIn ? '#fff' : '#999',
              }}
            >
              {player.status}
            </div>
          )}

          {/* Hole cards */}
          {player.holeCards.length > 0 && (
            <div style={{ marginTop: 6, display: 'flex', justifyContent: 'center', gap: 2 }}>
              {player.holeCards.map((card, i) => (
                <HoleCard key={i} card={card} />
              ))}
            </div>
          )}
        </>
      )}

      {/* Bet chip */}
      {player && player.bet > 0 && (
        <BetChip amount={player.bet} offset={betOffset} />
      )}
    </div>
  );
}

interface PotDisplayProps {
  amount: number;
}

function PotDisplay({ amount }: PotDisplayProps) {
  const [scale, setScale] = useState(1);
  const prevAmount = useRef(amount);

  useEffect(() => {
    if (amount !== prevAmount.current) {
      setScale(1.15);
      const timer = setTimeout(() => setScale(1), 200);
      prevAmount.current = amount;
      return () => clearTimeout(timer);
    }
  }, [amount]);

  return (
    <div
      style={{
        display: 'inline-block',
        padding: '8px 20px',
        background: 'rgba(0,0,0,0.4)',
        borderRadius: 8,
        border: '1px solid rgba(255,215,0,0.3)',
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: '#a3a3a3',
          textTransform: 'uppercase',
          letterSpacing: '1px',
          marginBottom: 2,
        }}
      >
        Total Pot
      </div>
      <div
        style={{
          fontSize: 26,
          color: '#fbbf24',
          fontWeight: 700,
          textShadow: '0 2px 8px rgba(251, 191, 36, 0.3)',
          transform: `scale(${scale})`,
          transition: 'transform 0.2s ease',
          fontFamily: "'Arial', sans-serif",
        }}
      >
        ${amount.toLocaleString()}
      </div>
    </div>
  );
}

export function PokerTable({ viewModel }: PokerTableProps) {
  const { snapshot } = viewModel;
  const players = snapshot.players;
  const isHandActive = snapshot.isActive;

  // 追踪上一次的公共牌数量，用于判断新牌
  const prevCardCount = useRef(0);
  const currentCardCount = snapshot.communityCards.length;

  // 判断哪些牌是新出现的
  const newCardStartIndex = prevCardCount.current;

  useEffect(() => {
    prevCardCount.current = currentCardCount;
  }, [currentCardCount]);

  // 创建 9 个座位的玩家映射
  const seatMap = new Map<number, PlayerSnapshot>();
  players.forEach((p) => seatMap.set(p.seat, p));

  return (
    <div
      style={{
        position: 'relative',
        width: 750,
        height: 520,
        margin: '20px auto',
        // Premium felt texture with radial gradient
        background: `
          radial-gradient(ellipse at center, #1e5631 0%, #143d22 50%, #0c2615 100%)
        `,
        borderRadius: 220,
        // Wood grain table edge
        border: '14px solid #5c3d2e',
        borderTopColor: '#6b4a3a',
        borderBottomColor: '#4a2f22',
        boxShadow: `
          0 12px 48px rgba(0,0,0,0.7),
          inset 0 0 80px rgba(0,0,0,0.4),
          inset 0 0 20px rgba(0,0,0,0.2)
        `,
      }}
    >
      {/* Inject CSS keyframes for animations */}
      <style>{ANIMATION_STYLES}</style>

      {/* Outer ring - subtle gold trim */}
      <div
        style={{
          position: 'absolute',
          top: 6,
          left: 6,
          right: 6,
          bottom: 6,
          borderRadius: 212,
          border: '2px solid rgba(255,215,0,0.15)',
          pointerEvents: 'none',
        }}
      />

      {/* Inner ring - betting line */}
      <div
        style={{
          position: 'absolute',
          top: '15%',
          left: '10%',
          right: '10%',
          bottom: '15%',
          borderRadius: 180,
          border: '1px dashed rgba(255,255,255,0.08)',
          pointerEvents: 'none',
        }}
      />

      {/* Center felt highlight */}
      <div
        style={{
          position: 'absolute',
          top: '25%',
          left: '25%',
          right: '25%',
          bottom: '30%',
          borderRadius: 120,
          background: 'radial-gradient(ellipse at center, rgba(255,255,255,0.03) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      {/* Phase indicator */}
      <div
        style={{
          position: 'absolute',
          top: '18%',
          left: '50%',
          transform: 'translateX(-50%)',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            display: 'inline-block',
            padding: '4px 16px',
            background: 'rgba(0,0,0,0.3)',
            borderRadius: 12,
            fontSize: 12,
            color: '#86efac',
            textTransform: 'uppercase',
            letterSpacing: '2px',
            fontWeight: 600,
          }}
        >
          {viewModel.phase || 'Waiting'}
        </div>
      </div>

      {/* ============================================================ */}
      {/* Layer 1: Player Seats (rendered first, below center content) */}
      {/* ============================================================ */}
      {SEAT_POSITIONS.map((pos, seatIndex) => (
        <PlayerSeat
          key={seatIndex}
          player={seatMap.get(seatIndex) || null}
          position={pos}
          betOffset={BET_OFFSETS[seatIndex]}
          isHandActive={isHandActive}
        />
      ))}

      {/* ============================================================ */}
      {/* Layer 2: Center content (rendered after seats, on top)      */}
      {/* ============================================================ */}

      {/* Pot display */}
      <div
        style={{
          position: 'absolute',
          top: '28%',
          left: '50%',
          transform: 'translateX(-50%)',
          textAlign: 'center',
        }}
      >
        <PotDisplay amount={snapshot.potTotal} />
      </div>

      {/* Community cards - always on top of chips */}
      <div
        style={{
          position: 'absolute',
          top: '47%',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          gap: 8,
          minHeight: 64,
          padding: '8px 16px',
          background: 'rgba(0,0,0,0.25)',
          borderRadius: 12,
          // Ensure visual separation from chip area
          boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
        }}
      >
        {snapshot.communityCards.length > 0 ? (
          snapshot.communityCards.map((card, i) => (
            <CommunityCard
              key={`${card.display}-${i}`}
              card={card}
              index={i}
              isNew={i >= newCardStartIndex}
            />
          ))
        ) : (
          <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 13, padding: '20px 40px' }}>
            Waiting for flop...
          </span>
        )}
      </div>

      {/* Progress indicator */}
      <div
        style={{
          position: 'absolute',
          top: '68%',
          left: '50%',
          transform: 'translateX(-50%)',
          color: 'rgba(255,255,255,0.35)',
          fontSize: 10,
          letterSpacing: '0.5px',
        }}
      >
        Event {viewModel.index + 1} of {viewModel.count}
      </div>
    </div>
  );
}
