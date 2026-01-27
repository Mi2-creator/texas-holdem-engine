/**
 * Escrow.ts
 * Phase 14 - Table escrow for chips in play
 *
 * Manages chips that are locked at a table during gameplay.
 * Coordinates with BalanceManager for lock/unlock operations.
 *
 * Key concepts:
 * - Buy-in: Transfer chips from balance to table escrow
 * - Cash-out: Transfer chips from table escrow back to balance
 * - Stack: Current chip stack at the table
 * - Committed: Chips committed to the current hand's pot
 */

import { PlayerId } from '../security/Identity';
import { TableId, HandId } from '../security/AuditLog';
import { BalanceManager, getBalanceManager } from './Balance';
import { EconomyErrors } from './EconomyErrors';

// ============================================================================
// Types
// ============================================================================

export interface TableEscrow {
  readonly tableId: TableId;
  readonly playerId: PlayerId;
  readonly stack: number;           // Current chip stack at table
  readonly committed: number;       // Chips committed to current hand
  readonly totalBuyIn: number;      // Total buy-in amount this session
  readonly totalCashOut: number;    // Total cash-out amount this session
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface EscrowSnapshot {
  readonly tableId: TableId;
  readonly playerId: PlayerId;
  readonly stack: number;
  readonly committed: number;
  readonly netResult: number;       // Total result (cash-out - buy-in)
  readonly timestamp: number;
}

export interface BuyInResult {
  readonly escrow: TableEscrow;
  readonly amountBought: number;
}

export interface CashOutResult {
  readonly amountCashedOut: number;
  readonly netResult: number;
}

// ============================================================================
// Validation
// ============================================================================

function validatePositiveAmount(amount: number, operation: string): void {
  if (!Number.isInteger(amount)) {
    throw EconomyErrors.invalidAmount(amount, `${operation} requires integer amounts`);
  }
  if (amount <= 0) {
    throw EconomyErrors.invalidAmount(amount, `${operation} requires positive amount`);
  }
}

// ============================================================================
// Escrow Manager
// ============================================================================

export class EscrowManager {
  private escrows: Map<string, TableEscrow>; // key: tableId:playerId
  private balanceManager: BalanceManager;

  constructor(balanceManager?: BalanceManager) {
    this.escrows = new Map();
    this.balanceManager = balanceManager ?? getBalanceManager();
  }

  /**
   * Generate escrow key
   */
  private getKey(tableId: TableId, playerId: PlayerId): string {
    return `${tableId}:${playerId}`;
  }

  /**
   * Buy-in: Transfer chips from balance to table escrow
   */
  buyIn(
    tableId: TableId,
    playerId: PlayerId,
    amount: number
  ): BuyInResult {
    validatePositiveAmount(amount, 'buyIn');

    // Lock chips in balance
    this.balanceManager.lock(playerId, amount);

    const key = this.getKey(tableId, playerId);
    const existing = this.escrows.get(key);
    const now = Date.now();

    let escrow: TableEscrow;

    if (existing) {
      // Add to existing escrow
      escrow = {
        ...existing,
        stack: existing.stack + amount,
        totalBuyIn: existing.totalBuyIn + amount,
        updatedAt: now,
      };
    } else {
      // Create new escrow
      escrow = {
        tableId,
        playerId,
        stack: amount,
        committed: 0,
        totalBuyIn: amount,
        totalCashOut: 0,
        createdAt: now,
        updatedAt: now,
      };
    }

    this.escrows.set(key, escrow);

    return {
      escrow,
      amountBought: amount,
    };
  }

