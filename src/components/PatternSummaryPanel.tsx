/**
 * PatternSummaryPanel.tsx
 * Phase 7.3 - Pattern summary for entire hand review
 *
 * Summarizes structural patterns observed in the hand.
 * No judgments - only describes what happened structurally.
 */

import React from 'react';
import type { PatternSummary } from '../controllers/ReviewInsightEngine';

// ============================================================================
// Types
// ============================================================================

interface PatternSummaryPanelProps {
  readonly patterns: PatternSummary;
  readonly compact?: boolean;
}

// ============================================================================
// Styles
// ============================================================================

const styles = {
  container: {
    padding: '10px 12px',
    backgroundColor: 'rgba(30, 30, 30, 0.4)',
    borderRadius: '6px',
    border: '1px solid rgba(75, 85, 99, 0.25)',
  } as const,

  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '10px',
  } as const,

  title: {
    fontSize: '10px',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    color: 'rgba(156, 163, 175, 0.9)',
  } as const,

  metricsRow: {
    display: 'flex',
    gap: '16px',
    marginBottom: '10px',
  } as const,

  metric: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
  } as const,

  metricValue: {
    fontSize: '14px',
    fontWeight: 700,
    color: 'rgba(209, 213, 219, 0.95)',
  } as const,

  metricLabel: {
    fontSize: '9px',
    color: 'rgba(107, 114, 128, 0.8)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.3px',
  } as const,

  tensionBadge: {
    padding: '3px 8px',
    borderRadius: '4px',
    fontSize: '9px',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
  } as const,

  patternList: {
    margin: 0,
    padding: 0,
    listStyle: 'none',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
  } as const,

  patternItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    fontSize: '10px',
    lineHeight: '14px',
    color: 'rgba(156, 163, 175, 0.85)',
  } as const,

  patternIcon: {
    flexShrink: 0,
    width: '14px',
    height: '14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '10px',
    opacity: 0.6,
  } as const,

  divider: {
    height: '1px',
    backgroundColor: 'rgba(75, 85, 99, 0.2)',
    margin: '8px 0',
  } as const,
} as const;

// ============================================================================
// Helper Functions
// ============================================================================

function getTensionBadgeStyle(tension: string): { backgroundColor: string; color: string } {
  switch (tension) {
    case 'high':
      return { backgroundColor: 'rgba(239, 68, 68, 0.2)', color: '#ef4444' };
    case 'elevated':
      return { backgroundColor: 'rgba(245, 158, 11, 0.2)', color: '#f59e0b' };
    case 'moderate':
      return { backgroundColor: 'rgba(234, 179, 8, 0.2)', color: '#eab308' };
    case 'calm':
    default:
      return { backgroundColor: 'rgba(34, 197, 94, 0.2)', color: '#22c55e' };
  }
}

function formatStreet(street: string): string {
  return street.charAt(0) + street.slice(1).toLowerCase();
}

function getPatternIcon(pattern: string): string {
  // Choose icon based on pattern content
  if (pattern.includes('Aggression') || pattern.includes('aggressive')) return '\u2191'; // Up arrow
  if (pattern.includes('pressure') || pattern.includes('Pressure')) return '\u26A0'; // Warning
  if (pattern.includes('commitment') || pattern.includes('Commitment')) return '\u25CF'; // Filled circle
  if (pattern.includes('defensive') || pattern.includes('Defensive')) return '\u25CB'; // Empty circle
  if (pattern.includes('exit') || pattern.includes('Exit')) return '\u2192'; // Right arrow
  return '\u2022'; // Bullet
}

// ============================================================================
// Main Component
// ============================================================================

export function PatternSummaryPanel({
  patterns,
  compact = false,
}: PatternSummaryPanelProps): React.ReactElement | null {
  // Don't render if no patterns
  if (!patterns || patterns.patterns.length === 0) {
    return null;
  }

  const tensionStyle = getTensionBadgeStyle(patterns.overallTension);

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <span style={styles.title}>Hand Summary</span>
        <span
          style={{
            ...styles.tensionBadge,
            ...tensionStyle,
          }}
        >
          {patterns.overallTension} tension
        </span>
      </div>

      {/* Metrics Row */}
      {!compact && (
        <>
          <div style={styles.metricsRow}>
            <div style={styles.metric}>
              <span style={styles.metricValue}>{patterns.heroDecisionCount}</span>
              <span style={styles.metricLabel}>Hero Decisions</span>
            </div>
            <div style={styles.metric}>
              <span style={styles.metricValue}>{patterns.pressureDecisionCount}</span>
              <span style={styles.metricLabel}>Pressure Points</span>
            </div>
            <div style={styles.metric}>
              <span style={styles.metricValue}>{formatStreet(patterns.peakStreet)}</span>
              <span style={styles.metricLabel}>Peak Street</span>
            </div>
          </div>
          <div style={styles.divider} />
        </>
      )}

      {/* Pattern List */}
      <ul style={styles.patternList}>
        {patterns.patterns.map((pattern, index) => (
          <li key={index} style={styles.patternItem}>
            <span style={styles.patternIcon}>{getPatternIcon(pattern)}</span>
            <span>{pattern}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default PatternSummaryPanel;
