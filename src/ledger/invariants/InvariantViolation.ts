/**
 * InvariantViolation.ts
 * Phase 25.1 - Structured error types for ledger invariant violations
 *
 * All violations are returned as structured data, never thrown.
 * This enables fail-fast behavior with clear context for debugging.
 *
 * Design principles:
 * - Pure data structures (no side effects)
 * - All fields are readonly (immutable)
 * - Context provides full debugging information
 * - No external dependencies
 */

import { PlayerId } from '../../security/Identity';
import { HandId, TableId } from '../../security/AuditLog';
import { ClubId } from '../../club/ClubTypes';
import {
  LedgerEntryId,
  LedgerBatchId,
  AgentId,
  AttributionPartyType,
} from '../LedgerTypes';

// ============================================================================
// Invariant Types
// ============================================================================

/**
 * Enumeration of all ledger invariants
 *
 * I1: NON_NEGATIVE_BALANCE - No party can have negative attribution balance
 * I2: SYSTEM_CONSERVATION - Deltas must sum to zero for closed systems
 * I3: DETERMINISTIC_REPLAY - Same inputs must produce identical outputs
 * I4: APPEND_ONLY_INTEGRITY - Hash chain must be valid and unbroken
 * I5: ATTRIBUTION_IMMUTABILITY - Recorded attributions cannot be modified
 */
export type InvariantType =
  | 'NON_NEGATIVE_BALANCE'
  | 'SYSTEM_CONSERVATION'
  | 'DETERMINISTIC_REPLAY'
  | 'APPEND_ONLY_INTEGRITY'
  | 'ATTRIBUTION_IMMUTABILITY';

/**
 * Severity levels for violations
 *
 * CRITICAL - System integrity compromised, requires immediate attention
 * ERROR - Business rule violated, operation should be rejected
 * WARNING - Potential issue detected, may indicate future problems
 */
export type ViolationSeverity = 'CRITICAL' | 'ERROR' | 'WARNING';

// ============================================================================
// Violation Context Types
// ============================================================================

/**
 * Context for NON_NEGATIVE_BALANCE violation (I1)
 */
export interface NonNegativeBalanceContext {
  readonly partyType: AttributionPartyType;
  readonly partyId: string;
  readonly currentBalance: number;
  readonly attemptedDelta?: number;
  readonly resultingBalance?: number;
}

/**
 * Context for SYSTEM_CONSERVATION violation (I2)
 */
export interface SystemConservationContext {
  readonly sourceType: 'HAND' | 'BATCH' | 'TIME_PERIOD';
  readonly sourceId: string;
  readonly expectedSum: 0;
  readonly actualSum: number;
  readonly entryCount: number;
  readonly breakdown: readonly {
    readonly partyType: AttributionPartyType;
    readonly partyId: string;
    readonly delta: number;
  }[];
}

/**
 * Context for DETERMINISTIC_REPLAY violation (I3)
 */
export interface DeterministicReplayContext {
  readonly inputHash: string;
  readonly expectedOutputHash: string;
  readonly actualOutputHash: string;
  readonly differingFields: readonly string[];
  readonly firstDifferenceAt?: number;  // Sequence number
}

/**
 * Context for APPEND_ONLY_INTEGRITY violation (I4)
 */
export interface AppendOnlyIntegrityContext {
  readonly violationType: 'DUPLICATE_CHECKSUM' | 'BROKEN_HASH_CHAIN' | 'MISSING_PREVIOUS';
  readonly entryId?: LedgerEntryId;
  readonly sequence?: number;
  readonly expectedHash?: string;
  readonly actualHash?: string;
  readonly duplicateEntryId?: LedgerEntryId;
}

/**
 * Context for ATTRIBUTION_IMMUTABILITY violation (I5)
 */
export interface AttributionImmutabilityContext {
  readonly violationType: 'REPLACE_ATTEMPTED' | 'EDIT_ATTEMPTED' | 'MERGE_ATTEMPTED';
  readonly originalEntryId: LedgerEntryId;
  readonly originalSequence: number;
  readonly attemptedOperation: string;
}

