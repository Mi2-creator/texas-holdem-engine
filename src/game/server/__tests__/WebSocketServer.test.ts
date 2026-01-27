/**
 * WebSocketServer.test.ts
 * Phase 18 - Comprehensive tests for WebSocket server layer
 */

import {
  WebSocketGameServer,
  createWebSocketServer,
  WebSocketLike,
} from '../WebSocketServer';
import {
  TableServer,
  createTableServer,
} from '../TableServer';
import {
  ClientMessage,
  ServerMessage,
  createMessageHeader,
  resetSequence,
  deserializeMessage,
} from '../ServerTypes';

// ============================================================================
// Mock WebSocket
// ============================================================================

class MockWebSocket implements WebSocketLike {
  sent: string[] = [];
  closed: boolean = false;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((error: unknown) => void) | null = null;

  send(data: string): void {
    if (this.closed) throw new Error('WebSocket is closed');
    this.sent.push(data);
  }

  close(): void {
    this.closed = true;
    if (this.onclose) this.onclose();
  }

  // Simulate receiving a message
  receiveMessage(data: string): void {
    if (this.onmessage) {
      this.onmessage({ data });
    }
  }

  // Get last sent message as parsed object
  getLastSent(): ServerMessage | null {
    if (this.sent.length === 0) return null;
    return JSON.parse(this.sent[this.sent.length - 1]);
  }

  // Get all sent messages
  getAllSent(): ServerMessage[] {
    return this.sent.map(s => JSON.parse(s));
  }

  // Clear sent messages
  clearSent(): void {
    this.sent = [];
  }
}

// Helper to create a client message
function createClientMessage(type: string, data: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type,
    header: createMessageHeader(),
    ...data,
  });
}

// ============================================================================
// TableServer Tests
// ============================================================================

