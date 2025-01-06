export const defaultNatsOptions = {
  url: "nats://localhost:4222",
};

export type MethodType = (...args: any[]) => Promise<any>;

export type ClassType = {
  [key: string | symbol]: any
};

export type ClassTypeProxy<T extends ClassType> = {
  [K in keyof T]: T[K] extends (...args: infer Args) => Promise<infer R>
  ? (...args: Args) => Promise<R>
  : never;
};

export type NatsOptions = {
  url?: string,
  codec?: "json" | "string",
  debug?: boolean
};
