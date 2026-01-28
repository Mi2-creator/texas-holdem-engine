/**
 * Admin Revenue Reports Tests
 * Phase 27 - Comprehensive tests for read-only reporting
 *
 * Tests cover:
 * - Deterministic output tests
 * - Export stability tests (same input → same output)
 * - Cross-check against Phase 26 views
 * - No mutation tests
 * - Large dataset aggregation tests
 */

import {
  ValueLedger,
  createValueLedger,
  LedgerRecorder,
  createLedgerRecorder,
  SettlementAttribution,
  TimeFeeAttribution,
  AgentId,
  resetLedgerCounters,
} from '../../../ledger';

import {
  PlatformRevenueView,
  createPlatformRevenueView,
  ClubRevenueView,
  createClubRevenueView,
  AgentCommissionView,
  createAgentCommissionView,
  TableRakeTimelineView,
  createTableRakeTimelineView,
} from '../../../ledger/views';

import {
  PlatformRevenueReport,
  createPlatformRevenueReport,
  ClubRevenueReport,
  createClubRevenueReport,
  AgentCommissionReport,
  createAgentCommissionReport,
  TableSessionReport,
  createTableSessionReport,
  exportToJson,
  exportPlatformRevenueJson,
  exportClubRevenueCsv,
  exportAgentCommissionCsv,
  exportTableSessionCsv,
  parseCsv,
  parseJsonExport,
  createReportTimeWindow,
  isValidTimeWindow,
  integerAverage,
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

function createTestTimeWindow(): { fromTimestamp: number; toTimestamp: number } {
  const now = Date.now();
  return {
    fromTimestamp: now - 24 * 60 * 60 * 1000,
    toTimestamp: now + 1000,
  };
}

// ============================================================================
// Platform Revenue Report Tests
// ============================================================================

describe('PlatformRevenueReport', () => {
  let ledger: ValueLedger;
  let recorder: LedgerRecorder;
  let platformView: PlatformRevenueView;
  let report: PlatformRevenueReport;

  beforeEach(() => {
    resetLedgerCounters();
    ledger = createValueLedger();
    recorder = createLedgerRecorder(ledger);
    platformView = createPlatformRevenueView(ledger);
    report = createPlatformRevenueReport(platformView);
  });

  afterEach(() => {
    recorder.clear();
  });

  describe('Report Generation', () => {
    it('should generate empty report for empty ledger', () => {
      const result = report.generate({
        timeWindow: createTestTimeWindow(),
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.totalRevenue).toBe(0);
      expect(result.data!.totalEntries).toBe(0);
    });

    it('should generate report with data', () => {
      recorder.recordSettlement(createTestSettlement(1, TEST_CLUB_ID, TEST_TABLE_ID, TEST_AGENT_ID));
      recorder.recordSettlement(createTestSettlement(2, TEST_CLUB_ID, TEST_TABLE_ID, TEST_AGENT_ID));

      const result = report.generate({
        timeWindow: createTestTimeWindow(),
      });

      expect(result.success).toBe(true);
      expect(result.data!.totalRevenue).toBe(2);  // 2 × 1 platform share
      expect(result.data!.totalEntries).toBe(2);
    });

    it('should include period breakdown', () => {
      recorder.recordSettlement(createTestSettlement(1, TEST_CLUB_ID, TEST_TABLE_ID, TEST_AGENT_ID));

      const result = report.generate({
        timeWindow: createTestTimeWindow(),
        granularity: 'DAY',
      });

      expect(result.success).toBe(true);
      expect(result.data!.periodBreakdown.length).toBeGreaterThan(0);
    });

    it('should include club breakdown when requested', () => {
      recorder.recordSettlement(createTestSettlement(1, TEST_CLUB_ID, TEST_TABLE_ID, TEST_AGENT_ID));
      recorder.recordSettlement(createTestSettlement(2, TEST_CLUB_ID_2, TEST_TABLE_ID_2, TEST_AGENT_ID));

      const result = report.generate({
        timeWindow: createTestTimeWindow(),
        includeClubBreakdown: true,
      });

      expect(result.success).toBe(true);
      expect(result.data!.clubBreakdown).toBeDefined();
      expect(result.data!.clubBreakdown!.length).toBe(2);
    });

    it('should include table breakdown when requested', () => {
      recorder.recordSettlement(createTestSettlement(1, TEST_CLUB_ID, TEST_TABLE_ID, TEST_AGENT_ID));
      recorder.recordSettlement(createTestSettlement(2, TEST_CLUB_ID, TEST_TABLE_ID_2, TEST_AGENT_ID));

      const result = report.generate({
        timeWindow: createTestTimeWindow(),
        includeTableBreakdown: true,
      });

      expect(result.success).toBe(true);
      expect(result.data!.tableBreakdown).toBeDefined();
      expect(result.data!.tableBreakdown!.length).toBe(2);
    });
  });

  describe('Quick Queries', () => {
    it('should get total revenue', () => {
      recorder.recordSettlement(createTestSettlement(1, TEST_CLUB_ID, TEST_TABLE_ID, TEST_AGENT_ID));

      const total = report.getTotalRevenue(createTestTimeWindow());

      expect(total).toBe(1);
    });

    it('should get revenue by club', () => {
      recorder.recordSettlement(createTestSettlement(1, TEST_CLUB_ID, TEST_TABLE_ID, TEST_AGENT_ID));
      recorder.recordSettlement(createTestSettlement(2, TEST_CLUB_ID_2, TEST_TABLE_ID_2, TEST_AGENT_ID));

      const byClub = report.getRevenueByClub(createTestTimeWindow());

      expect(byClub.size).toBe(2);
    });
  });
});

// ============================================================================
// Club Revenue Report Tests
// ============================================================================

describe('ClubRevenueReport', () => {
  let ledger: ValueLedger;
  let recorder: LedgerRecorder;
  let clubView: ClubRevenueView;
  let report: ClubRevenueReport;

  beforeEach(() => {
    resetLedgerCounters();
    ledger = createValueLedger();
    recorder = createLedgerRecorder(ledger);
    clubView = createClubRevenueView(ledger);
    report = createClubRevenueReport(clubView);
  });

  afterEach(() => {
    recorder.clear();
  });

  describe('Report Generation', () => {
    it('should generate report for specific club', () => {
      recorder.recordSettlement(createTestSettlement(1, TEST_CLUB_ID));
      recorder.recordTimeFee(createTestTimeFee(TEST_CLUB_ID));

      const result = report.generate({
        clubId: TEST_CLUB_ID,
        timeWindow: createTestTimeWindow(),
      });

      expect(result.success).toBe(true);
      expect(result.data!.clubId).toBe(TEST_CLUB_ID);
    });

    it('should separate rake and time fees', () => {
      recorder.recordSettlement(createTestSettlement(1, TEST_CLUB_ID));
      recorder.recordTimeFee(createTestTimeFee(TEST_CLUB_ID));

      const result = report.generate({
        clubId: TEST_CLUB_ID,
        timeWindow: createTestTimeWindow(),
      });

      expect(result.success).toBe(true);
      expect(result.data!.totalTimeFees).toBe(50);
    });

    it('should include table breakdown when requested', () => {
      recorder.recordSettlement(createTestSettlement(1, TEST_CLUB_ID, TEST_TABLE_ID));
      recorder.recordSettlement(createTestSettlement(2, TEST_CLUB_ID, TEST_TABLE_ID_2));

      const result = report.generate({
        clubId: TEST_CLUB_ID,
        timeWindow: createTestTimeWindow(),
        includeTableBreakdown: true,
      });

      expect(result.success).toBe(true);
      expect(result.data!.tableBreakdown).toBeDefined();
      expect(result.data!.tableBreakdown!.length).toBe(2);
    });
  });

  describe('Revenue Breakdown', () => {
    it('should get revenue breakdown', () => {
      recorder.recordSettlement(createTestSettlement(1, TEST_CLUB_ID));
      recorder.recordTimeFee(createTestTimeFee(TEST_CLUB_ID));

      const breakdown = report.getRevenueBreakdown(TEST_CLUB_ID, createTestTimeWindow());

      expect(breakdown.timeFees).toBe(50);
    });
  });
});

// ============================================================================
// Agent Commission Report Tests
// ============================================================================

describe('AgentCommissionReport', () => {
  let ledger: ValueLedger;
  let recorder: LedgerRecorder;
  let agentView: AgentCommissionView;
  let report: AgentCommissionReport;

  beforeEach(() => {
    resetLedgerCounters();
    ledger = createValueLedger();
    recorder = createLedgerRecorder(ledger);
    agentView = createAgentCommissionView(ledger);
    report = createAgentCommissionReport(agentView);
  });

  afterEach(() => {
    recorder.clear();
  });

  describe('Single Agent Report', () => {
    it('should generate report for single agent', () => {
      recorder.recordSettlement(createTestSettlement(1, TEST_CLUB_ID, TEST_TABLE_ID, TEST_AGENT_ID));
      recorder.recordSettlement(createTestSettlement(2, TEST_CLUB_ID, TEST_TABLE_ID, TEST_AGENT_ID));

      const result = report.generate({
        timeWindow: createTestTimeWindow(),
        agentId: TEST_AGENT_ID,
      });

      expect(result.success).toBe(true);
      expect(result.data!.agentCount).toBe(1);
      expect(result.data!.agents[0].agentId).toBe(TEST_AGENT_ID);
      expect(result.data!.totalCommission).toBe(4);
    });
  });

  describe('Rollup Report', () => {
    it('should generate rollup for all agents', () => {
      recorder.recordSettlement(createTestSettlement(1, TEST_CLUB_ID, TEST_TABLE_ID, TEST_AGENT_ID));
      recorder.recordSettlement(createTestSettlement(2, TEST_CLUB_ID, TEST_TABLE_ID, TEST_AGENT_ID_2));

      const result = report.generate({
        timeWindow: createTestTimeWindow(),
      });

      expect(result.success).toBe(true);
      expect(result.data!.agentCount).toBe(2);
      expect(result.data!.totalCommission).toBe(4);
    });
  });

  describe('Quick Queries', () => {
    it('should get total commission for agent', () => {
      recorder.recordSettlement(createTestSettlement(1, TEST_CLUB_ID, TEST_TABLE_ID, TEST_AGENT_ID));

      const total = report.getTotalCommission(TEST_AGENT_ID, createTestTimeWindow());

      expect(total).toBe(2);
    });

    it('should list all agent IDs', () => {
      recorder.recordSettlement(createTestSettlement(1, TEST_CLUB_ID, TEST_TABLE_ID, TEST_AGENT_ID));
      recorder.recordSettlement(createTestSettlement(2, TEST_CLUB_ID, TEST_TABLE_ID, TEST_AGENT_ID_2));

      const agentIds = report.getAgentIds(createTestTimeWindow());

      expect(agentIds.length).toBe(2);
    });
  });
});

// ============================================================================
// Table Session Report Tests
// ============================================================================

describe('TableSessionReport', () => {
  let ledger: ValueLedger;
  let recorder: LedgerRecorder;
  let timelineView: TableRakeTimelineView;
  let report: TableSessionReport;

  beforeEach(() => {
    resetLedgerCounters();
    ledger = createValueLedger();
    recorder = createLedgerRecorder(ledger);
    timelineView = createTableRakeTimelineView(ledger);
    report = createTableSessionReport(timelineView);
  });

  afterEach(() => {
    recorder.clear();
  });

  describe('Report Generation', () => {
    it('should generate table session report', () => {
      recorder.recordSettlement(createTestSettlement(1, TEST_CLUB_ID, TEST_TABLE_ID, TEST_AGENT_ID));
      recorder.recordSettlement(createTestSettlement(2, TEST_CLUB_ID, TEST_TABLE_ID, TEST_AGENT_ID));

      const result = report.generate({
        tableId: TEST_TABLE_ID,
        timeWindow: createTestTimeWindow(),
      });

      expect(result.success).toBe(true);
      expect(result.data!.summary.tableId).toBe(TEST_TABLE_ID);
      expect(result.data!.summary.handCount).toBe(2);
    });

    it('should include hand details when requested', () => {
      recorder.recordSettlement(createTestSettlement(1, TEST_CLUB_ID, TEST_TABLE_ID, TEST_AGENT_ID));

      const result = report.generate({
        tableId: TEST_TABLE_ID,
        timeWindow: createTestTimeWindow(),
        includeHandDetails: true,
      });

      expect(result.success).toBe(true);
      expect(result.data!.hands).toBeDefined();
    });

    it('should support pagination', () => {
      for (let i = 1; i <= 10; i++) {
        recorder.recordSettlement(createTestSettlement(i, TEST_CLUB_ID, TEST_TABLE_ID, TEST_AGENT_ID));
      }

      const result = report.generate({
        tableId: TEST_TABLE_ID,
        timeWindow: createTestTimeWindow(),
        limit: 3,
        offset: 0,
      });

      expect(result.success).toBe(true);
      expect(result.data!.pagination).toBeDefined();
      expect(result.data!.pagination!.limit).toBe(3);
      expect(result.data!.pagination!.hasMore).toBe(true);
    });
  });

  describe('Quick Queries', () => {
    it('should get summary', () => {
      recorder.recordSettlement(createTestSettlement(1, TEST_CLUB_ID, TEST_TABLE_ID, TEST_AGENT_ID));

      const summary = report.getSummary(TEST_TABLE_ID, createTestTimeWindow());

      expect(summary).toBeDefined();
      expect(summary!.tableId).toBe(TEST_TABLE_ID);
    });

    it('should get total rake', () => {
      recorder.recordSettlement(createTestSettlement(1, TEST_CLUB_ID, TEST_TABLE_ID, TEST_AGENT_ID));

      const total = report.getTotalRake(TEST_TABLE_ID, createTestTimeWindow());

      expect(total).toBeGreaterThanOrEqual(0);
    });
  });
});

// ============================================================================
// Export Tests
// ============================================================================

describe('JSON Export', () => {
  let ledger: ValueLedger;
  let recorder: LedgerRecorder;
  let platformView: PlatformRevenueView;
  let report: PlatformRevenueReport;

  beforeEach(() => {
    resetLedgerCounters();
    ledger = createValueLedger();
    recorder = createLedgerRecorder(ledger);
    platformView = createPlatformRevenueView(ledger);
    report = createPlatformRevenueReport(platformView);
  });

  afterEach(() => {
    recorder.clear();
  });

  it('should export report to JSON', () => {
    recorder.recordSettlement(createTestSettlement(1, TEST_CLUB_ID, TEST_TABLE_ID, TEST_AGENT_ID));

    const reportResult = report.generate({
      timeWindow: createTestTimeWindow(),
    });

    const exportResult = exportPlatformRevenueJson(reportResult);

    expect(exportResult.success).toBe(true);
    expect(exportResult.content).toBeDefined();
    expect(exportResult.format).toBe('JSON');
    expect(exportResult.byteSize).toBeGreaterThan(0);
  });

  it('should produce deterministic JSON output', () => {
    recorder.recordSettlement(createTestSettlement(1, TEST_CLUB_ID, TEST_TABLE_ID, TEST_AGENT_ID));

    const reportResult = report.generate({
      timeWindow: createTestTimeWindow(),
    });

    const export1 = exportPlatformRevenueJson(reportResult);
    const export2 = exportPlatformRevenueJson(reportResult);

    expect(export1.content).toBe(export2.content);
  });

  it('should parse JSON export back', () => {
    recorder.recordSettlement(createTestSettlement(1, TEST_CLUB_ID, TEST_TABLE_ID, TEST_AGENT_ID));

    const reportResult = report.generate({
      timeWindow: createTestTimeWindow(),
    });

    const exportResult = exportPlatformRevenueJson(reportResult);
    const parsed = parseJsonExport(exportResult.content!);

    expect(parsed).not.toBeNull();
    expect(parsed!.success).toBe(true);
  });
});

describe('CSV Export', () => {
  let ledger: ValueLedger;
  let recorder: LedgerRecorder;
  let clubView: ClubRevenueView;
  let report: ClubRevenueReport;

  beforeEach(() => {
    resetLedgerCounters();
    ledger = createValueLedger();
    recorder = createLedgerRecorder(ledger);
    clubView = createClubRevenueView(ledger);
    report = createClubRevenueReport(clubView);
  });

  afterEach(() => {
    recorder.clear();
  });

  it('should export report to CSV', () => {
    recorder.recordSettlement(createTestSettlement(1, TEST_CLUB_ID));

    const reportResult = report.generate({
      clubId: TEST_CLUB_ID,
      timeWindow: createTestTimeWindow(),
    });

    const exportResult = exportClubRevenueCsv(reportResult);

    expect(exportResult.success).toBe(true);
    expect(exportResult.content).toBeDefined();
    expect(exportResult.format).toBe('CSV');
  });

  it('should produce deterministic CSV output', () => {
    recorder.recordSettlement(createTestSettlement(1, TEST_CLUB_ID));

    const reportResult = report.generate({
      clubId: TEST_CLUB_ID,
      timeWindow: createTestTimeWindow(),
    });

    const export1 = exportClubRevenueCsv(reportResult);
    const export2 = exportClubRevenueCsv(reportResult);

    expect(export1.content).toBe(export2.content);
  });

  it('should parse CSV export back', () => {
    recorder.recordSettlement(createTestSettlement(1, TEST_CLUB_ID));

    const reportResult = report.generate({
      clubId: TEST_CLUB_ID,
      timeWindow: createTestTimeWindow(),
    });

    const exportResult = exportClubRevenueCsv(reportResult);
    const parsed = parseCsv(exportResult.content!);

    expect(parsed.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// Deterministic Output Tests
// ============================================================================

describe('Deterministic Output', () => {
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

  it('should produce identical platform report for same input', () => {
    recorder.recordSettlement(createTestSettlement(1, TEST_CLUB_ID, TEST_TABLE_ID, TEST_AGENT_ID));
    recorder.recordSettlement(createTestSettlement(2, TEST_CLUB_ID_2, TEST_TABLE_ID_2, TEST_AGENT_ID_2));

    const platformView = createPlatformRevenueView(ledger);
    const report = createPlatformRevenueReport(platformView);

    const result1 = report.generate({
      timeWindow: createTestTimeWindow(),
      includeClubBreakdown: true,
      includeTableBreakdown: true,
    });

    const result2 = report.generate({
      timeWindow: createTestTimeWindow(),
      includeClubBreakdown: true,
      includeTableBreakdown: true,
    });

    expect(result1.data!.totalRevenue).toBe(result2.data!.totalRevenue);
    expect(result1.data!.clubBreakdown!.length).toBe(result2.data!.clubBreakdown!.length);
  });

  it('should produce stable ordering in all reports', () => {
    // Record in non-sequential order
    recorder.recordSettlement(createTestSettlement(3, TEST_CLUB_ID_2, TEST_TABLE_ID_2, TEST_AGENT_ID_2));
    recorder.recordSettlement(createTestSettlement(1, TEST_CLUB_ID, TEST_TABLE_ID, TEST_AGENT_ID));
    recorder.recordSettlement(createTestSettlement(2, TEST_CLUB_ID, TEST_TABLE_ID_2, TEST_AGENT_ID));

    const platformView = createPlatformRevenueView(ledger);
    const report = createPlatformRevenueReport(platformView);

    const result = report.generate({
      timeWindow: createTestTimeWindow(),
      includeClubBreakdown: true,
    });

    // Club breakdown should be sorted by clubId
    const clubs = result.data!.clubBreakdown!;
    for (let i = 1; i < clubs.length; i++) {
      expect(clubs[i].clubId >= clubs[i - 1].clubId).toBe(true);
    }
  });
});

// ============================================================================
// Cross-Check Against Views Tests
// ============================================================================

describe('Cross-Check Against Views', () => {
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

  it('should match platform view totals', () => {
    recorder.recordSettlement(createTestSettlement(1, TEST_CLUB_ID, TEST_TABLE_ID, TEST_AGENT_ID));
    recorder.recordSettlement(createTestSettlement(2, TEST_CLUB_ID, TEST_TABLE_ID, TEST_AGENT_ID));

    const platformView = createPlatformRevenueView(ledger);
    const report = createPlatformRevenueReport(platformView);
    const timeWindow = createTestTimeWindow();

    const viewTotal = platformView.getTotalRevenue({
      fromTimestamp: timeWindow.fromTimestamp,
      toTimestamp: timeWindow.toTimestamp,
    });

    const reportResult = report.generate({ timeWindow });

    expect(reportResult.data!.totalRevenue).toBe(viewTotal);
  });

  it('should match club view totals', () => {
    recorder.recordSettlement(createTestSettlement(1, TEST_CLUB_ID));
    recorder.recordTimeFee(createTestTimeFee(TEST_CLUB_ID));

    const clubView = createClubRevenueView(ledger);
    const report = createClubRevenueReport(clubView);
    const timeWindow = createTestTimeWindow();

    const viewTotal = clubView.getTotalRevenue(TEST_CLUB_ID, {
      fromTimestamp: timeWindow.fromTimestamp,
      toTimestamp: timeWindow.toTimestamp,
    });

    const reportResult = report.generate({ clubId: TEST_CLUB_ID, timeWindow });

    expect(reportResult.data!.totalRevenue).toBe(viewTotal);
  });

  it('should match agent view totals', () => {
    recorder.recordSettlement(createTestSettlement(1, TEST_CLUB_ID, TEST_TABLE_ID, TEST_AGENT_ID));

    const agentView = createAgentCommissionView(ledger);
    const report = createAgentCommissionReport(agentView);
    const timeWindow = createTestTimeWindow();

    const viewTotal = agentView.getTotalCommission(TEST_AGENT_ID, {
      fromTimestamp: timeWindow.fromTimestamp,
      toTimestamp: timeWindow.toTimestamp,
    });

    const reportResult = report.generate({ agentId: TEST_AGENT_ID, timeWindow });

    expect(reportResult.data!.totalCommission).toBe(viewTotal);
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

  it('should not mutate ledger when generating reports', () => {
    recorder.recordSettlement(createTestSettlement(1, TEST_CLUB_ID, TEST_TABLE_ID, TEST_AGENT_ID));

    const entriesBefore = ledger.getAllEntries().length;

    const platformView = createPlatformRevenueView(ledger);
    const clubView = createClubRevenueView(ledger);
    const agentView = createAgentCommissionView(ledger);
    const timelineView = createTableRakeTimelineView(ledger);

    const platformReport = createPlatformRevenueReport(platformView);
    const clubReport = createClubRevenueReport(clubView);
    const agentReport = createAgentCommissionReport(agentView);
    const tableReport = createTableSessionReport(timelineView);

    // Generate all reports
    platformReport.generate({ timeWindow: createTestTimeWindow() });
    clubReport.generate({ clubId: TEST_CLUB_ID, timeWindow: createTestTimeWindow() });
    agentReport.generate({ agentId: TEST_AGENT_ID, timeWindow: createTestTimeWindow() });
    tableReport.generate({ tableId: TEST_TABLE_ID, timeWindow: createTestTimeWindow() });

    const entriesAfter = ledger.getAllEntries().length;

    expect(entriesAfter).toBe(entriesBefore);
  });

  it('should not mutate views when generating reports', () => {
    recorder.recordSettlement(createTestSettlement(1, TEST_CLUB_ID, TEST_TABLE_ID, TEST_AGENT_ID));

    const platformView = createPlatformRevenueView(ledger);
    const report = createPlatformRevenueReport(platformView);

    // Get view data before report
    const viewBefore = platformView.getSummary();

    // Generate report
    report.generate({ timeWindow: createTestTimeWindow() });

    // Get view data after report
    const viewAfter = platformView.getSummary();

    expect(viewAfter.data!.totalRevenue).toBe(viewBefore.data!.totalRevenue);
  });
});

// ============================================================================
// Large Dataset Tests
// ============================================================================

describe('Large Dataset Aggregation', () => {
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

  it('should handle large number of settlements', () => {
    // Record 100 settlements
    for (let i = 1; i <= 100; i++) {
      recorder.recordSettlement(createTestSettlement(i, TEST_CLUB_ID, TEST_TABLE_ID, TEST_AGENT_ID));
    }

    const platformView = createPlatformRevenueView(ledger);
    const report = createPlatformRevenueReport(platformView);

    const result = report.generate({
      timeWindow: createTestTimeWindow(),
      includeClubBreakdown: true,
      includeTableBreakdown: true,
    });

    expect(result.success).toBe(true);
    expect(result.data!.totalEntries).toBe(100);
  });

  it('should handle multiple clubs and tables', () => {
    const clubs: ClubId[] = [];
    const tables: TableId[] = [];

    for (let i = 1; i <= 10; i++) {
      clubs.push(`club_${i}` as ClubId);
      tables.push(`table_${i}` as TableId);
    }

    // Record settlements across all clubs and tables
    for (let i = 1; i <= 50; i++) {
      const clubIdx = i % 10;
      const tableIdx = i % 10;
      recorder.recordSettlement(createTestSettlement(i, clubs[clubIdx], tables[tableIdx], TEST_AGENT_ID));
    }

    const platformView = createPlatformRevenueView(ledger);
    const report = createPlatformRevenueReport(platformView);

    const result = report.generate({
      timeWindow: createTestTimeWindow(),
      includeClubBreakdown: true,
      includeTableBreakdown: true,
    });

    expect(result.success).toBe(true);
    expect(result.data!.clubBreakdown!.length).toBe(10);
    expect(result.data!.tableBreakdown!.length).toBe(10);
  });
});

// ============================================================================
// Utility Function Tests
// ============================================================================

describe('Utility Functions', () => {
  describe('createReportTimeWindow', () => {
    it('should create valid time window', () => {
      const window = createReportTimeWindow(1000, 2000);

      expect(window.fromTimestamp).toBe(1000);
      expect(window.toTimestamp).toBe(2000);
    });
  });

  describe('isValidTimeWindow', () => {
    it('should validate valid window', () => {
      expect(isValidTimeWindow({ fromTimestamp: 1000, toTimestamp: 2000 })).toBe(true);
    });

    it('should reject invalid window', () => {
      expect(isValidTimeWindow({ fromTimestamp: 2000, toTimestamp: 1000 })).toBe(false);
      expect(isValidTimeWindow({ fromTimestamp: -1, toTimestamp: 1000 })).toBe(false);
    });
  });

  describe('integerAverage', () => {
    it('should calculate integer average', () => {
      expect(integerAverage(10, 3)).toBe(3);  // 10/3 = 3.33 → 3
      expect(integerAverage(100, 10)).toBe(10);
    });

    it('should handle zero count', () => {
      expect(integerAverage(100, 0)).toBe(0);
    });
  });
});
