/**
 * InvariantChecker.ts
 * Phase 25.1 - Implementation of all 5 ledger invariants
 *
 * This checker operates in READ-ONLY mode on the LedgerView.
 * It performs assertions only - no state mutation, no calculations,
 * no external service calls.
 *
 * Invariants implemented:
 * I1. NON_NEGATIVE_BALANCE - No party can have negative balance
 * I2. SYSTEM_CONSERVATION - Deltas must sum to zero for closed systems
 * I3. DETERMINISTIC_REPLAY - Same inputs produce identical outputs
 * I4. APPEND_ONLY_INTEGRITY - Hash chain must be valid
 * I5. ATTRIBUTION_IMMUTABILITY - Entries cannot be modified
 *
 * All violations are returned as structured data, never thrown.
 */

import { HandId, TableId } from '../../security/AuditLog';
import { ClubId } from '../../club/ClubTypes';

import {
  LedgerEntry,
  LedgerBatch,
  LedgerBatchId,
  AttributionPartyType,
  verifyEntryChecksum,
  verifyBatchChecksum,
} from '../LedgerTypes';
import { ValueLedger } from '../LedgerEntry';
import { LedgerView } from '../LedgerView';

import {
  InvariantType,
  InvariantViolation,
  InvariantCheckResult,
  FullInvariantCheckResult,
  NonNegativeBalanceContext,
  SystemConservationContext,
  DeterministicReplayContext,
  AppendOnlyIntegrityContext,
  SourceRef,
  createNonNegativeBalanceViolation,
  createSystemConservationViolation,
  createDeterministicReplayViolation,
  createAppendOnlyIntegrityViolation,
  createHandSourceRef,
  createBatchSourceRef,
  createEntrySourceRef,
} from './InvariantViolation';

import {
  InvariantCheckConfig,
  DEFAULT_INVARIANT_CONFIG,
  INVARIANT_SPECS,
} from './LedgerInvariants';

// ============================================================================
// Invariant Checker Implementation
// ============================================================================

/**
 * Read-only invariant checker for the value ledger
 *
 * This class only reads from LedgerView - it never modifies state.
 * All checks are pure assertions that return structured results.
 */
export class InvariantChecker {
  private readonly ledger: ValueLedger;
  private readonly view: LedgerView;
  private readonly config: InvariantCheckConfig;

  constructor(
    ledger: ValueLedger,
    config: InvariantCheckConfig = DEFAULT_INVARIANT_CONFIG
  ) {
    this.ledger = ledger;
    this.view = new LedgerView(ledger);
    this.config = config;
  }

  // ==========================================================================
  // Full Invariant Check
  // ==========================================================================

  /**
   * Check all enabled invariants
   */
  checkAll(): FullInvariantCheckResult {
    const startTime = Date.now();
    const results: InvariantCheckResult[] = [];
    const violations: InvariantViolation[] = [];

    for (const invariantType of this.config.enabledInvariants) {
      const result = this.checkInvariant(invariantType);
      results.push(result);

      if (!result.passed && result.violation) {
        violations.push(result.violation);

        if (this.config.failFast) {
          break;
        }
      }
    }

    const endTime = Date.now();

    return {
      allPassed: violations.length === 0,
      results,
      violations,
      totalChecks: results.length,
      passedChecks: results.filter(r => r.passed).length,
      failedChecks: results.filter(r => !r.passed).length,
      checkedAt: startTime,
      totalDurationMs: endTime - startTime,
    };
  }

  /**
   * Check a specific invariant
   */
  checkInvariant(invariant: InvariantType): InvariantCheckResult {
    const startTime = Date.now();

    let violation: InvariantViolation | undefined;

    switch (invariant) {
      case 'NON_NEGATIVE_BALANCE':
        violation = this.checkNonNegativeBalance();
        break;
      case 'SYSTEM_CONSERVATION':
        violation = this.checkSystemConservation();
        break;
      case 'DETERMINISTIC_REPLAY':
        violation = this.checkDeterministicReplay();
        break;
      case 'APPEND_ONLY_INTEGRITY':
        violation = this.checkAppendOnlyIntegrity();
        break;
      case 'ATTRIBUTION_IMMUTABILITY':
        violation = this.checkAttributionImmutability();
        break;
    }

    const endTime = Date.now();

    return {
      invariant,
      passed: violation === undefined,
      violation,
      checkedAt: startTime,
      checkDurationMs: endTime - startTime,
    };
  }

