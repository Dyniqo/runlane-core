export type JsonPrimitive = boolean | null | number | string;

export interface JsonObject {
  readonly [key: string]: JsonValue;
}

export type JsonArray = readonly JsonValue[];

export type JsonValue = JsonArray | JsonObject | JsonPrimitive;
