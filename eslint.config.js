import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default [
  js.configs.recommended,
  prettier,
  {
    ignores: ['dist/', 'node_modules/', 'server/node_modules/', 'e2e/node_modules/'],
  },
  {
    files: ['js/**/*.{js,ts}', 'server/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'prefer-const': 'error',
      'no-var': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      // ESLint v10 新增推荐规则，与旧项目风格暂不兼容，先关闭以减少迁移噪音
      'preserve-caught-error': 'off',
      'no-useless-assignment': 'off',
      'no-control-regex': 'off',
    },
  },
  {
    files: ['js/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-empty-object-type': 'off',
      // TypeScript 自身会检查未定义变量，关闭 ESLint 的 no-undef 避免误报 DOM 类型
      'no-undef': 'off',
    },
  },
  {
    files: ['server/**/*.js'],
    rules: {
      'no-console': 'off',
    },
  },
];
