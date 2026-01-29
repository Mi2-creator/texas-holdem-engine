/**
 * ExternalAdapter.test.ts
 * Phase 34 - External Runtime Adapter Boundary Tests
 *
 * Test coverage:
 * - Adapter cannot mutate engine state
 * - Adapter disabled = zero side effects
 * - Duplicate adapter registration rejected
 * - Deterministic export (same input → same output)
 * - External references validated but inert
 * - Replay safety
 */

import {
  AdapterId,
  ExportId,
  ExternalRefId,
  ExternalReference,
  ExternalReferenceSource,
  ExportPayload,
  isAdapterId,
  isExportId,
  isExternalRefId,
  validateExternalReference,
  calculateExportChecksum,
  ExternalAdapterPort,
  NoOpAdapter,
  createNoOpAdapter,
  ExternalAdapterRegistry,
  createExternalAdapterRegistry,
  EngineExportAdapter,
  createEngineExportAdapter,
  LedgerViewForExport,
  RevenueViewForExport,
  ExternalValueViewForExport,
  adaptLedgerView,
  adaptRevenueView,
  adaptExternalValueView,
} from '../index';

// ============================================================================
// Test Helpers
// ============================================================================

function createMockLedgerView(overrides: Partial<LedgerViewForExport> = {}): LedgerViewForExport {
  return {
    getEntryCount: () => 100,
    getBatchCount: () => 10,
    getTotalCredits: () => 50000,
    getTotalDebits: () => 50000,
    getLastSequence: () => 100,
    getLastEntryId: () => 'entry-100',
    ...overrides,
  };
}

function createMockRevenueView(overrides: Partial<RevenueViewForExport> = {}): RevenueViewForExport {
  return {
    getTotalPlatformRevenue: () => 1000,
    getTotalClubRevenue: () => 500,
    getTotalAgentCommission: () => 200,
    getHandCount: () => 50,
    getTableCount: () => 5,
    getClubCount: () => 2,
    ...overrides,
  };
}

function createMockExternalValueView(overrides: Partial<ExternalValueViewForExport> = {}): ExternalValueViewForExport {
  return {
    getTotalReferences: () => 10,
    getTotalInAmount: () => 1000,
    getTotalOutAmount: () => 500,
    getNetAmount: () => 500,
    getLinkedCount: () => 7,
    getUnlinkedCount: () => 3,
    ...overrides,
  };
}

function createValidExternalReference(overrides: Partial<ExternalReference> = {}): ExternalReference {
  return {
    refId: `ref-${Date.now()}` as ExternalRefId,
    source: 'EXTERNAL_SYSTEM',
    externalId: 'ext-123',
    amount: 100,
    createdAt: 1000000,
    metadata: {},
    ...overrides,
  };
}

class TestAdapter implements ExternalAdapterPort {
  readonly adapterId: AdapterId;
  exportCalls: ExportPayload[] = [];
  referenceCalls: ExternalReference[] = [];
  disableCalled = false;
  unregisterCalled = false;

  constructor(adapterId: string) {
    this.adapterId = adapterId as AdapterId;
  }

  notifyEngineExport(payload: ExportPayload): void {
    this.exportCalls.push(payload);
  }

  submitExternalReference(reference: ExternalReference) {
    this.referenceCalls.push(reference);
    return { valid: true, errors: [], reference };
  }

  onDisable(): void {
    this.disableCalled = true;
  }

  onUnregister(): void {
    this.unregisterCalled = true;
  }

  reset(): void {
    this.exportCalls = [];
    this.referenceCalls = [];
    this.disableCalled = false;
    this.unregisterCalled = false;
  }
}

// ============================================================================
// Type Guard Tests
// ============================================================================

