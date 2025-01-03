import { NatsClient, NatsOptions } from '../src';
interface MathRequest {
  a: number;
  b: number;
}
interface MathResponse {
  result: number;
}
// Define the exposed method type
interface ExposedMethods {
  MathService: {
    add: (data: MathRequest) => Promise<MathResponse>;
    subtract: (data: MathRequest) => Promise<MathResponse>;
  };
}
async function main() {
  const options: NatsOptions = {
    natsUrl: 'nats://localhost:4222',
    scanPath: './test/services',
    streaming: false,
    retryConfig: {
      maxRetries: 3,
      initialDelay: 100,
      maxDelay: 1000,
      factor: 2,
    },
    context: {
      serviceName: 'math-service',
    },
  };
  const client = new NatsClient<ExposedMethods>(); // Pass the type here
  await client.connect(options);
  const exposedMethods = client.getExposedMethods();
  console.log('Exposed method', exposedMethods);
  const addResult: MathResponse = await exposedMethods.MathService.add({ a: 5, b: 3 });
  console.log('Add result:', addResult);
  const subResult: MathResponse = await exposedMethods.MathService.subtract({ a: 5, b: 3 });
  console.log('Subtract result:', subResult);
  await client.publish('math.event', { message: 'calculate' });
  await client.disconnect();
}
main().catch((error) => console.error('Error running main:', error));
