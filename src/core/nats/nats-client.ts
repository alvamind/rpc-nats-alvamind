import {
  connect,
  NatsConnection,
  SubscriptionOptions,
  JetStreamClient,
  Subscription
} from "nats";
import { getCodec } from "../codec/codec";
import { INatsClient } from "./nats-client.interface";
import { defaultNatsOptions, NatsOptions } from "../../types";
import { Logger } from "../utils/logger";
import { NatsCodec } from "../codec/codec.interface";
export class NatsClient implements INatsClient {
  private nc: NatsConnection | null = null;
  private jsm: JetStreamClient | null = null;
  private codec: NatsCodec<any>;
  private options: NatsOptions;
  private subscriptions: Map<string, Subscription> = new Map();
  constructor(options: NatsOptions) {
    this.options = options;
    this.codec = getCodec(options?.codec);
    if (options?.debug) {
      Logger.setLogLevel("debug");
    }
  }
  async connect(): Promise<void> {
    try {
      this.nc = await connect({
        servers: [this.options?.url ?? defaultNatsOptions.url]
      });
      this.jsm = this.nc.jetstream();
      Logger.info("NATS connected");
    } catch (error) {
      Logger.error("Failed to connect to NATS", error);
      throw new Error("Failed to connect to NATS");
    }
  }
  async close(): Promise<void> {
    for (const subscription of this.subscriptions.values()) {
      subscription.unsubscribe();
    }
    this.subscriptions.clear();
    if (this.nc && !this.nc.isClosed()) {
      await this.nc.close();
      Logger.info("NATS connection closed");
    }
  }
  getJetstreamClient(): JetStreamClient | null {
    return this.jsm;
  }
  getNatsConnection(): NatsConnection | null {
    return this.nc;
  }
  getCodec<T = any>(): NatsCodec<T> {
    return this.codec;
  }
  async subscribe<T = unknown>(
    subject: string,
    cb: (data: T, reply: string) => void | Promise<void>,
    options?: SubscriptionOptions
  ): Promise<void> {
    if (!this.nc) {
      throw new Error("Nats client not initialized yet");
    }
    if (!this.subscriptions.has(subject)) {
      const subscription = this.nc.subscribe(subject, options);
      this.subscriptions.set(subject, subscription);
      (async () => {
        for await (const msg of subscription) {
          try {
            const decoded = msg.data?.length ? this.codec.decode(msg.data) as T : null as any; // Set to null if undefined
            Logger.debug(`Received message on subject ${subject}:`, decoded);
            await Promise.resolve(cb(decoded, msg.reply || ''));
          } catch (err) {
            Logger.error(`Error processing message on subject ${subject}:`, err);
          }
        }
      })().catch(err => {
        Logger.error(`Subscription error for ${subject}:`, err);
      });
    }
  }
  async publish<T = unknown>(subject: string, data: T, reply?: string): Promise<void> {
    if (!this.nc) {
      throw new Error("Nats client not initialized yet");
    }
    const encoded = data ? this.codec.encode(data) : undefined;
    this.nc.publish(subject, encoded, { reply });
    Logger.debug(`Published message on subject ${subject}:`, data);
  }
  async request<TRequest = unknown, TResponse = unknown>(
    subject: string,
    data: TRequest,
    timeout = 5000
  ): Promise<TResponse> {
    if (!this.nc) {
      throw new Error("Nats client not initialized yet");
    }
    try {
      Logger.debug(`Sending request to ${subject}:`, data);
      const encoded = data ? this.codec.encode(data) : undefined;
      const response = await this.nc.request(subject, encoded, { timeout });
      const decoded = this.codec.decode(response.data) as TResponse;
      Logger.debug(`Received response from ${subject}:`, decoded);
      return decoded;
    } catch (error) {
      Logger.error(`Request failed for ${subject}:`, error);
      throw error;
    }
  }
  async unsubscribe(subject: string): Promise<void> {
    const subscription = this.subscriptions.get(subject);
    if (subscription) {
      subscription.unsubscribe();
      this.subscriptions.delete(subject);
      Logger.debug(`Unsubscribed from ${subject}`);
    }
  }
  async drain(): Promise<void> {
    if (this.nc) {
      await this.nc.drain();
      Logger.info("NATS connection drained");
    }
  }
  isConnected(): boolean {
    return this.nc !== null && !this.nc.isClosed();
  }
  getServerInfo(): string | undefined {
    return this.nc?.getServer();
  }
  getSubscriptionCount(): number {
    return this.subscriptions.size;
  }
  getActiveSubjects(): string[] {
    return Array.from(this.subscriptions.keys());
  }
}
