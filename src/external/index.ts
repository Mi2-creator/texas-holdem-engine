/**
 * External Value Module
 * Phase 32/33 - External Settlement Boundary & Value Reference Mapping
 *
 * This module provides:
 * - Type definitions for external value concepts (Phase 32)
 * - Read-only external value reference registry (Phase 33)
 * - Aggregation views for reconciliation and audit (Phase 33)
 *
 * IMPORTANT:
 * - External values are REFERENCES ONLY
 * - No money movement
 * - No balance changes
 * - No hooks into economy runtime
 * - Deterministic outputs only
 */

// Value Types (Phase 32 + 33)
export type {
  ExternalValueSourceId,
  ExternalReferenceId,
  ExternalValueRefId,
  ExternalValueAmount,
  ExternalValueDirection,
  ExternalValueStatus,
  ExternalValueSource,
} from './ExternalValueTypes';

export {
  isExternalValueSourceId,
  isExternalReferenceId,
  isExternalValueRefId,
  isExternalValueAmount,
  isExternalValueDirection,
  isExternalValueStatus,
  isExternalValueSource,
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

// External Value Reference (Phase 33)
export type {
  ExternalValueReference,
  ExternalValueReferenceInput,
  ExternalValueReferenceValidationResult,
} from './ExternalValueReference';
export {
  validateExternalValueReferenceInput,
  createExternalValueReference,
} from './ExternalValueReference';

// External Value Registry (Phase 33)
export type {
  ExternalValueRegistryAppendResult,
  ExternalValueRegistryQueryResult,
  ExternalValueRegistryQuery,
} from './ExternalValueRegistry';
export {
  ExternalValueRegistry,
  createExternalValueRegistry,
} from './ExternalValueRegistry';

// External Value View (Phase 33)
export type {
  ExternalValueBySourceEntry,
  ExternalValueByDirectionEntry,
  ExternalValueByLedgerEntry,
  ExternalValueSummary,
} from './ExternalValueView';
export {
  ExternalValueView,
  createExternalValueView,
} from './ExternalValueView';
