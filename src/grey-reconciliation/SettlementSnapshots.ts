/**
 * SettlementSnapshots.ts
 * Phase A1 - Grey Flow Reconciliation & Periodic Settlement
 *
 * IMMUTABLE SETTLEMENT SNAPSHOTS
 *
 * This module provides immutable snapshot objects for settlement.
 * Snapshots are reproducible from inputs and hash-chained for audit trail.
 *
 * @external This module operates OUTSIDE the frozen engine.
 * @readonly This module NEVER mutates any state.
 * @deterministic Same inputs always produce same outputs.
 * @immutable All snapshots are frozen after creation.
 */

import {
  GreyFlowId,
  GreyPartyId,
  GreyPartyType,
} from '../grey-runtime';

import {
  ReconciliationPeriod,
  ReconciliationPeriodId,
  SettlementSnapshotId,
  SettlementBucket,
  ReconciliationStatus,
  FlowSummary,
  SettlementTotal,
  Discrepancy,
  ReconciliationResult,
  ReconciliationError,
  ReconciliationErrorCode,
  reconciliationSuccess,
  reconciliationFailure,
  createReconciliationError,
  createSettlementSnapshotId,
} from './ReconciliationTypes';

import {
  PeriodReconciliationResult,
  calculateReconciliationChecksum,
} from './GreyReconciliationEngine';

// ============================================================================
// SETTLEMENT SNAPSHOT
// ============================================================================

/**
 * An immutable settlement snapshot for a party within a period.
 * Snapshots are reproducible from inputs and hash-chained.
 */
export interface SettlementSnapshot {
  /** Unique snapshot identifier */
  readonly snapshotId: SettlementSnapshotId;

  /** Period this snapshot covers */
  readonly period: ReconciliationPeriod;

  /** Party this snapshot is for */
  readonly partyId: GreyPartyId;
  readonly partyType: GreyPartyType;

  /** Settlement bucket */
  readonly bucket: SettlementBucket;

  /** Flow summary for this party */
  readonly flowSummary: FlowSummary;

  /** Settlement total (aggregated) */
  readonly settlementTotal: SettlementTotal;

  /** Status of this snapshot */
  readonly status: ReconciliationStatus;

  /** Any discrepancies related to this party */
  readonly discrepancies: readonly Discrepancy[];

  /** Timestamp when snapshot was created (injected) */
  readonly createdTimestamp: number;

  /** Hash of previous snapshot in chain (for audit trail) */
  readonly previousSnapshotHash: string;

  /** Checksum of this snapshot (deterministic) */
  readonly checksum: string;
}

/**
 * Genesis hash for the first snapshot in a chain.
 */
export const SNAPSHOT_GENESIS_HASH = '00000000' as const;

// ============================================================================
// SNAPSHOT CREATION
// ============================================================================

/**
 * Input for creating a settlement snapshot.
 */
export interface SettlementSnapshotInput {
  readonly snapshotId: SettlementSnapshotId;
  readonly period: ReconciliationPeriod;
  readonly partyId: GreyPartyId;
  readonly partyType: GreyPartyType;
  readonly bucket: SettlementBucket;
  readonly flowSummary: FlowSummary;
  readonly settlementTotal: SettlementTotal;
  readonly status: ReconciliationStatus;
  readonly discrepancies: readonly Discrepancy[];
  readonly createdTimestamp: number;
  readonly previousSnapshotHash: string;
}

/**
 * Create an immutable settlement snapshot.
 * Pure function - deterministic output from inputs.
 */
export function createSettlementSnapshot(
  input: SettlementSnapshotInput
): ReconciliationResult<SettlementSnapshot> {
  // Validate timestamp
  if (!Number.isInteger(input.createdTimestamp) || input.createdTimestamp <= 0) {
    return reconciliationFailure(
      createReconciliationError(
        ReconciliationErrorCode.INVALID_TIMESTAMP,
        `createdTimestamp must be a positive integer, got: ${input.createdTimestamp}`,
        { createdTimestamp: input.createdTimestamp }
      )
    );
  }

  // Build snapshot data (without checksum)
  const snapshotData = {
    snapshotId: input.snapshotId,
    period: input.period,
    partyId: input.partyId,
    partyType: input.partyType,
    bucket: input.bucket,
    flowSummary: input.flowSummary,
    settlementTotal: input.settlementTotal,
    status: input.status,
    discrepancies: input.discrepancies,
    createdTimestamp: input.createdTimestamp,
    previousSnapshotHash: input.previousSnapshotHash,
  };

  // Calculate checksum
  const checksum = calculateReconciliationChecksum(snapshotData);

  // Create frozen snapshot
  const snapshot: SettlementSnapshot = Object.freeze({
    ...snapshotData,
    checksum,
  });

  return reconciliationSuccess(snapshot);
}

