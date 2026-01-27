/**
 * EconomyErrors.ts
 * Phase 14 - Error types for the poker economy system
 *
 * Provides strongly-typed errors for all economy operations.
 */

import { PlayerId } from '../security/Identity';

// ============================================================================
// Error Codes
// ============================================================================

export enum EconomyErrorCode {
  // Balance errors
  INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE',
  NEGATIVE_BALANCE = 'NEGATIVE_BALANCE',
  BALANCE_NOT_FOUND = 'BALANCE_NOT_FOUND',
  BALANCE_ALREADY_EXISTS = 'BALANCE_ALREADY_EXISTS',
  INVALID_AMOUNT = 'INVALID_AMOUNT',

  // Escrow errors
  ESCROW_NOT_FOUND = 'ESCROW_NOT_FOUND',
  ESCROW_ALREADY_EXISTS = 'ESCROW_ALREADY_EXISTS',
  ESCROW_INSUFFICIENT = 'ESCROW_INSUFFICIENT',
  ESCROW_LOCKED = 'ESCROW_LOCKED',

  // Pot errors
  POT_NOT_FOUND = 'POT_NOT_FOUND',
  INVALID_POT_CONTRIBUTION = 'INVALID_POT_CONTRIBUTION',
  POT_ALREADY_SETTLED = 'POT_ALREADY_SETTLED',

  // Side pot errors
  INVALID_SIDE_POT = 'INVALID_SIDE_POT',
  SIDE_POT_CALCULATION_ERROR = 'SIDE_POT_CALCULATION_ERROR',

  // Rake errors
  INVALID_RAKE_CONFIG = 'INVALID_RAKE_CONFIG',
  RAKE_EXCEEDS_CAP = 'RAKE_EXCEEDS_CAP',

  // Ledger errors
  LEDGER_ENTRY_NOT_FOUND = 'LEDGER_ENTRY_NOT_FOUND',
  LEDGER_INTEGRITY_VIOLATION = 'LEDGER_INTEGRITY_VIOLATION',
  LEDGER_REPLAY_MISMATCH = 'LEDGER_REPLAY_MISMATCH',
  DUPLICATE_SETTLEMENT = 'DUPLICATE_SETTLEMENT',

  // Chip conservation errors
  CHIP_CONSERVATION_VIOLATION = 'CHIP_CONSERVATION_VIOLATION',

  // General errors
  INVALID_OPERATION = 'INVALID_OPERATION',
  OPERATION_NOT_PERMITTED = 'OPERATION_NOT_PERMITTED',
}

// ============================================================================
// Base Error Class
// ============================================================================

export class EconomyError extends Error {
  readonly code: EconomyErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    code: EconomyErrorCode,
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'EconomyError';
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, EconomyError.prototype);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}

// ============================================================================
// Specialized Error Classes
// ============================================================================

export class InsufficientBalanceError extends EconomyError {
  constructor(
    playerId: PlayerId,
    requested: number,
    available: number
  ) {
    super(
      EconomyErrorCode.INSUFFICIENT_BALANCE,
      `Player ${playerId} has insufficient balance: requested ${requested}, available ${available}`,
      { playerId, requested, available }
    );
    this.name = 'InsufficientBalanceError';
  }
}

export class NegativeBalanceError extends EconomyError {
  constructor(playerId: PlayerId, resultingBalance: number) {
    super(
      EconomyErrorCode.NEGATIVE_BALANCE,
      `Operation would result in negative balance for player ${playerId}: ${resultingBalance}`,
      { playerId, resultingBalance }
    );
    this.name = 'NegativeBalanceError';
  }
}

export class BalanceNotFoundError extends EconomyError {
  constructor(playerId: PlayerId) {
    super(
      EconomyErrorCode.BALANCE_NOT_FOUND,
      `Balance not found for player ${playerId}`,
      { playerId }
    );
    this.name = 'BalanceNotFoundError';
  }
}

export class InvalidAmountError extends EconomyError {
  constructor(amount: number, reason: string) {
    super(
      EconomyErrorCode.INVALID_AMOUNT,
      `Invalid amount ${amount}: ${reason}`,
      { amount, reason }
    );
    this.name = 'InvalidAmountError';
  }
}

export class EscrowNotFoundError extends EconomyError {
  constructor(playerId: PlayerId, tableId: string) {
    super(
      EconomyErrorCode.ESCROW_NOT_FOUND,
      `Escrow not found for player ${playerId} at table ${tableId}`,
      { playerId, tableId }
    );
    this.name = 'EscrowNotFoundError';
  }
}

