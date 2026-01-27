/**
 * Hand Evaluation Module
 * Phase 11 - Texas Hold'em hand evaluation and showdown
 *
 * Exports all hand evaluation functionality.
 */

// Types
export {
  Suit,
  Rank,
  Card,
  HandCategory,
  HandRankResult,
  ShowdownHand,
  ShowdownPlayerResult,
  ShowdownResult,
  ComparisonResult,
  HandEvaluationError,
  ShowdownError,
  HAND_CATEGORY_NAMES,
} from './HandTypes';

// Hand Rank utilities
export {
  SUITS,
  RANKS,
  RANK_NAMES,
  SUIT_SYMBOLS,
  createHandRankResult,
  getCategoryName,
  getRankName,
  getRankNamePlural,
  formatCard,
  formatCards,
  getRankValue,
  sortRanksDescending,
} from './HandRank';

// Hand Evaluator
export {
  evaluateHand,
  evaluateHandWithCommunity,
  compareHandRanks,
} from './HandEvaluator';

// Hand Comparison
export {
  HandForComparison,
  WinnerResult,
  compareHands,
  compareEvaluatedHands,
  determineWinners,
  determineWinnerIndices,
  areHandsEqual,
  getDecidingKickerIndex,
} from './HandCompare';

// Showdown
export {
  ShowdownPlayer,
  ShowdownConfig,
  ShowdownStartedEvent,
  HandEvaluatedEvent,
  PotAwardedEvent,
  HandCompletedEvent,
  ShowdownEvent,
  resolveShowdown,
  resolveShowdownWithEvents,
  isShowdownNeeded,
  getShowdownPlayers,
  calculatePotSplit,
} from './Showdown';
