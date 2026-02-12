import type { App } from 'obsidian'
import type { PluginSettings } from '../types/plugin-settings.intf'
import type { Snapshot } from '../types/snapshot.intf'
import { FileRecoveryService } from './file-recovery.service'
import { GitService } from './git.service'
import {
    deduplicateSnapshots,
    fileRecoveryToSnapshot,
    gitCommitToSnapshot,
    mergeSnapshots
} from '../domain/snapshot'
import { log } from '../../utils/log'

/**
 * Orchestrates fetching snapshots from all available sources
 * (file-recovery and git) and merges them chronologically.
 */
export class SnapshotService {
    /**
     * Fetches snapshots from all enabled sources for a given file path.
     * Returns merged snapshots sorted newest-first.
     */
    static async getSnapshots(
        app: App,
        filePath: string,
        settings: PluginSettings
    ): Promise<Snapshot[]> {
        const sources: Snapshot[][] = []

        // Source 1: File Recovery (always attempted)
        const frSnapshots = await this.getFileRecoverySnapshots(app, filePath)
        sources.push(frSnapshots)

        // Source 2: Git (if enabled and available)
        if (settings.gitIntegrationEnabled) {
            const gitSnapshots = await this.getGitSnapshots(app, filePath, settings.gitMaxCommits)
            sources.push(gitSnapshots)
        }

        const merged = mergeSnapshots(sources)
        return deduplicateSnapshots(merged)
    }

    private static async getFileRecoverySnapshots(app: App, filePath: string): Promise<Snapshot[]> {
        try {
            const backups = await FileRecoveryService.getBackups(app, filePath)
            return backups.map(fileRecoveryToSnapshot)
        } catch (error) {
            log('Failed to fetch file-recovery snapshots', 'error', error)
            return []
        }
    }

    private static async getGitSnapshots(
        app: App,
        filePath: string,
        maxCommits: number
    ): Promise<Snapshot[]> {
        try {
            const available = await GitService.isAvailable(app)
            if (!available) return []

            const tracked = await GitService.isFileTracked(app, filePath)
            if (!tracked) return []

            const commits = await GitService.getCommitsForFile(app, filePath, maxCommits)
            const snapshots: Snapshot[] = []

            for (const commit of commits) {
                const content = await GitService.getFileAtCommit(app, commit.hash, filePath)
                if (content === null) continue

                snapshots.push(
                    gitCommitToSnapshot(
                        filePath,
                        content,
                        commit.hash,
                        commit.shortHash,
                        commit.subject,
                        commit.authorName,
                        commit.authorDateUnix
                    )
                )
            }

            return snapshots
        } catch (error) {
            log('Failed to fetch git snapshots', 'error', error)
            return []
        }
    }
}
