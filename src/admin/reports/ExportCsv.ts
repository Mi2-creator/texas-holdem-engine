/**
 * ExportCsv.ts
 * Phase 27 - CSV Export Adapter (read-only)
 *
 * Exports report data to flat CSV format.
 * Explicit schema definitions with deterministic ordering.
 *
 * HARD CONSTRAINTS:
 * - No side effects
 * - Deterministic output for same input
 * - Stable row ordering
 * - Explicit column schemas
 */

import {
  ExportResult,
  ExportOptions,
  ReportResult,
  CsvSchema,
  CsvColumnDef,
  PlatformRevenueReportData,
  ClubRevenueReportData,
  AgentCommissionReportData,
  TableSessionReportData,
  PlatformRevenuePeriod,
  ClubRevenuePeriod,
  AgentCommissionPeriod,
  HandRakeDetail,
} from './ReportTypes';

// ============================================================================
// CSV Schemas
// ============================================================================

/**
 * Schema for platform revenue period CSV
 */
export const PLATFORM_REVENUE_PERIOD_SCHEMA: CsvSchema = {
  reportType: 'PLATFORM_REVENUE',
  columns: [
    { name: 'periodKey', type: 'string', description: 'Time period identifier' },
    { name: 'periodStart', type: 'timestamp', description: 'Period start timestamp (ms)' },
    { name: 'periodEnd', type: 'timestamp', description: 'Period end timestamp (ms)' },
    { name: 'totalRevenue', type: 'number', description: 'Total platform revenue' },
    { name: 'entryCount', type: 'number', description: 'Number of entries' },
  ],
};

/**
 * Schema for club revenue period CSV
 */
export const CLUB_REVENUE_PERIOD_SCHEMA: CsvSchema = {
  reportType: 'CLUB_REVENUE',
  columns: [
    { name: 'periodKey', type: 'string', description: 'Time period identifier' },
    { name: 'periodStart', type: 'timestamp', description: 'Period start timestamp (ms)' },
    { name: 'periodEnd', type: 'timestamp', description: 'Period end timestamp (ms)' },
    { name: 'totalRevenue', type: 'number', description: 'Total club revenue' },
    { name: 'rakeRevenue', type: 'number', description: 'Revenue from rake' },
    { name: 'timeFeeRevenue', type: 'number', description: 'Revenue from time fees' },
    { name: 'otherRevenue', type: 'number', description: 'Other revenue' },
  ],
};

/**
 * Schema for agent commission period CSV
 */
export const AGENT_COMMISSION_PERIOD_SCHEMA: CsvSchema = {
  reportType: 'AGENT_COMMISSION',
  columns: [
    { name: 'agentId', type: 'string', description: 'Agent identifier' },
    { name: 'periodKey', type: 'string', description: 'Time period identifier' },
    { name: 'periodStart', type: 'timestamp', description: 'Period start timestamp (ms)' },
    { name: 'periodEnd', type: 'timestamp', description: 'Period end timestamp (ms)' },
    { name: 'totalCommission', type: 'number', description: 'Total commission' },
    { name: 'entryCount', type: 'number', description: 'Number of entries' },
  ],
};

/**
 * Schema for table session hands CSV
 */
export const TABLE_SESSION_HANDS_SCHEMA: CsvSchema = {
  reportType: 'TABLE_SESSION',
  columns: [
    { name: 'handId', type: 'string', description: 'Hand identifier' },
    { name: 'timestamp', type: 'timestamp', description: 'Hand timestamp (ms)' },
    { name: 'stateVersion', type: 'number', description: 'State version' },
    { name: 'rakeAmount', type: 'number', description: 'Total rake for hand' },
    { name: 'clubShare', type: 'number', description: 'Club share of rake' },
    { name: 'agentShare', type: 'number', description: 'Agent share of rake' },
    { name: 'platformShare', type: 'number', description: 'Platform share of rake' },
    { name: 'agentId', type: 'string', description: 'Agent identifier (if any)' },
  ],
};

// ============================================================================
// CSV Export Functions
// ============================================================================

/**
 * Export platform revenue periods to CSV
 */
