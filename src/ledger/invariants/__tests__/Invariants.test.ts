/**
 * Invariants Module Tests
 * Phase 25.1 - Comprehensive tests for ledger invariants
 *
 * Tests cover:
 * - All 5 invariants (I1-I5)
 * - Violation detection and structured errors
 * - External value boundary guards
 * - Edge cases and error conditions
 */

import {
  ValueLedger,
  createValueLedger,
  LedgerRecorder,
  createLedgerRecorder,
  LedgerEntryInput,
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
  InvariantChecker,
  createInvariantChecker,
  ExternalValueBoundary,
  createExternalValueBoundary,
  InvariantViolation,
  resetViolationCounter,
  isCriticalViolation,
  filterViolationsByInvariant,
  INVARIANT_SPECS,
  getAllInvariants,
  getCriticalInvariants,
  DEFAULT_INVARIANT_CONFIG,
  STRICT_INVARIANT_CONFIG,
} from '../index';

import { PlayerId } from '../../../security/Identity';
import { TableId, HandId } from '../../../security/AuditLog';
import { ClubId } from '../../../club/ClubTypes';
import { createStateVersion } from '../../../sync/SyncTypes';

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

function createBalancedSettlement(): SettlementAttribution {
  // Player 1 wins 90, Club gets 10 rake (split: 7 club, 2 agent, 1 platform)
  // Total in: 100, Total out: 90 + 7 + 2 + 1 = 100 ✓
  return {
    handId: TEST_HAND_ID,
    tableId: TEST_TABLE_ID,
    clubId: TEST_CLUB_ID,
    stateVersion: createStateVersion(1),
    potWinners: [
      { playerId: createTestPlayer(1), amount: 90, potType: 'main' },
    ],
    rakeTotal: 10,
    rakeBreakdown: {
      clubShare: 7,
      agentShare: 2,
      agentId: TEST_AGENT_ID,
      platformShare: 1,
    },
  };
}

// ============================================================================
// Invariant Specification Tests
// ============================================================================

describe('Invariant Specifications', () => {
  it('should define all 5 invariants', () => {
    expect(INVARIANT_SPECS.NON_NEGATIVE_BALANCE).toBeDefined();
    expect(INVARIANT_SPECS.SYSTEM_CONSERVATION).toBeDefined();
    expect(INVARIANT_SPECS.DETERMINISTIC_REPLAY).toBeDefined();
    expect(INVARIANT_SPECS.APPEND_ONLY_INTEGRITY).toBeDefined();
    expect(INVARIANT_SPECS.ATTRIBUTION_IMMUTABILITY).toBeDefined();
  });

  it('should return all invariants', () => {
    const all = getAllInvariants();
    expect(all.length).toBe(5);
  });

  it('should identify critical invariants', () => {
    const critical = getCriticalInvariants();
    expect(critical.length).toBeGreaterThan(0);
    critical.forEach(inv => {
      expect(inv.severity).toBe('CRITICAL');
    });
  });

  it('should have valid invariant structure', () => {
    for (const inv of getAllInvariants()) {
      expect(inv.type).toBeDefined();
      expect(inv.name).toBeDefined();
      expect(inv.description).toBeDefined();
      expect(inv.severity).toBeDefined();
      expect(inv.category).toBeDefined();
      expect(typeof inv.checkOnOperation).toBe('boolean');
      expect(typeof inv.requiresFullScan).toBe('boolean');
    }
  });
});

// ============================================================================
// InvariantChecker Tests
// ============================================================================

