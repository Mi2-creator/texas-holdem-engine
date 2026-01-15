// ============================================================================
// Demo Events - 示例回放事件序列
// ============================================================================
//
// 一手完整的德州扑克回放，用于验证事件驱动模型。
//
// 场景：3人局
// - Alice (seat 0, Dealer): A♠ K♠
// - Bob (seat 1, SB): Q♥ J♥
// - Charlie (seat 2, BB): T♦ 9♣
//
// 动作序列：
// 1. Preflop: Alice raise 20, Bob call, Charlie fold
// 2. Flop (A♥ 7♦ 2♣): Bob check, Alice bet 30, Bob call
// 3. Turn (5♠): Bob check, Alice check
// 4. River (3♥): Bob check, Alice bet 50, Bob fold
// 5. Alice wins
//
// ============================================================================

import type { ReplayEvent } from './events';

export const demoEvents: readonly ReplayEvent[] = [
  // ========================================
  // Hand Start
  // ========================================
  {
    type: 'HAND_START',
    handId: 'demo-001',
    players: [
      { id: 'alice', name: 'Alice', seat: 0, chips: 500 },
      { id: 'bob', name: 'Bob', seat: 1, chips: 500 },
      { id: 'charlie', name: 'Charlie', seat: 2, chips: 500 },
    ],
    dealerSeat: 0,
    smallBlindSeat: 1,
    bigBlindSeat: 2,
    smallBlind: 5,
    bigBlind: 10,
  },

  // ========================================
  // Blinds
  // ========================================
  {
    type: 'POST_BLIND',
    playerId: 'bob',
    amount: 5,
    blindType: 'SB',
  },
  {
    type: 'POST_BLIND',
    playerId: 'charlie',
    amount: 10,
    blindType: 'BB',
  },

  // ========================================
  // Deal Hole Cards
  // ========================================
  {
    type: 'DEAL_HOLE',
    playerId: 'alice',
    cards: [
      { suit: 'S', rank: 'A' },
      { suit: 'S', rank: 'K' },
    ],
  },
  {
    type: 'DEAL_HOLE',
    playerId: 'bob',
    cards: [
      { suit: 'H', rank: 'Q' },
      { suit: 'H', rank: 'J' },
    ],
  },
  {
    type: 'DEAL_HOLE',
    playerId: 'charlie',
    cards: [
      { suit: 'D', rank: 'T' },
      { suit: 'C', rank: '9' },
    ],
  },

  // ========================================
  // 【H-4.1】STREET_START: Preflop
  // ========================================
  {
    type: 'STREET_START',
    street: 'PREFLOP',
  },

  // ========================================
  // Preflop Action
  // ========================================
  {
    type: 'RAISE',
    playerId: 'alice',
    amount: 20,
  },
  {
    type: 'CALL',
    playerId: 'bob',
    amount: 20,
  },
  {
    type: 'FOLD',
    playerId: 'charlie',
  },

  // ========================================
  // 【H-4.1】STREET_START: Flop
  // ========================================
  {
    type: 'STREET_START',
    street: 'FLOP',
  },

  // ========================================
  // Flop
  // ========================================
  {
    type: 'DEAL_COMMUNITY',
    phase: 'Flop',
    cards: [
      { suit: 'H', rank: 'A' },
      { suit: 'D', rank: '7' },
      { suit: 'C', rank: '2' },
    ],
  },
  {
    type: 'CHECK',
    playerId: 'bob',
  },
  {
    type: 'BET',
    playerId: 'alice',
    amount: 30,
  },
  {
    type: 'CALL',
    playerId: 'bob',
    amount: 30,
  },

  // ========================================
  // 【H-4.1】STREET_START: Turn
  // ========================================
  {
    type: 'STREET_START',
    street: 'TURN',
  },

  // ========================================
  // Turn
  // ========================================
  {
    type: 'DEAL_COMMUNITY',
    phase: 'Turn',
    cards: [{ suit: 'S', rank: '5' }],
  },
  {
    type: 'CHECK',
    playerId: 'bob',
  },
  {
    type: 'CHECK',
    playerId: 'alice',
  },

  // ========================================
  // 【H-4.1】STREET_START: River
  // ========================================
  {
    type: 'STREET_START',
    street: 'RIVER',
  },

  // ========================================
  // River
  // ========================================
  {
    type: 'DEAL_COMMUNITY',
    phase: 'River',
    cards: [{ suit: 'H', rank: '3' }],
  },
  {
    type: 'CHECK',
    playerId: 'bob',
  },
  {
    type: 'BET',
    playerId: 'alice',
    amount: 50,
  },
  {
    type: 'FOLD',
    playerId: 'bob',
  },

  // ========================================
  // Hand End (ALL_FOLD - Bob folded)
  // ========================================
  {
    type: 'HAND_END',
    reason: 'ALL_FOLD',
    winners: [
      { playerId: 'alice', amount: 160 },  // Pot: 15(blinds) + 35(preflop) + 60(flop) + 50(river) = 160
    ],
  },
];

