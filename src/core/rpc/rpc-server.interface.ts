import { NatsOptions } from '../../types';
import { ClassType } from '../../types/index';
import { LogLevel } from '../utils/logger';

export type RPCServerOptions = NatsOptions & {
  retry?: {
    attempts: number;
    delay: number;
  };
  dlq?: string;
  logLevel?: LogLevel
};

export interface IRPCServer {
  start(): Promise<void>;
  close(): Promise<void>;
  handleRequest<T extends ClassType>(instance: T): Promise<void>;
  isConnected(): boolean;
}
