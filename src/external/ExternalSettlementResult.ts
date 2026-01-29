/**
 * ExternalSettlementResult.ts
 * Phase 32 - External Settlement Boundary (Interface Only)
 *
 * Describes how the engine RESPONDS to an external request.
 * Data container only - no decision logic, no enforcement.
 */

import { ExternalReferenceId } from './ExternalValueTypes';

// ============================================================================
// Result Type
// ============================================================================

/**
 * External settlement result descriptor.
 * Pure data container - no behavior, no side effects.
 *
 * Represents the engine's response to an external settlement request.
 * Does not contain any decision logic - only describes a result shape.
 */
export interface ExternalSettlementResult {
  /**
   * Reference identifier from the original request.
   */
  readonly referenceId: ExternalReferenceId;

  /**
   * Whether the request was accepted by the engine.
   */
  readonly accepted: boolean;

  /**
   * Reason for rejection, if not accepted.
   * Null when accepted is true.
   */
  readonly rejectionReason: string | null;

  /**
   * Optional link to ledger batch created by settlement.
   * Only populated when accepted is true and settlement
   * resulted in ledger entries.
   *
   * Uses string type to avoid coupling to LedgerEntryId.
   */
  readonly linkedLedgerBatchId?: string;
}
