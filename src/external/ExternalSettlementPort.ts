/**
 * ExternalSettlementPort.ts
 * Phase 32 - External Settlement Boundary (Interface Only)
 *
 * The ONLY allowed interface boundary for external settlement.
 * Interface only - no implementation, no default export.
 *
 * Synchronous signatures ONLY:
 * - No promises
 * - No retries
 * - No callbacks
 * - No async
 */

import { ExternalReferenceId, ExternalValueStatus } from './ExternalValueTypes';
import { ExternalSettlementRequest } from './ExternalSettlementRequest';
import { ExternalSettlementResult } from './ExternalSettlementResult';

// ============================================================================
// Port Interface
// ============================================================================

/**
 * External settlement port interface.
 *
 * This is the ONLY boundary through which external settlement
 * requests may enter the engine.
 *
 * NO concrete implementation exists in this module.
 * Implementation is deferred to future phases.
 *
 * All methods are synchronous:
 * - No Promise return types
 * - No async modifiers
 * - No callback parameters
 */
export interface ExternalSettlementPort {
  /**
   * Process an external settlement request.
   *
   * @param request - The settlement request from external source
   * @returns Synchronous result indicating acceptance or rejection
   */
  requestSettlement(request: ExternalSettlementRequest): ExternalSettlementResult;

  /**
   * Notify that a settlement has been finalized externally.
   *
   * @param referenceId - The reference identifier of the settlement
   * @param status - The final status from external system
   */
  notifyFinalized(referenceId: ExternalReferenceId, status: ExternalValueStatus): void;
}
