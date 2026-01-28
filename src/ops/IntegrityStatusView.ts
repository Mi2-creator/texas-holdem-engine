/**
 * IntegrityStatusView.ts
 * Phase 31 - Production Observability, Audit & Deterministic Ops (READ-ONLY)
 *
 * Unified integrity status snapshot.
 *
 * COMBINES:
 * - Ledger invariant guards
 * - Integrity module signals
 * - Moderation flags (counts only)
 *
 * OUTPUT:
 * - Deterministic health object with reasons
 *
 * RULES:
 * - Read-only only
 * - No side effects
 * - Deterministic: same input → same output
 */

import { PlayerId } from '../security/Identity';
import { TableId, HandId } from '../security/AuditLog';
import { ClubId } from '../club/ClubTypes';
import { LedgerEntry } from '../ledger/LedgerTypes';
import { RiskLevel } from '../integrity/IntegrityTypes';
import { CaseId } from '../moderation/ModerationTypes';
import {
  InvariantCheck,
  InvariantStatus,
  OpsTimeRange,
  HealthStatus,
  OpsSeverity,
  OpsIssue,
  OpsScope,
  createInvariantStatus,
  OpsQueryResult,
  successOpsResult,
  failOpsResult,
} from './OpsTypes';

// ============================================================================
// Integrity Status Types
// ============================================================================

/**
 * Ledger invariant status
 */
export interface LedgerInvariantSummary {
  readonly zeroSumValid: boolean;
  readonly sequenceValid: boolean;
  readonly hashChainValid: boolean;
  readonly clubIsolationValid: boolean;
  readonly issues: readonly string[];
}

/**
 * Integrity signal summary
 */
export interface IntegritySignalSummary {
  readonly totalSignals: number;
  readonly signalsByType: Readonly<Record<string, number>>;
  readonly highRiskCount: number;
  readonly mediumRiskCount: number;
  readonly lowRiskCount: number;
  readonly affectedPlayers: number;
  readonly affectedTables: number;
}

/**
 * Moderation flag summary (counts only)
 */
export interface ModerationFlagSummary {
  readonly totalCases: number;
  readonly openCases: number;
  readonly pendingCases: number;
  readonly resolvedCases: number;
  readonly casesByReason: Readonly<Record<string, number>>;
}

/**
 * Complete integrity status
 */
export interface IntegrityStatusSnapshot {
  readonly timestamp: number;
  readonly timeRange: OpsTimeRange;
  readonly overallStatus: HealthStatus;

  // Component summaries
  readonly ledgerInvariants: LedgerInvariantSummary;
  readonly integritySignals: IntegritySignalSummary;
  readonly moderationFlags: ModerationFlagSummary;

  // Unified invariant checks
  readonly invariants: InvariantStatus;

  // Active issues
  readonly activeIssues: readonly OpsIssue[];
}

// ============================================================================
// Input Types
// ============================================================================

/**
 * Ledger invariant input
 */
export interface LedgerInvariantInput {
  readonly entries: readonly LedgerEntry[];
}

/**
 * Integrity signal input
 */
export interface IntegritySignalInput {
  readonly signals: readonly DetectionSignal[];
}

/**
 * Detection signal for input
 */
export interface DetectionSignal {
  readonly signalId: string;
  readonly type: string;
  readonly playerId: PlayerId;
  readonly tableId?: TableId;
  readonly riskLevel: RiskLevel;
  readonly timestamp: number;
}

/**
 * Moderation case input
 */
export interface ModerationCaseInput {
  readonly cases: readonly ModerationCaseSummary[];
}

/**
 * Moderation case summary
 */
export interface ModerationCaseSummary {
  readonly caseId: CaseId;
  readonly status: 'OPEN' | 'PENDING' | 'RESOLVED';
  readonly reason: string;
  readonly createdAt: number;
}

/**
 * Complete input for integrity status
 */
export interface IntegrityStatusInput {
  readonly ledger: LedgerInvariantInput;
  readonly integrity: IntegritySignalInput;
  readonly moderation: ModerationCaseInput;
  readonly timeRange: OpsTimeRange;
}

// ============================================================================
// Status Generation
// ============================================================================

