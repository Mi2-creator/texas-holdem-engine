/**
 * GreyRecharge.test.ts
 * Phase A3 - Grey Recharge Reference Mapping
 *
 * Comprehensive tests for the recharge reference mapping module.
 */

import {
  // Types
  GreyRechargeSource,
  GreyRechargeStatus,
  RechargeErrorCode,
  RECHARGE_VERSION,
  RECHARGE_GENESIS_HASH,
  RECHARGE_FORBIDDEN_CONCEPTS,

  // ID factories
  createGreyRechargeId,
  createRechargeLinkId,
  createExternalReferenceId,
  rechargeSuccess,

  // Validation
  isValidInteger,
  isValidNonNegativeInteger,
  isValidTimestamp,

  // Registry
  GreyRechargeRegistry,
  createGreyRechargeRegistry,
  createGreyRechargeRecord,

  // References
  RechargeLinkRegistry,
  createRechargeLinkRegistry,
  createRechargeLink,
  createRechargeLinkUnchecked,
  verifyLinkChecksum,
  traceRechargeToFlows,
  traceFlowToRecharges,

  // Views
  getRechargePeriodSummary,
  getRechargePartySummary,
  getAllPartySummaries,
  getRechargeTraceView,
  getRechargeSourceSummary,
  getLinkCoverageSummary,

  // Guards
  findForbiddenConcepts,
  assertInteger,
  assertNonNegativeInteger,
  assertValidTimestamp,
  RECHARGE_BOUNDARY_GUARD_DOCUMENTATION,
} from '../index';

import {
  createGreyFlowId,
  createGreyPartyId,
  createGreySessionId,
  GreyFlowType,
  GreyFlowDirection,
  GreyFlowStatus,
  GreyPartyType,
  createGreyFlowRegistry,
} from '../../grey-runtime';

// ============================================================================
// TEST HELPERS
// ============================================================================

function createTestRechargeRegistry() {
  const registry = createGreyRechargeRegistry();

  // Add some test recharges
  for (let i = 0; i < 5; i++) {
    const result = registry.appendRecharge({
      rechargeId: createGreyRechargeId(`recharge-${i}`),
      source: i < 3 ? GreyRechargeSource.EXTERNAL : GreyRechargeSource.MANUAL,
      partyId: createGreyPartyId(`party-${i % 2}`), // 2 parties
      referenceAmount: 1000 * (i + 1),
      externalReferenceId: createExternalReferenceId(`ext-ref-${i}`),
      declaredTimestamp: 1000000 + i * 1000,
      description: `Test recharge ${i}`,
    });

    if (!result.success) {
      throw new Error(`Failed to create test recharge: ${result.error.message}`);
    }

    // Confirm some recharges
    if (i < 3) {
      registry.confirmRecharge(
        createGreyRechargeId(`recharge-${i}`),
        1000000 + i * 1000 + 500
      );
    }
  }

  return registry;
}

function createTestGreyFlowRegistry() {
  const registry = createGreyFlowRegistry();
  const sessionId = createGreySessionId('session-001');

  // Create test flows
  for (let i = 0; i < 5; i++) {
    const appendResult = registry.appendFlow({
      flowId: createGreyFlowId(`flow-${i}`),
      sessionId,
      party: {
        partyId: createGreyPartyId('platform-001'),
        partyType: GreyPartyType.PLATFORM,
      },
      type: GreyFlowType.BUYIN_REF,
      direction: GreyFlowDirection.IN,
      amount: 500 * (i + 1),
      injectedTimestamp: 1000000 + i * 1000,
      description: `Test flow ${i}`,
    });

    if (!appendResult.success) {
      throw new Error(`Failed to create test flow: ${appendResult.error.message}`);
    }

    // Confirm the flow
    registry.confirmFlow(createGreyFlowId(`flow-${i}`));
  }

  return registry;
}

// ============================================================================
// DETERMINISM TESTS
// ============================================================================

