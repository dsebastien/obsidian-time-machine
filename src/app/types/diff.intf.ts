export type DiffLineType = 'added' | 'removed' | 'context'

export type DiffSegmentKind = 'same' | 'added' | 'removed'

/**
 * A run of text within a rendered diff line, tagged with whether it is
 * unchanged, word-level added, or word-level removed. Used to highlight only
 * the changed words inside a modified line instead of the whole line.
 */
export interface DiffSegment {
    text: string
    kind: DiffSegmentKind
}

/**
 * A line ready for rendering: its overall type plus the inline segments that
 * make it up. A context line is a single `same` segment; a modified line mixes
 * `same` segments with `added`/`removed` ones.
 */
export interface DiffLine {
    type: DiffLineType
    segments: DiffSegment[]
}

export interface DiffHunk {
    oldStart: number
    oldLines: number
    newStart: number
    newLines: number
    /** Raw unified-diff lines (prefixed with `+`/`-`/` `). Used by restore. */
    lines: string[]
    /** Pre-computed lines with inline word-level highlighting, for rendering. */
    renderLines: DiffLine[]
}

export interface DiffResult {
    oldHeader: string
    newHeader: string
    hunks: DiffHunk[]
}
