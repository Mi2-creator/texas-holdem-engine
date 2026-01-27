/**
 * Moderation Module
 * Phase 23 - Hand replay, evidence, and moderation system
 *
 * This module provides human-in-the-loop moderation capabilities:
 * - Hand replay reconstruction with deterministic playback
 * - Immutable evidence bundles with checksum verification
 * - Moderator API for case investigation
 * - Append-only decision logging for audit trails
 *
 * Key design principles:
 * - No side effects on game state
 * - Deterministic replay guaranteed
 * - Immutable evidence
 * - Tamper-evident logging
 */

// Types
export {
  // Branded types
  CaseId,
  EvidenceBundleId,
  AnnotationId,
  DecisionId,
  ModeratorId,
  Checksum,

  // Replay types
  ReplayPlayerState,
  ReplayPotState,
  ReplayBoardState,
  ReplayState,
  ReplayAction,
  ReplayStateDiff,
  ReplayStep,
  HandReplay,

  // Evidence types
  HandOutcome,
  TableContext,
  EvidenceBundle,

  // Case types
  CaseStatus,
  ResolutionType,
  CaseAnnotation,
  ResolutionRecommendation,
  ModerationCase,

  // Decision logging types
  ModeratorActionType,
  DecisionLogEntry,
  DecisionLog,

  // Query types
  FlaggedHandsFilter,
  FlaggedHandSummary,

  // ID generators
  generateCaseId,
  generateEvidenceBundleId,
  generateAnnotationId,
  generateDecisionId,
  resetModerationCounters,

  // Checksum utilities
  calculateChecksum,
  verifyChecksum,
} from './ModerationTypes';

// Hand Replay Engine
export {
  HandReplayEngine,
  createHandReplayEngine,
} from './replay';

// Evidence Bundle Builder
export {
  EvidenceBundleBuilder,
  createEvidenceBundleBuilder,
} from './evidence';

// Moderator Service
export {
  ModeratorService,
  createModeratorService,
  DecisionLogger,
  createDecisionLogger,
} from './api';
