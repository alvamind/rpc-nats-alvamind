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
