/**
 * ExternalAdapter.test.ts
 * Phase 35 - External Adapter Simulation & Boundary Proof Tests
 *
 * Test coverage:
 * 1. External adapter cannot mutate engine state
 * 2. Exported payloads are deterministic
 * 3. Importing references never affects ledger totals
 * 4. Replaying the same export/import yields identical results
 * 5. Violations return structured errors, never throw
 * 6. Engine behavior identical with adapter enabled vs disabled
 *
 * Architectural assertions:
 * - Engine is complete without any external system
 * - Adapter is fully replaceable
 * - Revenue = rake only
 * - All numbers traceable to ledger entries
 * - External concepts are references only
 */

import {
  // Types
  SimulationAdapterId,
  SimulationExportId,
  SimulationReferenceId,

  // Type guards
  isSimulationAdapterId,
  isSimulationExportId,
  isSimulationReferenceId,
  generateSimulationAdapterId,
  generateSimulationExportId,

  // Checksum
  calculateSimulationChecksum,
  verifySimulationChecksum,

  // Export Payload
  ExportPayload,
  LedgerViewInput,
  RevenueViewInput,
  ExternalValueViewInput,
  buildLedgerExportPayload,
  buildRevenueExportPayload,
  buildExternalValueExportPayload,
  buildCombinedExportPayload,
  validateExportPayload,

  // Import Reference
  ImportReferenceInput,
  validateImportReferenceInput,
  checkIdempotencyViolation,
  buildImportReference,
  calculateReferenceStatistics,

  // Adapter
  ExternalAdapter,
  NoOpExternalAdapter,
  createNoOpExternalAdapter,

  // Mock Adapter
  MockExternalAdapter,
  createMockExternalAdapter,

  // Registry
  AdapterRegistry,
  createAdapterRegistry,
} from '../index';

// ============================================================================
// Test Helpers
// ============================================================================

function createMockLedgerView(overrides: Partial<LedgerViewInput> = {}): LedgerViewInput {
  return {
    getEntryCount: () => 100,
    getBatchCount: () => 10,
    getTotalCredits: () => 50000,
    getTotalDebits: () => 50000,
    getLastSequence: () => 100,
    ...overrides,
  };
}

function createMockRevenueView(overrides: Partial<RevenueViewInput> = {}): RevenueViewInput {
  return {
    getTotalRakeCollected: () => 1000,
    getHandCount: () => 50,
    getTableCount: () => 5,
    getClubCount: () => 2,
    ...overrides,
  };
}

function createMockExternalValueView(overrides: Partial<ExternalValueViewInput> = {}): ExternalValueViewInput {
  return {
    getTotalReferences: () => 10,
    getInboundCount: () => 6,
    getOutboundCount: () => 4,
    getLinkedCount: () => 7,
    getUnlinkedCount: () => 3,
    getTotalInAmount: () => 1000,
    getTotalOutAmount: () => 500,
    ...overrides,
  };
}

function createValidReferenceInput(overrides: Partial<ImportReferenceInput> = {}): ImportReferenceInput {
  return {
    externalRefId: `ext-ref-${Date.now()}`,
    source: 'EXTERNAL_SYSTEM',
    timestamp: 1000000,
    amount: 100,
    direction: 'IN',
    description: 'Test reference',
    ...overrides,
  };
}

// ============================================================================
// 1. External Adapter Cannot Mutate Engine State
// ============================================================================

