/**
 * AdminCredit.test.ts
 * Phase 29 - Admin Credit (Manual Top-Up) System Tests
 *
 * Comprehensive tests ensuring:
 * - Valid admin credit succeeds
 * - Duplicate intentId is idempotent
 * - Negative / zero amount rejected
 * - Missing note rejected
 * - Revenue is NOT affected
 * - Rake remains unchanged
 * - Ledger invariants preserved
 * - Credits flow through TopUpBoundary
 */

import { PlayerId } from '../../security/Identity';
import { TableId } from '../../security/AuditLog';
import { ClubId } from '../../club/ClubTypes';
import { StateVersion } from '../../sync/SyncTypes';
import { createValueLedger } from '../../ledger/LedgerEntry';
import { resetLedgerCounters } from '../../ledger/LedgerTypes';
import { createTopUpBoundary } from '../../topup/TopUpBoundary';
import { createTopUpRecorder } from '../../topup/TopUpRecorder';
import { resetTopUpCounters } from '../../topup/TopUpTypes';

import {
  AdminId,
  AdminCreditIntentId,
  generateAdminCreditIntentId,
  resetAdminCreditCounters,
  ADMIN_CREDIT_REASONS,
  isValidAdminCreditReason,
  AdminCreditIntent,
  createAdminCreditIntent,
  AdminCreditPolicy,
  createAdminCreditPolicy,
  AdminCreditService,
  createAdminCreditService,
  AdminCreditView,
  createAdminCreditView,
} from '../index';

// ============================================================================
// Test Setup
// ============================================================================

