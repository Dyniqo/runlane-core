import { Module } from '@nestjs/common';
import { AI_PROVIDER } from '@runlane/application';
import { RunlaneConfigModule } from '@runlane/config';
import { OpenAiCompatibleProvider } from './openai-compatible-ai-provider';

@Module({
  imports: [RunlaneConfigModule],
  providers: [
    OpenAiCompatibleProvider,
    {
      provide: AI_PROVIDER,
      useExisting: OpenAiCompatibleProvider,
    },
  ],
  exports: [AI_PROVIDER, OpenAiCompatibleProvider],
})
export class RunlaneAiModule {}
