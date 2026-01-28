/**
 * TopUpBoundary.test.ts
 * Phase 28 - External Top-Up Integration Boundary Tests
 *
 * Comprehensive tests ensuring:
 * - Invalid inputs are rejected
 * - Duplicate intentIds are idempotent
 * - Forbidden concepts are blocked
 * - Ledger invariants are never violated
 * - No revenue/rake contamination
 */

import { PlayerId } from '../../security/Identity';
import { TableId } from '../../security/AuditLog';
import { ClubId } from '../../club/ClubTypes';
import { StateVersion } from '../../sync/SyncTypes';
import { createValueLedger } from '../../ledger/LedgerEntry';
import { resetLedgerCounters } from '../../ledger/LedgerTypes';

import {
  TopUpIntentId,
  generateTopUpIntentId,
  resetTopUpCounters,
  TOP_UP_SOURCE,
  TopUpIntent,
  createTopUpIntent,
  createTopUpIntentWithTimestamp,
  TopUpBoundary,
  createTopUpBoundary,
  TopUpRecorder,
  createTopUpRecorder,
  TopUpView,
  createTopUpView,
} from '../index';

// ============================================================================
// Test Setup
// ============================================================================

describe('Phase 28: External Top-Up Boundary', () => {
  // Test data
  const playerId1 = 'player-001' as PlayerId;
  const playerId2 = 'player-002' as PlayerId;
  const clubId1 = 'club-001' as ClubId;
  const clubId2 = 'club-002' as ClubId;
  const tableId1 = 'table-001' as TableId;
  const tableId2 = 'table-002' as TableId;
  const stateVersion = 1 as StateVersion;

  beforeEach(() => {
    resetTopUpCounters();
    resetLedgerCounters();
  });

  // ==========================================================================
  // TopUpTypes Tests
  // ==========================================================================

  describe('TopUpTypes', () => {
    it('should generate unique intent IDs', () => {
      const id1 = generateTopUpIntentId();
      const id2 = generateTopUpIntentId();
      const id3 = generateTopUpIntentId();

      expect(id1).not.toBe(id2);
      expect(id2).not.toBe(id3);
      expect(id1).toContain('topup_');
    });

    it('should reset intent ID counter', () => {
      generateTopUpIntentId();
      generateTopUpIntentId();
      resetTopUpCounters();
      const id = generateTopUpIntentId();

      expect(id).toContain('_1');
    });

    it('should have correct TOP_UP_SOURCE value', () => {
      expect(TOP_UP_SOURCE).toBe('EXTERNAL_TOPUP');
    });
  });

  // ==========================================================================
  // TopUpIntent Tests
  // ==========================================================================

  describe('TopUpIntent', () => {
    it('should create intent with required fields', () => {
      const intent = createTopUpIntent({
        intentId: generateTopUpIntentId(),
        playerId: playerId1,
        clubId: clubId1,
        amount: 1000,
      });

      expect(intent.playerId).toBe(playerId1);
      expect(intent.clubId).toBe(clubId1);
      expect(intent.amount).toBe(1000);
      expect(intent.source).toBe(TOP_UP_SOURCE);
      expect(intent.requestedAt).toBeGreaterThan(0);
    });

    it('should create intent with optional tableId', () => {
      const intent = createTopUpIntent({
        intentId: generateTopUpIntentId(),
        playerId: playerId1,
        clubId: clubId1,
        tableId: tableId1,
        amount: 500,
      });

      expect(intent.tableId).toBe(tableId1);
    });

    it('should create intent with metadata', () => {
      const intent = createTopUpIntent({
        intentId: generateTopUpIntentId(),
        playerId: playerId1,
        clubId: clubId1,
        amount: 2000,
        metadata: { reference: 'ref-123', source: 'admin' },
      });

      expect(intent.metadata?.reference).toBe('ref-123');
      expect(intent.metadata?.source).toBe('admin');
    });

    it('should create intent with specific timestamp', () => {
      const timestamp = 1700000000000;
      const intent = createTopUpIntentWithTimestamp(
        {
          intentId: generateTopUpIntentId(),
          playerId: playerId1,
          clubId: clubId1,
          amount: 100,
        },
        timestamp
      );

      expect(intent.requestedAt).toBe(timestamp);
    });
  });

  // ==========================================================================
  // TopUpBoundary Validation Tests
  // ==========================================================================

  describe('TopUpBoundary - Validation', () => {
    let boundary: TopUpBoundary;

    beforeEach(() => {
      boundary = createTopUpBoundary(true);
    });

    it('should accept valid intent', () => {
      const intent = createTopUpIntent({
        intentId: generateTopUpIntentId(),
        playerId: playerId1,
        clubId: clubId1,
        amount: 1000,
      });

      const result = boundary.validateIntent(intent);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject missing intentId', () => {
      const intent = {
        intentId: '' as TopUpIntentId,
        playerId: playerId1,
        clubId: clubId1,
        amount: 1000,
        source: TOP_UP_SOURCE,
        requestedAt: Date.now(),
      } as TopUpIntent;

      const result = boundary.validateIntent(intent);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'INVALID_INTENT_ID')).toBe(true);
    });

    it('should reject missing playerId', () => {
      const intent = {
        intentId: generateTopUpIntentId(),
        playerId: '' as PlayerId,
        clubId: clubId1,
        amount: 1000,
        source: TOP_UP_SOURCE,
        requestedAt: Date.now(),
      } as TopUpIntent;

      const result = boundary.validateIntent(intent);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'MISSING_REQUIRED_FIELD')).toBe(true);
    });

    it('should reject missing clubId', () => {
      const intent = {
        intentId: generateTopUpIntentId(),
        playerId: playerId1,
        clubId: '' as ClubId,
        amount: 1000,
        source: TOP_UP_SOURCE,
        requestedAt: Date.now(),
      } as TopUpIntent;

      const result = boundary.validateIntent(intent);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'MISSING_REQUIRED_FIELD')).toBe(true);
    });

    it('should reject non-integer amount', () => {
      const intent = createTopUpIntent({
        intentId: generateTopUpIntentId(),
        playerId: playerId1,
        clubId: clubId1,
        amount: 100.5,
      });

      const result = boundary.validateIntent(intent);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'NON_INTEGER_AMOUNT')).toBe(true);
    });

    it('should reject zero amount', () => {
      const intent = createTopUpIntent({
        intentId: generateTopUpIntentId(),
        playerId: playerId1,
        clubId: clubId1,
        amount: 0,
      });

      const result = boundary.validateIntent(intent);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'NON_POSITIVE_AMOUNT')).toBe(true);
    });

    it('should reject negative amount', () => {
      const intent = createTopUpIntent({
        intentId: generateTopUpIntentId(),
        playerId: playerId1,
        clubId: clubId1,
        amount: -100,
      });

      const result = boundary.validateIntent(intent);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'NON_POSITIVE_AMOUNT')).toBe(true);
    });
  });

  // ==========================================================================
  // TopUpBoundary Idempotency Tests
  // ==========================================================================

  describe('TopUpBoundary - Idempotency', () => {
    let boundary: TopUpBoundary;

    beforeEach(() => {
      boundary = createTopUpBoundary(true);
    });

    it('should detect duplicate intent', () => {
      const intentId = generateTopUpIntentId();
      const intent = createTopUpIntent({
        intentId,
        playerId: playerId1,
        clubId: clubId1,
        amount: 1000,
      });

      // First validation passes
      const result1 = boundary.validateIntent(intent);
      expect(result1.isValid).toBe(true);

      // Mark as processed
      boundary.markProcessed(intentId);

      // Second validation fails
      const result2 = boundary.validateIntent(intent);
      expect(result2.isValid).toBe(false);
      expect(result2.errors.some(e => e.code === 'DUPLICATE_INTENT')).toBe(true);
    });

    it('should track processed intents', () => {
      const intentId = generateTopUpIntentId();

      expect(boundary.isProcessed(intentId)).toBe(false);

      boundary.markProcessed(intentId);

      expect(boundary.isProcessed(intentId)).toBe(true);
    });

    it('should clear processed intents on clear()', () => {
      const intentId = generateTopUpIntentId();
      boundary.markProcessed(intentId);

      boundary.clear();

      expect(boundary.isProcessed(intentId)).toBe(false);
    });
  });

  // ==========================================================================
  // TopUpBoundary Forbidden Concepts Tests
  // ==========================================================================

  describe('TopUpBoundary - Forbidden Concepts', () => {
    let boundary: TopUpBoundary;

    beforeEach(() => {
      boundary = createTopUpBoundary(true);
    });

    it('should reject metadata with currency keyword', () => {
      const intent = createTopUpIntent({
        intentId: generateTopUpIntentId(),
        playerId: playerId1,
        clubId: clubId1,
        amount: 1000,
        metadata: { note: 'USD currency conversion' },
      });

      const result = boundary.validateIntent(intent);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'FORBIDDEN_METADATA')).toBe(true);
    });

    it('should reject metadata with wallet keyword', () => {
      const intent = createTopUpIntent({
        intentId: generateTopUpIntentId(),
        playerId: playerId1,
        clubId: clubId1,
        amount: 1000,
        metadata: { walletId: 'w-123' },
      });

      const result = boundary.validateIntent(intent);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'FORBIDDEN_METADATA')).toBe(true);
    });

    it('should reject metadata with payment keyword', () => {
      const intent = createTopUpIntent({
        intentId: generateTopUpIntentId(),
        playerId: playerId1,
        clubId: clubId1,
        amount: 1000,
        metadata: { paymentId: 'pay-123' },
      });

      const result = boundary.validateIntent(intent);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'FORBIDDEN_METADATA')).toBe(true);
    });

    it('should reject metadata with crypto keyword', () => {
      const intent = createTopUpIntent({
        intentId: generateTopUpIntentId(),
        playerId: playerId1,
        clubId: clubId1,
        amount: 1000,
        metadata: { txHash: '0x123abc' },
      });

      const result = boundary.validateIntent(intent);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'FORBIDDEN_METADATA')).toBe(true);
    });

    it('should reject metadata with blockchain keyword', () => {
      const intent = createTopUpIntent({
        intentId: generateTopUpIntentId(),
        playerId: playerId1,
        clubId: clubId1,
        amount: 1000,
        metadata: { note: 'blockchain confirmed' },
      });

      const result = boundary.validateIntent(intent);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'FORBIDDEN_METADATA')).toBe(true);
    });

    it('should reject metadata with USDT keyword', () => {
      const intent = createTopUpIntent({
        intentId: generateTopUpIntentId(),
        playerId: playerId1,
        clubId: clubId1,
        amount: 1000,
        metadata: { token: 'usdt' },
      });

      const result = boundary.validateIntent(intent);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'FORBIDDEN_METADATA')).toBe(true);
    });

    it('should allow safe metadata', () => {
      const intent = createTopUpIntent({
        intentId: generateTopUpIntentId(),
        playerId: playerId1,
        clubId: clubId1,
        amount: 1000,
        metadata: { reference: 'ref-123', note: 'admin approved' },
      });

      const result = boundary.validateIntent(intent);

      expect(result.isValid).toBe(true);
    });
  });

  // ==========================================================================
  // TopUpBoundary Settlement Timing Tests
  // ==========================================================================

  describe('TopUpBoundary - Settlement Timing', () => {
    let boundary: TopUpBoundary;

    beforeEach(() => {
      boundary = createTopUpBoundary(true);
    });

    it('should block top-up during settlement', () => {
      boundary.beginSettlement(tableId1);

      const intent = createTopUpIntent({
        intentId: generateTopUpIntentId(),
        playerId: playerId1,
        clubId: clubId1,
        tableId: tableId1,
        amount: 1000,
      });

      const result = boundary.validateIntent(intent);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'FORBIDDEN_TIMING')).toBe(true);
    });

    it('should allow top-up after settlement ends', () => {
      boundary.beginSettlement(tableId1);
      boundary.endSettlement(tableId1);

      const intent = createTopUpIntent({
        intentId: generateTopUpIntentId(),
        playerId: playerId1,
        clubId: clubId1,
        tableId: tableId1,
        amount: 1000,
      });

      const result = boundary.validateIntent(intent);

      expect(result.isValid).toBe(true);
    });

    it('should allow top-up to different table during settlement', () => {
      boundary.beginSettlement(tableId1);

      const intent = createTopUpIntent({
        intentId: generateTopUpIntentId(),
        playerId: playerId1,
        clubId: clubId1,
        tableId: tableId2, // Different table
        amount: 1000,
      });

      const result = boundary.validateIntent(intent);

      expect(result.isValid).toBe(true);
    });

    it('should allow top-up without tableId during settlement', () => {
      boundary.beginSettlement(tableId1);

      const intent = createTopUpIntent({
        intentId: generateTopUpIntentId(),
        playerId: playerId1,
        clubId: clubId1,
        // No tableId
        amount: 1000,
      });

      const result = boundary.validateIntent(intent);

      expect(result.isValid).toBe(true);
    });
  });

  // ==========================================================================
  // TopUpRecorder Tests
  // ==========================================================================

  describe('TopUpRecorder', () => {
    let ledger: ReturnType<typeof createValueLedger>;
    let boundary: TopUpBoundary;
    let recorder: TopUpRecorder;

    beforeEach(() => {
      ledger = createValueLedger();
      boundary = createTopUpBoundary(true);
      recorder = createTopUpRecorder(ledger, boundary, stateVersion);
    });

    it('should record valid intent', () => {
      const intent = createTopUpIntent({
        intentId: generateTopUpIntentId(),
        playerId: playerId1,
        clubId: clubId1,
        amount: 1000,
      });

      const result = recorder.validateAndRecord(intent);

      expect(result.success).toBe(true);
      expect(result.entrySequence).toBe(1);
    });

    it('should reject duplicate intent', () => {
      const intentId = generateTopUpIntentId();
      const intent = createTopUpIntent({
        intentId,
        playerId: playerId1,
        clubId: clubId1,
        amount: 1000,
      });

      recorder.validateAndRecord(intent);
      const result = recorder.validateAndRecord(intent);

      expect(result.success).toBe(false);
      expect(result.isDuplicate).toBe(true);
    });

    it('should create PLAYER-attributed entry', () => {
      const intent = createTopUpIntent({
        intentId: generateTopUpIntentId(),
        playerId: playerId1,
        clubId: clubId1,
        amount: 1000,
      });

      recorder.validateAndRecord(intent);

      const entries = ledger.getAllEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].affectedParty.partyType).toBe('PLAYER');
      expect(entries[0].affectedParty.playerId).toBe(playerId1);
    });

    it('should create TOP_UP source entry', () => {
      const intent = createTopUpIntent({
        intentId: generateTopUpIntentId(),
        playerId: playerId1,
        clubId: clubId1,
        amount: 1000,
      });

      recorder.validateAndRecord(intent);

      const entries = ledger.getAllEntries();
      expect(entries[0].source).toBe('TOP_UP');
    });

    it('should create positive delta entry', () => {
      const intent = createTopUpIntent({
        intentId: generateTopUpIntentId(),
        playerId: playerId1,
        clubId: clubId1,
        amount: 500,
      });

      recorder.validateAndRecord(intent);

      const entries = ledger.getAllEntries();
      expect(entries[0].delta).toBe(500);
    });

    it('should preserve metadata in entry', () => {
      const intent = createTopUpIntent({
        intentId: generateTopUpIntentId(),
        playerId: playerId1,
        clubId: clubId1,
        amount: 1000,
        metadata: { reference: 'ref-123' },
      });

      recorder.validateAndRecord(intent);

      const entries = ledger.getAllEntries();
      expect(entries[0].metadata?.reference).toBe('ref-123');
    });

    it('should track recording statistics', () => {
      const intent1 = createTopUpIntent({
        intentId: generateTopUpIntentId(),
        playerId: playerId1,
        clubId: clubId1,
        amount: 1000,
      });
      const intent2 = createTopUpIntent({
        intentId: generateTopUpIntentId(),
        playerId: playerId2,
        clubId: clubId1,
        amount: 2000,
      });

      recorder.validateAndRecord(intent1);
      recorder.validateAndRecord(intent2);

      const stats = recorder.getStatistics();
      expect(stats.processedIntents).toBe(2);
      expect(stats.ledgerEntries).toBe(2);
    });
  });

  // ==========================================================================
  // TopUpView Tests
  // ==========================================================================

  describe('TopUpView', () => {
    let ledger: ReturnType<typeof createValueLedger>;
    let boundary: TopUpBoundary;
    let recorder: TopUpRecorder;
    let view: TopUpView;

    beforeEach(() => {
      ledger = createValueLedger();
      boundary = createTopUpBoundary(true);
      recorder = createTopUpRecorder(ledger, boundary, stateVersion);
      view = createTopUpView(ledger);
    });

    it('should return zero for player with no top-ups', () => {
      const total = view.getTotalForPlayer(playerId1);
      expect(total).toBe(0);
    });

    it('should return total for player with top-ups', () => {
      recorder.validateAndRecord(createTopUpIntent({
        intentId: generateTopUpIntentId(),
        playerId: playerId1,
        clubId: clubId1,
        amount: 1000,
      }));
      recorder.validateAndRecord(createTopUpIntent({
        intentId: generateTopUpIntentId(),
        playerId: playerId1,
        clubId: clubId1,
        amount: 500,
      }));

      const total = view.getTotalForPlayer(playerId1);
      expect(total).toBe(1500);
    });

    it('should return count for player', () => {
      recorder.validateAndRecord(createTopUpIntent({
        intentId: generateTopUpIntentId(),
        playerId: playerId1,
        clubId: clubId1,
        amount: 1000,
      }));
      recorder.validateAndRecord(createTopUpIntent({
        intentId: generateTopUpIntentId(),
        playerId: playerId1,
        clubId: clubId1,
        amount: 500,
      }));

      const count = view.getCountForPlayer(playerId1);
      expect(count).toBe(2);
    });

    it('should return player summary', () => {
      recorder.validateAndRecord(createTopUpIntent({
        intentId: generateTopUpIntentId(),
        playerId: playerId1,
        clubId: clubId1,
        amount: 1000,
      }));

      const result = view.getPlayerSummary(playerId1);

      expect(result.success).toBe(true);
      expect(result.data?.totalAmount).toBe(1000);
      expect(result.data?.topUpCount).toBe(1);
    });

    it('should return club summary', () => {
      recorder.validateAndRecord(createTopUpIntent({
        intentId: generateTopUpIntentId(),
        playerId: playerId1,
        clubId: clubId1,
        amount: 1000,
      }));
      recorder.validateAndRecord(createTopUpIntent({
        intentId: generateTopUpIntentId(),
        playerId: playerId2,
        clubId: clubId1,
        amount: 2000,
      }));

      const result = view.getClubSummary(clubId1);

      expect(result.success).toBe(true);
      expect(result.data?.totalAmount).toBe(3000);
      expect(result.data?.topUpCount).toBe(2);
      expect(result.data?.uniquePlayers).toBe(2);
    });

    it('should return table summary', () => {
      recorder.validateAndRecord(createTopUpIntent({
        intentId: generateTopUpIntentId(),
        playerId: playerId1,
        clubId: clubId1,
        tableId: tableId1,
        amount: 1000,
      }));

      const result = view.getTableSummary(tableId1);

      expect(result.success).toBe(true);
      expect(result.data?.totalAmount).toBe(1000);
      expect(result.data?.topUpCount).toBe(1);
    });

    it('should return top-ups by player', () => {
      recorder.validateAndRecord(createTopUpIntent({
        intentId: generateTopUpIntentId(),
        playerId: playerId1,
        clubId: clubId1,
        amount: 1000,
      }));
      recorder.validateAndRecord(createTopUpIntent({
        intentId: generateTopUpIntentId(),
        playerId: playerId2,
        clubId: clubId1,
        amount: 2000,
      }));

      const byPlayer = view.getTopUpsByPlayer();

      expect(byPlayer.get(playerId1)).toBe(1000);
      expect(byPlayer.get(playerId2)).toBe(2000);
    });

    it('should filter by time window', () => {
      // Record top-ups
      recorder.validateAndRecord(createTopUpIntent({
        intentId: generateTopUpIntentId(),
        playerId: playerId1,
        clubId: clubId1,
        amount: 1000,
      }));
      recorder.validateAndRecord(createTopUpIntent({
        intentId: generateTopUpIntentId(),
        playerId: playerId1,
        clubId: clubId1,
        amount: 2000,
      }));

      // Get timestamps of entries
      const entries = ledger.getAllEntries();
      expect(entries.length).toBe(2);
      const minTimestamp = Math.min(...entries.map(e => e.timestamp));
      const maxTimestamp = Math.max(...entries.map(e => e.timestamp));

      // Query with time window that includes all entries
      const totalAll = view.getTotalForPlayer(playerId1, {
        fromTimestamp: minTimestamp,
        toTimestamp: maxTimestamp + 1,
      });
      expect(totalAll).toBe(3000);

      // Query with time window in the past (excludes all)
      const totalNone = view.getTotalForPlayer(playerId1, {
        fromTimestamp: 0,
        toTimestamp: minTimestamp - 1,
      });
      expect(totalNone).toBe(0);

      // Query with time window in the future (excludes all)
      const totalFuture = view.getTotalForPlayer(playerId1, {
        fromTimestamp: maxTimestamp + 1000,
        toTimestamp: maxTimestamp + 2000,
      });
      expect(totalFuture).toBe(0);
    });
  });

  // ==========================================================================
  // Ledger Invariant Tests
  // ==========================================================================

  describe('Ledger Invariants', () => {
    let ledger: ReturnType<typeof createValueLedger>;
    let boundary: TopUpBoundary;
    let recorder: TopUpRecorder;

    beforeEach(() => {
      ledger = createValueLedger();
      boundary = createTopUpBoundary(true);
      recorder = createTopUpRecorder(ledger, boundary, stateVersion);
    });

    it('should maintain hash chain integrity', () => {
      recorder.validateAndRecord(createTopUpIntent({
        intentId: generateTopUpIntentId(),
        playerId: playerId1,
        clubId: clubId1,
        amount: 1000,
      }));
      recorder.validateAndRecord(createTopUpIntent({
        intentId: generateTopUpIntentId(),
        playerId: playerId2,
        clubId: clubId1,
        amount: 2000,
      }));

      const result = ledger.verifyIntegrity();

      expect(result.isValid).toBe(true);
      expect(result.verifiedEntries).toBe(2);
    });

    it('should create entries with integer deltas only', () => {
      const intent = createTopUpIntent({
        intentId: generateTopUpIntentId(),
        playerId: playerId1,
        clubId: clubId1,
        amount: 1000,
      });

      recorder.validateAndRecord(intent);

      const entries = ledger.getAllEntries();
      for (const entry of entries) {
        expect(Number.isInteger(entry.delta)).toBe(true);
      }
    });

    it('should never create CLUB-attributed top-up entries', () => {
      recorder.validateAndRecord(createTopUpIntent({
        intentId: generateTopUpIntentId(),
        playerId: playerId1,
        clubId: clubId1,
        amount: 1000,
      }));

      const entries = ledger.getAllEntries();
      const clubEntries = entries.filter(e =>
        e.source === 'TOP_UP' && e.affectedParty.partyType === 'CLUB'
      );

      expect(clubEntries).toHaveLength(0);
    });

    it('should never create AGENT-attributed top-up entries', () => {
      recorder.validateAndRecord(createTopUpIntent({
        intentId: generateTopUpIntentId(),
        playerId: playerId1,
        clubId: clubId1,
        amount: 1000,
      }));

      const entries = ledger.getAllEntries();
      const agentEntries = entries.filter(e =>
        e.source === 'TOP_UP' && e.affectedParty.partyType === 'AGENT'
      );

      expect(agentEntries).toHaveLength(0);
    });

    it('should never create PLATFORM-attributed top-up entries', () => {
      recorder.validateAndRecord(createTopUpIntent({
        intentId: generateTopUpIntentId(),
        playerId: playerId1,
        clubId: clubId1,
        amount: 1000,
      }));

      const entries = ledger.getAllEntries();
      const platformEntries = entries.filter(e =>
        e.source === 'TOP_UP' && e.affectedParty.partyType === 'PLATFORM'
      );

      expect(platformEntries).toHaveLength(0);
    });
  });

  // ==========================================================================
  // No Revenue Contamination Tests
  // ==========================================================================

  describe('No Revenue Contamination', () => {
    let ledger: ReturnType<typeof createValueLedger>;
    let boundary: TopUpBoundary;
    let recorder: TopUpRecorder;

    beforeEach(() => {
      ledger = createValueLedger();
      boundary = createTopUpBoundary(true);
      recorder = createTopUpRecorder(ledger, boundary, stateVersion);
    });

    it('should not count top-ups as revenue', () => {
      recorder.validateAndRecord(createTopUpIntent({
        intentId: generateTopUpIntentId(),
        playerId: playerId1,
        clubId: clubId1,
        amount: 10000,
      }));

      // Top-ups are PLAYER-credited, not CLUB/AGENT/PLATFORM
      const entries = ledger.getAllEntries();
      const revenueEntries = entries.filter(e =>
        e.source === 'TOP_UP' &&
        (e.affectedParty.partyType === 'CLUB' ||
         e.affectedParty.partyType === 'AGENT' ||
         e.affectedParty.partyType === 'PLATFORM')
      );

      expect(revenueEntries).toHaveLength(0);
    });

    it('should not mix top-ups with rake entries', () => {
      recorder.validateAndRecord(createTopUpIntent({
        intentId: generateTopUpIntentId(),
        playerId: playerId1,
        clubId: clubId1,
        amount: 1000,
      }));

      const entries = ledger.getAllEntries();
      const topUpEntries = entries.filter(e => e.source === 'TOP_UP');
      const rakeEntries = entries.filter(e => e.source === 'HAND_SETTLEMENT');

      // All entries should be TOP_UP, none should be HAND_SETTLEMENT
      expect(topUpEntries.length).toBeGreaterThan(0);
      expect(rakeEntries).toHaveLength(0);
    });

    it('should not create negative top-up entries', () => {
      // Attempt to create negative top-up (should be rejected)
      const intent = createTopUpIntent({
        intentId: generateTopUpIntentId(),
        playerId: playerId1,
        clubId: clubId1,
        amount: -1000,
      });

      const result = recorder.validateAndRecord(intent);

      expect(result.success).toBe(false);

      // Verify no entries were created
      const entries = ledger.getAllEntries();
      expect(entries).toHaveLength(0);
    });
  });

  // ==========================================================================
  // Statistics Tests
  // ==========================================================================

  describe('Statistics', () => {
    let ledger: ReturnType<typeof createValueLedger>;
    let boundary: TopUpBoundary;
    let recorder: TopUpRecorder;
    let view: TopUpView;

    beforeEach(() => {
      ledger = createValueLedger();
      boundary = createTopUpBoundary(true);
      recorder = createTopUpRecorder(ledger, boundary, stateVersion);
      view = createTopUpView(ledger);
    });

    it('should track boundary statistics', () => {
      boundary.beginSettlement(tableId1);

      const stats = boundary.getStatistics();

      expect(stats.strictMode).toBe(true);
      expect(stats.activeSettlementCount).toBe(1);
    });

    it('should track view statistics', () => {
      recorder.validateAndRecord(createTopUpIntent({
        intentId: generateTopUpIntentId(),
        playerId: playerId1,
        clubId: clubId1,
        amount: 1000,
      }));
      recorder.validateAndRecord(createTopUpIntent({
        intentId: generateTopUpIntentId(),
        playerId: playerId2,
        clubId: clubId2,
        amount: 2000,
      }));

      const stats = view.getStatistics();

      expect(stats.totalTopUps).toBe(2);
      expect(stats.totalAmount).toBe(3000);
      expect(stats.uniquePlayers).toBe(2);
      expect(stats.uniqueClubs).toBe(2);
    });
  });
});
