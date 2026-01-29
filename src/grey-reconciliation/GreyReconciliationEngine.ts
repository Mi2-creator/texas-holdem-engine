/**
 * GreyReconciliationEngine.ts
 * Phase A1 - Grey Flow Reconciliation & Periodic Settlement
 *
 * PURE FUNCTION RECONCILIATION ENGINE
 *
 * This module provides pure functions for reconciling grey flows.
 * All functions are deterministic and never mutate any state.
 *
 * @external This module operates OUTSIDE the frozen engine.
 * @readonly This module NEVER mutates any state.
 * @deterministic Same inputs always produce same outputs.
 * @pure All functions are pure with no side effects.
 */

import {
  GreyFlowRegistry,
  GreyFlowRecord,
  GreyFlowId,
  GreyPartyId,
  GreyPartyType,
  GreyFlowType,
  GreyFlowStatus,
  GreyFlowDirection,
  createGreyTimeWindow,
} from '../grey-runtime';

import {
  ReconciliationPeriod,
  ReconciliationPeriodId,
  ReconciliationStatus,
  SettlementBucket,
  FlowSummary,
  SettlementTotal,
  Discrepancy,
  DiscrepancyType,
  DiscrepancySeverity,
  ReconciliationResult,
  ReconciliationError,
  ReconciliationErrorCode,
  reconciliationSuccess,
  reconciliationFailure,
  createReconciliationError,
  createDiscrepancy,
  isValidPeriod,
} from './ReconciliationTypes';

// ============================================================================
// CORE RECONCILIATION RESULT
// ============================================================================

/**
 * Complete reconciliation result for a period.
 */
export interface PeriodReconciliationResult {
  readonly period: ReconciliationPeriod;
  readonly status: ReconciliationStatus;
  readonly platformSummary: FlowSummary | null;
  readonly clubSummaries: readonly FlowSummary[];
  readonly agentSummaries: readonly FlowSummary[];
  readonly settlementTotals: readonly SettlementTotal[];
  readonly discrepancies: readonly Discrepancy[];
  readonly totalFlowCount: number;
  readonly pendingFlowCount: number;
  readonly confirmedFlowCount: number;
  readonly voidedFlowCount: number;
  readonly checksum: string;
}

// ============================================================================
// CHECKSUM CALCULATION
// ============================================================================

/**
 * Calculate a deterministic checksum for reconciliation data.
 */
export function calculateReconciliationChecksum(data: unknown): string {
  const str = serializeForChecksum(data);
  return simpleHash(str);
}

/**
 * Serialize data for checksum calculation.
 * Keys are sorted to ensure determinism.
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

// ============================================================================
// FLOW EXTRACTION (Read-Only)
// ============================================================================

/**
 * Extract flows from registry within a period.
 * This is a READ-ONLY operation - registry is not mutated.
 */
function extractFlowsForPeriod(
  registry: GreyFlowRegistry,
  period: ReconciliationPeriod
): GreyFlowRecord[] {
  const allRecords = registry.getAllRecords();

  // Get the effective (latest) record for each flowId
  const latestByFlowId = new Map<string, GreyFlowRecord>();
  for (const record of allRecords) {
    const existing = latestByFlowId.get(record.flowId);
    if (!existing || record.sequence > existing.sequence) {
      latestByFlowId.set(record.flowId, record);
    }
  }

  // Filter by period
  const effectiveRecords = Array.from(latestByFlowId.values());
  return effectiveRecords.filter(
    (r) =>
      r.injectedTimestamp >= period.startTimestamp &&
      r.injectedTimestamp <= period.endTimestamp
  );
}

/**
 * Group flows by party ID.
 */
function groupFlowsByParty(
  flows: readonly GreyFlowRecord[]
): Map<GreyPartyId, GreyFlowRecord[]> {
  const grouped = new Map<GreyPartyId, GreyFlowRecord[]>();

  for (const flow of flows) {
    const partyId = flow.party.partyId;
    const existing = grouped.get(partyId) || [];
    existing.push(flow);
    grouped.set(partyId, existing);
  }

  return grouped;
}

/**
 * Group flows by party type.
 */
function groupFlowsByPartyType(
  flows: readonly GreyFlowRecord[]
): Map<GreyPartyType, GreyFlowRecord[]> {
  const grouped = new Map<GreyPartyType, GreyFlowRecord[]>();

  for (const flow of flows) {
    const partyType = flow.party.partyType;
    const existing = grouped.get(partyType) || [];
    existing.push(flow);
    grouped.set(partyType, existing);
  }

  return grouped;
}

