import { MethodMetadata } from './types';
export declare function generateNatsSubject(className: string, methodName: string, pattern: (className: string, methodName: string) => string): string;
export declare function getAllControllerMethods(instance: any, pattern: (className: string, methodName: string) => string): MethodMetadata[];
