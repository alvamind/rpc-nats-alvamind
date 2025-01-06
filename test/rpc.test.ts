import { describe, it, expect } from "bun:test";
import { RPCServer, RPCClient } from "../src";

// Define Base Class
class BaseClass {
  baseMethod(input: { id: number }): Promise<{ id: number, timestamp: Date }> {
    return Promise.resolve({ id: input.id, timestamp: new Date() });
  }
}

// Define Child Class inheriting from BaseClass
class ChildClass extends BaseClass {
  childMethod(input: { name: string }): Promise<{ name: string, message: string }> {
    return Promise.resolve({ name: input.name, message: "Hello from Child" });
  }
}

// Define another unrelated class
class AnotherClass {
  anotherMethod(input: { message: string }): Promise<{ result: string }> {
    return Promise.resolve({ result: input.message + " from Another" });
  }
}

describe("RPC with Prototype Chain", () => {
  it("should handle inherited methods with type safety", async () => {

    const rpcServer = new RPCServer();
    await rpcServer.start();

    // Create instances
    const baseInstance = new BaseClass();
    const childInstance = new ChildClass();
    const anotherInstance = new AnotherClass();

    // Setup the Server
    rpcServer.handleRequest(baseInstance);
    rpcServer.handleRequest(childInstance);
    rpcServer.handleRequest(anotherInstance);


    const rpcClient = new RPCClient()
    await rpcClient.start();

    // Create proxy client for all classes.
    const baseClient = rpcClient.createProxy(BaseClass)
    const childClient = rpcClient.createProxy(ChildClass);
    const anotherClient = rpcClient.createProxy(AnotherClass);


    // Testing baseMethod through baseInstance
    const baseResult = await baseClient.baseMethod({ id: 123 });
    expect(baseResult).toHaveProperty("id");
    expect(baseResult).toHaveProperty("timestamp");
    expect(typeof baseResult.id).toBe("number");
    expect(baseResult.id).toBe(123)

    // Testing baseMethod through childInstance (inherited method)
    const childBaseResult = await childClient.baseMethod({ id: 456 });
    expect(childBaseResult).toHaveProperty("id");
    expect(childBaseResult).toHaveProperty("timestamp");
    expect(typeof childBaseResult.id).toBe("number");
    expect(childBaseResult.id).toBe(456)

    // Testing childMethod from ChildClass
    const childMethodResult = await childClient.childMethod({ name: "test" });
    expect(childMethodResult).toHaveProperty("name");
    expect(childMethodResult).toHaveProperty("message");
    expect(typeof childMethodResult.name).toBe("string");
    expect(childMethodResult.name).toBe("test")
    expect(childMethodResult.message).toBe("Hello from Child");

    // Testing anotherMethod from AnotherClass
    const anotherResult = await anotherClient.anotherMethod({ message: "test message" });
    expect(anotherResult).toHaveProperty("result")
    expect(anotherResult.result).toBe("test message from Another")

  });


  it("should only accept existing property when using proxy", async () => {
    const rpcServer = new RPCServer();
    await rpcServer.start();

    // Create instances
    const childInstance = new ChildClass();
    // Setup the Server
    rpcServer.handleRequest(childInstance);

    const rpcClient = new RPCClient()
    await rpcClient.start();
    const childClient = rpcClient.createProxy(ChildClass);

    // Test with type casting to bypass TypeScript compile-time checks
    await (childClient as any).unknownMethod({}).catch((e: Error) => {
      expect(e).toBeInstanceOf(Error);
    })

    // Testing that proxy only accept known properties
    await childClient.baseMethod({ id: 123 });
  })

});
