/**
 * TimelineManager.ts
 * Phase 24 - Timeline cursor management for replay-safe state
 *
 * Provides:
 * - Per-client timeline cursor tracking
 * - Event sequencing and ordering
 * - Replay-compatible event streams
 * - Gap detection and resolution
 */

import { PlayerId } from '../security/Identity';
import { TableId, HandId } from '../security/AuditLog';
import { SessionId, IntegrityEventId } from '../integrity/IntegrityTypes';
import {
  ClientSessionId,
  StateVersion,
  TimelineCursor,
  Timeline,
  TimelineEntry,
  StateDiff,
  createStateVersion,
  createTimelineCursor,
  calculateStateChecksum,
} from './SyncTypes';

// ============================================================================
// Configuration
// ============================================================================

export interface TimelineConfig {
  readonly maxEntriesInMemory: number;    // Max entries to keep in memory
  readonly entryTtlMs: number;            // Time before entries can be evicted
  readonly gapThreshold: number;           // Cursor gap threshold for concern
}

export const DEFAULT_TIMELINE_CONFIG: TimelineConfig = {
  maxEntriesInMemory: 10000,
  entryTtlMs: 60 * 60 * 1000,   // 1 hour
  gapThreshold: 100,
};

// ============================================================================
// TimelineManager Implementation
// ============================================================================

export class TimelineManager {
  private readonly timelines: Map<TableId, Timeline>;
  private readonly clientCursors: Map<ClientSessionId, TimelineCursor>;
  private readonly config: TimelineConfig;

  constructor(config: TimelineConfig = DEFAULT_TIMELINE_CONFIG) {
    this.timelines = new Map();
    this.clientCursors = new Map();
    this.config = config;
  }

  // ==========================================================================
  // Timeline Management
  // ==========================================================================

  /**
   * Create a new timeline for a table
   */
  createTimeline(tableId: TableId, sessionId: SessionId): Timeline {
    const timeline: Timeline = {
      tableId,
      sessionId,
      entries: [],
      currentCursor: createTimelineCursor(0),
      currentVersion: createStateVersion(0),
      startedAt: Date.now(),
    };

    this.timelines.set(tableId, timeline);
    return timeline;
  }

  /**
   * Get timeline for a table
   */
  getTimeline(tableId: TableId): Timeline | null {
    return this.timelines.get(tableId) ?? null;
  }

  /**
   * Append entry to timeline
   */
  appendEntry(
    tableId: TableId,
    eventType: string,
    diff: StateDiff,
    eventId?: IntegrityEventId,
    playerId?: PlayerId,
    handId?: HandId
  ): TimelineEntry | null {
    const timeline = this.timelines.get(tableId);
    if (!timeline) return null;

    const nextCursor = createTimelineCursor(Number(timeline.currentCursor) + 1);
    const nextVersion = createStateVersion(Number(timeline.currentVersion) + 1);

    const entry: TimelineEntry = {
      cursor: nextCursor,
      version: nextVersion,
      timestamp: Date.now(),
      eventType,
      eventId: eventId ?? null,
      playerId: playerId ?? null,
      handId: handId ?? null,
      diff,
    };

    // Create new timeline with appended entry
    const updatedTimeline: Timeline = {
      ...timeline,
      entries: [...timeline.entries, entry],
      currentCursor: nextCursor,
      currentVersion: nextVersion,
    };

    this.timelines.set(tableId, updatedTimeline);

    // Cleanup old entries
    this.cleanupOldEntries(tableId);

    return entry;
  }

  /**
   * Get current cursor for timeline
   */
  getCurrentCursor(tableId: TableId): TimelineCursor | null {
    const timeline = this.timelines.get(tableId);
    return timeline?.currentCursor ?? null;
  }

  /**
   * Get current version for timeline
   */
  getCurrentVersion(tableId: TableId): StateVersion | null {
    const timeline = this.timelines.get(tableId);
    return timeline?.currentVersion ?? null;
  }

  // ==========================================================================
  // Client Cursor Management
  // ==========================================================================

  /**
   * Initialize cursor for a new client
   */
  initializeClientCursor(
    sessionId: ClientSessionId,
    tableId: TableId
  ): TimelineCursor {
    const timeline = this.timelines.get(tableId);
    const cursor = timeline?.currentCursor ?? createTimelineCursor(0);
    this.clientCursors.set(sessionId, cursor);
    return cursor;
  }

  /**
   * Get client's current cursor
   */
  getClientCursor(sessionId: ClientSessionId): TimelineCursor | null {
    return this.clientCursors.get(sessionId) ?? null;
  }

