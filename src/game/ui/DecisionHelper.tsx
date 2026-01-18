/**
 * DecisionHelper.tsx
 * Phase L14 - Decision helper overlay
 *
 * Provides simple recommendations (Fold/Call/Raise) based on
 * pot odds vs hand strength analysis.
 * UI-only, no engine or AI logic changes.
 */

import React, { useMemo } from 'react';
import { Card } from '../engine/Card';
import { evaluateHand } from '../engine/HandEvaluator';
import { HandCategory } from '../engine/HandRank';

// ============================================================================
// Types
// ============================================================================

export type Recommendation = 'fold' | 'call' | 'raise';

export interface DecisionAnalysis {
  readonly recommendation: Recommendation;
  readonly confidence: 'strong' | 'moderate' | 'weak';
  readonly reasoning: string;
  readonly factors: readonly string[];
}

interface DecisionHelperProps {
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
  /** Whether to show in compact mode */
  readonly compact?: boolean;
}

// ============================================================================
// Decision Logic
// ============================================================================

/**
 * Calculate pot odds as required equity percentage
 */
function getRequiredEquity(pot: number, callAmount: number): number {
  if (callAmount === 0) return 0;
  return (callAmount / (pot + callAmount)) * 100;
}

/**
 * Get preflop hand strength score (0-100)
 */
function getPreflopStrengthScore(holeCards: readonly Card[]): number {
  if (holeCards.length !== 2) return 0;

  const [card1, card2] = holeCards;
  const highRank = Math.max(card1.rank, card2.rank);
  const lowRank = Math.min(card1.rank, card2.rank);
  const isPair = card1.rank === card2.rank;
  const isSuited = card1.suit === card2.suit;
  const gap = highRank - lowRank;

  let score = 0;

  // Base score from high card
  score += (highRank - 2) * 3; // 0-36 points

  // Pair bonus
  if (isPair) {
    score += 20 + (highRank - 2) * 2; // Pairs are strong
  }

  // Suited bonus
  if (isSuited) {
    score += 8;
  }

  // Connectedness bonus
  if (gap <= 1) score += 6;
  else if (gap <= 2) score += 3;
  else if (gap <= 3) score += 1;

  // Broadway bonus (both cards 10+)
  if (lowRank >= 10) score += 10;

  // Ace bonus
  if (highRank === 14) score += 8;

  // Cap at 100
  return Math.min(100, score);
}

/**
 * Get postflop hand strength score (0-100)
 */
function getPostflopStrengthScore(
  holeCards: readonly Card[],
  communityCards: readonly Card[]
): number {
  const allCards = [...holeCards, ...communityCards];
  if (allCards.length < 5) return 0;

  const handRank = evaluateHand(allCards);

  // Map category to base score
  const categoryScores: Record<HandCategory, number> = {
    1: 15,  // High Card
    2: 35,  // One Pair
    3: 55,  // Two Pair
    4: 70,  // Three of a Kind
    5: 75,  // Straight
    6: 80,  // Flush
    7: 88,  // Full House
    8: 95,  // Four of a Kind
    9: 98,  // Straight Flush
    10: 100, // Royal Flush
  };

  return categoryScores[handRank.category];
}

/**
 * Analyze the situation and provide a recommendation
 */
function analyzeDecision(
  pot: number,
  callAmount: number,
  holeCards: readonly Card[],
  communityCards: readonly Card[],
  street: string
): DecisionAnalysis {
  const requiredEquity = getRequiredEquity(pot, callAmount);
  const isPreflop = street === 'preflop';

  const strengthScore = isPreflop
    ? getPreflopStrengthScore(holeCards)
    : getPostflopStrengthScore(holeCards, communityCards);

  const factors: string[] = [];

  // Can check (no bet to call)
  if (callAmount === 0) {
    factors.push('No bet to call');

    if (strengthScore >= 70) {
      factors.push('Strong hand - build the pot');
      return {
        recommendation: 'raise',
        confidence: 'strong',
        reasoning: 'You have a strong hand and can bet for value.',
        factors,
      };
    }

    if (strengthScore >= 40) {
      factors.push('Decent hand - can check or bet');
      return {
        recommendation: 'call', // Check
        confidence: 'moderate',
        reasoning: 'Check to see more cards or bet for thin value.',
        factors,
      };
    }

    factors.push('Weak hand - free card');
    return {
      recommendation: 'call', // Check
      confidence: 'strong',
      reasoning: 'Check to see a free card with your weak holding.',
      factors,
    };
  }

  // Must call or fold
  factors.push(`Need ${requiredEquity.toFixed(0)}% equity to call`);
  factors.push(`Hand strength: ${strengthScore.toFixed(0)}%`);

  // Strong hand logic
  if (strengthScore >= 75) {
    factors.push('Very strong hand');
    return {
      recommendation: 'raise',
      confidence: 'strong',
      reasoning: 'You have a strong hand. Raise for value and protection.',
      factors,
    };
  }

  if (strengthScore >= 60) {
    if (requiredEquity <= 25) {
      factors.push('Good pot odds');
      return {
        recommendation: 'raise',
        confidence: 'moderate',
        reasoning: 'Strong hand with good odds. Consider raising.',
        factors,
      };
    }
    factors.push('Solid hand');
    return {
      recommendation: 'call',
      confidence: 'strong',
      reasoning: 'Call with your solid hand.',
      factors,
    };
  }

  // Medium hand logic
  if (strengthScore >= 40) {
    if (requiredEquity <= 20) {
      factors.push('Favorable pot odds');
      return {
        recommendation: 'call',
        confidence: 'strong',
        reasoning: 'Good pot odds make this a profitable call.',
        factors,
      };
    }
    if (requiredEquity <= 33) {
      factors.push('Borderline decision');
      return {
        recommendation: 'call',
        confidence: 'weak',
        reasoning: 'Marginal spot. Call if you expect to improve.',
        factors,
      };
    }
    factors.push('Expensive to continue');
    return {
      recommendation: 'fold',
      confidence: 'moderate',
      reasoning: 'The bet is too large for your medium-strength hand.',
      factors,
    };
  }

  // Weak hand logic
  if (strengthScore >= 25) {
    if (requiredEquity <= 15) {
      factors.push('Very good pot odds');
      return {
        recommendation: 'call',
        confidence: 'moderate',
        reasoning: 'Pot odds are good enough to see another card.',
        factors,
      };
    }
    factors.push('Weak hand facing bet');
    return {
      recommendation: 'fold',
      confidence: 'moderate',
      reasoning: 'Your hand is too weak to continue.',
      factors,
    };
  }

  // Very weak hand
  factors.push('Very weak holding');
  if (requiredEquity <= 10) {
    return {
      recommendation: 'call',
      confidence: 'weak',
      reasoning: 'Minimal investment might be worth it.',
      factors,
    };
  }

  return {
    recommendation: 'fold',
    confidence: 'strong',
    reasoning: 'Fold your weak hand and wait for a better spot.',
    factors,
  };
}

