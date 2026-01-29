/**
 * GreyAnomalyClassifier.ts
 * Phase A5 - Grey Intelligence & Risk Insight Layer
 *
 * ANOMALY CLASSIFIER
 *
 * This module classifies anomalies WITHOUT enforcement.
 * It detects patterns that may indicate risk but takes no action.
 *
 * Anomaly types:
 * - Flow concentration (too many flows to/from one entity)
 * - Attribution skew (imbalanced attribution distribution)
 * - Agent over-extraction (agent taking unusual share)
 * - Recharge mismatch (recharge-flow alignment issues)
 * - Table wash pattern (suspicious cycling patterns)
 * - High orphan rate (many unmatched flows)
 * - Attribution gap (flows missing attribution)
 * - Volume spike (sudden volume changes)
 *
 * @external This module operates OUTSIDE the frozen engine.
 * @readonly This module NEVER mutates any data.
 * @deterministic Same inputs always produce same outputs.
 */

import { GreyPartyId } from '../grey-runtime';
import { ReconciliationPeriodId } from '../grey-reconciliation';
import {
  AnomalyDescriptor,
  AnomalyId,
  AnomalyType,
  AnomalySeverity,
  IntelligenceEntityType,
  IntelligenceResult,
  IntelligenceErrorCode,
  createAnomalyId,
  intelligenceSuccess,
  intelligenceFailure,
  createIntelligenceError,
  isValidTimestamp,
  calculateChecksum,
} from './GreyIntelligenceTypes';
import {
  FlowHealthData,
  AttributionHealthData,
  RechargeHealthData,
} from './GreyHealthScoringEngine';

// ============================================================================
// THRESHOLD CONSTANTS
// ============================================================================

/**
 * Thresholds for anomaly detection.
 * All percentages are in basis points (10000 = 100%).
 */
export const ANOMALY_THRESHOLDS = {
  /** Flow concentration: single counterparty > 60% */
  FLOW_CONCENTRATION_HIGH: 6000,
  FLOW_CONCENTRATION_MEDIUM: 4000,

  /** Attribution skew: single party type > 80% */
  ATTRIBUTION_SKEW_HIGH: 8000,
  ATTRIBUTION_SKEW_MEDIUM: 6500,

  /** Agent over-extraction: agent > 15% of attribution */
  AGENT_OVER_EXTRACTION_HIGH: 1500,
  AGENT_OVER_EXTRACTION_MEDIUM: 1000,

  /** Recharge mismatch: link rate < 50% */
  RECHARGE_MISMATCH_HIGH: 5000,
  RECHARGE_MISMATCH_MEDIUM: 7000,

  /** High orphan rate: > 20% orphans */
  HIGH_ORPHAN_RATE_HIGH: 2000,
  HIGH_ORPHAN_RATE_MEDIUM: 1000,

  /** Attribution gap: > 30% flows missing attribution */
  ATTRIBUTION_GAP_HIGH: 3000,
  ATTRIBUTION_GAP_MEDIUM: 1500,

  /** Volume spike: > 200% of previous period */
  VOLUME_SPIKE_HIGH: 20000,
  VOLUME_SPIKE_MEDIUM: 15000,

  /** Minimum flows required for analysis */
  MIN_FLOWS_FOR_ANALYSIS: 5,

  /** Confidence threshold for reporting */
  MIN_CONFIDENCE: 50,
} as const;

// ============================================================================
// ANOMALY INPUT TYPES
// ============================================================================

/**
 * Input data for anomaly classification.
 */
export interface AnomalyClassificationInput {
  readonly entityId: GreyPartyId;
  readonly entityType: IntelligenceEntityType;
  readonly periodId: ReconciliationPeriodId;
  readonly timestamp: number;
  readonly flowData: FlowHealthData;
  readonly attributionData: AttributionHealthData;
  readonly rechargeData: RechargeHealthData;
  /** Previous period flow count for volume comparison */
  readonly previousPeriodFlowCount?: number;
  /** Previous period attribution count for comparison */
  readonly previousPeriodAttributionCount?: number;
}

/**
 * Output from anomaly classification.
 */
export interface AnomalyClassificationOutput {
  readonly entityId: GreyPartyId;
  readonly entityType: IntelligenceEntityType;
  readonly periodId: ReconciliationPeriodId;
  readonly timestamp: number;
  readonly anomalies: readonly AnomalyDescriptor[];
  readonly totalAnomalies: number;
  readonly criticalCount: number;
  readonly alertCount: number;
  readonly warningCount: number;
  readonly infoCount: number;
  readonly checksum: string;
}

