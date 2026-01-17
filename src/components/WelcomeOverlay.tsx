/**
 * WelcomeOverlay.tsx
 * Phase 9.6 - Welcome overlay for first-time Player Mode users
 *
 * A brief, non-intrusive overlay that introduces the Player Mode UI.
 * Shows once on first visit, can be dismissed permanently.
 *
 * Design principles:
 * - Descriptive only (no tutorials, no instructions)
 * - Quick to dismiss
 * - Respects "don't show again" preference
 * - Dark theme consistent with Player Mode
 */

import React, { useState, useCallback } from 'react';

// ============================================================================
// Types
// ============================================================================

interface WelcomeOverlayProps {
  /** Whether the overlay is visible */
  readonly isVisible: boolean;
  /** Callback when overlay is dismissed */
  readonly onDismiss: () => void;
  /** Callback when "don't show again" is selected */
  readonly onDontShowAgain: () => void;
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
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    zIndex: 200,
    opacity: 0,
    transition: 'opacity 0.3s ease',
    pointerEvents: 'none' as const,
  } as const,

  overlayVisible: {
    opacity: 1,
    pointerEvents: 'auto' as const,
  } as const,

  card: {
    backgroundColor: 'rgba(20, 20, 28, 0.98)',
    borderRadius: '16px',
    border: '1px solid rgba(99, 102, 241, 0.3)',
    boxShadow: '0 12px 48px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05)',
    padding: '32px 40px',
    minWidth: '320px',
    maxWidth: '400px',
    textAlign: 'center' as const,
    fontFamily: 'system-ui, -apple-system, sans-serif',
    transform: 'scale(0.95) translateY(10px)',
    transition: 'transform 0.3s ease',
  } as const,

  cardVisible: {
    transform: 'scale(1) translateY(0)',
  } as const,

  title: {
    fontSize: '20px',
    fontWeight: 700,
    color: 'rgba(209, 213, 219, 0.95)',
    marginBottom: '24px',
    letterSpacing: '0.3px',
  } as const,

  featureList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '14px',
    marginBottom: '28px',
    textAlign: 'left' as const,
  } as const,

  featureItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    fontSize: '13px',
    color: 'rgba(156, 163, 175, 0.9)',
    lineHeight: '20px',
  } as const,

  featureIcon: {
    width: '32px',
    height: '32px',
    borderRadius: '8px',
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '14px',
    flexShrink: 0,
  } as const,

  featureText: {
    flex: 1,
  } as const,

  featureLabel: {
    color: 'rgba(209, 213, 219, 0.95)',
    fontWeight: 600,
  } as const,

  actions: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'center',
  } as const,

  primaryButton: {
    padding: '12px 28px',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: 'rgba(99, 102, 241, 0.8)',
    color: '#fff',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    letterSpacing: '0.3px',
  } as const,

  secondaryButton: {
    padding: '12px 20px',
    borderRadius: '8px',
    border: '1px solid rgba(75, 85, 99, 0.4)',
    backgroundColor: 'transparent',
    color: 'rgba(156, 163, 175, 0.8)',
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  } as const,

  checkboxRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    marginTop: '20px',
    fontSize: '11px',
    color: 'rgba(107, 114, 128, 0.7)',
  } as const,

  checkbox: {
    width: '14px',
    height: '14px',
    cursor: 'pointer',
    accentColor: 'rgba(99, 102, 241, 0.8)',
  } as const,
} as const;

// ============================================================================
// Feature Data
// ============================================================================

interface Feature {
  icon: string;
  label: string;
  description: string;
}

const FEATURES: readonly Feature[] = [
  {
    icon: '\u2699', // Gear
    label: 'Top-left',
    description: 'Switch to Debug View',
  },
  {
    icon: '\uD83D\uDCA1', // Lightbulb
    label: 'Bottom-right',
    description: 'View insights and tips',
  },
  {
    icon: '\u25B6', // Play
    label: 'Bottom',
    description: 'Replay controls',
  },
];

// ============================================================================
// Main Component
// ============================================================================

export function WelcomeOverlay({
  isVisible,
  onDismiss,
  onDontShowAgain,
}: WelcomeOverlayProps): React.ReactElement | null {
  const [isAnimating, setIsAnimating] = useState(false);
  const [dontShowChecked, setDontShowChecked] = useState(false);

  // Handle visibility animation
  React.useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(() => setIsAnimating(true), 10);
      return () => clearTimeout(timer);
    } else {
      setIsAnimating(false);
    }
  }, [isVisible]);

  // Handle dismiss
  const handleDismiss = useCallback(() => {
    if (dontShowChecked) {
      onDontShowAgain();
    } else {
      onDismiss();
    }
  }, [dontShowChecked, onDismiss, onDontShowAgain]);

  // Handle checkbox change
  const handleCheckboxChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setDontShowChecked(e.target.checked);
  }, []);

  // Don't render if not visible
  if (!isVisible) return null;

  return (
    <div
      style={{
        ...styles.overlay,
        ...(isAnimating ? styles.overlayVisible : {}),
      }}
      onClick={handleDismiss}
    >
      <div
        style={{
          ...styles.card,
          ...(isAnimating ? styles.cardVisible : {}),
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Welcome to Player View"
      >
        {/* Title */}
        <div style={styles.title}>Welcome to Player View</div>

        {/* Feature List */}
        <div style={styles.featureList}>
          {FEATURES.map((feature, index) => (
            <div key={index} style={styles.featureItem}>
              <div style={styles.featureIcon}>{feature.icon}</div>
              <div style={styles.featureText}>
                <span style={styles.featureLabel}>{feature.label}:</span>{' '}
                {feature.description}
              </div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div style={styles.actions}>
          <button
            style={styles.primaryButton}
            onClick={handleDismiss}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(99, 102, 241, 1)';
              e.currentTarget.style.transform = 'scale(1.02)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(99, 102, 241, 0.8)';
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            Got it
          </button>
        </div>

        {/* Don't show again checkbox */}
        <div style={styles.checkboxRow}>
          <input
            type="checkbox"
            id="dont-show-again"
            style={styles.checkbox}
            checked={dontShowChecked}
            onChange={handleCheckboxChange}
          />
          <label htmlFor="dont-show-again" style={{ cursor: 'pointer' }}>
            Don't show this again
          </label>
        </div>
      </div>
    </div>
  );
}

export default WelcomeOverlay;
