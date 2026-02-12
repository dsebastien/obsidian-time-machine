import type { FileRecoveryBackup } from '../types/backup.intf'
import type { GitMetadata, Snapshot } from '../types/snapshot.intf'
import { formatBackupDate } from './backup'

/**
 * Converts a FileRecoveryBackup to a unified Snapshot.
 */
export function fileRecoveryToSnapshot(backup: FileRecoveryBackup): Snapshot {
    return {
        id: `fr-${backup.ts}`,
        path: backup.path,
        ts: backup.ts,
        data: backup.data,
        source: 'file-recovery',
        metadata: { source: 'file-recovery' }
    }
}

/**
 * Creates a git Snapshot from commit data.
 */
export function gitCommitToSnapshot(
    path: string,
    data: string,
    commitHash: string,
    shortHash: string,
    commitMessage: string,
    authorName: string,
    tsSeconds: number
): Snapshot {
    return {
        id: `git-${commitHash}`,
        path,
        ts: tsSeconds * 1000,
        data,
        source: 'git',
        metadata: {
            source: 'git',
            commitHash,
            shortHash,
            commitMessage,
            authorName
        }
    }
}

/**
 * Merges multiple snapshot arrays into one, sorted newest-first.
 */
export function mergeSnapshots(sources: Snapshot[][]): Snapshot[] {
    const all = sources.flat()
    return sortSnapshotsByDate(all)
}

/**
 * Sorts snapshots descending by timestamp (newest first).
 */
export function sortSnapshotsByDate(snapshots: Snapshot[]): Snapshot[] {
    return [...snapshots].sort((a, b) => b.ts - a.ts)
}

/**
 * Deduplicates snapshots by content, keeping only the most recent one
 * for each unique `data` value. Assumes input is sorted newest-first.
 */
export function deduplicateSnapshots(snapshots: Snapshot[]): Snapshot[] {
    const seen = new Set<string>()
    return snapshots.filter((snapshot) => {
        if (seen.has(snapshot.data)) return false
        seen.add(snapshot.data)
        return true
    })
}

/**
 * Formats a human-readable label for a snapshot.
 * Git: "a1b2c3d: Fix heading"
 * File recovery: "File recovery snapshot"
 */
export function formatSnapshotLabel(snapshot: Snapshot): string {
    if (snapshot.source === 'git') {
        const meta = snapshot.metadata as GitMetadata
        return `${meta.shortHash}: ${meta.commitMessage}`
    }
    return `Snapshot (${formatBackupDate(snapshot.ts)})`
}
