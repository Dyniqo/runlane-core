import type {
  AiProviderStructuredResponseRequest,
  AiProviderStructuredResponseResult,
} from '@runlane/contracts';

export const AI_PROVIDER = Symbol('AI_PROVIDER');

export interface AiProviderPort {
  generateStructuredResponse(
    input: AiProviderStructuredResponseRequest,
  ): Promise<AiProviderStructuredResponseResult>;
}
