/**
 * Balance.ts
 * Phase 14 - Player balance management
 *
 * Manages player chip balances with three states:
 * - available: chips that can be used for buy-ins
 * - locked: chips currently in play at tables (escrow)
 * - pending: chips in pending transactions (deposits/withdrawals)
 *
 * All operations use integer chips to avoid floating point errors.
 * No negative balances are ever allowed.
 */

import { PlayerId } from '../security/Identity';
import {
  EconomyErrors,
  BalanceNotFoundError,
  InsufficientBalanceError,
  NegativeBalanceError,
  InvalidAmountError,
} from './EconomyErrors';

// ============================================================================
// Types
// ============================================================================

export type BalanceId = string;
export type TransactionId = string;

export interface PlayerBalance {
  readonly playerId: PlayerId;
  readonly available: number;      // Chips available for use
  readonly locked: number;         // Chips locked in table escrow
  readonly pending: number;        // Chips in pending transactions
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface BalanceSnapshot {
  readonly playerId: PlayerId;
  readonly total: number;
  readonly available: number;
  readonly locked: number;
  readonly pending: number;
  readonly timestamp: number;
}

export interface BalanceTransfer {
  readonly fromPlayerId: PlayerId;
  readonly toPlayerId: PlayerId;
  readonly amount: number;
  readonly transactionId: TransactionId;
  readonly timestamp: number;
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate that an amount is a positive integer
 */
function validateAmount(amount: number, operation: string): void {
  if (!Number.isInteger(amount)) {
    throw EconomyErrors.invalidAmount(amount, `${operation} requires integer amounts`);
  }
  if (amount < 0) {
    throw EconomyErrors.invalidAmount(amount, `${operation} requires non-negative amount`);
  }
}

/**
 * Validate that an amount is a strictly positive integer
 */
function validatePositiveAmount(amount: number, operation: string): void {
  if (!Number.isInteger(amount)) {
    throw EconomyErrors.invalidAmount(amount, `${operation} requires integer amounts`);
  }
  if (amount <= 0) {
    throw EconomyErrors.invalidAmount(amount, `${operation} requires positive amount`);
  }
}

// ============================================================================
// Balance Manager
// ============================================================================

export class BalanceManager {
  private balances: Map<PlayerId, PlayerBalance>;
  private onBalanceChange?: (playerId: PlayerId, balance: PlayerBalance) => void;

  constructor() {
    this.balances = new Map();
  }

  /**
   * Set callback for balance changes
   */
  setBalanceChangeCallback(
    callback: (playerId: PlayerId, balance: PlayerBalance) => void
  ): void {
    this.onBalanceChange = callback;
  }

  /**
   * Create a new player balance
   */
  createBalance(playerId: PlayerId, initialAmount: number = 0): PlayerBalance {
    validateAmount(initialAmount, 'createBalance');

    if (this.balances.has(playerId)) {
      throw EconomyErrors.invalidOperation(
        'createBalance',
        `Balance already exists for player ${playerId}`
      );
    }

    const now = Date.now();
    const balance: PlayerBalance = {
      playerId,
      available: initialAmount,
      locked: 0,
      pending: 0,
      createdAt: now,
      updatedAt: now,
    };

    this.balances.set(playerId, balance);
    this.notifyBalanceChange(playerId, balance);
    return balance;
  }

  /**
   * Get player balance (throws if not found)
   */
  getBalance(playerId: PlayerId): PlayerBalance {
    const balance = this.balances.get(playerId);
    if (!balance) {
      throw EconomyErrors.balanceNotFound(playerId);
    }
    return balance;
  }

  /**
   * Get player balance or null if not found
   */
  getBalanceOrNull(playerId: PlayerId): PlayerBalance | null {
    return this.balances.get(playerId) ?? null;
  }

  /**
   * Get total balance (available + locked + pending)
   */
  getTotalBalance(playerId: PlayerId): number {
    const balance = this.getBalance(playerId);
    return balance.available + balance.locked + balance.pending;
  }

