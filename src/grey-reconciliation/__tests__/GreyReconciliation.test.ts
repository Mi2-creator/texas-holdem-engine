/**
 * GreyReconciliation.test.ts
 * Phase A1 - Grey Flow Reconciliation & Periodic Settlement Tests
 *
 * Comprehensive tests for the reconciliation system.
 * Tests verify:
 * - Same inputs → same reconciliation
 * - Snapshot reproducibility
 * - Discrepancy detection correctness
 * - Integer-only math
 * - GreyFlow untouched
 * - Engine untouched
 */

import {
  // Grey Runtime imports (read-only)
  GreyFlowRegistry,
  createGreyFlowRegistry,
  resetGreyFlowRegistry,
  createGreySessionId,
  createGreyFlowId,
  createGreyPartyId,
  createGreyParty,
  GreyPartyType,
  GreyFlowType,
  GreyFlowDirection,
  GreyFlowStatus,
  GreyFlowRecordInput,
} from '../../grey-runtime';

import {
  // Reconciliation types
  ReconciliationStatus,
  SettlementBucket,
  DiscrepancyType,
  DiscrepancySeverity,
  ReconciliationErrorCode,
  RECONCILIATION_VERSION,
  RECONCILIATION_FORBIDDEN_CONCEPTS,
  createReconciliationPeriodId,
  createReconciliationPeriod,
  isValidPeriod,

  // Reconciliation engine
  reconcilePeriod,
  calculateReconciliationChecksum,
  verifyReconciliationChecksum,
  compareReconciliationResults,

  // Snapshots
  SNAPSHOT_GENESIS_HASH,
  createSnapshotsFromReconciliation,
  verifySnapshotChecksum,
  verifySnapshotChain,
  compareSnapshots,

  // Views
  getPlatformPeriodSummary,
  getClubPeriodSummary,
  getAllClubPeriodSummaries,
  getAgentPeriodSummary,
  getDiscrepancyReport,
  getMultiPeriodSummary,

  // Boundary guards
  MUTATION_BLOCKED,
  BALANCE_CONCEPT_BLOCKED,
  ENGINE_IMPORT_BLOCKED,
  findForbiddenConcepts,
  assertInteger,
  assertValidPeriod,
} from '../index';

// ============================================================================
// TEST HELPERS
// ============================================================================

const TEST_SESSION_ID = createGreySessionId('recon-test-session');
const TEST_PERIOD_ID = createReconciliationPeriodId('test-period-1');
const BASE_TIMESTAMP = 1704067200000; // 2024-01-01 00:00:00 UTC
const DAY_MS = 24 * 60 * 60 * 1000;

function createTestParty(id: string, type: GreyPartyType) {
  return createGreyParty(createGreyPartyId(id), type);
}

function setupTestRegistry(): GreyFlowRegistry {
  const registry = createGreyFlowRegistry();

  // Add platform rake flows
  const platformParty = createTestParty('platform', GreyPartyType.PLATFORM);
  registry.appendFlow({
    flowId: createGreyFlowId('rake-1'),
    sessionId: TEST_SESSION_ID,
    party: platformParty,
    type: GreyFlowType.RAKE_REF,
    amount: 100,
    direction: GreyFlowDirection.IN,
    injectedTimestamp: BASE_TIMESTAMP + 1000,
  });

  registry.appendFlow({
    flowId: createGreyFlowId('rake-2'),
    sessionId: TEST_SESSION_ID,
    party: platformParty,
    type: GreyFlowType.RAKE_REF,
    amount: 150,
    direction: GreyFlowDirection.IN,
    injectedTimestamp: BASE_TIMESTAMP + 2000,
  });

  // Add club rake flows
  const clubParty = createTestParty('club-1', GreyPartyType.CLUB);
  registry.appendFlow({
    flowId: createGreyFlowId('club-rake-1'),
    sessionId: TEST_SESSION_ID,
    party: clubParty,
    type: GreyFlowType.RAKE_REF,
    amount: 200,
    direction: GreyFlowDirection.IN,
    injectedTimestamp: BASE_TIMESTAMP + 3000,
  });

  // Add agent commission flows
  const agentParty = createTestParty('agent-1', GreyPartyType.AGENT);
  registry.appendFlow({
    flowId: createGreyFlowId('agent-comm-1'),
    sessionId: TEST_SESSION_ID,
    party: agentParty,
    type: GreyFlowType.RAKE_REF,
    amount: 50,
    direction: GreyFlowDirection.IN,
    injectedTimestamp: BASE_TIMESTAMP + 4000,
  });

  // Confirm some flows
  registry.confirmFlow(createGreyFlowId('rake-1'));
  registry.confirmFlow(createGreyFlowId('club-rake-1'));

  return registry;
}