/**
 * Generate integrity status snapshot
 *
 * Pure function: same input always produces same output.
 */
export function generateIntegrityStatus(
  input: IntegrityStatusInput,
  timestamp: number = Date.now()
): IntegrityStatusSnapshot {
  // Generate ledger invariant summary
  const ledgerInvariants = generateLedgerInvariantSummary(input.ledger);

  // Generate integrity signal summary
  const integritySignals = generateIntegritySignalSummary(input.integrity, input.timeRange);

  // Generate moderation flag summary
  const moderationFlags = generateModerationFlagSummary(input.moderation);

  // Generate unified invariant checks
  const checks = generateAllInvariantChecks(input);
  const invariants = createInvariantStatus(checks, timestamp);

  // Collect active issues
  const activeIssues = collectActiveIssues(
    ledgerInvariants,
    integritySignals,
    moderationFlags,
    timestamp
  );

  // Determine overall status
  const overallStatus = deriveOverallStatus(
    ledgerInvariants,
    integritySignals,
    moderationFlags,
    invariants
  );

  return {
    timestamp,
    timeRange: input.timeRange,
    overallStatus,
    ledgerInvariants,
    integritySignals,
    moderationFlags,
    invariants,
    activeIssues,
  };
}

/**
 * Generate ledger invariant summary
 */
function generateLedgerInvariantSummary(input: LedgerInvariantInput): LedgerInvariantSummary {
  const entries = input.entries;
  const issues: string[] = [];

  // Check zero-sum
  let totalDelta = 0;
  for (const entry of entries) {
    totalDelta += entry.delta;
  }
  const zeroSumValid = totalDelta === 0;
  if (!zeroSumValid) {
    issues.push(`Ledger not zero-sum: delta = ${totalDelta}`);
  }

  // Check sequence (simplified)
  const sequenceValid = true; // Would check for gaps in real implementation

  // Check hash chain (simplified)
  let hashChainValid = true;
  let prevHash: string | null = null;
  for (const entry of entries) {
    if (prevHash !== null && entry.previousHash !== prevHash) {
      hashChainValid = false;
      issues.push(`Hash chain broken at entry ${entry.entryId}`);
      break;
    }
    prevHash = entry.checksum;
  }

  // Check club isolation (simplified)
  const clubEntries = new Map<ClubId, Set<ClubId>>();
  for (const entry of entries) {
    if (entry.clubId && entry.affectedParty.clubId) {
      if (entry.clubId !== entry.affectedParty.clubId) {
        // Cross-club reference
        let set = clubEntries.get(entry.clubId);
        if (!set) {
          set = new Set();
          clubEntries.set(entry.clubId, set);
        }
        set.add(entry.affectedParty.clubId);
      }
    }
  }
  const clubIsolationValid = clubEntries.size === 0;
  if (!clubIsolationValid) {
    issues.push('Club isolation violation detected');
  }

  return {
    zeroSumValid,
    sequenceValid,
    hashChainValid,
    clubIsolationValid,
    issues,
  };
}

/**
 * Generate integrity signal summary
 */
function generateIntegritySignalSummary(
  input: IntegritySignalInput,
  timeRange: OpsTimeRange
): IntegritySignalSummary {
  // Filter signals by time range
  const signals = input.signals.filter(
    s => s.timestamp >= timeRange.fromTimestamp && s.timestamp <= timeRange.toTimestamp
  );

  const signalsByType: Record<string, number> = {};
  let highRiskCount = 0;
  let mediumRiskCount = 0;
  let lowRiskCount = 0;
  const affectedPlayersSet = new Set<PlayerId>();
  const affectedTablesSet = new Set<TableId>();

  for (const signal of signals) {
    // Count by type
    signalsByType[signal.type] = (signalsByType[signal.type] ?? 0) + 1;

    // Count by risk level
    switch (signal.riskLevel) {
      case 'HIGH_RISK':
      case 'CRITICAL':
        highRiskCount++;
        break;
      case 'MODERATE_RISK':
        mediumRiskCount++;
        break;
      case 'LOW_RISK':
      case 'CLEAN':
        lowRiskCount++;
        break;
    }

    // Track affected entities
    affectedPlayersSet.add(signal.playerId);
    if (signal.tableId) {
      affectedTablesSet.add(signal.tableId);
    }
  }

  return {
    totalSignals: signals.length,
    signalsByType,
    highRiskCount,
    mediumRiskCount,
    lowRiskCount,
    affectedPlayers: affectedPlayersSet.size,
    affectedTables: affectedTablesSet.size,
  };
}