  /**
   * Get a snapshot of the balance at current time
   */
  getSnapshot(playerId: PlayerId): BalanceSnapshot {
    const balance = this.getBalance(playerId);
    return {
      playerId: balance.playerId,
      total: balance.available + balance.locked + balance.pending,
      available: balance.available,
      locked: balance.locked,
      pending: balance.pending,
      timestamp: Date.now(),
    };
  }

  /**
   * Credit chips to available balance (e.g., deposit, winnings)
   */
  credit(playerId: PlayerId, amount: number): PlayerBalance {
    validatePositiveAmount(amount, 'credit');

    const current = this.getBalance(playerId);
    const updated: PlayerBalance = {
      ...current,
      available: current.available + amount,
      updatedAt: Date.now(),
    };

    this.balances.set(playerId, updated);
    this.notifyBalanceChange(playerId, updated);
    return updated;
  }

  /**
   * Debit chips from available balance (e.g., withdrawal)
   */
  debit(playerId: PlayerId, amount: number): PlayerBalance {
    validatePositiveAmount(amount, 'debit');

    const current = this.getBalance(playerId);
    if (current.available < amount) {
      throw EconomyErrors.insufficientBalance(
        playerId,
        amount,
        current.available
      );
    }

    const updated: PlayerBalance = {
      ...current,
      available: current.available - amount,
      updatedAt: Date.now(),
    };

    this.balances.set(playerId, updated);
    this.notifyBalanceChange(playerId, updated);
    return updated;
  }

  /**
   * Lock chips for table play (move from available to locked)
   */
  lock(playerId: PlayerId, amount: number): PlayerBalance {
    validatePositiveAmount(amount, 'lock');

    const current = this.getBalance(playerId);
    if (current.available < amount) {
      throw EconomyErrors.insufficientBalance(
        playerId,
        amount,
        current.available
      );
    }

    const updated: PlayerBalance = {
      ...current,
      available: current.available - amount,
      locked: current.locked + amount,
      updatedAt: Date.now(),
    };

    this.balances.set(playerId, updated);
    this.notifyBalanceChange(playerId, updated);
    return updated;
  }

  /**
   * Unlock chips from table play (move from locked to available)
   */
  unlock(playerId: PlayerId, amount: number): PlayerBalance {
    validatePositiveAmount(amount, 'unlock');

    const current = this.getBalance(playerId);
    if (current.locked < amount) {
      throw EconomyErrors.invalidOperation(
        'unlock',
        `Cannot unlock ${amount} chips, only ${current.locked} locked`
      );
    }

    const updated: PlayerBalance = {
      ...current,
      available: current.available + amount,
      locked: current.locked - amount,
      updatedAt: Date.now(),
    };

    this.balances.set(playerId, updated);
    this.notifyBalanceChange(playerId, updated);
    return updated;
  }

  /**
   * Move chips to pending state (for deposits/withdrawals in progress)
   */
  moveToPending(playerId: PlayerId, amount: number): PlayerBalance {
    validatePositiveAmount(amount, 'moveToPending');

    const current = this.getBalance(playerId);
    if (current.available < amount) {
      throw EconomyErrors.insufficientBalance(
        playerId,
        amount,
        current.available
      );
    }

    const updated: PlayerBalance = {
      ...current,
      available: current.available - amount,
      pending: current.pending + amount,
      updatedAt: Date.now(),
    };

    this.balances.set(playerId, updated);
    this.notifyBalanceChange(playerId, updated);
    return updated;
  }

  /**
   * Complete pending transaction - remove from pending
   */
  completePending(playerId: PlayerId, amount: number): PlayerBalance {
    validatePositiveAmount(amount, 'completePending');

    const current = this.getBalance(playerId);
    if (current.pending < amount) {
      throw EconomyErrors.invalidOperation(
        'completePending',
        `Cannot complete pending ${amount} chips, only ${current.pending} pending`
      );
    }

    const updated: PlayerBalance = {
      ...current,
      pending: current.pending - amount,
      updatedAt: Date.now(),
    };

    this.balances.set(playerId, updated);
    this.notifyBalanceChange(playerId, updated);
    return updated;
  }

