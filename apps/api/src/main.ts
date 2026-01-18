import { bootstrapHttpRuntime } from '@runlane/infrastructure';
import { ApiModule } from './api.module';

void bootstrapHttpRuntime({
  module: ApiModule,
  serviceName: 'api',
  resolveEndpoint: (config) => ({
    host: config.apiHost,
    port: config.apiPort,
  }),
});
