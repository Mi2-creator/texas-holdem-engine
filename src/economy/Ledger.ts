/**
 * Ledger.ts
 * Phase 14 - Append-only immutable financial ledger
 *
 * Every chip movement is recorded as an immutable ledger entry.
 * Entries cannot be edited or deleted - only appended.
 *
 * Key properties:
 * - Append-only: entries cannot be modified or deleted
 * - Auditable: every entry has a reason and context
 * - Hash chain: optional integrity verification
 * - Deterministic: replay produces identical state
 */

import { PlayerId } from '../security/Identity';
import { TableId, HandId } from '../security/AuditLog';
import { EconomyErrors } from './EconomyErrors';

// ============================================================================
// Types
// ============================================================================

export type LedgerEntryId = string;
export type SettlementId = string;

export enum LedgerEntryType {
  // Balance operations
  DEPOSIT = 'deposit',
  WITHDRAWAL = 'withdrawal',
  TRANSFER = 'transfer',

  // Table operations
  BUY_IN = 'buy_in',
  CASH_OUT = 'cash_out',

  // Hand operations
  BLIND_POST = 'blind_post',
  BET = 'bet',
  CALL = 'call',
  RAISE = 'raise',
  ALL_IN = 'all_in',
  POT_WIN = 'pot_win',
  POT_RETURN = 'pot_return',  // Uncalled bet returned

  // Rake
  RAKE_COLLECTED = 'rake_collected',

  // Adjustments
  ADJUSTMENT = 'adjustment',
  BONUS = 'bonus',
  REFUND = 'refund',
}

export interface LedgerEntry {
  readonly entryId: LedgerEntryId;
  readonly sequence: number;
  readonly timestamp: number;
  readonly type: LedgerEntryType;
  readonly playerId: PlayerId;
  readonly amount: number;                // Positive for credit, negative for debit
  readonly balanceAfter: number;          // Player's balance after this entry
  readonly tableId?: TableId;
  readonly handId?: HandId;
  readonly reason: string;
  readonly relatedEntryId?: LedgerEntryId; // For transfers, references the other side
  readonly metadata?: Record<string, unknown>;
  readonly previousHash: string;
  readonly hash: string;
}

export interface LedgerQuery {
  readonly playerId?: PlayerId;
  readonly tableId?: TableId;
  readonly handId?: HandId;
  readonly types?: readonly LedgerEntryType[];
  readonly fromTimestamp?: number;
  readonly toTimestamp?: number;
  readonly fromSequence?: number;
  readonly toSequence?: number;
  readonly limit?: number;
  readonly offset?: number;
}

export interface LedgerSummary {
  readonly playerId: PlayerId;
  readonly totalCredits: number;
  readonly totalDebits: number;
  readonly netChange: number;
  readonly entryCount: number;
  readonly lastBalance: number;
  readonly lastTimestamp: number;
}

export interface HandLedgerSummary {
  readonly handId: HandId;
  readonly tableId: TableId;
  readonly totalPotContributions: number;
  readonly totalPotAwards: number;
  readonly rakeCollected: number;
  readonly entries: readonly LedgerEntry[];
}

export interface SettlementRecord {
  readonly settlementId: SettlementId;
  readonly handId: HandId;
  readonly tableId: TableId;
  readonly timestamp: number;
  readonly entries: readonly LedgerEntryId[];
  readonly totalPot: number;
  readonly rakeCollected: number;
  readonly chipsBefore: number;
  readonly chipsAfter: number;
}

// ============================================================================
// Ledger Configuration
// ============================================================================

export interface LedgerConfig {
  readonly enableHashChain: boolean;
  readonly maxEntries: number;
  readonly enableSettlementTracking: boolean;
}

const DEFAULT_LEDGER_CONFIG: LedgerConfig = {
  enableHashChain: true,
  maxEntries: 1000000,
  enableSettlementTracking: true,
};

// ============================================================================
// Ledger Manager
// ============================================================================

export class LedgerManager {
  private config: LedgerConfig;
  private entries: LedgerEntry[];
  private sequence: number;
  private lastHash: string;
  private settlements: Map<SettlementId, SettlementRecord>;
  private processedSettlements: Set<string>;  // handId:settlementId
  private playerBalances: Map<PlayerId, number>;

  constructor(config: Partial<LedgerConfig> = {}) {
    this.config = { ...DEFAULT_LEDGER_CONFIG, ...config };
    this.entries = [];
    this.sequence = 0;
    this.lastHash = 'genesis';
    this.settlements = new Map();
    this.processedSettlements = new Set();
    this.playerBalances = new Map();
  }

