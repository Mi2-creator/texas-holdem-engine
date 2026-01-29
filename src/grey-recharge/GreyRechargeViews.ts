/**
 * GreyRechargeViews.ts
 * Phase A3 - Grey Recharge Reference Mapping
 *
 * READ-ONLY VIEWS OVER RECHARGE REFERENCES
 *
 * This module provides read-only aggregation views over recharge data.
 * All views include source traceability.
 *
 * @external This module operates OUTSIDE the frozen engine.
 * @readonly This module NEVER mutates any data.
 * @reference This module creates REFERENCES only, no value movement.
 * @deterministic Same inputs always produce same outputs.
 */

import { GreyFlowId, GreyPartyId, GreyPartyType } from '../grey-runtime';
import { ReconciliationPeriodId } from '../grey-reconciliation';

import {
  GreyRechargeId,
  GreyRechargeRecord,
  GreyRechargeSource,
  GreyRechargeStatus,
  RechargeLink,
  isValidTimestamp,
} from './GreyRechargeTypes';

import {
  GreyRechargeRegistry,
} from './GreyRechargeRegistry';

import {
  RechargeLinkRegistry,
} from './GreyRechargeReference';

// ============================================================================
// PERIOD SUMMARY
// ============================================================================

/**
 * Recharge summary for a time period.
 */
export interface RechargePeriodSummary {
  readonly startTimestamp: number;
  readonly endTimestamp: number;
  /** Total reference amount declared */
  readonly totalDeclared: number;
  /** Total reference amount confirmed */
  readonly totalConfirmed: number;
  /** Total reference amount voided */
  readonly totalVoided: number;
  /** Net reference (confirmed - voided) */
  readonly netReference: number;
  /** Count by status */
  readonly countByStatus: Readonly<Record<GreyRechargeStatus, number>>;
  /** Count by source */
  readonly countBySource: Readonly<Record<GreyRechargeSource, number>>;
  /** All recharge IDs in period */
  readonly rechargeIds: readonly GreyRechargeId[];
  /** Checksum for verification */
  readonly checksum: string;
}

/**
 * Get recharge summary for a time period.
 */
export function getRechargePeriodSummary(
  registry: GreyRechargeRegistry,
  startTimestamp: number,
  endTimestamp: number
): RechargePeriodSummary {
  const records = registry.getRecordsByTimeWindow(startTimestamp, endTimestamp);

  let totalDeclared = 0;
  let totalConfirmed = 0;
  let totalVoided = 0;

  const countByStatus: Record<string, number> = {
    [GreyRechargeStatus.DECLARED]: 0,
    [GreyRechargeStatus.CONFIRMED]: 0,
    [GreyRechargeStatus.VOIDED]: 0,
  };

  const countBySource: Record<string, number> = {
    [GreyRechargeSource.EXTERNAL]: 0,
    [GreyRechargeSource.MANUAL]: 0,
    [GreyRechargeSource.FUTURE]: 0,
  };

  const rechargeIds: GreyRechargeId[] = [];

  for (const record of records) {
    rechargeIds.push(record.rechargeId);
    countByStatus[record.status]++;
    countBySource[record.source]++;

    if (record.status === GreyRechargeStatus.DECLARED) {
      totalDeclared += record.referenceAmount;
    } else if (record.status === GreyRechargeStatus.CONFIRMED) {
      totalConfirmed += record.referenceAmount;
    } else if (record.status === GreyRechargeStatus.VOIDED) {
      totalVoided += record.referenceAmount;
    }
  }

  const checksum = calculateViewChecksum({
    type: 'periodSummary',
    startTimestamp,
    endTimestamp,
    totalConfirmed,
    totalVoided,
    recordCount: records.length,
  });

  return Object.freeze({
    startTimestamp,
    endTimestamp,
    totalDeclared,
    totalConfirmed,
    totalVoided,
    netReference: totalConfirmed - totalVoided,
    countByStatus: Object.freeze(countByStatus) as Readonly<Record<GreyRechargeStatus, number>>,
    countBySource: Object.freeze(countBySource) as Readonly<Record<GreyRechargeSource, number>>,
    rechargeIds: Object.freeze(rechargeIds),
    checksum,
  });
}

