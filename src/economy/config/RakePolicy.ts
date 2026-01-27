/**
 * RakePolicy.ts
 * Phase 15 - Strategy-based rake evaluation
 *
 * Pluggable rake calculation without branching in game logic.
 * Supports:
 * - Percentage rake
 * - Cap enforcement
 * - Street-based rake
 * - No-flop-no-rake
 * - Uncontested pot exemption
 * - Promotional rake waiver
 */

import { Street } from '../../game/engine/TableState';
import { EconomyConfig, RakeRulesConfig } from './EconomyConfig';
import { EconomyConfigErrors } from './EconomyConfigErrors';

// ============================================================================
// Types
// ============================================================================

export interface RakeContext {
  readonly potSize: number;
  readonly finalStreet: Street;
  readonly flopSeen: boolean;
  readonly isUncontested: boolean;
  readonly playersInHand: number;
  readonly playersAtShowdown: number;
  readonly handId?: string;
  readonly tableId?: string;
}

export interface RakeEvaluation {
  readonly rakeAmount: number;
  readonly potAfterRake: number;
  readonly percentageApplied: number;
  readonly capApplied: boolean;
  readonly waived: boolean;
  readonly waivedReason?: string;
  readonly policyUsed: string;
  readonly configHash: string;
}

export interface RakePolicyStrategy {
  readonly name: string;
  evaluate(context: RakeContext, config: RakeRulesConfig): RakeEvaluation;
}

// ============================================================================
// Waiver Evaluation
// ============================================================================

interface WaiverResult {
  waived: boolean;
  reason?: string;
}

function evaluateWaivers(context: RakeContext, config: RakeRulesConfig): WaiverResult {
  // Check minimum pot
  if (context.potSize < config.minPotForRake) {
    return {
      waived: true,
      reason: `Pot size ${context.potSize} below minimum ${config.minPotForRake}`,
    };
  }

  // Check no-flop-no-rake rule
  if (config.noFlopNoRake && !context.flopSeen) {
    return {
      waived: true,
      reason: 'No flop seen',
    };
  }

  // Check uncontested pot rule
  if (config.excludeUncontested && context.isUncontested) {
    return {
      waived: true,
      reason: 'Uncontested pot (preflop walk)',
    };
  }

  // Check promotional waiver
  if (config.promotionalWaiver?.enabled) {
    const expiry = config.promotionalWaiver.expiresAt;
    if (!expiry || Date.now() < expiry) {
      return {
        waived: true,
        reason: `Promotional waiver active: ${config.promotionalWaiver.waiverId ?? 'default'}`,
      };
    }
  }

  return { waived: false };
}

// ============================================================================
// Standard Rake Policy
// ============================================================================

export class StandardRakePolicy implements RakePolicyStrategy {
  readonly name = 'standard';

  evaluate(context: RakeContext, config: RakeRulesConfig): RakeEvaluation {
    const waiver = evaluateWaivers(context, config);

    if (waiver.waived) {
      return {
        rakeAmount: 0,
        potAfterRake: context.potSize,
        percentageApplied: 0,
        capApplied: false,
        waived: true,
        waivedReason: waiver.reason,
        policyUsed: this.name,
        configHash: '',
      };
    }

    // Calculate rake
    let rakeAmount = Math.floor(context.potSize * (config.defaultPercentage / 100));

    // Apply cap
    const capApplied = rakeAmount > config.defaultCap && config.defaultCap > 0;
    if (capApplied) {
      rakeAmount = config.defaultCap;
    }

    const percentageApplied = context.potSize > 0
      ? (rakeAmount / context.potSize) * 100
      : 0;

    return {
      rakeAmount,
      potAfterRake: context.potSize - rakeAmount,
      percentageApplied,
      capApplied,
      waived: false,
      policyUsed: this.name,
      configHash: '',
    };
  }
}

// ============================================================================
// Street-Based Rake Policy
// ============================================================================

export class StreetBasedRakePolicy implements RakePolicyStrategy {
  readonly name = 'street-based';

  evaluate(context: RakeContext, config: RakeRulesConfig): RakeEvaluation {
    const waiver = evaluateWaivers(context, config);

    if (waiver.waived) {
      return {
        rakeAmount: 0,
        potAfterRake: context.potSize,
        percentageApplied: 0,
        capApplied: false,
        waived: true,
        waivedReason: waiver.reason,
        policyUsed: this.name,
        configHash: '',
      };
    }

    // Get street-specific config or default
    const streetConfig = config.streetOverrides?.[context.finalStreet];
    const percentage = streetConfig?.enabled
      ? streetConfig.percentage
      : config.defaultPercentage;
    const cap = streetConfig?.enabled
      ? streetConfig.cap
      : config.defaultCap;

    // Calculate rake
    let rakeAmount = Math.floor(context.potSize * (percentage / 100));

    // Apply cap
    const capApplied = rakeAmount > cap && cap > 0;
    if (capApplied) {
      rakeAmount = cap;
    }

    const percentageApplied = context.potSize > 0
      ? (rakeAmount / context.potSize) * 100
      : 0;

    return {
      rakeAmount,
      potAfterRake: context.potSize - rakeAmount,
      percentageApplied,
      capApplied,
      waived: false,
      policyUsed: this.name,
      configHash: '',
    };
  }
}

// ============================================================================
// Zero Rake Policy (for free tables)
// ============================================================================

export class ZeroRakePolicy implements RakePolicyStrategy {
  readonly name = 'zero';

  evaluate(context: RakeContext): RakeEvaluation {
    return {
      rakeAmount: 0,
      potAfterRake: context.potSize,
      percentageApplied: 0,
      capApplied: false,
      waived: true,
      waivedReason: 'Zero rake policy',
      policyUsed: this.name,
      configHash: '',
    };
  }
}

