/**
 * AdminDashboard.test.ts
 * Phase 30 - Admin & Club Financial Dashboard (Read-Only)
 *
 * Comprehensive tests for dashboard aggregators, views, and access control.
 */

import { PlayerId } from '../../security/Identity';
import { TableId, HandId } from '../../security/AuditLog';
import { ClubId } from '../../club/ClubTypes';
import { AdminId } from '../../admin-credit/AdminCreditTypes';
import { AttributionSource, AttributionPartyType } from '../../ledger/LedgerTypes';

import {
  // Types
  DashboardTimeRange,
  AggregationEntry,
  createLastHoursRange,
  createLastDaysRange,
  createAllTimeRange,
  isInTimeRange,
  integerAverage,

  // Aggregators
  aggregatePlayerEntries,
  aggregateAllPlayers,
  aggregatePlayersInClub,
  getTopPlayersByNetPosition,
  aggregateClubEntries,
  aggregateAllClubs,
  getTopClubsByRake,
  aggregatePlatformEntries,
  calculateRakeRate,
  calculateAverageRakePerHand,
  aggregateAdminCredits,
  aggregateTableEntries,
  aggregateAllTables,
  getLargestPots,

  // Views
  createPlayerFinanceView,
  createClubFinanceView,
  createPlatformFinanceView,
  createTableFinanceView,

  // Permissions
  createDashboardAccessPolicy,
} from '../index';

// ============================================================================
// Test Helpers
// ============================================================================

function createPlayerId(id: string): PlayerId {
  return `player_${id}` as PlayerId;
}

function createClubId(id: string): ClubId {
  return `club_${id}` as ClubId;
}

function createTableId(id: string): TableId {
  return `table_${id}` as TableId;
}

function createHandId(id: string): HandId {
  return `hand_${id}` as HandId;
}

function createAdminId(id: string): AdminId {
  return `admin_${id}` as AdminId;
}

function createEntry(
  id: string,
  timestamp: number,
  source: AttributionSource,
  partyType: AttributionPartyType,
  delta: number,
  options: {
    playerId?: PlayerId;
    clubId?: ClubId;
    tableId?: TableId;
    handId?: HandId;
    metadata?: Record<string, unknown>;
  } = {}
): AggregationEntry {
  return {
    entryId: `entry_${id}`,
    timestamp,
    source,
    partyType,
    delta,
    ...options,
  };
}

// ============================================================================
// Time Range Tests
// ============================================================================

describe('Time Range Functions', () => {
  describe('createLastHoursRange', () => {
    it('should create a range for last N hours', () => {
      const range = createLastHoursRange(24);
      const now = Date.now();

      expect(range.toTimestamp).toBeLessThanOrEqual(now);
      expect(range.toTimestamp).toBeGreaterThan(now - 1000);
      expect(range.fromTimestamp).toBeLessThan(range.toTimestamp);

      const diffHours = (range.toTimestamp - range.fromTimestamp) / (60 * 60 * 1000);
      expect(Math.round(diffHours)).toBe(24);
    });
  });

  describe('createLastDaysRange', () => {
    it('should create a range for last N days', () => {
      const range = createLastDaysRange(7);
      const now = Date.now();

      expect(range.toTimestamp).toBeLessThanOrEqual(now);
      const diffDays = (range.toTimestamp - range.fromTimestamp) / (24 * 60 * 60 * 1000);
      expect(Math.round(diffDays)).toBe(7);
    });
  });

  describe('createAllTimeRange', () => {
    it('should create a range from epoch to now', () => {
      const range = createAllTimeRange();

      expect(range.fromTimestamp).toBe(0);
      expect(range.toTimestamp).toBeLessThanOrEqual(Date.now());
    });
  });

  describe('isInTimeRange', () => {
    const range: DashboardTimeRange = {
      fromTimestamp: 1000,
      toTimestamp: 2000,
    };

    it('should return true for timestamp in range', () => {
      expect(isInTimeRange(1500, range)).toBe(true);
    });

    it('should return true for timestamp at boundaries', () => {
      expect(isInTimeRange(1000, range)).toBe(true);
      expect(isInTimeRange(2000, range)).toBe(true);
    });

    it('should return false for timestamp outside range', () => {
      expect(isInTimeRange(999, range)).toBe(false);
      expect(isInTimeRange(2001, range)).toBe(false);
    });
  });

  describe('integerAverage', () => {
    it('should calculate integer average', () => {
      expect(integerAverage(100, 3)).toBe(33);
      expect(integerAverage(100, 4)).toBe(25);
    });

    it('should return 0 for zero count', () => {
      expect(integerAverage(100, 0)).toBe(0);
    });
  });
});

// ============================================================================
// Player Aggregator Tests
// ============================================================================

