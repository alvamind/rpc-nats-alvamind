# Project: rpc-nats-alvamind

src
src/dependency-resolvers
test
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
  "version": "1.0.6",
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
    "source": "generate-source output=source.md exclude=build/,README.md",
    "clean": "rm -rf .bun .turbo .eslintcache .parcel-cache node_modules .next .cache dist build coverage .eslintcache .parcel-cache .turbo .vite yarn.lock package-lock.json bun.lockb pnpm-lock.yaml .DS_Store && echo 'Done.'",
    "build": "bun build ./src/index.ts --outdir ./build --target node"
  },
  "keywords": [
    "rpc",
    "nats",
    "microservices",
    "typescript",
    "dependency-injection"
  ],
  "files": [
    "build"
  ],
  "author": "Alvamind",
  "license": "MIT",
  "dependencies": {
    "alvamind-tools": "^1.0.2",
    "nats": "^2.28.2",
    "reflect-metadata": "^0.2.2",
    "tsyringe-neo": "^5.1.0"
  },
  "devDependencies": {
    "@types/node": "^20.17.11",
    "bun-types": "^1.1.42",
    "typescript": "^5.7.2"
  }
}

// src/dependency-resolvers/index.ts
export * from './tsyringe-resolver';

// src/dependency-resolvers/tsyringe-resolver.ts
import { container } from 'tsyringe-neo';
import { DependencyResolver } from '../types';
export class TsyringeResolver implements DependencyResolver {
  resolve<T>(token: any): T {
    return container.resolve(token);
  }
  registeredTokens() {
    return container.registeredTokens();
  }
}

// src/index.ts
export { NatsRpc } from './nats-rpc';
export type { INatsRpc, DependencyResolver, NatsRpcOptions, MethodMetadata, RPCHandler } from './types';
export { createProxyController } from './nats-proxy';
export { TsyringeResolver } from './dependency-resolvers';