// ============================================================================
// SNAPSHOT FROM RECONCILIATION
// ============================================================================

/**
 * Create snapshots from a reconciliation result.
 * Creates one snapshot per party in the result.
 *
 * @param reconciliationResult - Result from reconcilePeriod
 * @param createdTimestamp - Injected timestamp
 * @param previousSnapshotHash - Hash of previous snapshot (or GENESIS)
 * @returns Array of settlement snapshots
 */
export function createSnapshotsFromReconciliation(
  reconciliationResult: PeriodReconciliationResult,
  createdTimestamp: number,
  previousSnapshotHash: string = SNAPSHOT_GENESIS_HASH
): ReconciliationResult<readonly SettlementSnapshot[]> {
  const snapshots: SettlementSnapshot[] = [];
  let currentHash = previousSnapshotHash;
  let snapshotIndex = 0;

  // Create platform snapshot if present
  if (reconciliationResult.platformSummary) {
    const platformTotal = reconciliationResult.settlementTotals.find(
      (t) => t.bucket === SettlementBucket.PLATFORM
    );

    if (platformTotal) {
      const platformDiscrepancies = reconciliationResult.discrepancies.filter(
        (d) => d.affectedFlowIds.some(
          (fid) => reconciliationResult.platformSummary!.flowIds.includes(fid)
        )
      );

      const snapshotResult = createSettlementSnapshot({
        snapshotId: createSettlementSnapshotId(
          `${reconciliationResult.period.periodId}-platform-${snapshotIndex++}`
        ),
        period: reconciliationResult.period,
        partyId: reconciliationResult.platformSummary.partyId,
        partyType: GreyPartyType.PLATFORM,
        bucket: SettlementBucket.PLATFORM,
        flowSummary: reconciliationResult.platformSummary,
        settlementTotal: platformTotal,
        status: reconciliationResult.status,
        discrepancies: platformDiscrepancies,
        createdTimestamp,
        previousSnapshotHash: currentHash,
      });

      if (!snapshotResult.success) {
        return reconciliationFailure(snapshotResult.error);
      }

      snapshots.push(snapshotResult.value);
      currentHash = snapshotResult.value.checksum;
    }
  }

  // Create club snapshots
  const clubTotal = reconciliationResult.settlementTotals.find(
    (t) => t.bucket === SettlementBucket.CLUB
  );

  for (const clubSummary of reconciliationResult.clubSummaries) {
    const clubDiscrepancies = reconciliationResult.discrepancies.filter(
      (d) => d.affectedFlowIds.some((fid) => clubSummary.flowIds.includes(fid))
    );

    // Create per-party settlement total
    const partyTotal: SettlementTotal = Object.freeze({
      bucket: SettlementBucket.CLUB,
      periodId: reconciliationResult.period.periodId,
      totalRakeIn: clubSummary.totalIn,
      totalAdjustIn: 0, // Would need flow-level data to separate
      totalAdjustOut: clubSummary.totalOut,
      netSettlement: clubSummary.netReference,
      partyCount: 1,
      flowCount: clubSummary.recordCount,
    });

    const snapshotResult = createSettlementSnapshot({
      snapshotId: createSettlementSnapshotId(
        `${reconciliationResult.period.periodId}-club-${clubSummary.partyId}-${snapshotIndex++}`
      ),
      period: reconciliationResult.period,
      partyId: clubSummary.partyId,
      partyType: GreyPartyType.CLUB,
      bucket: SettlementBucket.CLUB,
      flowSummary: clubSummary,
      settlementTotal: partyTotal,
      status: reconciliationResult.status,
      discrepancies: clubDiscrepancies,
      createdTimestamp,
      previousSnapshotHash: currentHash,
    });

    if (!snapshotResult.success) {
      return reconciliationFailure(snapshotResult.error);
    }

    snapshots.push(snapshotResult.value);
    currentHash = snapshotResult.value.checksum;
  }

  // Create agent snapshots
  for (const agentSummary of reconciliationResult.agentSummaries) {
    const agentDiscrepancies = reconciliationResult.discrepancies.filter(
      (d) => d.affectedFlowIds.some((fid) => agentSummary.flowIds.includes(fid))
    );

    // Create per-party settlement total
    const partyTotal: SettlementTotal = Object.freeze({
      bucket: SettlementBucket.AGENT,
      periodId: reconciliationResult.period.periodId,
      totalRakeIn: agentSummary.totalIn,
      totalAdjustIn: 0,
      totalAdjustOut: agentSummary.totalOut,
      netSettlement: agentSummary.netReference,
      partyCount: 1,
      flowCount: agentSummary.recordCount,
    });

    const snapshotResult = createSettlementSnapshot({
      snapshotId: createSettlementSnapshotId(
        `${reconciliationResult.period.periodId}-agent-${agentSummary.partyId}-${snapshotIndex++}`
      ),
      period: reconciliationResult.period,
      partyId: agentSummary.partyId,
      partyType: GreyPartyType.AGENT,
      bucket: SettlementBucket.AGENT,
      flowSummary: agentSummary,
      settlementTotal: partyTotal,
      status: reconciliationResult.status,
      discrepancies: agentDiscrepancies,
      createdTimestamp,
      previousSnapshotHash: currentHash,
    });

    if (!snapshotResult.success) {
      return reconciliationFailure(snapshotResult.error);
    }

    snapshots.push(snapshotResult.value);
    currentHash = snapshotResult.value.checksum;
  }

  return reconciliationSuccess(Object.freeze(snapshots));
}

