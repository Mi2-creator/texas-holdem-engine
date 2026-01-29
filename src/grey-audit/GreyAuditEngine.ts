/**
 * GreyAuditEngine.ts
 * Phase A4 - Grey Audit Reconciliation Loop
 *
 * PURE FUNCTION CORRELATION ENGINE
 *
 * This module provides a pure function that correlates:
 * - GreyFlowIds
 * - GreyRechargeIds (optional)
 * - Attribution outputs
 *
 * Produces audit verdicts WITHOUT modifying any data.
 *
 * @external This module operates OUTSIDE the frozen engine.
 * @readonly This module NEVER mutates any data.
 * @deterministic Same inputs always produce same outputs.
 */

import { GreyFlowId, GreyFlowRecord, GreyFlowStatus, GreyPartyId } from '../grey-runtime';
import { ReconciliationPeriodId } from '../grey-reconciliation';
import { AttributionSnapshot, PartySummary } from '../grey-attribution';
import { AttributionPartyType } from '../grey-attribution';
import {
  GreyRechargeId,
  GreyRechargeRecord,
  GreyRechargeStatus,
  RechargeLink,
} from '../grey-recharge';

import {
  GreyAuditSessionId,
  GreyAuditRowId,
  GreyAuditStatus,
  AuditFlag,
  GreyAuditRow,
  GreyAuditSummary,
  GreyAuditSessionInput,
  AttributionBreakdownRef,
  AuditResult,
  AuditErrorCode,
  auditSuccess,
  auditFailure,
  createAuditError,
  createGreyAuditRowId,
  isValidTimestamp,
  AUDIT_GENESIS_HASH,
} from './GreyAuditTypes';

// ============================================================================
// AUDIT INPUT INTERFACES
// ============================================================================

/**
 * Flow data for auditing.
 * Read-only snapshot of flows from GreyFlowRegistry.
 */
export interface AuditFlowData {
  /** All flows in the audit period */
  readonly flows: readonly GreyFlowRecord[];
  /** Flow lookup by ID */
  getFlow(flowId: GreyFlowId): GreyFlowRecord | undefined;
}

/**
 * Recharge data for auditing.
 * Read-only snapshot from GreyRechargeRegistry and RechargeLinkRegistry.
 */
export interface AuditRechargeData {
  /** All recharge records in the audit period */
  readonly recharges: readonly GreyRechargeRecord[];
  /** All links in the audit period */
  readonly links: readonly RechargeLink[];
  /** Get recharge by ID */
  getRecharge(rechargeId: GreyRechargeId): GreyRechargeRecord | undefined;
  /** Get links for a flow ID */
  getLinksByFlow(flowId: GreyFlowId): readonly RechargeLink[];
  /** Get links for a recharge ID */
  getLinksByRecharge(rechargeId: GreyRechargeId): readonly RechargeLink[];
}

/**
 * Attribution data for auditing.
 * Read-only snapshot from AttributionSnapshot.
 */
export interface AuditAttributionData {
  /** Attribution snapshot */
  readonly snapshot: AttributionSnapshot | null;
  /** Get attribution entries for a flow */
  getEntriesForFlow(flowId: GreyFlowId): readonly {
    partyId: GreyPartyId;
    partyType: AttributionPartyType;
  }[];
  /** Check if flow has attribution */
  hasAttributionForFlow(flowId: GreyFlowId): boolean;
}

/**
 * Complete audit input.
 */
export interface AuditInput {
  readonly sessionInput: GreyAuditSessionInput;
  readonly flowData: AuditFlowData;
  readonly rechargeData: AuditRechargeData;
  readonly attributionData: AuditAttributionData;
}

// ============================================================================
// AUDIT OUTPUT
// ============================================================================

/**
 * Complete audit output.
 */
