// ============================================================================
// UXDocumentation - Complete UX Behavior Summary
// ============================================================================
//
// 【Product Polish Phase】Replay Architecture Freeze Declaration v1.0 Compliant
//
// This file serves as the authoritative documentation for all UX behaviors,
// keyboard shortcuts, interaction rules, and design decisions in the
// Texas Hold'em Replay Analysis UI.
//
// ============================================================================

// ============================================================================
// KEYBOARD NAVIGATION MAP
// ============================================================================

/**
 * Complete keyboard shortcut reference
 */
export const KEYBOARD_MAP = {
  // ========================================
  // Decision Navigation
  // ========================================
  decisionNavigation: {
    'ArrowLeft': {
      action: 'Previous Decision',
      description: 'Navigate to the previous decision point in the timeline',
      context: 'Global',
    },
    'ArrowRight': {
      action: 'Next Decision',
      description: 'Navigate to the next decision point in the timeline',
      context: 'Global',
    },
    'Home': {
      action: 'First Decision',
      description: 'Jump to the first decision in the hand',
      context: 'Global',
    },
    'End': {
      action: 'Last Decision',
      description: 'Jump to the last decision in the hand',
      context: 'Global',
    },
  },

  // ========================================
  // Panel Navigation
  // ========================================
  panelNavigation: {
    'ArrowUp': {
      action: 'Previous Panel',
      description: 'Cycle to the previous analysis panel',
      context: 'Global',
      cycle: 'Narrative → Alignment → Comparison → Insight → Narrative',
    },
    'ArrowDown': {
      action: 'Next Panel',
      description: 'Cycle to the next analysis panel',
      context: 'Global',
      cycle: 'Narrative → Insight → Comparison → Alignment → Narrative',
    },
    '1': {
      action: 'Narrative Panel',
      description: 'Switch directly to Hand Narrative panel',
      context: 'Global',
    },
    '2': {
      action: 'Insight Panel',
      description: 'Switch directly to Decision Insights panel',
      context: 'Global',
    },
    '3': {
      action: 'Comparison Panel',
      description: 'Switch directly to Decision Comparison panel',
      context: 'Global',
    },
    '4': {
      action: 'Alignment Panel',
      description: 'Switch directly to Strategy Alignment panel',
      context: 'Global',
    },
  },

  // ========================================
  // View Controls
  // ========================================
  viewControls: {
    'Enter': {
      action: 'Toggle Focus View',
      description: 'Open or close the Focused Decision View overlay',
      context: 'Global',
    },
    'Escape': {
      action: 'Close Focus View',
      description: 'Close the Focused Decision View if open',
      context: 'Focus Mode',
    },
    'd': {
      action: 'Toggle Density',
      description: 'Switch between Compact and Expanded display modes',
      context: 'Global',
    },
  },
} as const;

// ============================================================================
// PANEL DESCRIPTIONS
// ============================================================================

/**
 * Analysis panel descriptions and use cases
 */
export const PANEL_DESCRIPTIONS = {
  narrative: {
    name: 'Hand Narrative',
    shortName: 'Narrative',
    icon: '✎',
    color: '#a78bfa',
    purpose: 'Story-form recap of the hand progression',
    bestFor: [
      'Understanding the flow of action',
      'Getting context for specific moments',
      'Reviewing what happened chronologically',
      'Casual hand review',
    ],
    features: [
      'Street-by-street narrative paragraphs',
      'Dramatic arc visualization',
      'Key moments highlighting',
      'Pattern detection summary',
    ],
  },
  insight: {
    name: 'Decision Insights',
    shortName: 'Insights',
    icon: 'ℹ',
    color: '#3b82f6',
    purpose: 'Deep quantitative analysis of decision points',
    bestFor: [
      'Understanding risk/reward trade-offs',
      'Analyzing pressure situations',
      'Studying commitment levels',
      'Identifying turning points',
    ],
    features: [
      'Volatility and momentum metrics',
      'Risk escalation curves',
      'Confidence delta tracking',
      'Strategic coherence analysis',
    ],
  },
  comparison: {
    name: 'Decision Comparison',
    shortName: 'Compare',
    icon: '↔',
    color: '#06b6d4',
    purpose: 'Compare chosen action with alternatives',
    bestFor: [
      'Evaluating alternative lines',
      'Understanding EV differences',
      'Learning from decision points',
      'Post-session review',
    ],
    features: [
      'Side-by-side alternative comparison',
      'EV delta visualization',
      'Risk spectrum view',
      'Alternative ranking',
    ],
  },
  alignment: {
    name: 'Strategy Alignment',
    shortName: 'Alignment',
    icon: '✓',
    color: '#f472b6',
    purpose: 'Compare decisions against theoretical strategy',
    bestFor: [
      'Checking GTO alignment',
      'Understanding deviations',
      'Identifying leaks',
      'Strategy improvement',
    ],
    features: [
      'Expectation vs reality comparison',
      'Strategic profile identification',
      'Decision quality scoring',
      'Hero alignment history',
    ],
  },
} as const;

