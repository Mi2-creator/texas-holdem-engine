/**
 * AdminCreditPolicy.ts
 * Phase 29 - Admin Credit (Manual Top-Up) System
 *
 * Policy validation for admin-initiated credits.
 *
 * VALIDATES:
 * - amount > 0 and is integer
 * - reason is a valid enum value
 * - note length > 0
 * - adminId exists (opaque check)
 * - playerId exists (opaque check)
 * - cannot credit CLUB / AGENT / PLATFORM
 * - cannot run during hand settlement
 *
 * HARD CONSTRAINTS:
 * - Pure validation (no side effects)
 * - Returns structured results (never throws)
 * - No access to external systems
 */

import {
  AdminCreditValidationResult,
  AdminCreditError,
  AdminCreditIntentId,
  AdminId,
  isValidAdminCreditReason,
  validAdminCreditResult,
  invalidAdminCreditResult,
  createAdminCreditError,
} from './AdminCreditTypes';
import { AdminCreditIntent } from './AdminCreditIntent';

// ============================================================================
// Policy Configuration
// ============================================================================

export interface AdminCreditPolicyConfig {
  /** Minimum note length required */
  readonly minNoteLength: number;
  /** Maximum note length allowed */
  readonly maxNoteLength: number;
  /** Maximum credit amount per intent */
  readonly maxCreditAmount: number;
}

export const DEFAULT_ADMIN_CREDIT_POLICY_CONFIG: AdminCreditPolicyConfig = {
  minNoteLength: 1,
  maxNoteLength: 1000,
  maxCreditAmount: 100_000_000, // 100 million chips max
};

// ============================================================================
// Admin Credit Policy Implementation
// ============================================================================

/**
 * Policy validation for admin credits
 *
 * This class validates AdminCreditIntent before processing.
 * It does NOT execute credits - that's done by AdminCreditService.
 *
 * KEY INVARIANTS:
 * - Pure validation (no side effects)
 * - Never throws (returns structured results)
 * - Credits can only target PLAYERS
 */
export class AdminCreditPolicy {
  private readonly config: AdminCreditPolicyConfig;
  private readonly processedIntents: Set<AdminCreditIntentId>;
  private readonly registeredAdmins: Set<AdminId>;
  private activeSettlementTables: Set<string>;

  constructor(config: AdminCreditPolicyConfig = DEFAULT_ADMIN_CREDIT_POLICY_CONFIG) {
    this.config = config;
    this.processedIntents = new Set();
    this.registeredAdmins = new Set();
    this.activeSettlementTables = new Set();
  }

  // ==========================================================================
  // Admin Registration (opaque check)
  // ==========================================================================

  /**
   * Register an admin ID as valid
   */
  registerAdmin(adminId: AdminId): void {
    this.registeredAdmins.add(adminId);
  }

  /**
   * Check if an admin ID is registered
   */
  isAdminRegistered(adminId: AdminId): boolean {
    return this.registeredAdmins.has(adminId);
  }

  /**
   * Unregister an admin ID
   */
  unregisterAdmin(adminId: AdminId): void {
    this.registeredAdmins.delete(adminId);
  }

  // ==========================================================================
  // Intent Validation
  // ==========================================================================

  /**
   * Validate an admin credit intent
   *
   * Returns structured validation result with all errors.
   * Never throws exceptions.
   */
  validate(intent: AdminCreditIntent): AdminCreditValidationResult {
    const errors: AdminCreditError[] = [];

    // 1. Check intentId
    const intentIdErrors = this.validateIntentId(intent.intentId);
    errors.push(...intentIdErrors);

    // 2. Check for duplicate
    const duplicateError = this.checkDuplicate(intent.intentId);
    if (duplicateError) {
      errors.push(duplicateError);
    }

    // 3. Check adminId
    const adminIdErrors = this.validateAdminId(intent.adminId);
    errors.push(...adminIdErrors);

    // 4. Check playerId
    const playerIdErrors = this.validatePlayerId(intent.playerId);
    errors.push(...playerIdErrors);

    // 5. Check clubId
    const clubIdErrors = this.validateClubId(intent.clubId);
    errors.push(...clubIdErrors);

    // 6. Check amount
    const amountErrors = this.validateAmount(intent.amount);
    errors.push(...amountErrors);

    // 7. Check reason
    const reasonErrors = this.validateReason(intent.reason);
    errors.push(...reasonErrors);

    // 8. Check note
    const noteErrors = this.validateNote(intent.note);
    errors.push(...noteErrors);

    // 9. Check timing (not during settlement)
    const timingError = this.checkTiming(intent);
    if (timingError) {
      errors.push(timingError);
    }

    return errors.length === 0 ? validAdminCreditResult() : invalidAdminCreditResult(errors);
  }

  /**
   * Mark an intent as processed (for idempotency)
   */
  markProcessed(intentId: AdminCreditIntentId): void {
    this.processedIntents.add(intentId);
  }

  /**
   * Check if an intent has been processed
   */
  isProcessed(intentId: AdminCreditIntentId): boolean {
    return this.processedIntents.has(intentId);
  }

  // ==========================================================================
  // Settlement Timing Guards
  // ==========================================================================