  /**
   * Cancel pending transaction - return to available
   */
  cancelPending(playerId: PlayerId, amount: number): PlayerBalance {
    validatePositiveAmount(amount, 'cancelPending');

    const current = this.getBalance(playerId);
    if (current.pending < amount) {
      throw EconomyErrors.invalidOperation(
        'cancelPending',
        `Cannot cancel pending ${amount} chips, only ${current.pending} pending`
      );
    }

    const updated: PlayerBalance = {
      ...current,
      available: current.available + amount,
      pending: current.pending - amount,
      updatedAt: Date.now(),
    };

    this.balances.set(playerId, updated);
    this.notifyBalanceChange(playerId, updated);
    return updated;
  }

  /**
   * Adjust locked balance directly (for pot wins/losses during play)
   * This is used by the escrow system after hand settlement
   */
  adjustLocked(playerId: PlayerId, delta: number): PlayerBalance {
    if (!Number.isInteger(delta)) {
      throw EconomyErrors.invalidAmount(delta, 'adjustLocked requires integer amounts');
    }

    const current = this.getBalance(playerId);
    const newLocked = current.locked + delta;

    if (newLocked < 0) {
      throw EconomyErrors.negativeBalance(playerId, newLocked);
    }

    const updated: PlayerBalance = {
      ...current,
      locked: newLocked,
      updatedAt: Date.now(),
    };

    this.balances.set(playerId, updated);
    this.notifyBalanceChange(playerId, updated);
    return updated;
  }

  /**
   * Transfer chips between players (available to available)
   */
  transfer(
    fromPlayerId: PlayerId,
    toPlayerId: PlayerId,
    amount: number
  ): BalanceTransfer {
    validatePositiveAmount(amount, 'transfer');

    // Debit from sender
    this.debit(fromPlayerId, amount);

    // Credit to receiver
    this.credit(toPlayerId, amount);

    return {
      fromPlayerId,
      toPlayerId,
      amount,
      transactionId: this.generateTransactionId(),
      timestamp: Date.now(),
    };
  }

  /**
   * Check if player can afford an amount
   */
  canAfford(playerId: PlayerId, amount: number): boolean {
    try {
      const balance = this.getBalance(playerId);
      return balance.available >= amount;
    } catch {
      return false;
    }
  }

  /**
   * Check if player has balance record
   */
  hasBalance(playerId: PlayerId): boolean {
    return this.balances.has(playerId);
  }

  /**
   * Remove balance record (only for cleanup)
   */
  removeBalance(playerId: PlayerId): void {
    const balance = this.getBalance(playerId);
    const total = balance.available + balance.locked + balance.pending;

    if (total > 0) {
      throw EconomyErrors.invalidOperation(
        'removeBalance',
        `Cannot remove balance with ${total} chips remaining`
      );
    }

    this.balances.delete(playerId);
  }

  /**
   * Get all balances
   */
  getAllBalances(): readonly PlayerBalance[] {
    return Array.from(this.balances.values());
  }

  /**
   * Get total chips in the system
   */
  getTotalChipsInSystem(): number {
    let total = 0;
    for (const balance of this.balances.values()) {
      total += balance.available + balance.locked + balance.pending;
    }
    return total;
  }

  /**
   * Clear all balances (for testing)
   */
  clear(): void {
    this.balances.clear();
  }

  /**
   * Notify balance change callback
   */
  private notifyBalanceChange(playerId: PlayerId, balance: PlayerBalance): void {
    if (this.onBalanceChange) {
      this.onBalanceChange(playerId, balance);
    }
  }

  /**
   * Generate unique transaction ID
   */
  private generateTransactionId(): TransactionId {
    return `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let balanceManagerInstance: BalanceManager | null = null;

export function getBalanceManager(): BalanceManager {
  if (!balanceManagerInstance) {
    balanceManagerInstance = new BalanceManager();
  }
  return balanceManagerInstance;
}

export function resetBalanceManager(): BalanceManager {
  balanceManagerInstance = new BalanceManager();
  return balanceManagerInstance;
}
