import type { TimeMachinePlugin } from '../plugin'

export function registerCommands(plugin: TimeMachinePlugin): void {
    plugin.addCommand({
        id: 'open-time-machine',
        name: 'Open view',
        callback: () => {
            void plugin.activateView()
        }
    })
}
