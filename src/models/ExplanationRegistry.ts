// ============================================================================
// ExplanationRegistry - Metric Explanations & Tooltips (Pure Data)
// ============================================================================
//
// 【UX Consolidation Phase】Replay Architecture Freeze Declaration v1.0 Compliant
//
// 层级: Data Layer (纯数据映射)
// 职责: 提供指标键到人类可读解释的映射，用于一致的工具提示和帮助文本
//
// 约束:
//   - 只包含纯数据（常量、映射）
//   - 无逻辑、无计算、无函数副作用
//   - 不 import src/replay/** 或 src/commands/**
//   - 不调用 EventProcessor
//   - 不构造 ReplayEvent
//   - 不使用 React Hooks
//
// INV 合规性:
//   - INV-1 幂等快照: 不参与快照生成
//   - INV-2 回放确定性: 不参与回放过程
//   - INV-3 只读契约: 所有数据为只读常量
//   - INV-4 序列单调性: 不修改序列号
//   - INV-5 压缩无损性: 不涉及压缩层
//
// H 合规性:
//   - H-1 安全手牌处理: 不涉及底牌可见性逻辑
//   - H-2 边界安全: 纯数据无边界问题
//   - H-3 无副作用: 纯数据映射
//   - H-4 值语义: 不可变常量
//
// ============================================================================

// ============================================================================
// Types
// ============================================================================

/**
 * Explanation entry structure
 */
interface ExplanationEntry {
  readonly key: string;
  readonly label: string;
  readonly shortDescription: string;
  readonly longDescription: string;
  readonly category: ExplanationCategory;
  readonly relatedKeys?: readonly string[];
}

/**
 * Categories for explanations
 */
type ExplanationCategory =
  | 'action'
  | 'metric'
  | 'alignment'
  | 'strategy'
  | 'position'
  | 'street'
  | 'pressure'
  | 'pattern'
  | 'risk';

// ============================================================================
// Action Explanations
// ============================================================================

const ACTION_EXPLANATIONS: Record<string, ExplanationEntry> = {
  fold: {
    key: 'fold',
    label: 'Fold',
    shortDescription: 'Surrender your hand and forfeit any bets',
    longDescription:
      'Folding means giving up your hand and any chips you have already put into the pot. ' +
      'This is typically done when you believe your hand is too weak to continue profitably.',
    category: 'action',
    relatedKeys: ['check', 'call'],
  },
  check: {
    key: 'check',
    label: 'Check',
    shortDescription: 'Pass without betting when no bet is required',
    longDescription:
      'Checking means passing the action to the next player without putting in any chips. ' +
      'This is only possible when no one has bet in the current round. ' +
      'Checking allows you to see more cards without risking additional chips.',
    category: 'action',
    relatedKeys: ['bet', 'fold'],
  },
  call: {
    key: 'call',
    label: 'Call',
    shortDescription: 'Match the current bet to stay in the hand',
    longDescription:
      'Calling means matching the current bet amount to continue in the hand. ' +
      'This is a passive action that shows you want to see more cards ' +
      'without showing additional strength.',
    category: 'action',
    relatedKeys: ['raise', 'fold'],
  },
  bet: {
    key: 'bet',
    label: 'Bet',
    shortDescription: 'Make the first wager in a betting round',
    longDescription:
      'Betting means putting chips into the pot when no one else has bet yet. ' +
      'This is an aggressive action that can be done for value (to get called by worse hands) ' +
      'or as a bluff (to make better hands fold).',
    category: 'action',
    relatedKeys: ['raise', 'check'],
  },
  raise: {
    key: 'raise',
    label: 'Raise',
    shortDescription: 'Increase the current bet amount',
    longDescription:
      'Raising means increasing the current bet amount, forcing other players to put in more chips ' +
      'to continue. This is an aggressive action that builds the pot and puts pressure on opponents.',
    category: 'action',
    relatedKeys: ['bet', 'all-in'],
  },
  'all-in': {
    key: 'all-in',
    label: 'All-In',
    shortDescription: 'Bet all remaining chips',
    longDescription:
      'Going all-in means betting all of your remaining chips. ' +
      'This is the maximum commitment possible and creates significant pot odds for opponents. ' +
      'An all-in can be a strong value bet or a polarizing bluff.',
    category: 'action',
    relatedKeys: ['raise', 'bet'],
  },
  'post-blind': {
    key: 'post-blind',
    label: 'Post Blind',
    shortDescription: 'Mandatory forced bet before cards are dealt',
    longDescription:
      'Posting blinds are mandatory bets made before cards are dealt. ' +
      'The small blind (SB) posts half the minimum bet, and the big blind (BB) posts the full minimum bet. ' +
      'These forced bets ensure there is action in every hand.',
    category: 'action',
    relatedKeys: [],
  },
};