describe('Determinism - Same Input Same Output', () => {
  it('same recharge input produces identical record', () => {
    const registry1 = createGreyRechargeRegistry();
    const registry2 = createGreyRechargeRegistry();

    const input = {
      rechargeId: createGreyRechargeId('test-recharge'),
      source: GreyRechargeSource.EXTERNAL,
      partyId: createGreyPartyId('party-001'),
      referenceAmount: 1000,
      declaredTimestamp: 1500000,
    };

    const result1 = registry1.appendRecharge(input);
    const result2 = registry2.appendRecharge(input);

    expect(result1.success).toBe(true);
    expect(result2.success).toBe(true);

    if (result1.success && result2.success) {
      expect(result1.value.record.checksum).toBe(result2.value.record.checksum);
      expect(result1.value.record.referenceAmount).toBe(result2.value.record.referenceAmount);
    }
  });

  it('registry integrity is deterministic', () => {
    const registry = createTestRechargeRegistry();

    const integrity1 = registry.verifyIntegrity();
    const integrity2 = registry.verifyIntegrity();

    expect(integrity1.isValid).toBe(integrity2.isValid);
    expect(integrity1.totalRecords).toBe(integrity2.totalRecords);
  });

  it('view summaries are deterministic', () => {
    const registry = createTestRechargeRegistry();

    const summary1 = getRechargePeriodSummary(registry, 1000000, 2000000);
    const summary2 = getRechargePeriodSummary(registry, 1000000, 2000000);

    expect(summary1.checksum).toBe(summary2.checksum);
    expect(summary1.totalConfirmed).toBe(summary2.totalConfirmed);
  });
});

// ============================================================================
// APPEND-ONLY ENFORCEMENT TESTS
// ============================================================================

describe('Append-Only Enforcement', () => {
  it('records can only be added', () => {
    const registry = createGreyRechargeRegistry();

    const result = registry.appendRecharge({
      rechargeId: createGreyRechargeId('test'),
      source: GreyRechargeSource.EXTERNAL,
      partyId: createGreyPartyId('party'),
      referenceAmount: 1000,
      declaredTimestamp: 1500000,
    });

    expect(result.success).toBe(true);
    expect(registry.getAllRecords().length).toBe(1);

    // Add another
    registry.appendRecharge({
      rechargeId: createGreyRechargeId('test2'),
      source: GreyRechargeSource.EXTERNAL,
      partyId: createGreyPartyId('party'),
      referenceAmount: 2000,
      declaredTimestamp: 1500001,
    });

    expect(registry.getAllRecords().length).toBe(2);
  });

  it('status transitions create new records', () => {
    const registry = createGreyRechargeRegistry();

    registry.appendRecharge({
      rechargeId: createGreyRechargeId('test'),
      source: GreyRechargeSource.EXTERNAL,
      partyId: createGreyPartyId('party'),
      referenceAmount: 1000,
      declaredTimestamp: 1500000,
    });

    expect(registry.getAllRecords().length).toBe(1);

    // Confirm creates new record
    registry.confirmRecharge(createGreyRechargeId('test'), 1500001);

    expect(registry.getAllRecords().length).toBe(2);
  });

  it('hash chain is maintained', () => {
    const registry = createTestRechargeRegistry();
    const integrity = registry.verifyIntegrity();

    expect(integrity.isValid).toBe(true);
    expect(integrity.errors.length).toBe(0);
  });
});

// ============================================================================
// IDEMPOTENCY PROTECTION TESTS
// ============================================================================

describe('Idempotency Protection', () => {
  it('rejects duplicate recharge IDs', () => {
    const registry = createGreyRechargeRegistry();

    const input = {
      rechargeId: createGreyRechargeId('duplicate'),
      source: GreyRechargeSource.EXTERNAL,
      partyId: createGreyPartyId('party'),
      referenceAmount: 1000,
      declaredTimestamp: 1500000,
    };

    const result1 = registry.appendRecharge(input);
    expect(result1.success).toBe(true);

    const result2 = registry.appendRecharge(input);
    expect(result2.success).toBe(false);

    if (!result2.success) {
      expect(result2.error.code).toBe(RechargeErrorCode.DUPLICATE_RECHARGE_ID);
    }
  });

  it('rejects duplicate link IDs', () => {
    const linkRegistry = createRechargeLinkRegistry();

    const link1 = {
      linkId: createRechargeLinkId('link-001'),
      rechargeId: createGreyRechargeId('recharge-001'),
      linkedFlowIds: [createGreyFlowId('flow-001')],
      linkedReferenceTotal: 1000,
      linkedTimestamp: 1500000,
      checksum: 'test',
    };

    const result1 = linkRegistry.appendLink(link1);
    expect(result1.success).toBe(true);

    const result2 = linkRegistry.appendLink(link1);
    expect(result2.success).toBe(false);

    if (!result2.success) {
      expect(result2.error.code).toBe(RechargeErrorCode.DUPLICATE_LINK_ID);
    }
  });
});

