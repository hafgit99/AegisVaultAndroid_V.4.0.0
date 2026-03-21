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

const originalConsole = {
  log: console.log.bind(console),
  info: (console.info || console.log).bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

let initialized = false;
let previousGlobalHandler: ((error: any, isFatal?: boolean) => void) | null =
  null;

const serializeError = (error: unknown) => {
  if (error instanceof Error) {
    return {
      name: error.name || 'Error',
      message: error.message || 'Unknown error',
      stack: error.stack,
    };
  }

  if (typeof error === 'string') {
    return {
      name: 'Error',
      message: error,
      stack: undefined,
    };
  }

  try {
    return {
      name: 'Error',
      message: JSON.stringify(error),
      stack: undefined,
    };
  } catch {
    return {
      name: 'Error',
      message: String(error),
      stack: undefined,
    };
  }
};

const serializeContext = (value: unknown): Record<string, any> | undefined => {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return {
      raw: String(value),
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
      if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
      if (typeof arg === 'string') return arg;
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
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
        originalConsole.error(...args);
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
