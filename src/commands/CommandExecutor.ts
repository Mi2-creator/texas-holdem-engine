// ============================================================================
// CommandExecutor - 命令执行器抽象（D/E/F 阶段）
// ============================================================================
//
// CommandExecutor 定义了把 ActionCommand 转换为 Events 的接口。
//
// 三种实现阶段：
// - DryRunExecutor (D 阶段): 仅推导，不执行
// - LiveExecutor (E 阶段): 推导 + 执行（通过回调推送事件）
// - ExecutionPolicy (F 阶段): 执行前验证层
//
// 切换模式：
// - executorMode: 'dry' | 'live'
// - 可一键切回 dry-run，不影响现有逻辑
//
// ============================================================================

import { GameSnapshot } from '../types/replay';
import {
  ReplayEvent,
  FoldEvent,
  CheckEvent,
  CallEvent,
  BetEvent,
  RaiseEvent,
  AllInEvent,
} from '../replay/events';
import { ActionCommand } from './ActionCommand';
import {
  ValidationResult,
  ValidationRejection,
  validateCommand,
  formatValidationResult,
} from './ExecutionPolicy';

// ============================================================================
// CommandExecutor 接口定义
// ============================================================================

// ============================================================================
// 执行模式
// ============================================================================

/**
 * ExecutorMode - 执行器模式
 *
 * - 'dry': 干运行，仅推导事件，不执行
 * - 'live': 实际执行，推导事件并推送到 replay engine
 */
export type ExecutorMode = 'dry' | 'live';

/**
 * DerivedEvent - 推导出的事件（包含元信息）
 *
 * 这是对 ReplayEvent 的包装，添加了推导时的上下文信息。
 * dryRun: true 表示这是推导出来的，尚未执行。
 * valid: 表示命令是否通过执行策略验证（F 阶段）
 */
export interface DerivedEvent {
  /** 推导出的事件 */
  event: ReplayEvent;
  /** 是否为 dry-run（始终为 true，表示未执行） */
  dryRun: true;
  /** 推导时间戳 */
  derivedAt: number;
  /** 来源命令 */
  sourceCommand: ActionCommand;
  /** 是否通过执行策略验证（F 阶段） */
  valid: boolean;
  /** 如果验证失败，拒绝原因 */
  rejection?: ValidationRejection;
}

/**
 * ExecutedEvent - 已执行的事件（包含元信息）
 *
 * 与 DerivedEvent 类似，但 executed: true 表示已推送到 engine。
 */
export interface ExecutedEvent {
  /** 执行的事件 */
  event: ReplayEvent;
  /** 是否已执行（始终为 true） */
  executed: true;
  /** 执行时间戳 */
  executedAt: number;
  /** 来源命令 */
  sourceCommand: ActionCommand;
}

/**
 * DryRunResult - 干运行执行结果
 *
 * F 阶段新增：包含验证结果
 */
export type DryRunResult =
  | { ok: true; mode: 'dry'; derivedEvents: DerivedEvent[]; validation: ValidationResult }
  | { ok: false; mode: 'dry'; error: string };

/**
 * LiveResult - 实际执行结果
 */
export type LiveResult =
  | { ok: true; mode: 'live'; executedEvents: ExecutedEvent[] }
  | { ok: false; mode: 'live'; error: string };

/**
 * ExecutionResult - 命令执行结果（联合类型）
 *
 * 根据模式不同，返回不同的结果结构。
 */
export type ExecutionResult = DryRunResult | LiveResult;

/**
 * CommandExecutor - 命令执行器接口
 *
 * 定义了把 ActionCommand 转换为 Events 的契约。
 * 不同实现可以选择：
 * - DryRunExecutor: 仅推导，不执行
 * - LiveExecutor: 实际执行（未来阶段）
 */
export interface CommandExecutor {
  /**
   * 执行命令
   *
   * @param command - 已验证的命令
   * @param snapshot - 当前游戏快照
   * @returns ExecutionResult - 执行结果
   */
  execute(command: ActionCommand, snapshot: GameSnapshot): ExecutionResult;
}

// ============================================================================
// DryRunExecutor 实现
// ============================================================================

/**
 * DryRunExecutor - 干运行执行器
 *
 * 仅推导 ActionCommand 会产生什么 Events，不实际执行。
 * F 阶段新增：执行前调用 validateCommand，并标记事件是否有效。
 *
 * 这是一个纯函数实现：
 * - 输入：ActionCommand + GameSnapshot
 * - 输出：DerivedEvent[]（带验证标记）
 * - 无副作用
 */
