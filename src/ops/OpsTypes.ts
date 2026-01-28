/**
 * OpsTypes.ts
 * Phase 31 - Production Observability, Audit & Deterministic Ops (READ-ONLY)
 *
 * Core branded IDs and view models for ops layer.
 *
 * DESIGN PRINCIPLES:
 * - All types are read-only
 * - All outputs derivable from existing data
 * - Deterministic: same input → same output
 * - No side effects, no mutation
 *
 * ABSOLUTE CONSTRAINTS:
 * - NO payment / wallet / crypto / transfer terminology
 * - NO timers that affect game flow
 * - NO background mutation jobs
 */

import { PlayerId } from '../security/Identity';
import { TableId, HandId } from '../security/AuditLog';
import { ClubId } from '../club/ClubTypes';

// ============================================================================
// Branded Types
// ============================================================================

/**
 * Unique identifier for an ops snapshot
 */
export type OpsSnapshotId = string & { readonly __brand: 'OpsSnapshotId' };

/**
 * Unique identifier for a verification run
 */
export type VerificationId = string & { readonly __brand: 'VerificationId' };

// ============================================================================
// ID Generation (Deterministic)
// ============================================================================

let opsSnapshotCounter = 0;
let verificationCounter = 0;

/**
 * Generate a deterministic ops snapshot ID
 */
export function generateOpsSnapshotId(timestamp: number): OpsSnapshotId {
  return `ops_snapshot_${timestamp}_${++opsSnapshotCounter}` as OpsSnapshotId;
}

/**
 * Generate a deterministic verification ID
 */
export function generateVerificationId(timestamp: number): VerificationId {
  return `verification_${timestamp}_${++verificationCounter}` as VerificationId;
}

/**
 * Reset counters (for testing only)
 */
export function resetOpsCounters(): void {
  opsSnapshotCounter = 0;
  verificationCounter = 0;
}

// ============================================================================
// Ops Scope
// ============================================================================

/**
 * Scope levels for ops queries
 */
export type OpsScope =
  | 'PLATFORM'
  | 'CLUB'
  | 'TABLE'
  | 'HAND'
  | 'PLAYER';

/**
 * Scoped entity reference
 */
export interface OpsScopedEntity {
  readonly scope: OpsScope;
  readonly platformId?: string;
  readonly clubId?: ClubId;
  readonly tableId?: TableId;
  readonly handId?: HandId;
  readonly playerId?: PlayerId;
}

// ============================================================================
// Severity Levels
// ============================================================================

/**
 * Severity levels for ops alerts
 */
export type OpsSeverity = 'INFO' | 'WARN' | 'CRITICAL';

/**
 * Ops alert/issue
 */
