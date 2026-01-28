/**
 * OpsDashboardView.ts
 * Phase 31 - Production Observability, Audit & Deterministic Ops (READ-ONLY)
 *
 * High-level ops-facing snapshot for dashboards.
 *
 * INCLUDES:
 * - HealthSnapshot
 * - IntegrityStatusView
 * - Revenue totals (via Phase 26 views only)
 * - Replay verification summaries
 *
 * RULES:
 * - Zero business logic
 * - Composition only
 * - Read-only
 * - Deterministic: same input → same output
 */

import { LedgerEntry } from '../ledger/LedgerTypes';
import { PlatformRevenueSummary, TimeWindow } from '../ledger/views';
import {
  OpsSnapshotId,
  OpsTimeRange,
  HealthStatus,
  InvariantStatus,
  OpsQueryResult,
  AuditSummary,
  generateOpsSnapshotId,
  successOpsResult,
  failOpsResult,
  createLastHoursRange,
} from './OpsTypes';
import {
  HealthSnapshot,
  HealthSnapshotInput,
  generateHealthSnapshot,
} from './HealthSnapshot';
import {
  IntegrityStatusSnapshot,
  IntegrityStatusInput,
  generateIntegrityStatus,
  DetectionSignal,
  ModerationCaseSummary,
} from './IntegrityStatusView';
import {
  BatchVerificationSummary,
  RecordedHandData,
  verifyHandBatch,
} from './ReplayVerifier';
import {
  LedgerAuditView,
  PlatformAttributionTotals,
} from './LedgerAuditView';

// ============================================================================
// Dashboard Types
// ============================================================================

/**
 * Revenue snapshot (from Phase 26 views)
 */
export interface RevenueSnapshot {
  readonly timeRange: OpsTimeRange;
  readonly totalPlatformRevenue: number;
  readonly totalClubRevenue: number;
  readonly totalAgentCommissions: number;
  readonly entryCount: number;
}

/**
 * Verification snapshot
 */
export interface VerificationSnapshot {
  readonly timeRange: OpsTimeRange;
  readonly totalVerified: number;
  readonly matchCount: number;
  readonly mismatchCount: number;
  readonly errorCount: number;
  readonly verificationRate: number; // 0-1, percentage of matches
}

/**
 * Complete ops dashboard snapshot
 */
export interface OpsDashboardSnapshot {
  readonly snapshotId: OpsSnapshotId;
  readonly timestamp: number;
  readonly timeRange: OpsTimeRange;

  // Overall status
  readonly overallStatus: HealthStatus;

  // Component snapshots
  readonly health: HealthSnapshot;
  readonly integrity: IntegrityStatusSnapshot;
  readonly revenue: RevenueSnapshot;
  readonly verification: VerificationSnapshot;

  // Audit summary
  readonly audit: AuditSummary;

  // Quick stats
  readonly quickStats: OpsDashboardQuickStats;
}

/**
 * Quick statistics for dashboard header
 */
export interface OpsDashboardQuickStats {
  readonly activeTables: number;
  readonly activeHands: number;
  readonly connectedPlayers: number;
  readonly pendingSettlements: number;
  readonly openCases: number;
  readonly highRiskSignals: number;
  readonly invariantsPassed: boolean;
  readonly replayVerificationRate: number;
}

// ============================================================================
// Dashboard Input
// ============================================================================

/**
 * Complete input for dashboard generation
 */
export interface OpsDashboardInput {
  readonly healthInput: HealthSnapshotInput;
  readonly integrityInput: IntegrityStatusInput;
  readonly ledgerEntries: readonly LedgerEntry[];
  readonly recordedHands: readonly RecordedHandData[];
  readonly platformRevenue?: PlatformRevenueSummary;
  readonly timeRange: OpsTimeRange;
}

// ============================================================================
// Dashboard Generation
// ============================================================================

/**
 * Generate complete ops dashboard snapshot
 *
 * Pure function: composition only, zero business logic.
 * Same input always produces same output.
 */
export function generateOpsDashboard(
  input: OpsDashboardInput,
  timestamp: number = Date.now()
): OpsDashboardSnapshot {
  const snapshotId = generateOpsSnapshotId(timestamp);

  // Generate health snapshot
  const health = generateHealthSnapshot(input.healthInput, timestamp);

  // Generate integrity status
  const integrity = generateIntegrityStatus(input.integrityInput, timestamp);

  // Generate revenue snapshot
  const revenue = generateRevenueSnapshot(input.ledgerEntries, input.timeRange, input.platformRevenue);

  // Generate verification snapshot
  const verification = generateVerificationSnapshot(input.recordedHands, input.timeRange, timestamp);

  // Generate audit summary
  const auditView = new LedgerAuditView(() => input.ledgerEntries);
  const auditResult = auditView.generateAuditSummary(input.timeRange);
  const audit = auditResult.success && auditResult.data
    ? auditResult.data
    : {
        timeRange: input.timeRange,
        totalEntries: 0,
        entriesBySource: {},
        entriesByScope: { PLATFORM: 0, CLUB: 0, TABLE: 0, HAND: 0, PLAYER: 0 },
        issueCount: 0,
        criticalIssueCount: 0,
      };

  // Generate quick stats
  const quickStats = generateQuickStats(health, integrity, verification);

  // Derive overall status
  const overallStatus = deriveOverallStatus(health, integrity, verification);

  return {
    snapshotId,
    timestamp,
    timeRange: input.timeRange,
    overallStatus,
    health,
    integrity,
    revenue,
    verification,
    audit,
    quickStats,
  };
}

