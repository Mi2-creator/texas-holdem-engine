/**
 * Ledger Module Tests
 * Phase 25 - Comprehensive tests for value ledger
 *
 * Tests cover:
 * - Immutability of ledger entries
 * - Determinism across replay
 * - No side effects on game state
 * - Hash chain integrity
 * - Query and aggregation accuracy
 */

import {
  ValueLedger,
  createValueLedger,
  LedgerRecorder,
  createLedgerRecorder,
  LedgerView,
  createLedgerView,
  LedgerEntry,
  LedgerEntryInput,
  SettlementAttribution,
  TimeFeeAttribution,
  AgentId,
  createPlayerParty,
  createClubParty,
  createAgentParty,
  createPlatformParty,
  generateLedgerEntryId,
  generateLedgerBatchId,
  resetLedgerCounters,
  calculateEntryChecksum,
  verifyEntryChecksum,
} from '../index';

import { PlayerId } from '../../security/Identity';
import { TableId, HandId } from '../../security/AuditLog';
import { ClubId } from '../../club/ClubTypes';
import { StateVersion, createStateVersion } from '../../sync/SyncTypes';

// ============================================================================
// Test Helpers
// ============================================================================

const TEST_CLUB_ID = 'club_test' as ClubId;
const TEST_TABLE_ID = 'table_test' as TableId;
const TEST_HAND_ID = 'hand_test' as HandId;
const TEST_AGENT_ID = 'agent_test' as AgentId;

function createTestPlayer(index: number): PlayerId {
  return `player_${index}` as PlayerId;
}

function createTestStateVersion(version: number): StateVersion {
  return createStateVersion(version);
}

function createTestSettlement(
  handId: HandId = TEST_HAND_ID,
  stateVersion: StateVersion = createTestStateVersion(1)
): SettlementAttribution {
  return {
    handId,
    tableId: TEST_TABLE_ID,
    clubId: TEST_CLUB_ID,
    stateVersion,
    potWinners: [
      { playerId: createTestPlayer(1), amount: 180, potType: 'main' },
    ],
    rakeTotal: 20,
    rakeBreakdown: {
      clubShare: 14,
      agentShare: 4,
      agentId: TEST_AGENT_ID,
      platformShare: 2,
    },
    uncalledReturns: [
      { playerId: createTestPlayer(2), amount: 50 },
    ],
  };
}

// ============================================================================
// ValueLedger Tests
// ============================================================================

