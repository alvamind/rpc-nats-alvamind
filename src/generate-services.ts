#!/usr/bin/env node

// src/generate-services.ts

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
import { ModuleKind, ModuleResolutionKind, ScriptTarget } from 'typescript';

// --- Interfaces ---
interface ClassInfo {
  name: string;
  path: string;
  methods: string[];
}

// --- Logging ---
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

// --- Argument Parsing ---
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

// --- File System Operations ---
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
    const defaultIncludes = ['**/*'];
    const effectiveIncludes = includes && includes.length > 0 ? includes : defaultIncludes;
    const defaultExcludes = ['**/node_modules/**', '**/dist/**', '**/build/**'];
    const allExcludes = [...defaultExcludes, ...excludes];

    this.logger.debug('Search configuration:', {
      effectiveIncludes,
      allExcludes,
      cwd: process.cwd(),
    });

    const allFiles = await effectiveIncludes.reduce<Promise<string[]>>(async (acc, include) => {
      const accumulated = await acc;
      let patterns: string[] = [];

      this.logger.debug(`Processing include pattern: ${include}`);

      if (path.isAbsolute(include)) {
        patterns = [include];
      } else if (include.includes('/') || include.includes('\\')) {
        patterns = [path.join(process.cwd(), include)];
      } else {
        patterns = [path.join(process.cwd(), '**', include), path.join(process.cwd(), include)];
      }

      patterns = patterns.map((p) => p.replace(/\\/g, '/'));
      this.logger.debug('Normalized patterns:', patterns);

      const matchedFiles = await Promise.all(
        patterns.map(async (pattern) => {
          const files = await glob(pattern, {
            ignore: allExcludes,
            nodir: true,
            absolute: true,
            follow: false,
            dot: false,
          });
          this.logger.debug(`Files matched for pattern ${pattern}:`, files);
          return files;
        }),
      );

      const files = matchedFiles.flat();
      this.logger.debug(`Total files found for ${include}:`, files.length);
      this.logger.debug('Files:', files);

      return [...accumulated, ...files];
    }, Promise.resolve([]));

    const uniqueFiles = [...new Set(allFiles)];
    this.logger.debug('Unique files before exclusion:', uniqueFiles);

    const isExcluded = picomatch(allExcludes, { matchBase: true });
    const finalFiles = uniqueFiles.filter((file) => !isExcluded(file));

    this.logger.debug('Final files after exclusion:', finalFiles);
    this.logger.debug('Total files found:', finalFiles.length);
    return finalFiles;
  }
}

// --- Code Analysis ---
class CodeAnalyzer {
  private project: Project;
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
    this.project = new Project({
      tsConfigFilePath: path.join(process.cwd(), 'tsconfig.json'),
      compilerOptions: {
        experimentalDecorators: true,
        emitDecoratorMetadata: true,
        declaration: true,
        moduleResolution: ModuleResolutionKind.Node16,
        target: ScriptTarget.ES2015,
        module: ModuleKind.CommonJS,
      },
      skipAddingFilesFromTsConfig: true,
      skipFileDependencyResolution: true,
    });
  }

  async analyzeClasses(files: string[], _includes: string[] | undefined, excludes: string[]): Promise<ClassInfo[]> {
    this.logger.debug('Analyzing files:', files);

    this.project.getSourceFiles().forEach((file) => {
      this.project.removeSourceFile(file);
    });

    try {
      const sourceFiles = this.project.addSourceFilesAtPaths(files);
      this.logger.debug(`Added ${sourceFiles.length} source files to the project`);

      const isExcluded = picomatch(excludes, { matchBase: true });

      const results = await Promise.all(
        sourceFiles.map(async (sourceFile) => {
          const filePath = sourceFile.getFilePath();
          this.logger.debug(`Processing file: ${filePath}`);

          if (isExcluded(filePath)) {
            this.logger.debug(`Skipping excluded file: ${filePath}`);
            return [];
          }

          const exportedClasses = this.extractExportedClasses(sourceFile);
          this.logger.debug(`Found ${exportedClasses.length} classes in ${filePath}`);
          return exportedClasses;
        }),
      );

      return results.flat();
    } catch (error) {
      this.logger.error('Error analyzing classes:', error);
      throw error;
    }
  }

  private extractExportedClasses(sourceFile: SourceFile): ClassInfo[] {
    const classes: ClassInfo[] = [];

    sourceFile.getClasses().forEach((classDecl) => {
      if (classDecl.isExported() && !classDecl.isAbstract()) {
        const className = classDecl.getName();
        if (className) {
          const methods = classDecl
            .getMethods()
            .filter((method) => !method.getModifiers().some((mod) => mod.getText() === 'private'))
            .map((method) => method.getName());

          classes.push({
            name: className,
            path: sourceFile.getFilePath(),
            methods,
          });
        }
      }
    });

    return classes;
  }
}

