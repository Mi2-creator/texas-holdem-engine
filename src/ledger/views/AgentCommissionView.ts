/**
 * AgentCommissionView.ts
 * Phase 26 - Agent Commission Attribution View (read-only)
 *
 * Aggregates AGENT-attributed ledger entries.
 * Supports hierarchical rollups (direct only, no recursive math).
 * Explicitly deterministic ordering.
 *
 * HARD CONSTRAINTS:
 * - Read-only - no mutations to ledger
 * - Pure functions - no side effects
 * - Deterministic - same input produces identical output
 * - Integer-based - all numeric outputs are integers
 * - Direct attribution only - no recursive/hierarchical calculations
 */

import { TableId, HandId } from '../../security/AuditLog';
import { ClubId } from '../../club/ClubTypes';
import {
  LedgerEntry,
  AgentId,
} from '../LedgerTypes';
import { ValueLedger } from '../LedgerEntry';

import {
  TimeWindow,
  TimeGranularity,
  AgentCommissionQuery,
  AgentCommissionEntry,
  AgentCommissionGroup,
  AgentCommissionSummary,
  AgentCommissionRollup,
  ViewResult,
  calculateTimeBucket,
  isWithinTimeWindow,
  normalizeTimeWindow,
} from './RevenueViewTypes';

// ============================================================================
// Agent Commission View Implementation
// ============================================================================

/**
 * Read-only view for agent commission attribution
 *
 * This view consumes LedgerEntry objects and produces aggregated
 * agent commission data. It never modifies the ledger.
 *
 * IMPORTANT: This view only calculates direct attribution.
 * No recursive calculations for agent hierarchies.
 */
export class AgentCommissionView {
  private readonly ledger: ValueLedger;

  constructor(ledger: ValueLedger) {
    this.ledger = ledger;
  }

  // ==========================================================================
  // Query Methods
  // ==========================================================================

  /**
   * Get agent commission summary for a specific agent
   */
  getSummary(query: AgentCommissionQuery): ViewResult<AgentCommissionSummary> {
    const queryTimestamp = Date.now();
    const timeWindow = normalizeTimeWindow(query.timeWindow);

    if (!query.agentId) {
      return {
        success: false,
        error: 'Agent ID is required for summary',
        queryTimestamp,
        entriesScanned: 0,
      };
    }

    try {
      const entries = this.getAgentEntries(
        query.agentId,
        timeWindow,
        query.clubId
      );

      const groups = this.groupEntries(
        entries,
        query.groupBy,
        query.timeGranularity
      );

      // Get unique club IDs
      const clubIds = new Set<ClubId>();
      for (const entry of entries) {
        if (entry.clubId) {
          clubIds.add(entry.clubId);
        }
      }

      const summary: AgentCommissionSummary = {
        agentId: query.agentId,
        totalCommission: entries.reduce((sum, e) => sum + e.amount, 0),
        entryCount: entries.length,
        clubIds: Array.from(clubIds).sort(),
        groups,
        timeWindow,
        queryTimestamp,
      };

      return {
        success: true,
        data: summary,
        queryTimestamp,
        entriesScanned: this.ledger.getStatistics().entryCount,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        queryTimestamp,
        entriesScanned: 0,
      };
    }
  }

  /**
   * Get agent commission entries
   */
  getEntries(query: AgentCommissionQuery): ViewResult<readonly AgentCommissionEntry[]> {
    const queryTimestamp = Date.now();
    const timeWindow = normalizeTimeWindow(query.timeWindow);

    try {
      let entries: readonly AgentCommissionEntry[];

      if (query.agentId) {
        entries = this.getAgentEntries(query.agentId, timeWindow, query.clubId);
      } else {
        entries = this.getAllAgentEntries(timeWindow, query.clubId);
      }

      return {
        success: true,
        data: entries,
        queryTimestamp,
        entriesScanned: this.ledger.getStatistics().entryCount,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        queryTimestamp,
        entriesScanned: 0,
      };
    }
  }

  /**
   * Get total commission for an agent
   */
  getTotalCommission(agentId: AgentId, timeWindow?: TimeWindow): number {
    const entries = this.getAgentEntries(
      agentId,
      normalizeTimeWindow(timeWindow),
      undefined
    );
    return entries.reduce((sum, e) => sum + e.amount, 0);
  }

