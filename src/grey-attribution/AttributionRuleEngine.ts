/**
 * AttributionRuleEngine.ts
 * Phase A2 - Grey Flow Multi-Level Attribution
 *
 * PURE FUNCTION ATTRIBUTION ENGINE
 *
 * This module provides pure functions for applying attribution rules.
 * Consumes GreyReconciliation outputs and produces flat attribution entries.
 *
 * @external This module operates OUTSIDE the frozen engine.
 * @readonly This module NEVER mutates any state.
 * @deterministic Same inputs always produce same outputs.
 * @pure All functions are pure with no side effects.
 */

import { GreyFlowId, GreyPartyId, GreyFlowRecord, GreyFlowStatus, GreyPartyType as GreyRuntimePartyType } from '../grey-runtime';
import { PeriodReconciliationResult, FlowSummary, ReconciliationPeriodId } from '../grey-reconciliation';

import {
  AttributionRule,
  AttributionRuleSet,
  AttributionRuleSetId,
  AttributionEntry,
  AttributionEntryId,
  AttributionPartyType,
  AgentHierarchy,
  AgentHierarchyNode,
  FlowAttributionResult,
  PeriodAttributionResult,
  AttributionResult,
  AttributionError,
  AttributionErrorCode,
  attributionSuccess,
  attributionFailure,
  createAttributionError,
  createAttributionEntry,
  createAttributionEntryId,
  calculateAttributedAmount,
  isValidInteger,
  BASIS_POINTS_100_PERCENT,
  MAX_RULES_PER_SET,
} from './AttributionTypes';

import {
  calculateAgentChainShares,
} from './AgentHierarchyResolver';

// ============================================================================
// RULE SET VALIDATION
// ============================================================================

/**
 * Validate that a rule set's basis points sum to exactly 100%.
 *
 * @param rules - Array of attribution rules
 * @returns Result indicating success or failure
 */
export function validateRuleSetTotal(
  rules: readonly AttributionRule[]
): AttributionResult<void> {
  if (rules.length === 0) {
    return attributionFailure(
      createAttributionError(
        AttributionErrorCode.INVALID_RULE_SET_TOTAL,
        'Rule set must have at least one rule',
        { ruleCount: 0 }
      )
    );
  }

  if (rules.length > MAX_RULES_PER_SET) {
    return attributionFailure(
      createAttributionError(
        AttributionErrorCode.INVALID_RULE_SET_TOTAL,
        `Rule set exceeds maximum rules: ${MAX_RULES_PER_SET}`,
        { ruleCount: rules.length, maxRules: MAX_RULES_PER_SET }
      )
    );
  }

  let totalBasisPoints = 0;
  for (const rule of rules) {
    if (!isValidInteger(rule.basisPoints)) {
      return attributionFailure(
        createAttributionError(
          AttributionErrorCode.NON_INTEGER_VALUE,
          `Rule basisPoints must be integer: ${rule.basisPoints}`,
          { partyId: rule.partyId, basisPoints: rule.basisPoints }
        )
      );
    }
    totalBasisPoints += rule.basisPoints;
  }

  if (totalBasisPoints !== BASIS_POINTS_100_PERCENT) {
    return attributionFailure(
      createAttributionError(
        AttributionErrorCode.INVALID_RULE_SET_TOTAL,
        `Rule set basis points must sum to ${BASIS_POINTS_100_PERCENT}, got: ${totalBasisPoints}`,
        { totalBasisPoints, expected: BASIS_POINTS_100_PERCENT }
      )
    );
  }

  return attributionSuccess(undefined);
}

/**
 * Create a validated attribution rule set.
 *
 * @param ruleSetId - Unique ID for the rule set
 * @param rules - Array of attribution rules
 * @param label - Optional label
 * @param createdAt - Timestamp when created (explicit, not from clock)
 * @returns Result containing the rule set or error
 */
