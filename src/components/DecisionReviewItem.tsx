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
 * DecisionReviewItem.tsx
 * Phase 7.2 - Individual decision point display for review
 * Phase 9.3 - Added player language support
 *
 * Displays a single key decision with structural context.
 * No judgments, no scores - only explains WHY this was a key decision.
 */

import React from 'react';
import type { ReviewDecision } from '../controllers/ReviewInsightEngine';
import {
  getDecisionTypeLabel,
  getDecisionTypeColor,
  getTensionLabel,
} from '../controllers/ReviewInsightEngine';
import { mapDecisionToPlayerText } from '../adapters/playerLanguage';

// ============================================================================
// Types
// ============================================================================

interface DecisionReviewItemProps {
  readonly decision: ReviewDecision;
  readonly index: number; // Display index (1, 2, 3...)
  readonly compact?: boolean;
  /** Phase 9.3: Use player-friendly language instead of structural data */
  readonly usePlayerLanguage?: boolean;
}

// ============================================================================
// Styles
// ============================================================================

const styles = {
  container: {
    padding: '10px 12px',
    backgroundColor: 'rgba(30, 30, 30, 0.5)',
    borderRadius: '6px',
    border: '1px solid rgba(75, 85, 99, 0.3)',
    marginBottom: '8px',
  } as const,

  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '8px',
  } as const,

  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  } as const,

  indexBadge: {
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    backgroundColor: 'rgba(107, 114, 128, 0.3)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '10px',
    fontWeight: 700,
    color: 'rgba(209, 213, 219, 0.9)',
  } as const,

  streetBadge: {
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '9px',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    backgroundColor: 'rgba(107, 114, 128, 0.2)',
    color: 'rgba(156, 163, 175, 0.9)',
  } as const,

  typeBadge: {
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '9px',
    fontWeight: 600,
  } as const,

  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  } as const,

  tensionIndicator: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '9px',
    color: 'rgba(156, 163, 175, 0.7)',
  } as const,

  tensionBar: {
    width: '40px',
    height: '4px',
    borderRadius: '2px',
    backgroundColor: 'rgba(75, 85, 99, 0.3)',
    overflow: 'hidden',
  } as const,

  tensionFill: {
    height: '100%',
    borderRadius: '2px',
    transition: 'width 0.3s ease',
  } as const,

  metricsRow: {
    display: 'flex',
    gap: '12px',
    marginBottom: '8px',
    fontSize: '10px',
    color: 'rgba(156, 163, 175, 0.8)',
  } as const,

  metric: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  } as const,

  metricLabel: {
    color: 'rgba(107, 114, 128, 0.8)',
  } as const,

  metricValue: {
    fontWeight: 600,
    color: 'rgba(209, 213, 219, 0.9)',
  } as const,

  explanationList: {
    margin: 0,
    padding: '0 0 0 12px',
    listStyle: 'none',
  } as const,

  explanationItem: {
    position: 'relative' as const,
    fontSize: '10px',
    lineHeight: '16px',
    color: 'rgba(156, 163, 175, 0.85)',
    marginBottom: '4px',
    paddingLeft: '8px',
  } as const,

  explanationBullet: {
    position: 'absolute' as const,
    left: '-4px',
    top: '5px',
    width: '4px',
    height: '4px',
    borderRadius: '50%',
    backgroundColor: 'rgba(107, 114, 128, 0.5)',
  } as const,

  // Phase 9.3: Player language styles
  playerContainer: {
    padding: '12px 14px',
    backgroundColor: 'rgba(30, 30, 30, 0.4)',
    borderRadius: '8px',
    border: '1px solid rgba(75, 85, 99, 0.2)',
    marginBottom: '10px',
  } as const,

  playerHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '6px',
  } as const,

  playerIndex: {
    width: '22px',
    height: '22px',
    borderRadius: '50%',
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '11px',
    fontWeight: 600,
    color: 'rgba(129, 140, 248, 0.9)',
  } as const,

  playerPrimary: {
    fontSize: '12px',
    color: 'rgba(209, 213, 219, 0.95)',
    lineHeight: '18px',
  } as const,

  playerSecondary: {
    fontSize: '11px',
    color: 'rgba(156, 163, 175, 0.7)',
    marginTop: '4px',
    paddingLeft: '30px',
  } as const,

  actionTaken: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '2px 6px',
    borderRadius: '3px',
    fontSize: '9px',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    backgroundColor: 'rgba(75, 85, 99, 0.3)',
    color: 'rgba(209, 213, 219, 0.9)',
  } as const,
} as const;