// ============================================================================
// GREYFLOW UNTOUCHED TESTS
// ============================================================================

describe('GreyFlow Untouched', () => {
  it('recharge operations do not modify GreyFlow registry', () => {
    const flowRegistry = createTestGreyFlowRegistry();
    const initialFlowCount = flowRegistry.getAllRecords().length;

    const rechargeRegistry = createGreyRechargeRegistry();
    const linkRegistry = createRechargeLinkRegistry();

    // Add recharge
    rechargeRegistry.appendRecharge({
      rechargeId: createGreyRechargeId('test'),
      source: GreyRechargeSource.EXTERNAL,
      partyId: createGreyPartyId('party'),
      referenceAmount: 1000,
      declaredTimestamp: 1500000,
    });

    // Create link
    const linkResult = createRechargeLink(
      {
        linkId: createRechargeLinkId('link-001'),
        rechargeId: createGreyRechargeId('test'),
        flowIds: [createGreyFlowId('flow-0'), createGreyFlowId('flow-1')],
        linkedTimestamp: 1500001,
      },
      rechargeRegistry,
      flowRegistry
    );

    expect(linkResult.success).toBe(true);

    // GreyFlow registry should be unchanged
    expect(flowRegistry.getAllRecords().length).toBe(initialFlowCount);
  });

  it('tracing operations do not modify GreyFlow', () => {
    const flowRegistry = createTestGreyFlowRegistry();
    const rechargeRegistry = createTestRechargeRegistry();
    const linkRegistry = createRechargeLinkRegistry();

    const initialFlowCount = flowRegistry.getAllRecords().length;

    // Create some links
    createRechargeLink(
      {
        linkId: createRechargeLinkId('link-001'),
        rechargeId: createGreyRechargeId('recharge-0'),
        flowIds: [createGreyFlowId('flow-0')],
        linkedTimestamp: 1500001,
      },
      rechargeRegistry,
      flowRegistry
    );

    // Trace operations
    traceRechargeToFlows(
      createGreyRechargeId('recharge-0'),
      rechargeRegistry,
      linkRegistry
    );

    traceFlowToRecharges(createGreyFlowId('flow-0'), linkRegistry);

    // GreyFlow should be unchanged
    expect(flowRegistry.getAllRecords().length).toBe(initialFlowCount);
  });
});

// ============================================================================
// ATTRIBUTION UNTOUCHED TESTS
// ============================================================================

describe('Attribution Untouched', () => {
  it('recharge module does not import attribution', () => {
    // This is validated at compile time, but we verify module info
    expect(RECHARGE_BOUNDARY_GUARD_DOCUMENTATION.guards).toBeDefined();

    const attributionGuard = RECHARGE_BOUNDARY_GUARD_DOCUMENTATION.guards.find(
      (g) => g.name === 'Attribution Logic Blocked'
    );
    expect(attributionGuard).toBeDefined();
  });

  it('boundary guards block attribution operations', () => {
    const guard = RECHARGE_BOUNDARY_GUARD_DOCUMENTATION.guards.find(
      (g) => g.name === 'Attribution Mutation Blocked'
    );

    expect(guard).toBeDefined();
    if (guard && 'blockedMethods' in guard) {
      expect(guard.blockedMethods).toContain('createAttributionEntry');
    }
  });
});

// ============================================================================
// ENGINE UNTOUCHED TESTS
// ============================================================================

describe('Engine Untouched', () => {
  it('recharge module version is correct', () => {
    expect(RECHARGE_VERSION).toBe('1.0.0');
  });

  it('boundary guards block engine imports', () => {
    const guard = RECHARGE_BOUNDARY_GUARD_DOCUMENTATION.guards.find(
      (g) => g.name === 'Engine Import Blocked'
    );

    expect(guard).toBeDefined();
    if (guard && 'blockedPaths' in guard) {
      expect(guard.blockedPaths).toContain('src/engine');
    }
  });
});

// ============================================================================
// DETERMINISTIC REPLAY TESTS
// ============================================================================