// ============================================================================
// INDIVIDUAL ANOMALY DETECTORS
// ============================================================================

/**
 * Detect flow concentration anomaly.
 */
function detectFlowConcentration(
  input: AnomalyClassificationInput,
  timestamp: number
): AnomalyDescriptor | null {
  const { flowData, entityId, entityType, periodId } = input;

  if (flowData.totalFlows < ANOMALY_THRESHOLDS.MIN_FLOWS_FOR_ANALYSIS) {
    return null;
  }

  // Find max concentration
  let maxConcentration = 0;
  let maxCounterparty = '';

  for (const [counterparty, count] of flowData.flowsByCounterparty) {
    const concentration = Math.floor((count * 10000) / flowData.totalFlows);
    if (concentration > maxConcentration) {
      maxConcentration = concentration;
      maxCounterparty = counterparty;
    }
  }

  if (maxConcentration < ANOMALY_THRESHOLDS.FLOW_CONCENTRATION_MEDIUM) {
    return null;
  }

  const severity =
    maxConcentration >= ANOMALY_THRESHOLDS.FLOW_CONCENTRATION_HIGH
      ? AnomalySeverity.ALERT
      : AnomalySeverity.WARNING;

  const confidence = Math.min(100, Math.floor(maxConcentration / 100));

  const anomalyId = createAnomalyId(
    `anom_fc_${entityId}_${periodId}_${timestamp}`
  );

  const description =
    `Flow concentration detected: ${Math.floor(maxConcentration / 100)}% of flows ` +
    `involve counterparty ${maxCounterparty}`;

  return createAnomalyDescriptor(
    anomalyId,
    AnomalyType.FLOW_CONCENTRATION,
    severity,
    entityId,
    entityType,
    periodId,
    timestamp,
    description,
    [maxCounterparty],
    confidence
  );
}

/**
 * Detect attribution skew anomaly.
 */
function detectAttributionSkew(
  input: AnomalyClassificationInput,
  timestamp: number
): AnomalyDescriptor | null {
  const { attributionData, entityId, entityType, periodId } = input;

  if (attributionData.totalEntries === 0) {
    return null;
  }

  const maxBasisPoints = attributionData.maxSinglePartyBasisPoints;

  if (maxBasisPoints < ANOMALY_THRESHOLDS.ATTRIBUTION_SKEW_MEDIUM) {
    return null;
  }

  const severity =
    maxBasisPoints >= ANOMALY_THRESHOLDS.ATTRIBUTION_SKEW_HIGH
      ? AnomalySeverity.ALERT
      : AnomalySeverity.WARNING;

  const confidence = Math.min(100, Math.floor(maxBasisPoints / 100));

  const anomalyId = createAnomalyId(
    `anom_as_${entityId}_${periodId}_${timestamp}`
  );

  const description =
    `Attribution skew detected: single party receives ${Math.floor(maxBasisPoints / 100)}% of attribution`;

  return createAnomalyDescriptor(
    anomalyId,
    AnomalyType.ATTRIBUTION_SKEW,
    severity,
    entityId,
    entityType,
    periodId,
    timestamp,
    description,
    [],
    confidence
  );
}

/**
 * Detect agent over-extraction anomaly.
 */
function detectAgentOverExtraction(
  input: AnomalyClassificationInput,
  timestamp: number
): AnomalyDescriptor | null {
  const { attributionData, entityId, entityType, periodId } = input;

  // Get agent share from distribution
  const agentShare = attributionData.distributionByPartyType.get('AGENT') || 0;

  if (agentShare < ANOMALY_THRESHOLDS.AGENT_OVER_EXTRACTION_MEDIUM) {
    return null;
  }

  const severity =
    agentShare >= ANOMALY_THRESHOLDS.AGENT_OVER_EXTRACTION_HIGH
      ? AnomalySeverity.CRITICAL
      : AnomalySeverity.ALERT;

  const confidence = Math.min(100, 70 + Math.floor((agentShare - 1000) / 50));

  const anomalyId = createAnomalyId(
    `anom_aoe_${entityId}_${periodId}_${timestamp}`
  );

  const description =
    `Agent over-extraction detected: agent receives ${(agentShare / 100).toFixed(1)}% of attribution`;

  return createAnomalyDescriptor(
    anomalyId,
    AnomalyType.AGENT_OVER_EXTRACTION,
    severity,
    entityId,
    entityType,
    periodId,
    timestamp,
    description,
    [],
    confidence
  );
}

/**
 * Detect recharge mismatch anomaly.
 */
