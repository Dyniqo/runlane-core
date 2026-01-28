export const API_KEY_TOKEN_SERVICE = Symbol('API_KEY_TOKEN_SERVICE');

export interface GeneratedApiKeyToken {
  readonly token: string;
  readonly prefix: string;
}

export interface ApiKeyTokenServicePort {
  generate(): GeneratedApiKeyToken;
  readPrefix(apiKey: string): string;
  hash(apiKey: string): Promise<string>;
  verify(apiKey: string, expectedHash: string): Promise<boolean>;
}
