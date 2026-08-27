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

export interface NeutraliseResult {
    /** Markdown safe to hand to `MarkdownRenderer.render`. */
    markdown: string
    /**
     * The original languages that were neutralised, in document order,
     * with duplicates preserved so the count reflects the number of blocks.
     */
    neutralised: string[]
}

/** A fence opener: optional indent, 3+ backticks or tildes, then an info string. */
const FENCE_RE = /^(\s{0,3})(`{3,}|~{3,})(.*)$/

/**
 * Relabels executable fenced code blocks so they render as inert source, and
 * escapes raw `<script>` tags.
 *
 * Fence scanning follows CommonMark closely enough for real notes: a block is
 * closed by a fence of the same character that is at least as long as the
 * opener, and an opener's info string may not contain a backtick when the fence
 * is made of backticks.
 */
export function neutraliseExecutableBlocks(markdown: string): NeutraliseResult {
    const lines = markdown.split('\n')
    const neutralised: string[] = []

    let openFenceChar: string | null = null
    let openFenceLength = 0

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        if (line === undefined) continue

        const match = FENCE_RE.exec(line)

        if (openFenceChar !== null) {
            // Inside a block: only a closing fence of the same char and >= length ends it.
            if (match) {
                const [, , fence = '', info = ''] = match
                const char = fence[0]
                if (char === openFenceChar && fence.length >= openFenceLength && !info.trim()) {
                    openFenceChar = null
                    openFenceLength = 0
                }
            }
            continue
        }

        if (!match) continue

        const [, indent = '', fence = '', info = ''] = match
        const char = fence[0]
        if (char === undefined) continue

        // A backtick fence's info string cannot contain a backtick (CommonMark).
        if (char === '`' && info.includes('`')) continue

        openFenceChar = char
        openFenceLength = fence.length

        const language = info.trim().split(/\s+/)[0] ?? ''
        if (language && EXECUTABLE_LANGUAGES.has(language.toLowerCase())) {
            neutralised.push(language)
            lines[i] = `${indent}${fence}${INERT_LANGUAGE}`
        }
    }

    let result = lines.join('\n')

    // Raw HTML survives Obsidian's renderer in some contexts; never let a
    // historical <script> run. Escaping the opening angle bracket is enough to
    // turn it into visible text.
    const scriptRe = /<(\/?)(script)\b/gi
    if (scriptRe.test(result)) {
        neutralised.push('script')
        result = result.replace(scriptRe, '&lt;$1$2')
    }

    return { markdown: result, neutralised }
}
