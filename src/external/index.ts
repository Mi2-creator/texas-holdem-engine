/**
 * External Settlement Boundary Module
 * Phase 32 - Interface Only, Inert
 *
 * This module provides type definitions and interfaces for
 * external value settlement boundaries.
 *
 * IMPORTANT:
 * - This module contains ONLY types and interfaces
 * - NO concrete implementations exist
 * - NO runtime behavior
 * - NO side effects
 * - Engine does NOT depend on this module
 * - Module is DEAD CODE unless manually wired
 */

// Value Types
export type {
  ExternalValueSourceId,
  ExternalReferenceId,
  ExternalValueAmount,
  ExternalValueDirection,
  ExternalValueStatus,
} from './ExternalValueTypes';

export {
  isExternalValueSourceId,
  isExternalReferenceId,
  isExternalValueAmount,
  isExternalValueDirection,
  isExternalValueStatus,
} from './ExternalValueTypes';

// Request Type
export type { ExternalSettlementRequest } from './ExternalSettlementRequest';

// Result Type
export type { ExternalSettlementResult } from './ExternalSettlementResult';

// Port Interface
export type { ExternalSettlementPort } from './ExternalSettlementPort';

// Policy Type
export type { ExternalSettlementPolicy } from './ExternalSettlementPolicy';
export { DEFAULT_EXTERNAL_SETTLEMENT_POLICY } from './ExternalSettlementPolicy';

// Boundary Type
export type {
  ExternalSettlementBoundaryConfig,
  ExternalSettlementBoundary,
} from './ExternalSettlementBoundary';
export { createExternalSettlementBoundary } from './ExternalSettlementBoundary';