export class DryRunExecutor implements CommandExecutor {
  /**
   * 执行命令（dry-run 模式）
   *
   * 1. 调用 validateCommand 进行策略验证
   * 2. 推导事件并标记验证结果
   * 3. 返回结果（包含验证信息）
   */
  execute(command: ActionCommand, snapshot: GameSnapshot): DryRunResult {
    // F 阶段：执行策略验证
    const validation = validateCommand(command, snapshot);

    // 推导事件（无论验证是否通过都会推导，以便 UI 展示）
    const derivedEvents = this.deriveEvents(command, snapshot, validation);

    return { ok: true, mode: 'dry', derivedEvents, validation };
  }

  /**
   * 推导事件
   *
   * 根据 ActionCommand 类型，推导出对应的 ReplayEvent。
   *
   * ============================================================================
   * 【H-3 语义封板】Command → ReplayEvent 映射
   * ============================================================================
   *
   * 核心原则：
   * - Command = 人的意图（来自 UI）
   * - ReplayEvent = 游戏发生的事实（唯一载体）
   * - UI 不产生 ReplayEvent，只产生 ActionCommand
   * - ReplayEvent 只能由本函数生成
   *
   * amount 统一语义：
   * - ReplayEvent.amount = 玩家在当前下注轮的【总下注额】
   * - 不是"追加金额"，是"总贡献"
   * - EventProcessor 通过 (amount - player.bet) 计算实际扣除的筹码
   *
   * 映射规则（不可修改）：
   * - FOLD   → FoldEvent   (无 amount)
   * - CHECK  → CheckEvent  (无 amount)
   * - CALL   → CallEvent   (amount = 目标总下注额)
   * - BET    → BetEvent    (amount = 下注总额)
   * - RAISE  → RaiseEvent  (amount = 加注后总下注额)
   * - *→ALL_IN → AllInEvent (amount = player.bet + player.chips)
   *
   * ALL_IN 触发条件：需要的追加筹码 >= 剩余筹码
   * ============================================================================
   */
  private deriveEvents(
    command: ActionCommand,
    snapshot: GameSnapshot,
    validation: ValidationResult
  ): DerivedEvent[] {
    const events: DerivedEvent[] = [];
    const timestamp = Date.now();

    // 获取玩家信息
    const player = snapshot.players.find((p) => p.id === command.playerId);
    if (!player) {
      // 理论上不应该发生（Command 已验证）
      return events;
    }

    // 提取验证信息
    const isValid = validation.valid;
    const rejection = validation.valid ? undefined : validation.rejection;

    // 【H-3】maxBet = 玩家能达到的最大总下注额 = 已下注 + 剩余筹码
    const maxBet = player.chips + player.bet;

    switch (command.type) {
      // ================================================================
      // 【H-3】FOLD → FoldEvent（无 amount）
      // ================================================================
      case 'FOLD': {
        const foldEvent: FoldEvent = {
          type: 'FOLD',
          playerId: command.playerId,
        };
        events.push(this.wrapEvent(foldEvent, command, timestamp, isValid, rejection));
        break;
      }

      // ================================================================
      // 【H-3】CHECK → CheckEvent（无 amount）
      // ================================================================
      case 'CHECK': {
        const checkEvent: CheckEvent = {
          type: 'CHECK',
          playerId: command.playerId,
        };
        events.push(this.wrapEvent(checkEvent, command, timestamp, isValid, rejection));
        break;
      }

      // ================================================================
      // 【H-3】CALL → CallEvent(amount = 目标总下注额) 或 AllInEvent
      // ================================================================
      case 'CALL': {
        // callAmount = 需要匹配的总下注额
        const callAmount = command.amount ?? snapshot.amountToCall;
        // 需要追加的筹码
        const additionalNeeded = callAmount - player.bet;

        // ALL_IN 条件：需要的追加筹码 >= 剩余筹码
        if (additionalNeeded >= player.chips) {
          const allInEvent: AllInEvent = {
            type: 'ALL_IN',
            playerId: command.playerId,
            amount: maxBet, // 【H-3 语义】总下注额 = bet + chips
          };
          events.push(this.wrapEvent(allInEvent, command, timestamp, isValid, rejection));
        } else {
          const callEvent: CallEvent = {
            type: 'CALL',
            playerId: command.playerId,
            amount: callAmount, // 【H-3 语义】总下注额
          };
          events.push(this.wrapEvent(callEvent, command, timestamp, isValid, rejection));
        }
        break;
      }

      // ================================================================
      // 【H-3】BET → BetEvent(amount = 下注总额) 或 AllInEvent
      // ================================================================
      case 'BET': {
        // betAmount = 下注的总额（BET 时 player.bet 应为 0）
        const betAmount = command.amount ?? 0;

        // ALL_IN 条件：下注金额 >= 可用筹码总额
        if (betAmount >= maxBet) {
          const allInEvent: AllInEvent = {
            type: 'ALL_IN',
            playerId: command.playerId,
            amount: maxBet, // 【H-3 语义】总下注额 = bet + chips
          };
          events.push(this.wrapEvent(allInEvent, command, timestamp, isValid, rejection));
        } else {
          const betEvent: BetEvent = {
            type: 'BET',
            playerId: command.playerId,
            amount: betAmount, // 【H-3 语义】总下注额
          };
          events.push(this.wrapEvent(betEvent, command, timestamp, isValid, rejection));
        }
        break;
      }

      // ================================================================
      // 【H-3】RAISE → RaiseEvent(amount = 加注后总下注额) 或 AllInEvent
      // ================================================================
      case 'RAISE': {
        // raiseAmount = 加注后的目标总下注额
        const raiseAmount = command.amount ?? 0;
        // 需要追加的筹码
        const additionalNeeded = raiseAmount - player.bet;

        // ALL_IN 条件：需要的追加筹码 >= 剩余筹码
        if (additionalNeeded >= player.chips) {
          const allInEvent: AllInEvent = {
            type: 'ALL_IN',
            playerId: command.playerId,
            amount: maxBet, // 【H-3 语义】总下注额 = bet + chips
          };
          events.push(this.wrapEvent(allInEvent, command, timestamp, isValid, rejection));
        } else {
          const raiseEvent: RaiseEvent = {
            type: 'RAISE',
            playerId: command.playerId,
            amount: raiseAmount, // 【H-3 语义】总下注额
          };
          events.push(this.wrapEvent(raiseEvent, command, timestamp, isValid, rejection));
        }
        break;
      }
    }

    return events;
  }