export function createAttributionRuleSet(
  ruleSetId: AttributionRuleSetId,
  rules: readonly AttributionRule[],
  createdAt: number,
  label?: string
): AttributionResult<AttributionRuleSet> {
  // Validate rule set total
  const validationResult = validateRuleSetTotal(rules);
  if (!validationResult.success) {
    return attributionFailure(validationResult.error);
  }

  // Calculate total
  let totalBasisPoints = 0;
  for (const rule of rules) {
    totalBasisPoints += rule.basisPoints;
  }

  return attributionSuccess(
    Object.freeze({
      ruleSetId,
      rules: Object.freeze([...rules]),
      totalBasisPoints,
      label,
      createdAt,
    })
  );
}

// ============================================================================
// SINGLE FLOW ATTRIBUTION
// ============================================================================

/**
 * Apply attribution rules to a single flow amount.
 * Uses floor division to ensure integer results.
 * Assigns remainder to first party (platform by convention).
 *
 * @param flowId - Source flow ID
 * @param amount - Amount to attribute (INTEGER)
 * @param ruleSet - Attribution rule set
 * @param entryIdPrefix - Prefix for generated entry IDs
 * @returns Result containing attribution entries
 */
export function attributeFlow(
  flowId: GreyFlowId,
  amount: number,
  ruleSet: AttributionRuleSet,
  entryIdPrefix: string
): AttributionResult<FlowAttributionResult> {
  // Validate amount is integer
  if (!isValidInteger(amount)) {
    return attributionFailure(
      createAttributionError(
        AttributionErrorCode.NON_INTEGER_VALUE,
        `Flow amount must be integer: ${amount}`,
        { flowId, amount }
      )
    );
  }

  // Validate amount is non-negative
  if (amount < 0) {
    return attributionFailure(
      createAttributionError(
        AttributionErrorCode.NON_INTEGER_VALUE,
        `Flow amount must be non-negative: ${amount}`,
        { flowId, amount }
      )
    );
  }

  const entries: AttributionEntry[] = [];
  let totalAttributed = 0;

  // Apply each rule (deterministic order from rule set)
  for (let i = 0; i < ruleSet.rules.length; i++) {
    const rule = ruleSet.rules[i];
    const attributedAmount = calculateAttributedAmount(amount, rule.basisPoints);

    const entryId = createAttributionEntryId(`${entryIdPrefix}_${flowId}_${i}`);
    const entryResult = createAttributionEntry(
      entryId,
      rule.partyId,
      rule.partyType,
      attributedAmount,
      flowId,
      ruleSet.ruleSetId,
      rule.basisPoints,
      amount
    );

    if (!entryResult.success) {
      return attributionFailure(entryResult.error);
    }

    entries.push(entryResult.value);
    totalAttributed += attributedAmount;
  }

  // Calculate remainder and assign to first party (platform)
  const remainder = amount - totalAttributed;

  if (remainder > 0 && entries.length > 0) {
    // Add remainder to first entry (platform by convention)
    const firstEntry = entries[0];
    const adjustedEntry = Object.freeze({
      ...firstEntry,
      amount: firstEntry.amount + remainder,
    });
    entries[0] = adjustedEntry;
    totalAttributed += remainder;
  }

  // Verify conservation
  if (totalAttributed !== amount) {
    return attributionFailure(
      createAttributionError(
        AttributionErrorCode.AMOUNT_MISMATCH,
        `Attribution amount mismatch: expected ${amount}, got ${totalAttributed}`,
        { flowId, expected: amount, actual: totalAttributed }
      )
    );
  }

  return attributionSuccess(
    Object.freeze({
      sourceGreyFlowId: flowId,
      originalAmount: amount,
      entries: Object.freeze(entries),
      totalAttributed,
      remainder: 0, // Remainder was distributed
    })
  );
}

// ============================================================================
// MULTI-LEVEL AGENT ATTRIBUTION
// ============================================================================

/**
 * Apply multi-level agent attribution.
 * Distributes the agent portion according to hierarchy shares.
 *
 * @param flowId - Source flow ID
 * @param agentAmount - Amount allocated to agent hierarchy
 * @param hierarchy - Agent hierarchy
 * @param leafAgentId - The leaf agent (bottom of hierarchy) for this flow
 * @param ruleSetId - Rule set ID for tracking
 * @param entryIdPrefix - Prefix for generated entry IDs
 * @returns Result containing agent attribution entries
 */
