/**
 * EconomyRuntime.test.ts
 * Phase 20 - Comprehensive tests for economy runtime
 *
 * Tests cover:
 * - Transaction management with rollback
 * - Settlement with side pots and rake
 * - All-in scenarios
 * - Rounding and odd chip distribution
 * - Persistence and idempotent recovery
 * - Financial invariants
 */

import { PlayerId } from '../../../security/Identity';
import { TableId, HandId } from '../../../security/AuditLog';
import { Street } from '../../../game/engine/TableState';
import {
  BalanceManager,
  resetBalanceManager,
} from '../../Balance';
import {
  EscrowManager,
  resetEscrowManager,
} from '../../Escrow';
import {
  PotManager,
  resetPotManager,
} from '../../Pot';
import {
  LedgerManager,
  resetLedgerManager,
} from '../../Ledger';
import {
  EconomyConfig,
  DEFAULT_ECONOMY_CONFIG,
  EconomyConfigBuilder,
} from '../../config/EconomyConfig';
import {
  EconomyRuntime,
  createEconomyRuntime,
  resetEconomyRuntime,
  TransactionManager,
  createTransactionManager,
  SettlementEngine,
  createSettlementEngine,
  EconomyPersistence,
  createEconomyPersistence,
  SettlementRequest,
  PlayerSettlementState,
  resetRuntimeCounters,
} from '../index';

// ============================================================================
// Test Utilities
// ============================================================================

const TABLE_ID = 'test-table-001' as TableId;
const HAND_ID = 'test-hand-001' as HandId;
const PLAYER_1 = 'player-001' as PlayerId;
const PLAYER_2 = 'player-002' as PlayerId;
const PLAYER_3 = 'player-003' as PlayerId;
const PLAYER_4 = 'player-004' as PlayerId;

function createTestRuntime(): EconomyRuntime {
  return createEconomyRuntime({
    balanceManager: resetBalanceManager(),
    escrowManager: resetEscrowManager(),
    potManager: resetPotManager(),
    ledgerManager: resetLedgerManager(),
  });
}

function setupPlayersAtTable(
  runtime: EconomyRuntime,
  players: { id: PlayerId; balance: number; buyIn: number }[]
): void {
  for (const player of players) {
    runtime.initializePlayer(player.id, player.balance);
    runtime.buyIn(TABLE_ID, player.id, player.buyIn);
  }
}

// ============================================================================
// TransactionManager Tests
// ============================================================================

describe('TransactionManager', () => {
  let balanceManager: BalanceManager;
  let escrowManager: EscrowManager;
  let transactionManager: TransactionManager;

  beforeEach(() => {
    resetRuntimeCounters();
    balanceManager = resetBalanceManager();
    escrowManager = resetEscrowManager();
    transactionManager = createTransactionManager(balanceManager, escrowManager);

    // Setup initial state
    balanceManager.createBalance(PLAYER_1, 1000);
    balanceManager.createBalance(PLAYER_2, 1000);
  });

  describe('Basic Transactions', () => {
    it('should execute simple lock/unlock transaction', () => {
      const transaction = transactionManager.beginTransaction();
      transaction.lockChips(PLAYER_1, 100);

      const result = transaction.commit();

      expect(result.success).toBe(true);
      expect(balanceManager.getBalance(PLAYER_1).available).toBe(900);
      expect(balanceManager.getBalance(PLAYER_1).locked).toBe(100);
    });

    it('should rollback on failure', () => {
      // First lock some chips
      balanceManager.lock(PLAYER_1, 500);

      const transaction = transactionManager.beginTransaction();
      transaction.lockChips(PLAYER_1, 100);
      // This should fail - trying to lock more than available
      transaction.lockChips(PLAYER_1, 500);

      const result = transaction.commit();

      expect(result.success).toBe(false);
      expect(result.rollbackPerformed).toBe(true);
      // Balance should be back to original state
      expect(balanceManager.getBalance(PLAYER_1).available).toBe(500);
      expect(balanceManager.getBalance(PLAYER_1).locked).toBe(500);
    });
  });

  describe('Buy-in Transactions', () => {
    it('should execute buy-in transaction', () => {
      const transaction = transactionManager.beginTransaction(undefined, TABLE_ID);
      transaction.buyIn(TABLE_ID, PLAYER_1, 500);

      const result = transaction.commit();

      expect(result.success).toBe(true);
      expect(escrowManager.getStack(TABLE_ID, PLAYER_1)).toBe(500);
      expect(balanceManager.getBalance(PLAYER_1).available).toBe(500);
      expect(balanceManager.getBalance(PLAYER_1).locked).toBe(500);
    });

    it('should fail buy-in with insufficient balance', () => {
      const transaction = transactionManager.beginTransaction(undefined, TABLE_ID);
      transaction.buyIn(TABLE_ID, PLAYER_1, 2000); // More than available

      const result = transaction.commit();

      expect(result.success).toBe(false);
    });
  });

  describe('Idempotency', () => {
    it('should not execute same transaction twice', () => {
      const idempotencyKey = 'unique-key-001';

      // First execution
      const tx1 = transactionManager.beginTransaction();
      tx1.withIdempotencyKey(idempotencyKey);
      tx1.lockChips(PLAYER_1, 100);
      const result1 = tx1.commit();

      expect(result1.success).toBe(true);
      expect(balanceManager.getBalance(PLAYER_1).available).toBe(900);

      // Second execution with same key
      const tx2 = transactionManager.beginTransaction();
      tx2.withIdempotencyKey(idempotencyKey);
      tx2.lockChips(PLAYER_1, 100);
      const result2 = tx2.commit();

      expect(result2.success).toBe(true);
      // Balance should NOT change again
      expect(balanceManager.getBalance(PLAYER_1).available).toBe(900);
    });

    it('should check if key is processed', () => {
      const key = 'check-key-001';

      expect(transactionManager.isProcessed(key)).toBe(false);

      const tx = transactionManager.beginTransaction();
      tx.withIdempotencyKey(key);
      tx.lockChips(PLAYER_1, 50);
      tx.commit();

      expect(transactionManager.isProcessed(key)).toBe(true);
    });
  });
});

