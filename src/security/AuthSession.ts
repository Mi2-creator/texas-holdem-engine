/**
 * AuthSession.ts
 * Phase 13 - Pluggable authentication and secure session management
 *
 * Provides authentication abstraction with multiple provider support.
 */

import { SecurityErrors, AuthenticationError } from './SecurityErrors';
import { PlayerId, SessionId, IdentityRegistry, getIdentityRegistry } from './Identity';

// ============================================================================
// Types
// ============================================================================

export type AuthProviderId = string;
export type TokenId = string;

export interface AuthToken {
  readonly tokenId: TokenId;
  readonly playerId: PlayerId;
  readonly providerId: AuthProviderId;
  readonly issuedAt: number;
  readonly expiresAt: number;
  readonly refreshToken?: string;
  readonly claims?: Record<string, unknown>;
}

export interface AuthCredentials {
  readonly providerId: AuthProviderId;
  readonly token: string;
  readonly refreshToken?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface AuthResult {
  readonly success: boolean;
  readonly playerId?: PlayerId;
  readonly sessionId?: SessionId;
  readonly token?: AuthToken;
  readonly error?: string;
}

export interface AuthProviderConfig {
  readonly providerId: AuthProviderId;
  readonly name: string;
  readonly tokenLifetimeMs: number;
  readonly refreshEnabled: boolean;
}

// ============================================================================
// Auth Provider Interface
// ============================================================================

export interface AuthProvider {
  readonly providerId: AuthProviderId;
  readonly config: AuthProviderConfig;

  /**
   * Authenticate with credentials
   */
  authenticate(credentials: AuthCredentials): Promise<AuthResult>;

  /**
   * Validate an existing token
   */
  validateToken(token: string): Promise<AuthResult>;

  /**
   * Refresh a token
   */
  refreshToken?(refreshToken: string): Promise<AuthResult>;

  /**
   * Revoke a token
   */
  revokeToken?(token: string): Promise<void>;
}

// ============================================================================
// Simple Token Provider (Development/Testing)
// ============================================================================

export class SimpleTokenProvider implements AuthProvider {
  readonly providerId = 'simple';
  readonly config: AuthProviderConfig = {
    providerId: 'simple',
    name: 'Simple Token Auth',
    tokenLifetimeMs: 3600000, // 1 hour
    refreshEnabled: false,
  };

  private tokens: Map<string, AuthToken>;
  private playerTokens: Map<PlayerId, string>;

  constructor() {
    this.tokens = new Map();
    this.playerTokens = new Map();
  }

  async authenticate(credentials: AuthCredentials): Promise<AuthResult> {
    // Simple auth: token format is "player_<playerId>"
    const match = credentials.token.match(/^player_(.+)$/);
    if (!match) {
      return {
        success: false,
        error: 'Invalid token format',
      };
    }

    const playerId = match[1];
    const tokenId = this.generateTokenId();
    const now = Date.now();

    const token: AuthToken = {
      tokenId,
      playerId,
      providerId: this.providerId,
      issuedAt: now,
      expiresAt: now + this.config.tokenLifetimeMs,
      claims: credentials.metadata,
    };

    this.tokens.set(tokenId, token);
    this.playerTokens.set(playerId, tokenId);

    return {
      success: true,
      playerId,
      token,
    };
  }

  async validateToken(tokenId: string): Promise<AuthResult> {
    const token = this.tokens.get(tokenId);

    if (!token) {
      return {
        success: false,
        error: 'Token not found',
      };
    }

    if (Date.now() > token.expiresAt) {
      this.tokens.delete(tokenId);
      this.playerTokens.delete(token.playerId);
      return {
        success: false,
        error: 'Token expired',
      };
    }

    return {
      success: true,
      playerId: token.playerId,
      token,
    };
  }

  async revokeToken(tokenId: string): Promise<void> {
    const token = this.tokens.get(tokenId);
    if (token) {
      this.playerTokens.delete(token.playerId);
      this.tokens.delete(tokenId);
    }
  }

