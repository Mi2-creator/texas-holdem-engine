/**
 * HandEvaluation.test.ts
 * Phase 11 - Comprehensive tests for hand evaluation
 *
 * Tests all hand ranks, tie-breaking, and showdown scenarios.
 */

import {
  Card,
  Suit,
  Rank,
  HandCategory,
  HandRankResult,
  HandEvaluationError,
  ShowdownError,
  evaluateHand,
  evaluateHandWithCommunity,
  compareHandRanks,
  compareHands,
  compareEvaluatedHands,
  determineWinners,
  determineWinnerIndices,
  areHandsEqual,
  getDecidingKickerIndex,
  resolveShowdown,
  resolveShowdownWithEvents,
  ShowdownPlayer,
  ShowdownConfig,
  ShowdownEvent,
  isShowdownNeeded,
  calculatePotSplit,
  getCategoryName,
  formatCard,
  formatCards,
} from '../core/game/hand';

// ============================================================================
// Helper Functions
// ============================================================================

function card(rank: Rank, suit: Suit): Card {
  return { rank, suit };
}

function cards(specs: Array<[Rank, Suit]>): Card[] {
  return specs.map(([r, s]) => card(r, s));
}

// ============================================================================
// Hand Category Tests
// ============================================================================

describe('Hand Evaluation - Categories', () => {
  describe('Royal Flush (Category 10)', () => {
    it('should identify royal flush', () => {
      const hand = cards([
        [14, 'spades'], // A
        [13, 'spades'], // K
        [12, 'spades'], // Q
        [11, 'spades'], // J
        [10, 'spades'], // T
      ]);
      const result = evaluateHand(hand);
      expect(result.category).toBe(10);
      expect(result.description).toBe('Royal Flush');
    });

    it('should find royal flush in 7 cards', () => {
      const hand = cards([
        [14, 'hearts'],
        [13, 'hearts'],
        [12, 'hearts'],
        [11, 'hearts'],
        [10, 'hearts'],
        [2, 'clubs'],
        [3, 'diamonds'],
      ]);
      const result = evaluateHand(hand);
      expect(result.category).toBe(10);
    });
  });

  describe('Straight Flush (Category 9)', () => {
    it('should identify straight flush', () => {
      const hand = cards([
        [9, 'diamonds'],
        [8, 'diamonds'],
        [7, 'diamonds'],
        [6, 'diamonds'],
        [5, 'diamonds'],
      ]);
      const result = evaluateHand(hand);
      expect(result.category).toBe(9);
      expect(result.kickers).toEqual([9]);
    });

    it('should identify wheel straight flush (A-2-3-4-5)', () => {
      const hand = cards([
        [14, 'clubs'],
        [2, 'clubs'],
        [3, 'clubs'],
        [4, 'clubs'],
        [5, 'clubs'],
      ]);
      const result = evaluateHand(hand);
      expect(result.category).toBe(9);
      expect(result.kickers).toEqual([5]); // 5-high
    });
  });

  describe('Four of a Kind (Category 8)', () => {
    it('should identify four of a kind', () => {
      const hand = cards([
        [14, 'spades'],
        [14, 'hearts'],
        [14, 'diamonds'],
        [14, 'clubs'],
        [13, 'spades'],
      ]);
      const result = evaluateHand(hand);
      expect(result.category).toBe(8);
      expect(result.kickers[0]).toBe(14); // Quad rank
      expect(result.kickers[1]).toBe(13); // Kicker
    });

    it('should find four of a kind in 7 cards', () => {
      const hand = cards([
        [7, 'spades'],
        [7, 'hearts'],
        [7, 'diamonds'],
        [7, 'clubs'],
        [14, 'spades'],
        [13, 'hearts'],
        [2, 'diamonds'],
      ]);
      const result = evaluateHand(hand);
      expect(result.category).toBe(8);
      expect(result.kickers[0]).toBe(7);
      expect(result.kickers[1]).toBe(14); // Best kicker
    });
  });

  describe('Full House (Category 7)', () => {
    it('should identify full house', () => {
      const hand = cards([
        [10, 'spades'],
        [10, 'hearts'],
        [10, 'diamonds'],
        [5, 'clubs'],
        [5, 'spades'],
      ]);
      const result = evaluateHand(hand);
      expect(result.category).toBe(7);
      expect(result.kickers[0]).toBe(10); // Trips
      expect(result.kickers[1]).toBe(5);  // Pair
    });

    it('should choose best full house from 7 cards with two trips', () => {
      const hand = cards([
        [10, 'spades'],
        [10, 'hearts'],
        [10, 'diamonds'],
        [8, 'clubs'],
        [8, 'spades'],
        [8, 'hearts'],
        [2, 'diamonds'],
      ]);
      const result = evaluateHand(hand);
      expect(result.category).toBe(7);
      expect(result.kickers[0]).toBe(10); // Higher trips
      expect(result.kickers[1]).toBe(8);  // Lower trips as pair
    });
  });

  describe('Flush (Category 6)', () => {
    it('should identify flush', () => {
      const hand = cards([
        [14, 'hearts'],
        [10, 'hearts'],
        [8, 'hearts'],
        [5, 'hearts'],
        [2, 'hearts'],
      ]);
      const result = evaluateHand(hand);
      expect(result.category).toBe(6);
      expect(result.kickers).toEqual([14, 10, 8, 5, 2]);
    });

    it('should find best flush in 7 cards', () => {
      const hand = cards([
        [14, 'clubs'],
        [12, 'clubs'],
        [10, 'clubs'],
        [8, 'clubs'],
        [6, 'clubs'],
        [4, 'clubs'],
        [2, 'diamonds'],
      ]);
      const result = evaluateHand(hand);
      expect(result.category).toBe(6);
      expect(result.kickers[0]).toBe(14);
    });
  });

  describe('Straight (Category 5)', () => {
    it('should identify straight', () => {
      const hand = cards([
        [10, 'spades'],
        [9, 'hearts'],
        [8, 'diamonds'],
        [7, 'clubs'],
        [6, 'spades'],
      ]);
      const result = evaluateHand(hand);
      expect(result.category).toBe(5);
      expect(result.kickers).toEqual([10]);
    });

    it('should identify wheel straight (A-2-3-4-5)', () => {
      const hand = cards([
        [14, 'spades'],
        [2, 'hearts'],
        [3, 'diamonds'],
        [4, 'clubs'],
        [5, 'spades'],
      ]);
      const result = evaluateHand(hand);
      expect(result.category).toBe(5);
      expect(result.kickers).toEqual([5]); // 5-high
    });

    it('should identify broadway straight (A-K-Q-J-T)', () => {
      const hand = cards([
        [14, 'spades'],
        [13, 'hearts'],
        [12, 'diamonds'],
        [11, 'clubs'],
        [10, 'spades'],
      ]);
      const result = evaluateHand(hand);
      expect(result.category).toBe(5);
      expect(result.kickers).toEqual([14]);
    });
  });

  describe('Three of a Kind (Category 4)', () => {
    it('should identify three of a kind', () => {
      const hand = cards([
        [9, 'spades'],
        [9, 'hearts'],
        [9, 'diamonds'],
        [14, 'clubs'],
        [7, 'spades'],
      ]);
      const result = evaluateHand(hand);
      expect(result.category).toBe(4);
      expect(result.kickers[0]).toBe(9);  // Trips
      expect(result.kickers[1]).toBe(14); // Kicker 1
      expect(result.kickers[2]).toBe(7);  // Kicker 2
    });
  });

  describe('Two Pair (Category 3)', () => {
    it('should identify two pair', () => {
      const hand = cards([
        [13, 'spades'],
        [13, 'hearts'],
        [10, 'diamonds'],
        [10, 'clubs'],
        [14, 'spades'],
      ]);
      const result = evaluateHand(hand);
      expect(result.category).toBe(3);
      expect(result.kickers[0]).toBe(13); // High pair
      expect(result.kickers[1]).toBe(10); // Low pair
      expect(result.kickers[2]).toBe(14); // Kicker
    });

    it('should choose best two pair from three pairs', () => {
      const hand = cards([
        [14, 'spades'],
        [14, 'hearts'],
        [10, 'diamonds'],
        [10, 'clubs'],
        [5, 'spades'],
        [5, 'hearts'],
        [2, 'diamonds'],
      ]);
      const result = evaluateHand(hand);
      expect(result.category).toBe(3);
      expect(result.kickers[0]).toBe(14); // Best pair
      expect(result.kickers[1]).toBe(10); // Second best pair
    });
  });

  describe('One Pair (Category 2)', () => {
    it('should identify one pair', () => {
      const hand = cards([
        [11, 'spades'],
        [11, 'hearts'],
        [14, 'diamonds'],
        [8, 'clubs'],
        [3, 'spades'],
      ]);
      const result = evaluateHand(hand);
      expect(result.category).toBe(2);
      expect(result.kickers[0]).toBe(11); // Pair
      expect(result.kickers[1]).toBe(14); // Kicker 1
      expect(result.kickers[2]).toBe(8);  // Kicker 2
      expect(result.kickers[3]).toBe(3);  // Kicker 3
    });
  });

  describe('High Card (Category 1)', () => {
    it('should identify high card', () => {
      const hand = cards([
        [14, 'spades'],
        [12, 'hearts'],
        [9, 'diamonds'],
        [7, 'clubs'],
        [2, 'spades'],
      ]);
      const result = evaluateHand(hand);
      expect(result.category).toBe(1);
      expect(result.kickers).toEqual([14, 12, 9, 7, 2]);
    });
  });
});

