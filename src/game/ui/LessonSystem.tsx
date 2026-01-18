/**
 * LessonSystem.tsx
 * Phase L16 + L17 - Training Curriculum / Lesson System with Progress
 *
 * Provides structured lessons for beginners:
 * - Each lesson has a clear concept
 * - Constraints on allowed actions
 * - Contextual hints during play
 * - Feedback summary after each hand
 *
 * Phase L17 additions:
 * - Lesson states: locked / unlocked / completed
 * - Completion criteria per lesson
 * - Progress tracking with unlock system
 *
 * Reuses Training Mode, Decision Helper, and Session Stats.
 * UI-only, no engine changes. State in-memory only.
 */

import React, { useMemo } from 'react';
import { Card } from '../engine/Card';
import { TableState } from '../engine/TableState';
import { PlayerAction } from '../engine/BettingRound';

// ============================================================================
// Types
// ============================================================================

export type LessonId = 'starting-hands' | 'pot-odds' | 'folding-discipline';

export type AllowedAction = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'all-in';

/** Lesson unlock status */
export type LessonStatus = 'locked' | 'unlocked' | 'completed';

/** Completion criteria for a lesson - deterministic and lightweight */
export interface CompletionCriteria {
  /** Minimum hands to play in this lesson */
  readonly handsRequired: number;
  /** Minimum correct decisions to complete */
  readonly correctDecisionsRequired: number;
  /** Description shown to user */
  readonly description: string;
}

/** Tracks progress toward completing a specific lesson */
export interface LessonProgressData {
  readonly lessonId: LessonId;
  readonly handsPlayed: number;
  readonly correctDecisions: number;
  readonly status: LessonStatus;
}

/** Full progress state for all lessons */
export interface AllLessonProgress {
  readonly lessons: Record<LessonId, LessonProgressData>;
}

export interface Lesson {
  readonly id: LessonId;
  readonly number: number;
  readonly title: string;
  readonly concept: string;
  readonly description: string;
  readonly objectives: readonly string[];
  readonly allowedActions: readonly AllowedAction[];
  readonly completionCriteria: CompletionCriteria;
  readonly getHint: (state: LessonGameState) => LessonHint | null;
  readonly getFeedback: (result: LessonHandResult) => LessonFeedback;
}

export interface LessonGameState {
  readonly tableState: TableState;
  readonly heroIndex: number;
  readonly holeCards: readonly Card[];
  readonly communityCards: readonly Card[];
  readonly street: string;
  readonly pot: number;
  readonly callAmount: number;
  readonly handStrengthScore: number;
}

export interface LessonHandResult {
  readonly won: boolean;
  readonly folded: boolean;
  readonly action: PlayerAction | null;
  readonly handStrengthScore: number;
  readonly potOddsPercent: number;
  readonly correctDecision: boolean;
}

export interface LessonHint {
  readonly type: 'info' | 'warning' | 'success';
  readonly message: string;
  readonly detail?: string;
}

export interface LessonFeedback {
  readonly grade: 'excellent' | 'good' | 'okay' | 'needs-work';
  readonly title: string;
  readonly message: string;
  readonly tip?: string;
}

export interface LessonProgress {
  readonly lessonId: LessonId;
  readonly handsPlayed: number;
  readonly correctDecisions: number;
  readonly completed: boolean;
}

// ============================================================================
// Hand Strength Helper (simplified from TrainingMode)
// ============================================================================

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

function getStartingHandCategory(score: number): 'premium' | 'strong' | 'playable' | 'marginal' | 'weak' {
  if (score >= 70) return 'premium';
  if (score >= 55) return 'strong';
  if (score >= 40) return 'playable';
  if (score >= 25) return 'marginal';
  return 'weak';
}

// ============================================================================
// Lesson Definitions
// ============================================================================

