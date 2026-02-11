import { Notice, Plugin, type WorkspaceLeaf } from 'obsidian'
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
                const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE)
                for (const leaf of leaves) {
                    const view = leaf.view as TimeMachineView
                    if (view.getViewType() === VIEW_TYPE) {
                        void view.updateForFile(file)
                    }
                }
            })
        )

        this.addSettingTab(new TimeMachineSettingTab(this.app, this))
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
