import { describe, expect, spyOn, test } from 'bun:test'
import { App, TFile, type Command } from 'obsidian'
import { TimeMachinePlugin } from '../plugin'
import { HistoryExportModal } from '../ui/components/history-export-modal'
import { registerHistoryCommands } from './history-commands'

describe('history commands', () => {
    test('exposes two Markdown-only commands and closes their modals on unload', () => {
        const plugin = new TimeMachinePlugin(new App(), {
            id: 'time-machine',
            name: 'Time Machine',
            version: '2.0.0',
            minAppVersion: '1.13.0',
            description: 'History',
            author: 'Test'
        })
        const commands: Command[] = []
        const cleanup: (() => void)[] = []
        const file = Object.assign(new TFile(), { path: 'Note.md', extension: 'md' })
        let active: TFile | null = null
        plugin.resolveActiveFile = () => active
        plugin.addCommand = (command) => {
            commands.push(command)
            return command
        }
        plugin.register = (callback) => {
            cleanup.push(callback)
        }
        const opened = spyOn(HistoryExportModal.prototype, 'open').mockImplementation(() => {})
        const closed = spyOn(HistoryExportModal.prototype, 'close').mockImplementation(() => {})
        try {
            registerHistoryCommands(plugin)
            expect(commands.map((command) => command.id)).toEqual([
                'export-version-history',
                'freeze-version-history'
            ])
            for (const command of commands) {
                expect(command.checkCallback?.(true)).toBe(false)
            }
            active = file
            for (const command of commands) {
                expect(command.checkCallback?.(true)).toBe(true)
                expect(opened).not.toHaveBeenCalled()
            }
            for (const command of commands) command.checkCallback?.(false)
            expect(opened).toHaveBeenCalledTimes(2)
            file.extension = 'png'
            for (const command of commands) expect(command.checkCallback?.(true)).toBe(false)
            cleanup.forEach((callback) => callback())
            expect(closed).toHaveBeenCalledTimes(2)
        } finally {
            opened.mockRestore()
            closed.mockRestore()
        }
    })
})
