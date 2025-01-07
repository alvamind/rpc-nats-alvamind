#!/usr/bin/env node
"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const yargs_1 = __importDefault(require("yargs"));
const helpers_1 = require("yargs/helpers");
const glob_1 = __importDefault(require("glob"));
const promises_1 = __importDefault(require("node:fs/promises"));
const ts_morph_1 = require("ts-morph");
const node_path_1 = __importDefault(require("node:path"));
const chokidar_1 = __importDefault(require("chokidar"));
const lodash_1 = require("lodash");
const argv = (0, yargs_1.default)((0, helpers_1.hideBin)(process.argv))
    .command('generate', 'Generate rpc-services.ts file', (yargs) => {
    yargs
        .option('includes', {
        type: 'string',
        describe: 'Glob patterns for including files',
        demandOption: true,
        array: true,
    })
        .option('excludes', {
        type: 'string',
        describe: 'Glob patterns for excluding files',
        default: [],
        array: true,
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
function generateRpcServices(includes, excludes, outputFile) {
    return __awaiter(this, void 0, void 0, function* () {
        const startTime = Date.now();
        console.info('Starting RPC services generation...');
        let files = [];
        try {
            files = includes.reduce((acc, include) => {
                const matchedFiles = glob_1.default.sync(include, { ignore: excludes });
                return [...acc, ...matchedFiles];
            }, []);
            if (!files.length) {
                console.warn('No files found with provided includes/excludes.');
                return;
            }
            console.info(`Files Scanned: ${files.length}`);
            console.debug('Matched files:', files);
        }
        catch (error) {
            console.error('Error scanning files:', error);
            return;
        }
        let classes = [];
        try {
            const project = new ts_morph_1.Project({
                tsConfigFilePath: node_path_1.default.join(process.cwd(), 'tsconfig.json'),
            });
            project.addSourceFilesAtPaths(files);
            classes = project.getSourceFiles().reduce((acc, sourceFile) => {
                const foundClasses = sourceFile.getClasses().map((c) => ({
                    name: c.getName(),
                    path: sourceFile.getFilePath(),
                }));
                return [...acc, ...foundClasses];
            }, []);
            if (!classes.length) {
                console.warn('No classes found in provided files.');
                return;
            }
            console.info(`Classes detected: ${classes.length}`);
            console.debug('Detected classes:', classes);
        }
        catch (error) {
            console.error('Error detecting classes:', error);
            return;
        }
        try {
            const project = new ts_morph_1.Project({
                tsConfigFilePath: node_path_1.default.join(process.cwd(), 'tsconfig.json'),
            });
            const classImports = classes
                .map((c) => {
                const sourceFile = project.addSourceFileAtPath(c.path);
                const importPath = sourceFile.getRelativePathAsModuleSpecifierTo(node_path_1.default.join(process.cwd(), outputFile));
                return `import { ${c.name} } from '${importPath}';`;
            })
                .join('\n');
            console.debug('Generated imports:', classImports);
            const classProperties = classes
                .map((c) => `${c.name.replace(/Controller$/, 'Controller')}: ClassTypeProxy<${c.name}>;`)
                .join('\n');
            const classInits = classes
                .map((c) => `this.${c.name.replace(/Controller$/, 'Controller')} = this.rpcClient.createProxy(${c.name});`)
                .join('\n');
            const outputCode = `
    // This file is auto-generated by rpc-nats-alvamind
    import { RPCClient, ClassTypeProxy } from 'rpc-nats-alvamind';
    ${classImports}

    export class RPCServices {
        ${classProperties}
      constructor(private rpcClient: RPCClient) {
        ${classInits}
      }
    }
    `;
            yield promises_1.default.writeFile(outputFile, outputCode, 'utf-8');
            console.info(`Generated ${outputFile} with ${classes.length} services.`);
            console.debug('Generated code:', outputCode);
        }
        catch (error) {
            console.error('Error writing the output file:', error);
            return;
        }
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;
        console.info(`Completed in ${duration.toFixed(2)} seconds.`);
    });
}
function generateRpcServicesWithWatch(includes, excludes, outputFile) {
    return __awaiter(this, void 0, void 0, function* () {
        let initialGenerationDone = false;
        const project = new ts_morph_1.Project({
            tsConfigFilePath: node_path_1.default.join(process.cwd(), 'tsconfig.json'),
        });
        const generateAndLog = () => __awaiter(this, void 0, void 0, function* () {
            yield generateRpcServices(includes, excludes, outputFile);
            if (!initialGenerationDone) {
                initialGenerationDone = true;
                console.info('Initial generation done. Watching for changes...');
            }
            else {
                console.info('Changes detected, Regenerated rpc-services.ts');
            }
        });
        const debouncedGenerate = (0, lodash_1.debounce)(generateAndLog, 300);
        const watcher = chokidar_1.default.watch(includes, {
            ignored: excludes,
            ignoreInitial: true,
        });
        watcher.on('add', (filePath) => {
            console.debug(`File added: ${filePath}`);
            project.addSourceFileAtPath(filePath);
            debouncedGenerate();
        });
        watcher.on('change', (filePath) => {
            console.debug(`File changed: ${filePath}`);
            project.addSourceFileAtPath(filePath);
            debouncedGenerate();
        });
        watcher.on('unlink', (filePath) => {
            console.debug(`File removed: ${filePath}`);
            const sourceFile = project.getSourceFile(filePath);
            if (sourceFile) {
                project.removeSourceFile(sourceFile);
            }
            debouncedGenerate();
        });
        generateAndLog();
    });
}
if (argv._.includes('generate')) {
    if (argv.watch) {
        generateRpcServicesWithWatch(argv.includes, argv.excludes, argv.output);
    }
    else {
        generateRpcServices(argv.includes, argv.excludes, argv.output);
    }
}
