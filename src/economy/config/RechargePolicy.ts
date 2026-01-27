/**
 * RechargePolicy.ts
 * Phase 15 - Recharge rules and bonus credit handling
 *
 * Handles:
 * - Direct recharge
 * - Delayed settlement
 * - Bonus credit
 * - Locked promotional chips
 * - Rate limiting
 */

import { PlayerId } from '../../security/Identity';
import { EconomyConfig, RechargeRulesConfig } from './EconomyConfig';
import { EconomyConfigErrors } from './EconomyConfigErrors';
import { LedgerManager, LedgerEntryType } from '../Ledger';

// ============================================================================
// Types
// ============================================================================

export type RechargeId = string;
export type BonusCreditId = string;

export interface RechargeContext {
  readonly playerId: PlayerId;
  readonly amount: number;
  readonly currentBalance: number;
  readonly source?: string;
  readonly timestamp?: number;
}

export interface RechargeValidation {
  readonly valid: boolean;
  readonly bonusAmount?: number;
  readonly bonusLocked?: boolean;
  readonly reason?: string;
}

export interface RechargeResult {
  readonly rechargeId: RechargeId;
  readonly playerId: PlayerId;
  readonly amount: number;
  readonly bonusAmount: number;
  readonly bonusLocked: boolean;
  readonly totalCredits: number;
  readonly configHash: string;
  readonly timestamp: number;
  readonly settlementStatus: 'immediate' | 'pending';
  readonly settlementDeadline?: number;
}

export interface BonusCredit {
  readonly creditId: BonusCreditId;
  readonly playerId: PlayerId;
  readonly amount: number;
  readonly remainingAmount: number;
  readonly locked: boolean;
  readonly wagerRequired: number;
  readonly wagerCompleted: number;
  readonly expiresAt: number;
  readonly createdAt: number;
  readonly source: string;
}

export interface PlayerRechargeHistory {
  readonly playerId: PlayerId;
  readonly dailyTotal: number;
  readonly weeklyTotal: number;
  readonly lastRechargeAt: number;
  readonly rechargeCount: number;
}

// ============================================================================
// Recharge Tracker
// ============================================================================

export class RechargeTracker {
  private history: Map<PlayerId, PlayerRechargeHistory>;
  private bonusCredits: Map<BonusCreditId, BonusCredit>;
  private playerBonuses: Map<PlayerId, Set<BonusCreditId>>;

  constructor() {
    this.history = new Map();
    this.bonusCredits = new Map();
    this.playerBonuses = new Map();
  }

  /**
   * Get player recharge history
   */
  getHistory(playerId: PlayerId): PlayerRechargeHistory {
    return this.history.get(playerId) ?? {
      playerId,
      dailyTotal: 0,
      weeklyTotal: 0,
      lastRechargeAt: 0,
      rechargeCount: 0,
    };
  }

  /**
   * Record a recharge
   */
  recordRecharge(playerId: PlayerId, amount: number, timestamp: number): void {
    const current = this.getHistory(playerId);
    const now = timestamp;
    const dayStart = this.getDayStart(now);
    const weekStart = this.getWeekStart(now);

    // Reset daily if new day
    const dailyTotal = this.getDayStart(current.lastRechargeAt) === dayStart
      ? current.dailyTotal + amount
      : amount;

    // Reset weekly if new week
    const weeklyTotal = this.getWeekStart(current.lastRechargeAt) === weekStart
      ? current.weeklyTotal + amount
      : amount;

    this.history.set(playerId, {
      playerId,
      dailyTotal,
      weeklyTotal,
      lastRechargeAt: now,
      rechargeCount: current.rechargeCount + 1,
    });
  }

  /**
   * Check if cooldown is active
   */
  isCooldownActive(playerId: PlayerId, cooldownMs: number, now: number): boolean {
    if (cooldownMs <= 0) return false;
    const history = this.getHistory(playerId);
    return now - history.lastRechargeAt < cooldownMs;
  }

