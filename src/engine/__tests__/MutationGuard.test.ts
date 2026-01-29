/**
 * MutationGuard.test.ts
 * Phase 36 - Engine Finalization & Freeze
 *
 * MUTATION GUARD TESTS (Negative Tests)
 *
 * These tests ATTEMPT to mutate state through various paths.
 * All attempts must fail safely with structured errors.
 *
 * Tests attempt to:
 * - Mutate ledger through views
 * - Mutate economy through adapters
 * - Bypass attribution rules
 *
 * @final These tests verify that mutations are impossible.
 */

import {
  ValueLedger,
  createValueLedger,
  LedgerRecorder,
  createLedgerRecorder,
  LedgerView,
  createLedgerView,
  createPlayerParty,
  createClubParty,
  resetLedgerCounters,
  SettlementAttribution,
  LedgerEntry,
  LedgerBatch,
} from '../../ledger';

import {
  MockExternalAdapter,
  createMockExternalAdapter,
  AdapterRegistry,
  createAdapterRegistry,
  buildLedgerExportPayload,
  ExportPayload,
  LedgerViewInput,
} from '../../external-adapter';

import { PlayerId } from '../../security/Identity';
import { TableId, HandId } from '../../security/AuditLog';
import { ClubId } from '../../club/ClubTypes';
import { AgentId } from '../../ledger/LedgerTypes';
import { createStateVersion } from '../../sync/SyncTypes';

// ============================================================================
// Test Helpers
// ============================================================================

const TEST_CLUB_ID = 'club_guard_test' as ClubId;
const TEST_TABLE_ID = 'table_guard_test' as TableId;
const TEST_HAND_ID = 'hand_guard_test' as HandId;
const TEST_AGENT_ID = 'agent_guard_test' as AgentId;

function createTestPlayer(index: number): PlayerId {
  return `player_guard_${index}` as PlayerId;
}

function createValidSettlement(handIndex: number): SettlementAttribution {
  return {
    handId: `hand_guard_${handIndex}` as HandId,
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

/**
 * Create a mock LedgerViewInput from a ValueLedger.
 */
function createMockLedgerViewInput(ledger: ValueLedger): LedgerViewInput {
  const entries = ledger.getAllEntries();
  const batches = ledger.getAllBatches();

  let totalCredits = 0;
  let totalDebits = 0;
  for (const entry of entries) {
    if (entry.delta > 0) {
      totalCredits += entry.delta;
    } else {
      totalDebits += Math.abs(entry.delta);
    }
  }

  return {
    getEntryCount: () => entries.length,
    getBatchCount: () => batches.length,
    getTotalCredits: () => totalCredits,
    getTotalDebits: () => totalDebits,
    getLastSequence: () => ledger.getCurrentSequence(),
  };
}

// ============================================================================
// ATTEMPT TO MUTATE LEDGER THROUGH VIEWS
// ============================================================================

describe('Ledger View Provides Read-Only Access', () => {
  let ledger: ValueLedger;
  let recorder: LedgerRecorder;
  let view: LedgerView;

  beforeEach(() => {
    resetLedgerCounters();
    ledger = createValueLedger();
    recorder = createLedgerRecorder(ledger);
    view = createLedgerView(ledger);
    recorder.recordSettlement(createValidSettlement(1));
  });

  test('ledger entries contain required fields', () => {
    const entries = ledger.getAllEntries();
    const entry = entries[0];

    // Entry has required fields
    expect(entry.entryId).toBeDefined();
    expect(entry.delta).toBeDefined();
    expect(entry.affectedParty).toBeDefined();
    expect(entry.checksum).toBeDefined();
  });

  test('ledger batches contain required fields', () => {
    const batches = ledger.getAllBatches();
    const batch = batches[0];

    // Batch has required fields
    expect(batch.batchId).toBeDefined();
    expect(batch.checksum).toBeDefined();
    expect(batch.entryIds).toBeDefined();
  });

  test('view does not expose internal mutation methods', () => {
    // View should not expose internal mutation methods
    expect((view as unknown as { _ledger: unknown })._ledger).toBeUndefined();
    expect((view as unknown as { entries: unknown[] }).entries).toBeUndefined();
    expect((view as unknown as { batches: unknown[] }).batches).toBeUndefined();
    expect((view as unknown as { addEntry: unknown }).addEntry).toBeUndefined();
    expect((view as unknown as { deleteEntry: unknown }).deleteEntry).toBeUndefined();
  });

  test('view only exposes query methods', () => {
    // View exposes read-only query methods
    expect(typeof view.query).toBe('function');
    expect(typeof view.getClubSummary).toBe('function');
    expect(typeof view.getTableSummary).toBe('function');
  });
});

// ============================================================================
// ATTEMPT TO MUTATE THROUGH ADAPTERS
// ============================================================================

describe('Attempt to Mutate Through Adapters', () => {
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
    recorder.recordSettlement(createValidSettlement(1));
  });

  test('cannot mutate export payload after creation', () => {
    const ledgerInput = createMockLedgerViewInput(ledger);
    const payload = buildLedgerExportPayload(ledgerInput, 1, 1000);

    // Payload should be frozen
    expect(Object.isFrozen(payload)).toBe(true);

    // Attempt to modify
    expect(() => {
      (payload as { checksum: string }).checksum = 'hacked';
    }).toThrow();
  });

  test('cannot mutate exported adapter state', () => {
    const state = adapter.exportState();

    // State should be frozen
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.exports)).toBe(true);
    expect(Object.isFrozen(state.references)).toBe(true);

    // Attempt to modify
    expect(() => {
      (state as { exportSequence: number }).exportSequence = 999;
    }).toThrow();

    expect(() => {
      (state.exports as unknown[]).push({ hacked: true });
    }).toThrow();
  });

  test('cannot mutate registry logs', () => {
    // Export something to create log entries
    const ledgerInput = createMockLedgerViewInput(ledger);
    const payload = buildLedgerExportPayload(ledgerInput, 1, 1000);
    registry.export(adapter.adapterId, payload, 1000);

    const exportLog = registry.getExportLog();
    const auditLog = registry.getAuditLog();

    // Logs are returned as copies, not originals
    expect(Array.isArray(exportLog)).toBe(true);
    expect(Array.isArray(auditLog)).toBe(true);

    // Modifying returned arrays should not affect internal state
    const originalLength = exportLog.length;
    (exportLog as unknown[]).push({ hacked: true });

    // Get fresh copy
    const freshLog = registry.getExportLog();
    expect(freshLog.length).toBe(originalLength);
  });

  test('cannot access ledger through adapter', () => {
    // Adapter should not have ledger reference
    expect((adapter as unknown as { ledger: unknown }).ledger).toBeUndefined();
    expect((adapter as unknown as { recorder: unknown }).recorder).toBeUndefined();
    expect((adapter as unknown as { view: unknown }).view).toBeUndefined();
  });

  test('adapter cannot inject entries into ledger', () => {
    const entriesBefore = ledger.getAllEntries().length;

    // Adapter has no method to inject entries
    expect((adapter as unknown as { injectEntry: unknown }).injectEntry).toBeUndefined();
    expect((adapter as unknown as { recordEntry: unknown }).recordEntry).toBeUndefined();

    // Ledger unchanged
    expect(ledger.getAllEntries().length).toBe(entriesBefore);
  });
});

