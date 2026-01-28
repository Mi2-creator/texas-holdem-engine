/**
 * LedgerRecorder.ts
 * Phase 25 - Deterministic derivation of ledger entries
 *
 * This recorder derives ledger entries from:
 * - Settlement engine outputs
 * - Economy runtime results
 *
 * KEY INVARIANTS:
 * - MUST NOT perform calculations itself - only records
 * - All entries derive from authoritative state versions
 * - Deterministic: same inputs always produce same entries
 * - Idempotent: duplicate recordings are detected and rejected
 */

import { PlayerId } from '../security/Identity';
import { TableId, HandId } from '../security/AuditLog';
import { ClubId } from '../club/ClubTypes';
import { StateVersion } from '../sync/SyncTypes';

import {
  LedgerEntry,
  LedgerBatch,
  LedgerEntryInput,
  LedgerBatchId,
  AgentId,
  SettlementAttribution,
  TimeFeeAttribution,
  createPlayerParty,
  createClubParty,
  createAgentParty,
  createPlatformParty,
} from './LedgerTypes';
import { ValueLedger } from './LedgerEntry';

// ============================================================================
// Configuration
// ============================================================================

export interface RecorderConfig {
  readonly enableDuplicateDetection: boolean;
  readonly defaultPlatformId: string;
}

export const DEFAULT_RECORDER_CONFIG: RecorderConfig = {
  enableDuplicateDetection: true,
  defaultPlatformId: 'platform',
};

// ============================================================================
// Recorder Result Types
// ============================================================================

export interface RecordingResult {
  readonly success: boolean;
  readonly batch?: LedgerBatch;
  readonly entries?: readonly LedgerEntry[];
  readonly error?: string;
  readonly isDuplicate?: boolean;
}

// ============================================================================
// Ledger Recorder Implementation
// ============================================================================

/**
 * Records value attribution from settlement and economy outputs
 *
 * This class serves as the sole interface for creating ledger entries,
 * ensuring all entries are derived deterministically from authoritative sources.
 *
 * It does NOT perform any calculations - it only transforms and records
 * values that have already been computed by settlement/economy systems.
 */
export class LedgerRecorder {
  private readonly ledger: ValueLedger;
  private readonly config: RecorderConfig;
  private readonly recordedSettlements: Set<string>;  // handId for dedup
  private readonly recordedTimeFees: Set<string>;     // tableId:playerId:timestamp for dedup

  constructor(ledger: ValueLedger, config: RecorderConfig = DEFAULT_RECORDER_CONFIG) {
    this.ledger = ledger;
    this.config = config;
    this.recordedSettlements = new Set();
    this.recordedTimeFees = new Set();
  }

  // ==========================================================================
  // Settlement Recording
  // ==========================================================================

