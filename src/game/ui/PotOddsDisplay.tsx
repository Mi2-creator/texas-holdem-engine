/**
 * PotOddsDisplay.tsx
 * Phase L13 - Pot odds and hand strength display
 *
 * Shows real-time pot odds, required call amount, and hand strength
 * to help the hero make informed decisions.
 * UI-only, no engine changes.
 */

import React, { useMemo } from 'react';
import { Card } from '../engine/Card';
import { evaluateHand } from '../engine/HandEvaluator';
import { HandRank, HandCategory, HAND_CATEGORY_NAMES } from '../engine/HandRank';

// ============================================================================
// Types
// ============================================================================

interface PotOddsDisplayProps {
  /** Current pot size */
  readonly pot: number;
  /** Amount hero needs to call (0 if can check) */
  readonly callAmount: number;
  /** Hero's hole cards */
  readonly holeCards: readonly Card[];
  /** Community cards on the board */
  readonly communityCards: readonly Card[];
  /** Current betting street */
  readonly street: 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'complete';
}

// ============================================================================
// Pot Odds Calculations
// ============================================================================

/**
 * Calculate pot odds as a ratio (e.g., 3:1)
 */
function calculatePotOddsRatio(pot: number, callAmount: number): string {
  if (callAmount === 0) return '-';
  const ratio = pot / callAmount;
  return `${ratio.toFixed(1)}:1`;
}

/**
 * Calculate pot odds as a percentage
 */
function calculatePotOddsPercent(pot: number, callAmount: number): number {
  if (callAmount === 0) return 0;
  const totalPot = pot + callAmount;
  return (callAmount / totalPot) * 100;
}

/**
 * Get guidance text based on pot odds
 */
function getPotOddsGuidance(pot: number, callAmount: number): string {
  if (callAmount === 0) return 'Free to see';
  const percent = calculatePotOddsPercent(pot, callAmount);
  if (percent < 20) return 'Good odds';
  if (percent < 33) return 'Fair odds';
  return 'Expensive';
}

// ============================================================================
// Hand Strength Helpers
// ============================================================================

/**
 * Evaluate current hand strength
 * Returns null if not enough cards
 */
function evaluateCurrentHand(
  holeCards: readonly Card[],
  communityCards: readonly Card[]
): HandRank | null {
  const allCards = [...holeCards, ...communityCards];
  if (allCards.length < 5) return null;
  return evaluateHand(allCards);
}

/**
 * Get hand strength as a 0-100 score based on category
 * This is a simplified strength indicator, not true equity
 */
function getHandStrengthScore(category: HandCategory): number {
  // Map category (1-10) to approximate strength percentile
  const strengthMap: Record<HandCategory, number> = {
    1: 15,  // High Card - weak
    2: 35,  // One Pair - below average
    3: 55,  // Two Pair - above average
    4: 65,  // Three of a Kind - strong
    5: 70,  // Straight - strong
    6: 75,  // Flush - very strong
    7: 85,  // Full House - very strong
    8: 92,  // Four of a Kind - monster
    9: 97,  // Straight Flush - monster
    10: 100, // Royal Flush - nuts
  };
  return strengthMap[category];
}

/**
 * Get strength label
 */
function getStrengthLabel(category: HandCategory): string {
  if (category >= 7) return 'Monster';
  if (category >= 5) return 'Strong';
  if (category >= 3) return 'Medium';
  if (category === 2) return 'Weak';
  return 'Very Weak';
}

/**
 * Get strength color
 */
function getStrengthColor(category: HandCategory): string {
  if (category >= 7) return '#22c55e'; // Green - monster
  if (category >= 5) return '#84cc16'; // Lime - strong
  if (category >= 3) return '#eab308'; // Yellow - medium
  if (category === 2) return '#f97316'; // Orange - weak
  return '#ef4444'; // Red - very weak
}

/**
 * Get preflop hand strength description
 */
function getPreflopStrength(holeCards: readonly Card[]): {
  description: string;
  strength: 'premium' | 'strong' | 'playable' | 'marginal' | 'weak';
  color: string;
} {
  if (holeCards.length !== 2) {
    return { description: '-', strength: 'weak', color: '#9ca3af' };
  }

  const [card1, card2] = holeCards;
  const highRank = Math.max(card1.rank, card2.rank);
  const lowRank = Math.min(card1.rank, card2.rank);
  const isPair = card1.rank === card2.rank;
  const isSuited = card1.suit === card2.suit;
  const gap = highRank - lowRank;

  // Premium hands
  if (isPair && highRank >= 12) {
    return { description: 'Premium Pair', strength: 'premium', color: '#22c55e' };
  }
  if (highRank === 14 && lowRank === 13) {
    return { description: isSuited ? 'Big Slick Suited' : 'Big Slick', strength: 'premium', color: '#22c55e' };
  }

  // Strong hands
  if (isPair && highRank >= 9) {
    return { description: 'Strong Pair', strength: 'strong', color: '#84cc16' };
  }
  if (highRank === 14 && lowRank >= 10) {
    return { description: 'Ace-Face', strength: 'strong', color: '#84cc16' };
  }
  if (highRank >= 12 && lowRank >= 11 && isSuited) {
    return { description: 'Suited Broadway', strength: 'strong', color: '#84cc16' };
  }

  // Playable hands
  if (isPair) {
    return { description: 'Small Pair', strength: 'playable', color: '#eab308' };
  }
  if (highRank === 14) {
    return { description: isSuited ? 'Suited Ace' : 'Ace-x', strength: 'playable', color: '#eab308' };
  }
  if (isSuited && gap <= 3 && lowRank >= 6) {
    return { description: 'Suited Connector', strength: 'playable', color: '#eab308' };
  }
  if (highRank >= 12 && lowRank >= 10) {
    return { description: 'Broadway Cards', strength: 'playable', color: '#eab308' };
  }

  // Marginal hands
  if (isSuited && highRank >= 10) {
    return { description: 'Suited High', strength: 'marginal', color: '#f97316' };
  }
  if (gap <= 2 && lowRank >= 5) {
    return { description: 'Connected', strength: 'marginal', color: '#f97316' };
  }

  // Weak hands
  return { description: 'Weak Hand', strength: 'weak', color: '#ef4444' };
}

