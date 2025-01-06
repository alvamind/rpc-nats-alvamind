import { NatsCodec } from './codec.interface';
import { StringCodec as NatsStringCodec } from 'nats';

export class StringCodec<T> implements NatsCodec<T> {
  private stringCodec = NatsStringCodec();

  encode(data: T): Uint8Array {
    return this.stringCodec.encode(String(data));
  }

  decode(data: Uint8Array): T {
    return this.stringCodec.decode(data) as T;
  }
}