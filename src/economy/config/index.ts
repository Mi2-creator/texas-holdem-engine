/**
 * Economy Config Module
 * Phase 15 - Configurable economy & monetization layer
 *
 * Central configuration for all economy rules:
 * - Rake policies
 * - Buy-in rules
 * - Recharge handling
 * - Bonus credits
 * - Service fees
 */

// ============================================================================
// Errors
// ============================================================================

export {
  EconomyConfigError,
  EconomyConfigErrorCode,
  InvalidRakeConfigError,
  BuyInViolationError,
  RechargeViolationError,
  BonusMisconfigurationError,
  EconomyConfigErrors,
} from './EconomyConfigErrors';

// ============================================================================
// Configuration
// ============================================================================

export {
  ConfigId,
  ConfigVersion,
  StreetRakeConfig,
  RakeRulesConfig,
  BuyInRulesConfig,
  RechargeRulesConfig,
  BonusRulesConfig,
  FeeRulesConfig,
  EconomyConfigData,
  DEFAULT_RAKE_CONFIG,
  DEFAULT_BUY_IN_CONFIG,
  DEFAULT_RECHARGE_CONFIG,
  DEFAULT_BONUS_CONFIG,
  DEFAULT_FEE_CONFIG,
  EconomyConfig,
  EconomyConfigBuilder,
  createDefaultConfig,
  createConfigBuilder,
} from './EconomyConfig';

// ============================================================================
// Rake Policy
// ============================================================================

export {
  RakeContext,
  RakeEvaluation,
  RakePolicyStrategy,
  StandardRakePolicy,
  StreetBasedRakePolicy,
  ZeroRakePolicy,
  TieredRakePolicy,
  TieredRakeConfig,
  RakePolicyEvaluator,
  createRakeEvaluator,
  createStandardRakePolicy,
  createStreetBasedRakePolicy,
  createZeroRakePolicy,
  createTieredRakePolicy,
} from './RakePolicy';

// ============================================================================
// Buy-In Policy
// ============================================================================

export {
  BuyInContext,
  BuyInValidation,
  BuyInResult,
  RebuyContext,
  TopUpContext,
  BuyInPolicyEvaluator,
  TableBuyInOverride,
  TableBuyInPolicy,
  createBuyInEvaluator,
  createTableBuyInPolicy,
} from './BuyInPolicy';

// ============================================================================
// Recharge Policy
// ============================================================================

export {
  RechargeId,
  BonusCreditId,
  RechargeContext,
  RechargeValidation,
  RechargeResult,
  BonusCredit,
  PlayerRechargeHistory,
  RechargeTracker,
  RechargePolicyEvaluator,
  createRechargeEvaluator,
  createRechargeTracker,
} from './RechargePolicy';

// ============================================================================
// Configurable Economy Engine
// ============================================================================

import { PlayerId } from '../../security/Identity';
import { TableId, HandId } from '../../security/AuditLog';
import { Street } from '../../game/engine/TableState';
import { BalanceManager, getBalanceManager } from '../Balance';
import { EscrowManager, getEscrowManager } from '../Escrow';
import { LedgerManager, getLedgerManager, LedgerEntryType } from '../Ledger';
import { EconomyConfig, createDefaultConfig } from './EconomyConfig';
import { RakePolicyEvaluator, RakeContext, RakeEvaluation, createRakeEvaluator } from './RakePolicy';
import { BuyInPolicyEvaluator, BuyInContext, createBuyInEvaluator } from './BuyInPolicy';
import { RechargePolicyEvaluator, RechargeContext, RechargeTracker, createRechargeEvaluator, createRechargeTracker } from './RechargePolicy';

/**
 * Settlement context for hand completion
 */
export interface SettlementContext {
  readonly handId: HandId;
  readonly tableId: TableId;
  readonly potSize: number;
  readonly finalStreet: Street;
  readonly flopSeen: boolean;
  readonly isUncontested: boolean;
  readonly playersInHand: number;
  readonly playersAtShowdown: number;
  readonly winnerPayouts: ReadonlyMap<PlayerId, number>;
}

