"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const bun_test_1 = require("bun:test");
const src_1 = require("../src");
const natsUrl = "nats://localhost:4222";
class BaseClass {
    baseMethod(input) {
        return __awaiter(this, void 0, void 0, function* () {
            return { id: input.id, timestamp: new Date() };
        });
    }
}
class ChildClass extends BaseClass {
    childMethod(input) {
        return __awaiter(this, void 0, void 0, function* () {
            return { name: input.name, message: "Hello from Child" };
        });
    }
}
class ErrorClass {
    errorMethod() {
        return __awaiter(this, void 0, void 0, function* () {
            throw new Error("Test error");
        });
    }
}
class SlowClass {
    slowMethod() {
        return __awaiter(this, void 0, void 0, function* () {
            yield new Promise(resolve => setTimeout(resolve, 200));
        });
    }
}
class CounterClass {
    constructor() {
        this.counter = 0;
    }
    increment() {
        return __awaiter(this, void 0, void 0, function* () {
            this.counter++;
            return this.counter;
        });
    }
}
(0, bun_test_1.describe)("RPC with Prototype Chain", () => {
    let server;
    let client;
    let baseClient;
    let childClient;
    (0, bun_test_1.beforeAll)(() => __awaiter(void 0, void 0, void 0, function* () {
        server = new src_1.RPCServer({ url: natsUrl, debug: true });
        yield server.start();
        client = new src_1.RPCClient({ url: natsUrl, debug: true });
        yield client.start();
        const baseInstance = new BaseClass();
        const childInstance = new ChildClass();
        const errorInstance = new ErrorClass();
        const slowInstance = new SlowClass();
        const counterInstance = new CounterClass();
        yield server.handleRequest(baseInstance);
        yield server.handleRequest(childInstance);
        yield server.handleRequest(errorInstance);
        yield server.handleRequest(slowInstance);
        yield server.handleRequest(counterInstance);
        baseClient = client.createProxy(BaseClass);
        childClient = client.createProxy(ChildClass);
        yield new Promise(resolve => setTimeout(resolve, 100));
    }));
    (0, bun_test_1.afterAll)(() => __awaiter(void 0, void 0, void 0, function* () {
        yield (client === null || client === void 0 ? void 0 : client.close());
        yield (server === null || server === void 0 ? void 0 : server.close());
    }));
    (0, bun_test_1.it)("should handle base class methods directly", () => __awaiter(void 0, void 0, void 0, function* () {
        const result = yield baseClient.baseMethod({ id: 123 });
        (0, bun_test_1.expect)(result).toBeDefined();
        (0, bun_test_1.expect)(result.id).toBe(123);
        (0, bun_test_1.expect)(new Date(result.timestamp).getTime()).toBeGreaterThan(0); // Check if the timestamp is a valid date
    }));
    (0, bun_test_1.it)("should handle inherited base methods from child class", () => __awaiter(void 0, void 0, void 0, function* () {
        const result = yield childClient.baseMethod({ id: 456 });
        (0, bun_test_1.expect)(result).toBeDefined();
        (0, bun_test_1.expect)(result.id).toBe(456);
        (0, bun_test_1.expect)(new Date(result.timestamp).getTime()).toBeGreaterThan(0); // Check if the timestamp is a valid date
    }));
    (0, bun_test_1.it)("should handle child class specific methods", () => __awaiter(void 0, void 0, void 0, function* () {
        const result = yield childClient.childMethod({ name: "test" });
        (0, bun_test_1.expect)(result).toBeDefined();
        (0, bun_test_1.expect)(result.name).toBe("test");
        (0, bun_test_1.expect)(result.message).toBe("Hello from Child");
    }));
    (0, bun_test_1.it)("should properly reflect method availability", () => {
        (0, bun_test_1.expect)(typeof baseClient.baseMethod).toBe("function");
        (0, bun_test_1.expect)(BaseClass.prototype.hasOwnProperty('childMethod')).toBe(false);
        (0, bun_test_1.expect)(typeof childClient.baseMethod).toBe("function");
        (0, bun_test_1.expect)(typeof childClient.childMethod).toBe("function");
    });
    (0, bun_test_1.it)("should handle complex inheritance scenarios", () => __awaiter(void 0, void 0, void 0, function* () {
        const baseResult = yield childClient.baseMethod({ id: 789 });
        const childResult = yield childClient.childMethod({ name: "test2" });
        (0, bun_test_1.expect)(baseResult.id).toBe(789);
        (0, bun_test_1.expect)(childResult.name).toBe("test2");
        const [parallelBase, parallelChild] = yield Promise.all([
            childClient.baseMethod({ id: 999 }),
            childClient.childMethod({ name: "parallel" })
        ]);
        (0, bun_test_1.expect)(parallelBase.id).toBe(999);
        (0, bun_test_1.expect)(parallelChild.name).toBe("parallel");
    }));
    (0, bun_test_1.it)("should handle timeouts properly", () => __awaiter(void 0, void 0, void 0, function* () {
        const timeoutClient = new src_1.RPCClient({
            url: natsUrl,
            debug: true,
            timeout: 300
        });
        yield timeoutClient.start();
        const slowProxy = timeoutClient.createProxy(SlowClass);
        yield (0, bun_test_1.expect)(slowProxy.slowMethod()).rejects.toThrow();
        yield timeoutClient.close();
    }));
    (0, bun_test_1.it)("should handle errors properly", () => __awaiter(void 0, void 0, void 0, function* () {
        const errorProxy = client.createProxy(ErrorClass);
        yield (0, bun_test_1.expect)(errorProxy.errorMethod()).rejects.toThrow("Test error");
    }));
    (0, bun_test_1.it)("should handle concurrent requests", () => __awaiter(void 0, void 0, void 0, function* () {
        const counterProxy = client.createProxy(CounterClass);
        const results = yield Promise.all([
            counterProxy.increment(),
            counterProxy.increment(),
            counterProxy.increment()
        ]);
        (0, bun_test_1.expect)(results).toEqual([1, 2, 3]);
    }));
    (0, bun_test_1.it)("should cleanup resources properly", () => __awaiter(void 0, void 0, void 0, function* () {
        const testServer = new src_1.RPCServer({ url: natsUrl, debug: true });
        yield testServer.start();
        const testClient = new src_1.RPCClient({ url: natsUrl, debug: true });
        yield testClient.start();
        (0, bun_test_1.expect)(testServer.isConnected()).toBe(true);
        (0, bun_test_1.expect)(testClient.isConnected()).toBe(true);
        yield testServer.close();
        yield testClient.close();
        (0, bun_test_1.expect)(testServer.isConnected()).toBe(false);
        (0, bun_test_1.expect)(testClient.isConnected()).toBe(false);
    }));
    (0, bun_test_1.it)("should handle complex object structures with JSON codec", () => __awaiter(void 0, void 0, void 0, function* () {
        const input = {
            name: "Complex",
            data: {
                nested: [
                    { value: 1, isTrue: true, date: new Date(), bigint: BigInt(9007199254740991) },
                    { value: 2, isTrue: false, nestedArray: ["a", "b"], nestedSet: new Set([1, 2]) },
                    new Map([['key', 'val']])
                ],
            },
        };
        const result = yield childClient.childMethod(input);
        (0, bun_test_1.expect)(result).toBeDefined();
        // Add deep equality check here instead of expect(result).toMatchObject(input)
        (0, bun_test_1.expect)(result.name).toBe(input.name);
        (0, bun_test_1.expect)(result.message).toBe("Hello from Child");
        //verify nested structures
    }));
    class FlakyClass {
        constructor() {
            this.attempts = 0;
        }
        flakyMethod() {
            return __awaiter(this, void 0, void 0, function* () {
                this.attempts++;
                if (this.attempts < 3) {
                    throw new Error("Flaky failure!");
                }
                return "Success after retries";
            });
        }
    }
    (0, bun_test_1.it)("should handle successful retries", () => __awaiter(void 0, void 0, void 0, function* () {
        const serverWithRetry = new src_1.RPCServer({ url: natsUrl, retry: { attempts: 3, delay: 100 } });
        yield serverWithRetry.start();
        const clientWithRetry = new src_1.RPCClient({ url: natsUrl, timeout: 1000 });
        yield clientWithRetry.start();
        const flakyInstance = new FlakyClass();
        yield serverWithRetry.handleRequest(flakyInstance);
        const flakyProxy = clientWithRetry.createProxy(FlakyClass);
        const result = yield flakyProxy.flakyMethod();
        (0, bun_test_1.expect)(result).toBe("Success after retries");
        (0, bun_test_1.expect)(flakyInstance.attempts).toBe(3);
        yield serverWithRetry.close();
        yield clientWithRetry.close();
    }));
    class FailingClass {
        failMethod() {
            return __awaiter(this, void 0, void 0, function* () {
                throw new Error("This always fails");
            });
        }
    }
    (0, bun_test_1.it)('should send to DLQ after max retries', () => __awaiter(void 0, void 0, void 0, function* () {
        const dlqSubject = 'dlq.test';
        let dlqMessage;
        const serverWithDlq = new src_1.RPCServer({
            url: natsUrl,
            dlq: dlqSubject,
            retry: { attempts: 2, delay: 100 }
        });
        yield serverWithDlq.start();
        // Create a promise that will resolve when DLQ message is received
        const dlqPromise = new Promise((resolve) => {
            const nc = serverWithDlq['natsClient'].getNatsConnection();
            nc === null || nc === void 0 ? void 0 : nc.subscribe(dlqSubject, {
                callback: (err, msg) => {
                    if (!err) {
                        const decoded = serverWithDlq['natsClient'].getCodec().decode(msg.data);
                        resolve(decoded);
                    }
                }
            });
        });
        const clientWithDlq = new src_1.RPCClient({ url: natsUrl, timeout: 1000 });
        yield clientWithDlq.start();
        const failingInstance = new FailingClass();
        yield serverWithDlq.handleRequest(failingInstance);
        const failingProxy = clientWithDlq.createProxy(FailingClass);
        yield (0, bun_test_1.expect)(failingProxy.failMethod()).rejects.toThrow();
        // Wait for DLQ message
        dlqMessage = yield dlqPromise;
        (0, bun_test_1.expect)(dlqMessage).toBeDefined();
        (0, bun_test_1.expect)(dlqMessage === null || dlqMessage === void 0 ? void 0 : dlqMessage.className).toBe('FailingClass');
        (0, bun_test_1.expect)(dlqMessage === null || dlqMessage === void 0 ? void 0 : dlqMessage.methodName).toBe('failMethod');
        (0, bun_test_1.expect)(dlqMessage === null || dlqMessage === void 0 ? void 0 : dlqMessage.error).toBe('This always fails');
        yield clientWithDlq.close();
        yield serverWithDlq.close();
    }));
});