// ============================================================================
// Tie-Breaking Tests
// ============================================================================

describe('Hand Comparison - Tie Breaking', () => {
  describe('Category Comparison', () => {
    it('should rank flush over straight', () => {
      const flush = cards([
        [14, 'hearts'],
        [10, 'hearts'],
        [8, 'hearts'],
        [5, 'hearts'],
        [2, 'hearts'],
      ]);
      const straight = cards([
        [10, 'spades'],
        [9, 'hearts'],
        [8, 'diamonds'],
        [7, 'clubs'],
        [6, 'spades'],
      ]);
      expect(compareHands(flush, straight)).toBe(1);
      expect(compareHands(straight, flush)).toBe(-1);
    });

    it('should rank full house over flush', () => {
      const fullHouse = cards([
        [5, 'spades'],
        [5, 'hearts'],
        [5, 'diamonds'],
        [2, 'clubs'],
        [2, 'spades'],
      ]);
      const flush = cards([
        [14, 'hearts'],
        [13, 'hearts'],
        [11, 'hearts'],
        [9, 'hearts'],
        [7, 'hearts'],
      ]);
      expect(compareHands(fullHouse, flush)).toBe(1);
    });
  });

  describe('Kicker Comparison', () => {
    it('should break tie with kicker in high card', () => {
      const handA = cards([
        [14, 'spades'],
        [13, 'hearts'],
        [10, 'diamonds'],
        [7, 'clubs'],
        [2, 'spades'],
      ]);
      const handB = cards([
        [14, 'clubs'],
        [13, 'diamonds'],
        [10, 'hearts'],
        [6, 'spades'],
        [2, 'hearts'],
      ]);
      // A wins with 7 kicker vs 6 kicker
      expect(compareHands(handA, handB)).toBe(1);
    });

    it('should break tie with kicker in one pair', () => {
      const handA = cards([
        [10, 'spades'],
        [10, 'hearts'],
        [14, 'diamonds'],
        [8, 'clubs'],
        [3, 'spades'],
      ]);
      const handB = cards([
        [10, 'clubs'],
        [10, 'diamonds'],
        [13, 'hearts'],
        [8, 'spades'],
        [3, 'hearts'],
      ]);
      // A wins with Ace kicker vs King kicker
      expect(compareHands(handA, handB)).toBe(1);
    });

    it('should break tie with pair rank in two pair', () => {
      const handA = cards([
        [14, 'spades'],
        [14, 'hearts'],
        [10, 'diamonds'],
        [10, 'clubs'],
        [5, 'spades'],
      ]);
      const handB = cards([
        [13, 'clubs'],
        [13, 'diamonds'],
        [10, 'hearts'],
        [10, 'spades'],
        [5, 'hearts'],
      ]);
      // A wins with Aces over Kings
      expect(compareHands(handA, handB)).toBe(1);
    });

    it('should recognize exact tie in two pair', () => {
      const handA = cards([
        [14, 'spades'],
        [14, 'hearts'],
        [10, 'diamonds'],
        [10, 'clubs'],
        [5, 'spades'],
      ]);
      const handB = cards([
        [14, 'clubs'],
        [14, 'diamonds'],
        [10, 'hearts'],
        [10, 'spades'],
        [5, 'hearts'],
      ]);
      expect(compareHands(handA, handB)).toBe(0);
    });

    it('should break tie with kicker in full house', () => {
      const handA = cards([
        [10, 'spades'],
        [10, 'hearts'],
        [10, 'diamonds'],
        [14, 'clubs'],
        [14, 'spades'],
      ]);
      const handB = cards([
        [10, 'clubs'],
        [10, 'diamonds'],
        [10, 'hearts'],
        [13, 'spades'],
        [13, 'hearts'],
      ]);
      // A wins with Aces full vs Kings full
      expect(compareHands(handA, handB)).toBe(1);
    });

    it('should break tie in straight by high card', () => {
      const handA = cards([
        [10, 'spades'],
        [9, 'hearts'],
        [8, 'diamonds'],
        [7, 'clubs'],
        [6, 'spades'],
      ]);
      const handB = cards([
        [9, 'clubs'],
        [8, 'diamonds'],
        [7, 'hearts'],
        [6, 'spades'],
        [5, 'hearts'],
      ]);
      // A wins with T-high vs 9-high
      expect(compareHands(handA, handB)).toBe(1);
    });
  });

  describe('areHandsEqual', () => {
    it('should return true for identical hands', () => {
      const handA = evaluateHand(cards([
        [14, 'spades'],
        [14, 'hearts'],
        [10, 'diamonds'],
        [7, 'clubs'],
        [3, 'spades'],
      ]));
      const handB = evaluateHand(cards([
        [14, 'clubs'],
        [14, 'diamonds'],
        [10, 'hearts'],
        [7, 'spades'],
        [3, 'hearts'],
      ]));
      expect(areHandsEqual(handA, handB)).toBe(true);
    });

    it('should return false for different categories', () => {
      const pair = evaluateHand(cards([
        [14, 'spades'],
        [14, 'hearts'],
        [10, 'diamonds'],
        [7, 'clubs'],
        [3, 'spades'],
      ]));
      const trips = evaluateHand(cards([
        [14, 'clubs'],
        [14, 'diamonds'],
        [14, 'hearts'],
        [7, 'spades'],
        [3, 'hearts'],
      ]));
      expect(areHandsEqual(pair, trips)).toBe(false);
    });
  });

  describe('getDecidingKickerIndex', () => {
    it('should return -1 for equal hands', () => {
      const handA = evaluateHand(cards([
        [14, 'spades'],
        [13, 'hearts'],
        [10, 'diamonds'],
        [7, 'clubs'],
        [2, 'spades'],
      ]));
      const handB = evaluateHand(cards([
        [14, 'clubs'],
        [13, 'diamonds'],
        [10, 'hearts'],
        [7, 'spades'],
        [2, 'hearts'],
      ]));
      expect(getDecidingKickerIndex(handA, handB)).toBe(-1);
    });

    it('should return correct index for kicker difference', () => {
      const handA = evaluateHand(cards([
        [14, 'spades'],
        [13, 'hearts'],
        [10, 'diamonds'],
        [8, 'clubs'],
        [2, 'spades'],
      ]));
      const handB = evaluateHand(cards([
        [14, 'clubs'],
        [13, 'diamonds'],
        [10, 'hearts'],
        [7, 'spades'],
        [2, 'hearts'],
      ]));
      expect(getDecidingKickerIndex(handA, handB)).toBe(3); // 4th kicker (8 vs 7)
    });
  });
});

