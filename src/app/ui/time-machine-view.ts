import { ItemView, Modal, type TFile, type WorkspaceLeaf } from 'obsidian'
import { VIEW_TYPE, PLUGIN_NAME } from '../constants'
import type { TimeMachinePlugin } from '../plugin'
import type { FileRecoveryBackup } from '../types/backup.intf'
import type { CompareMode } from '../types/diff.intf'
import type { DiffResult } from '../types/diff.intf'
import { FileRecoveryService } from '../services/file-recovery.service'
import { DiffService } from '../services/diff.service'
import { RestoreService } from '../services/restore.service'
import { renderEmptyState } from './components/empty-state'
import { VersionListComponent } from './components/version-list'
import { CompareModeSelectorComponent } from './components/compare-mode-selector'
import { DiffViewerComponent } from './components/diff-viewer'
import { log } from '../../utils/log'

export class TimeMachineView extends ItemView {
    private currentFile: TFile | null = null
    private backups: FileRecoveryBackup[] = []
    private compareMode: CompareMode = 'current-vs-version'
    private selectedBackupIndex: number | null = null
    private secondSelectedBackupIndex: number | null = null

    // UI component references
    private headerEl!: HTMLElement
    private contentAreaEl!: HTMLElement
    private versionList: VersionListComponent | null = null
    private diffViewer: DiffViewerComponent | null = null

    override navigation = false

    constructor(leaf: WorkspaceLeaf, _plugin: TimeMachinePlugin) {
        super(leaf)
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

    override async onOpen(): Promise<void> {
        const container = this.containerEl.children[1]
        if (!container) return

        container.empty()
        const root = container as HTMLElement
        root.addClass('tm-root')

        this.headerEl = root.createDiv({ cls: 'tm-header' })
        this.contentAreaEl = root.createDiv({ cls: 'tm-content' })

        const activeFile = this.app.workspace.getActiveFile()
        if (activeFile) {
            await this.updateForFile(activeFile)
        } else {
            renderEmptyState(this.contentAreaEl, 'no-file')
        }
    }

    override async onClose(): Promise<void> {
        this.currentFile = null
        this.backups = []
    }

    async updateForFile(file: TFile | null): Promise<void> {
        if (!file) {
            this.currentFile = null
            this.backups = []
            this.renderHeader(null)
            renderEmptyState(this.contentAreaEl, 'no-file')
            return
        }

        if (!FileRecoveryService.isAvailable(this.app)) {
            this.currentFile = null
            this.backups = []
            this.renderHeader(null)
            renderEmptyState(this.contentAreaEl, 'file-recovery-disabled')
            return
        }

        this.currentFile = file
        this.selectedBackupIndex = null
        this.secondSelectedBackupIndex = null

        try {
            this.backups = await FileRecoveryService.getBackups(this.app, file.path)
        } catch (error) {
            log('Failed to fetch backups', 'error', error)
            this.backups = []
        }

        this.renderHeader(file)

        if (this.backups.length === 0) {
            renderEmptyState(this.contentAreaEl, 'no-snapshots')
            return
        }

        this.renderContent()
    }

    private renderHeader(file: TFile | null): void {
        this.headerEl.empty()

        if (!file) {
            this.headerEl.createDiv({ cls: 'tm-header-title', text: PLUGIN_NAME })
            return
        }

        this.headerEl.createDiv({ cls: 'tm-header-title', text: PLUGIN_NAME })
        this.headerEl.createDiv({ cls: 'tm-header-file', text: file.name })
        this.headerEl.createDiv({
            cls: 'tm-header-count',
            text: `${this.backups.length} snapshot${this.backups.length === 1 ? '' : 's'}`
        })
    }

    private renderContent(): void {
        this.contentAreaEl.empty()

        new CompareModeSelectorComponent(this.contentAreaEl, {
            onChange: (mode) => {
                this.compareMode = mode
                this.selectedBackupIndex = null
                this.secondSelectedBackupIndex = null
                if (this.versionList) {
                    this.versionList.setCompareMode(mode)
                }
                this.clearDiff()
            }
        })

        this.versionList = new VersionListComponent(this.contentAreaEl, {
            onSelect: (_backup, index) => {
                this.handleVersionSelect(index)
            }
        })
        this.versionList.render(this.backups)

        const diffContainer = this.contentAreaEl.createDiv({ cls: 'tm-diff-container' })
        this.diffViewer = new DiffViewerComponent(diffContainer, {
            onRestoreFullVersion: () => {
                void this.handleRestoreFullVersion()
            },
            onRestoreHunk: (hunkIndex) => {
                void this.handleRestoreHunk(hunkIndex)
            }
        })
    }

    private handleVersionSelect(index: number): void {
        if (this.compareMode === 'current-vs-version') {
            this.selectedBackupIndex = index
            void this.computeAndRenderDiff()
        } else {
            // version-vs-version
            const selected = this.versionList?.getSelectedIndices() ?? []
            if (selected.length === 2) {
                this.selectedBackupIndex = selected[0] ?? null
                this.secondSelectedBackupIndex = selected[1] ?? null
                void this.computeAndRenderDiff()
            } else {
                this.clearDiff()
            }
        }
    }

    private async computeAndRenderDiff(): Promise<void> {
        if (!this.diffViewer) return

        let diff: DiffResult | null = null

        if (this.compareMode === 'current-vs-version' && this.selectedBackupIndex !== null) {
            const backup = this.backups[this.selectedBackupIndex]
            if (!backup || !this.currentFile) return

            const currentContent = await this.app.vault.read(this.currentFile)
            diff = DiffService.computeDiff(
                backup.data,
                currentContent,
                `Snapshot (${new Date(backup.ts).toLocaleString()})`,
                'Current'
            )
        } else if (
            this.compareMode === 'version-vs-version' &&
            this.selectedBackupIndex !== null &&
            this.secondSelectedBackupIndex !== null
        ) {
            const older =
                this.backups[Math.max(this.selectedBackupIndex, this.secondSelectedBackupIndex)]
            const newer =
                this.backups[Math.min(this.selectedBackupIndex, this.secondSelectedBackupIndex)]
            if (!older || !newer) return

            diff = DiffService.computeDiff(
                older.data,
                newer.data,
                `Snapshot (${new Date(older.ts).toLocaleString()})`,
                `Snapshot (${new Date(newer.ts).toLocaleString()})`
            )
        }

        this.diffViewer.render(diff)
    }

    private clearDiff(): void {
        if (this.diffViewer) {
            this.diffViewer.render(null)
        }
    }

    private async handleRestoreFullVersion(): Promise<void> {
        if (this.selectedBackupIndex === null || !this.currentFile) return

        const backup = this.backups[this.selectedBackupIndex]
        if (!backup) return

        const confirmed = await this.showConfirmDialog(
            'Restore version',
            `Are you sure you want to restore this file to the snapshot from ${new Date(backup.ts).toLocaleString()}? The current content will be replaced.`
        )

        if (confirmed) {
            await RestoreService.restoreFullVersion(this.app, this.currentFile, backup.data)
            await this.updateForFile(this.currentFile)
        }
    }

    private async handleRestoreHunk(hunkIndex: number): Promise<void> {
        if (this.selectedBackupIndex === null || !this.currentFile) return

        const backup = this.backups[this.selectedBackupIndex]
        if (!backup) return

        const currentContent = await this.app.vault.read(this.currentFile)
        const success = await RestoreService.restoreHunk(
            this.app,
            this.currentFile,
            currentContent,
            backup.data,
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
