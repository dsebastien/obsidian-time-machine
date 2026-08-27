import { ItemView, Notice, setIcon, type TFile, type WorkspaceLeaf } from 'obsidian'
import { VIEW_TYPE, PLUGIN_NAME } from '../constants'
import type { TimeMachinePlugin } from '../plugin'
import type { DiffComparisonMode } from '../types/plugin-settings.intf'
import { FileRecoveryService } from '../services/file-recovery.service'
import { RestoreService } from '../services/restore.service'
import { SnapshotSession } from '../domain/snapshot-session'
import { renderEmptyState } from './components/empty-state'
import { TimelineBarComponent } from './components/timeline-bar'
import { DiffViewerComponent } from './components/diff-viewer'
import { renderComparisonModeControl } from './components/comparison-mode-control'
import { showConfirmDialog } from './components/confirm-modal'
import { renderRestoreFullButton } from './components/restore-button'
import type { HistoryView } from './history-view'
import { openPastView } from '../services/past-view-launcher'

export class TimeMachineView extends ItemView implements HistoryView {
    private readonly plugin: TimeMachinePlugin
    private readonly session: SnapshotSession

    // Do NOT rename to `headerEl` — it collides with `ItemView.headerEl`. A bare
    // class field emits as `this.headerEl = undefined` after `super()` and
    // wipes out Obsidian's element. The pane-relief plugin then crashes on view
    // open when its patched `ItemView.load` calls `this.headerEl.createDiv(...)`.
    private tmHeaderEl!: HTMLElement
    private contentAreaEl!: HTMLElement
    private timelineBar: TimelineBarComponent | null = null
    private diffViewer: DiffViewerComponent | null = null

    override navigation = false

    constructor(leaf: WorkspaceLeaf, plugin: TimeMachinePlugin) {
        super(leaf)
        this.plugin = plugin
        this.session = new SnapshotSession(
            () => this.app,
            plugin.snapshotCache,
            () => this.plugin.settings
        )
    }

    override getViewType(): string {
        return VIEW_TYPE
    }

    override getDisplayText(): string {
        return PLUGIN_NAME
    }

    override getIcon(): string {
        return 'clock'
    }

    getCurrentFile(): TFile | null {
        return this.session.file
    }

    followsActiveFile(): boolean {
        return true
    }

    override async onOpen(): Promise<void> {
        const container = this.containerEl.children[1]
        if (!container) return

        container.empty()
        const root = container as HTMLElement
        root.addClass('tm-root')

        this.tmHeaderEl = root.createDiv({ cls: 'tm-header' })
        this.contentAreaEl = root.createDiv({ cls: 'tm-content' })

        const activeFile = this.plugin.resolveActiveFile()
        if (activeFile) {
            await this.updateForFile(activeFile)
        } else {
            renderEmptyState(this.contentAreaEl, 'no-file')
        }
    }

    override async onClose(): Promise<void> {
        await this.session.loadFor(null)
    }

    override onResize(): void {
        this.timelineBar?.handleResize()
    }

    async updateForFile(file: TFile | null): Promise<void> {
        if (!file) {
            await this.session.loadFor(null)
            this.renderHeader(null)
            renderEmptyState(this.contentAreaEl, 'no-file')
            return
        }

        const outcome = await this.session.loadFor(file)
        if (outcome === 'superseded') return

        this.renderHeader(file)

        if (this.session.allSnapshots.length === 0) {
            if (!FileRecoveryService.isAvailable(this.app)) {
                renderEmptyState(this.contentAreaEl, 'file-recovery-disabled')
            } else {
                renderEmptyState(this.contentAreaEl, 'no-snapshots')
            }
            return
        }

        if (this.session.snapshots.length === 0) {
            renderEmptyState(this.contentAreaEl, 'no-snapshots')
            return
        }

        this.renderContent()
    }

    /**
     * Lightweight refresh for file content changes (no re-fetch from sources).
     */
    async refreshCurrentContent(): Promise<void> {
        if (!this.session.file || this.session.allSnapshots.length === 0) return

        const outcome = await this.session.refreshContent()
        if (outcome === 'superseded') return

        if (outcome === 'updated') {
            this.renderHeader(this.session.file)

            if (this.session.snapshots.length === 0) {
                renderEmptyState(this.contentAreaEl, 'no-snapshots')
                return
            }

            this.renderContent()
            return
        }

        // Same snapshots — the diff still has to be recomputed, because the
        // content it was diffed against changed. This matters in `next` mode
        // too: the newest snapshot's "next" target IS the live file.
        await this.computeAndRenderDiff()
    }

    onComparisonModeChanged(): void {
        if (!this.session.file || this.session.snapshots.length === 0) return
        this.renderContent()
    }

