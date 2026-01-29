/**
 * AttributionViews.ts
 * Phase A2 - Grey Flow Multi-Level Attribution
 *
 * READ-ONLY ATTRIBUTION VIEWS
 *
 * This module provides read-only views over attribution data.
 * All outputs include source flow IDs for traceability.
 *
 * @external This module operates OUTSIDE the frozen engine.
 * @readonly This module NEVER mutates any state.
 * @deterministic Same inputs always produce same outputs.
 */

import { GreyFlowId, GreyPartyId } from '../grey-runtime';
import { ReconciliationPeriodId } from '../grey-reconciliation';

import {
  AttributionEntry,
  AttributionPartyType,
  PeriodAttributionResult,
  AttributionRuleSetId,
  AgentHierarchy,
  AgentHierarchyNode,
  isValidInteger,
} from './AttributionTypes';

import {
  AttributionSnapshot,
  PartySummary,
  PartyTypeSummary,
} from './AttributionSnapshots';

import {
  getDirectChildren,
  getAllDescendants,
  getTopLevelAgents,
} from './AgentHierarchyResolver';

// ============================================================================
// PLATFORM ATTRIBUTION SUMMARY
// ============================================================================

/**
 * Platform attribution summary for a period.
 */
export interface PlatformAttributionSummary {
  readonly periodId: ReconciliationPeriodId;
  readonly ruleSetId: AttributionRuleSetId;
  readonly platformPartyId: GreyPartyId | null;
  /** Total amount attributed to platform */
  readonly totalAttributed: number;
  /** Number of entries for platform */
  readonly entryCount: number;
  /** Source flow IDs */
  readonly sourceFlowIds: readonly GreyFlowId[];
  /** Checksum for verification */
  readonly checksum: string;
}

/**
 * Get platform attribution summary from a snapshot.
 */
export function getPlatformAttributionSummary(
  snapshot: AttributionSnapshot
): PlatformAttributionSummary {
  const platformEntries = snapshot.entries.filter(
    (e) => e.partyType === AttributionPartyType.PLATFORM
  );

  const platformSummary = snapshot.partySummaries.find(
    (s) => s.partyType === AttributionPartyType.PLATFORM
  );

  const flowIds = new Set<string>();
  for (const entry of platformEntries) {
    flowIds.add(entry.sourceGreyFlowId as string);
  }

  const checksum = calculateViewChecksum({
    type: 'platform',
    periodId: snapshot.periodId,
    totalAttributed: platformSummary?.totalAmount ?? 0,
    entryCount: platformEntries.length,
  });

  return Object.freeze({
    periodId: snapshot.periodId,
    ruleSetId: snapshot.ruleSetId,
    platformPartyId: platformSummary?.partyId ?? null,
    totalAttributed: platformSummary?.totalAmount ?? 0,
    entryCount: platformEntries.length,
    sourceFlowIds: Object.freeze(Array.from(flowIds) as GreyFlowId[]),
    checksum,
  });
}

// ============================================================================
// CLUB ATTRIBUTION SUMMARY
// ============================================================================

/**
 * Club attribution summary for a period.
 */
export interface ClubAttributionSummary {
  readonly periodId: ReconciliationPeriodId;
  readonly ruleSetId: AttributionRuleSetId;
  readonly clubPartyId: GreyPartyId;
  /** Total amount attributed to this club */
  readonly totalAttributed: number;
  /** Number of entries */
  readonly entryCount: number;
  /** Source flow IDs */
  readonly sourceFlowIds: readonly GreyFlowId[];
  /** Checksum for verification */
  readonly checksum: string;
}

/**
 * Get club attribution summary for a specific club.
 */
export function getClubAttributionSummary(
  snapshot: AttributionSnapshot,
  clubPartyId: GreyPartyId
): ClubAttributionSummary | null {
  const clubSummary = snapshot.partySummaries.find(
    (s) => s.partyId === clubPartyId && s.partyType === AttributionPartyType.CLUB
  );

  if (!clubSummary) {
    return null;
  }

  const clubEntries = snapshot.entries.filter(
    (e) => e.partyId === clubPartyId && e.partyType === AttributionPartyType.CLUB
  );

  const checksum = calculateViewChecksum({
    type: 'club',
    periodId: snapshot.periodId,
    clubPartyId,
    totalAttributed: clubSummary.totalAmount,
    entryCount: clubEntries.length,
  });

  return Object.freeze({
    periodId: snapshot.periodId,
    ruleSetId: snapshot.ruleSetId,
    clubPartyId,
    totalAttributed: clubSummary.totalAmount,
    entryCount: clubEntries.length,
    sourceFlowIds: clubSummary.sourceFlowIds,
    checksum,
  });
}

