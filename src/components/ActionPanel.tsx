// ============================================================================
// ActionPanel - 玩家操作面板
// ============================================================================
//
// C1 阶段：仅做 UI 展示，不触发任何 replay 行为。
// C2 阶段：引入 ActionIntent 概念，点击时构造并 console.log。
// C3 阶段：引入 ActionCommand 层，Intent → Command 纯映射 + 验证。
// D  阶段：引入 CommandExecutor，推导事件（dry-run only）。
// E  阶段：支持 LiveExecutor，通过 executor prop 切换模式。
//
// 约束：
// - ActionPanel 本身不直接触碰 replay engine
// - 通过 executor prop 注入执行器（干运行或实际执行）
// - 默认使用 DryRunExecutor（向后兼容）
// - Live 模式的事件推送由外部（main.tsx）控制
//
// ============================================================================

import React, { useState } from 'react';
import { GameSnapshot } from '../types/replay';
import { validateAndCreateCommand, formatCommandResult } from '../commands/ActionCommand';
import {
  CommandExecutor,
  dryRunExecutor,
  formatExecutionResult,
} from '../commands/CommandExecutor';
import { PotOddsCalculator } from './PotOddsCalculator';

// ============================================================================
// ActionIntent 类型定义（C2 阶段）
// ============================================================================
//
// ActionIntent 是纯前端对象，表达"用户想做什么"。
// 它不会被执行、不会修改 snapshot、不会影响 replay。
// 仅在 click handler 中创建，仅用于 console.log。
//
// ============================================================================

/**
 * ActionIntent - 用户操作意图
 *
 * 纯前端概念，不执行任何实际操作。
 * source: 'UI' 表示来自用户界面交互。
 */
export type ActionIntent = {
  type: 'FOLD' | 'CHECK' | 'CALL' | 'BET' | 'RAISE';
  amount?: number;          // 仅 BET / RAISE 使用
  playerId: string;
  source: 'UI';
};

/**
 * 创建 ActionIntent 对象
 *
 * 仅在 click handler 中调用。
 * 不产生任何副作用，仅返回一个纯对象。
 */
function createActionIntent(
  type: ActionIntent['type'],
  playerId: string,
  amount?: number
): ActionIntent {
  const intent: ActionIntent = {
    type,
    playerId,
    source: 'UI',
  };
  if (amount !== undefined) {
    intent.amount = amount;
  }
  return intent;
}

// CSS for hover/active states
const ACTION_PANEL_STYLES = `
.action-btn {
  padding: 12px 24px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.1s ease, box-shadow 0.15s ease, background 0.15s ease;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.action-btn:not(:disabled):hover {
  transform: translateY(-2px);
}
.action-btn:not(:disabled):active {
  transform: translateY(0);
}
.action-btn:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.action-btn-fold {
  background: linear-gradient(135deg, #6b7280 0%, #4b5563 100%);
  color: #fff;
  box-shadow: 0 4px 12px rgba(107, 114, 128, 0.3);
}
.action-btn-fold:not(:disabled):hover {
  background: linear-gradient(135deg, #7c8392 0%, #5c6573 100%);
  box-shadow: 0 6px 16px rgba(107, 114, 128, 0.4);
}

.action-btn-check {
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  color: #fff;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
}
.action-btn-check:not(:disabled):hover {
  background: linear-gradient(135deg, #4b92ff 0%, #3573fb 100%);
  box-shadow: 0 6px 16px rgba(59, 130, 246, 0.4);
}

.action-btn-call {
  background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
  color: #fff;
  box-shadow: 0 4px 12px rgba(34, 197, 94, 0.3);
}
.action-btn-call:not(:disabled):hover {
  background: linear-gradient(135deg, #32d56e 0%, #26b35a 100%);
  box-shadow: 0 6px 16px rgba(34, 197, 94, 0.4);
}

.action-btn-bet {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  color: #1a1a1a;
  box-shadow: 0 4px 12px rgba(245, 158, 11, 0.3);
}
.action-btn-bet:not(:disabled):hover {
  background: linear-gradient(135deg, #ffa91b 0%, #e98716 100%);
  box-shadow: 0 6px 16px rgba(245, 158, 11, 0.4);
}

.action-btn-raise {
  background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
  color: #fff;
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
}
.action-btn-raise:not(:disabled):hover {
  background: linear-gradient(135deg, #ff5454 0%, #ec3636 100%);
  box-shadow: 0 6px 16px rgba(239, 68, 68, 0.4);
}

.bet-slider {
  -webkit-appearance: none;
  width: 100%;
  height: 8px;
  border-radius: 4px;
  background: linear-gradient(to right, #22c55e 0%, #f59e0b 50%, #ef4444 100%);
  outline: none;
  cursor: pointer;
}
.bet-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #fff;
  border: 3px solid #f59e0b;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  cursor: pointer;
  transition: transform 0.1s ease;
}
.bet-slider::-webkit-slider-thumb:hover {
  transform: scale(1.1);
}
.bet-slider::-moz-range-thumb {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #fff;
  border: 3px solid #f59e0b;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  cursor: pointer;
}
.bet-slider:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
`;