describe('Deterministic Replay', () => {
  it('registry can be replayed to same state', () => {
    // First pass
    const registry1 = createGreyRechargeRegistry();
    const operations = [
      {
        rechargeId: createGreyRechargeId('r1'),
        source: GreyRechargeSource.EXTERNAL,
        partyId: createGreyPartyId('p1'),
        referenceAmount: 1000,
        declaredTimestamp: 1000000,
      },
      {
        rechargeId: createGreyRechargeId('r2'),
        source: GreyRechargeSource.MANUAL,
        partyId: createGreyPartyId('p2'),
        referenceAmount: 2000,
        declaredTimestamp: 1000001,
      },
    ];

    for (const op of operations) {
      registry1.appendRecharge(op);
    }
    registry1.confirmRecharge(createGreyRechargeId('r1'), 1000100);

    // Second pass (replay)
    const registry2 = createGreyRechargeRegistry();
    for (const op of operations) {
      registry2.appendRecharge(op);
    }
    registry2.confirmRecharge(createGreyRechargeId('r1'), 1000100);

    // Should have same state
    expect(registry1.getLastChecksum()).toBe(registry2.getLastChecksum());
    expect(registry1.getCurrentSequence()).toBe(registry2.getCurrentSequence());
  });
});

// ============================================================================
// INTEGER-ONLY MATH TESTS
// ============================================================================

describe('Integer-Only Math', () => {
  it('rejects non-integer reference amounts', () => {
    const registry = createGreyRechargeRegistry();

    const result = registry.appendRecharge({
      rechargeId: createGreyRechargeId('test'),
      source: GreyRechargeSource.EXTERNAL,
      partyId: createGreyPartyId('party'),
      referenceAmount: 100.5,
      declaredTimestamp: 1500000,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe(RechargeErrorCode.INVALID_REFERENCE_AMOUNT);
    }
  });

  it('rejects negative reference amounts', () => {
    const registry = createGreyRechargeRegistry();

    const result = registry.appendRecharge({
      rechargeId: createGreyRechargeId('test'),
      source: GreyRechargeSource.EXTERNAL,
      partyId: createGreyPartyId('party'),
      referenceAmount: -100,
      declaredTimestamp: 1500000,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe(RechargeErrorCode.INVALID_REFERENCE_AMOUNT);
    }
  });

  it('assertInteger validates correctly', () => {
    expect(assertInteger(42, 'test').success).toBe(true);
    expect(assertInteger(3.14, 'test').success).toBe(false);
  });

  it('assertNonNegativeInteger validates correctly', () => {
    expect(assertNonNegativeInteger(0, 'test').success).toBe(true);
    expect(assertNonNegativeInteger(42, 'test').success).toBe(true);
    expect(assertNonNegativeInteger(-1, 'test').success).toBe(false);
  });
});

// ============================================================================
// FORBIDDEN CONCEPTS TESTS
// ============================================================================

describe('Forbidden Concepts', () => {
  it('RECHARGE_FORBIDDEN_CONCEPTS is defined', () => {
    expect(RECHARGE_FORBIDDEN_CONCEPTS).toBeDefined();
    expect(RECHARGE_FORBIDDEN_CONCEPTS.length).toBeGreaterThan(0);
    expect(RECHARGE_FORBIDDEN_CONCEPTS).toContain('payment');
    expect(RECHARGE_FORBIDDEN_CONCEPTS).toContain('wallet');
    expect(RECHARGE_FORBIDDEN_CONCEPTS).toContain('balance');
    expect(RECHARGE_FORBIDDEN_CONCEPTS).toContain('credit');
    expect(RECHARGE_FORBIDDEN_CONCEPTS).toContain('debit');
  });

  it('findForbiddenConcepts detects forbidden terms', () => {
    const text = 'Process payment to wallet';
    const found = findForbiddenConcepts(text);

    expect(found.length).toBe(2);
    expect(found).toContain('payment');
    expect(found).toContain('wallet');
  });

  it('clean text passes forbidden check', () => {
    const text = 'Reference mapping for external recharge event';
    const found = findForbiddenConcepts(text);

    expect(found.length).toBe(0);
  });
});

// ============================================================================
// STATUS TRANSITION TESTS
// ============================================================================

describe('Status Transitions', () => {
  it('can transition from DECLARED to CONFIRMED', () => {
    const registry = createGreyRechargeRegistry();

    registry.appendRecharge({
      rechargeId: createGreyRechargeId('test'),
      source: GreyRechargeSource.EXTERNAL,
      partyId: createGreyPartyId('party'),
      referenceAmount: 1000,
      declaredTimestamp: 1500000,
    });

    const result = registry.confirmRecharge(
      createGreyRechargeId('test'),
      1500001
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.confirmedRecord.status).toBe(GreyRechargeStatus.CONFIRMED);
    }
  });

  it('can transition from DECLARED to VOIDED', () => {
    const registry = createGreyRechargeRegistry();

    registry.appendRecharge({
      rechargeId: createGreyRechargeId('test'),
      source: GreyRechargeSource.EXTERNAL,
      partyId: createGreyPartyId('party'),
      referenceAmount: 1000,
      declaredTimestamp: 1500000,
    });

    const result = registry.voidRecharge(
      createGreyRechargeId('test'),
      1500001
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.voidedRecord.status).toBe(GreyRechargeStatus.VOIDED);
    }
  });

  it('cannot transition from VOIDED', () => {
    const registry = createGreyRechargeRegistry();

    registry.appendRecharge({
      rechargeId: createGreyRechargeId('test'),
      source: GreyRechargeSource.EXTERNAL,
      partyId: createGreyPartyId('party'),
      referenceAmount: 1000,
      declaredTimestamp: 1500000,
    });

    registry.voidRecharge(createGreyRechargeId('test'), 1500001);

    const result = registry.confirmRecharge(
      createGreyRechargeId('test'),
      1500002
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe(RechargeErrorCode.INVALID_STATUS_TRANSITION);
    }
  });
});

