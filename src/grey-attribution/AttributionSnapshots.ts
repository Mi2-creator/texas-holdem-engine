/**
 * AttributionSnapshots.ts
 * Phase A2 - Grey Flow Multi-Level Attribution
 *
 * IMMUTABLE, HASH-CHAINED ATTRIBUTION SNAPSHOTS
 *
 * This module provides immutable snapshots of attribution results.
 * Snapshots are hash-chained for integrity verification.
 *
 * @external This module operates OUTSIDE the frozen engine.
 * @readonly This module NEVER mutates any state.
 * @deterministic Same inputs always produce same outputs.
 */

import { GreyFlowId, GreyPartyId } from '../grey-runtime';
import { ReconciliationPeriodId } from '../grey-reconciliation';

import {
  AttributionSnapshotId,
  AttributionRuleSetId,
  AgentHierarchyId,
  AttributionEntry,
  AttributionPartyType,
  PeriodAttributionResult,
  AttributionResult,
  AttributionErrorCode,
  attributionSuccess,
  attributionFailure,
  createAttributionError,
  createAttributionSnapshotId,
  isValidInteger,
  isValidPositiveInteger,
} from './AttributionTypes';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Genesis hash for first snapshot in chain.
 */
export const ATTRIBUTION_SNAPSHOT_GENESIS_HASH = '00000000' as const;

// ============================================================================
// SNAPSHOT TYPES
// ============================================================================

/**
 * Summary of attributed amounts by party type.
 */
export interface PartyTypeSummary {
  readonly partyType: AttributionPartyType;
  readonly totalAmount: number;
  readonly partyCount: number;
  readonly entryCount: number;
}

/**
 * Summary of attributed amounts by party.
 */
export interface PartySummary {
  readonly partyId: GreyPartyId;
  readonly partyType: AttributionPartyType;
  readonly totalAmount: number;
  readonly entryCount: number;
  readonly sourceFlowIds: readonly GreyFlowId[];
}

/**
 * Immutable attribution snapshot.
 * One snapshot per (period, ruleSet) combination.
 */
export interface AttributionSnapshot {
  readonly snapshotId: AttributionSnapshotId;
  readonly periodId: ReconciliationPeriodId;
  readonly ruleSetId: AttributionRuleSetId;
  /** Optional agent hierarchy used */
  readonly agentHierarchyId?: AgentHierarchyId;
  /** Hash of previous snapshot in chain */
  readonly previousHash: string;
  /** Timestamp when snapshot was created (explicit input) */
  readonly createdAt: number;

  // Attribution totals
  readonly totalOriginal: number;
  readonly totalAttributed: number;
  readonly flowCount: number;
  readonly entryCount: number;

  // Summaries
  readonly partyTypeSummaries: readonly PartyTypeSummary[];
  readonly partySummaries: readonly PartySummary[];

  // All entries (flat, no nesting)
  readonly entries: readonly AttributionEntry[];

  // Verification
  readonly checksum: string;
}

/**
 * Input for creating a snapshot.
 */
export interface AttributionSnapshotInput {
  readonly snapshotId: AttributionSnapshotId;
  readonly periodId: ReconciliationPeriodId;
  readonly ruleSetId: AttributionRuleSetId;
  readonly agentHierarchyId?: AgentHierarchyId;
  readonly previousHash: string;
  readonly createdAt: number;
  readonly attributionResult: PeriodAttributionResult;
}

// ============================================================================
// CHECKSUM CALCULATION
// ============================================================================

/**
 * Serialize data for checksum calculation.
 */
function serializeForChecksum(data: unknown): string {
  if (data === null || data === undefined) {
    return 'null';
  }

  if (typeof data === 'string') {
    return `"${data}"`;
  }

  if (typeof data === 'number' || typeof data === 'boolean') {
    return String(data);
  }

  if (Array.isArray(data)) {
    const items = data.map(serializeForChecksum);
    return `[${items.join(',')}]`;
  }

  if (typeof data === 'object') {
    const keys = Object.keys(data).sort();
    const pairs = keys.map(
      (key) => `"${key}":${serializeForChecksum((data as Record<string, unknown>)[key])}`
    );
    return `{${pairs.join(',')}}`;
  }

  return String(data);
}