export interface AuditOutput {
  readonly summary: GreyAuditSummary;
  readonly rows: readonly GreyAuditRow[];
  /** Orphan recharges (recharges with no linked flows) */
  readonly orphanRecharges: readonly GreyRechargeId[];
  /** Flows with attribution that weren't in flow data */
  readonly orphanAttributions: readonly GreyFlowId[];
}

// ============================================================================
// CHECKSUM CALCULATION
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
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Calculate row checksum.
 */
function calculateRowChecksum(
  rowId: GreyAuditRowId,
  sessionId: GreyAuditSessionId,
  sequence: number,
  flowId: GreyFlowId,
  rechargeId: GreyRechargeId | null,
  auditStatus: GreyAuditStatus,
  flags: readonly AuditFlag[]
): string {
  const data = {
    rowId,
    sessionId,
    sequence,
    flowId,
    rechargeId,
    auditStatus,
    flags: [...flags].sort(),
  };

  return `arow_${simpleHash(serializeForChecksum(data))}`;
}

/**
 * Calculate summary checksum.
 */
function calculateSummaryChecksum(
  sessionId: GreyAuditSessionId,
  periodId: ReconciliationPeriodId,
  auditTimestamp: number,
  totalRows: number,
  countByStatus: Record<string, number>,
  countByFlag: Record<string, number>
): string {
  const data = {
    sessionId,
    periodId,
    auditTimestamp,
    totalRows,
    countByStatus,
    countByFlag,
  };

  return `asum_${simpleHash(serializeForChecksum(data))}`;
}

// ============================================================================
// CORRELATION LOGIC
// ============================================================================

/**
 * Determine audit status and flags for a flow.
 * PURE FUNCTION - no side effects.
 */
function correlateFlow(
  flow: GreyFlowRecord,
  rechargeData: AuditRechargeData,
  attributionData: AuditAttributionData
): {
  auditStatus: GreyAuditStatus;
  flags: AuditFlag[];
  rechargeId: GreyRechargeId | null;
  attributionBreakdown: AttributionBreakdownRef;
} {
  const flags: AuditFlag[] = [];
  let rechargeId: GreyRechargeId | null = null;

  // Check recharge links
  const links = rechargeData.getLinksByFlow(flow.flowId);
  const hasRecharge = links.length > 0;

  if (hasRecharge) {
    // Get first linked recharge (for simplicity)
    rechargeId = links[0].rechargeId;

    // Check recharge status
    const rechargeRecord = rechargeData.getRecharge(rechargeId);
    if (rechargeRecord && rechargeRecord.status !== GreyRechargeStatus.CONFIRMED) {
      flags.push(AuditFlag.RECHARGE_NOT_CONFIRMED);
    }
  } else {
    flags.push(AuditFlag.FLOW_NO_RECHARGE);
  }

  // Check flow status
  if (flow.status !== GreyFlowStatus.CONFIRMED) {
    flags.push(AuditFlag.FLOW_NOT_CONFIRMED);
  }

  // Check attribution
  const hasAttribution = attributionData.hasAttributionForFlow(flow.flowId);
  const attributionEntries = attributionData.getEntriesForFlow(flow.flowId);

  if (!hasAttribution) {
    flags.push(AuditFlag.FLOW_NO_ATTRIBUTION);
  }

  // Check for multiple attributions (not necessarily an error, but flagged)
  if (attributionEntries.length > 1) {
    flags.push(AuditFlag.MULTIPLE_ATTRIBUTIONS);
  }

  // Build attribution breakdown reference
  const attributionBreakdown: AttributionBreakdownRef = Object.freeze({
    sourceFlowId: flow.flowId,
    partyIds: Object.freeze(attributionEntries.map((e) => e.partyId)),
    partyTypes: Object.freeze(attributionEntries.map((e) => e.partyType)),
    hasAttribution,
  });

  // Determine overall status
  let auditStatus: GreyAuditStatus;

  if (hasRecharge && hasAttribution && flags.length === 0) {
    auditStatus = GreyAuditStatus.MATCHED;
  } else if (hasRecharge || hasAttribution) {
    auditStatus = GreyAuditStatus.PARTIAL;
  } else {
    auditStatus = GreyAuditStatus.ORPHAN;
  }

  // Check for missing data that should be present
  if (flow.status === GreyFlowStatus.CONFIRMED && !hasAttribution) {
    auditStatus = GreyAuditStatus.MISSING;
  }

  return {
    auditStatus,
    flags,
    rechargeId,
    attributionBreakdown,
  };
}

