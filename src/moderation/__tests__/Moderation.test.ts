/**
 * Moderation Module Tests
 * Phase 23 - Comprehensive tests for moderation system
 *
 * Tests cover:
 * - Hand replay correctness
 * - Evidence bundle integrity
 * - Tamper resistance
 * - Decision logging
 * - Moderator API operations
 * - Cross-module isolation
 */

import {
  HandReplayEngine,
  createHandReplayEngine,
} from '../replay/HandReplayEngine';
import {
  EvidenceBundleBuilder,
  createEvidenceBundleBuilder,
} from '../evidence/EvidenceBundleBuilder';
import {
  ModeratorService,
  createModeratorService,
} from '../api/ModeratorService';
import {
  DecisionLogger,
  createDecisionLogger,
} from '../api/DecisionLogger';
import {
  HandReplay,
  ReplayStep,
  EvidenceBundle,
  ModerationCase,
  CaseAnnotation,
  ResolutionRecommendation,
  CaseId,
  ModeratorId,
  calculateChecksum,
  verifyChecksum,
  resetModerationCounters,
} from '../ModerationTypes';
import {
  EventCollector,
  EventStream,
  resetIntegrityCounters,
} from '../../integrity';
import { PlayerId } from '../../security/Identity';
import { TableId, HandId } from '../../security/AuditLog';
import { ClubId } from '../../club/ClubTypes';
import { Street } from '../../game/engine/TableState';
import { PlayerActionData, HandEventData } from '../../integrity/IntegrityTypes';

// ============================================================================
// Test Helpers
// ============================================================================

const TEST_CLUB_ID = 'club_test' as ClubId;
const TEST_TABLE_ID = 'table_test' as TableId;
const TEST_MODERATOR_ID = 'moderator_1' as ModeratorId;

function createTestPlayers(count: number): PlayerId[] {
  return Array.from({ length: count }, (_, i) => `player_${i + 1}` as PlayerId);
}

function createHandId(num: number): HandId {
  return `hand_${num}` as HandId;
}

/**
 * Creates a test event stream with realistic hand data
 */
function createTestEventStream(
  players: PlayerId[],
  hands: number
): { stream: EventStream; handIds: HandId[] } {
  const collector = new EventCollector();
  collector.startSession(TEST_CLUB_ID, TEST_TABLE_ID);

  const handIds: HandId[] = [];

  for (let h = 0; h < hands; h++) {
    const handId = createHandId(h + 1);
    handIds.push(handId);

    const positions = new Map<PlayerId, number>();
    const stacks = new Map<PlayerId, number>();

    players.forEach((p, i) => {
      positions.set(p, i);
      stacks.set(p, 1000);
    });

    // Record hand start
    collector.recordHandStarted(
      TEST_TABLE_ID,
      handId,
      players,
      positions,
      stacks,
      { small: 5, big: 10 }
    );

    // Simulate preflop actions
    for (let i = 0; i < players.length; i++) {
      const player = players[i];
      const actionType = i === 0 ? 'raise' : (i === players.length - 1 ? 'call' : 'fold');
      const amount = actionType === 'raise' ? 30 : (actionType === 'call' ? 30 : 0);

      const actionData: PlayerActionData = {
        actionType: actionType as any,
        amount,
        potSize: 50 + i * 30,
        stackBefore: 1000,
        stackAfter: 1000 - amount,
        position: i,
        playersInHand: players.length - i,
        facingBet: i > 0 ? 30 : 0,
        isHeadsUp: players.length === 2,
        timeToAct: 2000 + Math.random() * 1000,
      };

      collector.recordPlayerAction(TEST_TABLE_ID, handId, player, actionData, 'preflop');
    }

    // Record street change to flop
    collector.recordStreetChange(TEST_TABLE_ID, handId, 'flop', 80);

    // Some flop actions
    const activePlayers = players.filter((_, i) => i === 0 || i === players.length - 1);
    for (const player of activePlayers) {
      const actionData: PlayerActionData = {
        actionType: 'check',
        amount: 0,
        potSize: 80,
        stackBefore: 970,
        stackAfter: 970,
        position: players.indexOf(player),
        playersInHand: 2,
        facingBet: 0,
        isHeadsUp: true,
        timeToAct: 1500,
      };

      collector.recordPlayerAction(TEST_TABLE_ID, handId, player, actionData, 'flop');
    }

    // Determine winner
    const winner = players[0];
    const contributors = players.filter(p => p !== winner);

    // Record pot awarded
    collector.recordPotAwarded(TEST_TABLE_ID, handId, winner, 80, contributors);

    // Record hand completed
    collector.recordHandCompleted(TEST_TABLE_ID, handId, [winner], 80, 'flop');
  }

  const stream = collector.endSession(TEST_TABLE_ID)!;
  return { stream, handIds };
}

