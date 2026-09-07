import { describe, expect, test } from 'bun:test'
import { App, TFile } from 'obsidian'
import type { Snapshot } from '../../types/snapshot.intf'
import { fileRecoveryToSnapshot } from '../../domain/snapshot'
import { TimeMachinePlugin } from '../../plugin'
import { HistoryExportModal } from './history-export-modal'

function fixture() {
    const files = new Map<string, string>()
    const app = Object.assign(new App(), {
        vault: {
            read: () => Promise.resolve('current'),
            create: (path: string, data: string) => {
                files.set(path, data)
                return Promise.resolve(Object.assign(new TFile(), { path }))
            }
        }
    })
    const plugin = new TimeMachinePlugin(app, {
        id: 'time-machine',
        name: 'Time Machine',
        version: '2.0.0',
        minAppVersion: '1.13.0',
        description: 'History',
        author: 'Test'
    })
    // The shared test preload supplies an empty Plugin constructor.
    Object.assign(plugin, { app })
    const file = Object.assign(new TFile(), { path: 'Note.md', basename: 'Note', extension: 'md' })
    const pending = Promise.withResolvers<Snapshot[]>()
    let fetches = 0
    plugin.snapshotCache.get = () => {
        fetches++
        return pending.promise
    }
    let dismissals = 0
    const modal = new HistoryExportModal(plugin, file, 'export', () => {
        dismissals++
    })
    const snapshots = [fileRecoveryToSnapshot({ path: 'Note.md', ts: 1, data: 'old' })]
    return {
        modal,
        pending,
        files,
        snapshots,
        fetches: () => fetches,
        dismissals: () => dismissals
    }
}

describe('history dialog lifecycle', () => {
    test('dismissal during fetching cancels the write', async () => {
        const f = fixture()
        const submitted = f.modal['submit']()
        await Promise.resolve()
        f.modal.onClose()
        f.pending.resolve(f.snapshots)
        await submitted
        expect(f.files.size).toBe(0)
        expect(f.dismissals()).toBe(1)
    })

    test('ignores repeated submission while fetching', async () => {
        const f = fixture()
        const first = f.modal['submit']()
        const second = f.modal['submit']()
        f.pending.resolve(f.snapshots)
        await Promise.all([first, second])
        expect(f.fetches()).toBe(1)
        expect(f.files.size).toBe(1)
        expect(f.files.get('Note (history).md')).toContain('## Version history')
    })

    test('invalid options and a closed dialog do not fetch or write', async () => {
        const f = fixture()
        f.modal['limit'] = ''
        await f.modal['submit']()
        f.modal.onClose()
        await f.modal['submit']()
        expect(f.fetches()).toBe(0)
        expect(f.files.size).toBe(0)
    })
})
