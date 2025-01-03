import { NatsClient, NatsOptions } from '../src';

// Define types that might come from Prisma (or anywhere)
interface User {
  id: number;
  name: string;
  email: string;
}

interface Product {
  id: number;
  name: string;
  price: number;
}

interface MathRequest {
  a: number;
  b: number;
}
interface MathResponse {
  result: number;
}

// This is the generated type, but we're not writing it manually anymore
// we just let the lib do the work.
interface ExposedMethods {
  MathService: {
    add: <T extends MathResponse>(data: MathRequest) => Promise<T>;
    subtract: <T extends MathResponse>(data: MathRequest) => Promise<T>;
    getUser: <T extends User>(id: number) => Promise<T>;
    getProduct: <T extends Product>(id: number) => Promise<T>;
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

  const userResult: User = await exposedMethods.MathService.getUser(1);
  console.log('User Result:', userResult);

  const productResult: Product = await exposedMethods.MathService.getProduct(1);
  console.log('Product Result:', productResult);

  await client.publish('math.event', { message: 'calculate' });
  await client.disconnect();
}

main().catch((error) => console.error('Error running main:', error));