const LESSON_1_STARTING_HANDS: Lesson = {
  id: 'starting-hands',
  number: 1,
  title: 'Strong Starting Hands',
  concept: 'Hand Selection',
  description: 'Learn which hands to play and which to fold preflop. Focus on playing only premium and strong hands.',
  objectives: [
    'Fold weak and marginal hands',
    'Play premium hands (pairs 10+, AK, AQ)',
    'Be patient and wait for good spots',
  ],
  allowedActions: ['fold', 'call', 'check'],
  completionCriteria: {
    handsRequired: 5,
    correctDecisionsRequired: 3,
    description: 'Play 5 hands and make 3 correct decisions',
  },

  getHint: (state: LessonGameState): LessonHint | null => {
    if (state.street !== 'preflop') return null;

    const category = getStartingHandCategory(state.handStrengthScore);

    if (category === 'premium') {
      return {
        type: 'success',
        message: 'Premium hand! This is a hand you should always play.',
        detail: 'Hands like AA, KK, QQ, AK are the strongest starting hands.',
      };
    }

    if (category === 'strong') {
      return {
        type: 'success',
        message: 'Strong hand - worth playing in most situations.',
        detail: 'Hands like JJ, TT, AQ, AJ suited are solid hands.',
      };
    }

    if (category === 'playable') {
      return {
        type: 'info',
        message: 'Playable hand, but be cautious.',
        detail: 'This hand can win but often gets into trouble. Consider the pot odds.',
      };
    }

    if (category === 'marginal') {
      return {
        type: 'warning',
        message: 'Marginal hand - usually best to fold.',
        detail: 'These hands rarely win big pots. Folding saves chips for better spots.',
      };
    }

    return {
      type: 'warning',
      message: 'Weak hand - you should fold this.',
      detail: 'Weak hands lose money over time. Discipline means folding here.',
    };
  },

  getFeedback: (result: LessonHandResult): LessonFeedback => {
    const category = getStartingHandCategory(result.handStrengthScore);

    if (result.folded) {
      if (category === 'weak' || category === 'marginal') {
        return {
          grade: 'excellent',
          title: 'Great Fold!',
          message: 'You correctly folded a weak hand. This discipline will save you chips.',
          tip: 'Patience is key - wait for premium hands.',
        };
      }
      if (category === 'premium' || category === 'strong') {
        return {
          grade: 'needs-work',
          title: 'Missed Opportunity',
          message: 'You folded a strong hand that should usually be played.',
          tip: 'Premium hands like high pairs and AK should almost always be played.',
        };
      }
      return {
        grade: 'okay',
        title: 'Acceptable Fold',
        message: 'Folding playable hands is sometimes correct.',
      };
    }

    // Played the hand
    if (category === 'premium' || category === 'strong') {
      return {
        grade: 'excellent',
        title: result.won ? 'Well Played!' : 'Good Decision',
        message: result.won
          ? 'You played a strong hand and won!'
          : 'Playing strong hands is correct even when you lose.',
        tip: 'Strong hands win over time, even if they lose individual pots.',
      };
    }

    if (category === 'weak' || category === 'marginal') {
      return {
        grade: 'needs-work',
        title: result.won ? 'Lucky Win' : 'Should Have Folded',
        message: result.won
          ? 'You won, but playing weak hands is risky.'
          : 'This hand should have been folded preflop.',
        tip: 'Folding weak hands consistently will improve your win rate.',
      };
    }

    return {
      grade: 'okay',
      title: result.won ? 'Nice Win' : 'Tough Break',
      message: 'Playable hands can go either way.',
    };
  },
};

