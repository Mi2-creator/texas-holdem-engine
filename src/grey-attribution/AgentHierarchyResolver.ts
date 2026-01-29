/**
 * AgentHierarchyResolver.ts
 * Phase A2 - Grey Flow Multi-Level Attribution
 *
 * AGENT HIERARCHY VALIDATION AND RESOLUTION
 *
 * This module validates and resolves agent hierarchies.
 * Ensures hierarchies are directed acyclic graphs (DAGs).
 *
 * @external This module operates OUTSIDE the frozen engine.
 * @readonly This module NEVER mutates any state.
 * @deterministic Same inputs always produce same outputs.
 */

import { GreyPartyId } from '../grey-runtime';

import {
  AgentHierarchy,
  AgentHierarchyNode,
  AgentHierarchyId,
  AttributionResult,
  AttributionError,
  AttributionErrorCode,
  attributionSuccess,
  attributionFailure,
  createAttributionError,
  createAgentHierarchyNode,
  MAX_HIERARCHY_DEPTH,
  isValidNonNegativeInteger,
  BASIS_POINTS_100_PERCENT,
} from './AttributionTypes';

// ============================================================================
// HIERARCHY VALIDATION
// ============================================================================

/**
 * Validate that an agent hierarchy is a valid DAG (no cycles).
 *
 * @param nodes - Array of hierarchy nodes to validate
 * @returns Result indicating success or failure with cycle info
 */
export function validateHierarchyIsDAG(
  nodes: readonly AgentHierarchyNode[]
): AttributionResult<void> {
  // Build adjacency map (child -> parent)
  const parentMap = new Map<string, string | null>();
  const nodeIds = new Set<string>();

  for (const node of nodes) {
    const agentIdStr = node.agentId as string;

    // Check for duplicate agents
    if (nodeIds.has(agentIdStr)) {
      return attributionFailure(
        createAttributionError(
          AttributionErrorCode.DUPLICATE_AGENT,
          `Duplicate agent ID in hierarchy: ${agentIdStr}`,
          { agentId: agentIdStr }
        )
      );
    }

    nodeIds.add(agentIdStr);
    parentMap.set(agentIdStr, node.parentAgentId as string | null);
  }

  // Validate all parents exist (if not null)
  for (const node of nodes) {
    if (node.parentAgentId !== null) {
      const parentIdStr = node.parentAgentId as string;
      if (!nodeIds.has(parentIdStr)) {
        return attributionFailure(
          createAttributionError(
            AttributionErrorCode.PARENT_AGENT_NOT_FOUND,
            `Parent agent not found: ${parentIdStr}`,
            { agentId: node.agentId, parentAgentId: parentIdStr }
          )
        );
      }
    }
  }

  // Check for cycles using DFS
  const visited = new Set<string>();
  const inStack = new Set<string>();

  function hasCycle(agentId: string): boolean {
    if (inStack.has(agentId)) {
      return true; // Cycle detected
    }

    if (visited.has(agentId)) {
      return false; // Already processed, no cycle through this node
    }

    visited.add(agentId);
    inStack.add(agentId);

    const parentId = parentMap.get(agentId);
    if (parentId !== null && parentId !== undefined) {
      if (hasCycle(parentId)) {
        return true;
      }
    }

    inStack.delete(agentId);
    return false;
  }

  for (const agentId of nodeIds) {
    if (hasCycle(agentId)) {
      return attributionFailure(
        createAttributionError(
          AttributionErrorCode.HIERARCHY_CYCLE_DETECTED,
          `Cycle detected in agent hierarchy involving: ${agentId}`,
          { agentId }
        )
      );
    }
  }

  return attributionSuccess(undefined);
}

/**
 * Validate hierarchy levels are consistent with parent relationships.
 *
 * @param nodes - Array of hierarchy nodes to validate
 * @returns Result indicating success or failure
 */
