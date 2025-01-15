// rpc-nats-alvamind/test/generate.test.ts
import { describe, expect, beforeEach, afterEach, it } from 'bun:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { main } from '../src/generate-services'; // Import the main function
import { Config } from '../src/types';

const execAsync = promisify(exec);

let testCounter = 0;
let testDir: string;
let outputFilePath: string;
let rpcDir: string;
let sourceDir: string;
let modelsDir: string;

// Configuration for run mode
type RunMode = 'cli' | 'direct';

const runConfig: { runMode: RunMode } = {
  // runMode: 'cli', // Default to CLI mode
  runMode: 'direct', // Default to Direct mode
};


const createTestFiles = async () => {
  await fs.mkdir(sourceDir, { recursive: true });
  await fs.mkdir(modelsDir, { recursive: true });

  // Controller 1 with complex imports
  await fs.writeFile(path.join(sourceDir, 'user.controller.ts'), `
    import { User } from '../../models/user.model';
    import { Logger } from '../logger';

    export class UserController {
        constructor(private logger: Logger) {}

        async getUser(id: number): Promise<User> {
           this.logger.log('Getting user:'+ id)
            return { id, name: 'Test User' };
        }

        async createUser(user: User): Promise<User> {
             this.logger.log('Creating user:'+ user.name);
            return user;
        }
    }
    `);

  // Controller 2 with different structure
  await fs.writeFile(path.join(sourceDir, 'auth.controller.ts'), `
    export class AuthController {
        async login(credentials: {user:string, pass:string}): Promise<string> {
            if (credentials.user === 'test' && credentials.pass === 'test') return 'token';
            return 'invalid credentials';
        }
        async logout(): Promise<void> {
          return;
        }
    }
    `);

  // Add the worker file here
  await fs.writeFile(path.join(sourceDir, 'user.worker.ts'), `
    export class UserWorker {
        async processUser(id: number): Promise<void> {
            console.log('Processing user:', id);
        }
    }
  `);

  await fs.writeFile(path.join(modelsDir, 'user.model.ts'), `
    export interface User {
        id: number;
        name: string;
    }
     `);
  // Dummy file
  await fs.writeFile(path.join(testDir, 'dummy.ts'), 'export const dummy = 1;');
  // Non-Controller service file
  await fs.writeFile(path.join(rpcDir, 'logger.ts'), `
    export class Logger {
        log(message: string) {
            console.log('LOGGER:' + message)
        }
    }
    `);
};

const deleteTestFiles = async () => {
  await fs.rm(testDir, { recursive: true, force: true });
};


const runGenerator = async (options: {
  includes?: string[];
  excludes?: string[];
  output?: string;
  proxyType?: 'cast' | 'proxy';
}) => {
  if (runConfig.runMode === 'cli') {
    return await runCli(options);
  } else {
    return await runDirect(options);
  }
};


const runCli = async (options: {
  includes?: string[];
  excludes?: string[];
  output?: string;
  proxyType?: 'cast' | 'proxy';
}) => {
  const { includes, excludes = [], output = outputFilePath, proxyType = 'proxy' } = options;
  const includesArg = includes ? includes.map(include => `--includes="${include}"`).join(' ') : '';
  const excludesArg = excludes.map(exclude => `--excludes="${exclude}"`).join(' ');
  const proxyTypeArg = `--proxyType="${proxyType}"`;
  const command = `bun src/generate-services.ts generate ${includesArg} ${excludesArg} --output="${output}" --logLevel="debug" ${proxyTypeArg}`;
  try {
    const { stdout, stderr } = await execAsync(command);
    if (stderr) {
      console.error('CLI Error:', stderr);
    }
    return { stdout, stderr };
  } catch (error: any) {
    console.error('CLI Execution Error:', error.message);
    throw error;
  }
};

const runDirect = async (options: {
  includes?: string[];
  excludes?: string[];
  output?: string;
  proxyType?: 'cast' | 'proxy';
}) => {
  const { includes, excludes = [], output = outputFilePath, proxyType = 'proxy' } = options;
  const config: Config = {
    includes,
    excludes,
    output,
    watch: false,
    logLevel: 'debug',
    proxyType
  };
  try {
    await main(config);
    return { stdout: 'Direct run success', stderr: '' };
  } catch (error: any) {
    console.error('Direct Execution Error:', error.message);
    throw error
  }
}


