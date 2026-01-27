/**
 * Identity.ts
 * Phase 13 - Player identity and verification
 *
 * Manages player identity binding and verification.
 */

import { SecurityErrors, SecurityRejectCode } from './SecurityErrors';

// ============================================================================
// Types
// ============================================================================

export type PlayerId = string;
export type SessionId = string;
export type DeviceId = string;

export interface PlayerIdentity {
  readonly playerId: PlayerId;
  readonly displayName: string;
  readonly avatarUrl?: string;
  readonly createdAt: number;
  readonly lastSeenAt: number;
  readonly deviceFingerprint?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface IdentityBinding {
  readonly playerId: PlayerId;
  readonly sessionId: SessionId;
  readonly boundAt: number;
  readonly deviceId?: DeviceId;
  readonly ipAddress?: string;
  readonly userAgent?: string;
}

export interface IdentityVerificationResult {
  readonly valid: boolean;
  readonly playerId?: PlayerId;
  readonly reason?: string;
}

// ============================================================================
// Identity Registry
// ============================================================================

export class IdentityRegistry {
  private identities: Map<PlayerId, PlayerIdentity>;
  private bindings: Map<SessionId, IdentityBinding>;
  private playerBindings: Map<PlayerId, SessionId>;

  constructor() {
    this.identities = new Map();
    this.bindings = new Map();
    this.playerBindings = new Map();
  }

  /**
   * Register a new player identity
   */
  registerIdentity(
    playerId: PlayerId,
    displayName: string,
    options?: {
      avatarUrl?: string;
      deviceFingerprint?: string;
      metadata?: Record<string, unknown>;
    }
  ): PlayerIdentity {
    if (this.identities.has(playerId)) {
      throw SecurityErrors.duplicatePlayerId(playerId);
    }

    const now = Date.now();
    const identity: PlayerIdentity = {
      playerId,
      displayName,
      avatarUrl: options?.avatarUrl,
      createdAt: now,
      lastSeenAt: now,
      deviceFingerprint: options?.deviceFingerprint,
      metadata: options?.metadata,
    };

    this.identities.set(playerId, identity);
    return identity;
  }

  /**
   * Get player identity
   */
  getIdentity(playerId: PlayerId): PlayerIdentity | null {
    return this.identities.get(playerId) ?? null;
  }

  /**
   * Update player identity
   */
  updateIdentity(
    playerId: PlayerId,
    updates: Partial<Omit<PlayerIdentity, 'playerId' | 'createdAt'>>
  ): PlayerIdentity {
    const existing = this.identities.get(playerId);
    if (!existing) {
      throw SecurityErrors.playerNotFound(playerId);
    }

    const updated: PlayerIdentity = {
      ...existing,
      ...updates,
      lastSeenAt: Date.now(),
    };

    this.identities.set(playerId, updated);
    return updated;
  }

  /**
   * Remove player identity
   */
  removeIdentity(playerId: PlayerId): void {
    const sessionId = this.playerBindings.get(playerId);
    if (sessionId) {
      this.bindings.delete(sessionId);
      this.playerBindings.delete(playerId);
    }
    this.identities.delete(playerId);
  }

  /**
   * Bind a session to a player identity
   */
  bindSession(
    playerId: PlayerId,
    sessionId: SessionId,
    options?: {
      deviceId?: DeviceId;
      ipAddress?: string;
      userAgent?: string;
    }
  ): IdentityBinding {
    const identity = this.identities.get(playerId);
    if (!identity) {
      throw SecurityErrors.playerNotFound(playerId);
    }

    // Check for existing session
    const existingSessionId = this.playerBindings.get(playerId);
    if (existingSessionId && existingSessionId !== sessionId) {
      // Remove old binding
      this.bindings.delete(existingSessionId);
    }

    const binding: IdentityBinding = {
      playerId,
      sessionId,
      boundAt: Date.now(),
      deviceId: options?.deviceId,
      ipAddress: options?.ipAddress,
      userAgent: options?.userAgent,
    };

    this.bindings.set(sessionId, binding);
    this.playerBindings.set(playerId, sessionId);

    // Update last seen
    this.updateIdentity(playerId, {});

    return binding;
  }

