import type { App, TFile } from 'obsidian'
import { Notice } from 'obsidian'
import { DiffService } from './diff.service'
import { log } from '../../utils/log'

export class RestoreService {
    static async restoreFullVersion(app: App, file: TFile, backupData: string): Promise<void> {
        await app.vault.modify(file, backupData)
        new Notice(`Time Machine: Restored full version of "${file.name}"`)
        log('Restored full version', 'info', file.path)
    }

    static async restoreHunk(
        app: App,
        file: TFile,
        currentContent: string,
        targetContent: string,
        hunkIndex: number
    ): Promise<boolean> {
        const diff = DiffService.computeDiff(currentContent, targetContent, 'current', 'target')
        const hunk = diff.hunks[hunkIndex]
        if (!hunk) {
            log('Invalid hunk index', 'error', hunkIndex)
            new Notice('Time Machine: Could not apply hunk — invalid index')
            return false
        }

        const currentLines = currentContent.split('\n')
        const startLine = hunk.oldStart - 1

        // Parse hunk lines into removals and additions
        const removedLines: number[] = []
        const addedLines: string[] = []

        let lineOffset = 0
        for (const line of hunk.lines) {
            const prefix = line[0]
            const content = line.substring(1)
            if (prefix === '-') {
                removedLines.push(startLine + lineOffset)
                lineOffset++
            } else if (prefix === '+') {
                addedLines.push(content)
            } else {
                // Context line
                lineOffset++
            }
        }

        // Apply: remove old lines (in reverse to preserve indices), then insert new
        const resultLines = [...currentLines]

        // Remove lines in reverse order
        for (let i = removedLines.length - 1; i >= 0; i--) {
            const lineIdx = removedLines[i]
            if (lineIdx !== undefined) {
                resultLines.splice(lineIdx, 1)
            }
        }

        // Insert added lines at the position of the first removal (or startLine)
        const insertAt = removedLines[0] ?? startLine
        resultLines.splice(insertAt, 0, ...addedLines)

        const newContent = resultLines.join('\n')
        await app.vault.modify(file, newContent)
        new Notice('Time Machine: Applied hunk successfully')
        log('Applied hunk', 'info', { file: file.path, hunkIndex })
        return true
    }
}
