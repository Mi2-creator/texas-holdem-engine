/**
 * Economy.test.ts
 * Phase 14 - Comprehensive tests for the poker economy system
 *
 * Test coverage:
 * - Single pot settlement
 * - Multiple side pots
 * - Split pot settlement
 * - Rake cap respected
 * - No-rake hand
 * - Ledger replay determinism
 * - Double settlement prevented
 */

import {
  BalanceManager,
  resetBalanceManager,
  EscrowManager,
  resetEscrowManager,
  PotManager,
  resetPotManager,
  SidePotCalculator,
  PlayerContributionInfo,
  RakeCalculator,
  resetRakeCalculator,
  buildHandRakeContext,
  LedgerManager,
  resetLedgerManager,
  LedgerEntryType,
  EconomyEngine,
  EconomyErrors,
} from '../index';

// ============================================================================
// Test Setup
// ============================================================================

function createTestEnvironment() {
  const balance = resetBalanceManager();
  const escrow = resetEscrowManager(balance);
  const pot = resetPotManager();
  const rake = resetRakeCalculator({ rakePercentage: 5, rakeCap: 3, noFlopNoRake: true });
  const ledger = resetLedgerManager();

  return { balance, escrow, pot, rake, ledger };
}

// ============================================================================
// Balance Tests
// ============================================================================

describe('BalanceManager', () => {
  let balance: BalanceManager;

  beforeEach(() => {
    balance = resetBalanceManager();
  });

  test('creates balance with initial amount', () => {
    const result = balance.createBalance('player1', 1000);
    expect(result.available).toBe(1000);
    expect(result.locked).toBe(0);
    expect(result.pending).toBe(0);
  });

  test('credits and debits correctly', () => {
    balance.createBalance('player1', 1000);

    balance.credit('player1', 500);
    expect(balance.getBalance('player1').available).toBe(1500);

    balance.debit('player1', 300);
    expect(balance.getBalance('player1').available).toBe(1200);
  });

  test('locks and unlocks chips', () => {
    balance.createBalance('player1', 1000);

    balance.lock('player1', 500);
    expect(balance.getBalance('player1').available).toBe(500);
    expect(balance.getBalance('player1').locked).toBe(500);

    balance.unlock('player1', 200);
    expect(balance.getBalance('player1').available).toBe(700);
    expect(balance.getBalance('player1').locked).toBe(300);
  });

  test('prevents negative balance', () => {
    balance.createBalance('player1', 1000);

    expect(() => balance.debit('player1', 1500)).toThrow();
  });

  test('requires integer amounts', () => {
    balance.createBalance('player1', 1000);

    expect(() => balance.credit('player1', 100.5)).toThrow();
  });

  test('transfer between players', () => {
    balance.createBalance('player1', 1000);
    balance.createBalance('player2', 500);

    balance.transfer('player1', 'player2', 300);

    expect(balance.getBalance('player1').available).toBe(700);
    expect(balance.getBalance('player2').available).toBe(800);
  });
});

// ============================================================================
// Escrow Tests
// ============================================================================

describe('EscrowManager', () => {
  let balance: BalanceManager;
  let escrow: EscrowManager;

  beforeEach(() => {
    balance = resetBalanceManager();
    escrow = resetEscrowManager(balance);
  });

  test('buy-in moves chips from balance to escrow', () => {
    balance.createBalance('player1', 1000);

    escrow.buyIn('table1', 'player1', 500);

    expect(balance.getBalance('player1').available).toBe(500);
    expect(balance.getBalance('player1').locked).toBe(500);
    expect(escrow.getStack('table1', 'player1')).toBe(500);
  });

  test('cash-out moves chips from escrow to balance', () => {
    balance.createBalance('player1', 1000);
    escrow.buyIn('table1', 'player1', 500);

    escrow.cashOut('table1', 'player1', 200);

    expect(balance.getBalance('player1').available).toBe(700);
    expect(balance.getBalance('player1').locked).toBe(300);
    expect(escrow.getStack('table1', 'player1')).toBe(300);
  });

  test('prevents cash-out of committed chips', () => {
    balance.createBalance('player1', 1000);
    escrow.buyIn('table1', 'player1', 500);
    escrow.commitChips('table1', 'player1', 200);

    expect(() => escrow.cashOut('table1', 'player1', 400)).toThrow();
  });

  test('commit and move to pot', () => {
    balance.createBalance('player1', 1000);
    escrow.buyIn('table1', 'player1', 500);

    escrow.commitChips('table1', 'player1', 100);
    escrow.moveToPot('table1', 'player1', 100);

    expect(escrow.getStack('table1', 'player1')).toBe(400);
  });

  test('award pot to winner', () => {
    balance.createBalance('player1', 1000);
    balance.createBalance('player2', 1000);
    escrow.buyIn('table1', 'player1', 500);
    escrow.buyIn('table1', 'player2', 500);

    // Simulate pot contribution and win
    escrow.commitChips('table1', 'player1', 100);
    escrow.moveToPot('table1', 'player1', 100);
    escrow.commitChips('table1', 'player2', 100);
    escrow.moveToPot('table1', 'player2', 100);

    escrow.awardPot('table1', 'player1', 200);

    expect(escrow.getStack('table1', 'player1')).toBe(600);
    expect(escrow.getStack('table1', 'player2')).toBe(400);
  });
});

