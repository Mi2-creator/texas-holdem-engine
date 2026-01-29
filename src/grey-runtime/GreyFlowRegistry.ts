/**
 * GreyFlowRegistry.ts
 * Phase A - Grey Flow Settlement Runtime
 *
 * APPEND-ONLY FLOW REGISTRY
 *
 * This module provides the append-only registry for grey flow records.
 * Enforces idempotency, rejects invalid inputs, returns structured errors.
 *
 * @external This module operates OUTSIDE the frozen engine.
 * @append-only Records can only be added, never removed or modified.
 */

import {
  GreyFlowId,
  GreySessionId,
  GreyPartyId,
  GreyFlowType,
  GreyFlowStatus,
  GreyFlowDirection,
  GreyParty,
  GreyResult,
  GreyError,
  GreyErrorCode,
  greySuccess,
  greyFailure,
  createGreyError,
  createGreySessionId,
  createGreyFlowId,
} from './GreyTypes';

import {
  GreyFlowRecord,
  GreyFlowRecordInput,
  createGreyFlowRecord,
  transitionFlowStatus,
  verifyFlowRecordChecksum,
  verifyChainIntegrity,
  GENESIS_HASH,
} from './GreyFlowRecord';

// ============================================================================
// REGISTRY SESSION
// ============================================================================

/**
 * A session within the registry.
 * Sessions group related flows together.
 */
export interface GreySession {
  readonly sessionId: GreySessionId;
  readonly createdTimestamp: number;
  readonly records: readonly GreyFlowRecord[];
  readonly lastSequence: number;
  readonly lastChecksum: string;
}

// ============================================================================
// REGISTRY INTERFACE
// ============================================================================

/**
 * Result of appending a flow.
 */
export interface AppendFlowResult {
  readonly record: GreyFlowRecord;
  readonly sessionSequence: number;
  readonly globalSequence: number;
}

/**
 * Result of confirming a flow.
 */
export interface ConfirmFlowResult {
  readonly originalRecord: GreyFlowRecord;
  readonly confirmedRecord: GreyFlowRecord;
}

/**
 * Result of voiding a flow.
 */
export interface VoidFlowResult {
  readonly originalRecord: GreyFlowRecord;
  readonly voidedRecord: GreyFlowRecord;
}

/**
 * Registry integrity result.
 */
export interface RegistryIntegrityResult {
  readonly isValid: boolean;
  readonly totalRecords: number;
  readonly totalSessions: number;
  readonly errors: readonly string[];
}

// ============================================================================
// GREY FLOW REGISTRY CLASS
// ============================================================================

/**
 * Append-only registry for grey flow records.
 *
 * Features:
 * - Enforces idempotency (rejects duplicate flow IDs)
 * - Rejects negative and non-integer values
 * - Maintains hash chain integrity
 * - Returns structured errors (never throws)
 */
export class GreyFlowRegistry {
  private readonly sessions: Map<GreySessionId, GreySession> = new Map();
  private readonly flowIndex: Map<GreyFlowId, GreyFlowRecord> = new Map();
  private readonly allRecords: GreyFlowRecord[] = [];
  private globalSequence: number = 0;

  /**
   * Create a new session.
   *
   * @param sessionId - Unique session identifier
   * @param createdTimestamp - Injected timestamp
   * @returns Result containing the session or error
   */
  createSession(
    sessionId: GreySessionId,
    createdTimestamp: number
  ): GreyResult<GreySession> {
    // Check for duplicate session
    if (this.sessions.has(sessionId)) {
      return greyFailure(
        createGreyError(
          GreyErrorCode.DUPLICATE_FLOW_ID,
          `Session already exists: ${sessionId}`,
          { sessionId }
        )
      );
    }

    // Validate timestamp
    if (!Number.isInteger(createdTimestamp) || createdTimestamp <= 0) {
      return greyFailure(
        createGreyError(
          GreyErrorCode.INVALID_TIMESTAMP,
          `Invalid timestamp: ${createdTimestamp}`,
          { createdTimestamp }
        )
      );
    }

    const session: GreySession = Object.freeze({
      sessionId,
      createdTimestamp,
      records: Object.freeze([]),
      lastSequence: -1,
      lastChecksum: GENESIS_HASH,
    });

    this.sessions.set(sessionId, session);

    return greySuccess(session);
  }

