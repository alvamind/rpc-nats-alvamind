import { NatsClient } from '../nats/nats-client';
import { defaultNatsOptions, TransformToPromise } from '../../types';
import { Logger } from '../utils/logger';
import { IRPCClient, RPCClientOptions } from './rpc-client.interface';

export class RPCClient implements IRPCClient {
  private natsClient: NatsClient;
  private timeout: number;
  private isStarted: boolean = false;
  private methodCache: Map<string, Map<string, Function>> = new Map();
  constructor(options: RPCClientOptions = defaultNatsOptions) {
    this.natsClient = new NatsClient(options);
    this.timeout = options.timeout || 30000; // Default 30 second timeout
    Logger.setLogLevel(options?.logLevel ?? defaultNatsOptions.logLevel);
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

  createProxy<T extends object>(
    classConstructor: new (...args: any[]) => T
  ): TransformToPromise<T> {
    if (!this.isStarted) {
      throw new Error('RPC Client not started. Call start() first.');
    }
    const className = classConstructor.name;
    Logger.debug(`Creating proxy for class: ${className}`);
    if (!this.methodCache.has(className)) {
      this.methodCache.set(className, new Map());
    }

    const handler: ProxyHandler<TransformToPromise<T>> = {
      get: (_target: TransformToPromise<T>, p: string | symbol, _receiver: any) => {
        const methodName = p.toString();
        if (this.methodCache.get(className)?.has(methodName)) {
          return this.methodCache.get(className)?.get(methodName);
        }
        const methodProxy = async (...args: any[]): Promise<any> => {
          const subject = `${className}.${methodName}`;
          const input = args[0]; // Take first argument as input
          Logger.debug(`Client requesting to subject: ${subject}`, input);
          try {
            const response = await this.natsClient.request(subject, input !== undefined ? input : null, this.timeout) as Record<string, any> | null;
            Logger.debug(`Received response from ${subject}:`, response);
            if (response && typeof response === 'object' && response['__null'] === true) {
              return null;
            }
            if (response && typeof response === 'object' && 'error' in response) {
              const errorResponse = response as { error: string, errorType?: string }
              if (errorResponse.errorType) {
                const ErrorConstructor = globalThis[errorResponse.errorType as keyof typeof globalThis] as typeof Error
                if (ErrorConstructor) {
                  throw new ErrorConstructor(errorResponse.error);
                }
              }
              throw new Error(errorResponse.error);
            }
            return response;
          }
          catch (error) {
            Logger.error(`Error calling method "${methodName}" on class "${className}":`, error);
            throw error instanceof Error ? error : new Error(`RPC call failed: ${error}`);
          }
        };
        this.methodCache.get(className)?.set(methodName, methodProxy);
        return methodProxy;
      }
    }
    return new Proxy({} as TransformToPromise<T>, handler)
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
