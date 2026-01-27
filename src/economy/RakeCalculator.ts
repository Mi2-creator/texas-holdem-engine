/**
 * RakeCalculator.ts
 * Phase 14 - Rake calculation system
 *
 * Configurable rake system with:
 * - Percentage-based rake
 * - Cap per hand
 * - No-rake conditions (preflop walk, etc.)
 *
 * Rake is collected only at hand completion.
 */

import { HandId, TableId } from '../security/AuditLog';
import { Street } from '../game/engine/TableState';
import { EconomyErrors } from './EconomyErrors';

// ============================================================================
// Types
// ============================================================================

export type RakeId = string;

export interface RakeConfig {
  readonly rakePercentage: number;      // e.g., 5 for 5%
  readonly rakeCap: number;             // Maximum rake per hand
  readonly minPotForRake: number;       // Minimum pot size to collect rake
  readonly noFlopNoRake: boolean;       // If true, no rake if no flop seen
  readonly excludeUncontested: boolean; // If true, no rake if only one player
  readonly rakeFromNet: boolean;        // If true, rake calculated from net pot (after returned bets)
}

export interface RakeResult {
  readonly rakeId: RakeId;
  readonly handId: HandId;
  readonly tableId: TableId;
  readonly potBeforeRake: number;
  readonly potAfterRake: number;
  readonly rakeAmount: number;
  readonly rakePercentageApplied: number;
  readonly capApplied: boolean;
  readonly waived: boolean;
  readonly waivedReason?: string;
  readonly timestamp: number;
}

export interface RakeSummary {
  readonly tableId: TableId;
  readonly totalRakeCollected: number;
  readonly handsRaked: number;
  readonly handsWaived: number;
  readonly averageRake: number;
}

export interface HandRakeContext {
  readonly handId: HandId;
  readonly tableId: TableId;
  readonly potSize: number;
  readonly flopSeen: boolean;
  readonly playersInHand: number;       // Players who saw any action
  readonly playersAtShowdown: number;   // Players remaining at end
  readonly finalStreet: Street;
  readonly isUncontested: boolean;      // Only one player remaining (others folded preflop)
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_RAKE_CONFIG: RakeConfig = {
  rakePercentage: 5,           // 5%
  rakeCap: 3,                  // Max 3 chips
  minPotForRake: 0,            // Rake from any pot
  noFlopNoRake: true,          // No rake if no flop
  excludeUncontested: true,    // No rake if everyone folds preflop
  rakeFromNet: false,          // Rake from total pot
};

// ============================================================================
// Rake Calculator
// ============================================================================

export class RakeCalculator {
  private config: RakeConfig;
  private rakeHistory: Map<HandId, RakeResult>;
  private tableRakes: Map<TableId, number>;

  constructor(config: Partial<RakeConfig> = {}) {
    this.config = { ...DEFAULT_RAKE_CONFIG, ...config };
    this.validateConfig(this.config);
    this.rakeHistory = new Map();
    this.tableRakes = new Map();
  }

  /**
   * Validate rake configuration
   */
  private validateConfig(config: RakeConfig): void {
    if (config.rakePercentage < 0 || config.rakePercentage > 100) {
      throw EconomyErrors.invalidRakeConfig(
        'Rake percentage must be between 0 and 100',
        { rakePercentage: config.rakePercentage }
      );
    }

    if (config.rakeCap < 0) {
      throw EconomyErrors.invalidRakeConfig(
        'Rake cap must be non-negative',
        { rakeCap: config.rakeCap }
      );
    }

    if (config.minPotForRake < 0) {
      throw EconomyErrors.invalidRakeConfig(
        'Minimum pot for rake must be non-negative',
        { minPotForRake: config.minPotForRake }
      );
    }
  }

  /**
   * Calculate rake for a completed hand
   */
  calculateRake(context: HandRakeContext): RakeResult {
    const { handId, tableId, potSize } = context;
    const rakeId = `rake_${handId}`;
    const timestamp = Date.now();

    // Check for waiver conditions
    const waiverResult = this.checkWaiverConditions(context);
    if (waiverResult.waived) {
      const result: RakeResult = {
        rakeId,
        handId,
        tableId,
        potBeforeRake: potSize,
        potAfterRake: potSize,
        rakeAmount: 0,
        rakePercentageApplied: 0,
        capApplied: false,
        waived: true,
        waivedReason: waiverResult.reason,
        timestamp,
      };

      this.rakeHistory.set(handId, result);
      return result;
    }

    // Calculate rake
    let rakeAmount = Math.floor(potSize * (this.config.rakePercentage / 100));

    // Apply cap
    const capApplied = rakeAmount > this.config.rakeCap && this.config.rakeCap > 0;
    if (capApplied) {
      rakeAmount = this.config.rakeCap;
    }

    // Ensure integer
    rakeAmount = Math.floor(rakeAmount);

    // Calculate effective percentage
    const rakePercentageApplied = potSize > 0 ? (rakeAmount / potSize) * 100 : 0;

    const result: RakeResult = {
      rakeId,
      handId,
      tableId,
      potBeforeRake: potSize,
      potAfterRake: potSize - rakeAmount,
      rakeAmount,
      rakePercentageApplied,
      capApplied,
      waived: false,
      timestamp,
    };

    // Record rake
    this.rakeHistory.set(handId, result);

    // Update table totals
    const currentTableRake = this.tableRakes.get(tableId) ?? 0;
    this.tableRakes.set(tableId, currentTableRake + rakeAmount);

    return result;
  }

