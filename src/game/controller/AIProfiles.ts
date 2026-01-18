/**
 * AIProfiles.ts
 * Phase L7 - Distinct AI personality profiles
 *
 * Two-dimensional AI profiles:
 * - Tightness: How many hands they play (tight vs loose)
 * - Aggression: How they bet (passive vs aggressive)
 *
 * MVP: 2 profiles
 * - TAG (Tight-Aggressive): Selective but punishing
 * - Calling Station (Loose-Passive): Plays many hands, rarely raises
 */

import { AIConfig } from './SimpleAI';

// ============================================================================
// Types
// ============================================================================

export type AIProfileType = 'tag' | 'calling-station';

export interface AIProfile extends AIConfig {
  readonly name: string;
  readonly description: string;
  /** How often to voluntarily enter pot preflop (0-1) */
  readonly vpip: number;
  /** Bet sizing variance factor (0.5 = half pot to 1.5 = 1.5x pot) */
  readonly betSizeMin: number;
  readonly betSizeMax: number;
}

// ============================================================================
// Profile Definitions
// ============================================================================

/**
 * TAG (Tight-Aggressive)
 * - Plays ~20% of hands
 * - When they play, they bet/raise frequently
 * - Larger bet sizes
 */
const TAG_PROFILE: AIProfile = {
  name: 'TAG',
  description: 'Tight-Aggressive: Selective but punishing',
  style: 'aggressive',
  foldThreshold: 0.4, // More willing to fold bad situations
  raiseFrequency: 0.45, // Raises often when in a hand
  vpip: 0.20, // Plays ~20% of hands
  betSizeMin: 0.6, // 60% pot minimum
  betSizeMax: 1.2, // Up to 120% pot
};

/**
 * Calling Station (Loose-Passive)
 * - Plays ~50% of hands
 * - Rarely raises, mostly calls
 * - Smaller bet sizes when they do bet
 */
const CALLING_STATION_PROFILE: AIProfile = {
  name: 'Calling Station',
  description: 'Loose-Passive: Plays many hands, hard to bluff',
  style: 'passive',
  foldThreshold: 0.7, // Very reluctant to fold
  raiseFrequency: 0.08, // Rarely raises
  vpip: 0.50, // Plays ~50% of hands
  betSizeMin: 0.3, // 30% pot minimum
  betSizeMax: 0.6, // Up to 60% pot
};

// ============================================================================
// Profile Registry
// ============================================================================

export const AI_PROFILES: Record<AIProfileType, AIProfile> = {
  'tag': TAG_PROFILE,
  'calling-station': CALLING_STATION_PROFILE,
};

/**
 * Get AI config from profile type
 */
export function getAIConfig(profileType: AIProfileType): AIConfig {
  const profile = AI_PROFILES[profileType];
  return {
    style: profile.style,
    foldThreshold: profile.foldThreshold,
    raiseFrequency: profile.raiseFrequency,
  };
}

/**
 * Get full profile for a profile type
 */
export function getAIProfile(profileType: AIProfileType): AIProfile {
  return AI_PROFILES[profileType];
}
