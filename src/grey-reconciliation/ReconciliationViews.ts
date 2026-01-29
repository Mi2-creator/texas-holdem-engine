/**
 * ReconciliationViews.ts
 * Phase A1 - Grey Flow Reconciliation & Periodic Settlement
 *
 * READ-ONLY RECONCILIATION VIEWS
 *
 * This module provides read-only views over reconciliation data.
 * All views are deterministic and traceable to source flow IDs.
 *
 * @external This module operates OUTSIDE the frozen engine.
 * @readonly This module NEVER mutates any state.
 * @deterministic Same inputs always produce same outputs.
 * @traceable All outputs are traceable to GreyFlowIds.
 */

import {
  GreyFlowId,
  GreyPartyId,
  GreyPartyType,
  GreyFlowType,
  GreyFlowStatus,
  GreyFlowRegistry,
} from '../grey-runtime';

import {
  ReconciliationPeriod,
  ReconciliationPeriodId,
  ReconciliationStatus,
  SettlementBucket,
  PeriodGranularity,
  FlowSummary,
  SettlementTotal,
  Discrepancy,
  DiscrepancyType,
  DiscrepancySeverity,
  ReconciliationResult,
  reconciliationSuccess,
  reconciliationFailure,
  createReconciliationError,
  ReconciliationErrorCode,
  createReconciliationPeriodId,
} from './ReconciliationTypes';

import {
  PeriodReconciliationResult,
  reconcilePeriod,
  calculateReconciliationChecksum,
} from './GreyReconciliationEngine';

import {
  SettlementSnapshot,
  createSnapshotsFromReconciliation,
} from './SettlementSnapshots';

// ============================================================================
// PLATFORM PERIOD SUMMARY VIEW
// ============================================================================

/**
 * Platform period summary.
 * Shows platform profit confirmation for a period.
 */
export interface PlatformPeriodSummary {
  readonly periodId: ReconciliationPeriodId;
  readonly startTimestamp: number;
  readonly endTimestamp: number;
  readonly status: ReconciliationStatus;

  /** Total rake received */
  readonly totalRakeIn: number;
  /** Total adjustments IN */
  readonly totalAdjustIn: number;
  /** Total adjustments OUT */
  readonly totalAdjustOut: number;
  /** Net platform reference (NOT profit - reference only) */
  readonly netPlatformReference: number;

  /** Number of flows included */
  readonly flowCount: number;
  /** Confirmed flow count */
  readonly confirmedFlowCount: number;
  /** Pending flow count */
  readonly pendingFlowCount: number;

  /** Source flow IDs for traceability */
  readonly sourceFlowIds: readonly GreyFlowId[];

  /** Checksum for verification */
  readonly checksum: string;
}

/**
 * Get platform period summary.
 *
 * @param registry - Grey flow registry (read-only)
 * @param period - Reconciliation period
 * @returns Platform period summary
 */
export function getPlatformPeriodSummary(
  registry: GreyFlowRegistry,
  period: ReconciliationPeriod
): ReconciliationResult<PlatformPeriodSummary> {
  // Run reconciliation
  const reconcileResult = reconcilePeriod(registry, period);
  if (!reconcileResult.success) {
    return reconciliationFailure(reconcileResult.error);
  }

  const result = reconcileResult.value;

  // Extract platform data
  const platformTotal = result.settlementTotals.find(
    (t) => t.bucket === SettlementBucket.PLATFORM
  );

  const totalRakeIn = platformTotal?.totalRakeIn ?? 0;
  const totalAdjustIn = platformTotal?.totalAdjustIn ?? 0;
  const totalAdjustOut = platformTotal?.totalAdjustOut ?? 0;
  const flowCount = platformTotal?.flowCount ?? 0;

  const sourceFlowIds = result.platformSummary?.flowIds ?? [];

  const summaryData = {
    periodId: period.periodId,
    startTimestamp: period.startTimestamp,
    endTimestamp: period.endTimestamp,
    status: result.status,
    totalRakeIn,
    totalAdjustIn,
    totalAdjustOut,
    netPlatformReference: totalRakeIn + totalAdjustIn - totalAdjustOut,
    flowCount,
    confirmedFlowCount: result.confirmedFlowCount,
    pendingFlowCount: result.pendingFlowCount,
    sourceFlowIds: Object.freeze([...sourceFlowIds]),
  };

  const checksum = calculateReconciliationChecksum(summaryData);

  return reconciliationSuccess(
    Object.freeze({
      ...summaryData,
      checksum,
    })
  );
}