describe('Player Aggregator', () => {
  const player1 = createPlayerId('1');
  const player2 = createPlayerId('2');
  const club1 = createClubId('1');
  const table1 = createTableId('1');
  const hand1 = createHandId('1');
  const timeRange: DashboardTimeRange = { fromTimestamp: 0, toTimestamp: 10000 };

  describe('aggregatePlayerEntries', () => {
    it('should aggregate winnings for a player', () => {
      const entries: AggregationEntry[] = [
        createEntry('1', 1000, 'HAND_SETTLEMENT', 'PLAYER', 500, {
          playerId: player1,
          clubId: club1,
          tableId: table1,
          handId: hand1,
        }),
      ];

      const summary = aggregatePlayerEntries(player1, entries, timeRange);

      expect(summary.playerId).toBe(player1);
      expect(summary.totalChipsIn).toBe(500);
      expect(summary.chipsFromWinnings).toBe(500);
      expect(summary.netPosition).toBe(500);
      expect(summary.handsPlayed).toBe(1);
      expect(summary.tablesPlayed).toBe(1);
    });

    it('should aggregate losses for a player', () => {
      const entries: AggregationEntry[] = [
        createEntry('1', 1000, 'HAND_SETTLEMENT', 'PLAYER', -300, {
          playerId: player1,
          clubId: club1,
          handId: hand1,
        }),
      ];

      const summary = aggregatePlayerEntries(player1, entries, timeRange);

      expect(summary.totalChipsOut).toBe(300);
      expect(summary.chipsToLosses).toBe(300);
      expect(summary.netPosition).toBe(-300);
    });

    it('should aggregate credits for a player', () => {
      const entries: AggregationEntry[] = [
        createEntry('1', 1000, 'TOP_UP', 'PLAYER', 1000, {
          playerId: player1,
          clubId: club1,
        }),
      ];

      const summary = aggregatePlayerEntries(player1, entries, timeRange);

      expect(summary.totalChipsIn).toBe(1000);
      expect(summary.chipsFromCredits).toBe(1000);
    });

    it('should track by club', () => {
      const club2 = createClubId('2');
      const entries: AggregationEntry[] = [
        createEntry('1', 1000, 'HAND_SETTLEMENT', 'PLAYER', 500, {
          playerId: player1,
          clubId: club1,
        }),
        createEntry('2', 2000, 'HAND_SETTLEMENT', 'PLAYER', 300, {
          playerId: player1,
          clubId: club2,
        }),
      ];

      const summary = aggregatePlayerEntries(player1, entries, timeRange);

      expect(summary.byClub.get(club1)).toBe(500);
      expect(summary.byClub.get(club2)).toBe(300);
    });

    it('should filter by time range', () => {
      const entries: AggregationEntry[] = [
        createEntry('1', 500, 'HAND_SETTLEMENT', 'PLAYER', 100, { playerId: player1 }),
        createEntry('2', 1500, 'HAND_SETTLEMENT', 'PLAYER', 200, { playerId: player1 }),
      ];

      const narrowRange: DashboardTimeRange = { fromTimestamp: 1000, toTimestamp: 2000 };
      const summary = aggregatePlayerEntries(player1, entries, narrowRange);

      expect(summary.totalChipsIn).toBe(200);
    });

    it('should ignore entries for other players', () => {
      const entries: AggregationEntry[] = [
        createEntry('1', 1000, 'HAND_SETTLEMENT', 'PLAYER', 500, { playerId: player1 }),
        createEntry('2', 1000, 'HAND_SETTLEMENT', 'PLAYER', 300, { playerId: player2 }),
      ];

      const summary = aggregatePlayerEntries(player1, entries, timeRange);

      expect(summary.totalChipsIn).toBe(500);
    });
  });

  describe('aggregateAllPlayers', () => {
    it('should aggregate for all players', () => {
      const entries: AggregationEntry[] = [
        createEntry('1', 1000, 'HAND_SETTLEMENT', 'PLAYER', 500, { playerId: player1 }),
        createEntry('2', 1000, 'HAND_SETTLEMENT', 'PLAYER', -500, { playerId: player2 }),
      ];

      const summaries = aggregateAllPlayers(entries, timeRange);

      expect(summaries.size).toBe(2);
      expect(summaries.get(player1)?.netPosition).toBe(500);
      expect(summaries.get(player2)?.netPosition).toBe(-500);
    });
  });

  describe('aggregatePlayersInClub', () => {
    it('should filter by club', () => {
      const club2 = createClubId('2');
      const entries: AggregationEntry[] = [
        createEntry('1', 1000, 'HAND_SETTLEMENT', 'PLAYER', 500, {
          playerId: player1,
          clubId: club1,
        }),
        createEntry('2', 1000, 'HAND_SETTLEMENT', 'PLAYER', 300, {
          playerId: player2,
          clubId: club2,
        }),
      ];

      const summaries = aggregatePlayersInClub(club1, entries, timeRange);

      expect(summaries.size).toBe(1);
      expect(summaries.has(player1)).toBe(true);
      expect(summaries.has(player2)).toBe(false);
    });
  });

  describe('getTopPlayersByNetPosition', () => {
    it('should return top players by net position', () => {
      const player3 = createPlayerId('3');
      const entries: AggregationEntry[] = [
        createEntry('1', 1000, 'HAND_SETTLEMENT', 'PLAYER', 500, { playerId: player1 }),
        createEntry('2', 1000, 'HAND_SETTLEMENT', 'PLAYER', 1000, { playerId: player2 }),
        createEntry('3', 1000, 'HAND_SETTLEMENT', 'PLAYER', 200, { playerId: player3 }),
      ];

      const top = getTopPlayersByNetPosition(entries, timeRange, 2);

      expect(top.length).toBe(2);
      expect(top[0].playerId).toBe(player2);
      expect(top[1].playerId).toBe(player1);
    });
  });
});

