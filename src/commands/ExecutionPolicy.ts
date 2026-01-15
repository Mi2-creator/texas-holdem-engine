// ============================================================================
// ExecutionPolicy - 执行策略/验证层（F 阶段）
// ============================================================================
//
// 在 ActionCommand 与 Executor 之间的纯规则层。
// 用于判断 Command 在当前 Snapshot 下是否"可执行"。
//
// 设计原则：
// - 纯函数：validateCommand(command, snapshot) → ValidationResult
// - 无副作用：不读取 engine 内部状态，不引入 useState/useRef
// - 不抛异常：通过返回值表达验证结果
//
// 与 ActionCommand.validateAndCreateCommand 的区别：
// - validateAndCreateCommand: Intent → Command 转换时的基础验证
// - validateCommand: Command → Execution 前的策略验证
//
// ============================================================================

import { GameSnapshot } from '../types/replay';
import { ActionCommand } from './ActionCommand';

// ============================================================================
// ValidationResult 类型定义
// ============================================================================

/**
 * ValidationRejection - 验证拒绝原因
 */
export interface ValidationRejection {
  code:
    | 'PLAYER_FOLDED'         // 玩家已弃牌
    | 'PLAYER_ALL_IN'         // 玩家已全押（不能再行动）
    | 'PLAYER_OUT'            // 玩家已出局
    | 'INSUFFICIENT_CHIPS'    // 筹码不足
    | 'INVALID_RAISE_AMOUNT'  // 加注金额无效
    | 'BETTING_CLOSED'        // 当前不允许下注
    | 'ACTION_MISMATCH'       // 操作与游戏状态不匹配
    | 'HAND_INACTIVE';        // 牌局未激活
  message: string;
  details?: Record<string, unknown>;
}

/**
 * ValidationResult - 验证结果
 *
 * - OK: 命令可以执行
 * - Reject: 命令不能执行，附带原因
 */
export type ValidationResult =
  | { valid: true }
  | { valid: false; rejection: ValidationRejection };

// ============================================================================
// 核心验证函数
// ============================================================================

/**
 * validateCommand - 验证命令是否可执行
 *
 * 纯函数：
 * - 输入：ActionCommand + GameSnapshot
 * - 输出：ValidationResult
 * - 无副作用
 *
 * @param command - 已通过基础验证的命令
 * @param snapshot - 当前游戏快照
 * @returns ValidationResult
 */
export function validateCommand(
  command: ActionCommand,
  snapshot: GameSnapshot
): ValidationResult {
  // ----------------------------------
  // 1. 牌局状态验证
  // ----------------------------------
  if (!snapshot.isActive) {
    return reject('HAND_INACTIVE', 'Cannot execute command: hand is not active');
  }

  // ----------------------------------
  // 2. 玩家状态验证
  // ----------------------------------
  const player = snapshot.players.find((p) => p.id === command.playerId);
  if (!player) {
    return reject('ACTION_MISMATCH', `Player ${command.playerId} not found`);
  }

  // 检查玩家状态
  if (player.status === 'Folded') {
    return reject('PLAYER_FOLDED', `${player.name} has already folded`);
  }

  if (player.status === 'AllIn') {
    return reject('PLAYER_ALL_IN', `${player.name} is all-in and cannot act`);
  }

  if (player.status === 'Out') {
    return reject('PLAYER_OUT', `${player.name} is out of the game`);
  }

  // ----------------------------------
  // 3. 操作特定验证
  // ----------------------------------
  switch (command.type) {
    case 'FOLD':
      return validateFold(command, snapshot, player);

    case 'CHECK':
      return validateCheck(command, snapshot, player);

    case 'CALL':
      return validateCall(command, snapshot, player);

    case 'BET':
      return validateBet(command, snapshot, player);

    case 'RAISE':
      return validateRaise(command, snapshot, player);

    default:
      return reject('ACTION_MISMATCH', `Unknown action type: ${command.type}`);
  }
}

// ============================================================================
// 操作特定验证函数
// ============================================================================

interface PlayerInfo {
  id: string;
  name: string;
  chips: number;
  bet: number;
  status: string;
}

/**
 * 验证 FOLD 操作
 */
