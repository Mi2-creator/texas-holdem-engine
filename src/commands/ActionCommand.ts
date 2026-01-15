// ============================================================================
// ActionCommand - 命令层（C3 阶段）
// ============================================================================
//
// ActionCommand 是 ActionIntent 的验证后产物。
// 它表示"已验证、可执行但暂不执行"的命令对象。
//
// 约束：
// - 不调用 EventProcessor
// - 不调用 useEventReplayPlayer
// - 不 dispatch / apply / push 任何事件
// - 不引入任何新状态（无 useState/useRef）
// - 所有逻辑是 pure mapping / validation
// - 最终仅 console.log Command
//
// ============================================================================

import { GameSnapshot } from '../types/replay';
import { ActionIntent } from '../components/ActionPanel';

// ============================================================================
// ActionCommand 类型定义
// ============================================================================

/**
 * ActionCommand - 已验证的操作命令
 *
 * 与 ActionIntent 的区别：
 * - Intent: 用户想做什么（可能非法）
 * - Command: 已验证、可执行的命令（保证合法）
 *
 * validated: true 表示该命令已通过所有规则验证。
 */
export type ActionCommand = {
  type: 'FOLD' | 'CHECK' | 'CALL' | 'BET' | 'RAISE';
  amount?: number;          // 仅 BET / RAISE / CALL 使用
  playerId: string;
  validated: true;          // 标记为已验证
  timestamp: number;        // 创建时间戳（用于调试）
};

/**
 * CommandError - 验证失败时的错误对象
 */
export type CommandError = {
  code:
    | 'NOT_YOUR_TURN'       // 不是该玩家的回合
    | 'INVALID_ACTION'      // 操作不在 validActions 中
    | 'AMOUNT_TOO_LOW'      // 下注/加注金额低于最小值
    | 'AMOUNT_TOO_HIGH'     // 下注/加注金额超过筹码
    | 'PLAYER_NOT_FOUND'    // 找不到玩家
    | 'HAND_NOT_ACTIVE';    // 当前没有进行中的手牌
  message: string;
  intent: ActionIntent;     // 原始意图（用于调试）
};

/**
 * CommandResult - Intent → Command 映射结果
 *
 * 成功时返回 { ok: true, command: ActionCommand }
 * 失败时返回 { ok: false, error: CommandError }
 */
export type CommandResult =
  | { ok: true; command: ActionCommand }
  | { ok: false; error: CommandError };

// ============================================================================
// Intent → Command 映射函数
// ============================================================================

/**
 * 验证 ActionIntent 并映射为 ActionCommand
 *
 * 这是一个纯函数：
 * - 输入：ActionIntent + GameSnapshot
 * - 输出：CommandResult
 * - 无副作用
 *
 * @param intent - 用户操作意图
 * @param snapshot - 当前游戏快照（用于验证）
 * @returns CommandResult - 验证结果
 */
export function validateAndCreateCommand(
  intent: ActionIntent,
  snapshot: GameSnapshot
): CommandResult {
  // ----------------------------------
  // 1. 基础验证：游戏是否活跃
  // ----------------------------------
  if (!snapshot.isActive) {
    return {
      ok: false,
      error: {
        code: 'HAND_NOT_ACTIVE',
        message: 'No active hand in progress',
        intent,
      },
    };
  }

  // ----------------------------------
  // 2. 玩家验证：是否存在
  // ----------------------------------
  const player = snapshot.players.find((p) => p.id === intent.playerId);
  if (!player) {
    return {
      ok: false,
      error: {
        code: 'PLAYER_NOT_FOUND',
        message: `Player ${intent.playerId} not found`,
        intent,
      },
    };
  }

  // ----------------------------------
  // 3. 回合验证：是否是该玩家的回合
  // ----------------------------------
  if (snapshot.currentPlayerId !== intent.playerId) {
    return {
      ok: false,
      error: {
        code: 'NOT_YOUR_TURN',
        message: `Not ${player.name}'s turn (current: ${snapshot.currentPlayerId})`,
        intent,
      },
    };
  }

  // ----------------------------------
  // 4. 操作验证：是否在 validActions 中
  // ----------------------------------
  const actionMap: Record<ActionIntent['type'], string> = {
    'FOLD': 'Fold',
    'CHECK': 'Check',
    'CALL': 'Call',
    'BET': 'Bet',
    'RAISE': 'Raise',
  };
  const actionName = actionMap[intent.type];

  if (!snapshot.validActions.includes(actionName)) {
    return {
      ok: false,
      error: {
        code: 'INVALID_ACTION',
        message: `${actionName} is not a valid action. Valid: [${snapshot.validActions.join(', ')}]`,
        intent,
      },
    };
  }

  // ----------------------------------
  // 5. 金额验证（仅 BET / RAISE / CALL）
  // ----------------------------------
  if (intent.type === 'BET' || intent.type === 'RAISE') {
    const amount = intent.amount ?? 0;
    const minBet = snapshot.amountToCall > 0
      ? snapshot.amountToCall + snapshot.minRaise
      : snapshot.bigBlind;

    // 检查最小金额
    if (amount < minBet) {
      return {
        ok: false,
        error: {
          code: 'AMOUNT_TOO_LOW',
          message: `${intent.type} amount ${amount} is below minimum ${minBet}`,
          intent,
        },
      };
    }

    // 检查最大金额（不能超过筹码）
    if (amount > player.chips) {
      return {
        ok: false,
        error: {
          code: 'AMOUNT_TOO_HIGH',
          message: `${intent.type} amount ${amount} exceeds chips ${player.chips}`,
          intent,
        },
      };
    }
  }

  // ----------------------------------
  // 6. 验证通过，创建 Command
  // ----------------------------------
  const command: ActionCommand = {
    type: intent.type,
    playerId: intent.playerId,
    validated: true,
    timestamp: Date.now(),
  };

  // 添加金额（如果有）
  if (intent.type === 'CALL') {
    command.amount = snapshot.amountToCall;
  } else if (intent.type === 'BET' || intent.type === 'RAISE') {
    command.amount = intent.amount;
  }

  return { ok: true, command };
}

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 格式化 CommandResult 用于 console.log
 */
export function formatCommandResult(result: CommandResult): string {
  if (result.ok) {
    const cmd = result.command;
    const amountStr = cmd.amount !== undefined ? ` $${cmd.amount}` : '';
    return `[Command] ${cmd.type}${amountStr} by ${cmd.playerId}`;
  } else {
    const err = result.error;
    return `[CommandError] ${err.code}: ${err.message}`;
  }
}
