import { NatsOptions } from '../../types';
import { ClassType } from '../../types/index';

export type RPCServerOptions = NatsOptions & {
  retry?: {
    attempts: number;
    delay: number;
  };
  dlq?: string;
};

export interface IRPCServer {
  start(): Promise<void>;
  close(): Promise<void>;
  handleRequest<T extends ClassType>(instance: T): Promise<void>;
  isConnected(): boolean;
}
