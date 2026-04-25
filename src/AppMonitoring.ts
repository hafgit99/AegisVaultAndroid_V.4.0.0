import RNFS from 'react-native-fs';

export interface CrashReport {
  id: string;
  source: string;
  name: string;
  message: string;
  stack?: string;
  isFatal: boolean;
  createdAt: string;
  context?: Record<string, any>;
}

const CRASH_REPORT_FILE = `${RNFS.DocumentDirectoryPath}/aegis_crash_reports.json`;
const MAX_CRASH_REPORTS = 25;
const MAX_STORED_TEXT_LENGTH = 1200;
const MAX_CONTEXT_DEPTH = 3;
const MAX_CONTEXT_KEYS = 40;
const SENSITIVE_KEY_PATTERN =
  /pass(word)?|token|secret|authorization|cookie|credential|private.?key|seed|mnemonic|pin|cvv/i;
const SENSITIVE_VALUE_PATTERN =
  /(bearer\s+[a-z0-9\-._~+/]+=*|api[_-]?key|access[_-]?token|refresh[_-]?token|password=|secret=)/i;

const originalConsole = {
  log: console.log.bind(console),
  info: (console.info || console.log).bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

let initialized = false;
let previousGlobalHandler: ((error: any, isFatal?: boolean) => void) | null =
  null;

const truncate = (value: string, max = MAX_STORED_TEXT_LENGTH): string =>
  value.length > max ? `${value.slice(0, max)}...[truncated]` : value;

const sanitizeText = (value: unknown): string => {
  const raw = typeof value === 'string' ? value : String(value ?? '');
  const redacted = raw.replace(
    /(bearer\s+)[a-z0-9\-._~+/]+=*/gi,
    '$1[redacted]',
  );
  const masked = SENSITIVE_VALUE_PATTERN.test(redacted)
    ? '[redacted-sensitive-value]'
    : redacted;
  return truncate(masked);
};

const sanitizeContextValue = (
  value: unknown,
  depth: number = 0,
): unknown => {
  if (value === null || value === undefined) return value;
  if (depth >= MAX_CONTEXT_DEPTH) return '[truncated-depth]';

  if (typeof value === 'string') {
    return sanitizeText(value);
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (value instanceof Error) {
    return {
      name: sanitizeText(value.name || 'Error'),
      message: sanitizeText(value.message || 'Unknown error'),
    };
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map(entry => sanitizeContextValue(entry, depth + 1));
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).slice(
      0,
      MAX_CONTEXT_KEYS,
    );
    const output: Record<string, unknown> = {};
    entries.forEach(([key, entryValue]) => {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        output[key] = '[redacted]';
      } else {
        output[key] = sanitizeContextValue(entryValue, depth + 1);
      }
    });
    return output;
  }
  return sanitizeText(value);
};

const serializeError = (error: unknown) => {
  if (error instanceof Error) {
    return {
      name: sanitizeText(error.name || 'Error'),
      message: sanitizeText(error.message || 'Unknown error'),
      stack: __DEV__ ? sanitizeText(error.stack || '') : undefined,
    };
  }

  if (typeof error === 'string') {
    return {
      name: 'Error',
      message: sanitizeText(error),
      stack: undefined,
    };
  }

  try {
    return {
      name: 'Error',
      message: sanitizeText(JSON.stringify(error)),
      stack: undefined,
    };
  } catch {
    return {
      name: 'Error',
      message: sanitizeText(String(error)),
      stack: undefined,
    };
  }
};

const serializeContext = (value: unknown): Record<string, any> | undefined => {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  try {
    JSON.stringify(value);
    return sanitizeContextValue(value) as Record<string, any>;
  } catch {
    return {
      raw: sanitizeText(String(value)),
    };
  }
};

const readReports = async (): Promise<CrashReport[]> => {
  try {
    const exists = await RNFS.exists(CRASH_REPORT_FILE);
    if (!exists) return [];
    const raw = await RNFS.readFile(CRASH_REPORT_FILE, 'utf8');
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeReports = async (reports: CrashReport[]) => {
  try {
    await RNFS.writeFile(
      CRASH_REPORT_FILE,
      JSON.stringify(reports.slice(0, MAX_CRASH_REPORTS)),
      'utf8',
    );
  } catch {
    // Monitoring must never crash the app.
  }
};

const toConsoleErrorMessage = (args: any[]) =>
  args
    .map(arg => {
      if (arg instanceof Error) {
        return `${sanitizeText(arg.name)}: ${sanitizeText(arg.message)}`;
      }
      if (typeof arg === 'string') return sanitizeText(arg);
      try {
        return sanitizeText(JSON.stringify(sanitizeContextValue(arg)));
      } catch {
        return sanitizeText(String(arg));
      }
    })
    .join(' ');

export const AppMonitoring = {
  async initialize() {
    if (initialized) return;
    initialized = true;

    if (!__DEV__) {
      console.log = () => {};
      console.info = () => {};
      console.warn = () => {};
      console.debug = () => {};
      console.error = (...args: any[]) => {
        this.recordHandledError('console.error', toConsoleErrorMessage(args)).catch(() => {});
      };
    }

    const globalErrorUtils = (global as any)?.ErrorUtils;
    if (globalErrorUtils?.getGlobalHandler && globalErrorUtils?.setGlobalHandler) {
      previousGlobalHandler = globalErrorUtils.getGlobalHandler();
      globalErrorUtils.setGlobalHandler((error: any, isFatal?: boolean) => {
        this.recordCrash(error, Boolean(isFatal), 'global').catch(() => {});
        if (previousGlobalHandler) {
          previousGlobalHandler(error, isFatal);
        }
      });
    }
  },

  async recordCrash(
    error: unknown,
    isFatal: boolean = false,
    source: string = 'unknown',
    context?: Record<string, any>,
  ) {
    const serialized = serializeError(error);
    const report: CrashReport = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      source,
      name: serialized.name,
      message: serialized.message,
      stack: serialized.stack,
      isFatal,
      createdAt: new Date().toISOString(),
      context: serializeContext(context),
    };

    const reports = await readReports();
    reports.unshift(report);
    await writeReports(reports);
  },

  async recordHandledError(
    source: string,
    error: unknown,
    context?: Record<string, any>,
  ) {
    await this.recordCrash(error, false, source, context);
  },

  async getCrashReports(limit: number = 20): Promise<CrashReport[]> {
    const reports = await readReports();
    return reports.slice(0, Math.max(1, Math.min(limit, MAX_CRASH_REPORTS)));
  },

  async clearCrashReports(): Promise<boolean> {
    try {
      const exists = await RNFS.exists(CRASH_REPORT_FILE);
      if (!exists) return true;
      await RNFS.unlink(CRASH_REPORT_FILE);
      return true;
    } catch {
      return false;
    }
  },

  getOriginalConsole() {
    return originalConsole;
  },
};