  /**
   * Cash-out: Transfer chips from table escrow back to balance
   */
  cashOut(
    tableId: TableId,
    playerId: PlayerId,
    amount?: number  // If not specified, cash out entire stack
  ): CashOutResult {
    const key = this.getKey(tableId, playerId);
    const escrow = this.escrows.get(key);

    if (!escrow) {
      throw EconomyErrors.escrowNotFound(playerId, tableId);
    }

    const cashOutAmount = amount ?? escrow.stack;
    validatePositiveAmount(cashOutAmount, 'cashOut');

    if (cashOutAmount > escrow.stack) {
      throw EconomyErrors.escrowInsufficient(
        playerId,
        tableId,
        cashOutAmount,
        escrow.stack
      );
    }

    // Cannot cash out committed chips
    const availableForCashOut = escrow.stack - escrow.committed;
    if (cashOutAmount > availableForCashOut) {
      throw EconomyErrors.invalidOperation(
        'cashOut',
        `Cannot cash out ${cashOutAmount} chips, ${escrow.committed} are committed to current hand`
      );
    }

    // Unlock chips in balance
    this.balanceManager.unlock(playerId, cashOutAmount);

    const updatedEscrow: TableEscrow = {
      ...escrow,
      stack: escrow.stack - cashOutAmount,
      totalCashOut: escrow.totalCashOut + cashOutAmount,
      updatedAt: Date.now(),
    };

    if (updatedEscrow.stack === 0) {
      // Remove escrow if stack is empty
      this.escrows.delete(key);
    } else {
      this.escrows.set(key, updatedEscrow);
    }

    const netResult = updatedEscrow.totalCashOut - escrow.totalBuyIn;

    return {
      amountCashedOut: cashOutAmount,
      netResult,
    };
  }

  /**
   * Get escrow for player at table
   */
  getEscrow(tableId: TableId, playerId: PlayerId): TableEscrow | null {
    const key = this.getKey(tableId, playerId);
    return this.escrows.get(key) ?? null;
  }

  /**
   * Get escrow (throws if not found)
   */
  requireEscrow(tableId: TableId, playerId: PlayerId): TableEscrow {
    const escrow = this.getEscrow(tableId, playerId);
    if (!escrow) {
      throw EconomyErrors.escrowNotFound(playerId, tableId);
    }
    return escrow;
  }

  /**
   * Get player's current stack at table
   */
  getStack(tableId: TableId, playerId: PlayerId): number {
    const escrow = this.getEscrow(tableId, playerId);
    return escrow?.stack ?? 0;
  }

  /**
   * Get available stack (stack minus committed)
   */
  getAvailableStack(tableId: TableId, playerId: PlayerId): number {
    const escrow = this.getEscrow(tableId, playerId);
    if (!escrow) return 0;
    return escrow.stack - escrow.committed;
  }

  /**
   * Commit chips to current hand (for betting)
   */
  commitChips(
    tableId: TableId,
    playerId: PlayerId,
    amount: number
  ): TableEscrow {
    validatePositiveAmount(amount, 'commitChips');

    const escrow = this.requireEscrow(tableId, playerId);
    const availableStack = escrow.stack - escrow.committed;

    if (amount > availableStack) {
      throw EconomyErrors.escrowInsufficient(
        playerId,
        tableId,
        amount,
        availableStack
      );
    }

    const updated: TableEscrow = {
      ...escrow,
      committed: escrow.committed + amount,
      updatedAt: Date.now(),
    };

    this.escrows.set(this.getKey(tableId, playerId), updated);
    return updated;
  }

  /**
   * Release committed chips back to stack (when hand ends without pot contribution)
   */
  releaseCommitted(
    tableId: TableId,
    playerId: PlayerId,
    amount?: number  // If not specified, release all committed
  ): TableEscrow {
    const escrow = this.requireEscrow(tableId, playerId);
    const releaseAmount = amount ?? escrow.committed;

    if (releaseAmount > escrow.committed) {
      throw EconomyErrors.invalidOperation(
        'releaseCommitted',
        `Cannot release ${releaseAmount} chips, only ${escrow.committed} committed`
      );
    }

    const updated: TableEscrow = {
      ...escrow,
      committed: escrow.committed - releaseAmount,
      updatedAt: Date.now(),
    };

    this.escrows.set(this.getKey(tableId, playerId), updated);
    return updated;
  }

  /**
   * Move committed chips to pot (deduct from stack)
   */
  moveToPot(
    tableId: TableId,
    playerId: PlayerId,
    amount: number
  ): TableEscrow {
    validatePositiveAmount(amount, 'moveToPot');

    const escrow = this.requireEscrow(tableId, playerId);

    if (amount > escrow.committed) {
      throw EconomyErrors.invalidOperation(
        'moveToPot',
        `Cannot move ${amount} to pot, only ${escrow.committed} committed`
      );
    }

    const updated: TableEscrow = {
      ...escrow,
      stack: escrow.stack - amount,
      committed: escrow.committed - amount,
      updatedAt: Date.now(),
    };

    this.escrows.set(this.getKey(tableId, playerId), updated);

    // Also adjust the locked balance
    this.balanceManager.adjustLocked(playerId, -amount);

    return updated;
  }