// ============================================================================
// SettlementEngine Tests
// ============================================================================

describe('SettlementEngine', () => {
  let escrowManager: EscrowManager;
  let balanceManager: BalanceManager;
  let transactionManager: TransactionManager;
  let settlementEngine: SettlementEngine;

  beforeEach(() => {
    resetRuntimeCounters();
    balanceManager = resetBalanceManager();
    escrowManager = resetEscrowManager();
    transactionManager = createTransactionManager(balanceManager, escrowManager);
    settlementEngine = createSettlementEngine(escrowManager, transactionManager);

    // Setup players at table
    balanceManager.createBalance(PLAYER_1, 1000);
    balanceManager.createBalance(PLAYER_2, 1000);
    balanceManager.createBalance(PLAYER_3, 1000);
    escrowManager.buyIn(TABLE_ID, PLAYER_1, 500);
    escrowManager.buyIn(TABLE_ID, PLAYER_2, 500);
    escrowManager.buyIn(TABLE_ID, PLAYER_3, 500);
  });

  describe('Simple Settlement', () => {
    it('should settle simple pot with single winner', () => {
      // Simulate betting: each player put in 100
      escrowManager.commitChips(TABLE_ID, PLAYER_1, 100);
      escrowManager.moveToPot(TABLE_ID, PLAYER_1, 100);
      escrowManager.commitChips(TABLE_ID, PLAYER_2, 100);
      escrowManager.moveToPot(TABLE_ID, PLAYER_2, 100);

      const request: SettlementRequest = {
        handId: HAND_ID,
        tableId: TABLE_ID,
        playerStates: [
          { playerId: PLAYER_1, totalBet: 100, isAllIn: false, isFolded: false, stackBefore: 500 },
          { playerId: PLAYER_2, totalBet: 100, isAllIn: false, isFolded: true, stackBefore: 500 },
        ],
        winnerRankings: new Map([[PLAYER_1, 1]]), // PLAYER_1 wins
        finalStreet: 'flop',
        flopSeen: true,
        isUncontested: false,
        playersInHand: 2,
        playersAtShowdown: 1,
      };

      const outcome = settlementEngine.settleHand(request);

      expect(outcome.totalPot).toBe(200);
      expect(outcome.playerPayouts.get(PLAYER_1)).toBeGreaterThan(0);
      expect(outcome.playerPayouts.get(PLAYER_2)).toBeUndefined();
    });

    it('should apply rake correctly', () => {
      // Setup with 5% rake config (default)
      const config = new EconomyConfigBuilder()
        .withRake({ defaultPercentage: 5, defaultCap: 100 })
        .build();

      const customSettlement = createSettlementEngine(
        escrowManager,
        transactionManager,
        config
      );

      // Betting
      escrowManager.commitChips(TABLE_ID, PLAYER_1, 100);
      escrowManager.moveToPot(TABLE_ID, PLAYER_1, 100);
      escrowManager.commitChips(TABLE_ID, PLAYER_2, 100);
      escrowManager.moveToPot(TABLE_ID, PLAYER_2, 100);

      const request: SettlementRequest = {
        handId: 'hand-rake-001' as HandId,
        tableId: TABLE_ID,
        playerStates: [
          { playerId: PLAYER_1, totalBet: 100, isAllIn: false, isFolded: false, stackBefore: 500 },
          { playerId: PLAYER_2, totalBet: 100, isAllIn: false, isFolded: false, stackBefore: 500 },
        ],
        winnerRankings: new Map([[PLAYER_1, 1], [PLAYER_2, 2]]),
        finalStreet: 'river',
        flopSeen: true,
        isUncontested: false,
        playersInHand: 2,
        playersAtShowdown: 2,
      };

      const outcome = customSettlement.settleHand(request);

      expect(outcome.totalPot).toBe(200);
      expect(outcome.rakeCollected).toBe(10); // 5% of 200
      expect(outcome.potAfterRake).toBe(190);
      expect(outcome.playerPayouts.get(PLAYER_1)).toBe(190);
    });

    it('should respect rake cap', () => {
      const config = new EconomyConfigBuilder()
        .withRake({ defaultPercentage: 10, defaultCap: 5 }) // 10% but capped at 5
        .build();

      const customSettlement = createSettlementEngine(
        escrowManager,
        transactionManager,
        config
      );

      // Big pot
      escrowManager.commitChips(TABLE_ID, PLAYER_1, 200);
      escrowManager.moveToPot(TABLE_ID, PLAYER_1, 200);
      escrowManager.commitChips(TABLE_ID, PLAYER_2, 200);
      escrowManager.moveToPot(TABLE_ID, PLAYER_2, 200);

      const request: SettlementRequest = {
        handId: 'hand-cap-001' as HandId,
        tableId: TABLE_ID,
        playerStates: [
          { playerId: PLAYER_1, totalBet: 200, isAllIn: false, isFolded: false, stackBefore: 500 },
          { playerId: PLAYER_2, totalBet: 200, isAllIn: false, isFolded: false, stackBefore: 500 },
        ],
        winnerRankings: new Map([[PLAYER_1, 1]]),
        finalStreet: 'river',
        flopSeen: true,
        isUncontested: false,
        playersInHand: 2,
        playersAtShowdown: 2,
      };

      const outcome = customSettlement.settleHand(request);

      expect(outcome.totalPot).toBe(400);
      // Without cap: 10% = 40, with cap: 5
      expect(outcome.rakeCollected).toBe(5);
      expect(outcome.rakeEvaluation.capApplied).toBe(true);
    });

    it('should waive rake when no flop seen', () => {
      const config = new EconomyConfigBuilder()
        .withRake({ defaultPercentage: 5, noFlopNoRake: true })
        .build();

      const customSettlement = createSettlementEngine(
        escrowManager,
        transactionManager,
        config
      );

      escrowManager.commitChips(TABLE_ID, PLAYER_1, 100);
      escrowManager.moveToPot(TABLE_ID, PLAYER_1, 100);
      escrowManager.commitChips(TABLE_ID, PLAYER_2, 100);
      escrowManager.moveToPot(TABLE_ID, PLAYER_2, 100);

      const request: SettlementRequest = {
        handId: 'hand-noflop-001' as HandId,
        tableId: TABLE_ID,
        playerStates: [
          { playerId: PLAYER_1, totalBet: 100, isAllIn: false, isFolded: false, stackBefore: 500 },
          { playerId: PLAYER_2, totalBet: 100, isAllIn: false, isFolded: true, stackBefore: 500 },
        ],
        winnerRankings: new Map([[PLAYER_1, 1]]),
        finalStreet: 'preflop',
        flopSeen: false, // No flop
        isUncontested: false,
        playersInHand: 2,
        playersAtShowdown: 1,
      };

      const outcome = customSettlement.settleHand(request);

      expect(outcome.rakeCollected).toBe(0);
      expect(outcome.rakeEvaluation.waived).toBe(true);
      expect(outcome.playerPayouts.get(PLAYER_1)).toBe(200);
    });
  });

  describe('Side Pot Settlement', () => {
    beforeEach(() => {
      // Reset both managers for fresh test (clear needs both to stay in sync)
      balanceManager.clear();
      escrowManager.clear();
      balanceManager.createBalance(PLAYER_1, 1000);
      balanceManager.createBalance(PLAYER_2, 1000);
      balanceManager.createBalance(PLAYER_3, 1000);
      escrowManager.buyIn(TABLE_ID, PLAYER_1, 100); // Short stack
      escrowManager.buyIn(TABLE_ID, PLAYER_2, 300);
      escrowManager.buyIn(TABLE_ID, PLAYER_3, 500);
    });

    it('should calculate side pots for all-in scenario', () => {
      // Player 1 goes all-in for 100
      escrowManager.commitChips(TABLE_ID, PLAYER_1, 100);
      escrowManager.moveToPot(TABLE_ID, PLAYER_1, 100);

      // Player 2 calls 100, then bets 100 more
      escrowManager.commitChips(TABLE_ID, PLAYER_2, 200);
      escrowManager.moveToPot(TABLE_ID, PLAYER_2, 200);

      // Player 3 calls 200
      escrowManager.commitChips(TABLE_ID, PLAYER_3, 200);
      escrowManager.moveToPot(TABLE_ID, PLAYER_3, 200);

      const request: SettlementRequest = {
        handId: 'hand-sidepot-001' as HandId,
        tableId: TABLE_ID,
        playerStates: [
          { playerId: PLAYER_1, totalBet: 100, isAllIn: true, isFolded: false, stackBefore: 100 },
          { playerId: PLAYER_2, totalBet: 200, isAllIn: false, isFolded: false, stackBefore: 300 },
          { playerId: PLAYER_3, totalBet: 200, isAllIn: false, isFolded: false, stackBefore: 500 },
        ],
        winnerRankings: new Map([
          [PLAYER_1, 1], // Best hand
          [PLAYER_2, 2],
          [PLAYER_3, 3],
        ]),
        finalStreet: 'river',
        flopSeen: true,
        isUncontested: false,
        playersInHand: 3,
        playersAtShowdown: 3,
      };

      const noRakeEngine = createSettlementEngine(
        escrowManager,
        transactionManager,
        DEFAULT_ECONOMY_CONFIG,
        { enableRake: false }
      );

      const outcome = noRakeEngine.settleHand(request);

      expect(outcome.totalPot).toBe(500); // 100 + 200 + 200
      expect(outcome.sidePots.length).toBe(2);

      // Main pot: 100 * 3 = 300 (all eligible)
      // Side pot: 100 * 2 = 200 (P2 and P3 eligible)
      const mainPot = outcome.sidePots.find(p => p.eligiblePlayers.length === 3);
      const sidePot = outcome.sidePots.find(p => p.eligiblePlayers.length === 2);

      expect(mainPot?.amount).toBe(300);
      expect(sidePot?.amount).toBe(200);

      // Player 1 wins main pot (300), Player 2 wins side pot (200)
      expect(outcome.playerPayouts.get(PLAYER_1)).toBe(300);
      expect(outcome.playerPayouts.get(PLAYER_2)).toBe(200);
    });

    it('should handle multiple all-ins correctly', () => {
      // Reset and setup different stacks (reset both managers for clean state)
      balanceManager.clear();
      escrowManager.clear();
      balanceManager.createBalance(PLAYER_1, 1000);
      balanceManager.createBalance(PLAYER_2, 1000);
      balanceManager.createBalance(PLAYER_3, 1000);
      escrowManager.buyIn(TABLE_ID, PLAYER_1, 50);  // Shortest
      escrowManager.buyIn(TABLE_ID, PLAYER_2, 150); // Medium
      escrowManager.buyIn(TABLE_ID, PLAYER_3, 300); // Deepest

      // All players go all-in
      escrowManager.commitChips(TABLE_ID, PLAYER_1, 50);
      escrowManager.moveToPot(TABLE_ID, PLAYER_1, 50);
      escrowManager.commitChips(TABLE_ID, PLAYER_2, 150);
      escrowManager.moveToPot(TABLE_ID, PLAYER_2, 150);
      escrowManager.commitChips(TABLE_ID, PLAYER_3, 150); // Only match to 150
      escrowManager.moveToPot(TABLE_ID, PLAYER_3, 150);

      const request: SettlementRequest = {
        handId: 'hand-multi-allin-001' as HandId,
        tableId: TABLE_ID,
        playerStates: [
          { playerId: PLAYER_1, totalBet: 50, isAllIn: true, isFolded: false, stackBefore: 50 },
          { playerId: PLAYER_2, totalBet: 150, isAllIn: true, isFolded: false, stackBefore: 150 },
          { playerId: PLAYER_3, totalBet: 150, isAllIn: false, isFolded: false, stackBefore: 300 },
        ],
        winnerRankings: new Map([
          [PLAYER_1, 3], // Worst hand
          [PLAYER_2, 2],
          [PLAYER_3, 1], // Best hand
        ]),
        finalStreet: 'river',
        flopSeen: true,
        isUncontested: false,
        playersInHand: 3,
        playersAtShowdown: 3,
      };

      const noRakeEngine = createSettlementEngine(
        escrowManager,
        transactionManager,
        DEFAULT_ECONOMY_CONFIG,
        { enableRake: false }
      );

      const outcome = noRakeEngine.settleHand(request);

      // Main pot: 50 * 3 = 150, Side pot: 100 * 2 = 200
      expect(outcome.totalPot).toBe(350);
      expect(outcome.sidePots.length).toBe(2);

      // Player 3 wins both pots
      expect(outcome.playerPayouts.get(PLAYER_3)).toBe(350);
    });
  });

  describe('Split Pot Scenarios', () => {
    it('should split pot evenly between tied winners', () => {
      escrowManager.commitChips(TABLE_ID, PLAYER_1, 100);
      escrowManager.moveToPot(TABLE_ID, PLAYER_1, 100);
      escrowManager.commitChips(TABLE_ID, PLAYER_2, 100);
      escrowManager.moveToPot(TABLE_ID, PLAYER_2, 100);

      const request: SettlementRequest = {
        handId: 'hand-split-001' as HandId,
        tableId: TABLE_ID,
        playerStates: [
          { playerId: PLAYER_1, totalBet: 100, isAllIn: false, isFolded: false, stackBefore: 500 },
          { playerId: PLAYER_2, totalBet: 100, isAllIn: false, isFolded: false, stackBefore: 500 },
        ],
        winnerRankings: new Map([
          [PLAYER_1, 1], // Tied
          [PLAYER_2, 1], // Tied
        ]),
        finalStreet: 'river',
        flopSeen: true,
        isUncontested: false,
        playersInHand: 2,
        playersAtShowdown: 2,
      };

      const noRakeEngine = createSettlementEngine(
        escrowManager,
        transactionManager,
        DEFAULT_ECONOMY_CONFIG,
        { enableRake: false }
      );

      const outcome = noRakeEngine.settleHand(request);

      expect(outcome.playerPayouts.get(PLAYER_1)).toBe(100);
      expect(outcome.playerPayouts.get(PLAYER_2)).toBe(100);
    });

    it('should handle odd chip distribution (remainder to first winner)', () => {
      escrowManager.commitChips(TABLE_ID, PLAYER_1, 51);
      escrowManager.moveToPot(TABLE_ID, PLAYER_1, 51);
      escrowManager.commitChips(TABLE_ID, PLAYER_2, 50);
      escrowManager.moveToPot(TABLE_ID, PLAYER_2, 50);

      const request: SettlementRequest = {
        handId: 'hand-odd-001' as HandId,
        tableId: TABLE_ID,
        playerStates: [
          { playerId: PLAYER_1, totalBet: 51, isAllIn: false, isFolded: false, stackBefore: 500 },
          { playerId: PLAYER_2, totalBet: 50, isAllIn: false, isFolded: false, stackBefore: 500 },
        ],
        winnerRankings: new Map([
          [PLAYER_1, 1], // Tied
          [PLAYER_2, 1], // Tied
        ]),
        finalStreet: 'river',
        flopSeen: true,
        isUncontested: false,
        playersInHand: 2,
        playersAtShowdown: 2,
      };

      const noRakeEngine = createSettlementEngine(
        escrowManager,
        transactionManager,
        DEFAULT_ECONOMY_CONFIG,
        { enableRake: false }
      );

      const outcome = noRakeEngine.settleHand(request);

      // 101 / 2 = 50 each, 1 remainder to first winner
      const p1Payout = outcome.playerPayouts.get(PLAYER_1) ?? 0;
      const p2Payout = outcome.playerPayouts.get(PLAYER_2) ?? 0;

      expect(p1Payout + p2Payout).toBe(101);
      // One gets 51, other gets 50
      expect([p1Payout, p2Payout].sort()).toEqual([50, 51]);
    });
  });

  describe('Idempotency', () => {
    it('should not process same settlement twice', () => {
      escrowManager.commitChips(TABLE_ID, PLAYER_1, 100);
      escrowManager.moveToPot(TABLE_ID, PLAYER_1, 100);
      escrowManager.commitChips(TABLE_ID, PLAYER_2, 100);
      escrowManager.moveToPot(TABLE_ID, PLAYER_2, 100);

      const request: SettlementRequest = {
        handId: HAND_ID,
        tableId: TABLE_ID,
        playerStates: [
          { playerId: PLAYER_1, totalBet: 100, isAllIn: false, isFolded: false, stackBefore: 500 },
          { playerId: PLAYER_2, totalBet: 100, isAllIn: false, isFolded: true, stackBefore: 500 },
        ],
        winnerRankings: new Map([[PLAYER_1, 1]]),
        finalStreet: 'flop',
        flopSeen: true,
        isUncontested: false,
        playersInHand: 2,
        playersAtShowdown: 1,
      };

      const noRakeEngine = createSettlementEngine(
        escrowManager,
        transactionManager,
        DEFAULT_ECONOMY_CONFIG,
        { enableRake: false }
      );

      const outcome1 = noRakeEngine.settleHand(request);
      const stack1 = escrowManager.getStack(TABLE_ID, PLAYER_1);

      const outcome2 = noRakeEngine.settleHand(request);
      const stack2 = escrowManager.getStack(TABLE_ID, PLAYER_1);

      // Settlement IDs should be the same (idempotent)
      expect(outcome1.settlementId).toBe(outcome2.settlementId);
      // Stack should not increase twice
      expect(stack1).toBe(stack2);
    });
  });
});

