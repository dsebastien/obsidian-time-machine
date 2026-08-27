import { describe, expect, test, mock, spyOn, afterEach } from 'bun:test'
import type { App, TFile } from 'obsidian'
import { SnapshotSession } from './snapshot-session'
import { SnapshotCache } from '../services/snapshot-cache'
import { SnapshotService } from '../services/snapshot.service'
import { DEFAULT_SETTINGS, type PluginSettings } from '../types/plugin-settings.intf'
import type { Snapshot } from '../types/snapshot.intf'

// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
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
            session.restoreSelection('b', 2000, 'note.md')
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
            session.restoreSelection('vanished', 2100, 'note.md')
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

    describe('generation isolation', () => {
        test('computing a diff does not cancel an in-flight snapshot load', async () => {
            // Scrubbing the timeline computes diffs continuously. If diffing
            // shared the load counter, the poll's re-fetch landing mid-scrub
            // would be discarded and the timeline would stop updating.
            const { session } = createSession('live')

            // First load, so a selection exists and computeDiff does real work.
            spy = spyOn(SnapshotService, 'getSnapshots').mockResolvedValue([
                snap('a', 3000, 'v3'),
                snap('b', 2000, 'v2')
            ])
            await session.loadFor(file)
            expect(session.snapshots).toHaveLength(2)

            // Now a poll re-fetches slowly...
            let release: (value: Snapshot[]) => void = () => {}
            spy.mockReturnValue(
                new Promise<Snapshot[]>((r) => {
                    release = r
                })
            )
            const reload = session.loadFor(file)

            // ...while the user scrubs, which computes a diff.
            await session.computeDiff()

            release([snap('a', 3000, 'v3'), snap('b', 2000, 'v2'), snap('c', 1000, 'v1')])

            expect(await reload).toBe('updated')
            expect(session.snapshots).toHaveLength(3)
        })

        test('a newer diff still supersedes an older one', async () => {
            const { session, read } = createSession('live')
            spy = spyOn(SnapshotService, 'getSnapshots').mockResolvedValue([
                snap('a', 3000, 'v3'),
                snap('b', 2000, 'v2')
            ])
            await session.loadFor(file)

            let releaseRead: (value: string) => void = () => {}
            read.mockReturnValueOnce(
                new Promise<string>((r) => {
                    releaseRead = r
                })
            )

            session.select('b')
            const first = session.computeDiff()
            const second = await session.computeDiff()
            releaseRead('live')

            expect(await first).toBeNull()
            expect(second).not.toBeNull()
        })
    })

    describe('cross-file safety', () => {
        // eslint-disable-next-line obsidianmd/no-tfile-tfolder-cast
        const other = { path: 'other.md', name: 'other.md' } as unknown as TFile

        test("drops the previous note's snapshots before awaiting the new fetch", async () => {
            const { session } = createSession('live')
            spy = spyOn(SnapshotService, 'getSnapshots').mockResolvedValue([
                snap('a', 3000, 'v3'),
                snap('b', 2000, 'v2')
            ])
            await session.loadFor(file)
            expect(session.selectedSnapshot).not.toBeNull()

            // Switch note; the fetch has not resolved yet.
            let release: (value: Snapshot[]) => void = () => {}
            spy.mockReturnValue(
                new Promise<Snapshot[]>((r) => {
                    release = r
                })
            )
            const pending = session.loadFor(other)

            // This is the window in which a restore click used to combine the
            // NEW file with the OLD file's snapshot and corrupt the wrong note.
            expect(session.snapshots).toEqual([])
            expect(session.selectedSnapshot).toBeNull()

            release([])
            await pending
        })

        test('never returns a snapshot belonging to another note', async () => {
            const { session } = createSession('live')
            spy = spyOn(SnapshotService, 'getSnapshots').mockResolvedValue([snap('a', 3000, 'v3')])
            await session.loadFor(file)

            // Force the mismatch a git id could produce: `git-<hash>` is not
            // file-scoped, so one commit can appear for several notes.
            session.snapshots = [
                { ...snap('a', 3000, 'v3'), path: 'somewhere-else.md' } as Snapshot
            ]

            expect(session.selectedSnapshot).toBeNull()
        })

        test('does not carry a selection across to a different note', async () => {
            const { session } = createSession('live')
            spy = spyOn(SnapshotService, 'getSnapshots').mockResolvedValue([
                snap('a', 3000, 'v3'),
                snap('b', 2000, 'v2')
            ])
            await session.loadFor(file)
            session.select('b')

            spy.mockResolvedValue([
                { ...snap('z', 9000, 'other-new'), path: 'other.md' } as Snapshot,
                { ...snap('b', 2000, 'other-v2'), path: 'other.md' } as Snapshot
            ])
            await session.loadFor(other)

            // 'b' exists in the other note's list too, but the selection must
            // not follow it across — the newest is the right default.
            expect(session.getSelectedId()).toBe('z')
        })

        test('honours a selection explicitly restored for that path', async () => {
            const { session } = createSession('live')
            session.restoreSelection('b', 2000, 'note.md')
            spy = spyOn(SnapshotService, 'getSnapshots').mockResolvedValue([
                snap('a', 3000, 'v3'),
                snap('b', 2000, 'v2')
            ])

            await session.loadFor(file)

            expect(session.getSelectedId()).toBe('b')
        })

        test('ignores a restored selection scoped to a different path', async () => {
            const { session } = createSession('live')
            session.restoreSelection('b', 2000, 'somewhere-else.md')
            spy = spyOn(SnapshotService, 'getSnapshots').mockResolvedValue([
                snap('a', 3000, 'v3'),
                snap('b', 2000, 'v2')
            ])

            await session.loadFor(file)

            expect(session.getSelectedId()).toBe('a')
        })
    })

    describe('deleted or unreadable files', () => {
        test('a read failure during load yields an empty history, not a rejection', async () => {
            // Deleting a note while a view is open makes the next poll read a
            // path that no longer exists.
            const { session, read } = createSession('live')
            spy = spyOn(SnapshotService, 'getSnapshots').mockResolvedValue([snap('a', 3000, 'v3')])
            read.mockRejectedValue(new Error('ENOENT: no such file or directory'))

            expect(await session.loadFor(file)).toBe('updated')
            expect(session.snapshots).toEqual([])
        })

        test('a read failure during refresh leaves state untouched', async () => {
            const { session, read } = createSession('live')
            spy = spyOn(SnapshotService, 'getSnapshots').mockResolvedValue([
                snap('a', 3000, 'v3'),
                snap('b', 2000, 'v2')
            ])
            await session.loadFor(file)

            read.mockRejectedValue(new Error('ENOENT'))
            expect(await session.refreshContent()).toBe('unchanged')
            expect(session.snapshots).toHaveLength(2)
        })

        test('a read failure during diff yields null', async () => {
            const { session, read } = createSession('live')
            spy = spyOn(SnapshotService, 'getSnapshots').mockResolvedValue([
                snap('a', 3000, 'v3'),
                snap('b', 2000, 'v2')
            ])
            await session.loadFor(file)

            read.mockRejectedValue(new Error('ENOENT'))
            expect(await session.computeDiff()).toBeNull()
        })
    })
})
