import { NatsOptions } from '../../types';
import { ClassType, ClassTypeProxy } from '../../types/index';
import { LogLevel } from '../utils/logger';
export type RPCClientOptions = NatsOptions & {
  timeout?: number;
  logLevel?: LogLevel
};
export interface IRPCClient {
  start(): Promise<void>;
  close(): Promise<void>;
  createProxy<T extends ClassType>(classConstructor: { new(...args: any[]): T }): ClassTypeProxy<T>;
}