/**
 * Simple deterministic hash function.
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Calculate snapshot checksum.
 */
export function calculateSnapshotChecksum(
  snapshotId: AttributionSnapshotId,
  periodId: ReconciliationPeriodId,
  ruleSetId: AttributionRuleSetId,
  previousHash: string,
  createdAt: number,
  totalOriginal: number,
  totalAttributed: number,
  flowCount: number,
  entryCount: number,
  entries: readonly AttributionEntry[]
): string {
  const data = {
    snapshotId,
    periodId,
    ruleSetId,
    previousHash,
    createdAt,
    totalOriginal,
    totalAttributed,
    flowCount,
    entryCount,
    entryChecksums: entries.map((e) => `${e.entryId}:${e.amount}`),
  };

  return `snap_${simpleHash(serializeForChecksum(data))}`;
}

// ============================================================================
// SNAPSHOT CREATION
// ============================================================================

/**
 * Create summary by party type.
 */
function createPartyTypeSummaries(
  entries: readonly AttributionEntry[]
): readonly PartyTypeSummary[] {
  const byType = new Map<AttributionPartyType, { amount: number; parties: Set<string>; count: number }>();

  for (const entry of entries) {
    const existing = byType.get(entry.partyType) || {
      amount: 0,
      parties: new Set<string>(),
      count: 0,
    };
    existing.amount += entry.amount;
    existing.parties.add(entry.partyId as string);
    existing.count++;
    byType.set(entry.partyType, existing);
  }

  const summaries: PartyTypeSummary[] = [];
  for (const [partyType, data] of byType.entries()) {
    summaries.push(
      Object.freeze({
        partyType,
        totalAmount: data.amount,
        partyCount: data.parties.size,
        entryCount: data.count,
      })
    );
  }

  // Sort by party type for determinism
  summaries.sort((a, b) => a.partyType.localeCompare(b.partyType));

  return Object.freeze(summaries);
}

/**
 * Create summary by party.
 */
function createPartySummaries(
  entries: readonly AttributionEntry[]
): readonly PartySummary[] {
  const byParty = new Map<string, {
    partyId: GreyPartyId;
    partyType: AttributionPartyType;
    amount: number;
    count: number;
    flowIds: Set<string>;
  }>();

  for (const entry of entries) {
    const key = entry.partyId as string;
    const existing = byParty.get(key) || {
      partyId: entry.partyId,
      partyType: entry.partyType,
      amount: 0,
      count: 0,
      flowIds: new Set<string>(),
    };
    existing.amount += entry.amount;
    existing.count++;
    existing.flowIds.add(entry.sourceGreyFlowId as string);
    byParty.set(key, existing);
  }

  const summaries: PartySummary[] = [];
  for (const [_, data] of byParty.entries()) {
    summaries.push(
      Object.freeze({
        partyId: data.partyId,
        partyType: data.partyType,
        totalAmount: data.amount,
        entryCount: data.count,
        sourceFlowIds: Object.freeze(Array.from(data.flowIds) as GreyFlowId[]),
      })
    );
  }

  // Sort by party ID for determinism
  summaries.sort((a, b) => (a.partyId as string).localeCompare(b.partyId as string));

  return Object.freeze(summaries);
}

/**
 * Create an attribution snapshot from attribution result.
 *
 * @param input - Snapshot input
 * @returns Result containing the snapshot or error
 */
