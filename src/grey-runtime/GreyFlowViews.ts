/**
 * GreyFlowViews.ts
 * Phase A - Grey Flow Settlement Runtime
 *
 * READ-ONLY FLOW VIEWS
 *
 * This module provides deterministic aggregations over grey flow records.
 * All views are read-only and never mutate any state.
 *
 * @external This module operates OUTSIDE the frozen engine.
 * @readonly Views never mutate any state.
 * @deterministic Same inputs always produce same outputs.
 */

import {
  GreyFlowId,
  GreySessionId,
  GreyPartyId,
  GreyPartyType,
  GreyFlowType,
  GreyFlowStatus,
  GreyFlowDirection,
  GreyTimeGranularity,
  GreyTimeWindow,
} from './GreyTypes';

import { GreyFlowRecord } from './GreyFlowRecord';
import { GreyFlowRegistry } from './GreyFlowRegistry';

// ============================================================================
// SUMMARY TYPES
// ============================================================================

/**
 * Platform flow summary.
 * Shows total rake-like flow attributed to platform.
 */
export interface PlatformFlowSummary {
  readonly totalRakeIn: number;
  readonly totalAdjustIn: number;
  readonly totalAdjustOut: number;
  readonly netFlow: number;
  readonly recordCount: number;
  readonly confirmedCount: number;
  readonly pendingCount: number;
  readonly voidedCount: number;
}

/**
 * Club flow summary.
 * Shows flow attributed to a specific club.
 */
export interface ClubFlowSummary {
  readonly clubPartyId: GreyPartyId;
  readonly totalRakeIn: number;
  readonly totalAdjustIn: number;
  readonly totalAdjustOut: number;
  readonly netFlow: number;
  readonly recordCount: number;
  readonly confirmedCount: number;
  readonly pendingCount: number;
}

/**
 * Agent flow summary.
 * Shows flow attributed to a specific agent.
 */
export interface AgentFlowSummary {
  readonly agentPartyId: GreyPartyId;
  readonly totalRakeIn: number;
  readonly totalAdjustIn: number;
  readonly totalAdjustOut: number;
  readonly netFlow: number;
  readonly recordCount: number;
  readonly confirmedCount: number;
  readonly pendingCount: number;
}

/**
 * Player net flow summary.
 * This is REFERENCE ONLY - NOT a balance.
 * Shows the sum of flow references for a player.
 */
export interface PlayerNetFlowSummary {
  readonly playerPartyId: GreyPartyId;
  readonly totalBuyinIn: number;
  readonly totalCashoutOut: number;
  readonly totalAdjustIn: number;
  readonly totalAdjustOut: number;
  readonly netFlowReference: number; // NOT A BALANCE
  readonly recordCount: number;
  readonly confirmedCount: number;
  readonly pendingCount: number;
}

/**
 * Time-bucketed flow summary.
 */
export interface TimeBucketFlowSummary {
  readonly bucketStart: number;
  readonly bucketEnd: number;
  readonly totalIn: number;
  readonly totalOut: number;
  readonly netFlow: number;
  readonly recordCount: number;
}

/**
 * Time-bucketed summary result.
 */
export interface TimeBucketedFlowResult {
  readonly granularity: GreyTimeGranularity;
  readonly timeWindow: GreyTimeWindow;
  readonly buckets: readonly TimeBucketFlowSummary[];
  readonly totalRecords: number;
}

// ============================================================================
// VIEW HELPER FUNCTIONS
// ============================================================================

/**
 * Get the effective records for a registry.
 * For each flowId, only returns the record with the latest sequence number.
 * This handles status transitions in an append-only system.
 */
function getEffectiveRecords(registry: GreyFlowRegistry): GreyFlowRecord[] {
  const allRecords = registry.getAllRecords();
  const latestByFlowId = new Map<string, GreyFlowRecord>();

  for (const record of allRecords) {
    const existing = latestByFlowId.get(record.flowId);
    if (!existing || record.sequence > existing.sequence) {
      latestByFlowId.set(record.flowId, record);
    }
  }

  return Array.from(latestByFlowId.values());
}

/**
 * Get records within a time window.
 */
function filterByTimeWindow(
  records: readonly GreyFlowRecord[],
  timeWindow: GreyTimeWindow
): GreyFlowRecord[] {
  return records.filter(
    (r) =>
      r.injectedTimestamp >= timeWindow.startTimestamp &&
      r.injectedTimestamp <= timeWindow.endTimestamp
  );
}

