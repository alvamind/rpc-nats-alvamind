import { NatsCodec } from './codec.interface';

export class JsonCodec<T> implements NatsCodec<T> {
  encode(data: T): Uint8Array {
    const serialized = JSON.stringify(data, (_, value) => {
      if (value instanceof Date) {
        return { __type: 'Date', value: value.toISOString() };
      }
      if (typeof value === 'bigint') {
        return { __type: 'BigInt', value: value.toString() };
      }
      if (value instanceof Map) {
        return { __type: 'Map', value: Array.from(value.entries()) };
      }
      if (value instanceof Set) {
        return { __type: 'Set', value: Array.from(value) };
      }
      return value;
    });
    return new TextEncoder().encode(serialized);
  }

  decode(data: Uint8Array): T {
    return JSON.parse(new TextDecoder().decode(data), (_, value) => {
      if (value && typeof value === 'object') {
        switch (value.__type) {
          case 'Date':
            return new Date(value.value);
          case 'BigInt':
            return BigInt(value.value);
          case 'Map':
            return new Map(value.value);
          case 'Set':
            return new Set(value.value);
        }
      }
      return value;
    });
  }
}
