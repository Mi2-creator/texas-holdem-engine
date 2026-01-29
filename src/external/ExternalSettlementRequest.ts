/**
 * ExternalSettlementRequest.ts
 * Phase 32 - External Settlement Boundary (Interface Only)
 *
 * Describes a request coming FROM outside the engine.
 * Data container only - no validation logic, no defaults, no constructors.
 */

import {
  ExternalValueSourceId,
  ExternalReferenceId,
  ExternalValueAmount,
  ExternalValueDirection,
} from './ExternalValueTypes';

// ============================================================================
// Request Type
// ============================================================================

/**
 * External settlement request descriptor.
 * Pure data container - no behavior, no side effects.
 *
 * Represents a request for value movement from an external source.
 * The engine does not interpret or act on these requests -
 * they exist only as a boundary type definition.
 */
export interface ExternalSettlementRequest {
  /**
   * Identifier of the external value source.
   */
  readonly sourceId: ExternalValueSourceId;

  /**
   * Unique reference identifier for this request.
   * Used for idempotency and tracking.
   */
  readonly referenceId: ExternalReferenceId;

  /**
   * Direction of value flow.
   */
  readonly direction: ExternalValueDirection;

  /**
   * Integer amount of abstract value units.
   */
  readonly amount: ExternalValueAmount;

  /**
   * Timestamp when the request was created.
   * Unix milliseconds.
   */
  readonly createdAt: number;

  /**
   * Opaque metadata from external system.
   * Engine does not interpret this data.
   */
  readonly metadata: Readonly<Record<string, unknown>>;
}
