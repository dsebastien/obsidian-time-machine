export interface DiffHunk {
    oldStart: number
    oldLines: number
    newStart: number
    newLines: number
    lines: string[]
}

export interface DiffResult {
    oldHeader: string
    newHeader: string
    hunks: DiffHunk[]
}
