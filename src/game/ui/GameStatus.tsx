/**
 * GameStatus.tsx
 * Phase L3 - Game status display
 *
 * Shows:
 * - Current street
 * - Pot size
 * - Blinds info
 * - Whose turn it is
 */

import React from 'react';
import { TableState, Street, getCurrentPlayer } from '../engine/TableState';

// ============================================================================
// Display Helpers
// ============================================================================

/**
 * Format chip amounts with commas for readability
 */
function formatChips(amount: number): string {
  return amount.toLocaleString('en-US');
}

// ============================================================================
// Types
// ============================================================================

interface GameStatusProps {
  readonly state: TableState;
  readonly heroIndex: number;
  readonly message?: string;
}

// ============================================================================
// Styles
// ============================================================================

const styles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 24px',
    backgroundColor: 'rgba(15, 15, 20, 0.9)',
    borderRadius: '8px',
    border: '1px solid rgba(75, 85, 99, 0.3)',
    marginBottom: '16px',
    fontFamily: 'system-ui, sans-serif',
  },

  section: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },

  item: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '2px',
  },

  label: {
    fontSize: '10px',
    color: 'rgba(156, 163, 175, 0.7)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },

  value: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#fff',
  },

  streetBadge: {
    padding: '4px 12px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
  },

  turnIndicator: {
    padding: '6px 16px',
    borderRadius: '16px',
    fontSize: '12px',
    fontWeight: 600,
  },

  message: {
    padding: '8px 16px',
    borderRadius: '8px',
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
    color: '#818cf8',
    fontSize: '13px',
    fontWeight: 500,
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

function getStreetStyle(street: Street): React.CSSProperties {
  const base = { ...styles.streetBadge };

  switch (street) {
    case 'preflop':
      return { ...base, backgroundColor: 'rgba(107, 114, 128, 0.3)', color: '#9ca3af' };
    case 'flop':
      return { ...base, backgroundColor: 'rgba(34, 197, 94, 0.2)', color: '#22c55e' };
    case 'turn':
      return { ...base, backgroundColor: 'rgba(234, 179, 8, 0.2)', color: '#eab308' };
    case 'river':
      return { ...base, backgroundColor: 'rgba(239, 68, 68, 0.2)', color: '#ef4444' };
    case 'showdown':
      return { ...base, backgroundColor: 'rgba(168, 85, 247, 0.2)', color: '#a855f7' };
    case 'complete':
      return { ...base, backgroundColor: 'rgba(59, 130, 246, 0.2)', color: '#3b82f6' };
    default:
      return { ...base, backgroundColor: 'rgba(75, 85, 99, 0.3)', color: '#6b7280' };
  }
}

function formatStreet(street: Street): string {
  switch (street) {
    case 'preflop': return 'Pre-Flop';
    case 'flop': return 'Flop';
    case 'turn': return 'Turn';
    case 'river': return 'River';
    case 'showdown': return 'Showdown';
    case 'complete': return 'Complete';
    case 'waiting': return 'Waiting';
    default: return street;
  }
}

// ============================================================================
// Main Component
// ============================================================================

export function GameStatus({
  state,
  heroIndex,
  message,
}: GameStatusProps): React.ReactElement {
  const currentPlayer = getCurrentPlayer(state);
  const isHeroTurn = state.activePlayerIndex === heroIndex;
  const isGameOver = state.street === 'complete' || state.street === 'showdown';

  return (
    <div style={styles.container}>
      {/* Left Section: Street & Blinds */}
      <div style={styles.section}>
        <div style={styles.item}>
          <span style={styles.label}>Street</span>
          <span style={getStreetStyle(state.street)}>
            {formatStreet(state.street)}
          </span>
        </div>

        <div style={styles.item}>
          <span style={styles.label}>Blinds</span>
          <span style={styles.value}>${formatChips(state.smallBlind)} / ${formatChips(state.bigBlind)}</span>
        </div>

        <div style={styles.item}>
          <span style={styles.label}>Pot</span>
          <span style={{ ...styles.value, color: '#fbbf24', fontSize: '16px' }}>${formatChips(state.pot)}</span>
        </div>
      </div>

      {/* Center: Message */}
      {message && (
        <div style={styles.message}>{message}</div>
      )}

      {/* Right Section: Turn Indicator */}
      <div style={styles.section}>
        {!isGameOver && currentPlayer && (
          <div
            style={{
              ...styles.turnIndicator,
              backgroundColor: isHeroTurn ? 'rgba(74, 222, 128, 0.2)' : 'rgba(251, 191, 36, 0.2)',
              color: isHeroTurn ? '#4ade80' : '#fbbf24',
            }}
          >
            {isHeroTurn ? '🎯 Your Turn' : `⏳ ${currentPlayer.name}'s Turn`}
          </div>
        )}

        {isGameOver && state.winners.length > 0 && (
          <div
            style={{
              ...styles.turnIndicator,
              backgroundColor: 'rgba(168, 85, 247, 0.2)',
              color: '#a855f7',
            }}
          >
            🏆 {state.players[state.winners[0]]?.name} Wins!
          </div>
        )}
      </div>
    </div>
  );
}

export default GameStatus;
