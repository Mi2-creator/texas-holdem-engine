/**
 * ExternalValue.test.ts
 * Phase 33 - External Value Reference Mapping Tests
 *
 * Test coverage:
 * - Creating valid references
 * - Rejecting invalid amounts
 * - Rejecting duplicate references
 * - Ensuring no mutation of ledger
 * - Deterministic aggregation output
 * - Replay safety (same input → same output)
 */

import {
  ExternalValueRefId,
  ExternalValueSource,
  ExternalValueDirection,
  isExternalValueRefId,
  isExternalValueSource,
  ExternalValueReference,
  ExternalValueReferenceInput,
  validateExternalValueReferenceInput,
  createExternalValueReference,
  ExternalValueRegistry,
  createExternalValueRegistry,
  ExternalValueView,
  createExternalValueView,
} from '../index';

// ============================================================================
// Test Helpers
// ============================================================================

function createValidInput(overrides: Partial<ExternalValueReferenceInput> = {}): ExternalValueReferenceInput {
  return {
    id: `ref-${Date.now()}-${Math.random().toString(36).substr(2, 9)}` as ExternalValueRefId,
    source: 'MANUAL',
    direction: 'IN',
    amount: 100,
    createdAt: 1000000,
    ...overrides,
  };
}

// ============================================================================
// Type Guard Tests
// ============================================================================

describe('Type Guards', () => {
  test('isExternalValueRefId validates string types', () => {
    expect(isExternalValueRefId('ref-123')).toBe(true);
    expect(isExternalValueRefId('')).toBe(false);
  });

  test('isExternalValueSource validates source types', () => {
    expect(isExternalValueSource('MANUAL')).toBe(true);
    expect(isExternalValueSource('CLUB_CREDIT')).toBe(true);
    expect(isExternalValueSource('PROMO')).toBe(true);
    expect(isExternalValueSource('LEGACY')).toBe(true);
    expect(isExternalValueSource('ADJUSTMENT')).toBe(true);
    expect(isExternalValueSource('INVALID')).toBe(false);
    expect(isExternalValueSource('')).toBe(false);
  });
});

// ============================================================================
// Reference Validation Tests
// ============================================================================

