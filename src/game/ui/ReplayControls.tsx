/**
 * ReplayControls.tsx
 * Phase L10 - Hand replay controls
 *
 * Provides step-through replay of hand history events.
 * No engine changes - purely visual replay using HandHistory events.
 */

import React, { useEffect, useRef, useCallback } from 'react';

// ============================================================================
// Types
// ============================================================================

export type ReplaySpeed = 'slow' | 'normal' | 'fast';

export interface ReplayState {
  readonly isReplaying: boolean;
  readonly isPlaying: boolean; // auto-play mode
  readonly currentIndex: number;
  readonly speed: ReplaySpeed;
}

interface ReplayControlsProps {
  readonly totalEvents: number;
  readonly replayState: ReplayState;
  readonly onStepBackward: () => void;
  readonly onStepForward: () => void;
  readonly onPlay: () => void;
  readonly onPause: () => void;
  readonly onReset: () => void;
  readonly onSpeedChange: (speed: ReplaySpeed) => void;
  readonly onStartReplay: () => void;
  readonly onExitReplay: () => void;
}

// ============================================================================
// Styles
// ============================================================================

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
    padding: '12px 16px',
    borderRadius: '8px',
    backgroundColor: 'rgba(30, 30, 40, 0.8)',
    border: '1px solid rgba(99, 102, 241, 0.3)',
  },

  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  title: {
    fontSize: '11px',
    fontWeight: 600,
    color: 'rgba(156, 163, 175, 0.7)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },

  exitButton: {
    padding: '4px 8px',
    borderRadius: '4px',
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    color: '#ef4444',
    fontSize: '10px',
    fontWeight: 500,
    cursor: 'pointer',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    transition: 'all 0.15s ease',
  },

  controls: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },

  controlButton: {
    width: '32px',
    height: '32px',
    borderRadius: '6px',
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
    color: '#a5b4fc',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    border: '1px solid rgba(99, 102, 241, 0.3)',
    transition: 'all 0.15s ease',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },

  controlButtonDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
  },

  playPauseButton: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
    color: '#22c55e',
    fontSize: '16px',
    fontWeight: 600,
    cursor: 'pointer',
    border: '2px solid rgba(34, 197, 94, 0.4)',
    transition: 'all 0.15s ease',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },

  progress: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flex: 1,
    marginLeft: '8px',
  },

  progressBar: {
    flex: 1,
    height: '4px',
    borderRadius: '2px',
    backgroundColor: 'rgba(75, 85, 99, 0.4)',
    overflow: 'hidden',
  },

  progressFill: {
    height: '100%',
    backgroundColor: '#6366f1',
    transition: 'width 0.2s ease',
  },

  progressText: {
    fontSize: '11px',
    color: 'rgba(156, 163, 175, 0.8)',
    minWidth: '60px',
    textAlign: 'right' as const,
  },

  speedControls: {
    display: 'flex',
    gap: '4px',
    marginLeft: '8px',
  },

  speedButton: {
    padding: '4px 8px',
    borderRadius: '4px',
    backgroundColor: 'rgba(75, 85, 99, 0.2)',
    color: 'rgba(156, 163, 175, 0.8)',
    fontSize: '10px',
    fontWeight: 500,
    cursor: 'pointer',
    border: '1px solid rgba(75, 85, 99, 0.3)',
    transition: 'all 0.15s ease',
  },

  speedButtonActive: {
    backgroundColor: 'rgba(99, 102, 241, 0.3)',
    color: '#a5b4fc',
    borderColor: 'rgba(99, 102, 241, 0.5)',
  },

  startReplayButton: {
    padding: '8px 16px',
    borderRadius: '6px',
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
    color: '#a5b4fc',
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
    border: '1px solid rgba(99, 102, 241, 0.3)',
    transition: 'all 0.15s ease',
  },
};

// ============================================================================
// Speed Helpers
// ============================================================================

