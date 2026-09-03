import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
    {
        ignores: ['dist/**', 'node_modules/**', 'src/generated/**']
    },

    js.configs.recommended,
    ...tseslint.configs.recommended,

    {
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
                process: 'readonly',
                console: 'readonly',
                Buffer: 'readonly',
                __dirname: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                setInterval: 'readonly',
                clearInterval: 'readonly',
                URL: 'readonly',
                NodeJS: 'readonly'
            }
        },

        rules: {
            // The tree carries a large number of deliberate `as any` casts around
            // discord.js payloads and Components V2 flags. Flagging every one of
            // them would bury the findings that matter, so this is tracked as
            // debt to pay down rather than enforced today.
            '@typescript-eslint/no-explicit-any': 'off',

            // Warn, not error: an unused symbol is worth seeing but is never a
            // reason to fail a build. Leading underscore marks a deliberate one.
            '@typescript-eslint/no-unused-vars': [
                'warn',
                { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }
            ],

            // Empty catch blocks are used intentionally for best-effort cleanup
            // where a failure genuinely changes nothing.
            'no-empty': ['error', { allowEmptyCatch: true }],

            // These two catch real defects and are worth erroring on: a floating
            // promise in a moderation path means a sanction that silently never
            // applied.
            'no-fallthrough': 'error',
            'no-constant-condition': ['error', { checkLoops: false }]
        }
    },

    // Must stay last: turns off every stylistic rule that would fight Prettier.
    prettier
);