/**
 * Get records by party type.
 */
function filterByPartyType(
  records: readonly GreyFlowRecord[],
  partyType: GreyPartyType
): GreyFlowRecord[] {
  return records.filter((r) => r.party.partyType === partyType);
}

/**
 * Get records by party ID.
 */
function filterByPartyId(
  records: readonly GreyFlowRecord[],
  partyId: GreyPartyId
): GreyFlowRecord[] {
  return records.filter((r) => r.party.partyId === partyId);
}

/**
 * Get records by flow type.
 */
function filterByFlowType(
  records: readonly GreyFlowRecord[],
  type: GreyFlowType
): GreyFlowRecord[] {
  return records.filter((r) => r.type === type);
}

/**
 * Get records by status.
 */
function filterByStatus(
  records: readonly GreyFlowRecord[],
  status: GreyFlowStatus
): GreyFlowRecord[] {
  return records.filter((r) => r.status === status);
}

/**
 * Calculate net flow from records.
 * IN is positive, OUT is negative.
 */
function calculateNetFlow(records: readonly GreyFlowRecord[]): number {
  return records.reduce((sum, r) => {
    if (r.status === GreyFlowStatus.VOID) {
      return sum; // Voided records don't count
    }
    const sign = r.direction === GreyFlowDirection.IN ? 1 : -1;
    return sum + sign * r.amount;
  }, 0);
}

/**
 * Sum amounts for records with specific direction.
 */
function sumByDirection(
  records: readonly GreyFlowRecord[],
  direction: GreyFlowDirection
): number {
  return records
    .filter((r) => r.direction === direction && r.status !== GreyFlowStatus.VOID)
    .reduce((sum, r) => sum + r.amount, 0);
}

/**
 * Count records by status.
 */
function countByStatus(
  records: readonly GreyFlowRecord[],
  status: GreyFlowStatus
): number {
  return records.filter((r) => r.status === status).length;
}

/**
 * Get bucket size in milliseconds for granularity.
 */
function getBucketSizeMs(granularity: GreyTimeGranularity): number {
  switch (granularity) {
    case GreyTimeGranularity.MINUTE:
      return 60 * 1000;
    case GreyTimeGranularity.HOUR:
      return 60 * 60 * 1000;
    case GreyTimeGranularity.DAY:
      return 24 * 60 * 60 * 1000;
    default:
      return 60 * 60 * 1000; // Default to hour
  }
}

/**
 * Get bucket start for a timestamp.
 */
function getBucketStart(timestamp: number, granularity: GreyTimeGranularity): number {
  const bucketSize = getBucketSizeMs(granularity);
  return Math.floor(timestamp / bucketSize) * bucketSize;
}

// ============================================================================
// PLATFORM FLOW VIEW
// ============================================================================

/**
 * Create a platform flow summary.
 *
 * @param registry - Grey flow registry
 * @param timeWindow - Optional time window filter
 * @returns Platform flow summary
 */
export function getPlatformFlowSummary(
  registry: GreyFlowRegistry,
  timeWindow?: GreyTimeWindow
): PlatformFlowSummary {
  let records = filterByPartyType(getEffectiveRecords(registry), GreyPartyType.PLATFORM);

  if (timeWindow) {
    records = filterByTimeWindow(records, timeWindow);
  }

  const rakeRecords = filterByFlowType(records, GreyFlowType.RAKE_REF);
  const adjustRecords = filterByFlowType(records, GreyFlowType.ADJUST_REF);

  const totalRakeIn = sumByDirection(rakeRecords, GreyFlowDirection.IN);
  const totalAdjustIn = sumByDirection(adjustRecords, GreyFlowDirection.IN);
  const totalAdjustOut = sumByDirection(adjustRecords, GreyFlowDirection.OUT);

  return Object.freeze({
    totalRakeIn,
    totalAdjustIn,
    totalAdjustOut,
    netFlow: totalRakeIn + totalAdjustIn - totalAdjustOut,
    recordCount: records.length,
    confirmedCount: countByStatus(records, GreyFlowStatus.CONFIRMED),
    pendingCount: countByStatus(records, GreyFlowStatus.PENDING),
    voidedCount: countByStatus(records, GreyFlowStatus.VOID),
  });
}

// ============================================================================
// CLUB FLOW VIEW
// ============================================================================