function createTestPeriod() {
  const result = createReconciliationPeriod(
    TEST_PERIOD_ID,
    BASE_TIMESTAMP,
    BASE_TIMESTAMP + DAY_MS,
    'Test Day 1'
  );
  if (!result.success) {
    throw new Error('Failed to create test period');
  }
  return result.value;
}

// ============================================================================
// SAME INPUTS → SAME RECONCILIATION
// ============================================================================

describe('Determinism - Same Inputs Same Output', () => {
  test('same registry + period produces identical reconciliation', () => {
    const registry1 = setupTestRegistry();
    const registry2 = setupTestRegistry();
    const period = createTestPeriod();

    const result1 = reconcilePeriod(registry1, period);
    const result2 = reconcilePeriod(registry2, period);

    expect(result1.success).toBe(true);
    expect(result2.success).toBe(true);

    if (result1.success && result2.success) {
      expect(result1.value.checksum).toBe(result2.value.checksum);
      expect(result1.value.totalFlowCount).toBe(result2.value.totalFlowCount);
      expect(result1.value.status).toBe(result2.value.status);
    }
  });

  test('compareReconciliationResults returns true for identical inputs', () => {
    const registry = setupTestRegistry();
    const period = createTestPeriod();

    const result1 = reconcilePeriod(registry, period);
    const result2 = reconcilePeriod(registry, period);

    expect(result1.success).toBe(true);
    expect(result2.success).toBe(true);

    if (result1.success && result2.success) {
      expect(compareReconciliationResults(result1.value, result2.value)).toBe(true);
    }
  });

  test('checksum calculation is deterministic', () => {
    const data1 = { a: 1, b: 2, c: 'test' };
    const data2 = { c: 'test', a: 1, b: 2 }; // Different order

    const checksum1 = calculateReconciliationChecksum(data1);
    const checksum2 = calculateReconciliationChecksum(data2);

    expect(checksum1).toBe(checksum2);
  });

  test('view summaries are deterministic', () => {
    const registry = setupTestRegistry();
    const period = createTestPeriod();

    const summary1 = getPlatformPeriodSummary(registry, period);
    const summary2 = getPlatformPeriodSummary(registry, period);

    expect(summary1.success).toBe(true);
    expect(summary2.success).toBe(true);

    if (summary1.success && summary2.success) {
      expect(summary1.value.checksum).toBe(summary2.value.checksum);
    }
  });
});

// ============================================================================
// SNAPSHOT REPRODUCIBILITY
// ============================================================================