/**
 * Generate revenue snapshot from ledger entries
 */
function generateRevenueSnapshot(
  entries: readonly LedgerEntry[],
  timeRange: OpsTimeRange,
  platformSummary?: PlatformRevenueSummary
): RevenueSnapshot {
  // Filter by time range
  const filteredEntries = entries.filter(
    e => e.timestamp >= timeRange.fromTimestamp && e.timestamp <= timeRange.toTimestamp
  );

  // Calculate totals by party type
  let totalPlatformRevenue = 0;
  let totalClubRevenue = 0;
  let totalAgentCommissions = 0;

  for (const entry of filteredEntries) {
    if (entry.delta > 0) {
      switch (entry.affectedParty.partyType) {
        case 'PLATFORM':
          totalPlatformRevenue += entry.delta;
          break;
        case 'CLUB':
          totalClubRevenue += entry.delta;
          break;
        case 'AGENT':
          totalAgentCommissions += entry.delta;
          break;
      }
    }
  }

  // Use platform summary if provided (more accurate)
  if (platformSummary) {
    totalPlatformRevenue = platformSummary.totalRevenue;
  }

  return {
    timeRange,
    totalPlatformRevenue,
    totalClubRevenue,
    totalAgentCommissions,
    entryCount: filteredEntries.length,
  };
}

/**
 * Generate verification snapshot
 */
function generateVerificationSnapshot(
  hands: readonly RecordedHandData[],
  timeRange: OpsTimeRange,
  timestamp: number
): VerificationSnapshot {
  // Filter hands by time range
  const filteredHands = hands.filter(
    h => h.startTimestamp >= timeRange.fromTimestamp && h.startTimestamp <= timeRange.toTimestamp
  );

  if (filteredHands.length === 0) {
    return {
      timeRange,
      totalVerified: 0,
      matchCount: 0,
      mismatchCount: 0,
      errorCount: 0,
      verificationRate: 1.0, // No hands = 100% pass
    };
  }

  // Run verification
  const batchResult = verifyHandBatch(filteredHands, timestamp);

  const verificationRate =
    batchResult.totalHands > 0 ? batchResult.matchCount / batchResult.totalHands : 1.0;

  return {
    timeRange,
    totalVerified: batchResult.totalHands,
    matchCount: batchResult.matchCount,
    mismatchCount: batchResult.mismatchCount,
    errorCount: batchResult.errorCount,
    verificationRate,
  };
}

/**
 * Generate quick stats
 */
function generateQuickStats(
  health: HealthSnapshot,
  integrity: IntegrityStatusSnapshot,
  verification: VerificationSnapshot
): OpsDashboardQuickStats {
  return {
    activeTables: health.activeTablesCount,
    activeHands: health.activeHandsCount,
    connectedPlayers: health.connectedPlayersCount,
    pendingSettlements: health.settlements.pendingSettlements,
    openCases: integrity.moderationFlags.openCases,
    highRiskSignals: integrity.integritySignals.highRiskCount,
    invariantsPassed: integrity.invariants.allPassed,
    replayVerificationRate: verification.verificationRate,
  };
}

/**
 * Derive overall status from components
 */
function deriveOverallStatus(
  health: HealthSnapshot,
  integrity: IntegrityStatusSnapshot,
  verification: VerificationSnapshot
): HealthStatus {
  // Critical: unhealthy health or integrity
  if (health.overallStatus === 'UNHEALTHY' || integrity.overallStatus === 'UNHEALTHY') {
    return 'UNHEALTHY';
  }

  // Critical: low verification rate
  if (verification.verificationRate < 0.9 && verification.totalVerified > 0) {
    return 'UNHEALTHY';
  }

  // Degraded: any component degraded
  if (health.overallStatus === 'DEGRADED' || integrity.overallStatus === 'DEGRADED') {
    return 'DEGRADED';
  }

  // Degraded: verification issues
  if (verification.mismatchCount > 0 || verification.errorCount > 0) {
    return 'DEGRADED';
  }

  return 'HEALTHY';
}

// ============================================================================
// Ops Dashboard View
// ============================================================================

/**
 * Read-only ops dashboard view
 *
 * Composition only - delegates to specialized views.
 */
