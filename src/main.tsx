// ============================================================================
// Main Entry - Poker Table Demo (Event-Driven)
// ============================================================================

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { useEventReplayPlayer, demoEvents, demoEventsWithShowdown, ReplayEvent } from './replay';
import { PokerTable } from './components/PokerTable';
import { ReplayDebugPanel } from './components/ReplayDebugPanel';
import { PlayerHUD } from './components/PlayerHUD';
import { ViewModeToggle, ViewMode } from './components/ViewModeToggle';
import { formatReplayEvent, buildPlayerNamesMap } from './utils';
import {
  ExecutorMode,
  createExecutor,
  dryRunExecutor,
} from './commands/CommandExecutor';

// 数据源配置（UI 层定义，不依赖 replay 类型）
const DATA_SOURCES = {
  'demo-fold': { name: 'Demo (Fold Ending)', events: demoEvents },
  'demo-showdown': { name: 'Demo (Showdown)', events: demoEventsWithShowdown },
} as const;

type DataSourceKey = keyof typeof DATA_SOURCES;

function App() {
  const { viewModel, actions, loadEvents } = useEventReplayPlayer();
  const [currentSource, setCurrentSource] = useState<DataSourceKey>('demo-fold');
  const [viewMode, setViewMode] = useState<ViewMode>('debug');
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>('');
  const [executorMode, setExecutorMode] = useState<ExecutorMode>('dry');

  // ============================================================================
  // 【H-1 语义封板】LIVE 模式事件追踪
  // ============================================================================
  //
  // LIVE 模式下，执行 Action 后 replay index 跳到【最新状态】。
  // 这是被确认的设计语义，不是 bug，不是 workaround。
  //
  // 语义定义：
  // - index === events.length 表示"所有事件已应用，处于当前真实状态"
  // - LIVE 模式永远 seek 到 events.length
  // - Debug View 可任意 seek，提供逐帧回放能力
  //
  // 该行为不可被解释为 off-by-one 错误。
  // ============================================================================

  const eventsRef = useRef<ReplayEvent[]>([...DATA_SOURCES[currentSource].events]);

  // 【H-1 封板】LIVE 模式回调：追加事件 + 跳到最新状态
  const handlePushEvents = useCallback((newEvents: ReplayEvent[]) => {
    // 追加新事件到序列
    eventsRef.current = [...eventsRef.current, ...newEvents];

    // 【H-1 语义】：latestIndex = events.length
    // 表示"所有事件已应用"，而非"最后一个事件的数组下标"
    const latestIndex = eventsRef.current.length;

    // 重新加载全部事件
    loadEvents(eventsRef.current);

    // 【H-1 语义】：LIVE 模式永远 seek 到 latestIndex
    // 这是系统核心语义：玩家永远看到当前真实状态
    setTimeout(() => {
      actions.seek(latestIndex);
    }, 0);

    console.log(`[LIVE] Pushed ${newEvents.length} event(s), seek to latestIndex=${latestIndex} (all events applied)`);
  }, [loadEvents, actions]);

  // 根据模式创建执行器
  const executor = useMemo(() => {
    if (executorMode === 'live') {
      return createExecutor({ mode: 'live', onPushEvents: handlePushEvents });
    }
    return dryRunExecutor;
  }, [executorMode, handlePushEvents]);

  // 当前事件序列（用于 UI 显示）
  const currentEvents = eventsRef.current;

  // 初始加载
  useEffect(() => {
    loadEvents(currentEvents);
  }, []);  // 只在首次渲染时加载

  // 当玩家列表变化时，自动选择第一个玩家（如果尚未选择）
  useEffect(() => {
    if (viewModel.snapshot.players.length > 0 && !selectedPlayerId) {
      setSelectedPlayerId(viewModel.snapshot.players[0].id);
    }
  }, [viewModel.snapshot.players, selectedPlayerId]);

  // 从快照派生玩家选项
  const playerOptions = useMemo(() => {
    return viewModel.snapshot.players.map((p) => ({ id: p.id, name: p.name }));
  }, [viewModel.snapshot.players]);

  // 切换数据源（同时重置 eventsRef）
  const handleDataSourceChange = useCallback((sourceKey: string) => {
    const key = sourceKey as DataSourceKey;
    if (key in DATA_SOURCES) {
      setCurrentSource(key);
      setSelectedPlayerId(''); // 重置玩家选择
      eventsRef.current = [...DATA_SOURCES[key].events]; // 重置事件追踪
      loadEvents(DATA_SOURCES[key].events);
    }
  }, [loadEvents]);

  // 切换执行模式
  const handleModeToggle = useCallback(() => {
    setExecutorMode((prev) => (prev === 'dry' ? 'live' : 'dry'));
  }, []);

  // 计算当前事件描述
  const currentEventDescription = useMemo(() => {
    const event = currentEvents[viewModel.index];
    if (!event) return '';

    // 从 snapshot 构建玩家名称映射
    const playerNames = buildPlayerNamesMap(viewModel.snapshot.players);
    return formatReplayEvent(event, playerNames);
  }, [currentEvents, viewModel.index, viewModel.snapshot.players]);

  // 【A 路线扩展】追踪前一帧快照（用于 SnapshotDiffPanel）
  // 使用 useRef 保存前一帧的 snapshot 副本（只读追踪，不修改原数据）
  const previousSnapshotRef = useRef<typeof viewModel.snapshot | undefined>(undefined);
  const currentSnapshotRef = useRef<typeof viewModel.snapshot>(viewModel.snapshot);

  // 当 index 变化时，更新前一帧引用
  const previousSnapshot = useMemo(() => {
    // 保存当前帧作为"即将成为的前一帧"
    const prev = currentSnapshotRef.current;
    currentSnapshotRef.current = viewModel.snapshot;

    // 只有当 index 大于 0 且发生了实际变化时才返回前一帧
    if (viewModel.index > 0 && prev !== viewModel.snapshot) {
      previousSnapshotRef.current = prev;
    }

    return previousSnapshotRef.current;
  }, [viewModel.index, viewModel.snapshot]);

  return (
    <div style={{ padding: 20 }}>
      {/* 视图模式切换 */}
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'center', gap: 16, alignItems: 'center' }}>
        <ViewModeToggle mode={viewMode} onModeChange={setViewMode} />

        {/* G 阶段：执行模式切换（仅 Debug View 可见） */}
        {viewMode === 'debug' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 10, color: '#888', textTransform: 'uppercase' }}>
              Executor:
            </span>
            <button
              onClick={handleModeToggle}
              style={{
                padding: '6px 14px',
                border: executorMode === 'live' ? '2px solid #22c55e' : '2px solid #555',
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
                background: executorMode === 'live'
                  ? 'linear-gradient(135deg, #166534 0%, #14532d 100%)'
                  : 'linear-gradient(135deg, #374151 0%, #1f2937 100%)',
                color: executorMode === 'live' ? '#4ade80' : '#9ca3af',
                boxShadow: executorMode === 'live'
                  ? '0 0 12px rgba(34, 197, 94, 0.4)'
                  : 'none',
                transition: 'all 0.2s ease',
                textTransform: 'uppercase',
                letterSpacing: '1px',
              }}
            >
              {executorMode === 'live' ? '● LIVE' : '○ DRY'}
            </button>
            {executorMode === 'live' && (
              <span style={{
                fontSize: 9,
                color: '#f59e0b',
                fontWeight: 600,
                animation: 'pulse 1.5s infinite',
              }}>
                ⚠ Actions will modify replay
              </span>
            )}
          </div>
        )}
      </div>

      {/* PokerTable 在两种模式下均显示 */}
      <PokerTable viewModel={viewModel} />

      {/* 根据模式切换底部面板 */}
      {viewMode === 'debug' ? (
        <ReplayDebugPanel
          viewModel={viewModel}
          actions={actions}
          dataSourceOptions={Object.entries(DATA_SOURCES).map(([key, val]) => ({
            key,
            name: val.name,
          }))}
          currentDataSource={currentSource}
          onDataSourceChange={handleDataSourceChange}
          currentEventDescription={currentEventDescription}
          currentEvent={currentEvents[viewModel.index]}
          executorMode={executorMode} // 【H-2】传递执行模式，控制 Timeline 行为
          events={currentEvents} // 【A 路线扩展】传递完整事件序列
          previousSnapshot={previousSnapshot} // 【A 路线扩展】传递前一帧快照
        />
      ) : (
        <div style={{ marginTop: 20 }}>
          {/* 【H-5】PlayerHUD 仅透传 snapshot，不传递 executorMode */}
          {/* 【A 路线】透传 events 给 ActionTimelinePanel */}
          <PlayerHUD
            viewModel={viewModel}
            actions={actions}
            currentEventDescription={currentEventDescription}
            selectedPlayerId={selectedPlayerId}
            playerOptions={playerOptions}
            onPlayerSelect={setSelectedPlayerId}
            executor={executor}
            events={currentEvents}
            previousSnapshot={previousSnapshot} // 【A 路线扩展】传递前一帧快照
          />
        </div>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
