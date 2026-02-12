import { Notice } from 'obsidian'
import type { TimeMachinePlugin } from '../plugin'
import { FileRecoveryService } from '../services/file-recovery.service'

export function registerCommands(plugin: TimeMachinePlugin): void {
    plugin.addCommand({
        id: 'open-time-machine',
        name: 'Open view',
        callback: () => {
            void plugin.activateView()
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
