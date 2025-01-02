import 'reflect-metadata';
import { NatsRpc } from './nats-rpc';
interface MethodMetadata {
  key: string;
  subject: string;
}
export function createProxyController<T>(controller: T, nats: NatsRpc): T {
  const handler = {
    get(target: any, prop: string, receiver: any) {
      if (typeof target[prop] === 'function') {
        return async (...args: any[]) => {
          const subjectPattern = nats.getOptions.subjectPattern;
          if (!subjectPattern) {
            throw new Error('Subject pattern is undefined');
          }
          const subject = subjectPattern(target.constructor.name, prop);
          return nats.call(subject, args[0]);
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  };
  return new Proxy(controller, handler) as T;
}