/**
 * Union type for all violation contexts
 */
export type ViolationContext =
  | NonNegativeBalanceContext
  | SystemConservationContext
  | DeterministicReplayContext
  | AppendOnlyIntegrityContext
  | AttributionImmutabilityContext;

// ============================================================================
// Source Reference
// ============================================================================

/**
 * Reference to the source that caused/relates to the violation
 */
export interface SourceRef {
  readonly type: 'HAND' | 'TABLE' | 'CLUB' | 'BATCH' | 'ENTRY' | 'PLAYER' | 'AGENT';
  readonly handId?: HandId;
  readonly tableId?: TableId;
  readonly clubId?: ClubId;
  readonly batchId?: LedgerBatchId;
  readonly entryId?: LedgerEntryId;
  readonly playerId?: PlayerId;
  readonly agentId?: AgentId;
}

// ============================================================================
// Invariant Violation
// ============================================================================

/**
 * Structured invariant violation
 *
 * This is the primary type returned when an invariant check fails.
 * Contains all information needed to understand and debug the violation.
 */
export interface InvariantViolation<T extends ViolationContext = ViolationContext> {
  /** Which invariant was violated */
  readonly invariant: InvariantType;

  /** Severity of the violation */
  readonly severity: ViolationSeverity;

  /** Human-readable description */
  readonly message: string;

  /** Detailed context about the violation */
  readonly context: T;

  /** Reference to the source of the violation */
  readonly sourceRef: SourceRef;

  /** Timestamp when violation was detected */
  readonly detectedAt: number;

  /** Unique violation ID for tracking */
  readonly violationId: string;
}

// ============================================================================
// Violation Result Types
// ============================================================================

/**
 * Result of an invariant check
 */
export interface InvariantCheckResult {
  readonly invariant: InvariantType;
  readonly passed: boolean;
  readonly violation?: InvariantViolation;
  readonly checkedAt: number;
  readonly checkDurationMs: number;
}

/**
 * Result of checking all invariants
 */
export interface FullInvariantCheckResult {
  readonly allPassed: boolean;
  readonly results: readonly InvariantCheckResult[];
  readonly violations: readonly InvariantViolation[];
  readonly totalChecks: number;
  readonly passedChecks: number;
  readonly failedChecks: number;
  readonly checkedAt: number;
  readonly totalDurationMs: number;
}

// ============================================================================
// Violation Factory Functions
// ============================================================================

let violationCounter = 0;

/**
 * Generate unique violation ID
 */
function generateViolationId(): string {
  return `viol_${Date.now()}_${++violationCounter}`;
}

/**
 * Reset violation counter (for testing)
 */
export function resetViolationCounter(): void {
  violationCounter = 0;
}

/**
 * Create a NON_NEGATIVE_BALANCE violation
 */
export function createNonNegativeBalanceViolation(
  context: NonNegativeBalanceContext,
  sourceRef: SourceRef
): InvariantViolation<NonNegativeBalanceContext> {
  return {
    invariant: 'NON_NEGATIVE_BALANCE',
    severity: 'ERROR',
    message: `Party ${context.partyType}:${context.partyId} has negative balance: ${context.currentBalance}`,
    context,
    sourceRef,
    detectedAt: Date.now(),
    violationId: generateViolationId(),
  };
}

/**
 * Create a SYSTEM_CONSERVATION violation
 */
export function createSystemConservationViolation(
  context: SystemConservationContext,
  sourceRef: SourceRef
): InvariantViolation<SystemConservationContext> {
  return {
    invariant: 'SYSTEM_CONSERVATION',
    severity: 'CRITICAL',
    message: `System conservation violated for ${context.sourceType}:${context.sourceId}. Expected sum: 0, actual: ${context.actualSum}`,
    context,
    sourceRef,
    detectedAt: Date.now(),
    violationId: generateViolationId(),
  };
}

