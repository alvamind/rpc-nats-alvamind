import { NatsClient } from '../nats/nats-client';
import { Logger } from '../utils/logger';
import { defaultNatsOptions, ClassType } from '../../types';
import { IRPCServer, RPCServerOptions } from './rpc-server.interface';

type MethodMapping = {
    [key: string]: ClassType;
};
export class RPCServer implements IRPCServer {
    private natsClient: NatsClient;
    private methodMapping: MethodMapping = {};
    private retryConfig: {
        attempts: number;
        delay: number;
    };
    private dlqSubject?: string;

  constructor(options: RPCServerOptions = defaultNatsOptions) {
    this.natsClient = new NatsClient(options);

    this.retryConfig = options.retry || { attempts: 3, delay: 1000 };
    this.dlqSubject = options.dlq;
  }

  async start(): Promise<void> {
    await this.natsClient.connect();
  }

  async close(): Promise<void> {
    await this.natsClient.close();
  }


    async handleRequest<T extends ClassType>(instance: T): Promise<void> {
        const className = instance.constructor.name
        this.methodMapping[className] = instance;

            for(const methodName in instance){
                const subject = `${className}.${methodName}`;
                this.natsClient.subscribe(subject, async (data: any, reply: string) => {
                    await this.processRequest(className, methodName, data, reply);
                  })
            }
    }

    private async processRequest(className:string, methodName: string, data: any, reply?:string) {

        const method = this.methodMapping[className][methodName];
      if (!method) {
        Logger.error(`Method "${methodName}" not found in class "${className}".`);
        return;
      }

        let attempts = 0;
        while (attempts <= this.retryConfig.attempts) {
          try {
            const result = await method(data);
            if(reply){
                await this.natsClient.publish(reply, result)
            }

             Logger.debug(`Method "${methodName}" in class "${className}" called successfully.`);
            return;
          } catch (error) {
            attempts++;
            Logger.error(`Error executing method "${methodName}" in class "${className}" (Attempt ${attempts}):`, error);
            if (attempts > this.retryConfig.attempts) {
                if (this.dlqSubject) {
                Logger.warn(`Sending failed request to DLQ: ${this.dlqSubject}`);
                  await this.natsClient.publish(this.dlqSubject, data);
                }else{
                    Logger.error("DLQ not specified, dropping message")
                }
              break;
            }
              await new Promise(resolve => setTimeout(resolve, this.retryConfig.delay));
          }
        }
      }
}