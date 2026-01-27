/**
 * Economy Runtime Module
 * Phase 20 - Balance management, settlement, and financial safety
 *
 * Provides:
 * - EconomyRuntime: Main integration layer
 * - TransactionManager: Atomic operations with rollback
 * - SettlementEngine: Pot distribution and rake
 * - EconomyPersistence: State persistence and recovery
 */

// Types
export {
  // Transaction Types
  TransactionId,
  OperationId,
  TransactionStatus,
  TransactionOperation,
  OperationType,
  Transaction,
  TransactionResult,
  // Settlement Types
  SettlementRequest,
  PlayerSettlementState,
  SettlementOutcome,
  SidePotOutcome,
  // Persistence Types
  EconomySnapshot,
  PlayerBalanceSnapshot,
  EscrowSnapshot,
  HandEconomyState,
  SettlementRecord,
  EconomyRecoveryResult,
  IdempotencyCheck,
  // Invariant Types
  FinancialInvariant,
  InvariantResult,
  InvariantViolation,
  // Configuration
  EconomyRuntimeConfig,
  DEFAULT_RUNTIME_CONFIG,
  // Events
  EconomyEventType,
  EconomyEvent,
  // Utilities
  generateTransactionId,
  generateOperationId,
  generateSettlementId,
  generateIdempotencyKey,
  resetRuntimeCounters,
} from './RuntimeTypes';

// Transaction Manager
export {
  TransactionManager,
  TransactionBuilder,
  createTransactionManager,
} from './TransactionManager';

// Settlement Engine
export {
  SettlementEngine,
  SettlementEngineConfig,
  DEFAULT_SETTLEMENT_CONFIG,
  createSettlementEngine,
} from './SettlementEngine';

// Economy Persistence
export {
  EconomyPersistence,
  EconomyPersistenceConfig,
  DEFAULT_PERSISTENCE_CONFIG,
  createEconomyPersistence,
} from './EconomyPersistence';

// Economy Runtime
export {
  EconomyRuntime,
  EconomyRuntimeOptions,
  createEconomyRuntime,
  getEconomyRuntime,
  resetEconomyRuntime,
} from './EconomyRuntime';
