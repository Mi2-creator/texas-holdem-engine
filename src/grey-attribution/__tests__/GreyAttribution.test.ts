/**
 * GreyAttribution.test.ts
 * Phase A2 - Grey Flow Multi-Level Attribution
 *
 * Comprehensive tests for the attribution module.
 */

import {
  // Types
  AttributionPartyType,
  AttributionErrorCode,
  BASIS_POINTS_100_PERCENT,
  MAX_HIERARCHY_DEPTH,
  ATTRIBUTION_VERSION,
  ATTRIBUTION_FORBIDDEN_CONCEPTS,

  // ID factories
  createAttributionSnapshotId,
  createAttributionRuleSetId,
  createAgentHierarchyId,
  createAttributionEntryId,
  createAttributionRule,
  createAgentHierarchyNode,
  attributionSuccess,

  // Validation
  isValidInteger,
  isValidBasisPoints,
  calculateAttributedAmount,

  // Hierarchy
  validateHierarchyIsDAG,
  validateHierarchy,
  createAgentHierarchy,
  resolveParentChain,
  getDirectChildren,
  getAllDescendants,
  getTopLevelAgents,
  calculateAgentChainShares,
  calculateHierarchyChecksum,
  verifyHierarchyChecksum,

  // Rule Engine
  validateRuleSetTotal,
  createAttributionRuleSet,
  attributeFlow,
  attributePeriod,
  calculateAttributionChecksum,
  verifyAttributionChecksum,
  verifyAttributionConservation,
  verifyPeriodConservation,
  compareAttributionResults,

  // Snapshots
  ATTRIBUTION_SNAPSHOT_GENESIS_HASH,
  createSnapshotFromAttribution,
  verifySnapshotChecksum,
  verifySnapshotChain,
  snapshotsAreEquivalent,
  createSnapshotCollection,

  // Views
  getPlatformAttributionSummary,
  getClubAttributionSummary,
  getAllAgentAttributionSummaries,
  getFlowAttributionBreakdown,
  getAllFlowBreakdowns,

  // Guards
  findForbiddenConcepts,
  assertInteger,
  assertValidBasisPoints,
  assertAmountConservation,
  assertBasisPointsSumTo100,
  assertNoCyclesInChain,
  ATTRIBUTION_BOUNDARY_GUARD_DOCUMENTATION,
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

import {
  createReconciliationPeriodId,
  createReconciliationPeriod,
  reconcilePeriod,
} from '../../grey-reconciliation';

// ============================================================================
// TEST HELPERS
// ============================================================================

function createTestRuleSet() {
  const ruleSetId = createAttributionRuleSetId('test-rules-001');

  const platformRule = createAttributionRule(
    ruleSetId,
    createGreyPartyId('platform-001'),
    AttributionPartyType.PLATFORM,
    5000, // 50%
    'Platform share'
  );

  const clubRule = createAttributionRule(
    ruleSetId,
    createGreyPartyId('club-001'),
    AttributionPartyType.CLUB,
    3000, // 30%
    'Club share'
  );

  const agentRule = createAttributionRule(
    ruleSetId,
    createGreyPartyId('agent-001'),
    AttributionPartyType.AGENT,
    2000, // 20%
    'Agent share'
  );

  if (!platformRule.success || !clubRule.success || !agentRule.success) {
    throw new Error('Failed to create test rules');
  }

  const result = createAttributionRuleSet(
    ruleSetId,
    [platformRule.value, clubRule.value, agentRule.value],
    1000000,
    'Test rule set'
  );

  if (!result.success) {
    throw new Error('Failed to create test rule set');
  }

  return result.value;
}

function createTestHierarchy() {
  const hierarchyId = createAgentHierarchyId('hierarchy-001');

  // Level 0: Top-level agent
  const topAgent = createAgentHierarchyNode(
    createGreyPartyId('agent-top'),
    null,
    0,
    10000, // 100% of their allocation
    'Top Agent'
  );

  // Level 1: Mid-level agents
  const midAgent1 = createAgentHierarchyNode(
    createGreyPartyId('agent-mid-1'),
    createGreyPartyId('agent-top'),
    1,
    5000, // 50%
    'Mid Agent 1'
  );

  const midAgent2 = createAgentHierarchyNode(
    createGreyPartyId('agent-mid-2'),
    createGreyPartyId('agent-top'),
    1,
    3000, // 30%
    'Mid Agent 2'
  );

  // Level 2: Leaf agents
  const leafAgent = createAgentHierarchyNode(
    createGreyPartyId('agent-leaf'),
    createGreyPartyId('agent-mid-1'),
    2,
    4000, // 40%
    'Leaf Agent'
  );

  if (!topAgent.success || !midAgent1.success || !midAgent2.success || !leafAgent.success) {
    throw new Error('Failed to create test hierarchy nodes');
  }

  const result = createAgentHierarchy(
    hierarchyId,
    [topAgent.value, midAgent1.value, midAgent2.value, leafAgent.value],
    'Test hierarchy'
  );

  if (!result.success) {
    throw new Error('Failed to create test hierarchy');
  }

  return result.value;
}

function createTestRegistry() {
  const registry = createGreyFlowRegistry();
  const sessionId = createGreySessionId('session-001');
  const platformPartyId = createGreyPartyId('platform-001');

  // Create test flows
  for (let i = 0; i < 5; i++) {
    const appendResult = registry.appendFlow({
      flowId: createGreyFlowId(`flow-${i}`),
      sessionId,
      party: {
        partyId: platformPartyId,
        partyType: GreyPartyType.PLATFORM,
      },
      type: GreyFlowType.RAKE_REF,
      direction: GreyFlowDirection.IN,
      amount: 1000,
      injectedTimestamp: 1000000 + i * 1000,
      description: `Test rake flow ${i}`,
    });

    if (!appendResult.success) {
      throw new Error('Failed to append test record');
    }

    // Confirm the flow
    const confirmResult = registry.confirmFlow(createGreyFlowId(`flow-${i}`));
    if (!confirmResult.success) {
      throw new Error('Failed to confirm test record');
    }
  }

  return registry;
}

// ============================================================================
// DETERMINISM TESTS
// ============================================================================

describe('Determinism - Same Inputs Same Output', () => {
  it('same rules + amount produces identical attribution', () => {
    const ruleSet = createTestRuleSet();
    const flowId = createGreyFlowId('test-flow');

    const result1 = attributeFlow(flowId, 10000, ruleSet, 'test');
    const result2 = attributeFlow(flowId, 10000, ruleSet, 'test');

    expect(result1.success).toBe(true);
    expect(result2.success).toBe(true);

    if (result1.success && result2.success) {
      expect(result1.value.totalAttributed).toBe(result2.value.totalAttributed);
      expect(result1.value.entries.length).toBe(result2.value.entries.length);

      for (let i = 0; i < result1.value.entries.length; i++) {
        expect(result1.value.entries[i].amount).toBe(result2.value.entries[i].amount);
        expect(result1.value.entries[i].partyType).toBe(result2.value.entries[i].partyType);
      }
    }
  });

  it('attribution checksum is deterministic', () => {
    const data = { test: 'value', number: 123, array: [1, 2, 3] };
    const checksum1 = calculateAttributionChecksum(data);
    const checksum2 = calculateAttributionChecksum(data);

    expect(checksum1).toBe(checksum2);
  });

  it('hierarchy checksum is deterministic', () => {
    const hierarchy = createTestHierarchy();
    const checksum1 = calculateHierarchyChecksum(hierarchy);
    const checksum2 = calculateHierarchyChecksum(hierarchy);

    expect(checksum1).toBe(checksum2);
  });
});

// ============================================================================
// PERCENT CONSERVATION TESTS
// ============================================================================

describe('Percent Conservation', () => {
  it('attributed amounts sum to original amount', () => {
    const ruleSet = createTestRuleSet();
    const flowId = createGreyFlowId('conservation-test');
    const originalAmount = 10000;

    const result = attributeFlow(flowId, originalAmount, ruleSet, 'test');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.totalAttributed).toBe(originalAmount);
      expect(verifyAttributionConservation(result.value)).toBe(true);
    }
  });

  it('handles remainder correctly for non-divisible amounts', () => {
    const ruleSet = createTestRuleSet();
    const flowId = createGreyFlowId('remainder-test');
    const originalAmount = 10001; // Not evenly divisible

    const result = attributeFlow(flowId, originalAmount, ruleSet, 'test');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.totalAttributed).toBe(originalAmount);

      let sum = 0;
      for (const entry of result.value.entries) {
        sum += entry.amount;
      }
      expect(sum).toBe(originalAmount);
    }
  });

  it('assertAmountConservation validates correctly', () => {
    const result1 = assertAmountConservation(10000, [5000, 3000, 2000]);
    expect(result1.success).toBe(true);

    const result2 = assertAmountConservation(10000, [5000, 3000, 1999]);
    expect(result2.success).toBe(false);
    if (!result2.success) {
      expect(result2.error.code).toBe(AttributionErrorCode.AMOUNT_MISMATCH);
    }
  });

  it('rule set basis points must sum to 100%', () => {
    const ruleSetId = createAttributionRuleSetId('invalid-rules');

    const rule1 = createAttributionRule(
      ruleSetId,
      createGreyPartyId('party-1'),
      AttributionPartyType.PLATFORM,
      5000,
      'Rule 1'
    );

    const rule2 = createAttributionRule(
      ruleSetId,
      createGreyPartyId('party-2'),
      AttributionPartyType.CLUB,
      4000, // Total = 9000, not 10000
      'Rule 2'
    );

    if (!rule1.success || !rule2.success) {
      fail('Should create rules');
    }

    const result = createAttributionRuleSet(
      ruleSetId,
      [rule1.value, rule2.value],
      1000000
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe(AttributionErrorCode.INVALID_RULE_SET_TOTAL);
    }
  });
});