/**
 * Create a club flow summary.
 *
 * @param registry - Grey flow registry
 * @param clubPartyId - Club party ID
 * @param timeWindow - Optional time window filter
 * @returns Club flow summary
 */
export function getClubFlowSummary(
  registry: GreyFlowRegistry,
  clubPartyId: GreyPartyId,
  timeWindow?: GreyTimeWindow
): ClubFlowSummary {
  let records = filterByPartyId(getEffectiveRecords(registry), clubPartyId);
  records = records.filter((r) => r.party.partyType === GreyPartyType.CLUB);

  if (timeWindow) {
    records = filterByTimeWindow(records, timeWindow);
  }

  const rakeRecords = filterByFlowType(records, GreyFlowType.RAKE_REF);
  const adjustRecords = filterByFlowType(records, GreyFlowType.ADJUST_REF);

  const totalRakeIn = sumByDirection(rakeRecords, GreyFlowDirection.IN);
  const totalAdjustIn = sumByDirection(adjustRecords, GreyFlowDirection.IN);
  const totalAdjustOut = sumByDirection(adjustRecords, GreyFlowDirection.OUT);

  return Object.freeze({
    clubPartyId,
    totalRakeIn,
    totalAdjustIn,
    totalAdjustOut,
    netFlow: totalRakeIn + totalAdjustIn - totalAdjustOut,
    recordCount: records.length,
    confirmedCount: countByStatus(records, GreyFlowStatus.CONFIRMED),
    pendingCount: countByStatus(records, GreyFlowStatus.PENDING),
  });
}

/**
 * Get all club flow summaries.
 *
 * @param registry - Grey flow registry
 * @param timeWindow - Optional time window filter
 * @returns Array of club flow summaries
 */
export function getAllClubFlowSummaries(
  registry: GreyFlowRegistry,
  timeWindow?: GreyTimeWindow
): readonly ClubFlowSummary[] {
  const clubRecords = filterByPartyType(getEffectiveRecords(registry), GreyPartyType.CLUB);

  // Get unique club party IDs
  const clubIds = new Set<GreyPartyId>();
  for (const record of clubRecords) {
    clubIds.add(record.party.partyId);
  }

  const summaries: ClubFlowSummary[] = [];
  for (const clubId of clubIds) {
    summaries.push(getClubFlowSummary(registry, clubId, timeWindow));
  }

  return Object.freeze(summaries);
}

// ============================================================================
// AGENT FLOW VIEW
// ============================================================================

/**
 * Create an agent flow summary.
 *
 * @param registry - Grey flow registry
 * @param agentPartyId - Agent party ID
 * @param timeWindow - Optional time window filter
 * @returns Agent flow summary
 */
export function getAgentFlowSummary(
  registry: GreyFlowRegistry,
  agentPartyId: GreyPartyId,
  timeWindow?: GreyTimeWindow
): AgentFlowSummary {
  let records = filterByPartyId(getEffectiveRecords(registry), agentPartyId);
  records = records.filter((r) => r.party.partyType === GreyPartyType.AGENT);

  if (timeWindow) {
    records = filterByTimeWindow(records, timeWindow);
  }

  const rakeRecords = filterByFlowType(records, GreyFlowType.RAKE_REF);
  const adjustRecords = filterByFlowType(records, GreyFlowType.ADJUST_REF);

  const totalRakeIn = sumByDirection(rakeRecords, GreyFlowDirection.IN);
  const totalAdjustIn = sumByDirection(adjustRecords, GreyFlowDirection.IN);
  const totalAdjustOut = sumByDirection(adjustRecords, GreyFlowDirection.OUT);

  return Object.freeze({
    agentPartyId,
    totalRakeIn,
    totalAdjustIn,
    totalAdjustOut,
    netFlow: totalRakeIn + totalAdjustIn - totalAdjustOut,
    recordCount: records.length,
    confirmedCount: countByStatus(records, GreyFlowStatus.CONFIRMED),
    pendingCount: countByStatus(records, GreyFlowStatus.PENDING),
  });
}

/**
 * Get all agent flow summaries.
 *
 * @param registry - Grey flow registry
 * @param timeWindow - Optional time window filter
 * @returns Array of agent flow summaries
 */
