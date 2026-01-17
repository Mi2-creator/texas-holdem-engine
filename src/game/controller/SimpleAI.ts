/**
 * SimpleAI.ts
 * Phase L2 - Simple rule-based AI for opponent decisions
 *
 * Placeholder AI that makes basic decisions:
 * - Check when possible
 * - Call small bets
 * - Fold to large bets (sometimes)
 * - Occasionally raise
 *
 * No ML, no complex strategy - just playable opponent.
 */

import { TableState, getCurrentPlayer } from '../engine/TableState';
import { PlayerAction, getValidActions, ValidActions } from '../engine/BettingRound';

// ============================================================================
// Types
// ============================================================================

export type AIStyle = 'passive' | 'neutral' | 'aggressive';

export interface AIConfig {
  readonly style: AIStyle;
  readonly foldThreshold: number; // Fold if call amount > stack * threshold
  readonly raiseFrequency: number; // 0-1, chance to raise when possible
}

// ============================================================================
// Default Config
// ============================================================================

const DEFAULT_CONFIG: AIConfig = {
  style: 'neutral',
  foldThreshold: 0.5, // Fold if call > 50% of stack
  raiseFrequency: 0.2, // 20% chance to raise
};

// ============================================================================
// Decision Functions
// ============================================================================

/**
 * Make a decision for the AI player
 */
export function makeAIDecision(
  state: TableState,
  config: AIConfig = DEFAULT_CONFIG
): PlayerAction {
  const validActions = getValidActions(state);
  const player = getCurrentPlayer(state);

  if (!player) {
    return { type: 'fold' };
  }

  // If can check, usually check
  if (validActions.canCheck) {
    // Sometimes bet if aggressive
    if (config.style === 'aggressive' && validActions.canBet && Math.random() < 0.3) {
      return {
        type: 'bet',
        amount: Math.min(validActions.minBet * 2, validActions.maxBet),
      };
    }
    return { type: 'check' };
  }

  // Facing a bet - decide call/fold/raise
  const callAmount = validActions.callAmount;
  const callRatio = callAmount / player.stack;

  // Fold if call is too expensive
  if (callRatio > config.foldThreshold) {
    // But sometimes call anyway (pot odds simulation)
    if (Math.random() < 0.2) {
      return validActions.canCall ? { type: 'call' } : { type: 'all-in' };
    }
    return { type: 'fold' };
  }

  // Consider raising
  if (validActions.canRaise && Math.random() < config.raiseFrequency) {
    const raiseAmount = calculateRaiseAmount(state, validActions, config);
    return { type: 'raise', amount: raiseAmount };
  }

  // Default: call
  if (validActions.canCall) {
    return { type: 'call' };
  }

  // Can't call (not enough chips) - go all-in or fold
  if (player.stack > 0) {
    return { type: 'all-in' };
  }

  return { type: 'fold' };
}

/**
 * Calculate raise amount based on style
 */
function calculateRaiseAmount(
  state: TableState,
  validActions: ValidActions,
  config: AIConfig
): number {
  const { minRaise, maxRaise } = validActions;

  switch (config.style) {
    case 'passive':
      // Min raise
      return minRaise;

    case 'aggressive':
      // Pot-sized or larger raise
      const potRaise = Math.min(state.pot + state.currentBet * 2, maxRaise);
      return Math.max(minRaise, potRaise);

    case 'neutral':
    default:
      // 2-3x current bet
      const midRaise = state.currentBet * 2.5;
      return Math.min(Math.max(minRaise, midRaise), maxRaise);
  }
}

// ============================================================================
// AI Style Presets
// ============================================================================

export const AI_STYLES: Record<AIStyle, AIConfig> = {
  passive: {
    style: 'passive',
    foldThreshold: 0.3,
    raiseFrequency: 0.05,
  },
  neutral: {
    style: 'neutral',
    foldThreshold: 0.5,
    raiseFrequency: 0.2,
  },
  aggressive: {
    style: 'aggressive',
    foldThreshold: 0.7,
    raiseFrequency: 0.4,
  },
};

/**
 * Create AI decision function with specific style
 */
export function createAI(style: AIStyle = 'neutral'): (state: TableState) => PlayerAction {
  const config = AI_STYLES[style];
  return (state: TableState) => makeAIDecision(state, config);
}