  /**
   * Append a flow record to the registry.
   *
   * @param input - Flow record input
   * @returns Result containing the append result or error
   */
  appendFlow(input: GreyFlowRecordInput): GreyResult<AppendFlowResult> {
    // Check for duplicate flow ID (idempotency)
    if (this.flowIndex.has(input.flowId)) {
      return greyFailure(
        createGreyError(
          GreyErrorCode.DUPLICATE_FLOW_ID,
          `Flow ID already exists: ${input.flowId}`,
          { flowId: input.flowId }
        )
      );
    }

    // Get or create session
    let session = this.sessions.get(input.sessionId);
    if (!session) {
      const createResult = this.createSession(input.sessionId, input.injectedTimestamp);
      if (!createResult.success) {
        return greyFailure(createResult.error);
      }
      session = createResult.value;
    }

    // Calculate sequence and previous hash
    const sessionSequence = session.lastSequence + 1;
    const previousHash = session.lastChecksum;

    // Create the record
    const recordResult = createGreyFlowRecord(input, sessionSequence, previousHash);
    if (!recordResult.success) {
      return recordResult as GreyResult<AppendFlowResult>;
    }

    const record = recordResult.value;

    // Update session with new record
    const updatedRecords = [...session.records, record];
    const updatedSession: GreySession = Object.freeze({
      ...session,
      records: Object.freeze(updatedRecords),
      lastSequence: sessionSequence,
      lastChecksum: record.checksum,
    });

    this.sessions.set(input.sessionId, updatedSession);
    this.flowIndex.set(input.flowId, record);
    this.allRecords.push(record);
    this.globalSequence++;

    return greySuccess({
      record,
      sessionSequence,
      globalSequence: this.globalSequence,
    });
  }

  /**
   * Confirm a pending flow.
   *
   * @param flowId - Flow ID to confirm
   * @returns Result containing the confirm result or error
   */
  confirmFlow(flowId: GreyFlowId): GreyResult<ConfirmFlowResult> {
    const record = this.flowIndex.get(flowId);
    if (!record) {
      return greyFailure(
        createGreyError(
          GreyErrorCode.FLOW_NOT_FOUND,
          `Flow not found: ${flowId}`,
          { flowId }
        )
      );
    }

    if (record.status !== GreyFlowStatus.PENDING) {
      return greyFailure(
        createGreyError(
          GreyErrorCode.INVALID_STATUS_TRANSITION,
          `Flow is not PENDING: ${flowId}`,
          { flowId, currentStatus: record.status }
        )
      );
    }

    // Get session
    const session = this.sessions.get(record.sessionId);
    if (!session) {
      return greyFailure(
        createGreyError(
          GreyErrorCode.SESSION_NOT_FOUND,
          `Session not found: ${record.sessionId}`,
          { sessionId: record.sessionId }
        )
      );
    }

    // Create status transition record
    const newSequence = session.lastSequence + 1;
    const transitionResult = transitionFlowStatus(
      record,
      GreyFlowStatus.CONFIRMED,
      newSequence,
      session.lastChecksum
    );

    if (!transitionResult.success) {
      return transitionResult as GreyResult<ConfirmFlowResult>;
    }

    const confirmedRecord = transitionResult.value;

    // Update session
    const updatedRecords = [...session.records, confirmedRecord];
    const updatedSession: GreySession = Object.freeze({
      ...session,
      records: Object.freeze(updatedRecords),
      lastSequence: newSequence,
      lastChecksum: confirmedRecord.checksum,
    });

    this.sessions.set(record.sessionId, updatedSession);
    this.flowIndex.set(flowId, confirmedRecord);
    this.allRecords.push(confirmedRecord);
    this.globalSequence++;

    return greySuccess({
      originalRecord: record,
      confirmedRecord,
    });
  }

  /**
   * Void a pending flow.
   *
   * @param flowId - Flow ID to void
   * @returns Result containing the void result or error
   */
  voidFlow(flowId: GreyFlowId): GreyResult<VoidFlowResult> {
    const record = this.flowIndex.get(flowId);
    if (!record) {
      return greyFailure(
        createGreyError(
          GreyErrorCode.FLOW_NOT_FOUND,
          `Flow not found: ${flowId}`,
          { flowId }
        )
      );
    }

    if (record.status !== GreyFlowStatus.PENDING) {
      return greyFailure(
        createGreyError(
          GreyErrorCode.INVALID_STATUS_TRANSITION,
          `Flow is not PENDING: ${flowId}`,
          { flowId, currentStatus: record.status }
        )
      );
    }

    // Get session
    const session = this.sessions.get(record.sessionId);
    if (!session) {
      return greyFailure(
        createGreyError(
          GreyErrorCode.SESSION_NOT_FOUND,
          `Session not found: ${record.sessionId}`,
          { sessionId: record.sessionId }
        )
      );
    }

    // Create status transition record
    const newSequence = session.lastSequence + 1;
    const transitionResult = transitionFlowStatus(
      record,
      GreyFlowStatus.VOID,
      newSequence,
      session.lastChecksum
    );

    if (!transitionResult.success) {
      return transitionResult as GreyResult<VoidFlowResult>;
    }

    const voidedRecord = transitionResult.value;

    // Update session
    const updatedRecords = [...session.records, voidedRecord];
    const updatedSession: GreySession = Object.freeze({
      ...session,
      records: Object.freeze(updatedRecords),
      lastSequence: newSequence,
      lastChecksum: voidedRecord.checksum,
    });

    this.sessions.set(record.sessionId, updatedSession);
    this.flowIndex.set(flowId, voidedRecord);
    this.allRecords.push(voidedRecord);
    this.globalSequence++;

    return greySuccess({
      originalRecord: record,
      voidedRecord,
    });
  }

