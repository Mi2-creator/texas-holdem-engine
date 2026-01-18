/**
 * SessionStats.tsx
 * Phase L12 - Session statistics tracking and display
 *
 * Tracks and displays player performance across a session:
 * - Hands played/won
 * - Win rate
 * - Profit/loss
 * - Session trends
 */

import React from 'react';

// ============================================================================
// Types
// ============================================================================

export interface SessionStatsData {
  /** Total hands played this session */
  readonly handsPlayed: number;
  /** Hands won by hero */
  readonly handsWon: number;
  /** Starting stack at session start */
  readonly startingStack: number;
  /** Current stack */
  readonly currentStack: number;
  /** Biggest single hand win */
  readonly biggestWin: number;
  /** Biggest single hand loss */
  readonly biggestLoss: number;
  /** Session start timestamp */
  readonly sessionStartTime: number;
}

interface SessionStatsProps {
  readonly stats: SessionStatsData;
  readonly compact?: boolean;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Create initial session stats
 */
export function createInitialSessionStats(startingStack: number): SessionStatsData {
  return {
    handsPlayed: 0,
    handsWon: 0,
    startingStack,
    currentStack: startingStack,
    biggestWin: 0,
    biggestLoss: 0,
    sessionStartTime: Date.now(),
  };
}

/**
 * Update session stats after a hand
 */
export function updateSessionStats(
  stats: SessionStatsData,
  heroWon: boolean,
  newStack: number,
  potWon: number
): SessionStatsData {
  const stackChange = newStack - stats.currentStack;

  return {
    ...stats,
    handsPlayed: stats.handsPlayed + 1,
    handsWon: heroWon ? stats.handsWon + 1 : stats.handsWon,
    currentStack: newStack,
    biggestWin: heroWon && potWon > stats.biggestWin ? potWon : stats.biggestWin,
    biggestLoss: !heroWon && Math.abs(stackChange) > stats.biggestLoss
      ? Math.abs(stackChange)
      : stats.biggestLoss,
  };
}

/**
 * Calculate win rate as percentage
 */
export function calculateWinRate(stats: SessionStatsData): number {
  if (stats.handsPlayed === 0) return 0;
  return (stats.handsWon / stats.handsPlayed) * 100;
}

/**
 * Calculate net profit/loss
 */
export function calculateNetProfit(stats: SessionStatsData): number {
  return stats.currentStack - stats.startingStack;
}

/**
 * Format session duration
 */
function formatDuration(startTime: number): string {
  const elapsed = Date.now() - startTime;
  const minutes = Math.floor(elapsed / 60000);
  const seconds = Math.floor((elapsed % 60000) / 1000);

  if (minutes === 0) {
    return `${seconds}s`;
  }
  return `${minutes}m ${seconds}s`;
}

/**
 * Format chip amounts with sign
 */
function formatChipsWithSign(amount: number): string {
  const formatted = Math.abs(amount).toLocaleString('en-US');
  if (amount > 0) return `+$${formatted}`;
  if (amount < 0) return `-$${formatted}`;
  return '$0';
}

/**
 * Format chip amounts
 */
function formatChips(amount: number): string {
  return amount.toLocaleString('en-US');
}

// ============================================================================
// Styles
// ============================================================================

const styles = {
  container: {
    padding: '16px 20px',
    borderRadius: '12px',
    backgroundColor: 'rgba(15, 15, 20, 0.9)',
    border: '1px solid rgba(75, 85, 99, 0.3)',
    minWidth: '280px',
  },

  compactContainer: {
    padding: '8px 12px',
    borderRadius: '8px',
    backgroundColor: 'rgba(15, 15, 20, 0.8)',
    border: '1px solid rgba(75, 85, 99, 0.2)',
    display: 'flex',
    gap: '16px',
    alignItems: 'center',
  },

  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
    paddingBottom: '8px',
    borderBottom: '1px solid rgba(75, 85, 99, 0.3)',
  },

  title: {
    fontSize: '12px',
    fontWeight: 600,
    color: 'rgba(156, 163, 175, 0.7)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },

  duration: {
    fontSize: '11px',
    color: 'rgba(156, 163, 175, 0.5)',
  },

  statsGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px',
  },

