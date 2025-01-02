export interface DependencyResolver {
    resolve<T>(token: any): T;
    registeredTokens(): any[];
}
export interface NatsRpcOptions {
    dependencyResolver: DependencyResolver;
    subjectPattern?: (className: string, methodName: string) => string;
    errorHandler?: (error: any, subject: string) => void;
    natsUrl: string;
    requestTimeout?: number;
}
export interface MethodMetadata {
    key: string;
    subject: string;
}
export interface RPCHandler<T, R> {
    (data: T): Promise<R>;
}
export interface INatsRpc {
    connect(): Promise<void>;
    call<T, R>(methodName: string, data: T): Promise<R>;
    registerController(token: any): Promise<void>;
    getControllerProxy<T>(controllerName: string): T;
    close(): void;
}
