/**
 * DecisionLogger.ts
 * Phase 23 - Append-only decision logging with audit trail
 *
 * Provides:
 * - Immutable, append-only log of moderator actions
 * - Timestamps and actor identity
 * - Hash chain for tamper detection
 * - Auditable history
 */

import {
  CaseId,
  ModeratorId,
  ModeratorActionType,
  DecisionLogEntry,
  DecisionLog,
  DecisionId,
  generateDecisionId,
  calculateChecksum,
} from '../ModerationTypes';

// ============================================================================
// DecisionLogger Implementation
// ============================================================================

export class DecisionLogger {
  private readonly entries: DecisionLogEntry[];
  private lastEntryHash: string | null;

  constructor() {
    this.entries = [];
    this.lastEntryHash = null;
  }

  /**
   * Log a moderator action (append-only)
   */
  logAction(
    moderatorId: ModeratorId,
    actionType: ModeratorActionType,
    caseId: CaseId,
    details: Record<string, unknown>
  ): DecisionLogEntry {
    const entryId = generateDecisionId();
    const timestamp = Date.now();

    // Create entry data for hashing
    const entryData = JSON.stringify({
      entryId,
      timestamp,
      moderatorId,
      actionType,
      caseId,
      details,
      previousEntryHash: this.lastEntryHash,
    });

    // Calculate hash for this entry
    const entryHash = calculateChecksum(entryData);

    const entry: DecisionLogEntry = {
      entryId,
      timestamp,
      moderatorId,
      actionType,
      caseId,
      details,
      previousEntryHash: this.lastEntryHash,
      entryHash,
    };

    // Append to log (immutable operation)
    this.entries.push(entry);
    this.lastEntryHash = entryHash;

    return entry;
  }

  /**
   * Get the complete decision log
   */
  getLog(): DecisionLog {
    return {
      entries: [...this.entries], // Return copy for immutability
      lastEntryHash: this.lastEntryHash,
      entryCount: this.entries.length,
    };
  }

  /**
   * Get entries for a specific case
   */
  getEntriesForCase(caseId: CaseId): readonly DecisionLogEntry[] {
    return this.entries.filter(e => e.caseId === caseId);
  }

  /**
   * Get entries by moderator
   */
  getEntriesByModerator(moderatorId: ModeratorId): readonly DecisionLogEntry[] {
    return this.entries.filter(e => e.moderatorId === moderatorId);
  }

  /**
   * Get entries by action type
   */
  getEntriesByActionType(actionType: ModeratorActionType): readonly DecisionLogEntry[] {
    return this.entries.filter(e => e.actionType === actionType);
  }

  /**
   * Get entries in time range
   */
  getEntriesInRange(fromTime: number, toTime: number): readonly DecisionLogEntry[] {
    return this.entries.filter(
      e => e.timestamp >= fromTime && e.timestamp <= toTime
    );
  }

  /**
   * Verify log integrity (check hash chain)
   */
  verifyIntegrity(): {
    isValid: boolean;
    errors: string[];
    lastValidEntry: DecisionLogEntry | null;
  } {
    const errors: string[] = [];
    let lastValidEntry: DecisionLogEntry | null = null;
    let expectedPreviousHash: string | null = null;

    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i];

      // Verify previous hash chain
      if (entry.previousEntryHash !== expectedPreviousHash) {
        errors.push(
          `Entry ${i} (${entry.entryId}): Previous hash mismatch. ` +
          `Expected ${expectedPreviousHash}, got ${entry.previousEntryHash}`
        );
        break;
      }

      // Verify entry hash
      const entryData = JSON.stringify({
        entryId: entry.entryId,
        timestamp: entry.timestamp,
        moderatorId: entry.moderatorId,
        actionType: entry.actionType,
        caseId: entry.caseId,
        details: entry.details,
        previousEntryHash: entry.previousEntryHash,
      });

      const calculatedHash = calculateChecksum(entryData);
      if (calculatedHash !== entry.entryHash) {
        errors.push(
          `Entry ${i} (${entry.entryId}): Hash mismatch. Entry may have been tampered.`
        );
        break;
      }

      lastValidEntry = entry;
      expectedPreviousHash = entry.entryHash;
    }

    return {
      isValid: errors.length === 0,
      errors,
      lastValidEntry,
    };
  }

  /**
   * Export log for external audit
   */
  exportForAudit(): {
    log: DecisionLog;
    exportedAt: number;
    integrityCheck: {
      isValid: boolean;
      errors: string[];
      lastValidEntry: DecisionLogEntry | null;
    };
  } {
    return {
      log: this.getLog(),
      exportedAt: Date.now(),
      integrityCheck: this.verifyIntegrity(),
    };
  }

  /**
   * Get statistics about moderator activity
   */
  getModeratorStatistics(): Map<ModeratorId, {
    totalActions: number;
    byActionType: Map<ModeratorActionType, number>;
    firstAction: number;
    lastAction: number;
  }> {
    const stats = new Map<ModeratorId, {
      totalActions: number;
      byActionType: Map<ModeratorActionType, number>;
      firstAction: number;
      lastAction: number;
    }>();

    for (const entry of this.entries) {
      const existing = stats.get(entry.moderatorId);

      if (!existing) {
        stats.set(entry.moderatorId, {
          totalActions: 1,
          byActionType: new Map([[entry.actionType, 1]]),
          firstAction: entry.timestamp,
          lastAction: entry.timestamp,
        });
      } else {
        existing.totalActions++;
        existing.byActionType.set(
          entry.actionType,
          (existing.byActionType.get(entry.actionType) ?? 0) + 1
        );
        existing.lastAction = Math.max(existing.lastAction, entry.timestamp);
      }
    }

    return stats;
  }

  /**
   * Get action type statistics
   */
  getActionTypeStatistics(): Map<ModeratorActionType, number> {
    const stats = new Map<ModeratorActionType, number>();

    for (const entry of this.entries) {
      stats.set(
        entry.actionType,
        (stats.get(entry.actionType) ?? 0) + 1
      );
    }

    return stats;
  }

  /**
   * Get entry count
   */
  getEntryCount(): number {
    return this.entries.length;
  }

  /**
   * Get last entry
   */
  getLastEntry(): DecisionLogEntry | null {
    return this.entries.length > 0 ? this.entries[this.entries.length - 1] : null;
  }

  /**
   * Clear log (for testing only)
   */
  clear(): void {
    this.entries.length = 0;
    this.lastEntryHash = null;
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createDecisionLogger(): DecisionLogger {
  return new DecisionLogger();
}