/**
 * 【H-5】ActionPanel Props
 *
 * UI 只读语义：
 * - snapshot: 唯一数据来源，所有判断基于 snapshot 字段
 * - selectedPlayerId: 当前选中的玩家
 * - executor: 执行器（dry 或 live），UI 不关心具体模式
 *
 * 按钮可操作性判断（仅基于 snapshot）：
 * - 显示按钮：snapshot.isActive
 * - 禁用按钮：snapshot.isHandOver 或 非当前玩家回合
 */
interface ActionPanelProps {
  /** 游戏快照（唯一数据来源） */
  snapshot: GameSnapshot;
  /** 当前选中的玩家 ID */
  selectedPlayerId: string;
  /** 执行器（可选，默认 DryRunExecutor） */
  executor?: CommandExecutor;
}

/**
 * ActionPanel - 玩家操作面板
 *
 * 【H-5】UI 只读语义：
 * - 所有状态判断仅基于 snapshot 字段
 * - 不关心 executorMode（Live / Dry 行为一致）
 * - 不判断 phase / street / index
 *
 * 可操作性判断：
 * - isMyTurn = selectedPlayerId === snapshot.currentPlayerId && snapshot.isActive
 * - 按钮禁用 = !isMyTurn || snapshot.isHandOver
 */
