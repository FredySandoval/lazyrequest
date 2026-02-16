import pino from "pino";

class Logger {
  private pinoLogger: ReturnType<typeof pino>;
  private verbose: boolean = false;

  constructor() {
    this.pinoLogger = pino({
      base: null,
      level: "debug",
    });
  }

  setVerbose(enabled: boolean): void {
    this.verbose = enabled;
  }

  debug(message: string): void {
    if (this.verbose) {
      this.pinoLogger.debug(message);
    }
  }

  info(message: string): void {
    this.pinoLogger.info(message);
  }

  error(message: string, error?: Error): void {
    if (error) {
      this.pinoLogger.error({ err: error }, message);
    } else {
      this.pinoLogger.error(message);
    }
  }
}

export const logger = new Logger();
export { Logger };