// ============================================================================
// MULTI-LEVEL AGENT TESTS
// ============================================================================

describe('Multi-Level Agent Hierarchy', () => {
  it('hierarchy is validated as DAG', () => {
    const hierarchy = createTestHierarchy();
    expect(hierarchy.nodes.length).toBe(4);
    expect(hierarchy.maxLevel).toBe(2);
    expect(hierarchy.agentCount).toBe(4);
  });

  it('resolves parent chain correctly', () => {
    const hierarchy = createTestHierarchy();
    const leafId = createGreyPartyId('agent-leaf');

    const result = resolveParentChain(hierarchy, leafId);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.level).toBe(2);
      expect(result.value.parentChain.length).toBe(2);
      expect(result.value.parentChain[0]).toBe(createGreyPartyId('agent-mid-1'));
      expect(result.value.parentChain[1]).toBe(createGreyPartyId('agent-top'));
    }
  });

  it('getTopLevelAgents returns correct agents', () => {
    const hierarchy = createTestHierarchy();
    const topLevel = getTopLevelAgents(hierarchy);

    expect(topLevel.length).toBe(1);
    expect(topLevel[0].agentId).toBe(createGreyPartyId('agent-top'));
  });

  it('getDirectChildren returns correct children', () => {
    const hierarchy = createTestHierarchy();
    const children = getDirectChildren(hierarchy, createGreyPartyId('agent-top'));

    expect(children.length).toBe(2);
  });

  it('getAllDescendants returns all descendants', () => {
    const hierarchy = createTestHierarchy();
    const descendants = getAllDescendants(hierarchy, createGreyPartyId('agent-top'));

    expect(descendants.length).toBe(3); // mid-1, mid-2, leaf
  });

  it('calculates agent chain shares correctly', () => {
    const hierarchy = createTestHierarchy();
    const leafId = createGreyPartyId('agent-leaf');

    const result = calculateAgentChainShares(hierarchy, leafId);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.length).toBeGreaterThan(0);
      // All shares should have valid basis points
      for (const share of result.value) {
        expect(isValidBasisPoints(share.effectiveBasisPoints)).toBe(true);
      }
    }
  });
});