// ============================================================================
// Club Aggregator Tests
// ============================================================================

describe('Club Aggregator', () => {
  const club1 = createClubId('1');
  const player1 = createPlayerId('1');
  const table1 = createTableId('1');
  const hand1 = createHandId('1');
  const timeRange: DashboardTimeRange = { fromTimestamp: 0, toTimestamp: 10000 };

  describe('aggregateClubEntries', () => {
    it('should aggregate player count', () => {
      const player2 = createPlayerId('2');
      const entries: AggregationEntry[] = [
        createEntry('1', 1000, 'HAND_SETTLEMENT', 'PLAYER', -100, {
          playerId: player1,
          clubId: club1,
        }),
        createEntry('2', 1000, 'HAND_SETTLEMENT', 'PLAYER', -100, {
          playerId: player2,
          clubId: club1,
        }),
      ];

      const summary = aggregateClubEntries(club1, entries, timeRange);

      expect(summary.playerCount).toBe(2);
    });

    it('should aggregate rake (club share)', () => {
      const entries: AggregationEntry[] = [
        createEntry('1', 1000, 'HAND_SETTLEMENT', 'CLUB', 50, {
          clubId: club1,
          handId: hand1,
        }),
      ];

      const summary = aggregateClubEntries(club1, entries, timeRange);

      expect(summary.clubRakeShare).toBe(50);
      expect(summary.totalRake).toBe(50);
    });

    it('should track by table', () => {
      const table2 = createTableId('2');
      const entries: AggregationEntry[] = [
        createEntry('1', 1000, 'HAND_SETTLEMENT', 'CLUB', 30, {
          clubId: club1,
          tableId: table1,
          handId: createHandId('1'),
        }),
        createEntry('2', 2000, 'HAND_SETTLEMENT', 'CLUB', 50, {
          clubId: club1,
          tableId: table2,
          handId: createHandId('2'),
        }),
      ];

      const summary = aggregateClubEntries(club1, entries, timeRange);

      expect(summary.byTable.size).toBe(2);
      expect(summary.byTable.get(table1)?.totalRake).toBe(30);
      expect(summary.byTable.get(table2)?.totalRake).toBe(50);
    });

    it('should aggregate total credits', () => {
      const entries: AggregationEntry[] = [
        createEntry('1', 1000, 'TOP_UP', 'PLAYER', 1000, {
          playerId: player1,
          clubId: club1,
          metadata: { reason: 'PROMOTION' },
        }),
      ];

      const summary = aggregateClubEntries(club1, entries, timeRange);

      expect(summary.totalCredits).toBe(1000);
      expect(summary.creditsByReason.PROMOTION).toBe(1000);
    });
  });

  describe('aggregateAllClubs', () => {
    it('should aggregate for all clubs', () => {
      const club2 = createClubId('2');
      const entries: AggregationEntry[] = [
        createEntry('1', 1000, 'HAND_SETTLEMENT', 'CLUB', 100, { clubId: club1 }),
        createEntry('2', 1000, 'HAND_SETTLEMENT', 'CLUB', 200, { clubId: club2 }),
      ];

      const summaries = aggregateAllClubs(entries, timeRange);

      expect(summaries.size).toBe(2);
      expect(summaries.get(club1)?.clubRakeShare).toBe(100);
      expect(summaries.get(club2)?.clubRakeShare).toBe(200);
    });
  });

  describe('getTopClubsByRake', () => {
    it('should return top clubs by rake', () => {
      const club2 = createClubId('2');
      const club3 = createClubId('3');
      const entries: AggregationEntry[] = [
        createEntry('1', 1000, 'HAND_SETTLEMENT', 'CLUB', 100, { clubId: club1 }),
        createEntry('2', 1000, 'HAND_SETTLEMENT', 'CLUB', 300, { clubId: club2 }),
        createEntry('3', 1000, 'HAND_SETTLEMENT', 'CLUB', 50, { clubId: club3 }),
      ];

      const top = getTopClubsByRake(entries, timeRange, 2);

      expect(top.length).toBe(2);
      expect(top[0].clubId).toBe(club2);
      expect(top[1].clubId).toBe(club1);
    });
  });
});

