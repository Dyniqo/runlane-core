import { VersioningType, type INestApplication } from '@nestjs/common';
import type { RuntimeConfigService } from '@runlane/config';
import { RUNLANE_API_VERSION, RUNLANE_PRODUCT_NAME } from '@runlane/contracts';
import { configureHttpSecurity } from '@runlane/infrastructure';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function configureApiRuntime(
  application: INestApplication,
  config: RuntimeConfigService,
): void {
  configureHttpSecurity(application, config);

  application.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: RUNLANE_API_VERSION,
  });

  if (!config.apiDocsEnabled) {
    return;
  }

  const documentConfig = new DocumentBuilder()
    .setTitle(`${RUNLANE_PRODUCT_NAME} API`)
    .setDescription('Workflow orchestration API')
    .setVersion(RUNLANE_API_VERSION)
    .addServer(config.apiUrl)
    .build();
  const document = SwaggerModule.createDocument(application, documentConfig, {
    operationIdFactory: (_controllerKey, methodKey) => methodKey,
  });

  SwaggerModule.setup(config.apiDocsPath, application, document, {
    customSiteTitle: `${RUNLANE_PRODUCT_NAME} API`,
    jsonDocumentUrl: `/${config.apiDocsPath}/openapi.json`,
    swaggerOptions: {
      displayRequestDuration: true,
      operationsSorter: 'alpha',
      persistAuthorization: true,
      tagsSorter: 'alpha',
    },
  });
}
