/**
 * GreyRechargeReference.ts
 * Phase A3 - Grey Recharge Reference Mapping
 *
 * IMMUTABLE REFERENCE LINKS TO GREYFLOW
 *
 * This module provides immutable reference links between recharge records
 * and GreyFlowIds. All operations are REFERENCE-ONLY.
 *
 * @external This module operates OUTSIDE the frozen engine.
 * @readonly This module NEVER mutates GreyFlow or Attribution data.
 * @reference This module creates REFERENCES only, no value movement.
 * @deterministic Same inputs always produce same outputs.
 */

import { GreyFlowId, GreyFlowRegistry, GreyFlowRecord } from '../grey-runtime';

import {
  GreyRechargeId,
  RechargeLinkId,
  RechargeLink,
  GreyRechargeRecord,
  RechargeResult,
  RechargeErrorCode,
  rechargeSuccess,
  rechargeFailure,
  createRechargeError,
  createRechargeLinkId,
  isValidTimestamp,
  isValidNonNegativeInteger,
} from './GreyRechargeTypes';

import {
  GreyRechargeRegistry,
} from './GreyRechargeRegistry';

// ============================================================================
// CHECKSUM CALCULATION
// ============================================================================

/**
 * Calculate checksum for a recharge link.
 */
function calculateLinkChecksum(
  linkId: RechargeLinkId,
  rechargeId: GreyRechargeId,
  linkedFlowIds: readonly GreyFlowId[],
  linkedReferenceTotal: number,
  linkedTimestamp: number
): string {
  const sortedFlowIds = [...linkedFlowIds].sort();
  const data = [
    `lid:${linkId}`,
    `rid:${rechargeId}`,
    `flows:${sortedFlowIds.join(',')}`,
    `total:${linkedReferenceTotal}`,
    `ts:${linkedTimestamp}`,
  ].join('|');

  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }

  return `rlnk_${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

// ============================================================================
// LINK INPUT
// ============================================================================

/**
 * Input for creating a recharge link.
 */
export interface RechargeLinkInput {
  readonly linkId: RechargeLinkId;
  readonly rechargeId: GreyRechargeId;
  readonly flowIds: readonly GreyFlowId[];
  readonly linkedTimestamp: number;
}

// ============================================================================
// LINK CREATION
// ============================================================================

/**
 * Create a recharge link with validation.
 *
 * @param input - Link input
 * @param rechargeRegistry - Registry to validate recharge exists
 * @param flowRegistry - Registry to validate flows exist and get amounts
 * @returns Result containing the link or error
 */
export function createRechargeLink(
  input: RechargeLinkInput,
  rechargeRegistry: GreyRechargeRegistry,
  flowRegistry: GreyFlowRegistry
): RechargeResult<RechargeLink> {
  // Validate timestamp
  if (!isValidTimestamp(input.linkedTimestamp)) {
    return rechargeFailure(
      createRechargeError(
        RechargeErrorCode.INVALID_TIMESTAMP,
        `Linked timestamp must be a positive integer, got: ${input.linkedTimestamp}`,
        { linkedTimestamp: input.linkedTimestamp }
      )
    );
  }

  // Validate recharge exists
  const rechargeRecord = rechargeRegistry.getRecharge(input.rechargeId);
  if (!rechargeRecord) {
    return rechargeFailure(
      createRechargeError(
        RechargeErrorCode.RECHARGE_NOT_FOUND,
        `Recharge not found: ${input.rechargeId}`,
        { rechargeId: input.rechargeId }
      )
    );
  }

  // Validate all flow IDs exist and calculate total
  let linkedReferenceTotal = 0;
  for (const flowId of input.flowIds) {
    const flowRecord = flowRegistry.getFlow(flowId);
    if (!flowRecord) {
      return rechargeFailure(
        createRechargeError(
          RechargeErrorCode.FLOW_NOT_FOUND,
          `Flow not found: ${flowId}`,
          { flowId, rechargeId: input.rechargeId }
        )
      );
    }
    linkedReferenceTotal += flowRecord.amount;
  }

  // Calculate checksum
  const checksum = calculateLinkChecksum(
    input.linkId,
    input.rechargeId,
    input.flowIds,
    linkedReferenceTotal,
    input.linkedTimestamp
  );

  return rechargeSuccess(
    Object.freeze({
      linkId: input.linkId,
      rechargeId: input.rechargeId,
      linkedFlowIds: Object.freeze([...input.flowIds]),
      linkedReferenceTotal,
      linkedTimestamp: input.linkedTimestamp,
      checksum,
    })
  );
}

/**
 * Create a recharge link without flow validation (for offline/batch use).
 * Use with caution - does not verify flow existence.
 */
export function createRechargeLinkUnchecked(
  input: RechargeLinkInput,
  flowAmounts: readonly number[]
): RechargeResult<RechargeLink> {
  // Validate timestamp
  if (!isValidTimestamp(input.linkedTimestamp)) {
    return rechargeFailure(
      createRechargeError(
        RechargeErrorCode.INVALID_TIMESTAMP,
        `Linked timestamp must be a positive integer, got: ${input.linkedTimestamp}`,
        { linkedTimestamp: input.linkedTimestamp }
      )
    );
  }

  // Validate arrays match
  if (input.flowIds.length !== flowAmounts.length) {
    return rechargeFailure(
      createRechargeError(
        RechargeErrorCode.NON_INTEGER_VALUE,
        `Flow IDs and amounts arrays must have same length`,
        { flowIdsLength: input.flowIds.length, amountsLength: flowAmounts.length }
      )
    );
  }

  // Validate and calculate total
  let linkedReferenceTotal = 0;
  for (const amount of flowAmounts) {
    if (!isValidNonNegativeInteger(amount)) {
      return rechargeFailure(
        createRechargeError(
          RechargeErrorCode.NON_INTEGER_VALUE,
          `Flow amount must be non-negative integer, got: ${amount}`,
          { amount }
        )
      );
    }
    linkedReferenceTotal += amount;
  }

  // Calculate checksum
  const checksum = calculateLinkChecksum(
    input.linkId,
    input.rechargeId,
    input.flowIds,
    linkedReferenceTotal,
    input.linkedTimestamp
  );

  return rechargeSuccess(
    Object.freeze({
      linkId: input.linkId,
      rechargeId: input.rechargeId,
      linkedFlowIds: Object.freeze([...input.flowIds]),
      linkedReferenceTotal,
      linkedTimestamp: input.linkedTimestamp,
      checksum,
    })
  );
}

// ============================================================================
// LINK REGISTRY
// ============================================================================

/**
 * Append link result.
 */
export interface AppendLinkResult {
  readonly link: RechargeLink;
}

/**
 * Registry for recharge-to-GreyFlow links.
 * Maintains the mapping without modifying GreyFlow.
 */
export class RechargeLinkRegistry {
  private readonly links: RechargeLink[] = [];
  private readonly linkIndex: Map<RechargeLinkId, RechargeLink> = new Map();
  private readonly rechargeToLinks: Map<GreyRechargeId, RechargeLink[]> = new Map();
  private readonly flowToLinks: Map<GreyFlowId, RechargeLink[]> = new Map();

  /**
   * Append a link to the registry.
   */
  appendLink(link: RechargeLink): RechargeResult<AppendLinkResult> {
    // Check for duplicate link ID
    if (this.linkIndex.has(link.linkId)) {
      return rechargeFailure(
        createRechargeError(
          RechargeErrorCode.DUPLICATE_LINK_ID,
          `Link ID already exists: ${link.linkId}`,
          { linkId: link.linkId }
        )
      );
    }

    // Add to registry
    this.links.push(link);
    this.linkIndex.set(link.linkId, link);

    // Update recharge-to-links index
    const existingForRecharge = this.rechargeToLinks.get(link.rechargeId) || [];
    existingForRecharge.push(link);
    this.rechargeToLinks.set(link.rechargeId, existingForRecharge);

    // Update flow-to-links index
    for (const flowId of link.linkedFlowIds) {
      const existingForFlow = this.flowToLinks.get(flowId) || [];
      existingForFlow.push(link);
      this.flowToLinks.set(flowId, existingForFlow);
    }

    return rechargeSuccess({ link });
  }

  /**
   * Get a link by ID.
   */
  getLink(linkId: RechargeLinkId): RechargeLink | undefined {
    return this.linkIndex.get(linkId);
  }

  /**
   * Get all links.
   */
  getAllLinks(): readonly RechargeLink[] {
    return Object.freeze([...this.links]);
  }

  /**
   * Get links for a recharge ID.
   */
  getLinksByRecharge(rechargeId: GreyRechargeId): readonly RechargeLink[] {
    return Object.freeze(this.rechargeToLinks.get(rechargeId) || []);
  }

  /**
   * Get links for a flow ID.
   */
  getLinksByFlow(flowId: GreyFlowId): readonly RechargeLink[] {
    return Object.freeze(this.flowToLinks.get(flowId) || []);
  }

  /**
   * Get total linked reference amount for a recharge.
   */
  getTotalLinkedForRecharge(rechargeId: GreyRechargeId): number {
    const links = this.rechargeToLinks.get(rechargeId) || [];
    let total = 0;
    for (const link of links) {
      total += link.linkedReferenceTotal;
    }
    return total;
  }

  /**
   * Get link count.
   */
  getLinkCount(): number {
    return this.links.length;
  }
}

/**
 * Create a new link registry.
 */
export function createRechargeLinkRegistry(): RechargeLinkRegistry {
  return new RechargeLinkRegistry();
}

// ============================================================================
// LINK VERIFICATION
// ============================================================================

/**
 * Verify a link's checksum.
 */
export function verifyLinkChecksum(link: RechargeLink): boolean {
  const expectedChecksum = calculateLinkChecksum(
    link.linkId,
    link.rechargeId,
    link.linkedFlowIds,
    link.linkedReferenceTotal,
    link.linkedTimestamp
  );

  return link.checksum === expectedChecksum;
}

/**
 * Verify that linked flows still exist in the registry.
 */
export function verifyLinkedFlowsExist(
  link: RechargeLink,
  flowRegistry: GreyFlowRegistry
): RechargeResult<void> {
  for (const flowId of link.linkedFlowIds) {
    const flowRecord = flowRegistry.getFlow(flowId);
    if (!flowRecord) {
      return rechargeFailure(
        createRechargeError(
          RechargeErrorCode.FLOW_NOT_FOUND,
          `Linked flow no longer exists: ${flowId}`,
          { flowId, linkId: link.linkId }
        )
      );
    }
  }

  return rechargeSuccess(undefined);
}

/**
 * Verify that link amounts are consistent with flow amounts.
 */
export function verifyLinkAmountConsistency(
  link: RechargeLink,
  flowRegistry: GreyFlowRegistry
): RechargeResult<void> {
  let actualTotal = 0;
  for (const flowId of link.linkedFlowIds) {
    const flowRecord = flowRegistry.getFlow(flowId);
    if (!flowRecord) {
      return rechargeFailure(
        createRechargeError(
          RechargeErrorCode.FLOW_NOT_FOUND,
          `Linked flow not found: ${flowId}`,
          { flowId, linkId: link.linkId }
        )
      );
    }
    actualTotal += flowRecord.amount;
  }

  if (actualTotal !== link.linkedReferenceTotal) {
    return rechargeFailure(
      createRechargeError(
        RechargeErrorCode.CHECKSUM_MISMATCH,
        `Link amount mismatch: expected ${link.linkedReferenceTotal}, actual ${actualTotal}`,
        {
          linkId: link.linkId,
          expectedTotal: link.linkedReferenceTotal,
          actualTotal,
        }
      )
    );
  }

  return rechargeSuccess(undefined);
}

// ============================================================================
// TRACE TYPES
// ============================================================================

/**
 * Trace from recharge to flows.
 */
export interface RechargeToFlowTrace {
  readonly rechargeId: GreyRechargeId;
  readonly rechargeRecord: GreyRechargeRecord;
  readonly links: readonly RechargeLink[];
  readonly totalLinkedAmount: number;
  readonly linkedFlowIds: readonly GreyFlowId[];
}

/**
 * Trace from flow to recharges.
 */
export interface FlowToRechargeTrace {
  readonly flowId: GreyFlowId;
  readonly links: readonly RechargeLink[];
  readonly linkedRechargeIds: readonly GreyRechargeId[];
}

/**
 * Trace recharge to all linked flows.
 */
export function traceRechargeToFlows(
  rechargeId: GreyRechargeId,
  rechargeRegistry: GreyRechargeRegistry,
  linkRegistry: RechargeLinkRegistry
): RechargeResult<RechargeToFlowTrace> {
  const rechargeRecord = rechargeRegistry.getRecharge(rechargeId);
  if (!rechargeRecord) {
    return rechargeFailure(
      createRechargeError(
        RechargeErrorCode.RECHARGE_NOT_FOUND,
        `Recharge not found: ${rechargeId}`,
        { rechargeId }
      )
    );
  }

  const links = linkRegistry.getLinksByRecharge(rechargeId);

  // Collect unique flow IDs
  const flowIdSet = new Set<string>();
  let totalLinkedAmount = 0;
  for (const link of links) {
    for (const flowId of link.linkedFlowIds) {
      flowIdSet.add(flowId as string);
    }
    totalLinkedAmount += link.linkedReferenceTotal;
  }

  return rechargeSuccess(
    Object.freeze({
      rechargeId,
      rechargeRecord,
      links,
      totalLinkedAmount,
      linkedFlowIds: Object.freeze(Array.from(flowIdSet) as GreyFlowId[]),
    })
  );
}

/**
 * Trace flow to all linked recharges.
 */
export function traceFlowToRecharges(
  flowId: GreyFlowId,
  linkRegistry: RechargeLinkRegistry
): FlowToRechargeTrace {
  const links = linkRegistry.getLinksByFlow(flowId);

  // Collect unique recharge IDs
  const rechargeIdSet = new Set<string>();
  for (const link of links) {
    rechargeIdSet.add(link.rechargeId as string);
  }

  return Object.freeze({
    flowId,
    links,
    linkedRechargeIds: Object.freeze(Array.from(rechargeIdSet) as GreyRechargeId[]),
  });
}