  /**
   * Get remaining cooldown
   */
  getRemainingCooldown(playerId: PlayerId, cooldownMs: number, now: number): number {
    if (cooldownMs <= 0) return 0;
    const history = this.getHistory(playerId);
    const elapsed = now - history.lastRechargeAt;
    return Math.max(0, cooldownMs - elapsed);
  }

  /**
   * Add bonus credit
   */
  addBonusCredit(credit: BonusCredit): void {
    this.bonusCredits.set(credit.creditId, credit);

    let playerSet = this.playerBonuses.get(credit.playerId);
    if (!playerSet) {
      playerSet = new Set();
      this.playerBonuses.set(credit.playerId, playerSet);
    }
    playerSet.add(credit.creditId);
  }

  /**
   * Get player's bonus credits
   */
  getPlayerBonusCredits(playerId: PlayerId): readonly BonusCredit[] {
    const creditIds = this.playerBonuses.get(playerId);
    if (!creditIds) return [];

    const credits: BonusCredit[] = [];
    for (const id of creditIds) {
      const credit = this.bonusCredits.get(id);
      if (credit) credits.push(credit);
    }
    return credits;
  }

  /**
   * Get total locked bonus chips
   */
  getTotalLockedBonus(playerId: PlayerId): number {
    const credits = this.getPlayerBonusCredits(playerId);
    return credits
      .filter(c => c.locked && c.remainingAmount > 0)
      .reduce((sum, c) => sum + c.remainingAmount, 0);
  }

  /**
   * Update wager progress on bonus
   */
  updateWagerProgress(creditId: BonusCreditId, wagerAmount: number): BonusCredit | null {
    const credit = this.bonusCredits.get(creditId);
    if (!credit) return null;

    const newWagerCompleted = credit.wagerCompleted + wagerAmount;
    const unlocked = newWagerCompleted >= credit.wagerRequired;

    const updated: BonusCredit = {
      ...credit,
      wagerCompleted: newWagerCompleted,
      locked: credit.locked && !unlocked,
    };

    this.bonusCredits.set(creditId, updated);
    return updated;
  }

  /**
   * Clear expired bonuses
   */
  clearExpiredBonuses(now: number): number {
    let cleared = 0;
    for (const [id, credit] of this.bonusCredits) {
      if (credit.expiresAt < now) {
        this.bonusCredits.delete(id);
        const playerSet = this.playerBonuses.get(credit.playerId);
        if (playerSet) playerSet.delete(id);
        cleared++;
      }
    }
    return cleared;
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.history.clear();
    this.bonusCredits.clear();
    this.playerBonuses.clear();
  }

  private getDayStart(timestamp: number): number {
    const date = new Date(timestamp);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
  }

  private getWeekStart(timestamp: number): number {
    const date = new Date(timestamp);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - date.getDay());
    return date.getTime();
  }
}

// ============================================================================
// Recharge Policy Evaluator
// ============================================================================

export class RechargePolicyEvaluator {
  private config: EconomyConfig;
  private tracker: RechargeTracker;
  private ledger?: LedgerManager;

  constructor(config: EconomyConfig, tracker?: RechargeTracker, ledger?: LedgerManager) {
    this.config = config;
    this.tracker = tracker ?? new RechargeTracker();
    this.ledger = ledger;
  }