const LESSON_2_POT_ODDS: Lesson = {
  id: 'pot-odds',
  number: 2,
  title: 'Understanding Pot Odds',
  concept: 'Pot Odds Math',
  description: 'Learn to calculate if a call is profitable based on pot odds vs your hand strength.',
  objectives: [
    'Call when pot odds are favorable',
    'Fold when the bet is too expensive',
    'Understand the relationship between pot size and call amount',
  ],
  allowedActions: ['fold', 'call', 'check'],
  completionCriteria: {
    handsRequired: 5,
    correctDecisionsRequired: 3,
    description: 'Play 5 hands and make 3 pot odds based decisions',
  },

  getHint: (state: LessonGameState): LessonHint | null => {
    if (state.callAmount === 0) {
      return {
        type: 'info',
        message: 'No bet to call - you can check for free!',
        detail: 'When you can check, there\'s no risk to see more cards.',
      };
    }

    const requiredEquity = (state.callAmount / (state.pot + state.callAmount)) * 100;

    if (requiredEquity < 20) {
      return {
        type: 'success',
        message: `Great pot odds! You only need ${requiredEquity.toFixed(0)}% equity.`,
        detail: 'With odds this good, you can call with many hands.',
      };
    }

    if (requiredEquity < 33) {
      return {
        type: 'info',
        message: `Decent pot odds - need ${requiredEquity.toFixed(0)}% equity.`,
        detail: 'Consider your hand strength before calling.',
      };
    }

    return {
      type: 'warning',
      message: `Expensive! You need ${requiredEquity.toFixed(0)}% equity to call.`,
      detail: 'Unless you have a very strong hand, folding may be best.',
    };
  },

  getFeedback: (result: LessonHandResult): LessonFeedback => {
    const goodOdds = result.potOddsPercent < 25;
    const strongHand = result.handStrengthScore >= 50;

    if (result.folded) {
      if (!goodOdds && !strongHand) {
        return {
          grade: 'excellent',
          title: 'Correct Fold!',
          message: 'The pot odds didn\'t justify a call with your hand.',
          tip: 'Folding bad odds is how winning players save money.',
        };
      }
      if (goodOdds) {
        return {
          grade: 'needs-work',
          title: 'Missed Value',
          message: 'The pot odds were good enough to call.',
          tip: `You only needed ${result.potOddsPercent.toFixed(0)}% equity - that's a good price.`,
        };
      }
      return { grade: 'okay', title: 'Cautious Play', message: 'Folding wasn\'t wrong here.' };
    }

    // Called or checked
    if (goodOdds || strongHand) {
      return {
        grade: 'excellent',
        title: result.won ? 'Perfect Play!' : 'Right Decision',
        message: result.won
          ? 'Good odds + good play = profit over time!'
          : 'Calling with good odds is correct even when you lose.',
      };
    }

    return {
      grade: 'needs-work',
      title: result.won ? 'Got Lucky' : 'Expensive Call',
      message: 'The odds didn\'t support this call.',
      tip: 'Only call when pot odds justify it.',
    };
  },
};

const LESSON_3_FOLDING_DISCIPLINE: Lesson = {
  id: 'folding-discipline',
  number: 3,
  title: 'Folding Discipline',
  concept: 'Knowing When to Quit',
  description: 'Master the art of folding. Learn that folding is not losing - it\'s saving chips for better spots.',
  objectives: [
    'Fold when facing aggression with weak hands',
    'Don\'t chase losses with bad calls',
    'Recognize when you\'re beaten',
  ],
  allowedActions: ['fold', 'call', 'check'],
  completionCriteria: {
    handsRequired: 5,
    correctDecisionsRequired: 3,
    description: 'Play 5 hands and make 3 disciplined decisions',
  },

  getHint: (state: LessonGameState): LessonHint | null => {
    const isFacingBet = state.callAmount > 0;
    const isWeakHand = state.handStrengthScore < 40;
    const isExpensive = state.callAmount > state.pot * 0.5;

    if (isFacingBet && isWeakHand && isExpensive) {
      return {
        type: 'warning',
        message: 'Big bet + weak hand = time to fold!',
        detail: 'Discipline means letting go of hands that are probably beaten.',
      };
    }

    if (isFacingBet && isWeakHand) {
      return {
        type: 'warning',
        message: 'Your hand is weak - consider folding.',
        detail: 'Saving chips now means more ammunition for better hands.',
      };
    }

    if (!isFacingBet) {
      return {
        type: 'info',
        message: 'No pressure - check and see what develops.',
      };
    }

    if (state.handStrengthScore >= 60) {
      return {
        type: 'success',
        message: 'Strong hand - you can defend here.',
        detail: 'With a solid hand, calling or raising is justified.',
      };
    }

    return null;
  },

  getFeedback: (result: LessonHandResult): LessonFeedback => {
    const weakHand = result.handStrengthScore < 40;
    const expensiveCall = result.potOddsPercent > 30;

    if (result.folded && weakHand) {
      return {
        grade: 'excellent',
        title: 'Disciplined Fold!',
        message: 'You recognized your hand was weak and saved chips.',
        tip: 'This discipline separates winning players from losing ones.',
      };
    }

    if (result.folded && !weakHand) {
      return {
        grade: 'okay',
        title: 'Cautious Fold',
        message: 'Your hand had some value, but folding is rarely wrong.',
      };
    }

    if (!result.folded && weakHand && expensiveCall) {
      return {
        grade: 'needs-work',
        title: result.won ? 'Lucky Escape' : 'Expensive Mistake',
        message: 'Calling with a weak hand against a big bet is costly.',
        tip: 'Train yourself to fold weak hands facing pressure.',
      };
    }

    if (!result.folded && !weakHand) {
      return {
        grade: 'excellent',
        title: result.won ? 'Well Defended!' : 'Correct Call',
        message: 'Your hand was strong enough to continue.',
      };
    }

    return {
      grade: 'okay',
      title: result.won ? 'Nice Result' : 'Worth a Try',
      message: 'Borderline decisions are part of poker.',
    };
  },
};

