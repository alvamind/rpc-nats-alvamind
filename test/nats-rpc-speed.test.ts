// test/nats-rpc-speed.test.ts
import { describe, afterAll, it } from 'bun:test';
import { NatsClient, NatsOptions } from '../src';
import { connect, NatsConnection, JSONCodec, StringCodec } from 'nats';

interface MathRequest {
  a: number;
  b: number;
}
interface MathResponse {
  result: number;
}
interface Payload<T> {
  subject: string;
  data: T;
}

// Direct function implementation for comparison
class MathService {
  add(data: MathRequest): MathResponse {
    return { result: data.a + data.b };
  }
  subtract(data: MathRequest): MathResponse {
    return { result: data.a - data.b };
  }
}

const mathService = new MathService();

const iterations = 1000;
const payload: MathRequest = { a: 10, b: 5 };

// Helper function to benchmark a scenario
async function benchmark(name: string, fn: () => Promise<void>): Promise<{ name: string; time: number }> {
  const start = performance.now();
  await fn();
  const end = performance.now();
  const time = end - start;
  console.log(`Scenario "${name}" took: ${time.toFixed(2)}ms`);
  return { name, time };
}

describe('NATS RPC Performance', () => {
  let results: { name: string; time: number }[] = [];
  afterAll(() => {
    // Sort results by time
    results.sort((a, b) => a.time - b.time);
    // Output header
    console.log('\n--- Benchmark Results ---');
    console.log('| Scenario                      | Time (ms) |');
    console.log('|-------------------------------|-----------|');
    // Output each result
    results.forEach((result) => {
      const name = result.name.padEnd(30); // Pad name to a fixed width for alignment
      const time = result.time.toFixed(2).padEnd(9);
      console.log(`| ${name} | ${time} |`);
    });
  });
  it('should compare performance across different scenarios', async () => {
    // Scenario 1: Direct function call (baseline)
    results.push(
      await benchmark('Direct function call', async () => {
        for (let i = 0; i < iterations; i++) {
          mathService.add(payload);
        }
      }),
    );
    // Scenario 2: NATS RPC with JSON codec
    const natsOptionsJson: NatsOptions = {
      natsUrl: 'nats://localhost:4222',
      scanPath: './test/services',
    };
    const clientJson = new NatsClient();
    await clientJson.connect(natsOptionsJson);
    const exposedMethodsJson = clientJson.getExposedMethods() as any;
    results.push(
      await benchmark('NATS RPC JSON codec', async () => {
        for (let i = 0; i < iterations; i++) {
          await exposedMethodsJson.MathService.add(payload);
        }
      }),
    );
    await clientJson.disconnect();

    // Scenario 3: NATS RPC with String codec
    const natsOptionsString: NatsOptions = {
      natsUrl: 'nats://localhost:4222',
      scanPath: './test/services',
      codec: StringCodec(),
    };
    const clientString = new NatsClient();
    await clientString.connect(natsOptionsString);
    const exposedMethodsString = clientString.getExposedMethods() as any;

    results.push(
      await benchmark('NATS RPC String codec', async () => {
        for (let i = 0; i < iterations; i++) {
          await exposedMethodsString.MathService.add(payload);
        }
      }),
    );
    await clientString.disconnect();

    // Scenario 4: NATS RPC with JSON codec no lib function call
    let ncJson: NatsConnection | undefined;
    results.push(
      await benchmark('NATS JSON no-lib', async () => {
        ncJson = await connect({ servers: 'nats://localhost:4222' });
        const jc = JSONCodec();
        const subject = 'MathService.add';
        for (let i = 0; i < iterations; i++) {
          const payloadToNats = jc.encode({ subject, data: payload });
          const response = await ncJson.request(subject, payloadToNats, { timeout: 3000 });
          const decoded = jc.decode(response.data) as any;
        }
        await ncJson.close();
      }),
    );
    ncJson = undefined;
    // Scenario 5: NATS RPC with String codec no lib function call
    let ncString: NatsConnection | undefined;
    results.push(
      await benchmark('NATS String no-lib', async () => {
        ncString = await connect({ servers: 'nats://localhost:4222' });
        const sc = StringCodec();
        const subject = 'MathService.add';
        for (let i = 0; i < iterations; i++) {
          const payloadToNats = sc.encode(JSON.stringify({ subject, data: payload }));
          const response = await ncString.request(subject, payloadToNats, { timeout: 3000 });
          const decoded = JSON.parse(sc.decode(response.data)) as any;
        }
        await ncString.close();
      }),
    );
    ncString = undefined;
    // Scenario 6: NATS RPC with JSON codec and more complex payload
    const complexPayload = { a: 10, b: 5, c: { d: 1, e: [1, 2, 3], f: 'test' } };
    const natsOptionsComplex: NatsOptions = {
      natsUrl: 'nats://localhost:4222',
      scanPath: './test/services',
    };
    const clientComplex = new NatsClient();
    await clientComplex.connect(natsOptionsComplex);
    const exposedMethodsComplex = clientComplex.getExposedMethods() as any;

    results.push(
      await benchmark('NATS RPC JSON complex payload', async () => {
        for (let i = 0; i < iterations; i++) {
          await exposedMethodsComplex.MathService.add(complexPayload);
        }
      }),
    );
    await clientComplex.disconnect();
    // Scenario 7: NATS RPC with String codec and more complex payload
    const natsOptionsStringComplex: NatsOptions = {
      natsUrl: 'nats://localhost:4222',
      scanPath: './test/services',
      codec: StringCodec(),
    };
    const clientStringComplex = new NatsClient();
    await clientStringComplex.connect(natsOptionsStringComplex);
    const exposedMethodsStringComplex = clientStringComplex.getExposedMethods() as any;

    results.push(
      await benchmark('NATS RPC String complex payload', async () => {
        for (let i = 0; i < iterations; i++) {
          await exposedMethodsStringComplex.MathService.add(complexPayload);
        }
      }),
    );
    await clientStringComplex.disconnect();

    // Scenario 8: NATS RPC JSON, no scan
    const natsOptionsNoScan: NatsOptions = {
      natsUrl: 'nats://localhost:4222',
    };
    const clientNoScan = new NatsClient();
    await clientNoScan.connect(natsOptionsNoScan);
    results.push(
      await benchmark('NATS RPC JSON no scan', async () => {
        for (let i = 0; i < iterations; i++) {
          await clientNoScan.request('MathService.add', payload);
        }
      }),
    );
    await clientNoScan.disconnect();

    // Scenario 9: NATS RPC String, no scan
    const natsOptionsNoScanString: NatsOptions = {
      natsUrl: 'nats://localhost:4222',
      codec: StringCodec(),
    };
    const clientNoScanString = new NatsClient();
    await clientNoScanString.connect(natsOptionsNoScanString);
    results.push(
      await benchmark('NATS RPC String no scan', async () => {
        for (let i = 0; i < iterations; i++) {
          await clientNoScanString.request('MathService.add', payload);
        }
      }),
    );
    await clientNoScanString.disconnect();

    // Scenario 10: NATS RPC JSON multiple request
    const natsOptionsMultiRequest: NatsOptions = {
      natsUrl: 'nats://localhost:4222',
      scanPath: './test/services',
    };
    const clientMultiRequest = new NatsClient();
    await clientMultiRequest.connect(natsOptionsMultiRequest);
    const exposedMethodsMultiRequest = clientMultiRequest.getExposedMethods() as any;
    results.push(
      await benchmark('NATS RPC JSON multiple request', async () => {
        for (let i = 0; i < iterations; i++) {
          await Promise.all([
            exposedMethodsMultiRequest.MathService.add(payload),
            exposedMethodsMultiRequest.MathService.add(payload),
            exposedMethodsMultiRequest.MathService.add(payload),
            exposedMethodsMultiRequest.MathService.add(payload),
          ]);
        }
      }),
    );
    await clientMultiRequest.disconnect();
    // Scenario 11: NATS RPC String multiple request
    const natsOptionsMultiRequestString: NatsOptions = {
      natsUrl: 'nats://localhost:4222',
      scanPath: './test/services',
      codec: StringCodec(),
    };
    const clientMultiRequestString = new NatsClient();
    await clientMultiRequestString.connect(natsOptionsMultiRequestString);
    const exposedMethodsMultiRequestString = clientMultiRequestString.getExposedMethods() as any;
    results.push(
      await benchmark('NATS RPC String multiple request', async () => {
        for (let i = 0; i < iterations; i++) {
          await Promise.all([
            exposedMethodsMultiRequestString.MathService.add(payload),
            exposedMethodsMultiRequestString.MathService.add(payload),
            exposedMethodsMultiRequestString.MathService.add(payload),
            exposedMethodsMultiRequestString.MathService.add(payload),
          ]);
        }
      }),
    );
    await clientMultiRequestString.disconnect();
  });
});
