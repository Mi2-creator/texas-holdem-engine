/**
 * Aggregators Index
 * Phase 30 - Admin & Club Financial Dashboard (Read-Only)
 *
 * Pure aggregation functions for transforming ledger entries into summaries.
 */

// Player Aggregator
export {
  aggregatePlayerEntries,
  aggregateAllPlayers,
  aggregatePlayersInClub,
  getTopPlayersByNetPosition,
  getBottomPlayersByNetPosition,
  getTopPlayersByHandsPlayed,
  getTopPlayersByVolume,
} from './PlayerLedgerAggregator';

// Club Aggregator
export {
  aggregateClubEntries,
  aggregateAllClubs,
  getTopClubsByRake,
  getTopClubsByPlayerCount,
  getTopClubsByHandsPlayed,
  getTopClubsByPotVolume,
} from './ClubLedgerAggregator';

// Rake Aggregator (Platform)
export {
  aggregatePlatformEntries,
  calculateRakeRate,
  calculateAverageRakePerHand,
  calculatePlatformSharePercentage,
  calculateAveragePotSize,
  aggregateByHour,
  aggregateByDay,
} from './RakeAggregator';

// Admin Credit Aggregator
export {
  AdminCreditDashboardSummary,
  aggregateAdminCredits,
  aggregateByAdmin,
  aggregateByPlayer,
  aggregateByClub,
  aggregateByReason,
  getTopPlayersByCredits,
  getTopAdminsByCredits,
} from './AdminCreditAggregator';

// Table Aggregator
export {
  aggregateTableEntries,
  aggregateAllTables,
  aggregateTablesInClub,
  getTopTablesByRake,
  getTopTablesByHandsPlayed,
  getTopTablesByPlayerCount,
  getTopTablesByPotVolume,
  getLargestPots,
  getHighestRakeHands,
} from './TableAggregator';
