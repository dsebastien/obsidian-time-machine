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

    describe('bypass regressions', () => {
        // Each of these executed in an earlier version of this function.

        test('neutralises a block inside a blockquote', () => {
            const { markdown, neutralised } = neutraliseExecutableBlocks(
                '> ```dataviewjs\n> dv.paragraph("x")\n> ```'
            )
            expect(neutralised).toEqual(['dataviewjs'])
            expect(markdown).toContain('> ```text')
        })

        test('neutralises a block indented inside a list item', () => {
            const { neutralised } = neutraliseExecutableBlocks(
                '- item\n\n      ```dataviewjs\n      dv.paragraph("x")\n      ```'
            )
            expect(neutralised).toEqual(['dataviewjs'])
        })

        test('preserves the list indentation when relabelling', () => {
            const { markdown } = neutraliseExecutableBlocks(
                '      ```dataviewjs\n      x\n      ```'
            )
            expect(markdown.startsWith('      ```text')).toBe(true)
        })

        test('neutralises a block in a CRLF note', () => {
            // JavaScript's `.` does not match \r, so a CRLF note used to leave
            // every line ending stranded and no fence ever matched.
            const { markdown, neutralised } = neutraliseExecutableBlocks(
                '```dataviewjs\r\ndv.paragraph("x")\r\n```'
            )
            expect(neutralised).toEqual(['dataviewjs'])
            expect(markdown).toContain('```text')
        })

        test('neutralises a nested blockquote fence', () => {
            const { neutralised } = neutraliseExecutableBlocks('>> ```dataviewjs\n>> x\n>> ```')
            expect(neutralised).toEqual(['dataviewjs'])
        })

        test('neutralises an executable fence that follows a same-length fence', () => {
            // A same-length "outer" fence cannot legitimately nest another, so
            // being inside one is not a reason to trust the inner block.
            const input = '```\nplain\n```dataviewjs\ndv.paragraph("x")\n```'
            const { neutralised } = neutraliseExecutableBlocks(input)
            expect(neutralised).toContain('dataviewjs')
        })

        test('escapes iframe and object as well as script', () => {
            const { markdown, neutralised } = neutraliseExecutableBlocks(
                '<iframe src="https://example.com"></iframe><object data="x"></object>'
            )
            expect(markdown).not.toContain('<iframe')
            expect(markdown).not.toContain('<object')
            expect(neutralised).toContain('iframe')
            expect(neutralised).toContain('object')
        })

        test('still leaves a genuinely nested example alone', () => {
            // Documentation notes legitimately show a dataviewjs block inside a
            // longer markdown fence; that must keep its language label.
            const input = '````markdown\n```dataviewjs\nexample\n```\n````'
            const { markdown, neutralised } = neutraliseExecutableBlocks(input)
            expect(markdown).toBe(input)
            expect(neutralised).toEqual([])
        })
    })

    describe('inline Dataview', () => {
        test('defuses inline JavaScript', () => {
            // `$= ...` runs JS and is not a fenced block, so the fence scanner
            // never saw it.
            const { markdown, neutralised } = neutraliseExecutableBlocks('Today `$= dv.date()` ok')
            expect(neutralised).toContain('inline-dataview')
            expect(markdown).not.toMatch(/(^|[^\\])`\s*\$=/)
        })

        test('defuses inline queries', () => {
            const { neutralised } = neutraliseExecutableBlocks('Name `= this.file.name`')
            expect(neutralised).toContain('inline-dataview')
        })

        test('leaves ordinary inline code alone', () => {
            const input = 'Use `const a = 1` and `npm = bad` here'
            const { markdown, neutralised } = neutraliseExecutableBlocks(input)
            expect(markdown).toBe(input)
            expect(neutralised).toEqual([])
        })

        test('leaves inline syntax inside a fenced block alone', () => {
            // Inside a code block it is already literal, and escaping it there
            // would corrupt what the user sees.
            const input = '```text\nexample `$= dv.date()` shown literally\n```'
            const { markdown } = neutraliseExecutableBlocks(input)
            expect(markdown).toBe(input)
        })

        test('defuses inline syntax inside a blockquote', () => {
            const { neutralised } = neutraliseExecutableBlocks('> Today `$= dv.date()`')
            expect(neutralised).toContain('inline-dataview')
        })
    })
})
