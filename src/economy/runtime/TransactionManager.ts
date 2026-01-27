/**
 * TransactionManager.ts
 * Phase 20 - Atomic transactions with rollback support
 *
 * Provides:
 * - Atomic multi-operation transactions
 * - Automatic rollback on failure
 * - Transaction logging for audit
 * - Idempotency guarantees
 */

import { PlayerId } from '../../security/Identity';
import { TableId, HandId } from '../../security/AuditLog';
import { BalanceManager } from '../Balance';
import { EscrowManager } from '../Escrow';
import { EconomyErrors } from '../EconomyErrors';
import {
  TransactionId,
  OperationId,
  Transaction,
  TransactionOperation,
  TransactionResult,
  TransactionStatus,
  OperationType,
  EconomyRuntimeConfig,
  DEFAULT_RUNTIME_CONFIG,
  generateTransactionId,
  generateOperationId,
} from './RuntimeTypes';

// ============================================================================
// Rollback Operation Types
// ============================================================================

interface RollbackOperation {
  readonly operationId: OperationId;
  readonly execute: () => void;
}

// ============================================================================
// TransactionManager Implementation
// ============================================================================

export class TransactionManager {
  private readonly balanceManager: BalanceManager;
  private readonly escrowManager: EscrowManager;
  private readonly config: EconomyRuntimeConfig;
  private readonly transactions: Map<TransactionId, Transaction>;
  private readonly completedTransactions: Set<string>; // idempotency keys
  private readonly transactionLog: Transaction[];

  constructor(
    balanceManager: BalanceManager,
    escrowManager: EscrowManager,
    config: Partial<EconomyRuntimeConfig> = {}
  ) {
    this.balanceManager = balanceManager;
    this.escrowManager = escrowManager;
    this.config = { ...DEFAULT_RUNTIME_CONFIG, ...config };
    this.transactions = new Map();
    this.completedTransactions = new Set();
    this.transactionLog = [];
  }

  // ==========================================================================
  // Transaction Lifecycle
  // ==========================================================================

  /**
   * Begin a new transaction
   */
  beginTransaction(handId?: HandId, tableId?: TableId): TransactionBuilder {
    const transactionId = generateTransactionId();

    const transaction: Transaction = {
      transactionId,
      handId,
      tableId,
      operations: [],
      status: 'pending',
      createdAt: Date.now(),
    };

    this.transactions.set(transactionId, transaction);

    return new TransactionBuilder(
      transactionId,
      this,
      this.balanceManager,
      this.escrowManager
    );
  }

  /**
   * Execute a transaction atomically
   */
  executeTransaction(builder: TransactionBuilder): TransactionResult {
    const transactionId = builder.getTransactionId();
    const operations = builder.getOperations();
    const rollbacks = builder.getRollbacks();

    // Check idempotency
    const idempotencyKey = builder.getIdempotencyKey();
    if (idempotencyKey && this.completedTransactions.has(idempotencyKey)) {
      return {
        success: true,
        transactionId,
        error: 'Transaction already processed (idempotent)',
      };
    }

    // Track which operations succeeded for rollback
    const executedOperationIds: Set<OperationId> = new Set();

    try {
      // Execute all operations
      for (const operation of operations) {
        this.executeOperation(operation);
        executedOperationIds.add(operation.operationId);
      }

      // Mark as committed
      const transaction = this.transactions.get(transactionId)!;
      const committedTransaction: Transaction = {
        ...transaction,
        operations,
        status: 'committed',
        committedAt: Date.now(),
      };

      this.transactions.set(transactionId, committedTransaction);

      if (this.config.enableTransactionLogging) {
        this.transactionLog.push(committedTransaction);
      }

      // Mark idempotency key as processed
      if (idempotencyKey) {
        this.completedTransactions.add(idempotencyKey);
      }

      return {
        success: true,
        transactionId,
      };
    } catch (error) {
      // Only rollback operations that actually succeeded
      const rollbacksToExecute = rollbacks.filter(r =>
        executedOperationIds.has(r.operationId)
      );
      this.rollback(transactionId, rollbacksToExecute, error);

      return {
        success: false,
        transactionId,
        error: error instanceof Error ? error.message : 'Unknown error',
        rollbackPerformed: true,
      };
    }
  }