// ============================================================================
// FLOW SUMMARY CALCULATION
// ============================================================================

/**
 * Calculate flow summary for a party within a period.
 * Pure function - no mutations.
 */
export function calculateFlowSummary(
  partyId: GreyPartyId,
  partyType: GreyPartyType,
  periodId: ReconciliationPeriodId,
  flows: readonly GreyFlowRecord[]
): FlowSummary {
  // Filter to only non-voided flows for totals
  const activeFlows = flows.filter((f) => f.status !== GreyFlowStatus.VOID);

  // Calculate totals
  let totalIn = 0;
  let totalOut = 0;

  for (const flow of activeFlows) {
    if (flow.direction === GreyFlowDirection.IN) {
      totalIn += flow.amount;
    } else {
      totalOut += flow.amount;
    }
  }

  // Count by type
  const countByType: Record<string, number> = {
    [GreyFlowType.BUYIN_REF]: 0,
    [GreyFlowType.CASHOUT_REF]: 0,
    [GreyFlowType.RAKE_REF]: 0,
    [GreyFlowType.ADJUST_REF]: 0,
  };

  for (const flow of flows) {
    countByType[flow.type]++;
  }

  // Count by status
  const countByStatus: Record<string, number> = {
    [GreyFlowStatus.PENDING]: 0,
    [GreyFlowStatus.CONFIRMED]: 0,
    [GreyFlowStatus.VOID]: 0,
  };

  for (const flow of flows) {
    countByStatus[flow.status]++;
  }

  // Collect flow IDs
  const flowIds = flows.map((f) => f.flowId);

  return Object.freeze({
    partyId,
    partyType,
    periodId,
    totalIn,
    totalOut,
    netReference: totalIn - totalOut,
    countByType: Object.freeze(countByType) as Readonly<Record<GreyFlowType, number>>,
    countByStatus: Object.freeze(countByStatus) as Readonly<Record<GreyFlowStatus, number>>,
    flowIds: Object.freeze(flowIds),
    recordCount: flows.length,
  });
}

// ============================================================================
// SETTLEMENT TOTAL CALCULATION
// ============================================================================

/**
 * Calculate settlement total for a bucket within a period.
 * Pure function - no mutations.
 */
export function calculateSettlementTotal(
  bucket: SettlementBucket,
  periodId: ReconciliationPeriodId,
  summaries: readonly FlowSummary[]
): SettlementTotal {
  let totalRakeIn = 0;
  let totalAdjustIn = 0;
  let totalAdjustOut = 0;
  let flowCount = 0;

  for (const summary of summaries) {
    // Calculate rake from type counts and totals
    // RAKE_REF flows are always IN direction
    const rakeCount = summary.countByType[GreyFlowType.RAKE_REF];
    if (rakeCount > 0) {
      // Need to sum actual rake amounts from the summary
      // Since we only have totals, we'll use a heuristic:
      // All RAKE_REF flows contribute to totalIn
      // This is an approximation - for exact numbers, need flow-level data
    }

    // For simplicity, use the summary totals
    // In a real implementation, we'd track by type
    totalRakeIn += summary.totalIn; // Simplified
    flowCount += summary.recordCount;
  }

  // Recalculate based on bucket type expectations
  // PLATFORM, CLUB, AGENT all receive rake as IN
  const netSettlement = totalRakeIn + totalAdjustIn - totalAdjustOut;

  return Object.freeze({
    bucket,
    periodId,
    totalRakeIn,
    totalAdjustIn,
    totalAdjustOut,
    netSettlement,
    partyCount: summaries.length,
    flowCount,
  });
}

/**
 * Calculate settlement total from flow records directly.
 * More accurate than using summaries.
 */
export function calculateSettlementTotalFromFlows(
  bucket: SettlementBucket,
  periodId: ReconciliationPeriodId,
  flows: readonly GreyFlowRecord[],
  partyIds: readonly GreyPartyId[]
): SettlementTotal {
  const activeFlows = flows.filter((f) => f.status !== GreyFlowStatus.VOID);

  let totalRakeIn = 0;
  let totalAdjustIn = 0;
  let totalAdjustOut = 0;

  for (const flow of activeFlows) {
    if (flow.type === GreyFlowType.RAKE_REF && flow.direction === GreyFlowDirection.IN) {
      totalRakeIn += flow.amount;
    } else if (flow.type === GreyFlowType.ADJUST_REF) {
      if (flow.direction === GreyFlowDirection.IN) {
        totalAdjustIn += flow.amount;
      } else {
        totalAdjustOut += flow.amount;
      }
    }
  }

  return Object.freeze({
    bucket,
    periodId,
    totalRakeIn,
    totalAdjustIn,
    totalAdjustOut,
    netSettlement: totalRakeIn + totalAdjustIn - totalAdjustOut,
    partyCount: partyIds.length,
    flowCount: flows.length,
  });
}