function validateFold(
  _command: ActionCommand,
  snapshot: GameSnapshot,
  _player: PlayerInfo
): ValidationResult {
  // Fold 总是可以执行（只要牌局活跃且玩家可以行动）
  if (!snapshot.validActions.includes('Fold')) {
    return reject('ACTION_MISMATCH', 'Fold is not a valid action at this time');
  }
  return ok();
}

/**
 * 验证 CHECK 操作
 */
function validateCheck(
  _command: ActionCommand,
  snapshot: GameSnapshot,
  _player: PlayerInfo
): ValidationResult {
  if (!snapshot.validActions.includes('Check')) {
    return reject(
      'ACTION_MISMATCH',
      'Check is not valid: there is a bet to call',
      { amountToCall: snapshot.amountToCall }
    );
  }
  return ok();
}

/**
 * 验证 CALL 操作
 */
function validateCall(
  command: ActionCommand,
  snapshot: GameSnapshot,
  player: PlayerInfo
): ValidationResult {
  if (!snapshot.validActions.includes('Call')) {
    return reject('ACTION_MISMATCH', 'Call is not a valid action at this time');
  }

  const callAmount = command.amount ?? snapshot.amountToCall;

  // 检查是否有足够筹码跟注（部分跟注也算有效，会变成 all-in）
  if (callAmount > 0 && player.chips <= 0) {
    return reject(
      'INSUFFICIENT_CHIPS',
      `${player.name} has no chips to call`,
      { required: callAmount, available: player.chips }
    );
  }

  return ok();
}

/**
 * 验证 BET 操作
 */
function validateBet(
  command: ActionCommand,
  snapshot: GameSnapshot,
  player: PlayerInfo
): ValidationResult {
  if (!snapshot.validActions.includes('Bet')) {
    return reject(
      'ACTION_MISMATCH',
      'Bet is not valid: there is already a bet in this round',
      { currentBet: snapshot.amountToCall }
    );
  }

  const betAmount = command.amount ?? 0;
  const minBet = snapshot.bigBlind;

  // 检查最小下注
  if (betAmount < minBet && betAmount < player.chips) {
    return reject(
      'INVALID_RAISE_AMOUNT',
      `Bet amount $${betAmount} is below minimum $${minBet}`,
      { amount: betAmount, minimum: minBet }
    );
  }

  // 检查筹码是否足够
  if (betAmount > player.chips) {
    return reject(
      'INSUFFICIENT_CHIPS',
      `Bet amount $${betAmount} exceeds available chips $${player.chips}`,
      { amount: betAmount, available: player.chips }
    );
  }

  return ok();
}

/**
 * 验证 RAISE 操作
 */
function validateRaise(
  command: ActionCommand,
  snapshot: GameSnapshot,
  player: PlayerInfo
): ValidationResult {
  if (!snapshot.validActions.includes('Raise')) {
    return reject('ACTION_MISMATCH', 'Raise is not a valid action at this time');
  }

  const raiseAmount = command.amount ?? 0;
  const minRaise = snapshot.amountToCall + snapshot.minRaise;

  // 检查最小加注（除非是 all-in）
  if (raiseAmount < minRaise && raiseAmount < player.chips) {
    return reject(
      'INVALID_RAISE_AMOUNT',
      `Raise to $${raiseAmount} is below minimum $${minRaise}`,
      { amount: raiseAmount, minimum: minRaise }
    );
  }

  // 检查筹码是否足够（加注金额是总下注额，需要减去当前已下注）
  const additionalRequired = raiseAmount - player.bet;
  if (additionalRequired > player.chips) {
    return reject(
      'INSUFFICIENT_CHIPS',
      `Need $${additionalRequired} more to raise, but only have $${player.chips}`,
      { required: additionalRequired, available: player.chips }
    );
  }

  return ok();
}

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 创建 OK 结果
 */
function ok(): ValidationResult {
  return { valid: true };
}

/**
 * 创建 Reject 结果
 */
function reject(
  code: ValidationRejection['code'],
  message: string,
  details?: Record<string, unknown>
): ValidationResult {
  return {
    valid: false,
    rejection: { code, message, details },
  };
}

/**
 * 格式化 ValidationResult 用于日志
 */
export function formatValidationResult(result: ValidationResult): string {
  if (result.valid) {
    return '[Policy] OK - Command is executable';
  }
  return `[Policy] REJECTED (${result.rejection.code}): ${result.rejection.message}`;
}
