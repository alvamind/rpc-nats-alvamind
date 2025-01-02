import { NatsRpcOptions, RPCHandler, INatsRpc } from './types';
export declare class NatsRpc implements INatsRpc {
    private nc?;
    private handlers;
    private isConnected;
    private options;
    private controllerProxies;
    constructor(options: NatsRpcOptions);
    private ensureConnection;
    connect(): Promise<void>;
    call<T, R>(methodName: string, data: T): Promise<R>;
    register<T, R>(subject: string, handler: RPCHandler<T, R>): Promise<void>;
    registerController(token: any): Promise<void>;
    close(): void;
    getControllerProxy<T>(controllerName: string): T;
}
