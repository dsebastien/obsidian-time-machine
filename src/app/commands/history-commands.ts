import type { TimeMachinePlugin } from '../plugin'
import { HistoryExportModal } from '../ui/components/history-export-modal'

export function registerHistoryCommands(plugin: TimeMachinePlugin): void {
    const modals = new Set<HistoryExportModal>()
    plugin.register(() => {
        for (const modal of modals) modal.close()
        modals.clear()
    })
    for (const target of ['export', 'freeze'] as const) {
        plugin.addCommand({
            id: `${target}-version-history`,
            name:
                target === 'export'
                    ? 'Export version history to Markdown'
                    : 'Freeze version history into current note',
            checkCallback: (checking) => {
                const file = plugin.resolveActiveFile()
                if (!file || file.extension !== 'md') return false
                if (!checking) {
                    const modal = new HistoryExportModal(plugin, file, target, () => {
                        modals.delete(modal)
                    })
                    modals.add(modal)
                    modal.open()
                }
                return true
            }
        })
    }
}