describe('ExternalValueReference Validation', () => {
  test('validates valid input', () => {
    const input = createValidInput();
    const result = validateExternalValueReferenceInput(input);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('rejects non-integer amount', () => {
    const input = createValidInput({ amount: 100.5 });
    const result = validateExternalValueReferenceInput(input);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Amount must be an integer');
  });

  test('rejects negative amount', () => {
    const input = createValidInput({ amount: -100 });
    const result = validateExternalValueReferenceInput(input);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Amount must be non-negative');
  });

  test('rejects empty ID', () => {
    const input = createValidInput({ id: '' as ExternalValueRefId });
    const result = validateExternalValueReferenceInput(input);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('ID must be a non-empty string');
  });

  test('rejects invalid source', () => {
    const input = createValidInput({ source: 'INVALID' as ExternalValueSource });
    const result = validateExternalValueReferenceInput(input);

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Source must be one of'))).toBe(true);
  });

  test('rejects invalid direction', () => {
    const input = createValidInput({ direction: 'INVALID' as ExternalValueDirection });
    const result = validateExternalValueReferenceInput(input);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Direction must be IN or OUT');
  });

  test('rejects negative createdAt', () => {
    const input = createValidInput({ createdAt: -1 });
    const result = validateExternalValueReferenceInput(input);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('CreatedAt must be a non-negative integer');
  });

  test('accepts zero amount', () => {
    const input = createValidInput({ amount: 0 });
    const result = validateExternalValueReferenceInput(input);

    expect(result.valid).toBe(true);
  });
});

// ============================================================================
// Reference Creation Tests
// ============================================================================

describe('ExternalValueReference Creation', () => {
  test('creates valid reference', () => {
    const input = createValidInput();
    const ref = createExternalValueReference(input);

    expect(ref).not.toBeNull();
    expect(ref!.id).toBe(input.id);
    expect(ref!.source).toBe(input.source);
    expect(ref!.direction).toBe(input.direction);
    expect(ref!.amount).toBe(input.amount);
    expect(ref!.createdAt).toBe(input.createdAt);
  });

  test('created reference is frozen', () => {
    const input = createValidInput();
    const ref = createExternalValueReference(input);

    expect(Object.isFrozen(ref)).toBe(true);
  });

  test('returns null for invalid input', () => {
    const input = createValidInput({ amount: -100 });
    const ref = createExternalValueReference(input);

    expect(ref).toBeNull();
  });

  test('includes optional fields when provided', () => {
    const input = createValidInput({
      linkedLedgerEntryId: 'led-123',
      description: 'Test reference',
      metadata: { key: 'value' },
    });
    const ref = createExternalValueReference(input);

    expect(ref!.linkedLedgerEntryId).toBe('led-123');
    expect(ref!.description).toBe('Test reference');
    expect(ref!.metadata).toEqual({ key: 'value' });
  });

  test('freezes metadata', () => {
    const input = createValidInput({
      metadata: { key: 'value' },
    });
    const ref = createExternalValueReference(input);

    expect(Object.isFrozen(ref!.metadata)).toBe(true);
  });
});

// ============================================================================
// Registry Tests
// ============================================================================

describe('ExternalValueRegistry', () => {
  let registry: ExternalValueRegistry;

  beforeEach(() => {
    registry = createExternalValueRegistry();
  });

  test('appends valid reference', () => {
    const input = createValidInput();
    const result = registry.append(input);

    expect(result.success).toBe(true);
    expect(result.reference).toBeDefined();
    expect(result.reference!.id).toBe(input.id);
  });

  test('rejects invalid input', () => {
    const input = createValidInput({ amount: -100 });
    const result = registry.append(input);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Validation failed');
    expect(result.validationErrors).toContain('Amount must be non-negative');
  });

  test('rejects duplicate ID (idempotency)', () => {
    const input = createValidInput({ id: 'dup-id' as ExternalValueRefId });

    const result1 = registry.append(input);
    const result2 = registry.append(input);

    expect(result1.success).toBe(true);
    expect(result2.success).toBe(false);
    expect(result2.error).toContain('already exists');
  });

  test('retrieves reference by ID', () => {
    const input = createValidInput();
    registry.append(input);

    const ref = registry.get(input.id);

    expect(ref).not.toBeNull();
    expect(ref!.id).toBe(input.id);
  });

  test('returns null for non-existent ID', () => {
    const ref = registry.get('non-existent' as ExternalValueRefId);

    expect(ref).toBeNull();
  });

  test('checks existence with has()', () => {
    const input = createValidInput();
    registry.append(input);

    expect(registry.has(input.id)).toBe(true);
    expect(registry.has('non-existent' as ExternalValueRefId)).toBe(false);
  });

  test('counts references', () => {
    registry.append(createValidInput({ id: 'ref-1' as ExternalValueRefId }));
    registry.append(createValidInput({ id: 'ref-2' as ExternalValueRefId }));
    registry.append(createValidInput({ id: 'ref-3' as ExternalValueRefId }));

    expect(registry.count()).toBe(3);
  });

  test('queries by source', () => {
    registry.append(createValidInput({ id: 'ref-1' as ExternalValueRefId, source: 'MANUAL' }));
    registry.append(createValidInput({ id: 'ref-2' as ExternalValueRefId, source: 'PROMO' }));
    registry.append(createValidInput({ id: 'ref-3' as ExternalValueRefId, source: 'MANUAL' }));

    const result = registry.query({ source: 'MANUAL' });

    expect(result.references).toHaveLength(2);
    expect(result.totalCount).toBe(2);
  });

  test('queries by direction', () => {
    registry.append(createValidInput({ id: 'ref-1' as ExternalValueRefId, direction: 'IN' }));
    registry.append(createValidInput({ id: 'ref-2' as ExternalValueRefId, direction: 'OUT' }));
    registry.append(createValidInput({ id: 'ref-3' as ExternalValueRefId, direction: 'IN' }));

    const result = registry.query({ direction: 'OUT' });

    expect(result.references).toHaveLength(1);
  });

  test('queries by linked ledger entry', () => {
    registry.append(createValidInput({ id: 'ref-1' as ExternalValueRefId, linkedLedgerEntryId: 'led-1' }));
    registry.append(createValidInput({ id: 'ref-2' as ExternalValueRefId, linkedLedgerEntryId: 'led-2' }));
    registry.append(createValidInput({ id: 'ref-3' as ExternalValueRefId, linkedLedgerEntryId: 'led-1' }));

    const result = registry.query({ linkedLedgerEntryId: 'led-1' });

    expect(result.references).toHaveLength(2);
  });

  test('queries with pagination', () => {
    for (let i = 0; i < 10; i++) {
      registry.append(createValidInput({ id: `ref-${i}` as ExternalValueRefId }));
    }

    const result = registry.query({ limit: 3, offset: 2 });

    expect(result.references).toHaveLength(3);
    expect(result.totalCount).toBe(10);
    expect(result.references[0].id).toBe('ref-2');
  });

  test('maintains insertion order', () => {
    registry.append(createValidInput({ id: 'ref-c' as ExternalValueRefId }));
    registry.append(createValidInput({ id: 'ref-a' as ExternalValueRefId }));
    registry.append(createValidInput({ id: 'ref-b' as ExternalValueRefId }));

    const all = registry.getAll();

    expect(all[0].id).toBe('ref-c');
    expect(all[1].id).toBe('ref-a');
    expect(all[2].id).toBe('ref-b');
  });

  test('exports references', () => {
    registry.append(createValidInput({ id: 'ref-1' as ExternalValueRefId }));
    registry.append(createValidInput({ id: 'ref-2' as ExternalValueRefId }));

    const exported = registry.export();

    expect(exported).toHaveLength(2);
    expect(Object.isFrozen(exported)).toBe(true);
  });

  test('creates registry from export (replay)', () => {
    const inputs: ExternalValueReferenceInput[] = [
      createValidInput({ id: 'ref-1' as ExternalValueRefId, amount: 100 }),
      createValidInput({ id: 'ref-2' as ExternalValueRefId, amount: 200 }),
    ];

    const newRegistry = ExternalValueRegistry.fromExport(inputs);

    expect(newRegistry.count()).toBe(2);
    expect(newRegistry.get('ref-1' as ExternalValueRefId)!.amount).toBe(100);
  });

  test('clears all references', () => {
    registry.append(createValidInput({ id: 'ref-1' as ExternalValueRefId }));
    registry.append(createValidInput({ id: 'ref-2' as ExternalValueRefId }));

    registry.clear();

    expect(registry.count()).toBe(0);
  });
});

// ============================================================================
// View Tests
// ============================================================================

describe('ExternalValueView', () => {
  let registry: ExternalValueRegistry;
  let view: ExternalValueView;

  beforeEach(() => {
    registry = createExternalValueRegistry();
    view = createExternalValueView(registry);
  });

  test('groups by source', () => {
    registry.append(createValidInput({ id: 'ref-1' as ExternalValueRefId, source: 'MANUAL', amount: 100, direction: 'IN' }));
    registry.append(createValidInput({ id: 'ref-2' as ExternalValueRefId, source: 'MANUAL', amount: 50, direction: 'OUT' }));
    registry.append(createValidInput({ id: 'ref-3' as ExternalValueRefId, source: 'PROMO', amount: 200, direction: 'IN' }));

    const bySource = view.groupBySource();

    expect(bySource).toHaveLength(2);

    const manual = bySource.find(e => e.source === 'MANUAL');
    expect(manual!.totalAmount).toBe(150);
    expect(manual!.count).toBe(2);
    expect(manual!.inAmount).toBe(100);
    expect(manual!.outAmount).toBe(50);

    const promo = bySource.find(e => e.source === 'PROMO');
    expect(promo!.totalAmount).toBe(200);
    expect(promo!.count).toBe(1);
  });

  test('groups by direction', () => {
    registry.append(createValidInput({ id: 'ref-1' as ExternalValueRefId, direction: 'IN', amount: 100 }));
    registry.append(createValidInput({ id: 'ref-2' as ExternalValueRefId, direction: 'OUT', amount: 50 }));
    registry.append(createValidInput({ id: 'ref-3' as ExternalValueRefId, direction: 'IN', amount: 200 }));

    const byDirection = view.groupByDirection();

    const inEntry = byDirection.find(e => e.direction === 'IN');
    expect(inEntry!.totalAmount).toBe(300);
    expect(inEntry!.count).toBe(2);

    const outEntry = byDirection.find(e => e.direction === 'OUT');
    expect(outEntry!.totalAmount).toBe(50);
    expect(outEntry!.count).toBe(1);
  });

  test('groups by linked ledger', () => {
    registry.append(createValidInput({ id: 'ref-1' as ExternalValueRefId, linkedLedgerEntryId: 'led-1', amount: 100, source: 'MANUAL' }));
    registry.append(createValidInput({ id: 'ref-2' as ExternalValueRefId, linkedLedgerEntryId: 'led-1', amount: 50, source: 'PROMO' }));
    registry.append(createValidInput({ id: 'ref-3' as ExternalValueRefId, linkedLedgerEntryId: 'led-2', amount: 200, source: 'MANUAL' }));
    registry.append(createValidInput({ id: 'ref-4' as ExternalValueRefId, amount: 75 })); // No link

    const byLedger = view.groupByLinkedLedger();

    expect(byLedger).toHaveLength(2);

    const led1 = byLedger.find(e => e.linkedLedgerEntryId === 'led-1');
    expect(led1!.totalAmount).toBe(150);
    expect(led1!.count).toBe(2);
    expect(led1!.sources).toContain('MANUAL');
    expect(led1!.sources).toContain('PROMO');
  });

  test('returns complete summary', () => {
    registry.append(createValidInput({ id: 'ref-1' as ExternalValueRefId, direction: 'IN', amount: 100, linkedLedgerEntryId: 'led-1' }));
    registry.append(createValidInput({ id: 'ref-2' as ExternalValueRefId, direction: 'OUT', amount: 30 }));
    registry.append(createValidInput({ id: 'ref-3' as ExternalValueRefId, direction: 'IN', amount: 50, linkedLedgerEntryId: 'led-2' }));

    const summary = view.getSummary();

    expect(summary.totalReferences).toBe(3);
    expect(summary.totalInAmount).toBe(150);
    expect(summary.totalOutAmount).toBe(30);
    expect(summary.netAmount).toBe(120);
    expect(summary.linkedCount).toBe(2);
    expect(summary.unlinkedCount).toBe(1);
  });

  test('gets references by source', () => {
    registry.append(createValidInput({ id: 'ref-1' as ExternalValueRefId, source: 'MANUAL' }));
    registry.append(createValidInput({ id: 'ref-2' as ExternalValueRefId, source: 'PROMO' }));

    const manual = view.getBySource('MANUAL');

    expect(manual).toHaveLength(1);
    expect(manual[0].source).toBe('MANUAL');
  });

  test('gets unlinked references', () => {
    registry.append(createValidInput({ id: 'ref-1' as ExternalValueRefId, linkedLedgerEntryId: 'led-1' }));
    registry.append(createValidInput({ id: 'ref-2' as ExternalValueRefId }));
    registry.append(createValidInput({ id: 'ref-3' as ExternalValueRefId }));

    const unlinked = view.getUnlinked();

    expect(unlinked).toHaveLength(2);
  });

  test('computes deterministic checksum', () => {
    registry.append(createValidInput({ id: 'ref-1' as ExternalValueRefId, amount: 100 }));
    registry.append(createValidInput({ id: 'ref-2' as ExternalValueRefId, amount: 200 }));

    const checksum1 = view.computeChecksum();
    const checksum2 = view.computeChecksum();

    expect(checksum1).toBe(checksum2);
    expect(checksum1).toMatch(/^[0-9a-f]{8}$/);
  });
});

// ============================================================================
// Determinism & Replay Tests
// ============================================================================

describe('Determinism & Replay Safety', () => {
  test('same inputs produce same outputs', () => {
    const inputs: ExternalValueReferenceInput[] = [
      createValidInput({ id: 'ref-1' as ExternalValueRefId, source: 'MANUAL', amount: 100 }),
      createValidInput({ id: 'ref-2' as ExternalValueRefId, source: 'PROMO', amount: 200 }),
      createValidInput({ id: 'ref-3' as ExternalValueRefId, source: 'MANUAL', amount: 150 }),
    ];

    // First registry
    const registry1 = ExternalValueRegistry.fromExport(inputs);
    const view1 = createExternalValueView(registry1);

    // Second registry (same inputs)
    const registry2 = ExternalValueRegistry.fromExport(inputs);
    const view2 = createExternalValueView(registry2);

    // Outputs should be identical
    expect(view1.computeChecksum()).toBe(view2.computeChecksum());
    expect(view1.getSummary().totalInAmount).toBe(view2.getSummary().totalInAmount);
    expect(JSON.stringify(view1.groupBySource())).toBe(JSON.stringify(view2.groupBySource()));
  });

  test('aggregation order is deterministic', () => {
    // Add in different orders
    const registry1 = createExternalValueRegistry();
    registry1.append(createValidInput({ id: 'ref-a' as ExternalValueRefId, source: 'PROMO', amount: 100 }));
    registry1.append(createValidInput({ id: 'ref-b' as ExternalValueRefId, source: 'MANUAL', amount: 200 }));
    registry1.append(createValidInput({ id: 'ref-c' as ExternalValueRefId, source: 'LEGACY', amount: 300 }));

    const view1 = createExternalValueView(registry1);
    const bySource1 = view1.groupBySource();

    // Sources should be in alphabetical order
    expect(bySource1[0].source).toBe('LEGACY');
    expect(bySource1[1].source).toBe('MANUAL');
    expect(bySource1[2].source).toBe('PROMO');
  });
});

// ============================================================================
// No Ledger Mutation Tests
// ============================================================================

describe('No Ledger Mutation', () => {
  test('registry does not import ledger modules', () => {
    // This is a compile-time guarantee - the module should not import
    // any ledger runtime modules. We verify by checking the reference
    // does not have ledger mutation capabilities.

    const registry = createExternalValueRegistry();
    const input = createValidInput({ linkedLedgerEntryId: 'led-123' });

    registry.append(input);

    // The reference only stores the ID - it cannot modify the ledger
    const ref = registry.get(input.id);
    expect(ref!.linkedLedgerEntryId).toBe('led-123');

    // Verify the reference is immutable
    expect(Object.isFrozen(ref)).toBe(true);

    // Verify there are no methods that could modify ledger
    expect(typeof (ref as unknown as Record<string, unknown>)['modifyLedger']).toBe('undefined');
    expect(typeof (registry as unknown as Record<string, unknown>)['writeLedger']).toBe('undefined');
  });

  test('view does not modify registry', () => {
    const registry = createExternalValueRegistry();
    registry.append(createValidInput({ id: 'ref-1' as ExternalValueRefId }));
    registry.append(createValidInput({ id: 'ref-2' as ExternalValueRefId }));

    const countBefore = registry.count();
    const view = createExternalValueView(registry);

    // Call all view methods
    view.getSummary();
    view.groupBySource();
    view.groupByDirection();
    view.groupByLinkedLedger();
    view.getUnlinked();
    view.computeChecksum();

    // Registry should be unchanged
    expect(registry.count()).toBe(countBefore);
  });
});