describe('generateRpcServices - Real Scenarios', () => {
  beforeEach(async () => {
    testCounter++;
    testDir = path.join(process.cwd(), `test-temp-${testCounter}`);
    outputFilePath = path.join(testDir, 'rpc-services.ts');
    rpcDir = path.join(testDir, 'rpc');
    sourceDir = path.join(rpcDir, 'controllers');
    modelsDir = path.join(testDir, 'models');
    await createTestFiles();
  });

  afterEach(async () => {
    await deleteTestFiles();
  });

  it('should handle default includes (whole project) when includes is empty', async () => {
    await runGenerator({
      includes: undefined,
    });
    const outputFileContent = await fs.readFile(outputFilePath, 'utf-8');
    expect(outputFileContent).toContain('UserController');
    expect(outputFileContent).toContain('AuthController');
    expect(outputFileContent).not.toContain('ExcludedController');
  });

  it('should handle direct path includes correctly', async () => {
    await runGenerator({
      includes: [path.join(sourceDir, 'user.controller.ts')],
    });
    const outputFileContent = await fs.readFile(outputFilePath, 'utf-8');
    expect(outputFileContent).toContain('UserController');
    expect(outputFileContent).not.toContain('AuthController');
  });

  it('should handle direct path excludes correctly', async () => {
    await runGenerator({
      includes: [`${sourceDir}/**/*.ts`],
      excludes: [path.join(sourceDir, 'auth.controller.ts')],
    });
    const outputFileContent = await fs.readFile(outputFilePath, 'utf-8');
    expect(outputFileContent).toContain('UserController');
    expect(outputFileContent).not.toContain('AuthController');
  });

  it('should handle direct file naming pattern includes correctly', async () => {
    await runGenerator({
      includes: ['user.controller.ts'],
    });
    const outputFileContent = await fs.readFile(outputFilePath, 'utf-8');
    expect(outputFileContent).toContain('UserController');
    expect(outputFileContent).not.toContain('AuthController');
    expect(outputFileContent).not.toContain('UserWorker');
  });

  it('should handle a mix of path and file name pattern includes', async () => {
    await runGenerator({
      includes: [
        path.join(sourceDir, '**/*.worker.ts'),  // Path-like pattern
        '**/*.controller.ts'                      // Filename pattern
      ],
    });
    const outputFileContent = await fs.readFile(outputFilePath, 'utf-8');
    expect(outputFileContent).toContain('UserController');
    expect(outputFileContent).toContain('AuthController');
    expect(outputFileContent).toContain('UserWorker');
  });

  it('should generate rpc-services.ts with ClassTypeProxy correctly with multiple controllers and complex paths', async () => {
    await runGenerator({
      includes: [`${sourceDir}/**/*.ts`],
      proxyType: 'proxy',
    });
    const outputFileContent = await fs.readFile(outputFilePath, 'utf-8');

    expect(outputFileContent).toContain('// This file is auto-generated by rpc-nats-alvamind');
    expect(outputFileContent).toContain(`import { UserController } from '${path.relative(path.dirname(outputFilePath), path.join(sourceDir, 'user.controller.ts')).replace(/\\/g, '/').replace(/\.ts$/, '')}'`);
    expect(outputFileContent).toContain(`import { AuthController } from '${path.relative(path.dirname(outputFilePath), path.join(sourceDir, 'auth.controller.ts')).replace(/\\/g, '/').replace(/\.ts$/, '')}'`);
    expect(outputFileContent).toContain('    UserController: ClassTypeProxy<UserController>;');
    expect(outputFileContent).toContain('    AuthController: ClassTypeProxy<AuthController>;');
    expect(outputFileContent).toContain('        this.UserController = this.rpcClient.createProxy(UserController);');
    expect(outputFileContent).toContain('        this.AuthController = this.rpcClient.createProxy(AuthController);');
  });


  it('should generate rpc-services.ts correctly with multiple controllers and complex paths with casting', async () => {
    await runGenerator({
      includes: [`${sourceDir}/**/*.ts`],
      proxyType: 'cast'
    });
    const outputFileContent = await fs.readFile(outputFilePath, 'utf-8');

    expect(outputFileContent).toContain('// This file is auto-generated by rpc-nats-alvamind');
    expect(outputFileContent).toContain(`import { UserController } from '${path.relative(path.dirname(outputFilePath), path.join(sourceDir, 'user.controller.ts')).replace(/\\/g, '/').replace(/\.ts$/, '')}'`);
    expect(outputFileContent).toContain(`import { AuthController } from '${path.relative(path.dirname(outputFilePath), path.join(sourceDir, 'auth.controller.ts')).replace(/\\/g, '/').replace(/\.ts$/, '')}'`);
    expect(outputFileContent).toContain('    UserController: UserController;');
    expect(outputFileContent).toContain('    AuthController: AuthController;');
    expect(outputFileContent).toContain('        this.UserController = this.rpcClient.createProxy(UserController) as unknown as UserController;');
    expect(outputFileContent).toContain('        this.AuthController = this.rpcClient.createProxy(AuthController) as unknown as AuthController;');
  });

  it('should handle no controller files found', async () => {
    await runGenerator({
      includes: [`${testDir}/non-existent/**/*.ts`],
    });

    const outputFileContent = await fs.readFile(outputFilePath, 'utf-8');
    expect(outputFileContent).toContain('No files found with provided includes/excludes.');
  });


  it('should handle edge case file paths and names', async () => {
    await fs.mkdir(path.join(sourceDir, 'subdir'), { recursive: true });
    await fs.writeFile(path.join(sourceDir, 'subdir', 'some-long-name.controller.ts'), `
            export class SomeLongNameController {
                async someMethod(): Promise<void> {
                  return;
                }
            }
        `);
    await runGenerator({
      includes: [`${sourceDir}/**/*.ts`],
    });
    const outputFileContent = await fs.readFile(outputFilePath, 'utf-8');

    expect(outputFileContent).toContain(`import { SomeLongNameController } from '${path.relative(path.dirname(outputFilePath), path.join(sourceDir, 'subdir', 'some-long-name.controller.ts')).replace(/\\/g, '/').replace(/\.ts$/, '')}';`);
    expect(outputFileContent).toContain('SomeLongNameController: ClassTypeProxy<SomeLongNameController>;');
    expect(outputFileContent).toContain('this.SomeLongNameController = this.rpcClient.createProxy(SomeLongNameController);');
  });
});