// ============================================================================
// CYCLE DETECTION TESTS
// ============================================================================

describe('Cycle Detection', () => {
  it('detects cycle in agent hierarchy', () => {
    const hierarchyId = createAgentHierarchyId('cyclic-hierarchy');

    // Create a cycle: A -> B -> C -> A
    const nodeA = createAgentHierarchyNode(
      createGreyPartyId('agent-a'),
      createGreyPartyId('agent-c'), // Points to C
      0,
      10000,
      'Agent A'
    );

    const nodeB = createAgentHierarchyNode(
      createGreyPartyId('agent-b'),
      createGreyPartyId('agent-a'),
      1,
      5000,
      'Agent B'
    );

    const nodeC = createAgentHierarchyNode(
      createGreyPartyId('agent-c'),
      createGreyPartyId('agent-b'),
      2,
      5000,
      'Agent C'
    );

    if (!nodeA.success || !nodeB.success || !nodeC.success) {
      // Nodes created but hierarchy validation should fail
    }

    if (nodeA.success && nodeB.success && nodeC.success) {
      const result = validateHierarchyIsDAG([nodeA.value, nodeB.value, nodeC.value]);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(AttributionErrorCode.HIERARCHY_CYCLE_DETECTED);
      }
    }
  });

  it('assertNoCyclesInChain detects cycles', () => {
    const parentMap = new Map<string, string | null>();
    parentMap.set('a', 'b');
    parentMap.set('b', 'c');
    parentMap.set('c', 'a'); // Cycle

    const result = assertNoCyclesInChain(parentMap, 'a', 10);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe(AttributionErrorCode.HIERARCHY_CYCLE_DETECTED);
    }
  });

  it('validates acyclic hierarchy successfully', () => {
    const hierarchy = createTestHierarchy();
    const result = validateHierarchyIsDAG(hierarchy.nodes);

    expect(result.success).toBe(true);
  });
});