function detectRechargeMismatch(
  input: AnomalyClassificationInput,
  timestamp: number
): AnomalyDescriptor | null {
  const { rechargeData, entityId, entityType, periodId } = input;

  if (rechargeData.totalRecharges === 0) {
    return null;
  }

  const linkRate = Math.floor(
    (rechargeData.linkedRecharges * 10000) / rechargeData.totalRecharges
  );

  // Low link rate is the anomaly
  if (linkRate >= ANOMALY_THRESHOLDS.RECHARGE_MISMATCH_MEDIUM) {
    return null;
  }

  const severity =
    linkRate < ANOMALY_THRESHOLDS.RECHARGE_MISMATCH_HIGH
      ? AnomalySeverity.ALERT
      : AnomalySeverity.WARNING;

  const confidence = Math.min(100, 100 - Math.floor(linkRate / 100));

  const anomalyId = createAnomalyId(
    `anom_rm_${entityId}_${periodId}_${timestamp}`
  );

  const description =
    `Recharge mismatch detected: only ${Math.floor(linkRate / 100)}% of recharges linked to flows`;

  return createAnomalyDescriptor(
    anomalyId,
    AnomalyType.RECHARGE_MISMATCH,
    severity,
    entityId,
    entityType,
    periodId,
    timestamp,
    description,
    [],
    confidence
  );
}

/**
 * Detect high orphan rate anomaly.
 */
function detectHighOrphanRate(
  input: AnomalyClassificationInput,
  timestamp: number
): AnomalyDescriptor | null {
  const { flowData, entityId, entityType, periodId } = input;

  if (flowData.totalFlows < ANOMALY_THRESHOLDS.MIN_FLOWS_FOR_ANALYSIS) {
    return null;
  }

  const orphanRate = Math.floor(
    (flowData.orphanFlows * 10000) / flowData.totalFlows
  );

  if (orphanRate < ANOMALY_THRESHOLDS.HIGH_ORPHAN_RATE_MEDIUM) {
    return null;
  }

  const severity =
    orphanRate >= ANOMALY_THRESHOLDS.HIGH_ORPHAN_RATE_HIGH
      ? AnomalySeverity.ALERT
      : AnomalySeverity.WARNING;

  const confidence = Math.min(100, 60 + Math.floor(orphanRate / 250));

  const anomalyId = createAnomalyId(
    `anom_hor_${entityId}_${periodId}_${timestamp}`
  );

  const description =
    `High orphan rate detected: ${Math.floor(orphanRate / 100)}% of flows are orphans`;

  return createAnomalyDescriptor(
    anomalyId,
    AnomalyType.HIGH_ORPHAN_RATE,
    severity,
    entityId,
    entityType,
    periodId,
    timestamp,
    description,
    [],
    confidence
  );
}

/**
 * Detect attribution gap anomaly.
 */
function detectAttributionGap(
  input: AnomalyClassificationInput,
  timestamp: number
): AnomalyDescriptor | null {
  const { attributionData, entityId, entityType, periodId } = input;

  if (attributionData.totalEntries === 0) {
    return null;
  }

  const gapRate = Math.floor(
    (attributionData.zeroAttributionEntries * 10000) / attributionData.totalEntries
  );

  if (gapRate < ANOMALY_THRESHOLDS.ATTRIBUTION_GAP_MEDIUM) {
    return null;
  }

  const severity =
    gapRate >= ANOMALY_THRESHOLDS.ATTRIBUTION_GAP_HIGH
      ? AnomalySeverity.ALERT
      : AnomalySeverity.WARNING;

  const confidence = Math.min(100, 50 + Math.floor(gapRate / 200));

  const anomalyId = createAnomalyId(
    `anom_ag_${entityId}_${periodId}_${timestamp}`
  );

  const description =
    `Attribution gap detected: ${Math.floor(gapRate / 100)}% of entries have zero attribution`;

  return createAnomalyDescriptor(
    anomalyId,
    AnomalyType.ATTRIBUTION_GAP,
    severity,
    entityId,
    entityType,
    periodId,
    timestamp,
    description,
    [],
    confidence
  );
}

/**
 * Detect volume spike anomaly.
 */
