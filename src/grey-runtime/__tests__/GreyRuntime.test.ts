/**
 * GreyRuntime.test.ts
 * Phase A - Grey Flow Settlement Runtime Tests
 *
 * Comprehensive tests for the grey flow runtime.
 * Tests verify:
 * - Append-only behavior
 * - Idempotency
 * - Determinism
 * - Engine untouched
 * - Same input = same output
 * - No negative or fractional values
 * - Grey flows ≠ balances
 */

import {
  // Types
  GreySessionId,
  GreyFlowId,
  GreyPartyId,
  GreyPartyType,
  GreyFlowType,
  GreyFlowStatus,
  GreyFlowDirection,
  GreyTimeGranularity,
  GreyErrorCode,
  GREY_RUNTIME_VERSION,
  FORBIDDEN_CONCEPTS,

  // ID factories
  createGreySessionId,
  createGreyFlowId,
  createGreyPartyId,
  createGreyParty,
  createGreyTimeWindow,

  // Flow records
  GreyFlowRecordInput,
  createGreyFlowRecord,
  calculateGreyChecksum,
  verifyFlowRecordChecksum,
  verifyChainIntegrity,
  GENESIS_HASH,

  // Registry
  GreyFlowRegistry,
  createGreyFlowRegistry,
  resetGreyFlowRegistry,

  // Views
  getPlatformFlowSummary,
  getClubFlowSummary,
  getAgentFlowSummary,
  getPlayerNetFlowSummary,
  getTimeBucketedFlowSummary,
  getGlobalFlowSummary,

  // Boundary guards
  findForbiddenConcepts,
  assertNoForbiddenConcepts,
  assertInteger,
  assertNonNegativeInteger,
  assertNotFloat,
  BALANCE_CONCEPT_BLOCKED,
  ENGINE_MUTATION_BLOCKED,
} from '../index';

// ============================================================================
// TEST HELPERS
// ============================================================================

const TEST_SESSION_ID = createGreySessionId('test-session-1');
const TEST_TIMESTAMP = 1704067200000; // 2024-01-01 00:00:00 UTC

function createTestParty(
  id: string,
  type: GreyPartyType
): ReturnType<typeof createGreyParty> {
  return createGreyParty(createGreyPartyId(id), type);
}

function createTestFlowInput(
  flowId: string,
  type: GreyFlowType,
  party: ReturnType<typeof createGreyParty>,
  amount: number,
  direction: GreyFlowDirection
): GreyFlowRecordInput {
  return {
    flowId: createGreyFlowId(flowId),
    sessionId: TEST_SESSION_ID,
    party,
    type,
    amount,
    direction,
    injectedTimestamp: TEST_TIMESTAMP,
  };
}

// ============================================================================
// APPEND-ONLY BEHAVIOR TESTS
// ============================================================================

describe('Append-Only Behavior', () => {
  let registry: GreyFlowRegistry;

  beforeEach(() => {
    registry = createGreyFlowRegistry();
  });

  test('records can only be added, never removed', () => {
    const party = createTestParty('player-1', GreyPartyType.PLAYER);
    const input = createTestFlowInput(
      'flow-1',
      GreyFlowType.BUYIN_REF,
      party,
      1000,
      GreyFlowDirection.IN
    );

    const result = registry.appendFlow(input);
    expect(result.success).toBe(true);
    expect(registry.getRecordCount()).toBe(1);

    // Registry has no delete method
    expect((registry as unknown as { deleteFlow: unknown }).deleteFlow).toBeUndefined();
    expect((registry as unknown as { removeFlow: unknown }).removeFlow).toBeUndefined();
    expect((registry as unknown as { clearFlows: unknown }).clearFlows).toBeUndefined();
  });

  test('records cannot be modified after creation', () => {
    const party = createTestParty('player-1', GreyPartyType.PLAYER);
    const input = createTestFlowInput(
      'flow-1',
      GreyFlowType.BUYIN_REF,
      party,
      1000,
      GreyFlowDirection.IN
    );

    const result = registry.appendFlow(input);
    expect(result.success).toBe(true);

    if (result.success) {
      const record = result.value.record;

      // Record should be frozen
      expect(Object.isFrozen(record)).toBe(true);

      // Attempting to modify should fail
      expect(() => {
        (record as { amount: number }).amount = 9999;
      }).toThrow();
    }
  });

  test('session records array grows monotonically', () => {
    const party = createTestParty('player-1', GreyPartyType.PLAYER);

    for (let i = 1; i <= 5; i++) {
      const input = createTestFlowInput(
        `flow-${i}`,
        GreyFlowType.BUYIN_REF,
        party,
        1000 * i,
        GreyFlowDirection.IN
      );
      registry.appendFlow(input);
    }

    const session = registry.getSession(TEST_SESSION_ID);
    expect(session).toBeDefined();
    expect(session!.records.length).toBe(5);

    // Each record has increasing sequence
    for (let i = 0; i < session!.records.length; i++) {
      expect(session!.records[i].sequence).toBe(i);
    }
  });
});

