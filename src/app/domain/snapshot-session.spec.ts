import { describe, expect, test, mock, spyOn, afterEach } from 'bun:test'
import type { App, TFile } from 'obsidian'
import { SnapshotSession } from './snapshot-session'
import { SnapshotCache } from '../services/snapshot-cache'
import { SnapshotService } from '../services/snapshot.service'
import { DEFAULT_SETTINGS, type PluginSettings } from '../types/plugin-settings.intf'
import type { Snapshot } from '../types/snapshot.intf'

let spy: ReturnType<typeof spyOn> | null = null
afterEach(() => {
    spy?.mockRestore()
    spy = null
})

function snap(id: string, ts: number, data: string): Snapshot {
    return {
        id,
        path: 'note.md',
        ts,
        data,
        source: 'file-recovery',
        metadata: { source: 'file-recovery' }
    }
}

// eslint-disable-next-line obsidianmd/no-tfile-tfolder-cast
const file = { path: 'note.md', name: 'note.md' } as unknown as TFile

function createSession(
    content = 'current',
    settings: PluginSettings = { ...DEFAULT_SETTINGS }
): { session: SnapshotSession; read: ReturnType<typeof mock> } {
    const read = mock(async () => content)
    const app = { vault: { read } } as unknown as App
    const session = new SnapshotSession(
        () => app,
        new SnapshotCache(),
        () => settings
    )
    return { session, read }
}

describe('SnapshotSession', () => {
    describe('loadFor', () => {
        test('filters out snapshots identical to the current content', async () => {
            const { session } = createSession('current')
            spy = spyOn(SnapshotService, 'getSnapshots').mockResolvedValue([
                snap('a', 3000, 'current'),
                snap('b', 2000, 'older')
            ])

            await session.loadFor(file)

            expect(session.allSnapshots).toHaveLength(2)
            expect(session.snapshots.map((s) => s.id)).toEqual(['b'])
        })

        test('selects the newest surviving snapshot by default', async () => {
            const { session } = createSession('current')
            spy = spyOn(SnapshotService, 'getSnapshots').mockResolvedValue([
                snap('a', 3000, 'v3'),
                snap('b', 2000, 'v2')
            ])

            await session.loadFor(file)

            expect(session.getSelectedId()).toBe('a')
        })

        test('reports superseded when a newer load started meanwhile', async () => {
            const { session } = createSession('current')
            let release: (value: Snapshot[]) => void = () => {}
            const slow = new Promise<Snapshot[]>((r) => {
                release = r
            })
            spy = spyOn(SnapshotService, 'getSnapshots').mockImplementation((_a, path: string) =>
                path === 'slow.md' ? slow : Promise.resolve([snap('fast', 1000, 'x')])
            ) as ReturnType<typeof spyOn>

            // eslint-disable-next-line obsidianmd/no-tfile-tfolder-cast
            const slowFile = { path: 'slow.md', name: 'slow.md' } as unknown as TFile
            const first = session.loadFor(slowFile)
            await session.loadFor(file)
            release([snap('slow', 1000, 'y')])

            expect(await first).toBe('superseded')
            expect(session.file).toBe(file)
        })

        test('survives a fetch error with an empty list', async () => {
            const { session } = createSession()
            spy = spyOn(SnapshotService, 'getSnapshots').mockRejectedValue(new Error('boom'))

            expect(await session.loadFor(file)).toBe('updated')
            expect(session.allSnapshots).toEqual([])
        })

        test('clears everything for a null file', async () => {
            const { session } = createSession()
            spy = spyOn(SnapshotService, 'getSnapshots').mockResolvedValue([snap('a', 1, 'v')])
            await session.loadFor(file)

            await session.loadFor(null)

            expect(session.file).toBeNull()
            expect(session.snapshots).toEqual([])
            expect(session.getSelectedId()).toBeNull()
        })
    })

    describe('selection reconciliation', () => {
        test('keeps the selection when the snapshot survives', async () => {
            const { session } = createSession('current')
            spy = spyOn(SnapshotService, 'getSnapshots').mockResolvedValue([
                snap('a', 3000, 'v3'),
                snap('b', 2000, 'v2')
            ])
            await session.loadFor(file)
            session.select('b')

            await session.refreshContent()

            expect(session.getSelectedId()).toBe('b')
        })

        test('falls back to the nearest surviving snapshot in time', async () => {
            const { session, read } = createSession('current')
            spy = spyOn(SnapshotService, 'getSnapshots').mockResolvedValue([
                snap('a', 5000, 'v3'),
                snap('b', 4000, 'v2'),
                snap('c', 1000, 'v1')
            ])
            await session.loadFor(file)
            session.select('b')

            // 'b' now matches the live content, so it is filtered out.
            read.mockResolvedValue('v2')
            await session.refreshContent()

            // 5000 is 1000 away, 1000 is 3000 away — 'a' wins.
            expect(session.getSelectedId()).toBe('a')
        })

        test('restores a persisted selection by id', async () => {
            const { session } = createSession('current')
            session.restoreSelection('b', 2000)
            spy = spyOn(SnapshotService, 'getSnapshots').mockResolvedValue([
                snap('a', 3000, 'v3'),
                snap('b', 2000, 'v2')
            ])

            await session.loadFor(file)

            expect(session.getSelectedId()).toBe('b')
        })

        test('uses the persisted timestamp when the id is gone', async () => {
            const { session } = createSession('current')
            // This snapshot no longer exists, but its timestamp still locates
            // the nearest survivor — which is why the timestamp is persisted.
            session.restoreSelection('vanished', 2100)
            spy = spyOn(SnapshotService, 'getSnapshots').mockResolvedValue([
                snap('a', 9000, 'v3'),
                snap('b', 2000, 'v2')
            ])

            await session.loadFor(file)

            expect(session.getSelectedId()).toBe('b')
        })
    })

    describe('computeDiff', () => {
        test('current mode diffs against the live file', async () => {
            const { session } = createSession('live content')
            spy = spyOn(SnapshotService, 'getSnapshots').mockResolvedValue([
                snap('a', 3000, 'v3'),
                snap('b', 2000, 'v2')
            ])
            await session.loadFor(file)
            session.select('b')

            const result = await session.computeDiff()

            expect(result?.historical).toBe(false)
            expect(result?.baseContent).toBe('live content')
            expect(session.diffBaseContent).toBe('live content')
        })

        test('next mode diffs against the chronologically newer snapshot', async () => {
            const settings = { ...DEFAULT_SETTINGS, diffComparisonMode: 'next' as const }
            const { session } = createSession('live content', settings)
            spy = spyOn(SnapshotService, 'getSnapshots').mockResolvedValue([
                snap('a', 3000, 'v3'),
                snap('b', 2000, 'v2')
            ])
            await session.loadFor(file)
            session.select('b')

            const result = await session.computeDiff()

            expect(result?.historical).toBe(true)
        })

        test('next mode on the newest snapshot still diffs against the live file', async () => {
            const settings = { ...DEFAULT_SETTINGS, diffComparisonMode: 'next' as const }
            const { session } = createSession('live content', settings)
            spy = spyOn(SnapshotService, 'getSnapshots').mockResolvedValue([
                snap('a', 3000, 'v3'),
                snap('b', 2000, 'v2')
            ])
            await session.loadFor(file)
            session.select('a')

            const result = await session.computeDiff()

            // Both modes agree at index 0, so hunk restore stays available.
            expect(result?.historical).toBe(false)
        })

        test('returns null with no selection', async () => {
            const { session } = createSession()
            expect(await session.computeDiff()).toBeNull()
        })
    })
})
