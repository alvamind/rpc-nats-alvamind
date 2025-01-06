import { connect, NatsConnection, SubscriptionOptions, JetStreamClient } from "nats";
import { getCodec, SupportedCodec } from "../codec/codec";
import { INatsClient } from "./nats-client.interface";
import { defaultNatsOptions, NatsOptions } from "../../types";
import { Logger } from "../utils/logger";
import { NatsCodec } from "../codec/codec.interface";

export class NatsClient implements INatsClient {
  private nc: NatsConnection | null = null;
  private jsm: JetStreamClient | null = null;
  private codec: NatsCodec<any>;
  private options: NatsOptions;

  constructor(options: NatsOptions) {
    this.options = options;
    this.codec = getCodec(options?.codec);
    if (options?.debug) {
      Logger.setLogLevel("debug")
    }
  }

  async connect(): Promise<void> {
    try {
      this.nc = await connect({
        servers: [this.options?.url ?? defaultNatsOptions.url]
      });
      this.jsm = this.nc.jetstream();
      Logger.info("NATS connected")
    } catch (error) {
      Logger.error("Failed to connect to NATS", error)
      throw new Error("Failed to connect to NATS")
    }
  }

  async close(): Promise<void> {
    if (this.nc && !this.nc.isClosed()) {
      await this.nc.close();
      Logger.info("NATS connection closed")
    }
  }

  getJetstreamClient(): JetStreamClient | null {
    return this.jsm;
  }

  getNatsConnection(): NatsConnection | null {
    return this.nc
  }

  getCodec<T = any>(): NatsCodec<T> {
    return this.codec;
  }

  async subscribe<T = unknown>(subject: string, cb: (data: T, reply: string) => void, options?: SubscriptionOptions): Promise<void> {
    if (!this.nc) {
      throw new Error("Nats client not initialized yet")
    }

    const subscription = this.nc.subscribe(subject, options)
    for await (const msg of subscription) {
      try {
        const decoded = this.codec.decode(msg.data) as T;
        cb(decoded, msg.reply || '')
        Logger.debug(`Received message on subject ${subject}:`, decoded)
      } catch (err) {
        Logger.error(`Error decoding message on subject ${subject}:`, err)
      }

    }
  }

  async publish<T = unknown>(subject: string, data: T, reply?: string): Promise<void> {
    if (!this.nc) {
      throw new Error("Nats client not initialized yet");
    }

    const encoded = this.codec.encode(data);
    this.nc.publish(subject, encoded, { reply });
    Logger.debug(`Published message on subject ${subject}:`, data)
  }

  async request<TRequest = unknown, TResponse = unknown>(subject: string, data: TRequest, timeout = 1000): Promise<TResponse> {
    if (!this.nc) {
      throw new Error("Nats client not initialized yet");
    }
    const encoded = this.codec.encode(data);
    const response = await this.nc.request(subject, encoded, { timeout });
    return this.codec.decode(response.data);
  }
}