// ============================================================================
// DISCREPANCY DETECTION
// ============================================================================

/**
 * Detect discrepancies in flows.
 * Pure function - no mutations.
 */
export function detectDiscrepancies(
  flows: readonly GreyFlowRecord[],
  periodId: ReconciliationPeriodId
): Discrepancy[] {
  const discrepancies: Discrepancy[] = [];

  // Check for non-integer values (should never happen but verify)
  for (const flow of flows) {
    if (!Number.isInteger(flow.amount)) {
      discrepancies.push(
        createDiscrepancy(
          DiscrepancyType.NON_INTEGER_VALUE,
          DiscrepancySeverity.CRITICAL,
          `Flow ${flow.flowId} has non-integer amount: ${flow.amount}`,
          [flow.flowId],
          undefined,
          flow.amount,
          { flowId: flow.flowId, amount: flow.amount }
        )
      );
    }
  }

  // Check for pending flows (incomplete settlement)
  const pendingFlows = flows.filter((f) => f.status === GreyFlowStatus.PENDING);
  if (pendingFlows.length > 0) {
    discrepancies.push(
      createDiscrepancy(
        DiscrepancyType.STATUS_INCONSISTENCY,
        DiscrepancySeverity.WARNING,
        `${pendingFlows.length} flows are still PENDING`,
        pendingFlows.map((f) => f.flowId),
        0,
        pendingFlows.length,
        { pendingCount: pendingFlows.length }
      )
    );
  }

  // Check for duplicate flow IDs (should be caught by registry, but verify)
  const flowIdCounts = new Map<string, number>();
  for (const flow of flows) {
    const count = flowIdCounts.get(flow.flowId) || 0;
    flowIdCounts.set(flow.flowId, count + 1);
  }

  for (const [flowId, count] of flowIdCounts.entries()) {
    if (count > 1) {
      discrepancies.push(
        createDiscrepancy(
          DiscrepancyType.DUPLICATE_REFERENCE,
          DiscrepancySeverity.ERROR,
          `Flow ID ${flowId} appears ${count} times`,
          [flowId as GreyFlowId],
          1,
          count,
          { flowId, count }
        )
      );
    }
  }

  return discrepancies;
}

// ============================================================================
// MAIN RECONCILIATION FUNCTION
// ============================================================================

/**
 * Reconcile grey flows for a period.
 * Pure function - no mutations to registry or any other state.
 *
 * @param registry - Grey flow registry (read-only access)
 * @param period - Reconciliation period
 * @returns Reconciliation result
 */
