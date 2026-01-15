// ============================================================================
// ReplayViewModel TypeScript Interfaces
// ============================================================================
//
// 这些接口对应 Go 后端的 ReplayViewModel 和 GameSnapshot 结构。
// UI 只读取这些数据，不修改。
//
// ============================================================================

/**
 * 卡牌快照
 */
export interface CardSnapshot {
  suit: string;      // 花色: Spades/Hearts/Diamonds/Clubs
  rank: string;      // 点数: 2-10/J/Q/K/A
  display: string;   // 显示文本，如 "A♠"
  suitCode: string;  // 花色代码: S/H/D/C
  rankCode: string;  // 点数代码: 2-9/T/J/Q/K/A
}

/**
 * 玩家快照
 */
export interface PlayerSnapshot {
  id: string;
  name: string;
  seat: number;
  chips: number;
  bet: number;
  status: string;          // Active/Folded/AllIn/Out
  holeCards: CardSnapshot[];
  totalContribution: number;
  isDealer: boolean;
  isSmallBlind: boolean;
  isBigBlind: boolean;
  isCurrent: boolean;
}

/**
 * 底池快照
 */
export interface PotSnapshot {
  amount: number;
  playerIds: string[];
  type: string;  // "main" 或 "side"
}

/**
 * 游戏状态快照
 *
 * 【H-4.2】street vs phase 语义分层：
 * - street: 语义街道（PREFLOP/FLOP/TURN/RIVER），由 STREET_START 事件驱动
 * - phase: 显示阶段（Preflop/Flop/Turn/River/Showdown），由 DEAL_COMMUNITY 驱动（向后兼容）
 *
 * 【H-4.3】Hand End 语义：
 * - isActive: 下注是否进行中（玩家能否行动）
 * - isHandOver: 手牌是否已结束（有赢家结算）
 * - handEndReason: 结束原因（SHOWDOWN | ALL_FOLD | ''）
 *
 * 语义边界：
 * - SHOWDOWN 事件：isActive = false，但 isHandOver = false（等待 HAND_END）
 * - HAND_END 事件：isHandOver = true，手牌正式结束
 *
 * 推进规则：
 * - street 由 ReplayEvent 决定，不可由 UI/Executor 修改
 * - 任意 seek 到 index N，都能确定当前 street 和 hand 结束状态（replay-safe）
 */
export interface GameSnapshot {
  handId: string;
  sequence: number;
  tick: number;
  phase: string;
  /** 【H-4.2】当前语义街道：PREFLOP | FLOP | TURN | RIVER | '' */
  street: string;
  roundCount: number;
  /** 下注是否进行中（玩家能否行动） */
  isActive: boolean;
  /** 【H-4.3】手牌是否已结束（有赢家结算） */
  isHandOver: boolean;
  /** 【H-4.3】手牌结束原因：SHOWDOWN | ALL_FOLD | '' */
  handEndReason: string;
  dealerSeat: number;
  smallBlindSeat: number;
  bigBlindSeat: number;
  smallBlind: number;
  bigBlind: number;
  communityCards: CardSnapshot[];
  potTotal: number;
  pots: PotSnapshot[];
  players: PlayerSnapshot[];
  currentPlayerId: string;
  currentSeat: number;
  validActions: string[];
  amountToCall: number;
  minRaise: number;
}

/**
 * 回放视图模型（UI 唯一状态来源）
 */
export interface ReplayViewModel {
  playing: boolean;
  phase: string;
  progress: number;      // 0.0 ~ 1.0
  index: number;
  count: number;
  canNext: boolean;
  canPrev: boolean;
  isAtStart: boolean;
  isAtEnd: boolean;
  snapshot: GameSnapshot;
}

/**
 * 播放器操作接口（UI → Player）
 */
export interface PlayerActions {
  play: () => void;
  pause: () => void;
  togglePlayPause: () => void;
  stepForward: () => void;
  stepBackward: () => void;
  seek: (index: number) => void;
  seekToPhase: (phase: string) => void;
  seekToStart: () => void;
  seekToEnd: () => void;
}

/**
 * 创建空的 GameSnapshot（用于无数据时）
 */
export function emptySnapshot(): GameSnapshot {
  return {
    handId: '',
    sequence: 0,
    tick: 0,
    phase: '',
    street: '',
    roundCount: 0,
    isActive: false,
    isHandOver: false,
    handEndReason: '',
    dealerSeat: -1,
    smallBlindSeat: -1,
    bigBlindSeat: -1,
    smallBlind: 0,
    bigBlind: 0,
    communityCards: [],
    potTotal: 0,
    pots: [],
    players: [],
    currentPlayerId: '',
    currentSeat: -1,
    validActions: [],
    amountToCall: 0,
    minRaise: 0,
  };
}

/**
 * 创建空的 ReplayViewModel（用于无数据时）
 */
export function emptyViewModel(): ReplayViewModel {
  return {
    playing: false,
    phase: '',
    progress: 0,
    index: 0,
    count: 0,
    canNext: false,
    canPrev: false,
    isAtStart: false,
    isAtEnd: false,
    snapshot: emptySnapshot(),
  };
}
