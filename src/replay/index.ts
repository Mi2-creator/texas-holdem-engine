// ============================================================================
// Replay Module Exports
// ============================================================================

// Legacy exports (snapshot-based)
export { emptyReplay, createReplay } from './types';
export type { Replay, ReplayEvent as LegacyReplayEvent } from './types';
export { ReplayPlayer } from './ReplayPlayer';
export { useReplayPlayer } from './useReplayPlayer';
export type { UseReplayPlayerResult } from './useReplayPlayer';

// Event-driven exports (new)
export { cardDisplay, suitName } from './events';
export type {
  ReplayEvent,
  Card,
  Suit,
  Rank,
  PlayerInfo,
  Phase,
  HandStartEvent,
  PostBlindEvent,
  DealHoleEvent,
  BetEvent,
  CallEvent,
  RaiseEvent,
  CheckEvent,
  FoldEvent,
  AllInEvent,
  DealCommunityEvent,
  ShowdownEvent,
  HandEndEvent,
} from './events';
export { EventProcessor } from './EventProcessor';
export { EventReplayPlayer } from './EventReplayPlayer';
export { useEventReplayPlayer } from './useEventReplayPlayer';
export type { UseEventReplayPlayerResult } from './useEventReplayPlayer';
export { demoEvents, demoEventsWithShowdown } from './demoEvents';

// Phase utilities
export {
  Phase as PhaseConstants,
  PHASE_ORDER,
  isValidPhase,
  getPhaseIndex,
  comparePhases,
} from './Phase';
export type { PhaseType } from './Phase';

// Backend adapter (for compatibility)
export { BackendReplayAdapter, createMockBackendHand } from './BackendReplayAdapter';
export type {
  BackendHand,
  BackendPlayer,
  BackendAction,
  BackendCard,
  BackendPot,
} from './BackendReplayAdapter';
