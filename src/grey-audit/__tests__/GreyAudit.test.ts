/**
 * GreyAudit.test.ts
 * Phase A4 - Grey Audit Reconciliation Loop Tests
 *
 * Tests for:
 * - Deterministic audit output (same inputs → same outputs)
 * - Pure correlation only (no value computation)
 * - No mutations to any data
 * - Replay safety verification
 * - Audit status and flag correctness
 */

import { describe, it, expect, beforeEach } from '@jest/globals';

// Import from grey-runtime
import {
  GreyFlowId,
  GreyFlowRecord,
  GreyFlowStatus,
  GreyFlowType,
  GreyFlowDirection,
  GreyPartyId,
  GreyPartyType,
  GreySessionId,
  createGreyFlowId,
  createGreyPartyId,
  createGreySessionId,
  createGreyParty,
} from '../../grey-runtime';

// Import from grey-reconciliation
import {
  ReconciliationPeriodId,
  createReconciliationPeriodId,
} from '../../grey-reconciliation';

// Import from grey-attribution
import {
  AttributionSnapshot,
  AttributionEntry,
  AttributionPartyType,
  AttributionSnapshotId,
  AttributionRuleSetId,
  AttributionEntryId,
  createAttributionSnapshotId,
  createAttributionRuleSetId,
  createAttributionEntryId,
} from '../../grey-attribution';

// Import from grey-recharge
import {
  GreyRechargeId,
  GreyRechargeRecord,
  GreyRechargeStatus,
  GreyRechargeSource,
  RechargeLink,
  RechargeLinkId,
  createGreyRechargeId,
  createRechargeLinkId,
} from '../../grey-recharge';

// Import from grey-audit
import {
  GreyAuditStatus,
  AuditFlag,
  createGreyAuditSessionId,
  runAudit,
  createAuditFlowData,
  createAuditRechargeData,
  createAuditAttributionData,
  verifyAuditReproducibility,
  getAuditSummaryByPeriod,
  getAuditSummaryByParty,
  getAllClubAuditSummaries,
  getAllAgentAuditSummaries,
  getAuditExceptionList,
  getAuditStatusBreakdown,
  getAuditFlagBreakdown,
  getFlowCorrelationTrace,
  getAllCorrelationTraces,
  AUDIT_FORBIDDEN_CONCEPTS,
  findForbiddenConcepts,
  assertNoForbiddenConcepts,
  assertInteger,
  assertValidTimestamp,
  BALANCE_MATH_BLOCKED,
  MUTATION_BLOCKED,
  AUDIT_BOUNDARY_GUARD_DOCUMENTATION,
} from '../index';

// ============================================================================
// TEST HELPERS
// ============================================================================

function createTestFlowRecord(
  flowId: string,
  amount: number,
  status: GreyFlowStatus = GreyFlowStatus.CONFIRMED,
  partyId: string = 'party_player1'
): GreyFlowRecord {
  return Object.freeze({
    flowId: createGreyFlowId(flowId) as GreyFlowId,
    sessionId: createGreySessionId('session_test') as GreySessionId,
    type: GreyFlowType.BUYIN_REF,
    status,
    direction: GreyFlowDirection.IN,
    party: createGreyParty(
      createGreyPartyId(partyId) as GreyPartyId,
      GreyPartyType.PLAYER
    ),
    amount,
    injectedTimestamp: 1000,
    description: 'Test flow',
    sequence: 0,
    checksum: `chk_${flowId}`,
    previousHash: '00000000',
  }) as GreyFlowRecord;
}

function createTestRechargeRecord(
  rechargeId: string,
  amount: number,
  partyId: string,
  status: GreyRechargeStatus = GreyRechargeStatus.CONFIRMED
): GreyRechargeRecord {
  return Object.freeze({
    rechargeId: createGreyRechargeId(rechargeId) as GreyRechargeId,
    source: GreyRechargeSource.EXTERNAL,
    status,
    partyId: createGreyPartyId(partyId) as GreyPartyId,
    referenceAmount: amount,
    sequence: 0,
    declaredTimestamp: 1000,
    checksum: `rch_${rechargeId}`,
    previousChecksum: '00000000',
  }) as GreyRechargeRecord;
}