/**
 * Settlement result
 */
export interface ConfigurableSettlementResult {
  readonly handId: HandId;
  readonly rakeEvaluation: RakeEvaluation;
  readonly adjustedPayouts: Map<PlayerId, number>;
  readonly configHash: string;
}

/**
 * Configurable Economy Engine
 *
 * Pure orchestration layer that applies configuration and policies
 * to all economy operations. No state of its own - fully deterministic.
 */
export class ConfigurableEconomyEngine {
  private config: EconomyConfig;
  private balanceManager: BalanceManager;
  private escrowManager: EscrowManager;
  private ledgerManager: LedgerManager;
  private rakeEvaluator: RakePolicyEvaluator;
  private buyInEvaluator: BuyInPolicyEvaluator;
  private rechargeEvaluator: RechargePolicyEvaluator;
  private rechargeTracker: RechargeTracker;

  constructor(options?: {
    config?: EconomyConfig;
    balanceManager?: BalanceManager;
    escrowManager?: EscrowManager;
    ledgerManager?: LedgerManager;
  }) {
    this.config = options?.config ?? createDefaultConfig();
    this.balanceManager = options?.balanceManager ?? getBalanceManager();
    this.escrowManager = options?.escrowManager ?? getEscrowManager();
    this.ledgerManager = options?.ledgerManager ?? getLedgerManager();
    this.rechargeTracker = createRechargeTracker();

    this.rakeEvaluator = createRakeEvaluator(this.config);
    this.buyInEvaluator = createBuyInEvaluator(this.config, this.ledgerManager);
    this.rechargeEvaluator = createRechargeEvaluator(
      this.config,
      this.rechargeTracker,
      this.ledgerManager
    );
  }

  /**
   * Get current configuration
   */
  getConfig(): EconomyConfig {
    return this.config;
  }

  /**
   * Get configuration hash
   */
  getConfigHash(): string {
    return this.config.configHash;
  }

  /**
   * Update configuration (creates new instance)
   */
  withConfig(config: EconomyConfig): ConfigurableEconomyEngine {
    return new ConfigurableEconomyEngine({
      config,
      balanceManager: this.balanceManager,
      escrowManager: this.escrowManager,
      ledgerManager: this.ledgerManager,
    });
  }

  /**
   * Evaluate rake for a pot (does not apply it)
   */
  evaluateRake(context: RakeContext): RakeEvaluation {
    return this.rakeEvaluator.evaluate(context);
  }

  /**
   * Settle a hand with rake applied
   */
  settleHand(context: SettlementContext): ConfigurableSettlementResult {
    const rakeContext: RakeContext = {
      potSize: context.potSize,
      finalStreet: context.finalStreet,
      flopSeen: context.flopSeen,
      isUncontested: context.isUncontested,
      playersInHand: context.playersInHand,
      playersAtShowdown: context.playersAtShowdown,
      handId: context.handId,
      tableId: context.tableId,
    };

    const rakeEvaluation = this.rakeEvaluator.evaluate(rakeContext);
    const potAfterRake = rakeEvaluation.potAfterRake;

    // Adjust payouts proportionally for rake
    const adjustedPayouts = new Map<PlayerId, number>();
    const totalRawPayouts = Array.from(context.winnerPayouts.values()).reduce((a, b) => a + b, 0);

    if (totalRawPayouts > 0) {
      let totalDistributed = 0;
      let firstWinner: PlayerId | null = null;

      for (const [playerId, rawPayout] of context.winnerPayouts) {
        const adjustedPayout = Math.floor((rawPayout * potAfterRake) / totalRawPayouts);
        adjustedPayouts.set(playerId, adjustedPayout);
        totalDistributed += adjustedPayout;
        if (firstWinner === null && adjustedPayout > 0) {
          firstWinner = playerId;
        }
      }

      // Distribute remainder to first winner
      const remainder = potAfterRake - totalDistributed;
      if (remainder > 0 && firstWinner) {
        adjustedPayouts.set(firstWinner, (adjustedPayouts.get(firstWinner) ?? 0) + remainder);
      }
    }

    // Record rake in ledger
    if (rakeEvaluation.rakeAmount > 0) {
      this.ledgerManager.recordRake(
        'rake_account',
        rakeEvaluation.rakeAmount,
        context.handId,
        context.tableId
      );
    }

    return {
      handId: context.handId,
      rakeEvaluation,
      adjustedPayouts,
      configHash: this.config.configHash,
    };
  }

