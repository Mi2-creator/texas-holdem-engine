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
 * ReviewPanel.tsx
 * Phase 7 - Complete review panel with entry point and content
 * Phase 9.3 - Added player language support
 *
 * Provides post-hand review functionality:
 * - Review Bar (entry point, collapsed by default)
 * - Decision Review (key decisions with structural context)
 * - Pattern Summary (hand-level structural patterns)
 *
 * Only visible after HAND_END / SHOWDOWN.
 * Does not interfere with live gameplay experience.
 */

import React, { useState, useCallback } from 'react';
import type { ReviewInsight } from '../controllers/ReviewInsightEngine';
import { buildReviewBarSummary } from '../controllers/ReviewInsightEngine';
import { DecisionReviewItem } from './DecisionReviewItem';
import { PatternSummaryPanel } from './PatternSummaryPanel';

// ============================================================================
// Types
// ============================================================================

interface ReviewPanelProps {
  readonly insight: ReviewInsight;
  readonly collapsed?: boolean;
  readonly onToggle?: () => void;
  readonly compact?: boolean;
  /** Phase 9.3: Use player-friendly language instead of structural data */
  readonly usePlayerLanguage?: boolean;
}

// ============================================================================
// Styles
// ============================================================================

const styles = {
  container: {
    marginTop: '12px',
    borderRadius: '8px',
    backgroundColor: 'rgba(25, 25, 30, 0.7)',
    border: '1px solid rgba(99, 102, 241, 0.2)',
    overflow: 'hidden',
    fontFamily: 'monospace',
  } as const,

  // Review Bar (Entry Point)
  reviewBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 14px',
    cursor: 'pointer',
    userSelect: 'none' as const,
    backgroundColor: 'rgba(99, 102, 241, 0.08)',
    borderBottom: '1px solid rgba(99, 102, 241, 0.15)',
    transition: 'background-color 0.15s ease',
  } as const,

  reviewBarHover: {
    backgroundColor: 'rgba(99, 102, 241, 0.12)',
  } as const,

  reviewBarLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  } as const,

  reviewIcon: {
    width: '24px',
    height: '24px',
    borderRadius: '6px',
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px',
  } as const,

  reviewTitle: {
    fontSize: '11px',
    fontWeight: 600,
    color: 'rgba(209, 213, 219, 0.95)',
    letterSpacing: '0.3px',
  } as const,

  reviewSummary: {
    fontSize: '10px',
    color: 'rgba(156, 163, 175, 0.7)',
    marginTop: '2px',
  } as const,

  reviewBarRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  } as const,

  expandBadge: {
    padding: '3px 8px',
    borderRadius: '4px',
    fontSize: '9px',
    fontWeight: 500,
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    color: 'rgba(129, 140, 248, 0.9)',
  } as const,

  chevron: {
    fontSize: '12px',
    color: 'rgba(129, 140, 248, 0.7)',
    transition: 'transform 0.2s ease',
  } as const,

  chevronExpanded: {
    transform: 'rotate(180deg)',
  } as const,

  // Content Area
  content: {
    padding: '14px',
    opacity: 1,
  } as const,

  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '12px',
    paddingBottom: '8px',
    borderBottom: '1px solid rgba(75, 85, 99, 0.2)',
  } as const,

  sectionTitle: {
    fontSize: '10px',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    color: 'rgba(129, 140, 248, 0.9)',
  } as const,

  sectionCount: {
    padding: '2px 6px',
    borderRadius: '10px',
    fontSize: '9px',
    fontWeight: 600,
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
    color: 'rgba(129, 140, 248, 0.9)',
  } as const,

  decisionList: {
    marginBottom: '16px',
  } as const,

  emptyState: {
    padding: '20px',
    textAlign: 'center' as const,
    color: 'rgba(107, 114, 128, 0.6)',
    fontSize: '11px',
    fontStyle: 'italic' as const,
  } as const,

  closeButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '8px',
    marginTop: '8px',
    borderRadius: '4px',
    backgroundColor: 'rgba(75, 85, 99, 0.2)',
    border: 'none',
    cursor: 'pointer',
    fontSize: '10px',
    color: 'rgba(156, 163, 175, 0.7)',
    transition: 'background-color 0.15s ease',
  } as const,
} as const;

// ============================================================================
// Main Component
// ============================================================================

