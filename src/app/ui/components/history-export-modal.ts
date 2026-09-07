import { Modal, Notice, Setting, type ButtonComponent, type TFile } from 'obsidian'
import type { TimeMachinePlugin } from '../../plugin'
import { parseHistoryOptions } from '../../domain/history-export'
import { writeNoteHistory, type PreparedHistory } from '../../services/history-export.service'
import { ConfirmModal } from './confirm-modal'
import { log } from '../../../utils/log'

/** Options are per operation, not persisted settings. */
export class HistoryExportModal extends Modal {
    private format = 'diffs'
    private limit: string
    private busy = false
    private closed = false
    private statusEl: HTMLElement | null = null
    private submitButton: ButtonComponent | null = null
    private confirmation: ConfirmModal | null = null
    private readonly path: string

    constructor(
        private readonly plugin: TimeMachinePlugin,
        private readonly file: TFile,
        private readonly target: 'export' | 'freeze',
        private readonly onDismiss: () => void
    ) {
        super(plugin.app)
        this.path = file.path
        this.limit = target === 'freeze' ? '20' : 'all'
    }

    override onOpen(): void {
        this.setTitle(
            this.target === 'export' ? 'Export version history' : 'Freeze version history'
        )
        this.contentEl.createEl('p', { text: this.path })
        this.contentEl.createEl('p', {
            text:
                this.target === 'export'
                    ? 'Create a separate Markdown note beside this note. Existing files are never overwritten.'
                    : 'Write a static version history section into this note. Any existing generated section will be replaced after confirmation.'
        })
        new Setting(this.contentEl).setName('Content').addDropdown((dropdown) => {
            dropdown
                .addOption('diffs', 'Changes between versions')
                .addOption('full', 'Full versions')
                .setValue(this.format)
                .onChange((value) => {
                    this.format = value
                })
            dropdown.selectEl.setAttribute('aria-label', 'History content')
        })
        new Setting(this.contentEl)
            .setName('Maximum versions')
            .setDesc('Newest versions to include. Enter a positive number or "all".')
            .addText((text) => {
                text.setValue(this.limit).onChange((value) => {
                    this.limit = value
                })
                text.inputEl.setAttribute('aria-label', 'Maximum versions')
            })
        const git = this.plugin.settings.gitIntegrationEnabled
            ? `Git is desktop-only and limited to ${this.plugin.settings.gitMaxCommits} commits per file.`
            : 'Git integration is disabled.'
        this.contentEl.createEl('p', {
            text: `Only retained history from available sources is included. ${git} Previously frozen history is excluded. Output is limited to 10 MiB.`
        })
        this.statusEl = this.contentEl.createEl('p', {
            attr: { 'role': 'status', 'aria-live': 'polite' }
        })
        new Setting(this.contentEl)
            .addButton((button) => {
                button.setButtonText('Cancel').onClick(() => this.close())
            })
            .addButton((button) => {
                this.submitButton = button
                button
                    .setButtonText(this.target === 'export' ? 'Export' : 'Continue')
                    .setCta()
                    .onClick(() => {
                        void this.submit()
                    })
            })
    }

    private confirm(prepared: PreparedHistory): Promise<boolean> {
        return new Promise((resolve) => {
            this.confirmation = new ConfirmModal(
                this.app,
                'Freeze history into this note?',
                `Write ${prepared.versionCount} of ${prepared.availableCount} available versions (${(prepared.bytes / 1024).toFixed(1)} KiB) into "${prepared.path}"? This replaces the generated history section, including any edits inside it, and may create a new File Recovery snapshot. Other note content is preserved.`,
                resolve,
                'Freeze history'
            )
            this.confirmation.open()
        })
    }

    private async submit(): Promise<void> {
        if (this.busy || this.closed) return
        this.busy = true
        this.submitButton?.setDisabled(true)
        try {
            const options = parseHistoryOptions(this.format, this.limit)
            if (this.file.path !== this.path)
                throw new Error('The note was renamed. Run the command again.')
            this.statusEl?.setText('Preparing version history...')
            const settings = { ...this.plugin.settings }
            const result = await writeNoteHistory(
                {
                    vault: this.app.vault,
                    fetchSnapshots: (path) =>
                        this.plugin.snapshotCache.get(this.app, path, settings),
                    confirm: (prepared) => this.confirm(prepared),
                    cancelled: () => this.closed
                },
                this.file,
                this.target,
                options
            )
            if (!result) {
                if (!this.closed) this.statusEl?.setText('Cancelled. No changes were made.')
                return
            }
            const message =
                result.kind === 'exported'
                    ? `Created "${result.file.path}"`
                    : result.kind === 'frozen'
                      ? 'Version history frozen into the note'
                      : 'Version history is already up to date'
            new Notice(`Time Machine: ${message}`)
            this.close()
        } catch (error) {
            log('Could not write version history', 'error', error)
            if (!this.closed) {
                const message = error instanceof Error ? error.message : String(error)
                this.statusEl?.setText(message)
                new Notice(`Time Machine: ${message}`)
            }
        } finally {
            this.busy = false
            if (!this.closed) this.submitButton?.setDisabled(false)
        }
    }

    override onClose(): void {
        this.closed = true
        this.confirmation?.close()
        this.confirmation = null
        this.contentEl.empty()
        this.onDismiss()
    }
}
