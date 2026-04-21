let consoleLogSpy;
let consoleWarnSpy;
let consoleErrorSpy;
const originalConsoleError = console.error;

const shouldIgnoreConsoleError = (args = []) => {
  const first = `${args[0] ?? ''}`;
  return (
    first.includes('An update to VirtualizedList inside a test was not wrapped in act') ||
    first.includes('not wrapped in act(...)')
  );
};

beforeAll(() => {
  consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation((...args) => {
    if (shouldIgnoreConsoleError(args)) return;
    originalConsoleError(...args);
  });
});

beforeEach(() => {
  consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  if (consoleLogSpy) {
    consoleLogSpy.mockRestore();
  }
  if (consoleWarnSpy) {
    consoleWarnSpy.mockRestore();
  }
  // Prevent leftover timers/listeners from extending Jest process lifetime.
  jest.clearAllTimers();
});

afterAll(() => {
  consoleErrorSpy.mockRestore();
});