describe('InvariantChecker', () => {
  let ledger: ValueLedger;
  let recorder: LedgerRecorder;
  let checker: InvariantChecker;

  beforeEach(() => {
    resetLedgerCounters();
    resetViolationCounter();
    ledger = createValueLedger();
    recorder = createLedgerRecorder(ledger);
    checker = createInvariantChecker(ledger);
  });

  afterEach(() => {
    recorder.clear();
  });

  describe('I1: NON_NEGATIVE_BALANCE', () => {
    it('should pass for positive balances', () => {
      recorder.recordSettlement(createBalancedSettlement());

      const result = checker.checkInvariant('NON_NEGATIVE_BALANCE');

      expect(result.passed).toBe(true);
      expect(result.violation).toBeUndefined();
    });

    it('should pass for zero balances', () => {
      // Empty ledger has zero balances for everyone
      const result = checker.checkInvariant('NON_NEGATIVE_BALANCE');

      expect(result.passed).toBe(true);
    });

    it('should detect negative balance from sequence of entries', () => {
      // Create unbalanced entry that leaves a party negative
      const input: LedgerEntryInput = {
        source: 'ADJUSTMENT',
        affectedParty: createPlayerParty(createTestPlayer(1)),
        delta: -100,  // Debit without prior credit
        stateVersion: createStateVersion(1),
        description: 'Test debit',
      };

      ledger.appendEntry(input);

      const result = checker.checkInvariant('NON_NEGATIVE_BALANCE');

      expect(result.passed).toBe(false);
      expect(result.violation).toBeDefined();
      expect(result.violation!.invariant).toBe('NON_NEGATIVE_BALANCE');
    });

    it('should check specific party balance', () => {
      const result = checker.checkPartyBalance('PLAYER', createTestPlayer(1));

      expect(result.invariant).toBe('NON_NEGATIVE_BALANCE');
      expect(result.passed).toBe(true);  // Zero is valid
    });
  });

  describe('I2: SYSTEM_CONSERVATION', () => {
    it('should pass for balanced settlement', () => {
      recorder.recordSettlement(createBalancedSettlement());

      const result = checker.checkInvariant('SYSTEM_CONSERVATION');

      expect(result.passed).toBe(true);
    });

    it('should check batch conservation', () => {
      const { batch } = ledger.appendBatch('HAND_SETTLEMENT', [
        {
          source: 'HAND_SETTLEMENT',
          category: 'POT_WIN',
          affectedParty: createPlayerParty(createTestPlayer(1)),
          delta: 100,
          stateVersion: createStateVersion(1),
          description: 'Win',
        },
        {
          source: 'HAND_SETTLEMENT',
          category: 'RAKE',
          affectedParty: createClubParty(TEST_CLUB_ID),
          delta: -100,  // Balanced
          stateVersion: createStateVersion(1),
          description: 'Source',
        },
      ]);

      const violation = checker.checkBatchConservation(batch.batchId);

      expect(violation).toBeUndefined();
    });

    it('should detect unbalanced batch', () => {
      const { batch } = ledger.appendBatch('HAND_SETTLEMENT', [
        {
          source: 'HAND_SETTLEMENT',
          affectedParty: createPlayerParty(createTestPlayer(1)),
          delta: 100,
          stateVersion: createStateVersion(1),
          description: 'Win',
        },
        {
          source: 'HAND_SETTLEMENT',
          affectedParty: createClubParty(TEST_CLUB_ID),
          delta: -50,  // Unbalanced! Should be -100
          stateVersion: createStateVersion(1),
          description: 'Partial',
        },
      ]);

      const violation = checker.checkBatchConservation(batch.batchId);

      expect(violation).toBeDefined();
      expect(violation!.invariant).toBe('SYSTEM_CONSERVATION');
      expect((violation!.context as any).actualSum).toBe(50);
    });

    it('should check hand conservation (informational for attribution)', () => {
      recorder.recordSettlement(createBalancedSettlement());

      // NOTE: Hand settlement is ATTRIBUTION-ONLY (records where value goes, not where it comes from)
      // So checkHandConservation will show a "violation" but this is expected behavior
      // The checkSystemConservation method skips HAND_SETTLEMENT batches for this reason
      const violation = checker.checkHandConservation(TEST_HAND_ID);

      // Attribution-only batches won't balance - this is informational, not a real violation
      expect(violation).toBeDefined();
      expect(violation!.invariant).toBe('SYSTEM_CONSERVATION');
      expect((violation!.context as any).sourceType).toBe('HAND');
    });
  });

  describe('I3: DETERMINISTIC_REPLAY', () => {
    it('should pass for sequential entries', () => {
      recorder.recordSettlement(createBalancedSettlement());

      const result = checker.checkInvariant('DETERMINISTIC_REPLAY');

      expect(result.passed).toBe(true);
    });

    it('should compare entries for determinism', () => {
      const entries1 = ledger.getAllEntries();
      const entries2 = ledger.getAllEntries();

      const result = checker.compareForDeterminism(entries1, entries2);

      expect(result.passed).toBe(true);
    });

    it('should detect differing entry counts', () => {
      recorder.recordSettlement(createBalancedSettlement());
      const entries1 = [...ledger.getAllEntries()];
      const entries2 = entries1.slice(0, 1);

      const result = checker.compareForDeterminism(entries1, entries2);

      expect(result.passed).toBe(false);
      expect(result.violation!.context).toHaveProperty('differingFields');
    });
  });

  describe('I4: APPEND_ONLY_INTEGRITY', () => {
    it('should pass for valid hash chain', () => {
      recorder.recordSettlement(createBalancedSettlement());

      const result = checker.checkInvariant('APPEND_ONLY_INTEGRITY');

      expect(result.passed).toBe(true);
    });

    it('should verify individual entry integrity', () => {
      recorder.recordSettlement(createBalancedSettlement());
      const entries = ledger.getAllEntries();

      for (const entry of entries) {
        const result = checker.checkEntryIntegrity(entry.entryId);
        expect(result.passed).toBe(true);
      }
    });

    it('should detect non-existent entry', () => {
      const result = checker.checkEntryIntegrity('non_existent');

      expect(result.passed).toBe(false);
    });
  });

  describe('I5: ATTRIBUTION_IMMUTABILITY', () => {
    it('should pass for untampered entries', () => {
      recorder.recordSettlement(createBalancedSettlement());

      const result = checker.checkInvariant('ATTRIBUTION_IMMUTABILITY');

      expect(result.passed).toBe(true);
    });
  });

  describe('Full Check', () => {
    it('should check all invariants', () => {
      recorder.recordSettlement(createBalancedSettlement());

      const result = checker.checkAll();

      expect(result.allPassed).toBe(true);
      expect(result.violations.length).toBe(0);
      expect(result.totalChecks).toBe(5);
      expect(result.passedChecks).toBe(5);
    });

    it('should collect all violations', () => {
      // Create invalid state
      ledger.appendEntry({
        source: 'ADJUSTMENT',
        affectedParty: createPlayerParty(createTestPlayer(1)),
        delta: -100,
        stateVersion: createStateVersion(1),
        description: 'Negative',
      });

      const result = checker.checkAll();

      expect(result.allPassed).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
    });

    it('should fail fast when configured', () => {
      const strictChecker = createInvariantChecker(ledger, STRICT_INVARIANT_CONFIG);

      ledger.appendEntry({
        source: 'ADJUSTMENT',
        affectedParty: createPlayerParty(createTestPlayer(1)),
        delta: -100,
        stateVersion: createStateVersion(1),
        description: 'Negative',
      });

      const result = strictChecker.checkAll();

      expect(result.allPassed).toBe(false);
      // Fail fast should stop after first failure
      expect(result.failedChecks).toBe(1);
    });
  });
});

