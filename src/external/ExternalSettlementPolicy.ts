/**
 * ExternalSettlementPolicy.ts
 * Phase 32 - External Settlement Boundary (Interface Only)
 *
 * Read-only declaration of policy constraints.
 * Static configuration object only - no enforcement logic, no runtime checks.
 */

import { ExternalValueDirection, ExternalValueAmount } from './ExternalValueTypes';

// ============================================================================
// Policy Type
// ============================================================================

/**
 * External settlement policy configuration.
 * Read-only constraints for external settlement operations.
 *
 * This is a TYPE definition only - no enforcement logic exists.
 * Policy enforcement is deferred to future implementation phases.
 */
export interface ExternalSettlementPolicy {
  /**
   * Directions allowed for external settlement.
   * Empty array means no directions allowed.
   */
  readonly allowedDirections: readonly ExternalValueDirection[];

  /**
   * Maximum absolute value amount for a single settlement.
   * Integer only.
   */
  readonly maxAbsoluteAmount: ExternalValueAmount;

  /**
   * Whether external settlement is allowed during an active hand.
   */
  readonly allowDuringHand: boolean;
}

// ============================================================================
// Default Policy (Static Configuration)
// ============================================================================

/**
 * Default external settlement policy.
 * Static configuration - no runtime modification.
 *
 * Note: This default policy is maximally restrictive.
 * All directions blocked, zero max amount, disallowed during hand.
 * Future phases may provide different default configurations.
 */
export const DEFAULT_EXTERNAL_SETTLEMENT_POLICY: ExternalSettlementPolicy = Object.freeze({
  allowedDirections: Object.freeze([]),
  maxAbsoluteAmount: 0,
  allowDuringHand: false,
});
