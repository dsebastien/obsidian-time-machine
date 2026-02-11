import type { App } from 'obsidian'
import type { FileRecoveryBackup } from '../types/backup.intf'
import { log } from '../../utils/log'

const DEFAULT_SNAPSHOT_INTERVAL_MINUTES = 5

export class FileRecoveryService {
    static isAvailable(app: App): boolean {
        return app.internalPlugins.getEnabledPluginById('file-recovery') !== null
    }

    /**
     * Returns the file-recovery snapshot interval in milliseconds.
     * Falls back to a default if the plugin is unavailable.
     */
    static getSnapshotIntervalMs(app: App): number {
        const plugin = app.internalPlugins.getEnabledPluginById('file-recovery')
        const minutes = plugin?.options.intervalMinutes ?? DEFAULT_SNAPSHOT_INTERVAL_MINUTES
        return minutes * 60 * 1000
    }

    static async getBackups(app: App, filePath: string): Promise<FileRecoveryBackup[]> {
        const plugin = app.internalPlugins.getEnabledPluginById('file-recovery')
        if (!plugin) {
            log('File Recovery plugin is not available', 'warn')
            return []
        }

        try {
            // Obsidian's file-recovery db wrapper returns Promises (not raw IDBRequests)
            const tx = plugin.db.transaction('backups', 'readonly')
            const store = tx.objectStore('backups')

            let backups: FileRecoveryBackup[]

            // Try to use the path index if it exists
            if (store.indexNames.contains('path')) {
                const index = store.index('path')
                backups = (await index.getAll(filePath)) as FileRecoveryBackup[]
            } else {
                // Fall back to getting all backups and filtering
                const allBackups = (await store.getAll()) as FileRecoveryBackup[]
                backups = allBackups.filter((b) => b.path === filePath)
            }

            return backups.sort((a, b) => b.ts - a.ts)
        } catch (error) {
            log('Failed to fetch backups from IndexedDB', 'error', error)
            return []
        }
    }
}
