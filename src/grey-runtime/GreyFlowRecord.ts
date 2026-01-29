/**
 * GreyFlowRecord.ts
 * Phase A - Grey Flow Settlement Runtime
 *
 * IMMUTABLE APPEND-ONLY FLOW RECORDS
 *
 * This module defines the core flow record structure.
 * Records are immutable after creation and hash-chained.
 *
 * @external This module operates OUTSIDE the frozen engine.
 * @readonly Records cannot be mutated after creation.
 */

import {
  GreyFlowId,
  GreySessionId,
  GreyParty,
  GreyFlowType,
  GreyFlowStatus,
  GreyFlowDirection,
  GreyResult,
  GreyError,
  GreyErrorCode,
  greySuccess,
  greyFailure,
  createGreyError,
  isValidNonNegativeInteger,
  isValidTimestamp,
  FORBIDDEN_CONCEPTS,
} from './GreyTypes';

// ============================================================================
// LINKED REFERENCE TYPE
// ============================================================================

/**
 * Reference to a ledger entry (read-only, never mutates ledger).
 * This is a string reference only - NOT the actual entry.
 */
export type LinkedLedgerEntryId = string & { readonly __brand: 'LinkedLedgerEntryId' };

/**
 * Create a linked ledger entry ID.
 */
export function createLinkedLedgerEntryId(id: string): LinkedLedgerEntryId {
  return id as LinkedLedgerEntryId;
}

// ============================================================================
// FLOW RECORD INPUT
// ============================================================================

/**
 * Input for creating a new flow record.
 * All fields except linkedLedgerEntryId are required.
 */
export interface GreyFlowRecordInput {
  readonly flowId: GreyFlowId;
  readonly sessionId: GreySessionId;
  readonly party: GreyParty;
  readonly type: GreyFlowType;
  readonly amount: number;
  readonly direction: GreyFlowDirection;
  readonly injectedTimestamp: number;
  readonly linkedLedgerEntryId?: LinkedLedgerEntryId;
  readonly description?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

// ============================================================================
// FLOW RECORD STRUCTURE
// ============================================================================

/**
 * Immutable grey flow record.
 * Once created, this record cannot be modified.
 * Contains a hash-chained checksum for integrity verification.
 */
export interface GreyFlowRecord {
  /** Unique flow identifier */
  readonly flowId: GreyFlowId;

  /** Session this flow belongs to */
  readonly sessionId: GreySessionId;

  /** Sequence number within the session */
  readonly sequence: number;

  /** Party affected by this flow */
  readonly party: GreyParty;

  /** Type of flow reference */
  readonly type: GreyFlowType;

  /** Amount (always non-negative integer) */
  readonly amount: number;

  /** Direction relative to party */
  readonly direction: GreyFlowDirection;

  /** Current status */
  readonly status: GreyFlowStatus;

  /** Injected timestamp (unix ms) */
  readonly injectedTimestamp: number;

  /** Optional reference to ledger entry (read-only) */
  readonly linkedLedgerEntryId?: LinkedLedgerEntryId;

  /** Optional description */
  readonly description?: string;

  /** Optional metadata */
  readonly metadata?: Readonly<Record<string, unknown>>;

  /** Hash of previous record (for chain integrity) */
  readonly previousHash: string;