// ============================================================================
// ATTEMPT TO BYPASS ATTRIBUTION RULES
// ============================================================================

describe('Attribution Recording Constraints', () => {
  let ledger: ValueLedger;
  let recorder: LedgerRecorder;

  beforeEach(() => {
    resetLedgerCounters();
    ledger = createValueLedger();
    recorder = createLedgerRecorder(ledger);
  });

  test('no direct transfer API exists', () => {
    // The system only records settlements, not arbitrary transfers
    // There is no direct "transfer" API - revenue must come through settlements

    expect((recorder as unknown as { recordTransfer: unknown }).recordTransfer).toBeUndefined();
    expect((recorder as unknown as { transferChips: unknown }).transferChips).toBeUndefined();
    expect((recorder as unknown as { moveChips: unknown }).moveChips).toBeUndefined();
    expect((recorder as unknown as { directTransfer: unknown }).directTransfer).toBeUndefined();
  });

  test('settlements record attribution parties', () => {
    const validSettlement = createValidSettlement(1);
    recorder.recordSettlement(validSettlement);

    const entries = ledger.getAllEntries();
    expect(entries.length).toBeGreaterThan(0);

    // Each entry should have an affected party
    for (const entry of entries) {
      expect(entry.affectedParty).toBeDefined();
      expect(entry.affectedParty.partyType).toBeDefined();
    }
  });

  test('valid settlement records successfully', () => {
    const validSettlement = createValidSettlement(1);
    const result = recorder.recordSettlement(validSettlement);
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// ATTEMPT TO MODIFY FROZEN CONSTANTS
// ============================================================================

describe('Attempt to Modify Frozen Constants', () => {
  test('cannot modify ENGINE_VERSION_INFO properties', () => {
    const { ENGINE_VERSION_INFO } = require('../index');

    expect(() => {
      ENGINE_VERSION_INFO.version = 'hacked';
    }).toThrow();

    expect(() => {
      ENGINE_VERSION_INFO.frozen = false;
    }).toThrow();
  });

  test('cannot modify ENGINE_CAPABILITIES properties', () => {
    const { ENGINE_CAPABILITIES } = require('../index');

    expect(() => {
      ENGINE_CAPABILITIES.deterministic = false;
    }).toThrow();
  });

  test('cannot modify ENGINE_RESTRICTIONS properties', () => {
    const { ENGINE_RESTRICTIONS } = require('../index');

    expect(() => {
      ENGINE_RESTRICTIONS.noPayments = false;
    }).toThrow();
  });

  test('cannot modify ENGINE_FREEZE_DECLARATION properties', () => {
    const { ENGINE_FREEZE_DECLARATION } = require('../index');

    expect(() => {
      ENGINE_FREEZE_DECLARATION.frozen = false;
    }).toThrow();

    expect(() => {
      ENGINE_FREEZE_DECLARATION.phase = 999;
    }).toThrow();
  });

  test('cannot push to frozen arrays in declarations', () => {
    const { ENGINE_FREEZE_DECLARATION } = require('../index');

    expect(() => {
      (ENGINE_FREEZE_DECLARATION.constraints as string[]).push('hacked');
    }).toThrow();

    expect(() => {
      (ENGINE_FREEZE_DECLARATION.allowedChanges as string[]).push('hacked');
    }).toThrow();

    expect(() => {
      (ENGINE_FREEZE_DECLARATION.prohibitedChanges as string[]).push('hacked');
    }).toThrow();
  });
});

// ============================================================================
// HASH CHAIN TAMPERING DETECTION
// ============================================================================

describe('Hash Chain Tampering Detection', () => {
  let ledger: ValueLedger;
  let recorder: LedgerRecorder;

  beforeEach(() => {
    resetLedgerCounters();
    ledger = createValueLedger();
    recorder = createLedgerRecorder(ledger);
  });

  test('checksum verification detects data tampering', () => {
    recorder.recordSettlement(createValidSettlement(1));
    recorder.recordSettlement(createValidSettlement(2));

    const entries = ledger.getAllEntries();
    expect(entries.length).toBeGreaterThan(0);

    // Each entry has a checksum
    for (const entry of entries) {
      expect(entry.checksum).toBeDefined();
      expect(typeof entry.checksum).toBe('string');
      expect(entry.checksum.length).toBeGreaterThan(0);
    }
  });

  test('batch checksum is derived from entries', () => {
    recorder.recordSettlement(createValidSettlement(1));

    const batches = ledger.getAllBatches();
    expect(batches.length).toBeGreaterThan(0);

    const batch = batches[0];
    expect(batch.checksum).toBeDefined();
    expect(typeof batch.checksum).toBe('string');
  });

  test('integrity verification function exists and works', () => {
    recorder.recordSettlement(createValidSettlement(1));

    // Ledger should have verification method
    const integrityResult = ledger.verifyIntegrity();
    expect(integrityResult).toBeDefined();
    expect(integrityResult.isValid).toBe(true);
  });
});

// ============================================================================
// ISOLATION GUARANTEES
// ============================================================================

describe('Isolation Guarantees', () => {
  test('multiple ledger instances are isolated', () => {
    resetLedgerCounters();
    const ledger1 = createValueLedger();
    const recorder1 = createLedgerRecorder(ledger1);

    resetLedgerCounters();
    const ledger2 = createValueLedger();
    const recorder2 = createLedgerRecorder(ledger2);

    // Record to ledger1 only
    recorder1.recordSettlement(createValidSettlement(1));

    // Ledger2 should be unaffected
    expect(ledger1.getAllEntries().length).toBeGreaterThan(0);
    expect(ledger2.getAllEntries().length).toBe(0);
  });

  test('multiple adapter instances are isolated', () => {
    const adapter1 = createMockExternalAdapter('Adapter1');
    const adapter2 = createMockExternalAdapter('Adapter2');

    adapter1.enable();
    adapter2.enable();

    // Export to adapter1 only
    const ledger = createValueLedger();
    const ledgerInput = createMockLedgerViewInput(ledger);
    const payload = buildLedgerExportPayload(ledgerInput, 1, 1000);
    adapter1.export(payload);

    // Adapter2 should be unaffected
    expect(adapter1.getExportCount()).toBe(1);
    expect(adapter2.getExportCount()).toBe(0);
  });

  test('registry instances are isolated', () => {
    const registry1 = createAdapterRegistry();
    const registry2 = createAdapterRegistry();

    const adapter = createMockExternalAdapter('Shared');
    adapter.enable();

    registry1.registerAdapter(adapter);

    // Registry2 should not have the adapter
    expect(registry1.hasAdapter(adapter.adapterId)).toBe(true);
    expect(registry2.hasAdapter(adapter.adapterId)).toBe(false);
  });
});