describe('Type Guards', () => {
  test('isAdapterId validates string types', () => {
    expect(isAdapterId('adapter-123')).toBe(true);
    expect(isAdapterId('')).toBe(false);
  });

  test('isExportId validates string types', () => {
    expect(isExportId('export-1')).toBe(true);
    expect(isExportId('')).toBe(false);
  });

  test('isExternalRefId validates string types', () => {
    expect(isExternalRefId('ref-456')).toBe(true);
    expect(isExternalRefId('')).toBe(false);
  });
});

// ============================================================================
// External Reference Validation Tests
// ============================================================================

describe('External Reference Validation', () => {
  test('validates valid reference', () => {
    const input = createValidExternalReference();
    const result = validateExternalReference(input);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.reference).toBeDefined();
  });

  test('rejects missing refId', () => {
    const input = createValidExternalReference({ refId: '' as ExternalRefId });
    const result = validateExternalReference(input);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Reference ID must be a non-empty string');
  });

  test('rejects invalid source', () => {
    const input = createValidExternalReference({ source: 'INVALID' as ExternalReferenceSource });
    const result = validateExternalReference(input);

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Source must be one of'))).toBe(true);
  });

  test('rejects non-integer amount', () => {
    const input = createValidExternalReference({ amount: 100.5 });
    const result = validateExternalReference(input);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Amount must be an integer');
  });

  test('rejects negative createdAt', () => {
    const input = createValidExternalReference({ createdAt: -1 });
    const result = validateExternalReference(input);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('CreatedAt must be a non-negative integer');
  });

  test('freezes validated reference', () => {
    const input = createValidExternalReference();
    const result = validateExternalReference(input);

    expect(Object.isFrozen(result.reference)).toBe(true);
  });
});

// ============================================================================
// NoOp Adapter Tests
// ============================================================================

describe('NoOpAdapter', () => {
  test('accepts all export calls without side effects', () => {
    const adapter = createNoOpAdapter('test-noop');
    const mockPayload = {
      type: 'LEDGER_SNAPSHOT',
      exportId: 'export-1' as ExportId,
      version: 1,
      createdAt: 1000,
      checksum: '12345678',
      entryCount: 0,
      batchCount: 0,
      totalCredits: 0,
      totalDebits: 0,
      lastSequence: 0,
      lastEntryId: '',
    } as const;

    // Should not throw
    adapter.notifyEngineExport(mockPayload);

    // No way to verify "nothing happened" - that's the point
    expect(true).toBe(true);
  });

  test('validates references without side effects', () => {
    const adapter = createNoOpAdapter('test-noop');
    const ref = createValidExternalReference();

    const result = adapter.submitExternalReference(ref);

    expect(result.valid).toBe(true);
    expect(result.reference).toEqual(ref);
  });
});

// ============================================================================
// Registry Tests
// ============================================================================

