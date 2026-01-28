/**
 * Revenue Attribution Views Tests
 * Phase 26 - Comprehensive tests for read-only views
 *
 * Tests cover:
 * - Deterministic replay (same input → identical output)
 * - Ordering stability
 * - No mutation (ledger unchanged)
 * - Boundary cases (empty ledger, single entry, large volumes)
 * - Cross-check totals against raw ledger attribution sums
 */

import {
  ValueLedger,
  createValueLedger,
  LedgerRecorder,
  createLedgerRecorder,
  SettlementAttribution,
  TimeFeeAttribution,
  AgentId,
  createPlayerParty,
  createClubParty,
  createAgentParty,
  createPlatformParty,
  resetLedgerCounters,
} from '../../index';

import {
  PlatformRevenueView,
  createPlatformRevenueView,
  ClubRevenueView,
  createClubRevenueView,
  AgentCommissionView,
  createAgentCommissionView,
  TableRakeTimelineView,
  createTableRakeTimelineView,
  TimeWindow,
  calculateTimeBucket,
  isWithinTimeWindow,
} from '../index';

import { PlayerId } from '../../../security/Identity';
import { TableId, HandId } from '../../../security/AuditLog';
import { ClubId } from '../../../club/ClubTypes';
import { createStateVersion } from '../../../sync/SyncTypes';

// ============================================================================
// Test Helpers
// ============================================================================

const TEST_CLUB_ID = 'club_test' as ClubId;
const TEST_CLUB_ID_2 = 'club_test_2' as ClubId;
const TEST_TABLE_ID = 'table_test' as TableId;
const TEST_TABLE_ID_2 = 'table_test_2' as TableId;
const TEST_AGENT_ID = 'agent_test' as AgentId;
const TEST_AGENT_ID_2 = 'agent_test_2' as AgentId;

function createTestPlayer(index: number): PlayerId {
  return `player_${index}` as PlayerId;
}

function createTestHandId(index: number): HandId {
  return `hand_${index}` as HandId;
}

function createTestSettlement(
  handIndex: number,
  clubId: ClubId = TEST_CLUB_ID,
  tableId: TableId = TEST_TABLE_ID,
  agentId?: AgentId
): SettlementAttribution {
  return {
    handId: createTestHandId(handIndex),
    tableId,
    clubId,
    stateVersion: createStateVersion(handIndex),
    potWinners: [
      { playerId: createTestPlayer(handIndex % 3), amount: 90, potType: 'main' },
    ],
    rakeTotal: 10,
    rakeBreakdown: {
      clubShare: 7,
      agentShare: agentId ? 2 : 0,
      agentId,
      platformShare: agentId ? 1 : 3,
    },
  };
}

function createTestTimeFee(
  clubId: ClubId = TEST_CLUB_ID,
  tableId: TableId = TEST_TABLE_ID,
  playerId: PlayerId = createTestPlayer(1),
  amount: number = 50
): TimeFeeAttribution {
  return {
    tableId,
    clubId,
    stateVersion: createStateVersion(1),
    playerId,
    feeAmount: amount,
    periodMinutes: 30,
  };
}

// ============================================================================
// Platform Revenue View Tests
// ============================================================================

