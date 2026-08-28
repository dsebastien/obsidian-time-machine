import { describe, expect, test, spyOn, afterEach } from 'bun:test'
import type { App } from 'obsidian'
import { SnapshotCache } from './snapshot-cache'
import { SnapshotService } from './snapshot.service'
import { DEFAULT_SETTINGS } from '../types/plugin-settings.intf'
import type { Snapshot } from '../types/snapshot.intf'

// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents -- bun's spyOn return type widens to any; the alias keeps call sites readable
let spy: ReturnType<typeof spyOn> | null = null
afterEach(() => {
    spy?.mockRestore()
    spy = null
})

const app = {} as App

function snap(id: string): Snapshot {
    return {
        id,
        path: 'note.md',
        ts: 1000,
        data: 'x',
        source: 'file-recovery',
        metadata: { source: 'file-recovery' }
    }
}

describe('SnapshotCache', () => {
    test('joins concurrent requests for the same file into one fetch', async () => {
        const cache = new SnapshotCache()
        let resolve: (value: Snapshot[]) => void = () => {}
        const pending = new Promise<Snapshot[]>((r) => {
            resolve = r
        })
        spy = spyOn(SnapshotService, 'getSnapshots').mockReturnValue(pending)

        // Two views asking at the same time — the expensive git work must run once.
        const a = cache.get(app, 'note.md', DEFAULT_SETTINGS)
        const b = cache.get(app, 'note.md', DEFAULT_SETTINGS)

        resolve([snap('fr-1')])
        expect(await a).toEqual(await b)
        expect(spy).toHaveBeenCalledTimes(1)
    })

    test('does not join requests for different files', async () => {
        const cache = new SnapshotCache()
        spy = spyOn(SnapshotService, 'getSnapshots').mockResolvedValue([])

        await Promise.all([
            cache.get(app, 'a.md', DEFAULT_SETTINGS),
            cache.get(app, 'b.md', DEFAULT_SETTINGS)
        ])

        expect(spy).toHaveBeenCalledTimes(2)
    })

    test('does not join requests made under different git settings', async () => {
        const cache = new SnapshotCache()
        spy = spyOn(SnapshotService, 'getSnapshots').mockResolvedValue([])

        await Promise.all([
            cache.get(app, 'note.md', DEFAULT_SETTINGS),
            cache.get(app, 'note.md', { ...DEFAULT_SETTINGS, gitMaxCommits: 10 })
        ])

        expect(spy).toHaveBeenCalledTimes(2)
    })

    test('fetches again after the previous request settled', async () => {
        const cache = new SnapshotCache()
        spy = spyOn(SnapshotService, 'getSnapshots').mockResolvedValue([])

        await cache.get(app, 'note.md', DEFAULT_SETTINGS)
        await cache.get(app, 'note.md', DEFAULT_SETTINGS)

        // Nothing is cached across ticks: stale history is worse than a re-fetch.
        expect(spy).toHaveBeenCalledTimes(2)
    })

    test('a rejected fetch does not poison later requests', async () => {
        const cache = new SnapshotCache()
        spy = spyOn(SnapshotService, 'getSnapshots').mockRejectedValueOnce(new Error('git broke'))

        expect(cache.get(app, 'note.md', DEFAULT_SETTINGS)).rejects.toThrow('git broke')

        spy.mockResolvedValue([snap('fr-2')])
        expect(await cache.get(app, 'note.md', DEFAULT_SETTINGS)).toHaveLength(1)
    })
})
