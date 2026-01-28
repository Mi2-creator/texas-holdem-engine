/**
 * TopUpRecorder.ts
 * Phase 28 - External Top-Up Integration Boundary (Blueprint)
 *
 * Records validated top-up intents to the ledger.
 *
 * MINIMAL RESPONSIBILITY:
 * - Accept a validated TopUpIntent
 * - Transform to LedgerEntry with:
 *   - attributionParty = PLAYER
 *   - source = TOP_UP
 *   - delta = +amount
 * - Delegate persistence to existing ValueLedger
 *
 * HARD CONSTRAINTS:
 * - No calculations
 * - No retries
 * - No external calls
 * - No mutations to existing logic
 *
 * The recorder ONLY records validated intents - it does not
 * perform validation itself. Validation is done by TopUpBoundary.
 */

import { StateVersion } from '../sync/SyncTypes';
import {
  LedgerEntry,
  LedgerEntryInput,
  createPlayerParty,
} from '../ledger/LedgerTypes';
import { ValueLedger } from '../ledger/LedgerEntry';
import { TopUpIntent } from './TopUpIntent';
import { TopUpBoundary } from './TopUpBoundary';
import {
  TopUpRecordResult,
  TopUpIntentId,
  successResult,
  failResult,
  duplicateResult,
} from './TopUpTypes';

// ============================================================================
// Configuration
// ============================================================================

export interface TopUpRecorderConfig {
  readonly stateVersion: StateVersion;
}

// ============================================================================
// Top-Up Recorder Implementation
// ============================================================================

/**
 * Records validated top-up intents to the ledger
 *
 * This recorder transforms top-up intents into ledger entries.
 * It does NOT perform any calculations - it only records.
 *
 * KEY INVARIANTS:
 * - Only records validated intents
 * - Delegates to existing ValueLedger
 * - Marks intents as processed in boundary
 * - Top-ups are PLAYER-attributed only
 */
export class TopUpRecorder {
  private readonly ledger: ValueLedger;
  private readonly boundary: TopUpBoundary;
  private readonly stateVersion: StateVersion;

  constructor(
    ledger: ValueLedger,
    boundary: TopUpBoundary,
    config: TopUpRecorderConfig
  ) {
    this.ledger = ledger;
    this.boundary = boundary;
    this.stateVersion = config.stateVersion;
  }

  // ==========================================================================
  // Recording
  // ==========================================================================

  /**
   * Record a validated top-up intent
   *
   * IMPORTANT: This method assumes the intent has been validated
   * by TopUpBoundary. It performs a quick idempotency check but
   * does not re-validate the full intent.
   *
   * @param intent - A validated top-up intent
   * @returns Recording result (never throws)
   */
  record(intent: TopUpIntent): TopUpRecordResult {
    // Quick idempotency check
    if (this.boundary.isProcessed(intent.intentId)) {
      return duplicateResult(intent.intentId);
    }

    try {
      // Transform intent to ledger entry input
      const input = this.transformToEntryInput(intent);

      // Append to ledger
      const entry = this.ledger.appendEntry(input);

      // Mark as processed for idempotency
      this.boundary.markProcessed(intent.intentId);

      return successResult(intent.intentId, entry.sequence);
    } catch (error) {
      return failResult(
        error instanceof Error ? error.message : 'Unknown recording error'
      );
    }
  }

  /**
   * Record with explicit validation
   *
   * Validates the intent first, then records if valid.
   * This is the safe method for external callers.
   */
  validateAndRecord(intent: TopUpIntent): TopUpRecordResult {
    // Validate first
    const validation = this.boundary.validateIntent(intent);

    if (!validation.isValid) {
      // Check if this is a duplicate error
      const duplicateError = validation.errors.find(e => e.code === 'DUPLICATE_INTENT');
      if (duplicateError) {
        return duplicateResult(intent.intentId);
      }

      const errorMessages = validation.errors
        .map(e => `${e.code}: ${e.message}`)
        .join('; ');
      return failResult(`Validation failed: ${errorMessages}`);
    }

    // Record if valid
    return this.record(intent);
  }

  // ==========================================================================
  // Transform
  // ==========================================================================

  /**
   * Transform a top-up intent to a ledger entry input
   *
   * This is a pure transformation with no side effects.
   */
  private transformToEntryInput(intent: TopUpIntent): LedgerEntryInput {
    return {
      source: 'TOP_UP',
      affectedParty: createPlayerParty(intent.playerId),
      delta: intent.amount, // Credit to player (positive)
      stateVersion: this.stateVersion,
      tableId: intent.tableId,
      clubId: intent.clubId,
      description: `Top-up: ${intent.amount} chips to player`,
      metadata: {
        intentId: intent.intentId,
        requestedAt: intent.requestedAt,
        ...intent.metadata,
      },
    };
  }

  // ==========================================================================
  // Query Access
  // ==========================================================================

  /**
   * Get the underlying ledger (read-only access)
   */
  getLedger(): ValueLedger {
    return this.ledger;
  }

  /**
   * Get the boundary (for idempotency checks)
   */
  getBoundary(): TopUpBoundary {
    return this.boundary;
  }

  /**
   * Check if an intent has been recorded
   */
  isRecorded(intentId: TopUpIntentId): boolean {
    return this.boundary.isProcessed(intentId);
  }

  /**
   * Get recording statistics
   */
  getStatistics(): {
    processedIntents: number;
    ledgerEntries: number;
  } {
    return {
      processedIntents: this.boundary.getStatistics().processedCount,
      ledgerEntries: this.ledger.getEntryCount(),
    };
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createTopUpRecorder(
  ledger: ValueLedger,
  boundary: TopUpBoundary,
  stateVersion: StateVersion
): TopUpRecorder {
  return new TopUpRecorder(ledger, boundary, { stateVersion });
}
