# Project: rpc-nats-alvamind

src
test
test/services
====================
// .gitignore
# Node Modules
node_modules/
# Build Output
build/
dist/
coverage/
# Temporary Files and Folders
.bun/
.turbo/
.eslintcache/
.parcel-cache/
.next/
.cache/
.DS_Store
*.log
*.lock
*.sqlite
# IDE Files
.idea/
.vscode/
*.suo
*.ntvs*
*.njsproj
*.sln
# System Files
__pycache__/
.env
# OS or Editor
*.swp
*.swo
*~
# Test Files
test/coverage/
test/*.snap

// package.json
{
  "name": "rpc-nats-alvamind",
  "version": "1.0.0",
  "description": "A flexible RPC library using NATS",
  "main": "build/index.js",
  "module": "build/index.mjs",
  "types": "build/index.d.ts",
  "repository": {
    "type": "git",
    "url": "https://github.com/alvamind/rpc-nats-alvamind.git"
  },
  "scripts": {
    "dev": "bun run src/index.ts --watch",
    "compose": "docker compose up -d",
    "commit": "commit",
    "source": "generate-source output=source.md exclude=build/,README.md,nats-rpc.test.ts",
    "clean": "rm -rf .bun .turbo .eslintcache .parcel-cache node_modules .next .cache dist build coverage .eslintcache .parcel-cache .turbo .vite yarn.lock package-lock.json bun.lockb pnpm-lock.yaml .DS_Store && echo 'Done.'",
    "build": "bun build ./src/index.ts --outdir ./build --target node"
  },
  "keywords": [
    "rpc",
    "nats",
    "microservices",
    "typescript"
  ],
  "files": [
    "build"
  ],
  "author": "Alvamind",
  "license": "MIT",
  "dependencies": {
    "alvamind-tools": "^1.0.2",
    "nats": "^2.28.2",
    "pino": "^8.21.0",
    "reflect-metadata": "^0.2.2"
  },
  "devDependencies": {
    "@types/node": "^20.17.11",
    "bun-types": "^1.1.42",
    "typescript": "^5.7.2"
  }
}

// src/index.ts
export { NatsClient } from './nats-client';
export { NatsRegistry } from './nats-registry';
export { NatsScanner } from './nats-scanner';
export type { NatsOptions, ClassInfo, MethodInfo, Payload, RetryConfig, Codec, ErrorObject } from './types';

// src/nats-client.ts
import { connect, NatsConnection, Codec, JSONCodec, StringCodec } from 'nats';
import { NatsOptions, RetryConfig, Payload, ErrorObject } from './types';
import { NatsRegistry } from './nats-registry';
import { pino, Logger } from 'pino';
export class NatsClient<T extends Record<string, any> = Record<string, any>> {
  private nc?: NatsConnection;
  private isConnected = false;
  private registry!: NatsRegistry<T>;
  private options!: NatsOptions;
  private logger!: Logger;
  private defaultRetryConfig: RetryConfig = {
    maxRetries: 3,
    initialDelay: 100,
    maxDelay: 1000,
    factor: 2,
  };
  private sc: Codec<any> = StringCodec();
  constructor() {}
  async connect(options: NatsOptions) {
    this.options = {
      ...options,
      retryConfig: {
        ...this.defaultRetryConfig,
        ...options.retryConfig,
      },
      codec: options.codec ?? JSONCodec(),
      scanPath: options.scanPath,
    };
    this.logger = this.options.logger ?? pino();
    this.logger.info(`[NATS] Connecting to ${options.natsUrl}`);
    if (this.isConnected) {
      this.logger.warn('[NATS] Already connected, closing current connection to re-initiate.');
      await this.close();
    }
    this.sc = this.options.codec ?? JSONCodec();
    const scanPath = this.options.scanPath ?? './';
    this.nc = await connect({ servers: this.options.natsUrl });
    this.registry = new NatsRegistry<T>(this.nc, this.options, this.logger);
    await this.registry.registerHandlers(scanPath);
    this.isConnected = true;
    this.logger.info(`[NATS] Successfully Connected to ${this.options.natsUrl}`);
    this.nc.closed().then(() => {
      this.logger.info('[RPC-NATS-LIB] Connection closed');
      this.isConnected = false;
    });
  }
  async disconnect() {
    if (!this.isConnected) {
      this.logger.warn('[NATS] Already disconnected.');
      return;
    }
    if (this.nc) {
      this.logger.warn('[NATS] Disconnecting..');
      await this.nc.drain();
      await this.close();
      this.logger.info('[NATS] Successfully disconnected');
      this.isConnected = false;
    }
  }
  async request<Req, Res>(subject: string, data: Req, retryConfig?: RetryConfig): Promise<Res> {
    if (!this.isConnected) throw new Error(`Nats is not connected`);
    const config = retryConfig ? { ...this.defaultRetryConfig, ...retryConfig } : this.options.retryConfig;
    return this.performRequest<Req, Res>(subject, data, config!);
  }
  private async performRequest<Req, Res>(
    subject: string,
    data: Req,
    retryConfig: RetryConfig,
    attempt: number = 0,
  ): Promise<Res> {
    try {
      const payload: Payload<Req> = {
        subject,
        data,
        context: this.options.context,
      };
      const response = await this.nc!.request(subject, this.sc.encode(payload), {
        timeout: this.options.requestTimeout ?? 3000,
      });
      const decoded = this.sc.decode(response.data);
      return decoded as Res;
    } catch (error: any) {
      if (attempt >= (retryConfig.maxRetries || 0)) {
        if (this.options.dlqSubject) {
          this.publish(this.options.dlqSubject, { subject, data });
          this.logger.warn(
            `[NATS] Request failed after max retries, send to DLQ ${this.options.dlqSubject}  - ${subject} - ${JSON.stringify(data)}`,
            error,
          );
        } else {
          const errorObject: ErrorObject = {
            code: 'REQUEST_FAILED',
            message: `Request failed after max retries, DLQ is not enabled ${subject} - ${JSON.stringify(data)}`,
            details: error,
          };
          this.logger.error(errorObject.message, error);
          throw errorObject;
        }
        throw error;
      }
      const delay = Math.min(
        (retryConfig.initialDelay || 0) * Math.pow(retryConfig.factor || 1, attempt),
        retryConfig.maxDelay || 0,
      );
      this.logger.warn(
        `[NATS] Request failed attempt number ${attempt}, retrying after ${delay}ms - ${subject} - ${JSON.stringify(data)}`,
        error,
      );
      await this.delay(delay);
      return this.performRequest(subject, data, retryConfig, attempt + 1);
    }
  }
  async publish<T>(subject: string, data: T): Promise<void> {
    if (!this.isConnected) throw new Error(`Nats is not connected`);
    const payload: Payload<T> = {
      subject,
      data,
      context: this.options.context,
    };
    this.nc!.publish(subject, this.sc.encode(payload));
  }
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  async close() {
    if (this.nc) {
      this.logger.warn('[NATS] Closing Connection');
      await this.nc.close();
      this.nc = undefined;
    }
  }
  getExposedMethods(): T {
    if (!this.registry) throw new Error(`Nats registry is not initialized.`);
    return this.registry.getExposedMethods();
  }
  isConnectedToNats() {
    return this.isConnected;
  }
  static createConnectionFromEnv(prefix: string = 'NATS', scanPath?: string): NatsOptions {
    const natsUrl = process.env[`${prefix}_URL`];
    if (!natsUrl) {
      throw new Error(`${prefix}_URL is not set in env variable`);
    }
    const retryConfig: RetryConfig = {
      maxRetries: parseInt(process.env[`${prefix}_RETRY_MAX_RETRIES`] || '3'),
      initialDelay: parseInt(process.env[`${prefix}_RETRY_INITIAL_DELAY`] || '100'),
      maxDelay: parseInt(process.env[`${prefix}_RETRY_MAX_DELAY`] || '1000'),
      factor: parseInt(process.env[`${prefix}_RETRY_FACTOR`] || '2'),
    };
    const dlqSubject = process.env[`${prefix}_DLQ_SUBJECT`];
    const requestTimeout = parseInt(process.env[`${prefix}_REQUEST_TIMEOUT`] || '3000');
    const streaming = process.env[`${prefix}_STREAMING`] === 'true';
    return {
      natsUrl,
      scanPath,
      retryConfig,
      dlqSubject,
      requestTimeout,
      streaming,
      codec: JSONCodec(),
    };
  }
}

// src/nats-registry.ts
import { NatsConnection, Codec, JSONCodec, Subscription } from 'nats';
import { NatsOptions, ClassInfo, Payload, ErrorObject } from './types';
import { NatsScanner } from './nats-scanner';
import { generateNatsSubject } from './utils';
import { Logger } from 'pino';
export class NatsRegistry<T extends Record<string, any> = Record<string, any>> {
  private handlers = new Map<string, Function>();
  private wildcardHandlers = new Map<string, Function>();
  private natsConnection: NatsConnection;
  private options: NatsOptions;
  private exposedMethods: Partial<T> = {};
  private logger: Logger;
  private sc: Codec<any>;
  private classCount = 0;
  private methodCount = 0;
  constructor(natsConnection: NatsConnection, options: NatsOptions, logger: Logger) {
    this.natsConnection = natsConnection;
    this.options = options;
    this.logger = logger;
    this.sc = this.options.codec ?? JSONCodec();
  }
  async registerHandlers(path: string) {
    this.logger.info(`[NATS] Registering handlers in ${path}`);
    const classes = await NatsScanner.scanClasses(path);
    if (classes.length === 0) {
      this.logger.warn(`[NATS] No exported class found in ${path}.`);
    }
    for (const classInfo of classes) {
      this.classCount++;
      (this.exposedMethods as any)[classInfo.className] = {};
      const controller = (this.exposedMethods as any)[classInfo.className];
      for (const methodInfo of classInfo.methods) {
        this.methodCount++;
        const subject = generateNatsSubject(
          classInfo.className,
          methodInfo.methodName,
          this.options.subjectPattern ?? ((className: string, methodName: string) => `${className}.${methodName}`),
        );
        this.registerHandler(subject, methodInfo.func);
        (controller as Record<string, any>)[methodInfo.methodName] = async <T>(data: any) =>
          await this.callHandler<T>(subject, data);
      }
    }
    this.logger.info(
      `[NATS] Finished registering handlers in ${path}. Total class: ${this.classCount}  Total methods: ${this.methodCount}`,
    );
  }
  private async registerHandler(subject: string, handler: Function) {
    if (this.handlers.has(subject)) {
      this.logger.warn(`[RPC-NATS-LIB] Handler already registered for subject: ${subject}`);
      return;
    }
    this.handlers.set(subject, handler);
    if (subject.includes('*')) {
      this.wildcardHandlers.set(subject, handler);
    }
    const subscription = this.natsConnection.subscribe(subject, {
      callback: async (err, msg) => {
        if (err) {
          this.logger.error(`[NATS] Subscription error for ${subject}`, err);
        } else {
          try {
            const decodedData = this.sc.decode(msg.data);
            const payload: Payload<any> = decodedData as Payload<any>;
            const result = await handler(payload.data);
            const response = this.sc.encode(result);
            msg.respond(response);
          } catch (error: any) {
            const errorObject: ErrorObject = {
              code: 'HANDLER_ERROR',
              message: `Error processing message for ${subject}`,
              details: error,
            };
            this.logger.error(errorObject.message, error);
            if (this.options.errorHandler) {
              this.options.errorHandler(errorObject, subject);
              const errorResponse = this.sc.encode(errorObject);
              msg.respond(errorResponse);
            } else {
              const errorResponse = this.sc.encode(errorObject);
              msg.respond(errorResponse);
            }
          }
        }
      },
    });
    if (this.options.streaming) {
      this.registerStreamHandler(subject, subscription);
    }
  }
  private async registerStreamHandler(subject: string, subscription: Subscription) {
    for await (const msg of subscription) {
      try {
        const decodedData = this.sc.decode(msg.data);
        const payload: Payload<any> = decodedData as Payload<any>;
        const handler = this.getHandler(msg.subject) ?? this.findWildcardHandler(msg.subject);
        if (handler) {
          await handler(payload.data);
        } else {
          this.logger.warn(`[NATS] No handler found for subject ${msg.subject}`);
        }
      } catch (error) {
        this.logger.error(`[NATS] Error in stream processing of ${msg.subject}`, error);
      }
    }
  }
  getHandler(subject: string) {
    return this.handlers.get(subject);
  }
  findWildcardHandler(subject: string) {
    for (const [key, handler] of this.wildcardHandlers) {
      const regex = new RegExp(`^${key.replace(/\*/g, '[^.]*')}$`);
      if (regex.test(subject)) {
        return handler;
      }
    }
    return undefined;
  }
  getAllSubjects() {
    return Array.from(this.handlers.keys());
  }
  getExposedMethods(): T {
    return this.exposedMethods as T;
  }
  async callHandler<T>(subject: string, data: any): Promise<T> {
    if (!this.natsConnection) throw new Error('Nats connection is not established yet.');
    const payload: Payload<any> = {
      subject,
      data,
      context: this.options.context,
    };
    const response = await this.natsConnection!.request(subject, this.sc.encode(payload), {
      timeout: this.options.requestTimeout ?? 3000,
    });
    const decoded = this.sc.decode(response.data);
    return decoded as T;
  }
}

// src/nats-scanner.ts
import * as fs from 'fs/promises';
import * as path from 'path';
import { ClassInfo, MethodInfo } from './types';
export class NatsScanner {
  static async scanClasses(
    dir: string,
    excludeDir: string[] = ['node_modules', 'dist', 'build'],
  ): Promise<ClassInfo[]> {
    const classInfos: ClassInfo[] = [];
    try {
      const files = await fs.readdir(dir);
      for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = await fs.stat(filePath);
        if (stat.isDirectory()) {
          const isExcluded = excludeDir.some((excluded) => filePath.includes(excluded));
          if (isExcluded) {
            continue;
          }
          const nestedClasses = await this.scanClasses(filePath, excludeDir);
          classInfos.push(...nestedClasses);
          continue;
        }
        if (file.endsWith('.ts') || file.endsWith('.js')) {
          const absoluteFilePath = path.resolve(filePath); // <--- Make absolute path
          const module = await import(absoluteFilePath); // <---- Use absolute path for import
          for (const key in module) {
            if (typeof module[key] === 'function') {
              const target = module[key];
              const methods = this.getMethodInfo(target);
              classInfos.push({
                className: target.name,
                methods,
              });
            }
          }
        }
      }
    } catch (error) {
      console.error(`[NATS] Error scanning classes in ${dir}:`, error);
      throw error;
    }
    return classInfos;
  }
  static getMethodInfo(target: any): MethodInfo[] {
    const methods: MethodInfo[] = [];
    if (!target || !target.prototype) return methods;
    for (const key of Object.getOwnPropertyNames(target.prototype)) {
      if (key === 'constructor' || typeof target.prototype[key] !== 'function') continue;
      methods.push({ methodName: key, func: target.prototype[key] });
    }
    return methods;
  }
}

// src/types.ts
import { Logger } from 'pino';
export interface NatsOptions {
  natsUrl: string;
  subjectPattern?: (className: string, methodName: string) => string;
  errorHandler?: (error: any, subject: string) => void;
  scanPath?: string;
  requestTimeout?: number;
  retryConfig?: RetryConfig;
  dlqSubject?: string;
  streaming?: boolean;
  context?: Record<string, any>;
  codec?: Codec<any>;
  logger?: Logger;
}
export interface ClassInfo {
  className: string;
  methods: MethodInfo[];
}
export interface MethodInfo {
  methodName: string;
  func: Function;
}
export interface RetryConfig {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  factor?: number;
}
export interface Payload<T> {
  subject: string;
  data: T;
  context?: Record<string, any>;
}
export interface Codec<T> {
  encode(data: T): Uint8Array;
  decode(data: Uint8Array): T;
}
export interface ErrorObject {
  code: string;
  message: string;
  details?: any;
}

// src/utils.ts
export function generateNatsSubject(
  className: string,
  methodName: string,
  pattern: (className: string, methodName: string) => string,
): string {
  return pattern(className, methodName);
}

// test/main.example.ts
import { NatsClient, NatsOptions } from '../src';
interface MathRequest {
  a: number;
  b: number;
}
interface MathResponse {
  result: number;
}
interface ExposedMethods {
  MathService: {
    add: (data: MathRequest) => Promise<MathResponse>;
    subtract: (data: MathRequest) => Promise<MathResponse>;
  };
}
async function main() {
  const options: NatsOptions = {
    natsUrl: 'nats://localhost:4222',
    scanPath: './test/services',
    streaming: false,
    retryConfig: {
      maxRetries: 3,
      initialDelay: 100,
      maxDelay: 1000,
      factor: 2,
    },
    context: {
      serviceName: 'math-service',
    },
  };
  const client = new NatsClient<ExposedMethods>(); // Pass the type here
  await client.connect(options);
  const exposedMethods = client.getExposedMethods();
  console.log('Exposed method', exposedMethods);
  const addResult: MathResponse = await exposedMethods.MathService.add({ a: 5, b: 3 });
  console.log('Add result:', addResult);
  const subResult: MathResponse = await exposedMethods.MathService.subtract({ a: 5, b: 3 });
  console.log('Subtract result:', subResult);
  await client.publish('math.event', { message: 'calculate' });
  await client.disconnect();
}
main().catch((error) => console.error('Error running main:', error));

// test/services/math-service.ts
export class MathService {
  async add(data: { a: number; b: number }): Promise<{ result: number }> {
    console.log('Processing add request: ', data);
    return { result: data.a + data.b };
  }
  async subtract(data: { a: number; b: number }): Promise<{ result: number }> {
    console.log('Processing subtract request: ', data);
    return { result: data.a - data.b };
  }
}

// tsconfig.json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ESNext"],
    "declaration": true,
    "outDir": "build",
    "types": ["bun-types"],
    "sourceMap": true,
    "strict": true,
    "skipLibCheck": true,
    "noEmit": false,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true
  },
  "include": ["src*.ts", "src*.ts", "test/*.ts"],
  "exclude": ["node_modules"]
}

