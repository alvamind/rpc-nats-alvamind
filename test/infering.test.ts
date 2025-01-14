import { ClassTypeProxy, RPCClient, RPCServer } from "../src";


// Example similar to prisma response.
type PrismaResponse = {
  interactions: {
    type: "a" | "b";
    id: number;
    content: string;
    sender: string;
    timestamp: Date;
    aIQueueId: number | null;
    isSkipped: boolean;
    createdAt: Date;
    aIResponseId: number | null;
    livestreamId: number;
  }[];
} & {
  id: number;
  createdAt: Date;
  livestreamId: number;
  status: "x" | "y" | "z";
  updatedAt: Date;
  bullMQJobId: string | null;
  priority: number;
  isPartOfBatch: boolean;
} | null

type TestType = {
  getPrismaObject: () => PrismaResponse;
  getPrismaObjectPromise: () => Promise<PrismaResponse>;
  normalString: string;
};

class TestController {
  getPrismaObject(): PrismaResponse {
    return {
      interactions: [{
        type: 'a',
        id: 1,
        content: "string",
        sender: "string",
        timestamp: new Date(),
        aIQueueId: null,
        isSkipped: false,
        createdAt: new Date(),
        aIResponseId: null,
        livestreamId: 1
      }],
      id: 1,
      createdAt: new Date(),
      livestreamId: 1,
      status: 'x',
      updatedAt: new Date(),
      bullMQJobId: null,
      priority: 1,
      isPartOfBatch: false
    }
  }

  async getPrismaObjectPromise(): Promise<PrismaResponse> {
    return {
      interactions: [{
        type: 'a',
        id: 1,
        content: "string",
        sender: "string",
        timestamp: new Date(),
        aIQueueId: null,
        isSkipped: false,
        createdAt: new Date(),
        aIResponseId: null,
        livestreamId: 1
      }],
      id: 1,
      createdAt: new Date(),
      livestreamId: 1,
      status: 'x',
      updatedAt: new Date(),
      bullMQJobId: null,
      priority: 1,
      isPartOfBatch: false
    }
  }
  normalString: string = 'test'
}


const test = async () => {
  const rpcServer = new RPCServer({ logLevel: 'debug' });
  await rpcServer.start();
  const testController = new TestController();
  await rpcServer.handleRequest(testController);
  const rpcClient = new RPCClient({ logLevel: 'debug' });
  await rpcClient.start();
  const api: ClassTypeProxy<TestType> = rpcClient.createProxy(TestController);

  const result = await api.getPrismaObject();
  const result2 = await api.getPrismaObjectPromise();
  const result3 = api.normalString

  console.log(result, result2, result3)
  await rpcClient.close()
  await rpcServer.close()
};


test();
