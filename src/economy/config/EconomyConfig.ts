/**
 * EconomyConfig.ts
 * Phase 15 - Central immutable economy configuration
 *
 * Covers all configurable economy rules:
 * - Rake rules
 * - Buy-in limits
 * - Recharge rules
 * - Bonus/promo rules
 * - Service fees
 *
 * Serializable and hashable for network/DB storage.
 */

import { Street } from '../../game/engine/TableState';
import { EconomyConfigErrors } from './EconomyConfigErrors';

// ============================================================================
// Types
// ============================================================================

export type ConfigId = string;
export type ConfigVersion = string;

/**
 * Rake configuration per street
 */
export interface StreetRakeConfig {
  readonly percentage: number;  // 0-100
  readonly cap: number;         // Maximum rake for this street
  readonly enabled: boolean;
}

/**
 * Complete rake configuration
 */
export interface RakeRulesConfig {
  readonly defaultPercentage: number;
  readonly defaultCap: number;
  readonly noFlopNoRake: boolean;
  readonly excludeUncontested: boolean;
  readonly minPotForRake: number;
  readonly streetOverrides?: Partial<Record<Street, StreetRakeConfig>>;
  readonly promotionalWaiver?: {
    readonly enabled: boolean;
    readonly waiverId?: string;
    readonly expiresAt?: number;
  };
}

/**
 * Buy-in configuration
 */
export interface BuyInRulesConfig {
  readonly minBuyIn: number;
  readonly maxBuyIn: number;
  readonly allowRebuy: boolean;
  readonly rebuyMinStack: number;      // Min stack to trigger rebuy option
  readonly rebuyMaxStack: number;      // Max stack after rebuy
  readonly allowTopUp: boolean;
  readonly topUpThreshold: number;     // Stack must be below this to top up
  readonly firstBuyBonus?: {
    readonly enabled: boolean;
    readonly bonusPercentage: number;  // e.g., 100 for 100% match
    readonly maxBonus: number;
    readonly bonusId: string;
  };
}

/**
 * Recharge configuration
 */
export interface RechargeRulesConfig {
  readonly minRecharge: number;
  readonly maxRecharge: number;
  readonly cooldownMs: number;         // Minimum time between recharges
  readonly dailyLimit: number;         // Max recharge per day (0 = unlimited)
  readonly weeklyLimit: number;        // Max recharge per week (0 = unlimited)
  readonly allowDelayedSettlement: boolean;
  readonly delayedSettlementMaxMs: number;
  readonly bonusCredit?: {
    readonly enabled: boolean;
    readonly percentage: number;       // Bonus % on recharge
    readonly maxBonus: number;
    readonly lockedUntilWagered: boolean;
    readonly wagerMultiplier: number;  // e.g., 3x means wager 3x bonus before unlock
  };
}

/**
 * Bonus/promo configuration
 */
export interface BonusRulesConfig {
  readonly enabled: boolean;
  readonly maxActiveBonuses: number;
  readonly bonusChipsLocked: boolean;  // If true, bonus chips are locked until wagered
  readonly defaultWagerMultiplier: number;
  readonly bonusExpirationDays: number;
  readonly allowBonusStacking: boolean;
}

/**
 * Service fee configuration
 */
export interface FeeRulesConfig {
  readonly enabled: boolean;
  readonly tournamentFee?: {
    readonly percentage: number;
    readonly cap: number;
  };
  readonly cashOutFee?: {
    readonly percentage: number;
    readonly cap: number;
    readonly minAmount: number;
  };
  readonly transferFee?: {
    readonly percentage: number;
    readonly cap: number;
    readonly minAmount: number;
  };
}

/**
 * Complete economy configuration
 */
export interface EconomyConfigData {
  readonly configId: ConfigId;
  readonly version: ConfigVersion;
  readonly createdAt: number;
  readonly rake: RakeRulesConfig;
  readonly buyIn: BuyInRulesConfig;
  readonly recharge: RechargeRulesConfig;
  readonly bonus: BonusRulesConfig;
  readonly fees: FeeRulesConfig;
  readonly metadata?: Record<string, unknown>;
}

// ============================================================================
// Default Configurations
// ============================================================================

export const DEFAULT_RAKE_CONFIG: RakeRulesConfig = {
  defaultPercentage: 5,
  defaultCap: 3,
  noFlopNoRake: true,
  excludeUncontested: true,
  minPotForRake: 0,
};

export const DEFAULT_BUY_IN_CONFIG: BuyInRulesConfig = {
  minBuyIn: 20,
  maxBuyIn: 200,
  allowRebuy: true,
  rebuyMinStack: 0,
  rebuyMaxStack: 100,
  allowTopUp: true,
  topUpThreshold: 100,
};