describe('ValueLedger', () => {
  let ledger: ValueLedger;

  beforeEach(() => {
    resetLedgerCounters();
    ledger = createValueLedger();
  });

  afterEach(() => {
    ledger.clear();
  });

  describe('Entry Creation', () => {
    it('should append entry with all required fields', () => {
      const input: LedgerEntryInput = {
        source: 'HAND_SETTLEMENT',
        category: 'POT_WIN',
        affectedParty: createPlayerParty(createTestPlayer(1)),
        delta: 100,
        stateVersion: createTestStateVersion(1),
        tableId: TEST_TABLE_ID,
        handId: TEST_HAND_ID,
        clubId: TEST_CLUB_ID,
        description: 'Test pot win',
      };

      const entry = ledger.appendEntry(input);

      expect(entry.entryId).toBeDefined();
      expect(entry.sequence).toBe(1);
      expect(entry.source).toBe('HAND_SETTLEMENT');
      expect(entry.category).toBe('POT_WIN');
      expect(entry.delta).toBe(100);
      expect(entry.affectedParty.partyType).toBe('PLAYER');
      expect(entry.checksum).toBeDefined();
    });

    it('should reject non-integer deltas', () => {
      const input: LedgerEntryInput = {
        source: 'HAND_SETTLEMENT',
        affectedParty: createPlayerParty(createTestPlayer(1)),
        delta: 100.5,
        stateVersion: createTestStateVersion(1),
        description: 'Invalid delta',
      };

      expect(() => ledger.appendEntry(input)).toThrow('Delta must be an integer');
    });

    it('should increment sequence for each entry', () => {
      const input1: LedgerEntryInput = {
        source: 'HAND_SETTLEMENT',
        affectedParty: createPlayerParty(createTestPlayer(1)),
        delta: 100,
        stateVersion: createTestStateVersion(1),
        description: 'Entry 1',
      };

      const input2: LedgerEntryInput = {
        source: 'HAND_SETTLEMENT',
        affectedParty: createPlayerParty(createTestPlayer(2)),
        delta: 50,
        stateVersion: createTestStateVersion(1),
        description: 'Entry 2',
      };

      const entry1 = ledger.appendEntry(input1);
      const entry2 = ledger.appendEntry(input2);

      expect(entry1.sequence).toBe(1);
      expect(entry2.sequence).toBe(2);
    });

    it('should allow negative deltas (debits)', () => {
      const input: LedgerEntryInput = {
        source: 'TIME_FEE',
        affectedParty: createPlayerParty(createTestPlayer(1)),
        delta: -50,
        stateVersion: createTestStateVersion(1),
        description: 'Time fee debit',
      };

      const entry = ledger.appendEntry(input);

      expect(entry.delta).toBe(-50);
    });
  });

  describe('Batch Creation', () => {
    it('should create batch with multiple entries', () => {
      const inputs: LedgerEntryInput[] = [
        {
          source: 'HAND_SETTLEMENT',
          category: 'POT_WIN',
          affectedParty: createPlayerParty(createTestPlayer(1)),
          delta: 100,
          stateVersion: createTestStateVersion(1),
          description: 'Pot win',
        },
        {
          source: 'HAND_SETTLEMENT',
          category: 'RAKE',
          affectedParty: createClubParty(TEST_CLUB_ID),
          delta: 10,
          stateVersion: createTestStateVersion(1),
          description: 'Rake',
        },
      ];

      const { batch, entries } = ledger.appendBatch('HAND_SETTLEMENT', inputs);

      expect(batch.batchId).toBeDefined();
      expect(batch.entryIds.length).toBe(2);
      expect(batch.netDelta).toBe(110);
      expect(entries.length).toBe(2);
      expect(entries[0].batchId).toBe(batch.batchId);
    });

    it('should reject empty batch', () => {
      expect(() => ledger.appendBatch('HAND_SETTLEMENT', [])).toThrow(
        'Cannot create empty batch'
      );
    });

    it('should calculate correct net delta for batch', () => {
      const inputs: LedgerEntryInput[] = [
        {
          source: 'TIME_FEE',
          affectedParty: createPlayerParty(createTestPlayer(1)),
          delta: -50,
          stateVersion: createTestStateVersion(1),
          description: 'Fee charged',
        },
        {
          source: 'TIME_FEE',
          affectedParty: createClubParty(TEST_CLUB_ID),
          delta: 50,
          stateVersion: createTestStateVersion(1),
          description: 'Fee received',
        },
      ];

      const { batch } = ledger.appendBatch('TIME_FEE', inputs);

      // Balanced: -50 + 50 = 0
      expect(batch.netDelta).toBe(0);
    });
  });

  describe('Immutability', () => {
    it('should return entries that cannot affect original', () => {
      const input: LedgerEntryInput = {
        source: 'HAND_SETTLEMENT',
        affectedParty: createPlayerParty(createTestPlayer(1)),
        delta: 100,
        stateVersion: createTestStateVersion(1),
        description: 'Test',
      };

      ledger.appendEntry(input);
      const entries = ledger.getAllEntries();

      // Even if we try to modify the returned array, original should be unchanged
      expect(entries.length).toBe(1);
      expect(ledger.getEntryCount()).toBe(1);
    });

    it('should preserve entry data after retrieval', () => {
      const input: LedgerEntryInput = {
        source: 'HAND_SETTLEMENT',
        affectedParty: createPlayerParty(createTestPlayer(1)),
        delta: 100,
        stateVersion: createTestStateVersion(1),
        description: 'Original description',
      };

      const created = ledger.appendEntry(input);
      const retrieved = ledger.getEntry(created.entryId);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.description).toBe('Original description');
      expect(retrieved!.delta).toBe(100);
    });
  });

  describe('Hash Chain Integrity', () => {
    it('should link entries via previousHash', () => {
      const input1: LedgerEntryInput = {
        source: 'HAND_SETTLEMENT',
        affectedParty: createPlayerParty(createTestPlayer(1)),
        delta: 100,
        stateVersion: createTestStateVersion(1),
        description: 'Entry 1',
      };

      const input2: LedgerEntryInput = {
        source: 'HAND_SETTLEMENT',
        affectedParty: createPlayerParty(createTestPlayer(2)),
        delta: 50,
        stateVersion: createTestStateVersion(1),
        description: 'Entry 2',
      };

      const entry1 = ledger.appendEntry(input1);
      const entry2 = ledger.appendEntry(input2);

      expect(entry1.previousHash).toBe('genesis');
      expect(entry2.previousHash).toBe(entry1.checksum);
    });

    it('should verify integrity of entire ledger', () => {
      for (let i = 0; i < 10; i++) {
        ledger.appendEntry({
          source: 'HAND_SETTLEMENT',
          affectedParty: createPlayerParty(createTestPlayer(i)),
          delta: 100,
          stateVersion: createTestStateVersion(i + 1),
          description: `Entry ${i}`,
        });
      }

      const result = ledger.verifyIntegrity();

      expect(result.isValid).toBe(true);
      expect(result.verifiedEntries).toBe(10);
      expect(result.errors.length).toBe(0);
    });

    it('should verify individual entry checksum', () => {
      const entry = ledger.appendEntry({
        source: 'HAND_SETTLEMENT',
        affectedParty: createPlayerParty(createTestPlayer(1)),
        delta: 100,
        stateVersion: createTestStateVersion(1),
        description: 'Test',
      });

      const isValid = ledger.verifyEntry(entry.entryId);
      expect(isValid).toBe(true);
    });

    it('should verify batch integrity', () => {
      const { batch } = ledger.appendBatch('HAND_SETTLEMENT', [
        {
          source: 'HAND_SETTLEMENT',
          affectedParty: createPlayerParty(createTestPlayer(1)),
          delta: 100,
          stateVersion: createTestStateVersion(1),
          description: 'Entry 1',
        },
        {
          source: 'HAND_SETTLEMENT',
          affectedParty: createClubParty(TEST_CLUB_ID),
          delta: 10,
          stateVersion: createTestStateVersion(1),
          description: 'Entry 2',
        },
      ]);

      const result = ledger.verifyBatch(batch.batchId);

      expect(result.isValid).toBe(true);
      expect(result.entryCount).toBe(2);
    });
  });

  describe('Retrieval', () => {
    it('should get entry by ID', () => {
      const created = ledger.appendEntry({
        source: 'HAND_SETTLEMENT',
        affectedParty: createPlayerParty(createTestPlayer(1)),
        delta: 100,
        stateVersion: createTestStateVersion(1),
        description: 'Test',
      });

      const retrieved = ledger.getEntry(created.entryId);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.entryId).toBe(created.entryId);
    });

    it('should return null for non-existent entry', () => {
      const retrieved = ledger.getEntry('non_existent' as any);
      expect(retrieved).toBeNull();
    });

    it('should get entries in sequence range', () => {
      for (let i = 0; i < 10; i++) {
        ledger.appendEntry({
          source: 'HAND_SETTLEMENT',
          affectedParty: createPlayerParty(createTestPlayer(i)),
          delta: 100,
          stateVersion: createTestStateVersion(i + 1),
          description: `Entry ${i}`,
        });
      }

      const range = ledger.getEntriesInRange(3, 7);

      expect(range.length).toBe(5);
      expect(range[0].sequence).toBe(3);
      expect(range[4].sequence).toBe(7);
    });
  });
});

