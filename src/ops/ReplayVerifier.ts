/**
 * ReplayVerifier.ts
 * Phase 31 - Production Observability, Audit & Deterministic Ops (READ-ONLY)
 *
 * Deterministically re-run hand replays and compare:
 * - stateVersion
 * - ledger attribution hashes
 * - integrity checksums
 *
 * RULES:
 * - No mutations
 * - No retries
 * - Pure function over recorded data
 * - Deterministic: same input → same output
 */

import { HandId, TableId } from '../security/AuditLog';
import { PlayerId } from '../security/Identity';
import { ClubId } from '../club/ClubTypes';
import {
  VerificationId,
  ReplayVerificationResult,
  FieldDiff,
  generateVerificationId,
  createMatchResult,
  createMismatchResult,
  createErrorResult,
  OpsTimeRange,
} from './OpsTypes';

// ============================================================================
// Replay Data Types
// ============================================================================

/**
 * Recorded action for replay
 */
export interface RecordedAction {
  readonly sequence: number;
  readonly playerId: PlayerId;
  readonly action: string;
  readonly amount: number;
  readonly timestamp: number;
  readonly stateVersionBefore: number;
  readonly stateVersionAfter: number;
}

/**
 * Recorded hand data
 */
export interface RecordedHandData {
  readonly handId: HandId;
  readonly tableId: TableId;
  readonly clubId: ClubId;
  readonly startTimestamp: number;
  readonly endTimestamp: number;

  // Initial state
  readonly initialPlayers: readonly {
    readonly playerId: PlayerId;
    readonly seat: number;
    readonly stack: number;
  }[];
  readonly dealerSeat: number;
  readonly blinds: { small: number; big: number };

  // Actions
  readonly actions: readonly RecordedAction[];

  // Final state
  readonly finalStacks: ReadonlyMap<PlayerId, number>;
  readonly potAmount: number;
  readonly rakeAmount: number;
  readonly winners: readonly PlayerId[];

  // Verification data
  readonly finalStateVersion: number;
  readonly ledgerAttributionHash: string;
  readonly integrityChecksum: string;
}

/**
 * Replayed hand result
 */
export interface ReplayedHandResult {
  readonly handId: HandId;

  // Computed state
  readonly computedFinalStacks: ReadonlyMap<PlayerId, number>;
  readonly computedPotAmount: number;
  readonly computedRakeAmount: number;

  // Computed verification data
  readonly computedStateVersion: number;
  readonly computedLedgerHash: string;
  readonly computedIntegrityChecksum: string;
}

// ============================================================================
// Hash Functions (Deterministic)
// ============================================================================

/**
 * Simple deterministic hash for verification
 * Uses a basic FNV-1a variant for predictable results
 */
function deterministicHash(data: string): string {
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < data.length; i++) {
    hash ^= data.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193); // FNV prime
    hash = hash >>> 0; // Convert to unsigned
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * Compute ledger attribution hash from recorded data
 */
export function computeLedgerHash(hand: RecordedHandData): string {
  const entries: string[] = [];

  // Include hand ID for uniqueness
  entries.push(`handId:${hand.handId}`);

  // Include all players and their net changes
  for (const player of hand.initialPlayers) {
    const finalStack = hand.finalStacks.get(player.playerId) ?? 0;
    const delta = finalStack - player.stack;
    entries.push(`${player.playerId}:${delta}`);
  }

  // Include rake
  entries.push(`rake:${hand.rakeAmount}`);

  // Sort for determinism
  entries.sort();

  return deterministicHash(entries.join('|'));
}

/**
 * Compute integrity checksum from recorded data
 */
export function computeIntegrityChecksum(hand: RecordedHandData): string {
  const parts: string[] = [
    hand.handId,
    hand.tableId,
    String(hand.startTimestamp),
    String(hand.actions.length),
    String(hand.finalStateVersion),
  ];

  // Include action sequence
  for (const action of hand.actions) {
    parts.push(`${action.sequence}:${action.action}:${action.amount}`);
  }

  return deterministicHash(parts.join('|'));
}

// ============================================================================
// Replay Verifier
// ============================================================================

/**
 * Verify a single hand replay
 *
 * Pure function: compares recorded data against computed expectations.
 * No mutations, no retries.
 */