  /**
   * Validate a recharge request
   */
  validateRecharge(context: RechargeContext): RechargeValidation {
    const rules = this.config.recharge;
    const now = context.timestamp ?? Date.now();

    // Check minimum
    if (context.amount < rules.minRecharge) {
      return {
        valid: false,
        reason: `Recharge ${context.amount} below minimum ${rules.minRecharge}`,
      };
    }

    // Check maximum
    if (context.amount > rules.maxRecharge) {
      return {
        valid: false,
        reason: `Recharge ${context.amount} exceeds maximum ${rules.maxRecharge}`,
      };
    }

    // Check cooldown
    if (this.tracker.isCooldownActive(context.playerId, rules.cooldownMs, now)) {
      const remaining = this.tracker.getRemainingCooldown(context.playerId, rules.cooldownMs, now);
      return {
        valid: false,
        reason: `Cooldown active, ${remaining}ms remaining`,
      };
    }

    // Check daily limit
    if (rules.dailyLimit > 0) {
      const history = this.tracker.getHistory(context.playerId);
      if (history.dailyTotal + context.amount > rules.dailyLimit) {
        return {
          valid: false,
          reason: `Would exceed daily limit: ${history.dailyTotal + context.amount}/${rules.dailyLimit}`,
        };
      }
    }

    // Check weekly limit
    if (rules.weeklyLimit > 0) {
      const history = this.tracker.getHistory(context.playerId);
      if (history.weeklyTotal + context.amount > rules.weeklyLimit) {
        return {
          valid: false,
          reason: `Would exceed weekly limit: ${history.weeklyTotal + context.amount}/${rules.weeklyLimit}`,
        };
      }
    }

    // Calculate bonus
    let bonusAmount = 0;
    let bonusLocked = false;

    if (rules.bonusCredit?.enabled) {
      bonusAmount = Math.min(
        Math.floor(context.amount * (rules.bonusCredit.percentage / 100)),
        rules.bonusCredit.maxBonus
      );
      bonusLocked = rules.bonusCredit.lockedUntilWagered;
    }

    return {
      valid: true,
      bonusAmount,
      bonusLocked,
    };
  }

  /**
   * Execute a recharge
   */
  executeRecharge(context: RechargeContext): RechargeResult {
    const validation = this.validateRecharge(context);
    const now = context.timestamp ?? Date.now();

    if (!validation.valid) {
      if (validation.reason?.includes('below minimum')) {
        throw EconomyConfigErrors.rechargeBelowMinimum(context.amount, this.config.recharge.minRecharge);
      }
      if (validation.reason?.includes('exceeds maximum')) {
        throw EconomyConfigErrors.rechargeAboveMaximum(context.amount, this.config.recharge.maxRecharge);
      }
      if (validation.reason?.includes('Cooldown')) {
        const remaining = this.tracker.getRemainingCooldown(
          context.playerId,
          this.config.recharge.cooldownMs,
          now
        );
        throw EconomyConfigErrors.rechargeCooldownActive(remaining);
      }
      if (validation.reason?.includes('daily limit')) {
        const history = this.tracker.getHistory(context.playerId);
        throw EconomyConfigErrors.rechargeLimitExceeded(
          history.dailyTotal,
          this.config.recharge.dailyLimit,
          'daily'
        );
      }
      if (validation.reason?.includes('weekly limit')) {
        const history = this.tracker.getHistory(context.playerId);
        throw EconomyConfigErrors.rechargeLimitExceeded(
          history.weeklyTotal,
          this.config.recharge.weeklyLimit,
          'weekly'
        );
      }
      throw EconomyConfigErrors.invalidRechargeConfig(validation.reason ?? 'Unknown');
    }

    const bonusAmount = validation.bonusAmount ?? 0;
    const bonusLocked = validation.bonusLocked ?? false;
    const rechargeId = this.generateRechargeId();

    // Determine settlement status
    const rules = this.config.recharge;
    const isDelayed = rules.allowDelayedSettlement && context.source === 'delayed';
    const settlementStatus: 'immediate' | 'pending' = isDelayed ? 'pending' : 'immediate';
    const settlementDeadline = isDelayed ? now + rules.delayedSettlementMaxMs : undefined;

    // Record in tracker
    this.tracker.recordRecharge(context.playerId, context.amount, now);

    // Add bonus credit if applicable
    if (bonusAmount > 0) {
      const creditId = `bonus_${rechargeId}`;
      const wagerRequired = bonusLocked
        ? bonusAmount * (rules.bonusCredit?.wagerMultiplier ?? 1)
        : 0;

      this.tracker.addBonusCredit({
        creditId,
        playerId: context.playerId,
        amount: bonusAmount,
        remainingAmount: bonusAmount,
        locked: bonusLocked,
        wagerRequired,
        wagerCompleted: 0,
        expiresAt: now + (this.config.bonus.bonusExpirationDays * 24 * 60 * 60 * 1000),
        createdAt: now,
        source: 'recharge',
      });
    }

    // Record in ledger
    if (this.ledger) {
      this.ledger.record({
        type: LedgerEntryType.DEPOSIT,
        playerId: context.playerId,
        amount: context.amount,
        reason: `Recharge: ${rechargeId}`,
        balanceAfter: context.currentBalance + context.amount,
        metadata: {
          rechargeId,
          source: context.source,
          settlementStatus,
          configHash: this.config.configHash,
        },
      });

      if (bonusAmount > 0) {
        this.ledger.record({
          type: LedgerEntryType.BONUS,
          playerId: context.playerId,
          amount: bonusAmount,
          reason: `Recharge bonus: ${rechargeId}`,
          balanceAfter: context.currentBalance + context.amount + bonusAmount,
          metadata: {
            rechargeId,
            bonusLocked,
            wagerMultiplier: rules.bonusCredit?.wagerMultiplier,
          },
        });
      }
    }

    return {
      rechargeId,
      playerId: context.playerId,
      amount: context.amount,
      bonusAmount,
      bonusLocked,
      totalCredits: context.amount + bonusAmount,
      configHash: this.config.configHash,
      timestamp: now,
      settlementStatus,
      settlementDeadline,
    };
  }

