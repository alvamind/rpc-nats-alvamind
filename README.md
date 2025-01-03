# rpc-nats-alvamind

[![NPM Version](https://img.shields.io/npm/v/rpc-nats-alvamind)](https://www.npmjs.com/package/rpc-nats-alvamind)
[![License](https://img.shields.io/npm/l/rpc-nats-alvamind)](https://github.com/alvamind/rpc-nats-alvamind/blob/main/LICENSE)

A flexible and powerful RPC (Remote Procedure Call) library using NATS as a message broker, designed for microservices architectures and distributed systems. This library allows you to easily create and consume RPC services in your TypeScript applications.

## Key Features

*   **Flexible Dependency Injection:** Supports any dependency injection container via a configurable `DependencyResolver` interface.
*   **Automatic Controller & Method Registration:** Automatically registers all controller methods as NATS subjects, reducing boilerplate.
*   **Customizable Subject Patterns:** Allows you to define custom patterns for NATS subject names.
*   **Error Handling:** Provides a customizable error handler for NATS message processing.
*   **Type-Safe:** Built with TypeScript to ensure type safety and provide a better development experience.
*   **Easy to Use:** Simple and intuitive API for both setting up the library and making RPC calls.
*   **Controller Proxy**: Creates a controller proxy to be used on other controllers to make RPC calls easy.

## Installation

```bash
npm install rpc-nats-alvamind
```

## Usage

### 1. Setup `NatsRpc` and `DependencyResolver`

First, you need to create an instance of `NatsRpc` with the appropriate configuration, including a `DependencyResolver`.

```typescript
import { NatsRpc, TsyringeResolver } from 'rpc-nats-alvamind';
import { container } from 'tsyringe-neo'; // Or your preferred DI container

const natsRpc = new NatsRpc({
  dependencyResolver: new TsyringeResolver(), // Or implement your own resolver
  natsUrl: 'nats://localhost:4222', // Your NATS server URL
  subjectPattern: (className, methodName) => `${className}-${methodName}`, // Optional: Custom subject pattern
  errorHandler: (error, subject) => console.error(`Nats error ${subject}`, error), // Optional: Custom error handler
  requestTimeout: 10000, //Optional request timeout in milliseconds
});


container.register(NatsRpc, { useValue: natsRpc }); // Register NatsRpc as dependency

```

### 2. Register Your Controllers

Register your controllers with your DI container and register each one with NatsRpc:

```typescript
// Controller Example
import { inject, injectable } from 'tsyringe-neo';
import { NatsRpc } from 'rpc-nats-alvamind';
import {CategoryService} from "./category.service"

@injectable()
export class CategoryController {
   constructor(
        @inject(NatsRpc) private readonly natsRpc: NatsRpc,
        @inject(CategoryService) private readonly categoryService: CategoryService
        ){
       }

    async getCategoryById(id: { id: number }) {
        return await this.categoryService.findUnique({ where: { id: id.id } });
    }
}

// Service Example
import { injectable } from 'tsyringe-neo';
// ...  prisma client import
@injectable()
export class CategoryService {
    constructor(/* inject prismaClient */){}
    async findUnique(args: any){
        //....
    }
}
```

Register your controller in your DI container and with NatsRpc:

```typescript
container.register('CategoryController', { useClass: CategoryController }); // register with DI
natsRpc.registerController('CategoryController')// register with Nats
```

### 3. Make RPC Calls

Now you can make RPC calls from other controllers using the controller proxy returned by `getControllerProxy` method of `NatsRpc` after register your controller :

```typescript
// Another controller (e.g., ProductController)
import { inject, injectable } from 'tsyringe-neo';
import { NatsRpc } from 'rpc-nats-alvamind';
import { CategoryController } from '../category/category.controller';

@injectable()
export class ProductController {
  private categoryController: CategoryController;
  constructor(@inject(NatsRpc) private readonly natsRpc: NatsRpc) {
       this.categoryController = this.natsRpc.getControllerProxy<CategoryController>('CategoryController');
    }


  async getProductWithCategory(id: number) {
    // Make an RPC call to CategoryController.getCategoryById
    const category = await this.categoryController.getCategoryById({id});
    // ... do something with category
  }
}
```

### 4. Implement Custom Dependency Resolver

If you are not using `tsyringe-neo`, you can implement the `DependencyResolver` interface to integrate with your container:

```typescript
import { DependencyResolver } from 'rpc-nats-alvamind';

class MyResolver implements DependencyResolver {
  resolve<T>(token: any): T {
    // Your DI container logic to resolve the token
  }
  registeredTokens(): any[] {
      // Get registered tokens in your DI
       return [];
  }
}
```

and configure using this implementation as:

```typescript
const natsRpc = new NatsRpc({
    dependencyResolver: new MyResolver(), // Using your custom implementation
    natsUrl: 'nats://localhost:4222',
});
```

## API Reference

### `NatsRpc` Class

#### Constructor

```typescript
constructor(options: NatsRpcOptions);
```

*   `options`:
    *   `dependencyResolver`: An instance of a class implementing the `DependencyResolver` interface.
    *   `natsUrl`: The URL of your NATS server.
    *   `subjectPattern`: *(Optional)* A function to define a custom subject pattern. It receives `className` and `methodName` and should return a string (subject). Default is `${className}.${methodName}`

        ```typescript
        (className: string, methodName: string) => string;
        ```
    *   `errorHandler`: *(Optional)* A function to handle errors that occur when processing NATS messages. It receives the error and the subject and can handle errors differently based on the subject.

        ```typescript
        (error: any, subject: string) => void;
        ```
    *   `requestTimeout` *(Optional)* The timeout in milliseconds for NATS request call. Default to 10000ms

#### `registerController` Method

```typescript
async registerController(token: any): Promise<void>;
```

Registers all methods from a controller as NATS subjects

*   `token`: The token of the controller to be registered. The token is usually the controller name or class itself.

#### `getControllerProxy` Method

```typescript
getControllerProxy<T>(controllerName: string): T;
```

Get a controller proxy for making RPC calls. The proxy will use `NatsRpc.call` under the hood, making it easy to call methods from other controller.

*   `controllerName`: The name or key of the controller.

#### `call` Method

```typescript
async call<T, R>(subject: string, data: T): Promise<R>;
```

Makes an RPC call to a NATS subject

*   `subject`: The NATS subject to call
*   `data`: The data to send to the subject

### `DependencyResolver` Interface

```typescript
interface DependencyResolver {
    resolve<T>(token: any): T;
    registeredTokens(): any[];
}
```

Used to interact with any Dependency Injection library.

*   `resolve<T>(token: any): T`: Resolve the requested instance of token
*   `registeredTokens()`: Returns a list of tokens that was registered

### `TsyringeResolver` Class

This class already implemented `DependencyResolver` interface and ready to be used with Tsyringe DI container.

```typescript
class TsyringeResolver implements DependencyResolver
```

### `NatsRpcOptions` Interface

```typescript
interface NatsRpcOptions {
    dependencyResolver: DependencyResolver;
    subjectPattern?: (className: string, methodName: string) => string;
    errorHandler?: (error: any, subject: string) => void;
    natsUrl: string
    requestTimeout?: number
}
```

Used for configuration.

## Examples

You can find more examples in the [GitHub repository](https://github.com/alvamind/rpc-nats).

## Roadmap

*   **Dynamic Serialization/Deserialization:** Support for dynamically selecting serialization/deserialization methods other than JSON (e.g., MessagePack, Protobuf).
*   **Improved Error Handling:** More granular control over error handling, including custom error codes.
*   **Middleware Support:** Ability to add middleware for request processing.
*   **Load Balancing and Failover:** Built-in mechanisms for load balancing and failover scenarios.

## Contributing

Contributions are welcome! Please submit a pull request or open an issue for any bugs or feature requests.

## License

This library is licensed under the MIT License.

## Contact

[alvaminddigital@gmail.com](mailto:alvaminddigital@gmail.com)