/**
 * Get all club attribution summaries from a snapshot.
 */
export function getAllClubAttributionSummaries(
  snapshot: AttributionSnapshot
): readonly ClubAttributionSummary[] {
  const clubSummaries = snapshot.partySummaries.filter(
    (s) => s.partyType === AttributionPartyType.CLUB
  );

  return Object.freeze(
    clubSummaries.map((summary) => {
      const checksum = calculateViewChecksum({
        type: 'club',
        periodId: snapshot.periodId,
        clubPartyId: summary.partyId,
        totalAttributed: summary.totalAmount,
        entryCount: summary.entryCount,
      });

      return Object.freeze({
        periodId: snapshot.periodId,
        ruleSetId: snapshot.ruleSetId,
        clubPartyId: summary.partyId,
        totalAttributed: summary.totalAmount,
        entryCount: summary.entryCount,
        sourceFlowIds: summary.sourceFlowIds,
        checksum,
      });
    })
  );
}

// ============================================================================
// AGENT ATTRIBUTION SUMMARY
// ============================================================================

/**
 * Agent attribution summary for a period.
 */
export interface AgentAttributionSummary {
  readonly periodId: ReconciliationPeriodId;
  readonly ruleSetId: AttributionRuleSetId;
  readonly agentPartyId: GreyPartyId;
  /** Level in hierarchy (if applicable) */
  readonly hierarchyLevel?: number;
  /** Total amount attributed to this agent */
  readonly totalAttributed: number;
  /** Number of entries */
  readonly entryCount: number;
  /** Source flow IDs */
  readonly sourceFlowIds: readonly GreyFlowId[];
  /** Checksum for verification */
  readonly checksum: string;
}

/**
 * Get agent attribution summary for a specific agent.
 */
export function getAgentAttributionSummary(
  snapshot: AttributionSnapshot,
  agentPartyId: GreyPartyId,
  hierarchy?: AgentHierarchy
): AgentAttributionSummary | null {
  const agentSummary = snapshot.partySummaries.find(
    (s) => s.partyId === agentPartyId && s.partyType === AttributionPartyType.AGENT
  );

  if (!agentSummary) {
    return null;
  }

  // Find hierarchy level if hierarchy provided
  let hierarchyLevel: number | undefined;
  if (hierarchy) {
    const node = hierarchy.nodes.find((n) => n.agentId === agentPartyId);
    if (node) {
      hierarchyLevel = node.level;
    }
  }

  const checksum = calculateViewChecksum({
    type: 'agent',
    periodId: snapshot.periodId,
    agentPartyId,
    totalAttributed: agentSummary.totalAmount,
    entryCount: agentSummary.entryCount,
  });

  return Object.freeze({
    periodId: snapshot.periodId,
    ruleSetId: snapshot.ruleSetId,
    agentPartyId,
    hierarchyLevel,
    totalAttributed: agentSummary.totalAmount,
    entryCount: agentSummary.entryCount,
    sourceFlowIds: agentSummary.sourceFlowIds,
    checksum,
  });
}

/**
 * Get all agent attribution summaries from a snapshot.
 */
export function getAllAgentAttributionSummaries(
  snapshot: AttributionSnapshot,
  hierarchy?: AgentHierarchy
): readonly AgentAttributionSummary[] {
  const agentSummaries = snapshot.partySummaries.filter(
    (s) => s.partyType === AttributionPartyType.AGENT
  );

  return Object.freeze(
    agentSummaries.map((summary) => {
      // Find hierarchy level if hierarchy provided
      let hierarchyLevel: number | undefined;
      if (hierarchy) {
        const node = hierarchy.nodes.find((n) => n.agentId === summary.partyId);
        if (node) {
          hierarchyLevel = node.level;
        }
      }

      const checksum = calculateViewChecksum({
        type: 'agent',
        periodId: snapshot.periodId,
        agentPartyId: summary.partyId,
        totalAttributed: summary.totalAmount,
        entryCount: summary.entryCount,
      });

      return Object.freeze({
        periodId: snapshot.periodId,
        ruleSetId: snapshot.ruleSetId,
        agentPartyId: summary.partyId,
        hierarchyLevel,
        totalAttributed: summary.totalAmount,
        entryCount: summary.entryCount,
        sourceFlowIds: summary.sourceFlowIds,
        checksum,
      });
    })
  );
}

// ============================================================================
// PER-FLOW ATTRIBUTION BREAKDOWN
// ============================================================================