export function validateHierarchyLevels(
  nodes: readonly AgentHierarchyNode[]
): AttributionResult<void> {
  // Build node map for lookup
  const nodeMap = new Map<string, AgentHierarchyNode>();
  for (const node of nodes) {
    nodeMap.set(node.agentId as string, node);
  }

  for (const node of nodes) {
    // Top-level agents must have level 0
    if (node.parentAgentId === null) {
      if (node.level !== 0) {
        return attributionFailure(
          createAttributionError(
            AttributionErrorCode.INVALID_HIERARCHY_LEVEL,
            `Top-level agent must have level 0, got: ${node.level}`,
            { agentId: node.agentId, level: node.level }
          )
        );
      }
    } else {
      // Child agents must have level = parent.level + 1
      const parent = nodeMap.get(node.parentAgentId as string);
      if (parent) {
        const expectedLevel = parent.level + 1;
        if (node.level !== expectedLevel) {
          return attributionFailure(
            createAttributionError(
              AttributionErrorCode.INVALID_HIERARCHY_LEVEL,
              `Agent level must be parent.level + 1, expected: ${expectedLevel}, got: ${node.level}`,
              {
                agentId: node.agentId,
                parentAgentId: node.parentAgentId,
                expectedLevel,
                actualLevel: node.level,
              }
            )
          );
        }
      }
    }

    // Check max depth
    if (node.level > MAX_HIERARCHY_DEPTH) {
      return attributionFailure(
        createAttributionError(
          AttributionErrorCode.INVALID_HIERARCHY_LEVEL,
          `Hierarchy level exceeds maximum: ${MAX_HIERARCHY_DEPTH}`,
          { agentId: node.agentId, level: node.level, maxLevel: MAX_HIERARCHY_DEPTH }
        )
      );
    }
  }

  return attributionSuccess(undefined);
}

/**
 * Validate entire hierarchy.
 *
 * @param nodes - Array of hierarchy nodes to validate
 * @returns Result indicating success or failure
 */
export function validateHierarchy(
  nodes: readonly AgentHierarchyNode[]
): AttributionResult<void> {
  // Validate DAG (no cycles)
  const dagResult = validateHierarchyIsDAG(nodes);
  if (!dagResult.success) {
    return dagResult;
  }

  // Validate levels
  const levelResult = validateHierarchyLevels(nodes);
  if (!levelResult.success) {
    return levelResult;
  }

  return attributionSuccess(undefined);
}

// ============================================================================
// HIERARCHY CREATION
// ============================================================================

/**
 * Create a validated agent hierarchy.
 *
 * @param hierarchyId - Unique ID for the hierarchy
 * @param nodes - Array of hierarchy nodes
 * @param label - Optional label
 * @returns Result containing the hierarchy or error
 */
export function createAgentHierarchy(
  hierarchyId: AgentHierarchyId,
  nodes: readonly AgentHierarchyNode[],
  label?: string
): AttributionResult<AgentHierarchy> {
  // Validate the hierarchy
  const validationResult = validateHierarchy(nodes);
  if (!validationResult.success) {
    return attributionFailure(validationResult.error);
  }

  // Calculate max level
  let maxLevel = 0;
  for (const node of nodes) {
    if (node.level > maxLevel) {
      maxLevel = node.level;
    }
  }

  return attributionSuccess(
    Object.freeze({
      hierarchyId,
      nodes: Object.freeze([...nodes]),
      maxLevel,
      agentCount: nodes.length,
      label,
    })
  );
}

// ============================================================================
// HIERARCHY RESOLUTION
// ============================================================================

/**
 * Resolved parent chain for an agent.
 */
export interface ResolvedParentChain {
  readonly agentId: GreyPartyId;
  /** Parent chain from immediate parent to root (empty if top-level) */
  readonly parentChain: readonly GreyPartyId[];
  /** Level of this agent */
  readonly level: number;
  /** Is this a top-level agent */
  readonly isTopLevel: boolean;
}

/**
 * Resolve the parent chain for a specific agent.
 *
 * @param hierarchy - The agent hierarchy
 * @param agentId - Agent ID to resolve
 * @returns Result containing the resolved chain or error
 */
