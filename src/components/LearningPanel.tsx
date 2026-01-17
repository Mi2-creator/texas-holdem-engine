/**
 * LearningPanel.tsx
 * Phase 8.4 - Main learning panel component
 * Phase 9.3 - Added player language support
 *
 * Integrates TendencyCard, ProgressTracker, and session summary.
 * Only visible when sufficient data is available.
 * Default collapsed, non-intrusive design.
 */

import React, { useState, useCallback, useMemo } from 'react';
import type { HandHistory } from '../controllers/LearningProfileEngine';
import { buildLearningProfile } from '../controllers/LearningProfileEngine';
import { TendencyCard } from './TendencyCard';
import { ProgressTracker } from './ProgressTracker';

// ============================================================================
// Types
// ============================================================================

interface LearningPanelProps {
  readonly handHistories: readonly HandHistory[];
  readonly heroSeat?: number;
  readonly collapsed?: boolean;
  readonly onToggle?: () => void;
  readonly compact?: boolean;
  /** Phase 9.3: Use player-friendly language instead of structural data */
  readonly usePlayerLanguage?: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const MIN_HANDS_FOR_DISPLAY = 2;

// ============================================================================
// Styles
// ============================================================================

const styles = {
  container: {
    marginTop: '16px',
    borderRadius: '8px',
    backgroundColor: 'rgba(20, 20, 25, 0.8)',
    border: '1px solid rgba(168, 85, 247, 0.2)',
    overflow: 'hidden',
    fontFamily: 'monospace',
  } as const,

  // Entry Bar
  entryBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 14px',
    cursor: 'pointer',
    userSelect: 'none' as const,
    backgroundColor: 'rgba(168, 85, 247, 0.08)',
    borderBottom: '1px solid rgba(168, 85, 247, 0.15)',
    transition: 'background-color 0.15s ease',
  } as const,

  entryBarHover: {
    backgroundColor: 'rgba(168, 85, 247, 0.12)',
  } as const,

  entryBarLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  } as const,

  icon: {
    width: '28px',
    height: '28px',
    borderRadius: '6px',
    backgroundColor: 'rgba(168, 85, 247, 0.15)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '14px',
  } as const,

  titleSection: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
  } as const,

  title: {
    fontSize: '11px',
    fontWeight: 600,
    color: 'rgba(209, 213, 219, 0.95)',
    letterSpacing: '0.3px',
  } as const,

  subtitle: {
    fontSize: '9px',
    color: 'rgba(156, 163, 175, 0.7)',
  } as const,

  entryBarRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  } as const,

  tendencyBadge: {
    padding: '3px 10px',
    borderRadius: '10px',
    fontSize: '9px',
    fontWeight: 500,
    backgroundColor: 'rgba(168, 85, 247, 0.15)',
    color: 'rgba(192, 132, 252, 0.9)',
  } as const,

  chevron: {
    fontSize: '12px',
    color: 'rgba(192, 132, 252, 0.7)',
    transition: 'transform 0.2s ease',
  } as const,

  chevronExpanded: {
    transform: 'rotate(180deg)',
  } as const,

  // Content Area
  content: {
    padding: '16px',
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
    color: 'rgba(192, 132, 252, 0.9)',
  } as const,

  sectionCount: {
    padding: '2px 6px',
    borderRadius: '10px',
    fontSize: '9px',
    fontWeight: 600,
    backgroundColor: 'rgba(168, 85, 247, 0.2)',
    color: 'rgba(192, 132, 252, 0.9)',
  } as const,

  tendencyList: {
    marginBottom: '16px',
  } as const,

  emptyState: {
    padding: '20px',
    textAlign: 'center' as const,
    color: 'rgba(107, 114, 128, 0.6)',
    fontSize: '11px',
    lineHeight: '18px',
  } as const,

  emptyIcon: {
    fontSize: '24px',
    marginBottom: '8px',
    opacity: 0.5,
  } as const,

  closeButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '8px',
    marginTop: '12px',
    borderRadius: '4px',
    backgroundColor: 'rgba(75, 85, 99, 0.2)',
    border: 'none',
    cursor: 'pointer',
    fontSize: '10px',
    color: 'rgba(156, 163, 175, 0.7)',
    transition: 'background-color 0.15s ease',
  } as const,

  insufficientData: {
    padding: '16px',
    textAlign: 'center' as const,
    fontSize: '10px',
    color: 'rgba(107, 114, 128, 0.7)',
    fontStyle: 'italic' as const,
  } as const,
} as const;

// ============================================================================
// Main Component
// ============================================================================

export function LearningPanel({
  handHistories,
  heroSeat = 0,
  collapsed: controlledCollapsed,
  onToggle,
  compact = false,
  usePlayerLanguage = false,
}: LearningPanelProps): React.ReactElement | null {
  // Internal collapse state
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

  // Build learning profile
  const learningProfile = useMemo(() => {
    return buildLearningProfile({
      handHistories,
      heroSeat,
    });
  }, [handHistories, heroSeat]);

  // Don't render if insufficient hands
  if (!handHistories || handHistories.length < MIN_HANDS_FOR_DISPLAY) {
    return null;
  }

  const hasTendencies = learningProfile.tendencies.length > 0;

  return (
    <div style={styles.container}>
      {/* Entry Bar */}
      <div
        style={{
          ...styles.entryBar,
          ...(isHovered ? styles.entryBarHover : {}),
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
        aria-label="Learning insights"
      >
        <div style={styles.entryBarLeft}>
          <div style={styles.icon}>
            📊
          </div>
          <div style={styles.titleSection}>
            <span style={styles.title}>Learning Insights</span>
            <span style={styles.subtitle}>
              {learningProfile.sessionSummary.handsPlayed} hands analyzed
            </span>
          </div>
        </div>

        <div style={styles.entryBarRight}>
          {isCollapsed && hasTendencies && (
            <span style={styles.tendencyBadge}>
              {learningProfile.tendencies.length} pattern{learningProfile.tendencies.length > 1 ? 's' : ''}
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
          {learningProfile.isAvailable ? (
            <>
              {/* Tendencies Section */}
              {hasTendencies ? (
                <>
                  <div style={styles.sectionHeader}>
                    <span style={styles.sectionTitle}>Observed Tendencies</span>
                    <span style={styles.sectionCount}>
                      {learningProfile.tendencies.length}
                    </span>
                  </div>

                  <div style={styles.tendencyList}>
                    {learningProfile.tendencies.map((tendency) => (
                      <TendencyCard
                        key={tendency.id}
                        tendency={tendency}
                        compact={compact}
                        usePlayerLanguage={usePlayerLanguage}
                      />
                    ))}
                  </div>
                </>
              ) : (
                <div style={styles.emptyState}>
                  <div style={styles.emptyIcon}>🔍</div>
                  <div>No clear patterns detected yet.</div>
                  <div style={{ marginTop: '4px', opacity: 0.7 }}>
                    More hands will reveal decision tendencies.
                  </div>
                </div>
              )}

              {/* Progress Tracker */}
              <ProgressTracker
                indicators={learningProfile.progressIndicators}
                sessionSummary={learningProfile.sessionSummary}
                compact={compact}
              />
            </>
          ) : (
            <div style={styles.insufficientData}>
              Complete more hands to see learning insights.
            </div>
          )}

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
            Close Learning Panel
          </button>
        </div>
      )}
    </div>
  );
}

export default LearningPanel;