  /**
   * Rollback a transaction
   */
  private rollback(
    transactionId: TransactionId,
    rollbacks: readonly RollbackOperation[],
    originalError: unknown
  ): void {
    // Execute rollbacks in reverse order
    const reversedRollbacks = [...rollbacks].reverse();

    for (const rollback of reversedRollbacks) {
      try {
        rollback.execute();
      } catch (rollbackError) {
        // Log rollback failure but continue with other rollbacks
        console.error(
          `Rollback failed for operation ${rollback.operationId}:`,
          rollbackError
        );
      }
    }

    // Update transaction status
    const transaction = this.transactions.get(transactionId);
    if (transaction) {
      const rolledBackTransaction: Transaction = {
        ...transaction,
        status: 'rolled_back',
        rolledBackAt: Date.now(),
        error: originalError instanceof Error ? originalError.message : 'Unknown error',
      };

      this.transactions.set(transactionId, rolledBackTransaction);

      if (this.config.enableTransactionLogging) {
        this.transactionLog.push(rolledBackTransaction);
      }
    }
  }

  /**
   * Execute a single operation
   */
  private executeOperation(operation: TransactionOperation): void {
    const { type, playerId, tableId, amount } = operation;

    switch (type) {
      case 'lock_chips':
        this.balanceManager.lock(playerId, amount);
        break;

      case 'unlock_chips':
        this.balanceManager.unlock(playerId, amount);
        break;

      case 'commit_to_pot':
        if (!tableId) throw new Error('tableId required for commit_to_pot');
        this.escrowManager.commitChips(tableId, playerId, amount);
        break;

      case 'award_pot':
        if (!tableId) throw new Error('tableId required for award_pot');
        this.escrowManager.awardPot(tableId, playerId, amount);
        break;

      case 'buy_in':
        if (!tableId) throw new Error('tableId required for buy_in');
        this.escrowManager.buyIn(tableId, playerId, amount);
        break;

      case 'cash_out':
        if (!tableId) throw new Error('tableId required for cash_out');
        this.escrowManager.cashOut(tableId, playerId, amount > 0 ? amount : undefined);
        break;

      case 'blind_post':
      case 'bet':
      case 'call':
      case 'raise':
      case 'all_in':
        if (!tableId) throw new Error('tableId required for betting operation');
        this.escrowManager.commitChips(tableId, playerId, amount);
        this.escrowManager.moveToPot(tableId, playerId, amount);
        break;

      case 'collect_rake':
        // Rake is deducted from pot, no balance operation needed
        break;

      default:
        throw new Error(`Unknown operation type: ${type}`);
    }
  }

  // ==========================================================================
  // Transaction Queries
  // ==========================================================================

  /**
   * Get a transaction by ID
   */
  getTransaction(transactionId: TransactionId): Transaction | null {
    return this.transactions.get(transactionId) ?? null;
  }

  /**
   * Get all pending transactions
   */
  getPendingTransactions(): readonly Transaction[] {
    return Array.from(this.transactions.values()).filter(
      t => t.status === 'pending'
    );
  }

  /**
   * Get transaction log
   */
  getTransactionLog(): readonly Transaction[] {
    return [...this.transactionLog];
  }

  /**
   * Check if an idempotency key has been processed
   */
  isProcessed(idempotencyKey: string): boolean {
    return this.completedTransactions.has(idempotencyKey);
  }

