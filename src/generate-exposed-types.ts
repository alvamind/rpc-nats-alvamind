import * as ts from "typescript";
import * as fs from "fs/promises";
import * as path from "path";
import { Logger, pino } from "pino";

interface TypeInformation {
  imports: Set<string>;
  methodParams: Map<string, Map<string, { type: string; name: string; optional: boolean }[]>>;
  methodReturns: Map<string, Map<string, string>>;
  localInterfaces: Set<string>;
}

interface MethodInfo {
  methodName: string;
}

interface ClassInfo {
  className: string;
  methods: MethodInfo[];
}

export async function generateExposedMethodsType(options: { scanPath: string }, outputPath: string = "src/generated/exposed-methods.d.ts", logger: Logger = pino({ level: "debug" })) {
  logger.info(`[NATS] generator version 22`);
  if (!options.scanPath) {
    logger.error(`[NATS] scanPath is required`);
    return;
  }

  try {
    const typeInfo = await extractTypeInformation(options.scanPath, outputPath, logger);
    const classInfos = await scanClasses(options.scanPath, logger);
    const interfaceString = generateInterfaceString(classInfos, typeInfo);

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, interfaceString, "utf-8");

    logger.info(`[NATS] Exposed method type generated successfully to ${outputPath}`);
  } catch (error) {
    logger.error(`[NATS] Error generating exposed methods types`, error);
    console.error(error);
  }
}

async function scanClasses(scanPath: string, logger: Logger): Promise<ClassInfo[]> {
  logger.debug(`[NATS] Scanning classes in ${scanPath}`);
  const scanPathDir = path.resolve(scanPath);
  const files = await fs.readdir(scanPathDir);
  const tsFiles = files.filter((file) => file.endsWith(".ts")).map((file) => path.join(scanPathDir, file));
  logger.debug(`[NATS] Found ${tsFiles.length} Typescript files in ${scanPath}`);
  const program = ts.createProgram(tsFiles, {});

  const classInfos: ClassInfo[] = [];
  for (const sourceFile of program.getSourceFiles()) {
    if (!tsFiles.includes(sourceFile.fileName)) continue;
    logger.debug(`[NATS] Processing file: ${sourceFile.fileName}`);
    ts.forEachChild(sourceFile, (node) => {
      if (ts.isClassDeclaration(node) && node.name) {
        const className = node.name.text;
        logger.debug(`[NATS] Found class: ${className}`);
        const methods: MethodInfo[] = [];
        node.members.forEach((member) => {
          if (ts.isMethodDeclaration(member) && member.name) {
            const methodName = ts.isIdentifier(member.name) ? member.name.text : member.name.getText();
            logger.debug(`[NATS] Found method: ${methodName} in class ${className}`);
            methods.push({ methodName });
          }
        });
        classInfos.push({ className, methods });
      }
    });
  }
  logger.debug(`[NATS] Finished scanning classes. Total class: ${classInfos.length}`);
  return classInfos;
}

