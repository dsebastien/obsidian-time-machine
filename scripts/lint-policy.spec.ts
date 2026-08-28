import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Guards the rules Obsidian's plugin review enforces on submitted code.
 *
 * These checks live here rather than in the ESLint config because the point is
 * to keep the config strict: the failure mode being prevented is someone (me
 * included) silencing a rule locally to make a build go green, and then the
 * community review rejecting the release for exactly that.
 *
 * A previous release was pulled from the community catalogue for two of these.
 */

/** Repo root; this spec lives in `scripts/`, which ESLint ignores — the only
 *  place Node builtins may be imported without relaxing the plugin's own rules. */
const REPO = join(import.meta.dir, '..')
const ROOT = join(REPO, 'src')
const SRC = join(ROOT, 'app')

function collect(dir: string, predicate: (path: string) => boolean): string[] {
    const found: string[] = []
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) {
            found.push(...collect(full, predicate))
        } else if (predicate(full)) {
            found.push(full)
        }
    }
    return found
}

/** Files Obsidian's reviewer treats as shipped source: everything but specs. */
function shippedSources(): string[] {
    const files = collect(SRC, (p) => p.endsWith('.ts') && !p.endsWith('.spec.ts'))
    for (const entry of readdirSync(ROOT)) {
        const full = join(ROOT, entry)
        if (statSync(full).isFile() && full.endsWith('.ts') && !full.endsWith('.spec.ts')) {
            files.push(full)
        }
    }
    return files
}

function relative(path: string): string {
    return path.slice(REPO.length + 1)
}

/** This file quotes the very patterns it forbids, so it exempts itself. */
const POLICY_FILE = join(REPO, 'scripts', 'lint-policy.spec.ts')

/** Blanks out block and line comments, so prose about a rule is not a breach. */
function stripComments(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
}

/** Whether a line is an actual eslint directive comment, not prose about one. */
function isDirective(line: string): boolean {
    return /^\s*(?:\/\/|\/\*)\s*eslint-disable/.test(line)
}

/** The directive comments in a source file. */
function directiveLines(source: string): string[] {
    return source.split('\n').filter(isDirective)
}

describe('Obsidian plugin review policy', () => {
    test('no shipped source disables @typescript-eslint/no-explicit-any', () => {
        // "Disabling '@typescript-eslint/no-explicit-any' is not allowed."
        const offenders = shippedSources()
            .filter((p) => p !== POLICY_FILE)
            .filter((p) =>
                directiveLines(readFileSync(p, 'utf8')).some((l) => l.includes('no-explicit-any'))
            )
            .map(relative)

        expect(offenders).toEqual([])
    })

    test('no shipped source declares an explicit any', () => {
        const offenders = shippedSources()
            .filter((p) => p !== POLICY_FILE)
            .filter((p) => /:\s*any\b|<any>|as any\b/.test(stripComments(readFileSync(p, 'utf8'))))
            .map(relative)

        expect(offenders).toEqual([])
    })

    test('every eslint-disable carries a description', () => {
        // "Unexpected undescribed directive comment. Include descriptions to
        // explain why the comment is necessary."
        const all = [
            ...collect(SRC, (p) => p.endsWith('.ts')),
            ...readdirSync(ROOT)
                .map((e) => join(ROOT, e))
                .filter((p) => statSync(p).isFile() && p.endsWith('.ts'))
        ]

        const offenders: string[] = []
        for (const path of all) {
            if (path === POLICY_FILE) continue
            readFileSync(path, 'utf8')
                .split('\n')
                .forEach((line, i) => {
                    if (isDirective(line) && !line.includes(' -- ')) {
                        offenders.push(`${relative(path)}:${String(i + 1)}`)
                    }
                })
        }

        expect(offenders).toEqual([])
    })

    test('the stylesheet uses no !important', () => {
        // "Avoid !important — override styles by increasing selector
        // specificity or using CSS variables instead."
        // Comments discussing the rule are not violations of it.
        const css = stripComments(readFileSync(join(ROOT, 'styles.src.css'), 'utf8'))
        const offenders = css
            .split('\n')
            .map((line, i) => ({ line, n: i + 1 }))
            .filter(({ line }) => line.includes('!important'))
            .map(({ n }) => `styles.src.css:${String(n)}`)

        expect(offenders).toEqual([])
    })

    test('CHANGELOG.md is not excluded from archives', () => {
        // Obsidian's reviewer builds from `git archive`. With the changelog
        // export-ignored, that build saw no release notes at all — and while
        // the source imported the file directly, failed to resolve it, which is
        // what pulled a release from the community catalogue.
        const attributes = readFileSync(join(REPO, '.gitattributes'), 'utf8')
        const offending = attributes
            .split('\n')
            .filter((line) => !line.trim().startsWith('#'))
            .filter((line) => /CHANGELOG\.md\s+export-ignore/.test(line))

        expect(offending).toEqual([])
    })
})
