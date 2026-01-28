/**
 * Admin Revenue Reports Module
 * Phase 27 - Read-only reporting APIs
 *
 * This module provides:
 * 1. PlatformRevenueReport - Platform-wide revenue aggregation
 * 2. ClubRevenueReport - Per-club revenue with rake/time fee separation
 * 3. AgentCommissionReport - Direct commission attribution
 * 4. TableSessionReport - Per-table rake timeline with replay verification
 * 5. Export Adapters - JSON and CSV export with explicit schemas
 *
 * HARD CONSTRAINTS:
 * - All reports are strictly READ-ONLY
 * - All outputs derived from view data
 * - No mutations or side effects
 * - Deterministic and stable ordering
 * - Integer-only numeric outputs
 */

// Types
export {
  // Common types
  ReportTimeWindow,
  ReportMetadata,
  ReportType,
  ReportResult,

  // Platform revenue types
  PlatformRevenueReportQuery,
  PlatformRevenuePeriod,
  PlatformRevenueByClub,
  PlatformRevenueByTable,
  PlatformRevenueReportData,

  // Club revenue types
  ClubRevenueReportQuery,
  ClubRevenuePeriod,
  ClubRevenueByTable,
  ClubRevenueReportData,

  // Agent commission types
  AgentCommissionReportQuery,
  AgentCommissionPeriod,
  AgentCommissionByClub,
  AgentCommissionSummary,
  AgentCommissionReportData,

  // Table session types
  TableSessionReportQuery,
  HandRakeDetail,
  TableSessionSummary,
  TableSessionReportData,
  ReportPagination,

  // Export types
  ExportFormat,
  ExportOptions,
  ExportResult,
  CsvColumnDef,
  CsvSchema,

  // Utility functions
  createReportMetadata,
  createDefaultReportTimeWindow,
  createReportTimeWindow,
  isValidTimeWindow,
  integerAverage,
} from './ReportTypes';

// Platform Revenue Report
export {
  PlatformRevenueReport,
  createPlatformRevenueReport,
} from './PlatformRevenueReport';

// Club Revenue Report
export {
  ClubRevenueReport,
  createClubRevenueReport,
} from './ClubRevenueReport';

// Agent Commission Report
export {
  AgentCommissionReport,
  createAgentCommissionReport,
} from './AgentCommissionReport';

// Table Session Report
export {
  TableSessionReport,
  createTableSessionReport,
} from './TableSessionReport';

// JSON Export
export {
  exportToJson,
  exportPlatformRevenueJson,
  exportClubRevenueJson,
  exportAgentCommissionJson,
  exportTableSessionJson,
  parseJsonExport,
} from './ExportJson';

// CSV Export
export {
  exportPlatformRevenueCsv,
  exportClubRevenueCsv,
  exportAgentCommissionCsv,
  exportTableSessionCsv,
  exportArrayToCsv,
  parseCsv,
  getCsvSchema,
  PLATFORM_REVENUE_PERIOD_SCHEMA,
  CLUB_REVENUE_PERIOD_SCHEMA,
  AGENT_COMMISSION_PERIOD_SCHEMA,
  TABLE_SESSION_HANDS_SCHEMA,
} from './ExportCsv';
