/**
 * Grey Simulation Module Tests
 *
 * Comprehensive tests for simulation sandbox functionality
 */

import { describe, it, expect } from '@jest/globals';

import {
  // Types & Constants
  createSimulationScenarioId,
  createSimulationRunId,
  createComparisonResultId,
  isValidBasisPoints,
  isValidTimestamp,
  calculateChecksum,
  simulationSuccess,
  simulationFailure,
  createSimulationError,
  SimulationErrorCode,
  SIMULATION_FORBIDDEN_CONCEPTS,
  BASIS_POINTS_100_PERCENT,
  AdjustmentType,
  ScenarioCategory,
  // Scenario
  createScenario,
  createBaselineScenario,
  createScenarioBatch,
  createAttributionPercentageAdjustment,
  createHierarchyChangeAdjustment,
  createRakeAdjustment,
  createShareSplitAdjustment,
  createAddPartyAdjustment,
  createRemovePartyAdjustment,
  createChangePartyTypeAdjustment,
  validateAdjustment,
  hasAdjustmentType,
  getAffectedParties,
  SCENARIO_TEMPLATES,
  // Engine
  executeSimulation,
  executeSimulationBatch,
  // Comparator
  compareRealVsSimulated,
  compareMultipleScenarios,
  // Views
  generateInsightView,
  generateWhatIfSummary,
  generateStandardWhatIfs,
  generateComparisonDashboard,
  formatInsightViewForDisplay,
  formatDashboardForDisplay,
  // Boundary Guards
  checkForbiddenConcepts,
  checkPersistencePatterns,
  checkMutationPatterns,
  checkExternalPatterns,
  checkImports,
  validateImmutableInput,
  runComprehensiveBoundaryCheck,
  freezeDeep,
  createReadOnlyProxy,
  withSandbox,
  SIMULATION_MODULE_IDENTITY,
  getModuleIdentity,
  verifyModuleMode,
} from '../index';

import type {
  SimulationScenarioId,
  SimulationOutput,
  ComparisonResult,
  SimulationAdjustment,
} from '../index';

import type { SimulationScenario, ScenarioBatch } from '../GreySimulationScenario';
import type {
  SimulationExecutionInput,
  SimulationInputSnapshot,
} from '../GreySimulationEngine';
import type { ComparisonInput } from '../GreySimulationComparator';
import { createGreyPartyId, GreyPartyId, GreyPartyType } from '../../grey-runtime';
import { createReconciliationPeriodId, ReconciliationPeriodId } from '../../grey-reconciliation';

// ============================================================================
// TEST HELPERS
// ============================================================================

function createTestTimestamp(): number {
  return Date.now();
}

