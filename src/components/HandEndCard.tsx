/**
 * ============================================================================
 * FROZEN - LEGACY CODE - DO NOT MODIFY
 * ============================================================================
 * This file is part of the training/coaching system that is now deprecated.
 * Do NOT extend, refactor, or build upon this code.
 *
 * Frozen as of: Phase 2 Freeze (Pokerrrr2-style refactor)
 * Reason: Training/analysis features are legacy; focus is on core poker table UI
 * ============================================================================
 */

/**
 * HandEndCard.tsx
 * Phase 9.4 - Hand end summary card for Player Mode
 *
 * A brief, non-intrusive card that appears when a hand ends.
 * Provides a simple summary and access to hand review.
 *
 * Design principles:
 * - Descriptive only (no judgments, no suggestions)
 * - Uses playerLanguage adapter for all text
 * - Auto-dismiss after 3 seconds or on click
 * - Can be fully disabled via props
 */

import React, { useEffect, useState, useCallback } from 'react';
import type { PatternSummary } from '../controllers/ReviewInsightEngine';
import {
  mapHandEndReasonToPlayerText,
  mapPatternToPlayerText,
} from '../adapters/playerLanguage';

// ============================================================================
// Types
// ============================================================================

interface HandEndCardProps {
  /** Whether the card is visible */
  readonly isVisible: boolean;
  /** Reason the hand ended */
  readonly handEndReason?: string;
  /** Total pot size */
  readonly potTotal?: number;
  /** Pattern summary for tempo description */
  readonly patternSummary?: PatternSummary;
  /** Callback when card is dismissed */
  readonly onDismiss: () => void;
  /** Callback when "Review" is clicked */
  readonly onReviewClick?: () => void;
  /** Auto-dismiss delay in ms (0 = no auto-dismiss) */
  readonly autoDismissDelay?: number;
}

// ============================================================================
// Styles
// ============================================================================

const styles = {
  overlay: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    zIndex: 50,
    opacity: 0,
    transition: 'opacity 0.3s ease',
    pointerEvents: 'none' as const,
  } as const,

  overlayVisible: {
    opacity: 1,
    pointerEvents: 'auto' as const,
  } as const,

  card: {
    backgroundColor: 'rgba(20, 20, 28, 0.98)',
    borderRadius: '16px',
    border: '1px solid rgba(99, 102, 241, 0.3)',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05)',
    padding: '24px 32px',
    minWidth: '280px',
    maxWidth: '360px',
    textAlign: 'center' as const,
    fontFamily: 'system-ui, -apple-system, sans-serif',
    transform: 'scale(0.95)',
    transition: 'transform 0.3s ease',
    cursor: 'pointer',
  } as const,

  cardVisible: {
    transform: 'scale(1)',
  } as const,

  header: {
    marginBottom: '16px',
  } as const,

  title: {
    fontSize: '18px',
    fontWeight: 700,
    color: 'rgba(209, 213, 219, 0.95)',
    marginBottom: '4px',
    letterSpacing: '0.3px',
  } as const,

  subtitle: {
    fontSize: '12px',
    color: 'rgba(156, 163, 175, 0.7)',
  } as const,

  divider: {
    height: '1px',
    backgroundColor: 'rgba(75, 85, 99, 0.3)',
    margin: '16px 0',
  } as const,

  content: {
    marginBottom: '20px',
  } as const,

  description: {
    fontSize: '13px',
    color: 'rgba(156, 163, 175, 0.9)',
    lineHeight: '20px',
    marginBottom: '8px',
  } as const,

  potInfo: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 14px',
    borderRadius: '20px',
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    border: '1px solid rgba(34, 197, 94, 0.2)',
    fontSize: '13px',
    fontWeight: 600,
    color: 'rgba(34, 197, 94, 0.9)',
  } as const,

  actions: {
    display: 'flex',
    gap: '10px',
    justifyContent: 'center',
  } as const,

  reviewButton: {
    padding: '10px 20px',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: 'rgba(99, 102, 241, 0.8)',
    color: '#fff',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    letterSpacing: '0.3px',
  } as const,

  dismissButton: {
    padding: '10px 20px',
    borderRadius: '8px',
    border: '1px solid rgba(75, 85, 99, 0.4)',
    backgroundColor: 'transparent',
    color: 'rgba(156, 163, 175, 0.8)',
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  } as const,

  dismissHint: {
    marginTop: '16px',
    fontSize: '10px',
    color: 'rgba(107, 114, 128, 0.5)',
  } as const,
} as const;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format pot size for display
 */
