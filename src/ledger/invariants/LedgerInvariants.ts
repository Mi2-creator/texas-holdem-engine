/**
 * LedgerInvariants.ts
 * Phase 25.1 - Ledger invariant definitions and specifications
 *
 * This file defines the 5 core invariants that the ledger must maintain:
 *
 * I1. NON_NEGATIVE_BALANCE - No party can have negative attribution total
 * I2. SYSTEM_CONSERVATION - Deltas must sum to zero for closed systems
 * I3. DETERMINISTIC_REPLAY - Same inputs must produce identical outputs
 * I4. APPEND_ONLY_INTEGRITY - Hash chain must be valid and entries immutable
 * I5. ATTRIBUTION_IMMUTABILITY - Recorded attributions cannot be modified
 *
 * Design principles:
 * - Invariants are pure assertions (no calculations)
 * - All invariants are defined declaratively
 * - No external dependencies or side effects
 */

import { InvariantType, ViolationSeverity } from './InvariantViolation';

// ============================================================================
// Invariant Specification
// ============================================================================

/**
 * Specification for a ledger invariant
 */
export interface InvariantSpec {
  /** Invariant identifier */
  readonly type: InvariantType;

  /** Human-readable name */
  readonly name: string;

  /** Detailed description */
  readonly description: string;

  /** Severity when violated */
  readonly severity: ViolationSeverity;

  /** Whether this invariant should be checked on every operation */
  readonly checkOnOperation: boolean;

  /** Whether this invariant requires full ledger scan */
  readonly requiresFullScan: boolean;

  /** Category for grouping */
  readonly category: 'BALANCE' | 'CONSERVATION' | 'INTEGRITY' | 'DETERMINISM';
}

// ============================================================================
// Invariant Definitions
// ============================================================================

/**
 * I1: NON_NEGATIVE_BALANCE
 *
 * Assertion: For any party, the sum of all their deltas must be >= 0
 *
 * Rationale: A party cannot have negative attribution in a value ledger.
 * While individual deltas can be negative (debits), the cumulative
 * total must never go below zero.
 *
 * Checked: After each entry is recorded
 * Scope: Per-party cumulative balance
 */
export const NON_NEGATIVE_BALANCE: InvariantSpec = {
  type: 'NON_NEGATIVE_BALANCE',
  name: 'Non-Negative Balance',
  description:
    'The cumulative attribution for any party must never be negative. ' +
    'Individual entries may have negative deltas, but the sum must be >= 0.',
  severity: 'ERROR',
  checkOnOperation: true,
  requiresFullScan: false,
  category: 'BALANCE',
};

/**
 * I2: SYSTEM_CONSERVATION
 *
 * Assertion: For any closed system (e.g., a hand), Σ(delta) === 0
 *
 * Rationale: Value cannot be created or destroyed within the system.
 * For hand settlements: pot winnings + rake + returns must equal contributions.
 * Platform/club/agent rake shares must be accounted for in the sum.
 *
 * Checked: After each batch is recorded
 * Scope: Per-sourceRef (e.g., handId)
 */
export const SYSTEM_CONSERVATION: InvariantSpec = {
  type: 'SYSTEM_CONSERVATION',
  name: 'System Conservation',
  description:
    'For any closed system (hand, batch), the sum of all deltas must equal zero. ' +
    'Value cannot be created or destroyed, only transferred between parties.',
  severity: 'CRITICAL',
  checkOnOperation: true,
  requiresFullScan: false,
  category: 'CONSERVATION',
};

/**
 * I3: DETERMINISTIC_REPLAY
 *
 * Assertion: Same inputs produce structurally identical outputs
 *
 * Rationale: The ledger must be replay-safe. Given the same settlement
 * output and attribution configuration, the resulting LedgerEntry[]
 * must be deep-equal (excluding timestamps and generated IDs).
 *
 * Checked: On demand (replay verification)
 * Scope: Full entry sequence
 */
export const DETERMINISTIC_REPLAY: InvariantSpec = {
  type: 'DETERMINISTIC_REPLAY',
  name: 'Deterministic Replay',
  description:
    'Given identical inputs, the ledger must produce structurally identical outputs. ' +
    'This enables replay verification and ensures reproducibility.',
  severity: 'CRITICAL',
  checkOnOperation: false,
  requiresFullScan: true,
  category: 'DETERMINISM',
};

/**
 * I4: APPEND_ONLY_INTEGRITY
 *
 * Assertion: The hash chain is valid and unbroken
 *
 * Sub-assertions:
 * - No two entries have the same checksum
 * - Each entry's previousHash matches the prior entry's checksum
 * - No entry points to a non-existent previousHash (except genesis)
 *
 * Checked: On demand (integrity verification)
 * Scope: Full entry chain
 */
