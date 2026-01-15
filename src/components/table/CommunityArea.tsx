// ============================================================================
// CommunityArea - 公共牌区域
// ============================================================================
//
// 纯展示组件，根据 vm.snapshot 渲染公共牌和底池。
// 不持有任何状态。
//
// ============================================================================

import React from 'react';
import { GameSnapshot, CardSnapshot } from '../../types/replay';
import { Card, CardPlaceholder } from './Card';

interface CommunityAreaProps {
  snapshot: GameSnapshot;
}

/**
 * CommunityArea 公共牌区域
 */
export function CommunityArea({ snapshot }: CommunityAreaProps): React.ReactElement {
  const { communityCards, potTotal, phase } = snapshot;

  return (
    <div className="community-area">
      {/* 底池显示 */}
      <div className="pot-display">
        <span className="pot-label">Pot</span>
        <span className="pot-amount">{potTotal}</span>
      </div>

      {/* 公共牌 */}
      <div className="community-cards">
        <CommunityCards cards={communityCards} phase={phase} />
      </div>
    </div>
  );
}

/**
 * CommunityCards 公共牌行
 */
interface CommunityCardsProps {
  cards: CardSnapshot[];
  phase: string;
}

function CommunityCards({ cards, phase }: CommunityCardsProps): React.ReactElement {
  // 计算应显示的牌数
  const expectedCount = getExpectedCardCount(phase);
  const actualCount = cards.length;

  // 渲染牌
  const renderedCards: React.ReactElement[] = [];

  // 已发的牌（正面）
  for (let i = 0; i < actualCount; i++) {
    renderedCards.push(
      <Card key={`card-${i}`} card={cards[i]} size="large" />
    );
  }

  // 未发的牌（占位符）
  for (let i = actualCount; i < expectedCount; i++) {
    renderedCards.push(
      <CardPlaceholder key={`placeholder-${i}`} size="large" />
    );
  }

  // 如果是 Preflop，显示提示
  if (phase === 'Preflop' && actualCount === 0) {
    return (
      <div className="community-cards-row waiting">
        <span className="waiting-text">Waiting for flop...</span>
      </div>
    );
  }

  return (
    <div className="community-cards-row">
      {renderedCards}
    </div>
  );
}

/**
 * 根据阶段获取预期公共牌数量
 */
function getExpectedCardCount(phase: string): number {
  switch (phase) {
    case 'Preflop':
      return 0;
    case 'Flop':
      return 3;
    case 'Turn':
      return 4;
    case 'River':
    case 'Showdown':
    case 'Complete':
      return 5;
    default:
      return 0;
  }
}