/**
 * Generate moderation flag summary
 */
function generateModerationFlagSummary(input: ModerationCaseInput): ModerationFlagSummary {
  const cases = input.cases;

  const casesByReason: Record<string, number> = {};
  let openCases = 0;
  let pendingCases = 0;
  let resolvedCases = 0;

  for (const case_ of cases) {
    // Count by status
    switch (case_.status) {
      case 'OPEN':
        openCases++;
        break;
      case 'PENDING':
        pendingCases++;
        break;
      case 'RESOLVED':
        resolvedCases++;
        break;
    }

    // Count by reason
    casesByReason[case_.reason] = (casesByReason[case_.reason] ?? 0) + 1;
  }

  return {
    totalCases: cases.length,
    openCases,
    pendingCases,
    resolvedCases,
    casesByReason,
  };
}

/**
 * Generate all invariant checks
 */
function generateAllInvariantChecks(input: IntegrityStatusInput): InvariantCheck[] {
  const checks: InvariantCheck[] = [];

  // Ledger invariants
  const ledgerSummary = generateLedgerInvariantSummary(input.ledger);

  checks.push({
    invariantName: 'ledger_zero_sum',
    passed: ledgerSummary.zeroSumValid,
    message: ledgerSummary.zeroSumValid ? 'Ledger is zero-sum' : 'Ledger not zero-sum',
    scope: 'PLATFORM',
  });

  checks.push({
    invariantName: 'ledger_hash_chain',
    passed: ledgerSummary.hashChainValid,
    message: ledgerSummary.hashChainValid ? 'Hash chain valid' : 'Hash chain broken',
    scope: 'PLATFORM',
  });

  checks.push({
    invariantName: 'club_isolation',
    passed: ledgerSummary.clubIsolationValid,
    message: ledgerSummary.clubIsolationValid ? 'Clubs isolated' : 'Club isolation violated',
    scope: 'CLUB',
  });

  // Integrity signal invariants
  const signalSummary = generateIntegritySignalSummary(input.integrity, input.timeRange);

  checks.push({
    invariantName: 'no_high_risk_signals',
    passed: signalSummary.highRiskCount === 0,
    message:
      signalSummary.highRiskCount === 0
        ? 'No high risk signals'
        : `${signalSummary.highRiskCount} high risk signals`,
    scope: 'PLATFORM',
  });

  // Moderation invariants
  const moderationSummary = generateModerationFlagSummary(input.moderation);

  checks.push({
    invariantName: 'no_open_cases',
    passed: moderationSummary.openCases === 0,
    message:
      moderationSummary.openCases === 0
        ? 'No open cases'
        : `${moderationSummary.openCases} open cases`,
    scope: 'PLATFORM',
  });

  return checks;
}

/**
 * Collect active issues
 */
function collectActiveIssues(
  ledger: LedgerInvariantSummary,
  signals: IntegritySignalSummary,
  moderation: ModerationFlagSummary,
  timestamp: number
): OpsIssue[] {
  const issues: OpsIssue[] = [];

  // Ledger issues
  for (const issue of ledger.issues) {
    issues.push({
      severity: 'CRITICAL',
      code: 'LEDGER_INVARIANT_VIOLATION',
      message: issue,
      scope: { scope: 'PLATFORM' },
      timestamp,
    });
  }

  // High risk signals
  if (signals.highRiskCount > 0) {
    issues.push({
      severity: 'CRITICAL',
      code: 'HIGH_RISK_SIGNALS',
      message: `${signals.highRiskCount} high risk integrity signals detected`,
      scope: { scope: 'PLATFORM' },
      timestamp,
    });
  }

  // Medium risk signals
  if (signals.mediumRiskCount > 10) {
    issues.push({
      severity: 'WARN',
      code: 'ELEVATED_RISK_SIGNALS',
      message: `${signals.mediumRiskCount} medium risk signals (elevated)`,
      scope: { scope: 'PLATFORM' },
      timestamp,
    });
  }

  // Open moderation cases
  if (moderation.openCases > 0) {
    issues.push({
      severity: moderation.openCases > 10 ? 'WARN' : 'INFO',
      code: 'OPEN_MODERATION_CASES',
      message: `${moderation.openCases} open moderation cases`,
      scope: { scope: 'PLATFORM' },
      timestamp,
    });
  }

  return issues;
}