// ============================================================================
// Winner Determination Tests
// ============================================================================

describe('Winner Determination', () => {
  it('should determine single winner', () => {
    const hands = [
      { playerId: 'p1', cards: cards([[14, 'spades'], [14, 'hearts'], [10, 'diamonds'], [7, 'clubs'], [3, 'spades']]) },
      { playerId: 'p2', cards: cards([[13, 'clubs'], [13, 'diamonds'], [10, 'hearts'], [7, 'spades'], [3, 'hearts']]) },
    ];
    const result = determineWinners(hands);
    expect(result.winnerIds).toEqual(['p1']);
    expect(result.isTie).toBe(false);
  });

  it('should determine tie for split pot', () => {
    const hands = [
      { playerId: 'p1', cards: cards([[14, 'spades'], [14, 'hearts'], [10, 'diamonds'], [7, 'clubs'], [3, 'spades']]) },
      { playerId: 'p2', cards: cards([[14, 'clubs'], [14, 'diamonds'], [10, 'hearts'], [7, 'spades'], [3, 'hearts']]) },
    ];
    const result = determineWinners(hands);
    expect(result.winnerIds).toHaveLength(2);
    expect(result.winnerIds).toContain('p1');
    expect(result.winnerIds).toContain('p2');
    expect(result.isTie).toBe(true);
  });

  it('should throw on empty hands array', () => {
    expect(() => determineWinners([])).toThrow(HandEvaluationError);
  });

  describe('determineWinnerIndices', () => {
    it('should return indices of winners', () => {
      const hands = [
        cards([[5, 'spades'], [5, 'hearts'], [10, 'diamonds'], [7, 'clubs'], [3, 'spades']]),
        cards([[14, 'clubs'], [14, 'diamonds'], [10, 'hearts'], [7, 'spades'], [3, 'hearts']]),
        cards([[8, 'diamonds'], [8, 'clubs'], [10, 'spades'], [7, 'hearts'], [3, 'diamonds']]),
      ];
      const winners = determineWinnerIndices(hands);
      expect(winners).toEqual([1]); // Player 2 has Aces
    });

    it('should return multiple indices for tie', () => {
      const hands = [
        cards([[14, 'spades'], [14, 'hearts'], [10, 'diamonds'], [7, 'clubs'], [3, 'spades']]),
        cards([[14, 'clubs'], [14, 'diamonds'], [10, 'hearts'], [7, 'spades'], [3, 'hearts']]),
      ];
      const winners = determineWinnerIndices(hands);
      expect(winners).toHaveLength(2);
      expect(winners).toContain(0);
      expect(winners).toContain(1);
    });
  });
});

