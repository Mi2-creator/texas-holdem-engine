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
import {
  HandHistoryEvent,
  formatHistoryEvent,
  getEventStyleType,
  EventStyleType,
} from '../controller/HandHistory';
import { LiveTable } from './LiveTable';
import { GameStatus } from './GameStatus';
import { LiveActionPanel } from './LiveActionPanel';
import {
  ReplayControls,
  ReplayState,
  ReplaySpeed,
  createInitialReplayState,
} from './ReplayControls';
import { ExportControls } from './ExportControls';
import {
  SessionStats,
  SessionStatsData,
  createInitialSessionStats,
  updateSessionStats,
} from './SessionStats';
import { PotOddsDisplay } from './PotOddsDisplay';
import { DecisionHelper } from './DecisionHelper';
import {
  TrainingModeToggle,
  TrainingModeSettings,
  createDefaultTrainingSettings,
  getRecommendedAction,
  Recommendation,
} from './TrainingMode';
import {
  Lesson,
  LessonHint,
  LessonFeedback,
  LessonSelector,
  LessonHintDisplay,
  LessonFeedbackDisplay,
  createLessonGameState,
  createLessonHandResult,
  AllLessonProgress,
  createInitialProgress,
  updateLessonProgress,
  wasCorrectDecision,
  getLessonStatus,
} from './LessonSystem';

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

interface LiveGameProps {
  readonly config?: Partial<GameConfig>;
}