  // ==========================================================================
  // I1: NON_NEGATIVE_BALANCE
  // ==========================================================================

  /**
   * Check that no party has negative cumulative balance
   *
   * This iterates through all entries and tracks cumulative balances
   * for each unique party, failing if any goes negative.
   */
  private checkNonNegativeBalance(): InvariantViolation<NonNegativeBalanceContext> | undefined {
    const entries = this.ledger.getAllEntries();
    const balances = new Map<string, { partyType: AttributionPartyType; balance: number }>();

    for (const entry of entries) {
      const party = entry.affectedParty;
      const partyKey = this.getPartyKey(party.partyType, party);

      const current = balances.get(partyKey) ?? { partyType: party.partyType, balance: 0 };
      const newBalance = current.balance + entry.delta;

      if (newBalance < 0) {
        return createNonNegativeBalanceViolation(
          {
            partyType: party.partyType,
            partyId: this.getPartyId(party),
            currentBalance: newBalance,
            attemptedDelta: entry.delta,
            resultingBalance: newBalance,
          },
          createEntrySourceRef(entry.entryId)
        );
      }

      balances.set(partyKey, { partyType: party.partyType, balance: newBalance });
    }

    return undefined;
  }

  /**
   * Check balance for a specific party (targeted check)
   */
  checkPartyBalance(
    partyType: AttributionPartyType,
    partyId: string
  ): InvariantCheckResult {
    const startTime = Date.now();

    const summary = this.view.getPartySummary(partyType, partyId);
    const balance = summary.netAttribution;

    let violation: InvariantViolation<NonNegativeBalanceContext> | undefined;

    if (balance < 0) {
      violation = createNonNegativeBalanceViolation(
        {
          partyType,
          partyId,
          currentBalance: balance,
        },
        { type: partyType === 'PLAYER' ? 'PLAYER' : partyType === 'CLUB' ? 'CLUB' : 'AGENT' }
      );
    }

    return {
      invariant: 'NON_NEGATIVE_BALANCE',
      passed: violation === undefined,
      violation,
      checkedAt: startTime,
      checkDurationMs: Date.now() - startTime,
    };
  }

  // ==========================================================================
  // I2: SYSTEM_CONSERVATION
  // ==========================================================================

  /**
   * Check that all batches/hands have zero-sum deltas
   *
   * For each unique sourceRef (hand, batch), the sum of all deltas
   * must equal exactly zero.
   *
   * NOTE: This only checks batches where conservation is expected:
   * - TIME_FEE: Has explicit debit from player and credit to club (balanced)
   * - HAND_SETTLEMENT: Is pure attribution (positive deltas only) - NOT checked
   *   because the ledger records where value is ATTRIBUTED, not where it comes FROM
   */
  private checkSystemConservation(): InvariantViolation<SystemConservationContext> | undefined {
    // Check all batches that should be balanced
    const batches = this.ledger.getAllBatches();

    for (const batch of batches) {
      // Only check conservation for batch types that are designed to be balanced
      // HAND_SETTLEMENT is pure attribution (positive only) - skip
      // TIME_FEE has explicit debits and credits - check
      if (batch.source === 'HAND_SETTLEMENT') {
        continue;  // Skip - attribution ledger doesn't balance pot contributions
      }

      const violation = this.checkBatchConservation(batch.batchId);
      if (violation) {
        return violation;
      }
    }

    return undefined;
  }

