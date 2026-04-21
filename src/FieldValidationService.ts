import {
  SecureAppSettings,
  type ValidationRecord,
  type ValidationResultCode,
  type ValidationScenario,
} from './SecureAppSettings';

export interface ValidationDraft {
  id?: string;
  priority?: ValidationRecord['priority'];
  deviceId?: string;
  vendor?: string;
  model?: string;
  androidVersion?: string;
  scenario?: ValidationScenario;
  result?: ValidationResultCode;
  owner?: string;
  evidencePath?: string;
  notes?: string;
}

export interface ValidationWorkspaceFilters {
  scenario?: ValidationScenario | 'all';
  result?: ValidationResultCode | 'all';
  query?: string;
}

export const FIELD_VALIDATION_RESULTS: ValidationResultCode[] = [
  'PASS',
  'PASS-WARN',
  'FAIL',
  'BLOCKED',
];

export const PASSKEY_VALIDATION_SCENARIOS: ValidationScenario[] = [
  'passkey_create',
  'passkey_auth',
  'passkey_prereq_failure',
];

function nowIso(): string {
  return new Date().toISOString();
}

function buildId(): string {
  return `validation_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeToken(value?: string, fallback = 'unknown'): string {
  const normalized = (value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || fallback;
}

export const FieldValidationService = {
  list(filters?: ValidationWorkspaceFilters): ValidationRecord[] {
    const normalizedQuery = (filters?.query || '').trim().toLowerCase();
    return [...SecureAppSettings.get().validationRecords].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    ).filter(record => {
      if (filters?.scenario && filters.scenario !== 'all' && record.scenario !== filters.scenario) {
        return false;
      }
      if (filters?.result && filters.result !== 'all' && record.result !== filters.result) {
        return false;
      }
      if (!normalizedQuery) {
        return true;
      }
      const haystack = [
        record.deviceId,
        record.vendor,
        record.model,
        record.androidVersion,
        record.owner,
        record.notes,
        record.evidencePath,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  },

  getLatestForScenario(scenario: ValidationScenario): ValidationRecord | null {
    return (
      this.list().find(record => record.scenario === scenario) || null
    );
  },

  createDraft(partial: ValidationDraft = {}): ValidationDraft {
    return {
      priority: partial.priority || 'P0',
      deviceId: partial.deviceId || '',
      vendor: partial.vendor || '',
      model: partial.model || '',
      androidVersion: partial.androidVersion || '',
      scenario: partial.scenario || 'passkey_create',
      result: partial.result || 'PASS',
      owner: partial.owner || '',
      evidencePath: partial.evidencePath || '',
      notes: partial.notes || '',
      ...(partial.id ? { id: partial.id } : {}),
    };
  },

  buildEvidenceFileName(input: {
    vendor?: string;
    model?: string;
    androidVersion?: string;
    scenario: ValidationScenario;
    result: ValidationResultCode;
    date?: string;
  }): string {
    const datePart = (input.date || nowIso()).slice(0, 10);
    const vendor = normalizeToken(input.vendor, 'vendor');
    const model = normalizeToken(input.model, 'device');
    const androidVersionRaw = (input.androidVersion || '').trim();
    const androidVersion = androidVersionRaw
      ? `android${normalizeToken(androidVersionRaw, 'unknown')}`
      : 'androidunknown';
    return [
      datePart,
      `${vendor}-${model}`,
      androidVersion,
      normalizeToken(input.scenario),
      normalizeToken(input.result),
    ].join('_');
  },

  async saveRecord(draft: ValidationDraft, db?: any): Promise<ValidationRecord> {
    const current = SecureAppSettings.get();
    const existing = draft.id
      ? current.validationRecords.find(record => record.id === draft.id) || null
      : null;
    const timestamp = nowIso();
    const record: ValidationRecord = {
      id: existing?.id || buildId(),
      createdAt: existing?.createdAt || timestamp,
      updatedAt: timestamp,
      priority: draft.priority || existing?.priority || 'P0',
      deviceId: (draft.deviceId || existing?.deviceId || '').trim(),
      vendor: (draft.vendor || existing?.vendor || '').trim(),
      model: (draft.model || existing?.model || '').trim(),
      androidVersion: (draft.androidVersion || existing?.androidVersion || '').trim(),
      scenario: draft.scenario || existing?.scenario || 'passkey_create',
      result: draft.result || existing?.result || 'PASS',
      owner: (draft.owner || existing?.owner || '').trim(),
      evidencePath: (draft.evidencePath || existing?.evidencePath || '').trim(),
      notes: (draft.notes || existing?.notes || '').trim(),
    };

    const nextRecords = existing
      ? current.validationRecords.map(item =>
          item.id === record.id ? record : item,
        )
      : [record, ...current.validationRecords];

    await SecureAppSettings.update({ validationRecords: nextRecords }, db);
    return record;
  },

  summarize(records: ValidationRecord[]) {
    return FIELD_VALIDATION_RESULTS.reduce(
      (acc, result) => ({
        ...acc,
        [result]: records.filter(record => record.result === result).length,
      }),
      {} as Record<ValidationResultCode, number>,
    );
  },

  getWorkspaceSummary(records: ValidationRecord[]) {
    const resultSummary = this.summarize(records);
    const deviceCount = new Set(records.map(record => record.deviceId)).size;
    const latestUpdatedAt = records[0]?.updatedAt || null;
    const scenarioSummary = PASSKEY_VALIDATION_SCENARIOS.reduce(
      (acc, scenario) => ({
        ...acc,
        [scenario]: records.filter(record => record.scenario === scenario).length,
      }),
      {} as Record<ValidationScenario, number>,
    );

    return {
      total: records.length,
      deviceCount,
      latestUpdatedAt,
      results: resultSummary,
      scenarios: scenarioSummary,
    };
  },
};