// ============================================================================
// SNAPSHOT VERIFICATION
// ============================================================================

/**
 * Verify a snapshot's checksum.
 */
export function verifySnapshotChecksum(snapshot: SettlementSnapshot): boolean {
  const snapshotData = {
    snapshotId: snapshot.snapshotId,
    period: snapshot.period,
    partyId: snapshot.partyId,
    partyType: snapshot.partyType,
    bucket: snapshot.bucket,
    flowSummary: snapshot.flowSummary,
    settlementTotal: snapshot.settlementTotal,
    status: snapshot.status,
    discrepancies: snapshot.discrepancies,
    createdTimestamp: snapshot.createdTimestamp,
    previousSnapshotHash: snapshot.previousSnapshotHash,
  };

  const expectedChecksum = calculateReconciliationChecksum(snapshotData);
  return snapshot.checksum === expectedChecksum;
}

/**
 * Verify chain integrity between two snapshots.
 */
export function verifySnapshotChainIntegrity(
  current: SettlementSnapshot,
  previous: SettlementSnapshot
): boolean {
  return current.previousSnapshotHash === previous.checksum;
}

/**
 * Verify an entire snapshot chain.
 */
export function verifySnapshotChain(
  snapshots: readonly SettlementSnapshot[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (snapshots.length === 0) {
    return { valid: true, errors: [] };
  }

  // First snapshot should have genesis hash
  if (snapshots[0].previousSnapshotHash !== SNAPSHOT_GENESIS_HASH) {
    errors.push(
      `First snapshot ${snapshots[0].snapshotId} should have genesis hash`
    );
  }

  // Verify each snapshot
  for (let i = 0; i < snapshots.length; i++) {
    const snapshot = snapshots[i];

    // Verify checksum
    if (!verifySnapshotChecksum(snapshot)) {
      errors.push(`Snapshot ${snapshot.snapshotId} has invalid checksum`);
    }

    // Verify chain (except first)
    if (i > 0) {
      if (snapshot.previousSnapshotHash !== snapshots[i - 1].checksum) {
        errors.push(
          `Snapshot ${snapshot.snapshotId} has broken chain link`
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// SNAPSHOT COMPARISON
// ============================================================================

/**
 * Compare two snapshots for equivalence.
 */
export function compareSnapshots(
  snapshot1: SettlementSnapshot,
  snapshot2: SettlementSnapshot
): boolean {
  return snapshot1.checksum === snapshot2.checksum;
}

/**
 * Snapshot difference report.
 */
export interface SnapshotDifference {
  readonly field: string;
  readonly snapshot1Value: unknown;
  readonly snapshot2Value: unknown;
}

/**
 * Get differences between two snapshots.
 */
export function getSnapshotDifferences(
  snapshot1: SettlementSnapshot,
  snapshot2: SettlementSnapshot
): readonly SnapshotDifference[] {
  const differences: SnapshotDifference[] = [];

  if (snapshot1.partyId !== snapshot2.partyId) {
    differences.push({
      field: 'partyId',
      snapshot1Value: snapshot1.partyId,
      snapshot2Value: snapshot2.partyId,
    });
  }

  if (snapshot1.partyType !== snapshot2.partyType) {
    differences.push({
      field: 'partyType',
      snapshot1Value: snapshot1.partyType,
      snapshot2Value: snapshot2.partyType,
    });
  }

  if (snapshot1.status !== snapshot2.status) {
    differences.push({
      field: 'status',
      snapshot1Value: snapshot1.status,
      snapshot2Value: snapshot2.status,
    });
  }

  if (snapshot1.flowSummary.totalIn !== snapshot2.flowSummary.totalIn) {
    differences.push({
      field: 'flowSummary.totalIn',
      snapshot1Value: snapshot1.flowSummary.totalIn,
      snapshot2Value: snapshot2.flowSummary.totalIn,
    });
  }

  if (snapshot1.flowSummary.totalOut !== snapshot2.flowSummary.totalOut) {
    differences.push({
      field: 'flowSummary.totalOut',
      snapshot1Value: snapshot1.flowSummary.totalOut,
      snapshot2Value: snapshot2.flowSummary.totalOut,
    });
  }

  if (snapshot1.flowSummary.netReference !== snapshot2.flowSummary.netReference) {
    differences.push({
      field: 'flowSummary.netReference',
      snapshot1Value: snapshot1.flowSummary.netReference,
      snapshot2Value: snapshot2.flowSummary.netReference,
    });
  }

  if (snapshot1.settlementTotal.netSettlement !== snapshot2.settlementTotal.netSettlement) {
    differences.push({
      field: 'settlementTotal.netSettlement',
      snapshot1Value: snapshot1.settlementTotal.netSettlement,
      snapshot2Value: snapshot2.settlementTotal.netSettlement,
    });
  }

  return Object.freeze(differences);
}

// ============================================================================
// SNAPSHOT REGISTRY (Read-Only Collector)
// ============================================================================

/**
 * Read-only snapshot collection result.
 */
export interface SnapshotCollection {
  readonly snapshots: readonly SettlementSnapshot[];
  readonly byPeriod: Readonly<Record<string, readonly SettlementSnapshot[]>>;
  readonly byParty: Readonly<Record<string, readonly SettlementSnapshot[]>>;
  readonly byBucket: Readonly<Record<SettlementBucket, readonly SettlementSnapshot[]>>;
  readonly totalCount: number;
  readonly chainValid: boolean;
}

/**
 * Create a snapshot collection from an array of snapshots.
 * This is a read-only view, not a mutable registry.
 */
export function createSnapshotCollection(
  snapshots: readonly SettlementSnapshot[]
): SnapshotCollection {
  // Group by period
  const byPeriod: Record<string, SettlementSnapshot[]> = {};
  for (const snapshot of snapshots) {
    const periodId = snapshot.period.periodId;
    if (!byPeriod[periodId]) {
      byPeriod[periodId] = [];
    }
    byPeriod[periodId].push(snapshot);
  }

  // Group by party
  const byParty: Record<string, SettlementSnapshot[]> = {};
  for (const snapshot of snapshots) {
    const partyId = snapshot.partyId;
    if (!byParty[partyId]) {
      byParty[partyId] = [];
    }
    byParty[partyId].push(snapshot);
  }

  // Group by bucket
  const byBucket: Record<string, SettlementSnapshot[]> = {
    [SettlementBucket.PLATFORM]: [],
    [SettlementBucket.CLUB]: [],
    [SettlementBucket.AGENT]: [],
  };
  for (const snapshot of snapshots) {
    byBucket[snapshot.bucket].push(snapshot);
  }

  // Verify chain
  const chainResult = verifySnapshotChain(snapshots);

  return Object.freeze({
    snapshots: Object.freeze([...snapshots]),
    byPeriod: Object.freeze(
      Object.fromEntries(
        Object.entries(byPeriod).map(([k, v]) => [k, Object.freeze(v)])
      )
    ),
    byParty: Object.freeze(
      Object.fromEntries(
        Object.entries(byParty).map(([k, v]) => [k, Object.freeze(v)])
      )
    ),
    byBucket: Object.freeze(
      Object.fromEntries(
        Object.entries(byBucket).map(([k, v]) => [k, Object.freeze(v)])
      )
    ) as Readonly<Record<SettlementBucket, readonly SettlementSnapshot[]>>,
    totalCount: snapshots.length,
    chainValid: chainResult.valid,
  });
}