  /**
   * Unbind a session
   */
  unbindSession(sessionId: SessionId): void {
    const binding = this.bindings.get(sessionId);
    if (binding) {
      this.playerBindings.delete(binding.playerId);
      this.bindings.delete(sessionId);
    }
  }

  /**
   * Get binding by session ID
   */
  getBinding(sessionId: SessionId): IdentityBinding | null {
    return this.bindings.get(sessionId) ?? null;
  }

  /**
   * Get binding by player ID
   */
  getBindingByPlayer(playerId: PlayerId): IdentityBinding | null {
    const sessionId = this.playerBindings.get(playerId);
    if (!sessionId) return null;
    return this.bindings.get(sessionId) ?? null;
  }

  /**
   * Verify session belongs to player
   */
  verifySessionOwnership(
    sessionId: SessionId,
    playerId: PlayerId
  ): IdentityVerificationResult {
    const binding = this.bindings.get(sessionId);

    if (!binding) {
      return {
        valid: false,
        reason: 'Session not bound to any identity',
      };
    }

    if (binding.playerId !== playerId) {
      return {
        valid: false,
        reason: 'Session belongs to different player',
      };
    }

    return {
      valid: true,
      playerId: binding.playerId,
    };
  }

  /**
   * Verify player identity with device fingerprint
   */
  verifyDeviceFingerprint(
    playerId: PlayerId,
    fingerprint: string
  ): IdentityVerificationResult {
    const identity = this.identities.get(playerId);

    if (!identity) {
      return {
        valid: false,
        reason: 'Player not found',
      };
    }

    if (!identity.deviceFingerprint) {
      // No fingerprint stored, can't verify
      return {
        valid: true,
        playerId,
        reason: 'No fingerprint to verify against',
      };
    }

    if (identity.deviceFingerprint !== fingerprint) {
      return {
        valid: false,
        reason: 'Device fingerprint mismatch',
      };
    }

    return {
      valid: true,
      playerId,
    };
  }

  /**
   * Check if player has active session
   */
  hasActiveSession(playerId: PlayerId): boolean {
    return this.playerBindings.has(playerId);
  }

  /**
   * Get all identities
   */
  getAllIdentities(): readonly PlayerIdentity[] {
    return Array.from(this.identities.values());
  }

  /**
   * Get all active bindings
   */
  getAllBindings(): readonly IdentityBinding[] {
    return Array.from(this.bindings.values());
  }

  /**
   * Clear all data (for testing)
   */
  clear(): void {
    this.identities.clear();
    this.bindings.clear();
    this.playerBindings.clear();
  }
}

// ============================================================================
// Identity Validator
// ============================================================================

export class IdentityValidator {
  private registry: IdentityRegistry;

  constructor(registry: IdentityRegistry) {
    this.registry = registry;
  }

  /**
   * Validate that a session can act as a player
   */
  validateSessionForPlayer(
    sessionId: SessionId,
    claimedPlayerId: PlayerId
  ): void {
    const result = this.registry.verifySessionOwnership(sessionId, claimedPlayerId);

    if (!result.valid) {
      throw SecurityErrors.sessionMismatch(claimedPlayerId, sessionId);
    }
  }

  /**
   * Validate player exists
   */
  validatePlayerExists(playerId: PlayerId): PlayerIdentity {
    const identity = this.registry.getIdentity(playerId);
    if (!identity) {
      throw SecurityErrors.playerNotFound(playerId);
    }
    return identity;
  }

  /**
   * Validate session is bound
   */
  validateSessionBound(sessionId: SessionId): IdentityBinding {
    const binding = this.registry.getBinding(sessionId);
    if (!binding) {
      throw SecurityErrors.invalidSession(sessionId);
    }
    return binding;
  }

  /**
   * Get player ID from session (throws if not bound)
   */
  getPlayerIdFromSession(sessionId: SessionId): PlayerId {
    const binding = this.validateSessionBound(sessionId);
    return binding.playerId;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let identityRegistryInstance: IdentityRegistry | null = null;

export function getIdentityRegistry(): IdentityRegistry {
  if (!identityRegistryInstance) {
    identityRegistryInstance = new IdentityRegistry();
  }
  return identityRegistryInstance;
}

export function resetIdentityRegistry(): IdentityRegistry {
  identityRegistryInstance = new IdentityRegistry();
  return identityRegistryInstance;
}
