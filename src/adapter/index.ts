/**
 * External Adapter Module
 * Phase 34 - External Runtime Adapter Boundary (Engine-Safe)
 *
 * Provides a STRICT ADAPTER LAYER for external system integration.
 *
 * Capabilities:
 * - Engine → external notification (read-only)
 * - External → engine reference injection (validated, inert)
 *
 * STRICT INVARIANTS:
 * - Engine state cannot be changed via adapter
 * - Adapter cannot call engine internals
 * - All data flows are ONE-WAY
 * - All exports are deterministic snapshots
 * - Adapter references are OPTIONAL and inert
 *
 * The engine remains:
 * - Deterministic
 * - Replay-safe
 * - Self-contained
 * - Unaware of external system semantics
 */

// Adapter Types
export type {
  AdapterId,
  ExportId,
  ExternalRefId,
  ExportPayloadType,
  LedgerSnapshotPayload,
  RevenueSummaryPayload,
  ExternalValueSummaryPayload,
  FullEngineExportPayload,
  ExportPayload,
  ExternalReferenceSource,
  ExternalReference,
  ExternalReferenceValidationResult,
  AdapterStatus,
  AdapterRegistration,
  AdapterRegistrationResult,
  ExportResult,
  ReferenceSubmissionResult,
} from './ExternalAdapterTypes';

export {
  isAdapterId,
  isExportId,
  isExternalRefId,
  validateExternalReference,
  calculateExportChecksum,
} from './ExternalAdapterTypes';

// Adapter Port Interface
export type { ExternalAdapterPort } from './ExternalAdapterPort';
export { NoOpAdapter, createNoOpAdapter } from './ExternalAdapterPort';

// Adapter Registry
export {
  ExternalAdapterRegistry,
  createExternalAdapterRegistry,
} from './ExternalAdapterRegistry';

// Engine Export Adapter
export type {
  LedgerViewForExport,
  RevenueViewForExport,
  ExternalValueViewForExport,
} from './EngineExportAdapter';

export {
  EngineExportAdapter,
  createEngineExportAdapter,
  adaptLedgerView,
  adaptRevenueView,
  adaptExternalValueView,
} from './EngineExportAdapter';