// ============================================================================
// Showdown Tests
// ============================================================================

describe('Showdown Resolution', () => {
  const communityCards = cards([
    [10, 'hearts'],
    [9, 'hearts'],
    [8, 'diamonds'],
    [4, 'clubs'],
    [2, 'spades'],
  ]);

  describe('Basic Showdown', () => {
    it('should resolve showdown with single winner', () => {
      const players: ShowdownPlayer[] = [
        { id: 'p1', name: 'Player 1', holeCards: cards([[14, 'spades'], [14, 'clubs']]), folded: false },
        { id: 'p2', name: 'Player 2', holeCards: cards([[13, 'spades'], [13, 'clubs']]), folded: false },
      ];
      const config: ShowdownConfig = { players, communityCards, potSize: 100 };
      const result = resolveShowdown(config);

      expect(result.winnerIds).toEqual(['p1']);
      expect(result.isSplitPot).toBe(false);
      expect(result.potAwarded).toBe(100);
    });

    it('should resolve split pot', () => {
      const players: ShowdownPlayer[] = [
        { id: 'p1', name: 'Player 1', holeCards: cards([[14, 'spades'], [13, 'clubs']]), folded: false },
        { id: 'p2', name: 'Player 2', holeCards: cards([[14, 'clubs'], [13, 'spades']]), folded: false },
      ];
      const config: ShowdownConfig = { players, communityCards, potSize: 100 };
      const result = resolveShowdown(config);

      expect(result.winnerIds).toHaveLength(2);
      expect(result.isSplitPot).toBe(true);
      expect(result.players[0].amountWon).toBe(50);
      expect(result.players[1].amountWon).toBe(50);
    });

    it('should handle folded player', () => {
      const players: ShowdownPlayer[] = [
        { id: 'p1', name: 'Player 1', holeCards: cards([[2, 'spades'], [3, 'clubs']]), folded: false },
        { id: 'p2', name: 'Player 2', holeCards: cards([[14, 'spades'], [14, 'clubs']]), folded: true },
      ];
      const config: ShowdownConfig = { players, communityCards, potSize: 100 };
      const result = resolveShowdown(config);

      expect(result.winnerIds).toEqual(['p1']);
      expect(result.players[1].folded).toBe(true);
      expect(result.players[1].handRank).toBeNull();
    });
  });

  describe('Event Emission', () => {
    it('should emit all showdown events in order', () => {
      const players: ShowdownPlayer[] = [
        { id: 'p1', name: 'Player 1', holeCards: cards([[14, 'spades'], [14, 'clubs']]), folded: false },
        { id: 'p2', name: 'Player 2', holeCards: cards([[13, 'spades'], [13, 'clubs']]), folded: false },
      ];
      const config: ShowdownConfig = { players, communityCards, potSize: 100 };
      const events: ShowdownEvent[] = [];

      resolveShowdownWithEvents(config, e => events.push(e));

      expect(events[0].type).toBe('showdown-started');
      expect(events[1].type).toBe('hand-evaluated');
      expect(events[2].type).toBe('hand-evaluated');
      expect(events[3].type).toBe('pot-awarded');
      expect(events[4].type).toBe('hand-completed');
    });
  });

  describe('Validation', () => {
    it('should throw on insufficient community cards', () => {
      const players: ShowdownPlayer[] = [
        { id: 'p1', name: 'Player 1', holeCards: cards([[14, 'spades'], [14, 'clubs']]), folded: false },
      ];
      const config: ShowdownConfig = {
        players,
        communityCards: cards([[10, 'hearts'], [9, 'hearts'], [8, 'diamonds']]), // Only 3
        potSize: 100,
      };
      expect(() => resolveShowdown(config)).toThrow(ShowdownError);
    });

    it('should throw on zero pot', () => {
      const players: ShowdownPlayer[] = [
        { id: 'p1', name: 'Player 1', holeCards: cards([[14, 'spades'], [14, 'clubs']]), folded: false },
      ];
      const config: ShowdownConfig = { players, communityCards, potSize: 0 };
      expect(() => resolveShowdown(config)).toThrow(ShowdownError);
    });

    it('should throw on invalid hole cards', () => {
      const players: ShowdownPlayer[] = [
        { id: 'p1', name: 'Player 1', holeCards: cards([[14, 'spades']]), folded: false }, // Only 1 card
      ];
      const config: ShowdownConfig = { players, communityCards, potSize: 100 };
      expect(() => resolveShowdown(config)).toThrow(ShowdownError);
    });

    it('should throw on all folded players', () => {
      const players: ShowdownPlayer[] = [
        { id: 'p1', name: 'Player 1', holeCards: cards([[14, 'spades'], [14, 'clubs']]), folded: true },
        { id: 'p2', name: 'Player 2', holeCards: cards([[13, 'spades'], [13, 'clubs']]), folded: true },
      ];
      const config: ShowdownConfig = { players, communityCards, potSize: 100 };
      expect(() => resolveShowdown(config)).toThrow(ShowdownError);
    });
  });

  describe('Utility Functions', () => {
    it('isShowdownNeeded should return true for multiple active players', () => {
      const players: ShowdownPlayer[] = [
        { id: 'p1', name: 'Player 1', holeCards: [], folded: false },
        { id: 'p2', name: 'Player 2', holeCards: [], folded: false },
      ];
      expect(isShowdownNeeded(players)).toBe(true);
    });

    it('isShowdownNeeded should return false for single active player', () => {
      const players: ShowdownPlayer[] = [
        { id: 'p1', name: 'Player 1', holeCards: [], folded: false },
        { id: 'p2', name: 'Player 2', holeCards: [], folded: true },
      ];
      expect(isShowdownNeeded(players)).toBe(false);
    });

    it('calculatePotSplit should split evenly', () => {
      const split = calculatePotSplit(100, 2);
      expect(split.amountPerWinner).toBe(50);
      expect(split.remainder).toBe(0);
    });

    it('calculatePotSplit should handle remainder', () => {
      const split = calculatePotSplit(100, 3);
      expect(split.amountPerWinner).toBe(33);
      expect(split.remainder).toBe(1);
    });
  });
});

