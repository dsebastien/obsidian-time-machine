import { describe, expect, test, beforeEach, mock, spyOn, afterEach } from 'bun:test'
import type { TFile, WorkspaceLeaf } from 'obsidian'
import { TimeMachineView } from './time-machine-view'
import type { TimeMachinePlugin } from '../plugin'
import type { Snapshot } from '../types/snapshot.intf'
import { SnapshotService } from '../services/snapshot.service'
import { DEFAULT_SETTINGS } from '../types/plugin-settings.intf'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ViewInternals = any

// Helper to create a mock HTMLElement with Obsidian's DOM methods
function createMockEl(): HTMLElement {
    const el = {
        empty: mock(() => {}),
        createDiv: mock((_opts?: unknown) => createMockEl()),
        createEl: mock((_tag: string, _opts?: unknown) => {
            const child = createMockEl() as unknown as Record<string, unknown>
            // Give input elements basic properties for TimelineSliderComponent
            child['min'] = ''
            child['max'] = ''
            child['step'] = ''
            child['value'] = '0'
            return child as unknown as HTMLElement
        }),
        createSpan: mock((_opts?: unknown) => createMockEl()),
        addClass: mock(() => {}),
        textContent: '',
        addEventListener: mock(() => {}),
        prepend: mock(() => {}),
        style: { setProperty: mock(() => {}) },
        children: [] as unknown[]
    }
    return el as unknown as HTMLElement
}

function createMockFile(path: string, name?: string): TFile {
    // eslint-disable-next-line obsidianmd/no-tfile-tfolder-cast
    return { path, name: name ?? path.split('/').pop() ?? path } as unknown as TFile
}

function createSnapshot(
    path: string,
    ts: number,
    data: string,
    source: 'file-recovery' | 'git' = 'file-recovery'
): Snapshot {
    if (source === 'git') {
        return {
            id: `git-hash${ts}`,
            path,
            ts,
            data,
            source: 'git',
            metadata: {
                source: 'git',
                commitHash: `hash${ts}`,
                shortHash: `h${ts}`,
                commitMessage: `commit at ${ts}`,
                authorName: 'Test Author'
            }
        }
    }
    return {
        id: `fr-${ts}`,
        path,
        ts,
        data,
        source: 'file-recovery',
        metadata: { source: 'file-recovery' }
    }
}

function createView(): TimeMachineView {
    const mockLeaf = {} as WorkspaceLeaf
    const mockPlugin = {
        settings: { ...DEFAULT_SETTINGS }
    } as TimeMachinePlugin

    const view = new TimeMachineView(mockLeaf, mockPlugin)
    const v: ViewInternals = view

    // Set up internal DOM elements that onOpen would create
    v.headerEl = createMockEl()
    v.contentAreaEl = createMockEl()

    // Set up app mock
    v.app = {
        vault: {
            read: mock(async () => '')
        },
        internalPlugins: {
            getEnabledPluginById: () => ({
                db: {},
                options: { intervalMinutes: 5 }
            })
        }
    }

    return view
}

// Spy references for cleanup
// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
let getSnapshotsSpy: ReturnType<typeof spyOn> | null = null

afterEach(() => {
    if (getSnapshotsSpy) {
        getSnapshotsSpy.mockRestore()
        getSnapshotsSpy = null
    }
})