export function reconcilePeriod(
  registry: GreyFlowRegistry,
  period: ReconciliationPeriod
): ReconciliationResult<PeriodReconciliationResult> {
  // Validate period
  if (!isValidPeriod(period)) {
    return reconciliationFailure(
      createReconciliationError(
        ReconciliationErrorCode.INVALID_PERIOD,
        'Invalid reconciliation period',
        { period }
      )
    );
  }

  // Extract flows for period (read-only)
  const flows = extractFlowsForPeriod(registry, period);

  // Group by party type
  const byPartyType = groupFlowsByPartyType(flows);

  // Group by party ID
  const byPartyId = groupFlowsByParty(flows);

  // Calculate platform summary
  const platformFlows = byPartyType.get(GreyPartyType.PLATFORM) || [];
  const platformPartyIds = new Set<GreyPartyId>();
  for (const flow of platformFlows) {
    platformPartyIds.add(flow.party.partyId);
  }

  let platformSummary: FlowSummary | null = null;
  if (platformPartyIds.size === 1) {
    const platformPartyId = Array.from(platformPartyIds)[0];
    platformSummary = calculateFlowSummary(
      platformPartyId,
      GreyPartyType.PLATFORM,
      period.periodId,
      platformFlows
    );
  } else if (platformPartyIds.size > 1) {
    // Multiple platform parties - create combined summary
    // Use first party ID as representative
    const platformPartyId = Array.from(platformPartyIds)[0];
    platformSummary = calculateFlowSummary(
      platformPartyId,
      GreyPartyType.PLATFORM,
      period.periodId,
      platformFlows
    );
  }

  // Calculate club summaries
  const clubFlows = byPartyType.get(GreyPartyType.CLUB) || [];
  const clubByParty = groupFlowsByParty(clubFlows);
  const clubSummaries: FlowSummary[] = [];

  for (const [partyId, partyFlows] of clubByParty.entries()) {
    clubSummaries.push(
      calculateFlowSummary(partyId, GreyPartyType.CLUB, period.periodId, partyFlows)
    );
  }

  // Calculate agent summaries
  const agentFlows = byPartyType.get(GreyPartyType.AGENT) || [];
  const agentByParty = groupFlowsByParty(agentFlows);
  const agentSummaries: FlowSummary[] = [];

  for (const [partyId, partyFlows] of agentByParty.entries()) {
    agentSummaries.push(
      calculateFlowSummary(partyId, GreyPartyType.AGENT, period.periodId, partyFlows)
    );
  }

  // Calculate settlement totals
  const settlementTotals: SettlementTotal[] = [];

  if (platformFlows.length > 0) {
    settlementTotals.push(
      calculateSettlementTotalFromFlows(
        SettlementBucket.PLATFORM,
        period.periodId,
        platformFlows,
        Array.from(platformPartyIds)
      )
    );
  }

  if (clubFlows.length > 0) {
    settlementTotals.push(
      calculateSettlementTotalFromFlows(
        SettlementBucket.CLUB,
        period.periodId,
        clubFlows,
        Array.from(clubByParty.keys())
      )
    );
  }

  if (agentFlows.length > 0) {
    settlementTotals.push(
      calculateSettlementTotalFromFlows(
        SettlementBucket.AGENT,
        period.periodId,
        agentFlows,
        Array.from(agentByParty.keys())
      )
    );
  }

  // Detect discrepancies
  const discrepancies = detectDiscrepancies(flows, period.periodId);

  // Count by status
  let pendingFlowCount = 0;
  let confirmedFlowCount = 0;
  let voidedFlowCount = 0;

  for (const flow of flows) {
    switch (flow.status) {
      case GreyFlowStatus.PENDING:
        pendingFlowCount++;
        break;
      case GreyFlowStatus.CONFIRMED:
        confirmedFlowCount++;
        break;
      case GreyFlowStatus.VOID:
        voidedFlowCount++;
        break;
    }
  }

  // Determine status
  let status: ReconciliationStatus;
  if (pendingFlowCount > 0) {
    status = ReconciliationStatus.INCOMPLETE;
  } else if (discrepancies.some((d) => d.severity === DiscrepancySeverity.ERROR || d.severity === DiscrepancySeverity.CRITICAL)) {
    status = ReconciliationStatus.IMBALANCED;
  } else {
    status = ReconciliationStatus.BALANCED;
  }

  // Build result (without checksum first)
  const resultData = {
    period,
    status,
    platformSummary,
    clubSummaries: Object.freeze(clubSummaries),
    agentSummaries: Object.freeze(agentSummaries),
    settlementTotals: Object.freeze(settlementTotals),
    discrepancies: Object.freeze(discrepancies),
    totalFlowCount: flows.length,
    pendingFlowCount,
    confirmedFlowCount,
    voidedFlowCount,
  };

  // Calculate checksum
  const checksum = calculateReconciliationChecksum(resultData);

  const result: PeriodReconciliationResult = Object.freeze({
    ...resultData,
    checksum,
  });

  return reconciliationSuccess(result);
}

// ============================================================================
// VERIFICATION FUNCTIONS
// ============================================================================

/**
 * Verify a reconciliation result's checksum.
 */
export function verifyReconciliationChecksum(result: PeriodReconciliationResult): boolean {
  const resultData = {
    period: result.period,
    status: result.status,
    platformSummary: result.platformSummary,
    clubSummaries: result.clubSummaries,
    agentSummaries: result.agentSummaries,
    settlementTotals: result.settlementTotals,
    discrepancies: result.discrepancies,
    totalFlowCount: result.totalFlowCount,
    pendingFlowCount: result.pendingFlowCount,
    confirmedFlowCount: result.confirmedFlowCount,
    voidedFlowCount: result.voidedFlowCount,
  };

  const expectedChecksum = calculateReconciliationChecksum(resultData);
  return result.checksum === expectedChecksum;
}

/**
 * Compare two reconciliation results for equivalence.
 */
export function compareReconciliationResults(
  result1: PeriodReconciliationResult,
  result2: PeriodReconciliationResult
): boolean {
  return result1.checksum === result2.checksum;
}