  /**
   * Get commission by club for an agent
   */
  getCommissionByClub(
    agentId: AgentId,
    timeWindow?: TimeWindow
  ): ReadonlyMap<ClubId, number> {
    const entries = this.getAgentEntries(
      agentId,
      normalizeTimeWindow(timeWindow),
      undefined
    );

    const byClub = new Map<ClubId, number>();

    for (const entry of entries) {
      if (entry.clubId) {
        const current = byClub.get(entry.clubId) ?? 0;
        byClub.set(entry.clubId, current + entry.amount);
      }
    }

    return byClub;
  }

  /**
   * Get commission timeline for an agent
   */
  getTimeline(
    agentId: AgentId,
    granularity: TimeGranularity,
    timeWindow?: TimeWindow
  ): ReadonlyMap<string, number> {
    const entries = this.getAgentEntries(
      agentId,
      normalizeTimeWindow(timeWindow),
      undefined
    );

    const timeline = new Map<string, number>();

    for (const entry of entries) {
      const { bucketKey } = calculateTimeBucket(entry.timestamp, granularity);
      const current = timeline.get(bucketKey) ?? 0;
      timeline.set(bucketKey, current + entry.amount);
    }

    return timeline;
  }

  /**
   * Get rollup of all agents (direct values only, no recursive math)
   */
  getRollup(timeWindow?: TimeWindow): ViewResult<AgentCommissionRollup> {
    const queryTimestamp = Date.now();
    const normalizedWindow = normalizeTimeWindow(timeWindow);

    try {
      const allEntries = this.getAllAgentEntries(normalizedWindow, undefined);

      // Group by agent
      const byAgent = new Map<AgentId, AgentCommissionEntry[]>();

      for (const entry of allEntries) {
        const agentId = this.getAgentIdFromEntry(entry);
        if (!agentId) continue;

        const entries = byAgent.get(agentId) ?? [];
        entries.push(entry);
        byAgent.set(agentId, entries);
      }

      // Build summaries
      const agents: AgentCommissionSummary[] = [];
      let totalCommission = 0;

      for (const [agentId, entries] of byAgent.entries()) {
        const clubIds = new Set<ClubId>();
        let agentTotal = 0;

        for (const entry of entries) {
          agentTotal += entry.amount;
          if (entry.clubId) {
            clubIds.add(entry.clubId);
          }
        }

        totalCommission += agentTotal;

        agents.push({
          agentId,
          totalCommission: agentTotal,
          entryCount: entries.length,
          clubIds: Array.from(clubIds).sort(),
          groups: [],  // Rollup doesn't include detailed groups
          timeWindow: normalizedWindow,
          queryTimestamp,
        });
      }

      // Sort agents deterministically by ID
      agents.sort((a, b) => a.agentId.localeCompare(b.agentId));

      const rollup: AgentCommissionRollup = {
        agents,
        totalCommission,
        agentCount: agents.length,
        timeWindow: normalizedWindow,
        queryTimestamp,
      };

      return {
        success: true,
        data: rollup,
        queryTimestamp,
        entriesScanned: this.ledger.getStatistics().entryCount,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        queryTimestamp,
        entriesScanned: 0,
      };
    }
  }

  /**
   * Get list of all agents with commission entries
   */
  getAgentIds(timeWindow?: TimeWindow): readonly AgentId[] {
    const entries = this.getAllAgentEntries(
      normalizeTimeWindow(timeWindow),
      undefined
    );

    const agentIds = new Set<AgentId>();

    for (const entry of entries) {
      const agentId = this.getAgentIdFromEntry(entry);
      if (agentId) {
        agentIds.add(agentId);
      }
    }

    return Array.from(agentIds).sort();
  }

  // ==========================================================================
  // Internal Methods
  // ==========================================================================

  /**
   * Get all entries for a specific agent
   */
  private getAgentEntries(
    agentId: AgentId,
    timeWindow: TimeWindow,
    clubId?: ClubId
  ): readonly AgentCommissionEntry[] {
    const allEntries = this.ledger.getAllEntries();
    const result: AgentCommissionEntry[] = [];

    for (const entry of allEntries) {
      // Filter: must be AGENT party type
      if (entry.affectedParty.partyType !== 'AGENT') {
        continue;
      }

      // Filter: must match the specific agent ID
      if (entry.affectedParty.agentId !== agentId) {
        continue;
      }

      // Filter: must be within time window
      if (!isWithinTimeWindow(entry.timestamp, timeWindow)) {
        continue;
      }

      // Filter: club if specified
      if (clubId && entry.clubId !== clubId) {
        continue;
      }

      result.push(this.toCommissionEntry(entry));
    }

    // Sort by timestamp for deterministic ordering
    result.sort((a, b) => a.timestamp - b.timestamp || a.entryId.localeCompare(b.entryId));

    return result;
  }

