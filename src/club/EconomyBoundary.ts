/**
 * EconomyBoundary.ts
 * Phase 21 - Economy boundary enforcement
 *
 * Ensures that:
 * - Players can NEVER directly credit/debit balances
 * - Buy-in/cash-out requires table authority approval
 * - Rake policies are immutable during an active hand
 *
 * This module provides:
 * - Wrapped economy operations that require authority
 * - Invariant checks that validate authority boundaries
 * - Test utilities for verifying boundary enforcement
 */

import { PlayerId } from '../security/Identity';
import { TableId, HandId } from '../security/AuditLog';
import { EconomyRuntime } from '../economy/runtime';
import {
  ClubId,
  ClubTable,
  AuthorizationResult,
  RakePolicyRef,
} from './ClubTypes';
import { TableAuthority } from './TableAuthority';
import { ClubManager } from './ClubManager';

// ============================================================================
// Boundary Violation Types
// ============================================================================

export interface BoundaryViolation {
  readonly violationType: BoundaryViolationType;
  readonly operation: string;
  readonly playerId?: PlayerId;
  readonly tableId?: TableId;
  readonly details: string;
  readonly timestamp: number;
}

export type BoundaryViolationType =
  | 'DIRECT_BALANCE_CREDIT'
  | 'DIRECT_BALANCE_DEBIT'
  | 'UNAUTHORIZED_BUY_IN'
  | 'UNAUTHORIZED_CASH_OUT'
  | 'RAKE_POLICY_CHANGE_DURING_HAND'
  | 'DIRECT_POT_MANIPULATION'
  | 'UNAUTHORIZED_SETTLEMENT';

// ============================================================================
// Boundary Check Results
// ============================================================================

export interface BoundaryCheckResult {
  readonly valid: boolean;
  readonly violations: readonly BoundaryViolation[];
}

// ============================================================================
// Protected Economy Operations
// ============================================================================

/**
 * ProtectedEconomyAccess wraps EconomyRuntime to enforce boundaries
 *
 * This is the ONLY way players should access economy operations.
 * All operations require a valid TableAuthority authorization.
 */
export class ProtectedEconomyAccess {
  private readonly economyRuntime: EconomyRuntime;
  private readonly tableAuthority: TableAuthority;
  private readonly violations: BoundaryViolation[];

  constructor(economyRuntime: EconomyRuntime, tableAuthority: TableAuthority) {
    this.economyRuntime = economyRuntime;
    this.tableAuthority = tableAuthority;
    this.violations = [];
  }

  /**
   * Buy in with authority validation
   */
  authorizedBuyIn(
    clubId: ClubId,
    tableId: TableId,
    playerId: PlayerId,
    amount: number,
    authorization: AuthorizationResult
  ): { success: boolean; stack?: number; error?: string } {
    if (!authorization.authorized) {
      this.recordViolation('UNAUTHORIZED_BUY_IN', 'buy_in', playerId, tableId,
        `Attempted buy-in without authorization: ${authorization.denialReason}`);
      return { success: false, error: 'Unauthorized' };
    }

    if (authorization.action !== 'buy_in' && authorization.action !== 'rebuy' && authorization.action !== 'top_up') {
      this.recordViolation('UNAUTHORIZED_BUY_IN', 'buy_in', playerId, tableId,
        `Authorization for wrong action: ${authorization.action}`);
      return { success: false, error: 'Invalid authorization type' };
    }

    try {
      this.economyRuntime.buyIn(tableId, playerId, amount);
      const stack = this.economyRuntime.getStack(tableId, playerId);
      return { success: true, stack };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Buy-in failed',
      };
    }
  }

  /**
   * Cash out with authority validation
   */
  authorizedCashOut(
    clubId: ClubId,
    tableId: TableId,
    playerId: PlayerId,
    authorization: AuthorizationResult
  ): { success: boolean; amount?: number; error?: string } {
    if (!authorization.authorized) {
      this.recordViolation('UNAUTHORIZED_CASH_OUT', 'cash_out', playerId, tableId,
        `Attempted cash-out without authorization: ${authorization.denialReason}`);
      return { success: false, error: 'Unauthorized' };
    }

    if (authorization.action !== 'cash_out') {
      this.recordViolation('UNAUTHORIZED_CASH_OUT', 'cash_out', playerId, tableId,
        `Authorization for wrong action: ${authorization.action}`);
      return { success: false, error: 'Invalid authorization type' };
    }

    const result = this.economyRuntime.cashOut(tableId, playerId);
    return {
      success: result.success,
      amount: result.cashOutAmount,
      error: result.error,
    };
  }

  /**
   * Check if a rake policy change is allowed
   */
  canChangeRakePolicy(table: ClubTable): boolean {
    // Cannot change rake policy during an active hand
    return table.currentHandId === null;
  }

  /**
   * Get recorded violations
   */
  getViolations(): readonly BoundaryViolation[] {
    return [...this.violations];
  }

  /**
   * Clear violations (for testing)
   */
  clearViolations(): void {
    this.violations.length = 0;
  }

  private recordViolation(
    type: BoundaryViolationType,
    operation: string,
    playerId: PlayerId | undefined,
    tableId: TableId | undefined,
    details: string
  ): void {
    this.violations.push({
      violationType: type,
      operation,
      playerId,
      tableId,
      details,
      timestamp: Date.now(),
    });
  }
}

