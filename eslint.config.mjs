import eslint from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const domainBoundaryPatterns = [
  '@nestjs/*',
  '@prisma/*',
  '@runlane/application',
  '@runlane/contracts',
  '@runlane/contracts/*',
  '@runlane/application/*',
  '@runlane/config',
  '@runlane/config/*',
  '@runlane/infrastructure',
  '@runlane/infrastructure/*',
  '@runlane/testing',
  '@runlane/testing/*',
  'apps/*',
];

const contractsBoundaryPatterns = [
  '@nestjs/*',
  '@prisma/*',
  '@runlane/application',
  '@runlane/application/*',
  '@runlane/config',
  '@runlane/config/*',
  '@runlane/domain',
  '@runlane/domain/*',
  '@runlane/infrastructure',
  '@runlane/infrastructure/*',
  '@runlane/testing',
  '@runlane/testing/*',
  'apps/*',
];

const applicationBoundaryPatterns = [
  '@nestjs/*',
  '@prisma/*',
  '@runlane/config',
  '@runlane/config/*',
  '@runlane/infrastructure',
  '@runlane/infrastructure/*',
  '@runlane/testing',
  '@runlane/testing/*',
  'apps/*',
];

const infrastructureBoundaryPatterns = ['@runlane/testing', '@runlane/testing/*', 'apps/*'];

const interfaceBoundaryPatterns = ['@prisma/*', 'redis', '@runlane/testing', '@runlane/testing/*'];

function restrictedImports(patterns, message, paths = []) {
  return [
    'error',
    {
      paths: paths.map((name) => ({ name, message })),
      patterns: [
        {
          group: patterns,
          message,
        },
      ],
    },
  ];
}

export default tseslint.config(
  {
    ignores: ['dist', 'node_modules', 'coverage', '.run', 'apps/web/dist'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
    },
  },

  {
    files: ['packages/contracts/**/*.ts'],
    rules: {
      'no-restricted-imports': restrictedImports(
        contractsBoundaryPatterns,
        'Shared contracts must remain independent from frameworks and implementation layers.',
        ['redis'],
      ),
    },
  },
  {
    files: ['packages/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': restrictedImports(
        domainBoundaryPatterns,
        'Domain code must remain independent from frameworks and outer layers.',
        ['redis'],
      ),
    },
  },
  {
    files: ['packages/application/**/*.ts'],
    rules: {
      'no-restricted-imports': restrictedImports(
        applicationBoundaryPatterns,
        'Application code may depend only on domain and contracts.',
        ['redis'],
      ),
    },
  },
  {
    files: ['packages/infrastructure/**/*.ts'],
    rules: {
      'no-restricted-imports': restrictedImports(
        infrastructureBoundaryPatterns,
        'Infrastructure code must not depend on interface or testing layers.',
      ),
    },
  },
  {
    files: ['apps/**/*.ts'],
    rules: {
      'no-restricted-imports': restrictedImports(
        interfaceBoundaryPatterns,
        'Interface runtimes must access external systems through infrastructure adapters.',
        ['redis'],
      ),
    },
  },
  {
    files: ['apps/web/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      'no-restricted-imports': 'off',
    },
  },

);
