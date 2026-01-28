/**
 * Revenue Attribution Views Module
 * Phase 26 - Read-only views for revenue and attribution
 *
 * This module provides:
 * 1. PlatformRevenueView - Platform-attributed entry aggregation
 * 2. ClubRevenueView - Club-attributed entry aggregation (isolated)
 * 3. AgentCommissionView - Agent commission aggregation (direct only)
 * 4. TableRakeTimelineView - Time-ordered rake per table
 *
 * HARD CONSTRAINTS:
 * - All views are strictly READ-ONLY
 * - All outputs derived from existing ledger entries
 * - No balance mutation, no side effects
 * - Deterministic and replay-safe
 * - Integer-based numeric outputs
 */

// Types
export {
  // Time types
  TimeWindow,
  TimeGranularity,
  TimeBucket,

  // Platform revenue types
  PlatformRevenueQuery,
  PlatformRevenueEntry,
  PlatformRevenueGroup,
  PlatformRevenueSummary,

  // Club revenue types
  ClubRevenueQuery,
  ClubRevenueEntry,
  ClubRevenueGroup,
  ClubRevenueSummary,

  // Agent commission types
  AgentCommissionQuery,
  AgentCommissionEntry,
  AgentCommissionGroup,
  AgentCommissionSummary,
  AgentCommissionRollup,

  // Table rake timeline types
  TableRakeTimelineQuery,
  RakeTimelineEntry,
  RakeBreakdown,
  TableRakeTimeline,
  TimelineComparisonResult,
  TimelineDifference,

  // Result types
  ViewResult,
  PaginationInfo,
  TimeBucketResult,

  // Utility functions
  calculateTimeBucket,
  isWithinTimeWindow,
  createDefaultTimeWindow,
  normalizeTimeWindow,
} from './RevenueViewTypes';

// Platform Revenue View
export {
  PlatformRevenueView,
  createPlatformRevenueView,
} from './PlatformRevenueView';

// Club Revenue View
export {
  ClubRevenueView,
  createClubRevenueView,
} from './ClubRevenueView';

// Agent Commission View
export {
  AgentCommissionView,
  createAgentCommissionView,
} from './AgentCommissionView';

// Table Rake Timeline View
export {
  TableRakeTimelineView,
  createTableRakeTimelineView,
} from './TableRakeTimelineView';
