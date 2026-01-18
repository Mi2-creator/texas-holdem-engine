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
  /** Optional: Bet sizing variance - min factor of pot (default: 0.5) */
  readonly betSizeMin?: number;
  /** Optional: Bet sizing variance - max factor of pot (default: 1.0) */
  readonly betSizeMax?: number;
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

  // If can check, usually check but sometimes bet
  if (validActions.canCheck) {
    if (validActions.canBet) {
      // Bet frequency based on style
      const betFrequency = config.style === 'aggressive' ? 0.35 :
                           config.style === 'passive' ? 0.1 : 0.2;
      if (Math.random() < betFrequency) {
        // Use bet sizing variance if available
        const betSize = calculateBetSize(state.pot, validActions, config);
        return {
          type: 'bet',
          amount: Math.max(validActions.minBet, betSize),
        };
      }
    }
    return { type: 'check' };
  }

  // Facing a bet - consider pot odds
  const callAmount = validActions.callAmount;
  const potAfterCall = state.pot + callAmount;
  const potOdds = callAmount / potAfterCall; // Need to win this % to break even
  const callRatio = callAmount / player.stack; // What % of stack to call

  // Fold if call is too expensive relative to both stack and pot odds
  const shouldFold = callRatio > config.foldThreshold || potOdds > 0.5;

  if (shouldFold) {
    // Getting bad odds - usually fold, but sometimes call (represents hand strength)
    const heroicCallChance = config.style === 'aggressive' ? 0.3 :
                             config.style === 'passive' ? 0.1 : 0.2;
    if (Math.random() < heroicCallChance) {
      return validActions.canCall ? { type: 'call' } : { type: 'all-in' };
    }
    return { type: 'fold' };
  }

  // Getting reasonable odds - consider raising
  if (validActions.canRaise && Math.random() < config.raiseFrequency) {
    const raiseAmount = calculateRaiseAmount(state, validActions, config);
    return { type: 'raise', amount: raiseAmount };
  }

  // Default: call
  if (validActions.canCall) {
    return { type: 'call' };
  }

  // Must go all-in to continue (call amount >= stack)
  if (player.stack > 0) {
    // More likely to commit if pot odds are good
    if (potOdds < 0.35 || Math.random() < 0.4) {
      return { type: 'all-in' };
    }
    return { type: 'fold' };
  }

  return { type: 'fold' };
}

/**
 * Calculate a random bet size within the configured range
 */
function calculateBetSize(
  pot: number,
  validActions: ValidActions,
  config: AIConfig
): number {
  const { minBet, maxBet } = validActions;

  // Use configured bet sizing or fall back to style-based defaults
  const betMin = config.betSizeMin ?? (config.style === 'passive' ? 0.3 : 0.5);
  const betMax = config.betSizeMax ?? (config.style === 'aggressive' ? 1.2 : 0.8);

  // Random factor within range for variance
  const factor = betMin + Math.random() * (betMax - betMin);
  const targetBet = Math.floor(pot * factor);

  // Clamp to valid range
  return Math.min(Math.max(minBet, targetBet), maxBet);
}

/**
 * Calculate raise amount based on style with variance
 */
function calculateRaiseAmount(
  state: TableState,
  validActions: ValidActions,
  config: AIConfig
): number {
  const { minRaise, maxRaise } = validActions;

  // Use configured bet sizing or fall back to style-based defaults
  const betMin = config.betSizeMin ?? (config.style === 'passive' ? 0.3 : 0.5);
  const betMax = config.betSizeMax ?? (config.style === 'aggressive' ? 1.5 : 1.0);

  // Random factor within range for variance
  const factor = betMin + Math.random() * (betMax - betMin);

  // Calculate raise relative to pot
  const potSizeRaise = state.pot * factor;
  const targetRaise = state.currentBet + Math.floor(potSizeRaise);

  // Clamp to valid range
  return Math.min(Math.max(minRaise, targetRaise), maxRaise);
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
