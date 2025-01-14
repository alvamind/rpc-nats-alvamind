import { LogLevel } from "../core/utils/logger";

export const defaultNatsOptions = {
  url: "nats://localhost:4222",
  logLevel: 'info' as LogLevel
};
export type MethodType = (...args: any[]) => Promise<any>;

export type NatsOptions = {
  url?: string,
  codec?: "json" | "string",
  debug?: boolean
  logLevel?: LogLevel
};
export interface Config {
  includes?: string[];
  excludes: string[];
  output: string;
  watch: boolean;
  logLevel: string;
}



//================================================

export type ClassType = {
  [key: string | symbol]: any;
};

export type TransformToPromise<T extends ClassType> = {
  [K in keyof T]: T[K] extends (...args: infer Args) => infer R
  ? (...args: Args) => Promise<R>
  : T[K];
};

export type ClassTypeProxy<T extends ClassType> = TransformToPromise<T>;
