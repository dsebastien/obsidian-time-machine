import { describe, expect, test, spyOn, afterEach } from 'bun:test'
import type { App } from 'obsidian'
import { SnapshotService } from './snapshot.service'
import { FileRecoveryService } from './file-recovery.service'
import { GitService } from './git.service'
import type { PluginSettings } from '../types/plugin-settings.intf'
import type { FileRecoveryBackup } from '../types/backup.intf'

function createMockApp(): App {
    return {
        vault: {
            adapter: {}
        },
        internalPlugins: {
            getEnabledPluginById: () => ({
                db: {},
                options: { intervalMinutes: 5 }
            })
        }
    } as unknown as App
}

function defaultSettings(overrides?: Partial<PluginSettings>): PluginSettings {
    return {
        gitIntegrationEnabled: true,
        gitMaxCommits: 50,
        ...overrides
    }
}

// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
const spies: (ReturnType<typeof spyOn> | null)[] = []

afterEach(() => {
    for (const spy of spies) {
        spy?.mockRestore()
    }
    spies.length = 0
})

describe('SnapshotService', () => {
    describe('getSnapshots', () => {
        test('returns file-recovery snapshots when git is disabled', async () => {
            const app = createMockApp()
            const backups: FileRecoveryBackup[] = [
                { path: 'test.md', ts: 2000, data: 'v2' },
                { path: 'test.md', ts: 1000, data: 'v1' }
            ]

            spies.push(spyOn(FileRecoveryService, 'getBackups').mockResolvedValue(backups))

            const settings = defaultSettings({ gitIntegrationEnabled: false })
            const snapshots = await SnapshotService.getSnapshots(app, 'test.md', settings)

            expect(snapshots).toHaveLength(2)
            expect(snapshots[0]!.source).toBe('file-recovery')
            expect(snapshots[0]!.ts).toBe(2000)
        })

        test('returns empty when both sources are empty', async () => {
            const app = createMockApp()

            spies.push(spyOn(FileRecoveryService, 'getBackups').mockResolvedValue([]))
            spies.push(spyOn(GitService, 'isAvailable').mockResolvedValue(false))

            const settings = defaultSettings()
            const snapshots = await SnapshotService.getSnapshots(app, 'test.md', settings)

            expect(snapshots).toHaveLength(0)
        })

        test('merges file-recovery and git snapshots sorted by timestamp', async () => {
            const app = createMockApp()
            const backups: FileRecoveryBackup[] = [{ path: 'test.md', ts: 3000, data: 'fr-v3' }]

            spies.push(spyOn(FileRecoveryService, 'getBackups').mockResolvedValue(backups))
            spies.push(spyOn(GitService, 'isAvailable').mockResolvedValue(true))
            spies.push(spyOn(GitService, 'isFileTracked').mockResolvedValue(true))
            spies.push(
                spyOn(GitService, 'getCommitsForFile').mockResolvedValue([
                    {
                        hash: 'abc123',
                        shortHash: 'abc1234',
                        authorName: 'Alice',
                        authorDateUnix: 4,
                        subject: 'newest commit'
                    },
                    {
                        hash: 'def456',
                        shortHash: 'def4567',
                        authorName: 'Bob',
                        authorDateUnix: 1,
                        subject: 'oldest commit'
                    }
                ])
            )
            spies.push(
                spyOn(GitService, 'getFileAtCommit').mockImplementation(
                    async (_app, hash: string) => {
                        if (hash === 'abc123') return 'git-newest'
                        if (hash === 'def456') return 'git-oldest'
                        return null
                    }
                )
            )

            const settings = defaultSettings()
            const snapshots = await SnapshotService.getSnapshots(app, 'test.md', settings)

            expect(snapshots).toHaveLength(3)
            // Newest first: git@4s (4000ms), fr@3000ms, git@1s (1000ms)
            expect(snapshots[0]!.source).toBe('git')
            expect(snapshots[0]!.ts).toBe(4000)
            expect(snapshots[1]!.source).toBe('file-recovery')
            expect(snapshots[1]!.ts).toBe(3000)
            expect(snapshots[2]!.source).toBe('git')
            expect(snapshots[2]!.ts).toBe(1000)
        })

        test('skips git commits where getFileAtCommit returns null', async () => {
            const app = createMockApp()

            spies.push(spyOn(FileRecoveryService, 'getBackups').mockResolvedValue([]))
            spies.push(spyOn(GitService, 'isAvailable').mockResolvedValue(true))
            spies.push(spyOn(GitService, 'isFileTracked').mockResolvedValue(true))
            spies.push(
                spyOn(GitService, 'getCommitsForFile').mockResolvedValue([
                    {
                        hash: 'abc123',
                        shortHash: 'abc1234',
                        authorName: 'Alice',
                        authorDateUnix: 2,
                        subject: 'exists'
                    },
                    {
                        hash: 'def456',
                        shortHash: 'def4567',
                        authorName: 'Bob',
                        authorDateUnix: 1,
                        subject: 'renamed away'
                    }
                ])
            )
            spies.push(
                spyOn(GitService, 'getFileAtCommit').mockImplementation(
                    async (_app, hash: string) => {
                        if (hash === 'abc123') return 'content'
                        return null // def456 fails (file renamed)
                    }
                )
            )

            const settings = defaultSettings()
            const snapshots = await SnapshotService.getSnapshots(app, 'test.md', settings)

            expect(snapshots).toHaveLength(1)
            expect(snapshots[0]!.data).toBe('content')
        })

        test('handles file-recovery error gracefully', async () => {
            const app = createMockApp()

            spies.push(
                spyOn(FileRecoveryService, 'getBackups').mockRejectedValue(new Error('DB error'))
            )
            spies.push(spyOn(GitService, 'isAvailable').mockResolvedValue(false))

            const settings = defaultSettings()
            const snapshots = await SnapshotService.getSnapshots(app, 'test.md', settings)

            expect(snapshots).toHaveLength(0)
        })

        test('handles git error gracefully', async () => {
            const app = createMockApp()

            spies.push(
                spyOn(FileRecoveryService, 'getBackups').mockResolvedValue([
                    { path: 'test.md', ts: 1000, data: 'fr' }
                ])
            )
            spies.push(spyOn(GitService, 'isAvailable').mockRejectedValue(new Error('git broken')))

            const settings = defaultSettings()
            const snapshots = await SnapshotService.getSnapshots(app, 'test.md', settings)

            // Should still return file-recovery snapshots
            expect(snapshots).toHaveLength(1)
            expect(snapshots[0]!.source).toBe('file-recovery')
        })
    })
})
