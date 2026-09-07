export const HISTORY_START = '<!-- time-machine:history:start -->'
export const HISTORY_END = '<!-- time-machine:history:end -->'

interface Section {
    start: number
    end: number
}

function htmlEnd(line: string): RegExp | null {
    const tag = /^ {0,3}<(script|pre|style|textarea)(?:[ \t>]|$)/i.exec(line)?.[1]
    if (tag) return new RegExp(`</${tag}>`, 'i')
    if (/^ {0,3}<!--/.test(line)) return /-->/
    if (/^ {0,3}<\?/.test(line)) return /\?>/
    if (/^ {0,3}<!\[CDATA\[/.test(line)) return /\]\]>/
    if (/^ {0,3}<![A-Z]/.test(line)) return />/
    return null
}

function scan(content: string): { section: Section | null; unfinished: string | null } {
    let start: number | null = null
    let end: number | null = null
    let fenceChar = ''
    let fenceLength = 0
    let offset = 0
    let rawHtmlEnd: RegExp | null = null
    let frontmatter = false

    for (const raw of content.split('\n')) {
        const line = raw.replace(/\r$/, '')
        const position = offset
        offset += raw.length + 1
        if (position === 0 && /^\uFEFF?---[ \t]*$/.test(line)) {
            frontmatter = true
            continue
        }
        if (frontmatter) {
            if (/^(---|\.\.\.)[ \t]*$/.test(line)) frontmatter = false
            continue
        }
        if (rawHtmlEnd) {
            if (rawHtmlEnd.test(line)) rawHtmlEnd = null
            continue
        }
        const fence = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line)
        if (fence) {
            const mark = fence[1] ?? ''
            const info = fence[2] ?? ''
            if (fenceChar) {
                if (mark[0] === fenceChar && mark.length >= fenceLength && /^[ \t]*$/.test(info)) {
                    fenceChar = ''
                }
            } else if (mark[0] !== '`' || !info.includes('`')) {
                fenceChar = mark[0] ?? ''
                fenceLength = mark.length
            }
        } else if (!fenceChar && (line === HISTORY_START || line === HISTORY_END)) {
            if (line === HISTORY_START && start === null && end === null) {
                start = position
            } else if (line === HISTORY_END && start !== null && end === null) {
                end = position + line.length
            } else {
                throw new Error(
                    'Invalid or duplicate history markers; repair the section before exporting.'
                )
            }
        } else if (!fenceChar) {
            if (/time-machine\s*:\s*history\s*:/i.test(line)) {
                throw new Error(
                    'Malformed history markers; restore the exact standalone comment markers.'
                )
            }
            const ending = htmlEnd(line)
            if (ending && !ending.test(line)) rawHtmlEnd = ending
        }
    }
    if ((start === null) !== (end === null)) {
        throw new Error('Unmatched history markers; repair the section before exporting.')
    }
    return {
        section: start !== null && end !== null ? { start, end } : null,
        unfinished: fenceChar
            ? 'code fence'
            : rawHtmlEnd
              ? 'HTML block'
              : frontmatter
                ? 'frontmatter'
                : null
    }
}

export function stripFrozenHistory(content: string): string {
    const { section } = scan(content)
    if (!section) return content
    // Insertion always owns exactly two preceding line breaks, even when the
    // original already ended in a newline. Removing them round-trips its bytes.
    const prefix = content.slice(0, section.start)
    const separator = /(?:\r?\n){2}$/.exec(prefix)?.[0] ?? ''
    return prefix.slice(0, prefix.length - separator.length) + content.slice(section.end)
}

export function replaceFrozenHistory(content: string, markdown: string): string {
    const { section, unfinished } = scan(content)
    const eol = content.includes('\r\n') ? '\r\n' : '\n'
    const block = `${HISTORY_START}${eol}${markdown.replace(/\r?\n/g, eol).trimEnd()}${eol}${HISTORY_END}`
    if (section) {
        return content.slice(0, section.start) + block + content.slice(section.end)
    }
    if (unfinished) {
        throw new Error(
            `Close the unfinished ${unfinished} before freezing history into this note.`
        )
    }
    return `${content}${eol}${eol}${block}`
}
