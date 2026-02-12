export type SnapshotSource = 'file-recovery' | 'git'

export interface FileRecoveryMetadata {
    source: 'file-recovery'
}

export interface GitMetadata {
    source: 'git'
    commitHash: string
    shortHash: string
    commitMessage: string
    authorName: string
}

export type SnapshotMetadata = FileRecoveryMetadata | GitMetadata

export interface Snapshot {
    /** Unique identifier: "fr-{ts}" for file-recovery, "git-{hash}" for git */
    id: string
    /** Vault-relative file path */
    path: string
    /** Epoch milliseconds */
    ts: number
    /** Full file content at snapshot time */
    data: string
    /** Source of this snapshot */
    source: SnapshotSource
    /** Source-specific metadata */
    metadata: SnapshotMetadata
}
