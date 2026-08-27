import { describe, expect, test } from 'bun:test'
import { neutraliseExecutableBlocks } from './markdown-safety'

describe('neutraliseExecutableBlocks', () => {
    test('relabels a dataviewjs block so nothing executes it', () => {
        const input = ['# Note', '', '```dataviewjs', 'dv.paragraph("boom")', '```', ''].join('\n')
        const { markdown, neutralised } = neutraliseExecutableBlocks(input)

        expect(markdown).not.toContain('```dataviewjs')
        expect(markdown).toContain('```text')
        // The content is preserved — it just renders as source.
        expect(markdown).toContain('dv.paragraph("boom")')
        expect(neutralised).toEqual(['dataviewjs'])
    })

    test('relabels dataview query blocks', () => {
        const { markdown, neutralised } = neutraliseExecutableBlocks('```dataview\nLIST\n```')
        expect(markdown).toBe('```text\nLIST\n```')
        expect(neutralised).toEqual(['dataview'])
    })

    test('leaves ordinary code blocks untouched', () => {
        const input = '```ts\nconst a = 1\n```\n\n```\nplain\n```'
        const { markdown, neutralised } = neutraliseExecutableBlocks(input)
        expect(markdown).toBe(input)
        expect(neutralised).toEqual([])
    })

    test('leaves prose untouched', () => {
        const input = '# Title\n\nSome text mentioning dataviewjs inline.\n'
        const { markdown, neutralised } = neutraliseExecutableBlocks(input)
        expect(markdown).toBe(input)
        expect(neutralised).toEqual([])
    })

    test('is case-insensitive on the language', () => {
        const { neutralised } = neutraliseExecutableBlocks('```DataviewJS\nx\n```')
        expect(neutralised).toEqual(['DataviewJS'])
    })

    test('ignores an executable language appearing inside a fenced block', () => {
        // The inner line is content of the outer block, not a new fence.
        const input = '````markdown\n```dataviewjs\nnot a real block\n```\n````'
        const { markdown, neutralised } = neutraliseExecutableBlocks(input)
        expect(markdown).toBe(input)
        expect(neutralised).toEqual([])
    })

    test('handles several blocks and reports each', () => {
        const input = [
            '```dataviewjs',
            'a',
            '```',
            '',
            'text',
            '',
            '```dataview',
            'LIST',
            '```'
        ].join('\n')
        const { markdown, neutralised } = neutraliseExecutableBlocks(input)
        expect(markdown).not.toContain('dataviewjs')
        expect(neutralised).toEqual(['dataviewjs', 'dataview'])
    })

    test('preserves fence length and indentation', () => {
        const { markdown } = neutraliseExecutableBlocks('  ````dataviewjs\n  x\n  ````')
        expect(markdown.startsWith('  ````text')).toBe(true)
    })

    test('handles tilde fences', () => {
        const { markdown, neutralised } = neutraliseExecutableBlocks('~~~dataviewjs\nx\n~~~')
        expect(markdown).toBe('~~~text\nx\n~~~')
        expect(neutralised).toEqual(['dataviewjs'])
    })

    test('keeps extra info-string arguments from re-enabling execution', () => {
        const { markdown, neutralised } = neutraliseExecutableBlocks(
            '```dataviewjs extra args\nx\n```'
        )
        expect(markdown).toBe('```text\nx\n```')
        expect(neutralised).toEqual(['dataviewjs'])
    })

    test('escapes raw script tags', () => {
        const { markdown, neutralised } = neutraliseExecutableBlocks('<script>alert(1)</script>')
        expect(markdown).not.toContain('<script')
        expect(markdown).toContain('&lt;script')
        expect(markdown).toContain('&lt;/script')
        expect(neutralised).toContain('script')
    })

    test('an unterminated executable fence still gets relabelled', () => {
        const { markdown, neutralised } = neutraliseExecutableBlocks('```dataviewjs\nnever closed')
        expect(markdown).toBe('```text\nnever closed')
        expect(neutralised).toEqual(['dataviewjs'])
    })

    test('returns empty content unchanged', () => {
        expect(neutraliseExecutableBlocks('')).toEqual({ markdown: '', neutralised: [] })
    })
})
