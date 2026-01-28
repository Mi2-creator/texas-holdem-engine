/**
 * ExternalValueBoundary.ts
 * Phase 25.1 - External value black-box boundary guards
 *
 * This module defines the boundary between the internal ledger system
 * and any external value concepts. It ensures that:
 *
 * 1. No payment/wallet/transfer concepts leak into the ledger
 * 2. All external value inputs are validated before entering
 * 3. External outputs maintain ledger isolation
 * 4. The ledger remains a pure attribution system
 *
 * FORBIDDEN CONCEPTS (must never enter the ledger):
 * - Payments, deposits, withdrawals
 * - Wallets, balances (in the payment sense)
 * - Currency exchange, conversion rates
 * - Blockchain, USDT, crypto
 * - External account references
 *
 * Design principles:
 * - Pure validation (no side effects)
 * - Fail fast with structured errors
 * - Clear separation of concerns
 */

import {
  LedgerEntryInput,
  SettlementAttribution,
  TimeFeeAttribution,
  AttributionSource,
} from '../LedgerTypes';

// ============================================================================
// Boundary Violation Types
// ============================================================================

/**
 * Types of boundary violations
 */
export type BoundaryViolationType =
  | 'FORBIDDEN_CONCEPT'
  | 'INVALID_SOURCE'
  | 'EXTERNAL_REFERENCE'
  | 'NON_INTEGER_VALUE'
  | 'MISSING_STATE_VERSION'
  | 'SUSPICIOUS_METADATA';

/**
 * Structured boundary violation
 */
export interface BoundaryViolation {
  readonly type: BoundaryViolationType;
  readonly message: string;
  readonly field?: string;
  readonly value?: unknown;
  readonly suggestion?: string;
}

/**
 * Result of boundary validation
 */
export interface BoundaryValidationResult {
  readonly isValid: boolean;
  readonly violations: readonly BoundaryViolation[];
}

// ============================================================================
// Forbidden Concept Detection
// ============================================================================

/**
 * List of forbidden keywords that indicate external value concepts
 */
const FORBIDDEN_KEYWORDS = [
  // Payment concepts
  'payment', 'pay', 'payout',
  'deposit', 'withdraw', 'withdrawal',
  'transfer', 'send', 'receive',

  // Wallet concepts
  'wallet', 'balance', 'account',
  'bank', 'card', 'credit',

  // Currency concepts
  'currency', 'exchange', 'rate',
  'conversion', 'convert', 'forex',

  // Crypto concepts
  'crypto', 'blockchain', 'chain',
  'usdt', 'usdc', 'bitcoin', 'btc', 'eth',
  'token', 'coin', 'nft',
  'web3', 'defi', 'swap',

  // External system concepts
  'gateway', 'processor', 'merchant',
  'stripe', 'paypal', 'venmo',
] as const;

/**
 * List of forbidden field names in metadata
 */
const FORBIDDEN_METADATA_FIELDS = [
  'paymentId',
  'transactionId',
  'walletAddress',
  'accountNumber',
  'cardNumber',
  'bankAccount',
  'cryptoAddress',
  'blockchainTx',
  'externalRef',
  'externalId',
] as const;

// ============================================================================
// Boundary Guard Implementation
// ============================================================================

/**
 * External value boundary guard
 *
 * Validates inputs to ensure no external value concepts enter the ledger.
 * This is a pure validation layer with no side effects.
 */
export class ExternalValueBoundary {
  private readonly strictMode: boolean;

  constructor(strictMode: boolean = true) {
    this.strictMode = strictMode;
  }

  // ==========================================================================
  // Entry Validation
  // ==========================================================================

  /**
   * Validate a ledger entry input
   */
  validateEntryInput(input: LedgerEntryInput): BoundaryValidationResult {
    const violations: BoundaryViolation[] = [];

    // Check for forbidden concepts in description
    const descriptionViolations = this.checkForForbiddenConcepts(
      input.description,
      'description'
    );
    violations.push(...descriptionViolations);

    // Check for non-integer delta
    if (!Number.isInteger(input.delta)) {
      violations.push({
        type: 'NON_INTEGER_VALUE',
        message: 'Delta must be an integer',
        field: 'delta',
        value: input.delta,
        suggestion: 'Use integer values for all deltas',
      });
    }

    // Check metadata for forbidden fields
    if (input.metadata) {
      const metadataViolations = this.checkMetadata(input.metadata);
      violations.push(...metadataViolations);
    }

    // Check source is valid internal source
    const sourceViolation = this.checkSource(input.source);
    if (sourceViolation) {
      violations.push(sourceViolation);
    }

    return {
      isValid: violations.length === 0,
      violations,
    };
  }

