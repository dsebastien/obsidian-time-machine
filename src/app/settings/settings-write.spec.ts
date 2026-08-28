import { describe, expect, test, mock } from 'bun:test'
import { TimeMachinePlugin } from '../plugin'
import { TimeMachineSettingTab } from './settings-tab'
import { DEFAULT_SETTINGS } from '../types/plugin-settings.intf'
import type { PluginSettings } from '../types/plugin-settings.intf'

/**
 * Behavioral coverage for the settings write path.
 *
 * `settings-guard.spec.ts` only scans source text. These tests exercise the
 * three properties that actually cost bugs elsewhere in the plugin collection
 * and that no UI test can reach: writes are serialized, memory is committed
 * only after persistence succeeds, and a rejected value never reaches the
 * store.
 */

/**
 * Awaited rejection assertion.
 *
 * `expect(p).rejects.toThrow()` types as void here, so awaiting it trips
 * `await-thenable` while not awaiting it lets a passing-by-accident test
 * through. Catching the error directly is both typed and actually awaited.
 */
async function expectRejection(promise: Promise<unknown>, contains: string): Promise<void> {
    let caught: unknown
    await promise.catch((error: unknown) => {
        caught = error
    })
    expect(caught).toBeInstanceOf(Error)
    expect((caught as Error).message).toContain(contains)
}

interface Harness {
    plugin: TimeMachinePlugin
    tab: TimeMachineSettingTab
    saveData: ReturnType<typeof mock>
    syncPastViewRibbon: ReturnType<typeof mock>
    refreshAllViews: ReturnType<typeof mock>
    /** Every payload handed to saveData, in call order. */
    writes: PluginSettings[]
}

function createHarness(options?: { saveData?: (data: PluginSettings) => Promise<void> }): Harness {
    const writes: PluginSettings[] = []
    const saveData = mock(async (data: PluginSettings) => {
        writes.push(structuredClone(data))
        if (options?.saveData) {
            await options.saveData(data)
        }
    })

    const plugin = Object.create(TimeMachinePlugin.prototype) as TimeMachinePlugin
    const internals = plugin as unknown as Record<string, unknown>
    internals['settings'] = { ...DEFAULT_SETTINGS }
    internals['settingsWriteChain'] = Promise.resolve()
    internals['saveData'] = saveData
    const syncPastViewRibbon = mock(() => {})
    const refreshAllViews = mock(() => {})
    internals['syncPastViewRibbon'] = syncPastViewRibbon
    internals['refreshAllViews'] = refreshAllViews
    internals['getHistoryViews'] = () => []

    const tab = Object.create(TimeMachineSettingTab.prototype) as TimeMachineSettingTab
    ;(tab as unknown as Record<string, unknown>)['plugin'] = plugin

    return { plugin, tab, saveData, syncPastViewRibbon, refreshAllViews, writes }
}

describe('updateSettings', () => {
    test('commits to memory only after the write is persisted', async () => {
        let release = (): void => {}
        const gate = new Promise<void>((resolve) => {
            release = resolve
        })
        const { plugin, saveData } = createHarness({ saveData: () => gate })

        const pending = plugin.updateSettings((draft) => {
            draft.gitMaxCommits = 123
        })

        // Let the queued write actually start and reach its save await. A bare
        // synchronous assertion here would pass even with the commit ordering
        // reversed, because the write chain defers the work to a microtask.
        await Promise.resolve()
        await Promise.resolve()
        expect(saveData).toHaveBeenCalledTimes(1)

        // Mid-flight: the value is on its way to disk but must not be visible
        // yet, or a control reading it would show a value that is not stored.
        expect(plugin.settings.gitMaxCommits).toBe(DEFAULT_SETTINGS.gitMaxCommits)
        release()
        await pending
        expect(plugin.settings.gitMaxCommits).toBe(123)
    })

    test('leaves memory untouched when persistence fails', async () => {
        const { plugin } = createHarness({
            saveData: () => Promise.reject(new Error('disk full'))
        })

        await expectRejection(
            plugin.updateSettings((draft) => {
                draft.gitMaxCommits = 99
            }),
            'disk full'
        )

        // The control rolls back to getControlValue's answer, so that answer
        // has to still be the on-disk truth.
        expect(plugin.settings.gitMaxCommits).toBe(DEFAULT_SETTINGS.gitMaxCommits)
    })

    test('overlapping writes do not drop each other', async () => {
        // Both calls are made before either save resolves. Without the write
        // chain both would `produce` from the same base and the second commit
        // would silently discard the first edit.
        let releaseFirst = (): void => {}
        const first = new Promise<void>((resolve) => {
            releaseFirst = resolve
        })
        let call = 0
        const { plugin } = createHarness({
            saveData: () => {
                call += 1
                return call === 1 ? first : Promise.resolve()
            }
        })

        const a = plugin.updateSettings((draft) => {
            draft.gitMaxCommits = 10
        })
        const b = plugin.updateSettings((draft) => {
            draft.pastViewExecuteBlocks = true
        })

        releaseFirst()
        await Promise.all([a, b])

        expect(plugin.settings.gitMaxCommits).toBe(10)
        expect(plugin.settings.pastViewExecuteBlocks).toBe(true)
    })

    test('a failed write does not stall the ones queued behind it', async () => {
        let call = 0
        const { plugin } = createHarness({
            saveData: () => {
                call += 1
                return call === 1 ? Promise.reject(new Error('nope')) : Promise.resolve()
            }
        })

        const failing = plugin.updateSettings((draft) => {
            draft.gitMaxCommits = 42
        })
        const following = plugin.updateSettings((draft) => {
            draft.pastViewEnabled = false
        })

        await expectRejection(failing, 'nope')
        await following
        expect(plugin.settings.gitMaxCommits).toBe(DEFAULT_SETTINGS.gitMaxCommits)
        expect(plugin.settings.pastViewEnabled).toBe(false)
    })
})

