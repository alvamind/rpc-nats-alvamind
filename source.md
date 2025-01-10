# Project: rpc-nats-alvamind

## 📁 Dir Structure:
- src/core/codec/
  • codec.interface.ts
  • codec.ts
  • json-codec.ts
  • string-codec.ts
- src/core/nats/
  • nats-client.interface.ts
  • nats-client.ts
- src/core/rpc/
  • rpc-client.interface.ts
  • rpc-client.ts
  • rpc-server.interface.ts
  • rpc-server.ts
- src/core/utils/
  • logger.ts
- src/
  • generate-services.ts
  • index.ts
- src/types/
  • index.ts

- ./
  • package.json
  • tsconfig.build.json
  • tsconfig.json
  • welcome.js
## 🚫 Excludes:
- **/node_modules/**
- **/dist/**
- **/.git/**
- **/generate-source.ts
- **/.zed-settings.json
- **/.vscode/settings.json
- **/package-lock.json
- **/bun.lockb
- **/build/**
- source.md
- **/dist/**
- .gitignore
- bun.lockb
- *md
- *.test.ts

## 📁 Dir Structure:
- src/core/codec
- src/core/nats
- src/core/rpc
- src/core/utils
- src
- src/types

## 💻 Code:
====================

// package.json
{
  "name": "rpc-nats-alvamind",
  "version": "1.0.23",
  "description": "A flexible RPC library using NATS",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "bin": {
    "rpc-nats": "./dist/generate-services.js"
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/alvamind/rpc-nats-alvamind.git"
  },
  "scripts": {
    "format": "prettier --write \"src*.ts\"",
    "lint": "eslint \"src*.ts\" --fix",
    "generate-services": "ts-node scripts/generate-services.ts",
    "generate-services:watch": "ts-node scripts/generate-services.ts --watch",
    "dev": "bun tsc --watch",
    "compose": "docker compose up -d",
    "commit": "commit",
    "reinstall": "bun clean && bun install",
    "build": "tsc -p tsconfig.build.json && chmod +x dist/generate-services.js",
    "source": "generate-source --exclude=**/dist*",
    "welcome.js"
  ],
  "peerDependencies": {
    "typescript": "^5.0.0"
  }
}

// src/core/codec/codec.interface.ts
export interface NatsCodec<T> {
    encode: (data: T) => Uint8Array;
    decode: (data: Uint8Array) => T;
  }

// src/core/codec/codec.ts
import { NatsCodec } from "./codec.interface";
import { JsonCodec } from "./json-codec";
import { StringCodec } from "./string-codec";
export type SupportedCodec = 'json' | 'string';
export const getCodec = <T = unknown>(codec: SupportedCodec | NatsCodec<T> = "json"): NatsCodec<T> => {
  if (typeof codec === "string"){
    if (codec === "string") {
      return new StringCodec<T>();
    }
    if(codec === "json")
    return new JsonCodec<T>();
  }
  return codec;
}

// src/core/codec/json-codec.ts
import { NatsCodec } from './codec.interface';
export class JsonCodec<T> implements NatsCodec<T> {
  encode(data: T): Uint8Array {
    const serialized = JSON.stringify(data, (_, value) => {
      if (value instanceof Date) {
        return { __type: 'Date', value: value.toISOString() };
      }
      if (typeof value === 'bigint') {
        return { __type: 'BigInt', value: value.toString() };
      }
      if (value instanceof Map) {
        return { __type: 'Map', value: Array.from(value.entries()) };
      }
      if (value instanceof Set) {
        return { __type: 'Set', value: Array.from(value) };
      }
      return value;
    });
    return new TextEncoder().encode(serialized);
  }
  decode(data: Uint8Array): T {
    return JSON.parse(new TextDecoder().decode(data), (_, value) => {
      if (value && typeof value === 'object') {
        switch (value.__type) {
          case 'Date':
            return new Date(value.value);
          case 'BigInt':
            return BigInt(value.value);
          case 'Map':
            return new Map(value.value);
          case 'Set':
            return new Set(value.value);
        }
      }
      return value;
    });
  }
}

