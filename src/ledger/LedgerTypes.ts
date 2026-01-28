/**
 * LedgerTypes.ts
 * Phase 25 - Deterministic value ledger type definitions
 *
 * This module defines types for a value attribution ledger that:
 * - Records revenue attribution (not balance mutation)
 * - Is append-only and immutable after creation
 * - Derives entries deterministically from authoritative state
 * - Supports audit and revenue accounting
 *
 * Key distinction from economy/Ledger.ts:
 * - economy/Ledger.ts tracks chip movements and player balances
 * - This ledger tracks VALUE ATTRIBUTION to parties (player, club, agent, platform)
 */

import { PlayerId } from '../security/Identity';
import { TableId, HandId } from '../security/AuditLog';
import { ClubId } from '../club/ClubTypes';
import { StateVersion } from '../sync/SyncTypes';

// ============================================================================
// Branded Types for Type Safety
// ============================================================================

/**
 * Unique identifier for a ledger entry
 */
export type LedgerEntryId = string & { readonly __brand: 'LedgerEntryId' };

/**
 * Unique identifier for a batch of related ledger entries
 */
export type LedgerBatchId = string & { readonly __brand: 'LedgerBatchId' };

/**
 * Agent identifier for tracking agent-attributed value
 */
export type AgentId = string & { readonly __brand: 'AgentId' };

// ============================================================================
// ID Generation
// ============================================================================

let entryCounter = 0;
let batchCounter = 0;

export function generateLedgerEntryId(): LedgerEntryId {
  return `lent_${Date.now()}_${++entryCounter}` as LedgerEntryId;
}

export function generateLedgerBatchId(): LedgerBatchId {
  return `lbat_${Date.now()}_${++batchCounter}` as LedgerBatchId;
}

export function resetLedgerCounters(): void {
  entryCounter = 0;
  batchCounter = 0;
}

// ============================================================================
// Attribution Party Types
// ============================================================================

/**
 * Types of parties that can receive value attribution
 *
 * PLAYER - Player receiving pot winnings
 * CLUB - Club receiving rake/fees
 * AGENT - Referral agent receiving commission
 * PLATFORM - Platform receiving its share
 */
export type AttributionPartyType = 'PLAYER' | 'CLUB' | 'AGENT' | 'PLATFORM';

/**
 * Identifies a party receiving value attribution
 */
export interface AttributionParty {
  readonly partyType: AttributionPartyType;
  readonly playerId?: PlayerId;      // Set when partyType is PLAYER
  readonly clubId?: ClubId;          // Set when partyType is CLUB
  readonly agentId?: AgentId;        // Set when partyType is AGENT
  readonly platformId?: string;      // Set when partyType is PLATFORM
}

// ============================================================================
// Attribution Source Types
// ============================================================================

/**
 * Sources of value attribution
 *
 * HAND_SETTLEMENT - Value from hand settlement (pot winnings, rake)
 * TIME_FEE - Time-based fees (seat time charges)
 * TOURNAMENT_PAYOUT - Tournament prize payouts
 * REBUY - Tournament rebuy revenue
 * ADJUSTMENT - Manual adjustment (with reason required)
 * BONUS - Promotional bonus attribution
 * TOP_UP - External chip addition to player (not revenue)
 */
export type AttributionSource =
  | 'HAND_SETTLEMENT'
  | 'TIME_FEE'
  | 'TOURNAMENT_PAYOUT'
  | 'REBUY'
  | 'ADJUSTMENT'
  | 'BONUS'
  | 'TOP_UP';

/**
 * Sub-categories for hand settlement attribution
 */
export type HandSettlementCategory =
  | 'POT_WIN'           // Main/side pot winnings
  | 'RAKE'              // Rake collected
  | 'RAKE_SHARE_CLUB'   // Club's share of rake
  | 'RAKE_SHARE_AGENT'  // Agent's share of rake
  | 'RAKE_SHARE_PLATFORM' // Platform's share of rake
  | 'UNCALLED_RETURN';  // Uncalled bet returned

// ============================================================================
// Ledger Entry Types
// ============================================================================

/**
 * Immutable ledger entry recording value attribution
 *
 * INVARIANTS:
 * - All fields are readonly (immutable after creation)
 * - delta is a signed integer (positive for credit, negative for debit)
 * - stateVersion links to authoritative game state
 * - checksum ensures tamper detection
 */
export interface LedgerEntry {
  /** Unique entry identifier */
  readonly entryId: LedgerEntryId;