export class OpsDashboardView {
  private readonly getHealthInput: () => HealthSnapshotInput;
  private readonly getIntegrityInput: () => IntegrityStatusInput;
  private readonly getLedgerEntries: () => readonly LedgerEntry[];
  private readonly getRecordedHands: () => readonly RecordedHandData[];
  private readonly getPlatformRevenue: () => PlatformRevenueSummary | undefined;

  constructor(
    healthProvider: () => HealthSnapshotInput,
    integrityProvider: () => IntegrityStatusInput,
    ledgerProvider: () => readonly LedgerEntry[],
    handsProvider: () => readonly RecordedHandData[],
    revenueProvider?: () => PlatformRevenueSummary | undefined
  ) {
    this.getHealthInput = healthProvider;
    this.getIntegrityInput = integrityProvider;
    this.getLedgerEntries = ledgerProvider;
    this.getRecordedHands = handsProvider;
    this.getPlatformRevenue = revenueProvider ?? (() => undefined);
  }

  /**
   * Get complete dashboard snapshot
   */
  getDashboard(timeRange: OpsTimeRange): OpsQueryResult<OpsDashboardSnapshot> {
    try {
      const input: OpsDashboardInput = {
        healthInput: this.getHealthInput(),
        integrityInput: this.getIntegrityInput(),
        ledgerEntries: this.getLedgerEntries(),
        recordedHands: this.getRecordedHands(),
        platformRevenue: this.getPlatformRevenue(),
        timeRange,
      };

      const dashboard = generateOpsDashboard(input);
      return successOpsResult(dashboard);
    } catch (error) {
      return failOpsResult(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Get quick stats only
   */
  getQuickStats(timeRange: OpsTimeRange): OpsQueryResult<OpsDashboardQuickStats> {
    const result = this.getDashboard(timeRange);
    if (!result.success || !result.data) {
      return failOpsResult(result.error ?? 'Failed to generate dashboard');
    }
    return successOpsResult(result.data.quickStats);
  }

  /**
   * Get overall status only
   */
  getOverallStatus(timeRange: OpsTimeRange): OpsQueryResult<HealthStatus> {
    const result = this.getDashboard(timeRange);
    if (!result.success || !result.data) {
      return failOpsResult(result.error ?? 'Failed to generate dashboard');
    }
    return successOpsResult(result.data.overallStatus);
  }

  /**
   * Get health snapshot only
   */
  getHealthSnapshot(): OpsQueryResult<HealthSnapshot> {
    try {
      const health = generateHealthSnapshot(this.getHealthInput());
      return successOpsResult(health);
    } catch (error) {
      return failOpsResult(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Get integrity status only
   */
  getIntegrityStatus(timeRange: OpsTimeRange): OpsQueryResult<IntegrityStatusSnapshot> {
    try {
      const integrityInput = this.getIntegrityInput();
      const integrity = generateIntegrityStatus({
        ...integrityInput,
        timeRange,
      });
      return successOpsResult(integrity);
    } catch (error) {
      return failOpsResult(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Get revenue snapshot only
   */
  getRevenueSnapshot(timeRange: OpsTimeRange): OpsQueryResult<RevenueSnapshot> {
    try {
      const revenue = generateRevenueSnapshot(
        this.getLedgerEntries(),
        timeRange,
        this.getPlatformRevenue()
      );
      return successOpsResult(revenue);
    } catch (error) {
      return failOpsResult(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Get verification snapshot only
   */
  getVerificationSnapshot(timeRange: OpsTimeRange): OpsQueryResult<VerificationSnapshot> {
    try {
      const verification = generateVerificationSnapshot(
        this.getRecordedHands(),
        timeRange,
        Date.now()
      );
      return successOpsResult(verification);
    } catch (error) {
      return failOpsResult(error instanceof Error ? error.message : 'Unknown error');
    }
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create an ops dashboard view
 */
export function createOpsDashboardView(
  healthProvider: () => HealthSnapshotInput,
  integrityProvider: () => IntegrityStatusInput,
  ledgerProvider: () => readonly LedgerEntry[],
  handsProvider: () => readonly RecordedHandData[],
  revenueProvider?: () => PlatformRevenueSummary | undefined
): OpsDashboardView {
  return new OpsDashboardView(
    healthProvider,
    integrityProvider,
    ledgerProvider,
    handsProvider,
    revenueProvider
  );
}

/**
 * Create empty dashboard input for testing
 */
export function emptyOpsDashboardInput(timeRange: OpsTimeRange): OpsDashboardInput {
  return {
    healthInput: {
      tables: [],
      sessions: [],
      settlements: [],
      latestServerVersion: 0,
      invariantChecks: [],
    },
    integrityInput: {
      ledger: { entries: [] },
      integrity: { signals: [] },
      moderation: { cases: [] },
      timeRange,
    },
    ledgerEntries: [],
    recordedHands: [],
    timeRange,
  };
}