  /**
   * Get all agent entries (across all agents)
   */
  private getAllAgentEntries(
    timeWindow: TimeWindow,
    clubId?: ClubId
  ): readonly AgentCommissionEntry[] {
    const allEntries = this.ledger.getAllEntries();
    const result: AgentCommissionEntry[] = [];

    for (const entry of allEntries) {
      // Filter: must be AGENT party type
      if (entry.affectedParty.partyType !== 'AGENT') {
        continue;
      }

      // Filter: must be within time window
      if (!isWithinTimeWindow(entry.timestamp, timeWindow)) {
        continue;
      }

      // Filter: club if specified
      if (clubId && entry.clubId !== clubId) {
        continue;
      }

      result.push(this.toCommissionEntry(entry));
    }

    // Sort by timestamp for deterministic ordering
    result.sort((a, b) => a.timestamp - b.timestamp || a.entryId.localeCompare(b.entryId));

    return result;
  }

  /**
   * Convert ledger entry to commission entry
   */
  private toCommissionEntry(entry: LedgerEntry): AgentCommissionEntry {
    return {
      entryId: entry.entryId,
      timestamp: entry.timestamp,
      amount: entry.delta,
      clubId: entry.clubId,
      tableId: entry.tableId,
      handId: entry.handId,
      stateVersion: entry.stateVersion,
    };
  }

  /**
   * Extract agent ID from entry
   */
  private getAgentIdFromEntry(entry: AgentCommissionEntry): AgentId | undefined {
    // The agent ID is stored in the ledger entry's affected party
    // We need to look it up from the original ledger entry
    const ledgerEntry = this.ledger.getEntry(entry.entryId);
    return ledgerEntry?.affectedParty.agentId;
  }

  /**
   * Group entries by specified grouping
   */
  private groupEntries(
    entries: readonly AgentCommissionEntry[],
    groupBy?: 'CLUB' | 'TABLE' | 'TIME',
    timeGranularity?: TimeGranularity
  ): readonly AgentCommissionGroup[] {
    if (!groupBy) {
      return [];
    }

    const groups = new Map<string, {
      entries: AgentCommissionEntry[];
      totalCommission: number;
      fromTimestamp: number;
      toTimestamp: number;
    }>();

    for (const entry of entries) {
      let groupKey: string;

      switch (groupBy) {
        case 'CLUB':
          groupKey = entry.clubId ?? 'unknown';
          break;
        case 'TABLE':
          groupKey = entry.tableId ?? 'unknown';
          break;
        case 'TIME':
          const granularity = timeGranularity ?? 'DAY';
          groupKey = calculateTimeBucket(entry.timestamp, granularity).bucketKey;
          break;
      }

      const group = groups.get(groupKey) ?? {
        entries: [],
        totalCommission: 0,
        fromTimestamp: entry.timestamp,
        toTimestamp: entry.timestamp,
      };

      group.entries.push(entry);
      group.totalCommission += entry.amount;
      group.fromTimestamp = Math.min(group.fromTimestamp, entry.timestamp);
      group.toTimestamp = Math.max(group.toTimestamp, entry.timestamp);

      groups.set(groupKey, group);
    }

    const result: AgentCommissionGroup[] = [];

    for (const [groupKey, group] of groups.entries()) {
      result.push({
        groupKey,
        groupType: groupBy,
        totalCommission: group.totalCommission,
        entryCount: group.entries.length,
        entries: group.entries,
        fromTimestamp: group.fromTimestamp,
        toTimestamp: group.toTimestamp,
      });
    }

    // Sort groups deterministically
    result.sort((a, b) => a.groupKey.localeCompare(b.groupKey));

    return result;
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createAgentCommissionView(ledger: ValueLedger): AgentCommissionView {
  return new AgentCommissionView(ledger);
}