  statItem: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
  },

  statLabel: {
    fontSize: '10px',
    color: 'rgba(156, 163, 175, 0.6)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.3px',
  },

  statValue: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#fff',
  },

  profitPositive: {
    color: '#22c55e',
  },

  profitNegative: {
    color: '#ef4444',
  },

  profitNeutral: {
    color: '#9ca3af',
  },

  winRate: {
    color: '#a855f7',
  },

  // Compact mode styles
  compactStat: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '1px',
  },

  compactLabel: {
    fontSize: '9px',
    color: 'rgba(156, 163, 175, 0.5)',
    textTransform: 'uppercase' as const,
  },

  compactValue: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#fff',
  },

  divider: {
    width: '1px',
    height: '24px',
    backgroundColor: 'rgba(75, 85, 99, 0.3)',
  },
};

// ============================================================================
// Main Component
// ============================================================================

export function SessionStats({ stats, compact = false }: SessionStatsProps): React.ReactElement {
  const winRate = calculateWinRate(stats);
  const netProfit = calculateNetProfit(stats);
  const profitStyle = netProfit > 0
    ? styles.profitPositive
    : netProfit < 0
      ? styles.profitNegative
      : styles.profitNeutral;

  // Compact mode - single row for header area
  if (compact) {
    return (
      <div style={styles.compactContainer}>
        <div style={styles.compactStat}>
          <span style={styles.compactLabel}>Hands</span>
          <span style={styles.compactValue}>{stats.handsPlayed}</span>
        </div>

        <div style={styles.divider} />

        <div style={styles.compactStat}>
          <span style={styles.compactLabel}>Won</span>
          <span style={{ ...styles.compactValue, ...styles.winRate }}>
            {stats.handsWon} ({winRate.toFixed(0)}%)
          </span>
        </div>

        <div style={styles.divider} />

        <div style={styles.compactStat}>
          <span style={styles.compactLabel}>Profit</span>
          <span style={{ ...styles.compactValue, ...profitStyle }}>
            {formatChipsWithSign(netProfit)}
          </span>
        </div>
      </div>
    );
  }

  // Full mode - detailed stats panel
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>Session Stats</span>
        <span style={styles.duration}>{formatDuration(stats.sessionStartTime)}</span>
      </div>

      <div style={styles.statsGrid}>
        {/* Hands Played */}
        <div style={styles.statItem}>
          <span style={styles.statLabel}>Hands Played</span>
          <span style={styles.statValue}>{stats.handsPlayed}</span>
        </div>

        {/* Hands Won */}
        <div style={styles.statItem}>
          <span style={styles.statLabel}>Hands Won</span>
          <span style={styles.statValue}>{stats.handsWon}</span>
        </div>

        {/* Win Rate */}
        <div style={styles.statItem}>
          <span style={styles.statLabel}>Win Rate</span>
          <span style={{ ...styles.statValue, ...styles.winRate }}>
            {winRate.toFixed(1)}%
          </span>
        </div>

        {/* Net Profit/Loss */}
        <div style={styles.statItem}>
          <span style={styles.statLabel}>Net Profit</span>
          <span style={{ ...styles.statValue, ...profitStyle }}>
            {formatChipsWithSign(netProfit)}
          </span>
        </div>

        {/* Current Stack */}
        <div style={styles.statItem}>
          <span style={styles.statLabel}>Current Stack</span>
          <span style={styles.statValue}>${formatChips(stats.currentStack)}</span>
        </div>

        {/* Starting Stack */}
        <div style={styles.statItem}>
          <span style={styles.statLabel}>Starting Stack</span>
          <span style={{ ...styles.statValue, color: 'rgba(156, 163, 175, 0.7)' }}>
            ${formatChips(stats.startingStack)}
          </span>
        </div>

        {/* Biggest Win */}
        {stats.biggestWin > 0 && (
          <div style={styles.statItem}>
            <span style={styles.statLabel}>Biggest Win</span>
            <span style={{ ...styles.statValue, ...styles.profitPositive }}>
              +${formatChips(stats.biggestWin)}
            </span>
          </div>
        )}

        {/* Biggest Loss */}
        {stats.biggestLoss > 0 && (
          <div style={styles.statItem}>
            <span style={styles.statLabel}>Biggest Loss</span>
            <span style={{ ...styles.statValue, ...styles.profitNegative }}>
              -${formatChips(stats.biggestLoss)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export default SessionStats;
