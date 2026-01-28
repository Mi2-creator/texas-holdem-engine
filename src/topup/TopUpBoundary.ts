/**
 * TopUpBoundary.ts
 * Phase 28 - External Top-Up Integration Boundary (Blueprint)
 *
 * THIS IS THE MOST IMPORTANT FILE IN THE TOP-UP MODULE.
 *
 * The TopUpBoundary enforces all invariants for external top-ups:
 * - Append-only (no updates or deletes)
 * - Idempotent by intentId (duplicates rejected)
 * - Strictly positive integer amounts
 * - PLAYER-only targets (never club/agent/platform)
 * - No top-ups during hand settlement or rake calculation
 * - No forbidden concepts (wallet, payment, crypto, etc.)
 *
 * HARD CONSTRAINTS:
 * - Pure validation (no side effects)
 * - Never throws (returns structured results)
 * - Compatible with existing ledger invariants
 * - Compatible with ExternalValueBoundary
 *
 * This boundary ensures that top-ups:
 * - Are NOT revenue (don't credit club/agent/platform)
 * - Are NOT rake (don't derive from hand settlement)
 * - Are NOT bonus (handled separately)
 * - Are safe for replay and audit
 */

import {
  TopUpIntentId,
  TopUpValidationResult,
  TopUpValidationError,
  TopUpErrorCode,
  validResult,
  invalidResult,
  createValidationError,
} from './TopUpTypes';
import { TopUpIntent } from './TopUpIntent';

// ============================================================================
// Forbidden Concepts
// ============================================================================

/**
 * Forbidden keywords in metadata keys/values
 * These indicate external value concepts that must never enter the system
 */
const FORBIDDEN_KEYWORDS = [
  // Currency concepts
  'currency',
  'dollar',
  'usd',
  'eur',
  'gbp',
  'money',
  'cash',

  // External account concepts
  'wallet',
  'account',
  'balance',
  'bank',
  'card',

  // Transfer concepts
  'payment',
  'pay',
  'deposit',
  'withdraw',
  'transfer',
  'send',
  'receive',

  // Crypto concepts
  'crypto',
  'blockchain',
  'bitcoin',
  'btc',
  'eth',
  'usdt',
  'usdc',
  'token',
  'coin',
  'web3',

  // External reference concepts
  'txhash',
  'blockhash',
  'address',
] as const;

/**
 * Forbidden metadata keys (exact match)
 */
const FORBIDDEN_METADATA_KEYS = [
  'currencyCode',
  'currencyType',
  'walletId',
  'walletAddress',
  'paymentId',
  'paymentStatus',
  'paymentMethod',
  'transactionId',
  'txHash',
  'blockHash',
  'accountNumber',
  'cardNumber',
  'bankAccount',
] as const;

// ============================================================================
// Top-Up Boundary Implementation
// ============================================================================

/**
 * External top-up boundary guard
 *
 * Validates all top-up intents before they can be recorded.
 * This is a pure validation layer with no side effects.
 */
export class TopUpBoundary {
  private readonly processedIntents: Set<TopUpIntentId>;
  private readonly strictMode: boolean;
  private activeSettlementTables: Set<string>;

  constructor(strictMode: boolean = true) {
    this.processedIntents = new Set();
    this.strictMode = strictMode;
    this.activeSettlementTables = new Set();
  }

  // ==========================================================================
  // Intent Validation
  // ==========================================================================

