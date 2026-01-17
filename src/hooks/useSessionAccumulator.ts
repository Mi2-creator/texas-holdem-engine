/**
 * useSessionAccumulator.ts
 * Phase 8.5 - Session-level data accumulation hook
 *
 * Manages hand history accumulation for learning analysis.
 * This is LOCAL state management, NOT global state.
 *
 * Usage:
 * - Call this hook at the top-level component (e.g., main.tsx)
 * - Pass handHistories and callbacks down via props
 * - This preserves data across hand replays within a session
 */

import { useState, useCallback, useMemo } from 'react';
import type { ReviewInsight } from '../controllers/ReviewInsightEngine';
import type { HandHistory } from '../controllers/LearningProfileEngine';

// ============================================================================
// Types
// ============================================================================

export interface SessionAccumulatorResult {
  /** All hand histories accumulated in this session */
  readonly handHistories: readonly HandHistory[];

  /** Add a completed hand to the session */
  readonly addHand: (reviewInsight: ReviewInsight, handId?: string) => void;

  /** Clear all session data */
  readonly clearSession: () => void;

  /** Number of hands in session */
  readonly handCount: number;

  /** Whether learning is available (>= 2 hands) */
  readonly isLearningAvailable: boolean;

  /** Get the most recent hand's review */
  readonly lastHandReview: ReviewInsight | null;
}

// ============================================================================
// Constants
// ============================================================================

const MIN_HANDS_FOR_LEARNING = 2;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate a unique hand ID
 */
function generateHandId(): string {
  return `hand_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook for managing session-level hand history accumulation.
 *
 * This hook maintains local state for hand histories within a session.
 * It does NOT use any global state management - the state lives in the
 * component that calls this hook and is passed down via props.
 *
 * @returns SessionAccumulatorResult with hand histories and management functions
 *
 * @example
 * ```tsx
 * // In main.tsx or top-level component
 * function App() {
 *   const session = useSessionAccumulator();
 *
 *   return (
 *     <ReplayDebugPanel
 *       handHistories={session.handHistories}
 *       onHandComplete={session.addHand}
 *       enableLearning={session.isLearningAvailable}
 *     />
 *   );
 * }
 * ```
 */
export function useSessionAccumulator(): SessionAccumulatorResult {
  // Local state for hand histories
  const [handHistories, setHandHistories] = useState<HandHistory[]>([]);

  /**
   * Add a completed hand to the session
   */
  const addHand = useCallback((
    reviewInsight: ReviewInsight,
    handId?: string
  ) => {
    // Defensive: skip if no review insight
    if (!reviewInsight) {
      return;
    }

    // Skip if review is not available (hand not complete)
    if (!reviewInsight.isAvailable) {
      return;
    }

    const newHand: HandHistory = {
      handId: handId ?? generateHandId(),
      reviewInsight,
      timestamp: Date.now(),
    };

    setHandHistories(prev => [...prev, newHand]);
  }, []);

  /**
   * Clear all session data
   */
  const clearSession = useCallback(() => {
    setHandHistories([]);
  }, []);

  /**
   * Derived: number of hands
   */
  const handCount = handHistories.length;

  /**
   * Derived: whether learning is available
   */
  const isLearningAvailable = handCount >= MIN_HANDS_FOR_LEARNING;

  /**
   * Derived: last hand's review
   */
  const lastHandReview = useMemo(() => {
    if (handHistories.length === 0) return null;
    return handHistories[handHistories.length - 1].reviewInsight;
  }, [handHistories]);

  return {
    handHistories,
    addHand,
    clearSession,
    handCount,
    isLearningAvailable,
    lastHandReview,
  };
}

// ============================================================================
// Types Export
// ============================================================================

export type { HandHistory };