// ============================================================================
// Lesson Registry
// ============================================================================

export const LESSONS: readonly Lesson[] = [
  LESSON_1_STARTING_HANDS,
  LESSON_2_POT_ODDS,
  LESSON_3_FOLDING_DISCIPLINE,
];

export function getLessonById(id: LessonId): Lesson | undefined {
  return LESSONS.find(l => l.id === id);
}

// ============================================================================
// Lesson State
// ============================================================================

export interface LessonState {
  readonly activeLesson: Lesson | null;
  readonly progress: Map<LessonId, LessonProgress>;
  readonly currentHint: LessonHint | null;
  readonly lastFeedback: LessonFeedback | null;
  readonly lastAction: PlayerAction | null;
}

export function createInitialLessonState(): LessonState {
  return {
    activeLesson: null,
    progress: new Map(),
    currentHint: null,
    lastFeedback: null,
    lastAction: null,
  };
}

// ============================================================================
// Progress Tracking (Phase L17)
// ============================================================================

/** Get ordered list of lesson IDs */
export const LESSON_ORDER: readonly LessonId[] = ['starting-hands', 'pot-odds', 'folding-discipline'];

/** Create initial progress state - first lesson unlocked, rest locked */
export function createInitialProgress(): AllLessonProgress {
  return {
    lessons: {
      'starting-hands': {
        lessonId: 'starting-hands',
        handsPlayed: 0,
        correctDecisions: 0,
        status: 'unlocked', // First lesson starts unlocked
      },
      'pot-odds': {
        lessonId: 'pot-odds',
        handsPlayed: 0,
        correctDecisions: 0,
        status: 'locked',
      },
      'folding-discipline': {
        lessonId: 'folding-discipline',
        handsPlayed: 0,
        correctDecisions: 0,
        status: 'locked',
      },
    },
  };
}

/** Get the status of a specific lesson */
export function getLessonStatus(progress: AllLessonProgress, lessonId: LessonId): LessonStatus {
  return progress.lessons[lessonId].status;
}

/** Get progress data for a specific lesson */
export function getLessonProgress(progress: AllLessonProgress, lessonId: LessonId): LessonProgressData {
  return progress.lessons[lessonId];
}

/** Check if a lesson meets its completion criteria */
export function isLessonComplete(progress: AllLessonProgress, lesson: Lesson): boolean {
  const data = progress.lessons[lesson.id];
  return (
    data.handsPlayed >= lesson.completionCriteria.handsRequired &&
    data.correctDecisions >= lesson.completionCriteria.correctDecisionsRequired
  );
}

/** Get the next lesson ID in sequence (or null if no more) */
export function getNextLessonId(currentId: LessonId): LessonId | null {
  const currentIndex = LESSON_ORDER.indexOf(currentId);
  if (currentIndex === -1 || currentIndex >= LESSON_ORDER.length - 1) {
    return null;
  }
  return LESSON_ORDER[currentIndex + 1];
}

