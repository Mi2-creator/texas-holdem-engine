/**
 * TrainingMode.tsx
 * Phase L15 - Beginner / Training mode
 *
 * Provides a toggle that:
 * - Slows down the game
 * - Highlights recommended actions
 * - Optionally auto-plays suggested decisions
 * UI-only, no engine logic changes.
 */

import React from 'react';
import { Card } from '../engine/Card';
import { evaluateHand } from '../engine/HandEvaluator';
import { HandCategory } from '../engine/HandRank';

// ============================================================================
// Types
// ============================================================================

export interface TrainingModeSettings {
  /** Whether training mode is enabled */
  readonly enabled: boolean;
  /** Whether to auto-play the suggested action */
  readonly autoPlay: boolean;
  /** Delay multiplier for slower gameplay (1.0 = normal, 2.0 = 2x slower) */
  readonly speedMultiplier: number;
  /** Whether to show detailed explanations */
  readonly showExplanations: boolean;
}

export type Recommendation = 'fold' | 'call' | 'raise';

interface TrainingModeToggleProps {
  readonly settings: TrainingModeSettings;
  readonly onSettingsChange: (settings: TrainingModeSettings) => void;
}

// ============================================================================
// Default Settings
// ============================================================================

export function createDefaultTrainingSettings(): TrainingModeSettings {
  return {
    enabled: false,
    autoPlay: false,
    speedMultiplier: 2.0,
    showExplanations: true,
  };
}

// ============================================================================
// Recommendation Logic (duplicated from DecisionHelper for independence)
// ============================================================================

function getRequiredEquity(pot: number, callAmount: number): number {
  if (callAmount === 0) return 0;
  return (callAmount / (pot + callAmount)) * 100;
}

function getPreflopStrengthScore(holeCards: readonly Card[]): number {
  if (holeCards.length !== 2) return 0;

  const [card1, card2] = holeCards;
  const highRank = Math.max(card1.rank, card2.rank);
  const lowRank = Math.min(card1.rank, card2.rank);
  const isPair = card1.rank === card2.rank;
  const isSuited = card1.suit === card2.suit;
  const gap = highRank - lowRank;

  let score = 0;
  score += (highRank - 2) * 3;
  if (isPair) score += 20 + (highRank - 2) * 2;
  if (isSuited) score += 8;
  if (gap <= 1) score += 6;
  else if (gap <= 2) score += 3;
  else if (gap <= 3) score += 1;
  if (lowRank >= 10) score += 10;
  if (highRank === 14) score += 8;

  return Math.min(100, score);
}

function getPostflopStrengthScore(
  holeCards: readonly Card[],
  communityCards: readonly Card[]
): number {
  const allCards = [...holeCards, ...communityCards];
  if (allCards.length < 5) return 0;

  const handRank = evaluateHand(allCards);
  const categoryScores: Record<HandCategory, number> = {
    1: 15, 2: 35, 3: 55, 4: 70, 5: 75, 6: 80, 7: 88, 8: 95, 9: 98, 10: 100,
  };
  return categoryScores[handRank.category];
}

/**
 * Get the recommended action for training mode highlighting
 */
export function getRecommendedAction(
  pot: number,
  callAmount: number,
  holeCards: readonly Card[],
  communityCards: readonly Card[],
  street: string
): Recommendation {
  const requiredEquity = getRequiredEquity(pot, callAmount);
  const isPreflop = street === 'preflop';

  const strengthScore = isPreflop
    ? getPreflopStrengthScore(holeCards)
    : getPostflopStrengthScore(holeCards, communityCards);

  // Can check
  if (callAmount === 0) {
    if (strengthScore >= 70) return 'raise';
    return 'call'; // Check
  }

  // Must call or fold
  if (strengthScore >= 75) return 'raise';
  if (strengthScore >= 60) {
    if (requiredEquity <= 25) return 'raise';
    return 'call';
  }
  if (strengthScore >= 40) {
    if (requiredEquity <= 33) return 'call';
    return 'fold';
  }
  if (strengthScore >= 25) {
    if (requiredEquity <= 15) return 'call';
    return 'fold';
  }
  if (requiredEquity <= 10) return 'call';
  return 'fold';
}

// ============================================================================
// Styles
// ============================================================================

