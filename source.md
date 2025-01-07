# Project: rpc-nats-alvamind

## 📂 Included Patterns:
- (all project files)

## 🚫 Excluded Patterns:
- **/node_modules/**
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

## 📁 Directory Structure:
- scripts
- src/core/codec
- src/core/nats
- src/core/rpc
- src/core/utils
- src
- src/types
- test

## 💻 Source Code:
====================

// package.json
{
  "name": "rpc-nats-alvamind",
  "version": "1.0.9",
  "description": "A flexible RPC library using NATS",
  "type": "module",
  "main": "dist/index.js",
  "module": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "require": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/alvamind/rpc-nats-alvamind.git"
  },
  "prisma": {
    "seed": "bunx ts-node-esm prisma/seed.ts"
  },
  "scripts": {
    "dev": "bun run src/index.ts --watch",
    "compose": "docker compose up -d",
    "commit": "commit",
    "reinstall": "clean && bun install",
    "build": "tsc && tsc -p tsconfig.build.json",
    "source": "generate-source --exclude=**/dist/**,.gitignore,bun.lockb --output=source.md",
    "clean": "rimraf dist",
    "build:tgz": "bun run build && bun pm pack",
    "test": "bun test test/*.test.ts"
  },
  "keywords": [
    "rpc",
    "nats",
    "microservices",
    "typescript"
  ],
  "files": [
    "dist",
    "src",
    "scripts",
    "README.md",
    "index.d.ts"
  ],
  "author": "Alvamind",
  "license": "MIT",
  "dependencies": {
    "alvamind-tools": "^1.0.20",
    "nats": "^2.28.2",
    "chalk": "^5.4.1"
  },
  "devDependencies": {
    "@types/node": "^20.17.12",
    "bun-types": "^1.1.42",
    "rimraf": "^6.0.1",
    "typescript": "^5.7.2"
  }
}

// scripts/postinstall.ts
#!/usr/bin/env node
import chalk from 'chalk';
console.log(chalk.green('🎉 rpc-nats-alvamind installed!'));
console.log(chalk.yellow('To generate types for your services:'));
console.log(chalk.cyan('  1. Navigate to your project directory.'));
console.log(chalk.cyan('  2. Run: ') + chalk.bold('rpc-nats-alvamind generate <scanPath> <outputPath>'));
console.log(
  chalk.yellow('  Example: ') +
    chalk.bold('rpc-nats-alvamind generate ./src/services ./src/generated/exposed-methods.d.ts'),
);
console.log(chalk.yellow('Remember to replace the example scan path and output path with your own.'));

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
    return new TextEncoder().encode(JSON.stringify(data));
  }
  decode(data: Uint8Array): T {
    return JSON.parse(new TextDecoder().decode(data));
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
            const decoded = this.codec.decode(msg.data) as T;
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
    const encoded = this.codec.encode(data);
    this.nc.publish(subject, encoded, { reply });
    Logger.debug(`Published message on subject ${subject}:`, data);
  }
  async request<TRequest = unknown, TResponse = unknown>(
    subject: string,
    data: TRequest,
    timeout = 5000
  ): Promise<TResponse> {
    if (!this.nc) {
      throw new Error("Nats client not initialized yet");
    }
    try {
      Logger.debug(`Sending request to ${subject}:`, data);
      const encoded = this.codec.encode(data);
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
export type RPCClientOptions = NatsOptions & {
  timeout?: number;
};
export interface IRPCClient {
  start(): Promise<void>;
  close(): Promise<void>;
  createProxy<T extends ClassType>(classConstructor: { new (...args: any[]): T }): ClassTypeProxy<T>;
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
    classConstructor: { new(...args: any[]): T }
  ): ClassTypeProxy<T> {
    if (!this.isStarted) {
      throw new Error('RPC Client not started. Call start() first.');
    }
    const className = classConstructor.name;
    Logger.debug(`Creating proxy for class: ${className}`);
    if (!this.methodCache.has(className)) {
      this.methodCache.set(className, new Map());
    }
    const proxy: ClassTypeProxy<T> = {} as ClassTypeProxy<T>;
    return new Proxy(proxy, {
      get: (target, methodName: string) => {
        const cachedMethod = this.methodCache.get(className)?.get(methodName);
        if (cachedMethod) {
          return cachedMethod;
        }
        const methodProxy = async (...args: any[]) => {
          const subject = `${className}.${methodName}`;
          Logger.debug(`Client requesting to subject: ${subject}`, args[0]);
          try {
            const response = await this.natsClient.request(
              subject,
              args[0],
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
            throw error instanceof Error
              ? error
              : new Error(`RPC call failed: ${error}`);
          }
        };
        this.methodCache.get(className)?.set(methodName, methodProxy);
        return methodProxy;
      },
      set: (_target, property, _value) => {
        throw new Error(
          `Cannot set property "${String(property)}" on RPC proxy. RPC proxies are read-only.`
        );
      },
      has: (_target, property) => {
        let proto = classConstructor.prototype;
        while (proto && proto !== Object.prototype) {
          if (property in proto) {
            return true;
          }
          proto = Object.getPrototypeOf(proto);
        }
        return false;
      },
      getOwnPropertyDescriptor: (_target, property) => {
        const descriptor = Object.getOwnPropertyDescriptor(
          classConstructor.prototype,
          property
        );
        if (descriptor) {
          return {
            ...descriptor,
            configurable: true,
          };
        }
        return undefined;
      },
      ownKeys: (_target) => {
        return Reflect.ownKeys(classConstructor.prototype);
      }
    });
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
export type RPCServerOptions = NatsOptions & {
  retry?: {
    attempts: number;
    delay: number;
  };
  dlq?: string;
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
export class RPCServer implements IRPCServer {
  private natsClient: NatsClient;
  private methodMapping: Map<string, { instance: any; methods: Set<string> }>;
  private retryConfig: { attempts: number; delay: number };
  private dlqSubject?: string;
  private isStarted: boolean = false;
  constructor(options: RPCServerOptions = defaultNatsOptions) {
    this.natsClient = new NatsClient(options);
    this.methodMapping = new Map();
    this.retryConfig = options.retry || { attempts: 3, delay: 1000 };
    this.dlqSubject = options.dlq;
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
            await this.processRequest(className, methodName, data, reply, instance);
          },
          { queue: className }
        );
      }
      Logger.info(`Registered ${methods.size} methods for ${className}`);
    }
  }
  private async processRequest(
    className: string,
    methodName: string,
    data: any,
    reply: string,
    instance: any
  ): Promise<void> {
    if (!reply) {
      Logger.debug(`Ignoring request without reply subject for ${className}.${methodName}`);
      return;
    }
    const method = instance[methodName];
    if (!method) {
      Logger.error(`Method "${methodName}" not found in class "${className}"`);
      await this.natsClient.publish(reply, {
        error: `Method "${methodName}" not found`
      });
      return;
    }
    try {
      const result = await method.call(instance, data);
      await this.natsClient.publish(reply, result);
      Logger.debug(`Successfully processed ${className}.${methodName}`, {
        input: data,
        output: result
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      Logger.error(`Error executing "${methodName}" in class "${className}":`, error);
      await this.natsClient.publish(reply, {
        error: errorMessage
      });
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

// src/index.ts
export * from "./core/nats/nats-client";
export * from "./core/rpc/rpc-server";
export * from "./core/rpc/rpc-client";
export * from "./types";
export * from "./core/codec/codec";

// src/types/index.ts
export const defaultNatsOptions = {
  url: "nats://localhost:4222",
};
export type MethodType = (...args: any[]) => Promise<any>;
export type ClassType = {
  [key: string | symbol]: any
};
export type ClassTypeProxy<T extends ClassType> = {
  [K in keyof T]: T[K] extends (...args: infer Args) => Promise<infer R>
  ? (...args: Args) => Promise<R>
  : never;
};
export type NatsOptions = {
  url?: string,
  codec?: "json" | "string",
  debug?: boolean
};

// test/rpc.test.ts
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { RPCServer, RPCClient } from "../src";
const natsUrl = "nats://localhost:4222";
class BaseClass {
  async baseMethod(input: { id: number }): Promise<{ id: number; timestamp: Date }> {
    return { id: input.id, timestamp: new Date() };
  }
}
class ChildClass extends BaseClass {
  async childMethod(input: { name: string }): Promise<{ name: string; message: string }> {
    return { name: input.name, message: "Hello from Child" };
  }
}
class ErrorClass {
  async errorMethod(): Promise<void> {
    throw new Error("Test error");
  }
}
class SlowClass {
  async slowMethod(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 200));
  }
}
class CounterClass {
  counter = 0;
  async increment(): Promise<number> {
    this.counter++;
    return this.counter;
  }
}
describe("RPC with Prototype Chain", () => {
  let server: RPCServer;
  let client: RPCClient;
  let baseClient: any;
  let childClient: any;
  beforeAll(async () => {
    server = new RPCServer({ url: natsUrl, debug: true });
    await server.start();
    client = new RPCClient({ url: natsUrl, debug: true });
    await client.start();
    const baseInstance = new BaseClass();
    const childInstance = new ChildClass();
    const errorInstance = new ErrorClass();
    const slowInstance = new SlowClass();
    const counterInstance = new CounterClass();
    await server.handleRequest(baseInstance);
    await server.handleRequest(childInstance);
    await server.handleRequest(errorInstance);
    await server.handleRequest(slowInstance);
    await server.handleRequest(counterInstance);
    baseClient = client.createProxy(BaseClass);
    childClient = client.createProxy(ChildClass);
    await new Promise(resolve => setTimeout(resolve, 100));
  });
  afterAll(async () => {
    await client?.close();
    await server?.close();
  });
  it("should handle base class methods directly", async () => {
    const result = await baseClient.baseMethod({ id: 123 });
    expect(result).toBeDefined();
    expect(result.id).toBe(123);
    expect(result.timestamp).toBeDefined();
  });
  it("should handle inherited base methods from child class", async () => {
    const result = await childClient.baseMethod({ id: 456 });
    expect(result).toBeDefined();
    expect(result.id).toBe(456);
    expect(result.timestamp).toBeDefined();
  });
  it("should handle child class specific methods", async () => {
    const result = await childClient.childMethod({ name: "test" });
    expect(result).toBeDefined();
    expect(result.name).toBe("test");
    expect(result.message).toBe("Hello from Child");
  });
  it("should fail when accessing non-existent methods", async () => {
    await expect(async () => {
      await baseClient.nonExistentMethod();
    }).rejects.toThrow();
  });
  it("should properly reflect method availability", () => {
    expect(typeof baseClient.baseMethod).toBe("function");
    expect(baseClient.childMethod).toBeUndefined();
    expect(typeof childClient.baseMethod).toBe("function");
    expect(typeof childClient.childMethod).toBe("function");
  });
  it("should handle complex inheritance scenarios", async () => {
    const baseResult = await childClient.baseMethod({ id: 789 });
    const childResult = await childClient.childMethod({ name: "test2" });
    expect(baseResult.id).toBe(789);
    expect(childResult.name).toBe("test2");
    const [parallelBase, parallelChild] = await Promise.all([
      childClient.baseMethod({ id: 999 }),
      childClient.childMethod({ name: "parallel" })
    ]);
    expect(parallelBase.id).toBe(999);
    expect(parallelChild.name).toBe("parallel");
  });
  it("should handle timeouts properly", async () => {
    const timeoutClient = new RPCClient({
      url: natsUrl,
      debug: true,
      timeout: 100
    });
    await timeoutClient.start();
    const slowProxy = timeoutClient.createProxy(SlowClass);
    await expect(slowProxy.slowMethod()).rejects.toThrow();
    await timeoutClient.close();
  });
  it("should handle errors properly", async () => {
    const errorProxy = client.createProxy(ErrorClass);
    await expect(errorProxy.errorMethod()).rejects.toThrow("Test error");
  });
  it("should handle concurrent requests", async () => {
    const counterProxy = client.createProxy(CounterClass);
    const results = await Promise.all([
      counterProxy.increment(),
      counterProxy.increment(),
      counterProxy.increment()
    ]);
    expect(results).toEqual([1, 2, 3]);
  });
  it("should cleanup resources properly", async () => {
    const testServer = new RPCServer({ url: natsUrl, debug: true });
    await testServer.start();
    const testClient = new RPCClient({ url: natsUrl, debug: true });
    await testClient.start();
    expect(testServer.isConnected()).toBe(true);
    expect(testClient.isConnected()).toBe(true);
    await testServer.close();
    await testClient.close();
    expect(testServer.isConnected()).toBe(false);
    expect(testClient.isConnected()).toBe(false);
  });
});

// tsconfig.build.json
{
  "extends": "./tsconfig.json",
  "exclude": ["test", "dist", "scripts"],
  "compilerOptions": {
    "declaration": true,
    "outDir": "./dist"
  }
}

// tsconfig.json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "commonjs",
    "declaration": true,
    "outDir": "./dist",
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "strict": true,
    "skipLibCheck": true,
    "noEmit": false,
    "moduleResolution": "node",
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "lib": [
      "ESNext"
    ],
    "types": [
      "bun-types"
    ]
  },
  "include": [
    "src*.ts",
    "scripts*.ts"
  ],
  "exclude": [
    "node_modules"
  ]
}

