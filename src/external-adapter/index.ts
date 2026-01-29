/**
 * External Adapter Simulation Module
 * Phase 35 - External Adapter Simulation & Boundary Proof (Read-Only)
 *
 * Provides a simulated external world to validate adapter boundaries.
 *
 * Properties:
 * - Engine state remains immutable and deterministic
 * - External systems are READ-ONLY consumers + reference providers
 * - No clocks, randomness, IO, network, DB, or side effects
 * - Same input always produces identical outputs (replay-safe)
 *
 * CONSTRAINTS:
 * - No payments, wallets, crypto, transfers, deposits, withdrawals
 * - Ledger, Economy, Revenue, Integrity invariants untouched
 * - External references are validated but inert
 */

// Adapter Types
export type {
  SimulationAdapterId,
  SimulationExportId,
  SimulationReferenceId,
  SimulationSequenceId,
  ExportStatus,
  ReferenceStatus,
  AdapterOperationType,
  ExternalExportResult,
  ExternalReferenceResult,
  AdapterAuditEntry,
  ValidationResult,
} from './AdapterTypes';

export {
  isSimulationAdapterId,
  isSimulationExportId,
  isSimulationReferenceId,
  isSimulationSequenceId,
  generateSimulationAdapterId,
  generateSimulationExportId,
  generateSimulationReferenceId,
  calculateSimulationChecksum,
  verifySimulationChecksum,
  combineValidationResults,
} from './AdapterTypes';

// Export Payload Types
export type {
  ExportPayloadType,
  LedgerStatistics,
  LedgerViewExportPayload,
  RevenueStatistics,
  RevenueViewExportPayload,
  ExternalValueStatistics,
  ExternalValueExportPayload,
  CombinedExportPayload,
  ExportPayload,
  LedgerViewInput,
  RevenueViewInput,
  ExternalValueViewInput,
} from './ExportPayload';

export {
  EXPORT_PAYLOAD_VERSION,
  buildLedgerExportPayload,
  buildRevenueExportPayload,
  buildExternalValueExportPayload,
  buildCombinedExportPayload,
  validateExportPayload,
} from './ExportPayload';

// Import Reference Types
export type {
  ImportReferenceSource,
  ImportReferenceInput,
  ImportReference,
  ReferenceStatistics,
} from './ImportReference';

export {
  validateImportReferenceInput,
  checkIdempotencyViolation,
  verifyReferenceChecksum,
  buildImportReference,
  calculateReferenceStatistics,
} from './ImportReference';

// External Adapter Interface
export type {
  ExternalAdapter,
  AdapterCapabilities,
  AdapterStatus,
} from './ExternalAdapter';

export {
  DEFAULT_ADAPTER_CAPABILITIES,
  getAdapterStatus,
  NoOpExternalAdapter,
  createNoOpExternalAdapter,
} from './ExternalAdapter';

// Mock External Adapter
export type {
  MockAdapterConfig,
  MockAdapterStatistics,
  MockAdapterState,
} from './MockExternalAdapter';

export {
  DEFAULT_MOCK_CONFIG,
  MockExternalAdapter,
  createMockExternalAdapter,
} from './MockExternalAdapter';

// Adapter Registry
export type {
  ExportRegistryEntry,
  ReferenceRegistryEntry,
  RegistryStatistics,
  RegistryState,
} from './AdapterRegistry';

export {
  AdapterRegistry,
  createAdapterRegistry,
} from './AdapterRegistry';