// ============================================================================
// Metric Explanations
// ============================================================================

const METRIC_EXPLANATIONS: Record<string, ExplanationEntry> = {
  riskRewardRatio: {
    key: 'riskRewardRatio',
    label: 'Risk/Reward Ratio',
    shortDescription: 'Ratio of potential risk to potential reward',
    longDescription:
      'The risk/reward ratio compares the amount you might lose to the amount you might win. ' +
      'A ratio above 1.0 indicates the potential reward exceeds the risk. ' +
      'Lower ratios may still be profitable with high win rates.',
    category: 'metric',
    relatedKeys: ['evDelta', 'commitmentLevel'],
  },
  commitmentLevel: {
    key: 'commitmentLevel',
    label: 'Commitment Level',
    shortDescription: 'Percentage of stack invested in the pot',
    longDescription:
      'Commitment level shows what percentage of your stack is already in the pot. ' +
      'High commitment (>50%) often makes folding mathematically incorrect ' +
      'due to pot odds already being favorable.',
    category: 'metric',
    relatedKeys: ['stackToPotRatio', 'potOdds'],
  },
  pressureLevel: {
    key: 'pressureLevel',
    label: 'Pressure Level',
    shortDescription: 'Amount of decision pressure from opponents',
    longDescription:
      'Pressure level indicates how much stress the current situation puts on your decision. ' +
      'High pressure comes from large bets, multiple opponents, or being out of position. ' +
      'Managing pressure is a key poker skill.',
    category: 'pressure',
    relatedKeys: ['position', 'actionDensity'],
  },
  volatilityScore: {
    key: 'volatilityScore',
    label: 'Volatility Score',
    shortDescription: 'Measure of action intensity throughout the hand',
    longDescription:
      'Volatility score measures how much action and variance occurred in the hand. ' +
      'High volatility hands feature many raises, all-ins, or dramatic swings. ' +
      'Low volatility hands are more straightforward with fewer aggressive actions.',
    category: 'metric',
    relatedKeys: ['aggressionRate', 'riskEscalation'],
  },
  evDelta: {
    key: 'evDelta',
    label: 'EV Delta',
    shortDescription: 'Expected value difference between actions',
    longDescription:
      'EV Delta (Expected Value Delta) shows the estimated difference in long-term profitability ' +
      'between different actions. Positive EV means the action is profitable over time, ' +
      'while negative EV indicates a losing play.',
    category: 'metric',
    relatedKeys: ['riskRewardRatio', 'potOdds'],
  },
  aggressionRate: {
    key: 'aggressionRate',
    label: 'Aggression Rate',
    shortDescription: 'Ratio of aggressive to passive actions',
    longDescription:
      'Aggression rate measures the frequency of aggressive actions (bets, raises) ' +
      'compared to passive actions (checks, calls). A higher rate indicates a more aggressive style. ' +
      'Balanced aggression is typically most profitable.',
    category: 'metric',
    relatedKeys: ['volatilityScore', 'bettingPattern'],
  },
};

// ============================================================================
// Alignment Explanations
// ============================================================================

