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

  // src/core/rpc/rpc-server.ts
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
