/**
 * HealthSnapshot.ts
 * Phase 31 - Production Observability, Audit & Deterministic Ops (READ-ONLY)
 *
 * Deterministic health snapshot of system state.
 *
 * PROVIDES:
 * - Active tables count
 * - Active hands count
 * - Connected sessions
 * - Pending settlements (count only)
 * - Sync lag metrics (derived, not measured)
 * - Integrity invariant status (pass/fail)
 *
 * RULES:
 * - No polling
 * - No side effects
 * - Derived strictly from in-memory state + persistence snapshots
 * - Deterministic: same input → same output
 */

import { TableId, HandId } from '../security/AuditLog';
import { ClubId } from '../club/ClubTypes';
import { PlayerId } from '../security/Identity';
import {
  OpsSnapshotId,
  HealthStatus,
  ComponentHealth,
  SyncLagMetrics,
  InvariantStatus,
  InvariantCheck,
  generateOpsSnapshotId,
  deriveOverallHealth,
  createSyncLagMetrics,
  createInvariantStatus,
} from './OpsTypes';

// ============================================================================
// Health Snapshot Types
// ============================================================================

/**
 * Table health info
 */
export interface TableHealthInfo {
  readonly tableId: TableId;
  readonly clubId: ClubId;
  readonly playerCount: number;
  readonly hasActiveHand: boolean;
  readonly handId: HandId | null;
  readonly lastActivityTimestamp: number;
}

/**
 * Session health info
 */
export interface SessionHealthInfo {
  readonly activeSessions: number;
  readonly disconnectedSessions: number;
  readonly reconnectingSessions: number;
  readonly sessionsByTable: ReadonlyMap<TableId, number>;
}

/**
 * Settlement health info
 */
export interface SettlementHealthInfo {
  readonly pendingSettlements: number;
  readonly pendingByClub: ReadonlyMap<ClubId, number>;
  readonly oldestPendingTimestamp: number | null;
}

/**
 * Complete health snapshot
 */
export interface HealthSnapshot {
  readonly snapshotId: OpsSnapshotId;
  readonly timestamp: number;
  readonly overallStatus: HealthStatus;

  // Counts
  readonly activeTablesCount: number;
  readonly activeHandsCount: number;
  readonly connectedPlayersCount: number;

  // Detailed info
  readonly tables: readonly TableHealthInfo[];
  readonly sessions: SessionHealthInfo;
  readonly settlements: SettlementHealthInfo;
  readonly syncLag: SyncLagMetrics;
  readonly invariants: InvariantStatus;

  // Component health
  readonly components: readonly ComponentHealth[];
}

// ============================================================================
// Input Types for Snapshot Generation
// ============================================================================

/**
 * Table state input (read-only view)
 */
export interface TableStateInput {
  readonly tableId: TableId;
  readonly clubId: ClubId;
  readonly playerIds: readonly PlayerId[];
  readonly hasActiveHand: boolean;
  readonly currentHandId: HandId | null;
  readonly lastActivityTimestamp: number;
}

/**
 * Session state input (read-only view)
 */
export interface SessionStateInput {
  readonly tableId: TableId;
  readonly playerId: PlayerId;
  readonly status: 'CONNECTED' | 'DISCONNECTED' | 'RECONNECTING';
  readonly stateVersion: number;
}

/**
 * Settlement state input (read-only view)
 */
export interface SettlementStateInput {
  readonly handId: HandId;
  readonly clubId: ClubId;
  readonly status: 'PENDING' | 'COMPLETED';
  readonly createdTimestamp: number;
}

/**
 * Complete input for health snapshot generation
 */
export interface HealthSnapshotInput {
  readonly tables: readonly TableStateInput[];
  readonly sessions: readonly SessionStateInput[];
  readonly settlements: readonly SettlementStateInput[];
  readonly latestServerVersion: number;
  readonly invariantChecks: readonly InvariantCheck[];
}

// ============================================================================
// Health Snapshot Generation
// ============================================================================

/**
 * Generate a deterministic health snapshot
 *
 * Pure function: same input always produces same output.
 * No side effects, no external state access.
 */
