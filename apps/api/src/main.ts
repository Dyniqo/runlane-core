import { bootstrapHttpRuntime } from '@runlane/infrastructure';
import { ApiModule } from './api.module';
import { configureApiRuntime } from './configure-api-runtime';

void bootstrapHttpRuntime({
  module: ApiModule,
  serviceName: 'api',
  resolveEndpoint: (config) => ({
    host: config.apiHost,
    port: config.apiPort,
  }),
  configureApplication: configureApiRuntime,
});