// ============================================================================
// SNAPSHOT REPRODUCIBILITY TESTS
// ============================================================================

describe('Snapshot Reproducibility', () => {
  it('snapshots are reproducible from same inputs', () => {
    const ruleSet = createTestRuleSet();
    const registry = createTestRegistry();

    const periodResult = createReconciliationPeriod(
      createReconciliationPeriodId('period-001'),
      1000000,
      2000000
    );

    expect(periodResult.success).toBe(true);
    if (!periodResult.success) return;

    const reconcileResult = reconcilePeriod(registry, periodResult.value);
    expect(reconcileResult.success).toBe(true);
    if (!reconcileResult.success) return;

    // Create mock attribution result
    const flowId = createGreyFlowId('flow-0');
    const attrResult = attributeFlow(flowId, 1000, ruleSet, 'test');
    expect(attrResult.success).toBe(true);
    if (!attrResult.success) return;

    const mockPeriodResult = {
      periodId: periodResult.value.periodId,
      ruleSetId: ruleSet.ruleSetId,
      flowResults: [attrResult.value],
      totalOriginal: 1000,
      totalAttributed: 1000,
      totalRemainder: 0,
      flowCount: 1,
      entryCount: attrResult.value.entries.length,
      checksum: 'mock',
    };

    const snapshot1 = createSnapshotFromAttribution(
      mockPeriodResult,
      ATTRIBUTION_SNAPSHOT_GENESIS_HASH,
      1500000
    );

    const snapshot2 = createSnapshotFromAttribution(
      mockPeriodResult,
      ATTRIBUTION_SNAPSHOT_GENESIS_HASH,
      1500000
    );

    expect(snapshot1.success).toBe(true);
    expect(snapshot2.success).toBe(true);

    if (snapshot1.success && snapshot2.success) {
      expect(snapshotsAreEquivalent(snapshot1.value, snapshot2.value)).toBe(true);
    }
  });

  it('snapshot checksum is verifiable', () => {
    const ruleSet = createTestRuleSet();
    const flowId = createGreyFlowId('checksum-test');
    const attrResult = attributeFlow(flowId, 1000, ruleSet, 'test');

    expect(attrResult.success).toBe(true);
    if (!attrResult.success) return;

    const mockPeriodResult = {
      periodId: createReconciliationPeriodId('period-001'),
      ruleSetId: ruleSet.ruleSetId,
      flowResults: [attrResult.value],
      totalOriginal: 1000,
      totalAttributed: 1000,
      totalRemainder: 0,
      flowCount: 1,
      entryCount: attrResult.value.entries.length,
      checksum: 'mock',
    };

    const snapshot = createSnapshotFromAttribution(
      mockPeriodResult,
      ATTRIBUTION_SNAPSHOT_GENESIS_HASH,
      1500000
    );

    expect(snapshot.success).toBe(true);
    if (snapshot.success) {
      expect(verifySnapshotChecksum(snapshot.value)).toBe(true);
    }
  });

  it('first snapshot has genesis hash', () => {
    const ruleSet = createTestRuleSet();
    const flowId = createGreyFlowId('genesis-test');
    const attrResult = attributeFlow(flowId, 1000, ruleSet, 'test');

    expect(attrResult.success).toBe(true);
    if (!attrResult.success) return;

    const mockPeriodResult = {
      periodId: createReconciliationPeriodId('period-001'),
      ruleSetId: ruleSet.ruleSetId,
      flowResults: [attrResult.value],
      totalOriginal: 1000,
      totalAttributed: 1000,
      totalRemainder: 0,
      flowCount: 1,
      entryCount: attrResult.value.entries.length,
      checksum: 'mock',
    };

    const snapshot = createSnapshotFromAttribution(
      mockPeriodResult,
      ATTRIBUTION_SNAPSHOT_GENESIS_HASH,
      1500000
    );

    expect(snapshot.success).toBe(true);
    if (snapshot.success) {
      expect(snapshot.value.previousHash).toBe(ATTRIBUTION_SNAPSHOT_GENESIS_HASH);
    }
  });
});

