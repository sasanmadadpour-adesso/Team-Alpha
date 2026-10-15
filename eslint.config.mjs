import eslint from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

export default [
  eslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...Object.fromEntries(['process', 'NodeJS', 'describe', 'it', 'expect'].map((name) => [name, 'readonly'])),
      },
    },
    files: ['src/**/*.ts', 'test/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: {
      'no-undef': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
];
