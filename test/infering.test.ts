// import { RPCClient, ClassTypeProxy, RPCServer, TransformToPromise } from '../index';
// import { $Enums } from '@prisma/client';


// // Simulate Prisma types
// type AIQueue = {
//   id: number;
//   createdAt: Date;
//   livestreamId: number;
//   status: $Enums.ResponseStatusEnum;
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
//   type: $Enums.InteractionTypeEnum;
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
//   async findFirst(
//     {
//       where,
//       include
//     }: {
//       where: {
//         interactions: {
//           some: {
//             type: $Enums.InteractionTypeEnum
//           }
//         }
//       },
//       include: {
//         interactions: boolean;
//         livestream: {
//           include: {
//             livestreamSetting: boolean,
//             socialPlatformAccount: {
//               include: {
//                 brand: {
//                   include: {
//                     aIAgents: {
//                       include: {
//                         setting: boolean
//                       }
//                     }
//                   }
//                 }
//               }
//             }
//           }
//         }
//       }
//     }): Promise<AIQueue> {
//     return {
//       id: 1,
//       createdAt: new Date(),
//       livestreamId: 1,
//       status: 'PENDING',
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
//   AIQueueController: TransformToPromise<AIQueueController>;

//   constructor(private rpcClient: RPCClient) {
//     this.AIQueueController = this.rpcClient.createProxy(AIQueueController);
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
//   const interactionFilter = {
//     type: 'CHAT' as $Enums.InteractionTypeEnum
//   };
//   const aiQueueData = await rpcServices.AIQueueController.findFirst({
//     where: {
//       interactions: { some: interactionFilter },
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