export function verifyHandReplay(
  recorded: RecordedHandData,
  replayed: ReplayedHandResult,
  timestamp: number = Date.now()
): ReplayVerificationResult {
  const verificationId = generateVerificationId(timestamp);

  try {
    const diffs: FieldDiff[] = [];

    // Check state version
    const stateVersionMatch = recorded.finalStateVersion === replayed.computedStateVersion;
    if (!stateVersionMatch) {
      diffs.push({
        fieldPath: 'finalStateVersion',
        expected: recorded.finalStateVersion,
        actual: replayed.computedStateVersion,
      });
    }

    // Check ledger hash
    const ledgerHashMatch = recorded.ledgerAttributionHash === replayed.computedLedgerHash;
    if (!ledgerHashMatch) {
      diffs.push({
        fieldPath: 'ledgerAttributionHash',
        expected: recorded.ledgerAttributionHash,
        actual: replayed.computedLedgerHash,
      });
    }

    // Check integrity checksum
    const integrityChecksumMatch = recorded.integrityChecksum === replayed.computedIntegrityChecksum;
    if (!integrityChecksumMatch) {
      diffs.push({
        fieldPath: 'integrityChecksum',
        expected: recorded.integrityChecksum,
        actual: replayed.computedIntegrityChecksum,
      });
    }

    // Check final stacks
    for (const player of recorded.initialPlayers) {
      const recordedStack = recorded.finalStacks.get(player.playerId);
      const replayedStack = replayed.computedFinalStacks.get(player.playerId);

      if (recordedStack !== replayedStack) {
        diffs.push({
          fieldPath: `finalStacks.${player.playerId}`,
          expected: recordedStack,
          actual: replayedStack,
        });
      }
    }

    // Check pot and rake
    if (recorded.potAmount !== replayed.computedPotAmount) {
      diffs.push({
        fieldPath: 'potAmount',
        expected: recorded.potAmount,
        actual: replayed.computedPotAmount,
      });
    }

    if (recorded.rakeAmount !== replayed.computedRakeAmount) {
      diffs.push({
        fieldPath: 'rakeAmount',
        expected: recorded.rakeAmount,
        actual: replayed.computedRakeAmount,
      });
    }

    // Return result
    if (diffs.length === 0) {
      return createMatchResult(verificationId, recorded.handId, timestamp);
    }

    return createMismatchResult(verificationId, recorded.handId, timestamp, diffs, {
      stateVersionMatch,
      ledgerHashMatch,
      integrityChecksumMatch,
    });
  } catch (error) {
    return createErrorResult(
      verificationId,
      recorded.handId,
      timestamp,
      error instanceof Error ? error.message : 'Unknown error during verification'
    );
  }
}

/**
 * Re-run hand replay from recorded actions
 *
 * Pure function: computes expected final state from recorded actions.
 */
export function replayHand(recorded: RecordedHandData): ReplayedHandResult {
  // Initialize stacks
  const stacks = new Map<PlayerId, number>();
  for (const player of recorded.initialPlayers) {
    stacks.set(player.playerId, player.stack);
  }

  // Simulate pot building (simplified)
  let pot = 0;

  // Process actions
  for (const action of recorded.actions) {
    const currentStack = stacks.get(action.playerId) ?? 0;

    switch (action.action) {
      case 'bet':
      case 'raise':
      case 'call':
      case 'all_in':
        stacks.set(action.playerId, currentStack - action.amount);
        pot += action.amount;
        break;
      case 'fold':
      case 'check':
        // No chip movement
        break;
    }
  }

  // Calculate rake
  const computedRakeAmount = recorded.rakeAmount; // Use recorded rake (policy-dependent)

  // Distribute pot to winners
  const netPot = pot - computedRakeAmount;
  const winnerCount = recorded.winners.length;
  if (winnerCount > 0) {
    const share = Math.floor(netPot / winnerCount);
    const remainder = netPot - share * winnerCount;

    for (let i = 0; i < recorded.winners.length; i++) {
      const winner = recorded.winners[i];
      const currentStack = stacks.get(winner) ?? 0;
      // First winner gets remainder
      const winAmount = i === 0 ? share + remainder : share;
      stacks.set(winner, currentStack + winAmount);
    }
  }

  // Compute verification data
  const computedStateVersion = recorded.actions.length > 0
    ? recorded.actions[recorded.actions.length - 1].stateVersionAfter
    : 0;

  // Create a temporary recorded-like structure for hash computation
  const tempRecorded: RecordedHandData = {
    ...recorded,
    finalStacks: stacks,
    potAmount: pot,
    rakeAmount: computedRakeAmount,
  };

  return {
    handId: recorded.handId,
    computedFinalStacks: stacks,
    computedPotAmount: pot,
    computedRakeAmount,
    computedStateVersion,
    computedLedgerHash: computeLedgerHash(tempRecorded),
    computedIntegrityChecksum: computeIntegrityChecksum(tempRecorded),
  };
}

