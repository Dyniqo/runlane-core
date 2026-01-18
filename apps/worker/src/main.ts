import { bootstrapHttpRuntime } from '@runlane/infrastructure';
import { WorkerModule } from './worker.module';

void bootstrapHttpRuntime({
  module: WorkerModule,
  serviceName: 'worker',
  resolveEndpoint: (config) => ({
    host: config.workerHost,
    port: config.workerPort,
  }),
});
