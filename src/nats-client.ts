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
