import { NestFactory } from '@nestjs/core';
import { ApiModule } from './api.module';

const API_HOST = '0.0.0.0';
const API_PORT = 4600;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(ApiModule);
  await app.listen(API_PORT, API_HOST);
}

void bootstrap();