export function createAttributionSnapshot(
  input: AttributionSnapshotInput
): AttributionResult<AttributionSnapshot> {
  const {
    snapshotId,
    periodId,
    ruleSetId,
    agentHierarchyId,
    previousHash,
    createdAt,
    attributionResult,
  } = input;

  // Validate createdAt
  if (!isValidPositiveInteger(createdAt)) {
    return attributionFailure(
      createAttributionError(
        AttributionErrorCode.INVALID_PERIOD,
        `createdAt must be a positive integer, got: ${createdAt}`,
        { createdAt }
      )
    );
  }

  // Flatten all entries from flow results
  const allEntries: AttributionEntry[] = [];
  for (const flowResult of attributionResult.flowResults) {
    for (const entry of flowResult.entries) {
      allEntries.push(entry);
    }
  }

  // Create summaries
  const partyTypeSummaries = createPartyTypeSummaries(allEntries);
  const partySummaries = createPartySummaries(allEntries);

  // Calculate checksum
  const checksum = calculateSnapshotChecksum(
    snapshotId,
    periodId,
    ruleSetId,
    previousHash,
    createdAt,
    attributionResult.totalOriginal,
    attributionResult.totalAttributed,
    attributionResult.flowCount,
    allEntries.length,
    allEntries
  );

  return attributionSuccess(
    Object.freeze({
      snapshotId,
      periodId,
      ruleSetId,
      agentHierarchyId,
      previousHash,
      createdAt,
      totalOriginal: attributionResult.totalOriginal,
      totalAttributed: attributionResult.totalAttributed,
      flowCount: attributionResult.flowCount,
      entryCount: allEntries.length,
      partyTypeSummaries,
      partySummaries,
      entries: Object.freeze(allEntries),
      checksum,
    })
  );
}

/**
 * Create snapshot from period attribution result.
 *
 * @param attributionResult - Period attribution result
 * @param previousHash - Hash of previous snapshot (or genesis)
 * @param createdAt - Timestamp (explicit input)
 * @param agentHierarchyId - Optional agent hierarchy ID
 * @returns Result containing the snapshot
 */
export function createSnapshotFromAttribution(
  attributionResult: PeriodAttributionResult,
  previousHash: string,
  createdAt: number,
  agentHierarchyId?: AgentHierarchyId
): AttributionResult<AttributionSnapshot> {
  const snapshotId = createAttributionSnapshotId(
    `snap_${attributionResult.periodId}_${attributionResult.ruleSetId}_${createdAt}`
  );

  return createAttributionSnapshot({
    snapshotId,
    periodId: attributionResult.periodId,
    ruleSetId: attributionResult.ruleSetId,
    agentHierarchyId,
    previousHash,
    createdAt,
    attributionResult,
  });
}

// ============================================================================
// SNAPSHOT VERIFICATION
// ============================================================================

/**
 * Verify a snapshot's checksum.
 */
export function verifySnapshotChecksum(snapshot: AttributionSnapshot): boolean {
  const expectedChecksum = calculateSnapshotChecksum(
    snapshot.snapshotId,
    snapshot.periodId,
    snapshot.ruleSetId,
    snapshot.previousHash,
    snapshot.createdAt,
    snapshot.totalOriginal,
    snapshot.totalAttributed,
    snapshot.flowCount,
    snapshot.entryCount,
    snapshot.entries
  );

  return snapshot.checksum === expectedChecksum;
}

/**
 * Verify a chain of snapshots.
 */
export function verifySnapshotChain(
  snapshots: readonly AttributionSnapshot[]
): AttributionResult<void> {
  if (snapshots.length === 0) {
    return attributionSuccess(undefined);
  }

  // First snapshot must have genesis hash
  if (snapshots[0].previousHash !== ATTRIBUTION_SNAPSHOT_GENESIS_HASH) {
    return attributionFailure(
      createAttributionError(
        AttributionErrorCode.CHECKSUM_MISMATCH,
        `First snapshot must have genesis hash`,
        { expectedHash: ATTRIBUTION_SNAPSHOT_GENESIS_HASH, actualHash: snapshots[0].previousHash }
      )
    );
  }

  // Verify each snapshot's checksum
  for (let i = 0; i < snapshots.length; i++) {
    if (!verifySnapshotChecksum(snapshots[i])) {
      return attributionFailure(
        createAttributionError(
          AttributionErrorCode.CHECKSUM_MISMATCH,
          `Snapshot ${i} checksum verification failed`,
          { snapshotId: snapshots[i].snapshotId, index: i }
        )
      );
    }

    // Verify chain linkage (except first)
    if (i > 0) {
      if (snapshots[i].previousHash !== snapshots[i - 1].checksum) {
        return attributionFailure(
          createAttributionError(
            AttributionErrorCode.CHECKSUM_MISMATCH,
            `Snapshot chain broken at index ${i}`,
            {
              snapshotId: snapshots[i].snapshotId,
              expectedPreviousHash: snapshots[i - 1].checksum,
              actualPreviousHash: snapshots[i].previousHash,
            }
          )
        );
      }
    }
  }

  return attributionSuccess(undefined);
}

