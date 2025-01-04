# ⚡️ rpc-nats-alvamind ⚡️

**A Flexible RPC Library Using NATS with Automatic Type Generation**

[![npm version](https://badge.fury.io/js/rpc-nats-alvamind.svg)](https://badge.fury.io/js/rpc-nats-alvamind)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![code style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square)](https://github.com/prettier/prettier)

Tired of the endless cycle of defining types, writing code, and then debugging type mismatches in your microservices? `rpc-nats-alvamind` is here to revolutionize your workflow! This library seamlessly integrates with NATS to provide a robust, scalable RPC framework, while its built-in type generation tool ensures that your services are always in sync and your code remains type-safe. Say goodbye to manual type juggling and hello to streamlined development. ✨

## ✨ Key Features and Benefits

*   **RPC Made Easy:** Expose your TypeScript classes and methods as RPC endpoints with minimal configuration.
*   **NATS Integration:** Leverages the power and speed of NATS for message transport, ensuring low-latency communication between your services. 🚀
*   **Automatic Service Discovery:** The library scans your project directory, automatically discovering and registering all eligible services. 🔎
*   **TypeScript Native:** Built for TypeScript, providing compile-time type safety and a smoother developer experience. 💪
*   **Code-First Approach:** Start with your service code, and let the library generate the necessary types. No need to write interfaces manually! ✍️
*   **Flexible Codecs:** Supports various message codecs, with JSON codec as the default, and the option for custom codecs like StringCodec.
*   **Built-in Retry Logic:**  Automatically retries failed requests with configurable retry parameters, enhancing resilience and reliability. 🔄
*   **Dead Letter Queue (DLQ):** Handles failed requests by sending them to a designated DLQ, ensuring no messages are lost. 🪦
*   **Streaming Capabilities:** Facilitates asynchronous message processing, perfect for long-running operations or real-time data streams. 🌊
*   **Contextual Requests:** Allows you to pass request-specific context data, providing valuable information for logging and tracing. 🎭
*   **CLI Type Generation:** Uses  `method-types-ts-generator-alvamind` to automatically generate TypeScript types for your exposed methods, accessible via a simple CLI command. 🪄
*   **Simple API:** Provides a straightforward API to interact with NATS and your exposed methods. 💨
*   **Framework Agnostic:** Works seamlessly with any TypeScript project, regardless of the chosen framework.
*   **Open Source and Free:** Open source and available for use with no restrictions, contribution and feedback is always welcomed! 🎉

## 🚀 Getting Started: Generate First, Code Later

`rpc-nats-alvamind` encourages a **code-first** approach. You define your services, and the library automatically generates the necessary TypeScript types. Let's dive in.

### Installation

```bash
bun add rpc-nats-alvamind
```

or

```bash
npm install rpc-nats-alvamind
```

### Step 1: Define Your Services (Without Types)

Create your service classes with methods as you normally would, without worrying about defining complex interfaces.

```typescript
// src/services/math-service.ts

export class MathService {
    async add(data: { a: number; b: number }): Promise<{ result: number }> {
        console.log('Processing add request: ', data);
        return { result: data.a + data.b };
    }

    async subtract(data: { a: number; b: number }): Promise<{ result: number }> {
        console.log('Processing subtract request: ', data);
        return { result: data.a - data.b };
    }

   async multiply(data: { a: number; b: number }): Promise<{ result: number }> {
        console.log('Processing multiply request: ', data);
        return { result: data.a * data.b };
   }
}


// src/services/user-service.ts
interface User {
    id: number;
    name: string;
    email: string;
}
export class UserService {
  async getUser(id: number): Promise<User> {
    console.log('Processing get user request: ', id);
    return {
        id: id,
        name: 'John Doe',
        email: 'john.doe@example.com',
    };
  }

  async createUser(name: string, email:string): Promise<User>{
      console.log('Processing create user request: ', name, email);
      return { id: 1, name: name, email: email };
  }

  async updateUser(id:number, user: Partial<User>): Promise<User> {
      console.log('Processing update user request: ', id, user);
      return { ...user, id: id} as User
  }
}
```

### Step 2: Generate TypeScript Types

Use the CLI command to generate the `ExposedMethods` interface based on your services:

```bash
rpc-nats-alvamind generate ./src/services ./src/generated/exposed-methods.d.ts
```

This command scans the specified directory (`./src/services`), analyzes the exported classes, and creates a `exposed-methods.d.ts` file in the `./src/generated` directory. This file contains the `ExposedMethods` interface that can be used for type-safe interaction with your services.

The generated `exposed-methods.d.ts` will look like this:

```typescript
// Auto-generated by method-types-ts-generator-alvamind

export interface ExposedMethods {
    MathService: {
      add(data: { a: number; b: number }): Promise<{ result: number }>;
      subtract(data: { a: number; b: number }): Promise<{ result: number }>;
      multiply(data: { a: number; b: number }): Promise<{ result: number }>;
    };
    UserService: {
        getUser(id: number): Promise<User>;
        createUser(name: string, email: string): Promise<User>;
        updateUser(id: number, user: Partial<User>): Promise<User>;
    };
  }

```

### Step 3: Initialize the NATS Client

```typescript
import { NatsClient, NatsOptions } from 'rpc-nats-alvamind';
import { ExposedMethods } from './src/generated/exposed-methods';

const options: NatsOptions = {
  natsUrl: 'nats://localhost:4222',
  scanPath: './src/services', // Path to your services
};
const client = new NatsClient<ExposedMethods>();
await client.connect(options);

```

### Step 4: Call Your Services

Now you can interact with your services using the generated `ExposedMethods` interface:

```typescript
const exposedMethods = client.getExposedMethods();

// Call the math service methods
const addResult = await exposedMethods.MathService.add({ a: 5, b: 3 });
console.log('Add result:', addResult);

const subResult = await exposedMethods.MathService.subtract({ a: 5, b: 3 });
console.log('Subtract result:', subResult);

const multiplyResult = await exposedMethods.MathService.multiply({a: 5, b: 3})
console.log('Multiply result', multiplyResult)

// Call user service methods
const user = await exposedMethods.UserService.getUser(1);
console.log('User:', user);

const createdUser = await exposedMethods.UserService.createUser('Jane Doe', 'jane.doe@example.com')
console.log('Created User: ', createdUser)

const updatedUser = await exposedMethods.UserService.updateUser(1, { name: 'John Doe Updated'})
console.log('Updated User: ', updatedUser);
```

### Step 5: Enjoy Type Safety and Enhanced Productivity!

By generating types before writing your consuming code, you are ensure all of your service communication is type safe!

## ⚙️ How It Works Under The Hood

1.  **Class Scanning**: The `NatsScanner` recursively scans your designated service directories, discovering classes intended for RPC.
2.  **Method Extraction**: It extracts method signatures (name, parameters, return types) from the discovered classes.
3.  **Type Generation**: Using `method-types-ts-generator-alvamind`, the library generates a TypeScript interface (`ExposedMethods`) representing all exposed methods.
4.  **NATS Connection**: The `NatsClient` establishes a connection to the NATS server based on provided configurations.
5.  **Message Handling**: The `NatsRegistry` registers message handlers and subscribes to NATS subjects for each exposed method.
6.  **Request Processing**: When a request arrives, the appropriate handler is invoked, processing the request and sending a response through NATS.

## 🗺️ Roadmap

*   [x] **v1.0.0**: Initial release with core functionality and basic type generation.
*   [ ] **v1.1.0**: Support for filtering classes/methods with decorators, allowing more granular control over service exposure.
*   [ ] **v1.2.0**: Configurable naming patterns for generated interfaces, providing better consistency and customization options.
*   [ ] **v1.3.0**: Support for comments and jsDoc in generated types, improving the quality and maintainability of generated code.
*   [ ] **v1.4.0**: Watch mode, automatically regenerate types on file changes for faster development iterations.
*   [ ] **v1.5.0**: Improve streaming functionalities for efficient handling of asynchronous communication.
*   [ ] **v1.6.0**: Metrics and monitoring support for better performance observability and system health tracking.

## ⚠️ Disclaimer

This library is provided as-is, without any warranties. Use it at your own risk. While efforts have been made to ensure the stability and reliability of the library, no guarantees are provided that it will be suitable for every use case. Thorough testing in your specific environments is strongly recommended.

## 🤝 Open Contribution

We actively encourage and welcome contributions from the community! If you have ideas for improvements, bug reports, or feature requests, please submit them as issues. To contribute to the code, follow these steps:

1.  Fork the repository to your GitHub account.
2.  Create a new branch containing your changes.
3.  Submit a pull request with a clear explanation of the changes.
4.  Ensure that your code adheres to the code style of the project.

## 💖 Support & Donation

`rpc-nats-alvamind` is an open-source passion project that we have poured our time and energy into. If you find the library helpful, consider showing your support with a donation! Your support helps ensure ongoing maintenance, new feature development, and contributes back to the open-source community.

*   **GitHub Sponsors:** [Link to GitHub Sponsors](https://github.com/sponsors/alvamind)
*   **Buy us a coffee:** [Link to donation page](https://www.buymeacoffee.com/alvamind)

## 📧 Contact

If you have any questions or feedback, we'd love to hear from you. Please feel free to reach out using any of the following methods:

*   Email: [alvaminddigital@gmail.com](mailto:alvaminddigital@gmail.com)
*   GitHub: [Alvamind GitHub](https://github.com/alvamind)

Let's build amazing things together! 🚀