function createTestLink(
  linkId: string,
  rechargeId: string,
  flowIds: string[]
): RechargeLink {
  return Object.freeze({
    linkId: createRechargeLinkId(linkId) as RechargeLinkId,
    rechargeId: createGreyRechargeId(rechargeId) as GreyRechargeId,
    linkedFlowIds: Object.freeze(flowIds.map((id) => createGreyFlowId(id) as GreyFlowId)),
    linkedReferenceTotal: 1000,
    linkedTimestamp: 1000,
    checksum: `lnk_${linkId}`,
  }) as RechargeLink;
}

function createTestAttributionSnapshot(
  entries: { flowId: string; partyId: string; partyType: AttributionPartyType }[]
): AttributionSnapshot {
  const ruleSetId = createAttributionRuleSetId('rules_test') as AttributionRuleSetId;

  const attrEntries: AttributionEntry[] = entries.map((e, i) =>
    Object.freeze({
      entryId: createAttributionEntryId(`entry_${i}`) as AttributionEntryId,
      sourceGreyFlowId: createGreyFlowId(e.flowId) as GreyFlowId,
      originalAmount: 1000,
      partyId: createGreyPartyId(e.partyId) as GreyPartyId,
      partyType: e.partyType,
      ruleSetId,
      appliedBasisPoints: 1000,
      amount: 100,
    }) as AttributionEntry
  );

  return Object.freeze({
    snapshotId: createAttributionSnapshotId('snap_test') as AttributionSnapshotId,
    periodId: createReconciliationPeriodId('period_test') as ReconciliationPeriodId,
    ruleSetId,
    previousHash: '00000000',
    createdAt: 1000,
    totalOriginal: entries.length * 1000,
    totalAttributed: entries.length * 100,
    flowCount: entries.length,
    entryCount: entries.length,
    partyTypeSummaries: Object.freeze([]),
    partySummaries: Object.freeze([]),
    entries: Object.freeze(attrEntries),
    checksum: 'snap_chk',
  }) as AttributionSnapshot;
}

// ============================================================================
// TYPE TESTS
// ============================================================================

describe('GreyAuditTypes', () => {
  it('should create valid audit session ID', () => {
    const sessionId = createGreyAuditSessionId(1000, 'abc123');
    expect(sessionId).toBe('audit_1000_abc123');
  });

  it('should have valid audit status enum', () => {
    expect(GreyAuditStatus.MATCHED).toBe('MATCHED');
    expect(GreyAuditStatus.PARTIAL).toBe('PARTIAL');
    expect(GreyAuditStatus.MISSING).toBe('MISSING');
    expect(GreyAuditStatus.ORPHAN).toBe('ORPHAN');
  });

  it('should have valid audit flags', () => {
    expect(AuditFlag.FLOW_NO_RECHARGE).toBe('FLOW_NO_RECHARGE');
    expect(AuditFlag.RECHARGE_NO_FLOW).toBe('RECHARGE_NO_FLOW');
    expect(AuditFlag.FLOW_NO_ATTRIBUTION).toBe('FLOW_NO_ATTRIBUTION');
    expect(AuditFlag.PARTY_MISMATCH).toBe('PARTY_MISMATCH');
  });

  it('should have forbidden concepts list', () => {
    expect(AUDIT_FORBIDDEN_CONCEPTS).toContain('payment');
    expect(AUDIT_FORBIDDEN_CONCEPTS).toContain('wallet');
    expect(AUDIT_FORBIDDEN_CONCEPTS).toContain('crypto');
    expect(AUDIT_FORBIDDEN_CONCEPTS).toContain('balance');
  });
});

