import { Global, Module } from '@nestjs/common';
import { RuntimeConfigService } from './runtime-config.service';
import { runtimeEnvironmentProvider } from './runtime-environment.provider';

@Global()
@Module({
  providers: [runtimeEnvironmentProvider, RuntimeConfigService],
  exports: [RuntimeConfigService],
})
export class RunlaneConfigModule {}
