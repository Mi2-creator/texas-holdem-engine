/**
 * RuntimeTypes.ts
 * Phase 20 - Types for the Economy Runtime layer
 *
 * Defines types for:
 * - Atomic transactions with rollback support
 * - Settlement operations with rake integration
 * - Persistence and recovery
 * - Financial safety invariants
 */

import { PlayerId } from '../../security/Identity';
import { TableId, HandId } from '../../security/AuditLog';
import { Street } from '../../game/engine/TableState';
import { PlayerBalance } from '../Balance';
import { TableEscrow } from '../Escrow';
import { RakeEvaluation } from '../config/RakePolicy';

// ============================================================================
// Transaction Types
// ============================================================================

export type TransactionId = string;
export type OperationId = string;

export type TransactionStatus = 'pending' | 'committed' | 'rolled_back' | 'failed';

export interface TransactionOperation {
  readonly operationId: OperationId;
  readonly type: OperationType;
  readonly playerId: PlayerId;
  readonly tableId?: TableId;
  readonly handId?: HandId;
  readonly amount: number;
  readonly timestamp: number;
  readonly metadata?: Record<string, unknown>;
}

export type OperationType =
  | 'lock_chips'
  | 'unlock_chips'
  | 'commit_to_pot'
  | 'award_pot'
  | 'collect_rake'
  | 'buy_in'
  | 'cash_out'
  | 'blind_post'
  | 'bet'
  | 'call'
  | 'raise'
  | 'all_in';

export interface Transaction {
  readonly transactionId: TransactionId;
  readonly handId?: HandId;
  readonly tableId?: TableId;
  readonly operations: readonly TransactionOperation[];
  readonly status: TransactionStatus;
  readonly createdAt: number;
  readonly committedAt?: number;
  readonly rolledBackAt?: number;
  readonly error?: string;
}

export interface TransactionResult {
  readonly success: boolean;
  readonly transactionId: TransactionId;
  readonly error?: string;
  readonly rollbackPerformed?: boolean;
}

// ============================================================================
// Settlement Types
// ============================================================================

export interface SettlementRequest {
  readonly handId: HandId;
  readonly tableId: TableId;
  readonly playerStates: readonly PlayerSettlementState[];
  readonly winnerRankings: ReadonlyMap<PlayerId, number>;
  readonly finalStreet: Street;
  readonly flopSeen: boolean;
  readonly isUncontested: boolean;
  readonly playersInHand: number;
  readonly playersAtShowdown: number;
}

export interface PlayerSettlementState {
  readonly playerId: PlayerId;
  readonly totalBet: number;
  readonly isAllIn: boolean;
  readonly isFolded: boolean;
  readonly stackBefore: number;
}

export interface SettlementOutcome {
  readonly settlementId: string;
  readonly handId: HandId;
  readonly tableId: TableId;
  readonly totalPot: number;
  readonly potAfterRake: number;
  readonly rakeCollected: number;
  readonly rakeEvaluation: RakeEvaluation;
  readonly playerPayouts: ReadonlyMap<PlayerId, number>;
  readonly sidePots: readonly SidePotOutcome[];
  readonly finalStacks: ReadonlyMap<PlayerId, number>;
  readonly timestamp: number;
  readonly transactionId: TransactionId;
}

export interface SidePotOutcome {
  readonly potId: string;
  readonly amount: number;
  readonly eligiblePlayers: readonly PlayerId[];
  readonly winners: readonly PlayerId[];
  readonly amountPerWinner: number;
  readonly remainder: number;
}

// ============================================================================
// Persistence Types
// ============================================================================

export interface EconomySnapshot {
  readonly snapshotId: string;
  readonly version: number;
  readonly timestamp: number;
  readonly balances: ReadonlyMap<PlayerId, PlayerBalanceSnapshot>;
  readonly escrows: ReadonlyMap<string, EscrowSnapshot>; // key: tableId:playerId
  readonly activeHands: ReadonlyMap<HandId, HandEconomyState>;
  readonly pendingTransactions: readonly Transaction[];
  readonly settlementHistory: readonly SettlementRecord[];
  readonly checksum: string;
}

