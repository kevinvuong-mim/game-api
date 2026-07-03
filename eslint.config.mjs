import globals from 'globals';
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      '.prisma/**',
      'coverage/**',
      'node_modules/**',
      'eslint.config.mjs',
      'prisma/migrations/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
      sourceType: 'module',
      ecmaVersion: 'latest',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      // Prettier integration
      'prettier/prettier': 'error',

      // General ESLint rules
      'no-var': 'error',
      'no-debugger': 'error',
      'prefer-const': 'error',
      'no-duplicate-imports': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],

      // TypeScript specific rules
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/require-await': 'warn',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-misused-promises': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/interface-name-prefix': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
    },
  },
);