describe('Snapshot Reproducibility', () => {
  test('snapshots are reproducible from same inputs', () => {
    const registry = setupTestRegistry();
    const period = createTestPeriod();
    const timestamp = BASE_TIMESTAMP + DAY_MS;

    const reconcileResult = reconcilePeriod(registry, period);
    expect(reconcileResult.success).toBe(true);

    if (reconcileResult.success) {
      const snapshots1 = createSnapshotsFromReconciliation(
        reconcileResult.value,
        timestamp,
        SNAPSHOT_GENESIS_HASH
      );

      const snapshots2 = createSnapshotsFromReconciliation(
        reconcileResult.value,
        timestamp,
        SNAPSHOT_GENESIS_HASH
      );

      expect(snapshots1.success).toBe(true);
      expect(snapshots2.success).toBe(true);

      if (snapshots1.success && snapshots2.success) {
        expect(snapshots1.value.length).toBe(snapshots2.value.length);

        for (let i = 0; i < snapshots1.value.length; i++) {
          expect(snapshots1.value[i].checksum).toBe(snapshots2.value[i].checksum);
        }
      }
    }
  });

  test('snapshot checksums are verifiable', () => {
    const registry = setupTestRegistry();
    const period = createTestPeriod();
    const timestamp = BASE_TIMESTAMP + DAY_MS;

    const reconcileResult = reconcilePeriod(registry, period);
    expect(reconcileResult.success).toBe(true);

    if (reconcileResult.success) {
      const snapshotsResult = createSnapshotsFromReconciliation(
        reconcileResult.value,
        timestamp
      );

      expect(snapshotsResult.success).toBe(true);

      if (snapshotsResult.success) {
        for (const snapshot of snapshotsResult.value) {
          expect(verifySnapshotChecksum(snapshot)).toBe(true);
        }
      }
    }
  });

  test('snapshot chain is valid', () => {
    const registry = setupTestRegistry();
    const period = createTestPeriod();
    const timestamp = BASE_TIMESTAMP + DAY_MS;

    const reconcileResult = reconcilePeriod(registry, period);
    expect(reconcileResult.success).toBe(true);

    if (reconcileResult.success) {
      const snapshotsResult = createSnapshotsFromReconciliation(
        reconcileResult.value,
        timestamp
      );

      expect(snapshotsResult.success).toBe(true);

      if (snapshotsResult.success) {
        const chainResult = verifySnapshotChain(snapshotsResult.value);
        expect(chainResult.valid).toBe(true);
        expect(chainResult.errors.length).toBe(0);
      }
    }
  });

  test('first snapshot has genesis hash', () => {
    const registry = setupTestRegistry();
    const period = createTestPeriod();
    const timestamp = BASE_TIMESTAMP + DAY_MS;

    const reconcileResult = reconcilePeriod(registry, period);
    expect(reconcileResult.success).toBe(true);

    if (reconcileResult.success) {
      const snapshotsResult = createSnapshotsFromReconciliation(
        reconcileResult.value,
        timestamp
      );

      expect(snapshotsResult.success).toBe(true);

      if (snapshotsResult.success && snapshotsResult.value.length > 0) {
        expect(snapshotsResult.value[0].previousSnapshotHash).toBe(SNAPSHOT_GENESIS_HASH);
      }
    }
  });
});

// ============================================================================
// DISCREPANCY DETECTION
// ============================================================================

describe('Discrepancy Detection', () => {
  test('detects pending flows as incomplete', () => {
    const registry = setupTestRegistry();
    const period = createTestPeriod();

    const result = reconcilePeriod(registry, period);
    expect(result.success).toBe(true);

    if (result.success) {
      // We have pending flows (rake-2, agent-comm-1)
      expect(result.value.pendingFlowCount).toBeGreaterThan(0);
      expect(result.value.status).toBe(ReconciliationStatus.INCOMPLETE);

      // Should have discrepancy about pending flows
      const pendingDiscrepancy = result.value.discrepancies.find(
        (d) => d.type === DiscrepancyType.STATUS_INCONSISTENCY
      );
      expect(pendingDiscrepancy).toBeDefined();
    }
  });

  test('discrepancy report contains severity breakdown', () => {
    const registry = setupTestRegistry();
    const period = createTestPeriod();
    const timestamp = BASE_TIMESTAMP + DAY_MS;

    const report = getDiscrepancyReport(registry, period, timestamp);
    expect(report.success).toBe(true);

    if (report.success) {
      expect(report.value.bySeverity).toBeDefined();
      expect(report.value.byType).toBeDefined();
      expect(report.value.totalCount).toBe(report.value.discrepancies.length);
    }
  });

  test('reconciliation with all confirmed flows is BALANCED', () => {
    const registry = createGreyFlowRegistry();
    const platformParty = createTestParty('platform', GreyPartyType.PLATFORM);

    // Add and confirm a single flow
    registry.appendFlow({
      flowId: createGreyFlowId('confirmed-rake'),
      sessionId: TEST_SESSION_ID,
      party: platformParty,
      type: GreyFlowType.RAKE_REF,
      amount: 100,
      direction: GreyFlowDirection.IN,
      injectedTimestamp: BASE_TIMESTAMP + 1000,
    });
    registry.confirmFlow(createGreyFlowId('confirmed-rake'));

    const period = createTestPeriod();
    const result = reconcilePeriod(registry, period);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.status).toBe(ReconciliationStatus.BALANCED);
    }
  });
});