export function resolveParentChain(
  hierarchy: AgentHierarchy,
  agentId: GreyPartyId
): AttributionResult<ResolvedParentChain> {
  // Build node map
  const nodeMap = new Map<string, AgentHierarchyNode>();
  for (const node of hierarchy.nodes) {
    nodeMap.set(node.agentId as string, node);
  }

  const node = nodeMap.get(agentId as string);
  if (!node) {
    return attributionFailure(
      createAttributionError(
        AttributionErrorCode.PARENT_AGENT_NOT_FOUND,
        `Agent not found in hierarchy: ${agentId}`,
        { agentId }
      )
    );
  }

  // Build parent chain
  const parentChain: GreyPartyId[] = [];
  let currentParentId = node.parentAgentId;

  while (currentParentId !== null) {
    parentChain.push(currentParentId);
    const parentNode = nodeMap.get(currentParentId as string);
    if (!parentNode) {
      break; // Should not happen if hierarchy is validated
    }
    currentParentId = parentNode.parentAgentId;
  }

  return attributionSuccess(
    Object.freeze({
      agentId,
      parentChain: Object.freeze(parentChain),
      level: node.level,
      isTopLevel: node.parentAgentId === null,
    })
  );
}

/**
 * Resolve all parent chains in a hierarchy.
 *
 * @param hierarchy - The agent hierarchy
 * @returns Result containing all resolved chains or error
 */
export function resolveAllParentChains(
  hierarchy: AgentHierarchy
): AttributionResult<readonly ResolvedParentChain[]> {
  const chains: ResolvedParentChain[] = [];

  for (const node of hierarchy.nodes) {
    const result = resolveParentChain(hierarchy, node.agentId);
    if (!result.success) {
      return attributionFailure(result.error);
    }
    chains.push(result.value);
  }

  return attributionSuccess(Object.freeze(chains));
}

/**
 * Get all agents at a specific level.
 *
 * @param hierarchy - The agent hierarchy
 * @param level - Level to get agents for
 * @returns Agents at the specified level
 */
export function getAgentsAtLevel(
  hierarchy: AgentHierarchy,
  level: number
): readonly AgentHierarchyNode[] {
  return Object.freeze(
    hierarchy.nodes.filter((node) => node.level === level)
  );
}

/**
 * Get direct children of an agent.
 *
 * @param hierarchy - The agent hierarchy
 * @param parentAgentId - Parent agent ID
 * @returns Direct children of the agent
 */
export function getDirectChildren(
  hierarchy: AgentHierarchy,
  parentAgentId: GreyPartyId
): readonly AgentHierarchyNode[] {
  return Object.freeze(
    hierarchy.nodes.filter(
      (node) => node.parentAgentId === parentAgentId
    )
  );
}

/**
 * Get all descendants of an agent (including indirect).
 *
 * @param hierarchy - The agent hierarchy
 * @param agentId - Agent ID to get descendants for
 * @returns All descendants of the agent
 */
export function getAllDescendants(
  hierarchy: AgentHierarchy,
  agentId: GreyPartyId
): readonly AgentHierarchyNode[] {
  const descendants: AgentHierarchyNode[] = [];
  const queue: GreyPartyId[] = [agentId];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const currentIdStr = currentId as string;

    if (visited.has(currentIdStr)) {
      continue;
    }
    visited.add(currentIdStr);

    const children = getDirectChildren(hierarchy, currentId);
    for (const child of children) {
      descendants.push(child);
      queue.push(child.agentId);
    }
  }

  return Object.freeze(descendants);
}

/**
 * Get top-level agents (those with no parent).
 *
 * @param hierarchy - The agent hierarchy
 * @returns Top-level agents
 */
export function getTopLevelAgents(
  hierarchy: AgentHierarchy
): readonly AgentHierarchyNode[] {
  return Object.freeze(
    hierarchy.nodes.filter((node) => node.parentAgentId === null)
  );
}