// ============================================================================
// CLUB PERIOD SUMMARY VIEW
// ============================================================================

/**
 * Club period summary.
 * Shows club settlement reference for a period.
 */
export interface ClubPeriodSummary {
  readonly periodId: ReconciliationPeriodId;
  readonly clubPartyId: GreyPartyId;
  readonly status: ReconciliationStatus;

  /** Total rake share received */
  readonly totalRakeIn: number;
  /** Total adjustments IN */
  readonly totalAdjustIn: number;
  /** Total adjustments OUT */
  readonly totalAdjustOut: number;
  /** Net club reference (NOT payout - reference only) */
  readonly netClubReference: number;

  /** Number of flows included */
  readonly flowCount: number;

  /** Source flow IDs for traceability */
  readonly sourceFlowIds: readonly GreyFlowId[];

  /** Checksum for verification */
  readonly checksum: string;
}

/**
 * Get club period summary.
 *
 * @param registry - Grey flow registry (read-only)
 * @param period - Reconciliation period
 * @param clubPartyId - Club party ID
 * @returns Club period summary
 */
export function getClubPeriodSummary(
  registry: GreyFlowRegistry,
  period: ReconciliationPeriod,
  clubPartyId: GreyPartyId
): ReconciliationResult<ClubPeriodSummary> {
  // Run reconciliation
  const reconcileResult = reconcilePeriod(registry, period);
  if (!reconcileResult.success) {
    return reconciliationFailure(reconcileResult.error);
  }

  const result = reconcileResult.value;

  // Find club summary
  const clubSummary = result.clubSummaries.find(
    (s) => s.partyId === clubPartyId
  );

  if (!clubSummary) {
    return reconciliationFailure(
      createReconciliationError(
        ReconciliationErrorCode.NO_DATA_FOR_PERIOD,
        `No data found for club ${clubPartyId} in period ${period.periodId}`,
        { clubPartyId, periodId: period.periodId }
      )
    );
  }

  const summaryData = {
    periodId: period.periodId,
    clubPartyId,
    status: result.status,
    totalRakeIn: clubSummary.totalIn,
    totalAdjustIn: 0, // Would need flow-level data to separate
    totalAdjustOut: clubSummary.totalOut,
    netClubReference: clubSummary.netReference,
    flowCount: clubSummary.recordCount,
    sourceFlowIds: Object.freeze([...clubSummary.flowIds]),
  };

  const checksum = calculateReconciliationChecksum(summaryData);

  return reconciliationSuccess(
    Object.freeze({
      ...summaryData,
      checksum,
    })
  );
}

/**
 * Get all club period summaries.
 *
 * @param registry - Grey flow registry (read-only)
 * @param period - Reconciliation period
 * @returns Array of club period summaries
 */
export function getAllClubPeriodSummaries(
  registry: GreyFlowRegistry,
  period: ReconciliationPeriod
): ReconciliationResult<readonly ClubPeriodSummary[]> {
  // Run reconciliation
  const reconcileResult = reconcilePeriod(registry, period);
  if (!reconcileResult.success) {
    return reconciliationFailure(reconcileResult.error);
  }

  const result = reconcileResult.value;
  const summaries: ClubPeriodSummary[] = [];

  for (const clubSummary of result.clubSummaries) {
    const summaryData = {
      periodId: period.periodId,
      clubPartyId: clubSummary.partyId,
      status: result.status,
      totalRakeIn: clubSummary.totalIn,
      totalAdjustIn: 0,
      totalAdjustOut: clubSummary.totalOut,
      netClubReference: clubSummary.netReference,
      flowCount: clubSummary.recordCount,
      sourceFlowIds: Object.freeze([...clubSummary.flowIds]),
    };

    const checksum = calculateReconciliationChecksum(summaryData);

    summaries.push(
      Object.freeze({
        ...summaryData,
        checksum,
      })
    );
  }

  return reconciliationSuccess(Object.freeze(summaries));
}

