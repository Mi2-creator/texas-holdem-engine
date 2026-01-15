// ============================================================================
// formatReplayEvent 单元测试
// ============================================================================

import { formatReplayEvent, buildPlayerNamesMap } from '../utils/formatReplayEvent';
import type { ReplayEvent } from '../replay/events';

describe('formatReplayEvent', () => {
  const playerNames = new Map([
    ['alice', 'Alice'],
    ['bob', 'Bob'],
    ['charlie', 'Charlie'],
  ]);

  describe('HAND_START', () => {
    it('应格式化手牌开始事件', () => {
      const event: ReplayEvent = {
        type: 'HAND_START',
        handId: 'h001',
        players: [
          { id: 'alice', name: 'Alice', seat: 0, chips: 500 },
          { id: 'bob', name: 'Bob', seat: 1, chips: 500 },
        ],
        dealerSeat: 0,
        smallBlindSeat: 1,
        bigBlindSeat: 0,
        smallBlind: 5,
        bigBlind: 10,
      };

      const result = formatReplayEvent(event, playerNames);
      expect(result).toBe('Hand #h001 starts. Players: Alice, Bob');
    });
  });

  describe('POST_BLIND', () => {
    it('应格式化小盲注', () => {
      const event: ReplayEvent = {
        type: 'POST_BLIND',
        playerId: 'alice',
        amount: 5,
        blindType: 'SB',
      };

      const result = formatReplayEvent(event, playerNames);
      expect(result).toBe('Alice posts small blind 5');
    });

    it('应格式化大盲注', () => {
      const event: ReplayEvent = {
        type: 'POST_BLIND',
        playerId: 'bob',
        amount: 10,
        blindType: 'BB',
      };

      const result = formatReplayEvent(event, playerNames);
      expect(result).toBe('Bob posts big blind 10');
    });
  });

  describe('DEAL_HOLE', () => {
    it('应格式化发手牌事件', () => {
      const event: ReplayEvent = {
        type: 'DEAL_HOLE',
        playerId: 'alice',
        cards: [
          { suit: 'S', rank: 'A' },
          { suit: 'H', rank: 'K' },
        ],
      };

      const result = formatReplayEvent(event, playerNames);
      expect(result).toBe('Alice is dealt [As Kh]');
    });
  });

  describe('betting actions', () => {
    it('应格式化 BET', () => {
      const event: ReplayEvent = { type: 'BET', playerId: 'alice', amount: 50 };
      expect(formatReplayEvent(event, playerNames)).toBe('Alice bets 50');
    });

    it('应格式化 CALL', () => {
      const event: ReplayEvent = { type: 'CALL', playerId: 'bob', amount: 50 };
      expect(formatReplayEvent(event, playerNames)).toBe('Bob calls 50');
    });

    it('应格式化 RAISE', () => {
      const event: ReplayEvent = { type: 'RAISE', playerId: 'alice', amount: 100 };
      expect(formatReplayEvent(event, playerNames)).toBe('Alice raises to 100');
    });

    it('应格式化 CHECK', () => {
      const event: ReplayEvent = { type: 'CHECK', playerId: 'bob' };
      expect(formatReplayEvent(event, playerNames)).toBe('Bob checks');
    });

    it('应格式化 FOLD', () => {
      const event: ReplayEvent = { type: 'FOLD', playerId: 'charlie' };
      expect(formatReplayEvent(event, playerNames)).toBe('Charlie folds');
    });

    it('应格式化 ALL_IN', () => {
      const event: ReplayEvent = { type: 'ALL_IN', playerId: 'bob', amount: 500 };
      expect(formatReplayEvent(event, playerNames)).toBe('Bob goes all-in for 500');
    });
  });

  describe('DEAL_COMMUNITY', () => {
    it('应格式化 Flop', () => {
      const event: ReplayEvent = {
        type: 'DEAL_COMMUNITY',
        phase: 'Flop',
        cards: [
          { suit: 'H', rank: 'A' },
          { suit: 'D', rank: 'K' },
          { suit: 'C', rank: '7' },
        ],
      };

      const result = formatReplayEvent(event, playerNames);
      expect(result).toBe('Flop is dealt: Ah Kd 7c');
    });

    it('应格式化 Turn', () => {
      const event: ReplayEvent = {
        type: 'DEAL_COMMUNITY',
        phase: 'Turn',
        cards: [{ suit: 'S', rank: '5' }],
      };

      expect(formatReplayEvent(event, playerNames)).toBe('Turn is dealt: 5s');
    });

    it('应格式化 River', () => {
      const event: ReplayEvent = {
        type: 'DEAL_COMMUNITY',
        phase: 'River',
        cards: [{ suit: 'H', rank: '3' }],
      };

      expect(formatReplayEvent(event, playerNames)).toBe('River is dealt: 3h');
    });
  });

  describe('SHOWDOWN', () => {
    it('应格式化摊牌事件', () => {
      const event: ReplayEvent = { type: 'SHOWDOWN' };
      expect(formatReplayEvent(event, playerNames)).toBe('Showdown');
    });
  });

  describe('HAND_END', () => {
    it('应格式化单个赢家', () => {
      const event: ReplayEvent = {
        type: 'HAND_END',
        winners: [{ playerId: 'alice', amount: 160 }],
      };

      expect(formatReplayEvent(event, playerNames)).toBe('Alice wins the pot (160)');
    });

    it('应格式化单个赢家带牌型', () => {
      const event: ReplayEvent = {
        type: 'HAND_END',
        winners: [{ playerId: 'alice', amount: 160, handRank: 'Pair of Aces' }],
      };

      expect(formatReplayEvent(event, playerNames)).toBe(
        'Alice wins the pot (160) with Pair of Aces'
      );
    });

    it('应格式化多个赢家（分池）', () => {
      const event: ReplayEvent = {
        type: 'HAND_END',
        winners: [
          { playerId: 'alice', amount: 100 },
          { playerId: 'bob', amount: 60 },
        ],
      };

      expect(formatReplayEvent(event, playerNames)).toBe(
        'Alice wins 100; Bob wins 60'
      );
    });

    it('应格式化无赢家', () => {
      const event: ReplayEvent = {
        type: 'HAND_END',
        winners: [],
      };

      expect(formatReplayEvent(event, playerNames)).toBe('Hand ends');
    });
  });

  describe('edge cases', () => {
    it('null 事件应返回空字符串', () => {
      expect(formatReplayEvent(null, playerNames)).toBe('');
    });

    it('undefined 事件应返回空字符串', () => {
      expect(formatReplayEvent(undefined, playerNames)).toBe('');
    });

    it('无 playerNames 时应使用 playerId', () => {
      const event: ReplayEvent = { type: 'BET', playerId: 'unknown', amount: 50 };
      expect(formatReplayEvent(event)).toBe('unknown bets 50');
    });
  });
});

describe('buildPlayerNamesMap', () => {
  it('应从玩家数组构建映射', () => {
    const players = [
      { id: 'p1', name: 'Alice' },
      { id: 'p2', name: 'Bob' },
    ];

    const map = buildPlayerNamesMap(players);

    expect(map.get('p1')).toBe('Alice');
    expect(map.get('p2')).toBe('Bob');
    expect(map.get('p3')).toBeUndefined();
  });

  it('空数组应返回空 Map', () => {
    const map = buildPlayerNamesMap([]);
    expect(map.size).toBe(0);
  });
});
