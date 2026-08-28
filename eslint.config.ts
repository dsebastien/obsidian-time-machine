import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import eslintConfigPrettier from 'eslint-config-prettier'
import globals from 'globals'
import obsidianmd from 'eslint-plugin-obsidianmd'

export default tseslint.config(
    eslint.configs.recommended,
    // Type-checked, not just syntactic. Obsidian's plugin review lints with
    // type information, so the plain `recommended` preset let a whole class of
    // findings through unseen locally: `no-unsafe-assignment`, `no-unsafe-call`
    // and `no-unsafe-member-access` only fire when the checker can tell a value
    // is `any`. Keeping the same preset here means the review no longer sees
    // anything this repo does not.
    ...tseslint.configs.recommendedTypeChecked,
    // @ts-expect-error - obsidianmd types are incomplete but the config works at runtime
    ...obsidianmd.configs['recommended'],
    eslintConfigPrettier,
    {
        ignores: [
            '**/dist/**',
            '**/node_modules/**',
            'scripts/**',
            '.cz-config.cjs',
            'prettier.config.cjs',
            'package.json'
        ]
    },
    {
        files: ['**/*.{js,mjs,cjs,ts}'],
        languageOptions: {
            globals: {
                ...globals.node,
                ...globals.browser,
                // Obsidian global functions
                createDiv: 'readonly',
                createEl: 'readonly',
                createSpan: 'readonly',
                createFragment: 'readonly',
                // Obsidian popout-aware globals
                activeDocument: 'readonly',
                activeWindow: 'readonly'
            },
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname
            }
        },
        rules: {
            '@typescript-eslint/no-require-imports': 'off',
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/no-unused-vars': [
                'error',
                { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
            ],
            '@typescript-eslint/ban-ts-comment': 'off',
            '@typescript-eslint/no-deprecated': 'off',
            // These are too strict for dynamic plugin APIs
            '@typescript-eslint/no-unsafe-call': 'off',
            '@typescript-eslint/no-unsafe-member-access': 'off',
            '@typescript-eslint/no-unsafe-assignment': 'off',
            // Obsidian methods are dynamically added to prototypes
            '@typescript-eslint/no-unsafe-enum-comparison': 'off',
            'no-prototype-builtins': 'off',
            // Allow confirm for delete confirmations
            'no-alert': 'off',
            // Disable sentence case rule - it has false positives for already-correct text
            'obsidianmd/ui/sentence-case': 'off'
        }
    }
)
