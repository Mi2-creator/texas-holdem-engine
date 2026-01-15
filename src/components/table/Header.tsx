// ============================================================================
// Header - 顶部信息栏
// ============================================================================
//
// 纯展示组件，显示手牌ID和阶段信息。
// 不持有任何状态。
//
// ============================================================================

import React from 'react';
import { GameSnapshot } from '../../types/replay';

interface HeaderProps {
  snapshot: GameSnapshot;
}

/**
 * Header 顶部信息栏
 */
export function Header({ snapshot }: HeaderProps): React.ReactElement {
  const { handId, phase, roundCount } = snapshot;

  // 无数据
  if (!handId) {
    return (
      <div className="header empty">
        <span className="no-hand">No hand loaded</span>
      </div>
    );
  }

  return (
    <div className="header">
      <div className="hand-info">
        <span className="hand-id">Hand #{handId}</span>
        <span className="round-count">Round {roundCount}</span>
      </div>
      <div className="phase-info">
        <PhaseBadge phase={phase} />
      </div>
    </div>
  );
}

/**
 * PhaseBadge 阶段标签
 */
function PhaseBadge({ phase }: { phase: string }): React.ReactElement {
  const phaseClass = `phase-${phase.toLowerCase()}`;

  return (
    <span className={`phase-badge ${phaseClass}`}>
      {phase}
    </span>
  );
}
