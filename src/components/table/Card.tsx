// ============================================================================
// Card - 单张卡牌组件
// ============================================================================
//
// 纯展示组件，根据 CardSnapshot 渲染卡牌。
// 支持正面显示和背面显示。
//
// ============================================================================

import React from 'react';
import { CardSnapshot } from '../../types/replay';

interface CardProps {
  card?: CardSnapshot;
  faceDown?: boolean;
  size?: 'small' | 'medium' | 'large';
}

/**
 * Card 单张卡牌
 */
export function Card({ card, faceDown = false, size = 'medium' }: CardProps): React.ReactElement {
  const sizeClass = `card-${size}`;

  // 背面
  if (faceDown || !card) {
    return (
      <span className={`card card-back ${sizeClass}`}>
        🂠
      </span>
    );
  }

  // 正面
  const suitClass = `suit-${card.suitCode.toLowerCase()}`;
  const colorClass = card.suitCode === 'H' || card.suitCode === 'D' ? 'card-red' : 'card-black';

  return (
    <span className={`card card-front ${suitClass} ${colorClass} ${sizeClass}`}>
      {card.display}
    </span>
  );
}

/**
 * CardPlaceholder 卡牌占位符
 */
export function CardPlaceholder({ size = 'medium' }: { size?: 'small' | 'medium' | 'large' }): React.ReactElement {
  return (
    <span className={`card card-placeholder card-${size}`}>
      ·
    </span>
  );
}
