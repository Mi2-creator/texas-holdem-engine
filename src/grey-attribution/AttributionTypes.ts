/**
 * AttributionTypes.ts
 * Phase A2 - Grey Flow Multi-Level Attribution
 *
 * TYPES AND ENUMS FOR ATTRIBUTION
 *
 * This module defines all types for the attribution system.
 * All values are INTEGER ONLY - no floats or decimals.
 * Percentages are represented as basis points (1/100th of a percent).
 *
 * @external This module operates OUTSIDE the frozen engine.
 * @readonly This module NEVER mutates any state.
 * @deterministic Same inputs always produce same outputs.
 */

import { GreyFlowId, GreyPartyId } from '../grey-runtime';
import { ReconciliationPeriodId } from '../grey-reconciliation';

// ============================================================================
// BRANDED ID TYPES
// ============================================================================

/**
 * Unique identifier for an attribution snapshot.
 */
export type AttributionSnapshotId = string & { readonly __brand: 'AttributionSnapshotId' };

/**
 * Unique identifier for an attribution rule set.
 */
export type AttributionRuleSetId = string & { readonly __brand: 'AttributionRuleSetId' };

/**
 * Unique identifier for an agent hierarchy.
 */
export type AgentHierarchyId = string & { readonly __brand: 'AgentHierarchyId' };

/**
 * Unique identifier for an attribution entry.
 */
export type AttributionEntryId = string & { readonly __brand: 'AttributionEntryId' };

// ============================================================================
// ID FACTORIES
// ============================================================================

/**
 * Create an attribution snapshot ID.
 */
export function createAttributionSnapshotId(id: string): AttributionSnapshotId {
  return id as AttributionSnapshotId;
}

/**
 * Create an attribution rule set ID.
 */
export function createAttributionRuleSetId(id: string): AttributionRuleSetId {
  return id as AttributionRuleSetId;
}

/**
 * Create an agent hierarchy ID.
 */
export function createAgentHierarchyId(id: string): AgentHierarchyId {
  return id as AgentHierarchyId;
}

/**
 * Create an attribution entry ID.
 */
export function createAttributionEntryId(id: string): AttributionEntryId {
  return id as AttributionEntryId;
}

// ============================================================================
// ATTRIBUTION PARTY TYPE
// ============================================================================

/**
 * Types of parties that receive attribution.
 */
export const AttributionPartyType = {
  PLATFORM: 'PLATFORM',
  CLUB: 'CLUB',
  AGENT: 'AGENT',
} as const;

export type AttributionPartyType = typeof AttributionPartyType[keyof typeof AttributionPartyType];

// ============================================================================
// ATTRIBUTION RULE
// ============================================================================

/**
 * Basis points constant (100% = 10000 basis points).
 * Using basis points allows integer-only percentage math.
 */
export const BASIS_POINTS_100_PERCENT = 10000 as const;

/**
 * An attribution rule defining how value is distributed.
 * Percentages are in basis points (1 bp = 0.01%).
 *
 * Example: 500 basis points = 5%
 */
export interface AttributionRule {
  readonly ruleSetId: AttributionRuleSetId;
  readonly partyId: GreyPartyId;
  readonly partyType: AttributionPartyType;
  /** Percentage in basis points (0-10000) */
  readonly basisPoints: number;
  /** Optional label for this rule */
  readonly label?: string;
}

/**
 * Create an attribution rule.
 */
export function createAttributionRule(
  ruleSetId: AttributionRuleSetId,
  partyId: GreyPartyId,
  partyType: AttributionPartyType,
  basisPoints: number,
  label?: string
): AttributionResult<AttributionRule> {
  if (!Number.isInteger(basisPoints)) {
    return attributionFailure(
      createAttributionError(
        AttributionErrorCode.NON_INTEGER_VALUE,
        `basisPoints must be an integer, got: ${basisPoints}`,
        { basisPoints }
      )
    );
  }

  if (basisPoints < 0 || basisPoints > BASIS_POINTS_100_PERCENT) {
    return attributionFailure(
      createAttributionError(
        AttributionErrorCode.INVALID_BASIS_POINTS,
        `basisPoints must be 0-${BASIS_POINTS_100_PERCENT}, got: ${basisPoints}`,
        { basisPoints }
      )
    );
  }

  return attributionSuccess(
    Object.freeze({
      ruleSetId,
      partyId,
      partyType,
      basisPoints,
      label,
    })
  );
}

/**
 * A complete rule set for attribution.
 * Total basis points must equal exactly 10000 (100%).
 */
export interface AttributionRuleSet {
  readonly ruleSetId: AttributionRuleSetId;
  readonly rules: readonly AttributionRule[];
  readonly totalBasisPoints: number;
  readonly label?: string;
  readonly createdAt: number;
}

// ============================================================================
// AGENT HIERARCHY
// ============================================================================

/**
 * A node in the agent hierarchy.
 * Parent-referenced to form an acyclic tree.
 */