  /**
   * Validate a top-up intent
   *
   * Returns a structured result with all validation errors.
   * Never throws exceptions.
   */
  validateIntent(intent: TopUpIntent): TopUpValidationResult {
    const errors: TopUpValidationError[] = [];

    // 1. Check for required fields
    const requiredErrors = this.validateRequiredFields(intent);
    errors.push(...requiredErrors);

    // 2. Check intentId format
    const intentIdErrors = this.validateIntentId(intent.intentId);
    errors.push(...intentIdErrors);

    // 3. Check for duplicate
    const duplicateError = this.checkDuplicate(intent.intentId);
    if (duplicateError) {
      errors.push(duplicateError);
    }

    // 4. Validate amount
    const amountErrors = this.validateAmount(intent.amount);
    errors.push(...amountErrors);

    // 5. Validate target (must be PLAYER only)
    // This is implicit in the intent structure, but we enforce it here
    const targetErrors = this.validateTarget(intent);
    errors.push(...targetErrors);

    // 6. Check timing (not during settlement)
    const timingError = this.checkTiming(intent);
    if (timingError) {
      errors.push(timingError);
    }

    // 7. Validate metadata (no forbidden concepts)
    if (intent.metadata) {
      const metadataErrors = this.validateMetadata(intent.metadata);
      errors.push(...metadataErrors);
    }

    return errors.length === 0 ? validResult() : invalidResult(errors);
  }

  /**
   * Mark an intent as processed (for idempotency)
   */
  markProcessed(intentId: TopUpIntentId): void {
    this.processedIntents.add(intentId);
  }

  /**
   * Check if an intent has been processed
   */
  isProcessed(intentId: TopUpIntentId): boolean {
    return this.processedIntents.has(intentId);
  }

  // ==========================================================================
  // Settlement Timing Guards
  // ==========================================================================

  /**
   * Signal that a table is in active settlement
   * Top-ups to this table are blocked during settlement
   */
  beginSettlement(tableId: string): void {
    this.activeSettlementTables.add(tableId);
  }

  /**
   * Signal that settlement is complete for a table
   */
  endSettlement(tableId: string): void {
    this.activeSettlementTables.delete(tableId);
  }

  /**
   * Check if a table is in active settlement
   */
  isInSettlement(tableId: string): boolean {
    return this.activeSettlementTables.has(tableId);
  }

  // ==========================================================================
  // Validation Helpers
  // ==========================================================================

  private validateRequiredFields(intent: TopUpIntent): TopUpValidationError[] {
    const errors: TopUpValidationError[] = [];

    if (!intent.intentId) {
      errors.push(createValidationError(
        'MISSING_REQUIRED_FIELD',
        'intentId is required',
        'intentId'
      ));
    }

    if (!intent.playerId) {
      errors.push(createValidationError(
        'MISSING_REQUIRED_FIELD',
        'playerId is required',
        'playerId'
      ));
    }

    if (!intent.clubId) {
      errors.push(createValidationError(
        'MISSING_REQUIRED_FIELD',
        'clubId is required',
        'clubId'
      ));
    }

    if (intent.amount === undefined || intent.amount === null) {
      errors.push(createValidationError(
        'MISSING_REQUIRED_FIELD',
        'amount is required',
        'amount'
      ));
    }

    return errors;
  }

  private validateIntentId(intentId: TopUpIntentId): TopUpValidationError[] {
    const errors: TopUpValidationError[] = [];

    if (!intentId || typeof intentId !== 'string') {
      errors.push(createValidationError(
        'INVALID_INTENT_ID',
        'intentId must be a non-empty string',
        'intentId',
        intentId
      ));
      return errors;
    }

    if (intentId.length === 0) {
      errors.push(createValidationError(
        'INVALID_INTENT_ID',
        'intentId cannot be empty',
        'intentId',
        intentId
      ));
    }

    if (intentId.length > 256) {
      errors.push(createValidationError(
        'INVALID_INTENT_ID',
        'intentId exceeds maximum length of 256',
        'intentId',
        intentId.length
      ));
    }

    return errors;
  }

  private checkDuplicate(intentId: TopUpIntentId): TopUpValidationError | null {
    if (this.processedIntents.has(intentId)) {
      return createValidationError(
        'DUPLICATE_INTENT',
        `Intent ${intentId} has already been processed`,
        'intentId',
        intentId
      );
    }
    return null;
  }