const ALIGNMENT_EXPLANATIONS: Record<string, ExplanationEntry> = {
  aligned: {
    key: 'aligned',
    label: 'Aligned',
    shortDescription: 'Action matches theoretical strategy',
    longDescription:
      'An aligned decision matches what game theory optimal (GTO) strategy would suggest. ' +
      'This does not mean the action is always correct, but it follows sound theoretical principles ' +
      'based on pot odds, position, and action history.',
    category: 'alignment',
    relatedKeys: ['deviates', 'confidence'],
  },
  deviates: {
    key: 'deviates',
    label: 'Deviates',
    shortDescription: 'Action differs from theoretical baseline',
    longDescription:
      'A deviating decision differs from the expected GTO play. ' +
      'Deviations can be exploitative (adjusting to opponent tendencies) or mistakes. ' +
      'Not all deviations are bad—exploiting weak opponents often requires deviation.',
    category: 'alignment',
    relatedKeys: ['aligned', 'highRiskDeviation'],
  },
  highRiskDeviation: {
    key: 'highRiskDeviation',
    label: 'High-Risk Deviation',
    shortDescription: 'Significant departure from optimal play',
    longDescription:
      'A high-risk deviation represents a major departure from sound strategy. ' +
      'These actions expose you to significant risk without clear compensation. ' +
      'They may be exploitative plays or potential leaks in your game.',
    category: 'alignment',
    relatedKeys: ['deviates', 'leak'],
  },
  confidence: {
    key: 'confidence',
    label: 'Confidence Level',
    shortDescription: 'Certainty of the alignment assessment',
    longDescription:
      'Confidence level indicates how certain the alignment assessment is. ' +
      'High confidence means clear-cut situations; low confidence indicates edge cases ' +
      'where multiple actions have similar expected value.',
    category: 'alignment',
    relatedKeys: ['aligned', 'deviates'],
  },
};

// ============================================================================
// Strategy Explanations
// ============================================================================

const STRATEGY_EXPLANATIONS: Record<string, ExplanationEntry> = {
  potOdds: {
    key: 'potOdds',
    label: 'Pot Odds',
    shortDescription: 'Ratio of pot size to bet amount',
    longDescription:
      'Pot odds express the ratio of the current pot to the amount you need to call. ' +
      'If pot odds exceed your probability of winning, calling is mathematically profitable. ' +
      'For example, 3:1 pot odds mean you need to win 25% of the time to break even.',
    category: 'strategy',
    relatedKeys: ['impliedOdds', 'stackToPotRatio'],
  },
  stackToPotRatio: {
    key: 'stackToPotRatio',
    label: 'Stack-to-Pot Ratio (SPR)',
    shortDescription: 'Effective stack divided by pot size',
    longDescription:
      'SPR measures how deep-stacked the play is relative to the pot. ' +
      'Low SPR (<3) favors getting all-in with strong hands; ' +
      'High SPR (>10) allows for more post-flop maneuvering and implied odds plays.',
    category: 'strategy',
    relatedKeys: ['potOdds', 'commitmentLevel'],
  },
  actionDensity: {
    key: 'actionDensity',
    label: 'Action Density',
    shortDescription: 'Amount of action relative to street progression',
    longDescription:
      'Action density measures how much betting action has occurred relative to the street. ' +
      'High density indicates an action-heavy pot with multiple bets and raises. ' +
      'This affects range analysis and opponent hand reading.',
    category: 'strategy',
    relatedKeys: ['pressureLevel', 'volatilityScore'],
  },
  expectedAction: {
    key: 'expectedAction',
    label: 'Expected Action',
    shortDescription: 'What baseline strategy suggests',
    longDescription:
      'The expected action is what theoretical strategy recommends in this situation. ' +
      'This is based on position, pot odds, stack depth, and betting action. ' +
      'It serves as a benchmark for evaluating actual decisions.',
    category: 'strategy',
    relatedKeys: ['aligned', 'deviates'],
  },
};

// ============================================================================
// Position Explanations
// ============================================================================