function detectVolumeSpike(
  input: AnomalyClassificationInput,
  timestamp: number
): AnomalyDescriptor | null {
  const { flowData, entityId, entityType, periodId, previousPeriodFlowCount } = input;

  if (previousPeriodFlowCount === undefined || previousPeriodFlowCount === 0) {
    return null;
  }

  // Calculate ratio in basis points (10000 = 100%)
  const ratio = Math.floor((flowData.totalFlows * 10000) / previousPeriodFlowCount);

  if (ratio < ANOMALY_THRESHOLDS.VOLUME_SPIKE_MEDIUM) {
    return null;
  }

  const severity =
    ratio >= ANOMALY_THRESHOLDS.VOLUME_SPIKE_HIGH
      ? AnomalySeverity.ALERT
      : AnomalySeverity.WARNING;

  const confidence = Math.min(100, 50 + Math.floor((ratio - 10000) / 200));

  const anomalyId = createAnomalyId(
    `anom_vs_${entityId}_${periodId}_${timestamp}`
  );

  const description =
    `Volume spike detected: ${Math.floor(ratio / 100)}% of previous period ` +
    `(${flowData.totalFlows} vs ${previousPeriodFlowCount} flows)`;

  return createAnomalyDescriptor(
    anomalyId,
    AnomalyType.VOLUME_SPIKE,
    severity,
    entityId,
    entityType,
    periodId,
    timestamp,
    description,
    [],
    confidence
  );
}

/**
 * Detect table wash pattern (cycling).
 * This looks for suspicious patterns where value cycles through the table
 * without legitimate play.
 */
function detectTableWashPattern(
  input: AnomalyClassificationInput,
  timestamp: number
): AnomalyDescriptor | null {
  const { flowData, entityId, entityType, periodId } = input;

  // Only applies to TABLE entities
  if (entityType !== IntelligenceEntityType.TABLE) {
    return null;
  }

  if (flowData.totalFlows < ANOMALY_THRESHOLDS.MIN_FLOWS_FOR_ANALYSIS * 2) {
    return null;
  }

  // Wash pattern indicators:
  // 1. High flow count with very few unique counterparties
  // 2. High matched rate but suspicious concentration

  const counterpartyRatio = Math.floor(
    (flowData.uniqueCounterparties * 10000) / flowData.totalFlows
  );

  // If ratio is very low (< 5%), might indicate cycling
  if (counterpartyRatio > 500) {
    return null;
  }

  // Check if there's a high match rate (good) but concentrated (suspicious)
  const matchRate = Math.floor((flowData.matchedFlows * 10000) / flowData.totalFlows);

  if (matchRate < 8000) {
    // Not a wash pattern if match rate is low
    return null;
  }

  const severity = counterpartyRatio < 200 ? AnomalySeverity.CRITICAL : AnomalySeverity.ALERT;
  const confidence = Math.min(100, 80 - Math.floor(counterpartyRatio / 10));

  const anomalyId = createAnomalyId(
    `anom_twp_${entityId}_${periodId}_${timestamp}`
  );

  const description =
    `Table wash pattern suspected: ${flowData.totalFlows} flows among only ` +
    `${flowData.uniqueCounterparties} counterparties (${(counterpartyRatio / 100).toFixed(1)}% diversity)`;

  return createAnomalyDescriptor(
    anomalyId,
    AnomalyType.TABLE_WASH_PATTERN,
    severity,
    entityId,
    entityType,
    periodId,
    timestamp,
    description,
    [],
    confidence
  );
}

// ============================================================================
// MAIN CLASSIFICATION FUNCTION
// ============================================================================

/**
 * Classify anomalies for an entity.
 *
 * @param input - Anomaly classification input
 * @returns Result with classification output
 */
