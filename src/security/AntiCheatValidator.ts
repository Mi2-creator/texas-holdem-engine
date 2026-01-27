/**
 * AntiCheatValidator.ts
 * Phase 13 - Anti-cheat validation and detection
 *
 * Validates game actions for cheating patterns and manipulation.
 */

import { SecurityErrors, AntiCheatError } from './SecurityErrors';
import { PlayerId, SessionId } from './Identity';

// ============================================================================
// Types
// ============================================================================

export type TableId = string;
export type HandId = string;

export interface ActionContext {
  readonly playerId: PlayerId;
  readonly sessionId: SessionId;
  readonly tableId: TableId;
  readonly handId?: HandId;
  readonly seatIndex: number;
  readonly timestamp: number;
  readonly sequence?: number;
}

export interface GameState {
  readonly tableId: TableId;
  readonly handId?: HandId;
  readonly currentTurnPlayerId: PlayerId | null;
  readonly currentTurnSeatIndex: number | null;
  readonly pot: number;
  readonly currentBet: number;
  readonly minRaise: number;
  readonly playerStacks: ReadonlyMap<PlayerId, number>;
  readonly playerBets: ReadonlyMap<PlayerId, number>;
  readonly street: string;
  readonly turnStartedAt: number;
  readonly turnTimeoutMs: number;
}

export interface ActionValidation {
  readonly actionType: string;
  readonly amount?: number;
  readonly allIn?: boolean;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly violations: readonly Violation[];
}

export interface Violation {
  readonly type: ViolationType;
  readonly severity: 'warning' | 'violation' | 'critical';
  readonly message: string;
  readonly context?: Record<string, unknown>;
}

export enum ViolationType {
  TURN_SPOOFING = 'turn_spoofing',
  TIMING_VIOLATION = 'timing_violation',
  SEQUENCE_REPLAY = 'sequence_replay',
  STACK_MANIPULATION = 'stack_manipulation',
  BET_MANIPULATION = 'bet_manipulation',
  CARD_MANIPULATION = 'card_manipulation',
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
  SUSPICIOUS_PATTERN = 'suspicious_pattern',
}

export interface RateLimitConfig {
  readonly maxActionsPerWindow: number;
  readonly windowMs: number;
}

export interface AntiCheatConfig {
  readonly enableTurnValidation: boolean;
  readonly enableTimingValidation: boolean;
  readonly enableSequenceValidation: boolean;
  readonly enableStackValidation: boolean;
  readonly enableBetValidation: boolean;
  readonly enableRateLimit: boolean;
  readonly rateLimitConfig: RateLimitConfig;
  readonly timingToleranceMs: number;
  readonly strictMode: boolean;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: AntiCheatConfig = {
  enableTurnValidation: true,
  enableTimingValidation: true,
  enableSequenceValidation: true,
  enableStackValidation: true,
  enableBetValidation: true,
  enableRateLimit: true,
  rateLimitConfig: {
    maxActionsPerWindow: 10,
    windowMs: 1000,
  },
  timingToleranceMs: 500, // Allow 500ms tolerance for latency
  strictMode: false,
};

// ============================================================================
// Anti-Cheat Validator
// ============================================================================

export class AntiCheatValidator {
  private config: AntiCheatConfig;
  private processedSequences: Map<TableId, Set<number>>;
  private actionHistory: Map<PlayerId, number[]>;
  private violationCounts: Map<PlayerId, Map<ViolationType, number>>;
  private suspiciousPlayers: Set<PlayerId>;

  constructor(config: Partial<AntiCheatConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.processedSequences = new Map();
    this.actionHistory = new Map();
    this.violationCounts = new Map();
    this.suspiciousPlayers = new Set();
  }

  /**
   * Validate a complete action
   */
  validateAction(
    context: ActionContext,
    gameState: GameState,
    action: ActionValidation
  ): ValidationResult {
    const violations: Violation[] = [];

    // Turn validation
    if (this.config.enableTurnValidation) {
      const turnResult = this.validateTurn(context, gameState);
      if (!turnResult.valid) {
        violations.push(...turnResult.violations);
      }
    }

    // Timing validation
    if (this.config.enableTimingValidation) {
      const timingResult = this.validateTiming(context, gameState);
      if (!timingResult.valid) {
        violations.push(...timingResult.violations);
      }
    }

    // Sequence validation
    if (this.config.enableSequenceValidation && context.sequence !== undefined) {
      const seqResult = this.validateSequence(context);
      if (!seqResult.valid) {
        violations.push(...seqResult.violations);
      }
    }

    // Stack validation
    if (this.config.enableStackValidation) {
      const stackResult = this.validateStack(context, gameState, action);
      if (!stackResult.valid) {
        violations.push(...stackResult.violations);
      }
    }

    // Bet validation
    if (this.config.enableBetValidation && action.amount !== undefined) {
      const betResult = this.validateBet(context, gameState, action);
      if (!betResult.valid) {
        violations.push(...betResult.violations);
      }
    }

    // Rate limit validation
    if (this.config.enableRateLimit) {
      const rateResult = this.validateRateLimit(context);
      if (!rateResult.valid) {
        violations.push(...rateResult.violations);
      }
    }

    // Track violations
    this.recordViolations(context.playerId, violations);

    // Check if player becomes suspicious
    this.updateSuspiciousStatus(context.playerId);

    return {
      valid: violations.length === 0,
      violations,
    };
  }

