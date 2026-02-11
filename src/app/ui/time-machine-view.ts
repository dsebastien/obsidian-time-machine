import { ItemView, Modal, type TFile, type WorkspaceLeaf } from 'obsidian'
import { VIEW_TYPE, PLUGIN_NAME } from '../constants'
import type { TimeMachinePlugin } from '../plugin'
import type { FileRecoveryBackup } from '../types/backup.intf'
import type { DiffResult } from '../types/diff.intf'
import { FileRecoveryService } from '../services/file-recovery.service'
import { DiffService } from '../services/diff.service'
import { RestoreService } from '../services/restore.service'
import { renderEmptyState } from './components/empty-state'
import { TimelineSliderComponent } from './components/timeline-slider'
import { DiffViewerComponent } from './components/diff-viewer'
import { log } from '../../utils/log'

export class TimeMachineView extends ItemView {
    private currentFile: TFile | null = null
    private backups: FileRecoveryBackup[] = []
    private selectedBackupIndex: number | null = null

    // UI component references
    private headerEl!: HTMLElement
    private contentAreaEl!: HTMLElement
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

        let allBackups: FileRecoveryBackup[] = []
        try {
            allBackups = await FileRecoveryService.getBackups(this.app, file.path)
        } catch (error) {
            log('Failed to fetch backups', 'error', error)
            allBackups = []
        }

        if (allBackups.length === 0) {
            this.backups = []
            this.renderHeader(file)
            renderEmptyState(this.contentAreaEl, 'no-snapshots')
            return
        }

        // Filter out snapshots identical to current file content
        const currentContent = await this.app.vault.read(file)
        this.backups = allBackups.filter((backup) => backup.data !== currentContent)

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
            this.headerEl.createDiv({ cls: 'tm-header-file', text: PLUGIN_NAME })
            return
        }

        this.headerEl.createDiv({ cls: 'tm-header-file', text: file.name })
        this.headerEl.createDiv({
            cls: 'tm-header-count',
            text: `${this.backups.length} snapshot${this.backups.length === 1 ? '' : 's'}`
        })
    }

    private renderContent(): void {
        this.contentAreaEl.empty()

        new TimelineSliderComponent(this.contentAreaEl, {
            onSelect: (_backup, index) => {
                this.selectedBackupIndex = index
                void this.computeAndRenderDiff()
            }
        }).render(this.backups)

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

    private async computeAndRenderDiff(): Promise<void> {
        if (!this.diffViewer || this.selectedBackupIndex === null) return

        const backup = this.backups[this.selectedBackupIndex]
        if (!backup || !this.currentFile) return

        const currentContent = await this.app.vault.read(this.currentFile)
        const diff: DiffResult = DiffService.computeDiff(
            backup.data,
            currentContent,
            `Snapshot (${new Date(backup.ts).toLocaleString()})`,
            'Current'
        )

        this.diffViewer.render(diff)
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
