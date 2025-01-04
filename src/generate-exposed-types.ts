import 'reflect-metadata';

import { NatsRegistry } from './nats-registry';
import { NatsOptions } from './types';
import { Logger, pino } from 'pino';
import * as fs from 'fs/promises';
import * as path from 'path';

export async function generateExposedMethodsType(options: Omit<NatsOptions, 'natsUrl'>, outputPath: string = 'src/generated/exposed-methods.d.ts', logger: Logger = pino()) {
  if (!options.scanPath) {
    logger.error(`[NATS] scanPath is required`)
    return
  }
  const registry = new NatsRegistry(undefined as any, options as NatsOptions, logger);
  try {
    await registry.registerHandlers(options.scanPath);
    await registry.generateExposedMethodsType(outputPath);
  } catch (error) {
    logger.error(`[NATS] Error generating exposed methods types`, error);
    console.error(error)
  }
}



export async function generateTypeCli(scanPath: string, outputPath: string = 'src/generated/exposed-methods.d.ts') {
  const logger = pino()
  const natsOptions: Omit<NatsOptions, 'natsUrl'> = {
    scanPath,
    logger
  }


  await generateExposedMethodsType(natsOptions, outputPath, logger);


}