// ============================================================================
// AUDIT ENGINE TESTS
// ============================================================================

describe('GreyAuditEngine', () => {
  describe('runAudit', () => {
    it('should produce deterministic output for same inputs', () => {
      const flows = [
        createTestFlowRecord('flow_1', 1000),
        createTestFlowRecord('flow_2', 2000),
      ];

      const recharges = [
        createTestRechargeRecord('rch_1', 1000, 'party_1'),
      ];

      const links = [
        createTestLink('link_1', 'rch_1', ['flow_1']),
      ];

      const snapshot = createTestAttributionSnapshot([
        { flowId: 'flow_1', partyId: 'party_1', partyType: AttributionPartyType.PLATFORM },
      ]);

      const sessionInput = {
        sessionId: createGreyAuditSessionId(1000, 'test'),
        periodId: createReconciliationPeriodId('period_1') as ReconciliationPeriodId,
        auditTimestamp: 2000,
      };

      const input = {
        sessionInput,
        flowData: createAuditFlowData(flows),
        rechargeData: createAuditRechargeData(recharges, links),
        attributionData: createAuditAttributionData(snapshot),
      };

      // Run twice
      const result1 = runAudit(input);
      const result2 = runAudit(input);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);

      if (result1.success && result2.success) {
        // Checksums should be identical
        expect(result1.value.summary.checksum).toBe(result2.value.summary.checksum);
        expect(result1.value.rows.length).toBe(result2.value.rows.length);

        for (let i = 0; i < result1.value.rows.length; i++) {
          expect(result1.value.rows[i].checksum).toBe(result2.value.rows[i].checksum);
        }
      }
    });

    it('should mark flow as MATCHED when it has recharge and attribution', () => {
      const flows = [createTestFlowRecord('flow_1', 1000)];
      const recharges = [createTestRechargeRecord('rch_1', 1000, 'party_1')];
      const links = [createTestLink('link_1', 'rch_1', ['flow_1'])];
      const snapshot = createTestAttributionSnapshot([
        { flowId: 'flow_1', partyId: 'party_1', partyType: AttributionPartyType.PLATFORM },
      ]);

      const input = {
        sessionInput: {
          sessionId: createGreyAuditSessionId(1000, 'test'),
          periodId: createReconciliationPeriodId('period_1') as ReconciliationPeriodId,
          auditTimestamp: 2000,
        },
        flowData: createAuditFlowData(flows),
        rechargeData: createAuditRechargeData(recharges, links),
        attributionData: createAuditAttributionData(snapshot),
      };

      const result = runAudit(input);
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.value.rows[0].auditStatus).toBe(GreyAuditStatus.MATCHED);
      }
    });

    it('should mark flow as PARTIAL when it has attribution but no recharge', () => {
      const flows = [createTestFlowRecord('flow_1', 1000)];
      const recharges: GreyRechargeRecord[] = [];
      const links: RechargeLink[] = [];
      const snapshot = createTestAttributionSnapshot([
        { flowId: 'flow_1', partyId: 'party_1', partyType: AttributionPartyType.PLATFORM },
      ]);

      const input = {
        sessionInput: {
          sessionId: createGreyAuditSessionId(1000, 'test'),
          periodId: createReconciliationPeriodId('period_1') as ReconciliationPeriodId,
          auditTimestamp: 2000,
        },
        flowData: createAuditFlowData(flows),
        rechargeData: createAuditRechargeData(recharges, links),
        attributionData: createAuditAttributionData(snapshot),
      };

      const result = runAudit(input);
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.value.rows[0].auditStatus).toBe(GreyAuditStatus.PARTIAL);
        expect(result.value.rows[0].flags).toContain(AuditFlag.FLOW_NO_RECHARGE);
      }
    });

    it('should mark flow as MISSING when confirmed but has no attribution', () => {
      const flows = [createTestFlowRecord('flow_1', 1000, GreyFlowStatus.CONFIRMED)];
      const recharges = [createTestRechargeRecord('rch_1', 1000, 'party_1')];
      const links = [createTestLink('link_1', 'rch_1', ['flow_1'])];

      const input = {
        sessionInput: {
          sessionId: createGreyAuditSessionId(1000, 'test'),
          periodId: createReconciliationPeriodId('period_1') as ReconciliationPeriodId,
          auditTimestamp: 2000,
        },
        flowData: createAuditFlowData(flows),
        rechargeData: createAuditRechargeData(recharges, links),
        attributionData: createAuditAttributionData(null),
      };

      const result = runAudit(input);
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.value.rows[0].auditStatus).toBe(GreyAuditStatus.MISSING);
        expect(result.value.rows[0].flags).toContain(AuditFlag.FLOW_NO_ATTRIBUTION);
      }
    });

    it('should flag unconfirmed recharge', () => {
      const flows = [createTestFlowRecord('flow_1', 1000)];
      const recharges = [
        createTestRechargeRecord('rch_1', 1000, 'party_1', GreyRechargeStatus.DECLARED),
      ];
      const links = [createTestLink('link_1', 'rch_1', ['flow_1'])];
      const snapshot = createTestAttributionSnapshot([
        { flowId: 'flow_1', partyId: 'party_1', partyType: AttributionPartyType.PLATFORM },
      ]);

      const input = {
        sessionInput: {
          sessionId: createGreyAuditSessionId(1000, 'test'),
          periodId: createReconciliationPeriodId('period_1') as ReconciliationPeriodId,
          auditTimestamp: 2000,
        },
        flowData: createAuditFlowData(flows),
        rechargeData: createAuditRechargeData(recharges, links),
        attributionData: createAuditAttributionData(snapshot),
      };

      const result = runAudit(input);
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.value.rows[0].flags).toContain(AuditFlag.RECHARGE_NOT_CONFIRMED);
      }
    });

    it('should detect orphan recharges', () => {
      const flows: GreyFlowRecord[] = [];
      const recharges = [createTestRechargeRecord('rch_1', 1000, 'party_1')];
      const links: RechargeLink[] = [];

      const input = {
        sessionInput: {
          sessionId: createGreyAuditSessionId(1000, 'test'),
          periodId: createReconciliationPeriodId('period_1') as ReconciliationPeriodId,
          auditTimestamp: 2000,
        },
        flowData: createAuditFlowData(flows),
        rechargeData: createAuditRechargeData(recharges, links),
        attributionData: createAuditAttributionData(null),
      };

      const result = runAudit(input);
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.value.orphanRecharges.length).toBe(1);
        expect(result.value.summary.countByFlag[AuditFlag.RECHARGE_NO_FLOW]).toBe(1);
      }
    });

    it('should detect orphan attributions', () => {
      const flows: GreyFlowRecord[] = [];
      const recharges: GreyRechargeRecord[] = [];
      const links: RechargeLink[] = [];
      const snapshot = createTestAttributionSnapshot([
        { flowId: 'flow_orphan', partyId: 'party_1', partyType: AttributionPartyType.PLATFORM },
      ]);

      const input = {
        sessionInput: {
          sessionId: createGreyAuditSessionId(1000, 'test'),
          periodId: createReconciliationPeriodId('period_1') as ReconciliationPeriodId,
          auditTimestamp: 2000,
        },
        flowData: createAuditFlowData(flows),
        rechargeData: createAuditRechargeData(recharges, links),
        attributionData: createAuditAttributionData(snapshot),
      };

      const result = runAudit(input);
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.value.orphanAttributions.length).toBe(1);
        expect(result.value.summary.countByFlag[AuditFlag.ATTRIBUTION_NO_FLOW]).toBe(1);
      }
    });

    it('should reject invalid timestamp', () => {
      const input = {
        sessionInput: {
          sessionId: createGreyAuditSessionId(1000, 'test'),
          periodId: createReconciliationPeriodId('period_1') as ReconciliationPeriodId,
          auditTimestamp: -1, // Invalid
        },
        flowData: createAuditFlowData([]),
        rechargeData: createAuditRechargeData([], []),
        attributionData: createAuditAttributionData(null),
      };

      const result = runAudit(input);
      expect(result.success).toBe(false);
    });

    it('should verify audit reproducibility', () => {
      const flows = [createTestFlowRecord('flow_1', 1000)];
      const recharges = [createTestRechargeRecord('rch_1', 1000, 'party_1')];
      const links = [createTestLink('link_1', 'rch_1', ['flow_1'])];
      const snapshot = createTestAttributionSnapshot([
        { flowId: 'flow_1', partyId: 'party_1', partyType: AttributionPartyType.PLATFORM },
      ]);

      const input = {
        sessionInput: {
          sessionId: createGreyAuditSessionId(1000, 'test'),
          periodId: createReconciliationPeriodId('period_1') as ReconciliationPeriodId,
          auditTimestamp: 2000,
        },
        flowData: createAuditFlowData(flows),
        rechargeData: createAuditRechargeData(recharges, links),
        attributionData: createAuditAttributionData(snapshot),
      };

      const result = runAudit(input);
      expect(result.success).toBe(true);

      if (result.success) {
        const verifyResult = verifyAuditReproducibility(input, result.value);
        expect(verifyResult.success).toBe(true);
        if (verifyResult.success) {
          expect(verifyResult.value).toBe(true);
        }
      }
    });
  });
});