  /**
   * Award pot to winner(s)
   */
  awardPot(
    tableId: TableId,
    playerId: PlayerId,
    amount: number
  ): TableEscrow {
    validatePositiveAmount(amount, 'awardPot');

    const key = this.getKey(tableId, playerId);
    let escrow = this.escrows.get(key);

    if (!escrow) {
      // Player may have busted - create escrow for winnings
      const now = Date.now();
      escrow = {
        tableId,
        playerId,
        stack: 0,
        committed: 0,
        totalBuyIn: 0,
        totalCashOut: 0,
        createdAt: now,
        updatedAt: now,
      };
    }

    const updated: TableEscrow = {
      ...escrow,
      stack: escrow.stack + amount,
      updatedAt: Date.now(),
    };

    this.escrows.set(key, updated);

    // Also adjust the locked balance
    this.balanceManager.adjustLocked(playerId, amount);

    return updated;
  }

  /**
   * Get snapshot of escrow state
   */
  getSnapshot(tableId: TableId, playerId: PlayerId): EscrowSnapshot | null {
    const escrow = this.getEscrow(tableId, playerId);
    if (!escrow) return null;

    return {
      tableId: escrow.tableId,
      playerId: escrow.playerId,
      stack: escrow.stack,
      committed: escrow.committed,
      netResult: escrow.totalCashOut + escrow.stack - escrow.totalBuyIn,
      timestamp: Date.now(),
    };
  }

  /**
   * Get all escrows at a table
   */
  getTableEscrows(tableId: TableId): readonly TableEscrow[] {
    const escrows: TableEscrow[] = [];
    for (const [key, escrow] of this.escrows) {
      if (key.startsWith(`${tableId}:`)) {
        escrows.push(escrow);
      }
    }
    return escrows;
  }

  /**
   * Get all escrows for a player
   */
  getPlayerEscrows(playerId: PlayerId): readonly TableEscrow[] {
    const escrows: TableEscrow[] = [];
    for (const [key, escrow] of this.escrows) {
      if (key.endsWith(`:${playerId}`)) {
        escrows.push(escrow);
      }
    }
    return escrows;
  }

  /**
   * Get total chips at a table
   */
  getTableTotal(tableId: TableId): number {
    let total = 0;
    for (const escrow of this.getTableEscrows(tableId)) {
      total += escrow.stack;
    }
    return total;
  }

  /**
   * Force cash-out all players at a table (for table closing)
   */
  closeTable(tableId: TableId): Map<PlayerId, number> {
    const results = new Map<PlayerId, number>();
    const escrows = this.getTableEscrows(tableId);

    for (const escrow of escrows) {
      if (escrow.stack > 0) {
        // Release any committed chips first
        if (escrow.committed > 0) {
          this.releaseCommitted(tableId, escrow.playerId);
        }
        // Cash out remaining stack
        const result = this.cashOut(tableId, escrow.playerId);
        results.set(escrow.playerId, result.amountCashedOut);
      }
    }

    return results;
  }

  /**
   * Reset committed chips for all players at table (after hand ends)
   */
  resetCommitted(tableId: TableId): void {
    for (const escrow of this.getTableEscrows(tableId)) {
      if (escrow.committed > 0) {
        this.releaseCommitted(tableId, escrow.playerId);
      }
    }
  }

  /**
   * Check if player has escrow at table
   */
  hasEscrow(tableId: TableId, playerId: PlayerId): boolean {
    return this.escrows.has(this.getKey(tableId, playerId));
  }

  /**
   * Clear all escrows (for testing)
   */
  clear(): void {
    this.escrows.clear();
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let escrowManagerInstance: EscrowManager | null = null;

export function getEscrowManager(): EscrowManager {
  if (!escrowManagerInstance) {
    escrowManagerInstance = new EscrowManager();
  }
  return escrowManagerInstance;
}

export function resetEscrowManager(balanceManager?: BalanceManager): EscrowManager {
  escrowManagerInstance = new EscrowManager(balanceManager);
  return escrowManagerInstance;
}
