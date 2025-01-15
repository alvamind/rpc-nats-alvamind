# 📦 rpc-nats-alvamind: Your Go-To RPC Library with NATS

**⚡️ Supercharge your microservices with seamless, reliable communication!**

## 🤔 What's the Deal?

`rpc-nats-alvamind` is a lightweight, flexible RPC (Remote Procedure Call) library built on top of the blazing-fast NATS messaging system. It's designed for building robust, scalable microservices with ease. Think of it as the glue that holds your distributed systems together! 🧩

## ✨ Key Features

*   **💨 NATS Power:** Built on top of NATS, leveraging its speed and reliability for high-performance messaging.
*   **🔌 Codec Flexibility:** Supports `json` and `string` codecs. Easily plug in your own!
*   **🎯 Type-Safe Proxies:** Generate client proxies with strong typing, reducing runtime errors.
    *   Choose between `ClassTypeProxy` or `as unknown as ClassName` casting for generated proxies.
*   **🛡️ Error Handling:** Handles errors gracefully with retry logic and dead-letter queue (DLQ) support.
*   **⏱️ Customizable Timeouts:** Set timeouts for requests to prevent hanging calls.
*   **🔄 Prototype Chain Support:** Works flawlessly with class inheritance, making your life easier.
*   **🪵 Logger Integration:** Includes built-in logging with `logger-alvamind` for easy debugging.
*   **🛠️ Easy Setup:** Simple to install and use, getting you up and running in minutes.
*   **✅ Fully Tested:** Comes with a comprehensive test suite for reliability.

## 🚀 Benefits

*   **⚡️ Speed & Efficiency:** NATS's performance gives you lightning-fast RPC calls.
*   **⚙️ Scalability:** Designed for microservices, making it easy to scale your apps.
*   **🧱 Modular Design:** The code is clean and well-organized, making it easy to maintain and extend.
*   **✅ Reliability:** Retry logic and DLQ ensure your requests are processed, even when things get bumpy.
*   **🧑‍💻 Developer-Friendly:** Easy-to-use API with TypeScript support.
*   **🥳 Code That's Fun:** Built with modern JS, you'll enjoy developing with this!

## 🛠️ Installation

```bash
bun add rpc-nats-alvamind
```

## 📖 Usage

### 1. Setting Up a Server

```typescript
import { RPCServer } from 'rpc-nats-alvamind';

// Define your service classes
class MyService {
  async hello(name: string): Promise<string> {
    return `Hello, ${name}!`;
  }
    async complexObject(data: any): Promise<any> {
        return data
    }
}

class AnotherService {
  async greet(message: string): Promise<string> {
    return `Server says: ${message}`;
  }
}

async function main() {
  const server = new RPCServer({ url: 'nats://localhost:4222', debug: true }); // Pass in your NATS options
  await server.start();

  // Register your service instances
  await server.handleRequest(new MyService());
  await server.handleRequest(new AnotherService());
    // or with retry
   await server.handleRequest(new MyService(),{ retry: { attempts: 3, delay: 100 } });
   await server.handleRequest(new AnotherService(), { dlq: 'my.dlq', retry: { attempts: 3, delay: 100 } });

  console.log('RPC Server is running!');
}

main();
```

### 2. Creating a Client Proxy

```typescript
import { RPCClient, ClassTypeProxy } from 'rpc-nats-alvamind';

// Define your service interfaces/classes, matching server side
class MyService {
  hello(name: string): Promise<string> {
    throw new Error('Method not implemented.');
  }
    complexObject(data: any): Promise<any> {
        throw new Error('Method not implemented.');
    }
}
class AnotherService {
  greet(message: string): Promise<string> {
      throw new Error('Method not implemented.');
    }
}
async function main() {
  const client = new RPCClient({ url: 'nats://localhost:4222', debug: true, timeout: 5000 }); // Pass in your NATS options
  await client.start();

  // Generate proxies
  const myServiceClient: ClassTypeProxy<MyService> = client.createProxy(MyService);
  const anotherServiceClient: ClassTypeProxy<AnotherService> = client.createProxy(AnotherService);

  // Use the generated proxies to make RPC calls
  const response1 = await myServiceClient.hello('World');
  console.log('Response 1:', response1); // Output: Hello, World!

  const response2 = await anotherServiceClient.greet('Howdy!');
  console.log('Response 2:', response2); // Output: Server says: Howdy!
  const data = { name: "Complex", data: { nested: [{ value: 1, isTrue: true, date: new Date(), bigint: BigInt(9007199254740991) }] } }
    const response3 = await myServiceClient.complexObject(data)
    console.log('Response 3:', response3);

  await client.close();
}

main();
```

### 3. Codec Usage

