#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
// Ubah agar bisa mengakses directory project yang menggunakan package
const projectDir = process.cwd();
function generateSourceCodeMarkdown() {
    return __awaiter(this, arguments, void 0, function* (outputFilename = 'source-code.md', customInclude = [], customExclude = []) {
        const excludedPathsAndFiles = [
            'node_modules',
            '.git',
            'generate-source.ts',
            '.zed-settings.json',
            '.vscode/settings.json',
            'package-lock.json',
            'src/common/dtos/generated',
            'src/persistence/seed.ts',
            'bun.lockb',
            'src/common/exceptions',
            'prisma/schema.prisma',
            'build',
            'documentation/tsyringe-neo.md',
            'src/common/utils',
            outputFilename,
            ...customExclude,
        ];
        const defaultExcludes = [/\.route\.ts$/, /\.test\.ts$/];
        // Updated regex to handle both single-line and multi-line comments
        const singleLineCommentRegex = /^\s*\/\/.*$/gm;
        const multiLineCommentRegex = /\/\*[\s\S]*?\*\//g;
        let allPaths = [];
        let allFiles = [];
        function isExcluded(filePath) {
            const normalizedFilePath = path.normalize(filePath);
            if (excludedPathsAndFiles.includes(normalizedFilePath)) {
                return true;
            }
            if (excludedPathsAndFiles.some((excludedPath) => normalizedFilePath.startsWith(path.normalize(excludedPath) + '/'))) {
                return true;
            }
            const isDefaultExcluded = defaultExcludes.some((regex) => regex.test(normalizedFilePath));
            if (isDefaultExcluded && !customInclude.some((include) => normalizedFilePath.endsWith(include))) {
                return true;
            }
            return false;
        }
        function traverseDir(dir) {
            // Ubah untuk menggunakan projectDir
            const entries = fs.readdirSync(path.join(projectDir, dir), { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (isExcluded(fullPath)) {
                    continue;
                }
                if (entry.isDirectory()) {
                    allPaths.push(fullPath);
                    traverseDir(fullPath);
                }
                else if (entry.isFile()) {
                    allFiles.push(fullPath);
                }
            }
        }
        traverseDir('.');
        const filteredPaths = allPaths.filter((p) => !isExcluded(p));
        const filteredFiles = allFiles.filter((f) => !isExcluded(f));
        let output = filteredPaths.join('\n') + '\n====================\n';
        let totalLines = 0;
        for (const file of filteredFiles) {
            output += `// ${file}\n`;
            // Ubah untuk menggunakan projectDir
            let content = fs.readFileSync(path.join(projectDir, file), 'utf-8');
            // Remove both types of comments
            content = content.replace(multiLineCommentRegex, '');
            content = content.replace(singleLineCommentRegex, '');
            // Remove empty lines that might be left after removing comments
            content = content.replace(/^\s*[\r\n]/gm, '');
            const lines = content.split('\n');
            totalLines += lines.length;
            output += content + '\n';
        }
        // Ubah untuk menggunakan projectDir
        fs.writeFileSync(path.join(projectDir, outputFilename), output);
        console.log(`Source code info written to ${outputFilename}. Total lines: ${totalLines}`);
    });
}
// Ubah agar bisa menerima parameter dari CLI
const args = process.argv.slice(2);
let outputFilename = 'source-code.md';
let customInclude = [];
let customExclude = [];
args.forEach((arg) => {
    if (arg.startsWith('output=')) {
        outputFilename = arg.split('=')[1];
    }
    else if (arg.startsWith('include=')) {
        customInclude = arg.split('=')[1].split(',');
    }
    else if (arg.startsWith('exclude=')) {
        customExclude = arg.split('=')[1].split(',');
    }
});
generateSourceCodeMarkdown(outputFilename, customInclude, customExclude).catch((err) => console.error('Error:', err));