/**
 * Find orphan recharges (recharges with no linked flows in the audit set).
 */
function findOrphanRecharges(
  rechargeData: AuditRechargeData,
  flowData: AuditFlowData
): readonly GreyRechargeId[] {
  const orphans: GreyRechargeId[] = [];

  for (const recharge of rechargeData.recharges) {
    const links = rechargeData.getLinksByRecharge(recharge.rechargeId);

    if (links.length === 0) {
      // Recharge has no links at all
      orphans.push(recharge.rechargeId);
    } else {
      // Check if any linked flow exists in the audit set
      let hasLinkedFlow = false;
      for (const link of links) {
        for (const flowId of link.linkedFlowIds) {
          if (flowData.getFlow(flowId)) {
            hasLinkedFlow = true;
            break;
          }
        }
        if (hasLinkedFlow) break;
      }

      if (!hasLinkedFlow) {
        orphans.push(recharge.rechargeId);
      }
    }
  }

  // Sort for determinism
  orphans.sort((a, b) => (a as string).localeCompare(b as string));

  return Object.freeze(orphans);
}

/**
 * Find orphan attributions (flows in attribution that weren't in flow data).
 */
function findOrphanAttributions(
  attributionData: AuditAttributionData,
  flowData: AuditFlowData
): readonly GreyFlowId[] {
  const orphans: GreyFlowId[] = [];

  if (!attributionData.snapshot) {
    return Object.freeze([]);
  }

  // Get unique flow IDs from attribution entries
  const attributedFlowIds = new Set<string>();
  for (const entry of attributionData.snapshot.entries) {
    attributedFlowIds.add(entry.sourceGreyFlowId as string);
  }

  // Check which ones aren't in flow data
  for (const flowIdStr of attributedFlowIds) {
    const flowId = flowIdStr as GreyFlowId;
    if (!flowData.getFlow(flowId)) {
      orphans.push(flowId);
    }
  }

  // Sort for determinism
  orphans.sort((a, b) => (a as string).localeCompare(b as string));

  return Object.freeze(orphans);
}

// ============================================================================
// MAIN AUDIT FUNCTION
// ============================================================================

/**
 * Run the audit correlation.
 *
 * PURE FUNCTION:
 * - Takes read-only data
 * - Returns audit output
 * - NEVER mutates any input data
 * - Deterministic: same inputs produce same outputs
 *
 * @param input - Audit input
 * @returns Result containing the audit output or error
 */
