/**
 * ViewModeToggle.tsx
 * Phase 9.5 - Refactored mode switcher with compact mode
 *
 * Provides two display modes:
 * - Normal: Full toggle buttons for Debug mode header
 * - Compact: Small icon button for Player mode corner
 *
 * Design principles:
 * - Dark theme consistent with Player mode
 * - Non-intrusive in Player mode (compact)
 * - Clear visibility in Debug mode (normal)
 */

import React, { useState } from 'react';

// ============================================================================
// Types
// ============================================================================

export type ViewMode = 'player' | 'debug';

interface ViewModeToggleProps {
  /** Current view mode */
  readonly mode: ViewMode;
  /** Mode change callback */
  readonly onModeChange: (mode: ViewMode) => void;
  /** Use compact display (icon only) */
  readonly compact?: boolean;
}

// ============================================================================
// Styles
// ============================================================================

const styles = {
  // Normal mode styles (for Debug view header)
  container: {
    display: 'flex',
    gap: 0,
    borderRadius: '8px',
    overflow: 'hidden',
    border: '1px solid rgba(75, 85, 99, 0.4)',
    width: 'fit-content',
    backgroundColor: 'rgba(25, 25, 30, 0.9)',
  } as const,

  button: {
    padding: '8px 16px',
    border: 'none',
    background: 'transparent',
    color: 'rgba(156, 163, 175, 0.8)',
    fontWeight: 500,
    cursor: 'pointer',
    fontSize: '12px',
    transition: 'all 0.2s ease',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  } as const,

  buttonActive: {
    background: 'rgba(99, 102, 241, 0.8)',
    color: '#fff',
    fontWeight: 600,
  } as const,

  buttonDivider: {
    borderLeft: '1px solid rgba(75, 85, 99, 0.4)',
  } as const,

  // Compact mode styles (for Player view corner)
  compactContainer: {
    position: 'relative' as const,
  } as const,

  compactButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '40px',
    height: '40px',
    borderRadius: '10px',
    border: '1px solid rgba(75, 85, 99, 0.3)',
    backgroundColor: 'rgba(30, 30, 40, 0.9)',
    color: 'rgba(156, 163, 175, 0.8)',
    fontSize: '16px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    backdropFilter: 'blur(8px)',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
  } as const,

  compactTooltip: {
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

  compactTooltipVisible: {
    opacity: 1,
  } as const,
} as const;

// ============================================================================
// Compact Mode Component
// ============================================================================

function CompactToggle({
  mode,
  onModeChange,
}: Omit<ViewModeToggleProps, 'compact'>): React.ReactElement {
  const [isHovered, setIsHovered] = useState(false);

  const targetMode = mode === 'player' ? 'debug' : 'player';
  const tooltipText = mode === 'player' ? 'Switch to Debug View' : 'Switch to Player View';
  const icon = mode === 'player' ? '\u2699' : '\u25B6'; // Gear or Play icon

  return (
    <div style={styles.compactContainer}>
      <button
        style={styles.compactButton}
        onClick={() => onModeChange(targetMode)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        aria-label={tooltipText}
        onMouseOver={(e) => {
          e.currentTarget.style.backgroundColor = 'rgba(45, 45, 60, 0.95)';
          e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.5)';
          e.currentTarget.style.color = 'rgba(209, 213, 219, 0.95)';
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.backgroundColor = 'rgba(30, 30, 40, 0.9)';
          e.currentTarget.style.borderColor = 'rgba(75, 85, 99, 0.3)';
          e.currentTarget.style.color = 'rgba(156, 163, 175, 0.8)';
        }}
      >
        {icon}
      </button>

      {/* Tooltip */}
      <div
        style={{
          ...styles.compactTooltip,
          ...(isHovered ? styles.compactTooltipVisible : {}),
        }}
      >
        {tooltipText}
      </div>
    </div>
  );
}

// ============================================================================
// Normal Mode Component
// ============================================================================

function NormalToggle({
  mode,
  onModeChange,
}: Omit<ViewModeToggleProps, 'compact'>): React.ReactElement {
  return (
    <div style={styles.container}>
      <button
        onClick={() => onModeChange('player')}
        style={{
          ...styles.button,
          ...(mode === 'player' ? styles.buttonActive : {}),
        }}
        onMouseEnter={(e) => {
          if (mode !== 'player') {
            e.currentTarget.style.backgroundColor = 'rgba(75, 85, 99, 0.3)';
            e.currentTarget.style.color = 'rgba(209, 213, 219, 0.9)';
          }
        }}
        onMouseLeave={(e) => {
          if (mode !== 'player') {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.color = 'rgba(156, 163, 175, 0.8)';
          }
        }}
      >
        Player View
      </button>
      <button
        onClick={() => onModeChange('debug')}
        style={{
          ...styles.button,
          ...styles.buttonDivider,
          ...(mode === 'debug' ? styles.buttonActive : {}),
        }}
        onMouseEnter={(e) => {
          if (mode !== 'debug') {
            e.currentTarget.style.backgroundColor = 'rgba(75, 85, 99, 0.3)';
            e.currentTarget.style.color = 'rgba(209, 213, 219, 0.9)';
          }
        }}
        onMouseLeave={(e) => {
          if (mode !== 'debug') {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.color = 'rgba(156, 163, 175, 0.8)';
          }
        }}
      >
        Debug View
      </button>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function ViewModeToggle({
  mode,
  onModeChange,
  compact = false,
}: ViewModeToggleProps): React.ReactElement {
  if (compact) {
    return <CompactToggle mode={mode} onModeChange={onModeChange} />;
  }

  return <NormalToggle mode={mode} onModeChange={onModeChange} />;
}

export default ViewModeToggle;
