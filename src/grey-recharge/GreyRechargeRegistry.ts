/**
 * GreyRechargeRegistry.ts
 * Phase A3 - Grey Recharge Reference Mapping
 *
 * APPEND-ONLY RECHARGE REFERENCE REGISTRY
 *
 * This module provides an append-only registry for recharge references.
 * All operations are REFERENCE-ONLY - no value movement.
 *
 * @external This module operates OUTSIDE the frozen engine.
 * @readonly This module NEVER mutates GreyFlow or Attribution data.
 * @reference This module creates REFERENCES only, no value movement.
 * @append-only Records can only be added, never removed or modified.
 */

import { GreyPartyId } from '../grey-runtime';

import {
  GreyRechargeId,
  GreyRechargeRecord,
  GreyRechargeRecordInput,
  GreyRechargeSource,
  GreyRechargeStatus,
  RechargeResult,
  RechargeError,
  RechargeErrorCode,
  rechargeSuccess,
  rechargeFailure,
  createRechargeError,
  isValidNonNegativeInteger,
  isValidTimestamp,
  RECHARGE_GENESIS_HASH,
} from './GreyRechargeTypes';

// ============================================================================
// CHECKSUM CALCULATION
// ============================================================================

/**
 * Calculate checksum for a recharge record.
 */
