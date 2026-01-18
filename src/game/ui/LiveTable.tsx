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
import { Card, SUIT_SYMBOLS } from '../engine/Card';
import { TableState, Player, getPositionLabel } from '../engine/TableState';

// ============================================================================
// Display Helpers
// ============================================================================

/**
 * Format card for UI display - shows "10" instead of "T" for readability
 */
function formatCardDisplay(card: Card): string {
  const rankDisplay: Record<number, string> = {
    2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9',
    10: '10', // Show "10" not "T" for clarity
    11: 'J', 12: 'Q', 13: 'K', 14: 'A',
  };
  return `${rankDisplay[card.rank]}${SUIT_SYMBOLS[card.suit]}`;
}

/**
 * Format chip amounts with commas for readability (e.g., 1000 -> "1,000")
 */
function formatChips(amount: number): string {
  return amount.toLocaleString('en-US');
}

// ============================================================================
// Types
// ============================================================================

interface LiveTableProps {
  readonly state: TableState;
  readonly heroIndex: number;
  readonly showOpponentCards: boolean;
  readonly lastActions?: Record<number, string>;
  readonly thinkingPlayerIndex?: number | null;
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

  lastAction: {
    padding: '4px 10px',
    borderRadius: '12px',
    fontSize: '11px',
    fontWeight: 600,
    marginTop: '4px',
    textTransform: 'capitalize' as const,
  },

  positionBadge: {
    position: 'absolute' as const,
    top: '-8px',
    right: '-8px',
    padding: '2px 6px',
    borderRadius: '4px',
    fontSize: '9px',
    fontWeight: 700,
    letterSpacing: '0.5px',
  },

  thinkingIndicator: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 10px',
    borderRadius: '12px',
    backgroundColor: 'rgba(99, 102, 241, 0.25)',
    color: '#a5b4fc',
    fontSize: '11px',
    fontWeight: 500,
    marginTop: '4px',
  },

  thinkingDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    backgroundColor: '#a5b4fc',
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
        className="animate-card-deal"
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
  const display = formatCardDisplay(card);

  return (
    <div
      className="animate-card-deal"
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
  readonly lastAction?: string;
  readonly positionLabel?: 'BTN' | 'SB' | 'BB' | '';
  readonly isThinking?: boolean;
}

function PlayerPosition({
  player,
  position,
  isHero,
  isActive,
  showCards,
  lastAction,
  positionLabel,
  isThinking,
}: PlayerPositionProps): React.ReactElement {
  const isFolded = player.status === 'folded';
  const isAllIn = player.status === 'all-in';
  const isOut = player.status === 'out';

  // Position badge colors
  const getPositionColor = (label: string): { bg: string; text: string } => {
    switch (label) {
      case 'BTN': return { bg: 'rgba(255, 255, 255, 0.9)', text: '#000' };
      case 'SB': return { bg: 'rgba(59, 130, 246, 0.8)', text: '#fff' };
      case 'BB': return { bg: 'rgba(234, 179, 8, 0.8)', text: '#000' };
      default: return { bg: 'transparent', text: 'transparent' };
    }
  };

  // Color for last action indicator
  const getActionColor = (action: string): { bg: string; text: string } => {
    if (action.includes('fold')) return { bg: 'rgba(239, 68, 68, 0.25)', text: '#ef4444' };
    if (action.includes('check')) return { bg: 'rgba(156, 163, 175, 0.25)', text: '#9ca3af' };
    if (action.includes('call')) return { bg: 'rgba(34, 197, 94, 0.25)', text: '#22c55e' };
    if (action.includes('bet') || action.includes('raise')) return { bg: 'rgba(59, 130, 246, 0.25)', text: '#3b82f6' };
    if (action.includes('ALL-IN')) return { bg: 'rgba(168, 85, 247, 0.3)', text: '#a855f7' };
    return { bg: 'rgba(75, 85, 99, 0.25)', text: '#6b7280' };
  };

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
        className={isActive ? 'animate-active-player' : undefined}
        style={{
          ...styles.playerInfo,
          ...(isActive ? styles.playerInfoActive : {}),
          position: 'relative' as const,
        }}
      >
        {/* Position Badge */}
        {positionLabel && (
          <div
            style={{
              ...styles.positionBadge,
              backgroundColor: getPositionColor(positionLabel).bg,
              color: getPositionColor(positionLabel).text,
            }}
          >
            {positionLabel}
          </div>
        )}
        <div style={styles.playerName}>
          {player.name}
          {isHero && ' (You)'}
        </div>
        <div style={styles.playerStack}>
          ${formatChips(player.stack)}
          {isAllIn && <span style={{ color: '#ef4444', marginLeft: 4 }}>ALL-IN</span>}
        </div>
        {player.currentBet > 0 && (
          <div style={styles.playerBet}>Bet: ${formatChips(player.currentBet)}</div>
        )}
        {isFolded && (
          <div style={{ color: '#9ca3af', fontSize: 10 }}>FOLDED</div>
        )}
      </div>

      {/* Thinking Indicator */}
      {isThinking && !isFolded && (
        <div style={styles.thinkingIndicator}>
          <div
            className="animate-thinking-dot"
            style={{ ...styles.thinkingDot, animationDelay: '0ms' }}
          />
          <div
            className="animate-thinking-dot"
            style={{ ...styles.thinkingDot, animationDelay: '200ms' }}
          />
          <div
            className="animate-thinking-dot"
            style={{ ...styles.thinkingDot, animationDelay: '400ms' }}
          />
          <span>Thinking...</span>
        </div>
      )}

      {/* Last Action Indicator */}
      {lastAction && !isFolded && !isThinking && (
        <div
          className="animate-action-slide"
          style={{
            ...styles.lastAction,
            backgroundColor: getActionColor(lastAction).bg,
            color: getActionColor(lastAction).text,
          }}
        >
          {lastAction}
        </div>
      )}
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
  lastActions = {},
  thinkingPlayerIndex,
}: LiveTableProps): React.ReactElement {
  // Player positions based on player count
  const getPositions = (numPlayers: number): Array<{ top: string; left: string }> => {
    if (numPlayers === 2) {
      return [
        { top: '85%', left: '50%' },  // Hero (bottom)
        { top: '15%', left: '50%' },  // Opponent (top)
      ];
    }
    // 3 players: Hero at bottom, opponents at top-left and top-right
    return [
      { top: '85%', left: '50%' },   // Seat 0: Hero (bottom center)
      { top: '20%', left: '25%' },   // Seat 1: Opponent (top-left)
      { top: '20%', left: '75%' },   // Seat 2: Opponent (top-right)
    ];
  };

  const positions = getPositions(state.players.length);

  return (
    <div style={styles.container}>
      {/* Pot Display */}
      {state.pot > 0 && (
        <div style={{
          ...styles.potDisplay,
          // Glow effect for larger pots
          boxShadow: state.pot >= 100 ? '0 0 12px rgba(251, 191, 36, 0.4)' : undefined,
        }}>
          Pot: ${formatChips(state.pot)}
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
          position={positions[index] ?? positions[0]}
          isHero={index === heroIndex}
          isActive={index === state.activePlayerIndex && state.street !== 'showdown' && state.street !== 'complete'}
          showCards={showOpponentCards || index === heroIndex}
          lastAction={lastActions[index]}
          positionLabel={getPositionLabel(state, index)}
          isThinking={index === thinkingPlayerIndex}
        />
      ))}
    </div>
  );
}

export default LiveTable;
