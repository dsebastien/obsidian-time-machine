/**
 * Rendering a historical version of a note runs every registered markdown
 * post-processor. That means a `dataviewjs` block from an old version executes
 * arbitrary JavaScript, and a `dataview` query runs against today's index —
 * including blocks the user has since deleted from the note. There is no safe
 * mode on `MarkdownRenderer.render`, and sanitising the resulting DOM is
 * useless because execution has already happened.
 *
 * So the markdown is made inert *before* it reaches the renderer: executable
 * fenced blocks are relabelled to a language nothing registers a processor for,
 * which makes them render as plain source.
 */

/**
 * Fence languages that execute code or run queries when rendered.
 * Matched case-insensitively against the first word of the info string.
 */
const EXECUTABLE_LANGUAGES = new Set([
    'dataviewjs',
    'dataview',
    'templater-js',
    'templaterjs',
    'js-engine',
    'jsx-',
    'meta-bind-js',
    'meta-bind-button',
    'quickadd',
    'run-python',
    'run-js',
    'run-javascript',
    'pyscript'
])

/** Language the neutralised blocks are relabelled to. Nothing processes it. */
const INERT_LANGUAGE = 'text'

/**
 * Dataview's *inline* syntax: `` `$= expr` `` runs JavaScript and `` `= expr` ``
 * evaluates a query, both against the current vault. Neither is a fenced block,
 * so the fence scanner never sees them.
 *
 * They are defused by escaping the backticks, which stops a code span forming at
 * all — so no inline post-processor runs — while leaving the text readable.
 */
const INLINE_DATAVIEW_RE = /`(\s*\$?=[^`\n]*)`/g

export interface NeutraliseResult {
    /** Markdown safe to hand to `MarkdownRenderer.render`. */
    markdown: string
    /**
     * The original languages that were neutralised, in document order,
     * with duplicates preserved so the count reflects the number of blocks.
     */
    neutralised: string[]
}

/**
 * A fence opener.
 *
 * The prefix is deliberately permissive — `[ \t>]*` — rather than CommonMark's
 * "up to three spaces". A fence nested in a list item or a blockquote is
 * legitimately indented further, or prefixed with `>`, and those must not slip
 * through: `> ```dataviewjs` is a perfectly ordinary block that Obsidian
 * renders, and therefore executes.
 */
const FENCE_RE = /^([ \t>]*)(`{3,}|~{3,})(.*)$/

/** Raw HTML elements that can execute or load remote content. */
const DANGEROUS_HTML_RE = /<(\/?)(script|iframe|object|embed)\b/gi

function languageOf(info: string): string {
    return info.trim().split(/\s+/)[0] ?? ''
}

function isExecutable(language: string): boolean {
    return language !== '' && EXECUTABLE_LANGUAGES.has(language.toLowerCase())
}

/**
 * Relabels executable fenced code blocks so they render as inert source, and
 * escapes raw HTML that can execute or fetch.
 *
 * Line endings are normalised to LF first. JavaScript's `.` does not match
 * `\r` (it is a line terminator), so a CRLF note would otherwise leave `\r`
 * stranded at the end of every line and no fence would ever match — every
 * executable block in a CRLF note would have rendered, and run.
 */
export function neutraliseExecutableBlocks(markdown: string): NeutraliseResult {
    const lines = markdown.split(/\r?\n/)
    const neutralised: string[] = []

    let openFenceChar: string | null = null
    let openFenceLength = 0

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        if (line === undefined) continue

        const match = FENCE_RE.exec(line)

        // Inline Dataview only executes outside fenced blocks; inside one it is
        // already literal text, and escaping it there would corrupt what the
        // user sees.
        if (!match && openFenceChar === null) {
            INLINE_DATAVIEW_RE.lastIndex = 0
            if (INLINE_DATAVIEW_RE.test(line)) {
                neutralised.push('inline-dataview')
                lines[i] = line.replace(INLINE_DATAVIEW_RE, '\\`$1\\`')
            }
        }

        if (!match) continue

        const [, prefix = '', fence = '', info = ''] = match
        const char = fence[0]
        if (char === undefined) continue

        if (openFenceChar !== null) {
            // Inside a block: a fence of the same character and at least the
            // opener's length, with no info string, closes it.
            if (char === openFenceChar && fence.length >= openFenceLength && !info.trim()) {
                openFenceChar = null
                openFenceLength = 0
                continue
            }

            // Still inside. An executable fence here is normally just text —
            // but only when the enclosing fence is strictly longer, which is
            // how genuine nesting is written (```` wrapping ```). If it is not
            // longer, we are probably not really inside a block at all (a
            // mis-detected opener), and the safe reading is to neutralise.
            if (isExecutable(languageOf(info)) && fence.length >= openFenceLength) {
                neutralised.push(languageOf(info))
                lines[i] = `${prefix}${fence}${INERT_LANGUAGE}`
            }
            continue
        }

        // A backtick fence's info string cannot contain a backtick (CommonMark).
        if (char === '`' && info.includes('`')) continue

        openFenceChar = char
        openFenceLength = fence.length

        const language = languageOf(info)
        if (isExecutable(language)) {
            neutralised.push(language)
            lines[i] = `${prefix}${fence}${INERT_LANGUAGE}`
        }
    }

    let result = lines.join('\n')

    // Raw HTML survives Obsidian's renderer in some contexts; never let a
    // historical <script> run or an <iframe> phone home. Escaping the opening
    // angle bracket turns it into visible text.
    DANGEROUS_HTML_RE.lastIndex = 0
    if (DANGEROUS_HTML_RE.test(result)) {
        DANGEROUS_HTML_RE.lastIndex = 0
        const seen = new Set<string>()
        result = result.replace(DANGEROUS_HTML_RE, (_m, slash: string, tag: string) => {
            seen.add(tag.toLowerCase())
            return `&lt;${slash}${tag}`
        })
        for (const tag of seen) neutralised.push(tag)
    }

    return { markdown: result, neutralised }
}