  /**
   * Validate turn ownership
   */
  validateTurn(context: ActionContext, gameState: GameState): ValidationResult {
    const violations: Violation[] = [];

    if (gameState.currentTurnPlayerId === null) {
      violations.push({
        type: ViolationType.TURN_SPOOFING,
        severity: 'violation',
        message: 'No active turn',
        context: { playerId: context.playerId },
      });
      return { valid: false, violations };
    }

    if (gameState.currentTurnPlayerId !== context.playerId) {
      violations.push({
        type: ViolationType.TURN_SPOOFING,
        severity: 'critical',
        message: `Turn spoofing: ${context.playerId} acted during ${gameState.currentTurnPlayerId}'s turn`,
        context: {
          actingPlayer: context.playerId,
          expectedPlayer: gameState.currentTurnPlayerId,
        },
      });
    }

    if (gameState.currentTurnSeatIndex !== context.seatIndex) {
      violations.push({
        type: ViolationType.TURN_SPOOFING,
        severity: 'critical',
        message: `Seat mismatch: claimed seat ${context.seatIndex}, expected ${gameState.currentTurnSeatIndex}`,
        context: {
          claimedSeat: context.seatIndex,
          expectedSeat: gameState.currentTurnSeatIndex,
        },
      });
    }

    return { valid: violations.length === 0, violations };
  }

  /**
   * Validate action timing
   */
  validateTiming(context: ActionContext, gameState: GameState): ValidationResult {
    const violations: Violation[] = [];
    const elapsed = context.timestamp - gameState.turnStartedAt;
    const allowed = gameState.turnTimeoutMs + this.config.timingToleranceMs;

    if (elapsed > allowed) {
      violations.push({
        type: ViolationType.TIMING_VIOLATION,
        severity: 'warning',
        message: `Action after timeout: ${elapsed}ms (allowed: ${allowed}ms)`,
        context: {
          elapsed,
          allowed,
          turnStartedAt: gameState.turnStartedAt,
          actionTimestamp: context.timestamp,
        },
      });
    }

    if (elapsed < 0) {
      // Action timestamp before turn started - possible time manipulation
      violations.push({
        type: ViolationType.TIMING_VIOLATION,
        severity: 'violation',
        message: `Action timestamp before turn started`,
        context: {
          elapsed,
          turnStartedAt: gameState.turnStartedAt,
          actionTimestamp: context.timestamp,
        },
      });
    }

    return { valid: violations.length === 0, violations };
  }

  /**
   * Validate sequence numbers (replay protection)
   */
  validateSequence(context: ActionContext): ValidationResult {
    const violations: Violation[] = [];

    if (context.sequence === undefined) {
      return { valid: true, violations };
    }

    let tableSequences = this.processedSequences.get(context.tableId);
    if (!tableSequences) {
      tableSequences = new Set();
      this.processedSequences.set(context.tableId, tableSequences);
    }

    if (tableSequences.has(context.sequence)) {
      violations.push({
        type: ViolationType.SEQUENCE_REPLAY,
        severity: 'critical',
        message: `Sequence replay detected: ${context.sequence}`,
        context: {
          sequence: context.sequence,
          tableId: context.tableId,
        },
      });
    } else {
      tableSequences.add(context.sequence);

      // Prune old sequences to prevent memory growth
      if (tableSequences.size > 1000) {
        const sortedSeqs = Array.from(tableSequences).sort((a, b) => a - b);
        const toRemove = sortedSeqs.slice(0, 500);
        for (const seq of toRemove) {
          tableSequences.delete(seq);
        }
      }
    }

    return { valid: violations.length === 0, violations };
  }