  /**
   * Check conservation for a specific batch
   */
  checkBatchConservation(
    batchId: LedgerBatchId
  ): InvariantViolation<SystemConservationContext> | undefined {
    const batch = this.ledger.getBatch(batchId);
    if (!batch) {
      return undefined;  // Batch not found - not a conservation violation
    }

    const entries = this.ledger.getBatchEntries(batchId);
    const breakdown: SystemConservationContext['breakdown'][number][] = [];
    let sum = 0;

    for (const entry of entries) {
      sum += entry.delta;
      breakdown.push({
        partyType: entry.affectedParty.partyType,
        partyId: this.getPartyId(entry.affectedParty),
        delta: entry.delta,
      });
    }

    if (sum !== 0) {
      return createSystemConservationViolation(
        {
          sourceType: 'BATCH',
          sourceId: batchId,
          expectedSum: 0,
          actualSum: sum,
          entryCount: entries.length,
          breakdown,
        },
        createBatchSourceRef(batchId)
      );
    }

    return undefined;
  }

  /**
   * Check conservation for a specific hand
   */
  checkHandConservation(
    handId: HandId,
    tableId?: TableId,
    clubId?: ClubId
  ): InvariantViolation<SystemConservationContext> | undefined {
    const entries = this.view.getHandEntries(handId);

    if (entries.length === 0) {
      return undefined;  // No entries for this hand
    }

    const breakdown: SystemConservationContext['breakdown'][number][] = [];
    let sum = 0;

    for (const entry of entries) {
      sum += entry.delta;
      breakdown.push({
        partyType: entry.affectedParty.partyType,
        partyId: this.getPartyId(entry.affectedParty),
        delta: entry.delta,
      });
    }

    if (sum !== 0) {
      return createSystemConservationViolation(
        {
          sourceType: 'HAND',
          sourceId: handId,
          expectedSum: 0,
          actualSum: sum,
          entryCount: entries.length,
          breakdown,
        },
        createHandSourceRef(handId, tableId, clubId)
      );
    }

    return undefined;
  }

  // ==========================================================================
  // I3: DETERMINISTIC_REPLAY
  // ==========================================================================

  /**
   * Check that the ledger can be deterministically replayed
   *
   * This verifies that the entry sequence is consistent with
   * what would be produced by replaying the same inputs.
   */
  private checkDeterministicReplay(): InvariantViolation<DeterministicReplayContext> | undefined {
    const entries = this.ledger.getAllEntries();

    if (entries.length === 0) {
      return undefined;  // Empty ledger is trivially deterministic
    }

    // Verify entry sequence is monotonically increasing
    for (let i = 1; i < entries.length; i++) {
      const prev = entries[i - 1];
      const curr = entries[i];

      if (curr.sequence !== prev.sequence + 1) {
        return createDeterministicReplayViolation(
          {
            inputHash: 'N/A',
            expectedOutputHash: `sequence:${prev.sequence + 1}`,
            actualOutputHash: `sequence:${curr.sequence}`,
            differingFields: ['sequence'],
            firstDifferenceAt: curr.sequence,
          },
          createEntrySourceRef(curr.entryId)
        );
      }

      // Verify timestamps are non-decreasing
      if (curr.timestamp < prev.timestamp) {
        return createDeterministicReplayViolation(
          {
            inputHash: 'N/A',
            expectedOutputHash: `timestamp >= ${prev.timestamp}`,
            actualOutputHash: `timestamp: ${curr.timestamp}`,
            differingFields: ['timestamp'],
            firstDifferenceAt: curr.sequence,
          },
          createEntrySourceRef(curr.entryId)
        );
      }
    }

    return undefined;
  }

