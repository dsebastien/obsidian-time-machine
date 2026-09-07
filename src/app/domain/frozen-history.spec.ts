import { describe, expect, test } from 'bun:test'
import {
    HISTORY_END,
    HISTORY_START,
    replaceFrozenHistory,
    stripFrozenHistory
} from './frozen-history'

describe('frozen history sections', () => {
    test.each(['# Note', '# Note\n', '# Note\n\n', '# Note\r\n', ''])(
        'preserves the source exactly through insert/strip: %j',
        (source) => {
            const frozen = replaceFrozenHistory(source, '## Version history\n\nold')
            expect(stripFrozenHistory(frozen)).toBe(source)
            expect(replaceFrozenHistory(frozen, '## Version history\n\nold')).toBe(frozen)
        }
    )

    test('replaces only the managed region, including when followed by user content', () => {
        const source = '# Note\n\n## Version history\n\nMy hand-written history.'
        const frozen = replaceFrozenHistory(source, 'generated') + '\n\n## After\nKeep me'
        const updated = replaceFrozenHistory(frozen, 'updated')
        expect(updated).toContain('My hand-written history.')
        expect(updated).toEndWith('\n\n## After\nKeep me')
        expect(updated).not.toContain('generated')
        expect(stripFrozenHistory(updated)).toBe(source + '\n\n## After\nKeep me')
    })

    test('does not interpret marker examples inside longer backtick or tilde fences', () => {
        for (const fence of ['````', '~~~']) {
            const source = `${fence}text\n${HISTORY_START}\nexample\n${HISTORY_END}\n${fence}`
            expect(stripFrozenHistory(source)).toBe(source)
            expect(stripFrozenHistory(replaceFrozenHistory(source, 'history'))).toBe(source)
        }
    })

    test.each([
        HISTORY_START,
        HISTORY_END,
        `${HISTORY_END}\n${HISTORY_START}`,
        `${HISTORY_START}\n${HISTORY_START}\n${HISTORY_END}`,
        `${HISTORY_START}\na\n${HISTORY_END}\n${HISTORY_START}\nb\n${HISTORY_END}`
    ])('rejects malformed or duplicate markers: %j', (source) => {
        expect(() => stripFrozenHistory(source)).toThrow('history markers')
        expect(() => replaceFrozenHistory(source, 'new')).toThrow('history markers')
    })

    test('refuses to append into an unclosed code fence', () => {
        expect(() => replaceFrozenHistory('```text\nunfinished', 'history')).toThrow('code fence')
    })

    test('strips CRLF sections without changing the remaining bytes', () => {
        const source = '# Note\r\n'
        const frozen = `${source}\r\n\r\n${HISTORY_START}\r\nold\r\n${HISTORY_END}`
        expect(stripFrozenHistory(frozen)).toBe(source)
    })

    test('does not close a code fence on Unicode whitespace', () => {
        const source = `\`\`\`\n\`\`\`\u00a0\n${HISTORY_START}\nkeep me\n${HISTORY_END}\n\`\`\``
        expect(stripFrozenHistory(source)).toBe(source)
        expect(stripFrozenHistory(replaceFrozenHistory(source, 'new'))).toBe(source)
    })

    test.each([
        '<pre>',
        '<script>',
        '<style>',
        '<textarea>',
        '<!-- unfinished',
        '<?xml',
        '<![CDATA['
    ])('refuses insertion into an unfinished HTML block: %s', (source) => {
        expect(() => replaceFrozenHistory(source, 'history')).toThrow('HTML')
    })

    test('preserves marker examples in closed raw HTML blocks', () => {
        const source = `<pre>\n${HISTORY_START}\nkeep me\n${HISTORY_END}\n</pre>`
        expect(stripFrozenHistory(source)).toBe(source)
        expect(stripFrozenHistory(replaceFrozenHistory(source, 'new'))).toBe(source)
    })

    test.each(['pre', 'script', 'style', 'textarea'])(
        'does not terminate raw HTML at a whitespace-suffixed closing tag: %s',
        (tag) => {
            expect(() => replaceFrozenHistory(`<${tag}>\n</${tag} >`, 'new')).toThrow('HTML')
            expect(() => replaceFrozenHistory(`<${tag}>\n</${tag}\t>`, 'new')).toThrow('HTML')
        }
    )

    test('refuses unfinished frontmatter and preserves closed frontmatter', () => {
        expect(() => replaceFrozenHistory('---\ntitle: Note', 'new')).toThrow('frontmatter')
        const source = '---\ntitle: Note\n---\nbody'
        expect(stripFrozenHistory(replaceFrozenHistory(source, 'new'))).toBe(source)
    })

    test.each([' ', '\t', '\u00a0'])('rejects damaged marker whitespace: %j', (space) => {
        const source = `${HISTORY_START}${space}\nold\n${HISTORY_END}${space}`
        expect(() => stripFrozenHistory(source)).toThrow('history markers')
        expect(() => replaceFrozenHistory(source, 'new')).toThrow('history markers')
    })
})