// ============================================================================
// Styles
// ============================================================================

const styles = {
  container: {
    display: 'flex',
    gap: '16px',
    padding: '12px 16px',
    borderRadius: '10px',
    backgroundColor: 'rgba(15, 15, 20, 0.95)',
    border: '1px solid rgba(99, 102, 241, 0.3)',
    alignItems: 'stretch',
  },

  section: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
    minWidth: '100px',
  },

  sectionLabel: {
    fontSize: '9px',
    fontWeight: 600,
    color: 'rgba(156, 163, 175, 0.6)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },

  sectionValue: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#fff',
  },

  sectionSubtext: {
    fontSize: '10px',
    color: 'rgba(156, 163, 175, 0.7)',
  },

  divider: {
    width: '1px',
    backgroundColor: 'rgba(75, 85, 99, 0.4)',
    alignSelf: 'stretch' as const,
  },

  strengthBar: {
    height: '4px',
    borderRadius: '2px',
    backgroundColor: 'rgba(75, 85, 99, 0.3)',
    overflow: 'hidden',
    marginTop: '4px',
  },

  strengthFill: {
    height: '100%',
    borderRadius: '2px',
    transition: 'width 0.3s ease',
  },

  callAmount: {
    color: '#f59e0b',
  },

  freeCheck: {
    color: '#22c55e',
  },
};

// ============================================================================
// Main Component
// ============================================================================

export function PotOddsDisplay({
  pot,
  callAmount,
  holeCards,
  communityCards,
  street,
}: PotOddsDisplayProps): React.ReactElement {
  // Calculate pot odds
  const potOddsRatio = useMemo(
    () => calculatePotOddsRatio(pot, callAmount),
    [pot, callAmount]
  );

  const potOddsGuidance = useMemo(
    () => getPotOddsGuidance(pot, callAmount),
    [pot, callAmount]
  );

  // Evaluate hand strength
  const handStrength = useMemo(() => {
    if (street === 'preflop') {
      return getPreflopStrength(holeCards);
    }

    const handRank = evaluateCurrentHand(holeCards, communityCards);
    if (!handRank) {
      return { description: '-', strength: 'weak' as const, color: '#9ca3af', score: 0 };
    }

    return {
      description: handRank.description,
      strength: getStrengthLabel(handRank.category) as any,
      color: getStrengthColor(handRank.category),
      score: getHandStrengthScore(handRank.category),
      category: handRank.category,
    };
  }, [holeCards, communityCards, street]);

  // Format chips
  const formatChips = (amount: number) => amount.toLocaleString('en-US');

  return (
    <div style={styles.container}>
      {/* Pot & Call Section */}
      <div style={styles.section}>
        <span style={styles.sectionLabel}>Pot / Call</span>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
          <span style={styles.sectionValue}>${formatChips(pot)}</span>
          <span style={callAmount > 0 ? styles.callAmount : styles.freeCheck}>
            {callAmount > 0 ? `/ $${formatChips(callAmount)}` : '/ Check'}
          </span>
        </div>
        <span style={styles.sectionSubtext}>
          {callAmount > 0 ? `${potOddsGuidance}` : 'Free to see'}
        </span>
      </div>

      <div style={styles.divider} />

      {/* Pot Odds Section */}
      <div style={styles.section}>
        <span style={styles.sectionLabel}>Pot Odds</span>
        <span style={styles.sectionValue}>
          {callAmount > 0 ? potOddsRatio : '-'}
        </span>
        <span style={styles.sectionSubtext}>
          {callAmount > 0
            ? `Need ${calculatePotOddsPercent(pot, callAmount).toFixed(0)}% equity`
            : 'No bet to call'}
        </span>
      </div>

      <div style={styles.divider} />

      {/* Hand Strength Section */}
      <div style={{ ...styles.section, minWidth: '140px' }}>
        <span style={styles.sectionLabel}>
          {street === 'preflop' ? 'Starting Hand' : 'Current Hand'}
        </span>
        <span style={{ ...styles.sectionValue, color: handStrength.color, fontSize: '14px' }}>
          {handStrength.description}
        </span>
        {'score' in handStrength && handStrength.score !== undefined && (
          <div style={styles.strengthBar}>
            <div
              style={{
                ...styles.strengthFill,
                width: `${handStrength.score}%`,
                backgroundColor: handStrength.color,
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default PotOddsDisplay;