  /** Checksum of this record (deterministic) */
  readonly checksum: string;
}

// ============================================================================
// CHECKSUM CALCULATION
// ============================================================================

/**
 * Calculate a deterministic checksum for data.
 * Uses a simple but deterministic hash function.
 *
 * @param data - Data to hash
 * @returns Deterministic checksum string
 */
export function calculateGreyChecksum(data: unknown): string {
  const str = serializeForChecksum(data);
  return simpleHash(str);
}

/**
 * Serialize data for checksum calculation.
 * Keys are sorted to ensure determinism.
 */
function serializeForChecksum(data: unknown): string {
  if (data === null || data === undefined) {
    return 'null';
  }

  if (typeof data === 'string') {
    return `"${data}"`;
  }

  if (typeof data === 'number' || typeof data === 'boolean') {
    return String(data);
  }

  if (Array.isArray(data)) {
    const items = data.map(serializeForChecksum);
    return `[${items.join(',')}]`;
  }

  if (typeof data === 'object') {
    const keys = Object.keys(data).sort();
    const pairs = keys.map(
      (key) => `"${key}":${serializeForChecksum((data as Record<string, unknown>)[key])}`
    );
    return `{${pairs.join(',')}}`;
  }

  return String(data);
}

/**
 * Simple deterministic hash function.
 * Not cryptographically secure but deterministic.
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

// ============================================================================
// FLOW RECORD CREATION
// ============================================================================

/**
 * Create an immutable grey flow record.
 * Validates all inputs and returns structured errors on failure.
 *
 * @param input - Flow record input
 * @param sequence - Sequence number in session
 * @param previousHash - Hash of previous record in chain
 * @returns Result containing the record or error
 */
export function createGreyFlowRecord(
  input: GreyFlowRecordInput,
  sequence: number,
  previousHash: string
): GreyResult<GreyFlowRecord> {
  // Validate required fields
  if (!input.flowId) {
    return greyFailure(
      createGreyError(GreyErrorCode.MISSING_REQUIRED_FIELD, 'flowId is required')
    );
  }

  if (!input.sessionId) {
    return greyFailure(
      createGreyError(GreyErrorCode.MISSING_REQUIRED_FIELD, 'sessionId is required')
    );
  }

  if (!input.party) {
    return greyFailure(
      createGreyError(GreyErrorCode.MISSING_REQUIRED_FIELD, 'party is required')
    );
  }

  if (!input.type) {
    return greyFailure(
      createGreyError(GreyErrorCode.MISSING_REQUIRED_FIELD, 'type is required')
    );
  }

  if (input.amount === undefined || input.amount === null) {
    return greyFailure(
      createGreyError(GreyErrorCode.MISSING_REQUIRED_FIELD, 'amount is required')
    );
  }

  if (!input.direction) {
    return greyFailure(
      createGreyError(GreyErrorCode.MISSING_REQUIRED_FIELD, 'direction is required')
    );
  }

  if (!input.injectedTimestamp) {
    return greyFailure(
      createGreyError(GreyErrorCode.MISSING_REQUIRED_FIELD, 'injectedTimestamp is required')
    );
  }

  // Validate amount is non-negative integer
  if (!isValidNonNegativeInteger(input.amount)) {
    if (!Number.isInteger(input.amount)) {
      return greyFailure(
        createGreyError(
          GreyErrorCode.NON_INTEGER_AMOUNT,
          `Amount must be an integer, got: ${input.amount}`,
          { amount: input.amount }
        )
      );
    }
    return greyFailure(
      createGreyError(
        GreyErrorCode.NEGATIVE_AMOUNT,
        `Amount must be non-negative, got: ${input.amount}`,
        { amount: input.amount }
      )
    );
  }

  // Validate timestamp
  if (!isValidTimestamp(input.injectedTimestamp)) {
    return greyFailure(
      createGreyError(
        GreyErrorCode.INVALID_TIMESTAMP,
        `Timestamp must be a positive integer, got: ${input.injectedTimestamp}`,
        { timestamp: input.injectedTimestamp }
      )
    );
  }

  // Validate sequence
  if (!isValidNonNegativeInteger(sequence)) {
    return greyFailure(
      createGreyError(
        GreyErrorCode.NON_INTEGER_AMOUNT,
        `Sequence must be a non-negative integer, got: ${sequence}`,
        { sequence }
      )
    );
  }

  // Validate description doesn't contain forbidden concepts
  if (input.description) {
    const lowerDesc = input.description.toLowerCase();
    for (const forbidden of FORBIDDEN_CONCEPTS) {
      if (lowerDesc.includes(forbidden)) {
        return greyFailure(
          createGreyError(
            GreyErrorCode.INVALID_FLOW_TYPE,
            `Description contains forbidden concept: ${forbidden}`,
            { forbidden, description: input.description }
          )
        );
      }
    }
  }

  // Validate flow type and party type combinations
  const validationResult = validateFlowTypePartyType(input.type, input.party.partyType);
  if (!validationResult.success) {
    return validationResult as GreyResult<GreyFlowRecord>;
  }

  // Validate flow type and direction combinations
  const directionResult = validateFlowTypeDirection(input.type, input.direction);
  if (!directionResult.success) {
    return directionResult as GreyResult<GreyFlowRecord>;
  }

  // Build the record (without checksum first)
  const recordData = {
    flowId: input.flowId,
    sessionId: input.sessionId,
    sequence,
    party: input.party,
    type: input.type,
    amount: input.amount,
    direction: input.direction,
    status: GreyFlowStatus.PENDING,
    injectedTimestamp: input.injectedTimestamp,
    linkedLedgerEntryId: input.linkedLedgerEntryId,
    description: input.description,
    metadata: input.metadata ? Object.freeze({ ...input.metadata }) : undefined,
    previousHash,
  };

  // Calculate checksum
  const checksum = calculateGreyChecksum(recordData);

  // Create frozen record
  const record: GreyFlowRecord = Object.freeze({
    ...recordData,
    checksum,
  });

  return greySuccess(record);
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Validate flow type and party type combinations.
 */
function validateFlowTypePartyType(
  flowType: GreyFlowType,
  partyType: string
): GreyResult<void> {
  // RAKE_REF can only go to CLUB, AGENT, or PLATFORM
  if (flowType === GreyFlowType.RAKE_REF) {
    if (partyType === 'PLAYER') {
      return greyFailure(
        createGreyError(
          GreyErrorCode.INVALID_PARTY_TYPE,
          'RAKE_REF cannot be assigned to PLAYER party',
          { flowType, partyType }
        )
      );
    }
  }

  // BUYIN_REF and CASHOUT_REF are typically for PLAYER
  // but we allow flexibility for club-level flows

  return greySuccess(undefined);
}

/**
 * Validate flow type and direction combinations.
 */
function validateFlowTypeDirection(
  flowType: GreyFlowType,
  direction: GreyFlowDirection
): GreyResult<void> {
  // BUYIN_REF is always IN (value coming in)
  if (flowType === GreyFlowType.BUYIN_REF && direction !== GreyFlowDirection.IN) {
    return greyFailure(
      createGreyError(
        GreyErrorCode.INVALID_DIRECTION,
        'BUYIN_REF must have direction IN',
        { flowType, direction }
      )
    );
  }

  // CASHOUT_REF is always OUT (value going out)
  if (flowType === GreyFlowType.CASHOUT_REF && direction !== GreyFlowDirection.OUT) {
    return greyFailure(
      createGreyError(
        GreyErrorCode.INVALID_DIRECTION,
        'CASHOUT_REF must have direction OUT',
        { flowType, direction }
      )
    );
  }

  // RAKE_REF is always IN (rake coming in to club/agent/platform)
  if (flowType === GreyFlowType.RAKE_REF && direction !== GreyFlowDirection.IN) {
    return greyFailure(
      createGreyError(
        GreyErrorCode.INVALID_DIRECTION,
        'RAKE_REF must have direction IN',
        { flowType, direction }
      )
    );
  }

  // ADJUST_REF can be either direction

  return greySuccess(undefined);
}

// ============================================================================
// STATUS TRANSITION
// ============================================================================

/**
 * Create a new record with updated status.
 * Returns a NEW record - does not mutate the original.
 *
 * @param record - Original record
 * @param newStatus - New status
 * @param newSequence - New sequence number
 * @param previousHash - Hash of previous record
 * @returns Result containing new record or error
 */
export function transitionFlowStatus(
  record: GreyFlowRecord,
  newStatus: GreyFlowStatus,
  newSequence: number,
  previousHash: string
): GreyResult<GreyFlowRecord> {
  // Validate status transitions
  const transitionResult = validateStatusTransition(record.status, newStatus);
  if (!transitionResult.success) {
    return transitionResult as GreyResult<GreyFlowRecord>;
  }

  // Build new record data
  const recordData = {
    flowId: record.flowId,
    sessionId: record.sessionId,
    sequence: newSequence,
    party: record.party,
    type: record.type,
    amount: record.amount,
    direction: record.direction,
    status: newStatus,
    injectedTimestamp: record.injectedTimestamp,
    linkedLedgerEntryId: record.linkedLedgerEntryId,
    description: record.description,
    metadata: record.metadata,
    previousHash,
  };

  // Calculate new checksum
  const checksum = calculateGreyChecksum(recordData);

  // Create frozen record
  const newRecord: GreyFlowRecord = Object.freeze({
    ...recordData,
    checksum,
  });

  return greySuccess(newRecord);
}

/**
 * Validate status transition.
 */
function validateStatusTransition(
  currentStatus: GreyFlowStatus,
  newStatus: GreyFlowStatus
): GreyResult<void> {
  // PENDING can go to CONFIRMED or VOID
  if (currentStatus === GreyFlowStatus.PENDING) {
    if (newStatus === GreyFlowStatus.CONFIRMED || newStatus === GreyFlowStatus.VOID) {
      return greySuccess(undefined);
    }
    return greyFailure(
      createGreyError(
        GreyErrorCode.INVALID_STATUS_TRANSITION,
        `Cannot transition from PENDING to ${newStatus}`,
        { currentStatus, newStatus }
      )
    );
  }

  // CONFIRMED cannot be changed
  if (currentStatus === GreyFlowStatus.CONFIRMED) {
    return greyFailure(
      createGreyError(
        GreyErrorCode.INVALID_STATUS_TRANSITION,
        'Cannot transition from CONFIRMED status',
        { currentStatus, newStatus }
      )
    );
  }

  // VOID cannot be changed
  if (currentStatus === GreyFlowStatus.VOID) {
    return greyFailure(
      createGreyError(
        GreyErrorCode.INVALID_STATUS_TRANSITION,
        'Cannot transition from VOID status',
        { currentStatus, newStatus }
      )
    );
  }

  return greyFailure(
    createGreyError(
      GreyErrorCode.INVALID_STATUS_TRANSITION,
      `Unknown status: ${currentStatus}`,
      { currentStatus, newStatus }
    )
  );
}

// ============================================================================
// INTEGRITY VERIFICATION
// ============================================================================

/**
 * Verify a flow record's checksum.
 *
 * @param record - Record to verify
 * @returns True if checksum is valid
 */
export function verifyFlowRecordChecksum(record: GreyFlowRecord): boolean {
  // Rebuild the data without checksum
  const recordData = {
    flowId: record.flowId,
    sessionId: record.sessionId,
    sequence: record.sequence,
    party: record.party,
    type: record.type,
    amount: record.amount,
    direction: record.direction,
    status: record.status,
    injectedTimestamp: record.injectedTimestamp,
    linkedLedgerEntryId: record.linkedLedgerEntryId,
    description: record.description,
    metadata: record.metadata,
    previousHash: record.previousHash,
  };

  const expectedChecksum = calculateGreyChecksum(recordData);
  return record.checksum === expectedChecksum;
}

/**
 * Verify chain integrity between two records.
 *
 * @param current - Current record
 * @param previous - Previous record in chain
 * @returns True if chain is valid
 */
export function verifyChainIntegrity(
  current: GreyFlowRecord,
  previous: GreyFlowRecord
): boolean {
  return current.previousHash === previous.checksum;
}

// ============================================================================
// GENESIS HASH
// ============================================================================

/**
 * Genesis hash for the first record in a chain.
 */
export const GENESIS_HASH = '00000000' as const;