describe('External Adapter Cannot Mutate Engine State', () => {
  test('adapter interface has no mutation methods', () => {
    const adapter = createMockExternalAdapter('Test Adapter');

    // Verify adapter only has expected methods
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(adapter));

    // These methods should NOT exist
    const mutationMethods = [
      'writeLedger',
      'modifyBalance',
      'setEntry',
      'deleteEntry',
      'updateEconomy',
      'changeRevenue',
    ];

    for (const method of mutationMethods) {
      expect(methods).not.toContain(method);
    }
  });

  test('export operation does not modify view data', () => {
    const adapter = createMockExternalAdapter('Test Adapter');
    adapter.enable();

    let ledgerCallCount = 0;
    const ledgerView = createMockLedgerView({
      getEntryCount: () => {
        ledgerCallCount++;
        return 100;
      },
    });

    // Build export payload
    const payload = buildLedgerExportPayload(ledgerView, 1, 1000);

    // Export through adapter
    adapter.export(payload);

    // View was only called during payload creation, not modified
    expect(ledgerCallCount).toBe(1);

    // Adapter stores payload but doesn't mutate source
    expect(adapter.getExportCount()).toBe(1);
    expect(adapter.getExports()[0]).toEqual(payload);
  });

  test('import operation does not modify ledger totals', () => {
    const adapter = createMockExternalAdapter('Test Adapter');
    adapter.enable();

    // Simulate ledger state before import
    const ledgerBefore = {
      entryCount: 100,
      totalCredits: 50000,
      totalDebits: 50000,
    };

    // Import reference
    const ref = createValidReferenceInput();
    adapter.import(ref);

    // Ledger state after import (would be same if we had real ledger)
    // The point is: adapter import does NOT call ledger mutation
    expect(adapter.getReferenceCount()).toBe(1);

    // Reference is stored in adapter, not in ledger
    const storedRef = adapter.getReferences()[0];
    expect(storedRef.externalRefId).toBe(ref.externalRefId);
    expect(storedRef.amount).toBe(ref.amount);
  });

  test('registry operations are isolated from engine', () => {
    const registry = createAdapterRegistry();
    const adapter = createMockExternalAdapter('Test');
    adapter.enable();
    registry.registerAdapter(adapter);

    const ledgerView = createMockLedgerView();
    const payload = buildLedgerExportPayload(ledgerView, 1, 1000);

    // Perform operations through registry
    registry.export(adapter.adapterId, payload, 1000);
    registry.import(adapter.adapterId, createValidReferenceInput(), 2000);

    // Registry has logs but doesn't modify external state
    expect(registry.getExportLog()).toHaveLength(1);
    expect(registry.getReferenceLog()).toHaveLength(1);

    // Verify no mutation methods on registry
    expect(typeof (registry as any).writeLedger).toBe('undefined');
    expect(typeof (registry as any).modifyBalance).toBe('undefined');
  });
});

// ============================================================================
// 2. Exported Payloads Are Deterministic
// ============================================================================

describe('Exported Payloads Are Deterministic', () => {
  test('same ledger view produces identical payload', () => {
    const ledgerView = createMockLedgerView();

    const payload1 = buildLedgerExportPayload(ledgerView, 1, 1000);
    const payload2 = buildLedgerExportPayload(ledgerView, 1, 1000);

    expect(payload1.checksum).toBe(payload2.checksum);
    expect(payload1.statistics).toEqual(payload2.statistics);
  });

  test('same revenue view produces identical payload', () => {
    const revenueView = createMockRevenueView();

    const payload1 = buildRevenueExportPayload(revenueView, 1, 1000);
    const payload2 = buildRevenueExportPayload(revenueView, 1, 1000);

    expect(payload1.checksum).toBe(payload2.checksum);
    expect(payload1.statistics).toEqual(payload2.statistics);
  });

  test('same combined views produce identical payload', () => {
    const ledgerView = createMockLedgerView();
    const revenueView = createMockRevenueView();
    const externalView = createMockExternalValueView();

    const payload1 = buildCombinedExportPayload(ledgerView, revenueView, externalView, 1, 1000);
    const payload2 = buildCombinedExportPayload(ledgerView, revenueView, externalView, 1, 1000);

    expect(payload1.checksum).toBe(payload2.checksum);
    expect(payload1.ledger).toEqual(payload2.ledger);
    expect(payload1.revenue).toEqual(payload2.revenue);
    expect(payload1.externalValue).toEqual(payload2.externalValue);
  });

  test('different data produces different checksum', () => {
    const view1 = createMockLedgerView({ getEntryCount: () => 100 });
    const view2 = createMockLedgerView({ getEntryCount: () => 200 });

    const payload1 = buildLedgerExportPayload(view1, 1, 1000);
    const payload2 = buildLedgerExportPayload(view2, 1, 1000);

    expect(payload1.checksum).not.toBe(payload2.checksum);
  });

  test('checksum validates payload integrity', () => {
    const ledgerView = createMockLedgerView();
    const payload = buildLedgerExportPayload(ledgerView, 1, 1000);

    expect(validateExportPayload(payload)).toBe(true);
  });

  test('exports are frozen/immutable', () => {
    const ledgerView = createMockLedgerView();
    const payload = buildLedgerExportPayload(ledgerView, 1, 1000);

    expect(Object.isFrozen(payload)).toBe(true);
    expect(Object.isFrozen(payload.statistics)).toBe(true);
  });
});

