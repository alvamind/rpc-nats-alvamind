# Project: rpc-nats-alvamind

dist
scripts
src
test
test/services
====================
// package.json
{
  "name": "rpc-nats-alvamind",
  "version": "1.0.0",
  "description": "A flexible RPC library using NATS",
  "main": "dist/index.js",
  "module": "dist/index.mjs",
  "types": "dist/index.d.ts",
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
    "build": "tsc",
    "source": "generate-source output=source.md exclude=dist/,README.md,nats-rpc.test.ts,rpc-nats-alvamind-1.0.0.tgz,.gitignore",
    "clean": "rimraf dist",
    "prebuild": "npm run clean",
    "build:tgz": "bun run build && bun pm pack",
    "test": "bun test test/*.test.ts",
    "postinstall": "node ./scripts/postinstall.js"
  },
  "bin": {
    "rpc-nats-alvamind": "./dist/scripts/generate-type-cli.js"
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
    "README.md"
  ],
  "author": "Alvamind",
  "license": "MIT",
  "dependencies": {
    "alvamind-tools": "^1.0.2",
    "nats": "^2.28.2",
    "pino": "^8.21.0",
    "reflect-metadata": "^0.2.2",
    "chalk": "^4.1.2"
  },
  "devDependencies": {
    "@types/node": "^20.17.11",
    "bun-types": "^1.1.42",
    "rimraf": "^5.0.0",
    "typescript": "^5.7.2"
  }
}

// scripts/generate-type-cli.ts
#!/usr/bin/env bun
import 'reflect-metadata';
import { generateTypeCli } from '../src/generate-exposed-types';
const args = process.argv.slice(2);
const scanPath = args[1];
const outputPath = args[2];
if (args[0] !== 'generate') {
  console.error('Invalid command, usage: rpc-nats-alvamind generate <scanPath> <outputPath>')
  process.exit(1)
}
if (!scanPath) {
  console.error('scanPath is required')
  process.exit(1)
}
generateTypeCli(scanPath, outputPath).then(() => {
  console.log('Type generate successfully')
}).catch((error: any) => {
  console.error(error)
});

// scripts/postinstall.js
#!/usr/bin/env node
const chalk = require('chalk');
console.log(chalk.green('🎉 rpc-nats-alvamind installed!'));
console.log(chalk.yellow('To generate types for your services:'));
console.log(chalk.cyan('  1. Navigate to your project directory.'));
console.log(chalk.cyan('  2. Run: ') + chalk.bold('rpc-nats-alvamind generate <scanPath> <outputPath>'));
console.log(
  chalk.yellow('  Example: ') +
    chalk.bold('rpc-nats-alvamind generate ./src/services ./src/generated/exposed-methods.d.ts'),
);
console.log(chalk.yellow('Remember to replace the example scan path and output path with your own.'));

