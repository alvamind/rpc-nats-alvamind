// rpc-nats-alvamind/src/core/rpc/rpc-server.ts
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

      // Always publish response, even if null
      await this.natsClient.publish(reply, result);
    } catch (error) {
      Logger.error(`Request to ${className}.${methodName} failed after all retries:`, error);

      if (this.dlqSubject) {
        const dlqMessage = {
          className,
          methodName,
          data,
          error: error instanceof Error ? error.message : String(error),
          errorType: error instanceof Error ? error.constructor.name : "Error"
        };

        await this.natsClient.publish(this.dlqSubject, dlqMessage);
        Logger.info(`Message sent to DLQ ${this.dlqSubject}`);
      }
      //  Error response must be an object
      await this.natsClient.publish(reply, {
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : "Error"
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
      // Explicitly handle null responses
      if (result === null) {
        return { __null: true };
      }
      return result;
    } catch (error) {
      Logger.error(`Error executing "${methodName}" in class "${className}":`, error);
      // Error response must be an object
      throw {
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : "Error"
      };
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
