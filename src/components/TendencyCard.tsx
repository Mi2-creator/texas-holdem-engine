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
 * TendencyCard.tsx
 * Phase 8.2 - Single tendency observation display
 * Phase 9.3 - Added player language support
 *
 * Displays one observed decision-making tendency.
 * All content is observational, not judgmental.
 */

import React from 'react';
import type { TendencyObservation } from '../controllers/LearningProfileEngine';
import {
  getTendencyCategoryColor,
  getTendencyCategoryIcon,
  getConfidenceLabel,
} from '../controllers/LearningProfileEngine';
import {
  mapTendencyToPlayerText,
  mapTendencyObservationsToPlayerText,
} from '../adapters/playerLanguage';

// ============================================================================
// Types
// ============================================================================

interface TendencyCardProps {
  readonly tendency: TendencyObservation;
  readonly compact?: boolean;
  /** Phase 9.3: Use player-friendly language instead of structural data */
  readonly usePlayerLanguage?: boolean;
}

// ============================================================================
// Styles
// ============================================================================

const styles = {
  container: {
    padding: '12px',
    backgroundColor: 'rgba(30, 30, 30, 0.5)',
    borderRadius: '8px',
    border: '1px solid rgba(75, 85, 99, 0.3)',
    marginBottom: '10px',
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

  icon: {
    width: '24px',
    height: '24px',
    borderRadius: '6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px',
  } as const,

  title: {
    fontSize: '11px',
    fontWeight: 600,
    color: 'rgba(209, 213, 219, 0.95)',
    letterSpacing: '0.3px',
  } as const,

  confidenceBadge: {
    padding: '2px 8px',
    borderRadius: '10px',
    fontSize: '9px',
    fontWeight: 500,
    backgroundColor: 'rgba(107, 114, 128, 0.2)',
    color: 'rgba(156, 163, 175, 0.8)',
  } as const,

  description: {
    fontSize: '10px',
    color: 'rgba(156, 163, 175, 0.9)',
    marginBottom: '10px',
    lineHeight: '15px',
  } as const,

  observationList: {
    margin: 0,
    padding: 0,
    listStyle: 'none',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
  } as const,

  observationItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    fontSize: '10px',
    lineHeight: '14px',
    color: 'rgba(156, 163, 175, 0.8)',
  } as const,

  bullet: {
    flexShrink: 0,
    width: '4px',
    height: '4px',
    borderRadius: '50%',
    marginTop: '5px',
  } as const,

  sampleSize: {
    marginTop: '10px',
    paddingTop: '8px',
    borderTop: '1px solid rgba(75, 85, 99, 0.2)',
    fontSize: '9px',
    color: 'rgba(107, 114, 128, 0.7)',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  } as const,

  // Phase 9.3: Player language styles
  playerContainer: {
    padding: '12px 14px',
    backgroundColor: 'rgba(30, 30, 30, 0.4)',
    borderRadius: '8px',
    border: '1px solid rgba(168, 85, 247, 0.15)',
    borderLeft: '3px solid rgba(168, 85, 247, 0.5)',
    marginBottom: '10px',
  } as const,

  playerTitle: {
    fontSize: '12px',
    fontWeight: 600,
    color: 'rgba(209, 213, 219, 0.95)',
    marginBottom: '6px',
  } as const,

  playerDescription: {
    fontSize: '11px',
    color: 'rgba(156, 163, 175, 0.85)',
    lineHeight: '17px',
  } as const,

  playerObservations: {
    marginTop: '8px',
    paddingTop: '8px',
    borderTop: '1px solid rgba(75, 85, 99, 0.15)',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
  } as const,

  playerObservationItem: {
    fontSize: '10px',
    color: 'rgba(156, 163, 175, 0.7)',
    paddingLeft: '10px',
    position: 'relative' as const,
  } as const,

  playerObservationBullet: {
    position: 'absolute' as const,
    left: '0',
    top: '5px',
    width: '4px',
    height: '4px',
    borderRadius: '50%',
    backgroundColor: 'rgba(168, 85, 247, 0.4)',
  } as const,
} as const;

// ============================================================================
// Main Component
// ============================================================================

export function TendencyCard({
  tendency,
  compact = false,
  usePlayerLanguage = false,
}: TendencyCardProps): React.ReactElement {
  // Phase 9.3: Player language mode - simplified view
  if (usePlayerLanguage) {
    const playerText = mapTendencyToPlayerText(tendency);
    if (!playerText) return <></>;

    const filteredObservations = mapTendencyObservationsToPlayerText(tendency.observations);

    return (
      <div style={styles.playerContainer}>
        <div style={styles.playerTitle}>{playerText.primary}</div>
        {playerText.secondary && (
          <div style={styles.playerDescription}>{playerText.secondary}</div>
        )}
        {!compact && filteredObservations.length > 0 && (
          <div style={styles.playerObservations}>
            {filteredObservations.map((obs, i) => (
              <div key={i} style={styles.playerObservationItem}>
                <span style={styles.playerObservationBullet} />
                {obs}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Debug mode: full structural view
  const categoryColor = getTendencyCategoryColor(tendency.category);
  const categoryIcon = getTendencyCategoryIcon(tendency.category);
  const confidenceLabel = getConfidenceLabel(tendency.confidence);

  return (
    <div
      style={{
        ...styles.container,
        borderLeft: `3px solid ${categoryColor}`,
      }}
    >
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <div
            style={{
              ...styles.icon,
              backgroundColor: `${categoryColor}20`,
              color: categoryColor,
            }}
          >
            {categoryIcon}
          </div>
          <span style={styles.title}>{tendency.title}</span>
        </div>
        <span style={styles.confidenceBadge}>{confidenceLabel}</span>
      </div>

      {/* Description */}
      <div style={styles.description}>{tendency.description}</div>

      {/* Observations */}
      {!compact && tendency.observations.length > 0 && (
        <ul style={styles.observationList}>
          {tendency.observations.map((observation, index) => (
            <li key={index} style={styles.observationItem}>
              <span
                style={{
                  ...styles.bullet,
                  backgroundColor: categoryColor,
                }}
              />
              <span>{observation}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Sample Size */}
      {!compact && (
        <div style={styles.sampleSize}>
          <span>Based on</span>
          <span style={{ fontWeight: 600, color: 'rgba(156, 163, 175, 0.9)' }}>
            {tendency.sampleSize}
          </span>
          <span>decision{tendency.sampleSize !== 1 ? 's' : ''}</span>
        </div>
      )}
    </div>
  );
}

export default TendencyCard;
