/**
 * BuyInPolicy.ts
 * Phase 15 - Buy-in rules and validation
 *
 * Enforces:
 * - Min/max buy-in limits
 * - Table-based constraints
 * - Rebuy rules
 * - Top-up rules
 * - First-buy bonus hook
 */

import { PlayerId } from '../../security/Identity';
import { TableId } from '../../security/AuditLog';
import { EconomyConfig, BuyInRulesConfig } from './EconomyConfig';
import { EconomyConfigErrors } from './EconomyConfigErrors';
import { LedgerManager, LedgerEntryType } from '../Ledger';

// ============================================================================
// Types
// ============================================================================

export interface BuyInContext {
  readonly playerId: PlayerId;
  readonly tableId: TableId;
  readonly amount: number;
  readonly availableBalance: number;
  readonly currentStack: number;
  readonly isFirstBuy: boolean;
  readonly timestamp?: number;
}

export interface BuyInValidation {
  readonly valid: boolean;
  readonly adjustedAmount?: number;
  readonly bonusAmount?: number;
  readonly bonusId?: string;
  readonly reason?: string;
}

export interface BuyInResult {
  readonly playerId: PlayerId;
  readonly tableId: TableId;
  readonly amount: number;
  readonly bonusAmount: number;
  readonly totalCredits: number;
  readonly bonusId?: string;
  readonly configHash: string;
  readonly timestamp: number;
}

export interface RebuyContext {
  readonly playerId: PlayerId;
  readonly tableId: TableId;
  readonly amount: number;
  readonly currentStack: number;
  readonly availableBalance: number;
}

export interface TopUpContext {
  readonly playerId: PlayerId;
  readonly tableId: TableId;
  readonly targetStack: number;
  readonly currentStack: number;
  readonly availableBalance: number;
}

// ============================================================================
// Buy-In Policy Evaluator
// ============================================================================

export class BuyInPolicyEvaluator {
  private config: EconomyConfig;
  private ledger?: LedgerManager;

  constructor(config: EconomyConfig, ledger?: LedgerManager) {
    this.config = config;
    this.ledger = ledger;
  }

  /**
   * Validate a buy-in request
   */
  validateBuyIn(context: BuyInContext): BuyInValidation {
    const rules = this.config.buyIn;

    // Check minimum
    if (context.amount < rules.minBuyIn) {
      return {
        valid: false,
        reason: `Buy-in ${context.amount} is below minimum ${rules.minBuyIn}`,
      };
    }

    // Check maximum
    if (context.amount > rules.maxBuyIn) {
      return {
        valid: false,
        reason: `Buy-in ${context.amount} exceeds maximum ${rules.maxBuyIn}`,
      };
    }

    // Check balance
    if (context.amount > context.availableBalance) {
      return {
        valid: false,
        reason: `Buy-in ${context.amount} exceeds available balance ${context.availableBalance}`,
      };
    }

    // Check if already seated (rebuy rules apply)
    if (context.currentStack > 0) {
      if (!rules.allowRebuy) {
        return {
          valid: false,
          reason: 'Rebuy not allowed',
        };
      }

      if (context.currentStack > rules.rebuyMinStack) {
        return {
          valid: false,
          reason: `Current stack ${context.currentStack} exceeds rebuy threshold ${rules.rebuyMinStack}`,
        };
      }

      // Limit to rebuy max stack
      const maxAdditional = rules.rebuyMaxStack - context.currentStack;
      if (context.amount > maxAdditional) {
        return {
          valid: true,
          adjustedAmount: maxAdditional,
          reason: `Amount adjusted to rebuy max: ${maxAdditional}`,
        };
      }
    }

    // Calculate first-buy bonus if applicable
    let bonusAmount = 0;
    let bonusId: string | undefined;

    if (context.isFirstBuy && rules.firstBuyBonus?.enabled) {
      bonusAmount = Math.min(
        Math.floor(context.amount * (rules.firstBuyBonus.bonusPercentage / 100)),
        rules.firstBuyBonus.maxBonus
      );
      bonusId = rules.firstBuyBonus.bonusId;
    }

    return {
      valid: true,
      adjustedAmount: context.amount,
      bonusAmount,
      bonusId,
    };
  }