    private renderHeader(file: TFile | null): void {
        this.tmHeaderEl.empty()

        if (!file) {
            this.tmHeaderEl.createDiv({ cls: 'tm-header-file', text: PLUGIN_NAME })
            return
        }

        const count = this.session.snapshots.length
        const row = this.tmHeaderEl.createDiv({ cls: 'tm-header-row' })
        // The name truncates in a narrow panel, so the full path is on hover.
        row.createDiv({
            cls: 'tm-header-file',
            text: file.name,
            attr: { 'aria-label': file.path }
        })

        if (this.plugin.settings.pastViewEnabled) {
            // Promotes to the full side-by-side view, carrying the current
            // selection so the user does not lose their place.
            //
            // Labelled, and deliberately NOT a clock-with-arrow: an icon-only
            // history glyph next to a version reads as "revert to this", which
            // is the opposite of what it does.
            const openBtn = row.createEl('button', {
                cls: 'tm-header-open-past',
                text: 'Side by side',
                attr: { 'aria-label': 'Open this version beside the note' }
            })
            const openIcon = openBtn.createSpan({ cls: 'tm-header-open-past-icon' })
            setIcon(openIcon, 'columns-2')
            openBtn.prepend(openIcon)
            openBtn.addEventListener('click', () => {
                void openPastView(this.plugin, file, {
                    snapshotId: this.session.getSelectedId(),
                    snapshotTimestamp: this.session.getSelectedTs()
                })
            })
        }

        this.tmHeaderEl.createDiv({
            cls: 'tm-header-count',
            text: `${String(count)} version${count === 1 ? '' : 's'}`
        })
    }

    private renderContent(): void {
        this.contentAreaEl.empty()

        this.timelineBar = new TimelineBarComponent(this.contentAreaEl, {
            onSelect: (snapshotId) => {
                this.session.select(snapshotId)
                this.renderTimeline()
                void this.computeAndRenderDiff()
            }
        })
        this.renderTimeline()

        const diffContainer = this.contentAreaEl.createDiv({ cls: 'tm-diff-container' })

        const toolbar = diffContainer.createDiv({ cls: 'tm-diff-toolbar' })
        renderComparisonModeControl(
            toolbar,
            this.plugin.settings.diffComparisonMode,
            (mode: DiffComparisonMode) => {
                void this.plugin.setComparisonMode(mode)
            }
        )
        renderRestoreFullButton(toolbar, () => {
            void this.handleRestoreFullVersion()
        })

        this.diffViewer = new DiffViewerComponent(diffContainer, {
            onRestoreHunk: (hunkIndex) => {
                void this.handleRestoreHunk(hunkIndex)
            }
        })

        void this.computeAndRenderDiff()
    }

    private renderTimeline(): void {
        this.timelineBar?.render(this.session.snapshots, this.session.getSelectedId())
    }

    private async computeAndRenderDiff(): Promise<void> {
        if (!this.diffViewer) return

        const result = await this.session.computeDiff()
        if (!result || !this.diffViewer) return

        this.diffViewer.render(result.diff, { allowHunkRestore: !result.historical })
    }

    private async handleRestoreFullVersion(): Promise<void> {
        const snapshot = this.session.selectedSnapshot
        const file = this.session.file
        if (!snapshot || !file) return
        // Refuse a snapshot that does not belong to this note. Both are read
        // from session state that a concurrent load could have moved on from.
        if (snapshot.path !== file.path) return

        const confirmed = await showConfirmDialog(
            this.app,
            'Restore version',
            `Are you sure you want to restore this file to the snapshot from ${new Date(snapshot.ts).toLocaleString()}? The current content will be replaced.`
        )

        if (confirmed) {
            await RestoreService.restoreFullVersion(this.app, file, snapshot.data)
            await this.updateForFile(file)
        }
    }

    private async handleRestoreHunk(hunkIndex: number): Promise<void> {
        const snapshot = this.session.selectedSnapshot
        const file = this.session.file
        if (!snapshot || !file) return
        // Refuse a snapshot that does not belong to this note. Both are read
        // from session state that a concurrent load could have moved on from.
        if (snapshot.path !== file.path) return

        // In `next` mode the displayed hunks relate two historical versions, not
        // the current file — applying one to the live file is undefined. The
        // button is hidden in that mode; this guards against stale UI.
        if (this.plugin.settings.diffComparisonMode === 'next') return

        const currentContent = await this.app.vault.read(file)

        // The rendered hunks were computed against `diffBaseContent`. If the file
        // changed since (an edit landing during the refresh debounce), the hunk
        // ordinal no longer addresses the same change — applying it would restore
        // the wrong hunk. Refuse and re-render instead.
        if (
            this.session.diffBaseContent !== null &&
            currentContent !== this.session.diffBaseContent
        ) {
            new Notice('Time Machine: The file changed — the diff was refreshed, try again.')
            await this.computeAndRenderDiff()
            return
        }

        const success = await RestoreService.restoreHunk(
            this.app,
            file,
            currentContent,
            snapshot.data,
            hunkIndex
        )

        if (success) {
            await this.computeAndRenderDiff()
        }
    }
}