// ============================================================================
// IDEMPOTENCY TESTS
// ============================================================================

describe('Idempotency', () => {
  let registry: GreyFlowRegistry;

  beforeEach(() => {
    registry = createGreyFlowRegistry();
  });

  test('duplicate flow IDs are rejected', () => {
    const party = createTestParty('player-1', GreyPartyType.PLAYER);
    const input = createTestFlowInput(
      'flow-duplicate',
      GreyFlowType.BUYIN_REF,
      party,
      1000,
      GreyFlowDirection.IN
    );

    // First append succeeds
    const result1 = registry.appendFlow(input);
    expect(result1.success).toBe(true);

    // Second append with same ID fails
    const result2 = registry.appendFlow(input);
    expect(result2.success).toBe(false);
    if (!result2.success) {
      expect(result2.error.code).toBe(GreyErrorCode.DUPLICATE_FLOW_ID);
    }

    // Only one record exists
    expect(registry.getRecordCount()).toBe(1);
  });

  test('hasFlow returns true for existing flow', () => {
    const party = createTestParty('player-1', GreyPartyType.PLAYER);
    const flowId = createGreyFlowId('flow-exists');
    const input: GreyFlowRecordInput = {
      flowId,
      sessionId: TEST_SESSION_ID,
      party,
      type: GreyFlowType.BUYIN_REF,
      amount: 1000,
      direction: GreyFlowDirection.IN,
      injectedTimestamp: TEST_TIMESTAMP,
    };

    expect(registry.hasFlow(flowId)).toBe(false);

    registry.appendFlow(input);

    expect(registry.hasFlow(flowId)).toBe(true);
  });

  test('confirming same flow twice fails', () => {
    const party = createTestParty('player-1', GreyPartyType.PLAYER);
    const flowId = createGreyFlowId('flow-confirm-once');
    const input: GreyFlowRecordInput = {
      flowId,
      sessionId: TEST_SESSION_ID,
      party,
      type: GreyFlowType.BUYIN_REF,
      amount: 1000,
      direction: GreyFlowDirection.IN,
      injectedTimestamp: TEST_TIMESTAMP,
    };

    registry.appendFlow(input);

    // First confirm succeeds
    const result1 = registry.confirmFlow(flowId);
    expect(result1.success).toBe(true);

    // Second confirm fails (already CONFIRMED)
    const result2 = registry.confirmFlow(flowId);
    expect(result2.success).toBe(false);
    if (!result2.success) {
      expect(result2.error.code).toBe(GreyErrorCode.INVALID_STATUS_TRANSITION);
    }
  });
});

// ============================================================================
// DETERMINISM TESTS
// ============================================================================

describe('Determinism', () => {
  test('same inputs produce same checksum', () => {
    const data1 = { a: 1, b: 2, c: 'test' };
    const data2 = { a: 1, b: 2, c: 'test' };
    const data3 = { c: 'test', a: 1, b: 2 }; // Different order

    const checksum1 = calculateGreyChecksum(data1);
    const checksum2 = calculateGreyChecksum(data2);
    const checksum3 = calculateGreyChecksum(data3);

    expect(checksum1).toBe(checksum2);
    expect(checksum2).toBe(checksum3);
  });

  test('same flow inputs produce same record checksum', () => {
    const party = createTestParty('player-1', GreyPartyType.PLAYER);
    const input1 = createTestFlowInput(
      'flow-det-1',
      GreyFlowType.BUYIN_REF,
      party,
      1000,
      GreyFlowDirection.IN
    );
    const input2 = createTestFlowInput(
      'flow-det-1',
      GreyFlowType.BUYIN_REF,
      party,
      1000,
      GreyFlowDirection.IN
    );

    const result1 = createGreyFlowRecord(input1, 0, GENESIS_HASH);
    const result2 = createGreyFlowRecord(input2, 0, GENESIS_HASH);

    expect(result1.success).toBe(true);
    expect(result2.success).toBe(true);

    if (result1.success && result2.success) {
      expect(result1.value.checksum).toBe(result2.value.checksum);
    }
  });

  test('different inputs produce different checksums', () => {
    const data1 = { a: 1, b: 2 };
    const data2 = { a: 1, b: 3 };

    const checksum1 = calculateGreyChecksum(data1);
    const checksum2 = calculateGreyChecksum(data2);

    expect(checksum1).not.toBe(checksum2);
  });

  test('view summaries are deterministic', () => {
    const registry1 = createGreyFlowRegistry();
    const registry2 = createGreyFlowRegistry();

    const platformParty = createTestParty('platform', GreyPartyType.PLATFORM);
    const input1 = createTestFlowInput(
      'rake-1',
      GreyFlowType.RAKE_REF,
      platformParty,
      100,
      GreyFlowDirection.IN
    );
    const input2 = createTestFlowInput(
      'rake-2',
      GreyFlowType.RAKE_REF,
      platformParty,
      200,
      GreyFlowDirection.IN
    );

    // Add same flows to both registries
    registry1.appendFlow(input1);
    registry1.appendFlow(input2);
    registry2.appendFlow(input1);
    registry2.appendFlow(input2);

    const summary1 = getPlatformFlowSummary(registry1);
    const summary2 = getPlatformFlowSummary(registry2);

    expect(summary1.totalRakeIn).toBe(summary2.totalRakeIn);
    expect(summary1.netFlow).toBe(summary2.netFlow);
    expect(summary1.recordCount).toBe(summary2.recordCount);
  });
});