/** Update progress after a hand is completed */
export function updateLessonProgress(
  progress: AllLessonProgress,
  lessonId: LessonId,
  wasCorrectDecision: boolean
): AllLessonProgress {
  const currentData = progress.lessons[lessonId];
  const lesson = getLessonById(lessonId);

  if (!lesson || currentData.status === 'completed') {
    return progress; // No update if already completed or lesson not found
  }

  const newData: LessonProgressData = {
    ...currentData,
    handsPlayed: currentData.handsPlayed + 1,
    correctDecisions: currentData.correctDecisions + (wasCorrectDecision ? 1 : 0),
  };

  // Check if lesson is now complete
  const meetsHands = newData.handsPlayed >= lesson.completionCriteria.handsRequired;
  const meetsDecisions = newData.correctDecisions >= lesson.completionCriteria.correctDecisionsRequired;

  let updatedLessons = {
    ...progress.lessons,
    [lessonId]: meetsHands && meetsDecisions
      ? { ...newData, status: 'completed' as LessonStatus }
      : newData,
  };

  // If just completed, unlock the next lesson
  if (meetsHands && meetsDecisions && currentData.status !== 'completed') {
    const nextId = getNextLessonId(lessonId);
    if (nextId && updatedLessons[nextId].status === 'locked') {
      updatedLessons = {
        ...updatedLessons,
        [nextId]: {
          ...updatedLessons[nextId],
          status: 'unlocked' as LessonStatus,
        },
      };
    }
  }

  return { lessons: updatedLessons };
}

/** Check if a decision was correct based on the feedback grade */
export function wasCorrectDecision(feedback: LessonFeedback): boolean {
  return feedback.grade === 'excellent' || feedback.grade === 'good';
}

/** Get completion percentage for a lesson */
export function getCompletionPercent(progress: AllLessonProgress, lesson: Lesson): number {
  const data = progress.lessons[lesson.id];
  const criteria = lesson.completionCriteria;

  const handsPercent = Math.min(100, (data.handsPlayed / criteria.handsRequired) * 100);
  const decisionsPercent = Math.min(100, (data.correctDecisions / criteria.correctDecisionsRequired) * 100);

  // Average of both criteria
  return Math.floor((handsPercent + decisionsPercent) / 2);
}

// ============================================================================
// Styles
// ============================================================================