// ============================================================================
// AGENT PERIOD SUMMARY VIEW
// ============================================================================

/**
 * Agent period summary.
 * Shows agent commission reference for a period.
 */
export interface AgentPeriodSummary {
  readonly periodId: ReconciliationPeriodId;
  readonly agentPartyId: GreyPartyId;
  readonly status: ReconciliationStatus;

  /** Total commission received */
  readonly totalCommissionIn: number;
  /** Total adjustments IN */
  readonly totalAdjustIn: number;
  /** Total adjustments OUT */
  readonly totalAdjustOut: number;
  /** Net agent reference (NOT payout - reference only) */
  readonly netAgentReference: number;

  /** Number of flows included */
  readonly flowCount: number;

  /** Source flow IDs for traceability */
  readonly sourceFlowIds: readonly GreyFlowId[];

  /** Checksum for verification */
  readonly checksum: string;
}

/**
 * Get agent period summary.
 *
 * @param registry - Grey flow registry (read-only)
 * @param period - Reconciliation period
 * @param agentPartyId - Agent party ID
 * @returns Agent period summary
 */
export function getAgentPeriodSummary(
  registry: GreyFlowRegistry,
  period: ReconciliationPeriod,
  agentPartyId: GreyPartyId
): ReconciliationResult<AgentPeriodSummary> {
  // Run reconciliation
  const reconcileResult = reconcilePeriod(registry, period);
  if (!reconcileResult.success) {
    return reconciliationFailure(reconcileResult.error);
  }

  const result = reconcileResult.value;

  // Find agent summary
  const agentSummary = result.agentSummaries.find(
    (s) => s.partyId === agentPartyId
  );

  if (!agentSummary) {
    return reconciliationFailure(
      createReconciliationError(
        ReconciliationErrorCode.NO_DATA_FOR_PERIOD,
        `No data found for agent ${agentPartyId} in period ${period.periodId}`,
        { agentPartyId, periodId: period.periodId }
      )
    );
  }

  const summaryData = {
    periodId: period.periodId,
    agentPartyId,
    status: result.status,
    totalCommissionIn: agentSummary.totalIn,
    totalAdjustIn: 0,
    totalAdjustOut: agentSummary.totalOut,
    netAgentReference: agentSummary.netReference,
    flowCount: agentSummary.recordCount,
    sourceFlowIds: Object.freeze([...agentSummary.flowIds]),
  };

  const checksum = calculateReconciliationChecksum(summaryData);

  return reconciliationSuccess(
    Object.freeze({
      ...summaryData,
      checksum,
    })
  );
}

/**
 * Get all agent period summaries.
 *
 * @param registry - Grey flow registry (read-only)
 * @param period - Reconciliation period
 * @returns Array of agent period summaries
 */
export function getAllAgentPeriodSummaries(
  registry: GreyFlowRegistry,
  period: ReconciliationPeriod
): ReconciliationResult<readonly AgentPeriodSummary[]> {
  // Run reconciliation
  const reconcileResult = reconcilePeriod(registry, period);
  if (!reconcileResult.success) {
    return reconciliationFailure(reconcileResult.error);
  }

  const result = reconcileResult.value;
  const summaries: AgentPeriodSummary[] = [];

  for (const agentSummary of result.agentSummaries) {
    const summaryData = {
      periodId: period.periodId,
      agentPartyId: agentSummary.partyId,
      status: result.status,
      totalCommissionIn: agentSummary.totalIn,
      totalAdjustIn: 0,
      totalAdjustOut: agentSummary.totalOut,
      netAgentReference: agentSummary.netReference,
      flowCount: agentSummary.recordCount,
      sourceFlowIds: Object.freeze([...agentSummary.flowIds]),
    };

    const checksum = calculateReconciliationChecksum(summaryData);

    summaries.push(
      Object.freeze({
        ...summaryData,
        checksum,
      })
    );
  }

  return reconciliationSuccess(Object.freeze(summaries));
}

