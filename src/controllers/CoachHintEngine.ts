/**
 * CoachHintEngine.ts
 * Phase 6.1 - Pure function engine for generating coaching hints
 *
 * Provides low-intrusion strategic hints at key decision points.
 * All logic is derived from existing data - no new global state.
 */

import type { ViewMode, ContextBarData } from './ViewModeController';

// ============================================================================
// Types
// ============================================================================

export type HintLevel = 'info' | 'caution' | 'pressure';
export type HintTiming = 'pre-action' | 'hero-turn' | 'post-action';

export interface CoachHint {
  readonly id: string;
  readonly level: HintLevel;
  readonly text: string;
  readonly timing: HintTiming;
}

export interface CoachHintParams {
  readonly tension: number;
  readonly potSize: number;
  readonly phase: string;
  readonly viewMode: ViewMode;
  readonly isHeroTurn: boolean;
  readonly isHighPressure: boolean;
  readonly recentActions?: readonly RecentAction[];
  readonly potGrowthRate?: number; // percentage growth from previous street
}

export interface RecentAction {
  readonly actionClass: string;
  readonly playerId: string;
  readonly isHero: boolean;
  readonly amount?: number;
}

// ============================================================================
// Constants
// ============================================================================

const TENSION_THRESHOLDS = {
  MODERATE: 40,
  ELEVATED: 60,
  HIGH: 75,
  CRITICAL: 90,
} as const;

const POT_GROWTH_THRESHOLD = 50; // 50% pot growth triggers escalation hint

// ============================================================================
// Hint Generation Rules
// ============================================================================

/**
 * Rule: High tension during hero's turn
 */
function checkHighTensionHeroTurn(params: CoachHintParams): CoachHint | null {
  if (!params.isHeroTurn) return null;
  if (params.tension < TENSION_THRESHOLDS.HIGH) return null;

  return {
    id: 'high-tension-hero',
    level: 'pressure',
    text: 'Decision pressure is high. Take your time.',
    timing: 'hero-turn',
  };
}

/**
 * Rule: Critical tension warning
 */
function checkCriticalTension(params: CoachHintParams): CoachHint | null {
  if (params.tension < TENSION_THRESHOLDS.CRITICAL) return null;

  return {
    id: 'critical-tension',
    level: 'pressure',
    text: 'Critical moment. Stack commitment likely.',
    timing: params.isHeroTurn ? 'hero-turn' : 'pre-action',
  };
}

/**
 * Rule: Pot escalation detected
 */
function checkPotEscalation(params: CoachHintParams): CoachHint | null {
  if (params.potGrowthRate === undefined) return null;
  if (params.potGrowthRate < POT_GROWTH_THRESHOLD) return null;

  return {
    id: 'pot-escalation',
    level: 'caution',
    text: 'Pot escalation detected. Reassess commitment.',
    timing: 'pre-action',
  };
}

/**
 * Rule: Aggression pattern emerging (3+ aggressive actions in sequence)
 */
function checkAggressionPattern(params: CoachHintParams): CoachHint | null {
  const actions = params.recentActions;
  if (!actions || actions.length < 3) return null;

  const lastThree = actions.slice(-3);
  const aggressiveActions = ['bet', 'raise', 'all-in'];
  const aggressionCount = lastThree.filter(a =>
    aggressiveActions.includes(a.actionClass)
  ).length;

  if (aggressionCount < 2) return null;

  return {
    id: 'aggression-pattern',
    level: 'caution',
    text: 'Aggression pattern emerging. Expect pressure.',
    timing: 'pre-action',
  };
}

/**
 * Rule: Hero facing elevated pressure
 */
function checkElevatedPressure(params: CoachHintParams): CoachHint | null {
  if (!params.isHeroTurn) return null;
  if (params.tension < TENSION_THRESHOLDS.ELEVATED) return null;
  if (params.tension >= TENSION_THRESHOLDS.HIGH) return null; // Covered by high tension rule

  return {
    id: 'elevated-pressure',
    level: 'info',
    text: 'Elevated pressure. Consider position and range.',
    timing: 'hero-turn',
  };
}

