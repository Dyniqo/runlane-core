import { RuntimeConfigService } from '@runlane/config';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(WorkerModule);
  const config = app.get(RuntimeConfigService);
  await app.listen(config.workerPort, config.workerHost);
}

void bootstrap();