export function getAllAgentFlowSummaries(
  registry: GreyFlowRegistry,
  timeWindow?: GreyTimeWindow
): readonly AgentFlowSummary[] {
  const agentRecords = filterByPartyType(getEffectiveRecords(registry), GreyPartyType.AGENT);

  // Get unique agent party IDs
  const agentIds = new Set<GreyPartyId>();
  for (const record of agentRecords) {
    agentIds.add(record.party.partyId);
  }

  const summaries: AgentFlowSummary[] = [];
  for (const agentId of agentIds) {
    summaries.push(getAgentFlowSummary(registry, agentId, timeWindow));
  }

  return Object.freeze(summaries);
}

// ============================================================================
// PLAYER NET FLOW VIEW
// ============================================================================

/**
 * Create a player net flow summary.
 * This is REFERENCE ONLY - NOT a balance.
 *
 * @param registry - Grey flow registry
 * @param playerPartyId - Player party ID
 * @param timeWindow - Optional time window filter
 * @returns Player net flow summary
 */
export function getPlayerNetFlowSummary(
  registry: GreyFlowRegistry,
  playerPartyId: GreyPartyId,
  timeWindow?: GreyTimeWindow
): PlayerNetFlowSummary {
  let records = filterByPartyId(getEffectiveRecords(registry), playerPartyId);
  records = records.filter((r) => r.party.partyType === GreyPartyType.PLAYER);

  if (timeWindow) {
    records = filterByTimeWindow(records, timeWindow);
  }

  const buyinRecords = filterByFlowType(records, GreyFlowType.BUYIN_REF);
  const cashoutRecords = filterByFlowType(records, GreyFlowType.CASHOUT_REF);
  const adjustRecords = filterByFlowType(records, GreyFlowType.ADJUST_REF);

  const totalBuyinIn = sumByDirection(buyinRecords, GreyFlowDirection.IN);
  const totalCashoutOut = sumByDirection(cashoutRecords, GreyFlowDirection.OUT);
  const totalAdjustIn = sumByDirection(adjustRecords, GreyFlowDirection.IN);
  const totalAdjustOut = sumByDirection(adjustRecords, GreyFlowDirection.OUT);

  return Object.freeze({
    playerPartyId,
    totalBuyinIn,
    totalCashoutOut,
    totalAdjustIn,
    totalAdjustOut,
    netFlowReference: totalBuyinIn + totalAdjustIn - totalCashoutOut - totalAdjustOut,
    recordCount: records.length,
    confirmedCount: countByStatus(records, GreyFlowStatus.CONFIRMED),
    pendingCount: countByStatus(records, GreyFlowStatus.PENDING),
  });
}

/**
 * Get all player net flow summaries.
 *
 * @param registry - Grey flow registry
 * @param timeWindow - Optional time window filter
 * @returns Array of player net flow summaries
 */
export function getAllPlayerNetFlowSummaries(
  registry: GreyFlowRegistry,
  timeWindow?: GreyTimeWindow
): readonly PlayerNetFlowSummary[] {
  const playerRecords = filterByPartyType(getEffectiveRecords(registry), GreyPartyType.PLAYER);

  // Get unique player party IDs
  const playerIds = new Set<GreyPartyId>();
  for (const record of playerRecords) {
    playerIds.add(record.party.partyId);
  }

  const summaries: PlayerNetFlowSummary[] = [];
  for (const playerId of playerIds) {
    summaries.push(getPlayerNetFlowSummary(registry, playerId, timeWindow));
  }

  return Object.freeze(summaries);
}

// ============================================================================
// TIME-BUCKETED VIEWS
// ============================================================================

/**
 * Get time-bucketed flow summary.
 *
 * @param registry - Grey flow registry
 * @param timeWindow - Time window for the query
 * @param granularity - Time bucket granularity
 * @param partyType - Optional party type filter
 * @returns Time-bucketed flow result
 */
