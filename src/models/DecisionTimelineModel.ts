// ============================================================================
// DecisionTimelineModel - Cross-Panel Decision Consistency Layer
// ============================================================================
//
// 【Post-Freeze Extension】Replay Architecture Freeze Declaration v1.0 Compliant
//
// 层级: Model Layer (纯数据派生)
// 职责: 提供统一的、只读的决策时间线模型，确保跨面板数据一致性
//
// 重要约束:
//   - 不引入任何回放逻辑或状态变更
//   - 不 import src/replay/** 或 src/commands/**
//   - 不调用 EventProcessor
//   - 不构造 ReplayEvent
//   - 不使用 React 或任何 Hooks
//   - 所有函数必须是纯函数（确定性，无副作用）
//   - 所有类型必须是 readonly
//
// INV 合规性:
//   - INV-1 幂等快照: 不参与快照生成
//   - INV-2 回放确定性: 不参与回放过程
//   - INV-3 只读契约: 所有数据访问均为只读
//   - INV-4 序列单调性: 不修改序列号
//   - INV-5 压缩无损性: 不涉及压缩层
//
// H 合规性:
//   - H-1 安全手牌处理: 不涉及底牌可见性逻辑
//   - H-2 边界安全: 检查事件存在性后再访问
//   - H-3 无副作用: 使用纯函数进行计算
//   - H-4 值语义: 不修改任何值
//
// ============================================================================

// ============================================================================
// 本地类型定义 - 输入形状（不依赖外部模块）
// ============================================================================

/**
 * 事件形状描述（只读输入）
 */
export interface EventInfo {
  readonly type: string;
  readonly playerId?: string;
  readonly amount?: number;
  readonly phase?: string;
  readonly street?: string;
  readonly blindType?: string;
}

/**
 * 玩家信息形状描述（只读输入）
 */
export interface PlayerInfo {
  readonly id: string;
  readonly name: string;
  readonly seat?: number;
  readonly chips?: number;
  readonly bet?: number;
  readonly status?: string;
}

// ============================================================================
// 派生枚举类型
// ============================================================================

/**
 * 行动分类
 */
export type ActionClass =
  | 'fold'
  | 'check'
  | 'call'
  | 'bet'
  | 'raise'
  | 'all-in'
  | 'post-blind'
  | 'unknown';

/**
 * 街道阶段
 */
export type StreetPhase = 'PREFLOP' | 'FLOP' | 'TURN' | 'RIVER' | 'UNKNOWN';

/**
 * 决策压力级别
 */
export type PressureLevel = 'low' | 'medium' | 'high' | 'critical';

/**
 * 策略对齐标签
 */
export type AlignmentLabel = 'Aligned' | 'Deviates' | 'High-risk deviation';

/**
 * 置信度级别
 */
export type ConfidenceLevel = 'low' | 'medium' | 'high';

/**
 * 侵略性级别
 */
export type AggressionLevel = 'passive' | 'neutral' | 'aggressive' | 'hyper-aggressive';

// ============================================================================
// 叙事上下文（Narrative Context）
// ============================================================================

/**
 * 叙事上下文 - 用于 HandNarrativePanel
 */
export interface NarrativeContext {
  readonly sentence: string;
  readonly shortDescription: string;
  readonly streetContext: string;
  readonly isSignificant: boolean;
}

// ============================================================================
// 洞察上下文（Insight Context）
// ============================================================================

/**
 * 洞察上下文 - 用于 DecisionInsightPanel
 */
export interface InsightContext {
  readonly pressureLevel: PressureLevel;
  readonly pressureDescription: string;
  readonly tendencySignal: string;
  readonly polarizationIndicator: string;
  readonly riskCommitmentBalance: string;
}

// ============================================================================
// 对比上下文（Comparison Context）
// ============================================================================

/**
 * 替代行动描述
 */
export interface AlternativeAction {
  readonly action: ActionClass;
  readonly potCommitment: string;
  readonly aggressionLevel: AggressionLevel;
  readonly riskLevel: PressureLevel;
  readonly futurePressure: string;
}