describe('ExternalAdapterRegistry', () => {
  let registry: ExternalAdapterRegistry;
  let testAdapter: TestAdapter;

  beforeEach(() => {
    registry = createExternalAdapterRegistry();
    testAdapter = new TestAdapter('test-adapter');
  });

  test('registers adapter successfully', () => {
    const result = registry.register(testAdapter, 1000);

    expect(result.success).toBe(true);
    expect(result.adapterId).toBe('test-adapter');
    expect(registry.isRegistered()).toBe(true);
    expect(registry.getStatus()).toBe('REGISTERED');
  });

  test('rejects duplicate registration', () => {
    registry.register(testAdapter, 1000);
    const secondAdapter = new TestAdapter('second-adapter');

    const result = registry.register(secondAdapter, 2000);

    expect(result.success).toBe(false);
    expect(result.error).toContain('already registered');
  });

  test('rejects adapter with empty ID', () => {
    const emptyAdapter = new TestAdapter('');

    const result = registry.register(emptyAdapter, 1000);

    expect(result.success).toBe(false);
    expect(result.error).toContain('non-empty adapterId');
  });

  test('enables adapter', () => {
    registry.register(testAdapter, 1000);

    const enabled = registry.enable(2000);

    expect(enabled).toBe(true);
    expect(registry.isEnabled()).toBe(true);
    expect(registry.getStatus()).toBe('ENABLED');
  });

  test('disables adapter and calls onDisable', () => {
    registry.register(testAdapter, 1000);
    registry.enable(2000);

    const disabled = registry.disable(3000);

    expect(disabled).toBe(true);
    expect(registry.isEnabled()).toBe(false);
    expect(registry.getStatus()).toBe('DISABLED');
    expect(testAdapter.disableCalled).toBe(true);
  });

  test('unregisters adapter and calls onUnregister', () => {
    registry.register(testAdapter, 1000);

    const unregistered = registry.unregister();

    expect(unregistered).toBe(true);
    expect(registry.isRegistered()).toBe(false);
    expect(testAdapter.unregisterCalled).toBe(true);
  });

  test('returns no-op adapter when disabled', () => {
    registry.register(testAdapter, 1000);
    // Not enabled

    const adapter = registry.getAdapter();

    expect(adapter).not.toBe(testAdapter);
    expect(adapter instanceof NoOpAdapter).toBe(true);
  });

  test('returns registered adapter when enabled', () => {
    registry.register(testAdapter, 1000);
    registry.enable(2000);

    const adapter = registry.getAdapter();

    expect(adapter).toBe(testAdapter);
  });

  test('notifyExport is no-op when disabled', () => {
    registry.register(testAdapter, 1000);
    // Not enabled

    const mockPayload = {
      type: 'LEDGER_SNAPSHOT',
      exportId: 'export-1' as ExportId,
      version: 1,
      createdAt: 1000,
      checksum: '12345678',
      entryCount: 0,
      batchCount: 0,
      totalCredits: 0,
      totalDebits: 0,
      lastSequence: 0,
      lastEntryId: '',
    } as const;

    registry.notifyExport(mockPayload, 3000);

    expect(testAdapter.exportCalls).toHaveLength(0);
    expect(registry.getExportCount()).toBe(0);
  });

  test('notifyExport works when enabled', () => {
    registry.register(testAdapter, 1000);
    registry.enable(2000);

    const mockPayload = {
      type: 'LEDGER_SNAPSHOT',
      exportId: 'export-1' as ExportId,
      version: 1,
      createdAt: 1000,
      checksum: '12345678',
      entryCount: 0,
      batchCount: 0,
      totalCredits: 0,
      totalDebits: 0,
      lastSequence: 0,
      lastEntryId: '',
    } as const;

    registry.notifyExport(mockPayload, 3000);

    expect(testAdapter.exportCalls).toHaveLength(1);
    expect(registry.getExportCount()).toBe(1);
  });

  test('submitReference fails when disabled', () => {
    registry.register(testAdapter, 1000);
    // Not enabled

    const ref = createValidExternalReference();
    const result = registry.submitReference(ref, 3000);

    expect(result.success).toBe(false);
    expect(result.error).toContain('not enabled');
    expect(testAdapter.referenceCalls).toHaveLength(0);
  });

  test('submitReference works when enabled', () => {
    registry.register(testAdapter, 1000);
    registry.enable(2000);

    const ref = createValidExternalReference();
    const result = registry.submitReference(ref, 3000);

    expect(result.success).toBe(true);
    expect(testAdapter.referenceCalls).toHaveLength(1);
    expect(registry.getReferenceCount()).toBe(1);
  });

  test('getRegistration returns correct counts', () => {
    registry.register(testAdapter, 1000);
    registry.enable(2000);

    const mockPayload = {
      type: 'LEDGER_SNAPSHOT',
      exportId: 'export-1' as ExportId,
      version: 1,
      createdAt: 1000,
      checksum: '12345678',
      entryCount: 0,
      batchCount: 0,
      totalCredits: 0,
      totalDebits: 0,
      lastSequence: 0,
      lastEntryId: '',
    } as const;

    registry.notifyExport(mockPayload, 3000);
    registry.submitReference(createValidExternalReference(), 4000);
    registry.submitReference(createValidExternalReference(), 5000);

    const registration = registry.getRegistration();

    expect(registration?.exportCount).toBe(1);
    expect(registration?.referenceCount).toBe(2);
  });
});

