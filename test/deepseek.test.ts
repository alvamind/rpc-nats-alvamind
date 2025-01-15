// import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
// import { RPCClient, RPCServer, NatsClient } from '../src';

// describe('RPC System', () => {
//   let rpcClient: RPCClient;
//   let rpcServer: RPCServer;
//   let natsClient: NatsClient;

//   beforeEach(async () => {
//     natsClient = new NatsClient({ url: 'nats://localhost:4222' });
//     rpcClient = new RPCClient({ url: 'nats://localhost:4222' });
//     rpcServer = new RPCServer({ url: 'nats://localhost:4222' });
//     await rpcClient.start();
//     await rpcServer.start();
//   });

//   afterEach(async () => {
//     await rpcClient.close();
//     await rpcServer.close();
//   });

//   it('should handle base class methods directly', async () => {
//     class BaseService {
//       async baseMethod(data: string) {
//         return `Processed ${data}`;
//       }
//     }
//     const service = new BaseService();
//     await rpcServer.handleRequest(service);
//     const proxy = rpcClient.createProxy(BaseService);
//     const result = await proxy.baseMethod('test');
//     expect(result).toBe('Processed test');
//   });

//   it('should handle inherited base methods from child class', async () => {
//     class BaseService {
//       async baseMethod(data: string) {
//         return `Base ${data}`;
//       }
//     }
//     class ChildService extends BaseService { }
//     const service = new ChildService();
//     await rpcServer.handleRequest(service);
//     const proxy = rpcClient.createProxy(ChildService);
//     const result = await proxy.baseMethod('test');
//     expect(result).toBe('Base test');
//   });

//   it('should handle child class specific methods', async () => {
//     class BaseService { }
//     class ChildService extends BaseService {
//       async childMethod(data: string) {
//         return `Child ${data}`;
//       }
//     }
//     const service = new ChildService();
//     await rpcServer.handleRequest(service);
//     const proxy = rpcClient.createProxy(ChildService);
//     const result = await proxy.childMethod('test');
//     expect(result).toBe('Child test');
//   });

//   it('should properly reflect method availability', async () => {
//     class TestService {
//       async availableMethod() { }
//     }
//     const service = new TestService();
//     await rpcServer.handleRequest(service);
//     const proxy = rpcClient.createProxy(TestService);
//     expect(rpcClient.isMethodAvailable('TestService', 'availableMethod')).toBeTrue();
//     expect(rpcClient.isMethodAvailable('TestService', 'nonExistentMethod')).toBeFalse();
//   });

//   it('should handle complex inheritance scenarios', async () => {
//     class GrandParentService {
//       async grandParentMethod() {
//         return 'GrandParent';
//       }
//     }
//     class ParentService extends GrandParentService {
//       async parentMethod() {
//         return 'Parent';
//       }
//     }
//     class ChildService extends ParentService {
//       async childMethod() {
//         return 'Child';
//       }
//     }
//     const service = new ChildService();
//     await rpcServer.handleRequest(service);
//     const proxy = rpcClient.createProxy(ChildService);
//     expect(await proxy.grandParentMethod()).toBe('GrandParent');
//     expect(await proxy.parentMethod()).toBe('Parent');
//     expect(await proxy.childMethod()).toBe('Child');
//   });

//   it('should handle timeouts properly', async () => {
//     class TimeoutService {
//       async delayedMethod() {
//         return new Promise(resolve => setTimeout(() => resolve('Done'), 2000));
//       }
//     }
//     const service = new TimeoutService();
//     await rpcServer.handleRequest(service);
//     const proxy = rpcClient.createProxy(TimeoutService);
//     rpcClient.setTimeout(1000);
//     await expect(proxy.delayedMethod()).rejects.toThrow('TimeoutError');
//   });

//   it('should handle errors properly', async () => {
//     class ErrorService {
//       async errorMethod() {
//         throw new Error('Test Error');
//       }
//     }
//     const service = new ErrorService();
//     await rpcServer.handleRequest(service);
//     const proxy = rpcClient.createProxy(ErrorService);
//     await expect(proxy.errorMethod()).rejects.toThrow('Test Error');
//   });

//   it('should handle concurrent requests', async () => {
//     class ConcurrentService {
//       async concurrentMethod(data: number) {
//         return data * 2;
//       }
//     }
//     const service = new ConcurrentService();
//     await rpcServer.handleRequest(service);
//     const proxy = rpcClient.createProxy(ConcurrentService);
//     const promises = Array.from({ length: 10 }, (_, i) => proxy.concurrentMethod(i));
//     const results = await Promise.all(promises);
//     expect(results).toEqual([0, 2, 4, 6, 8, 10, 12, 14, 16, 18]);
//   });