  /**
   * Record attribution from a hand settlement
   *
   * Takes the outputs from settlement engine and records:
   * - Pot winnings to players (PLAYER credit)
   * - Rake attribution to club/agent/platform
   * - Uncalled bet returns to players
   *
   * All values come directly from the settlement - no calculations performed here.
   */
  recordSettlement(attribution: SettlementAttribution): RecordingResult {
    // Check for duplicate
    const dedupeKey = `settlement:${attribution.handId}`;
    if (this.config.enableDuplicateDetection && this.recordedSettlements.has(dedupeKey)) {
      return {
        success: false,
        error: `Settlement already recorded for hand ${attribution.handId}`,
        isDuplicate: true,
      };
    }

    const inputs: LedgerEntryInput[] = [];

    // Record pot winnings to players
    for (const winner of attribution.potWinners) {
      inputs.push({
        source: 'HAND_SETTLEMENT',
        category: 'POT_WIN',
        affectedParty: createPlayerParty(winner.playerId),
        delta: winner.amount,  // Credit to player
        stateVersion: attribution.stateVersion,
        tableId: attribution.tableId,
        handId: attribution.handId,
        clubId: attribution.clubId,
        description: `Pot win (${winner.potType}): ${winner.amount}`,
        metadata: { potType: winner.potType },
      });
    }

    // Record uncalled bet returns
    if (attribution.uncalledReturns) {
      for (const returned of attribution.uncalledReturns) {
        inputs.push({
          source: 'HAND_SETTLEMENT',
          category: 'UNCALLED_RETURN',
          affectedParty: createPlayerParty(returned.playerId),
          delta: returned.amount,  // Credit to player
          stateVersion: attribution.stateVersion,
          tableId: attribution.tableId,
          handId: attribution.handId,
          clubId: attribution.clubId,
          description: `Uncalled bet returned: ${returned.amount}`,
        });
      }
    }

    // Record rake if collected
    if (attribution.rakeTotal > 0) {
      // Record total rake as credit (recorded on CLUB first, then broken down)
      inputs.push({
        source: 'HAND_SETTLEMENT',
        category: 'RAKE',
        affectedParty: createClubParty(attribution.clubId),
        delta: attribution.rakeTotal,  // Total rake credited to club initially
        stateVersion: attribution.stateVersion,
        tableId: attribution.tableId,
        handId: attribution.handId,
        clubId: attribution.clubId,
        description: `Total rake collected: ${attribution.rakeTotal}`,
      });

      // If breakdown provided, record the distribution
      if (attribution.rakeBreakdown) {
        const breakdown = attribution.rakeBreakdown;

        // Club's net share (debit from total, then credit club share)
        // This is recorded as the club keeping its portion
        if (breakdown.clubShare > 0 && breakdown.clubShare < attribution.rakeTotal) {
          // Club distributes to others, keeping clubShare
          // Agent commission
          if (breakdown.agentShare && breakdown.agentShare > 0 && breakdown.agentId) {
            inputs.push({
              source: 'HAND_SETTLEMENT',
              category: 'RAKE_SHARE_AGENT',
              affectedParty: createAgentParty(breakdown.agentId),
              delta: breakdown.agentShare,
              stateVersion: attribution.stateVersion,
              tableId: attribution.tableId,
              handId: attribution.handId,
              clubId: attribution.clubId,
              description: `Agent commission: ${breakdown.agentShare}`,
              metadata: { agentId: breakdown.agentId },
            });
          }

          // Platform share
          if (breakdown.platformShare > 0) {
            inputs.push({
              source: 'HAND_SETTLEMENT',
              category: 'RAKE_SHARE_PLATFORM',
              affectedParty: createPlatformParty(this.config.defaultPlatformId),
              delta: breakdown.platformShare,
              stateVersion: attribution.stateVersion,
              tableId: attribution.tableId,
              handId: attribution.handId,
              clubId: attribution.clubId,
              description: `Platform share: ${breakdown.platformShare}`,
            });
          }

          // Record club's final share explicitly
          inputs.push({
            source: 'HAND_SETTLEMENT',
            category: 'RAKE_SHARE_CLUB',
            affectedParty: createClubParty(attribution.clubId),
            delta: breakdown.clubShare,
            stateVersion: attribution.stateVersion,
            tableId: attribution.tableId,
            handId: attribution.handId,
            clubId: attribution.clubId,
            description: `Club rake share: ${breakdown.clubShare}`,
          });
        }
      }
    }

    // Create batch if we have entries
    if (inputs.length === 0) {
      return {
        success: false,
        error: 'No attribution entries to record',
      };
    }

    try {
      const { batch, entries } = this.ledger.appendBatch('HAND_SETTLEMENT', inputs);

      // Mark as recorded
      this.recordedSettlements.add(dedupeKey);

      return {
        success: true,
        batch,
        entries,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ==========================================================================
  // Time Fee Recording
  // ==========================================================================

  /**
   * Record attribution from time-based fees
   *
   * Records time fees charged to players and attributed to the club.
   * Values come from economy runtime - no calculations here.
   */
  recordTimeFee(attribution: TimeFeeAttribution): RecordingResult {
    // Check for duplicate (use a compound key with rounded timestamp)
    const timestampKey = Math.floor(Date.now() / 60000); // Per-minute dedup
    const dedupeKey = `timefee:${attribution.tableId}:${attribution.playerId}:${timestampKey}`;

    if (this.config.enableDuplicateDetection && this.recordedTimeFees.has(dedupeKey)) {
      return {
        success: false,
        error: 'Time fee already recorded for this period',
        isDuplicate: true,
      };
    }

    const inputs: LedgerEntryInput[] = [];

    // Record fee charged to player (debit)
    inputs.push({
      source: 'TIME_FEE',
      affectedParty: createPlayerParty(attribution.playerId),
      delta: -attribution.feeAmount,  // Debit from player
      stateVersion: attribution.stateVersion,
      tableId: attribution.tableId,
      clubId: attribution.clubId,
      description: `Time fee (${attribution.periodMinutes}min): ${attribution.feeAmount}`,
      metadata: { periodMinutes: attribution.periodMinutes },
    });

    // Record fee credited to club
    inputs.push({
      source: 'TIME_FEE',
      affectedParty: createClubParty(attribution.clubId),
      delta: attribution.feeAmount,  // Credit to club
      stateVersion: attribution.stateVersion,
      tableId: attribution.tableId,
      clubId: attribution.clubId,
      description: `Time fee revenue: ${attribution.feeAmount}`,
      metadata: { playerId: attribution.playerId, periodMinutes: attribution.periodMinutes },
    });

    try {
      const { batch, entries } = this.ledger.appendBatch('TIME_FEE', inputs);

      // Mark as recorded
      this.recordedTimeFees.add(dedupeKey);

      return {
        success: true,
        batch,
        entries,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ==========================================================================
  // Adjustment Recording
  // ==========================================================================

  /**
   * Record a manual adjustment with required justification
   *
   * Adjustments must have a clear reason and reference to why they're needed.
   * These are typically for corrections or exceptional circumstances.
   */
  recordAdjustment(params: {
    readonly stateVersion: StateVersion;
    readonly affectedPlayerId?: PlayerId;
    readonly affectedClubId?: ClubId;
    readonly affectedAgentId?: AgentId;
    readonly delta: number;
    readonly reason: string;
    readonly tableId?: TableId;
    readonly handId?: HandId;
    readonly adjustmentReference?: string;
  }): RecordingResult {
    // Determine affected party
    let affectedParty;
    if (params.affectedPlayerId) {
      affectedParty = createPlayerParty(params.affectedPlayerId);
    } else if (params.affectedClubId) {
      affectedParty = createClubParty(params.affectedClubId);
    } else if (params.affectedAgentId) {
      affectedParty = createAgentParty(params.affectedAgentId);
    } else {
      return {
        success: false,
        error: 'Adjustment must specify an affected party',
      };
    }

    if (!params.reason || params.reason.trim().length === 0) {
      return {
        success: false,
        error: 'Adjustment must have a reason',
      };
    }

    const input: LedgerEntryInput = {
      source: 'ADJUSTMENT',
      affectedParty,
      delta: params.delta,
      stateVersion: params.stateVersion,
      tableId: params.tableId,
      handId: params.handId,
      clubId: params.affectedClubId,
      description: `Adjustment: ${params.reason}`,
      metadata: {
        reason: params.reason,
        reference: params.adjustmentReference,
      },
    };

    try {
      const entry = this.ledger.appendEntry(input);
      return {
        success: true,
        entries: [entry],
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ==========================================================================
  // Bonus Recording
  // ==========================================================================

  /**
   * Record promotional bonus attribution
   */
  recordBonus(params: {
    readonly stateVersion: StateVersion;
    readonly playerId: PlayerId;
    readonly amount: number;
    readonly bonusType: string;
    readonly clubId?: ClubId;
    readonly tableId?: TableId;
  }): RecordingResult {
    const input: LedgerEntryInput = {
      source: 'BONUS',
      affectedParty: createPlayerParty(params.playerId),
      delta: params.amount,  // Credit to player
      stateVersion: params.stateVersion,
      tableId: params.tableId,
      clubId: params.clubId,
      description: `Bonus (${params.bonusType}): ${params.amount}`,
      metadata: { bonusType: params.bonusType },
    };

    try {
      const entry = this.ledger.appendEntry(input);
      return {
        success: true,
        entries: [entry],
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ==========================================================================
  // Query / Access
  // ==========================================================================

  /**
   * Get the underlying ledger (read-only access)
   */
  getLedger(): ValueLedger {
    return this.ledger;
  }

  /**
   * Check if a hand settlement has been recorded
   */
  isSettlementRecorded(handId: HandId): boolean {
    return this.recordedSettlements.has(`settlement:${handId}`);
  }

  /**
   * Get recording statistics
   */
  getStatistics(): {
    recordedSettlements: number;
    recordedTimeFees: number;
    ledgerStats: ReturnType<ValueLedger['getStatistics']>;
  } {
    return {
      recordedSettlements: this.recordedSettlements.size,
      recordedTimeFees: this.recordedTimeFees.size,
      ledgerStats: this.ledger.getStatistics(),
    };
  }

  /**
   * Clear all data (for testing only)
   */
  clear(): void {
    this.ledger.clear();
    this.recordedSettlements.clear();
    this.recordedTimeFees.clear();
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createLedgerRecorder(
  ledger: ValueLedger,
  config?: Partial<RecorderConfig>
): LedgerRecorder {
  return new LedgerRecorder(ledger, {
    ...DEFAULT_RECORDER_CONFIG,
    ...config,
  });
}
