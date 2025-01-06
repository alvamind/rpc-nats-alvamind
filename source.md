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
- **/test/**
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
    "source": "generate-source --exclude=**/disttest/**,.gitignore,bun.lockb --output=source.md",
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
  subscribe<T = unknown>(subject: string, cb: (data: T, reply: string) => void, options?: SubscriptionOptions): Promise<void>;
  publish<T = unknown>(subject: string, data: T, reply?: string): Promise<void>;
  request<TRequest = unknown, TResponse = unknown>(subject: string, data: TRequest, timeout?: number): Promise<TResponse>;
}

// src/core/nats/nats-client.ts
import { connect, NatsConnection, SubscriptionOptions, JetStreamClient } from "nats";
import { getCodec, SupportedCodec } from "../codec/codec";
import { INatsClient } from "./nats-client.interface";
import { defaultNatsOptions, NatsOptions } from "../../types";
import { Logger } from "../utils/logger";
import { NatsCodec } from "../codec/codec.interface";
export class NatsClient implements INatsClient {
  private nc: NatsConnection | null = null;
  private jsm: JetStreamClient | null = null;
  private codec: NatsCodec<any>;
  private options: NatsOptions;
  constructor(options: NatsOptions) {
    this.options = options;
    this.codec = getCodec(options?.codec);
    if (options?.debug) {
      Logger.setLogLevel("debug")
    }
  }
  async connect(): Promise<void> {
    try {
      this.nc = await connect({
        url: this.options?.url ?? defaultNatsOptions.url,
      });
      this.jsm = this.nc.jetstream();
      Logger.info("NATS connected")
    } catch (error) {
      Logger.error("Failed to connect to NATS", error)
      throw new Error("Failed to connect to NATS")
    }
  }
  async close(): Promise<void> {
    if (this.nc && !this.nc.isClosed()) {
      await this.nc.close();
      Logger.info("NATS connection closed")
    }
  }
  getJetstreamClient(): JetStreamClient | null {
    return this.jsm;
  }
  getNatsConnection(): NatsConnection | null {
    return this.nc
  }
  getCodec<T = any>(): NatsCodec<T> {
    return this.codec;
  }
  async subscribe<T = unknown>(subject: string, cb: (data: T, reply: string) => void, options?: SubscriptionOptions): Promise<void> {
    if (!this.nc) {
      throw new Error("Nats client not initialized yet")
    }
    const subscription = this.nc.subscribe(subject, options)
    for await (const msg of subscription) {
      try {
        const decoded = this.codec.decode(msg.data) as T;
        cb(decoded, msg.reply || '')
        Logger.debug(`Received message on subject ${subject}:`, decoded)
      } catch (err) {
        Logger.error(`Error decoding message on subject ${subject}:`, err)
      }
    }
  }
  async publish<T = unknown>(subject: string, data: T, reply?: string): Promise<void> {
    if (!this.nc) {
      throw new Error("Nats client not initialized yet");
    }
    const encoded = this.codec.encode(data);
    this.nc.publish(subject, encoded, { reply });
    Logger.debug(`Published message on subject ${subject}:`, data)
  }
  async request<TRequest = unknown, TResponse = unknown>(subject: string, data: TRequest, timeout = 1000): Promise<TResponse> {
    if (!this.nc) {
      throw new Error("Nats client not initialized yet");
    }
    const encoded = this.codec.encode(data);
    const response = await this.nc.request(subject, encoded, { timeout });
    return this.codec.decode(response.data);
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
  constructor(options: RPCClientOptions = defaultNatsOptions) {
    this.natsClient = new NatsClient(options);
    this.timeout = options.timeout || 1000;
  }
  async start(): Promise<void> {
    await this.natsClient.connect();
  }
  async close(): Promise<void> {
    await this.natsClient.close();
  }
  createProxy<T extends ClassType>(classConstructor: { new (...args: any[]): T }): ClassTypeProxy<T> {
    const proxy: ClassTypeProxy<T> = {} as ClassTypeProxy<T>;
    const className = classConstructor.name;
    return new Proxy(proxy, {
        get: (target, methodName:string) => {
            return async (...args: any[]) => {
                const subject = `${className}.${methodName}`;
                 Logger.debug(`Calling method "${methodName}" on class "${className}"`);
                try {
                  return  await this.natsClient.request(subject, args[0], this.timeout)
                }catch(error){
                   Logger.error(`Error calling method "${methodName}" on class "${className}":`, error)
                   throw error
                }
              };
        },
    });
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
}

// src/core/rpc/rpc-server.ts
import { NatsClient } from '../nats/nats-client';
import { Logger } from '../utils/logger';
import { defaultNatsOptions, ClassType } from '../../types';
import { IRPCServer, RPCServerOptions } from './rpc-server.interface';
type MethodMapping = {
    [key: string]: ClassType;
};
export class RPCServer implements IRPCServer {
    private natsClient: NatsClient;
    private methodMapping: MethodMapping = {};
    private retryConfig: {
        attempts: number;
        delay: number;
    };
    private dlqSubject?: string;
  constructor(options: RPCServerOptions = defaultNatsOptions) {
    this.natsClient = new NatsClient(options);
    this.retryConfig = options.retry || { attempts: 3, delay: 1000 };
    this.dlqSubject = options.dlq;
  }
  async start(): Promise<void> {
    await this.natsClient.connect();
  }
  async close(): Promise<void> {
    await this.natsClient.close();
  }
    async handleRequest<T extends ClassType>(instance: T): Promise<void> {
        const className = instance.constructor.name
        this.methodMapping[className] = instance;
            for(const methodName in instance){
                const subject = `${className}.${methodName}`;
                this.natsClient.subscribe(subject, async (data: any, reply: string) => {
                    await this.processRequest(className, methodName, data, reply);
                  })
            }
    }
    private async processRequest(className:string, methodName: string, data: any, reply?:string) {
        const method = this.methodMapping[className][methodName];
      if (!method) {
        Logger.error(`Method "${methodName}" not found in class "${className}".`);
        return;
      }
        let attempts = 0;
        while (attempts <= this.retryConfig.attempts) {
          try {
            const result = await method(data);
            if(reply){
                await this.natsClient.publish(reply, result)
            }
             Logger.debug(`Method "${methodName}" in class "${className}" called successfully.`);
            return;
          } catch (error) {
            attempts++;
            Logger.error(`Error executing method "${methodName}" in class "${className}" (Attempt ${attempts}):`, error);
            if (attempts > this.retryConfig.attempts) {
                if (this.dlqSubject) {
                Logger.warn(`Sending failed request to DLQ: ${this.dlqSubject}`);
                  await this.natsClient.publish(this.dlqSubject, data);
                }else{
                    Logger.error("DLQ not specified, dropping message")
                }
              break;
            }
              await new Promise(resolve => setTimeout(resolve, this.retryConfig.delay));
          }
        }
      }
}

// src/core/utils/logger.ts
import chalk from "chalk";
export type LogLevel = "debug" | "info" | "warn" | "error";
export class Logger {
    private static logLevel: LogLevel = "info";
    static setLogLevel(level: LogLevel){
        Logger.logLevel = level
    }
    static debug(message: string, ...args: any[]): void{
        if(Logger.logLevel === "debug"){
          console.debug(chalk.gray(`[DEBUG] ${message}`, ...args));
        }
    }
    static info(message: string, ...args: any[]): void{
        console.log(chalk.blue(`[INFO] ${message}`, ...args));
    }
    static warn(message: string, ...args: any[]): void{
        console.warn(chalk.yellow(`[WARN] ${message}`, ...args));
    }
    static error(message: string, ...args: any[]): void{
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
      [key: string]: MethodType
  }
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

