/**
 * Admin Credit Module
 * Phase 29 - Admin Credit (Manual Top-Up) System
 *
 * This module provides a human-admin–initiated credit mechanism for:
 * - Cash-in handled off-system
 * - Testing / staging
 * - Grey-operation deployment
 * - Customer support adjustments
 *
 * ARCHITECTURAL DESIGN:
 * Admin Credit = a privileged producer of TopUpIntent
 *
 * Flow: AdminAction → AdminCreditIntent → TopUpBoundary → Ledger
 *
 * HARD CONSTRAINTS:
 * - NOT a payment system
 * - NOT automated
 * - NOT exposed to players
 * - NO rake or revenue attribution
 * - ALL credits go through Phase 28 TopUpBoundary
 * - ALL credits are auditable and attributable
 *
 * This module does NOT:
 * - Process payments
 * - Handle currencies
 * - Create revenue entries
 * - Bypass ledger invariants
 */

// Types
export {
  // Branded types
  AdminId,
  AdminCreditIntentId,
  generateAdminCreditIntentId,
  resetAdminCreditCounters,

  // Reason enum
  AdminCreditReason,
  ADMIN_CREDIT_REASONS,
  isValidAdminCreditReason,

  // Error types
  AdminCreditErrorCode,
  AdminCreditError,

  // Result types
  AdminCreditValidationResult,
  AdminCreditResult,
  AdminCreditQueryResult,

  // Query types
  AdminCreditTimeWindow,

  // Summary types
  AdminCreditSummary,
  PlayerCreditSummary,
  ReasonCreditSummary,

  // Factory helpers
  validAdminCreditResult,
  invalidAdminCreditResult,
  createAdminCreditError,
  successAdminCreditResult,
  failAdminCreditResult,
  duplicateAdminCreditResult,
  emptyReasonBreakdown,
} from './AdminCreditTypes';

// Intent
export {
  AdminCreditIntent,
  AdminCreditIntentInput,
  createAdminCreditIntent,
  createAdminCreditIntentWithTimestamp,
  adminCreditIntentToString,
  hasTableContext,
} from './AdminCreditIntent';

// Policy
export {
  AdminCreditPolicy,
  AdminCreditPolicyConfig,
  DEFAULT_ADMIN_CREDIT_POLICY_CONFIG,
  createAdminCreditPolicy,
} from './AdminCreditPolicy';

// Service
export {
  AdminCreditService,
  createAdminCreditService,
} from './AdminCreditService';

// View
export {
  AdminCreditView,
  createAdminCreditView,
} from './AdminCreditView';
