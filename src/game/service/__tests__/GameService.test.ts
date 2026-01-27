/**
 * GameService.test.ts
 * Phase 17 - Comprehensive tests for GameService layer
 */
import { GameService, createGameService } from '../GameService';
import { GameServiceConfig, GameState, HandResult } from '../ServiceTypes';
import { GameEvent } from '../../engine/GameEvents';

describe('GameService', () => {
  let service: GameService;

  const defaultConfig: Partial<GameServiceConfig> = {
    tableId: 'test-table',
    smallBlind: 5,
    bigBlind: 10,
    minPlayers: 2,
    maxPlayers: 9,
  };

  beforeEach(() => {
    service = createGameService(defaultConfig);
  });

  // ==========================================================================
  // Service Creation
  // ==========================================================================

  describe('Service Creation', () => {
    it('creates service with default config', () => {
      const svc = createGameService();
      expect(svc).toBeInstanceOf(GameService);
      const config = svc.getConfig();
      expect(config.smallBlind).toBe(5);
      expect(config.bigBlind).toBe(10);
    });

    it('creates service with custom config', () => {
      const config = service.getConfig();
      expect(config.tableId).toBe('test-table');
      expect(config.smallBlind).toBe(5);
      expect(config.bigBlind).toBe(10);
    });

    it('reports initial status', () => {
      const status = service.getStatus();
      expect(status.isRunning).toBe(true);
      expect(status.tableId).toBe('test-table');
      expect(status.playerCount).toBe(0);
      expect(status.handCount).toBe(0);
      expect(status.currentHandId).toBeNull();
    });
  });

  // ==========================================================================
  // Player Management
  // ==========================================================================

  describe('Player Management', () => {
    describe('joinTable', () => {
      it('adds player to table', () => {
        const result = service.joinTable({
          playerId: 'p1',
          playerName: 'Alice',
          buyInAmount: 1000,
        });

        expect(result.success).toBe(true);
        expect(result.seat).toBeDefined();
        expect(service.getPlayerCount()).toBe(1);
      });

      it('assigns preferred seat when available', () => {
        const result = service.joinTable({
          playerId: 'p1',
          playerName: 'Alice',
          buyInAmount: 1000,
          preferredSeat: 5,
        });

        expect(result.success).toBe(true);
        expect(result.seat).toBe(5);
      });

      it('rejects duplicate player', () => {
        service.joinTable({
          playerId: 'p1',
          playerName: 'Alice',
          buyInAmount: 1000,
        });

        const result = service.joinTable({
          playerId: 'p1',
          playerName: 'Alice Again',
          buyInAmount: 1000,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('already at the table');
      });

      it('rejects invalid buy-in amount (too low)', () => {
        const result = service.joinTable({
          playerId: 'p1',
          playerName: 'Alice',
          buyInAmount: 50, // Less than 10 BB (100)
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('at least');
      });

      it('rejects invalid buy-in amount (too high)', () => {
        const result = service.joinTable({
          playerId: 'p1',
          playerName: 'Alice',
          buyInAmount: 5000, // More than 200 BB (2000)
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('cannot exceed');
      });

      it('rejects taken preferred seat', () => {
        service.joinTable({
          playerId: 'p1',
          playerName: 'Alice',
          buyInAmount: 1000,
          preferredSeat: 3,
        });

        const result = service.joinTable({
          playerId: 'p2',
          playerName: 'Bob',
          buyInAmount: 1000,
          preferredSeat: 3,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('already taken');
      });

      it('rejects empty player name', () => {
        const result = service.joinTable({
          playerId: 'p1',
          playerName: '',
          buyInAmount: 1000,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('name is required');
      });

      it('rejects player name too long', () => {
        const result = service.joinTable({
          playerId: 'p1',
          playerName: 'A'.repeat(25),
          buyInAmount: 1000,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('20 characters');
      });

      it('fills table to max players', () => {
        for (let i = 0; i < 9; i++) {
          service.joinTable({
            playerId: `p${i}`,
            playerName: `Player ${i}`,
            buyInAmount: 1000,
          });
        }

        const result = service.joinTable({
          playerId: 'p10',
          playerName: 'Extra Player',
          buyInAmount: 1000,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('full');
      });
    });

    describe('leaveTable', () => {
      beforeEach(() => {
        service.joinTable({ playerId: 'p1', playerName: 'Alice', buyInAmount: 1000 });
        service.joinTable({ playerId: 'p2', playerName: 'Bob', buyInAmount: 1000 });
      });

      it('removes player from table', () => {
        const result = service.leaveTable({ playerId: 'p1', cashOut: false });

        expect(result.success).toBe(true);
        expect(service.getPlayerCount()).toBe(1);
        expect(service.getPlayer('p1')).toBeUndefined();
      });

      it('returns cash out amount when requested', () => {
        const result = service.leaveTable({ playerId: 'p1', cashOut: true });

        expect(result.success).toBe(true);
        expect(result.cashOutAmount).toBe(1000);
      });

      it('rejects leaving during active hand', () => {
        service.startHand();

        const result = service.leaveTable({ playerId: 'p1', cashOut: false });

        expect(result.success).toBe(false);
        expect(result.error).toContain('active hand');
      });

      it('rejects non-existent player', () => {
        const result = service.leaveTable({ playerId: 'unknown', cashOut: false });

        expect(result.success).toBe(false);
        expect(result.error).toContain('not found');
      });
    });

    describe('rebuy', () => {
      beforeEach(() => {
        service.joinTable({ playerId: 'p1', playerName: 'Alice', buyInAmount: 500 });
        service.joinTable({ playerId: 'p2', playerName: 'Bob', buyInAmount: 1000 });
      });

      it('adds chips to player stack', () => {
        const result = service.rebuy({ playerId: 'p1', amount: 500 });

        expect(result.success).toBe(true);
        expect(result.newStack).toBe(1000);
        expect(service.getPlayer('p1')?.stack).toBe(1000);
      });

      it('rejects rebuy during active hand', () => {
        service.startHand();

        const result = service.rebuy({ playerId: 'p1', amount: 500 });

        expect(result.success).toBe(false);
        expect(result.error).toContain('active hand');
      });

      it('rejects rebuy exceeding max stack', () => {
        // Player has 500, max is 2000 (200 BB)
        const result = service.rebuy({ playerId: 'p1', amount: 2000 });

        expect(result.success).toBe(false);
        expect(result.error).toContain('cannot exceed');
      });

      it('rejects rebuy below minimum', () => {
        const result = service.rebuy({ playerId: 'p1', amount: 50 });

        expect(result.success).toBe(false);
        expect(result.error).toContain('at least');
      });

      it('rejects rebuy for non-existent player', () => {
        const result = service.rebuy({ playerId: 'unknown', amount: 500 });

        expect(result.success).toBe(false);
        expect(result.error).toContain('not found');
      });
    });

    describe('getPlayer / getPlayers', () => {
      it('returns player info', () => {
        service.joinTable({ playerId: 'p1', playerName: 'Alice', buyInAmount: 1000 });

        const player = service.getPlayer('p1');
        expect(player).toBeDefined();
        expect(player?.name).toBe('Alice');
        expect(player?.stack).toBe(1000);
      });

      it('returns undefined for non-existent player', () => {
        const player = service.getPlayer('unknown');
        expect(player).toBeUndefined();
      });

      it('returns all players', () => {
        service.joinTable({ playerId: 'p1', playerName: 'Alice', buyInAmount: 1000 });
        service.joinTable({ playerId: 'p2', playerName: 'Bob', buyInAmount: 1000 });

        const players = service.getPlayers();
        expect(players.length).toBe(2);
      });
    });
  });

  // ==========================================================================
  // Hand Management
  // ==========================================================================

  describe('Hand Management', () => {
    beforeEach(() => {
      service.joinTable({ playerId: 'p1', playerName: 'Alice', buyInAmount: 1000 });
      service.joinTable({ playerId: 'p2', playerName: 'Bob', buyInAmount: 1000 });
    });

    describe('startHand', () => {
      it('starts a new hand', () => {
        const result = service.startHand();

        expect(result.success).toBe(true);
        expect(result.handId).toBeDefined();
        expect(service.isHandInProgress()).toBe(true);
      });

      it('increments hand count', () => {
        service.startHand();
        expect(service.getStatus().handCount).toBe(1);
      });

      it('rejects starting hand with insufficient players', () => {
        const singlePlayerService = createGameService(defaultConfig);
        singlePlayerService.joinTable({ playerId: 'p1', playerName: 'Alice', buyInAmount: 1000 });

        const result = singlePlayerService.startHand();

        expect(result.success).toBe(false);
        expect(result.error).toContain('at least');
      });

      it('sets up blinds correctly', () => {
        service.startHand();
        const state = service.getGameState();

        expect(state.pot).toBe(15); // SB + BB
      });
    });

    describe('processAction', () => {
      beforeEach(() => {
        service.startHand();
      });

      it('processes valid fold action', () => {
        const currentPlayer = service.getCurrentPlayer();
        const result = service.processAction({
          playerId: currentPlayer!,
          action: 'fold',
        });

        expect(result.success).toBe(true);
      });

      it('processes valid call action', () => {
        const currentPlayer = service.getCurrentPlayer();
        const validActions = service.getValidActions(currentPlayer!);

        if (validActions?.canCall) {
          const result = service.processAction({
            playerId: currentPlayer!,
            action: 'call',
          });

          expect(result.success).toBe(true);
        }
      });

      it('processes valid bet action', () => {
        const currentPlayer = service.getCurrentPlayer();
        const validActions = service.getValidActions(currentPlayer!);

        if (validActions?.canBet) {
          const result = service.processAction({
            playerId: currentPlayer!,
            action: 'bet',
            amount: validActions.minBet,
          });

          expect(result.success).toBe(true);
        }
      });

      it('processes valid raise action', () => {
        const currentPlayer = service.getCurrentPlayer();
        const validActions = service.getValidActions(currentPlayer!);

        if (validActions?.canRaise) {
          const result = service.processAction({
            playerId: currentPlayer!,
            action: 'raise',
            amount: validActions.minRaise,
          });

          expect(result.success).toBe(true);
        }
      });

      it('rejects action from wrong player', () => {
        const currentPlayer = service.getCurrentPlayer();
        const otherPlayer = currentPlayer === 'p1' ? 'p2' : 'p1';

        const result = service.processAction({
          playerId: otherPlayer,
          action: 'fold',
        });

        expect(result.success).toBe(false);
        expect(result.error?.code).toBe('NOT_YOUR_TURN');
      });

      it('rejects invalid action when no hand in progress', () => {
        const noHandService = createGameService(defaultConfig);
        noHandService.joinTable({ playerId: 'p1', playerName: 'Alice', buyInAmount: 1000 });

        const result = noHandService.processAction({
          playerId: 'p1',
          action: 'fold',
        });

        expect(result.success).toBe(false);
        expect(result.error?.code).toBe('HAND_NOT_IN_PROGRESS');
      });

      it('rejects check when call is required', () => {
        const currentPlayer = service.getCurrentPlayer();
        const validActions = service.getValidActions(currentPlayer!);

        if (!validActions?.canCheck) {
          const result = service.processAction({
            playerId: currentPlayer!,
            action: 'check',
          });

          expect(result.success).toBe(false);
          expect(result.error?.code).toBe('INVALID_ACTION');
        }
      });

      it('rejects bet below minimum', () => {
        const currentPlayer = service.getCurrentPlayer();
        const validActions = service.getValidActions(currentPlayer!);

        if (validActions?.canBet) {
          const result = service.processAction({
            playerId: currentPlayer!,
            action: 'bet',
            amount: validActions.minBet - 1,
          });

          expect(result.success).toBe(false);
          expect(result.error?.code).toBe('INVALID_AMOUNT');
        }
      });

      it('rejects raise below minimum', () => {
        const currentPlayer = service.getCurrentPlayer();
        const validActions = service.getValidActions(currentPlayer!);

        if (validActions?.canRaise) {
          const result = service.processAction({
            playerId: currentPlayer!,
            action: 'raise',
            amount: validActions.minRaise - 1,
          });

          expect(result.success).toBe(false);
          expect(result.error?.code).toBe('INVALID_AMOUNT');
        }
      });

      it('updates last action after successful action', () => {
        const currentPlayer = service.getCurrentPlayer();
        service.processAction({
          playerId: currentPlayer!,
          action: 'fold',
        });

        const state = service.getGameState();
        expect(state.lastAction).not.toBeNull();
        expect(state.lastAction?.playerId).toBe(currentPlayer);
        expect(state.lastAction?.action).toBe('fold');
      });

      it('returns new state after action', () => {
        const currentPlayer = service.getCurrentPlayer();
        const result = service.processAction({
          playerId: currentPlayer!,
          action: 'fold',
        });

        expect(result.success).toBe(true);
        expect(result.newState).toBeDefined();
      });
    });

    describe('getValidActions', () => {
      beforeEach(() => {
        service.startHand();
      });

      it('returns valid actions for current player', () => {
        const currentPlayer = service.getCurrentPlayer();
        const actions = service.getValidActions(currentPlayer!);

        expect(actions).not.toBeNull();
        expect(typeof actions?.canFold).toBe('boolean');
        expect(typeof actions?.canCheck).toBe('boolean');
        expect(typeof actions?.canCall).toBe('boolean');
        expect(typeof actions?.canBet).toBe('boolean');
        expect(typeof actions?.canRaise).toBe('boolean');
      });

      it('returns null for non-current player', () => {
        const currentPlayer = service.getCurrentPlayer();
        const otherPlayer = currentPlayer === 'p1' ? 'p2' : 'p1';

        const actions = service.getValidActions(otherPlayer);
        expect(actions).toBeNull();
      });

      it('returns null when no hand in progress', () => {
        const noHandService = createGameService(defaultConfig);
        noHandService.joinTable({ playerId: 'p1', playerName: 'Alice', buyInAmount: 1000 });

        const actions = noHandService.getValidActions('p1');
        expect(actions).toBeNull();
      });
    });

    describe('hand completion', () => {
      it('completes hand when all fold', () => {
        service.startHand();
        const currentPlayer = service.getCurrentPlayer();

        service.processAction({
          playerId: currentPlayer!,
          action: 'fold',
        });

        expect(service.isHandComplete()).toBe(true);
      });

      it('returns hand result after completion', () => {
        service.startHand();
        const currentPlayer = service.getCurrentPlayer();

        service.processAction({
          playerId: currentPlayer!,
          action: 'fold',
        });

        const result = service.getHandResult();
        expect(result).not.toBeNull();
        expect(result?.winners.length).toBeGreaterThan(0);
      });
    });
  });

  // ==========================================================================
  // State Queries
  // ==========================================================================

  describe('State Queries', () => {
    beforeEach(() => {
      service.joinTable({ playerId: 'p1', playerName: 'Alice', buyInAmount: 1000 });
      service.joinTable({ playerId: 'p2', playerName: 'Bob', buyInAmount: 1000 });
    });

    describe('getGameState', () => {
      it('returns idle state with no players', () => {
        const emptyService = createGameService(defaultConfig);
        const state = emptyService.getGameState();

        expect(state.phase).toBe('IDLE');
        expect(state.isHandInProgress).toBe(false);
      });

      it('returns waiting state with players but no hand', () => {
        const state = service.getGameState();

        expect(state.phase).toBe('WAITING_FOR_PLAYERS');
        expect(state.isHandInProgress).toBe(false);
        expect(state.players.length).toBe(2);
      });

      it('returns betting state during active hand', () => {
        service.startHand();
        const state = service.getGameState();

        expect(state.phase).toBe('BETTING');
        expect(state.isHandInProgress).toBe(true);
        expect(state.handId).toBeDefined();
      });

      it('includes dealer and blind seats', () => {
        service.startHand();
        const state = service.getGameState();

        expect(state.dealerSeat).toBeGreaterThanOrEqual(0);
        expect(state.smallBlindSeat).toBeGreaterThanOrEqual(0);
        expect(state.bigBlindSeat).toBeGreaterThanOrEqual(0);
      });

      it('includes current player seat', () => {
        service.startHand();
        const state = service.getGameState();

        expect(state.currentPlayerSeat).not.toBeNull();
      });

      it('includes player states with hole cards during hand', () => {
        service.startHand();
        const state = service.getGameState();

        const activePlayer = state.players.find(p => p.status === 'active');
        expect(activePlayer?.holeCards.length).toBe(2);
      });
    });

    describe('getCurrentHandId', () => {
      it('returns null when no hand in progress', () => {
        expect(service.getCurrentHandId()).toBeNull();
      });

      it('returns hand ID during active hand', () => {
        service.startHand();
        expect(service.getCurrentHandId()).not.toBeNull();
      });
    });

    describe('getPot', () => {
      it('returns 0 when no hand in progress', () => {
        expect(service.getPot()).toBe(0);
      });

      it('returns pot amount during hand', () => {
        service.startHand();
        expect(service.getPot()).toBe(15); // SB + BB
      });
    });

    describe('getCommunityCards', () => {
      it('returns empty array before flop', () => {
        service.startHand();
        expect(service.getCommunityCards().length).toBe(0);
      });
    });

    describe('getCurrentPlayer', () => {
      it('returns null when no hand in progress', () => {
        expect(service.getCurrentPlayer()).toBeNull();
      });

      it('returns player ID during hand', () => {
        service.startHand();
        const player = service.getCurrentPlayer();
        expect(player).not.toBeNull();
        expect(['p1', 'p2']).toContain(player);
      });
    });

    describe('isHandInProgress', () => {
      it('returns false when no hand', () => {
        expect(service.isHandInProgress()).toBe(false);
      });

      it('returns true during active hand', () => {
        service.startHand();
        expect(service.isHandInProgress()).toBe(true);
      });

      it('returns false after hand completes', () => {
        service.startHand();
        const currentPlayer = service.getCurrentPlayer();
        service.processAction({ playerId: currentPlayer!, action: 'fold' });

        expect(service.isHandInProgress()).toBe(false);
      });
    });
  });

  // ==========================================================================
  // Event Subscriptions
  // ==========================================================================

  describe('Event Subscriptions', () => {
    beforeEach(() => {
      service.joinTable({ playerId: 'p1', playerName: 'Alice', buyInAmount: 1000 });
      service.joinTable({ playerId: 'p2', playerName: 'Bob', buyInAmount: 1000 });
    });

    describe('onEvent', () => {
      it('receives game events', () => {
        const events: GameEvent[] = [];
        service.onEvent((event) => events.push(event));

        service.startHand();

        expect(events.length).toBeGreaterThan(0);
        expect(events.some(e => e.type === 'HAND_STARTED')).toBe(true);
      });

      it('can unsubscribe from events', () => {
        const events: GameEvent[] = [];
        const subscription = service.onEvent((event) => events.push(event));

        service.startHand();
        const countBefore = events.length;

        subscription.unsubscribe();

        // Process an action
        const currentPlayer = service.getCurrentPlayer();
        service.processAction({ playerId: currentPlayer!, action: 'fold' });

        // Should not receive new events
        expect(events.length).toBe(countBefore);
      });
    });

    describe('onStateChange', () => {
      it('receives state change notifications', () => {
        const states: GameState[] = [];
        service.onStateChange((state) => states.push(state));

        service.startHand();

        expect(states.length).toBeGreaterThan(0);
      });

      it('can unsubscribe from state changes', () => {
        const states: GameState[] = [];
        const subscription = service.onStateChange((state) => states.push(state));

        service.startHand();
        const countBefore = states.length;

        subscription.unsubscribe();

        const currentPlayer = service.getCurrentPlayer();
        service.processAction({ playerId: currentPlayer!, action: 'fold' });

        expect(states.length).toBe(countBefore);
      });
    });

    describe('onHandResult', () => {
      it('receives hand result when hand completes', () => {
        const results: HandResult[] = [];
        service.onHandResult((result) => results.push(result));

        service.startHand();
        const currentPlayer = service.getCurrentPlayer();
        service.processAction({ playerId: currentPlayer!, action: 'fold' });

        expect(results.length).toBe(1);
        expect(results[0].winners.length).toBeGreaterThan(0);
      });

      it('can unsubscribe from hand results', () => {
        const results: HandResult[] = [];
        const subscription = service.onHandResult((result) => results.push(result));

        subscription.unsubscribe();

        service.startHand();
        const currentPlayer = service.getCurrentPlayer();
        service.processAction({ playerId: currentPlayer!, action: 'fold' });

        expect(results.length).toBe(0);
      });
    });
  });

  // ==========================================================================
  // Service Status
  // ==========================================================================

  describe('Service Status', () => {
    it('tracks player count', () => {
      expect(service.getStatus().playerCount).toBe(0);

      service.joinTable({ playerId: 'p1', playerName: 'Alice', buyInAmount: 1000 });
      expect(service.getStatus().playerCount).toBe(1);

      service.joinTable({ playerId: 'p2', playerName: 'Bob', buyInAmount: 1000 });
      expect(service.getStatus().playerCount).toBe(2);
    });

    it('tracks hand count', () => {
      service.joinTable({ playerId: 'p1', playerName: 'Alice', buyInAmount: 1000 });
      service.joinTable({ playerId: 'p2', playerName: 'Bob', buyInAmount: 1000 });

      expect(service.getStatus().handCount).toBe(0);

      service.startHand();
      expect(service.getStatus().handCount).toBe(1);

      // Complete hand
      const currentPlayer = service.getCurrentPlayer();
      service.processAction({ playerId: currentPlayer!, action: 'fold' });

      // Start another hand
      service.startHand();
      expect(service.getStatus().handCount).toBe(2);
    });

    it('tracks current hand ID', () => {
      service.joinTable({ playerId: 'p1', playerName: 'Alice', buyInAmount: 1000 });
      service.joinTable({ playerId: 'p2', playerName: 'Bob', buyInAmount: 1000 });

      expect(service.getStatus().currentHandId).toBeNull();

      service.startHand();
      expect(service.getStatus().currentHandId).not.toBeNull();
    });

    it('tracks uptime', async () => {
      const initialUptime = service.getStatus().uptime;

      // Wait a small amount
      await new Promise(resolve => setTimeout(resolve, 10));

      const laterUptime = service.getStatus().uptime;
      expect(laterUptime).toBeGreaterThan(initialUptime);
    });
  });

  // ==========================================================================
  // Integration Tests
  // ==========================================================================

  describe('Integration Tests', () => {
    beforeEach(() => {
      service.joinTable({ playerId: 'p1', playerName: 'Alice', buyInAmount: 1000 });
      service.joinTable({ playerId: 'p2', playerName: 'Bob', buyInAmount: 1000 });
    });

    it('plays complete hand with fold', () => {
      // Start hand
      const startResult = service.startHand();
      expect(startResult.success).toBe(true);

      // First player folds
      const currentPlayer = service.getCurrentPlayer();
      const actionResult = service.processAction({
        playerId: currentPlayer!,
        action: 'fold',
      });
      expect(actionResult.success).toBe(true);

      // Hand should be complete
      expect(service.isHandComplete()).toBe(true);

      // Check result
      const result = service.getHandResult();
      expect(result).not.toBeNull();
      expect(result?.winners.length).toBe(1);
    });

    it('plays preflop betting round with calls', () => {
      service.startHand();

      // Get initial pot (SB + BB = 15)
      expect(service.getPot()).toBe(15);

      // First player (UTG) calls
      let currentPlayer = service.getCurrentPlayer();
      let validActions = service.getValidActions(currentPlayer!);

      if (validActions?.canCall) {
        const result = service.processAction({
          playerId: currentPlayer!,
          action: 'call',
        });
        expect(result.success).toBe(true);
      }

      // Second player checks or calls
      currentPlayer = service.getCurrentPlayer();
      if (currentPlayer) {
        validActions = service.getValidActions(currentPlayer);

        if (validActions?.canCheck) {
          const result = service.processAction({
            playerId: currentPlayer,
            action: 'check',
          });
          expect(result.success).toBe(true);
        }
      }
    });

    it('tracks stack changes correctly', () => {
      service.startHand();

      // Players start with 1000, minus blinds
      const state = service.getGameState();
      const totalStacks = state.players.reduce((sum, p) => sum + p.stack, 0);

      // Total chips should be preserved (2000 total - blinds already in pot)
      expect(totalStacks + state.pot).toBe(2000);
    });

    it('allows multiple hands in sequence', () => {
      // First hand
      service.startHand();
      let currentPlayer = service.getCurrentPlayer();
      service.processAction({ playerId: currentPlayer!, action: 'fold' });
      expect(service.isHandComplete()).toBe(true);

      // Second hand
      const result = service.startHand();
      expect(result.success).toBe(true);
      expect(service.isHandInProgress()).toBe(true);
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe('Edge Cases', () => {
    it('handles action on completed hand', () => {
      service.joinTable({ playerId: 'p1', playerName: 'Alice', buyInAmount: 1000 });
      service.joinTable({ playerId: 'p2', playerName: 'Bob', buyInAmount: 1000 });

      service.startHand();
      const currentPlayer = service.getCurrentPlayer();
      service.processAction({ playerId: currentPlayer!, action: 'fold' });

      // Try to act on completed hand
      const result = service.processAction({ playerId: 'p1', action: 'fold' });
      expect(result.success).toBe(false);
    });

    it('handles player not in hand', () => {
      service.joinTable({ playerId: 'p1', playerName: 'Alice', buyInAmount: 1000 });
      service.joinTable({ playerId: 'p2', playerName: 'Bob', buyInAmount: 1000 });
      service.startHand();

      const result = service.processAction({ playerId: 'unknown', action: 'fold' });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('PLAYER_NOT_FOUND');
    });

    it('handles all-in action', () => {
      service.joinTable({ playerId: 'p1', playerName: 'Alice', buyInAmount: 1000 });
      service.joinTable({ playerId: 'p2', playerName: 'Bob', buyInAmount: 1000 });
      service.startHand();

      const currentPlayer = service.getCurrentPlayer();
      const result = service.processAction({
        playerId: currentPlayer!,
        action: 'all-in',
      });

      expect(result.success).toBe(true);
    });

    it('handles bet without amount', () => {
      service.joinTable({ playerId: 'p1', playerName: 'Alice', buyInAmount: 1000 });
      service.joinTable({ playerId: 'p2', playerName: 'Bob', buyInAmount: 1000 });
      service.startHand();

      const currentPlayer = service.getCurrentPlayer();
      const validActions = service.getValidActions(currentPlayer!);

      if (validActions?.canBet) {
        const result = service.processAction({
          playerId: currentPlayer!,
          action: 'bet',
          // No amount provided
        });

        expect(result.success).toBe(false);
        expect(result.error?.code).toBe('INVALID_AMOUNT');
      }
    });

    it('handles raise without amount', () => {
      service.joinTable({ playerId: 'p1', playerName: 'Alice', buyInAmount: 1000 });
      service.joinTable({ playerId: 'p2', playerName: 'Bob', buyInAmount: 1000 });
      service.startHand();

      const currentPlayer = service.getCurrentPlayer();
      const validActions = service.getValidActions(currentPlayer!);

      if (validActions?.canRaise) {
        const result = service.processAction({
          playerId: currentPlayer!,
          action: 'raise',
          // No amount provided
        });

        expect(result.success).toBe(false);
        expect(result.error?.code).toBe('INVALID_AMOUNT');
      }
    });
  });
});

// ==========================================================================
// Command Validator Tests
// ==========================================================================

describe('CommandValidator', () => {
  // These are tested through GameService but we can add specific unit tests
  // for edge cases in the validator if needed
});
