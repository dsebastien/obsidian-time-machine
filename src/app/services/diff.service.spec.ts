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
})