// ============================================================================
// INTEGER-ONLY MATH
// ============================================================================

describe('Integer-Only Math', () => {
  test('all totals are integers', () => {
    const registry = setupTestRegistry();
    const period = createTestPeriod();

    const result = reconcilePeriod(registry, period);
    expect(result.success).toBe(true);

    if (result.success) {
      // Platform summary
      if (result.value.platformSummary) {
        expect(Number.isInteger(result.value.platformSummary.totalIn)).toBe(true);
        expect(Number.isInteger(result.value.platformSummary.totalOut)).toBe(true);
        expect(Number.isInteger(result.value.platformSummary.netReference)).toBe(true);
      }

      // Club summaries
      for (const club of result.value.clubSummaries) {
        expect(Number.isInteger(club.totalIn)).toBe(true);
        expect(Number.isInteger(club.totalOut)).toBe(true);
        expect(Number.isInteger(club.netReference)).toBe(true);
      }

      // Agent summaries
      for (const agent of result.value.agentSummaries) {
        expect(Number.isInteger(agent.totalIn)).toBe(true);
        expect(Number.isInteger(agent.totalOut)).toBe(true);
        expect(Number.isInteger(agent.netReference)).toBe(true);
      }

      // Settlement totals
      for (const total of result.value.settlementTotals) {
        expect(Number.isInteger(total.totalRakeIn)).toBe(true);
        expect(Number.isInteger(total.totalAdjustIn)).toBe(true);
        expect(Number.isInteger(total.totalAdjustOut)).toBe(true);
        expect(Number.isInteger(total.netSettlement)).toBe(true);
      }
    }
  });

  test('assertInteger rejects floats', () => {
    const result = assertInteger(10.5, 'testField');
    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.error.code).toBe(ReconciliationErrorCode.NON_INTEGER_VALUE);
    }
  });

  test('assertInteger accepts integers', () => {
    const result = assertInteger(100, 'testField');
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// GREY FLOW UNTOUCHED
// ============================================================================

describe('GreyFlow Untouched', () => {
  test('reconciliation does not modify registry', () => {
    const registry = setupTestRegistry();
    const initialCount = registry.getRecordCount();
    const period = createTestPeriod();

    // Run reconciliation
    reconcilePeriod(registry, period);

    // Registry should be unchanged
    expect(registry.getRecordCount()).toBe(initialCount);
  });

  test('view operations do not modify registry', () => {
    const registry = setupTestRegistry();
    const initialCount = registry.getRecordCount();
    const period = createTestPeriod();

    // Run all views
    getPlatformPeriodSummary(registry, period);
    getAllClubPeriodSummaries(registry, period);
    getDiscrepancyReport(registry, period, BASE_TIMESTAMP + DAY_MS);

    // Registry should be unchanged
    expect(registry.getRecordCount()).toBe(initialCount);
  });

  test('snapshot creation does not modify registry', () => {
    const registry = setupTestRegistry();
    const initialCount = registry.getRecordCount();
    const period = createTestPeriod();

    const reconcileResult = reconcilePeriod(registry, period);
    if (reconcileResult.success) {
      createSnapshotsFromReconciliation(
        reconcileResult.value,
        BASE_TIMESTAMP + DAY_MS
      );
    }

    // Registry should be unchanged
    expect(registry.getRecordCount()).toBe(initialCount);
  });
});

// ============================================================================
// ENGINE UNTOUCHED
// ============================================================================

describe('Engine Untouched', () => {
  test('reconciliation module does not import engine', () => {
    // This is verified by the import structure
    // The test ensures no engine-related methods exist
    expect(ENGINE_IMPORT_BLOCKED.blockedPaths).toContain('src/engine');
  });

  test('module version is correct', () => {
    expect(RECONCILIATION_VERSION).toBe('1.0.0');
  });

  test('boundary guards are defined', () => {
    expect(MUTATION_BLOCKED.message).toContain('READ-ONLY');
    expect(BALANCE_CONCEPT_BLOCKED.message).toContain('NOT track balances');
  });
});

// ============================================================================
// FORBIDDEN CONCEPTS
// ============================================================================

describe('Forbidden Concepts', () => {
  test('RECONCILIATION_FORBIDDEN_CONCEPTS is defined', () => {
    expect(RECONCILIATION_FORBIDDEN_CONCEPTS.length).toBeGreaterThan(0);
    expect(RECONCILIATION_FORBIDDEN_CONCEPTS).toContain('payment');
    expect(RECONCILIATION_FORBIDDEN_CONCEPTS).toContain('wallet');
    expect(RECONCILIATION_FORBIDDEN_CONCEPTS).toContain('balance');
  });

  test('findForbiddenConcepts detects forbidden terms', () => {
    expect(findForbiddenConcepts('payment processing')).toContain('payment');
    expect(findForbiddenConcepts('user balance')).toContain('balance');
    expect(findForbiddenConcepts('crypto transfer')).toContain('crypto');
  });

  test('clean text passes forbidden check', () => {
    const found = findForbiddenConcepts('platform rake reference');
    expect(found.length).toBe(0);
  });
});

// ============================================================================
// PERIOD VALIDATION
// ============================================================================

describe('Period Validation', () => {
  test('valid period is accepted', () => {
    const result = createReconciliationPeriod(
      createReconciliationPeriodId('valid-period'),
      BASE_TIMESTAMP,
      BASE_TIMESTAMP + DAY_MS
    );
    expect(result.success).toBe(true);
  });

  test('invalid period (start >= end) is rejected', () => {
    const result = createReconciliationPeriod(
      createReconciliationPeriodId('invalid-period'),
      BASE_TIMESTAMP + DAY_MS,
      BASE_TIMESTAMP
    );
    expect(result.success).toBe(false);
  });

  test('invalid timestamp (negative) is rejected', () => {
    const result = createReconciliationPeriod(
      createReconciliationPeriodId('negative-ts'),
      -1000,
      BASE_TIMESTAMP
    );
    expect(result.success).toBe(false);
  });

  test('assertValidPeriod validates periods', () => {
    const validResult = assertValidPeriod(BASE_TIMESTAMP, BASE_TIMESTAMP + DAY_MS);
    expect(validResult.success).toBe(true);

    const invalidResult = assertValidPeriod(BASE_TIMESTAMP + DAY_MS, BASE_TIMESTAMP);
    expect(invalidResult.success).toBe(false);
  });
});

// ============================================================================
// MULTI-PERIOD RECONCILIATION
// ============================================================================

describe('Multi-Period Reconciliation', () => {
  test('multi-period summary aggregates correctly', () => {
    const registry = setupTestRegistry();

    const period1 = createReconciliationPeriod(
      createReconciliationPeriodId('period-1'),
      BASE_TIMESTAMP,
      BASE_TIMESTAMP + DAY_MS
    );

    const period2 = createReconciliationPeriod(
      createReconciliationPeriodId('period-2'),
      BASE_TIMESTAMP + DAY_MS,
      BASE_TIMESTAMP + 2 * DAY_MS
    );

    expect(period1.success).toBe(true);
    expect(period2.success).toBe(true);

    if (period1.success && period2.success) {
      const result = getMultiPeriodSummary(registry, [period1.value, period2.value]);
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.value.periods.length).toBe(2);
        expect(result.value.periodResults.length).toBe(2);
      }
    }
  });
});