// ============================================================================
// Pot Tests
// ============================================================================

describe('PotManager', () => {
  let pot: PotManager;

  beforeEach(() => {
    pot = resetPotManager();
  });

  test('creates pot and tracks contributions', () => {
    const builder = pot.createPot('hand1', 'table1');

    builder.postBlind('player1', 5);
    builder.postBlind('player2', 10);

    expect(builder.getTotal()).toBe(15);
    expect(builder.getPlayerContribution('player1')).toBe(5);
    expect(builder.getPlayerContribution('player2')).toBe(10);
  });

  test('tracks street contributions', () => {
    const builder = pot.createPot('hand1', 'table1');

    builder.postBlind('player1', 5);
    builder.postBlind('player2', 10);
    builder.recordBet('player1', 15, 'preflop');
    builder.recordBet('player2', 10, 'preflop');

    expect(builder.getStreetTotal('preflop')).toBe(40);
  });

  test('tracks eligible players after fold', () => {
    const builder = pot.createPot('hand1', 'table1');

    builder.postBlind('player1', 5);
    builder.postBlind('player2', 10);
    builder.playerFolded('player1');

    const eligible = builder.getEligiblePlayers();
    expect(eligible).toContain('player2');
    expect(eligible).not.toContain('player1');
  });
});

// ============================================================================
// Side Pot Tests
// ============================================================================