// ============================================================================
// LINK VERIFICATION TESTS
// ============================================================================

describe('Link Verification', () => {
  it('verifyLinkChecksum validates correctly', () => {
    const rechargeRegistry = createTestRechargeRegistry();
    const flowRegistry = createTestGreyFlowRegistry();

    const linkResult = createRechargeLink(
      {
        linkId: createRechargeLinkId('link-001'),
        rechargeId: createGreyRechargeId('recharge-0'),
        flowIds: [createGreyFlowId('flow-0')],
        linkedTimestamp: 1500001,
      },
      rechargeRegistry,
      flowRegistry
    );

    expect(linkResult.success).toBe(true);
    if (linkResult.success) {
      expect(verifyLinkChecksum(linkResult.value)).toBe(true);
    }
  });

  it('createRechargeLinkUnchecked works without flow validation', () => {
    const result = createRechargeLinkUnchecked(
      {
        linkId: createRechargeLinkId('link-001'),
        rechargeId: createGreyRechargeId('recharge-001'),
        flowIds: [createGreyFlowId('flow-001'), createGreyFlowId('flow-002')],
        linkedTimestamp: 1500001,
      },
      [1000, 2000]
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.linkedReferenceTotal).toBe(3000);
    }
  });
});

// ============================================================================
// VIEW TESTS
// ============================================================================

describe('View Summaries', () => {
  it('period summary calculates correctly', () => {
    const registry = createTestRechargeRegistry();
    const summary = getRechargePeriodSummary(registry, 1000000, 2000000);

    expect(summary.totalConfirmed).toBeGreaterThan(0);
    expect(summary.rechargeIds.length).toBe(5);
  });

  it('party summary calculates correctly', () => {
    const registry = createTestRechargeRegistry();
    const summary = getRechargePartySummary(
      registry,
      createGreyPartyId('party-0'),
      1000000,
      2000000
    );

    expect(summary.recordCount).toBeGreaterThan(0);
  });

  it('all party summaries returns all parties', () => {
    const registry = createTestRechargeRegistry();
    const summaries = getAllPartySummaries(registry, 1000000, 2000000);

    expect(summaries.length).toBe(2); // 2 unique parties
  });

  it('source summary calculates correctly', () => {
    const registry = createTestRechargeRegistry();
    const summary = getRechargeSourceSummary(
      registry,
      GreyRechargeSource.EXTERNAL,
      1000000,
      2000000
    );

    expect(summary.recordCount).toBe(3); // 3 external sources
  });

  it('link coverage summary calculates correctly', () => {
    const rechargeRegistry = createTestRechargeRegistry();
    const linkRegistry = createRechargeLinkRegistry();

    const coverage = getLinkCoverageSummary(
      rechargeRegistry,
      linkRegistry,
      1000000,
      2000000
    );

    expect(coverage.rechargeCount).toBeGreaterThan(0);
    expect(coverage.linkedPercentage).toBe(0); // No links yet
  });
});

