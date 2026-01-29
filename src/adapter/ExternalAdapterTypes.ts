/**
 * ExternalAdapterTypes.ts
 * Phase 34 - External Runtime Adapter Boundary (Engine-Safe)
 *
 * Type definitions for the external adapter system.
 * All types are:
 * - Branded IDs only
 * - Discriminated unions for payloads
 * - Integer-only numeric fields
 * - Explicit versioning
 */

// ============================================================================
// Branded Types
// ============================================================================

declare const AdapterIdBrand: unique symbol;
declare const ExportIdBrand: unique symbol;
declare const ExternalRefIdBrand: unique symbol;

/**
 * Branded type for adapter instance identifier.
 */
export type AdapterId = string & { readonly [AdapterIdBrand]: never };

/**
 * Branded type for export payload identifier.
 */
export type ExportId = string & { readonly [ExportIdBrand]: never };

/**
 * Branded type for external reference identifier.
 */
export type ExternalRefId = string & { readonly [ExternalRefIdBrand]: never };

// ============================================================================
// Type Guards
// ============================================================================

export function isAdapterId(value: string): value is AdapterId {
  return typeof value === 'string' && value.length > 0;
}

export function isExportId(value: string): value is ExportId {
  return typeof value === 'string' && value.length > 0;
}

export function isExternalRefId(value: string): value is ExternalRefId {
  return typeof value === 'string' && value.length > 0;
}

// ============================================================================
// Export Payload Types (Discriminated Union)
// ============================================================================

/**
 * Export payload type discriminator.
 */
export type ExportPayloadType =
  | 'LEDGER_SNAPSHOT'
  | 'REVENUE_SUMMARY'
  | 'EXTERNAL_VALUE_SUMMARY'
  | 'FULL_ENGINE_EXPORT';

/**
 * Base export payload with common fields.
 */
interface BaseExportPayload {
  readonly exportId: ExportId;
  readonly version: number;
  readonly createdAt: number;
  readonly checksum: string;
}

/**
 * Ledger snapshot export payload.
 */
export interface LedgerSnapshotPayload extends BaseExportPayload {
  readonly type: 'LEDGER_SNAPSHOT';
  readonly entryCount: number;
  readonly batchCount: number;
  readonly totalCredits: number;
  readonly totalDebits: number;
  readonly lastSequence: number;
  readonly lastEntryId: string;
}

/**
 * Revenue summary export payload.
 */
export interface RevenueSummaryPayload extends BaseExportPayload {
  readonly type: 'REVENUE_SUMMARY';
  readonly totalPlatformRevenue: number;
  readonly totalClubRevenue: number;
  readonly totalAgentCommission: number;
  readonly handCount: number;
  readonly tableCount: number;
  readonly clubCount: number;
}

/**
 * External value summary export payload.
 */
export interface ExternalValueSummaryPayload extends BaseExportPayload {
  readonly type: 'EXTERNAL_VALUE_SUMMARY';
  readonly totalReferences: number;
  readonly totalInAmount: number;
  readonly totalOutAmount: number;
  readonly netAmount: number;
  readonly linkedCount: number;
  readonly unlinkedCount: number;
}

/**
 * Full engine export payload.
 */
export interface FullEngineExportPayload extends BaseExportPayload {
  readonly type: 'FULL_ENGINE_EXPORT';
  readonly ledger: LedgerSnapshotPayload;
  readonly revenue: RevenueSummaryPayload;
  readonly externalValue: ExternalValueSummaryPayload;
}

/**
 * Union type for all export payloads.
 */
export type ExportPayload =
  | LedgerSnapshotPayload
  | RevenueSummaryPayload
  | ExternalValueSummaryPayload
  | FullEngineExportPayload;

// ============================================================================
// External Reference Types
// ============================================================================

/**
 * External reference source type.
 */
export type ExternalReferenceSource =
  | 'EXTERNAL_SYSTEM'
  | 'MANUAL_ENTRY'
  | 'RECONCILIATION'
  | 'AUDIT';

/**
 * External reference for injection into engine.
 * Validated but inert - does not modify engine state.
 */
export interface ExternalReference {
  readonly refId: ExternalRefId;
  readonly source: ExternalReferenceSource;
  readonly externalId: string;
  readonly amount: number;
  readonly createdAt: number;
  readonly metadata: Readonly<Record<string, unknown>>;
}

/**
 * Validation result for external reference.
 */
export interface ExternalReferenceValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly reference?: ExternalReference;
}

// ============================================================================
// Adapter State Types
// ============================================================================

/**
 * Adapter registration status.
 */
export type AdapterStatus = 'REGISTERED' | 'ENABLED' | 'DISABLED' | 'UNREGISTERED';

/**
 * Adapter registration info.
 */
export interface AdapterRegistration {
  readonly adapterId: AdapterId;
  readonly registeredAt: number;
  readonly status: AdapterStatus;
  readonly lastActivityAt: number;
  readonly exportCount: number;
  readonly referenceCount: number;
}

// ============================================================================
// Result Types
// ============================================================================

/**
 * Result of adapter registration.
 */
export interface AdapterRegistrationResult {
  readonly success: boolean;
  readonly adapterId?: AdapterId;
  readonly error?: string;
}

/**
 * Result of export operation.
 */
export interface ExportResult {
  readonly success: boolean;
  readonly exportId?: ExportId;
  readonly payload?: ExportPayload;
  readonly error?: string;
}

/**
 * Result of reference submission.
 */
export interface ReferenceSubmissionResult {
  readonly success: boolean;
  readonly refId?: ExternalRefId;
  readonly validation: ExternalReferenceValidationResult;
  readonly error?: string;
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate external reference input.
 * Returns structured result - never throws.
 */
export function validateExternalReference(
  input: Partial<ExternalReference>
): ExternalReferenceValidationResult {
  const errors: string[] = [];

  // Validate refId
  if (!input.refId || typeof input.refId !== 'string' || input.refId.length === 0) {
    errors.push('Reference ID must be a non-empty string');
  }

  // Validate source
  const validSources: ExternalReferenceSource[] = [
    'EXTERNAL_SYSTEM',
    'MANUAL_ENTRY',
    'RECONCILIATION',
    'AUDIT',
  ];
  if (!input.source || !validSources.includes(input.source)) {
    errors.push(`Source must be one of: ${validSources.join(', ')}`);
  }

  // Validate externalId
  if (!input.externalId || typeof input.externalId !== 'string') {
    errors.push('External ID must be a non-empty string');
  }

  // Validate amount is integer
  if (typeof input.amount !== 'number' || !Number.isInteger(input.amount)) {
    errors.push('Amount must be an integer');
  }

  // Validate createdAt
  if (typeof input.createdAt !== 'number' || !Number.isInteger(input.createdAt) || input.createdAt < 0) {
    errors.push('CreatedAt must be a non-negative integer');
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const reference: ExternalReference = {
    refId: input.refId as ExternalRefId,
    source: input.source as ExternalReferenceSource,
    externalId: input.externalId as string,
    amount: input.amount as number,
    createdAt: input.createdAt as number,
    metadata: Object.freeze(input.metadata ?? {}),
  };

  return {
    valid: true,
    errors: [],
    reference: Object.freeze(reference),
  };
}

// ============================================================================
// Checksum Utilities
// ============================================================================

/**
 * Calculate simple checksum for export payload.
 */
export function calculateExportChecksum(data: Record<string, unknown>): string {
  const str = JSON.stringify(data);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}
