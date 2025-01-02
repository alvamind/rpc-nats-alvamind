import { MethodMetadata } from "./types";
import { getAllInterfaceMethods } from "./utils";
export function generateNatsSubject(className: string, methodName: string, pattern: (className: string, methodName: string) => string): string {
    return pattern(className,methodName)
}
export function getAllControllerMethods(instance: any,pattern:(className: string, methodName: string) => string): MethodMetadata[]{
  const methods = getAllInterfaceMethods(instance.constructor);
    return methods.map((method) => ({
        ...method,
        subject:generateNatsSubject(instance.constructor.name, method.key, pattern)
    }));
}