const POSITION_EXPLANATIONS: Record<string, ExplanationEntry> = {
  earlyPosition: {
    key: 'earlyPosition',
    label: 'Early Position (EP)',
    shortDescription: 'First positions to act post-flop',
    longDescription:
      'Early position includes UTG (Under The Gun) and UTG+1. ' +
      'These positions act first and have the least information. ' +
      'Playing tighter ranges from early position is generally recommended.',
    category: 'position',
    relatedKeys: ['middlePosition', 'latePosition'],
  },
  middlePosition: {
    key: 'middlePosition',
    label: 'Middle Position (MP)',
    shortDescription: 'Positions between early and late',
    longDescription:
      'Middle position players have more information than early position ' +
      'but still face action from later positions. ' +
      'Ranges can be slightly wider than early position.',
    category: 'position',
    relatedKeys: ['earlyPosition', 'latePosition'],
  },
  latePosition: {
    key: 'latePosition',
    label: 'Late Position (LP)',
    shortDescription: 'Cutoff and Button positions',
    longDescription:
      'Late position (Cutoff and Button) are the most advantageous seats. ' +
      'You act last post-flop with maximum information. ' +
      'Wider ranges and more aggressive play are profitable from these positions.',
    category: 'position',
    relatedKeys: ['button', 'cutoff'],
  },
  button: {
    key: 'button',
    label: 'Button (BTN)',
    shortDescription: 'Best position at the table',
    longDescription:
      'The Button is the most profitable seat, acting last on every post-flop street. ' +
      'This positional advantage allows for wider ranges, more bluffs, ' +
      'and better pot control.',
    category: 'position',
    relatedKeys: ['cutoff', 'latePosition'],
  },
  blinds: {
    key: 'blinds',
    label: 'Blinds (SB/BB)',
    shortDescription: 'Forced bet positions',
    longDescription:
      'The Small Blind and Big Blind post forced bets and act last preflop ' +
      'but first post-flop. This positional disadvantage makes these seats ' +
      'the least profitable at the table.',
    category: 'position',
    relatedKeys: ['smallBlind', 'bigBlind'],
  },
};

// ============================================================================
// Street Explanations
// ============================================================================

const STREET_EXPLANATIONS: Record<string, ExplanationEntry> = {
  preflop: {
    key: 'preflop',
    label: 'Preflop',
    shortDescription: 'Before community cards are dealt',
    longDescription:
      'Preflop is the first betting round before any community cards are dealt. ' +
      'Players only see their two hole cards. ' +
      'Starting hand selection is crucial at this stage.',
    category: 'street',
    relatedKeys: ['flop', 'blinds'],
  },
  flop: {
    key: 'flop',
    label: 'Flop',
    shortDescription: 'First three community cards',
    longDescription:
      'The Flop reveals three community cards simultaneously. ' +
      'This is where hands take shape and ranges are defined. ' +
      'Post-flop strategy depends heavily on texture and position.',
    category: 'street',
    relatedKeys: ['preflop', 'turn'],
  },
  turn: {
    key: 'turn',
    label: 'Turn',
    shortDescription: 'Fourth community card',
    longDescription:
      'The Turn is the fourth community card. ' +
      'Bets typically double at this street. ' +
      'Ranges are more defined and draws face important decisions.',
    category: 'street',
    relatedKeys: ['flop', 'river'],
  },
  river: {
    key: 'river',
    label: 'River',
    shortDescription: 'Fifth and final community card',
    longDescription:
      'The River is the final community card. ' +
      'All draws are complete and hand values are finalized. ' +
      'Bluffing and value betting decisions are most crucial here.',
    category: 'street',
    relatedKeys: ['turn', 'showdown'],
  },
};

// ============================================================================
// Pattern Explanations
// ============================================================================