// ============================================================================
// Helper Functions
// ============================================================================

function getTensionColor(tension: number): string {
  if (tension >= 85) return '#ef4444'; // Red
  if (tension >= 70) return '#f59e0b'; // Amber
  if (tension >= 50) return '#eab308'; // Yellow
  if (tension >= 30) return '#22c55e'; // Green
  return '#6b7280'; // Gray
}

function formatStreet(street: string): string {
  return street.charAt(0) + street.slice(1).toLowerCase();
}

function formatAction(action: string): string {
  if (action === 'all-in') return 'All-In';
  return action.charAt(0).toUpperCase() + action.slice(1);
}

function formatPotSize(amount: number): string {
  if (amount >= 1000) {
    return `$${(amount / 1000).toFixed(1)}K`;
  }
  return `$${amount}`;
}

// ============================================================================
// Main Component
// ============================================================================

export function DecisionReviewItem({
  decision,
  index,
  compact = false,
  usePlayerLanguage = false,
}: DecisionReviewItemProps): React.ReactElement {
  // Phase 9.3: Player language mode - simplified view
  if (usePlayerLanguage) {
    const playerText = mapDecisionToPlayerText(decision);
    if (!playerText) return <></>;

    return (
      <div style={styles.playerContainer}>
        <div style={styles.playerHeader}>
          <span style={styles.playerIndex}>{index}</span>
          <span style={styles.playerPrimary}>{playerText.primary}</span>
        </div>
        {playerText.secondary && (
          <div style={styles.playerSecondary}>{playerText.secondary}</div>
        )}
      </div>
    );
  }

  // Debug mode: full structural view
  const typeColor = getDecisionTypeColor(decision.decisionType);
  const tensionColor = getTensionColor(decision.tension);
  const tensionLabel = getTensionLabel(decision.tension);

  return (
    <div style={styles.container}>
      {/* Header Row */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          {/* Index Badge */}
          <span style={styles.indexBadge}>{index}</span>

          {/* Street Badge */}
          <span style={styles.streetBadge}>
            {formatStreet(decision.street)}
          </span>

          {/* Decision Type Badge */}
          <span
            style={{
              ...styles.typeBadge,
              backgroundColor: `${typeColor}20`,
              color: typeColor,
            }}
          >
            {getDecisionTypeLabel(decision.decisionType)}
          </span>
        </div>

        <div style={styles.headerRight}>
          {/* Tension Indicator */}
          <div style={styles.tensionIndicator}>
            <span>{tensionLabel}</span>
            <div style={styles.tensionBar}>
              <div
                style={{
                  ...styles.tensionFill,
                  width: `${decision.tension}%`,
                  backgroundColor: tensionColor,
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div style={styles.metricsRow}>
        <div style={styles.metric}>
          <span style={styles.metricLabel}>Pot:</span>
          <span style={styles.metricValue}>{formatPotSize(decision.potSize)}</span>
        </div>
        <div style={styles.metric}>
          <span style={styles.metricLabel}>Pressure:</span>
          <span style={styles.metricValue}>
            {decision.pressureLevel.charAt(0).toUpperCase() + decision.pressureLevel.slice(1)}
          </span>
        </div>
        <div style={styles.metric}>
          <span style={styles.metricLabel}>Action:</span>
          <span style={styles.actionTaken}>
            {formatAction(decision.actionTaken)}
          </span>
        </div>
      </div>

      {/* Explanations */}
      {!compact && decision.explanations.length > 0 && (
        <ul style={styles.explanationList}>
          {decision.explanations.map((explanation, i) => (
            <li key={i} style={styles.explanationItem}>
              <span style={styles.explanationBullet} />
              {explanation}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default DecisionReviewItem;