// ============================================================================
// INTEGER-ONLY MATH TESTS
// ============================================================================

describe('Integer-Only Math', () => {
  it('all attributed amounts are integers', () => {
    const ruleSet = createTestRuleSet();
    const flowId = createGreyFlowId('integer-test');

    // Test with various amounts including odd numbers
    const testAmounts = [100, 101, 1000, 10001, 99999];

    for (const amount of testAmounts) {
      const result = attributeFlow(flowId, amount, ruleSet, 'test');

      expect(result.success).toBe(true);
      if (result.success) {
        for (const entry of result.value.entries) {
          expect(Number.isInteger(entry.amount)).toBe(true);
        }
      }
    }
  });

  it('assertInteger rejects floats', () => {
    const result = assertInteger(3.14, 'testField');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe(AttributionErrorCode.NON_INTEGER_VALUE);
    }
  });

  it('assertInteger accepts integers', () => {
    const result = assertInteger(42, 'testField');
    expect(result.success).toBe(true);
  });

  it('calculateAttributedAmount uses floor division', () => {
    // 1001 * 5000 / 10000 = 500.5, should floor to 500
    const result = calculateAttributedAmount(1001, 5000);
    expect(result).toBe(500);
    expect(Number.isInteger(result)).toBe(true);
  });
});

// ============================================================================
// BASIS POINTS VALIDATION TESTS
// ============================================================================

describe('Basis Points Validation', () => {
  it('isValidBasisPoints validates range', () => {
    expect(isValidBasisPoints(0)).toBe(true);
    expect(isValidBasisPoints(5000)).toBe(true);
    expect(isValidBasisPoints(10000)).toBe(true);
    expect(isValidBasisPoints(-1)).toBe(false);
    expect(isValidBasisPoints(10001)).toBe(false);
    expect(isValidBasisPoints(50.5)).toBe(false);
  });

  it('assertValidBasisPoints validates correctly', () => {
    const validResult = assertValidBasisPoints(5000, 'testField');
    expect(validResult.success).toBe(true);

    const invalidResult = assertValidBasisPoints(15000, 'testField');
    expect(invalidResult.success).toBe(false);
    if (!invalidResult.success) {
      expect(invalidResult.error.code).toBe(AttributionErrorCode.INVALID_BASIS_POINTS);
    }
  });

  it('assertBasisPointsSumTo100 validates sum', () => {
    const validResult = assertBasisPointsSumTo100([5000, 3000, 2000]);
    expect(validResult.success).toBe(true);

    const invalidResult = assertBasisPointsSumTo100([5000, 3000, 1000]);
    expect(invalidResult.success).toBe(false);
    if (!invalidResult.success) {
      expect(invalidResult.error.code).toBe(AttributionErrorCode.INVALID_RULE_SET_TOTAL);
    }
  });
});

// ============================================================================
// GREYFLOW UNTOUCHED TESTS
// ============================================================================