/**
 * Create a DETERMINISTIC_REPLAY violation
 */
export function createDeterministicReplayViolation(
  context: DeterministicReplayContext,
  sourceRef: SourceRef
): InvariantViolation<DeterministicReplayContext> {
  return {
    invariant: 'DETERMINISTIC_REPLAY',
    severity: 'CRITICAL',
    message: `Deterministic replay failed. Expected hash: ${context.expectedOutputHash}, actual: ${context.actualOutputHash}`,
    context,
    sourceRef,
    detectedAt: Date.now(),
    violationId: generateViolationId(),
  };
}

/**
 * Create an APPEND_ONLY_INTEGRITY violation
 */
export function createAppendOnlyIntegrityViolation(
  context: AppendOnlyIntegrityContext,
  sourceRef: SourceRef
): InvariantViolation<AppendOnlyIntegrityContext> {
  const messages: Record<AppendOnlyIntegrityContext['violationType'], string> = {
    DUPLICATE_CHECKSUM: `Duplicate checksum detected at entry ${context.entryId}`,
    BROKEN_HASH_CHAIN: `Hash chain broken at sequence ${context.sequence}. Expected: ${context.expectedHash}, actual: ${context.actualHash}`,
    MISSING_PREVIOUS: `Entry ${context.entryId} references non-existent previous hash`,
  };

  return {
    invariant: 'APPEND_ONLY_INTEGRITY',
    severity: 'CRITICAL',
    message: messages[context.violationType],
    context,
    sourceRef,
    detectedAt: Date.now(),
    violationId: generateViolationId(),
  };
}

/**
 * Create an ATTRIBUTION_IMMUTABILITY violation
 */
export function createAttributionImmutabilityViolation(
  context: AttributionImmutabilityContext,
  sourceRef: SourceRef
): InvariantViolation<AttributionImmutabilityContext> {
  const messages: Record<AttributionImmutabilityContext['violationType'], string> = {
    REPLACE_ATTEMPTED: `Attempted to replace entry ${context.originalEntryId}`,
    EDIT_ATTEMPTED: `Attempted to edit entry ${context.originalEntryId}`,
    MERGE_ATTEMPTED: `Attempted to merge entry ${context.originalEntryId}`,
  };

  return {
    invariant: 'ATTRIBUTION_IMMUTABILITY',
    severity: 'ERROR',
    message: messages[context.violationType],
    context,
    sourceRef,
    detectedAt: Date.now(),
    violationId: generateViolationId(),
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a source reference from a hand
 */
export function createHandSourceRef(handId: HandId, tableId?: TableId, clubId?: ClubId): SourceRef {
  return { type: 'HAND', handId, tableId, clubId };
}

/**
 * Create a source reference from a batch
 */
export function createBatchSourceRef(batchId: LedgerBatchId): SourceRef {
  return { type: 'BATCH', batchId };
}

/**
 * Create a source reference from an entry
 */
export function createEntrySourceRef(entryId: LedgerEntryId): SourceRef {
  return { type: 'ENTRY', entryId };
}

/**
 * Create a source reference from a player
 */
export function createPlayerSourceRef(playerId: PlayerId): SourceRef {
  return { type: 'PLAYER', playerId };
}

/**
 * Check if a violation is critical
 */
export function isCriticalViolation(violation: InvariantViolation): boolean {
  return violation.severity === 'CRITICAL';
}

/**
 * Filter violations by invariant type
 */
export function filterViolationsByInvariant(
  violations: readonly InvariantViolation[],
  invariant: InvariantType
): readonly InvariantViolation[] {
  return violations.filter(v => v.invariant === invariant);
}

/**
 * Filter violations by severity
 */
export function filterViolationsBySeverity(
  violations: readonly InvariantViolation[],
  severity: ViolationSeverity
): readonly InvariantViolation[] {
  return violations.filter(v => v.severity === severity);
}
