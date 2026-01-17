/**
 * PlayerShell.tsx
 * Phase 9.1 - Main container for Player Mode
 * Phase 9.2 - Integrated Insight Access (InsightTrigger + InsightDrawer)
 * Phase 9.4 - Integrated HandEndCard
 * Phase 9.5 - Integrated compact ModeSwitcher
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

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import type { ReplayViewModel, PlayerActions } from '../types/replay';
import type { ViewModeResult } from '../controllers/ViewModeController';
import type { CoachHint } from '../controllers/CoachHintEngine';
import type { ReviewInsight } from '../controllers/ReviewInsightEngine';
import type { HandHistory } from '../controllers/LearningProfileEngine';
import { PlayerControlBar } from './PlayerControlBar';
import { InsightTrigger } from './InsightTrigger';
import { InsightDrawer } from './InsightDrawer';
import { HandEndCard } from './HandEndCard';
import { ViewModeToggle, type ViewMode } from './ViewModeToggle';

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
  /** Optional: show hand complete badge in control bar */
  readonly showHandCompleteBadge?: boolean;
  // ============================================================================
  // Phase 9.2: Insight Access Props
  // ============================================================================
  /** Phase 6: Coach hints */
  readonly coachHints?: readonly CoachHint[];
  /** Phase 7: Review insight */
  readonly reviewInsight?: ReviewInsight;
  /** Phase 8: Hand histories for learning */
  readonly handHistories?: readonly HandHistory[];
  /** Whether learning is enabled */
  readonly enableLearning?: boolean;
  // ============================================================================
  // Phase 9.4: HandEndCard Props
  // ============================================================================
  /** Current pot total for hand end display */
  readonly potTotal?: number;
  /** Whether to show hand end card (default true) */
  readonly showHandEndCard?: boolean;
  // ============================================================================
  // Phase 9.5: Mode Switcher Props
  // ============================================================================
  /** Current view mode */
  readonly viewMode?: ViewMode;
  /** Callback when view mode changes */
  readonly onViewModeChange?: (mode: ViewMode) => void;
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

  // Phase 9.5: Mode switcher in top-left corner
  modeSwitcherContainer: {
    position: 'absolute' as const,
    top: '20px',
    left: '20px',
    zIndex: 10,
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
  showHandCompleteBadge = true,
  // Phase 9.2: Insight props
  coachHints = [],
  reviewInsight,
  handHistories = [],
  enableLearning = false,
  // Phase 9.4: HandEndCard props
  potTotal,
  showHandEndCard = true,
  // Phase 9.5: Mode switcher props
  viewMode,
  onViewModeChange,
}: PlayerShellProps): React.ReactElement {
  const { snapshot } = viewModel;
  const street = snapshot.street || snapshot.phase;
  const isHandOver = snapshot.isHandOver;

  // ============================================================================
  // Phase 9.2: Insight Drawer State
  // ============================================================================
  const [isInsightDrawerOpen, setIsInsightDrawerOpen] = useState(false);

  const toggleInsightDrawer = useCallback(() => {
    setIsInsightDrawerOpen(prev => !prev);
  }, []);

  const closeInsightDrawer = useCallback(() => {
    setIsInsightDrawerOpen(false);
  }, []);

  const openInsightDrawerToReview = useCallback(() => {
    setIsInsightDrawerOpen(true);
  }, []);

  // ============================================================================
  // Phase 9.4: HandEndCard State
  // ============================================================================
  const [isHandEndCardVisible, setIsHandEndCardVisible] = useState(false);
  const prevIsHandOverRef = useRef(isHandOver);

  // Show HandEndCard when hand transitions to over state
  useEffect(() => {
    if (isHandOver && !prevIsHandOverRef.current && showHandEndCard) {
      setIsHandEndCardVisible(true);
    }
    prevIsHandOverRef.current = isHandOver;
  }, [isHandOver, showHandEndCard]);

  // Reset HandEndCard when hand changes (new hand starts)
  useEffect(() => {
    if (!isHandOver) {
      setIsHandEndCardVisible(false);
    }
  }, [isHandOver]);

  const dismissHandEndCard = useCallback(() => {
    setIsHandEndCardVisible(false);
  }, []);

  const handleReviewFromCard = useCallback(() => {
    openInsightDrawerToReview();
  }, [openInsightDrawerToReview]);

  // Calculate if there are any insights available
  const hasInsights = useMemo(() => {
    const hasHints = coachHints.length > 0;
    const hasReview = isHandOver && reviewInsight?.isAvailable;
    const hasLearning = enableLearning && handHistories.length >= 2;
    return hasHints || hasReview || hasLearning;
  }, [coachHints, isHandOver, reviewInsight, enableLearning, handHistories]);

  // Count total insights for badge
  const insightCount = useMemo(() => {
    let count = coachHints.length;
    if (isHandOver && reviewInsight?.keyDecisions) {
      count += reviewInsight.keyDecisions.length;
    }
    return count;
  }, [coachHints, isHandOver, reviewInsight]);

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

          {/* Phase 9.5: Compact Mode Switcher (top-left) */}
          {viewMode && onViewModeChange && (
            <div style={styles.modeSwitcherContainer}>
              <ViewModeToggle
                mode={viewMode}
                onModeChange={onViewModeChange}
                compact={true}
              />
            </div>
          )}

          {/* Phase 9.2: Insight Trigger (bottom-right) */}
          <div style={styles.insightTriggerContainer}>
            <InsightTrigger
              hasInsights={hasInsights}
              insightCount={insightCount}
              isOpen={isInsightDrawerOpen}
              onClick={toggleInsightDrawer}
            />
          </div>
        </div>

        {/* Phase 9.4: Hand End Card */}
        <HandEndCard
          isVisible={isHandEndCardVisible}
          handEndReason={snapshot.handEndReason}
          potTotal={potTotal}
          patternSummary={reviewInsight?.patterns}
          onDismiss={dismissHandEndCard}
          onReviewClick={handleReviewFromCard}
        />
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

      {/* Phase 9.2: Insight Drawer */}
      <InsightDrawer
        isOpen={isInsightDrawerOpen}
        onClose={closeInsightDrawer}
        coachHints={coachHints}
        reviewInsight={reviewInsight}
        handHistories={handHistories}
        heroSeat={heroSeat}
        isHandComplete={isHandOver}
        enableLearning={enableLearning}
      />
    </div>
  );
}

export default PlayerShell;