// ============================================================================
// AUDIT VIEWS TESTS
// ============================================================================

describe('GreyAuditViews', () => {
  let testOutput: ReturnType<typeof runAudit>;

  beforeEach(() => {
    const flows = [
      createTestFlowRecord('flow_1', 1000),
      createTestFlowRecord('flow_2', 2000),
      createTestFlowRecord('flow_3', 3000, GreyFlowStatus.PENDING),
    ];

    const recharges = [createTestRechargeRecord('rch_1', 1000, 'party_1')];
    const links = [createTestLink('link_1', 'rch_1', ['flow_1'])];
    const snapshot = createTestAttributionSnapshot([
      { flowId: 'flow_1', partyId: 'party_club1', partyType: AttributionPartyType.CLUB },
      { flowId: 'flow_2', partyId: 'party_agent1', partyType: AttributionPartyType.AGENT },
    ]);

    const input = {
      sessionInput: {
        sessionId: createGreyAuditSessionId(1000, 'test'),
        periodId: createReconciliationPeriodId('period_1') as ReconciliationPeriodId,
        auditTimestamp: 2000,
      },
      flowData: createAuditFlowData(flows),
      rechargeData: createAuditRechargeData(recharges, links),
      attributionData: createAuditAttributionData(snapshot),
    };

    testOutput = runAudit(input);
  });

  it('should get audit summary by period', () => {
    expect(testOutput.success).toBe(true);
    if (!testOutput.success) return;

    const summary = getAuditSummaryByPeriod(testOutput.value);

    expect(summary.totalFlows).toBe(3);
    expect(summary.checksum).toBeDefined();
    expect(summary.passRateBasisPoints).toBeGreaterThanOrEqual(0);
  });

  it('should get all club audit summaries', () => {
    expect(testOutput.success).toBe(true);
    if (!testOutput.success) return;

    const summaries = getAllClubAuditSummaries(testOutput.value);

    expect(summaries.length).toBeGreaterThanOrEqual(0);
    for (const summary of summaries) {
      expect(summary.partyType).toBe(AttributionPartyType.CLUB);
    }
  });

  it('should get all agent audit summaries', () => {
    expect(testOutput.success).toBe(true);
    if (!testOutput.success) return;

    const summaries = getAllAgentAuditSummaries(testOutput.value);

    expect(summaries.length).toBeGreaterThanOrEqual(0);
    for (const summary of summaries) {
      expect(summary.partyType).toBe(AttributionPartyType.AGENT);
    }
  });

  it('should get audit exception list', () => {
    expect(testOutput.success).toBe(true);
    if (!testOutput.success) return;

    const exceptions = getAuditExceptionList(testOutput.value);

    expect(exceptions.totalExceptions).toBeGreaterThanOrEqual(0);
    expect(exceptions.checksum).toBeDefined();
  });

  it('should get audit status breakdown', () => {
    expect(testOutput.success).toBe(true);
    if (!testOutput.success) return;

    const breakdown = getAuditStatusBreakdown(testOutput.value);

    expect(breakdown.byStatus.length).toBe(4); // MATCHED, PARTIAL, MISSING, ORPHAN
    expect(breakdown.checksum).toBeDefined();
  });

  it('should get audit flag breakdown', () => {
    expect(testOutput.success).toBe(true);
    if (!testOutput.success) return;

    const breakdown = getAuditFlagBreakdown(testOutput.value);

    expect(breakdown.checksum).toBeDefined();
  });

  it('should get flow correlation trace', () => {
    expect(testOutput.success).toBe(true);
    if (!testOutput.success) return;

    const trace = getFlowCorrelationTrace(
      testOutput.value,
      createGreyFlowId('flow_1') as GreyFlowId
    );

    expect(trace).not.toBeNull();
    if (trace) {
      expect(trace.greyFlowId).toBe('flow_1');
      expect(trace.correlationSummary).toBeDefined();
    }
  });

  it('should get all correlation traces', () => {
    expect(testOutput.success).toBe(true);
    if (!testOutput.success) return;

    const traces = getAllCorrelationTraces(testOutput.value);

    expect(traces.length).toBe(3);
  });
});

