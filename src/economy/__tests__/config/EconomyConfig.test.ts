/**
 * EconomyConfig.test.ts
 * Phase 15 - Tests for configurable economy system
 *
 * Coverage:
 * - Config creation and validation
 * - Changing rake config does not affect pot math
 * - Same hand + different config → different rake, same winner
 * - Rake cap enforcement
 * - No-flop-no-rake enforcement
 * - Bonus credit isolation
 * - Ledger consistency after config change
 * - Deterministic replay with config hash
 */

import {
  EconomyConfig,
  EconomyConfigBuilder,
  createDefaultConfig,
  createConfigBuilder,
  DEFAULT_RAKE_CONFIG,
  DEFAULT_BUY_IN_CONFIG,
} from '../../config/EconomyConfig';

import { EconomyConfigErrors } from '../../config/EconomyConfigErrors';

import {
  RakePolicyEvaluator,
  StandardRakePolicy,
  StreetBasedRakePolicy,
  ZeroRakePolicy,
  TieredRakePolicy,
  createRakeEvaluator,
  RakeContext,
} from '../../config/RakePolicy';

import {
  BuyInPolicyEvaluator,
  createBuyInEvaluator,
  BuyInContext,
} from '../../config/BuyInPolicy';

import {
  RechargePolicyEvaluator,
  RechargeTracker,
  createRechargeEvaluator,
  createRechargeTracker,
  RechargeContext,
} from '../../config/RechargePolicy';

import {
  ConfigurableEconomyEngine,
  resetConfigurableEconomyEngine,
  SettlementContext,
} from '../../config';

import {
  resetBalanceManager,
  resetEscrowManager,
  resetLedgerManager,
} from '../../index';

// ============================================================================
// Test Setup
// ============================================================================

function createTestEnvironment() {
  const balance = resetBalanceManager();
  const escrow = resetEscrowManager(balance);
  const ledger = resetLedgerManager();
  return { balance, escrow, ledger };
}

// ============================================================================
// EconomyConfig Tests
// ============================================================================

describe('EconomyConfig', () => {
  test('creates default config', () => {
    const config = createDefaultConfig();

    expect(config.rake.defaultPercentage).toBe(DEFAULT_RAKE_CONFIG.defaultPercentage);
    expect(config.rake.defaultCap).toBe(DEFAULT_RAKE_CONFIG.defaultCap);
    expect(config.buyIn.minBuyIn).toBe(DEFAULT_BUY_IN_CONFIG.minBuyIn);
  });

  test('creates config with builder', () => {
    const config = createConfigBuilder()
      .withRake({ defaultPercentage: 10, defaultCap: 5 })
      .withBuyIn({ minBuyIn: 50, maxBuyIn: 500 })
      .withVersion('2.0.0')
      .build();

    expect(config.rake.defaultPercentage).toBe(10);
    expect(config.rake.defaultCap).toBe(5);
    expect(config.buyIn.minBuyIn).toBe(50);
    expect(config.version).toBe('2.0.0');
  });

  test('config is immutable - withUpdates creates new instance', () => {
    const config1 = createDefaultConfig();
    const config2 = config1.withUpdates({ rake: { ...config1.rake, defaultPercentage: 10 } });

    expect(config1.rake.defaultPercentage).toBe(5);
    expect(config2.rake.defaultPercentage).toBe(10);
    expect(config1.configId).not.toBe(config2.configId);
  });

  test('config hash is deterministic', () => {
    const config1 = new EconomyConfig({
      rake: { ...DEFAULT_RAKE_CONFIG, defaultPercentage: 5 },
    });
    const config2 = new EconomyConfig({
      rake: { ...DEFAULT_RAKE_CONFIG, defaultPercentage: 5 },
    });

    expect(config1.configHash).toBe(config2.configHash);
  });

  test('different config produces different hash', () => {
    const config1 = createConfigBuilder().withRake({ defaultPercentage: 5 }).build();
    const config2 = createConfigBuilder().withRake({ defaultPercentage: 10 }).build();

    expect(config1.configHash).not.toBe(config2.configHash);
  });

  test('serialization and deserialization', () => {
    const original = createConfigBuilder()
      .withRake({ defaultPercentage: 7, defaultCap: 4 })
      .withBuyIn({ minBuyIn: 30 })
      .build();

    const json = original.toJSONWithHash();
    const restored = EconomyConfig.fromJSONWithHashVerification(json);

    expect(restored.rake.defaultPercentage).toBe(7);
    expect(restored.buyIn.minBuyIn).toBe(30);
    expect(restored.configHash).toBe(original.configHash);
  });

  test('hash verification detects tampering', () => {
    const original = createDefaultConfig();
    const json = original.toJSONWithHash();

    // Tamper with data
    const tampered = {
      ...json,
      rake: { ...json.rake, defaultPercentage: 99 },
    };

    expect(() => EconomyConfig.fromJSONWithHashVerification(tampered)).toThrow();
  });

  test('validates rake percentage range', () => {
    expect(() => createConfigBuilder().withRake({ defaultPercentage: -5 }).build()).toThrow();
    expect(() => createConfigBuilder().withRake({ defaultPercentage: 150 }).build()).toThrow();
  });

  test('validates buy-in range', () => {
    expect(() => createConfigBuilder().withBuyIn({ minBuyIn: 100, maxBuyIn: 50 }).build()).toThrow();
  });
});