export const DEFAULT_RECHARGE_CONFIG: RechargeRulesConfig = {
  minRecharge: 10,
  maxRecharge: 10000,
  cooldownMs: 0,
  dailyLimit: 0,
  weeklyLimit: 0,
  allowDelayedSettlement: false,
  delayedSettlementMaxMs: 0,
};

export const DEFAULT_BONUS_CONFIG: BonusRulesConfig = {
  enabled: false,
  maxActiveBonuses: 1,
  bonusChipsLocked: true,
  defaultWagerMultiplier: 3,
  bonusExpirationDays: 30,
  allowBonusStacking: false,
};

export const DEFAULT_FEE_CONFIG: FeeRulesConfig = {
  enabled: false,
};

// ============================================================================
// EconomyConfig Class
// ============================================================================

export class EconomyConfig {
  private readonly data: EconomyConfigData;
  private readonly hash: string;

  constructor(data: Partial<EconomyConfigData> = {}) {
    this.data = this.buildConfig(data);
    this.validateConfig(this.data);
    this.hash = this.computeHash(this.data);
  }

  /**
   * Build complete config from partial data
   */
  private buildConfig(partial: Partial<EconomyConfigData>): EconomyConfigData {
    return {
      configId: partial.configId ?? this.generateConfigId(),
      version: partial.version ?? '1.0.0',
      createdAt: partial.createdAt ?? Date.now(),
      rake: { ...DEFAULT_RAKE_CONFIG, ...partial.rake },
      buyIn: { ...DEFAULT_BUY_IN_CONFIG, ...partial.buyIn },
      recharge: { ...DEFAULT_RECHARGE_CONFIG, ...partial.recharge },
      bonus: { ...DEFAULT_BONUS_CONFIG, ...partial.bonus },
      fees: { ...DEFAULT_FEE_CONFIG, ...partial.fees },
      metadata: partial.metadata,
    };
  }

  /**
   * Validate configuration
   */
  private validateConfig(config: EconomyConfigData): void {
    // Validate rake
    if (config.rake.defaultPercentage < 0 || config.rake.defaultPercentage > 100) {
      throw EconomyConfigErrors.invalidRakePercentage(config.rake.defaultPercentage);
    }
    if (config.rake.defaultCap < 0) {
      throw EconomyConfigErrors.invalidRakeCap(config.rake.defaultCap);
    }

    // Validate buy-in
    if (config.buyIn.minBuyIn > config.buyIn.maxBuyIn) {
      throw EconomyConfigErrors.invalidBuyInRange(
        config.buyIn.minBuyIn,
        config.buyIn.maxBuyIn
      );
    }

    // Validate recharge
    if (config.recharge.minRecharge > config.recharge.maxRecharge) {
      throw EconomyConfigErrors.invalidRechargeConfig(
        `minRecharge ${config.recharge.minRecharge} > maxRecharge ${config.recharge.maxRecharge}`
      );
    }

    // Validate bonus
    if (config.bonus.enabled && config.bonus.defaultWagerMultiplier < 0) {
      throw EconomyConfigErrors.invalidBonusConfig(
        `wagerMultiplier must be non-negative`
      );
    }

    // Validate fees
    if (config.fees.enabled) {
      if (config.fees.tournamentFee && config.fees.tournamentFee.percentage > 100) {
        throw EconomyConfigErrors.invalidFeeStructure(
          'Tournament fee percentage cannot exceed 100%'
        );
      }
    }
  }

  /**
   * Compute deterministic hash of config
   */
  private computeHash(config: EconomyConfigData): string {
    const normalized = JSON.stringify({
      version: config.version,
      rake: config.rake,
      buyIn: config.buyIn,
      recharge: config.recharge,
      bonus: config.bonus,
      fees: config.fees,
    });
    return this.simpleHash(normalized);
  }