export function runAudit(input: AuditInput): AuditResult<AuditOutput> {
  const { sessionInput, flowData, rechargeData, attributionData } = input;

  // Validate timestamp
  if (!isValidTimestamp(sessionInput.auditTimestamp)) {
    return auditFailure(
      createAuditError(
        AuditErrorCode.INVALID_TIMESTAMP,
        `Audit timestamp must be a positive integer, got: ${sessionInput.auditTimestamp}`,
        { auditTimestamp: sessionInput.auditTimestamp }
      )
    );
  }

  // Initialize counters
  const countByStatus: Record<string, number> = {
    [GreyAuditStatus.MATCHED]: 0,
    [GreyAuditStatus.PARTIAL]: 0,
    [GreyAuditStatus.MISSING]: 0,
    [GreyAuditStatus.ORPHAN]: 0,
  };

  const countByFlag: Record<string, number> = {
    [AuditFlag.FLOW_NO_RECHARGE]: 0,
    [AuditFlag.RECHARGE_NO_FLOW]: 0,
    [AuditFlag.FLOW_NO_ATTRIBUTION]: 0,
    [AuditFlag.ATTRIBUTION_NO_FLOW]: 0,
    [AuditFlag.PARTY_MISMATCH]: 0,
    [AuditFlag.RECHARGE_NOT_CONFIRMED]: 0,
    [AuditFlag.FLOW_NOT_CONFIRMED]: 0,
    [AuditFlag.MULTIPLE_ATTRIBUTIONS]: 0,
    [AuditFlag.CHECKSUM_FAILED]: 0,
  };

  // Process each flow
  const rows: GreyAuditRow[] = [];
  let sequence = 0;
  let rechargeCount = 0;
  let attributedFlowCount = 0;

  // Sort flows for determinism
  const sortedFlows = [...flowData.flows].sort((a, b) =>
    (a.flowId as string).localeCompare(b.flowId as string)
  );

  for (const flow of sortedFlows) {
    const correlation = correlateFlow(flow, rechargeData, attributionData);

    // Create row ID
    const rowId = createGreyAuditRowId(sessionInput.sessionId, sequence);

    // Calculate row checksum
    const rowChecksum = calculateRowChecksum(
      rowId,
      sessionInput.sessionId,
      sequence,
      flow.flowId,
      correlation.rechargeId,
      correlation.auditStatus,
      correlation.flags
    );

    // Create row
    const row: GreyAuditRow = Object.freeze({
      rowId,
      sessionId: sessionInput.sessionId,
      sequence,
      greyFlowId: flow.flowId,
      rechargeId: correlation.rechargeId,
      attributionBreakdown: correlation.attributionBreakdown,
      auditStatus: correlation.auditStatus,
      flags: Object.freeze(correlation.flags),
      checksum: rowChecksum,
    });

    rows.push(row);

    // Update counters
    countByStatus[correlation.auditStatus]++;
    for (const flag of correlation.flags) {
      countByFlag[flag]++;
    }

    if (correlation.rechargeId) {
      rechargeCount++;
    }

    if (correlation.attributionBreakdown.hasAttribution) {
      attributedFlowCount++;
    }

    sequence++;
  }

  // Find orphans
  const orphanRecharges = findOrphanRecharges(rechargeData, flowData);
  const orphanAttributions = findOrphanAttributions(attributionData, flowData);

  // Add orphan recharge count to flags
  countByFlag[AuditFlag.RECHARGE_NO_FLOW] = orphanRecharges.length;

  // Add orphan attribution count to flags
  countByFlag[AuditFlag.ATTRIBUTION_NO_FLOW] = orphanAttributions.length;

  // Calculate if audit passed (no MISSING or ORPHAN statuses, no orphans)
  const passed =
    countByStatus[GreyAuditStatus.MISSING] === 0 &&
    countByStatus[GreyAuditStatus.ORPHAN] === 0 &&
    orphanRecharges.length === 0 &&
    orphanAttributions.length === 0;

  // Calculate summary checksum
  const summaryChecksum = calculateSummaryChecksum(
    sessionInput.sessionId,
    sessionInput.periodId,
    sessionInput.auditTimestamp,
    rows.length,
    countByStatus,
    countByFlag
  );

  // Create summary
  const summary: GreyAuditSummary = Object.freeze({
    sessionId: sessionInput.sessionId,
    periodId: sessionInput.periodId,
    auditTimestamp: sessionInput.auditTimestamp,
    totalRows: rows.length,
    countByStatus: Object.freeze(countByStatus) as Readonly<Record<GreyAuditStatus, number>>,
    countByFlag: Object.freeze(countByFlag) as Readonly<Record<AuditFlag, number>>,
    flowCount: flowData.flows.length,
    rechargeCount,
    attributedFlowCount,
    passed,
    checksum: summaryChecksum,
  });

  return auditSuccess(
    Object.freeze({
      summary,
      rows: Object.freeze(rows),
      orphanRecharges,
      orphanAttributions,
    })
  );
}