  /** Sequence number within the ledger */
  readonly sequence: number;

  /** Unix timestamp of entry creation */
  readonly timestamp: number;

  /** Source of this attribution */
  readonly source: AttributionSource;

  /** Sub-category (for HAND_SETTLEMENT source) */
  readonly category?: HandSettlementCategory;

  /** Party receiving/losing this attribution */
  readonly affectedParty: AttributionParty;

  /** Signed delta (positive = credit, negative = debit) - unit-agnostic integer */
  readonly delta: number;

  /** Reference to authoritative state version */
  readonly stateVersion: StateVersion;

  /** Table where attribution occurred */
  readonly tableId?: TableId;

  /** Hand associated with this attribution */
  readonly handId?: HandId;

  /** Club context for this attribution */
  readonly clubId?: ClubId;

  /** Batch this entry belongs to (for atomic multi-party attribution) */
  readonly batchId?: LedgerBatchId;

  /** Human-readable description */
  readonly description: string;

  /** Additional structured metadata */
  readonly metadata?: Readonly<Record<string, unknown>>;

  /** Hash of previous entry in chain (for integrity verification) */
  readonly previousHash: string;

  /** Hash of this entry (for tamper detection) */
  readonly checksum: string;
}

/**
 * A batch of related ledger entries (e.g., all attributions from one hand settlement)
 *
 * Batches ensure that multi-party attributions are recorded atomically
 * and can be verified together.
 */
export interface LedgerBatch {
  /** Unique batch identifier */
  readonly batchId: LedgerBatchId;

  /** Timestamp of batch creation */
  readonly timestamp: number;

  /** Source of all entries in this batch */
  readonly source: AttributionSource;

  /** State version this batch derives from */
  readonly stateVersion: StateVersion;

  /** Associated table */
  readonly tableId?: TableId;

  /** Associated hand */
  readonly handId?: HandId;

  /** Associated club */
  readonly clubId?: ClubId;

  /** Entry IDs in this batch */
  readonly entryIds: readonly LedgerEntryId[];

  /** Sum of all deltas (should be zero for settlement batches) */
  readonly netDelta: number;

  /** Batch-level checksum */
  readonly checksum: string;
}

// ============================================================================
// Input Types for Recording
// ============================================================================

/**
 * Input for creating a ledger entry (without computed fields)
 */