  /**
   * Validate stack consistency
   */
  validateStack(
    context: ActionContext,
    gameState: GameState,
    action: ActionValidation
  ): ValidationResult {
    const violations: Violation[] = [];
    const playerStack = gameState.playerStacks.get(context.playerId);

    if (playerStack === undefined) {
      violations.push({
        type: ViolationType.STACK_MANIPULATION,
        severity: 'violation',
        message: `Player stack not found`,
        context: { playerId: context.playerId },
      });
      return { valid: false, violations };
    }

    // Check if action amount exceeds stack
    if (action.amount !== undefined) {
      const playerBet = gameState.playerBets.get(context.playerId) ?? 0;
      const totalRequired = action.amount;
      const availableForBet = playerStack;

      if (totalRequired > availableForBet && !action.allIn) {
        violations.push({
          type: ViolationType.STACK_MANIPULATION,
          severity: 'critical',
          message: `Bet exceeds stack: ${totalRequired} > ${availableForBet}`,
          context: {
            betAmount: totalRequired,
            availableStack: availableForBet,
            playerId: context.playerId,
          },
        });
      }
    }

    return { valid: violations.length === 0, violations };
  }

  /**
   * Validate bet amounts
   */
  validateBet(
    context: ActionContext,
    gameState: GameState,
    action: ActionValidation
  ): ValidationResult {
    const violations: Violation[] = [];

    if (action.amount === undefined) {
      return { valid: true, violations };
    }

    const playerStack = gameState.playerStacks.get(context.playerId) ?? 0;
    const playerBet = gameState.playerBets.get(context.playerId) ?? 0;

    // For raise/bet actions
    if (action.actionType === 'bet' || action.actionType === 'raise') {
      const minValid = gameState.currentBet + gameState.minRaise;
      const maxValid = playerStack + playerBet;

      // Check minimum (unless all-in)
      if (action.amount < minValid && action.amount < maxValid) {
        violations.push({
          type: ViolationType.BET_MANIPULATION,
          severity: 'violation',
          message: `Bet below minimum: ${action.amount} < ${minValid}`,
          context: {
            betAmount: action.amount,
            minRequired: minValid,
            currentBet: gameState.currentBet,
            minRaise: gameState.minRaise,
          },
        });
      }

      // Check maximum
      if (action.amount > maxValid) {
        violations.push({
          type: ViolationType.BET_MANIPULATION,
          severity: 'critical',
          message: `Bet exceeds maximum: ${action.amount} > ${maxValid}`,
          context: {
            betAmount: action.amount,
            maxAllowed: maxValid,
          },
        });
      }
    }

    // For call actions
    if (action.actionType === 'call') {
      const callAmount = Math.min(gameState.currentBet - playerBet, playerStack);
      // Allow some tolerance for rounding
      if (Math.abs(action.amount - callAmount) > 1) {
        violations.push({
          type: ViolationType.BET_MANIPULATION,
          severity: 'violation',
          message: `Call amount mismatch: ${action.amount} != ${callAmount}`,
          context: {
            calledAmount: action.amount,
            expectedAmount: callAmount,
          },
        });
      }
    }

    return { valid: violations.length === 0, violations };
  }

  /**
   * Validate rate limit
   */
  validateRateLimit(context: ActionContext): ValidationResult {
    const violations: Violation[] = [];
    const { maxActionsPerWindow, windowMs } = this.config.rateLimitConfig;

    let history = this.actionHistory.get(context.playerId);
    if (!history) {
      history = [];
      this.actionHistory.set(context.playerId, history);
    }

    const now = context.timestamp;
    const windowStart = now - windowMs;

    // Remove old entries
    const recentActions = history.filter(t => t > windowStart);
    this.actionHistory.set(context.playerId, recentActions);

    if (recentActions.length >= maxActionsPerWindow) {
      violations.push({
        type: ViolationType.RATE_LIMIT_EXCEEDED,
        severity: 'warning',
        message: `Rate limit exceeded: ${recentActions.length} actions in ${windowMs}ms`,
        context: {
          actions: recentActions.length,
          limit: maxActionsPerWindow,
          windowMs,
        },
      });
    } else {
      recentActions.push(now);
    }

    return { valid: violations.length === 0, violations };
  }

  /**
   * Validate action is from correct session
   */
  validateSessionOwnership(
    actionSessionId: SessionId,
    expectedSessionId: SessionId
  ): ValidationResult {
    const violations: Violation[] = [];

    if (actionSessionId !== expectedSessionId) {
      violations.push({
        type: ViolationType.TURN_SPOOFING,
        severity: 'critical',
        message: `Session mismatch: action from ${actionSessionId}, expected ${expectedSessionId}`,
        context: {
          actionSession: actionSessionId,
          expectedSession: expectedSessionId,
        },
      });
    }

    return { valid: violations.length === 0, violations };
  }

  /**
   * Record violations for a player
   */
  private recordViolations(playerId: PlayerId, violations: readonly Violation[]): void {
    let playerViolations = this.violationCounts.get(playerId);
    if (!playerViolations) {
      playerViolations = new Map();
      this.violationCounts.set(playerId, playerViolations);
    }

    for (const violation of violations) {
      const count = playerViolations.get(violation.type) ?? 0;
      playerViolations.set(violation.type, count + 1);
    }
  }

