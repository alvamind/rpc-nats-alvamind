// import { RPCClient, RPCServer, TransformToPromise } from "../src";

// // Simulate Prisma types
// type AIQueue = {
//   id: number;
//   createdAt: Date;
//   livestreamId: number;
//   updatedAt: Date;
//   bullMQJobId: string | null;
//   priority: number;
//   isPartOfBatch: boolean;
//   interactions: Interaction[];
//   livestream: {
//     livestreamSetting: {
//       id: number
//     }
//     socialPlatformAccount: {
//       brand: {
//         aIAgents: {
//           setting: {
//             id: number
//           }
//         }[]
//       }
//     }
//   }
// } | null;

// type Interaction = {
//   id: number;
//   content: string;
//   sender: string;
//   timestamp: Date;
//   aIQueueId: number | null;
//   isSkipped: boolean;
//   createdAt: Date;
//   aIResponseId: number | null;
//   livestreamId: number;
// };

// class AIQueueController {
//   async findFirst(params: {
//     where: {
//       interactions: {
//         id: number
//       }
//     },
//     include: {
//       interactions: boolean;
//       livestream: {
//         include: {
//           livestreamSetting: boolean,
//           socialPlatformAccount: {
//             include: {
//               brand: {
//                 include: {
//                   aIAgents: {
//                     include: {
//                       setting: boolean
//                     }
//                   }
//                 }
//               }
//             }
//           }
//         }
//       }
//     }
//   }): Promise<AIQueue> {
//     return {
//       id: 1,
//       createdAt: new Date(),
//       livestreamId: 1,
//       updatedAt: new Date(),
//       bullMQJobId: null,
//       priority: 1,
//       isPartOfBatch: false,
//       interactions: [],
//       livestream: {
//         livestreamSetting: {
//           id: 1
//         },
//         socialPlatformAccount: {
//           brand: {
//             aIAgents: [{
//               setting: {
//                 id: 1
//               }
//             }]
//           }
//         }
//       }
//     };
//   }
// }
// class RPCServices {
//   AIQueueController: AIQueueController;

//   constructor(private rpcClient: RPCClient) {
//     this.AIQueueController = this.rpcClient.createProxy(AIQueueController) as unknown as AIQueueController;;
//   }
// }
// const test = async () => {
//   const rpcServer = new RPCServer({ logLevel: 'debug' });
//   await rpcServer.start();
//   const aIQueueController = new AIQueueController()
//   await rpcServer.handleRequest(aIQueueController);
//   const rpcClient = new RPCClient({ logLevel: 'debug' });
//   await rpcClient.start();
//   const rpcServices = new RPCServices(rpcClient);

//   const aiQueueData = await rpcServices.AIQueueController.findFirst({
//     where: {
//       interactions: { id: 2 },
//     },
//     include: {
//       interactions: true,
//       livestream: {
//         include: {
//           livestreamSetting: true,
//           socialPlatformAccount: {
//             include: {
//               brand: {
//                 include: {
//                   aIAgents: {
//                     include: { setting: true },
//                   },
//                 },
//               },
//             },
//           },
//         },
//       },
//     },
//   });
//   console.log(aiQueueData)
//   await rpcClient.close()
//   await rpcServer.close()
// };
// test();
