/**
 * PublicAPI.ts
 * Phase 36 - Engine Finalization & Freeze
 *
 * FINAL PUBLIC API SURFACE DEFINITION
 *
 * This file explicitly declares the complete, frozen public API.
 * Any symbol not exported here is INTERNAL and UNSUPPORTED.
 *
 * @final This file must not be modified after Phase 36.
 * @sealed No new exports may be added.
 *
 * ENGINE LOGIC MUST NEVER BE MODIFIED AFTER THIS PHASE.
 */

// ============================================================================
// GAME SERVICE (Primary Entry Point)
// ============================================================================

/**
 * @final GameService is the primary entry point for game operations.
 * @sealed Interface is frozen - no new methods may be added.
 */
export {
  GameService,
  createGameService,
} from '../game/service/GameService';

export type {
  GameServiceConfig,
  PlayerInfo,
  PlayerState,
  GameState,
  GamePhase,
  ActionRequest,
  ActionResponse,
  ActionError,
  ActionErrorCode,
  ActionSummary,
  ValidActions,
  HandResult,
  HandEndReason,
  WinnerInfo,
  SidePotResult,
  ShowdownPlayerResult,
  JoinTableRequest,
  JoinTableResponse,
  LeaveTableRequest,
  LeaveTableResponse,
  RebuyRequest,
  RebuyResponse,
  GameEventHandler,
  StateChangeHandler,
  HandResultHandler,
  EventSubscription,
  ServiceStatus,
} from '../game/service/ServiceTypes';

export {
  DEFAULT_SERVICE_CONFIG,
} from '../game/service/ServiceTypes';

// ============================================================================
// ECONOMY ENGINE (Chip & Settlement Operations)
// ============================================================================

/**
 * @final EconomyEngine handles chip movement and settlement.
 * @sealed No new economic concepts may be added.
 */
export {
  EconomyEngine,
  getEconomyEngine,
  resetEconomyEngine,
} from '../economy';

// Economy Error Types
export {
  EconomyError,
  EconomyErrorCode,
  InsufficientBalanceError,
  InvalidAmountError,
  EscrowNotFoundError,
  PotAlreadySettledError,
  DuplicateSettlementError,
  LedgerIntegrityError,
  ChipConservationError,
} from '../economy';

// Rake Configuration
export type {
  RakeConfig,
  RakeResult,
  HandRakeContext,
} from '../economy';

export {
  DEFAULT_RAKE_CONFIG,
  RakeCalculator,
  buildHandRakeContext,
} from '../economy';

// ============================================================================
// LEDGER VIEW (Read-Only Attribution)
// ============================================================================

/**
 * @final LedgerView provides read-only access to attribution data.
 * @sealed Views are read-only and cannot modify state.
 */
export {
  LedgerView,
  createLedgerView,
  ValueLedger,
  createValueLedger,
  LedgerRecorder,
  createLedgerRecorder,
} from '../ledger';

export type {
  LedgerEntry,
  LedgerBatch,
  LedgerEntryInput,
  LedgerQuery,
  AttributionSummary,
  TableAttributionSummary,
  ClubAttributionSummary,
  LedgerIntegrityResult,
  AttributionParty,
  AttributionSource,
  SettlementAttribution,
} from '../ledger';

// ID Types (branded)
export type {
  LedgerEntryId,
  LedgerBatchId,
  AgentId,
} from '../ledger';

// Party factories
export {
  createPlayerParty,
  createClubParty,
  createAgentParty,
  createPlatformParty,
} from '../ledger';

// ============================================================================
// REVENUE VIEWS (Read-Only Analytics)
// ============================================================================

/**
 * @final Revenue views provide read-only analytics.
 * @sealed Revenue = rake only. No other sources.
 */
export {
  PlatformRevenueView,
  createPlatformRevenueView,
  ClubRevenueView,
  createClubRevenueView,
  AgentCommissionView,
  createAgentCommissionView,
  TableRakeTimelineView,
  createTableRakeTimelineView,
} from '../ledger';