export interface PlayerBalanceSnapshot {
  readonly playerId: PlayerId;
  readonly available: number;
  readonly locked: number;
  readonly pending: number;
  readonly lastUpdated: number;
}

export interface EscrowSnapshot {
  readonly playerId: PlayerId;
  readonly tableId: TableId;
  readonly stack: number;
  readonly committed: number;
  readonly totalBuyIn: number;
  readonly totalCashOut: number;
}

export interface HandEconomyState {
  readonly handId: HandId;
  readonly tableId: TableId;
  readonly potTotal: number;
  readonly contributions: ReadonlyMap<PlayerId, number>;
  readonly isSettled: boolean;
  readonly settlementId?: string;
}

export interface SettlementRecord {
  readonly settlementId: string;
  readonly handId: HandId;
  readonly tableId: TableId;
  readonly timestamp: number;
  readonly totalPot: number;
  readonly rakeCollected: number;
  readonly playerPayouts: ReadonlyMap<PlayerId, number>;
  readonly idempotencyKey: string;
}

// ============================================================================
// Recovery Types
// ============================================================================

export interface EconomyRecoveryResult {
  readonly success: boolean;
  readonly balancesRecovered: number;
  readonly escrowsRecovered: number;
  readonly pendingTransactionsRolledBack: number;
  readonly errors: readonly string[];
  readonly duration: number;
}

export interface IdempotencyCheck {
  readonly isProcessed: boolean;
  readonly existingResult?: SettlementOutcome;
}

// ============================================================================
// Invariant Types
// ============================================================================

export interface FinancialInvariant {
  readonly name: string;
  readonly check: () => InvariantResult;
}

export interface InvariantResult {
  readonly valid: boolean;
  readonly invariant: string;
  readonly details?: string;
  readonly expected?: number;
  readonly actual?: number;
}

export interface InvariantViolation {
  readonly invariant: string;
  readonly details: string;
  readonly timestamp: number;
  readonly context: Record<string, unknown>;
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface EconomyRuntimeConfig {
  readonly enableTransactionLogging: boolean;
  readonly enableInvariantChecks: boolean;
  readonly maxPendingTransactions: number;
  readonly transactionTimeoutMs: number;
  readonly enablePersistence: boolean;
  readonly persistenceIntervalMs: number;
  readonly idempotencyWindowMs: number;
}

export const DEFAULT_RUNTIME_CONFIG: EconomyRuntimeConfig = {
  enableTransactionLogging: true,
  enableInvariantChecks: true,
  maxPendingTransactions: 100,
  transactionTimeoutMs: 30000,
  enablePersistence: true,
  persistenceIntervalMs: 5000,
  idempotencyWindowMs: 3600000, // 1 hour
};

// ============================================================================
// Event Types
// ============================================================================

export type EconomyEventType =
  | 'transaction_started'
  | 'transaction_committed'
  | 'transaction_rolled_back'
  | 'settlement_started'
  | 'settlement_completed'
  | 'rake_collected'
  | 'invariant_violation'
  | 'recovery_started'
  | 'recovery_completed';

export interface EconomyEvent {
  readonly type: EconomyEventType;
  readonly timestamp: number;
  readonly data: Record<string, unknown>;
}

// ============================================================================
// Utility Functions
// ============================================================================

let transactionCounter = 0;
let operationCounter = 0;

export function generateTransactionId(): TransactionId {
  return `txn_${Date.now()}_${++transactionCounter}_${Math.random().toString(36).substring(2, 8)}`;
}

export function generateOperationId(): OperationId {
  return `op_${Date.now()}_${++operationCounter}`;
}

export function generateSettlementId(handId: HandId): string {
  return `settle_${handId}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

export function generateIdempotencyKey(handId: HandId, tableId: TableId): string {
  return `idem_${tableId}_${handId}`;
}

export function resetRuntimeCounters(): void {
  transactionCounter = 0;
  operationCounter = 0;
}