/**
 * 对比上下文 - 用于 DecisionComparisonPanel
 */
export interface ComparisonContext {
  readonly actualAction: AlternativeAction;
  readonly alternatives: readonly AlternativeAction[];
  readonly comparisonSummary: string;
}

// ============================================================================
// 策略对齐上下文（Alignment Context）
// ============================================================================

/**
 * 策略预期
 */
export interface StrategyExpectation {
  readonly expectedAction: ActionClass;
  readonly potOdds: number;
  readonly stackToPotRatio: number;
  readonly actionDensity: number;
  readonly reasoning: string;
}

/**
 * 策略对齐上下文 - 用于 StrategyAlignmentPanel
 */
export interface AlignmentContext {
  readonly alignmentLabel: AlignmentLabel;
  readonly confidence: ConfidenceLevel;
  readonly explanation: string;
  readonly strategyExpectation: StrategyExpectation;
  readonly deviationFactors: readonly string[];
}

// ============================================================================
// 统一决策点（Decision Point）
// ============================================================================

/**
 * 决策点 - 统一表示单个玩家决策的完整上下文
 *
 * 这是跨面板一致性的核心数据结构。
 * 每个决策点包含所有面板所需的派生数据。
 */
export interface DecisionPoint {
  // 基础标识
  readonly index: number;
  readonly eventType: string;

  // 玩家信息
  readonly playerId: string;
  readonly playerName: string;
  readonly playerSeat: number;

  // 行动信息
  readonly actionClass: ActionClass;
  readonly amount: number | undefined;
  readonly street: StreetPhase;

  // 上下文数据（用于各面板）
  readonly narrative: NarrativeContext;
  readonly insight: InsightContext;
  readonly comparison: ComparisonContext;
  readonly alignment: AlignmentContext;

  // 元数据
  readonly isHeroDecision: boolean;
  readonly timestamp: number; // 相对顺序，不是真实时间
}

/**
 * 决策时间线 - 所有决策点的只读序列
 */
export type DecisionTimeline = readonly DecisionPoint[];

// ============================================================================
// 常量定义
// ============================================================================

const ACTION_EVENT_TYPES = ['FOLD', 'CHECK', 'CALL', 'BET', 'RAISE', 'ALL_IN', 'POST_BLIND'] as const;

const ACTION_CLASS_MAP: Record<string, ActionClass> = {
  'FOLD': 'fold',
  'CHECK': 'check',
  'CALL': 'call',
  'BET': 'bet',
  'RAISE': 'raise',
  'ALL_IN': 'all-in',
  'POST_BLIND': 'post-blind',
};

// ============================================================================
// 纯函数：玩家查找
// ============================================================================

/**
 * 构建玩家 ID 到名称的映射
 */
export function buildPlayerNameMap(
  players: readonly PlayerInfo[]
): Map<string, string> {
  const map = new Map<string, string>();
  for (const p of players) {
    map.set(p.id, p.name);
  }
  return map;
}

/**
 * 构建玩家 ID 到座位的映射
 */
export function buildPlayerSeatMap(
  players: readonly PlayerInfo[]
): Map<string, number> {
  const map = new Map<string, number>();
  for (const p of players) {
    if (p.seat !== undefined) {
      map.set(p.id, p.seat);
    }
  }
  return map;
}

/**
 * 获取玩家名称
 */
export function getPlayerName(
  playerId: string | undefined,
  playerNames: Map<string, string>
): string {
  if (!playerId) return 'Unknown';
  return playerNames.get(playerId) ?? playerId;
}

/**
 * 获取玩家座位
 */
export function getPlayerSeat(
  playerId: string | undefined,
  playerSeats: Map<string, number>
): number {
  if (!playerId) return -1;
  return playerSeats.get(playerId) ?? -1;
}

// ============================================================================
// 纯函数：行动分类
// ============================================================================

/**
 * 判断事件是否为玩家行动
 */
export function isActionEvent(eventType: string): boolean {
  return ACTION_EVENT_TYPES.includes(eventType as typeof ACTION_EVENT_TYPES[number]);
}