  /**
   * 包装事件为 DerivedEvent
   *
   * F 阶段：包含验证结果
   */
  private wrapEvent(
    event: ReplayEvent,
    sourceCommand: ActionCommand,
    derivedAt: number,
    valid: boolean,
    rejection?: ValidationRejection
  ): DerivedEvent {
    return {
      event,
      dryRun: true,
      derivedAt,
      sourceCommand,
      valid,
      rejection,
    };
  }
}

// ============================================================================
// LiveExecutor 实现（E 阶段）
// ============================================================================

/**
 * EventPushCallback - 事件推送回调
 *
 * LiveExecutor 通过此回调将事件推送到 replay engine。
 * 这样 LiveExecutor 不直接依赖 React hooks 或 engine 实现。
 */
export type EventPushCallback = (events: ReplayEvent[]) => void;

/**
 * LiveExecutor - 实际执行器
 *
 * 推导 ActionCommand 会产生的 Events，并通过回调推送到 engine。
 * F 阶段：仅在验证通过时才执行。
 *
 * 设计原则：
 * - LiveExecutor 本身不持有状态
 * - 通过 EventPushCallback 将执行权委托给调用方
 * - 调用方（如 main.tsx）负责实际的 engine 操作
 * - 验证失败时不推送事件，不影响 replay index
 */
export class LiveExecutor implements CommandExecutor {
  private readonly onPushEvents: EventPushCallback;

  constructor(onPushEvents: EventPushCallback) {
    this.onPushEvents = onPushEvents;
  }