// ============================================================================
// INTERACTION RULES
// ============================================================================

/**
 * Core interaction behavior rules
 */
export const INTERACTION_RULES = {
  // ========================================
  // State Management
  // ========================================
  stateManagement: {
    rule: 'All state is managed by parent components',
    details: [
      'UI components receive state via props only',
      'State changes are communicated via callback props',
      'No internal state (useState) in analysis components',
      'Parent components control navigation and selection',
    ],
  },

  // ========================================
  // Navigation
  // ========================================
  navigation: {
    decisionNavigation: {
      rule: 'Arrow keys navigate between decision points',
      details: [
        'Left/Right arrows move through timeline sequentially',
        'Navigation wraps at boundaries (stays at first/last)',
        'Home/End provide quick jumps to extremes',
        'Current position shown in status bar',
      ],
    },
    panelNavigation: {
      rule: 'Up/Down arrows and number keys switch panels',
      details: [
        'Panel order: Narrative → Insight → Comparison → Alignment',
        'Cycling wraps around (Alignment → Narrative)',
        'Number keys provide direct panel access',
        'Panel switch preserves decision position',
      ],
    },
  },

  // ========================================
  // Focus Mode
  // ========================================
  focusMode: {
    rule: 'Focus mode shows consolidated decision view',
    details: [
      'Enter toggles focus mode on/off',
      'Escape closes focus mode (Enter does not close)',
      'Focus view shows all four perspectives for one decision',
      'Clicking outside the overlay closes it',
    ],
  },

  // ========================================
  // Density Modes
  // ========================================
  densityModes: {
    rule: 'Compact vs Expanded affects all visual elements',
    details: [
      'D key toggles between modes',
      'Compact: Reduced spacing, smaller fonts, fewer items',
      'Expanded: Full spacing, larger fonts, more detail',
      'Mode persists across panel changes',
    ],
  },

  // ========================================
  // Auto Panel Selection
  // ========================================
  autoPanelSelection: {
    rule: 'System suggests optimal panel based on decision',
    details: [
      'High-risk deviations → Alignment panel',
      'Hero turning points → Insight panel',
      'All-in with alternatives → Comparison panel',
      'Default for opponents → Narrative panel',
      'User selection overrides auto-selection',
    ],
  },
} as const;

// ============================================================================
// VISUAL DESIGN TOKENS
// ============================================================================

/**
 * Visual design system tokens
 */
export const DESIGN_TOKENS = {
  colors: {
    // Panel accent colors
    narrative: '#a78bfa',
    insight: '#3b82f6',
    comparison: '#06b6d4',
    alignment: '#f472b6',

    // Action colors
    fold: '#6b7280',
    check: '#3b82f6',
    call: '#06b6d4',
    bet: '#f59e0b',
    raise: '#ef4444',
    'all-in': '#f43f5e',

    // Status colors
    aligned: '#22c55e',
    deviates: '#f59e0b',
    'high-risk': '#ef4444',

    // Confidence levels
    high: '#22c55e',
    medium: '#f59e0b',
    low: '#6b7280',

    // Street colors
    preflop: '#3b82f6',
    flop: '#06b6d4',
    turn: '#f59e0b',
    river: '#ef4444',
  },

  transitions: {
    fast: '150ms',
    normal: '250ms',
    slow: '400ms',
  },

  spacing: {
    compact: {
      xs: 2, sm: 4, md: 6, lg: 8, xl: 12,
    },
    expanded: {
      xs: 4, sm: 6, md: 10, lg: 14, xl: 20,
    },
  },
} as const;

