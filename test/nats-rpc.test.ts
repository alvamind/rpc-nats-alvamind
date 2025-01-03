import { NatsClient, NatsOptions, ErrorObject, Codec } from '../src';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import * as fs from 'fs/promises';
import { StringCodec } from 'nats';

// Mock a service
class MockService {
  async add(data: { a: number; b: number }): Promise<{ result: number }> {
    return { result: data.a + data.b };
  }

  async subtract(data: { a: number; b: number }): Promise<{ result: number }> {
    return { result: data.a - data.b };
  }

  async throwsError(data: { message: string }): Promise<any> {
    throw new Error(data.message);
  }
  async echo(data: any): Promise<any> {
    return data;
  }
}

// NATS options for tests
const natsOptions: NatsOptions = {
  natsUrl: 'nats://localhost:4222',
  scanPath: './test/mock-services',
  streaming: false,
  context: {
    serviceName: 'test-service',
  },
  retryConfig: {
    maxRetries: 1,
    initialDelay: 100,
    maxDelay: 200,
    factor: 2,
  },
};

// Create a NATS client
let client: NatsClient;

beforeAll(async () => {
  // Create mock service directory
  await fs.mkdir('./test/mock-services', { recursive: true });
  await Bun.write(
    './test/mock-services/mock-service.ts',
    `
        export class MockService {
            async add(data: { a: number, b: number }): Promise<{ result: number }> {
                return { result: data.a + data.b };
            }

            async subtract(data: { a: number, b: number }): Promise<{ result: number }> {
                return { result: data.a - data.b };
            }

            async throwsError(data: { message: string }): Promise<any>{
                throw new Error(data.message);
            }
            async echo(data: any): Promise<any>{
              return data
          }
        }
    `,
  );

  client = new NatsClient();
  await client.connect(natsOptions);
});

afterAll(async () => {
  await client.disconnect();
  // Remove mock service directory
  await fs.rm('./test/mock-services', { recursive: true, force: true });
});