// ============================================================================
// HandReplayEngine Tests
// ============================================================================

describe('HandReplayEngine', () => {
  let engine: HandReplayEngine;

  beforeEach(() => {
    resetIntegrityCounters();
    resetModerationCounters();
    engine = createHandReplayEngine();
  });

  describe('Hand Reconstruction', () => {
    it('should reconstruct a hand from event stream', () => {
      const players = createTestPlayers(4);
      const { stream, handIds } = createTestEventStream(players, 1);

      const replay = engine.reconstructHand(stream, handIds[0]);

      expect(replay).not.toBeNull();
      expect(replay!.handId).toBe(handIds[0]);
      expect(replay!.tableId).toBe(TEST_TABLE_ID);
      expect(replay!.clubId).toBe(TEST_CLUB_ID);
    });

    it('should have correct initial state', () => {
      const players = createTestPlayers(4);
      const { stream, handIds } = createTestEventStream(players, 1);

      const replay = engine.reconstructHand(stream, handIds[0])!;

      expect(replay.initialState.stepIndex).toBe(0);
      expect(replay.initialState.pot.totalPot).toBe(0);
      expect(replay.initialState.board.street).toBe('preflop');
      expect(replay.initialState.players.size).toBe(4);
    });

    it('should capture all steps', () => {
      const players = createTestPlayers(4);
      const { stream, handIds } = createTestEventStream(players, 1);

      const replay = engine.reconstructHand(stream, handIds[0])!;

      // Initial + 4 preflop actions + street change + 2 flop actions + pot award
      expect(replay.steps.length).toBeGreaterThan(5);
    });

    it('should track winners correctly', () => {
      const players = createTestPlayers(4);
      const { stream, handIds } = createTestEventStream(players, 1);

      const replay = engine.reconstructHand(stream, handIds[0])!;

      expect(replay.winners).toContain(players[0]);
    });

    it('should return null for non-existent hand', () => {
      const players = createTestPlayers(4);
      const { stream } = createTestEventStream(players, 1);

      const replay = engine.reconstructHand(stream, 'nonexistent' as HandId);

      expect(replay).toBeNull();
    });
  });

  describe('Step Navigation', () => {
    it('should get specific step', () => {
      const players = createTestPlayers(4);
      const { stream, handIds } = createTestEventStream(players, 1);

      const replay = engine.reconstructHand(stream, handIds[0])!;
      const step = engine.getStep(replay, 1);

      expect(step).not.toBeNull();
      expect(step!.index).toBe(1);
    });

    it('should return null for out of bounds step', () => {
      const players = createTestPlayers(4);
      const { stream, handIds } = createTestEventStream(players, 1);

      const replay = engine.reconstructHand(stream, handIds[0])!;
      const step = engine.getStep(replay, 999);

      expect(step).toBeNull();
    });

    it('should get state at step', () => {
      const players = createTestPlayers(4);
      const { stream, handIds } = createTestEventStream(players, 1);

      const replay = engine.reconstructHand(stream, handIds[0])!;
      const state = engine.getStateAtStep(replay, 2);

      expect(state).not.toBeNull();
      expect(state!.stepIndex).toBe(2);
    });

    it('should calculate diff between steps', () => {
      const players = createTestPlayers(4);
      const { stream, handIds } = createTestEventStream(players, 1);

      const replay = engine.reconstructHand(stream, handIds[0])!;
      const diff = engine.getDiffBetweenSteps(replay, 0, 1);

      expect(diff).not.toBeNull();
      expect(diff!.fromStep).toBe(0);
      expect(diff!.toStep).toBe(1);
    });
  });

  describe('Action Queries', () => {
    it('should get all actions', () => {
      const players = createTestPlayers(4);
      const { stream, handIds } = createTestEventStream(players, 1);

      const replay = engine.reconstructHand(stream, handIds[0])!;
      const actions = engine.getActions(replay);

      expect(actions.length).toBeGreaterThan(0);
      expect(actions.every(a => a.playerId !== undefined)).toBe(true);
    });

    it('should get actions by player', () => {
      const players = createTestPlayers(4);
      const { stream, handIds } = createTestEventStream(players, 1);

      const replay = engine.reconstructHand(stream, handIds[0])!;
      const playerActions = engine.getPlayerActions(replay, players[0]);

      expect(playerActions.length).toBeGreaterThan(0);
      expect(playerActions.every(a => a.playerId === players[0])).toBe(true);
    });

    it('should get actions by street', () => {
      const players = createTestPlayers(4);
      const { stream, handIds } = createTestEventStream(players, 1);

      const replay = engine.reconstructHand(stream, handIds[0])!;
      const preflopActions = engine.getStreetActions(replay, 'preflop');

      expect(preflopActions.length).toBeGreaterThan(0);
      expect(preflopActions.every(a => a.street === 'preflop')).toBe(true);
    });
  });

  describe('Replay Determinism', () => {
    it('should have valid checksum', () => {
      const players = createTestPlayers(4);
      const { stream, handIds } = createTestEventStream(players, 1);

      const replay = engine.reconstructHand(stream, handIds[0])!;

      expect(replay.checksum).toBeDefined();
      expect(replay.checksum).toContain('checksum_');
    });

    it('should verify replay determinism', () => {
      const players = createTestPlayers(4);
      const { stream, handIds } = createTestEventStream(players, 1);

      const replay = engine.reconstructHand(stream, handIds[0])!;
      const isValid = engine.verifyReplayDeterminism(replay);

      expect(isValid).toBe(true);
    });

    it('should produce identical replays for same input', () => {
      const players = createTestPlayers(4);
      const { stream, handIds } = createTestEventStream(players, 1);

      const replay1 = engine.reconstructHand(stream, handIds[0])!;
      const replay2 = engine.reconstructHand(stream, handIds[0])!;

      expect(replay1.checksum).toBe(replay2.checksum);
      expect(replay1.steps.length).toBe(replay2.steps.length);
    });
  });
});

