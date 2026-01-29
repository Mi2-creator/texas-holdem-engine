/**
 * EngineInvariants.lock.test.ts
 * Phase 36 - Engine Finalization & Freeze
 *
 * INVARIANT LOCK TESTS
 *
 * These tests verify that all engine invariants hold.
 * These tests must NEVER fail after Phase 36.
 * If any test fails, it indicates a violation of the freeze declaration.
 *
 * @final These tests must not be modified to pass - fix the code instead.
 */

import {
  // Version & Freeze
  ENGINE_VERSION,
  ENGINE_VERSION_INFO,
  ENGINE_CAPABILITIES,
  ENGINE_RESTRICTIONS,
  ENGINE_FROZEN,
  ENGINE_FREEZE_DECLARATION,
  verifyVersionIntegrity,
  assertEngineFrozen,
} from '../index';

import { verifyFreezeIntegrity } from '../EngineFreezeDeclaration';

import {
  // Ledger
  ValueLedger,
  createValueLedger,
  LedgerRecorder,
  createLedgerRecorder,
  LedgerView,
  createLedgerView,
  resetLedgerCounters,
  SettlementAttribution,
} from '../../ledger';

import {
  // Invariants
  InvariantChecker,
  createInvariantChecker,
  INVARIANT_SPECS,
  getAllInvariants,
  getCriticalInvariants,
} from '../../ledger';

import {
  // External Adapter
  MockExternalAdapter,
  createMockExternalAdapter,
  AdapterRegistry,
  createAdapterRegistry,
  calculateSimulationChecksum,
} from '../../external-adapter';

import { PlayerId } from '../../security/Identity';
import { TableId, HandId } from '../../security/AuditLog';
import { ClubId } from '../../club/ClubTypes';
import { AgentId } from '../../ledger/LedgerTypes';
import { createStateVersion } from '../../sync/SyncTypes';

// ============================================================================
// Test Helpers
// ============================================================================

const TEST_CLUB_ID = 'club_lock_test' as ClubId;
const TEST_TABLE_ID = 'table_lock_test' as TableId;
const TEST_AGENT_ID = 'agent_lock_test' as AgentId;

function createTestPlayer(index: number): PlayerId {
  return `player_lock_${index}` as PlayerId;
}

