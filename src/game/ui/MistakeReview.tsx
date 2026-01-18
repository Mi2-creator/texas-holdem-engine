/**
 * MistakeReview.tsx
 * Phase L19 - Post-hand Decision Analysis
 *
 * Detects and displays incorrect decisions made by the hero:
 * - Compares player action vs recommended action
 * - Shows "What went wrong" panel after hand completes
 * - Allows stepping through only mistake actions
 * - Integrates with Training Mode and Lesson system
 *
 * UI-only, no engine changes.
 */

import React, { useState, useCallback } from 'react';
import { Card, formatCard } from '../engine/Card';
import { PlayerAction } from '../engine/BettingRound';
import { analyzeDecision, Recommendation, DecisionAnalysis } from './DecisionHelper';

// ============================================================================
// Types
// ============================================================================

/** Context captured at the time of a decision */
export interface DecisionContext {
  readonly street: string;
  readonly pot: number;
  readonly callAmount: number;
  readonly holeCards: readonly Card[];
  readonly communityCards: readonly Card[];
  readonly heroStack: number;
}

/** Record of a mistake made by the hero */
export interface MistakeRecord {
  readonly id: number;
  readonly context: DecisionContext;
  readonly playerAction: PlayerAction;
  readonly recommendedAction: Recommendation;
  readonly analysis: DecisionAnalysis;
  readonly historyEventIndex: number; // Index in hand history for highlighting
}

/** Props for the main MistakeReview component */
interface MistakeReviewProps {
  readonly mistakes: readonly MistakeRecord[];
  readonly onStepToMistake?: (mistakeIndex: number) => void;
  readonly compact?: boolean;
}

/** Props for the inline mistake indicator */
interface MistakeIndicatorProps {
  readonly mistake: MistakeRecord;
  readonly onClick?: () => void;
}

// ============================================================================
// Mistake Detection Logic
// ============================================================================

/**
 * Convert player action type to recommendation type for comparison.
 */
function playerActionToRecommendation(action: PlayerAction, callAmount: number): Recommendation {
  switch (action.type) {
    case 'fold':
      return 'fold';
    case 'check':
      return 'call'; // Check is equivalent to call when callAmount is 0
    case 'call':
      return 'call';
    case 'bet':
    case 'raise':
    case 'all-in':
      return 'raise';
    default:
      return 'call';
  }
}

/**
 * Check if a player action matches the recommended action.
 * Returns true if the action is considered correct.
 */
export function isActionCorrect(
  playerAction: PlayerAction,
  recommendedAction: Recommendation,
  callAmount: number,
  confidence: 'strong' | 'moderate' | 'weak'
): boolean {
  const playerRec = playerActionToRecommendation(playerAction, callAmount);

  // Exact match is always correct
  if (playerRec === recommendedAction) {
    return true;
  }

  // For weak confidence recommendations, allow some flexibility
  if (confidence === 'weak') {
    // Any reasonable action is acceptable when recommendation is weak
    return true;
  }

  // For moderate confidence, allow adjacent actions
  if (confidence === 'moderate') {
    // call/check and raise are adjacent (both are "continuing")
    if (recommendedAction === 'call' && playerRec === 'raise') return true;
    if (recommendedAction === 'raise' && playerRec === 'call') return true;
  }

  // Strong confidence or clear mismatch = mistake
  return false;
}

/**
 * Detect if a hero action is a mistake and return mistake record if so.
 */
export function detectMistake(
  context: DecisionContext,
  playerAction: PlayerAction,
  historyEventIndex: number,
  mistakeId: number
): MistakeRecord | null {
  const analysis = analyzeDecision(
    context.pot,
    context.callAmount,
    context.holeCards,
    context.communityCards,
    context.street
  );

  const isCorrect = isActionCorrect(
    playerAction,
    analysis.recommendation,
    context.callAmount,
    analysis.confidence
  );

  if (isCorrect) {
    return null;
  }

  return {
    id: mistakeId,
    context,
    playerAction,
    recommendedAction: analysis.recommendation,
    analysis,
    historyEventIndex,
  };
}

// ============================================================================
// Styles
// ============================================================================