describe('SidePotCalculator', () => {
  test('calculates single pot with no all-ins', () => {
    const contributions: PlayerContributionInfo[] = [
      { playerId: 'p1', totalContribution: 100, isAllIn: false, isFolded: false },
      { playerId: 'p2', totalContribution: 100, isAllIn: false, isFolded: false },
    ];

    const result = SidePotCalculator.calculate('hand1', contributions);

    expect(result.pots.length).toBe(1);
    expect(result.pots[0].amount).toBe(200);
    expect(result.totalAmount).toBe(200);
  });

  test('calculates multiple side pots with all-ins', () => {
    // Player A: 100 (all-in)
    // Player B: 200 (all-in)
    // Player C: 300 (active)
    const contributions: PlayerContributionInfo[] = [
      { playerId: 'pA', totalContribution: 100, isAllIn: true, isFolded: false },
      { playerId: 'pB', totalContribution: 200, isAllIn: true, isFolded: false },
      { playerId: 'pC', totalContribution: 300, isAllIn: false, isFolded: false },
    ];

    const result = SidePotCalculator.calculate('hand1', contributions);

    // Main pot: 100 * 3 = 300 (A, B, C eligible)
    // Side pot 1: (200-100) * 2 = 200 (B, C eligible)
    // Side pot 2: (300-200) * 1 = 100 (C only)
    expect(result.pots.length).toBe(3);
    expect(result.pots[0].amount).toBe(300);
    expect(result.pots[0].eligiblePlayers).toEqual(['pA', 'pB', 'pC']);
    expect(result.pots[1].amount).toBe(200);
    expect(result.pots[1].eligiblePlayers).toEqual(['pB', 'pC']);
    expect(result.pots[2].amount).toBe(100);
    expect(result.pots[2].eligiblePlayers).toEqual(['pC']);
    expect(result.totalAmount).toBe(600);
  });

  test('excludes folded players from eligibility', () => {
    const contributions: PlayerContributionInfo[] = [
      { playerId: 'p1', totalContribution: 100, isAllIn: false, isFolded: true },
      { playerId: 'p2', totalContribution: 100, isAllIn: false, isFolded: false },
      { playerId: 'p3', totalContribution: 100, isAllIn: false, isFolded: false },
    ];

    const result = SidePotCalculator.calculate('hand1', contributions);

    expect(result.pots[0].eligiblePlayers).toEqual(['p2', 'p3']);
    expect(result.pots[0].eligiblePlayers).not.toContain('p1');
  });

  test('settles pots correctly', () => {
    const contributions: PlayerContributionInfo[] = [
      { playerId: 'p1', totalContribution: 100, isAllIn: false, isFolded: false },
      { playerId: 'p2', totalContribution: 100, isAllIn: false, isFolded: false },
    ];

    const sidePotResult = SidePotCalculator.calculate('hand1', contributions);

    const winnersByPot = new Map<string, readonly string[]>();
    winnersByPot.set(sidePotResult.pots[0].sidePotId, ['p1']);

    const settlement = SidePotCalculator.settle(sidePotResult, winnersByPot);

    expect(settlement.playerPayouts.get('p1')).toBe(200);
    expect(settlement.totalAwarded).toBe(200);
  });

  test('splits pot between multiple winners', () => {
    const contributions: PlayerContributionInfo[] = [
      { playerId: 'p1', totalContribution: 100, isAllIn: false, isFolded: false },
      { playerId: 'p2', totalContribution: 100, isAllIn: false, isFolded: false },
    ];

    const sidePotResult = SidePotCalculator.calculate('hand1', contributions);

    const winnersByPot = new Map<string, readonly string[]>();
    winnersByPot.set(sidePotResult.pots[0].sidePotId, ['p1', 'p2']);

    const settlement = SidePotCalculator.settle(sidePotResult, winnersByPot);

    expect(settlement.playerPayouts.get('p1')).toBe(100);
    expect(settlement.playerPayouts.get('p2')).toBe(100);
  });

  test('handles odd chips in split pot', () => {
    const contributions: PlayerContributionInfo[] = [
      { playerId: 'p1', totalContribution: 101, isAllIn: false, isFolded: false },
      { playerId: 'p2', totalContribution: 100, isAllIn: false, isFolded: false },
    ];

    const sidePotResult = SidePotCalculator.calculate('hand1', contributions);

    // Winner split - 201 / 2 = 100 each with 1 remainder to first
    const winnersByPot = new Map<string, readonly string[]>();
    winnersByPot.set(sidePotResult.pots[0].sidePotId, ['p1', 'p2']);
    winnersByPot.set(sidePotResult.pots[1].sidePotId, ['p1']); // p1 wins the extra pot

    const settlement = SidePotCalculator.settle(sidePotResult, winnersByPot);

    expect(settlement.playerPayouts.get('p1')).toBe(101);
    expect(settlement.playerPayouts.get('p2')).toBe(100);
  });

  test('verifies chip conservation', () => {
    const contributions: PlayerContributionInfo[] = [
      { playerId: 'p1', totalContribution: 100, isAllIn: false, isFolded: false },
      { playerId: 'p2', totalContribution: 100, isAllIn: false, isFolded: false },
    ];

    const result = SidePotCalculator.calculate('hand1', contributions);

    expect(SidePotCalculator.verifyConservation(contributions, result)).toBe(true);
  });
});

// ============================================================================
// Rake Tests
// ============================================================================