/**
 * 获取行动分类
 */
export function getActionClass(eventType: string): ActionClass {
  return ACTION_CLASS_MAP[eventType] ?? 'unknown';
}

// ============================================================================
// 纯函数：街道追踪
// ============================================================================

/**
 * 从事件序列派生当前街道
 */
export function deriveCurrentStreet(
  events: readonly EventInfo[],
  upToIndex: number
): StreetPhase {
  let street: StreetPhase = 'PREFLOP';

  for (let i = 0; i <= upToIndex && i < events.length; i++) {
    const e = events[i];
    if (e.type === 'STREET_START' && e.street) {
      street = e.street as StreetPhase;
    } else if (e.type === 'DEAL_COMMUNITY') {
      // Infer street from phase
      if (e.phase === 'FLOP') street = 'FLOP';
      else if (e.phase === 'TURN') street = 'TURN';
      else if (e.phase === 'RIVER') street = 'RIVER';
    }
  }

  return street;
}

// ============================================================================
// 纯函数：底池计算
// ============================================================================

/**
 * 计算到指定索引为止的底池大小
 */
export function calculatePotSize(
  events: readonly EventInfo[],
  upToIndex: number
): number {
  let pot = 0;

  for (let i = 0; i < upToIndex && i < events.length; i++) {
    const e = events[i];
    if (e.amount && ['BET', 'CALL', 'RAISE', 'ALL_IN', 'POST_BLIND'].includes(e.type)) {
      pot += e.amount;
    }
  }

  return pot;
}

/**
 * 计算需要跟注的金额
 */
export function calculateAmountToCall(
  events: readonly EventInfo[],
  upToIndex: number,
  playerId: string
): number {
  let currentBet = 0;
  const playerBets = new Map<string, number>();

  for (let i = 0; i < upToIndex && i < events.length; i++) {
    const e = events[i];
    if (e.amount && e.playerId && ['BET', 'CALL', 'RAISE', 'ALL_IN', 'POST_BLIND'].includes(e.type)) {
      const prevBet = playerBets.get(e.playerId) ?? 0;
      playerBets.set(e.playerId, prevBet + e.amount);
      if (['BET', 'RAISE', 'ALL_IN'].includes(e.type)) {
        currentBet = Math.max(currentBet, prevBet + e.amount);
      }
    }
  }

  const playerCurrentBet = playerBets.get(playerId) ?? 0;
  return Math.max(0, currentBet - playerCurrentBet);
}

/**
 * 计算底池赔率
 */
export function calculatePotOdds(
  potSize: number,
  amountToCall: number
): number {
  const totalPot = potSize + amountToCall;
  if (totalPot === 0) return 0;
  return amountToCall / totalPot;
}

/**
 * 计算 Stack-to-Pot Ratio（使用估计值）
 */
export function calculateSPR(potSize: number, estimatedStack: number = 500): number {
  if (potSize === 0) return estimatedStack;
  return estimatedStack / potSize;
}

// ============================================================================
// 纯函数：行动历史密度
// ============================================================================

/**
 * 计算到指定索引的行动密度（激进行动比例）
 */
export function calculateActionDensity(
  events: readonly EventInfo[],
  upToIndex: number
): number {
  let aggressiveActions = 0;
  let totalActions = 0;

  for (let i = 0; i < upToIndex && i < events.length; i++) {
    const e = events[i];
    if (isActionEvent(e.type) && e.type !== 'POST_BLIND') {
      totalActions++;
      if (['BET', 'RAISE', 'ALL_IN'].includes(e.type)) {
        aggressiveActions++;
      }
    }
  }

  if (totalActions === 0) return 0;
  return aggressiveActions / totalActions;
}

// ============================================================================
// 纯函数：叙事上下文派生
// ============================================================================

/**
 * 派生叙事上下文
 */
