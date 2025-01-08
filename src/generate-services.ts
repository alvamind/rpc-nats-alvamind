#!/usr/bin/env node
// rpc-nats-alvamind/src/generate-services.ts
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { glob } from 'glob';
import fs from 'node:fs/promises';
import path from 'node:path';
import chokidar from 'chokidar';
import { debounce } from 'lodash';
import { Project, Node, SourceFile } from 'ts-morph';
import { minimatch } from 'minimatch';

// --- Interfaces ---
interface ClassInfo {
  name: string;
  path: string;
  methods: string[];
}

interface Config {
  includes: string[];
  excludes: string[];
  output: string;
  watch: boolean;
  logLevel: string;
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
          describe: 'Glob patterns for including files',
          demandOption: true,
          array: true,
          coerce: (arg: string | string[]) => (typeof arg === 'string' ? arg.split(/[,\s]+/).filter(Boolean) : arg),
        })
        .option('excludes', {
          type: 'string',
          describe: 'Glob patterns for excluding files',
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
  async ensureDir(dirPath: string): Promise<void> {
    await fs.mkdir(dirPath, { recursive: true });
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    await fs.writeFile(filePath, content, 'utf-8');
  }

  async findFiles(includes: string[], excludes: string[]): Promise<string[]> {
    const allFiles = await includes.reduce<Promise<string[]>>(async (acc, include) => {
      const accumulated = await acc;
      const matchedFiles = await glob(include, {
        ignore: excludes,
        nodir: true,
      });
      return [...accumulated, ...matchedFiles];
    }, Promise.resolve([]));

    const excludePatterns = excludes.flatMap((pattern) => glob.sync(pattern));

    return [...new Set(allFiles)].filter((file) => !excludePatterns.some((pattern) => minimatch(file, pattern)));
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
    });
  }

  async analyzeClasses(files: string[], includes: string[], excludes: string[]): Promise<ClassInfo[]> {
    this.project.addSourceFilesAtPaths(files);

    return this.project.getSourceFiles().reduce<ClassInfo[]>((acc, sourceFile) => {
      const filePath = sourceFile.getFilePath();
      const isIncluded = includes.some((pattern) => glob.sync(pattern).includes(filePath));
      const isExcluded = excludes.some((pattern) => glob.sync(pattern).includes(filePath));
      if (!isIncluded || isExcluded) {
        this.logger.debug('Skipping source file due to include/exclude:', filePath);
        return acc;
      }

      this.logger.debug('Processing source file:', filePath);
      const exportedClasses = this.extractExportedClasses(sourceFile);
      return [...acc, ...exportedClasses];
    }, []);
  }

  private extractExportedClasses(sourceFile: SourceFile): ClassInfo[] {
    const exportedDeclarations = sourceFile.getExportedDeclarations();
    this.logger.debug('Exported declarations:', exportedDeclarations.keys());

    const exportedClasses: ClassInfo[] = [];

    exportedDeclarations.forEach((declarations, exportName) => {
      declarations.forEach((declaration) => {
        let classDecl: Node | undefined = declaration;
        let isDefaultExport = false;

        if (Node.isExportAssignment(declaration)) {
          isDefaultExport = true;
          const expression = declaration.getExpression();
          if (Node.isClassExpression(expression) || Node.isIdentifier(expression)) {
            classDecl = Node.isIdentifier(expression) ? sourceFile.getClass(expression.getText()) : expression;
          }
        }

        if (Node.isClassDeclaration(classDecl) && !classDecl.isAbstract()) {
          if (classDecl.isExported() || isDefaultExport) {
            if (classDecl.getSourceFile() === sourceFile) {
              const methods = classDecl.getMethods().map((m) => m.getName());
              const className = classDecl.getName() || (exportName === 'default' ? 'DefaultExport' : exportName);

              exportedClasses.push({
                name: className,
                path: sourceFile.getFilePath(),
                methods,
              });
            }
          }
        }
      });
    });
    return exportedClasses;
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
async function main() {
  const config = parseArgs();
  const logger = new Logger(config.logLevel);
  logger.info('Configuration: ', config);

  const fileSystem = new FileSystem();
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

      const classes = await codeAnalyzer.analyzeClasses(files, config.includes, config.excludes);
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
    const watcher = chokidar.watch(config.includes, {
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

main().catch(console.error);