  /**
   * Get player's locked bonus total
   */
  getLockedBonusTotal(playerId: PlayerId): number {
    return this.tracker.getTotalLockedBonus(playerId);
  }

  /**
   * Update wager progress for bonus unlock
   */
  recordWagerForBonus(playerId: PlayerId, wagerAmount: number): number {
    const credits = this.tracker.getPlayerBonusCredits(playerId);
    let unlocked = 0;

    for (const credit of credits) {
      if (credit.locked && credit.wagerCompleted < credit.wagerRequired) {
        const updated = this.tracker.updateWagerProgress(credit.creditId, wagerAmount);
        if (updated && !updated.locked) {
          unlocked += updated.remainingAmount;
        }
      }
    }

    return unlocked;
  }

  /**
   * Get recharge limits
   */
  getLimits(): {
    minRecharge: number;
    maxRecharge: number;
    dailyLimit: number;
    weeklyLimit: number;
  } {
    const rules = this.config.recharge;
    return {
      minRecharge: rules.minRecharge,
      maxRecharge: rules.maxRecharge,
      dailyLimit: rules.dailyLimit,
      weeklyLimit: rules.weeklyLimit,
    };
  }

  /**
   * Get bonus info
   */
  getBonusInfo(): {
    enabled: boolean;
    percentage: number;
    maxBonus: number;
    locked: boolean;
    wagerMultiplier: number;
  } | null {
    const bonus = this.config.recharge.bonusCredit;
    if (!bonus?.enabled) return null;
    return {
      enabled: true,
      percentage: bonus.percentage,
      maxBonus: bonus.maxBonus,
      locked: bonus.lockedUntilWagered,
      wagerMultiplier: bonus.wagerMultiplier,
    };
  }

  /**
   * Get player history
   */
  getPlayerHistory(playerId: PlayerId): PlayerRechargeHistory {
    return this.tracker.getHistory(playerId);
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
  withConfig(config: EconomyConfig): RechargePolicyEvaluator {
    return new RechargePolicyEvaluator(config, this.tracker, this.ledger);
  }

  private generateRechargeId(): RechargeId {
    return `rch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

export function createRechargeEvaluator(
  config: EconomyConfig,
  tracker?: RechargeTracker,
  ledger?: LedgerManager
): RechargePolicyEvaluator {
  return new RechargePolicyEvaluator(config, tracker, ledger);
}

export function createRechargeTracker(): RechargeTracker {
  return new RechargeTracker();
}
