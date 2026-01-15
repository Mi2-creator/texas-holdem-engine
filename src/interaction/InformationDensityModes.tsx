// ============================================================================
// InformationDensityModes - Compact vs Expanded Display Modes
// ============================================================================
//
// 【Product Polish Phase】Replay Architecture Freeze Declaration v1.0 Compliant
//
// 层级: Presentation Layer (样式配置)
// 职责: 定义信息密度模式（紧凑/展开），通过 props 传递，不存储内部状态
//
// 约束:
//   - 不使用 React Hooks
//   - 模式通过 props 传递，不存储内部状态
//   - 不 import src/replay/** 或 src/commands/**
//   - 不调用 EventProcessor
//   - 不构造 ReplayEvent
//   - 纯样式配置和展示组件
//
// INV 合规性:
//   - INV-1 幂等快照: 不参与快照生成
//   - INV-2 回放确定性: 不参与回放过程
//   - INV-3 只读契约: 所有数据访问均为只读
//   - INV-4 序列单调性: 不修改序列号
//   - INV-5 压缩无损性: 不涉及压缩层
//
// H 合规性:
//   - H-1 安全手牌处理: 不涉及底牌可见性逻辑
//   - H-2 边界安全: 纯样式配置
//   - H-3 无副作用: 纯函数渲染
//   - H-4 值语义: 不修改任何值
//
// ============================================================================

import React from 'react';

// ============================================================================
// Types
// ============================================================================

/**
 * Information density mode
 */
type DensityMode = 'compact' | 'expanded';

/**
 * Density configuration for styling
 */
interface DensityConfig {
  readonly mode: DensityMode;
  readonly spacing: SpacingConfig;
  readonly typography: TypographyConfig;
  readonly components: ComponentConfig;
}

/**
 * Spacing configuration
 */
interface SpacingConfig {
  readonly xs: number;
  readonly sm: number;
  readonly md: number;
  readonly lg: number;
  readonly xl: number;
  readonly panelPadding: number;
  readonly sectionGap: number;
  readonly itemGap: number;
}

/**
 * Typography configuration
 */
interface TypographyConfig {
  readonly xs: number;
  readonly sm: number;
  readonly md: number;
  readonly lg: number;
  readonly xl: number;
  readonly lineHeight: number;
  readonly labelSize: number;
  readonly valueSize: number;
  readonly titleSize: number;
}

/**
 * Component-specific configuration
 */