  /**
   * Record a ledger entry
   */
  record(params: {
    type: LedgerEntryType;
    playerId: PlayerId;
    amount: number;
    reason: string;
    tableId?: TableId;
    handId?: HandId;
    relatedEntryId?: LedgerEntryId;
    metadata?: Record<string, unknown>;
    balanceAfter?: number;  // If not provided, will be calculated
  }): LedgerEntry {
    const {
      type,
      playerId,
      amount,
      reason,
      tableId,
      handId,
      relatedEntryId,
      metadata,
    } = params;

    // Validate amount is integer
    if (!Number.isInteger(amount)) {
      throw EconomyErrors.invalidAmount(amount, 'Ledger entries require integer amounts');
    }

    // Calculate balance after
    const currentBalance = this.playerBalances.get(playerId) ?? 0;
    const balanceAfter = params.balanceAfter ?? (currentBalance + amount);

    // Validate no negative balance
    if (balanceAfter < 0) {
      throw EconomyErrors.negativeBalance(playerId, balanceAfter);
    }

    const entryId = this.generateEntryId();
    const timestamp = Date.now();
    const previousHash = this.lastHash;

    // Create entry without hash first
    const entryData = {
      entryId,
      sequence: ++this.sequence,
      timestamp,
      type,
      playerId,
      amount,
      balanceAfter,
      tableId,
      handId,
      reason,
      relatedEntryId,
      metadata,
      previousHash,
    };

    // Calculate hash
    const hash = this.config.enableHashChain
      ? this.calculateHash(entryData)
      : '';

    const entry: LedgerEntry = {
      ...entryData,
      hash,
    };

    // Store entry
    this.entries.push(entry);
    this.lastHash = hash;
    this.playerBalances.set(playerId, balanceAfter);

    return entry;
  }

  /**
   * Record blind posting
   */
  recordBlind(
    playerId: PlayerId,
    amount: number,
    blindType: 'small' | 'big',
    handId: HandId,
    tableId: TableId,
    balanceAfter: number
  ): LedgerEntry {
    return this.record({
      type: LedgerEntryType.BLIND_POST,
      playerId,
      amount: -amount,
      reason: `${blindType === 'small' ? 'Small' : 'Big'} blind posted`,
      handId,
      tableId,
      balanceAfter,
      metadata: { blindType },
    });
  }

  /**
   * Record a bet
   */
  recordBet(
    playerId: PlayerId,
    amount: number,
    handId: HandId,
    tableId: TableId,
    balanceAfter: number,
    street: string
  ): LedgerEntry {
    return this.record({
      type: LedgerEntryType.BET,
      playerId,
      amount: -amount,
      reason: `Bet on ${street}`,
      handId,
      tableId,
      balanceAfter,
      metadata: { street },
    });
  }

  /**
   * Record pot win
   */
  recordPotWin(
    playerId: PlayerId,
    amount: number,
    handId: HandId,
    tableId: TableId,
    balanceAfter: number,
    isSplitPot: boolean = false,
    potType: string = 'main'
  ): LedgerEntry {
    return this.record({
      type: LedgerEntryType.POT_WIN,
      playerId,
      amount,
      reason: isSplitPot ? `Split pot win (${potType})` : `Pot win (${potType})`,
      handId,
      tableId,
      balanceAfter,
      metadata: { isSplitPot, potType },
    });
  }

  /**
   * Record rake collection
   */
  recordRake(
    playerId: PlayerId,  // Use special rake account ID
    amount: number,
    handId: HandId,
    tableId: TableId
  ): LedgerEntry {
    return this.record({
      type: LedgerEntryType.RAKE_COLLECTED,
      playerId,
      amount,
      reason: 'Rake collected',
      handId,
      tableId,
    });
  }

  /**
   * Record buy-in
   */
  recordBuyIn(
    playerId: PlayerId,
    amount: number,
    tableId: TableId,
    balanceAfter: number
  ): LedgerEntry {
    return this.record({
      type: LedgerEntryType.BUY_IN,
      playerId,
      amount: -amount,
      reason: 'Buy-in to table',
      tableId,
      balanceAfter,
    });
  }

  /**
   * Record cash-out
   */
  recordCashOut(
    playerId: PlayerId,
    amount: number,
    tableId: TableId,
    balanceAfter: number
  ): LedgerEntry {
    return this.record({
      type: LedgerEntryType.CASH_OUT,
      playerId,
      amount,
      reason: 'Cash-out from table',
      tableId,
      balanceAfter,
    });
  }