describe('PlatformRevenueView', () => {
  let ledger: ValueLedger;
  let recorder: LedgerRecorder;
  let platformView: PlatformRevenueView;

  beforeEach(() => {
    resetLedgerCounters();
    ledger = createValueLedger();
    recorder = createLedgerRecorder(ledger);
    platformView = createPlatformRevenueView(ledger);
  });

  afterEach(() => {
    recorder.clear();
  });

  describe('Basic Queries', () => {
    it('should return empty summary for empty ledger', () => {
      const result = platformView.getSummary();

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.totalRevenue).toBe(0);
      expect(result.data!.entryCount).toBe(0);
    });

    it('should aggregate platform entries correctly', () => {
      recorder.recordSettlement(createTestSettlement(1, TEST_CLUB_ID, TEST_TABLE_ID, TEST_AGENT_ID));
      recorder.recordSettlement(createTestSettlement(2, TEST_CLUB_ID, TEST_TABLE_ID, TEST_AGENT_ID));

      const result = platformView.getSummary();

      expect(result.success).toBe(true);
      expect(result.data!.totalRevenue).toBe(2);  // 2 settlements × 1 platform share
      expect(result.data!.entryCount).toBe(2);
    });

    it('should get total revenue', () => {
      recorder.recordSettlement(createTestSettlement(1, TEST_CLUB_ID, TEST_TABLE_ID, TEST_AGENT_ID));

      const total = platformView.getTotalRevenue();

      expect(total).toBe(1);
    });
  });

  describe('Filtering', () => {
    it('should filter by club', () => {
      recorder.recordSettlement(createTestSettlement(1, TEST_CLUB_ID, TEST_TABLE_ID, TEST_AGENT_ID));
      recorder.recordSettlement(createTestSettlement(2, TEST_CLUB_ID_2, TEST_TABLE_ID_2, TEST_AGENT_ID));

      const result = platformView.getSummary({ clubId: TEST_CLUB_ID });

      expect(result.success).toBe(true);
      expect(result.data!.entryCount).toBe(1);
    });

    it('should filter by table', () => {
      recorder.recordSettlement(createTestSettlement(1, TEST_CLUB_ID, TEST_TABLE_ID, TEST_AGENT_ID));
      recorder.recordSettlement(createTestSettlement(2, TEST_CLUB_ID, TEST_TABLE_ID_2, TEST_AGENT_ID));

      const result = platformView.getSummary({ tableId: TEST_TABLE_ID });

      expect(result.success).toBe(true);
      expect(result.data!.entryCount).toBe(1);
    });

    it('should filter by time window', () => {
      recorder.recordSettlement(createTestSettlement(1));

      const now = Date.now();
      const result = platformView.getSummary({
        timeWindow: {
          fromTimestamp: now - 1000,
          toTimestamp: now + 1000,
        },
      });

      expect(result.success).toBe(true);
    });
  });

  describe('Grouping', () => {
    it('should group by club', () => {
      recorder.recordSettlement(createTestSettlement(1, TEST_CLUB_ID, TEST_TABLE_ID, TEST_AGENT_ID));
      recorder.recordSettlement(createTestSettlement(2, TEST_CLUB_ID_2, TEST_TABLE_ID_2, TEST_AGENT_ID));

      const result = platformView.getSummary({ groupBy: 'CLUB' });

      expect(result.success).toBe(true);
      expect(result.data!.groups.length).toBe(2);
    });

    it('should group by table', () => {
      recorder.recordSettlement(createTestSettlement(1, TEST_CLUB_ID, TEST_TABLE_ID, TEST_AGENT_ID));
      recorder.recordSettlement(createTestSettlement(2, TEST_CLUB_ID, TEST_TABLE_ID_2, TEST_AGENT_ID));

      const result = platformView.getSummary({ groupBy: 'TABLE' });

      expect(result.success).toBe(true);
      expect(result.data!.groups.length).toBe(2);
    });
  });

  describe('Revenue Maps', () => {
    it('should get revenue by club', () => {
      recorder.recordSettlement(createTestSettlement(1, TEST_CLUB_ID, TEST_TABLE_ID, TEST_AGENT_ID));
      recorder.recordSettlement(createTestSettlement(2, TEST_CLUB_ID_2, TEST_TABLE_ID_2, TEST_AGENT_ID));

      const byClub = platformView.getRevenueByClub();

      expect(byClub.size).toBe(2);
      expect(byClub.get(TEST_CLUB_ID)).toBe(1);
      expect(byClub.get(TEST_CLUB_ID_2)).toBe(1);
    });

    it('should get revenue by table', () => {
      recorder.recordSettlement(createTestSettlement(1, TEST_CLUB_ID, TEST_TABLE_ID, TEST_AGENT_ID));
      recorder.recordSettlement(createTestSettlement(2, TEST_CLUB_ID, TEST_TABLE_ID_2, TEST_AGENT_ID));

      const byTable = platformView.getRevenueByTable();

      expect(byTable.size).toBe(2);
    });
  });
});

// ============================================================================
// Club Revenue View Tests
// ============================================================================