  private generateTokenId(): string {
    return `tok_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Clear all tokens (for testing)
   */
  clear(): void {
    this.tokens.clear();
    this.playerTokens.clear();
  }
}

// ============================================================================
// JWT-like Token Provider
// ============================================================================

export class JWTLikeProvider implements AuthProvider {
  readonly providerId = 'jwt';
  readonly config: AuthProviderConfig;

  private secretKey: string;
  private issuedTokens: Set<string>;
  private revokedTokens: Set<string>;

  constructor(secretKey: string, tokenLifetimeMs: number = 3600000) {
    this.secretKey = secretKey;
    this.issuedTokens = new Set();
    this.revokedTokens = new Set();
    this.config = {
      providerId: 'jwt',
      name: 'JWT Authentication',
      tokenLifetimeMs,
      refreshEnabled: true,
    };
  }

  async authenticate(credentials: AuthCredentials): Promise<AuthResult> {
    // Validate the incoming token has correct structure
    const decoded = this.decodeToken(credentials.token);
    if (!decoded) {
      return {
        success: false,
        error: 'Invalid token format',
      };
    }

    // Create signed token
    const tokenId = this.createSignedToken(decoded.playerId, decoded.claims);
    const now = Date.now();

    const token: AuthToken = {
      tokenId,
      playerId: decoded.playerId,
      providerId: this.providerId,
      issuedAt: now,
      expiresAt: now + this.config.tokenLifetimeMs,
      refreshToken: this.createRefreshToken(decoded.playerId),
      claims: decoded.claims,
    };

    this.issuedTokens.add(tokenId);

    return {
      success: true,
      playerId: decoded.playerId,
      token,
    };
  }

  async validateToken(tokenId: string): Promise<AuthResult> {
    if (this.revokedTokens.has(tokenId)) {
      return {
        success: false,
        error: 'Token has been revoked',
      };
    }

    const decoded = this.verifySignedToken(tokenId);
    if (!decoded) {
      return {
        success: false,
        error: 'Invalid token signature',
      };
    }

    if (Date.now() > decoded.expiresAt) {
      return {
        success: false,
        error: 'Token expired',
      };
    }

    return {
      success: true,
      playerId: decoded.playerId,
      token: {
        tokenId,
        playerId: decoded.playerId,
        providerId: this.providerId,
        issuedAt: decoded.issuedAt,
        expiresAt: decoded.expiresAt,
        claims: decoded.claims,
      },
    };
  }

  async refreshToken(refreshToken: string): Promise<AuthResult> {
    const decoded = this.verifyRefreshToken(refreshToken);
    if (!decoded) {
      return {
        success: false,
        error: 'Invalid refresh token',
      };
    }

    // Create new access token
    const tokenId = this.createSignedToken(decoded.playerId);
    const now = Date.now();

    const token: AuthToken = {
      tokenId,
      playerId: decoded.playerId,
      providerId: this.providerId,
      issuedAt: now,
      expiresAt: now + this.config.tokenLifetimeMs,
      refreshToken: this.createRefreshToken(decoded.playerId),
    };

    this.issuedTokens.add(tokenId);

    return {
      success: true,
      playerId: decoded.playerId,
      token,
    };
  }

  async revokeToken(tokenId: string): Promise<void> {
    this.revokedTokens.add(tokenId);
    this.issuedTokens.delete(tokenId);
  }

  private decodeToken(token: string): { playerId: string; claims?: Record<string, unknown> } | null {
    // Simple format: base64(playerId:timestamp:claims)
    try {
      const decoded = atob(token);
      const parts = decoded.split(':');
      if (parts.length < 2) return null;

      return {
        playerId: parts[0],
        claims: parts[2] ? JSON.parse(parts[2]) : undefined,
      };
    } catch {
      return null;
    }
  }

  private createSignedToken(playerId: string, claims?: Record<string, unknown>): string {
    const now = Date.now();
    const payload = {
      playerId,
      issuedAt: now,
      expiresAt: now + this.config.tokenLifetimeMs,
      claims,
    };
    const payloadStr = JSON.stringify(payload);
    const signature = this.sign(payloadStr);
    return btoa(`${payloadStr}|${signature}`);
  }

  private verifySignedToken(token: string): {
    playerId: string;
    issuedAt: number;
    expiresAt: number;
    claims?: Record<string, unknown>;
  } | null {
    try {
      const decoded = atob(token);
      const [payloadStr, signature] = decoded.split('|');

      if (!payloadStr || !signature) return null;
      if (this.sign(payloadStr) !== signature) return null;

      return JSON.parse(payloadStr);
    } catch {
      return null;
    }
  }

  private createRefreshToken(playerId: string): string {
    const payload = {
      playerId,
      type: 'refresh',
      issuedAt: Date.now(),
    };
    const payloadStr = JSON.stringify(payload);
    const signature = this.sign(payloadStr);
    return btoa(`${payloadStr}|${signature}`);
  }

  private verifyRefreshToken(token: string): { playerId: string } | null {
    try {
      const decoded = atob(token);
      const [payloadStr, signature] = decoded.split('|');

      if (!payloadStr || !signature) return null;
      if (this.sign(payloadStr) !== signature) return null;

      const payload = JSON.parse(payloadStr);
      if (payload.type !== 'refresh') return null;

      return { playerId: payload.playerId };
    } catch {
      return null;
    }
  }

  private sign(data: string): string {
    // Simple HMAC-like signature (not cryptographically secure - for demo)
    let hash = 0;
    const combined = data + this.secretKey;
    for (let i = 0; i < combined.length; i++) {
      const char = combined.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  /**
   * Clear all state (for testing)
   */
  clear(): void {
    this.issuedTokens.clear();
    this.revokedTokens.clear();
  }
}

// ============================================================================
// Auth Session Manager
// ============================================================================

export interface SecureSession {
  readonly sessionId: SessionId;
  readonly playerId: PlayerId;
  readonly token: AuthToken;
  readonly providerId: AuthProviderId;
  readonly createdAt: number;
  readonly lastActivityAt: number;
  readonly deviceInfo?: {
    readonly userAgent?: string;
    readonly ipAddress?: string;
    readonly deviceId?: string;
  };
}

export class AuthSessionManager {
  private providers: Map<AuthProviderId, AuthProvider>;
  private sessions: Map<SessionId, SecureSession>;
  private playerSessions: Map<PlayerId, SessionId>;
  private tokenSessions: Map<TokenId, SessionId>;
  private identityRegistry: IdentityRegistry;

  constructor(identityRegistry?: IdentityRegistry) {
    this.providers = new Map();
    this.sessions = new Map();
    this.playerSessions = new Map();
    this.tokenSessions = new Map();
    this.identityRegistry = identityRegistry ?? getIdentityRegistry();
  }

  /**
   * Register an auth provider
   */
  registerProvider(provider: AuthProvider): void {
    this.providers.set(provider.providerId, provider);
  }

  /**
   * Get registered provider
   */
  getProvider(providerId: AuthProviderId): AuthProvider | null {
    return this.providers.get(providerId) ?? null;
  }

  /**
   * Authenticate and create session
   */
  async authenticate(
    credentials: AuthCredentials,
    deviceInfo?: {
      userAgent?: string;
      ipAddress?: string;
      deviceId?: string;
    }
  ): Promise<SecureSession> {
    const provider = this.providers.get(credentials.providerId);
    if (!provider) {
      throw SecurityErrors.providerError(credentials.providerId, 'Provider not registered');
    }

    const result = await provider.authenticate(credentials);
    if (!result.success || !result.playerId || !result.token) {
      throw SecurityErrors.authenticationFailed(result.error ?? 'Unknown error');
    }

    // Check for existing session
    const existingSessionId = this.playerSessions.get(result.playerId);
    if (existingSessionId) {
      // Invalidate old session
      await this.invalidateSession(existingSessionId);
    }

    // Create new session
    const sessionId = this.generateSessionId();
    const now = Date.now();

    const session: SecureSession = {
      sessionId,
      playerId: result.playerId,
      token: result.token,
      providerId: credentials.providerId,
      createdAt: now,
      lastActivityAt: now,
      deviceInfo,
    };

    this.sessions.set(sessionId, session);
    this.playerSessions.set(result.playerId, sessionId);
    this.tokenSessions.set(result.token.tokenId, sessionId);

    // Bind session to identity
    this.identityRegistry.bindSession(result.playerId, sessionId, deviceInfo);

    return session;
  }

  /**
   * Validate existing session token
   */
  async validateSession(sessionId: SessionId): Promise<SecureSession> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw SecurityErrors.invalidSession(sessionId);
    }

    const provider = this.providers.get(session.providerId);
    if (!provider) {
      throw SecurityErrors.providerError(session.providerId, 'Provider not found');
    }

    const result = await provider.validateToken(session.token.tokenId);
    if (!result.success) {
      // Token invalid - invalidate session
      await this.invalidateSession(sessionId);
      throw SecurityErrors.tokenExpired();
    }

    // Update last activity
    const updated: SecureSession = {
      ...session,
      lastActivityAt: Date.now(),
    };
    this.sessions.set(sessionId, updated);

    return updated;
  }

  /**
   * Refresh session token
   */
  async refreshSession(sessionId: SessionId): Promise<SecureSession> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw SecurityErrors.invalidSession(sessionId);
    }

    if (!session.token.refreshToken) {
      throw SecurityErrors.invalidToken('No refresh token available');
    }

    const provider = this.providers.get(session.providerId);
    if (!provider || !provider.refreshToken) {
      throw SecurityErrors.providerError(session.providerId, 'Refresh not supported');
    }

    const result = await provider.refreshToken(session.token.refreshToken);
    if (!result.success || !result.token) {
      throw SecurityErrors.authenticationFailed(result.error ?? 'Refresh failed');
    }

    // Remove old token mapping
    this.tokenSessions.delete(session.token.tokenId);

    // Update session with new token
    const updated: SecureSession = {
      ...session,
      token: result.token,
      lastActivityAt: Date.now(),
    };

    this.sessions.set(sessionId, updated);
    this.tokenSessions.set(result.token.tokenId, sessionId);

    return updated;
  }

  /**
   * Invalidate session
   */
  async invalidateSession(sessionId: SessionId): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Revoke token if provider supports it
    const provider = this.providers.get(session.providerId);
    if (provider?.revokeToken) {
      await provider.revokeToken(session.token.tokenId);
    }

    // Clean up
    this.tokenSessions.delete(session.token.tokenId);
    this.playerSessions.delete(session.playerId);
    this.sessions.delete(sessionId);

    // Unbind from identity
    this.identityRegistry.unbindSession(sessionId);
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: SessionId): SecureSession | null {
    return this.sessions.get(sessionId) ?? null;
  }

  /**
   * Get session by player ID
   */
  getSessionByPlayer(playerId: PlayerId): SecureSession | null {
    const sessionId = this.playerSessions.get(playerId);
    if (!sessionId) return null;
    return this.sessions.get(sessionId) ?? null;
  }

  /**
   * Get session by token
   */
  getSessionByToken(tokenId: TokenId): SecureSession | null {
    const sessionId = this.tokenSessions.get(tokenId);
    if (!sessionId) return null;
    return this.sessions.get(sessionId) ?? null;
  }

  /**
   * Check if player has active session
   */
  hasActiveSession(playerId: PlayerId): boolean {
    const sessionId = this.playerSessions.get(playerId);
    if (!sessionId) return false;
    const session = this.sessions.get(sessionId);
    return session !== undefined;
  }

  /**
   * Get all active sessions
   */
  getAllSessions(): readonly SecureSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Clear all sessions (for testing)
   */
  clear(): void {
    this.sessions.clear();
    this.playerSessions.clear();
    this.tokenSessions.clear();
  }

  private generateSessionId(): SessionId {
    return `sess_${Date.now()}_${Math.random().toString(36).substr(2, 12)}`;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let authSessionManagerInstance: AuthSessionManager | null = null;

export function getAuthSessionManager(): AuthSessionManager {
  if (!authSessionManagerInstance) {
    authSessionManagerInstance = new AuthSessionManager();
    // Register default provider
    authSessionManagerInstance.registerProvider(new SimpleTokenProvider());
  }
  return authSessionManagerInstance;
}

export function resetAuthSessionManager(): AuthSessionManager {
  authSessionManagerInstance = new AuthSessionManager();
  authSessionManagerInstance.registerProvider(new SimpleTokenProvider());
  return authSessionManagerInstance;
}