/**
 * Attribution breakdown for a single flow.
 */
export interface FlowAttributionBreakdown {
  readonly sourceGreyFlowId: GreyFlowId;
  readonly originalAmount: number;
  readonly entries: readonly AttributionEntry[];
  readonly byPartyType: readonly PartyTypeBreakdown[];
  readonly checksum: string;
}

/**
 * Breakdown by party type for a flow.
 */
export interface PartyTypeBreakdown {
  readonly partyType: AttributionPartyType;
  readonly totalAmount: number;
  readonly percentage: number; // Calculated, not stored
  readonly entryCount: number;
}

/**
 * Get attribution breakdown for a specific flow.
 */
export function getFlowAttributionBreakdown(
  snapshot: AttributionSnapshot,
  flowId: GreyFlowId
): FlowAttributionBreakdown | null {
  const entries = snapshot.entries.filter(
    (e) => e.sourceGreyFlowId === flowId
  );

  if (entries.length === 0) {
    return null;
  }

  // Calculate original amount from first entry
  const originalAmount = entries[0].originalAmount;

  // Group by party type
  const byType = new Map<AttributionPartyType, { amount: number; count: number }>();
  for (const entry of entries) {
    const existing = byType.get(entry.partyType) || { amount: 0, count: 0 };
    existing.amount += entry.amount;
    existing.count++;
    byType.set(entry.partyType, existing);
  }

  const byPartyType: PartyTypeBreakdown[] = [];
  for (const [partyType, data] of byType.entries()) {
    byPartyType.push(
      Object.freeze({
        partyType,
        totalAmount: data.amount,
        percentage: originalAmount > 0 ? (data.amount * 10000) / originalAmount : 0, // In basis points
        entryCount: data.count,
      })
    );
  }

  // Sort for determinism
  byPartyType.sort((a, b) => a.partyType.localeCompare(b.partyType));

  const checksum = calculateViewChecksum({
    type: 'flowBreakdown',
    flowId,
    originalAmount,
    entryCount: entries.length,
  });

  return Object.freeze({
    sourceGreyFlowId: flowId,
    originalAmount,
    entries: Object.freeze([...entries]),
    byPartyType: Object.freeze(byPartyType),
    checksum,
  });
}

/**
 * Get all flow breakdowns from a snapshot.
 */
export function getAllFlowBreakdowns(
  snapshot: AttributionSnapshot
): readonly FlowAttributionBreakdown[] {
  // Get unique flow IDs
  const flowIds = new Set<string>();
  for (const entry of snapshot.entries) {
    flowIds.add(entry.sourceGreyFlowId as string);
  }

  const breakdowns: FlowAttributionBreakdown[] = [];
  for (const flowId of flowIds) {
    const breakdown = getFlowAttributionBreakdown(snapshot, flowId as GreyFlowId);
    if (breakdown) {
      breakdowns.push(breakdown);
    }
  }

  // Sort by flow ID for determinism
  breakdowns.sort((a, b) =>
    (a.sourceGreyFlowId as string).localeCompare(b.sourceGreyFlowId as string)
  );

  return Object.freeze(breakdowns);
}

// ============================================================================
// HIERARCHY ATTRIBUTION VIEW
// ============================================================================

/**
 * Attribution view for an agent with its hierarchy context.
 */
export interface AgentHierarchyAttributionView {
  readonly agentPartyId: GreyPartyId;
  readonly level: number;
  readonly isTopLevel: boolean;
  readonly parentAgentId: GreyPartyId | null;
  readonly totalAttributed: number;
  readonly directChildrenAttribution: number;
  readonly totalTreeAttribution: number;
  readonly sourceFlowIds: readonly GreyFlowId[];
}

/**
 * Get attribution view for an agent with hierarchy context.
 */