export function attributeToAgentHierarchy(
  flowId: GreyFlowId,
  agentAmount: number,
  hierarchy: AgentHierarchy,
  leafAgentId: GreyPartyId,
  ruleSetId: AttributionRuleSetId,
  entryIdPrefix: string
): AttributionResult<readonly AttributionEntry[]> {
  // Validate amount
  if (!isValidInteger(agentAmount) || agentAmount < 0) {
    return attributionFailure(
      createAttributionError(
        AttributionErrorCode.NON_INTEGER_VALUE,
        `Agent amount must be non-negative integer: ${agentAmount}`,
        { agentAmount }
      )
    );
  }

  // Calculate chain shares
  const sharesResult = calculateAgentChainShares(
    hierarchy,
    leafAgentId,
    BASIS_POINTS_100_PERCENT
  );

  if (!sharesResult.success) {
    return attributionFailure(
      createAttributionError(
        sharesResult.error.code,
        sharesResult.error.message,
        sharesResult.error.details
      )
    );
  }

  const shares = sharesResult.value;
  const entries: AttributionEntry[] = [];
  let totalAttributed = 0;

  // Create entries for each agent in the chain
  for (let i = 0; i < shares.length; i++) {
    const share = shares[i];

    // Calculate this agent's amount based on effective basis points
    const attributedAmount = Math.floor(
      (agentAmount * share.effectiveBasisPoints) / BASIS_POINTS_100_PERCENT
    );

    if (attributedAmount > 0) {
      const entryId = createAttributionEntryId(`${entryIdPrefix}_agent_${flowId}_${i}`);
      const entryResult = createAttributionEntry(
        entryId,
        share.agentId,
        AttributionPartyType.AGENT,
        attributedAmount,
        flowId,
        ruleSetId,
        share.effectiveBasisPoints,
        agentAmount
      );

      if (!entryResult.success) {
        return attributionFailure(entryResult.error);
      }

      entries.push(entryResult.value);
      totalAttributed += attributedAmount;
    }
  }

  // Assign remainder to leaf agent (most specific)
  const remainder = agentAmount - totalAttributed;
  if (remainder > 0 && entries.length > 0) {
    const leafEntry = entries[0]; // Leaf is first in the chain
    entries[0] = Object.freeze({
      ...leafEntry,
      amount: leafEntry.amount + remainder,
    });
  }

  return attributionSuccess(Object.freeze(entries));
}

// ============================================================================
// PERIOD ATTRIBUTION
// ============================================================================

/**
 * Input for period attribution.
 */
export interface PeriodAttributionInput {
  readonly reconciliationResult: PeriodReconciliationResult;
  /** Flow records to attribute (RAKE_REF flows only typically) */
  readonly flowsToAttribute: readonly GreyFlowRecord[];
  readonly ruleSet: AttributionRuleSet;
  /** Optional agent hierarchy for multi-level attribution */
  readonly agentHierarchy?: AgentHierarchy;
  /** Map from flow to leaf agent (for multi-level attribution) */
  readonly flowToLeafAgent?: ReadonlyMap<GreyFlowId, GreyPartyId>;
}

/**
 * Attribute all flows in a reconciliation period.
 * Pure function - no mutations.
 *
 * @param input - Period attribution input
 * @returns Result containing period attribution result
 */
export function attributePeriod(
  input: PeriodAttributionInput
): AttributionResult<PeriodAttributionResult> {
  const {
    reconciliationResult,
    flowsToAttribute,
    ruleSet,
    agentHierarchy,
    flowToLeafAgent,
  } = input;

  const periodId = reconciliationResult.period.periodId;
  const flowResults: FlowAttributionResult[] = [];
  let totalOriginal = 0;
  let totalAttributed = 0;
  let totalRemainder = 0;
  let entryCount = 0;

  // Process each flow
  for (const flow of flowsToAttribute) {
    // Skip voided flows
    if (flow.status === GreyFlowStatus.VOID) {
      continue;
    }

    // Attribute the flow
    const flowResult = attributeFlow(
      flow.flowId,
      flow.amount,
      ruleSet,
      `attr_${periodId}`
    );

    if (!flowResult.success) {
      return attributionFailure(flowResult.error);
    }

    flowResults.push(flowResult.value);
    totalOriginal += flowResult.value.originalAmount;
    totalAttributed += flowResult.value.totalAttributed;
    totalRemainder += flowResult.value.remainder;
    entryCount += flowResult.value.entries.length;
  }

  // Calculate checksum
  const checksumData = {
    periodId,
    ruleSetId: ruleSet.ruleSetId,
    flowCount: flowResults.length,
    totalOriginal,
    totalAttributed,
    entryCount,
  };
  const checksum = calculateAttributionChecksum(checksumData);

  return attributionSuccess(
    Object.freeze({
      periodId,
      ruleSetId: ruleSet.ruleSetId,
      flowResults: Object.freeze(flowResults),
      totalOriginal,
      totalAttributed,
      totalRemainder,
      flowCount: flowResults.length,
      entryCount,
      checksum,
    })
  );
}

