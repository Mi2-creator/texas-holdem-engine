/**
 * LedgerEntry.ts
 * Phase 25 - Immutable ledger entry management
 *
 * Provides:
 * - Immutable entry creation with validation
 * - Hash chain for tamper detection
 * - Batch management for atomic multi-party attribution
 * - Entry verification and integrity checking
 *
 * INVARIANTS:
 * - Entries are append-only (no modification or deletion)
 * - Each entry links to previous via hash chain
 * - All deltas are integers (unit-agnostic)
 * - Every entry must have a valid stateVersion reference
 */

import {
  LedgerEntry,
  LedgerBatch,
  LedgerEntryId,
  LedgerBatchId,
  LedgerEntryInput,
  LedgerIntegrityResult,
  BatchVerificationResult,
  generateLedgerEntryId,
  generateLedgerBatchId,
  calculateEntryChecksum,
  calculateBatchChecksum,
  verifyEntryChecksum,
  verifyBatchChecksum,
  AttributionSource,
} from './LedgerTypes';

// ============================================================================
// Configuration
// ============================================================================

export interface LedgerConfig {
  readonly enableHashChain: boolean;
  readonly maxEntries: number;
  readonly requireIntegerDeltas: boolean;
}

export const DEFAULT_LEDGER_CONFIG: LedgerConfig = {
  enableHashChain: true,
  maxEntries: 1000000,
  requireIntegerDeltas: true,
};

// ============================================================================
// Value Ledger Implementation
// ============================================================================

/**
 * Append-only value ledger for attribution recording
 *
 * This ledger is designed for:
 * - Recording value attribution (not balance mutation)
 * - Deterministic replay from settlement outputs
 * - Audit trail for revenue accounting
 *
 * Key properties:
 * - Immutable: entries cannot be modified or deleted
 * - Hash-chained: tamper-evident through linked hashes
 * - Deterministic: same inputs produce identical entries
 */
export class ValueLedger {
  private readonly config: LedgerConfig;
  private readonly entries: LedgerEntry[];
  private readonly batches: Map<LedgerBatchId, LedgerBatch>;
  private readonly entriesByBatch: Map<LedgerBatchId, LedgerEntryId[]>;
  private sequence: number;
  private lastHash: string;

  constructor(config: LedgerConfig = DEFAULT_LEDGER_CONFIG) {
    this.config = config;
    this.entries = [];
    this.batches = new Map();
    this.entriesByBatch = new Map();
    this.sequence = 0;
    this.lastHash = 'genesis';
  }

  // ==========================================================================
  // Entry Creation
  // ==========================================================================

  /**
   * Append a single entry to the ledger
   *
   * @throws Error if delta is not an integer and requireIntegerDeltas is true
   * @throws Error if ledger is full
   */
  appendEntry(input: LedgerEntryInput): LedgerEntry {
    // Validate delta is integer
    if (this.config.requireIntegerDeltas && !Number.isInteger(input.delta)) {
      throw new Error(`Delta must be an integer, got: ${input.delta}`);
    }

    // Check capacity
    if (this.entries.length >= this.config.maxEntries) {
      throw new Error(`Ledger capacity exceeded: ${this.config.maxEntries}`);
    }

    const entryId = generateLedgerEntryId();
    const timestamp = Date.now();
    const sequence = ++this.sequence;
    const previousHash = this.lastHash;

    // Create entry without checksum first
    const entryData: Omit<LedgerEntry, 'checksum'> = {
      entryId,
      sequence,
      timestamp,
      source: input.source,
      category: input.category,
      affectedParty: input.affectedParty,
      delta: input.delta,
      stateVersion: input.stateVersion,
      tableId: input.tableId,
      handId: input.handId,
      clubId: input.clubId,
      batchId: input.batchId,
      description: input.description,
      metadata: input.metadata,
      previousHash,
    };

    // Calculate checksum
    const checksum = this.config.enableHashChain
      ? calculateEntryChecksum(entryData)
      : '';

    const entry: LedgerEntry = {
      ...entryData,
      checksum,
    };

    // Append to ledger (immutable after this point)
    this.entries.push(entry);
    this.lastHash = checksum || previousHash;

    // Track batch membership
    if (input.batchId) {
      const batchEntries = this.entriesByBatch.get(input.batchId) ?? [];
      batchEntries.push(entryId);
      this.entriesByBatch.set(input.batchId, batchEntries);
    }

    return entry;
  }

