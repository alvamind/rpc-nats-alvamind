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

// README.md
# RPC-NATS library
[![NPM Version](https://img.shields.io/npm/v/your-rpc-nats-lib)](https://www.npmjs.com/package/your-rpc-nats-lib)
[![License](https://img.shields.io/npm/l/your-rpc-nats-lib)](https://github.com/your-username/your-rpc-nats-repo/blob/main/LICENSE)
A flexible and powerful RPC (Remote Procedure Call) library using NATS as a message broker, designed for microservices architectures and distributed systems. This library allows you to easily create and consume RPC services in your TypeScript applications.
## Key Features
- **Flexible Dependency Injection:** Supports any dependency injection container via a configurable `DependencyResolver` interface.
- **Automatic Controller & Method Registration:** Automatically registers all controller methods as NATS subjects, reducing boilerplate.
- **Customizable Subject Patterns:** Allows you to define custom patterns for NATS subject names.
- **Error Handling:** Provides a customizable error handler for NATS message processing.
- **Type-Safe:** Built with TypeScript to ensure type safety and provide a better development experience.
- **Easy to Use:** Simple and intuitive API for both setting up the library and making RPC calls.
- **Fully Documented:** Comprehensive documentation to guide you through the library's features and usage.
## Installation
```bash
npm install rpc-nats-alvamind
```
## Usage
### 1. Setup `NatsRpc` and `DependencyResolver`
First, you need to create an instance of `NatsRpc` with the appropriate configuration, including a `DependencyResolver`.
```typescript
import { NatsRpc, TsyringeResolver } from 'your-rpc-nats-lib';
import { container } from 'tsyringe'; // Or your preferred DI container
const natsRpc = new NatsRpc({
  dependencyResolver: new TsyringeResolver(), // Or implement your own resolver
  natsUrl: 'nats://localhost:4222', // Your NATS server URL
  subjectPattern: (className, methodName) => `${className}-${methodName}`, // Optional: Custom subject pattern
  errorHandler: (error, subject) => console.error(`Nats error ${subject}`, error), // Optional: Custom error handler
  requestTimeout: 10000, //Optional request timeout in milliseconds
});
container.register(NatsRpc, { useValue: natsRpc }); // Register NatsRpc as dependency
```
### 2. Register Your Controllers
Register your controllers with your DI container and register each one with NatsRpc:
```typescript
import { inject, injectable } from 'tsyringe';
import { NatsRpc } from 'your-rpc-nats-lib';
import {CategoryService} from "./category.service"
@injectable()
export class CategoryController {
   constructor(
        @inject(NatsRpc) private readonly natsRpc: NatsRpc,
        @inject(CategoryService) private readonly categoryService: CategoryService
        ){
       }
    async getCategoryById(id: number) {
        return await this.categoryService.findUnique({ where: { id } });
    }
}
import { injectable } from 'tsyringe';
@injectable()
export class CategoryService {
    constructor(){}
    async findUnique(args: any){
    }
}
```
Register your controller in your DI container and with NatsRpc:
```typescript
container.register('CategoryController', { useClass: CategoryController }); // register with DI
natsRpc.registerController('CategoryController')// register with Nats
```
### 3. Make RPC Calls
Now you can make RPC calls from other controllers using the `call` method:
```typescript
import { inject, injectable } from 'tsyringe';
import { NatsRpc } from 'your-rpc-nats-lib';
@injectable()
export class ProductController {
  constructor(@inject(NatsRpc) private readonly natsRpc: NatsRpc) {}
  async getProductWithCategory(id: number) {
    const category = await this.natsRpc.call<number,any>('CategoryController-getCategoryById', id);
  }
}
```
### 4. Implement Custom Dependency Resolver
If you are not using `tsyringe`, you can implement the `DependencyResolver` interface to integrate with your container:
```typescript
import { DependencyResolver } from 'your-rpc-nats-lib';
class MyResolver implements DependencyResolver {
  resolve<T>(token: any): T {
  }
  registeredTokens(): any[] {
  }
}
```
and configure using this implementation as:
```typescript
const natsRpc = new NatsRpc({
    dependencyResolver: new MyResolver(), // Using your custom implementation
    natsUrl: 'nats://localhost:4222',
});
```
## API Reference
### `NatsRpc` Class
#### Constructor
```typescript
constructor(options: NatsRpcOptions);
```
- `options`:
  - `dependencyResolver`: An instance of a class implementing the `DependencyResolver` interface.
  - `natsUrl`: The URL of your NATS server.
  - `subjectPattern`: *(Optional)* A function to define a custom subject pattern. It receives `className` and `methodName` and should return a string (subject). Default is `${className}.${methodName}`
    ```typescript
        (className: string, methodName: string) => string;
    ```
  - `errorHandler`: *(Optional)* A function to handle errors that occur when processing NATS messages. It receives the error and the subject and can handle errors differently based on the subject.
    ```typescript
     (error: any, subject: string) => void;
    ```
  -`requestTimeout` *(Optional)* The timeout in milliseconds for NATS request call. Default to 10000ms
#### `registerController` Method
```typescript
async registerController(token:any):Promise<void>;
```
Registers all methods from a controller as NATS subjects
- `token`: The token of the controller to be registered. The token is usually the controller name or class itself.
#### `call` Method
```typescript
async call<T, R>(subject: string, data: T): Promise<R>;
```
Makes an RPC call to a NATS subject
- `subject`: The NATS subject to call
- `data`: The data to send to the subject
### `DependencyResolver` Interface
```typescript
interface DependencyResolver {
    resolve<T>(token: any): T;
    registeredTokens(): any[];
  }
```
Used to interact with any Dependency Injection library.
- `resolve<T>(token: any): T` : Resolve the requested instance of token
- `registeredTokens()`: Returns a list of tokens that was registered
### `TsyringeResolver` Class
This class already implemented `DependencyResolver` interface and ready to be used with Tsyringe DI container.
```typescript
  class TsyringeResolver implements DependencyResolver
```
### `NatsRpcOptions` Interface
```typescript
interface NatsRpcOptions {
    dependencyResolver: DependencyResolver;
    subjectPattern?: (className: string, methodName: string) => string;
    errorHandler?: (error: any, subject: string) => void;
    natsUrl: string
    requestTimeout?: number
}
```
Used for configuration.
## Examples
You can find more examples in the [GitHub repository](https://github.com/alvamind/rpc-nats-alvamind).
## Contributing
Contributions are welcome! Please submit a pull request or open an issue for any bugs or feature requests.
## License
This library is licensed under the MIT License.
## Contact
[alvaminddigital@gmail.com]

// package.json
{
  "name": "rpc-nats-alvamind",
  "version": "1.0.1",
  "description": "A flexible RPC library using NATS",
  "main": "build/index.js",
  "module": "build/index.mjs",
  "types": "build/index.d.ts",
  "exports": {
    ".": {
      "types": "./build/index.d.ts",
      "require": "./build/index.js",
      "import": "./build/index.mjs"
    }
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/alvamind/rpc-nats-alvamind.git"
  },
  "scripts": {
    "dev": "bun run src/index.ts --watch",
    "compose": "docker compose up -d",
    "commit": "commit",
    "source": "generate-source output=source.md exclude=build/",
    "clean": "rm -rf .bun .turbo .eslintcache .parcel-cache node_modules .next .cache dist build coverage .eslintcache .parcel-cache .turbo .vite yarn.lock package-lock.json bun.lockb pnpm-lock.yaml .DS_Store && echo 'Done.'",
    "prepack": "npm run build",
    "build:types": "tsc --emitDeclarationOnly",
    "build:js": "bun build ./src/index.ts --outdir ./build --target node",
    "build": "npm run build:types && npm run build:js"
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
export { NatsRpc } from './nats-rpc';
export type { INatsRpc, DependencyResolver, NatsRpcOptions, MethodMetadata, RPCHandler } from './types';
export * from './dependency-resolvers';
export * from './nats-proxy';

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
          return nats.call(prop, args[0]);
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
  async call<T, R>(methodName: string, data: T): Promise<R> {
    return Promise.reject(new Error('Must call using controller proxy'));
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

// tsconfig.json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "declaration": true,
    "declarationDir": "build",
    "emitDeclarationOnly": true,
    "sourceMap": true,
    "strict": true,
    "esModuleInterop": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src*"],
  "exclude": ["node_modules", "build", "test"]
}

