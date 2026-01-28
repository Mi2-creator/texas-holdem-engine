/**
 * ExportJson.ts
 * Phase 27 - JSON Export Adapter (read-only)
 *
 * Exports report data to canonical JSON format.
 * Pure function with deterministic output.
 *
 * HARD CONSTRAINTS:
 * - No side effects
 * - Deterministic output for same input
 * - Stable key ordering
 */

import {
  ExportResult,
  ExportOptions,
  ReportResult,
  ReportMetadata,
  PlatformRevenueReportData,
  ClubRevenueReportData,
  AgentCommissionReportData,
  TableSessionReportData,
} from './ReportTypes';

// ============================================================================
// JSON Export Functions
// ============================================================================

/**
 * Export report to JSON format
 */
export function exportToJson<T>(
  report: ReportResult<T>,
  options: ExportOptions = { format: 'JSON' }
): ExportResult {
  const exportedAt = Date.now();

  try {
    if (!report.success || !report.data) {
      return {
        success: false,
        error: report.error ?? 'No data to export',
        format: 'JSON',
        byteSize: 0,
        exportedAt,
      };
    }

    // Build export object with stable key ordering
    const exportObj = options.includeMetadata !== false
      ? { metadata: report.metadata, data: report.data }
      : report.data;

    // Convert to JSON with deterministic ordering
    const content = options.prettyPrint
      ? JSON.stringify(exportObj, sortedReplacer, 2)
      : JSON.stringify(exportObj, sortedReplacer);

    return {
      success: true,
      content,
      format: 'JSON',
      byteSize: Buffer.byteLength(content, 'utf8'),
      exportedAt,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Export failed',
      format: 'JSON',
      byteSize: 0,
      exportedAt,
    };
  }
}

/**
 * Export platform revenue report to JSON
 */
export function exportPlatformRevenueJson(
  report: ReportResult<PlatformRevenueReportData>,
  options?: Partial<ExportOptions>
): ExportResult {
  return exportToJson(report, { format: 'JSON', ...options });
}

/**
 * Export club revenue report to JSON
 */
export function exportClubRevenueJson(
  report: ReportResult<ClubRevenueReportData>,
  options?: Partial<ExportOptions>
): ExportResult {
  return exportToJson(report, { format: 'JSON', ...options });
}

/**
 * Export agent commission report to JSON
 */
export function exportAgentCommissionJson(
  report: ReportResult<AgentCommissionReportData>,
  options?: Partial<ExportOptions>
): ExportResult {
  return exportToJson(report, { format: 'JSON', ...options });
}

/**
 * Export table session report to JSON
 */
export function exportTableSessionJson(
  report: ReportResult<TableSessionReportData>,
  options?: Partial<ExportOptions>
): ExportResult {
  return exportToJson(report, { format: 'JSON', ...options });
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * JSON replacer function that ensures deterministic key ordering
 */
function sortedReplacer(key: string, value: unknown): unknown {
  if (value instanceof Map) {
    // Convert Map to sorted object
    const obj: Record<string, unknown> = {};
    const sortedKeys = Array.from(value.keys()).sort();
    for (const k of sortedKeys) {
      obj[String(k)] = value.get(k);
    }
    return obj;
  }

  if (value instanceof Set) {
    // Convert Set to sorted array
    return Array.from(value).sort();
  }

  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    // Sort object keys for deterministic output
    const sorted: Record<string, unknown> = {};
    const keys = Object.keys(value as object).sort();
    for (const k of keys) {
      sorted[k] = (value as Record<string, unknown>)[k];
    }
    return sorted;
  }

  return value;
}

/**
 * Parse JSON export back to report result
 */
export function parseJsonExport<T>(
  jsonContent: string,
  includesMetadata: boolean = true
): ReportResult<T> | null {
  try {
    const parsed = JSON.parse(jsonContent);

    if (includesMetadata) {
      return {
        success: true,
        data: parsed.data as T,
        metadata: parsed.metadata as ReportMetadata,
      };
    } else {
      // Create minimal metadata
      return {
        success: true,
        data: parsed as T,
        metadata: {
          reportType: 'PLATFORM_REVENUE',
          generatedAt: Date.now(),
          timeWindow: { fromTimestamp: 0, toTimestamp: Date.now() },
          dataVersion: '1.0.0',
        },
      };
    }
  } catch {
    return null;
  }
}
