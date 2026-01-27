/**
 * Pot.ts
 * Phase 14 - Main pot management
 *
 * Manages pot contributions per street and tracks total pot.
 * Works with SidePot.ts for all-in situations.
 *
 * Key concepts:
 * - Contribution: Amount a player has put into the pot per street
 * - Total contribution: Sum of all street contributions
 * - Pot is built from committed chips moved from escrow
 */

import { PlayerId } from '../security/Identity';
import { TableId, HandId } from '../security/AuditLog';
import { Street } from '../game/engine/TableState';
import { EconomyErrors } from './EconomyErrors';

// ============================================================================
// Types
// ============================================================================

export type PotId = string;

export interface PlayerContribution {
  readonly playerId: PlayerId;
  readonly amount: number;
  readonly street: Street;
  readonly timestamp: number;
}

export interface StreetContributions {
  readonly street: Street;
  readonly contributions: Map<PlayerId, number>;
  readonly total: number;
}

export interface PotState {
  readonly potId: PotId;
  readonly handId: HandId;
  readonly tableId: TableId;
  readonly mainPot: number;
  readonly contributions: readonly PlayerContribution[];
  readonly contributionsByStreet: Map<Street, StreetContributions>;
  readonly contributionsByPlayer: Map<PlayerId, number>;
  readonly eligiblePlayers: Set<PlayerId>;  // Players eligible to win this pot
  readonly isSettled: boolean;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface PotContributionResult {
  readonly pot: PotState;
  readonly contribution: PlayerContribution;
}

export interface PotSummary {
  readonly potId: PotId;
  readonly handId: HandId;
  readonly total: number;
  readonly contributionsByPlayer: ReadonlyMap<PlayerId, number>;
  readonly eligiblePlayers: readonly PlayerId[];
}

// ============================================================================
// Pot Builder
// ============================================================================

export class PotBuilder {
  private potId: PotId;
  private handId: HandId;
  private tableId: TableId;
  private contributions: PlayerContribution[];
  private contributionsByStreet: Map<Street, StreetContributions>;
  private contributionsByPlayer: Map<PlayerId, number>;
  private eligiblePlayers: Set<PlayerId>;
  private isSettled: boolean;
  private createdAt: number;
  private updatedAt: number;

  constructor(handId: HandId, tableId: TableId) {
    this.potId = `pot_${handId}`;
    this.handId = handId;
    this.tableId = tableId;
    this.contributions = [];
    this.contributionsByStreet = new Map();
    this.contributionsByPlayer = new Map();
    this.eligiblePlayers = new Set();
    this.isSettled = false;
    this.createdAt = Date.now();
    this.updatedAt = this.createdAt;
  }

  /**
   * Add a contribution to the pot
   */
  addContribution(
    playerId: PlayerId,
    amount: number,
    street: Street
  ): PotContributionResult {
    if (this.isSettled) {
      throw EconomyErrors.potAlreadySettled(this.handId);
    }

    if (!Number.isInteger(amount) || amount <= 0) {
      throw EconomyErrors.invalidAmount(amount, 'Pot contribution must be positive integer');
    }

    const contribution: PlayerContribution = {
      playerId,
      amount,
      street,
      timestamp: Date.now(),
    };

    this.contributions.push(contribution);

    // Update street contributions
    let streetContrib = this.contributionsByStreet.get(street);
    if (!streetContrib) {
      streetContrib = {
        street,
        contributions: new Map(),
        total: 0,
      };
    }

    const currentStreetAmount = streetContrib.contributions.get(playerId) ?? 0;
    const newContributions = new Map(streetContrib.contributions);
    newContributions.set(playerId, currentStreetAmount + amount);

    this.contributionsByStreet.set(street, {
      street,
      contributions: newContributions,
      total: streetContrib.total + amount,
    });

    // Update player total contribution
    const currentTotal = this.contributionsByPlayer.get(playerId) ?? 0;
    this.contributionsByPlayer.set(playerId, currentTotal + amount);

    // Add player to eligible set
    this.eligiblePlayers.add(playerId);

    this.updatedAt = Date.now();

    return {
      pot: this.getState(),
      contribution,
    };
  }

  /**
   * Record blind posting
   */
  postBlind(playerId: PlayerId, amount: number): PotContributionResult {
    return this.addContribution(playerId, amount, 'preflop');
  }

  /**
   * Record a bet
   */
  recordBet(
    playerId: PlayerId,
    amount: number,
    street: Street
  ): PotContributionResult {
    return this.addContribution(playerId, amount, street);
  }

  /**
   * Remove player from eligible players (when they fold)
   */
  playerFolded(playerId: PlayerId): void {
    this.eligiblePlayers.delete(playerId);
    this.updatedAt = Date.now();
  }