describe('RakeCalculator', () => {
  test('calculates percentage rake', () => {
    const rake = resetRakeCalculator({ rakePercentage: 5, rakeCap: 100, noFlopNoRake: false });

    const context = buildHandRakeContext({
      handId: 'hand1',
      tableId: 'table1',
      potSize: 100,
      finalStreet: 'flop',
      playersInHand: 3,
      playersAtShowdown: 2,
    });

    const result = rake.calculateRake(context);

    expect(result.rakeAmount).toBe(5);
    expect(result.potAfterRake).toBe(95);
  });

  test('respects rake cap', () => {
    const rake = resetRakeCalculator({ rakePercentage: 10, rakeCap: 3, noFlopNoRake: false });

    const context = buildHandRakeContext({
      handId: 'hand1',
      tableId: 'table1',
      potSize: 100,
      finalStreet: 'flop',
      playersInHand: 3,
      playersAtShowdown: 2,
    });

    const result = rake.calculateRake(context);

    expect(result.rakeAmount).toBe(3);
    expect(result.capApplied).toBe(true);
  });

  test('no rake when flop not seen', () => {
    const rake = resetRakeCalculator({ rakePercentage: 5, rakeCap: 100, noFlopNoRake: true });

    const context = buildHandRakeContext({
      handId: 'hand1',
      tableId: 'table1',
      potSize: 100,
      finalStreet: 'preflop',
      playersInHand: 3,
      playersAtShowdown: 1,
    });

    const result = rake.calculateRake(context);

    expect(result.rakeAmount).toBe(0);
    expect(result.waived).toBe(true);
    expect(result.waivedReason).toContain('No flop');
  });

  test('no rake for uncontested pot', () => {
    const rake = resetRakeCalculator({ rakePercentage: 5, rakeCap: 100, noFlopNoRake: false, excludeUncontested: true });

    const context = buildHandRakeContext({
      handId: 'hand1',
      tableId: 'table1',
      potSize: 15,
      finalStreet: 'preflop',
      playersInHand: 2,
      playersAtShowdown: 1,
    });

    const result = rake.calculateRake(context);

    expect(result.rakeAmount).toBe(0);
    expect(result.waived).toBe(true);
  });

  test('rake summary tracks totals', () => {
    const rake = resetRakeCalculator({ rakePercentage: 5, rakeCap: 100, noFlopNoRake: false });

    for (let i = 0; i < 5; i++) {
      const context = buildHandRakeContext({
        handId: `hand${i}`,
        tableId: 'table1',
        potSize: 100,
        finalStreet: 'flop',
        playersInHand: 3,
        playersAtShowdown: 2,
      });
      rake.calculateRake(context);
    }

    const summary = rake.getTableRakeSummary('table1');

    expect(summary.handsRaked).toBe(5);
    expect(summary.totalRakeCollected).toBe(25);
    expect(summary.averageRake).toBe(5);
  });
});

// ============================================================================
// Ledger Tests
// ============================================================================