// ============================================================================
// RakePolicy Tests
// ============================================================================

describe('RakePolicy', () => {
  test('standard policy calculates percentage rake', () => {
    const config = createConfigBuilder()
      .withRake({ defaultPercentage: 5, defaultCap: 100, noFlopNoRake: false })
      .build();

    const evaluator = createRakeEvaluator(config);
    const context: RakeContext = {
      potSize: 100,
      finalStreet: 'river',
      flopSeen: true,
      isUncontested: false,
      playersInHand: 3,
      playersAtShowdown: 2,
    };

    const result = evaluator.evaluate(context);

    expect(result.rakeAmount).toBe(5);
    expect(result.potAfterRake).toBe(95);
    expect(result.policyUsed).toBe('standard');
  });

  test('rake cap is enforced', () => {
    const config = createConfigBuilder()
      .withRake({ defaultPercentage: 10, defaultCap: 3, noFlopNoRake: false })
      .build();

    const evaluator = createRakeEvaluator(config);
    const context: RakeContext = {
      potSize: 100,
      finalStreet: 'river',
      flopSeen: true,
      isUncontested: false,
      playersInHand: 2,
      playersAtShowdown: 2,
    };

    const result = evaluator.evaluate(context);

    expect(result.rakeAmount).toBe(3);
    expect(result.capApplied).toBe(true);
  });

  test('no-flop-no-rake waives rake', () => {
    const config = createConfigBuilder()
      .withRake({ defaultPercentage: 5, defaultCap: 100, noFlopNoRake: true })
      .build();

    const evaluator = createRakeEvaluator(config);
    const context: RakeContext = {
      potSize: 100,
      finalStreet: 'preflop',
      flopSeen: false,
      isUncontested: false,
      playersInHand: 2,
      playersAtShowdown: 1,
    };

    const result = evaluator.evaluate(context);

    expect(result.rakeAmount).toBe(0);
    expect(result.waived).toBe(true);
    expect(result.waivedReason).toContain('No flop');
  });

  test('uncontested pot exemption', () => {
    const config = createConfigBuilder()
      .withRake({ defaultPercentage: 5, defaultCap: 100, excludeUncontested: true, noFlopNoRake: false })
      .build();

    const evaluator = createRakeEvaluator(config);
    const context: RakeContext = {
      potSize: 15,
      finalStreet: 'preflop',
      flopSeen: false,
      isUncontested: true,
      playersInHand: 2,
      playersAtShowdown: 1,
    };

    const result = evaluator.evaluate(context);

    expect(result.rakeAmount).toBe(0);
    expect(result.waived).toBe(true);
  });

  test('zero rake policy', () => {
    const config = createConfigBuilder()
      .withRake({ defaultPercentage: 0 })
      .build();

    const evaluator = createRakeEvaluator(config);
    const context: RakeContext = {
      potSize: 1000,
      finalStreet: 'river',
      flopSeen: true,
      isUncontested: false,
      playersInHand: 2,
      playersAtShowdown: 2,
    };

    const result = evaluator.evaluate(context);

    expect(result.rakeAmount).toBe(0);
  });

  test('tiered rake policy', () => {
    const tiers = [
      { minPot: 0, maxPot: 100, percentage: 3, cap: 2 },
      { minPot: 100, maxPot: 500, percentage: 5, cap: 5 },
      { minPot: 500, maxPot: Infinity, percentage: 7, cap: 10 },
    ];

    const policy = new TieredRakePolicy(tiers);
    const config = createDefaultConfig();

    const smallPot: RakeContext = {
      potSize: 50,
      finalStreet: 'river',
      flopSeen: true,
      isUncontested: false,
      playersInHand: 2,
      playersAtShowdown: 2,
    };

    const mediumPot: RakeContext = {
      ...smallPot,
      potSize: 200,
    };

    const largePot: RakeContext = {
      ...smallPot,
      potSize: 1000,
    };

    const smallResult = policy.evaluate(smallPot, config.rake);
    const mediumResult = policy.evaluate(mediumPot, config.rake);
    const largeResult = policy.evaluate(largePot, config.rake);

    expect(smallResult.rakeAmount).toBe(1); // 3% of 50 = 1.5, floored = 1
    expect(mediumResult.rakeAmount).toBe(5); // 5% of 200 = 10, capped at 5
    expect(largeResult.rakeAmount).toBe(10); // 7% of 1000 = 70, capped at 10
  });

  test('changing config does not affect pot math', () => {
    const config1 = createConfigBuilder().withRake({ defaultPercentage: 5, defaultCap: 3 }).build();
    const config2 = createConfigBuilder().withRake({ defaultPercentage: 10, defaultCap: 5 }).build();

    const evaluator1 = createRakeEvaluator(config1);
    const evaluator2 = createRakeEvaluator(config2);

    const context: RakeContext = {
      potSize: 100,
      finalStreet: 'river',
      flopSeen: true,
      isUncontested: false,
      playersInHand: 2,
      playersAtShowdown: 2,
    };

    const result1 = evaluator1.evaluate(context);
    const result2 = evaluator2.evaluate(context);

    // Pot size remains same, rake differs
    expect(context.potSize).toBe(100);
    expect(result1.rakeAmount).toBe(3); // 5% capped at 3
    expect(result2.rakeAmount).toBe(5); // 10% capped at 5
  });

  test('same hand different config produces different rake same winner logic', () => {
    const lowRakeConfig = createConfigBuilder().withRake({ defaultPercentage: 2, defaultCap: 100 }).build();
    const highRakeConfig = createConfigBuilder().withRake({ defaultPercentage: 10, defaultCap: 100 }).build();

    const context: RakeContext = {
      potSize: 200,
      finalStreet: 'river',
      flopSeen: true,
      isUncontested: false,
      playersInHand: 3,
      playersAtShowdown: 2,
    };

    const lowResult = createRakeEvaluator(lowRakeConfig).evaluate(context);
    const highResult = createRakeEvaluator(highRakeConfig).evaluate(context);

    // Different rake, but pot distribution logic is independent
    expect(lowResult.rakeAmount).toBe(4);  // 2% of 200
    expect(highResult.rakeAmount).toBe(20); // 10% of 200
    expect(lowResult.potAfterRake).toBe(196);
    expect(highResult.potAfterRake).toBe(180);
  });

  test('promotional waiver works', () => {
    const config = createConfigBuilder()
      .withRake({
        defaultPercentage: 5,
        promotionalWaiver: {
          enabled: true,
          waiverId: 'promo-2024',
          expiresAt: Date.now() + 86400000, // 24 hours from now
        },
      })
      .build();

    const evaluator = createRakeEvaluator(config);
    const context: RakeContext = {
      potSize: 100,
      finalStreet: 'river',
      flopSeen: true,
      isUncontested: false,
      playersInHand: 2,
      playersAtShowdown: 2,
    };

    const result = evaluator.evaluate(context);

    expect(result.rakeAmount).toBe(0);
    expect(result.waived).toBe(true);
    expect(result.waivedReason).toContain('promo-2024');
  });
});