type GamePhase = 'welcome' | 'ready' | 'playing' | 'waiting-for-action' | 'complete' | 'game-over';

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

  // Event type styles for hand history
  historyHeader: {
    fontSize: '12px',
    fontWeight: 700,
    color: '#a855f7',
    padding: '8px 0 4px 0',
    borderBottom: '1px solid rgba(168, 85, 247, 0.3)',
  },

  historyInfo: {
    fontSize: '11px',
    color: 'rgba(156, 163, 175, 0.7)',
    padding: '2px 0',
    fontStyle: 'italic' as const,
  },

  historyAction: {
    fontSize: '12px',
    color: 'rgba(156, 163, 175, 0.9)',
    padding: '3px 0',
    borderBottom: '1px solid rgba(75, 85, 99, 0.15)',
  },

  historyCards: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#60a5fa',
    padding: '6px 0',
    borderBottom: '1px solid rgba(96, 165, 250, 0.2)',
  },

  historyResult: {
    fontSize: '12px',
    fontWeight: 700,
    color: '#22c55e',
    padding: '8px 0 4px 0',
    borderTop: '1px solid rgba(34, 197, 94, 0.3)',
  },

  // Replay highlight style
  historyHighlight: {
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
    borderLeft: '3px solid #6366f1',
    paddingLeft: '8px',
    marginLeft: '-8px',
    borderRadius: '0 4px 4px 0',
  },

  // Dimmed events (after current in replay)
  historyDimmed: {
    opacity: 0.35,
  },

  replayControlsContainer: {
    marginTop: '8px',
  },

  historyHeaderRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
  },

  decisionHelperRow: {
    display: 'flex',
    gap: '12px',
    alignItems: 'stretch',
    flexWrap: 'wrap' as const,
    justifyContent: 'center',
  },

  trainingModeContainer: {
    marginLeft: 'auto',
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

  // Welcome Screen
  welcomeOverlay: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '80vh',
    textAlign: 'center' as const,
  },

  welcomeCard: {
    padding: '48px 64px',
    borderRadius: '20px',
    backgroundColor: 'rgba(15, 15, 20, 0.95)',
    border: '1px solid rgba(75, 85, 99, 0.3)',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
  },

  welcomeTitle: {
    fontSize: '32px',
    fontWeight: 700,
    color: '#fff',
    marginBottom: '8px',
    letterSpacing: '1px',
  },

  welcomeSubtitle: {
    fontSize: '14px',
    color: 'rgba(156, 163, 175, 0.8)',
    marginBottom: '32px',
  },

  welcomeSettings: {
    display: 'flex',
    justifyContent: 'center',
    gap: '32px',
    marginBottom: '32px',
    padding: '16px 24px',
    borderRadius: '12px',
    backgroundColor: 'rgba(30, 30, 40, 0.6)',
  },

  welcomeStat: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '4px',
  },

  welcomeStatLabel: {
    fontSize: '11px',
    color: 'rgba(156, 163, 175, 0.6)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },

  welcomeStatValue: {
    fontSize: '18px',
    fontWeight: 600,
    color: '#fff',
  },

  startButton: {
    padding: '14px 48px',
    borderRadius: '10px',
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
    color: '#22c55e',
    fontSize: '16px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    border: '2px solid rgba(34, 197, 94, 0.4)',
  },

  // Session Controls
  sessionControls: {
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
  },

  secondaryButton: {
    padding: '8px 16px',
    borderRadius: '6px',
    backgroundColor: 'rgba(75, 85, 99, 0.2)',
    color: '#9ca3af',
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    border: '1px solid rgba(75, 85, 99, 0.3)',
  },

  // Active Lesson Bar
  lessonBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '10px 20px',
    borderRadius: '10px',
    backgroundColor: 'rgba(234, 179, 8, 0.1)',
    border: '1px solid rgba(234, 179, 8, 0.3)',
    width: '100%',
    maxWidth: '700px',
  },

  lessonBarIcon: {
    fontSize: '18px',
  },

  lessonBarContent: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
  },

  lessonBarTitle: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#eab308',
  },

  lessonBarConcept: {
    fontSize: '11px',
    color: 'rgba(234, 179, 8, 0.7)',
  },

  lessonBarExitButton: {
    padding: '4px 10px',
    borderRadius: '4px',
    backgroundColor: 'rgba(75, 85, 99, 0.2)',
    color: '#9ca3af',
    fontSize: '10px',
    fontWeight: 500,
    cursor: 'pointer',
    border: '1px solid rgba(75, 85, 99, 0.3)',
    transition: 'all 0.15s ease',
  },

  // Enhanced Result Panel
  resultPanelEnhanced: {
    padding: '28px 40px',
    borderRadius: '16px',
    backgroundColor: 'rgba(20, 20, 28, 0.98)',
    border: '1px solid rgba(168, 85, 247, 0.3)',
    textAlign: 'center' as const,
    minWidth: '340px',
  },

  resultHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
    paddingBottom: '12px',
    borderBottom: '1px solid rgba(75, 85, 99, 0.3)',
  },

  resultHandNumber: {
    fontSize: '11px',
    color: 'rgba(156, 163, 175, 0.6)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },

  resultOutcome: {
    fontSize: '12px',
    fontWeight: 600,
    padding: '4px 10px',
    borderRadius: '12px',
  },

  resultWinner: {
    fontSize: '20px',
    fontWeight: 700,
    color: '#fff',
    marginBottom: '8px',
  },

  resultPot: {
    fontSize: '24px',
    fontWeight: 700,
    color: '#22c55e',
    marginBottom: '12px',
  },

  resultHand: {
    fontSize: '14px',
    color: '#a855f7',
    marginBottom: '16px',
  },

  resultStacks: {
    display: 'flex',
    justifyContent: 'center',
    gap: '24px',
    padding: '12px 16px',
    borderRadius: '8px',
    backgroundColor: 'rgba(30, 30, 40, 0.6)',
    marginBottom: '16px',
  },

  resultStackItem: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '2px',
  },

  resultStackLabel: {
    fontSize: '10px',
    color: 'rgba(156, 163, 175, 0.6)',
  },

  resultStackValue: {
    fontSize: '14px',
    fontWeight: 600,
  },

  resultActions: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'center',
    marginTop: '8px',
  },
};

// ============================================================================
// Main Component
// ============================================================================