// ============================================================================
// ATTRIBUTION CHAIN CALCULATION
// ============================================================================

/**
 * Attribution share for a single agent in a chain.
 */
export interface AgentAttributionShare {
  readonly agentId: GreyPartyId;
  readonly level: number;
  /** Share in basis points of the original amount */
  readonly shareBasisPoints: number;
  /** Effective share after parent deductions */
  readonly effectiveBasisPoints: number;
}

/**
 * Calculate attribution shares for an agent and all its ancestors.
 * Uses multiplicative share calculation (each level gets share of remaining).
 *
 * @param hierarchy - The agent hierarchy
 * @param leafAgentId - The leaf agent to calculate for
 * @param totalBasisPoints - Total basis points to distribute (usually 10000)
 * @returns Attribution shares for each agent in the chain
 */
export function calculateAgentChainShares(
  hierarchy: AgentHierarchy,
  leafAgentId: GreyPartyId,
  totalBasisPoints: number = BASIS_POINTS_100_PERCENT
): AttributionResult<readonly AgentAttributionShare[]> {
  // Resolve the chain first
  const chainResult = resolveParentChain(hierarchy, leafAgentId);
  if (!chainResult.success) {
    return attributionFailure(chainResult.error);
  }

  const chain = chainResult.value;
  const shares: AgentAttributionShare[] = [];

  // Build node map for lookup
  const nodeMap = new Map<string, AgentHierarchyNode>();
  for (const node of hierarchy.nodes) {
    nodeMap.set(node.agentId as string, node);
  }

  // Start with leaf agent
  const leafNode = nodeMap.get(leafAgentId as string)!;
  let remainingBasisPoints = totalBasisPoints;

  // Process from leaf up to root
  const allAgents = [leafAgentId, ...chain.parentChain];

  for (let i = 0; i < allAgents.length; i++) {
    const currentAgentId = allAgents[i];
    const node = nodeMap.get(currentAgentId as string)!;

    // Calculate this agent's share of the remaining
    const shareOfRemaining = Math.floor(
      (remainingBasisPoints * node.shareBasisPoints) / BASIS_POINTS_100_PERCENT
    );

    shares.push(
      Object.freeze({
        agentId: currentAgentId,
        level: node.level,
        shareBasisPoints: node.shareBasisPoints,
        effectiveBasisPoints: shareOfRemaining,
      })
    );

    // Deduct from remaining for next level
    remainingBasisPoints -= shareOfRemaining;
  }

  return attributionSuccess(Object.freeze(shares));
}

// ============================================================================
// HIERARCHY CHECKSUM
// ============================================================================

/**
 * Calculate a deterministic checksum for a hierarchy.
 *
 * @param hierarchy - The hierarchy to checksum
 * @returns Checksum string
 */
export function calculateHierarchyChecksum(
  hierarchy: AgentHierarchy
): string {
  // Sort nodes by agent ID for determinism
  const sortedNodes = [...hierarchy.nodes].sort((a, b) =>
    (a.agentId as string).localeCompare(b.agentId as string)
  );

  // Build checksum string
  const parts: string[] = [
    `hierarchy:${hierarchy.hierarchyId}`,
    `count:${hierarchy.agentCount}`,
    `maxLevel:${hierarchy.maxLevel}`,
  ];

  for (const node of sortedNodes) {
    parts.push(
      `node:${node.agentId}:${node.parentAgentId ?? 'null'}:${node.level}:${node.shareBasisPoints}`
    );
  }

  // Simple hash (deterministic)
  const str = parts.join('|');
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }

  return `hier_${Math.abs(hash).toString(16).padStart(8, '0')}`;
}

/**
 * Verify a hierarchy checksum.
 *
 * @param hierarchy - The hierarchy to verify
 * @param expectedChecksum - Expected checksum
 * @returns True if checksum matches
 */
export function verifyHierarchyChecksum(
  hierarchy: AgentHierarchy,
  expectedChecksum: string
): boolean {
  return calculateHierarchyChecksum(hierarchy) === expectedChecksum;
}
