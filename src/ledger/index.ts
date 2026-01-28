/**
 * Ledger Module
 * Phase 25 - Deterministic value ledger & revenue attribution
 *
 * This module provides a value attribution ledger that:
 * - Records revenue attribution (not balance mutation)
 * - Is append-only and immutable after creation
 * - Derives entries deterministically from authoritative state
 * - Supports audit and revenue accounting
 *
 * Key components:
 * - LedgerTypes: Type definitions and branded IDs
 * - LedgerEntry: Immutable entry creation and storage
 * - LedgerRecorder: Deterministic derivation from settlement outputs
 * - LedgerView: Read-only aggregation and queries
 *
 * Design principles:
 * - No balance enforcement
 * - No payouts or transfers
 * - All entries derive from authoritative StateVersion
 * - Hash chain for tamper detection
 */

// Types
export {
  // Branded types
  LedgerEntryId,
  LedgerBatchId,
  AgentId,

  // Attribution types
  AttributionPartyType,
  AttributionParty,
  AttributionSource,
  HandSettlementCategory,

  // Core types
  LedgerEntry,
  LedgerBatch,
  LedgerEntryInput,

  // Input types
  SettlementAttribution,
  TimeFeeAttribution,

  // Query types
  LedgerQuery,
  AttributionSummary,
  TableAttributionSummary,
  ClubAttributionSummary,

  // Verification types
  LedgerIntegrityResult,
  BatchVerificationResult,

  // ID generators
  generateLedgerEntryId,
  generateLedgerBatchId,
  resetLedgerCounters,

  // Checksum utilities
  calculateEntryChecksum,
  calculateBatchChecksum,
  verifyEntryChecksum,
  verifyBatchChecksum,

  // Party factories
  createPlayerParty,
  createClubParty,
  createAgentParty,
  createPlatformParty,
} from './LedgerTypes';

// Ledger Entry & Storage
export {
  ValueLedger,
  createValueLedger,
  LedgerConfig,
  DEFAULT_LEDGER_CONFIG,
} from './LedgerEntry';

// Recorder
export {
  LedgerRecorder,
  createLedgerRecorder,
  RecorderConfig,
  DEFAULT_RECORDER_CONFIG,
  RecordingResult,
} from './LedgerRecorder';

// View
export {
  LedgerView,
  createLedgerView,
} from './LedgerView';
