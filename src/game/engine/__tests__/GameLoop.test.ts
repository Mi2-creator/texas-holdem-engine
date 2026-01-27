/**
 * GameLoop.test.ts
 * Phase 16 - Comprehensive tests for game loop and hand orchestration
 *
 * Tests cover:
 * - Complete hand lifecycle (heads-up and multiplayer)
 * - All betting actions
 * - Street transitions
 * - Showdown resolution
 * - All-fold scenario
 * - All-in runout
 * - Event emission
 * - Error handling
 */

import {
  TableEngine,
  createTableEngine,
  TableEngineConfig,
  PlayerConfig,
} from '../GameLoop';
import { GameEvent, resetEventSequence } from '../GameEvents';
import { PlayerId } from '../../../security/Identity';

// ============================================================================
// Test Setup
// ============================================================================

function createTestEngine(): TableEngine {
  const config: TableEngineConfig = {
    tableId: 'test-table-1',
    smallBlind: 5,
    bigBlind: 10,
  };
  return createTableEngine(config);
}

function addTestPlayers(engine: TableEngine, count: number, stack = 1000): void {
  for (let i = 0; i < count; i++) {
    engine.addPlayer({
      id: `player${i + 1}`,
      name: `Player ${i + 1}`,
      stack,
      seat: i,
    });
  }
}

// ============================================================================
// Basic Lifecycle Tests
// ============================================================================