// --- Code Generator ---
class CodeGenerator {
  private fileSystem: FileSystem;
  private logger: Logger;

  constructor(fileSystem: FileSystem, logger: Logger) {
    this.fileSystem = fileSystem;
    this.logger = logger;
  }

  async generateCode(classes: ClassInfo[], outputFile: string): Promise<void> {
    if (!classes.length) {
      this.logger.warn('No classes found in provided files.');
      await this.fileSystem.writeFile(outputFile, this.generateEmptyOutput('No classes'));
      return;
    }

    const classImports = this.generateImports(classes, outputFile);
    this.logger.debug('Generated imports:', classImports);

    const classProperties = this.generateClassProperties(classes);
    const classInits = this.generateClassInits(classes);

    const outputCode = `// This file is auto-generated by rpc-nats-alvamind
import { RPCClient, ClassTypeProxy } from 'rpc-nats-alvamind';
${classImports}

/**
 * RPC Services
 * ${classes
   .map(
     (c) => `
 * @property ${c.name}
 * Available Methods: ${c.methods.join(', ')}
 *`,
   )
   .join('\n')}
 */
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
    return classes.map((c) => `    ${c.name}: ClassTypeProxy<${c.name}>;`).join('\n');
  }

  private generateClassInits(classes: ClassInfo[]): string {
    return classes.map((c) => `        this.${c.name} = this.rpcClient.createProxy(${c.name});`).join('\n');
  }

  public generateEmptyOutput(reason: string): string {
    return `// This file is auto-generated by rpc-nats-alvamind
// No ${reason} found with provided includes/excludes.

import { RPCClient, ClassTypeProxy } from 'rpc-nats-alvamind';

export class RPCServices {
    constructor(private rpcClient: RPCClient) {}
}`;
  }
}

// --- Main ---
export async function main(config: Config) {
  const logger = new Logger(config.logLevel);
  logger.info('Configuration: ', config);

  const fileSystem = new FileSystem(logger);
  const codeAnalyzer = new CodeAnalyzer(logger);
  const codeGenerator = new CodeGenerator(fileSystem, logger);

  const generate = async () => {
    const startTime = Date.now();
    logger.info('Starting RPC services generation...');
    try {
      await fileSystem.ensureDir(path.dirname(config.output));
      const files = await fileSystem.findFiles(config.includes, config.excludes);

      if (!files.length) {
        logger.warn('No files found with provided includes/excludes.');
        await fileSystem.writeFile(config.output, codeGenerator.generateEmptyOutput('files'));
        return;
      }

      logger.info(`Files Scanned: ${files.length}`);
      logger.debug('Matched files:', files);
      const includes = config.includes || []; // Use empty array if undefined
      const classes = await codeAnalyzer.analyzeClasses(files, includes, config.excludes);
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

// this is to make it executable
if (require.main === module) {
  const config = parseArgs();
  main(config).catch(console.error);
}