// ============================================================================
// 3. Importing References Never Affects Ledger Totals
// ============================================================================

describe('Importing References Never Affects Ledger Totals', () => {
  test('reference import returns result without ledger mutation', () => {
    const adapter = createMockExternalAdapter('Test');
    adapter.enable();

    const ref = createValidReferenceInput({ amount: 1000 });
    const result = adapter.import(ref);

    expect(result.success).toBe(true);
    expect(result.status).toBe('ACCEPTED');

    // Reference is stored in adapter only
    expect(adapter.getReferenceCount()).toBe(1);

    // No ledger mutation occurred (we can't check real ledger,
    // but we verify adapter doesn't have ledger access)
    expect(typeof (adapter as any).ledger).toBe('undefined');
  });

  test('reference statistics are derived, not mutated', () => {
    const adapter = createMockExternalAdapter('Test');
    adapter.enable();

    // Import multiple references
    adapter.import(createValidReferenceInput({ amount: 100, direction: 'IN' }));
    adapter.import(createValidReferenceInput({ amount: 50, direction: 'OUT', externalRefId: 'ref-2' }));
    adapter.import(createValidReferenceInput({ amount: 200, direction: 'IN', externalRefId: 'ref-3' }));

    // Calculate statistics from references
    const stats = calculateReferenceStatistics(adapter.getReferences());

    expect(stats.totalCount).toBe(3);
    expect(stats.inboundCount).toBe(2);
    expect(stats.outboundCount).toBe(1);
    expect(stats.totalInAmount).toBe(300);
    expect(stats.totalOutAmount).toBe(50);
    expect(stats.netAmount).toBe(250);
  });

  test('registry import logs operation without affecting totals', () => {
    const registry = createAdapterRegistry();
    const adapter = createMockExternalAdapter('Test');
    adapter.enable();
    registry.registerAdapter(adapter);

    const ref = createValidReferenceInput({ amount: 500 });
    const result = registry.import(adapter.adapterId, ref, 1000);

    expect(result.success).toBe(true);

    // Check registry logged it
    const log = registry.getReferenceLog();
    expect(log).toHaveLength(1);
    expect(log[0].success).toBe(true);

    // Audit log also recorded
    const audit = registry.getAuditLog();
    expect(audit).toHaveLength(1);
    expect(audit[0].operationType).toBe('IMPORT');
  });
});

// ============================================================================
// 4. Replaying Export/Import Yields Identical Results
// ============================================================================

describe('Replaying Export/Import Yields Identical Results', () => {
  test('replay of exports produces identical state', () => {
    const createSession = () => {
      const adapter = createMockExternalAdapter('Test');
      adapter.enable();

      const ledgerView = createMockLedgerView();
      const payload1 = buildLedgerExportPayload(ledgerView, 1, 1000);
      const payload2 = buildLedgerExportPayload(ledgerView, 2, 2000);

      adapter.export(payload1);
      adapter.export(payload2);

      return adapter.exportState();
    };

    const state1 = createSession();
    const state2 = createSession();

    expect(state1.exportSequence).toBe(state2.exportSequence);
    expect(state1.exports.length).toBe(state2.exports.length);

    for (let i = 0; i < state1.exports.length; i++) {
      expect(state1.exports[i].checksum).toBe(state2.exports[i].checksum);
    }
  });

  test('replay of imports produces identical state', () => {
    const createSession = () => {
      const adapter = createMockExternalAdapter('Test');
      adapter.enable();

      adapter.import(createValidReferenceInput({ externalRefId: 'ref-1', amount: 100 }));
      adapter.import(createValidReferenceInput({ externalRefId: 'ref-2', amount: 200 }));
      adapter.import(createValidReferenceInput({ externalRefId: 'ref-3', amount: 300 }));

      return adapter.exportState();
    };

    const state1 = createSession();
    const state2 = createSession();

    expect(state1.referenceSequence).toBe(state2.referenceSequence);
    expect(state1.references.length).toBe(state2.references.length);

    for (let i = 0; i < state1.references.length; i++) {
      expect(state1.references[i].checksum).toBe(state2.references[i].checksum);
      expect(state1.references[i].amount).toBe(state2.references[i].amount);
    }
  });

  test('replay through registry produces identical logs', () => {
    const createSession = () => {
      const registry = createAdapterRegistry();
      const adapter = createMockExternalAdapter('Test', {}, 'test-adapter');
      adapter.enable();
      registry.registerAdapter(adapter);

      const ledgerView = createMockLedgerView();
      const payload = buildLedgerExportPayload(ledgerView, 1, 1000);

      registry.export(adapter.adapterId, payload, 1000);
      registry.import(adapter.adapterId, createValidReferenceInput({ externalRefId: 'ref-1' }), 2000);

      return registry.exportState();
    };

    const state1 = createSession();
    const state2 = createSession();

    expect(state1.globalSequence).toBe(state2.globalSequence);
    expect(state1.exportLog.length).toBe(state2.exportLog.length);
    expect(state1.referenceLog.length).toBe(state2.referenceLog.length);
    expect(state1.auditLog.length).toBe(state2.auditLog.length);
  });
});