interface ComponentConfig {
  readonly borderRadius: number;
  readonly iconSize: number;
  readonly badgeHeight: number;
  readonly buttonPadding: string;
  readonly cardPadding: string;
  readonly indicatorSize: number;
  readonly maxVisibleItems: number;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Compact mode configuration
 */
const COMPACT_CONFIG: DensityConfig = {
  mode: 'compact',
  spacing: {
    xs: 2,
    sm: 4,
    md: 6,
    lg: 8,
    xl: 12,
    panelPadding: 8,
    sectionGap: 8,
    itemGap: 4,
  },
  typography: {
    xs: 7,
    sm: 8,
    md: 9,
    lg: 10,
    xl: 11,
    lineHeight: 1.4,
    labelSize: 7,
    valueSize: 10,
    titleSize: 11,
  },
  components: {
    borderRadius: 4,
    iconSize: 12,
    badgeHeight: 18,
    buttonPadding: '4px 8px',
    cardPadding: '6px 8px',
    indicatorSize: 8,
    maxVisibleItems: 3,
  },
};

/**
 * Expanded mode configuration
 */
const EXPANDED_CONFIG: DensityConfig = {
  mode: 'expanded',
  spacing: {
    xs: 4,
    sm: 6,
    md: 10,
    lg: 14,
    xl: 20,
    panelPadding: 16,
    sectionGap: 16,
    itemGap: 8,
  },
  typography: {
    xs: 9,
    sm: 10,
    md: 11,
    lg: 13,
    xl: 15,
    lineHeight: 1.6,
    labelSize: 9,
    valueSize: 14,
    titleSize: 14,
  },
  components: {
    borderRadius: 8,
    iconSize: 16,
    badgeHeight: 24,
    buttonPadding: '8px 14px',
    cardPadding: '12px 16px',
    indicatorSize: 12,
    maxVisibleItems: 6,
  },
};

/**
 * Configuration lookup by mode
 */
const DENSITY_CONFIGS: Record<DensityMode, DensityConfig> = {
  compact: COMPACT_CONFIG,
  expanded: EXPANDED_CONFIG,
};

// ============================================================================
// Pure Helper Functions
// ============================================================================

/**
 * Get density configuration (pure function)
 */
function getDensityConfig(mode: DensityMode): DensityConfig {
  return DENSITY_CONFIGS[mode];
}

/**
 * Get spacing value (pure function)
 */
function getSpacing(
  mode: DensityMode,
  size: keyof SpacingConfig
): number {
  return DENSITY_CONFIGS[mode].spacing[size];
}

/**
 * Get typography value (pure function)
 */
function getTypography(
  mode: DensityMode,
  size: keyof TypographyConfig
): number {
  return DENSITY_CONFIGS[mode].typography[size];
}

/**
 * Get component config value (pure function)
 */
function getComponentConfig<K extends keyof ComponentConfig>(
  mode: DensityMode,
  key: K
): ComponentConfig[K] {
  return DENSITY_CONFIGS[mode].components[key];
}

/**
 * Convert compact boolean to density mode (pure function)
 */
function compactToDensityMode(compact: boolean): DensityMode {
  return compact ? 'compact' : 'expanded';
}

// ============================================================================
// Density Provider Context (Via Props Pattern)
// ============================================================================

/**
 * Density context props (passed down, not stored in context)
 */
interface DensityContextProps {
  readonly mode: DensityMode;
  readonly config: DensityConfig;
}

/**
 * Create density context props (pure function)
 */
function createDensityContext(mode: DensityMode): DensityContextProps {
  return {
    mode,
    config: getDensityConfig(mode),
  };
}

// ============================================================================
// UI Components
// ============================================================================

interface DensityToggleProps {
  readonly currentMode: DensityMode;
  readonly onToggle: (mode: DensityMode) => void;
  readonly compact?: boolean;
}

/**
 * Density mode toggle button
 */
export function DensityToggle({
  currentMode,
  onToggle,
  compact = false,
}: DensityToggleProps) {
  const isCompact = currentMode === 'compact';

  return (
    <div
      onClick={() => onToggle(isCompact ? 'expanded' : 'compact')}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: compact ? 4 : 6,
        padding: compact ? '4px 8px' : '6px 12px',
        background: 'rgba(100, 100, 100, 0.15)',
        border: '1px solid rgba(100, 100, 100, 0.25)',
        borderRadius: compact ? 4 : 6,
        cursor: 'pointer',
        transition: 'all 150ms ease',
      }}
      title={isCompact ? 'Switch to expanded view' : 'Switch to compact view'}
    >
      {/* Icon representation */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: isCompact ? 1 : 2,
        }}
      >
        {[0, 1, 2].map(i => (
          <div
            key={i}
            style={{
              width: compact ? 12 : 16,
              height: isCompact ? 2 : 3,
              background: '#888',
              borderRadius: 1,
              transition: 'height 150ms ease',
            }}
          />
        ))}
      </div>

      {/* Label */}
      <span
        style={{
          fontSize: compact ? 9 : 10,
          color: '#9ca3af',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
        }}
      >
        {isCompact ? 'Compact' : 'Expanded'}
      </span>
    </div>
  );
}

interface DensitySwitcherProps {
  readonly currentMode: DensityMode;
  readonly onModeChange: (mode: DensityMode) => void;
  readonly showLabels?: boolean;
}

/**
 * Segmented density mode switcher
 */
