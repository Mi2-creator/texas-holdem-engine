/**
 * InsightDrawer.tsx
 * Phase 9.2 - Drawer panel for Phase 6-8 insights
 * Phase 9.3 - Uses player language adapter for all content
 *
 * A slide-in drawer that provides access to:
 * - Phase 6: Coach hints (real-time tips)
 * - Phase 7: Hand review (post-hand analysis)
 * - Phase 8: Learning insights (cross-hand patterns)
 *
 * Design principles:
 * - Non-modal (doesn't block table view)
 * - Tabbed interface for organization
 * - Player-friendly language (via playerLanguage adapter)
 * - Can be dismissed easily
 */

import React, { useState, useCallback } from 'react';
import type { CoachHint } from '../controllers/CoachHintEngine';
import type { ReviewInsight } from '../controllers/ReviewInsightEngine';
import type { HandHistory, LearningProfile } from '../controllers/LearningProfileEngine';
import { CoachHintPanel } from './CoachHintPanel';
import { ReviewPanel } from './ReviewPanel';
import { LearningPanel } from './LearningPanel';

// ============================================================================
// Types
// ============================================================================

type InsightTab = 'tips' | 'review' | 'patterns';

interface InsightDrawerProps {
  /** Whether the drawer is open */
  readonly isOpen: boolean;
  /** Callback to close the drawer */
  readonly onClose: () => void;
  /** Phase 6: Coach hints */
  readonly coachHints?: readonly CoachHint[];
  /** Phase 7: Review insight */
  readonly reviewInsight?: ReviewInsight;
  /** Phase 8: Hand histories for learning */
  readonly handHistories?: readonly HandHistory[];
  /** Hero seat for learning profile */
  readonly heroSeat?: number;
  /** Whether hand is complete (enables review tab) */
  readonly isHandComplete?: boolean;
  /** Whether learning is enabled */
  readonly enableLearning?: boolean;
}

// ============================================================================
// Styles
// ============================================================================

const styles = {
  overlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    zIndex: 100,
    opacity: 0,
    pointerEvents: 'none' as const,
    transition: 'opacity 0.2s ease',
  } as const,

  overlayVisible: {
    opacity: 1,
    pointerEvents: 'auto' as const,
  } as const,

  drawer: {
    position: 'fixed' as const,
    top: 0,
    right: 0,
    width: '380px',
    maxWidth: '90vw',
    height: '100vh',
    backgroundColor: 'rgba(15, 15, 20, 0.98)',
    borderLeft: '1px solid rgba(75, 85, 99, 0.3)',
    boxShadow: '-8px 0 32px rgba(0, 0, 0, 0.4)',
    zIndex: 101,
    display: 'flex',
    flexDirection: 'column' as const,
    transform: 'translateX(100%)',
    transition: 'transform 0.25s ease',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  } as const,

  drawerOpen: {
    transform: 'translateX(0)',
  } as const,

  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    borderBottom: '1px solid rgba(75, 85, 99, 0.3)',
  } as const,

  title: {
    fontSize: '14px',
    fontWeight: 600,
    color: 'rgba(209, 213, 219, 0.95)',
    letterSpacing: '0.3px',
  } as const,

  closeButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: 'rgba(75, 85, 99, 0.3)',
    color: 'rgba(156, 163, 175, 0.9)',
    fontSize: '14px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  } as const,

  tabs: {
    display: 'flex',
    borderBottom: '1px solid rgba(75, 85, 99, 0.3)',
    padding: '0 12px',
  } as const,

  tab: {
    flex: 1,
    padding: '12px 8px',
    border: 'none',
    backgroundColor: 'transparent',
    color: 'rgba(156, 163, 175, 0.7)',
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
    borderBottom: '2px solid transparent',
    transition: 'all 0.15s ease',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
  } as const,

  tabActive: {
    color: 'rgba(209, 213, 219, 0.95)',
    borderBottomColor: 'rgba(99, 102, 241, 0.8)',
  } as const,

  tabDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
  } as const,

  tabBadge: {
    padding: '2px 6px',
    borderRadius: '8px',
    fontSize: '10px',
    fontWeight: 600,
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
    color: 'rgba(129, 140, 248, 0.9)',
  } as const,

  content: {
    flex: 1,
    overflow: 'auto',
    padding: '16px',
  } as const,

  emptyState: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    height: '200px',
    textAlign: 'center' as const,
    color: 'rgba(107, 114, 128, 0.7)',
  } as const,

  emptyIcon: {
    fontSize: '32px',
    marginBottom: '12px',
    opacity: 0.5,
  } as const,

  emptyText: {
    fontSize: '12px',
    lineHeight: '18px',
  } as const,
} as const;

// ============================================================================
// Tab Configuration
// ============================================================================

interface TabConfig {
  id: InsightTab;
  label: string;
  icon: string;
  playerLabel: string; // Player-friendly label
}