export interface AgentHierarchyNode {
  readonly agentId: GreyPartyId;
  /** Parent agent ID (null for top-level agents) */
  readonly parentAgentId: GreyPartyId | null;
  /** Level in hierarchy (0 = top-level) */
  readonly level: number;
  /** Attribution share in basis points from parent/source */
  readonly shareBasisPoints: number;
  /** Optional label */
  readonly label?: string;
}

/**
 * Create an agent hierarchy node.
 */
export function createAgentHierarchyNode(
  agentId: GreyPartyId,
  parentAgentId: GreyPartyId | null,
  level: number,
  shareBasisPoints: number,
  label?: string
): AttributionResult<AgentHierarchyNode> {
  if (!Number.isInteger(level) || level < 0) {
    return attributionFailure(
      createAttributionError(
        AttributionErrorCode.INVALID_HIERARCHY_LEVEL,
        `level must be a non-negative integer, got: ${level}`,
        { level }
      )
    );
  }

  if (!Number.isInteger(shareBasisPoints)) {
    return attributionFailure(
      createAttributionError(
        AttributionErrorCode.NON_INTEGER_VALUE,
        `shareBasisPoints must be an integer, got: ${shareBasisPoints}`,
        { shareBasisPoints }
      )
    );
  }

  if (shareBasisPoints < 0 || shareBasisPoints > BASIS_POINTS_100_PERCENT) {
    return attributionFailure(
      createAttributionError(
        AttributionErrorCode.INVALID_BASIS_POINTS,
        `shareBasisPoints must be 0-${BASIS_POINTS_100_PERCENT}, got: ${shareBasisPoints}`,
        { shareBasisPoints }
      )
    );
  }

  return attributionSuccess(
    Object.freeze({
      agentId,
      parentAgentId,
      level,
      shareBasisPoints,
      label,
    })
  );
}

/**
 * A complete agent hierarchy (DAG).
 */
export interface AgentHierarchy {
  readonly hierarchyId: AgentHierarchyId;
  readonly nodes: readonly AgentHierarchyNode[];
  /** Maximum depth of the hierarchy */
  readonly maxLevel: number;
  /** Total number of agents */
  readonly agentCount: number;
  readonly label?: string;
}

// ============================================================================
// ATTRIBUTION ENTRY
// ============================================================================

/**
 * A single attribution entry.
 * Represents the attributed amount for a party from a specific flow.
 */
export interface AttributionEntry {
  readonly entryId: AttributionEntryId;
  readonly partyId: GreyPartyId;
  readonly partyType: AttributionPartyType;
  /** Attributed amount (INTEGER ONLY) */
  readonly amount: number;
  /** Source grey flow ID */
  readonly sourceGreyFlowId: GreyFlowId;
  /** Rule set used for attribution */
  readonly ruleSetId: AttributionRuleSetId;
  /** Basis points applied */
  readonly appliedBasisPoints: number;
  /** Original amount before attribution */
  readonly originalAmount: number;
}

/**
 * Create an attribution entry.
 */
export function createAttributionEntry(
  entryId: AttributionEntryId,
  partyId: GreyPartyId,
  partyType: AttributionPartyType,
  amount: number,
  sourceGreyFlowId: GreyFlowId,
  ruleSetId: AttributionRuleSetId,
  appliedBasisPoints: number,
  originalAmount: number
): AttributionResult<AttributionEntry> {
  if (!Number.isInteger(amount)) {
    return attributionFailure(
      createAttributionError(
        AttributionErrorCode.NON_INTEGER_VALUE,
        `amount must be an integer, got: ${amount}`,
        { amount }
      )
    );
  }

  if (!Number.isInteger(originalAmount)) {
    return attributionFailure(
      createAttributionError(
        AttributionErrorCode.NON_INTEGER_VALUE,
        `originalAmount must be an integer, got: ${originalAmount}`,
        { originalAmount }
      )
    );
  }

  return attributionSuccess(
    Object.freeze({
      entryId,
      partyId,
      partyType,
      amount,
      sourceGreyFlowId,
      ruleSetId,
      appliedBasisPoints,
      originalAmount,
    })
  );
}

// ============================================================================
// ATTRIBUTION RESULT TYPES
// ============================================================================

/**
 * Result of attributing a single flow.
 */
export interface FlowAttributionResult {
  readonly sourceGreyFlowId: GreyFlowId;
  readonly originalAmount: number;
  readonly entries: readonly AttributionEntry[];
  /** Sum of all attributed amounts (should equal originalAmount) */
  readonly totalAttributed: number;
  /** Any remainder due to rounding (should be 0) */
  readonly remainder: number;
}

/**
 * Result of attributing all flows in a period.
 */
export interface PeriodAttributionResult {
  readonly periodId: ReconciliationPeriodId;
  readonly ruleSetId: AttributionRuleSetId;
  readonly flowResults: readonly FlowAttributionResult[];
  /** Total original amount */
  readonly totalOriginal: number;
  /** Total attributed amount */
  readonly totalAttributed: number;
  /** Total remainder */
  readonly totalRemainder: number;
  /** Count of flows processed */
  readonly flowCount: number;
  /** Count of entries created */
  readonly entryCount: number;
  /** Checksum for verification */
  readonly checksum: string;
}