export type {
  TimeWindow,
  TimeGranularity,
  TimeBucket,
  PlatformRevenueQuery,
  PlatformRevenueEntry,
  PlatformRevenueSummary,
  ClubRevenueQuery,
  ClubRevenueEntry,
  ClubRevenueSummary,
  AgentCommissionQuery,
  AgentCommissionEntry,
  AgentCommissionSummary,
  TableRakeTimelineQuery,
  RakeTimelineEntry,
  TableRakeTimeline,
} from '../ledger';

// ============================================================================
// INVARIANT CHECKER (Integrity Verification)
// ============================================================================

/**
 * @final InvariantChecker verifies engine invariants.
 * @sealed All invariants are locked - no new invariants may be added.
 */
export {
  InvariantChecker,
  createInvariantChecker,
  ExternalValueBoundary,
  createExternalValueBoundary,
  validateAtBoundary,
  validateSettlementAtBoundary,
} from '../ledger';

export type {
  InvariantType,
  ViolationSeverity,
  InvariantViolation,
  InvariantCheckResult,
  FullInvariantCheckResult,
  BoundaryViolation,
  BoundaryValidationResult,
} from '../ledger';

export {
  INVARIANT_SPECS,
  getAllInvariants,
  getCriticalInvariants,
  DEFAULT_INVARIANT_CONFIG,
  STRICT_INVARIANT_CONFIG,
} from '../ledger';

// ============================================================================
// EXTERNAL ADAPTER INTERFACES (Boundary Only)
// ============================================================================

/**
 * @final External adapters are read-only consumers.
 * @sealed Adapters cannot mutate engine state.
 */
export type {
  ExternalAdapter,
  AdapterCapabilities,
  AdapterStatus,
  SimulationAdapterId,
  SimulationExportId,
  SimulationReferenceId,
  ExternalExportResult,
  ExternalReferenceResult,
  ExportPayload,
  ImportReference,
  ImportReferenceInput,
} from '../external-adapter';

export {
  NoOpExternalAdapter,
  createNoOpExternalAdapter,
  MockExternalAdapter,
  createMockExternalAdapter,
  AdapterRegistry,
  createAdapterRegistry,
  DEFAULT_ADAPTER_CAPABILITIES,
  DEFAULT_MOCK_CONFIG,
  EXPORT_PAYLOAD_VERSION,
  buildLedgerExportPayload,
  buildRevenueExportPayload,
  buildCombinedExportPayload,
  validateExportPayload,
  validateImportReferenceInput,
  calculateSimulationChecksum,
  verifySimulationChecksum,
} from '../external-adapter';

// ============================================================================
// GAME ENGINE TYPES (Core Game Logic)
// ============================================================================

/**
 * @final Core game types for state management.
 * @sealed Game logic is deterministic and replay-safe.
 */
export type {
  Street,
  Player,
  PlayerStatus,
  TableState,
} from '../game/engine/TableState';

export type {
  Card,
  Rank,
  Suit,
} from '../game/engine/Card';

export type {
  HandRank,
  HandCategory,
} from '../game/engine/HandRank';

// ============================================================================
// IDENTITY & AUDIT (Security)
// ============================================================================

/**
 * @final Identity types for player/table identification.
 * @sealed All IDs are branded types.
 */
export type {
  PlayerId,
  SessionId,
} from '../security/Identity';

export type {
  TableId,
  HandId,
} from '../security/AuditLog';

export type {
  ClubId,
} from '../club/ClubTypes';

// ============================================================================
// VERSION & METADATA
// ============================================================================

export {
  ENGINE_VERSION,
  ENGINE_VERSION_MAJOR,
  ENGINE_VERSION_MINOR,
  ENGINE_VERSION_PATCH,
  ENGINE_BUILD_METADATA,
  ENGINE_COMMIT_HASH,
  ENGINE_VERSION_INFO,
  ENGINE_CAPABILITIES,
  ENGINE_RESTRICTIONS,
  getFullVersionString,
  getEngineVersionInfo,
  getEngineCapabilities,
  getEngineRestrictions,
  isVersionMatch,
  meetsMinimumVersion,
  verifyVersionIntegrity,
} from './EngineVersion';

export type {
  EngineVersionInfo,
  EngineCapabilities,
  EngineRestrictions,
} from './EngineVersion';

