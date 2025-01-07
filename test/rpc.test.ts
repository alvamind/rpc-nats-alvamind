import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { RPCServer, RPCClient, ClassTypeProxy } from "../src";

const natsUrl = "nats://localhost:4222";

class BaseClass {
  async baseMethod(input: { id: number }): Promise<{ id: number; timestamp: Date }> {
    return { id: input.id, timestamp: new Date() };
  }
}

class ChildClass extends BaseClass {
  async childMethod(input: { name: string }): Promise<{ name: string; message: string }> {
    return { name: input.name, message: "Hello from Child" };
  }
}

class ErrorClass {
  async errorMethod(): Promise<void> {
    throw new Error("Test error");
  }
}

class SlowClass {
  async slowMethod(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 200));
  }
}

class CounterClass {
  private counter = 0;
  async increment(): Promise<number> {
    this.counter++;
    return this.counter;
  }
}

describe("RPC with Prototype Chain", () => {
  let server: RPCServer;
  let client: RPCClient;
  let baseClient: ClassTypeProxy<BaseClass>;
  let childClient: ClassTypeProxy<ChildClass>;

  beforeAll(async () => {
    server = new RPCServer({ url: natsUrl, debug: true });
    await server.start();

    client = new RPCClient({ url: natsUrl, debug: true });
    await client.start();

    const baseInstance = new BaseClass();
    const childInstance = new ChildClass();
    const errorInstance = new ErrorClass();
    const slowInstance = new SlowClass();
    const counterInstance = new CounterClass();

    await server.handleRequest(baseInstance);
    await server.handleRequest(childInstance);
    await server.handleRequest(errorInstance);
    await server.handleRequest(slowInstance);
    await server.handleRequest(counterInstance);

    // Initialize proxies after client is started
    baseClient = client.createProxy(BaseClass);
    childClient = client.createProxy(ChildClass);

    await new Promise(resolve => setTimeout(resolve, 100));
  });

  afterAll(async () => {
    await client?.close();
    await server?.close();
  });

  it("should handle base class methods directly", async () => {
    const result = await baseClient.baseMethod({ id: 123 });
    expect(result).toBeDefined();
    expect(result.id).toBe(123);
    expect(result.timestamp).toBeInstanceOf(Date);
  });

  it("should handle inherited base methods from child class", async () => {
    const result = await childClient.baseMethod({ id: 456 });
    expect(result).toBeDefined();
    expect(result.id).toBe(456);
    expect(result.timestamp).toBeInstanceOf(Date);
  });

  it("should handle child class specific methods", async () => {
    const result = await childClient.childMethod({ name: "test" });
    expect(result).toBeDefined();
    expect(result.name).toBe("test");
    expect(result.message).toBe("Hello from Child");
  });

  it("should properly reflect method availability", () => {
    expect(typeof baseClient.baseMethod).toBe("function");
    expect(BaseClass.prototype.hasOwnProperty('childMethod')).toBe(false);
    expect(typeof childClient.baseMethod).toBe("function");
    expect(typeof childClient.childMethod).toBe("function");
  });

  it("should handle complex inheritance scenarios", async () => {
    const baseResult = await childClient.baseMethod({ id: 789 });
    const childResult = await childClient.childMethod({ name: "test2" });

    expect(baseResult.id).toBe(789);
    expect(childResult.name).toBe("test2");

    const [parallelBase, parallelChild] = await Promise.all([
      childClient.baseMethod({ id: 999 }),
      childClient.childMethod({ name: "parallel" })
    ]);

    expect(parallelBase.id).toBe(999);
    expect(parallelChild.name).toBe("parallel");
  });

  it("should handle timeouts properly", async () => {
    const timeoutClient = new RPCClient({
      url: natsUrl,
      debug: true,
      timeout: 300
    });
    await timeoutClient.start();
    const slowProxy = timeoutClient.createProxy(SlowClass);
    await expect(slowProxy.slowMethod()).rejects.toThrow();
    await timeoutClient.close();
  });

  it("should handle errors properly", async () => {
    const errorProxy = client.createProxy(ErrorClass);
    await expect(errorProxy.errorMethod()).rejects.toThrow("Test error");
  });

  it("should handle concurrent requests", async () => {
    const counterProxy = client.createProxy(CounterClass);
    const results = await Promise.all([
      counterProxy.increment(),
      counterProxy.increment(),
      counterProxy.increment()
    ]);
    expect(results).toEqual([1, 2, 3]);
  });

  it("should cleanup resources properly", async () => {
    const testServer = new RPCServer({ url: natsUrl, debug: true });
    await testServer.start();
    const testClient = new RPCClient({ url: natsUrl, debug: true });
    await testClient.start();

    expect(testServer.isConnected()).toBe(true);
    expect(testClient.isConnected()).toBe(true);

    await testServer.close();
    await testClient.close();

    expect(testServer.isConnected()).toBe(false);
    expect(testClient.isConnected()).toBe(false);
  });
});