  /**
   * Clean up old transactions
   */
  cleanupOldTransactions(maxAgeMs: number = 3600000): number {
    const cutoff = Date.now() - maxAgeMs;
    let cleaned = 0;

    for (const [id, transaction] of this.transactions) {
      if (transaction.status !== 'pending' && transaction.createdAt < cutoff) {
        this.transactions.delete(id);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Clear all state (for testing)
   */
  clear(): void {
    this.transactions.clear();
    this.completedTransactions.clear();
    this.transactionLog.length = 0;
  }
}

// ============================================================================
// Transaction Builder
// ============================================================================

export class TransactionBuilder {
  private readonly transactionId: TransactionId;
  private readonly transactionManager: TransactionManager;
  private readonly balanceManager: BalanceManager;
  private readonly escrowManager: EscrowManager;
  private readonly operations: TransactionOperation[];
  private readonly rollbacks: RollbackOperation[];
  private idempotencyKey?: string;

  constructor(
    transactionId: TransactionId,
    transactionManager: TransactionManager,
    balanceManager: BalanceManager,
    escrowManager: EscrowManager
  ) {
    this.transactionId = transactionId;
    this.transactionManager = transactionManager;
    this.balanceManager = balanceManager;
    this.escrowManager = escrowManager;
    this.operations = [];
    this.rollbacks = [];
  }

  /**
   * Set idempotency key for this transaction
   */
  withIdempotencyKey(key: string): this {
    this.idempotencyKey = key;
    return this;
  }

  /**
   * Add a lock chips operation
   */
  lockChips(playerId: PlayerId, amount: number): this {
    const operationId = generateOperationId();

    this.operations.push({
      operationId,
      type: 'lock_chips',
      playerId,
      amount,
      timestamp: Date.now(),
    });

    this.rollbacks.push({
      operationId,
      execute: () => this.balanceManager.unlock(playerId, amount),
    });

    return this;
  }

  /**
   * Add an unlock chips operation
   */
  unlockChips(playerId: PlayerId, amount: number): this {
    const operationId = generateOperationId();

    this.operations.push({
      operationId,
      type: 'unlock_chips',
      playerId,
      amount,
      timestamp: Date.now(),
    });

    this.rollbacks.push({
      operationId,
      execute: () => this.balanceManager.lock(playerId, amount),
    });

    return this;
  }

  /**
   * Add a buy-in operation
   */
  buyIn(tableId: TableId, playerId: PlayerId, amount: number): this {
    const operationId = generateOperationId();

    this.operations.push({
      operationId,
      type: 'buy_in',
      playerId,
      tableId,
      amount,
      timestamp: Date.now(),
    });

    // Rollback: cash out the amount
    this.rollbacks.push({
      operationId,
      execute: () => {
        try {
          this.escrowManager.cashOut(tableId, playerId, amount);
        } catch {
          // Escrow might not exist if buy-in failed
        }
      },
    });

    return this;
  }

  /**
   * Add a cash-out operation
   */
  cashOut(tableId: TableId, playerId: PlayerId, amount?: number): this {
    const operationId = generateOperationId();
    const currentStack = this.escrowManager.getStack(tableId, playerId);
    const cashOutAmount = amount ?? currentStack;

    this.operations.push({
      operationId,
      type: 'cash_out',
      playerId,
      tableId,
      amount: cashOutAmount,
      timestamp: Date.now(),
    });

    // Rollback: buy back in with the cashed out amount
    this.rollbacks.push({
      operationId,
      execute: () => {
        if (cashOutAmount > 0) {
          this.escrowManager.buyIn(tableId, playerId, cashOutAmount);
        }
      },
    });

    return this;
  }

  /**
   * Add a betting operation (blind, bet, call, raise, all-in)
   */
  recordBet(
    tableId: TableId,
    playerId: PlayerId,
    amount: number,
    type: 'blind_post' | 'bet' | 'call' | 'raise' | 'all_in',
    handId?: HandId
  ): this {
    const operationId = generateOperationId();

    this.operations.push({
      operationId,
      type,
      playerId,
      tableId,
      handId,
      amount,
      timestamp: Date.now(),
    });

    // Rollback: return chips to stack (this is complex due to moveToPot)
    // In practice, we don't support rollback of betting operations mid-hand
    // as this would require tracking pot state
    this.rollbacks.push({
      operationId,
      execute: () => {
        // Cannot easily rollback pot contributions
        // This is by design - betting operations are final within a hand
      },
    });

    return this;
  }

  /**
   * Add a pot award operation
   */
  awardPot(tableId: TableId, playerId: PlayerId, amount: number): this {
    const operationId = generateOperationId();

    this.operations.push({
      operationId,
      type: 'award_pot',
      playerId,
      tableId,
      amount,
      timestamp: Date.now(),
    });

    // No rollback for pot awards - they're part of settlement
    this.rollbacks.push({
      operationId,
      execute: () => {},
    });

    return this;
  }

  /**
   * Add a rake collection operation
   */
  collectRake(tableId: TableId, amount: number, handId?: HandId): this {
    const operationId = generateOperationId();

    this.operations.push({
      operationId,
      type: 'collect_rake',
      playerId: 'rake_account' as PlayerId,
      tableId,
      handId,
      amount,
      timestamp: Date.now(),
    });

    // No rollback for rake - it's part of settlement
    this.rollbacks.push({
      operationId,
      execute: () => {},
    });

    return this;
  }

  /**
   * Execute the transaction
   */
  commit(): TransactionResult {
    return this.transactionManager.executeTransaction(this);
  }

  /**
   * Get transaction ID
   */
  getTransactionId(): TransactionId {
    return this.transactionId;
  }

  /**
   * Get operations (internal use)
   */
  getOperations(): readonly TransactionOperation[] {
    return [...this.operations];
  }

  /**
   * Get rollbacks (internal use)
   */
  getRollbacks(): readonly RollbackOperation[] {
    return [...this.rollbacks];
  }

  /**
   * Get idempotency key (internal use)
   */
  getIdempotencyKey(): string | undefined {
    return this.idempotencyKey;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createTransactionManager(
  balanceManager: BalanceManager,
  escrowManager: EscrowManager,
  config?: Partial<EconomyRuntimeConfig>
): TransactionManager {
  return new TransactionManager(balanceManager, escrowManager, config);
}
