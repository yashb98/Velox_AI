// eslint.config.js — ESLint flat config for Velox API
//
// Reference: docs/architecture/08-mlops-cicd.md §8.3
//
// Run: npm run lint
// Fix: npm run lint:fix

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        project: './tsconfig.json',
      },
    },
    rules: {
      // TypeScript-specific rules
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-non-null-assertion': 'warn',

      // General best practices
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'always'],

      // Security
      'no-eval': 'error',
      'no-implied-eval': 'error',
    },
  },
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      '*.js',
      'prisma/**',
    ],
  }
);