describe('generateRpcServices - Edge Cases and Error Handling', () => {
  beforeEach(async () => {
    testCounter++;
    testDir = path.join(process.cwd(), `test-temp-${testCounter}`);
    outputFilePath = path.join(testDir, 'rpc-services.ts');
    rpcDir = path.join(testDir, 'rpc');
    sourceDir = path.join(rpcDir, 'controllers');
    modelsDir = path.join(testDir, 'models');
    await createTestFiles();
  });

  afterEach(async () => {
    await deleteTestFiles();
  });

  it('should handle multiple includes patterns correctly', async () => {
    await fs.mkdir(path.join(testDir, 'other-controllers'), { recursive: true });
    await fs.writeFile(
      path.join(testDir, 'other-controllers', 'payment.controller.ts'),
      `
          export class PaymentController {
              async processPayment(): Promise<boolean> {
                  return true;
              }
          }
          `
    );

    await runGenerator({
      includes: [
        `${sourceDir}/**/*.ts`,
        `${testDir}/other-controllers/**/*.ts`
      ],
    });
    const outputFileContent = await fs.readFile(outputFilePath, 'utf-8');
    expect(outputFileContent).toContain('PaymentController');
    expect(outputFileContent).toContain('UserController');
    expect(outputFileContent).toContain('AuthController');
  });

  it('should handle excludes patterns correctly', async () => {
    await runGenerator({
      includes: [`${sourceDir}/**/*.ts`],
      excludes: [`${sourceDir}/**/auth.controller.ts`],
    });
    const outputFileContent = await fs.readFile(outputFilePath, 'utf-8');
    expect(outputFileContent).toContain('UserController');
    expect(outputFileContent).not.toContain('AuthController');
  });

  it('should handle files with multiple classes', async () => {
    await fs.writeFile(
      path.join(sourceDir, 'multiple.controller.ts'),
      `
      export class FirstController {
          async method1(): Promise<void> {}
      }

      export class SecondController {
          async method2(): Promise<void> {}
      }

      export class NonControllerClass {
          method3() {}
      }
      `
    );
    await runGenerator({
      includes: [`${sourceDir}/multiple.controller.ts`],
    });
    const outputFileContent = await fs.readFile(outputFilePath, 'utf-8');

    expect(outputFileContent).toContain('FirstController');
    expect(outputFileContent).toContain('SecondController');
    expect(outputFileContent).not.toContain('NonControllerClass');
  });

  it('should handle invalid TypeScript syntax gracefully', async () => {
    await createTestFiles();
    await fs.writeFile(
      path.join(sourceDir, 'invalid.controller.ts'),
      `
      export class InvalidController {
          async broken(): Promise<void>
          // Missing implementation and closing brace
      `
    );
    await runGenerator({
      includes: [`${sourceDir}/**/*.ts`],
    });
    const outputFileContent = await fs.readFile(outputFilePath, 'utf-8');
    expect(outputFileContent).toContain('UserController');
    expect(outputFileContent).toContain('AuthController');
  });

  it('should handle empty controller classes', async () => {
    await fs.writeFile(
      path.join(sourceDir, 'empty.controller.ts'),
      `
      export class EmptyController {}
      `
    );
    await runGenerator({
      includes: [`${sourceDir}/empty.controller.ts`],
    });
    const outputFileContent = await fs.readFile(outputFilePath, 'utf-8');
    expect(outputFileContent).toContain('EmptyController');
  });

  it('should handle output to non-existent directory', async () => {
    const newOutputPath = path.join(testDir, 'new-dir', 'rpc-services.ts');
    await runGenerator({
      includes: [`${sourceDir}/**/*.ts`],
      output: newOutputPath,
    });
    const outputFileContent = await fs.readFile(newOutputPath, 'utf-8');

    expect(outputFileContent).toContain('UserController');
    expect(outputFileContent).toContain('AuthController');
  });
});