function calculateRecordChecksum(
  rechargeId: GreyRechargeId,
  source: GreyRechargeSource,
  status: GreyRechargeStatus,
  partyId: GreyPartyId,
  referenceAmount: number,
  sequence: number,
  declaredTimestamp: number,
  previousChecksum: string
): string {
  const data = [
    `id:${rechargeId}`,
    `src:${source}`,
    `st:${status}`,
    `party:${partyId}`,
    `amt:${referenceAmount}`,
    `seq:${sequence}`,
    `ts:${declaredTimestamp}`,
    `prev:${previousChecksum}`,
  ].join('|');

  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }

  return `rch_${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

// ============================================================================
// RECORD CREATION
// ============================================================================

/**
 * Create a recharge record from input.
 */
export function createGreyRechargeRecord(
  input: GreyRechargeRecordInput,
  sequence: number,
  previousChecksum: string
): RechargeResult<GreyRechargeRecord> {
  // Validate reference amount
  if (!isValidNonNegativeInteger(input.referenceAmount)) {
    return rechargeFailure(
      createRechargeError(
        RechargeErrorCode.INVALID_REFERENCE_AMOUNT,
        `Reference amount must be a non-negative integer, got: ${input.referenceAmount}`,
        { referenceAmount: input.referenceAmount }
      )
    );
  }

  // Validate timestamp
  if (!isValidTimestamp(input.declaredTimestamp)) {
    return rechargeFailure(
      createRechargeError(
        RechargeErrorCode.INVALID_TIMESTAMP,
        `Declared timestamp must be a positive integer, got: ${input.declaredTimestamp}`,
        { declaredTimestamp: input.declaredTimestamp }
      )
    );
  }

  // Validate sequence
  if (!Number.isInteger(sequence) || sequence < 0) {
    return rechargeFailure(
      createRechargeError(
        RechargeErrorCode.NON_INTEGER_VALUE,
        `Sequence must be a non-negative integer, got: ${sequence}`,
        { sequence }
      )
    );
  }

  // Calculate checksum
  const checksum = calculateRecordChecksum(
    input.rechargeId,
    input.source,
    GreyRechargeStatus.DECLARED,
    input.partyId,
    input.referenceAmount,
    sequence,
    input.declaredTimestamp,
    previousChecksum
  );

  const record: GreyRechargeRecord = Object.freeze({
    rechargeId: input.rechargeId,
    source: input.source,
    status: GreyRechargeStatus.DECLARED,
    partyId: input.partyId,
    referenceAmount: input.referenceAmount,
    externalReferenceId: input.externalReferenceId,
    sequence,
    declaredTimestamp: input.declaredTimestamp,
    description: input.description,
    metadata: input.metadata ? Object.freeze({ ...input.metadata }) : undefined,
    checksum,
    previousChecksum,
  });

  return rechargeSuccess(record);
}

/**
 * Create a status transition record.
 */
export function transitionRechargeStatus(
  original: GreyRechargeRecord,
  newStatus: GreyRechargeStatus,
  transitionTimestamp: number,
  newSequence: number,
  previousChecksum: string
): RechargeResult<GreyRechargeRecord> {
  // Validate status transition
  if (original.status === GreyRechargeStatus.VOIDED) {
    return rechargeFailure(
      createRechargeError(
        RechargeErrorCode.INVALID_STATUS_TRANSITION,
        `Cannot transition from VOIDED status`,
        { currentStatus: original.status, newStatus }
      )
    );
  }

  if (original.status === GreyRechargeStatus.CONFIRMED && newStatus === GreyRechargeStatus.DECLARED) {
    return rechargeFailure(
      createRechargeError(
        RechargeErrorCode.INVALID_STATUS_TRANSITION,
        `Cannot transition from CONFIRMED to DECLARED`,
        { currentStatus: original.status, newStatus }
      )
    );
  }

  // Validate timestamp
  if (!isValidTimestamp(transitionTimestamp)) {
    return rechargeFailure(
      createRechargeError(
        RechargeErrorCode.INVALID_TIMESTAMP,
        `Transition timestamp must be a positive integer, got: ${transitionTimestamp}`,
        { transitionTimestamp }
      )
    );
  }

  // Calculate new checksum
  const checksum = calculateRecordChecksum(
    original.rechargeId,
    original.source,
    newStatus,
    original.partyId,
    original.referenceAmount,
    newSequence,
    original.declaredTimestamp,
    previousChecksum
  );

  const record: GreyRechargeRecord = Object.freeze({
    ...original,
    status: newStatus,
    sequence: newSequence,
    confirmedTimestamp: newStatus === GreyRechargeStatus.CONFIRMED ? transitionTimestamp : original.confirmedTimestamp,
    voidedTimestamp: newStatus === GreyRechargeStatus.VOIDED ? transitionTimestamp : original.voidedTimestamp,
    checksum,
    previousChecksum,
  });

  return rechargeSuccess(record);
}

// ============================================================================
// REGISTRY CLASS
// ============================================================================

/**
 * Append result for registry operations.
 */
export interface AppendRechargeResult {
  readonly record: GreyRechargeRecord;
  readonly sequence: number;
}

/**
 * Confirm result for registry operations.
 */
export interface ConfirmRechargeResult {
  readonly originalRecord: GreyRechargeRecord;
  readonly confirmedRecord: GreyRechargeRecord;
}

/**
 * Void result for registry operations.
 */
export interface VoidRechargeResult {
  readonly originalRecord: GreyRechargeRecord;
  readonly voidedRecord: GreyRechargeRecord;
}

/**
 * Registry integrity result.
 */
export interface RechargeRegistryIntegrity {
  readonly isValid: boolean;
  readonly totalRecords: number;
  readonly errors: readonly string[];
}

/**
 * Append-only registry for recharge reference records.
 *
 * Features:
 * - Enforces idempotency (rejects duplicate recharge IDs)
 * - Rejects invalid amounts and timestamps
 * - Maintains hash chain integrity
 * - Returns structured errors (never throws)
 * - NEVER modifies GreyFlow or Attribution data
 */
export class GreyRechargeRegistry {
  private readonly records: GreyRechargeRecord[] = [];
  private readonly rechargeIndex: Map<GreyRechargeId, GreyRechargeRecord> = new Map();
  private sequence: number = 0;
  private lastChecksum: string = RECHARGE_GENESIS_HASH;

  /**
   * Append a new recharge reference to the registry.
   */
  appendRecharge(input: GreyRechargeRecordInput): RechargeResult<AppendRechargeResult> {
    // Check for duplicate (idempotency)
    if (this.rechargeIndex.has(input.rechargeId)) {
      return rechargeFailure(
        createRechargeError(
          RechargeErrorCode.DUPLICATE_RECHARGE_ID,
          `Recharge ID already exists: ${input.rechargeId}`,
          { rechargeId: input.rechargeId }
        )
      );
    }

    // Create the record
    const recordResult = createGreyRechargeRecord(
      input,
      this.sequence,
      this.lastChecksum
    );

    if (!recordResult.success) {
      return rechargeFailure(recordResult.error);
    }

    const record = recordResult.value;

    // Append to registry
    this.records.push(record);
    this.rechargeIndex.set(input.rechargeId, record);
    this.lastChecksum = record.checksum;
    this.sequence++;

    return rechargeSuccess({
      record,
      sequence: record.sequence,
    });
  }

  /**
   * Confirm a declared recharge reference.
   */
  confirmRecharge(
    rechargeId: GreyRechargeId,
    confirmedTimestamp: number
  ): RechargeResult<ConfirmRechargeResult> {
    const record = this.rechargeIndex.get(rechargeId);
    if (!record) {
      return rechargeFailure(
        createRechargeError(
          RechargeErrorCode.RECHARGE_NOT_FOUND,
          `Recharge not found: ${rechargeId}`,
          { rechargeId }
        )
      );
    }

    if (record.status !== GreyRechargeStatus.DECLARED) {
      return rechargeFailure(
        createRechargeError(
          RechargeErrorCode.INVALID_STATUS_TRANSITION,
          `Recharge is not DECLARED: ${rechargeId}`,
          { rechargeId, currentStatus: record.status }
        )
      );
    }

    // Create confirmed record
    const confirmedResult = transitionRechargeStatus(
      record,
      GreyRechargeStatus.CONFIRMED,
      confirmedTimestamp,
      this.sequence,
      this.lastChecksum
    );

    if (!confirmedResult.success) {
      return rechargeFailure(confirmedResult.error);
    }

    const confirmedRecord = confirmedResult.value;

    // Append to registry (new record, preserves append-only)
    this.records.push(confirmedRecord);
    this.rechargeIndex.set(rechargeId, confirmedRecord);
    this.lastChecksum = confirmedRecord.checksum;
    this.sequence++;

    return rechargeSuccess({
      originalRecord: record,
      confirmedRecord,
    });
  }

  /**
   * Void a recharge reference.
   */
  voidRecharge(
    rechargeId: GreyRechargeId,
    voidedTimestamp: number
  ): RechargeResult<VoidRechargeResult> {
    const record = this.rechargeIndex.get(rechargeId);
    if (!record) {
      return rechargeFailure(
        createRechargeError(
          RechargeErrorCode.RECHARGE_NOT_FOUND,
          `Recharge not found: ${rechargeId}`,
          { rechargeId }
        )
      );
    }

    if (record.status === GreyRechargeStatus.VOIDED) {
      return rechargeFailure(
        createRechargeError(
          RechargeErrorCode.INVALID_STATUS_TRANSITION,
          `Recharge already voided: ${rechargeId}`,
          { rechargeId }
        )
      );
    }

    // Create voided record
    const voidedResult = transitionRechargeStatus(
      record,
      GreyRechargeStatus.VOIDED,
      voidedTimestamp,
      this.sequence,
      this.lastChecksum
    );

    if (!voidedResult.success) {
      return rechargeFailure(voidedResult.error);
    }

    const voidedRecord = voidedResult.value;

    // Append to registry (new record, preserves append-only)
    this.records.push(voidedRecord);
    this.rechargeIndex.set(rechargeId, voidedRecord);
    this.lastChecksum = voidedRecord.checksum;
    this.sequence++;

    return rechargeSuccess({
      originalRecord: record,
      voidedRecord,
    });
  }

  /**
   * Get a recharge reference by ID.
   */
  getRecharge(rechargeId: GreyRechargeId): GreyRechargeRecord | undefined {
    return this.rechargeIndex.get(rechargeId);
  }

  /**
   * Get all records (including status transitions).
   */
  getAllRecords(): readonly GreyRechargeRecord[] {
    return Object.freeze([...this.records]);
  }

  /**
   * Get effective records (latest status for each recharge ID).
   */
  getEffectiveRecords(): readonly GreyRechargeRecord[] {
    return Object.freeze(Array.from(this.rechargeIndex.values()));
  }

  /**
   * Get records by party ID.
   */
  getRecordsByParty(partyId: GreyPartyId): readonly GreyRechargeRecord[] {
    return Object.freeze(
      Array.from(this.rechargeIndex.values()).filter(
        (r) => r.partyId === partyId
      )
    );
  }

  /**
   * Get records by status.
   */
  getRecordsByStatus(status: GreyRechargeStatus): readonly GreyRechargeRecord[] {
    return Object.freeze(
      Array.from(this.rechargeIndex.values()).filter(
        (r) => r.status === status
      )
    );
  }

  /**
   * Get records by source.
   */
  getRecordsBySource(source: GreyRechargeSource): readonly GreyRechargeRecord[] {
    return Object.freeze(
      Array.from(this.rechargeIndex.values()).filter(
        (r) => r.source === source
      )
    );
  }

  /**
   * Get records within a time window.
   */
  getRecordsByTimeWindow(
    startTimestamp: number,
    endTimestamp: number
  ): readonly GreyRechargeRecord[] {
    return Object.freeze(
      Array.from(this.rechargeIndex.values()).filter(
        (r) =>
          r.declaredTimestamp >= startTimestamp &&
          r.declaredTimestamp <= endTimestamp
      )
    );
  }

  /**
   * Get the current sequence number.
   */
  getCurrentSequence(): number {
    return this.sequence;
  }

  /**
   * Get the last checksum.
   */
  getLastChecksum(): string {
    return this.lastChecksum;
  }

  /**
   * Verify registry integrity.
   */
  verifyIntegrity(): RechargeRegistryIntegrity {
    const errors: string[] = [];

    // Verify hash chain
    let expectedPreviousChecksum: string = RECHARGE_GENESIS_HASH;
    for (let i = 0; i < this.records.length; i++) {
      const record = this.records[i];

      if (record.previousChecksum !== expectedPreviousChecksum) {
        errors.push(
          `Record ${i} has invalid previousChecksum: expected ${expectedPreviousChecksum}, got ${record.previousChecksum}`
        );
      }

      expectedPreviousChecksum = record.checksum;
    }

    return Object.freeze({
      isValid: errors.length === 0,
      totalRecords: this.records.length,
      errors: Object.freeze(errors),
    });
  }
}

/**
 * Create a new recharge registry.
 */
export function createGreyRechargeRegistry(): GreyRechargeRegistry {
  return new GreyRechargeRegistry();
}
