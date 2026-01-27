/**
 * EconomyConfigErrors.ts
 * Phase 15 - Typed errors for configurable economy system
 *
 * Deterministic, machine-readable error codes for all config violations.
 */

// ============================================================================
// Error Codes
// ============================================================================

export enum EconomyConfigErrorCode {
  // Rake configuration errors
  INVALID_RAKE_PERCENTAGE = 'INVALID_RAKE_PERCENTAGE',
  INVALID_RAKE_CAP = 'INVALID_RAKE_CAP',
  INVALID_RAKE_STREET_CONFIG = 'INVALID_RAKE_STREET_CONFIG',
  RAKE_POLICY_MISMATCH = 'RAKE_POLICY_MISMATCH',

  // Buy-in errors
  BUY_IN_BELOW_MINIMUM = 'BUY_IN_BELOW_MINIMUM',
  BUY_IN_ABOVE_MAXIMUM = 'BUY_IN_ABOVE_MAXIMUM',
  BUY_IN_EXCEEDS_BALANCE = 'BUY_IN_EXCEEDS_BALANCE',
  BUY_IN_NOT_ALLOWED = 'BUY_IN_NOT_ALLOWED',
  INVALID_BUY_IN_RANGE = 'INVALID_BUY_IN_RANGE',

  // Recharge errors
  RECHARGE_BELOW_MINIMUM = 'RECHARGE_BELOW_MINIMUM',
  RECHARGE_ABOVE_MAXIMUM = 'RECHARGE_ABOVE_MAXIMUM',
  RECHARGE_COOLDOWN_ACTIVE = 'RECHARGE_COOLDOWN_ACTIVE',
  RECHARGE_LIMIT_EXCEEDED = 'RECHARGE_LIMIT_EXCEEDED',
  INVALID_RECHARGE_CONFIG = 'INVALID_RECHARGE_CONFIG',

  // Bonus errors
  BONUS_EXPIRED = 'BONUS_EXPIRED',
  BONUS_NOT_FOUND = 'BONUS_NOT_FOUND',
  BONUS_ALREADY_CLAIMED = 'BONUS_ALREADY_CLAIMED',
  BONUS_REQUIREMENTS_NOT_MET = 'BONUS_REQUIREMENTS_NOT_MET',
  INVALID_BONUS_CONFIG = 'INVALID_BONUS_CONFIG',
  BONUS_LOCKED_CHIPS_VIOLATION = 'BONUS_LOCKED_CHIPS_VIOLATION',

  // Config validation errors
  INVALID_CONFIG_SCHEMA = 'INVALID_CONFIG_SCHEMA',
  CONFIG_VERSION_MISMATCH = 'CONFIG_VERSION_MISMATCH',
  CONFIG_HASH_MISMATCH = 'CONFIG_HASH_MISMATCH',

  // Fee errors
  INVALID_FEE_STRUCTURE = 'INVALID_FEE_STRUCTURE',
  FEE_EXCEEDS_LIMIT = 'FEE_EXCEEDS_LIMIT',
}

// ============================================================================
// Base Error Class
// ============================================================================

export class EconomyConfigError extends Error {
  readonly code: EconomyConfigErrorCode;
  readonly details: Record<string, unknown>;
  readonly timestamp: number;

  constructor(
    code: EconomyConfigErrorCode,
    message: string,
    details: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = 'EconomyConfigError';
    this.code = code;
    this.details = details;
    this.timestamp = Date.now();
    Object.setPrototypeOf(this, EconomyConfigError.prototype);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
      timestamp: this.timestamp,
    };
  }
}

// ============================================================================
// Specialized Error Classes
// ============================================================================

export class InvalidRakeConfigError extends EconomyConfigError {
  constructor(reason: string, details: Record<string, unknown> = {}) {
    super(
      EconomyConfigErrorCode.INVALID_RAKE_PERCENTAGE,
      `Invalid rake configuration: ${reason}`,
      { reason, ...details }
    );
    this.name = 'InvalidRakeConfigError';
  }
}

