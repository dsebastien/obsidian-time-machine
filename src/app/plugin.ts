import { Notice, Plugin, debounce, type WorkspaceLeaf } from 'obsidian'
import { DEFAULT_SETTINGS } from './types/plugin-settings.intf'
import type { PluginSettings } from './types/plugin-settings.intf'
import { TimeMachineSettingTab } from './settings/settings-tab'
import { log } from '../utils/log'
import { VIEW_TYPE } from './constants'
import { TimeMachineView } from './ui/time-machine-view'
import { registerCommands } from './commands/register-commands'
import { FileRecoveryService } from './services/file-recovery.service'

export class TimeMachinePlugin extends Plugin {
    settings: PluginSettings = { ...DEFAULT_SETTINGS }

    override async onload(): Promise<void> {
        log('Initializing', 'debug')
        await this.loadSettings()

        if (!FileRecoveryService.isAvailable(this.app)) {
            new Notice(
                'Time Machine: File Recovery core plugin is not enabled. Please enable it in Settings → Core plugins.'
            )
        }

        this.registerView(VIEW_TYPE, (leaf: WorkspaceLeaf) => new TimeMachineView(leaf, this))
        registerCommands(this)

        this.registerEvent(
            this.app.workspace.on('file-open', (file) => {
                for (const view of this.getActiveViews()) {
                    void view.updateForFile(file)
                }
            })
        )

        const debouncedRefresh = debounce(
            () => {
                for (const view of this.getActiveViews()) {
                    void view.refreshCurrentContent()
                }
            },
            1000,
            true
        )

        this.registerEvent(
            this.app.vault.on('modify', (file) => {
                for (const view of this.getActiveViews()) {
                    if (view.getCurrentFile()?.path === file.path) {
                        debouncedRefresh()
                        return
                    }
                }
            })
        )

        const snapshotIntervalMs = FileRecoveryService.getSnapshotIntervalMs(this.app)
        log(`Snapshot poll interval: ${snapshotIntervalMs / 1000}s`, 'debug')
        this.registerInterval(
            window.setInterval(() => {
                for (const view of this.getActiveViews()) {
                    const currentFile = view.getCurrentFile()
                    if (currentFile) {
                        void view.updateForFile(currentFile)
                    }
                }
            }, snapshotIntervalMs)
        )

        this.addSettingTab(new TimeMachineSettingTab(this.app, this))
    }

    private getActiveViews(): TimeMachineView[] {
        return this.app.workspace
            .getLeavesOfType(VIEW_TYPE)
            .map((leaf) => leaf.view)
            .filter((view): view is TimeMachineView => view instanceof TimeMachineView)
    }

    override onunload(): void {
        log('Unloading', 'debug')
    }

    async activateView(): Promise<void> {
        const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE)
        if (existing.length > 0) {
            const leaf = existing[0]
            if (leaf) {
                await this.app.workspace.revealLeaf(leaf)
            }
            return
        }

        const leaf = this.app.workspace.getRightLeaf(false)
        if (leaf) {
            await leaf.setViewState({ type: VIEW_TYPE, active: true })
            await this.app.workspace.revealLeaf(leaf)
        }
    }

    async loadSettings(): Promise<void> {
        log('Loading settings', 'debug')
        const loadedSettings = (await this.loadData()) as PluginSettings | null

        if (!loadedSettings) {
            log('Using default settings', 'debug')
            return
        }

        this.settings = { ...DEFAULT_SETTINGS, ...loadedSettings }
        log('Settings loaded', 'debug', this.settings)
    }

    async saveSettings(): Promise<void> {
        log('Saving settings', 'debug', this.settings)
        await this.saveData(this.settings)
        log('Settings saved', 'debug', this.settings)
    }
}