export function exportPlatformRevenueCsv(
  report: ReportResult<PlatformRevenueReportData>,
  options: ExportOptions = { format: 'CSV' }
): ExportResult {
  const exportedAt = Date.now();

  try {
    if (!report.success || !report.data) {
      return {
        success: false,
        error: report.error ?? 'No data to export',
        format: 'CSV',
        byteSize: 0,
        exportedAt,
      };
    }

    const delimiter = options.csvDelimiter ?? ',';
    const rows: string[] = [];

    // Header row
    rows.push(PLATFORM_REVENUE_PERIOD_SCHEMA.columns.map(c => c.name).join(delimiter));

    // Data rows
    for (const period of report.data.periodBreakdown) {
      rows.push([
        escapeValue(period.periodKey, delimiter),
        period.periodStart.toString(),
        period.periodEnd.toString(),
        period.totalRevenue.toString(),
        period.entryCount.toString(),
      ].join(delimiter));
    }

    const content = rows.join('\n');

    return {
      success: true,
      content,
      format: 'CSV',
      byteSize: Buffer.byteLength(content, 'utf8'),
      exportedAt,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Export failed',
      format: 'CSV',
      byteSize: 0,
      exportedAt,
    };
  }
}

/**
 * Export club revenue periods to CSV
 */
export function exportClubRevenueCsv(
  report: ReportResult<ClubRevenueReportData>,
  options: ExportOptions = { format: 'CSV' }
): ExportResult {
  const exportedAt = Date.now();

  try {
    if (!report.success || !report.data) {
      return {
        success: false,
        error: report.error ?? 'No data to export',
        format: 'CSV',
        byteSize: 0,
        exportedAt,
      };
    }

    const delimiter = options.csvDelimiter ?? ',';
    const rows: string[] = [];

    // Header row
    rows.push(CLUB_REVENUE_PERIOD_SCHEMA.columns.map(c => c.name).join(delimiter));

    // Data rows
    for (const period of report.data.periodBreakdown) {
      rows.push([
        escapeValue(period.periodKey, delimiter),
        period.periodStart.toString(),
        period.periodEnd.toString(),
        period.totalRevenue.toString(),
        period.rakeRevenue.toString(),
        period.timeFeeRevenue.toString(),
        period.otherRevenue.toString(),
      ].join(delimiter));
    }

    const content = rows.join('\n');

    return {
      success: true,
      content,
      format: 'CSV',
      byteSize: Buffer.byteLength(content, 'utf8'),
      exportedAt,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Export failed',
      format: 'CSV',
      byteSize: 0,
      exportedAt,
    };
  }
}

/**
 * Export agent commission periods to CSV
 */
export function exportAgentCommissionCsv(
  report: ReportResult<AgentCommissionReportData>,
  options: ExportOptions = { format: 'CSV' }
): ExportResult {
  const exportedAt = Date.now();

  try {
    if (!report.success || !report.data) {
      return {
        success: false,
        error: report.error ?? 'No data to export',
        format: 'CSV',
        byteSize: 0,
        exportedAt,
      };
    }

    const delimiter = options.csvDelimiter ?? ',';
    const rows: string[] = [];

    // Header row
    rows.push(AGENT_COMMISSION_PERIOD_SCHEMA.columns.map(c => c.name).join(delimiter));

    // Data rows (for each agent, output their period breakdown)
    for (const agent of report.data.agents) {
      for (const period of agent.periodBreakdown) {
        rows.push([
          escapeValue(agent.agentId, delimiter),
          escapeValue(period.periodKey, delimiter),
          period.periodStart.toString(),
          period.periodEnd.toString(),
          period.totalCommission.toString(),
          period.entryCount.toString(),
        ].join(delimiter));
      }
    }

    const content = rows.join('\n');

    return {
      success: true,
      content,
      format: 'CSV',
      byteSize: Buffer.byteLength(content, 'utf8'),
      exportedAt,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Export failed',
      format: 'CSV',
      byteSize: 0,
      exportedAt,
    };
  }
}

/**
 * Export table session hands to CSV
 */