// ============================================================================
// ERROR TYPES
// ============================================================================

/**
 * Error codes for attribution operations.
 */
export const AttributionErrorCode = {
  /** Non-integer value encountered */
  NON_INTEGER_VALUE: 'NON_INTEGER_VALUE',
  /** Invalid basis points (not 0-10000) */
  INVALID_BASIS_POINTS: 'INVALID_BASIS_POINTS',
  /** Rule set basis points don't sum to 100% */
  INVALID_RULE_SET_TOTAL: 'INVALID_RULE_SET_TOTAL',
  /** Cycle detected in agent hierarchy */
  HIERARCHY_CYCLE_DETECTED: 'HIERARCHY_CYCLE_DETECTED',
  /** Invalid hierarchy level */
  INVALID_HIERARCHY_LEVEL: 'INVALID_HIERARCHY_LEVEL',
  /** Parent agent not found */
  PARENT_AGENT_NOT_FOUND: 'PARENT_AGENT_NOT_FOUND',
  /** Duplicate agent in hierarchy */
  DUPLICATE_AGENT: 'DUPLICATE_AGENT',
  /** Attribution amount mismatch */
  AMOUNT_MISMATCH: 'AMOUNT_MISMATCH',
  /** Snapshot not found */
  SNAPSHOT_NOT_FOUND: 'SNAPSHOT_NOT_FOUND',
  /** Checksum mismatch */
  CHECKSUM_MISMATCH: 'CHECKSUM_MISMATCH',
  /** Invalid period */
  INVALID_PERIOD: 'INVALID_PERIOD',
  /** No data for period */
  NO_DATA_FOR_PERIOD: 'NO_DATA_FOR_PERIOD',
  /** Invalid party type */
  INVALID_PARTY_TYPE: 'INVALID_PARTY_TYPE',
} as const;

export type AttributionErrorCode = typeof AttributionErrorCode[keyof typeof AttributionErrorCode];

/**
 * Structured error for attribution operations.
 */
export interface AttributionError {
  readonly code: AttributionErrorCode;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

/**
 * Create an attribution error.
 */
export function createAttributionError(
  code: AttributionErrorCode,
  message: string,
  details?: Record<string, unknown>
): AttributionError {
  return Object.freeze({
    code,
    message,
    details: details ? Object.freeze({ ...details }) : undefined,
  });
}

// ============================================================================
// RESULT TYPES
// ============================================================================

/**
 * Result of an attribution operation.
 */
export type AttributionResult<T> =
  | { readonly success: true; readonly value: T }
  | { readonly success: false; readonly error: AttributionError };

/**
 * Create a success result.
 */
export function attributionSuccess<T>(value: T): AttributionResult<T> {
  return { success: true, value };
}

/**
 * Create a failure result.
 */
export function attributionFailure<T>(error: AttributionError): AttributionResult<T> {
  return { success: false, error };
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Check if a value is a valid integer.
 */
export function isValidInteger(value: number): boolean {
  return Number.isInteger(value);
}

/**
 * Check if a value is a valid non-negative integer.
 */
export function isValidNonNegativeInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

/**
 * Check if a value is a valid positive integer.
 */
export function isValidPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

/**
 * Check if basis points are valid (0-10000).
 */
export function isValidBasisPoints(basisPoints: number): boolean {
  return Number.isInteger(basisPoints) && basisPoints >= 0 && basisPoints <= BASIS_POINTS_100_PERCENT;
}

/**
 * Convert basis points to percentage string.
 * For display purposes only.
 */
export function basisPointsToPercentString(basisPoints: number): string {
  const percent = basisPoints / 100;
  return `${percent}%`;
}

/**
 * Calculate amount from basis points (integer math).
 * Uses floor division to ensure integer result.
 *
 * @param originalAmount - Original amount to attribute from
 * @param basisPoints - Basis points (0-10000)
 * @returns Attributed amount (integer)
 */
export function calculateAttributedAmount(
  originalAmount: number,
  basisPoints: number
): number {
  // Integer multiplication then floor division
  return Math.floor((originalAmount * basisPoints) / BASIS_POINTS_100_PERCENT);
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Module version for attribution.
 */
export const ATTRIBUTION_VERSION = '1.0.0' as const;

/**
 * Forbidden concepts - these must NEVER appear.
 */
export const ATTRIBUTION_FORBIDDEN_CONCEPTS = Object.freeze([
  'payment',
  'wallet',
  'crypto',
  'blockchain',
  'usdt',
  'transfer',
  'deposit',
  'withdraw',
  'balance',
]) as readonly string[];

/**
 * Maximum hierarchy depth (safety limit).
 */
export const MAX_HIERARCHY_DEPTH = 10 as const;

/**
 * Maximum number of rules in a rule set.
 */
export const MAX_RULES_PER_SET = 100 as const;