// ============================================================================
// Styles
// ============================================================================

const styles = {
  container: {
    padding: '12px 16px',
    borderRadius: '10px',
    backgroundColor: 'rgba(15, 15, 20, 0.95)',
    border: '1px solid rgba(168, 85, 247, 0.3)',
    minWidth: '200px',
  },

  compactContainer: {
    padding: '8px 12px',
    borderRadius: '8px',
    backgroundColor: 'rgba(15, 15, 20, 0.9)',
    border: '1px solid rgba(168, 85, 247, 0.3)',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },

  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '8px',
  },

  label: {
    fontSize: '9px',
    fontWeight: 600,
    color: 'rgba(156, 163, 175, 0.6)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },

  recommendation: {
    fontSize: '18px',
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '1px',
  },

  confidenceBadge: {
    padding: '2px 6px',
    borderRadius: '4px',
    fontSize: '9px',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
  },

  reasoning: {
    fontSize: '12px',
    color: 'rgba(209, 213, 219, 0.9)',
    lineHeight: '1.4',
    marginBottom: '8px',
  },

  factors: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '4px',
  },

  factor: {
    padding: '2px 6px',
    borderRadius: '4px',
    backgroundColor: 'rgba(75, 85, 99, 0.3)',
    fontSize: '10px',
    color: 'rgba(156, 163, 175, 0.8)',
  },

  // Compact styles
  compactRecommendation: {
    fontSize: '14px',
    fontWeight: 700,
    textTransform: 'uppercase' as const,
  },

  compactReasoning: {
    fontSize: '11px',
    color: 'rgba(156, 163, 175, 0.8)',
    flex: 1,
  },
};

// ============================================================================
// Color Helpers
// ============================================================================

function getRecommendationColor(rec: Recommendation): string {
  switch (rec) {
    case 'fold': return '#ef4444';
    case 'call': return '#eab308';
    case 'raise': return '#22c55e';
  }
}

function getConfidenceStyle(confidence: 'strong' | 'moderate' | 'weak'): {
  bg: string;
  text: string;
} {
  switch (confidence) {
    case 'strong':
      return { bg: 'rgba(34, 197, 94, 0.2)', text: '#22c55e' };
    case 'moderate':
      return { bg: 'rgba(234, 179, 8, 0.2)', text: '#eab308' };
    case 'weak':
      return { bg: 'rgba(156, 163, 175, 0.2)', text: '#9ca3af' };
  }
}

function getRecommendationLabel(rec: Recommendation, callAmount: number): string {
  if (rec === 'call' && callAmount === 0) return 'Check';
  return rec.charAt(0).toUpperCase() + rec.slice(1);
}

// ============================================================================
// Main Component
// ============================================================================

export function DecisionHelper({
  pot,
  callAmount,
  holeCards,
  communityCards,
  street,
  compact = false,
}: DecisionHelperProps): React.ReactElement {
  const analysis = useMemo(
    () => analyzeDecision(pot, callAmount, holeCards, communityCards, street),
    [pot, callAmount, holeCards, communityCards, street]
  );

  const recColor = getRecommendationColor(analysis.recommendation);
  const confStyle = getConfidenceStyle(analysis.confidence);
  const recLabel = getRecommendationLabel(analysis.recommendation, callAmount);

  // Compact mode
  if (compact) {
    return (
      <div style={styles.compactContainer}>
        <div>
          <div style={styles.label}>Suggestion</div>
          <div style={{ ...styles.compactRecommendation, color: recColor }}>
            {recLabel}
          </div>
        </div>
        <div style={styles.compactReasoning}>{analysis.reasoning}</div>
      </div>
    );
  }

  // Full mode
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <div style={styles.label}>Suggestion</div>
          <div style={{ ...styles.recommendation, color: recColor }}>
            {recLabel}
          </div>
        </div>
        <div
          style={{
            ...styles.confidenceBadge,
            backgroundColor: confStyle.bg,
            color: confStyle.text,
          }}
        >
          {analysis.confidence}
        </div>
      </div>

      <div style={styles.reasoning}>{analysis.reasoning}</div>

      <div style={styles.factors}>
        {analysis.factors.map((factor, i) => (
          <span key={i} style={styles.factor}>
            {factor}
          </span>
        ))}
      </div>
    </div>
  );
}

export default DecisionHelper;