describe('NatsClient', () => {
  test('should connect to NATS server', () => {
    expect(client.isConnectedToNats()).toBe(true);
  });

  test('should register handlers from scanned classes', () => {
    const exposedMethods = client.getExposedMethods();
    expect(exposedMethods).toBeDefined();
    expect(exposedMethods.MockService).toBeDefined();
    expect(exposedMethods.MockService.add).toBeDefined();
    expect(exposedMethods.MockService.subtract).toBeDefined();
  });

  test('should make successful RPC request', async () => {
    const exposedMethods = client.getExposedMethods();
    const addResult = await exposedMethods.MockService.add({ a: 5, b: 3 });
    expect(addResult).toEqual({ result: 8 });

    const subResult = await exposedMethods.MockService.subtract({ a: 10, b: 4 });
    expect(subResult).toEqual({ result: 6 });
  });

  test('should handle an error in the handler and return error object', async () => {
    const exposedMethods = client.getExposedMethods();
    try {
      await exposedMethods.MockService.throwsError({ message: 'Test Error Message' });
    } catch (error: any) {
      expect(error.code).toBe('HANDLER_ERROR');
      expect(error.message).toBe('Error processing message for MockService.throwsError');
      expect(error.details.message).toBe('Test Error Message');
    }
  });
  test('should handle a failed request with retry and DLQ', async () => {
    const dlqSubject = 'test.dlq';
    const clientWithDLQ = new NatsClient();
    await clientWithDLQ.connect({
      ...natsOptions,
      dlqSubject,
      retryConfig: { maxRetries: 1, initialDelay: 10, maxDelay: 20 },
    });
    const nc = (clientWithDLQ as any).nc; // Accessing private property just for test case
    const dlqPromise = new Promise((resolve) => {
      nc.subscribe(dlqSubject, {
        callback: (_err: any, msg: any) => {
          const payload = JSON.parse(new TextDecoder().decode(msg.data));
          expect(payload.subject).toBe('MockService.throwsError');
          expect(payload.data).toEqual({ message: 'Test Error Message' });
          resolve(undefined);
        },
      });
    });

    try {
      const exposedMethods = clientWithDLQ.getExposedMethods();
      await exposedMethods.MockService.throwsError({ message: 'Test Error Message' });
    } catch (error: any) {
      expect(error.code).toBe('REQUEST_FAILED');
      expect(error.message).toBe(
        'Request failed after max retries, DLQ is not enabled MockService.throwsError - {"message":"Test Error Message"}',
      );
      await dlqPromise;
      await clientWithDLQ.disconnect();
    }
  });

  test('should handle a failed request without DLQ and throw an error', async () => {
    const clientWithoutDLQ = new NatsClient();
    await clientWithoutDLQ.connect({ ...natsOptions, retryConfig: { maxRetries: 1, initialDelay: 10, maxDelay: 20 } });
    try {
      const exposedMethods = clientWithoutDLQ.getExposedMethods();
      await exposedMethods.MockService.throwsError({ message: 'Test Error Message' });
    } catch (error: any) {
      expect(error.code).toBe('REQUEST_FAILED');
      expect(error.message).toBe(
        'Request failed after max retries, DLQ is not enabled MockService.throwsError - {"message":"Test Error Message"}',
      );
    } finally {
      await clientWithoutDLQ.disconnect();
    }
  });
  test('should publish a message', async () => {
    const publishPromise = new Promise<void>((resolve) => {
      const nc = (client as any).nc;
      nc.subscribe('test.event', {
        callback: (_err: any, msg: any) => {
          const payload = JSON.parse(new TextDecoder().decode(msg.data));
          expect(payload.data).toEqual({ message: 'Test Message' });
          resolve();
        },
      });
    });
    await client.publish('test.event', { message: 'Test Message' });
    await publishPromise;
  });

  test('should throw an error if Nats is not connected', async () => {
    const tempClient = new NatsClient();
    await expect(tempClient.request('test.subject', { data: 'test' })).rejects.toThrow('Nats is not connected');
    await expect(tempClient.publish('test.subject', { data: 'test' })).rejects.toThrow('Nats is not connected');
  });

  test('should close the connection', async () => {
    expect(client.isConnectedToNats()).toBe(true);
    await client.disconnect();
    expect(client.isConnectedToNats()).toBe(false);
  });

  test('should handle wildcard subscriptions', async () => {
    const wildcardClient = new NatsClient();
    await wildcardClient.connect({
      ...natsOptions,
      subjectPattern: (className: string, methodName: string) => `${className}.*`,
    });
    const nc = (wildcardClient as any).nc;
    const subPromise = new Promise<void>((resolve) => {
      nc.subscribe('MockService.*', {
        callback: (_err: any, msg: any) => {
          const payload = JSON.parse(new TextDecoder().decode(msg.data));
          expect(payload.data).toEqual({ a: 1, b: 2 });
          resolve();
        },
      });
    });
    const exposedMethods = wildcardClient.getExposedMethods();
    await exposedMethods.MockService.add({ a: 1, b: 2 });
    await subPromise;
    await wildcardClient.disconnect();
  });

  test('should use custom codec to encode and decode message', async () => {
    const customCodec: Codec<any> = {
      encode: (data: any) => new TextEncoder().encode(JSON.stringify(data)),
      decode: (data: Uint8Array) => JSON.parse(new TextDecoder().decode(data)),
    };
    const customClient = new NatsClient();
    await customClient.connect({ ...natsOptions, codec: customCodec });
    const exposedMethods = customClient.getExposedMethods();
    const data = { message: 'hello' };
    const result = await exposedMethods.MockService.echo(data);
    expect(result).toEqual(data);
    await customClient.disconnect();
  });

  test('should handle no class found', async () => {
    const clientNoClass = new NatsClient();
    // Create a temporary empty directory for test
    await fs.mkdir('./test/empty-dir', { recursive: true });
    await clientNoClass.connect({ ...natsOptions, scanPath: './test/empty-dir' });
    const exposedMethods = clientNoClass.getExposedMethods();
    expect(Object.keys(exposedMethods).length).toBe(0);
    //remove temp directory
    await fs.rm('./test/empty-dir', { recursive: true, force: true });
    await clientNoClass.disconnect();
  });

  test('should handle subscription error', async () => {
    const errorClient = new NatsClient();
    const errorHandler = (error: ErrorObject, subject: string) => {
      expect(error.code).toBe('HANDLER_ERROR');
      expect(error.message).toBe(`Error processing message for MockService.throwsError`);
      expect(subject).toBe('MockService.throwsError');
    };
    await errorClient.connect({ ...natsOptions, errorHandler });
    const exposedMethods = errorClient.getExposedMethods();
    try {
      await exposedMethods.MockService.throwsError({ message: 'Test Error Message' });
    } catch (error: any) {
    } finally {
      await errorClient.disconnect();
    }
  });

  test('should handle request timeout', async () => {
    const timeoutClient = new NatsClient();
    await timeoutClient.connect({ ...natsOptions, requestTimeout: 1 });
    const exposedMethods = timeoutClient.getExposedMethods();
    try {
      await exposedMethods.MockService.add({ a: 1, b: 1 });
    } catch (error: any) {
      expect(error.code).toBe('TIMEOUT');
      expect(error.message).toBe('TIMEOUT'); // Updated message assertion
    } finally {
      await timeoutClient.disconnect();
    }
  });

  test('should handle request timeout without retry', async () => {
    const timeoutClient = new NatsClient();
    await timeoutClient.connect({ ...natsOptions, retryConfig: { maxRetries: 0 }, requestTimeout: 10 });
    const exposedMethods = timeoutClient.getExposedMethods();
    try {
      await exposedMethods.MockService.add({ a: 1, b: 1 });
    } catch (error: any) {
      expect(error.code).toBe('TIMEOUT');
      expect(error.message).toBe('TIMEOUT'); // Updated message assertion
    } finally {
      await timeoutClient.disconnect();
    }
  });

  test('should handle request timeout with dlq', async () => {
    const dlqSubject = 'test.dlq';
    const timeoutClient = new NatsClient();
    await timeoutClient.connect({ ...natsOptions, dlqSubject, requestTimeout: 1, retryConfig: { maxRetries: 1 } });
    const nc = (timeoutClient as any).nc;
    const dlqPromise = new Promise((resolve) => {
      nc.subscribe(dlqSubject, {
        callback: (_err: any, msg: any) => {
          const payload = JSON.parse(new TextDecoder().decode(msg.data));
          expect(payload.subject).toBe('MockService.add');
          expect(payload.data).toEqual({ a: 1, b: 1 });
          resolve(undefined);
        },
      });
    });
    try {
      const exposedMethods = timeoutClient.getExposedMethods();
      await exposedMethods.MockService.add({ a: 1, b: 1 });
    } catch (error: any) {
      expect(error.code).toBe('TIMEOUT');
      expect(error.message).toBe('TIMEOUT'); // Updated message assertion
      await dlqPromise;
    } finally {
      await timeoutClient.disconnect();
    }
  });

  test('should handle request timeout without dlq and without retry', async () => {
    const timeoutClient = new NatsClient();
    await timeoutClient.connect({ ...natsOptions, retryConfig: { maxRetries: 0 }, requestTimeout: 1 });
    try {
      const exposedMethods = timeoutClient.getExposedMethods();
      await exposedMethods.MockService.add({ a: 1, b: 1 });
    } catch (error: any) {
      expect(error.code).toBe('TIMEOUT');
      expect(error.message).toBe('TIMEOUT'); // Updated message assertion
    } finally {
      await timeoutClient.disconnect();
    }
  });
});