export function deriveNarrativeContext(
  actionClass: ActionClass,
  playerName: string,
  amount: number | undefined,
  street: StreetPhase,
  potSize: number
): NarrativeContext {
  let sentence: string;
  let shortDescription: string;
  let isSignificant = false;

  switch (actionClass) {
    case 'fold':
      sentence = `${playerName} folded.`;
      shortDescription = 'fold';
      break;
    case 'check':
      sentence = `${playerName} checked.`;
      shortDescription = 'check';
      break;
    case 'call':
      sentence = amount
        ? `${playerName} called $${amount}.`
        : `${playerName} called.`;
      shortDescription = amount ? `call $${amount}` : 'call';
      break;
    case 'bet':
      sentence = amount
        ? `${playerName} bet $${amount}.`
        : `${playerName} made a bet.`;
      shortDescription = amount ? `bet $${amount}` : 'bet';
      isSignificant = true;
      break;
    case 'raise':
      sentence = amount
        ? `${playerName} raised to $${amount}.`
        : `${playerName} raised.`;
      shortDescription = amount ? `raise to $${amount}` : 'raise';
      isSignificant = true;
      break;
    case 'all-in':
      sentence = amount
        ? `${playerName} went all-in for $${amount}!`
        : `${playerName} went all-in!`;
      shortDescription = amount ? `all-in $${amount}` : 'all-in';
      isSignificant = true;
      break;
    case 'post-blind':
      sentence = amount
        ? `${playerName} posted $${amount} blind.`
        : `${playerName} posted blind.`;
      shortDescription = amount ? `blind $${amount}` : 'blind';
      break;
    default:
      sentence = `${playerName} acted.`;
      shortDescription = 'action';
  }

  const streetContext = `On the ${street.toLowerCase()}`;

  // Significant if action is large relative to pot
  if (amount && potSize > 0 && amount / potSize > 0.5) {
    isSignificant = true;
  }

  return {
    sentence,
    shortDescription,
    streetContext,
    isSignificant,
  };
}

// ============================================================================
// 纯函数：洞察上下文派生
// ============================================================================

/**
 * 派生压力级别
 */
export function derivePressureLevel(
  potOdds: number,
  spr: number,
  actionDensity: number
): PressureLevel {
  let score = 0;

  // High pot odds requirement = more pressure
  if (potOdds > 0.35) score += 2;
  else if (potOdds > 0.2) score += 1;

  // Low SPR = more pressure
  if (spr < 3) score += 2;
  else if (spr < 6) score += 1;

  // High action density = more pressure
  if (actionDensity > 0.5) score += 1;

  if (score >= 4) return 'critical';
  if (score >= 3) return 'high';
  if (score >= 1) return 'medium';
  return 'low';
}

/**
 * 派生洞察上下文
 */
export function deriveInsightContext(
  potOdds: number,
  spr: number,
  actionDensity: number,
  actionClass: ActionClass
): InsightContext {
  const pressureLevel = derivePressureLevel(potOdds, spr, actionDensity);

  // Pressure description
  let pressureDescription: string;
  switch (pressureLevel) {
    case 'critical':
      pressureDescription = 'Critical decision point with maximum pressure';
      break;
    case 'high':
      pressureDescription = 'High-pressure situation demanding careful consideration';
      break;
    case 'medium':
      pressureDescription = 'Moderate pressure with multiple viable options';
      break;
    default:
      pressureDescription = 'Low-pressure spot with flexibility';
  }

  // Tendency signal based on action
  let tendencySignal: string;
  if (['bet', 'raise', 'all-in'].includes(actionClass)) {
    tendencySignal = 'Aggressive tendency signaled';
  } else if (actionClass === 'call') {
    tendencySignal = 'Passive-continuing tendency';
  } else if (actionClass === 'check') {
    tendencySignal = 'Cautious/trapping tendency possible';
  } else if (actionClass === 'fold') {
    tendencySignal = 'Selective/tight tendency';
  } else {
    tendencySignal = 'Tendency unclear';
  }

  // Polarization indicator
  let polarizationIndicator: string;
  if (actionClass === 'all-in' || (actionClass === 'raise' && potOdds > 0.3)) {
    polarizationIndicator = 'Highly polarized range likely';
  } else if (['bet', 'raise'].includes(actionClass)) {
    polarizationIndicator = 'Moderately polarized';
  } else {
    polarizationIndicator = 'Range likely balanced or capped';
  }

  // Risk-commitment balance
  let riskCommitmentBalance: string;
  if (spr < 3) {
    riskCommitmentBalance = 'Stack committed; pot-commitment threshold reached';
  } else if (spr < 6) {
    riskCommitmentBalance = 'Approaching commitment; careful sizing required';
  } else {
    riskCommitmentBalance = 'Deep-stacked; room for maneuvering';
  }

  return {
    pressureLevel,
    pressureDescription,
    tendencySignal,
    polarizationIndicator,
    riskCommitmentBalance,
  };
}

