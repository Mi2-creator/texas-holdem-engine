/**
 * LedgerView.ts
 * Phase 25 - Read-only aggregation and query helpers
 *
 * Provides:
 * - Query filtering by multiple criteria
 * - Aggregation by table, club, agent, time range
 * - Summary statistics for reporting
 * - No mutations - purely read-only operations
 *
 * This is the primary interface for external systems to
 * query ledger data for reporting and audit purposes.
 */

import { PlayerId } from '../security/Identity';
import { TableId, HandId } from '../security/AuditLog';
import { ClubId } from '../club/ClubTypes';

import {
  LedgerEntry,
  LedgerQuery,
  LedgerBatchId,
  AgentId,
  AttributionPartyType,
  AttributionSource,
  HandSettlementCategory,
  AttributionSummary,
  TableAttributionSummary,
  ClubAttributionSummary,
} from './LedgerTypes';
import { ValueLedger } from './LedgerEntry';

// ============================================================================
// Ledger View Implementation
// ============================================================================

/**
 * Read-only view into the value ledger
 *
 * Provides query and aggregation capabilities without
 * any ability to modify ledger state.
 */
export class LedgerView {
  private readonly ledger: ValueLedger;

  constructor(ledger: ValueLedger) {
    this.ledger = ledger;
  }

  // ==========================================================================
  // Query Methods
  // ==========================================================================

  /**
   * Query entries with flexible filtering
   */
  query(params: LedgerQuery): readonly LedgerEntry[] {
    let results = [...this.ledger.getAllEntries()];

    // Filter by party type
    if (params.partyType) {
      results = results.filter(e => e.affectedParty.partyType === params.partyType);
    }

    // Filter by player
    if (params.playerId) {
      results = results.filter(
        e => e.affectedParty.partyType === 'PLAYER' &&
             e.affectedParty.playerId === params.playerId
      );
    }

    // Filter by club
    if (params.clubId) {
      results = results.filter(
        e => e.clubId === params.clubId ||
             (e.affectedParty.partyType === 'CLUB' &&
              e.affectedParty.clubId === params.clubId)
      );
    }

    // Filter by agent
    if (params.agentId) {
      results = results.filter(
        e => e.affectedParty.partyType === 'AGENT' &&
             e.affectedParty.agentId === params.agentId
      );
    }

    // Filter by table
    if (params.tableId) {
      results = results.filter(e => e.tableId === params.tableId);
    }

    // Filter by hand
    if (params.handId) {
      results = results.filter(e => e.handId === params.handId);
    }

    // Filter by source
    if (params.source) {
      results = results.filter(e => e.source === params.source);
    }

    // Filter by category
    if (params.category) {
      results = results.filter(e => e.category === params.category);
    }

    // Filter by timestamp range
    if (params.fromTimestamp !== undefined) {
      results = results.filter(e => e.timestamp >= params.fromTimestamp!);
    }

    if (params.toTimestamp !== undefined) {
      results = results.filter(e => e.timestamp <= params.toTimestamp!);
    }

    // Filter by sequence range
    if (params.fromSequence !== undefined) {
      results = results.filter(e => e.sequence >= params.fromSequence!);
    }

    if (params.toSequence !== undefined) {
      results = results.filter(e => e.sequence <= params.toSequence!);
    }

    // Filter by batch
    if (params.batchId) {
      results = results.filter(e => e.batchId === params.batchId);
    }

    // Apply pagination
    if (params.offset !== undefined) {
      results = results.slice(params.offset);
    }

    if (params.limit !== undefined) {
      results = results.slice(0, params.limit);
    }

    return results;
  }

  /**
   * Get all entries for a specific hand
   */
  getHandEntries(handId: HandId): readonly LedgerEntry[] {
    return this.query({ handId });
  }

  /**
   * Get all entries for a specific table
   */
  getTableEntries(tableId: TableId): readonly LedgerEntry[] {
    return this.query({ tableId });
  }

  /**
   * Get all entries for a specific player
   */
  getPlayerEntries(playerId: PlayerId): readonly LedgerEntry[] {
    return this.query({ playerId });
  }

  /**
   * Get all entries for a specific club
   */
  getClubEntries(clubId: ClubId): readonly LedgerEntry[] {
    return this.query({ clubId });
  }