export interface OpsIssue {
  readonly severity: OpsSeverity;
  readonly code: string;
  readonly message: string;
  readonly scope: OpsScopedEntity;
  readonly timestamp: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

// ============================================================================
// Time Range
// ============================================================================

/**
 * Time range for ops queries
 */
export interface OpsTimeRange {
  readonly fromTimestamp: number;
  readonly toTimestamp: number;
}

/**
 * Create a time range for the last N minutes
 */
export function createLastMinutesRange(minutes: number, now: number = Date.now()): OpsTimeRange {
  return {
    fromTimestamp: now - minutes * 60 * 1000,
    toTimestamp: now,
  };
}

/**
 * Create a time range for the last N hours
 */
export function createLastHoursRange(hours: number, now: number = Date.now()): OpsTimeRange {
  return {
    fromTimestamp: now - hours * 60 * 60 * 1000,
    toTimestamp: now,
  };
}

/**
 * Check if timestamp is within range
 */
export function isInOpsTimeRange(timestamp: number, range: OpsTimeRange): boolean {
  return timestamp >= range.fromTimestamp && timestamp <= range.toTimestamp;
}

// ============================================================================
// Deterministic Cursor
// ============================================================================

/**
 * Deterministic cursor for pagination
 * Based on sequence numbers, not offsets
 */
export interface DeterministicCursor {
  readonly sequenceFrom: number;
  readonly sequenceTo: number;
  readonly limit: number;
}

/**
 * Create a cursor from sequence
 */
export function createCursor(from: number, limit: number): DeterministicCursor {
  return {
    sequenceFrom: from,
    sequenceTo: from + limit - 1,
    limit,
  };
}

/**
 * Paginated result
 */
export interface PaginatedResult<T> {
  readonly items: readonly T[];
  readonly cursor: DeterministicCursor;
  readonly hasMore: boolean;
  readonly totalCount: number;
}

// ============================================================================
// Replay Verification
// ============================================================================

/**
 * Verification status
 */
export type VerificationStatus = 'MATCH' | 'MISMATCH' | 'ERROR';

/**
 * Single field difference
 */
export interface FieldDiff {
  readonly fieldPath: string;
  readonly expected: unknown;
  readonly actual: unknown;
}

/**
 * Replay verification result
 */
export interface ReplayVerificationResult {
  readonly verificationId: VerificationId;
  readonly handId: HandId;
  readonly timestamp: number;
  readonly status: VerificationStatus;
  readonly stateVersionMatch: boolean;
  readonly ledgerHashMatch: boolean;
  readonly integrityChecksumMatch: boolean;
  readonly diffs: readonly FieldDiff[];
  readonly errorMessage?: string;
}

/**
 * Create a successful verification result
 */
export function createMatchResult(
  verificationId: VerificationId,
  handId: HandId,
  timestamp: number
): ReplayVerificationResult {
  return {
    verificationId,
    handId,
    timestamp,
    status: 'MATCH',
    stateVersionMatch: true,
    ledgerHashMatch: true,
    integrityChecksumMatch: true,
    diffs: [],
  };
}

/**
 * Create a mismatch verification result
 */
export function createMismatchResult(
  verificationId: VerificationId,
  handId: HandId,
  timestamp: number,
  diffs: readonly FieldDiff[],
  options: {
    stateVersionMatch?: boolean;
    ledgerHashMatch?: boolean;
    integrityChecksumMatch?: boolean;
  } = {}
): ReplayVerificationResult {
  return {
    verificationId,
    handId,
    timestamp,
    status: 'MISMATCH',
    stateVersionMatch: options.stateVersionMatch ?? true,
    ledgerHashMatch: options.ledgerHashMatch ?? true,
    integrityChecksumMatch: options.integrityChecksumMatch ?? true,
    diffs,
  };
}

/**
 * Create an error verification result
 */
export function createErrorResult(
  verificationId: VerificationId,
  handId: HandId,
  timestamp: number,
  errorMessage: string
): ReplayVerificationResult {
  return {
    verificationId,
    handId,
    timestamp,
    status: 'ERROR',
    stateVersionMatch: false,
    ledgerHashMatch: false,
    integrityChecksumMatch: false,
    diffs: [],
    errorMessage,
  };
}

// ============================================================================
// Health Status
// ============================================================================

/**
 * Overall health status
 */
export type HealthStatus = 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';

/**
 * Component health
 */
export interface ComponentHealth {
  readonly component: string;
  readonly status: HealthStatus;
  readonly message?: string;
  readonly lastCheck: number;
}

/**
 * Determine overall health from components
 */
export function deriveOverallHealth(components: readonly ComponentHealth[]): HealthStatus {
  if (components.length === 0) return 'HEALTHY';

  const hasUnhealthy = components.some(c => c.status === 'UNHEALTHY');
  if (hasUnhealthy) return 'UNHEALTHY';

  const hasDegraded = components.some(c => c.status === 'DEGRADED');
  if (hasDegraded) return 'DEGRADED';

  return 'HEALTHY';
}

// ============================================================================
// Audit Summary
// ============================================================================

/**
 * Audit summary for a time range
 */
export interface AuditSummary {
  readonly timeRange: OpsTimeRange;
  readonly totalEntries: number;
  readonly entriesBySource: Readonly<Record<string, number>>;
  readonly entriesByScope: Readonly<Record<OpsScope, number>>;
  readonly issueCount: number;
  readonly criticalIssueCount: number;
}

/**
 * Create empty audit summary
 */
export function emptyAuditSummary(timeRange: OpsTimeRange): AuditSummary {
  return {
    timeRange,
    totalEntries: 0,
    entriesBySource: {},
    entriesByScope: {
      PLATFORM: 0,
      CLUB: 0,
      TABLE: 0,
      HAND: 0,
      PLAYER: 0,
    },
    issueCount: 0,
    criticalIssueCount: 0,
  };
}

// ============================================================================
// Invariant Status
// ============================================================================

/**
 * Single invariant check result
 */
export interface InvariantCheck {
  readonly invariantName: string;
  readonly passed: boolean;
  readonly message: string;
  readonly scope: OpsScope;
  readonly entityId?: string;
}

/**
 * Overall invariant status
 */
export interface InvariantStatus {
  readonly timestamp: number;
  readonly allPassed: boolean;
  readonly checks: readonly InvariantCheck[];
  readonly failedCount: number;
  readonly passedCount: number;
}

/**
 * Create invariant status from checks
 */
export function createInvariantStatus(
  checks: readonly InvariantCheck[],
  timestamp: number = Date.now()
): InvariantStatus {
  const passedCount = checks.filter(c => c.passed).length;
  const failedCount = checks.length - passedCount;

  return {
    timestamp,
    allPassed: failedCount === 0,
    checks,
    failedCount,
    passedCount,
  };
}

// ============================================================================
// Sync Metrics (Derived)
// ============================================================================

/**
 * Sync lag metrics (derived from state, not measured)
 */
export interface SyncLagMetrics {
  readonly latestServerVersion: number;
  readonly oldestClientVersion: number;
  readonly maxLag: number;
  readonly clientCount: number;
  readonly lagDistribution: Readonly<Record<string, number>>;
}

/**
 * Create sync lag metrics
 */
export function createSyncLagMetrics(
  latestServerVersion: number,
  clientVersions: readonly number[]
): SyncLagMetrics {
  if (clientVersions.length === 0) {
    return {
      latestServerVersion,
      oldestClientVersion: latestServerVersion,
      maxLag: 0,
      clientCount: 0,
      lagDistribution: {},
    };
  }

  const oldestClientVersion = Math.min(...clientVersions);
  const maxLag = latestServerVersion - oldestClientVersion;

  // Calculate distribution
  const distribution: Record<string, number> = {};
  for (const version of clientVersions) {
    const lag = latestServerVersion - version;
    const bucket = lag === 0 ? '0' : lag <= 5 ? '1-5' : lag <= 10 ? '6-10' : '>10';
    distribution[bucket] = (distribution[bucket] ?? 0) + 1;
  }

  return {
    latestServerVersion,
    oldestClientVersion,
    maxLag,
    clientCount: clientVersions.length,
    lagDistribution: distribution,
  };
}

// ============================================================================
// Query Result Types
// ============================================================================

/**
 * Ops query result
 */
export interface OpsQueryResult<T> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: string;
  readonly timestamp: number;
}

/**
 * Create successful ops query result
 */
export function successOpsResult<T>(data: T, timestamp: number = Date.now()): OpsQueryResult<T> {
  return { success: true, data, timestamp };
}

/**
 * Create failed ops query result
 */
export function failOpsResult<T>(error: string, timestamp: number = Date.now()): OpsQueryResult<T> {
  return { success: false, error, timestamp };
}
