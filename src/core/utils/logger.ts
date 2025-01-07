import chalk from "chalk";

export type LogLevel = "debug" | "info" | "warn" | "error";

export class Logger {
  static debug(message: string, ...args: any[]): void {
    if (process.env.DEBUG || process.env.NODE_ENV === 'test') {
      console.debug(chalk.gray(`[DEBUG] ${message}`), ...args);
    }
  }
  private static logLevel: LogLevel = "info";

  static setLogLevel(level: LogLevel) {
    Logger.logLevel = level
  }

  static info(message: string, ...args: any[]): void {
    console.log(chalk.blue(`[INFO] ${message}`, ...args));
  }
  static warn(message: string, ...args: any[]): void {
    console.warn(chalk.yellow(`[WARN] ${message}`, ...args));
  }
  static error(message: string, ...args: any[]): void {
    console.error(chalk.red(`[ERROR] ${message}`, ...args));
  }
}
