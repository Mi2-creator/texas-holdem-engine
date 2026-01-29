/**
 * GreyAuditViews.ts
 * Phase A4 - Grey Audit Reconciliation Loop
 *
 * READ-ONLY AUDIT VIEWS
 *
 * This module provides read-only views over audit data.
 * All views are derived from audit output without modification.
 *
 * @external This module operates OUTSIDE the frozen engine.
 * @readonly This module NEVER mutates any data.
 * @deterministic Same inputs always produce same outputs.
 */

import { GreyFlowId, GreyPartyId, GreyPartyType } from '../grey-runtime';
import { ReconciliationPeriodId } from '../grey-reconciliation';
import { AttributionPartyType } from '../grey-attribution';

import {
  GreyAuditSessionId,
  GreyAuditStatus,
  AuditFlag,
  GreyAuditRow,
  GreyAuditSummary,
} from './GreyAuditTypes';

import { AuditOutput } from './GreyAuditEngine';

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
  return `aview_${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

/**
 * Calculate view checksum.
 */
function calculateViewChecksum(data: unknown): string {
  return simpleHash(serializeForChecksum(data));
}

// ============================================================================
// PERIOD SUMMARY VIEW
// ============================================================================

/**
 * Audit summary by period.
 */
export interface AuditSummaryByPeriod {
  readonly periodId: ReconciliationPeriodId;
  readonly sessionId: GreyAuditSessionId;
  readonly auditTimestamp: number;
  /** Total flows audited */
  readonly totalFlows: number;
  /** Flows that passed (MATCHED status) */
  readonly matchedFlows: number;
  /** Flows with partial matches */
  readonly partialFlows: number;
  /** Flows with missing data */
  readonly missingFlows: number;
  /** Orphan flows */
  readonly orphanFlows: number;
  /** Pass rate (matched / total) in basis points */
  readonly passRateBasisPoints: number;
  /** Overall pass status */
  readonly passed: boolean;
  /** Checksum for verification */
  readonly checksum: string;
}

/**
 * Get audit summary by period.
 */
export function getAuditSummaryByPeriod(
  output: AuditOutput
): AuditSummaryByPeriod {
  const { summary } = output;

  const totalFlows = summary.flowCount;
  const matchedFlows = summary.countByStatus[GreyAuditStatus.MATCHED] || 0;
  const partialFlows = summary.countByStatus[GreyAuditStatus.PARTIAL] || 0;
  const missingFlows = summary.countByStatus[GreyAuditStatus.MISSING] || 0;
  const orphanFlows = summary.countByStatus[GreyAuditStatus.ORPHAN] || 0;

  const passRateBasisPoints =
    totalFlows > 0 ? Math.floor((matchedFlows * 10000) / totalFlows) : 0;

  const checksum = calculateViewChecksum({
    type: 'periodSummary',
    periodId: summary.periodId,
    totalFlows,
    matchedFlows,
    passRateBasisPoints,
  });

  return Object.freeze({
    periodId: summary.periodId,
    sessionId: summary.sessionId,
    auditTimestamp: summary.auditTimestamp,
    totalFlows,
    matchedFlows,
    partialFlows,
    missingFlows,
    orphanFlows,
    passRateBasisPoints,
    passed: summary.passed,
    checksum,
  });
}

// ============================================================================
// PARTY SUMMARY VIEW
// ============================================================================

/**
 * Audit summary for a specific party (club/agent).
 */
export interface AuditSummaryByParty {
  readonly partyId: GreyPartyId;
  readonly partyType: AttributionPartyType;
  readonly sessionId: GreyAuditSessionId;
  readonly periodId: ReconciliationPeriodId;
  /** Flows attributed to this party */
  readonly flowCount: number;
  /** Flows with MATCHED status */
  readonly matchedCount: number;
  /** Flows with issues */
  readonly issueCount: number;
  /** Pass rate in basis points */
  readonly passRateBasisPoints: number;
  /** Flow IDs for this party */
  readonly flowIds: readonly GreyFlowId[];
  /** Checksum for verification */
  readonly checksum: string;
}

/**
 * Get audit summary by party from audit output.
 */
export function getAuditSummaryByParty(
  output: AuditOutput,
  partyId: GreyPartyId
): AuditSummaryByParty | null {
  const { summary, rows } = output;

  // Find rows where this party appears in attribution
  const partyRows = rows.filter((row) =>
    row.attributionBreakdown.partyIds.includes(partyId)
  );

  if (partyRows.length === 0) {
    return null;
  }

  // Get party type from first row
  const firstRow = partyRows[0];
  const partyIndex = firstRow.attributionBreakdown.partyIds.indexOf(partyId);
  const partyType = firstRow.attributionBreakdown.partyTypes[partyIndex] || AttributionPartyType.PLATFORM;

  const flowCount = partyRows.length;
  const matchedCount = partyRows.filter(
    (r) => r.auditStatus === GreyAuditStatus.MATCHED
  ).length;
  const issueCount = flowCount - matchedCount;

  const passRateBasisPoints =
    flowCount > 0 ? Math.floor((matchedCount * 10000) / flowCount) : 0;

  const flowIds = partyRows.map((r) => r.greyFlowId);

  const checksum = calculateViewChecksum({
    type: 'partySummary',
    partyId,
    flowCount,
    matchedCount,
    passRateBasisPoints,
  });

  return Object.freeze({
    partyId,
    partyType,
    sessionId: summary.sessionId,
    periodId: summary.periodId,
    flowCount,
    matchedCount,
    issueCount,
    passRateBasisPoints,
    flowIds: Object.freeze(flowIds),
    checksum,
  });
}

/**
 * Get audit summaries for all clubs in the audit.
 */
export function getAllClubAuditSummaries(
  output: AuditOutput
): readonly AuditSummaryByParty[] {
  const { rows } = output;

  // Collect unique club party IDs
  const clubPartyIds = new Set<string>();
  for (const row of rows) {
    for (let i = 0; i < row.attributionBreakdown.partyIds.length; i++) {
      if (row.attributionBreakdown.partyTypes[i] === AttributionPartyType.CLUB) {
        clubPartyIds.add(row.attributionBreakdown.partyIds[i] as string);
      }
    }
  }

  // Get summaries
  const summaries: AuditSummaryByParty[] = [];
  for (const partyIdStr of clubPartyIds) {
    const summary = getAuditSummaryByParty(output, partyIdStr as GreyPartyId);
    if (summary) {
      summaries.push(summary);
    }
  }

  // Sort by party ID for determinism
  summaries.sort((a, b) => (a.partyId as string).localeCompare(b.partyId as string));

  return Object.freeze(summaries);
}

/**
 * Get audit summaries for all agents in the audit.
 */
export function getAllAgentAuditSummaries(
  output: AuditOutput
): readonly AuditSummaryByParty[] {
  const { rows } = output;

  // Collect unique agent party IDs
  const agentPartyIds = new Set<string>();
  for (const row of rows) {
    for (let i = 0; i < row.attributionBreakdown.partyIds.length; i++) {
      if (row.attributionBreakdown.partyTypes[i] === AttributionPartyType.AGENT) {
        agentPartyIds.add(row.attributionBreakdown.partyIds[i] as string);
      }
    }
  }

  // Get summaries
  const summaries: AuditSummaryByParty[] = [];
  for (const partyIdStr of agentPartyIds) {
    const summary = getAuditSummaryByParty(output, partyIdStr as GreyPartyId);
    if (summary) {
      summaries.push(summary);
    }
  }

  // Sort by party ID for determinism
  summaries.sort((a, b) => (a.partyId as string).localeCompare(b.partyId as string));

  return Object.freeze(summaries);
}

// ============================================================================
// EXCEPTION LIST VIEW
// ============================================================================

/**
 * A single audit exception (non-matching case).
 */
export interface AuditException {
  readonly rowId: string;
  readonly greyFlowId: GreyFlowId;
  readonly auditStatus: GreyAuditStatus;
  readonly flags: readonly AuditFlag[];
  readonly description: string;
  readonly severity: 'HIGH' | 'MEDIUM' | 'LOW';
}

/**
 * List of audit exceptions.
 */
export interface AuditExceptionList {
  readonly sessionId: GreyAuditSessionId;
  readonly periodId: ReconciliationPeriodId;
  readonly totalExceptions: number;
  readonly exceptions: readonly AuditException[];
  /** Exceptions by severity */
  readonly highSeverityCount: number;
  readonly mediumSeverityCount: number;
  readonly lowSeverityCount: number;
  /** Checksum for verification */
  readonly checksum: string;
}

/**
 * Determine exception severity from status and flags.
 */
function determineExceptionSeverity(
  status: GreyAuditStatus,
  flags: readonly AuditFlag[]
): 'HIGH' | 'MEDIUM' | 'LOW' {
  // MISSING and ORPHAN are high severity
  if (status === GreyAuditStatus.MISSING || status === GreyAuditStatus.ORPHAN) {
    return 'HIGH';
  }

  // Certain flags indicate high severity
  if (
    flags.includes(AuditFlag.CHECKSUM_FAILED) ||
    flags.includes(AuditFlag.PARTY_MISMATCH)
  ) {
    return 'HIGH';
  }

  // Unconfirmed statuses are medium severity
  if (
    flags.includes(AuditFlag.FLOW_NOT_CONFIRMED) ||
    flags.includes(AuditFlag.RECHARGE_NOT_CONFIRMED)
  ) {
    return 'MEDIUM';
  }

  // Everything else is low severity
  return 'LOW';
}

/**
 * Generate description for an exception.
 */
function generateExceptionDescription(
  status: GreyAuditStatus,
  flags: readonly AuditFlag[]
): string {
  const parts: string[] = [];

  if (status === GreyAuditStatus.MISSING) {
    parts.push('Missing expected data');
  } else if (status === GreyAuditStatus.ORPHAN) {
    parts.push('Orphan flow with no correlations');
  } else if (status === GreyAuditStatus.PARTIAL) {
    parts.push('Partial correlation');
  }

  for (const flag of flags) {
    switch (flag) {
      case AuditFlag.FLOW_NO_RECHARGE:
        parts.push('No recharge link');
        break;
      case AuditFlag.FLOW_NO_ATTRIBUTION:
        parts.push('No attribution');
        break;
      case AuditFlag.RECHARGE_NOT_CONFIRMED:
        parts.push('Recharge not confirmed');
        break;
      case AuditFlag.FLOW_NOT_CONFIRMED:
        parts.push('Flow not confirmed');
        break;
      case AuditFlag.PARTY_MISMATCH:
        parts.push('Party mismatch');
        break;
      case AuditFlag.CHECKSUM_FAILED:
        parts.push('Checksum verification failed');
        break;
      case AuditFlag.MULTIPLE_ATTRIBUTIONS:
        parts.push('Multiple attribution entries');
        break;
    }
  }

  return parts.join('; ') || 'Unknown issue';
}

/**
 * Get list of audit exceptions (non-matching cases only).
 */
export function getAuditExceptionList(
  output: AuditOutput
): AuditExceptionList {
  const { summary, rows, orphanRecharges, orphanAttributions } = output;

  const exceptions: AuditException[] = [];

  // Add exceptions from rows (non-MATCHED)
  for (const row of rows) {
    if (row.auditStatus !== GreyAuditStatus.MATCHED) {
      const severity = determineExceptionSeverity(row.auditStatus, row.flags);
      const description = generateExceptionDescription(row.auditStatus, row.flags);

      exceptions.push(
        Object.freeze({
          rowId: row.rowId,
          greyFlowId: row.greyFlowId,
          auditStatus: row.auditStatus,
          flags: row.flags,
          description,
          severity,
        })
      );
    }
  }

  // Count by severity
  let highSeverityCount = 0;
  let mediumSeverityCount = 0;
  let lowSeverityCount = 0;

  for (const exception of exceptions) {
    switch (exception.severity) {
      case 'HIGH':
        highSeverityCount++;
        break;
      case 'MEDIUM':
        mediumSeverityCount++;
        break;
      case 'LOW':
        lowSeverityCount++;
        break;
    }
  }

  // Add orphan recharge count to high severity
  highSeverityCount += orphanRecharges.length;

  // Add orphan attribution count to high severity
  highSeverityCount += orphanAttributions.length;

  // Sort by severity (HIGH first), then by flow ID
  exceptions.sort((a, b) => {
    const severityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    if (severityOrder[a.severity] !== severityOrder[b.severity]) {
      return severityOrder[a.severity] - severityOrder[b.severity];
    }
    return (a.greyFlowId as string).localeCompare(b.greyFlowId as string);
  });

  const checksum = calculateViewChecksum({
    type: 'exceptionList',
    sessionId: summary.sessionId,
    totalExceptions: exceptions.length + orphanRecharges.length + orphanAttributions.length,
    highSeverityCount,
  });

  return Object.freeze({
    sessionId: summary.sessionId,
    periodId: summary.periodId,
    totalExceptions: exceptions.length + orphanRecharges.length + orphanAttributions.length,
    exceptions: Object.freeze(exceptions),
    highSeverityCount,
    mediumSeverityCount,
    lowSeverityCount,
    checksum,
  });
}

// ============================================================================
// STATUS BREAKDOWN VIEW
// ============================================================================

/**
 * Breakdown of flows by audit status.
 */
export interface AuditStatusBreakdown {
  readonly sessionId: GreyAuditSessionId;
  readonly periodId: ReconciliationPeriodId;
  readonly byStatus: readonly {
    readonly status: GreyAuditStatus;
    readonly count: number;
    readonly percentage: number; // Basis points
    readonly flowIds: readonly GreyFlowId[];
  }[];
  readonly checksum: string;
}

/**
 * Get breakdown of flows by audit status.
 */
export function getAuditStatusBreakdown(
  output: AuditOutput
): AuditStatusBreakdown {
  const { summary, rows } = output;

  // Group by status
  const byStatusMap = new Map<GreyAuditStatus, GreyFlowId[]>();

  for (const status of Object.values(GreyAuditStatus)) {
    byStatusMap.set(status as GreyAuditStatus, []);
  }

  for (const row of rows) {
    const existing = byStatusMap.get(row.auditStatus) || [];
    existing.push(row.greyFlowId);
    byStatusMap.set(row.auditStatus, existing);
  }

  const totalFlows = rows.length;

  const byStatus = Array.from(byStatusMap.entries()).map(([status, flowIds]) => {
    const count = flowIds.length;
    const percentage = totalFlows > 0 ? Math.floor((count * 10000) / totalFlows) : 0;

    return Object.freeze({
      status,
      count,
      percentage,
      flowIds: Object.freeze([...flowIds]),
    });
  });

  // Sort by status for determinism
  byStatus.sort((a, b) => a.status.localeCompare(b.status));

  const checksum = calculateViewChecksum({
    type: 'statusBreakdown',
    sessionId: summary.sessionId,
    counts: byStatus.map((s) => s.count),
  });

  return Object.freeze({
    sessionId: summary.sessionId,
    periodId: summary.periodId,
    byStatus: Object.freeze(byStatus),
    checksum,
  });
}

// ============================================================================
// FLAG BREAKDOWN VIEW
// ============================================================================

/**
 * Breakdown of flows by audit flag.
 */
export interface AuditFlagBreakdown {
  readonly sessionId: GreyAuditSessionId;
  readonly periodId: ReconciliationPeriodId;
  readonly byFlag: readonly {
    readonly flag: AuditFlag;
    readonly count: number;
    readonly flowIds: readonly GreyFlowId[];
  }[];
  readonly checksum: string;
}

/**
 * Get breakdown of flows by audit flag.
 */
export function getAuditFlagBreakdown(
  output: AuditOutput
): AuditFlagBreakdown {
  const { summary, rows } = output;

  // Group by flag
  const byFlagMap = new Map<AuditFlag, GreyFlowId[]>();

  for (const flag of Object.values(AuditFlag)) {
    byFlagMap.set(flag as AuditFlag, []);
  }

  for (const row of rows) {
    for (const flag of row.flags) {
      const existing = byFlagMap.get(flag) || [];
      existing.push(row.greyFlowId);
      byFlagMap.set(flag, existing);
    }
  }

  const byFlag = Array.from(byFlagMap.entries())
    .map(([flag, flowIds]) =>
      Object.freeze({
        flag,
        count: flowIds.length,
        flowIds: Object.freeze([...flowIds]),
      })
    )
    .filter((item) => item.count > 0); // Only include flags with counts

  // Sort by flag for determinism
  byFlag.sort((a, b) => a.flag.localeCompare(b.flag));

  const checksum = calculateViewChecksum({
    type: 'flagBreakdown',
    sessionId: summary.sessionId,
    flags: byFlag.map((f) => f.flag),
  });

  return Object.freeze({
    sessionId: summary.sessionId,
    periodId: summary.periodId,
    byFlag: Object.freeze(byFlag),
    checksum,
  });
}

// ============================================================================
// CORRELATION TRACE VIEW
// ============================================================================

/**
 * Complete correlation trace for a single flow.
 */
export interface FlowCorrelationTrace {
  readonly greyFlowId: GreyFlowId;
  readonly auditStatus: GreyAuditStatus;
  readonly flags: readonly AuditFlag[];
  /** Linked recharge ID (if any) */
  readonly rechargeId: string | null;
  /** Attribution party IDs */
  readonly attributionPartyIds: readonly GreyPartyId[];
  /** Attribution party types */
  readonly attributionPartyTypes: readonly AttributionPartyType[];
  /** Human-readable correlation summary */
  readonly correlationSummary: string;
}

/**
 * Get correlation trace for a specific flow.
 */
export function getFlowCorrelationTrace(
  output: AuditOutput,
  flowId: GreyFlowId
): FlowCorrelationTrace | null {
  const row = output.rows.find((r) => r.greyFlowId === flowId);

  if (!row) {
    return null;
  }

  // Build correlation summary
  const summaryParts: string[] = [];
  summaryParts.push(`Flow ${flowId}`);

  if (row.rechargeId) {
    summaryParts.push(`linked to recharge ${row.rechargeId}`);
  } else {
    summaryParts.push('no recharge link');
  }

  if (row.attributionBreakdown.hasAttribution) {
    summaryParts.push(
      `attributed to ${row.attributionBreakdown.partyIds.length} parties`
    );
  } else {
    summaryParts.push('no attribution');
  }

  return Object.freeze({
    greyFlowId: flowId,
    auditStatus: row.auditStatus,
    flags: row.flags,
    rechargeId: row.rechargeId,
    attributionPartyIds: row.attributionBreakdown.partyIds,
    attributionPartyTypes: row.attributionBreakdown.partyTypes,
    correlationSummary: summaryParts.join(', '),
  });
}

/**
 * Get all correlation traces from audit output.
 */
export function getAllCorrelationTraces(
  output: AuditOutput
): readonly FlowCorrelationTrace[] {
  const traces: FlowCorrelationTrace[] = [];

  for (const row of output.rows) {
    const trace = getFlowCorrelationTrace(output, row.greyFlowId);
    if (trace) {
      traces.push(trace);
    }
  }

  return Object.freeze(traces);
}
