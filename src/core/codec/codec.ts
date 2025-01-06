import { NatsCodec } from "./codec.interface";
import { JsonCodec } from "./json-codec";
import { StringCodec } from "./string-codec";

export type SupportedCodec = 'json' | 'string';

export const getCodec = <T = unknown>(codec: SupportedCodec | NatsCodec<T> = "json"): NatsCodec<T> => {
  if (typeof codec === "string"){
    if (codec === "string") {
      return new StringCodec<T>();
    }

    if(codec === "json")
    return new JsonCodec<T>();
  }

  return codec;
}