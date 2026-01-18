import type { Provider } from '@nestjs/common';
import { validateEnvironment } from './env.schema';
import { loadEnvironmentFiles } from './environment-loader';

export const RUNTIME_ENVIRONMENT = Symbol('RUNTIME_ENVIRONMENT');

export const runtimeEnvironmentProvider: Provider = {
  provide: RUNTIME_ENVIRONMENT,
  useFactory: () => {
    loadEnvironmentFiles();
    return validateEnvironment(process.env);
  },
};