// ============================================================================
// Platform/Rake Aggregator Tests
// ============================================================================

describe('Platform Aggregator', () => {
  const club1 = createClubId('1');
  const player1 = createPlayerId('1');
  const hand1 = createHandId('1');
  const timeRange: DashboardTimeRange = { fromTimestamp: 0, toTimestamp: 10000 };

  describe('aggregatePlatformEntries', () => {
    it('should aggregate platform rake revenue', () => {
      const entries: AggregationEntry[] = [
        createEntry('1', 1000, 'HAND_SETTLEMENT', 'PLATFORM', 50, {
          clubId: club1,
          handId: hand1,
        }),
      ];

      const summary = aggregatePlatformEntries(entries, timeRange);

      expect(summary.totalRakeRevenue).toBe(50);
      expect(summary.totalRakeCollected).toBe(50);
    });

    it('should track club shares separately', () => {
      const entries: AggregationEntry[] = [
        createEntry('1', 1000, 'HAND_SETTLEMENT', 'PLATFORM', 50, {
          clubId: club1,
          handId: hand1,
        }),
        createEntry('2', 1000, 'HAND_SETTLEMENT', 'CLUB', 50, {
          clubId: club1,
          handId: hand1,
        }),
      ];

      const summary = aggregatePlatformEntries(entries, timeRange);

      expect(summary.totalRakeRevenue).toBe(50);
      expect(summary.totalRakeCollected).toBe(100);
      expect(summary.byClub.get(club1)?.platformShare).toBe(50);
      expect(summary.byClub.get(club1)?.clubShare).toBe(50);
    });

    it('should NOT count admin credits as revenue', () => {
      const entries: AggregationEntry[] = [
        createEntry('1', 1000, 'TOP_UP', 'PLAYER', 1000, {
          playerId: player1,
          clubId: club1,
        }),
      ];

      const summary = aggregatePlatformEntries(entries, timeRange);

      expect(summary.totalRakeRevenue).toBe(0);
      expect(summary.totalCreditsIssued).toBe(1000);
    });

    it('should track unique players and clubs', () => {
      const player2 = createPlayerId('2');
      const club2 = createClubId('2');
      const entries: AggregationEntry[] = [
        createEntry('1', 1000, 'HAND_SETTLEMENT', 'PLAYER', -100, {
          playerId: player1,
          clubId: club1,
        }),
        createEntry('2', 1000, 'HAND_SETTLEMENT', 'PLAYER', -100, {
          playerId: player2,
          clubId: club2,
        }),
        createEntry('3', 1000, 'HAND_SETTLEMENT', 'PLATFORM', 20, { clubId: club1 }),
        createEntry('4', 1000, 'HAND_SETTLEMENT', 'PLATFORM', 20, { clubId: club2 }),
      ];

      const summary = aggregatePlatformEntries(entries, timeRange);

      expect(summary.uniquePlayers).toBe(2);
      expect(summary.activeClubs).toBe(2);
    });
  });

  describe('calculateRakeRate', () => {
    it('should calculate rake as percentage of pot volume', () => {
      const entries: AggregationEntry[] = [
        createEntry('1', 1000, 'HAND_SETTLEMENT', 'PLAYER', -1000, {
          playerId: player1,
        }),
        createEntry('2', 1000, 'HAND_SETTLEMENT', 'PLATFORM', 50, {}),
      ];

      const summary = aggregatePlatformEntries(entries, timeRange);
      const rate = calculateRakeRate(summary);

      expect(rate).toBe(0.05); // 50 / 1000 = 5%
    });

    it('should return 0 when no pot volume', () => {
      const entries: AggregationEntry[] = [];
      const summary = aggregatePlatformEntries(entries, timeRange);
      const rate = calculateRakeRate(summary);

      expect(rate).toBe(0);
    });
  });

  describe('calculateAverageRakePerHand', () => {
    it('should calculate average rake per hand', () => {
      const entries: AggregationEntry[] = [
        createEntry('1', 1000, 'HAND_SETTLEMENT', 'PLATFORM', 30, {
          handId: createHandId('1'),
        }),
        createEntry('2', 2000, 'HAND_SETTLEMENT', 'PLATFORM', 50, {
          handId: createHandId('2'),
        }),
      ];

      const summary = aggregatePlatformEntries(entries, timeRange);
      const avg = calculateAverageRakePerHand(summary);

      expect(avg).toBe(40); // (30 + 50) / 2 = 40
    });
  });
});

// ============================================================================
// Admin Credit Aggregator Tests
// ============================================================================