describe('generateRpcServices - Advanced Edge Cases', () => {
  beforeEach(async () => {
    testCounter++;
    testDir = path.join(process.cwd(), `test-temp-${testCounter}`);
    outputFilePath = path.join(testDir, 'rpc-services.ts');
    rpcDir = path.join(testDir, 'rpc');
    sourceDir = path.join(rpcDir, 'controllers');
    modelsDir = path.join(testDir, 'models');
    await createTestFiles();
  });

  afterEach(async () => {
    await deleteTestFiles();
  });

  it('should handle files with special characters in path', async () => {
    const specialPath = path.join(sourceDir, 'special @#$% chars');
    await fs.mkdir(specialPath, { recursive: true });
    await fs.writeFile(
      path.join(specialPath, 'special.controller.ts'),
      `
      export class SpecialController {
          async method(): Promise<void> {}
      }
      `
    );
    await runGenerator({
      includes: [`${specialPath}/**/*.ts`],
    });
    const outputFileContent = await fs.readFile(outputFilePath, 'utf-8');

    expect(outputFileContent).toContain('SpecialController');
  });

  it('should handle controllers with nested namespaces', async () => {
    await fs.writeFile(
      path.join(sourceDir, 'namespace.controller.ts'),
      `
      namespace API {
          export namespace V1 {
              export class NamespacedController {
                  async method(): Promise<void> {}
              }
          }
      }

      export { API };
      `
    );
    await runGenerator({
      includes: [`${sourceDir}/namespace.controller.ts`],
    });
    const outputFileContent = await fs.readFile(outputFilePath, 'utf-8');

    expect(outputFileContent).toContain('NamespacedController');
  });

  it('should handle deeply nested controller directories', async () => {
    const deepPath = path.join(sourceDir, 'v1', 'api', 'services', 'nested');
    await fs.mkdir(deepPath, { recursive: true });
    await fs.writeFile(
      path.join(deepPath, 'deep.controller.ts'),
      `
      export class DeepController {
          async deepMethod(): Promise<string> {
              return 'deep';
          }
      }
      `
    );
    await runGenerator({
      includes: [`${sourceDir}/**/*.controller.ts`],
    });
    const output = await fs.readFile(outputFilePath, 'utf-8');

    expect(output).toContain('DeepController');
    expect(output).toContain('deepMethod');
  });

  it('should handle controllers with special characters in path', async () => {
    const specialPath = path.join(sourceDir, 'special@chars');
    await fs.mkdir(specialPath, { recursive: true });
    await fs.writeFile(
      path.join(specialPath, 'special.controller.ts'),
      `
      export class SpecialController {
          async specialMethod(): Promise<void> {}
      }
      `
    );
    await runGenerator({
      includes: [`${sourceDir}/**/*.controller.ts`],
    });
    const output = await fs.readFile(outputFilePath, 'utf-8');

    expect(output).toContain('SpecialController');
  });

  it('should handle controllers with complex type definitions', async () => {
    await fs.writeFile(
      path.join(sourceDir, 'complex.controller.ts'),
      `
      type ComplexType<T> = T extends Array<infer U> ? U[] : never;
      interface NestedInterface {
        prop1: string;
        prop2: {
          nested: number[];
        };
      }

      export class ComplexController {
          async complexMethod<T extends string>(
            param1: ComplexType<T[]>,
            param2: NestedInterface
          ): Promise<Record<string, unknown>> {
            return {};
          }
      }
      `
    );
    await runGenerator({
      includes: [`${sourceDir}/**/*.ts`],
    });
    const output = await fs.readFile(outputFilePath, 'utf-8');

    expect(output).toContain('ComplexController');
  });


  it('should handle files with multiple export styles', async () => {
    await fs.writeFile(
      path.join(sourceDir, 'exports.controller.ts'),
      `
      export class FirstExportController {
          method1() {}
      }

      class SecondController {
          method2() {}
      }
      export { SecondController as SecondExportController }

      export default class DefaultController {
          method3() {}
      }
      `
    );
    await runGenerator({
      includes: [`${sourceDir}/exports.controller.ts`],
    });
    const output = await fs.readFile(outputFilePath, 'utf-8');

    expect(output).toContain('FirstExportController');
    expect(output).toContain('SecondExportController');
    expect(output).toContain('DefaultController');
  });

  it('should handle abstract classes and inheritance', async () => {
    await fs.writeFile(
      path.join(sourceDir, 'abstract.controller.ts'),
      `
      abstract class BaseController {
          abstract baseMethod(): Promise<void>;
      }

      export class ConcreteController extends BaseController {
          async baseMethod(): Promise<void> {}

          async concreteMethod(): Promise<string> {
              return 'concrete';
          }
      }
      `
    );
    await runGenerator({
      includes: [`${sourceDir}/**/*.ts`],
    });
    const output = await fs.readFile(outputFilePath, 'utf-8');

    expect(output).toContain('ConcreteController');
    expect(output).not.toContain('BaseController');
  });


  it('should handle circular dependencies between controllers', async () => {
    await fs.writeFile(
      path.join(sourceDir, 'circular1.controller.ts'),
      `
      import { Circular2Controller } from './circular2.controller';
      export class Circular1Controller {
          constructor(private c2: Circular2Controller) {}
          async method1(): Promise<void> {}
      }
      `
    );

    await fs.writeFile(
      path.join(sourceDir, 'circular2.controller.ts'),
      `
      import { Circular1Controller } from './circular1.controller';
      export class Circular2Controller {
          constructor(private c1: Circular1Controller) {}
          async method2(): Promise<void> {}
      }
      `
    );
    await runGenerator({
      includes: [`${sourceDir}/**/*.ts`],
    });
    const output = await fs.readFile(outputFilePath, 'utf-8');

    expect(output).toContain('Circular1Controller');
    expect(output).toContain('Circular2Controller');
  });

  it('should handle controllers with generic types', async () => {
    await fs.writeFile(
      path.join(sourceDir, 'generic.controller.ts'),
      `
      export class GenericController<T> {
          async process<K>(data: T): Promise<K> {
              return {} as K;
          }

          async list(): Promise<T[]> {
              return [];
          }
      }
      `
    );
    await runGenerator({
      includes: [`${sourceDir}/generic.controller.ts`],
    });
    const outputFileContent = await fs.readFile(outputFilePath, 'utf-8');
    expect(outputFileContent).toContain('GenericController');
    expect(outputFileContent).toContain('ClassTypeProxy<GenericController>');
  });

  it('should handle controllers with decorators', async () => {
    await fs.writeFile(
      path.join(sourceDir, 'decorated.controller.ts'),
      `
      function Controller() {
          return function (target: any) {
              return target;
          };
      }

      function Method() {
          return function (target: any, propertyKey: string) {
              return target;
          };
      }

      @Controller()
      export class DecoratedController {
          @Method()
          async decoratedMethod(): Promise<void> {}
      }
      `
    );
    await runGenerator({
      includes: [`${sourceDir}/**/*.ts`],
    });
    const output = await fs.readFile(outputFilePath, 'utf-8');

    expect(output).toContain('DecoratedController');
  });
});