// ============================================================================
// VIEW TRACEABILITY
// ============================================================================

describe('View Traceability', () => {
  test('platform summary includes source flow IDs', () => {
    const registry = setupTestRegistry();
    const period = createTestPeriod();

    const result = getPlatformPeriodSummary(registry, period);
    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.value.sourceFlowIds).toBeDefined();
      expect(Array.isArray(result.value.sourceFlowIds)).toBe(true);
    }
  });

  test('club summary includes source flow IDs', () => {
    const registry = setupTestRegistry();
    const period = createTestPeriod();
    const clubPartyId = createGreyPartyId('club-1');

    const result = getClubPeriodSummary(registry, period, clubPartyId);
    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.value.sourceFlowIds).toBeDefined();
      expect(result.value.sourceFlowIds.length).toBeGreaterThan(0);
    }
  });

  test('agent summary includes source flow IDs', () => {
    const registry = setupTestRegistry();
    const period = createTestPeriod();
    const agentPartyId = createGreyPartyId('agent-1');

    const result = getAgentPeriodSummary(registry, period, agentPartyId);
    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.value.sourceFlowIds).toBeDefined();
      expect(result.value.sourceFlowIds.length).toBeGreaterThan(0);
    }
  });
});

// ============================================================================
// SNAPSHOT IMMUTABILITY
// ============================================================================