describe('Admin Credit Aggregator', () => {
  const player1 = createPlayerId('1');
  const club1 = createClubId('1');
  const admin1 = createAdminId('1');
  const timeRange: DashboardTimeRange = { fromTimestamp: 0, toTimestamp: 10000 };

  describe('aggregateAdminCredits', () => {
    it('should aggregate total credits', () => {
      const entries: AggregationEntry[] = [
        createEntry('1', 1000, 'TOP_UP', 'PLAYER', 500, {
          playerId: player1,
          clubId: club1,
          metadata: { adminId: admin1, reason: 'PROMOTION' },
        }),
        createEntry('2', 2000, 'TOP_UP', 'PLAYER', 300, {
          playerId: player1,
          clubId: club1,
          metadata: { adminId: admin1, reason: 'TESTING' },
        }),
      ];

      const summary = aggregateAdminCredits(entries, timeRange);

      expect(summary.totalCreditsIssued).toBe(800);
      expect(summary.creditCount).toBe(2);
    });

    it('should track by admin', () => {
      const admin2 = createAdminId('2');
      const entries: AggregationEntry[] = [
        createEntry('1', 1000, 'TOP_UP', 'PLAYER', 500, {
          playerId: player1,
          metadata: { adminId: admin1, reason: 'PROMOTION' },
        }),
        createEntry('2', 2000, 'TOP_UP', 'PLAYER', 300, {
          playerId: player1,
          metadata: { adminId: admin2, reason: 'TESTING' },
        }),
      ];

      const summary = aggregateAdminCredits(entries, timeRange);

      expect(summary.uniqueAdmins).toBe(2);
      expect(summary.byAdmin.get(admin1)?.totalAmount).toBe(500);
      expect(summary.byAdmin.get(admin2)?.totalAmount).toBe(300);
    });

    it('should track by reason', () => {
      const entries: AggregationEntry[] = [
        createEntry('1', 1000, 'TOP_UP', 'PLAYER', 500, {
          playerId: player1,
          metadata: { adminId: admin1, reason: 'PROMOTION' },
        }),
        createEntry('2', 2000, 'TOP_UP', 'PLAYER', 300, {
          playerId: player1,
          metadata: { adminId: admin1, reason: 'TESTING' },
        }),
      ];

      const summary = aggregateAdminCredits(entries, timeRange);

      expect(summary.byReason.PROMOTION).toBe(500);
      expect(summary.byReason.TESTING).toBe(300);
    });
  });
});

// ============================================================================
// Table Aggregator Tests
// ============================================================================

describe('Table Aggregator', () => {
  const table1 = createTableId('1');
  const club1 = createClubId('1');
  const player1 = createPlayerId('1');
  const hand1 = createHandId('1');
  const timeRange: DashboardTimeRange = { fromTimestamp: 0, toTimestamp: 10000 };

  describe('aggregateTableEntries', () => {
    it('should aggregate hands played', () => {
      const hand2 = createHandId('2');
      const entries: AggregationEntry[] = [
        createEntry('1', 1000, 'HAND_SETTLEMENT', 'PLAYER', -100, {
          playerId: player1,
          tableId: table1,
          handId: hand1,
        }),
        createEntry('2', 2000, 'HAND_SETTLEMENT', 'PLAYER', -100, {
          playerId: player1,
          tableId: table1,
          handId: hand2,
        }),
      ];

      const summary = aggregateTableEntries(table1, club1, entries, timeRange);

      expect(summary.handsPlayed).toBe(2);
    });

    it('should aggregate pot volume', () => {
      const entries: AggregationEntry[] = [
        createEntry('1', 1000, 'HAND_SETTLEMENT', 'PLAYER', -500, {
          playerId: player1,
          tableId: table1,
          handId: hand1,
        }),
      ];

      const summary = aggregateTableEntries(table1, club1, entries, timeRange);

      expect(summary.totalPotVolume).toBe(500);
    });

    it('should aggregate rake', () => {
      const entries: AggregationEntry[] = [
        createEntry('1', 1000, 'HAND_SETTLEMENT', 'PLATFORM', 25, {
          tableId: table1,
          handId: hand1,
        }),
        createEntry('2', 1000, 'HAND_SETTLEMENT', 'CLUB', 25, {
          tableId: table1,
          clubId: club1,
          handId: hand1,
        }),
      ];

      const summary = aggregateTableEntries(table1, club1, entries, timeRange);

      expect(summary.totalRake).toBe(50);
    });

    it('should track unique players', () => {
      const player2 = createPlayerId('2');
      const entries: AggregationEntry[] = [
        createEntry('1', 1000, 'HAND_SETTLEMENT', 'PLAYER', -100, {
          playerId: player1,
          tableId: table1,
          handId: hand1,
        }),
        createEntry('2', 1000, 'HAND_SETTLEMENT', 'PLAYER', -100, {
          playerId: player2,
          tableId: table1,
          handId: hand1,
        }),
      ];

      const summary = aggregateTableEntries(table1, club1, entries, timeRange);

      expect(summary.uniquePlayers).toBe(2);
      expect(summary.playerIds).toContain(player1);
      expect(summary.playerIds).toContain(player2);
    });

    it('should include recent hands', () => {
      const hand2 = createHandId('2');
      const entries: AggregationEntry[] = [
        createEntry('1', 1000, 'HAND_SETTLEMENT', 'PLAYER', -100, {
          playerId: player1,
          tableId: table1,
          handId: hand1,
        }),
        createEntry('2', 2000, 'HAND_SETTLEMENT', 'PLAYER', -200, {
          playerId: player1,
          tableId: table1,
          handId: hand2,
        }),
      ];

      const summary = aggregateTableEntries(table1, club1, entries, timeRange, 10);

      expect(summary.recentHands.length).toBe(2);
      // Should be sorted by timestamp descending
      expect(summary.recentHands[0].handId).toBe(hand2);
      expect(summary.recentHands[1].handId).toBe(hand1);
    });
  });

  describe('getLargestPots', () => {
    it('should return hands with largest pots', () => {
      const hand2 = createHandId('2');
      const entries: AggregationEntry[] = [
        createEntry('1', 1000, 'HAND_SETTLEMENT', 'PLAYER', -100, {
          playerId: player1,
          handId: hand1,
        }),
        createEntry('2', 2000, 'HAND_SETTLEMENT', 'PLAYER', -500, {
          playerId: player1,
          handId: hand2,
        }),
      ];

      const hands = getLargestPots(entries, timeRange, 2);

      expect(hands.length).toBe(2);
      expect(hands[0].handId).toBe(hand2);
      expect(hands[0].potSize).toBe(500);
    });
  });
});

