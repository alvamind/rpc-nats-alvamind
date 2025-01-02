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
    "source": "generate-source output=source.md exclude=build/,README.md",
    "clean": "rm -rf .bun .turbo .eslintcache .parcel-cache node_modules .next .cache dist build coverage .eslintcache .parcel-cache .turbo .vite yarn.lock package-lock.json bun.lockb pnpm-lock.yaml .DS_Store && echo 'Done.'"
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
    "alvamind-tools": "^1.0.1",
    "nats": "^2.19.0",
    "reflect-metadata": "^0.2.2",
    "tsyringe-neo": "^5.1.0"
  },
  "devDependencies": {
    "@types/node": "^20.11.24",
    "bun-types": "^1.1.42",
    "typescript": "^5.3.3"
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
export * from './nats-rpc';
export * from './types';
export * from './dependency-resolvers'

// src/nats-rpc.ts
import { connect, NatsConnection } from 'nats';
import { DependencyResolver, MethodMetadata, NatsRpcOptions, RPCHandler } from './types';
import { getAllControllerMethods } from './nats-scanner';
export class NatsRpc {
  private nc?: NatsConnection;
  private handlers = new Map<string, RPCHandler<any, any>>();
  private isConnected = false;
  private options: NatsRpcOptions;
  constructor(options: NatsRpcOptions) {
    this.options = options;
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
    try {
      const encodedData = new TextEncoder().encode(JSON.stringify(data));
      const response = await this.nc!.request(subject, encodedData, {
        timeout: this.options.requestTimeout ?? 10000, // Increase timeout to 10 seconds or using default
      });
      const decodedData = new TextDecoder().decode(response.data);
      return JSON.parse(decodedData) as R;
    } catch (error) {
      console.error(`[NATS] Error calling ${subject}:`, error);
      throw error;
    }
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
  }
  close() {
    if (this.nc) {
      this.nc.close();
    }
  }
}

// src/nats-scanner.ts
import { MethodMetadata } from "./types";
import { getAllInterfaceMethods } from "./utils";
export function generateNatsSubject(className: string, methodName: string, pattern: (className: string, methodName: string) => string): string {
    return pattern(className,methodName)
}
export function getAllControllerMethods(instance: any,pattern:(className: string, methodName: string) => string): MethodMetadata[]{
  const methods = getAllInterfaceMethods(instance.constructor);
    return methods.map((method) => ({
        ...method,
        subject:generateNatsSubject(instance.constructor.name, method.key, pattern)
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
    requestTimeout?: number
}
export interface MethodMetadata {
  key: string;
  subject: string;
}
export interface RPCHandler<T, R> {
  (data: T): Promise<R>;
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