  /**
   * Get all entries for a specific agent
   */
  getAgentEntries(agentId: AgentId): readonly LedgerEntry[] {
    return this.query({ agentId });
  }

  /**
   * Get entries in a time range
   */
  getEntriesInTimeRange(
    fromTimestamp: number,
    toTimestamp: number
  ): readonly LedgerEntry[] {
    return this.query({ fromTimestamp, toTimestamp });
  }

  // ==========================================================================
  // Aggregation Methods
  // ==========================================================================

  /**
   * Get attribution summary for a party
   */
  getPartySummary(
    partyType: AttributionPartyType,
    partyId: string,
    fromTimestamp?: number,
    toTimestamp?: number
  ): AttributionSummary {
    // Build query based on party type
    let query: LedgerQuery;

    switch (partyType) {
      case 'PLAYER':
        query = {
          partyType,
          fromTimestamp,
          toTimestamp,
          playerId: partyId as PlayerId,
        };
        break;
      case 'CLUB':
        query = {
          partyType,
          fromTimestamp,
          toTimestamp,
          clubId: partyId as ClubId,
        };
        break;
      case 'AGENT':
        query = {
          partyType,
          fromTimestamp,
          toTimestamp,
          agentId: partyId as AgentId,
        };
        break;
      default:
        // PLATFORM doesn't have a specific ID filter in query
        query = {
          partyType,
          fromTimestamp,
          toTimestamp,
        };
    }

    let entries = this.query(query);

    // For PLATFORM, additionally filter by platformId in affectedParty
    if (partyType === 'PLATFORM') {
      entries = entries.filter(
        e => e.affectedParty.partyType === 'PLATFORM' &&
             e.affectedParty.platformId === partyId
      );
    }

    let totalCredit = 0;
    let totalDebit = 0;
    let minTimestamp = Infinity;
    let maxTimestamp = 0;

    for (const entry of entries) {
      if (entry.delta > 0) {
        totalCredit += entry.delta;
      } else {
        totalDebit += Math.abs(entry.delta);
      }

      if (entry.timestamp < minTimestamp) {
        minTimestamp = entry.timestamp;
      }
      if (entry.timestamp > maxTimestamp) {
        maxTimestamp = entry.timestamp;
      }
    }

    return {
      partyType,
      partyId,
      totalCredit,
      totalDebit,
      netAttribution: totalCredit - totalDebit,
      entryCount: entries.length,
      fromTimestamp: entries.length > 0 ? minTimestamp : fromTimestamp ?? 0,
      toTimestamp: entries.length > 0 ? maxTimestamp : toTimestamp ?? Date.now(),
    };
  }

  /**
   * Get attribution summary for a table
   */
  getTableSummary(
    tableId: TableId,
    fromTimestamp?: number,
    toTimestamp?: number
  ): TableAttributionSummary | null {
    const entries = this.query({
      tableId,
      fromTimestamp,
      toTimestamp,
    });

    if (entries.length === 0) {
      return null;
    }

    // Extract club ID from entries
    const clubId = entries.find(e => e.clubId)?.clubId;
    if (!clubId) {
      return null;
    }

    // Count unique hands
    const uniqueHands = new Set(entries.filter(e => e.handId).map(e => e.handId));

    // Calculate totals
    let totalPotWinnings = 0;
    let totalRake = 0;
    const rakeByParty = new Map<string, number>();

    let minTimestamp = Infinity;
    let maxTimestamp = 0;

    for (const entry of entries) {
      if (entry.timestamp < minTimestamp) minTimestamp = entry.timestamp;
      if (entry.timestamp > maxTimestamp) maxTimestamp = entry.timestamp;

      if (entry.source === 'HAND_SETTLEMENT') {
        switch (entry.category) {
          case 'POT_WIN':
            totalPotWinnings += entry.delta;
            break;
          case 'RAKE':
            totalRake += entry.delta;
            break;
          case 'RAKE_SHARE_CLUB':
          case 'RAKE_SHARE_AGENT':
          case 'RAKE_SHARE_PLATFORM':
            const partyKey = `${entry.affectedParty.partyType}:${
              entry.affectedParty.clubId ??
              entry.affectedParty.agentId ??
              entry.affectedParty.platformId
            }`;
            const current = rakeByParty.get(partyKey) ?? 0;
            rakeByParty.set(partyKey, current + entry.delta);
            break;
        }
      }
    }

    return {
      tableId,
      clubId,
      handCount: uniqueHands.size,
      totalPotWinnings,
      totalRake,
      rakeByParty,
      fromTimestamp: minTimestamp !== Infinity ? minTimestamp : fromTimestamp ?? 0,
      toTimestamp: maxTimestamp !== 0 ? maxTimestamp : toTimestamp ?? Date.now(),
    };
  }