describe('TimeMachineView', () => {
    describe('getCurrentFile', () => {
        test('returns null when no file is set', () => {
            const view = createView()
            expect(view.getCurrentFile()).toBeNull()
        })

        test('returns the current file after updateForFile', async () => {
            const view = createView()
            const file = createMockFile('test.md')

            getSnapshotsSpy = spyOn(SnapshotService, 'getSnapshots').mockResolvedValue([])

            await view.updateForFile(file)
            expect(view.getCurrentFile()).toBe(file)
        })

        test('returns null after updateForFile with null', async () => {
            const view = createView()
            const file = createMockFile('test.md')

            getSnapshotsSpy = spyOn(SnapshotService, 'getSnapshots').mockResolvedValue([])

            await view.updateForFile(file)
            await view.updateForFile(null)
            expect(view.getCurrentFile()).toBeNull()
        })
    })

    describe('updateForFile', () => {
        test('caches all snapshots in allSnapshots before filtering', async () => {
            const view = createView()
            const v: ViewInternals = view
            const file = createMockFile('note.md')
            const currentContent = 'current content'

            const snapshots = [
                createSnapshot('note.md', 3000, 'old v3'),
                createSnapshot('note.md', 2000, currentContent), // matches current — filtered out
                createSnapshot('note.md', 1000, 'old v1')
            ]

            getSnapshotsSpy = spyOn(SnapshotService, 'getSnapshots').mockResolvedValue(snapshots)
            v.app.vault.read = mock(async () => currentContent)

            await view.updateForFile(file)

            // allSnapshots should have all 3
            const allSnapshots = v.allSnapshots as Snapshot[]
            expect(allSnapshots).toHaveLength(3)

            // snapshots (filtered) should exclude the one matching current content
            const filteredSnapshots = v.snapshots as Snapshot[]
            expect(filteredSnapshots).toHaveLength(2)
            expect(filteredSnapshots.every((s: Snapshot) => s.data !== currentContent)).toBe(true)
        })

        test('clears allSnapshots when file is null', async () => {
            const view = createView()
            const v: ViewInternals = view

            v.allSnapshots = [createSnapshot('x.md', 1000, 'data')]
            v.snapshots = [createSnapshot('x.md', 1000, 'data')]

            await view.updateForFile(null)

            expect(v.allSnapshots).toEqual([])
            expect(v.snapshots).toEqual([])
        })

        test('sets allSnapshots to empty on fetch error', async () => {
            const view = createView()
            const v: ViewInternals = view

            getSnapshotsSpy = spyOn(SnapshotService, 'getSnapshots').mockRejectedValue(
                new Error('fetch error')
            )

            await view.updateForFile(createMockFile('test.md'))

            expect(v.allSnapshots).toEqual([])
            expect(v.snapshots).toEqual([])
        })

        test('handles mixed git and file-recovery snapshots', async () => {
            const view = createView()
            const v: ViewInternals = view
            const file = createMockFile('note.md')

            const snapshots = [
                createSnapshot('note.md', 3000, 'git content', 'git'),
                createSnapshot('note.md', 2000, 'fr content'),
                createSnapshot('note.md', 1000, 'old git', 'git')
            ]

            getSnapshotsSpy = spyOn(SnapshotService, 'getSnapshots').mockResolvedValue(snapshots)
            v.app.vault.read = mock(async () => 'different content')

            await view.updateForFile(file)

            expect(v.allSnapshots).toHaveLength(3)
            expect(v.snapshots).toHaveLength(3)
        })
    })

    describe('refreshCurrentContent', () => {
        let view: TimeMachineView
        let v: ViewInternals
        let vaultRead: ReturnType<typeof mock>

        beforeEach(() => {
            view = createView()
            v = view
            vaultRead = v.app.vault.read
        })

        test('does nothing when no current file', async () => {
            v.currentFile = null
            v.allSnapshots = [createSnapshot('x.md', 1000, 'data')]

            await view.refreshCurrentContent()

            expect(vaultRead).not.toHaveBeenCalled()
        })

        test('does nothing when allSnapshots is empty', async () => {
            v.currentFile = createMockFile('test.md')
            v.allSnapshots = []

            await view.refreshCurrentContent()

            expect(vaultRead).not.toHaveBeenCalled()
        })

        test('re-filters allSnapshots against new content without re-fetch', async () => {
            const file = createMockFile('note.md')
            const allSnapshots = [
                createSnapshot('note.md', 3000, 'version3'),
                createSnapshot('note.md', 2000, 'version2'),
                createSnapshot('note.md', 1000, 'version1')
            ]

            v.currentFile = file
            v.allSnapshots = allSnapshots
            v.snapshots = [...allSnapshots] // Initially all 3 visible
            v.selectedSnapshotIndex = null

            // Current content now matches version2 — should filter it out
            vaultRead.mockResolvedValue('version2')

            getSnapshotsSpy = spyOn(SnapshotService, 'getSnapshots')

            await view.refreshCurrentContent()

            // Should NOT have called getSnapshots (no re-fetch)
            expect(getSnapshotsSpy).not.toHaveBeenCalled()

            // allSnapshots unchanged
            expect(v.allSnapshots).toHaveLength(3)

            // Filtered snapshots should exclude the matching one
            const filtered = v.snapshots as Snapshot[]
            expect(filtered).toHaveLength(2)
            expect(filtered.every((s: Snapshot) => s.data !== 'version2')).toBe(true)
        })

        test('triggers full re-render when filtered count changes', async () => {
            const file = createMockFile('note.md')
            const allSnapshots = [
                createSnapshot('note.md', 2000, 'v2'),
                createSnapshot('note.md', 1000, 'v1')
            ]

            v.currentFile = file
            v.allSnapshots = allSnapshots
            v.snapshots = [...allSnapshots] // 2 visible
            v.selectedSnapshotIndex = 1

            // Now content matches v1 — filtered count changes from 2 to 1
            vaultRead.mockResolvedValue('v1')

            await view.refreshCurrentContent()

            // Only v2 remains after filtering
            const filtered = v.snapshots as Snapshot[]
            expect(filtered).toHaveLength(1)
            expect(filtered[0]!.data).toBe('v2')
        })

        test('shows empty state when all snapshots match current content', async () => {
            const file = createMockFile('note.md')
            const contentAreaEl = v.contentAreaEl as HTMLElement & {
                empty: ReturnType<typeof mock>
            }

            v.currentFile = file
            v.allSnapshots = [createSnapshot('note.md', 1000, 'same')]
            v.snapshots = [createSnapshot('note.md', 1000, 'same')]

            // Content now matches the only snapshot
            vaultRead.mockResolvedValue('same')

            await view.refreshCurrentContent()

            expect(v.snapshots).toHaveLength(0)
            // empty() should have been called to clear before rendering empty state
            expect(contentAreaEl.empty).toHaveBeenCalled()
        })

        test('does not reset selectedSnapshotIndex when count stays the same', async () => {
            const file = createMockFile('note.md')
            const allSnapshots = [
                createSnapshot('note.md', 2000, 'v2'),
                createSnapshot('note.md', 1000, 'v1')
            ]

            v.currentFile = file
            v.allSnapshots = allSnapshots
            v.snapshots = [...allSnapshots]
            v.selectedSnapshotIndex = 0
            v.diffViewer = null // No diff viewer to re-render

            // Content is different from all snapshots — still 2 after filter
            vaultRead.mockResolvedValue('totally different')

            await view.refreshCurrentContent()

            expect(v.selectedSnapshotIndex).toBe(0)
        })
    })

    describe('onClose', () => {
        test('clears currentFile, allSnapshots, and snapshots', async () => {
            const view = createView()
            const v: ViewInternals = view

            v.currentFile = createMockFile('test.md')
            v.allSnapshots = [createSnapshot('test.md', 1000, 'data')]
            v.snapshots = [createSnapshot('test.md', 1000, 'data')]

            await view.onClose()

            expect(v.currentFile).toBeNull()
            expect(v.allSnapshots).toEqual([])
            expect(v.snapshots).toEqual([])
        })
    })
})
