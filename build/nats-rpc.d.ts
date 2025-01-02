import { NatsRpcOptions, RPCHandler } from './types';
export declare class NatsRpc {
    private nc?;
    private handlers;
    private isConnected;
    private options;
    constructor(options: NatsRpcOptions);
    private ensureConnection;
    connect(): Promise<void>;
    call<T, R>(subject: string, data: T): Promise<R>;
    register<T, R>(subject: string, handler: RPCHandler<T, R>): Promise<void>;
    registerController(token: any): Promise<void>;
    close(): void;
}