  /**
   * Execute a buy-in (validation + ledger recording)
   */
  executeBuyIn(context: BuyInContext): BuyInResult {
    const validation = this.validateBuyIn(context);

    if (!validation.valid) {
      if (validation.reason?.includes('below minimum')) {
        throw EconomyConfigErrors.buyInBelowMinimum(context.amount, this.config.buyIn.minBuyIn);
      }
      if (validation.reason?.includes('exceeds maximum')) {
        throw EconomyConfigErrors.buyInAboveMaximum(context.amount, this.config.buyIn.maxBuyIn);
      }
      if (validation.reason?.includes('exceeds available')) {
        throw EconomyConfigErrors.buyInExceedsBalance(context.amount, context.availableBalance);
      }
      throw EconomyConfigErrors.buyInNotAllowed(validation.reason ?? 'Unknown');
    }

    const finalAmount = validation.adjustedAmount ?? context.amount;
    const bonusAmount = validation.bonusAmount ?? 0;
    const timestamp = context.timestamp ?? Date.now();

    // Record in ledger if available
    if (this.ledger) {
      this.ledger.record({
        type: LedgerEntryType.BUY_IN,
        playerId: context.playerId,
        amount: -finalAmount,
        reason: `Buy-in at table ${context.tableId}`,
        tableId: context.tableId,
        balanceAfter: context.availableBalance - finalAmount,
        metadata: {
          isFirstBuy: context.isFirstBuy,
          configHash: this.config.configHash,
        },
      });

      if (bonusAmount > 0) {
        this.ledger.record({
          type: LedgerEntryType.BONUS,
          playerId: context.playerId,
          amount: bonusAmount,
          reason: `First buy bonus: ${validation.bonusId}`,
          tableId: context.tableId,
          balanceAfter: context.availableBalance - finalAmount + bonusAmount,
          metadata: {
            bonusId: validation.bonusId,
            bonusType: 'first_buy',
          },
        });
      }
    }

    return {
      playerId: context.playerId,
      tableId: context.tableId,
      amount: finalAmount,
      bonusAmount,
      totalCredits: finalAmount + bonusAmount,
      bonusId: validation.bonusId,
      configHash: this.config.configHash,
      timestamp,
    };
  }

  /**
   * Validate rebuy request
   */
  validateRebuy(context: RebuyContext): BuyInValidation {
    const rules = this.config.buyIn;

    if (!rules.allowRebuy) {
      return {
        valid: false,
        reason: 'Rebuy not allowed',
      };
    }

    if (context.currentStack > rules.rebuyMinStack) {
      return {
        valid: false,
        reason: `Stack ${context.currentStack} above rebuy threshold ${rules.rebuyMinStack}`,
      };
    }

    if (context.amount > context.availableBalance) {
      return {
        valid: false,
        reason: `Rebuy ${context.amount} exceeds balance ${context.availableBalance}`,
      };
    }

    // Calculate max rebuy amount
    const maxRebuy = rules.rebuyMaxStack - context.currentStack;
    const adjustedAmount = Math.min(context.amount, maxRebuy);

    if (adjustedAmount <= 0) {
      return {
        valid: false,
        reason: 'Stack already at or above rebuy max',
      };
    }

    return {
      valid: true,
      adjustedAmount,
    };
  }

  /**
   * Validate top-up request
   */
  validateTopUp(context: TopUpContext): BuyInValidation {
    const rules = this.config.buyIn;

    if (!rules.allowTopUp) {
      return {
        valid: false,
        reason: 'Top-up not allowed',
      };
    }

    if (context.currentStack >= rules.topUpThreshold) {
      return {
        valid: false,
        reason: `Stack ${context.currentStack} at or above top-up threshold ${rules.topUpThreshold}`,
      };
    }

    // Calculate top-up amount needed
    const topUpAmount = context.targetStack - context.currentStack;

    if (topUpAmount <= 0) {
      return {
        valid: false,
        reason: 'Already at or above target stack',
      };
    }

    // Limit to max buy-in
    const finalTarget = Math.min(context.targetStack, rules.maxBuyIn);
    const adjustedAmount = Math.min(finalTarget - context.currentStack, context.availableBalance);

    if (adjustedAmount <= 0) {
      return {
        valid: false,
        reason: 'Insufficient balance for top-up',
      };
    }

    return {
      valid: true,
      adjustedAmount,
    };
  }

