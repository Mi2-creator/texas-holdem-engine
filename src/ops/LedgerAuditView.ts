/**
 * LedgerAuditView.ts
 * Phase 31 - Production Observability, Audit & Deterministic Ops (READ-ONLY)
 *
 * Read-only audit view over ledger attribution.
 *
 * PROVIDES:
 * - Per-platform attribution totals
 * - Per-club attribution isolation check
 * - Agent commission consistency verification
 * - Time-windowed attribution rollups
 *
 * RULES:
 * - Uses ONLY src/ledger/views
 * - No aggregation shortcuts
 * - Deterministic ordering
 * - No side effects
 */

import { ClubId } from '../club/ClubTypes';
import { TableId, HandId } from '../security/AuditLog';
import { PlayerId } from '../security/Identity';
import { LedgerEntry, AgentId, AttributionSource } from '../ledger/LedgerTypes';
import {
  TimeWindow,
  PlatformRevenueSummary,
  ClubRevenueSummary,
  AgentCommissionSummary,
} from '../ledger/views';
import {
  OpsTimeRange,
  OpsScope,
  AuditSummary,
  emptyAuditSummary,
  InvariantCheck,
  OpsQueryResult,
  successOpsResult,
  failOpsResult,
} from './OpsTypes';

// ============================================================================
// Audit Types
// ============================================================================

/**
 * Platform attribution totals
 */
export interface PlatformAttributionTotals {
  readonly timestamp: number;
  readonly timeRange: OpsTimeRange;
  readonly totalRevenue: number;
  readonly totalEntries: number;
  readonly bySource: Readonly<Record<AttributionSource, number>>;
  readonly byClub: ReadonlyMap<ClubId, number>;
  readonly byTable: ReadonlyMap<TableId, number>;
}

/**
 * Club attribution isolation check result
 */
export interface ClubIsolationCheckResult {
  readonly clubId: ClubId;
  readonly isolated: boolean;
  readonly totalAttribution: number;
  readonly violations: readonly ClubIsolationViolation[];
}

/**
 * Violation of club isolation
 */
export interface ClubIsolationViolation {
  readonly entryId: string;
  readonly reason: string;
  readonly affectedClubId: ClubId;
  readonly crossReferencedClubId?: ClubId;
}

/**
 * Agent commission consistency result
 */
export interface AgentCommissionConsistencyResult {
  readonly agentId: AgentId;
  readonly consistent: boolean;
  readonly totalCommission: number;
  readonly expectedCommission: number;
  readonly discrepancy: number;
  readonly issues: readonly string[];
}

/**
 * Attribution rollup by time period
 */
export interface AttributionRollup {
  readonly period: string;
  readonly periodStart: number;
  readonly periodEnd: number;
  readonly totalAttribution: number;
  readonly entryCount: number;
  readonly byScope: Readonly<Record<OpsScope, number>>;
}

// ============================================================================
// Audit View Implementation
// ============================================================================

/**
 * Read-only audit view over ledger attribution
 *
 * All operations are deterministic and derive from ledger entries.
 * No aggregation shortcuts - all data is traced to source.
 */
export class LedgerAuditView {
  private readonly getEntries: () => readonly LedgerEntry[];

  constructor(entryProvider: () => readonly LedgerEntry[]) {
    this.getEntries = entryProvider;
  }

  // ==========================================================================
  // Platform Attribution
  // ==========================================================================

