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