describe('Phase 29: Admin Credit (Manual Top-Up) System', () => {
  // Test data
  const adminId1 = 'admin-001' as AdminId;
  const adminId2 = 'admin-002' as AdminId;
  const playerId1 = 'player-001' as PlayerId;
  const playerId2 = 'player-002' as PlayerId;
  const clubId1 = 'club-001' as ClubId;
  const tableId1 = 'table-001' as TableId;
  const stateVersion = 1 as StateVersion;

  beforeEach(() => {
    resetAdminCreditCounters();
    resetTopUpCounters();
    resetLedgerCounters();
  });

  // ==========================================================================
  // AdminCreditTypes Tests
  // ==========================================================================

  describe('AdminCreditTypes', () => {
    it('should generate unique intent IDs', () => {
      const id1 = generateAdminCreditIntentId();
      const id2 = generateAdminCreditIntentId();
      const id3 = generateAdminCreditIntentId();

      expect(id1).not.toBe(id2);
      expect(id2).not.toBe(id3);
      expect(id1).toContain('admcredit_');
    });

    it('should reset intent ID counter', () => {
      generateAdminCreditIntentId();
      generateAdminCreditIntentId();
      resetAdminCreditCounters();
      const id = generateAdminCreditIntentId();

      expect(id).toContain('_1');
    });

    it('should have all admin credit reasons', () => {
      expect(ADMIN_CREDIT_REASONS).toContain('OFFLINE_BUYIN');
      expect(ADMIN_CREDIT_REASONS).toContain('PROMOTION');
      expect(ADMIN_CREDIT_REASONS).toContain('TESTING');
      expect(ADMIN_CREDIT_REASONS).toContain('CORRECTION');
      expect(ADMIN_CREDIT_REASONS).toHaveLength(4);
    });

    it('should validate admin credit reasons', () => {
      expect(isValidAdminCreditReason('OFFLINE_BUYIN')).toBe(true);
      expect(isValidAdminCreditReason('PROMOTION')).toBe(true);
      expect(isValidAdminCreditReason('TESTING')).toBe(true);
      expect(isValidAdminCreditReason('CORRECTION')).toBe(true);
      expect(isValidAdminCreditReason('INVALID')).toBe(false);
      expect(isValidAdminCreditReason(123)).toBe(false);
    });
  });

  // ==========================================================================
  // AdminCreditIntent Tests
  // ==========================================================================

  describe('AdminCreditIntent', () => {
    it('should create intent with required fields', () => {
      const intent = createAdminCreditIntent({
        intentId: generateAdminCreditIntentId(),
        adminId: adminId1,
        playerId: playerId1,
        clubId: clubId1,
        amount: 1000,
        reason: 'OFFLINE_BUYIN',
        note: 'Test credit',
      });

      expect(intent.adminId).toBe(adminId1);
      expect(intent.playerId).toBe(playerId1);
      expect(intent.clubId).toBe(clubId1);
      expect(intent.amount).toBe(1000);
      expect(intent.reason).toBe('OFFLINE_BUYIN');
      expect(intent.note).toBe('Test credit');
      expect(intent.createdAt).toBeGreaterThan(0);
    });

    it('should create intent with optional tableId', () => {
      const intent = createAdminCreditIntent({
        intentId: generateAdminCreditIntentId(),
        adminId: adminId1,
        playerId: playerId1,
        clubId: clubId1,
        tableId: tableId1,
        amount: 500,
        reason: 'TESTING',
        note: 'Table test credit',
      });

      expect(intent.tableId).toBe(tableId1);
    });
  });

  // ==========================================================================
  // AdminCreditPolicy Tests
  // ==========================================================================

  describe('AdminCreditPolicy', () => {
    let policy: AdminCreditPolicy;

    beforeEach(() => {
      policy = createAdminCreditPolicy();
      policy.registerAdmin(adminId1);
      policy.registerAdmin(adminId2);
    });

    it('should accept valid intent', () => {
      const intent = createAdminCreditIntent({
        intentId: generateAdminCreditIntentId(),
        adminId: adminId1,
        playerId: playerId1,
        clubId: clubId1,
        amount: 1000,
        reason: 'OFFLINE_BUYIN',
        note: 'Valid credit',
      });

      const result = policy.validate(intent);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject unregistered admin', () => {
      const intent = createAdminCreditIntent({
        intentId: generateAdminCreditIntentId(),
        adminId: 'unregistered-admin' as AdminId,
        playerId: playerId1,
        clubId: clubId1,
        amount: 1000,
        reason: 'OFFLINE_BUYIN',
        note: 'Valid credit',
      });

      const result = policy.validate(intent);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'INVALID_ADMIN_ID')).toBe(true);
    });

    it('should reject non-integer amount', () => {
      const intent = createAdminCreditIntent({
        intentId: generateAdminCreditIntentId(),
        adminId: adminId1,
        playerId: playerId1,
        clubId: clubId1,
        amount: 100.5,
        reason: 'OFFLINE_BUYIN',
        note: 'Valid credit',
      });

      const result = policy.validate(intent);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'NON_INTEGER_AMOUNT')).toBe(true);
    });

    it('should reject zero amount', () => {
      const intent = createAdminCreditIntent({
        intentId: generateAdminCreditIntentId(),
        adminId: adminId1,
        playerId: playerId1,
        clubId: clubId1,
        amount: 0,
        reason: 'OFFLINE_BUYIN',
        note: 'Valid credit',
      });

      const result = policy.validate(intent);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'NON_POSITIVE_AMOUNT')).toBe(true);
    });

    it('should reject negative amount', () => {
      const intent = createAdminCreditIntent({
        intentId: generateAdminCreditIntentId(),
        adminId: adminId1,
        playerId: playerId1,
        clubId: clubId1,
        amount: -100,
        reason: 'OFFLINE_BUYIN',
        note: 'Valid credit',
      });

      const result = policy.validate(intent);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'NON_POSITIVE_AMOUNT')).toBe(true);
    });

    it('should reject missing note', () => {
      const intent = createAdminCreditIntent({
        intentId: generateAdminCreditIntentId(),
        adminId: adminId1,
        playerId: playerId1,
        clubId: clubId1,
        amount: 1000,
        reason: 'OFFLINE_BUYIN',
        note: '',
      });

      const result = policy.validate(intent);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'NOTE_TOO_SHORT')).toBe(true);
    });

    it('should reject duplicate intent', () => {
      const intentId = generateAdminCreditIntentId();
      const intent = createAdminCreditIntent({
        intentId,
        adminId: adminId1,
        playerId: playerId1,
        clubId: clubId1,
        amount: 1000,
        reason: 'OFFLINE_BUYIN',
        note: 'Valid credit',
      });

      const result1 = policy.validate(intent);
      expect(result1.isValid).toBe(true);

      policy.markProcessed(intentId);

      const result2 = policy.validate(intent);
      expect(result2.isValid).toBe(false);
      expect(result2.errors.some(e => e.code === 'DUPLICATE_INTENT')).toBe(true);
    });

    it('should block credit during settlement', () => {
      policy.beginSettlement(tableId1);

      const intent = createAdminCreditIntent({
        intentId: generateAdminCreditIntentId(),
        adminId: adminId1,
        playerId: playerId1,
        clubId: clubId1,
        tableId: tableId1,
        amount: 1000,
        reason: 'OFFLINE_BUYIN',
        note: 'Valid credit',
      });

      const result = policy.validate(intent);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'FORBIDDEN_TIMING')).toBe(true);
    });

    it('should allow credit after settlement ends', () => {
      policy.beginSettlement(tableId1);
      policy.endSettlement(tableId1);

      const intent = createAdminCreditIntent({
        intentId: generateAdminCreditIntentId(),
        adminId: adminId1,
        playerId: playerId1,
        clubId: clubId1,
        tableId: tableId1,
        amount: 1000,
        reason: 'OFFLINE_BUYIN',
        note: 'Valid credit',
      });

      const result = policy.validate(intent);

      expect(result.isValid).toBe(true);
    });
  });

  // ==========================================================================
  // AdminCreditService Tests
  // ==========================================================================

  describe('AdminCreditService', () => {
    let ledger: ReturnType<typeof createValueLedger>;
    let topUpBoundary: ReturnType<typeof createTopUpBoundary>;
    let topUpRecorder: ReturnType<typeof createTopUpRecorder>;
    let policy: AdminCreditPolicy;
    let service: AdminCreditService;

    beforeEach(() => {
      ledger = createValueLedger();
      topUpBoundary = createTopUpBoundary(true);
      topUpRecorder = createTopUpRecorder(ledger, topUpBoundary, stateVersion);
      policy = createAdminCreditPolicy();
      policy.registerAdmin(adminId1);
      policy.registerAdmin(adminId2);
      service = createAdminCreditService(policy, topUpRecorder);
    });

    it('should process valid admin credit', () => {
      const intent = createAdminCreditIntent({
        intentId: generateAdminCreditIntentId(),
        adminId: adminId1,
        playerId: playerId1,
        clubId: clubId1,
        amount: 1000,
        reason: 'OFFLINE_BUYIN',
        note: 'Customer chip addition',
      });

      const result = service.processCredit(intent);

      expect(result.success).toBe(true);
      expect(result.entrySequence).toBe(1);
    });

    it('should reject duplicate credit (idempotent)', () => {
      const intentId = generateAdminCreditIntentId();
      const intent = createAdminCreditIntent({
        intentId,
        adminId: adminId1,
        playerId: playerId1,
        clubId: clubId1,
        amount: 1000,
        reason: 'OFFLINE_BUYIN',
        note: 'Customer chip addition',
      });

      const result1 = service.processCredit(intent);
      expect(result1.success).toBe(true);

      const result2 = service.processCredit(intent);
      expect(result2.success).toBe(false);
      expect(result2.isDuplicate).toBe(true);
    });

    it('should create ledger entry through TopUpBoundary', () => {
      const intent = createAdminCreditIntent({
        intentId: generateAdminCreditIntentId(),
        adminId: adminId1,
        playerId: playerId1,
        clubId: clubId1,
        amount: 1000,
        reason: 'TESTING',
        note: 'Test credit',
      });

      service.processCredit(intent);

      const entries = ledger.getAllEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].source).toBe('TOP_UP');
      expect(entries[0].affectedParty.partyType).toBe('PLAYER');
      expect(entries[0].affectedParty.playerId).toBe(playerId1);
      expect(entries[0].delta).toBe(1000);
    });

    it('should preserve admin metadata in ledger entry', () => {
      const intent = createAdminCreditIntent({
        intentId: generateAdminCreditIntentId(),
        adminId: adminId1,
        playerId: playerId1,
        clubId: clubId1,
        amount: 1000,
        reason: 'CORRECTION',
        note: 'Chip adjustment for dispute #123',
      });

      service.processCredit(intent);

      const entries = ledger.getAllEntries();
      expect(entries[0].metadata?.source).toBe('ADMIN_CREDIT');
      expect(entries[0].metadata?.adminId).toBe(adminId1);
      expect(entries[0].metadata?.reason).toBe('CORRECTION');
      expect(entries[0].metadata?.note).toBe('Chip adjustment for dispute #123');
    });

    it('should track service statistics', () => {
      service.processCredit(createAdminCreditIntent({
        intentId: generateAdminCreditIntentId(),
        adminId: adminId1,
        playerId: playerId1,
        clubId: clubId1,
        amount: 1000,
        reason: 'OFFLINE_BUYIN',
        note: 'Credit 1',
      }));
      service.processCredit(createAdminCreditIntent({
        intentId: generateAdminCreditIntentId(),
        adminId: adminId2,
        playerId: playerId2,
        clubId: clubId1,
        amount: 2000,
        reason: 'PROMOTION',
        note: 'Credit 2',
      }));

      const stats = service.getStatistics();
      expect(stats.processedCredits).toBe(2);
    });
  });

  // ==========================================================================
  // AdminCreditView Tests
  // ==========================================================================

  describe('AdminCreditView', () => {
    let ledger: ReturnType<typeof createValueLedger>;
    let topUpBoundary: ReturnType<typeof createTopUpBoundary>;
    let topUpRecorder: ReturnType<typeof createTopUpRecorder>;
    let policy: AdminCreditPolicy;
    let service: AdminCreditService;
    let view: AdminCreditView;

    beforeEach(() => {
      ledger = createValueLedger();
      topUpBoundary = createTopUpBoundary(true);
      topUpRecorder = createTopUpRecorder(ledger, topUpBoundary, stateVersion);
      policy = createAdminCreditPolicy();
      policy.registerAdmin(adminId1);
      policy.registerAdmin(adminId2);
      service = createAdminCreditService(policy, topUpRecorder);
      view = createAdminCreditView(ledger);
    });

    it('should return zero for admin with no credits', () => {
      const total = view.getTotalByAdmin(adminId1);
      expect(total).toBe(0);
    });

    it('should return total by admin', () => {
      service.processCredit(createAdminCreditIntent({
        intentId: generateAdminCreditIntentId(),
        adminId: adminId1,
        playerId: playerId1,
        clubId: clubId1,
        amount: 1000,
        reason: 'OFFLINE_BUYIN',
        note: 'Credit 1',
      }));
      service.processCredit(createAdminCreditIntent({
        intentId: generateAdminCreditIntentId(),
        adminId: adminId1,
        playerId: playerId2,
        clubId: clubId1,
        amount: 500,
        reason: 'OFFLINE_BUYIN',
        note: 'Credit 2',
      }));

      const total = view.getTotalByAdmin(adminId1);
      expect(total).toBe(1500);
    });

    it('should return total by player', () => {
      service.processCredit(createAdminCreditIntent({
        intentId: generateAdminCreditIntentId(),
        adminId: adminId1,
        playerId: playerId1,
        clubId: clubId1,
        amount: 1000,
        reason: 'OFFLINE_BUYIN',
        note: 'Credit 1',
      }));
      service.processCredit(createAdminCreditIntent({
        intentId: generateAdminCreditIntentId(),
        adminId: adminId2,
        playerId: playerId1,
        clubId: clubId1,
        amount: 2000,
        reason: 'PROMOTION',
        note: 'Credit 2',
      }));

      const total = view.getTotalByPlayer(playerId1);
      expect(total).toBe(3000);
    });

    it('should return breakdown by reason', () => {
      service.processCredit(createAdminCreditIntent({
        intentId: generateAdminCreditIntentId(),
        adminId: adminId1,
        playerId: playerId1,
        clubId: clubId1,
        amount: 1000,
        reason: 'OFFLINE_BUYIN',
        note: 'Credit 1',
      }));
      service.processCredit(createAdminCreditIntent({
        intentId: generateAdminCreditIntentId(),
        adminId: adminId1,
        playerId: playerId1,
        clubId: clubId1,
        amount: 500,
        reason: 'TESTING',
        note: 'Credit 2',
      }));

      const breakdown = view.getBreakdownByReason();
      expect(breakdown.OFFLINE_BUYIN).toBe(1000);
      expect(breakdown.TESTING).toBe(500);
      expect(breakdown.PROMOTION).toBe(0);
      expect(breakdown.CORRECTION).toBe(0);
    });

    it('should return admin summary', () => {
      service.processCredit(createAdminCreditIntent({
        intentId: generateAdminCreditIntentId(),
        adminId: adminId1,
        playerId: playerId1,
        clubId: clubId1,
        amount: 1000,
        reason: 'OFFLINE_BUYIN',
        note: 'Credit 1',
      }));

      const result = view.getAdminSummary(adminId1);

      expect(result.success).toBe(true);
      expect(result.data?.totalAmount).toBe(1000);
      expect(result.data?.creditCount).toBe(1);
      expect(result.data?.byReason.OFFLINE_BUYIN).toBe(1000);
    });

    it('should return player summary', () => {
      service.processCredit(createAdminCreditIntent({
        intentId: generateAdminCreditIntentId(),
        adminId: adminId1,
        playerId: playerId1,
        clubId: clubId1,
        amount: 1000,
        reason: 'PROMOTION',
        note: 'Credit 1',
      }));

      const result = view.getPlayerSummary(playerId1);

      expect(result.success).toBe(true);
      expect(result.data?.totalAmount).toBe(1000);
      expect(result.data?.creditCount).toBe(1);
      expect(result.data?.byReason.PROMOTION).toBe(1000);
    });

    it('should return view statistics', () => {
      service.processCredit(createAdminCreditIntent({
        intentId: generateAdminCreditIntentId(),
        adminId: adminId1,
        playerId: playerId1,
        clubId: clubId1,
        amount: 1000,
        reason: 'OFFLINE_BUYIN',
        note: 'Credit 1',
      }));
      service.processCredit(createAdminCreditIntent({
        intentId: generateAdminCreditIntentId(),
        adminId: adminId2,
        playerId: playerId2,
        clubId: clubId1,
        amount: 2000,
        reason: 'TESTING',
        note: 'Credit 2',
      }));

      const stats = view.getStatistics();
      expect(stats.totalCredits).toBe(2);
      expect(stats.totalAmount).toBe(3000);
      expect(stats.uniqueAdmins).toBe(2);
      expect(stats.uniquePlayers).toBe(2);
    });
  });

  // ==========================================================================
  // Revenue / Rake Isolation Tests
  // ==========================================================================

  describe('Revenue / Rake Isolation', () => {
    let ledger: ReturnType<typeof createValueLedger>;
    let topUpBoundary: ReturnType<typeof createTopUpBoundary>;
    let topUpRecorder: ReturnType<typeof createTopUpRecorder>;
    let policy: AdminCreditPolicy;
    let service: AdminCreditService;

    beforeEach(() => {
      ledger = createValueLedger();
      topUpBoundary = createTopUpBoundary(true);
      topUpRecorder = createTopUpRecorder(ledger, topUpBoundary, stateVersion);
      policy = createAdminCreditPolicy();
      policy.registerAdmin(adminId1);
      service = createAdminCreditService(policy, topUpRecorder);
    });

    it('should NOT create CLUB-attributed entries', () => {
      service.processCredit(createAdminCreditIntent({
        intentId: generateAdminCreditIntentId(),
        adminId: adminId1,
        playerId: playerId1,
        clubId: clubId1,
        amount: 10000,
        reason: 'OFFLINE_BUYIN',
        note: 'Large credit',
      }));

      const entries = ledger.getAllEntries();
      const clubEntries = entries.filter(e =>
        e.affectedParty.partyType === 'CLUB'
      );

      expect(clubEntries).toHaveLength(0);
    });

    it('should NOT create AGENT-attributed entries', () => {
      service.processCredit(createAdminCreditIntent({
        intentId: generateAdminCreditIntentId(),
        adminId: adminId1,
        playerId: playerId1,
        clubId: clubId1,
        amount: 10000,
        reason: 'OFFLINE_BUYIN',
        note: 'Large credit',
      }));

      const entries = ledger.getAllEntries();
      const agentEntries = entries.filter(e =>
        e.affectedParty.partyType === 'AGENT'
      );

      expect(agentEntries).toHaveLength(0);
    });

    it('should NOT create PLATFORM-attributed entries', () => {
      service.processCredit(createAdminCreditIntent({
        intentId: generateAdminCreditIntentId(),
        adminId: adminId1,
        playerId: playerId1,
        clubId: clubId1,
        amount: 10000,
        reason: 'OFFLINE_BUYIN',
        note: 'Large credit',
      }));

      const entries = ledger.getAllEntries();
      const platformEntries = entries.filter(e =>
        e.affectedParty.partyType === 'PLATFORM'
      );

      expect(platformEntries).toHaveLength(0);
    });

    it('should NOT create HAND_SETTLEMENT entries', () => {
      service.processCredit(createAdminCreditIntent({
        intentId: generateAdminCreditIntentId(),
        adminId: adminId1,
        playerId: playerId1,
        clubId: clubId1,
        amount: 10000,
        reason: 'CORRECTION',
        note: 'Credit',
      }));

      const entries = ledger.getAllEntries();
      const settlementEntries = entries.filter(e =>
        e.source === 'HAND_SETTLEMENT'
      );

      expect(settlementEntries).toHaveLength(0);
    });

    it('should use TOP_UP source only', () => {
      service.processCredit(createAdminCreditIntent({
        intentId: generateAdminCreditIntentId(),
        adminId: adminId1,
        playerId: playerId1,
        clubId: clubId1,
        amount: 1000,
        reason: 'TESTING',
        note: 'Test credit',
      }));

      const entries = ledger.getAllEntries();
      expect(entries.every(e => e.source === 'TOP_UP')).toBe(true);
    });
  });

  // ==========================================================================
  // Ledger Invariant Tests
  // ==========================================================================

  describe('Ledger Invariants', () => {
    let ledger: ReturnType<typeof createValueLedger>;
    let topUpBoundary: ReturnType<typeof createTopUpBoundary>;
    let topUpRecorder: ReturnType<typeof createTopUpRecorder>;
    let policy: AdminCreditPolicy;
    let service: AdminCreditService;

    beforeEach(() => {
      ledger = createValueLedger();
      topUpBoundary = createTopUpBoundary(true);
      topUpRecorder = createTopUpRecorder(ledger, topUpBoundary, stateVersion);
      policy = createAdminCreditPolicy();
      policy.registerAdmin(adminId1);
      service = createAdminCreditService(policy, topUpRecorder);
    });

    it('should maintain hash chain integrity', () => {
      service.processCredit(createAdminCreditIntent({
        intentId: generateAdminCreditIntentId(),
        adminId: adminId1,
        playerId: playerId1,
        clubId: clubId1,
        amount: 1000,
        reason: 'OFFLINE_BUYIN',
        note: 'Credit 1',
      }));
      service.processCredit(createAdminCreditIntent({
        intentId: generateAdminCreditIntentId(),
        adminId: adminId1,
        playerId: playerId2,
        clubId: clubId1,
        amount: 2000,
        reason: 'PROMOTION',
        note: 'Credit 2',
      }));

      const result = ledger.verifyIntegrity();

      expect(result.isValid).toBe(true);
      expect(result.verifiedEntries).toBe(2);
    });

    it('should create entries with integer deltas only', () => {
      service.processCredit(createAdminCreditIntent({
        intentId: generateAdminCreditIntentId(),
        adminId: adminId1,
        playerId: playerId1,
        clubId: clubId1,
        amount: 1000,
        reason: 'TESTING',
        note: 'Test credit',
      }));

      const entries = ledger.getAllEntries();
      for (const entry of entries) {
        expect(Number.isInteger(entry.delta)).toBe(true);
      }
    });

    it('should only create PLAYER-attributed entries', () => {
      service.processCredit(createAdminCreditIntent({
        intentId: generateAdminCreditIntentId(),
        adminId: adminId1,
        playerId: playerId1,
        clubId: clubId1,
        amount: 1000,
        reason: 'CORRECTION',
        note: 'Correction',
      }));

      const entries = ledger.getAllEntries();
      expect(entries.every(e => e.affectedParty.partyType === 'PLAYER')).toBe(true);
    });

    it('should only create positive delta entries', () => {
      service.processCredit(createAdminCreditIntent({
        intentId: generateAdminCreditIntentId(),
        adminId: adminId1,
        playerId: playerId1,
        clubId: clubId1,
        amount: 1000,
        reason: 'OFFLINE_BUYIN',
        note: 'Credit',
      }));

      const entries = ledger.getAllEntries();
      expect(entries.every(e => e.delta > 0)).toBe(true);
    });
  });

  // ==========================================================================
  // TopUpBoundary Integration Tests
  // ==========================================================================

  describe('TopUpBoundary Integration', () => {
    let ledger: ReturnType<typeof createValueLedger>;
    let topUpBoundary: ReturnType<typeof createTopUpBoundary>;
    let topUpRecorder: ReturnType<typeof createTopUpRecorder>;
    let policy: AdminCreditPolicy;
    let service: AdminCreditService;

    beforeEach(() => {
      ledger = createValueLedger();
      topUpBoundary = createTopUpBoundary(true);
      topUpRecorder = createTopUpRecorder(ledger, topUpBoundary, stateVersion);
      policy = createAdminCreditPolicy();
      policy.registerAdmin(adminId1);
      service = createAdminCreditService(policy, topUpRecorder);
    });

    it('should flow through TopUpBoundary', () => {
      const intent = createAdminCreditIntent({
        intentId: generateAdminCreditIntentId(),
        adminId: adminId1,
        playerId: playerId1,
        clubId: clubId1,
        amount: 1000,
        reason: 'OFFLINE_BUYIN',
        note: 'Credit',
      });

      service.processCredit(intent);

      // Verify TopUpBoundary was used
      const boundaryStats = topUpBoundary.getStatistics();
      expect(boundaryStats.processedCount).toBe(1);
    });

    it('should respect TopUpBoundary settlement guards', () => {
      // Start settlement at TopUpBoundary level
      topUpBoundary.beginSettlement(tableId1);

      const intent = createAdminCreditIntent({
        intentId: generateAdminCreditIntentId(),
        adminId: adminId1,
        playerId: playerId1,
        clubId: clubId1,
        tableId: tableId1,
        amount: 1000,
        reason: 'OFFLINE_BUYIN',
        note: 'Credit',
      });

      const result = service.processCredit(intent);

      // Should fail because TopUpBoundary blocks during settlement
      expect(result.success).toBe(false);
      expect(result.error).toContain('rejected');
    });

    it('should map AdminCreditIntentId to TopUpIntentId', () => {
      const adminIntentId = generateAdminCreditIntentId();
      const intent = createAdminCreditIntent({
        intentId: adminIntentId,
        adminId: adminId1,
        playerId: playerId1,
        clubId: clubId1,
        amount: 1000,
        reason: 'TESTING',
        note: 'Test',
      });

      service.processCredit(intent);

      const topUpIntentId = service.getTopUpIntentId(adminIntentId);
      expect(topUpIntentId).toBeDefined();
      expect(topUpIntentId).toContain('topup_');
    });
  });

  // ==========================================================================
  // Audit Trail Tests
  // ==========================================================================

  describe('Audit Trail', () => {
    let ledger: ReturnType<typeof createValueLedger>;
    let topUpBoundary: ReturnType<typeof createTopUpBoundary>;
    let topUpRecorder: ReturnType<typeof createTopUpRecorder>;
    let policy: AdminCreditPolicy;
    let service: AdminCreditService;

    beforeEach(() => {
      ledger = createValueLedger();
      topUpBoundary = createTopUpBoundary(true);
      topUpRecorder = createTopUpRecorder(ledger, topUpBoundary, stateVersion);
      policy = createAdminCreditPolicy();
      policy.registerAdmin(adminId1);
      service = createAdminCreditService(policy, topUpRecorder);
    });

    it('should include full audit context in entry metadata', () => {
      const adminIntentId = generateAdminCreditIntentId();
      service.processCredit(createAdminCreditIntent({
        intentId: adminIntentId,
        adminId: adminId1,
        playerId: playerId1,
        clubId: clubId1,
        amount: 5000,
        reason: 'CORRECTION',
        note: 'Resolving dispute #456',
      }));

      const entries = ledger.getAllEntries();
      const entry = entries[0];

      expect(entry.metadata?.source).toBe('ADMIN_CREDIT');
      expect(entry.metadata?.adminId).toBe(adminId1);
      expect(entry.metadata?.adminCreditIntentId).toBe(adminIntentId);
      expect(entry.metadata?.reason).toBe('CORRECTION');
      expect(entry.metadata?.note).toBe('Resolving dispute #456');
    });

    it('should preserve all reasons in audit trail', () => {
      for (const reason of ADMIN_CREDIT_REASONS) {
        service.processCredit(createAdminCreditIntent({
          intentId: generateAdminCreditIntentId(),
          adminId: adminId1,
          playerId: playerId1,
          clubId: clubId1,
          amount: 100,
          reason,
          note: `Credit for ${reason}`,
        }));
      }

      const entries = ledger.getAllEntries();
      expect(entries).toHaveLength(4);

      const reasons = entries.map(e => e.metadata?.reason);
      expect(reasons).toContain('OFFLINE_BUYIN');
      expect(reasons).toContain('PROMOTION');
      expect(reasons).toContain('TESTING');
      expect(reasons).toContain('CORRECTION');
    });
  });
});