  /**
   * Update client's cursor
   */
  updateClientCursor(
    sessionId: ClientSessionId,
    cursor: TimelineCursor
  ): void {
    this.clientCursors.set(sessionId, cursor);
  }

  /**
   * Remove client cursor
   */
  removeClientCursor(sessionId: ClientSessionId): void {
    this.clientCursors.delete(sessionId);
  }

  /**
   * Get entries since client's cursor
   */
  getEntriesSinceCursor(
    tableId: TableId,
    clientCursor: TimelineCursor
  ): readonly TimelineEntry[] {
    const timeline = this.timelines.get(tableId);
    if (!timeline) return [];

    return timeline.entries.filter(
      entry => Number(entry.cursor) > Number(clientCursor)
    );
  }

  /**
   * Get entries in cursor range
   */
  getEntriesInRange(
    tableId: TableId,
    fromCursor: TimelineCursor,
    toCursor: TimelineCursor
  ): readonly TimelineEntry[] {
    const timeline = this.timelines.get(tableId);
    if (!timeline) return [];

    return timeline.entries.filter(
      entry => Number(entry.cursor) > Number(fromCursor) &&
               Number(entry.cursor) <= Number(toCursor)
    );
  }

  /**
   * Get entry at specific cursor
   */
  getEntryAtCursor(
    tableId: TableId,
    cursor: TimelineCursor
  ): TimelineEntry | null {
    const timeline = this.timelines.get(tableId);
    if (!timeline) return null;

    return timeline.entries.find(e => e.cursor === cursor) ?? null;
  }

  // ==========================================================================
  // Gap Detection
  // ==========================================================================

  /**
   * Detect gap between client and server
   */
  detectGap(
    tableId: TableId,
    clientCursor: TimelineCursor
  ): {
    hasGap: boolean;
    gapSize: number;
    isCritical: boolean;
    missedEntries: readonly TimelineEntry[];
  } {
    const timeline = this.timelines.get(tableId);
    if (!timeline) {
      return {
        hasGap: false,
        gapSize: 0,
        isCritical: false,
        missedEntries: [],
      };
    }

    const gapSize = Number(timeline.currentCursor) - Number(clientCursor);
    const hasGap = gapSize > 0;
    const isCritical = gapSize > this.config.gapThreshold;
    const missedEntries = this.getEntriesSinceCursor(tableId, clientCursor);

    return {
      hasGap,
      gapSize,
      isCritical,
      missedEntries,
    };
  }

  /**
   * Check if incremental sync is possible
   */
  canIncrementalSync(
    tableId: TableId,
    clientCursor: TimelineCursor
  ): boolean {
    const timeline = this.timelines.get(tableId);
    if (!timeline) return false;

    // Check if we have all entries since client's cursor
    const oldestEntry = timeline.entries[0];
    if (!oldestEntry) return true; // No entries means up to date

    // Client cursor must be at or after our oldest entry
    return Number(clientCursor) >= Number(oldestEntry.cursor) - 1;
  }

  /**
   * Get all cursors behind by threshold
   */
  getBehindClients(tableId: TableId): Map<ClientSessionId, number> {
    const timeline = this.timelines.get(tableId);
    if (!timeline) return new Map();

    const behind = new Map<ClientSessionId, number>();
    const serverCursor = Number(timeline.currentCursor);

    for (const [sessionId, cursor] of this.clientCursors) {
      const gap = serverCursor - Number(cursor);
      if (gap > 0) {
        behind.set(sessionId, gap);
      }
    }

    return behind;
  }

  // ==========================================================================
  // Timeline Queries
  // ==========================================================================

  /**
   * Get entries for a specific hand
   */
  getHandEntries(tableId: TableId, handId: HandId): readonly TimelineEntry[] {
    const timeline = this.timelines.get(tableId);
    if (!timeline) return [];

    return timeline.entries.filter(e => e.handId === handId);
  }

  /**
   * Get entries by player
   */
  getPlayerEntries(tableId: TableId, playerId: PlayerId): readonly TimelineEntry[] {
    const timeline = this.timelines.get(tableId);
    if (!timeline) return [];

    return timeline.entries.filter(e => e.playerId === playerId);
  }

  /**
   * Get entries by event type
   */
  getEntriesByType(tableId: TableId, eventType: string): readonly TimelineEntry[] {
    const timeline = this.timelines.get(tableId);
    if (!timeline) return [];

    return timeline.entries.filter(e => e.eventType === eventType);
  }

