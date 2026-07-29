import { describe, expect, test, beforeEach, mock, afterEach } from 'bun:test'
import { TimeMachinePlugin } from './plugin'
import { TimeMachineView } from './ui/time-machine-view'
import { VIEW_TYPE } from './constants'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PluginInternals = any

// Track registered events and intervals
let registeredEvents: Array<{ type: string; callback: (...args: unknown[]) => void }> = []
let registeredIntervals: number[] = []
let setIntervalCalls: Array<{ callback: () => void; ms: number }> = []
let registeredDomEvents: Array<{ type: string; callback: (...args: unknown[]) => void }> = []

// Mock view factory — creates objects that pass `instanceof TimeMachineView`
function createMockView(currentFilePath: string | null): {
    view: Record<string, unknown>
    updateForFile: ReturnType<typeof mock>
    refreshCurrentContent: ReturnType<typeof mock>
} {
    const updateForFile = mock(async () => {})
    const refreshCurrentContent = mock(async () => {})
    const view = Object.create(TimeMachineView.prototype) as Record<string, unknown>
    view['getViewType'] = () => VIEW_TYPE
    view['getCurrentFile'] = () =>
        currentFilePath ? { path: currentFilePath, name: currentFilePath } : null
    view['updateForFile'] = updateForFile
    view['refreshCurrentContent'] = refreshCurrentContent
    return { view, updateForFile, refreshCurrentContent }
}

function createPlugin(
    viewMocks: Array<ReturnType<typeof createMockView>>,
    fileRecoveryOptions?: { intervalMinutes: number }
): TimeMachinePlugin {
    registeredEvents = []
    registeredIntervals = []
    setIntervalCalls = []
    registeredDomEvents = []

    const leaves = viewMocks.map((vm) => ({
        view: vm.view
    }))

    const plugin = Object.create(TimeMachinePlugin.prototype) as TimeMachinePlugin
    const p: PluginInternals = plugin

    p.app = {
        workspace: {
            // The what's-new dialog registers a layout-ready callback; never
            // firing it keeps the dialog out of these tests.
            onLayoutReady: (_cb: () => void) => {},
            on: (_event: string, _cb: unknown) => ({ type: _event, callback: _cb }),
            getLeavesOfType: (_type: string) => leaves,
            getActiveFile: () => null,
            getRightLeaf: () => null,
            activeEditor: null
        },
        vault: {
            on: (_event: string, _cb: unknown) => ({ type: _event, callback: _cb })
        },
        internalPlugins: {
            getEnabledPluginById: (_id: string) =>
                fileRecoveryOptions ? { options: fileRecoveryOptions, db: {} } : null
        }
    }

    // Component.register — used by the what's-new dialog for unload cleanup
    p.register = mock((_cb: () => void) => {})

    p.registerEvent = mock((eventRef: { type: string; callback: (...args: unknown[]) => void }) => {
        registeredEvents.push(eventRef)
    })

    p.registerInterval = mock((intervalId: number) => {
        registeredIntervals.push(intervalId)
    })

    p.registerDomEvent = mock(
        (_el: unknown, type: string, callback: (...args: unknown[]) => void) => {
            registeredDomEvents.push({ type, callback })
        }
    )

    p.registerView = mock(() => {})
    p.addCommand = mock(() => {})
    p.addSettingTab = mock(() => {})
    p.loadData = mock(async () => null)
    p.manifest = { id: 'time-machine', name: 'Time Machine' }

    return plugin
}