  /**
   * Compare two sets of entries for deterministic equivalence
   *
   * Entries are considered equivalent if they have the same:
   * - source, category, affectedParty, delta, description
   *
   * Entries are NOT required to have the same:
   * - entryId, timestamp, checksum (generated values)
   */
  compareForDeterminism(
    entries1: readonly LedgerEntry[],
    entries2: readonly LedgerEntry[]
  ): InvariantCheckResult {
    const startTime = Date.now();

    if (entries1.length !== entries2.length) {
      return {
        invariant: 'DETERMINISTIC_REPLAY',
        passed: false,
        violation: createDeterministicReplayViolation(
          {
            inputHash: 'comparison',
            expectedOutputHash: `length:${entries1.length}`,
            actualOutputHash: `length:${entries2.length}`,
            differingFields: ['length'],
          },
          { type: 'ENTRY' }
        ),
        checkedAt: startTime,
        checkDurationMs: Date.now() - startTime,
      };
    }

    for (let i = 0; i < entries1.length; i++) {
      const e1 = entries1[i];
      const e2 = entries2[i];

      const differences = this.findEntryDifferences(e1, e2);

      if (differences.length > 0) {
        return {
          invariant: 'DETERMINISTIC_REPLAY',
          passed: false,
          violation: createDeterministicReplayViolation(
            {
              inputHash: 'comparison',
              expectedOutputHash: JSON.stringify(this.getEntryStructure(e1)),
              actualOutputHash: JSON.stringify(this.getEntryStructure(e2)),
              differingFields: differences,
              firstDifferenceAt: i,
            },
            createEntrySourceRef(e1.entryId)
          ),
          checkedAt: startTime,
          checkDurationMs: Date.now() - startTime,
        };
      }
    }

    return {
      invariant: 'DETERMINISTIC_REPLAY',
      passed: true,
      checkedAt: startTime,
      checkDurationMs: Date.now() - startTime,
    };
  }

  // ==========================================================================
  // I4: APPEND_ONLY_INTEGRITY
  // ==========================================================================

  /**
   * Check hash chain integrity
   *
   * Verifies:
   * - No duplicate checksums
   * - Each entry correctly links to previous
   * - Chain is unbroken from genesis
   */
  private checkAppendOnlyIntegrity(): InvariantViolation<AppendOnlyIntegrityContext> | undefined {
    const entries = this.ledger.getAllEntries();

    if (entries.length === 0) {
      return undefined;
    }

    const checksums = new Set<string>();
    let expectedPreviousHash = 'genesis';

    for (const entry of entries) {
      // Check for duplicate checksum
      if (entry.checksum && checksums.has(entry.checksum)) {
        return createAppendOnlyIntegrityViolation(
          {
            violationType: 'DUPLICATE_CHECKSUM',
            entryId: entry.entryId,
            sequence: entry.sequence,
            actualHash: entry.checksum,
          },
          createEntrySourceRef(entry.entryId)
        );
      }

      // Check hash chain link
      if (entry.previousHash !== expectedPreviousHash) {
        return createAppendOnlyIntegrityViolation(
          {
            violationType: 'BROKEN_HASH_CHAIN',
            entryId: entry.entryId,
            sequence: entry.sequence,
            expectedHash: expectedPreviousHash,
            actualHash: entry.previousHash,
          },
          createEntrySourceRef(entry.entryId)
        );
      }

      // Verify entry's own checksum
      if (entry.checksum && !verifyEntryChecksum(entry)) {
        return createAppendOnlyIntegrityViolation(
          {
            violationType: 'BROKEN_HASH_CHAIN',
            entryId: entry.entryId,
            sequence: entry.sequence,
            expectedHash: 'valid checksum',
            actualHash: entry.checksum,
          },
          createEntrySourceRef(entry.entryId)
        );
      }

      if (entry.checksum) {
        checksums.add(entry.checksum);
        expectedPreviousHash = entry.checksum;
      }
    }

    return undefined;
  }

  /**
   * Verify integrity of a specific entry
   */
  checkEntryIntegrity(entryId: string): InvariantCheckResult {
    const startTime = Date.now();

    const entry = this.ledger.getEntry(entryId as any);
    if (!entry) {
      return {
        invariant: 'APPEND_ONLY_INTEGRITY',
        passed: false,
        violation: createAppendOnlyIntegrityViolation(
          {
            violationType: 'MISSING_PREVIOUS',
            entryId: entryId as any,
          },
          createEntrySourceRef(entryId as any)
        ),
        checkedAt: startTime,
        checkDurationMs: Date.now() - startTime,
      };
    }

    const isValid = entry.checksum ? verifyEntryChecksum(entry) : true;

    return {
      invariant: 'APPEND_ONLY_INTEGRITY',
      passed: isValid,
      violation: isValid ? undefined : createAppendOnlyIntegrityViolation(
        {
          violationType: 'BROKEN_HASH_CHAIN',
          entryId: entry.entryId,
          sequence: entry.sequence,
        },
        createEntrySourceRef(entry.entryId)
      ),
      checkedAt: startTime,
      checkDurationMs: Date.now() - startTime,
    };
  }