// ============================================================================
// PARTY SUMMARY (Club/Player)
// ============================================================================

/**
 * Recharge summary for a party.
 */
export interface RechargePartySummary {
  readonly partyId: GreyPartyId;
  readonly startTimestamp: number;
  readonly endTimestamp: number;
  /** Total reference amount confirmed */
  readonly totalConfirmed: number;
  /** Total reference amount voided */
  readonly totalVoided: number;
  /** Net reference (confirmed - voided) */
  readonly netReference: number;
  /** Record count */
  readonly recordCount: number;
  /** All recharge IDs for this party */
  readonly rechargeIds: readonly GreyRechargeId[];
  /** Checksum for verification */
  readonly checksum: string;
}

/**
 * Get recharge summary for a specific party.
 */
export function getRechargePartySummary(
  registry: GreyRechargeRegistry,
  partyId: GreyPartyId,
  startTimestamp: number,
  endTimestamp: number
): RechargePartySummary {
  const allForParty = registry.getRecordsByParty(partyId);
  const records = allForParty.filter(
    (r) =>
      r.declaredTimestamp >= startTimestamp &&
      r.declaredTimestamp <= endTimestamp
  );

  let totalConfirmed = 0;
  let totalVoided = 0;
  const rechargeIds: GreyRechargeId[] = [];

  for (const record of records) {
    rechargeIds.push(record.rechargeId);

    if (record.status === GreyRechargeStatus.CONFIRMED) {
      totalConfirmed += record.referenceAmount;
    } else if (record.status === GreyRechargeStatus.VOIDED) {
      totalVoided += record.referenceAmount;
    }
  }

  const checksum = calculateViewChecksum({
    type: 'partySummary',
    partyId,
    startTimestamp,
    endTimestamp,
    totalConfirmed,
    recordCount: records.length,
  });

  return Object.freeze({
    partyId,
    startTimestamp,
    endTimestamp,
    totalConfirmed,
    totalVoided,
    netReference: totalConfirmed - totalVoided,
    recordCount: records.length,
    rechargeIds: Object.freeze(rechargeIds),
    checksum,
  });
}

/**
 * Get recharge summaries for all parties in a period.
 */
export function getAllPartySummaries(
  registry: GreyRechargeRegistry,
  startTimestamp: number,
  endTimestamp: number
): readonly RechargePartySummary[] {
  const records = registry.getRecordsByTimeWindow(startTimestamp, endTimestamp);

  // Group by party
  const byParty = new Map<string, GreyRechargeRecord[]>();
  for (const record of records) {
    const key = record.partyId as string;
    const existing = byParty.get(key) || [];
    existing.push(record);
    byParty.set(key, existing);
  }

  // Create summaries
  const summaries: RechargePartySummary[] = [];
  for (const [partyIdStr, partyRecords] of byParty.entries()) {
    const partyId = partyIdStr as GreyPartyId;

    let totalConfirmed = 0;
    let totalVoided = 0;
    const rechargeIds: GreyRechargeId[] = [];

    for (const record of partyRecords) {
      rechargeIds.push(record.rechargeId);

      if (record.status === GreyRechargeStatus.CONFIRMED) {
        totalConfirmed += record.referenceAmount;
      } else if (record.status === GreyRechargeStatus.VOIDED) {
        totalVoided += record.referenceAmount;
      }
    }

    const checksum = calculateViewChecksum({
      type: 'partySummary',
      partyId,
      startTimestamp,
      endTimestamp,
      totalConfirmed,
      recordCount: partyRecords.length,
    });

    summaries.push(
      Object.freeze({
        partyId,
        startTimestamp,
        endTimestamp,
        totalConfirmed,
        totalVoided,
        netReference: totalConfirmed - totalVoided,
        recordCount: partyRecords.length,
        rechargeIds: Object.freeze(rechargeIds),
        checksum,
      })
    );
  }

  // Sort by party ID for determinism
  summaries.sort((a, b) =>
    (a.partyId as string).localeCompare(b.partyId as string)
  );

  return Object.freeze(summaries);
}

