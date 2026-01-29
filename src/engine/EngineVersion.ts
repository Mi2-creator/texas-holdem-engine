/**
 * EngineVersion.ts
 * Phase 36 - Engine Finalization & Freeze
 *
 * Provides read-only engine version and metadata.
 * All version information is deterministic and frozen.
 *
 * @final This file must not be modified after Phase 36.
 * @sealed No new exports may be added.
 */

// ============================================================================
// Version Constants
// ============================================================================

/**
 * Engine semantic version.
 * Format: MAJOR.MINOR.PATCH
 *
 * - MAJOR: Breaking changes to public API
 * - MINOR: New features (none expected - engine is frozen)
 * - PATCH: Bug fixes only
 *
 * @final
 */
export const ENGINE_VERSION = '1.0.0' as const;

/**
 * Engine version major component.
 * @final
 */
export const ENGINE_VERSION_MAJOR = 1 as const;

/**
 * Engine version minor component.
 * @final
 */
export const ENGINE_VERSION_MINOR = 0 as const;

/**
 * Engine version patch component.
 * @final
 */
export const ENGINE_VERSION_PATCH = 0 as const;

/**
 * Build metadata identifier.
 * Format: phase-{phase_number}
 * @final
 */
export const ENGINE_BUILD_METADATA = 'phase-36' as const;

/**
 * Commit hash placeholder.
 * In production, this would be injected at build time.
 * @final
 */
export const ENGINE_COMMIT_HASH = 'finalized' as const;

// ============================================================================
// Version Types
// ============================================================================

/**
 * Engine version information structure.
 * @sealed
 */
export interface EngineVersionInfo {
  readonly version: string;
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  readonly buildMetadata: string;
  readonly commitHash: string;
  readonly frozen: boolean;
  readonly phaseNumber: number;
  readonly finalizedAt: string;
}

/**
 * Engine capability flags.
 * Documents what the engine can and cannot do.
 * @sealed
 */
export interface EngineCapabilities {
  readonly deterministic: true;
  readonly replayable: true;
  readonly immutableState: true;
  readonly appendOnlyLedger: true;
  readonly hashChainVerification: true;
  readonly sidePotCalculation: true;
  readonly rakeCalculation: true;
  readonly revenueAttribution: true;
  readonly externalAdapterSupport: true;
  readonly mutationGuards: true;
}

/**
 * Engine restrictions documentation.
 * Documents what the engine explicitly does NOT support.
 * @sealed
 */
export interface EngineRestrictions {
  readonly noPayments: true;
  readonly noWallets: true;
  readonly noCrypto: true;
  readonly noTransfers: true;
  readonly noBalances: true;
  readonly noClocks: true;
  readonly noIO: true;
  readonly noAsync: true;
  readonly noRandomness: true;
  readonly noNetworkCalls: true;
  readonly noDatabaseAccess: true;
}

// ============================================================================
// Frozen Metadata Objects
// ============================================================================

/**
 * Engine version information.
 * Immutable and frozen.
 * @final
 */
export const ENGINE_VERSION_INFO: EngineVersionInfo = Object.freeze({
  version: ENGINE_VERSION,
  major: ENGINE_VERSION_MAJOR,
  minor: ENGINE_VERSION_MINOR,
  patch: ENGINE_VERSION_PATCH,
  buildMetadata: ENGINE_BUILD_METADATA,
  commitHash: ENGINE_COMMIT_HASH,
  frozen: true,
  phaseNumber: 36,
  finalizedAt: '2024-01-29',
});

/**
 * Engine capabilities.
 * Immutable and frozen.
 * @final
 */
export const ENGINE_CAPABILITIES: EngineCapabilities = Object.freeze({
  deterministic: true,
  replayable: true,
  immutableState: true,
  appendOnlyLedger: true,
  hashChainVerification: true,
  sidePotCalculation: true,
  rakeCalculation: true,
  revenueAttribution: true,
  externalAdapterSupport: true,
  mutationGuards: true,
});

/**
 * Engine restrictions.
 * Immutable and frozen.
 * @final
 */