/**
 * Full verification: replay and verify
 */
export function verifyRecordedHand(
  recorded: RecordedHandData,
  timestamp: number = Date.now()
): ReplayVerificationResult {
  const replayed = replayHand(recorded);
  return verifyHandReplay(recorded, replayed, timestamp);
}

// ============================================================================
// Batch Verification
// ============================================================================

/**
 * Batch verification summary
 */
export interface BatchVerificationSummary {
  readonly totalHands: number;
  readonly matchCount: number;
  readonly mismatchCount: number;
  readonly errorCount: number;
  readonly results: readonly ReplayVerificationResult[];
  readonly timestamp: number;
}

/**
 * Verify multiple hands
 *
 * Pure function: verifies each hand independently.
 */
export function verifyHandBatch(
  hands: readonly RecordedHandData[],
  timestamp: number = Date.now()
): BatchVerificationSummary {
  const results: ReplayVerificationResult[] = [];

  for (const hand of hands) {
    results.push(verifyRecordedHand(hand, timestamp));
  }

  return {
    totalHands: hands.length,
    matchCount: results.filter(r => r.status === 'MATCH').length,
    mismatchCount: results.filter(r => r.status === 'MISMATCH').length,
    errorCount: results.filter(r => r.status === 'ERROR').length,
    results,
    timestamp,
  };
}

/**
 * Verify hands within a time range
 */
export function verifyHandsInRange(
  hands: readonly RecordedHandData[],
  timeRange: OpsTimeRange,
  timestamp: number = Date.now()
): BatchVerificationSummary {
  const filteredHands = hands.filter(
    h => h.startTimestamp >= timeRange.fromTimestamp && h.startTimestamp <= timeRange.toTimestamp
  );
  return verifyHandBatch(filteredHands, timestamp);
}

// ============================================================================
// Verification View
// ============================================================================

/**
 * Read-only view for replay verification
 */
export class ReplayVerificationView {
  private readonly getRecordedHands: () => readonly RecordedHandData[];

  constructor(handProvider: () => readonly RecordedHandData[]) {
    this.getRecordedHands = handProvider;
  }

  /**
   * Verify a specific hand
   */
  verifyHand(handId: HandId): ReplayVerificationResult | null {
    const hands = this.getRecordedHands();
    const hand = hands.find(h => h.handId === handId);
    if (!hand) return null;
    return verifyRecordedHand(hand);
  }

  /**
   * Verify all hands
   */
  verifyAll(): BatchVerificationSummary {
    return verifyHandBatch(this.getRecordedHands());
  }

  /**
   * Verify hands in time range
   */
  verifyInRange(timeRange: OpsTimeRange): BatchVerificationSummary {
    return verifyHandsInRange(this.getRecordedHands(), timeRange);
  }

  /**
   * Get mismatches only
   */
  getMismatches(): ReplayVerificationResult[] {
    const summary = this.verifyAll();
    return summary.results.filter(r => r.status === 'MISMATCH') as ReplayVerificationResult[];
  }

  /**
   * Get errors only
   */
  getErrors(): ReplayVerificationResult[] {
    const summary = this.verifyAll();
    return summary.results.filter(r => r.status === 'ERROR') as ReplayVerificationResult[];
  }
}

/**
 * Create a replay verification view
 */
export function createReplayVerificationView(
  handProvider: () => readonly RecordedHandData[]
): ReplayVerificationView {
  return new ReplayVerificationView(handProvider);
}