// src/generate-exposed-types.ts
import * as ts from "typescript";
import * as fs from "fs/promises";
import * as path from "path";
import { Logger, pino } from "pino";
interface TypeInformation {
  imports: Set<string>;
  methodParams: Map<string, Map<string, { type: string; name: string; optional: boolean }[]>>;
  methodReturns: Map<string, Map<string, string>>;
  localInterfaces: Set<string>;
}
interface MethodInfo {
  methodName: string;
}
interface ClassInfo {
  className: string;
  methods: MethodInfo[];
}
export async function generateExposedMethodsType(options: { scanPath: string }, outputPath: string = "src/generated/exposed-methods.d.ts", logger: Logger = pino({ level: "debug" })) {
  logger.info(`[NATS] generator version 22`);
  if (!options.scanPath) {
    logger.error(`[NATS] scanPath is required`);
    return;
  }
  try {
    const typeInfo = await extractTypeInformation(options.scanPath, outputPath, logger);
    const classInfos = await scanClasses(options.scanPath, logger);
    const interfaceString = generateInterfaceString(classInfos, typeInfo);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, interfaceString, "utf-8");
    logger.info(`[NATS] Exposed method type generated successfully to ${outputPath}`);
  } catch (error) {
    logger.error(`[NATS] Error generating exposed methods types`, error);
    console.error(error);
  }
}
async function scanClasses(scanPath: string, logger: Logger): Promise<ClassInfo[]> {
  logger.debug(`[NATS] Scanning classes in ${scanPath}`);
  const scanPathDir = path.resolve(scanPath);
  const files = await fs.readdir(scanPathDir);
  const tsFiles = files.filter((file) => file.endsWith(".ts")).map((file) => path.join(scanPathDir, file));
  logger.debug(`[NATS] Found ${tsFiles.length} Typescript files in ${scanPath}`);
  const program = ts.createProgram(tsFiles, {});
  const classInfos: ClassInfo[] = [];
  for (const sourceFile of program.getSourceFiles()) {
    if (!tsFiles.includes(sourceFile.fileName)) continue;
    logger.debug(`[NATS] Processing file: ${sourceFile.fileName}`);
    ts.forEachChild(sourceFile, (node) => {
      if (ts.isClassDeclaration(node) && node.name) {
        const className = node.name.text;
        logger.debug(`[NATS] Found class: ${className}`);
        const methods: MethodInfo[] = [];
        node.members.forEach((member) => {
          if (ts.isMethodDeclaration(member) && member.name) {
            const methodName = ts.isIdentifier(member.name) ? member.name.text : member.name.getText();
            logger.debug(`[NATS] Found method: ${methodName} in class ${className}`);
            methods.push({ methodName });
          }
        });
        classInfos.push({ className, methods });
      }
    });
  }
  logger.debug(`[NATS] Finished scanning classes. Total class: ${classInfos.length}`);
  return classInfos;
}
async function extractTypeInformation(scanPath: string, outputPath: string, logger: Logger): Promise<TypeInformation> {
  logger.debug(`[NATS] Extracting type information in: ${scanPath}`);
  const scanPathDir = path.resolve(scanPath);
  const files = await fs.readdir(scanPathDir);
  const tsFiles = files.filter((file) => file.endsWith(".ts")).map((file) => path.join(scanPathDir, file));
  const program = ts.createProgram(tsFiles, {});
  const checker = program.getTypeChecker();
  const typeInfo: TypeInformation = {
    imports: new Set<string>(),
    methodParams: new Map(),
    methodReturns: new Map(),
    localInterfaces: new Set<string>(),
  };
  for (const sourceFile of program.getSourceFiles()) {
    if (!tsFiles.includes(sourceFile.fileName)) continue;
    logger.debug(`[NATS] Processing file: ${sourceFile.fileName}`);
    ts.forEachChild(sourceFile, (node) => {
      if (ts.isClassDeclaration(node) && node.name) {
        const className = node.name.text;
        logger.debug(`[NATS] Extracting method info from class: ${className}`);
        const methodParams = new Map<string, { type: string; name: string; optional: boolean }[]>();
        const methodReturns = new Map<string, string>();
        node.members.forEach((member) => {
          if (ts.isMethodDeclaration(member) && member.name) {
            const methodName = ts.isIdentifier(member.name) ? member.name.text : member.name.getText();
            logger.debug(`[NATS] Extracting type info for method: ${methodName} in class ${className}`);
            const params: { type: string; name: string; optional: boolean }[] = [];
            member.parameters.forEach(param => {
              if (param.type && param.name) {
                params.push({
                  type: param.type.getText(),
                  name: param.name.getText(),
                  optional: !!param.questionToken
                });
                collectImports(param.type, typeInfo.imports, logger, checker, outputPath, scanPath);
              }
            });
            methodParams.set(methodName, params);
            if (member.type) {
              const returnType = extractReturnType(member.type, checker);
              if (returnType) {
                methodReturns.set(methodName, returnType);
                logger.debug(`[NATS] Return type for method ${methodName} is: ${returnType}`);
                if (ts.isTypeReferenceNode(member.type)) {
                  if (member.type.typeArguments && member.type.typeArguments.length > 0) {
                    member.type.typeArguments.forEach(typeArg => {
                      collectImports(typeArg, typeInfo.imports, logger, checker, outputPath, scanPath);
                    });
                  }
                } else {
                  collectImports(member.type, typeInfo.imports, logger, checker, outputPath, scanPath);
                }
              }
            }
          }
        });
        typeInfo.methodParams.set(className, methodParams);
        typeInfo.methodReturns.set(className, methodReturns);
      }
    });
  }
  return typeInfo;
}
function collectImports(node: ts.Node, imports: Set<string>, logger: Logger, checker: ts.TypeChecker, outputPath: string, scanPath: string) {
  if (ts.isTypeReferenceNode(node)) {
    const symbol = node.typeName && ts.isIdentifier(node.typeName) ? node.typeName.text : undefined;
    if (symbol) {
      const typeName = symbol;
      logger.debug(`[NATS] Started collecting imports for type: ${typeName}`);
      if (node.typeArguments) {
        node.typeArguments.forEach(typeArg => {
          collectImports(typeArg, imports, logger, checker, outputPath, scanPath);
        });
      }
      if (node.typeName && ts.isIdentifier(node.typeName)) {
        const type = checker.getTypeAtLocation(node.typeName);
        if (type && type.symbol) {
          const declarations = type.symbol.getDeclarations();
          if (declarations && declarations.length > 0) {
            const declaration = declarations[0];
            const sourceFile = declaration.getSourceFile();
            if (sourceFile) {
              if (sourceFile.fileName.includes("node_modules/typescript/lib") ||
                ["Promise", "Partial", "Omit", "Pick", "Record", "Exclude", "Extract"].includes(typeName)) {
                logger.debug(`[NATS] Skipping built-in type ${typeName}`);
                return;
              }
              const modulePath = sourceFile.fileName;
              const relativePath = path.relative(path.dirname(outputPath), modulePath).replace(/\.ts$/, "");
              if (!Array.from(imports).some(imp => imp.includes(`{ ${typeName} }`))) {
                logger.debug(`[NATS] Adding import for type: ${typeName}`);
                imports.add(`import { ${typeName} } from '${relativePath}';`);
              }
            }
          }
        }
      }
    }
  }
  ts.forEachChild(node, child => collectImports(child, imports, logger, checker, outputPath, scanPath));
}
function extractReturnType(node: ts.TypeNode, checker: ts.TypeChecker): string | null {
  if (ts.isTypeReferenceNode(node) && node.typeName.getText() === "Promise" && node.typeArguments && node.typeArguments.length > 0) {
    const promiseType = node.typeArguments[0];
    return checker.typeToString(checker.getTypeAtLocation(promiseType));
  } else {
    return checker.typeToString(checker.getTypeAtLocation(node));
  }
}
function generateInterfaceString(classInfos: ClassInfo[], typeInfo: TypeInformation): string {
  let output = "// Auto-generated by rpc-nats-alvamind\n\n";
  if (typeInfo.imports.size > 0) {
    output += Array.from(typeInfo.imports).join("\n") + "\n\n";
  }
  output += "export interface ExposedMethods {\n";
  for (const classInfo of classInfos) {
    output += `  ${classInfo.className}: {\n`;
    const methodParams = typeInfo.methodParams.get(classInfo.className);
    const methodReturns = typeInfo.methodReturns.get(classInfo.className);
    for (const method of classInfo.methods) {
      const params = methodParams?.get(method.methodName) || [];
      const returnType = methodReturns?.get(method.methodName) || "any";
      const paramString = params.map((p) => `${p.name}${p.optional ? "?" : ""}: ${p.type}`).join(", ");
      output += `    ${method.methodName}(${paramString}): Promise<${returnType}>;\n`;
    }
    output += "  };\n";
  }
  output += "}\n";
  return output;
}
export async function generateTypeCli(scanPath: string, outputPath: string = "src/generated/exposed-methods.d.ts") {
  const logger = pino({ level: "debug" });
  await generateExposedMethodsType({ scanPath }, outputPath, logger);
}

