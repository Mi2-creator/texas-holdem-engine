/**
 * Engine Module
 * Phase 36 - Engine Finalization & Freeze
 *
 * FINALIZED ENGINE EXPORTS
 *
 * This module re-exports the complete public API surface.
 * All exports are frozen and sealed.
 *
 * @final This file must not be modified after Phase 36.
 * @sealed No new exports may be added.
 *
 * ENGINE LOGIC MUST NEVER BE MODIFIED AFTER THIS PHASE.
 */

// ============================================================================
// PUBLIC API (Re-export all public symbols)
// ============================================================================

export * from './PublicAPI';

// ============================================================================
// MODULE DOCUMENTATION
// ============================================================================

/**
 * Engine module description.
 * @final
 */
export const ENGINE_MODULE_INFO = Object.freeze({
  name: 'Texas Hold\'em Engine',
  version: '1.0.0',
  phase: 36,
  status: 'FROZEN',
  description: 'Deterministic, replay-safe poker game engine',

  modules: Object.freeze([
    'EngineVersion - Version and metadata',
    'EngineFreezeDeclaration - Freeze status and constraints',
    'PublicAPI - Complete public API surface',
  ]),

  externalDependencies: Object.freeze([
    '../game/service - GameService entry point',
    '../economy - EconomyEngine and chip operations',
    '../ledger - LedgerView and revenue attribution',
    '../external-adapter - External adapter interfaces',
    '../security - Identity and audit types',
  ]),

  guarantees: Object.freeze([
    'Deterministic execution',
    'Replay safety',
    'Immutable state',
    'Append-only ledger',
    'Hash chain verification',
    'Revenue = rake only',
  ]),

  restrictions: Object.freeze([
    'No payments/wallets/crypto',
    'No transfers/deposits/withdrawals',
    'No clocks/IO/async',
    'No randomness',
    'No mutations via adapters',
  ]),
});
