import { describe, expect, test, beforeEach, mock, spyOn, afterEach } from 'bun:test'
import type { TFile, WorkspaceLeaf } from 'obsidian'
import { TimeMachineView } from './time-machine-view'
import type { TimeMachinePlugin } from '../plugin'
import type { FileRecoveryBackup } from '../types/backup.intf'
import { FileRecoveryService } from '../services/file-recovery.service'

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

function createBackup(path: string, ts: number, data: string): FileRecoveryBackup {
    return { path, ts, data }
}

function createView(): TimeMachineView {
    const mockLeaf = {} as WorkspaceLeaf
    const mockPlugin = {} as TimeMachinePlugin

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
let getBackupsSpy: ReturnType<typeof spyOn> | null = null

afterEach(() => {
    if (getBackupsSpy) {
        getBackupsSpy.mockRestore()
        getBackupsSpy = null
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

            getBackupsSpy = spyOn(FileRecoveryService, 'getBackups').mockResolvedValue([])

            await view.updateForFile(file)
            expect(view.getCurrentFile()).toBe(file)
        })

        test('returns null after updateForFile with null', async () => {
            const view = createView()
            const file = createMockFile('test.md')

            getBackupsSpy = spyOn(FileRecoveryService, 'getBackups').mockResolvedValue([])

            await view.updateForFile(file)
            await view.updateForFile(null)
            expect(view.getCurrentFile()).toBeNull()
        })
    })

    describe('updateForFile', () => {
        test('caches all backups in allBackups before filtering', async () => {
            const view = createView()
            const v: ViewInternals = view
            const file = createMockFile('note.md')
            const currentContent = 'current content'

            const backups = [
                createBackup('note.md', 3000, 'old v3'),
                createBackup('note.md', 2000, currentContent), // matches current — filtered out
                createBackup('note.md', 1000, 'old v1')
            ]

            getBackupsSpy = spyOn(FileRecoveryService, 'getBackups').mockResolvedValue(backups)
            v.app.vault.read = mock(async () => currentContent)

            await view.updateForFile(file)

            // allBackups should have all 3
            const allBackups = v.allBackups as FileRecoveryBackup[]
            expect(allBackups).toHaveLength(3)

            // backups (filtered) should exclude the one matching current content
            const filteredBackups = v.backups as FileRecoveryBackup[]
            expect(filteredBackups).toHaveLength(2)
            expect(
                filteredBackups.every((b: FileRecoveryBackup) => b.data !== currentContent)
            ).toBe(true)
        })

        test('clears allBackups when file is null', async () => {
            const view = createView()
            const v: ViewInternals = view

            v.allBackups = [createBackup('x.md', 1000, 'data')]
            v.backups = [createBackup('x.md', 1000, 'data')]

            await view.updateForFile(null)

            expect(v.allBackups).toEqual([])
            expect(v.backups).toEqual([])
        })

        test('clears allBackups when file-recovery is unavailable', async () => {
            const view = createView()
            const v: ViewInternals = view
            v.app.internalPlugins.getEnabledPluginById = () => null

            v.allBackups = [createBackup('x.md', 1000, 'data')]

            await view.updateForFile(createMockFile('test.md'))

            expect(v.allBackups).toEqual([])
            expect(v.backups).toEqual([])
        })

        test('sets allBackups to empty on fetch error', async () => {
            const view = createView()
            const v: ViewInternals = view

            getBackupsSpy = spyOn(FileRecoveryService, 'getBackups').mockRejectedValue(
                new Error('DB error')
            )

            await view.updateForFile(createMockFile('test.md'))

            expect(v.allBackups).toEqual([])
            expect(v.backups).toEqual([])
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
            v.allBackups = [createBackup('x.md', 1000, 'data')]

            await view.refreshCurrentContent()

            expect(vaultRead).not.toHaveBeenCalled()
        })

        test('does nothing when allBackups is empty', async () => {
            v.currentFile = createMockFile('test.md')
            v.allBackups = []

            await view.refreshCurrentContent()

            expect(vaultRead).not.toHaveBeenCalled()
        })

        test('re-filters allBackups against new content without IndexedDB fetch', async () => {
            const file = createMockFile('note.md')
            const allBackups = [
                createBackup('note.md', 3000, 'version3'),
                createBackup('note.md', 2000, 'version2'),
                createBackup('note.md', 1000, 'version1')
            ]

            v.currentFile = file
            v.allBackups = allBackups
            v.backups = [...allBackups] // Initially all 3 visible
            v.selectedBackupIndex = null // No selection — count change triggers re-render

            // Current content now matches version2 — should filter it out
            vaultRead.mockResolvedValue('version2')

            getBackupsSpy = spyOn(FileRecoveryService, 'getBackups')

            await view.refreshCurrentContent()

            // Should NOT have called getBackups (no IndexedDB re-fetch)
            expect(getBackupsSpy).not.toHaveBeenCalled()

            // allBackups unchanged
            expect(v.allBackups).toHaveLength(3)

            // Filtered backups should exclude the matching one
            const filtered = v.backups as FileRecoveryBackup[]
            expect(filtered).toHaveLength(2)
            expect(filtered.every((b: FileRecoveryBackup) => b.data !== 'version2')).toBe(true)
        })

        test('triggers full re-render when filtered count changes', async () => {
            const file = createMockFile('note.md')
            const allBackups = [
                createBackup('note.md', 2000, 'v2'),
                createBackup('note.md', 1000, 'v1')
            ]

            v.currentFile = file
            v.allBackups = allBackups
            v.backups = [...allBackups] // 2 visible
            v.selectedBackupIndex = 1

            // Now content matches v1 — filtered count changes from 2 to 1
            vaultRead.mockResolvedValue('v1')

            await view.refreshCurrentContent()

            // Only v2 remains after filtering
            const filtered = v.backups as FileRecoveryBackup[]
            expect(filtered).toHaveLength(1)
            expect(filtered[0]!.data).toBe('v2')
        })

        test('shows empty state when all backups match current content', async () => {
            const file = createMockFile('note.md')
            const contentAreaEl = v.contentAreaEl as HTMLElement & {
                empty: ReturnType<typeof mock>
            }

            v.currentFile = file
            v.allBackups = [createBackup('note.md', 1000, 'same')]
            v.backups = [createBackup('note.md', 1000, 'same')]

            // Content now matches the only backup
            vaultRead.mockResolvedValue('same')

            await view.refreshCurrentContent()

            expect(v.backups).toHaveLength(0)
            // empty() should have been called to clear before rendering empty state
            expect(contentAreaEl.empty).toHaveBeenCalled()
        })

        test('does not reset selectedBackupIndex when count stays the same', async () => {
            const file = createMockFile('note.md')
            const allBackups = [
                createBackup('note.md', 2000, 'v2'),
                createBackup('note.md', 1000, 'v1')
            ]

            v.currentFile = file
            v.allBackups = allBackups
            v.backups = [...allBackups]
            v.selectedBackupIndex = 0
            v.diffViewer = null // No diff viewer to re-render

            // Content is different from all backups — still 2 after filter
            vaultRead.mockResolvedValue('totally different')

            await view.refreshCurrentContent()

            expect(v.selectedBackupIndex).toBe(0)
        })
    })

    describe('onClose', () => {
        test('clears currentFile, allBackups, and backups', async () => {
            const view = createView()
            const v: ViewInternals = view

            v.currentFile = createMockFile('test.md')
            v.allBackups = [createBackup('test.md', 1000, 'data')]
            v.backups = [createBackup('test.md', 1000, 'data')]

            await view.onClose()

            expect(v.currentFile).toBeNull()
            expect(v.allBackups).toEqual([])
            expect(v.backups).toEqual([])
        })
    })
})
