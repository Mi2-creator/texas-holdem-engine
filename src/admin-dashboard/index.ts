/**
 * Admin Dashboard Module
 * Phase 30 - Admin & Club Financial Dashboard (Read-Only)
 *
 * This module provides a unified, read-only financial visibility layer
 * for Platform Admin and Club Owner dashboards.
 *
 * DESIGN PRINCIPLES:
 * - Pure aggregation + projection layer on existing ledger data
 * - NO new persistent state
 * - NO writes or side effects
 * - Role-based access control
 *
 * KEY INVARIANTS:
 * - Revenue = Rake ONLY
 * - Admin credits are NOT revenue
 * - All data derived from ledger entries
 * - Access is hierarchical (Platform > Club Owner > Club Manager > Player)
 *
 * This module does NOT:
 * - Modify ledger entries
 * - Store balances (always derived)
 * - Process any financial operations
 * - Bypass access controls
 */

// ============================================================================
// Types
// ============================================================================

export {
  // Time Range
  DashboardTimeRange,
  createLastHoursRange,
  createLastDaysRange,
  createAllTimeRange,

  // Player Summary
  PlayerFinanceSummary,
  emptyPlayerFinanceSummary,

  // Club Summary
  ClubFinanceSummary,
  ClubTableSummary,
  emptyClubFinanceSummary,

  // Platform Summary
  PlatformFinanceSummary,
  ClubRakeSummary,
  emptyPlatformFinanceSummary,

  // Table Summary
  TableFinanceSummary,
  HandSummary,
  emptyTableFinanceSummary,

  // Access Types
  DashboardRole,
  DashboardAccessScope,
  DashboardQueryResult,

  // Aggregation Types
  AggregationEntry,
  toAggregationEntry,

  // Utilities
  integerAverage,
  isInTimeRange,
} from './types';

// ============================================================================
// Aggregators
// ============================================================================

export {
  // Player Aggregation
  aggregatePlayerEntries,
  aggregateAllPlayers,
  aggregatePlayersInClub,
  getTopPlayersByNetPosition,
  getBottomPlayersByNetPosition,
  getTopPlayersByHandsPlayed,
  getTopPlayersByVolume,

  // Club Aggregation
  aggregateClubEntries,
  aggregateAllClubs,
  getTopClubsByRake,
  getTopClubsByPlayerCount,
  getTopClubsByHandsPlayed,
  getTopClubsByPotVolume,

  // Platform/Rake Aggregation
  aggregatePlatformEntries,
  calculateRakeRate,
  calculateAverageRakePerHand,
  calculatePlatformSharePercentage,
  calculateAveragePotSize,
  aggregateByHour,
  aggregateByDay,

  // Admin Credit Aggregation
  AdminCreditDashboardSummary,
  aggregateAdminCredits,
  aggregateByAdmin,
  aggregateByPlayer,
  aggregateByClub,
  aggregateByReason,
  getTopPlayersByCredits,
  getTopAdminsByCredits,

  // Table Aggregation
  aggregateTableEntries,
  aggregateAllTables,
  aggregateTablesInClub,
  getTopTablesByRake,
  getTopTablesByHandsPlayed,
  getTopTablesByPlayerCount,
  getTopTablesByPotVolume,
  getLargestPots,
  getHighestRakeHands,
} from './Aggregators';

// ============================================================================
// Views
// ============================================================================

export {
  // Player Finance View
  PlayerFinanceView,
  createPlayerFinanceView,

  // Club Finance View
  ClubFinanceView,
  createClubFinanceView,

  // Platform Finance View
  PlatformFinanceView,
  createPlatformFinanceView,

  // Table Finance View
  TableFinanceView,
  createTableFinanceView,
} from './Views';

// ============================================================================
// Permissions
// ============================================================================

export {
  AccessCheckResult,
  DashboardAccessPolicy,
  createDashboardAccessPolicy,
} from './Permissions';