// ============================================================================
// CHECKSUM CALCULATION
// ============================================================================

/**
 * Serialize data for checksum calculation.
 * Keys are sorted to ensure determinism.
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
 * Simple deterministic hash function.
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return `attr_${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

/**
 * Calculate a deterministic checksum for attribution data.
 */
export function calculateAttributionChecksum(data: unknown): string {
  const str = serializeForChecksum(data);
  return simpleHash(str);
}

/**
 * Verify an attribution result's checksum.
 */
export function verifyAttributionChecksum(result: PeriodAttributionResult): boolean {
  const checksumData = {
    periodId: result.periodId,
    ruleSetId: result.ruleSetId,
    flowCount: result.flowCount,
    totalOriginal: result.totalOriginal,
    totalAttributed: result.totalAttributed,
    entryCount: result.entryCount,
  };

  const expectedChecksum = calculateAttributionChecksum(checksumData);
  return result.checksum === expectedChecksum;
}

// ============================================================================
// ATTRIBUTION SUMMARY FUNCTIONS
// ============================================================================

/**
 * Summarize attribution entries by party.
 */
export function summarizeEntriesByParty(
  entries: readonly AttributionEntry[]
): ReadonlyMap<GreyPartyId, number> {
  const summary = new Map<GreyPartyId, number>();

  for (const entry of entries) {
    const current = summary.get(entry.partyId) || 0;
    summary.set(entry.partyId, current + entry.amount);
  }

  return summary;
}

/**
 * Summarize attribution entries by party type.
 */
export function summarizeEntriesByPartyType(
  entries: readonly AttributionEntry[]
): ReadonlyMap<AttributionPartyType, number> {
  const summary = new Map<AttributionPartyType, number>();

  for (const entry of entries) {
    const current = summary.get(entry.partyType) || 0;
    summary.set(entry.partyType, current + entry.amount);
  }

  return summary;
}

/**
 * Get all entries for a specific party.
 */
export function getEntriesForParty(
  entries: readonly AttributionEntry[],
  partyId: GreyPartyId
): readonly AttributionEntry[] {
  return Object.freeze(entries.filter((e) => e.partyId === partyId));
}

/**
 * Get all entries for a specific party type.
 */
export function getEntriesForPartyType(
  entries: readonly AttributionEntry[],
  partyType: AttributionPartyType
): readonly AttributionEntry[] {
  return Object.freeze(entries.filter((e) => e.partyType === partyType));
}

/**
 * Verify that all entries sum to the original amount.
 * Conservation check.
 */
export function verifyAttributionConservation(
  result: FlowAttributionResult
): boolean {
  let total = 0;
  for (const entry of result.entries) {
    total += entry.amount;
  }
  return total === result.originalAmount;
}

/**
 * Verify all flows in a period result conserve amounts.
 */
export function verifyPeriodConservation(
  result: PeriodAttributionResult
): boolean {
  for (const flowResult of result.flowResults) {
    if (!verifyAttributionConservation(flowResult)) {
      return false;
    }
  }
  return result.totalAttributed === result.totalOriginal;
}

// ============================================================================
// COMPARISON FUNCTIONS
// ============================================================================

/**
 * Compare two attribution results for equivalence.
 */
export function compareAttributionResults(
  result1: PeriodAttributionResult,
  result2: PeriodAttributionResult
): boolean {
  return result1.checksum === result2.checksum;
}
