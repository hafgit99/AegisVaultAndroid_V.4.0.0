import type { ValidationRecord, ValidationResultCode } from './SecureAppSettings';

export interface ValidationMatrixTemplateRow {
  priority: 'P0' | 'P1' | 'P2';
  deviceId: string;
  vendor: string;
  model: string;
  androidVersion: string;
  scenario: string;
}

export type ValidationMatrixStatus =
  | 'planned'
  | 'running'
  | 'passed'
  | 'blocked';

export interface ValidationMatrixRow extends ValidationMatrixTemplateRow {
  status: ValidationMatrixStatus;
  latestRecord: ValidationRecord | null;
}

export interface ValidationMatrixDeviceGroup {
  deviceId: string;
  vendor: string;
  model: string;
  androidVersion: string;
  priority: 'P0' | 'P1' | 'P2';
  rows: ValidationMatrixRow[];
  statusCounts: Record<ValidationMatrixStatus, number>;
}

const TEMPLATE_ROWS: ValidationMatrixTemplateRow[] = [
  { priority: 'P0', deviceId: 'pixel-8', vendor: 'Google', model: 'Pixel 8', androidVersion: '15', scenario: 'unlock' },
  { priority: 'P0', deviceId: 'pixel-8', vendor: 'Google', model: 'Pixel 8', androidVersion: '15', scenario: 'autofill_browser' },
  { priority: 'P0', deviceId: 'pixel-8', vendor: 'Google', model: 'Pixel 8', androidVersion: '15', scenario: 'passkey_create' },
  { priority: 'P0', deviceId: 'pixel-8', vendor: 'Google', model: 'Pixel 8', androidVersion: '15', scenario: 'passkey_auth' },
  { priority: 'P0', deviceId: 'pixel-8', vendor: 'Google', model: 'Pixel 8', androidVersion: '15', scenario: 'encrypted_export_import' },
  { priority: 'P0', deviceId: 'pixel-8', vendor: 'Google', model: 'Pixel 8', androidVersion: '15', scenario: 'recovery_restore' },
  { priority: 'P0', deviceId: 'pixel-8', vendor: 'Google', model: 'Pixel 8', androidVersion: '15', scenario: 'cloud_sync_upload_download' },
  { priority: 'P0', deviceId: 'galaxy-a54', vendor: 'Samsung', model: 'Galaxy A54', androidVersion: '14', scenario: 'unlock' },
  { priority: 'P0', deviceId: 'galaxy-a54', vendor: 'Samsung', model: 'Galaxy A54', androidVersion: '14', scenario: 'autofill_browser' },
  { priority: 'P0', deviceId: 'galaxy-a54', vendor: 'Samsung', model: 'Galaxy A54', androidVersion: '14', scenario: 'autofill_third_party' },
  { priority: 'P0', deviceId: 'galaxy-a54', vendor: 'Samsung', model: 'Galaxy A54', androidVersion: '14', scenario: 'encrypted_export_import' },
  { priority: 'P0', deviceId: 'galaxy-a54', vendor: 'Samsung', model: 'Galaxy A54', androidVersion: '14', scenario: 'recovery_restore' },
  { priority: 'P0', deviceId: 'galaxy-a54', vendor: 'Samsung', model: 'Galaxy A54', androidVersion: '14', scenario: 'cloud_sync_upload_download' },
  { priority: 'P0', deviceId: 'redmi-note', vendor: 'Xiaomi', model: 'Redmi Note', androidVersion: '14', scenario: 'unlock' },
  { priority: 'P0', deviceId: 'redmi-note', vendor: 'Xiaomi', model: 'Redmi Note', androidVersion: '14', scenario: 'background_auto_lock' },
  { priority: 'P0', deviceId: 'redmi-note', vendor: 'Xiaomi', model: 'Redmi Note', androidVersion: '14', scenario: 'file_picker_backup' },
  { priority: 'P0', deviceId: 'redmi-note', vendor: 'Xiaomi', model: 'Redmi Note', androidVersion: '14', scenario: 'cloud_sync_upload_download' },
  { priority: 'P1', deviceId: 'moto-g', vendor: 'Motorola', model: 'Moto G', androidVersion: '12', scenario: 'unlock' },
  { priority: 'P1', deviceId: 'moto-g', vendor: 'Motorola', model: 'Moto G', androidVersion: '12', scenario: 'encrypted_export_import' },
  { priority: 'P1', deviceId: 'moto-g', vendor: 'Motorola', model: 'Moto G', androidVersion: '12', scenario: 'recovery_restore' },
  { priority: 'P1', deviceId: 'low-ram', vendor: 'Generic', model: 'Low RAM Device', androidVersion: '13', scenario: 'unlock' },
  { priority: 'P1', deviceId: 'low-ram', vendor: 'Generic', model: 'Low RAM Device', androidVersion: '13', scenario: 'encrypted_export_import_large' },
  { priority: 'P1', deviceId: 'low-ram', vendor: 'Generic', model: 'Low RAM Device', androidVersion: '13', scenario: 'recovery_restore' },
  { priority: 'P1', deviceId: 'no-bio', vendor: 'Generic', model: 'Biometrics Disabled Device', androidVersion: '14', scenario: 'unlock_fallback' },
  { priority: 'P1', deviceId: 'no-bio', vendor: 'Generic', model: 'Biometrics Disabled Device', androidVersion: '14', scenario: 'passkey_prereq_failure' },
];

const EMPTY_STATUS_COUNTS: Record<ValidationMatrixStatus, number> = {
  planned: 0,
  running: 0,
  passed: 0,
  blocked: 0,
};

function getRecordStatus(result: ValidationResultCode): ValidationMatrixStatus {
  if (result === 'PASS' || result === 'PASS-WARN') {
    return 'passed';
  }
  if (result === 'BLOCKED') {
    return 'blocked';
  }
  return 'running';
}

function matchesTemplate(record: ValidationRecord, template: ValidationMatrixTemplateRow) {
  return (
    record.deviceId === template.deviceId &&
    record.scenario === template.scenario
  );
}

export const ValidationMatrixService = {
  getTemplateRows(): ValidationMatrixTemplateRow[] {
    return TEMPLATE_ROWS.map(row => ({ ...row }));
  },

  buildBoard(records: ValidationRecord[]) {
    const orderedRecords = [...records].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );

    const rows: ValidationMatrixRow[] = TEMPLATE_ROWS.map(template => {
      const latestRecord =
        orderedRecords.find(record => matchesTemplate(record, template)) || null;
      return {
        ...template,
        status: latestRecord ? getRecordStatus(latestRecord.result) : 'planned',
        latestRecord,
      };
    });

    const deviceGroups = rows.reduce<ValidationMatrixDeviceGroup[]>(
      (groups, row) => {
        const existing = groups.find(group => group.deviceId === row.deviceId);
        if (!existing) {
          groups.push({
            deviceId: row.deviceId,
            vendor: row.vendor,
            model: row.model,
            androidVersion: row.androidVersion,
            priority: row.priority,
            rows: [row],
            statusCounts: {
              ...EMPTY_STATUS_COUNTS,
              [row.status]: 1,
            },
          });
          return groups;
        }

        existing.rows.push(row);
        existing.statusCounts[row.status] += 1;
        return groups;
      },
      [],
    );

    const totals = rows.reduce(
      (acc, row) => {
        acc[row.status] += 1;
        return acc;
      },
      { ...EMPTY_STATUS_COUNTS },
    );

    return {
      rows,
      deviceGroups,
      totals,
      totalRows: rows.length,
      totalDevices: deviceGroups.length,
    };
  },
};