const styles = {
  container: {
    padding: '16px',
    borderRadius: '12px',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    marginTop: '12px',
  },

  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '12px',
  },

  title: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },

  titleIcon: {
    fontSize: '18px',
  },

  titleText: {
    fontSize: '14px',
    fontWeight: 700,
    color: '#ef4444',
  },

  mistakeCount: {
    padding: '4px 10px',
    borderRadius: '12px',
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    fontSize: '12px',
    fontWeight: 600,
    color: '#ef4444',
  },

  mistakeList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },

  mistakeCard: {
    padding: '12px',
    borderRadius: '8px',
    backgroundColor: 'rgba(30, 30, 40, 0.8)',
    border: '1px solid rgba(239, 68, 68, 0.2)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },

  mistakeCardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '8px',
  },

  mistakeStreet: {
    fontSize: '10px',
    fontWeight: 600,
    color: 'rgba(156, 163, 175, 0.7)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },

  mistakeBadge: {
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '9px',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
  },

  mistakeActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '8px',
  },

  actionLabel: {
    fontSize: '10px',
    color: 'rgba(156, 163, 175, 0.6)',
    marginBottom: '2px',
  },

  actionValue: {
    fontSize: '14px',
    fontWeight: 600,
  },

  vsArrow: {
    fontSize: '12px',
    color: 'rgba(156, 163, 175, 0.5)',
  },

  mistakeReason: {
    fontSize: '11px',
    color: 'rgba(209, 213, 219, 0.8)',
    lineHeight: '1.4',
    padding: '8px',
    borderRadius: '6px',
    backgroundColor: 'rgba(15, 15, 20, 0.6)',
  },

  mistakeContext: {
    display: 'flex',
    gap: '12px',
    marginTop: '8px',
    fontSize: '10px',
    color: 'rgba(156, 163, 175, 0.7)',
  },

  noMistakes: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '16px',
    borderRadius: '10px',
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    border: '1px solid rgba(34, 197, 94, 0.3)',
  },

  noMistakesIcon: {
    fontSize: '20px',
  },

  noMistakesText: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#22c55e',
  },

  // Compact styles
  compactContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    borderRadius: '8px',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
  },

  compactIcon: {
    fontSize: '14px',
  },

  compactText: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#ef4444',
  },

  // Mistake indicator (inline)
  indicator: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '2px 6px',
    borderRadius: '4px',
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    fontSize: '10px',
    fontWeight: 600,
    color: '#ef4444',
    cursor: 'pointer',
    marginLeft: '8px',
  },

  // Navigation controls
  navigation: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginTop: '12px',
    paddingTop: '12px',
    borderTop: '1px solid rgba(75, 85, 99, 0.3)',
  },

  navButton: {
    padding: '6px 12px',
    borderRadius: '6px',
    backgroundColor: 'rgba(75, 85, 99, 0.2)',
    border: '1px solid rgba(75, 85, 99, 0.3)',
    color: '#9ca3af',
    fontSize: '11px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },

  navButtonActive: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
    color: '#ef4444',
  },

  navInfo: {
    flex: 1,
    textAlign: 'center' as const,
    fontSize: '11px',
    color: 'rgba(156, 163, 175, 0.7)',
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

function formatActionName(action: PlayerAction): string {
  switch (action.type) {
    case 'fold': return 'Fold';
    case 'check': return 'Check';
    case 'call': return 'Call';
    case 'bet': return `Bet $${action.amount}`;
    case 'raise': return `Raise $${action.amount}`;
    case 'all-in': return 'All-In';
    default: return action.type;
  }
}

function formatRecommendation(rec: Recommendation, callAmount: number): string {
  if (rec === 'call' && callAmount === 0) return 'Check';
  return rec.charAt(0).toUpperCase() + rec.slice(1);
}

function getActionColor(rec: Recommendation): string {
  switch (rec) {
    case 'fold': return '#ef4444';
    case 'call': return '#eab308';
    case 'raise': return '#22c55e';
  }
}

function formatStreet(street: string): string {
  return street.charAt(0).toUpperCase() + street.slice(1);
}

// ============================================================================
// Components
// ============================================================================

/**
 * Inline mistake indicator for hand history
 */
export function MistakeIndicator({ mistake, onClick }: MistakeIndicatorProps): React.ReactElement {
  return (
    <span
      style={styles.indicator}
      onClick={onClick}
      title={`You ${formatActionName(mistake.playerAction).toLowerCase()}, but should have ${formatRecommendation(mistake.recommendedAction, mistake.context.callAmount).toLowerCase()}`}
    >
      <span>!</span>
      <span>Mistake</span>
    </span>
  );
}

/**
 * Main mistake review panel
 */
export function MistakeReview({
  mistakes,
  onStepToMistake,
  compact = false,
}: MistakeReviewProps): React.ReactElement {
  const [currentIndex, setCurrentIndex] = useState(0);

  const handlePrevious = useCallback(() => {
    setCurrentIndex(prev => Math.max(0, prev - 1));
  }, []);

  const handleNext = useCallback(() => {
    setCurrentIndex(prev => Math.min(mistakes.length - 1, prev + 1));
  }, [mistakes.length]);

  const handleMistakeClick = useCallback((index: number) => {
    setCurrentIndex(index);
    if (onStepToMistake) {
      onStepToMistake(index);
    }
  }, [onStepToMistake]);

  // No mistakes - show success message
  if (mistakes.length === 0) {
    return (
      <div style={styles.noMistakes}>
        <span style={styles.noMistakesIcon}>✓</span>
        <span style={styles.noMistakesText}>No mistakes detected this hand!</span>
      </div>
    );
  }

  // Compact mode
  if (compact) {
    return (
      <div style={styles.compactContainer}>
        <span style={styles.compactIcon}>!</span>
        <span style={styles.compactText}>
          {mistakes.length} mistake{mistakes.length !== 1 ? 's' : ''} detected
        </span>
      </div>
    );
  }

  // Full mode
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.title}>
          <span style={styles.titleIcon}>!</span>
          <span style={styles.titleText}>What Went Wrong</span>
        </div>
        <span style={styles.mistakeCount}>
          {mistakes.length} mistake{mistakes.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div style={styles.mistakeList}>
        {mistakes.map((mistake, index) => (
          <div
            key={mistake.id}
            style={{
              ...styles.mistakeCard,
              ...(index === currentIndex ? { borderColor: 'rgba(239, 68, 68, 0.5)' } : {}),
            }}
            onClick={() => handleMistakeClick(index)}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(30, 30, 40, 0.8)';
            }}
          >
            <div style={styles.mistakeCardHeader}>
              <span style={styles.mistakeStreet}>
                {formatStreet(mistake.context.street)}
              </span>
              <span style={{
                ...styles.mistakeBadge,
                backgroundColor: `rgba(239, 68, 68, 0.2)`,
                color: '#ef4444',
              }}>
                {mistake.analysis.confidence} confidence
              </span>
            </div>

            <div style={styles.mistakeActions}>
              <div>
                <div style={styles.actionLabel}>You played</div>
                <div style={{
                  ...styles.actionValue,
                  color: '#ef4444',
                }}>
                  {formatActionName(mistake.playerAction)}
                </div>
              </div>
              <span style={styles.vsArrow}>→</span>
              <div>
                <div style={styles.actionLabel}>Should have</div>
                <div style={{
                  ...styles.actionValue,
                  color: getActionColor(mistake.recommendedAction),
                }}>
                  {formatRecommendation(mistake.recommendedAction, mistake.context.callAmount)}
                </div>
              </div>
            </div>

            <div style={styles.mistakeReason}>
              {mistake.analysis.reasoning}
            </div>

            <div style={styles.mistakeContext}>
              <span>Pot: ${mistake.context.pot}</span>
              {mistake.context.callAmount > 0 && (
                <span>To call: ${mistake.context.callAmount}</span>
              )}
              <span>
                Cards: {mistake.context.holeCards.map(c => formatCard(c)).join(' ')}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Navigation for stepping through mistakes */}
      {mistakes.length > 1 && (
        <div style={styles.navigation}>
          <button
            style={{
              ...styles.navButton,
              ...(currentIndex > 0 ? styles.navButtonActive : {}),
              opacity: currentIndex > 0 ? 1 : 0.5,
            }}
            onClick={handlePrevious}
            disabled={currentIndex === 0}
          >
            ← Previous
          </button>
          <span style={styles.navInfo}>
            Mistake {currentIndex + 1} of {mistakes.length}
          </span>
          <button
            style={{
              ...styles.navButton,
              ...(currentIndex < mistakes.length - 1 ? styles.navButtonActive : {}),
              opacity: currentIndex < mistakes.length - 1 ? 1 : 0.5,
            }}
            onClick={handleNext}
            disabled={currentIndex === mistakes.length - 1}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

export default MistakeReview;