describe('TableServer', () => {
  let table: TableServer;
  let sentMessages: Array<{ connectionId: string; message: ServerMessage }>;

  beforeEach(() => {
    resetSequence();
    sentMessages = [];
    table = createTableServer({
      tableId: 'test-table',
      smallBlind: 5,
      bigBlind: 10,
      autoStartHands: false, // Disable auto-start for testing
    });

    table.setMessageSender((connectionId, message) => {
      sentMessages.push({ connectionId, message });
    });
  });

  afterEach(() => {
    table.destroy();
  });

  describe('Player Management', () => {
    it('adds player to table', () => {
      const result = table.addPlayer('p1', 'Alice', 'conn1', 1000);

      expect(result.success).toBe(true);
      expect(result.seat).toBeDefined();
      expect(result.state).toBeDefined();
      expect(table.getPlayerCount()).toBe(1);
    });

    it('assigns seats correctly', () => {
      table.addPlayer('p1', 'Alice', 'conn1', 1000, 0);
      table.addPlayer('p2', 'Bob', 'conn2', 1000, 3);

      expect(table.getPlayer('p1')?.seat).toBe(0);
      expect(table.getPlayer('p2')?.seat).toBe(3);
    });

    it('rejects duplicate player', () => {
      table.addPlayer('p1', 'Alice', 'conn1', 1000);
      const result = table.addPlayer('p1', 'Alice', 'conn2', 1000);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Already');
    });

    it('removes player from table', () => {
      table.addPlayer('p1', 'Alice', 'conn1', 1000);
      const result = table.removePlayer('p1', false);

      expect(result.success).toBe(true);
      expect(table.getPlayerCount()).toBe(0);
    });

    it('returns cash out amount when requested', () => {
      table.addPlayer('p1', 'Alice', 'conn1', 1000);
      const result = table.removePlayer('p1', true);

      expect(result.success).toBe(true);
      expect(result.cashOutAmount).toBe(1000);
    });

    it('handles disconnection', () => {
      table.addPlayer('p1', 'Alice', 'conn1', 1000);
      table.handleDisconnection('conn1');

      expect(table.getPlayerCount()).toBe(0);
    });

    it('processes rebuy', () => {
      table.addPlayer('p1', 'Alice', 'conn1', 500);
      const result = table.processRebuy('p1', 500);

      expect(result.success).toBe(true);
      expect(result.newStack).toBe(1000);
    });
  });

  describe('Action Processing', () => {
    beforeEach(() => {
      table.addPlayer('p1', 'Alice', 'conn1', 1000);
      table.addPlayer('p2', 'Bob', 'conn2', 1000);
      table.startHand();
    });

    it('processes valid action', () => {
      const currentPlayer = table.getGameState().players.find(
        p => p.seat === table.getGameState().currentPlayerSeat
      );
      const result = table.processAction(currentPlayer!.id, 'fold');

      expect(result.success).toBe(true);
    });

    it('rejects action from wrong player', () => {
      const currentPlayer = table.getGameState().players.find(
        p => p.seat === table.getGameState().currentPlayerSeat
      );
      const otherPlayer = currentPlayer?.id === 'p1' ? 'p2' : 'p1';

      const result = table.processAction(otherPlayer, 'fold');

      expect(result.success).toBe(false);
      expect(result.errorCode).toBeDefined();
    });

    it('rejects action from non-table player', () => {
      const result = table.processAction('unknown', 'fold');

      expect(result.success).toBe(false);
    });
  });

  describe('State Queries', () => {
    it('returns game state', () => {
      table.addPlayer('p1', 'Alice', 'conn1', 1000);
      const state = table.getGameState();

      expect(state.tableId).toBe('test-table');
      expect(state.players.length).toBe(1);
    });

    it('returns valid actions for current player', () => {
      table.addPlayer('p1', 'Alice', 'conn1', 1000);
      table.addPlayer('p2', 'Bob', 'conn2', 1000);
      table.startHand();

      const state = table.getGameState();
      const currentPlayer = state.players.find(p => p.seat === state.currentPlayerSeat);
      const actions = table.getValidActions(currentPlayer!.id);

      expect(actions).not.toBeNull();
    });

    it('returns null for non-current player', () => {
      table.addPlayer('p1', 'Alice', 'conn1', 1000);
      table.addPlayer('p2', 'Bob', 'conn2', 1000);
      table.startHand();

      const state = table.getGameState();
      const currentPlayer = state.players.find(p => p.seat === state.currentPlayerSeat);
      const otherPlayer = currentPlayer?.id === 'p1' ? 'p2' : 'p1';
      const actions = table.getValidActions(otherPlayer);

      expect(actions).toBeNull();
    });

    it('returns connected player IDs', () => {
      table.addPlayer('p1', 'Alice', 'conn1', 1000);
      table.addPlayer('p2', 'Bob', 'conn2', 1000);

      const ids = table.getConnectedPlayerIds();
      expect(ids).toContain('p1');
      expect(ids).toContain('p2');
    });

    it('returns connection ID for player', () => {
      table.addPlayer('p1', 'Alice', 'conn1', 1000);

      expect(table.getConnectionId('p1')).toBe('conn1');
      expect(table.getConnectionId('unknown')).toBeNull();
    });
  });

  describe('Hand Management', () => {
    it('starts hand manually', () => {
      table.addPlayer('p1', 'Alice', 'conn1', 1000);
      table.addPlayer('p2', 'Bob', 'conn2', 1000);

      const result = table.startHand();

      expect(result.success).toBe(true);
      expect(result.handId).toBeDefined();
      expect(table.isHandInProgress()).toBe(true);
    });

    it('rejects starting hand with insufficient players', () => {
      table.addPlayer('p1', 'Alice', 'conn1', 1000);

      const result = table.startHand();

      expect(result.success).toBe(false);
    });
  });

  describe('Event Broadcasting', () => {
    it('broadcasts player joined event', () => {
      table.addPlayer('p1', 'Alice', 'conn1', 1000);
      sentMessages = []; // Clear initial messages

      table.addPlayer('p2', 'Bob', 'conn2', 1000);

      // Should have sent player-joined to conn1
      const playerJoinedMsg = sentMessages.find(
        m => m.message.type === 'player-joined' && m.connectionId === 'conn1'
      );
      expect(playerJoinedMsg).toBeDefined();
    });

    it('broadcasts player left event', () => {
      table.addPlayer('p1', 'Alice', 'conn1', 1000);
      table.addPlayer('p2', 'Bob', 'conn2', 1000);
      sentMessages = [];

      table.removePlayer('p2', false);

      const playerLeftMsg = sentMessages.find(
        m => m.message.type === 'player-left' && m.connectionId === 'conn1'
      );
      expect(playerLeftMsg).toBeDefined();
    });
  });

  describe('Lifecycle', () => {
    it('can be destroyed', () => {
      table.addPlayer('p1', 'Alice', 'conn1', 1000);
      table.destroy();

      expect(table.isTableDestroyed()).toBe(true);
    });

    it('rejects operations after destruction', () => {
      table.destroy();

      const result = table.addPlayer('p1', 'Alice', 'conn1', 1000);
      expect(result.success).toBe(false);
    });
  });
});

