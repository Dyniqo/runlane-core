import { Module } from '@nestjs/common';
import { HTTP_CONNECTOR } from '@runlane/application';
import { RunlaneConfigModule } from '@runlane/config';
import { RunlaneCryptoModule } from '../../crypto';
import { RunlaneSecretsModule } from '../../secrets';
import { SecureHttpConnector } from './secure-http-connector';

@Module({
  imports: [RunlaneConfigModule, RunlaneCryptoModule, RunlaneSecretsModule],
  providers: [
    SecureHttpConnector,
    {
      provide: HTTP_CONNECTOR,
      useExisting: SecureHttpConnector,
    },
  ],
  exports: [HTTP_CONNECTOR, SecureHttpConnector],
})
export class RunlaneHttpConnectorModule {}