  private validateAmount(amount: number): TopUpValidationError[] {
    const errors: TopUpValidationError[] = [];

    if (typeof amount !== 'number') {
      errors.push(createValidationError(
        'INVALID_AMOUNT',
        'amount must be a number',
        'amount',
        amount
      ));
      return errors;
    }

    if (!Number.isFinite(amount)) {
      errors.push(createValidationError(
        'INVALID_AMOUNT',
        'amount must be a finite number',
        'amount',
        amount
      ));
      return errors;
    }

    if (!Number.isInteger(amount)) {
      errors.push(createValidationError(
        'NON_INTEGER_AMOUNT',
        'amount must be an integer (chips, not fractional)',
        'amount',
        amount
      ));
    }

    if (amount <= 0) {
      errors.push(createValidationError(
        'NON_POSITIVE_AMOUNT',
        'amount must be strictly positive',
        'amount',
        amount
      ));
    }

    return errors;
  }

  private validateTarget(intent: TopUpIntent): TopUpValidationError[] {
    const errors: TopUpValidationError[] = [];

    // Top-ups can ONLY target players
    // The intent structure enforces this, but we add an explicit check
    if (!intent.playerId) {
      errors.push(createValidationError(
        'FORBIDDEN_TARGET',
        'Top-ups must target a player (playerId required)',
        'playerId'
      ));
    }

    return errors;
  }

  private checkTiming(intent: TopUpIntent): TopUpValidationError | null {
    // If tableId is provided, check if that table is in settlement
    if (intent.tableId && this.activeSettlementTables.has(intent.tableId)) {
      return createValidationError(
        'FORBIDDEN_TIMING',
        'Cannot process top-up during active hand settlement',
        'tableId',
        intent.tableId
      );
    }
    return null;
  }

  private validateMetadata(
    metadata: Readonly<Record<string, string>>
  ): TopUpValidationError[] {
    if (!this.strictMode) {
      return [];
    }

    const errors: TopUpValidationError[] = [];

    for (const [key, value] of Object.entries(metadata)) {
      // Check for forbidden keys (exact match)
      if (FORBIDDEN_METADATA_KEYS.includes(key as any)) {
        errors.push(createValidationError(
          'FORBIDDEN_METADATA',
          `Forbidden metadata key: ${key}`,
          `metadata.${key}`,
          key
        ));
      }

      // Check for forbidden keywords in key
      const lowerKey = key.toLowerCase();
      for (const keyword of FORBIDDEN_KEYWORDS) {
        if (lowerKey.includes(keyword)) {
          errors.push(createValidationError(
            'FORBIDDEN_METADATA',
            `Forbidden concept "${keyword}" in metadata key: ${key}`,
            `metadata.${key}`,
            key
          ));
          break; // Only report first match per key
        }
      }

      // Check for forbidden keywords in value
      if (typeof value === 'string') {
        const lowerValue = value.toLowerCase();
        for (const keyword of FORBIDDEN_KEYWORDS) {
          if (lowerValue.includes(keyword)) {
            errors.push(createValidationError(
              'FORBIDDEN_METADATA',
              `Forbidden concept "${keyword}" in metadata value`,
              `metadata.${key}`,
              value
            ));
            break; // Only report first match per value
          }
        }
      }
    }

    return errors;
  }

  // ==========================================================================
  // Boundary Statistics
  // ==========================================================================

  /**
   * Get statistics about processed intents
   */
  getStatistics(): {
    processedCount: number;
    activeSettlementCount: number;
    strictMode: boolean;
  } {
    return {
      processedCount: this.processedIntents.size,
      activeSettlementCount: this.activeSettlementTables.size,
      strictMode: this.strictMode,
    };
  }

  /**
   * Clear all state (for testing only)
   */
  clear(): void {
    this.processedIntents.clear();
    this.activeSettlementTables.clear();
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createTopUpBoundary(strictMode?: boolean): TopUpBoundary {
  return new TopUpBoundary(strictMode);
}

/**
 * Default boundary instance (strict mode)
 */
export const defaultTopUpBoundary = createTopUpBoundary(true);

/**
 * Convenience function for quick validation
 */
export function validateTopUpIntent(intent: TopUpIntent): TopUpValidationResult {
  return defaultTopUpBoundary.validateIntent(intent);
}