describe('TableEngine', () => {
  beforeEach(() => {
    resetEventSequence();
  });

  describe('Player Management', () => {
    test('adds players to table', () => {
      const engine = createTestEngine();

      engine.addPlayer({ id: 'p1', name: 'Alice', stack: 1000, seat: 0 });
      engine.addPlayer({ id: 'p2', name: 'Bob', stack: 1000, seat: 1 });

      expect(engine.getPlayerCount()).toBe(2);
    });

    test('rejects duplicate player', () => {
      const engine = createTestEngine();

      engine.addPlayer({ id: 'p1', name: 'Alice', stack: 1000, seat: 0 });

      expect(() => {
        engine.addPlayer({ id: 'p1', name: 'Alice Again', stack: 500, seat: 1 });
      }).toThrow('already at table');
    });

    test('rejects duplicate seat', () => {
      const engine = createTestEngine();

      engine.addPlayer({ id: 'p1', name: 'Alice', stack: 1000, seat: 0 });

      expect(() => {
        engine.addPlayer({ id: 'p2', name: 'Bob', stack: 500, seat: 0 });
      }).toThrow('already taken');
    });

    test('requires 2 players to start hand', () => {
      const engine = createTestEngine();
      engine.addPlayer({ id: 'p1', name: 'Alice', stack: 1000, seat: 0 });

      expect(() => engine.startHand()).toThrow('at least 2 players');
    });
  });

  describe('Hand Initialization', () => {
    test('starts hand and posts blinds', () => {
      const engine = createTestEngine();
      addTestPlayers(engine, 2);

      const handId = engine.startHand();

      expect(handId).toBeDefined();
      expect(engine.getCurrentPhase()).toBe('PREFLOP');
      expect(engine.getPot()).toBe(15); // 5 + 10 blinds
    });

    test('emits hand started and blinds posted events', () => {
      const engine = createTestEngine();
      addTestPlayers(engine, 2);

      const events: GameEvent[] = [];
      engine.onEvent(e => events.push(e));

      engine.startHand();

      const eventTypes = events.map(e => e.type);
      expect(eventTypes).toContain('HAND_STARTED');
      expect(eventTypes).toContain('BLINDS_POSTED');
      expect(eventTypes).toContain('HOLE_CARDS_DEALT');
      expect(eventTypes).toContain('PLAYER_TO_ACT');
    });

    test('deals hole cards to all players', () => {
      const engine = createTestEngine();
      addTestPlayers(engine, 3);

      const events: GameEvent[] = [];
      engine.onEvent(e => events.push(e));

      engine.startHand();

      const holeCardsEvent = events.find(e => e.type === 'HOLE_CARDS_DEALT');
      expect(holeCardsEvent).toBeDefined();

      if (holeCardsEvent?.type === 'HOLE_CARDS_DEALT') {
        expect(holeCardsEvent.playerCards.size).toBe(3);
        for (const [, cards] of holeCardsEvent.playerCards) {
          expect(cards.length).toBe(2);
        }
      }
    });
  });

  describe('Betting Actions', () => {
    test('processes fold action', () => {
      const engine = createTestEngine();
      addTestPlayers(engine, 2);
      engine.startHand();

      // In heads-up, dealer is SB and acts first preflop
      // BTN/SB is player1 (seat 0), BB is player2 (seat 1)
      // First to act preflop is left of BB, which wraps to player1
      const currentPlayer = engine.getCurrentPlayer();

      const success = engine.processAction({
        playerId: currentPlayer!,
        action: 'fold',
      });

      expect(success).toBe(true);
      expect(engine.isHandComplete()).toBe(true);
    });

    test('processes check action', () => {
      const engine = createTestEngine();
      addTestPlayers(engine, 2);
      engine.startHand();

      // Player 1 (SB/BTN) calls
      engine.processAction({ playerId: 'player1', action: 'call' });

      // Player 2 (BB) can check
      const success = engine.processAction({ playerId: 'player2', action: 'check' });

      expect(success).toBe(true);
    });

    test('processes call action', () => {
      const engine = createTestEngine();
      addTestPlayers(engine, 2);
      engine.startHand();

      const events: GameEvent[] = [];
      engine.onEvent(e => events.push(e));

      const success = engine.processAction({
        playerId: 'player1',
        action: 'call',
      });

      expect(success).toBe(true);
      expect(engine.getPot()).toBe(20); // 15 + 5 to complete

      const actedEvent = events.find(e => e.type === 'PLAYER_ACTED');
      expect(actedEvent).toBeDefined();
    });

    test('processes bet action', () => {
      const engine = createTestEngine();
      addTestPlayers(engine, 2);
      engine.startHand();

      // Call to complete the round
      engine.processAction({ playerId: 'player1', action: 'call' });
      engine.processAction({ playerId: 'player2', action: 'check' });

      // Now on flop, player can bet
      const currentPlayer = engine.getCurrentPlayer();
      const success = engine.processAction({
        playerId: currentPlayer!,
        action: 'bet',
        amount: 20,
      });

      expect(success).toBe(true);
    });

    test('processes raise action', () => {
      const engine = createTestEngine();
      addTestPlayers(engine, 2);
      engine.startHand();

      const events: GameEvent[] = [];
      engine.onEvent(e => events.push(e));

      // Raise preflop
      const success = engine.processAction({
        playerId: 'player1',
        action: 'raise',
        amount: 30, // Raise to 30 (min raise is 20)
      });

      expect(success).toBe(true);
    });

    test('processes all-in action', () => {
      const engine = createTestEngine();
      addTestPlayers(engine, 2, 100); // Smaller stacks
      engine.startHand();

      const success = engine.processAction({
        playerId: 'player1',
        action: 'all-in',
      });

      expect(success).toBe(true);

      const events = engine.getEventHistory();
      const actedEvent = events.find(
        e => e.type === 'PLAYER_ACTED' &&
        (e as any).isAllIn === true
      );
      expect(actedEvent).toBeDefined();
    });

    test('rejects action from wrong player', () => {
      const engine = createTestEngine();
      addTestPlayers(engine, 2);
      engine.startHand();

      // Try to act as wrong player
      expect(() => {
        engine.processAction({ playerId: 'player2', action: 'fold' });
      }).toThrow("Not player2's turn");
    });
  });

  describe('Street Transitions', () => {
    test('advances to flop after preflop betting complete', () => {
      const engine = createTestEngine();
      addTestPlayers(engine, 2);
      engine.startHand();

      const events: GameEvent[] = [];
      engine.onEvent(e => events.push(e));

      // Complete preflop: call + check
      engine.processAction({ playerId: 'player1', action: 'call' });
      engine.processAction({ playerId: 'player2', action: 'check' });

      expect(engine.getCurrentPhase()).toBe('FLOP');
      expect(engine.getCommunityCards().length).toBe(3);

      const streetChanged = events.find(e => e.type === 'STREET_CHANGED');
      expect(streetChanged).toBeDefined();

      const communityDealt = events.find(e => e.type === 'COMMUNITY_CARDS_DEALT');
      expect(communityDealt).toBeDefined();
    });

    test('advances through all streets to showdown', () => {
      const engine = createTestEngine();
      addTestPlayers(engine, 2);
      engine.startHand();

      // Preflop: call + check
      engine.processAction({ playerId: 'player1', action: 'call' });
      engine.processAction({ playerId: 'player2', action: 'check' });
      expect(engine.getCurrentPhase()).toBe('FLOP');

      // Flop: check + check
      engine.processAction({ playerId: 'player2', action: 'check' });
      engine.processAction({ playerId: 'player1', action: 'check' });
      expect(engine.getCurrentPhase()).toBe('TURN');
      expect(engine.getCommunityCards().length).toBe(4);

      // Turn: check + check
      engine.processAction({ playerId: 'player2', action: 'check' });
      engine.processAction({ playerId: 'player1', action: 'check' });
      expect(engine.getCurrentPhase()).toBe('RIVER');
      expect(engine.getCommunityCards().length).toBe(5);

      // River: check + check
      engine.processAction({ playerId: 'player2', action: 'check' });
      engine.processAction({ playerId: 'player1', action: 'check' });

      // Should be complete after showdown
      expect(engine.isHandComplete()).toBe(true);
    });
  });

  describe('Showdown Resolution', () => {
    test('resolves showdown and awards pot', () => {
      const engine = createTestEngine();
      addTestPlayers(engine, 2);
      engine.startHand();

      const events: GameEvent[] = [];
      engine.onEvent(e => events.push(e));

      // Play through to showdown with checks/calls
      engine.processAction({ playerId: 'player1', action: 'call' });
      engine.processAction({ playerId: 'player2', action: 'check' });

      engine.processAction({ playerId: 'player2', action: 'check' });
      engine.processAction({ playerId: 'player1', action: 'check' });

      engine.processAction({ playerId: 'player2', action: 'check' });
      engine.processAction({ playerId: 'player1', action: 'check' });

      engine.processAction({ playerId: 'player2', action: 'check' });
      engine.processAction({ playerId: 'player1', action: 'check' });

      expect(engine.isHandComplete()).toBe(true);

      // Check showdown events
      const showdownStarted = events.find(e => e.type === 'SHOWDOWN_STARTED');
      expect(showdownStarted).toBeDefined();

      const handRevealed = events.filter(e => e.type === 'HAND_REVEALED');
      expect(handRevealed.length).toBeGreaterThanOrEqual(1);

      const potAwarded = events.find(e => e.type === 'POT_AWARDED');
      expect(potAwarded).toBeDefined();

      const handEnded = events.find(e => e.type === 'HAND_ENDED');
      expect(handEnded).toBeDefined();
    });

    test('emits correct pot amount to winner', () => {
      const engine = createTestEngine();
      addTestPlayers(engine, 2);
      engine.startHand();

      const events: GameEvent[] = [];
      engine.onEvent(e => events.push(e));

      // Play to showdown
      engine.processAction({ playerId: 'player1', action: 'call' });
      engine.processAction({ playerId: 'player2', action: 'check' });
      engine.processAction({ playerId: 'player2', action: 'check' });
      engine.processAction({ playerId: 'player1', action: 'check' });
      engine.processAction({ playerId: 'player2', action: 'check' });
      engine.processAction({ playerId: 'player1', action: 'check' });
      engine.processAction({ playerId: 'player2', action: 'check' });
      engine.processAction({ playerId: 'player1', action: 'check' });

      const potAwarded = events.find(e => e.type === 'POT_AWARDED');
      if (potAwarded?.type === 'POT_AWARDED') {
        expect(potAwarded.totalPot).toBe(20); // Both called 10
      }
    });
  });

  describe('All-Fold Scenario', () => {
    test('ends hand when all but one player folds', () => {
      const engine = createTestEngine();
      addTestPlayers(engine, 3);
      engine.startHand();

      const events: GameEvent[] = [];
      engine.onEvent(e => events.push(e));

      // First to act folds
      let currentPlayer = engine.getCurrentPlayer();
      engine.processAction({ playerId: currentPlayer!, action: 'fold' });

      // Next player folds
      currentPlayer = engine.getCurrentPlayer();
      engine.processAction({ playerId: currentPlayer!, action: 'fold' });

      expect(engine.isHandComplete()).toBe(true);

      const potAwarded = events.find(e => e.type === 'POT_AWARDED');
      expect(potAwarded).toBeDefined();
      if (potAwarded?.type === 'POT_AWARDED') {
        expect(potAwarded.winnerIds.length).toBe(1);
        expect(potAwarded.winningHandDescription).toBe('Opponent folded');
      }

      const handEnded = events.find(e => e.type === 'HAND_ENDED');
      if (handEnded?.type === 'HAND_ENDED') {
        expect(handEnded.reason).toBe('all-fold');
      }
    });

    test('awards pot to remaining player after fold', () => {
      const engine = createTestEngine();
      addTestPlayers(engine, 2);
      engine.startHand();

      // Player 1 folds
      engine.processAction({ playerId: 'player1', action: 'fold' });

      const events = engine.getEventHistory();
      const potAwarded = events.find(e => e.type === 'POT_AWARDED');

      if (potAwarded?.type === 'POT_AWARDED') {
        expect(potAwarded.winnerIds).toContain('player2');
        expect(potAwarded.totalPot).toBe(15); // SB + BB
      }
    });
  });

  describe('All-In Runout', () => {
    test('deals remaining community cards when all players all-in', () => {
      const engine = createTestEngine();
      addTestPlayers(engine, 2, 50); // Small stacks to force all-in
      engine.startHand();

      const events: GameEvent[] = [];
      engine.onEvent(e => events.push(e));

      // Both go all-in preflop
      engine.processAction({ playerId: 'player1', action: 'all-in' });
      engine.processAction({ playerId: 'player2', action: 'call' });

      // Should have dealt all community cards and gone to showdown
      expect(engine.isHandComplete()).toBe(true);
      expect(engine.getCommunityCards().length).toBe(5);

      // Should have street changes for flop, turn, river
      const streetChanges = events.filter(e => e.type === 'STREET_CHANGED');
      expect(streetChanges.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Multiplayer Hands', () => {
    test('handles 6-player hand correctly', () => {
      const engine = createTestEngine();
      addTestPlayers(engine, 6);
      engine.startHand();

      expect(engine.getPot()).toBe(15);
      expect(engine.getPlayerCount()).toBe(6);

      // Everyone folds to BB
      for (let i = 0; i < 5; i++) {
        const currentPlayer = engine.getCurrentPlayer();
        if (currentPlayer) {
          engine.processAction({ playerId: currentPlayer, action: 'fold' });
        }
      }

      expect(engine.isHandComplete()).toBe(true);
    });

    test('tracks correct action order in multiplayer', () => {
      const engine = createTestEngine();
      addTestPlayers(engine, 4);
      engine.startHand();

      const actionOrder: PlayerId[] = [];
      engine.onEvent(e => {
        if (e.type === 'PLAYER_TO_ACT') {
          actionOrder.push((e as any).playerId);
        }
      });

      // First player acts
      const first = engine.getCurrentPlayer()!;
      engine.processAction({ playerId: first, action: 'call' });

      // Second player acts
      const second = engine.getCurrentPlayer()!;
      engine.processAction({ playerId: second, action: 'call' });

      // Verify different players acted
      expect(first).not.toBe(second);
    });
  });

  describe('Event History', () => {
    test('maintains complete event history', () => {
      const engine = createTestEngine();
      addTestPlayers(engine, 2);
      engine.startHand();

      engine.processAction({ playerId: 'player1', action: 'fold' });

      const history = engine.getEventHistory();

      expect(history.length).toBeGreaterThan(0);
      expect(history[0].type).toBe('HAND_STARTED');
      expect(history[history.length - 1].type).toBe('HAND_ENDED');
    });

    test('events have sequential IDs', () => {
      const engine = createTestEngine();
      addTestPlayers(engine, 2);
      engine.startHand();

      engine.processAction({ playerId: 'player1', action: 'fold' });

      const history = engine.getEventHistory();

      for (let i = 1; i < history.length; i++) {
        expect(history[i].sequence).toBeGreaterThan(history[i - 1].sequence);
      }
    });
  });

  describe('Hand Result', () => {
    test('returns null before hand complete', () => {
      const engine = createTestEngine();
      addTestPlayers(engine, 2);
      engine.startHand();

      expect(engine.getHandResult()).toBeNull();
    });

    test('returns result after hand complete', () => {
      const engine = createTestEngine();
      addTestPlayers(engine, 2);
      engine.startHand();

      engine.processAction({ playerId: 'player1', action: 'fold' });

      const result = engine.getHandResult();

      expect(result).not.toBeNull();
      expect(result?.winnerIds.length).toBe(1);
      expect(result?.events.length).toBeGreaterThan(0);
    });

    test('updates player stacks after hand', () => {
      const engine = createTestEngine();
      addTestPlayers(engine, 2);

      const initialPlayers = engine.getPlayers();
      const initialStacks = new Map(initialPlayers.map(p => [p.id, p.stack]));

      engine.startHand();
      engine.processAction({ playerId: 'player1', action: 'fold' });

      const finalPlayers = engine.getPlayers();

      // Winner should have gained chips, loser lost chips
      const p1Final = finalPlayers.find(p => p.id === 'player1')!.stack;
      const p2Final = finalPlayers.find(p => p.id === 'player2')!.stack;

      // Player 1 lost SB (5), Player 2 won pot
      expect(p1Final).toBe(initialStacks.get('player1')! - 5);
      expect(p2Final).toBe(initialStacks.get('player2')! + 5); // Won SB
    });
  });

  describe('Multiple Hands', () => {
    test('can play multiple hands in sequence', () => {
      const engine = createTestEngine();
      addTestPlayers(engine, 2);

      // Hand 1
      const handId1 = engine.startHand();
      engine.processAction({ playerId: 'player1', action: 'fold' });
      expect(engine.isHandComplete()).toBe(true);

      // Hand 2
      const handId2 = engine.startHand();
      expect(handId2).not.toBe(handId1);
      expect(engine.isHandComplete()).toBe(false);

      engine.processAction({ playerId: 'player2', action: 'fold' });
      expect(engine.isHandComplete()).toBe(true);
    });

    test('dealer rotates between hands', () => {
      const engine = createTestEngine();
      addTestPlayers(engine, 2);

      const dealerSeats: number[] = [];
      engine.onEvent(e => {
        if (e.type === 'HAND_STARTED') {
          dealerSeats.push((e as any).dealerSeat);
        }
      });

      // Hand 1
      engine.startHand();
      engine.processAction({ playerId: 'player1', action: 'fold' });

      // Hand 2
      engine.startHand();
      engine.processAction({ playerId: 'player2', action: 'fold' });

      // Dealer should have moved
      expect(dealerSeats[0]).not.toBe(dealerSeats[1]);
    });
  });
});

// ============================================================================
// Complete Hand Lifecycle Test
// ============================================================================

describe('Complete Hand Lifecycle', () => {
  beforeEach(() => {
    resetEventSequence();
  });

  test('full hand with betting on every street', () => {
    const engine = createTestEngine();
    addTestPlayers(engine, 2, 500);

    const events: GameEvent[] = [];
    engine.onEvent(e => events.push(e));

    engine.startHand();

    // Preflop: raise and call
    engine.processAction({ playerId: 'player1', action: 'raise', amount: 30 });
    engine.processAction({ playerId: 'player2', action: 'call' });

    // Flop: bet and call
    engine.processAction({ playerId: 'player2', action: 'bet', amount: 40 });
    engine.processAction({ playerId: 'player1', action: 'call' });

    // Turn: check-check
    engine.processAction({ playerId: 'player2', action: 'check' });
    engine.processAction({ playerId: 'player1', action: 'check' });

    // River: bet and call
    engine.processAction({ playerId: 'player2', action: 'bet', amount: 50 });
    engine.processAction({ playerId: 'player1', action: 'call' });

    expect(engine.isHandComplete()).toBe(true);

    // Verify event sequence
    const eventTypes = events.map(e => e.type);

    // Should have all major events
    expect(eventTypes).toContain('HAND_STARTED');
    expect(eventTypes).toContain('BLINDS_POSTED');
    expect(eventTypes).toContain('HOLE_CARDS_DEALT');
    expect(eventTypes).toContain('STREET_CHANGED');
    expect(eventTypes).toContain('COMMUNITY_CARDS_DEALT');
    expect(eventTypes).toContain('PLAYER_ACTED');
    expect(eventTypes).toContain('BETTING_ROUND_COMPLETE');
    expect(eventTypes).toContain('SHOWDOWN_STARTED');
    expect(eventTypes).toContain('POT_AWARDED');
    expect(eventTypes).toContain('HAND_ENDED');

    // Verify pot calculation
    // Preflop: 30 + 30 = 60
    // Flop: 40 + 40 = 80
    // Turn: 0
    // River: 50 + 50 = 100
    // Total: 240
    const potAwarded = events.find(e => e.type === 'POT_AWARDED');
    if (potAwarded?.type === 'POT_AWARDED') {
      expect(potAwarded.totalPot).toBe(240);
    }
  });

  test('three-player hand with elimination', () => {
    const engine = createTestEngine();
    addTestPlayers(engine, 3, 200);

    engine.startHand();

    // Get action order
    const firstPlayer = engine.getCurrentPlayer()!;
    engine.processAction({ playerId: firstPlayer, action: 'call' });

    const secondPlayer = engine.getCurrentPlayer()!;
    engine.processAction({ playerId: secondPlayer, action: 'call' });

    const thirdPlayer = engine.getCurrentPlayer()!;
    engine.processAction({ playerId: thirdPlayer, action: 'check' });

    // Now on flop - all check
    engine.processAction({ playerId: engine.getCurrentPlayer()!, action: 'check' });
    engine.processAction({ playerId: engine.getCurrentPlayer()!, action: 'check' });
    engine.processAction({ playerId: engine.getCurrentPlayer()!, action: 'check' });

    // Turn - one player bets, another folds
    engine.processAction({ playerId: engine.getCurrentPlayer()!, action: 'bet', amount: 20 });
    engine.processAction({ playerId: engine.getCurrentPlayer()!, action: 'fold' });
    engine.processAction({ playerId: engine.getCurrentPlayer()!, action: 'call' });

    // River - check to showdown
    engine.processAction({ playerId: engine.getCurrentPlayer()!, action: 'check' });
    engine.processAction({ playerId: engine.getCurrentPlayer()!, action: 'check' });

    expect(engine.isHandComplete()).toBe(true);

    const result = engine.getHandResult();
    expect(result).not.toBeNull();
    expect(result?.winnerIds.length).toBeGreaterThanOrEqual(1);
  });
});