```typescript
import { RPCServer, RPCClient, ClassTypeProxy, getCodec } from 'rpc-nats-alvamind';

// Server Side
class MyService {
  async hello(name: string): Promise<string> {
    return `Hello, ${name}!`;
  }
}

async function mainServer() {
  const server = new RPCServer({ url: 'nats://localhost:4222', codec: "string" }); // using string codec
  await server.start();
  await server.handleRequest(new MyService());
}
mainServer();

// Client Side
class MyService {
    hello(name: string): Promise<string> {
        throw new Error('Method not implemented.');
    }
}
async function mainClient() {
  const client = new RPCClient({ url: 'nats://localhost:4222', codec: "string"}); // using string codec
  await client.start();
  const myServiceClient: ClassTypeProxy<MyService> = client.createProxy(MyService);
    const response1 = await myServiceClient.hello('World');
    console.log('Response 1:', response1); // Output: Hello, World!
  await client.close();
}
mainClient();
```

### 4. Custom Codec Usage

```typescript
import { RPCServer, RPCClient, ClassTypeProxy, NatsCodec } from 'rpc-nats-alvamind';

// Server Side
//Custom Codec
class MyCustomCodec implements NatsCodec<any>{
  encode(data: any): Uint8Array {
    return new TextEncoder().encode(JSON.stringify(data));
  }
  decode(data: Uint8Array): any {
    const value = new TextDecoder().decode(data)
    return JSON.parse(value);
  }
}

class MyService {
  async hello(name: string): Promise<string> {
    return `Hello, ${name}!`;
  }
}

async function mainServer() {
  const codec = new MyCustomCodec();
  const server = new RPCServer({ url: 'nats://localhost:4222', codec: codec });
  await server.start();
  await server.handleRequest(new MyService());
}
mainServer();

// Client Side
class MyService {
  hello(name: string): Promise<string> {
    throw new Error('Method not implemented.');
  }
}

async function mainClient() {
  const codec = new MyCustomCodec()
  const client = new RPCClient({ url: 'nats://localhost:4222', codec: codec});
  await client.start();
  const myServiceClient: ClassTypeProxy<MyService> = client.createProxy(MyService);
  const response1 = await myServiceClient.hello('World');
  console.log('Response 1:', response1);
  await client.close();
}
mainClient();
```

### 5. Error Handling

```typescript
import { RPCServer, RPCClient, ClassTypeProxy } from 'rpc-nats-alvamind';

// Define your service classes
class MyService {
  async error(): Promise<string> {
   throw new Error("this is test error");
  }
}

async function main() {
  const server = new RPCServer({ url: 'nats://localhost:4222', debug: true });
  await server.start();

  // Register your service instances
  await server.handleRequest(new MyService());
  console.log('RPC Server is running!');
  const client = new RPCClient({ url: 'nats://localhost:4222', debug: true, timeout: 5000 });
  await client.start();
  const myServiceClient: ClassTypeProxy<MyService> = client.createProxy(MyService);
  try{
    await myServiceClient.error();
  }catch(err){
    console.log("error", err) // catch the error
  }
  await server.close();
    await client.close();
}

main();
```

### 6. Retry with DLQ (Dead Letter Queue)

```typescript
import { RPCServer, RPCClient, ClassTypeProxy } from 'rpc-nats-alvamind';

interface DLQMessage {
  className: string;
  methodName: string;
  data: any;
  error: string;
  errorType: string
}

// Define your service classes
class MyService {
  async flakyCall(): Promise<string> {
   throw new Error("flaky error");
  }
}

async function main() {
  const dlqSubject = 'my.dlq'; // dlq subject
  let dlqMessage: DLQMessage | undefined;
  const server = new RPCServer({ url: 'nats://localhost:4222', debug: true, dlq: dlqSubject, retry: { attempts: 2, delay: 100 } }); // retry logic
  await server.start();

  const dlqPromise = new Promise<DLQMessage>((resolve) => {
    const nc = server['natsClient'].getNatsConnection();
    nc?.subscribe(dlqSubject, {
      callback: (err, msg) => {
        if (!err) {
          const decoded = server['natsClient'].getCodec().decode(msg.data);
          resolve(decoded);
        }
      }
    });
  });
  // Register your service instances
  await server.handleRequest(new MyService());
  console.log('RPC Server is running!');
  const client = new RPCClient({ url: 'nats://localhost:4222', debug: true, timeout: 5000 });
  await client.start();
  const myServiceClient: ClassTypeProxy<MyService> = client.createProxy(MyService);
  try{
   await myServiceClient.flakyCall();
  }catch(err){
   console.log("error", err) // catch the error
  }
  dlqMessage = await dlqPromise;
  console.log("DLQ Message", dlqMessage); // DLQ message
  await server.close();
    await client.close();
}

main();
```

### 7. Generating Client Proxies with `rpc-nats` CLI

The `rpc-nats-alvamind` package includes a CLI tool to automatically generate the `rpc-services.ts` file containing client proxies. This tool is particularly useful for large projects.

To generate RPC services, use the following command:

```bash
rpc-nats generate --includes="src/**/*.controller.ts" --output="src/common/rpc/rpc-services.ts"
```

**Options:**

*   `--includes`: Glob patterns for including files (required).
*   `--excludes`: Glob patterns for excluding files.
*   `--output`: Output file path.
*   `--watch`: Watch for file changes and regenerate.
*   `--logLevel`: Log level (debug, info, warn, error).
*   `--proxyType`: Type of proxy generation, `proxy` (default), generate proxies using `ClassTypeProxy` or `cast` to generate proxies with casting with `as unknown as ClassName`