// ============================================================================
// Finance View Tests
// ============================================================================

describe('Finance Views', () => {
  const player1 = createPlayerId('1');
  const club1 = createClubId('1');
  const table1 = createTableId('1');
  const timeRange: DashboardTimeRange = { fromTimestamp: 0, toTimestamp: 10000 };

  const entries: AggregationEntry[] = [
    createEntry('1', 1000, 'HAND_SETTLEMENT', 'PLAYER', 500, {
      playerId: player1,
      clubId: club1,
      tableId: table1,
      handId: createHandId('1'),
    }),
  ];

  describe('PlayerFinanceView', () => {
    it('should query player summary', () => {
      const view = createPlayerFinanceView(() => entries);
      const result = view.getPlayerSummary(player1, timeRange);

      expect(result.success).toBe(true);
      expect(result.data?.totalChipsIn).toBe(500);
    });

    it('should get top winners', () => {
      const view = createPlayerFinanceView(() => entries);
      const result = view.getTopWinners(timeRange, 10);

      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(1);
    });
  });

  describe('ClubFinanceView', () => {
    it('should query club summary', () => {
      const clubEntries: AggregationEntry[] = [
        createEntry('1', 1000, 'HAND_SETTLEMENT', 'CLUB', 50, {
          clubId: club1,
        }),
      ];

      const view = createClubFinanceView(() => clubEntries);
      const result = view.getClubSummary(club1, timeRange);

      expect(result.success).toBe(true);
      expect(result.data?.clubRakeShare).toBe(50);
    });
  });

  describe('PlatformFinanceView', () => {
    it('should query platform summary', () => {
      const platformEntries: AggregationEntry[] = [
        createEntry('1', 1000, 'HAND_SETTLEMENT', 'PLATFORM', 100, {}),
      ];

      const view = createPlatformFinanceView(() => platformEntries);
      const result = view.getPlatformSummary(timeRange);

      expect(result.success).toBe(true);
      expect(result.data?.totalRakeRevenue).toBe(100);
    });

    it('should get admin credit summary separately', () => {
      const mixedEntries: AggregationEntry[] = [
        createEntry('1', 1000, 'HAND_SETTLEMENT', 'PLATFORM', 100, {}),
        createEntry('2', 2000, 'TOP_UP', 'PLAYER', 500, {
          playerId: player1,
          metadata: { adminId: 'admin_1', reason: 'PROMOTION' },
        }),
      ];

      const view = createPlatformFinanceView(() => mixedEntries);

      const platformResult = view.getPlatformSummary(timeRange);
      expect(platformResult.data?.totalRakeRevenue).toBe(100);

      const creditResult = view.getAdminCreditSummary(timeRange);
      expect(creditResult.data?.totalCreditsIssued).toBe(500);
    });
  });

  describe('TableFinanceView', () => {
    it('should query table summary', () => {
      const tableEntries: AggregationEntry[] = [
        createEntry('1', 1000, 'HAND_SETTLEMENT', 'PLAYER', -100, {
          playerId: player1,
          tableId: table1,
          handId: createHandId('1'),
        }),
      ];

      const view = createTableFinanceView(() => tableEntries);
      view.registerTable(table1, club1);

      const result = view.getTableSummary(table1, timeRange);

      expect(result.success).toBe(true);
      expect(result.data?.totalPotVolume).toBe(100);
    });
  });
});

// ============================================================================
// Access Policy Tests
// ============================================================================