async function extractTypeInformation(scanPath: string, outputPath: string, logger: Logger): Promise<TypeInformation> {
  logger.debug(`[NATS] Extracting type information in: ${scanPath}`);
  const scanPathDir = path.resolve(scanPath);
  const files = await fs.readdir(scanPathDir);
  const tsFiles = files.filter((file) => file.endsWith(".ts")).map((file) => path.join(scanPathDir, file));
  const program = ts.createProgram(tsFiles, {});
  const checker = program.getTypeChecker();
  const typeInfo: TypeInformation = {
    imports: new Set<string>(),
    methodParams: new Map(),
    methodReturns: new Map(),
    localInterfaces: new Set<string>(),
  };

  for (const sourceFile of program.getSourceFiles()) {
    if (!tsFiles.includes(sourceFile.fileName)) continue;
    logger.debug(`[NATS] Processing file: ${sourceFile.fileName}`);

    ts.forEachChild(sourceFile, (node) => {
      // First collect any interfaces defined in the file
      if (ts.isInterfaceDeclaration(node) && node.name) {
        const interfaceText = node.getText();
        typeInfo.localInterfaces.add(interfaceText);
        logger.debug(`[NATS] Found interface: ${node.name.text}`);
      }

      if (ts.isClassDeclaration(node) && node.name) {
        const className = node.name.text;
        logger.debug(`[NATS] Extracting method info from class: ${className}`);
        const methodParams = new Map<string, { type: string; name: string; optional: boolean }[]>();
        const methodReturns = new Map<string, string>();

        node.members.forEach((member) => {
          if (ts.isMethodDeclaration(member) && member.name) {
            const methodName = ts.isIdentifier(member.name) ? member.name.text : member.name.getText();
            logger.debug(`[NATS] Extracting type info for method: ${methodName} in class ${className}`);
            // Extract parameter type (all parameter)
            const params: { type: string; name: string; optional: boolean }[] = [];

            for (const param of member.parameters) {
              if (param.type && param.name) {
                params.push({ type: param.type.getText(), name: param.name.getText(), optional: !!param.questionToken });
                logger.debug(`[NATS] Parameter type for method ${methodName} is: ${param.type.getText()}`);
                collectImports(param.type, typeInfo.imports, logger, checker, outputPath, scanPath);
              }
            }
            methodParams.set(methodName, params);

            // Extract return type
            if (member.type) {
              const returnType = extractReturnType(member.type, checker);
              if (returnType) {
                methodReturns.set(methodName, returnType);
                logger.debug(`[NATS] Return type for method ${methodName} is: ${returnType}`);
                collectImports(member.type, typeInfo.imports, logger, checker, outputPath, scanPath);
              } else {
                methodReturns.set(methodName, "any");
                logger.debug(`[NATS] Return type for method ${methodName} is not promise, set to any`);
              }
            } else {
              methodReturns.set(methodName, "any");
              logger.debug(`[NATS] No return type found for method ${methodName} , set to any`);
            }
          }
        });

        typeInfo.methodParams.set(className, methodParams);
        typeInfo.methodReturns.set(className, methodReturns);
      }
    });
  }

  return typeInfo;
}