export function ActionPanel({
  snapshot,
  selectedPlayerId,
  executor = dryRunExecutor,
}: ActionPanelProps) {
  // ============================================================================
  // 【H-5】从 snapshot 派生 isMyTurn（不引入新语义）
  // ============================================================================
  // isMyTurn 基于以下 snapshot 字段：
  // - currentPlayerId: 当前行动玩家
  // - isActive: 下注是否进行中
  // - isHandOver: 手牌是否已结束（额外保护）
  // ============================================================================
  const isMyTurn =
    selectedPlayerId === snapshot.currentPlayerId &&
    snapshot.isActive &&
    !snapshot.isHandOver;
  // UI-only slider value（不写入 snapshot，不影响 Pot）
  // 这是 C1 唯一允许的 useState，仅控制 slider 显示值
  const [sliderValue, setSliderValue] = useState(0);

  // 从 snapshot 派生数据
  const validActions = snapshot.validActions;
  const amountToCall = snapshot.amountToCall;
  const minRaise = snapshot.minRaise;
  const bigBlind = snapshot.bigBlind;

  // 获取选中玩家数据
  const selectedPlayer = snapshot.players.find((p) => p.id === selectedPlayerId);
  const playerChips = selectedPlayer?.chips ?? 0;

  // 计算 slider 范围
  const minBet = amountToCall > 0 ? amountToCall + minRaise : bigBlind;
  const maxBet = playerChips;

  // 当 snapshot 变化时重置 slider 到最小值
  React.useEffect(() => {
    setSliderValue(minBet);
  }, [minBet, snapshot.sequence]);

  // 判断可用操作
  const canFold = validActions.includes('Fold');
  const canCheck = validActions.includes('Check');
  const canCall = validActions.includes('Call');
  const canBet = validActions.includes('Bet');
  const canRaise = validActions.includes('Raise');

  // ==========================================================================
  // 按钮点击处理（E: Intent → Command → Executor）
  // ==========================================================================
  //
  // 每个 handler 做四件事：
  // 1. 创建 ActionIntent 对象
  // 2. 调用 validateAndCreateCommand 进行验证
  // 3. 如果验证通过，调用 executor.execute（dry 或 live）
  // 4. console.log Intent、CommandResult、ExecutionResult
  //
  // executor 由外部注入：
  // - dry mode: 仅推导事件，不执行
  // - live mode: 推导并执行事件
  // ==========================================================================

  const handleFold = () => {
    const intent = createActionIntent('FOLD', selectedPlayerId);
    const cmdResult = validateAndCreateCommand(intent, snapshot);
    console.log('[ActionIntent]', intent);
    console.log(formatCommandResult(cmdResult), cmdResult);

    if (cmdResult.ok) {
      const execResult = executor.execute(cmdResult.command, snapshot);
      console.log(formatExecutionResult(execResult), execResult);
    }
  };

  const handleCheck = () => {
    const intent = createActionIntent('CHECK', selectedPlayerId);
    const cmdResult = validateAndCreateCommand(intent, snapshot);
    console.log('[ActionIntent]', intent);
    console.log(formatCommandResult(cmdResult), cmdResult);

    if (cmdResult.ok) {
      const execResult = executor.execute(cmdResult.command, snapshot);
      console.log(formatExecutionResult(execResult), execResult);
    }
  };

  const handleCall = () => {
    const intent = createActionIntent('CALL', selectedPlayerId, amountToCall);
    const cmdResult = validateAndCreateCommand(intent, snapshot);
    console.log('[ActionIntent]', intent);
    console.log(formatCommandResult(cmdResult), cmdResult);

    if (cmdResult.ok) {
      const execResult = executor.execute(cmdResult.command, snapshot);
      console.log(formatExecutionResult(execResult), execResult);
    }
  };

  const handleBet = () => {
    const intent = createActionIntent('BET', selectedPlayerId, sliderValue);
    const cmdResult = validateAndCreateCommand(intent, snapshot);
    console.log('[ActionIntent]', intent);
    console.log(formatCommandResult(cmdResult), cmdResult);

    if (cmdResult.ok) {
      const execResult = executor.execute(cmdResult.command, snapshot);
      console.log(formatExecutionResult(execResult), execResult);
    }
  };

  const handleRaise = () => {
    const intent = createActionIntent('RAISE', selectedPlayerId, sliderValue);
    const cmdResult = validateAndCreateCommand(intent, snapshot);
    console.log('[ActionIntent]', intent);
    console.log(formatCommandResult(cmdResult), cmdResult);

    if (cmdResult.ok) {
      const execResult = executor.execute(cmdResult.command, snapshot);
      console.log(formatExecutionResult(execResult), execResult);
    }
  };

  // Slider 变化处理
  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSliderValue(Number(e.target.value));
  };

  // 快捷金额按钮
  const presetAmounts = [
    { label: 'Min', value: minBet },
    { label: '1/2 Pot', value: Math.min(Math.floor(snapshot.potTotal / 2), maxBet) },
    { label: 'Pot', value: Math.min(snapshot.potTotal, maxBet) },
    { label: 'All-In', value: maxBet },
  ];

  return (
    <div
      style={{
        padding: '16px',
        background: isMyTurn ? 'rgba(74, 222, 128, 0.08)' : 'rgba(0,0,0,0.2)',
        border: isMyTurn ? '2px solid rgba(74, 222, 128, 0.3)' : '2px solid transparent',
        borderRadius: 12,
        transition: 'all 0.3s ease',
      }}
    >
      {/* Inject CSS styles */}
      <style>{ACTION_PANEL_STYLES}</style>

      {/* Section Header - 【H-5】仅显示状态，不显示 executorMode */}
      <div
        style={{
          fontSize: 11,
          color: '#888',
          textTransform: 'uppercase',
          letterSpacing: '1px',
          marginBottom: 12,
          textAlign: 'center',
        }}
      >
        Actions {!isMyTurn && '(Watching)'}
      </div>

      {/* ================================================================ */}
      {/* Primary Actions: Fold / Check / Call */}
      {/* ================================================================ */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, justifyContent: 'center' }}>
        {/* Fold */}
        <button
          className="action-btn action-btn-fold"
          onClick={handleFold}
          disabled={!isMyTurn || !canFold}
        >
          Fold
        </button>

        {/* Check or Call */}
        {canCheck ? (
          <button
            className="action-btn action-btn-check"
            onClick={handleCheck}
            disabled={!isMyTurn}
          >
            Check
          </button>
        ) : canCall ? (
          <button
            className="action-btn action-btn-call"
            onClick={handleCall}
            disabled={!isMyTurn}
          >
            Call ${amountToCall}
          </button>
        ) : null}
      </div>

      {/* ================================================================ */}
      {/* 【I-3.2】Pot Odds Calculator - 纯信息展示 */}
      {/* ================================================================ */}
      {amountToCall > 0 && (
        <div style={{ marginBottom: 16 }}>
          <PotOddsCalculator
            potTotal={snapshot.potTotal}
            amountToCall={amountToCall}
          />
        </div>
      )}

      {/* ================================================================ */}
      {/* Bet/Raise Section with Slider */}
      {/* ================================================================ */}
      {(canBet || canRaise) && (
        <div
          style={{
            padding: '12px',
            background: 'rgba(0,0,0,0.15)',
            borderRadius: 8,
          }}
        >
          {/* Current Bet Display */}
          <div style={{ textAlign: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 12, color: '#888' }}>
              {canBet ? 'Bet' : 'Raise to'}:{' '}
            </span>
            <span
              style={{
                fontSize: 20,
                fontWeight: 'bold',
                color: '#f59e0b',
              }}
            >
              ${sliderValue}
            </span>
          </div>

          {/* Slider */}
          <div style={{ marginBottom: 12 }}>
            <input
              type="range"
              className="bet-slider"
              min={minBet}
              max={maxBet}
              value={sliderValue}
              onChange={handleSliderChange}
              disabled={!isMyTurn}
            />
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 10,
                color: '#666',
                marginTop: 4,
              }}
            >
              <span>${minBet}</span>
              <span>${maxBet}</span>
            </div>
          </div>

          {/* Preset Amount Buttons */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 12, justifyContent: 'center' }}>
            {presetAmounts.map((preset) => (
              <button
                key={preset.label}
                onClick={() => setSliderValue(preset.value)}
                disabled={!isMyTurn || preset.value < minBet}
                style={{
                  padding: '4px 10px',
                  fontSize: 10,
                  fontWeight: 600,
                  border: 'none',
                  borderRadius: 4,
                  background: sliderValue === preset.value ? '#f59e0b' : '#444',
                  color: sliderValue === preset.value ? '#1a1a1a' : '#aaa',
                  cursor: isMyTurn && preset.value >= minBet ? 'pointer' : 'not-allowed',
                  transition: 'all 0.15s ease',
                  opacity: isMyTurn && preset.value >= minBet ? 1 : 0.5,
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Bet/Raise Button */}
          <div style={{ textAlign: 'center' }}>
            {canBet ? (
              <button
                className="action-btn action-btn-bet"
                onClick={handleBet}
                disabled={!isMyTurn}
                style={{ minWidth: 120 }}
              >
                Bet ${sliderValue}
              </button>
            ) : (
              <button
                className="action-btn action-btn-raise"
                onClick={handleRaise}
                disabled={!isMyTurn}
                style={{ minWidth: 120 }}
              >
                Raise to ${sliderValue}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* Valid Actions Display (Debug Info) */}
      {/* ================================================================ */}
      <div
        style={{
          marginTop: 12,
          textAlign: 'center',
          fontSize: 10,
          color: '#555',
        }}
      >
        Valid: [{validActions.join(', ') || 'none'}]
      </div>
    </div>
  );
}