const styles = {
  // Lesson Selector
  selectorContainer: {
    padding: '16px',
    borderRadius: '12px',
    backgroundColor: 'rgba(15, 15, 20, 0.95)',
    border: '1px solid rgba(34, 197, 94, 0.3)',
    maxWidth: '400px',
  },

  selectorTitle: {
    fontSize: '14px',
    fontWeight: 700,
    color: '#22c55e',
    marginBottom: '12px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },

  lessonCard: {
    padding: '12px',
    borderRadius: '8px',
    backgroundColor: 'rgba(30, 30, 40, 0.6)',
    border: '1px solid rgba(75, 85, 99, 0.3)',
    marginBottom: '8px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },

  lessonCardActive: {
    border: '1px solid rgba(34, 197, 94, 0.5)',
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
  },

  lessonCardLocked: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },

  lessonCardCompleted: {
    border: '1px solid rgba(168, 85, 247, 0.4)',
    backgroundColor: 'rgba(168, 85, 247, 0.05)',
  },

  lessonStatusBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '2px 8px',
    borderRadius: '10px',
    fontSize: '9px',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },

  lessonProgressBar: {
    height: '4px',
    borderRadius: '2px',
    backgroundColor: 'rgba(75, 85, 99, 0.3)',
    marginTop: '8px',
    overflow: 'hidden',
  },

  lessonProgressFill: {
    height: '100%',
    borderRadius: '2px',
    backgroundColor: '#22c55e',
    transition: 'width 0.3s ease',
  },

  lessonProgressText: {
    fontSize: '10px',
    color: 'rgba(156, 163, 175, 0.7)',
    marginTop: '4px',
    display: 'flex',
    justifyContent: 'space-between',
  },

  lessonNumber: {
    fontSize: '10px',
    fontWeight: 600,
    color: 'rgba(156, 163, 175, 0.6)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },

  lessonTitle: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#fff',
    marginTop: '2px',
  },

  lessonConcept: {
    fontSize: '11px',
    color: 'rgba(156, 163, 175, 0.8)',
    marginTop: '4px',
  },

  // Active Lesson Display
  activeLessonBar: {
    padding: '8px 16px',
    borderRadius: '8px',
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    border: '1px solid rgba(34, 197, 94, 0.3)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  activeLessonInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },

  activeLessonLabel: {
    fontSize: '10px',
    fontWeight: 600,
    color: 'rgba(34, 197, 94, 0.7)',
    textTransform: 'uppercase' as const,
  },

  activeLessonTitle: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#22c55e',
  },

  exitLessonButton: {
    padding: '4px 10px',
    borderRadius: '4px',
    backgroundColor: 'rgba(75, 85, 99, 0.3)',
    color: 'rgba(156, 163, 175, 0.9)',
    fontSize: '11px',
    fontWeight: 500,
    cursor: 'pointer',
    border: '1px solid rgba(75, 85, 99, 0.4)',
    transition: 'all 0.15s ease',
  },

  // Hint Display
  hintContainer: {
    padding: '12px 16px',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
  },

  hintIcon: {
    fontSize: '16px',
    flexShrink: 0,
  },

  hintContent: {
    flex: 1,
  },

  hintMessage: {
    fontSize: '13px',
    fontWeight: 500,
    marginBottom: '2px',
  },

  hintDetail: {
    fontSize: '11px',
    opacity: 0.8,
  },

  // Feedback Display
  feedbackContainer: {
    padding: '16px',
    borderRadius: '10px',
    textAlign: 'center' as const,
  },

  feedbackGrade: {
    fontSize: '12px',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    marginBottom: '4px',
  },

  feedbackTitle: {
    fontSize: '18px',
    fontWeight: 700,
    marginBottom: '8px',
  },

  feedbackMessage: {
    fontSize: '13px',
    color: 'rgba(209, 213, 219, 0.9)',
    marginBottom: '8px',
  },

  feedbackTip: {
    fontSize: '11px',
    color: 'rgba(156, 163, 175, 0.8)',
    fontStyle: 'italic' as const,
    padding: '8px 12px',
    borderRadius: '6px',
    backgroundColor: 'rgba(30, 30, 40, 0.6)',
  },

  objectivesList: {
    listStyle: 'none',
    padding: 0,
    margin: '8px 0 0 0',
  },

  objectiveItem: {
    fontSize: '11px',
    color: 'rgba(156, 163, 175, 0.8)',
    padding: '4px 0',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
};

// ============================================================================
// Color Helpers
// ============================================================================

function getHintColors(type: LessonHint['type']): { bg: string; border: string; text: string } {
  switch (type) {
    case 'success':
      return { bg: 'rgba(34, 197, 94, 0.15)', border: 'rgba(34, 197, 94, 0.3)', text: '#22c55e' };
    case 'warning':
      return { bg: 'rgba(234, 179, 8, 0.15)', border: 'rgba(234, 179, 8, 0.3)', text: '#eab308' };
    default:
      return { bg: 'rgba(59, 130, 246, 0.15)', border: 'rgba(59, 130, 246, 0.3)', text: '#3b82f6' };
  }
}

function getHintIcon(type: LessonHint['type']): string {
  switch (type) {
    case 'success': return '✓';
    case 'warning': return '⚠';
    default: return 'ℹ';
  }
}

function getFeedbackColors(grade: LessonFeedback['grade']): { bg: string; border: string; text: string } {
  switch (grade) {
    case 'excellent':
      return { bg: 'rgba(34, 197, 94, 0.15)', border: 'rgba(34, 197, 94, 0.3)', text: '#22c55e' };
    case 'good':
      return { bg: 'rgba(59, 130, 246, 0.15)', border: 'rgba(59, 130, 246, 0.3)', text: '#3b82f6' };
    case 'okay':
      return { bg: 'rgba(234, 179, 8, 0.15)', border: 'rgba(234, 179, 8, 0.3)', text: '#eab308' };
    default:
      return { bg: 'rgba(239, 68, 68, 0.15)', border: 'rgba(239, 68, 68, 0.3)', text: '#ef4444' };
  }
}

// ============================================================================
// Components
// ============================================================================

interface LessonSelectorProps {
  readonly activeLesson: Lesson | null;
  readonly progress: AllLessonProgress;
  readonly onSelectLesson: (lesson: Lesson) => void;
  readonly onClearLesson: () => void;
}

/** Get status badge styles based on lesson status */
function getStatusBadgeStyles(status: LessonStatus): { bg: string; color: string; icon: string } {
  switch (status) {
    case 'completed':
      return { bg: 'rgba(168, 85, 247, 0.2)', color: '#a855f7', icon: '✓' };
    case 'locked':
      return { bg: 'rgba(75, 85, 99, 0.2)', color: '#6b7280', icon: '🔒' };
    default: // unlocked
      return { bg: 'rgba(34, 197, 94, 0.2)', color: '#22c55e', icon: '▶' };
  }
}

export function LessonSelector({
  activeLesson,
  progress,
  onSelectLesson,
  onClearLesson,
}: LessonSelectorProps): React.ReactElement {
  if (activeLesson) {
    const activeProgress = getLessonProgress(progress, activeLesson.id);
    const percent = getCompletionPercent(progress, activeLesson);

    return (
      <div style={styles.activeLessonBar}>
        <div style={styles.activeLessonInfo}>
          <span style={styles.activeLessonLabel}>Lesson {activeLesson.number}</span>
          <span style={styles.activeLessonTitle}>{activeLesson.title}</span>
          <span style={{
            ...styles.lessonStatusBadge,
            backgroundColor: 'rgba(234, 179, 8, 0.2)',
            color: '#eab308',
          }}>
            {activeProgress.handsPlayed}/{activeLesson.completionCriteria.handsRequired} hands
          </span>
        </div>
        <button
          style={styles.exitLessonButton}
          onClick={onClearLesson}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(75, 85, 99, 0.5)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(75, 85, 99, 0.3)';
          }}
        >
          Exit Lesson
        </button>
      </div>
    );
  }

  return (
    <div style={styles.selectorContainer}>
      <div style={styles.selectorTitle}>
        <span>📚</span>
        <span>Training Lessons</span>
      </div>
      {LESSONS.map((lesson) => {
        const lessonProgress = getLessonProgress(progress, lesson.id);
        const status = lessonProgress.status;
        const isLocked = status === 'locked';
        const isCompleted = status === 'completed';
        const percent = getCompletionPercent(progress, lesson);
        const badgeStyles = getStatusBadgeStyles(status);

        const cardStyle = {
          ...styles.lessonCard,
          ...(isLocked ? styles.lessonCardLocked : {}),
          ...(isCompleted ? styles.lessonCardCompleted : {}),
        };

        const handleClick = () => {
          if (!isLocked) {
            onSelectLesson(lesson);
          }
        };

        const handleMouseEnter = (e: React.MouseEvent<HTMLDivElement>) => {
          if (!isLocked) {
            if (isCompleted) {
              e.currentTarget.style.backgroundColor = 'rgba(168, 85, 247, 0.15)';
              e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.5)';
            } else {
              e.currentTarget.style.backgroundColor = 'rgba(34, 197, 94, 0.1)';
              e.currentTarget.style.borderColor = 'rgba(34, 197, 94, 0.4)';
            }
          }
        };

        const handleMouseLeave = (e: React.MouseEvent<HTMLDivElement>) => {
          if (!isLocked) {
            if (isCompleted) {
              e.currentTarget.style.backgroundColor = 'rgba(168, 85, 247, 0.05)';
              e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.4)';
            } else {
              e.currentTarget.style.backgroundColor = 'rgba(30, 30, 40, 0.6)';
              e.currentTarget.style.borderColor = 'rgba(75, 85, 99, 0.3)';
            }
          }
        };

        return (
          <div
            key={lesson.id}
            style={cardStyle}
            onClick={handleClick}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={styles.lessonNumber}>Lesson {lesson.number}</div>
              <span style={{
                ...styles.lessonStatusBadge,
                backgroundColor: badgeStyles.bg,
                color: badgeStyles.color,
              }}>
                {badgeStyles.icon} {status}
              </span>
            </div>
            <div style={{
              ...styles.lessonTitle,
              color: isLocked ? 'rgba(156, 163, 175, 0.5)' : isCompleted ? '#a855f7' : '#fff',
            }}>
              {lesson.title}
            </div>
            <div style={styles.lessonConcept}>{lesson.concept}</div>

            {/* Progress bar for unlocked lessons */}
            {!isLocked && !isCompleted && (
              <>
                <div style={styles.lessonProgressBar}>
                  <div style={{
                    ...styles.lessonProgressFill,
                    width: `${percent}%`,
                  }} />
                </div>
                <div style={styles.lessonProgressText}>
                  <span>{lessonProgress.correctDecisions}/{lesson.completionCriteria.correctDecisionsRequired} correct</span>
                  <span>{percent}%</span>
                </div>
              </>
            )}

            {/* Completion info for completed lessons */}
            {isCompleted && (
              <div style={{
                ...styles.lessonProgressText,
                color: '#a855f7',
                marginTop: '8px',
              }}>
                <span>✓ Completed</span>
                <span>{lessonProgress.correctDecisions} correct decisions</span>
              </div>
            )}

            {/* Objectives for locked lessons */}
            {isLocked && (
              <ul style={styles.objectivesList}>
                {lesson.objectives.slice(0, 2).map((obj, i) => (
                  <li key={i} style={styles.objectiveItem}>
                    <span style={{ color: '#6b7280' }}>•</span>
                    {obj}
                  </li>
                ))}
              </ul>
            )}

            {/* Objectives for unlocked (not completed) lessons */}
            {!isLocked && !isCompleted && (
              <ul style={styles.objectivesList}>
                {lesson.objectives.slice(0, 2).map((obj, i) => (
                  <li key={i} style={styles.objectiveItem}>
                    <span style={{ color: '#22c55e' }}>•</span>
                    {obj}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

interface LessonHintDisplayProps {
  readonly hint: LessonHint;
}

export function LessonHintDisplay({ hint }: LessonHintDisplayProps): React.ReactElement {
  const colors = getHintColors(hint.type);

  return (
    <div
      style={{
        ...styles.hintContainer,
        backgroundColor: colors.bg,
        border: `1px solid ${colors.border}`,
      }}
    >
      <span style={{ ...styles.hintIcon, color: colors.text }}>{getHintIcon(hint.type)}</span>
      <div style={styles.hintContent}>
        <div style={{ ...styles.hintMessage, color: colors.text }}>{hint.message}</div>
        {hint.detail && <div style={{ ...styles.hintDetail, color: colors.text }}>{hint.detail}</div>}
      </div>
    </div>
  );
}

interface LessonFeedbackDisplayProps {
  readonly feedback: LessonFeedback;
}

export function LessonFeedbackDisplay({ feedback }: LessonFeedbackDisplayProps): React.ReactElement {
  const colors = getFeedbackColors(feedback.grade);

  return (
    <div
      style={{
        ...styles.feedbackContainer,
        backgroundColor: colors.bg,
        border: `1px solid ${colors.border}`,
      }}
    >
      <div style={{ ...styles.feedbackGrade, color: colors.text }}>{feedback.grade}</div>
      <div style={{ ...styles.feedbackTitle, color: colors.text }}>{feedback.title}</div>
      <div style={styles.feedbackMessage}>{feedback.message}</div>
      {feedback.tip && <div style={styles.feedbackTip}>💡 {feedback.tip}</div>}
    </div>
  );
}

// ============================================================================
// Helper to calculate lesson game state
// ============================================================================

export function createLessonGameState(
  tableState: TableState,
  heroIndex: number
): LessonGameState {
  const hero = tableState.players[heroIndex];
  const callAmount = tableState.currentBet - hero.currentBet;

  return {
    tableState,
    heroIndex,
    holeCards: hero.holeCards,
    communityCards: tableState.communityCards,
    street: tableState.street,
    pot: tableState.pot,
    callAmount,
    handStrengthScore: getPreflopStrengthScore(hero.holeCards),
  };
}

export function createLessonHandResult(
  won: boolean,
  folded: boolean,
  action: PlayerAction | null,
  gameState: LessonGameState
): LessonHandResult {
  const potOddsPercent = gameState.callAmount > 0
    ? (gameState.callAmount / (gameState.pot + gameState.callAmount)) * 100
    : 0;

  return {
    won,
    folded,
    action,
    handStrengthScore: gameState.handStrengthScore,
    potOddsPercent,
    correctDecision: true, // Simplified - could be more complex
  };
}

export default LessonSelector;
