import { describe, expect, test } from 'bun:test'
import { FileRecoveryService } from './file-recovery.service'
import type { App } from 'obsidian'

function createMockApp(
    fileRecoveryPlugin: { options?: { intervalMinutes?: number } } | null = null
): App {
    return {
        internalPlugins: {
            getEnabledPluginById: (_id: string) => fileRecoveryPlugin
        }
    } as unknown as App
}

describe('FileRecoveryService', () => {
    describe('getSnapshotIntervalMs', () => {
        test('returns the configured interval in milliseconds', () => {
            const app = createMockApp({ options: { intervalMinutes: 10 } })
            expect(FileRecoveryService.getSnapshotIntervalMs(app)).toBe(10 * 60 * 1000)
        })

        test('returns default 5 minutes when plugin is unavailable', () => {
            const app = createMockApp(null)
            expect(FileRecoveryService.getSnapshotIntervalMs(app)).toBe(5 * 60 * 1000)
        })

        test('handles interval of 1 minute', () => {
            const app = createMockApp({ options: { intervalMinutes: 1 } })
            expect(FileRecoveryService.getSnapshotIntervalMs(app)).toBe(60 * 1000)
        })
    })

    describe('isAvailable', () => {
        test('returns true when file-recovery plugin is enabled', () => {
            const app = createMockApp({ options: { intervalMinutes: 5 } })
            expect(FileRecoveryService.isAvailable(app)).toBe(true)
        })

        test('returns false when file-recovery plugin is not available', () => {
            const app = createMockApp(null)
            expect(FileRecoveryService.isAvailable(app)).toBe(false)
        })
    })
})