// ============================================================================
// RECHARGE-TO-GREYFLOW TRACE VIEW
// ============================================================================

/**
 * Complete trace view from recharge to GreyFlow.
 */
export interface RechargeTraceView {
  readonly rechargeId: GreyRechargeId;
  readonly rechargeRecord: GreyRechargeRecord;
  readonly links: readonly RechargeLink[];
  readonly linkedFlowIds: readonly GreyFlowId[];
  readonly totalLinkedAmount: number;
  /** Percentage of recharge amount that is linked */
  readonly linkedPercentage: number;
  readonly checksum: string;
}

/**
 * Get trace view for a recharge.
 */
export function getRechargeTraceView(
  rechargeId: GreyRechargeId,
  rechargeRegistry: GreyRechargeRegistry,
  linkRegistry: RechargeLinkRegistry
): RechargeTraceView | null {
  const rechargeRecord = rechargeRegistry.getRecharge(rechargeId);
  if (!rechargeRecord) {
    return null;
  }

  const links = linkRegistry.getLinksByRecharge(rechargeId);

  // Collect unique flow IDs
  const flowIdSet = new Set<string>();
  let totalLinkedAmount = 0;
  for (const link of links) {
    for (const flowId of link.linkedFlowIds) {
      flowIdSet.add(flowId as string);
    }
    totalLinkedAmount += link.linkedReferenceTotal;
  }

  const linkedPercentage =
    rechargeRecord.referenceAmount > 0
      ? Math.floor((totalLinkedAmount * 10000) / rechargeRecord.referenceAmount)
      : 0;

  const checksum = calculateViewChecksum({
    type: 'rechargeTrace',
    rechargeId,
    linkCount: links.length,
    totalLinkedAmount,
  });

  return Object.freeze({
    rechargeId,
    rechargeRecord,
    links,
    linkedFlowIds: Object.freeze(Array.from(flowIdSet) as GreyFlowId[]),
    totalLinkedAmount,
    linkedPercentage,
    checksum,
  });
}

/**
 * Get all trace views for a period.
 */
export function getAllRechargeTraceViews(
  rechargeRegistry: GreyRechargeRegistry,
  linkRegistry: RechargeLinkRegistry,
  startTimestamp: number,
  endTimestamp: number
): readonly RechargeTraceView[] {
  const records = rechargeRegistry.getRecordsByTimeWindow(startTimestamp, endTimestamp);
  const views: RechargeTraceView[] = [];

  for (const record of records) {
    const view = getRechargeTraceView(record.rechargeId, rechargeRegistry, linkRegistry);
    if (view) {
      views.push(view);
    }
  }

  // Sort by recharge ID for determinism
  views.sort((a, b) =>
    (a.rechargeId as string).localeCompare(b.rechargeId as string)
  );

  return Object.freeze(views);
}

// ============================================================================
// SOURCE SUMMARY
// ============================================================================

/**
 * Summary by source type.
 */
export interface RechargeSourceSummary {
  readonly source: GreyRechargeSource;
  readonly startTimestamp: number;
  readonly endTimestamp: number;
  readonly totalConfirmed: number;
  readonly totalVoided: number;
  readonly netReference: number;
  readonly recordCount: number;
  readonly checksum: string;
}

/**
 * Get summary by source type.
 */
