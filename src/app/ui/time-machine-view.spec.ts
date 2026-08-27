import { describe, expect, test, beforeEach, mock, spyOn, afterEach } from 'bun:test'
import type { TFile, WorkspaceLeaf } from 'obsidian'
import { TimeMachineView } from './time-machine-view'
import type { TimeMachinePlugin } from '../plugin'
import type { Snapshot } from '../types/snapshot.intf'
import { SnapshotService } from '../services/snapshot.service'
import { DiffService } from '../services/diff.service'
import { RestoreService } from '../services/restore.service'
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
        settings: { ...DEFAULT_SETTINGS },
        saveSettings: mock(async () => {})
    } as unknown as TimeMachinePlugin

    const view = new TimeMachineView(mockLeaf, mockPlugin)
    const v: ViewInternals = view

    // Set up internal DOM elements that onOpen would create
    v.tmHeaderEl = createMockEl()
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

    describe('diff comparison mode', () => {
        function setupForDiff(view: TimeMachineView): {
            v: ViewInternals
            render: ReturnType<typeof mock>
        } {
            const v: ViewInternals = view
            v.currentFile = createMockFile('note.md')
            // Newest first: [0]=v3, [1]=v2, [2]=v1
            v.snapshots = [
                createSnapshot('note.md', 3000, 'v3'),
                createSnapshot('note.md', 2000, 'v2'),
                createSnapshot('note.md', 1000, 'v1')
            ]
            const render = mock(() => {})
            v.diffViewer = { render }
            v.app.vault.read = mock(async () => 'current-content')
            return { v, render }
        }

        test('current mode diffs the selected snapshot against the current file', async () => {
            const view = createView()
            const { v, render } = setupForDiff(view)
            v.plugin.settings.diffComparisonMode = 'current'
            v.selectedSnapshotIndex = 2

            const computeSpy = spyOn(DiffService, 'computeDiff')
            await v.computeAndRenderDiff()

            expect(computeSpy).toHaveBeenCalled()
            const [oldContent, newContent, , newLabel] = computeSpy.mock.calls[0] as string[]
            expect(oldContent).toBe('v1')
            expect(newContent).toBe('current-content')
            expect(newLabel).toBe('Current')
            expect(render.mock.calls[0]?.[1]).toBe('current')
            computeSpy.mockRestore()
        })

        test('next mode diffs the selected snapshot against the next newer snapshot', async () => {
            const view = createView()
            const { v, render } = setupForDiff(view)
            v.plugin.settings.diffComparisonMode = 'next'
            v.selectedSnapshotIndex = 2

            const computeSpy = spyOn(DiffService, 'computeDiff')
            await v.computeAndRenderDiff()

            const [oldContent, newContent, , newLabel] = computeSpy.mock.calls[0] as string[]
            expect(oldContent).toBe('v1')
            expect(newContent).toBe('v2')
            expect(newLabel).not.toBe('Current')
            expect(render.mock.calls[0]?.[1]).toBe('next')
            computeSpy.mockRestore()
        })

        test('next mode on the newest snapshot diffs against the current file (same as current mode)', async () => {
            const view = createView()
            const { v } = setupForDiff(view)
            v.plugin.settings.diffComparisonMode = 'next'
            v.selectedSnapshotIndex = 0

            const computeSpy = spyOn(DiffService, 'computeDiff')
            await v.computeAndRenderDiff()

            const [oldContent, newContent, , newLabel] = computeSpy.mock.calls[0] as string[]
            expect(oldContent).toBe('v3')
            expect(newContent).toBe('current-content')
            expect(newLabel).toBe('Current')
            computeSpy.mockRestore()
        })

        test('mode change persists to settings and triggers a recompute', async () => {
            const view = createView()
            const { v } = setupForDiff(view)
            v.selectedSnapshotIndex = 0

            const computeSpy = spyOn(DiffService, 'computeDiff')
            // Build the real diff viewer (and its callbacks) via renderContent
            v.renderContent()
            const callbacks = v.diffViewer.callbacks

            callbacks.onComparisonModeChange('next')
            await new Promise((resolve) => setTimeout(resolve, 0))

            expect(v.plugin.settings.diffComparisonMode).toBe('next')
            expect(v.plugin.saveSettings).toHaveBeenCalled()
            expect(computeSpy).toHaveBeenCalled()
            computeSpy.mockRestore()
        })

        test('hunk restore is refused in next mode', async () => {
            const view = createView()
            const { v } = setupForDiff(view)
            v.plugin.settings.diffComparisonMode = 'next'
            v.selectedSnapshotIndex = 1

            const vaultRead = v.app.vault.read as ReturnType<typeof mock>
            await v.handleRestoreHunk(0)

            // Bails out before even reading the current file
            expect(vaultRead).not.toHaveBeenCalled()
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

    describe('stale async results', () => {
        test('a slow fetch does not overwrite the results of a newer one', async () => {
            const view = createView()
            const v: ViewInternals = view
            const slowFile = createMockFile('slow.md')
            const fastFile = createMockFile('fast.md')

            const slowSnapshots = [createSnapshot('slow.md', 1000, 'slow data')]
            const fastSnapshots = [createSnapshot('fast.md', 2000, 'fast data')]

            // The first call resolves only after the second has already finished.
            let releaseSlow: (value: Snapshot[]) => void = () => {}
            const slowPromise = new Promise<Snapshot[]>((resolve) => {
                releaseSlow = resolve
            })

            getSnapshotsSpy = spyOn(SnapshotService, 'getSnapshots').mockImplementation(
                (_app: unknown, path: string) =>
                    path === 'slow.md' ? slowPromise : Promise.resolve(fastSnapshots)
            ) as ReturnType<typeof spyOn>

            v.app.vault.read = mock(async () => 'current content')

            const slowUpdate = view.updateForFile(slowFile)
            await view.updateForFile(fastFile)

            releaseSlow(slowSnapshots)
            await slowUpdate

            // The stale fetch must be discarded entirely.
            expect(view.getCurrentFile()).toBe(fastFile)
            expect(v.allSnapshots).toEqual(fastSnapshots)
        })
    })

    describe('hunk restore revision guard', () => {
        test('refuses to apply a hunk when the file changed since the diff was rendered', async () => {
            const view = createView()
            const v: ViewInternals = view

            const restoreSpy = spyOn(RestoreService, 'restoreHunk').mockResolvedValue(true)
            try {
                v.currentFile = createMockFile('note.md')
                v.selectedSnapshotIndex = 0
                v.snapshots = [createSnapshot('note.md', 1000, 'old content')]
                v.plugin.settings.diffComparisonMode = 'current'

                // The rendered diff was computed against this content...
                v.diffBaseContent = 'content at render time'
                // ...but the file says something else by the time restore is clicked.
                v.app.vault.read = mock(async () => 'content after an edit')
                v.diffViewer = { render: mock(() => {}) }

                await v.handleRestoreHunk(0)

                expect(restoreSpy).not.toHaveBeenCalled()
            } finally {
                restoreSpy.mockRestore()
            }
        })

        test('applies the hunk when the content still matches the rendered diff', async () => {
            const view = createView()
            const v: ViewInternals = view

            const restoreSpy = spyOn(RestoreService, 'restoreHunk').mockResolvedValue(true)
            try {
                v.currentFile = createMockFile('note.md')
                v.selectedSnapshotIndex = 0
                v.snapshots = [createSnapshot('note.md', 1000, 'old content')]
                v.plugin.settings.diffComparisonMode = 'current'

                v.diffBaseContent = 'unchanged content'
                v.app.vault.read = mock(async () => 'unchanged content')
                v.diffViewer = { render: mock(() => {}) }

                await v.handleRestoreHunk(0)

                expect(restoreSpy).toHaveBeenCalled()
            } finally {
                restoreSpy.mockRestore()
            }
        })
    })
})
