import * as fs from 'fs/promises';
import * as path from 'path';
import { ClassInfo, MethodInfo } from './types';

export class NatsScanner {
  static async scanClasses(
    dir: string,
    excludeDir: string[] = ['node_modules', 'dist', 'build'],
  ): Promise<ClassInfo[]> {
    const classInfos: ClassInfo[] = [];
    try {
      const files = await fs.readdir(dir);
      for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = await fs.stat(filePath);

        if (stat.isDirectory()) {
          const isExcluded = excludeDir.some((excluded) => filePath.includes(excluded));
          if (isExcluded) {
            continue;
          }
          const nestedClasses = await this.scanClasses(filePath, excludeDir);
          classInfos.push(...nestedClasses);
          continue;
        }

        if (file.endsWith('.ts') || file.endsWith('.js')) {
          const absoluteFilePath = path.resolve(filePath); // <--- Make absolute path
          const module = await import(absoluteFilePath); // <---- Use absolute path for import
          for (const key in module) {
            if (typeof module[key] === 'function') {
              const target = module[key];
              const methods = this.getMethodInfo(target);
              classInfos.push({
                className: target.name,
                methods,
              });
            }
          }
        }
      }
    } catch (error) {
      console.error(`[NATS] Error scanning classes in ${dir}:`, error);
      throw error;
    }
    return classInfos;
  }

  static getMethodInfo(target: any): MethodInfo[] {
    const methods: MethodInfo[] = [];
    if (!target || !target.prototype) return methods;
    for (const key of Object.getOwnPropertyNames(target.prototype)) {
      if (key === 'constructor' || typeof target.prototype[key] !== 'function') continue;
      methods.push({ methodName: key, func: target.prototype[key] });
    }
    return methods;
  }
}