// ============================================================================
// BuyInPolicy Tests
// ============================================================================

describe('BuyInPolicy', () => {
  test('validates minimum buy-in', () => {
    const config = createConfigBuilder()
      .withBuyIn({ minBuyIn: 50, maxBuyIn: 500 })
      .build();

    const evaluator = createBuyInEvaluator(config);
    const context: BuyInContext = {
      playerId: 'player1',
      tableId: 'table1',
      amount: 30,
      availableBalance: 1000,
      currentStack: 0,
      isFirstBuy: true,
    };

    const result = evaluator.validateBuyIn(context);

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('below minimum');
  });

  test('validates maximum buy-in', () => {
    const config = createConfigBuilder()
      .withBuyIn({ minBuyIn: 50, maxBuyIn: 500 })
      .build();

    const evaluator = createBuyInEvaluator(config);
    const context: BuyInContext = {
      playerId: 'player1',
      tableId: 'table1',
      amount: 600,
      availableBalance: 1000,
      currentStack: 0,
      isFirstBuy: true,
    };

    const result = evaluator.validateBuyIn(context);

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('exceeds maximum');
  });

  test('validates balance', () => {
    const config = createDefaultConfig();
    const evaluator = createBuyInEvaluator(config);

    const context: BuyInContext = {
      playerId: 'player1',
      tableId: 'table1',
      amount: 100,
      availableBalance: 50,
      currentStack: 0,
      isFirstBuy: true,
    };

    const result = evaluator.validateBuyIn(context);

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('exceeds available');
  });

  test('calculates first-buy bonus', () => {
    const config = createConfigBuilder()
      .withBuyIn({
        minBuyIn: 20,
        maxBuyIn: 200,
        firstBuyBonus: {
          enabled: true,
          bonusPercentage: 100,
          maxBonus: 50,
          bonusId: 'first-buy-bonus',
        },
      })
      .build();

    const evaluator = createBuyInEvaluator(config);

    // First buy gets bonus
    const context: BuyInContext = {
      playerId: 'player1',
      tableId: 'table1',
      amount: 100,
      availableBalance: 1000,
      currentStack: 0,
      isFirstBuy: true,
    };

    const result = evaluator.validateBuyIn(context);

    expect(result.valid).toBe(true);
    expect(result.bonusAmount).toBe(50); // 100% of 100 = 100, capped at 50
    expect(result.bonusId).toBe('first-buy-bonus');
  });

  test('rebuy validation', () => {
    const config = createConfigBuilder()
      .withBuyIn({
        allowRebuy: true,
        rebuyMinStack: 20,
        rebuyMaxStack: 100,
      })
      .build();

    const evaluator = createBuyInEvaluator(config);

    // Stack above threshold - no rebuy
    const highStack = evaluator.validateRebuy({
      playerId: 'p1',
      tableId: 't1',
      amount: 50,
      currentStack: 50,
      availableBalance: 1000,
    });

    expect(highStack.valid).toBe(false);

    // Stack below threshold - rebuy allowed
    const lowStack = evaluator.validateRebuy({
      playerId: 'p1',
      tableId: 't1',
      amount: 50,
      currentStack: 10,
      availableBalance: 1000,
    });

    expect(lowStack.valid).toBe(true);
    expect(lowStack.adjustedAmount).toBe(50);
  });
});

