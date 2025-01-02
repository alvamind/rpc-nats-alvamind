// Core
export { NatsRpc } from './nats-rpc';

// Types
export type { INatsRpc, DependencyResolver, NatsRpcOptions, MethodMetadata, RPCHandler } from './types';

// Utilities
export { createProxyController } from './nats-proxy';
export { TsyringeResolver } from './dependency-resolvers';