describe('ClubRevenueView', () => {
  let ledger: ValueLedger;
  let recorder: LedgerRecorder;
  let clubView: ClubRevenueView;

  beforeEach(() => {
    resetLedgerCounters();
    ledger = createValueLedger();
    recorder = createLedgerRecorder(ledger);
    clubView = createClubRevenueView(ledger);
  });

  afterEach(() => {
    recorder.clear();
  });

  describe('Club Isolation', () => {
    it('should only return data for specified club', () => {
      recorder.recordSettlement(createTestSettlement(1, TEST_CLUB_ID));
      recorder.recordSettlement(createTestSettlement(2, TEST_CLUB_ID_2));

      const result = clubView.getSummary({ clubId: TEST_CLUB_ID });

      expect(result.success).toBe(true);
      // Only entries for TEST_CLUB_ID
      const clubEntries = result.data!.entryCount;
      expect(clubEntries).toBeGreaterThan(0);
    });

    it('should not leak cross-club data', () => {
      recorder.recordSettlement(createTestSettlement(1, TEST_CLUB_ID));
      recorder.recordSettlement(createTestSettlement(2, TEST_CLUB_ID_2));

      const result1 = clubView.getSummary({ clubId: TEST_CLUB_ID });
      const result2 = clubView.getSummary({ clubId: TEST_CLUB_ID_2 });

      // Each should only see their own data
      expect(result1.data!.clubId).toBe(TEST_CLUB_ID);
      expect(result2.data!.clubId).toBe(TEST_CLUB_ID_2);
    });
  });

  describe('Revenue Categorization', () => {
    it('should separate rake from time fees', () => {
      recorder.recordSettlement(createTestSettlement(1, TEST_CLUB_ID));
      recorder.recordTimeFee(createTestTimeFee(TEST_CLUB_ID));

      const result = clubView.getSummary({ clubId: TEST_CLUB_ID });

      expect(result.success).toBe(true);
      expect(result.data!.totalRake).toBeGreaterThanOrEqual(0);
      expect(result.data!.totalTimeFees).toBeGreaterThanOrEqual(0);
    });

    it('should get rake revenue separately', () => {
      recorder.recordSettlement(createTestSettlement(1, TEST_CLUB_ID));

      const rakeRevenue = clubView.getRakeRevenue(TEST_CLUB_ID);

      expect(rakeRevenue).toBeGreaterThanOrEqual(0);
    });

    it('should get time fee revenue separately', () => {
      recorder.recordTimeFee(createTestTimeFee(TEST_CLUB_ID));

      const timeFeeRevenue = clubView.getTimeFeeRevenue(TEST_CLUB_ID);

      expect(timeFeeRevenue).toBe(50);  // Fee amount from helper
    });
  });

  describe('Grouping', () => {
    it('should group by table', () => {
      recorder.recordSettlement(createTestSettlement(1, TEST_CLUB_ID, TEST_TABLE_ID));
      recorder.recordSettlement(createTestSettlement(2, TEST_CLUB_ID, TEST_TABLE_ID_2));

      const result = clubView.getSummary({
        clubId: TEST_CLUB_ID,
        groupBy: 'TABLE',
      });

      expect(result.success).toBe(true);
      expect(result.data!.groups.length).toBe(2);
    });

    it('should group by source', () => {
      recorder.recordSettlement(createTestSettlement(1, TEST_CLUB_ID));
      recorder.recordTimeFee(createTestTimeFee(TEST_CLUB_ID));

      const result = clubView.getSummary({
        clubId: TEST_CLUB_ID,
        groupBy: 'SOURCE',
      });

      expect(result.success).toBe(true);
      expect(result.data!.groups.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Revenue Maps', () => {
    it('should get revenue by table', () => {
      recorder.recordSettlement(createTestSettlement(1, TEST_CLUB_ID, TEST_TABLE_ID));
      recorder.recordSettlement(createTestSettlement(2, TEST_CLUB_ID, TEST_TABLE_ID_2));

      const byTable = clubView.getRevenueByTable(TEST_CLUB_ID);

      expect(byTable.size).toBe(2);
    });

    it('should get revenue by source', () => {
      recorder.recordSettlement(createTestSettlement(1, TEST_CLUB_ID));
      recorder.recordTimeFee(createTestTimeFee(TEST_CLUB_ID));

      const bySource = clubView.getRevenueBySource(TEST_CLUB_ID);

      expect(bySource.size).toBeGreaterThanOrEqual(1);
    });
  });
});

// ============================================================================
// Agent Commission View Tests
// ============================================================================

describe('AgentCommissionView', () => {
  let ledger: ValueLedger;
  let recorder: LedgerRecorder;
  let agentView: AgentCommissionView;

  beforeEach(() => {
    resetLedgerCounters();
    ledger = createValueLedger();
    recorder = createLedgerRecorder(ledger);
    agentView = createAgentCommissionView(ledger);
  });

  afterEach(() => {
    recorder.clear();
  });

  describe('Basic Queries', () => {
    it('should return error without agent ID for summary', () => {
      const result = agentView.getSummary({});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Agent ID is required');
    });

    it('should aggregate agent entries correctly', () => {
      recorder.recordSettlement(createTestSettlement(1, TEST_CLUB_ID, TEST_TABLE_ID, TEST_AGENT_ID));
      recorder.recordSettlement(createTestSettlement(2, TEST_CLUB_ID, TEST_TABLE_ID, TEST_AGENT_ID));

      const result = agentView.getSummary({ agentId: TEST_AGENT_ID });

      expect(result.success).toBe(true);
      expect(result.data!.totalCommission).toBe(4);  // 2 settlements × 2 agent share
      expect(result.data!.entryCount).toBe(2);
    });

    it('should get total commission', () => {
      recorder.recordSettlement(createTestSettlement(1, TEST_CLUB_ID, TEST_TABLE_ID, TEST_AGENT_ID));

      const total = agentView.getTotalCommission(TEST_AGENT_ID);

      expect(total).toBe(2);
    });
  });

  describe('Agent Isolation', () => {
    it('should only return data for specified agent', () => {
      recorder.recordSettlement(createTestSettlement(1, TEST_CLUB_ID, TEST_TABLE_ID, TEST_AGENT_ID));
      recorder.recordSettlement(createTestSettlement(2, TEST_CLUB_ID, TEST_TABLE_ID, TEST_AGENT_ID_2));

      const result1 = agentView.getSummary({ agentId: TEST_AGENT_ID });
      const result2 = agentView.getSummary({ agentId: TEST_AGENT_ID_2 });

      expect(result1.data!.agentId).toBe(TEST_AGENT_ID);
      expect(result2.data!.agentId).toBe(TEST_AGENT_ID_2);
      expect(result1.data!.entryCount).toBe(1);
      expect(result2.data!.entryCount).toBe(1);
    });
  });

  describe('Rollup', () => {
    it('should rollup all agents', () => {
      recorder.recordSettlement(createTestSettlement(1, TEST_CLUB_ID, TEST_TABLE_ID, TEST_AGENT_ID));
      recorder.recordSettlement(createTestSettlement(2, TEST_CLUB_ID, TEST_TABLE_ID, TEST_AGENT_ID_2));

      const result = agentView.getRollup();

      expect(result.success).toBe(true);
      expect(result.data!.agentCount).toBe(2);
      expect(result.data!.totalCommission).toBe(4);  // 2 agents × 2 each
    });

    it('should list all agent IDs', () => {
      recorder.recordSettlement(createTestSettlement(1, TEST_CLUB_ID, TEST_TABLE_ID, TEST_AGENT_ID));
      recorder.recordSettlement(createTestSettlement(2, TEST_CLUB_ID, TEST_TABLE_ID, TEST_AGENT_ID_2));

      const agentIds = agentView.getAgentIds();

      expect(agentIds.length).toBe(2);
      expect(agentIds).toContain(TEST_AGENT_ID);
      expect(agentIds).toContain(TEST_AGENT_ID_2);
    });
  });

  describe('Commission Maps', () => {
    it('should get commission by club', () => {
      recorder.recordSettlement(createTestSettlement(1, TEST_CLUB_ID, TEST_TABLE_ID, TEST_AGENT_ID));
      recorder.recordSettlement(createTestSettlement(2, TEST_CLUB_ID_2, TEST_TABLE_ID_2, TEST_AGENT_ID));

      const byClub = agentView.getCommissionByClub(TEST_AGENT_ID);

      expect(byClub.size).toBe(2);
    });
  });
});

// ============================================================================
// Table Rake Timeline View Tests
// ============================================================================

describe('TableRakeTimelineView', () => {
  let ledger: ValueLedger;
  let recorder: LedgerRecorder;
  let timelineView: TableRakeTimelineView;

  beforeEach(() => {
    resetLedgerCounters();
    ledger = createValueLedger();
    recorder = createLedgerRecorder(ledger);
    timelineView = createTableRakeTimelineView(ledger);
  });

  afterEach(() => {
    recorder.clear();
  });

  describe('Basic Queries', () => {
    it('should return empty timeline for empty ledger', () => {
      const result = timelineView.getTimeline({ tableId: TEST_TABLE_ID });

      expect(result.success).toBe(true);
      expect(result.data!.entries.length).toBe(0);
      expect(result.data!.totalRake).toBe(0);
    });

    it('should get timeline with entries', () => {
      recorder.recordSettlement(createTestSettlement(1, TEST_CLUB_ID, TEST_TABLE_ID, TEST_AGENT_ID));
      recorder.recordSettlement(createTestSettlement(2, TEST_CLUB_ID, TEST_TABLE_ID, TEST_AGENT_ID));

      const result = timelineView.getTimeline({ tableId: TEST_TABLE_ID });

      expect(result.success).toBe(true);
      expect(result.data!.entries.length).toBe(2);
      expect(result.data!.handCount).toBe(2);
    });

    it('should include breakdown when requested', () => {
      recorder.recordSettlement(createTestSettlement(1, TEST_CLUB_ID, TEST_TABLE_ID, TEST_AGENT_ID));

      const result = timelineView.getTimeline({
        tableId: TEST_TABLE_ID,
        includeBreakdown: true,
      });

      expect(result.success).toBe(true);
      // Breakdown should be present if there are rake share entries
      const entry = result.data!.entries[0];
      expect(entry).toBeDefined();
    });

    it('should get total rake', () => {
      recorder.recordSettlement(createTestSettlement(1, TEST_CLUB_ID, TEST_TABLE_ID, TEST_AGENT_ID));
      recorder.recordSettlement(createTestSettlement(2, TEST_CLUB_ID, TEST_TABLE_ID, TEST_AGENT_ID));

      const total = timelineView.getTotalRake(TEST_TABLE_ID);

      expect(total).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Hand Queries', () => {
    it('should get rake for specific hand', () => {
      recorder.recordSettlement(createTestSettlement(1, TEST_CLUB_ID, TEST_TABLE_ID, TEST_AGENT_ID));

      const result = timelineView.getHandRake(TEST_TABLE_ID, createTestHandId(1));

      expect(result.success).toBe(true);
    });

    it('should return undefined for non-existent hand', () => {
      const result = timelineView.getHandRake(TEST_TABLE_ID, 'non_existent' as HandId);

      expect(result.success).toBe(true);
      expect(result.data).toBeUndefined();
    });

    it('should get rake by hand map', () => {
      recorder.recordSettlement(createTestSettlement(1, TEST_CLUB_ID, TEST_TABLE_ID, TEST_AGENT_ID));
      recorder.recordSettlement(createTestSettlement(2, TEST_CLUB_ID, TEST_TABLE_ID, TEST_AGENT_ID));

      const byHand = timelineView.getRakeByHand(TEST_TABLE_ID);

      expect(byHand.size).toBe(2);
    });
  });

  describe('Timeline Comparison', () => {
    it('should compare identical timelines', () => {
      recorder.recordSettlement(createTestSettlement(1, TEST_CLUB_ID, TEST_TABLE_ID, TEST_AGENT_ID));

      const timeline1 = timelineView.getTimeline({ tableId: TEST_TABLE_ID });
      const timeline2 = timelineView.getTimeline({ tableId: TEST_TABLE_ID });

      const comparison = timelineView.compareTimelines(
        timeline1.data!,
        timeline2.data!
      );

      expect(comparison.matches).toBe(true);
      expect(comparison.matchingEntries).toBe(comparison.entryCount);
    });

    it('should verify timeline against ledger', () => {
      recorder.recordSettlement(createTestSettlement(1, TEST_CLUB_ID, TEST_TABLE_ID, TEST_AGENT_ID));

      // Note: verifyTimeline always fetches with includeBreakdown: true,
      // so we need to match that for a valid comparison
      const timeline = timelineView.getTimeline({
        tableId: TEST_TABLE_ID,
        includeBreakdown: true,
      });
      const verification = timelineView.verifyTimeline(timeline.data!);

      expect(verification.matches).toBe(true);
    });
  });

  describe('Pagination', () => {
    it('should support limit and offset', () => {
      // Record multiple settlements
      for (let i = 1; i <= 5; i++) {
        recorder.recordSettlement(createTestSettlement(i, TEST_CLUB_ID, TEST_TABLE_ID, TEST_AGENT_ID));
      }

      const result = timelineView.getTimeline({
        tableId: TEST_TABLE_ID,
        limit: 2,
        offset: 1,
      });

      expect(result.success).toBe(true);
      expect(result.data!.entries.length).toBe(2);
    });
  });
});

// ============================================================================
// Deterministic Replay Tests
// ============================================================================

describe('Deterministic Replay', () => {
  let ledger: ValueLedger;
  let recorder: LedgerRecorder;

  beforeEach(() => {
    resetLedgerCounters();
    ledger = createValueLedger();
    recorder = createLedgerRecorder(ledger);
  });

  afterEach(() => {
    recorder.clear();
  });

  it('should produce identical platform view results for same input', () => {
    recorder.recordSettlement(createTestSettlement(1, TEST_CLUB_ID, TEST_TABLE_ID, TEST_AGENT_ID));
    recorder.recordSettlement(createTestSettlement(2, TEST_CLUB_ID, TEST_TABLE_ID, TEST_AGENT_ID));

    const platformView = createPlatformRevenueView(ledger);

    const result1 = platformView.getSummary();
    const result2 = platformView.getSummary();

    expect(result1.data!.totalRevenue).toBe(result2.data!.totalRevenue);
    expect(result1.data!.entryCount).toBe(result2.data!.entryCount);
  });

  it('should produce identical club view results for same input', () => {
    recorder.recordSettlement(createTestSettlement(1, TEST_CLUB_ID));

    const clubView = createClubRevenueView(ledger);

    const result1 = clubView.getSummary({ clubId: TEST_CLUB_ID });
    const result2 = clubView.getSummary({ clubId: TEST_CLUB_ID });

    expect(result1.data!.totalRevenue).toBe(result2.data!.totalRevenue);
    expect(result1.data!.entryCount).toBe(result2.data!.entryCount);
  });

  it('should produce identical agent view results for same input', () => {
    recorder.recordSettlement(createTestSettlement(1, TEST_CLUB_ID, TEST_TABLE_ID, TEST_AGENT_ID));

    const agentView = createAgentCommissionView(ledger);

    const result1 = agentView.getSummary({ agentId: TEST_AGENT_ID });
    const result2 = agentView.getSummary({ agentId: TEST_AGENT_ID });

    expect(result1.data!.totalCommission).toBe(result2.data!.totalCommission);
    expect(result1.data!.entryCount).toBe(result2.data!.entryCount);
  });

  it('should produce identical timeline results for same input', () => {
    recorder.recordSettlement(createTestSettlement(1, TEST_CLUB_ID, TEST_TABLE_ID, TEST_AGENT_ID));

    const timelineView = createTableRakeTimelineView(ledger);

    const result1 = timelineView.getTimeline({ tableId: TEST_TABLE_ID });
    const result2 = timelineView.getTimeline({ tableId: TEST_TABLE_ID });

    expect(result1.data!.totalRake).toBe(result2.data!.totalRake);
    expect(result1.data!.entries.length).toBe(result2.data!.entries.length);
  });
});

// ============================================================================
// Ordering Stability Tests
// ============================================================================

describe('Ordering Stability', () => {
  let ledger: ValueLedger;
  let recorder: LedgerRecorder;

  beforeEach(() => {
    resetLedgerCounters();
    ledger = createValueLedger();
    recorder = createLedgerRecorder(ledger);
  });

  afterEach(() => {
    recorder.clear();
  });

  it('should maintain stable ordering in platform view', () => {
    // Record in specific order
    recorder.recordSettlement(createTestSettlement(3, TEST_CLUB_ID, TEST_TABLE_ID, TEST_AGENT_ID));
    recorder.recordSettlement(createTestSettlement(1, TEST_CLUB_ID, TEST_TABLE_ID, TEST_AGENT_ID));
    recorder.recordSettlement(createTestSettlement(2, TEST_CLUB_ID, TEST_TABLE_ID, TEST_AGENT_ID));

    const platformView = createPlatformRevenueView(ledger);
    const result = platformView.getEntries({});

    // Entries should be sorted by timestamp
    const entries = result.data!;
    for (let i = 1; i < entries.length; i++) {
      expect(entries[i].timestamp).toBeGreaterThanOrEqual(entries[i - 1].timestamp);
    }
  });

  it('should maintain stable ordering in timeline view', () => {
    recorder.recordSettlement(createTestSettlement(3, TEST_CLUB_ID, TEST_TABLE_ID, TEST_AGENT_ID));
    recorder.recordSettlement(createTestSettlement(1, TEST_CLUB_ID, TEST_TABLE_ID, TEST_AGENT_ID));
    recorder.recordSettlement(createTestSettlement(2, TEST_CLUB_ID, TEST_TABLE_ID, TEST_AGENT_ID));

    const timelineView = createTableRakeTimelineView(ledger);
    const result = timelineView.getTimeline({ tableId: TEST_TABLE_ID });

    const entries = result.data!.entries;
    for (let i = 1; i < entries.length; i++) {
      expect(entries[i].timestamp).toBeGreaterThanOrEqual(entries[i - 1].timestamp);
    }
  });
});

// ============================================================================
// No Mutation Tests
// ============================================================================

describe('No Mutation', () => {
  let ledger: ValueLedger;
  let recorder: LedgerRecorder;

  beforeEach(() => {
    resetLedgerCounters();
    ledger = createValueLedger();
    recorder = createLedgerRecorder(ledger);
  });

  afterEach(() => {
    recorder.clear();
  });

  it('should not mutate ledger when querying platform view', () => {
    recorder.recordSettlement(createTestSettlement(1, TEST_CLUB_ID, TEST_TABLE_ID, TEST_AGENT_ID));

    const entriesBefore = ledger.getAllEntries().length;

    const platformView = createPlatformRevenueView(ledger);
    platformView.getSummary();
    platformView.getEntries({});
    platformView.getTotalRevenue();

    const entriesAfter = ledger.getAllEntries().length;

    expect(entriesAfter).toBe(entriesBefore);
  });

  it('should not mutate ledger when querying club view', () => {
    recorder.recordSettlement(createTestSettlement(1, TEST_CLUB_ID));

    const entriesBefore = ledger.getAllEntries().length;

    const clubView = createClubRevenueView(ledger);
    clubView.getSummary({ clubId: TEST_CLUB_ID });
    clubView.getTotalRevenue(TEST_CLUB_ID);

    const entriesAfter = ledger.getAllEntries().length;

    expect(entriesAfter).toBe(entriesBefore);
  });

  it('should not mutate ledger when querying agent view', () => {
    recorder.recordSettlement(createTestSettlement(1, TEST_CLUB_ID, TEST_TABLE_ID, TEST_AGENT_ID));

    const entriesBefore = ledger.getAllEntries().length;

    const agentView = createAgentCommissionView(ledger);
    agentView.getSummary({ agentId: TEST_AGENT_ID });
    agentView.getRollup();

    const entriesAfter = ledger.getAllEntries().length;

    expect(entriesAfter).toBe(entriesBefore);
  });
});

// ============================================================================
// Boundary Tests
// ============================================================================

describe('Boundary Tests', () => {
  let ledger: ValueLedger;
  let recorder: LedgerRecorder;

  beforeEach(() => {
    resetLedgerCounters();
    ledger = createValueLedger();
    recorder = createLedgerRecorder(ledger);
  });

  afterEach(() => {
    recorder.clear();
  });

  it('should handle empty ledger gracefully', () => {
    const platformView = createPlatformRevenueView(ledger);
    const clubView = createClubRevenueView(ledger);
    const agentView = createAgentCommissionView(ledger);
    const timelineView = createTableRakeTimelineView(ledger);

    expect(platformView.getSummary().success).toBe(true);
    expect(clubView.getSummary({ clubId: TEST_CLUB_ID }).success).toBe(true);
    expect(agentView.getEntries({}).success).toBe(true);
    expect(timelineView.getTimeline({ tableId: TEST_TABLE_ID }).success).toBe(true);
  });

  it('should handle single entry', () => {
    recorder.recordSettlement(createTestSettlement(1, TEST_CLUB_ID, TEST_TABLE_ID, TEST_AGENT_ID));

    const platformView = createPlatformRevenueView(ledger);
    const clubView = createClubRevenueView(ledger);
    const agentView = createAgentCommissionView(ledger);
    const timelineView = createTableRakeTimelineView(ledger);

    expect(platformView.getSummary().success).toBe(true);
    expect(clubView.getSummary({ clubId: TEST_CLUB_ID }).success).toBe(true);
    expect(agentView.getSummary({ agentId: TEST_AGENT_ID }).success).toBe(true);
    expect(timelineView.getTimeline({ tableId: TEST_TABLE_ID }).success).toBe(true);
  });

  it('should handle large volume', () => {
    // Record many settlements
    for (let i = 1; i <= 100; i++) {
      recorder.recordSettlement(
        createTestSettlement(i, TEST_CLUB_ID, TEST_TABLE_ID, TEST_AGENT_ID)
      );
    }

    const platformView = createPlatformRevenueView(ledger);
    const result = platformView.getSummary();

    expect(result.success).toBe(true);
    expect(result.data!.entryCount).toBe(100);
  });
});

// ============================================================================
// Cross-Check Tests
// ============================================================================

describe('Cross-Check Totals', () => {
  let ledger: ValueLedger;
  let recorder: LedgerRecorder;

  beforeEach(() => {
    resetLedgerCounters();
    ledger = createValueLedger();
    recorder = createLedgerRecorder(ledger);
  });

  afterEach(() => {
    recorder.clear();
  });

  it('should match raw ledger attribution sums for platform', () => {
    recorder.recordSettlement(createTestSettlement(1, TEST_CLUB_ID, TEST_TABLE_ID, TEST_AGENT_ID));
    recorder.recordSettlement(createTestSettlement(2, TEST_CLUB_ID, TEST_TABLE_ID, TEST_AGENT_ID));

    // Calculate from raw ledger
    let rawTotal = 0;
    for (const entry of ledger.getAllEntries()) {
      if (entry.affectedParty.partyType === 'PLATFORM') {
        rawTotal += entry.delta;
      }
    }

    // Calculate from view
    const platformView = createPlatformRevenueView(ledger);
    const viewTotal = platformView.getTotalRevenue();

    expect(viewTotal).toBe(rawTotal);
  });

  it('should match raw ledger attribution sums for club', () => {
    recorder.recordSettlement(createTestSettlement(1, TEST_CLUB_ID));
    recorder.recordSettlement(createTestSettlement(2, TEST_CLUB_ID));

    // Calculate from raw ledger
    let rawTotal = 0;
    for (const entry of ledger.getAllEntries()) {
      if (
        entry.affectedParty.partyType === 'CLUB' &&
        entry.affectedParty.clubId === TEST_CLUB_ID
      ) {
        rawTotal += entry.delta;
      }
    }

    // Calculate from view
    const clubView = createClubRevenueView(ledger);
    const viewTotal = clubView.getTotalRevenue(TEST_CLUB_ID);

    expect(viewTotal).toBe(rawTotal);
  });

  it('should match raw ledger attribution sums for agent', () => {
    recorder.recordSettlement(createTestSettlement(1, TEST_CLUB_ID, TEST_TABLE_ID, TEST_AGENT_ID));
    recorder.recordSettlement(createTestSettlement(2, TEST_CLUB_ID, TEST_TABLE_ID, TEST_AGENT_ID));

    // Calculate from raw ledger
    let rawTotal = 0;
    for (const entry of ledger.getAllEntries()) {
      if (
        entry.affectedParty.partyType === 'AGENT' &&
        entry.affectedParty.agentId === TEST_AGENT_ID
      ) {
        rawTotal += entry.delta;
      }
    }

    // Calculate from view
    const agentView = createAgentCommissionView(ledger);
    const viewTotal = agentView.getTotalCommission(TEST_AGENT_ID);

    expect(viewTotal).toBe(rawTotal);
  });
});

// ============================================================================
// Utility Function Tests
// ============================================================================

describe('Utility Functions', () => {
  describe('calculateTimeBucket', () => {
    it('should calculate hour bucket', () => {
      const timestamp = new Date('2024-01-15T14:30:00Z').getTime();
      const result = calculateTimeBucket(timestamp, 'HOUR');

      expect(result.bucketKey).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}$/);
      expect(result.bucket.granularity).toBe('HOUR');
    });

    it('should calculate day bucket', () => {
      const timestamp = new Date('2024-01-15T14:30:00Z').getTime();
      const result = calculateTimeBucket(timestamp, 'DAY');

      expect(result.bucketKey).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(result.bucket.granularity).toBe('DAY');
    });

    it('should calculate week bucket', () => {
      const timestamp = new Date('2024-01-15T14:30:00Z').getTime();
      const result = calculateTimeBucket(timestamp, 'WEEK');

      expect(result.bucketKey).toMatch(/^W\d{4}-\d{2}-\d{2}$/);
      expect(result.bucket.granularity).toBe('WEEK');
    });

    it('should calculate month bucket', () => {
      const timestamp = new Date('2024-01-15T14:30:00Z').getTime();
      const result = calculateTimeBucket(timestamp, 'MONTH');

      expect(result.bucketKey).toMatch(/^\d{4}-\d{2}$/);
      expect(result.bucket.granularity).toBe('MONTH');
    });
  });

  describe('isWithinTimeWindow', () => {
    it('should return true for timestamp within window', () => {
      const window: TimeWindow = {
        fromTimestamp: 1000,
        toTimestamp: 3000,
      };

      expect(isWithinTimeWindow(2000, window)).toBe(true);
    });

    it('should return false for timestamp outside window', () => {
      const window: TimeWindow = {
        fromTimestamp: 1000,
        toTimestamp: 3000,
      };

      expect(isWithinTimeWindow(500, window)).toBe(false);
      expect(isWithinTimeWindow(4000, window)).toBe(false);
    });

    it('should return true for undefined window', () => {
      expect(isWithinTimeWindow(2000, undefined)).toBe(true);
    });
  });
});