//   it('should cleanup resources properly', async () => {
//     class CleanupService {
//       async cleanupMethod() {
//         return 'Clean';
//       }
//     }
//     const service = new CleanupService();
//     await rpcServer.handleRequest(service);
//     const proxy = rpcClient.createProxy(CleanupService);
//     await proxy.cleanupMethod();
//     await rpcClient.close();
//     await rpcServer.close();
//     expect(rpcClient.isConnected()).toBeFalse();
//     expect(rpcServer.isConnected()).toBeFalse();
//   });

//   it('should handle complex object structures with JSON codec', async () => {
//     class ComplexService {
//       async complexMethod(data: any) {
//         return { received: data };
//       }
//     }
//     const service = new ComplexService();
//     await rpcServer.handleRequest(service);
//     const proxy = rpcClient.createProxy(ComplexService);
//     const complexData = { a: 1, b: { c: [2, 3, 4] }, d: new Date() };
//     const result = await proxy.complexMethod(complexData);
//     expect(result.received).toEqual(complexData);
//   });

//   it('should handle successful retries', async () => {
//     let attempt = 0;
//     class RetryService {
//       async retryMethod() {
//         attempt++;
//         if (attempt < 3) throw new Error('Failed');
//         return 'Success';
//       }
//     }
//     const service = new RetryService();
//     await rpcServer.handleRequest(service);
//     const proxy = rpcClient.createProxy(RetryService);
//     const result = await proxy.retryMethod();
//     expect(result).toBe('Success');
//     expect(attempt).toBe(3);
//   });

//   it('should send to DLQ after max retries', async () => {
//     class DLQService {
//       async dlqMethod() {
//         throw new Error('Permanent Failure');
//       }
//     }
//     const service = new DLQService();
//     const dlqSubject = 'DLQ';
//     const dlqServer = new RPCServer({ url: 'nats://localhost:4222', dlq: dlqSubject });
//     await dlqServer.start();
//     await rpcServer.handleRequest(service);
//     const proxy = rpcClient.createProxy(DLQService);
//     await expect(proxy.dlqMethod()).rejects.toThrow('Permanent Failure');
//     await dlqServer.close()
//   });

//   it('should handle null responses correctly', async () => {
//     class NullService {
//       async nullMethod() {
//         return null;
//       }
//     }
//     const service = new NullService();
//     await rpcServer.handleRequest(service);
//     const proxy = rpcClient.createProxy(NullService);
//     const result = await proxy.nullMethod();
//     expect(result).toBeNull();
//   });

//   it('should handle different types of errors correctly', async () => {
//     class ErrorService {
//       async typeErrorMethod() {
//         throw new TypeError('Type Error');
//       }
//       async rangeErrorMethod() {
//         throw new RangeError('Range Error');
//       }
//     }
//     const service = new ErrorService();
//     await rpcServer.handleRequest(service);
//     const proxy = rpcClient.createProxy(ErrorService);
//     await expect(proxy.typeErrorMethod()).rejects.toThrow('Type Error');
//     await expect(proxy.rangeErrorMethod()).rejects.toThrow('Range Error');
//   });

//   it('should not treat null responses as timeouts', async () => {
//     class NullResponseService {
//       async nullResponseMethod() {
//         return null;
//       }
//     }
//     const service = new NullResponseService();
//     await rpcServer.handleRequest(service);
//     const proxy = rpcClient.createProxy(NullResponseService);
//     const result = await proxy.nullResponseMethod();
//     expect(result).toBeNull();
//   });

//   it('should handle concurrent null and error responses', async () => {
//     class MixedResponseService {
//       async nullMethod() {
//         return null;
//       }
//       async errorMethod() {
//         throw new Error('Error');
//       }
//     }
//     const service = new MixedResponseService();
//     await rpcServer.handleRequest(service);
//     const proxy = rpcClient.createProxy(MixedResponseService);
//     const [nullResult, errorResult] = await Promise.allSettled([
//       proxy.nullMethod(),
//       proxy.errorMethod(),
//     ]);
//     expect(nullResult.status).toBe('fulfilled');
//     if (nullResult.status === 'fulfilled') {
//       expect(nullResult.value).toBeNull();
//     }
//     expect(errorResult.status).toBe('rejected');
//   });
//   it('should distinguish between timeouts and null responses', async () => {
//     class TimeoutNullService {
//       async timeoutMethod() {
//         return new Promise(resolve => setTimeout(() => resolve(null), 2000));
//       }
//       async nullMethod() {
//         return null;
//       }
//     }
//     const service = new TimeoutNullService();
//     await rpcServer.handleRequest(service);
//     const proxy = rpcClient.createProxy(TimeoutNullService);
//     rpcClient.setTimeout(1000);
//     const [timeoutResult, nullResult] = await Promise.allSettled([
//       proxy.timeoutMethod(),
//       proxy.nullMethod(),
//     ]);
//     expect(timeoutResult.status).toBe('rejected');
//     expect(nullResult.status).toBe('fulfilled');
//     if (nullResult.status === 'fulfilled') {
//       expect(nullResult.value).toBeNull();
//     }
//   });
// });
