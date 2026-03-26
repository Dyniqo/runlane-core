import { Module } from '@nestjs/common';
import { NOTIFICATION_CONNECTOR } from '@runlane/application';
import { RunlaneConfigModule } from '@runlane/config';
import { RunlaneCryptoModule } from '../crypto';
import { RunlaneSecretsModule } from '../secrets';
import { SlackDiscordNotificationConnector } from './slack-discord-notification.connector';

@Module({
  imports: [RunlaneConfigModule, RunlaneCryptoModule, RunlaneSecretsModule],
  providers: [
    SlackDiscordNotificationConnector,
    {
      provide: NOTIFICATION_CONNECTOR,
      useExisting: SlackDiscordNotificationConnector,
    },
  ],
  exports: [NOTIFICATION_CONNECTOR, SlackDiscordNotificationConnector],
})
export class RunlaneNotificationModule {}