// ============================================================================
// FREEZE DECLARATION
// ============================================================================

export {
  ENGINE_FROZEN,
  ENGINE_FREEZE_DECLARATION,
  assertEngineFrozen,
  getEngineFreezeStatus,
} from './EngineFreezeDeclaration';

export type {
  EngineFreezeStatus,
} from './EngineFreezeDeclaration';

// ============================================================================
// API DOCUMENTATION
// ============================================================================

/**
 * Public API surface documentation.
 * @final
 */
export const PUBLIC_API_DOCUMENTATION = Object.freeze({
  description: 'Texas Hold\'em Engine - Finalized Public API',
  version: '1.0.0',
  phase: 36,

  entryPoints: Object.freeze([
    'GameService - Primary game operations',
    'EconomyEngine - Chip and settlement operations',
    'LedgerView - Read-only attribution data',
    'RevenueViews - Read-only analytics',
    'InvariantChecker - Integrity verification',
    'ExternalAdapter - Boundary interfaces',
  ]),

  guarantees: Object.freeze([
    'Deterministic - Same input always produces same output',
    'Replayable - Any state can be reconstructed from events',
    'Immutable - State objects are frozen after creation',
    'Auditable - All operations recorded in append-only ledger',
    'Verified - Hash chain ensures tamper detection',
  ]),

  restrictions: Object.freeze([
    'No payments, wallets, crypto',
    'No transfers, deposits, withdrawals',
    'No clocks, IO, async operations',
    'No randomness (deck shuffle is external input)',
    'Revenue equals rake only',
  ]),

  frozen: true,
  finalizedAt: '2024-01-29',
});

/**
 * List of all exported symbols (for documentation).
 * @final
 */
export const EXPORTED_SYMBOLS = Object.freeze([
  // Game Service
  'GameService', 'createGameService', 'DEFAULT_SERVICE_CONFIG',

  // Economy
  'EconomyEngine', 'getEconomyEngine', 'resetEconomyEngine',
  'RakeCalculator', 'DEFAULT_RAKE_CONFIG', 'buildHandRakeContext',

  // Ledger
  'LedgerView', 'createLedgerView', 'ValueLedger', 'createValueLedger',
  'LedgerRecorder', 'createLedgerRecorder',
  'createPlayerParty', 'createClubParty', 'createAgentParty', 'createPlatformParty',

  // Revenue Views
  'PlatformRevenueView', 'createPlatformRevenueView',
  'ClubRevenueView', 'createClubRevenueView',
  'AgentCommissionView', 'createAgentCommissionView',
  'TableRakeTimelineView', 'createTableRakeTimelineView',

  // Invariants
  'InvariantChecker', 'createInvariantChecker',
  'ExternalValueBoundary', 'createExternalValueBoundary',
  'validateAtBoundary', 'validateSettlementAtBoundary',
  'INVARIANT_SPECS', 'getAllInvariants', 'getCriticalInvariants',
  'DEFAULT_INVARIANT_CONFIG', 'STRICT_INVARIANT_CONFIG',

  // External Adapters
  'NoOpExternalAdapter', 'createNoOpExternalAdapter',
  'MockExternalAdapter', 'createMockExternalAdapter',
  'AdapterRegistry', 'createAdapterRegistry',
  'DEFAULT_ADAPTER_CAPABILITIES', 'DEFAULT_MOCK_CONFIG',
  'EXPORT_PAYLOAD_VERSION', 'buildLedgerExportPayload',
  'buildRevenueExportPayload', 'buildCombinedExportPayload',
  'validateExportPayload', 'validateImportReferenceInput',
  'calculateSimulationChecksum', 'verifySimulationChecksum',

  // Version & Freeze
  'ENGINE_VERSION', 'ENGINE_VERSION_INFO', 'ENGINE_CAPABILITIES', 'ENGINE_RESTRICTIONS',
  'ENGINE_FROZEN', 'ENGINE_FREEZE_DECLARATION',
  'getFullVersionString', 'getEngineVersionInfo', 'verifyVersionIntegrity',
  'assertEngineFrozen', 'getEngineFreezeStatus',
]);