// ============================================================================
// WebSocketGameServer Tests
// ============================================================================

describe('WebSocketGameServer', () => {
  let server: WebSocketGameServer;

  beforeEach(() => {
    resetSequence();
    server = createWebSocketServer();
  });

  afterEach(() => {
    server.shutdown();
  });

  describe('Connection Management', () => {
    it('accepts new connections', () => {
      const ws = new MockWebSocket();
      const connectionId = server.handleConnection(ws);

      expect(connectionId).toBeDefined();
      expect(server.getStats().totalConnections).toBe(1);
    });

    it('handles disconnection', () => {
      const ws = new MockWebSocket();
      const connectionId = server.handleConnection(ws);

      server.handleDisconnection(connectionId);

      expect(server.getStats().totalConnections).toBe(0);
    });

    it('cleans up on WebSocket close', () => {
      const ws = new MockWebSocket();
      server.handleConnection(ws);

      ws.close();

      expect(server.getStats().totalConnections).toBe(0);
    });

    it('enforces max connections', () => {
      const limitedServer = createWebSocketServer({ maxConnections: 2 });

      limitedServer.handleConnection(new MockWebSocket());
      limitedServer.handleConnection(new MockWebSocket());

      expect(() => {
        limitedServer.handleConnection(new MockWebSocket());
      }).toThrow();

      limitedServer.shutdown();
    });
  });

  describe('Authentication', () => {
    it('authenticates connection', () => {
      const ws = new MockWebSocket();
      server.handleConnection(ws);

      ws.receiveMessage(createClientMessage('authenticate', {
        playerId: 'p1',
        playerName: 'Alice',
      }));

      const response = ws.getLastSent();
      expect(response?.type).toBe('authenticated');
      expect((response as any).sessionToken).toBeDefined();
    });

    it('rejects double authentication', () => {
      const ws = new MockWebSocket();
      server.handleConnection(ws);

      ws.receiveMessage(createClientMessage('authenticate', {
        playerId: 'p1',
        playerName: 'Alice',
      }));
      ws.receiveMessage(createClientMessage('authenticate', {
        playerId: 'p1',
        playerName: 'Alice',
      }));

      const response = ws.getLastSent();
      expect(response?.type).toBe('error');
      expect((response as any).code).toBe('ALREADY_AUTHENTICATED');
    });

    it('requires authentication for table operations', () => {
      const ws = new MockWebSocket();
      server.handleConnection(ws);

      ws.receiveMessage(createClientMessage('join-table', {
        tableId: 'table1',
        buyInAmount: 1000,
      }));

      const response = ws.getLastSent();
      expect(response?.type).toBe('error');
      expect((response as any).code).toBe('NOT_AUTHENTICATED');
    });

    it('disconnects previous connection on re-auth', () => {
      const ws1 = new MockWebSocket();
      const ws2 = new MockWebSocket();
      server.handleConnection(ws1);
      server.handleConnection(ws2);

      ws1.receiveMessage(createClientMessage('authenticate', {
        playerId: 'p1',
        playerName: 'Alice',
      }));

      ws2.receiveMessage(createClientMessage('authenticate', {
        playerId: 'p1',
        playerName: 'Alice',
      }));

      expect(ws1.closed).toBe(true);
      expect(ws2.closed).toBe(false);
    });
  });

  describe('Ping/Pong', () => {
    it('responds to ping', () => {
      const ws = new MockWebSocket();
      server.handleConnection(ws);

      const clientTime = Date.now();
      ws.receiveMessage(createClientMessage('ping', { clientTime }));

      const response = ws.getLastSent();
      expect(response?.type).toBe('pong');
      expect((response as any).clientTime).toBe(clientTime);
      expect((response as any).serverTime).toBeDefined();
    });
  });

  describe('Table Operations', () => {
    let ws: MockWebSocket;

    beforeEach(() => {
      ws = new MockWebSocket();
      server.handleConnection(ws);
      ws.receiveMessage(createClientMessage('authenticate', {
        playerId: 'p1',
        playerName: 'Alice',
      }));
      ws.clearSent();
    });

    it('joins table', () => {
      ws.receiveMessage(createClientMessage('join-table', {
        tableId: 'table1',
        buyInAmount: 1000,
      }));

      const response = ws.getLastSent();
      expect(response?.type).toBe('table-joined');
      expect((response as any).seat).toBeDefined();
    });

    it('creates table on first join', () => {
      ws.receiveMessage(createClientMessage('join-table', {
        tableId: 'new-table',
        buyInAmount: 1000,
      }));

      expect(server.getTable('new-table')).toBeDefined();
    });

    it('rejects joining when already at table', () => {
      ws.receiveMessage(createClientMessage('join-table', {
        tableId: 'table1',
        buyInAmount: 1000,
      }));
      ws.receiveMessage(createClientMessage('join-table', {
        tableId: 'table2',
        buyInAmount: 1000,
      }));

      const response = ws.getLastSent();
      expect(response?.type).toBe('error');
      expect((response as any).code).toBe('ALREADY_AT_TABLE');
    });

    it('leaves table', () => {
      ws.receiveMessage(createClientMessage('join-table', {
        tableId: 'table1',
        buyInAmount: 1000,
      }));
      ws.clearSent();

      ws.receiveMessage(createClientMessage('leave-table', {
        tableId: 'table1',
        cashOut: true,
      }));

      const response = ws.getLastSent();
      expect(response?.type).toBe('table-left');
      expect((response as any).cashOutAmount).toBe(1000);
    });

    it('cleans up empty tables', () => {
      ws.receiveMessage(createClientMessage('join-table', {
        tableId: 'table1',
        buyInAmount: 1000,
      }));
      ws.receiveMessage(createClientMessage('leave-table', {
        tableId: 'table1',
        cashOut: false,
      }));

      expect(server.getTable('table1')).toBeUndefined();
    });

    it('returns game state on request', () => {
      ws.receiveMessage(createClientMessage('join-table', {
        tableId: 'table1',
        buyInAmount: 1000,
      }));
      ws.clearSent();

      ws.receiveMessage(createClientMessage('request-state', {
        tableId: 'table1',
      }));

      const response = ws.getLastSent();
      expect(response?.type).toBe('game-state');
      expect((response as any).state).toBeDefined();
    });

    it('returns valid actions on request', () => {
      ws.receiveMessage(createClientMessage('join-table', {
        tableId: 'table1',
        buyInAmount: 1000,
      }));
      ws.clearSent();

      ws.receiveMessage(createClientMessage('request-valid-actions', {
        tableId: 'table1',
      }));

      const response = ws.getLastSent();
      expect(response?.type).toBe('valid-actions');
    });
  });

  describe('Player Actions', () => {
    let ws1: MockWebSocket;
    let ws2: MockWebSocket;

    beforeEach(() => {
      // Set up two players at a table
      ws1 = new MockWebSocket();
      ws2 = new MockWebSocket();

      server.handleConnection(ws1);
      server.handleConnection(ws2);

      ws1.receiveMessage(createClientMessage('authenticate', {
        playerId: 'p1',
        playerName: 'Alice',
      }));
      ws2.receiveMessage(createClientMessage('authenticate', {
        playerId: 'p2',
        playerName: 'Bob',
      }));

      ws1.receiveMessage(createClientMessage('join-table', {
        tableId: 'table1',
        buyInAmount: 1000,
      }));
      ws2.receiveMessage(createClientMessage('join-table', {
        tableId: 'table1',
        buyInAmount: 1000,
      }));

      // Start a hand
      const table = server.getTable('table1');
      table?.startHand();

      ws1.clearSent();
      ws2.clearSent();
    });

    it('processes valid player action', () => {
      const table = server.getTable('table1')!;
      const state = table.getGameState();
      const currentPlayer = state.players.find(p => p.seat === state.currentPlayerSeat);
      const ws = currentPlayer?.id === 'p1' ? ws1 : ws2;

      ws.receiveMessage(createClientMessage('player-action', {
        tableId: 'table1',
        action: 'fold',
      }));

      const response = ws.getLastSent();
      expect(response?.type).toBe('action-result');
      expect((response as any).success).toBe(true);
    });

    it('rejects action from wrong player', () => {
      const table = server.getTable('table1')!;
      const state = table.getGameState();
      const currentPlayer = state.players.find(p => p.seat === state.currentPlayerSeat);
      const ws = currentPlayer?.id === 'p1' ? ws2 : ws1; // Wrong player

      ws.receiveMessage(createClientMessage('player-action', {
        tableId: 'table1',
        action: 'fold',
      }));

      const response = ws.getLastSent();
      expect(response?.type).toBe('action-result');
      expect((response as any).success).toBe(false);
    });

    it('rejects action for wrong table', () => {
      ws1.receiveMessage(createClientMessage('player-action', {
        tableId: 'wrong-table',
        action: 'fold',
      }));

      const response = ws1.getLastSent();
      expect(response?.type).toBe('error');
      expect((response as any).code).toBe('NOT_AT_TABLE');
    });
  });

  describe('Rebuy', () => {
    let ws: MockWebSocket;

    beforeEach(() => {
      ws = new MockWebSocket();
      server.handleConnection(ws);
      ws.receiveMessage(createClientMessage('authenticate', {
        playerId: 'p1',
        playerName: 'Alice',
      }));
      ws.receiveMessage(createClientMessage('join-table', {
        tableId: 'table1',
        buyInAmount: 500,
      }));
      ws.clearSent();
    });

    it('processes rebuy', () => {
      ws.receiveMessage(createClientMessage('rebuy', {
        tableId: 'table1',
        amount: 500,
      }));

      const response = ws.getLastSent();
      expect(response?.type).toBe('rebuy-result');
      expect((response as any).success).toBe(true);
      expect((response as any).newStack).toBe(1000);
    });

    it('rejects rebuy for wrong table', () => {
      ws.receiveMessage(createClientMessage('rebuy', {
        tableId: 'wrong-table',
        amount: 500,
      }));

      const response = ws.getLastSent();
      expect(response?.type).toBe('error');
      expect((response as any).code).toBe('NOT_AT_TABLE');
    });
  });

  describe('Multiple Players', () => {
    it('supports multiple concurrent players at table', () => {
      const players: MockWebSocket[] = [];
      for (let i = 0; i < 6; i++) {
        const ws = new MockWebSocket();
        server.handleConnection(ws);
        ws.receiveMessage(createClientMessage('authenticate', {
          playerId: `p${i}`,
          playerName: `Player ${i}`,
        }));
        ws.receiveMessage(createClientMessage('join-table', {
          tableId: 'table1',
          buyInAmount: 1000,
        }));
        players.push(ws);
      }

      const table = server.getTable('table1');
      expect(table?.getPlayerCount()).toBe(6);
    });

    it('supports multiple tables', () => {
      // Create players at different tables
      for (let t = 0; t < 3; t++) {
        const ws = new MockWebSocket();
        server.handleConnection(ws);
        ws.receiveMessage(createClientMessage('authenticate', {
          playerId: `p${t}`,
          playerName: `Player ${t}`,
        }));
        ws.receiveMessage(createClientMessage('join-table', {
          tableId: `table${t}`,
          buyInAmount: 1000,
        }));
      }

      expect(server.getTableIds().length).toBe(3);
    });

    it('broadcasts events to all players at table', () => {
      const ws1 = new MockWebSocket();
      const ws2 = new MockWebSocket();

      server.handleConnection(ws1);
      server.handleConnection(ws2);

      ws1.receiveMessage(createClientMessage('authenticate', {
        playerId: 'p1',
        playerName: 'Alice',
      }));
      ws2.receiveMessage(createClientMessage('authenticate', {
        playerId: 'p2',
        playerName: 'Bob',
      }));

      ws1.receiveMessage(createClientMessage('join-table', {
        tableId: 'table1',
        buyInAmount: 1000,
      }));
      ws1.clearSent();

      ws2.receiveMessage(createClientMessage('join-table', {
        tableId: 'table1',
        buyInAmount: 1000,
      }));

      // ws1 should have received player-joined for p2
      const messages = ws1.getAllSent();
      const playerJoined = messages.find(m => m.type === 'player-joined');
      expect(playerJoined).toBeDefined();
    });
  });

  describe('Server Stats', () => {
    it('tracks connection stats', () => {
      const ws1 = new MockWebSocket();
      const ws2 = new MockWebSocket();

      server.handleConnection(ws1);
      server.handleConnection(ws2);

      ws1.receiveMessage(createClientMessage('authenticate', {
        playerId: 'p1',
        playerName: 'Alice',
      }));

      const stats = server.getStats();
      expect(stats.totalConnections).toBe(2);
      expect(stats.authenticatedConnections).toBe(1);
    });

    it('tracks table stats', () => {
      const ws = new MockWebSocket();
      server.handleConnection(ws);
      ws.receiveMessage(createClientMessage('authenticate', {
        playerId: 'p1',
        playerName: 'Alice',
      }));
      ws.receiveMessage(createClientMessage('join-table', {
        tableId: 'table1',
        buyInAmount: 1000,
      }));

      const stats = server.getStats();
      expect(stats.totalTables).toBe(1);
      expect(stats.totalPlayersAtTables).toBe(1);
    });

    it('tracks uptime', async () => {
      const initialStats = server.getStats();
      await new Promise(resolve => setTimeout(resolve, 10));
      const laterStats = server.getStats();

      expect(laterStats.uptime).toBeGreaterThan(initialStats.uptime);
    });
  });

  describe('Table Management', () => {
    it('creates table with custom config', () => {
      const table = server.createTable('custom-table', {
        smallBlind: 10,
        bigBlind: 20,
        maxPlayers: 6,
      });

      expect(table.getConfig().smallBlind).toBe(10);
      expect(table.getConfig().bigBlind).toBe(20);
      expect(table.getConfig().maxPlayers).toBe(6);
    });

    it('throws on duplicate table creation', () => {
      server.createTable('table1');

      expect(() => {
        server.createTable('table1');
      }).toThrow();
    });

    it('destroys table', () => {
      server.createTable('table1');
      server.destroyTable('table1');

      expect(server.getTable('table1')).toBeUndefined();
    });
  });

  describe('Shutdown', () => {
    it('closes all connections on shutdown', () => {
      const ws1 = new MockWebSocket();
      const ws2 = new MockWebSocket();
      server.handleConnection(ws1);
      server.handleConnection(ws2);

      server.shutdown();

      expect(ws1.closed).toBe(true);
      expect(ws2.closed).toBe(true);
    });

    it('destroys all tables on shutdown', () => {
      server.createTable('table1');
      server.createTable('table2');

      server.shutdown();

      expect(server.getTableIds().length).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('handles invalid message format', () => {
      const ws = new MockWebSocket();
      server.handleConnection(ws);

      ws.receiveMessage('invalid json');

      const response = ws.getLastSent();
      expect(response?.type).toBe('error');
      expect((response as any).code).toBe('INVALID_MESSAGE');
    });

    it('handles unknown message type', () => {
      const ws = new MockWebSocket();
      server.handleConnection(ws);
      ws.receiveMessage(createClientMessage('authenticate', {
        playerId: 'p1',
        playerName: 'Alice',
      }));
      ws.clearSent();

      ws.receiveMessage(createClientMessage('unknown-type', {}));

      const response = ws.getLastSent();
      expect(response?.type).toBe('error');
      expect((response as any).code).toBe('INVALID_MESSAGE');
    });
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('WebSocket Server Integration', () => {
  let server: WebSocketGameServer;

  beforeEach(() => {
    resetSequence();
    server = createWebSocketServer();
  });

  afterEach(() => {
    server.shutdown();
  });

  it('plays complete hand through WebSocket messages', () => {
    // Create two players
    const ws1 = new MockWebSocket();
    const ws2 = new MockWebSocket();

    server.handleConnection(ws1);
    server.handleConnection(ws2);

    // Authenticate
    ws1.receiveMessage(createClientMessage('authenticate', {
      playerId: 'p1',
      playerName: 'Alice',
    }));
    ws2.receiveMessage(createClientMessage('authenticate', {
      playerId: 'p2',
      playerName: 'Bob',
    }));

    // Join table
    ws1.receiveMessage(createClientMessage('join-table', {
      tableId: 'table1',
      buyInAmount: 1000,
    }));
    ws2.receiveMessage(createClientMessage('join-table', {
      tableId: 'table1',
      buyInAmount: 1000,
    }));

    // Start hand
    const table = server.getTable('table1')!;
    table.startHand();

    ws1.clearSent();
    ws2.clearSent();

    // Get current player and fold
    const state = table.getGameState();
    const currentPlayer = state.players.find(p => p.seat === state.currentPlayerSeat);
    const ws = currentPlayer?.id === 'p1' ? ws1 : ws2;

    ws.receiveMessage(createClientMessage('player-action', {
      tableId: 'table1',
      action: 'fold',
    }));

    // Check hand completed
    expect(table.isHandInProgress()).toBe(false);

    // Both players should have received hand result
    const ws1Messages = ws1.getAllSent();
    const ws2Messages = ws2.getAllSent();

    expect(ws1Messages.some(m => m.type === 'hand-result')).toBe(true);
    expect(ws2Messages.some(m => m.type === 'hand-result')).toBe(true);
  });

  it('handles player leaving mid-hand', () => {
    const ws1 = new MockWebSocket();
    const ws2 = new MockWebSocket();
    const ws3 = new MockWebSocket();

    server.handleConnection(ws1);
    server.handleConnection(ws2);
    server.handleConnection(ws3);

    // Authenticate and join
    [ws1, ws2, ws3].forEach((ws, i) => {
      ws.receiveMessage(createClientMessage('authenticate', {
        playerId: `p${i + 1}`,
        playerName: `Player ${i + 1}`,
      }));
      ws.receiveMessage(createClientMessage('join-table', {
        tableId: 'table1',
        buyInAmount: 1000,
      }));
    });

    const table = server.getTable('table1')!;

    // Verify 3 players joined
    expect(table.getPlayerCount()).toBe(3);

    // Disconnect ws3 (simulating WebSocket close)
    ws3.close();

    // Verify player was removed
    expect(table.getPlayerCount()).toBe(2);
  });
});
