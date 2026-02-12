# Domain Model

## Snapshot (unified)

- `id: string` — unique identifier: `"fr-{ts}"` for file-recovery, `"git-{hash}"` for git
- `path: string` — vault-relative file path
- `ts: number` — timestamp (epoch ms)
- `data: string` — full file content at snapshot time
- `source: SnapshotSource` — `'file-recovery'` or `'git'`
- `metadata: SnapshotMetadata` — source-specific metadata

## FileRecoveryMetadata

- `source: 'file-recovery'`

## GitMetadata

- `source: 'git'`
- `commitHash: string` — full commit hash
- `shortHash: string` — first 7 chars
- `commitMessage: string` — first line of commit message
- `authorName: string`

## FileRecoveryBackup (internal)

- `path: string` — vault-relative file path
- `ts: number` — timestamp (epoch ms)
- `data: string` — full file content at snapshot time

## GitCommitInfo (internal)

- `hash: string` — full commit hash
- `shortHash: string` — abbreviated hash
- `authorName: string`
- `authorDateUnix: number` — unix timestamp in seconds
- `subject: string` — first line of commit message

## DiffResult

- `oldHeader: string` — label for the old version
- `newHeader: string` — label for the new version
- `hunks: DiffHunk[]` — list of change hunks

## DiffHunk

- `oldStart: number` — starting line in old version
- `oldLines: number` — count of lines in old version
- `newStart: number` — starting line in new version
- `newLines: number` — count of lines in new version
- `lines: string[]` — diff lines prefixed with `+`, `-`, or ` ` (context)

## PluginSettings

- `gitIntegrationEnabled: boolean` — whether git commits are shown (default: true)
- `gitMaxCommits: number` — max commits per file (default: 50)