// ============================================================================
// 7-Card Evaluation Tests
// ============================================================================

describe('7-Card Evaluation', () => {
  it('should find best hand from 7 cards', () => {
    const holeCards = cards([[14, 'hearts'], [13, 'hearts']]);
    const community = cards([
      [12, 'hearts'],
      [11, 'hearts'],
      [10, 'hearts'],
      [2, 'clubs'],
      [3, 'diamonds'],
    ]);
    const result = evaluateHandWithCommunity(holeCards, community);
    expect(result.category).toBe(10); // Royal Flush
  });

  it('should evaluate with only flop (3 community cards)', () => {
    const holeCards = cards([[14, 'spades'], [14, 'hearts']]);
    const community = cards([
      [14, 'diamonds'],
      [10, 'clubs'],
      [5, 'hearts'],
    ]);
    const result = evaluateHandWithCommunity(holeCards, community);
    expect(result.category).toBe(4); // Three of a Kind
  });

  it('should throw on invalid hole cards count', () => {
    const holeCards = cards([[14, 'spades']]);
    const community = cards([
      [10, 'hearts'],
      [9, 'hearts'],
      [8, 'diamonds'],
      [4, 'clubs'],
      [2, 'spades'],
    ]);
    expect(() => evaluateHandWithCommunity(holeCards, community)).toThrow(HandEvaluationError);
  });
});

// ============================================================================
// Utility Function Tests
// ============================================================================

describe('Utility Functions', () => {
  describe('getCategoryName', () => {
    it('should return correct names', () => {
      expect(getCategoryName(1)).toBe('High Card');
      expect(getCategoryName(2)).toBe('One Pair');
      expect(getCategoryName(10)).toBe('Royal Flush');
    });
  });

  describe('formatCard', () => {
    it('should format cards correctly', () => {
      expect(formatCard(card(14, 'spades'))).toBe('A♠');
      expect(formatCard(card(13, 'hearts'))).toBe('K♥');
      expect(formatCard(card(10, 'diamonds'))).toBe('T♦');
      expect(formatCard(card(2, 'clubs'))).toBe('2♣');
    });
  });

  describe('formatCards', () => {
    it('should format multiple cards', () => {
      const hand = cards([[14, 'spades'], [13, 'hearts']]);
      expect(formatCards(hand)).toBe('A♠ K♥');
    });
  });
});