// ============================================================================
// Demo Events (With Showdown) - 带摊牌的示例
// ============================================================================
//
// 场景：2人局到达摊牌
// - Alice (seat 0, SB): K♠ Q♠ → Flush
// - Bob (seat 1, BB): A♥ A♦ → Pair of Aces
//
// 公共牌: 9♠ 7♠ 3♠ 2♣ 4♥ (Alice has spade flush)
//
// 动作序列：
// 1. Preflop: Alice call, Bob check
// 2. Flop (9♠ 7♠ 3♠): Bob bet 20, Alice call
// 3. Turn (2♣): both check
// 4. River (4♥): Bob bet 30, Alice raise 80, Bob call
// 5. Showdown: Alice wins with Flush
//
// ============================================================================

export const demoEventsWithShowdown: readonly ReplayEvent[] = [
  // Hand Start
  {
    type: 'HAND_START',
    handId: 'demo-002',
    players: [
      { id: 'alice', name: 'Alice', seat: 0, chips: 500 },
      { id: 'bob', name: 'Bob', seat: 1, chips: 500 },
    ],
    dealerSeat: 1,          // Bob is dealer
    smallBlindSeat: 0,      // Alice is SB
    bigBlindSeat: 1,        // Bob is BB
    smallBlind: 5,
    bigBlind: 10,
  },

  // Blinds
  {
    type: 'POST_BLIND',
    playerId: 'alice',
    amount: 5,
    blindType: 'SB',
  },
  {
    type: 'POST_BLIND',
    playerId: 'bob',
    amount: 10,
    blindType: 'BB',
  },

  // Deal Hole Cards
  {
    type: 'DEAL_HOLE',
    playerId: 'alice',
    cards: [
      { suit: 'S', rank: 'K' },
      { suit: 'S', rank: 'Q' },
    ],
  },
  {
    type: 'DEAL_HOLE',
    playerId: 'bob',
    cards: [
      { suit: 'H', rank: 'A' },
      { suit: 'D', rank: 'A' },
    ],
  },

  // 【H-4.1】STREET_START: Preflop
  {
    type: 'STREET_START',
    street: 'PREFLOP',
  },

  // Preflop: Alice call, Bob check
  {
    type: 'CALL',
    playerId: 'alice',
    amount: 10,
  },
  {
    type: 'CHECK',
    playerId: 'bob',
  },

  // 【H-4.1】STREET_START: Flop
  {
    type: 'STREET_START',
    street: 'FLOP',
  },

  // Flop: 9♠ 7♠ 3♠
  {
    type: 'DEAL_COMMUNITY',
    phase: 'Flop',
    cards: [
      { suit: 'S', rank: '9' },
      { suit: 'S', rank: '7' },
      { suit: 'S', rank: '3' },
    ],
  },
  {
    type: 'BET',
    playerId: 'bob',
    amount: 20,
  },
  {
    type: 'CALL',
    playerId: 'alice',
    amount: 20,
  },

  // 【H-4.1】STREET_START: Turn
  {
    type: 'STREET_START',
    street: 'TURN',
  },

  // Turn: 2♣
  {
    type: 'DEAL_COMMUNITY',
    phase: 'Turn',
    cards: [{ suit: 'C', rank: '2' }],
  },
  {
    type: 'CHECK',
    playerId: 'bob',
  },
  {
    type: 'CHECK',
    playerId: 'alice',
  },

  // 【H-4.1】STREET_START: River
  {
    type: 'STREET_START',
    street: 'RIVER',
  },

  // River: 4♥
  {
    type: 'DEAL_COMMUNITY',
    phase: 'River',
    cards: [{ suit: 'H', rank: '4' }],
  },
  {
    type: 'BET',
    playerId: 'bob',
    amount: 30,
  },
  {
    type: 'RAISE',
    playerId: 'alice',
    amount: 80,
  },
  {
    type: 'CALL',
    playerId: 'bob',
    amount: 80,
  },

  // Showdown
  {
    type: 'SHOWDOWN',
  },

  // Hand End (SHOWDOWN): pot = 20 + 40(flop) + 160(river) = 220
  {
    type: 'HAND_END',
    reason: 'SHOWDOWN',
    winners: [
      { playerId: 'alice', amount: 220, handRank: 'Flush (King high)' },
    ],
  },
];