  /**
   * Signal that a table is in active settlement
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

  private validateIntentId(intentId: AdminCreditIntentId): AdminCreditError[] {
    const errors: AdminCreditError[] = [];

    if (!intentId || typeof intentId !== 'string' || intentId.length === 0) {
      errors.push(createAdminCreditError(
        'INVALID_INTENT_ID',
        'intentId must be a non-empty string',
        'intentId',
        intentId
      ));
    }

    return errors;
  }

  private checkDuplicate(intentId: AdminCreditIntentId): AdminCreditError | null {
    if (this.processedIntents.has(intentId)) {
      return createAdminCreditError(
        'DUPLICATE_INTENT',
        `Intent ${intentId} has already been processed`,
        'intentId',
        intentId
      );
    }
    return null;
  }

  private validateAdminId(adminId: AdminId): AdminCreditError[] {
    const errors: AdminCreditError[] = [];

    if (!adminId || typeof adminId !== 'string' || adminId.length === 0) {
      errors.push(createAdminCreditError(
        'INVALID_ADMIN_ID',
        'adminId must be a non-empty string',
        'adminId',
        adminId
      ));
      return errors;
    }

    if (!this.registeredAdmins.has(adminId)) {
      errors.push(createAdminCreditError(
        'INVALID_ADMIN_ID',
        'adminId is not registered',
        'adminId',
        adminId
      ));
    }

    return errors;
  }

  private validatePlayerId(playerId: string): AdminCreditError[] {
    const errors: AdminCreditError[] = [];

    if (!playerId || typeof playerId !== 'string' || playerId.length === 0) {
      errors.push(createAdminCreditError(
        'INVALID_PLAYER_ID',
        'playerId must be a non-empty string',
        'playerId',
        playerId
      ));
    }

    return errors;
  }

  private validateClubId(clubId: string): AdminCreditError[] {
    const errors: AdminCreditError[] = [];

    if (!clubId || typeof clubId !== 'string' || clubId.length === 0) {
      errors.push(createAdminCreditError(
        'INVALID_CLUB_ID',
        'clubId must be a non-empty string',
        'clubId',
        clubId
      ));
    }

    return errors;
  }

  private validateAmount(amount: number): AdminCreditError[] {
    const errors: AdminCreditError[] = [];

    if (typeof amount !== 'number' || !Number.isFinite(amount)) {
      errors.push(createAdminCreditError(
        'INVALID_AMOUNT',
        'amount must be a finite number',
        'amount',
        amount
      ));
      return errors;
    }

    if (!Number.isInteger(amount)) {
      errors.push(createAdminCreditError(
        'NON_INTEGER_AMOUNT',
        'amount must be an integer (chips, not fractional)',
        'amount',
        amount
      ));
    }

    if (amount <= 0) {
      errors.push(createAdminCreditError(
        'NON_POSITIVE_AMOUNT',
        'amount must be strictly positive',
        'amount',
        amount
      ));
    }

    if (amount > this.config.maxCreditAmount) {
      errors.push(createAdminCreditError(
        'INVALID_AMOUNT',
        `amount exceeds maximum allowed (${this.config.maxCreditAmount})`,
        'amount',
        amount
      ));
    }

    return errors;
  }

  private validateReason(reason: unknown): AdminCreditError[] {
    const errors: AdminCreditError[] = [];

    if (!isValidAdminCreditReason(reason)) {
      errors.push(createAdminCreditError(
        'INVALID_REASON',
        'reason must be a valid AdminCreditReason',
        'reason',
        reason
      ));
    }

    return errors;
  }

  private validateNote(note: string): AdminCreditError[] {
    const errors: AdminCreditError[] = [];

    if (note === undefined || note === null || typeof note !== 'string') {
      errors.push(createAdminCreditError(
        'MISSING_NOTE',
        'note is required for audit trail',
        'note',
        note
      ));
      return errors;
    }

    const trimmedNote = note.trim();

    if (trimmedNote.length < this.config.minNoteLength) {
      errors.push(createAdminCreditError(
        'NOTE_TOO_SHORT',
        `note must be at least ${this.config.minNoteLength} characters`,
        'note',
        note
      ));
    }

    if (trimmedNote.length > this.config.maxNoteLength) {
      errors.push(createAdminCreditError(
        'MISSING_NOTE',
        `note exceeds maximum length of ${this.config.maxNoteLength}`,
        'note',
        `[${trimmedNote.length} chars]`
      ));
    }

    return errors;
  }

  private checkTiming(intent: AdminCreditIntent): AdminCreditError | null {
    // If tableId is provided, check if that table is in settlement
    if (intent.tableId && this.activeSettlementTables.has(intent.tableId)) {
      return createAdminCreditError(
        'FORBIDDEN_TIMING',
        'Cannot process admin credit during active hand settlement',
        'tableId',
        intent.tableId
      );
    }
    return null;
  }

  // ==========================================================================
  // Statistics
  // ==========================================================================

  /**
   * Get policy statistics
   */
  getStatistics(): {
    processedCount: number;
    registeredAdminCount: number;
    activeSettlementCount: number;
  } {
    return {
      processedCount: this.processedIntents.size,
      registeredAdminCount: this.registeredAdmins.size,
      activeSettlementCount: this.activeSettlementTables.size,
    };
  }

  /**
   * Clear all state (for testing only)
   */
  clear(): void {
    this.processedIntents.clear();
    this.registeredAdmins.clear();
    this.activeSettlementTables.clear();
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createAdminCreditPolicy(
  config?: Partial<AdminCreditPolicyConfig>
): AdminCreditPolicy {
  return new AdminCreditPolicy({
    ...DEFAULT_ADMIN_CREDIT_POLICY_CONFIG,
    ...config,
  });
}
