/**
 * ExportControls.tsx
 * Phase L11 - Hand history export controls
 *
 * Provides buttons to export hand history as text or JSON.
 * Uses browser download functionality.
 */

import React, { useCallback } from 'react';
import {
  HandHistoryEvent,
  exportHandHistoryAsText,
  exportHandHistoryAsJSON,
  generateExportFilename,
} from '../controller/HandHistory';

// ============================================================================
// Types
// ============================================================================

interface ExportControlsProps {
  readonly events: readonly HandHistoryEvent[];
  readonly handNumber: number;
  readonly disabled?: boolean;
}

// ============================================================================
// Styles
// ============================================================================

const styles = {
  container: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
  },

  label: {
    fontSize: '10px',
    color: 'rgba(156, 163, 175, 0.6)',
    marginRight: '4px',
  },

  exportButton: {
    padding: '6px 12px',
    borderRadius: '4px',
    backgroundColor: 'rgba(75, 85, 99, 0.2)',
    color: 'rgba(156, 163, 175, 0.9)',
    fontSize: '11px',
    fontWeight: 500,
    cursor: 'pointer',
    border: '1px solid rgba(75, 85, 99, 0.3)',
    transition: 'all 0.15s ease',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },

  exportButtonDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
  },

  icon: {
    fontSize: '12px',
  },
};

// ============================================================================
// Download Helper
// ============================================================================

/**
 * Trigger a file download in the browser
 */
function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

// ============================================================================
// Main Component
// ============================================================================

export function ExportControls({
  events,
  handNumber,
  disabled = false,
}: ExportControlsProps): React.ReactElement {
  const handleExportText = useCallback(() => {
    if (disabled || events.length === 0) return;

    const content = exportHandHistoryAsText(events, handNumber);
    const filename = generateExportFilename(handNumber, 'txt');
    downloadFile(content, filename, 'text/plain');
  }, [events, handNumber, disabled]);

  const handleExportJSON = useCallback(() => {
    if (disabled || events.length === 0) return;

    const content = exportHandHistoryAsJSON(events, handNumber);
    const filename = generateExportFilename(handNumber, 'json');
    downloadFile(content, filename, 'application/json');
  }, [events, handNumber, disabled]);

  const isDisabled = disabled || events.length === 0;

  return (
    <div style={styles.container}>
      <span style={styles.label}>Export:</span>

      <button
        style={{
          ...styles.exportButton,
          ...(isDisabled ? styles.exportButtonDisabled : {}),
        }}
        onClick={handleExportText}
        disabled={isDisabled}
        title="Export as text file"
        onMouseEnter={(e) => {
          if (!isDisabled) {
            e.currentTarget.style.backgroundColor = 'rgba(75, 85, 99, 0.4)';
            e.currentTarget.style.color = '#fff';
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'rgba(75, 85, 99, 0.2)';
          e.currentTarget.style.color = 'rgba(156, 163, 175, 0.9)';
        }}
      >
        <span style={styles.icon}>TXT</span>
      </button>

      <button
        style={{
          ...styles.exportButton,
          ...(isDisabled ? styles.exportButtonDisabled : {}),
        }}
        onClick={handleExportJSON}
        disabled={isDisabled}
        title="Export as JSON file"
        onMouseEnter={(e) => {
          if (!isDisabled) {
            e.currentTarget.style.backgroundColor = 'rgba(75, 85, 99, 0.4)';
            e.currentTarget.style.color = '#fff';
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'rgba(75, 85, 99, 0.2)';
          e.currentTarget.style.color = 'rgba(156, 163, 175, 0.9)';
        }}
      >
        <span style={styles.icon}>JSON</span>
      </button>
    </div>
  );
}

export default ExportControls;
