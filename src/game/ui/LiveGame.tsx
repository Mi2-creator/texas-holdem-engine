/**
 * LiveGame.tsx
 * Phase L3 - Main live game orchestrator component
 *
 * Integrates:
 * - GameController (game logic)
 * - LiveTable (visualization)
 * - GameStatus (status display)
 * - LiveActionPanel (player controls)
 *
 * Manages the async flow between UI and game logic.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { TableState } from '../engine/TableState';
import { PlayerAction } from '../engine/BettingRound';
import {
  GameController,
  GameConfig,
  HandResult,
  createGameController,
} from '../controller/GameController';
import { LiveTable } from './LiveTable';
import { GameStatus } from './GameStatus';
import { LiveActionPanel } from './LiveActionPanel';

// ============================================================================
// Types
// ============================================================================

interface LiveGameProps {
  readonly config?: Partial<GameConfig>;
}

type GamePhase = 'idle' | 'playing' | 'waiting-for-action' | 'complete' | 'game-over';

const AUTO_DEAL_DELAY = 3000; // 3 seconds before auto-dealing next hand

// ============================================================================
// Styles
// ============================================================================

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '20px',
    padding: '24px',
    minHeight: '100vh',
    backgroundColor: '#0a0a0f',
    fontFamily: 'system-ui, sans-serif',
  },

  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    marginBottom: '8px',
  },

  title: {
    fontSize: '20px',
    fontWeight: 700,
    color: '#fff',
    letterSpacing: '0.5px',
  },

  newHandButton: {
    padding: '10px 24px',
    borderRadius: '8px',
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
    color: '#22c55e',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    border: '1px solid rgba(34, 197, 94, 0.3)',
  },

  resultPanel: {
    padding: '24px 32px',
    borderRadius: '12px',
    backgroundColor: 'rgba(20, 20, 28, 0.95)',
    border: '1px solid rgba(168, 85, 247, 0.3)',
    textAlign: 'center' as const,
    minWidth: '300px',
  },

  resultTitle: {
    fontSize: '18px',
    fontWeight: 700,
    color: '#a855f7',
    marginBottom: '12px',
  },

  resultInfo: {
    fontSize: '14px',
    color: 'rgba(209, 213, 219, 0.9)',
    lineHeight: '24px',
  },

  actionLog: {
    marginTop: '24px',
    padding: '16px',
    borderRadius: '8px',
    backgroundColor: 'rgba(15, 15, 20, 0.8)',
    border: '1px solid rgba(75, 85, 99, 0.3)',
    maxWidth: '700px',
    width: '100%',
    maxHeight: '200px',
    overflow: 'auto',
  },

  actionLogTitle: {
    fontSize: '12px',
    fontWeight: 600,
    color: 'rgba(156, 163, 175, 0.7)',
    marginBottom: '8px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },

  actionLogEntry: {
    fontSize: '12px',
    color: 'rgba(156, 163, 175, 0.9)',
    padding: '4px 0',
    borderBottom: '1px solid rgba(75, 85, 99, 0.2)',
  },

  countdown: {
    fontSize: '12px',
    color: 'rgba(156, 163, 175, 0.7)',
    marginTop: '12px',
  },

  gameOverPanel: {
    padding: '32px 48px',
    borderRadius: '16px',
    backgroundColor: 'rgba(20, 20, 28, 0.98)',
    border: '2px solid rgba(234, 179, 8, 0.4)',
    textAlign: 'center' as const,
  },

  gameOverTitle: {
    fontSize: '24px',
    fontWeight: 700,
    color: '#eab308',
    marginBottom: '16px',
  },

  gameOverInfo: {
    fontSize: '16px',
    color: 'rgba(209, 213, 219, 0.9)',
    marginBottom: '24px',
  },

  restartButton: {
    padding: '12px 32px',
    borderRadius: '8px',
    backgroundColor: 'rgba(234, 179, 8, 0.2)',
    color: '#eab308',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    border: '1px solid rgba(234, 179, 8, 0.3)',
  },
};

// ============================================================================
// Main Component
// ============================================================================

export function LiveGame({ config }: LiveGameProps): React.ReactElement {
  const [gameState, setGameState] = useState<TableState | null>(null);
  const [phase, setPhase] = useState<GamePhase>('idle');
  const [result, setResult] = useState<HandResult | null>(null);
  const [message, setMessage] = useState<string>('');
  const [actionLog, setActionLog] = useState<string[]>([]);
  const [countdown, setCountdown] = useState<number | null>(null);

  const controllerRef = useRef<GameController | null>(null);
  const actionResolverRef = useRef<((action: PlayerAction) => void) | null>(null);
  const autoDealTimerRef = useRef<number | null>(null);

  const heroIndex = 0; // Hero is always seat 0

  // Initialize controller
  useEffect(() => {
    controllerRef.current = createGameController(config);
    setGameState(controllerRef.current.getState());
  }, [config]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (autoDealTimerRef.current) {
        clearTimeout(autoDealTimerRef.current);
      }
    };
  }, []);

  // Start a new hand
  const startNewHand = useCallback(async () => {
    if (!controllerRef.current) return;

    // Clear any pending auto-deal timer
    if (autoDealTimerRef.current) {
      clearTimeout(autoDealTimerRef.current);
      autoDealTimerRef.current = null;
    }

    setPhase('playing');
    setResult(null);
    setMessage('');
    setActionLog([]);
    setCountdown(null);

    // Set up hero decision callback
    controllerRef.current.setHeroDecisionCallback(async (state, playerIndex) => {
      return new Promise<PlayerAction>((resolve) => {
        setGameState(state);
        setPhase('waiting-for-action');
        setMessage('Your turn - choose an action');
        actionResolverRef.current = resolve;
      });
    });

    // Set up action logging callback
    controllerRef.current.setActionCallback((event) => {
      const actionStr = formatAction(event.action);
      const logEntry = `${event.street.toUpperCase()}: ${event.playerName} ${actionStr} (Pot: $${event.potAfter})`;
      setActionLog(prev => [...prev, logEntry]);
      setGameState(controllerRef.current!.getState());
    });

    // Play the hand
    try {
      const handResult = await controllerRef.current.playHand();
      setResult(handResult);
      setGameState(controllerRef.current.getState());
      setMessage('');

      // Rotate dealer for next hand
      controllerRef.current.rotateDealer();

      // Check if game can continue
      if (!controllerRef.current.canContinue()) {
        setPhase('game-over');
        return;
      }

      // Set up auto-deal countdown
      setPhase('complete');
      setCountdown(3);

      // Countdown timer
      let remaining = 3;
      const countdownInterval = setInterval(() => {
        remaining -= 1;
        if (remaining > 0) {
          setCountdown(remaining);
        } else {
          clearInterval(countdownInterval);
          setCountdown(null);
        }
      }, 1000);

      // Auto-deal after delay
      autoDealTimerRef.current = window.setTimeout(() => {
        clearInterval(countdownInterval);
        setCountdown(null);
        startNewHand();
      }, AUTO_DEAL_DELAY);

    } catch (error) {
      console.error('Error playing hand:', error);
      setPhase('idle');
      setMessage('Error occurred');
    }
  }, []);

  // Handle player action
  const handleAction = useCallback((action: PlayerAction) => {
    if (actionResolverRef.current) {
      setPhase('playing');
      setMessage('');
      actionResolverRef.current(action);
      actionResolverRef.current = null;
    }
  }, []);

  // Restart the entire game
  const restartGame = useCallback(() => {
    controllerRef.current = createGameController(config);
    setGameState(controllerRef.current.getState());
    setPhase('idle');
    setResult(null);
    setMessage('');
    setActionLog([]);
    setCountdown(null);
  }, [config]);

  // Format action for display
  function formatAction(action: PlayerAction): string {
    switch (action.type) {
      case 'fold': return 'folds';
      case 'check': return 'checks';
      case 'call': return 'calls';
      case 'bet': return `bets $${action.amount}`;
      case 'raise': return `raises to $${action.amount}`;
      case 'all-in': return 'goes ALL-IN';
      default: return action.type;
    }
  }

  // Render game over state
  if (phase === 'game-over' && gameState) {
    const winner = gameState.players.find(p => p.stack > 0);
    const isHeroWinner = winner?.id === 'hero';

    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <span style={styles.title}>Texas Hold'em</span>
        </div>
        <div style={styles.gameOverPanel}>
          <div style={styles.gameOverTitle}>
            {isHeroWinner ? 'You Win!' : 'Game Over'}
          </div>
          <div style={styles.gameOverInfo}>
            {isHeroWinner
              ? `Congratulations! You won with $${winner?.stack}`
              : `${winner?.name} wins with $${winner?.stack}`}
          </div>
          <button
            style={styles.restartButton}
            onClick={restartGame}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(234, 179, 8, 0.35)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(234, 179, 8, 0.2)';
            }}
          >
            Play Again
          </button>
        </div>
      </div>
    );
  }

  // Render idle state
  if (phase === 'idle' || !gameState) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <span style={styles.title}>Texas Hold'em</span>
        </div>
        <button
          style={styles.newHandButton}
          onClick={startNewHand}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(34, 197, 94, 0.35)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(34, 197, 94, 0.2)';
          }}
        >
          Start New Hand
        </button>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <span style={styles.title}>Texas Hold'em</span>
        {phase === 'complete' && (
          <button
            style={styles.newHandButton}
            onClick={startNewHand}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(34, 197, 94, 0.35)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(34, 197, 94, 0.2)';
            }}
          >
            Deal Next Hand
          </button>
        )}
      </div>

      {/* Game Status */}
      <GameStatus
        state={gameState}
        heroIndex={heroIndex}
        message={message}
      />

      {/* Table */}
      <LiveTable
        state={gameState}
        heroIndex={heroIndex}
        showOpponentCards={phase === 'complete' && result !== null && !result.endedByFold}
      />

      {/* Action Panel */}
      <LiveActionPanel
        state={gameState}
        heroIndex={heroIndex}
        onAction={handleAction}
        disabled={phase !== 'waiting-for-action'}
      />

      {/* Result Panel */}
      {phase === 'complete' && result && (
        <div style={styles.resultPanel}>
          <div style={styles.resultTitle}>
            {result.endedByFold ? 'Win by Fold' : 'Showdown'}
          </div>
          <div style={styles.resultInfo}>
            <div><strong>{result.winnerNames.join(', ')}</strong> wins ${result.potSize}</div>
            {!result.endedByFold && (
              <div style={{ marginTop: '8px', color: '#a855f7' }}>
                {result.winningHandDescription}
              </div>
            )}
          </div>
          {countdown !== null && (
            <div style={styles.countdown}>
              Next hand in {countdown}...
            </div>
          )}
        </div>
      )}

      {/* Action Log */}
      {actionLog.length > 0 && (
        <div style={styles.actionLog}>
          <div style={styles.actionLogTitle}>Action Log</div>
          {actionLog.map((entry, i) => (
            <div key={i} style={styles.actionLogEntry}>{entry}</div>
          ))}
        </div>
      )}
    </div>
  );
}

export default LiveGame;