export function exportTableSessionCsv(
  report: ReportResult<TableSessionReportData>,
  options: ExportOptions = { format: 'CSV' }
): ExportResult {
  const exportedAt = Date.now();

  try {
    if (!report.success || !report.data) {
      return {
        success: false,
        error: report.error ?? 'No data to export',
        format: 'CSV',
        byteSize: 0,
        exportedAt,
      };
    }

    const delimiter = options.csvDelimiter ?? ',';
    const rows: string[] = [];

    // Header row
    rows.push(TABLE_SESSION_HANDS_SCHEMA.columns.map(c => c.name).join(delimiter));

    // Data rows
    if (report.data.hands) {
      for (const hand of report.data.hands) {
        rows.push([
          escapeValue(hand.handId, delimiter),
          hand.timestamp.toString(),
          hand.stateVersion.toString(),
          hand.rakeAmount.toString(),
          hand.clubShare.toString(),
          hand.agentShare.toString(),
          hand.platformShare.toString(),
          escapeValue(hand.agentId ?? '', delimiter),
        ].join(delimiter));
      }
    }

    const content = rows.join('\n');

    return {
      success: true,
      content,
      format: 'CSV',
      byteSize: Buffer.byteLength(content, 'utf8'),
      exportedAt,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Export failed',
      format: 'CSV',
      byteSize: 0,
      exportedAt,
    };
  }
}

/**
 * Generic CSV export from array of objects
 */
export function exportArrayToCsv<T extends Record<string, unknown>>(
  data: readonly T[],
  columns: readonly CsvColumnDef[],
  options: ExportOptions = { format: 'CSV' }
): ExportResult {
  const exportedAt = Date.now();

  try {
    const delimiter = options.csvDelimiter ?? ',';
    const rows: string[] = [];

    // Header row
    rows.push(columns.map(c => c.name).join(delimiter));

    // Data rows
    for (const row of data) {
      const values = columns.map(col => {
        const value = row[col.name];
        if (value === undefined || value === null) {
          return '';
        }
        if (typeof value === 'number') {
          return value.toString();
        }
        return escapeValue(String(value), delimiter);
      });
      rows.push(values.join(delimiter));
    }

    const content = rows.join('\n');

    return {
      success: true,
      content,
      format: 'CSV',
      byteSize: Buffer.byteLength(content, 'utf8'),
      exportedAt,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Export failed',
      format: 'CSV',
      byteSize: 0,
      exportedAt,
    };
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Escape a CSV value (handle quotes and delimiters)
 */
function escapeValue(value: string, delimiter: string): string {
  // Check if escaping is needed
  const needsEscape = value.includes('"') ||
    value.includes(delimiter) ||
    value.includes('\n') ||
    value.includes('\r');

  if (!needsEscape) {
    return value;
  }

  // Escape double quotes by doubling them
  const escaped = value.replace(/"/g, '""');
  return `"${escaped}"`;
}

/**
 * Parse CSV content back to array of objects
 */
export function parseCsv(content: string, delimiter: string = ','): Record<string, string>[] {
  const lines = content.split('\n').filter(line => line.trim() !== '');
  if (lines.length < 2) {
    return [];
  }

  const headers = parseCsvLine(lines[0], delimiter);
  const result: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i], delimiter);
    const row: Record<string, string> = {};

    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] ?? '';
    }

    result.push(row);
  }

  return result;
}

/**
 * Parse a single CSV line
 */
function parseCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          // Escaped quote
          current += '"';
          i++;
        } else {
          // End of quoted field
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === delimiter) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
  }

  result.push(current);
  return result;
}

/**
 * Get CSV schema for a report type
 */
export function getCsvSchema(reportType: string): CsvSchema | undefined {
  switch (reportType) {
    case 'PLATFORM_REVENUE':
      return PLATFORM_REVENUE_PERIOD_SCHEMA;
    case 'CLUB_REVENUE':
      return CLUB_REVENUE_PERIOD_SCHEMA;
    case 'AGENT_COMMISSION':
      return AGENT_COMMISSION_PERIOD_SCHEMA;
    case 'TABLE_SESSION':
      return TABLE_SESSION_HANDS_SCHEMA;
    default:
      return undefined;
  }
}