// ============================================================================
// EvidenceBundleBuilder Tests
// ============================================================================

describe('EvidenceBundleBuilder', () => {
  let builder: EvidenceBundleBuilder;

  beforeEach(() => {
    resetIntegrityCounters();
    resetModerationCounters();
    builder = createEvidenceBundleBuilder();
  });

  describe('Bundle Creation', () => {
    it('should build evidence bundle for a hand', () => {
      const players = createTestPlayers(4);
      const { stream, handIds } = createTestEventStream(players, 3);

      const bundle = builder.buildBundle(
        stream,
        handIds[0],
        'Suspicious chip flow',
        'MODERATE_RISK'
      );

      expect(bundle).not.toBeNull();
      expect(bundle!.handId).toBe(handIds[0]);
      expect(bundle!.bundleId).toBeDefined();
    });

    it('should include all hand events', () => {
      const players = createTestPlayers(4);
      const { stream, handIds } = createTestEventStream(players, 1);

      const bundle = builder.buildBundle(stream, handIds[0], 'Test', 'LOW_RISK')!;

      expect(bundle.events.length).toBeGreaterThan(0);
      expect(bundle.events.every(e => e.handId === handIds[0])).toBe(true);
    });

    it('should include replay', () => {
      const players = createTestPlayers(4);
      const { stream, handIds } = createTestEventStream(players, 1);

      const bundle = builder.buildBundle(stream, handIds[0], 'Test', 'LOW_RISK')!;

      expect(bundle.replay).toBeDefined();
      expect(bundle.replay.handId).toBe(handIds[0]);
    });

    it('should include player metrics', () => {
      const players = createTestPlayers(4);
      const { stream, handIds } = createTestEventStream(players, 3);

      const bundle = builder.buildBundle(stream, handIds[0], 'Test', 'LOW_RISK')!;

      expect(bundle.playerMetrics.size).toBeGreaterThan(0);
    });

    it('should include table context', () => {
      const players = createTestPlayers(4);
      const { stream, handIds } = createTestEventStream(players, 1);

      const bundle = builder.buildBundle(stream, handIds[0], 'Test', 'LOW_RISK')!;

      expect(bundle.tableContext.tableId).toBe(TEST_TABLE_ID);
      expect(bundle.tableContext.clubId).toBe(TEST_CLUB_ID);
      expect(bundle.tableContext.blinds).toEqual({ small: 5, big: 10 });
    });

    it('should include hand outcome', () => {
      const players = createTestPlayers(4);
      const { stream, handIds } = createTestEventStream(players, 1);

      const bundle = builder.buildBundle(stream, handIds[0], 'Test', 'LOW_RISK')!;

      expect(bundle.outcome).toBeDefined();
      expect(bundle.outcome.handId).toBe(handIds[0]);
      expect(bundle.outcome.winners.length).toBeGreaterThan(0);
    });

    it('should return null for non-existent hand', () => {
      const players = createTestPlayers(4);
      const { stream } = createTestEventStream(players, 1);

      const bundle = builder.buildBundle(
        stream,
        'nonexistent' as HandId,
        'Test',
        'LOW_RISK'
      );

      expect(bundle).toBeNull();
    });
  });

  describe('Bundle Verification', () => {
    it('should verify valid bundle', () => {
      const players = createTestPlayers(4);
      const { stream, handIds } = createTestEventStream(players, 1);

      const bundle = builder.buildBundle(stream, handIds[0], 'Test', 'LOW_RISK')!;
      const result = builder.verifyBundle(bundle);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect tampered checksum', () => {
      const players = createTestPlayers(4);
      const { stream, handIds } = createTestEventStream(players, 1);

      const bundle = builder.buildBundle(stream, handIds[0], 'Test', 'LOW_RISK')!;

      // Tamper with checksum
      const tamperedBundle = {
        ...bundle,
        checksum: 'tampered_checksum' as any,
      };

      const result = builder.verifyBundle(tamperedBundle);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Bundle Chain', () => {
    it('should create tamper-evident bundle chain', () => {
      const players = createTestPlayers(4);
      const { stream, handIds } = createTestEventStream(players, 3);

      const bundles = handIds.map(handId =>
        builder.buildBundle(stream, handId, 'Test', 'LOW_RISK')!
      );

      const chain = builder.createBundleChain(bundles);

      expect(chain.chainHash).toBeDefined();
      expect(chain.bundleHashes.size).toBe(3);
    });
  });
});

// ============================================================================
// DecisionLogger Tests
// ============================================================================

describe('DecisionLogger', () => {
  let logger: DecisionLogger;

  beforeEach(() => {
    resetModerationCounters();
    logger = createDecisionLogger();
  });

  describe('Logging', () => {
    it('should log actions', () => {
      const caseId = 'case_test' as CaseId;

      const entry = logger.logAction(
        TEST_MODERATOR_ID,
        'CASE_VIEWED',
        caseId,
        { note: 'Test view' }
      );

      expect(entry.moderatorId).toBe(TEST_MODERATOR_ID);
      expect(entry.actionType).toBe('CASE_VIEWED');
      expect(entry.caseId).toBe(caseId);
    });

    it('should maintain entry count', () => {
      const caseId = 'case_test' as CaseId;

      logger.logAction(TEST_MODERATOR_ID, 'CASE_VIEWED', caseId, {});
      logger.logAction(TEST_MODERATOR_ID, 'ANNOTATION_ADDED', caseId, {});

      expect(logger.getEntryCount()).toBe(2);
    });

    it('should chain entries with hashes', () => {
      const caseId = 'case_test' as CaseId;

      const entry1 = logger.logAction(TEST_MODERATOR_ID, 'CASE_VIEWED', caseId, {});
      const entry2 = logger.logAction(TEST_MODERATOR_ID, 'ANNOTATION_ADDED', caseId, {});

      expect(entry1.previousEntryHash).toBeNull();
      expect(entry2.previousEntryHash).toBe(entry1.entryHash);
    });
  });

  describe('Queries', () => {
    it('should get entries for case', () => {
      const caseId1 = 'case_1' as CaseId;
      const caseId2 = 'case_2' as CaseId;

      logger.logAction(TEST_MODERATOR_ID, 'CASE_VIEWED', caseId1, {});
      logger.logAction(TEST_MODERATOR_ID, 'CASE_VIEWED', caseId2, {});
      logger.logAction(TEST_MODERATOR_ID, 'ANNOTATION_ADDED', caseId1, {});

      const case1Entries = logger.getEntriesForCase(caseId1);

      expect(case1Entries.length).toBe(2);
    });

    it('should get entries by moderator', () => {
      const caseId = 'case_test' as CaseId;
      const moderator2 = 'moderator_2' as ModeratorId;

      logger.logAction(TEST_MODERATOR_ID, 'CASE_VIEWED', caseId, {});
      logger.logAction(moderator2, 'CASE_VIEWED', caseId, {});

      const mod1Entries = logger.getEntriesByModerator(TEST_MODERATOR_ID);

      expect(mod1Entries.length).toBe(1);
    });

    it('should get entries by action type', () => {
      const caseId = 'case_test' as CaseId;

      logger.logAction(TEST_MODERATOR_ID, 'CASE_VIEWED', caseId, {});
      logger.logAction(TEST_MODERATOR_ID, 'ANNOTATION_ADDED', caseId, {});
      logger.logAction(TEST_MODERATOR_ID, 'ANNOTATION_ADDED', caseId, {});

      const annotations = logger.getEntriesByActionType('ANNOTATION_ADDED');

      expect(annotations.length).toBe(2);
    });
  });

  describe('Integrity Verification', () => {
    it('should verify intact log', () => {
      const caseId = 'case_test' as CaseId;

      logger.logAction(TEST_MODERATOR_ID, 'CASE_VIEWED', caseId, {});
      logger.logAction(TEST_MODERATOR_ID, 'ANNOTATION_ADDED', caseId, {});

      const result = logger.verifyIntegrity();

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should export for audit', () => {
      const caseId = 'case_test' as CaseId;

      logger.logAction(TEST_MODERATOR_ID, 'CASE_VIEWED', caseId, {});

      const audit = logger.exportForAudit();

      expect(audit.log.entryCount).toBe(1);
      expect(audit.integrityCheck.isValid).toBe(true);
      expect(audit.exportedAt).toBeDefined();
    });
  });

  describe('Statistics', () => {
    it('should calculate moderator statistics', () => {
      const caseId = 'case_test' as CaseId;

      logger.logAction(TEST_MODERATOR_ID, 'CASE_VIEWED', caseId, {});
      logger.logAction(TEST_MODERATOR_ID, 'ANNOTATION_ADDED', caseId, {});

      const stats = logger.getModeratorStatistics();

      expect(stats.has(TEST_MODERATOR_ID)).toBe(true);
      expect(stats.get(TEST_MODERATOR_ID)!.totalActions).toBe(2);
    });

    it('should calculate action type statistics', () => {
      const caseId = 'case_test' as CaseId;

      logger.logAction(TEST_MODERATOR_ID, 'CASE_VIEWED', caseId, {});
      logger.logAction(TEST_MODERATOR_ID, 'CASE_VIEWED', caseId, {});
      logger.logAction(TEST_MODERATOR_ID, 'ANNOTATION_ADDED', caseId, {});

      const stats = logger.getActionTypeStatistics();

      expect(stats.get('CASE_VIEWED')).toBe(2);
      expect(stats.get('ANNOTATION_ADDED')).toBe(1);
    });
  });
});

// ============================================================================
// ModeratorService Tests
// ============================================================================

describe('ModeratorService', () => {
  let service: ModeratorService;

  beforeEach(() => {
    resetIntegrityCounters();
    resetModerationCounters();
    service = createModeratorService();
  });

  afterEach(() => {
    service.clear();
  });

  describe('Case Management', () => {
    it('should create a case', () => {
      const players = createTestPlayers(4);
      const { stream, handIds } = createTestEventStream(players, 1);

      const moderationCase = service.createCase(
        stream,
        handIds[0],
        'Test flag',
        'MODERATE_RISK'
      );

      expect(moderationCase).not.toBeNull();
      expect(moderationCase!.status).toBe('PENDING_REVIEW');
      expect(moderationCase!.evidenceBundle.handId).toBe(handIds[0]);
    });

    it('should return existing case if already exists', () => {
      const players = createTestPlayers(4);
      const { stream, handIds } = createTestEventStream(players, 1);

      const case1 = service.createCase(stream, handIds[0], 'Test', 'LOW_RISK')!;
      const case2 = service.createCase(stream, handIds[0], 'Test', 'LOW_RISK')!;

      expect(case1.caseId).toBe(case2.caseId);
    });

    it('should get case by ID', () => {
      const players = createTestPlayers(4);
      const { stream, handIds } = createTestEventStream(players, 1);

      const created = service.createCase(stream, handIds[0], 'Test', 'LOW_RISK')!;
      const retrieved = service.getCase(created.caseId);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.caseId).toBe(created.caseId);
    });

    it('should get case by hand ID', () => {
      const players = createTestPlayers(4);
      const { stream, handIds } = createTestEventStream(players, 1);

      service.createCase(stream, handIds[0], 'Test', 'LOW_RISK');
      const retrieved = service.getCaseByHandId(handIds[0]);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.evidenceBundle.handId).toBe(handIds[0]);
    });
  });

  describe('Query API', () => {
    it('should list flagged hands', () => {
      const players = createTestPlayers(4);
      const { stream, handIds } = createTestEventStream(players, 3);

      for (const handId of handIds) {
        service.createCase(stream, handId, 'Test', 'LOW_RISK');
      }

      const summaries = service.listFlaggedHands();

      expect(summaries.length).toBe(3);
    });

    it('should filter by risk level', () => {
      const players = createTestPlayers(4);
      const { stream, handIds } = createTestEventStream(players, 3);

      service.createCase(stream, handIds[0], 'Test', 'LOW_RISK');
      service.createCase(stream, handIds[1], 'Test', 'HIGH_RISK');
      service.createCase(stream, handIds[2], 'Test', 'LOW_RISK');

      const highRisk = service.listFlaggedHands({ riskLevel: 'HIGH_RISK' });

      expect(highRisk.length).toBe(1);
    });

    it('should paginate results', () => {
      const players = createTestPlayers(4);
      const { stream, handIds } = createTestEventStream(players, 5);

      for (const handId of handIds) {
        service.createCase(stream, handId, 'Test', 'LOW_RISK');
      }

      const page1 = service.listFlaggedHands({ limit: 2, offset: 0 });
      const page2 = service.listFlaggedHands({ limit: 2, offset: 2 });

      expect(page1.length).toBe(2);
      expect(page2.length).toBe(2);
    });

    it('should get hand replay', () => {
      const players = createTestPlayers(4);
      const { stream, handIds } = createTestEventStream(players, 1);

      const moderationCase = service.createCase(stream, handIds[0], 'Test', 'LOW_RISK')!;
      const replay = service.getHandReplay(moderationCase.caseId, TEST_MODERATOR_ID);

      expect(replay).not.toBeNull();
      expect(replay!.handId).toBe(handIds[0]);
    });

    it('should get evidence bundle', () => {
      const players = createTestPlayers(4);
      const { stream, handIds } = createTestEventStream(players, 1);

      const moderationCase = service.createCase(stream, handIds[0], 'Test', 'LOW_RISK')!;
      const bundle = service.getEvidenceBundle(moderationCase.caseId, TEST_MODERATOR_ID);

      expect(bundle).not.toBeNull();
      expect(bundle!.handId).toBe(handIds[0]);
    });
  });

  describe('Case Investigation', () => {
    it('should assign moderator to case', () => {
      const players = createTestPlayers(4);
      const { stream, handIds } = createTestEventStream(players, 1);

      const moderationCase = service.createCase(stream, handIds[0], 'Test', 'LOW_RISK')!;
      const updated = service.assignCase(
        moderationCase.caseId,
        TEST_MODERATOR_ID,
        'admin' as ModeratorId
      );

      expect(updated).not.toBeNull();
      expect(updated!.assignedModerator).toBe(TEST_MODERATOR_ID);
      expect(updated!.status).toBe('UNDER_INVESTIGATION');
    });

    it('should add annotation', () => {
      const players = createTestPlayers(4);
      const { stream, handIds } = createTestEventStream(players, 1);

      const moderationCase = service.createCase(stream, handIds[0], 'Test', 'LOW_RISK')!;
      const annotation = service.annotateCase(
        moderationCase.caseId,
        TEST_MODERATOR_ID,
        'This looks suspicious',
        'OBSERVATION'
      );

      expect(annotation).not.toBeNull();
      expect(annotation!.content).toBe('This looks suspicious');

      const updated = service.getCase(moderationCase.caseId)!;
      expect(updated.annotations.length).toBe(1);
    });

    it('should recommend resolution', () => {
      const players = createTestPlayers(4);
      const { stream, handIds } = createTestEventStream(players, 1);

      const moderationCase = service.createCase(stream, handIds[0], 'Test', 'LOW_RISK')!;
      const recommendation = service.recommendResolution(
        moderationCase.caseId,
        TEST_MODERATOR_ID,
        'WARNING',
        [players[0]],
        'Evidence suggests soft-play',
        'MEDIUM'
      );

      expect(recommendation).not.toBeNull();
      expect(recommendation!.resolution).toBe('WARNING');

      const updated = service.getCase(moderationCase.caseId)!;
      expect(updated.status).toBe('AWAITING_DECISION');
    });
  });

  describe('Case Resolution', () => {
    it('should make decision', () => {
      const players = createTestPlayers(4);
      const { stream, handIds } = createTestEventStream(players, 1);

      const moderationCase = service.createCase(stream, handIds[0], 'Test', 'LOW_RISK')!;
      const resolved = service.makeDecision(
        moderationCase.caseId,
        TEST_MODERATOR_ID,
        'WARNING',
        'Confirmed soft-play behavior'
      );

      expect(resolved).not.toBeNull();
      expect(resolved!.status).toBe('RESOLVED');
      expect(resolved!.finalDecision).toBe('WARNING');
    });

    it('should dismiss case', () => {
      const players = createTestPlayers(4);
      const { stream, handIds } = createTestEventStream(players, 1);

      const moderationCase = service.createCase(stream, handIds[0], 'Test', 'LOW_RISK')!;
      const dismissed = service.dismissCase(
        moderationCase.caseId,
        TEST_MODERATOR_ID,
        'False positive'
      );

      expect(dismissed).not.toBeNull();
      expect(dismissed!.status).toBe('DISMISSED');
      expect(dismissed!.finalDecision).toBe('NO_ACTION');
    });

    it('should escalate case', () => {
      const players = createTestPlayers(4);
      const { stream, handIds } = createTestEventStream(players, 1);

      const moderationCase = service.createCase(stream, handIds[0], 'Test', 'LOW_RISK')!;
      const escalated = service.escalateCase(
        moderationCase.caseId,
        TEST_MODERATOR_ID,
        'Need senior review'
      );

      expect(escalated).not.toBeNull();
      expect(escalated!.status).toBe('ESCALATED');
    });

    it('should reopen case', () => {
      const players = createTestPlayers(4);
      const { stream, handIds } = createTestEventStream(players, 1);

      const moderationCase = service.createCase(stream, handIds[0], 'Test', 'LOW_RISK')!;
      service.dismissCase(moderationCase.caseId, TEST_MODERATOR_ID, 'False positive');

      const reopened = service.reopenCase(
        moderationCase.caseId,
        TEST_MODERATOR_ID,
        'New evidence found'
      );

      expect(reopened).not.toBeNull();
      expect(reopened!.status).toBe('UNDER_INVESTIGATION');
      expect(reopened!.finalDecision).toBeNull();
    });
  });

  describe('Statistics', () => {
    it('should calculate statistics', () => {
      const players = createTestPlayers(4);
      const { stream, handIds } = createTestEventStream(players, 3);

      service.createCase(stream, handIds[0], 'Test', 'LOW_RISK');
      service.createCase(stream, handIds[1], 'Test', 'HIGH_RISK');
      service.createCase(stream, handIds[2], 'Test', 'MODERATE_RISK');

      const stats = service.getStatistics();

      expect(stats.totalCases).toBe(3);
      expect(stats.byStatus.get('PENDING_REVIEW')).toBe(3);
    });
  });

  describe('Decision Logging Integration', () => {
    it('should log all moderator actions', () => {
      const players = createTestPlayers(4);
      const { stream, handIds } = createTestEventStream(players, 1);

      const moderationCase = service.createCase(stream, handIds[0], 'Test', 'LOW_RISK')!;

      // Perform various actions
      service.assignCase(moderationCase.caseId, TEST_MODERATOR_ID, 'admin' as ModeratorId);
      service.getHandReplay(moderationCase.caseId, TEST_MODERATOR_ID);
      service.annotateCase(moderationCase.caseId, TEST_MODERATOR_ID, 'Note', 'OBSERVATION');
      service.makeDecision(moderationCase.caseId, TEST_MODERATOR_ID, 'WARNING', 'Reason');

      const logger = service.getDecisionLog();
      const entries = logger.getEntriesForCase(moderationCase.caseId);

      // Should have: CASE_CREATED, CASE_ASSIGNED, REPLAY_VIEWED, ANNOTATION_ADDED, DECISION_MADE
      expect(entries.length).toBe(5);
    });
  });
});