/**
 * Rule: Late street warning (Turn/River)
 */
function checkLateStreetPressure(params: CoachHintParams): CoachHint | null {
  const lateStreets = ['TURN', 'RIVER'];
  if (!lateStreets.includes(params.phase.toUpperCase())) return null;
  if (!params.isHighPressure) return null;

  return {
    id: 'late-street-pressure',
    level: 'caution',
    text: `${params.phase} with high pressure. Pot commitment decision ahead.`,
    timing: params.isHeroTurn ? 'hero-turn' : 'pre-action',
  };
}

/**
 * Rule: Comparison focus mode hint
 */
function checkComparisonModeHint(params: CoachHintParams): CoachHint | null {
  if (params.viewMode !== 'comparison-focus') return null;
  if (!params.isHeroTurn) return null;

  return {
    id: 'comparison-mode',
    level: 'info',
    text: 'Review alternatives before deciding.',
    timing: 'hero-turn',
  };
}

// ============================================================================
// Main Engine Function
// ============================================================================

const HINT_RULES: Array<(params: CoachHintParams) => CoachHint | null> = [
  checkCriticalTension,
  checkHighTensionHeroTurn,
  checkLateStreetPressure,
  checkPotEscalation,
  checkAggressionPattern,
  checkElevatedPressure,
  checkComparisonModeHint,
];

/**
 * Main entry point for generating coach hints.
 * Returns an array of applicable hints based on current game state.
 *
 * @param params - Current game state parameters
 * @returns Array of CoachHint objects, prioritized by importance
 */
export function getCoachHints(params: CoachHintParams | null | undefined): CoachHint[] {
  // Defensive: null/undefined input
  if (!params) return [];

  // Defensive: validate required fields
  if (typeof params.tension !== 'number') return [];
  if (typeof params.viewMode !== 'string') return [];

  // Only show hints in specific view modes
  const validModes: ViewMode[] = ['comparison-focus', 'narrative-dramatic'];
  if (!validModes.includes(params.viewMode)) return [];

  const hints: CoachHint[] = [];
  const seenIds = new Set<string>();

  for (const rule of HINT_RULES) {
    try {
      const hint = rule(params);
      if (hint && !seenIds.has(hint.id)) {
        hints.push(hint);
        seenIds.add(hint.id);
      }
    } catch {
      // Silently skip failed rules
      continue;
    }
  }

  // Limit to max 3 hints to avoid overwhelming
  return hints.slice(0, 3);
}

// ============================================================================
// Helper Functions for External Use
// ============================================================================

/**
 * Builds CoachHintParams from ContextBarData and additional info
 */
export function buildCoachHintParams(
  contextBar: ContextBarData | null | undefined,
  viewMode: ViewMode | null | undefined,
  recentActions?: readonly RecentAction[],
  potGrowthRate?: number
): CoachHintParams | null {
  if (!contextBar || !viewMode) return null;

  return {
    tension: contextBar.tension ?? 0,
    potSize: contextBar.potSize ?? 0,
    phase: contextBar.phase ?? 'UNKNOWN',
    viewMode: viewMode,
    isHeroTurn: contextBar.isHeroTurn ?? false,
    isHighPressure: contextBar.isHighPressure ?? false,
    recentActions,
    potGrowthRate,
  };
}

/**
 * Returns the appropriate icon indicator for a hint level
 */
export function getHintLevelIndicator(level: HintLevel): string {
  switch (level) {
    case 'pressure': return '\u25CF'; // Filled circle
    case 'caution': return '\u25CB';  // Empty circle
    case 'info': return '\u2022';     // Bullet
    default: return '\u2022';
  }
}

/**
 * Returns CSS-safe color for hint level
 */
export function getHintLevelColor(level: HintLevel): string {
  switch (level) {
    case 'pressure': return '#ef4444'; // Red
    case 'caution': return '#f59e0b';  // Amber
    case 'info': return '#6b7280';     // Gray
    default: return '#6b7280';
  }
}