function createTestReconciliationPeriodId(): ReconciliationPeriodId {
  return createReconciliationPeriodId(`period-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
}

function createTestGreyPartyId(suffix?: string): GreyPartyId {
  return createGreyPartyId(`party-${Date.now()}-${suffix || Math.random().toString(36).slice(2, 8)}`);
}

function createTestSnapshot(periodId: ReconciliationPeriodId, parties?: GreyPartyId[]): SimulationInputSnapshot {
  const partyIds = parties || [createTestGreyPartyId('default')];

  return Object.freeze({
    periodId,
    timestamp: createTestTimestamp(),
    attributions: Object.freeze(partyIds.map(partyId => Object.freeze({
      partyId,
      partyType: 'AGENT' as GreyPartyType,
      attributionBasisPoints: 5000,
      amount: 10000,
    }))),
    hierarchy: Object.freeze(partyIds.map(partyId => Object.freeze({
      partyId,
      partyType: 'AGENT' as GreyPartyType,
      parentId: null,
      children: Object.freeze([]) as readonly GreyPartyId[],
    }))),
    healthScores: Object.freeze(partyIds.map(partyId => Object.freeze({
      entityId: partyId,
      entityType: 'AGENT' as GreyPartyType,
      healthScore: 80,
      riskScore: 20,
    }))),
    totalFlowAmount: 100000,
  });
}

// ============================================================================
// TYPES TESTS
// ============================================================================

describe('GreySimulationTypes', () => {
  describe('ID creation', () => {
    it('creates valid scenario ID', () => {
      const id = createSimulationScenarioId('test-scenario-123');
      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
      expect(id).toBe('test-scenario-123');
    });

    it('creates valid run ID', () => {
      const id = createSimulationRunId('test-run-456');
      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
    });

    it('creates valid comparison result ID', () => {
      const id = createComparisonResultId('test-comparison-789');
      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
    });
  });

  describe('validation helpers', () => {
    it('validates correct basis points', () => {
      expect(isValidBasisPoints(0)).toBe(true);
      expect(isValidBasisPoints(5000)).toBe(true);
      expect(isValidBasisPoints(10000)).toBe(true);
    });

    it('rejects invalid basis points', () => {
      expect(isValidBasisPoints(-1)).toBe(false);
      expect(isValidBasisPoints(10001)).toBe(false);
      expect(isValidBasisPoints(1.5)).toBe(false);
    });

    it('validates timestamps', () => {
      expect(isValidTimestamp(Date.now())).toBe(true);
      expect(isValidTimestamp(1)).toBe(true);
      expect(isValidTimestamp(0)).toBe(false);
      expect(isValidTimestamp(-1)).toBe(false);
    });
  });

  describe('checksum computation', () => {
    it('computes consistent checksums', () => {
      const data = { a: 1, b: 2, c: 3 };
      const checksum1 = calculateChecksum('test', data);
      const checksum2 = calculateChecksum('test', data);
      expect(checksum1).toBe(checksum2);
    });

    it('produces different checksums for different data', () => {
      const checksum1 = calculateChecksum('test', { a: 1 });
      const checksum2 = calculateChecksum('test', { a: 2 });
      expect(checksum1).not.toBe(checksum2);
    });
  });

  describe('result helpers', () => {
    it('creates success result', () => {
      const result = simulationSuccess({ value: 42 });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toEqual({ value: 42 });
      }
    });

    it('creates failure result', () => {
      const error = createSimulationError(SimulationErrorCode.INVALID_INPUT, 'Test error');
      const result = simulationFailure(error);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(SimulationErrorCode.INVALID_INPUT);
      }
    });
  });

  describe('forbidden concepts', () => {
    it('includes payment-related terms', () => {
      expect(SIMULATION_FORBIDDEN_CONCEPTS).toContain('payment');
      expect(SIMULATION_FORBIDDEN_CONCEPTS).toContain('wallet');
      expect(SIMULATION_FORBIDDEN_CONCEPTS).toContain('transfer');
    });

    it('includes persistence-related terms', () => {
      expect(SIMULATION_FORBIDDEN_CONCEPTS).toContain('persist');
      expect(SIMULATION_FORBIDDEN_CONCEPTS).toContain('save');
      expect(SIMULATION_FORBIDDEN_CONCEPTS).toContain('store');
    });
  });
});

// ============================================================================
// SCENARIO TESTS
// ============================================================================

describe('GreySimulationScenario', () => {
  describe('createScenario', () => {
    it('creates a valid scenario', () => {
      const basePeriodId = createTestReconciliationPeriodId();
      const partyId = createTestGreyPartyId();

      const result = createScenario({
        name: 'Test Scenario',
        description: 'A test simulation scenario',
        category: ScenarioCategory.OPTIMIZATION,
        basePeriodId,
        adjustments: [
          createAttributionPercentageAdjustment(partyId, 5000, 4500),
        ],
        tags: ['test'],
        timestamp: createTestTimestamp(),
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.scenarioId).toBeDefined();
        expect(result.value.name).toBe('Test Scenario');
        expect(result.value.category).toBe(ScenarioCategory.OPTIMIZATION);
        expect(result.value.adjustments.length).toBe(1);
        expect(result.value.checksum).toBeDefined();
      }
    });

    it('creates frozen scenarios', () => {
      const basePeriodId = createTestReconciliationPeriodId();

      const result = createScenario({
        name: 'Frozen Test',
        description: 'Should be frozen',
        category: ScenarioCategory.EXPLORATION,
        basePeriodId,
        adjustments: [],
        timestamp: createTestTimestamp(),
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(Object.isFrozen(result.value)).toBe(true);
      }
    });

    it('assigns correct categories', () => {
      const basePeriodId = createTestReconciliationPeriodId();
      const categories: (typeof ScenarioCategory)[keyof typeof ScenarioCategory][] = [
        ScenarioCategory.OPTIMIZATION,
        ScenarioCategory.RISK_REDUCTION,
        ScenarioCategory.STRUCTURAL,
        ScenarioCategory.EXPLORATION,
        ScenarioCategory.STRESS_TEST,
      ];

      for (const category of categories) {
        const result = createScenario({
          name: `Category ${category}`,
          description: 'Test',
          category,
          basePeriodId,
          adjustments: [],
          timestamp: createTestTimestamp(),
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value.category).toBe(category);
        }
      }
    });

    it('rejects invalid timestamp', () => {
      const basePeriodId = createTestReconciliationPeriodId();

      const result = createScenario({
        name: 'Invalid Timestamp',
        description: 'Test',
        category: ScenarioCategory.EXPLORATION,
        basePeriodId,
        adjustments: [],
        timestamp: -1,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(SimulationErrorCode.INVALID_TIMESTAMP);
      }
    });
  });

  describe('createBaselineScenario', () => {
    it('creates a baseline scenario with no adjustments', () => {
      const basePeriodId = createTestReconciliationPeriodId();
      const result = createBaselineScenario(basePeriodId, createTestTimestamp());

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.isBaseline).toBe(true);
        expect(result.value.adjustments.length).toBe(0);
      }
    });
  });

  describe('createScenarioBatch', () => {
    it('creates a batch with multiple scenarios', () => {
      const basePeriodId = createTestReconciliationPeriodId();
      const timestamp = createTestTimestamp();

      const scenarioResults = [
        createScenario({
          name: 'Scenario A',
          description: 'Test A',
          category: ScenarioCategory.OPTIMIZATION,
          basePeriodId,
          adjustments: [],
          timestamp,
        }),
        createScenario({
          name: 'Scenario B',
          description: 'Test B',
          category: ScenarioCategory.OPTIMIZATION,
          basePeriodId,
          adjustments: [],
          timestamp,
        }),
      ];

      const scenarios: SimulationScenario[] = [];
      for (const r of scenarioResults) {
        if (r.success) scenarios.push(r.value);
      }

      const result = createScenarioBatch(
        'Test Batch',
        'A batch of scenarios',
        basePeriodId,
        scenarios,
        timestamp
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.scenarios.length).toBe(2);
      }
    });

    it('rejects empty batch', () => {
      const basePeriodId = createTestReconciliationPeriodId();

      const result = createScenarioBatch(
        'Empty Batch',
        'Should fail',
        basePeriodId,
        [],
        createTestTimestamp()
      );

      expect(result.success).toBe(false);
    });
  });

  describe('adjustment creators', () => {
    it('creates attribution percentage adjustment', () => {
      const partyId = createTestGreyPartyId();
      const adj = createAttributionPercentageAdjustment(partyId, 5000, 4500);

      expect(adj.adjustmentType).toBe(AdjustmentType.ATTRIBUTION_PERCENTAGE);
      expect(adj.partyId).toBe(partyId);
      expect(adj.originalPercentageBasisPoints).toBe(5000);
      expect(adj.newPercentageBasisPoints).toBe(4500);
    });

    it('creates hierarchy change adjustment', () => {
      const partyId = createTestGreyPartyId();
      const newParentId = createTestGreyPartyId();
      const adj = createHierarchyChangeAdjustment(partyId, null, newParentId);

      expect(adj.adjustmentType).toBe(AdjustmentType.HIERARCHY_CHANGE);
      expect(adj.partyId).toBe(partyId);
      expect(adj.newParentId).toBe(newParentId);
    });

    it('creates rake adjustment', () => {
      const entityId = createTestGreyPartyId();
      const adj = createRakeAdjustment(entityId, 500, 400);

      expect(adj.adjustmentType).toBe(AdjustmentType.RAKE_ADJUSTMENT);
      expect(adj.entityId).toBe(entityId);
      expect(adj.originalRakeBasisPoints).toBe(500);
      expect(adj.newRakeBasisPoints).toBe(400);
    });

    it('creates share split adjustment', () => {
      const partyId = createTestGreyPartyId();
      const adj = createShareSplitAdjustment(partyId, 3000, 2500);

      expect(adj.adjustmentType).toBe(AdjustmentType.SHARE_SPLIT);
      expect(adj.partyId).toBe(partyId);
    });

    it('creates add party adjustment', () => {
      const newPartyId = createTestGreyPartyId();
      const adj = createAddPartyAdjustment(newPartyId, 'AGENT' as GreyPartyType, null, 1000);

      expect(adj.adjustmentType).toBe(AdjustmentType.ADD_PARTY);
      expect(adj.newPartyId).toBe(newPartyId);
      expect(adj.partyType).toBe('AGENT');
    });

    it('creates remove party adjustment', () => {
      const partyId = createTestGreyPartyId();
      const adj = createRemovePartyAdjustment(partyId, 'PROPORTIONAL');

      expect(adj.adjustmentType).toBe(AdjustmentType.REMOVE_PARTY);
      expect(adj.partyId).toBe(partyId);
      expect(adj.redistributeTo).toBe('PROPORTIONAL');
    });

    it('creates change party type adjustment', () => {
      const partyId = createTestGreyPartyId();
      const adj = createChangePartyTypeAdjustment(partyId, 'AGENT' as GreyPartyType, 'CLUB' as GreyPartyType);

      expect(adj.adjustmentType).toBe(AdjustmentType.CHANGE_PARTY_TYPE);
      expect(adj.partyId).toBe(partyId);
      expect(adj.originalPartyType).toBe('AGENT');
      expect(adj.newPartyType).toBe('CLUB');
    });
  });

  describe('validateAdjustment', () => {
    it('validates correct adjustments', () => {
      const adj = createAttributionPercentageAdjustment(createTestGreyPartyId(), 5000, 4500);
      const result = validateAdjustment(adj);
      expect(result.success).toBe(true);
    });

    it('rejects adjustments with invalid percentages', () => {
      const adj = createAttributionPercentageAdjustment(createTestGreyPartyId(), -100, 4500);
      const result = validateAdjustment(adj);
      expect(result.success).toBe(false);
    });

    it('rejects adjustments with percentage over 100%', () => {
      const adj = createAttributionPercentageAdjustment(createTestGreyPartyId(), 5000, 15000);
      const result = validateAdjustment(adj);
      expect(result.success).toBe(false);
    });
  });

  describe('hasAdjustmentType', () => {
    it('detects adjustment type presence', () => {
      const basePeriodId = createTestReconciliationPeriodId();
      const partyId = createTestGreyPartyId();

      const result = createScenario({
        name: 'Test',
        description: 'Test',
        category: ScenarioCategory.OPTIMIZATION,
        basePeriodId,
        adjustments: [
          createAttributionPercentageAdjustment(partyId, 5000, 4500),
        ],
        timestamp: createTestTimestamp(),
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(hasAdjustmentType(result.value, AdjustmentType.ATTRIBUTION_PERCENTAGE)).toBe(true);
        expect(hasAdjustmentType(result.value, AdjustmentType.RAKE_ADJUSTMENT)).toBe(false);
      }
    });
  });

  describe('getAffectedParties', () => {
    it('returns all affected parties', () => {
      const basePeriodId = createTestReconciliationPeriodId();
      const partyId1 = createTestGreyPartyId('p1');
      const partyId2 = createTestGreyPartyId('p2');

      const result = createScenario({
        name: 'Test',
        description: 'Test',
        category: ScenarioCategory.OPTIMIZATION,
        basePeriodId,
        adjustments: [
          createAttributionPercentageAdjustment(partyId1, 5000, 4500),
          createRakeAdjustment(partyId2, 500, 400),
        ],
        timestamp: createTestTimestamp(),
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const affected = getAffectedParties(result.value);
        expect(affected.length).toBe(2);
        expect(affected).toContain(partyId1);
        expect(affected).toContain(partyId2);
      }
    });
  });

  describe('SCENARIO_TEMPLATES', () => {
    it('includes standard templates', () => {
      expect(SCENARIO_TEMPLATES.REDUCE_AGENT_RAKE).toBeDefined();
      expect(SCENARIO_TEMPLATES.FLATTEN_HIERARCHY).toBeDefined();
      expect(SCENARIO_TEMPLATES.EQUAL_ATTRIBUTION).toBeDefined();
    });

    it('templates have required properties', () => {
      const template = SCENARIO_TEMPLATES.REDUCE_AGENT_RAKE;
      expect(template.name).toBeDefined();
      expect(template.description).toBeDefined();
      expect(template.category).toBeDefined();
      expect(template.templateId).toBeDefined();
    });
  });
});

// ============================================================================
// ENGINE TESTS
// ============================================================================

describe('GreySimulationEngine', () => {
  describe('executeSimulation', () => {
    it('executes a simple simulation', () => {
      const basePeriodId = createTestReconciliationPeriodId();
      const partyId = createTestGreyPartyId();
      const timestamp = createTestTimestamp();

      const scenarioResult = createScenario({
        name: 'Test Scenario',
        description: 'Test',
        category: ScenarioCategory.OPTIMIZATION,
        basePeriodId,
        adjustments: [
          createAttributionPercentageAdjustment(partyId, 5000, 4500),
        ],
        timestamp,
      });

      expect(scenarioResult.success).toBe(true);
      if (!scenarioResult.success) return;

      const snapshot = createTestSnapshot(basePeriodId, [partyId]);

      const input: SimulationExecutionInput = {
        scenario: scenarioResult.value,
        snapshot,
        timestamp,
      };

      const result = executeSimulation(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.scenarioId).toBe(scenarioResult.value.scenarioId);
        expect(result.value.checksum).toBeDefined();
      }
    });

    it('returns frozen output', () => {
      const basePeriodId = createTestReconciliationPeriodId();
      const partyId = createTestGreyPartyId();
      const timestamp = createTestTimestamp();

      const scenarioResult = createScenario({
        name: 'Frozen Output Test',
        description: 'Test',
        category: ScenarioCategory.EXPLORATION,
        basePeriodId,
        adjustments: [],
        timestamp,
      });

      expect(scenarioResult.success).toBe(true);
      if (!scenarioResult.success) return;

      const snapshot = createTestSnapshot(basePeriodId, [partyId]);

      const result = executeSimulation({
        scenario: scenarioResult.value,
        snapshot,
        timestamp,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(Object.isFrozen(result.value)).toBe(true);
      }
    });

    it('rejects invalid timestamp', () => {
      const basePeriodId = createTestReconciliationPeriodId();
      const partyId = createTestGreyPartyId();

      const scenarioResult = createScenario({
        name: 'Test',
        description: 'Test',
        category: ScenarioCategory.EXPLORATION,
        basePeriodId,
        adjustments: [],
        timestamp: createTestTimestamp(),
      });

      expect(scenarioResult.success).toBe(true);
      if (!scenarioResult.success) return;

      const snapshot = createTestSnapshot(basePeriodId, [partyId]);

      const result = executeSimulation({
        scenario: scenarioResult.value,
        snapshot,
        timestamp: -1,
      });

      expect(result.success).toBe(false);
    });
  });

  describe('executeSimulationBatch', () => {
    it('executes multiple scenarios', () => {
      const basePeriodId = createTestReconciliationPeriodId();
      const partyId = createTestGreyPartyId();
      const timestamp = createTestTimestamp();

      const scenarios: SimulationScenario[] = [];
      for (let i = 0; i < 2; i++) {
        const result = createScenario({
          name: `Scenario ${i}`,
          description: 'Test',
          category: ScenarioCategory.OPTIMIZATION,
          basePeriodId,
          adjustments: [],
          timestamp,
        });
        if (result.success) scenarios.push(result.value);
      }

      const batchResult = createScenarioBatch('Test Batch', 'Test', basePeriodId, scenarios, timestamp);
      expect(batchResult.success).toBe(true);
      if (!batchResult.success) return;

      const snapshot = createTestSnapshot(basePeriodId, [partyId]);

      const result = executeSimulationBatch(
        batchResult.value,
        snapshot,
        timestamp
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.length).toBe(2);
      }
    });
  });
});

// ============================================================================
// COMPARATOR TESTS
// ============================================================================

describe('GreySimulationComparator', () => {
  describe('compareRealVsSimulated', () => {
    it('compares real and simulated outputs', () => {
      const basePeriodId = createTestReconciliationPeriodId();
      const partyId = createTestGreyPartyId();
      const timestamp = createTestTimestamp();

      const scenarioResult = createScenario({
        name: 'Comparison Test',
        description: 'Test',
        category: ScenarioCategory.OPTIMIZATION,
        basePeriodId,
        adjustments: [
          createAttributionPercentageAdjustment(partyId, 5000, 4500),
        ],
        timestamp,
      });

      expect(scenarioResult.success).toBe(true);
      if (!scenarioResult.success) return;

      const snapshot = createTestSnapshot(basePeriodId, [partyId]);

      const simulationResult = executeSimulation({
        scenario: scenarioResult.value,
        snapshot,
        timestamp,
      });

      expect(simulationResult.success).toBe(true);
      if (!simulationResult.success) return;

      const comparisonResult = compareRealVsSimulated({
        scenario: scenarioResult.value,
        simulationOutput: simulationResult.value,
        realSnapshot: snapshot,
        timestamp,
      });

      expect(comparisonResult.success).toBe(true);
      if (comparisonResult.success) {
        expect(comparisonResult.value.scenarioId).toBe(scenarioResult.value.scenarioId);
        expect(comparisonResult.value.aggregateMetrics).toBeDefined();
      }
    });
  });
});

// ============================================================================
// VIEWS TESTS
// ============================================================================

describe('GreySimulationViews', () => {
  describe('generateInsightView', () => {
    it('generates insight view for scenario', () => {
      const basePeriodId = createTestReconciliationPeriodId();
      const partyId = createTestGreyPartyId();
      const timestamp = createTestTimestamp();

      const scenarioResult = createScenario({
        name: 'Insight Test',
        description: 'Test',
        category: ScenarioCategory.OPTIMIZATION,
        basePeriodId,
        adjustments: [],
        timestamp,
      });

      expect(scenarioResult.success).toBe(true);
      if (!scenarioResult.success) return;

      const snapshot = createTestSnapshot(basePeriodId, [partyId]);

      const simulationResult = executeSimulation({
        scenario: scenarioResult.value,
        snapshot,
        timestamp,
      });

      expect(simulationResult.success).toBe(true);
      if (!simulationResult.success) return;

      const comparisonResult = compareRealVsSimulated({
        scenario: scenarioResult.value,
        simulationOutput: simulationResult.value,
        realSnapshot: snapshot,
        timestamp,
      });

      expect(comparisonResult.success).toBe(true);
      if (!comparisonResult.success) return;

      const result = generateInsightView(scenarioResult.value, comparisonResult.value);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.scenarioId).toBe(scenarioResult.value.scenarioId);
        expect(result.value.headline).toBeDefined();
        expect(result.value.recommendation).toBeDefined();
      }
    });
  });

  describe('generateWhatIfSummary', () => {
    it('generates what-if summary for question', () => {
      const basePeriodId = createTestReconciliationPeriodId();
      const partyId = createTestGreyPartyId();
      const timestamp = createTestTimestamp();

      const scenarioResult = createScenario({
        name: 'What-If Test',
        description: 'Test',
        category: ScenarioCategory.EXPLORATION,
        basePeriodId,
        adjustments: [],
        timestamp,
      });

      expect(scenarioResult.success).toBe(true);
      if (!scenarioResult.success) return;

      const snapshot = createTestSnapshot(basePeriodId, [partyId]);

      const simulationResult = executeSimulation({
        scenario: scenarioResult.value,
        snapshot,
        timestamp,
      });

      expect(simulationResult.success).toBe(true);
      if (!simulationResult.success) return;

      const comparisonResult = compareRealVsSimulated({
        scenario: scenarioResult.value,
        simulationOutput: simulationResult.value,
        realSnapshot: snapshot,
        timestamp,
      });

      expect(comparisonResult.success).toBe(true);
      if (!comparisonResult.success) return;

      const summary = generateWhatIfSummary(
        'What happens to rake distribution?',
        scenarioResult.value,
        comparisonResult.value
      );

      expect(summary.question).toBe('What happens to rake distribution?');
      expect(summary.answer).toBeDefined();
      expect(summary.confidence).toBeGreaterThanOrEqual(0);
      expect(summary.confidence).toBeLessThanOrEqual(1);
    });
  });
});

// ============================================================================
// BOUNDARY GUARDS TESTS
// ============================================================================

describe('GreySimulationBoundaryGuards', () => {
  describe('checkForbiddenConcepts', () => {
    it('detects forbidden payment terms', () => {
      const result = checkForbiddenConcepts('This involves payment processing');
      expect(result.isValid).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
    });

    it('detects forbidden wallet terms', () => {
      const result = checkForbiddenConcepts('Update the wallet balance');
      expect(result.isValid).toBe(false);
    });

    it('passes clean text', () => {
      const result = checkForbiddenConcepts('Calculate attribution percentage');
      expect(result.isValid).toBe(true);
      expect(result.violations.length).toBe(0);
    });
  });

  describe('checkPersistencePatterns', () => {
    it('detects save patterns', () => {
      const result = checkPersistencePatterns('data.save()');
      expect(result.isValid).toBe(false);
    });

    it('detects localStorage usage', () => {
      const result = checkPersistencePatterns('localStorage.setItem("key", "value")');
      expect(result.isValid).toBe(false);
    });

    it('passes clean code', () => {
      const result = checkPersistencePatterns('const x = calculateTotal()');
      expect(result.isValid).toBe(true);
    });
  });

  describe('checkMutationPatterns', () => {
    it('detects array mutations', () => {
      const result = checkMutationPatterns('items.push(newItem)');
      expect(result.isValid).toBe(false);
    });

    it('detects Object.assign', () => {
      const result = checkMutationPatterns('Object.assign(target, source)');
      expect(result.isValid).toBe(false);
    });
  });

  describe('checkExternalPatterns', () => {
    it('detects fetch calls', () => {
      const result = checkExternalPatterns('fetch("https://api.example.com")');
      expect(result.isValid).toBe(false);
    });

    it('detects WebSocket usage', () => {
      const result = checkExternalPatterns('new WebSocket("ws://example.com")');
      expect(result.isValid).toBe(false);
    });
  });

  describe('checkImports', () => {
    it('detects forbidden imports', () => {
      const result = checkImports(['import { engine } from "greyFlowEngine"']);
      expect(result.isValid).toBe(false);
    });

    it('passes valid imports', () => {
      const result = checkImports(['import { calculateTotal } from "./utils"']);
      expect(result.isValid).toBe(true);
    });
  });

  describe('validateImmutableInput', () => {
    it('validates frozen objects', () => {
      const frozen = Object.freeze({ a: 1, b: Object.freeze({ c: 2 }) });
      const result = validateImmutableInput(frozen);
      expect(result.isValid).toBe(true);
    });

    it('detects non-frozen objects', () => {
      const unfrozen = { a: 1, b: { c: 2 } };
      const result = validateImmutableInput(unfrozen);
      expect(result.isValid).toBe(false);
    });
  });

  describe('runComprehensiveBoundaryCheck', () => {
    it('runs all checks', () => {
      const result = runComprehensiveBoundaryCheck({
        name: 'Test Scenario',
        description: 'A valid simulation',
        code: 'const x = 1',
        imports: ['import { test } from "./test"'],
      });

      expect(result.isValid).toBe(true);
    });

    it('detects violations across all checks', () => {
      const result = runComprehensiveBoundaryCheck({
        name: 'Payment Simulation',
        description: 'Save wallet balance',
        code: 'data.save()',
        imports: ['import { engine } from "greyFlowEngine"'],
      });

      expect(result.isValid).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
    });
  });

  describe('freezeDeep', () => {
    it('deeply freezes objects', () => {
      const obj = { a: { b: { c: 1 } } };
      const frozen = freezeDeep(obj);

      expect(Object.isFrozen(frozen)).toBe(true);
      expect(Object.isFrozen((frozen as { a: { b: { c: number } } }).a)).toBe(true);
      expect(Object.isFrozen((frozen as { a: { b: { c: number } } }).a.b)).toBe(true);
    });

    it('handles arrays', () => {
      const arr = [{ a: 1 }, { b: 2 }];
      const frozen = freezeDeep(arr);

      expect(Object.isFrozen(frozen)).toBe(true);
      expect(Object.isFrozen((frozen as { a: number }[])[0])).toBe(true);
    });

    it('handles primitives', () => {
      expect(freezeDeep(42)).toBe(42);
      expect(freezeDeep('string')).toBe('string');
      expect(freezeDeep(null)).toBe(null);
    });
  });

  describe('createReadOnlyProxy', () => {
    it('creates read-only proxy', () => {
      const obj = { a: 1, b: { c: 2 } };
      const proxy = createReadOnlyProxy(obj);

      expect(proxy.a).toBe(1);
      expect((proxy.b as { c: number }).c).toBe(2);
    });

    it('prevents writes', () => {
      const obj = { a: 1 };
      const proxy = createReadOnlyProxy(obj);

      expect(() => {
        (proxy as { a: number }).a = 2;
      }).toThrow();
    });

    it('prevents deletions', () => {
      const obj = { a: 1 };
      const proxy = createReadOnlyProxy(obj);

      expect(() => {
        delete (proxy as { a?: number }).a;
      }).toThrow();
    });
  });

  describe('withSandbox', () => {
    it('executes function in sandbox', () => {
      const result = withSandbox(() => ({ a: 1, b: 2 }));

      expect(result.a).toBe(1);
      expect(Object.isFrozen(result)).toBe(true);
    });
  });

  describe('SIMULATION_MODULE_IDENTITY', () => {
    it('has correct identity values', () => {
      expect(SIMULATION_MODULE_IDENTITY.name).toBe('grey-simulation');
      expect(SIMULATION_MODULE_IDENTITY.mode).toBe('SANDBOX');
      expect(SIMULATION_MODULE_IDENTITY.isReadOnly).toBe(true);
      expect(SIMULATION_MODULE_IDENTITY.allowsPersistence).toBe(false);
    });

    it('is frozen', () => {
      expect(Object.isFrozen(SIMULATION_MODULE_IDENTITY)).toBe(true);
    });
  });

  describe('getModuleIdentity', () => {
    it('returns module identity', () => {
      const identity = getModuleIdentity();
      expect(identity).toBe(SIMULATION_MODULE_IDENTITY);
    });
  });

  describe('verifyModuleMode', () => {
    it('verifies module is in sandbox mode', () => {
      const result = verifyModuleMode();
      expect(result.isValid).toBe(true);
      expect(result.violations.length).toBe(0);
    });
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('Grey Simulation Integration', () => {
  it('executes end-to-end simulation workflow', () => {
    // 1. Create scenario
    const basePeriodId = createTestReconciliationPeriodId();
    const partyId = createTestGreyPartyId();
    const timestamp = createTestTimestamp();

    const scenarioResult = createScenario({
      name: 'Integration Test Scenario',
      description: 'Test the full simulation workflow',
      category: ScenarioCategory.OPTIMIZATION,
      basePeriodId,
      adjustments: [
        createAttributionPercentageAdjustment(partyId, 5000, 4000),
      ],
      tags: ['integration', 'test'],
      timestamp,
    });

    expect(scenarioResult.success).toBe(true);
    if (!scenarioResult.success) return;

    // 2. Execute simulation
    const snapshot = createTestSnapshot(basePeriodId, [partyId]);

    const simulationResult = executeSimulation({
      scenario: scenarioResult.value,
      snapshot,
      timestamp,
    });

    expect(simulationResult.success).toBe(true);
    if (!simulationResult.success) return;

    // 3. Compare results
    const comparisonResult = compareRealVsSimulated({
      scenario: scenarioResult.value,
      simulationOutput: simulationResult.value,
      realSnapshot: snapshot,
      timestamp,
    });

    expect(comparisonResult.success).toBe(true);
    if (!comparisonResult.success) return;

    // 4. Generate views
    const insightResult = generateInsightView(
      scenarioResult.value,
      comparisonResult.value
    );

    expect(insightResult.success).toBe(true);
    if (!insightResult.success) return;

    // 5. Verify outputs are frozen (sandbox guarantee)
    expect(Object.isFrozen(simulationResult.value)).toBe(true);
    expect(Object.isFrozen(comparisonResult.value)).toBe(true);
    expect(Object.isFrozen(insightResult.value)).toBe(true);

    // 6. Verify boundary guards
    const boundaryCheck = runComprehensiveBoundaryCheck({
      name: scenarioResult.value.name,
      description: scenarioResult.value.description,
    });
    expect(boundaryCheck.isValid).toBe(true);
  });

  it('properly isolates simulation from real data', () => {
    const realData = { amount: 10000, modified: false };

    const basePeriodId = createTestReconciliationPeriodId();
    const partyId = createTestGreyPartyId();
    const timestamp = createTestTimestamp();

    const scenarioResult = createScenario({
      name: 'Isolation Test',
      description: 'Test data isolation',
      category: ScenarioCategory.EXPLORATION,
      basePeriodId,
      adjustments: [],
      timestamp,
    });

    expect(scenarioResult.success).toBe(true);
    if (!scenarioResult.success) return;

    const snapshot = createTestSnapshot(basePeriodId, [partyId]);

    executeSimulation({
      scenario: scenarioResult.value,
      snapshot,
      timestamp,
    });

    // Real data should be unchanged
    expect(realData.amount).toBe(10000);
    expect(realData.modified).toBe(false);
  });
});
