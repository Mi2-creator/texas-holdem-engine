/**
 * CoachHintPanel.tsx
 * Phase 6.2 - Low-intrusion coaching hints UI
 *
 * Design principles:
 * - Small, weak contrast (non-intrusive)
 * - Collapsed by default
 * - No animations (avoid competing with Phase 5)
 * - Only visible in comparison-focus / narrative-dramatic modes
 */

import React, { useState, useCallback } from 'react';
import type { CoachHint, HintLevel } from '../controllers/CoachHintEngine';
import { getHintLevelIndicator, getHintLevelColor } from '../controllers/CoachHintEngine';

// ============================================================================
// Types
// ============================================================================

interface CoachHintPanelProps {
  readonly hints: readonly CoachHint[];
  readonly collapsed?: boolean;
  readonly onToggle?: () => void;
}

// ============================================================================
// Styles
// ============================================================================

const styles = {
  container: {
    marginTop: '8px',
    borderRadius: '4px',
    backgroundColor: 'rgba(30, 30, 30, 0.6)',
    border: '1px solid rgba(75, 85, 99, 0.3)',
    fontSize: '11px',
    fontFamily: 'monospace',
    overflow: 'hidden',
  } as const,

  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '4px 8px',
    cursor: 'pointer',
    userSelect: 'none' as const,
    backgroundColor: 'rgba(40, 40, 40, 0.5)',
    borderBottom: '1px solid rgba(75, 85, 99, 0.2)',
  } as const,

  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    color: 'rgba(156, 163, 175, 0.8)',
  } as const,

  headerIcon: {
    fontSize: '10px',
    opacity: 0.6,
  } as const,

  headerTitle: {
    fontSize: '10px',
    fontWeight: 500,
    letterSpacing: '0.5px',
    textTransform: 'uppercase' as const,
  } as const,

  badge: {
    padding: '1px 5px',
    borderRadius: '8px',
    fontSize: '9px',
    fontWeight: 600,
    backgroundColor: 'rgba(107, 114, 128, 0.3)',
    color: 'rgba(156, 163, 175, 0.9)',
  } as const,

  chevron: {
    fontSize: '10px',
    color: 'rgba(107, 114, 128, 0.6)',
  } as const,

  content: {
    padding: '6px 8px',
  } as const,

  hintList: {
    margin: 0,
    padding: 0,
    listStyle: 'none',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
  } as const,

  hintItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '6px',
    padding: '3px 0',
  } as const,

  hintIndicator: {
    flexShrink: 0,
    width: '8px',
    textAlign: 'center' as const,
    fontSize: '8px',
    lineHeight: '14px',
  } as const,

  hintText: {
    color: 'rgba(209, 213, 219, 0.85)',
    lineHeight: '14px',
  } as const,

  emptyState: {
    color: 'rgba(107, 114, 128, 0.6)',
    fontStyle: 'italic' as const,
    padding: '4px 0',
  } as const,
} as const;

// ============================================================================
// Subcomponents
// ============================================================================

interface HintItemProps {
  readonly hint: CoachHint;
}

function HintItem({ hint }: HintItemProps): React.ReactElement {
  const indicatorColor = getHintLevelColor(hint.level);
  const indicator = getHintLevelIndicator(hint.level);

  return (
    <li style={styles.hintItem}>
      <span
        style={{
          ...styles.hintIndicator,
          color: indicatorColor,
        }}
        aria-hidden="true"
      >
        {indicator}
      </span>
      <span style={styles.hintText}>{hint.text}</span>
    </li>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function CoachHintPanel({
  hints,
  collapsed: controlledCollapsed,
  onToggle,
}: CoachHintPanelProps): React.ReactElement | null {
  // Internal collapse state (used when not controlled)
  const [internalCollapsed, setInternalCollapsed] = useState(true);

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

  // Don't render if no hints
  if (!hints || hints.length === 0) {
    return null;
  }

  return (
    <div style={styles.container} role="complementary" aria-label="Coach hints">
      {/* Collapsed Header */}
      <div
        style={styles.header}
        onClick={handleToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleToggle();
          }
        }}
        tabIndex={0}
        role="button"
        aria-expanded={!isCollapsed}
      >
        <div style={styles.headerLeft}>
          <span style={styles.headerIcon}>💡</span>
          <span style={styles.headerTitle}>Coach</span>
          <span style={styles.badge}>{hints.length}</span>
        </div>
        <span style={styles.chevron}>
          {isCollapsed ? '▸' : '▾'}
        </span>
      </div>

      {/* Expanded Content */}
      {!isCollapsed && (
        <div style={styles.content}>
          <ul style={styles.hintList}>
            {hints.map((hint) => (
              <HintItem key={hint.id} hint={hint} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Compact Variant (inline display)
// ============================================================================

interface CoachHintInlineProps {
  readonly hints: readonly CoachHint[];
  readonly maxHints?: number;
}

/**
 * Inline variant for tight spaces - shows hints as a single line
 */
export function CoachHintInline({
  hints,
  maxHints = 1,
}: CoachHintInlineProps): React.ReactElement | null {
  if (!hints || hints.length === 0) return null;

  const displayHints = hints.slice(0, maxHints);
  const remaining = hints.length - maxHints;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        fontSize: '10px',
        color: 'rgba(156, 163, 175, 0.7)',
        fontFamily: 'monospace',
      }}
    >
      <span style={{ opacity: 0.5 }}>💡</span>
      {displayHints.map((hint, index) => (
        <span
          key={hint.id}
          style={{ color: getHintLevelColor(hint.level) }}
        >
          {hint.text}
          {index < displayHints.length - 1 && ' · '}
        </span>
      ))}
      {remaining > 0 && (
        <span style={{ opacity: 0.5 }}>+{remaining} more</span>
      )}
    </div>
  );
}

export default CoachHintPanel;
