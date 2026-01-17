/**
 * PlayerControlBar.tsx
 * Phase 9.1 - Simplified control bar for Player Mode
 *
 * Design principles:
 * - Minimal, non-intrusive controls
 * - Player-friendly (no technical jargon)
 * - Focus on basic replay navigation
 * - Clean visual design that doesn't distract from the table
 */

import React, { useCallback } from 'react';

// ============================================================================
// Types
// ============================================================================

interface PlayerControlBarProps {
  /** Current event index */
  readonly currentIndex: number;
  /** Total number of events */
  readonly totalEvents: number;
  /** Whether currently playing */
  readonly isPlaying: boolean;
  /** Whether can go to previous */
  readonly canPrev: boolean;
  /** Whether can go to next */
  readonly canNext: boolean;
  /** Whether at the start */
  readonly isAtStart: boolean;
  /** Whether at the end (hand complete) */
  readonly isAtEnd: boolean;
  /** Callback for previous */
  readonly onPrev: () => void;
  /** Callback for next */
  readonly onNext: () => void;
  /** Callback for play/pause toggle */
  readonly onPlayPause: () => void;
  /** Callback for seek */
  readonly onSeek: (index: number) => void;
  /** Optional: show expanded state indicator */
  readonly showHandComplete?: boolean;
}

// ============================================================================
// Styles
// ============================================================================

const styles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '16px',
    padding: '12px 20px',
    backgroundColor: 'rgba(15, 15, 20, 0.9)',
    borderRadius: '12px',
    border: '1px solid rgba(75, 85, 99, 0.3)',
    backdropFilter: 'blur(8px)',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  } as const,

  controlGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  } as const,

  button: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '40px',
    height: '40px',
    borderRadius: '10px',
    border: 'none',
    cursor: 'pointer',
    fontSize: '16px',
    transition: 'all 0.15s ease',
    backgroundColor: 'rgba(55, 65, 81, 0.5)',
    color: 'rgba(209, 213, 219, 0.9)',
  } as const,

  buttonDisabled: {
    opacity: 0.3,
    cursor: 'not-allowed',
  } as const,

  playButton: {
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    backgroundColor: 'rgba(99, 102, 241, 0.8)',
    color: '#fff',
    fontSize: '18px',
  } as const,

  progressSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    minWidth: '200px',
  } as const,

  progressBar: {
    flex: 1,
    height: '6px',
    backgroundColor: 'rgba(75, 85, 99, 0.4)',
    borderRadius: '3px',
    overflow: 'hidden',
    cursor: 'pointer',
    position: 'relative' as const,
  } as const,

  progressFill: {
    height: '100%',
    backgroundColor: 'rgba(99, 102, 241, 0.8)',
    borderRadius: '3px',
    transition: 'width 0.15s ease',
  } as const,

  progressText: {
    fontSize: '12px',
    color: 'rgba(156, 163, 175, 0.8)',
    fontWeight: 500,
    minWidth: '50px',
    textAlign: 'right' as const,
    fontVariantNumeric: 'tabular-nums',
  } as const,

  handCompleteBadge: {
    padding: '4px 10px',
    borderRadius: '12px',
    fontSize: '11px',
    fontWeight: 600,
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    color: '#22c55e',
    border: '1px solid rgba(34, 197, 94, 0.3)',
  } as const,
} as const;

// ============================================================================
// Sub-Components
// ============================================================================

interface ControlButtonProps {
  readonly icon: string;
  readonly onClick: () => void;
  readonly disabled?: boolean;
  readonly isPlay?: boolean;
  readonly ariaLabel: string;
}

function ControlButton({
  icon,
  onClick,
  disabled = false,
  isPlay = false,
  ariaLabel,
}: ControlButtonProps): React.ReactElement {
  const baseStyle = isPlay
    ? { ...styles.button, ...styles.playButton }
    : styles.button;

  const finalStyle = disabled
    ? { ...baseStyle, ...styles.buttonDisabled }
    : baseStyle;

  return (
    <button
      style={finalStyle}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.backgroundColor = isPlay
            ? 'rgba(99, 102, 241, 1)'
            : 'rgba(75, 85, 99, 0.7)';
          e.currentTarget.style.transform = 'scale(1.05)';
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = isPlay
          ? 'rgba(99, 102, 241, 0.8)'
          : 'rgba(55, 65, 81, 0.5)';
        e.currentTarget.style.transform = 'scale(1)';
      }}
    >
      {icon}
    </button>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function PlayerControlBar({
  currentIndex,
  totalEvents,
  isPlaying,
  canPrev,
  canNext,
  isAtStart,
  isAtEnd,
  onPrev,
  onNext,
  onPlayPause,
  onSeek,
  showHandComplete = false,
}: PlayerControlBarProps): React.ReactElement {
  // Calculate progress percentage
  const progress = totalEvents > 0
    ? (currentIndex / Math.max(1, totalEvents - 1)) * 100
    : 0;

  // Handle progress bar click
  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    const newIndex = Math.round(percentage * (totalEvents - 1));
    onSeek(Math.max(0, Math.min(totalEvents - 1, newIndex)));
  }, [totalEvents, onSeek]);

  return (
    <div style={styles.container}>
      {/* Navigation Controls */}
      <div style={styles.controlGroup}>
        <ControlButton
          icon="⏮"
          onClick={onPrev}
          disabled={!canPrev}
          ariaLabel="Previous"
        />

        <ControlButton
          icon={isPlaying ? '⏸' : '▶'}
          onClick={onPlayPause}
          isPlay={true}
          ariaLabel={isPlaying ? 'Pause' : 'Play'}
        />

        <ControlButton
          icon="⏭"
          onClick={onNext}
          disabled={!canNext}
          ariaLabel="Next"
        />
      </div>

      {/* Progress Section */}
      <div style={styles.progressSection}>
        <div
          style={styles.progressBar}
          onClick={handleProgressClick}
          role="slider"
          aria-label="Progress"
          aria-valuenow={currentIndex}
          aria-valuemin={0}
          aria-valuemax={totalEvents - 1}
          tabIndex={0}
        >
          <div
            style={{
              ...styles.progressFill,
              width: `${progress}%`,
            }}
          />
        </div>
        <span style={styles.progressText}>
          {currentIndex + 1} / {totalEvents}
        </span>
      </div>

      {/* Hand Complete Badge */}
      {showHandComplete && isAtEnd && (
        <span style={styles.handCompleteBadge}>
          Hand Complete
        </span>
      )}
    </div>
  );
}

export default PlayerControlBar;