// ============================================================================
// RechargePolicy Tests
// ============================================================================

describe('RechargePolicy', () => {
  test('validates minimum recharge', () => {
    const config = createConfigBuilder()
      .withRecharge({ minRecharge: 100, maxRecharge: 10000 })
      .build();

    const evaluator = createRechargeEvaluator(config);
    const context: RechargeContext = {
      playerId: 'player1',
      amount: 50,
      currentBalance: 0,
    };

    const result = evaluator.validateRecharge(context);

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('below minimum');
  });

  test('enforces cooldown', () => {
    const config = createConfigBuilder()
      .withRecharge({ cooldownMs: 60000 }) // 1 minute cooldown
      .build();

    const tracker = createRechargeTracker();
    const evaluator = createRechargeEvaluator(config, tracker);

    const now = Date.now();

    // First recharge succeeds
    const first = evaluator.executeRecharge({
      playerId: 'player1',
      amount: 100,
      currentBalance: 0,
      timestamp: now,
    });

    expect(first.amount).toBe(100);

    // Second recharge within cooldown fails
    const second = evaluator.validateRecharge({
      playerId: 'player1',
      amount: 100,
      currentBalance: 100,
      timestamp: now + 30000, // 30 seconds later
    });

    expect(second.valid).toBe(false);
    expect(second.reason).toContain('Cooldown');
  });

  test('calculates recharge bonus', () => {
    const config = createConfigBuilder()
      .withRecharge({
        bonusCredit: {
          enabled: true,
          percentage: 50,
          maxBonus: 100,
          lockedUntilWagered: true,
          wagerMultiplier: 3,
        },
      })
      .build();

    const evaluator = createRechargeEvaluator(config);
    const context: RechargeContext = {
      playerId: 'player1',
      amount: 100,
      currentBalance: 0,
    };

    const result = evaluator.validateRecharge(context);

    expect(result.valid).toBe(true);
    expect(result.bonusAmount).toBe(50); // 50% of 100
    expect(result.bonusLocked).toBe(true);
  });

  test('bonus credit isolation', () => {
    const config = createConfigBuilder()
      .withRecharge({
        bonusCredit: {
          enabled: true,
          percentage: 100,
          maxBonus: 100,
          lockedUntilWagered: true,
          wagerMultiplier: 3,
        },
      })
      .build();

    const tracker = createRechargeTracker();
    const evaluator = createRechargeEvaluator(config, tracker);

    // Player 1 recharge
    evaluator.executeRecharge({
      playerId: 'player1',
      amount: 100,
      currentBalance: 0,
    });

    // Player 2 recharge
    evaluator.executeRecharge({
      playerId: 'player2',
      amount: 50,
      currentBalance: 0,
    });

    // Bonuses are isolated
    expect(evaluator.getLockedBonusTotal('player1')).toBe(100);
    expect(evaluator.getLockedBonusTotal('player2')).toBe(50);
  });

  test('bonus unlock through wagering', () => {
    const config = createConfigBuilder()
      .withRecharge({
        bonusCredit: {
          enabled: true,
          percentage: 100,
          maxBonus: 100,
          lockedUntilWagered: true,
          wagerMultiplier: 3,
        },
      })
      .build();

    const tracker = createRechargeTracker();
    const evaluator = createRechargeEvaluator(config, tracker);

    evaluator.executeRecharge({
      playerId: 'player1',
      amount: 100,
      currentBalance: 0,
    });

    // Bonus is locked
    expect(evaluator.getLockedBonusTotal('player1')).toBe(100);

    // Wager enough to unlock (100 * 3 = 300 required)
    evaluator.recordWagerForBonus('player1', 300);

    // Bonus should be unlocked
    expect(evaluator.getLockedBonusTotal('player1')).toBe(0);
  });
});