export class EscrowInsufficientError extends EconomyError {
  constructor(
    playerId: PlayerId,
    tableId: string,
    requested: number,
    available: number
  ) {
    super(
      EconomyErrorCode.ESCROW_INSUFFICIENT,
      `Insufficient escrow for player ${playerId} at table ${tableId}: requested ${requested}, available ${available}`,
      { playerId, tableId, requested, available }
    );
    this.name = 'EscrowInsufficientError';
  }
}

export class PotAlreadySettledError extends EconomyError {
  constructor(handId: string) {
    super(
      EconomyErrorCode.POT_ALREADY_SETTLED,
      `Pot for hand ${handId} has already been settled`,
      { handId }
    );
    this.name = 'PotAlreadySettledError';
  }
}

export class DuplicateSettlementError extends EconomyError {
  constructor(handId: string, settlementId: string) {
    super(
      EconomyErrorCode.DUPLICATE_SETTLEMENT,
      `Settlement ${settlementId} for hand ${handId} has already been processed`,
      { handId, settlementId }
    );
    this.name = 'DuplicateSettlementError';
  }
}

export class LedgerIntegrityError extends EconomyError {
  constructor(
    entryId: string,
    expectedHash: string,
    actualHash: string
  ) {
    super(
      EconomyErrorCode.LEDGER_INTEGRITY_VIOLATION,
      `Ledger integrity violation at entry ${entryId}`,
      { entryId, expectedHash, actualHash }
    );
    this.name = 'LedgerIntegrityError';
  }
}

export class ChipConservationError extends EconomyError {
  constructor(
    handId: string,
    totalBefore: number,
    totalAfter: number,
    rakeCollected: number
  ) {
    const expected = totalBefore - rakeCollected;
    super(
      EconomyErrorCode.CHIP_CONSERVATION_VIOLATION,
      `Chip conservation violation for hand ${handId}: expected ${expected} chips after rake, got ${totalAfter}`,
      { handId, totalBefore, totalAfter, rakeCollected, expected }
    );
    this.name = 'ChipConservationError';
  }
}

export class InvalidRakeConfigError extends EconomyError {
  constructor(reason: string, config?: Record<string, unknown>) {
    super(
      EconomyErrorCode.INVALID_RAKE_CONFIG,
      `Invalid rake configuration: ${reason}`,
      { reason, config }
    );
    this.name = 'InvalidRakeConfigError';
  }
}

// ============================================================================
// Error Factory
// ============================================================================

export const EconomyErrors = {
  insufficientBalance: (
    playerId: PlayerId,
    requested: number,
    available: number
  ) => new InsufficientBalanceError(playerId, requested, available),

  negativeBalance: (playerId: PlayerId, resultingBalance: number) =>
    new NegativeBalanceError(playerId, resultingBalance),

  balanceNotFound: (playerId: PlayerId) =>
    new BalanceNotFoundError(playerId),

  invalidAmount: (amount: number, reason: string) =>
    new InvalidAmountError(amount, reason),

  escrowNotFound: (playerId: PlayerId, tableId: string) =>
    new EscrowNotFoundError(playerId, tableId),

  escrowInsufficient: (
    playerId: PlayerId,
    tableId: string,
    requested: number,
    available: number
  ) => new EscrowInsufficientError(playerId, tableId, requested, available),

  potAlreadySettled: (handId: string) =>
    new PotAlreadySettledError(handId),

  duplicateSettlement: (handId: string, settlementId: string) =>
    new DuplicateSettlementError(handId, settlementId),

  ledgerIntegrity: (
    entryId: string,
    expectedHash: string,
    actualHash: string
  ) => new LedgerIntegrityError(entryId, expectedHash, actualHash),

  chipConservation: (
    handId: string,
    totalBefore: number,
    totalAfter: number,
    rakeCollected: number
  ) => new ChipConservationError(handId, totalBefore, totalAfter, rakeCollected),

  invalidRakeConfig: (reason: string, config?: Record<string, unknown>) =>
    new InvalidRakeConfigError(reason, config),

  invalidOperation: (operation: string, reason: string) =>
    new EconomyError(
      EconomyErrorCode.INVALID_OPERATION,
      `Invalid operation '${operation}': ${reason}`,
      { operation, reason }
    ),

  operationNotPermitted: (operation: string, reason: string) =>
    new EconomyError(
      EconomyErrorCode.OPERATION_NOT_PERMITTED,
      `Operation '${operation}' not permitted: ${reason}`,
      { operation, reason }
    ),
};
