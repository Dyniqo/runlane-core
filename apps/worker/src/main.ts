import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';

const WORKER_HOST = '0.0.0.0';
const WORKER_PORT = 4601;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(WorkerModule);
  await app.listen(WORKER_PORT, WORKER_HOST);
}

void bootstrap();