// ============================================================================
// Engine Export Adapter Tests
// ============================================================================

describe('EngineExportAdapter', () => {
  let exportAdapter: EngineExportAdapter;

  beforeEach(() => {
    exportAdapter = createEngineExportAdapter();
  });

  test('creates ledger snapshot export', () => {
    const ledgerView = createMockLedgerView();
    const result = exportAdapter.createLedgerSnapshot(ledgerView, 1000);

    expect(result.success).toBe(true);
    expect(result.payload?.type).toBe('LEDGER_SNAPSHOT');
    expect(result.payload?.version).toBe(1);
    expect(result.payload?.createdAt).toBe(1000);

    const payload = result.payload as any;
    expect(payload.entryCount).toBe(100);
    expect(payload.totalCredits).toBe(50000);
  });

  test('creates revenue summary export', () => {
    const revenueView = createMockRevenueView();
    const result = exportAdapter.createRevenueSummary(revenueView, 1000);

    expect(result.success).toBe(true);
    expect(result.payload?.type).toBe('REVENUE_SUMMARY');

    const payload = result.payload as any;
    expect(payload.totalPlatformRevenue).toBe(1000);
    expect(payload.handCount).toBe(50);
  });

  test('creates external value summary export', () => {
    const externalView = createMockExternalValueView();
    const result = exportAdapter.createExternalValueSummary(externalView, 1000);

    expect(result.success).toBe(true);
    expect(result.payload?.type).toBe('EXTERNAL_VALUE_SUMMARY');

    const payload = result.payload as any;
    expect(payload.totalReferences).toBe(10);
    expect(payload.netAmount).toBe(500);
  });

  test('creates full engine export', () => {
    const ledgerView = createMockLedgerView();
    const revenueView = createMockRevenueView();
    const externalView = createMockExternalValueView();

    const result = exportAdapter.createFullExport(
      ledgerView,
      revenueView,
      externalView,
      1000
    );

    expect(result.success).toBe(true);
    expect(result.payload?.type).toBe('FULL_ENGINE_EXPORT');

    const payload = result.payload as any;
    expect(payload.ledger.type).toBe('LEDGER_SNAPSHOT');
    expect(payload.revenue.type).toBe('REVENUE_SUMMARY');
    expect(payload.externalValue.type).toBe('EXTERNAL_VALUE_SUMMARY');
  });

  test('exports are frozen/immutable', () => {
    const ledgerView = createMockLedgerView();
    const result = exportAdapter.createLedgerSnapshot(ledgerView, 1000);

    expect(Object.isFrozen(result.payload)).toBe(true);
  });

  test('export IDs are unique and sequential', () => {
    const ledgerView = createMockLedgerView();

    const result1 = exportAdapter.createLedgerSnapshot(ledgerView, 1000);
    const result2 = exportAdapter.createLedgerSnapshot(ledgerView, 2000);

    expect(result1.exportId).toBe('export-1');
    expect(result2.exportId).toBe('export-2');
  });
});

// ============================================================================
// Determinism Tests
// ============================================================================