  /**
   * Record settlement (prevents duplicate settlement)
   */
  recordSettlement(
    settlementId: SettlementId,
    handId: HandId,
    tableId: TableId,
    totalPot: number,
    rakeCollected: number,
    chipsBefore: number,
    chipsAfter: number,
    entryIds: readonly LedgerEntryId[]
  ): SettlementRecord {
    // Check for duplicate settlement
    const key = `${handId}:${settlementId}`;
    if (this.processedSettlements.has(key)) {
      throw EconomyErrors.duplicateSettlement(handId, settlementId);
    }

    const record: SettlementRecord = {
      settlementId,
      handId,
      tableId,
      timestamp: Date.now(),
      entries: entryIds,
      totalPot,
      rakeCollected,
      chipsBefore,
      chipsAfter,
    };

    this.settlements.set(settlementId, record);
    this.processedSettlements.add(key);

    return record;
  }

  /**
   * Check if settlement was already processed
   */
  isSettlementProcessed(handId: HandId, settlementId: SettlementId): boolean {
    return this.processedSettlements.has(`${handId}:${settlementId}`);
  }

  /**
   * Query ledger entries
   */
  query(params: LedgerQuery): readonly LedgerEntry[] {
    let results = this.entries;

    if (params.playerId) {
      results = results.filter(e => e.playerId === params.playerId);
    }

    if (params.tableId) {
      results = results.filter(e => e.tableId === params.tableId);
    }

    if (params.handId) {
      results = results.filter(e => e.handId === params.handId);
    }

    if (params.types && params.types.length > 0) {
      const types = new Set(params.types);
      results = results.filter(e => types.has(e.type));
    }

    if (params.fromTimestamp) {
      results = results.filter(e => e.timestamp >= params.fromTimestamp!);
    }

    if (params.toTimestamp) {
      results = results.filter(e => e.timestamp <= params.toTimestamp!);
    }

    if (params.fromSequence) {
      results = results.filter(e => e.sequence >= params.fromSequence!);
    }

    if (params.toSequence) {
      results = results.filter(e => e.sequence <= params.toSequence!);
    }

    if (params.offset) {
      results = results.slice(params.offset);
    }

    if (params.limit) {
      results = results.slice(0, params.limit);
    }

    return results;
  }

  /**
   * Get entries for a specific hand
   */
  getHandEntries(handId: HandId): readonly LedgerEntry[] {
    return this.query({ handId });
  }

  /**
   * Get player summary
   */
  getPlayerSummary(playerId: PlayerId): LedgerSummary {
    const entries = this.query({ playerId });

    let totalCredits = 0;
    let totalDebits = 0;
    let lastBalance = 0;
    let lastTimestamp = 0;

    for (const entry of entries) {
      if (entry.amount > 0) {
        totalCredits += entry.amount;
      } else {
        totalDebits += Math.abs(entry.amount);
      }
      lastBalance = entry.balanceAfter;
      lastTimestamp = entry.timestamp;
    }

    return {
      playerId,
      totalCredits,
      totalDebits,
      netChange: totalCredits - totalDebits,
      entryCount: entries.length,
      lastBalance,
      lastTimestamp,
    };
  }

  /**
   * Get hand ledger summary
   */
  getHandSummary(handId: HandId): HandLedgerSummary | null {
    const entries = this.getHandEntries(handId);
    if (entries.length === 0) return null;

    let totalPotContributions = 0;
    let totalPotAwards = 0;
    let rakeCollected = 0;
    let tableId: TableId | undefined;

    for (const entry of entries) {
      if (!tableId && entry.tableId) {
        tableId = entry.tableId;
      }

      switch (entry.type) {
        case LedgerEntryType.BLIND_POST:
        case LedgerEntryType.BET:
        case LedgerEntryType.CALL:
        case LedgerEntryType.RAISE:
        case LedgerEntryType.ALL_IN:
          totalPotContributions += Math.abs(entry.amount);
          break;
        case LedgerEntryType.POT_WIN:
        case LedgerEntryType.POT_RETURN:
          totalPotAwards += entry.amount;
          break;
        case LedgerEntryType.RAKE_COLLECTED:
          rakeCollected += entry.amount;
          break;
      }
    }

    return {
      handId,
      tableId: tableId ?? '',
      totalPotContributions,
      totalPotAwards,
      rakeCollected,
      entries,
    };
  }

  /**
   * Verify chip conservation for a hand
   */
  verifyHandConservation(handId: HandId): {
    valid: boolean;
    discrepancy?: number;
    details?: string;
  } {
    const summary = this.getHandSummary(handId);
    if (!summary) {
      return { valid: false, details: 'Hand not found' };
    }

    const expected = summary.totalPotContributions - summary.rakeCollected;
    const actual = summary.totalPotAwards;

    if (expected !== actual) {
      return {
        valid: false,
        discrepancy: actual - expected,
        details: `Expected ${expected} chips awarded, got ${actual}`,
      };
    }

    return { valid: true };
  }