describe('Dashboard Access Policy', () => {
  let policy: ReturnType<typeof createDashboardAccessPolicy>;
  const club1 = createClubId('1');
  const club2 = createClubId('2');
  const table1 = createTableId('1');
  const player1 = createPlayerId('1');

  beforeEach(() => {
    policy = createDashboardAccessPolicy();
  });

  describe('Platform Admin', () => {
    beforeEach(() => {
      policy.registerPlatformAdmin('admin1');
    });

    it('should have PLATFORM_ADMIN role', () => {
      expect(policy.getUserRole('admin1')).toBe('PLATFORM_ADMIN');
    });

    it('should view platform data', () => {
      expect(policy.canViewPlatform('admin1').allowed).toBe(true);
    });

    it('should view all clubs', () => {
      expect(policy.canViewAllClubs('admin1').allowed).toBe(true);
    });

    it('should view any club', () => {
      expect(policy.canViewClub('admin1', club1).allowed).toBe(true);
    });

    it('should view any player', () => {
      expect(policy.canViewPlayer('admin1', player1).allowed).toBe(true);
    });

    it('should view admin credits', () => {
      expect(policy.canViewAdminCredits('admin1').allowed).toBe(true);
    });
  });

  describe('Club Owner', () => {
    beforeEach(() => {
      policy.registerClubOwner('owner1', club1);
    });

    it('should have CLUB_OWNER role', () => {
      expect(policy.getUserRole('owner1')).toBe('CLUB_OWNER');
    });

    it('should NOT view platform data', () => {
      expect(policy.canViewPlatform('owner1').allowed).toBe(false);
    });

    it('should view owned club', () => {
      expect(policy.canViewClub('owner1', club1).allowed).toBe(true);
    });

    it('should NOT view unowned club', () => {
      expect(policy.canViewClub('owner1', club2).allowed).toBe(false);
    });

    it('should get viewable clubs', () => {
      const clubs = policy.getViewableClubs('owner1');
      expect(clubs).toContain(club1);
      expect(clubs).not.toContain(club2);
    });
  });

  describe('Club Manager', () => {
    beforeEach(() => {
      policy.registerClubManager('manager1', club1, [table1]);
    });

    it('should have CLUB_MANAGER role', () => {
      expect(policy.getUserRole('manager1')).toBe('CLUB_MANAGER');
    });

    it('should view assigned club', () => {
      expect(policy.canViewClub('manager1', club1).allowed).toBe(true);
    });

    it('should view assigned table', () => {
      expect(policy.canViewTable('manager1', table1, club1).allowed).toBe(true);
    });

    it('should NOT view unassigned table', () => {
      const table2 = createTableId('2');
      expect(policy.canViewTable('manager1', table2, club1).allowed).toBe(false);
    });
  });

  describe('Player', () => {
    beforeEach(() => {
      policy.registerPlayer(player1);
    });

    it('should have PLAYER role', () => {
      expect(policy.getUserRole(player1)).toBe('PLAYER');
    });

    it('should view own data', () => {
      expect(policy.canViewPlayer(player1, player1).allowed).toBe(true);
    });

    it('should NOT view platform data', () => {
      expect(policy.canViewPlatform(player1).allowed).toBe(false);
    });

    it('should NOT view all players', () => {
      expect(policy.canViewAllPlayers(player1).allowed).toBe(false);
    });
  });

  describe('Unknown User', () => {
    it('should return null role', () => {
      expect(policy.getUserRole('unknown')).toBeNull();
    });

    it('should return null access scope', () => {
      expect(policy.getAccessScope('unknown')).toBeNull();
    });
  });

  describe('Statistics', () => {
    it('should track registrations', () => {
      policy.registerPlatformAdmin('admin1');
      policy.registerClubOwner('owner1', club1);
      policy.registerClubManager('manager1', club1);
      policy.registerPlayer(player1);

      const stats = policy.getStatistics();

      expect(stats.platformAdminCount).toBe(1);
      expect(stats.clubOwnerCount).toBe(1);
      expect(stats.clubManagerCount).toBe(1);
      expect(stats.playerCount).toBe(1);
    });
  });

  describe('Unregistration', () => {
    it('should unregister platform admin', () => {
      policy.registerPlatformAdmin('admin1');
      policy.unregisterPlatformAdmin('admin1');

      expect(policy.getUserRole('admin1')).toBeNull();
    });

    it('should unregister club owner', () => {
      policy.registerClubOwner('owner1', club1);
      policy.unregisterClubOwner('owner1', club1);

      expect(policy.getUserRole('owner1')).toBeNull();
    });
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('Dashboard Integration', () => {
  const timeRange: DashboardTimeRange = { fromTimestamp: 0, toTimestamp: 100000 };

  it('should provide complete financial visibility flow', () => {
    // Setup players, clubs, tables
    const player1 = createPlayerId('1');
    const player2 = createPlayerId('2');
    const club1 = createClubId('1');
    const table1 = createTableId('1');
    const hand1 = createHandId('1');
    const admin1 = createAdminId('1');

    // Create ledger entries representing a complete hand
    const entries: AggregationEntry[] = [
      // Admin credit to player 1
      createEntry('1', 1000, 'TOP_UP', 'PLAYER', 1000, {
        playerId: player1,
        clubId: club1,
        metadata: { adminId: admin1, reason: 'TESTING' },
      }),
      // Hand settlement - player 1 loses
      createEntry('2', 2000, 'HAND_SETTLEMENT', 'PLAYER', -500, {
        playerId: player1,
        clubId: club1,
        tableId: table1,
        handId: hand1,
      }),
      // Hand settlement - player 2 wins
      createEntry('3', 2000, 'HAND_SETTLEMENT', 'PLAYER', 450, {
        playerId: player2,
        clubId: club1,
        tableId: table1,
        handId: hand1,
      }),
      // Platform rake
      createEntry('4', 2000, 'HAND_SETTLEMENT', 'PLATFORM', 25, {
        clubId: club1,
        tableId: table1,
        handId: hand1,
      }),
      // Club rake
      createEntry('5', 2000, 'HAND_SETTLEMENT', 'CLUB', 25, {
        clubId: club1,
        tableId: table1,
        handId: hand1,
      }),
    ];

    // Create views
    const playerView = createPlayerFinanceView(() => entries);
    const clubView = createClubFinanceView(() => entries);
    const platformView = createPlatformFinanceView(() => entries);
    const tableView = createTableFinanceView(() => entries);
    tableView.registerTable(table1, club1);

    // Verify player view
    const player1Summary = playerView.getPlayerSummary(player1, timeRange);
    expect(player1Summary.data?.chipsFromCredits).toBe(1000);
    expect(player1Summary.data?.chipsToLosses).toBe(500);
    expect(player1Summary.data?.netPosition).toBe(500); // 1000 credit - 500 loss

    const player2Summary = playerView.getPlayerSummary(player2, timeRange);
    expect(player2Summary.data?.chipsFromWinnings).toBe(450);
    expect(player2Summary.data?.netPosition).toBe(450);

    // Verify club view
    const clubSummary = clubView.getClubSummary(club1, timeRange);
    expect(clubSummary.data?.playerCount).toBe(2);
    expect(clubSummary.data?.clubRakeShare).toBe(25);
    expect(clubSummary.data?.totalCredits).toBe(1000);

    // Verify platform view
    const platformSummary = platformView.getPlatformSummary(timeRange);
    expect(platformSummary.data?.totalRakeRevenue).toBe(25);
    expect(platformSummary.data?.totalRakeCollected).toBe(50);
    expect(platformSummary.data?.totalCreditsIssued).toBe(1000);

    // Verify credits are NOT counted as revenue
    expect(platformSummary.data?.totalRakeRevenue).toBe(25);

    // Verify table view
    const tableSummary = tableView.getTableSummary(table1, timeRange);
    expect(tableSummary.data?.handsPlayed).toBe(1);
    expect(tableSummary.data?.totalPotVolume).toBe(500);
    expect(tableSummary.data?.totalRake).toBe(50);
    expect(tableSummary.data?.uniquePlayers).toBe(2);

    // Verify access policy
    const policy = createDashboardAccessPolicy();
    policy.registerPlatformAdmin('admin');
    policy.registerClubOwner('owner', club1);
    policy.registerPlayer(player1);

    // Platform admin sees everything
    expect(policy.canViewPlatform('admin').allowed).toBe(true);
    expect(policy.canViewAdminCredits('admin').allowed).toBe(true);

    // Club owner sees own club but not platform
    expect(policy.canViewClub('owner', club1).allowed).toBe(true);
    expect(policy.canViewPlatform('owner').allowed).toBe(false);

    // Player sees own data only
    expect(policy.canViewPlayer(player1, player1).allowed).toBe(true);
    expect(policy.canViewAllPlayers(player1).allowed).toBe(false);
  });

  it('should correctly separate revenue from credits', () => {
    const player1 = createPlayerId('1');
    const club1 = createClubId('1');
    const admin1 = createAdminId('1');

    const entries: AggregationEntry[] = [
      // Admin credit (NOT revenue)
      createEntry('1', 1000, 'TOP_UP', 'PLAYER', 10000, {
        playerId: player1,
        clubId: club1,
        metadata: { adminId: admin1, reason: 'TESTING' },
      }),
      // Rake (IS revenue)
      createEntry('2', 2000, 'HAND_SETTLEMENT', 'PLATFORM', 100, {
        clubId: club1,
      }),
    ];

    const platformView = createPlatformFinanceView(() => entries);
    const summary = platformView.getPlatformSummary(timeRange);

    // Revenue should ONLY be from rake
    expect(summary.data?.totalRakeRevenue).toBe(100);

    // Credits should be tracked separately
    expect(summary.data?.totalCreditsIssued).toBe(10000);

    // These should be completely separate metrics
    expect(summary.data?.totalRakeRevenue).not.toBe(
      summary.data!.totalRakeRevenue + summary.data!.totalCreditsIssued
    );
  });
});