// ============================================================================
// ENGINE UNTOUCHED TESTS
// ============================================================================

describe('Engine Untouched', () => {
  test('grey runtime does not import engine internals', () => {
    // The grey runtime should only use its own types
    // This is a documentation test - the actual enforcement is in the code structure
    expect(GREY_RUNTIME_VERSION).toBe('1.0.0');
    expect(ENGINE_MUTATION_BLOCKED.message).toContain('FROZEN');
  });

  test('grey registry has no engine references', () => {
    const registry = createGreyFlowRegistry();

    // Registry should not have any engine-related methods
    expect((registry as unknown as { engine: unknown }).engine).toBeUndefined();
    expect((registry as unknown as { ledger: unknown }).ledger).toBeUndefined();
    expect((registry as unknown as { economyEngine: unknown }).economyEngine).toBeUndefined();
    expect((registry as unknown as { mutateEngine: unknown }).mutateEngine).toBeUndefined();
  });

  test('flow records do not contain engine state', () => {
    const registry = createGreyFlowRegistry();
    const party = createTestParty('player-1', GreyPartyType.PLAYER);
    const input = createTestFlowInput(
      'flow-no-engine',
      GreyFlowType.BUYIN_REF,
      party,
      1000,
      GreyFlowDirection.IN
    );

    const result = registry.appendFlow(input);
    expect(result.success).toBe(true);

    if (result.success) {
      const record = result.value.record;

      // Record should not contain engine state
      expect((record as unknown as { engineState: unknown }).engineState).toBeUndefined();
      expect((record as unknown as { ledgerEntry: unknown }).ledgerEntry).toBeUndefined();

      // linkedLedgerEntryId is a reference only, not actual state
      expect(record.linkedLedgerEntryId).toBeUndefined();
    }
  });
});

// ============================================================================
// NO NEGATIVE VALUES TESTS
// ============================================================================