// ============================================================================
// EconomyPersistence Tests
// ============================================================================

describe('EconomyPersistence', () => {
  let balanceManager: BalanceManager;
  let escrowManager: EscrowManager;
  let ledgerManager: LedgerManager;
  let persistence: EconomyPersistence;

  beforeEach(() => {
    resetRuntimeCounters();
    balanceManager = resetBalanceManager();
    escrowManager = resetEscrowManager();
    ledgerManager = resetLedgerManager();
    persistence = createEconomyPersistence(balanceManager, escrowManager, ledgerManager);

    // Setup initial state
    balanceManager.createBalance(PLAYER_1, 1000);
    balanceManager.createBalance(PLAYER_2, 2000);
    escrowManager.buyIn(TABLE_ID, PLAYER_1, 500);
  });

  describe('Snapshot Creation', () => {
    it('should create snapshot with correct data', () => {
      const snapshot = persistence.createSnapshot();

      expect(snapshot.version).toBe(1);
      expect(snapshot.balances.size).toBe(2);
      expect(snapshot.escrows.size).toBe(1);

      const p1Balance = snapshot.balances.get(PLAYER_1);
      expect(p1Balance?.available).toBe(500);
      expect(p1Balance?.locked).toBe(500);
    });

    it('should increment version on each snapshot', () => {
      const snap1 = persistence.createSnapshot();
      const snap2 = persistence.createSnapshot();
      const snap3 = persistence.createSnapshot();

      expect(snap1.version).toBe(1);
      expect(snap2.version).toBe(2);
      expect(snap3.version).toBe(3);
    });

    it('should retain limited snapshots', () => {
      for (let i = 0; i < 15; i++) {
        persistence.createSnapshot();
      }

      // Default is 10 snapshots
      expect(persistence.getAllSnapshots().length).toBe(10);
    });
  });

  describe('Recovery', () => {
    it('should recover from snapshot', () => {
      const snapshot = persistence.createSnapshot();

      // Modify state
      balanceManager.credit(PLAYER_1, 500);
      escrowManager.buyIn(TABLE_ID, PLAYER_2, 300);

      // Recover
      const result = persistence.recoverFromSnapshot(snapshot);

      expect(result.success).toBe(true);
      expect(result.balancesRecovered).toBe(2);
      expect(result.escrowsRecovered).toBe(1);
    });

    it('should detect corrupted snapshot', () => {
      const snapshot = persistence.createSnapshot();

      // Corrupt the checksum
      const corruptedSnapshot = {
        ...snapshot,
        checksum: 'invalid',
      };

      const result = persistence.recoverFromSnapshot(corruptedSnapshot);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Settlement History', () => {
    it('should track settlements for idempotency', () => {
      expect(persistence.isSettlementProcessed(HAND_ID, TABLE_ID)).toBe(false);

      persistence.recordSettlement(
        'settle-001',
        HAND_ID,
        TABLE_ID,
        200,
        10,
        new Map([[PLAYER_1, 190]])
      );

      expect(persistence.isSettlementProcessed(HAND_ID, TABLE_ID)).toBe(true);

      const record = persistence.getSettlementRecord(HAND_ID, TABLE_ID);
      expect(record?.totalPot).toBe(200);
      expect(record?.rakeCollected).toBe(10);
    });
  });

  describe('Invariant Verification', () => {
    it('should verify no negative balances', () => {
      const results = persistence.verifyInvariants();
      const noNegative = results.find(r => r.invariant === 'no_negative_balances');

      expect(noNegative?.valid).toBe(true);
    });

    it('should verify escrow consistency', () => {
      const results = persistence.verifyInvariants();
      const escrowCheck = results.find(r => r.invariant === 'escrow_consistency');

      expect(escrowCheck?.valid).toBe(true);
    });
  });
});

// ============================================================================
// EconomyRuntime Integration Tests
// ============================================================================

describe('EconomyRuntime Integration', () => {
  let runtime: EconomyRuntime;

  beforeEach(() => {
    resetRuntimeCounters();
    runtime = createTestRuntime();
  });

  afterEach(() => {
    runtime.clear();
  });

  describe('Player Lifecycle', () => {
    it('should initialize player with balance', () => {
      const balance = runtime.initializePlayer(PLAYER_1, 1000);

      expect(balance.playerId).toBe(PLAYER_1);
      expect(balance.available).toBe(1000);
      expect(balance.locked).toBe(0);
    });

    it('should handle buy-in correctly', () => {
      runtime.initializePlayer(PLAYER_1, 1000);

      const result = runtime.buyIn(TABLE_ID, PLAYER_1, 500);

      expect(result.success).toBe(true);
      expect(result.stack).toBe(500);
      expect(runtime.getAvailableBalance(PLAYER_1)).toBe(500);
    });

    it('should handle cash-out correctly', () => {
      runtime.initializePlayer(PLAYER_1, 1000);
      runtime.buyIn(TABLE_ID, PLAYER_1, 500);

      const result = runtime.cashOut(TABLE_ID, PLAYER_1);

      expect(result.success).toBe(true);
      expect(result.cashOutAmount).toBe(500);
      expect(runtime.getAvailableBalance(PLAYER_1)).toBe(1000);
    });

    it('should prevent cash-out with committed chips', () => {
      runtime.initializePlayer(PLAYER_1, 1000);
      runtime.buyIn(TABLE_ID, PLAYER_1, 500);

      // Directly commit chips via escrow manager (not moving to pot)
      // This simulates the state before action resolution
      const managers = runtime.getManagers();
      managers.escrow.commitChips(TABLE_ID, PLAYER_1, 10);

      const result = runtime.cashOut(TABLE_ID, PLAYER_1);

      expect(result.success).toBe(false);
      expect(result.error).toContain('committed');
    });
  });

  describe('Hand Settlement Flow', () => {
    beforeEach(() => {
      setupPlayersAtTable(runtime, [
        { id: PLAYER_1, balance: 1000, buyIn: 500 },
        { id: PLAYER_2, balance: 1000, buyIn: 500 },
        { id: PLAYER_3, balance: 1000, buyIn: 500 },
      ]);
    });

    it('should process complete hand flow', () => {
      // Start hand
      runtime.startHand(HAND_ID, TABLE_ID);

      // Post blinds
      runtime.postBlinds(HAND_ID, TABLE_ID, [
        { playerId: PLAYER_1, amount: 5, type: 'small' },
        { playerId: PLAYER_2, amount: 10, type: 'big' },
      ]);

      // Betting
      runtime.recordAction(HAND_ID, TABLE_ID, PLAYER_3, 'call', 10, 'preflop');
      runtime.recordAction(HAND_ID, TABLE_ID, PLAYER_1, 'call', 5, 'preflop');
      // PLAYER_2 checks (no chips committed, not tracked in economy)

      // Player 3 folds on flop
      runtime.playerFolded(HAND_ID, PLAYER_3);

      // More betting
      runtime.recordAction(HAND_ID, TABLE_ID, PLAYER_1, 'bet', 20, 'flop');
      runtime.recordAction(HAND_ID, TABLE_ID, PLAYER_2, 'call', 20, 'flop');

      // Settlement
      const outcome = runtime.settleHand({
        handId: HAND_ID,
        tableId: TABLE_ID,
        playerStates: [
          { playerId: PLAYER_1, totalBet: 35, isAllIn: false, isFolded: false, stackBefore: 500 },
          { playerId: PLAYER_2, totalBet: 30, isAllIn: false, isFolded: false, stackBefore: 500 },
          { playerId: PLAYER_3, totalBet: 10, isAllIn: false, isFolded: true, stackBefore: 500 },
        ],
        winnerRankings: new Map([[PLAYER_1, 1], [PLAYER_2, 2]]),
        finalStreet: 'flop',
        flopSeen: true,
        isUncontested: false,
        playersInHand: 3,
        playersAtShowdown: 2,
      });

      expect(outcome.totalPot).toBe(75); // 35 + 30 + 10
      expect(outcome.playerPayouts.get(PLAYER_1)).toBeGreaterThan(0);
    });

    it('should handle uncontested pot', () => {
      runtime.startHand(HAND_ID, TABLE_ID);
      runtime.postBlinds(HAND_ID, TABLE_ID, [
        { playerId: PLAYER_1, amount: 5, type: 'small' },
        { playerId: PLAYER_2, amount: 10, type: 'big' },
      ]);

      // Everyone folds to big blind
      runtime.playerFolded(HAND_ID, PLAYER_3);
      runtime.playerFolded(HAND_ID, PLAYER_1);

      const outcome = runtime.settleUncontested(
        HAND_ID,
        TABLE_ID,
        PLAYER_2,
        15, // pot total
        'preflop',
        false
      );

      expect(outcome.playerPayouts.get(PLAYER_2)).toBe(15);
    });
  });

  describe('Persistence and Recovery', () => {
    it('should create and recover from snapshot', () => {
      setupPlayersAtTable(runtime, [
        { id: PLAYER_1, balance: 1000, buyIn: 500 },
        { id: PLAYER_2, balance: 2000, buyIn: 800 },
      ]);

      const snapshot = runtime.createSnapshot();
      expect(snapshot.balances.size).toBe(2);

      // Modify state
      runtime.creditPlayer(PLAYER_1, 500, 'bonus');

      // Recover
      const result = runtime.recoverFromSnapshot(snapshot);

      expect(result.success).toBe(true);
      // Balance should be restored
      expect(runtime.getAvailableBalance(PLAYER_1)).toBe(500);
    });
  });

  describe('Event System', () => {
    it('should emit events', () => {
      const events: string[] = [];
      runtime.onEvent(e => events.push(e.type));

      setupPlayersAtTable(runtime, [
        { id: PLAYER_1, balance: 1000, buyIn: 500 },
        { id: PLAYER_2, balance: 1000, buyIn: 500 },
      ]);

      runtime.startHand(HAND_ID, TABLE_ID);
      runtime.postBlinds(HAND_ID, TABLE_ID, [
        { playerId: PLAYER_1, amount: 10, type: 'small' },
        { playerId: PLAYER_2, amount: 20, type: 'big' },
      ]);

      runtime.settleUncontested(HAND_ID, TABLE_ID, PLAYER_2, 30, 'preflop', false);

      expect(events).toContain('settlement_started');
      expect(events).toContain('settlement_completed');
    });
  });

  describe('Invariant Verification', () => {
    it('should verify financial invariants', () => {
      setupPlayersAtTable(runtime, [
        { id: PLAYER_1, balance: 1000, buyIn: 500 },
      ]);

      const results = runtime.verifyInvariants();

      expect(results.every(r => r.valid)).toBe(true);
    });
  });
});

// ============================================================================
// Complex All-In Scenarios
// ============================================================================

describe('Complex All-In Scenarios', () => {
  let runtime: EconomyRuntime;

  beforeEach(() => {
    resetRuntimeCounters();
    runtime = createEconomyRuntime({
      balanceManager: resetBalanceManager(),
      escrowManager: resetEscrowManager(),
      potManager: resetPotManager(),
      ledgerManager: resetLedgerManager(),
      economyConfig: new EconomyConfigBuilder()
        .withRake({ defaultPercentage: 0 }) // No rake for cleaner tests
        .build(),
    });
  });

  afterEach(() => {
    runtime.clear();
  });

  it('should handle four-way all-in with different stack sizes', () => {
    // Setup players with different stacks
    runtime.initializePlayer(PLAYER_1, 100);
    runtime.initializePlayer(PLAYER_2, 200);
    runtime.initializePlayer(PLAYER_3, 300);
    runtime.initializePlayer(PLAYER_4, 400);

    runtime.buyIn(TABLE_ID, PLAYER_1, 100);
    runtime.buyIn(TABLE_ID, PLAYER_2, 200);
    runtime.buyIn(TABLE_ID, PLAYER_3, 300);
    runtime.buyIn(TABLE_ID, PLAYER_4, 400);

    runtime.startHand(HAND_ID, TABLE_ID);

    // All players go all-in
    runtime.recordAction(HAND_ID, TABLE_ID, PLAYER_1, 'all-in', 100, 'preflop');
    runtime.recordAction(HAND_ID, TABLE_ID, PLAYER_2, 'all-in', 200, 'preflop');
    runtime.recordAction(HAND_ID, TABLE_ID, PLAYER_3, 'all-in', 300, 'preflop');
    runtime.recordAction(HAND_ID, TABLE_ID, PLAYER_4, 'call', 300, 'preflop');

    // Settle: Player 1 has best hand
    const outcome = runtime.settleHand({
      handId: HAND_ID,
      tableId: TABLE_ID,
      playerStates: [
        { playerId: PLAYER_1, totalBet: 100, isAllIn: true, isFolded: false, stackBefore: 100 },
        { playerId: PLAYER_2, totalBet: 200, isAllIn: true, isFolded: false, stackBefore: 200 },
        { playerId: PLAYER_3, totalBet: 300, isAllIn: true, isFolded: false, stackBefore: 300 },
        { playerId: PLAYER_4, totalBet: 300, isAllIn: false, isFolded: false, stackBefore: 400 },
      ],
      winnerRankings: new Map([
        [PLAYER_1, 1], // Best
        [PLAYER_2, 2],
        [PLAYER_3, 3],
        [PLAYER_4, 4],
      ]),
      finalStreet: 'river',
      flopSeen: true,
      isUncontested: false,
      playersInHand: 4,
      playersAtShowdown: 4,
    });

    // Total pot = 100 + 200 + 300 + 300 = 900
    expect(outcome.totalPot).toBe(900);

    // Main pot (100 * 4 = 400) -> Player 1
    // Side pot 1 (100 * 3 = 300) -> Player 2
    // Side pot 2 (100 * 2 = 200) -> Player 3
    expect(outcome.sidePots.length).toBe(3);
    expect(outcome.playerPayouts.get(PLAYER_1)).toBe(400);
    expect(outcome.playerPayouts.get(PLAYER_2)).toBe(300);
    expect(outcome.playerPayouts.get(PLAYER_3)).toBe(200);
    // PLAYER_4 loses everything - not in payouts map (no winnings)
    expect(outcome.playerPayouts.get(PLAYER_4)).toBeUndefined();
  });

  it('should handle all-in with some players folding', () => {
    runtime.initializePlayer(PLAYER_1, 100);
    runtime.initializePlayer(PLAYER_2, 300);
    runtime.initializePlayer(PLAYER_3, 300);

    runtime.buyIn(TABLE_ID, PLAYER_1, 100);
    runtime.buyIn(TABLE_ID, PLAYER_2, 300);
    runtime.buyIn(TABLE_ID, PLAYER_3, 300);

    runtime.startHand(HAND_ID, TABLE_ID);

    // Player 1 all-in, Player 2 calls, Player 3 raises then folds later
    runtime.recordAction(HAND_ID, TABLE_ID, PLAYER_1, 'all-in', 100, 'preflop');
    runtime.recordAction(HAND_ID, TABLE_ID, PLAYER_2, 'raise', 200, 'preflop');
    runtime.recordAction(HAND_ID, TABLE_ID, PLAYER_3, 'call', 200, 'preflop');

    // Player 3 folds on flop
    runtime.playerFolded(HAND_ID, PLAYER_3);

    const outcome = runtime.settleHand({
      handId: HAND_ID,
      tableId: TABLE_ID,
      playerStates: [
        { playerId: PLAYER_1, totalBet: 100, isAllIn: true, isFolded: false, stackBefore: 100 },
        { playerId: PLAYER_2, totalBet: 200, isAllIn: false, isFolded: false, stackBefore: 300 },
        { playerId: PLAYER_3, totalBet: 200, isAllIn: false, isFolded: true, stackBefore: 300 },
      ],
      winnerRankings: new Map([
        [PLAYER_1, 1], // Best (still in)
        [PLAYER_2, 2],
      ]),
      finalStreet: 'flop',
      flopSeen: true,
      isUncontested: false,
      playersInHand: 3,
      playersAtShowdown: 2,
    });

    // Total: 100 + 200 + 200 = 500
    expect(outcome.totalPot).toBe(500);

    // Main pot: 100 * 3 = 300 (P1, P2 eligible - P3 folded)
    // Side pot: 100 * 2 = 200 (P2 only eligible - P3 folded)
    expect(outcome.playerPayouts.get(PLAYER_1)).toBe(300);
    expect(outcome.playerPayouts.get(PLAYER_2)).toBe(200);
  });
});

// ============================================================================
// Concurrent Tables
// ============================================================================

describe('Concurrent Tables', () => {
  let runtime: EconomyRuntime;
  const TABLE_A = 'table-A' as TableId;
  const TABLE_B = 'table-B' as TableId;

  beforeEach(() => {
    resetRuntimeCounters();
    runtime = createTestRuntime();
  });

  afterEach(() => {
    runtime.clear();
  });

  it('should handle player at multiple tables', () => {
    runtime.initializePlayer(PLAYER_1, 2000);

    // Buy into two tables
    runtime.buyIn(TABLE_A, PLAYER_1, 500);
    runtime.buyIn(TABLE_B, PLAYER_1, 500);

    expect(runtime.getStack(TABLE_A, PLAYER_1)).toBe(500);
    expect(runtime.getStack(TABLE_B, PLAYER_1)).toBe(500);
    expect(runtime.getAvailableBalance(PLAYER_1)).toBe(1000);
  });

  it('should isolate settlements between tables', () => {
    runtime.initializePlayer(PLAYER_1, 2000);
    runtime.initializePlayer(PLAYER_2, 2000);

    runtime.buyIn(TABLE_A, PLAYER_1, 500);
    runtime.buyIn(TABLE_A, PLAYER_2, 500);
    runtime.buyIn(TABLE_B, PLAYER_1, 500);
    runtime.buyIn(TABLE_B, PLAYER_2, 500);

    // Hand at table A
    const handA = 'hand-A' as HandId;
    runtime.startHand(handA, TABLE_A);
    runtime.postBlinds(handA, TABLE_A, [
      { playerId: PLAYER_1, amount: 10, type: 'small' },
      { playerId: PLAYER_2, amount: 20, type: 'big' },
    ]);

    // Hand at table B
    const handB = 'hand-B' as HandId;
    runtime.startHand(handB, TABLE_B);
    runtime.postBlinds(handB, TABLE_B, [
      { playerId: PLAYER_1, amount: 25, type: 'small' },
      { playerId: PLAYER_2, amount: 50, type: 'big' },
    ]);

    // Settle table A
    const outcomeA = runtime.settleUncontested(handA, TABLE_A, PLAYER_2, 30, 'preflop', false);

    // Settle table B
    const outcomeB = runtime.settleUncontested(handB, TABLE_B, PLAYER_1, 75, 'preflop', false);

    expect(outcomeA.tableId).toBe(TABLE_A);
    expect(outcomeB.tableId).toBe(TABLE_B);

    // Verify stacks are correct at each table
    expect(runtime.getStack(TABLE_A, PLAYER_1)).toBe(490); // -10
    expect(runtime.getStack(TABLE_A, PLAYER_2)).toBe(510); // +10
    expect(runtime.getStack(TABLE_B, PLAYER_1)).toBe(550); // +50
    expect(runtime.getStack(TABLE_B, PLAYER_2)).toBe(450); // -50
  });
});
