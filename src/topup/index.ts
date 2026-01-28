/**
 * Top-Up Module
 * Phase 28 - External Top-Up Integration Boundary (Blueprint)
 *
 * This module provides a future-facing interface layer for accepting
 * external top-up results. It is a BLUEPRINT ONLY - no external
 * integration is implemented.
 *
 * A "top-up" is an EXTERNAL FACT:
 * - The engine does NOT calculate or verify external values
 * - The engine only records a validated, idempotent increase in PLAYER chips
 * - Top-ups are NOT revenue, NOT rake, NOT bonus, NOT settlement
 *
 * HARD CONSTRAINTS:
 * - No payments, wallets, crypto, blockchain, currencies
 * - No mutations to existing economy, settlement, or ledger logic
 * - All code is deterministic, replay-safe, append-only
 * - Safe to merge even if NEVER used
 *
 * Module structure:
 * - TopUpTypes: Branded IDs, enums, result types
 * - TopUpIntent: Immutable intent type
 * - TopUpBoundary: Validation and invariant enforcement
 * - TopUpRecorder: Ledger integration
 * - TopUpView: Read-only queries
 */

// Types
export {
  // Branded types
  TopUpIntentId,
  generateTopUpIntentId,
  resetTopUpCounters,

  // Source marker
  TOP_UP_SOURCE,
  TopUpSource,

  // Error types
  TopUpValidationError,
  TopUpErrorCode,

  // Result types
  TopUpValidationResult,
  TopUpRecordResult,
  TopUpQueryResult,

  // Query types
  TopUpTimeWindow,

  // Summary types
  PlayerTopUpSummary,
  ClubTopUpSummary,
  TableTopUpSummary,

  // Factory helpers
  validResult,
  invalidResult,
  createValidationError,
  successResult,
  failResult,
  duplicateResult,
} from './TopUpTypes';

// Intent
export {
  TopUpIntent,
  TopUpIntentInput,
  createTopUpIntent,
  createTopUpIntentWithTimestamp,
  hasMetadata,
  getMetadataValue,
  intentToString,
} from './TopUpIntent';

// Boundary
export {
  TopUpBoundary,
  createTopUpBoundary,
  defaultTopUpBoundary,
  validateTopUpIntent,
} from './TopUpBoundary';

// Recorder
export {
  TopUpRecorder,
  TopUpRecorderConfig,
  createTopUpRecorder,
} from './TopUpRecorder';

// View
export {
  TopUpView,
  createTopUpView,
} from './TopUpView';