const TAB_CONFIG: readonly TabConfig[] = [
  { id: 'tips', label: 'Tips', icon: '💡', playerLabel: 'Tips' },
  { id: 'review', label: 'Review', icon: '📋', playerLabel: 'This Hand' },
  { id: 'patterns', label: 'Patterns', icon: '📊', playerLabel: 'My Style' },
];

// ============================================================================
// Sub-Components
// ============================================================================

interface TabButtonProps {
  readonly config: TabConfig;
  readonly isActive: boolean;
  readonly isDisabled: boolean;
  readonly badge?: number;
  readonly onClick: () => void;
}

function TabButton({
  config,
  isActive,
  isDisabled,
  badge,
  onClick,
}: TabButtonProps): React.ReactElement {
  const style = {
    ...styles.tab,
    ...(isActive ? styles.tabActive : {}),
    ...(isDisabled ? styles.tabDisabled : {}),
  };

  return (
    <button
      style={style}
      onClick={isDisabled ? undefined : onClick}
      disabled={isDisabled}
      aria-selected={isActive}
      role="tab"
    >
      <span>{config.icon}</span>
      <span>{config.playerLabel}</span>
      {badge !== undefined && badge > 0 && (
        <span style={styles.tabBadge}>{badge}</span>
      )}
    </button>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function InsightDrawer({
  isOpen,
  onClose,
  coachHints = [],
  reviewInsight,
  handHistories = [],
  heroSeat = 0,
  isHandComplete = false,
  enableLearning = false,
}: InsightDrawerProps): React.ReactElement {
  const [activeTab, setActiveTab] = useState<InsightTab>('tips');

  // Determine tab availability
  const isReviewAvailable = isHandComplete && reviewInsight?.isAvailable;
  const isLearningAvailable = enableLearning && handHistories.length >= 2;

  // Handle tab change
  const handleTabChange = useCallback((tab: InsightTab) => {
    setActiveTab(tab);
  }, []);

  // Get badge counts
  const getBadge = (tab: InsightTab): number | undefined => {
    switch (tab) {
      case 'tips':
        return coachHints.length > 0 ? coachHints.length : undefined;
      case 'review':
        return reviewInsight?.keyDecisions?.length;
      case 'patterns':
        return handHistories.length >= 2 ? handHistories.length : undefined;
      default:
        return undefined;
    }
  };

  // Check if tab is disabled
  const isTabDisabled = (tab: InsightTab): boolean => {
    switch (tab) {
      case 'review':
        return !isReviewAvailable;
      case 'patterns':
        return !isLearningAvailable;
      default:
        return false;
    }
  };

  // Render tab content
  const renderContent = (): React.ReactNode => {
    switch (activeTab) {
      case 'tips':
        return coachHints.length > 0 ? (
          <CoachHintPanel hints={coachHints} collapsed={false} />
        ) : (
          <div style={styles.emptyState}>
            <div style={styles.emptyIcon}>💡</div>
            <div style={styles.emptyText}>
              No tips right now.<br />
              Tips appear during key moments.
            </div>
          </div>
        );

      case 'review':
        return isReviewAvailable && reviewInsight ? (
          <ReviewPanel insight={reviewInsight} collapsed={false} compact={false} usePlayerLanguage={true} />
        ) : (
          <div style={styles.emptyState}>
            <div style={styles.emptyIcon}>📋</div>
            <div style={styles.emptyText}>
              Hand review available<br />
              after the hand ends.
            </div>
          </div>
        );

      case 'patterns':
        return isLearningAvailable ? (
          <LearningPanel
            handHistories={handHistories}
            heroSeat={heroSeat}
            collapsed={false}
            compact={false}
            usePlayerLanguage={true}
          />
        ) : (
          <div style={styles.emptyState}>
            <div style={styles.emptyIcon}>📊</div>
            <div style={styles.emptyText}>
              Play more hands to see<br />
              your tendencies.
              {handHistories.length === 1 && (
                <><br /><br />1 hand so far. Need at least 2.</>
              )}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <>
      {/* Overlay */}
      <div
        style={{
          ...styles.overlay,
          ...(isOpen ? styles.overlayVisible : {}),
        }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        style={{
          ...styles.drawer,
          ...(isOpen ? styles.drawerOpen : {}),
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Insights"
      >
        {/* Header */}
        <div style={styles.header}>
          <span style={styles.title}>Insights</span>
          <button
            style={styles.closeButton}
            onClick={onClose}
            aria-label="Close"
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(75, 85, 99, 0.5)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(75, 85, 99, 0.3)';
            }}
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div style={styles.tabs} role="tablist">
          {TAB_CONFIG.map((config) => (
            <TabButton
              key={config.id}
              config={config}
              isActive={activeTab === config.id}
              isDisabled={isTabDisabled(config.id)}
              badge={getBadge(config.id)}
              onClick={() => handleTabChange(config.id)}
            />
          ))}
        </div>

        {/* Content */}
        <div style={styles.content} role="tabpanel">
          {renderContent()}
        </div>
      </div>
    </>
  );
}

export default InsightDrawer;