// ============================================================================
// DISCREPANCY REPORT VIEW
// ============================================================================

/**
 * Discrepancy report for a period.
 */
export interface DiscrepancyReport {
  readonly periodId: ReconciliationPeriodId;
  readonly generatedTimestamp: number;
  readonly status: ReconciliationStatus;

  /** All discrepancies found */
  readonly discrepancies: readonly Discrepancy[];

  /** Discrepancies by severity */
  readonly bySeverity: Readonly<Record<DiscrepancySeverity, readonly Discrepancy[]>>;

  /** Discrepancies by type */
  readonly byType: Readonly<Record<DiscrepancyType, readonly Discrepancy[]>>;

  /** Total discrepancy count */
  readonly totalCount: number;

  /** Critical discrepancy count */
  readonly criticalCount: number;

  /** Error discrepancy count */
  readonly errorCount: number;

  /** Warning discrepancy count */
  readonly warningCount: number;

  /** Checksum for verification */
  readonly checksum: string;
}

/**
 * Get discrepancy report.
 *
 * @param registry - Grey flow registry (read-only)
 * @param period - Reconciliation period
 * @param generatedTimestamp - Injected timestamp for report generation
 * @returns Discrepancy report
 */
export function getDiscrepancyReport(
  registry: GreyFlowRegistry,
  period: ReconciliationPeriod,
  generatedTimestamp: number
): ReconciliationResult<DiscrepancyReport> {
  // Validate timestamp
  if (!Number.isInteger(generatedTimestamp) || generatedTimestamp <= 0) {
    return reconciliationFailure(
      createReconciliationError(
        ReconciliationErrorCode.INVALID_TIMESTAMP,
        `generatedTimestamp must be a positive integer, got: ${generatedTimestamp}`,
        { generatedTimestamp }
      )
    );
  }

  // Run reconciliation
  const reconcileResult = reconcilePeriod(registry, period);
  if (!reconcileResult.success) {
    return reconciliationFailure(reconcileResult.error);
  }

  const result = reconcileResult.value;

  // Group by severity
  const bySeverity: Record<string, Discrepancy[]> = {
    [DiscrepancySeverity.INFO]: [],
    [DiscrepancySeverity.WARNING]: [],
    [DiscrepancySeverity.ERROR]: [],
    [DiscrepancySeverity.CRITICAL]: [],
  };

  for (const discrepancy of result.discrepancies) {
    bySeverity[discrepancy.severity].push(discrepancy);
  }

  // Group by type
  const byType: Record<string, Discrepancy[]> = {
    [DiscrepancyType.SUM_MISMATCH]: [],
    [DiscrepancyType.MISSING_FLOW]: [],
    [DiscrepancyType.UNEXPECTED_FLOW]: [],
    [DiscrepancyType.STATUS_INCONSISTENCY]: [],
    [DiscrepancyType.DUPLICATE_REFERENCE]: [],
    [DiscrepancyType.NON_INTEGER_VALUE]: [],
  };

  for (const discrepancy of result.discrepancies) {
    byType[discrepancy.type].push(discrepancy);
  }

  const reportData = {
    periodId: period.periodId,
    generatedTimestamp,
    status: result.status,
    discrepancies: result.discrepancies,
    bySeverity: Object.freeze(
      Object.fromEntries(
        Object.entries(bySeverity).map(([k, v]) => [k, Object.freeze(v)])
      )
    ),
    byType: Object.freeze(
      Object.fromEntries(
        Object.entries(byType).map(([k, v]) => [k, Object.freeze(v)])
      )
    ),
    totalCount: result.discrepancies.length,
    criticalCount: bySeverity[DiscrepancySeverity.CRITICAL].length,
    errorCount: bySeverity[DiscrepancySeverity.ERROR].length,
    warningCount: bySeverity[DiscrepancySeverity.WARNING].length,
  };

  const checksum = calculateReconciliationChecksum(reportData);

  return reconciliationSuccess(
    Object.freeze({
      ...reportData,
      checksum,
    }) as DiscrepancyReport
  );
}

