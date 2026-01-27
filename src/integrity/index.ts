/**
 * Integrity Module
 * Phase 22 - Game integrity and anti-abuse analysis
 *
 * This module provides non-invasive integrity analysis for poker games:
 * - Event stream collection (immutable, timestamped)
 * - Behavior metrics calculation (VPIP, PFR, aggression, etc.)
 * - Collusion pattern detection
 * - Soft-play detection
 * - Authority abuse detection
 * - Risk report generation
 *
 * Key design principles:
 * - Pure computation, no side effects on game state
 * - Rule-based detection, no ML
 * - Fully deterministic and auditable
 * - No automated punishment - signals only
 */

// Types
export {
  // Branded types
  IntegrityEventId,
  SessionId,
  ReportId,

  // Event types
  IntegrityEventType,
  IntegrityEvent,
  IntegrityEventData,
  PlayerActionData,
  HandEventData,
  StackChangeData,
  TableEventData,
  AuthorityEventData,

  // Metrics types
  PlayerMetrics,
  ChipFlowMatrix,
  PlayerPairMetrics,

  // Signal types
  SignalSeverity,
  SignalCategory,
  DetectionSignal,

  // Collusion types
  CollusionPattern,
  CollusionIndicator,

  // Soft-play types
  SoftPlayPattern,
  SoftPlayIndicator,

  // Authority abuse types
  AuthorityAbusePattern,
  AuthorityAbuseIndicator,

  // Risk types
  RiskLevel,
  PlayerIntegrityReport,
  TableIntegrityReport,

  // Thresholds
  DetectionThresholds,
  DEFAULT_DETECTION_THRESHOLDS,

  // ID generators
  generateIntegrityEventId,
  generateSessionId,
  generateReportId,
  resetIntegrityCounters,
} from './IntegrityTypes';

// Event Collector
export {
  EventStream,
  EventCollector,
  getEventCollector,
  resetEventCollector,
} from './EventCollector';

// Behavior Metrics
export {
  BehaviorMetricsCalculator,
  createBehaviorMetricsCalculator,
} from './BehaviorMetrics';

// Collusion Detection
export {
  CollusionDetector,
  createCollusionDetector,
} from './CollusionDetector';

// Soft-Play Detection
export {
  SoftPlayDetector,
  createSoftPlayDetector,
} from './SoftPlayDetector';

// Authority Abuse Detection
export {
  AuthorityAbuseDetector,
  createAuthorityAbuseDetector,
} from './AuthorityAbuseDetector';

// Risk Report Engine
export {
  RiskReportEngine,
  createRiskReportEngine,
} from './RiskReportEngine';
