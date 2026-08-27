import { Notice } from 'obsidian'
import type { TimeMachinePlugin } from '../plugin'
import { FileRecoveryService } from '../services/file-recovery.service'
import { openPastView } from '../services/past-view-launcher'

export function registerCommands(plugin: TimeMachinePlugin): void {
    plugin.addCommand({
        id: 'open-view',
        name: 'Open view',
        callback: () => {
            void plugin.activateView()
        }
    })

    plugin.addCommand({
        // The command name must not contain the plugin name: Obsidian already
        // prefixes commands with it in the palette (AGENTS.md).
        id: 'open-past-view',
        name: 'Open past view for current note',
        checkCallback: (checking: boolean) => {
            if (!plugin.settings.pastViewEnabled) return false
            const file = plugin.resolveActiveFile()
            if (!file || file.extension !== 'md') return false

            if (!checking) {
                void openPastView(plugin, file)
            }
            return true
        }
    })

    plugin.addCommand({
        id: 'force-snapshot',
        name: 'Force file recovery snapshot for current file',
        checkCallback: (checking: boolean) => {
            const file = plugin.app.workspace.getActiveFile()
            if (!file) return false
            if (!FileRecoveryService.isAvailable(plugin.app)) return false

            if (!checking) {
                const fileRecovery =
                    plugin.app.internalPlugins.getEnabledPluginById('file-recovery')
                if (fileRecovery) {
                    void plugin.app.vault.cachedRead(file).then((content) => {
                        void fileRecovery.forceAdd(file.path, content).then(() => {
                            new Notice(`Time Machine: Snapshot created for "${file.basename}"`)
                        })
                    })
                }
            }

            return true
        }
    })
}