  /**
   * Get attribution summary for a club
   */
  getClubSummary(
    clubId: ClubId,
    fromTimestamp?: number,
    toTimestamp?: number
  ): ClubAttributionSummary {
    const entries = this.query({
      clubId,
      fromTimestamp,
      toTimestamp,
    });

    // Count unique tables and hands
    const uniqueTables = new Set(entries.filter(e => e.tableId).map(e => e.tableId));
    const uniqueHands = new Set(entries.filter(e => e.handId).map(e => e.handId));

    // Calculate totals
    let totalRakeCollected = 0;
    let totalTimeFees = 0;
    let platformShare = 0;
    const agentCommissions = new Map<AgentId, number>();

    let minTimestamp = Infinity;
    let maxTimestamp = 0;

    for (const entry of entries) {
      if (entry.timestamp < minTimestamp) minTimestamp = entry.timestamp;
      if (entry.timestamp > maxTimestamp) maxTimestamp = entry.timestamp;

      // Track rake collected
      if (entry.source === 'HAND_SETTLEMENT' && entry.category === 'RAKE') {
        totalRakeCollected += entry.delta;
      }

      // Track time fees
      if (entry.source === 'TIME_FEE' && entry.affectedParty.partyType === 'CLUB') {
        totalTimeFees += entry.delta;
      }

      // Track agent commissions
      if (entry.category === 'RAKE_SHARE_AGENT' && entry.affectedParty.agentId) {
        const agentId = entry.affectedParty.agentId;
        const current = agentCommissions.get(agentId) ?? 0;
        agentCommissions.set(agentId, current + entry.delta);
      }

      // Track platform share
      if (entry.category === 'RAKE_SHARE_PLATFORM') {
        platformShare += entry.delta;
      }
    }

    // Calculate net club revenue
    let totalAgentCommissions = 0;
    for (const commission of agentCommissions.values()) {
      totalAgentCommissions += commission;
    }

    const netClubRevenue = totalRakeCollected + totalTimeFees - totalAgentCommissions - platformShare;

    return {
      clubId,
      tableCount: uniqueTables.size,
      handCount: uniqueHands.size,
      totalRakeCollected,
      totalTimeFees,
      agentCommissions,
      platformShare,
      netClubRevenue,
      fromTimestamp: minTimestamp !== Infinity ? minTimestamp : fromTimestamp ?? 0,
      toTimestamp: maxTimestamp !== 0 ? maxTimestamp : toTimestamp ?? Date.now(),
    };
  }

  /**
   * Get attribution summary for an agent
   */
  getAgentSummary(
    agentId: AgentId,
    fromTimestamp?: number,
    toTimestamp?: number
  ): {
    agentId: AgentId;
    totalCommission: number;
    clubBreakdown: ReadonlyMap<ClubId, number>;
    handCount: number;
    fromTimestamp: number;
    toTimestamp: number;
  } {
    const entries = this.query({
      agentId,
      fromTimestamp,
      toTimestamp,
    });

    let totalCommission = 0;
    const clubBreakdown = new Map<ClubId, number>();
    const uniqueHands = new Set<HandId>();

    let minTimestamp = Infinity;
    let maxTimestamp = 0;

    for (const entry of entries) {
      if (entry.timestamp < minTimestamp) minTimestamp = entry.timestamp;
      if (entry.timestamp > maxTimestamp) maxTimestamp = entry.timestamp;

      totalCommission += entry.delta;

      if (entry.handId) {
        uniqueHands.add(entry.handId);
      }

      if (entry.clubId) {
        const current = clubBreakdown.get(entry.clubId) ?? 0;
        clubBreakdown.set(entry.clubId, current + entry.delta);
      }
    }

    return {
      agentId,
      totalCommission,
      clubBreakdown,
      handCount: uniqueHands.size,
      fromTimestamp: minTimestamp !== Infinity ? minTimestamp : fromTimestamp ?? 0,
      toTimestamp: maxTimestamp !== 0 ? maxTimestamp : toTimestamp ?? Date.now(),
    };
  }