// ============================================================================
// MULTI-PERIOD VIEW
// ============================================================================

/**
 * Multi-period summary for trend analysis.
 */
export interface MultiPeriodSummary {
  readonly periods: readonly ReconciliationPeriod[];
  readonly periodResults: readonly PeriodReconciliationResult[];
  readonly totalFlowCount: number;
  readonly totalRakeIn: number;
  readonly balancedPeriodCount: number;
  readonly imbalancedPeriodCount: number;
  readonly incompletePeriodCount: number;
  readonly checksum: string;
}

/**
 * Get multi-period summary.
 *
 * @param registry - Grey flow registry (read-only)
 * @param periods - Array of reconciliation periods
 * @returns Multi-period summary
 */
export function getMultiPeriodSummary(
  registry: GreyFlowRegistry,
  periods: readonly ReconciliationPeriod[]
): ReconciliationResult<MultiPeriodSummary> {
  const periodResults: PeriodReconciliationResult[] = [];

  for (const period of periods) {
    const result = reconcilePeriod(registry, period);
    if (!result.success) {
      return reconciliationFailure(result.error);
    }
    periodResults.push(result.value);
  }

  let totalFlowCount = 0;
  let totalRakeIn = 0;
  let balancedPeriodCount = 0;
  let imbalancedPeriodCount = 0;
  let incompletePeriodCount = 0;

  for (const result of periodResults) {
    totalFlowCount += result.totalFlowCount;

    const platformTotal = result.settlementTotals.find(
      (t) => t.bucket === SettlementBucket.PLATFORM
    );
    if (platformTotal) {
      totalRakeIn += platformTotal.totalRakeIn;
    }

    switch (result.status) {
      case ReconciliationStatus.BALANCED:
        balancedPeriodCount++;
        break;
      case ReconciliationStatus.IMBALANCED:
        imbalancedPeriodCount++;
        break;
      case ReconciliationStatus.INCOMPLETE:
        incompletePeriodCount++;
        break;
    }
  }

  const summaryData = {
    periods: Object.freeze([...periods]),
    periodResults: Object.freeze(periodResults),
    totalFlowCount,
    totalRakeIn,
    balancedPeriodCount,
    imbalancedPeriodCount,
    incompletePeriodCount,
  };

  const checksum = calculateReconciliationChecksum(summaryData);

  return reconciliationSuccess(
    Object.freeze({
      ...summaryData,
      checksum,
    })
  );
}

// ============================================================================
// FLOW TRACEABILITY VIEW
// ============================================================================

/**
 * Flow trace for a specific flow ID.
 */
export interface FlowTrace {
  readonly flowId: GreyFlowId;
  readonly foundInPeriods: readonly ReconciliationPeriodId[];
  readonly contributesToSummaries: readonly GreyPartyId[];
  readonly status: GreyFlowStatus;
  readonly type: GreyFlowType;
  readonly amount: number;
  readonly direction: string;
}

/**
 * Get flow trace.
 * Traces a flow ID through the reconciliation system.
 *
 * @param registry - Grey flow registry (read-only)
 * @param flowId - Flow ID to trace
 * @returns Flow trace
 */
export function getFlowTrace(
  registry: GreyFlowRegistry,
  flowId: GreyFlowId
): FlowTrace | null {
  const flow = registry.getFlow(flowId);

  if (!flow) {
    return null;
  }

  return Object.freeze({
    flowId: flow.flowId,
    foundInPeriods: [], // Would need period context to populate
    contributesToSummaries: [flow.party.partyId],
    status: flow.status,
    type: flow.type,
    amount: flow.amount,
    direction: flow.direction,
  });
}
