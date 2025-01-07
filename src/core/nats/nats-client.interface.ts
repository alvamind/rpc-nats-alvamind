// src/core/nats/nats-client.interface.ts
import { NatsConnection, JetStreamClient, SubscriptionOptions } from 'nats';
import { NatsCodec } from '../codec/codec.interface';

export interface INatsClient {
  connect(): Promise<void>;
  close(): Promise<void>;
  getJetstreamClient(): JetStreamClient | null;
  getNatsConnection(): NatsConnection | null;
  getCodec<T = any>(): NatsCodec<T>;
  subscribe<T = unknown>(
    subject: string,
    cb: (data: T, reply: string) => void | Promise<void>,
    options?: SubscriptionOptions
  ): Promise<void>;
  publish<T = unknown>(subject: string, data: T, reply?: string): Promise<void>;
  request<TRequest = unknown, TResponse = unknown>(
    subject: string,
    data: TRequest,
    timeout?: number
  ): Promise<TResponse>;
  unsubscribe(subject: string): Promise<void>;
  drain(): Promise<void>;
  isConnected(): boolean;
  getServerInfo(): string | undefined;
  getSubscriptionCount(): number;
  getActiveSubjects(): string[];
}
