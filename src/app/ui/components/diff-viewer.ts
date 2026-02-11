import { setIcon } from 'obsidian'
import type { DiffResult } from '../../types/diff.intf'

export interface DiffViewerCallbacks {
    onRestoreFullVersion: () => void
    onRestoreHunk: (hunkIndex: number) => void
}

export class DiffViewerComponent {
    private readonly container: HTMLElement
    private readonly callbacks: DiffViewerCallbacks

    constructor(parent: HTMLElement, callbacks: DiffViewerCallbacks) {
        this.container = parent.createDiv({ cls: 'tm-diff-viewer' })
        this.callbacks = callbacks
    }

    render(diff: DiffResult | null): void {
        this.container.empty()

        if (!diff || diff.hunks.length === 0) {
            this.container.createDiv({
                cls: 'tm-diff-no-changes',
                text: 'No differences found'
            })
            return
        }

        this.renderRestoreButton()
        this.renderDiffHeader(diff)

        for (let i = 0; i < diff.hunks.length; i++) {
            const hunk = diff.hunks[i]
            if (!hunk) continue
            this.renderHunk(hunk, i)
        }
    }

    private renderRestoreButton(): void {
        const toolbar = this.container.createDiv({ cls: 'tm-diff-toolbar' })
        const restoreBtn = toolbar.createEl('button', {
            cls: 'tm-restore-full-btn',
            text: 'Restore entire version'
        })
        const iconSpan = restoreBtn.createSpan({ cls: 'tm-restore-btn-icon' })
        setIcon(iconSpan, 'rotate-ccw')
        restoreBtn.prepend(iconSpan)

        restoreBtn.addEventListener('click', () => {
            this.callbacks.onRestoreFullVersion()
        })
    }

    private renderDiffHeader(diff: DiffResult): void {
        const header = this.container.createDiv({ cls: 'tm-diff-header' })
        header.createSpan({ cls: 'tm-diff-old-label', text: diff.oldHeader })
        header.createSpan({ cls: 'tm-diff-arrow', text: ' → ' })
        header.createSpan({ cls: 'tm-diff-new-label', text: diff.newHeader })
    }

    private renderHunk(
        hunk: {
            oldStart: number
            oldLines: number
            newStart: number
            newLines: number
            lines: string[]
        },
        index: number
    ): void {
        const hunkEl = this.container.createDiv({ cls: 'tm-diff-hunk' })

        const hunkHeader = hunkEl.createDiv({ cls: 'tm-diff-hunk-header' })
        hunkHeader.createSpan({
            cls: 'tm-diff-hunk-range',
            text: `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`
        })

        const restoreHunkBtn = hunkHeader.createEl('button', {
            cls: 'tm-restore-hunk-btn clickable-icon',
            attr: { 'aria-label': 'Restore this hunk' }
        })
        setIcon(restoreHunkBtn, 'rotate-ccw')

        restoreHunkBtn.addEventListener('click', (e) => {
            e.stopPropagation()
            this.callbacks.onRestoreHunk(index)
        })

        const linesEl = hunkEl.createDiv({ cls: 'tm-diff-lines' })
        for (const line of hunk.lines) {
            const prefix = line[0]
            const content = line.substring(1)

            let lineClass = 'tm-diff-line tm-diff-context'
            if (prefix === '+') {
                lineClass = 'tm-diff-line tm-diff-added'
            } else if (prefix === '-') {
                lineClass = 'tm-diff-line tm-diff-removed'
            }

            const lineEl = linesEl.createDiv({ cls: lineClass })
            lineEl.createSpan({ cls: 'tm-diff-line-prefix', text: prefix ?? ' ' })
            lineEl.createSpan({ cls: 'tm-diff-line-content', text: content })
        }
    }
}