export function getTimeBucketedFlowSummary(
  registry: GreyFlowRegistry,
  timeWindow: GreyTimeWindow,
  granularity: GreyTimeGranularity,
  partyType?: GreyPartyType
): TimeBucketedFlowResult {
  let records = filterByTimeWindow(getEffectiveRecords(registry), timeWindow);

  if (partyType) {
    records = filterByPartyType(records, partyType);
  }

  const bucketSize = getBucketSizeMs(granularity);

  // Group records by bucket
  const bucketMap = new Map<number, GreyFlowRecord[]>();

  for (const record of records) {
    const bucketStart = getBucketStart(record.injectedTimestamp, granularity);
    const bucket = bucketMap.get(bucketStart) || [];
    bucket.push(record);
    bucketMap.set(bucketStart, bucket);
  }

  // Generate all buckets in the time window (including empty ones)
  const startBucket = getBucketStart(timeWindow.startTimestamp, granularity);
  const endBucket = getBucketStart(timeWindow.endTimestamp, granularity);

  const buckets: TimeBucketFlowSummary[] = [];

  for (let bucketStart = startBucket; bucketStart <= endBucket; bucketStart += bucketSize) {
    const bucketRecords = bucketMap.get(bucketStart) || [];
    const activeRecords = bucketRecords.filter(
      (r) => r.status !== GreyFlowStatus.VOID
    );

    const totalIn = activeRecords
      .filter((r) => r.direction === GreyFlowDirection.IN)
      .reduce((sum, r) => sum + r.amount, 0);

    const totalOut = activeRecords
      .filter((r) => r.direction === GreyFlowDirection.OUT)
      .reduce((sum, r) => sum + r.amount, 0);

    buckets.push(
      Object.freeze({
        bucketStart,
        bucketEnd: bucketStart + bucketSize,
        totalIn,
        totalOut,
        netFlow: totalIn - totalOut,
        recordCount: bucketRecords.length,
      })
    );
  }

  return Object.freeze({
    granularity,
    timeWindow,
    buckets: Object.freeze(buckets),
    totalRecords: records.length,
  });
}

// ============================================================================
// AGGREGATE VIEWS
// ============================================================================

/**
 * Global flow summary across all parties.
 */
export interface GlobalFlowSummary {
  readonly totalRecords: number;
  readonly totalSessions: number;
  readonly totalIn: number;
  readonly totalOut: number;
  readonly netFlow: number;
  readonly byStatus: Readonly<Record<GreyFlowStatus, number>>;
  readonly byType: Readonly<Record<GreyFlowType, number>>;
  readonly byPartyType: Readonly<Record<GreyPartyType, number>>;
}

/**
 * Get global flow summary.
 *
 * @param registry - Grey flow registry
 * @param timeWindow - Optional time window filter
 * @returns Global flow summary
 */
export function getGlobalFlowSummary(
  registry: GreyFlowRegistry,
  timeWindow?: GreyTimeWindow
): GlobalFlowSummary {
  let records = getEffectiveRecords(registry);

  if (timeWindow) {
    records = filterByTimeWindow(records, timeWindow);
  }

  const activeRecords = records.filter((r) => r.status !== GreyFlowStatus.VOID);

  const totalIn = activeRecords
    .filter((r) => r.direction === GreyFlowDirection.IN)
    .reduce((sum, r) => sum + r.amount, 0);

  const totalOut = activeRecords
    .filter((r) => r.direction === GreyFlowDirection.OUT)
    .reduce((sum, r) => sum + r.amount, 0);

  // Count by status
  const byStatus: Record<string, number> = {
    [GreyFlowStatus.PENDING]: 0,
    [GreyFlowStatus.CONFIRMED]: 0,
    [GreyFlowStatus.VOID]: 0,
  };
  for (const record of records) {
    byStatus[record.status]++;
  }

  // Count by type
  const byType: Record<string, number> = {
    [GreyFlowType.BUYIN_REF]: 0,
    [GreyFlowType.CASHOUT_REF]: 0,
    [GreyFlowType.RAKE_REF]: 0,
    [GreyFlowType.ADJUST_REF]: 0,
  };
  for (const record of records) {
    byType[record.type]++;
  }

  // Count by party type
  const byPartyType: Record<string, number> = {
    [GreyPartyType.PLAYER]: 0,
    [GreyPartyType.CLUB]: 0,
    [GreyPartyType.AGENT]: 0,
    [GreyPartyType.PLATFORM]: 0,
  };
  for (const record of records) {
    byPartyType[record.party.partyType]++;
  }

  return Object.freeze({
    totalRecords: records.length,
    totalSessions: registry.getSessionCount(),
    totalIn,
    totalOut,
    netFlow: totalIn - totalOut,
    byStatus: Object.freeze(byStatus) as Readonly<Record<GreyFlowStatus, number>>,
    byType: Object.freeze(byType) as Readonly<Record<GreyFlowType, number>>,
    byPartyType: Object.freeze(byPartyType) as Readonly<Record<GreyPartyType, number>>,
  });
}
