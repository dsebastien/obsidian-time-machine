import { diffWordsWithSpace, structuredPatch } from 'diff'
import type { DiffLine, DiffResult, DiffSegment } from '../types/diff.intf'

export class DiffService {
    static computeDiff(
        oldText: string,
        newText: string,
        oldLabel: string,
        newLabel: string
    ): DiffResult {
        // Normalize line endings so a CRLF/LF mismatch between versions does not
        // mark every line as changed (a common source of nonsensical diffs).
        const normalizedOld = DiffService.normalizeEol(oldText)
        const normalizedNew = DiffService.normalizeEol(newText)

        const patch = structuredPatch(oldLabel, newLabel, normalizedOld, normalizedNew, '', '', {
            context: 3
        })

        return {
            oldHeader: oldLabel,
            newHeader: newLabel,
            hunks: patch.hunks.map((h) => ({
                oldStart: h.oldStart,
                oldLines: h.oldLines,
                newStart: h.newStart,
                newLines: h.newLines,
                lines: h.lines,
                renderLines: DiffService.buildRenderLines(h.lines)
            }))
        }
    }

    static hasChanges(diffResult: DiffResult): boolean {
        return diffResult.hunks.length > 0
    }

    private static normalizeEol(text: string): string {
        return text.replace(/\r\n/g, '\n')
    }

    /**
     * Turn the raw unified-diff lines of a hunk into renderable lines with
     * inline word-level highlighting. Consecutive removed/added lines are paired
     * up and diffed at the word level so only the changed words are highlighted,
     * matching the granularity of Obsidian's File Recovery diff.
     */
    static buildRenderLines(rawLines: string[]): DiffLine[] {
        // Drop the "\ No newline at end of file" marker the diff library emits;
        // it is not a real content line and renders as noise.
        const lines = rawLines.filter((l) => !l.startsWith('\\'))

        const result: DiffLine[] = []
        let i = 0
        while (i < lines.length) {
            const line = lines[i]
            if (line === undefined) break
            const prefix = line[0]

            if (prefix === '-') {
                const removed: string[] = []
                while (i < lines.length && lines[i]?.[0] === '-') {
                    removed.push((lines[i] as string).substring(1))
                    i++
                }
                const added: string[] = []
                while (i < lines.length && lines[i]?.[0] === '+') {
                    added.push((lines[i] as string).substring(1))
                    i++
                }
                result.push(...DiffService.pairLines(removed, added))
            } else if (prefix === '+') {
                // Additions with no preceding removals: highlight the whole line.
                while (i < lines.length && lines[i]?.[0] === '+') {
                    const content = (lines[i] as string).substring(1)
                    result.push({
                        type: 'added',
                        segments: content ? [{ text: content, kind: 'added' }] : []
                    })
                    i++
                }
            } else {
                result.push({
                    type: 'context',
                    segments: [{ text: line.substring(1), kind: 'same' }]
                })
                i++
            }
        }

        return result
    }

    /**
     * Pair removed lines with added lines index-by-index and compute a
     * word-level diff for each pair. Removed lines are emitted first (with their
     * removed words highlighted), then added lines (with their added words
     * highlighted). Unpaired extras are highlighted in full.
     */
    private static pairLines(removed: string[], added: string[]): DiffLine[] {
        const pairs = Math.min(removed.length, added.length)
        const removedLines: DiffLine[] = []
        const addedLines: DiffLine[] = []

        for (let k = 0; k < pairs; k++) {
            const remText = removed[k] as string
            const addText = added[k] as string
            const parts = diffWordsWithSpace(remText, addText)

            const remSegs: DiffSegment[] = []
            const addSegs: DiffSegment[] = []
            for (const part of parts) {
                if (part.added) {
                    addSegs.push({ text: part.value, kind: 'added' })
                } else if (part.removed) {
                    remSegs.push({ text: part.value, kind: 'removed' })
                } else {
                    remSegs.push({ text: part.value, kind: 'same' })
                    addSegs.push({ text: part.value, kind: 'same' })
                }
            }

            removedLines.push({ type: 'removed', segments: remSegs })
            addedLines.push({ type: 'added', segments: addSegs })
        }

        for (let k = pairs; k < removed.length; k++) {
            const text = removed[k] as string
            removedLines.push({
                type: 'removed',
                segments: text ? [{ text, kind: 'removed' }] : []
            })
        }
        for (let k = pairs; k < added.length; k++) {
            const text = added[k] as string
            addedLines.push({
                type: 'added',
                segments: text ? [{ text, kind: 'added' }] : []
            })
        }

        return [...removedLines, ...addedLines]
    }
}
