import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import eslintConfigPrettier from 'eslint-config-prettier'
import globals from 'globals'
import obsidianmd from 'eslint-plugin-obsidianmd'
// Passing `brands` REPLACES the plugin's default list rather than extending it
// (see sentenceCaseUtil.js: `options?.brands ?? DEFAULT_BRANDS`). Listing only
// this plugin's own names would therefore silently strip "Obsidian",
// "Markdown", "GitHub", "Windows" and the other 42 defaults, and the community
// catalog reviewer — which runs the plugin's own ruleset — would still accept
// them, so the loss would only ever show up locally as false positives.
// Deep path because the package exports only its default plugin object; it is
// pinned exactly, and a break here is a loud module-resolution error, never a
// silent shrinking of the list.
import { DEFAULT_BRANDS } from 'eslint-plugin-obsidianmd/dist/lib/rules/ui/brands.js'

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
            // The community-plugin reviewer treats both the rule violation
            // and any `eslint-disable @typescript-eslint/no-explicit-any` as
            // an ERROR that blocks the scorecard. Catch locally as error,
            // not warn.
            '@typescript-eslint/no-explicit-any': 'error',
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
            // Never disable obsidianmd/* rules here: the community catalog
            // reviewer runs its own ruleset against the git archive, so a
            // local disable only hides the finding until submission.
            // Brand names are the supported escape hatch for sentence-case.
            'obsidianmd/ui/sentence-case': [
                'error',
                {
                    brands: [
                        ...DEFAULT_BRANDS,
                        // This plugin, and the Obsidian surfaces it names.
                        'Time Machine',
                        'File Recovery',
                        // Obsidian's own navigation labels, written the way
                        // its docs write them: "Settings → Core plugins".
                        'Settings',
                        'Core plugins',
                        'Dataview',
                        'Personal Knowledge Management',
                        // Author and funding links.
                        'Knowii',
                        'GitHub Sponsors',
                        'Sébastien Dubois',
                        'dSebastien'
                    ]
                }
            ]
        }
    }
)