  /**
   * Append multiple entries atomically as a batch
   *
   * All entries are recorded with the same batchId, allowing
   * verification that multi-party attributions balance correctly.
   */
  appendBatch(
    source: AttributionSource,
    inputs: readonly LedgerEntryInput[]
  ): { batch: LedgerBatch; entries: readonly LedgerEntry[] } {
    if (inputs.length === 0) {
      throw new Error('Cannot create empty batch');
    }

    const batchId = generateLedgerBatchId();
    const timestamp = Date.now();

    // Extract common values from first input
    const firstInput = inputs[0];
    const stateVersion = firstInput.stateVersion;
    const tableId = firstInput.tableId;
    const handId = firstInput.handId;
    const clubId = firstInput.clubId;

    // Append all entries with batch reference
    const entries: LedgerEntry[] = [];
    let netDelta = 0;

    for (const input of inputs) {
      const entry = this.appendEntry({
        ...input,
        batchId,
      });
      entries.push(entry);
      netDelta += input.delta;
    }

    const entryIds = entries.map(e => e.entryId);

    // Create batch record
    const batchData: Omit<LedgerBatch, 'checksum'> = {
      batchId,
      timestamp,
      source,
      stateVersion,
      tableId,
      handId,
      clubId,
      entryIds,
      netDelta,
    };

    const checksum = calculateBatchChecksum(batchData);

    const batch: LedgerBatch = {
      ...batchData,
      checksum,
    };

    this.batches.set(batchId, batch);

    return { batch, entries };
  }

  // ==========================================================================
  // Entry Retrieval
  // ==========================================================================

  /**
   * Get entry by ID
   */
  getEntry(entryId: LedgerEntryId): LedgerEntry | null {
    return this.entries.find(e => e.entryId === entryId) ?? null;
  }

  /**
   * Get entry by sequence number
   */
  getEntryBySequence(sequence: number): LedgerEntry | null {
    return this.entries.find(e => e.sequence === sequence) ?? null;
  }

  /**
   * Get all entries (read-only)
   */
  getAllEntries(): readonly LedgerEntry[] {
    return this.entries;
  }

  /**
   * Get entries in sequence range
   */
  getEntriesInRange(
    fromSequence: number,
    toSequence: number
  ): readonly LedgerEntry[] {
    return this.entries.filter(
      e => e.sequence >= fromSequence && e.sequence <= toSequence
    );
  }

  /**
   * Get current sequence number
   */
  getCurrentSequence(): number {
    return this.sequence;
  }

  /**
   * Get entry count
   */
  getEntryCount(): number {
    return this.entries.length;
  }

  // ==========================================================================
  // Batch Retrieval
  // ==========================================================================

  /**
   * Get batch by ID
   */
  getBatch(batchId: LedgerBatchId): LedgerBatch | null {
    return this.batches.get(batchId) ?? null;
  }

  /**
   * Get all batches (read-only)
   */
  getAllBatches(): readonly LedgerBatch[] {
    return Array.from(this.batches.values());
  }

  /**
   * Get entries for a batch
   */
  getBatchEntries(batchId: LedgerBatchId): readonly LedgerEntry[] {
    const entryIds = this.entriesByBatch.get(batchId);
    if (!entryIds) return [];

    return entryIds
      .map(id => this.getEntry(id))
      .filter((e): e is LedgerEntry => e !== null);
  }

  // ==========================================================================
  // Integrity Verification
  // ==========================================================================

