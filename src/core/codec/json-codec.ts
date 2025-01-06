import { NatsCodec } from './codec.interface';

export class JsonCodec<T> implements NatsCodec<T> {
  encode(data: T): Uint8Array {
    return new TextEncoder().encode(JSON.stringify(data));
  }

  decode(data: Uint8Array): T {
    return JSON.parse(new TextDecoder().decode(data));
  }
}