  /**
   * Verify hash chain integrity
   */
  verifyIntegrity(fromSequence?: number, toSequence?: number): {
    valid: boolean;
    brokenAt?: number;
    expected?: string;
    actual?: string;
  } {
    if (!this.config.enableHashChain) {
      return { valid: true };
    }

    const start = fromSequence ?? 1;
    const end = toSequence ?? this.sequence;

    let previousHash = 'genesis';
    for (const entry of this.entries) {
      if (entry.sequence < start) {
        previousHash = entry.hash;
        continue;
      }
      if (entry.sequence > end) break;

      if (entry.previousHash !== previousHash) {
        return {
          valid: false,
          brokenAt: entry.sequence,
          expected: previousHash,
          actual: entry.previousHash,
        };
      }

      // Verify entry hash
      const expectedHash = this.calculateHash({
        entryId: entry.entryId,
        sequence: entry.sequence,
        timestamp: entry.timestamp,
        type: entry.type,
        playerId: entry.playerId,
        amount: entry.amount,
        balanceAfter: entry.balanceAfter,
        tableId: entry.tableId,
        handId: entry.handId,
        reason: entry.reason,
        relatedEntryId: entry.relatedEntryId,
        metadata: entry.metadata,
        previousHash: entry.previousHash,
      });

      if (entry.hash !== expectedHash) {
        return {
          valid: false,
          brokenAt: entry.sequence,
          expected: expectedHash,
          actual: entry.hash,
        };
      }

      previousHash = entry.hash;
    }

    return { valid: true };
  }

  /**
   * Replay entries to verify determinism
   */
  replayEntries(
    entries: readonly LedgerEntry[],
    expectedBalances: ReadonlyMap<PlayerId, number>
  ): { valid: boolean; mismatches: Map<PlayerId, { expected: number; actual: number }> } {
    const replayBalances = new Map<PlayerId, number>();
    const mismatches = new Map<PlayerId, { expected: number; actual: number }>();

    for (const entry of entries) {
      const current = replayBalances.get(entry.playerId) ?? 0;
      replayBalances.set(entry.playerId, current + entry.amount);
    }

    // Compare final balances
    for (const [playerId, expected] of expectedBalances) {
      const actual = replayBalances.get(playerId) ?? 0;
      if (actual !== expected) {
        mismatches.set(playerId, { expected, actual });
      }
    }

    return {
      valid: mismatches.size === 0,
      mismatches,
    };
  }

  /**
   * Get current sequence
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

  /**
   * Get entry by ID
   */
  getEntry(entryId: LedgerEntryId): LedgerEntry | null {
    return this.entries.find(e => e.entryId === entryId) ?? null;
  }

  /**
   * Export entries
   */
  export(fromSequence?: number, toSequence?: number): readonly LedgerEntry[] {
    const start = fromSequence ?? 1;
    const end = toSequence ?? this.sequence;
    return this.entries.filter(e => e.sequence >= start && e.sequence <= end);
  }

  /**
   * Get player balance from ledger
   */
  getPlayerBalance(playerId: PlayerId): number {
    return this.playerBalances.get(playerId) ?? 0;
  }

  /**
   * Set initial balance (for initialization)
   */
  setInitialBalance(playerId: PlayerId, balance: number): void {
    if (!this.playerBalances.has(playerId)) {
      this.playerBalances.set(playerId, balance);
    }
  }

  /**
   * Clear all data (for testing)
   */
  clear(): void {
    this.entries = [];
    this.sequence = 0;
    this.lastHash = 'genesis';
    this.settlements.clear();
    this.processedSettlements.clear();
    this.playerBalances.clear();
  }

  /**
   * Calculate hash for an entry
   */
  private calculateHash(data: Omit<LedgerEntry, 'hash'>): string {
    const str = JSON.stringify(data);
    return this.simpleHash(str);
  }

  /**
   * Simple hash function
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
  }

  /**
   * Generate unique entry ID
   */
  private generateEntryId(): LedgerEntryId {
    return `led_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let ledgerManagerInstance: LedgerManager | null = null;

export function getLedgerManager(): LedgerManager {
  if (!ledgerManagerInstance) {
    ledgerManagerInstance = new LedgerManager();
  }
  return ledgerManagerInstance;
}

export function resetLedgerManager(config?: Partial<LedgerConfig>): LedgerManager {
  ledgerManagerInstance = new LedgerManager(config);
  return ledgerManagerInstance;
}