export function generateHealthSnapshot(
  input: HealthSnapshotInput,
  timestamp: number = Date.now()
): HealthSnapshot {
  const snapshotId = generateOpsSnapshotId(timestamp);

  // Process tables
  const tables: TableHealthInfo[] = input.tables.map(t => ({
    tableId: t.tableId,
    clubId: t.clubId,
    playerCount: t.playerIds.length,
    hasActiveHand: t.hasActiveHand,
    handId: t.currentHandId,
    lastActivityTimestamp: t.lastActivityTimestamp,
  }));

  const activeTablesCount = tables.filter(t => t.playerCount > 0).length;
  const activeHandsCount = tables.filter(t => t.hasActiveHand).length;

  // Process sessions
  const activeSessions = input.sessions.filter(s => s.status === 'CONNECTED').length;
  const disconnectedSessions = input.sessions.filter(s => s.status === 'DISCONNECTED').length;
  const reconnectingSessions = input.sessions.filter(s => s.status === 'RECONNECTING').length;

  const sessionsByTable = new Map<TableId, number>();
  for (const session of input.sessions) {
    if (session.status === 'CONNECTED') {
      const count = sessionsByTable.get(session.tableId) ?? 0;
      sessionsByTable.set(session.tableId, count + 1);
    }
  }

  const sessions: SessionHealthInfo = {
    activeSessions,
    disconnectedSessions,
    reconnectingSessions,
    sessionsByTable,
  };

  // Count unique connected players
  const connectedPlayers = new Set<PlayerId>();
  for (const session of input.sessions) {
    if (session.status === 'CONNECTED') {
      connectedPlayers.add(session.playerId);
    }
  }

  // Process settlements
  const pendingSettlements = input.settlements.filter(s => s.status === 'PENDING');
  const pendingByClub = new Map<ClubId, number>();
  let oldestPendingTimestamp: number | null = null;

  for (const settlement of pendingSettlements) {
    const count = pendingByClub.get(settlement.clubId) ?? 0;
    pendingByClub.set(settlement.clubId, count + 1);

    if (oldestPendingTimestamp === null || settlement.createdTimestamp < oldestPendingTimestamp) {
      oldestPendingTimestamp = settlement.createdTimestamp;
    }
  }

  const settlements: SettlementHealthInfo = {
    pendingSettlements: pendingSettlements.length,
    pendingByClub,
    oldestPendingTimestamp,
  };

  // Calculate sync lag
  const clientVersions = input.sessions
    .filter(s => s.status === 'CONNECTED')
    .map(s => s.stateVersion);
  const syncLag = createSyncLagMetrics(input.latestServerVersion, clientVersions);

  // Create invariant status
  const invariants = createInvariantStatus(input.invariantChecks, timestamp);

  // Derive component health
  const components = deriveComponentHealth(
    activeTablesCount,
    activeHandsCount,
    activeSessions,
    pendingSettlements.length,
    syncLag,
    invariants,
    timestamp
  );

  const overallStatus = deriveOverallHealth(components);

  return {
    snapshotId,
    timestamp,
    overallStatus,
    activeTablesCount,
    activeHandsCount,
    connectedPlayersCount: connectedPlayers.size,
    tables,
    sessions,
    settlements,
    syncLag,
    invariants,
    components,
  };
}

/**
 * Derive component health from metrics
 */
