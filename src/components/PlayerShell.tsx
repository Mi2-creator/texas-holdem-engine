/**
 * PlayerShell.tsx
 * Phase 9.1 - Main container for Player Mode
 *
 * Design principles:
 * - Table is the primary visual focus (70%+ visual weight)
 * - Minimal, non-intrusive UI
 * - Player-friendly experience
 * - Progressive disclosure (details available but not forced)
 *
 * This component wraps the poker table and provides simplified
 * player-oriented controls, hiding technical details by default.
 */

import React from 'react';
import type { ReplayViewModel, PlayerActions } from '../types/replay';
import type { ViewModeResult } from '../controllers/ViewModeController';
import { PlayerControlBar } from './PlayerControlBar';

// ============================================================================
// Types
// ============================================================================

interface PlayerShellProps {
  /** Replay view model */
  readonly viewModel: ReplayViewModel;
  /** Replay actions */
  readonly actions: PlayerActions;
  /** View mode result from ViewModeController */
  readonly viewModeResult: ViewModeResult;
  /** Hero seat number */
  readonly heroSeat: number;
  /** Table content to render */
  readonly tableContent: React.ReactNode;
  /** Optional: insight trigger content (Phase 9.2) */
  readonly insightTrigger?: React.ReactNode;
  /** Optional: hand end card content (Phase 9.4) */
  readonly handEndCard?: React.ReactNode;
  /** Optional: callback when insight is requested */
  readonly onInsightRequest?: () => void;
  /** Optional: show hand complete badge in control bar */
  readonly showHandCompleteBadge?: boolean;
}

// ============================================================================
// Styles
// ============================================================================

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '20px',
    padding: '20px',
    minHeight: '100vh',
    backgroundColor: '#0a0a0f',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  } as const,

  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    maxWidth: '900px',
  } as const,

  title: {
    fontSize: '14px',
    fontWeight: 600,
    color: 'rgba(156, 163, 175, 0.8)',
    letterSpacing: '1px',
    textTransform: 'uppercase' as const,
  } as const,

  tableSection: {
    position: 'relative' as const,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    maxWidth: '900px',
    flex: 1,
  } as const,

  tableWrapper: {
    position: 'relative' as const,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  } as const,

  insightTriggerContainer: {
    position: 'absolute' as const,
    bottom: '20px',
    right: '20px',
    zIndex: 10,
  } as const,

  handEndCardContainer: {
    position: 'absolute' as const,
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    zIndex: 20,
  } as const,

  controlSection: {
    width: '100%',
    maxWidth: '600px',
  } as const,

  phaseIndicator: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    marginBottom: '8px',
  } as const,

  phaseBadge: {
    padding: '4px 12px',
    borderRadius: '12px',
    fontSize: '11px',
    fontWeight: 600,
    backgroundColor: 'rgba(75, 85, 99, 0.3)',
    color: 'rgba(156, 163, 175, 0.9)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  } as const,

  streetBadge: {
    padding: '4px 12px',
    borderRadius: '12px',
    fontSize: '11px',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  } as const,
} as const;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get street display name (player-friendly)
 */
function getStreetDisplayName(street: string | undefined): string {
  if (!street) return '';
  switch (street.toUpperCase()) {
    case 'PREFLOP': return 'Pre-flop';
    case 'FLOP': return 'Flop';
    case 'TURN': return 'Turn';
    case 'RIVER': return 'River';
    case 'SHOWDOWN': return 'Showdown';
    default: return street;
  }
}

/**
 * Get street badge color
 */
function getStreetBadgeStyle(street: string | undefined): React.CSSProperties {
  const baseStyle = { ...styles.streetBadge };

  switch (street?.toUpperCase()) {
    case 'PREFLOP':
      return {
        ...baseStyle,
        backgroundColor: 'rgba(107, 114, 128, 0.3)',
        color: 'rgba(156, 163, 175, 0.9)',
      };
    case 'FLOP':
      return {
        ...baseStyle,
        backgroundColor: 'rgba(34, 197, 94, 0.2)',
        color: '#22c55e',
      };
    case 'TURN':
      return {
        ...baseStyle,
        backgroundColor: 'rgba(234, 179, 8, 0.2)',
        color: '#eab308',
      };
    case 'RIVER':
      return {
        ...baseStyle,
        backgroundColor: 'rgba(239, 68, 68, 0.2)',
        color: '#ef4444',
      };
    case 'SHOWDOWN':
      return {
        ...baseStyle,
        backgroundColor: 'rgba(168, 85, 247, 0.2)',
        color: '#a855f7',
      };
    default:
      return baseStyle;
  }
}

// ============================================================================
// Main Component
// ============================================================================

export function PlayerShell({
  viewModel,
  actions,
  viewModeResult,
  heroSeat,
  tableContent,
  insightTrigger,
  handEndCard,
  onInsightRequest,
  showHandCompleteBadge = true,
}: PlayerShellProps): React.ReactElement {
  const { snapshot } = viewModel;
  const street = snapshot.street || snapshot.phase;
  const isHandOver = snapshot.isHandOver;

  return (
    <div style={styles.container}>
      {/* Phase/Street Indicator */}
      <div style={styles.phaseIndicator}>
        {street && (
          <span style={getStreetBadgeStyle(street)}>
            {getStreetDisplayName(street)}
          </span>
        )}
        {viewModeResult.contextBar.isHeroTurn && !isHandOver && (
          <span
            style={{
              ...styles.phaseBadge,
              backgroundColor: 'rgba(6, 182, 212, 0.2)',
              color: '#06b6d4',
              animation: 'pulse 2s infinite',
            }}
          >
            Your Turn
          </span>
        )}
      </div>

      {/* Table Section - Primary Visual Focus */}
      <div style={styles.tableSection}>
        <div style={styles.tableWrapper}>
          {tableContent}

          {/* Insight Trigger (Phase 9.2 slot) */}
          {insightTrigger && (
            <div style={styles.insightTriggerContainer}>
              {insightTrigger}
            </div>
          )}
        </div>

        {/* Hand End Card (Phase 9.4 slot) */}
        {handEndCard && isHandOver && (
          <div style={styles.handEndCardContainer}>
            {handEndCard}
          </div>
        )}
      </div>

      {/* Control Section */}
      <div style={styles.controlSection}>
        <PlayerControlBar
          currentIndex={viewModel.index}
          totalEvents={viewModel.count}
          isPlaying={viewModel.playing}
          canPrev={viewModel.canPrev}
          canNext={viewModel.canNext}
          isAtStart={viewModel.isAtStart}
          isAtEnd={viewModel.isAtEnd}
          onPrev={actions.stepBackward}
          onNext={actions.stepForward}
          onPlayPause={actions.togglePlayPause}
          onSeek={actions.seek}
          showHandComplete={showHandCompleteBadge && isHandOver}
        />
      </div>

      {/* CSS Animation for pulse effect */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
      `}</style>
    </div>
  );
}

export default PlayerShell;