// ============================================================================
// 纯函数：对比上下文派生
// ============================================================================

/**
 * 派生侵略性级别
 */
export function deriveAggressionLevel(actionClass: ActionClass): AggressionLevel {
  switch (actionClass) {
    case 'all-in':
      return 'hyper-aggressive';
    case 'raise':
    case 'bet':
      return 'aggressive';
    case 'call':
    case 'check':
      return 'passive';
    case 'fold':
      return 'passive';
    default:
      return 'neutral';
  }
}

/**
 * 派生替代行动
 */
export function deriveAlternativeAction(
  actionClass: ActionClass,
  potOdds: number,
  spr: number
): AlternativeAction {
  const aggressionLevel = deriveAggressionLevel(actionClass);

  // Risk level based on action and context
  let riskLevel: PressureLevel;
  if (actionClass === 'all-in') {
    riskLevel = 'critical';
  } else if (['raise', 'bet'].includes(actionClass)) {
    riskLevel = spr < 4 ? 'high' : 'medium';
  } else if (actionClass === 'call') {
    riskLevel = potOdds > 0.3 ? 'medium' : 'low';
  } else {
    riskLevel = 'low';
  }

  // Pot commitment description
  let potCommitment: string;
  if (actionClass === 'all-in') {
    potCommitment = '100% committed';
  } else if (['raise', 'bet'].includes(actionClass)) {
    potCommitment = 'Increased commitment';
  } else if (actionClass === 'call') {
    potCommitment = 'Moderate commitment';
  } else if (actionClass === 'check') {
    potCommitment = 'No additional commitment';
  } else {
    potCommitment = 'Exited pot';
  }

  // Future pressure
  let futurePressure: string;
  if (actionClass === 'fold') {
    futurePressure = 'N/A - Out of hand';
  } else if (actionClass === 'all-in') {
    futurePressure = 'N/A - Fully committed';
  } else if (spr < 3) {
    futurePressure = 'High - Near commitment';
  } else if (spr < 6) {
    futurePressure = 'Medium - Manageable';
  } else {
    futurePressure = 'Low - Deep stacked';
  }

  return {
    action: actionClass,
    potCommitment,
    aggressionLevel,
    riskLevel,
    futurePressure,
  };
}

/**
 * 生成可能的替代行动
 */
export function generateAlternatives(
  actualAction: ActionClass,
  potOdds: number,
  spr: number
): readonly AlternativeAction[] {
  const possibleActions: ActionClass[] = ['fold', 'check', 'call', 'bet', 'raise', 'all-in'];
  const alternatives: AlternativeAction[] = [];

  for (const action of possibleActions) {
    if (action !== actualAction && action !== 'post-blind' && action !== 'unknown') {
      // Filter contextually appropriate alternatives
      if (action === 'check' && potOdds > 0) continue; // Can't check if facing bet
      if (action === 'bet' && potOdds > 0) continue; // Can't bet if facing bet

      alternatives.push(deriveAlternativeAction(action, potOdds, spr));
    }
  }

  return alternatives.slice(0, 3); // Limit to 3 alternatives
}

/**
 * 派生对比上下文
 */
