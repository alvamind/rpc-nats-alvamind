#!/usr/bin/env node
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { glob } from 'glob';
import fs from 'node:fs/promises';
import path from 'node:path';
import chokidar from 'chokidar';
import { debounce } from 'lodash';
import { Project, SourceFile } from 'ts-morph';
import picomatch from 'picomatch';
import { Config } from './types';
import { ModuleKind, ModuleResolutionKind, ScriptTarget, SyntaxKind as tsSyntaxKind } from 'typescript';

interface ClassInfo {
  name: string;
  path: string;
  methods: string[];
}

class Logger {
  private level: string;
  constructor(level: string) {
    this.level = level.toLowerCase();
  }
  debug(...args: any[]): void {
    if (this.level === 'debug') console.debug(...args);
  }
  info(...args: any[]): void {
    if (['debug', 'info'].includes(this.level)) console.info(...args);
  }
  warn(...args: any[]): void {
    if (['debug', 'info', 'warn'].includes(this.level)) console.warn(...args);
  }
  error(...args: any[]): void {
    console.error(...args);
  }
}

const parseArgs = (): Config => {
  const argv = yargs(hideBin(process.argv))
    .command('generate', 'Generate rpc-services.ts file', (yargs) => {
      yargs
        .option('includes', {
          type: 'string',
          describe: 'Glob patterns or direct paths for including files',
          array: true,
          coerce: (arg: string | string[] | undefined) => {
            if (!arg) return undefined;
            return typeof arg === 'string' ? arg.split(/[,\s]+/).filter(Boolean) : arg;
          },
        })
        .option('excludes', {
          type: 'string',
          describe: 'Glob patterns or direct paths for excluding files',
          default: [],
          array: true,
          coerce: (arg: string | string[]) => (typeof arg === 'string' ? arg.split(/[,\s]+/).filter(Boolean) : arg),
        })
        .option('output', {
          type: 'string',
          describe: 'Output file path',
          default: 'src/common/rpc/rpc-services.ts',
        })
        .option('watch', {
          type: 'boolean',
          describe: 'Watch for file changes and regenerate',
          default: false,
        })
        .option('proxyType', {
          type: 'string',
          describe: 'Type of proxy generation: "cast" or "proxy"',
          default: 'proxy',
          choices: ['cast', 'proxy'],
        })
        .option('logLevel', {
          type: 'string',
          describe: 'Log level (debug, info, warn, error)',
          default: 'info',
        });
    })
    .parseSync();
  if (argv._[0] !== 'generate') {
    console.error('Invalid command. Use "generate".');
    process.exit(1);
  }
  return argv as unknown as Config;
};

class FileSystem {
  private logger: Logger;
  constructor(logger: Logger) {
    this.logger = logger;
  }
  public async ensureDir(dirPath: string): Promise<void> {
    await fs.mkdir(dirPath, { recursive: true });
  }
  public async writeFile(filePath: string, content: string): Promise<void> {
    await fs.writeFile(filePath, content, 'utf-8');
  }
  public async findFiles(includes: string[] | undefined, excludes: string[]): Promise<string[]> {
    const defaultIncludes = ['**/*.ts', '**/*.tsx'];
    const includePatterns = includes || defaultIncludes;
    this.logger.debug('Searching files with include patterns:', includePatterns);
    this.logger.debug('Excluding files with patterns:', excludes);
    const allFiles = await glob(includePatterns, { ignore: excludes, absolute: true });
    const filteredFiles = allFiles.filter((file) => {
      const isExcluded = excludes.some((excludePattern) => picomatch.isMatch(file, excludePattern));
      return !isExcluded;
    });
    this.logger.debug('Matched Files:', filteredFiles);
    return filteredFiles;
  }
}

class CodeAnalyzer {
  constructor() {}
  public async analyzeClasses(files: string[]): Promise<ClassInfo[]> {
    const project = new Project({
      compilerOptions: {
        module: ModuleKind.ESNext,
        moduleResolution: ModuleResolutionKind.Bundler,
        target: ScriptTarget.ESNext,
      },
    });
    const sourceFiles: SourceFile[] = files.map((file) => project.addSourceFileAtPath(file));
    const classes: ClassInfo[] = [];
    for (const sourceFile of sourceFiles) {
      const fileClasses = sourceFile.getClasses();
      for (const classDeclaration of fileClasses) {
        const methods = classDeclaration
          .getMethods()
          .filter((method) => {
            const modifiers = method.getModifiers().map((mod) => mod.getKind());
            return modifiers.includes(tsSyntaxKind.PublicKeyword) && !method.isStatic();
          })
          .map((method) => method.getName());

        classes.push({
          name: classDeclaration.getName()!,
          path: sourceFile.getFilePath(),
          methods,
        });
      }
    }
    return classes;
  }
}