describe('setControlValue', () => {
    test('rejects a wrongly typed value without writing', async () => {
        const { tab, plugin, saveData } = createHarness()

        await expectRejection(tab.setControlValue('pastViewEnabled', 'yes'), 'boolean')
        expect(saveData).not.toHaveBeenCalled()
        expect(plugin.settings.pastViewEnabled).toBe(DEFAULT_SETTINGS.pastViewEnabled)
    })

    test('rejects an out-of-range slider value without writing', async () => {
        const { tab, plugin, saveData } = createHarness()

        await expectRejection(tab.setControlValue('gitMaxCommits', 0), 'between 1 and 200')
        await expectRejection(tab.setControlValue('gitMaxCommits', 201), 'between 1 and 200')
        await expectRejection(tab.setControlValue('gitMaxCommits', 1.5), 'whole number')
        expect(saveData).not.toHaveBeenCalled()
        expect(plugin.settings.gitMaxCommits).toBe(DEFAULT_SETTINGS.gitMaxCommits)
    })

    test('rejects an unknown key', async () => {
        const { tab, saveData } = createHarness()

        await expectRejection(tab.setControlValue('nope', true), 'known field')
        expect(saveData).not.toHaveBeenCalled()
    })

    test('runs the ribbon sync only after the write lands', async () => {
        let release = (): void => {}
        const gate = new Promise<void>((resolve) => {
            release = resolve
        })
        const { tab, syncPastViewRibbon } = createHarness({ saveData: () => gate })

        const pending = tab.setControlValue('pastViewEnabled', false)
        expect(syncPastViewRibbon).not.toHaveBeenCalled()
        release()
        await pending
        expect(syncPastViewRibbon).toHaveBeenCalledTimes(1)
    })

    test('does not refresh views when the write fails', async () => {
        const { tab, refreshAllViews } = createHarness({
            saveData: () => Promise.reject(new Error('disk full'))
        })

        await expectRejection(tab.setControlValue('pastViewExecuteBlocks', true), 'disk full')
        // Unloading code in open views on the strength of a value that was
        // never stored would leave the views and the settings disagreeing.
        expect(refreshAllViews).not.toHaveBeenCalled()
    })

    test('persists every declared control', async () => {
        const { tab, plugin, writes } = createHarness()

        await tab.setControlValue('pastViewEnabled', false)
        await tab.setControlValue('pastViewDefaultShowDiff', true)
        await tab.setControlValue('pastViewExecuteBlocks', true)
        await tab.setControlValue('gitIntegrationEnabled', false)
        await tab.setControlValue('gitMaxCommits', 200)

        expect(writes).toHaveLength(5)
        expect(plugin.settings).toMatchObject({
            pastViewEnabled: false,
            pastViewDefaultShowDiff: true,
            pastViewExecuteBlocks: true,
            gitIntegrationEnabled: false,
            gitMaxCommits: 200
        })
    })

    test('getControlValue answers for every declared control key', () => {
        const { tab, plugin } = createHarness()

        for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof PluginSettings)[]) {
            if (key === 'diffComparisonMode') {
                // Not exposed in the pane: it is driven by the in-panel toggle.
                continue
            }
            expect(tab.getControlValue(key)).toBe(plugin.settings[key])
        }
        expect(tab.getControlValue('nope')).toBeUndefined()
    })
})