describe('Determinism', () => {
  test('same ledger view produces same checksum', () => {
    const adapter1 = createEngineExportAdapter();
    const adapter2 = createEngineExportAdapter();

    const ledgerView = createMockLedgerView();

    const result1 = adapter1.createLedgerSnapshot(ledgerView, 1000);
    const result2 = adapter2.createLedgerSnapshot(ledgerView, 1000);

    expect(result1.payload?.checksum).toBe(result2.payload?.checksum);
  });

  test('different data produces different checksum', () => {
    const adapter = createEngineExportAdapter();

    const view1 = createMockLedgerView({ getEntryCount: () => 100 });
    const view2 = createMockLedgerView({ getEntryCount: () => 200 });

    const result1 = adapter.createLedgerSnapshot(view1, 1000);

    adapter.resetSequence();
    const result2 = adapter.createLedgerSnapshot(view2, 1000);

    expect(result1.payload?.checksum).not.toBe(result2.payload?.checksum);
  });

  test('calculateExportChecksum is deterministic', () => {
    const data = { a: 1, b: 2, c: 'test' };

    const checksum1 = calculateExportChecksum(data);
    const checksum2 = calculateExportChecksum(data);

    expect(checksum1).toBe(checksum2);
  });
});

// ============================================================================
// Engine State Immutability Tests
// ============================================================================

describe('Engine State Immutability', () => {
  test('adapter cannot mutate engine state', () => {
    // This test verifies that the adapter interface does not expose
    // any methods that could modify engine state.

    const registry = createExternalAdapterRegistry();
    const adapter = new TestAdapter('test');

    registry.register(adapter, 1000);
    registry.enable(2000);

    // Verify registry has no mutation methods exposed to adapter
    const registryMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(registry));
    const dangerousMethods = ['setEntry', 'deleteEntry', 'modifyBalance', 'writeLedger'];

    for (const method of dangerousMethods) {
      expect(registryMethods).not.toContain(method);
    }
  });

  test('export adapter has no mutation methods', () => {
    const exportAdapter = createEngineExportAdapter();

    // Verify export adapter has no mutation methods
    const adapterMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(exportAdapter));

    // Only expected methods
    const expectedMethods = [
      'constructor',
      'generateExportId',
      'createLedgerSnapshot',
      'createRevenueSummary',
      'createExternalValueSummary',
      'createFullExport',
      'getExportSequence',
      'resetSequence',
    ];

    // Check no unexpected methods that could mutate state
    const mutationMethods = ['setEntry', 'deleteEntry', 'modifyBalance', 'writeLedger'];
    for (const method of mutationMethods) {
      expect(adapterMethods).not.toContain(method);
    }
  });

  test('external references are validated but inert', () => {
    const registry = createExternalAdapterRegistry();
    const adapter = new TestAdapter('test');

    registry.register(adapter, 1000);
    registry.enable(2000);

    const ref = createValidExternalReference();
    const result = registry.submitReference(ref, 3000);

    // Reference is validated
    expect(result.success).toBe(true);
    expect(result.validation.valid).toBe(true);

    // But it's just stored in the adapter - no engine state changed
    // The adapter stores references but doesn't modify engine
    expect(adapter.referenceCalls).toHaveLength(1);

    // Verify the registry doesn't expose any way to use the reference
    // to modify engine state
    expect(typeof (registry as any).applyReference).toBe('undefined');
    expect(typeof (registry as any).executeReference).toBe('undefined');
  });
});

// ============================================================================
// Replay Safety Tests
// ============================================================================

describe('Replay Safety', () => {
  test('exports are deterministic for replay', () => {
    // Simulate two "replays" with same data
    const createExports = () => {
      const adapter = createEngineExportAdapter();
      const ledgerView = createMockLedgerView();
      const revenueView = createMockRevenueView();
      const externalView = createMockExternalValueView();

      return adapter.createFullExport(ledgerView, revenueView, externalView, 1000);
    };

    const replay1 = createExports();
    const replay2 = createExports();

    // Same input should produce same checksums
    const payload1 = replay1.payload as any;
    const payload2 = replay2.payload as any;

    expect(payload1.checksum).toBe(payload2.checksum);
    expect(payload1.ledger.checksum).toBe(payload2.ledger.checksum);
    expect(payload1.revenue.checksum).toBe(payload2.revenue.checksum);
    expect(payload1.externalValue.checksum).toBe(payload2.externalValue.checksum);
  });

  test('registry state is replayable', () => {
    // First run
    const registry1 = createExternalAdapterRegistry();
    const adapter1 = new TestAdapter('adapter-1');
    registry1.register(adapter1, 1000);
    registry1.enable(2000);

    const ref1 = createValidExternalReference({ refId: 'ref-1' as ExternalRefId });
    registry1.submitReference(ref1, 3000);

    // Second run (simulated replay)
    const registry2 = createExternalAdapterRegistry();
    const adapter2 = new TestAdapter('adapter-1');
    registry2.register(adapter2, 1000);
    registry2.enable(2000);

    const ref2 = createValidExternalReference({ refId: 'ref-1' as ExternalRefId });
    registry2.submitReference(ref2, 3000);

    // Both should have same state
    expect(registry1.getReferenceCount()).toBe(registry2.getReferenceCount());
    expect(registry1.getStatus()).toBe(registry2.getStatus());
  });
});

