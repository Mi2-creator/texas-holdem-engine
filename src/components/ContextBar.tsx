// ============================================================================
// ContextBar - Analysis Context Information Bar
// ============================================================================
//
// 【Phase 4】Experience Implementation - Context Bar Component
//
// 层级: UI Layer (纯展示)
// 职责: 显示当前手牌的上下文信息（紧张度、阶段、底池）
//
// 设计原则:
//   - 纯函数组件，无内部状态
//   - 不使用 React Hooks
//   - 持续可见，提供情感节奏感知
//
// ============================================================================

import React from 'react';

import type { ContextBarData, ViewMode } from '../controllers/ViewModeController';
import { getTensionColor, getViewModeColor, getViewModeLabel } from '../controllers/ViewModeController';

// ============================================================================
// Type Definitions
// ============================================================================

interface ContextBarProps {
  readonly data: ContextBarData;
  readonly viewMode: ViewMode;
  readonly compact?: boolean;
}

// ============================================================================
// Sub-components
// ============================================================================

interface TensionMeterProps {
  readonly tension: number;
  readonly label: string;
  readonly compact?: boolean;
}

function TensionMeter({ tension, label, compact = false }: TensionMeterProps) {
  const color = getTensionColor(tension);
  const safeTension = Math.max(0, Math.min(100, tension));

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: compact ? 6 : 8,
        flex: 1,
      }}
    >
      <span
        style={{
          fontSize: compact ? 8 : 9,
          color: '#888',
          textTransform: 'uppercase',
          minWidth: compact ? 40 : 50,
        }}
      >
        Tension
      </span>
      <div
        style={{
          flex: 1,
          height: compact ? 6 : 8,
          background: 'rgba(100, 100, 100, 0.3)',
          borderRadius: 4,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <div
          style={{
            width: `${safeTension}%`,
            height: '100%',
            background: `linear-gradient(90deg, #22c55e, ${color})`,
            borderRadius: 4,
            transition: 'width 0.3s ease, background 0.3s ease',
          }}
        />
      </div>
      <span
        style={{
          fontSize: compact ? 9 : 10,
          color: color,
          fontWeight: 600,
          minWidth: compact ? 45 : 55,
          textAlign: 'right',
        }}
      >
        {label}
      </span>
    </div>
  );
}

interface PhaseIndicatorProps {
  readonly phase: string;
  readonly compact?: boolean;
}

function PhaseIndicator({ phase, compact = false }: PhaseIndicatorProps) {
  const phaseColors: Record<string, string> = {
    Preflop: '#3b82f6',
    Flop: '#06b6d4',
    Turn: '#f59e0b',
    River: '#ef4444',
    Showdown: '#22c55e',
  };
  const color = phaseColors[phase] ?? '#888';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: compact ? 4 : 6,
      }}
    >
      <span
        style={{
          fontSize: compact ? 8 : 9,
          color: '#888',
          textTransform: 'uppercase',
        }}
      >
        Phase
      </span>
      <span
        style={{
          padding: compact ? '2px 6px' : '3px 8px',
          background: `${color}20`,
          border: `1px solid ${color}40`,
          borderRadius: 4,
          fontSize: compact ? 9 : 10,
          fontWeight: 700,
          color: color,
          textTransform: 'uppercase',
        }}
      >
        {phase}
      </span>
    </div>
  );
}

interface PotDisplayProps {
  readonly potSize: number;
  readonly compact?: boolean;
}

function PotDisplay({ potSize, compact = false }: PotDisplayProps) {
  const formattedPot = potSize >= 1000
    ? `$${(potSize / 1000).toFixed(1)}K`
    : `$${potSize}`;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: compact ? 4 : 6,
      }}
    >
      <span
        style={{
          fontSize: compact ? 8 : 9,
          color: '#888',
          textTransform: 'uppercase',
        }}
      >
        Pot
      </span>
      <span
        style={{
          padding: compact ? '2px 6px' : '3px 8px',
          background: 'rgba(34, 197, 94, 0.15)',
          border: '1px solid rgba(34, 197, 94, 0.3)',
          borderRadius: 4,
          fontSize: compact ? 10 : 11,
          fontWeight: 700,
          color: '#22c55e',
        }}
      >
        {formattedPot}
      </span>
    </div>
  );
}