describe('LedgerManager', () => {
  let ledger: LedgerManager;

  beforeEach(() => {
    ledger = resetLedgerManager();
  });

  test('records entries with hash chain', () => {
    ledger.setInitialBalance('player1', 1000);

    const entry1 = ledger.record({
      type: LedgerEntryType.BET,
      playerId: 'player1',
      amount: -100,
      reason: 'Bet',
      balanceAfter: 900,
    });

    const entry2 = ledger.record({
      type: LedgerEntryType.POT_WIN,
      playerId: 'player1',
      amount: 200,
      reason: 'Win',
      balanceAfter: 1100,
    });

    expect(entry2.previousHash).toBe(entry1.hash);
  });

  test('verifies hash chain integrity', () => {
    ledger.setInitialBalance('player1', 1000);

    ledger.record({
      type: LedgerEntryType.BET,
      playerId: 'player1',
      amount: -100,
      reason: 'Bet',
      balanceAfter: 900,
    });

    const integrity = ledger.verifyIntegrity();
    expect(integrity.valid).toBe(true);
  });

  test('queries by player', () => {
    ledger.setInitialBalance('player1', 1000);
    ledger.setInitialBalance('player2', 1000);

    ledger.record({
      type: LedgerEntryType.BET,
      playerId: 'player1',
      amount: -100,
      reason: 'Bet',
      balanceAfter: 900,
    });

    ledger.record({
      type: LedgerEntryType.BET,
      playerId: 'player2',
      amount: -50,
      reason: 'Bet',
      balanceAfter: 950,
    });

    const player1Entries = ledger.query({ playerId: 'player1' });
    expect(player1Entries.length).toBe(1);
  });

  test('queries by hand', () => {
    ledger.setInitialBalance('player1', 1000);

    ledger.record({
      type: LedgerEntryType.BET,
      playerId: 'player1',
      amount: -100,
      reason: 'Bet',
      handId: 'hand1',
      balanceAfter: 900,
    });

    ledger.record({
      type: LedgerEntryType.BET,
      playerId: 'player1',
      amount: -50,
      reason: 'Bet',
      handId: 'hand2',
      balanceAfter: 850,
    });

    const hand1Entries = ledger.query({ handId: 'hand1' });
    expect(hand1Entries.length).toBe(1);
  });

  test('prevents duplicate settlement', () => {
    ledger.recordSettlement(
      'settle1',
      'hand1',
      'table1',
      100,
      5,
      100,
      95,
      ['entry1']
    );

    expect(() => {
      ledger.recordSettlement(
        'settle1',
        'hand1',
        'table1',
        100,
        5,
        100,
        95,
        ['entry1']
      );
    }).toThrow();
  });

  test('replay determinism', () => {
    ledger.setInitialBalance('player1', 1000);
    ledger.setInitialBalance('player2', 1000);

    // Record a hand
    ledger.record({
      type: LedgerEntryType.BLIND_POST,
      playerId: 'player1',
      amount: -5,
      reason: 'Small blind',
      balanceAfter: 995,
    });

    ledger.record({
      type: LedgerEntryType.BLIND_POST,
      playerId: 'player2',
      amount: -10,
      reason: 'Big blind',
      balanceAfter: 990,
    });

    ledger.record({
      type: LedgerEntryType.POT_WIN,
      playerId: 'player1',
      amount: 15,
      reason: 'Win',
      balanceAfter: 1010,
    });

    // Expected final balances
    const expectedBalances = new Map<string, number>();
    expectedBalances.set('player1', 10); // -5 + 15 = 10 net
    expectedBalances.set('player2', -10); // -10 net

    const entries = ledger.export();
    const replayResult = ledger.replayEntries(entries, expectedBalances);

    expect(replayResult.valid).toBe(true);
  });

  test('verifies hand chip conservation', () => {
    ledger.setInitialBalance('player1', 1000);
    ledger.setInitialBalance('player2', 1000);

    // Simulate a hand where chips are conserved
    ledger.record({
      type: LedgerEntryType.BLIND_POST,
      playerId: 'player1',
      amount: -5,
      reason: 'SB',
      handId: 'hand1',
      balanceAfter: 995,
    });

    ledger.record({
      type: LedgerEntryType.BLIND_POST,
      playerId: 'player2',
      amount: -10,
      reason: 'BB',
      handId: 'hand1',
      balanceAfter: 990,
    });

    ledger.record({
      type: LedgerEntryType.POT_WIN,
      playerId: 'player1',
      amount: 15,
      reason: 'Win',
      handId: 'hand1',
      balanceAfter: 1010,
    });

    const conservation = ledger.verifyHandConservation('hand1');
    expect(conservation.valid).toBe(true);
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('EconomyEngine Integration', () => {
  test('complete hand with single pot settlement', () => {
    const { balance, escrow, pot, rake, ledger } = createTestEnvironment();
    const engine = new EconomyEngine({
      balanceManager: balance,
      escrowManager: escrow,
      potManager: pot,
      rakeCalculator: rake,
      ledgerManager: ledger,
    });

    // Setup players
    engine.initializePlayer('hero', 1000);
    engine.initializePlayer('villain', 1000);

    // Buy in
    engine.buyIn('table1', 'hero', 500);
    engine.buyIn('table1', 'villain', 500);

    // Start hand
    engine.startHand('hand1', 'table1');

    // Post blinds
    engine.postBlinds('hand1', 'table1', [
      { playerId: 'hero', amount: 5, type: 'small' },
      { playerId: 'villain', amount: 10, type: 'big' },
    ]);

    // Hero raises, villain calls
    engine.recordAction('hand1', 'table1', 'hero', 'raise', 25, 'preflop');
    engine.recordAction('hand1', 'table1', 'villain', 'call', 20, 'preflop');

    // Settle - hero wins
    const result = engine.settleHand({
      handId: 'hand1',
      tableId: 'table1',
      playerStates: [
        { playerId: 'hero', totalBet: 30, isAllIn: false, isFolded: false },
        { playerId: 'villain', totalBet: 30, isAllIn: false, isFolded: false },
      ],
      winnersByRank: new Map([['hero', 1], ['villain', 2]]),
      finalStreet: 'river',
      playersInHand: 2,
      playersAtShowdown: 2,
    });

    // 60 pot, 5% rake = 3, so 57 to hero
    expect(result.totalPot).toBe(60);
    expect(result.rakeCollected).toBe(3);
    expect(result.playerPayouts.get('hero')).toBe(57);

    // Verify stacks
    expect(engine.getPlayerStack('table1', 'hero')).toBe(527); // 500 - 30 + 57
    expect(engine.getPlayerStack('table1', 'villain')).toBe(470); // 500 - 30

    // Verify integrity
    const integrity = engine.verifyIntegrity();
    expect(integrity.valid).toBe(true);
  });

  test('complete hand with multiple side pots', () => {
    const { balance, escrow, pot, rake, ledger } = createTestEnvironment();
    const engine = new EconomyEngine({
      balanceManager: balance,
      escrowManager: escrow,
      potManager: pot,
      rakeCalculator: rake,
      ledgerManager: ledger,
    });

    // Setup players
    engine.initializePlayer('p1', 1000);
    engine.initializePlayer('p2', 1000);
    engine.initializePlayer('p3', 1000);

    // Buy in with different amounts
    engine.buyIn('table1', 'p1', 100);  // Short stack
    engine.buyIn('table1', 'p2', 200);  // Medium stack
    engine.buyIn('table1', 'p3', 300);  // Deep stack

    // Start hand
    engine.startHand('hand1', 'table1');

    // All players go all-in
    engine.postBlinds('hand1', 'table1', [
      { playerId: 'p1', amount: 5, type: 'small' },
      { playerId: 'p2', amount: 10, type: 'big' },
    ]);

    // p3 raises, p1 calls all-in, p2 calls all-in
    engine.recordAction('hand1', 'table1', 'p3', 'all-in', 300, 'preflop');
    engine.recordAction('hand1', 'table1', 'p1', 'all-in', 95, 'preflop');  // 100 - 5 already in
    engine.recordAction('hand1', 'table1', 'p2', 'all-in', 190, 'preflop'); // 200 - 10 already in

    // Settle - p1 has best hand and wins main pot
    // p2 has second best and wins side pot
    // p3 has worst hand
    const result = engine.settleHand({
      handId: 'hand1',
      tableId: 'table1',
      playerStates: [
        { playerId: 'p1', totalBet: 100, isAllIn: true, isFolded: false },
        { playerId: 'p2', totalBet: 200, isAllIn: true, isFolded: false },
        { playerId: 'p3', totalBet: 300, isAllIn: false, isFolded: false },
      ],
      winnersByRank: new Map([['p1', 1], ['p2', 2], ['p3', 3]]),
      finalStreet: 'river',
      playersInHand: 3,
      playersAtShowdown: 3,
    });

    // Total pot: 100 + 200 + 300 = 600
    // Rake on 600 at 5% capped at 3 = 3
    expect(result.totalPot).toBe(600);
    expect(result.rakeCollected).toBe(3);
  });

  test('split pot settlement', () => {
    const { balance, escrow, pot, rake, ledger } = createTestEnvironment();
    const engine = new EconomyEngine({
      balanceManager: balance,
      escrowManager: escrow,
      potManager: pot,
      rakeCalculator: rake,
      ledgerManager: ledger,
    });

    // Setup players
    engine.initializePlayer('p1', 1000);
    engine.initializePlayer('p2', 1000);

    engine.buyIn('table1', 'p1', 500);
    engine.buyIn('table1', 'p2', 500);

    engine.startHand('hand1', 'table1');

    engine.postBlinds('hand1', 'table1', [
      { playerId: 'p1', amount: 5, type: 'small' },
      { playerId: 'p2', amount: 10, type: 'big' },
    ]);

    engine.recordAction('hand1', 'table1', 'p1', 'call', 5, 'preflop');

    // Split pot - both have same rank
    const result = engine.settleHand({
      handId: 'hand1',
      tableId: 'table1',
      playerStates: [
        { playerId: 'p1', totalBet: 10, isAllIn: false, isFolded: false },
        { playerId: 'p2', totalBet: 10, isAllIn: false, isFolded: false },
      ],
      winnersByRank: new Map([['p1', 1], ['p2', 1]]),  // Same rank = split
      finalStreet: 'river',
      playersInHand: 2,
      playersAtShowdown: 2,
    });

    // 20 pot, 5% rake capped at 3 = 1 (5% of 20 = 1)
    // After rake: 19, split = 9 each with 1 extra to first
    expect(result.rakeCollected).toBe(1);

    const p1Payout = result.playerPayouts.get('p1') ?? 0;
    const p2Payout = result.playerPayouts.get('p2') ?? 0;
    expect(p1Payout + p2Payout).toBe(19);
  });

  test('no rake on preflop walk', () => {
    const { balance, escrow, pot, rake, ledger } = createTestEnvironment();
    const engine = new EconomyEngine({
      balanceManager: balance,
      escrowManager: escrow,
      potManager: pot,
      rakeCalculator: rake,
      ledgerManager: ledger,
    });

    engine.initializePlayer('p1', 1000);
    engine.initializePlayer('p2', 1000);

    engine.buyIn('table1', 'p1', 500);
    engine.buyIn('table1', 'p2', 500);

    engine.startHand('hand1', 'table1');

    engine.postBlinds('hand1', 'table1', [
      { playerId: 'p1', amount: 5, type: 'small' },
      { playerId: 'p2', amount: 10, type: 'big' },
    ]);

    // p1 folds preflop
    engine.playerFolded('hand1', 'p1');

    const result = engine.settleHand({
      handId: 'hand1',
      tableId: 'table1',
      playerStates: [
        { playerId: 'p1', totalBet: 5, isAllIn: false, isFolded: true },
        { playerId: 'p2', totalBet: 10, isAllIn: false, isFolded: false },
      ],
      winnersByRank: new Map([['p2', 1]]),
      finalStreet: 'preflop',
      playersInHand: 2,
      playersAtShowdown: 1,
    });

    expect(result.rakeCollected).toBe(0);
    expect(result.playerPayouts.get('p2')).toBe(15);
  });

  test('prevents double settlement', () => {
    const { balance, escrow, pot, rake, ledger } = createTestEnvironment();
    const engine = new EconomyEngine({
      balanceManager: balance,
      escrowManager: escrow,
      potManager: pot,
      rakeCalculator: rake,
      ledgerManager: ledger,
    });

    engine.initializePlayer('p1', 1000);
    engine.initializePlayer('p2', 1000);

    engine.buyIn('table1', 'p1', 500);
    engine.buyIn('table1', 'p2', 500);

    engine.startHand('hand1', 'table1');

    engine.postBlinds('hand1', 'table1', [
      { playerId: 'p1', amount: 5, type: 'small' },
      { playerId: 'p2', amount: 10, type: 'big' },
    ]);

    engine.recordAction('hand1', 'table1', 'p1', 'call', 5, 'preflop');

    const settlementParams = {
      handId: 'hand1',
      tableId: 'table1',
      playerStates: [
        { playerId: 'p1', totalBet: 10, isAllIn: false, isFolded: false },
        { playerId: 'p2', totalBet: 10, isAllIn: false, isFolded: false },
      ],
      winnersByRank: new Map([['p1', 1], ['p2', 2]]),
      finalStreet: 'river' as const,
      playersInHand: 2,
      playersAtShowdown: 2,
    };

    // First settlement succeeds
    engine.settleHand(settlementParams);

    // Second settlement should fail due to pot already settled
    expect(() => engine.settleHand(settlementParams)).toThrow();
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('Edge Cases', () => {
  test('handles zero rake configuration', () => {
    const rake = resetRakeCalculator({ rakePercentage: 0, rakeCap: 0, noFlopNoRake: false });

    const context = buildHandRakeContext({
      handId: 'hand1',
      tableId: 'table1',
      potSize: 1000,
      finalStreet: 'river',
      playersInHand: 2,
      playersAtShowdown: 2,
    });

    const result = rake.calculateRake(context);
    expect(result.rakeAmount).toBe(0);
    expect(result.waived).toBe(true);
  });

  test('handles single player scenario', () => {
    const contributions: PlayerContributionInfo[] = [
      { playerId: 'p1', totalContribution: 100, isAllIn: false, isFolded: false },
    ];

    const result = SidePotCalculator.calculate('hand1', contributions);

    expect(result.pots.length).toBe(1);
    expect(result.pots[0].amount).toBe(100);
    expect(result.pots[0].eligiblePlayers).toEqual(['p1']);
  });

  test('handles large pot sizes', () => {
    const balance = resetBalanceManager();
    const escrow = resetEscrowManager(balance);

    balance.createBalance('player1', 1000000000);
    escrow.buyIn('table1', 'player1', 500000000);

    expect(escrow.getStack('table1', 'player1')).toBe(500000000);
    expect(balance.getBalance('player1').locked).toBe(500000000);
  });

  test('handles rapid consecutive operations', () => {
    const balance = resetBalanceManager();
    balance.createBalance('player1', 1000);

    for (let i = 0; i < 100; i++) {
      balance.credit('player1', 10);
      balance.debit('player1', 5);
    }

    expect(balance.getBalance('player1').available).toBe(1500);
  });
});
