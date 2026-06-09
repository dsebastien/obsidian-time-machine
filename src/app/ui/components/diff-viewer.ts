import { setIcon } from 'obsidian'
import type { DiffHunk, DiffLine, DiffResult } from '../../types/diff.intf'

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

    private renderHunk(hunk: DiffHunk, index: number): void {
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
        for (const line of hunk.renderLines) {
            this.renderLine(linesEl, line)
        }
    }

    private renderLine(linesEl: HTMLElement, line: DiffLine): void {
        let lineClass = 'tm-diff-line tm-diff-context'
        let prefix = ' '
        if (line.type === 'added') {
            lineClass = 'tm-diff-line tm-diff-added'
            prefix = '+'
        } else if (line.type === 'removed') {
            lineClass = 'tm-diff-line tm-diff-removed'
            prefix = '-'
        }

        const lineEl = linesEl.createDiv({ cls: lineClass })
        lineEl.createSpan({ cls: 'tm-diff-line-prefix', text: prefix })
        const contentEl = lineEl.createSpan({ cls: 'tm-diff-line-content' })
        for (const segment of line.segments) {
            if (segment.kind === 'same') {
                contentEl.createSpan({ text: segment.text })
            } else {
                contentEl.createSpan({
                    cls: segment.kind === 'added' ? 'tm-diff-word-added' : 'tm-diff-word-removed',
                    text: segment.text
                })
            }
        }
    }
}