interface ViewModeBadgeProps {
  readonly mode: ViewMode;
  readonly compact?: boolean;
}

function ViewModeBadge({ mode, compact = false }: ViewModeBadgeProps) {
  const color = getViewModeColor(mode);
  const label = getViewModeLabel(mode);

  return (
    <div
      style={{
        padding: compact ? '3px 8px' : '4px 10px',
        background: `${color}20`,
        border: `1px solid ${color}40`,
        borderRadius: 4,
        fontSize: compact ? 9 : 10,
        fontWeight: 700,
        color: color,
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
      }}
    >
      {label}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function ContextBar({
  data,
  viewMode,
  compact = false,
}: ContextBarProps) {
  // Defensive: ensure data exists
  const safeData: ContextBarData = {
    tension: typeof data?.tension === 'number' ? data.tension : 0,
    tensionLabel: typeof data?.tensionLabel === 'string' ? data.tensionLabel : 'Calm',
    phase: typeof data?.phase === 'string' ? data.phase : 'Preflop',
    potSize: typeof data?.potSize === 'number' ? data.potSize : 0,
    isHighPressure: data?.isHighPressure ?? false,
    isHeroTurn: data?.isHeroTurn ?? false,
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: compact ? 12 : 16,
        padding: compact ? '8px 12px' : '10px 14px',
        background: safeData.isHighPressure
          ? 'rgba(239, 68, 68, 0.08)'
          : safeData.isHeroTurn
          ? 'rgba(6, 182, 212, 0.08)'
          : 'rgba(100, 100, 100, 0.1)',
        border: `1px solid ${
          safeData.isHighPressure
            ? 'rgba(239, 68, 68, 0.2)'
            : safeData.isHeroTurn
            ? 'rgba(6, 182, 212, 0.2)'
            : 'rgba(100, 100, 100, 0.15)'
        }`,
        borderRadius: 6,
        transition: 'background 0.3s ease, border-color 0.3s ease',
      }}
    >
      {/* Tension Meter - Takes most space */}
      <TensionMeter
        tension={safeData.tension}
        label={safeData.tensionLabel}
        compact={compact}
      />

      {/* Divider */}
      <div
        style={{
          width: 1,
          height: compact ? 16 : 20,
          background: 'rgba(100, 100, 100, 0.3)',
        }}
      />

      {/* Phase Indicator */}
      <PhaseIndicator phase={safeData.phase} compact={compact} />

      {/* Divider */}
      <div
        style={{
          width: 1,
          height: compact ? 16 : 20,
          background: 'rgba(100, 100, 100, 0.3)',
        }}
      />

      {/* Pot Display */}
      <PotDisplay potSize={safeData.potSize} compact={compact} />

      {/* Divider */}
      <div
        style={{
          width: 1,
          height: compact ? 16 : 20,
          background: 'rgba(100, 100, 100, 0.3)',
        }}
      />

      {/* View Mode Badge */}
      <ViewModeBadge mode={viewMode} compact={compact} />

      {/* Hero Turn Indicator */}
      {safeData.isHeroTurn && (
        <div
          style={{
            padding: compact ? '2px 6px' : '3px 8px',
            background: 'rgba(6, 182, 212, 0.2)',
            border: '1px solid rgba(6, 182, 212, 0.4)',
            borderRadius: 4,
            fontSize: compact ? 8 : 9,
            fontWeight: 700,
            color: '#06b6d4',
            textTransform: 'uppercase',
            animation: 'pulse 1.5s ease-in-out infinite',
          }}
        >
          Your Turn
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Export
// ============================================================================

export type { ContextBarProps };