export function deriveComparisonContext(
  actionClass: ActionClass,
  potOdds: number,
  spr: number
): ComparisonContext {
  const actualAction = deriveAlternativeAction(actionClass, potOdds, spr);
  const alternatives = generateAlternatives(actionClass, potOdds, spr);

  // Comparison summary
  let comparisonSummary: string;
  if (actionClass === 'all-in') {
    comparisonSummary = 'Maximum aggression chosen; all alternatives involve less commitment.';
  } else if (actionClass === 'fold') {
    comparisonSummary = 'Defensive choice selected; alternatives would maintain pot presence.';
  } else if (['raise', 'bet'].includes(actionClass)) {
    comparisonSummary = 'Aggressive line taken; passive alternatives available.';
  } else if (actionClass === 'call') {
    comparisonSummary = 'Flat call chosen; raising or folding were alternatives.';
  } else if (actionClass === 'check') {
    comparisonSummary = 'Check selected; betting for value or protection was possible.';
  } else {
    comparisonSummary = 'Action taken among available options.';
  }

  return {
    actualAction,
    alternatives,
    comparisonSummary,
  };
}

// ============================================================================
// 纯函数：策略对齐上下文派生
// ============================================================================

/**
 * 派生策略预期
 */
export function deriveStrategyExpectation(
  potOdds: number,
  spr: number,
  actionDensity: number
): StrategyExpectation {
  let expectedAction: ActionClass;
  let reasoning: string;

  if (potOdds > 0.4) {
    if (spr < 3) {
      expectedAction = 'call';
      reasoning = 'With shallow SPR and significant pot odds required, calling maintains pot equity without overcommitting.';
    } else {
      expectedAction = 'fold';
      reasoning = 'High pot odds requirement with deep SPR suggests selective continuation; folding preserves stack.';
    }
  } else if (potOdds > 0.2) {
    if (actionDensity > 0.5) {
      expectedAction = 'call';
      reasoning = 'Moderate pot odds in aggressive environment favor flat calling to see further action.';
    } else {
      expectedAction = 'raise';
      reasoning = 'Moderate pot odds with passive table texture favor raising for value and protection.';
    }
  } else if (potOdds > 0) {
    expectedAction = 'call';
    reasoning = 'Favorable pot odds support continuing; calling captures equity efficiently.';
  } else {
    if (actionDensity < 0.3) {
      expectedAction = 'bet';
      reasoning = 'No action required with passive history; betting builds value and defines hand strength.';
    } else {
      expectedAction = 'check';
      reasoning = 'No immediate cost with aggressive history; checking controls pot size.';
    }
  }

  return {
    expectedAction,
    potOdds,
    stackToPotRatio: spr,
    actionDensity,
    reasoning,
  };
}

/**
 * 计算对齐标签
 */
export function calculateAlignmentLabel(
  actualAction: ActionClass,
  expectedAction: ActionClass,
  potOdds: number,
  spr: number
): { label: AlignmentLabel; factors: readonly string[] } {
  const factors: string[] = [];

  const passiveActions: ActionClass[] = ['fold', 'check', 'call'];
  const aggressiveActions: ActionClass[] = ['bet', 'raise', 'all-in'];

  const actualIsPassive = passiveActions.includes(actualAction);
  const expectedIsPassive = passiveActions.includes(expectedAction);
  const actualIsAggressive = aggressiveActions.includes(actualAction);
  const expectedIsAggressive = aggressiveActions.includes(expectedAction);

  // Exact match
  if (actualAction === expectedAction) {
    return { label: 'Aligned', factors: ['Action matches strategy expectation'] };
  }

  // Same category
  if ((actualIsPassive && expectedIsPassive) || (actualIsAggressive && expectedIsAggressive)) {
    factors.push('Action is in same strategic category');
    return { label: 'Deviates', factors };
  }

  // Opposite category
  factors.push('Action diverges from expected strategy direction');

  // High-risk scenarios
  if (actualAction === 'all-in' && expectedAction !== 'all-in') {
    factors.push('All-in commitment was not expected');
    return { label: 'High-risk deviation', factors };
  }

  if (actualAction === 'fold' && expectedIsAggressive) {
    factors.push('Folded when aggression was expected');
    if (potOdds < 0.2) {
      factors.push('Fold sacrificed favorable pot odds');
      return { label: 'High-risk deviation', factors };
    }
  }

  if (actualIsAggressive && expectedAction === 'fold') {
    factors.push('Continued when folding was expected');
    if (spr < 3) {
      factors.push('Shallow stack increases commitment risk');
      return { label: 'High-risk deviation', factors };
    }
  }

  return { label: 'Deviates', factors };
}