export const APPEND_ONLY_INTEGRITY: InvariantSpec = {
  type: 'APPEND_ONLY_INTEGRITY',
  name: 'Append-Only Integrity',
  description:
    'The ledger hash chain must be valid: no duplicate checksums, ' +
    'each entry correctly references its predecessor, and the chain is unbroken.',
  severity: 'CRITICAL',
  checkOnOperation: false,
  requiresFullScan: true,
  category: 'INTEGRITY',
};

/**
 * I5: ATTRIBUTION_IMMUTABILITY
 *
 * Assertion: Recorded attributions cannot be modified
 *
 * Sub-assertions:
 * - No entry can be replaced with different values
 * - No entry can be edited in place
 * - No entries can be merged after recording
 * - Corrections must use offset entries (new entry with opposite delta)
 *
 * Checked: Enforced by type system and runtime guards
 * Scope: Per-entry
 */
export const ATTRIBUTION_IMMUTABILITY: InvariantSpec = {
  type: 'ATTRIBUTION_IMMUTABILITY',
  name: 'Attribution Immutability',
  description:
    'Once recorded, an attribution entry cannot be replaced, edited, or merged. ' +
    'Corrections must be made via offset entries (new entries with opposite delta).',
  severity: 'ERROR',
  checkOnOperation: true,
  requiresFullScan: false,
  category: 'INTEGRITY',
};

// ============================================================================
// Invariant Registry
// ============================================================================

/**
 * All invariant specifications indexed by type
 */
export const INVARIANT_SPECS: Readonly<Record<InvariantType, InvariantSpec>> = {
  NON_NEGATIVE_BALANCE,
  SYSTEM_CONSERVATION,
  DETERMINISTIC_REPLAY,
  APPEND_ONLY_INTEGRITY,
  ATTRIBUTION_IMMUTABILITY,
};

/**
 * Get all invariant specifications
 */
export function getAllInvariants(): readonly InvariantSpec[] {
  return Object.values(INVARIANT_SPECS);
}

/**
 * Get invariants by category
 */
export function getInvariantsByCategory(
  category: InvariantSpec['category']
): readonly InvariantSpec[] {
  return getAllInvariants().filter(inv => inv.category === category);
}

/**
 * Get invariants that should be checked on each operation
 */
export function getOperationInvariants(): readonly InvariantSpec[] {
  return getAllInvariants().filter(inv => inv.checkOnOperation);
}

/**
 * Get invariants that require full scan
 */
export function getFullScanInvariants(): readonly InvariantSpec[] {
  return getAllInvariants().filter(inv => inv.requiresFullScan);
}

/**
 * Get critical invariants (those with CRITICAL severity)
 */
export function getCriticalInvariants(): readonly InvariantSpec[] {
  return getAllInvariants().filter(inv => inv.severity === 'CRITICAL');
}

// ============================================================================
// Invariant Configuration
// ============================================================================

/**
 * Configuration for invariant checking
 */
export interface InvariantCheckConfig {
  /** Which invariants to check */
  readonly enabledInvariants: readonly InvariantType[];

  /** Whether to fail fast on first violation */
  readonly failFast: boolean;

  /** Whether to include warnings in results */
  readonly includeWarnings: boolean;

  /** Maximum entries to scan (for performance) */
  readonly maxScanEntries: number;
}

/**
 * Default configuration - all invariants enabled
 */
export const DEFAULT_INVARIANT_CONFIG: InvariantCheckConfig = {
  enabledInvariants: [
    'NON_NEGATIVE_BALANCE',
    'SYSTEM_CONSERVATION',
    'DETERMINISTIC_REPLAY',
    'APPEND_ONLY_INTEGRITY',
    'ATTRIBUTION_IMMUTABILITY',
  ],
  failFast: false,
  includeWarnings: true,
  maxScanEntries: 100000,
};

/**
 * Strict configuration - fail fast on any violation
 */
export const STRICT_INVARIANT_CONFIG: InvariantCheckConfig = {
  enabledInvariants: [
    'NON_NEGATIVE_BALANCE',
    'SYSTEM_CONSERVATION',
    'DETERMINISTIC_REPLAY',
    'APPEND_ONLY_INTEGRITY',
    'ATTRIBUTION_IMMUTABILITY',
  ],
  failFast: true,
  includeWarnings: true,
  maxScanEntries: 100000,
};

/**
 * Performance configuration - only operation-level checks
 */
export const PERFORMANCE_INVARIANT_CONFIG: InvariantCheckConfig = {
  enabledInvariants: [
    'NON_NEGATIVE_BALANCE',
    'SYSTEM_CONSERVATION',
    'ATTRIBUTION_IMMUTABILITY',
  ],
  failFast: true,
  includeWarnings: false,
  maxScanEntries: 10000,
};
