import { logger } from 'logger-alvamind';
export type LogLevel = "debug" | "info" | "warn" | "error";
export class Logger {
  static setLogLevel(level: LogLevel) {
    // No need to set log level, logger-alvamind already handles it
    // Logger.logLevel = level
  }
  static debug(message: string, ...args: any[]): void {
    if (process.env.DEBUG || process.env.NODE_ENV === 'test') {
      logger.debug(message, ...args);
    }
  }
  static info(message: string, ...args: any[]): void {
    logger.info(message, ...args);
  }
  static warn(message: string, ...args: any[]): void {
    logger.warn(message, ...args);
  }
  static error(message: string, ...args: any[]): void {
    logger.error(message, ...args);
  }
}