function deriveComponentHealth(
  activeTablesCount: number,
  activeHandsCount: number,
  activeSessions: number,
  pendingSettlements: number,
  syncLag: SyncLagMetrics,
  invariants: InvariantStatus,
  timestamp: number
): ComponentHealth[] {
  const components: ComponentHealth[] = [];

  // Tables component
  components.push({
    component: 'tables',
    status: 'HEALTHY',
    lastCheck: timestamp,
  });

  // Sessions component
  const sessionStatus: HealthStatus =
    activeSessions === 0 && activeTablesCount > 0 ? 'DEGRADED' : 'HEALTHY';
  components.push({
    component: 'sessions',
    status: sessionStatus,
    message: sessionStatus === 'DEGRADED' ? 'Active tables with no sessions' : undefined,
    lastCheck: timestamp,
  });

  // Sync component
  const syncStatus: HealthStatus =
    syncLag.maxLag > 10 ? 'DEGRADED' : 'HEALTHY';
  components.push({
    component: 'sync',
    status: syncStatus,
    message: syncStatus === 'DEGRADED' ? `Max sync lag: ${syncLag.maxLag}` : undefined,
    lastCheck: timestamp,
  });

  // Settlement component
  const settlementStatus: HealthStatus =
    pendingSettlements > 100 ? 'DEGRADED' : 'HEALTHY';
  components.push({
    component: 'settlement',
    status: settlementStatus,
    message: settlementStatus === 'DEGRADED' ? `${pendingSettlements} pending settlements` : undefined,
    lastCheck: timestamp,
  });

  // Integrity component
  const integrityStatus: HealthStatus =
    invariants.allPassed ? 'HEALTHY' : 'UNHEALTHY';
  components.push({
    component: 'integrity',
    status: integrityStatus,
    message: integrityStatus === 'UNHEALTHY' ? `${invariants.failedCount} invariant failures` : undefined,
    lastCheck: timestamp,
  });

  return components;
}

// ============================================================================
// Empty/Default Snapshot
// ============================================================================

/**
 * Create an empty health snapshot input
 */
export function emptyHealthSnapshotInput(): HealthSnapshotInput {
  return {
    tables: [],
    sessions: [],
    settlements: [],
    latestServerVersion: 0,
    invariantChecks: [],
  };
}

/**
 * Create a healthy snapshot (for testing/defaults)
 */
export function createHealthySnapshot(timestamp: number = Date.now()): HealthSnapshot {
  return generateHealthSnapshot(emptyHealthSnapshotInput(), timestamp);
}

// ============================================================================
// Comparison Functions
// ============================================================================

/**
 * Compare two health snapshots for changes
 */
export interface HealthSnapshotDiff {
  readonly previousSnapshot: OpsSnapshotId;
  readonly currentSnapshot: OpsSnapshotId;
  readonly statusChanged: boolean;
  readonly previousStatus: HealthStatus;
  readonly currentStatus: HealthStatus;
  readonly tableCountDelta: number;
  readonly handCountDelta: number;
  readonly sessionCountDelta: number;
  readonly settlementCountDelta: number;
  readonly newIssues: readonly string[];
  readonly resolvedIssues: readonly string[];
}

/**
 * Calculate diff between two snapshots
 */
export function diffHealthSnapshots(
  previous: HealthSnapshot,
  current: HealthSnapshot
): HealthSnapshotDiff {
  // Find new issues (components that became unhealthy)
  const newIssues: string[] = [];
  const resolvedIssues: string[] = [];

  for (const currentComp of current.components) {
    const prevComp = previous.components.find(c => c.component === currentComp.component);
    if (prevComp) {
      if (prevComp.status === 'HEALTHY' && currentComp.status !== 'HEALTHY') {
        newIssues.push(`${currentComp.component}: ${currentComp.message ?? currentComp.status}`);
      } else if (prevComp.status !== 'HEALTHY' && currentComp.status === 'HEALTHY') {
        resolvedIssues.push(`${currentComp.component}: resolved`);
      }
    }
  }

  return {
    previousSnapshot: previous.snapshotId,
    currentSnapshot: current.snapshotId,
    statusChanged: previous.overallStatus !== current.overallStatus,
    previousStatus: previous.overallStatus,
    currentStatus: current.overallStatus,
    tableCountDelta: current.activeTablesCount - previous.activeTablesCount,
    handCountDelta: current.activeHandsCount - previous.activeHandsCount,
    sessionCountDelta: current.sessions.activeSessions - previous.sessions.activeSessions,
    settlementCountDelta: current.settlements.pendingSettlements - previous.settlements.pendingSettlements,
    newIssues,
    resolvedIssues,
  };
}
