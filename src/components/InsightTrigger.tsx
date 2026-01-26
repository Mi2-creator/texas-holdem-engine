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
 * InsightTrigger.tsx
 * Phase 9.2 - Insight access trigger button
 *
 * A subtle, non-intrusive button that opens the InsightDrawer.
 * Positioned at the corner of the table area.
 *
 * Design principles:
 * - Discoverable but not distracting
 * - Visual feedback on state (has insights available)
 * - Player-friendly icon and tooltip
 */

import React, { useState } from 'react';

// ============================================================================
// Types
// ============================================================================

interface InsightTriggerProps {
  /** Whether insights are available */
  readonly hasInsights: boolean;
  /** Number of insights available (for badge) */
  readonly insightCount?: number;
  /** Whether the drawer is currently open */
  readonly isOpen: boolean;
  /** Callback when trigger is clicked */
  readonly onClick: () => void;
  /** Optional: compact mode */
  readonly compact?: boolean;
}

// ============================================================================
// Styles
// ============================================================================

const styles = {
  container: {
    position: 'relative' as const,
  } as const,

  button: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '44px',
    height: '44px',
    borderRadius: '12px',
    border: 'none',
    cursor: 'pointer',
    fontSize: '18px',
    transition: 'all 0.2s ease',
    backgroundColor: 'rgba(30, 30, 40, 0.9)',
    color: 'rgba(156, 163, 175, 0.9)',
    backdropFilter: 'blur(8px)',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
  } as const,

  buttonActive: {
    backgroundColor: 'rgba(99, 102, 241, 0.9)',
    color: '#fff',
    boxShadow: '0 4px 16px rgba(99, 102, 241, 0.4)',
  } as const,

  buttonHasInsights: {
    backgroundColor: 'rgba(45, 45, 60, 0.95)',
    border: '1px solid rgba(99, 102, 241, 0.4)',
  } as const,

  badge: {
    position: 'absolute' as const,
    top: '-4px',
    right: '-4px',
    minWidth: '18px',
    height: '18px',
    borderRadius: '9px',
    backgroundColor: '#ef4444',
    color: '#fff',
    fontSize: '10px',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 4px',
    boxShadow: '0 2px 6px rgba(239, 68, 68, 0.4)',
  } as const,

  tooltip: {
    position: 'absolute' as const,
    bottom: '100%',
    left: '50%',
    transform: 'translateX(-50%)',
    marginBottom: '8px',
    padding: '6px 12px',
    borderRadius: '6px',
    backgroundColor: 'rgba(15, 15, 20, 0.95)',
    color: 'rgba(209, 213, 219, 0.95)',
    fontSize: '11px',
    fontWeight: 500,
    whiteSpace: 'nowrap' as const,
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
    pointerEvents: 'none' as const,
    opacity: 0,
    transition: 'opacity 0.15s ease',
  } as const,

  tooltipVisible: {
    opacity: 1,
  } as const,

  compactButton: {
    width: '36px',
    height: '36px',
    fontSize: '14px',
    borderRadius: '10px',
  } as const,
} as const;

// ============================================================================
// Main Component
// ============================================================================

export function InsightTrigger({
  hasInsights,
  insightCount = 0,
  isOpen,
  onClick,
  compact = false,
}: InsightTriggerProps): React.ReactElement {
  const [isHovered, setIsHovered] = useState(false);

  // Determine button style based on state
  const getButtonStyle = (): React.CSSProperties => {
    let style = { ...styles.button };

    if (compact) {
      style = { ...style, ...styles.compactButton };
    }

    if (isOpen) {
      style = { ...style, ...styles.buttonActive };
    } else if (hasInsights) {
      style = { ...style, ...styles.buttonHasInsights };
    }

    return style;
  };

  // Determine tooltip text
  const getTooltipText = (): string => {
    if (isOpen) return 'Close insights';
    if (hasInsights) return 'View insights';
    return 'No insights yet';
  };

  return (
    <div style={styles.container}>
      <button
        style={getButtonStyle()}
        onClick={onClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        aria-label={getTooltipText()}
        aria-expanded={isOpen}
      >
        {isOpen ? '✕' : '💡'}
      </button>

      {/* Badge for insight count */}
      {!isOpen && hasInsights && insightCount > 0 && (
        <span style={styles.badge}>
          {insightCount > 9 ? '9+' : insightCount}
        </span>
      )}

      {/* Tooltip */}
      <div
        style={{
          ...styles.tooltip,
          ...(isHovered ? styles.tooltipVisible : {}),
        }}
      >
        {getTooltipText()}
      </div>
    </div>
  );
}

export default InsightTrigger;