// ============================================================================
// HELPER FACTORIES
// ============================================================================

/**
 * Create AuditFlowData from a list of flows.
 */
export function createAuditFlowData(
  flows: readonly GreyFlowRecord[]
): AuditFlowData {
  const flowIndex = new Map<string, GreyFlowRecord>();
  for (const flow of flows) {
    flowIndex.set(flow.flowId as string, flow);
  }

  return Object.freeze({
    flows,
    getFlow: (flowId: GreyFlowId) => flowIndex.get(flowId as string),
  });
}

/**
 * Create AuditRechargeData from recharges and links.
 */
export function createAuditRechargeData(
  recharges: readonly GreyRechargeRecord[],
  links: readonly RechargeLink[]
): AuditRechargeData {
  const rechargeIndex = new Map<string, GreyRechargeRecord>();
  for (const recharge of recharges) {
    rechargeIndex.set(recharge.rechargeId as string, recharge);
  }

  const linksByFlow = new Map<string, RechargeLink[]>();
  const linksByRecharge = new Map<string, RechargeLink[]>();

  for (const link of links) {
    // Index by recharge
    const existingByRecharge = linksByRecharge.get(link.rechargeId as string) || [];
    existingByRecharge.push(link);
    linksByRecharge.set(link.rechargeId as string, existingByRecharge);

    // Index by flow
    for (const flowId of link.linkedFlowIds) {
      const existingByFlow = linksByFlow.get(flowId as string) || [];
      existingByFlow.push(link);
      linksByFlow.set(flowId as string, existingByFlow);
    }
  }

  return Object.freeze({
    recharges,
    links,
    getRecharge: (rechargeId: GreyRechargeId) =>
      rechargeIndex.get(rechargeId as string),
    getLinksByFlow: (flowId: GreyFlowId) =>
      Object.freeze(linksByFlow.get(flowId as string) || []),
    getLinksByRecharge: (rechargeId: GreyRechargeId) =>
      Object.freeze(linksByRecharge.get(rechargeId as string) || []),
  });
}

/**
 * Create AuditAttributionData from a snapshot.
 */
export function createAuditAttributionData(
  snapshot: AttributionSnapshot | null
): AuditAttributionData {
  const entriesByFlow = new Map<string, { partyId: GreyPartyId; partyType: AttributionPartyType }[]>();

  if (snapshot) {
    for (const entry of snapshot.entries) {
      const flowId = entry.sourceGreyFlowId as string;
      const existing = entriesByFlow.get(flowId) || [];
      existing.push({
        partyId: entry.partyId,
        partyType: entry.partyType,
      });
      entriesByFlow.set(flowId, existing);
    }
  }

  return Object.freeze({
    snapshot,
    getEntriesForFlow: (flowId: GreyFlowId) =>
      Object.freeze(entriesByFlow.get(flowId as string) || []),
    hasAttributionForFlow: (flowId: GreyFlowId) =>
      entriesByFlow.has(flowId as string),
  });
}

// ============================================================================
// REPLAY VERIFICATION
// ============================================================================

/**
 * Verify that an audit output is deterministically reproducible.
 * Runs the audit again with the same inputs and compares checksums.
 */
export function verifyAuditReproducibility(
  input: AuditInput,
  previousOutput: AuditOutput
): AuditResult<boolean> {
  const replayResult = runAudit(input);

  if (!replayResult.success) {
    return auditFailure(replayResult.error);
  }

  const replay = replayResult.value;

  // Compare summary checksums
  if (replay.summary.checksum !== previousOutput.summary.checksum) {
    return auditSuccess(false);
  }

  // Compare row checksums
  if (replay.rows.length !== previousOutput.rows.length) {
    return auditSuccess(false);
  }

  for (let i = 0; i < replay.rows.length; i++) {
    if (replay.rows[i].checksum !== previousOutput.rows[i].checksum) {
      return auditSuccess(false);
    }
  }

  return auditSuccess(true);
}