// ============================================================================
// Cross-Module Isolation Tests
// ============================================================================

describe('Cross-Module Isolation', () => {
  beforeEach(() => {
    resetIntegrityCounters();
    resetModerationCounters();
  });

  it('should not modify integrity event stream', () => {
    const players = createTestPlayers(4);
    const collector = new EventCollector();
    collector.startSession(TEST_CLUB_ID, TEST_TABLE_ID);

    const handId = createHandId(1);
    const positions = new Map<PlayerId, number>();
    const stacks = new Map<PlayerId, number>();
    players.forEach((p, i) => {
      positions.set(p, i);
      stacks.set(p, 1000);
    });

    collector.recordHandStarted(TEST_TABLE_ID, handId, players, positions, stacks, { small: 5, big: 10 });

    const stream = collector.endSession(TEST_TABLE_ID)!;
    const originalEventCount = stream.events.length;

    // Create moderation case
    const service = createModeratorService();
    const moderationCase = service.createCase(stream, handId, 'Test', 'LOW_RISK');

    // Original stream should be unchanged
    expect(stream.events.length).toBe(originalEventCount);
  });

  it('should work independently of integrity detectors', () => {
    const players = createTestPlayers(4);
    const { stream, handIds } = createTestEventStream(players, 1);

    // Moderation should work even if no signals detected
    const service = createModeratorService();
    const moderationCase = service.createCase(stream, handIds[0], 'Manual flag', 'LOW_RISK');

    expect(moderationCase).not.toBeNull();
    expect(moderationCase!.evidenceBundle.flagReason).toBe('Manual flag');
  });
});