export const ENGINE_RESTRICTIONS: EngineRestrictions = Object.freeze({
  noPayments: true,
  noWallets: true,
  noCrypto: true,
  noTransfers: true,
  noBalances: true,
  noClocks: true,
  noIO: true,
  noAsync: true,
  noRandomness: true,
  noNetworkCalls: true,
  noDatabaseAccess: true,
});

// ============================================================================
// Version Utilities
// ============================================================================

/**
 * Get full version string with metadata.
 * Example: "1.0.0+phase-36"
 * @final
 */
export function getFullVersionString(): string {
  return `${ENGINE_VERSION}+${ENGINE_BUILD_METADATA}`;
}

/**
 * Get version info object.
 * Returns frozen, immutable object.
 * @final
 */
export function getEngineVersionInfo(): Readonly<EngineVersionInfo> {
  return ENGINE_VERSION_INFO;
}

/**
 * Get engine capabilities.
 * Returns frozen, immutable object.
 * @final
 */
export function getEngineCapabilities(): Readonly<EngineCapabilities> {
  return ENGINE_CAPABILITIES;
}

/**
 * Get engine restrictions.
 * Returns frozen, immutable object.
 * @final
 */
export function getEngineRestrictions(): Readonly<EngineRestrictions> {
  return ENGINE_RESTRICTIONS;
}

/**
 * Check if engine version matches expected.
 * @final
 */
export function isVersionMatch(expectedVersion: string): boolean {
  return ENGINE_VERSION === expectedVersion;
}

/**
 * Check if engine is at or above minimum version.
 * @final
 */
export function meetsMinimumVersion(minMajor: number, minMinor: number, minPatch: number): boolean {
  if (ENGINE_VERSION_MAJOR > minMajor) return true;
  if (ENGINE_VERSION_MAJOR < minMajor) return false;
  if (ENGINE_VERSION_MINOR > minMinor) return true;
  if (ENGINE_VERSION_MINOR < minMinor) return false;
  return ENGINE_VERSION_PATCH >= minPatch;
}

// ============================================================================
// Version Verification
// ============================================================================

/**
 * Verify engine version integrity.
 * Ensures version constants are consistent.
 * @final
 */
export function verifyVersionIntegrity(): { valid: boolean; errors: readonly string[] } {
  const errors: string[] = [];

  // Check version string matches components
  const expectedVersion = `${ENGINE_VERSION_MAJOR}.${ENGINE_VERSION_MINOR}.${ENGINE_VERSION_PATCH}`;
  if (ENGINE_VERSION !== expectedVersion) {
    errors.push(`Version string mismatch: ${ENGINE_VERSION} !== ${expectedVersion}`);
  }

  // Check version info matches constants
  if (ENGINE_VERSION_INFO.version !== ENGINE_VERSION) {
    errors.push('Version info version mismatch');
  }
  if (ENGINE_VERSION_INFO.major !== ENGINE_VERSION_MAJOR) {
    errors.push('Version info major mismatch');
  }
  if (ENGINE_VERSION_INFO.minor !== ENGINE_VERSION_MINOR) {
    errors.push('Version info minor mismatch');
  }
  if (ENGINE_VERSION_INFO.patch !== ENGINE_VERSION_PATCH) {
    errors.push('Version info patch mismatch');
  }

  // Check frozen state
  if (!ENGINE_VERSION_INFO.frozen) {
    errors.push('Engine should be marked as frozen');
  }

  // Check objects are actually frozen
  if (!Object.isFrozen(ENGINE_VERSION_INFO)) {
    errors.push('ENGINE_VERSION_INFO is not frozen');
  }
  if (!Object.isFrozen(ENGINE_CAPABILITIES)) {
    errors.push('ENGINE_CAPABILITIES is not frozen');
  }
  if (!Object.isFrozen(ENGINE_RESTRICTIONS)) {
    errors.push('ENGINE_RESTRICTIONS is not frozen');
  }

  return {
    valid: errors.length === 0,
    errors: Object.freeze(errors),
  };
}
