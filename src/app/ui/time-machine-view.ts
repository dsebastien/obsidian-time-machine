import { ItemView, Modal, type TFile, type WorkspaceLeaf } from 'obsidian'
import { VIEW_TYPE, PLUGIN_NAME } from '../constants'
import type { TimeMachinePlugin } from '../plugin'
import type { GitMetadata, Snapshot } from '../types/snapshot.intf'
import type { DiffResult } from '../types/diff.intf'
import { FileRecoveryService } from '../services/file-recovery.service'
import { SnapshotService } from '../services/snapshot.service'
import { DiffService } from '../services/diff.service'
import { RestoreService } from '../services/restore.service'
import { renderEmptyState } from './components/empty-state'
import { TimelineSliderComponent } from './components/timeline-slider'
import { DiffViewerComponent } from './components/diff-viewer'
import { formatBackupDate } from '../domain/backup'
import { log } from '../../utils/log'

export class TimeMachineView extends ItemView {
    private readonly plugin: TimeMachinePlugin
    private currentFile: TFile | null = null
    private allSnapshots: Snapshot[] = []
    private snapshots: Snapshot[] = []
    private selectedSnapshotIndex: number | null = null

    // Do NOT rename to `headerEl` — it collides with `ItemView.headerEl`. A bare
    // class field emits as `this.headerEl = undefined` after `super()` and
    // wipes out Obsidian's element. The pane-relief plugin then crashes on view
    // open when its patched `ItemView.load` calls `this.headerEl.createDiv(...)`.
    private tmHeaderEl!: HTMLElement
    private contentAreaEl!: HTMLElement
    private diffViewer: DiffViewerComponent | null = null

    override navigation = false

    constructor(leaf: WorkspaceLeaf, plugin: TimeMachinePlugin) {
        super(leaf)
        this.plugin = plugin
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
        return this.currentFile
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
        this.currentFile = null
        this.allSnapshots = []
        this.snapshots = []
    }

    async updateForFile(file: TFile | null): Promise<void> {
        if (!file) {
            this.currentFile = null
            this.allSnapshots = []
            this.snapshots = []
            this.renderHeader(null)
            renderEmptyState(this.contentAreaEl, 'no-file')
            return
        }

        this.currentFile = file
        this.selectedSnapshotIndex = null

        try {
            this.allSnapshots = await SnapshotService.getSnapshots(
                this.app,
                file.path,
                this.plugin.settings
            )
        } catch (error) {
            log('Failed to fetch snapshots', 'error', error)
            this.allSnapshots = []
        }

        if (this.allSnapshots.length === 0) {
            this.snapshots = []
            this.renderHeader(file)

            // Determine appropriate empty state
            if (!FileRecoveryService.isAvailable(this.app)) {
                renderEmptyState(this.contentAreaEl, 'file-recovery-disabled')
            } else {
                renderEmptyState(this.contentAreaEl, 'no-snapshots')
            }
            return
        }

        // Filter out snapshots identical to current file content
        const currentContent = await this.app.vault.read(file)
        this.snapshots = this.allSnapshots.filter((snapshot) => snapshot.data !== currentContent)

        this.renderHeader(file)

        if (this.snapshots.length === 0) {
            renderEmptyState(this.contentAreaEl, 'no-snapshots')
            return
        }

        this.renderContent()
    }

    /**
     * Lightweight refresh for file content changes (no re-fetch from sources).
     * Re-filters cached snapshots against current content and re-renders as needed.
     */
    async refreshCurrentContent(): Promise<void> {
        if (!this.currentFile || this.allSnapshots.length === 0) return

        const currentContent = await this.app.vault.read(this.currentFile)
        const previousCount = this.snapshots.length
        this.snapshots = this.allSnapshots.filter((snapshot) => snapshot.data !== currentContent)

        if (this.snapshots.length !== previousCount) {
            // Filtered set changed — full content re-render
            this.selectedSnapshotIndex = null
            this.renderHeader(this.currentFile)

            if (this.snapshots.length === 0) {
                renderEmptyState(this.contentAreaEl, 'no-snapshots')
                return
            }

            this.renderContent()
        } else if (this.selectedSnapshotIndex !== null) {
            // Same snapshots, just re-compute the diff against new content
            await this.computeAndRenderDiff()
        }
    }

    private renderHeader(file: TFile | null): void {
        this.tmHeaderEl.empty()

        if (!file) {
            this.tmHeaderEl.createDiv({ cls: 'tm-header-file', text: PLUGIN_NAME })
            return
        }

        this.tmHeaderEl.createDiv({ cls: 'tm-header-file', text: file.name })
        this.tmHeaderEl.createDiv({
            cls: 'tm-header-count',
            text: `${this.snapshots.length} snapshot${this.snapshots.length === 1 ? '' : 's'}`
        })
    }