  // ============================================================================
  // READ OPERATIONS
  // ============================================================================

  /**
   * Get a flow record by ID.
   */
  getFlow(flowId: GreyFlowId): GreyFlowRecord | undefined {
    return this.flowIndex.get(flowId);
  }

  /**
   * Get a session by ID.
   */
  getSession(sessionId: GreySessionId): GreySession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get all records (read-only copy).
   */
  getAllRecords(): readonly GreyFlowRecord[] {
    return Object.freeze([...this.allRecords]);
  }

  /**
   * Get all sessions (read-only copy).
   */
  getAllSessions(): readonly GreySession[] {
    return Object.freeze([...this.sessions.values()]);
  }

  /**
   * Get records by session.
   */
  getRecordsBySession(sessionId: GreySessionId): readonly GreyFlowRecord[] {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return Object.freeze([]);
    }
    return session.records;
  }

  /**
   * Get records by party.
   */
  getRecordsByParty(partyId: GreyPartyId): readonly GreyFlowRecord[] {
    const records = this.allRecords.filter(
      (r) => r.party.partyId === partyId
    );
    return Object.freeze(records);
  }

  /**
   * Get records by type.
   */
  getRecordsByType(type: GreyFlowType): readonly GreyFlowRecord[] {
    const records = this.allRecords.filter((r) => r.type === type);
    return Object.freeze(records);
  }

  /**
   * Get records by status.
   */
  getRecordsByStatus(status: GreyFlowStatus): readonly GreyFlowRecord[] {
    const records = this.allRecords.filter((r) => r.status === status);
    return Object.freeze(records);
  }

  /**
   * Check if a flow ID exists.
   */
  hasFlow(flowId: GreyFlowId): boolean {
    return this.flowIndex.has(flowId);
  }

  /**
   * Check if a session ID exists.
   */
  hasSession(sessionId: GreySessionId): boolean {
    return this.sessions.has(sessionId);
  }

  /**
   * Get total record count.
   */
  getRecordCount(): number {
    return this.allRecords.length;
  }

  /**
   * Get total session count.
   */
  getSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Get global sequence.
   */
  getGlobalSequence(): number {
    return this.globalSequence;
  }

  // ============================================================================
  // INTEGRITY VERIFICATION
  // ============================================================================

  /**
   * Verify registry integrity.
   * Checks all checksums and chain integrity.
   */
  verifyIntegrity(): RegistryIntegrityResult {
    const errors: string[] = [];

    // Verify each session's chain
    for (const session of this.sessions.values()) {
      let previousHash: string = GENESIS_HASH;

      for (let i = 0; i < session.records.length; i++) {
        const record = session.records[i];

        // Verify checksum
        if (!verifyFlowRecordChecksum(record)) {
          errors.push(
            `Invalid checksum for flow ${record.flowId} in session ${session.sessionId}`
          );
        }

        // Verify chain
        if (record.previousHash !== previousHash) {
          errors.push(
            `Invalid chain for flow ${record.flowId} in session ${session.sessionId}`
          );
        }

        previousHash = record.checksum;
      }
    }

    return Object.freeze({
      isValid: errors.length === 0,
      totalRecords: this.allRecords.length,
      totalSessions: this.sessions.size,
      errors: Object.freeze(errors),
    });
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a new grey flow registry.
 */
export function createGreyFlowRegistry(): GreyFlowRegistry {
  return new GreyFlowRegistry();
}

// ============================================================================
// SINGLETON MANAGEMENT (Optional)
// ============================================================================

let globalRegistry: GreyFlowRegistry | null = null;

/**
 * Get the global grey flow registry.
 */
export function getGreyFlowRegistry(): GreyFlowRegistry {
  if (!globalRegistry) {
    globalRegistry = createGreyFlowRegistry();
  }
  return globalRegistry;
}

/**
 * Reset the global grey flow registry.
 * Only for testing purposes.
 */
export function resetGreyFlowRegistry(): GreyFlowRegistry {
  globalRegistry = createGreyFlowRegistry();
  return globalRegistry;
}