  /**
   * Update suspicious status based on violation history
   */
  private updateSuspiciousStatus(playerId: PlayerId): void {
    const playerViolations = this.violationCounts.get(playerId);
    if (!playerViolations) return;

    let totalScore = 0;
    for (const [type, count] of playerViolations) {
      // Weight critical violations more heavily
      const weight = this.getViolationWeight(type);
      totalScore += count * weight;
    }

    // Mark as suspicious if score exceeds threshold
    if (totalScore >= 10) {
      this.suspiciousPlayers.add(playerId);
    }
  }

  /**
   * Get violation weight for scoring
   */
  private getViolationWeight(type: ViolationType): number {
    switch (type) {
      case ViolationType.TURN_SPOOFING:
      case ViolationType.SEQUENCE_REPLAY:
      case ViolationType.STACK_MANIPULATION:
      case ViolationType.CARD_MANIPULATION:
        return 5;
      case ViolationType.BET_MANIPULATION:
        return 3;
      case ViolationType.TIMING_VIOLATION:
      case ViolationType.RATE_LIMIT_EXCEEDED:
        return 1;
      case ViolationType.SUSPICIOUS_PATTERN:
        return 2;
      default:
        return 1;
    }
  }

  /**
   * Check if player is flagged as suspicious
   */
  isSuspicious(playerId: PlayerId): boolean {
    return this.suspiciousPlayers.has(playerId);
  }

  /**
   * Get violation count for a player
   */
  getViolationCount(playerId: PlayerId, type?: ViolationType): number {
    const playerViolations = this.violationCounts.get(playerId);
    if (!playerViolations) return 0;

    if (type) {
      return playerViolations.get(type) ?? 0;
    }

    let total = 0;
    for (const count of playerViolations.values()) {
      total += count;
    }
    return total;
  }

  /**
   * Clear violation history for a player
   */
  clearViolations(playerId: PlayerId): void {
    this.violationCounts.delete(playerId);
    this.suspiciousPlayers.delete(playerId);
  }

  /**
   * Reset table sequences (e.g., on new hand)
   */
  resetTableSequences(tableId: TableId): void {
    this.processedSequences.delete(tableId);
  }

  /**
   * Get all suspicious players
   */
  getSuspiciousPlayers(): readonly PlayerId[] {
    return Array.from(this.suspiciousPlayers);
  }

  /**
   * Get configuration
   */
  getConfig(): AntiCheatConfig {
    return this.config;
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<AntiCheatConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * Clear all state (for testing)
   */
  clear(): void {
    this.processedSequences.clear();
    this.actionHistory.clear();
    this.violationCounts.clear();
    this.suspiciousPlayers.clear();
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Require action passes validation (throws on failure)
 */
export function requireValidAction(
  validator: AntiCheatValidator,
  context: ActionContext,
  gameState: GameState,
  action: ActionValidation
): void {
  const result = validator.validateAction(context, gameState, action);

  if (!result.valid) {
    const critical = result.violations.find(v => v.severity === 'critical');
    if (critical) {
      switch (critical.type) {
        case ViolationType.TURN_SPOOFING:
          throw SecurityErrors.turnSpoofing(
            context.playerId,
            gameState.currentTurnPlayerId ?? 'unknown'
          );
        case ViolationType.SEQUENCE_REPLAY:
          throw SecurityErrors.sequenceReplay(
            context.sequence ?? 0,
            0
          );
        case ViolationType.STACK_MANIPULATION:
          throw SecurityErrors.stackManipulation(
            context.playerId,
            action.amount ?? 0,
            gameState.playerStacks.get(context.playerId) ?? 0
          );
        case ViolationType.BET_MANIPULATION:
          throw SecurityErrors.betManipulation(
            context.playerId,
            action.amount ?? 0,
            { min: gameState.currentBet + gameState.minRaise, max: gameState.playerStacks.get(context.playerId) ?? 0 }
          );
        default:
          throw SecurityErrors.suspiciousActivity(context.playerId, critical.message);
      }
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let antiCheatValidatorInstance: AntiCheatValidator | null = null;

export function getAntiCheatValidator(): AntiCheatValidator {
  if (!antiCheatValidatorInstance) {
    antiCheatValidatorInstance = new AntiCheatValidator();
  }
  return antiCheatValidatorInstance;
}

export function resetAntiCheatValidator(
  config?: Partial<AntiCheatConfig>
): AntiCheatValidator {
  antiCheatValidatorInstance = new AntiCheatValidator(config);
  return antiCheatValidatorInstance;
}