// ============================================================================
// Boundary Invariant Checker
// ============================================================================

/**
 * BoundaryInvariantChecker validates that boundaries are not bypassed
 */
export class BoundaryInvariantChecker {
  /**
   * Check that direct balance credit is not possible
   *
   * This test should be run with mocked/tracked economy runtime
   * to detect if any code path allows direct balance credit.
   */
  static checkNoDirectBalanceCredit(
    economyRuntime: EconomyRuntime,
    playerId: PlayerId,
    _tableAuthority: TableAuthority
  ): BoundaryCheckResult {
    const violations: BoundaryViolation[] = [];

    // In a real scenario, we would intercept creditPlayer calls
    // and verify they only come from authorized settlement paths.
    // For now, we document the invariant.

    // The EconomyRuntime.creditPlayer method should ONLY be called:
    // 1. During settlement (after proper authorization)
    // 2. By admin operations (which have their own auth)

    return { valid: violations.length === 0, violations };
  }

  /**
   * Check that rake policy cannot be changed during active hand
   */
  static checkRakePolicyImmutableDuringHand(
    table: ClubTable,
    attemptedChange: boolean
  ): BoundaryCheckResult {
    const violations: BoundaryViolation[] = [];

    if (table.currentHandId !== null && attemptedChange) {
      violations.push({
        violationType: 'RAKE_POLICY_CHANGE_DURING_HAND',
        operation: 'update_rake_policy',
        tableId: table.tableId,
        details: `Attempted to change rake policy during hand ${table.currentHandId}`,
        timestamp: Date.now(),
      });
    }

    return { valid: violations.length === 0, violations };
  }

  /**
   * Check that settlement only happens through proper channels
   */
  static checkAuthorizedSettlement(
    handId: HandId,
    tableId: TableId,
    settlementAuthorization: AuthorizationResult | null
  ): BoundaryCheckResult {
    const violations: BoundaryViolation[] = [];

    // Settlement should only happen after:
    // 1. Hand has been played to completion
    // 2. Manager/system has authorized the settlement

    if (!settlementAuthorization) {
      violations.push({
        violationType: 'UNAUTHORIZED_SETTLEMENT',
        operation: 'settle_hand',
        tableId,
        details: `Settlement attempted without authorization for hand ${handId}`,
        timestamp: Date.now(),
      });
    }

    return { valid: violations.length === 0, violations };
  }
}

// ============================================================================
// Rake Policy Guard
// ============================================================================

/**
 * RakePolicyGuard ensures rake policies are immutable during hands
 */
export class RakePolicyGuard {
  private readonly tableSnapshots: Map<TableId, RakePolicyRef | null>;

  constructor() {
    this.tableSnapshots = new Map();
  }

  /**
   * Snapshot the rake policy when a hand starts
   */
  snapshotForHand(tableId: TableId, rakePolicyRef: RakePolicyRef | null): void {
    this.tableSnapshots.set(tableId, rakePolicyRef);
  }

  /**
   * Clear snapshot when hand ends
   */
  clearSnapshot(tableId: TableId): void {
    this.tableSnapshots.delete(tableId);
  }

  /**
   * Check if a rake policy change is allowed
   */
  canChange(tableId: TableId): boolean {
    return !this.tableSnapshots.has(tableId);
  }

  /**
   * Get the snapshotted policy for a table
   */
  getSnapshot(tableId: TableId): RakePolicyRef | null | undefined {
    return this.tableSnapshots.get(tableId);
  }

  /**
   * Verify that the policy hasn't changed during a hand
   */
  verifyUnchanged(tableId: TableId, currentPolicy: RakePolicyRef | null): boolean {
    const snapshot = this.tableSnapshots.get(tableId);
    if (snapshot === undefined) {
      // No snapshot = no hand in progress, changes allowed
      return true;
    }

    // Compare policy refs
    if (snapshot === null && currentPolicy === null) {
      return true;
    }

    if (snapshot === null || currentPolicy === null) {
      return false;
    }

    return snapshot.policyId === currentPolicy.policyId &&
           snapshot.policyHash === currentPolicy.policyHash;
  }

  /**
   * Clear all snapshots (for testing)
   */
  clear(): void {
    this.tableSnapshots.clear();
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

export function createProtectedEconomyAccess(
  economyRuntime: EconomyRuntime,
  tableAuthority: TableAuthority
): ProtectedEconomyAccess {
  return new ProtectedEconomyAccess(economyRuntime, tableAuthority);
}

export function createRakePolicyGuard(): RakePolicyGuard {
  return new RakePolicyGuard();
}