function createBalancedSettlement(handIndex: number): SettlementAttribution {
  return {
    handId: `hand_lock_${handIndex}` as HandId,
    tableId: TEST_TABLE_ID,
    clubId: TEST_CLUB_ID,
    stateVersion: createStateVersion(handIndex),
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
// ENGINE FROZEN STATUS
// ============================================================================

describe('Engine Frozen Status', () => {
  test('ENGINE_FROZEN is true', () => {
    expect(ENGINE_FROZEN).toBe(true);
  });

  test('ENGINE_FREEZE_DECLARATION is properly frozen', () => {
    expect(ENGINE_FREEZE_DECLARATION.frozen).toBe(true);
    expect(ENGINE_FREEZE_DECLARATION.phase).toBe(36);
    expect(Object.isFrozen(ENGINE_FREEZE_DECLARATION)).toBe(true);
    expect(Object.isFrozen(ENGINE_FREEZE_DECLARATION.constraints)).toBe(true);
    expect(Object.isFrozen(ENGINE_FREEZE_DECLARATION.allowedChanges)).toBe(true);
    expect(Object.isFrozen(ENGINE_FREEZE_DECLARATION.prohibitedChanges)).toBe(true);
  });

  test('verifyFreezeIntegrity passes', () => {
    const result = verifyFreezeIntegrity();
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('assertEngineFrozen does not throw', () => {
    expect(() => assertEngineFrozen()).not.toThrow();
  });
});

// ============================================================================
// VERSION INTEGRITY
// ============================================================================

describe('Version Integrity', () => {
  test('ENGINE_VERSION matches expected format', () => {
    expect(ENGINE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(ENGINE_VERSION).toBe('1.0.0');
  });

  test('ENGINE_VERSION_INFO is properly frozen', () => {
    expect(Object.isFrozen(ENGINE_VERSION_INFO)).toBe(true);
    expect(ENGINE_VERSION_INFO.frozen).toBe(true);
    expect(ENGINE_VERSION_INFO.phaseNumber).toBe(36);
  });

  test('verifyVersionIntegrity passes', () => {
    const result = verifyVersionIntegrity();
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('ENGINE_CAPABILITIES is frozen with all capabilities true', () => {
    expect(Object.isFrozen(ENGINE_CAPABILITIES)).toBe(true);
    expect(ENGINE_CAPABILITIES.deterministic).toBe(true);
    expect(ENGINE_CAPABILITIES.replayable).toBe(true);
    expect(ENGINE_CAPABILITIES.immutableState).toBe(true);
    expect(ENGINE_CAPABILITIES.appendOnlyLedger).toBe(true);
    expect(ENGINE_CAPABILITIES.hashChainVerification).toBe(true);
    expect(ENGINE_CAPABILITIES.mutationGuards).toBe(true);
  });

  test('ENGINE_RESTRICTIONS is frozen with all restrictions true', () => {
    expect(Object.isFrozen(ENGINE_RESTRICTIONS)).toBe(true);
    expect(ENGINE_RESTRICTIONS.noPayments).toBe(true);
    expect(ENGINE_RESTRICTIONS.noWallets).toBe(true);
    expect(ENGINE_RESTRICTIONS.noCrypto).toBe(true);
    expect(ENGINE_RESTRICTIONS.noTransfers).toBe(true);
    expect(ENGINE_RESTRICTIONS.noClocks).toBe(true);
    expect(ENGINE_RESTRICTIONS.noIO).toBe(true);
    expect(ENGINE_RESTRICTIONS.noAsync).toBe(true);
  });
});

// ============================================================================
// LEDGER CONSERVATION INVARIANT
// ============================================================================

describe('Ledger Conservation Invariant', () => {
  let ledger: ValueLedger;
  let recorder: LedgerRecorder;
  let checker: InvariantChecker;

  beforeEach(() => {
    resetLedgerCounters();
    ledger = createValueLedger();
    recorder = createLedgerRecorder(ledger);
    checker = createInvariantChecker(ledger);
  });

  test('balanced settlement maintains conservation', () => {
    const settlement = createBalancedSettlement(1);
    const result = recorder.recordSettlement(settlement);

    expect(result.success).toBe(true);

    const checkResult = checker.checkAll();
    expect(checkResult.allPassed).toBe(true);
    expect(checkResult.violations).toHaveLength(0);
  });

  test('multiple settlements maintain conservation', () => {
    for (let i = 1; i <= 10; i++) {
      const settlement = createBalancedSettlement(i);
      const result = recorder.recordSettlement(settlement);
      expect(result.success).toBe(true);
    }

    const checkResult = checker.checkAll();
    expect(checkResult.allPassed).toBe(true);
    expect(checkResult.violations).toHaveLength(0);
  });

  test('ledger entries are created with checksums', () => {
    const settlement = createBalancedSettlement(1);
    recorder.recordSettlement(settlement);

    const entries = ledger.getAllEntries();
    expect(entries.length).toBeGreaterThan(0);

    // Each entry has a checksum for integrity verification
    for (const entry of entries) {
      expect(entry.checksum).toBeDefined();
      expect(typeof entry.checksum).toBe('string');
    }
  });

  test('ledger batches are created with checksums', () => {
    const settlement = createBalancedSettlement(1);
    recorder.recordSettlement(settlement);

    const batches = ledger.getAllBatches();
    expect(batches.length).toBeGreaterThan(0);

    // Each batch has a checksum for integrity verification
    for (const batch of batches) {
      expect(batch.checksum).toBeDefined();
      expect(typeof batch.checksum).toBe('string');
    }
  });
});

// ============================================================================
// EXTERNAL ADAPTERS CANNOT MUTATE STATE
// ============================================================================

describe('External Adapters Cannot Mutate State', () => {
  let ledger: ValueLedger;
  let recorder: LedgerRecorder;
  let adapter: MockExternalAdapter;
  let registry: AdapterRegistry;

  beforeEach(() => {
    resetLedgerCounters();
    ledger = createValueLedger();
    recorder = createLedgerRecorder(ledger);
    adapter = createMockExternalAdapter('TestAdapter');
    adapter.enable();
    registry = createAdapterRegistry();
    registry.registerAdapter(adapter);
  });

  test('adapter cannot access mutable ledger methods', () => {
    // Adapter only has export/import methods
    // No direct access to ledger mutation
    expect((adapter as unknown as { recordEntry: unknown }).recordEntry).toBeUndefined();
    expect((adapter as unknown as { mutate: unknown }).mutate).toBeUndefined();
    expect((adapter as unknown as { deleteEntry: unknown }).deleteEntry).toBeUndefined();
  });

  test('view is read-only', () => {
    recorder.recordSettlement(createBalancedSettlement(1));

    const view = createLedgerView(ledger);

    // View only has query methods
    expect(typeof view.query).toBe('function');
    expect(typeof view.getClubSummary).toBe('function');
    expect(typeof view.getTableSummary).toBe('function');

    // View has no mutation methods
    expect((view as unknown as { recordEntry: unknown }).recordEntry).toBeUndefined();
    expect((view as unknown as { deleteEntry: unknown }).deleteEntry).toBeUndefined();
    expect((view as unknown as { updateEntry: unknown }).updateEntry).toBeUndefined();
  });
});

// ============================================================================
// DETERMINISTIC REPLAY
// ============================================================================

describe('Deterministic Replay', () => {
  test('same settlements produce consistent ledger entry counts', () => {
    // First run
    resetLedgerCounters();
    const ledger1 = createValueLedger();
    const recorder1 = createLedgerRecorder(ledger1);

    for (let i = 1; i <= 5; i++) {
      recorder1.recordSettlement(createBalancedSettlement(i));
    }

    // Second run (identical)
    resetLedgerCounters();
    const ledger2 = createValueLedger();
    const recorder2 = createLedgerRecorder(ledger2);

    for (let i = 1; i <= 5; i++) {
      recorder2.recordSettlement(createBalancedSettlement(i));
    }

    // Compare entry counts - same input should produce same number of entries
    expect(ledger1.getAllEntries().length).toBe(ledger2.getAllEntries().length);
    expect(ledger1.getAllBatches().length).toBe(ledger2.getAllBatches().length);

    // Verify entries have checksums
    const entries1 = ledger1.getAllEntries();
    const entries2 = ledger2.getAllEntries();

    for (let i = 0; i < entries1.length; i++) {
      expect(entries1[i].checksum).toBeDefined();
      expect(entries2[i].checksum).toBeDefined();
    }
  });

  test('checksum calculation is deterministic', () => {
    const data = {
      playerId: 'player_1',
      amount: 100,
      nested: { key: 'value', array: [1, 2, 3] },
    };

    const checksum1 = calculateSimulationChecksum(data);
    const checksum2 = calculateSimulationChecksum(data);
    const checksum3 = calculateSimulationChecksum(data);

    expect(checksum1).toBe(checksum2);
    expect(checksum2).toBe(checksum3);
  });

  test('different order same keys produces same checksum', () => {
    const data1 = { a: 1, b: 2, c: 3 };
    const data2 = { c: 3, a: 1, b: 2 };
    const data3 = { b: 2, c: 3, a: 1 };

    const checksum1 = calculateSimulationChecksum(data1);
    const checksum2 = calculateSimulationChecksum(data2);
    const checksum3 = calculateSimulationChecksum(data3);

    expect(checksum1).toBe(checksum2);
    expect(checksum2).toBe(checksum3);
  });
});

// ============================================================================
// NO MUTATION PATHS
// ============================================================================

describe('Ledger Data Integrity', () => {
  let ledger: ValueLedger;
  let adapter: MockExternalAdapter;

  beforeEach(() => {
    resetLedgerCounters();
    ledger = createValueLedger();
    adapter = createMockExternalAdapter('TestAdapter');
    adapter.enable();
  });

  test('entries have checksum for integrity verification', () => {
    const recorder = createLedgerRecorder(ledger);
    recorder.recordSettlement(createBalancedSettlement(1));

    const entries = ledger.getAllEntries();
    const firstEntry = entries[0];

    expect(firstEntry.checksum).toBeDefined();
    expect(typeof firstEntry.checksum).toBe('string');
  });

  test('batches have checksum for integrity verification', () => {
    const recorder = createLedgerRecorder(ledger);
    recorder.recordSettlement(createBalancedSettlement(1));

    const batches = ledger.getAllBatches();
    const firstBatch = batches[0];

    expect(firstBatch.checksum).toBeDefined();
    expect(typeof firstBatch.checksum).toBe('string');
  });

  test('adapter state exports are frozen', () => {
    const state = adapter.exportState();
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.exports)).toBe(true);
    expect(Object.isFrozen(state.references)).toBe(true);
  });
});

// ============================================================================
// INVARIANT SPECIFICATIONS LOCKED
// ============================================================================

describe('Invariant Specifications Locked', () => {
  test('all 5 invariants are defined', () => {
    expect(INVARIANT_SPECS.NON_NEGATIVE_BALANCE).toBeDefined();
    expect(INVARIANT_SPECS.SYSTEM_CONSERVATION).toBeDefined();
    expect(INVARIANT_SPECS.DETERMINISTIC_REPLAY).toBeDefined();
    expect(INVARIANT_SPECS.APPEND_ONLY_INTEGRITY).toBeDefined();
    expect(INVARIANT_SPECS.ATTRIBUTION_IMMUTABILITY).toBeDefined();
  });

  test('getAllInvariants returns 5 invariants', () => {
    const all = getAllInvariants();
    expect(all.length).toBe(5);
  });

  test('getCriticalInvariants returns critical invariants', () => {
    const critical = getCriticalInvariants();
    expect(critical.length).toBeGreaterThan(0);

    for (const inv of critical) {
      expect(inv.severity).toBe('CRITICAL');
    }
  });

  test('INVARIANT_SPECS is defined with all 5 invariants', () => {
    expect(Object.keys(INVARIANT_SPECS).length).toBe(5);
  });
});

// ============================================================================
// FREEZE DECLARATION COMPLIANCE
// ============================================================================

describe('Freeze Declaration Compliance', () => {
  test('constraints array is populated', () => {
    expect(ENGINE_FREEZE_DECLARATION.constraints.length).toBeGreaterThan(0);
  });

  test('allowedChanges array is populated', () => {
    expect(ENGINE_FREEZE_DECLARATION.allowedChanges.length).toBeGreaterThan(0);
  });

  test('prohibitedChanges array is populated', () => {
    expect(ENGINE_FREEZE_DECLARATION.prohibitedChanges.length).toBeGreaterThan(0);
  });

  test('reason is documented', () => {
    expect(ENGINE_FREEZE_DECLARATION.reason.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// HASH CHAIN INTEGRITY
// ============================================================================

describe('Hash Chain Integrity', () => {
  let ledger: ValueLedger;
  let recorder: LedgerRecorder;

  beforeEach(() => {
    resetLedgerCounters();
    ledger = createValueLedger();
    recorder = createLedgerRecorder(ledger);
  });

  test('integrity verification function exists and works', () => {
    recorder.recordSettlement(createBalancedSettlement(1));

    // Ledger should have verification method
    const integrityResult = ledger.verifyIntegrity();
    expect(integrityResult).toBeDefined();
    expect(integrityResult.isValid).toBe(true);
  });

  test('each entry has a checksum', () => {
    recorder.recordSettlement(createBalancedSettlement(1));

    const entries = ledger.getAllEntries();
    expect(entries.length).toBeGreaterThan(0);

    for (const entry of entries) {
      expect(entry.checksum).toBeDefined();
      expect(typeof entry.checksum).toBe('string');
      expect(entry.checksum.length).toBeGreaterThan(0);
    }
  });

  test('each batch has a checksum', () => {
    recorder.recordSettlement(createBalancedSettlement(1));

    const batches = ledger.getAllBatches();
    expect(batches.length).toBeGreaterThan(0);

    for (const batch of batches) {
      expect(batch.checksum).toBeDefined();
      expect(typeof batch.checksum).toBe('string');
      expect(batch.checksum.length).toBeGreaterThan(0);
    }
  });
});