  /**
   * Get platform attribution totals
   */
  getPlatformTotals(timeRange: OpsTimeRange): OpsQueryResult<PlatformAttributionTotals> {
    try {
      const entries = this.getEntries();
      const timestamp = Date.now();

      // Filter by time range and platform party
      const platformEntries = entries.filter(
        e =>
          e.affectedParty.partyType === 'PLATFORM' &&
          e.timestamp >= timeRange.fromTimestamp &&
          e.timestamp <= timeRange.toTimestamp
      );

      // Calculate totals
      let totalRevenue = 0;
      const bySource: Record<string, number> = {};
      const byClub = new Map<ClubId, number>();
      const byTable = new Map<TableId, number>();

      for (const entry of platformEntries) {
        totalRevenue += entry.delta;

        // By source
        bySource[entry.source] = (bySource[entry.source] ?? 0) + entry.delta;

        // By club (if available)
        if (entry.clubId) {
          const current = byClub.get(entry.clubId) ?? 0;
          byClub.set(entry.clubId, current + entry.delta);
        }

        // By table (if available)
        if (entry.tableId) {
          const current = byTable.get(entry.tableId) ?? 0;
          byTable.set(entry.tableId, current + entry.delta);
        }
      }

      return successOpsResult({
        timestamp,
        timeRange,
        totalRevenue,
        totalEntries: platformEntries.length,
        bySource: bySource as Record<AttributionSource, number>,
        byClub,
        byTable,
      });
    } catch (error) {
      return failOpsResult(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  // ==========================================================================
  // Club Isolation Check
  // ==========================================================================

  /**
   * Check club attribution isolation
   *
   * Verifies that no entries cross club boundaries improperly.
   */
  checkClubIsolation(clubId: ClubId): OpsQueryResult<ClubIsolationCheckResult> {
    try {
      const entries = this.getEntries();
      const violations: ClubIsolationViolation[] = [];
      let totalAttribution = 0;

      // Get all entries for this club
      const clubEntries = entries.filter(e => e.clubId === clubId);

      for (const entry of clubEntries) {
        totalAttribution += entry.delta;

        // Check: Club party entries should match clubId
        if (entry.affectedParty.partyType === 'CLUB') {
          if (entry.affectedParty.clubId !== clubId) {
            violations.push({
              entryId: entry.entryId,
              reason: 'Club party mismatch',
              affectedClubId: clubId,
              crossReferencedClubId: entry.affectedParty.clubId,
            });
          }
        }

        // Check: No cross-club references in metadata
        const metadata = entry.metadata;
        if (metadata) {
          const crossClubId = metadata['crossClubId'] as ClubId | undefined;
          if (crossClubId && crossClubId !== clubId) {
            violations.push({
              entryId: entry.entryId,
              reason: 'Cross-club reference in metadata',
              affectedClubId: clubId,
              crossReferencedClubId: crossClubId,
            });
          }
        }
      }

      return successOpsResult({
        clubId,
        isolated: violations.length === 0,
        totalAttribution,
        violations,
      });
    } catch (error) {
      return failOpsResult(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Check all clubs for isolation
   */
  checkAllClubsIsolation(): OpsQueryResult<readonly ClubIsolationCheckResult[]> {
    try {
      const entries = this.getEntries();

      // Collect unique club IDs
      const clubIds = new Set<ClubId>();
      for (const entry of entries) {
        if (entry.clubId) {
          clubIds.add(entry.clubId);
        }
      }

      // Check each club
      const results: ClubIsolationCheckResult[] = [];
      for (const clubId of clubIds) {
        const result = this.checkClubIsolation(clubId);
        if (result.success && result.data) {
          results.push(result.data);
        }
      }

      return successOpsResult(results);
    } catch (error) {
      return failOpsResult(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  // ==========================================================================
  // Agent Commission Consistency
  // ==========================================================================

  /**
   * Verify agent commission consistency
   *
   * Checks that agent commissions match expected values based on
   * related entries.
   */
  verifyAgentCommissionConsistency(
    agentId: AgentId
  ): OpsQueryResult<AgentCommissionConsistencyResult> {
    try {
      const entries = this.getEntries();
      const issues: string[] = [];

      // Get agent commission entries
      const agentEntries = entries.filter(
        e => e.affectedParty.partyType === 'AGENT' && e.affectedParty.agentId === agentId
      );

      let totalCommission = 0;
      for (const entry of agentEntries) {
        totalCommission += entry.delta;
      }

      // Calculate expected commission based on related rake entries
      // This is simplified - in real implementation would use commission rate
      let expectedCommission = 0;
      const rakeEntriesWithAgent = entries.filter(
        e =>
          e.source === 'HAND_SETTLEMENT' &&
          e.metadata?.['agentId'] === agentId &&
          e.affectedParty.partyType !== 'AGENT'
      );

      // Sum rake and apply estimated commission rate (e.g., 10%)
      const COMMISSION_RATE = 0.1;
      for (const entry of rakeEntriesWithAgent) {
        if (entry.delta > 0) {
          expectedCommission += Math.floor(entry.delta * COMMISSION_RATE);
        }
      }

      const discrepancy = Math.abs(totalCommission - expectedCommission);
      const consistent = discrepancy === 0 || discrepancy <= Math.ceil(expectedCommission * 0.01);

      if (!consistent) {
        issues.push(
          `Commission discrepancy: expected ~${expectedCommission}, got ${totalCommission}`
        );
      }

      return successOpsResult({
        agentId,
        consistent,
        totalCommission,
        expectedCommission,
        discrepancy,
        issues,
      });
    } catch (error) {
      return failOpsResult(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  // ==========================================================================
  // Attribution Rollups
  // ==========================================================================

  /**
   * Get attribution rollups by hour
   */
  getHourlyRollups(timeRange: OpsTimeRange): OpsQueryResult<readonly AttributionRollup[]> {
    return this.getRollups(timeRange, 60 * 60 * 1000, 'hour');
  }

  /**
   * Get attribution rollups by day
   */
  getDailyRollups(timeRange: OpsTimeRange): OpsQueryResult<readonly AttributionRollup[]> {
    return this.getRollups(timeRange, 24 * 60 * 60 * 1000, 'day');
  }

  /**
   * Internal rollup implementation
   */
  private getRollups(
    timeRange: OpsTimeRange,
    bucketMs: number,
    periodLabel: string
  ): OpsQueryResult<readonly AttributionRollup[]> {
    try {
      const entries = this.getEntries();

      // Filter by time range
      const filteredEntries = entries.filter(
        e => e.timestamp >= timeRange.fromTimestamp && e.timestamp <= timeRange.toTimestamp
      );

      // Group by bucket
      const buckets = new Map<
        number,
        {
          totalAttribution: number;
          entryCount: number;
          byScope: Record<OpsScope, number>;
        }
      >();

      for (const entry of filteredEntries) {
        const bucketStart = Math.floor(entry.timestamp / bucketMs) * bucketMs;

        let bucket = buckets.get(bucketStart);
        if (!bucket) {
          bucket = {
            totalAttribution: 0,
            entryCount: 0,
            byScope: {
              PLATFORM: 0,
              CLUB: 0,
              TABLE: 0,
              HAND: 0,
              PLAYER: 0,
            },
          };
          buckets.set(bucketStart, bucket);
        }

        bucket.totalAttribution += entry.delta;
        bucket.entryCount++;

        // Determine scope
        const scope = this.determineScope(entry);
        bucket.byScope[scope] += entry.delta;
      }

      // Convert to rollups and sort
      const rollups: AttributionRollup[] = [];
      for (const [bucketStart, bucket] of buckets) {
        rollups.push({
          period: `${periodLabel}_${bucketStart}`,
          periodStart: bucketStart,
          periodEnd: bucketStart + bucketMs - 1,
          totalAttribution: bucket.totalAttribution,
          entryCount: bucket.entryCount,
          byScope: bucket.byScope,
        });
      }

      // Sort by period start (deterministic ordering)
      rollups.sort((a, b) => a.periodStart - b.periodStart);

      return successOpsResult(rollups);
    } catch (error) {
      return failOpsResult(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Determine scope from entry
   */
  private determineScope(entry: LedgerEntry): OpsScope {
    if (entry.handId) return 'HAND';
    if (entry.tableId) return 'TABLE';
    if (entry.clubId) return 'CLUB';
    if (entry.affectedParty.partyType === 'PLAYER') return 'PLAYER';
    return 'PLATFORM';
  }

  // ==========================================================================
  // Audit Summary
  // ==========================================================================

  /**
   * Generate complete audit summary
   */
  generateAuditSummary(timeRange: OpsTimeRange): OpsQueryResult<AuditSummary> {
    try {
      const entries = this.getEntries();

      // Filter by time range
      const filteredEntries = entries.filter(
        e => e.timestamp >= timeRange.fromTimestamp && e.timestamp <= timeRange.toTimestamp
      );

      // Calculate summary
      const entriesBySource: Record<string, number> = {};
      const entriesByScope: Record<OpsScope, number> = {
        PLATFORM: 0,
        CLUB: 0,
        TABLE: 0,
        HAND: 0,
        PLAYER: 0,
      };

      for (const entry of filteredEntries) {
        // By source
        entriesBySource[entry.source] = (entriesBySource[entry.source] ?? 0) + 1;

        // By scope
        const scope = this.determineScope(entry);
        entriesByScope[scope]++;
      }

      // Count issues (negative balance entries, etc.)
      let issueCount = 0;
      let criticalIssueCount = 0;

      // Check for potential issues in entries
      for (const entry of filteredEntries) {
        // Large negative deltas might indicate issues
        if (entry.delta < -1000000) {
          issueCount++;
          criticalIssueCount++;
        }
      }

      return successOpsResult({
        timeRange,
        totalEntries: filteredEntries.length,
        entriesBySource,
        entriesByScope,
        issueCount,
        criticalIssueCount,
      });
    } catch (error) {
      return failOpsResult(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  // ==========================================================================
  // Invariant Checks
  // ==========================================================================

  /**
   * Generate invariant checks from ledger audit
   */
  generateInvariantChecks(): readonly InvariantCheck[] {
    const checks: InvariantCheck[] = [];
    const entries = this.getEntries();

    // Check 1: Zero-sum invariant (total deltas should be zero across all parties)
    let totalDelta = 0;
    for (const entry of entries) {
      totalDelta += entry.delta;
    }

    checks.push({
      invariantName: 'ledger_zero_sum',
      passed: totalDelta === 0,
      message:
        totalDelta === 0
          ? 'Ledger is zero-sum balanced'
          : `Ledger imbalance: ${totalDelta}`,
      scope: 'PLATFORM',
    });

    // Check 2: No negative platform revenue
    const platformRevenue = entries
      .filter(e => e.affectedParty.partyType === 'PLATFORM')
      .reduce((sum, e) => sum + e.delta, 0);

    checks.push({
      invariantName: 'platform_non_negative_revenue',
      passed: platformRevenue >= 0,
      message:
        platformRevenue >= 0
          ? `Platform revenue: ${platformRevenue}`
          : `Negative platform revenue: ${platformRevenue}`,
      scope: 'PLATFORM',
    });

    // Check 3: Club isolation (no cross-club entries)
    const clubIds = new Set<ClubId>();
    for (const entry of entries) {
      if (entry.clubId) clubIds.add(entry.clubId);
    }

    let isolationViolations = 0;
    for (const clubId of clubIds) {
      const result = this.checkClubIsolation(clubId);
      if (result.success && result.data && !result.data.isolated) {
        isolationViolations += result.data.violations.length;
      }
    }

    checks.push({
      invariantName: 'club_isolation',
      passed: isolationViolations === 0,
      message:
        isolationViolations === 0
          ? 'All clubs properly isolated'
          : `${isolationViolations} club isolation violations`,
      scope: 'CLUB',
    });

    // Check 4: Sequential entry IDs (no gaps)
    const entryIds = entries.map(e => parseInt(e.entryId.split('_')[1] || '0', 10));
    const sortedIds = [...entryIds].sort((a, b) => a - b);
    let hasGaps = false;
    for (let i = 1; i < sortedIds.length; i++) {
      if (sortedIds[i] - sortedIds[i - 1] > 1) {
        hasGaps = true;
        break;
      }
    }

    checks.push({
      invariantName: 'entry_sequence_continuous',
      passed: !hasGaps,
      message: hasGaps ? 'Entry sequence has gaps' : 'Entry sequence is continuous',
      scope: 'PLATFORM',
    });

    return checks;
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a ledger audit view
 */
export function createLedgerAuditView(
  entryProvider: () => readonly LedgerEntry[]
): LedgerAuditView {
  return new LedgerAuditView(entryProvider);
}
