import { structuredPatch } from 'diff'
import type { DiffResult } from '../types/diff.intf'

export class DiffService {
    static computeDiff(
        oldText: string,
        newText: string,
        oldLabel: string,
        newLabel: string
    ): DiffResult {
        const patch = structuredPatch(oldLabel, newLabel, oldText, newText, '', '', {
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
                lines: h.lines
            }))
        }
    }

    static hasChanges(diffResult: DiffResult): boolean {
        return diffResult.hunks.length > 0
    }
}