    private renderContent(): void {
        this.contentAreaEl.empty()

        new TimelineSliderComponent(this.contentAreaEl, {
            onSelect: (_snapshot, index) => {
                this.selectedSnapshotIndex = index
                void this.computeAndRenderDiff()
            }
        }).render(this.snapshots)

        const diffContainer = this.contentAreaEl.createDiv({ cls: 'tm-diff-container' })
        this.diffViewer = new DiffViewerComponent(diffContainer, {
            onRestoreFullVersion: () => {
                void this.handleRestoreFullVersion()
            },
            onRestoreHunk: (hunkIndex) => {
                void this.handleRestoreHunk(hunkIndex)
            },
            onComparisonModeChange: (mode) => {
                this.plugin.settings.diffComparisonMode = mode
                void this.plugin.saveSettings()
                void this.computeAndRenderDiff()
            }
        })

        // The slider auto-selects the newest snapshot while it renders — before
        // this.diffViewer exists — so that first onSelect bails out. Render the
        // initial diff explicitly now that the viewer is in place.
        if (this.selectedSnapshotIndex !== null) {
            void this.computeAndRenderDiff()
        }
    }

    private async computeAndRenderDiff(): Promise<void> {
        if (!this.diffViewer || this.selectedSnapshotIndex === null) return

        const index = this.selectedSnapshotIndex
        const snapshot = this.snapshots[index]
        if (!snapshot || !this.currentFile) return

        const currentContent = await this.app.vault.read(this.currentFile)
        const mode = this.plugin.settings.diffComparisonMode

        // `snapshots` is newest-first, so the chronologically next (newer)
        // version of snapshots[i] is snapshots[i - 1]. The newest snapshot's
        // next is the current file content, so both modes agree at index 0.
        const nextSnapshot = mode === 'next' && index > 0 ? this.snapshots[index - 1] : null
        const newContent = nextSnapshot ? nextSnapshot.data : currentContent
        const newLabel = nextSnapshot ? this.formatDiffLabel(nextSnapshot) : 'Current'

        const oldLabel = this.formatDiffLabel(snapshot)
        const diff: DiffResult = DiffService.computeDiff(
            snapshot.data,
            newContent,
            oldLabel,
            newLabel
        )

        this.diffViewer.render(diff, mode)
    }

    private formatDiffLabel(snapshot: Snapshot): string {
        if (snapshot.source === 'git') {
            const meta = snapshot.metadata as GitMetadata
            return `Commit ${meta.shortHash} (${formatBackupDate(snapshot.ts)})`
        }
        return `Snapshot (${new Date(snapshot.ts).toLocaleString()})`
    }

    private async handleRestoreFullVersion(): Promise<void> {
        if (this.selectedSnapshotIndex === null || !this.currentFile) return

        const snapshot = this.snapshots[this.selectedSnapshotIndex]
        if (!snapshot) return

        const confirmed = await this.showConfirmDialog(
            'Restore version',
            `Are you sure you want to restore this file to the snapshot from ${new Date(snapshot.ts).toLocaleString()}? The current content will be replaced.`
        )

        if (confirmed) {
            await RestoreService.restoreFullVersion(this.app, this.currentFile, snapshot.data)
            await this.updateForFile(this.currentFile)
        }
    }

    private async handleRestoreHunk(hunkIndex: number): Promise<void> {
        if (this.selectedSnapshotIndex === null || !this.currentFile) return
        // In `next` mode the displayed hunks relate two historical versions,
        // not the current file — applying one to the live file is undefined.
        // The button is hidden in that mode; this guards against stale UI.
        if (this.plugin.settings.diffComparisonMode === 'next') return

        const snapshot = this.snapshots[this.selectedSnapshotIndex]
        if (!snapshot) return

        const currentContent = await this.app.vault.read(this.currentFile)
        const success = await RestoreService.restoreHunk(
            this.app,
            this.currentFile,
            currentContent,
            snapshot.data,
            hunkIndex
        )

        if (success) {
            await this.computeAndRenderDiff()
        }
    }

    private showConfirmDialog(title: string, message: string): Promise<boolean> {
        return new Promise((resolve) => {
            const modal = new ConfirmModal(this.app, title, message, (result) => {
                resolve(result)
            })
            modal.open()
        })
    }
}

class ConfirmModal extends Modal {
    private readonly title: string
    private readonly message: string
    private readonly callback: (result: boolean) => void

    constructor(
        app: import('obsidian').App,
        title: string,
        message: string,
        callback: (result: boolean) => void
    ) {
        super(app)
        this.title = title
        this.message = message
        this.callback = callback
    }

    override onOpen(): void {
        const { contentEl } = this
        contentEl.empty()

        contentEl.createEl('h3', { text: this.title })
        contentEl.createEl('p', { text: this.message })

        const buttonContainer = contentEl.createDiv({ cls: 'tm-confirm-buttons' })

        const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' })
        cancelBtn.addEventListener('click', () => {
            this.callback(false)
            this.close()
        })

        const confirmBtn = buttonContainer.createEl('button', {
            cls: 'mod-warning',
            text: 'Restore'
        })
        confirmBtn.addEventListener('click', () => {
            this.callback(true)
            this.close()
        })
    }

    override onClose(): void {
        this.contentEl.empty()
    }
}