// ============================================================================
// BOUNDARY GUARD TESTS
// ============================================================================

describe('GreyAuditBoundaryGuards', () => {
  it('should find forbidden concepts', () => {
    const found = findForbiddenConcepts('This mentions payment and wallet');
    expect(found).toContain('payment');
    expect(found).toContain('wallet');
  });

  it('should not find forbidden concepts in clean text', () => {
    const found = findForbiddenConcepts('This is a clean reference mapping');
    expect(found.length).toBe(0);
  });

  it('should assert no forbidden concepts', () => {
    const cleanResult = assertNoForbiddenConcepts('clean text', 'field');
    expect(cleanResult.success).toBe(true);

    const dirtyResult = assertNoForbiddenConcepts('payment system', 'field');
    expect(dirtyResult.success).toBe(false);
  });

  it('should assert integer values', () => {
    expect(assertInteger(42, 'field').success).toBe(true);
    expect(assertInteger(42.5, 'field').success).toBe(false);
    expect(assertInteger(NaN, 'field').success).toBe(false);
  });

  it('should assert valid timestamp', () => {
    expect(assertValidTimestamp(1000, 'field').success).toBe(true);
    expect(assertValidTimestamp(0, 'field').success).toBe(false);
    expect(assertValidTimestamp(-1, 'field').success).toBe(false);
  });

  it('should have balance math blocked documentation', () => {
    expect(BALANCE_MATH_BLOCKED.message).toBeDefined();
    expect(BALANCE_MATH_BLOCKED.blockedOperations).toContain('addToBalance');
    expect(BALANCE_MATH_BLOCKED.blockedOperations).toContain('credit');
  });

  it('should have mutation blocked documentation', () => {
    expect(MUTATION_BLOCKED.message).toBeDefined();
    expect(MUTATION_BLOCKED.blockedOperations).toContain('appendFlow');
    expect(MUTATION_BLOCKED.blockedOperations).toContain('confirmFlow');
  });

  it('should have complete boundary guard documentation', () => {
    expect(AUDIT_BOUNDARY_GUARD_DOCUMENTATION.title).toBeDefined();
    expect(AUDIT_BOUNDARY_GUARD_DOCUMENTATION.guards.length).toBeGreaterThan(0);
    expect(AUDIT_BOUNDARY_GUARD_DOCUMENTATION.invariants.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// PURE CORRELATION TESTS
// ============================================================================

describe('Pure Correlation (No Value Computation)', () => {
  it('should not modify input flow data', () => {
    const flows = [createTestFlowRecord('flow_1', 1000)];
    const originalFlowsJson = JSON.stringify(flows);

    const input = {
      sessionInput: {
        sessionId: createGreyAuditSessionId(1000, 'test'),
        periodId: createReconciliationPeriodId('period_1') as ReconciliationPeriodId,
        auditTimestamp: 2000,
      },
      flowData: createAuditFlowData(flows),
      rechargeData: createAuditRechargeData([], []),
      attributionData: createAuditAttributionData(null),
    };

    runAudit(input);

    // Verify flows unchanged
    expect(JSON.stringify(flows)).toBe(originalFlowsJson);
  });

  it('should not modify input recharge data', () => {
    const recharges = [createTestRechargeRecord('rch_1', 1000, 'party_1')];
    const originalJson = JSON.stringify(recharges);

    const input = {
      sessionInput: {
        sessionId: createGreyAuditSessionId(1000, 'test'),
        periodId: createReconciliationPeriodId('period_1') as ReconciliationPeriodId,
        auditTimestamp: 2000,
      },
      flowData: createAuditFlowData([]),
      rechargeData: createAuditRechargeData(recharges, []),
      attributionData: createAuditAttributionData(null),
    };

    runAudit(input);

    // Verify recharges unchanged
    expect(JSON.stringify(recharges)).toBe(originalJson);
  });

  it('should not modify input attribution data', () => {
    const snapshot = createTestAttributionSnapshot([
      { flowId: 'flow_1', partyId: 'party_1', partyType: AttributionPartyType.PLATFORM },
    ]);
    const originalJson = JSON.stringify(snapshot);

    const input = {
      sessionInput: {
        sessionId: createGreyAuditSessionId(1000, 'test'),
        periodId: createReconciliationPeriodId('period_1') as ReconciliationPeriodId,
        auditTimestamp: 2000,
      },
      flowData: createAuditFlowData([]),
      rechargeData: createAuditRechargeData([], []),
      attributionData: createAuditAttributionData(snapshot),
    };

    runAudit(input);

    // Verify snapshot unchanged
    expect(JSON.stringify(snapshot)).toBe(originalJson);
  });

  it('should produce frozen output', () => {
    const input = {
      sessionInput: {
        sessionId: createGreyAuditSessionId(1000, 'test'),
        periodId: createReconciliationPeriodId('period_1') as ReconciliationPeriodId,
        auditTimestamp: 2000,
      },
      flowData: createAuditFlowData([createTestFlowRecord('flow_1', 1000)]),
      rechargeData: createAuditRechargeData([], []),
      attributionData: createAuditAttributionData(null),
    };

    const result = runAudit(input);
    expect(result.success).toBe(true);

    if (result.success) {
      expect(Object.isFrozen(result.value)).toBe(true);
      expect(Object.isFrozen(result.value.summary)).toBe(true);
      expect(Object.isFrozen(result.value.rows)).toBe(true);
    }
  });
});

// ============================================================================
// DETERMINISTIC REPLAY TESTS
// ============================================================================

describe('Deterministic Replay Safety', () => {
  it('should produce identical output across multiple runs', () => {
    const flows = [
      createTestFlowRecord('flow_1', 1000),
      createTestFlowRecord('flow_2', 2000),
      createTestFlowRecord('flow_3', 3000),
    ];

    const recharges = [
      createTestRechargeRecord('rch_1', 1000, 'party_1'),
      createTestRechargeRecord('rch_2', 2000, 'party_2'),
    ];

    const links = [
      createTestLink('link_1', 'rch_1', ['flow_1']),
      createTestLink('link_2', 'rch_2', ['flow_2', 'flow_3']),
    ];

    const snapshot = createTestAttributionSnapshot([
      { flowId: 'flow_1', partyId: 'party_club1', partyType: AttributionPartyType.CLUB },
      { flowId: 'flow_2', partyId: 'party_agent1', partyType: AttributionPartyType.AGENT },
      { flowId: 'flow_3', partyId: 'party_platform', partyType: AttributionPartyType.PLATFORM },
    ]);

    const input = {
      sessionInput: {
        sessionId: createGreyAuditSessionId(1000, 'test'),
        periodId: createReconciliationPeriodId('period_1') as ReconciliationPeriodId,
        auditTimestamp: 2000,
      },
      flowData: createAuditFlowData(flows),
      rechargeData: createAuditRechargeData(recharges, links),
      attributionData: createAuditAttributionData(snapshot),
    };

    // Run 5 times
    const results: string[] = [];
    for (let i = 0; i < 5; i++) {
      const result = runAudit(input);
      expect(result.success).toBe(true);
      if (result.success) {
        results.push(result.value.summary.checksum);
      }
    }

    // All checksums should be identical
    for (let i = 1; i < results.length; i++) {
      expect(results[i]).toBe(results[0]);
    }
  });

  it('should maintain row order deterministically', () => {
    // Create flows in random order
    const flows = [
      createTestFlowRecord('flow_z', 1000),
      createTestFlowRecord('flow_a', 2000),
      createTestFlowRecord('flow_m', 3000),
    ];

    const input = {
      sessionInput: {
        sessionId: createGreyAuditSessionId(1000, 'test'),
        periodId: createReconciliationPeriodId('period_1') as ReconciliationPeriodId,
        auditTimestamp: 2000,
      },
      flowData: createAuditFlowData(flows),
      rechargeData: createAuditRechargeData([], []),
      attributionData: createAuditAttributionData(null),
    };

    const result = runAudit(input);
    expect(result.success).toBe(true);

    if (result.success) {
      // Rows should be sorted by flow ID
      expect(result.value.rows[0].greyFlowId).toBe('flow_a');
      expect(result.value.rows[1].greyFlowId).toBe('flow_m');
      expect(result.value.rows[2].greyFlowId).toBe('flow_z');
    }
  });
});

// ============================================================================
// EMPTY INPUT TESTS
// ============================================================================

describe('Empty Input Handling', () => {
  it('should handle empty flow list', () => {
    const input = {
      sessionInput: {
        sessionId: createGreyAuditSessionId(1000, 'test'),
        periodId: createReconciliationPeriodId('period_1') as ReconciliationPeriodId,
        auditTimestamp: 2000,
      },
      flowData: createAuditFlowData([]),
      rechargeData: createAuditRechargeData([], []),
      attributionData: createAuditAttributionData(null),
    };

    const result = runAudit(input);
    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.value.rows.length).toBe(0);
      expect(result.value.summary.totalRows).toBe(0);
      expect(result.value.summary.passed).toBe(true);
    }
  });

  it('should handle null attribution snapshot', () => {
    const flows = [createTestFlowRecord('flow_1', 1000)];

    const input = {
      sessionInput: {
        sessionId: createGreyAuditSessionId(1000, 'test'),
        periodId: createReconciliationPeriodId('period_1') as ReconciliationPeriodId,
        auditTimestamp: 2000,
      },
      flowData: createAuditFlowData(flows),
      rechargeData: createAuditRechargeData([], []),
      attributionData: createAuditAttributionData(null),
    };

    const result = runAudit(input);
    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.value.rows[0].flags).toContain(AuditFlag.FLOW_NO_ATTRIBUTION);
    }
  });
});