export const REPLAY_SPEEDS: Record<ReplaySpeed, number> = {
  slow: 1500,
  normal: 800,
  fast: 300,
};

// ============================================================================
// Initial State
// ============================================================================

export function createInitialReplayState(): ReplayState {
  return {
    isReplaying: false,
    isPlaying: false,
    currentIndex: -1,
    speed: 'normal',
  };
}

// ============================================================================
// Main Component
// ============================================================================

export function ReplayControls({
  totalEvents,
  replayState,
  onStepBackward,
  onStepForward,
  onPlay,
  onPause,
  onReset,
  onSpeedChange,
  onStartReplay,
  onExitReplay,
}: ReplayControlsProps): React.ReactElement {
  const { isReplaying, isPlaying, currentIndex, speed } = replayState;

  // Auto-play interval
  const intervalRef = useRef<number | null>(null);

  // Handle auto-play
  useEffect(() => {
    if (isPlaying && isReplaying) {
      intervalRef.current = window.setInterval(() => {
        onStepForward();
      }, REPLAY_SPEEDS[speed]);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isPlaying, isReplaying, speed, onStepForward]);

  // Stop auto-play when reaching the end
  useEffect(() => {
    if (currentIndex >= totalEvents - 1 && isPlaying) {
      onPause();
    }
  }, [currentIndex, totalEvents, isPlaying, onPause]);

  const canStepBackward = isReplaying && currentIndex > -1;
  const canStepForward = isReplaying && currentIndex < totalEvents - 1;
  const progress = totalEvents > 0 ? ((currentIndex + 1) / totalEvents) * 100 : 0;

  // Not in replay mode - show start button
  if (!isReplaying) {
    return (
      <button
        style={styles.startReplayButton}
        onClick={onStartReplay}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = 'rgba(99, 102, 241, 0.35)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'rgba(99, 102, 241, 0.2)';
        }}
      >
        Replay Hand
      </button>
    );
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <span style={styles.title}>Replay Mode</span>
        <button
          style={styles.exitButton}
          onClick={onExitReplay}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.35)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.2)';
          }}
        >
          Exit
        </button>
      </div>

      {/* Controls */}
      <div style={styles.controls}>
        {/* Reset */}
        <button
          style={{
            ...styles.controlButton,
            ...(currentIndex <= -1 ? styles.controlButtonDisabled : {}),
          }}
          onClick={onReset}
          disabled={currentIndex <= -1}
          title="Reset to start"
        >
          ⏮
        </button>

        {/* Step Backward */}
        <button
          style={{
            ...styles.controlButton,
            ...(!canStepBackward ? styles.controlButtonDisabled : {}),
          }}
          onClick={onStepBackward}
          disabled={!canStepBackward}
          title="Previous event"
        >
          ◀
        </button>

        {/* Play/Pause */}
        <button
          style={{
            ...styles.playPauseButton,
            ...(currentIndex >= totalEvents - 1 ? styles.controlButtonDisabled : {}),
          }}
          onClick={isPlaying ? onPause : onPlay}
          disabled={currentIndex >= totalEvents - 1}
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? '⏸' : '▶'}
        </button>

        {/* Step Forward */}
        <button
          style={{
            ...styles.controlButton,
            ...(!canStepForward ? styles.controlButtonDisabled : {}),
          }}
          onClick={onStepForward}
          disabled={!canStepForward}
          title="Next event"
        >
          ▶
        </button>

        {/* Progress */}
        <div style={styles.progress}>
          <div style={styles.progressBar}>
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

        {/* Speed Controls */}
        <div style={styles.speedControls}>
          {(['slow', 'normal', 'fast'] as ReplaySpeed[]).map((s) => (
            <button
              key={s}
              style={{
                ...styles.speedButton,
                ...(speed === s ? styles.speedButtonActive : {}),
              }}
              onClick={() => onSpeedChange(s)}
              title={`${s} speed`}
            >
              {s === 'slow' ? '0.5x' : s === 'normal' ? '1x' : '2x'}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default ReplayControls;