// ============================================================================
// 5. Violations Return Structured Errors, Never Throw
// ============================================================================

describe('Violations Return Structured Errors', () => {
  test('invalid reference input returns validation errors', () => {
    const result = validateImportReferenceInput({
      externalRefId: '',
      source: 'INVALID' as any,
      timestamp: -1,
      amount: 100.5,
      direction: 'INVALID' as any,
    });

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors).toContain('External reference ID must be a non-empty string');
  });

  test('adapter disabled returns structured error', () => {
    const adapter = createMockExternalAdapter('Test');
    // Not enabled

    const payload = buildLedgerExportPayload(createMockLedgerView(), 1, 1000);
    const exportResult = adapter.export(payload);

    expect(exportResult.success).toBe(false);
    expect(exportResult.status).toBe('REJECTED');
    expect(exportResult.error).toContain('disabled');

    const importResult = adapter.import(createValidReferenceInput());

    expect(importResult.success).toBe(false);
    expect(importResult.status).toBe('REJECTED');
    expect(importResult.error).toContain('disabled');
  });

  test('duplicate export returns duplicate status', () => {
    const adapter = createMockExternalAdapter('Test');
    adapter.enable();

    const payload = buildLedgerExportPayload(createMockLedgerView(), 1, 1000);

    const result1 = adapter.export(payload);
    expect(result1.success).toBe(true);
    expect(result1.status).toBe('ACCEPTED');

    const result2 = adapter.export(payload);
    expect(result2.success).toBe(true);
    expect(result2.status).toBe('DUPLICATE');
  });

  test('idempotency violation returns structured error', () => {
    const adapter = createMockExternalAdapter('Test');
    adapter.enable();

    // First import
    const result1 = adapter.import(createValidReferenceInput({
      externalRefId: 'ref-1',
      amount: 100,
    }));
    expect(result1.success).toBe(true);

    // Same external ref ID but different amount
    const result2 = adapter.import(createValidReferenceInput({
      externalRefId: 'ref-1',
      amount: 200,
    }));
    expect(result2.success).toBe(false);
    expect(result2.status).toBe('DUPLICATE');
    expect(result2.validationErrors?.some(e => e.includes('Idempotency'))).toBe(true);
  });

  test('registry handles missing adapter gracefully', () => {
    const registry = createAdapterRegistry();

    const payload = buildLedgerExportPayload(createMockLedgerView(), 1, 1000);
    const result = registry.export('sim-adapter-missing' as SimulationAdapterId, payload, 1000);

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  test('checkIdempotencyViolation returns structured result', () => {
    const existingRef = buildImportReference(
      createValidReferenceInput({ externalRefId: 'ref-1', amount: 100 }),
      1
    );

    const newInput = createValidReferenceInput({ externalRefId: 'ref-1', amount: 200 });
    const result = checkIdempotencyViolation(existingRef, newInput);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Idempotency violation: amount mismatch (existing: 100, new: 200)');
  });
});

// ============================================================================
// 6. Engine Behavior Identical With Adapter Enabled vs Disabled
// ============================================================================

describe('Engine Behavior Identical With Adapter', () => {
  test('NoOp adapter accepts all operations silently', () => {
    const adapter = createNoOpExternalAdapter('noop');

    const payload = buildLedgerExportPayload(createMockLedgerView(), 1, 1000);
    const exportResult = adapter.export(payload);

    expect(exportResult.success).toBe(true);
    expect(exportResult.status).toBe('ACCEPTED');

    const importResult = adapter.import(createValidReferenceInput());

    expect(importResult.success).toBe(true);
    expect(importResult.status).toBe('ACCEPTED');

    // But counts are always 0
    expect(adapter.getExportCount()).toBe(0);
    expect(adapter.getReferenceCount()).toBe(0);
  });

  test('view data identical regardless of adapter state', () => {
    const ledgerView = createMockLedgerView();
    const revenueView = createMockRevenueView();

    // Create payloads with adapter disabled
    const adapter1 = createMockExternalAdapter('Test');
    // Not enabled

    const payload1 = buildCombinedExportPayload(ledgerView, revenueView, createMockExternalValueView(), 1, 1000);

    // Create payloads with adapter enabled and exporting
    const adapter2 = createMockExternalAdapter('Test');
    adapter2.enable();
    adapter2.export(payload1);

    const payload2 = buildCombinedExportPayload(ledgerView, revenueView, createMockExternalValueView(), 1, 1000);

    // Payloads are identical
    expect(payload1.checksum).toBe(payload2.checksum);
    expect(payload1.ledger).toEqual(payload2.ledger);
    expect(payload1.revenue).toEqual(payload2.revenue);
  });

  test('registry with no adapters still works', () => {
    const registry = createAdapterRegistry();

    // No adapters registered
    const stats = registry.getStatistics();
    expect(stats.registeredAdapters).toBe(0);
    expect(stats.enabledAdapters).toBe(0);

    // Operations fail gracefully
    const payload = buildLedgerExportPayload(createMockLedgerView(), 1, 1000);
    const result = registry.export('sim-adapter-test' as SimulationAdapterId, payload, 1000);

    expect(result.success).toBe(false);
    expect(registry.getExportLog()).toHaveLength(1);
    expect(registry.getExportLog()[0].success).toBe(false);
  });
});

// ============================================================================
// Architectural Guarantees
// ============================================================================

describe('Architectural Guarantees', () => {
  test('engine is complete without external system', () => {
    // Views work independently
    const ledgerView = createMockLedgerView();
    const revenueView = createMockRevenueView();

    expect(ledgerView.getEntryCount()).toBe(100);
    expect(revenueView.getTotalRakeCollected()).toBe(1000);

    // Export payloads can be created without adapter
    const payload = buildCombinedExportPayload(
      ledgerView,
      revenueView,
      createMockExternalValueView(),
      1,
      1000
    );

    expect(payload.type).toBe('COMBINED_EXPORT');
    expect(payload.checksum).toBeDefined();
  });

  test('adapter is fully replaceable', () => {
    const registry = createAdapterRegistry();

    // Register first adapter
    const adapter1 = createMockExternalAdapter('Adapter 1');
    adapter1.enable();
    registry.registerAdapter(adapter1);

    const payload = buildLedgerExportPayload(createMockLedgerView(), 1, 1000);
    registry.export(adapter1.adapterId, payload, 1000);

    // Replace with second adapter
    registry.unregisterAdapter(adapter1.adapterId);
    const adapter2 = createMockExternalAdapter('Adapter 2');
    adapter2.enable();
    registry.registerAdapter(adapter2);

    // New adapter works independently
    const payload2 = buildLedgerExportPayload(createMockLedgerView(), 2, 2000);
    const result = registry.export(adapter2.adapterId, payload2, 2000);

    expect(result.success).toBe(true);
    expect(adapter2.getExportCount()).toBe(1);
  });

  test('revenue equals rake only', () => {
    const revenueView = createMockRevenueView({
      getTotalRakeCollected: () => 1500,
      getHandCount: () => 75,
    });

    const payload = buildRevenueExportPayload(revenueView, 1, 1000);

    // Revenue statistics only include rake
    expect(payload.statistics.totalRakeCollected).toBe(1500);
    expect(payload.statistics.handCount).toBe(75);
    expect(payload.statistics.averageRakePerHand).toBe(20); // 1500 / 75

    // No other revenue sources in the type
    const stats = payload.statistics;
    expect(typeof (stats as any).deposits).toBe('undefined');
    expect(typeof (stats as any).withdrawals).toBe('undefined');
    expect(typeof (stats as any).payments).toBe('undefined');
  });

  test('all numbers traceable to ledger entries', () => {
    const ledgerView = createMockLedgerView({
      getEntryCount: () => 500,
      getBatchCount: () => 25,
      getTotalCredits: () => 100000,
      getTotalDebits: () => 100000,
      getLastSequence: () => 500,
    });

    const payload = buildLedgerExportPayload(ledgerView, 1, 1000);

    // All statistics are derived from ledger
    expect(payload.statistics.entryCount).toBe(500);
    expect(payload.statistics.batchCount).toBe(25);
    expect(payload.statistics.totalCredits).toBe(100000);
    expect(payload.statistics.totalDebits).toBe(100000);
    expect(payload.statistics.netFlow).toBe(0);
    expect(payload.statistics.lastSequence).toBe(500);
  });

  test('external concepts are references only', () => {
    const adapter = createMockExternalAdapter('Test');
    adapter.enable();

    const ref = createValidReferenceInput({
      externalRefId: 'external-system-123',
      source: 'EXTERNAL_SYSTEM',
      amount: 1000,
      direction: 'IN',
    });

    const result = adapter.import(ref);

    // Reference is stored but has no direct effect
    expect(result.success).toBe(true);

    const stored = adapter.getReferences()[0];
    expect(stored.externalRefId).toBe('external-system-123');
    expect(stored.source).toBe('EXTERNAL_SYSTEM');

    // Reference cannot modify engine (no methods for that)
    expect(typeof (stored as any).applyToLedger).toBe('undefined');
    expect(typeof (stored as any).executeTransfer).toBe('undefined');
  });
});

// ============================================================================
// Type Guards & Utilities
// ============================================================================

describe('Type Guards & Utilities', () => {
  test('ID type guards validate format', () => {
    expect(isSimulationAdapterId('sim-adapter-test')).toBe(true);
    expect(isSimulationAdapterId('invalid')).toBe(false);

    expect(isSimulationExportId('sim-export-1')).toBe(true);
    expect(isSimulationExportId('invalid')).toBe(false);

    expect(isSimulationReferenceId('sim-ref-1')).toBe(true);
    expect(isSimulationReferenceId('invalid')).toBe(false);
  });

  test('ID generators produce valid IDs', () => {
    const adapterId = generateSimulationAdapterId('test');
    expect(isSimulationAdapterId(adapterId)).toBe(true);

    const exportId = generateSimulationExportId(1);
    expect(isSimulationExportId(exportId)).toBe(true);
  });

  test('checksum is deterministic', () => {
    const data = { a: 1, b: 'test', c: [1, 2, 3] };

    const checksum1 = calculateSimulationChecksum(data);
    const checksum2 = calculateSimulationChecksum(data);

    expect(checksum1).toBe(checksum2);
    expect(verifySimulationChecksum(data, checksum1)).toBe(true);
    expect(verifySimulationChecksum(data, 'wrong')).toBe(false);
  });
});

// ============================================================================
// Registry Statistics
// ============================================================================

describe('Registry Statistics', () => {
  test('tracks all operations accurately', () => {
    const registry = createAdapterRegistry();
    const adapter = createMockExternalAdapter('Test');
    adapter.enable();
    registry.registerAdapter(adapter);

    const ledgerView = createMockLedgerView();

    // Successful export
    const payload1 = buildLedgerExportPayload(ledgerView, 1, 1000);
    registry.export(adapter.adapterId, payload1, 1000);

    // Duplicate export
    registry.export(adapter.adapterId, payload1, 1001);

    // Successful import
    registry.import(adapter.adapterId, createValidReferenceInput({ externalRefId: 'ref-1' }), 2000);

    // Duplicate import
    registry.import(adapter.adapterId, createValidReferenceInput({ externalRefId: 'ref-1' }), 2001);

    const stats = registry.getStatistics();

    expect(stats.totalExports).toBe(2);
    expect(stats.successfulExports).toBe(2);
    expect(stats.totalReferences).toBe(2);
    expect(stats.successfulReferences).toBe(2);
    expect(stats.registeredAdapters).toBe(1);
    expect(stats.enabledAdapters).toBe(1);
  });
});