export function LiveGame({ config }: LiveGameProps): React.ReactElement {
  const [gameState, setGameState] = useState<TableState | null>(null);
  const [phase, setPhase] = useState<GamePhase>('welcome');
  const [handCount, setHandCount] = useState<number>(0);
  const [result, setResult] = useState<HandResult | null>(null);
  const [message, setMessage] = useState<string>('');
  const [handHistory, setHandHistory] = useState<HandHistoryEvent[]>([]);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [lastActions, setLastActions] = useState<Record<number, string>>({});
  const [thinkingPlayerIndex, setThinkingPlayerIndex] = useState<number | null>(null);
  const [replayState, setReplayState] = useState<ReplayState>(createInitialReplayState());
  const [sessionStats, setSessionStats] = useState<SessionStatsData>(() =>
    createInitialSessionStats(config?.startingStack ?? 1000)
  );
  const [trainingSettings, setTrainingSettings] = useState<TrainingModeSettings>(
    createDefaultTrainingSettings()
  );
  const [activeLesson, setActiveLesson] = useState<Lesson | null>(null);
  const [lessonProgress, setLessonProgress] = useState<AllLessonProgress>(createInitialProgress);
  const [lessonHint, setLessonHint] = useState<LessonHint | null>(null);
  const [lessonFeedback, setLessonFeedback] = useState<LessonFeedback | null>(null);
  const [lastHeroAction, setLastHeroAction] = useState<PlayerAction | null>(null);

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

  // Auto-play in training mode
  useEffect(() => {
    if (
      trainingSettings.enabled &&
      trainingSettings.autoPlay &&
      phase === 'waiting-for-action' &&
      gameState &&
      actionResolverRef.current
    ) {
      const recommendation = getRecommendedAction(
        gameState.pot,
        gameState.currentBet - gameState.players[heroIndex].currentBet,
        gameState.players[heroIndex].holeCards,
        gameState.communityCards,
        gameState.street
      );

      // Auto-play after a delay to let user see the recommendation
      const autoPlayDelay = 1500 * trainingSettings.speedMultiplier;
      const timer = setTimeout(() => {
        if (actionResolverRef.current) {
          let action: PlayerAction;
          if (recommendation === 'fold') {
            action = { type: 'fold' };
          } else if (recommendation === 'call') {
            const callAmount = gameState.currentBet - gameState.players[heroIndex].currentBet;
            action = callAmount > 0 ? { type: 'call' } : { type: 'check' };
          } else {
            // Raise - use a reasonable bet size (pot-sized)
            const potBet = Math.min(gameState.pot, gameState.players[heroIndex].stack);
            action = { type: 'bet', amount: Math.max(gameState.bigBlind, potBet) };
          }
          setPhase('playing');
          setMessage('');
          actionResolverRef.current(action);
          actionResolverRef.current = null;
        }
      }, autoPlayDelay);

      return () => clearTimeout(timer);
    }
  }, [trainingSettings, phase, gameState, heroIndex]);

  // Update lesson hints during hero's turn
  useEffect(() => {
    if (activeLesson && phase === 'waiting-for-action' && gameState) {
      const lessonGameState = createLessonGameState(gameState, heroIndex);
      const hint = activeLesson.getHint(lessonGameState);
      setLessonHint(hint);
    } else {
      setLessonHint(null);
    }
  }, [activeLesson, phase, gameState, heroIndex]);

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
    setMessage('Dealing cards...');
    setHandHistory([]);
    setCountdown(null);
    setLastActions({});
    setThinkingPlayerIndex(null);
    setReplayState(createInitialReplayState());
    setLessonFeedback(null);
    setLastHeroAction(null);
    setHandCount(prev => prev + 1);

    // Set up hero decision callback
    controllerRef.current.setHeroDecisionCallback(async (state, playerIndex) => {
      return new Promise<PlayerAction>((resolve) => {
        setGameState(state);
        setPhase('waiting-for-action');
        // Contextual message based on situation
        const callAmount = state.currentBet - state.players[playerIndex].currentBet;
        if (callAmount > 0) {
          setMessage(`Your turn · $${formatChips(callAmount)} to call`);
        } else {
          setMessage('Your turn · Check or bet');
        }
        actionResolverRef.current = resolve;
      });
    });

    // Set up action callback for visual feedback (last actions display)
    controllerRef.current.setActionCallback((event) => {
      const actionStr = formatAction(event.action);
      // Track last action per player for visual feedback
      setLastActions(prev => ({ ...prev, [event.playerIndex]: actionStr }));
      setGameState(controllerRef.current!.getState());
    });

    // Set up history callback for action log
    controllerRef.current.setHistoryCallback((event) => {
      setHandHistory(prev => [...prev, event]);
    });

    // Set up thinking callback for AI deliberation
    controllerRef.current.setThinkingCallback((playerIndex, isThinking) => {
      if (isThinking) {
        setThinkingPlayerIndex(playerIndex);
        // Update game state to show current position
        setGameState(controllerRef.current!.getState());
      } else {
        setThinkingPlayerIndex(null);
      }
    });

    // Play the hand
    try {
      const handResult = await controllerRef.current.playHand();
      setResult(handResult);
      const finalState = controllerRef.current.getState();
      setGameState(finalState);
      setMessage('');

      // Update session stats
      const heroPlayer = finalState.players[heroIndex];
      const heroWon = handResult.winnerNames.includes('You');
      setSessionStats(prev => updateSessionStats(
        prev,
        heroWon,
        heroPlayer.stack,
        heroWon ? handResult.potSize : 0
      ));

      // Generate lesson feedback and update progress if in a lesson
      if (activeLesson && lastHeroAction) {
        const lessonGameState = createLessonGameState(finalState, heroIndex);
        const heroFolded = lastHeroAction.type === 'fold';
        const lessonResult = createLessonHandResult(heroWon, heroFolded, lastHeroAction, lessonGameState);
        const feedback = activeLesson.getFeedback(lessonResult);
        setLessonFeedback(feedback);

        // Update lesson progress
        const isCorrect = wasCorrectDecision(feedback);
        setLessonProgress(prev => updateLessonProgress(prev, activeLesson.id, isCorrect));
      }

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
      setPhase('welcome');
      setMessage('Error occurred');
    }
  }, []);

  // Handle player action
  const handleAction = useCallback((action: PlayerAction) => {
    if (actionResolverRef.current) {
      setPhase('playing');
      setMessage('');
      setLastHeroAction(action);
      setLessonHint(null);
      actionResolverRef.current(action);
      actionResolverRef.current = null;
    }
  }, []);

  // Restart the entire game
  const restartGame = useCallback(() => {
    // Clear any pending timers
    if (autoDealTimerRef.current) {
      clearTimeout(autoDealTimerRef.current);
      autoDealTimerRef.current = null;
    }
    controllerRef.current = createGameController(config);
    setGameState(controllerRef.current.getState());
    setPhase('welcome');
    setResult(null);
    setMessage('');
    setHandHistory([]);
    setReplayState(createInitialReplayState());
    setCountdown(null);
    setLastActions({});
    setHandCount(0);
    setSessionStats(createInitialSessionStats(config?.startingStack ?? 1000));
    // Reset lesson state but preserve progress (progress persists in-memory across games)
    setActiveLesson(null);
    setLessonHint(null);
    setLessonFeedback(null);
    setLastHeroAction(null);
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

  // ============================================================================
  // Replay Controls
  // ============================================================================

  const handleStartReplay = useCallback(() => {
    setReplayState({
      isReplaying: true,
      isPlaying: false,
      currentIndex: -1,
      speed: 'normal',
    });
  }, []);

  const handleExitReplay = useCallback(() => {
    setReplayState(createInitialReplayState());
  }, []);

  const handleReplayStepForward = useCallback(() => {
    setReplayState(prev => {
      if (prev.currentIndex >= handHistory.length - 1) return prev;
      return { ...prev, currentIndex: prev.currentIndex + 1 };
    });
  }, [handHistory.length]);

  const handleReplayStepBackward = useCallback(() => {
    setReplayState(prev => {
      if (prev.currentIndex <= -1) return prev;
      return { ...prev, currentIndex: prev.currentIndex - 1 };
    });
  }, []);

  const handleReplayPlay = useCallback(() => {
    setReplayState(prev => ({ ...prev, isPlaying: true }));
  }, []);

  const handleReplayPause = useCallback(() => {
    setReplayState(prev => ({ ...prev, isPlaying: false }));
  }, []);

  const handleReplayReset = useCallback(() => {
    setReplayState(prev => ({ ...prev, currentIndex: -1, isPlaying: false }));
  }, []);

  const handleReplaySpeedChange = useCallback((speed: ReplaySpeed) => {
    setReplayState(prev => ({ ...prev, speed }));
  }, []);

  // Render game over state
  if (phase === 'game-over' && gameState) {
    // Find players still in the game (with chips)
    const playersWithChips = gameState.players.filter(p => p.stack > 0);
    const heroPlayer = gameState.players.find(p => p.id === 'hero');
    const isHeroStillIn = heroPlayer && heroPlayer.stack > 0;
    // Hero wins if they're the only one left OR if game ended and hero has chips
    const isHeroWinner = playersWithChips.length === 1 && playersWithChips[0].id === 'hero';
    const winner = playersWithChips.length === 1 ? playersWithChips[0] : null;

    return (
      <div style={styles.container}>
        <div style={styles.welcomeOverlay}>
          <div style={{
            ...styles.gameOverPanel,
            border: isHeroWinner ? '2px solid rgba(34, 197, 94, 0.4)' : '2px solid rgba(239, 68, 68, 0.4)',
          }}>
            <div style={{
              ...styles.gameOverTitle,
              color: isHeroWinner ? '#22c55e' : '#ef4444',
            }}>
              {isHeroWinner ? '🎉 Victory!' : 'Game Over'}
            </div>
            <div style={styles.gameOverInfo}>
              {isHeroWinner
                ? `You've won the match!`
                : winner
                  ? `${winner.name} wins the match`
                  : `You've been eliminated`}
            </div>

            {/* Full Session Stats */}
            <div style={{ marginBottom: '24px' }}>
              <SessionStats stats={sessionStats} />
            </div>

            <button
              className="animate-button-press"
              style={{
                ...styles.restartButton,
                backgroundColor: isHeroWinner ? 'rgba(34, 197, 94, 0.2)' : 'rgba(234, 179, 8, 0.2)',
                color: isHeroWinner ? '#22c55e' : '#eab308',
                borderColor: isHeroWinner ? 'rgba(34, 197, 94, 0.3)' : 'rgba(234, 179, 8, 0.3)',
              }}
              onClick={restartGame}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = isHeroWinner
                  ? 'rgba(34, 197, 94, 0.35)'
                  : 'rgba(234, 179, 8, 0.35)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = isHeroWinner
                  ? 'rgba(34, 197, 94, 0.2)'
                  : 'rgba(234, 179, 8, 0.2)';
              }}
            >
              Play Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Get effective config values
  const effectiveConfig = {
    smallBlind: config?.smallBlind ?? 5,
    bigBlind: config?.bigBlind ?? 10,
    startingStack: config?.startingStack ?? 1000,
  };

  // Render welcome screen
  if (phase === 'welcome' || !gameState) {
    return (
      <div style={styles.container}>
        <div style={styles.welcomeOverlay}>
          <div style={styles.welcomeCard}>
            <div style={styles.welcomeTitle}>Texas Hold'em</div>
            <div style={styles.welcomeSubtitle}>No-Limit Texas Hold'em</div>

            <div style={styles.welcomeSettings}>
              <div style={styles.welcomeStat}>
                <span style={styles.welcomeStatLabel}>Blinds</span>
                <span style={styles.welcomeStatValue}>
                  ${formatChips(effectiveConfig.smallBlind)} / ${formatChips(effectiveConfig.bigBlind)}
                </span>
              </div>
              <div style={styles.welcomeStat}>
                <span style={styles.welcomeStatLabel}>Starting Stack</span>
                <span style={styles.welcomeStatValue}>${formatChips(effectiveConfig.startingStack)}</span>
              </div>
              <div style={styles.welcomeStat}>
                <span style={styles.welcomeStatLabel}>Players</span>
                <span style={styles.welcomeStatValue}>3</span>
              </div>
            </div>

            {/* Training Mode Toggle on Welcome Screen */}
            <div style={{ marginBottom: '24px' }}>
              <TrainingModeToggle
                settings={trainingSettings}
                onSettingsChange={setTrainingSettings}
              />
            </div>

            {/* Lesson Selector on Welcome Screen */}
            <div style={{ marginBottom: '24px' }}>
              <LessonSelector
                activeLesson={activeLesson}
                progress={lessonProgress}
                onSelectLesson={(lesson) => {
                  // Only allow selecting unlocked or completed lessons
                  const status = getLessonStatus(lessonProgress, lesson.id);
                  if (status !== 'locked') {
                    setActiveLesson(lesson);
                  }
                }}
                onClearLesson={() => setActiveLesson(null)}
              />
            </div>

            <button
              className="animate-button-press"
              style={styles.startButton}
              onClick={startNewHand}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(34, 197, 94, 0.35)';
                e.currentTarget.style.transform = 'scale(1.02)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(34, 197, 94, 0.2)';
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              Start Game
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Header with Session Controls */}
      <div style={styles.header}>
        <span style={styles.title}>Texas Hold'em</span>

        {/* Compact Session Stats - show after first hand */}
        {sessionStats.handsPlayed > 0 && (
          <SessionStats stats={sessionStats} compact />
        )}

        {/* Training Mode Toggle */}
        <div style={styles.trainingModeContainer}>
          <TrainingModeToggle
            settings={trainingSettings}
            onSettingsChange={setTrainingSettings}
          />
        </div>

        <div style={styles.sessionControls}>
          {/* Hand Counter */}
          {handCount > 0 && (
            <span style={{ fontSize: '12px', color: 'rgba(156, 163, 175, 0.6)' }}>
              Hand #{handCount}
            </span>
          )}

          {/* Restart Game Button - always available during play */}
          <button
            style={styles.secondaryButton}
            onClick={restartGame}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(75, 85, 99, 0.4)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(75, 85, 99, 0.2)';
            }}
          >
            New Game
          </button>
        </div>
      </div>

      {/* Active Lesson Bar */}
      {activeLesson && (
        <div style={styles.lessonBar}>
          <span style={styles.lessonBarIcon}>📚</span>
          <div style={styles.lessonBarContent}>
            <span style={styles.lessonBarTitle}>
              Lesson {activeLesson.number}: {activeLesson.title}
            </span>
            <span style={styles.lessonBarConcept}>{activeLesson.concept}</span>
          </div>
          <button
            style={styles.lessonBarExitButton}
            onClick={() => setActiveLesson(null)}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(75, 85, 99, 0.4)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(75, 85, 99, 0.2)';
            }}
          >
            Exit Lesson
          </button>
        </div>
      )}

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
        lastActions={lastActions}
        thinkingPlayerIndex={thinkingPlayerIndex}
      />

      {/* Pot Odds, Hand Strength & Decision Helper - Show during hero's turn */}
      {phase === 'waiting-for-action' && (
        <div style={styles.decisionHelperRow}>
          <PotOddsDisplay
            pot={gameState.pot}
            callAmount={gameState.currentBet - gameState.players[heroIndex].currentBet}
            holeCards={gameState.players[heroIndex].holeCards}
            communityCards={gameState.communityCards}
            street={gameState.street}
          />
          <DecisionHelper
            pot={gameState.pot}
            callAmount={gameState.currentBet - gameState.players[heroIndex].currentBet}
            holeCards={gameState.players[heroIndex].holeCards}
            communityCards={gameState.communityCards}
            street={gameState.street}
          />
          {/* Lesson Hint - Show contextual advice during lessons */}
          {lessonHint && <LessonHintDisplay hint={lessonHint} />}
        </div>
      )}

      {/* Action Panel */}
      <LiveActionPanel
        state={gameState}
        heroIndex={heroIndex}
        onAction={handleAction}
        disabled={phase !== 'waiting-for-action'}
        recommendedAction={
          trainingSettings.enabled && phase === 'waiting-for-action'
            ? getRecommendedAction(
                gameState.pot,
                gameState.currentBet - gameState.players[heroIndex].currentBet,
                gameState.players[heroIndex].holeCards,
                gameState.communityCards,
                gameState.street
              )
            : null
        }
      />

      {/* Result Panel - Enhanced Round Summary */}
      {phase === 'complete' && result && (
        <div className="animate-win-glow" style={styles.resultPanelEnhanced}>
          {/* Header */}
          <div style={styles.resultHeader}>
            <span style={styles.resultHandNumber}>Hand #{handCount}</span>
            <span style={{
              ...styles.resultOutcome,
              backgroundColor: result.endedByFold ? 'rgba(239, 68, 68, 0.2)' : 'rgba(168, 85, 247, 0.2)',
              color: result.endedByFold ? '#ef4444' : '#a855f7',
            }}>
              {result.endedByFold ? 'Fold' : 'Showdown'}
            </span>
          </div>

          {/* Winner */}
          <div style={styles.resultWinner}>
            {result.winnerNames[0] === 'You' ? '🎉 You Win!' : `${result.winnerNames[0]} Wins`}
          </div>

          {/* Pot Won */}
          <div style={styles.resultPot}>+${formatChips(result.potSize)}</div>

          {/* Winning Hand */}
          {!result.endedByFold && (
            <div style={styles.resultHand}>{result.winningHandDescription}</div>
          )}

          {/* Current Stacks */}
          <div style={styles.resultStacks}>
            {gameState.players.map((player, idx) => (
              <div key={player.id} style={styles.resultStackItem}>
                <span style={styles.resultStackLabel}>
                  {idx === heroIndex ? 'You' : player.name}
                </span>
                <span style={{
                  ...styles.resultStackValue,
                  color: player.stack > effectiveConfig.startingStack ? '#22c55e' :
                         player.stack < effectiveConfig.startingStack ? '#ef4444' : '#fff',
                }}>
                  ${formatChips(player.stack)}
                </span>
              </div>
            ))}
          </div>

          {/* Lesson Feedback - Show after hand in lesson mode */}
          {lessonFeedback && <LessonFeedbackDisplay feedback={lessonFeedback} />}

          {/* Actions */}
          <div style={styles.resultActions}>
            <button
              className="animate-button-press"
              style={styles.newHandButton}
              onClick={startNewHand}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(34, 197, 94, 0.35)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(34, 197, 94, 0.2)';
              }}
            >
              {countdown !== null ? `Next Hand (${countdown})` : 'Deal Next Hand'}
            </button>
          </div>
        </div>
      )}

      {/* Hand History Log */}
      {handHistory.length > 0 && (
        <div style={styles.actionLog}>
          <div style={styles.historyHeaderRow}>
            <div style={styles.actionLogTitle}>
              {replayState.isReplaying ? 'Replay Mode' : 'Hand History'}
            </div>
            {phase === 'complete' && !replayState.isReplaying && (
              <ExportControls
                events={handHistory}
                handNumber={handCount}
              />
            )}
          </div>
          {handHistory.map((event, i) => {
            const styleType = getEventStyleType(event);
            const baseStyle = styleType === 'header' ? styles.historyHeader
              : styleType === 'info' ? styles.historyInfo
              : styleType === 'action' ? styles.historyAction
              : styleType === 'cards' ? styles.historyCards
              : styleType === 'result' ? styles.historyResult
              : styles.actionLogEntry;

            // Apply replay highlighting
            const isCurrentReplayEvent = replayState.isReplaying && i === replayState.currentIndex;
            const isAfterCurrentEvent = replayState.isReplaying && i > replayState.currentIndex;

            const eventStyle = {
              ...baseStyle,
              ...(isCurrentReplayEvent ? styles.historyHighlight : {}),
              ...(isAfterCurrentEvent ? styles.historyDimmed : {}),
            };

            return (
              <div key={i} style={eventStyle}>
                {formatHistoryEvent(event)}
              </div>
            );
          })}

          {/* Replay Controls - Only show after hand is complete */}
          {phase === 'complete' && (
            <div style={styles.replayControlsContainer}>
              <ReplayControls
                totalEvents={handHistory.length}
                replayState={replayState}
                onStepBackward={handleReplayStepBackward}
                onStepForward={handleReplayStepForward}
                onPlay={handleReplayPlay}
                onPause={handleReplayPause}
                onReset={handleReplayReset}
                onSpeedChange={handleReplaySpeedChange}
                onStartReplay={handleStartReplay}
                onExitReplay={handleExitReplay}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default LiveGame;