export function DensitySwitcher({
  currentMode,
  onModeChange,
  showLabels = true,
}: DensitySwitcherProps) {
  const modes: DensityMode[] = ['compact', 'expanded'];

  return (
    <div
      style={{
        display: 'inline-flex',
        background: 'rgba(0, 0, 0, 0.2)',
        borderRadius: 6,
        padding: 2,
      }}
    >
      {modes.map(mode => {
        const isActive = mode === currentMode;

        return (
          <div
            key={mode}
            onClick={() => onModeChange(mode)}
            style={{
              padding: '6px 12px',
              borderRadius: 4,
              cursor: 'pointer',
              background: isActive ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
              transition: 'all 150ms ease',
            }}
          >
            {showLabels && (
              <span
                style={{
                  fontSize: 10,
                  color: isActive ? '#3b82f6' : '#888',
                  fontWeight: isActive ? 600 : 400,
                  textTransform: 'capitalize',
                }}
              >
                {mode}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// Density-Aware Wrapper Components
// ============================================================================

interface DensityAwarePanelProps {
  readonly mode: DensityMode;
  readonly children: React.ReactNode;
}

/**
 * Panel wrapper that applies density-based padding
 */
export function DensityAwarePanel({
  mode,
  children,
}: DensityAwarePanelProps) {
  const config = getDensityConfig(mode);

  return (
    <div
      style={{
        padding: config.spacing.panelPadding,
      }}
    >
      {children}
    </div>
  );
}

interface DensityAwareSectionProps {
  readonly mode: DensityMode;
  readonly title?: string;
  readonly children: React.ReactNode;
}

/**
 * Section wrapper with density-based styling
 */
export function DensityAwareSection({
  mode,
  title,
  children,
}: DensityAwareSectionProps) {
  const config = getDensityConfig(mode);

  return (
    <div
      style={{
        marginBottom: config.spacing.sectionGap,
      }}
    >
      {title && (
        <div
          style={{
            fontSize: config.typography.labelSize,
            color: '#888',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: config.spacing.sm,
          }}
        >
          {title}
        </div>
      )}
      {children}
    </div>
  );
}

interface DensityAwareCardProps {
  readonly mode: DensityMode;
  readonly highlighted?: boolean;
  readonly color?: string;
  readonly children: React.ReactNode;
}

/**
 * Card component with density-based styling
 */
export function DensityAwareCard({
  mode,
  highlighted = false,
  color = '#3b82f6',
  children,
}: DensityAwareCardProps) {
  const config = getDensityConfig(mode);

  return (
    <div
      style={{
        padding: config.components.cardPadding,
        background: highlighted ? `${color}15` : 'rgba(100, 100, 100, 0.1)',
        border: `1px solid ${highlighted ? `${color}30` : 'rgba(100, 100, 100, 0.15)'}`,
        borderRadius: config.components.borderRadius,
      }}
    >
      {children}
    </div>
  );
}

interface DensityAwareTextProps {
  readonly mode: DensityMode;
  readonly size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  readonly weight?: 'normal' | 'medium' | 'bold';
  readonly color?: string;
  readonly children: React.ReactNode;
}

/**
 * Text component with density-based sizing
 */
export function DensityAwareText({
  mode,
  size = 'md',
  weight = 'normal',
  color = '#d0d0d0',
  children,
}: DensityAwareTextProps) {
  const config = getDensityConfig(mode);
  const fontSize = config.typography[size];
  const fontWeight = weight === 'bold' ? 700 : weight === 'medium' ? 500 : 400;

  return (
    <span
      style={{
        fontSize,
        fontWeight,
        color,
        lineHeight: config.typography.lineHeight,
      }}
    >
      {children}
    </span>
  );
}

interface DensityAwareBadgeProps {
  readonly mode: DensityMode;
  readonly color: string;
  readonly children: React.ReactNode;
}

/**
 * Badge component with density-based sizing
 */
export function DensityAwareBadge({
  mode,
  color,
  children,
}: DensityAwareBadgeProps) {
  const config = getDensityConfig(mode);

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: config.components.badgeHeight,
        padding: `0 ${config.spacing.md}px`,
        background: `${color}20`,
        borderRadius: config.components.borderRadius,
        fontSize: config.typography.sm,
        fontWeight: 600,
        color: color,
        textTransform: 'uppercase',
      }}
    >
      {children}
    </span>
  );
}

// ============================================================================
// Density-Based List Components
// ============================================================================

interface DensityAwareListProps {
  readonly mode: DensityMode;
  readonly items: readonly React.ReactNode[];
  readonly showMore?: boolean;
  readonly onShowMore?: () => void;
}

/**
 * List component that respects density maxVisibleItems
 */
export function DensityAwareList({
  mode,
  items,
  showMore = false,
  onShowMore,
}: DensityAwareListProps) {
  const config = getDensityConfig(mode);
  const maxItems = config.components.maxVisibleItems;
  const displayItems = showMore ? items : items.slice(0, maxItems);
  const hasMore = items.length > maxItems && !showMore;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: config.spacing.itemGap,
      }}
    >
      {displayItems.map((item, idx) => (
        <div key={idx}>{item}</div>
      ))}

      {hasMore && (
        <div
          onClick={onShowMore}
          style={{
            padding: `${config.spacing.sm}px ${config.spacing.md}px`,
            background: 'rgba(100, 100, 100, 0.1)',
            borderRadius: config.components.borderRadius,
            fontSize: config.typography.sm,
            color: '#3b82f6',
            textAlign: 'center',
            cursor: onShowMore ? 'pointer' : 'default',
          }}
        >
          +{items.length - maxItems} more
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Exports
// ============================================================================

export type {
  DensityMode,
  DensityConfig,
  SpacingConfig,
  TypographyConfig,
  ComponentConfig,
  DensityContextProps,
};

export {
  COMPACT_CONFIG,
  EXPANDED_CONFIG,
  DENSITY_CONFIGS,
  getDensityConfig,
  getSpacing,
  getTypography,
  getComponentConfig,
  compactToDensityMode,
  createDensityContext,
};