describe('No Negative Values', () => {
  let registry: GreyFlowRegistry;

  beforeEach(() => {
    registry = createGreyFlowRegistry();
  });

  test('negative amounts are rejected', () => {
    const party = createTestParty('player-1', GreyPartyType.PLAYER);
    const input: GreyFlowRecordInput = {
      flowId: createGreyFlowId('flow-negative'),
      sessionId: TEST_SESSION_ID,
      party,
      type: GreyFlowType.BUYIN_REF,
      amount: -100,
      direction: GreyFlowDirection.IN,
      injectedTimestamp: TEST_TIMESTAMP,
    };

    const result = registry.appendFlow(input);
    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.error.code).toBe(GreyErrorCode.NEGATIVE_AMOUNT);
    }
  });

  test('assertNonNegativeInteger rejects negative', () => {
    const result = assertNonNegativeInteger(-5, 'testField');
    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.error.code).toBe(GreyErrorCode.NEGATIVE_AMOUNT);
    }
  });

  test('zero amount is allowed', () => {
    const party = createTestParty('player-1', GreyPartyType.PLAYER);
    const input: GreyFlowRecordInput = {
      flowId: createGreyFlowId('flow-zero'),
      sessionId: TEST_SESSION_ID,
      party,
      type: GreyFlowType.ADJUST_REF,
      amount: 0,
      direction: GreyFlowDirection.IN,
      injectedTimestamp: TEST_TIMESTAMP,
    };

    const result = registry.appendFlow(input);
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// NO FRACTIONAL VALUES TESTS
// ============================================================================

describe('No Fractional Values', () => {
  let registry: GreyFlowRegistry;

  beforeEach(() => {
    registry = createGreyFlowRegistry();
  });

  test('decimal amounts are rejected', () => {
    const party = createTestParty('player-1', GreyPartyType.PLAYER);
    const input: GreyFlowRecordInput = {
      flowId: createGreyFlowId('flow-decimal'),
      sessionId: TEST_SESSION_ID,
      party,
      type: GreyFlowType.BUYIN_REF,
      amount: 100.5,
      direction: GreyFlowDirection.IN,
      injectedTimestamp: TEST_TIMESTAMP,
    };

    const result = registry.appendFlow(input);
    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.error.code).toBe(GreyErrorCode.NON_INTEGER_AMOUNT);
    }
  });

  test('assertInteger rejects floats', () => {
    const result = assertInteger(10.5, 'testField');
    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.error.code).toBe(GreyErrorCode.NON_INTEGER_AMOUNT);
    }
  });

  test('assertNotFloat rejects floats', () => {
    const result = assertNotFloat(3.14159, 'pi');
    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.error.code).toBe(GreyErrorCode.NON_INTEGER_AMOUNT);
    }
  });

  test('integer amounts are accepted', () => {
    const party = createTestParty('player-1', GreyPartyType.PLAYER);
    const input: GreyFlowRecordInput = {
      flowId: createGreyFlowId('flow-integer'),
      sessionId: TEST_SESSION_ID,
      party,
      type: GreyFlowType.BUYIN_REF,
      amount: 100,
      direction: GreyFlowDirection.IN,
      injectedTimestamp: TEST_TIMESTAMP,
    };

    const result = registry.appendFlow(input);
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// GREY FLOWS ≠ BALANCES TESTS
// ============================================================================

describe('Grey Flows Are Not Balances', () => {
  test('BALANCE_CONCEPT_BLOCKED is defined', () => {
    expect(BALANCE_CONCEPT_BLOCKED.message).toContain('NOT track balances');
    expect(BALANCE_CONCEPT_BLOCKED.blockedOperations).toContain('getBalance');
  });

  test('registry has no balance methods', () => {
    const registry = createGreyFlowRegistry();

    expect((registry as unknown as { getBalance: unknown }).getBalance).toBeUndefined();
    expect((registry as unknown as { setBalance: unknown }).setBalance).toBeUndefined();
    expect((registry as unknown as { updateBalance: unknown }).updateBalance).toBeUndefined();
  });

  test('player summary returns netFlowReference not balance', () => {
    const registry = createGreyFlowRegistry();
    const playerParty = createTestParty('player-1', GreyPartyType.PLAYER);

    // Add buyin
    registry.appendFlow({
      flowId: createGreyFlowId('buyin-1'),
      sessionId: TEST_SESSION_ID,
      party: playerParty,
      type: GreyFlowType.BUYIN_REF,
      amount: 1000,
      direction: GreyFlowDirection.IN,
      injectedTimestamp: TEST_TIMESTAMP,
    });

    // Add cashout
    registry.appendFlow({
      flowId: createGreyFlowId('cashout-1'),
      sessionId: TEST_SESSION_ID,
      party: playerParty,
      type: GreyFlowType.CASHOUT_REF,
      amount: 500,
      direction: GreyFlowDirection.OUT,
      injectedTimestamp: TEST_TIMESTAMP,
    });

    const summary = getPlayerNetFlowSummary(registry, playerParty.partyId);

    // Should have netFlowReference, NOT balance
    expect(summary.netFlowReference).toBe(500); // 1000 IN - 500 OUT
    expect((summary as unknown as { balance: unknown }).balance).toBeUndefined();
  });

  test('views do not expose balance concepts', () => {
    const registry = createGreyFlowRegistry();
    const globalSummary = getGlobalFlowSummary(registry);

    // Should have netFlow, NOT balance
    expect(globalSummary.netFlow).toBeDefined();
    expect((globalSummary as unknown as { balance: unknown }).balance).toBeUndefined();
    expect((globalSummary as unknown as { totalBalance: unknown }).totalBalance).toBeUndefined();
  });
});

// ============================================================================
// FORBIDDEN CONCEPTS TESTS
// ============================================================================

describe('Forbidden Concepts', () => {
  test('FORBIDDEN_CONCEPTS is defined', () => {
    expect(FORBIDDEN_CONCEPTS.length).toBeGreaterThan(0);
    expect(FORBIDDEN_CONCEPTS).toContain('payment');
    expect(FORBIDDEN_CONCEPTS).toContain('wallet');
    expect(FORBIDDEN_CONCEPTS).toContain('crypto');
  });

  test('findForbiddenConcepts detects forbidden terms', () => {
    const text1 = 'This is a payment transaction';
    const text2 = 'User wallet balance';
    const text3 = 'Crypto blockchain transfer';

    expect(findForbiddenConcepts(text1)).toContain('payment');
    expect(findForbiddenConcepts(text2)).toContain('wallet');
    expect(findForbiddenConcepts(text2)).toContain('balance');
    expect(findForbiddenConcepts(text3)).toContain('crypto');
    expect(findForbiddenConcepts(text3)).toContain('blockchain');
    expect(findForbiddenConcepts(text3)).toContain('transfer');
  });

  test('assertNoForbiddenConcepts rejects forbidden text', () => {
    const result = assertNoForbiddenConcepts('Payment processing', 'description');
    expect(result.success).toBe(false);
  });

  test('clean text passes forbidden check', () => {
    const result = assertNoForbiddenConcepts('Rake attribution for hand 123', 'description');
    expect(result.success).toBe(true);
  });

  test('flow with forbidden description is rejected', () => {
    const registry = createGreyFlowRegistry();
    const party = createTestParty('player-1', GreyPartyType.PLAYER);

    const result = registry.appendFlow({
      flowId: createGreyFlowId('flow-forbidden'),
      sessionId: TEST_SESSION_ID,
      party,
      type: GreyFlowType.BUYIN_REF,
      amount: 1000,
      direction: GreyFlowDirection.IN,
      injectedTimestamp: TEST_TIMESTAMP,
      description: 'Payment from wallet',
    });

    expect(result.success).toBe(false);
  });
});

// ============================================================================
// FLOW TYPE VALIDATION TESTS
// ============================================================================

describe('Flow Type Validation', () => {
  let registry: GreyFlowRegistry;

  beforeEach(() => {
    registry = createGreyFlowRegistry();
  });

  test('BUYIN_REF must have direction IN', () => {
    const party = createTestParty('player-1', GreyPartyType.PLAYER);

    const result = registry.appendFlow({
      flowId: createGreyFlowId('buyin-wrong-dir'),
      sessionId: TEST_SESSION_ID,
      party,
      type: GreyFlowType.BUYIN_REF,
      amount: 1000,
      direction: GreyFlowDirection.OUT, // Wrong
      injectedTimestamp: TEST_TIMESTAMP,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe(GreyErrorCode.INVALID_DIRECTION);
    }
  });

  test('CASHOUT_REF must have direction OUT', () => {
    const party = createTestParty('player-1', GreyPartyType.PLAYER);

    const result = registry.appendFlow({
      flowId: createGreyFlowId('cashout-wrong-dir'),
      sessionId: TEST_SESSION_ID,
      party,
      type: GreyFlowType.CASHOUT_REF,
      amount: 1000,
      direction: GreyFlowDirection.IN, // Wrong
      injectedTimestamp: TEST_TIMESTAMP,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe(GreyErrorCode.INVALID_DIRECTION);
    }
  });

  test('RAKE_REF cannot go to PLAYER', () => {
    const playerParty = createTestParty('player-1', GreyPartyType.PLAYER);

    const result = registry.appendFlow({
      flowId: createGreyFlowId('rake-to-player'),
      sessionId: TEST_SESSION_ID,
      party: playerParty,
      type: GreyFlowType.RAKE_REF,
      amount: 100,
      direction: GreyFlowDirection.IN,
      injectedTimestamp: TEST_TIMESTAMP,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe(GreyErrorCode.INVALID_PARTY_TYPE);
    }
  });

  test('RAKE_REF can go to PLATFORM', () => {
    const platformParty = createTestParty('platform', GreyPartyType.PLATFORM);

    const result = registry.appendFlow({
      flowId: createGreyFlowId('rake-to-platform'),
      sessionId: TEST_SESSION_ID,
      party: platformParty,
      type: GreyFlowType.RAKE_REF,
      amount: 100,
      direction: GreyFlowDirection.IN,
      injectedTimestamp: TEST_TIMESTAMP,
    });

    expect(result.success).toBe(true);
  });

  test('ADJUST_REF can have either direction', () => {
    const party = createTestParty('player-1', GreyPartyType.PLAYER);

    const result1 = registry.appendFlow({
      flowId: createGreyFlowId('adjust-in'),
      sessionId: TEST_SESSION_ID,
      party,
      type: GreyFlowType.ADJUST_REF,
      amount: 100,
      direction: GreyFlowDirection.IN,
      injectedTimestamp: TEST_TIMESTAMP,
    });

    const result2 = registry.appendFlow({
      flowId: createGreyFlowId('adjust-out'),
      sessionId: TEST_SESSION_ID,
      party,
      type: GreyFlowType.ADJUST_REF,
      amount: 50,
      direction: GreyFlowDirection.OUT,
      injectedTimestamp: TEST_TIMESTAMP,
    });

    expect(result1.success).toBe(true);
    expect(result2.success).toBe(true);
  });
});

// ============================================================================
// STATUS TRANSITION TESTS
// ============================================================================

describe('Status Transitions', () => {
  let registry: GreyFlowRegistry;

  beforeEach(() => {
    registry = createGreyFlowRegistry();
  });

  test('new flows start as PENDING', () => {
    const party = createTestParty('player-1', GreyPartyType.PLAYER);

    const result = registry.appendFlow({
      flowId: createGreyFlowId('flow-pending'),
      sessionId: TEST_SESSION_ID,
      party,
      type: GreyFlowType.BUYIN_REF,
      amount: 1000,
      direction: GreyFlowDirection.IN,
      injectedTimestamp: TEST_TIMESTAMP,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.record.status).toBe(GreyFlowStatus.PENDING);
    }
  });

  test('PENDING can transition to CONFIRMED', () => {
    const party = createTestParty('player-1', GreyPartyType.PLAYER);
    const flowId = createGreyFlowId('flow-to-confirm');

    registry.appendFlow({
      flowId,
      sessionId: TEST_SESSION_ID,
      party,
      type: GreyFlowType.BUYIN_REF,
      amount: 1000,
      direction: GreyFlowDirection.IN,
      injectedTimestamp: TEST_TIMESTAMP,
    });

    const result = registry.confirmFlow(flowId);
    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.value.confirmedRecord.status).toBe(GreyFlowStatus.CONFIRMED);
    }
  });

  test('PENDING can transition to VOID', () => {
    const party = createTestParty('player-1', GreyPartyType.PLAYER);
    const flowId = createGreyFlowId('flow-to-void');

    registry.appendFlow({
      flowId,
      sessionId: TEST_SESSION_ID,
      party,
      type: GreyFlowType.BUYIN_REF,
      amount: 1000,
      direction: GreyFlowDirection.IN,
      injectedTimestamp: TEST_TIMESTAMP,
    });

    const result = registry.voidFlow(flowId);
    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.value.voidedRecord.status).toBe(GreyFlowStatus.VOID);
    }
  });

  test('CONFIRMED cannot transition', () => {
    const party = createTestParty('player-1', GreyPartyType.PLAYER);
    const flowId = createGreyFlowId('flow-confirmed-no-change');

    registry.appendFlow({
      flowId,
      sessionId: TEST_SESSION_ID,
      party,
      type: GreyFlowType.BUYIN_REF,
      amount: 1000,
      direction: GreyFlowDirection.IN,
      injectedTimestamp: TEST_TIMESTAMP,
    });

    registry.confirmFlow(flowId);

    // Cannot void a confirmed flow
    const result = registry.voidFlow(flowId);
    expect(result.success).toBe(false);
  });

  test('VOID cannot transition', () => {
    const party = createTestParty('player-1', GreyPartyType.PLAYER);
    const flowId = createGreyFlowId('flow-void-no-change');

    registry.appendFlow({
      flowId,
      sessionId: TEST_SESSION_ID,
      party,
      type: GreyFlowType.BUYIN_REF,
      amount: 1000,
      direction: GreyFlowDirection.IN,
      injectedTimestamp: TEST_TIMESTAMP,
    });

    registry.voidFlow(flowId);

    // Cannot confirm a voided flow
    const result = registry.confirmFlow(flowId);
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// HASH CHAIN INTEGRITY TESTS
// ============================================================================

describe('Hash Chain Integrity', () => {
  let registry: GreyFlowRegistry;

  beforeEach(() => {
    registry = createGreyFlowRegistry();
  });

  test('records form a valid hash chain', () => {
    const party = createTestParty('player-1', GreyPartyType.PLAYER);

    for (let i = 1; i <= 5; i++) {
      registry.appendFlow({
        flowId: createGreyFlowId(`flow-chain-${i}`),
        sessionId: TEST_SESSION_ID,
        party,
        type: GreyFlowType.BUYIN_REF,
        amount: 1000 * i,
        direction: GreyFlowDirection.IN,
        injectedTimestamp: TEST_TIMESTAMP + i,
      });
    }

    const session = registry.getSession(TEST_SESSION_ID);
    expect(session).toBeDefined();

    // First record should have GENESIS_HASH as previous
    expect(session!.records[0].previousHash).toBe(GENESIS_HASH);

    // Each subsequent record should chain to previous
    for (let i = 1; i < session!.records.length; i++) {
      expect(session!.records[i].previousHash).toBe(session!.records[i - 1].checksum);
    }
  });

  test('verifyFlowRecordChecksum validates records', () => {
    const party = createTestParty('player-1', GreyPartyType.PLAYER);

    const result = registry.appendFlow({
      flowId: createGreyFlowId('flow-verify'),
      sessionId: TEST_SESSION_ID,
      party,
      type: GreyFlowType.BUYIN_REF,
      amount: 1000,
      direction: GreyFlowDirection.IN,
      injectedTimestamp: TEST_TIMESTAMP,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(verifyFlowRecordChecksum(result.value.record)).toBe(true);
    }
  });

  test('verifyIntegrity validates entire registry', () => {
    const party = createTestParty('player-1', GreyPartyType.PLAYER);

    for (let i = 1; i <= 3; i++) {
      registry.appendFlow({
        flowId: createGreyFlowId(`flow-integrity-${i}`),
        sessionId: TEST_SESSION_ID,
        party,
        type: GreyFlowType.BUYIN_REF,
        amount: 1000,
        direction: GreyFlowDirection.IN,
        injectedTimestamp: TEST_TIMESTAMP + i,
      });
    }

    const integrityResult = registry.verifyIntegrity();
    expect(integrityResult.isValid).toBe(true);
    expect(integrityResult.errors.length).toBe(0);
  });
});

// ============================================================================
// VIEW AGGREGATION TESTS
// ============================================================================

describe('View Aggregations', () => {
  let registry: GreyFlowRegistry;

  beforeEach(() => {
    registry = createGreyFlowRegistry();
  });

  test('platform flow summary aggregates rake', () => {
    const platformParty = createTestParty('platform', GreyPartyType.PLATFORM);

    registry.appendFlow({
      flowId: createGreyFlowId('rake-1'),
      sessionId: TEST_SESSION_ID,
      party: platformParty,
      type: GreyFlowType.RAKE_REF,
      amount: 100,
      direction: GreyFlowDirection.IN,
      injectedTimestamp: TEST_TIMESTAMP,
    });

    registry.appendFlow({
      flowId: createGreyFlowId('rake-2'),
      sessionId: TEST_SESSION_ID,
      party: platformParty,
      type: GreyFlowType.RAKE_REF,
      amount: 150,
      direction: GreyFlowDirection.IN,
      injectedTimestamp: TEST_TIMESTAMP,
    });

    const summary = getPlatformFlowSummary(registry);

    expect(summary.totalRakeIn).toBe(250);
    expect(summary.netFlow).toBe(250);
    expect(summary.recordCount).toBe(2);
  });

  test('club flow summary aggregates per club', () => {
    const club1Party = createTestParty('club-1', GreyPartyType.CLUB);
    const club2Party = createTestParty('club-2', GreyPartyType.CLUB);

    registry.appendFlow({
      flowId: createGreyFlowId('club1-rake-1'),
      sessionId: TEST_SESSION_ID,
      party: club1Party,
      type: GreyFlowType.RAKE_REF,
      amount: 100,
      direction: GreyFlowDirection.IN,
      injectedTimestamp: TEST_TIMESTAMP,
    });

    registry.appendFlow({
      flowId: createGreyFlowId('club2-rake-1'),
      sessionId: TEST_SESSION_ID,
      party: club2Party,
      type: GreyFlowType.RAKE_REF,
      amount: 200,
      direction: GreyFlowDirection.IN,
      injectedTimestamp: TEST_TIMESTAMP,
    });

    const summary1 = getClubFlowSummary(registry, club1Party.partyId);
    const summary2 = getClubFlowSummary(registry, club2Party.partyId);

    expect(summary1.totalRakeIn).toBe(100);
    expect(summary2.totalRakeIn).toBe(200);
  });

  test('voided flows are excluded from summaries', () => {
    const platformParty = createTestParty('platform', GreyPartyType.PLATFORM);
    const flowId = createGreyFlowId('rake-void');

    registry.appendFlow({
      flowId,
      sessionId: TEST_SESSION_ID,
      party: platformParty,
      type: GreyFlowType.RAKE_REF,
      amount: 100,
      direction: GreyFlowDirection.IN,
      injectedTimestamp: TEST_TIMESTAMP,
    });

    // Void the flow
    registry.voidFlow(flowId);

    const summary = getPlatformFlowSummary(registry);

    // Voided flow should not count toward totals
    expect(summary.totalRakeIn).toBe(0);
    expect(summary.voidedCount).toBe(1);
  });

  test('time-bucketed summary groups by granularity', () => {
    const platformParty = createTestParty('platform', GreyPartyType.PLATFORM);
    const baseTime = 1704067200000; // 2024-01-01 00:00:00 UTC
    const hourMs = 60 * 60 * 1000;

    // Add flows in different hours
    for (let h = 0; h < 3; h++) {
      registry.appendFlow({
        flowId: createGreyFlowId(`rake-hour-${h}`),
        sessionId: TEST_SESSION_ID,
        party: platformParty,
        type: GreyFlowType.RAKE_REF,
        amount: 100,
        direction: GreyFlowDirection.IN,
        injectedTimestamp: baseTime + h * hourMs,
      });
    }

    const timeWindow = createGreyTimeWindow(baseTime, baseTime + 3 * hourMs);
    const bucketed = getTimeBucketedFlowSummary(
      registry,
      timeWindow,
      GreyTimeGranularity.HOUR,
      GreyPartyType.PLATFORM
    );

    expect(bucketed.buckets.length).toBe(4); // 4 hour buckets (0, 1, 2, 3)
    expect(bucketed.totalRecords).toBe(3);
  });

  test('global flow summary aggregates all parties', () => {
    const playerParty = createTestParty('player-1', GreyPartyType.PLAYER);
    const platformParty = createTestParty('platform', GreyPartyType.PLATFORM);

    registry.appendFlow({
      flowId: createGreyFlowId('buyin-1'),
      sessionId: TEST_SESSION_ID,
      party: playerParty,
      type: GreyFlowType.BUYIN_REF,
      amount: 1000,
      direction: GreyFlowDirection.IN,
      injectedTimestamp: TEST_TIMESTAMP,
    });

    registry.appendFlow({
      flowId: createGreyFlowId('rake-1'),
      sessionId: TEST_SESSION_ID,
      party: platformParty,
      type: GreyFlowType.RAKE_REF,
      amount: 50,
      direction: GreyFlowDirection.IN,
      injectedTimestamp: TEST_TIMESTAMP,
    });

    const summary = getGlobalFlowSummary(registry);

    expect(summary.totalRecords).toBe(2);
    expect(summary.totalIn).toBe(1050); // 1000 + 50
    expect(summary.byType[GreyFlowType.BUYIN_REF]).toBe(1);
    expect(summary.byType[GreyFlowType.RAKE_REF]).toBe(1);
    expect(summary.byPartyType[GreyPartyType.PLAYER]).toBe(1);
    expect(summary.byPartyType[GreyPartyType.PLATFORM]).toBe(1);
  });
});

// ============================================================================
// TIMESTAMP VALIDATION TESTS
// ============================================================================

describe('Timestamp Validation', () => {
  let registry: GreyFlowRegistry;

  beforeEach(() => {
    registry = createGreyFlowRegistry();
  });

  test('invalid timestamp is rejected', () => {
    const party = createTestParty('player-1', GreyPartyType.PLAYER);

    const result = registry.appendFlow({
      flowId: createGreyFlowId('flow-bad-ts'),
      sessionId: TEST_SESSION_ID,
      party,
      type: GreyFlowType.BUYIN_REF,
      amount: 1000,
      direction: GreyFlowDirection.IN,
      injectedTimestamp: -1, // Invalid
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe(GreyErrorCode.INVALID_TIMESTAMP);
    }
  });

  test('zero timestamp is rejected', () => {
    const party = createTestParty('player-1', GreyPartyType.PLAYER);

    const result = registry.appendFlow({
      flowId: createGreyFlowId('flow-zero-ts'),
      sessionId: TEST_SESSION_ID,
      party,
      type: GreyFlowType.BUYIN_REF,
      amount: 1000,
      direction: GreyFlowDirection.IN,
      injectedTimestamp: 0, // Invalid
    });

    expect(result.success).toBe(false);
  });

  test('valid timestamp is accepted', () => {
    const party = createTestParty('player-1', GreyPartyType.PLAYER);

    const result = registry.appendFlow({
      flowId: createGreyFlowId('flow-good-ts'),
      sessionId: TEST_SESSION_ID,
      party,
      type: GreyFlowType.BUYIN_REF,
      amount: 1000,
      direction: GreyFlowDirection.IN,
      injectedTimestamp: 1704067200000, // Valid
    });

    expect(result.success).toBe(true);
  });
});
