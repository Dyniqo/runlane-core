import { RuntimeConfigService } from '@runlane/config';
import { NestFactory } from '@nestjs/core';
import { ApiModule } from './api.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(ApiModule);
  const config = app.get(RuntimeConfigService);
  await app.listen(config.apiPort, config.apiHost);
}

void bootstrap();