// ============================================================================
// SNAPSHOT COMPARISON
// ============================================================================

/**
 * Difference between two snapshots.
 */
export interface SnapshotDifference {
  readonly field: string;
  readonly snapshot1Value: unknown;
  readonly snapshot2Value: unknown;
}

/**
 * Compare two snapshots.
 */
export function compareSnapshots(
  snapshot1: AttributionSnapshot,
  snapshot2: AttributionSnapshot
): readonly SnapshotDifference[] {
  const differences: SnapshotDifference[] = [];

  // Compare key fields
  const fieldsToCompare: (keyof AttributionSnapshot)[] = [
    'periodId',
    'ruleSetId',
    'totalOriginal',
    'totalAttributed',
    'flowCount',
    'entryCount',
  ];

  for (const field of fieldsToCompare) {
    if (snapshot1[field] !== snapshot2[field]) {
      differences.push(
        Object.freeze({
          field,
          snapshot1Value: snapshot1[field],
          snapshot2Value: snapshot2[field],
        })
      );
    }
  }

  return Object.freeze(differences);
}

/**
 * Check if two snapshots are equivalent (same checksum).
 */
export function snapshotsAreEquivalent(
  snapshot1: AttributionSnapshot,
  snapshot2: AttributionSnapshot
): boolean {
  // Note: checksums include previousHash, so we compare content separately
  return (
    snapshot1.periodId === snapshot2.periodId &&
    snapshot1.ruleSetId === snapshot2.ruleSetId &&
    snapshot1.totalOriginal === snapshot2.totalOriginal &&
    snapshot1.totalAttributed === snapshot2.totalAttributed &&
    snapshot1.flowCount === snapshot2.flowCount &&
    snapshot1.entryCount === snapshot2.entryCount
  );
}

// ============================================================================
// SNAPSHOT COLLECTION
// ============================================================================

/**
 * A collection of snapshots forming a chain.
 */
export interface SnapshotCollection {
  readonly snapshots: readonly AttributionSnapshot[];
  readonly latestChecksum: string;
  readonly totalSnapshots: number;
  readonly isValid: boolean;
}

/**
 * Create a snapshot collection.
 */
export function createSnapshotCollection(
  snapshots: readonly AttributionSnapshot[]
): SnapshotCollection {
  const verification = verifySnapshotChain(snapshots);

  return Object.freeze({
    snapshots: Object.freeze([...snapshots]),
    latestChecksum: snapshots.length > 0 ? snapshots[snapshots.length - 1].checksum : ATTRIBUTION_SNAPSHOT_GENESIS_HASH,
    totalSnapshots: snapshots.length,
    isValid: verification.success,
  });
}

/**
 * Append a snapshot to a collection.
 */
export function appendToCollection(
  collection: SnapshotCollection,
  snapshot: AttributionSnapshot
): AttributionResult<SnapshotCollection> {
  // Verify the new snapshot chains correctly
  if (snapshot.previousHash !== collection.latestChecksum) {
    return attributionFailure(
      createAttributionError(
        AttributionErrorCode.CHECKSUM_MISMATCH,
        `Snapshot previousHash doesn't match collection's latest checksum`,
        {
          expectedHash: collection.latestChecksum,
          actualHash: snapshot.previousHash,
        }
      )
    );
  }

  // Verify snapshot checksum
  if (!verifySnapshotChecksum(snapshot)) {
    return attributionFailure(
      createAttributionError(
        AttributionErrorCode.CHECKSUM_MISMATCH,
        `Snapshot checksum verification failed`,
        { snapshotId: snapshot.snapshotId }
      )
    );
  }

  const newSnapshots = [...collection.snapshots, snapshot];

  return attributionSuccess(
    Object.freeze({
      snapshots: Object.freeze(newSnapshots),
      latestChecksum: snapshot.checksum,
      totalSnapshots: newSnapshots.length,
      isValid: true,
    })
  );
}