  /**
   * Get total pot amount
   */
  getTotal(): number {
    let total = 0;
    for (const amount of this.contributionsByPlayer.values()) {
      total += amount;
    }
    return total;
  }

  /**
   * Get contribution for a specific player
   */
  getPlayerContribution(playerId: PlayerId): number {
    return this.contributionsByPlayer.get(playerId) ?? 0;
  }

  /**
   * Get contribution for a player on a specific street
   */
  getPlayerStreetContribution(playerId: PlayerId, street: Street): number {
    const streetContrib = this.contributionsByStreet.get(street);
    if (!streetContrib) return 0;
    return streetContrib.contributions.get(playerId) ?? 0;
  }

  /**
   * Get street total
   */
  getStreetTotal(street: Street): number {
    return this.contributionsByStreet.get(street)?.total ?? 0;
  }

  /**
   * Get all contributions for a street
   */
  getStreetContributions(street: Street): ReadonlyMap<PlayerId, number> {
    const streetContrib = this.contributionsByStreet.get(street);
    if (!streetContrib) return new Map();
    return streetContrib.contributions;
  }

  /**
   * Get list of players who have contributed
   */
  getContributingPlayers(): readonly PlayerId[] {
    return Array.from(this.contributionsByPlayer.keys());
  }

  /**
   * Get eligible players (can win pot)
   */
  getEligiblePlayers(): readonly PlayerId[] {
    return Array.from(this.eligiblePlayers);
  }

  /**
   * Check if pot is settled
   */
  getIsSettled(): boolean {
    return this.isSettled;
  }

  /**
   * Mark pot as settled
   */
  markSettled(): void {
    this.isSettled = true;
    this.updatedAt = Date.now();
  }

  /**
   * Get current pot state
   */
  getState(): PotState {
    return {
      potId: this.potId,
      handId: this.handId,
      tableId: this.tableId,
      mainPot: this.getTotal(),
      contributions: [...this.contributions],
      contributionsByStreet: new Map(this.contributionsByStreet),
      contributionsByPlayer: new Map(this.contributionsByPlayer),
      eligiblePlayers: new Set(this.eligiblePlayers),
      isSettled: this.isSettled,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  /**
   * Get pot summary
   */
  getSummary(): PotSummary {
    return {
      potId: this.potId,
      handId: this.handId,
      total: this.getTotal(),
      contributionsByPlayer: new Map(this.contributionsByPlayer),
      eligiblePlayers: this.getEligiblePlayers(),
    };
  }
}

// ============================================================================
// Pot Manager
// ============================================================================

export class PotManager {
  private pots: Map<HandId, PotBuilder>;

  constructor() {
    this.pots = new Map();
  }

  /**
   * Create a new pot for a hand
   */
  createPot(handId: HandId, tableId: TableId): PotBuilder {
    if (this.pots.has(handId)) {
      throw EconomyErrors.invalidOperation(
        'createPot',
        `Pot already exists for hand ${handId}`
      );
    }

    const pot = new PotBuilder(handId, tableId);
    this.pots.set(handId, pot);
    return pot;
  }

  /**
   * Get pot for a hand
   */
  getPot(handId: HandId): PotBuilder | null {
    return this.pots.get(handId) ?? null;
  }

  /**
   * Get pot (throws if not found)
   */
  requirePot(handId: HandId): PotBuilder {
    const pot = this.getPot(handId);
    if (!pot) {
      throw EconomyErrors.invalidOperation(
        'requirePot',
        `Pot not found for hand ${handId}`
      );
    }
    return pot;
  }

  /**
   * Add contribution to hand's pot
   */
  addContribution(
    handId: HandId,
    playerId: PlayerId,
    amount: number,
    street: Street
  ): PotContributionResult {
    const pot = this.requirePot(handId);
    return pot.addContribution(playerId, amount, street);
  }

  /**
   * Get pot total for a hand
   */
  getPotTotal(handId: HandId): number {
    const pot = this.getPot(handId);
    return pot?.getTotal() ?? 0;
  }

  /**
   * Mark pot as settled
   */
  settlePot(handId: HandId): void {
    const pot = this.requirePot(handId);
    pot.markSettled();
  }

  /**
   * Remove pot (after hand is complete and processed)
   */
  removePot(handId: HandId): void {
    this.pots.delete(handId);
  }

  /**
   * Get all active pots
   */
  getActivePots(): readonly PotBuilder[] {
    return Array.from(this.pots.values()).filter(p => !p.getIsSettled());
  }

  /**
   * Clear all pots (for testing)
   */
  clear(): void {
    this.pots.clear();
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let potManagerInstance: PotManager | null = null;

export function getPotManager(): PotManager {
  if (!potManagerInstance) {
    potManagerInstance = new PotManager();
  }
  return potManagerInstance;
}

export function resetPotManager(): PotManager {
  potManagerInstance = new PotManager();
  return potManagerInstance;
}
