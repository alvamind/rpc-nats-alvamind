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