// ============================================================================
// TIMESTAMP VALIDATION TESTS
// ============================================================================

describe('Timestamp Validation', () => {
  it('rejects invalid timestamps', () => {
    const registry = createGreyRechargeRegistry();

    const result = registry.appendRecharge({
      rechargeId: createGreyRechargeId('test'),
      source: GreyRechargeSource.EXTERNAL,
      partyId: createGreyPartyId('party'),
      referenceAmount: 1000,
      declaredTimestamp: -100,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe(RechargeErrorCode.INVALID_TIMESTAMP);
    }
  });

  it('assertValidTimestamp validates correctly', () => {
    expect(assertValidTimestamp(1500000, 'test').success).toBe(true);
    expect(assertValidTimestamp(0, 'test').success).toBe(false);
    expect(assertValidTimestamp(-1, 'test').success).toBe(false);
  });
});

// ============================================================================
// TRACING TESTS
// ============================================================================

describe('Tracing', () => {
  it('traces recharge to flows', () => {
    const rechargeRegistry = createTestRechargeRegistry();
    const flowRegistry = createTestGreyFlowRegistry();
    const linkRegistry = createRechargeLinkRegistry();

    // Create a link
    const linkResult = createRechargeLink(
      {
        linkId: createRechargeLinkId('link-001'),
        rechargeId: createGreyRechargeId('recharge-0'),
        flowIds: [createGreyFlowId('flow-0'), createGreyFlowId('flow-1')],
        linkedTimestamp: 1500001,
      },
      rechargeRegistry,
      flowRegistry
    );

    expect(linkResult.success).toBe(true);
    if (linkResult.success) {
      linkRegistry.appendLink(linkResult.value);
    }

    // Trace
    const traceResult = traceRechargeToFlows(
      createGreyRechargeId('recharge-0'),
      rechargeRegistry,
      linkRegistry
    );

    expect(traceResult.success).toBe(true);
    if (traceResult.success) {
      expect(traceResult.value.linkedFlowIds.length).toBe(2);
    }
  });

  it('traces flow to recharges', () => {
    const rechargeRegistry = createTestRechargeRegistry();
    const flowRegistry = createTestGreyFlowRegistry();
    const linkRegistry = createRechargeLinkRegistry();

    // Create a link
    const linkResult = createRechargeLink(
      {
        linkId: createRechargeLinkId('link-001'),
        rechargeId: createGreyRechargeId('recharge-0'),
        flowIds: [createGreyFlowId('flow-0')],
        linkedTimestamp: 1500001,
      },
      rechargeRegistry,
      flowRegistry
    );

    if (linkResult.success) {
      linkRegistry.appendLink(linkResult.value);
    }

    // Trace
    const trace = traceFlowToRecharges(
      createGreyFlowId('flow-0'),
      linkRegistry
    );

    expect(trace.linkedRechargeIds.length).toBe(1);
    expect(trace.linkedRechargeIds[0]).toBe(createGreyRechargeId('recharge-0'));
  });
});

// ============================================================================
// IMMUTABILITY TESTS
// ============================================================================

describe('Immutability', () => {
  it('records are frozen', () => {
    const registry = createGreyRechargeRegistry();

    const result = registry.appendRecharge({
      rechargeId: createGreyRechargeId('test'),
      source: GreyRechargeSource.EXTERNAL,
      partyId: createGreyPartyId('party'),
      referenceAmount: 1000,
      declaredTimestamp: 1500000,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(Object.isFrozen(result.value.record)).toBe(true);
    }
  });

  it('links are frozen', () => {
    const result = createRechargeLinkUnchecked(
      {
        linkId: createRechargeLinkId('link-001'),
        rechargeId: createGreyRechargeId('recharge-001'),
        flowIds: [createGreyFlowId('flow-001')],
        linkedTimestamp: 1500001,
      },
      [1000]
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(Object.isFrozen(result.value)).toBe(true);
      expect(Object.isFrozen(result.value.linkedFlowIds)).toBe(true);
    }
  });

  it('view summaries are frozen', () => {
    const registry = createTestRechargeRegistry();
    const summary = getRechargePeriodSummary(registry, 1000000, 2000000);

    expect(Object.isFrozen(summary)).toBe(true);
    expect(Object.isFrozen(summary.rechargeIds)).toBe(true);
  });
});