export function getRechargeSourceSummary(
  registry: GreyRechargeRegistry,
  source: GreyRechargeSource,
  startTimestamp: number,
  endTimestamp: number
): RechargeSourceSummary {
  const allForSource = registry.getRecordsBySource(source);
  const records = allForSource.filter(
    (r) =>
      r.declaredTimestamp >= startTimestamp &&
      r.declaredTimestamp <= endTimestamp
  );

  let totalConfirmed = 0;
  let totalVoided = 0;

  for (const record of records) {
    if (record.status === GreyRechargeStatus.CONFIRMED) {
      totalConfirmed += record.referenceAmount;
    } else if (record.status === GreyRechargeStatus.VOIDED) {
      totalVoided += record.referenceAmount;
    }
  }

  const checksum = calculateViewChecksum({
    type: 'sourceSummary',
    source,
    startTimestamp,
    endTimestamp,
    totalConfirmed,
    recordCount: records.length,
  });

  return Object.freeze({
    source,
    startTimestamp,
    endTimestamp,
    totalConfirmed,
    totalVoided,
    netReference: totalConfirmed - totalVoided,
    recordCount: records.length,
    checksum,
  });
}

/**
 * Get summaries for all sources in a period.
 */
export function getAllSourceSummaries(
  registry: GreyRechargeRegistry,
  startTimestamp: number,
  endTimestamp: number
): readonly RechargeSourceSummary[] {
  const sources: GreyRechargeSource[] = [
    GreyRechargeSource.EXTERNAL,
    GreyRechargeSource.MANUAL,
    GreyRechargeSource.FUTURE,
  ];

  const summaries: RechargeSourceSummary[] = [];
  for (const source of sources) {
    summaries.push(getRechargeSourceSummary(registry, source, startTimestamp, endTimestamp));
  }

  return Object.freeze(summaries);
}

// ============================================================================
// LINK SUMMARY
// ============================================================================

/**
 * Link coverage summary for a period.
 */
export interface LinkCoverageSummary {
  readonly startTimestamp: number;
  readonly endTimestamp: number;
  /** Total recharge reference amount */
  readonly totalRechargeAmount: number;
  /** Total linked amount */
  readonly totalLinkedAmount: number;
  /** Percentage of recharge linked (basis points) */
  readonly linkedPercentage: number;
  /** Number of recharges */
  readonly rechargeCount: number;
  /** Number of recharges with links */
  readonly linkedRechargeCount: number;
  /** Number of links */
  readonly linkCount: number;
  /** Checksum for verification */
  readonly checksum: string;
}

/**
 * Get link coverage summary for a period.
 */
export function getLinkCoverageSummary(
  rechargeRegistry: GreyRechargeRegistry,
  linkRegistry: RechargeLinkRegistry,
  startTimestamp: number,
  endTimestamp: number
): LinkCoverageSummary {
  const records = rechargeRegistry.getRecordsByTimeWindow(startTimestamp, endTimestamp);

  let totalRechargeAmount = 0;
  let totalLinkedAmount = 0;
  let linkedRechargeCount = 0;
  let linkCount = 0;

  for (const record of records) {
    // Only count confirmed recharges
    if (record.status === GreyRechargeStatus.CONFIRMED) {
      totalRechargeAmount += record.referenceAmount;

      const links = linkRegistry.getLinksByRecharge(record.rechargeId);
      if (links.length > 0) {
        linkedRechargeCount++;
        linkCount += links.length;
        for (const link of links) {
          totalLinkedAmount += link.linkedReferenceTotal;
        }
      }
    }
  }

  const linkedPercentage =
    totalRechargeAmount > 0
      ? Math.floor((totalLinkedAmount * 10000) / totalRechargeAmount)
      : 0;

  const checksum = calculateViewChecksum({
    type: 'linkCoverage',
    startTimestamp,
    endTimestamp,
    totalRechargeAmount,
    totalLinkedAmount,
  });

  return Object.freeze({
    startTimestamp,
    endTimestamp,
    totalRechargeAmount,
    totalLinkedAmount,
    linkedPercentage,
    rechargeCount: records.length,
    linkedRechargeCount,
    linkCount,
    checksum,
  });
}

// ============================================================================
// CHECKSUM UTILITIES
// ============================================================================

/**
 * Serialize data for checksum.
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
 * Simple hash function.
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return `rview_${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

/**
 * Calculate view checksum.
 */
function calculateViewChecksum(data: unknown): string {
  return simpleHash(serializeForChecksum(data));
}