describe('TimeMachinePlugin', () => {
    const originalWindow = globalThis.window

    beforeEach(() => {
        // Provide a window mock with setInterval for bun's test environment
        const mockSetInterval = mock(((callback: () => void, ms: number) => {
            setIntervalCalls.push({ callback, ms })
            return setIntervalCalls.length
        }) as unknown as typeof setInterval)

        globalThis.window = {
            setInterval: mockSetInterval
        } as unknown as Window & typeof globalThis

        // `activeDocument` is an Obsidian global; provide a stub for onload's
        // registerDomEvent('selectionchange', ...) registration.
        ;(globalThis as Record<string, unknown>)['activeDocument'] = {}
    })

    afterEach(() => {
        globalThis.window = originalWindow
        delete (globalThis as Record<string, unknown>)['activeDocument']
    })

    describe('modify event handler', () => {
        test('calls refreshCurrentContent on views tracking the modified file', async () => {
            const vm = createMockView('notes/test.md')
            const plugin = createPlugin([vm], { intervalMinutes: 5 })

            await plugin.onload()

            const modifyEvent = registeredEvents.find((e) => e.type === 'modify')
            expect(modifyEvent).toBeDefined()

            const modifiedFile = { path: 'notes/test.md', name: 'test.md' }
            modifyEvent!.callback(modifiedFile)

            expect(vm.refreshCurrentContent).toHaveBeenCalled()
        })

        test('does not call refreshCurrentContent for a different file', async () => {
            const vm = createMockView('notes/test.md')
            const plugin = createPlugin([vm], { intervalMinutes: 5 })

            await plugin.onload()

            const modifyEvent = registeredEvents.find((e) => e.type === 'modify')
            expect(modifyEvent).toBeDefined()

            const otherFile = { path: 'notes/other.md', name: 'other.md' }
            modifyEvent!.callback(otherFile)

            expect(vm.refreshCurrentContent).not.toHaveBeenCalled()
        })

        test('does not call refreshCurrentContent when view has no current file', async () => {
            const vm = createMockView(null)
            const plugin = createPlugin([vm], { intervalMinutes: 5 })

            await plugin.onload()

            const modifyEvent = registeredEvents.find((e) => e.type === 'modify')
            expect(modifyEvent).toBeDefined()

            modifyEvent!.callback({ path: 'any.md', name: 'any.md' })

            expect(vm.refreshCurrentContent).not.toHaveBeenCalled()
        })
    })

    describe('periodic snapshot polling', () => {
        test('registers interval using file-recovery intervalMinutes', async () => {
            const vm = createMockView('test.md')
            const plugin = createPlugin([vm], { intervalMinutes: 10 })

            await plugin.onload()

            expect(setIntervalCalls.length).toBeGreaterThanOrEqual(1)
            const snapshotInterval = setIntervalCalls.find((c) => c.ms === 10 * 60 * 1000)
            expect(snapshotInterval).toBeDefined()
        })

        test('uses default 5 minute interval when file-recovery is unavailable', async () => {
            const vm = createMockView('test.md')
            const plugin = createPlugin([vm])

            await plugin.onload()

            const snapshotInterval = setIntervalCalls.find((c) => c.ms === 5 * 60 * 1000)
            expect(snapshotInterval).toBeDefined()
        })

        test('interval callback calls updateForFile on views with a current file', async () => {
            const vm = createMockView('notes/daily.md')
            const plugin = createPlugin([vm], { intervalMinutes: 5 })

            await plugin.onload()

            const snapshotInterval = setIntervalCalls.find((c) => c.ms === 5 * 60 * 1000)
            expect(snapshotInterval).toBeDefined()

            snapshotInterval!.callback()

            expect(vm.updateForFile).toHaveBeenCalled()
        })

        test('interval callback is a no-op when views have no current file', async () => {
            const vm = createMockView(null)
            const plugin = createPlugin([vm], { intervalMinutes: 5 })

            await plugin.onload()

            const snapshotInterval = setIntervalCalls.find((c) => c.ms === 5 * 60 * 1000)
            expect(snapshotInterval).toBeDefined()

            snapshotInterval!.callback()

            expect(vm.updateForFile).not.toHaveBeenCalled()
        })

        test('interval is registered with registerInterval for cleanup', async () => {
            const vm = createMockView('test.md')
            const plugin = createPlugin([vm], { intervalMinutes: 5 })

            await plugin.onload()

            expect(registeredIntervals.length).toBeGreaterThanOrEqual(1)
        })
    })

    describe('file-open event handler', () => {
        test('calls updateForFile on all views when file opens', async () => {
            const vm = createMockView(null)
            const plugin = createPlugin([vm], { intervalMinutes: 5 })

            await plugin.onload()

            const fileOpenEvent = registeredEvents.find((e) => e.type === 'file-open')
            expect(fileOpenEvent).toBeDefined()

            const newFile = { path: 'opened.md', name: 'opened.md' }
            fileOpenEvent!.callback(newFile)

            expect(vm.updateForFile).toHaveBeenCalled()
        })
    })

    describe('cursor sync (continuous-scroll support)', () => {
        test('registers a selectionchange DOM handler', async () => {
            const vm = createMockView('a.md')
            const plugin = createPlugin([vm], { intervalMinutes: 5 })

            await plugin.onload()

            expect(registeredDomEvents.find((e) => e.type === 'selectionchange')).toBeDefined()
        })

        test('switches view to the focused editor file when the cursor moves', async () => {
            const vm = createMockView('notes/day-1.md')
            const plugin = createPlugin([vm], { intervalMinutes: 5 })

            await plugin.onload()

            // Cursor moved into a different note rendered in the same leaf.
            const cursorFile = { path: 'notes/day-2.md', name: 'day-2.md' }
            ;(plugin as PluginInternals).app.workspace.activeEditor = { file: cursorFile }

            const leafChange = registeredEvents.find((e) => e.type === 'active-leaf-change')
            expect(leafChange).toBeDefined()
            leafChange!.callback(null)

            expect(vm.updateForFile).toHaveBeenCalledWith(cursorFile)
        })

        test('does not re-update when the cursor stays in the current file', async () => {
            const vm = createMockView('notes/day-1.md')
            const plugin = createPlugin([vm], { intervalMinutes: 5 })

            await plugin.onload()
            ;(plugin as PluginInternals).app.workspace.activeEditor = {
                file: { path: 'notes/day-1.md', name: 'day-1.md' }
            }

            const leafChange = registeredEvents.find((e) => e.type === 'active-leaf-change')
            leafChange!.callback(null)

            expect(vm.updateForFile).not.toHaveBeenCalled()
        })

        test('does not clear the view when no file is resolved', async () => {
            const vm = createMockView('notes/day-1.md')
            const plugin = createPlugin([vm], { intervalMinutes: 5 })

            await plugin.onload()

            // No active editor and no active file (e.g. focus moved to the sidebar).
            const leafChange = registeredEvents.find((e) => e.type === 'active-leaf-change')
            leafChange!.callback(null)

            expect(vm.updateForFile).not.toHaveBeenCalled()
        })

        test('does not switch file while focus is inside the Time Machine view (slider)', async () => {
            const vm = createMockView('notes/day-1.md')
            const plugin = createPlugin([vm], { intervalMinutes: 5 })

            await plugin.onload()

            // A different tab's file would resolve as "active"...
            ;(plugin as PluginInternals).app.workspace.activeEditor = {
                file: { path: 'notes/other-tab.md', name: 'other-tab.md' }
            }

            // ...but focus is on an element inside the Time Machine view (its slider).
            const sliderEl = {}
            vm.view['containerEl'] = { contains: (el: unknown) => el === sliderEl }
            ;(globalThis as Record<string, unknown>)['activeDocument'] = {
                activeElement: sliderEl
            }

            const leafChange = registeredEvents.find((e) => e.type === 'active-leaf-change')
            leafChange!.callback(null)

            expect(vm.updateForFile).not.toHaveBeenCalled()
        })

        test('does not switch file when the Time Machine view becomes the active leaf', async () => {
            const vm = createMockView('notes/day-1.md')
            const plugin = createPlugin([vm], { intervalMinutes: 5 })

            await plugin.onload()
            ;(plugin as PluginInternals).app.workspace.activeEditor = {
                file: { path: 'notes/other-tab.md', name: 'other-tab.md' }
            }

            const leafChange = registeredEvents.find((e) => e.type === 'active-leaf-change')
            // The newly active leaf is the Time Machine view itself.
            leafChange!.callback({ view: vm.view })

            expect(vm.updateForFile).not.toHaveBeenCalled()
        })

        test('prefers activeEditor.file over getActiveFile', async () => {
            const vm = createMockView('notes/leaf-file.md')
            const plugin = createPlugin([vm], { intervalMinutes: 5 })

            await plugin.onload()

            const internals = plugin as PluginInternals
            internals.app.workspace.getActiveFile = () => ({
                path: 'notes/leaf-file.md',
                name: 'leaf-file.md'
            })
            const cursorFile = { path: 'notes/cursor-file.md', name: 'cursor-file.md' }
            internals.app.workspace.activeEditor = { file: cursorFile }

            const leafChange = registeredEvents.find((e) => e.type === 'active-leaf-change')
            leafChange!.callback(null)

            expect(vm.updateForFile).toHaveBeenCalledWith(cursorFile)
        })
    })
})