// ============================================================================
// Violation Helper Tests
// ============================================================================

describe('Violation Helpers', () => {
  beforeEach(() => {
    resetViolationCounter();
  });

  it('should identify critical violations', () => {
    const criticalViolation: InvariantViolation = {
      invariant: 'SYSTEM_CONSERVATION',
      severity: 'CRITICAL',
      message: 'Test',
      context: {} as any,
      sourceRef: { type: 'HAND' },
      detectedAt: Date.now(),
      violationId: 'test',
    };

    expect(isCriticalViolation(criticalViolation)).toBe(true);
  });

  it('should filter violations by invariant', () => {
    const violations: InvariantViolation[] = [
      {
        invariant: 'NON_NEGATIVE_BALANCE',
        severity: 'ERROR',
        message: 'Test 1',
        context: {} as any,
        sourceRef: { type: 'PLAYER' },
        detectedAt: Date.now(),
        violationId: 'v1',
      },
      {
        invariant: 'SYSTEM_CONSERVATION',
        severity: 'CRITICAL',
        message: 'Test 2',
        context: {} as any,
        sourceRef: { type: 'HAND' },
        detectedAt: Date.now(),
        violationId: 'v2',
      },
    ];

    const filtered = filterViolationsByInvariant(violations, 'NON_NEGATIVE_BALANCE');

    expect(filtered.length).toBe(1);
    expect(filtered[0].invariant).toBe('NON_NEGATIVE_BALANCE');
  });
});