  /**
   * Validate a settlement attribution
   */
  validateSettlementAttribution(
    attribution: SettlementAttribution
  ): BoundaryValidationResult {
    const violations: BoundaryViolation[] = [];

    // Validate pot winners
    for (let i = 0; i < attribution.potWinners.length; i++) {
      const winner = attribution.potWinners[i];

      if (!Number.isInteger(winner.amount)) {
        violations.push({
          type: 'NON_INTEGER_VALUE',
          message: `Pot winner amount must be an integer`,
          field: `potWinners[${i}].amount`,
          value: winner.amount,
        });
      }

      if (winner.amount < 0) {
        violations.push({
          type: 'FORBIDDEN_CONCEPT',
          message: 'Pot win amounts cannot be negative',
          field: `potWinners[${i}].amount`,
          value: winner.amount,
        });
      }

      // Check potType for forbidden concepts
      const potTypeViolations = this.checkForForbiddenConcepts(
        winner.potType,
        `potWinners[${i}].potType`
      );
      violations.push(...potTypeViolations);
    }

    // Validate rake
    if (!Number.isInteger(attribution.rakeTotal)) {
      violations.push({
        type: 'NON_INTEGER_VALUE',
        message: 'Rake total must be an integer',
        field: 'rakeTotal',
        value: attribution.rakeTotal,
      });
    }

    if (attribution.rakeTotal < 0) {
      violations.push({
        type: 'FORBIDDEN_CONCEPT',
        message: 'Rake cannot be negative',
        field: 'rakeTotal',
        value: attribution.rakeTotal,
      });
    }

    // Validate rake breakdown
    if (attribution.rakeBreakdown) {
      const breakdown = attribution.rakeBreakdown;

      if (!Number.isInteger(breakdown.clubShare)) {
        violations.push({
          type: 'NON_INTEGER_VALUE',
          message: 'Club share must be an integer',
          field: 'rakeBreakdown.clubShare',
          value: breakdown.clubShare,
        });
      }

      if (!Number.isInteger(breakdown.platformShare)) {
        violations.push({
          type: 'NON_INTEGER_VALUE',
          message: 'Platform share must be an integer',
          field: 'rakeBreakdown.platformShare',
          value: breakdown.platformShare,
        });
      }

      if (breakdown.agentShare !== undefined && !Number.isInteger(breakdown.agentShare)) {
        violations.push({
          type: 'NON_INTEGER_VALUE',
          message: 'Agent share must be an integer',
          field: 'rakeBreakdown.agentShare',
          value: breakdown.agentShare,
        });
      }

      // Check that breakdown sums to total
      const sum = breakdown.clubShare +
        breakdown.platformShare +
        (breakdown.agentShare ?? 0);

      if (sum !== attribution.rakeTotal && this.strictMode) {
        violations.push({
          type: 'FORBIDDEN_CONCEPT',
          message: 'Rake breakdown does not sum to rake total (value created/destroyed)',
          field: 'rakeBreakdown',
          value: { sum, total: attribution.rakeTotal },
          suggestion: 'Ensure breakdown components sum to rakeTotal',
        });
      }
    }

    // Validate uncalled returns
    if (attribution.uncalledReturns) {
      for (let i = 0; i < attribution.uncalledReturns.length; i++) {
        const returned = attribution.uncalledReturns[i];

        if (!Number.isInteger(returned.amount)) {
          violations.push({
            type: 'NON_INTEGER_VALUE',
            message: 'Uncalled return amount must be an integer',
            field: `uncalledReturns[${i}].amount`,
            value: returned.amount,
          });
        }

        if (returned.amount < 0) {
          violations.push({
            type: 'FORBIDDEN_CONCEPT',
            message: 'Uncalled return cannot be negative',
            field: `uncalledReturns[${i}].amount`,
            value: returned.amount,
          });
        }
      }
    }

    return {
      isValid: violations.length === 0,
      violations,
    };
  }

