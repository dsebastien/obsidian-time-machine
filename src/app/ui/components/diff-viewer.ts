import { setIcon } from 'obsidian'
import type { DiffHunk, DiffLine, DiffResult } from '../../types/diff.intf'
import type { DiffComparisonMode } from '../../types/plugin-settings.intf'

export interface DiffViewerCallbacks {
    onRestoreFullVersion: () => void
    onRestoreHunk: (hunkIndex: number) => void
    onComparisonModeChange: (mode: DiffComparisonMode) => void
}

export class DiffViewerComponent {
    private readonly container: HTMLElement
    private readonly callbacks: DiffViewerCallbacks

    constructor(parent: HTMLElement, callbacks: DiffViewerCallbacks) {
        this.container = parent.createDiv({ cls: 'tm-diff-viewer' })
        this.callbacks = callbacks
    }

    render(diff: DiffResult | null, mode: DiffComparisonMode = 'current'): void {
        this.container.empty()

        // The mode toggle stays visible even when the active mode reports no
        // differences — the other mode may well have some.
        const toolbar = this.container.createDiv({ cls: 'tm-diff-toolbar' })
        this.renderModeToggle(toolbar, mode)

        if (!diff || diff.hunks.length === 0) {
            this.container.createDiv({
                cls: 'tm-diff-no-changes',
                text: 'No differences found'
            })
            return
        }

        this.renderRestoreButton(toolbar)

        // Per-hunk restore only makes sense against the current file: in
        // `next` mode the hunks relate two historical versions, so applying
        // one to the live file is undefined.
        const allowHunkRestore = mode === 'current'
        for (let i = 0; i < diff.hunks.length; i++) {
            const hunk = diff.hunks[i]
            if (!hunk) continue
            this.renderHunk(hunk, i, allowHunkRestore)
        }
    }

    private renderModeToggle(toolbar: HTMLElement, mode: DiffComparisonMode): void {
        const wrap = toolbar.createDiv({ cls: 'tm-compare-mode' })
        wrap.createSpan({ cls: 'tm-compare-mode-label', text: 'Compare with' })
        const group = wrap.createDiv({ cls: 'tm-compare-mode-group' })

        const addModeButton = (target: DiffComparisonMode, text: string, tooltip: string) => {
            const btn = group.createEl('button', {
                cls: 'tm-compare-mode-btn' + (mode === target ? ' is-active' : ''),
                text,
                attr: { 'aria-label': tooltip }
            })
            btn.addEventListener('click', () => {
                if (target !== mode) {
                    this.callbacks.onComparisonModeChange(target)
                }
            })
        }

        addModeButton(
            'current',
            'Current file',
            'Everything that changed between the selected version and the file as it is now'
        )
        addModeButton(
            'next',
            'Next version',
            'Only what changed between the selected version and the next newer one'
        )
    }

    private renderRestoreButton(toolbar: HTMLElement): void {
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

    private renderHunk(hunk: DiffHunk, index: number, allowHunkRestore: boolean): void {
        const hunkEl = this.container.createDiv({ cls: 'tm-diff-hunk' })

        const hunkHeader = hunkEl.createDiv({ cls: 'tm-diff-hunk-header' })
        hunkHeader.createSpan({
            cls: 'tm-diff-hunk-range',
            text: `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`
        })

        if (allowHunkRestore) {
            const restoreHunkBtn = hunkHeader.createEl('button', {
                cls: 'tm-restore-hunk-btn clickable-icon',
                attr: { 'aria-label': 'Restore this hunk' }
            })
            setIcon(restoreHunkBtn, 'rotate-ccw')

            restoreHunkBtn.addEventListener('click', (e) => {
                e.stopPropagation()
                this.callbacks.onRestoreHunk(index)
            })
        }

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