// src/core/codec/string-codec.ts
import { NatsCodec } from './codec.interface';
import { StringCodec as NatsStringCodec } from 'nats';
export class StringCodec<T> implements NatsCodec<T> {
  private stringCodec = NatsStringCodec();
  encode(data: T): Uint8Array {
    return this.stringCodec.encode(String(data));
  }
  decode(data: Uint8Array): T {
    return this.stringCodec.decode(data) as T;
  }
}

// src/core/nats/nats-client.interface.ts
import { NatsConnection, JetStreamClient, SubscriptionOptions } from 'nats';
import { NatsCodec } from '../codec/codec.interface';
export interface INatsClient {
  connect(): Promise<void>;
  close(): Promise<void>;
  getJetstreamClient(): JetStreamClient | null;
  getNatsConnection(): NatsConnection | null;
  getCodec<T = any>(): NatsCodec<T>;
  subscribe<T = unknown>(
    subject: string,
    cb: (data: T, reply: string) => void | Promise<void>,
    options?: SubscriptionOptions
  ): Promise<void>;
  publish<T = unknown>(subject: string, data: T, reply?: string): Promise<void>;
  request<TRequest = unknown, TResponse = unknown>(
    subject: string,
    data: TRequest,
    timeout?: number
  ): Promise<TResponse>;
  unsubscribe(subject: string): Promise<void>;
  drain(): Promise<void>;
  isConnected(): boolean;
  getServerInfo(): string | undefined;
  getSubscriptionCount(): number;
  getActiveSubjects(): string[];
}

// src/core/nats/nats-client.ts
import {
  connect,
  NatsConnection,
  SubscriptionOptions,
  JetStreamClient,
  Subscription
} from "nats";
import { getCodec } from "../codec/codec";
import { INatsClient } from "./nats-client.interface";
import { defaultNatsOptions, NatsOptions } from "../../types";
import { Logger } from "../utils/logger";
import { NatsCodec } from "../codec/codec.interface";
export class NatsClient implements INatsClient {
  private nc: NatsConnection | null = null;
  private jsm: JetStreamClient | null = null;
  private codec: NatsCodec<any>;
  private options: NatsOptions;
  private subscriptions: Map<string, Subscription> = new Map();
  constructor(options: NatsOptions) {
    this.options = options;
    this.codec = getCodec(options?.codec);
    Logger.setLogLevel(options?.logLevel ?? defaultNatsOptions.logLevel);
    if (options?.debug) {
      Logger.setLogLevel("debug");
    }
  }
  async connect(): Promise<void> {
    try {
      this.nc = await connect({
        servers: [this.options?.url ?? defaultNatsOptions.url]
      });
      this.jsm = this.nc.jetstream();
      Logger.info("NATS connected");
    } catch (error) {
      Logger.error("Failed to connect to NATS", error);
      throw new Error("Failed to connect to NATS");
    }
  }
  async close(): Promise<void> {
    for (const subscription of this.subscriptions.values()) {
      subscription.unsubscribe();
    }
    this.subscriptions.clear();
    if (this.nc && !this.nc.isClosed()) {
      await this.nc.close();
      Logger.info("NATS connection closed");
    }
  }
  getJetstreamClient(): JetStreamClient | null {
    return this.jsm;
  }
  getNatsConnection(): NatsConnection | null {
    return this.nc;
  }
  getCodec<T = any>(): NatsCodec<T> {
    return this.codec;
  }
  async subscribe<T = unknown>(
    subject: string,
    cb: (data: T, reply: string) => void | Promise<void>,
    options?: SubscriptionOptions
  ): Promise<void> {
    if (!this.nc) {
      throw new Error("Nats client not initialized yet");
    }
    if (!this.subscriptions.has(subject)) {
      const subscription = this.nc.subscribe(subject, options);
      this.subscriptions.set(subject, subscription);
      (async () => {
        for await (const msg of subscription) {
          try {
            const decoded = msg.data?.length ? this.codec.decode(msg.data) as T : null as any; // Set to null if undefined
            Logger.debug(`Received message on subject ${subject}:`, decoded);
            await Promise.resolve(cb(decoded, msg.reply || ''));
          } catch (err) {
            Logger.error(`Error processing message on subject ${subject}:`, err);
          }
        }
      })().catch(err => {
        Logger.error(`Subscription error for ${subject}:`, err);
      });
    }
  }
  async publish<T = unknown>(subject: string, data: T, reply?: string): Promise<void> {
    if (!this.nc) {
      throw new Error("Nats client not initialized yet");
    }
    const encoded = data ? this.codec.encode(data) : undefined;
    this.nc.publish(subject, encoded, { reply });
    Logger.debug(`Published message on subject ${subject}:`, data);
  }
  async request<TRequest = unknown, TResponse = unknown>(
    subject: string,
    data: TRequest | null, // Accept null explicitly
    timeout = 5000
  ): Promise<TResponse> {
    if (!this.nc) {
      throw new Error("Nats client not initialized yet");
    }
    try {
      Logger.debug(`Sending request to ${subject}:`, data);
      const encoded = data !== null ? this.codec.encode(data) : undefined;
      const response = await this.nc.request(subject, encoded, { timeout });
      const decoded = this.codec.decode(response.data) as TResponse;
      Logger.debug(`Received response from ${subject}:`, decoded);
      return decoded;
    } catch (error) {
      Logger.error(`Request failed for ${subject}:`, error);
      throw error;
    }
  }
  async unsubscribe(subject: string): Promise<void> {
    const subscription = this.subscriptions.get(subject);
    if (subscription) {
      subscription.unsubscribe();
      this.subscriptions.delete(subject);
      Logger.debug(`Unsubscribed from ${subject}`);
    }
  }
  async drain(): Promise<void> {
    if (this.nc) {
      await this.nc.drain();
      Logger.info("NATS connection drained");
    }
  }
  isConnected(): boolean {
    return this.nc !== null && !this.nc.isClosed();
  }
  getServerInfo(): string | undefined {
    return this.nc?.getServer();
  }
  getSubscriptionCount(): number {
    return this.subscriptions.size;
  }
  getActiveSubjects(): string[] {
    return Array.from(this.subscriptions.keys());
  }
}