class CodeGenerator {
  private fileSystem: FileSystem;
  private logger: Logger;
  private proxyType: 'cast' | 'proxy';
  constructor(fileSystem: FileSystem, logger: Logger, proxyType: 'cast' | 'proxy') {
    this.fileSystem = fileSystem;
    this.logger = logger;
    this.proxyType = proxyType;
  }
  public async generateCode(classes: ClassInfo[], outputFile: string): Promise<void> {
    if (!classes.length) {
      this.logger.warn('No classes to generate code for.');
      await this.fileSystem.writeFile(outputFile, this.generateEmptyOutput());
      return;
    }
    const imports = this.generateImports(classes, outputFile);
    const classProperties = this.generateClassProperties(classes);
    const classInits = this.generateClassInits(classes);
    const outputCode = `// This file is auto-generated by rpc-nats-alvamind
import { RPCClient${this.proxyType === 'proxy' ? ', ClassTypeProxy' : ''} } from 'rpc-nats-alvamind';
${imports}
export class RPCServices {
${classProperties}
    constructor(private rpcClient: RPCClient) {
${classInits}
    }
}`;
    this.logger.debug('Generated code:', outputCode);
    await this.fileSystem.writeFile(outputFile, outputCode);
  }

  private generateImports(classes: ClassInfo[], outputFile: string): string {
    return classes
      .map((c) => {
        const importPath = path.relative(path.dirname(outputFile), c.path).replace(/\\/g, '/').replace(/\.ts$/, '');
        return `import { ${c.name} } from '${importPath}';`;
      })
      .join('\n');
  }

  private generateClassProperties(classes: ClassInfo[]): string {
    if (this.proxyType === 'proxy') {
      return classes.map((c) => `    ${c.name}: ClassTypeProxy<${c.name}>;`).join('\n');
    }
    return classes.map((c) => `    ${c.name}: ${c.name};`).join('\n');
  }

  private generateClassInits(classes: ClassInfo[]): string {
    if (this.proxyType === 'proxy') {
      return classes.map((c) => `        this.${c.name} = this.rpcClient.createProxy(${c.name});`).join('\n');
    }
    return classes
      .map((c) => `        this.${c.name} = this.rpcClient.createProxy(${c.name}) as unknown as ${c.name};`)
      .join('\n');
  }

  public generateEmptyOutput(): string {
    return `// This file is auto-generated by rpc-nats-alvamind
import { RPCClient } from 'rpc-nats-alvamind';
export class RPCServices {
    constructor(private rpcClient: RPCClient) {}
}`;
  }
}

export async function main(config: Config) {
  const logger = new Logger(config.logLevel);
  logger.info('Configuration: ', config);
  const fileSystem = new FileSystem(logger);
  const codeAnalyzer = new CodeAnalyzer();
  const codeGenerator = new CodeGenerator(fileSystem, logger, config.proxyType);
  const generate = async () => {
    const startTime = Date.now();
    logger.info('Starting RPC services generation...');
    try {
      await fileSystem.ensureDir(path.dirname(config.output));
      const files = await fileSystem.findFiles(config.includes, config.excludes);
      if (!files.length) {
        logger.warn('No files found with provided includes/excludes.');
        await fileSystem.writeFile(config.output, codeGenerator.generateEmptyOutput());
        return;
      }
      logger.info(`Files Scanned: ${files.length}`);
      logger.debug('Matched files:', files);
      const classes = await codeAnalyzer.analyzeClasses(files);
      logger.info(`Classes detected: ${classes.length}`);
      logger.debug('Detected classes:', classes);
      await codeGenerator.generateCode(classes, config.output);
      logger.info(`Generated ${config.output} with ${classes.length} services.`);
    } catch (error) {
      logger.error('Error during generation:', error);
    } finally {
      const endTime = Date.now();
      const duration = (endTime - startTime) / 1000;
      logger.info(`Completed in ${duration.toFixed(2)} seconds.`);
    }
  };

  await generate();

  if (config.watch) {
    const watcher = chokidar.watch(config.includes || ['**/*'], {
      ignored: config.excludes,
      ignoreInitial: true,
    });
    const debouncedGenerate = debounce(generate, 300);
    watcher.on('all', (event, path) => {
      logger.info(`File changed: ${path}, event: ${event}. Regenerating...`);
      debouncedGenerate();
    });
    logger.info('Watching for changes...');
  }
}

if (require.main === module) {
  const config = parseArgs();
  main(config).catch(console.error);
}