describe('generateRpcServices - Different Naming Patterns', () => {
  beforeEach(async () => {
    testCounter++;
    testDir = path.join(process.cwd(), `test-temp-${testCounter}`);
    outputFilePath = path.join(testDir, 'rpc-services.ts');
    rpcDir = path.join(testDir, 'rpc');
    sourceDir = path.join(rpcDir, 'handlers'); // Changed to handlers
    modelsDir = path.join(testDir, 'models');
    await createTestFiles();
  });

  afterEach(async () => {
    await deleteTestFiles();
  });

  it('should handle handler naming pattern', async () => {
    await fs.writeFile(
      path.join(sourceDir, 'user.handler.ts'),
      `
      export class UserHandler {
          async handle(): Promise<void> {}
      }
      `
    );
    await runGenerator({
      includes: [`${sourceDir}/**/*.handler.ts`],
    });
    const output = await fs.readFile(outputFilePath, 'utf-8');
    expect(output).toContain('UserHandler');
  });

  it('should handle service naming pattern', async () => {
    await fs.writeFile(
      path.join(sourceDir, 'user.service.ts'),
      `
      export class UserService {
          async process(): Promise<void> {}
      }
      `
    );
    await runGenerator({
      includes: [`${sourceDir}/**/*.service.ts`],
    });
    const output = await fs.readFile(outputFilePath, 'utf-8');
    expect(output).toContain('UserService');
  });

  it('should handle multiple naming patterns simultaneously', async () => {
    await fs.writeFile(
      path.join(sourceDir, 'user.handler.ts'),
      `
      export class UserHandler {
          async handle(): Promise<void> {}
      }
      `
    );
    await fs.writeFile(
      path.join(sourceDir, 'auth.service.ts'),
      `
      export class AuthService {
          async process(): Promise<void> {}
      }
      `
    );
    await runGenerator({
      includes: [
        `${sourceDir}/**/*.handler.ts`,
        `${sourceDir}/**/*.service.ts`
      ],
    });
    const output = await fs.readFile(outputFilePath, 'utf-8');
    expect(output).toContain('UserHandler');
    expect(output).toContain('AuthService');
  });

  it('should handle custom file patterns', async () => {
    await fs.writeFile(
      path.join(sourceDir, 'custom-name.ts'),
      `
      export class CustomClass {
          async customMethod(): Promise<void> {}
      }
      `
    );
    await runGenerator({
      includes: [`${sourceDir}/**/custom-*.ts`],
    });
    const output = await fs.readFile(outputFilePath, 'utf-8');
    expect(output).toContain('CustomClass');
  });
});
