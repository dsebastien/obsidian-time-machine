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

    const leaves = viewMocks.map((vm) => ({
        view: vm.view
    }))

    const plugin = Object.create(TimeMachinePlugin.prototype) as TimeMachinePlugin
    const p: PluginInternals = plugin

    p.app = {
        workspace: {
            on: (_event: string, _cb: unknown) => ({ type: _event, callback: _cb }),
            getLeavesOfType: (_type: string) => leaves,
            getActiveFile: () => null,
            getRightLeaf: () => null
        },
        vault: {
            on: (_event: string, _cb: unknown) => ({ type: _event, callback: _cb })
        },
        internalPlugins: {
            getEnabledPluginById: (_id: string) =>
                fileRecoveryOptions ? { options: fileRecoveryOptions, db: {} } : null
        }
    }

    p.registerEvent = mock((eventRef: { type: string; callback: (...args: unknown[]) => void }) => {
        registeredEvents.push(eventRef)
    })

    p.registerInterval = mock((intervalId: number) => {
        registeredIntervals.push(intervalId)
    })

    p.registerView = mock(() => {})
    p.addCommand = mock(() => {})
    p.addSettingTab = mock(() => {})
    p.loadData = mock(async () => null)
    p.manifest = { id: 'obsidian-time-machine', name: 'Time Machine' }

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
    })

    afterEach(() => {
        globalThis.window = originalWindow
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
})