// ============================================================================
// Tiered Rake Policy (higher pots = higher percentage)
// ============================================================================

export interface TieredRakeConfig {
  tiers: readonly {
    minPot: number;
    maxPot: number;
    percentage: number;
    cap: number;
  }[];
}

export class TieredRakePolicy implements RakePolicyStrategy {
  readonly name = 'tiered';
  private tiers: TieredRakeConfig['tiers'];

  constructor(tiers: TieredRakeConfig['tiers']) {
    this.tiers = tiers;
  }

  evaluate(context: RakeContext, config: RakeRulesConfig): RakeEvaluation {
    const waiver = evaluateWaivers(context, config);

    if (waiver.waived) {
      return {
        rakeAmount: 0,
        potAfterRake: context.potSize,
        percentageApplied: 0,
        capApplied: false,
        waived: true,
        waivedReason: waiver.reason,
        policyUsed: this.name,
        configHash: '',
      };
    }

    // Find applicable tier
    const tier = this.tiers.find(
      t => context.potSize >= t.minPot && context.potSize < t.maxPot
    ) ?? this.tiers[this.tiers.length - 1];

    if (!tier) {
      // Fallback to default config
      let rakeAmount = Math.floor(context.potSize * (config.defaultPercentage / 100));
      const capApplied = rakeAmount > config.defaultCap && config.defaultCap > 0;
      if (capApplied) rakeAmount = config.defaultCap;

      return {
        rakeAmount,
        potAfterRake: context.potSize - rakeAmount,
        percentageApplied: context.potSize > 0 ? (rakeAmount / context.potSize) * 100 : 0,
        capApplied,
        waived: false,
        policyUsed: this.name,
        configHash: '',
      };
    }

    // Calculate rake with tier
    let rakeAmount = Math.floor(context.potSize * (tier.percentage / 100));
    const capApplied = rakeAmount > tier.cap && tier.cap > 0;
    if (capApplied) {
      rakeAmount = tier.cap;
    }

    return {
      rakeAmount,
      potAfterRake: context.potSize - rakeAmount,
      percentageApplied: context.potSize > 0 ? (rakeAmount / context.potSize) * 100 : 0,
      capApplied,
      waived: false,
      policyUsed: this.name,
      configHash: '',
    };
  }
}

// ============================================================================
// Rake Policy Evaluator
// ============================================================================

export class RakePolicyEvaluator {
  private policy: RakePolicyStrategy;
  private config: EconomyConfig;

  constructor(config: EconomyConfig, policy?: RakePolicyStrategy) {
    this.config = config;
    this.policy = policy ?? this.selectDefaultPolicy(config);
  }

  /**
   * Select default policy based on config
   */
  private selectDefaultPolicy(config: EconomyConfig): RakePolicyStrategy {
    // If street overrides exist, use street-based policy
    if (config.rake.streetOverrides && Object.keys(config.rake.streetOverrides).length > 0) {
      return new StreetBasedRakePolicy();
    }

    // If zero rake, use zero policy
    if (config.rake.defaultPercentage === 0) {
      return new ZeroRakePolicy();
    }

    // Default to standard
    return new StandardRakePolicy();
  }

  /**
   * Evaluate rake for a hand
   */
  evaluate(context: RakeContext): RakeEvaluation {
    const result = this.policy.evaluate(context, this.config.rake);
    return {
      ...result,
      configHash: this.config.configHash,
    };
  }

  /**
   * Get current policy name
   */
  getPolicyName(): string {
    return this.policy.name;
  }

  /**
   * Get config hash
   */
  getConfigHash(): string {
    return this.config.configHash;
  }

  /**
   * Preview rake without context (for UI display)
   */
  previewRake(potSize: number): { rakeAmount: number; capApplied: boolean } {
    let rakeAmount = Math.floor(potSize * (this.config.rake.defaultPercentage / 100));
    const capApplied = rakeAmount > this.config.rake.defaultCap && this.config.rake.defaultCap > 0;
    if (capApplied) {
      rakeAmount = this.config.rake.defaultCap;
    }
    return { rakeAmount, capApplied };
  }

  /**
   * Check if rake would be waived
   */
  wouldBeWaived(flopSeen: boolean, isUncontested: boolean): boolean {
    if (this.config.rake.noFlopNoRake && !flopSeen) return true;
    if (this.config.rake.excludeUncontested && isUncontested) return true;
    if (this.config.isRakeWaiverActive()) return true;
    return false;
  }

  /**
   * Create new evaluator with different policy
   */
  withPolicy(policy: RakePolicyStrategy): RakePolicyEvaluator {
    return new RakePolicyEvaluator(this.config, policy);
  }

  /**
   * Create new evaluator with updated config
   */
  withConfig(config: EconomyConfig): RakePolicyEvaluator {
    return new RakePolicyEvaluator(config, this.policy);
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

export function createRakeEvaluator(
  config: EconomyConfig,
  policy?: RakePolicyStrategy
): RakePolicyEvaluator {
  return new RakePolicyEvaluator(config, policy);
}

export function createStandardRakePolicy(): RakePolicyStrategy {
  return new StandardRakePolicy();
}

export function createStreetBasedRakePolicy(): RakePolicyStrategy {
  return new StreetBasedRakePolicy();
}

export function createZeroRakePolicy(): RakePolicyStrategy {
  return new ZeroRakePolicy();
}

export function createTieredRakePolicy(tiers: TieredRakeConfig['tiers']): RakePolicyStrategy {
  return new TieredRakePolicy(tiers);
}