const PATTERN_EXPLANATIONS: Record<string, ExplanationEntry> = {
  valueHeavy: {
    key: 'valueHeavy',
    label: 'Value-Heavy',
    shortDescription: 'Betting primarily for value',
    longDescription:
      'A value-heavy betting pattern indicates bets made primarily to get called by worse hands. ' +
      'This suggests strong hand selection and straightforward play. ' +
      'Effective against calling stations but exploitable by tight players.',
    category: 'pattern',
    relatedKeys: ['bluffHeavy', 'balanced'],
  },
  bluffHeavy: {
    key: 'bluffHeavy',
    label: 'Bluff-Heavy',
    shortDescription: 'High frequency of bluffing',
    longDescription:
      'A bluff-heavy pattern shows frequent aggression without strong hands. ' +
      'This can be profitable against tight opponents who fold too often. ' +
      'Risk of exploitation by calling or trapping opponents.',
    category: 'pattern',
    relatedKeys: ['valueHeavy', 'balanced'],
  },
  balanced: {
    key: 'balanced',
    label: 'Balanced',
    shortDescription: 'Mix of value bets and bluffs',
    longDescription:
      'A balanced pattern mixes value bets and bluffs at theoretically optimal frequencies. ' +
      'This makes you unexploitable but may not maximize profit against weak opponents. ' +
      'GTO-oriented players tend toward balanced patterns.',
    category: 'pattern',
    relatedKeys: ['valueHeavy', 'bluffHeavy'],
  },
  passive: {
    key: 'passive',
    label: 'Passive',
    shortDescription: 'Low aggression, mostly checking/calling',
    longDescription:
      'A passive pattern features few bets and raises, relying on checking and calling. ' +
      'This misses value with strong hands and fails to put pressure on opponents. ' +
      'Generally considered a leak in most situations.',
    category: 'pattern',
    relatedKeys: ['aggressive', 'balanced'],
  },
};

// ============================================================================
// Combined Registry
// ============================================================================

const EXPLANATION_REGISTRY: Record<string, ExplanationEntry> = {
  ...ACTION_EXPLANATIONS,
  ...METRIC_EXPLANATIONS,
  ...ALIGNMENT_EXPLANATIONS,
  ...STRATEGY_EXPLANATIONS,
  ...POSITION_EXPLANATIONS,
  ...STREET_EXPLANATIONS,
  ...PATTERN_EXPLANATIONS,
};

// ============================================================================
// Pure Lookup Functions
// ============================================================================

/**
 * Get explanation entry by key (pure function)
 */
function getExplanation(key: string): ExplanationEntry | undefined {
  return EXPLANATION_REGISTRY[key];
}

/**
 * Get short description by key (pure function)
 */
function getShortDescription(key: string): string {
  const entry = EXPLANATION_REGISTRY[key];
  return entry?.shortDescription ?? 'No description available';
}

/**
 * Get long description by key (pure function)
 */
function getLongDescription(key: string): string {
  const entry = EXPLANATION_REGISTRY[key];
  return entry?.longDescription ?? 'No detailed description available';
}

/**
 * Get label by key (pure function)
 */
function getLabel(key: string): string {
  const entry = EXPLANATION_REGISTRY[key];
  return entry?.label ?? key;
}

/**
 * Get all explanations in a category (pure function)
 */
function getExplanationsByCategory(category: ExplanationCategory): readonly ExplanationEntry[] {
  return Object.values(EXPLANATION_REGISTRY).filter(e => e.category === category);
}

/**
 * Get related explanations (pure function)
 */
function getRelatedExplanations(key: string): readonly ExplanationEntry[] {
  const entry = EXPLANATION_REGISTRY[key];
  if (!entry?.relatedKeys) return [];
  return entry.relatedKeys
    .map(k => EXPLANATION_REGISTRY[k])
    .filter((e): e is ExplanationEntry => e !== undefined);
}

// ============================================================================
// Exports
// ============================================================================

export {
  // Registry
  EXPLANATION_REGISTRY,
  ACTION_EXPLANATIONS,
  METRIC_EXPLANATIONS,
  ALIGNMENT_EXPLANATIONS,
  STRATEGY_EXPLANATIONS,
  POSITION_EXPLANATIONS,
  STREET_EXPLANATIONS,
  PATTERN_EXPLANATIONS,

  // Functions
  getExplanation,
  getShortDescription,
  getLongDescription,
  getLabel,
  getExplanationsByCategory,
  getRelatedExplanations,
};

export type { ExplanationEntry, ExplanationCategory };