// ============================================================================
// ConfigurableEconomyEngine Tests
// ============================================================================

describe('ConfigurableEconomyEngine', () => {
  test('settlement with rake', () => {
    const { balance, escrow, ledger } = createTestEnvironment();

    const config = createConfigBuilder()
      .withRake({ defaultPercentage: 5, defaultCap: 10, noFlopNoRake: false })
      .build();

    const engine = new ConfigurableEconomyEngine({
      config,
      balanceManager: balance,
      escrowManager: escrow,
      ledgerManager: ledger,
    });

    const context: SettlementContext = {
      handId: 'hand1',
      tableId: 'table1',
      potSize: 100,
      finalStreet: 'river',
      flopSeen: true,
      isUncontested: false,
      playersInHand: 2,
      playersAtShowdown: 2,
      winnerPayouts: new Map([['player1', 100]]),
    };

    const result = engine.settleHand(context);

    expect(result.rakeEvaluation.rakeAmount).toBe(5);
    expect(result.adjustedPayouts.get('player1')).toBe(95);
    expect(result.configHash).toBe(config.configHash);
  });

  test('ledger consistency after config change', () => {
    const { balance, escrow, ledger } = createTestEnvironment();

    // First config
    const config1 = createConfigBuilder()
      .withRake({ defaultPercentage: 5 })
      .build();

    const engine1 = new ConfigurableEconomyEngine({
      config: config1,
      balanceManager: balance,
      escrowManager: escrow,
      ledgerManager: ledger,
    });

    const context1: SettlementContext = {
      handId: 'hand1',
      tableId: 'table1',
      potSize: 100,
      finalStreet: 'river',
      flopSeen: true,
      isUncontested: false,
      playersInHand: 2,
      playersAtShowdown: 2,
      winnerPayouts: new Map([['player1', 100]]),
    };

    const result1 = engine1.settleHand(context1);

    // Change config
    const config2 = createConfigBuilder()
      .withRake({ defaultPercentage: 10 })
      .build();

    const engine2 = engine1.withConfig(config2);

    const context2: SettlementContext = {
      ...context1,
      handId: 'hand2',
    };

    const result2 = engine2.settleHand(context2);

    // Both recorded in same ledger with different config hashes
    expect(result1.configHash).toBe(config1.configHash);
    expect(result2.configHash).toBe(config2.configHash);
    expect(result1.configHash).not.toBe(result2.configHash);

    // Ledger integrity maintained
    const integrity = ledger.verifyIntegrity();
    expect(integrity.valid).toBe(true);
  });

  test('deterministic replay with config hash', () => {
    const { balance, escrow, ledger } = createTestEnvironment();

    const config = createConfigBuilder()
      .withRake({ defaultPercentage: 5, defaultCap: 3 })
      .build();

    const engine = new ConfigurableEconomyEngine({
      config,
      balanceManager: balance,
      escrowManager: escrow,
      ledgerManager: ledger,
    });

    const context: SettlementContext = {
      handId: 'hand1',
      tableId: 'table1',
      potSize: 200,
      finalStreet: 'river',
      flopSeen: true,
      isUncontested: false,
      playersInHand: 2,
      playersAtShowdown: 2,
      winnerPayouts: new Map([['player1', 200]]),
    };

    // First settlement
    const result1 = engine.settleHand(context);

    // Reset and replay with same config
    const { balance: balance2, escrow: escrow2, ledger: ledger2 } = createTestEnvironment();

    // Restore config from hash
    const restoredConfig = new EconomyConfig({
      rake: { ...DEFAULT_RAKE_CONFIG, defaultPercentage: 5, defaultCap: 3 },
    });

    expect(restoredConfig.configHash).toBe(config.configHash);

    const engine2 = new ConfigurableEconomyEngine({
      config: restoredConfig,
      balanceManager: balance2,
      escrowManager: escrow2,
      ledgerManager: ledger2,
    });

    const context2: SettlementContext = {
      ...context,
      handId: 'hand2', // Different hand ID but same scenario
    };

    const result2 = engine2.settleHand(context2);

    // Same config hash produces same rake result
    expect(result1.rakeEvaluation.rakeAmount).toBe(result2.rakeEvaluation.rakeAmount);
    expect(result1.configHash).toBe(result2.configHash);
  });

  test('policy info retrieval', () => {
    const config = createConfigBuilder()
      .withVersion('2.5.0')
      .withRake({ defaultPercentage: 5 })
      .build();

    const engine = resetConfigurableEconomyEngine(config);
    const info = engine.getPolicyInfo();

    expect(info.rakePolicy).toBe('standard');
    expect(info.configVersion).toBe('2.5.0');
    expect(info.configHash).toBe(config.configHash);
  });

  test('buy-in and recharge integration', () => {
    const { balance, escrow, ledger } = createTestEnvironment();

    balance.createBalance('player1', 1000);

    const config = createConfigBuilder()
      .withBuyIn({ minBuyIn: 50, maxBuyIn: 500 })
      .withRecharge({ minRecharge: 10, maxRecharge: 1000 })
      .build();

    const engine = new ConfigurableEconomyEngine({
      config,
      balanceManager: balance,
      escrowManager: escrow,
      ledgerManager: ledger,
    });

    // Validate buy-in
    const buyInValid = engine.validateBuyIn({
      playerId: 'player1',
      tableId: 'table1',
      amount: 100,
      availableBalance: 1000,
      currentStack: 0,
      isFirstBuy: true,
    });

    expect(buyInValid.valid).toBe(true);

    // Check limits
    const buyInLimits = engine.getBuyInLimits();
    expect(buyInLimits.min).toBe(50);
    expect(buyInLimits.max).toBe(500);

    const rechargeLimits = engine.getRechargeLimits();
    expect(rechargeLimits.minRecharge).toBe(10);
    expect(rechargeLimits.maxRecharge).toBe(1000);
  });
});

// ============================================================================
// Error Handling Tests
// ============================================================================

describe('EconomyConfigErrors', () => {
  test('errors are deterministic and have codes', () => {
    const error = EconomyConfigErrors.buyInBelowMinimum(30, 50);

    expect(error.code).toBe('BUY_IN_BELOW_MINIMUM');
    expect(error.details.amount).toBe(30);
    expect(error.details.minimum).toBe(50);
    expect(error.timestamp).toBeDefined();
  });

  test('errors serialize to JSON', () => {
    const error = EconomyConfigErrors.invalidRakePercentage(150);
    const json = error.toJSON();

    expect(json.code).toBeDefined();
    expect(json.message).toBeDefined();
    expect(json.details).toBeDefined();
  });

  test('specific error types', () => {
    expect(EconomyConfigErrors.buyInBelowMinimum(10, 20).name).toBe('BuyInViolationError');
    expect(EconomyConfigErrors.rechargeBelowMinimum(5, 10).name).toBe('RechargeViolationError');
    expect(EconomyConfigErrors.bonusExpired('bonus1', Date.now()).name).toBe('BonusMisconfigurationError');
  });
});