/**
 * 计算置信度
 */
export function calculateConfidence(
  potOdds: number,
  spr: number,
  actionDensity: number,
  eventCount: number
): ConfidenceLevel {
  let score = 0;

  if (eventCount >= 10) score += 2;
  else if (eventCount >= 5) score += 1;

  if (potOdds < 0.15 || potOdds > 0.35) score += 1;
  if (spr < 4 || spr > 10) score += 1;
  if (actionDensity < 0.25 || actionDensity > 0.5) score += 1;

  if (score >= 4) return 'high';
  if (score >= 2) return 'medium';
  return 'low';
}

/**
 * 派生策略对齐上下文
 */
export function deriveAlignmentContext(
  actionClass: ActionClass,
  potOdds: number,
  spr: number,
  actionDensity: number,
  eventCount: number
): AlignmentContext {
  const strategyExpectation = deriveStrategyExpectation(potOdds, spr, actionDensity);
  const { label, factors } = calculateAlignmentLabel(
    actionClass,
    strategyExpectation.expectedAction,
    potOdds,
    spr
  );
  const confidence = calculateConfidence(potOdds, spr, actionDensity, eventCount);

  // Generate explanation
  let explanation: string;
  if (label === 'Aligned') {
    explanation = `The ${actionClass} aligns with equilibrium expectations given the pot odds (${(potOdds * 100).toFixed(0)}%) and stack depth.`;
  } else if (label === 'High-risk deviation') {
    explanation = `The ${actionClass} significantly deviates from the expected ${strategyExpectation.expectedAction}. ${strategyExpectation.reasoning} This deviation introduces elevated risk.`;
  } else {
    explanation = `The ${actionClass} differs from the expected ${strategyExpectation.expectedAction}. While not aligned with baseline strategy, the deviation may reflect exploitative adjustment or specific read.`;
  }

  return {
    alignmentLabel: label,
    confidence,
    explanation,
    strategyExpectation,
    deviationFactors: factors,
  };
}

// ============================================================================
// 主函数：构建决策时间线
// ============================================================================

/**
 * 构建完整的决策时间线
 *
 * 这是核心导出函数。它从事件序列和玩家列表派生出
 * 统一的决策时间线，包含所有面板所需的上下文数据。
 *
 * @param events - 只读事件序列
 * @param players - 只读玩家列表
 * @param heroSeat - 英雄座位号（用于标记英雄决策）
 * @returns 只读决策时间线
 */
export function buildDecisionTimeline(
  events: readonly EventInfo[],
  players: readonly PlayerInfo[],
  heroSeat: number = 0
): DecisionTimeline {
  // 边界检查
  if (events.length === 0) {
    return [];
  }

  // 构建查找表
  const playerNames = buildPlayerNameMap(players);
  const playerSeats = buildPlayerSeatMap(players);

  // 找到 hero 的 playerId
  const heroPlayer = players.find(p => p.seat === heroSeat);
  const heroPlayerId = heroPlayer?.id ?? null;

  // 遍历事件，为每个玩家行动构建决策点
  const timeline: DecisionPoint[] = [];

  for (let i = 0; i < events.length; i++) {
    const event = events[i];

    // 只处理玩家行动事件
    if (!isActionEvent(event.type) || !event.playerId) {
      continue;
    }

    const playerId = event.playerId;
    const playerName = getPlayerName(playerId, playerNames);
    const playerSeat = getPlayerSeat(playerId, playerSeats);
    const actionClass = getActionClass(event.type);
    const amount = event.amount;

    // 派生上下文数据
    const street = deriveCurrentStreet(events, i);
    const potSize = calculatePotSize(events, i);
    const amountToCall = calculateAmountToCall(events, i, playerId);
    const potOdds = calculatePotOdds(potSize, amountToCall);
    const spr = calculateSPR(potSize);
    const actionDensity = calculateActionDensity(events, i);

    // 构建各上下文
    const narrative = deriveNarrativeContext(actionClass, playerName, amount, street, potSize);
    const insight = deriveInsightContext(potOdds, spr, actionDensity, actionClass);
    const comparison = deriveComparisonContext(actionClass, potOdds, spr);
    const alignment = deriveAlignmentContext(actionClass, potOdds, spr, actionDensity, i);

    // 构建决策点
    const decisionPoint: DecisionPoint = {
      index: i,
      eventType: event.type,
      playerId,
      playerName,
      playerSeat,
      actionClass,
      amount,
      street,
      narrative,
      insight,
      comparison,
      alignment,
      isHeroDecision: playerId === heroPlayerId,
      timestamp: i,
    };

    timeline.push(decisionPoint);
  }

  return timeline;
}