function formatPotSize(amount: number | undefined): string | null {
  if (amount === undefined || amount === 0) return null;
  if (amount >= 1000) {
    return `$${(amount / 1000).toFixed(1)}K`;
  }
  return `$${amount}`;
}

/**
 * Get display title based on hand end reason
 */
function getDisplayTitle(reason: string | undefined): string {
  if (!reason) return 'Hand Complete';

  const normalized = reason.toLowerCase();
  if (normalized.includes('showdown')) return 'Showdown';
  if (normalized.includes('fold')) return 'Hand Complete';
  if (normalized.includes('all_in') || normalized.includes('allin')) return 'All-In Showdown';

  return 'Hand Complete';
}

// ============================================================================
// Main Component
// ============================================================================

export function HandEndCard({
  isVisible,
  handEndReason,
  potTotal,
  patternSummary,
  onDismiss,
  onReviewClick,
  autoDismissDelay = 5000,
}: HandEndCardProps): React.ReactElement | null {
  const [isShowing, setIsShowing] = useState(false);

  // Handle visibility animation
  useEffect(() => {
    if (isVisible) {
      // Small delay to trigger CSS transition
      const showTimer = setTimeout(() => setIsShowing(true), 10);
      return () => clearTimeout(showTimer);
    } else {
      setIsShowing(false);
    }
  }, [isVisible]);

  // Auto-dismiss timer
  useEffect(() => {
    if (!isVisible || autoDismissDelay === 0) return;

    const timer = setTimeout(() => {
      onDismiss();
    }, autoDismissDelay);

    return () => clearTimeout(timer);
  }, [isVisible, autoDismissDelay, onDismiss]);

  // Handle card click (dismiss)
  const handleCardClick = useCallback((e: React.MouseEvent) => {
    // Don't dismiss if clicking a button
    if ((e.target as HTMLElement).tagName === 'BUTTON') return;
    onDismiss();
  }, [onDismiss]);

  // Handle review button click
  const handleReviewClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onReviewClick?.();
    onDismiss();
  }, [onReviewClick, onDismiss]);

  // Handle dismiss button click
  const handleDismissClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onDismiss();
  }, [onDismiss]);

  // Don't render if not visible
  if (!isVisible) return null;

  // Get player-friendly text
  const endReasonText = mapHandEndReasonToPlayerText(handEndReason);
  const patternText = mapPatternToPlayerText(patternSummary);
  const potText = formatPotSize(potTotal);
  const title = getDisplayTitle(handEndReason);

  return (
    <div
      style={{
        ...styles.overlay,
        ...(isShowing ? styles.overlayVisible : {}),
      }}
      onClick={handleCardClick}
    >
      <div
        style={{
          ...styles.card,
          ...(isShowing ? styles.cardVisible : {}),
        }}
        role="dialog"
        aria-label="Hand complete"
      >
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.title}>{title}</div>
          {endReasonText && (
            <div style={styles.subtitle}>{endReasonText}</div>
          )}
        </div>

        {/* Content */}
        {(patternText || potText) && (
          <>
            <div style={styles.divider} />
            <div style={styles.content}>
              {patternText && (
                <div style={styles.description}>
                  {patternText.primary}
                  {patternText.secondary && (
                    <><br />{patternText.secondary}</>
                  )}
                </div>
              )}
              {potText && (
                <div style={styles.potInfo}>
                  <span>Final Pot</span>
                  <span>{potText}</span>
                </div>
              )}
            </div>
          </>
        )}

        {/* Actions */}
        <div style={styles.actions}>
          {onReviewClick && (
            <button
              style={styles.reviewButton}
              onClick={handleReviewClick}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(99, 102, 241, 1)';
                e.currentTarget.style.transform = 'scale(1.02)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(99, 102, 241, 0.8)';
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              Review This Hand
            </button>
          )}
          <button
            style={styles.dismissButton}
            onClick={handleDismissClick}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(75, 85, 99, 0.2)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            Continue
          </button>
        </div>

        {/* Dismiss hint */}
        <div style={styles.dismissHint}>
          Click anywhere to dismiss
        </div>
      </div>
    </div>
  );
}

export default HandEndCard;
