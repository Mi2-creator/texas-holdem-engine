/**
 * ExternalSettlementBoundary.ts
 * Phase 32 - External Settlement Boundary (Interface Only)
 *
 * Glue boundary ONLY.
 * - Accepts an ExternalSettlementPort
 * - Exposes NO public mutators
 * - Completely inert unless called externally
 *
 * Rules:
 * - No calls into engine
 * - No ledger writes
 * - No economy access
 * - No side effects
 */

import { ExternalSettlementPort } from './ExternalSettlementPort';
import { ExternalSettlementPolicy, DEFAULT_EXTERNAL_SETTLEMENT_POLICY } from './ExternalSettlementPolicy';

// ============================================================================
// Boundary Type
// ============================================================================

/**
 * External settlement boundary configuration.
 * Read-only structure for boundary initialization.
 */
export interface ExternalSettlementBoundaryConfig {
  /**
   * The port implementation to use.
   * Must be provided externally - no default implementation exists.
   */
  readonly port: ExternalSettlementPort;

  /**
   * Policy constraints for the boundary.
   * Defaults to maximally restrictive policy.
   */
  readonly policy?: ExternalSettlementPolicy;
}

/**
 * External settlement boundary.
 *
 * This is a GLUE boundary only:
 * - Holds a reference to an externally-provided port
 * - Holds a reference to policy configuration
 * - Exposes NO public mutators
 * - Performs NO operations
 * - Has NO side effects
 *
 * The boundary is completely INERT:
 * - Does not call into the engine
 * - Does not write to any ledger
 * - Does not access any economy module
 * - Does not modify any state
 *
 * Purpose: Architecture placeholder for future external integration.
 */
export interface ExternalSettlementBoundary {
  /**
   * The port implementation.
   * Read-only access.
   */
  readonly port: ExternalSettlementPort;

  /**
   * The policy configuration.
   * Read-only access.
   */
  readonly policy: ExternalSettlementPolicy;
}

/**
 * Create an external settlement boundary.
 *
 * Factory function that returns a frozen, read-only boundary object.
 * The boundary is completely inert - it holds references but performs
 * no operations.
 *
 * @param config - Boundary configuration with port and optional policy
 * @returns Frozen, read-only boundary object
 */
export function createExternalSettlementBoundary(
  config: ExternalSettlementBoundaryConfig
): ExternalSettlementBoundary {
  const boundary: ExternalSettlementBoundary = {
    port: config.port,
    policy: config.policy ?? DEFAULT_EXTERNAL_SETTLEMENT_POLICY,
  };

  return Object.freeze(boundary);
}