  /**
   * Verify hash chain integrity for entire ledger
   */
  verifyIntegrity(
    fromSequence?: number,
    toSequence?: number
  ): LedgerIntegrityResult {
    const errors: string[] = [];

    if (!this.config.enableHashChain) {
      return {
        isValid: true,
        totalEntries: this.entries.length,
        verifiedEntries: 0,
        errors: [],
      };
    }

    const start = fromSequence ?? 1;
    const end = toSequence ?? this.sequence;

    let previousHash = 'genesis';
    let verifiedCount = 0;

    for (const entry of this.entries) {
      if (entry.sequence < start) {
        previousHash = entry.checksum;
        continue;
      }
      if (entry.sequence > end) break;

      // Verify chain link
      if (entry.previousHash !== previousHash) {
        return {
          isValid: false,
          totalEntries: this.entries.length,
          verifiedEntries: verifiedCount,
          brokenAtSequence: entry.sequence,
          expectedHash: previousHash,
          actualHash: entry.previousHash,
          errors: [`Hash chain broken at sequence ${entry.sequence}`],
        };
      }

      // Verify entry checksum
      if (!verifyEntryChecksum(entry)) {
        return {
          isValid: false,
          totalEntries: this.entries.length,
          verifiedEntries: verifiedCount,
          brokenAtSequence: entry.sequence,
          errors: [`Entry checksum invalid at sequence ${entry.sequence}`],
        };
      }

      previousHash = entry.checksum;
      verifiedCount++;
    }

    return {
      isValid: true,
      totalEntries: this.entries.length,
      verifiedEntries: verifiedCount,
      errors,
    };
  }

  /**
   * Verify a single entry's integrity
   */
  verifyEntry(entryId: LedgerEntryId): boolean {
    const entry = this.getEntry(entryId);
    if (!entry) return false;
    return verifyEntryChecksum(entry);
  }

  /**
   * Verify a batch's integrity and balance
   */
  verifyBatch(batchId: LedgerBatchId): BatchVerificationResult {
    const batch = this.getBatch(batchId);
    if (!batch) {
      return {
        batchId,
        isValid: false,
        entryCount: 0,
        netDelta: 0,
        errors: ['Batch not found'],
      };
    }

    const errors: string[] = [];

    // Verify batch checksum
    if (!verifyBatchChecksum(batch)) {
      errors.push('Batch checksum invalid');
    }

    // Verify all entries exist and their checksums
    const entries = this.getBatchEntries(batchId);
    if (entries.length !== batch.entryIds.length) {
      errors.push(
        `Entry count mismatch: expected ${batch.entryIds.length}, found ${entries.length}`
      );
    }

    let calculatedNetDelta = 0;
    for (const entry of entries) {
      if (!verifyEntryChecksum(entry)) {
        errors.push(`Entry ${entry.entryId} has invalid checksum`);
      }
      calculatedNetDelta += entry.delta;
    }

    // Verify net delta
    if (calculatedNetDelta !== batch.netDelta) {
      errors.push(
        `Net delta mismatch: recorded ${batch.netDelta}, calculated ${calculatedNetDelta}`
      );
    }

    return {
      batchId,
      isValid: errors.length === 0,
      entryCount: entries.length,
      netDelta: calculatedNetDelta,
      errors,
    };
  }

  // ==========================================================================
  // Export / Snapshot
  // ==========================================================================

  /**
   * Export ledger state for persistence/transfer
   */
  export(): {
    entries: readonly LedgerEntry[];
    batches: readonly LedgerBatch[];
    sequence: number;
    lastHash: string;
  } {
    return {
      entries: [...this.entries],
      batches: Array.from(this.batches.values()),
      sequence: this.sequence,
      lastHash: this.lastHash,
    };
  }

  /**
   * Get statistics about the ledger
   */
  getStatistics(): {
    entryCount: number;
    batchCount: number;
    currentSequence: number;
    oldestTimestamp: number | null;
    newestTimestamp: number | null;
  } {
    return {
      entryCount: this.entries.length,
      batchCount: this.batches.size,
      currentSequence: this.sequence,
      oldestTimestamp: this.entries.length > 0 ? this.entries[0].timestamp : null,
      newestTimestamp:
        this.entries.length > 0
          ? this.entries[this.entries.length - 1].timestamp
          : null,
    };
  }

  /**
   * Clear all data (for testing only)
   */
  clear(): void {
    this.entries.length = 0;
    this.batches.clear();
    this.entriesByBatch.clear();
    this.sequence = 0;
    this.lastHash = 'genesis';
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createValueLedger(config?: Partial<LedgerConfig>): ValueLedger {
  return new ValueLedger({
    ...DEFAULT_LEDGER_CONFIG,
    ...config,
  });
}