// src/nats-proxy.ts
import 'reflect-metadata';
import { NatsRpc } from './nats-rpc';
interface MethodMetadata {
  key: string;
  subject: string;
}
export function createProxyController<T>(controller: T, nats: NatsRpc): T {
  const handler = {
    get(target: any, prop: string, receiver: any) {
      if (typeof target[prop] === 'function') {
        return async (...args: any[]) => {
          const subjectPattern = nats.getOptions.subjectPattern;
          if (!subjectPattern) {
            throw new Error('Subject pattern is undefined');
          }
          const subject = subjectPattern(target.constructor.name, prop);
          return nats.call(subject, args[0]);
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  };
  return new Proxy(controller, handler) as T;
}

// src/nats-rpc.ts
import { connect, NatsConnection } from 'nats';
import { DependencyResolver, MethodMetadata, NatsRpcOptions, RPCHandler, INatsRpc } from './types';
import { generateNatsSubject, getAllControllerMethods } from './nats-scanner';
import { createProxyController } from './nats-proxy';
export class NatsRpc implements INatsRpc {
  private nc?: NatsConnection;
  private handlers = new Map<string, RPCHandler<any, any>>();
  private isConnected = false;
  private options: NatsRpcOptions;
  private controllerProxies = new Map<string, any>();
  constructor(options: NatsRpcOptions) {
    this.options = options;
  }
  get getOptions() {
    return this.options;
  }
  private async ensureConnection() {
    if (!this.isConnected) {
      await this.connect();
    }
  }
  async connect() {
    if (!this.isConnected) {
      this.nc = await connect({ servers: this.options.natsUrl });
      this.isConnected = true;
      console.log(`[NATS] Connected to ${this.options.natsUrl}`);
      this.nc.closed().then(() => {
        console.log('[NATS] Connection closed');
        this.isConnected = false;
      });
    }
  }
  async call<T, R>(subject: string, data: T): Promise<R> {
    await this.ensureConnection();
    const response = await this.nc!.request(subject, new TextEncoder().encode(JSON.stringify(data)));
    const decoded = new TextDecoder().decode(response.data);
    return JSON.parse(decoded) as R;
  }
  async register<T, R>(subject: string, handler: RPCHandler<T, R>) {
    await this.ensureConnection();
    if (this.handlers.has(subject)) {
      console.warn(`[NATS] Handler already registered for subject: ${subject}`);
      return;
    }
    this.handlers.set(subject, handler);
    const subscription = this.nc!.subscribe(subject);
    (async () => {
      for await (const msg of subscription) {
        try {
          const decodedData = new TextDecoder().decode(msg.data);
          const data = JSON.parse(decodedData);
          const result = await handler(data);
          const response = new TextEncoder().encode(JSON.stringify(result));
          msg.respond(response);
        } catch (error) {
          console.error(`[NATS] Error processing message for ${subject}:`, error);
          if (this.options.errorHandler) {
            this.options.errorHandler(error, subject);
            const errorResponse = new TextEncoder().encode(JSON.stringify({ error: (error as Error).message }));
            msg.respond(errorResponse);
          } else {
            const errorResponse = new TextEncoder().encode(JSON.stringify({ error: (error as Error).message }));
            msg.respond(errorResponse);
          }
        }
      }
    })().catch((err) => console.error(`[NATS] Subscription error:`, err));
  }
  async registerController(token: any) {
    const instance: Record<string, (...args: any[]) => any> = this.options.dependencyResolver.resolve(token);
    if (!instance) throw new Error(`Instance not found for token ${String(token)}`);
    const methods = getAllControllerMethods(
      instance,
      this.options.subjectPattern ?? ((className: string, methodName: string) => `${className}.${methodName}`),
    );
    for (const { key, subject } of methods) {
      try {
        await this.register(subject, async (data: any) => {
          return instance[key](data);
        });
      } catch (e) {
        console.error(`[NATS] Failed to register handler for ${subject} `, e);
      }
    }
    const proxy = createProxyController(instance, this);
    this.controllerProxies.set(instance.constructor.name, proxy);
  }
  close() {
    if (this.nc) {
      this.nc.close();
    }
  }
  public getControllerProxy<T>(controllerName: string): T {
    const controller = this.controllerProxies.get(controllerName);
    if (!controller) {
      throw new Error(`Controller ${controllerName} not found in registry`);
    }
    return controller;
  }
}

// src/nats-scanner.ts
import { MethodMetadata } from './types';
import { getAllInterfaceMethods } from './utils';
export function generateNatsSubject(
  className: string,
  methodName: string,
  pattern: (className: string, methodName: string) => string,
): string {
  return pattern(className, methodName);
}
export function getAllControllerMethods(
  instance: any,
  pattern: (className: string, methodName: string) => string,
): MethodMetadata[] {
  const methods = getAllInterfaceMethods(instance.constructor);
  return methods.map((method) => ({
    ...method,
    subject: generateNatsSubject(instance.constructor.name, method.key, pattern),
  }));
}

// src/types.ts
export interface DependencyResolver {
  resolve<T>(token: any): T;
  registeredTokens(): any[];
}
export interface NatsRpcOptions {
  dependencyResolver: DependencyResolver;
  subjectPattern?: (className: string, methodName: string) => string;
  errorHandler?: (error: any, subject: string) => void;
  natsUrl: string;
  requestTimeout?: number;
}
export interface MethodMetadata {
  key: string;
  subject: string;
}
export interface RPCHandler<T, R> {
  (data: T): Promise<R>;
}
export interface INatsRpc {
  connect(): Promise<void>;
  call<T, R>(methodName: string, data: T): Promise<R>;
  registerController(token: any): Promise<void>;
  getControllerProxy<T>(controllerName: string): T;
  close(): void;
}

// src/utils.ts
import 'reflect-metadata';
import { MethodMetadata } from './types';
export function getAllInterfaceMethods(target: any): MethodMetadata[] {
  const methods: MethodMetadata[] = [];
  if (!target || !target.prototype) return methods;
  for (const key of Object.getOwnPropertyNames(target.prototype)) {
    if (key === 'constructor' || typeof target.prototype[key] !== 'function') continue;
    methods.push({ key, subject: `${target.name}.${key}` });
  }
  return methods;
}

// test/nats-rpc.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { NatsRpc } from '../src/nats-rpc';
import { TsyringeResolver } from '../src/dependency-resolvers/tsyringe-resolver';
import { container } from 'tsyringe-neo';
import { connect, NatsConnection } from 'nats';
let natsRpc: NatsRpc;
let nc: NatsConnection;
describe('NatsRpc', () => {
  beforeAll(async () => {
    nc = await connect({ servers: 'nats://localhost:4222' });
    natsRpc = new NatsRpc({
      dependencyResolver: new TsyringeResolver(),
      natsUrl: 'nats://localhost:4222',
    });
    await natsRpc.connect();
  });
  afterAll(async () => {
    await natsRpc.close();
    await nc.close();
  });
  it('should connect to NATS server', async () => {
    expect(natsRpc).toBeDefined();
    expect(natsRpc['isConnected']).toBe(true);
  });
  it('should register and call an RPC handler', async () => {
    const subject = 'test.subject';
    const handler = async (data: { message: string }) => {
      return { reply: `Received: ${data.message}` };
    };
    await natsRpc.register(subject, handler);
    const response = await natsRpc.call<{ message: string }, { reply: string }>(subject, { message: 'Hello' });
    expect(response).toEqual({ reply: 'Received: Hello' });
  });
  it('should handle errors in RPC handler', async () => {
    const subject = 'test.error';
    const handler = async () => {
      throw new Error('Test error');
    };
    await natsRpc.register(subject, handler);
    try {
      await natsRpc.call(subject, {});
    } catch (error) {
      expect((error as Error).message).toBe('Test error');
    }
  });
  it('should register a controller and call its methods', async () => {
    class TestController {
      async hello(data: { name: string }) {
        return { message: `Hello, ${data.name}` };
      }
    }
    container.register('TestController', { useClass: TestController });
    await natsRpc.registerController('TestController');
    const response = await natsRpc.call<{ name: string }, { message: string }>('TestController.hello', {
      name: 'World',
    });
    expect(response).toEqual({ message: 'Hello, World' });
  });
  it('should register and call multiple RPC handlers', async () => {
    const subject1 = 'test.subject1';
    const subject2 = 'test.subject2';
    const handler1 = async (data: { message: string }) => {
      return { reply: `Handler1 received: ${data.message}` };
    };
    const handler2 = async (data: { message: string }) => {
      return { reply: `Handler2 received: ${data.message}` };
    };
    await natsRpc.register(subject1, handler1);
    await natsRpc.register(subject2, handler2);
    const response1 = await natsRpc.call<{ message: string }, { reply: string }>(subject1, { message: 'Hello1' });
    const response2 = await natsRpc.call<{ message: string }, { reply: string }>(subject2, { message: 'Hello2' });
    expect(response1).toEqual({ reply: 'Handler1 received: Hello1' });
    expect(response2).toEqual({ reply: 'Handler2 received: Hello2' });
  });
  it('should invoke error handler on error', async () => {
    const subject = 'test.errorHandler';
    const errorHandler = jest.fn();
    natsRpc = new NatsRpc({
      dependencyResolver: new TsyringeResolver(),
      natsUrl: 'nats://localhost:4222',
      errorHandler,
    });
    await natsRpc.connect();
    const handler = async () => {
      throw new Error('Test error with handler');
    };
    await natsRpc.register(subject, handler);
    try {
      await natsRpc.call(subject, {});
    } catch (error) {
      expect(errorHandler).toHaveBeenCalledWith(expect.any(Error), subject);
    }
  });
  it('should close the NATS connection', async () => {
    await natsRpc.close();
    expect(natsRpc['isConnected']).toBe(false);
  });
  it('should return registered tokens from TsyringeResolver', () => {
    class TestService {}
    container.register('TestService', { useClass: TestService });
    const resolver = new TsyringeResolver();
    const tokens = resolver.registeredTokens();
    expect(tokens).toContain('TestService');
  });
});

// tsconfig.json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ESNext"],
    "declaration": true,
    "outDir": "build",
    "types": ["bun-types", "@types/jest"],
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

