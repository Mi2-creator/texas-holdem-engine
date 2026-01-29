/**
 * GreySimulationViews.ts
 *
 * Executive views for Grey Strategy Simulation
 * Provides high-level insights: "If we changed X, Y would happen"
 *
 * SANDBOX / READ-ONLY: No mutations, no persistence
 */

import {
  type SimulationScenarioId,
  type ComparisonResult,
  type ComparisonMetric,
  type ImpactLevel,
  ComparisonDirection,
  ImpactLevel as ImpactLevelEnum,
  type SimulationResult,
  simulationSuccess,
  simulationFailure,
  createSimulationError,
  SimulationErrorCode,
} from './GreySimulationTypes';
import type { SimulationScenario } from './GreySimulationScenario';
import { ScenarioCategory } from './GreySimulationTypes';
import { rankScenariosByImprovement, type ScenarioRanking } from './GreySimulationComparator';
import { freezeDeep } from './GreySimulationBoundaryGuards';

// ============================================================================
// VIEW TYPES
// ============================================================================

/**
 * Executive summary view for a single simulation comparison
 */
export interface SimulationInsightView {
  readonly scenarioId: SimulationScenarioId;
  readonly scenarioName: string;
  readonly category: ScenarioCategory;
  readonly headline: string;
  readonly subheadline: string;
  readonly keyFindings: readonly KeyFinding[];
  readonly impactSummary: ImpactSummary;
  readonly recommendation: RecommendationView;
  readonly structuralStability: StructuralStabilityView;
  readonly generatedAt: number;
}

/**
 * Individual finding from simulation comparison
 */
export interface KeyFinding {
  readonly metric: string;
  readonly description: string;
  readonly impact: ImpactLevel;
  readonly direction: ComparisonDirection;
  readonly changePercentage: number;
  readonly isPositive: boolean;
}

/**
 * Aggregate impact summary
 */
export interface ImpactSummary {
  readonly totalMetricsChanged: number;
  readonly positiveChanges: number;
  readonly negativeChanges: number;
  readonly neutralChanges: number;
  readonly overallDirection: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' | 'MIXED';
  readonly aggregateImpactScore: number;
}

/**
 * Recommendation view
 */
export interface RecommendationView {
  readonly action: 'IMPLEMENT' | 'CONSIDER' | 'AVOID' | 'INVESTIGATE';
  readonly confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  readonly rationale: string;
  readonly caveats: readonly string[];
}

/**
 * Structural stability indicators
 */
