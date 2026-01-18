import { loadEnvFile } from 'node:process';

const ENVIRONMENT_FILES = ['.env.local', '.env'] as const;

export function loadEnvironmentFiles(): void {
  for (const environmentFile of ENVIRONMENT_FILES) {
    try {
      loadEnvFile(environmentFile);
    } catch (error) {
      if (!isMissingFileError(error)) {
        throw error;
      }
    }
  }
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