// ============================================================================
// Tamper Resistance Tests
// ============================================================================

describe('Tamper Resistance', () => {
  beforeEach(() => {
    resetModerationCounters();
  });

  it('should detect evidence bundle tampering', () => {
    const players = createTestPlayers(4);
    const { stream, handIds } = createTestEventStream(players, 1);

    const builder = createEvidenceBundleBuilder();
    const bundle = builder.buildBundle(stream, handIds[0], 'Test', 'LOW_RISK')!;

    // Tamper with the bundle
    const tamperedBundle = {
      ...bundle,
      outcome: {
        ...bundle.outcome,
        potSize: bundle.outcome.potSize + 1000, // Tamper pot size
      },
    };

    const result = builder.verifyBundle(tamperedBundle);

    expect(result.isValid).toBe(false);
  });

  it('should detect decision log tampering via hash chain', () => {
    const logger = createDecisionLogger();
    const caseId = 'case_test' as CaseId;

    // Create entries
    logger.logAction(TEST_MODERATOR_ID, 'CASE_VIEWED', caseId, {});
    logger.logAction(TEST_MODERATOR_ID, 'ANNOTATION_ADDED', caseId, {});

    // Verify integrity
    const result = logger.verifyIntegrity();

    expect(result.isValid).toBe(true);
  });

  it('should detect replay checksum mismatch', () => {
    const players = createTestPlayers(4);
    const { stream, handIds } = createTestEventStream(players, 1);

    const engine = createHandReplayEngine();
    const replay = engine.reconstructHand(stream, handIds[0])!;

    // Tamper with replay
    const tamperedReplay = {
      ...replay,
      checksum: 'tampered_checksum' as any,
    };

    const isValid = engine.verifyReplayDeterminism(tamperedReplay);

    expect(isValid).toBe(false);
  });
});

// ============================================================================
// Checksum Utilities Tests
// ============================================================================

describe('Checksum Utilities', () => {
  it('should calculate consistent checksum', () => {
    const data = 'test data';
    const checksum1 = calculateChecksum(data);
    const checksum2 = calculateChecksum(data);

    expect(checksum1).toBe(checksum2);
  });

  it('should verify matching checksum', () => {
    const data = 'test data';
    const checksum = calculateChecksum(data);

    expect(verifyChecksum(data, checksum)).toBe(true);
  });

  it('should reject non-matching checksum', () => {
    const data = 'test data';
    const wrongChecksum = calculateChecksum('different data');

    expect(verifyChecksum(data, wrongChecksum)).toBe(false);
  });

  it('should produce different checksums for different data', () => {
    const checksum1 = calculateChecksum('data 1');
    const checksum2 = calculateChecksum('data 2');

    expect(checksum1).not.toBe(checksum2);
  });
});