export function getAgentHierarchyAttributionView(
  snapshot: AttributionSnapshot,
  hierarchy: AgentHierarchy,
  agentPartyId: GreyPartyId
): AgentHierarchyAttributionView | null {
  const node = hierarchy.nodes.find((n) => n.agentId === agentPartyId);
  if (!node) {
    return null;
  }

  // Get this agent's attribution
  const agentSummary = snapshot.partySummaries.find(
    (s) => s.partyId === agentPartyId && s.partyType === AttributionPartyType.AGENT
  );

  const totalAttributed = agentSummary?.totalAmount ?? 0;

  // Get direct children's attribution
  const directChildren = getDirectChildren(hierarchy, agentPartyId);
  let directChildrenAttribution = 0;
  for (const child of directChildren) {
    const childSummary = snapshot.partySummaries.find(
      (s) => s.partyId === child.agentId && s.partyType === AttributionPartyType.AGENT
    );
    if (childSummary) {
      directChildrenAttribution += childSummary.totalAmount;
    }
  }

  // Get total tree attribution (all descendants)
  const descendants = getAllDescendants(hierarchy, agentPartyId);
  let totalTreeAttribution = totalAttributed;
  for (const desc of descendants) {
    const descSummary = snapshot.partySummaries.find(
      (s) => s.partyId === desc.agentId && s.partyType === AttributionPartyType.AGENT
    );
    if (descSummary) {
      totalTreeAttribution += descSummary.totalAmount;
    }
  }

  return Object.freeze({
    agentPartyId,
    level: node.level,
    isTopLevel: node.parentAgentId === null,
    parentAgentId: node.parentAgentId,
    totalAttributed,
    directChildrenAttribution,
    totalTreeAttribution,
    sourceFlowIds: agentSummary?.sourceFlowIds ?? Object.freeze([]),
  });
}

/**
 * Get hierarchy attribution views for all agents.
 */
export function getAllAgentHierarchyViews(
  snapshot: AttributionSnapshot,
  hierarchy: AgentHierarchy
): readonly AgentHierarchyAttributionView[] {
  const views: AgentHierarchyAttributionView[] = [];

  for (const node of hierarchy.nodes) {
    const view = getAgentHierarchyAttributionView(snapshot, hierarchy, node.agentId);
    if (view) {
      views.push(view);
    }
  }

  // Sort by level then ID for determinism
  views.sort((a, b) => {
    if (a.level !== b.level) {
      return a.level - b.level;
    }
    return (a.agentPartyId as string).localeCompare(b.agentPartyId as string);
  });

  return Object.freeze(views);
}

// ============================================================================
// MULTI-PERIOD SUMMARY
// ============================================================================

/**
 * Multi-period attribution summary.
 */
export interface MultiPeriodAttributionSummary {
  readonly periodIds: readonly ReconciliationPeriodId[];
  readonly ruleSetId: AttributionRuleSetId;
  /** Total across all periods */
  readonly totalOriginal: number;
  readonly totalAttributed: number;
  readonly totalFlowCount: number;
  readonly totalEntryCount: number;
  /** Per party type totals */
  readonly byPartyType: readonly {
    readonly partyType: AttributionPartyType;
    readonly totalAmount: number;
  }[];
  readonly checksum: string;
}

/**
 * Get multi-period attribution summary.
 */
export function getMultiPeriodSummary(
  snapshots: readonly AttributionSnapshot[]
): MultiPeriodAttributionSummary | null {
  if (snapshots.length === 0) {
    return null;
  }

  // All snapshots must have same rule set
  const ruleSetId = snapshots[0].ruleSetId;
  for (const snapshot of snapshots) {
    if (snapshot.ruleSetId !== ruleSetId) {
      return null; // Mixed rule sets not supported
    }
  }

  let totalOriginal = 0;
  let totalAttributed = 0;
  let totalFlowCount = 0;
  let totalEntryCount = 0;
  const byTypeMap = new Map<AttributionPartyType, number>();

  for (const snapshot of snapshots) {
    totalOriginal += snapshot.totalOriginal;
    totalAttributed += snapshot.totalAttributed;
    totalFlowCount += snapshot.flowCount;
    totalEntryCount += snapshot.entryCount;

    for (const summary of snapshot.partyTypeSummaries) {
      const current = byTypeMap.get(summary.partyType) || 0;
      byTypeMap.set(summary.partyType, current + summary.totalAmount);
    }
  }

  const byPartyType: { partyType: AttributionPartyType; totalAmount: number }[] = [];
  for (const [partyType, amount] of byTypeMap.entries()) {
    byPartyType.push(Object.freeze({ partyType, totalAmount: amount }));
  }
  byPartyType.sort((a, b) => a.partyType.localeCompare(b.partyType));

  const checksum = calculateViewChecksum({
    type: 'multiPeriod',
    periodCount: snapshots.length,
    totalOriginal,
    totalAttributed,
  });

  return Object.freeze({
    periodIds: Object.freeze(snapshots.map((s) => s.periodId)),
    ruleSetId,
    totalOriginal,
    totalAttributed,
    totalFlowCount,
    totalEntryCount,
    byPartyType: Object.freeze(byPartyType),
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
  return `view_${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

/**
 * Calculate view checksum.
 */
function calculateViewChecksum(data: unknown): string {
  return simpleHash(serializeForChecksum(data));
}
