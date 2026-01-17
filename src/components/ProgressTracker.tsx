/**
 * ProgressTracker.tsx
 * Phase 8.3 - Session progress indicators display
 *
 * Shows learning progress metrics for the current session.
 * All indicators are descriptive, not evaluative.
 */

import React from 'react';
import type { ProgressIndicator, SessionSummary } from '../controllers/LearningProfileEngine';

// ============================================================================
// Types
// ============================================================================

interface ProgressTrackerProps {
  readonly indicators: readonly ProgressIndicator[];
  readonly sessionSummary: SessionSummary;
  readonly compact?: boolean;
}

// ============================================================================
// Styles
// ============================================================================

const styles = {
  container: {
    padding: '12px',
    backgroundColor: 'rgba(30, 30, 30, 0.4)',
    borderRadius: '8px',
    border: '1px solid rgba(75, 85, 99, 0.25)',
  } as const,

  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '12px',
  } as const,

  title: {
    fontSize: '10px',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    color: 'rgba(156, 163, 175, 0.9)',
  } as const,

  handsBadge: {
    padding: '3px 8px',
    borderRadius: '10px',
    fontSize: '9px',
    fontWeight: 600,
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    color: '#22c55e',
  } as const,

  indicatorList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '10px',
    marginBottom: '12px',
  } as const,

  indicatorItem: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
  } as const,

  indicatorHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  } as const,

  indicatorLabel: {
    fontSize: '10px',
    color: 'rgba(156, 163, 175, 0.9)',
    fontWeight: 500,
  } as const,

  indicatorValue: {
    fontSize: '10px',
    color: 'rgba(209, 213, 219, 0.9)',
    fontWeight: 600,
  } as const,

  progressBarContainer: {
    height: '6px',
    backgroundColor: 'rgba(75, 85, 99, 0.3)',
    borderRadius: '3px',
    overflow: 'hidden',
  } as const,

  progressBarFill: {
    height: '100%',
    borderRadius: '3px',
    transition: 'width 0.3s ease',
  } as const,

  indicatorDescription: {
    fontSize: '9px',
    color: 'rgba(107, 114, 128, 0.7)',
  } as const,

  divider: {
    height: '1px',
    backgroundColor: 'rgba(75, 85, 99, 0.2)',
    margin: '12px 0',
  } as const,

  summarySection: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
  } as const,

  summaryRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '10px',
  } as const,

  summaryLabel: {
    color: 'rgba(107, 114, 128, 0.8)',
    minWidth: '100px',
  } as const,

  summaryValue: {
    color: 'rgba(209, 213, 219, 0.9)',
    fontWeight: 500,
  } as const,

  insightBox: {
    marginTop: '10px',
    padding: '8px 10px',
    backgroundColor: 'rgba(99, 102, 241, 0.08)',
    borderRadius: '6px',
    borderLeft: '3px solid rgba(99, 102, 241, 0.4)',
    fontSize: '10px',
    color: 'rgba(156, 163, 175, 0.9)',
    lineHeight: '15px',
  } as const,
} as const;

// ============================================================================
// Helper Functions
// ============================================================================

function getProgressColor(value: number): string {
  if (value >= 70) return '#22c55e'; // Green
  if (value >= 40) return '#eab308'; // Yellow
  return '#6b7280'; // Gray
}

// ============================================================================
// Sub-Components
// ============================================================================

interface ProgressBarProps {
  readonly indicator: ProgressIndicator;
  readonly compact?: boolean;
}

function ProgressBar({ indicator, compact }: ProgressBarProps): React.ReactElement {
  const color = getProgressColor(indicator.value);

  return (
    <div style={styles.indicatorItem}>
      <div style={styles.indicatorHeader}>
        <span style={styles.indicatorLabel}>{indicator.label}</span>
        <span style={styles.indicatorValue}>{indicator.value}%</span>
      </div>
      <div style={styles.progressBarContainer}>
        <div
          style={{
            ...styles.progressBarFill,
            width: `${indicator.value}%`,
            backgroundColor: color,
          }}
        />
      </div>
      {!compact && (
        <span style={styles.indicatorDescription}>{indicator.description}</span>
      )}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function ProgressTracker({
  indicators,
  sessionSummary,
  compact = false,
}: ProgressTrackerProps): React.ReactElement {
  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <span style={styles.title}>Session Progress</span>
        <span style={styles.handsBadge}>
          {sessionSummary.handsPlayed} hand{sessionSummary.handsPlayed !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Progress Indicators */}
      {indicators.length > 0 && (
        <div style={styles.indicatorList}>
          {indicators.map((indicator) => (
            <ProgressBar
              key={indicator.id}
              indicator={indicator}
              compact={compact}
            />
          ))}
        </div>
      )}

      {/* Divider */}
      {!compact && <div style={styles.divider} />}

      {/* Summary Stats */}
      {!compact && (
        <div style={styles.summarySection}>
          <div style={styles.summaryRow}>
            <span style={styles.summaryLabel}>Total Decisions:</span>
            <span style={styles.summaryValue}>{sessionSummary.totalDecisions}</span>
          </div>
          <div style={styles.summaryRow}>
            <span style={styles.summaryLabel}>Key Reviewed:</span>
            <span style={styles.summaryValue}>{sessionSummary.keyDecisionsReviewed}</span>
          </div>
          <div style={styles.summaryRow}>
            <span style={styles.summaryLabel}>Dominant Pattern:</span>
            <span style={styles.summaryValue}>{sessionSummary.dominantTendency}</span>
          </div>
        </div>
      )}

      {/* Session Insight */}
      {!compact && sessionSummary.sessionInsight && (
        <div style={styles.insightBox}>
          {sessionSummary.sessionInsight}
        </div>
      )}
    </div>
  );
}

export default ProgressTracker;
