// ============================================================================
// Table - 牌桌主体组件
// ============================================================================
//
// 纯展示组件，组合 CommunityArea 和 SeatsLayout。
// 不持有任何状态。
//
// ============================================================================

import React from 'react';
import { GameSnapshot } from '../../types/replay';
import { CommunityArea } from './CommunityArea';
import { SeatsLayout } from './SeatsLayout';

interface TableProps {
  snapshot: GameSnapshot;
}

/**
 * Table 牌桌主体
 */
export function Table({ snapshot }: TableProps): React.ReactElement {
  // 无数据时显示空牌桌
  if (!snapshot.handId) {
    return (
      <div className="table empty-table">
        <div className="table-felt">
          <span className="empty-message">No hand in progress</span>
        </div>
      </div>
    );
  }

  return (
    <div className="table">
      <div className="table-felt">
        {/* 座位布局 */}
        <SeatsLayout snapshot={snapshot} />

        {/* 公共牌区域（居中） */}
        <CommunityArea snapshot={snapshot} />
      </div>
    </div>
  );
}