export class BuyInViolationError extends EconomyConfigError {
  constructor(
    code: EconomyConfigErrorCode,
    message: string,
    details: Record<string, unknown> = {}
  ) {
    super(code, message, details);
    this.name = 'BuyInViolationError';
  }
}

export class RechargeViolationError extends EconomyConfigError {
  constructor(
    code: EconomyConfigErrorCode,
    message: string,
    details: Record<string, unknown> = {}
  ) {
    super(code, message, details);
    this.name = 'RechargeViolationError';
  }
}

export class BonusMisconfigurationError extends EconomyConfigError {
  constructor(
    code: EconomyConfigErrorCode,
    message: string,
    details: Record<string, unknown> = {}
  ) {
    super(code, message, details);
    this.name = 'BonusMisconfigurationError';
  }
}

// ============================================================================
// Error Factory
// ============================================================================

export const EconomyConfigErrors = {
  // Rake errors
  invalidRakePercentage: (percentage: number) =>
    new InvalidRakeConfigError(`Rake percentage ${percentage} must be between 0 and 100`, {
      percentage,
    }),

  invalidRakeCap: (cap: number) =>
    new InvalidRakeConfigError(`Rake cap ${cap} must be non-negative`, { cap }),

  invalidRakeStreetConfig: (street: string, reason: string) =>
    new EconomyConfigError(
      EconomyConfigErrorCode.INVALID_RAKE_STREET_CONFIG,
      `Invalid rake config for street ${street}: ${reason}`,
      { street, reason }
    ),

  rakePolicyMismatch: (expected: string, actual: string) =>
    new EconomyConfigError(
      EconomyConfigErrorCode.RAKE_POLICY_MISMATCH,
      `Rake policy mismatch: expected ${expected}, got ${actual}`,
      { expected, actual }
    ),

  // Buy-in errors
  buyInBelowMinimum: (amount: number, minimum: number) =>
    new BuyInViolationError(
      EconomyConfigErrorCode.BUY_IN_BELOW_MINIMUM,
      `Buy-in ${amount} is below minimum ${minimum}`,
      { amount, minimum }
    ),

  buyInAboveMaximum: (amount: number, maximum: number) =>
    new BuyInViolationError(
      EconomyConfigErrorCode.BUY_IN_ABOVE_MAXIMUM,
      `Buy-in ${amount} exceeds maximum ${maximum}`,
      { amount, maximum }
    ),

  buyInExceedsBalance: (amount: number, balance: number) =>
    new BuyInViolationError(
      EconomyConfigErrorCode.BUY_IN_EXCEEDS_BALANCE,
      `Buy-in ${amount} exceeds available balance ${balance}`,
      { amount, balance }
    ),

  buyInNotAllowed: (reason: string) =>
    new BuyInViolationError(
      EconomyConfigErrorCode.BUY_IN_NOT_ALLOWED,
      `Buy-in not allowed: ${reason}`,
      { reason }
    ),

  invalidBuyInRange: (min: number, max: number) =>
    new BuyInViolationError(
      EconomyConfigErrorCode.INVALID_BUY_IN_RANGE,
      `Invalid buy-in range: min ${min} > max ${max}`,
      { min, max }
    ),

  // Recharge errors
  rechargeBelowMinimum: (amount: number, minimum: number) =>
    new RechargeViolationError(
      EconomyConfigErrorCode.RECHARGE_BELOW_MINIMUM,
      `Recharge ${amount} is below minimum ${minimum}`,
      { amount, minimum }
    ),

  rechargeAboveMaximum: (amount: number, maximum: number) =>
    new RechargeViolationError(
      EconomyConfigErrorCode.RECHARGE_ABOVE_MAXIMUM,
      `Recharge ${amount} exceeds maximum ${maximum}`,
      { amount, maximum }
    ),

  rechargeCooldownActive: (remainingMs: number) =>
    new RechargeViolationError(
      EconomyConfigErrorCode.RECHARGE_COOLDOWN_ACTIVE,
      `Recharge cooldown active, ${remainingMs}ms remaining`,
      { remainingMs }
    ),

  rechargeLimitExceeded: (current: number, limit: number, period: string) =>
    new RechargeViolationError(
      EconomyConfigErrorCode.RECHARGE_LIMIT_EXCEEDED,
      `Recharge limit exceeded: ${current}/${limit} in ${period}`,
      { current, limit, period }
    ),

  invalidRechargeConfig: (reason: string) =>
    new RechargeViolationError(
      EconomyConfigErrorCode.INVALID_RECHARGE_CONFIG,
      `Invalid recharge configuration: ${reason}`,
      { reason }
    ),

  // Bonus errors
  bonusExpired: (bonusId: string, expiredAt: number) =>
    new BonusMisconfigurationError(
      EconomyConfigErrorCode.BONUS_EXPIRED,
      `Bonus ${bonusId} expired at ${new Date(expiredAt).toISOString()}`,
      { bonusId, expiredAt }
    ),

  bonusNotFound: (bonusId: string) =>
    new BonusMisconfigurationError(
      EconomyConfigErrorCode.BONUS_NOT_FOUND,
      `Bonus ${bonusId} not found`,
      { bonusId }
    ),

  bonusAlreadyClaimed: (bonusId: string, playerId: string) =>
    new BonusMisconfigurationError(
      EconomyConfigErrorCode.BONUS_ALREADY_CLAIMED,
      `Bonus ${bonusId} already claimed by player ${playerId}`,
      { bonusId, playerId }
    ),

  bonusRequirementsNotMet: (bonusId: string, reason: string) =>
    new BonusMisconfigurationError(
      EconomyConfigErrorCode.BONUS_REQUIREMENTS_NOT_MET,
      `Bonus ${bonusId} requirements not met: ${reason}`,
      { bonusId, reason }
    ),

  invalidBonusConfig: (reason: string) =>
    new BonusMisconfigurationError(
      EconomyConfigErrorCode.INVALID_BONUS_CONFIG,
      `Invalid bonus configuration: ${reason}`,
      { reason }
    ),

  bonusLockedChipsViolation: (bonusId: string, attempted: number, locked: number) =>
    new BonusMisconfigurationError(
      EconomyConfigErrorCode.BONUS_LOCKED_CHIPS_VIOLATION,
      `Cannot use ${attempted} locked bonus chips from ${bonusId}, only ${locked} available`,
      { bonusId, attempted, locked }
    ),

  // Config errors
  invalidConfigSchema: (reason: string) =>
    new EconomyConfigError(
      EconomyConfigErrorCode.INVALID_CONFIG_SCHEMA,
      `Invalid config schema: ${reason}`,
      { reason }
    ),

  configVersionMismatch: (expected: string, actual: string) =>
    new EconomyConfigError(
      EconomyConfigErrorCode.CONFIG_VERSION_MISMATCH,
      `Config version mismatch: expected ${expected}, got ${actual}`,
      { expected, actual }
    ),

  configHashMismatch: (expected: string, actual: string) =>
    new EconomyConfigError(
      EconomyConfigErrorCode.CONFIG_HASH_MISMATCH,
      `Config hash mismatch: expected ${expected}, got ${actual}`,
      { expected, actual }
    ),

  // Fee errors
  invalidFeeStructure: (reason: string) =>
    new EconomyConfigError(
      EconomyConfigErrorCode.INVALID_FEE_STRUCTURE,
      `Invalid fee structure: ${reason}`,
      { reason }
    ),

  feeExceedsLimit: (fee: number, limit: number) =>
    new EconomyConfigError(
      EconomyConfigErrorCode.FEE_EXCEEDS_LIMIT,
      `Fee ${fee} exceeds limit ${limit}`,
      { fee, limit }
    ),
};