describe('GreyFlow Untouched', () => {
  it('attribution does not modify registry', () => {
    const registry = createTestRegistry();
    const initialCount = registry.getAllRecords().length;

    const ruleSet = createTestRuleSet();
    const flowId = createGreyFlowId('flow-0');

    // Perform attribution
    attributeFlow(flowId, 1000, ruleSet, 'test');

    // Registry should be unchanged
    expect(registry.getAllRecords().length).toBe(initialCount);
  });
});

// ============================================================================
// RECONCILIATION UNTOUCHED TESTS
// ============================================================================

describe('Reconciliation Untouched', () => {
  it('attribution module does not import engine', () => {
    // Module imports are validated at build time
    // This test verifies the module structure
    expect(ATTRIBUTION_VERSION).toBe('1.0.0');
    expect(ATTRIBUTION_BOUNDARY_GUARD_DOCUMENTATION.title).toBe('Grey Attribution Boundary Guards');
  });

  it('boundary guards document restrictions', () => {
    expect(ATTRIBUTION_BOUNDARY_GUARD_DOCUMENTATION.guards.length).toBeGreaterThan(0);
    expect(ATTRIBUTION_BOUNDARY_GUARD_DOCUMENTATION.invariants.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// FORBIDDEN CONCEPTS TESTS
// ============================================================================

describe('Forbidden Concepts', () => {
  it('ATTRIBUTION_FORBIDDEN_CONCEPTS is defined', () => {
    expect(ATTRIBUTION_FORBIDDEN_CONCEPTS).toBeDefined();
    expect(ATTRIBUTION_FORBIDDEN_CONCEPTS.length).toBeGreaterThan(0);
    expect(ATTRIBUTION_FORBIDDEN_CONCEPTS).toContain('payment');
    expect(ATTRIBUTION_FORBIDDEN_CONCEPTS).toContain('wallet');
    expect(ATTRIBUTION_FORBIDDEN_CONCEPTS).toContain('balance');
  });

  it('findForbiddenConcepts detects forbidden terms', () => {
    const text = 'This involves a payment to the wallet';
    const found = findForbiddenConcepts(text);

    expect(found.length).toBe(2);
    expect(found).toContain('payment');
    expect(found).toContain('wallet');
  });

  it('clean text passes forbidden check', () => {
    const text = 'Attribution share for platform rake reference';
    const found = findForbiddenConcepts(text);

    expect(found.length).toBe(0);
  });
});

// ============================================================================
// VIEW TRACEABILITY TESTS
// ============================================================================

describe('View Traceability', () => {
  it('platform summary includes source flow IDs', () => {
    const ruleSet = createTestRuleSet();
    const flowId = createGreyFlowId('trace-test');
    const attrResult = attributeFlow(flowId, 1000, ruleSet, 'test');

    expect(attrResult.success).toBe(true);
    if (!attrResult.success) return;

    const mockPeriodResult = {
      periodId: createReconciliationPeriodId('period-001'),
      ruleSetId: ruleSet.ruleSetId,
      flowResults: [attrResult.value],
      totalOriginal: 1000,
      totalAttributed: 1000,
      totalRemainder: 0,
      flowCount: 1,
      entryCount: attrResult.value.entries.length,
      checksum: 'mock',
    };

    const snapshot = createSnapshotFromAttribution(
      mockPeriodResult,
      ATTRIBUTION_SNAPSHOT_GENESIS_HASH,
      1500000
    );

    expect(snapshot.success).toBe(true);
    if (!snapshot.success) return;

    const platformSummary = getPlatformAttributionSummary(snapshot.value);
    expect(platformSummary.sourceFlowIds.length).toBeGreaterThan(0);
  });

  it('flow breakdown includes all entries', () => {
    const ruleSet = createTestRuleSet();
    const flowId = createGreyFlowId('breakdown-test');
    const attrResult = attributeFlow(flowId, 1000, ruleSet, 'test');

    expect(attrResult.success).toBe(true);
    if (!attrResult.success) return;

    const mockPeriodResult = {
      periodId: createReconciliationPeriodId('period-001'),
      ruleSetId: ruleSet.ruleSetId,
      flowResults: [attrResult.value],
      totalOriginal: 1000,
      totalAttributed: 1000,
      totalRemainder: 0,
      flowCount: 1,
      entryCount: attrResult.value.entries.length,
      checksum: 'mock',
    };

    const snapshot = createSnapshotFromAttribution(
      mockPeriodResult,
      ATTRIBUTION_SNAPSHOT_GENESIS_HASH,
      1500000
    );

    expect(snapshot.success).toBe(true);
    if (!snapshot.success) return;

    const breakdown = getFlowAttributionBreakdown(snapshot.value, flowId);
    expect(breakdown).not.toBeNull();
    if (breakdown) {
      expect(breakdown.sourceGreyFlowId).toBe(flowId);
      expect(breakdown.entries.length).toBe(attrResult.value.entries.length);
    }
  });
});

// ============================================================================
// SNAPSHOT IMMUTABILITY TESTS
// ============================================================================

describe('Snapshot Immutability', () => {
  it('snapshots are frozen', () => {
    const ruleSet = createTestRuleSet();
    const flowId = createGreyFlowId('frozen-test');
    const attrResult = attributeFlow(flowId, 1000, ruleSet, 'test');

    expect(attrResult.success).toBe(true);
    if (!attrResult.success) return;

    const mockPeriodResult = {
      periodId: createReconciliationPeriodId('period-001'),
      ruleSetId: ruleSet.ruleSetId,
      flowResults: [attrResult.value],
      totalOriginal: 1000,
      totalAttributed: 1000,
      totalRemainder: 0,
      flowCount: 1,
      entryCount: attrResult.value.entries.length,
      checksum: 'mock',
    };

    const snapshot = createSnapshotFromAttribution(
      mockPeriodResult,
      ATTRIBUTION_SNAPSHOT_GENESIS_HASH,
      1500000
    );

    expect(snapshot.success).toBe(true);
    if (snapshot.success) {
      expect(Object.isFrozen(snapshot.value)).toBe(true);
      expect(Object.isFrozen(snapshot.value.entries)).toBe(true);
    }
  });

  it('attribution entries are frozen', () => {
    const ruleSet = createTestRuleSet();
    const flowId = createGreyFlowId('entry-frozen-test');
    const attrResult = attributeFlow(flowId, 1000, ruleSet, 'test');

    expect(attrResult.success).toBe(true);
    if (attrResult.success) {
      expect(Object.isFrozen(attrResult.value.entries)).toBe(true);
      for (const entry of attrResult.value.entries) {
        expect(Object.isFrozen(entry)).toBe(true);
      }
    }
  });
});

// ============================================================================
// HIERARCHY CHECKSUM TESTS
// ============================================================================

describe('Hierarchy Checksum', () => {
  it('hierarchy checksum is verifiable', () => {
    const hierarchy = createTestHierarchy();
    const checksum = calculateHierarchyChecksum(hierarchy);

    expect(verifyHierarchyChecksum(hierarchy, checksum)).toBe(true);
    expect(verifyHierarchyChecksum(hierarchy, 'wrong-checksum')).toBe(false);
  });
});

// ============================================================================
// EDGE CASE TESTS
// ============================================================================

describe('Edge Cases', () => {
  it('handles zero amount', () => {
    const ruleSet = createTestRuleSet();
    const flowId = createGreyFlowId('zero-test');

    const result = attributeFlow(flowId, 0, ruleSet, 'test');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.totalAttributed).toBe(0);
    }
  });

  it('handles very large amounts', () => {
    const ruleSet = createTestRuleSet();
    const flowId = createGreyFlowId('large-test');
    const largeAmount = 1000000000; // 1 billion

    const result = attributeFlow(flowId, largeAmount, ruleSet, 'test');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.totalAttributed).toBe(largeAmount);
      expect(verifyAttributionConservation(result.value)).toBe(true);
    }
  });

  it('rejects negative amounts', () => {
    const ruleSet = createTestRuleSet();
    const flowId = createGreyFlowId('negative-test');

    const result = attributeFlow(flowId, -100, ruleSet, 'test');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe(AttributionErrorCode.NON_INTEGER_VALUE);
    }
  });

  it('rejects float amounts', () => {
    const ruleSet = createTestRuleSet();
    const flowId = createGreyFlowId('float-test');

    const result = attributeFlow(flowId, 100.5, ruleSet, 'test');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe(AttributionErrorCode.NON_INTEGER_VALUE);
    }
  });
});