/**
 * Derive overall status
 */
function deriveOverallStatus(
  ledger: LedgerInvariantSummary,
  signals: IntegritySignalSummary,
  moderation: ModerationFlagSummary,
  invariants: InvariantStatus
): HealthStatus {
  // Critical: ledger invariant failures
  if (!ledger.zeroSumValid || !ledger.hashChainValid) {
    return 'UNHEALTHY';
  }

  // Critical: high risk signals
  if (signals.highRiskCount > 0) {
    return 'UNHEALTHY';
  }

  // Degraded: club isolation issues
  if (!ledger.clubIsolationValid) {
    return 'DEGRADED';
  }

  // Degraded: too many open cases
  if (moderation.openCases > 10) {
    return 'DEGRADED';
  }

  // Degraded: too many medium risk signals
  if (signals.mediumRiskCount > 20) {
    return 'DEGRADED';
  }

  return 'HEALTHY';
}

// ============================================================================
// Integrity Status View
// ============================================================================

/**
 * Read-only view for integrity status
 */
export class IntegrityStatusView {
  private readonly getLedgerEntries: () => readonly LedgerEntry[];
  private readonly getSignals: () => readonly DetectionSignal[];
  private readonly getCases: () => readonly ModerationCaseSummary[];

  constructor(
    ledgerProvider: () => readonly LedgerEntry[],
    signalProvider: () => readonly DetectionSignal[],
    caseProvider: () => readonly ModerationCaseSummary[]
  ) {
    this.getLedgerEntries = ledgerProvider;
    this.getSignals = signalProvider;
    this.getCases = caseProvider;
  }

  /**
   * Get current integrity status
   */
  getStatus(timeRange: OpsTimeRange): OpsQueryResult<IntegrityStatusSnapshot> {
    try {
      const input: IntegrityStatusInput = {
        ledger: { entries: this.getLedgerEntries() },
        integrity: { signals: this.getSignals() },
        moderation: { cases: this.getCases() },
        timeRange,
      };

      const status = generateIntegrityStatus(input);
      return successOpsResult(status);
    } catch (error) {
      return failOpsResult(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Get ledger invariant status only
   */
  getLedgerInvariants(): OpsQueryResult<LedgerInvariantSummary> {
    try {
      const summary = generateLedgerInvariantSummary({
        entries: this.getLedgerEntries(),
      });
      return successOpsResult(summary);
    } catch (error) {
      return failOpsResult(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Get integrity signals only
   */
  getIntegritySignals(timeRange: OpsTimeRange): OpsQueryResult<IntegritySignalSummary> {
    try {
      const summary = generateIntegritySignalSummary(
        { signals: this.getSignals() },
        timeRange
      );
      return successOpsResult(summary);
    } catch (error) {
      return failOpsResult(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Get moderation flags only
   */
  getModerationFlags(): OpsQueryResult<ModerationFlagSummary> {
    try {
      const summary = generateModerationFlagSummary({
        cases: this.getCases(),
      });
      return successOpsResult(summary);
    } catch (error) {
      return failOpsResult(error instanceof Error ? error.message : 'Unknown error');
    }
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create an integrity status view
 */
export function createIntegrityStatusView(
  ledgerProvider: () => readonly LedgerEntry[],
  signalProvider: () => readonly DetectionSignal[],
  caseProvider: () => readonly ModerationCaseSummary[]
): IntegrityStatusView {
  return new IntegrityStatusView(ledgerProvider, signalProvider, caseProvider);
}

/**
 * Create empty input for testing
 */
export function emptyIntegrityStatusInput(timeRange: OpsTimeRange): IntegrityStatusInput {
  return {
    ledger: { entries: [] },
    integrity: { signals: [] },
    moderation: { cases: [] },
    timeRange,
  };
}
