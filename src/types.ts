import { Logger } from 'pino';
// types.ts
export interface NatsOptions {
  natsUrl: string;
  subjectPattern?: (className: string, methodName: string) => string;
  errorHandler?: (error: any, subject: string) => void;
  /**
   * Path to scan for exported classes
   * @default ./
   */
  scanPath?: string;
  /**
   * Max time to wait for response when sending a request to the server.
   * @default 3000
   */
  requestTimeout?: number;
  /**
   * Configuration for retry
   * @default
   * {
   *   maxRetries: 3,
   *  initialDelay: 100,
   *  maxDelay: 1000,
   *  factor: 2,
   * }
   */
  retryConfig?: RetryConfig;
  /**
   * Enable dead letter queue by specifying the subject.
   * @default undefined
   */
  dlqSubject?: string;
  /**
   * Set to true to enable streaming, default to false
   * @default false
   */
  streaming?: boolean;
  /**
   * Context to pass for every request to service.
   * @default {}
   */
  context?: Record<string, any>;
  /**
   * Custom codec to encode and decode messages
   * @default JSON.stringify and JSON.parse
   */
  codec?: Codec<any>;
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