// ============================================================================
// 辅助查询函数
// ============================================================================

/**
 * 获取指定索引的决策点
 */
export function getDecisionAtIndex(
  timeline: DecisionTimeline,
  eventIndex: number
): DecisionPoint | null {
  return timeline.find(d => d.index === eventIndex) ?? null;
}

/**
 * 获取所有英雄决策
 */
export function getHeroDecisions(timeline: DecisionTimeline): DecisionTimeline {
  return timeline.filter(d => d.isHeroDecision);
}

/**
 * 获取指定街道的所有决策
 */
export function getDecisionsByStreet(
  timeline: DecisionTimeline,
  street: StreetPhase
): DecisionTimeline {
  return timeline.filter(d => d.street === street);
}

/**
 * 获取指定玩家的所有决策
 */
export function getDecisionsByPlayer(
  timeline: DecisionTimeline,
  playerId: string
): DecisionTimeline {
  return timeline.filter(d => d.playerId === playerId);
}

/**
 * 获取重要决策（大额行动）
 */
export function getSignificantDecisions(timeline: DecisionTimeline): DecisionTimeline {
  return timeline.filter(d => d.narrative.isSignificant);
}

// ============================================================================
// 统计汇总函数
// ============================================================================

/**
 * 时间线统计摘要
 */
export interface TimelineSummary {
  readonly totalDecisions: number;
  readonly heroDecisions: number;
  readonly significantDecisions: number;
  readonly alignedDecisions: number;
  readonly deviatingDecisions: number;
  readonly highRiskDeviations: number;
  readonly streetBreakdown: Record<StreetPhase, number>;
  readonly actionBreakdown: Record<ActionClass, number>;
}

/**
 * 计算时间线统计摘要
 */
export function calculateTimelineSummary(timeline: DecisionTimeline): TimelineSummary {
  const streetBreakdown: Record<StreetPhase, number> = {
    'PREFLOP': 0,
    'FLOP': 0,
    'TURN': 0,
    'RIVER': 0,
    'UNKNOWN': 0,
  };

  const actionBreakdown: Record<ActionClass, number> = {
    'fold': 0,
    'check': 0,
    'call': 0,
    'bet': 0,
    'raise': 0,
    'all-in': 0,
    'post-blind': 0,
    'unknown': 0,
  };

  let heroDecisions = 0;
  let significantDecisions = 0;
  let alignedDecisions = 0;
  let deviatingDecisions = 0;
  let highRiskDeviations = 0;

  for (const decision of timeline) {
    streetBreakdown[decision.street]++;
    actionBreakdown[decision.actionClass]++;

    if (decision.isHeroDecision) heroDecisions++;
    if (decision.narrative.isSignificant) significantDecisions++;

    switch (decision.alignment.alignmentLabel) {
      case 'Aligned':
        alignedDecisions++;
        break;
      case 'Deviates':
        deviatingDecisions++;
        break;
      case 'High-risk deviation':
        highRiskDeviations++;
        break;
    }
  }

  return {
    totalDecisions: timeline.length,
    heroDecisions,
    significantDecisions,
    alignedDecisions,
    deviatingDecisions,
    highRiskDeviations,
    streetBreakdown,
    actionBreakdown,
  };
}