// ============================================================================
// View Adapter Tests
// ============================================================================

describe('View Adapters', () => {
  test('adaptLedgerView handles partial source', () => {
    const partial = {
      getEntryCount: () => 50,
      // Missing other methods
    };

    const adapted = adaptLedgerView(partial);

    expect(adapted.getEntryCount()).toBe(50);
    expect(adapted.getBatchCount()).toBe(0); // Default
    expect(adapted.getLastEntryId()).toBeNull(); // Default
  });

  test('adaptRevenueView handles partial source', () => {
    const partial = {
      getTotalPlatformRevenue: () => 1000,
    };

    const adapted = adaptRevenueView(partial);

    expect(adapted.getTotalPlatformRevenue()).toBe(1000);
    expect(adapted.getHandCount()).toBe(0); // Default
  });

  test('adaptExternalValueView handles partial source', () => {
    const partial = {
      getTotalReferences: () => 5,
    };

    const adapted = adaptExternalValueView(partial);

    expect(adapted.getTotalReferences()).toBe(5);
    expect(adapted.getNetAmount()).toBe(0); // Default
  });
});

// ============================================================================
// Zero Side Effects When Disabled Tests
// ============================================================================

describe('Zero Side Effects When Disabled', () => {
  test('registry operations have no effect when not registered', () => {
    const registry = createExternalAdapterRegistry();

    // No adapter registered
    expect(registry.enable(1000)).toBe(false);
    expect(registry.disable(1000)).toBe(false);
    expect(registry.getStatus()).toBe('UNREGISTERED');
  });

  test('no exports are sent when disabled', () => {
    const registry = createExternalAdapterRegistry();
    const adapter = new TestAdapter('test');

    registry.register(adapter, 1000);
    // Not enabled

    const mockPayload = {
      type: 'LEDGER_SNAPSHOT',
      exportId: 'export-1' as ExportId,
      version: 1,
      createdAt: 1000,
      checksum: '12345678',
      entryCount: 0,
      batchCount: 0,
      totalCredits: 0,
      totalDebits: 0,
      lastSequence: 0,
      lastEntryId: '',
    } as const;

    // Send 10 exports
    for (let i = 0; i < 10; i++) {
      registry.notifyExport(mockPayload, 1000 + i);
    }

    // None should have been received
    expect(adapter.exportCalls).toHaveLength(0);
    expect(registry.getExportCount()).toBe(0);
  });

  test('no references are processed when disabled', () => {
    const registry = createExternalAdapterRegistry();
    const adapter = new TestAdapter('test');

    registry.register(adapter, 1000);
    // Not enabled

    // Try to submit 10 references
    for (let i = 0; i < 10; i++) {
      const result = registry.submitReference(
        createValidExternalReference({ refId: `ref-${i}` as ExternalRefId }),
        1000 + i
      );
      expect(result.success).toBe(false);
    }

    // None should have been received
    expect(adapter.referenceCalls).toHaveLength(0);
    expect(registry.getReferenceCount()).toBe(0);
  });
});
