// test/nats-rpc.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { NatsRpc } from '../src/nats-rpc';
import { TsyringeResolver } from '../src/dependency-resolvers/tsyringe-resolver';
import { container } from 'tsyringe-neo';
import { connect, NatsConnection } from 'nats';

let natsRpc: NatsRpc;
let nc: NatsConnection;

describe('NatsRpc', () => {
  beforeAll(async () => {
    // Set up NATS connection and NatsRpc instance
    nc = await connect({ servers: 'nats://localhost:4222' });
    natsRpc = new NatsRpc({
      dependencyResolver: new TsyringeResolver(),
      natsUrl: 'nats://localhost:4222',
    });
    await natsRpc.connect();
  });

  afterAll(async () => {
    // Clean up NATS connection
    await natsRpc.close();
    await nc.close();
  });

  it('should connect to NATS server', async () => {
    expect(natsRpc).toBeDefined();
    expect(natsRpc['isConnected']).toBe(true);
  });

  it('should register and call an RPC handler', async () => {
    const subject = 'test.subject';
    const handler = async (data: { message: string }) => {
      return { reply: `Received: ${data.message}` };
    };

    await natsRpc.register(subject, handler);

    const response = await natsRpc.call<{ message: string }, { reply: string }>(subject, { message: 'Hello' });
    expect(response).toEqual({ reply: 'Received: Hello' });
  });

  it('should handle errors in RPC handler', async () => {
    const subject = 'test.error';
    const handler = async () => {
      throw new Error('Test error');
    };

    await natsRpc.register(subject, handler);

    try {
      await natsRpc.call(subject, {});
    } catch (error) {
      expect((error as Error).message).toBe('Test error');
    }
  });

  it('should register a controller and call its methods', async () => {
    class TestController {
      async hello(data: { name: string }) {
        return { message: `Hello, ${data.name}` };
      }
    }

    container.register('TestController', { useClass: TestController });

    await natsRpc.registerController('TestController');

    const response = await natsRpc.call<{ name: string }, { message: string }>('TestController.hello', {
      name: 'World',
    });
    expect(response).toEqual({ message: 'Hello, World' });
  });

  it('should register and call multiple RPC handlers', async () => {
    const subject1 = 'test.subject1';
    const subject2 = 'test.subject2';

    const handler1 = async (data: { message: string }) => {
      return { reply: `Handler1 received: ${data.message}` };
    };

    const handler2 = async (data: { message: string }) => {
      return { reply: `Handler2 received: ${data.message}` };
    };

    await natsRpc.register(subject1, handler1);
    await natsRpc.register(subject2, handler2);

    const response1 = await natsRpc.call<{ message: string }, { reply: string }>(subject1, { message: 'Hello1' });
    const response2 = await natsRpc.call<{ message: string }, { reply: string }>(subject2, { message: 'Hello2' });

    expect(response1).toEqual({ reply: 'Handler1 received: Hello1' });
    expect(response2).toEqual({ reply: 'Handler2 received: Hello2' });
  });

  it('should invoke error handler on error', async () => {
    const subject = 'test.errorHandler';
    const errorHandler = jest.fn();

    natsRpc = new NatsRpc({
      dependencyResolver: new TsyringeResolver(),
      natsUrl: 'nats://localhost:4222',
      errorHandler,
    });
    await natsRpc.connect();

    const handler = async () => {
      throw new Error('Test error with handler');
    };

    await natsRpc.register(subject, handler);

    try {
      await natsRpc.call(subject, {});
    } catch (error) {
      expect(errorHandler).toHaveBeenCalledWith(expect.any(Error), subject);
    }
  });

  it('should close the NATS connection', async () => {
    await natsRpc.close();
    expect(natsRpc['isConnected']).toBe(false);
  });

  it('should return registered tokens from TsyringeResolver', () => {
    class TestService {}
    container.register('TestService', { useClass: TestService });

    const resolver = new TsyringeResolver();
    const tokens = resolver.registeredTokens();

    expect(tokens).toContain('TestService');
  });
});
