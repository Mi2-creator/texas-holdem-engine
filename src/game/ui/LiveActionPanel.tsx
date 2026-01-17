/**
 * LiveActionPanel.tsx
 * Phase L3 - Action buttons for hero player
 *
 * Shows:
 * - Fold button
 * - Check / Call button (context-dependent)
 * - Bet / Raise button with amount selection
 * - All-in button
 *
 * Disabled when not hero's turn.
 */

import React, { useState, useCallback } from 'react';
import { TableState } from '../engine/TableState';
import { PlayerAction, getValidActions, ValidActions } from '../engine/BettingRound';

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

interface LiveActionPanelProps {
  readonly state: TableState;
  readonly heroIndex: number;
  readonly onAction: (action: PlayerAction) => void;
  readonly disabled?: boolean;
}

// ============================================================================
// Styles
// ============================================================================

const styles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    padding: '16px 24px',
    backgroundColor: 'rgba(15, 15, 20, 0.95)',
    borderRadius: '12px',
    border: '1px solid rgba(75, 85, 99, 0.3)',
    fontFamily: 'system-ui, sans-serif',
  },

  button: {
    padding: '12px 24px',
    borderRadius: '8px',
    border: 'none',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    minWidth: '100px',
  },

  foldButton: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    color: '#ef4444',
    border: '1px solid rgba(239, 68, 68, 0.3)',
  },

  checkCallButton: {
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
    color: '#22c55e',
    border: '1px solid rgba(34, 197, 94, 0.3)',
  },

  betRaiseButton: {
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
    color: '#3b82f6',
    border: '1px solid rgba(59, 130, 246, 0.3)',
  },

  allInButton: {
    backgroundColor: 'rgba(168, 85, 247, 0.2)',
    color: '#a855f7',
    border: '1px solid rgba(168, 85, 247, 0.3)',
  },

  disabledButton: {
    opacity: 0.4,
    cursor: 'not-allowed',
  },

  betControls: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },

  betInput: {
    width: '80px',
    padding: '8px 12px',
    borderRadius: '6px',
    border: '1px solid rgba(75, 85, 99, 0.4)',
    backgroundColor: 'rgba(30, 30, 40, 0.8)',
    color: '#fff',
    fontSize: '14px',
    fontWeight: 600,
    textAlign: 'center' as const,
  },

  betPreset: {
    padding: '6px 10px',
    borderRadius: '4px',
    border: '1px solid rgba(75, 85, 99, 0.3)',
    backgroundColor: 'rgba(75, 85, 99, 0.2)',
    color: '#9ca3af',
    fontSize: '11px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },

  betRange: {
    fontSize: '10px',
    color: 'rgba(156, 163, 175, 0.6)',
    marginTop: '4px',
    textAlign: 'center' as const,
  },

  betControlsWrapper: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '4px',
  },

  waitingMessage: {
    color: 'rgba(156, 163, 175, 0.7)',
    fontSize: '14px',
    fontStyle: 'italic' as const,
  },
};

// ============================================================================
// Main Component
// ============================================================================