// src/index.ts
import 'reflect-metadata';
export { NatsClient } from './nats-client';
export { NatsRegistry } from './nats-registry';
export { NatsScanner } from './nats-scanner';
export type { NatsOptions, ClassInfo, MethodInfo, Payload, RetryConfig, Codec, ErrorObject } from './types';
export { generateExposedMethodsType, generateTypeCli } from './generate-exposed-types';

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
import "reflect-metadata";
import { NatsConnection, Codec, JSONCodec } from "nats";
import { NatsOptions, ClassInfo, Payload, ErrorObject, MethodInfo } from "./types";
import { NatsScanner } from "./nats-scanner";
import { generateNatsSubject } from "./utils";
import { Logger } from "pino";
import { ImportDeclaration, SourceFile, SyntaxKind } from "typescript";
export class NatsRegistry<T extends Record<string, any> = Record<string, any>> {
  private handlers = new Map<string, Function>();
  private wildcardHandlers = new Map<string, Function>();
  private natsConnection?: NatsConnection;
  private options: NatsOptions;
  private exposedMethods: Partial<T> = {};
  private logger: Logger;
  private sc: Codec<any>;
  private classCount = 0;
  private methodCount = 0;
  private classInfos: ClassInfo[] = [];
  private typeAlias: Record<string, string> = {};
  constructor(natsConnection: NatsConnection | undefined, options: NatsOptions, logger: Logger) {
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
    this.classInfos = classes;
    for (const classInfo of classes) {
      this.classCount++;
      (this.exposedMethods as any)[classInfo.className] = {};
      const controller = (this.exposedMethods as any)[classInfo.className];
      for (const methodInfo of classInfo.methods) {
        this.methodCount++;
        const subject = generateNatsSubject(classInfo.className, methodInfo.methodName, this.options.subjectPattern ?? ((className: string, methodName: string) => `${className}.${methodName}`));
        if (this.natsConnection) {
          this.registerHandler(subject, methodInfo.func);
        }
        (controller as Record<string, any>)[methodInfo.methodName] = async <T>(data: any) => await this.callHandler<T>(subject, data);
      }
    }
    this.logger.info(`[NATS] Finished registering handlers in ${path}. Total class: ${this.classCount}  Total methods: ${this.methodCount}`);
  }
  getClassInfos() {
    return this.classInfos;
  }
  getTypeAlias() {
    return this.typeAlias;
  }
  protected async registerHandler(subject: string, handler: Function) {
    if (!this.natsConnection) {
      return;
    }
    if (this.handlers.has(subject)) {
      this.logger.warn(`[RPC-NATS-LIB] Handler already registered for subject: ${subject}`);
      return;
    }
    this.handlers.set(subject, handler);
    if (subject.includes("*")) {
      this.wildcardHandlers.set(subject, handler);
    }
    const subscription = this.natsConnection.subscribe(subject, {
      callback: async (err, msg) => {
        if (err) {
          this.logger.error(`[NATS] Subscription error for ${subject}`, err);
          return;
        }
        try {
          const decodedData = this.sc.decode(msg.data);
          const payload: Payload<any> = decodedData as Payload<any>;
          const result = await handler(payload.data);
          const response = this.sc.encode(result);
          msg.respond(response);
        } catch (error: any) {
          const errorObject: ErrorObject = {
            code: "HANDLER_ERROR",
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
      },
    });
    if (this.options.streaming) {
      this.registerStreamHandler(subject, subscription);
    }
  }
  protected async callHandler<T>(subject: string, data: any): Promise<T> {
    if (!this.natsConnection) throw new Error("Nats connection is not established yet.");
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
  protected async registerStreamHandler(subject: string, subscription: any) {
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
  protected getHandler(subject: string) {
    return this.handlers.get(subject);
  }
  protected findWildcardHandler(subject: string) {
    for (const [key, handler] of this.wildcardHandlers) {
      const regex = new RegExp(`^${key.replace(/\*/g, "[^.]*")}$`);
      if (regex.test(subject)) {
        return handler;
      }
    }
    return undefined;
  }
  public getExposedMethods(): T {
    return this.exposedMethods as T;
  }
}

// src/nats-scanner.ts
import * as fs from 'fs';
import * as path from 'path';
import { ClassInfo, MethodInfo } from './types';
import * as ts from 'typescript';
export class NatsScanner {
  static async scanClasses(
    dir: string,
    excludeDir: string[] = ['node_modules', 'dist', 'build'],
  ): Promise<ClassInfo[]> {
    const classInfos: ClassInfo[] = [];
    try {
      const files = await fs.promises.readdir(dir);
      for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = await fs.promises.stat(filePath);
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
  static getTypeScriptSourceFile(filePath: string): ts.SourceFile | undefined {
    try {
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      return ts.createSourceFile(filePath, fileContent, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    } catch (e) {
      return undefined;
    }
  }
}

// src/types.ts
import { Logger } from 'pino';
import { Codec as NatsCodec } from 'nats';
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
  codec?: NatsCodec<any>;
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
interface User {
  id: number;
  name: string;
  email: string;
}
interface Product {
  id: number;
  name: string;
  price: number;
}
interface MathRequest {
  a: number;
  b: number;
}
interface MathResponse {
  result: number;
}
interface ExposedMethods {
  MathService: {
    add: <T extends MathResponse>(data: MathRequest) => Promise<T>;
    subtract: <T extends MathResponse>(data: MathRequest) => Promise<T>;
    getUser: <T extends User>(id: number) => Promise<T>;
    getProduct: <T extends Product>(id: number) => Promise<T>;
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
  const userResult: User = await exposedMethods.MathService.getUser(1);
  console.log('User Result:', userResult);
  const productResult: Product = await exposedMethods.MathService.getProduct(1);
  console.log('Product Result:', productResult);
  await client.publish('math.event', { message: 'calculate' });
  await client.disconnect();
}
main().catch((error) => console.error('Error running main:', error));

// test/nats-rpc-speed.test.ts
import { describe, afterAll, it } from 'bun:test';
import { NatsClient, NatsOptions } from '../src';
import { connect, NatsConnection, JSONCodec, StringCodec } from 'nats';
interface MathRequest {
  a: number;
  b: number;
}
interface MathResponse {
  result: number;
}
interface Payload<T> {
  subject: string;
  data: T;
}
class MathService {
  add(data: MathRequest): MathResponse {
    return { result: data.a + data.b };
  }
  subtract(data: MathRequest): MathResponse {
    return { result: data.a - data.b };
  }
}
const mathService = new MathService();
const iterations = 1000;
const payload: MathRequest = { a: 10, b: 5 };
async function benchmark(name: string, fn: () => Promise<void>): Promise<{ name: string; time: number }> {
  const start = performance.now();
  await fn();
  const end = performance.now();
  const time = end - start;
  console.log(`Scenario "${name}" took: ${time.toFixed(2)}ms`);
  return { name, time };
}
describe('NATS RPC Performance', () => {
  let results: { name: string; time: number }[] = [];
  afterAll(() => {
    results.sort((a, b) => a.time - b.time);
    console.log('\n--- Benchmark Results ---');
    console.log('| Scenario                      | Time (ms) |');
    console.log('|-------------------------------|-----------|');
    results.forEach((result) => {
      const name = result.name.padEnd(30); // Pad name to a fixed width for alignment
      const time = result.time.toFixed(2).padEnd(9);
      console.log(`| ${name} | ${time} |`);
    });
  });
  it('should compare performance across different scenarios', async () => {
    results.push(
      await benchmark('Direct function call', async () => {
        for (let i = 0; i < iterations; i++) {
          mathService.add(payload);
        }
      }),
    );
    const natsOptionsJson: NatsOptions = {
      natsUrl: 'nats://localhost:4222',
      scanPath: './test/services',
    };
    const clientJson = new NatsClient();
    await clientJson.connect(natsOptionsJson);
    const exposedMethodsJson = clientJson.getExposedMethods() as any;
    results.push(
      await benchmark('NATS RPC JSON codec', async () => {
        for (let i = 0; i < iterations; i++) {
          await exposedMethodsJson.MathService.add(payload);
        }
      }),
    );
    await clientJson.disconnect();
    const natsOptionsString: NatsOptions = {
      natsUrl: 'nats://localhost:4222',
      scanPath: './test/services',
      codec: StringCodec(),
    };
    const clientString = new NatsClient();
    await clientString.connect(natsOptionsString);
    const exposedMethodsString = clientString.getExposedMethods() as any;
    results.push(
      await benchmark('NATS RPC String codec', async () => {
        for (let i = 0; i < iterations; i++) {
          await exposedMethodsString.MathService.add(payload);
        }
      }),
    );
    await clientString.disconnect();
    let ncJson: NatsConnection | undefined;
    results.push(
      await benchmark('NATS JSON no-lib', async () => {
        ncJson = await connect({ servers: 'nats://localhost:4222' });
        const jc = JSONCodec();
        const subject = 'MathService.add';
        for (let i = 0; i < iterations; i++) {
          const payloadToNats = jc.encode({ subject, data: payload });
          const response = await ncJson.request(subject, payloadToNats, { timeout: 3000 });
          const decoded = jc.decode(response.data) as any;
        }
        await ncJson.close();
      }),
    );
    ncJson = undefined;
    let ncString: NatsConnection | undefined;
    results.push(
      await benchmark('NATS String no-lib', async () => {
        ncString = await connect({ servers: 'nats://localhost:4222' });
        const sc = StringCodec();
        const subject = 'MathService.add';
        for (let i = 0; i < iterations; i++) {
          const payloadToNats = sc.encode(JSON.stringify({ subject, data: payload }));
          const response = await ncString.request(subject, payloadToNats, { timeout: 3000 });
          const decoded = JSON.parse(sc.decode(response.data)) as any;
        }
        await ncString.close();
      }),
    );
    ncString = undefined;
    const complexPayload = { a: 10, b: 5, c: { d: 1, e: [1, 2, 3], f: 'test' } };
    const natsOptionsComplex: NatsOptions = {
      natsUrl: 'nats://localhost:4222',
      scanPath: './test/services',
    };
    const clientComplex = new NatsClient();
    await clientComplex.connect(natsOptionsComplex);
    const exposedMethodsComplex = clientComplex.getExposedMethods() as any;
    results.push(
      await benchmark('NATS RPC JSON complex payload', async () => {
        for (let i = 0; i < iterations; i++) {
          await exposedMethodsComplex.MathService.add(complexPayload);
        }
      }),
    );
    await clientComplex.disconnect();
    const natsOptionsStringComplex: NatsOptions = {
      natsUrl: 'nats://localhost:4222',
      scanPath: './test/services',
      codec: StringCodec(),
    };
    const clientStringComplex = new NatsClient();
    await clientStringComplex.connect(natsOptionsStringComplex);
    const exposedMethodsStringComplex = clientStringComplex.getExposedMethods() as any;
    results.push(
      await benchmark('NATS RPC String complex payload', async () => {
        for (let i = 0; i < iterations; i++) {
          await exposedMethodsStringComplex.MathService.add(complexPayload);
        }
      }),
    );
    await clientStringComplex.disconnect();
    const natsOptionsNoScan: NatsOptions = {
      natsUrl: 'nats://localhost:4222',
    };
    const clientNoScan = new NatsClient();
    await clientNoScan.connect(natsOptionsNoScan);
    results.push(
      await benchmark('NATS RPC JSON no scan', async () => {
        for (let i = 0; i < iterations; i++) {
          await clientNoScan.request('MathService.add', payload);
        }
      }),
    );
    await clientNoScan.disconnect();
    const natsOptionsNoScanString: NatsOptions = {
      natsUrl: 'nats://localhost:4222',
      codec: StringCodec(),
    };
    const clientNoScanString = new NatsClient();
    await clientNoScanString.connect(natsOptionsNoScanString);
    results.push(
      await benchmark('NATS RPC String no scan', async () => {
        for (let i = 0; i < iterations; i++) {
          await clientNoScanString.request('MathService.add', payload);
        }
      }),
    );
    await clientNoScanString.disconnect();
    const natsOptionsMultiRequest: NatsOptions = {
      natsUrl: 'nats://localhost:4222',
      scanPath: './test/services',
    };
    const clientMultiRequest = new NatsClient();
    await clientMultiRequest.connect(natsOptionsMultiRequest);
    const exposedMethodsMultiRequest = clientMultiRequest.getExposedMethods() as any;
    results.push(
      await benchmark('NATS RPC JSON multiple request', async () => {
        for (let i = 0; i < iterations; i++) {
          await Promise.all([
            exposedMethodsMultiRequest.MathService.add(payload),
            exposedMethodsMultiRequest.MathService.add(payload),
            exposedMethodsMultiRequest.MathService.add(payload),
            exposedMethodsMultiRequest.MathService.add(payload),
          ]);
        }
      }),
    );
    await clientMultiRequest.disconnect();
    const natsOptionsMultiRequestString: NatsOptions = {
      natsUrl: 'nats://localhost:4222',
      scanPath: './test/services',
      codec: StringCodec(),
    };
    const clientMultiRequestString = new NatsClient();
    await clientMultiRequestString.connect(natsOptionsMultiRequestString);
    const exposedMethodsMultiRequestString = clientMultiRequestString.getExposedMethods() as any;
    results.push(
      await benchmark('NATS RPC String multiple request', async () => {
        for (let i = 0; i < iterations; i++) {
          await Promise.all([
            exposedMethodsMultiRequestString.MathService.add(payload),
            exposedMethodsMultiRequestString.MathService.add(payload),
            exposedMethodsMultiRequestString.MathService.add(payload),
            exposedMethodsMultiRequestString.MathService.add(payload),
          ]);
        }
      }),
    );
    await clientMultiRequestString.disconnect();
  });
});

// test/services/math-service.ts
interface User {
  id: number;
  name: string;
  email: string;
}
interface Product {
  id: number;
  name: string;
  price: number;
}
export class MathService {
  async add(data: { a: number; b: number }): Promise<{ result: number }> {
    console.log('Processing add request: ', data);
    return { result: data.a + data.b };
  }
  async subtract(data: { a: number; b: number }): Promise<{ result: number }> {
    console.log('Processing subtract request: ', data);
    return { result: data.a - data.b };
  }
  async getUser(id: number): Promise<User> {
    console.log('Processing get user request: ', id);
    return {
      id,
      name: 'John Doe',
      email: 'john.doe@example.com',
    };
  }
  async getProduct(id: number): Promise<Product> {
    console.log('Processing get product request: ', id);
    return {
      id,
      name: 'Laptop',
      price: 1200,
    };
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
    "lib": ["ESNext"],
    "types": ["bun-types"]
  },
  "include": ["src*.ts", "scripts*.ts"],
  "exclude": ["node_modules"]
}