  /**
   * Validate a time fee attribution
   */
  validateTimeFeeAttribution(
    attribution: TimeFeeAttribution
  ): BoundaryValidationResult {
    const violations: BoundaryViolation[] = [];

    if (!Number.isInteger(attribution.feeAmount)) {
      violations.push({
        type: 'NON_INTEGER_VALUE',
        message: 'Fee amount must be an integer',
        field: 'feeAmount',
        value: attribution.feeAmount,
      });
    }

    if (attribution.feeAmount < 0) {
      violations.push({
        type: 'FORBIDDEN_CONCEPT',
        message: 'Fee amount cannot be negative',
        field: 'feeAmount',
        value: attribution.feeAmount,
      });
    }

    if (!Number.isInteger(attribution.periodMinutes) || attribution.periodMinutes <= 0) {
      violations.push({
        type: 'NON_INTEGER_VALUE',
        message: 'Period minutes must be a positive integer',
        field: 'periodMinutes',
        value: attribution.periodMinutes,
      });
    }

    return {
      isValid: violations.length === 0,
      violations,
    };
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  /**
   * Check a string for forbidden concepts
   */
  private checkForForbiddenConcepts(
    value: string,
    field: string
  ): BoundaryViolation[] {
    if (!this.strictMode) {
      return [];
    }

    const violations: BoundaryViolation[] = [];
    const lowerValue = value.toLowerCase();

    for (const keyword of FORBIDDEN_KEYWORDS) {
      if (lowerValue.includes(keyword)) {
        violations.push({
          type: 'FORBIDDEN_CONCEPT',
          message: `Forbidden concept "${keyword}" detected in ${field}`,
          field,
          value,
          suggestion: `Remove or replace "${keyword}" - the ledger is for attribution only, not external value transfer`,
        });
      }
    }

    return violations;
  }

  /**
   * Check metadata for forbidden fields
   */
  private checkMetadata(
    metadata: Readonly<Record<string, unknown>>
  ): BoundaryViolation[] {
    const violations: BoundaryViolation[] = [];

    for (const forbiddenField of FORBIDDEN_METADATA_FIELDS) {
      if (forbiddenField in metadata) {
        violations.push({
          type: 'FORBIDDEN_CONCEPT',
          message: `Forbidden metadata field "${forbiddenField}" detected`,
          field: `metadata.${forbiddenField}`,
          value: metadata[forbiddenField],
          suggestion: 'Remove external reference fields from metadata',
        });
      }
    }

    // Check all metadata values for forbidden concepts
    for (const [key, value] of Object.entries(metadata)) {
      if (typeof value === 'string') {
        const valueViolations = this.checkForForbiddenConcepts(
          value,
          `metadata.${key}`
        );
        violations.push(...valueViolations);
      }
    }

    return violations;
  }

  /**
   * Check that source is a valid internal source
   */
  private checkSource(source: AttributionSource): BoundaryViolation | null {
    const validSources: AttributionSource[] = [
      'HAND_SETTLEMENT',
      'TIME_FEE',
      'TOURNAMENT_PAYOUT',
      'REBUY',
      'ADJUSTMENT',
      'BONUS',
      'TOP_UP',
    ];

    if (!validSources.includes(source)) {
      return {
        type: 'INVALID_SOURCE',
        message: `Invalid attribution source: ${source}`,
        field: 'source',
        value: source,
        suggestion: `Use one of: ${validSources.join(', ')}`,
      };
    }

    return null;
  }

  // ==========================================================================
  // Batch Validation
  // ==========================================================================

  /**
   * Validate a batch of entry inputs
   */
  validateBatch(inputs: readonly LedgerEntryInput[]): BoundaryValidationResult {
    const allViolations: BoundaryViolation[] = [];

    for (let i = 0; i < inputs.length; i++) {
      const result = this.validateEntryInput(inputs[i]);
      for (const violation of result.violations) {
        allViolations.push({
          ...violation,
          field: `[${i}].${violation.field}`,
        });
      }
    }

    return {
      isValid: allViolations.length === 0,
      violations: allViolations,
    };
  }

  // ==========================================================================
  // Output Sanitization
  // ==========================================================================

  /**
   * Sanitize ledger data for external export
   *
   * Ensures no internal implementation details leak out.
   */
  sanitizeForExport<T extends object>(data: T): T {
    // Deep clone to avoid mutation
    const sanitized = JSON.parse(JSON.stringify(data));

    // Remove any internal fields that shouldn't be exported
    this.removeInternalFields(sanitized);

    return sanitized;
  }

  /**
   * Remove internal implementation fields
   */
  private removeInternalFields(obj: unknown): void {
    if (typeof obj !== 'object' || obj === null) {
      return;
    }

    if (Array.isArray(obj)) {
      for (const item of obj) {
        this.removeInternalFields(item);
      }
      return;
    }

    // Remove internal fields
    const internalFields = ['_internal', '_debug', '_raw'];
    for (const field of internalFields) {
      if (field in obj) {
        delete (obj as Record<string, unknown>)[field];
      }
    }

    // Recursively clean nested objects
    for (const value of Object.values(obj)) {
      this.removeInternalFields(value);
    }
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createExternalValueBoundary(
  strictMode?: boolean
): ExternalValueBoundary {
  return new ExternalValueBoundary(strictMode);
}

/**
 * Default boundary instance (strict mode)
 */
export const defaultBoundary = createExternalValueBoundary(true);

/**
 * Convenience function for quick validation
 */
export function validateAtBoundary(
  input: LedgerEntryInput
): BoundaryValidationResult {
  return defaultBoundary.validateEntryInput(input);
}

/**
 * Convenience function for settlement validation
 */
export function validateSettlementAtBoundary(
  attribution: SettlementAttribution
): BoundaryValidationResult {
  return defaultBoundary.validateSettlementAttribution(attribution);
}