export function LiveActionPanel({
  state,
  heroIndex,
  onAction,
  disabled = false,
}: LiveActionPanelProps): React.ReactElement {
  const isHeroTurn = state.activePlayerIndex === heroIndex;
  const validActions = getValidActions(state);
  const heroPlayer = state.players[heroIndex];

  const [betAmount, setBetAmount] = useState<number>(
    validActions.canBet ? validActions.minBet :
    validActions.canRaise ? validActions.minRaise :
    state.bigBlind
  );

  // Update bet amount when valid actions change
  React.useEffect(() => {
    if (validActions.canBet) {
      setBetAmount(validActions.minBet);
    } else if (validActions.canRaise) {
      setBetAmount(validActions.minRaise);
    }
  }, [validActions.canBet, validActions.canRaise, validActions.minBet, validActions.minRaise]);

  const handleFold = useCallback(() => {
    onAction({ type: 'fold' });
  }, [onAction]);

  const handleCheckCall = useCallback(() => {
    if (validActions.canCheck) {
      onAction({ type: 'check' });
    } else if (validActions.canCall) {
      onAction({ type: 'call' });
    }
  }, [onAction, validActions]);

  const handleBetRaise = useCallback(() => {
    if (validActions.canBet) {
      onAction({ type: 'bet', amount: betAmount });
    } else if (validActions.canRaise) {
      onAction({ type: 'raise', amount: betAmount });
    }
  }, [onAction, validActions, betAmount]);

  const handleAllIn = useCallback(() => {
    onAction({ type: 'all-in' });
  }, [onAction]);

  const handleBetChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    if (!isNaN(value)) {
      setBetAmount(value);
    }
  }, []);

  const setPresetBet = useCallback((multiplier: number) => {
    const base = validActions.canBet ? state.bigBlind : state.currentBet;
    const newAmount = Math.floor(base * multiplier);
    const max = validActions.canBet ? validActions.maxBet : validActions.maxRaise;
    const min = validActions.canBet ? validActions.minBet : validActions.minRaise;
    setBetAmount(Math.min(Math.max(newAmount, min), max));
  }, [validActions, state]);

  // Not hero's turn - show waiting message
  if (!isHeroTurn || disabled) {
    return (
      <div style={styles.container}>
        <span style={styles.waitingMessage}>
          {disabled ? 'Hand complete' : 'Waiting for opponent...'}
        </span>
      </div>
    );
  }

  const canBetOrRaise = validActions.canBet || validActions.canRaise;
  const betLabel = validActions.canBet ? 'Bet' : 'Raise';
  const minBetRaise = validActions.canBet ? validActions.minBet : validActions.minRaise;
  const maxBetRaise = validActions.canBet ? validActions.maxBet : validActions.maxRaise;

  return (
    <div style={styles.container}>
      {/* Fold */}
      <button
        className="animate-button-press"
        style={{ ...styles.button, ...styles.foldButton }}
        onClick={handleFold}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.35)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.2)';
        }}
      >
        Fold
      </button>

      {/* Check / Call */}
      {(validActions.canCheck || validActions.canCall) && (
        <button
          className="animate-button-press"
          style={{ ...styles.button, ...styles.checkCallButton }}
          onClick={handleCheckCall}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(34, 197, 94, 0.35)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(34, 197, 94, 0.2)';
          }}
        >
          {validActions.canCheck ? 'Check' : `Call $${formatChips(validActions.callAmount)}`}
        </button>
      )}

      {/* Bet / Raise */}
      {canBetOrRaise && (
        <div style={styles.betControlsWrapper}>
          <div style={styles.betControls}>
            <button
              className="animate-button-press"
              style={{
                ...styles.button,
                ...styles.betRaiseButton,
                ...(betAmount < minBetRaise || betAmount > maxBetRaise ? styles.disabledButton : {}),
              }}
              onClick={handleBetRaise}
              disabled={betAmount < minBetRaise || betAmount > maxBetRaise}
              onMouseEnter={(e) => {
                if (betAmount >= minBetRaise && betAmount <= maxBetRaise) {
                  e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.35)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.2)';
              }}
            >
              {betLabel} ${formatChips(betAmount)}
            </button>

            <input
              type="number"
              style={styles.betInput}
              value={betAmount}
              onChange={handleBetChange}
              min={minBetRaise}
              max={maxBetRaise}
            />

            {/* Preset buttons - Min, 1/2 Pot, Pot, Max */}
            <button
              style={styles.betPreset}
              onClick={() => setBetAmount(minBetRaise)}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(75, 85, 99, 0.4)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(75, 85, 99, 0.2)';
              }}
            >
              Min
            </button>
            <button
              style={styles.betPreset}
              onClick={() => setBetAmount(Math.max(minBetRaise, Math.min(Math.floor(state.pot / 2), maxBetRaise)))}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(75, 85, 99, 0.4)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(75, 85, 99, 0.2)';
              }}
            >
              ½ Pot
            </button>
            <button
              style={styles.betPreset}
              onClick={() => setBetAmount(Math.max(minBetRaise, Math.min(Math.floor(state.pot), maxBetRaise)))}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(75, 85, 99, 0.4)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(75, 85, 99, 0.2)';
              }}
            >
              Pot
            </button>
            <button
              style={styles.betPreset}
              onClick={() => setBetAmount(maxBetRaise)}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(75, 85, 99, 0.4)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(75, 85, 99, 0.2)';
              }}
            >
              Max
            </button>
          </div>
          {/* Range indicator */}
          <div style={styles.betRange}>
            Range: ${formatChips(minBetRaise)} - ${formatChips(maxBetRaise)}
          </div>
        </div>
      )}

      {/* All-in */}
      {heroPlayer && heroPlayer.stack > 0 && (
        <button
          className="animate-button-press"
          style={{ ...styles.button, ...styles.allInButton }}
          onClick={handleAllIn}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(168, 85, 247, 0.35)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(168, 85, 247, 0.2)';
          }}
        >
          All-In ${formatChips(heroPlayer.stack)}
        </button>
      )}
    </div>
  );
}

export default LiveActionPanel;
