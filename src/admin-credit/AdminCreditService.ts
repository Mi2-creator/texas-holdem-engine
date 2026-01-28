/**
 * AdminCreditService.ts
 * Phase 29 - Admin Credit (Manual Top-Up) System
 *
 * Service that processes admin credits through the Phase 28 TopUpBoundary.
 *
 * RESPONSIBILITIES:
 * - Accept AdminCreditIntent
 * - Enforce AdminCreditPolicy
 * - Convert AdminCreditIntent → TopUpIntent
 * - Call TopUpBoundary for final processing
 *
 * MUST:
 * - Preserve intentId for idempotency
 * - Attach admin metadata to ledger entries
 * - Route ALL credits through TopUpBoundary
 *
 * MUST NOT:
 * - Touch ledger directly
 * - Calculate balances
 * - Bypass TopUpBoundary
 * - Create revenue entries
 */

import { TopUpIntentId, generateTopUpIntentId } from '../topup/TopUpTypes';
import { TopUpIntent, createTopUpIntentWithTimestamp } from '../topup/TopUpIntent';
import { TopUpRecorder } from '../topup/TopUpRecorder';
import { AdminCreditIntent } from './AdminCreditIntent';
import { AdminCreditPolicy } from './AdminCreditPolicy';
import {
  AdminCreditResult,
  AdminCreditIntentId,
  successAdminCreditResult,
  failAdminCreditResult,
  duplicateAdminCreditResult,
} from './AdminCreditTypes';

// ============================================================================
// Admin Credit Service Implementation
// ============================================================================

/**
 * Service for processing admin-initiated credits
 *
 * This service is the bridge between AdminCreditIntent and the
 * Phase 28 TopUpBoundary. It ensures all admin credits:
 * - Pass policy validation
 * - Are converted to TopUpIntent format
 * - Flow through the standard top-up path
 * - Maintain full audit trail
 *
 * KEY INVARIANTS:
 * - Never touches ledger directly
 * - All credits go through TopUpRecorder
 * - Admin metadata preserved in ledger entries
 */
export class AdminCreditService {
  private readonly policy: AdminCreditPolicy;
  private readonly topUpRecorder: TopUpRecorder;
  private readonly intentIdMapping: Map<AdminCreditIntentId, TopUpIntentId>;

  constructor(
    policy: AdminCreditPolicy,
    topUpRecorder: TopUpRecorder
  ) {
    this.policy = policy;
    this.topUpRecorder = topUpRecorder;
    this.intentIdMapping = new Map();
  }

  // ==========================================================================
  // Credit Processing
  // ==========================================================================

  /**
   * Process an admin credit intent
   *
   * Flow:
   * 1. Validate against AdminCreditPolicy
   * 2. Convert to TopUpIntent
   * 3. Process through TopUpRecorder
   * 4. Mark intent as processed
   *
   * @param intent - Admin credit intent to process
   * @returns Result with success/failure and entry sequence
   */
  processCredit(intent: AdminCreditIntent): AdminCreditResult {
    // 1. Validate against policy
    const validation = this.policy.validate(intent);

    if (!validation.isValid) {
      // Check for duplicate
      const duplicateError = validation.errors.find(e => e.code === 'DUPLICATE_INTENT');
      if (duplicateError) {
        return duplicateAdminCreditResult(intent.intentId);
      }

      const errorMessages = validation.errors
        .map(e => `${e.code}: ${e.message}`)
        .join('; ');
      return failAdminCreditResult(`Policy validation failed: ${errorMessages}`);
    }

    // 2. Convert to TopUpIntent
    const topUpIntent = this.convertToTopUpIntent(intent);

    // 3. Process through TopUpRecorder (which uses TopUpBoundary)
    const topUpResult = this.topUpRecorder.validateAndRecord(topUpIntent);

    if (!topUpResult.success) {
      if (topUpResult.isDuplicate) {
        // This shouldn't happen since we check in policy, but handle it
        return duplicateAdminCreditResult(intent.intentId);
      }
      return failAdminCreditResult(
        `TopUp boundary rejected: ${topUpResult.error}`
      );
    }

    // 4. Mark as processed in policy
    this.policy.markProcessed(intent.intentId);

    // 5. Store intent ID mapping
    this.intentIdMapping.set(intent.intentId, topUpIntent.intentId);

    return successAdminCreditResult(intent.intentId, topUpResult.entrySequence!);
  }

  // ==========================================================================
  // Intent Conversion
  // ==========================================================================

  /**
   * Convert AdminCreditIntent to TopUpIntent
   *
   * Preserves all admin context in metadata for audit trail.
   */
  private convertToTopUpIntent(intent: AdminCreditIntent): TopUpIntent {
    // Generate a new TopUpIntentId but maintain mapping
    const topUpIntentId = generateTopUpIntentId();

    return createTopUpIntentWithTimestamp(
      {
        intentId: topUpIntentId,
        playerId: intent.playerId,
        clubId: intent.clubId,
        tableId: intent.tableId,
        amount: intent.amount,
        metadata: {
          // Preserve full admin credit context
          adminCreditIntentId: intent.intentId,
          adminId: intent.adminId,
          reason: intent.reason,
          note: intent.note,
          source: 'ADMIN_CREDIT',
        },
      },
      intent.createdAt
    );
  }

  // ==========================================================================
  // Query Access
  // ==========================================================================

  /**
   * Get the policy instance
   */
  getPolicy(): AdminCreditPolicy {
    return this.policy;
  }

  /**
   * Get the TopUp recorder instance
   */
  getTopUpRecorder(): TopUpRecorder {
    return this.topUpRecorder;
  }

  /**
   * Check if an admin credit intent has been processed
   */
  isProcessed(intentId: AdminCreditIntentId): boolean {
    return this.policy.isProcessed(intentId);
  }

  /**
   * Get the TopUpIntentId for an AdminCreditIntentId
   */
  getTopUpIntentId(intentId: AdminCreditIntentId): TopUpIntentId | undefined {
    return this.intentIdMapping.get(intentId);
  }

  /**
   * Get service statistics
   */
  getStatistics(): {
    processedCredits: number;
    policyStats: ReturnType<AdminCreditPolicy['getStatistics']>;
    recorderStats: ReturnType<TopUpRecorder['getStatistics']>;
  } {
    return {
      processedCredits: this.intentIdMapping.size,
      policyStats: this.policy.getStatistics(),
      recorderStats: this.topUpRecorder.getStatistics(),
    };
  }

  /**
   * Clear mapping (for testing only)
   */
  clearMapping(): void {
    this.intentIdMapping.clear();
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createAdminCreditService(
  policy: AdminCreditPolicy,
  topUpRecorder: TopUpRecorder
): AdminCreditService {
  return new AdminCreditService(policy, topUpRecorder);
}