function collectImports(node: ts.Node, imports: Set<string>, logger: Logger, checker: ts.TypeChecker, outputPath: string, scanPath: string) {
  if (ts.isTypeReferenceNode(node)) {
    const symbol = node.typeName && ts.isIdentifier(node.typeName) ? node.typeName.text : undefined;
    if (symbol) {
      const typeName = symbol;
      logger.debug(`[NATS] Started collecting imports for type: ${typeName}`);

      // Find the symbol and its declarations
      if (node.typeName && ts.isIdentifier(node.typeName)) {
        try {
          const type = checker.getTypeAtLocation(node.typeName);
          logger.debug(`[NATS] Got type for ${typeName}:`, {
            hasType: !!type,
            hasSymbol: !!(type && type.symbol),
          });

          if (type && type.symbol) {
            const declarations = type.symbol.getDeclarations();
            logger.debug(`[NATS] Declarations for ${typeName}:`, {
              hasDeclarations: !!declarations,
              declarationCount: declarations?.length,
            });

            if (declarations && declarations.length > 0) {
              const declaration = declarations[0];
              const sourceFile = declaration.getSourceFile();
              logger.debug(`[NATS] Source file for ${typeName}:`, {
                fileName: sourceFile?.fileName,
                exists: !!sourceFile,
              });

              if (sourceFile) {
                // Skip TypeScript built-in types
                if (sourceFile.fileName.includes("node_modules/typescript/lib")) {
                  logger.debug(`[NATS] Skipping built-in type ${typeName} from ${sourceFile.fileName}`);
                  return;
                }

                // Skip utility types
                if (["Partial", "Omit", "Pick", "Record", "Exclude", "Extract"].includes(typeName)) {
                  logger.debug(`[NATS] Skipping utility type ${typeName}`);
                  return;
                }

                // Handle imports from any source file
                const modulePath = sourceFile.fileName;
                const relativePath = path.relative(path.dirname(outputPath), modulePath).replace(/\.ts$/, "");

                logger.debug(`[NATS] Import path resolution for ${typeName}:`, {
                  originalPath: modulePath,
                  outputPath: outputPath,
                  relativePath: relativePath
                });

                // Check if the type is already imported
                const isAlreadyImported = Array.from(imports).some(imp => imp.includes(`{ ${typeName} }`));
                logger.debug(`[NATS] Import status for ${typeName}:`, {
                  isAlreadyImported,
                  currentImports: Array.from(imports)
                });

                if (!isAlreadyImported) {
                  const importStatement = `import { ${typeName} } from '${relativePath}';`;
                  logger.debug(`[NATS] Adding import statement: ${importStatement}`);
                  imports.add(importStatement);
                }
              }
            }
          } else {
            logger.debug(`[NATS] No type or symbol found for ${typeName}`);
          }
        } catch (error) {
          logger.error(`[NATS] Error processing type ${typeName}:`, error);
        }
      }
    }
  }

  // Process type arguments for generic types
  if (ts.isTypeReferenceNode(node) && node.typeArguments) {
    logger.debug(`[NATS] Processing generic type arguments:`, {
      count: node.typeArguments.length
    });
    node.typeArguments.forEach((typeArg, index) => {
      logger.debug(`[NATS] Processing type argument ${index + 1}/${node.typeArguments!.length}`);
      collectImports(typeArg, imports, logger, checker, outputPath, scanPath);
    });
  }

  // Log node kind for debugging
  logger.debug(`[NATS] Node kind: ${ts.SyntaxKind[node.kind]}`);

  // Recursively process child nodes
  ts.forEachChild(node, (child: ts.Node) => {
    logger.debug(`[NATS] Processing child node`);
    collectImports(child, imports, logger, checker, outputPath, scanPath);
  });
}

function extractReturnType(node: ts.TypeNode, checker: ts.TypeChecker): string | null {
  if (ts.isTypeReferenceNode(node) && node.typeName.getText() === "Promise" && node.typeArguments && node.typeArguments.length > 0) {
    const promiseType = node.typeArguments[0];
    return checker.typeToString(checker.getTypeAtLocation(promiseType));
  } else {
    return checker.typeToString(checker.getTypeAtLocation(node));
  }
}

function generateInterfaceString(classInfos: ClassInfo[], typeInfo: TypeInformation): string {
  let output = "// Auto-generated by rpc-nats-alvamind\n\n";

  // Add imports
  if (typeInfo.imports.size > 0) {
    output += Array.from(typeInfo.imports).join("\n") + "\n\n";
  }

  output += "export interface ExposedMethods {\n";

  for (const classInfo of classInfos) {
    output += `  ${classInfo.className}: {\n`;
    const methodParams = typeInfo.methodParams.get(classInfo.className);
    const methodReturns = typeInfo.methodReturns.get(classInfo.className);

    for (const method of classInfo.methods) {
      const params = methodParams?.get(method.methodName) || [];
      const returnType = methodReturns?.get(method.methodName) || "any";
      const paramString = params.map((p) => `${p.name}${p.optional ? "?" : ""}: ${p.type}`).join(", ");

      output += `    ${method.methodName}(${paramString}): Promise<${returnType}>;\n`;
    }

    output += "  };\n";
  }

  output += "}\n";
  return output;
}

export async function generateTypeCli(scanPath: string, outputPath: string = "src/generated/exposed-methods.d.ts") {
  const logger = pino({ level: "debug" });
  await generateExposedMethodsType({ scanPath }, outputPath, logger);
}