// src/core/rpc/rpc-client.interface.ts
import { NatsOptions } from '../../types';
import { ClassType, ClassTypeProxy } from '../../types/index';
import { LogLevel } from '../utils/logger';
export type RPCClientOptions = NatsOptions & {
  timeout?: number;
  logLevel?: LogLevel
};
export interface IRPCClient {
  start(): Promise<void>;
  close(): Promise<void>;
  createProxy<T extends ClassType>(classConstructor: { new(...args: any[]): T }): ClassTypeProxy<T>;
}

// src/core/rpc/rpc-client.ts
import { NatsClient } from '../nats/nats-client';
import { defaultNatsOptions, ClassType, ClassTypeProxy } from '../../types';
import { Logger } from '../utils/logger';
import { IRPCClient, RPCClientOptions } from './rpc-client.interface';
export class RPCClient implements IRPCClient {
  private natsClient: NatsClient;
  private timeout: number;
  private isStarted: boolean = false;
  private methodCache: Map<string, Map<string, Function>> = new Map();
  constructor(options: RPCClientOptions = defaultNatsOptions) {
    this.natsClient = new NatsClient(options);
    this.timeout = options.timeout || 5000; // Default 5 second timeout
    Logger.setLogLevel(options?.logLevel ?? defaultNatsOptions.logLevel);
  }
  async start(): Promise<void> {
    if (this.isStarted) {
      Logger.debug('RPC Client already started');
      return;
    }
    await this.natsClient.connect();
    this.isStarted = true;
    Logger.info('RPC Client started');
  }
  async close(): Promise<void> {
    if (!this.isStarted) {
      Logger.debug('RPC Client already closed');
      return;
    }
    await this.natsClient.close();
    this.isStarted = false;
    this.methodCache.clear();
    Logger.info('RPC Client closed');
  }
  isConnected(): boolean {
    return this.isStarted && this.natsClient.isConnected();
  }
  createProxy<T extends ClassType>(
    classConstructor: new (...args: any[]) => T
  ): ClassTypeProxy<T> {
    if (!this.isStarted) {
      throw new Error('RPC Client not started. Call start() first.');
    }
    const className = classConstructor.name;
    Logger.debug(`Creating proxy for class: ${className}`);
    if (!this.methodCache.has(className)) {
      this.methodCache.set(className, new Map());
    }
    const handler: ProxyHandler<ClassTypeProxy<T>> = {
      get: (_target: ClassTypeProxy<T>, p: string | symbol, _receiver: any) => {
        const methodName = p.toString();
        const cachedMethod = this.methodCache.get(className)?.get(p.toString());
        if (cachedMethod) {
          return cachedMethod;
        }
        const methodProxy = async (...args: any[]): Promise<any> => {
          const subject = `${className}.${methodName}`;
          const input = args[0]; // Take first argument as input
          Logger.debug(`Client requesting to subject: ${subject}`, input);
          try {
            const response = await this.natsClient.request(
              subject,
              input !== undefined ? input : null, // Send null if input is undefined
              this.timeout
            );
            Logger.debug(`Received response from ${subject}:`, response);
            if (response && typeof response === 'object' && 'error' in response) {
              throw new Error(response.error as string);
            }
            return response;
          } catch (error) {
            Logger.error(
              `Error calling method "${methodName}" on class "${className}":`,
              error
            );
            throw error instanceof Error ? error : new Error(`RPC call failed: ${error}`);
          }
        };
        this.methodCache.get(className)?.set(methodName, methodProxy);
        return methodProxy;
      }
    };
    return new Proxy({} as ClassTypeProxy<T>, handler);
  }
  getAvailableMethods(className: string): string[] {
    const methods = this.methodCache.get(className);
    return methods ? Array.from(methods.keys()) : [];
  }
  isMethodAvailable(className: string, methodName: string): boolean {
    return this.methodCache.get(className)?.has(methodName) ?? false;
  }
  setTimeout(timeout: number): void {
    this.timeout = timeout;
  }
  getTimeout(): number {
    return this.timeout;
  }
  clearMethodCache(className?: string): void {
    if (className) {
      this.methodCache.delete(className);
    } else {
      this.methodCache.clear();
    }
  }
  getStats(): {
    isConnected: boolean;
    cachedClasses: number;
    totalCachedMethods: number;
    timeout: number;
  } {
    let totalMethods = 0;
    this.methodCache.forEach(methods => {
      totalMethods += methods.size;
    });
    return {
      isConnected: this.isConnected(),
      cachedClasses: this.methodCache.size,
      totalCachedMethods: totalMethods,
      timeout: this.timeout,
    };
  }
}