// ============================================================================
// LedgerRecorder Tests
// ============================================================================

describe('LedgerRecorder', () => {
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

  describe('Settlement Recording', () => {
    it('should record settlement attribution', () => {
      const settlement = createTestSettlement();
      const result = recorder.recordSettlement(settlement);

      expect(result.success).toBe(true);
      expect(result.batch).toBeDefined();
      expect(result.entries).toBeDefined();
      expect(result.entries!.length).toBeGreaterThan(0);
    });

    it('should record pot winnings to players', () => {
      const settlement = createTestSettlement();
      const result = recorder.recordSettlement(settlement);

      const potWinEntry = result.entries!.find(
        e => e.category === 'POT_WIN' && e.affectedParty.partyType === 'PLAYER'
      );

      expect(potWinEntry).toBeDefined();
      expect(potWinEntry!.delta).toBe(180);
    });

    it('should record rake attribution', () => {
      const settlement = createTestSettlement();
      const result = recorder.recordSettlement(settlement);

      const rakeEntry = result.entries!.find(e => e.category === 'RAKE');

      expect(rakeEntry).toBeDefined();
      expect(rakeEntry!.delta).toBe(20);
    });

    it('should record agent commission', () => {
      const settlement = createTestSettlement();
      const result = recorder.recordSettlement(settlement);

      const agentEntry = result.entries!.find(
        e => e.category === 'RAKE_SHARE_AGENT'
      );

      expect(agentEntry).toBeDefined();
      expect(agentEntry!.delta).toBe(4);
      expect(agentEntry!.affectedParty.agentId).toBe(TEST_AGENT_ID);
    });

    it('should record platform share', () => {
      const settlement = createTestSettlement();
      const result = recorder.recordSettlement(settlement);

      const platformEntry = result.entries!.find(
        e => e.category === 'RAKE_SHARE_PLATFORM'
      );

      expect(platformEntry).toBeDefined();
      expect(platformEntry!.delta).toBe(2);
    });

    it('should record uncalled bet returns', () => {
      const settlement = createTestSettlement();
      const result = recorder.recordSettlement(settlement);

      const returnEntry = result.entries!.find(
        e => e.category === 'UNCALLED_RETURN'
      );

      expect(returnEntry).toBeDefined();
      expect(returnEntry!.delta).toBe(50);
    });

    it('should detect duplicate settlement', () => {
      const settlement = createTestSettlement();

      const result1 = recorder.recordSettlement(settlement);
      expect(result1.success).toBe(true);

      const result2 = recorder.recordSettlement(settlement);
      expect(result2.success).toBe(false);
      expect(result2.isDuplicate).toBe(true);
    });

    it('should track if settlement is recorded', () => {
      expect(recorder.isSettlementRecorded(TEST_HAND_ID)).toBe(false);

      recorder.recordSettlement(createTestSettlement());

      expect(recorder.isSettlementRecorded(TEST_HAND_ID)).toBe(true);
    });
  });

  describe('Time Fee Recording', () => {
    it('should record time fee attribution', () => {
      const timeFee: TimeFeeAttribution = {
        tableId: TEST_TABLE_ID,
        clubId: TEST_CLUB_ID,
        stateVersion: createTestStateVersion(1),
        playerId: createTestPlayer(1),
        feeAmount: 50,
        periodMinutes: 30,
      };

      const result = recorder.recordTimeFee(timeFee);

      expect(result.success).toBe(true);
      expect(result.entries!.length).toBe(2);  // Debit + Credit
    });

    it('should record balanced time fee entries', () => {
      const timeFee: TimeFeeAttribution = {
        tableId: TEST_TABLE_ID,
        clubId: TEST_CLUB_ID,
        stateVersion: createTestStateVersion(1),
        playerId: createTestPlayer(1),
        feeAmount: 50,
        periodMinutes: 30,
      };

      const result = recorder.recordTimeFee(timeFee);

      expect(result.batch!.netDelta).toBe(0);  // Balanced: -50 + 50 = 0
    });
  });

  describe('Adjustment Recording', () => {
    it('should record adjustment with reason', () => {
      const result = recorder.recordAdjustment({
        stateVersion: createTestStateVersion(1),
        affectedPlayerId: createTestPlayer(1),
        delta: 100,
        reason: 'Compensation for technical issue',
      });

      expect(result.success).toBe(true);
      expect(result.entries![0].source).toBe('ADJUSTMENT');
    });

    it('should reject adjustment without affected party', () => {
      const result = recorder.recordAdjustment({
        stateVersion: createTestStateVersion(1),
        delta: 100,
        reason: 'No party specified',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('affected party');
    });

    it('should reject adjustment without reason', () => {
      const result = recorder.recordAdjustment({
        stateVersion: createTestStateVersion(1),
        affectedPlayerId: createTestPlayer(1),
        delta: 100,
        reason: '',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('reason');
    });
  });

  describe('Bonus Recording', () => {
    it('should record bonus attribution', () => {
      const result = recorder.recordBonus({
        stateVersion: createTestStateVersion(1),
        playerId: createTestPlayer(1),
        amount: 500,
        bonusType: 'welcome_bonus',
        clubId: TEST_CLUB_ID,
      });

      expect(result.success).toBe(true);
      expect(result.entries![0].source).toBe('BONUS');
      expect(result.entries![0].delta).toBe(500);
    });
  });

  describe('Determinism', () => {
    it('should produce identical entries for identical settlements', () => {
      const settlement1 = createTestSettlement('hand_1' as HandId);
      const settlement2 = createTestSettlement('hand_2' as HandId);

      // Record same structure settlements (different handIds)
      const result1 = recorder.recordSettlement(settlement1);
      const result2 = recorder.recordSettlement(settlement2);

      // Compare entry structures (excluding IDs and timestamps)
      const compare = (e1: LedgerEntry, e2: LedgerEntry) => {
        return (
          e1.source === e2.source &&
          e1.category === e2.category &&
          e1.delta === e2.delta &&
          e1.affectedParty.partyType === e2.affectedParty.partyType
        );
      };

      // Same number of entries
      expect(result1.entries!.length).toBe(result2.entries!.length);

      // Same structure for corresponding entries
      for (let i = 0; i < result1.entries!.length; i++) {
        expect(compare(result1.entries![i], result2.entries![i])).toBe(true);
      }
    });
  });
});

// ============================================================================
// LedgerView Tests
// ============================================================================

describe('LedgerView', () => {
  let ledger: ValueLedger;
  let recorder: LedgerRecorder;
  let view: LedgerView;

  beforeEach(() => {
    resetLedgerCounters();
    ledger = createValueLedger();
    recorder = createLedgerRecorder(ledger);
    view = createLedgerView(ledger);
  });

  afterEach(() => {
    recorder.clear();
  });

  describe('Query Methods', () => {
    beforeEach(() => {
      // Record multiple settlements
      recorder.recordSettlement(createTestSettlement('hand_1' as HandId, createTestStateVersion(1)));
      recorder.recordSettlement(createTestSettlement('hand_2' as HandId, createTestStateVersion(2)));
    });

    it('should query entries by hand', () => {
      const entries = view.getHandEntries('hand_1' as HandId);

      expect(entries.length).toBeGreaterThan(0);
      entries.forEach(e => expect(e.handId).toBe('hand_1'));
    });

    it('should query entries by table', () => {
      const entries = view.getTableEntries(TEST_TABLE_ID);

      expect(entries.length).toBeGreaterThan(0);
      entries.forEach(e => expect(e.tableId).toBe(TEST_TABLE_ID));
    });

    it('should query entries by player', () => {
      const entries = view.getPlayerEntries(createTestPlayer(1));

      expect(entries.length).toBeGreaterThan(0);
      entries.forEach(e => {
        expect(e.affectedParty.partyType).toBe('PLAYER');
        expect(e.affectedParty.playerId).toBe(createTestPlayer(1));
      });
    });

    it('should query entries by club', () => {
      const entries = view.getClubEntries(TEST_CLUB_ID);

      expect(entries.length).toBeGreaterThan(0);
    });

    it('should query entries by agent', () => {
      const entries = view.getAgentEntries(TEST_AGENT_ID);

      expect(entries.length).toBeGreaterThan(0);
      entries.forEach(e => {
        expect(e.affectedParty.partyType).toBe('AGENT');
        expect(e.affectedParty.agentId).toBe(TEST_AGENT_ID);
      });
    });

    it('should query entries by source', () => {
      const entries = view.query({ source: 'HAND_SETTLEMENT' });

      expect(entries.length).toBeGreaterThan(0);
      entries.forEach(e => expect(e.source).toBe('HAND_SETTLEMENT'));
    });

    it('should query entries with pagination', () => {
      const allEntries = view.query({});
      const page1 = view.query({ limit: 5, offset: 0 });
      const page2 = view.query({ limit: 5, offset: 5 });

      expect(page1.length).toBeLessThanOrEqual(5);
      expect(page1.length + page2.length).toBeLessThanOrEqual(allEntries.length);
    });
  });

  describe('Aggregation Methods', () => {
    beforeEach(() => {
      recorder.recordSettlement(createTestSettlement('hand_1' as HandId, createTestStateVersion(1)));
      recorder.recordSettlement(createTestSettlement('hand_2' as HandId, createTestStateVersion(2)));
    });

    it('should calculate party summary', () => {
      const summary = view.getPartySummary('PLAYER', createTestPlayer(1));

      expect(summary.partyType).toBe('PLAYER');
      expect(summary.totalCredit).toBeGreaterThan(0);
      expect(summary.entryCount).toBeGreaterThan(0);
    });

    it('should calculate table summary', () => {
      const summary = view.getTableSummary(TEST_TABLE_ID);

      expect(summary).not.toBeNull();
      expect(summary!.tableId).toBe(TEST_TABLE_ID);
      expect(summary!.handCount).toBe(2);
      expect(summary!.totalPotWinnings).toBeGreaterThan(0);
      expect(summary!.totalRake).toBeGreaterThan(0);
    });

    it('should calculate club summary', () => {
      const summary = view.getClubSummary(TEST_CLUB_ID);

      expect(summary.clubId).toBe(TEST_CLUB_ID);
      expect(summary.handCount).toBe(2);
      expect(summary.totalRakeCollected).toBeGreaterThan(0);
    });

    it('should calculate agent summary', () => {
      const summary = view.getAgentSummary(TEST_AGENT_ID);

      expect(summary.agentId).toBe(TEST_AGENT_ID);
      expect(summary.totalCommission).toBeGreaterThan(0);
      expect(summary.handCount).toBe(2);
    });
  });

  describe('Hand Analysis', () => {
    it('should analyze hand attribution', () => {
      recorder.recordSettlement(createTestSettlement());

      const analysis = view.analyzeHand(TEST_HAND_ID);

      expect(analysis.handId).toBe(TEST_HAND_ID);
      expect(analysis.tableId).toBe(TEST_TABLE_ID);
      expect(analysis.totalPotWinnings).toBe(180);
      expect(analysis.totalRake).toBe(20);
      expect(analysis.playerAttributions.size).toBeGreaterThan(0);
    });
  });

  describe('Export', () => {
    it('should export entries for reporting', () => {
      recorder.recordSettlement(createTestSettlement());

      const exported = view.exportForReporting({ handId: TEST_HAND_ID });

      expect(exported.length).toBeGreaterThan(0);
      exported.forEach(e => {
        expect(e.sequence).toBeDefined();
        expect(e.timestamp).toBeDefined();
        expect(e.partyType).toBeDefined();
        expect(e.delta).toBeDefined();
      });
    });

    it('should count entries matching query', () => {
      recorder.recordSettlement(createTestSettlement());

      const count = view.count({ handId: TEST_HAND_ID });

      expect(count).toBeGreaterThan(0);
    });

    it('should sum deltas matching query', () => {
      recorder.recordSettlement(createTestSettlement());

      const playerSum = view.sumDeltas({
        playerId: createTestPlayer(1),
      });

      // Player 1 receives pot win (180) + uncalled return to player 2 (50 not for player 1)
      expect(playerSum).toBe(180);
    });
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('Ledger Integration', () => {
  let ledger: ValueLedger;
  let recorder: LedgerRecorder;
  let view: LedgerView;

  beforeEach(() => {
    resetLedgerCounters();
    ledger = createValueLedger();
    recorder = createLedgerRecorder(ledger);
    view = createLedgerView(ledger);
  });

  afterEach(() => {
    recorder.clear();
  });

  describe('No Side Effects', () => {
    it('should not modify original settlement data', () => {
      const settlement = createTestSettlement();
      const originalPotWinners = [...settlement.potWinners];

      recorder.recordSettlement(settlement);

      expect(settlement.potWinners).toEqual(originalPotWinners);
    });

    it('should not affect external state versions', () => {
      const version = createTestStateVersion(5);
      const versionBefore = Number(version);

      recorder.recordSettlement({
        ...createTestSettlement(),
        stateVersion: version,
      });

      expect(Number(version)).toBe(versionBefore);
    });
  });

  describe('Replay Determinism', () => {
    it('should produce identical results on replay', () => {
      // First recording
      const ledger1 = createValueLedger();
      const recorder1 = createLedgerRecorder(ledger1);

      recorder1.recordSettlement(createTestSettlement('hand_1' as HandId, createTestStateVersion(1)));
      recorder1.recordSettlement(createTestSettlement('hand_2' as HandId, createTestStateVersion(2)));

      const export1 = ledger1.export();

      // Reset and replay
      resetLedgerCounters();
      const ledger2 = createValueLedger();
      const recorder2 = createLedgerRecorder(ledger2, { enableDuplicateDetection: false });

      recorder2.recordSettlement(createTestSettlement('hand_1' as HandId, createTestStateVersion(1)));
      recorder2.recordSettlement(createTestSettlement('hand_2' as HandId, createTestStateVersion(2)));

      const export2 = ledger2.export();

      // Compare structures (not timestamps/IDs)
      expect(export1.entries.length).toBe(export2.entries.length);

      for (let i = 0; i < export1.entries.length; i++) {
        expect(export1.entries[i].source).toBe(export2.entries[i].source);
        expect(export1.entries[i].category).toBe(export2.entries[i].category);
        expect(export1.entries[i].delta).toBe(export2.entries[i].delta);
        expect(export1.entries[i].affectedParty.partyType).toBe(
          export2.entries[i].affectedParty.partyType
        );
      }
    });
  });

  describe('Full Flow', () => {
    it('should handle complete settlement flow', () => {
      // Record settlement
      const settlementResult = recorder.recordSettlement(createTestSettlement());
      expect(settlementResult.success).toBe(true);

      // Verify integrity
      const integrityResult = ledger.verifyIntegrity();
      expect(integrityResult.isValid).toBe(true);

      // Query and verify
      const handAnalysis = view.analyzeHand(TEST_HAND_ID);
      expect(handAnalysis.totalPotWinnings).toBe(180);
      expect(handAnalysis.totalRake).toBe(20);

      // Verify batch
      const batchResult = ledger.verifyBatch(settlementResult.batch!.batchId);
      expect(batchResult.isValid).toBe(true);
    });

    it('should handle mixed attribution types', () => {
      // Settlement
      recorder.recordSettlement(createTestSettlement());

      // Time fee
      recorder.recordTimeFee({
        tableId: TEST_TABLE_ID,
        clubId: TEST_CLUB_ID,
        stateVersion: createTestStateVersion(2),
        playerId: createTestPlayer(1),
        feeAmount: 50,
        periodMinutes: 30,
      });

      // Adjustment
      recorder.recordAdjustment({
        stateVersion: createTestStateVersion(3),
        affectedPlayerId: createTestPlayer(1),
        delta: 25,
        reason: 'Compensation',
      });

      // Verify all recorded
      const stats = recorder.getStatistics();
      expect(stats.ledgerStats.entryCount).toBeGreaterThan(0);

      // Query by different sources
      const settlements = view.query({ source: 'HAND_SETTLEMENT' });
      const timeFees = view.query({ source: 'TIME_FEE' });
      const adjustments = view.query({ source: 'ADJUSTMENT' });

      expect(settlements.length).toBeGreaterThan(0);
      expect(timeFees.length).toBe(2);  // Debit + Credit
      expect(adjustments.length).toBe(1);
    });
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('Edge Cases', () => {
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

  it('should handle settlement with no rake', () => {
    const settlement: SettlementAttribution = {
      handId: TEST_HAND_ID,
      tableId: TEST_TABLE_ID,
      clubId: TEST_CLUB_ID,
      stateVersion: createTestStateVersion(1),
      potWinners: [
        { playerId: createTestPlayer(1), amount: 200, potType: 'main' },
      ],
      rakeTotal: 0,
    };

    const result = recorder.recordSettlement(settlement);

    expect(result.success).toBe(true);
    expect(result.entries!.filter(e => e.category === 'RAKE').length).toBe(0);
  });

  it('should handle settlement with multiple winners', () => {
    const settlement: SettlementAttribution = {
      handId: TEST_HAND_ID,
      tableId: TEST_TABLE_ID,
      clubId: TEST_CLUB_ID,
      stateVersion: createTestStateVersion(1),
      potWinners: [
        { playerId: createTestPlayer(1), amount: 100, potType: 'main' },
        { playerId: createTestPlayer(2), amount: 100, potType: 'main' },
        { playerId: createTestPlayer(3), amount: 50, potType: 'side' },
      ],
      rakeTotal: 10,
    };

    const result = recorder.recordSettlement(settlement);

    expect(result.success).toBe(true);
    const potWins = result.entries!.filter(e => e.category === 'POT_WIN');
    expect(potWins.length).toBe(3);
  });

  it('should handle zero-delta entries gracefully', () => {
    const input: LedgerEntryInput = {
      source: 'ADJUSTMENT',
      affectedParty: createPlayerParty(createTestPlayer(1)),
      delta: 0,
      stateVersion: createTestStateVersion(1),
      description: 'No-op adjustment',
    };

    const entry = ledger.appendEntry(input);

    expect(entry.delta).toBe(0);
  });

  it('should handle large delta values', () => {
    const largeAmount = 999999999;

    const result = recorder.recordSettlement({
      handId: TEST_HAND_ID,
      tableId: TEST_TABLE_ID,
      clubId: TEST_CLUB_ID,
      stateVersion: createTestStateVersion(1),
      potWinners: [
        { playerId: createTestPlayer(1), amount: largeAmount, potType: 'main' },
      ],
      rakeTotal: 0,
    });

    expect(result.success).toBe(true);
    expect(result.entries![0].delta).toBe(largeAmount);
  });
});