  /**
   * Get minimum buy-in
   */
  getMinBuyIn(): number {
    return this.config.buyIn.minBuyIn;
  }

  /**
   * Get maximum buy-in
   */
  getMaxBuyIn(): number {
    return this.config.buyIn.maxBuyIn;
  }

  /**
   * Check if rebuy is allowed
   */
  isRebuyAllowed(): boolean {
    return this.config.buyIn.allowRebuy;
  }

  /**
   * Check if top-up is allowed
   */
  isTopUpAllowed(): boolean {
    return this.config.buyIn.allowTopUp;
  }

  /**
   * Get first-buy bonus info
   */
  getFirstBuyBonusInfo(): {
    enabled: boolean;
    percentage: number;
    maxBonus: number;
  } | null {
    const bonus = this.config.buyIn.firstBuyBonus;
    if (!bonus?.enabled) return null;
    return {
      enabled: true,
      percentage: bonus.bonusPercentage,
      maxBonus: bonus.maxBonus,
    };
  }

  /**
   * Calculate potential first-buy bonus
   */
  calculateFirstBuyBonus(amount: number): number {
    const bonus = this.config.buyIn.firstBuyBonus;
    if (!bonus?.enabled) return 0;
    return Math.min(
      Math.floor(amount * (bonus.bonusPercentage / 100)),
      bonus.maxBonus
    );
  }

  /**
   * Get config hash
   */
  getConfigHash(): string {
    return this.config.configHash;
  }

  /**
   * Create new evaluator with updated config
   */
  withConfig(config: EconomyConfig): BuyInPolicyEvaluator {
    return new BuyInPolicyEvaluator(config, this.ledger);
  }
}

// ============================================================================
// Table-Specific Buy-In Rules
// ============================================================================

export interface TableBuyInOverride {
  readonly tableId: TableId;
  readonly minBuyIn?: number;
  readonly maxBuyIn?: number;
  readonly allowRebuy?: boolean;
  readonly allowTopUp?: boolean;
}

export class TableBuyInPolicy {
  private baseEvaluator: BuyInPolicyEvaluator;
  private tableOverrides: Map<TableId, TableBuyInOverride>;

  constructor(config: EconomyConfig, ledger?: LedgerManager) {
    this.baseEvaluator = new BuyInPolicyEvaluator(config, ledger);
    this.tableOverrides = new Map();
  }

  /**
   * Set table-specific override
   */
  setTableOverride(override: TableBuyInOverride): void {
    this.tableOverrides.set(override.tableId, override);
  }

  /**
   * Remove table override
   */
  removeTableOverride(tableId: TableId): void {
    this.tableOverrides.delete(tableId);
  }

  /**
   * Validate buy-in with table overrides
   */
  validateBuyIn(context: BuyInContext): BuyInValidation {
    const override = this.tableOverrides.get(context.tableId);

    if (!override) {
      return this.baseEvaluator.validateBuyIn(context);
    }

    // Apply table-specific rules
    const min = override.minBuyIn ?? this.baseEvaluator.getMinBuyIn();
    const max = override.maxBuyIn ?? this.baseEvaluator.getMaxBuyIn();

    if (context.amount < min) {
      return {
        valid: false,
        reason: `Buy-in ${context.amount} below table minimum ${min}`,
      };
    }

    if (context.amount > max) {
      return {
        valid: false,
        reason: `Buy-in ${context.amount} exceeds table maximum ${max}`,
      };
    }

    return this.baseEvaluator.validateBuyIn(context);
  }

  /**
   * Get effective limits for a table
   */
  getTableLimits(tableId: TableId): { minBuyIn: number; maxBuyIn: number } {
    const override = this.tableOverrides.get(tableId);
    return {
      minBuyIn: override?.minBuyIn ?? this.baseEvaluator.getMinBuyIn(),
      maxBuyIn: override?.maxBuyIn ?? this.baseEvaluator.getMaxBuyIn(),
    };
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

export function createBuyInEvaluator(
  config: EconomyConfig,
  ledger?: LedgerManager
): BuyInPolicyEvaluator {
  return new BuyInPolicyEvaluator(config, ledger);
}

export function createTableBuyInPolicy(
  config: EconomyConfig,
  ledger?: LedgerManager
): TableBuyInPolicy {
  return new TableBuyInPolicy(config, ledger);
}