export interface StructuralStabilityView {
  readonly isStable: boolean;
  readonly stabilityScore: number;
  readonly concerns: readonly StabilityConcern[];
  readonly riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export interface StabilityConcern {
  readonly area: string;
  readonly description: string;
  readonly severity: 'LOW' | 'MEDIUM' | 'HIGH';
}

/**
 * What-If analysis summary
 */
export interface WhatIfSummary {
  readonly question: string;
  readonly answer: string;
  readonly confidence: number;
  readonly supportingMetrics: readonly ComparisonMetric[];
}

/**
 * Multi-scenario comparison dashboard
 */
export interface ScenarioComparisonDashboard {
  readonly totalScenarios: number;
  readonly baselineScenarioId: SimulationScenarioId | null;
  readonly rankings: readonly ScenarioRanking[];
  readonly bestScenario: ScenarioInsightSummary | null;
  readonly worstScenario: ScenarioInsightSummary | null;
  readonly categoryBreakdown: readonly CategoryBreakdown[];
  readonly overallRecommendation: string;
  readonly generatedAt: number;
}

export interface ScenarioInsightSummary {
  readonly scenarioId: SimulationScenarioId;
  readonly scenarioName: string;
  readonly category: ScenarioCategory;
  readonly overallScore: number;
  readonly keyBenefit: string;
  readonly keyRisk: string;
}

export interface CategoryBreakdown {
  readonly category: ScenarioCategory;
  readonly scenarioCount: number;
  readonly averageImprovement: number;
  readonly bestInCategory: SimulationScenarioId | null;
}

// ============================================================================
// VIEW GENERATION FUNCTIONS
// ============================================================================

/**
 * Generate executive insight view for a single comparison
 */
export function generateInsightView(
  scenario: SimulationScenario,
  comparison: ComparisonResult
): SimulationResult<SimulationInsightView> {
  try {
    const keyFindings = extractKeyFindings(comparison.aggregateMetrics);
    const impactSummary = calculateImpactSummary(comparison.aggregateMetrics);
    const recommendation = generateRecommendation(comparison, impactSummary);
    const structuralStability = assessStructuralStability(comparison);

    const headline = generateHeadline(scenario, impactSummary);
    const subheadline = generateSubheadline(keyFindings);

    const view: SimulationInsightView = {
      scenarioId: scenario.scenarioId,
      scenarioName: scenario.name,
      category: scenario.category,
      headline,
      subheadline,
      keyFindings,
      impactSummary,
      recommendation,
      structuralStability,
      generatedAt: Date.now(),
    };

    return simulationSuccess(freezeDeep(view));
  } catch (error) {
    return simulationFailure(
      createSimulationError(
        SimulationErrorCode.SIMULATION_FAILED,
        `Failed to generate insight view: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    );
  }
}

/**
 * Generate What-If summary for specific questions
 */
export function generateWhatIfSummary(
  question: string,
  scenario: SimulationScenario,
  comparison: ComparisonResult
): WhatIfSummary {
  const relevantMetrics = findRelevantMetrics(question, comparison.aggregateMetrics);
  const answer = synthesizeAnswer(question, relevantMetrics, comparison);
  const confidence = calculateAnswerConfidence(relevantMetrics, comparison);

  return {
    question,
    answer,
    confidence,
    supportingMetrics: relevantMetrics,
  };
}

/**
 * Generate common What-If analyses
 */
export function generateStandardWhatIfs(
  scenario: SimulationScenario,
  comparison: ComparisonResult
): readonly WhatIfSummary[] {
  const questions = [
    'What happens to total rake distribution?',
    'How does this affect hierarchy stability?',
    'What is the impact on individual entities?',
    'Are there any concentration risks?',
  ];

  return questions.map(q => generateWhatIfSummary(q, scenario, comparison));
}

/**
 * Generate multi-scenario comparison dashboard
 */
export function generateComparisonDashboard(
  scenarios: readonly SimulationScenario[],
  comparisons: readonly ComparisonResult[]
): SimulationResult<ScenarioComparisonDashboard> {
  try {
    if (scenarios.length === 0 || comparisons.length === 0) {
      return simulationFailure(
        createSimulationError(
          SimulationErrorCode.INVALID_INPUT,
          'No scenarios or comparisons provided'
        )
      );
    }

    const rankings = rankScenariosByImprovement(comparisons, scenarios);
    const baselineScenario = scenarios.find(s => s.isBaseline);

    const bestScenario = rankings.length > 0
      ? createScenarioSummary(rankings[0], scenarios, comparisons)
      : null;

    const worstScenario = rankings.length > 0
      ? createScenarioSummary(rankings[rankings.length - 1], scenarios, comparisons)
      : null;

    const categoryBreakdown = calculateCategoryBreakdown(scenarios, rankings);
    const overallRecommendation = generateOverallRecommendation(rankings, categoryBreakdown);

    const dashboard: ScenarioComparisonDashboard = {
      totalScenarios: scenarios.length,
      baselineScenarioId: baselineScenario?.scenarioId ?? null,
      rankings,
      bestScenario,
      worstScenario,
      categoryBreakdown,
      overallRecommendation,
      generatedAt: Date.now(),
    };

    return simulationSuccess(dashboard);
  } catch (error) {
    return simulationFailure(
      createSimulationError(
        SimulationErrorCode.SIMULATION_FAILED,
        `Failed to generate dashboard: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    );
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function extractKeyFindings(metrics: readonly ComparisonMetric[]): readonly KeyFinding[] {
  const significantMetrics = metrics
    .filter((m: ComparisonMetric) => m.impactLevel !== ImpactLevelEnum.MINIMAL)
    .sort((a: ComparisonMetric, b: ComparisonMetric) => getImpactWeight(b.impactLevel) - getImpactWeight(a.impactLevel))
    .slice(0, 5);

  return significantMetrics.map((m: ComparisonMetric) => ({
    metric: m.metricName,
    description: generateFindingDescription(m),
    impact: m.impactLevel,
    direction: m.direction,
    changePercentage: m.deltaBasisPoints / 100, // Convert basis points to percentage
    isPositive: isPositiveChange(m),
  }));
}

function generateFindingDescription(metric: ComparisonMetric): string {
  const directionWord = metric.direction === ComparisonDirection.IMPROVEMENT ? 'improved' :
                        metric.direction === ComparisonDirection.DEGRADATION ? 'degraded' :
                        'remained stable';
  const absChange = Math.abs(metric.deltaBasisPoints / 100).toFixed(1);
  return `${metric.metricName} ${directionWord} by ${absChange}%`;
}

function getImpactWeight(impact: ImpactLevel): number {
  const weights: Record<string, number> = {
    SEVERE: 4,
    HIGH: 3,
    MODERATE: 2,
    LOW: 1,
    MINIMAL: 0,
  };
  return weights[impact] ?? 0;
}

function isPositiveChange(metric: ComparisonMetric): boolean {
  const negativeMetrics = ['risk', 'concentration', 'volatility', 'deviation'];
  const isNegativeMetric = negativeMetrics.some(nm =>
    metric.metricName.toLowerCase().includes(nm)
  );

  if (isNegativeMetric) {
    return metric.direction === ComparisonDirection.DEGRADATION;
  }
  return metric.direction === ComparisonDirection.IMPROVEMENT || metric.direction === ComparisonDirection.NEUTRAL;
}

function calculateImpactSummary(metrics: readonly ComparisonMetric[]): ImpactSummary {
  let positiveChanges = 0;
  let negativeChanges = 0;
  let neutralChanges = 0;
  let totalImpactScore = 0;

  for (const metric of metrics) {
    const weight = getImpactWeight(metric.impactLevel);
    const isPositive = isPositiveChange(metric);

    if (metric.direction === ComparisonDirection.NEUTRAL) {
      neutralChanges++;
    } else if (isPositive) {
      positiveChanges++;
      totalImpactScore += weight;
    } else {
      negativeChanges++;
      totalImpactScore -= weight;
    }
  }

  let overallDirection: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' | 'MIXED';
  if (positiveChanges > 0 && negativeChanges > 0) {
    overallDirection = 'MIXED';
  } else if (positiveChanges > negativeChanges) {
    overallDirection = 'POSITIVE';
  } else if (negativeChanges > positiveChanges) {
    overallDirection = 'NEGATIVE';
  } else {
    overallDirection = 'NEUTRAL';
  }

  return {
    totalMetricsChanged: metrics.length,
    positiveChanges,
    negativeChanges,
    neutralChanges,
    overallDirection,
    aggregateImpactScore: totalImpactScore,
  };
}

function generateRecommendation(
  comparison: ComparisonResult,
  impactSummary: ImpactSummary
): RecommendationView {
  const { overallDirection, aggregateImpactScore, positiveChanges, negativeChanges } = impactSummary;

  let action: RecommendationView['action'];
  let confidence: RecommendationView['confidence'];
  let rationale: string;
  const caveats: string[] = [];

  if (overallDirection === 'POSITIVE' && aggregateImpactScore >= 5) {
    action = 'IMPLEMENT';
    confidence = negativeChanges === 0 ? 'HIGH' : 'MEDIUM';
    rationale = `Strong positive impact with ${positiveChanges} improvements`;
  } else if (overallDirection === 'POSITIVE') {
    action = 'CONSIDER';
    confidence = 'MEDIUM';
    rationale = `Moderate positive impact detected`;
  } else if (overallDirection === 'NEGATIVE') {
    action = 'AVOID';
    confidence = aggregateImpactScore < -5 ? 'HIGH' : 'MEDIUM';
    rationale = `Negative impact outweighs benefits`;
  } else if (overallDirection === 'MIXED') {
    action = 'INVESTIGATE';
    confidence = 'LOW';
    rationale = `Mixed results require further analysis`;
    caveats.push('Some metrics improved while others degraded');
  } else {
    action = 'CONSIDER';
    confidence = 'LOW';
    rationale = `Minimal impact detected`;
  }

  if (negativeChanges > 0) {
    caveats.push(`${negativeChanges} metric(s) showed negative changes`);
  }

  // Check for degradations in summary
  if (comparison.summary.entitiesDegraded > comparison.summary.entitiesImproved) {
    caveats.push('Structural stability concerns detected');
  }

  return {
    action,
    confidence,
    rationale,
    caveats,
  };
}

function assessStructuralStability(comparison: ComparisonResult): StructuralStabilityView {
  const concerns: StabilityConcern[] = [];
  let stabilityScore = 100;

  const hierarchyMetrics = comparison.aggregateMetrics.filter((m: ComparisonMetric) =>
    m.metricName.toLowerCase().includes('hierarchy') ||
    m.metricName.toLowerCase().includes('depth') ||
    m.metricName.toLowerCase().includes('structure')
  );

  for (const metric of hierarchyMetrics) {
    if (metric.impactLevel === ImpactLevelEnum.HIGH || metric.impactLevel === ImpactLevelEnum.SEVERE) {
      concerns.push({
        area: 'Hierarchy Structure',
        description: `Significant change in ${metric.metricName}`,
        severity: metric.impactLevel === ImpactLevelEnum.SEVERE ? 'HIGH' : 'MEDIUM',
      });
      stabilityScore -= metric.impactLevel === ImpactLevelEnum.SEVERE ? 30 : 15;
    }
  }

  const concentrationMetrics = comparison.aggregateMetrics.filter((m: ComparisonMetric) =>
    m.metricName.toLowerCase().includes('concentration')
  );

  for (const metric of concentrationMetrics) {
    if (metric.direction === ComparisonDirection.DEGRADATION && metric.impactLevel !== ImpactLevelEnum.MINIMAL) {
      concerns.push({
        area: 'Concentration Risk',
        description: `Increased concentration in ${metric.metricName}`,
        severity: metric.impactLevel === ImpactLevelEnum.HIGH ? 'HIGH' : 'MEDIUM',
      });
      stabilityScore -= metric.impactLevel === ImpactLevelEnum.HIGH ? 20 : 10;
    }
  }

  stabilityScore = Math.max(0, stabilityScore);

  let riskLevel: StructuralStabilityView['riskLevel'];
  if (stabilityScore >= 80) {
    riskLevel = 'LOW';
  } else if (stabilityScore >= 60) {
    riskLevel = 'MEDIUM';
  } else if (stabilityScore >= 40) {
    riskLevel = 'HIGH';
  } else {
    riskLevel = 'CRITICAL';
  }

  return {
    isStable: stabilityScore >= 60,
    stabilityScore,
    concerns,
    riskLevel,
  };
}

function generateHeadline(
  scenario: SimulationScenario,
  impactSummary: ImpactSummary
): string {
  const { overallDirection, aggregateImpactScore } = impactSummary;

  if (overallDirection === 'POSITIVE' && aggregateImpactScore >= 5) {
    return `${scenario.name}: Strong Positive Impact`;
  } else if (overallDirection === 'POSITIVE') {
    return `${scenario.name}: Moderate Improvement`;
  } else if (overallDirection === 'NEGATIVE') {
    return `${scenario.name}: Negative Impact Detected`;
  } else if (overallDirection === 'MIXED') {
    return `${scenario.name}: Mixed Results`;
  }
  return `${scenario.name}: Minimal Change`;
}

function generateSubheadline(keyFindings: readonly KeyFinding[]): string {
  if (keyFindings.length === 0) {
    return 'No significant changes detected';
  }

  const topFinding = keyFindings[0];
  return topFinding.description;
}

function findRelevantMetrics(
  question: string,
  metrics: readonly ComparisonMetric[]
): readonly ComparisonMetric[] {
  const questionLower = question.toLowerCase();

  const keywords: Record<string, string[]> = {
    rake: ['rake', 'distribution', 'share', 'split'],
    hierarchy: ['hierarchy', 'structure', 'depth', 'level'],
    entity: ['entity', 'individual', 'agent', 'club'],
    concentration: ['concentration', 'risk', 'balance'],
  };

  for (const [_category, words] of Object.entries(keywords)) {
    if (words.some(w => questionLower.includes(w))) {
      return metrics.filter(m =>
        words.some(w => m.metricName.toLowerCase().includes(w))
      );
    }
  }

  return metrics.slice(0, 5);
}

function synthesizeAnswer(
  question: string,
  relevantMetrics: readonly ComparisonMetric[],
  comparison: ComparisonResult
): string {
  if (relevantMetrics.length === 0) {
    return 'No specific data available for this question';
  }

  const improvements = relevantMetrics.filter((m: ComparisonMetric) => isPositiveChange(m));
  const degradations = relevantMetrics.filter((m: ComparisonMetric) => !isPositiveChange(m) && m.direction !== ComparisonDirection.NEUTRAL);

  if (improvements.length > degradations.length) {
    const topImprovement = improvements[0];
    return `Positive impact: ${topImprovement.metricName} shows ${Math.abs(topImprovement.deltaBasisPoints / 100).toFixed(1)}% improvement`;
  } else if (degradations.length > 0) {
    const topDegradation = degradations[0];
    return `Caution: ${topDegradation.metricName} shows ${Math.abs(topDegradation.deltaBasisPoints / 100).toFixed(1)}% degradation`;
  }

  return 'Minimal impact detected in relevant metrics';
}

function calculateAnswerConfidence(
  relevantMetrics: readonly ComparisonMetric[],
  _comparison: ComparisonResult
): number {
  if (relevantMetrics.length === 0) return 0;

  const avgImpact = relevantMetrics.reduce((sum, m: ComparisonMetric) => sum + getImpactWeight(m.impactLevel), 0)
    / relevantMetrics.length;

  const baseConfidence = Math.min(relevantMetrics.length / 3, 1);
  const impactConfidence = avgImpact / 4;

  return Math.min((baseConfidence + impactConfidence) / 2, 1);
}

function createScenarioSummary(
  ranking: ScenarioRanking,
  scenarios: readonly SimulationScenario[],
  comparisons: readonly ComparisonResult[]
): ScenarioInsightSummary | null {
  const scenario = scenarios.find(s => s.scenarioId === ranking.scenarioId);
  const comparison = comparisons.find(c => c.scenarioId === ranking.scenarioId);

  if (!scenario || !comparison) return null;

  const positiveMetrics = comparison.aggregateMetrics.filter((m: ComparisonMetric) => isPositiveChange(m));
  const negativeMetrics = comparison.aggregateMetrics.filter((m: ComparisonMetric) => !isPositiveChange(m) && m.direction !== ComparisonDirection.NEUTRAL);

  const keyBenefit = positiveMetrics.length > 0
    ? `${positiveMetrics[0].metricName} improved by ${Math.abs(positiveMetrics[0].deltaBasisPoints / 100).toFixed(1)}%`
    : 'No significant benefits';

  const keyRisk = negativeMetrics.length > 0
    ? `${negativeMetrics[0].metricName} degraded by ${Math.abs(negativeMetrics[0].deltaBasisPoints / 100).toFixed(1)}%`
    : 'No significant risks';

  return {
    scenarioId: scenario.scenarioId,
    scenarioName: scenario.name,
    category: scenario.category,
    overallScore: ranking.overallScore,
    keyBenefit,
    keyRisk,
  };
}

function calculateCategoryBreakdown(
  scenarios: readonly SimulationScenario[],
  rankings: readonly ScenarioRanking[]
): readonly CategoryBreakdown[] {
  const categories: ScenarioCategory[] = [
    'OPTIMIZATION',
    'RISK_REDUCTION',
    'STRUCTURAL',
    'EXPLORATION',
    'STRESS_TEST',
  ];

  return categories.map(category => {
    const categoryScenarios = scenarios.filter(s => s.category === category);
    const categoryRankings = rankings.filter(r =>
      categoryScenarios.some(s => s.scenarioId === r.scenarioId)
    );

    const averageImprovement = categoryRankings.length > 0
      ? categoryRankings.reduce((sum, r) => sum + r.overallScore, 0) / categoryRankings.length
      : 0;

    const bestInCategory = categoryRankings.length > 0
      ? categoryRankings.sort((a, b) => b.overallScore - a.overallScore)[0].scenarioId as SimulationScenarioId
      : null;

    return {
      category,
      scenarioCount: categoryScenarios.length,
      averageImprovement,
      bestInCategory,
    };
  }).filter(b => b.scenarioCount > 0);
}

function generateOverallRecommendation(
  rankings: readonly ScenarioRanking[],
  categoryBreakdown: readonly CategoryBreakdown[]
): string {
  if (rankings.length === 0) {
    return 'No scenarios available for comparison';
  }

  const bestRanking = rankings[0];
  const bestCategory = categoryBreakdown
    .filter(c => c.scenarioCount > 0)
    .sort((a, b) => b.averageImprovement - a.averageImprovement)[0];

  if (bestRanking.overallScore > 50) {
    return `Strong recommendation: Implement scenario with highest improvement score (${bestRanking.overallScore.toFixed(0)}). Focus on ${bestCategory?.category ?? 'optimization'} strategies.`;
  } else if (bestRanking.overallScore > 20) {
    return `Moderate recommendation: Consider implementing top scenario for incremental improvement. ${bestCategory?.category ?? 'Optimization'} category shows most promise.`;
  } else if (bestRanking.overallScore > 0) {
    return `Cautious recommendation: Minor improvements possible. Further investigation recommended before implementation.`;
  }

  return `No clear recommendation: Scenarios show minimal or negative impact. Consider alternative approaches.`;
}

// ============================================================================
// FORMATTING UTILITIES
// ============================================================================

/**
 * Format insight view for display
 */
export function formatInsightViewForDisplay(view: SimulationInsightView): string {
  const lines: string[] = [];

  lines.push(`═══════════════════════════════════════`);
  lines.push(`  ${view.headline}`);
  lines.push(`  ${view.subheadline}`);
  lines.push(`═══════════════════════════════════════`);
  lines.push('');
  lines.push(`Category: ${view.category}`);
  lines.push('');
  lines.push('KEY FINDINGS:');

  for (const finding of view.keyFindings) {
    const icon = finding.isPositive ? '✓' : '✗';
    lines.push(`  ${icon} ${finding.description} [${finding.impact}]`);
  }

  lines.push('');
  lines.push('IMPACT SUMMARY:');
  lines.push(`  Overall: ${view.impactSummary.overallDirection}`);
  lines.push(`  Positive: ${view.impactSummary.positiveChanges} | Negative: ${view.impactSummary.negativeChanges} | Neutral: ${view.impactSummary.neutralChanges}`);

  lines.push('');
  lines.push('RECOMMENDATION:');
  lines.push(`  Action: ${view.recommendation.action}`);
  lines.push(`  Confidence: ${view.recommendation.confidence}`);
  lines.push(`  ${view.recommendation.rationale}`);

  if (view.recommendation.caveats.length > 0) {
    lines.push('  Caveats:');
    for (const caveat of view.recommendation.caveats) {
      lines.push(`    - ${caveat}`);
    }
  }

  lines.push('');
  lines.push('STRUCTURAL STABILITY:');
  lines.push(`  Risk Level: ${view.structuralStability.riskLevel}`);
  lines.push(`  Score: ${view.structuralStability.stabilityScore}/100`);

  if (view.structuralStability.concerns.length > 0) {
    lines.push('  Concerns:');
    for (const concern of view.structuralStability.concerns) {
      lines.push(`    - [${concern.severity}] ${concern.area}: ${concern.description}`);
    }
  }

  return lines.join('\n');
}

/**
 * Format dashboard for display
 */
export function formatDashboardForDisplay(dashboard: ScenarioComparisonDashboard): string {
  const lines: string[] = [];

  lines.push(`╔═══════════════════════════════════════════╗`);
  lines.push(`║     SCENARIO COMPARISON DASHBOARD         ║`);
  lines.push(`╚═══════════════════════════════════════════╝`);
  lines.push('');
  lines.push(`Total Scenarios: ${dashboard.totalScenarios}`);
  lines.push('');

  if (dashboard.bestScenario) {
    lines.push('BEST SCENARIO:');
    lines.push(`  ${dashboard.bestScenario.scenarioName}`);
    lines.push(`  Overall Score: ${dashboard.bestScenario.overallScore.toFixed(1)}`);
    lines.push(`  Key Benefit: ${dashboard.bestScenario.keyBenefit}`);
    lines.push(`  Key Risk: ${dashboard.bestScenario.keyRisk}`);
    lines.push('');
  }

  if (dashboard.worstScenario) {
    lines.push('WORST SCENARIO:');
    lines.push(`  ${dashboard.worstScenario.scenarioName}`);
    lines.push(`  Overall Score: ${dashboard.worstScenario.overallScore.toFixed(1)}`);
    lines.push('');
  }

  lines.push('CATEGORY BREAKDOWN:');
  for (const cat of dashboard.categoryBreakdown) {
    lines.push(`  ${cat.category}: ${cat.scenarioCount} scenario(s), avg improvement: ${cat.averageImprovement.toFixed(1)}`);
  }

  lines.push('');
  lines.push('RANKINGS:');
  for (let i = 0; i < Math.min(dashboard.rankings.length, 5); i++) {
    const r = dashboard.rankings[i];
    lines.push(`  ${i + 1}. Score: ${r.overallScore.toFixed(1)} | Health: ${r.healthImprovement.toFixed(1)}`);
  }

  lines.push('');
  lines.push('RECOMMENDATION:');
  lines.push(`  ${dashboard.overallRecommendation}`);

  return lines.join('\n');
}