// src/core/rpc/rpc-server.interface.ts
import { NatsOptions } from '../../types';
import { ClassType } from '../../types/index';
import { LogLevel } from '../utils/logger';
export type RPCServerOptions = NatsOptions & {
  retry?: {
    attempts: number;
    delay: number;
  };
  dlq?: string;
  logLevel?: LogLevel
};
export interface IRPCServer {
  start(): Promise<void>;
  close(): Promise<void>;
  handleRequest<T extends ClassType>(instance: T): Promise<void>;
  isConnected(): boolean;
}

// src/core/rpc/rpc-server.ts
import { NatsClient } from '../nats/nats-client';
import { Logger } from '../utils/logger';
import { defaultNatsOptions, ClassType } from '../../types';
import { IRPCServer, RPCServerOptions } from './rpc-server.interface';
import { RetryUtil, RetryConfigInterface } from 'retry-util-alvamind'
export class RPCServer implements IRPCServer {
  private natsClient: NatsClient;
  private methodMapping: Map<string, { instance: any; methods: Set<string> }>;
  private retryConfig: RetryConfigInterface;
  private dlqSubject?: string;
  private isStarted: boolean = false;
  constructor(options: RPCServerOptions = defaultNatsOptions) {
    this.natsClient = new NatsClient(options);
    this.methodMapping = new Map();
    this.retryConfig = {
      maxRetries: options?.retry?.attempts || 3,
      initialDelay: options?.retry?.delay || 1000,
      factor: 2,
      maxDelay: 10000,
    };
    this.dlqSubject = options.dlq;
    Logger.setLogLevel(options?.logLevel ?? defaultNatsOptions.logLevel);
  }
  async start(): Promise<void> {
    if (this.isStarted) return;
    await this.natsClient.connect();
    this.isStarted = true;
    Logger.info('RPC Server started');
  }
  isConnected(): boolean {
    return this.isStarted && this.natsClient.isConnected();
  }
  async close(): Promise<void> {
    await this.natsClient.close();
    Logger.info('RPC Server closed');
  }
  private getMethodsFromPrototype(obj: any): string[] {
    const methods: string[] = [];
    let current = obj;
    do {
      Object.entries(Object.getOwnPropertyDescriptors(current))
        .filter(([_, descriptor]) => typeof descriptor.value === 'function')
        .forEach(([name]) => {
          if (name !== 'constructor') {
            methods.push(name);
          }
        });
    } while ((current = Object.getPrototypeOf(current)) && current !== Object.prototype);
    return [...new Set(methods)]; // Remove duplicates
  }
  async handleRequest<T extends ClassType>(instance: T): Promise<void> {
    if (!this.isStarted) {
      throw new Error('RPC Server not started. Call start() first.');
    }
    const className = instance.constructor.name;
    Logger.debug(`Registering handlers for class: ${className}`);
    if (!this.methodMapping.has(className)) {
      const methods = new Set(this.getMethodsFromPrototype(instance));
      this.methodMapping.set(className, { instance, methods });
      for (const methodName of methods) {
        const subject = `${className}.${methodName}`;
        Logger.debug(`Registering handler for ${subject}`);
        await this.natsClient.subscribe(
          subject,
          async (data: any, reply: string) => {
            await this.processRequestWithRetry(className, methodName, data, reply, instance);
          },
          { queue: className }
        );
      }
      Logger.info(`Registered ${methods.size} methods for ${className}`);
    }
  }
  private async processRequestWithRetry(
    className: string,
    methodName: string,
    data: any,
    reply: string,
    instance: any
  ): Promise<void> {
    const onRetry = (attempt: number, error: Error) => {
      Logger.warn(
        `Retrying ${className}.${methodName} (attempt ${attempt}): ${error.message}. Retrying in ${this.retryConfig.initialDelay * Math.pow(2, attempt - 1)
        }ms...`
      );
    };
    try {
      const result = await RetryUtil.withRetry(
        async () => {
          const response = await this.processRequest(className, methodName, data, reply, instance);
          return response;
        },
        this.retryConfig,
        onRetry
      );
      if (result) {
        await this.natsClient.publish(reply, result);
      }
    } catch (error) {
      Logger.error(`Request to ${className}.${methodName} failed after all retries:`, error);
      if (this.dlqSubject) {
        const dlqMessage = {
          className,
          methodName,
          data,
          error: error instanceof Error ? error.message : String(error)
        };
        await this.natsClient.publish(this.dlqSubject, dlqMessage);
        Logger.info(`Message sent to DLQ ${this.dlqSubject}`);
      }
      await this.natsClient.publish(reply, {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  private async processRequest(
    className: string,
    methodName: string,
    data: any,
    _reply: string,
    instance: any
  ): Promise<any> {
    const method = instance[methodName];
    if (!method) {
      throw new Error(`Method "${methodName}" not found`);
    }
    try {
      const result = await method.call(instance, data);
      Logger.debug(`Successfully processed ${className}.${methodName}`, {
        input: data,
        output: result
      });
      return result;
    } catch (error) {
      Logger.error(`Error executing "${methodName}" in class "${className}":`, error);
      throw error;
    }
  }
  public getRegisteredMethods(): Map<string, Set<string>> {
    const result = new Map<string, Set<string>>();
    for (const [className, { methods }] of this.methodMapping.entries()) {
      result.set(className, methods);
    }
    return result;
  }
  public isMethodRegistered(className: string, methodName: string): boolean {
    const classMapping = this.methodMapping.get(className);
    return classMapping?.methods.has(methodName) ?? false;
  }
}

// src/core/utils/logger.ts
import { logger } from 'logger-alvamind';
export type LogLevel = 'none' | 'info' | 'debug';
export class Logger {
  static logLevel: LogLevel = 'info';
  static setLogLevel(level: LogLevel) {
    Logger.logLevel = level;
  }
  static debug(message: string, ...args: any[]): void {
    if (Logger.logLevel === 'debug' && (process.env['DEBUG'] || process.env.NODE_ENV === 'test')) {
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

// src/generate-services.ts
#!/usr/bin/env node
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { glob } from 'glob';
import fs from 'node:fs/promises';
import path from 'node:path';
import chokidar from 'chokidar';
import { debounce } from 'lodash';
import { Project, SourceFile } from 'ts-morph';
import picomatch from 'picomatch';
import { Config } from './types';
import { ModuleKind, ModuleResolutionKind, ScriptTarget } from 'typescript';
interface ClassInfo {
  name: string;
  path: string;
  methods: string[];
}
class Logger {
  private level: string;
  constructor(level: string) {
    this.level = level.toLowerCase();
  }
  debug(...args: any[]): void {
    if (this.level === 'debug') console.debug(...args);
  }
  info(...args: any[]): void {
    if (['debug', 'info'].includes(this.level)) console.info(...args);
  }
  warn(...args: any[]): void {
    if (['debug', 'info', 'warn'].includes(this.level)) console.warn(...args);
  }
  error(...args: any[]): void {
    console.error(...args);
  }
}
const parseArgs = (): Config => {
  const argv = yargs(hideBin(process.argv))
    .command('generate', 'Generate rpc-services.ts file', (yargs) => {
      yargs
        .option('includes', {
          type: 'string',
          describe: 'Glob patterns or direct paths for including files',
          array: true,
          coerce: (arg: string | string[] | undefined) => {
            if (!arg) return undefined;
            return typeof arg === 'string' ? arg.split(/[,\s]+/).filter(Boolean) : arg;
          },
        })
        .option('excludes', {
          type: 'string',
          describe: 'Glob patterns or direct paths for excluding files',
          default: [],
          array: true,
          coerce: (arg: string | string[]) => (typeof arg === 'string' ? arg.split(/[,\s]+/).filter(Boolean) : arg),
        })
        .option('output', {
          type: 'string',
          describe: 'Output file path',
          default: 'src/common/rpc/rpc-services.ts',
        })
        .option('watch', {
          type: 'boolean',
          describe: 'Watch for file changes and regenerate',
          default: false,
        })
        .option('logLevel', {
          type: 'string',
          describe: 'Log level (debug, info, warn, error)',
          default: 'info',
        });
    })
    .parseSync();
  if (argv._[0] !== 'generate') {
    console.error('Invalid command. Use "generate".');
    process.exit(1);
  }
  return argv as unknown as Config;
};
class FileSystem {
  private logger: Logger;
  constructor(logger: Logger) {
    this.logger = logger;
  }
  public async ensureDir(dirPath: string): Promise<void> {
    await fs.mkdir(dirPath, { recursive: true });
  }
  public async writeFile(filePath: string, content: string): Promise<void> {
    await fs.writeFile(filePath, content, 'utf-8');
  }
  public async findFiles(includes: string[] | undefined, excludes: string[]): Promise<string[]> {
    const defaultIncludes = ['**node_modulesdistbuild
export class RPCServices {
${classProperties}
    constructor(private rpcClient: RPCClient) {
${classInits}
    }
}`;
    this.logger.debug('Generated code:', outputCode);
    await this.fileSystem.writeFile(outputFile, outputCode);
  }
  private generateImports(classes: ClassInfo[], outputFile: string): string {
    return classes
      .map((c) => {
        const importPath = path.relative(path.dirname(outputFile), c.path).replace(/\\/g, '/').replace(/\.ts$/, '');
        return `import { ${c.name} } from '${importPath}';`;
      })
      .join('\n');
  }
  private generateClassProperties(classes: ClassInfo[]): string {
    return classes.map((c) => `    ${c.name}: ClassTypeProxy<${c.name}>;`).join('\n');
  }
  private generateClassInits(classes: ClassInfo[]): string {
    return classes.map((c) => `        this.${c.name} = this.rpcClient.createProxy(${c.name});`).join('\n');
  }
  public generateEmptyOutput(reason: string): string {
    return `// This file is auto-generated by rpc-nats-alvamind
import { RPCClient, ClassTypeProxy } from 'rpc-nats-alvamind';
export class RPCServices {
    constructor(private rpcClient: RPCClient) {}
}`;
  }
}
export async function main(config: Config) {
  const logger = new Logger(config.logLevel);
  logger.info('Configuration: ', config);
  const fileSystem = new FileSystem(logger);
  const codeAnalyzer = new CodeAnalyzer(logger);
  const codeGenerator = new CodeGenerator(fileSystem, logger);
  const generate = async () => {
    const startTime = Date.now();
    logger.info('Starting RPC services generation...');
    try {
      await fileSystem.ensureDir(path.dirname(config.output));
      const files = await fileSystem.findFiles(config.includes, config.excludes);
      if (!files.length) {
        logger.warn('No files found with provided includes/excludes.');
        await fileSystem.writeFile(config.output, codeGenerator.generateEmptyOutput('files'));
        return;
      }
      logger.info(`Files Scanned: ${files.length}`);
      logger.debug('Matched files:', files);
      const includes = config.includes || []; // Use empty array if undefined
      const classes = await codeAnalyzer.analyzeClasses(files, includes, config.excludes);
      logger.info(`Classes detected: ${classes.length}`);
      logger.debug('Detected classes:', classes);
      await codeGenerator.generateCode(classes, config.output);
      logger.info(`Generated ${config.output} with ${classes.length} services.`);
    } catch (error) {
      logger.error('Error during generation:', error);
    } finally {
      const endTime = Date.now();
      const duration = (endTime - startTime) / 1000;
      logger.info(`Completed in ${duration.toFixed(2)} seconds.`);
    }
  };
  await generate();
  if (config.watch) {
    const watcher = chokidar.watch(config.includes || ['**/*'], {
      ignored: config.excludes,
      ignoreInitial: true,
    });
    const debouncedGenerate = debounce(generate, 300);
    watcher.on('all', (event, path) => {
      logger.info(`File changed: ${path}, event: ${event}. Regenerating...`);
      debouncedGenerate();
    });
    logger.info('Watching for changes...');
  }
}
if (require.main === module) {
  const config = parseArgs();
  main(config).catch(console.error);
}

// src/index.ts
export * from "./core/nats/nats-client";
export * from "./core/rpc/rpc-server";
export * from "./core/rpc/rpc-client";
export * from "./types";
export * from "./core/codec/codec";

// src/types/index.ts
import { LogLevel } from "../core/utils/logger";
export const defaultNatsOptions = {
  url: "nats://localhost:4222",
  logLevel: 'info' as LogLevel
};
export type MethodType = (...args: any[]) => Promise<any>;
export type ClassType = {
  [key: string | symbol]: any;
};
export type ClassTypeProxy<T extends ClassType> = {
  [K in keyof T]: T[K] extends (...args: infer Args) => Promise<infer R>
  ? (...args: Args) => Promise<R>
  : T[K] extends (...args: infer Args) => infer R
  ? (...args: Args) => Promise<R>
  : never;
};
export type NatsOptions = {
  url?: string,
  codec?: "json" | "string",
  debug?: boolean
  logLevel?: LogLevel
};
export interface Config {
  includes?: string[];
  excludes: string[];
  output: string;
  watch: boolean;
  logLevel: string;
}

// tsconfig.build.json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "outDir": "dist",
    "declaration": true,
    "sourceMap": true,
    "module": "CommonJS",
    "target": "ES2019",
    "moduleResolution": "node",
    "allowImportingTsExtensions": false,
    "esModuleInterop": true
  },
  "include": ["src*"],
  "exclude": ["test", "dist", "node_modules"]
}

// tsconfig.json
{
  "compilerOptions": {
    "lib": ["ESNext"],
    "target": "ESNext",
    "module": "ESNext",
    "moduleDetection": "force",
    "jsx": "react-jsx",
    "allowJs": true,
    "moduleResolution": "bundler",
    "verbatimModuleSyntax": false,
    "strict": true,
    "skipLibCheck": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noPropertyAccessFromIndexSignature": true,
    "noEmit": true
  }
}
