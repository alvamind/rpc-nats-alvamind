import { logger } from 'logger-alvamind';

export type LogLevel = 'none' | 'info' | 'debug';

export class Logger {
  static logLevel: LogLevel = 'info';

  static setLogLevel(level: LogLevel) {
    Logger.logLevel = level;
  }

  static debug(message: string, ...args: any[]): void {
    if (Logger.logLevel === 'debug' && (process.env.DEBUG || process.env.NODE_ENV === 'test')) {
      logger.debug(message, ...args);
    }
  }
  static info(message: string, ...args: any[]): void {
    if (Logger.logLevel !== 'none') {
      logger.info(message, ...args);
    }
  }
  static warn(message: string, ...args: any[]): void {
    if (Logger.logLevel !== 'none') {
      logger.warn(message, ...args);
    }
  }
  static error(message: string, ...args: any[]): void {
    if (Logger.logLevel !== 'none') {
      logger.error(message, ...args);
    }
  }
}
