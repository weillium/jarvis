const globalContext = globalThis as typeof globalThis & {
  __workerConsolePatched?: boolean;
};

const patchConsole =
  (
    original: (...args: unknown[]) => void
  ): ((...args: unknown[]) => void) =>
  (...args) => {
    const timestamp = new Date().toISOString();
    original(timestamp, ...args);
  };

if (globalContext.__workerConsolePatched !== true) {
  const originalLog = console.log.bind(console);
  const originalInfo = console.info.bind(console);
  const originalWarn = console.warn.bind(console);
  const originalError = console.error.bind(console);

  console.log = patchConsole(originalLog) as typeof console.log;
  console.info = patchConsole(originalInfo) as typeof console.info;
  console.warn = patchConsole(originalWarn) as typeof console.warn;
  console.error = patchConsole(originalError) as typeof console.error;

  globalContext.__workerConsolePatched = true;
}