**Examples:**

```bash
# Generate rpc-services.ts using ClassTypeProxy
rpc-nats generate --includes="src/**/*.controller.ts" --output="src/common/rpc/rpc-services.ts"

# Generate rpc-services.ts with casting
rpc-nats generate --includes="src/**/*.controller.ts" --output="src/common/rpc/rpc-services.ts" --proxyType=cast

# Multiple includes and excludes with watch mode
rpc-nats generate \
  --includes="src/**/*.controller.ts" "src/**/*.service.ts" \
  --excludes="src/**/*.spec.ts" "src/**/*.test.ts" \
  --output="src/common/rpc/rpc-services.ts" \
  --watch
```

###  🧪 Testing

To run the test suite:

```bash
bun test test/*.test.ts
```

## 📜 API Reference

### `RPCServer`

*   `constructor(options: RPCServerOptions)`: Creates a new RPC server instance.
*   `start(): Promise<void>`: Connects to the NATS server.
*   `close(): Promise<void>`: Closes the NATS connection.
*   `handleRequest<T extends ClassType>(instance: T, retryConfig?: { retry?: {attempts: number, delay: number }, dlq?: string}): Promise<void>`: Registers an instance to handle requests.
*    `isConnected(): boolean`: Checks whether nats client is connected
*   `getRegisteredMethods(): Map<string, Set<string>>`: get all registered methods.
*   `isMethodRegistered(className: string, methodName: string): boolean`: check if method is registered.

### `RPCClient`

*   `constructor(options: RPCClientOptions)`: Creates a new RPC client instance.
*   `start(): Promise<void>`: Connects to the NATS server.
*   `close(): Promise<void>`: Closes the NATS connection.
*   `createProxy<T extends ClassType>(classConstructor: new (...args: any[]) => T): ClassTypeProxy<T>`: Creates a proxy for a class.
*   `isConnected(): boolean`: Checks if the client is connected.
*   `getAvailableMethods(className: string): string[]`:  Gets available methods for class.
*    `isMethodAvailable(className: string, methodName: string): boolean`: check if method is available.
*   `setTimeout(timeout: number): void`: Sets request timeout.
*   `getTimeout(): number`: Gets the current timeout.
*   `clearMethodCache(className?: string): void`: Clears method cache.
*   `getStats(): { isConnected: boolean; cachedClasses: number; totalCachedMethods: number; timeout: number; }`: Gets client stats.

### `NatsOptions`

*   `url?: string`: NATS server URL (`nats://localhost:4222` by default).
*    `codec?: "json" | "string"`: Choose codec, default is `json`.
*   `debug?: boolean`: Enable debug logs.

### `RPCServerOptions`

*  `retry?: { attempts: number; delay: number; }`: Configure retries.
*  `dlq?: string`: Dead Letter Queue Subject.

### `ClassTypeProxy<T>`

*   A type for dynamic client proxy, that will expose method of class `T`.

### `getCodec`

*    `getCodec<T = unknown>(codec: SupportedCodec | NatsCodec<T> = "json"): NatsCodec<T>`: A function to get codec instance either json or string or instance of custom codec.

## ⚙️ Advanced Usage

### 🛠️ Custom Codecs

You can create your own codec by implementing the `NatsCodec` interface:

```typescript
import { NatsCodec } from 'rpc-nats-alvamind';

class MyCustomCodec<T> implements NatsCodec<T> {
  encode(data: T): Uint8Array {
    // Your custom encoding logic here
    return new TextEncoder().encode(JSON.stringify(data));
  }

  decode(data: Uint8Array): T {
     // Your custom decoding logic here
    const value = new TextDecoder().decode(data)
    return JSON.parse(value);
  }
}
```

Then you can pass the codec instance to `RPCServer` and `RPCClient` options like:

```typescript
  const codec = new MyCustomCodec<any>();
  const server = new RPCServer({ url: 'nats://localhost:4222', codec: codec });
  const client = new RPCClient({ url: 'nats://localhost:4222', codec: codec });
```

### 🪵 Logging

This library use `logger-alvamind` to provide logging functionality, to see `debug` logs pass `{debug: true}` to constructor options of `RPCServer` and `RPCClient` or set `process.env.DEBUG` or set `NODE_ENV=test`.

## 🤝 Contributing

Contributions are welcome! Feel free to submit pull requests or open issues on the [GitHub repository](https://github.com/alvamind/rpc-nats-alvamind).

### Contribution Guidelines

1.  Fork the repository.
2.  Create a new branch.
3.  Make your changes and ensure that tests pass
4.  Submit a pull request.

## 🙏 Donations

If you find this library helpful, consider making a donation to support further development:

*   **PayPal:** [your-paypal-link](your-paypal-link.com)
*   **GitHub Sponsors:** [your-github-sponsors-link](your-github-sponsors-link)

## ⚠️ Disclaimer

This library is provided "as is" without any warranties. Use at your own risk!

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](https://github.com/alvamind/rpc-nats-alvamind/blob/main/LICENSE) file for details.

### Thank you and Happy Coding! 🚀🎉