  /**
   * Simple hash function for deterministic hashing
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
  }

  /**
   * Generate unique config ID
   */
  private generateConfigId(): ConfigId {
    return `cfg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // ============================================================================
  // Getters
  // ============================================================================

  get configId(): ConfigId {
    return this.data.configId;
  }

  get version(): ConfigVersion {
    return this.data.version;
  }

  get createdAt(): number {
    return this.data.createdAt;
  }

  get rake(): RakeRulesConfig {
    return this.data.rake;
  }

  get buyIn(): BuyInRulesConfig {
    return this.data.buyIn;
  }

  get recharge(): RechargeRulesConfig {
    return this.data.recharge;
  }

  get bonus(): BonusRulesConfig {
    return this.data.bonus;
  }

  get fees(): FeeRulesConfig {
    return this.data.fees;
  }

  get configHash(): string {
    return this.hash;
  }

  // ============================================================================
  // Methods
  // ============================================================================

  /**
   * Create a new config with updated values (immutable)
   */
  withUpdates(updates: Partial<EconomyConfigData>): EconomyConfig {
    return new EconomyConfig({
      ...this.data,
      ...updates,
      configId: this.generateConfigId(),
      createdAt: Date.now(),
      rake: updates.rake ? { ...this.data.rake, ...updates.rake } : this.data.rake,
      buyIn: updates.buyIn ? { ...this.data.buyIn, ...updates.buyIn } : this.data.buyIn,
      recharge: updates.recharge ? { ...this.data.recharge, ...updates.recharge } : this.data.recharge,
      bonus: updates.bonus ? { ...this.data.bonus, ...updates.bonus } : this.data.bonus,
      fees: updates.fees ? { ...this.data.fees, ...updates.fees } : this.data.fees,
    });
  }

  /**
   * Serialize config for storage/network
   */
  toJSON(): EconomyConfigData {
    return { ...this.data };
  }

  /**
   * Serialize with hash for verification
   */
  toJSONWithHash(): EconomyConfigData & { configHash: string } {
    return {
      ...this.data,
      configHash: this.hash,
    };
  }

  /**
   * Create config from serialized data
   */
  static fromJSON(data: EconomyConfigData): EconomyConfig {
    return new EconomyConfig(data);
  }

  /**
   * Create config from JSON with hash verification
   */
  static fromJSONWithHashVerification(
    data: EconomyConfigData & { configHash: string }
  ): EconomyConfig {
    const config = new EconomyConfig(data);
    if (config.configHash !== data.configHash) {
      throw EconomyConfigErrors.configHashMismatch(data.configHash, config.configHash);
    }
    return config;
  }

  /**
   * Verify hash matches
   */
  verifyHash(expectedHash: string): boolean {
    return this.hash === expectedHash;
  }

  /**
   * Get rake percentage for a specific street
   */
  getRakePercentageForStreet(street: Street): number {
    const override = this.data.rake.streetOverrides?.[street];
    if (override?.enabled) {
      return override.percentage;
    }
    return this.data.rake.defaultPercentage;
  }

  /**
   * Get rake cap for a specific street
   */
  getRakeCapForStreet(street: Street): number {
    const override = this.data.rake.streetOverrides?.[street];
    if (override?.enabled) {
      return override.cap;
    }
    return this.data.rake.defaultCap;
  }

  /**
   * Check if promotional rake waiver is active
   */
  isRakeWaiverActive(): boolean {
    const waiver = this.data.rake.promotionalWaiver;
    if (!waiver?.enabled) return false;
    if (waiver.expiresAt && Date.now() > waiver.expiresAt) return false;
    return true;
  }
}

// ============================================================================
// Config Builder (Fluent API)
// ============================================================================

/**
 * Mutable builder data type for EconomyConfigBuilder
 */
interface MutableConfigData {
  configId?: ConfigId;
  version?: ConfigVersion;
  createdAt?: number;
  rake?: RakeRulesConfig;
  buyIn?: BuyInRulesConfig;
  recharge?: RechargeRulesConfig;
  bonus?: BonusRulesConfig;
  fees?: FeeRulesConfig;
  metadata?: Record<string, unknown>;
}

export class EconomyConfigBuilder {
  private data: MutableConfigData = {};

  withRake(rake: Partial<RakeRulesConfig>): this {
    this.data.rake = { ...DEFAULT_RAKE_CONFIG, ...this.data.rake, ...rake };
    return this;
  }

  withBuyIn(buyIn: Partial<BuyInRulesConfig>): this {
    this.data.buyIn = { ...DEFAULT_BUY_IN_CONFIG, ...this.data.buyIn, ...buyIn };
    return this;
  }

  withRecharge(recharge: Partial<RechargeRulesConfig>): this {
    this.data.recharge = { ...DEFAULT_RECHARGE_CONFIG, ...this.data.recharge, ...recharge };
    return this;
  }

  withBonus(bonus: Partial<BonusRulesConfig>): this {
    this.data.bonus = { ...DEFAULT_BONUS_CONFIG, ...this.data.bonus, ...bonus };
    return this;
  }

  withFees(fees: Partial<FeeRulesConfig>): this {
    this.data.fees = { ...DEFAULT_FEE_CONFIG, ...this.data.fees, ...fees };
    return this;
  }

  withVersion(version: ConfigVersion): this {
    this.data.version = version;
    return this;
  }

  withMetadata(metadata: Record<string, unknown>): this {
    this.data.metadata = metadata;
    return this;
  }

  build(): EconomyConfig {
    return new EconomyConfig(this.data);
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

export function createDefaultConfig(): EconomyConfig {
  return new EconomyConfig();
}

export function createConfigBuilder(): EconomyConfigBuilder {
  return new EconomyConfigBuilder();
}

/**
 * Default economy config singleton instance
 */
export const DEFAULT_ECONOMY_CONFIG: EconomyConfig = new EconomyConfig();