  /**
   * 执行命令（live 模式）
   *
   * F 阶段流程：
   * 1. 推导事件（复用 DryRunExecutor 的逻辑）
   * 2. 检查验证结果
   * 3. 仅在验证通过时推送事件
   * 4. 返回执行结果
   */
  execute(command: ActionCommand, snapshot: GameSnapshot): LiveResult {
    // 复用 DryRunExecutor 的事件推导逻辑（包含验证）
    const dryResult = dryRunExecutor.execute(command, snapshot);

    if (!dryResult.ok) {
      return { ok: false, mode: 'live', error: 'Failed to derive events' };
    }

    // F 阶段：检查验证结果
    if (!dryResult.validation.valid) {
      const rejection = dryResult.validation.rejection;
      return {
        ok: false,
        mode: 'live',
        error: `[Policy Rejected] ${rejection.code}: ${rejection.message}`,
      };
    }

    // 验证通过，提取原始事件
    const rawEvents = dryResult.derivedEvents.map((d) => d.event);

    // 推送事件到 engine
    try {
      this.onPushEvents(rawEvents);
    } catch (err) {
      return {
        ok: false,
        mode: 'live',
        error: `Failed to push events: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    // 转换为 ExecutedEvent
    const executedAt = Date.now();
    const executedEvents: ExecutedEvent[] = dryResult.derivedEvents.map((d) => ({
      event: d.event,
      executed: true,
      executedAt,
      sourceCommand: command,
    }));

    return { ok: true, mode: 'live', executedEvents };
  }
}

// ============================================================================
// ExecutorProvider - 执行器提供者
// ============================================================================

/**
 * ExecutorConfig - 执行器配置
 */
export interface ExecutorConfig {
  mode: ExecutorMode;
  onPushEvents?: EventPushCallback;
}

/**
 * 创建执行器实例
 *
 * 根据模式返回对应的执行器。
 * - 'dry': 返回 DryRunExecutor（单例）
 * - 'live': 返回新的 LiveExecutor（需要 onPushEvents 回调）
 */
export function createExecutor(config: ExecutorConfig): CommandExecutor {
  if (config.mode === 'live') {
    if (!config.onPushEvents) {
      console.warn('[createExecutor] Live mode requires onPushEvents callback, falling back to dry mode');
      return dryRunExecutor;
    }
    return new LiveExecutor(config.onPushEvents);
  }
  return dryRunExecutor;
}

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 格式化 DerivedEvent 用于 console.log
 */
export function formatDerivedEvent(derived: DerivedEvent): string {
  const evt = derived.event;
  switch (evt.type) {
    case 'FOLD':
      return `[DryRun] FOLD by ${evt.playerId}`;
    case 'CHECK':
      return `[DryRun] CHECK by ${evt.playerId}`;
    case 'CALL':
      return `[DryRun] CALL $${evt.amount} by ${evt.playerId}`;
    case 'BET':
      return `[DryRun] BET $${evt.amount} by ${evt.playerId}`;
    case 'RAISE':
      return `[DryRun] RAISE to $${evt.amount} by ${evt.playerId}`;
    case 'ALL_IN':
      return `[DryRun] ALL-IN $${evt.amount} by ${evt.playerId}`;
    default:
      return `[DryRun] ${evt.type}`;
  }
}

/**
 * 格式化 ExecutedEvent 用于 console.log
 */
export function formatExecutedEvent(executed: ExecutedEvent): string {
  const evt = executed.event;
  switch (evt.type) {
    case 'FOLD':
      return `[Executed] FOLD by ${evt.playerId}`;
    case 'CHECK':
      return `[Executed] CHECK by ${evt.playerId}`;
    case 'CALL':
      return `[Executed] CALL $${evt.amount} by ${evt.playerId}`;
    case 'BET':
      return `[Executed] BET $${evt.amount} by ${evt.playerId}`;
    case 'RAISE':
      return `[Executed] RAISE to $${evt.amount} by ${evt.playerId}`;
    case 'ALL_IN':
      return `[Executed] ALL-IN $${evt.amount} by ${evt.playerId}`;
    default:
      return `[Executed] ${evt.type}`;
  }
}

/**
 * 格式化 ExecutionResult 用于 console.log
 */
export function formatExecutionResult(result: ExecutionResult): string {
  if (!result.ok) {
    const modeTag = result.mode === 'dry' ? 'DryRun' : 'Live';
    return `[${modeTag}Error] ${result.error}`;
  }

  if (result.mode === 'dry') {
    if (result.derivedEvents.length === 0) {
      return '[DryRun] No events derived';
    }
    return result.derivedEvents.map(formatDerivedEvent).join('\n');
  } else {
    if (result.executedEvents.length === 0) {
      return '[Live] No events executed';
    }
    return result.executedEvents.map(formatExecutedEvent).join('\n');
  }
}

// ============================================================================
// 默认实例（单例模式，因为是无状态的）
// ============================================================================

/**
 * 默认的 DryRunExecutor 实例
 *
 * 因为 DryRunExecutor 是无状态的纯函数封装，
 * 使用单例可以避免重复创建实例。
 */
export const dryRunExecutor = new DryRunExecutor();
