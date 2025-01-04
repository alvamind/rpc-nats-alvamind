import 'reflect-metadata';
export { NatsClient } from './nats-client';
export { NatsRegistry } from './nats-registry';
export { NatsScanner } from './nats-scanner';
export type { NatsOptions, ClassInfo, MethodInfo, Payload, RetryConfig, Codec, ErrorObject } from './types';
export { generateExposedMethodsType, generateTypeCli } from './generate-exposed-types';