  // ==========================================================================
  // Hand Analysis
  // ==========================================================================

  /**
   * Analyze attribution for a specific hand
   */
  analyzeHand(handId: HandId): {
    handId: HandId;
    tableId?: TableId;
    clubId?: ClubId;
    entries: readonly LedgerEntry[];
    totalPotWinnings: number;
    totalRake: number;
    playerAttributions: ReadonlyMap<PlayerId, number>;
    clubAttribution: number;
    agentAttributions: ReadonlyMap<AgentId, number>;
    platformAttribution: number;
    netBalance: number;  // Should be zero for balanced settlement
  } {
    const entries = this.getHandEntries(handId);

    const tableId = entries.find(e => e.tableId)?.tableId;
    const clubId = entries.find(e => e.clubId)?.clubId;

    let totalPotWinnings = 0;
    let totalRake = 0;
    let clubAttribution = 0;
    let platformAttribution = 0;
    const playerAttributions = new Map<PlayerId, number>();
    const agentAttributions = new Map<AgentId, number>();

    for (const entry of entries) {
      const party = entry.affectedParty;

      switch (party.partyType) {
        case 'PLAYER':
          if (party.playerId) {
            const current = playerAttributions.get(party.playerId) ?? 0;
            playerAttributions.set(party.playerId, current + entry.delta);

            if (entry.category === 'POT_WIN') {
              totalPotWinnings += entry.delta;
            }
          }
          break;

        case 'CLUB':
          clubAttribution += entry.delta;
          if (entry.category === 'RAKE') {
            totalRake += entry.delta;
          }
          break;

        case 'AGENT':
          if (party.agentId) {
            const current = agentAttributions.get(party.agentId) ?? 0;
            agentAttributions.set(party.agentId, current + entry.delta);
          }
          break;

        case 'PLATFORM':
          platformAttribution += entry.delta;
          break;
      }
    }

    // Calculate net balance (should be zero for proper settlement)
    let netBalance = 0;
    for (const amount of playerAttributions.values()) {
      netBalance += amount;
    }
    netBalance += clubAttribution + platformAttribution;
    for (const amount of agentAttributions.values()) {
      netBalance += amount;
    }

    return {
      handId,
      tableId,
      clubId,
      entries,
      totalPotWinnings,
      totalRake,
      playerAttributions,
      clubAttribution,
      agentAttributions,
      platformAttribution,
      netBalance,
    };
  }

  // ==========================================================================
  // Export / Reporting
  // ==========================================================================

  /**
   * Export entries for external reporting
   */
  exportForReporting(
    query: LedgerQuery
  ): readonly {
    sequence: number;
    timestamp: number;
    source: AttributionSource;
    category?: HandSettlementCategory;
    partyType: AttributionPartyType;
    partyId: string;
    delta: number;
    tableId?: TableId;
    handId?: HandId;
    clubId?: ClubId;
    description: string;
  }[] {
    const entries = this.query(query);

    return entries.map(e => ({
      sequence: e.sequence,
      timestamp: e.timestamp,
      source: e.source,
      category: e.category,
      partyType: e.affectedParty.partyType,
      partyId:
        e.affectedParty.playerId ??
        e.affectedParty.clubId ??
        e.affectedParty.agentId ??
        e.affectedParty.platformId ??
        '',
      delta: e.delta,
      tableId: e.tableId,
      handId: e.handId,
      clubId: e.clubId,
      description: e.description,
    }));
  }

  /**
   * Get entry count matching query
   */
  count(query: LedgerQuery): number {
    return this.query(query).length;
  }

  /**
   * Sum deltas matching query
   */
  sumDeltas(query: LedgerQuery): number {
    const entries = this.query(query);
    return entries.reduce((sum, e) => sum + e.delta, 0);
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createLedgerView(ledger: ValueLedger): LedgerView {
  return new LedgerView(ledger);
}
