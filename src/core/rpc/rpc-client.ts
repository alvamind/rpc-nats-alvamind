import { NatsClient } from '../nats/nats-client';
import { defaultNatsOptions, ClassType, ClassTypeProxy } from '../../types';
import { Logger } from '../utils/logger';
import { IRPCClient, RPCClientOptions } from './rpc-client.interface';

export class RPCClient implements IRPCClient {
  private natsClient: NatsClient;
  private timeout: number;

  constructor(options: RPCClientOptions = defaultNatsOptions) {
    this.natsClient = new NatsClient(options);
    this.timeout = options.timeout || 1000;
  }

  async start(): Promise<void> {
    await this.natsClient.connect();
  }

  async close(): Promise<void> {
    await this.natsClient.close();
  }
  createProxy<T extends ClassType>(classConstructor: { new (...args: any[]): T }): ClassTypeProxy<T> {
    const proxy: ClassTypeProxy<T> = {} as ClassTypeProxy<T>;
    const className = classConstructor.name;
    return new Proxy(proxy, {
        get: (target, methodName:string) => {
            return async (...args: any[]) => {
                const subject = `${className}.${methodName}`;
                 Logger.debug(`Calling method "${methodName}" on class "${className}"`);
                try {
                  return  await this.natsClient.request(subject, args[0], this.timeout)
                }catch(error){
                   Logger.error(`Error calling method "${methodName}" on class "${className}":`, error)
                   throw error
                }
              };
        },
    });
  }
}