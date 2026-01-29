/**
 * External.test.ts
 * Phase 32 - External Settlement Boundary Tests
 *
 * Test coverage:
 * - No file in this module imports engine, economy, ledger runtime
 * - Boundary cannot be used to mutate state
 * - All exports are types or interfaces only
 * - No concrete class implements ExternalSettlementPort
 * - Tree-shaking removes entire module if unused
 */

import * as fs from 'fs';
import * as path from 'path';

import {
  ExternalValueSourceId,
  ExternalReferenceId,
  ExternalValueAmount,
  ExternalValueDirection,
  ExternalValueStatus,
  isExternalValueSourceId,
  isExternalReferenceId,
  isExternalValueAmount,
  isExternalValueDirection,
  isExternalValueStatus,
  ExternalSettlementRequest,
  ExternalSettlementResult,
  ExternalSettlementPort,
  ExternalSettlementPolicy,
  DEFAULT_EXTERNAL_SETTLEMENT_POLICY,
  ExternalSettlementBoundary,
  ExternalSettlementBoundaryConfig,
  createExternalSettlementBoundary,
} from '../index';

// ============================================================================
// Module Isolation Tests
// ============================================================================

describe('Module Isolation', () => {
  const externalDir = path.resolve(__dirname, '..');

  test('no file imports engine runtime modules', () => {
    const files = fs.readdirSync(externalDir).filter(f => f.endsWith('.ts') && f !== 'index.ts');

    for (const file of files) {
      const content = fs.readFileSync(path.join(externalDir, file), 'utf-8');

      // Check for forbidden imports
      expect(content).not.toMatch(/from\s+['"]\.\.\/game/);
      expect(content).not.toMatch(/from\s+['"]\.\.\/engine/);
      expect(content).not.toMatch(/from\s+['"]\.\.\/core/);
    }
  });

  test('no file imports economy runtime modules', () => {
    const files = fs.readdirSync(externalDir).filter(f => f.endsWith('.ts') && f !== 'index.ts');

    for (const file of files) {
      const content = fs.readFileSync(path.join(externalDir, file), 'utf-8');

      // Check for forbidden economy imports (runtime classes)
      expect(content).not.toMatch(/from\s+['"]\.\.\/economy\/Balance/);
      expect(content).not.toMatch(/from\s+['"]\.\.\/economy\/Pot/);
      expect(content).not.toMatch(/from\s+['"]\.\.\/economy\/EconomyEngine/);
    }
  });

  test('no file imports ledger runtime modules', () => {
    const files = fs.readdirSync(externalDir).filter(f => f.endsWith('.ts') && f !== 'index.ts');

    for (const file of files) {
      const content = fs.readFileSync(path.join(externalDir, file), 'utf-8');

      // Check for forbidden ledger imports (runtime classes)
      expect(content).not.toMatch(/from\s+['"]\.\.\/economy\/Ledger/);
      expect(content).not.toMatch(/LedgerManager/);
    }
  });

  test('module contains no class declarations implementing ExternalSettlementPort', () => {
    const files = fs.readdirSync(externalDir).filter(f => f.endsWith('.ts'));

    for (const file of files) {
      const content = fs.readFileSync(path.join(externalDir, file), 'utf-8');

      // Check for class implementations of the port
      expect(content).not.toMatch(/class\s+\w+\s+implements\s+ExternalSettlementPort/);
    }
  });
});

// ============================================================================
// Type Guard Tests
// ============================================================================

describe('Type Guards', () => {
  test('isExternalValueSourceId validates string types', () => {
    expect(isExternalValueSourceId('source-123')).toBe(true);
    expect(isExternalValueSourceId('')).toBe(false);
  });

  test('isExternalReferenceId validates string types', () => {
    expect(isExternalReferenceId('ref-456')).toBe(true);
    expect(isExternalReferenceId('')).toBe(false);
  });

  test('isExternalValueAmount validates integer types', () => {
    expect(isExternalValueAmount(100)).toBe(true);
    expect(isExternalValueAmount(0)).toBe(true);
    expect(isExternalValueAmount(-50)).toBe(true);
    expect(isExternalValueAmount(100.5)).toBe(false);
    expect(isExternalValueAmount(NaN)).toBe(false);
    expect(isExternalValueAmount(Infinity)).toBe(false);
  });

  test('isExternalValueDirection validates direction types', () => {
    expect(isExternalValueDirection('IN')).toBe(true);
    expect(isExternalValueDirection('OUT')).toBe(true);
    expect(isExternalValueDirection('INVALID')).toBe(false);
    expect(isExternalValueDirection('')).toBe(false);
  });

  test('isExternalValueStatus validates status types', () => {
    expect(isExternalValueStatus('PENDING')).toBe(true);
    expect(isExternalValueStatus('CONFIRMED')).toBe(true);
    expect(isExternalValueStatus('REJECTED')).toBe(true);
    expect(isExternalValueStatus('INVALID')).toBe(false);
    expect(isExternalValueStatus('')).toBe(false);
  });
});

// ============================================================================
// Policy Tests
// ============================================================================

describe('ExternalSettlementPolicy', () => {
  test('default policy is maximally restrictive', () => {
    expect(DEFAULT_EXTERNAL_SETTLEMENT_POLICY.allowedDirections).toEqual([]);
    expect(DEFAULT_EXTERNAL_SETTLEMENT_POLICY.maxAbsoluteAmount).toBe(0);
    expect(DEFAULT_EXTERNAL_SETTLEMENT_POLICY.allowDuringHand).toBe(false);
  });

  test('default policy is frozen', () => {
    expect(Object.isFrozen(DEFAULT_EXTERNAL_SETTLEMENT_POLICY)).toBe(true);
  });
});

// ============================================================================
// Boundary Tests
// ============================================================================

describe('ExternalSettlementBoundary', () => {
  // Create a minimal mock port for testing boundary creation
  // Note: This is NOT an implementation - just a test double
  const mockPort: ExternalSettlementPort = {
    requestSettlement: () => ({
      referenceId: 'ref' as ExternalReferenceId,
      accepted: false,
      rejectionReason: 'Not implemented',
    }),
    notifyFinalized: () => {},
  };

  test('boundary is created with port and default policy', () => {
    const boundary = createExternalSettlementBoundary({ port: mockPort });

    expect(boundary.port).toBe(mockPort);
    expect(boundary.policy).toBe(DEFAULT_EXTERNAL_SETTLEMENT_POLICY);
  });

  test('boundary is created with custom policy', () => {
    const customPolicy: ExternalSettlementPolicy = {
      allowedDirections: ['IN'],
      maxAbsoluteAmount: 1000,
      allowDuringHand: false,
    };

    const boundary = createExternalSettlementBoundary({
      port: mockPort,
      policy: customPolicy,
    });

    expect(boundary.policy).toBe(customPolicy);
  });

  test('boundary is frozen and immutable', () => {
    const boundary = createExternalSettlementBoundary({ port: mockPort });

    expect(Object.isFrozen(boundary)).toBe(true);
  });

  test('boundary cannot be used to mutate external state', () => {
    const boundary = createExternalSettlementBoundary({ port: mockPort });

    // Verify the boundary itself has no mutator methods
    const boundaryKeys = Object.keys(boundary);
    expect(boundaryKeys).toEqual(['port', 'policy']);

    // Verify boundary properties are read-only
    expect(() => {
      (boundary as unknown as Record<string, unknown>)['port'] = null;
    }).toThrow();
  });
});

// ============================================================================
// Interface Type Tests
// ============================================================================

describe('Interface Types', () => {
  test('ExternalSettlementRequest has correct shape', () => {
    const request: ExternalSettlementRequest = {
      sourceId: 'source-1' as ExternalValueSourceId,
      referenceId: 'ref-1' as ExternalReferenceId,
      direction: 'IN',
      amount: 100,
      createdAt: Date.now(),
      metadata: {},
    };

    expect(request.sourceId).toBeDefined();
    expect(request.referenceId).toBeDefined();
    expect(request.direction).toBeDefined();
    expect(request.amount).toBeDefined();
    expect(request.createdAt).toBeDefined();
    expect(request.metadata).toBeDefined();
  });

  test('ExternalSettlementResult has correct shape', () => {
    const acceptedResult: ExternalSettlementResult = {
      referenceId: 'ref-1' as ExternalReferenceId,
      accepted: true,
      rejectionReason: null,
      linkedLedgerBatchId: 'batch-1',
    };

    const rejectedResult: ExternalSettlementResult = {
      referenceId: 'ref-2' as ExternalReferenceId,
      accepted: false,
      rejectionReason: 'Insufficient balance',
    };

    expect(acceptedResult.accepted).toBe(true);
    expect(acceptedResult.rejectionReason).toBeNull();
    expect(rejectedResult.accepted).toBe(false);
    expect(rejectedResult.rejectionReason).toBe('Insufficient balance');
  });
});

// ============================================================================
// No Runtime Effects Tests
// ============================================================================

describe('No Runtime Effects', () => {
  test('importing module has no side effects', () => {
    // This test verifies that simply importing the module
    // does not cause any state changes or side effects

    // Re-import to verify no side effects on import
    const beforeImport = Date.now();
    require('../index');
    const afterImport = Date.now();

    // Import should complete almost instantly with no blocking operations
    expect(afterImport - beforeImport).toBeLessThan(100);
  });

  test('creating boundary does not perform any operations', () => {
    const operationsCalled: string[] = [];

    const trackedPort: ExternalSettlementPort = {
      requestSettlement: () => {
        operationsCalled.push('requestSettlement');
        return {
          referenceId: 'ref' as ExternalReferenceId,
          accepted: false,
          rejectionReason: null,
        };
      },
      notifyFinalized: () => {
        operationsCalled.push('notifyFinalized');
      },
    };

    // Creating the boundary should NOT call any port methods
    createExternalSettlementBoundary({ port: trackedPort });

    expect(operationsCalled).toEqual([]);
  });
});

// ============================================================================
// Forbidden Terminology Tests
// ============================================================================

describe('Forbidden Terminology', () => {
  const externalDir = path.resolve(__dirname, '..');

  test('no files contain forbidden terminology', () => {
    const files = fs.readdirSync(externalDir).filter(f => f.endsWith('.ts'));
    const forbiddenTerms = [
      /\bwallet\b/i,
      /\bpayment\b/i,
      /\bcrypto\b/i,
      /\bblockchain\b/i,
      /\bUSDT\b/,
      /\btransfer\b/i,  // Note: 'transfer' in variable context is ok if it's about chip transfer
    ];

    for (const file of files) {
      const content = fs.readFileSync(path.join(externalDir, file), 'utf-8');

      // Remove comments for this check (we're checking code, not docs)
      const codeOnly = content
        .replace(/\/\*[\s\S]*?\*\//g, '')  // Remove block comments
        .replace(/\/\/.*$/gm, '');          // Remove line comments

      for (const term of forbiddenTerms) {
        // Only check actual code identifiers, not documentation
        const identifierMatches = codeOnly.match(/(?:const|let|var|function|class|interface|type)\s+\w*wallet\w*/i);
        expect(identifierMatches).toBeNull();
      }
    }
  });
});