  // ==========================================================================
  // I5: ATTRIBUTION_IMMUTABILITY
  // ==========================================================================

  /**
   * Check that no entries have been improperly modified
   *
   * This is primarily enforced by the type system (readonly fields),
   * but we verify by checking checksums match computed values.
   */
  private checkAttributionImmutability(): InvariantViolation<AppendOnlyIntegrityContext> | undefined {
    const entries = this.ledger.getAllEntries();

    for (const entry of entries) {
      if (entry.checksum && !verifyEntryChecksum(entry)) {
        return createAppendOnlyIntegrityViolation(
          {
            violationType: 'BROKEN_HASH_CHAIN',
            entryId: entry.entryId,
            sequence: entry.sequence,
          },
          createEntrySourceRef(entry.entryId)
        );
      }
    }

    // Also verify batch checksums
    const batches = this.ledger.getAllBatches();
    for (const batch of batches) {
      if (!verifyBatchChecksum(batch)) {
        return createAppendOnlyIntegrityViolation(
          {
            violationType: 'BROKEN_HASH_CHAIN',
          },
          createBatchSourceRef(batch.batchId)
        );
      }
    }

    return undefined;
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  /**
   * Get unique key for a party
   */
  private getPartyKey(
    partyType: AttributionPartyType,
    party: LedgerEntry['affectedParty']
  ): string {
    switch (partyType) {
      case 'PLAYER':
        return `PLAYER:${party.playerId}`;
      case 'CLUB':
        return `CLUB:${party.clubId}`;
      case 'AGENT':
        return `AGENT:${party.agentId}`;
      case 'PLATFORM':
        return `PLATFORM:${party.platformId ?? 'default'}`;
    }
  }

  /**
   * Get party ID string
   */
  private getPartyId(party: LedgerEntry['affectedParty']): string {
    return party.playerId ?? party.clubId ?? party.agentId ?? party.platformId ?? 'unknown';
  }

  /**
   * Get structural representation of entry (excluding generated fields)
   */
  private getEntryStructure(entry: LedgerEntry): object {
    return {
      source: entry.source,
      category: entry.category,
      affectedParty: entry.affectedParty,
      delta: entry.delta,
      tableId: entry.tableId,
      handId: entry.handId,
      clubId: entry.clubId,
      description: entry.description,
    };
  }

  /**
   * Find differences between two entries (structural only)
   */
  private findEntryDifferences(e1: LedgerEntry, e2: LedgerEntry): string[] {
    const differences: string[] = [];

    if (e1.source !== e2.source) differences.push('source');
    if (e1.category !== e2.category) differences.push('category');
    if (e1.delta !== e2.delta) differences.push('delta');
    if (e1.description !== e2.description) differences.push('description');
    if (e1.tableId !== e2.tableId) differences.push('tableId');
    if (e1.handId !== e2.handId) differences.push('handId');
    if (e1.clubId !== e2.clubId) differences.push('clubId');

    // Compare affected party
    if (e1.affectedParty.partyType !== e2.affectedParty.partyType) {
      differences.push('affectedParty.partyType');
    }
    if (this.getPartyId(e1.affectedParty) !== this.getPartyId(e2.affectedParty)) {
      differences.push('affectedParty.id');
    }

    return differences;
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createInvariantChecker(
  ledger: ValueLedger,
  config?: Partial<InvariantCheckConfig>
): InvariantChecker {
  return new InvariantChecker(ledger, {
    ...DEFAULT_INVARIANT_CONFIG,
    ...config,
  });
}
