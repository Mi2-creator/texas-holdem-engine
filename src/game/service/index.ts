/**
 * Service Layer Module Exports
 * Phase 17 - GameService for UI/network integration
 */

// Main service
export { GameService, createGameService } from './GameService';

// Types
export {
  GameServiceConfig,
  DEFAULT_SERVICE_CONFIG,
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
} from './ServiceTypes';

// Validation
export {
  ValidationResult,
  validateActionRequest,
  validateJoinTableRequest,
  validateRebuyRequest,
  validateLeaveTableRequest,
  validateHandStart,
  getPlayerValidActions,
} from './CommandValidator';