export function classifyAnomalies(
  input: AnomalyClassificationInput
): IntelligenceResult<AnomalyClassificationOutput> {
  // Validate timestamp
  if (!isValidTimestamp(input.timestamp)) {
    return intelligenceFailure(
      createIntelligenceError(
        IntelligenceErrorCode.INVALID_TIMESTAMP,
        `Invalid timestamp: ${input.timestamp}`
      )
    );
  }

  const detectors = [
    detectFlowConcentration,
    detectAttributionSkew,
    detectAgentOverExtraction,
    detectRechargeMismatch,
    detectHighOrphanRate,
    detectAttributionGap,
    detectVolumeSpike,
    detectTableWashPattern,
  ];

  const anomalies: AnomalyDescriptor[] = [];

  for (const detector of detectors) {
    const anomaly = detector(input, input.timestamp);
    if (anomaly && anomaly.confidence >= ANOMALY_THRESHOLDS.MIN_CONFIDENCE) {
      anomalies.push(anomaly);
    }
  }

  // Sort by severity (critical first) then confidence
  anomalies.sort((a, b) => {
    const severityOrder = {
      [AnomalySeverity.CRITICAL]: 0,
      [AnomalySeverity.ALERT]: 1,
      [AnomalySeverity.WARNING]: 2,
      [AnomalySeverity.INFO]: 3,
    };
    const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
    if (severityDiff !== 0) return severityDiff;
    return b.confidence - a.confidence;
  });

  // Count by severity
  let criticalCount = 0;
  let alertCount = 0;
  let warningCount = 0;
  let infoCount = 0;

  for (const anomaly of anomalies) {
    switch (anomaly.severity) {
      case AnomalySeverity.CRITICAL:
        criticalCount++;
        break;
      case AnomalySeverity.ALERT:
        alertCount++;
        break;
      case AnomalySeverity.WARNING:
        warningCount++;
        break;
      case AnomalySeverity.INFO:
        infoCount++;
        break;
    }
  }

  const checksumData = {
    entityId: input.entityId,
    entityType: input.entityType,
    periodId: input.periodId,
    timestamp: input.timestamp,
    anomalyCount: anomalies.length,
    anomalyTypes: anomalies.map((a) => a.anomalyType),
  };

  const output: AnomalyClassificationOutput = Object.freeze({
    entityId: input.entityId,
    entityType: input.entityType,
    periodId: input.periodId,
    timestamp: input.timestamp,
    anomalies: Object.freeze(anomalies),
    totalAnomalies: anomalies.length,
    criticalCount,
    alertCount,
    warningCount,
    infoCount,
    checksum: calculateChecksum('ac', checksumData),
  });

  return intelligenceSuccess(output);
}

// ============================================================================
// BATCH CLASSIFICATION
// ============================================================================

/**
 * Classify anomalies for multiple entities.
 */
export function classifyAnomaliesBatch(
  inputs: readonly AnomalyClassificationInput[]
): IntelligenceResult<readonly AnomalyClassificationOutput[]> {
  const outputs: AnomalyClassificationOutput[] = [];
  const errors: string[] = [];

  for (const input of inputs) {
    const result = classifyAnomalies(input);
    if (result.success) {
      outputs.push(result.value);
    } else {
      errors.push(`${input.entityId}: ${result.error.message}`);
    }
  }

  if (outputs.length === 0 && errors.length > 0) {
    return intelligenceFailure(
      createIntelligenceError(
        IntelligenceErrorCode.INVALID_INPUT,
        `All classification failed: ${errors.join('; ')}`
      )
    );
  }

  return intelligenceSuccess(Object.freeze(outputs));
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create an anomaly descriptor with checksum.
 */
function createAnomalyDescriptor(
  anomalyId: AnomalyId,
  anomalyType: AnomalyType,
  severity: AnomalySeverity,
  entityId: GreyPartyId,
  entityType: IntelligenceEntityType,
  periodId: ReconciliationPeriodId,
  timestamp: number,
  description: string,
  relatedIds: readonly string[],
  confidence: number
): AnomalyDescriptor {
  const checksumData = {
    anomalyId,
    anomalyType,
    severity,
    entityId,
    entityType,
    periodId,
    timestamp,
    description,
    relatedIds,
    confidence,
  };

  return Object.freeze({
    anomalyId,
    anomalyType,
    severity,
    entityId,
    entityType,
    periodId,
    timestamp,
    description,
    relatedIds: Object.freeze([...relatedIds]),
    confidence,
    checksum: calculateChecksum('anom', checksumData),
  });
}

/**
 * Get all anomalies of a specific type from output.
 */
export function getAnomaliesByType(
  output: AnomalyClassificationOutput,
  anomalyType: AnomalyType
): readonly AnomalyDescriptor[] {
  return Object.freeze(
    output.anomalies.filter((a) => a.anomalyType === anomalyType)
  );
}

/**
 * Get all anomalies of a specific severity from output.
 */
export function getAnomaliesBySeverity(
  output: AnomalyClassificationOutput,
  severity: AnomalySeverity
): readonly AnomalyDescriptor[] {
  return Object.freeze(output.anomalies.filter((a) => a.severity === severity));
}

/**
 * Check if output has any critical anomalies.
 */
export function hasCriticalAnomalies(output: AnomalyClassificationOutput): boolean {
  return output.criticalCount > 0;
}

/**
 * Get the highest severity level in output.
 */
export function getHighestSeverity(
  output: AnomalyClassificationOutput
): AnomalySeverity | null {
  if (output.totalAnomalies === 0) return null;
  if (output.criticalCount > 0) return AnomalySeverity.CRITICAL;
  if (output.alertCount > 0) return AnomalySeverity.ALERT;
  if (output.warningCount > 0) return AnomalySeverity.WARNING;
  return AnomalySeverity.INFO;
}