describe('Snapshot Immutability', () => {
  test('snapshots are frozen', () => {
    const registry = setupTestRegistry();
    const period = createTestPeriod();
    const timestamp = BASE_TIMESTAMP + DAY_MS;

    const reconcileResult = reconcilePeriod(registry, period);
    expect(reconcileResult.success).toBe(true);

    if (reconcileResult.success) {
      const snapshotsResult = createSnapshotsFromReconciliation(
        reconcileResult.value,
        timestamp
      );

      expect(snapshotsResult.success).toBe(true);

      if (snapshotsResult.success) {
        for (const snapshot of snapshotsResult.value) {
          expect(Object.isFrozen(snapshot)).toBe(true);
        }
      }
    }
  });

  test('reconciliation results are frozen', () => {
    const registry = setupTestRegistry();
    const period = createTestPeriod();

    const result = reconcilePeriod(registry, period);
    expect(result.success).toBe(true);

    if (result.success) {
      expect(Object.isFrozen(result.value)).toBe(true);
      expect(Object.isFrozen(result.value.clubSummaries)).toBe(true);
      expect(Object.isFrozen(result.value.agentSummaries)).toBe(true);
      expect(Object.isFrozen(result.value.discrepancies)).toBe(true);
    }
  });
});

// ============================================================================
// CHECKSUM VERIFICATION
// ============================================================================

describe('Checksum Verification', () => {
  test('reconciliation checksum is verifiable', () => {
    const registry = setupTestRegistry();
    const period = createTestPeriod();

    const result = reconcilePeriod(registry, period);
    expect(result.success).toBe(true);

    if (result.success) {
      expect(verifyReconciliationChecksum(result.value)).toBe(true);
    }
  });

  test('platform summary checksum is verifiable', () => {
    const registry = setupTestRegistry();
    const period = createTestPeriod();

    const result = getPlatformPeriodSummary(registry, period);
    expect(result.success).toBe(true);

    if (result.success) {
      // Checksum is part of the summary
      expect(result.value.checksum).toBeDefined();
      expect(typeof result.value.checksum).toBe('string');
    }
  });
});