// ============================================================================
// EMPTY STATE BEHAVIORS
// ============================================================================

/**
 * Edge case handling behaviors
 */
export const EMPTY_STATE_BEHAVIORS = {
  noEvents: {
    display: 'No Events state',
    message: 'No hand events available',
    suggestion: 'Load a hand history to begin',
  },
  noDecisions: {
    display: 'No Decisions state',
    message: 'Events present but no player decisions yet',
    suggestion: 'Decisions appear after preflop action',
  },
  singleDecision: {
    display: 'Single Decision notice',
    message: 'Only one decision in timeline',
    impact: 'Comparison features limited',
  },
  heroOnly: {
    display: 'Hero Only notice',
    message: 'No opponent actions recorded',
    impact: 'Field comparison unavailable',
  },
  noHeroDecisions: {
    display: 'No Hero Decisions notice',
    message: 'Hero has not acted in this hand',
    impact: 'Hero-specific analysis unavailable',
  },
} as const;

// ============================================================================
// ACCESSIBILITY NOTES
// ============================================================================

/**
 * Accessibility considerations
 */
export const ACCESSIBILITY_NOTES = {
  keyboardSupport: {
    note: 'Full keyboard navigation supported',
    details: [
      'All features accessible via keyboard',
      'Focus indicators visible on interactive elements',
      'Tab navigation follows logical order',
      'Keyboard shortcuts do not conflict with screen readers',
    ],
  },
  visualDesign: {
    note: 'Color is not the only differentiator',
    details: [
      'Icons and text labels accompany color coding',
      'Sufficient contrast ratios maintained',
      'Interactive elements have clear boundaries',
    ],
  },
  motionSensitivity: {
    note: 'Animations are subtle and optional',
    details: [
      'Transitions are fast (≤400ms)',
      'No auto-playing animations',
      'No flashing or rapid motion',
    ],
  },
} as const;

// ============================================================================
// COMPLIANCE SUMMARY
// ============================================================================

/**
 * Architecture compliance summary
 */
export const COMPLIANCE_SUMMARY = {
  frozenLayers: [
    'DecisionTimelineModel.ts',
    'DecisionPoint interface',
    'DecisionTimeline type',
  ],
  prohibitedPatterns: [
    'React hooks (useState, useEffect, useMemo, useCallback)',
    'Internal component state',
    'Side effects (async, fetch, timers)',
    'Direct mutations of props or external data',
    'Imports from replay/ or commands/',
  ],
  requiredPatterns: [
    'Pure functional components',
    'Props-only data flow',
    'Callback-based interactions',
    'CSS-only animations',
    'DecisionTimelineModel consumption',
  ],
  verificationChecks: [
    'V-1 through V-5: No React hooks',
    'V-6 through V-9: No forbidden imports',
    'V-10 through V-14: No mutations',
    'V-15: Uses buildDecisionTimeline',
    'V-16: Uses getDecisionAtIndex',
    'INV-1 through INV-5: Invariant compliance',
    'H-1 through H-4: Handler compliance',
  ],
} as const;

// ============================================================================
// Export Documentation Object
// ============================================================================

export const UX_DOCUMENTATION = {
  keyboardMap: KEYBOARD_MAP,
  panelDescriptions: PANEL_DESCRIPTIONS,
  interactionRules: INTERACTION_RULES,
  designTokens: DESIGN_TOKENS,
  emptyStateBehaviors: EMPTY_STATE_BEHAVIORS,
  accessibilityNotes: ACCESSIBILITY_NOTES,
  complianceSummary: COMPLIANCE_SUMMARY,
} as const;

export default UX_DOCUMENTATION;