  /**
   * Check if rake should be waived
   */
  private checkWaiverConditions(context: HandRakeContext): {
    waived: boolean;
    reason?: string;
  } {
    const { potSize, flopSeen, isUncontested } = context;

    // Check minimum pot
    if (potSize < this.config.minPotForRake) {
      return {
        waived: true,
        reason: `Pot size ${potSize} below minimum ${this.config.minPotForRake}`,
      };
    }

    // Check no-flop-no-rake rule
    if (this.config.noFlopNoRake && !flopSeen) {
      return {
        waived: true,
        reason: 'No flop seen',
      };
    }

    // Check uncontested pot rule
    if (this.config.excludeUncontested && isUncontested) {
      return {
        waived: true,
        reason: 'Uncontested pot (preflop walk)',
      };
    }

    // Zero rake percentage
    if (this.config.rakePercentage === 0) {
      return {
        waived: true,
        reason: 'Rake percentage is 0%',
      };
    }

    return { waived: false };
  }

  /**
   * Get rake for a specific hand
   */
  getRakeResult(handId: HandId): RakeResult | null {
    return this.rakeHistory.get(handId) ?? null;
  }

  /**
   * Get total rake collected at a table
   */
  getTableRakeTotal(tableId: TableId): number {
    return this.tableRakes.get(tableId) ?? 0;
  }

  /**
   * Get rake summary for a table
   */
  getTableRakeSummary(tableId: TableId): RakeSummary {
    let totalRake = 0;
    let handsRaked = 0;
    let handsWaived = 0;

    for (const result of this.rakeHistory.values()) {
      if (result.tableId === tableId) {
        if (result.waived) {
          handsWaived++;
        } else {
          totalRake += result.rakeAmount;
          handsRaked++;
        }
      }
    }

    return {
      tableId,
      totalRakeCollected: totalRake,
      handsRaked,
      handsWaived,
      averageRake: handsRaked > 0 ? totalRake / handsRaked : 0,
    };
  }

  /**
   * Get all rake results for a table
   */
  getTableRakeHistory(tableId: TableId): readonly RakeResult[] {
    const results: RakeResult[] = [];
    for (const result of this.rakeHistory.values()) {
      if (result.tableId === tableId) {
        results.push(result);
      }
    }
    return results;
  }

  /**
   * Get current configuration
   */
  getConfig(): RakeConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<RakeConfig>): void {
    const newConfig = { ...this.config, ...updates };
    this.validateConfig(newConfig);
    this.config = newConfig;
  }

  /**
   * Check if hand qualifies for no-rake (before hand ends)
   */
  wouldBeNoRake(flopSeen: boolean, isUncontested: boolean): boolean {
    if (this.config.noFlopNoRake && !flopSeen) {
      return true;
    }
    if (this.config.excludeUncontested && isUncontested) {
      return true;
    }
    return false;
  }

  /**
   * Calculate potential rake for a pot size (preview)
   */
  previewRake(potSize: number): { rakeAmount: number; capApplied: boolean } {
    let rakeAmount = Math.floor(potSize * (this.config.rakePercentage / 100));
    const capApplied = rakeAmount > this.config.rakeCap && this.config.rakeCap > 0;

    if (capApplied) {
      rakeAmount = this.config.rakeCap;
    }

    return { rakeAmount, capApplied };
  }

  /**
   * Clear all history (for testing)
   */
  clear(): void {
    this.rakeHistory.clear();
    this.tableRakes.clear();
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Build hand context from game state
 */
export function buildHandRakeContext(params: {
  handId: HandId;
  tableId: TableId;
  potSize: number;
  finalStreet: Street;
  playersInHand: number;
  playersAtShowdown: number;
}): HandRakeContext {
  const { finalStreet, playersAtShowdown } = params;

  // Flop seen if we got past preflop
  const flopSeen = finalStreet !== 'waiting' && finalStreet !== 'preflop';

  // Uncontested if only one player remaining and no flop
  const isUncontested = playersAtShowdown <= 1 && !flopSeen;

  return {
    ...params,
    flopSeen,
    isUncontested,
  };
}

/**
 * Calculate rake for simple pot (no all-ins)
 */
export function calculateSimpleRake(
  potSize: number,
  config: RakeConfig
): number {
  if (potSize < config.minPotForRake) {
    return 0;
  }

  let rake = Math.floor(potSize * (config.rakePercentage / 100));

  if (config.rakeCap > 0 && rake > config.rakeCap) {
    rake = config.rakeCap;
  }

  return rake;
}

// ============================================================================
// Singleton Instance
// ============================================================================

let rakeCalculatorInstance: RakeCalculator | null = null;

export function getRakeCalculator(config?: Partial<RakeConfig>): RakeCalculator {
  if (!rakeCalculatorInstance) {
    rakeCalculatorInstance = new RakeCalculator(config);
  }
  return rakeCalculatorInstance;
}

export function resetRakeCalculator(config?: Partial<RakeConfig>): RakeCalculator {
  rakeCalculatorInstance = new RakeCalculator(config);
  return rakeCalculatorInstance;
}