// ============================================================================
// External Value Boundary Tests
// ============================================================================

describe('ExternalValueBoundary', () => {
  let boundary: ExternalValueBoundary;

  beforeEach(() => {
    boundary = createExternalValueBoundary(true);
  });

  describe('Entry Validation', () => {
    it('should pass valid entry input', () => {
      const input: LedgerEntryInput = {
        source: 'HAND_SETTLEMENT',
        category: 'POT_WIN',
        affectedParty: createPlayerParty(createTestPlayer(1)),
        delta: 100,
        stateVersion: createStateVersion(1),
        description: 'Pot win',
      };

      const result = boundary.validateEntryInput(input);

      expect(result.isValid).toBe(true);
      expect(result.violations.length).toBe(0);
    });

    it('should reject non-integer delta', () => {
      const input: LedgerEntryInput = {
        source: 'HAND_SETTLEMENT',
        affectedParty: createPlayerParty(createTestPlayer(1)),
        delta: 100.5,
        stateVersion: createStateVersion(1),
        description: 'Invalid',
      };

      const result = boundary.validateEntryInput(input);

      expect(result.isValid).toBe(false);
      expect(result.violations.some(v => v.type === 'NON_INTEGER_VALUE')).toBe(true);
    });

    it('should reject forbidden concepts in description', () => {
      const input: LedgerEntryInput = {
        source: 'HAND_SETTLEMENT',
        affectedParty: createPlayerParty(createTestPlayer(1)),
        delta: 100,
        stateVersion: createStateVersion(1),
        description: 'Payment from wallet',  // Contains forbidden keywords
      };

      const result = boundary.validateEntryInput(input);

      expect(result.isValid).toBe(false);
      expect(result.violations.some(v => v.type === 'FORBIDDEN_CONCEPT')).toBe(true);
    });

    it('should reject forbidden metadata fields', () => {
      const input: LedgerEntryInput = {
        source: 'HAND_SETTLEMENT',
        affectedParty: createPlayerParty(createTestPlayer(1)),
        delta: 100,
        stateVersion: createStateVersion(1),
        description: 'Test',
        metadata: {
          paymentId: 'pay_123',  // Forbidden field
        },
      };

      const result = boundary.validateEntryInput(input);

      expect(result.isValid).toBe(false);
      expect(result.violations.some(v => v.field?.includes('paymentId'))).toBe(true);
    });
  });

  describe('Settlement Validation', () => {
    it('should pass valid settlement', () => {
      const result = boundary.validateSettlementAttribution(createBalancedSettlement());

      expect(result.isValid).toBe(true);
    });

    it('should reject negative pot win', () => {
      const settlement: SettlementAttribution = {
        handId: TEST_HAND_ID,
        tableId: TEST_TABLE_ID,
        clubId: TEST_CLUB_ID,
        stateVersion: createStateVersion(1),
        potWinners: [
          { playerId: createTestPlayer(1), amount: -100, potType: 'main' },
        ],
        rakeTotal: 0,
      };

      const result = boundary.validateSettlementAttribution(settlement);

      expect(result.isValid).toBe(false);
    });

    it('should reject non-integer amounts', () => {
      const settlement: SettlementAttribution = {
        handId: TEST_HAND_ID,
        tableId: TEST_TABLE_ID,
        clubId: TEST_CLUB_ID,
        stateVersion: createStateVersion(1),
        potWinners: [
          { playerId: createTestPlayer(1), amount: 100.5, potType: 'main' },
        ],
        rakeTotal: 0,
      };

      const result = boundary.validateSettlementAttribution(settlement);

      expect(result.isValid).toBe(false);
    });

    it('should detect rake breakdown mismatch', () => {
      const settlement: SettlementAttribution = {
        handId: TEST_HAND_ID,
        tableId: TEST_TABLE_ID,
        clubId: TEST_CLUB_ID,
        stateVersion: createStateVersion(1),
        potWinners: [
          { playerId: createTestPlayer(1), amount: 90, potType: 'main' },
        ],
        rakeTotal: 10,
        rakeBreakdown: {
          clubShare: 5,
          platformShare: 2,
          // Sum is 7, but rakeTotal is 10
        },
      };

      const result = boundary.validateSettlementAttribution(settlement);

      expect(result.isValid).toBe(false);
    });
  });

  describe('Time Fee Validation', () => {
    it('should pass valid time fee', () => {
      const timeFee: TimeFeeAttribution = {
        tableId: TEST_TABLE_ID,
        clubId: TEST_CLUB_ID,
        stateVersion: createStateVersion(1),
        playerId: createTestPlayer(1),
        feeAmount: 50,
        periodMinutes: 30,
      };

      const result = boundary.validateTimeFeeAttribution(timeFee);

      expect(result.isValid).toBe(true);
    });

    it('should reject negative fee', () => {
      const timeFee: TimeFeeAttribution = {
        tableId: TEST_TABLE_ID,
        clubId: TEST_CLUB_ID,
        stateVersion: createStateVersion(1),
        playerId: createTestPlayer(1),
        feeAmount: -50,
        periodMinutes: 30,
      };

      const result = boundary.validateTimeFeeAttribution(timeFee);

      expect(result.isValid).toBe(false);
    });

    it('should reject zero or negative period', () => {
      const timeFee: TimeFeeAttribution = {
        tableId: TEST_TABLE_ID,
        clubId: TEST_CLUB_ID,
        stateVersion: createStateVersion(1),
        playerId: createTestPlayer(1),
        feeAmount: 50,
        periodMinutes: 0,
      };

      const result = boundary.validateTimeFeeAttribution(timeFee);

      expect(result.isValid).toBe(false);
    });
  });

  describe('Batch Validation', () => {
    it('should validate batch of entries', () => {
      const inputs: LedgerEntryInput[] = [
        {
          source: 'HAND_SETTLEMENT',
          affectedParty: createPlayerParty(createTestPlayer(1)),
          delta: 100,
          stateVersion: createStateVersion(1),
          description: 'Entry 1',
        },
        {
          source: 'HAND_SETTLEMENT',
          affectedParty: createClubParty(TEST_CLUB_ID),
          delta: 10,
          stateVersion: createStateVersion(1),
          description: 'Entry 2',
        },
      ];

      const result = boundary.validateBatch(inputs);

      expect(result.isValid).toBe(true);
    });

    it('should report all violations in batch', () => {
      const inputs: LedgerEntryInput[] = [
        {
          source: 'HAND_SETTLEMENT',
          affectedParty: createPlayerParty(createTestPlayer(1)),
          delta: 100.5,  // Invalid
          stateVersion: createStateVersion(1),
          description: 'Entry 1',
        },
        {
          source: 'HAND_SETTLEMENT',
          affectedParty: createClubParty(TEST_CLUB_ID),
          delta: 10.5,  // Invalid
          stateVersion: createStateVersion(1),
          description: 'Entry 2',
        },
      ];

      const result = boundary.validateBatch(inputs);

      expect(result.isValid).toBe(false);
      expect(result.violations.length).toBe(2);
    });
  });

  describe('Output Sanitization', () => {
    it('should sanitize data for export', () => {
      const data = {
        id: 'test',
        value: 100,
        _internal: 'should be removed',
        nested: {
          _debug: 'should be removed',
          keep: 'this',
        },
      };

      const sanitized = boundary.sanitizeForExport(data);

      expect(sanitized.id).toBe('test');
      expect(sanitized.value).toBe(100);
      expect(sanitized._internal).toBeUndefined();
      expect(sanitized.nested._debug).toBeUndefined();
      expect(sanitized.nested.keep).toBe('this');
    });
  });

  describe('Non-Strict Mode', () => {
    it('should allow forbidden keywords in non-strict mode', () => {
      const relaxedBoundary = createExternalValueBoundary(false);

      const input: LedgerEntryInput = {
        source: 'HAND_SETTLEMENT',
        affectedParty: createPlayerParty(createTestPlayer(1)),
        delta: 100,
        stateVersion: createStateVersion(1),
        description: 'Payment test',  // Would fail in strict mode
      };

      const result = relaxedBoundary.validateEntryInput(input);

      expect(result.isValid).toBe(true);
    });
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('Invariants Integration', () => {
  let ledger: ValueLedger;
  let recorder: LedgerRecorder;
  let checker: InvariantChecker;
  let boundary: ExternalValueBoundary;

  beforeEach(() => {
    resetLedgerCounters();
    resetViolationCounter();
    ledger = createValueLedger();
    recorder = createLedgerRecorder(ledger);
    checker = createInvariantChecker(ledger);
    boundary = createExternalValueBoundary();
  });

  afterEach(() => {
    recorder.clear();
  });

  it('should maintain all invariants after valid settlement', () => {
    // Validate at boundary
    const settlement = createBalancedSettlement();
    const boundaryResult = boundary.validateSettlementAttribution(settlement);
    expect(boundaryResult.isValid).toBe(true);

    // Record settlement
    const recordResult = recorder.recordSettlement(settlement);
    expect(recordResult.success).toBe(true);

    // Check all invariants
    const invariantResult = checker.checkAll();
    expect(invariantResult.allPassed).toBe(true);
  });

  it('should detect invariant violations from invalid operations', () => {
    // Bypass boundary and record invalid entry
    ledger.appendEntry({
      source: 'ADJUSTMENT',
      affectedParty: createPlayerParty(createTestPlayer(1)),
      delta: -1000,  // Creates negative balance
      stateVersion: createStateVersion(1),
      description: 'Invalid debit',
    });

    // Check invariants
    const result = checker.checkAll();

    expect(result.allPassed).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
  });

  it('should maintain integrity across multiple settlements', () => {
    // Record multiple settlements
    for (let i = 0; i < 5; i++) {
      const settlement: SettlementAttribution = {
        handId: `hand_${i}` as HandId,
        tableId: TEST_TABLE_ID,
        clubId: TEST_CLUB_ID,
        stateVersion: createStateVersion(i + 1),
        potWinners: [
          { playerId: createTestPlayer(i % 3), amount: 90, potType: 'main' },
        ],
        rakeTotal: 10,
        rakeBreakdown: {
          clubShare: 7,
          platformShare: 3,
        },
      };

      const boundaryResult = boundary.validateSettlementAttribution(settlement);
      expect(boundaryResult.isValid).toBe(true);

      recorder.recordSettlement(settlement);
    }

    // Verify all invariants
    const result = checker.checkAll();
    expect(result.allPassed).toBe(true);
    expect(result.totalChecks).toBe(5);
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('Edge Cases', () => {
  let ledger: ValueLedger;
  let checker: InvariantChecker;
  let boundary: ExternalValueBoundary;

  beforeEach(() => {
    resetLedgerCounters();
    ledger = createValueLedger();
    checker = createInvariantChecker(ledger);
    boundary = createExternalValueBoundary();
  });

  it('should handle empty ledger', () => {
    const result = checker.checkAll();

    expect(result.allPassed).toBe(true);
  });

  it('should handle zero-delta entries', () => {
    ledger.appendEntry({
      source: 'ADJUSTMENT',
      affectedParty: createPlayerParty(createTestPlayer(1)),
      delta: 0,
      stateVersion: createStateVersion(1),
      description: 'No-op',
    });

    const result = checker.checkAll();

    expect(result.allPassed).toBe(true);
  });

  it('should handle very large deltas', () => {
    const largeAmount = 999999999;

    ledger.appendEntry({
      source: 'HAND_SETTLEMENT',
      affectedParty: createPlayerParty(createTestPlayer(1)),
      delta: largeAmount,
      stateVersion: createStateVersion(1),
      description: 'Large win',
    });

    const result = checker.checkInvariant('NON_NEGATIVE_BALANCE');

    expect(result.passed).toBe(true);
  });

  it('should validate crypto-related keywords are blocked', () => {
    const cryptoKeywords = ['usdt', 'bitcoin', 'blockchain', 'wallet'];

    for (const keyword of cryptoKeywords) {
      const input: LedgerEntryInput = {
        source: 'ADJUSTMENT',
        affectedParty: createPlayerParty(createTestPlayer(1)),
        delta: 100,
        stateVersion: createStateVersion(1),
        description: `Contains ${keyword} keyword`,
      };

      const result = boundary.validateEntryInput(input);

      expect(result.isValid).toBe(false);
      expect(result.violations.some(v => v.type === 'FORBIDDEN_CONCEPT')).toBe(true);
    }
  });
});