  /**
   * Validate and execute buy-in
   */
  processBuyIn(context: BuyInContext) {
    return this.buyInEvaluator.executeBuyIn(context);
  }

  /**
   * Validate buy-in without executing
   */
  validateBuyIn(context: BuyInContext) {
    return this.buyInEvaluator.validateBuyIn(context);
  }

  /**
   * Validate and execute recharge
   */
  processRecharge(context: RechargeContext) {
    return this.rechargeEvaluator.executeRecharge(context);
  }

  /**
   * Validate recharge without executing
   */
  validateRecharge(context: RechargeContext) {
    return this.rechargeEvaluator.validateRecharge(context);
  }

  /**
   * Get player's locked bonus total
   */
  getLockedBonusTotal(playerId: PlayerId): number {
    return this.rechargeEvaluator.getLockedBonusTotal(playerId);
  }

  /**
   * Record wager for bonus unlock
   */
  recordWagerForBonus(playerId: PlayerId, wagerAmount: number): number {
    return this.rechargeEvaluator.recordWagerForBonus(playerId, wagerAmount);
  }

  /**
   * Get buy-in limits
   */
  getBuyInLimits(): { min: number; max: number } {
    return {
      min: this.buyInEvaluator.getMinBuyIn(),
      max: this.buyInEvaluator.getMaxBuyIn(),
    };
  }

  /**
   * Get recharge limits
   */
  getRechargeLimits() {
    return this.rechargeEvaluator.getLimits();
  }

  /**
   * Check if config allows operation
   */
  isOperationAllowed(operation: 'rebuy' | 'topup' | 'bonus'): boolean {
    switch (operation) {
      case 'rebuy':
        return this.buyInEvaluator.isRebuyAllowed();
      case 'topup':
        return this.buyInEvaluator.isTopUpAllowed();
      case 'bonus':
        return this.config.bonus.enabled;
    }
  }

  /**
   * Preview rake for pot size
   */
  previewRake(potSize: number): { rakeAmount: number; capApplied: boolean } {
    return this.rakeEvaluator.previewRake(potSize);
  }

  /**
   * Check if rake would be waived
   */
  wouldRakeBeWaived(flopSeen: boolean, isUncontested: boolean): boolean {
    return this.rakeEvaluator.wouldBeWaived(flopSeen, isUncontested);
  }

  /**
   * Get policy names
   */
  getPolicyInfo(): {
    rakePolicy: string;
    configVersion: string;
    configHash: string;
  } {
    return {
      rakePolicy: this.rakeEvaluator.getPolicyName(),
      configVersion: this.config.version,
      configHash: this.config.configHash,
    };
  }

  /**
   * Get underlying managers (for direct access when needed)
   */
  getManagers(): {
    balance: BalanceManager;
    escrow: EscrowManager;
    ledger: LedgerManager;
  } {
    return {
      balance: this.balanceManager,
      escrow: this.escrowManager,
      ledger: this.ledgerManager,
    };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let configurableEngineInstance: ConfigurableEconomyEngine | null = null;

export function getConfigurableEconomyEngine(): ConfigurableEconomyEngine {
  if (!configurableEngineInstance) {
    configurableEngineInstance = new ConfigurableEconomyEngine();
  }
  return configurableEngineInstance;
}

export function resetConfigurableEconomyEngine(
  config?: EconomyConfig
): ConfigurableEconomyEngine {
  configurableEngineInstance = new ConfigurableEconomyEngine({ config });
  return configurableEngineInstance;
}

export function setEconomyConfig(config: EconomyConfig): ConfigurableEconomyEngine {
  configurableEngineInstance = getConfigurableEconomyEngine().withConfig(config);
  return configurableEngineInstance;
}
