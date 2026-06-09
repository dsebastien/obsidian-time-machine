import { describe, expect, test } from 'bun:test'
import { DiffService } from './diff.service'

describe('DiffService', () => {
    test('computeDiff returns empty hunks for identical texts', () => {
        const result = DiffService.computeDiff('hello\nworld', 'hello\nworld', 'old', 'new')
        expect(result.hunks).toHaveLength(0)
    })

    test('computeDiff detects added lines', () => {
        const result = DiffService.computeDiff('line1\nline2', 'line1\nline2\nline3', 'old', 'new')
        expect(result.hunks.length).toBeGreaterThan(0)

        const addedLines = result.hunks[0]!.lines.filter((l) => l.startsWith('+'))
        expect(addedLines.length).toBeGreaterThan(0)
    })

    test('computeDiff detects removed lines', () => {
        const result = DiffService.computeDiff('line1\nline2\nline3', 'line1\nline3', 'old', 'new')
        expect(result.hunks.length).toBeGreaterThan(0)

        const removedLines = result.hunks[0]!.lines.filter((l) => l.startsWith('-'))
        expect(removedLines.length).toBeGreaterThan(0)
    })

    test('computeDiff detects modified lines', () => {
        const result = DiffService.computeDiff(
            'line1\noriginal\nline3',
            'line1\nmodified\nline3',
            'old',
            'new'
        )
        expect(result.hunks.length).toBeGreaterThan(0)
    })

    test('computeDiff preserves headers', () => {
        const result = DiffService.computeDiff('a', 'b', 'file-old', 'file-new')
        expect(result.oldHeader).toBe('file-old')
        expect(result.newHeader).toBe('file-new')
    })

    test('hasChanges returns false for identical content', () => {
        const result = DiffService.computeDiff('same', 'same', 'a', 'b')
        expect(DiffService.hasChanges(result)).toBe(false)
    })

    test('hasChanges returns true when there are differences', () => {
        const result = DiffService.computeDiff('old', 'new', 'a', 'b')
        expect(DiffService.hasChanges(result)).toBe(true)
    })

    test('computeDiff handles empty strings', () => {
        const result = DiffService.computeDiff('', 'new content', 'old', 'new')
        expect(result.hunks.length).toBeGreaterThan(0)
    })

    test('computeDiff handles multiline with context', () => {
        const old = 'line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8'
        const newText = 'line1\nline2\nline3\nchanged\nline5\nline6\nline7\nline8'
        const result = DiffService.computeDiff(old, newText, 'old', 'new')

        expect(result.hunks.length).toBe(1)
        // Context lines should be present
        const contextLines = result.hunks[0]!.lines.filter((l) => l.startsWith(' '))
        expect(contextLines.length).toBeGreaterThan(0)
    })

    test('computeDiff normalizes CRLF so only changed lines differ', () => {
        // Old version has CRLF endings, new has LF; only the second line changed.
        const old = 'line1\r\nline2\r\nline3\r\n'
        const newText = 'line1\nline2 changed\nline3\n'
        const result = DiffService.computeDiff(old, newText, 'old', 'new')

        const removed = result.hunks.flatMap((h) => h.lines.filter((l) => l.startsWith('-')))
        const added = result.hunks.flatMap((h) => h.lines.filter((l) => l.startsWith('+')))
        // Without normalization every line would show as removed+added (3 each).
        expect(removed).toEqual(['-line2'])
        expect(added).toEqual(['+line2 changed'])
    })

    test('buildRenderLines highlights only changed words within a modified line', () => {
        const result = DiffService.computeDiff(
            'The quick brown fox jumps',
            'The quick brown fox leaps',
            'old',
            'new'
        )

        const renderLines = result.hunks[0]!.renderLines
        const removed = renderLines.find((l) => l.type === 'removed')!
        const added = renderLines.find((l) => l.type === 'added')!

        // Unchanged prefix stays a `same` segment; only the last word is tagged.
        expect(removed.segments).toEqual([
            { text: 'The quick brown fox ', kind: 'same' },
            { text: 'jumps', kind: 'removed' }
        ])
        expect(added.segments).toEqual([
            { text: 'The quick brown fox ', kind: 'same' },
            { text: 'leaps', kind: 'added' }
        ])
    })

    test('buildRenderLines drops the "no newline at end of file" marker', () => {
        // Neither side ends with a newline -> diff library emits a `\` marker line.
        const result = DiffService.computeDiff('alpha\nbravo', 'alpha\nbravo changed', 'old', 'new')

        const renderLines = result.hunks.flatMap((h) => h.renderLines)
        const hasMarker = renderLines.some((l) =>
            l.segments.some((s) => s.text.includes('No newline'))
        )
        expect(hasMarker).toBe(false)
    })

    test('buildRenderLines tags a pure addition as fully added', () => {
        // Trailing newlines keep this a clean append (no no-newline boundary change).
        const result = DiffService.computeDiff(
            'line1\nline2\n',
            'line1\nline2\nline3\n',
            'old',
            'new'
        )

        const renderLines = result.hunks[0]!.renderLines
        const added = renderLines.filter((l) => l.type === 'added')
        expect(added).toHaveLength(1)
        expect(added[0]!.segments).toEqual([{ text: 'line3', kind: 'added' }])
    })
})
