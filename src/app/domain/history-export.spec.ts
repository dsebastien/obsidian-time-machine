import { describe, expect, test } from 'bun:test'
import { fileRecoveryToSnapshot, gitCommitToSnapshot } from './snapshot'
import { renderHistory, MAX_HISTORY_BYTES, parseHistoryOptions } from './history-export'
import { replaceFrozenHistory } from './frozen-history'

const path = 'notes/Research.md'
const options = { format: 'diffs', maxVersions: null } as const
const snapshot = (data: string, ts: number) => fileRecoveryToSnapshot({ path, data, ts })

describe('durable history renderer', () => {
    test('validates dialog options without treating a cleared input as a default', () => {
        expect(parseHistoryOptions('diffs', ' all ')).toEqual(options)
        expect(parseHistoryOptions('full', '20')).toEqual({ format: 'full', maxVersions: 20 })
        for (const value of ['', '0', '-1', '1.2', '1e3', 'Infinity', '9007199254740992']) {
            expect(() => parseHistoryOptions('diffs', value)).toThrow('version limit')
        }
        expect(() => parseHistoryOptions('unknown', 'all')).toThrow('format')
    })
    test('is deterministic, newest-first, deduplicated and does not mutate inputs', () => {
        const snapshots = [snapshot('one', 1000), snapshot('two', 3000), snapshot('one', 2000)]
        const output = renderHistory(path, snapshots, options)
        expect(output).toEqual(renderHistory(path, [...snapshots].reverse(), options))
        expect(output.versionCount).toBe(2)
        expect(output.markdown.indexOf('1970-01-01T00:00:03.000Z')).toBeLessThan(
            output.markdown.indexOf('1970-01-01T00:00:02.000Z')
        )
        expect(snapshots[0]?.ts).toBe(1000)
        expect(output.bytes).toBe(new TextEncoder().encode(output.markdown).length)
    })

    test('diffs from older to newer, using an empty baseline for the oldest included version', () => {
        const { markdown } = renderHistory(
            path,
            [snapshot('old\n', 1000), snapshot('new\n', 2000)],
            options
        )
        expect(markdown).toContain('-old\n+new')
        expect(markdown).toContain('Baseline')
        expect(markdown).toContain('+old')
    })

    test('caps newest versions after stripping frozen sections and deduplicating', () => {
        const snapshots = [
            snapshot('old', 1000),
            snapshot('new', 2000),
            snapshot(replaceFrozenHistory('new', 'generated history'), 3000)
        ]
        const output = renderHistory(path, snapshots, { ...options, maxVersions: 1 })
        expect(output.versionCount).toBe(1)
        expect(output.availableCount).toBe(2)
        expect(output.markdown).not.toContain('generated history')
        expect(output.markdown).not.toContain('+old')
    })

    test('exports full versions as inert source with an unbreakable outer fence', () => {
        const data = '```dataviewjs\nalert(1)\n```\n````\n<script>alert(2)</script>'
        const output = renderHistory(path, [snapshot(data, 1000)], { ...options, format: 'full' })
        expect(output.markdown).toContain('`````text\n' + data + '\n`````')
    })

    test('includes Git metadata, escapes injected Markdown and makes missing authors explicit', () => {
        const git = gitCommitToSnapshot(
            path,
            'git',
            'abcdef123456',
            'abcdef1',
            'fix\n# forged <script>',
            '[author](https://example.com)',
            2
        )
        const { markdown } = renderHistory(path, [git, snapshot('recovery', 1000)], options)
        expect(markdown).toContain('abcdef123456')
        expect(markdown).toContain('Source: Git')
        expect(markdown).toContain('Author: Not recorded by File Recovery')
        expect(markdown).not.toContain('\n# forged')
        expect(markdown).not.toContain('<script>')
        expect(markdown).not.toContain('[author](https://example.com)')
    })

    test('rejects empty history, wrong-file snapshots, invalid limits and oversized output', () => {
        expect(() => renderHistory(path, [], options)).toThrow('No recorded versions')
        expect(() => renderHistory('Other.md', [snapshot('x', 1)], options)).toThrow('another note')
        for (const maxVersions of [0, -1, 1.5, NaN, Infinity]) {
            expect(() =>
                renderHistory(path, [snapshot('x', 1)], { ...options, maxVersions })
            ).toThrow('version limit')
        }
        expect(() =>
            renderHistory(path, [snapshot('x'.repeat(MAX_HISTORY_BYTES), 1)], {
                ...options,
                format: 'full'
            })
        ).toThrow('10 MiB')
    })
})
