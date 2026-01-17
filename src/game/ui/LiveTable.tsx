/**
 * LiveTable.tsx
 * Phase L3 - Live poker table visualization
 *
 * Shows:
 * - Community cards
 * - Hero hole cards
 * - Opponent cards (face down, revealed at showdown)
 * - Player positions and stacks
 */

import React from 'react';
import { Card, formatCard, SUIT_SYMBOLS } from '../engine/Card';
import { TableState, Player } from '../engine/TableState';

// ============================================================================
// Types
// ============================================================================

interface LiveTableProps {
  readonly state: TableState;
  readonly heroIndex: number;
  readonly showOpponentCards: boolean;
}

// ============================================================================
// Styles
// ============================================================================

const styles = {
  container: {
    position: 'relative' as const,
    width: '700px',
    height: '400px',
    background: 'radial-gradient(ellipse at center, #1a5a1a 0%, #0d3d0d 70%, #082808 100%)',
    borderRadius: '200px',
    border: '12px solid #3d2817',
    boxShadow: '0 8px 32px rgba(0,0,0,0.5), inset 0 2px 8px rgba(0,0,0,0.3)',
    margin: '0 auto',
  },

  communityArea: {
    position: 'absolute' as const,
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
  },

  potDisplay: {
    position: 'absolute' as const,
    top: '35%',
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '6px 16px',
    borderRadius: '16px',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    color: '#fbbf24',
    fontSize: '16px',
    fontWeight: 700,
    fontFamily: 'system-ui, sans-serif',
  },

  playerSeat: {
    position: 'absolute' as const,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '4px',
  },

  playerInfo: {
    padding: '8px 16px',
    borderRadius: '8px',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    border: '2px solid transparent',
    minWidth: '100px',
    textAlign: 'center' as const,
  },

  playerInfoActive: {
    border: '2px solid #4ade80',
    boxShadow: '0 0 16px rgba(74, 222, 128, 0.5)',
  },

  playerName: {
    color: '#fff',
    fontSize: '12px',
    fontWeight: 600,
    marginBottom: '2px',
  },

  playerStack: {
    color: '#fbbf24',
    fontSize: '14px',
    fontWeight: 700,
  },

  playerBet: {
    color: '#60a5fa',
    fontSize: '11px',
    marginTop: '2px',
  },

  holeCards: {
    display: 'flex',
    gap: '4px',
    marginTop: '4px',
  },

  dealerButton: {
    position: 'absolute' as const,
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    backgroundColor: '#fff',
    color: '#000',
    fontSize: '10px',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
  },
};

// ============================================================================
// Card Component
// ============================================================================

interface CardDisplayProps {
  readonly card: Card | null;
  readonly faceDown?: boolean;
  readonly size?: 'small' | 'medium' | 'large';
}

function CardDisplay({ card, faceDown = false, size = 'medium' }: CardDisplayProps): React.ReactElement {
  const sizes = {
    small: { width: 36, height: 50, fontSize: 14 },
    medium: { width: 48, height: 66, fontSize: 18 },
    large: { width: 56, height: 78, fontSize: 22 },
  };

  const { width, height, fontSize } = sizes[size];

  if (faceDown || !card) {
    return (
      <div
        style={{
          width,
          height,
          borderRadius: 4,
          background: 'linear-gradient(135deg, #1e3a5f 0%, #0f1f33 100%)',
          border: '1px solid #2a4a6f',
          boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
        }}
      />
    );
  }

  const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
  const display = formatCard(card);

  return (
    <div
      style={{
        width,
        height,
        borderRadius: 4,
        background: 'linear-gradient(180deg, #ffffff 0%, #f0f0f0 100%)',
        border: '1px solid rgba(0,0,0,0.2)',
        boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: isRed ? '#dc2626' : '#1a1a1a',
        fontSize,
        fontWeight: 700,
        fontFamily: 'Georgia, serif',
      }}
    >
      {display}
    </div>
  );
}

// ============================================================================
// Player Position
// ============================================================================

interface PlayerPositionProps {
  readonly player: Player;
  readonly position: { top: string; left: string };
  readonly isHero: boolean;
  readonly isActive: boolean;
  readonly showCards: boolean;
}

function PlayerPosition({
  player,
  position,
  isHero,
  isActive,
  showCards,
}: PlayerPositionProps): React.ReactElement {
  const isFolded = player.status === 'folded';
  const isAllIn = player.status === 'all-in';

  return (
    <div
      style={{
        ...styles.playerSeat,
        top: position.top,
        left: position.left,
        transform: 'translate(-50%, -50%)',
        opacity: isFolded ? 0.5 : 1,
      }}
    >
      {/* Hole Cards */}
      <div style={styles.holeCards}>
        {player.holeCards.length > 0 ? (
          player.holeCards.map((card, i) => (
            <CardDisplay
              key={i}
              card={card}
              faceDown={!isHero && !showCards}
              size="small"
            />
          ))
        ) : (
          <>
            <CardDisplay card={null} faceDown size="small" />
            <CardDisplay card={null} faceDown size="small" />
          </>
        )}
      </div>

      {/* Player Info */}
      <div
        style={{
          ...styles.playerInfo,
          ...(isActive ? styles.playerInfoActive : {}),
        }}
      >
        <div style={styles.playerName}>
          {player.name}
          {isHero && ' (You)'}
          {player.isDealer && ' 🔘'}
        </div>
        <div style={styles.playerStack}>
          ${player.stack}
          {isAllIn && <span style={{ color: '#ef4444', marginLeft: 4 }}>ALL-IN</span>}
        </div>
        {player.currentBet > 0 && (
          <div style={styles.playerBet}>Bet: ${player.currentBet}</div>
        )}
        {isFolded && (
          <div style={{ color: '#9ca3af', fontSize: 10 }}>FOLDED</div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function LiveTable({
  state,
  heroIndex,
  showOpponentCards,
}: LiveTableProps): React.ReactElement {
  // Player positions for 2-player game
  const positions = [
    { top: '85%', left: '50%' },  // Hero (bottom)
    { top: '15%', left: '50%' },  // Opponent (top)
  ];

  return (
    <div style={styles.container}>
      {/* Pot Display */}
      {state.pot > 0 && (
        <div style={styles.potDisplay}>
          Pot: ${state.pot}
        </div>
      )}

      {/* Community Cards */}
      <div style={styles.communityArea}>
        {state.communityCards.length > 0 ? (
          state.communityCards.map((card, i) => (
            <CardDisplay key={i} card={card} size="medium" />
          ))
        ) : (
          <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 14 }}>
            {state.street === 'preflop' ? 'Preflop' : 'Waiting for cards...'}
          </div>
        )}
      </div>

      {/* Players */}
      {state.players.map((player, index) => (
        <PlayerPosition
          key={player.id}
          player={player}
          position={positions[index]}
          isHero={index === heroIndex}
          isActive={index === state.activePlayerIndex && state.street !== 'showdown' && state.street !== 'complete'}
          showCards={showOpponentCards || index === heroIndex}
        />
      ))}
    </div>
  );
}

export default LiveTable;