  /**
   * Get entries in time range
   */
  getEntriesInTimeRange(
    tableId: TableId,
    fromTime: number,
    toTime: number
  ): readonly TimelineEntry[] {
    const timeline = this.timelines.get(tableId);
    if (!timeline) return [];

    return timeline.entries.filter(
      e => e.timestamp >= fromTime && e.timestamp <= toTime
    );
  }

  // ==========================================================================
  // Replay Support
  // ==========================================================================

  /**
   * Get entries for replay from cursor
   */
  getReplayEntries(
    tableId: TableId,
    fromCursor: TimelineCursor,
    limit?: number
  ): readonly TimelineEntry[] {
    const entries = this.getEntriesSinceCursor(tableId, fromCursor);
    return limit ? entries.slice(0, limit) : entries;
  }

  /**
   * Validate entry sequence for replay
   */
  validateEntrySequence(entries: readonly TimelineEntry[]): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (entries.length === 0) {
      return { isValid: true, errors };
    }

    // Check cursor continuity
    for (let i = 1; i < entries.length; i++) {
      const prev = entries[i - 1];
      const curr = entries[i];

      if (Number(curr.cursor) !== Number(prev.cursor) + 1) {
        errors.push(
          `Cursor gap at position ${i}: expected ${Number(prev.cursor) + 1}, got ${curr.cursor}`
        );
      }

      if (curr.timestamp < prev.timestamp) {
        errors.push(
          `Timestamp inconsistency at position ${i}: ${curr.timestamp} < ${prev.timestamp}`
        );
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Export timeline for replay/moderation
   */
  exportTimeline(tableId: TableId): {
    timeline: Timeline;
    checksum: string;
  } | null {
    const timeline = this.timelines.get(tableId);
    if (!timeline) return null;

    const timelineData = JSON.stringify({
      tableId: timeline.tableId,
      sessionId: timeline.sessionId,
      entries: timeline.entries.map(e => ({
        cursor: e.cursor,
        version: e.version,
        eventType: e.eventType,
        eventId: e.eventId,
      })),
    });

    return {
      timeline,
      checksum: calculateStateChecksum(timelineData),
    };
  }

  // ==========================================================================
  // Cleanup
  // ==========================================================================

  private cleanupOldEntries(tableId: TableId): void {
    const timeline = this.timelines.get(tableId);
    if (!timeline) return;

    if (timeline.entries.length <= this.config.maxEntriesInMemory) {
      return;
    }

    const now = Date.now();
    const cutoffTime = now - this.config.entryTtlMs;

    // Find the minimum cursor that any client still needs
    let minNeededCursor = Number(timeline.currentCursor);
    for (const cursor of this.clientCursors.values()) {
      minNeededCursor = Math.min(minNeededCursor, Number(cursor));
    }

    // Remove entries that are old AND not needed by any client
    const filteredEntries = timeline.entries.filter(
      entry => entry.timestamp > cutoffTime ||
               Number(entry.cursor) >= minNeededCursor
    );

    // Keep at least some recent entries
    const entriesToKeep = Math.min(
      this.config.maxEntriesInMemory,
      filteredEntries.length
    );

    const updatedTimeline: Timeline = {
      ...timeline,
      entries: filteredEntries.slice(-entriesToKeep),
    };

    this.timelines.set(tableId, updatedTimeline);
  }

  /**
   * Get statistics
   */
  getStatistics(tableId: TableId): {
    entryCount: number;
    oldestEntry: TimelineCursor | null;
    newestEntry: TimelineCursor | null;
    clientCount: number;
    averageGap: number;
  } | null {
    const timeline = this.timelines.get(tableId);
    if (!timeline) return null;

    const entries = timeline.entries;
    const oldestEntry = entries.length > 0 ? entries[0].cursor : null;
    const newestEntry = entries.length > 0 ? entries[entries.length - 1].cursor : null;

    // Count clients on this table
    let clientCount = 0;
    let totalGap = 0;

    for (const cursor of this.clientCursors.values()) {
      clientCount++;
      totalGap += Number(timeline.currentCursor) - Number(cursor);
    }

    return {
      entryCount: entries.length,
      oldestEntry,
      newestEntry,
      clientCount,
      averageGap: clientCount > 0 ? totalGap / clientCount : 0,
    };
  }

  /**
   * Clear timeline (for testing)
   */
  clear(): void {
    this.timelines.clear();
    this.clientCursors.clear();
  }

  /**
   * Remove timeline
   */
  removeTimeline(tableId: TableId): void {
    this.timelines.delete(tableId);
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createTimelineManager(
  config?: TimelineConfig
): TimelineManager {
  return new TimelineManager(config);
}