const styles = {
  container: {
    padding: '12px 16px',
    borderRadius: '10px',
    backgroundColor: 'rgba(15, 15, 20, 0.95)',
    border: '1px solid rgba(234, 179, 8, 0.3)',
  },

  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '8px',
  },

  title: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },

  titleText: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#eab308',
  },

  badge: {
    padding: '2px 6px',
    borderRadius: '4px',
    backgroundColor: 'rgba(234, 179, 8, 0.2)',
    fontSize: '9px',
    fontWeight: 600,
    color: '#eab308',
    textTransform: 'uppercase' as const,
  },

  toggle: {
    position: 'relative' as const,
    width: '44px',
    height: '24px',
    borderRadius: '12px',
    backgroundColor: 'rgba(75, 85, 99, 0.4)',
    cursor: 'pointer',
    transition: 'background-color 0.2s ease',
  },

  toggleActive: {
    backgroundColor: 'rgba(234, 179, 8, 0.5)',
  },

  toggleKnob: {
    position: 'absolute' as const,
    top: '2px',
    left: '2px',
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    backgroundColor: '#fff',
    transition: 'transform 0.2s ease',
  },

  toggleKnobActive: {
    transform: 'translateX(20px)',
  },

  options: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
    paddingTop: '8px',
    borderTop: '1px solid rgba(75, 85, 99, 0.3)',
  },

  option: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  optionLabel: {
    fontSize: '11px',
    color: 'rgba(156, 163, 175, 0.9)',
  },

  optionDescription: {
    fontSize: '9px',
    color: 'rgba(156, 163, 175, 0.6)',
    marginTop: '2px',
  },

  checkbox: {
    width: '16px',
    height: '16px',
    borderRadius: '4px',
    backgroundColor: 'rgba(75, 85, 99, 0.4)',
    border: '1px solid rgba(75, 85, 99, 0.5)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '10px',
    color: '#eab308',
  },

  checkboxActive: {
    backgroundColor: 'rgba(234, 179, 8, 0.3)',
    borderColor: 'rgba(234, 179, 8, 0.5)',
  },

  speedControl: {
    display: 'flex',
    gap: '4px',
  },

  speedButton: {
    padding: '4px 8px',
    borderRadius: '4px',
    backgroundColor: 'rgba(75, 85, 99, 0.2)',
    color: 'rgba(156, 163, 175, 0.8)',
    fontSize: '10px',
    fontWeight: 500,
    cursor: 'pointer',
    border: '1px solid rgba(75, 85, 99, 0.3)',
    transition: 'all 0.15s ease',
  },

  speedButtonActive: {
    backgroundColor: 'rgba(234, 179, 8, 0.3)',
    color: '#eab308',
    borderColor: 'rgba(234, 179, 8, 0.5)',
  },

  disabledText: {
    fontSize: '11px',
    color: 'rgba(156, 163, 175, 0.5)',
    textAlign: 'center' as const,
    padding: '4px 0',
  },
};

// ============================================================================
// Main Component
// ============================================================================

export function TrainingModeToggle({
  settings,
  onSettingsChange,
}: TrainingModeToggleProps): React.ReactElement {
  const handleToggle = () => {
    onSettingsChange({ ...settings, enabled: !settings.enabled });
  };

  const handleAutoPlayToggle = () => {
    onSettingsChange({ ...settings, autoPlay: !settings.autoPlay });
  };

  const handleSpeedChange = (multiplier: number) => {
    onSettingsChange({ ...settings, speedMultiplier: multiplier });
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.title}>
          <span style={styles.titleText}>Training Mode</span>
          {settings.enabled && <span style={styles.badge}>Active</span>}
        </div>
        <div
          style={{
            ...styles.toggle,
            ...(settings.enabled ? styles.toggleActive : {}),
          }}
          onClick={handleToggle}
        >
          <div
            style={{
              ...styles.toggleKnob,
              ...(settings.enabled ? styles.toggleKnobActive : {}),
            }}
          />
        </div>
      </div>

      {settings.enabled ? (
        <div style={styles.options}>
          {/* Auto-play option */}
          <div style={styles.option}>
            <div>
              <div style={styles.optionLabel}>Auto-play suggestions</div>
              <div style={styles.optionDescription}>
                Automatically plays the recommended action
              </div>
            </div>
            <div
              style={{
                ...styles.checkbox,
                ...(settings.autoPlay ? styles.checkboxActive : {}),
              }}
              onClick={handleAutoPlayToggle}
            >
              {settings.autoPlay && '✓'}
            </div>
          </div>

          {/* Speed control */}
          <div style={styles.option}>
            <div>
              <div style={styles.optionLabel}>Game speed</div>
              <div style={styles.optionDescription}>
                Slower speed gives more time to think
              </div>
            </div>
            <div style={styles.speedControl}>
              {[
                { label: '1x', value: 1.0 },
                { label: '2x', value: 2.0 },
                { label: '3x', value: 3.0 },
              ].map(({ label, value }) => (
                <button
                  key={value}
                  style={{
                    ...styles.speedButton,
                    ...(settings.speedMultiplier === value
                      ? styles.speedButtonActive
                      : {}),
                  }}
                  onClick={() => handleSpeedChange(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div style={styles.disabledText}>
          Enable for slower gameplay and action hints
        </div>
      )}
    </div>
  );
}

export default TrainingModeToggle;