export interface LedgerEntryInput {
  readonly source: AttributionSource;
  readonly category?: HandSettlementCategory;
  readonly affectedParty: AttributionParty;
  readonly delta: number;
  readonly stateVersion: StateVersion;
  readonly tableId?: TableId;
  readonly handId?: HandId;
  readonly clubId?: ClubId;
  readonly batchId?: LedgerBatchId;
  readonly description: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Settlement data used to derive ledger entries
 */
export interface SettlementAttribution {
  readonly handId: HandId;
  readonly tableId: TableId;
  readonly clubId: ClubId;
  readonly stateVersion: StateVersion;
  readonly potWinners: readonly {
    readonly playerId: PlayerId;
    readonly amount: number;
    readonly potType: string;
  }[];
  readonly rakeTotal: number;
  readonly rakeBreakdown?: {
    readonly clubShare: number;
    readonly agentShare?: number;
    readonly agentId?: AgentId;
    readonly platformShare: number;
  };
  readonly uncalledReturns?: readonly {
    readonly playerId: PlayerId;
    readonly amount: number;
  }[];
}

/**
 * Time fee data used to derive ledger entries
 */
export interface TimeFeeAttribution {
  readonly tableId: TableId;
  readonly clubId: ClubId;
  readonly stateVersion: StateVersion;
  readonly playerId: PlayerId;
  readonly feeAmount: number;
  readonly periodMinutes: number;
}

// ============================================================================
// Query Types
// ============================================================================

/**
 * Query parameters for ledger entries
 */
export interface LedgerQuery {
  readonly partyType?: AttributionPartyType;
  readonly playerId?: PlayerId;
  readonly clubId?: ClubId;
  readonly agentId?: AgentId;
  readonly tableId?: TableId;
  readonly handId?: HandId;
  readonly source?: AttributionSource;
  readonly category?: HandSettlementCategory;
  readonly fromTimestamp?: number;
  readonly toTimestamp?: number;
  readonly fromSequence?: number;
  readonly toSequence?: number;
  readonly batchId?: LedgerBatchId;
  readonly limit?: number;
  readonly offset?: number;
}

/**
 * Aggregated view of attributions
 */
export interface AttributionSummary {
  readonly partyType: AttributionPartyType;
  readonly partyId: string;  // playerId, clubId, agentId, or platformId
  readonly totalCredit: number;
  readonly totalDebit: number;
  readonly netAttribution: number;
  readonly entryCount: number;
  readonly fromTimestamp: number;
  readonly toTimestamp: number;
}

/**
 * Table-level attribution summary
 */
export interface TableAttributionSummary {
  readonly tableId: TableId;
  readonly clubId: ClubId;
  readonly handCount: number;
  readonly totalPotWinnings: number;
  readonly totalRake: number;
  readonly rakeByParty: ReadonlyMap<string, number>;
  readonly fromTimestamp: number;
  readonly toTimestamp: number;
}

/**
 * Club-level attribution summary
 */
export interface ClubAttributionSummary {
  readonly clubId: ClubId;
  readonly tableCount: number;
  readonly handCount: number;
  readonly totalRakeCollected: number;
  readonly totalTimeFees: number;
  readonly agentCommissions: ReadonlyMap<AgentId, number>;
  readonly platformShare: number;
  readonly netClubRevenue: number;
  readonly fromTimestamp: number;
  readonly toTimestamp: number;
}

// ============================================================================
// Verification Types
// ============================================================================

/**
 * Result of integrity verification
 */
export interface LedgerIntegrityResult {
  readonly isValid: boolean;
  readonly totalEntries: number;
  readonly verifiedEntries: number;
  readonly brokenAtSequence?: number;
  readonly expectedHash?: string;
  readonly actualHash?: string;
  readonly errors: readonly string[];
}

/**
 * Result of batch verification
 */
export interface BatchVerificationResult {
  readonly batchId: LedgerBatchId;
  readonly isValid: boolean;
  readonly entryCount: number;
  readonly netDelta: number;
  readonly errors: readonly string[];
}

// ============================================================================
// Checksum Utilities
// ============================================================================

/**
 * Calculate checksum for a ledger entry
 */
export function calculateEntryChecksum(
  entry: Omit<LedgerEntry, 'checksum'>
): string {
  const data = JSON.stringify({
    entryId: entry.entryId,
    sequence: entry.sequence,
    timestamp: entry.timestamp,
    source: entry.source,
    category: entry.category,
    affectedParty: entry.affectedParty,
    delta: entry.delta,
    stateVersion: entry.stateVersion,
    tableId: entry.tableId,
    handId: entry.handId,
    clubId: entry.clubId,
    batchId: entry.batchId,
    description: entry.description,
    previousHash: entry.previousHash,
  });

  return simpleHash(data);
}

/**
 * Calculate checksum for a batch
 */
export function calculateBatchChecksum(
  batch: Omit<LedgerBatch, 'checksum'>
): string {
  const data = JSON.stringify({
    batchId: batch.batchId,
    timestamp: batch.timestamp,
    source: batch.source,
    stateVersion: batch.stateVersion,
    tableId: batch.tableId,
    handId: batch.handId,
    clubId: batch.clubId,
    entryIds: batch.entryIds,
    netDelta: batch.netDelta,
  });

  return simpleHash(data);
}

/**
 * Verify entry checksum
 */
export function verifyEntryChecksum(entry: LedgerEntry): boolean {
  const expected = calculateEntryChecksum(entry);
  return entry.checksum === expected;
}

/**
 * Verify batch checksum
 */
export function verifyBatchChecksum(batch: LedgerBatch): boolean {
  const expected = calculateBatchChecksum(batch);
  return batch.checksum === expected;
}

/**
 * Simple hash function for checksums
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

// ============================================================================
// Factory Helpers
// ============================================================================

/**
 * Create an attribution party for a player
 */
export function createPlayerParty(playerId: PlayerId): AttributionParty {
  return { partyType: 'PLAYER', playerId };
}

/**
 * Create an attribution party for a club
 */
export function createClubParty(clubId: ClubId): AttributionParty {
  return { partyType: 'CLUB', clubId };
}

/**
 * Create an attribution party for an agent
 */
export function createAgentParty(agentId: AgentId): AttributionParty {
  return { partyType: 'AGENT', agentId };
}

/**
 * Create an attribution party for the platform
 */
export function createPlatformParty(platformId: string = 'platform'): AttributionParty {
  return { partyType: 'PLATFORM', platformId };
}