export function ReviewPanel({
  insight,
  collapsed: controlledCollapsed,
  onToggle,
  compact = false,
  usePlayerLanguage = false,
}: ReviewPanelProps): React.ReactElement | null {
  // Internal collapse state (used when not controlled)
  const [internalCollapsed, setInternalCollapsed] = useState(true);
  const [isHovered, setIsHovered] = useState(false);

  // Determine if controlled or uncontrolled
  const isControlled = controlledCollapsed !== undefined;
  const isCollapsed = isControlled ? controlledCollapsed : internalCollapsed;

  const handleToggle = useCallback(() => {
    if (onToggle) {
      onToggle();
    } else {
      setInternalCollapsed(prev => !prev);
    }
  }, [onToggle]);

  const handleClose = useCallback(() => {
    if (onToggle) {
      onToggle();
    } else {
      setInternalCollapsed(true);
    }
  }, [onToggle]);

  // Don't render if review is not available
  if (!insight || !insight.isAvailable) {
    return null;
  }

  const summary = buildReviewBarSummary(insight);
  const hasKeyDecisions = insight.keyDecisions.length > 0;

  return (
    <div style={styles.container}>
      {/* Review Bar (Entry Point) */}
      <div
        style={{
          ...styles.reviewBar,
          ...(isHovered ? styles.reviewBarHover : {}),
        }}
        onClick={handleToggle}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleToggle();
          }
        }}
        tabIndex={0}
        role="button"
        aria-expanded={!isCollapsed}
        aria-label="Review this hand"
      >
        <div style={styles.reviewBarLeft}>
          <div style={styles.reviewIcon}>
            📋
          </div>
          <div>
            <div style={styles.reviewTitle}>Review this hand</div>
            {summary && (
              <div style={styles.reviewSummary}>{summary}</div>
            )}
          </div>
        </div>

        <div style={styles.reviewBarRight}>
          {isCollapsed && hasKeyDecisions && (
            <span style={styles.expandBadge}>
              {insight.keyDecisions.length} decision{insight.keyDecisions.length > 1 ? 's' : ''}
            </span>
          )}
          <span
            style={{
              ...styles.chevron,
              ...(!isCollapsed ? styles.chevronExpanded : {}),
            }}
          >
            ▼
          </span>
        </div>
      </div>

      {/* Expanded Content */}
      {!isCollapsed && (
        <div style={styles.content}>
          {/* Key Decisions Section */}
          {hasKeyDecisions ? (
            <>
              <div style={styles.sectionHeader}>
                <span style={styles.sectionTitle}>Key Decisions</span>
                <span style={styles.sectionCount}>{insight.keyDecisions.length}</span>
              </div>

              <div style={styles.decisionList}>
                {insight.keyDecisions.map((decision, index) => (
                  <DecisionReviewItem
                    key={decision.index}
                    decision={decision}
                    index={index + 1}
                    compact={compact}
                    usePlayerLanguage={usePlayerLanguage}
                  />
                ))}
              </div>
            </>
          ) : (
            <div style={styles.emptyState}>
              No major decision points in this hand.
            </div>
          )}

          {/* Pattern Summary Section */}
          <PatternSummaryPanel
            patterns={insight.patterns}
            compact={compact}
            usePlayerLanguage={usePlayerLanguage}
          />

          {/* Close Button */}
          <button
            style={styles.closeButton}
            onClick={handleClose}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(75, 85, 99, 0.35)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(75, 85, 99, 0.2)';
            }}
          >
            Close Review
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Review Bar Only (Standalone)
// ============================================================================

interface ReviewBarProps {
  readonly insight: ReviewInsight;
  readonly onClick?: () => void;
}

/**
 * Standalone review bar for use in other contexts
 */
export function ReviewBar({
  insight,
  onClick,
}: ReviewBarProps): React.ReactElement | null {
  const [isHovered, setIsHovered] = useState(false);

  if (!insight || !insight.isAvailable) {
    return null;
  }

  const summary = buildReviewBarSummary(insight);

  return (
    <div
      style={{
        ...styles.reviewBar,
        ...(isHovered ? styles.reviewBarHover : {}),
        borderRadius: '6px',
        border: '1px solid rgba(99, 102, 241, 0.2)',
      }}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.();
        }
      }}
      tabIndex={0}
      role="button"
      aria-label="Review this hand"
    >
      <div style={styles.reviewBarLeft}>
        <div style={styles.reviewIcon}>
          📋
        </div>
        <div>
          <div style={styles.reviewTitle}>Review this hand</div>
          {summary && (
            <div style={styles.reviewSummary}>{summary}</div>
          )}
        </div>
      </div>

      <div style={styles.reviewBarRight}>
        <span style={styles.expandBadge}>
          View
        </span>
      </div>
    </div>
  );
}

export default ReviewPanel;
